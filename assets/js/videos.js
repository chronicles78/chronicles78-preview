let videoPosterSigned={},videoImportSnapshot=null,videoImportBusy=false;

function videoDuration(ms){
 const s=Math.max(0,Math.round((Number(ms)||0)/1000)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
 return h?String(h)+":"+String(m).padStart(2,"0")+":"+String(sec).padStart(2,"0"):String(m)+":"+String(sec).padStart(2,"0");
}
function videoNeedsConversion(v){return String(v?.data?.conversion_status||"")!=="ready"}
function videoPeopleNames(v){
 const ids=Array.isArray(v?.data?.people)?v.data.people:[];
 return ids.map(id=>peopleCache.find(p=>p.id===id)?.canonical_name||id);
}
async function prepareVideoArchive(){
 videoPosterSigned={};
 await Promise.all((videoCache||[]).map(async v=>{
   if(v.data?.poster_storage_path){const u=await archiveSignedImage(v.data.poster_storage_path);if(u)videoPosterSigned[v.id]=u}
 }));
 if(photoWorkspace==="videos")renderVideoArchive();
}
function videoTopicLabel(v){return String(v.data?.preliminary_topic||"").trim()||"Без темы"}
function videoMetaLine(v){
 return [v.approx_date_text,v.location_text,v.data?.duration_ms?videoDuration(v.data.duration_ms):null].filter(Boolean).join(" · ");
}
function renderVideoArchive(){
 const box=$("photosList"),stats=$("photoStats");if(!box)return;
 const total=videoCache.length,ready=videoCache.filter(v=>!videoNeedsConversion(v)).length,needs=total-ready;
 if(stats)stats.innerHTML='<b>'+total+'</b> '+photoPlural(total,"ролик","ролика","роликов")+' · <b>'+ready+'</b> доступны для просмотра'+(needs?' · <b>'+needs+'</b> требуют конвертации':'');
 const groups=new Map();
 videoCache.forEach(v=>{const key=videoTopicLabel(v);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(v)});
 box.className="videoArchiveGrid";
 box.innerHTML=total?[...groups.entries()].map(([topic,items])=>
   '<section class="videoTopicSection"><div class="videoTopicHead"><div><small>ВИДЕОАРХИВ</small><b>'+esc(topic)+'</b></div><strong>'+items.length+'</strong></div>'+
   '<div class="videoGrid">'+items.map(v=>{
     const poster=videoPosterSigned[v.id],meta=videoMetaLine(v),names=videoPeopleNames(v),needsConvert=videoNeedsConversion(v);
     return '<article class="videoCard contextObject" data-video-context="'+esc(v.id)+'" tabindex="0">'+
       '<div class="videoPoster">'+(poster?'<img loading="lazy" src="'+esc(poster)+'" alt="'+esc(v.title)+'">':'<div class="videoPosterFallback">▶</div>')+
       '<span class="videoDuration">'+(v.data?.duration_ms?esc(videoDuration(v.data.duration_ms)):"Видео")+'</span>'+
       (needsConvert?'<span class="videoConvertBadge">нужна конвертация</span>':'<span class="videoPlayBadge">▶ смотреть</span>')+'</div>'+
       '<div class="videoCardBody"><h3>'+esc(v.title)+'</h3>'+(meta?'<div class="videoCardMeta">'+esc(meta)+'</div>':'')+
       (names.length?'<div class="videoCardPeople"><b>В кадре:</b> '+esc(names.slice(0,5).join(", "))+(names.length>5?"…":"")+'</div>':'')+
       (profile?.role==="editor"||profile?.role==="admin"?'<div class="photoEditorialMeta"><span class="badge">'+esc(v.id)+'</span><span class="badge">'+esc(v.data?.original_mime_type||"")+'</span></div>':'')+
       '</div></article>';
   }).join("")+'</div></section>'
 ).join(""):'<div class="notice">Видеоархив пока пуст. Администратор может добавить исторические ролики через Google Drive.</div>';
 box.querySelectorAll("[data-video-context]").forEach(el=>{el.onclick=()=>openVideoContext(el.dataset.videoContext);el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openVideoContext(el.dataset.videoContext)}}});
 if(profile?.role==="admin"&&!videoImportSnapshot&&!videoImportBusy)setTimeout(scanDriveVideos,0);
}
function openVideoContext(id){
 const v=videoCache.find(x=>x.id===id);if(!v)return;
 const editor=profile?.role==="editor"||profile?.role==="admin",poster=videoPosterSigned[v.id];
 const preview=poster?'<img src="'+esc(poster)+'" alt="'+esc(v.title)+'">':'<div class="videoContextFallback">▶</div>';
 const actions=[
   !videoNeedsConversion(v)?{icon:"▶",label:"Смотреть видео",kind:"primary",run:()=>openArchiveVideo(id)}:{icon:"!",label:"Формат требует конвертации",hint:v.data?.original_mime_type||"",run:()=>openArchiveVideo(id)},
   v.linked_story?{icon:"▤",label:"Открыть связанную историю",run:()=>{showView("stories");openStory(v.linked_story)}}:null,
   editor?{icon:"✎",label:"Редактировать карточку",hint:"Название, люди, дата, место и тема",run:()=>editArchiveVideoCard(id)}:null
 ];
 openContextSheet({eyebrow:"ВИДЕОАРХИВ",title:v.title,meta:videoMetaLine(v),preview,actions});
}
async function openArchiveVideo(id){
 const v=videoCache.find(x=>x.id===id);if(!v)return;
 const names=videoPeopleNames(v),poster=videoPosterSigned[v.id]||"";
 if(videoNeedsConversion(v)){
  openPhotoModal(v.title,
    '<div class="videoUnsupported"><b>Оригинал сохранён в архиве.</b><p>Формат <code>'+esc(v.data?.original_mime_type||"неизвестен")+'</code> пока не воспроизводится на сайте. Карточка и связи уже работают; для просмотра нужна MP4/WebM-копия.</p></div>'+
    (poster?'<img class="videoUnsupportedPoster" src="'+esc(poster)+'" alt="'+esc(v.title)+'">':'')+
    '<div class="small">'+esc(videoMetaLine(v))+'</div>',async()=>{});
  $("photoModalSave").textContent="Закрыть";photoModalSubmit=async()=>closePhotoModal();return;
 }
 openPhotoModal(v.title,
   '<div class="videoPlayerShell"><video id="archiveVideoPlayer" controls preload="metadata" playsinline '+(poster?'poster="'+esc(poster)+'"':'')+'></video><div id="videoPlayerState" class="small">Готовлю защищённый просмотр…</div></div>'+
   (v.data?.visual_description?'<p class="photoMemoryText">'+esc(v.data.visual_description)+'</p>':'')+
   (names.length?'<div class="photoDetailPeople"><b>В кадре:</b> '+names.map(n=>'<span class="videoPersonName">'+esc(n)+'</span>').join("")+'</div>':'')+
   '<div class="small">'+esc(videoMetaLine(v))+'</div>'+
   (v.linked_story?'<div class="questionActions"><button class="secondary" id="videoStoryLink" type="button">Читать связанную историю</button></div>':''),async()=>{});
 $("photoModalSave").textContent="Закрыть";photoModalSubmit=async()=>closePhotoModal();
 if(v.linked_story&&$("videoStoryLink"))$("videoStoryLink").onclick=()=>{closePhotoModal();showView("stories");openStory(v.linked_story)};
 const player=$("archiveVideoPlayer"),state=$("videoPlayerState");
 try{
  const {data,error}=await sb.functions.invoke("drive-video-import",{body:{action:"playback_url",mediaId:id}});
  if(error||!data?.ok)throw new Error(await driveVideoError(error,data));
  player.src=data.url;state.textContent="Оригинал хранится в закрытом Google Drive. Ссылка на просмотр временная.";
 }catch(e){state.innerHTML='<span class="err">'+esc(e?.message||String(e))+'</span>'}
}
async function editArchiveVideoCard(id){
 const {data:v,error}=await sb.from("archive_media").select("title,linked_story,data,source_note,original_owner,approx_date_text,location_text,attributed_by,attribution_confidence,publication_permission,legal_status").eq("id",id).eq("media_type","video").maybeSingle();
 if(error||!v){alert(error?.message||"Видео не найдено");return}
 const {stories,people}=await archiveFormLookups();
 openPhotoModal("Редактировать "+id,
   '<label>Название</label><input id="pfVideoTitle" value="'+esc(v.title||"")+'">'+
   '<label>Связанная история</label>'+storySelectHtml(stories,v.linked_story||"")+
   '<label>Предварительная тема / альбом</label><input id="pfVideoTopic" value="'+esc(v.data?.preliminary_topic||"")+'">'+
   (v.data?.drive_folder_path?'<div class="formHint">Путь в Google Drive: '+esc(v.data.drive_folder_path)+'</div>':'')+
   '<label>Статус описания</label><select id="pfVideoIdent">'+["требует описания","частично идентифицировано","идентифицировано","дата/место требуют уточнения"].map(x=>'<option '+(x===(v.data?.identification_status||"")?"selected":"")+'>'+x+'</option>').join("")+'</select>'+
   '<label>Краткое описание</label><textarea id="pfVideoDescription">'+esc(v.data?.visual_description||"")+'</textarea>'+
   '<label>Владелец оригинала</label><input id="pfVideoOwner" value="'+esc(v.original_owner||"")+'">'+
   '<label>Примерный год / дата</label><input id="pfVideoDate" value="'+esc(v.approx_date_text||"")+'">'+
   '<label>Место</label><input id="pfVideoLocation" value="'+esc(v.location_text||"")+'">'+
   '<label>Кто атрибутировал</label><input id="pfVideoAttributed" value="'+esc(v.attributed_by||"")+'">'+
   '<label>Уверенность атрибуции</label><select id="pfVideoConfidence">'+["не проверено","предположительно","высокая","подтверждено"].map(x=>'<option '+(x===(v.attribution_confidence||"")?"selected":"")+'>'+x+'</option>').join("")+'</select>'+
   '<label>Разрешение на публикацию</label><select id="pfVideoPermission">'+["не уточнено","получено","только внутренний архив","нельзя публиковать"].map(x=>'<option '+(x===(v.publication_permission||"")?"selected":"")+'>'+x+'</option>').join("")+'</select>'+
   '<label>Правовой статус</label><input id="pfVideoLegal" value="'+esc(v.legal_status||"")+'">'+
   '<label>Люди в кадре</label>'+peopleChecksHtml(people,v.data?.people||[]),
   async()=>{
    const title=$("pfVideoTitle").value.trim();if(!title)throw new Error("Укажите название.");
    const topic=$("pfVideoTopic").value.trim()||null;
    const next={...(v.data||{}),identification_status:$("pfVideoIdent").value,visual_description:$("pfVideoDescription").value.trim()||null,people:selectedPeople(),preliminary_topic:topic,
      preliminary_topic_source:topic?(topic===v.data?.preliminary_topic?(v.data?.preliminary_topic_source||"manual"):"manual"):null};
    const {error:ue}=await sb.from("archive_media").update({title,linked_story:$("pfStory").value||null,data:next,original_owner:$("pfVideoOwner").value.trim()||null,
      approx_date_text:$("pfVideoDate").value.trim()||null,location_text:$("pfVideoLocation").value.trim()||null,attributed_by:$("pfVideoAttributed").value.trim()||null,
      attribution_confidence:$("pfVideoConfidence").value||null,publication_permission:$("pfVideoPermission").value||null,legal_status:$("pfVideoLegal").value.trim()||null,updated_at:new Date().toISOString()}).eq("id",id);
    if(ue)throw ue;await loadPhotos();
   }
 );
}
async function driveVideoError(error,data){
 let detail=data?.detail||data?.error||error?.message||"Неизвестная ошибка";
 if(error?.context?.json)try{const j=await error.context.json();detail=j?.detail||j?.error||detail}catch{}
 return String(detail);
}
function renderDriveVideoSnapshot(snap){
 videoImportSnapshot=snap||null;const state=$("videoImportState"),results=$("videoImportResults"),actions=$("videoImportActions"),link=$("driveVideosLink");
 if(link&&snap?.folderUrl){link.href=snap.folderUrl;link.style.display="inline-flex"}
 if(!state||!results||!actions)return;
 const nNew=snap?.newFiles?.length||0,nDup=snap?.duplicates?.length||0,nReg=Number(snap?.registered||0),folders=Math.max(1,Number(snap?.foldersScanned||1));
 state.innerHTML='<b>'+Number(snap?.total||0)+'</b> '+photoPlural(snap?.total||0,"ролик","ролика","роликов")+' · <b>'+folders+'</b> '+photoPlural(folders,"папка","папки","папок")+' · <b>'+nReg+'</b> уже в архиве · <b>'+nNew+'</b> новых'+(snap?.folderCreated?' · папка «Видео» создана':'');
 const label=f=>(f.folderPath?f.folderPath+" / ":"")+f.name;
 const status=f=>["video/mp4","video/webm"].includes(String(f.mimeType||""))?"готово к просмотру":"потребуется конвертация";
 const newHtml=nNew?'<section class="driveImportGroup"><b>Новые видео</b>'+snap.newFiles.map(f=>'<div class="driveImportFile"><span>'+esc(label(f))+'</span><small>'+fmtFileSize(f.size)+' · '+esc(status(f))+'</small></div>').join("")+'</section>':"";
 const dupHtml=nDup?'<section class="driveImportGroup duplicate"><b>Возможные дубли</b>'+snap.duplicates.map(f=>'<div class="driveImportFile"><span>'+esc(label(f))+'</span><small>уже есть '+esc(f.duplicateOf?.mediaId||"в архиве")+'</small></div>').join("")+'</section>':"";
 results.innerHTML=newHtml+dupHtml+(!nNew&&!nDup?'<div class="notice">Новых видео в Google Drive нет.</div>':'');
 actions.hidden=!nNew;if($("videoImportSummary"))$("videoImportSummary").textContent=nNew?nNew+" "+photoPlural(nNew,"новый ролик","новых ролика","новых роликов"):"";
 if($("videoImportProgress"))$("videoImportProgress").textContent="Готово к импорту.";
}
async function scanDriveVideos(){
 if(profile?.role!=="admin"||videoImportBusy)return;
 const btn=$("videoImportScanBtn"),state=$("videoImportState");if(btn)btn.disabled=true;if(state)state.textContent="Проверяю видеоархив Google Drive…";
 const {data,error}=await sb.functions.invoke("drive-video-import",{body:{action:"scan"}});if(btn)btn.disabled=false;
 if(error||!data?.ok){const msg=await driveVideoError(error,data);if(state)state.innerHTML='<span class="err">'+esc(msg)+'</span>'+(data?.rootFolderUrl?'<div style="margin-top:8px"><a href="'+esc(data.rootFolderUrl)+'" target="_blank" rel="noopener">Открыть корень архива Google Drive ↗</a><br><span class="small">Если автоматическое создание недоступно, создайте там папку «Видео» вручную.</span></div>':'');return}
 renderDriveVideoSnapshot(data);
}
async function importDriveVideos(){
 if(profile?.role!=="admin"||videoImportBusy||!videoImportSnapshot?.newFiles?.length)return;
 const files=[...videoImportSnapshot.newFiles],run=$("videoImportRunBtn"),scan=$("videoImportScanBtn"),progress=$("videoImportProgress");
 videoImportBusy=true;if(run)run.disabled=true;if(scan)scan.disabled=true;let ok=0,needConvert=0;const failed=[];
 for(let i=0;i<files.length;i++){
  const file=files[i];if(progress)progress.textContent=(i+1)+" из "+files.length+" · "+(file.folderPath?file.folderPath+" / ":"")+file.name;
  try{
   const mediaId=await nextMediaId();const {data,error}=await sb.functions.invoke("drive-video-import",{body:{action:"import",fileId:file.id,mediaId}});
   if(error||!data?.ok)throw new Error(await driveVideoError(error,data));ok++;if(data.conversionStatus!=="ready")needConvert++;
  }catch(e){failed.push(file.name+" — "+(e?.message||String(e)))}
 }
 videoImportBusy=false;if(run)run.disabled=false;if(scan)scan.disabled=false;await loadPhotos();await scanDriveVideos();
 const state=$("videoImportState");if(state)state.insertAdjacentHTML("afterend",'<div class="driveImportOutcome '+(failed.length?"warn":"ok")+'"><b>Импортировано: '+ok+' из '+files.length+'</b><span>'+(needConvert?needConvert+" "+photoPlural(needConvert,"ролик требует","ролика требуют","роликов требуют")+" конвертации. ":"")+(failed.length?"Ошибки: "+esc(failed.join("; ")):"Видео зарегистрированы в архиве.")+'</span></div>');
}
if($("videoImportScanBtn"))$("videoImportScanBtn").onclick=scanDriveVideos;
if($("videoImportRunBtn"))$("videoImportRunBtn").onclick=importDriveVideos;
