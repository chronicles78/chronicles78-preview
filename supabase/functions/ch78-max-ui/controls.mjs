export const SITE_URL='https://chronicles78.github.io/chronicles78-preview/';
export const COMMANDS=[
 {name:'ask',description:'Задать вопрос по архиву: /ask ваш вопрос'},
 {name:'find',description:'Найти сообщения: /find ключевые слова'},
 {name:'help',description:'Как пользоваться Хранителем'},
];
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
export function citedSources(job){
 const data=job?.result;
 if(!Array.isArray(data?.sources))return [];
 return data.sources.filter(s=>/^S[1-8]$/.test(s?.ref)&&typeof s.text==='string'&&
  (job.action==='search'||(data.found===true&&Array.isArray(data.citations)&&data.citations.includes(s.ref)))).slice(0,8);
}
export function keyboard(job,sourceLinks=false){
 if(!uuid(job?.id))throw Error('invalid_job');
 const sources=citedSources(job),buttons=[];
 if(sourceLinks){if(sources.length>1){for(let i=0;i<sources.length;i+=4)buttons.push(sources.slice(i,i+4).map(s=>({type:'callback',text:'['+s.ref+']',payload:'ch78:source:'+job.id+':'+s.ref})));}}
 else if(sources.length)buttons.push([{type:'callback',text:'Источники',payload:'ch78:source:'+job.id+':'+sources[0].ref}]);
 return buttons.length?[{type:'inline_keyboard',payload:{buttons}}]:[];
}
const escape=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function clip(x,n){let out='';for(const c of String(x??'').replace(/[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'')){const e=escape(c);if(out.length+e.length>n-1)return out+'…';out+=e;}return out;}
export function callbackText(action,job,ref){
 if(action==='help')return '<b>Как пользоваться Хранителем</b>\n\nНапишите «Хранитель, …» и свой вопрос или ответьте на моё сообщение с уточнением.\n\n<b>/ask</b> вопрос — ответ ИИ по архиву\n<b>/find</b> слова — поиск сообщений\n<b>/help</b> — подсказка\n\nВопрос — до 300 символов. Если сведений недостаточно, скажу об этом. Вложения пока не читаю.';
 if(action==='examples')return '<b>Примеры вопросов</b>\n\nХранитель, какой певческий опыт был у Аллы?\n\nХранитель, что уточняли о доме, который называли Шанхаем?\n\n/find школьная дискотека\n\nЭто примеры формулировок. Ответ зависит от того, что есть в архиве.';
 const sources=citedSources(job),s=sources.find(s=>s.ref===ref);
 if(action!=='source'||!s||!Number.isSafeInteger(s.message_ts)||!Number.isFinite(new Date(s.message_ts).getTime()))throw Error('invalid_source');
 const date=new Date(s.message_ts).toLocaleString('ru-RU',{timeZone:'Europe/Samara'});
 return '<b>Источник ['+s.ref+'] · '+(sources.indexOf(s)+1)+' из '+sources.length+'</b>\n\n<b>'+clip(s.author||'Автор не указан',100)+'</b>\n'+escape(date)+' · время Самары\n\n<blockquote>'+clip(s.text,3000)+'</blockquote>\n\n<i>Текст сохранённого источника. При многоточии показана только часть сообщения.</i>';
}
