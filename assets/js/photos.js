const archiveSignedCache=new Map();
let photoWorkspace="albums",photoAlbumFilter="all";
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
 $("photosList").querySelectorAll("[data-visual-own]").forEach(b=>b.onclick=()=>{photoWorkspace="albums";photoMode="archive";mediaFocus=null;photoFilter="all";photoAlbumFilter="all";$("photoSearch").value=b.dataset.visualOwn||"";renderPhotosSection()});
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
function renderPhotoWorkspaceHeader(){
 const head=$("photoWorkHeader");if(!head)return;
 const q=($("photoSearch")?.value||"").trim();
 if(photoWorkspace==="clarify"){
  const n=mediaCache.filter(photoNeedsClarification).length;
  head.hidden=false;head.innerHTML='<button type="button" data-photo-back>← Все альбомы</button><div><b>Редакторская очередь</b><span>'+n+' '+plural(n,"снимок требует","снимка требуют","снимков требуют")+' уточнения</span></div>';return;
 }
 if(photoWorkspace==="upload"){
  head.hidden=false;head.innerHTML='<button type="button" data-photo-back>← Все альбомы</button><div><b>Добавление фотографий</b><span>Загрузите один снимок или целую пачку. После загрузки фотографии попадут в редакторскую очередь.</span></div>';return;
 }
 if(photoWorkspace==="service"){
  head.hidden=false;head.innerHTML='<button type="button" data-photo-back>← Все альбомы</button><div><b>'+(photoMode==="registry"?"Визуальный реестр":"Внешние кандидаты")+'</b><span>Служебный редакционный раздел</span></div>';return;
 }
 if(photoAlbumFilter!=="all"&&!q){
  const a=photoAlbums.find(x=>x.id===photoAlbumFilter);
  if(a){head.hidden=false;head.innerHTML='<button type="button" data-photo-back>← Все альбомы</button><div><b>'+esc(a.title)+'</b><span>'+esc(a.note)+'</span></div>';return}
 }
 head.hidden=true;head.innerHTML="";
}
function setPhotoWorkspace(mode){
 photoWorkspace=mode;mediaFocus=null;
 if(mode==="albums"){photoMode="archive";photoFilter="all"}
 else if(mode==="clarify"){photoMode="archive";photoFilter="clarify";photoAlbumFilter="all";if($("photoSearch"))$("photoSearch").value=""}
 else if(mode==="upload"){photoMode="archive";photoFilter="all";photoAlbumFilter="all";if($("photoSearch"))$("photoSearch").value=""}
 renderPhotosSection();
}
function renderPhotosSection(){
 const canEditPhotos=profile?.role==="editor"||profile?.role==="admin";
 if(!canEditPhotos&&(photoWorkspace!=="albums"||photoMode!=="archive")){photoWorkspace="albums";photoMode="archive";photoFilter="all"}
 if($("photoEditorBar"))$("photoEditorBar").style.display="grid";
 document.querySelectorAll(".editorOnlyPhotoAction").forEach(x=>x.style.display=canEditPhotos?"flex":"none");
 if($("photoServiceRow"))$("photoServiceRow").style.display=canEditPhotos?"block":"none";
 if(document.querySelector(".photoBrowseBar"))document.querySelector(".photoBrowseBar").style.display=photoWorkspace==="albums"?"grid":"none";
 if($("archiveUploadBox"))$("archiveUploadBox").style.display=(canEditPhotos&&photoWorkspace==="upload")?"block":"none";
 if($("photosList"))$("photosList").style.display=photoWorkspace==="upload"?"none":"";
 if($("photoContributeBox"))$("photoContributeBox").style.display=photoWorkspace==="albums"?"block":"none";
 if($("photoStats"))$("photoStats").style.display=photoWorkspace==="upload"?"none":"";
 const clarify=mediaCache.filter(photoNeedsClarification).length;if($("photoClarifyCount"))$("photoClarifyCount").textContent=clarify;
 const albumCount=photoAlbums.filter(a=>mediaCache.some(m=>photoAlbumId(m)===a.id)).length;
 if($("photoAlbumsCount"))$("photoAlbumsCount").textContent=albumCount+" "+plural(albumCount,"раздел","раздела","разделов");
 [["photoAlbumsAction",photoWorkspace==="albums"],["photoClarifyAction",photoWorkspace==="clarify"],["photoUploadToggle",photoWorkspace==="upload"]].forEach(([id,on])=>$(id)?.classList.toggle("on",on));
 renderPhotoWorkspaceHeader();
 if(photoWorkspace==="upload")return;
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
const photoAlbums=[
 {id:"school",title:"Школа и класс",note:"Классные фотографии, школьные сцены и всё, что относится непосредственно к 78-й."},
 {id:"people",title:"Люди и встречи",note:"Личные, групповые и семейные снимки одноклассников — в школе и после неё."},
 {id:"travel",title:"Походы и лагеря",note:"Походная жизнь, лагеря, поездки и свобода за школьным порогом."},
 {id:"city",title:"Город и время",note:"Куйбышев и Самара как часть общей памяти: улицы, места и городской фон."},
 {id:"atmosphere",title:"Атмосфера эпохи",note:"Иллюстрации к этюдам. Они передают время и настроение, но не выдаются за документальные фотографии класса."},
 {id:"unfiled",title:"Архив без подписи",note:"Снимки, которым ещё предстоит точнее установить сюжет, место или контекст."}
];
function photoAlbumId(m){
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
 const grouped=photoAlbums.map(album=>({album,items:arr.filter(m=>photoAlbumId(m)===album.id)})).filter(x=>x.items.length);
 let stat='<b>'+total+'</b> фотографий · <b>'+photoAlbums.filter(a=>mediaCache.some(m=>photoAlbumId(m)===a.id)).length+'</b> альбомов';
 if(photoWorkspace==="clarify")stat='<b>'+arr.length+'</b> '+plural(arr.length,"снимок требует","снимка требуют","снимков требуют")+' редакторского разбора';
 else if(q)stat='Найдено: <b>'+arr.length+'</b> из '+total;
 else if(photoAlbumFilter!=="all"){const a=photoAlbums.find(x=>x.id===photoAlbumFilter);stat='<b>'+arr.length+'</b> '+plural(arr.length,"фотография","фотографии","фотографий")+' · '+esc(a?.title||"альбом")}
 $("photoStats").innerHTML=stat;
 const allGroups=photoAlbums.map(album=>({album,count:mediaCache.filter(m=>photoAlbumId(m)===album.id).length})).filter(x=>x.count);
 const showAlbumChooser=photoWorkspace==="albums"&&!q&&!mediaFocus&&photoAlbumFilter==="all";
 const albumToc=showAlbumChooser?'<nav class="photoAlbumToc photoAlbumChooser" aria-label="Альбомы фотоархива">'+allGroups.map(({album,count},i)=>'<button type="button" data-photo-album="'+esc(album.id)+'"><small>'+String(i+1).padStart(2,"0")+'</small><span>'+esc(album.title)+'</span><b>'+count+'</b></button>').join("")+'</nav>':"";
 $("photosList").innerHTML=albumToc+grouped.map(({album,items},albumIndex)=>'<section class="photoAlbumSection" id="photo-album-'+esc(album.id)+'"><div class="photoAlbumHead"><div><small>АЛЬБОМ '+(albumIndex+1)+'</small><b>'+esc(album.title)+'</b><span>'+esc(album.note)+'</span></div><strong>'+items.length+'</strong></div><div class="photoAlbumGrid">'+items.map((m)=>{
   const names=mediaPeopleNames(m);
   const desc=m.data?.visual_description||"";
   const whenWhere=[m.approx_date_text,m.location_text].filter(Boolean).join(" · ");
   const origin=m.provenance_type||"";
   const readerCaption=whenWhere||(origin?origin:"Из архива «Хроник-78»");
   return '<article class="photoTile contextObject" data-photo-context="'+esc(m.id)+'" tabindex="0">'+
     '<div class="photoTileImage">'+
       (mediaSigned[m.id]?'<img loading="lazy" fetchpriority="low" decoding="async" src="'+mediaSigned[m.id]+'" alt="'+esc(m.title)+'">':'<div class="photoTileMissing">Фотография загружается…</div>')+
     '</div>'+
     '<div class="photoTileBody"><div class="photoTileCaption">'+esc(readerCaption)+'</div><h3>'+esc(m.title)+'</h3>'+
       (desc?'<div class="photoTileDesc">'+esc(desc)+'</div>':'')+
       (names.length?'<div class="photoTilePeople"><b>На фото:</b> '+esc(names.slice(0,5).join(", "))+(names.length>5?"…":"")+'</div>':'')+
       (photoNeedsClarification(m)?'<div class="photoTilePeople"><b>Нужно уточнить:</b> '+esc(m.data?.identification_status||"дата, место или люди")+'</div>':'')+
       (m.linked_story?'<div class="photoTileStory">Связано с историей</div>':'')+
       (editor?'<div class="photoEditorialMeta"><button class="badge tagLink" data-tag="'+esc(m.id)+'">'+esc(m.id)+'</button>'+
         (m.linked_story?'<button class="badge tagLink" data-tag="'+esc(m.linked_story)+'">'+esc(m.linked_story)+'</button>':'')+
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
 const image=mediaSigned[m.id]?'<figure class="photoMemoryFigure"><img class="photoDetailImage" src="'+mediaSigned[m.id]+'" alt="'+esc(m.title)+'">'+
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
 document.querySelectorAll("[data-detail-person]").forEach(b=>b.onclick=()=>{const id=b.dataset.detailPerson;if(!id)return;closePhotoModal();showView("people");const p=peopleCache.find(x=>x.id===id);if(p?.group_name&&["10А","10Б"].includes(p.group_name)){peopleGroup=p.group_name;document.querySelectorAll("[data-pgroup]").forEach(x=>x.classList.toggle("on",x.dataset.pgroup===peopleGroup));loadClassPhoto()}selectedPersonId=id;renderPeople();setTimeout(()=>openPersonContext(id),120)});

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
 renderPhotosSection();
 Promise.all(mediaCache.map(async m=>{if(m.current_storage_path)mediaSigned[m.id]=await archiveSignedImage(m.current_storage_path)})).then(()=>{if(photoMode==="archive"&&photoWorkspace!=="upload")renderPhotoGallery()});
}
document.addEventListener("click",e=>{
 const b=e.target.closest("#photoAlbumsAction,#photoClarifyAction,#photoUploadToggle,#photoSearchClear,[data-photo-album],[data-photo-back]");if(!b)return;
 if(b.matches("[data-photo-back]")||b.id==="photoAlbumsAction"){photoAlbumFilter="all";if($("photoSearch"))$("photoSearch").value="";setPhotoWorkspace("albums");return}
 if(b.matches("[data-photo-album]")){photoAlbumFilter=b.dataset.photoAlbum;photoWorkspace="albums";photoMode="archive";photoFilter="all";mediaFocus=null;renderPhotosSection();requestAnimationFrame(()=>$("photosList")?.scrollIntoView({behavior:"smooth",block:"start"}));return}
 if(b.id==="photoSearchClear"){if($("photoSearch"))$("photoSearch").value="";photoAlbumFilter="all";setPhotoWorkspace("albums");return}
 if(b.id==="photoClarifyAction"){setPhotoWorkspace("clarify");requestAnimationFrame(()=>$("photoWorkHeader")?.scrollIntoView({behavior:"smooth",block:"start"}));return}
 if(b.id==="photoUploadToggle"){setPhotoWorkspace("upload");requestAnimationFrame(()=>$("photoWorkHeader")?.scrollIntoView({behavior:"smooth",block:"start"}));return}
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
async function uploadDirectDrivePhoto(file,index,total,onStage){
 ensureImageFile(file);
 let id;
 const {data:retryRows}=await sb.from("archive_media").select("id,data").eq("archive_file",file.name).order("id",{ascending:false}).limit(5);
 const retry=(retryRows||[]).find(r=>r.data?.bulk_import&&r.data?.bulk_error&&!r.data?.original_drive_file_id);
 if(retry)id=retry.id;
 else{
   id=await nextMediaId();
   const title=String(file.name||"Фотография").replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim()||id;
   const {error:ie}=await sb.from("archive_media").insert({
     id,title,category:"архивное фото",archive_file:file.name,linked_story:null,visibility:"members",quality_status:"оригинал",
     provenance_type:"собственное документальное фото",attribution_confidence:"не проверено",publication_permission:"только внутренний архив",
     data:{identification_status:"требует описания",people:[],bulk_import:true,bulk_imported_at:new Date().toISOString()}
   });
   if(ie)throw ie;
 }
 try{
   onStage?.("Подготовка и WebP",file.name);
   const processed=await uploadArchiveVersion(id,file,"копия","Массовая загрузка в Google Drive","");
   const originalPath=processed?.originalPath;
   if(!originalPath)throw new Error("Не получен путь оригинала для переноса в Google Drive.");
   onStage?.("Перенос оригинала в Google Drive",file.name);
   let {data:obj,error:objErr}=await sb.from("archive_original_objects").select("id").eq("source_bucket","archive-originals").eq("source_path",originalPath).maybeSingle();
   if(objErr||!obj?.id){
     const {data:reg,error:regErr}=await sb.functions.invoke("direct-drive-photo-upload",{body:{action:"register-temp",mediaId:id,sourcePath:originalPath,fileName:file.name,mimeType:file.type||"application/octet-stream",fileSize:file.size}});
     if(regErr||!reg?.ok||!reg?.objectId){
       let detail=reg?.detail||reg?.error||"";
       if(!detail&&regErr?.context?.json)try{const j=await regErr.context.json();detail=j?.detail||j?.error||JSON.stringify(j)}catch{}
       throw new Error(detail||regErr?.message||"WebP создана, но оригинал не удалось зарегистрировать для переноса в Google Drive.");
     }
     obj={id:reg.objectId};
   }
   const {data:mir,error:mirErr}=await sb.functions.invoke("mirror-original-to-drive",{body:{objectId:obj.id,releaseSupabase:true}});
   if(mirErr||!mir?.ok||Number(mir?.processed||0)<1){
     let detail=mir?.detail||mir?.error||"";
     if(!detail&&mirErr?.context?.json)try{const j=await mirErr.context.json();detail=j?.detail||j?.error||JSON.stringify(j)}catch{}
     throw new Error(detail||mirErr?.message||"Не удалось перенести оригинал в Google Drive.");
   }
   const {data:registered}=await sb.from("archive_original_objects").select("external_file_id,external_url,source_deleted_at,mirror_status").eq("id",obj.id).maybeSingle();
   if(registered?.mirror_status!=="mirrored"||!registered?.external_file_id)throw new Error("Google Drive не подтвердил сохранение оригинала.");
   const {data:released,error:releaseErr}=await sb.functions.invoke("direct-drive-photo-upload",{body:{action:"release-temp",objectId:obj.id}});
   if(releaseErr||!released?.ok)throw new Error(released?.detail||released?.error||releaseErr?.message||"Оригинал сохранён в Google Drive, но временную копию Supabase удалить не удалось.");
   const {data:row}=await sb.from("archive_media").select("data").eq("id",id).maybeSingle();
   await sb.from("archive_media").update({data:{...(row?.data||{}),bulk_error:null,identification_status:"требует описания",original_storage_backend:"google_drive",original_drive_file_id:registered.external_file_id,original_drive_url:registered.external_url||null,original_file_name:file.name,original_file_size:file.size,original_registered_at:new Date().toISOString()},updated_at:new Date().toISOString()}).eq("id",id);
   return {id,file:file.name,ok:true};
 }catch(e){
   const msg=e?.message||String(e);
   const {data:row}=await sb.from("archive_media").select("data").eq("id",id).maybeSingle();
   await sb.from("archive_media").update({data:{...(row?.data||{}),identification_status:"ошибка массовой загрузки",bulk_import:true,bulk_error:msg},updated_at:new Date().toISOString()}).eq("id",id);
   throw new Error(id+" · "+msg);
 }
}
let driveBulkSelectedFiles=[],driveBulkNewIds=[];
function formatFileSize(n){return n<1024*1024?Math.max(1,Math.round(n/1024))+" КБ":(n/1024/1024).toFixed(1).replace(".",",")+" МБ"}
function renderDriveBulkQueue(states={}){
 const q=$("driveBulkQueue");if(!q)return;
 q.innerHTML=driveBulkSelectedFiles.map((file,i)=>{
   const st=states[i]||{state:"wait",label:"ожидает"};
   const url=URL.createObjectURL(file);
   setTimeout(()=>URL.revokeObjectURL(url),3000);
   return '<div class="photoDeskItem '+esc(st.state)+'" data-bulk-index="'+i+'"><img src="'+esc(url)+'" alt=""><div><b>'+esc(file.name)+'</b><small>'+formatFileSize(file.size)+'</small></div><span>'+esc(st.label)+'</span></div>';
 }).join("");
 const a=$("driveBulkActions");if(a)a.hidden=!driveBulkSelectedFiles.length;
 if($("driveBulkSummary"))$("driveBulkSummary").textContent=driveBulkSelectedFiles.length?driveBulkSelectedFiles.length+" "+plural(driveBulkSelectedFiles.length,"фотография","фотографии","фотографий")+" готовы к загрузке":"";
}
function setDriveBulkState(i,state,label){
 const el=document.querySelector('.photoDeskItem[data-bulk-index="'+i+'"]');if(!el)return;
 el.className="photoDeskItem "+state;const s=el.querySelector(":scope > span");if(s)s.textContent=label;
}
async function uploadDirectDriveBatch(){
 if(profile?.role!=="admin")return;
 const files=driveBulkSelectedFiles.length?driveBulkSelectedFiles:[...($("driveBulkFileInput")?.files||[])];
 if(!files.length){$("driveBulkProgress").textContent="Выберите фотографии.";return}
 const bad=files.find(f=>{try{ensureImageFile(f);return false}catch{return true}});
 if(bad){$("driveBulkProgress").textContent="Неподдерживаемый файл: "+bad.name;return}
 $("driveBulkUploadBtn").disabled=true;$("driveBulkChooseBtn").disabled=true;
 driveBulkNewIds=[];let ok=0,done=0;const fail=[],states={};
 files.forEach((_,i)=>states[i]={state:"wait",label:"ожидает"});renderDriveBulkQueue(states);
 const runOne=async(i)=>{
   states[i]={state:"work",label:"загружается"};setDriveBulkState(i,"work","загружается");
   try{const r=await uploadDirectDrivePhoto(files[i],i+1,files.length,(stage,name)=>{if($("driveBulkCounter"))$("driveBulkCounter").textContent=(i+1)+" из "+files.length;if($("driveBulkProgress"))$("driveBulkProgress").textContent=stage+" · "+name;if($("driveBulkProgressBar"))$("driveBulkProgressBar").style.width=Math.round((done/files.length)*100)+"%"});ok++;driveBulkNewIds.push(r.id);states[i]={state:"done",label:"готово"};setDriveBulkState(i,"done","готово")}
   catch(e){const msg=e.message||String(e);fail.push(files[i].name+" — "+msg);states[i]={state:"fail",label:"ошибка"};setDriveBulkState(i,"fail","ошибка")}
   finally{done++;if($("driveBulkCounter"))$("driveBulkCounter").textContent=done+" из "+files.length;if($("driveBulkProgressBar"))$("driveBulkProgressBar").style.width=Math.round((done/files.length)*100)+"%";if($("driveBulkProgress"))$("driveBulkProgress").textContent=files.length-done?"Сохранено "+done+" · следующий файл готовится":"Загрузка завершена"}
 };
 for(let i=0;i<files.length;i++)await runOne(i);
 $("driveBulkUploadBtn").disabled=false;$("driveBulkChooseBtn").disabled=false;
 $("driveBulkFileInput").value="";driveBulkSelectedFiles=[];
 const doneBox=$("driveBulkDone");doneBox.hidden=false;
 doneBox.innerHTML='<b>Готово: '+ok+' из '+files.length+'</b><span>'+(fail.length?'Есть ошибки: '+esc(fail.join("; ")):'Все оригиналы сохранены, рабочие копии подготовлены.')+'</span>'+(driveBulkNewIds.length?'<button type="button" id="reviewBulkPhotosBtn">Разобрать новые фотографии →</button>':'');
 if($("driveBulkActions"))$("driveBulkActions").hidden=true;
 await loadPhotos();
 if($("reviewBulkPhotosBtn"))$("reviewBulkPhotosBtn").onclick=()=>{const id=driveBulkNewIds[0];if(id)editArchiveCard(id)};
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
if($("adminDriveBulkBox"))$("adminDriveBulkBox").style.display=profile?.role==="admin"?"block":"none";
if($("driveBulkChooseBtn"))$("driveBulkChooseBtn").onclick=()=>$("driveBulkFileInput")?.click();
if($("driveBulkFileInput"))$("driveBulkFileInput").onchange=()=>{driveBulkSelectedFiles=[...($("driveBulkFileInput").files||[])];if($("driveBulkDone"))$("driveBulkDone").hidden=true;renderDriveBulkQueue();};
async function restoreRecentBulkPhotos(){
 if(profile?.role!=="admin"||!$("driveBulkDone"))return;
 const since=new Date(Date.now()-24*60*60*1000).toISOString();
 const {data:rows}=await sb.from("archive_media").select("id,archive_file,data,updated_at").gte("updated_at",since).order("updated_at",{ascending:false}).limit(50);
 const recent=(rows||[]).filter(r=>r.data?.bulk_import&&r.data?.original_drive_file_id&&!r.data?.bulk_error);
 if(!recent.length)return;
 driveBulkNewIds=recent.map(r=>r.id);
 const box=$("driveBulkDone");box.hidden=false;
 box.innerHTML='<b>Последняя загрузка сохранена</b><span>'+recent.length+' '+plural(recent.length,"фотография","фотографии","фотографий")+' находятся в архиве. Можно продолжить их описание.</span><button type="button" id="reviewBulkPhotosBtn">Разобрать фотографии →</button>';
 if($("reviewBulkPhotosBtn"))$("reviewBulkPhotosBtn").onclick=()=>{const id=driveBulkNewIds[0];if(id)editArchiveCard(id)};
}
if($("driveBulkUploadBtn"))$("driveBulkUploadBtn").onclick=uploadDirectDriveBatch;


