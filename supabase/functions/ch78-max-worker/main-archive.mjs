import {normalize} from '../ch78-max-webhook/handler.mjs';
const PROJECT='https://fnwpkmjjdhflnqghnogj.supabase.co',TARGET='-72977812571458',MAX='https://platform-api2.max.ru';
export async function importMainArchive({env,fetchImpl,read,before=null}){
 if(before!==null&&(!Number.isSafeInteger(before)||before<0||before>Date.now()+30000))throw Error('invalid_cursor');
 const request=async(url,options,max=2097152)=>{const r=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(12000),...options});if(!r.ok){r.body?.cancel().catch(()=>{});throw Error('archive_import_unavailable');}return read(r,max);};
 const maxHeaders={Authorization:env('CH78_MAX_TOKEN')};
 const me=await request(MAX+'/me',{method:'GET',headers:maxHeaders});if(me.user_id!==531401311||me.is_bot!==true)throw Error('max_identity');
 const member=await request(MAX+'/chats/'+TARGET+'/members/me',{method:'GET',headers:maxHeaders});if(member.user_id!==531401311||member.is_admin!==true)throw Error('max_admin_required');
 const key=env('SUPABASE_SERVICE_ROLE_KEY'),dbHeaders={apikey:key,Authorization:'Bearer '+key};
 const config=await request(PROJECT+'/rest/v1/ch78_max_bot_config?select=chat_id,commands_enabled,generation_enabled,sending_enabled,reaction_mode&id=eq.true',{method:'GET',headers:dbHeaders});
 if(!Array.isArray(config)||config.length!==1||(config[0].chat_id===TARGET&&(config[0].commands_enabled||config[0].generation_enabled||config[0].sending_enabled||config[0].reaction_mode!=='off')))throw Error('pause_target_before_import');
 let cursor=before,processed=0,pages=0;
 for(;pages<3;pages++){
  const data=await request(MAX+'/messages?chat_id='+TARGET+'&count=100'+(cursor===null?'':'&from='+cursor),{method:'GET',headers:maxHeaders});
  if(!Array.isArray(data.messages)||data.messages.length>100)throw Error('invalid_page');
  const rows=[],ids=new Set();let oldest=Infinity,newest=0;
  for(const m of data.messages){
   if(!Number.isSafeInteger(m.timestamp)||m.timestamp<0||(cursor!==null&&m.timestamp>cursor))throw Error('invalid_boundary');
   const row=await normalize({update_type:'message_created',timestamp:m.timestamp,message:m},TARGET);
   if(!row||ids.has(row.message_id))throw Error('invalid_message');ids.add(row.message_id);rows.push(row);oldest=Math.min(oldest,m.timestamp);newest=Math.max(newest,m.timestamp);
  }
  if(rows.length){
   const saved=await fetchImpl(PROJECT+'/rest/v1/ch78_max_messages?on_conflict=chat_id,message_id',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{...dbHeaders,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(rows)});
   saved.body?.cancel().catch(()=>{});if(!saved.ok)throw Error('archive_save_failed');processed+=rows.length;
  }
  if(!rows.length)return {ok:true,chat_id:TARGET,processed,pages:pages+1,done:true,next_before:null};
  if(rows.length===100&&(oldest===newest||oldest===cursor))throw Error('ambiguous_boundary');
  cursor=oldest===cursor?oldest-1:oldest;
 }
 return {ok:true,chat_id:TARGET,processed,pages,done:false,next_before:cursor};
}
