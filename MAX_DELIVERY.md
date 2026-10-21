# CH78-MAX-003 — подготовка ответов непосредственно в MAX

Статус: команды владельца, генерация и отправка активны. Оба расписания установлены. Базовый проект: fnwpkmjjdhflnqghnogj; GitHub хранит исходники,
Supabase выполняет код и хранит архив, задания и подготовленные ответы.

## Первый рабочий сценарий

В существующей группе владелец пишет `/ask Что известно о…` или `/find караоке`.
Бот обрабатывает только команды владельца (user_id 17770818) в согласованной
группе. Обычные сообщения продолжают поступать в архив. Ответы остальных ботов
и свои сообщения не создают заданий. Команда содержит от 1 до 300 символов.

Первую проверку провести с подготовкой ответа в закрытой очереди (generation-only). После приёмки
включить отправку и выполнить одну согласованную команду в группе. Расширение
круга участников и самостоятельные тематические публикации — отдельные этапы.

## Обработка и хранение

1. Приёмник проверяет секрет и группу, атомарно сохраняет сообщение и создаёт
   задание по новой команде. Уникальность `(chat_id, message_id, action)` защищает
   от повторной доставки MAX. До подтверждения транзакции HTTP 200 не возвращается.
2. Импорт старых сообщений не создаёт заданий: проверяется дата активации команд
   и максимальный возраст события. Текущий импорт и архив остаются совместимыми.
3. Задание хранится в закрытой RLS-таблице. Исполнитель по расписанию атомарно
   забирает одну запись с блокировкой `FOR UPDATE SKIP LOCKED` и временем аренды.
4. Исполнитель использует общую логику поиска/ответа из assistant. Ответ ссылается
   на реальные сообщения. Готовый текст и источники сохраняются до попытки отправки.
5. Отправитель делает отдельный POST `/messages?chat_id=…`, связанный с исходной
   командой через `link`. При подтверждённом успехе сохраняется ID сообщения MAX.

Статусы: queued → generating → ready → sending → sent. Ошибка модели даёт failed;
неопределённый итог вызова модели — generation_unknown; неопределённый итог отправки
— delivery_unknown. Такие состояния видны владельцу для отдельного решения.
Восстановление после перезапуска проверяется на сохранённых заданиях.

## Почему два отдельных этапа

MAX требует HTTP 200 от Webhook за 30 секунд. Ожидать генерацию внутри приёмника
нельзя. `EdgeRuntime.waitUntil` ограничен временем жизни функции и сам по себе
не заменяет сохранённое задание. Supabase Cron вызывает ограниченный исполнитель;
для аутентификации вызова применяется отдельный секрет в Vault.

## Отправка и ограничения

- Приём, генерация и отправка имеют отдельные выключатели. Отправка изначально
  выключена; отключение отправки сохраняет архивирование и готовые ответы.
- Первоначально: одна команда владельца за 30 секунд и до 20 заданий в сутки
  на группу; лимит резервируется атомарно при постановке в очередь.
- `/find` не вызывает OpenAI. `/ask` — до двух вызовов на задание; сетевой сбой
  не запускает повторную платную генерацию автоматически.
- Повтор запроса к MAX после тайм-аута может создать дубль. Гарантию exactly-once
  нельзя заявлять без подтверждённого механизма идемпотентности провайдера.
  При неопределённой отправке требуется проверка, автоматического повтора нет.
- Текст с ответом, короткие выдержки и ссылки S1… ограничиваются одним сообщением
  до 4000 символов по актуальному API MAX. Сокращение явно помечается. Текст модели
  не используется как форматирование, URL назначения, команда или настройки.
- Токен MAX хранится только в Supabase Secrets, секрет Cron — в Vault. В GitHub,
  браузер, архивный текст и HTTP-ошибки они не попадают. Клиентские роли не имеют
  доступа к очереди, ответам или привилегированным RPC.

## Приёмка и откат

Обязательные тесты: повторная доставка, параллельные исполнители, чужая группа,
чужой пользователь, цикл ответа бота, старый импорт, лимиты, прерывание между
генерацией и отправкой, истечение аренды, отказ OpenAI, тайм-аут MAX, отсутствие
повтора при неопределённом исходе, отключение отправки и сохранение архива.

Перед правкой приёмника получить его актуальный серверный исходник: ранее он
обновился до v3 вне этой ветки. Старую v1 поверх него не развёртывать.
Проверить живую очередь без отправки, затем согласованную команду MAX и работу
без запущенной программы на Mac. Откат: выключить команды/отправку и расписание,
сохранив архив и задания. Не откатывать весь сайт или существующий приёмник.

Документация, проверенная 21.10.2026:

- https://dev.max.ru/docs-api/methods/POST/subscriptions
- https://dev.max.ru/docs-api/methods/POST/messages
- https://supabase.com/docs/guides/functions/background-tasks
- https://supabase.com/docs/guides/functions/schedule-functions

## Реализация и проверка — 21.10.2026

- Миграция 20261021183218_ch78_max_jobs.sql применена к существующему проекту
  как remote 20261021184024. Таблицы config/jobs, AFTER INSERT trigger и RPC
  SECURITY INVOKER. Публичного доступа и клиентских политик нет намеренно.
- Приёмник MAX v3 не заменялся; существующая атомарная вставка запускает trigger.
  Архив сохраняет команды и ответы бота, поиск исключает их из доказательных
  источников, чтобы бот не ссылался на собственные реплики или формулировку вопроса.
- Новый ch78-max-worker v1 ACTIVE. Собственный секрет, потоковые ограничения,
  проверка группы/аренды/флага, отдельные стадии generate/send, сохранение результата.
  Перед отправкой GET /me проверяет user_id 531401311 и is_bot=true.
- Генерация вызывает проверенный assistant внутри процесса с прежними OPENAI_API_KEY
  и STORY_ASSISTANT_MODEL, без нового платного сервиса. Для worker OpenAI timeout
  снижен до 35 секунд на вызов; максимум два вызова, без автоматических повторов.
  Бюджет генерации с RPC — до ~136 секунд, аренда 180 секунд, HTTP Cron 145 секунд.
- Отправка — один POST, plain text, notify=false, disable_link_preview=true, reply
  на исходную команду; подтверждённый mid сохраняется. Неопределённая отправка
  остаётся delivery_unknown. Отказ/неверный результат модели не публикуется.
- Дополнительный официальный Russian Trusted Root CA применяется только к точному
  HTTPS origin platform-api2.max.ru. SHA256 D26D2D0231B7C39F92CC738512BA54103519E4405D68B5BD703E9788CA8ECF31.
  Сертификат загружен с gu-st.ru по проверенному HTTPS; TLS не отключался.
- 35 Node тестов (9 intake, 15 assistant, 11 worker), 22 PostgreSQL/PGlite и
  9 Python клиента = 66. Deno check и diff check пройдены. PGlite параллельные
  запросы проходят через один экземпляр, независимые живые транзакции не проверены.
- Живая транзакционная проверка прошла: приём → одно задание → lease → ready;
  send заблокирован. Транзакция откачена, тестовых строк не осталось. Архив 396,
  очередь 0, все три флага false. Worker HTTP без настройки секрета — 503
  worker_configuration, без доступа к данным и эффектов. Новые advisor findings —
  только ожидаемые INFO RLS Enabled No Policy для серверных закрытых таблиц.
- Владелец ранее подтвердил 5/5 реальных вопросов OpenAI, включая три ответа
  по фактам и два отказа без доказательств. Доставка worker/Cron/MAX ещё не принята.

## Настройка владельцем (значения не передавать в переписке)

В Supabase Edge Functions Secrets существующего проекта добавить:

1. CH78_MAX_TOKEN — токен именно «Хранителя Хроник-78».
2. CH78_MAX_WORKER_SECRET — новый случайный секрет, 64 шестнадцатеричных символа,
   отличный от CH78_MAX_WEBHOOK_SECRET. Создать на Mac: openssl rand -hex 32.

В Supabase Vault сохранить тот же worker secret под именем ch78_max_worker_secret.
Не вставлять секреты в SQL-скрипты или GitHub. Connector не умеет устанавливать
Edge Secrets; шаг ввода выполняет владелец в интерфейсе Supabase.

После настройки применить ops/ch78-max-start-generation.sql. Он проверяет наличие
секрета в Vault без его вывода, включает pg_cron/pg_net и только генерацию раз
в минуту. Команды сработают только с момента активации, старый импорт не оживает.
Попросить владельца отправить /find или /ask и проверить готовую запись через
закрытый SQL. Отправка в MAX остаётся выключенной. Для неё отдельно подтвердить
публикацию ответов, проверить право бота писать в группе и применить
ops/ch78-max-enable-sending.sql. Первая генерация может ждать до минуты; первая
отправка — ещё до минуты. Код и архив работают без запущенной программы на Mac.

Остановка: установить commands_enabled/generation_enabled/sending_enabled=false
в ch78_max_bot_config, удалить только ch78-max-generate/ch78-max-send из Cron.
Уже начавшийся внешний HTTP-запрос отменить этим флагом невозможно. Не удалять
архив, задания и результаты.

## Generation-only activation — 2026-10-21

Owner completed secret setup. Vault existence/format check passed without exposing
values. Added pg_cron/pg_net support migration 20261021185435; activated only
ch78-max-generate, once per minute. Commands/generation enabled at 18:54:59 UTC;
sending disabled and no send schedule. Authenticated server-to-worker invocation
returned HTTP 200 idle=true. This verifies worker/Vault authentication and idle
execution, not model processing or MAX token validity. Awaiting a real owner
command and review of its persisted result before enabling delivery.

## Citation presentation fix — 2026-10-21

The first owner /ask job reached the worker/model but failed with uncited_answer.
The rejected draft was not persisted, so missing-inline vs missing-array cannot
be distinguished retroactively. Known, nonempty model-declared citation arrays
now render a source footer if inline markers are absent; grouped markers are
normalized. Unknown, undeclared, ambiguous or absent source IDs still fail.
No citation ID is invented, and this is presentation repair, not entailment proof.
No additional model calls or retries are introduced. The failed job is not requeued;
a new owner command is needed for live acceptance. Delivery remains disabled.

## Owner-approved live delivery — 2026-10-21

After review of the prepared answer, owner explicitly approved publishing that
answer and enabling replies to their /ask and /find commands in Редколлегия.
Applied ops/ch78-max-enable-sending.sql; commands/generation/sending all true.
Both named Cron jobs run every minute. The send worker confirmed the expected
MAX bot identity and returned a real message mid, saved with job state sent and
no error at 23:02:36 Samara. Actual end-to-end owner command delivery is verified.
No automatic replay of the earlier failed generation was performed. Scope remains
owner-only, with existing rate limits, no proactive publishing, notify=false.
The sent bot message had not appeared in incoming archive at verification time;
no job was created from it. Incoming self-echo delivery is therefore not proven.

## Published evidence-list correction — 2026-10-21

Owner identified an unrelated S4 excerpt beneath the singing-experience answer.
Persisted result confirmed citations=[S1]; renderReply incorrectly listed all
retrieval candidates as evidence. Answer-mode output now lists only cited source
IDs, preserving their original labels; absent/unresolved citations fail closed.
Search mode still lists lexical matches. No-evidence responses show no excerpts.
13 worker tests and Deno check passed, including unrelated-candidate exclusion,
nonconsecutive labels and unknown/missing citation rejection. This fixes display,
not semantic entailment or retrieval recall. Previously sent messages are not
automatically edited/replayed; no paid model request is introduced by the fix.

## Empty-queue dispatch optimization — 2026-10-21

Both Cron commands now gate worker HTTP requests on matching queued/ready jobs
and their stage flag. Empty queues cause database checks/maintenance only; no
worker invocation or model request. Expired generating/sending leases are parked
as unknown in SQL even with no new work, preserving recovery without replay.

Applied ops/ch78-max-refresh-dispatch.sql; enable flags and activation timestamp
are preserved. Bootstrap scripts use the same conditions. Six PGlite tests run
the actual scheduled SQL against a mock pg_net sink: empty, eligible, disabled,
expired, already active/terminal and another-group cases. Live Cron at 23:17
Samara succeeded for both stages with 0 rows and no new HTTP responses. Positive
dispatch was verified in a rolled-back live transaction; pg_net sends only after
commit, so no test HTTP/model/MAX message occurred. No residual fixture remains.

This removes the previous 86,400 idle worker invocations per 30 days; database
polling and incoming archive webhook usage remain. The one-minute response
scheduling interval is unchanged. Reapply the prior unconditional Cron commands
to roll back this optimization; do not reset job states or enable flags.

## Faster polling — 2026-10-21

Installed pg_cron 1.6.4 supports second-based intervals. Both queue schedules now
run every 10 seconds instead of every minute, with the existing SQL eligibility
gates and lease cleanup unchanged. Empty polling makes no Edge/OpenAI request.
Each of the two queue waits is typically at most 10 seconds when not backlogged;
model/network duration and backlog still affect end-to-end latency. Database
checks happen six times as often; this does not make database work free.

Added one daily ch78-max-log-retention job, deleting only completed Cron execution
logs older than seven days for the two named queue schedules. Archive messages,
job records/results and logs of unrelated schedules are not deleted. It runs at
00:00 UTC. Seven PGlite tests passed, including retention scope and active/null-end
log preservation. Native scheduling support was checked in Supabase docs:
https://supabase.com/docs/guides/cron/quickstart
