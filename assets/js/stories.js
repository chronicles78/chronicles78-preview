function storyPersonName(id){
 const p=peopleCache.find(x=>x.id===id);
 return p?.canonical_name||id;
}
function storyState(s){
 const explicit=s.data?.story_state;
 if(explicit)return explicit;
 if(s.data?.catalog_status==="готово к чтению"||s.full_chapter)return "готовая история";
 return "в работе";
}
function storyMatchesFilter(s){
 const state=storyState(s);
 if(storyFilter==="ready")return state==="готовая история";
 if(storyFilter==="working")return state==="в работе";
 if(storyFilter==="fragments")return state==="фрагмент памяти";
 return true;
}

function storyCoverFor(story){
 const direct=storyCoverMedia[story.id];
 if(direct)return direct;
 const mids=Array.isArray(story.data?.media_ids)?story.data.media_ids:[];
 for(const id of mids){if(storyCoverMedia[id])return storyCoverMedia[id]}
 return null;
}
function openStoryContext(id){
 const s=storyCache.find(x=>x.id===id);if(!s)return;
 const room=s.id==="S-006"?"tanin":s.id==="S-001"?"upk":"general";
 const cover=storyCoverFor(s);
 const preview=cover?.url?'<img src="'+esc(cover.url)+'" alt="'+esc(s.title)+'">':"";
 openContextSheet({
   eyebrow:"ИСТОРИЯ",
   title:s.title,
   meta:[s.period,storyState(s),s.kind].filter(Boolean).join(" · "),
   preview,
   actions:[
     {icon:"▤",label:"Читать историю",kind:"primary",run:()=>openStory(id)},
     {icon:"💬",label:"Обсудить",hint:"Открыть связанную комнату чата",run:()=>{currentRoom=room;renderRooms();showView("chat");subscribe()}},
     ...(s.data?.media_ids?.length?[{icon:"▧",label:"Связанные фотографии",hint:s.data.media_ids.length+" фото",run:()=>{mediaFocus=null;photoMode="archive";photoFilter="story";showView("photos");$("photoSearch").value=s.title;renderPhotosSection()}}]:[])
   ]
 });
}
function renderStoriesCatalog(){
 const q=($("storySearch")?.value||"").trim().toLowerCase();
 let arr=storyCache.filter(storyMatchesFilter);
 if(q){
   arr=arr.filter(s=>{
     const people=(s.data?.people||[]).map(storyPersonName);
     return JSON.stringify([s.id,s.title,s.period,s.kind,s.data?.keywords,s.data?.editorial_summary,people]).toLowerCase().includes(q);
   });
 }
 arr.sort((a,b)=>{
   const ao=a.data?.catalog_order??99,bo=b.data?.catalog_order??99;
   return ao-bo||a.id.localeCompare(b.id);
 });
 const ready=storyCache.filter(s=>storyState(s)==="готовая история").length;
 const working=storyCache.filter(s=>storyState(s)==="в работе").length;
 const fragments=storyCache.filter(s=>storyState(s)==="фрагмент памяти").length;
 $("storyStats").innerHTML='<b>'+storyCache.length+'</b> историй · <b>'+ready+'</b> готово · <b>'+working+'</b> в работе · <b>'+fragments+'</b> фрагментов';
 $("storiesList").className="storyCatalogGrid";
 $("storiesList").innerHTML=arr.map(s=>{
   const people=(s.data?.people||[]).map(storyPersonName).filter(Boolean);
   const kws=(s.data?.keywords||[]).slice(0,4).map(x=>'<button class="badge tagLink" data-tag="'+esc(x)+'">'+esc(x)+'</button>').join("");
   const summary=s.data?.editorial_summary||(s.data?.chapter?.subtitle||"");
   const claims=s.data?.chapter?.claims?.length||0;
   const evidence=s.data?.chapter?.evidence?.length||0;
   const media=(s.data?.media_ids||[]).length;
   const state=storyState(s);
   const featured=state==="готовая история";
   const room=s.id==="S-006"?"tanin":s.id==="S-001"?"upk":"general";
   const cover=storyCoverFor(s);
   const coverUrl=cover?.url||null;
   const status=state==="готовая история"?"готовая история":state==="фрагмент памяти"?"фрагмент памяти":"история в работе";
   return '<article class="storyCatalogCard contextObject '+(featured?"featured":"")+'" data-story-context="'+esc(s.id)+'" tabindex="0">'+
     '<div class="storyCatalogCover">'+
       (coverUrl?'<img src="'+coverUrl+'" alt="'+esc(cover.title||s.title)+'">':'<div class="storyCatalogCoverNo">'+esc(s.period||"Из памяти класса")+'</div>')+
     '</div>'+
     '<div class="storyCatalogBody">'+
       '<div class="storyCatalogKicker"><span>'+esc(s.period||"")+'</span><span>·</span><span>'+esc(status)+'</span></div>'+
       '<h3>'+esc(s.title)+'</h3>'+
       (summary?'<div class="storyCatalogSummary">'+esc(summary.length>420?summary.slice(0,417)+"…":summary)+'</div>':'')+
       (people.length?'<div class="storyCatalogPeople"><b>Голоса:</b> '+esc(people.slice(0,6).join(", "))+(people.length>6?"…":"")+'</div>':'')+
       ((claims||evidence||media)?'<div class="storyCatalogStats">'+
         (claims?'<span class="badge">фактов '+claims+'</span>':'')+
         (evidence?'<span class="badge">свидетельств '+evidence+'</span>':'')+
         (media?'<span class="badge">фото '+media+'</span>':'')+
       '</div>':'')+
       (kws?'<div class="storyCatalogTags">'+kws+'</div>':'')+
       '<div class="storyCatalogActions"><span class="small">Нажмите, чтобы выбрать действие</span></div>'+
     '</div></article>';
 }).join("")||'<div class="notice">По выбранному фильтру историй нет.</div>';
 $("storiesList").querySelectorAll("[data-story-context]").forEach(el=>{el.onclick=e=>{if(e.target.closest("[data-tag]"))return;openStoryContext(el.dataset.storyContext)};el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openStoryContext(el.dataset.storyContext)}}});
}
async function loadStories(){
 if(!user||!profile?.is_active){$("storiesList").className="";$("storiesList").innerHTML='<div class="notice">Сначала войдите в профиль.</div>';return}
 if(!peopleCache.length){
   const {data:pp}=await sb.from("archive_people").select("id,canonical_name,group_name,number,aliases").order("group_name").order("number");
   peopleCache=pp||[];
 }
 const [storiesRes,mediaRes]=await Promise.all([
   sb.from("archive_stories").select("id,title,period,kind,full_chapter,data").order("id"),
   sb.from("archive_media").select("id,title,linked_story,current_storage_path").not("current_storage_path","is",null)
 ]);
 if(storiesRes.error){$("storiesList").className="";$("storiesList").innerHTML='<div class="notice">'+esc(storiesRes.error.message)+'</div>';return}
 storyCache=storiesRes.data||[];
 storyCoverUrls={};storyCoverMedia={};
 const medias=mediaRes.data||[];
 await Promise.all(medias.map(async m=>{
   const url=await archiveSignedImage(m.current_storage_path);
   if(!url)return;
   const rec={id:m.id,title:m.title,url};
   storyCoverMedia[m.id]=rec;
   if(m.linked_story&&!storyCoverMedia[m.linked_story])storyCoverMedia[m.linked_story]=rec;
 }));
 renderStoriesCatalog();
}
document.querySelectorAll("[data-storyfilter]").forEach(b=>b.onclick=()=>{
 storyFilter=b.dataset.storyfilter;
 document.querySelectorAll("[data-storyfilter]").forEach(x=>x.classList.toggle("on",x===b));
 renderStoriesCatalog();
});
$("storySearch").oninput=()=>renderStoriesCatalog();

function personGroupHtml(title,arr){
 if(!arr?.length)return "";
 return '<section class="storySection"><div class="sectionTitle">'+esc(title)+'</div><div class="participantGrid">'+
   arr.map(p=>'<div class="participantCard"><b>'+esc(p.name||p.id)+'</b>'+(p.basis?'<div class="small">'+esc(p.basis)+'</div>':'')+'</div>').join("")+
 '</div></section>';
}
async function openStory(id){
 openStoryId=id;
 const {data:s,error}=await sb.from("archive_stories").select("*").eq("id",id).maybeSingle();
 if(error||!s){alert(error?.message||"История не найдена");return}
 const ch=s.data?.chapter;
 const cover=storyCoverFor(s);
 let html='<div class="storyHero">'+
   (cover?.url?'<div class="storyHeroCover"><img src="'+cover.url+'" alt="'+esc(cover.title||s.title)+'"></div>':'')+
   '<div class="storyHeroInner"><div class="memoryEyebrow">'+esc(s.period||"ИЗ ПАМЯТИ КЛАССА")+'</div>'+
   '<h2>'+esc(s.title)+'</h2>'+
   '<div class="storyMeta"><button class="badge tagLink" data-tag="'+esc(s.id)+'">'+esc(s.id)+'</button>'+(s.kind?'<button class="badge tagLink" data-tag="'+esc(s.kind)+'">'+esc(s.kind)+'</button>':'')+'<span class="badge">'+esc(storyState(s))+'</span>'+(s.full_chapter?'<span class="badge">развёрнутая реконструкция</span>':'')+'</div>';
 if(!ch){
   if(s.data?.editorial_summary){
     html+='<div class="storyIntro">'+esc(s.data.editorial_summary)+'</div>';
     if(s.data?.highlights?.length){
       html+='</div></div><section class="storySection"><div class="sectionTitle">Главное</div>'+
         s.data.highlights.map(x=>'<div class="storyFact">'+esc(x)+'</div>').join("")+'</section>';
     }else html+='</div></div>';
     if(s.data?.source_basis)html+='<div class="storySource"><b>Основание:</b> '+esc(s.data.source_basis)+'</div>';
   } else {
     html+='<div class="storyIntro">Для этой истории пока собрана карточка и связи с архивом. Развёрнутая редакционная реконструкция ещё не подготовлена.</div></div></div>';
   }
   const kws=s.data?.keywords||[];
   if(kws.length)html+='<section class="storySection"><div class="sectionTitle">Ключевые темы</div><div class="storyKeywords">'+kws.map(x=>'<button class="badge tagLink" data-tag="'+esc(x)+'">'+esc(x)+'</button>').join("")+'</div></section>';
 } else {
   html+=(ch.subtitle?'<div class="storyIntro"><b>'+esc(ch.subtitle)+'</b></div>':'')+
     '<div class="storyMeta">'+
     (ch.place?'<span class="badge">Место: '+esc(ch.place)+'</span>':'')+
     (ch.event_status?'<span class="badge">Статус: '+esc(ch.event_status)+'</span>':'')+
     '</div>'+
     (ch.editorial_note?'<div class="storySource">'+esc(ch.editorial_note)+'</div>':'')+
     '</div></div>'+
     personGroupHtml("Подтверждённые участники",ch.participants?.confirmed)+
     personGroupHtml("Возможные участники",ch.participants?.possible)+
     personGroupHtml("Отсутствовали / не подтверждены",ch.participants?.absent||ch.participants?.absent_or_not_on_photo);
   if(ch.claims?.length){
     html+='<section class="storySection"><div class="sectionTitle">Что удалось восстановить</div>'+
       ch.claims.map(c=>'<div class="storyFact"><b>'+esc(c.title)+'</b><div>'+(c.status?'<span class="badge">'+esc(c.status)+'</span>':'')+(c.certainty?'<span class="badge">'+esc(c.certainty)+'</span>':'')+'</div><div class="small">'+esc(c.summary||"")+'</div></div>').join("")+
     '</section>';
   }
   if(ch.evidence?.length){
     html+='<section class="storySection"><div class="sectionTitle">Свидетельства</div>'+
       ch.evidence.map(e=>'<div class="storyEvidence"><b>'+esc(e.author||"")+'</b> '+(e.kind?'<span class="badge">'+esc(e.kind)+'</span>':'')+(e.date?'<div class="small">'+esc(e.date)+'</div>':'')+(e.quote?'<div class="quote">«'+esc(e.quote)+'»</div>':'')+(e.editorial_summary&&e.editorial_summary!==e.quote?'<div class="small" style="margin-top:7px">'+esc(e.editorial_summary)+'</div>':'')+'</div>').join("")+
     '</section>';
   }
   if(ch.open_questions?.length){
     html+='<section class="storySection"><div class="sectionTitle">Что ещё не установлено</div>'+ch.open_questions.map(q=>'<div class="storyQuestion">'+esc(q)+'</div>').join("")+'</section>';
   }
 }
 $("storyDetailBody").innerHTML=html;
 $("storyDetail").classList.add("open");
 $("storyDetail").scrollTop=0;
}
$("closeStory").onclick=()=>{
 if(history.state?.chronicles78Tag){history.back();return}
 $("storyDetail").classList.remove("open");openStoryId=null;
};
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"){
   document.querySelectorAll("details.footMenu[open]").forEach(d=>d.removeAttribute("open"));
   if($("storyDetail")?.classList.contains("open"))$("storyDetail").classList.remove("open");
 }
});

