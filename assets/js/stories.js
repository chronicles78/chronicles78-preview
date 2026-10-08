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
 if(story.data?.cover_mode==="none")return null;
 const explicit=story.data?.cover_media_id;
 if(explicit&&storyCoverMedia[explicit])return storyCoverMedia[explicit];
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
 const fragment=storyState(s)==="фрагмент памяти";
 openContextSheet({
   eyebrow:fragment?"ФРАГМЕНТ ПАМЯТИ":"ИСТОРИЯ",
   title:s.title,
   meta:[s.period,fragment?(s.data?.fragment_type||storyState(s)):storyState(s),s.kind].filter(Boolean).join(" · "),
   preview,
   actions:[
     {icon:fragment?"?":"▤",label:fragment?"Что известно":"Читать историю",kind:"primary",run:()=>openStory(id)},
     {icon:"💬",label:"Обсудить",hint:"Открыть связанную комнату чата",run:async()=>{currentRoom=room;renderRooms();await showView("chat");subscribe()}},
     ...(s.data?.media_ids?.length?[{icon:"▧",label:"Связанные фотографии",hint:s.data.media_ids.length+" фото",run:async()=>{mediaFocus=null;photoMode="archive";photoFilter="story";await showView("photos");if($("photoSearch"))$("photoSearch").value=s.title;renderPhotosSection()}}]:[])
   ]
 });
}
const storyShelves=[
 {title:"Школа и класс",note:"Уроки, переход в 78-ю, экзамены и те сцены, из которых складывалась повседневная жизнь класса.",ids:["S-001","S-006","S-051","S-014","S-015"]},
 {title:"Люди 78-й",note:"Портреты, большие личные тексты и характеры, которые память сохранила особенно отчётливо.",ids:["S-002","S-003","S-004","S-005","S-017","S-018","S-036","S-019","S-032"]},
 {title:"Свобода за школьным порогом",note:"Походы, лагеря, Заволга и первые решения, которые принимались уже без школьного звонка.",ids:["S-012","S-020","S-021","S-022","S-023","S-024","S-033","S-034"]},
 {title:"Музыка, мода и свои правила",note:"Джинсы, фураги, самодельная одежда, магнитофоны и музыка как язык поколения.",ids:["S-011","S-028","S-029","S-030","S-031"]},
 {title:"Первые деньги",note:"Работа школьников, собственный заработок и первые столкновения с настоящей взрослой экономикой.",ids:["S-025","S-026","S-027"]},
 {title:"После звонка",note:"То, что происходило уже после школы: первые встречи выпускников и возвращение старых фотографий.",ids:["S-016","S-010"]},
 {title:"Как мы вспоминаем",note:"Внутренние легенды и история самого архива — память как отдельный сюжет «Хроник 78-й».",ids:["S-007","S-000"]}
];
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
 const renderCard=s=>{
   const people=(s.data?.people||[]).map(storyPersonName).filter(Boolean);
   const kws=(s.data?.keywords||[]).slice(0,4).map(x=>'<button class="badge tagLink" data-tag="'+esc(x)+'">'+esc(x)+'</button>').join("");
   const storyExcerpt=String(s.data?.story_text||"").replace(/\s+/g," ").trim();
   const summary=storyExcerpt?(storyExcerpt.length>220?storyExcerpt.slice(0,217)+"…":storyExcerpt):"";
   const claims=s.data?.chapter?.claims?.length||0;
   const evidence=s.data?.chapter?.evidence?.length||0;
   const media=(s.data?.media_ids||[]).length;
   const state=storyState(s);
   const readable=!!String(s.data?.story_text||"").trim();
   const featured=state==="готовая история";
   const room=s.id==="S-006"?"tanin":s.id==="S-001"?"upk":"general";
   const cover=storyCoverFor(s);
   const coverUrl=cover?.url||null;
   const status=state==="готовая история"?"из воспоминаний":state==="фрагмент памяти"?(s.data?.fragment_type||"фрагмент памяти"):"история в работе";
   return '<article class="storyCatalogCard contextObject '+(featured?"featured":"")+'" data-story-context="'+esc(s.id)+'" tabindex="0">'+
     '<div class="storyCatalogCover">'+
       (coverUrl?'<img src="'+coverUrl+'" alt="'+esc(cover.title||s.title)+'">':'<div class="storyCatalogCoverNo">'+esc(s.period||"Из памяти класса")+'</div>')+
     '</div>'+
     '<div class="storyCatalogBody">'+
       '<div class="storyCatalogKicker"><span>'+esc(status)+'</span>'+(s.period?'<span>'+esc(s.period)+'</span>':'')+'</div>'+
       '<h3>'+esc(s.title)+'</h3>'+
       (summary?'<div class="storyCatalogSummary">'+esc(summary.length>420?summary.slice(0,417)+"…":summary)+'</div>':'')+
       (people.length?'<div class="storyCatalogPeople"><b>Голоса:</b> '+esc(people.slice(0,6).join(", "))+(people.length>6?"…":"")+'</div>':'')+
       ((claims||evidence||media)?'<div class="storyCatalogStats">'+
         (claims?'<span class="badge">фактов '+claims+'</span>':'')+
         (evidence?'<span class="badge">свидетельств '+evidence+'</span>':'')+
         (media?'<span class="badge">фото '+media+'</span>':'')+
       '</div>':'')+
       (kws?'<div class="storyCatalogTags">'+kws+'</div>':'')+
       '<div class="storyCatalogActions">'+(readable?'<button class="secondary storyReadDirect" data-story-read="'+esc(s.id)+'">Читать историю</button>':state==="фрагмент памяти"?'<button class="secondary storyReadDirect" data-story-read="'+esc(s.id)+'">Открыть материалы</button>':'<span class="storyPreparing">Текст готовится из найденных первоисточников</span>')+(profile?.role==="editor"||profile?.role==="admin"?'<button class="editorialLink" data-story-edit="'+esc(s.id)+'">Исправить сведения</button>':'')+'</div>'+
     '</div></article>';
 };
 const stories=arr.filter(s=>storyState(s)!=="фрагмент памяти");
 const fragmentArr=arr.filter(s=>storyState(s)==="фрагмент памяти");
 let catalogHtml='';
 const visibleIds=new Set(stories.map(s=>s.id));
 storyShelves.forEach((sh,chapterIndex)=>{
   const shelfStories=sh.ids.filter(id=>visibleIds.has(id)).map(id=>stories.find(s=>s.id===id)).filter(Boolean);
   if(!shelfStories.length)return;
   catalogHtml+='<div class="storyShelfHead thematicShelf" id="story-chapter-'+(chapterIndex+1)+'"><div><small>ГЛАВА '+(chapterIndex+1)+'</small><b>'+esc(sh.title)+'</b><span>'+esc(sh.note)+'</span></div><strong>'+shelfStories.length+'</strong></div>'+shelfStories.map(renderCard).join('');
 });
 const shelved=new Set(storyShelves.flatMap(sh=>sh.ids));
 const otherStories=stories.filter(s=>!shelved.has(s.id));
 if(otherStories.length)catalogHtml+='<div class="storyShelfHead thematicShelf"><div><b>Новые истории</b><span>Недавно добавленные материалы, которым ещё предстоит занять своё место в книге.</span></div><strong>'+otherStories.length+'</strong></div>'+otherStories.map(renderCard).join('');
 if(fragmentArr.length)catalogHtml+='<div class="storyShelfHead fragmentShelf"><div><b>Фрагменты и открытые вопросы</b><span>Фотографии, версии и детали, которые ещё уточняются или не требуют превращения в отдельный рассказ.</span></div><strong>'+fragmentArr.length+'</strong></div>'+fragmentArr.map(renderCard).join('');
 $("storiesList").innerHTML=catalogHtml||'<div class="notice">По выбранному фильтру историй нет.</div>';
 const toc=$("storyToc");
 if(toc){
   toc.querySelectorAll("[data-story-chapter]").forEach(btn=>{
     const n=btn.dataset.storyChapter;
     const target=$("story-chapter-"+n);
     btn.hidden=!target;
     btn.onclick=()=>target?.scrollIntoView({behavior:"smooth",block:"start"});
   });
 }
 $("storiesList").querySelectorAll("[data-story-context]").forEach(el=>{el.onclick=e=>{if(e.target.closest("[data-tag],[data-story-read],[data-story-edit]"))return;openStoryContext(el.dataset.storyContext)};el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openStoryContext(el.dataset.storyContext)}}});
 $("storiesList").querySelectorAll("[data-story-read]").forEach(b=>b.onclick=e=>{e.stopPropagation();openStory(b.dataset.storyRead)});
 $("storiesList").querySelectorAll("[data-story-edit]").forEach(b=>b.onclick=e=>{e.stopPropagation();editStoryInfo(b.dataset.storyEdit)});
}
async function loadStories(){
 if(!user||!profile?.is_active){$("storiesList").className="";$("storiesList").innerHTML='<div class="notice">Сначала войдите в профиль.</div>';return}
 if(!peopleCache.length){
   const {data:pp}=await sb.from("archive_people").select("id,canonical_name,group_name,number,aliases").order("group_name").order("number");
   peopleCache=pp||[];
 }
 const [storiesRes,mediaRes]=await Promise.all([
   sb.from("archive_stories").select("id,title,period,kind,full_chapter,data").order("id"),
   sb.from("archive_media").select("id,media_type,title,linked_story,current_storage_path,data")
     .eq("media_type","photo")
     .not("current_storage_path","is",null)
 ]);
 if(storiesRes.error){$("storiesList").className="";$("storiesList").innerHTML='<div class="notice">'+esc(storiesRes.error.message)+'</div>';return}
 storyCache=storiesRes.data||[];
 storyCoverUrls={};storyCoverMedia={};

 const storyIds=new Set(storyCache.map(x=>x.id));
 const explicitMediaIds=new Set();
 storyCache.forEach(st=>{
   if(st.data?.cover_mode==="none")return;
   if(st.data?.cover_media_id)explicitMediaIds.add(st.data.cover_media_id);
   (Array.isArray(st.data?.media_ids)?st.data.media_ids:[]).forEach(id=>id&&explicitMediaIds.add(id));
 });
 const coverMedias=(mediaRes.data||[]).filter(m=>
   explicitMediaIds.has(m.id)||(m.linked_story&&storyIds.has(m.linked_story))
 );

 if(typeof prefetchArchiveMediaUrls==="function"){
   await prefetchArchiveMediaUrls(coverMedias);
 }else{
   await Promise.all(coverMedias.map(async m=>{
     const url=await archiveSignedImage(m.current_storage_path);
     if(url)mediaSigned[m.id]=url;
   }));
 }

 for(const m of coverMedias){
   const url=mediaSigned[m.id]||await archiveSignedImage(m.current_storage_path);
   if(!url)continue;
   const rec={id:m.id,title:m.title,url};
   storyCoverMedia[m.id]=rec;
   if(m.linked_story&&!storyCoverMedia[m.linked_story])storyCoverMedia[m.linked_story]=rec;
 }
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
async function editStoryInfo(id){
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const st=storyCache.find(x=>x.id===id);if(!st)return;
 const current=(st.data?.people||[])[0]||"";
 const opts=peopleCache.slice().sort((a,b)=>(a.canonical_name||"").localeCompare(b.canonical_name||"","ru")).map(x=>'<option value="'+esc(x.id)+'" '+(x.id===current?'selected':'')+'>'+esc(x.canonical_name||x.id)+' · '+esc(x.group_name||"")+'</option>').join("");
 const {data:mediaRows,error:mediaError}=await sb.from("archive_media")
   .select("id,title,current_storage_path,media_type")
   .eq("media_type","photo")
   .not("current_storage_path","is",null)
   .order("id");
 if(mediaError){alert(mediaError.message);return}
 const coverMode=st.data?.cover_mode==="none"?"none":(st.data?.cover_media_id||"auto");
 const coverOpts=(mediaRows||[]).map(m=>'<option value="'+esc(m.id)+'" '+(coverMode===m.id?'selected':'')+'>'+esc(m.id+" — "+m.title)+'</option>').join("");
 openPhotoModal("Исправить сведения об истории",
  '<label>Название</label><input id="pfStoryTitle" value="'+esc(st.title||"")+'">'+
  '<label>Период</label><input id="pfStoryPeriod" value="'+esc(st.period||"")+'">'+
  '<label>Автор / основной рассказчик</label><select id="pfStoryPerson"><option value="">Не указан</option>'+opts+'</select>'+
  '<label>Обложка истории</label><select id="pfStoryCover"><option value="auto" '+(coverMode==="auto"?'selected':'')+'>Автоматически — первое связанное фото</option><option value="none" '+(coverMode==="none"?'selected':'')+'>Без обложки</option>'+coverOpts+'</select>'+
  '<div class="formHint">Можно выбрать любое фото из действующего фотоархива. После сохранения оно станет обложкой карточки и самой истории.</div>'+
  '<label>Краткое описание</label><textarea id="pfStorySummary" style="min-height:120px">'+esc(st.data?.editorial_summary||"")+'</textarea>'+
  '<label>Текст истории</label><textarea id="pfStoryText" style="min-height:260px" placeholder="Редакторский текст для чтения">'+esc(st.data?.story_text||"")+'</textarea>',
  async()=>{
   const title=$("pfStoryTitle").value.trim();if(!title)throw new Error("Укажите название.");
   const period=$("pfStoryPeriod").value.trim(),personId=$("pfStoryPerson").value,summary=$("pfStorySummary").value.trim(),storyText=$("pfStoryText").value.trim(),coverChoice=$("pfStoryCover").value;
   const nextData={...(st.data||{}),people:personId?[personId]:[],editorial_summary:summary,story_text:storyText};
   if(coverChoice==="none"){nextData.cover_mode="none";nextData.cover_media_id=null}
   else if(coverChoice==="auto"){delete nextData.cover_mode;delete nextData.cover_media_id}
   else{nextData.cover_mode="manual";nextData.cover_media_id=coverChoice}
   const {error}=await sb.from("archive_stories").update({title,period:period||null,data:nextData,updated_at:new Date().toISOString()}).eq("id",id);
   if(error)throw error;closePhotoModal();await loadStories();
  });
}
function fragmentOpenQuestion(s){
 const type=s.data?.fragment_type||"";
 if(type==="поиск фотографии")return "Найти и атрибутировать фотографию, которую участники помнят по этому эпизоду.";
 if(type==="фотоархив")return "Перенести найденный цифровой массив в архив сайта, убрать дубли и подписать людей, место и дату.";
 if(type==="атрибуция и датировка")return "Закрепить датировку фотографии более твёрдым свидетельством: подписью, документом или независимым воспоминанием.";
 if(type==="архивный поиск")return "Продолжать пополнять архив новыми снимками и связывать их с людьми и историями.";
 return "";
}
async function openStory(id){
 openStoryId=id;
 const {data:s,error}=await sb.from("archive_stories").select("*").eq("id",id).maybeSingle();
 if(error||!s){alert(error?.message||"История не найдена");return}
 const ch=s.data?.chapter;
 const cover=storyCoverFor(s);
 const isFragment=storyState(s)==="фрагмент памяти";
 const editorialMode=["editor","admin"].includes(profile?.role);
 const storyText=String(s.data?.story_text||"").trim();

 let html='<div class="storyHero">'+
   (cover?.url?'<div class="storyHeroCover"><img src="'+cover.url+'" alt="'+esc(cover.title||s.title)+'"></div>':'')+
   '<div class="storyHeroInner"><div class="memoryEyebrow">'+esc(isFragment?(s.data?.fragment_type||"ФРАГМЕНТ ПАМЯТИ"):(s.period||"ИЗ ПАМЯТИ КЛАССА"))+'</div>'+
   '<h2>'+esc(s.title)+'</h2>'+
   '<div class="storyMeta"><button class="badge tagLink" data-tag="'+esc(s.id)+'">'+esc(s.id)+'</button>'+
     (s.kind?'<button class="badge tagLink" data-tag="'+esc(s.kind)+'">'+esc(s.kind)+'</button>':'')+
     '<span class="badge">'+esc(storyState(s))+'</span>'+
     (ch?.place?'<span class="badge">Место: '+esc(ch.place)+'</span>':'')+
   '</div></div></div>';

 if(storyText){
   html+='<section class="storySection storyReadingText"><div class="storyProse">'+esc(storyText).replace(/\n/g,"<br>")+'</div></section>';
 }else if(!isFragment){
   html+='<div class="notice">Текст этой истории пока не подготовлен.</div>';
 }

 if(isFragment){
   const oq=fragmentOpenQuestion(s);
   const known=s.data?.highlights?.length
     ?s.data.highlights.map(x=>'<div class="storyFact">'+esc(x)+'</div>').join("")
     :(s.data?.editorial_summary?'<div class="storyFact">'+esc(s.data.editorial_summary)+'</div>':'');
   if(known)html+='<section class="storySection fragmentKnown"><div class="sectionTitle">Что известно</div>'+known+'</section>';
   if(oq)html+='<section class="storySection fragmentQuestion"><div class="sectionTitle">Что ещё не установлено</div><div class="storyQuestion">'+esc(oq)+'</div></section>';
   if(s.data?.source_basis)html+='<div class="storySource"><b>Основание:</b> '+esc(s.data.source_basis)+'</div>';
 }

 if(Array.isArray(s.data?.original_sources)&&s.data.original_sources.length){
   html+='<section class="storySection storySources"><div class="sectionTitle">Как это вспоминали</div><p class="storySourceIntro">Слова участников сохранены отдельно.</p>';
   s.data.original_sources.forEach(src=>{
     html+='<article class="storySourceItem"><div class="storySourceMeta"><b>'+esc(src.author||"Участник")+'</b><span>'+esc([src.date,src.time].filter(Boolean).join(" · "))+'</span></div>'+
       (src.source_type?'<div class="storySourceType">'+esc(src.source_type)+'</div>':'')+
       '<div class="storySourceText">'+esc(src.text||"").replace(/\n/g,"<br>")+'</div></article>';
   });
   html+='</section>';
 }

 // Reconstruction and AI/editorial summaries are useful to the editorial team,
 // but they should not interrupt ordinary reading.
 if(editorialMode){
   if(!ch){
     if(!isFragment&&(s.data?.highlights?.length||s.data?.source_basis||s.data?.editorial_summary)){
       html+='<section class="storySection storyEditorialNote"><div class="storyLayerLabel">РЕДАКЦИОННОЕ ДОСЬЕ</div><div class="sectionTitle">Редакторская справка</div>'+
         (s.data?.editorial_summary?'<div class="storySource">'+esc(s.data.editorial_summary)+'</div>':'')+
         (s.data?.highlights?.length?s.data.highlights.map(x=>'<div class="storyFact">'+esc(x)+'</div>').join(""):'')+
         (s.data?.source_basis?'<div class="storySource"><b>Основание:</b> '+esc(s.data.source_basis)+'</div>':'')+
       '</section>';
     }
   }else{
     html+='<section class="storySection storyReconstruction"><div class="storyLayerLabel">РЕКОНСТРУКЦИЯ ПО СВИДЕТЕЛЬСТВАМ</div><div class="sectionTitle">Что удалось восстановить</div>'+
       (ch.editorial_note?'<div class="storySource">'+esc(ch.editorial_note)+'</div>':'')+
       '</section>'+
       personGroupHtml("Подтверждённые участники",ch.participants?.confirmed)+
       personGroupHtml("Возможные участники",ch.participants?.possible)+
       personGroupHtml("Отсутствовали / не подтверждены",ch.participants?.absent||ch.participants?.absent_or_not_on_photo);

     if(ch.claims?.length){
       html+='<section class="storySection"><div class="sectionTitle">Факты и версии</div>'+
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
 }

 $("storyDetailBody").innerHTML=html;
 $("storyDetail").classList.add("open");
 $("storyDetail").scrollTop=0;
 if(typeof updateContextBack==="function")updateContextBack();
}
$("closeStory").onclick=()=>{
 if(history.state?.chronicles78Tag){history.back();return}
 $("storyDetail").classList.remove("open");openStoryId=null;
 if(typeof updateContextBack==="function")updateContextBack();
};
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"){
   document.querySelectorAll("details.footMenu[open]").forEach(d=>d.removeAttribute("open"));
   if($("storyDetail")?.classList.contains("open")){$("storyDetail").classList.remove("open");openStoryId=null;if(typeof updateContextBack==="function")updateContextBack()}
 }
});

