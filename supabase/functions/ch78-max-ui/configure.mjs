import {readJSON} from './http.mjs';
import {COMMANDS} from './controls.mjs';
const BASE='https://platform-api2.max.ru',WEBHOOK='https://fnwpkmjjdhflnqghnogj.supabase.co/functions/v1/ch78-max-webhook';
export async function configureUI({env,fetchImpl=fetch}){
 const token=env('CH78_MAX_TOKEN'),secret=env('CH78_MAX_WEBHOOK_SECRET');
 if(!token||!secret)throw Error('ui_configuration');
 const request=async(path,method='GET',data)=>{
  const r=await fetchImpl(BASE+path,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  if(!r.ok){r.body?.cancel().catch(()=>{});throw Error('max_configuration');}
  return readJSON(r,65536);
 };
 const me=await request('/me');if(me.user_id!==531401311||me.is_bot!==true)throw Error('max_identity');
 const subscriptions=await request('/subscriptions');
 const found=subscriptions?.subscriptions?.filter(s=>s.url===WEBHOOK);
 if(!found||found.length!==1||!Array.isArray(found[0].update_types)||found[0].update_types.length>40)throw Error('subscription_missing');
 const existing=me.commands??[];if(!Array.isArray(existing)||existing.length>32)throw Error('commands_invalid');
 const merged=[...existing.filter(c=>!COMMANDS.some(x=>x.name===c.name)),...COMMANDS];
 if(merged.length>32)throw Error('commands_limit');
 const patched=await request('/me/commands','PATCH',{commands:merged});if(patched?.success===false)throw Error('commands_failed');
 const s=found[0],types=[...new Set([...s.update_types,'message_created','message_callback'])];
 const out=await request('/subscriptions','POST',{url:WEBHOOK,update_types:types,secret,...(typeof s.version==='string'?{version:s.version}:{})});
 if(out.success!==true)throw Error('subscription_failed');
 const verified=await request('/me');
 if(!Array.isArray(verified.commands)||COMMANDS.some(c=>!verified.commands.some(x=>x.name===c.name&&x.description===c.description)))throw Error('commands_not_verified');
 const checked=await request('/subscriptions');
 if(!checked?.subscriptions?.some(s=>s.url===WEBHOOK&&s.update_types?.includes('message_callback')&&s.update_types?.includes('message_created')))throw Error('subscription_not_verified');
 return {ok:true,commands:COMMANDS.length,callbacks_subscribed:true};
}
