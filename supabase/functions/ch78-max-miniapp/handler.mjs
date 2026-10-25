import {validateLaunch} from './auth.mjs';
import {readJSON} from '../ch78-max-ui/http.mjs';
import {createHandler as assistant} from '../ch78-max-assistant/handler.mjs';
const PROJECT='https://fnwpkmjjdhflnqghnogj.supabase.co',CHAT='-78143291213122',ORIGIN='https://chronicles78.github.io';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
// Store only known internal codes, never upstream text, inputs or credentials.
const assistantCodes=new Set(['invalid_request','json_required','request_timeout','request_too_large','archive_unavailable','archive_invalid','model_not_configured','model_incomplete','model_refused','model_invalid','invalid_citation','uncited_answer','model_key_rejected','model_access_denied','model_not_found','model_parameters','model_limit','model_unavailable','upstream_invalid','processing_unavailable','server_configuration','forbidden','method_not_allowed']);
async function inputJSON(req){
 if(req.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')throw Error('invalid_request');
 const reader=req.body?.getReader();if(!reader)throw Error('invalid_request');let timer,total=0;const chunks=[];
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('invalid_request')),5000)});
 try{for(;;){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;total+=value.length;if(total>32768)throw Error('invalid_request');chunks.push(value);}
  const bytes=new Uint8Array(total);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
}
function publicResult(data,action){
 if(!data||typeof data.found!=='boolean'||!Array.isArray(data.sources)||data.sources.length>8)throw Error('result_shape');
 const citations=action==='answer'?data.citations:[];
 if(action==='answer'&&(typeof data.answer!=='string'||data.answer.length>5000||!Array.isArray(citations)||citations.some(id=>typeof id!=='string'||!/^S[1-8]$/.test(id)||!data.sources.some(s=>s?.ref===id))||(data.found&&!citations.length)))throw Error('answer_shape');
 const sources=(action==='search'?data.sources:data.found?data.sources.filter(s=>citations.includes(s.ref)):[]).map(s=>{
  if(!s||!/^S[1-8]$/.test(s.ref)||typeof s.text!=='string'||s.text.length>4000||typeof s.author!=='string'||s.author.length>1000||!Number.isSafeInteger(s.message_ts)||!Number.isFinite(new Date(s.message_ts).getTime()))throw Error('source_shape');
  return {ref:s.ref,text:s.text,author:s.author,message_ts:s.message_ts,truncated:s.truncated===true};
 });
 return {found:data.found,...(action==='answer'?{answer:data.answer,citations}:{}),sources};
}
export function createHandler({env,fetchImpl=fetch,assistantImpl=null,now=()=>Date.now()}){
 const run=assistantImpl??assistant({env,now,fetchImpl:(url,options)=>fetchImpl(url,url==='https://api.openai.com/v1/responses'?{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(35000)])}:options)});
 return async req=>{
  const origin=req.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff',...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN}: {})};
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(origin!==ORIGIN)return reply(403,{error:'origin_denied'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'300'}});
  if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const token=env('CH78_MAX_TOKEN'),key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!token||!key||env('SUPABASE_URL')!==PROJECT||env('CH78_MAX_CHAT_ID')!==CHAT||!env('CH78_MAX_WEBHOOK_SECRET'))return reply(503,{error:'configuration'});
  let b;try{b=await inputJSON(req);if(!b||!['status','recover','search','answer'].includes(b.action))throw Error();
   if(b.action==='recover'&&b.request_id!==undefined&&!uuid(b.request_id))throw Error();
   if(['search','answer'].includes(b.action)&&(!uuid(b.request_id)||typeof b.q!=='string'||!b.q.trim()||b.q.length>300||!['forms','literal'].includes(b.mode??'forms')))throw Error();
  }catch{return reply(400,{error:'invalid_request'});}
  let identity;try{identity=await validateLaunch(b.init_data,token,now())}catch(e){return reply(401,{error:e.message==='launch_expired'?'launch_expired':'invalid_launch'});}
  const rpc=async(name,body={})=>{
   const r=await fetchImpl(PROJECT+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
    headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!r.ok){r.body?.cancel().catch(()=>{});throw Error('database');}return readJSON(r);
  };
  const max=async path=>{
   const r=await fetchImpl('https://platform-api2.max.ru'+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:token}});
   if(!r.ok){r.body?.cancel().catch(()=>{});throw Error('membership');}return readJSON(r,32768);
  };
  try{
   const status=await rpc('ch78_max_miniapp_status');
   if(status?.enabled!==true)return reply(503,{error:'disabled'});
   const me=await max('/me');if(me.user_id!==531401311||me.is_bot!==true)return reply(503,{error:'configuration'});
   // Signed launch chat/user-supplied fields never select the archive. Verify current membership each time.
   const members=await max('/chats/'+CHAT+'/members?user_ids='+identity.userId);
   if(!Array.isArray(members?.members)||members.members.length>1)throw Error('membership');
   if(!members.members.some(u=>String(u.user_id)===identity.userId&&u.is_bot===false))return reply(403,{error:'not_member'});
   if(b.action==='status')return reply(200,{messages:status.messages,test_archive:true,ai_enabled:status.ai_enabled===true,ai_daily_limit:status.ai_daily_limit});
   // Recovery can only read an existing request; it never claims/generates work.
   if(b.action==='recover'){
    const saved=await rpc('ch78_max_miniapp_recover',{p_user_id:identity.userId,p_id:b.request_id??null});
    if(saved?.kind==='disabled')return reply(503,{error:'disabled'});
    if(saved?.kind==='none')return reply(200,{state:'none'});
    if(!uuid(saved?.id)||!['search','answer'].includes(saved?.action)||!['done','failed','processing','unknown'].includes(saved?.kind))throw Error('invalid_recovery');
    return reply(200,{state:saved.kind,request_id:saved.id,action:saved.action,
     ...(['done','failed'].includes(saved.kind)?{result:saved.kind==='failed'?{error:'answer_unavailable'}:publicResult(saved.result,saved.action)}:{})});
   }
   const fingerprint=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([b.action,b.q.trim(),b.mode??'forms']))));
   const claim=await rpc('ch78_max_miniapp_claim',{p_id:b.request_id,p_user_id:identity.userId,p_action:b.action,p_fingerprint:fingerprint});
   if(['done','failed'].includes(claim?.kind))return reply(200,{state:claim.kind,result:claim.kind==='failed'?{error:'answer_unavailable'}:publicResult(claim.result,b.action)});
   if(['processing','unknown'].includes(claim?.kind))return reply(200,{state:claim.kind});
   if(claim?.kind!=='claimed'||!uuid(claim.lease))return reply(['rate_limit','daily_limit'].includes(claim?.kind)?429:409,{error:['disabled','ai_disabled','rate_limit','daily_limit','conflict'].includes(claim?.kind)?claim.kind:'unavailable'});
   let result,ok=false,usage,diagnostic,stage='assistant_call',httpStatus;
   try{
    const r=await run(new Request(PROJECT+'/functions/v1/ch78-max-assistant',{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':env('CH78_MAX_WEBHOOK_SECRET')},body:JSON.stringify({action:b.action,q:b.q.trim(),mode:b.mode??'forms'})}));
    httpStatus=r.status;stage='assistant_decode';
    const data=await readJSON(r);usage=data?.usage;
    if(!r.ok){diagnostic={stage:'assistant_response',code:assistantCodes.has(data?.error)?data.error:'assistant_failed',http_status:r.status};throw Error('answer_unavailable');}
    stage='result_validation';
    result=publicResult(data,b.action);ok=true;
   }catch(error){
    diagnostic??={stage,code:stage==='result_validation'&&['result_shape','answer_shape','source_shape'].includes(error?.message)?error.message:stage==='assistant_decode'?'invalid_response':'processing_failed',...(httpStatus?{http_status:httpStatus}:{})};
    result={error:'answer_unavailable'};
   }
   const saved=await rpc('ch78_max_miniapp_finish',{p_id:b.request_id,p_lease:claim.lease,p_ok:ok,p_result:{...result,...(usage?{usage}:{}),...(diagnostic?{diagnostic}:{})}});
   if(saved!==true)return reply(503,{error:'result_unknown'});
   return reply(200,{state:ok?'done':'failed',result});
  }catch{return reply(503,{error:'connection_unavailable'});}
 };
}
