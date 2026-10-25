import {readJSON} from '../ch78-max-ui/http.mjs';
const BASE='https://platform-api2.max.ru';
// Cosmetic, best effort: never hold up or repeat the actual answer.
export async function withTyping(task,{env,fetchImpl,gate,schedule=setTimeout,cancel=clearTimeout}){
 const controller=new AbortController();let stopped=false,timer,pending,count=0,verified=false;
 const request=async(path,body)=>{
  const response=await fetchImpl(BASE+path,{method:body?'POST':'GET',redirect:'error',
   signal:AbortSignal.any([controller.signal,AbortSignal.timeout(2000)]),
   headers:{Authorization:env('CH78_MAX_TOKEN'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok){response.body?.cancel().catch(()=>{});throw Error('typing_unavailable');}
  return readJSON(response,8192);
 };
 const pulse=async()=>{
  try{
   if(stopped||!env('CH78_MAX_TOKEN')||await gate(controller.signal)!==true||stopped)return;
   if(!verified){const me=await request('/me');if(me.user_id!==531401311||me.is_bot!==true||stopped)return;verified=true;}
   if(stopped)return;
   const result=await request('/chats/-78143291213122/actions',{action:'typing_on'});
   if(stopped||result.success!==true)return;
   if(++count<18)timer=schedule(()=>{pending=pulse();},5000);
  }catch{/* No model retry and no user-visible error for a cosmetic failure. */}
 };
 pending=pulse();
 try{return await task();}
 finally{stopped=true;cancel(timer);controller.abort();await pending;}
}
