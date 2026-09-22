const archiveSignedCache=new Map();
async function archiveSignedImage(path){
 if(!path)return null;
 const hit=archiveSignedCache.get(path);
 if(hit&&hit.expires>Date.now())return hit.url;
 const {data,error}=await sb.storage.from("archive-media").createSignedUrl(path,3600);
 if(error)return null;
 const url=data?.signedUrl||null;
 if(url)archiveSignedCache.set(path,{url,expires:Date.now()+55*60*1000});
 return url;
}
async function prefetchClassPhotoUrls(){
 if(!profile?.is_active)return;
 try{
   const {data:photos,error}=await sb.from("class_photos").select("storage_path").not("storage_path","is",null);
   if(error)return;
   const missing=(photos||[]).map(x=>x.storage_path).filter(path=>{
     const hit=archiveSignedCache.get(path);
     return path&&!(hit&&hit.expires>Date.now());
   });
   if(!missing.length)return;
   const {data,error:se}=await sb.storage.from("archive-media").createSignedUrls(missing,3600);
   if(se)return;
   (data||[]).forEach((row,i)=>{
     const url=row?.signedUrl||null,path=missing[i];
     if(url&&path)archiveSignedCache.set(path,{url,expires:Date.now()+55*60*1000});
   });
 }catch(e){}
}
function photoNeedsClarification(m){
 const s=String(m.data?.identification_status||"").toLowerCase();
 return /не установ|уточн|частич|треб|не закреп|не выполн|не найден|остается/.test(s);
}
function mediaPeopleNames(m){
 const ids=Array.isArray(m.data?.people)?m.data.people:[];
 return ids.map(id=>peopleCache.find(p=>p.id===id)?.canonical_name||id);
}

function visualTopicSelectHtml(value=""){
 return '<select id="pfVisualTopic"><option value="">— без визуальной темы —</option>'+
   visualTopicCache.map(v=>'<option value="'+esc(v.id)+'" '+(v.id===value?'selected':'')+'>'+esc(v.id+" — "+v.title)+'</option>').join("")+
   '</select>';
}
function renderVisualRegistry(){
 const q=($("photoSearch")?.value||"").trim().toLowerCase();
 let rows=[...visualTopicCache];
 if(q)rows=rows.filter(v=>JSON.stringify(v).toLowerCase().includes(q));
 const mediaCounts={};
 mediaCache.forEach(m=>{if(m.visual_topic_id)mediaCounts[m.visual_topic_id]=(mediaCounts[m.visual_topic_id]||0)+1});
 $("photoStats").innerHTML='<b>'+visualTopicCache.length+' визуальных тем</b> · принцип: свои снимки — для факта; внешние — для атмосферы.';
 $("photosList").className="visualRegistryGrid";
 $("photosList").innerHTML=
   '<div class="visualRule" style="grid-column:1/-1"><b>Редакционное правило.</b> Внешнее атмосферное фото нельзя выдавать за реальное место или событие класса. Для собственных снимков фиксируем владельца и разрешение на публикацию; для внешних — правообладателя и условия использования.</div>'+
   rows.map(v=>'<article class="visualRegistryCard">'+
     '<div class="visualRegistryMeta"><span class="badge">'+esc(v.id)+'</span><span class="badge">'+esc(v.priority||"")+'</span><span class="badge">'+esc(v.search_status||"")+'</span><span class="badge">'+esc(v.image_type||"")+'</span></div>'+
     '<h3>'+esc(v.title)+'</h3>'+
     '<div class="visualRegistryBlock"><b>Что ищем</b>'+esc(v.what_to_find||"—")+'</div>'+
     '<div class="visualRegistryBlock"><b>Свои фото: проверить</b>'+esc(v.own_photo_check||"—")+'</div>'+
     (v.external_material?'<div class="visualRegistryBlock"><b>Внешний материал</b>'+esc(v.external_material)+'</div>':'')+
     '<div class="visualRegistryBlock"><b>Зачем в проекте</b>'+esc(v.function_in_book||"—")+'</div>'+
     '<div class="visualRegistryBlock"><b>Права</b>'+esc(v.legal_status||"—")+'</div>'+
     '<div class="visualRegistryBlock"><b>Уже в архиве</b>'+(mediaCounts[v.id]||0)+' фото</div>'+
     '<div class="visualRegistryActions"><button class="secondary" type="button" data-visual-own="'+esc(v.id)+'">Наши фото</button>'+
       ((profile?.role==="editor"||profile?.role==="admin")?'<button class="secondary" type="button" data-visual-add="'+esc(v.id)+'">＋ Добавить фото</button>':'')+
       (v.source_url?'<a class="secondary visualCandidateLink" href="'+esc(v.source_url)+'" target="_blank" rel="noopener">Источник ↗</a>':'')+
     '</div></article>').join("")+
   (!rows.length?'<div class="notice">Поиск ничего не нашёл.</div>':'');
 $("photosList").querySelectorAll("[data-visual-own]").forEach(b=>b.onclick=()=>{photoMode="archive";mediaFocus=null;photoFilter="all";document.querySelectorAll("[data-photomode]").forEach(x=>x.classList.toggle("on",x.dataset.photomode==="archive"));$("photoArchiveToolbar").style.display="";$("photoSearch").value="";renderPhotoGallery();const id=b.dataset.visualOwn;const linked=mediaCache.filter(m=>m.visual_topic_id===id);if(linked.length){$("photoSearch").value=id;renderPhotoGallery()}});
 $("photosList").querySelectorAll("[data-visual-add]").forEach(b=>b.onclick=()=>{pendingVisualTopicId=b.dataset.visualAdd;$("newArchivePhotoInput").value="";$("newArchivePhotoInput").click()});
}
function renderVisualCandidates(){
 const q=($("photoSearch")?.value||"").trim().toLowerCase();
 let rows=[...visualCandidateCache];
 if(q)rows=rows.filter(v=>JSON.stringify(v).toLowerCase().includes(q));
 $("photoStats").innerHTML='<b>'+visualCandidateCache.length+' внешних кандидатов</b> · кандидат не считается разрешённым к публикации, пока не проверены источник и права.';
 $("photosList").className="visualRegistryGrid";
 $("photosList").innerHTML=rows.map(v=>'<article class="visualRegistryCard">'+
   '<div class="visualRegistryMeta"><span class="badge">'+esc(v.id)+'</span><span class="badge">'+esc(v.status||"")+'</span>'+(v.linked_visual_topic_id?'<span class="badge">'+esc(v.linked_visual_topic_id)+'</span>':'')+'</div>'+
   '<h3>'+esc(v.title)+'</h3>'+
   '<div class="visualRegistryBlock"><b>Тема</b>'+esc(v.topic||"—")+'</div>'+
   '<div class="visualRegistryBlock"><b>Год / место</b>'+esc([v.year_text,v.place_text].filter(Boolean).join(" · ")||"—")+'</div>'+
   '<div class="visualRegistryBlock"><b>Почему подходит</b>'+esc(v.rationale||"—")+'</div>'+
   '<div class="visualRegistryBlock"><b>Права / действие</b>'+esc(v.rights_action||"—")+'</div>'+
   '<div class="visualRegistryBlock"><b>Источник</b>'+esc(v.source_name||"—")+'</div>'+
   (v.source_url?'<div class="visualRegistryActions"><a class="secondary visualCandidateLink" href="'+esc(v.source_url)+'" target="_blank" rel="noopener">Открыть источник ↗</a></div>':'')+
   '</article>').join("")||'<div class="notice">Кандидатов не найдено.</div>';
}
function renderPhotosSection(){
 if(!(profile?.role==="editor"||profile?.role==="admin")&&photoMode!=="archive")photoMode="archive";
 $("photoArchiveToolbar").style.display=photoMode==="archive"?"":"none";
 if(photoMode==="registry")renderVisualRegistry();
 else if(photoMode==="candidates")renderVisualCandidates();
 else renderPhotoGallery();
}
function openPhotoContext(id){
 const m=mediaCache.find(x=>x.id===id);if(!m)return;
 const editor=profile?.role==="editor"||profile?.role==="admin";
 const preview=mediaSigned[m.id]?'<img src="'+esc(mediaSigned[m.id])+'" alt="'+esc(m.title)+'">':"";
 const meta=[m.approx_date_text,m.location_text,m.quality_status].filter(Boolean).join(" · ");
 const actions=[
   {icon:"▧",label:"Рассмотреть фотографию",kind:"primary",run:()=>openArchivePhoto(id)},
   m.linked_story?{icon:"▤",label:"Открыть связанную историю",run:()=>{showView("stories");openStory(m.linked_story)}}:null,
   editor?{icon:"✎",label:"Редактировать карточку",hint:"Название, люди, источник, дата и место",run:()=>editArchiveCard(id)}:null,
   editor?{icon:"↥",label:"Заменить / улучшить файл",run:()=>{archiveReplaceId=id;$("replaceArchivePhotoInput").value="";$("replaceArchivePhotoInput").click()}}:null,
   editor?{icon:"↺",label:"История версий",run:()=>showArchiveVersions(id)}:null
 ];
 openContextSheet({eyebrow:"ФОТОАРХИВ",title:m.title,meta,preview,actions});
}
function renderPhotoGallery(){
 let arr=mediaFocus?mediaCache.filter(m=>m.id===mediaFocus):[...mediaCache];
 const q=($("photoSearch")?.value||"").trim().toLowerCase();
 if(photoFilter==="story")arr=arr.filter(m=>!!m.linked_story);
 if(photoFilter==="clarify")arr=arr.filter(photoNeedsClarification);
 if(photoFilter==="unlinked")arr=arr.filter(m=>!m.linked_story);
 if(q)arr=arr.filter(m=>JSON.stringify([m.id,m.title,m.category,m.linked_story,m.quality_status,m.source_note,m.data,m.visual_topic_id,m.provenance_type,m.original_owner,m.approx_date_text,m.location_text,m.attribution_confidence,m.publication_permission,m.legal_status,mediaPeopleNames(m)]).toLowerCase().includes(q));
 const total=mediaCache.length,withStory=mediaCache.filter(m=>m.linked_story).length,clarify=mediaCache.filter(photoNeedsClarification).length;
 $("photoStats").innerHTML='<b>'+total+'</b> фотографий · <b>'+withStory+'</b> связаны с историями'+(clarify?' · <b>'+clarify+'</b> ждут уточнения':'');
 const editor=profile?.role==="editor"||profile?.role==="admin";
 $("photosList").className="photoGrid";
 $("photosList").innerHTML=arr.map((m,idx)=>{
   const names=mediaPeopleNames(m);
   const desc=m.data?.visual_description||"";
   const whenWhere=[m.approx_date_text,m.location_text].filter(Boolean).join(" · ");
   const origin=m.provenance_type||"";
   const readerCaption=whenWhere||(origin?origin:"Из архива «Хроник-78»");
   const lead=!mediaFocus&&photoFilter==="all"&&!q&&idx===0&&!!mediaSigned[m.id];
   return '<article class="photoTile contextObject '+(lead?"photoAlbumLead":"")+'" data-photo-context="'+esc(m.id)+'" tabindex="0">'+
     '<div class="photoTileImage">'+
       (mediaSigned[m.id]?'<img '+(lead?'loading="eager" fetchpriority="high"':'loading="lazy" fetchpriority="low"')+' decoding="async" src="'+mediaSigned[m.id]+'" alt="'+esc(m.title)+'">':'<div class="photoTileMissing">Фотография ещё не загружена</div>')+
     '</div>'+
     '<div class="photoTileBody"><div class="photoTileCaption">'+esc(readerCaption)+'</div><h3>'+esc(m.title)+'</h3>'+
       (desc?'<div class="photoTileDesc">'+esc(desc)+'</div>':'')+
       (names.length?'<div class="photoTilePeople"><b>На фото:</b> '+esc(names.slice(0,5).join(", "))+(names.length>5?"…":"")+'</div>':'')+
       (photoNeedsClarification(m)?'<div class="photoTilePeople"><b>Помогите уточнить:</b> '+esc(m.data?.identification_status||"дата, место или люди")+'</div>':'')+
       '<div class="photoTileActions"><span class="small">Нажмите, чтобы выбрать действие</span></div>'+
       (editor?'<div class="photoEditorialMeta"><button class="badge tagLink" data-tag="'+esc(m.id)+'">'+esc(m.id)+'</button>'+
         (m.linked_story?'<button class="badge tagLink" data-tag="'+esc(m.linked_story)+'">'+esc(m.linked_story)+'</button>':'')+
         (m.visual_topic_id?'<span class="badge">'+esc(m.visual_topic_id)+'</span>':'')+
         (m.quality_status?'<span class="badge">'+esc(m.quality_status)+'</span>':'')+
         (m.publication_permission?'<span class="badge">'+esc(m.publication_permission)+'</span>':'')+
       '</div>':'')+
     '</div></article>';
 }).join("")||'<div class="notice">По выбранному фильтру фотографий нет.</div>';
 $("photosList").querySelectorAll("[data-photo-context]").forEach(el=>{el.onclick=e=>{if(e.target.closest("[data-tag]"))return;openPhotoContext(el.dataset.photoContext)};el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openPhotoContext(el.dataset.photoContext)}}});
}
async function openArchivePhoto(id){
 const m=mediaCache.find(x=>x.id===id);if(!m)return;
 const editor=profile?.role==="editor"||profile?.role==="admin";
 const names=mediaPeopleNames(m);
 const image=mediaSigned[m.id]?'<figure class="photoMemoryFigure"><img class="photoDetailImage" src="'+mediaSigned[m.id]+'" alt="'+esc(m.title)+'">'+
   ((m.approx_date_text||m.location_text||m.original_owner)?'<figcaption>'+esc([m.approx_date_text,m.location_text,m.original_owner?"из архива "+m.original_owner:""].filter(Boolean).join(" · "))+'</figcaption>':'')+
   '</figure>':'<div class="notice">Файл изображения ещё не загружен.</div>';
 const people=names.length?'<div class="photoDetailPeople"><b>На фотографии:</b> '+names.map(n=>'<span class="badge">'+esc(n)+'</span>').join("")+'</div>':'<div class="small">Люди на фотографии пока не закреплены.</div>';
 const readerMeta=
   (m.data?.visual_description?'<p class="photoMemoryText">'+esc(m.data.visual_description)+'</p>':'')+
   people+
   (photoNeedsClarification(m)?'<div class="memoryArchiveNote"><b>Память ещё работает.</b> '+esc(m.data?.identification_status||"Дата, место или участники требуют уточнения.")+'</div>':'')+
   (m.linked_story?'<div class="questionActions"><button class="secondary" type="button" data-detail-story="'+esc(m.linked_story)+'">Читать связанную историю</button></div>':'');
 const editorial=editor?'<div class="photoDetailEditorial"><div class="memoryEyebrow">РЕДАКТОРСКАЯ КАРТОЧКА</div>'+
   '<div class="photoTileMeta"><span class="badge">'+esc(m.id)+'</span><span class="badge">'+esc(m.category||"")+'</span><span class="badge">'+esc(m.quality_status||"")+'</span>'+(m.visual_topic_id?'<span class="badge">'+esc(m.visual_topic_id)+'</span>':'')+'</div>'+
   (m.source_note?'<p class="small"><b>Источник:</b> '+esc(m.source_note)+'</p>':'')+
   (m.original_owner?'<p class="small"><b>Владелец оригинала:</b> '+esc(m.original_owner)+'</p>':'')+
   (m.attribution_confidence?'<p class="small"><b>Атрибуция:</b> '+esc(m.attribution_confidence)+(m.attributed_by?" · "+esc(m.attributed_by):"")+'</p>':'')+
   (m.publication_permission?'<p class="small"><b>Публикация:</b> '+esc(m.publication_permission)+'</p>':'')+
   (m.legal_status?'<p class="small"><b>Правовой статус:</b> '+esc(m.legal_status)+'</p>':'')+
   '<div class="small" style="margin-top:10px">Редакторские действия доступны из меню самой фотографии.</div></div>':'';
 openPhotoModal(m.title,image+readerMeta+editorial,async()=>{});
 $("photoModalSave").textContent="Закрыть";
 photoModalSubmit=async()=>closePhotoModal();
 document.querySelectorAll("[data-detail-story]").forEach(b=>b.onclick=()=>{closePhotoModal();showView("stories");openStory(b.dataset.detailStory)});

}
async function loadPhotos(){
 if(!user||!profile?.is_active){$("photosList").className="";$("photosList").innerHTML='<div class="notice">Сначала войдите в профиль.</div>';return}
 if(!peopleCache.length){
   const {data:pp}=await sb.from("archive_people").select("id,canonical_name,group_name,number").order("group_name").order("number");
   peopleCache=pp||[];
 }
 const [mediaRes,topicRes,candidateRes]=await Promise.all([
   sb.from("archive_media").select("id,title,category,linked_story,archive_file,current_storage_path,current_file_name,quality_status,source_note,data,visual_topic_id,provenance_type,original_owner,approx_date_text,location_text,attributed_by,attribution_confidence,publication_permission,legal_status,reverse_scanned").order("id"),
   sb.from("visual_topics").select("*").order("sort_order"),
   sb.from("visual_candidates").select("*").order("sort_order")
 ]);
 if(mediaRes.error||topicRes.error||candidateRes.error){$("photosList").className="";$("photosList").innerHTML='<div class="notice">'+esc(mediaRes.error?.message||topicRes.error?.message||candidateRes.error?.message)+'</div>';return}
 mediaCache=mediaRes.data||[];visualTopicCache=topicRes.data||[];visualCandidateCache=candidateRes.data||[];
 mediaSigned={};
 await Promise.all(mediaCache.map(async m=>{if(m.current_storage_path)mediaSigned[m.id]=await archiveSignedImage(m.current_storage_path)}));
 renderPhotosSection();
}
document.querySelectorAll("[data-photofilter]").forEach(b=>b.onclick=()=>{
 photoFilter=b.dataset.photofilter;
 mediaFocus=null;
 document.querySelectorAll("[data-photofilter]").forEach(x=>x.classList.toggle("on",x===b));
 renderPhotoGallery();
});
document.querySelectorAll("[data-photomode]").forEach(b=>b.onclick=()=>{
 photoMode=b.dataset.photomode;mediaFocus=null;
 document.querySelectorAll("[data-photomode]").forEach(x=>x.classList.toggle("on",x===b));
 $("photoSearch").value="";
 $("photoSearch").placeholder=photoMode==="archive"?"Поиск по фото, сюжету, описанию…":photoMode==="registry"?"Поиск по визуальным темам…":"Поиск по кандидатам…";
 renderPhotosSection();
});
$("photoSearch").oninput=()=>{mediaFocus=null;renderPhotosSection()};

function fmtFileSize(bytes){
 const n=Number(bytes)||0;
 if(n>=1024*1024)return (n/(1024*1024)).toFixed(n>=10*1024*1024?0:1)+" МБ";
 if(n>=1024)return Math.round(n/1024)+" КБ";
 return n+" Б";
}
function submissionStatusLabel(s){
 return s==="accepted"?"Принято в архив":s==="rejected"?"Не принято":"На проверке";
}
async function submitParticipantPhoto(file,meta){
 const mime=ensureImageFile(file);
 if(!user?.id||!profile?.is_active)throw new Error("Нужно войти в профиль.");
 if(file.size>ARCHIVE_ORIGINAL_MAX_BYTES)throw new Error("Фото больше 25 МБ.");
 const submissionId=crypto.randomUUID();
 const originalPath=user.id+"/submissions/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"-"+safeName(file.name);
 const {error:oe}=await sb.storage.from("archive-originals").upload(originalPath,file,{contentType:mime,upsert:false,cacheControl:"31536000"});
 if(oe)throw oe;
 const payload={
   mode:"submission",submissionId,originalPath,fileName:file.name,title:meta.title,description:meta.description,
   approxDate:meta.approxDate,location:meta.location,peopleNote:meta.peopleNote,sourceNote:meta.sourceNote,
   permissionConfirmed:true
 };
 const {data:server,error:se}=await sb.functions.invoke("process-archive-photo",{body:payload});
 if(!se&&server?.ok)return server;

 const f=await compressArchiveImageFallback(file);
 const previewPath=user.id+"/"+submissionId+"/preview."+f.ext;
 const {error:pe}=await sb.storage.from("archive-pending").upload(previewPath,f.blob,{contentType:f.outMime,upsert:false,cacheControl:"31536000"});
 if(pe){
   await sb.storage.from("archive-originals").remove([originalPath]);
   throw new Error("Не удалось подготовить копию для редакции: "+pe.message);
 }
 const {data:ready,error:re}=await sb.functions.invoke("register-photo-submission",{body:{
   submissionId,originalPath,previewPath,fileName:file.name,
   title:meta.title,description:meta.description,approxDate:meta.approxDate,location:meta.location,
   peopleNote:meta.peopleNote,sourceNote:meta.sourceNote,permissionConfirmed:true,
   originalFileSize:file.size,sourceWidth:f.sourceWidth,sourceHeight:f.sourceHeight,
   previewWidth:f.width,previewHeight:f.height,previewFormat:f.ext
 }});
 if(re||!ready?.ok){
   await Promise.allSettled([
     sb.storage.from("archive-pending").remove([previewPath]),
     sb.storage.from("archive-originals").remove([originalPath])
   ]);
   throw new Error(re?.message||ready?.detail||ready?.error||"Не удалось зарегистрировать фотографию.");
 }
 return ready;
}
async function loadMyPhotoSubmissions(){
 if(!user||!profile?.is_active||!$("myPhotoSubmissionsList"))return;
 const {data,error}=await sb.from("photo_submissions")
   .select("id,title,status,media_id,moderator_note,created_at,original_file_name,original_file_size")
   .eq("submitted_by",user.id).order("created_at",{ascending:false}).limit(20);
 if(error){$("myPhotoSubmissionsList").className="err";$("myPhotoSubmissionsList").textContent=error.message;return}
 const rows=data||[];
 $("myPhotoSubmissionsList").className="";
 $("myPhotoSubmissionsList").innerHTML=rows.map(x=>'<div class="photoSubmissionCard">'+
   '<div class="photoSubmissionTitle">'+esc(x.title)+'</div>'+
   '<div class="photoSubmissionMeta">'+esc(submissionStatusLabel(x.status))+' · '+new Date(x.created_at).toLocaleString("ru-RU")+
   (x.original_file_size?' · '+esc(fmtFileSize(x.original_file_size)):'')+'</div>'+
   (x.media_id?'<div class="photoSubmissionText">Добавлено в архив как <b>'+esc(x.media_id)+'</b>.</div>':'')+
   (x.moderator_note?'<div class="photoSubmissionText"><b>Комментарий редакции:</b> '+esc(x.moderator_note)+'</div>':'')+
   (x.media_id?'<div class="photoSubmissionActions"><button class="secondary" data-open-my-media="'+esc(x.media_id)+'">Открыть в фотоархиве</button></div>':'')+
 '</div>').join("")||'<div class="notice">Вы пока не отправляли фотографии.</div>';
 $("myPhotoSubmissionsList").querySelectorAll("[data-open-my-media]").forEach(b=>b.onclick=()=>{
   mediaFocus=b.dataset.openMyMedia;photoMode="archive";showView("photos");
 });
}
async function pendingSubmissionUrls(paths){
 const unique=[...new Set((paths||[]).filter(Boolean))];
 const out={};if(!unique.length)return out;
 const {data,error}=await sb.storage.from("archive-pending").createSignedUrls(unique,3600);
 if(!error)(data||[]).forEach((r,i)=>{if(r?.signedUrl)out[unique[i]]=r.signedUrl});
 return out;
}
async function loadPhotoSubmissionReview(){
 if(!["editor","admin"].includes(profile?.role)||!$("photoSubmissionReviewList"))return;
 const {data,error}=await sb.from("photo_submissions").select("*").eq("status","pending").order("created_at",{ascending:true});
 if(error){$("photoSubmissionReviewList").className="err";$("photoSubmissionReviewList").textContent=error.message;return}
 const rows=data||[];
 const ids=[...new Set(rows.map(x=>x.submitted_by))];
 const {data:ps}=ids.length?await sb.from("profiles").select("id,display_name").in("id",ids):{data:[]};
 const names=Object.fromEntries((ps||[]).map(x=>[x.id,x.display_name]));
 const urls=await pendingSubmissionUrls(rows.map(x=>x.preview_storage_path));
 $("photoSubmissionReviewList").className="";
 $("photoSubmissionReviewList").innerHTML=rows.map(x=>{
   const meta=[x.approx_date_text,x.location_text].filter(Boolean).join(" · ");
   return '<div class="photoSubmissionCard">'+
     '<div class="photoSubmissionTop">'+
       '<div class="photoSubmissionPreview">'+(urls[x.preview_storage_path]?'<img loading="lazy" src="'+esc(urls[x.preview_storage_path])+'" alt="'+esc(x.title)+'">':'')+'</div>'+
       '<div><div class="photoSubmissionTitle">'+esc(x.title)+'</div>'+
       '<div class="photoSubmissionMeta">Отправил(а): '+esc(names[x.submitted_by]||"Участник")+' · '+new Date(x.created_at).toLocaleString("ru-RU")+'</div>'+
       (meta?'<div class="photoSubmissionMeta">'+esc(meta)+'</div>':'')+
       '<div class="photoSubmissionMeta">Оригинал: '+esc(x.original_file_name||"файл")+(x.original_file_size?' · '+esc(fmtFileSize(x.original_file_size)):'')+
       (x.preview_width&&x.preview_height?' · копия '+x.preview_width+'×'+x.preview_height:'')+'</div></div></div>'+
     (x.description?'<div class="photoSubmissionText"><b>Что на фото:</b> '+esc(x.description)+'</div>':'')+
     (x.people_note?'<div class="photoSubmissionText"><b>Кто на фото:</b> '+esc(x.people_note)+'</div>':'')+
     (x.source_note?'<div class="photoSubmissionText"><b>Источник:</b> '+esc(x.source_note)+'</div>':'')+
     '<div class="photoSubmissionActions"><button class="secondary" data-photo-sub-approve="'+x.id+'">Принять в архив</button><button class="secondary" data-photo-sub-reject="'+x.id+'">Отклонить</button></div>'+
   '</div>';
 }).join("")||'<div class="notice">Новых фотографий на проверке нет.</div>';
 $("photoSubmissionReviewList").querySelectorAll("[data-photo-sub-approve]").forEach(b=>b.onclick=async()=>{
   if(!confirm("Принять эту фотографию в основной фотоархив?"))return;
   b.disabled=true;
   try{
     const {data:r,error:e}=await sb.functions.invoke("moderate-photo-submission",{body:{submissionId:b.dataset.photoSubApprove,decision:"approve",note:""}});
     if(e||!r?.ok)throw new Error(e?.message||r?.detail||r?.error||"Не удалось принять фото.");
     await loadPhotoSubmissionReview();await loadNotificationCount();if(activeViewId()==="photos")await loadPhotos();
   }catch(e){alert("Фото не принято: "+(e.message||e));b.disabled=false}
 });
 $("photoSubmissionReviewList").querySelectorAll("[data-photo-sub-reject]").forEach(b=>b.onclick=()=>{
   const id=b.dataset.photoSubReject;
   openPhotoModal("Отклонить фотографию",
     '<div class="notice">Заявка останется в истории со статусом «Не принято».</div><label>Комментарий участнику</label><textarea id="pfSubmissionRejectNote" placeholder="Например: дубликат, слишком мало сведений, не относится к архиву…"></textarea>',
     async()=>{
       const {data:r,error:e}=await sb.functions.invoke("moderate-photo-submission",{body:{submissionId:id,decision:"reject",note:$("pfSubmissionRejectNote").value.trim()}});
       if(e||!r?.ok)throw new Error(e?.message||r?.detail||r?.error||"Не удалось отклонить фото.");
       await loadPhotoSubmissionReview();await loadNotificationCount();
     }
   );
   $("photoModalSave").textContent="Отклонить";
 });
}
$("submitArchivePhotoBtn").onclick=()=>{$("submitArchivePhotoInput").value="";$("submitArchivePhotoInput").click()};
$("submitArchivePhotoInput").onchange=()=>{
 const file=$("submitArchivePhotoInput").files?.[0];if(!file)return;
 try{ensureImageFile(file)}catch(e){alert(e.message||e);$("submitArchivePhotoInput").value="";return}
 if(file.size>ARCHIVE_ORIGINAL_MAX_BYTES){alert("Фото больше 25 МБ.");$("submitArchivePhotoInput").value="";return}
 const defaultTitle=String(file.name||"Фотография").replace(/\.[^.]+$/,"");
 openPhotoModal("Предложить фотографию",
   '<div class="notice">Файл: <b>'+esc(file.name)+'</b> · '+esc(fmtFileSize(file.size))+'<br>После отправки снимок сначала увидит редакция.</div>'+
   '<label>Короткое название *</label><input id="pfSubmissionTitle" value="'+esc(defaultTitle)+'" placeholder="Например: 8 класс, поход на Волгу">'+
   '<label>Что изображено</label><textarea id="pfSubmissionDescription" placeholder="Что происходит на снимке, при каких обстоятельствах…"></textarea>'+
   '<label>Примерный год / период</label><input id="pfSubmissionDate" placeholder="Например: лето 1981">'+
   '<label>Место</label><input id="pfSubmissionLocation" placeholder="Школа №78, двор, Волга…">'+
   '<label>Кто на фотографии</label><textarea id="pfSubmissionPeople" placeholder="Кого узнаёте — можно писать свободным текстом"></textarea>'+
   '<label>Источник / комментарий</label><input id="pfSubmissionSource" placeholder="Семейный альбом, мой снимок, фото родителей…">'+
   '<label class="checkItem" style="margin-top:12px"><input id="pfSubmissionPermission" type="checkbox"> <span>Я разрешаю использовать эту фотографию внутри архива «Хроники-78».</span></label>',
   async()=>{
     const title=$("pfSubmissionTitle").value.trim();
     if(!title)throw new Error("Укажите название фотографии.");
     if(!$("pfSubmissionPermission").checked)throw new Error("Нужно подтвердить передачу фотографии в архив.");
     const meta={
       title,description:$("pfSubmissionDescription").value.trim(),
       approxDate:$("pfSubmissionDate").value.trim(),location:$("pfSubmissionLocation").value.trim(),
       peopleNote:$("pfSubmissionPeople").value.trim(),sourceNote:$("pfSubmissionSource").value.trim()
     };
     $("photoModalMsg").textContent="Сохраняю оригинал и готовлю копию для редакции…";
     await submitParticipantPhoto(file,meta);
     $("submitArchivePhotoInput").value="";
     $("photoSubmitMsg").innerHTML='<span class="ok">Фотография отправлена редакции. Она появится в альбоме после проверки.</span>';
     await loadMyPhotoSubmissions();
   }
 );
 $("photoModalSave").textContent="Отправить редакции";
};

async function uploadArchiveVersion(mediaId,file,type,reason,sourceNote){
 const mime=ensureImageFile(file);
 if(!user?.id)throw new Error("Нужно войти в профиль.");
 if(file.size>ARCHIVE_ORIGINAL_MAX_BYTES)throw new Error("Исходник больше 25 МБ. Для архива сейчас установлен безопасный предел 25 МБ на один файл.");
 const originalPath=user.id+"/"+mediaId+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"-"+safeName(file.name);
 const {error:oe}=await sb.storage.from("archive-originals").upload(originalPath,file,{contentType:mime,upsert:false,cacheControl:"31536000"});
 if(oe)throw oe;

 const body={
   mediaId,originalPath,fileName:file.name,versionType:type,
   reason:reason||null,sourceNote:sourceNote||null
 };
 const {data:processed,error:pe}=await sb.functions.invoke("process-archive-photo",{body});
 if(!pe&&processed?.ok)return {...processed,processing:"server"};

 // Резервный путь нужен только из-за лимитов Edge Runtime на тяжёлых смартфонных снимках.
 // Оригинал уже сохранён в глубоком архиве; в рабочий bucket всё равно попадёт только облегчённая копия.
 const f=await compressArchiveImageFallback(file);
 const workingName=String(file.name||"photo").replace(/\.[^.]+$/,"")+"."+f.ext;
 const workingPath=mediaId+"/web-fallback-"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"."+f.ext;
 const {error:ue}=await sb.storage.from("archive-media").upload(workingPath,f.blob,{contentType:f.outMime,upsert:false,cacheControl:"31536000"});
 if(ue)throw new Error("Серверная компрессия не сработала, резервная загрузка тоже не удалась: "+ue.message);
 const {error:re}=await sb.rpc("replace_archive_media_version",{
   p_media_id:mediaId,p_storage_path:workingPath,p_file_name:workingName,p_version_type:type,p_reason:reason||null,
   p_source_note:sourceNote||null,p_width:f.width,p_height:f.height,p_file_size:f.blob.size
 });
 if(re){
   await sb.storage.from("archive-media").remove([workingPath]);
   throw re;
 }
 const {data:row}=await sb.from("archive_media").select("data").eq("id",mediaId).maybeSingle();
 const now=new Date().toISOString(),history=Array.isArray(row?.data?.original_history)?row.data.original_history:[];
 const nextData={...(row?.data||{}),
   original_storage_path:originalPath,original_file_name:file.name,original_file_size:file.size,
   source_width:f.sourceWidth,source_height:f.sourceHeight,
   optimized_format:f.ext,optimized_max_side:ARCHIVE_MAX_SIDE,optimized_quality:ARCHIVE_WEBP_QUALITY,
   processing_status:"browser_fallback",processed_at:now,
   original_history:[...history,{storage_path:originalPath,file_name:file.name,file_size:file.size,
     source_width:f.sourceWidth,source_height:f.sourceHeight,working_path:workingPath,
     working_file_size:f.blob.size,width:f.width,height:f.height,processed_at:now,processor:"browser_fallback"}].slice(-30)
 };
 await sb.from("archive_media").update({data:nextData,updated_at:now}).eq("id",mediaId);
 return {ok:true,mediaId,originalPath,workingPath,width:f.width,height:f.height,originalBytes:file.size,workingBytes:f.blob.size,format:f.ext,processing:"browser_fallback"};
}
$("newArchivePhotoBtn").onclick=()=>{pendingVisualTopicId=null;$("newArchivePhotoInput").value="";$("newArchivePhotoInput").click()};
$("newArchivePhotoInput").onchange=async()=>{
 const file=$("newArchivePhotoInput").files?.[0];if(!file)return;
 const {stories,people}=await archiveFormLookups();
 openPhotoModal("Новое фото в архив",
   '<div class="notice">Файл: <b>'+esc(file.name)+'</b></div>'+
   '<label>Название</label><input id="pfTitle" placeholder="Например: Поход, 8 класс">'+
   '<label>Качество / тип версии</label>'+qualitySelectHtml("оригинал")+
   '<label>Источник / кто предоставил</label><input id="pfSource" placeholder="Имя, семейный архив, альбом…">'+
   '<label>Визуальная тема</label>'+visualTopicSelectHtml(pendingVisualTopicId||"")+
   '<label>Тип происхождения</label><select id="pfProvenance"><option>собственное документальное фото</option><option>внешнее атмосферное фото</option><option>предметная иллюстрация</option></select>'+
   '<label>Владелец оригинала</label><input id="pfOwner" placeholder="ФИО / семейный архив">'+
   '<label>Примерный год</label><input id="pfApproxDate" placeholder="Например: 1982 или 1982–1983">'+
   '<label>Место</label><input id="pfLocation" placeholder="Куйбышев, школа №78…">'+
   '<label>Уверенность атрибуции</label><select id="pfConfidence"><option>не проверено</option><option>предположительно</option><option>высокая</option><option>подтверждено</option></select>'+
   '<label>Разрешение на публикацию</label><select id="pfPermission"><option>не уточнено</option><option>получено</option><option>только внутренний архив</option><option>нельзя публиковать</option></select>'+
   '<label>Правовой статус</label><input id="pfLegal" placeholder="Например: согласие владельца получено">'+
   '<label>Связанная история</label>'+storySelectHtml(stories,"")+
   '<label>Статус идентификации</label><select id="pfIdent"><option>требует описания</option><option>частично идентифицировано</option><option>идентифицировано</option><option>дата/место требуют уточнения</option></select>'+
   '<label>Люди на фотографии</label>'+peopleChecksHtml(people,[]),
   async()=>{
     const title=$("pfTitle").value.trim();if(!title)throw new Error("Укажите название.");
     const id=await nextMediaId();
     const source=$("pfSource").value.trim(), quality=$("pfQuality").value;
     const {error}=await sb.from("archive_media").insert({
       id,title,category:"архивное фото",archive_file:file.name,linked_story:$("pfStory").value||null,
       data:{identification_status:$("pfIdent").value,people:selectedPeople()},visibility:"members",quality_status:quality,source_note:source,
       visual_topic_id:$("pfVisualTopic").value||null,provenance_type:$("pfProvenance").value||null,
       original_owner:$("pfOwner").value.trim()||null,approx_date_text:$("pfApproxDate").value.trim()||null,
       location_text:$("pfLocation").value.trim()||null,attribution_confidence:$("pfConfidence").value||null,
       publication_permission:$("pfPermission").value||null,legal_status:$("pfLegal").value.trim()||null
     });if(error)throw error;
     await uploadArchiveVersion(id,file,quality,"Первое поступление в архив",source);
     mediaFocus=id;pendingVisualTopicId=null;photoMode="archive";document.querySelectorAll("[data-photomode]").forEach(x=>x.classList.toggle("on",x.dataset.photomode==="archive"));await loadPhotos();
     $("newArchivePhotoInput").value="";
   }
 );
};
$("replaceArchivePhotoInput").onchange=async()=>{
 const file=$("replaceArchivePhotoInput").files?.[0];if(!file||!archiveReplaceId)return;
 const id=archiveReplaceId; archiveReplaceId=null;
 openPhotoModal("Новая версия архивной фотографии",
   '<div class="notice"><b>'+esc(id)+'</b><br>Новый файл: '+esc(file.name)+'</div>'+
   '<label>Тип версии</label>'+qualitySelectHtml("хороший скан")+
   '<label>Причина замены</label><select id="pfReason"><option>Найдено изображение лучшего качества</option><option>Найден оригинал</option><option>Сделан новый скан</option><option>Исправлена ориентация</option><option>Добавлена реставрация</option><option>Другая причина</option></select>'+
   '<label>Комментарий к замене</label><textarea id="pfReasonNote"></textarea>'+
   '<label>Источник новой версии</label><input id="pfSource" placeholder="Кто предоставил, из какого альбома…">',
   async()=>{
     const reason=$("pfReason").value+($("pfReasonNote").value.trim()?" — "+$("pfReasonNote").value.trim():"");
     await uploadArchiveVersion(id,file,$("pfQuality").value,reason,$("pfSource").value.trim());
     await loadPhotos();
     $("replaceArchivePhotoInput").value="";
   }
 );
};
async function showArchiveVersions(id){
 const {data,error}=await sb.from("archive_media_versions").select("version_no,file_name,version_type,reason,source_note,width,height,file_size,created_at,is_current").eq("media_id",id).order("version_no",{ascending:false});
 if(error){alert(error.message);return}
 alert((data||[]).map(v=>(v.is_current?"★ ":"")+"v"+v.version_no+" · "+v.version_type+" · "+(v.width||"?")+"×"+(v.height||"?")+"\n"+(v.reason||"")+(v.source_note?"\nИсточник: "+v.source_note:"")+"\n"+new Date(v.created_at).toLocaleString("ru-RU")).join("\n\n")||"История версий пуста.");
}
async function editArchiveCard(id){
 const {data:m,error}=await sb.from("archive_media").select("title,linked_story,data,source_note,visual_topic_id,provenance_type,original_owner,approx_date_text,location_text,attributed_by,attribution_confidence,publication_permission,legal_status,reverse_scanned").eq("id",id).maybeSingle();if(error||!m){alert(error?.message||"Карточка не найдена");return}
 const {stories,people}=await archiveFormLookups();
 openPhotoModal("Редактировать "+id,
   '<label>Название</label><input id="pfTitle" value="'+esc(m.title||"")+'">'+
   '<label>Связанная история</label>'+storySelectHtml(stories,m.linked_story||"")+
   '<label>Статус идентификации</label><select id="pfIdent">'+
     ["требует описания","частично идентифицировано","идентифицировано","дата/место требуют уточнения"].map(x=>'<option '+(x===(m.data?.identification_status||"")?"selected":"")+'>'+x+'</option>').join("")+
   '</select>'+
   '<label>Источник</label><input id="pfSource" value="'+esc(m.source_note||"")+'">'+
   '<label>Визуальная тема</label>'+visualTopicSelectHtml(m.visual_topic_id||"")+
   '<label>Тип происхождения</label><select id="pfProvenance">'+["собственное документальное фото","внешнее атмосферное фото","предметная иллюстрация"].map(x=>'<option '+(x===(m.provenance_type||"")?"selected":"")+'>'+x+'</option>').join("")+'</select>'+
   '<label>Владелец оригинала</label><input id="pfOwner" value="'+esc(m.original_owner||"")+'">'+
   '<label>Примерный год</label><input id="pfApproxDate" value="'+esc(m.approx_date_text||"")+'">'+
   '<label>Место</label><input id="pfLocation" value="'+esc(m.location_text||"")+'">'+
   '<label>Кто атрибутировал</label><input id="pfAttributedBy" value="'+esc(m.attributed_by||"")+'">'+
   '<label>Уверенность атрибуции</label><select id="pfConfidence">'+["не проверено","предположительно","высокая","подтверждено"].map(x=>'<option '+(x===(m.attribution_confidence||"")?"selected":"")+'>'+x+'</option>').join("")+'</select>'+
   '<label>Разрешение на публикацию</label><select id="pfPermission">'+["не уточнено","получено","только внутренний архив","нельзя публиковать"].map(x=>'<option '+(x===(m.publication_permission||"")?"selected":"")+'>'+x+'</option>').join("")+'</select>'+
   '<label>Правовой статус</label><input id="pfLegal" value="'+esc(m.legal_status||"")+'">'+
   '<label class="checkItem"><input type="checkbox" id="pfReverse" '+(m.reverse_scanned?"checked":"")+'> Оборот / подпись отсканированы</label>'+
   '<label>Люди на фотографии</label>'+peopleChecksHtml(people,m.data?.people||[]),
   async()=>{
     const title=$("pfTitle").value.trim();if(!title)throw new Error("Укажите название.");
     const next={...(m.data||{}),identification_status:$("pfIdent").value,people:selectedPeople()};
     const {error:ue}=await sb.from("archive_media").update({
       title,linked_story:$("pfStory").value||null,data:next,source_note:$("pfSource").value.trim(),
       visual_topic_id:$("pfVisualTopic").value||null,provenance_type:$("pfProvenance").value||null,
       original_owner:$("pfOwner").value.trim()||null,approx_date_text:$("pfApproxDate").value.trim()||null,
       location_text:$("pfLocation").value.trim()||null,attributed_by:$("pfAttributedBy").value.trim()||null,
       attribution_confidence:$("pfConfidence").value||null,publication_permission:$("pfPermission").value||null,
       legal_status:$("pfLegal").value.trim()||null,reverse_scanned:$("pfReverse").checked,updated_at:new Date().toISOString()
     }).eq("id",id);
     if(ue)throw ue;
     peopleCache=[];await loadPhotos();
   }
 );
}
async function uploadArchiveMedia(){
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const files=[...($("archiveFileInput").files||[])];
 if(!files.length){$("archiveUploadMsg").textContent="Выберите файлы.";return}
 $("archiveUploadBtn").disabled=true;$("archiveUploadMsg").textContent="Загрузка…";
 let ok=0,fail=[];
 for(const file of files){
   const m=file.name.match(/(MEDIA-\d{3})/i);
   if(!m){fail.push(file.name+" — нет ID MEDIA-XXX");continue}
   const id=m[1].toUpperCase();
   const {data:rec}=await sb.from("archive_media").select("id").eq("id",id).maybeSingle();
   if(!rec){fail.push(file.name+" — ID не найден в реестре");continue}
   try{
     await uploadArchiveVersion(id,file,"копия","Массовая загрузка по MEDIA-ID","");
     ok++;
   }catch(e){fail.push(file.name+" — "+(e.message||e))}
 }
 $("archiveUploadBtn").disabled=false;
 $("archiveUploadMsg").textContent="Загружено: "+ok+(fail.length?". Ошибки: "+fail.join("; "):".");
 $("archiveFileInput").value="";
 await loadPhotos();
}
$("archiveUploadBtn").onclick=uploadArchiveMedia;

