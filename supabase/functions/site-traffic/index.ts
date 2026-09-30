import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";

const CONSENT_CODE="archive_personal_data";
const CONSENT_VERSION="2026-09-30-v3";
const VIEWS=new Set(["home","chat","people","stories","photos","city","questions","profile"]);
const DEVICES=new Set(["mobile","tablet","desktop","unknown"]);
const PLATFORMS=new Set(["Android","iOS","Windows","macOS","Linux","Other","unknown"]);
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function res(body:unknown,status=200){
  return Response.json(body,{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}});
}
function clampString(v:unknown,max=32){return String(v||"").slice(0,max)}
function unique<T>(a:T[]){return [...new Set(a)]}
function visitorKey(s:any){return s.user_id?"u:"+s.user_id:"g:"+s.session_id}
function windowStats(sessions:any[],cutoff:number){
  const rows=sessions.filter(s=>new Date(s.last_seen_at).getTime()>=cutoff);
  return {
    sessions:rows.length,
    visitors:new Set(rows.map(visitorKey)).size,
    knownUsers:new Set(rows.filter(s=>s.user_id).map(s=>s.user_id)).size,
    guests:new Set(rows.filter(s=>!s.user_id).map(s=>s.session_id)).size
  };
}
function countEvents(events:any[],cutoff:number,view?:string){
  return events.filter(e=>new Date(e.created_at).getTime()>=cutoff&&(!view||e.view_id===view)).length;
}
function countVisitors(events:any[],cutoff:number,view?:string){
  return new Set(events.filter(e=>new Date(e.created_at).getTime()>=cutoff&&(!view||e.view_id===view)).map((e:any)=>e.user_id?"u:"+e.user_id:"g:"+e.session_id)).size;
}
async function authIdentity(admin:any,jwt:string){
  if(!jwt)return {user:null,profile:null,consented:false};
  const {data,error}=await admin.auth.getUser(jwt);
  const u=data?.user;if(error||!u)return {user:null,profile:null,consented:false};
  const [{data:profile},{data:consent}]=await Promise.all([
    admin.from("profiles").select("display_name,role,is_active,access_blocked").eq("id",u.id).maybeSingle(),
    admin.from("user_consents").select("accepted_at,withdrawn_at").eq("user_id",u.id).eq("consent_code",CONSENT_CODE).eq("consent_version",CONSENT_VERSION).maybeSingle()
  ]);
  const consented=!!profile?.is_active&&!profile?.access_blocked&&!!consent&&!consent.withdrawn_at;
  return {user:u,profile,consented};
}
function localTodayStart(now:Date,offsetMinutes:number){
  const shifted=new Date(now.getTime()-offsetMinutes*60000);
  shifted.setUTCHours(0,0,0,0);
  return shifted.getTime()+offsetMinutes*60000;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return res({error:"method_not_allowed"},405);

  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return res({error:"server_configuration_error"},500);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let input:any={};try{input=await req.json()}catch{}
  const action=String(input.action||"track");
  const rawAuth=req.headers.get("Authorization")||"";
  const jwt=rawAuth.replace(/^Bearer\s+/i,"").trim();
  const identity=await authIdentity(admin,jwt);

  if(action==="track"||action==="heartbeat"){
    const sessionId=String(input.sessionId||"");
    if(!UUID_RE.test(sessionId))return res({error:"invalid_session_id"},400);
    const view=VIEWS.has(String(input.view))?String(input.view):"home";
    const device=DEVICES.has(String(input.deviceType))?String(input.deviceType):"unknown";
    const platform=PLATFORMS.has(String(input.platform))?String(input.platform):"unknown";
    const now=new Date().toISOString();
    const userId=identity.consented?identity.user?.id:null;

    const {data:existing,error:se}=await admin.from("traffic_sessions")
      .select("session_id,user_id,page_views,chat_views,first_seen_at")
      .eq("session_id",sessionId).maybeSingle();
    if(se)return res({error:"session_lookup_failed",detail:se.message},422);

    if(existing){
      const patch:any={
        last_seen_at:now,current_view:view,device_type:device,platform,
        user_id:userId||existing.user_id||null
      };
      if(action==="track"){
        patch.page_views=Number(existing.page_views||0)+1;
        if(view==="chat")patch.chat_views=Number(existing.chat_views||0)+1;
      }
      const {error}=await admin.from("traffic_sessions").update(patch).eq("session_id",sessionId);
      if(error)return res({error:"session_update_failed",detail:error.message},422);
    }else{
      const {error}=await admin.from("traffic_sessions").insert({
        session_id:sessionId,user_id:userId||null,first_seen_at:now,last_seen_at:now,current_view:view,
        device_type:device,platform,page_views:action==="track"?1:0,chat_views:action==="track"&&view==="chat"?1:0
      });
      if(error)return res({error:"session_create_failed",detail:error.message},422);
    }

    if(action==="track"){
      const {error}=await admin.from("traffic_events").insert({
        session_id:sessionId,user_id:userId||null,event_type:"view",view_id:view,created_at:now
      });
      if(error)return res({error:"event_create_failed",detail:error.message},422);
    }
    return res({ok:true,identified:!!userId});
  }

  if(action!=="stats")return res({error:"unknown_action"},400);
  if(!identity.user||!identity.profile?.is_active||identity.profile?.access_blocked||identity.profile?.role!=="admin"){
    return res({error:"admin_required"},403);
  }

  const now=new Date();
  const tz=Math.max(-840,Math.min(840,Number(input.timezoneOffsetMinutes)||0));
  const todayStart=localTodayStart(now,tz);
  const seven=now.getTime()-7*86400000;
  const thirty=now.getTime()-30*86400000;
  const onlineCut=now.getTime()-150000;

  const [sessionsRes,eventsRes,messagesRes,readsRes]=await Promise.all([
    admin.from("traffic_sessions").select("session_id,user_id,first_seen_at,last_seen_at,current_view,device_type,platform,page_views,chat_views").gte("last_seen_at",new Date(thirty).toISOString()).order("last_seen_at",{ascending:false}).limit(3000),
    admin.from("traffic_events").select("session_id,user_id,view_id,created_at").gte("created_at",new Date(thirty).toISOString()).order("created_at",{ascending:false}).limit(5000),
    admin.from("messages").select("author_id,created_at").gte("created_at",new Date(thirty).toISOString()).limit(5000),
    admin.from("message_reads").select("user_id,read_at").gte("read_at",new Date(thirty).toISOString()).limit(10000)
  ]);
  const firstErr=sessionsRes.error||eventsRes.error||messagesRes.error||readsRes.error;
  if(firstErr)return res({error:"stats_query_failed",detail:firstErr.message},422);

  const sessions=sessionsRes.data||[],events=eventsRes.data||[],messages=messagesRes.data||[],reads=readsRes.data||[];
  const ids=unique(sessions.filter((s:any)=>s.user_id).map((s:any)=>s.user_id));
  const {data:profiles}=ids.length?await admin.from("profiles").select("id,display_name").in("id",ids):{data:[]};
  const names=new Map((profiles||[]).map((p:any)=>[p.id,p.display_name]));

  const sent30=new Map<string,number>(),read30=new Map<string,number>();
  for(const m of messages)sent30.set(m.author_id,(sent30.get(m.author_id)||0)+1);
  for(const r of reads)read30.set(r.user_id,(read30.get(r.user_id)||0)+1);

  const onlineRows=sessions.filter((s:any)=>new Date(s.last_seen_at).getTime()>=onlineCut);
  const onlineByVisitor=new Map<string,any>();
  for(const s of onlineRows){
    const k=visitorKey(s),prev=onlineByVisitor.get(k);
    if(!prev||new Date(s.last_seen_at)>new Date(prev.last_seen_at))onlineByVisitor.set(k,s);
  }

  const recentVisitors=sessions.slice(0,40).map((s:any)=>({
    sessionId:s.session_id,
    userId:s.user_id||null,
    name:s.user_id?(names.get(s.user_id)||"Участник"):"Гость",
    isGuest:!s.user_id,
    firstSeenAt:s.first_seen_at,lastSeenAt:s.last_seen_at,currentView:s.current_view,
    deviceType:s.device_type,platform:s.platform,
    pageViews:Number(s.page_views||0),chatViews:Number(s.chat_views||0),
    activeMinutes:Math.max(0,Math.round((new Date(s.last_seen_at).getTime()-new Date(s.first_seen_at).getTime())/60000)),
    messages30:s.user_id?(sent30.get(s.user_id)||0):0,
    reads30:s.user_id?(read30.get(s.user_id)||0):0
  }));

  const viewCounts=new Map<string,number>();
  for(const e of events)viewCounts.set(e.view_id,(viewCounts.get(e.view_id)||0)+1);
  const popularViews=[...viewCounts.entries()].map(([view,count])=>({view,count})).sort((a,b)=>b.count-a.count);

  const msgCount=(cut:number)=>messages.filter((m:any)=>new Date(m.created_at).getTime()>=cut).length;
  const readCount=(cut:number)=>reads.filter((r:any)=>new Date(r.read_at).getTime()>=cut).length;

  return res({
    ok:true,generatedAt:now.toISOString(),
    kpis:{
      today:windowStats(sessions,todayStart),
      sevenDays:windowStats(sessions,seven),
      thirtyDays:windowStats(sessions,thirty),
      online:{
        sessions:onlineRows.length,
        visitors:onlineByVisitor.size,
        knownUsers:new Set(onlineRows.filter((s:any)=>s.user_id).map((s:any)=>s.user_id)).size,
        guests:new Set(onlineRows.filter((s:any)=>!s.user_id).map((s:any)=>s.session_id)).size
      }
    },
    chat:{
      today:{opens:countEvents(events,todayStart,"chat"),visitors:countVisitors(events,todayStart,"chat"),messages:msgCount(todayStart),reads:readCount(todayStart)},
      sevenDays:{opens:countEvents(events,seven,"chat"),visitors:countVisitors(events,seven,"chat"),messages:msgCount(seven),reads:readCount(seven)},
      thirtyDays:{opens:countEvents(events,thirty,"chat"),visitors:countVisitors(events,thirty,"chat"),messages:msgCount(thirty),reads:readCount(thirty)}
    },
    online:[...onlineByVisitor.values()].sort((a:any,b:any)=>new Date(b.last_seen_at).getTime()-new Date(a.last_seen_at).getTime()).map((s:any)=>({
      name:s.user_id?(names.get(s.user_id)||"Участник"):"Гость",isGuest:!s.user_id,currentView:s.current_view,lastSeenAt:s.last_seen_at,deviceType:s.device_type
    })),
    popularViews,
    recentVisitors
  });
});