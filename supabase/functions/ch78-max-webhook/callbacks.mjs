import {readJSON as read} from '../ch78-max-ui/http.mjs';
import {keyboard,callbackText,compactReply} from '../ch78-max-ui/controls.mjs';
const PROJECT='https://fnwpkmjjdhflnqghnogj.supabase.co',CHAT='-78143291213122',MAX='https://platform-api2.max.ru';
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const ignored=()=>json(200,{ok:true,ignored:true});
// Called only after the webhook's shared-secret and bounded-body authentication.
export async function handleCallback(update,{env,fetchImpl=fetch,now=()=>Date.now()}){
 const c=update?.callback,m=update?.message;
 if(!m||String(m.recipient?.chat_id)!==CHAT)return ignored();
 const match=typeof c?.payload==='string'?c.payload.match(/^ch78:(help|examples|source):([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?::(S[1-8]))?$/i):null;
 if(!match||((match[1]==='source')!==Boolean(match[3])))return ignored();
 if(!Number.isSafeInteger(update.timestamp)||Math.abs(now()-update.timestamp)>300000||
  typeof c.callback_id!=='string'||!c.callback_id.length||c.callback_id.length>512||c.callback_id.includes('\0')||
  !Number.isSafeInteger(c.user?.user_id)||c.user.user_id<=0||c.user.is_bot!==false||
  typeof m.body?.mid!=='string'||!m.body.mid.length||m.body.mid.length>512||
  (m.sender&&(m.sender.user_id!==531401311||m.sender.is_bot!==true)))return ignored();
 const token=env('CH78_MAX_TOKEN'),key=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!token)return json(503,{error:'max_not_configured'});
 const rpc=async(name,body)=>{const r=await fetchImpl(PROJECT+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok){r.body?.cancel().catch(()=>{});throw Error('database');}return read(r);};
 let parent;
 try{parent=await rpc('ch78_max_claim_callback',{p_callback_id:c.callback_id,p_chat_id:CHAT,p_user_id:String(c.user.user_id),p_parent_id:match[2],p_message_id:m.body.mid,p_action:match[1],p_source_ref:match[3]??null});}
 catch{return json(503,{error:'callback_unavailable'});}
 if(!parent)return ignored();
 // Claim precedes all MAX effects. Redelivery never repeats an uncertain send.
 const finish=async(state,mid=null)=>{try{await rpc('ch78_max_finish_callback',{p_callback_id:c.callback_id,p_state:state,p_sent_id:mid});}catch{}};
 const job={id:match[2],action:parent.action,result:parent.result};
 let text,attachments;
 try{
  if(match[1]==='source'){
   if(!['show','hide'].includes(parent.source_effect)||typeof parent.edit_mid!=='string'||!parent.edit_mid.length||parent.edit_mid.length>512)throw Error();
   text=compactReply(job)+(parent.source_effect==='show'?'\n\n'+callbackText('source',job,match[3],1400):'');
   attachments=keyboard(job,false,parent.source_effect==='show'?match[3]:null);
  }else{text=callbackText(match[1],job,match[3]);attachments=keyboard(job,true);}
  if(text.length>4000)throw Error();
 }
 catch{await finish('failed');return json(200,{ok:true,state:'failed'});}
 try{
 if(await rpc('ch78_max_buttons_enabled',{})!==true){await finish('failed');return json(200,{ok:true,state:'failed'});}
 const me=await fetchImpl(MAX+'/me',{method:'GET',redirect:'error',signal:AbortSignal.timeout(6000),headers:{Authorization:token}});
 if(!me.ok)throw Error();const identity=await read(me,32768);if(identity.user_id!==531401311||identity.is_bot!==true)throw Error();
 }catch{await finish('failed');return json(200,{ok:true,state:'failed'});}
 // Acknowledge the click; source disclosures update the shared original answer.
 try{const ack=await fetchImpl(MAX+'/answers?callback_id='+encodeURIComponent(c.callback_id),{method:'POST',redirect:'error',signal:AbortSignal.timeout(4000),headers:{Authorization:token,'Content-Type':'application/json'},body:'{}'});ack.body?.cancel().catch(()=>{});}catch{}
 try{
 if(match[1]==='source'){
  const r=await fetchImpl(MAX+'/messages?message_id='+encodeURIComponent(parent.edit_mid),{method:'PUT',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({text,attachments,format:'html',notify:false})});
  if(!r.ok){r.body?.cancel().catch(()=>{});const state=r.status>=500?'unknown':'failed';await finish(state);return json(200,{ok:true,state});}
  const out=await read(r,32768);
  if(out?.success!==true){await finish('failed');return json(200,{ok:true,state:'failed'});}
  await finish('done',parent.edit_mid);return json(200,{ok:true,state:'done'});
 }
 const r=await fetchImpl(MAX+'/messages?chat_id='+CHAT+'&disable_link_preview=true',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({text,attachments,format:'html',notify:false,link:{type:'reply',mid:m.body.mid}})});
 if(!r.ok){r.body?.cancel().catch(()=>{});await finish(r.status>=500?'unknown':'failed');return json(200,{ok:true,state:r.status>=500?'unknown':'failed'});}
 const sent=await read(r,32768),mid=sent?.message?.body?.mid;
 if(typeof mid!=='string'||!mid.length||mid.length>512)throw Error();
 await finish('done',mid);return json(200,{ok:true,state:'done'});
 }catch{await finish('unknown');return json(200,{ok:true,state:'unknown'});}
}
