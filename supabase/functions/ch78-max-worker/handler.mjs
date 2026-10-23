import {keyboard} from '../ch78-max-ui/controls.mjs';
import {configureUI} from '../ch78-max-ui/configure.mjs';
import {createHandler as assistant} from '../ch78-max-assistant/handler.mjs';
const PROJECT='https://fnwpkmjjdhflnqghnogj.supabase.co';
const CHAT='-78143291213122';
const encoder=new TextEncoder();
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
const clean=x=>String(x??'').replace(/[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'');
const escape=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
// Budget escaped text, never cutting an HTML entity or a Unicode code point.
function escapedClip(value,budget){
 const pieces=Array.from(clean(value)).map(escape);
 if(pieces.reduce((n,p)=>n+p.length,0)<=budget)return pieces.join('');
 let out='';for(const piece of pieces){if(out.length+piece.length>budget-1)break;out+=piece;}
 return out+'…';
}
export function renderReply(data,action){
 if(!data||!Array.isArray(data.sources)||data.sources.length>8||!['answer','search','reaction'].includes(action))throw Error('invalid_result');
 let visibleSources=data.sources;
 const title=action==='reaction'?'К слову о воспоминаниях':action==='answer'?'Ответ по архиву':'Найдено в архиве';
 const lines=['<b>'+title+'</b>'];
 if(action!=='search'){
  if(typeof data.answer!=='string'||typeof data.found!=='boolean')throw Error('invalid_result');
  if(data.found){
   if(!Array.isArray(data.citations)||(action==='answer'&&!data.citations.length)||data.citations.some(ref=>
    typeof ref!=='string'||!/^S[1-8]$/.test(ref)||!data.sources.some(s=>s.ref===ref)))throw Error('invalid_citation');
   visibleSources=data.sources.filter(s=>data.citations.includes(s.ref));
  }else visibleSources=[];
  lines.push(escapedClip(data.answer,action==='reaction'?650:1800));
 }
 const footer='\n\n<i>'+(action==='reaction'?'Отклик Хранителя. Уточнения участников приветствуются.':action!=='search'?'По сообщениям архива. Детали могут требовать уточнения.':'Совпадение слов не гарантирует ответа на вопрос.')+' Даты сообщений — по Самаре.</i>';
 let text=lines.join('\n\n');
 if(visibleSources.length){
  const heading='\n\n<b>'+(action!=='search'?'Источники':'Сообщения')+'</b>';
  const blocks=visibleSources.map(source=>{
   if(!/^S[1-8]$/.test(source.ref)||typeof source.text!=='string'||!Number.isSafeInteger(source.message_ts)||!Number.isFinite(new Date(source.message_ts).getTime()))throw Error('invalid_source');
   const date=new Date(source.message_ts).toLocaleString('ru-RU',{timeZone:'Europe/Samara',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
   return {before:'\n\n<b>['+source.ref+'] '+escapedClip(source.author||'Автор не указан',80)+'</b> · '+escape(date)+'\n<blockquote>',after:'</blockquote>',source};
  });
  let remaining=4000-text.length-heading.length-footer.length-blocks.reduce((n,b)=>n+b.before.length+b.after.length,0);
  if(remaining<blocks.length)throw Error('reply_too_large');
  text+=heading;
  for(const [i,b] of blocks.entries()){
   const quote=escapedClip(b.source.text,Math.min(450,Math.floor(remaining/(blocks.length-i))));
   remaining-=quote.length;text+=b.before+quote+b.after;
  }
 }else if(action==='search')text+='\n\nПодходящих сообщений не найдено. Попробуйте другие слова.';
 text+=footer;
 if(text.length>4000)throw Error('reply_too_large');return text;
}
async function bodyJSON(response,max=262144,timeout=0){
 const reader=response.body?.getReader();if(!reader)throw Error('invalid_response');
 const chunks=[];let total=0,timer;
 const deadline=timeout?new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('body_timeout')),timeout)}):null;
 try{while(true){const {done,value}=await (deadline?Promise.race([reader.read(),deadline]):reader.read());if(done)break;total+=value.length;
  if(total>max)throw Error('response_too_large');chunks.push(value);}
  const all=new Uint8Array(total);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder().decode(all));
 }finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
}
export function createHandler({env,fetchImpl=fetch,assistantImpl=null}){
 const runAssistant=assistantImpl??assistant({env,fetchImpl:(url,opts)=>fetchImpl(url,
  url==='https://api.openai.com/v1/responses'?{...opts,signal:AbortSignal.any([...(opts?.signal?[opts.signal]:[]),AbortSignal.timeout(35000)])}:opts)});
 return async req=>{
  if(req.method!=='POST')return json(405,{error:'method_not_allowed'});
  const expected=env('CH78_MAX_WORKER_SECRET')??'',given=req.headers.get('X-CH78-Worker-Secret')??'';
  const key=env('SUPABASE_SERVICE_ROLE_KEY')??'';
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(expected)||!key||env('SUPABASE_URL')!==PROJECT||env('CH78_MAX_CHAT_ID')!==CHAT)return json(503,{error:'worker_configuration'});
  if(!given||given.length>256)return json(403,{error:'forbidden'});
  const hash=x=>crypto.subtle.digest('SHA-256',encoder.encode(x));
  const [a,b]=await Promise.all([hash(given),hash(expected)]);let diff=0;
  const aa=new Uint8Array(a),bb=new Uint8Array(b);for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];
  if(diff)return json(403,{error:'forbidden'});
  let stage;
  try{
   if(req.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error();
   // Stream/time bounds apply before any claim or paid/network effect.
   const b=await bodyJSON(req,8192,5000);
   if(!b||!['generate','send','configure_ui'].includes(b.stage))throw Error();stage=b.stage;
  }catch{return json(400,{error:'invalid_request'});}
  const rpc=async(name,body)=>{
   const r=await fetchImpl(PROJECT+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
    headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!r.ok){r.body?.cancel().catch(()=>{});throw Error('database_unavailable');}return bodyJSON(r);
  };
  if(['send','configure_ui'].includes(stage)&&!env('CH78_MAX_TOKEN'))return json(503,{error:'max_token_missing'});
  try{
   if(stage==='configure_ui')return json(200,await configureUI({env,fetchImpl}));
   const rows=await rpc('ch78_max_claim_job',{p_stage:stage});
   if(!Array.isArray(rows)||rows.length>1)throw Error('invalid_claim');
   if(!rows.length)return json(200,{ok:true,idle:true});
   const job=rows[0];
   if(!uuid(job.id)||!uuid(job.lease)||job.chat_id!==CHAT||typeof job.message_id!=='string'||!job.message_id.length||job.message_id.length>512||
    !['search','answer','reaction'].includes(job.action)||typeof job.question!=='string'||!job.question.trim()||job.question.length>300||
    (job.action==='reaction'&&typeof job.review_required!=='boolean')||
    job.state!==(stage==='generate'?'generating':'sending'))throw Error('invalid_claim');
   const finish=async(state,extra={})=>{
    const saved=await rpc('ch78_max_finish_job',{p_id:job.id,p_lease:job.lease,p_state:state,...extra});
    if(saved!==true)throw Error('lease_lost');
   };
   if(await rpc('ch78_max_job_gate',{p_id:job.id,p_lease:job.lease})!==true){
    await finish('failed',{p_error:'effect_disabled'});return json(200,{ok:true,disabled:true});
   }
   if(stage==='generate'){
    let data;
    const reaction=job.action==='reaction';
    const fail=async(code,usage)=>{await finish('failed',{p_error:code,p_result:{error:code,...(usage?{usage}:{})}});return json(200,{ok:true,state:'failed'});};
    try{
     let extra={};
     if(reaction){
      const context=await rpc('ch78_max_reaction_context',{p_message_id:job.message_id});
      if(!Array.isArray(context)||!context.length||context.length>5||context[0].message_id!==job.message_id) return await fail('reaction_context');
      extra={post:context[0],context:context.slice(1)};
     }
     const response=await runAssistant(new Request(PROJECT+'/functions/v1/ch78-max-assistant',{method:'POST',
      headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':env('CH78_MAX_WEBHOOK_SECRET')??''},
      body:JSON.stringify({action:job.action,q:job.question,...extra})}));
     data=await bodyJSON(response);
     if(!response.ok){
      const allowed=new Set(['model_not_configured','model_key_rejected','model_access_denied','model_not_found','model_parameters','model_limit','model_unavailable','model_incomplete','model_invalid','model_refused','archive_unavailable','invalid_citation','uncited_answer']);
      const code=allowed.has(data?.error)?data.error:'generation_uncertain';
      if(reaction)return await fail(code,data?.usage);
      await finish('ready',{p_reply:'Сейчас не удалось подготовить надёжный ответ. Попробуйте позже или используйте /find и ключевые слова для поиска по архиву.',p_error:code,p_result:{error:code,...(data?.usage?{usage:data.usage}:{})}});
      return json(200,{ok:true,state:'ready'});
     }
    }catch{
     if(reaction)return await fail('generation_uncertain');
     // Leave lease to expire if persistence is also unavailable. Never retry model calls.
     await finish('ready',{p_reply:'Не удалось дождаться ответа модели. Повтор автоматически не выполняю. Можно попробовать позже или написать /find и ключевые слова.',p_error:'generation_uncertain',p_result:{error:'generation_uncertain'}});return json(200,{ok:true,state:'ready'});
    }
    if(reaction&&data?.found===false){await finish('skipped',{p_result:data});return json(200,{ok:true,state:'skipped'});}
    let text;try{text=renderReply(data,job.action)}catch{if(reaction)return await fail('invalid_result',data?.usage);await finish('ready',{p_reply:'Не удалось проверить ответ и его источники. Попробуйте переформулировать вопрос или используйте /find и ключевые слова.',p_error:'invalid_result',p_result:{error:'invalid_result',...(data?.usage?{usage:data.usage}:{})}});return json(200,{ok:true,state:'ready'});}
    const next=reaction&&job.review_required?'review':'ready';
    await finish(next,{p_reply:text,p_result:{...data,reply_format:'html'}});return json(200,{ok:true,state:next});
   }
   if(typeof job.reply_text!=='string'||!job.reply_text.length||Array.from(job.reply_text).length>4000){
    await finish('failed',{p_error:'invalid_reply'});return json(200,{ok:true,state:'failed'});
   }
   const showButtons=await rpc('ch78_max_buttons_enabled',{});
   const attachments=showButtons===true?keyboard(job):null;
   // Refuse an accidentally configured token of another bot (e.g. IT HAB).
   try{
    const me=await fetchImpl('https://platform-api2.max.ru/me',{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:env('CH78_MAX_TOKEN')}});
    if(!me.ok){me.body?.cancel().catch(()=>{});throw Error();}
    const identity=await bodyJSON(me);
    if(identity.user_id!==531401311||identity.is_bot!==true)throw Error();
   }catch{await finish('failed',{p_error:'max_identity'});return json(200,{ok:true,state:'failed'});}
   // A single send attempt. Ambiguous outcomes require owner review, not retry.
   let sent;
   try{
    const r=await fetchImpl('https://platform-api2.max.ru/messages?chat_id='+CHAT+'&disable_link_preview=true',{
     method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:env('CH78_MAX_TOKEN'),'Content-Type':'application/json'},
     body:JSON.stringify({text:job.reply_text,attachments,link:{type:'reply',mid:job.message_id},notify:false,...(job.result?.reply_format==='html'?{format:'html'}:{})})});
    if(!r.ok){const state=r.status>=500?'delivery_unknown':'failed';r.body?.cancel().catch(()=>{});
     await finish(state,{p_error:'max_rejected'});return json(200,{ok:true,state});}
    sent=await bodyJSON(r);
    if(typeof sent?.message?.body?.mid!=='string'||!sent.message.body.mid.length||sent.message.body.mid.length>512)throw Error();
   }catch{await finish('delivery_unknown',{p_error:'delivery_uncertain'});return json(200,{ok:true,state:'delivery_unknown'});}
   await finish('sent',{p_sent_id:sent.message.body.mid});return json(200,{ok:true,state:'sent'});
  }catch{return json(503,{error:'worker_unavailable'});}
 };
}
