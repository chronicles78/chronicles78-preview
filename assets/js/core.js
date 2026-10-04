const THEME_KEY="chronicles78-theme";
const THEME_MODES=["auto","light","dark"];
function systemTheme(){return window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}
function getTheme(){
 const saved=localStorage.getItem(THEME_KEY)||"auto";
 return THEME_MODES.includes(saved)?saved:"auto";
}
function applyTheme(mode){
 mode=THEME_MODES.includes(mode)?mode:"auto";
 const actual=mode==="auto"?systemTheme():mode;
 document.documentElement.dataset.theme=actual;
 document.documentElement.dataset.themeMode=mode;
 document.documentElement.style.colorScheme=actual==="light"?"only light":"dark";
 const schemeMeta=document.getElementById("siteColorScheme");
 if(schemeMeta)schemeMeta.setAttribute("content",actual==="light"?"only light":"dark");
 const themeMeta=document.querySelector('meta[name="theme-color"]');
 if(themeMeta)themeMeta.setAttribute("content",actual==="light"?"#fffdf8":"#211e1a");
 const spec={
   auto:{icon:"◐",label:"Авто"},
   light:{icon:"☀",label:"Светлая"},
   dark:{icon:"☾",label:"Тёмная"}
 }[mode];
 const btn=document.getElementById("themeBtn");
 if(btn){
   btn.innerHTML='<span class="themeBtnIcon">'+spec.icon+'</span><span class="themeBtnLabel">'+spec.label+'</span>';
   btn.title="Тема сайта: "+spec.label+". Нажмите для переключения.";
   btn.setAttribute("aria-label",btn.title);
 }
 const select=document.getElementById("themeSelect");
 if(select&&select.value!==mode)select.value=mode;
}
applyTheme(getTheme());
const mq=window.matchMedia?window.matchMedia("(prefers-color-scheme: dark)"):null;
if(mq)mq.addEventListener?.("change",()=>{if(getTheme()==="auto")applyTheme("auto")});
const SUPABASE_URL="https://fnwpkmjjdhflnqghnogj.supabase.co";
const SUPABASE_KEY="sb_publishable_m_oI5Ahniod1rd3wTV-i4A_so7lUVvX";
const SITE_URL="https://chronicles78.github.io/chronicles78-preview/";
const APP_STANDALONE=window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true;
const authReturn=(()=>{
 const q=new URLSearchParams(location.search);
 const h=new URLSearchParams(location.hash.replace(/^#/,""));
 return {
   type:h.get("type")||q.get("type")||"",
   error:h.get("error_description")||q.get("error_description")||"",
   hasToken:!!(h.get("access_token")||h.get("refresh_token")||q.get("code"))
 };
})();
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const PASSWORD_RESET_REDIRECT=SITE_URL;
const CONSENT_CODE="archive_personal_data";
const CONSENT_VERSION="2026-09-30-v3";
const OTP_EMAIL_KEY="chronicles78-pending-otp-email";
const START_PARAMS=new URLSearchParams(location.search);
const OPEN_LOGIN_ON_START=START_PARAMS.get("login")==="1";
const OPEN_REGISTER_ON_START=START_PARAMS.get("register")==="1";

function openForgotPassword(){
 const current=($("email")?.value||"").trim();
 openPhotoModal("Восстановить пароль",
   '<div class="notice">Укажите e-mail, использованный при регистрации. На него придёт письмо со ссылкой для смены пароля.</div>'+
   '<label>E-mail</label><input id="pfResetEmail" type="email" autocomplete="email" value="'+esc(current)+'" placeholder="name@example.com">',
   async()=>{
     const email=$("pfResetEmail").value.trim();
     if(!email)throw new Error("Введите e-mail.");
     $("photoModalMsg").textContent="Отправляю письмо…";
     const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:PASSWORD_RESET_REDIRECT});
     if(error)throw error;
     $("photoModalBody").innerHTML='<div class="notice"><b>Письмо отправлено.</b><br>Откройте ссылку из письма. Если письма нет несколько минут, проверьте папку «Спам».</div>';
     $("photoModalSave").textContent="Закрыть";
     photoModalSubmit=async()=>closePhotoModal();
   }
 );
}

function openNewPasswordForm(){
 openPhotoModal("Новый пароль",
   '<div class="notice">Ссылка подтверждена. Придумайте новый пароль.</div>'+
   '<label>Новый пароль</label><input id="pfNewPassword" type="password" autocomplete="new-password" minlength="6">'+
   '<label>Повторите пароль</label><input id="pfNewPassword2" type="password" autocomplete="new-password" minlength="6">'+
   '<div class="formHint">Не менее 6 символов.</div>',
   async()=>{
     const p1=$("pfNewPassword").value;
     const p2=$("pfNewPassword2").value;
     if(p1.length<6)throw new Error("Пароль должен содержать не менее 6 символов.");
     if(p1!==p2)throw new Error("Пароли не совпадают.");
     $("photoModalMsg").textContent="Сохраняю новый пароль…";
     const {error}=await sb.auth.updateUser({password:p1});
     if(error)throw error;
     await sb.auth.signOut();
     user=null; profile=null;
     history.replaceState(null,document.title,location.pathname+location.search);
     $("photoModalBody").innerHTML='<div class="notice"><b>Пароль изменён.</b><br>Теперь войдите с новым паролем.</div>';
     $("photoModalSave").textContent="Перейти ко входу";
     photoModalSubmit=async()=>{closePhotoModal();renderProfile();showView("profile")};
   }
 );
}

function clearAuthReturnUrl(){
 try{history.replaceState(null,document.title,location.pathname)}catch(e){}
}
function showSignupConfirmationState(){
 if(authReturn.error){
   openPhotoModal("Ссылка подтверждения",
     '<div class="notice"><b>Не удалось завершить переход по ссылке.</b><br>'+esc(authReturn.error)+'</div>'+
     '<div class="formHint">Если e-mail уже зарегистрирован, повторная регистрация не нужна. Откройте профиль и запросите новую ссылку для входа.</div>',
     async()=>{closePhotoModal();showView("profile")}
   );
   $("photoModalSave").textContent="Перейти ко входу";
   photoModalSubmit=async()=>{clearAuthReturnUrl();closePhotoModal();showView("profile")};
   return;
 }
 if(authReturn.type!=="signup"&&!authReturn.hasToken)return;
 if(user&&profile?.is_active){
   openPhotoModal("E-mail подтверждён",
     '<div class="notice"><b>Готово.</b><br>E-mail подтверждён, доступ к «Хроникам-78» активен. Вы уже вошли на сайт.</div>',
     async()=>{clearAuthReturnUrl();closePhotoModal();showView("home")}
   );
   $("photoModalSave").textContent="Перейти в архив";
   photoModalSubmit=async()=>{clearAuthReturnUrl();closePhotoModal();showView("home")};
 }else if(user){
   const pendingText=consentRequired
     ?"E-mail подтверждён. Подтвердите согласие, после этого заявка останется на рассмотрении администратора."
     :(pendingProfile?.access_blocked
       ?"E-mail подтверждён, но доступ не предоставлен или был отключён администратором."
       :"E-mail подтверждён. Заявка передана администратору. Архив откроется после его решения.");
   openPhotoModal("E-mail подтверждён",
     '<div class="notice"><b>Адрес подтверждён.</b><br>'+esc(pendingText)+'</div>',
     async()=>{clearAuthReturnUrl();closePhotoModal();showView("profile")}
   );
   $("photoModalSave").textContent="Перейти в профиль";
   photoModalSubmit=async()=>{clearAuthReturnUrl();closePhotoModal();showView("profile")};
 }else{
   openPhotoModal("E-mail подтверждён",
     '<div class="notice"><b>Адрес подтверждён.</b><br>Вернитесь в профиль и запросите ссылку для входа на этот e-mail.</div>',
     async()=>{clearAuthReturnUrl();closePhotoModal();showView("profile")}
   );
   $("photoModalSave").textContent="Перейти ко входу";
   photoModalSubmit=async()=>{clearAuthReturnUrl();closePhotoModal();showView("profile")};
 }
}
let authSyncPromise=null;
let pendingProfile=null,consentRequired=false;
async function hydrateProfileFromSession(session,{render=true}={}){
 const nextUser=session?.user||null;
 user=nextUser;
 profile=null;
 pendingProfile=null;
 consentRequired=false;
 if(session?.access_token)sb.realtime.setAuth(session.access_token);
 if(nextUser){
   const [{data:p,error:pe},{data:consent,error:ce}]=await Promise.all([
     sb.from("profiles").select("display_name,role,is_active,access_blocked").eq("id",nextUser.id).maybeSingle(),
     sb.from("user_consents").select("accepted_at,withdrawn_at,consent_version").eq("user_id",nextUser.id).eq("consent_code",CONSENT_CODE).eq("consent_version",CONSENT_VERSION).maybeSingle()
   ]);
   if(!pe&&p){
     pendingProfile=p;
     const hasConsent=!ce&&!!consent&&!consent.withdrawn_at;
     const admittedActive=p.is_active&&!p.access_blocked;
     const adminActive=p.role==="admin"&&admittedActive;
     consentRequired=!hasConsent&&!adminActive;
     if(adminActive||(hasConsent&&admittedActive)){
       profile={...p,consentAcceptedAt:consent?.accepted_at||null};
     }
   }
 }
 if(render){
   renderProfile();
   if(profile){subscribeNotifications();if(activeViewId()==="chat")subscribe()}
 }
 return !!profile;
}
async function syncAuthState({render=true}={}){
 if(authSyncPromise)return authSyncPromise;
 authSyncPromise=(async()=>{
   const {data:{session}}=await sb.auth.getSession();
   return hydrateProfileFromSession(session,{render});
 })().finally(()=>{authSyncPromise=null});
 return authSyncPromise;
}
sb.auth.onAuthStateChange((event,session)=>{
 if(event==="PASSWORD_RECOVERY")setTimeout(()=>openNewPasswordForm(),0);
 if(["INITIAL_SESSION","SIGNED_IN","TOKEN_REFRESHED","USER_UPDATED","SIGNED_OUT"].includes(event)){
   setTimeout(()=>hydrateProfileFromSession(session,{render:true}).then(ok=>{
      if(!ok&&pendingProfile){showView("profile");return}
     if(ok){
        if(typeof trafficHeartbeat==="function")void trafficHeartbeat();
       const v=activeViewId();
       if(v==="home")loadHome();
       else if(v==="chat")loadRoom();
       else if(v==="people")loadPeople();
       else if(v==="stories")loadStories();
       else if(v==="photos")loadPhotos();
       else if(v==="city")loadCityEssays();
       else if(v==="questions")loadQuestions();
     }
   }),0);
 }
});
window.addEventListener("pageshow",()=>setTimeout(()=>syncAuthState({render:true}),0));
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")setTimeout(()=>syncAuthState({render:true}),0)});
let user=null,profile=null,currentRoom="general",unsubMsg=null,unsubReact=null,unsubRead=null,unsubNotif=null,replyTo=null,pendingFiles=[],chatLoadSeq=0,chatReloadTimer=null,chatLoadedLimit=80,photoAction=null,archiveReplaceId=null,photoModalSubmit=null,cityPhotoCursor=null,openStoryId=null,lastMessages=[],reactionRows=[],peopleCache=[],peopleLoadPromise=null,peopleGroup="10Б",storyIndex=[],classPhotoState=null,classPhotoLoadSeq=0,classPhotoStateCache=new Map(),selectedPersonId=null,showClassNumbers=false,questionCache=[],questionPriority="all",questionStatus="open",questionDiscussion=null,question10AVisual=null,mediaFocus=null,mediaCache=[],videoCache=[],mediaSigned={},photoFilter="all",photoMode="archive",visualTopicCache=[],visualCandidateCache=[],pendingVisualTopicId=null,storyCache=[],storyFilter="all",storyCoverUrls={},storyCoverMedia={},cityCache=[],cityTheme="all";
const rooms=[{id:"general",name:"Редколлегия"},{id:"photo",name:"Фотоархив"},{id:"tanin",name:"Танин Шанхай"},{id:"upk",name:"УПК"},{id:"10a",name:"10А"},{id:"10b",name:"10Б"}];
const $=id=>document.getElementById(id);
$("themeBtn").onclick=()=>{
 const current=getTheme();
 const next=THEME_MODES[(THEME_MODES.indexOf(current)+1)%THEME_MODES.length];
 localStorage.setItem(THEME_KEY,next);
 applyTheme(next);
};
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function literaryHtml(s){
 return esc(String(s??"")).replace(/\r\n|\r|\n/g,"<br>");
}
function cityMusicHtml(url,caption=""){
 url=String(url||"").trim();
 if(!url)return "";
 let src="",label=caption||"Музыка к этюду";
 try{
   const u=new URL(url);
   const host=u.hostname.replace(/^www\./,"");
   if(host==="youtu.be"){
     const id=u.pathname.split("/").filter(Boolean)[0];
     if(id)src="https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id);
   } else if(host==="youtube.com"||host==="m.youtube.com"){
     let id=u.searchParams.get("v");
     if(!id&&u.pathname.startsWith("/shorts/"))id=u.pathname.split("/")[2];
     if(!id&&u.pathname.startsWith("/embed/"))id=u.pathname.split("/")[2];
     if(id)src="https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id);
   } else if(host==="music.yandex.ru"){
     if(u.pathname.startsWith("/iframe/")) src="https://music.yandex.ru"+u.pathname+u.search;
     else {
       const m=u.pathname.match(/^\/album\/(\d+)\/track\/(\d+)/);
       if(m)src="https://music.yandex.ru/iframe/album/"+m[1]+"/track/"+m[2];
     }
   }
 }catch(e){}
 if(src){
   return '<div class="cityMusic"><div class="cityMusicTitle">'+esc(label)+'</div><iframe loading="lazy" height="152" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" src="'+esc(src)+'"></iframe></div>';
 }
 return '<div class="cityMusic"><div class="cityMusicTitle">'+esc(label)+'</div><a class="cityMusicLink" href="'+esc(url)+'" target="_blank" rel="noopener">Открыть музыку ↗</a></div>';
}
function cityEssayPhotoIds(body){
 return [...String(body||"").matchAll(/\[\[PHOTO:([A-Za-z0-9_-]+)\]\]/g)].map(m=>m[1]);
}
function cityEssayBodyHtml(body){
 const src=String(body||"");
 const re=/\[\[PHOTO:([A-Za-z0-9_-]+)\]\]/g;
 let out="",last=0,m;
 while((m=re.exec(src))){
   const textPart=src.slice(last,m.index);
   if(textPart)out+='<div class="cityEssayText">'+literaryHtml(textPart)+'</div>';
   const id=m[1];
   const media=mediaCache.find(x=>x.id===id);
   if(media&&mediaSigned[id]){
     const caption=media.title||id;
     out+='<figure class="cityInlinePhoto"><div class="cityInlinePhotoFrame"><img loading="lazy" decoding="async" src="'+esc(mediaSigned[id])+'" alt="'+esc(caption)+'"></div><figcaption>'+esc(caption)+'</figcaption></figure>';
   } else {
     out+='<div class="notice">Фото '+esc(id)+' пока недоступно.</div>';
   }
   last=re.lastIndex;
 }
 const tail=src.slice(last);
 if(tail)out+='<div class="cityEssayText">'+literaryHtml(tail)+'</div>';
 return out||'<div class="cityEssayText"></div>';
}
function insertCityPhotoMarker(){
 const ta=$("pfCityBody"),sel=$("pfCityPhotoSelect");
 if(!ta||!sel||!sel.value)return;
 const marker="[[PHOTO:"+sel.value+"]]";
 const start=ta.selectionStart??ta.value.length,end=ta.selectionEnd??start;
 const before=ta.value.slice(0,start),after=ta.value.slice(end);
 const prefix=before && !before.endsWith("\n")?"\n\n":"";
 const suffix=after && !after.startsWith("\n")?"\n\n":"";
 ta.value=before+prefix+marker+suffix+after;
 const pos=(before+prefix+marker).length;
 ta.focus();ta.setSelectionRange(pos,pos);
}

async function uploadCityInlinePhoto(file){
 if(!(profile?.role==="editor"||profile?.role==="admin"))throw new Error("Недостаточно прав.");
 const mime=ensureImageFile(file);
 if(file.size>10*1024*1024)throw new Error("Файл больше 10 МБ.");
 const title=($("pfCityNewPhotoTitle")?.value||"").trim()||String(file.name||"Фото").replace(/\.[^.]+$/,"");
 const source=($("pfCityNewPhotoSource")?.value||"").trim()||profile?.display_name||"";
 const id=await nextMediaId();

 const {error:ie}=await sb.from("archive_media").insert({
   id,
   title,
   category:"иллюстрация к этюду",
   archive_file:file.name,
   linked_story:null,
   data:{identification_status:"иллюстрация к этюду",people:[]},
   visibility:"members",
   quality_status:"оригинал",
   source_note:source
 });
 if(ie)throw ie;

 try{
   await uploadArchiveVersion(id,file,"оригинал","Загружено из редактора этюда",source);
 }catch(e){
   await sb.from("archive_media").delete().eq("id",id);
   throw e;
 }

 const {data:m}=await sb.from("archive_media")
   .select("id,title,category,linked_story,archive_file,current_storage_path,current_file_name,quality_status,source_note,data")
   .eq("id",id).maybeSingle();
 if(m){
   mediaCache=[...mediaCache.filter(x=>x.id!==id),m];
   if(m.current_storage_path)mediaSigned[id]=await archiveSignedImage(m.current_storage_path);
 }
 const sel=$("pfCityPhotoSelect");
 if(sel){
   const opt=document.createElement("option");
   opt.value=id; opt.textContent=id+" — "+title; opt.selected=true; sel.appendChild(opt);
 }
 const ta=$("pfCityBody");
 if(ta&&cityPhotoCursor!=null){
   ta.focus();
   ta.setSelectionRange(cityPhotoCursor,cityPhotoCursor);
 }
 insertCityPhotoMarker();
 cityPhotoCursor=null;
 if($("pfCityNewPhotoTitle"))$("pfCityNewPhotoTitle").value="";
 if($("pfCityNewPhotoSource"))$("pfCityNewPhotoSource").value="";
 return id;
}
function fmtCityCommentTime(v){
 try{return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(v))}
 catch(e){return ""}
}
function setStatus(t){$("status").textContent=t}
function closePhotoModal(){
 $("photoModal").classList.remove("open");
 if($("photoModalSave"))$("photoModalSave").textContent="Сохранить";
 $("photoModal").setAttribute("aria-hidden","true");
 $("photoModalMsg").textContent="";
 $("photoModalMsg").className="small";
 photoModalSubmit=null;
}
function openPhotoModal(title,html,onSave){
 $("photoModalTitle").textContent=title;
 $("photoModalBody").innerHTML=html;
 $("photoModalMsg").textContent="";
 $("photoModalMsg").className="small";
 photoModalSubmit=onSave;
 $("photoModal").classList.add("open");
 $("photoModal").setAttribute("aria-hidden","false");
}
$("photoModalClose").onclick=closePhotoModal;
$("photoModalCancel").onclick=closePhotoModal;
$("photoModal").onclick=e=>{if(e.target===$("photoModal"))closePhotoModal()};
$("photoModalSave").onclick=async()=>{
 if(!photoModalSubmit)return;
 $("photoModalSave").disabled=true;
 $("photoModalMsg").textContent="Сохраняю…";
 try{
   await photoModalSubmit();
   if($("photoModal").classList.contains("open"))closePhotoModal();
 } catch(e){
   $("photoModalMsg").textContent="Ошибка: "+(e.message||String(e));
   $("photoModalMsg").className="err";
 } finally{
   $("photoModalSave").disabled=false;
 }
};
async function archiveFormLookups(){
 const [{data:stories},{data:people}]=await Promise.all([
   sb.from("archive_stories").select("id,title").order("id"),
   sb.from("archive_people").select("id,canonical_name,group_name,number").order("group_name").order("number")
 ]);
 return {stories:stories||[],people:people||[]};
}
function storySelectHtml(stories,value=""){
 return '<select id="pfStory"><option value="">— без связи —</option>'+stories.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===value?"selected":"")+'>'+esc(s.id+" — "+s.title)+'</option>').join("")+'</select>';
}
function peopleChecksHtml(people,selected=[]){
 const set=new Set(selected||[]);
 return '<div class="checkGrid">'+people.map(p=>'<label class="checkItem"><input type="checkbox" data-pfperson value="'+esc(p.id)+'" '+(set.has(p.id)?"checked":"")+'><span>'+esc((p.group_name||"")+" "+(p.number||"")+" — "+p.canonical_name)+'</span></label>').join("")+'</div>';
}
function selectedPeople(){
 return [...document.querySelectorAll("[data-pfperson]:checked")].map(x=>x.value);
}
function qualitySelectHtml(value="копия"){
 const opts=["превью","копия","хороший скан","оригинал","реставрация"];
 return '<select id="pfQuality">'+opts.map(x=>'<option '+(x===value?"selected":"")+'>'+x+'</option>').join("")+'</select>';
}

let chatUnreadByRoom=new Map();
function setChatUnreadBadge(n){
 const chatNav=document.querySelector('.nav[data-view="chat"]');
 if(!chatNav)return;
 let badge=chatNav.querySelector(".chatUnreadBadge");
 if(!badge){badge=document.createElement("span");badge.className="chatUnreadBadge";chatNav.appendChild(badge)}
 const count=Math.max(0,Number(n)||0);
 badge.textContent=count>99?"99+":String(count);
 badge.style.display=count?"inline-flex":"none";
}
function updateRoomUnreadBadges(){
 document.querySelectorAll("#rooms .room[data-id]").forEach(btn=>{
   const count=Math.max(0,Number(chatUnreadByRoom.get(btn.dataset.id))||0);
   let badge=btn.querySelector(".roomUnreadBadge");
   if(count&&!badge){badge=document.createElement("span");badge.className="roomUnreadBadge";btn.appendChild(badge)}
   if(badge){badge.textContent=count>99?"99+":String(count);badge.style.display=count?"inline-flex":"none"}
 });
}
async function loadChatUnreadCount(){
 if(!user||!profile?.is_active){chatUnreadByRoom=new Map();setChatUnreadBadge(0);updateRoomUnreadBadges();return}
 const {data:msgs,error}=await sb.from("messages").select("id,author_id,room_id").neq("author_id",user.id);
 if(error)return;
 const ids=(msgs||[]).map(x=>x.id);
 if(!ids.length){chatUnreadByRoom=new Map();setChatUnreadBadge(0);updateRoomUnreadBadges();return}
 const {data:reads,error:re}=await sb.from("message_reads").select("message_id").eq("user_id",user.id).in("message_id",ids);
 if(re)return;
 const seen=new Set((reads||[]).map(x=>x.message_id));
 const byRoom=new Map();
 let total=0;
 (msgs||[]).forEach(m=>{
   if(seen.has(m.id))return;
   total++;
   byRoom.set(m.room_id,(byRoom.get(m.room_id)||0)+1);
 });
 chatUnreadByRoom=byRoom;
 setChatUnreadBadge(total);
 updateRoomUnreadBadges();
}
async function loadNotificationCount(){
 if(!user||!profile?.is_active){if($("notifyBtn"))$("notifyBtn").style.display="none";setChatUnreadBadge(0);return}
 $("notifyBtn").style.display="grid";
 const {count,error}=await sb.from("notifications").select("id",{count:"exact",head:true}).eq("is_read",false);
 if(error)return;
 const n=count||0;
 $("notifyBadge").textContent=n>99?"99+":String(n);
 $("notifyBadge").style.display=n?"block":"none";
}
async function openNotifications(){
 if(!user||!profile?.is_active)return;
 const {data,error}=await sb.from("notifications").select("*").order("created_at",{ascending:false}).limit(50);
 if(error){alert(error.message);return}
 const rows=data||[];
 const unreadIds=rows.filter(n=>!n.is_read).map(n=>n.id);
 if(unreadIds.length){
   const {error:ue}=await sb.from("notifications").update({is_read:true}).in("id",unreadIds);
   if(!ue)rows.forEach(n=>{if(unreadIds.includes(n.id))n.is_read=true});
 }
 await loadNotificationCount();
 openPhotoModal("Уведомления",
   '<div class="notificationActions"><button class="secondary" type="button" id="markAllNotifications">Отметить всё прочитанным</button><button class="secondary" type="button" id="deleteReadNotifications">Удалить прочитанные</button></div>'+
   '<div id="notificationList">'+(rows.map(n=>'<div class="notificationItem '+(!n.is_read?'unread':'')+'" data-notification-row="'+n.id+'">'+
     '<div class="notificationTitle">'+esc(n.title)+'</div>'+
     (n.body?'<div class="notificationBody">'+esc(n.body)+'</div>':'')+
     '<div class="small">'+new Date(n.created_at).toLocaleString("ru-RU")+'</div>'+
     '<div class="notificationActions"><button class="secondary" type="button" data-open-notification="'+n.id+'" data-kind="'+esc(n.kind||"")+'" data-etype="'+esc(n.entity_type||"")+'" data-eid="'+esc(n.entity_id||"")+'">Открыть</button><button class="secondary" type="button" data-delete-notification="'+n.id+'">Удалить</button></div></div>').join("")||'<div class="notice">Уведомлений нет.</div>')+'</div>',
   async()=>{}
 );
 $("photoModalSave").textContent="Закрыть";photoModalSubmit=async()=>closePhotoModal();
 $("markAllNotifications").onclick=async()=>{
   const {error:e}=await sb.from("notifications").update({is_read:true}).eq("is_read",false);
   if(e){alert(e.message);return}
   document.querySelectorAll(".notificationItem.unread").forEach(x=>x.classList.remove("unread"));
   await loadNotificationCount();
 };
 $("deleteReadNotifications").onclick=async()=>{
   const {error:e}=await sb.from("notifications").delete().eq("is_read",true);
   if(e){alert(e.message);return}
   await loadNotificationCount();await openNotifications();
 };
 document.querySelectorAll("[data-delete-notification]").forEach(b=>b.onclick=async()=>{
   const id=Number(b.dataset.deleteNotification);
   const {error:e}=await sb.from("notifications").delete().eq("id",id);
   if(e){alert(e.message);return}
   b.closest("[data-notification-row]")?.remove();
   await loadNotificationCount();
   if(!$("notificationList")?.children.length)$("notificationList").innerHTML='<div class="notice">Уведомлений нет.</div>';
 });
 document.querySelectorAll("[data-open-notification]").forEach(b=>b.onclick=async()=>{
   const id=Number(b.dataset.openNotification),kind=b.dataset.kind,type=b.dataset.etype,eid=b.dataset.eid;
   await sb.from("notifications").update({is_read:true}).eq("id",id);
   await loadNotificationCount();closePhotoModal();
   if(type==="message"){
     const {data:m}=await sb.from("messages").select("room_id").eq("id",eid).maybeSingle();
      if(m?.room_id){currentRoom=m.room_id;renderRooms();await showView("chat");await new Promise(r=>requestAnimationFrame(()=>r()));document.querySelector('.bubble[data-mid="'+CSS.escape(eid)+'"]')?.scrollIntoView({behavior:"smooth",block:"center"})}
   }else if(type==="city_essay"){
      await showView("city");await openCityEssay(eid);
   }else if(type==="person"&&kind==="identity_suggestion"){
      await showView("profile");
      await loadIdentityReview();openProfileBox("identityReviewBox");
   }else if(type==="person"){
     await activateTag(eid);
   }else if(type==="photo_submission"){
     const {data:sub}=await sb.from("photo_submissions").select("id,status,media_id").eq("id",eid).maybeSingle();
     if(sub?.status==="pending"&&(profile?.role==="editor"||profile?.role==="admin")){
        await showView("profile");
        await loadPhotoSubmissionReview();openProfileBox("photoSubmissionReviewBox");await new Promise(r=>requestAnimationFrame(()=>r()));document.querySelector('[data-photo-submission-id="'+CSS.escape(eid)+'"]')?.scrollIntoView({behavior:"smooth",block:"center"});
     }else if(sub?.status==="accepted"&&sub.media_id){
        mediaFocus=sub.media_id;await showView("photos");await openArchivePhoto(sub.media_id);
     }else{
        await showView("profile");openProfileBox("profileEditorialSection");
     }
   }else if(type==="access_candidate"){
      await showView("profile");
      await loadAdminUsers();
      openProfileBox("adminUsersBox");
   }else if(type==="moderation_report"){
      await showView("profile");openProfileBox("moderationBox");
   }
 });
}
function openProfileBox(id){
 const el=$(id);if(!el)return;
 const section=el.matches("[data-profile-section-pane]")?el:el.closest("[data-profile-section-pane]");
 const subpane=el.closest("[data-profile-pane]");
 const sectionKey=section?.dataset.profileSectionPane;
 const paneKey=subpane?.dataset.profilePane;
 if(sectionKey)activateProfileSection(sectionKey,{pane:paneKey,load:true});
 setTimeout(()=>el.scrollIntoView({behavior:"smooth",block:"start"}),60);
}
function showChatToast(n){
 let t=document.getElementById("chatNewToast");
 if(!t){t=document.createElement("button");t.id="chatNewToast";t.className="chatNewToast";document.body.appendChild(t)}
 t.innerHTML='<b>'+esc(n.title||"Новое сообщение")+'</b><span>'+esc((n.body||"").slice(0,120))+'</span>';
 t.onclick=()=>{t.classList.remove("show");showView("chat")};
 requestAnimationFrame(()=>t.classList.add("show"));
 clearTimeout(window.__chatToastTimer);window.__chatToastTimer=setTimeout(()=>t.classList.remove("show"),7000);
}
async function enableBrowserChatNotifications(){
 if(!("Notification" in window))return;
 if(Notification.permission==="default"){
   try{await Notification.requestPermission()}catch{}
 }
}
function subscribeNotifications(){
 if(unsubNotif){unsubNotif();unsubNotif=null}
 if(!user||!profile?.is_active)return;
 const ch=sb.channel("notifications-"+user.id+"-"+Date.now())
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"user_id=eq."+user.id},payload=>{
      loadNotificationCount();
      const n=payload.new||{};
      if(n.entity_type==="message"){loadChatUnreadCount();
        if(document.hidden&&"Notification" in window&&Notification.permission==="granted"){
          new Notification(n.title||"Новое сообщение в «Хрониках-78»",{body:n.body||"Откройте чат, чтобы прочитать."});
        }else if(activeViewId()!=="chat"){
          showChatToast(n);
        }
      }
    })
   .subscribe();
 unsubNotif=()=>sb.removeChannel(ch);
 loadNotificationCount();
 loadChatUnreadCount();
}
$("notifyBtn").onclick=openNotifications;

let contextActionHandlers={};
function closeContextSheet(){
 const sh=$("contextShade");if(!sh)return;
 sh.classList.remove("open");sh.setAttribute("aria-hidden","true");
 contextActionHandlers={};
}
function openContextSheet({eyebrow="",title="",meta="",preview="",actions=[]}){
 $("contextEyebrow").textContent=eyebrow||"";
 $("contextTitle").textContent=title||"";
 $("contextMeta").textContent=meta||"";
 $("contextPreview").innerHTML=preview||"";
 contextActionHandlers={};
 $("contextActions").innerHTML=actions.filter(Boolean).map((a,i)=>{
   const key="ctx"+i;contextActionHandlers[key]=a.run;
   return '<button class="contextAction '+esc(a.kind||"")+'" data-context-action="'+key+'">'+
     '<span class="contextActionIcon">'+esc(a.icon||"•")+'</span><span class="contextActionText">'+esc(a.label||"Действие")+
     (a.hint?'<div class="contextActionHint">'+esc(a.hint)+'</div>':'')+'</span></button>';
 }).join("");
 $("contextActions").querySelectorAll("[data-context-action]").forEach(b=>b.onclick=async()=>{
   const fn=contextActionHandlers[b.dataset.contextAction];
   closeContextSheet();
   if(fn)await fn();
 });
 $("contextShade").classList.add("open");$("contextShade").setAttribute("aria-hidden","false");
}
$("contextClose").onclick=closeContextSheet;
$("contextShade").onclick=e=>{if(e.target===$("contextShade"))closeContextSheet()};
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeContextSheet()});

function closeMoreNav(){
 $("moreNavMenu")?.classList.remove("open");
 $("moreNavShade")?.classList.remove("open");
 $("moreNavMenu")?.setAttribute("aria-hidden","true");
 $("moreNavShade")?.setAttribute("aria-hidden","true");
 $("mobileMoreBtn")?.setAttribute("aria-expanded","false");
}
function openMoreNav(){
 $("moreNavMenu")?.classList.add("open");
 $("moreNavShade")?.classList.add("open");
 $("moreNavMenu")?.setAttribute("aria-hidden","false");
 $("moreNavShade")?.setAttribute("aria-hidden","false");
 $("mobileMoreBtn")?.setAttribute("aria-expanded","true");
}
function activeViewId(){
 return document.querySelector(".view.active")?.id||"home";
}
let appNavTrail=[];
let appNavRestoring=false;
let appNavEnabled=false;
function navStateSignature(state){
 try{return JSON.stringify({
  view:state?.view||null,storyOpen:!!state?.storyOpen,storyId:state?.storyId||null,
  peopleGroup:state?.peopleGroup||null,selectedPersonId:state?.selectedPersonId||null,
  storyFilter:state?.storyFilter||null,photoFilter:state?.photoFilter||null,mediaFocus:state?.mediaFocus||null,
  cityTheme:state?.cityTheme||null,questionPriority:state?.questionPriority||null,questionStatus:state?.questionStatus||null
 })}catch(e){return ""}
}
function pushAppNavState(){
 const state=captureNavState();
 if(!state?.view)return;
 const sig=navStateSignature(state),last=appNavTrail.at(-1);
 if(last&&navStateSignature(last)===sig)return;
 appNavTrail.push(state);
 if(appNavTrail.length>30)appNavTrail.shift();
}
function captureNavState(){
 return {
   view:activeViewId(),
   scrollY:window.scrollY||0,
   storyOpen:$("storyDetail")?.classList.contains("open")||false,
   storyId:openStoryId,
   storyScroll:$("storyDetail")?.scrollTop||0,
   peopleGroup,selectedPersonId,storyFilter,photoFilter,mediaFocus,cityTheme,
   questionPriority,questionStatus
 };
}
function syncHistoryEntry(){
 try{history.replaceState({chronicles78:true,nav:captureNavState()},document.title,location.href)}catch(e){}
}
function updateContextBack(){
 const tagged=!!history.state?.chronicles78Tag;
 const storyOpen=!!$("storyDetail")?.classList.contains("open");
 const hasTrail=appNavTrail.length>0;
 const btn=$("contextBackBtn");
 if(btn){
  btn.classList.toggle("show",tagged||storyOpen||hasTrail);
  btn.textContent=storyOpen?"← К историям":"← Назад";
 }
}
async function navigateFromTag(targetState,runner){
 syncHistoryEntry();
 try{
   history.pushState({chronicles78:true,chronicles78Tag:true,nav:targetState},document.title,location.href);
 }catch(e){}
 const wasRestoring=appNavRestoring;appNavRestoring=true;
 try{await runner()}finally{appNavRestoring=wasRestoring}
 updateContextBack();
}
async function restoreNavState(state){
 if(!state)return;
 peopleGroup=state.peopleGroup||peopleGroup;
 selectedPersonId=state.selectedPersonId??null;
 storyFilter=state.storyFilter||storyFilter;
 photoFilter=state.photoFilter||photoFilter;
 mediaFocus=state.mediaFocus??null;
 cityTheme=state.cityTheme||cityTheme;
 questionPriority=state.questionPriority||questionPriority;
 questionStatus=state.questionStatus||questionStatus;
 await showView(state.view||"home",{track:false});
 if(state.storyOpen&&state.storyId){
   await openStory(state.storyId);
   await new Promise(r=>requestAnimationFrame(()=>r()));
   if($("storyDetail"))$("storyDetail").scrollTop=state.storyScroll||0;
 }else{
   await new Promise(r=>requestAnimationFrame(()=>r()));
   window.scrollTo({top:state.scrollY||0,left:0,behavior:"auto"});
 }
}
window.addEventListener("popstate",async e=>{
 closePhotoModal();
 closeMoreNav();
 appNavRestoring=true;
 try{await restoreNavState(e.state?.nav||{view:"home",scrollY:0})}
 finally{appNavRestoring=false}
 updateContextBack();
});
setTimeout(()=>{syncHistoryEntry();updateContextBack()},0);
function showView(v,{track=true}={}){
 if(!v)return Promise.resolve(false);
 const current=activeViewId();
 if(appNavEnabled&&track&&!appNavRestoring&&current&&current!==v)pushAppNavState();
 closeMoreNav();
 if($("storyDetail")?.classList.contains("open")){$("storyDetail").classList.remove("open");openStoryId=null;}
 document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id===v));
 document.querySelectorAll(".nav[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
 const secondary=["photos","city","questions","profile"].includes(v);
 $("mobileMoreBtn")?.classList.toggle("active",secondary);

 let ready=Promise.resolve(true);
 if(v==="home")ready=Promise.resolve(loadHome());
 else if(v==="chat"&&user&&profile?.is_active)ready=Promise.resolve(loadRoom());
 else if(v==="people")ready=Promise.resolve(loadPeople());
 else if(v==="stories")ready=Promise.resolve(loadStories());
 else if(v==="photos")ready=Promise.resolve(loadPhotos());
 else if(v==="city")ready=Promise.resolve(loadCityEssays());
 else if(v==="questions")ready=Promise.resolve(loadQuestions());
 else if(v==="profile"&&user&&profile?.is_active){
   ready=Promise.resolve(true);
 }
 if(typeof trackSiteView==="function")trackSiteView(v);
 updateContextBack();
 return Promise.resolve(ready).then(()=>true).catch(e=>{console.warn("view load failed",v,e);return false});
}
document.querySelectorAll(".nav[data-view]").forEach(b=>b.onclick=()=>{if(b.dataset.view==="chat")enableBrowserChatNotifications();showView(b.dataset.view)});
$("mobileMoreBtn").onclick=()=>{
 const isOpen=$("moreNavMenu").classList.contains("open");
 isOpen?closeMoreNav():openMoreNav();
};
$("moreNavClose").onclick=closeMoreNav;
$("moreNavShade").onclick=closeMoreNav;
document.querySelectorAll("[data-more-view]").forEach(b=>b.onclick=()=>showView(b.dataset.moreView));
$("contextBackBtn").onclick=async()=>{
 if($("storyDetail")?.classList.contains("open")){
  $("storyDetail").classList.remove("open");openStoryId=null;updateContextBack();return;
 }
 if(history.state?.chronicles78Tag){history.back();return}
 const prev=appNavTrail.pop();
 if(prev){
  appNavRestoring=true;
  try{await restoreNavState(prev)}finally{appNavRestoring=false}
  updateContextBack();
  return;
 }
 showView("home",{track:false});
};
function closeOverflowMenus(except=null){
 document.querySelectorAll("details.overflowMenu[open]").forEach(d=>{if(d!==except)d.removeAttribute("open")});
}
document.addEventListener("click",e=>{
 const menu=e.target.closest("details.overflowMenu");
 if(!menu)closeOverflowMenus();
 else document.querySelectorAll("details.overflowMenu[open]").forEach(d=>{if(d!==menu)d.removeAttribute("open")});
});
function closeChatMenus(){
 document.querySelectorAll("details.footMenu[open]").forEach(d=>d.removeAttribute("open"));
}
document.addEventListener("click",e=>{if(!e.target.closest("details.footMenu"))closeChatMenus()});
async function activateTag(tag){
 tag=String(tag||"").trim();
 if(!tag)return;

 // Direct entity links.
 if(/^S-\d+$/i.test(tag)){
   await navigateFromTag({view:"stories",scrollY:0,storyOpen:true,storyId:tag,storyScroll:0},async()=>{
     await showView("stories");
     await openStory(tag);
   });
   return;
 }
 if(/^MEDIA-\d+$/i.test(tag)){
   await navigateFromTag({view:"photos",scrollY:0,storyOpen:false,mediaFocus:tag},async()=>{
     mediaFocus=tag;
     await showView("photos");
     await openArchivePhoto(tag);
   });
   return;
 }
 if(/^10[ABАБ]-\d+$/i.test(tag)){
   let p=peopleCache.find(x=>x.id.toLowerCase()===tag.toLowerCase());
   if(!p){
     const {data}=await sb.from("archive_people").select("id,group_name,number,canonical_name,person_role,aliases,data,identification_status,identification_note").eq("id",tag).maybeSingle();
     p=data||null;
   }
   const inferred=/^10A-/i.test(tag)?"10А":/^10B-/i.test(tag)?"10Б":null;
   const targetGroup=p?.group_name||inferred||peopleGroup;
   const targetId=p?.id||tag;
   await navigateFromTag({view:"people",scrollY:0,storyOpen:false,peopleGroup:targetGroup,selectedPersonId:targetId},async()=>{
     peopleGroup=targetGroup;
     selectedPersonId=targetId;
     showClassNumbers=false;
     document.querySelectorAll("[data-pgroup]").forEach(x=>x.classList.toggle("on",x.dataset.pgroup===targetGroup));
     await showView("people");
     await loadClassPhoto();
     renderPeople();
     await new Promise(r=>requestAnimationFrame(()=>r()));
     document.querySelector('[data-person-id="'+CSS.escape(targetId)+'"]')?.scrollIntoView({behavior:"smooth",block:"center"});
   });
   return;
 }
 if(tag==="10А"||tag==="10Б"){
   await navigateFromTag({view:"people",scrollY:0,storyOpen:false,peopleGroup:tag,selectedPersonId:null},async()=>{
     peopleGroup=tag;selectedPersonId=null;
     await showView("people");
     document.querySelectorAll("[data-pgroup]").forEach(x=>x.classList.toggle("on",x.dataset.pgroup===tag));
     await loadClassPhoto();renderPeople();
   });
   return;
 }

 // Cross-archive tag search.
 const [stories,questions,editorial,media,people]=await Promise.all([
   sb.from("archive_stories").select("id,title,kind,period,data"),
   sb.from("archive_questions").select("id,question,category,tags,links"),
   sb.from("editorial_questions").select("id,question,tags,linked_entity_type,linked_entity_id"),
   sb.from("archive_media").select("id,title,category,linked_story,quality_status,data"),
   sb.from("archive_people").select("id,canonical_name,group_name,person_role,aliases,data")
 ]);
 const needle=tag.toLowerCase();
 const contains=v=>JSON.stringify(v??"").toLowerCase().includes(needle);
 const sr=(stories.data||[]).filter(contains);
 const qr=[...(questions.data||[]).map(x=>({...x,src:"archive"})),...(editorial.data||[]).map(x=>({...x,src:"chat"}))].filter(contains);
 const mr=(media.data||[]).filter(contains);
 const pr=(people.data||[]).filter(contains);

 openPhotoModal("Тег: "+tag,
   '<div class="notice">Найдено: истории '+sr.length+' · вопросы '+qr.length+' · фото '+mr.length+' · люди '+pr.length+'</div>'+
   (sr.length?'<label>Истории</label>'+sr.slice(0,20).map(x=>'<button class="secondary" type="button" data-tag-story="'+esc(x.id)+'">'+esc(x.id+" — "+x.title)+'</button>').join(""):"")+
   (qr.length?'<label>Вопросы</label>'+qr.slice(0,20).map(x=>'<button class="secondary" type="button" data-tag-question="'+esc(x.id)+'">'+esc(x.question)+'</button>').join(""):"")+
   (mr.length?'<label>Фото</label>'+mr.slice(0,20).map(x=>'<button class="secondary" type="button" data-tag-media="'+esc(x.id)+'">'+esc(x.id+" — "+x.title)+'</button>').join(""):"")+
   (pr.length?'<label>Люди</label>'+pr.slice(0,20).map(x=>'<button class="secondary" type="button" data-tag-person="'+esc(x.id)+'">'+esc(x.canonical_name)+'</button>').join(""):"")+
   (!sr.length&&!qr.length&&!mr.length&&!pr.length?'<div class="notice">Связанных материалов пока не найдено.</div>':""),
   async()=>{}
 );
 $("photoModalSave").textContent="Закрыть";
 photoModalSubmit=async()=>closePhotoModal();

 document.querySelectorAll("[data-tag-story]").forEach(b=>b.onclick=()=>{
   const id=b.dataset.tagStory;closePhotoModal();
   navigateFromTag({view:"stories",scrollY:0,storyOpen:true,storyId:id,storyScroll:0},async()=>{await showView("stories");await openStory(id)});
 });
 document.querySelectorAll("[data-tag-media]").forEach(b=>b.onclick=()=>{
   const id=b.dataset.tagMedia;closePhotoModal();
   navigateFromTag({view:"photos",scrollY:0,storyOpen:false,mediaFocus:id},async()=>{mediaFocus=id;await showView("photos");await openArchivePhoto(id)});
 });
 document.querySelectorAll("[data-tag-person]").forEach(b=>b.onclick=async()=>{
   const id=b.dataset.tagPerson;
   let p=peopleCache.find(x=>x.id===id);
   if(!p){
     const {data}=await sb.from("archive_people").select("id,group_name,number,canonical_name,person_role,aliases,data,identification_status,identification_note").eq("id",id).maybeSingle();
     p=data||null;
   }
   closePhotoModal();
   const targetGroup=p?.group_name||peopleGroup;
   navigateFromTag({view:"people",scrollY:0,storyOpen:false,peopleGroup:targetGroup,selectedPersonId:p?.id||id},async()=>{
     peopleGroup=targetGroup;
     selectedPersonId=p?.id||id;
     showClassNumbers=false;
     document.querySelectorAll("[data-pgroup]").forEach(x=>x.classList.toggle("on",x.dataset.pgroup===targetGroup));
     await showView("people");
     await loadClassPhoto();
     renderPeople();
   });
 });
 document.querySelectorAll("[data-tag-question]").forEach(b=>b.onclick=()=>{
   const label=b.textContent.trim();closePhotoModal();
   navigateFromTag({view:"questions",scrollY:0,storyOpen:false},async()=>{await showView("questions");await new Promise(r=>requestAnimationFrame(()=>r()));const card=[...document.querySelectorAll("#questionsList .archiveCard")].find(x=>x.textContent.includes(label));card?.scrollIntoView({behavior:"smooth",block:"center"})});
 });
}
document.addEventListener("click",e=>{
 const t=e.target.closest("[data-tag]");
 if(!t)return;
 e.preventDefault();e.stopPropagation();
 activateTag(t.dataset.tag);
});


function reportContent(entityType,entityId){
 openPhotoModal("Пожаловаться",
   '<div class="notice">Жалоба уйдёт редактору. Укажите, что именно не так с публикацией.</div>'+
   '<label>Причина</label><select id="pfReportReason"><option>Оскорбление или ругань</option><option>Ненормативная лексика</option><option>Личная информация</option><option>Спам</option><option>Другое</option></select>'+
   '<label>Комментарий</label><textarea id="pfReportNote" placeholder="Коротко поясните проблему"></textarea>',
   async()=>{
     const reason=$("pfReportReason").value+($("pfReportNote").value.trim()?" — "+$("pfReportNote").value.trim():"");
     const {error}=await sb.from("moderation_reports").insert({reporter_id:user.id,entity_type:entityType,entity_id:String(entityId),reason});
     if(error)throw error;
     $("photoModalBody").innerHTML='<div class="notice"><b>Жалоба отправлена.</b><br>Редактор увидит её в панели модерации.</div>';
     $("photoModalSave").textContent="Закрыть";photoModalSubmit=async()=>closePhotoModal();
   }
 );
}

function renderRooms(){
 $("rooms").innerHTML=rooms.map(r=>{
   const n=Math.max(0,Number(chatUnreadByRoom.get(r.id))||0);
   return '<button class="room '+(r.id===currentRoom?"active":"")+'" data-id="'+r.id+'"><span>'+esc(r.name)+'</span>'+(n?'<span class="roomUnreadBadge">'+(n>99?"99+":n)+'</span>':'')+'</button>';
 }).join("");
 $("rooms").querySelectorAll(".room").forEach(b=>b.onclick=()=>{currentRoom=b.dataset.id;chatLoadedLimit=80;replyTo=null;pendingFiles=[];renderReply();renderRooms();loadRoom();subscribe()})
}
async function loadHome(){
 const box=$("homeDashboard");
 if(!box)return;

 const bindHome=()=>{
   document.querySelectorAll("[data-home-view]").forEach(b=>b.onclick=()=>showView(b.dataset.homeView));
   box.querySelectorAll("[data-home-story]").forEach(b=>b.onclick=async()=>{await showView("stories");await openStory(b.dataset.homeStory)});
   box.querySelectorAll("[data-home-photo]").forEach(b=>b.onclick=async()=>{mediaFocus=b.dataset.homePhoto;await showView("photos");await openArchivePhoto(b.dataset.homePhoto)});
   box.querySelectorAll("[data-home-questions10a]").forEach(b=>b.onclick=()=>{questionPriority="P1";questionStatus="open";showView("questions")});
 };

 const setMosaicImage=(id,url,alt="")=>{
   const img=$(id);if(!img)return;
   if(url){img.src=url;img.alt=alt;img.hidden=false}
   else{img.removeAttribute("src");img.alt="";img.hidden=true}
 };

 document.querySelectorAll("[data-home-view]").forEach(b=>b.onclick=()=>showView(b.dataset.homeView));

 if(!user||!profile?.is_active){
   ["homeMosaicClass","homeMosaicPhotoA","homeMosaicPhotoB","homeMosaicPhotoC"].forEach(id=>setMosaicImage(id,null));
   const pending=!!(user&&pendingProfile);
   const admitted=!!(pendingProfile?.is_active&&!pendingProfile?.access_blocked);
   const blocked=!!pendingProfile?.access_blocked;
   const pendingStatus=blocked
     ?"Доступ к архиву сейчас закрыт. Подробности — в Профиле."
     :(consentRequired&&admitted
       ?"Доступ уже одобрен. Осталось подтвердить действующее согласие."
       :(consentRequired
         ?"Вход выполнен. Подтвердите согласие, чтобы продолжить оформление доступа."
         :(pending
           ?"Заявка на доступ зарегистрирована и ожидает решения администратора."
           :"Закрытый архив класса · материалы открываются после входа.")));
   const actionText=pending?(consentRequired?"Продолжить оформление доступа":"Открыть профиль"):"Войти в архив";
   $("homeState").textContent=pendingStatus;
   box.innerHTML=
     '<div class="homeGatewayGrid public">'+
       '<button class="homeGatewayCard" data-home-view="people"><div class="homeGatewayArt peopleArt"><span>10Б</span></div><div class="homeGatewayBody"><small>01 · ЛИЦА</small><h2>Люди</h2><p>Имена, лица и связи между воспоминаниями.</p><b>Открыть после входа →</b></div></button>'+
       '<button class="homeGatewayCard" data-home-view="stories"><div class="homeGatewayArt storyArt"><span>1983</span></div><div class="homeGatewayBody"><small>02 · ПАМЯТЬ</small><h2>Истории</h2><p>Эпизоды, голоса и маленькие подробности большой жизни.</p><b>Открыть после входа →</b></div></button>'+
       '<button class="homeGatewayCard" data-home-view="city"><div class="homeGatewayArt cityArt"><span>КБШ</span></div><div class="homeGatewayBody"><small>03 · МЕСТО</small><h2>Город и время</h2><p>Куйбышев как фон, который тоже стал частью памяти.</p><b>Открыть после входа →</b></div></button>'+
     '</div>'+
     '<div class="memoryArchiveNote"><b>'+(pending?"Ваш вход сохранён.":"Архив закрытый.")+'</b> '+esc(pendingStatus)+'</div>'+
     '<div class="homeActions"><button class="primary homeLoginAction" data-home-view="profile">'+esc(actionText)+'</button></div>';
   bindHome();return;
 }

 $("homeState").textContent="Архив открыт · "+profile.display_name;
 if(typeof initHomeEraTv==="function")void initHomeEraTv();
 box.innerHTML='<div class="homeLoadingLine">Собираю сегодняшнюю страницу архива…</div>';

 const featuredIds=["MEDIA-045","MEDIA-013","MEDIA-012"];
 const [stories,questions,people,media,messages,classPhoto,cityEssays,featuredMedia]=await Promise.all([
   sb.from("archive_stories").select("id,title,period,kind,full_chapter,data,updated_at").order("updated_at",{ascending:false}).limit(80),
   sb.from("archive_questions").select("id,question,status,priority,tags,links,updated_at").order("updated_at",{ascending:false}).limit(80),
   sb.from("archive_people").select("id,group_name,number,canonical_name,identification_status").order("number"),
   sb.from("archive_media").select("id,title,linked_story,quality_status,data,current_storage_path,updated_at").order("updated_at",{ascending:false}).limit(40),
   sb.from("messages").select("id,body,created_at,room_id,author_id,author:profiles!messages_author_id_fkey(display_name)").order("created_at",{ascending:false}).limit(8),
   sb.from("class_photos").select("id,title,storage_path").eq("id","CLASS-10B").maybeSingle(),
   sb.from("city_essays").select("id,title,body,period,source_status,updated_at").not("body","is",null).order("updated_at",{ascending:false}).limit(12),
   sb.from("archive_media").select("id,title,current_storage_path,data").in("id",featuredIds)
 ]);

 const sr=stories.data||[],qr=questions.data||[],pr=people.data||[],mr=media.data||[],msgs=messages.data||[],ce=cityEssays.data||[];
 const openQ=qr.filter(q=>questionIsOpen(q));
 const unknown10A=pr.filter(p=>p.group_name==="10А"&&p.identification_status!=="подтверждено");
 const needPhoto=mr.filter(photoNeedsClarification);
 const ready=sr.filter(s=>s.data?.catalog_status==="готово к чтению");
 const lead=[...ready].sort((a,b)=>(a.data?.catalog_order??99)-(b.data?.catalog_order??99))[0]||sr[0];
 const roomName=id=>rooms.find(r=>r.id===id)?.name||id;
 const leadSummary=lead?.data?.editorial_summary||lead?.data?.chapter?.subtitle||"";
 const albumPhoto=mr.find(m=>m.current_storage_path)||null;
 const storyPhoto=lead?mr.find(m=>m.linked_story===lead.id&&m.current_storage_path):null;

 const featuredById=new Map((featuredMedia.data||[]).map(x=>[x.id,x]));
 const featuredRows=featuredIds.map(id=>featuredById.get(id)).filter(Boolean);

 let classUrl=null,albumUrl=null,storyUrl=null;
 if(classPhoto.data?.storage_path)classUrl=await archiveSignedImage(classPhoto.data.storage_path);
 if(albumPhoto?.current_storage_path)albumUrl=await archiveSignedImage(albumPhoto.current_storage_path);
 if(storyPhoto?.current_storage_path)storyUrl=await archiveSignedImage(storyPhoto.current_storage_path);
 const featuredUrls=await Promise.all(featuredRows.map(async m=>m.current_storage_path?await archiveSignedImage(m.current_storage_path):null));

 setMosaicImage("homeMosaicClass",classUrl,classPhoto.data?.title||"Классная фотография");
 setMosaicImage("homeMosaicPhotoA",featuredUrls[0]||albumUrl,featuredRows[0]?.title||albumPhoto?.title||"Архивная фотография");
 setMosaicImage("homeMosaicPhotoB",featuredUrls[1]||storyUrl||albumUrl,featuredRows[1]?.title||storyPhoto?.title||"Архивная фотография");
 setMosaicImage("homeMosaicPhotoC",featuredUrls[2]||albumUrl,featuredRows[2]?.title||albumPhoto?.title||"Архивная фотография");

 let quoteText="",quoteBy="";
 const qEssay=ce.find(x=>x.id==="G-007")||ce[0];
 if(qEssay?.body){
   const paras=String(qEssay.body).split(/\n+/).map(x=>x.trim()).filter(x=>x.length>35&&x.length<180);
   quoteText=paras.find(x=>/[.!?]$/.test(x))||paras[0]||"";
   quoteBy=qEssay.title+(qEssay.period?" · "+qEssay.period:"");
 }

 const usedHomeImages=new Set();
 const uniqueHomeImage=(...urls)=>{
   for(const url of urls){if(url&&!usedHomeImages.has(url)){usedHomeImages.add(url);return url}}
   return "";
 };
 const peopleThumb=uniqueHomeImage(classUrl,featuredUrls[0],albumUrl);
 const storiesThumb=uniqueHomeImage(storyUrl,featuredUrls[1],featuredUrls[0],albumUrl);
 const cityThumb=uniqueHomeImage(featuredUrls[2],featuredUrls[0],albumUrl);
 const editor=profile.role==="editor"||profile.role==="admin";
 const latestPhoto=mr.find(m=>m.current_storage_path&&![
   classPhoto.data?.storage_path,
   storyPhoto?.current_storage_path,
   ...featuredRows.map(x=>x.current_storage_path)
 ].includes(m.current_storage_path))||mr.find(m=>m.current_storage_path)||null;
 const latestPhotoUrl=latestPhoto?.current_storage_path?await archiveSignedImage(latestPhoto.current_storage_path):null;
 const freshPhotoThumb=uniqueHomeImage(latestPhotoUrl);

 const gatewayImg=(url,alt)=>url?'<img src="'+url+'" alt="'+esc(alt||"")+'">':'<div class="homeGatewayPlaceholder"></div>';

 box.innerHTML=
   '<div class="homeGatewayGrid">'+
     '<button class="homeGatewayCard" data-home-view="people">'+
       '<div class="homeGatewayImage">'+gatewayImg(peopleThumb,"Люди нашего класса")+'</div>'+
       '<div class="homeGatewayBody"><small>01 · ЛИЦА</small><h2>Люди</h2><p><b>'+pr.length+' человек.</b><br>Имена, лица, связи.</p><strong>Открыть класс →</strong></div>'+
     '</button>'+
     '<button class="homeGatewayCard" data-home-view="stories">'+
       '<div class="homeGatewayImage">'+gatewayImg(storiesThumb,lead?.title||"Истории класса")+'</div>'+
       '<div class="homeGatewayBody"><small>02 · ПАМЯТЬ</small><h2>Истории</h2><p><b>'+sr.length+' историй.</b><br>Воспоминания, эпизоды, большие и маленькие.</p><strong>Читать →</strong></div>'+
     '</button>'+
     '<button class="homeGatewayCard" data-home-view="city">'+
       '<div class="homeGatewayImage">'+gatewayImg(cityThumb,"Куйбышев нашего времени")+'</div>'+
       '<div class="homeGatewayBody"><small>03 · МЕСТО</small><h2>Город и время</h2><p><b>Куйбышев.</b><br>Места, события, люди, хроника нашей юности.</p><strong>Исследовать →</strong></div>'+
     '</button>'+
   '</div>'+

   '<section class="homeStoryWeek">'+
     '<div class="homeSectionHead"><h2>История недели</h2><button class="textLink" data-home-view="stories">Смотреть все истории →</button></div>'+
     '<div class="homeStoryWeekGrid">'+
       '<div class="homeStoryVisual">'+(storyUrl||storiesThumb?'<img src="'+(storyUrl||storiesThumb)+'" alt="'+esc(lead?.title||"История недели")+'">':'<div class="homeStoryPlaceholder">1983</div>')+'</div>'+
       '<div class="homeStoryCopy">'+
         '<div class="memoryEyebrow">ИЗ ЖИВОГО АРХИВА</div>'+
         '<h3>'+esc(lead?.title||"История ещё выбирается")+'</h3>'+
         '<p>'+esc((leadSummary||"История, в которой одна деталь неожиданно возвращает целую эпоху.").slice(0,330))+'</p>'+
         (lead?'<button class="memoryPrimary" data-home-story="'+esc(lead.id)+'">Читать историю <span>→</span></button>':'')+
       '</div>'+
       '<blockquote class="homeStoryQuote"><span>“</span><p>'+esc(quoteText||"Одна знакомая деталь — и прошлое снова становится почти настоящим.")+'</p><cite>'+esc(quoteBy||"Из наших воспоминаний")+'</cite></blockquote>'+
     '</div>'+
   '</section>'+

   '<section class="homeArchiveFresh">'+
     '<div class="homeSectionHead"><h2>Что нового в архиве</h2><button class="textLink" data-home-view="photos">Открыть весь архив →</button></div>'+
     '<div class="homeFreshGrid">'+
       '<button class="homeFreshCard" data-home-view="photos">'+
         (latestPhoto&&freshPhotoThumb?'<img src="'+freshPhotoThumb+'" alt="'+esc(latestPhoto.title||"Новые фотографии")+'">':'<div class="homeFreshPlaceholder">▧</div>')+
         '<div><small>НОВЫЕ ФОТОГРАФИИ</small><b>'+esc(latestPhoto?.title||"Фотоархив пополняется")+'</b><span>Открыть фотоархив →</span></div>'+
       '</button>'+
       (lead?'<button class="homeFreshCard" data-home-story="'+esc(lead.id)+'">'+
         (storiesThumb?'<img src="'+storiesThumb+'" alt="'+esc(lead.title)+'">':'<div class="homeFreshPlaceholder">✎</div>')+
         '<div><small>ИСТОРИЯ</small><b>'+esc(lead.title)+'</b><span>Читать →</span></div>'+
       '</button>':'')+
       (msgs.length?'<button class="homeFreshCard" data-home-view="chat">'+
         '<div class="homeFreshPlaceholder chat">◌</div>'+
         '<div><small>ЧАТ · '+esc(roomName(msgs[0].room_id))+'</small><b>'+esc(msgs[0].author?.display_name||"Новая реплика")+'</b><span>'+esc((msgs[0].body||"Новое сообщение").slice(0,90))+'</span></div>'+
       '</button>':'')+
       (needPhoto[0]?'<button class="homeFreshCard" data-home-photo="'+esc(needPhoto[0].id)+'">'+
         '<div class="homeFreshPlaceholder question">?</div>'+
         '<div><small>НУЖНА ПОМОЩЬ</small><b>'+esc(needPhoto[0].title)+'</b><span>Помочь разобраться →</span></div>'+
       '</button>':'')+
     '</div>'+
   '</section>'+

   '<div class="homeMemoryRibbon"><div class="homeMemoryCity">Куйбышев · Волга · школа №78 · 1983</div><blockquote>«'+esc(quoteText||"Память складывается не из дат. Она складывается из голосов, лиц и деталей.")+'»</blockquote><span>'+esc(quoteBy||"Из наших воспоминаний")+'</span></div>'+
   '<div class="memoryArchiveNote"><b>Здесь нет одной «официальной версии» прошлого.</b> Разные воспоминания могут не совпадать — мы сохраняем их рядом и отмечаем, что подтверждено фотографией, документом или несколькими свидетелями.</div>'+
   (editor?'<div class="memoryEditorStrip"><b>Редакторский слой:</b> '+sr.length+' историй · '+mr.length+' свежих фото в выборке · '+openQ.length+' открытых вопросов · '+unknown10A.length+' неопознанных в 10А.</div>':'');

 bindHome();
}

const PROFILE_DEFAULT_PANES={
 personal:"personal-name",
 my:"my-photos",
 editorial:"editorial-photo",
 admin:"admin-traffic"
};

function setProfileSections({personal=false,my=false,editorial=false,admin=false}={}){
 const allowed={personal,my,editorial,admin};
 const workspace=$("profileWorkspace");
 const any=Object.values(allowed).some(Boolean);
 if(workspace)workspace.style.display=any?"block":"none";

 document.querySelectorAll("[data-profile-section-tab]").forEach(btn=>{
   const on=!!allowed[btn.dataset.profileSectionTab];
   btn.style.display=on?"flex":"none";
   if(!on)btn.classList.remove("active");
 });

 document.querySelectorAll("[data-profile-section-pane]").forEach(pane=>{
   const on=!!allowed[pane.dataset.profileSectionPane];
   if(!on){pane.hidden=true;pane.classList.remove("active")}
 });

 if(!any)return;
 const current=document.querySelector("[data-profile-section-tab].active");
 const currentKey=current?.dataset.profileSectionTab;
 const next=(currentKey&&allowed[currentKey])?currentKey:Object.keys(allowed).find(k=>allowed[k]);
 if(next)activateProfileSection(next,{load:false});
}

function profileRoleLabel(role){
 return role==="admin"?"Администратор":role==="editor"?"Редактор":"Участник";
}
function profileInitial(name){
 const v=String(name||"У").trim();
 return esc((v[0]||"У").toUpperCase());
}

async function loadProfilePanel(el){
 if(!el||el.dataset.loaded==="1")return;
 const kind=el.dataset.profileLoad;
 if(!kind)return;
 try{
   if(kind==="my")await loadMyPhotoSubmissions();
   else if(kind==="photo-review"&&(profile?.role==="editor"||profile?.role==="admin"))await loadPhotoSubmissionReview();
   else if(kind==="identity-review"&&(profile?.role==="editor"||profile?.role==="admin"))await loadIdentityReview();
   else if(kind==="moderation"&&(profile?.role==="editor"||profile?.role==="admin"))await loadModerationPanel();
   else if(kind==="traffic"&&profile?.role==="admin"&&typeof loadTrafficStats==="function")await loadTrafficStats();
   else if(kind==="users"&&profile?.role==="admin")await loadAdminUsers();
   else if(kind==="archive"&&profile?.role==="admin")await loadArchiveStorageStatus();
   el.dataset.loaded="1";
 }catch(e){console.warn("Profile panel load failed:",kind,e)}
}

function activateProfileSubpane(sectionKey,paneKey,{load=true}={}){
 const section=document.querySelector('[data-profile-section-pane="'+sectionKey+'"]');
 if(!section)return;
 const target=paneKey||PROFILE_DEFAULT_PANES[sectionKey];
 section.querySelectorAll("[data-profile-subtab]").forEach(btn=>{
   const active=btn.dataset.profileSubtab===target;
   btn.classList.toggle("active",active);
   btn.setAttribute("aria-selected",active?"true":"false");
 });
 section.querySelectorAll("[data-profile-pane]").forEach(pane=>{
   const active=pane.dataset.profilePane===target;
   pane.hidden=!active;
   pane.classList.toggle("active",active);
 });
 const activePane=section.querySelector('[data-profile-pane="'+target+'"]');
 if(load&&activePane)loadProfilePanel(activePane);
}

function activateProfileSection(sectionKey,{pane=null,load=true}={}){
 const target=document.querySelector('[data-profile-section-pane="'+sectionKey+'"]');
 const tab=document.querySelector('[data-profile-section-tab="'+sectionKey+'"]');
 if(!target||!tab||tab.style.display==="none")return;

 document.querySelectorAll("[data-profile-section-tab]").forEach(btn=>{
   const active=btn===tab;
   btn.classList.toggle("active",active);
   btn.setAttribute("aria-selected",active?"true":"false");
 });
 document.querySelectorAll("[data-profile-section-pane]").forEach(section=>{
   const active=section===target;
   section.hidden=!active;
   section.classList.toggle("active",active);
 });

 let paneKey=pane;
 if(!paneKey){
   const activeSub=target.querySelector("[data-profile-subtab].active");
   paneKey=activeSub?.dataset.profileSubtab||PROFILE_DEFAULT_PANES[sectionKey];
 }
 activateProfileSubpane(sectionKey,paneKey,{load});
}

function bindProfileSectionNavigation(){
 document.querySelectorAll("[data-profile-section-tab]").forEach(btn=>{
   if(btn.dataset.profileBound==="1")return;
   btn.dataset.profileBound="1";
   btn.addEventListener("click",()=>activateProfileSection(btn.dataset.profileSectionTab,{load:true}));
 });
 document.querySelectorAll("[data-profile-subtab]").forEach(btn=>{
   if(btn.dataset.profileBound==="1")return;
   btn.dataset.profileBound="1";
   btn.addEventListener("click",()=>{
     const section=btn.closest("[data-profile-section-pane]");
     if(section)activateProfileSubpane(section.dataset.profileSectionPane,btn.dataset.profileSubtab,{load:true});
   });
 });
}

function renderProfile(){
 bindProfileSectionNavigation();
 if(user&&pendingProfile&&!profile){
   if($("adminLoginBox"))$("adminLoginBox").style.display="none";
   const alreadyAdmitted=!!pendingProfile.is_active&&!pendingProfile.access_blocked;
   const pendingMessage=consentRequired
     ?(alreadyAdmitted
       ?"Доступ уже одобрен администратором. Осталось обновить действующее согласие — повторное согласование не требуется."
       :"Нужно подтвердить действующее согласие. После этого заявка останется на рассмотрении администратора.")
     :(pendingProfile.access_blocked
       ?"Администратор не предоставил доступ либо ранее отключил его."
       :"Заявка зарегистрирована и ожидает решения администратора.");
   $("profileBox").innerHTML=
     '<div class="profileUserRow">'+
       '<div class="profileAvatar">'+profileInitial(pendingProfile.display_name||"Участник")+'</div>'+
       '<div class="profileUserMain"><b>'+esc(pendingProfile.display_name||"Участник")+'</b>'+
         '<div class="profileBadges"><span class="profileBadge">Кандидат</span>'+
         (alreadyAdmitted?'<span class="profileBadge ok">Доступ одобрен</span>':'')+
         (pendingProfile.access_blocked?'<span class="profileBadge warn">Доступ закрыт</span>':'')+
         '</div><div class="profileUserHint">'+esc(pendingMessage)+'</div></div>'+
       '<div class="profileUserActions">'+
         (!consentRequired&&!pendingProfile.access_blocked?'<button class="secondary compact" id="checkAccessBtn">Проверить</button>':'')+
         '<button class="secondary compact" id="logoutPendingBtn">Выйти</button>'+
       '</div>'+
     '</div>';
   if($("checkAccessBtn"))$("checkAccessBtn").onclick=async()=>{
     $("checkAccessBtn").disabled=true;$("checkAccessBtn").textContent="Проверяю…";
     const ok=await syncAuthState({render:false});
     renderProfile();
     if(ok){subscribe();subscribeNotifications();await showView("home");await loadHome()}
   };
   $("logoutPendingBtn").onclick=logout;
   $("loginBox").style.display="none";
   $("nameBox").style.display="none";
   $("privacyBox").style.display="none";
   $("consentGateBox").style.display=consentRequired?"block":"none";
   $("composerWrap").style.display="none";
   if($("photoContributeBox"))$("photoContributeBox").style.display="none";
   if($("archiveUploadBox"))$("archiveUploadBox").style.display="none";
    if($("photoEditorBar"))$("photoEditorBar").style.display="none";
   if($("myPhotoSubmissionsBox"))$("myPhotoSubmissionsBox").style.display="none";
   if($("photoSubmissionReviewBox"))$("photoSubmissionReviewBox").style.display="none";
   if($("adminUsersBox"))$("adminUsersBox").style.display="none";if($("archiveStorageBox"))$("archiveStorageBox").style.display="none";if($("trafficStatsBox"))$("trafficStatsBox").style.display="none";
   if($("identityReviewBox"))$("identityReviewBox").style.display="none";
   if($("moderationBox"))$("moderationBox").style.display="none";
   if($("notifyBtn"))$("notifyBtn").style.display="none";
   setProfileSections();
   setStatus(consentRequired?"Нужно согласие":(pendingProfile.access_blocked?"Доступ не предоставлен":"Ожидает допуска"));
   return;
 }
 if(user&&profile){
   if($("adminLoginBox"))$("adminLoginBox").style.display="none";
   $("profileBox").innerHTML=
     '<div class="profileUserRow">'+
       '<div class="profileAvatar">'+profileInitial(profile.display_name)+'</div>'+
       '<div class="profileUserMain"><b>'+esc(profile.display_name)+'</b>'+
         '<div class="profileBadges"><span class="profileBadge">'+esc(profileRoleLabel(profile.role))+'</span><span class="profileBadge ok">Доступ активен</span></div>'+
       '</div>'+
       '<div class="profileUserActions"><button class="secondary compact" id="logoutBtn">Выйти</button></div>'+
     '</div>';
   $("loginBox").style.display="none";$("consentGateBox").style.display="none";$("nameBox").style.display="block";$("displayName").value=profile.display_name;$("logoutBtn").onclick=logout;
   $("privacyBox").style.display="block";
   $("privacyConsentState").textContent="Согласие принято "+(profile.consentAcceptedAt?new Date(profile.consentAcceptedAt).toLocaleString("ru-RU"):"ранее")+". Действует только для закрытого архива.";
   $("homeState").innerHTML="<b>Архив подключён.</b> Здесь собраны свежие материалы и задачи.";loadHome();$("composerWrap").style.display="block";
   if($("photoContributeBox"))$("photoContributeBox").style.display="block";
    if($("archiveUploadBox"))$("archiveUploadBox").style.display="none";
   if($("myPhotoSubmissionsBox"))$("myPhotoSubmissionsBox").style.display="block";
    {const canEditPhotos=profile.role==="editor"||profile.role==="admin";document.querySelectorAll(".editorPhotoMode").forEach(x=>x.style.display=canEditPhotos?"inline-block":"none")}if($("adminUsersBox"))$("adminUsersBox").style.display=profile.role==="admin"?"block":"none";
   if($("archiveStorageBox"))$("archiveStorageBox").style.display=profile.role==="admin"?"block":"none";
    if($("trafficStatsBox"))$("trafficStatsBox").style.display=profile.role==="admin"?"block":"none";
   const canModerate=profile.role==="editor"||profile.role==="admin";
   setProfileSections({personal:true,my:true,editorial:canModerate,admin:profile.role==="admin"});
   if($("photoSubmissionReviewBox"))$("photoSubmissionReviewBox").style.display=canModerate?"block":"none";
   if($("identityReviewBox"))$("identityReviewBox").style.display=canModerate?"block":"none";
   if($("moderationBox"))$("moderationBox").style.display=canModerate?"block":"none";
   subscribeNotifications();setStatus("Онлайн · "+profileRoleLabel(profile.role));
 } else {
   if($("adminLoginBox"))$("adminLoginBox").style.display="block";
   $("profileBox").innerHTML='<span class="small">Вход не выполнен.</span>';$("loginBox").style.display="block";
   if($("loginContextHint"))$("loginContextHint").textContent=APP_STANDALONE
     ?"Сейчас сайт открыт как отдельное приложение с экрана «Домой». Его вход хранится отдельно от Safari."
     :"Сейчас сайт открыт в браузере. На iPhone ярлык с экрана «Домой» имеет отдельную сессию входа.";
   const pendingOtpEmail=(localStorage.getItem(OTP_EMAIL_KEY)||"").trim();
   if(pendingOtpEmail){
     $("email").value=pendingOtpEmail;
     $("otpLoginBox").style.display="block";
   }
   $("consentGateBox").style.display="none";$("nameBox").style.display="none";$("privacyBox").style.display="none";$("composerWrap").style.display="none";
   if($("photoContributeBox"))$("photoContributeBox").style.display="none";
   if($("archiveUploadBox"))$("archiveUploadBox").style.display="none";
    if($("photoEditorBar"))$("photoEditorBar").style.display="none";
   if($("myPhotoSubmissionsBox"))$("myPhotoSubmissionsBox").style.display="none";
   if($("photoSubmissionReviewBox"))$("photoSubmissionReviewBox").style.display="none";
   setProfileSections();
   document.querySelectorAll(".editorPhotoMode").forEach(x=>x.style.display="none");if($("adminUsersBox"))$("adminUsersBox").style.display="none";if($("archiveStorageBox"))$("archiveStorageBox").style.display="none";if($("trafficStatsBox"))$("trafficStatsBox").style.display="none";if($("identityReviewBox"))$("identityReviewBox").style.display="none";if($("moderationBox"))$("moderationBox").style.display="none";if($("notifyBtn"))$("notifyBtn").style.display="none";$("homeState").innerHTML="Для просмотра внутреннего архива войдите через <b>Профиль</b>.";loadHome();setStatus("Нужен вход");
 }
}
async function init(){
 await syncAuthState({render:false});
 renderRooms();renderProfile();
 if($("themeSelect")){$("themeSelect").value=getTheme();$("themeSelect").onchange=()=>{localStorage.setItem(THEME_KEY,$("themeSelect").value);applyTheme($("themeSelect").value)}}
 if(profile){subscribe();subscribeNotifications();setTimeout(prefetchClassPhotoUrls,0);}
 if(OPEN_LOGIN_ON_START||OPEN_REGISTER_ON_START)await showView("profile");
 else await showView("home");
 if(OPEN_REGISTER_ON_START&&!user)setTimeout(openQuickRegistration,120);
 if(authReturn.type==="signup"||authReturn.error||authReturn.hasToken)setTimeout(showSignupConfirmationState,180);
 appNavEnabled=true;
 updateContextBack();
}
async function finishOtpLogin(email,token){
 email=String(email||"").trim().toLowerCase();
 token=String(token||"").replace(/\D/g,"");
 if(!email)throw new Error("Не найден e-mail, для которого был отправлен код. Запросите новый код.");
 if(!/^\d{8}$/.test(token))throw new Error("Введите ровно 8 цифр из последнего письма.");
 const {data,error}=await sb.auth.verifyOtp({email,token,type:"email"});
 if(error)throw error;
 localStorage.removeItem(OTP_EMAIL_KEY);
 await hydrateProfileFromSession(data.session,{render:false});
 renderProfile();
 if(profile){
   subscribe();subscribeNotifications();
   await showView("home");await loadHome();
   return "active";
 }
 if(pendingProfile){
   await showView("profile");
   if(consentRequired&&pendingProfile.is_active&&!pendingProfile.access_blocked)return "consent";
   return pendingProfile.access_blocked?"blocked":"pending";
 }
 throw new Error("Код принят, но профиль не найден.");
}

async function login(){
 $("loginError").className="";
 $("loginError").textContent="";
 const email=$("email").value.trim().toLowerCase();
 if(!email){$("loginError").className="err";$("loginError").textContent="Введите e-mail.";return}
 $("loginBtn").disabled=true;
 try{
  const {error}=await sb.auth.signInWithOtp({
    email,
    options:{shouldCreateUser:false,emailRedirectTo:SITE_URL}
  });
  if(error)throw error;
  localStorage.setItem(OTP_EMAIL_KEY,email);
  $("email").value=email;
  $("otpLoginBox").style.display="block";
  $("otpCode").value="";
  $("otpCode").focus();
  $("loginError").className="ok";
  $("loginError").innerHTML="<b>Код отправлен на "+esc(email)+".</b><br>Введите 8 цифр именно из последнего письма. Если приложение свернётся при открытии почты, этот e-mail сохранится.";
 }catch(e){
  $("loginError").className="err";
  $("loginError").textContent=(e.message||String(e)).includes("Signups not allowed")
    ?"Такой e-mail ещё не зарегистрирован. Нажмите «Запросить доступ»."
    :(e.message||String(e));
 }finally{$("loginBtn").disabled=false}
}

async function verifyLoginOtp(event){
 if(event?.preventDefault)event.preventDefault();
 const btn=$("otpVerifyBtn");
 const oldText=btn.textContent;
 $("loginError").className="ok";
 $("loginError").textContent="Проверяю код…";
 btn.disabled=true;
 btn.textContent="Проверяю…";
 try{
   const issuedEmail=(localStorage.getItem(OTP_EMAIL_KEY)||"").trim().toLowerCase();
   const typedEmail=$("email").value.trim().toLowerCase();
   const email=issuedEmail||typedEmail;
   if(!email)throw new Error("Сначала получите новый код для входа.");
   const state=await finishOtpLogin(email,$("otpCode").value);
   if(state==="active")return;
   $("loginError").className="ok";
   $("loginError").textContent=state==="blocked"
     ?"Код подтверждён. Доступ к архиву отключён администратором."
     :(state==="consent"
       ?"Код подтверждён. Ваш доступ уже одобрен; осталось обновить согласие."
       :"Код подтверждён. Заявка ожидает решения администратора.");
 }catch(e){
   $("loginError").className="err";
   $("loginError").textContent=e.message||String(e);
 }finally{
   btn.disabled=false;
   btn.textContent=oldText;
 }
}
window.verifyLoginOtp=verifyLoginOtp;
async function passwordLogin(){
 $("loginError").className="";
 $("loginError").textContent="";
 try{
  const {data,error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error)throw error;
  await hydrateProfileFromSession(data.session,{render:false});
  renderProfile();
  if(profile){subscribe();subscribeNotifications();showView("home");await loadHome();return}
  if(pendingProfile){showView("profile");return}
  throw new Error("Не удалось открыть профиль.");
 }catch(e){$("loginError").className="err";$("loginError").textContent=e.message||String(e)}
}

async function adminPasswordLogin(){
 const msg=$("adminLoginMsg");
 msg.className="";
 msg.textContent="";
 const email=$("adminEmail").value.trim();
 const password=$("adminPassword").value;
 if(!email||!password){msg.className="err";msg.textContent="Введите e-mail администратора и пароль.";return}
 $("adminLoginBtn").disabled=true;
 try{
   const {data,error}=await sb.auth.signInWithPassword({email,password});
   if(error)throw error;
   await hydrateProfileFromSession(data.session,{render:false});
   if(profile?.role!=="admin"){
     await sb.auth.signOut();
     user=null;profile=null;pendingProfile=null;consentRequired=false;
     renderProfile();
     throw new Error("Эта учётная запись не имеет прав администратора.");
   }
   localStorage.setItem("chronicles78-admin-email",email);
   renderProfile();
   subscribe();subscribeNotifications();
   await showView("home");
   await loadHome();
 }catch(e){
   msg.className="err";
   msg.textContent=e.message||String(e);
 }finally{$("adminLoginBtn").disabled=false}
}

function openAdminPasswordReset(){
 const remembered=($("adminEmail")?.value||localStorage.getItem("chronicles78-admin-email")||"").trim();
 openPhotoModal("Пароль администратора",
   '<div class="notice"><b>Восстановление только пароля администратора.</b><br>На указанный e-mail придёт ссылка для задания нового пароля.</div>'+
   '<label>E-mail администратора</label><input id="pfAdminResetEmail" type="email" autocomplete="email" value="'+esc(remembered)+'" placeholder="name@example.com">',
   async()=>{
     const email=$("pfAdminResetEmail").value.trim();
     if(!email)throw new Error("Введите e-mail администратора.");
     $("photoModalMsg").textContent="Отправляю письмо…";
     const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:PASSWORD_RESET_REDIRECT});
     if(error)throw error;
     $("photoModalBody").innerHTML='<div class="notice"><b>Письмо отправлено.</b><br>Откройте ссылку и задайте новый пароль. После этого используйте блок «Вход администратора».</div>';
     $("photoModalSave").textContent="Закрыть";
     photoModalSubmit=async()=>closePhotoModal();
   }
 );
}
async function logout(){if(unsubMsg)unsubMsg();if(unsubReact)unsubReact();if(unsubRead)unsubRead();if(unsubNotif)unsubNotif();await sb.auth.signOut();localStorage.removeItem(OTP_EMAIL_KEY);document.querySelectorAll("[data-profile-load]").forEach(el=>delete el.dataset.loaded);user=null;profile=null;pendingProfile=null;consentRequired=false;renderProfile();showView("home")}
$("loginBtn").onclick=login;
$("otpCode").onkeydown=e=>{if(e.key==="Enter"){verifyLoginOtp(e)} };
$("passwordLoginToggle").onclick=()=>{
 const box=$("passwordLoginBox");
 box.style.display=box.style.display==="none"?"block":"none";
};
$("passwordLoginBtn").onclick=passwordLogin;
$("forgotPasswordBtn").onclick=openForgotPassword;
$("adminLoginBtn").onclick=adminPasswordLogin;
$("adminPassword").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();adminPasswordLogin()}};
$("adminResetBtn").onclick=openAdminPasswordReset;
$("adminEmail").value=localStorage.getItem("chronicles78-admin-email")||"";

function openQuickRegistration(){
 openPhotoModal("Запросить доступ",
   '<div class="notice"><b>Новый участник проходит три шага.</b><br>1. Имя, e-mail и согласие. 2. Подтверждение e-mail 8-значным кодом из письма. 3. Решение администратора о допуске.</div>'+
   '<label>Ваше имя</label><input id="pfRegName" autocomplete="name" placeholder="Например, Алексей Петров">'+
   '<label>E-mail</label><input id="pfRegEmail" type="email" autocomplete="email" placeholder="name@example.com">'+
    '<label class="checkItem" style="margin-top:14px"><input id="pfRegConsent" type="checkbox"> <span>Я согласен(на) на обработку данных для работы закрытого архива, включая внутреннюю статистику посещений и разделов без сохранения IP‑адреса и цифрового fingerprint. <a href="consent.html" target="_blank" rel="noopener">Полный текст</a></span></label>'+
   '<div class="formHint" style="margin-top:9px">Открытая публикация в интернете, соцсетях или рекламе в это согласие не входит.</div>',
   async()=>{
     const display_name=$("pfRegName").value.trim();
     const email=$("pfRegEmail").value.trim();
     if(!display_name||!email)throw new Error("Введите имя и e-mail.");
     if(!$("pfRegConsent").checked)throw new Error("Нужно подтвердить согласие для закрытого архива.");
     $("photoModalMsg").textContent="Отправляю код подтверждения…";
     const {error}=await sb.auth.signInWithOtp({
       email,
       options:{
         shouldCreateUser:true,
         emailRedirectTo:SITE_URL,
         data:{display_name,consent_personal_data:true,consent_version:CONSENT_VERSION}
       }
     });
     if(error)throw error;
     $("photoModalBody").innerHTML=
       '<div class="notice"><b>Письмо отправлено.</b><br>На '+esc(email)+' должен прийти 8-значный код подтверждения.</div>'+
       '<label>Код из письма</label><input id="pfRegOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="00000000">'+
       '<div class="formHint">Введите код здесь — не нужно переходить в Safari. После подтверждения заявка появится у администратора.</div>';
     $("photoModalSave").textContent="Подтвердить код";
     photoModalSubmit=async()=>{
       $("photoModalMsg").textContent="Проверяю код…";
       const state=await finishOtpLogin(email,$("pfRegOtp").value);
       if(state==="active"){
         closePhotoModal();
         return;
       }
       $("photoModalBody").innerHTML=
         '<div class="notice"><b>E-mail подтверждён.</b><br>Заявка передана администратору проекта.</div>'+
         '<div class="formHint">Архив откроется после решения администратора. Вы можете позже открыть Профиль и нажать «Проверить решение».</div>';
       $("photoModalMsg").textContent="";
       $("photoModalSave").textContent="Перейти в профиль";
       photoModalSubmit=async()=>{closePhotoModal();await showView("profile")};
     };
   }
 );
 $("photoModalSave").textContent="Отправить заявку";
}
$("goRegisterBtn").onclick=openQuickRegistration;

async function acceptCurrentConsent(){
 if(!user)return;
 $("acceptConsentBtn").disabled=true;
 $("consentGateMsg").textContent="Сохраняю согласие…";
 try{
   const {error}=await sb.rpc("accept_archive_personal_data_consent");
   if(error)throw error;
   const {data:{session}}=await sb.auth.getSession();
   await hydrateProfileFromSession(session,{render:false});
   renderProfile();
   if(profile){subscribe();subscribeNotifications();showView("home");await loadHome()}
 }catch(e){
   $("consentGateMsg").className="err";
   $("consentGateMsg").textContent=e.message||String(e);
 }finally{$("acceptConsentBtn").disabled=false}
}
$("acceptConsentBtn").onclick=acceptCurrentConsent;

function openPrivacyRequest(){
 openPhotoModal("Приватность",
   '<div class="notice">Можно попросить убрать или исправить ваши данные, ограничить использование фотографии либо отозвать согласие. Запрос увидит администратор проекта.</div>'+
   '<label>Что нужно сделать</label><select id="pfPrivacyType"><option value="withdraw_consent">Отозвать согласие</option><option value="restrict_photo">Ограничить использование фотографии</option><option value="correct_data">Исправить мои данные</option><option value="delete_data">Удалить мои данные</option><option value="other">Другое</option></select>'+
   '<label>Комментарий</label><textarea id="pfPrivacyNote" placeholder="Напишите, что именно нужно изменить или убрать"></textarea>',
   async()=>{
     const {error}=await sb.from("privacy_requests").insert({
       user_id:user.id,
       request_type:$("pfPrivacyType").value,
       note:$("pfPrivacyNote").value.trim()||null
     });
     if(error)throw error;
     $("photoModalBody").innerHTML='<div class="notice"><b>Запрос отправлен.</b><br>Редакция увидит его и свяжется с вами при необходимости.</div>';
     $("photoModalSave").textContent="Закрыть";
     photoModalSubmit=async()=>closePhotoModal();
   }
 );
}
$("privacyRequestBtn").onclick=openPrivacyRequest;

async function saveName(){
 const name=$("displayName").value.trim();$("nameMsg").textContent="";
 if(name.length<2){$("nameMsg").className="err";$("nameMsg").textContent="Введите имя.";return}
 const {error}=await sb.from("profiles").update({display_name:name}).eq("id",user.id);
 if(error){$("nameMsg").className="err";$("nameMsg").textContent=error.message;return}
 profile.display_name=name;$("nameMsg").className="ok";$("nameMsg").textContent="Имя сохранено.";renderProfile();loadRoom();
}
$("saveNameBtn").onclick=saveName;

