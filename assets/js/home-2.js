/* Isolated adapter; only home-2.html loads this file. Existing core/modules stay intact. */
(()=>{
  const stage=document.getElementById("home2Stage");
  if(!stage)return;
  const initial=stage.innerHTML;
  let generation=0,pending=null,loadedOwner=null,loadedWeek=null,loadedAt=0;
  let searchCache=null,searchPending=null,searchOwner=null,searchSequence=0,focusBeforeSearch=null;
  const el=id=>document.getElementById(id);
  const active=()=>!!user&&!!profile?.is_active;
  const owner=()=>active()?user.id:null;
  const text=value=>{
    const tmp=document.createElement("textarea");tmp.innerHTML=String(value||"");
    return tmp.value.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
  };
  const excerpt=(value,max=190)=>homeTextExcerpt(text(value),max);
  function placeholder(label="Архивный лист"){
    return '<span class="h2ImagePlaceholder">'+esc(label)+'</span>';
  }
  function picture(url,alt){return url?'<img src="'+esc(url)+'" alt="'+esc(alt)+'" decoding="async">':placeholder(alt)}
  function reset(){
    generation++;pending=null;loadedOwner=null;loadedWeek=null;loadedAt=0;
    searchCache=null;searchPending=null;searchOwner=null;searchSequence++;
    stage.innerHTML=initial;
    closeSearch();homeThemeSync();
  }
  function setObject(node,type,id,group){
    if(!node)return;
    delete node.dataset.homeView;
    if(id){node.dataset.homeObject=type;node.dataset.homeId=id;if(group)node.dataset.homeGroup=group;node.disabled=false}
    else{delete node.dataset.homeObject;delete node.dataset.homeId;delete node.dataset.homeGroup;node.disabled=true}
  }
  async function openObject(type,id,group){
    if(!active()){await showView("profile");return}
    if(type==="story"){await showView("stories");await openStory(id)}
    else if(type==="photo"){mediaFocus=id;await showView("photos");await openArchivePhoto(id)}
    else if(type==="city"){await showView("city");await openCityEssay(id)}
    else if(type==="person"){
      if(group)peopleGroup=group;
      selectedPersonId=id;
      document.querySelectorAll("[data-pgroup]").forEach(b=>b.classList.toggle("on",b.dataset.pgroup===peopleGroup));
      await showView("people");await openPersonContext(id);
    }
  }
  async function rows(query){const result=await query;if(result.error)throw result.error;return result.data||[]}
  function latest(list){return [...list].sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||""))||String(a.id).localeCompare(String(b.id)))[0]||null}
  function mediaCover(st,media){
    if(!st)return null;
    return media.find(m=>m.id===st.data?.cover_media_id)||[...media].filter(m=>m.linked_story===st.id).sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0]||null;
  }
  async function loadHome2(force=false){
    if(!active()){reset();return true}
    const who=owner(),rotation=ChroniclesHome2Rotation.select();
    if(pending?.owner===who)return pending.promise;
    if(!force&&loadedOwner===who&&loadedWeek===rotation.week&&Date.now()-loadedAt<60000)return true;
    const seq=++generation;
    const valid=()=>seq===generation&&owner()===who;
    const promise=(async()=>{
      try{
        const [photos,stories,allMedia,people,regions,config]=await Promise.all([
          rows(sb.from("class_photos").select("id,title,group_name,storage_path,source_width,source_height")),
          rows(sb.from("archive_stories").select("id,title,period,kind,data,updated_at").order("id")),
          rows(sb.from("archive_media").select("id,title,media_type,linked_story,current_storage_path,updated_at,data,approx_date_text,location_text,category").order("updated_at",{ascending:false})),
          rows(sb.from("archive_people").select("id,number,group_name,canonical_name,identification_status")),
          rows(sb.from("class_photo_regions").select("class_photo_id,person_id,x,y,w,h")),
          rows(sb.from("home_page_elements").select("key,content,is_enabled"))
        ]);
        if(!valid())return false;
        const cfg=new Map(config.filter(c=>c.is_enabled).map(c=>[c.key,c.content]));
        const media=allMedia.filter(m=>m.media_type!=="video"&&m.current_storage_path);
        const byId=new Map(media.map(m=>[m.id,m]));
        const cp=photos.find(p=>p.id==="CLASS-10B"),cpA=photos.find(p=>p.id==="CLASS-10A");
        const ready=stories.filter(s=>s.data?.catalog_status==="готово к чтению");
        // A withdrawn scheduled story is omitted, never replaced midweek.
        const week=ready.find(s=>s.id===rotation.storyId)||null;
        const newest=latest(ready),fresh=latest(media);
        const cover=mediaCover(week,media),newCover=mediaCover(newest,media);
        const person=people.find(p=>p.id===rotation.personId&&p.group_name==="10А"&&p.identification_status!=="подтверждено");
        const region=person&&regions.find(r=>r.person_id===person.id&&r.class_photo_id==="CLASS-10A");
        const cityPhoto=byId.get("MEDIA-065");
        const postcard=byId.get("MEDIA-062");
        // Do not label arbitrary school photos as Volga. A real city/river selection is required.
        const river=media.find(m=>/волг|набережн|куйбышев|самара/i.test([m.title,m.location_text].join(" "))&&m.category!=="иллюстрация к этюду")||null;
        const editorPhoto=key=>byId.get(cfg.get(key)?.source_id);
        const rubricStory=editorPhoto("rubric.stories")||newCover;
        const rubricCity=postcard||editorPhoto("rubric.city");
        const paths=[cp?.storage_path,cpA?.storage_path,...[cover,newCover,fresh,cityPhoto,postcard,river,rubricStory,rubricCity].map(m=>m?.current_storage_path)].filter(Boolean);
        const signed=new Map(await Promise.all([...new Set(paths)].map(async path=>[path,await archiveSignedImage(path)])));
        if(!valid())return false;
        const url=m=>m?signed.get(m.current_storage_path):null;
        const putPhoto=(id,m,caption)=>{
          const node=el(id);node.innerHTML=picture(url(m),m?.title||caption)+(caption?'<figcaption>'+esc(caption)+'</figcaption>':"");
          if(m)setObject(node,"photo",m.id);
        };
        el("h2ClassPhoto").innerHTML=picture(signed.get(cp?.storage_path),"10Б · школа №78 · 1982–1983")+'<figcaption>10Б · школа №78 · 1982–1983</figcaption>';
        putPhoto("h2RiverPhoto",river,river?.title||"Волга · кадр для обложки ещё выбирается");
        putPhoto("h2CityPhoto",cityPhoto,cityPhoto?.title||"Школа №78");
        putPhoto("h2Postcard",postcard,postcard?.title||"Городская открытка");
        el("h2PeopleThumb").innerHTML=picture(signed.get(cp?.storage_path),"Наш класс");
        el("h2StoriesThumb").innerHTML=picture(url(rubricStory),rubricStory?.title||"Истории класса");
        el("h2CityThumb").innerHTML=picture(url(rubricCity),rubricCity?.title||"Город и время");
        el("h2PeopleCount").textContent=people.length+" человек.";
        el("h2StoriesCount").textContent=stories.length+" "+photoPlural(stories.length,"история","истории","историй")+".";
        el("h2WeekPhoto").innerHTML=picture(url(cover),cover?.title||"Архивный лист");
        setObject(el("h2WeekPhoto"),"story",week?.id);
        setObject(el("h2WeekRead"),"story",week?.id);
        const summary=week?.data?.editorial_summary||week?.data?.chapter?.subtitle||week?.data?.story_text||"";
        el("h2WeekTitle").textContent=week?.title||"История недели готовится";
        el("h2WeekSummary").textContent=week?excerpt(summary,240):"Выбранная история временно недоступна. Другие готовые истории можно найти в оглавлении.";
        el("h2WeekRead").textContent="Читать историю →";
        const source=week?.data?.original_sources?.find(s=>s.text);
        el("h2WeekQuote").textContent=source?excerpt(source.text,170):"Книга, которую можно читать. Память, по которой можно ходить.";
        el("h2WeekSource").textContent=source?(source.author||source.author_name||week.period||"Из наших воспоминаний"):"Хроники-78";
        function card(id,heading,item,imgUrl,kind,description){
          const node=el(id);setObject(node,kind,item?.id);
          node.innerHTML='<div class="h2FreshImage">'+picture(imgUrl,item?.title||heading)+'</div><div><h3>'+esc(heading)+'</h3><p>'+esc(description||item?.title||"Материал пока не добавлен")+'</p><small>'+esc(item?.approx_date_text||item?.period||"")+'</small></div><span class="h2Arrow" aria-hidden="true">→</span>';
        }
        card("h2FreshPhoto","Новые фотографии",fresh,url(fresh),"photo");
        card("h2FreshStory","Новая история",newest,url(newCover),"story");
        const face=el("h2FreshFace");
        const crop=region&&cpA&&cropImageHtml(signed.get(cpA.storage_path),cpA,region,"h2Face",4/5,0,0,"","Неопознанный ученик 10А №"+person.number);
        setObject(face,"person",crop?person.id:null,"10А");
        face.innerHTML='<div class="h2FreshImage">'+(crop||placeholder("Лицо этой недели опознано"))+'</div><div><h3>Неопознанное лицо</h3><p>'+(crop?'Ученик №'+esc(person.number)+'. Кто это на фото?':'Спасибо за помощь архиву.')+'</p><small>10А · 1982–1983</small></div><span class="h2Arrow" aria-hidden="true">→</span>';
        if(river&&url(river)){el("h2Final").querySelector("img")?.remove();el("h2Final").insertAdjacentHTML("afterbegin",picture(url(river),river.title))}
        // No fake quotation: the static project motto is used unless there is an actual original source.
        const title=cfg.get("hero.title");
        if(title){
          if(title.title)stage.querySelector(".h2Title h1").textContent=title.title;
          if(title.kicker)stage.querySelector(".h2Kicker").textContent=title.kicker;
        }
        loadedOwner=who;loadedWeek=rotation.week;loadedAt=Date.now();
        return true;
      }catch(error){
        if(valid()){
          el("h2WeekTitle").textContent="Архив не удалось загрузить";
          el("h2WeekSummary").textContent="Проверьте подключение и попробуйте снова.";
          const button=el("h2WeekRead");delete button.dataset.homeView;delete button.dataset.homeObject;button.dataset.homeRefresh="1";button.disabled=false;button.textContent="Повторить →";
          console.warn("Home 2.0 load failed",error?.message||error);
        }
        return false;
      }finally{if(seq===generation)pending=null}
    })();
    pending={owner:who,promise};return promise;
  }
  // Replace only the home entry point of the shared application in this preview.
  window.loadHome=loadHome2;
  async function searchRows(){
    const who=owner();if(!who)return [];
    if(searchOwner===who&&searchCache)return searchCache;
    if(searchPending?.owner===who)return searchPending.promise;
    const promise=(async()=>{
      const [people,stories,city,media]=await Promise.all([
        rows(sb.from("archive_people").select("id,canonical_name,aliases,group_name")),
        rows(sb.from("archive_stories").select("id,title,period,kind,data")),
        rows(sb.from("city_essays").select("id,title,period,theme,excerpt,body,location_text,tags")),
        rows(sb.from("archive_media").select("id,title,media_type,approx_date_text,location_text,data"))
      ]);
      if(owner()!==who)return [];
      const items=[];
      const push=(type,label,x,content,meta,group)=>items.push({type,label,id:x.id,title:x.title||x.canonical_name||x.id,content:text(JSON.stringify(content)).toLocaleLowerCase("ru"),meta,group});
      people.forEach(x=>push("person","ЛЮДИ",x,[x.canonical_name,x.aliases,x.group_name],x.group_name,x.group_name));
      stories.forEach(x=>push("story","ИСТОРИЯ",x,[x.title,x.period,x.kind,x.data],x.period));
      city.forEach(x=>push("city","ГОРОД",x,[x.title,x.body,x.excerpt,x.tags,x.theme,x.location_text],x.location_text||x.period));
      media.filter(x=>x.media_type!=="video").forEach(x=>push("photo","ФОТО",x,[x.title,x.data,x.location_text,x.approx_date_text],x.location_text||x.approx_date_text));
      searchOwner=who;searchCache=items;return items;
    })().finally(()=>{if(searchPending?.owner===who)searchPending=null});
    searchPending={owner:who,promise};return promise;
  }
  function closeSearch(){
    const dialog=el("h2Search");if(!dialog||dialog.hidden)return;
    dialog.hidden=true;searchSequence++;
    el("h2SearchResults").replaceChildren();
    document.querySelector("main").inert=false;
    if(focusBeforeSearch?.isConnected)focusBeforeSearch.focus();
  }
  async function renderSearch(){
    const box=el("h2SearchResults"),q=el("h2SearchInput").value.trim().toLocaleLowerCase("ru"),seq=++searchSequence,who=owner();
    if(!who){box.innerHTML='<p class="h2SearchHint">Поиск по закрытому архиву доступен после входа.</p><button type="button" class="h2SearchResult" data-search-login>Войти в архив →</button>';return}
    if(q.length<2){box.innerHTML='<p class="h2SearchHint">Введите не менее двух букв.</p>';return}
    box.innerHTML='<p class="h2SearchHint">Ищу…</p>';
    try{
      const items=await searchRows();
      if(seq!==searchSequence||owner()!==who||el("h2Search").hidden)return;
      const hits=items.filter(x=>x.content.includes(q)).slice(0,40);
      box.innerHTML=hits.length?hits.map(x=>'<button type="button" class="h2SearchResult" data-home-object="'+esc(x.type)+'" data-home-id="'+esc(x.id)+'" data-home-group="'+esc(x.group||"")+'"><small>'+x.label+'</small><b>'+esc(x.title)+'</b><span>'+esc(x.meta||"")+'</span></button>').join(""):'<p class="h2SearchHint">Ничего не найдено. Попробуйте другое слово.</p>';
    }catch(error){if(seq===searchSequence)box.innerHTML='<p class="h2SearchHint">Не удалось выполнить поиск. Измените запрос, чтобы повторить.</p>'}
  }
  function openSearch(){
    let shade=el("h2Search");
    if(!shade){
      document.body.insertAdjacentHTML("beforeend",'<div id="h2Search" class="home2Search" hidden><section class="h2SearchPanel" role="dialog" aria-modal="true" aria-labelledby="h2SearchTitle"><div class="h2SearchHead"><div><h2 id="h2SearchTitle">Поиск по «Хроникам-78»</h2><p>Люди · истории · город · фотоархив</p></div><button class="h2SearchClose" id="h2SearchClose" type="button" aria-label="Закрыть поиск">×</button></div><input id="h2SearchInput" type="search" aria-label="Поиск по всем разделам" placeholder="Имя, место, событие, слово…" autocomplete="off"><div class="h2SearchResults" id="h2SearchResults" role="status" aria-live="polite"></div></section></div>');
      shade=el("h2Search");
      el("h2SearchClose").onclick=closeSearch;
      shade.onclick=e=>{if(e.target===shade)closeSearch()};
      el("h2SearchInput").oninput=renderSearch;
    }
    focusBeforeSearch=document.activeElement;shade.hidden=false;
    document.querySelector("main").inert=true;
    el("h2SearchInput").value="";el("h2SearchInput").focus();void renderSearch();
  }
  window.openHomeSearch=openSearch;
  window.closeHomeSearch=closeSearch;
  document.addEventListener("click",async e=>{
    const button=e.target.closest?.("button");if(!button)return;
    if(button.id==="homeSearchBtn"){openSearch();return}
    if(button.id==="homeThemeToggle"){
      const next=document.documentElement.dataset.theme==="dark"?"light":"dark";
      try{localStorage.setItem(THEME_KEY,next)}catch{}
      applyTheme(next);return;
    }
    if(button.dataset.homeRefresh){delete button.dataset.homeRefresh;await loadHome2(true);return}
    if(button.hasAttribute("data-search-login")){closeSearch();await showView("profile");return}
    if(button.dataset.homeObject){
      closeSearch();try{await openObject(button.dataset.homeObject,button.dataset.homeId,button.dataset.homeGroup)}catch(error){console.warn("Home destination failed",error)}return;
    }
    if(button.dataset.homeView)await showView(button.dataset.homeView);
  });
  document.addEventListener("keydown",e=>{
    const shade=el("h2Search");if(!shade||shade.hidden)return;
    if(e.key==="Escape"){e.preventDefault();closeSearch();return}
    if(e.key==="Tab"){
      const controls=[...shade.querySelectorAll("button,input")].filter(x=>!x.disabled&&!x.hidden);
      const first=controls[0],last=controls.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }
    if(e.key==="ArrowDown"&&document.activeElement===el("h2SearchInput")){e.preventDefault();shade.querySelector(".h2SearchResult")?.focus()}
  });
  sb.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")reset()});
  // On a tab left open overnight, rotate at the first visible moment after Monday begins.
  const refresh=()=>{if(active()&&document.visibilityState==="visible"&&el("home").classList.contains("active"))void loadHome2()};
  document.addEventListener("visibilitychange",refresh);
  setInterval(refresh,60000);
  homeThemeSync();void loadHome2();
})();
