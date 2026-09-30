const TRAFFIC_SESSION_KEY="chronicles78-traffic-session-v1";
const TRAFFIC_SESSION_TTL=30*60*1000;
let trafficHeartbeatTimer=null,trafficHeartbeatBusy=false,trafficStatsBusy=false;

function trafficUuid(){
 try{return crypto.randomUUID()}catch{}
 return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
   const r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16);
 });
}
function trafficSessionId(){
 const now=Date.now();let row=null;
 try{row=JSON.parse(localStorage.getItem(TRAFFIC_SESSION_KEY)||"null")}catch{}
 if(!row?.id||!Number(row.last)||now-Number(row.last)>TRAFFIC_SESSION_TTL){
   row={id:trafficUuid(),last:now};
 }else row.last=now;
 try{localStorage.setItem(TRAFFIC_SESSION_KEY,JSON.stringify(row))}catch{}
 return row.id;
}
function trafficDevice(){
 const ua=String(navigator.userAgent||"").toLowerCase();
 const mobile=!!navigator.userAgentData?.mobile||/iphone|ipod|android.*mobile|windows phone/.test(ua);
 const tablet=/ipad|android(?!.*mobile)|tablet/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
 const deviceType=tablet?"tablet":mobile?"mobile":"desktop";
 let platform="Other";
 if(/android/.test(ua))platform="Android";
 else if(/iphone|ipad|ipod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1))platform="iOS";
 else if(/windows/.test(ua))platform="Windows";
 else if(/mac os|macintosh/.test(ua))platform="macOS";
 else if(/linux/.test(ua))platform="Linux";
 return {deviceType,platform};
}
async function sendTraffic(action,view){
 try{
   const meta=trafficDevice();
   const {error}=await sb.functions.invoke("site-traffic",{body:{
     action,view:view||activeViewId?.()||"home",sessionId:trafficSessionId(),
     deviceType:meta.deviceType,platform:meta.platform
   }});
   if(error)console.warn("traffic:",error.message||error);
 }catch(e){console.warn("traffic:",e)}
}
function trackSiteView(view){void sendTraffic("track",view)}
async function trafficHeartbeat(){
 if(trafficHeartbeatBusy||document.visibilityState!=="visible")return;
 trafficHeartbeatBusy=true;
 try{await sendTraffic("heartbeat",activeViewId?.()||"home")}finally{trafficHeartbeatBusy=false}
}
function startTrafficHeartbeat(){
 if(trafficHeartbeatTimer)return;
 trafficHeartbeatTimer=setInterval(trafficHeartbeat,60000);
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void trafficHeartbeat()});
}

const TRAFFIC_VIEW_LABELS={home:"Главная",chat:"Чат",people:"Люди",stories:"Истории",photos:"Фото",city:"Город",questions:"Вопросы",profile:"Профиль"};
function trafficViewLabel(v){return TRAFFIC_VIEW_LABELS[v]||v||"—"}
function trafficWhen(v){
 if(!v)return "—";
 const d=new Date(v),now=new Date(),delta=now-d;
 if(delta>=0&&delta<60000)return "только что";
 if(delta>=0&&delta<3600000)return Math.max(1,Math.floor(delta/60000))+" мин назад";
 if(delta>=0&&delta<86400000)return Math.floor(delta/3600000)+" ч назад";
 return d.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function trafficPeriodCard(title,x){
 return '<article class="trafficKpi"><span>'+esc(title)+'</span><b>'+Number(x?.visitors||0)+'</b><small>посетителей · '+Number(x?.knownUsers||0)+' участн. · '+Number(x?.guests||0)+' гост.</small></article>';
}
function renderTrafficStats(data){
 const k=data?.kpis||{},chat=data?.chat||{};
 if($("trafficStatsState")){
   $("trafficStatsState").className="small trafficGenerated";
   $("trafficStatsState").textContent="Обновлено "+new Date(data.generatedAt||Date.now()).toLocaleString("ru-RU")+". Гости учитываются как анонимные сессии.";
 }
 if($("trafficKpis"))$("trafficKpis").innerHTML=
   trafficPeriodCard("Сегодня",k.today)+trafficPeriodCard("7 дней",k.sevenDays)+trafficPeriodCard("30 дней",k.thirtyDays)+trafficPeriodCard("Сейчас",k.online);

 const online=data.online||[];
 if($("trafficOnlineList"))$("trafficOnlineList").innerHTML=online.length?online.map(x=>
   '<div class="trafficRow"><div><b>'+esc(x.name||"Гость")+'</b><span>'+esc(trafficViewLabel(x.currentView))+' · '+esc(x.deviceType||"")+'</span></div><small>'+esc(trafficWhen(x.lastSeenAt))+'</small></div>'
 ).join(""):'<div class="trafficEmpty">Сейчас активных посетителей нет.</div>';

 const periods=[["Сегодня",chat.today],["7 дней",chat.sevenDays],["30 дней",chat.thirtyDays]];
 if($("trafficChatStats"))$("trafficChatStats").innerHTML='<div class="trafficChatTable">'+periods.map(([label,x])=>
   '<div class="trafficChatRow"><b>'+label+'</b><span>'+Number(x?.visitors||0)+' посет.</span><span>'+Number(x?.opens||0)+' открытий</span><span>'+Number(x?.messages||0)+' сообщ.</span><span>'+Number(x?.reads||0)+' прочтений</span></div>'
 ).join("")+'</div>';

 const popular=data.popularViews||[],max=Math.max(1,...popular.map(x=>Number(x.count||0)));
 if($("trafficPopularViews"))$("trafficPopularViews").innerHTML=popular.length?popular.map(x=>
   '<div class="trafficPopularRow"><span>'+esc(trafficViewLabel(x.view))+'</span><div><i style="width:'+Math.round(Number(x.count||0)/max*100)+'%"></i></div><b>'+Number(x.count||0)+'</b></div>'
 ).join(""):'<div class="trafficEmpty">Данных пока нет.</div>';

 const recent=data.recentVisitors||[];
 if($("trafficRecentVisitors"))$("trafficRecentVisitors").innerHTML=recent.length?recent.map(x=>
   '<div class="trafficVisitor"><div class="trafficVisitorTop"><b>'+esc(x.name||"Гость")+'</b><small>'+esc(trafficWhen(x.lastSeenAt))+'</small></div>'+
   '<div class="trafficVisitorMeta">'+esc(trafficViewLabel(x.currentView))+' · '+esc(x.deviceType||"")+' · '+esc(x.platform||"")+' · '+Number(x.pageViews||0)+' просмотров'+(x.chatViews?' · чат '+Number(x.chatViews):'')+'</div>'+
   (!x.isGuest?'<div class="trafficVisitorMeta">За 30 дней: '+Number(x.messages30||0)+' сообщений · '+Number(x.reads30||0)+' отметок прочтения</div>':'')+
   '</div>'
 ).join(""):'<div class="trafficEmpty">Посещений пока нет.</div>';
}
async function loadTrafficStats(){
 if(profile?.role!=="admin"||trafficStatsBusy||!$("trafficStatsBox"))return;
 trafficStatsBusy=true;
 if($("trafficRefreshBtn"))$("trafficRefreshBtn").disabled=true;
 if($("trafficStatsState")){$("trafficStatsState").className="notice";$("trafficStatsState").textContent="Считаю посещаемость…"}
 try{
   const {data,error}=await sb.functions.invoke("site-traffic",{body:{action:"stats",timezoneOffsetMinutes:new Date().getTimezoneOffset()}});
   if(error||!data?.ok)throw new Error(error?.message||data?.detail||data?.error||"Не удалось получить статистику.");
   renderTrafficStats(data);
 }catch(e){
   if($("trafficStatsState")){$("trafficStatsState").className="err";$("trafficStatsState").textContent=e.message||String(e)}
 }finally{
   trafficStatsBusy=false;if($("trafficRefreshBtn"))$("trafficRefreshBtn").disabled=false;
 }
}
if($("trafficRefreshBtn"))$("trafficRefreshBtn").onclick=loadTrafficStats;
startTrafficHeartbeat();
