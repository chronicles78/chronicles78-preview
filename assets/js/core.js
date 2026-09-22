const THEME_KEY="chronicles78-theme";
function systemTheme(){return window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}
function getTheme(){return localStorage.getItem(THEME_KEY)||"auto"}
function applyTheme(mode){
 const actual=mode==="auto"?systemTheme():mode;
 document.documentElement.dataset.theme=actual;
 const btn=document.getElementById("themeBtn");
 if(btn){btn.textContent=actual==="dark"?"☀":"☾";btn.title=actual==="dark"?"Светлая тема":"Тёмная тема";}
}
applyTheme(getTheme());
const mq=window.matchMedia?window.matchMedia("(prefers-color-scheme: dark)"):null;
if(mq)mq.addEventListener?.("change",()=>{if(getTheme()==="auto")applyTheme("auto")});
const SUPABASE_URL="https://fnwpkmjjdhflnqghnogj.supabase.co";
const SUPABASE_KEY="sb_publishable_m_oI5Ahniod1rd3wTV-i4A_so7lUVvX";
const SITE_URL="https://chronicles78.github.io/chronicles78-preview/";
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
const CONSENT_VERSION="2026-09-22-v2";
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
   openPhotoModal("E-mail подтверждён",
     '<div class="notice"><b>Адрес подтверждён.</b><br>Ручное одобрение редактора больше не требуется. Если появится экран согласия — подтвердите его один раз, и архив откроется.</div>',
     async()=>{clearAuthReturnUrl();closePhotoModal();showView("profile")}
   );
   $("photoModalSave").textContent="Продолжить";
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
     consentRequired=!hasConsent;
     if(hasConsent&&p.is_active&&!p.access_blocked){
       profile={...p,consentAcceptedAt:consent.accepted_at};
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
     if(ok){
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
let user=null,profile=null,currentRoom="general",unsubMsg=null,unsubReact=null,unsubRead=null,unsubNotif=null,replyTo=null,pendingFiles=[],chatLoadSeq=0,chatReloadTimer=null,chatLoadedLimit=80,photoAction=null,archiveReplaceId=null,photoModalSubmit=null,cityPhotoCursor=null,openStoryId=null,lastMessages=[],reactionRows=[],peopleCache=[],peopleLoadPromise=null,peopleGroup="10Б",storyIndex=[],classPhotoState=null,classPhotoLoadSeq=0,classPhotoStateCache=new Map(),selectedPersonId=null,showClassNumbers=false,questionCache=[],questionPriority="all",questionStatus="open",questionDiscussion=null,question10AVisual=null,mediaFocus=null,mediaCache=[],mediaSigned={},photoFilter="all",photoMode="archive",visualTopicCache=[],visualCandidateCache=[],pendingVisualTopicId=null,storyCache=[],storyFilter="all",storyCoverUrls={},storyCoverMedia={},cityCache=[],cityTheme="all";
const rooms=[{id:"general",name:"Редколлегия"},{id:"photo",name:"Фотоархив"},{id:"tanin",name:"Танин Шанхай"},{id:"upk",name:"УПК"},{id:"10a",name:"10А"},{id:"10b",name:"10Б"}];
const $=id=>document.getElementById(id);
$("themeBtn").onclick=()=>{
 const actual=document.documentElement.dataset.theme;
 const next=actual==="dark"?"light":"dark";
 localStorage.setItem(THEME_KEY,next);applyTheme(next);
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
     out+='<figure class="cityInlinePhoto"><img loading="lazy" src="'+esc(mediaSigned[id])+'" alt="'+esc(caption)+'"><figcaption>'+esc(caption)+'</figcaption></figure>';
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

async function loadNotificationCount(){
 if(!user||!profile?.is_active){if($("notifyBtn"))$("notifyBtn").style.display="none";return}
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
 openPhotoModal("Уведомления",
   '<div class="notificationActions"><button class="secondary" type="button" id="markAllNotifications">Отметить всё прочитанным</button></div>'+
   '<div id="notificationList">'+(rows.map(n=>'<div class="notificationItem '+(!n.is_read?'unread':'')+'">'+
     '<div class="notificationTitle">'+esc(n.title)+'</div>'+
     (n.body?'<div class="notificationBody">'+esc(n.body)+'</div>':'')+
     '<div class="small">'+new Date(n.created_at).toLocaleString("ru-RU")+'</div>'+
     '<div class="notificationActions"><button class="secondary" type="button" data-open-notification="'+n.id+'" data-etype="'+esc(n.entity_type||"")+'" data-eid="'+esc(n.entity_id||"")+'">Открыть</button></div></div>').join("")||'<div class="notice">Новых уведомлений нет.</div>')+'</div>',
   async()=>{}
 );
 $("photoModalSave").textContent="Закрыть";photoModalSubmit=async()=>closePhotoModal();
 $("markAllNotifications").onclick=async()=>{await sb.from("notifications").update({is_read:true}).eq("is_read",false);await loadNotificationCount();closePhotoModal()};
 document.querySelectorAll("[data-open-notification]").forEach(b=>b.onclick=async()=>{
   const id=Number(b.dataset.openNotification),type=b.dataset.etype,eid=b.dataset.eid;
   await sb.from("notifications").update({is_read:true}).eq("id",id);
   await loadNotificationCount();closePhotoModal();
   if(type==="message"){
     const {data:m}=await sb.from("messages").select("room_id").eq("id",eid).maybeSingle();
     if(m?.room_id){currentRoom=m.room_id;renderRooms();showView("chat");setTimeout(()=>document.querySelector('.bubble[data-mid="'+CSS.escape(eid)+'"]')?.scrollIntoView({behavior:"smooth",block:"center"}),260)}
   }else if(type==="city_essay"){
     showView("city");setTimeout(()=>openCityEssay(eid),120);
   }else if(type==="person"){
     activateTag(eid);
   }else if(type==="photo_submission"){
     showView("profile");
     const box=(profile?.role==="editor"||profile?.role==="admin")?$("photoSubmissionReviewBox"):$("myPhotoSubmissionsBox");
     setTimeout(()=>box?.scrollIntoView({behavior:"smooth",block:"start"}),120);
   }else if(type==="moderation_report"){
     showView("profile");setTimeout(()=>$("moderationBox")?.scrollIntoView({behavior:"smooth",block:"start"}),120);
   }
 });
}
function subscribeNotifications(){
 if(unsubNotif){unsubNotif();unsubNotif=null}
 if(!user||!profile?.is_active)return;
 const ch=sb.channel("notifications-"+user.id+"-"+Date.now())
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"user_id=eq."+user.id},()=>loadNotificationCount())
   .subscribe();
 unsubNotif=()=>sb.removeChannel(ch);
 loadNotificationCount();
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
 $("contextBackBtn")?.classList.toggle("show",tagged);
}
function navigateFromTag(targetState,runner){
 syncHistoryEntry();
 try{
   history.pushState({chronicles78:true,chronicles78Tag:true,nav:targetState},document.title,location.href);
 }catch(e){}
 updateContextBack();
 runner();
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
 showView(state.view||"home");
 await new Promise(r=>setTimeout(r,180));
 if(state.storyOpen&&state.storyId){
   await openStory(state.storyId);
   await new Promise(r=>setTimeout(r,60));
   if($("storyDetail"))$("storyDetail").scrollTop=state.storyScroll||0;
 }else{
   window.scrollTo({top:state.scrollY||0,left:0,behavior:"auto"});
 }
}
window.addEventListener("popstate",async e=>{
 closePhotoModal();
 closeMoreNav();
 await restoreNavState(e.state?.nav||{view:"home",scrollY:0});
 updateContextBack();
});
setTimeout(()=>{syncHistoryEntry();updateContextBack()},0);
function showView(v){
 if(!v)return;
 closeMoreNav();
 if($("storyDetail")?.classList.contains("open")){$("storyDetail").classList.remove("open");openStoryId=null;}
 document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id===v));
 document.querySelectorAll(".nav[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
 const secondary=["photos","city","questions","profile"].includes(v);
 $("mobileMoreBtn")?.classList.toggle("active",secondary);
 if(v==="home")loadHome();
 if(v==="chat"&&user&&profile?.is_active)loadRoom();
 if(v==="people")loadPeople();
 if(v==="stories")loadStories();
 if(v==="photos")loadPhotos();
 if(v==="city")loadCityEssays();
 if(v==="questions")loadQuestions();
 if(v==="profile"&&user&&profile?.is_active){
   loadMyPhotoSubmissions();
   if(profile.role==="editor"||profile.role==="admin")loadPhotoSubmissionReview();
 }
}
document.querySelectorAll(".nav[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
$("mobileMoreBtn").onclick=()=>{
 const isOpen=$("moreNavMenu").classList.contains("open");
 isOpen?closeMoreNav():openMoreNav();
};
$("moreNavClose").onclick=closeMoreNav;
$("moreNavShade").onclick=closeMoreNav;
document.querySelectorAll("[data-more-view]").forEach(b=>b.onclick=()=>showView(b.dataset.moreView));
$("contextBackBtn").onclick=()=>history.back();
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
   navigateFromTag({view:"stories",scrollY:0,storyOpen:true,storyId:tag,storyScroll:0},()=>{
     showView("stories");
     setTimeout(()=>openStory(tag),0);
   });
   return;
 }
 if(/^MEDIA-\d+$/i.test(tag)){
   navigateFromTag({view:"photos",scrollY:0,storyOpen:false,mediaFocus:tag},()=>{
     mediaFocus=tag;
     showView("photos");
     setTimeout(()=>openArchivePhoto(tag),120);
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
   navigateFromTag({view:"people",scrollY:0,storyOpen:false,peopleGroup:targetGroup,selectedPersonId:targetId},async()=>{
     peopleGroup=targetGroup;
     selectedPersonId=targetId;
     showClassNumbers=false;
     document.querySelectorAll("[data-pgroup]").forEach(x=>x.classList.toggle("on",x.dataset.pgroup===targetGroup));
     showView("people");
     await loadClassPhoto();
     renderPeople();
     setTimeout(()=>document.querySelector('[data-person-id="'+CSS.escape(targetId)+'"]')?.scrollIntoView({behavior:"smooth",block:"center"}),80);
   });
   return;
 }
 if(tag==="10А"||tag==="10Б"){
   navigateFromTag({view:"people",scrollY:0,storyOpen:false,peopleGroup:tag,selectedPersonId:null},async()=>{
     peopleGroup=tag;selectedPersonId=null;
     showView("people");
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
   navigateFromTag({view:"stories",scrollY:0,storyOpen:true,storyId:id,storyScroll:0},()=>{showView("stories");openStory(id)});
 });
 document.querySelectorAll("[data-tag-media]").forEach(b=>b.onclick=()=>{
   const id=b.dataset.tagMedia;closePhotoModal();
   navigateFromTag({view:"photos",scrollY:0,storyOpen:false,mediaFocus:id},()=>{mediaFocus=id;showView("photos");setTimeout(()=>openArchivePhoto(id),120)});
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
     showView("people");
     await loadClassPhoto();
     renderPeople();
   });
 });
 document.querySelectorAll("[data-tag-question]").forEach(b=>b.onclick=()=>{
   const label=b.textContent.trim();closePhotoModal();
   navigateFromTag({view:"questions",scrollY:0,storyOpen:false},()=>{showView("questions");setTimeout(()=>{const card=[...document.querySelectorAll("#questionsList .archiveCard")].find(x=>x.textContent.includes(label));card?.scrollIntoView({behavior:"smooth",block:"center"})},180)});
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

function renderRooms(){$("rooms").innerHTML=rooms.map(r=>'<button class="room '+(r.id===currentRoom?"active":"")+'" data-id="'+r.id+'">'+esc(r.name)+'</button>').join("");$("rooms").querySelectorAll(".room").forEach(b=>b.onclick=()=>{currentRoom=b.dataset.id;chatLoadedLimit=80;replyTo=null;pendingFiles=[];renderReply();renderRooms();loadRoom();subscribe()})}
async function loadHome(){
 const box=$("homeDashboard");
 if(!box)return;
 const bindHome=()=>{
   document.querySelectorAll("[data-home-view]").forEach(b=>b.onclick=()=>showView(b.dataset.homeView));
   box.querySelectorAll("[data-home-story]").forEach(b=>b.onclick=()=>{showView("stories");setTimeout(()=>openStory(b.dataset.homeStory),0)});
   box.querySelectorAll("[data-home-photo]").forEach(b=>b.onclick=()=>{mediaFocus=b.dataset.homePhoto;showView("photos");setTimeout(()=>openArchivePhoto(b.dataset.homePhoto),160)});
   box.querySelectorAll("[data-home-questions10a]").forEach(b=>b.onclick=()=>{questionPriority="P1";questionStatus="open";showView("questions")});
 };
 document.querySelectorAll("[data-home-view]").forEach(b=>b.onclick=()=>showView(b.dataset.homeView));

 if(!user||!profile?.is_active){
   $("memoryHeroPhoto").style.backgroundImage="";
   $("homeState").textContent="Закрытый архив класса · материалы открываются после входа.";
   box.innerHTML='<div class="memoryEntrances">'+
     '<button class="memoryEntrance" data-home-view="people"><div class="memoryEntranceNo">01 · лица</div><h2>Люди</h2><p>Классная фотография, имена и связи между воспоминаниями.</p></button>'+
     '<button class="memoryEntrance" data-home-view="stories"><div class="memoryEntranceNo">02 · память</div><h2>Истории</h2><p>То, что осталось не в документах, а в разговорах и памяти.</p></button>'+
     '<button class="memoryEntrance" data-home-view="city"><div class="memoryEntranceNo">03 · место</div><h2>Город</h2><p>Куйбышев, в котором всё это происходило.</p></button>'+
   '</div><div class="memoryArchiveNote"><b>Архив закрытый.</b> Фотографии и рабочие обсуждения доступны участникам после входа и не публикуются автоматически.</div>'+
   '<div class="homeActions"><button class="primary" data-home-view="profile">Войти в архив</button></div>';
   bindHome();return;
 }

 $("homeState").textContent="Архив открыт · "+profile.display_name;
 box.innerHTML='<div class="notice">Собираю свежие материалы…</div>';

 const [stories,questions,people,media,messages,classPhoto,cityEssays]=await Promise.all([
   sb.from("archive_stories").select("id,title,period,kind,full_chapter,data,updated_at").order("updated_at",{ascending:false}).limit(20),
   sb.from("archive_questions").select("id,question,status,priority,tags,links,updated_at").order("updated_at",{ascending:false}).limit(80),
   sb.from("archive_people").select("id,group_name,number,canonical_name,identification_status").order("number"),
   sb.from("archive_media").select("id,title,linked_story,quality_status,data,current_storage_path,updated_at").order("updated_at",{ascending:false}).limit(30),
   sb.from("messages").select("id,body,created_at,room_id,author_id,author:profiles!messages_author_id_fkey(display_name)").order("created_at",{ascending:false}).limit(8),
   sb.from("class_photos").select("id,title,storage_path").eq("id","CLASS-10B").maybeSingle(),
   sb.from("city_essays").select("id,title,body,period,source_status,updated_at").not("body","is",null).order("updated_at",{ascending:false}).limit(12)
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

 let heroUrl=null,albumUrl=null;
 if(classPhoto.data?.storage_path)heroUrl=await archiveSignedImage(classPhoto.data.storage_path);
 if(albumPhoto?.current_storage_path)albumUrl=await archiveSignedImage(albumPhoto.current_storage_path);
 if(heroUrl){
   $("memoryHeroPhoto").style.backgroundImage='url("'+heroUrl.replace(/"/g,"%22")+'")';
   $("memoryHeroPhoto").style.backgroundSize="cover";
   $("memoryHeroPhoto").style.backgroundPosition="center";
 }

 let quoteText="",quoteBy="";
 const qEssay=ce.find(x=>x.id==="G-007")||ce[0];
 if(qEssay?.body){
   const paras=String(qEssay.body).split(/\n+/).map(x=>x.trim()).filter(x=>x.length>35&&x.length<180);
   quoteText=paras.find(x=>/[.!?]$/.test(x))||paras[0]||"";
   quoteBy=qEssay.title+(qEssay.period?" · "+qEssay.period:"");
 }

 const editor=profile.role==="editor"||profile.role==="admin";
 box.innerHTML=
   '<div class="memoryEntrances">'+
     '<button class="memoryEntrance" data-home-view="people"><div class="memoryEntranceNo">01 · лица</div><h2>Люди</h2><p>Нажмите на лицо на общей фотографии, вспомните имя, найдите связанные истории.</p></button>'+
     '<button class="memoryEntrance" data-home-view="stories"><div class="memoryEntranceNo">02 · память</div><h2>Истории</h2><p>Большие и маленькие сюжеты, которые класс восстанавливает вместе.</p></button>'+
     '<button class="memoryEntrance" data-home-view="city"><div class="memoryEntranceNo">03 · место</div><h2>Город и время</h2><p>Дворы, Волга, трамваи, музыка и вкус Куйбышева нашего времени.</p></button>'+
   '</div>'+
   '<div class="memoryFeatureGrid">'+
     '<article class="memoryFeature">'+
       (albumUrl?'<div class="memoryFeaturePhoto"><img src="'+albumUrl+'" alt="'+esc(albumPhoto.title)+'"></div>':'')+
       '<div class="memoryFeatureBody"><div class="memoryEyebrow">ИЗ АЛЬБОМА</div><h2>'+esc(albumPhoto?.title||"Фотография из архива")+'</h2>'+
       '<p>'+(albumPhoto?.data?.visual_description?esc(albumPhoto.data.visual_description):'Иногда одна фотография помнит больше, чем длинная подпись.')+'</p>'+
       (albumPhoto?'<div class="homeActions"><button class="secondary" data-home-photo="'+esc(albumPhoto.id)+'">Рассмотреть фотографию</button></div>':'')+
       '</div></article>'+
     '<article class="memoryQuoteCard"><div class="memoryEyebrow">ОДНА ФРАЗА ИЗ ПРОШЛОГО</div><div class="memoryQuoteMark">“</div>'+
       '<div class="memoryQuoteText">'+esc(quoteText||"Память редко приходит по расписанию. Чаще — по одной детали, запаху или фотографии.")+'</div>'+
       '<div class="memoryQuoteBy">'+esc(quoteBy||"Из архива «Хроник-78»")+'</div>'+
     '</article>'+
   '</div>'+
   '<article class="memoryUpdates"><h3>Что ожило недавно</h3><div class="memoryUpdateGrid">'+
     (lead?'<div class="memoryUpdateItem"><b>'+esc(lead.title)+'</b><p>'+esc((leadSummary||"Готовая история из архива.").slice(0,170))+'</p><div class="homeActions"><button class="secondary" data-home-story="'+esc(lead.id)+'">Читать</button></div></div>':'')+
     (msgs.length?'<div class="memoryUpdateItem"><b>'+esc(msgs[0].author?.display_name||"Участник")+' · '+esc(roomName(msgs[0].room_id))+'</b><p>'+esc((msgs[0].body||"Добавлено фото").slice(0,170))+'</p><div class="homeActions"><button class="secondary" data-home-view="chat">В обсуждение</button></div></div>':'')+
     (unknown10A.length?'<div class="memoryUpdateItem"><b>Кого ещё не узнали</b><p>В 10А остаются неопознанными: '+esc(unknown10A.slice(0,8).map(p=>"№"+p.number).join(", "))+(unknown10A.length>8?"…":"")+'</p><div class="homeActions"><button class="secondary" data-home-questions10a>Помочь вспомнить</button></div></div>':'')+
     (needPhoto[0]?'<div class="memoryUpdateItem"><b>'+esc(needPhoto[0].title)+'</b><p>'+esc(needPhoto[0].data?.identification_status||"Эта фотография просит уточнения.")+'</p><div class="homeActions"><button class="secondary" data-home-photo="'+esc(needPhoto[0].id)+'">Открыть</button></div></div>':'')+
   '</div></article>'+
   '<div class="memoryArchiveNote"><b>Здесь нет «официальной версии» прошлого.</b> Разные воспоминания могут не совпадать — мы сохраняем их рядом и отмечаем, что подтверждено фотографией, документом или несколькими свидетелями.</div>'+
   (editor?'<div class="memoryEditorStrip"><b>Редакторский слой:</b> '+sr.length+' историй · '+mr.length+' фото · '+openQ.length+' открытых вопросов · '+unknown10A.length+' неопознанных в 10А. Технические ID и рабочие статусы остаются в соответствующих разделах, а не на читательской главной.</div>':'');
 bindHome();
}
function renderProfile(){
 if(user&&pendingProfile&&!profile){
   $("profileBox").innerHTML='<b>'+esc(pendingProfile.display_name||"Участник")+'</b><br>'+
     '<span class="small">'+(consentRequired?"Нужно один раз подтвердить согласие на использование данных внутри закрытого архива.":(pendingProfile.access_blocked?"Доступ временно отключён администратором.":"Доступ пока недоступен."))+'</span>'+
     '<button class="secondary" id="logoutPendingBtn">Выйти</button>';
   $("logoutPendingBtn").onclick=logout;
   $("loginBox").style.display="none";
   $("nameBox").style.display="none";
   $("privacyBox").style.display="none";
   $("consentGateBox").style.display=consentRequired?"block":"none";
   $("composerWrap").style.display="none";
   if($("photoContributeBox"))$("photoContributeBox").style.display="none";
   if($("archiveUploadBox"))$("archiveUploadBox").style.display="none";
   if($("myPhotoSubmissionsBox"))$("myPhotoSubmissionsBox").style.display="none";
   if($("photoSubmissionReviewBox"))$("photoSubmissionReviewBox").style.display="none";
   if($("adminUsersBox"))$("adminUsersBox").style.display="none";if($("archiveStorageBox"))$("archiveStorageBox").style.display="none";
   if($("identityReviewBox"))$("identityReviewBox").style.display="none";
   if($("moderationBox"))$("moderationBox").style.display="none";
   if($("notifyBtn"))$("notifyBtn").style.display="none";
   setStatus(consentRequired?"Нужно согласие":"Доступ ограничен");
   return;
 }
 if(user&&profile){
   $("profileBox").innerHTML='<b>'+esc(profile.display_name)+'</b><br><span class="small">Роль: '+esc(profile.role)+' · доступ активен</span><button class="secondary" id="logoutBtn">Выйти</button>';
   $("loginBox").style.display="none";$("consentGateBox").style.display="none";$("nameBox").style.display="block";$("displayName").value=profile.display_name;$("logoutBtn").onclick=logout;
   $("privacyBox").style.display="block";
   $("privacyConsentState").textContent="Согласие принято "+(profile.consentAcceptedAt?new Date(profile.consentAcceptedAt).toLocaleString("ru-RU"):"ранее")+". Действует только для закрытого архива.";
   $("homeState").innerHTML="<b>Архив подключён.</b> Здесь собраны свежие материалы и задачи.";loadHome();$("composerWrap").style.display="block";
   if($("photoContributeBox"))$("photoContributeBox").style.display="block";
   if($("archiveUploadBox"))$("archiveUploadBox").style.display=(profile.role==="editor"||profile.role==="admin")?"block":"none";
   if($("myPhotoSubmissionsBox"))$("myPhotoSubmissionsBox").style.display="block";
   loadMyPhotoSubmissions();
   document.querySelectorAll(".editorPhotoMode").forEach(x=>x.style.display=(profile.role==="editor"||profile.role==="admin")?"":"none");if($("adminUsersBox"))$("adminUsersBox").style.display=profile.role==="admin"?"block":"none";
   if($("archiveStorageBox"))$("archiveStorageBox").style.display=profile.role==="admin"?"block":"none";
   const canModerate=profile.role==="editor"||profile.role==="admin";
   if($("photoSubmissionReviewBox"))$("photoSubmissionReviewBox").style.display=canModerate?"block":"none";
   if($("identityReviewBox"))$("identityReviewBox").style.display=canModerate?"block":"none";
   if($("moderationBox"))$("moderationBox").style.display=canModerate?"block":"none";
   if(profile.role==="admin"){loadAdminUsers();loadArchiveStorageStatus()}
   if(canModerate){loadPhotoSubmissionReview();loadIdentityReview();loadModerationPanel()}
   subscribeNotifications();setStatus("Онлайн · "+profile.role);
 } else {
   $("profileBox").innerHTML='<span class="small">Вход не выполнен.</span>';$("loginBox").style.display="block";$("consentGateBox").style.display="none";$("nameBox").style.display="none";$("privacyBox").style.display="none";$("composerWrap").style.display="none";
   if($("photoContributeBox"))$("photoContributeBox").style.display="none";
   if($("archiveUploadBox"))$("archiveUploadBox").style.display="none";
   if($("myPhotoSubmissionsBox"))$("myPhotoSubmissionsBox").style.display="none";
   if($("photoSubmissionReviewBox"))$("photoSubmissionReviewBox").style.display="none";
   document.querySelectorAll(".editorPhotoMode").forEach(x=>x.style.display="none");if($("adminUsersBox"))$("adminUsersBox").style.display="none";if($("archiveStorageBox"))$("archiveStorageBox").style.display="none";if($("identityReviewBox"))$("identityReviewBox").style.display="none";if($("moderationBox"))$("moderationBox").style.display="none";if($("notifyBtn"))$("notifyBtn").style.display="none";$("homeState").innerHTML="Для просмотра внутреннего архива войдите через <b>Профиль</b>.";loadHome();setStatus("Нужен вход");
 }
}
async function init(){
 await syncAuthState({render:false});
 renderRooms();renderProfile();
 if($("themeSelect")){$("themeSelect").value=getTheme();$("themeSelect").onchange=()=>{localStorage.setItem(THEME_KEY,$("themeSelect").value);applyTheme($("themeSelect").value)}}
 if(profile){subscribe();subscribeNotifications();setTimeout(prefetchClassPhotoUrls,0);}
 if(!user||OPEN_LOGIN_ON_START||OPEN_REGISTER_ON_START)showView("profile");
 if(OPEN_REGISTER_ON_START&&!user)setTimeout(openQuickRegistration,120);
 if(authReturn.type==="signup"||authReturn.error||authReturn.hasToken)setTimeout(showSignupConfirmationState,180);
}
async function login(){
 $("loginError").className="";
 $("loginError").textContent="";
 const email=$("email").value.trim();
 if(!email){$("loginError").className="err";$("loginError").textContent="Введите e-mail.";return}
 $("loginBtn").disabled=true;
 try{
  const {error}=await sb.auth.signInWithOtp({
    email,
    options:{shouldCreateUser:false,emailRedirectTo:SITE_URL}
  });
  if(error)throw error;
  $("loginError").className="ok";
  $("loginError").innerHTML="<b>Письмо отправлено.</b><br>Откройте его на этом устройстве и нажмите «Войти в Хроники-78». Пароль вводить не нужно.";
 }catch(e){
  $("loginError").className="err";
  $("loginError").textContent=(e.message||String(e)).includes("Signups not allowed")
    ?"Такой e-mail ещё не зарегистрирован. Нажмите «Я здесь впервые · создать доступ»."
    :(e.message||String(e));
 }finally{$("loginBtn").disabled=false}
}
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
async function logout(){if(unsubMsg)unsubMsg();if(unsubReact)unsubReact();if(unsubRead)unsubRead();if(unsubNotif)unsubNotif();await sb.auth.signOut();user=null;profile=null;pendingProfile=null;consentRequired=false;renderProfile();showView("home")}
$("loginBtn").onclick=login;
$("passwordLoginToggle").onclick=()=>{
 const box=$("passwordLoginBox");
 box.style.display=box.style.display==="none"?"block":"none";
};
$("passwordLoginBtn").onclick=passwordLogin;
$("forgotPasswordBtn").onclick=openForgotPassword;

function openQuickRegistration(){
 openPhotoModal("Создать доступ",
   '<div class="notice"><b>Имя + e-mail. Пароль не нужен.</b><br>Мы пришлём одноразовую ссылку. После перехода по ней сайт запомнит вход на этом устройстве.</div>'+
   '<label>Ваше имя</label><input id="pfRegName" autocomplete="name" placeholder="Например, Алексей Петров">'+
   '<label>E-mail</label><input id="pfRegEmail" type="email" autocomplete="email" placeholder="name@example.com">'+
   '<label class="checkItem" style="margin-top:14px"><input id="pfRegConsent" type="checkbox"> <span>Я согласен(на) на обработку моих ФИО, e-mail, сведений профиля и использование моего изображения на архивных фотографиях внутри закрытого архива «Хроники-78». <a href="consent.html" target="_blank" rel="noopener">Полный текст</a></span></label>'+
   '<div class="formHint" style="margin-top:9px">Открытая публикация в интернете, соцсетях или рекламе в это согласие не входит.</div>',
   async()=>{
     const display_name=$("pfRegName").value.trim();
     const email=$("pfRegEmail").value.trim();
     if(!display_name||!email)throw new Error("Введите имя и e-mail.");
     if(!$("pfRegConsent").checked)throw new Error("Нужно подтвердить согласие для закрытого архива.");
     $("photoModalMsg").textContent="Отправляю ссылку для входа…";
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
       '<div class="notice"><b>Готово.</b><br>На '+esc(email)+' отправлено письмо. Откройте его и нажмите ссылку — вы сразу войдёте в «Хроники-78».</div>'+
       '<div class="formHint">Пароль придумывать и запоминать не нужно. Дополнительного одобрения администратора тоже нет.</div>';
     $("photoModalSave").textContent="Понятно";
     photoModalSubmit=async()=>{closePhotoModal();showView("profile")};
   }
 );
 $("photoModalSave").textContent="Получить ссылку";
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

