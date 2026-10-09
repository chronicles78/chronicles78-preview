const archiveSignedCache=new Map();
let photoWorkspace="albums",photoAlbumFilter="all";
let mediaThumbSigned={},driveImportSnapshot=null,driveImportBusy=false;
function photoPlural(n,one,few,many){
 const x=Math.abs(Number(n)||0),n10=x%10,n100=x%100;
 if(n10===1&&n100!==11)return one;
 if(n10>=2&&n10<=4&&(n100<12||n100>14))return few;
 return many;
}
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
async function prefetchArchiveMediaUrls(rows){
 const now=Date.now();
 const paths=[];
 for(const m of rows||[]){
  if(m.current_storage_path)paths.push(m.current_storage_path);
  if(m.data?.thumbnail_storage_path)paths.push(m.data.thumbnail_storage_path);
 }
 const unique=[...new Set(paths.filter(Boolean))];
 const missing=unique.filter(path=>{
  const hit=archiveSignedCache.get(path);
  return !(hit&&hit.expires>now);
 });
 for(let i=0;i<missing.length;i+=100){
  const chunk=missing.slice(i,i+100);
  const {data,error}=await sb.storage.from("archive-media").createSignedUrls(chunk,3600);
  if(error){
   console.warn("archive-media signed URL batch failed",error);
   continue;
  }
  (data||[]).forEach((row,index)=>{
   const path=chunk[index],url=row?.signedUrl||null;
   if(url&&path)archiveSignedCache.set(path,{url,expires:Date.now()+55*60*1000});
  });
 }
 for(const m of rows||[]){
  const full=m.current_storage_path?archiveSignedCache.get(m.current_storage_path):null;
  const thumb=m.data?.thumbnail_storage_path?archiveSignedCache.get(m.data.thumbnail_storage_path):null;
  if(full?.url)mediaSigned[m.id]=full.url;
  if(thumb?.url)mediaThumbSigned[m.id]=thumb.url;
 }
}
async function ensureArchiveMediaUrl(m){
 if(!m?.current_storage_path)return null;
 const url=await archiveSignedImage(m.current_storage_path);
 if(url)mediaSigned[m.id]=url;
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
 $("photosList").querySelectorAll("[data-visual-own]").forEach(b=>b.onclick=()=>{photoWorkspace="albums";photoMode="archive";mediaFocus=null;photoFilter="all";photoAlbumFilter="all";$("photoSearch").value=b.dataset.visualOwn||"";renderPhotosSection()});
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
function renderPhotoWorkspaceHeader(){
 const head=$("photoWorkHeader");if(!head)return;
 const q=($("photoSearch")?.value||"").trim();
 if(photoWorkspace==="clarify"){
  const n=mediaCache.filter(photoNeedsClarification).length;
  head.hidden=false;head.innerHTML='<button type="button" data-photo-back>← Все альбомы</button><div><b>Редакторская очередь</b><span>'+n+' '+photoPlural(n,"снимок требует","снимка требуют","снимков требуют")+' уточнения</span></div>';return;
 }
 if(photoWorkspace==="upload"){
  head.hidden=false;head.innerHTML='<button type="button" data-photo-back>← Все альбомы</button><div><b>Импорт из Google Drive</b><span>Оригиналы остаются в Drive; сайт создаёт рабочие WebP и ставит новые снимки в очередь на описание.</span></div>';return;
 }
 if(photoWorkspace==="videos"){
  head.hidden=false;head.innerHTML='<button type="button" data-photo-back>← Фотоальбомы</button><div><b>Видеоархив</b><span>Исторические ролики класса из закрытого архива Google Drive.</span></div>';return;
 }
 if(photoWorkspace==="service"){
  head.hidden=false;head.innerHTML='<button type="button" data-photo-back>← Все альбомы</button><div><b>'+(photoMode==="registry"?"Визуальный реестр":"Внешние кандидаты")+'</b><span>Служебный редакционный раздел</span></div>';return;
 }
 if(photoAlbumFilter!=="all"&&!q){
  const a=getPhotoAlbums().find(x=>x.id===photoAlbumFilter);
  if(a){head.hidden=false;head.innerHTML='<button type="button" data-photo-back>← Все альбомы</button><div><b>'+esc(a.title)+'</b><span>'+esc(a.note)+'</span></div>';return}
 }
 head.hidden=true;head.innerHTML="";
}
function setPhotoWorkspace(mode){
 photoWorkspace=mode;mediaFocus=null;
 if(mode==="albums"){photoMode="archive";photoFilter="all"}
 else if(mode==="clarify"){photoMode="archive";photoFilter="clarify";photoAlbumFilter="all";if($("photoSearch"))$("photoSearch").value=""}
 else if(mode==="upload"){photoMode="archive";photoFilter="all";photoAlbumFilter="all";if($("photoSearch"))$("photoSearch").value=""}
 else if(mode==="videos"){photoMode="archive";photoFilter="all";photoAlbumFilter="all";if($("photoSearch"))$("photoSearch").value=""}
 renderPhotosSection();
}
function renderPhotosSection(){
 const canEditPhotos=profile?.role==="editor"||profile?.role==="admin",isAdmin=profile?.role==="admin";
 if(!canEditPhotos&&!(["albums","videos"].includes(photoWorkspace)&&photoMode==="archive")){photoWorkspace="albums";photoMode="archive";photoFilter="all"}
 if(!isAdmin&&photoWorkspace==="upload")photoWorkspace="albums";
 if($("photoEditorBar"))$("photoEditorBar").style.display="grid";
 document.querySelectorAll(".editorOnlyPhotoAction").forEach(x=>x.style.display=canEditPhotos?"flex":"none");
 document.querySelectorAll(".adminOnlyPhotoAction").forEach(x=>x.style.display=isAdmin?"flex":"none");
 if($("photoServiceRow"))$("photoServiceRow").style.display=canEditPhotos?"block":"none";
 if(document.querySelector(".photoBrowseBar"))document.querySelector(".photoBrowseBar").style.display=photoWorkspace==="albums"?"grid":"none";
 if($("videoUploadBox"))$("videoUploadBox").style.display=(isAdmin&&photoWorkspace==="videos")?"block":"none";
 if($("archiveUploadBox"))$("archiveUploadBox").style.display=(isAdmin&&photoWorkspace==="upload")?"block":"none";
 if($("photosList"))$("photosList").style.display=photoWorkspace==="upload"?"none":"";
 if($("photoContributeBox"))$("photoContributeBox").style.display=photoWorkspace==="albums"?"block":"none";
 if($("photoStats"))$("photoStats").style.display=photoWorkspace==="upload"?"none":"";
 const clarify=mediaCache.filter(photoNeedsClarification).length;if($("photoClarifyCount"))$("photoClarifyCount").textContent=clarify;
 const albumCount=getPhotoAlbums().filter(a=>mediaCache.some(m=>photoAlbumId(m)===a.id)).length;
 if($("photoAlbumsCount"))$("photoAlbumsCount").textContent=albumCount+" "+photoPlural(albumCount,"раздел","раздела","разделов");
 [["photoAlbumsAction",photoWorkspace==="albums"],["videoArchiveAction",photoWorkspace==="videos"],["photoClarifyAction",photoWorkspace==="clarify"],["photoUploadToggle",photoWorkspace==="upload"]].forEach(([id,on])=>$(id)?.classList.toggle("on",on));
 renderPhotoWorkspaceHeader();
 if(photoWorkspace==="upload")return;
 if(photoWorkspace==="videos"){if(typeof renderVideoArchive==="function")renderVideoArchive();else $("photosList").innerHTML='<div class="notice">Видеоархив загружается…</div>';return}
 if(photoMode==="registry")renderVisualRegistry();
 else if(photoMode==="candidates")renderVisualCandidates();
 else renderPhotoGallery();
}
async function openPhotoContext(id){
 const m=mediaCache.find(x=>x.id===id);if(!m)return;
 const editor=profile?.role==="editor"||profile?.role==="admin";
 const previewUrl=await ensureArchiveMediaUrl(m);
 const preview=previewUrl?'<img src="'+esc(previewUrl)+'" alt="'+esc(m.title)+'">':"";
 const meta=[m.approx_date_text,m.location_text,m.quality_status].filter(Boolean).join(" · ");
 const actions=[
   {icon:"▧",label:"Рассмотреть фотографию",kind:"primary",run:()=>openArchivePhoto(id)},
   m.linked_story?{icon:"▤",label:"Открыть связанную историю",run:async()=>{await showView("stories");await openStory(m.linked_story)}}:null,
   editor?{icon:"✎",label:"Редактировать карточку",hint:"Название, люди, источник, дата и место",run:()=>editArchiveCard(id)}:null,
   editor?{icon:"↥",label:"Заменить / улучшить файл",run:()=>{archiveReplaceId=id;$("replaceArchivePhotoInput").value="";$("replaceArchivePhotoInput").click()}}:null,
   editor?{icon:"↺",label:"История версий",run:()=>showArchiveVersions(id)}:null
 ];
 openContextSheet({eyebrow:"ФОТОАРХИВ",title:m.title,meta,preview,actions});
}
const photoAlbums=[
 {id:"school",title:"Школа и класс",note:"Классные фотографии, школьные сцены и всё, что относится непосредственно к 78-й."},
 {id:"people",title:"Люди и встречи",note:"Личные, групповые и семейные снимки одноклассников — в школе и после неё."},
 {id:"travel",title:"Походы и лагеря",note:"Походная жизнь, лагеря, поездки и свобода за школьным порогом."},
 {id:"city",title:"Город и время",note:"Куйбышев и Самара как часть общей памяти: улицы, места и городской фон."},
 {id:"atmosphere",title:"Атмосфера эпохи",note:"Иллюстрации к этюдам. Они передают время и настроение, но не выдаются за документальные фотографии класса."},
 {id:"unfiled",title:"Архив без подписи",note:"Снимки, которым ещё предстоит точнее установить сюжет, место или контекст."}
];
function driveTopicAlbumId(m){
 const topic=String(m.data?.preliminary_topic||"").trim(),folderId=String(m.data?.drive_folder_id||"").trim();
 return topic&&folderId?"drive:"+folderId:null;
}
function getPhotoAlbums(){
 const dynamic=new Map();
 mediaCache.forEach(m=>{
   const id=driveTopicAlbumId(m),topic=String(m.data?.preliminary_topic||"").trim();
   if(id&&topic&&!dynamic.has(id))dynamic.set(id,{id,title:topic,note:m.data?.drive_folder_path?"Тематическая папка Google Drive: "+m.data.drive_folder_path:"Предварительная тема, полученная из папки Google Drive."});
 });
 const fixed=photoAlbums.filter(a=>a.id!=="unfiled");
 return [...fixed,...dynamic.values(),photoAlbums.find(a=>a.id==="unfiled")].filter(Boolean);
}
function photoAlbumId(m){
 const driveId=driveTopicAlbumId(m);
 if(driveId)return driveId;
 const cat=String(m.category||"").toLowerCase(),title=String(m.title||"").toLowerCase(),loc=String(m.location_text||"").toLowerCase(),desc=String(m.data?.visual_description||"").toLowerCase();
 const hay=[title,loc,desc,String(m.visual_topic_id||"")].join(" ");
 if(cat.includes("иллюстрац"))return "atmosphere";
 if(/поход|лагер|турист|палат|солнечн/.test(hay)||["S-012","S-009"].includes(m.linked_story))return "travel";
 if(/школ|класс|пионер|учен|парт/.test(hay)||m.linked_story==="S-013")return "school";
 if(/куйбыш|самар|улиц|спуск|монастыр|город|набереж|вилонов/.test(hay)||m.visual_topic_id)return "city";
 if((Array.isArray(m.data?.people)&&m.data.people.length)||/татьяна|светлана|дети|группов|ковр|курсант/.test(hay))return "people";
 return "unfiled";
}
function renderPhotoGallery(){
 let arr=mediaFocus?mediaCache.filter(m=>m.id===mediaFocus):[...mediaCache];
 const q=($("photoSearch")?.value||"").trim().toLowerCase();
 if(photoFilter==="clarify")arr=arr.filter(photoNeedsClarification);
 if(q)arr=arr.filter(m=>JSON.stringify([m.id,m.title,m.category,m.linked_story,m.quality_status,m.source_note,m.data,m.visual_topic_id,m.provenance_type,m.original_owner,m.approx_date_text,m.location_text,m.attribution_confidence,m.publication_permission,m.legal_status,mediaPeopleNames(m)]).toLowerCase().includes(q));
 if(photoWorkspace==="albums"&&photoAlbumFilter!=="all"&&!mediaFocus)arr=arr.filter(m=>photoAlbumId(m)===photoAlbumFilter);
 const total=mediaCache.length,clarify=mediaCache.filter(photoNeedsClarification).length;
 if($("photoClarifyCount"))$("photoClarifyCount").textContent=clarify;
 const editor=profile?.role==="editor"||profile?.role==="admin";
 $("photosList").className="photoGrid";
 const albums=getPhotoAlbums();
 const grouped=albums.map(album=>({album,items:arr.filter(m=>photoAlbumId(m)===album.id)})).filter(x=>x.items.length);
 let stat='<b>'+total+'</b> фотографий · <b>'+albums.filter(a=>mediaCache.some(m=>photoAlbumId(m)===a.id)).length+'</b> альбомов';
 if(photoWorkspace==="clarify")stat='<b>'+arr.length+'</b> '+photoPlural(arr.length,"снимок требует","снимка требуют","снимков требуют")+' редакторского разбора';
 else if(q)stat='Найдено: <b>'+arr.length+'</b> из '+total;
 else if(photoAlbumFilter!=="all"){const a=albums.find(x=>x.id===photoAlbumFilter);stat='<b>'+arr.length+'</b> '+photoPlural(arr.length,"фотография","фотографии","фотографий")+' · '+esc(a?.title||"альбом")}
 $("photoStats").innerHTML=stat;
 const allGroups=albums.map(album=>({album,count:mediaCache.filter(m=>photoAlbumId(m)===album.id).length})).filter(x=>x.count);
 const showAlbumChooser=photoWorkspace==="albums"&&!q&&!mediaFocus&&photoAlbumFilter==="all";
 const albumToc=showAlbumChooser?'<nav class="photoAlbumToc photoAlbumChooser" aria-label="Альбомы фотоархива">'+allGroups.map(({album,count},i)=>'<button type="button" data-photo-album="'+esc(album.id)+'"><small>'+String(i+1).padStart(2,"0")+'</small><span>'+esc(album.title)+'</span><b>'+count+'</b></button>').join("")+'</nav>':"";
 $("photosList").innerHTML=albumToc+grouped.map(({album,items},albumIndex)=>'<section class="photoAlbumSection" id="photo-album-'+esc(album.id)+'"><div class="photoAlbumHead"><div><small>АЛЬБОМ '+(albumIndex+1)+'</small><b>'+esc(album.title)+'</b><span>'+esc(album.note)+'</span></div><strong>'+items.length+'</strong></div><div class="photoAlbumGrid">'+items.map((m)=>{
   const names=mediaPeopleNames(m);
   const desc=m.data?.visual_description||"";
   const whenWhere=[m.approx_date_text,m.location_text].filter(Boolean).join(" · ");
   const origin=m.provenance_type||"";
   const readerCaption=whenWhere||(origin?origin:"Из архива «Хроник-78»");
   const tileUrl=mediaThumbSigned[m.id]||mediaSigned[m.id];
   return '<article class="photoTile contextObject" data-photo-context="'+esc(m.id)+'" tabindex="0">'+
     '<div class="photoTileImage">'+
       (tileUrl?'<img loading="lazy" fetchpriority="low" decoding="async" src="'+tileUrl+'" alt="'+esc(m.title)+'">':'<div class="photoTileMissing">Фотография загружается…</div>')+
     '</div>'+
     '<div class="photoTileBody"><div class="photoTileCaption">'+esc(readerCaption)+'</div><h3>'+esc(m.title)+'</h3>'+
       (desc?'<div class="photoTileDesc">'+esc(desc)+'</div>':'')+
       (names.length?'<div class="photoTilePeople"><b>На фото:</b> '+esc(names.slice(0,5).join(", "))+(names.length>5?"…":"")+'</div>':'')+
       (photoNeedsClarification(m)?'<div class="photoTilePeople"><b>Нужно уточнить:</b> '+esc(m.data?.identification_status||"дата, место или люди")+'</div>':'')+
       (m.linked_story?'<div class="photoTileStory">Связано с историей</div>':'')+
       (editor?'<div class="photoEditorialMeta"><button class="badge tagLink" data-tag="'+esc(m.id)+'">'+esc(m.id)+'</button>'+
         (m.linked_story?'<button class="badge tagLink" data-tag="'+esc(m.linked_story)+'">'+esc(m.linked_story)+'</button>':'')+
         (m.data?.preliminary_topic?'<span class="badge">'+esc(m.data.preliminary_topic)+'</span>':'')+
         (m.visual_topic_id?'<span class="badge">'+esc(m.visual_topic_id)+'</span>':'')+
         (m.quality_status?'<span class="badge">'+esc(m.quality_status)+'</span>':'')+
       '</div>':'')+
     '</div></article>';
 }).join("")+'</div></section>').join("")||'<div class="notice">Фотографий по этому запросу нет.</div>';
 $("photosList").querySelectorAll("[data-photo-context]").forEach(el=>{el.onclick=e=>{if(e.target.closest("[data-tag]"))return;openPhotoContext(el.dataset.photoContext)};el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openPhotoContext(el.dataset.photoContext)}}});
 renderPhotoWorkspaceHeader();
}
async function openArchivePhoto(id){
 const m=mediaCache.find(x=>x.id===id);if(!m)return;
 const editor=profile?.role==="editor"||profile?.role==="admin";
 const names=mediaPeopleNames(m);
 const fullUrl=await ensureArchiveMediaUrl(m);
 const image=fullUrl?'<figure class="photoMemoryFigure"><img class="photoDetailImage" src="'+esc(fullUrl)+'" alt="'+esc(m.title)+'">'+
   ((m.approx_date_text||m.location_text||m.original_owner)?'<figcaption>'+esc([m.approx_date_text,m.location_text,m.original_owner?"из архива "+m.original_owner:""].filter(Boolean).join(" · "))+'</figcaption>':'')+
   '</figure>':'<div class="notice">Файл изображения ещё не загружен.</div>';
 const personIds=Array.isArray(m.data?.people)?m.data.people:[];
 const people=names.length?'<div class="photoDetailPeople"><b>На фотографии:</b> '+names.map((n,i)=>'<button class="photoPersonLink" type="button" data-detail-person="'+esc(personIds[i]||"")+'">'+esc(n)+'</button>').join("")+'</div>':'<div class="small">Люди на фотографии пока не закреплены.</div>';
 const readerMeta=
   (m.data?.visual_description?'<p class="photoMemoryText">'+esc(m.data.visual_description)+'</p>':'')+
   people+
   (photoNeedsClarification(m)?'<div class="memoryArchiveNote"><b>Память ещё работает.</b> '+esc(m.data?.identification_status||"Дата, место или участники требуют уточнения.")+'</div>':'')+
   (m.linked_story?'<div class="questionActions"><button class="secondary" type="button" data-detail-story="'+esc(m.linked_story)+'">Читать связанную историю</button></div>':'');
 const editorial=editor?'<div class="photoDetailEditorial"><div class="memoryEyebrow">РЕДАКТОРСКАЯ КАРТОЧКА</div>'+
   '<div class="photoTileMeta"><span class="badge">'+esc(m.id)+'</span><span class="badge">'+esc(m.category||"")+'</span><span class="badge">'+esc(m.quality_status||"")+'</span>'+(m.data?.preliminary_topic?'<span class="badge">Тема: '+esc(m.data.preliminary_topic)+'</span>':'')+(m.visual_topic_id?'<span class="badge">'+esc(m.visual_topic_id)+'</span>':'')+'</div>'+
   (m.source_note?'<p class="small"><b>Источник:</b> '+esc(m.source_note)+'</p>':'')+
   (m.original_owner?'<p class="small"><b>Владелец оригинала:</b> '+esc(m.original_owner)+'</p>':'')+
   (m.attribution_confidence?'<p class="small"><b>Атрибуция:</b> '+esc(m.attribution_confidence)+(m.attributed_by?" · "+esc(m.attributed_by):"")+'</p>':'')+
   (m.publication_permission?'<p class="small"><b>Публикация:</b> '+esc(m.publication_permission)+'</p>':'')+
   (m.legal_status?'<p class="small"><b>Правовой статус:</b> '+esc(m.legal_status)+'</p>':'')+
   '<div class="small" style="margin-top:10px">Редакторские действия доступны из меню самой фотографии.</div></div>':'';
 openPhotoModal(m.title,image+readerMeta+editorial,async()=>{});
 $("photoModalSave").textContent="Закрыть";
 photoModalSubmit=async()=>closePhotoModal();
 document.querySelectorAll("[data-detail-story]").forEach(b=>b.onclick=async()=>{closePhotoModal();await showView("stories");await openStory(b.dataset.detailStory)});
 document.querySelectorAll("[data-detail-person]").forEach(b=>b.onclick=async()=>{const id=b.dataset.detailPerson;if(!id)return;closePhotoModal();const p=peopleCache.find(x=>x.id===id);if(p?.group_name&&["10А","10Б"].includes(p.group_name)){peopleGroup=p.group_name;document.querySelectorAll("[data-pgroup]").forEach(x=>x.classList.toggle("on",x.dataset.pgroup===peopleGroup))}selectedPersonId=id;await showView("people");if(p?.group_name&&["10А","10Б"].includes(p.group_name))await loadClassPhoto();renderPeople();openPersonContext(id)});

}
async function loadPhotos(){
 if(!user||!profile?.is_active){$("photosList").className="";$("photosList").innerHTML='<div class="notice">Сначала войдите в профиль.</div>';return}
 if(!peopleCache.length){
   const {data:pp}=await sb.from("archive_people").select("id,canonical_name,group_name,number").order("group_name").order("number");
   peopleCache=pp||[];
 }
 const [mediaRes,topicRes,candidateRes]=await Promise.all([
   sb.from("archive_media").select("id,media_type,title,category,linked_story,archive_file,current_storage_path,current_file_name,quality_status,source_note,data,visual_topic_id,provenance_type,original_owner,approx_date_text,location_text,attributed_by,attribution_confidence,publication_permission,legal_status,reverse_scanned").order("id"),
   sb.from("visual_topics").select("*").order("sort_order"),
   sb.from("visual_candidates").select("*").order("sort_order")
 ]);
 if(mediaRes.error||topicRes.error||candidateRes.error){$("photosList").className="";$("photosList").innerHTML='<div class="notice">'+esc(mediaRes.error?.message||topicRes.error?.message||candidateRes.error?.message)+'</div>';return}
 const allMedia=mediaRes.data||[];mediaCache=allMedia.filter(m=>m.media_type!=="video");videoCache=allMedia.filter(m=>m.media_type==="video");visualTopicCache=topicRes.data||[];visualCandidateCache=candidateRes.data||[];
 mediaSigned={};mediaThumbSigned={};
 if(typeof prepareVideoArchive==="function")void prepareVideoArchive();
 renderPhotosSection();
 prefetchArchiveMediaUrls(mediaCache).then(()=>{
   if(photoMode==="archive"&&photoWorkspace!=="upload")renderPhotoGallery();
 }).catch(e=>console.warn("archive media URL prefetch failed",e));
}
document.addEventListener("click",e=>{
 const b=e.target.closest("#photoAlbumsAction,#videoArchiveAction,#photoClarifyAction,#photoUploadToggle,#photoSearchClear,[data-photo-album],[data-photo-back]");if(!b)return;
 if(b.matches("[data-photo-back]")||b.id==="photoAlbumsAction"){photoAlbumFilter="all";if($("photoSearch"))$("photoSearch").value="";setPhotoWorkspace("albums");return}
 if(b.matches("[data-photo-album]")){photoAlbumFilter=b.dataset.photoAlbum;photoWorkspace="albums";photoMode="archive";photoFilter="all";mediaFocus=null;renderPhotosSection();requestAnimationFrame(()=>$("photosList")?.scrollIntoView({behavior:"smooth",block:"start"}));return}
 if(b.id==="photoSearchClear"){if($("photoSearch"))$("photoSearch").value="";photoAlbumFilter="all";setPhotoWorkspace("albums");return}
 if(b.id==="videoArchiveAction"){setPhotoWorkspace("videos");requestAnimationFrame(()=>$("photoWorkHeader")?.scrollIntoView({behavior:"smooth",block:"start"}));return}
 if(b.id==="photoClarifyAction"){setPhotoWorkspace("clarify");requestAnimationFrame(()=>$("photoWorkHeader")?.scrollIntoView({behavior:"smooth",block:"start"}));return}
 if(b.id==="photoUploadToggle"){if(profile?.role!=="admin")return;setPhotoWorkspace("upload");scanDrivePhotos();requestAnimationFrame(()=>$("photoWorkHeader")?.scrollIntoView({behavior:"smooth",block:"start"}));return}
});
document.querySelectorAll("[data-photomode]").forEach(b=>b.onclick=()=>{
 photoWorkspace="service";photoMode=b.dataset.photomode;mediaFocus=null;photoFilter="all";photoAlbumFilter="all";
 if($("photoSearch"))$("photoSearch").value="";
 renderPhotosSection();
});
if($("photoSearch"))$("photoSearch").oninput=()=>{
 mediaFocus=null;
 if(photoWorkspace==="service"){renderPhotosSection();return}
 photoWorkspace="albums";photoMode="archive";photoFilter="all";photoAlbumFilter="all";
 if($("archiveUploadBox"))$("archiveUploadBox").style.display="none";
 renderPhotosSection();
};

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
   return '<div class="photoSubmissionCard" data-photo-submission-id="'+esc(x.id)+'">'+
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
function openParticipantPhotoPicker(){
 const input=$("submitArchivePhotoInput");
 if(!input)return;
 input.value="";
 input.click();
}
window.openParticipantPhotoPicker=openParticipantPhotoPicker;
$("submitArchivePhotoBtn").onclick=()=>openParticipantPhotoPicker();
$("submitArchivePhotoInput").onchange=()=>{
 const input=$("submitArchivePhotoInput");
 const file=input.files?.[0];if(!file)return;
 try{ensureImageFile(file)}catch(e){alert(e.message||e);input.value="";return}
 if(file.size>ARCHIVE_ORIGINAL_MAX_BYTES){alert("Фото больше 25 МБ.");input.value="";return}
 const fileTitle=String(file.name||"Фотография").replace(/\.[^.]+$/,"");
 openPhotoModal("Предложить фотографию",
   '<div class="notice">Файл: <b>'+esc(file.name)+'</b> · '+esc(fmtFileSize(file.size))+'<br>После отправки снимок сначала увидит редакция.</div>'+
   '<label>Короткое название *</label><input id="pfSubmissionTitle" value="'+esc(fileTitle)+'" placeholder="Например: 8 класс, поход на Волгу">'+
   '<label>Что изображено</label><textarea id="pfSubmissionDescription" placeholder="Что происходит на снимке, при каких обстоятельствах…"></textarea>'+
   '<label>Примерный год / период</label><input id="pfSubmissionDate" value="" placeholder="Например: лето 1981">'+
   '<label>Место</label><input id="pfSubmissionLocation" placeholder="Самара, Волга, дома…">'+
   '<label>Кто на фотографии</label><textarea id="pfSubmissionPeople" placeholder="Кого узнаёте — можно писать свободным текстом"></textarea>'+
   '<label>Источник / комментарий</label><input id="pfSubmissionSource" value="" placeholder="Семейный альбом, мой снимок, фото родителей…">'+
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
     input.value="";
     $("photoSubmitMsg").innerHTML='<span class="ok">Фотография отправлена редакции. Она появится в архиве после проверки.</span>';
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
async function driveImportError(error,data){
 let detail=data?.detail||data?.error||error?.message||"Неизвестная ошибка";
 if(error?.context?.json)try{const j=await error.context.json();detail=j?.detail||j?.error||detail}catch{}
 return String(detail);
}
function renderDriveImportSnapshot(snap){
 driveImportSnapshot=snap||null;
 const state=$("driveImportState"),results=$("driveImportResults"),actions=$("driveImportActions"),link=$("driveOriginalsLink");
 if(link&&snap?.folderUrl){link.href=snap.folderUrl;link.style.display="inline-flex"}
 if(!state||!results||!actions)return;
 const nNew=snap?.newFiles?.length||0,nDup=snap?.duplicates?.length||0,nReg=Number(snap?.registered||0);
 const folders=Math.max(1,Number(snap?.foldersScanned||1));
 state.innerHTML='<b>'+Number(snap?.total||0)+'</b> фотографий · просмотрено <b>'+folders+'</b> '+photoPlural(folders,"папка","папки","папок")+' · <b>'+nReg+'</b> уже в архиве · <b>'+nNew+'</b> новых'+(nDup?' · <b>'+nDup+'</b> возможный '+photoPlural(nDup,"дубль","дубля","дублей"):'')+(Number(snap?.movedUpdated||0)?' · обновлено тем после переноса: <b>'+Number(snap.movedUpdated)+'</b>':'');
 const driveLabel=f=>(f.folderPath?f.folderPath+" / ":"")+f.name;
 const newHtml=nNew?'<section class="driveImportGroup"><b>Новые</b>'+snap.newFiles.map(f=>'<div class="driveImportFile"><span>'+esc(driveLabel(f))+'</span><small>'+fmtFileSize(f.size)+(f.folderName?' · тема: '+esc(f.folderName):'')+'</small></div>').join("")+'</section>':'';
 const dupHtml=nDup?'<section class="driveImportGroup duplicate"><b>Не импортируются: возможные дубли</b>'+snap.duplicates.map(f=>'<div class="driveImportFile"><span>'+esc(driveLabel(f))+'</span><small>'+fmtFileSize(f.size)+' · уже есть '+esc(f.duplicateOf?.mediaId||"в архиве")+'</small></div>').join("")+'</section>':'';
 results.innerHTML=newHtml+dupHtml+(!nNew&&!nDup?'<div class="notice">Новых фотографий в Google Drive нет.</div>':'');
 actions.hidden=!nNew;
 if($("driveImportSummary"))$("driveImportSummary").textContent=nNew?nNew+" "+photoPlural(nNew,"новая фотография","новые фотографии","новых фотографий"):"";
 if($("driveImportProgress"))$("driveImportProgress").textContent="Готово к импорту.";
}
async function scanDrivePhotos(){
 if(profile?.role!=="admin"||driveImportBusy)return;
 const btn=$("driveImportScanBtn"),state=$("driveImportState");
 if(btn)btn.disabled=true;if(state)state.textContent="Проверяю Google Drive…";
 const {data,error}=await sb.functions.invoke("drive-photo-import",{body:{action:"scan"}});
 if(btn)btn.disabled=false;
 if(error||!data?.ok){if(state)state.innerHTML='<span class="err">'+esc(await driveImportError(error,data))+'</span>';return}
 renderDriveImportSnapshot(data);
}
async function compressDriveImageVariant(blob,maxSide,quality){
 const url=URL.createObjectURL(blob);
 try{
  const img=new Image();img.decoding="async";
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error("Браузер не смог прочитать изображение."));img.src=url});
  const sourceWidth=img.naturalWidth||img.width,sourceHeight=img.naturalHeight||img.height;
  if(!(sourceWidth>0&&sourceHeight>0))throw new Error("Не удалось определить размер изображения.");
  const scale=Math.min(1,maxSide/Math.max(sourceWidth,sourceHeight));
  const width=Math.max(1,Math.round(sourceWidth*scale)),height=Math.max(1,Math.round(sourceHeight*scale));
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("Браузер не может подготовить рабочую копию.");
  ctx.drawImage(img,0,0,width,height);
  let out=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
  let outMime="image/webp",ext="webp";
  if(!out||out.type!=="image/webp"){
    out=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",Math.min(.9,quality+.02)));
    outMime="image/jpeg";ext="jpg";
  }
  if(!out)throw new Error("Не удалось сжать изображение.");
  return {blob:out,outMime,ext,width,height,sourceWidth,sourceHeight};
 }finally{URL.revokeObjectURL(url)}
}
async function fetchDriveOriginalForBrowser(file){
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw new Error("Сессия истекла. Войдите в архив снова.");
 const r=await fetch(SUPABASE_URL+"/functions/v1/drive-photo-import?fileId="+encodeURIComponent(file.id),{
   method:"GET",
   headers:{Authorization:"Bearer "+session.access_token,apikey:SUPABASE_KEY}
 });
 if(!r.ok){
   let detail="Не удалось получить оригинал из Google Drive.";
   try{const j=await r.json();detail=j?.detail||j?.error||detail}catch{}
   throw new Error(detail);
 }
 return await r.blob();
}
async function importDrivePhotoInBrowser(file,mediaId){
 const original=await fetchDriveOriginalForBrowser(file);
 const full=await compressDriveImageVariant(original,1920,.82);
 const thumbSource=new Blob([full.blob],{type:full.outMime});
 const thumb=await compressDriveImageVariant(thumbSource,560,.76);
 const stamp=Date.now(),base=String(file.name||"photo").replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9._-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80)||"photo";
 const fullPath=mediaId+"/web-drive-"+stamp+"-"+base+"."+full.ext;
 const thumbPath=mediaId+"/thumb-drive-"+stamp+"-"+base+"."+thumb.ext;
 const {error:fu}=await sb.storage.from("archive-media").upload(fullPath,full.blob,{contentType:full.outMime,cacheControl:"31536000",upsert:false});
 if(fu)throw new Error("Рабочая копия не загружена: "+fu.message);
 const {error:tu}=await sb.storage.from("archive-media").upload(thumbPath,thumb.blob,{contentType:thumb.outMime,cacheControl:"31536000",upsert:false});
 if(tu){await sb.storage.from("archive-media").remove([fullPath]);throw new Error("Миниатюра не загружена: "+tu.message)}
 try{
  const {data,error}=await sb.functions.invoke("drive-photo-import",{body:{
    action:"register_client_processed",fileId:file.id,mediaId,fullPath,thumbPath,
    fullWidth:full.width,fullHeight:full.height,fullSize:full.blob.size,
    thumbWidth:thumb.width,thumbHeight:thumb.height,thumbSize:thumb.blob.size,
    sourceWidth:full.sourceWidth,sourceHeight:full.sourceHeight,format:full.ext
  }});
  if(error||!data?.ok)throw new Error(await driveImportError(error,data));
  return data;
 }catch(e){
  await sb.storage.from("archive-media").remove([fullPath,thumbPath]);
  throw e;
 }
}

async function importDrivePhotos(limit=0){
 if(profile?.role!=="admin"||driveImportBusy||!driveImportSnapshot?.newFiles?.length)return;
 const allFiles=[...driveImportSnapshot.newFiles],files=limit>0?allFiles.slice(0,limit):allFiles,run=$("driveImportRunBtn"),test=$("driveImportTestBtn"),scan=$("driveImportScanBtn"),progress=$("driveImportProgress");
 document.querySelectorAll(".driveImportOutcome").forEach(x=>x.remove());
 driveImportBusy=true;if(run)run.disabled=true;if(test)test.disabled=true;if(scan)scan.disabled=true;
 let ok=0;const imported=[],failed=[];
 for(let i=0;i<files.length;i++){
  const file=files[i];if(progress)progress.textContent=(i+1)+" из "+files.length+" · "+(file.folderPath?file.folderPath+" / ":"")+file.name;
  try{
   const mediaId=await nextMediaId();
   const data=await importDrivePhotoInBrowser(file,mediaId);
   ok++;imported.push(data.mediaId||mediaId);
  }catch(e){
   const msg=e?.message||String(e);failed.push(file.name+" — "+msg);
   if(/Сессия истекла|Failed to fetch|google_drive_auth_failed|server_configuration_error|drive_file_outside_originals_folder/i.test(msg)){
    failed.push("Массовый импорт остановлен после системной ошибки; остальные файлы не запускались.");
    break;
   }
  }
 }
 driveImportBusy=false;if(run)run.disabled=false;if(test)test.disabled=false;if(scan)scan.disabled=false;
 await loadPhotos();await scanDrivePhotos();
 const state=$("driveImportState");
 if(state){
  const msg='<div class="driveImportOutcome '+(failed.length?"warn":"ok")+'"><b>Импортировано: '+ok+' из '+files.length+'</b>'+(failed.length?'<span>Ошибки: '+esc(failed.join("; "))+'</span>':'<span>Новые снимки созданы и поставлены в очередь на описание.</span>')+(imported.length?'<button type="button" id="driveReviewImported">Перейти к разбору →</button>':'')+'</div>';
  state.insertAdjacentHTML("afterend",msg);
  $("driveReviewImported")?.addEventListener("click",()=>setPhotoWorkspace("clarify"),{once:true});
 }
}
if($("driveImportScanBtn"))$("driveImportScanBtn").onclick=scanDrivePhotos;
if($("driveImportTestBtn"))$("driveImportTestBtn").onclick=()=>importDrivePhotos(1);
if($("driveImportRunBtn"))$("driveImportRunBtn").onclick=()=>importDrivePhotos(0);

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
   '<label>Предварительная тема / альбом</label><input id="pfPreliminaryTopic" value="'+esc(m.data?.preliminary_topic||"")+'" placeholder="Например: УПК, Выпускной, Поход">'+
   (m.data?.drive_folder_path?'<div class="formHint">Путь оригинала в Google Drive: '+esc(m.data.drive_folder_path)+'</div>':'')+
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
     const nextTopic=$("pfPreliminaryTopic").value.trim()||null;
     const next={...(m.data||{}),identification_status:$("pfIdent").value,people:selectedPeople(),preliminary_topic:nextTopic,
       preliminary_topic_source:nextTopic?(nextTopic===m.data?.preliminary_topic?(m.data?.preliminary_topic_source||"manual"):"manual"):null};
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

