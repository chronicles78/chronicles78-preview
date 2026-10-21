import {createHandler as assistant} from '../ch78-max-assistant/handler.mjs';
const PROJECT='https://fnwpkmjjdhflnqghnogj.supabase.co';
const CHAT='-78143291213122';
const encoder=new TextEncoder();
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
const clean=x=>String(x??'').replace(/[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'');
const cut=(x,n)=>{const chars=Array.from(clean(x));return chars.length<=n?chars.join(''):chars.slice(0,n-14).join('')+'… [сокращено]';};
export function renderReply(data,action){
 if(!data||!Array.isArray(data.sources)||data.sources.length>8)throw Error('invalid_result');
 const lines=[action==='answer'?'Хранитель · ответ по архиву':'Хранитель · найденные сообщения'];
 let visibleSources=data.sources;
 if(action==='answer'){
  if(typeof data.answer!=='string'||typeof data.found!=='boolean')throw Error('invalid_result');
  if(data.found){
   if(!Array.isArray(data.citations)||!data.citations.length||data.citations.some(ref=>
    typeof ref!=='string'||!/^S[1-8]$/.test(ref)||!data.sources.some(s=>s.ref===ref)))throw Error('invalid_citation');
   visibleSources=data.sources.filter(s=>data.citations.includes(s.ref));
  }
  lines.push(cut(data.answer,2000));
 }
 // No-evidence responses do not publish a pile of unrelated excerpts.
 if(action==='search'||data.found){
  for(const source of visibleSources){
   if(!/^S[1-8]$/.test(source.ref)||typeof source.text!=='string'||!Number.isSafeInteger(source.message_ts))throw Error('invalid_source');
   const date=new Date(source.message_ts).toLocaleString('ru-RU',{timeZone:'Europe/Samara'});
   lines.push('['+source.ref+'] '+date+' · '+cut(source.author,60)+'\n'+cut(source.text,action==='search'?300:100));
  }
 }
 if(!data.sources.length&&action==='search')lines.push('Подходящих сообщений не найдено.');
 lines.push(action==='answer'?'Черновик по источникам. Проверяйте факты.':'Совпадение слов не гарантирует ответа на вопрос.');
 const text=lines.join('\n\n');if(Array.from(text).length>4000)throw Error('reply_too_large');return text;
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
   if(!b||!['generate','send'].includes(b.stage))throw Error();stage=b.stage;
  }catch{return json(400,{error:'invalid_request'});}
  const rpc=async(name,body)=>{
   const r=await fetchImpl(PROJECT+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
    headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!r.ok){r.body?.cancel().catch(()=>{});throw Error('database_unavailable');}return bodyJSON(r);
  };
  if(stage==='send'&&!env('CH78_MAX_TOKEN'))return json(503,{error:'max_token_missing'});
  try{
   const rows=await rpc('ch78_max_claim_job',{p_stage:stage});
   if(!Array.isArray(rows)||rows.length>1)throw Error('invalid_claim');
   if(!rows.length)return json(200,{ok:true,idle:true});
   const job=rows[0];
   if(!uuid(job.id)||!uuid(job.lease)||job.chat_id!==CHAT||typeof job.message_id!=='string'||!job.message_id.length||job.message_id.length>512||
    !['search','answer'].includes(job.action)||typeof job.question!=='string'||!job.question.trim()||job.question.length>300||
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
    try{
     const response=await runAssistant(new Request(PROJECT+'/functions/v1/ch78-max-assistant',{method:'POST',
      headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':env('CH78_MAX_WEBHOOK_SECRET')??''},
      body:JSON.stringify({action:job.action,q:job.question})}));
     data=await bodyJSON(response);
     if(!response.ok){
      const allowed=new Set(['model_not_configured','model_key_rejected','model_access_denied','model_not_found','model_parameters','model_limit','model_unavailable','model_incomplete','model_invalid','model_refused','archive_unavailable','invalid_citation','uncited_answer']);
      const code=allowed.has(data?.error)?data.error:'generation_uncertain';
      await finish(code==='generation_uncertain'?'generation_unknown':'failed',{p_error:code,p_result:{error:code,...(data?.usage?{usage:data.usage}:{})}});
      return json(200,{ok:true,state:code==='generation_uncertain'?'generation_unknown':'failed'});
     }
    }catch{
     // Leave lease to expire if persistence is also unavailable. Never retry model calls.
     await finish('generation_unknown',{p_error:'generation_uncertain'});return json(200,{ok:true,state:'generation_unknown'});
    }
    let text;try{text=renderReply(data,job.action)}catch{await finish('failed',{p_error:'invalid_result',p_result:{error:'invalid_result',...(data?.usage?{usage:data.usage}:{})}});return json(200,{ok:true,state:'failed'});}
    await finish('ready',{p_reply:text,p_result:data});return json(200,{ok:true,state:'ready'});
   }
   if(typeof job.reply_text!=='string'||!job.reply_text.length||Array.from(job.reply_text).length>4000){
    await finish('failed',{p_error:'invalid_reply'});return json(200,{ok:true,state:'failed'});
   }
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
     body:JSON.stringify({text:job.reply_text,attachments:null,link:{type:'reply',mid:job.message_id},notify:false})});
    if(!r.ok){const state=r.status>=500?'delivery_unknown':'failed';r.body?.cancel().catch(()=>{});
     await finish(state,{p_error:'max_rejected'});return json(200,{ok:true,state});}
    sent=await bodyJSON(r);
    if(typeof sent?.message?.body?.mid!=='string'||!sent.message.body.mid.length||sent.message.body.mid.length>512)throw Error();
   }catch{await finish('delivery_unknown',{p_error:'delivery_uncertain'});return json(200,{ok:true,state:'delivery_unknown'});}
   await finish('sent',{p_sent_id:sent.message.body.mid});return json(200,{ok:true,state:'sent'});
  }catch{return json(503,{error:'worker_unavailable'});}
 };
}
