const API='https://fnwpkmjjdhflnqghnogj.supabase.co/functions/v1/ch78-max-miniapp';
const $=id=>document.getElementById(id),demo=new URL(location.href).searchParams.get('demo')==='1';
function requestId(){
 if(crypto.randomUUID)return crypto.randomUUID();
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
let tab='answer',access=false,ai=false,busy=false,pending=null;
const demoSources=[{ref:'S1',author:'Анна · вымышленный участник',message_ts:Date.UTC(2026,8,3,10),text:'Помните наш поход к Волге? На обратном пути пошёл дождь. Мы спрятались под сосной, а Саша достал из рюкзака термос. Чай делили на всех.'},{ref:'S2',author:'Саша · вымышленный участник',message_ts:Date.UTC(2026,8,3,11),text:'А в том походе мы ещё потеряли компас. Дорогу к остановке нам показал местный рыбак. Зато вернулись с целым пакетом шишек.'},{ref:'S3',author:'Вера · вымышленный участник',message_ts:Date.UTC(2026,8,4,10),text:'После уроков часто оставались во дворе школы. Сначала играли в мяч, потом шли провожать друг друга и делали большой круг по району.'}];
function status(text='',kind=''){$('status').textContent=text;$('status').className='status '+kind;}
function controls(){
 const locked=busy||Boolean(pending);$('question').disabled=!access||locked;$('mode').disabled=locked;$('submit').disabled=!access||locked||(tab==='answer'&&!ai);
 for(const name of ['answer','search','about'])$('tab-'+name).disabled=locked;
 for(const button of document.querySelectorAll('[data-question]'))button.disabled=!access||locked;
 $('check-result').disabled=busy;$('new-question').disabled=busy;
 $('question-form').setAttribute('aria-busy',String(busy));
}
function switchTab(next){
 if(busy||pending)return;tab=next;
 for(const name of ['answer','search','about'])$('tab-'+name).setAttribute('aria-pressed',String(name===tab));
 $('workspace').hidden=tab==='about';$('about').hidden=tab!=='about';$('results').hidden=true;$('welcome').hidden=tab==='about';status();
 $('form-title').textContent=tab==='search'?'Какие слова запомнились?':'О чём хотите вспомнить?';
 $('form-description').textContent=tab==='search'?'Найдём сообщения по словам. Без обращения к искусственному интеллекту.':'Хранитель соберёт ответ из сообщений и покажет, на что опирается.';
 $('question-label').textContent=tab==='search'?'Слова для поиска':'Ваш вопрос';
 $('question').placeholder=tab==='search'?'Например: поход':'Например: что рассказывали о школьных походах?';
 $('submit').replaceChildren(document.createTextNode(tab==='search'?'Найти в архиве':'Спросить Хранителя'));
 $('mode-wrap').hidden=tab!=='search';
 $('cost-note').textContent=tab==='search'?'Этот поиск не расходует лимит OpenAI.':demo?'В образце ответ показан на вымышленных историях.':ai?'Вопрос и найденные сообщения обрабатывает OpenAI.':'Ответы ИИ ещё не включены. Поиск по словам доступен.';
 controls();
}
function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function render(data,action){
 const root=$('results');root.replaceChildren();root.hidden=false;$('welcome').hidden=true;
 const heading=element('div','result-header');heading.append(element('h2','',action==='answer'?'Ответ Хранителя':'Найденные сообщения'),element('span','',demo?'Вымышленный пример':'По архиву группы'));root.append(heading);
 if(action==='answer'){
  const card=element('div','answer-card');card.append(element('p','',data.answer));root.append(card);
  root.append(element('p','result-note','Проверьте ответ по источникам. Даты сообщений — по Самаре.'));
 }else root.append(element('p','result-note',data.sources.length?'Совпадение слов не гарантирует ответа на вопрос.':'Подходящих сообщений не найдено. Попробуйте другие слова.'));
 if(data.sources.length){root.append(element('div','sources-label','Источники · '+data.sources.length));for(const source of data.sources){
  const details=element('details','source'),summary=element('summary'),title=element('span'),time=element('time','',new Date(source.message_ts).toLocaleString('ru-RU',{timeZone:'Europe/Samara',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}));
  time.dateTime=new Date(source.message_ts).toISOString();title.append(element('strong','',source.author),time);summary.append(element('span','ref',source.ref),title);details.append(summary,element('blockquote','',source.text));if(source.truncated)details.append(element('small','','Показан фрагмент сообщения.'));root.append(details);
 }}
 root.focus({preventScroll:true});root.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
}
function demoResult(action,q,mode){
 const question=q.toLocaleLowerCase('ru');
 if(action==='answer'){
  if(/поход|волг/.test(question))return {found:true,answer:'Вспоминали поход к Волге: дождь на обратном пути и чай из одного термоса на всех. [S1] Ещё рассказывали о потерянном компасе и рыбаке, который показал дорогу к остановке. [S2]',sources:demoSources.slice(0,2)};
  if(/урок|двор/.test(question))return {found:true,answer:'После уроков оставались во дворе школы, играли в мяч, а затем провожали друг друга, делая большой круг по району. [S3]',sources:demoSources.slice(2)};
  return {found:false,answer:'В найденных сообщениях нет достаточного ответа. Уточните вопрос или ключевые слова.',sources:[]};
 }
 const words=question.match(/[а-яёa-z0-9]+/g)??[];
 const sources=demoSources.filter(s=>mode==='literal'?s.text.toLowerCase().includes(question):words.length&&words.every(w=>s.text.toLowerCase().includes(w.length>5?w.slice(0,5):w)));
 return {found:sources.length>0,sources};
}
const errors={invalid_launch:'Откройте читальный зал через Хранителя в MAX.',launch_expired:'Время входа истекло. Закройте окно и откройте его заново через MAX.',not_member:'Архив доступен участникам нашей группы. Не удалось подтвердить ваше членство.',disabled:'Читальный зал ещё не подключён к архиву.',configuration:'Подключение ещё настраивается. Попробуйте позже.',ai_disabled:'Ответы ИИ пока выключены. Используйте поиск по словам.',origin_denied:'Откройте приложение по его официальной ссылке в MAX.',rate_limit:'Слишком быстро. Подождите немного перед следующим запросом.',daily_limit:'Сегодняшний лимит этого режима исчерпан. Можно вернуться завтра.',conflict:'Этот номер запроса уже занят. Начните новый вопрос.',answer_unavailable:'Не удалось подготовить проверенный ответ. Можно воспользоваться поиском по словам.',connection_unavailable:'Не удалось связаться с сервером или проверить доступ через MAX.',result_unknown:'Ответ мог быть подготовлен. Проверьте результат прежнего запроса — новый вызов ИИ не выполняется.'};
async function api(body){
 let r;try{r=await fetch(API,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(95000),headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,init_data:window.WebApp?.initData??''})});}catch{throw {code:'connection_unavailable',uncertain:true};}
 let d;try{d=await r.json()}catch{throw {code:'connection_unavailable',uncertain:true};}
 if(!r.ok)throw {code:d.error??'connection_unavailable',uncertain:['result_unknown','connection_unavailable'].includes(d.error)};return d;
}
async function submit(attempt){
 busy=true;controls();$('results').hidden=true;$('welcome').hidden=true;status(attempt.action==='recover'?'Проверяем сохранённый запрос…':attempt.action==='answer'?'Хранитель читает архив и готовит ответ…':'Ищем сообщения…','busy');
 try{
  const d=demo?{state:'done',result:demoResult(attempt.action,attempt.q,attempt.mode)}:await api(attempt);
  if(d.state==='none'){pending=null;$('recovery').hidden=true;$('welcome').hidden=tab==='about';status(attempt.request_id?'Сохранённый запрос не найден или срок хранения истёк. Можно начать новый вопрос.':'');}
  else if(d.state==='done'){pending=null;$('recovery').hidden=true;status(attempt.action==='recover'?'Восстановлен сохранённый результат. Новый запрос к ИИ не выполнялся.':'');render(d.result,d.action??attempt.action);}
  else if(d.state==='failed'){pending=null;$('recovery').hidden=true;status(errors[d.result?.error]??errors.answer_unavailable,'error');}
  else{pending={action:'recover',request_id:d.request_id??attempt.request_id};$('recovery').hidden=false;status(d.state==='processing'?'Запрос ещё обрабатывается. Через несколько секунд можно проверить результат.':'Не удалось подтвердить итог запроса. Автоматически ИИ повторно не вызываем.','error');}
 }catch(e){if(e.uncertain||attempt.action==='recover'){pending={action:'recover',...(attempt.request_id?{request_id:attempt.request_id}:{})};$('recovery').hidden=false;}status(errors[e.code]??errors.connection_unavailable,'error');}
 finally{busy=false;controls();}
}
$('question-form').addEventListener('submit',event=>{event.preventDefault();if(busy||pending||!access||!$('question').value.trim())return;submit({action:tab,q:$('question').value.trim(),mode:$('mode').value,request_id:requestId()});});
$('question').addEventListener('input',()=>{$('counter').textContent=$('question').value.length+' / 300';});
for(const name of ['answer','search','about'])$('tab-'+name).addEventListener('click',()=>switchTab(name));
for(const button of document.querySelectorAll('[data-question]'))button.addEventListener('click',()=>{if(!access||busy||pending)return;$('question').value=tab==='search'?(button.textContent.includes('поход')?'поход':'после уроков'):button.dataset.question;$('question').dispatchEvent(new Event('input'));$('question').focus();});
$('check-result').addEventListener('click',()=>{if(pending&&!busy)submit(pending)});
$('new-question').addEventListener('click',()=>{if(busy)return;pending=null;$('recovery').hidden=true;status('Можно задать новый вопрос. Это отдельный запрос; предыдущая попытка могла уже израсходовать лимит.');controls();});
async function start(){
 if(demo){$('demo-banner').hidden=false;document.querySelector('.brand').href='?demo=1';access=true;ai=true;$('archive-label').textContent='Образец · 3 вымышленных сообщения';switchTab('answer');return;}
 if(!window.WebApp){await new Promise(resolve=>{const script=document.createElement('script');script.src='https://st.max.ru/js/max-web-app.js';const timer=setTimeout(resolve,8000);script.onload=script.onerror=()=>{clearTimeout(timer);resolve();};document.head.append(script);});}
 if(!window.WebApp?.initData){$('archive-label').textContent='Закрытый архив участников';switchTab('about');status(errors.invalid_launch);return;}
 try{const d=await api({action:'status'});access=true;ai=d.ai_enabled;$('archive-label').textContent='Тестовый архив · '+d.messages+' сообщений';switchTab(ai?'answer':'search');await submit({action:'recover'});}
 catch(e){$('archive-label').textContent='Архив пока недоступен';switchTab('about');status(errors[e.code]??errors.connection_unavailable,'error');}
}
start();
