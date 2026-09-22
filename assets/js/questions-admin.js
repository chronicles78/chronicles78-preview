function questionIsOpen(q){
 const s=String(q.status||"").toLowerCase();
 return !["решён","решено","resolved","closed","закрыт"].includes(s);
}
function questionTags(q){
 const raw=Array.isArray(q.tags)?q.tags:[];
 const extras=[];
 if(q.category)extras.push(q.category);
 if(q.linked_entity_id)extras.push(q.linked_entity_id);
 return [...new Set([...raw,...extras].filter(Boolean))];
}
function openQuestionContext(cacheId){
 const q=questionCache.find(x=>x.cache_id===cacheId);if(!q)return;
 const editor=profile?.role==="editor"||profile?.role==="admin";
 const qt=questionTags(q);
 const about10A=(q.question||"").includes("10А")||qt.includes("10А")||String(q.category||"").includes("10А");
 const targetPerson=questionTargetPersonId(q);
 const person=targetPerson?peopleCache.find(p=>p.id===targetPerson):null;
 const preview=(about10A&&targetPerson)?questionCropHtml(targetPerson):"";
 const actions=[
   {icon:"💬",label:"Обсудить вопрос",kind:"primary",run:()=>discussQuestion(cacheId)},
   {icon:"⌁",label:"Связи и теги",run:()=>showQuestionDetails(cacheId)},
   about10A?{icon:"▧",label:"Открыть общую фотографию 10А",hint:person?"позиция № "+person.number:"",run:()=>openClassPhotoFromQuestion("10А")}:null,
   q.source_message_id?{icon:"↗",label:"Исходное сообщение",run:()=>openQuestionMessage(q.source_message_id)}:null,
   editor&&q.source==="archive"?{icon:questionIsOpen(q)?"✓":"↺",label:questionIsOpen(q)?"Отметить решённым":"Вернуть в работу",run:()=>toggleArchiveQuestion(q.id)}:null
 ];
 openContextSheet({eyebrow:"ОТКРЫТЫЙ ВОПРОС",title:q.question,meta:[q.priority,q.status,q.category].filter(Boolean).join(" · "),preview,actions});
}
function renderQuestions(){
 const rows=questionCache.filter(q=>
   (questionPriority==="all"||q.priority===questionPriority) &&
   (questionStatus==="all"||questionIsOpen(q))
 );
 const total=questionCache.length;
 const openCount=questionCache.filter(questionIsOpen).length;
 const dynamicCount=questionCache.filter(q=>q.source==="chat").length;
 $("questionStats").innerHTML='<b>'+openCount+' открытых</b> из '+total+' вопросов'+(dynamicCount?' · '+dynamicCount+' добавлено из чата':'')+'.';
 $("questionsList").innerHTML=rows.map(q=>{
   const editor=profile?.role==="editor"||profile?.role==="admin";
   const sourceBadge=q.source==="chat"?'<span class="badge">из чата</span>':'<span class="badge">архив</span>';
   const qt=questionTags(q);
   const tags=qt.map(t=>'<button class="tagChip tagLink" data-tag="'+esc(t)+'">'+esc(t)+'</button>').join("");
   const about10A=(q.question||"").includes("10А")||qt.includes("10А")||String(q.category||"").includes("10А");
   const targetPerson=questionTargetPersonId(q);
   const person=targetPerson?peopleCache.find(p=>p.id===targetPerson):null;
   const cropThumb=(about10A&&targetPerson)?questionCropHtml(targetPerson):"";
   const crop=cropThumb
     ?'<div class="questionPhotoRow">'+cropThumb+'<div class="questionCropMeta"><b>Позиция № '+esc(person?.number??targetPerson)+'</b><div class="questionCropHint">'+esc(person?.canonical_name&&person.canonical_name!=="Не установлено"?person.canonical_name:"Имя пока не установлено")+'<br>Нажмите на фрагмент, чтобы открыть общую фотографию.</div></div></div>'
     :'';
   return '<article class="archiveCard questionCard contextObject" data-question-context="'+esc(q.cache_id)+'" tabindex="0"><h3>'+esc(q.question)+'</h3>'+
     '<span class="badge">'+esc(q.priority||"")+'</span><span class="badge">'+esc(q.status||"")+'</span>'+sourceBadge+
     (q.category?'<button class="badge tagLink" data-tag="'+esc(q.category)+'">'+esc(q.category)+'</button>':'')+
     (q.why_it_matters?'<p class="small"><b>Почему важно:</b> '+esc(q.why_it_matters)+'</p>':'')+
     (q.ask?'<p class="small"><b>Кого/что спросить:</b> '+esc(q.ask)+'</p>':'')+
     (q.notes?'<p class="small"><b>Комментарий редакции:</b> '+esc(q.notes)+'</p>':'')+
     (q.resolution_note?'<div class="notice" style="margin-top:8px"><b>Результат:</b> '+esc(q.resolution_note)+'</div>':'')+
     crop+
     (tags?'<div class="tagList">'+tags+'</div>':'')+
     '</article>';
 }).join("")||'<div class="notice">По выбранному фильтру вопросов нет.</div>';
 $("questionsList").querySelectorAll("[data-question-context]").forEach(el=>{el.onclick=e=>{if(e.target.closest("[data-tag]")||e.target.closest("[data-q-crop]"))return;openQuestionContext(el.dataset.questionContext)};el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openQuestionContext(el.dataset.questionContext)}}});
 $("questionsList").querySelectorAll("[data-q-crop]").forEach(b=>b.onclick=async e=>{e.stopPropagation();peopleGroup="10А";selectedPersonId=b.dataset.qCrop;showClassNumbers=true;showView("people");document.querySelectorAll("[data-pgroup]").forEach(x=>x.classList.toggle("on",x.dataset.pgroup==="10А"));await loadClassPhoto();renderPeople();setTimeout(()=>openPersonContext(selectedPersonId),100)});
}
async function loadQuestions(){
 if(!user||!profile?.is_active){
   $("questionStats").textContent="Войдите, чтобы открыть реестр вопросов.";
   $("questionsList").innerHTML='<div class="notice">Сначала войдите в профиль.</div>';
   return;
 }
 $("questionStats").textContent="Загружаю вопросы…";
 const [a,e]=await Promise.all([
   sb.from("archive_questions").select("id,category,priority,status,question,why_it_matters,ask,links,tags,discussion_room,resolution_note").order("priority").order("id"),
   sb.from("editorial_questions").select("id,source_message_id,question,status,priority,linked_entity_type,linked_entity_id,notes,tags,discussion_room,created_at").order("created_at",{ascending:false})
 ]);
 if(a.error||e.error){
   $("questionStats").textContent="Не удалось загрузить реестр.";
   $("questionsList").innerHTML='<div class="notice">'+esc(a.error?.message||e.error?.message)+'</div>';
   return;
 }
 questionCache=[
   ...(a.data||[]).map(q=>({...q,source:"archive",cache_id:"archive:"+q.id})),
   ...(e.data||[]).map(q=>({...q,source:"chat",category:"Редакционный вопрос",cache_id:"chat:"+q.id}))
 ];
 if(!peopleCache.length){
   const {data:pp}=await sb.from("archive_people").select("id,group_name,number,canonical_name").order("group_name").order("number");
   peopleCache=pp||[];
 }
 await loadQuestion10AVisual();
 renderQuestions();
}
async function openClassPhotoFromQuestion(group){
 peopleGroup=group;selectedPersonId=null;showClassNumbers=true;
 showView("people");
 document.querySelectorAll("[data-pgroup]").forEach(x=>x.classList.toggle("on",x.dataset.pgroup===group));
 await loadClassPhoto();renderPeople();
}
async function openQuestionMessage(mid){
 const {data:m,error}=await sb.from("messages").select("id,room_id").eq("id",mid).maybeSingle();
 if(error||!m){alert(error?.message||"Исходное сообщение не найдено.");return}
 currentRoom=m.room_id;renderRooms();showView("chat");subscribe();
 setTimeout(()=>{
   const el=document.querySelector('[data-mid="'+CSS.escape(mid)+'"]');
   el?.scrollIntoView({behavior:"smooth",block:"center"});
 },500);
}
function findQuestion(cacheId){return questionCache.find(q=>q.cache_id===cacheId)}
async function discussQuestion(cacheId){
 const q=findQuestion(cacheId);if(!q)return;
 currentRoom=q.discussion_room||"general";
 questionDiscussion={id:q.id,label:q.question.slice(0,70)};
 renderRooms();showView("chat");subscribe();
 $("composer").value='Вопрос '+q.id+': '+q.question+'\n';
 renderReply();
 setTimeout(()=>$("composer").focus(),150);
}
function showQuestionDetails(cacheId){
 const q=findQuestion(cacheId);if(!q)return;
 const tags=questionTags(q);
 const links=Array.isArray(q.links)?q.links:[];
 openPhotoModal("Связи и теги вопроса",
   '<div class="notice">'+esc(q.question)+'</div>'+
   '<label>Теги</label><div class="tagList">'+(tags.length?tags.map(t=>'<button class="tagChip tagLink" data-tag="'+esc(t)+'">'+esc(t)+'</button>').join(""):'<span class="small">Теги пока не заданы.</span>')+'</div>'+
   (links.length?'<label>Связанные объекты</label><div class="tagList">'+links.map(x=>'<button class="tagChip tagLink" data-tag="'+esc(x)+'">'+esc(x)+'</button>').join("")+'</div>':'')+
   (q.linked_entity_id?'<label>Прямая связь</label><div class="tagList"><span class="tagChip">'+esc((q.linked_entity_type||"объект")+" · "+q.linked_entity_id)+'</span></div>':'')+
   '<div class="formHint">Обсуждение вопроса создаёт сообщения в чате, связанные с этим вопросом.</div>',
   async()=>{}
 );
 $("photoModalSave").textContent="Закрыть";
 const old=photoModalSubmit;
 photoModalSubmit=async()=>{closePhotoModal();$("photoModalSave").textContent="Сохранить"};
}async function toggleArchiveQuestion(id){
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const q=questionCache.find(x=>x.id===id);if(!q)return;
 const open=["открыт","open"].includes(String(q.status||"").toLowerCase());
 const {error}=await sb.from("archive_questions").update({status:open?"решён":"открыт"}).eq("id",id);
 if(error){alert("Статус не изменён: "+error.message);return}
 await loadQuestions();
}
document.querySelectorAll("[data-qpriority]").forEach(b=>b.onclick=()=>{
 questionPriority=b.dataset.qpriority;
 document.querySelectorAll("[data-qpriority]").forEach(x=>x.classList.toggle("on",x===b));
 renderQuestions();
});
document.querySelectorAll("[data-qstatus]").forEach(b=>b.onclick=()=>{
 questionStatus=b.dataset.qstatus;
 document.querySelectorAll("[data-qstatus]").forEach(x=>x.classList.toggle("on",x===b));
 renderQuestions();
});

async function toggleEditorialFlag(mid,field){
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const m=lastMessages.find(x=>x.id===mid); if(!m)return;
 const patch={}; patch[field]=!m[field];
 const {error}=await sb.from("messages").update(patch).eq("id",mid);
 if(error)alert("Не изменено: "+error.message); else loadRoom();
}
async function linkStory(mid){
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const {data:stories,error}=await sb.from("archive_stories").select("id,title").order("id");
 if(error){alert(error.message);return}
 const m=lastMessages.find(x=>x.id===mid);
 openPhotoModal("Связать сообщение с историей",
   '<div class="notice">'+esc((m?.body||"Сообщение без текста").slice(0,180))+'</div>'+
   '<label>История</label><select id="pfStoryLink"><option value="">— выберите историю —</option>'+
   (stories||[]).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.id+" — "+s.title)+'</option>').join("")+
   '</select>',
   async()=>{
     const id=$("pfStoryLink").value;
     if(!id)throw new Error("Выберите историю.");
     const {error:ue}=await sb.from("messages").update({linked_entity_type:"story",linked_entity_id:id}).eq("id",mid);
     if(ue)throw ue;
     await loadRoom();
   }
 );
}
async function createQuestionFromMessage(mid){
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const m=lastMessages.find(x=>x.id===mid);
 openPhotoModal("Редакционный вопрос",
   '<div class="notice">'+esc((m?.body||"Сообщение без текста").slice(0,180))+'</div>'+
   '<label>Вопрос</label><textarea id="pfQuestion" placeholder="Что нужно уточнить у участников?"></textarea>'+
   '<label>Приоритет</label><select id="pfPriority"><option>P1</option><option selected>P2</option><option>P3</option></select>'+
   '<label>Комментарий редакции</label><textarea id="pfQuestionNote" placeholder="Почему это важно, кого спросить, что проверить…"></textarea>',
   async()=>{
     const q=$("pfQuestion").value.trim();
     if(!q)throw new Error("Сформулируйте вопрос.");
     const note=$("pfQuestionNote").value.trim();
     const {error}=await sb.from("editorial_questions").insert({
       source_message_id:mid,created_by:user.id,question:q,status:"open",priority:$("pfPriority").value,
       notes:note||null
     });
     if(error)throw error;
   }
 );
}

async function loadIdentityReview(){
 if(!["editor","admin"].includes(profile?.role)||!$("identityReviewList"))return;
 const {data,error}=await sb.from("identity_suggestions").select("id,class_photo_id,person_id,suggested_name,note,submitted_by,created_at,status").eq("status","pending").order("created_at",{ascending:true});
 if(error){$("identityReviewList").innerHTML='<div class="err">'+esc(error.message)+'</div>';return}
 const rows=data||[];
 const userIds=[...new Set(rows.map(x=>x.submitted_by))];
 const personIds=[...new Set(rows.map(x=>x.person_id))];
 const photoIds=[...new Set(rows.map(x=>x.class_photo_id))];
 const [{data:ps},{data:persons},{data:photos},{data:regions}]=await Promise.all([
   userIds.length?sb.from("profiles").select("id,display_name").in("id",userIds):Promise.resolve({data:[]}),
   personIds.length?sb.from("archive_people").select("id,group_name,number,canonical_name,identification_status").in("id",personIds):Promise.resolve({data:[]}),
   photoIds.length?sb.from("class_photos").select("id,storage_path,source_width,source_height").in("id",photoIds):Promise.resolve({data:[]}),
   photoIds.length?sb.from("class_photo_regions").select("class_photo_id,person_id,x,y,w,h").in("class_photo_id",photoIds):Promise.resolve({data:[]})
 ]);
 const names=Object.fromEntries((ps||[]).map(x=>[x.id,x.display_name]));
 const personMap=Object.fromEntries((persons||[]).map(x=>[x.id,x]));
 const photoMap=Object.fromEntries((photos||[]).map(x=>[x.id,x]));
 const regionMap=Object.fromEntries((regions||[]).map(x=>[x.class_photo_id+"|"+x.person_id,x]));
 const urlMap={};
 await Promise.all((photos||[]).map(async cp=>{if(cp.storage_path)urlMap[cp.id]=await archiveSignedImage(cp.storage_path)}));
 $("identityReviewList").className="";
 $("identityReviewList").innerHTML=rows.map(x=>{
   const p=personMap[x.person_id];
   const cp=photoMap[x.class_photo_id],r=regionMap[x.class_photo_id+"|"+x.person_id],url=urlMap[x.class_photo_id];
   const crop=(cp&&r&&url)?cropImageHtml(url,cp,r,"identityReviewCrop",72/92,0,0,'aria-label="Выбранное лицо"',"Выбранное лицо"):"";
   return '<div class="reviewCard"><div class="identityReviewTop">'+
     (crop||'<div class="identityReviewCrop"></div>')+
     '<div><div class="identityReviewName">'+esc(x.suggested_name)+'</div><div class="small">'+esc((p?.group_name||"")+" · позиция № "+(p?.number??"")+" · "+x.person_id)+'</div>'+
     '<div style="margin-top:6px">'+esc(x.note||"Без комментария")+'</div><div class="small" style="margin-top:5px">Предложил: '+esc(names[x.submitted_by]||"Участник")+'</div></div></div>'+
     '<div class="reviewActions"><button class="secondary" data-accept-identity="'+x.id+'">Подтвердить</button><button class="secondary" data-reject-identity="'+x.id+'">Отклонить</button></div></div>';
 }).join("")||'<div class="notice">Новых предложений нет.</div>';
 $("identityReviewList").querySelectorAll("[data-accept-identity]").forEach(b=>b.onclick=async()=>{b.disabled=true;const {error}=await sb.rpc("accept_identity_suggestion",{p_id:Number(b.dataset.acceptIdentity)});if(error){alert(error.message);b.disabled=false;return}peopleCache=[];await loadPeople();await loadIdentityReview()});
 $("identityReviewList").querySelectorAll("[data-reject-identity]").forEach(b=>b.onclick=async()=>{const {error}=await sb.rpc("reject_identity_suggestion",{p_id:Number(b.dataset.rejectIdentity)});if(error)alert(error.message);else loadIdentityReview()});
}
async function loadModerationPanel(){
 if(!["editor","admin"].includes(profile?.role)||!$("moderationList"))return;
 const {data,error}=await sb.from("moderation_reports").select("*").eq("status","open").order("created_at",{ascending:true});
 if(error){$("moderationList").innerHTML='<div class="err">'+esc(error.message)+'</div>';return}
 const rows=data||[];
 const reporters=[...new Set(rows.map(x=>x.reporter_id))];
 const {data:ps}=reporters.length?await sb.from("profiles").select("id,display_name").in("id",reporters):{data:[]};
 const names=Object.fromEntries((ps||[]).map(x=>[x.id,x.display_name]));
 const msgIds=rows.filter(x=>x.entity_type==="message").map(x=>x.entity_id);
 const commentIds=rows.filter(x=>x.entity_type==="city_comment").map(x=>Number(x.entity_id));
 const {data:msgs}=msgIds.length?await sb.from("messages").select("id,body,author:profiles!messages_author_id_fkey(display_name)").in("id",msgIds):{data:[]};
 const {data:comments}=commentIds.length?await sb.from("city_essay_comments").select("id,body,profiles(display_name)").in("id",commentIds):{data:[]};
 const msgMap=Object.fromEntries((msgs||[]).map(x=>[String(x.id),{body:x.body,author:x.author?.display_name}]));
 const comMap=Object.fromEntries((comments||[]).map(x=>[String(x.id),{body:x.body,author:(Array.isArray(x.profiles)?x.profiles[0]:x.profiles)?.display_name}]));
 $("moderationList").className="";
 $("moderationList").innerHTML=rows.map(r=>{
   const item=r.entity_type==="message"?msgMap[r.entity_id]:comMap[r.entity_id];
   return '<div class="moderationCard"><b>'+esc(r.entity_type==="message"?"Сообщение в чате":"Комментарий к этюду")+'</b>'+
    '<div class="small">Жалоба от: '+esc(names[r.reporter_id]||"Участник")+'</div>'+
    '<div class="notice" style="margin-top:7px"><b>Причина:</b> '+esc(r.reason)+'</div>'+
    '<div style="margin-top:7px"><b>'+esc(item?.author||"Автор")+'</b><br>'+esc((item?.body||"Материал уже удалён").slice(0,600))+'</div>'+
    '<div class="moderationActions"><button class="secondary" data-mod-delete="'+r.id+'">Удалить материал</button><button class="secondary" data-mod-reject="'+r.id+'">Отклонить жалобу</button></div></div>';
 }).join("")||'<div class="notice">Открытых жалоб нет.</div>';
 $("moderationList").querySelectorAll("[data-mod-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Удалить этот материал?"))return;b.disabled=true;const {error}=await sb.rpc("resolve_moderation_report",{p_id:Number(b.dataset.modDelete),p_action:"delete"});if(error){alert(error.message);b.disabled=false;return}await loadModerationPanel();if(activeViewId()==="chat")loadRoom()});
 $("moderationList").querySelectorAll("[data-mod-reject]").forEach(b=>b.onclick=async()=>{const {error}=await sb.rpc("resolve_moderation_report",{p_id:Number(b.dataset.modReject),p_action:"reject"});if(error)alert(error.message);else loadModerationPanel()});
}

async function loadArchiveStorageStatus(){
 if(profile?.role!=="admin"||!$("archiveStorageState"))return;
 const [{data:backend,error:be},{data:objects,error:oe}]=await Promise.all([
   sb.from("archive_storage_backends").select("code,display_name,enabled,root_folder_id,originals_folder_id,backups_folder_id,config").eq("code","google_drive").maybeSingle(),
   sb.from("archive_original_objects").select("id,mirror_status,file_size,source_deleted_at,external_provider")
 ]);
 if(be||oe){
   $("archiveStorageState").className="err";
   $("archiveStorageState").textContent=(be||oe).message;
   return;
 }
 const rows=objects||[];
 const stats={pending:0,mirrored:0,failed:0,discarded:0,mirroring:0};
 let bytes=0;
 rows.forEach(x=>{if(stats[x.mirror_status]!==undefined)stats[x.mirror_status]++;if(!x.source_deleted_at)bytes+=Number(x.file_size)||0});
 const folderUrl=backend?.originals_folder_id?"https://drive.google.com/drive/folders/"+encodeURIComponent(backend.originals_folder_id):"";
 const enabled=!!backend?.enabled;
 $("archiveStorageState").className="notice";
 $("archiveStorageState").innerHTML=
   '<b>'+(enabled?'Google Drive подключён':'Google Drive подготовлен, но ещё не подключён к сайту')+'</b><br>'+
   'Оригиналов под учётом: '+rows.length+
   ' · ожидают: '+stats.pending+
   ' · зеркалировано: '+stats.mirrored+
   (stats.failed?' · ошибок: '+stats.failed:'')+
   '<br>Исходники, остающиеся в Supabase: '+esc(fmtFileSize(bytes))+
   (folderUrl?'<br><a href="'+folderUrl+'" target="_blank" rel="noopener">Открыть папку оригиналов в Google Drive</a>':'')+
   (!enabled?'<div class="small" style="margin-top:8px">Для автоматической выгрузки осталось один раз добавить OAuth-секреты Google Drive в Edge Functions. До этого фото продолжают надёжно храниться в Supabase.</div>':'')+
   (enabled?'<div style="margin-top:10px"><button class="secondary" id="mirrorDriveBtn" type="button">Зеркалировать до 5 оригиналов</button><div id="mirrorDriveMsg" class="small"></div></div>':'');
 if(enabled&&$("mirrorDriveBtn")){
   $("mirrorDriveBtn").onclick=async()=>{
     $("mirrorDriveBtn").disabled=true;$("mirrorDriveMsg").textContent="Выгружаю…";
     try{
       const {data,error}=await sb.functions.invoke("mirror-original-to-drive",{body:{limit:5,releaseSupabase:false}});
       if(error||!data?.ok)throw new Error(error?.message||data?.detail||data?.error||"Не удалось выполнить зеркалирование.");
       $("mirrorDriveMsg").textContent="Обработано: "+Number(data.processed||0)+".";
       await loadArchiveStorageStatus();
     }catch(e){$("mirrorDriveMsg").className="err";$("mirrorDriveMsg").textContent=e.message||String(e)}
     finally{if($("mirrorDriveBtn"))$("mirrorDriveBtn").disabled=false}
   };
 }
}

async function loadAdminUsers(){
 if(profile?.role!=="admin"||!$("adminUsersList"))return;
 const {data,error}=await sb.rpc("admin_pending_users");
 if(error){$("adminUsersList").innerHTML='<div class="err">'+esc(error.message)+'</div>';return}
 const rows=data||[];
 $("adminUsersList").className="";
 $("adminUsersList").innerHTML=rows.map(u=>{
   const confirmed=!!u.email_confirmed_at;
   return '<div class="archiveCard"><h3>'+esc(u.display_name||"Без имени")+'</h3>'+
    '<div class="small">'+esc(u.email||"")+'</div>'+
    '<div style="margin-top:6px">'+
      '<span class="badge">'+(confirmed?"e-mail подтверждён":"ждёт подтверждения e-mail")+'</span>'+
      '<span class="badge">'+(u.has_consent?"согласие есть":"согласие не принято")+'</span>'+
      '<span class="badge">'+(u.access_blocked?"доступ отключён":(u.is_active?"доступ активен":"доступ не активен"))+'</span>'+
    '</div>'+
    '<div class="small" style="margin-top:6px">Регистрация: '+new Date(u.created_at).toLocaleString("ru-RU")+'</div>'+
    (u.access_blocked&&confirmed?'<button class="secondary" data-admin-activate="'+u.user_id+'">Включить доступ</button>':'')+
    (!u.access_blocked&&u.is_active?'<button class="secondary" data-admin-disable="'+u.user_id+'">Отключить доступ</button>':'')+
    (!confirmed?'<div class="notice" style="margin-top:8px">Остался только переход по ссылке из письма. Ручная активация администратором не нужна.</div>':'')+
    '</div>';
 }).join("")||'<div class="notice">Участников пока нет.</div>';
 $("adminUsersList").querySelectorAll("[data-admin-activate]").forEach(b=>b.onclick=()=>adminSetAccess(b.dataset.adminActivate,true));
 $("adminUsersList").querySelectorAll("[data-admin-disable]").forEach(b=>b.onclick=()=>adminSetAccess(b.dataset.adminDisable,false));
}
async function adminSetAccess(uid,on){
 const {error}=await sb.rpc("admin_set_profile_access",{p_user_id:uid,p_is_active:on,p_person_id:null,p_class_group:null});
 if(error){alert("Не изменено: "+error.message);return}
 await loadAdminUsers();
}
init();
