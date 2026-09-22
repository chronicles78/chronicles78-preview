function questionTargetPersonId(q){
 const vals=[...(Array.isArray(q.links)?q.links:[]),...(Array.isArray(q.tags)?q.tags:[])];
 return vals.find(x=>/^10A-\d+$/i.test(String(x)))||null;
}
function questionCropHtml(personId){
 const v=question10AVisual;
 const region=v?.regions?.[personId];
 if(!v?.url||!v?.photo||!region)return "";
 return cropImageHtml(
   v.url,v.photo,region,"questionCrop",86/106,.35,.20,
   'data-q-crop="'+esc(personId)+'" aria-label="Фрагмент общей фотографии 10А"',
   "Фрагмент общей фотографии 10А"
 );
}
async function loadQuestion10AVisual(){
 question10AVisual=null;
 const [{data:cp,error:ce},{data:regions,error:re}]=await Promise.all([
   sb.from("class_photos").select("id,storage_path,source_width,source_height").eq("id","CLASS-10A").maybeSingle(),
   sb.from("class_photo_regions").select("person_id,x,y,w,h").eq("class_photo_id","CLASS-10A")
 ]);
 if(ce||re||!cp?.storage_path)return;
 const url=await archiveSignedImage(cp.storage_path);
 if(!url)return;
 const map={};(regions||[]).forEach(r=>map[r.person_id]=r);
 question10AVisual={photo:cp,regions:map,url};
}
async function editCityEssay(id=null){
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const x=id?cityCache.find(a=>a.id===id):null;
 const nextId=x?.id||("G-"+String((cityCache.reduce((m,a)=>Math.max(m,Number(String(a.id).replace(/\D/g,""))||0),0)+1)).padStart(3,"0"));
 openPhotoModal(x?"Редактировать этюд":"Новый этюд",
   '<label>ID</label><input id="pfCityId" value="'+esc(nextId)+'" '+(x?"readonly":"")+'>'+
   '<label>Название</label><input id="pfCityTitle" value="'+esc(x?.title||"")+'">'+
   '<label>Период</label><input id="pfCityPeriod" value="'+esc(x?.period||"1970–1980-е")+'">'+
   '<label>Тема</label><select id="pfCityTheme">'+["быт","город","культура","транспорт"].map(v=>'<option '+((x?.theme||"быт")===v?"selected":"")+'>'+v+'</option>').join("")+'</select>'+
   '<label>Место</label><input id="pfCityLocation" value="'+esc(x?.location_text||"Куйбышев")+'">'+
   '<label>Короткий анонс</label><textarea id="pfCityExcerpt">'+esc(x?.excerpt||"")+'</textarea>'+
   '<label>Полный текст</label><div class="formHint">Переносы строк, пустые строки и авторская разбивка сохраняются без изменений.</div><textarea id="pfCityBody" style="min-height:320px;white-space:pre-wrap">'+esc(x?.body||"")+'</textarea>'+
   '<div class="cityPhotoInsert"><div class="formHint" style="margin:0 0 7px"><b>Фото внутри текста.</b> Поставьте курсор в нужное место.</div>'+
   '<div class="cityPhotoInsertRow"><select id="pfCityPhotoSelect"><option value="">— фото из архива —</option>'+mediaCache.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.id+" — "+m.title)+'</option>').join("")+'</select><button class="secondary" id="pfCityInsertPhoto" type="button">Вставить из архива</button></div>'+
   '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><div class="formHint" style="margin-bottom:7px">Или загрузите новое фото прямо в этюд — оно одновременно попадёт в Фотоархив.</div>'+
   '<input id="pfCityNewPhotoTitle" placeholder="Подпись к новому фото">'+
   '<input id="pfCityNewPhotoSource" style="margin-top:7px" placeholder="Источник / кто предоставил">'+
   '<div class="cityPhotoInsertRow" style="margin-top:7px"><button class="secondary" id="pfCityUploadPhoto" type="button">＋ Загрузить новое фото</button><span id="pfCityUploadMsg" class="small"></span></div>'+
   '<input id="pfCityUploadInput" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden></div></div>'+
   '<label>Статус источника</label><select id="pfCitySourceStatus">'+["подтверждённая редакция","рабочая версия","не проверено","требует восстановления"].map(v=>'<option '+((x?.source_status||"не проверено")===v?"selected":"")+'>'+v+'</option>').join("")+'</select>'+
   '<label>Примечание об источнике</label><textarea id="pfCitySourceNote">'+esc(x?.source_note||"")+'</textarea>'+
   '<label>Музыка к этюду</label><div class="formHint">Вставьте ссылку YouTube или Яндекс Музыки. Для Яндекс Музыки можно использовать ссылку на трек.</div><input id="pfCityMusicUrl" value="'+esc(x?.music_url||"")+'" placeholder="https://...">'+
   '<label>Подпись к музыке</label><input id="pfCityMusicCaption" value="'+esc(x?.music_caption||"")+'" placeholder="Например: Музыка, под которую танцевали">',
   async()=>{
     const row={
       id:$("pfCityId").value.trim(),
       title:$("pfCityTitle").value.trim(),
       period:$("pfCityPeriod").value.trim()||null,
       theme:$("pfCityTheme").value,
       location_text:$("pfCityLocation").value.trim()||null,
       excerpt:$("pfCityExcerpt").value.trim()||null,
       body:$("pfCityBody").value===""?null:$("pfCityBody").value,
       source_status:$("pfCitySourceStatus").value,
       source_note:$("pfCitySourceNote").value.trim()||null,
       music_url:$("pfCityMusicUrl").value.trim()||null,
       music_caption:$("pfCityMusicCaption").value.trim()||null,
       media_ids:[...new Set(cityEssayPhotoIds($("pfCityBody").value))],
       updated_at:new Date().toISOString()
     };
     if(!row.id||!row.title)throw new Error("Укажите ID и название.");
     $("photoModalMsg").textContent="Сохраняю этюд…";
     const {data,error}=await sb.rpc("save_city_essay",{p_data:row});
     if(error)throw error;
     $("photoModalMsg").textContent="Сохранено.";
     closePhotoModal();
     await loadCityEssays();
     return data;
   }
 );
 if($("pfCityInsertPhoto"))$("pfCityInsertPhoto").onclick=insertCityPhotoMarker;
 if($("pfCityUploadPhoto"))$("pfCityUploadPhoto").onclick=()=>{
   const ta=$("pfCityBody");
   cityPhotoCursor=ta?.selectionStart??ta?.value.length??0;
   $("pfCityUploadInput").value="";
   $("pfCityUploadInput").click();
 };
 if($("pfCityUploadInput"))$("pfCityUploadInput").onchange=async()=>{
   const file=$("pfCityUploadInput").files?.[0];if(!file)return;
   const btn=$("pfCityUploadPhoto"),msg=$("pfCityUploadMsg");
   btn.disabled=true;msg.textContent="Загружаю…";
   try{
     const id=await uploadCityInlinePhoto(file);
     msg.textContent="Фото "+id+" загружено и вставлено в текст.";
   }catch(e){
     msg.textContent="Ошибка: "+(e.message||e);
   }finally{
     btn.disabled=false;
     $("pfCityUploadInput").value="";
   }
 };
}
async function uploadCityMemoryPhoto(detailId,file){
 if(!(profile?.role==="editor"||profile?.role==="admin"))throw new Error("Недостаточно прав.");
 const mime=ensureImageFile(file);
 if(file.size>10*1024*1024)throw new Error("Файл больше 10 МБ.");
 const path="city-memory/"+detailId+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"-"+safeName(file.name);
 const {error}=await sb.storage.from("archive-media").upload(path,file,{contentType:mime,upsert:false});
 if(error)throw error;
 return path;
}
async function editCityMemoryVisual(id){
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const [{data:x,error},{data:media}]=await Promise.all([
   sb.from("city_memory_details").select("*").eq("id",id).single(),
   sb.from("archive_media").select("id,title,current_storage_path").not("current_storage_path","is",null).order("updated_at",{ascending:false}).limit(120)
 ]);
 if(error||!x){alert(error?.message||"Деталь не найдена");return}
 const currentUrl=x.image_storage_path?await archiveSignedImage(x.image_storage_path):null;
 const options=(media||[]).map(m=>'<option value="'+esc(m.current_storage_path)+'">'+esc(m.id+" — "+m.title)+'</option>').join("");
 openPhotoModal("Фото и оформление",
   (currentUrl?'<div class="memoryVisualPreview"><img src="'+esc(currentUrl)+'" alt=""></div>':'<div class="notice">Для этой детали фото пока не назначено.</div>')+
   '<label>Загрузить новое фото</label><input id="pfMemoryPhoto" type="file" accept="image/jpeg,image/png,image/webp">'+
   '<div class="formHint">JPG, PNG или WEBP, до 10 МБ. Новая загрузка имеет приоритет над выбором из архива.</div>'+
   '<label>Или выбрать из фотоархива</label><select id="pfMemoryArchive"><option value="">— оставить текущее —</option>'+options+'</select>'+
   '<div class="memoryVisualMeta">'+
     '<div><label>Тип изображения</label><select id="pfMemoryMode"><option value="archive" '+(x.image_mode==="archive"?"selected":"")+'>Архивное фото</option><option value="atmosphere" '+(x.image_mode==="atmosphere"?"selected":"")+'>Атмосферная иллюстрация</option></select></div>'+
     '<div><label>Статус прав</label><input id="pfMemoryRights" value="'+esc(x.image_rights_status||"")+'" placeholder="разрешено / проверить права"></div>'+
   '</div>'+
   '<label>Подпись к фото</label><input id="pfMemoryCaption" value="'+esc(x.image_caption||"")+'" placeholder="Что изображено, место, период">'+
   '<label>Источник / владелец</label><input id="pfMemoryCredit" value="'+esc(x.image_credit||"")+'" placeholder="Архив класса, автор, сайт-источник…">'+
   '<label class="checkItem" style="margin-top:10px"><input id="pfMemoryRemove" type="checkbox"><span>Убрать текущее фото из карточки</span></label>',
   async()=>{
     let path=x.image_storage_path||null;
     if($("pfMemoryRemove").checked)path=null;
     const archivePath=$("pfMemoryArchive").value;
     if(archivePath)path=archivePath;
     const file=$("pfMemoryPhoto").files?.[0];
     if(file)path=await uploadCityMemoryPhoto(id,file);
     const payload={
       image_storage_path:path,
       image_mode:path?$("pfMemoryMode").value:null,
       image_caption:$("pfMemoryCaption").value.trim()||null,
       image_credit:$("pfMemoryCredit").value.trim()||null,
       image_rights_status:$("pfMemoryRights").value.trim()||null,
       updated_at:new Date().toISOString()
     };
     const {error:ue}=await sb.from("city_memory_details").update(payload).eq("id",id);
     if(ue)throw ue;
     await loadCityDetails();
   }
 );
}
function openMemoryWhy(x,url){
 const visual=url?'<div class="memoryVisualPreview"><img src="'+esc(url)+'" alt="'+esc(x.image_caption||x.detail_text)+'"></div>':"";
 const photoMeta=url?'<div class="small" style="margin-top:8px"><b>'+(x.image_mode==="atmosphere"?"Атмосферная иллюстрация":"Архивное фото")+'</b>'+(x.image_caption?' · '+esc(x.image_caption):'')+(x.image_credit?'<br>Источник: '+esc(x.image_credit):'')+'</div>':"";
 openPhotoModal("Почему эта деталь здесь?",
   visual+
   '<div class="notice">Это самостоятельный ответ участника на вопрос проекта: <b>«Какая одна вещь, место, звук, запах или городская деталь для вас до сих пор и есть настоящий Куйбышев?»</b></div>'+
   '<div style="margin-top:14px"><div class="small">ОТВЕТ</div><div class="cityEssayBody" style="margin:8px 0;max-width:none">'+literaryHtml(x.detail_text)+'</div></div>'+
   '<div class="small"><b>Автор:</b> '+esc(x.author_name)+'</div>'+
   (x.source_label?'<div class="small" style="margin-top:6px"><b>Источник:</b> '+esc(x.source_label)+'</div>':'')+photoMeta,
   async()=>{}
 );
 $("photoModalSave").textContent="Закрыть";photoModalSubmit=async()=>closePhotoModal();
}
function openMemoryContext(x,url){
 const editor=profile?.role==="editor"||profile?.role==="admin";
 openContextSheet({
   eyebrow:"ОДНА ИСЧЕЗНУВШАЯ ДЕТАЛЬ",
   title:x.author_name||"Голос памяти",
   meta:x.category||"",
   preview:url?'<img src="'+esc(url)+'" alt="'+esc(x.image_caption||x.detail_text)+'">':"",
   actions:[
     {icon:"“",label:"Прочитать и понять контекст",kind:"primary",run:()=>openMemoryWhy(x,url)},
     x.person_id?{icon:"◎",label:"Открыть человека",run:()=>activateTag(x.person_id)}:null,
     editor?{icon:"▧",label:"Фото и оформление",hint:"Загрузить, заменить, подписать изображение",run:()=>editCityMemoryVisual(Number(x.id))}:null
   ]
 });
}
async function loadCityDetails(){
 if(!user||!profile?.is_active){$("cityDetailsList").innerHTML='<div class="notice">Сначала войдите в профиль.</div>';return}
 const {data,error}=await sb.from("city_memory_details").select("*").order("sort_order").order("id");
 if(error){$("cityDetailsList").innerHTML='<div class="notice">'+esc(error.message)+'</div>';return}
 const arr=data||[];
 const editor=profile?.role==="editor"||profile?.role==="admin";
 const visualUrls={};
 await Promise.all(arr.map(async x=>{
   if(x.image_storage_path)visualUrls[x.id]=await archiveSignedImage(x.image_storage_path);
 }));
 const intro=$("cityDetailsList")?.previousElementSibling;
 if(intro&&intro.classList.contains("cityIntro")){const p=intro.querySelector("p");if(p&&!p.dataset.counted){p.textContent+=" Сейчас в мозаике — "+arr.length+" живых деталей.";p.dataset.counted="1"}}
 $("cityDetailsList").className="memoryMosaic";
 $("cityDetailsList").innerHTML=arr.map(x=>{
   const url=visualUrls[x.id]||null;
   const author=x.person_id
     ?'<button class="cityPersonLink" data-city-person="'+esc(x.person_id)+'" title="Открыть карточку участника">'+esc(x.author_name)+'</button>'
     :'<span><b>'+esc(x.author_name)+'</b></span>';
   const photoLabel=url?(x.image_mode==="atmosphere"?"атмосферная иллюстрация":"архивное фото"):"";
   const editorMenu="";
   return '<article class="memoryTile contextObject '+(url?"hasPhoto":"noPhoto")+'" data-memory-context="'+esc(x.id)+'" tabindex="0">'+
     (url?'<div class="memoryTileMedia"><img loading="lazy" src="'+esc(url)+'" alt="'+esc(x.image_caption||x.detail_text)+'"></div><div class="memoryTileShade"></div><div class="memoryTilePhotoLabel">'+esc(photoLabel)+'</div>':'<div class="memoryTileEmptyMark">фото пока не найдено</div>')+
     editorMenu+
     '<div class="memoryTileContent">'+
       '<div class="memoryPrompt">Куйбышев для меня —</div>'+
       '<div class="memoryQuote '+(String(x.detail_text||"").length>175?"compact":"")+'">'+esc(x.detail_text)+'</div>'+
       '<div class="memoryBy">'+author+
         (x.category?'<span class="badge">'+esc(x.category)+'</span>':'')+
         '<span class="small">Нажмите, чтобы выбрать действие</span>'+
       '</div>'+
     '</div>'+
   '</article>';
 }).join("")||'<div class="notice">Городские детали ещё не добавлены.</div>';
 $("cityDetailsList").querySelectorAll("[data-city-person]").forEach(b=>b.onclick=e=>{
   e.preventDefault(); e.stopPropagation();
   activateTag(b.dataset.cityPerson);
 });
 $("cityDetailsList").querySelectorAll("[data-memory-context]").forEach(el=>{el.onclick=e=>{if(e.target.closest("[data-city-person]"))return;const x=arr.find(v=>String(v.id)===String(el.dataset.memoryContext));if(x)openMemoryContext(x,visualUrls[x.id]||null)};el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();const x=arr.find(v=>String(v.id)===String(el.dataset.memoryContext));if(x)openMemoryContext(x,visualUrls[x.id]||null)}}});
}
async function loadCityEssays(){
 if(!user||!profile?.is_active){$("cityList").innerHTML='<div class="notice">Сначала войдите в профиль.</div>';return}
 if($("newCityEssayBtn"))$("newCityEssayBtn").style.display=(profile?.role==="editor"||profile?.role==="admin")?"inline-block":"none";
 document.querySelectorAll(".editorCityFilter").forEach(x=>x.style.display=(profile?.role==="editor"||profile?.role==="admin")?"":"none");
 if(!mediaCache.length){await loadPhotos()}
 const {data,error}=await sb.from("city_essays").select("*").order("sort_order").order("id");
 if(error){$("cityList").innerHTML='<div class="notice">'+esc(error.message)+'</div>';return}
 cityCache=data||[];
 const confirmed=cityCache.filter(x=>x.source_status==="подтверждённая редакция").length;
 const restore=cityCache.filter(x=>x.source_status==="требует восстановления").length;
 if($("cityStats")){
   const editor=profile?.role==="editor"||profile?.role==="admin";
   $("cityStats").innerHTML='<b>'+confirmed+'</b> этюда для чтения'+(editor?' · '+restore+' требуют восстановления · всего '+cityCache.length:'');
 }
 renderCityEssays();
 await loadCityDetails();
}
function openCityContext(id){
 const x=cityCache.find(a=>a.id===id);if(!x)return;
 const editor=profile?.role==="editor"||profile?.role==="admin";
 const imgId=Array.isArray(x.media_ids)&&x.media_ids.length?x.media_ids[0]:null;
 const preview=imgId&&mediaSigned[imgId]?'<img src="'+esc(mediaSigned[imgId])+'" alt="'+esc(x.title)+'">':"";
 const actions=[
   x.body?{icon:"⌘",label:"Читать этюд",kind:"primary",run:()=>openCityEssay(id)}:null,
   !x.body&&editor?{icon:"✎",label:"Внести авторский текст",kind:"primary",run:()=>editCityEssay(id)}:null,
   x.linked_story?{icon:"▤",label:"Связанная история",run:()=>{showView("stories");openStory(x.linked_story)}}:null,
   editor?{icon:"✎",label:x.body?"Редактировать этюд":"Редактировать карточку",run:()=>editCityEssay(id)}:null
 ];
 openContextSheet({eyebrow:"ГОРОД И ВРЕМЯ",title:x.title,meta:[x.theme,x.period,x.location_text].filter(Boolean).join(" · "),preview,actions});
}
function renderCityEssays(){
 const q=($("citySearch")?.value||"").trim().toLowerCase();
 let arr=cityCache.filter(x=>cityTheme==="all"||(cityTheme==="restore"?x.source_status==="требует восстановления":String(x.theme||"").toLowerCase()===cityTheme));
 if(q)arr=arr.filter(x=>JSON.stringify([x.id,x.title,x.period,x.theme,x.excerpt,x.body,x.location_text,x.tags]).toLowerCase().includes(q));
 const editor=profile?.role==="editor"||profile?.role==="admin";
 $("cityList").innerHTML=arr.map((x,idx)=>{
   const imgId=Array.isArray(x.media_ids)&&x.media_ids.length?x.media_ids[0]:null;
   const m=imgId?mediaCache.find(z=>z.id===imgId):null;
   const img=m&&mediaSigned[m.id]
     ?'<div class="cityCardImage"><img src="'+mediaSigned[m.id]+'" alt="'+esc(x.title)+'"></div>'
     :'<div class="cityCardImage cityCardImageEmpty">'+esc(x.location_text||x.period||"Куйбышев")+'</div>';
   const lead=!q&&cityTheme==="all"&&idx===0&&!!x.body;
   const kicker=[x.theme,x.period].filter(Boolean).join(" · ");
   const readerMeta=[x.location_text].filter(Boolean).join(" · ");
   return '<article class="cityCard contextObject '+(lead?"cityLeadCard":"")+'" data-city-context="'+esc(x.id)+'" tabindex="0">'+img+'<div class="cityCardBody">'+
     (kicker?'<div class="cityCardKicker">'+esc(kicker)+'</div>':'')+
     '<h3>'+esc(x.title)+'</h3>'+
     (readerMeta?'<div class="cityCardMetaLine">'+esc(readerMeta)+'</div>':'')+
     (x.excerpt?'<div class="cityExcerpt">'+literaryHtml(x.excerpt)+'</div>':'')+
     (!x.body?'<div class="cityCardReaderStatus">Последняя авторская редакция пока восстанавливается.</div>':'')+
     '<div class="cityReaderActions"><span class="small">Нажмите, чтобы выбрать действие</span></div>'+
     (editor?'<div class="cityCardEditorial"><span class="badge">'+esc(x.id)+'</span>'+(x.source_status?'<span class="badge">'+esc(x.source_status)+'</span>':'')+'</div>':'')+
   '</div></article>';
 }).join("")||'<div class="notice">Этюды ещё не добавлены.</div>';
 $("cityList").querySelectorAll("[data-city-context]").forEach(el=>{el.onclick=()=>openCityContext(el.dataset.cityContext);el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openCityContext(el.dataset.cityContext)}}});
}
function openCityEssay(id){
 const x=cityCache.find(a=>a.id===id);if(!x)return;
 if(!x.body){
   openPhotoModal(x.title,
     '<div class="notice"><b>Текст пока не опубликован.</b><br>'+esc(x.source_note||"Последняя авторская редакция ещё не восстановлена.")+'</div>',
     async()=>{}
   );
   $("photoModalSave").textContent="Закрыть";
   photoModalSubmit=async()=>closePhotoModal();
   return;
 }
 const editor=profile?.role==="editor"||profile?.role==="admin";
 const meta=[x.period,x.theme,x.location_text].filter(Boolean).join(" · ");
 const editorial=editor&&x.source_status?'<div class="cityEssayEditorial"><div class="memoryEyebrow">РЕДАКТОРСКАЯ КАРТОЧКА</div><b>'+esc(x.source_status)+'</b>'+
   (x.source_date?' · '+esc(x.source_date):'')+(x.source_note?'<div class="small" style="margin-top:6px">'+esc(x.source_note)+'</div>':'')+
   '<div class="small" style="margin-top:6px">'+esc(x.id)+'</div></div>':'';
 openPhotoModal(x.title,
   '<div class="cityEssayHeader"><div class="memoryEyebrow">ГОРОД И ВРЕМЯ</div><h2>'+esc(x.title)+'</h2>'+
     (meta?'<div class="cityEssayMetaLine">'+esc(meta)+'</div>':'')+
     (x.excerpt?'<div class="cityEssayLead">'+literaryHtml(x.excerpt)+'</div>':'')+
   '</div>'+
   cityMusicHtml(x.music_url,x.music_caption)+
   '<div class="cityEssayBody">'+cityEssayBodyHtml(x.body||"")+'</div>'+
   editorial+
   '<div id="cityEssayComments" class="cityComments"><h3>Воспоминания и уточнения</h3><div class="small">Загружаю комментарии…</div></div>'+
   (x.linked_story?'<div class="homeActions"><button class="secondary" type="button" data-city-story="'+esc(x.linked_story)+'">Связанная история</button></div>':''),
   async()=>{}
 );
 $("photoModalSave").textContent="Закрыть";
 photoModalSubmit=async()=>closePhotoModal();
 document.querySelectorAll("[data-city-story]").forEach(b=>b.onclick=()=>{closePhotoModal();showView("stories");openStory(b.dataset.cityStory)});
 loadCityEssayComments(x.id);
}
async function loadCityEssayComments(essayId){
 const box=$("cityEssayComments");if(!box)return;
 const {data,error}=await sb.from("city_essay_comments")
   .select("id,essay_id,user_id,body,created_at,status,is_highlighted,archived_memory_detail_id,editorial_note,profiles(display_name,person_id)")
   .eq("essay_id",essayId)
   .order("created_at",{ascending:true});
 if(!box)return;
 if(error){box.innerHTML='<h3>Воспоминания и уточнения</h3><div class="small">Не удалось загрузить комментарии: '+esc(error.message)+'</div>';return}
 const rows=data||[];
 const editor=profile?.role==="editor"||profile?.role==="admin";
 const list=rows.length?rows.map(c=>{
   const p=Array.isArray(c.profiles)?c.profiles[0]:c.profiles;
   const name=p?.display_name||"Участник";
   return '<div class="cityComment contextObject '+(c.is_highlighted?'highlighted':'')+'" data-city-comment-context="'+esc(c.id)+'" tabindex="0"><div class="cityCommentHead"><b>'+esc(name)+'</b><span class="cityCommentTime">'+esc(fmtCityCommentTime(c.created_at))+'</span></div>'+
     '<div class="cityCommentBody">'+literaryHtml(c.body)+'</div>'+
     (c.is_highlighted?'<div class="cityCommentMark">★ Ценная деталь</div>':'')+
     (c.archived_memory_detail_id?'<div class="cityCommentMark">✓ Включено в «Одну исчезнувшую деталь»</div>':'')+
     '<div class="small" style="margin-top:7px">Нажмите, чтобы выбрать действие</div></div>';
 }).join(""):'<div class="small">Пока никто не добавил своё воспоминание или уточнение.</div>';
 box.innerHTML='<h3>Воспоминания и уточнения</h3>'+list+
   '<div class="cityCommentForm"><textarea id="cityCommentText" maxlength="2000" placeholder="Напишите своё воспоминание, поправку или деталь…"></textarea>'+
   '<div class="cityCommentHint">До 2000 знаков. Комментарий будет подписан вашим именем.</div>'+
   '<button class="secondary" id="cityCommentSend" type="button">Добавить комментарий</button><div id="cityCommentMsg" class="small" style="margin-top:7px"></div></div>';
 $("cityCommentSend").onclick=()=>submitCityEssayComment(essayId);
 box.querySelectorAll("[data-city-comment-context]").forEach(el=>{
   const open=()=>{
     const row=rows.find(x=>String(x.id)===String(el.dataset.cityCommentContext));if(!row)return;
     const p=Array.isArray(row.profiles)?row.profiles[0]:row.profiles;
     const name=p?.display_name||"Участник";
     const actions=[
       row.user_id!==user?.id?{icon:"⚑",label:"Пожаловаться",run:()=>reportContent("city_comment",row.id)}:null,
       editor?{icon:row.is_highlighted?"☆":"★",label:row.is_highlighted?"Снять отметку «ценная деталь»":"Отметить как ценную деталь",run:async()=>{const {error}=await sb.rpc("set_city_comment_highlight",{p_comment_id:Number(row.id),p_value:!row.is_highlighted});if(error){alert(error.message);return}await loadCityEssayComments(essayId)}}:null,
       editor&&!row.archived_memory_detail_id?{icon:"⌘",label:"Внести в «Одну исчезнувшую деталь»",run:async()=>{if(!confirm("Добавить эту реплику в мозаику «Одна исчезнувшая деталь»?"))return;const {error}=await sb.rpc("archive_city_comment_as_memory",{p_comment_id:Number(row.id),p_category:null});if(error){alert(error.message);return}await loadCityEssayComments(essayId);await loadCityDetails()}}:null,
       row.archived_memory_detail_id?{icon:"✓",label:"Показать в мозаике памяти",run:()=>{closePhotoModal();showView("city");setTimeout(()=>$("cityDetailsList")?.scrollIntoView({behavior:"smooth",block:"start"}),120)}}:null
     ];
     openContextSheet({eyebrow:"КОММЕНТАРИЙ",title:name,meta:fmtCityCommentTime(row.created_at),actions});
   };
   el.onclick=open;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}};
 });
}
async function submitCityEssayComment(essayId){
 const ta=$("cityCommentText"),msg=$("cityCommentMsg"),btn=$("cityCommentSend");
 const body=ta?.value||"";
 if(!body.trim()){if(msg)msg.textContent="Сначала напишите комментарий.";return}
 if(!user){if(msg)msg.textContent="Нужно войти в профиль.";return}
 btn.disabled=true;if(msg)msg.textContent="Сохраняю…";
 const {error}=await sb.from("city_essay_comments").insert({essay_id:essayId,user_id:user.id,body});
 if(error){if(msg)msg.textContent="Ошибка: "+error.message;btn.disabled=false;return}
 ta.value="";
 await loadCityEssayComments(essayId);
}

document.querySelectorAll("[data-citytheme]").forEach(b=>b.onclick=()=>{
 cityTheme=b.dataset.citytheme;
 document.querySelectorAll("[data-citytheme]").forEach(x=>x.classList.toggle("on",x===b));
 renderCityEssays();
});
$("citySearch").oninput=()=>renderCityEssays();
$("newCityEssayBtn").onclick=()=>editCityEssay();

