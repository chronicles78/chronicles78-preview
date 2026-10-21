#!/usr/bin/env python3
"""Owner-only client. No local archive and no persistent secret storage."""
import datetime as dt
import getpass
import json
from pathlib import Path
import re
import ssl
import urllib.request
import urllib.error

ENDPOINT='https://fnwpkmjjdhflnqghnogj.supabase.co/functions/v1/ch78-max-assistant'
class ClientError(Exception):pass
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k):raise ClientError('Перенаправление запрещено. Секрет не переслан.')
MESSAGES={'forbidden':'Секрет не принят. Нужен CH78_MAX_WEBHOOK_SECRET из Supabase.',
 'model_not_configured':'На сервере не настроен ключ OpenAI. Поиск без модели доступен.',
 'model_access_denied':'OpenAI отклонил серверный запрос: HTTP 403. Нужна проверка доступа провайдера.',
 'model_limit':'OpenAI сообщил об ограничении или недостаточном лимите. Автоматических повторов нет.',
 'model_key_rejected':'OpenAI отклонил ключ сервера: HTTP 401. Нужна проверка OPENAI_API_KEY в Supabase.',
 'model_not_found':'OpenAI не нашёл модель или не предоставил к ней доступ: HTTP 404.',
 'model_parameters':'OpenAI отклонил параметры запроса: HTTP 400. Пришлите строку диагностики ниже.',
 'model_unavailable':'OpenAI не выполнил запрос. Поиск без модели доступен.',
 'model_incomplete':'Модель не завершила ответ в заданном лимите. Результат не выдаётся за готовый.',
 'model_invalid':'Модель вернула неверный формат. Результат не выдан.',
 'invalid_citation':'Ссылки модели не прошли проверку. Ответ не выдан.',
 'uncited_answer':'В ответе нет согласованных ссылок на источники. Ответ не выдан.',
 'archive_unavailable':'Серверный поиск сейчас недоступен.',
 'server_configuration':'Не совпадает серверная конфигурация. Сообщите этот статус.',
 'invalid_request':'Введите запрос от 1 до 300 символов.'}
class Client:
    def __init__(self,secret):
        if not re.fullmatch(r'[A-Za-z0-9_-]{32,128}',secret):raise ClientError('Неверный формат секрета.')
        self.secret=secret
        roots=Path.home()/'Downloads'/'ch78-openai-ca.pem'
        context=ssl.create_default_context(cafile=str(roots)) if roots.is_file() else ssl.create_default_context()
        self.opener=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=context))
    def request(self,action,q,mode='forms'):
        if action not in ('search','answer') or not isinstance(q,str) or not 1<=len(q.strip())<=300:raise ClientError('Введите запрос от 1 до 300 символов.')
        payload=json.dumps({'action':action,'q':q.strip(),'mode':mode}).encode()
        req=urllib.request.Request(ENDPOINT,data=payload,headers={'Content-Type':'application/json','X-Max-Bot-Api-Secret':self.secret},method='POST')
        try:
            with self.opener.open(req,timeout=140) as response:raw=response.read(262145)
            if len(raw)>262144:raise ClientError('Слишком большой ответ сервера.')
            data=json.loads(raw)
            if not isinstance(data,dict) or not isinstance(data.get('sources'),list):raise ClientError('Неверный ответ сервера.')
            return data
        except urllib.error.HTTPError as e:
            try:
                error=json.loads(e.read(2048));code=error.get('error','unknown')
            except Exception:error={};code='unknown'
            # Only predefined error codes are displayed; upstream text may be private.
            message=MESSAGES.get(code,'Сервер вернул HTTP '+str(e.code)+'. Тело ошибки не выводится.')
            diagnostic=error.get('diagnostic')
            if isinstance(diagnostic,dict):
                status=diagnostic.get('http_status');provider=diagnostic.get('code');param=diagnostic.get('param')
                codes={'invalid_api_key','model_not_found','unsupported_parameter','unsupported_value','invalid_json_schema','insufficient_quota','rate_limit_exceeded','unsupported_country_region_territory','access_terminated','other'}
                params={'model','reasoning','reasoning.effort','max_output_tokens','text','text.format','text.format.schema','input','other'}
                if type(status) is int and 400<=status<=599 and provider in codes and param in params:
                    message+='\nДиагностика: HTTP '+str(status)+'; code='+provider+'; param='+param
            raise ClientError(message) from None
        except (urllib.error.URLError,TimeoutError,OSError):raise ClientError('Ошибка сети или тайм-аут. Запрос модели мог быть обработан; автоматически не повторяется.') from None
        except (ValueError,TypeError):raise ClientError('Неверный формат ответа сервера.') from None

def check(client):
    rows=client.request('search','ПРОВЕРКА-СЕРВЕР-78','literal')['sources']
    if not rows or not any('ПРОВЕРКА-СЕРВЕР-78' in s.get('text','') for s in rows):raise ClientError('Контрольное сообщение не найдено. Нужна проверка конфигурации группы.')
    empty=client.request('search','межзвёздный космолёт')['sources']
    print('ПРОВЕРКА ПОИСКА ПРОЙДЕНА: контрольное сообщение найдено.',flush=True)
    print('Посторонняя контрольная тема: '+str(len(empty))+' совпадений (само число не доказывает смысловую точность).',flush=True)

def display(data):
    if 'answer' in data:print('\nОТВЕТ:\n'+data['answer'])
    sources=data.get('sources',[])
    if not sources:print('Источников не найдено.');return
    print('\nИСТОЧНИКИ:')
    zone=dt.timezone(dt.timedelta(hours=4))
    for source in sources:
        date=dt.datetime.fromtimestamp(source['message_ts']/1000,zone).strftime('%d.%m.%Y %H:%M')
        print('\n['+source['ref']+'] '+date+' · '+source['author'])
        print(source['text'])
        if source.get('truncated'):print('(Источник сокращён сервером.)')
    if data.get('note'):print('\n'+data['note'])

# Fixed acceptance cases for this archive, checked against the live SQL RPC.
# They test source retrieval, references and expected evidence presence, not entailment.
ACCEPTANCE_CASES=(
    ('Бронирование караоке','Где и на какую дату забронировали караоке?','караоке',('Л.Толстого д. 97','08.09.26'),True),
    ('Опыт Аллы','Какой певческий опыт был у Аллы?','Алла',('хоровом ансамбле',),True),
    ('Уточнение Шанхая','Что уточнили о доме, который называли Шанхаем?','Шанхай',('на противоположной стороне',),True),
    ('Тест без воспоминаний','Что вспоминали о школьных дискотеках?','дискотека',(),False),
    ('Заведомо посторонняя тема','На каком межзвёздном космолёте класс летал к Сириусу?','межзвёздный космолёт',(),False),
)

def assess(data,markers,expected):
    sources=data.get('sources',[])
    source_text='\n'.join(s.get('text','') for s in sources).casefold()
    reasons=[]
    if type(data.get('found')) is not bool or data['found']!=expected:reasons.append('не совпал ожидаемый признак достаточности источников')
    if expected:
        if not all(m.casefold() in source_text for m in markers):reasons.append('контрольный источник не попал в выборку')
        refs={s.get('ref') for s in sources}
        cited=data.get('citations',[])
        inline=set(re.findall(r'\[(S\d+)\]',data.get('answer','')))
        if not cited or not set(cited)<=refs or inline!=set(cited):reasons.append('нарушены ссылки на источники')
    elif data.get('citations'):reasons.append('отказ содержит ссылки как у доказанного ответа')
    if not isinstance(data.get('answer'),str) or not data['answer'].strip():reasons.append('нет текста ответа')
    return reasons

def acceptance(client):
    print('\nПАКЕТНАЯ ПРОВЕРКА: 5 тем, до 10 вызовов OpenAI. Повторов нет.',flush=True)
    print('Проверяются выборка источников, ссылки и наличие/отсутствие ответа; смысловая точность отдельно требует оценки.',flush=True)
    failures=0
    for i,(name,question,lexical,markers,expected) in enumerate(ACCEPTANCE_CASES,1):
        print('\n['+str(i)+'/5] '+name,flush=True)
        try:
            found=client.request('search',lexical)
            texts='\n'.join(s.get('text','') for s in found['sources']).casefold()
            if expected and not all(m.casefold() in texts for m in markers):
                print('ПОИСК: контрольный источник не найден; платный запрос пропущен.');failures+=1;continue
            print('Поиск: '+str(len(found['sources']))+' источников. Проверяю ответ…',flush=True)
            data=client.request('answer',question)
        except ClientError as e:
            print('ПРОВЕРКА ПРЕРВАНА: '+str(e));return False
        reasons=assess(data,markers,expected)
        if reasons:failures+=1
        print(('НЕ ПРОЙДЕНО: '+'; '.join(reasons)) if reasons else 'Автоматические критерии пройдены.')
        print('Вопрос: '+question+'\nОтвет: '+data.get('answer',''))
        print('Источников: '+str(len(data.get('sources',[]))))
    print('\nПакет завершён. Сценариев: 5. Не прошли критерии: '+str(failures)+'.')
    print('Смысловая достоверность автоматически не доказана. В MAX ничего не опубликовано.')
    return failures==0

def main():
    print('Серверный Хранитель · проверка 1.2. Программа только показывает результаты — не публикует их в MAX.')
    print('Поиск не вызывает OpenAI. Режим ответа использует существующий OpenAI API и может тарифицироваться.')
    try:
        client=Client(getpass.getpass('CH78_MAX_WEBHOOK_SECRET (ввод скрыт): '));check(client)
        while True:
            mode=input('\n1 — поиск; 2 — ответ ИИ; 3 — пакетная проверка; Enter — выход: ').strip()
            if not mode:return 0
            if mode=='3':acceptance(client);continue
            if mode not in ('1','2'):print('Введите 1, 2 или 3.');continue
            q=input('Запрос: ').strip()
            if not q:continue
            print('Поиск…' if mode=='1' else 'Модель готовит ответ; это может занять до двух минут…',flush=True)
            try:display(client.request('search' if mode=='1' else 'answer',q))
            except ClientError as e:print(str(e))
    except ClientError as e:print(str(e));return 1
    except (KeyboardInterrupt,EOFError):print('\nВыход. Запрос модели мог завершиться на сервере; автоматически не повторяется.');return 0
    except Exception:print('Не удалось прочитать результат. Частные данные исключения не выводятся.');return 1
if __name__=='__main__':raise SystemExit(main())
