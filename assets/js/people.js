function cropRectFor(region,photo,aspect,padX=0,padY=0){
 if(!region||!photo)return null;
 const sw=Number(photo.source_width),sh=Number(photo.source_height);
 const rw=Number(region.w),rh=Number(region.h),rx=Number(region.x),ry=Number(region.y);
 if(!(sw>0&&sh>0&&rw>0&&rh>0&&aspect>0))return null;

 let x=Math.max(0,rx-rw*padX),y=Math.max(0,ry-rh*padY);
 let w=Math.min(sw-x,rw*(1+padX*2)),h=Math.min(sh-y,rh*(1+padY*2));
 const cx=x+w/2,cy=y+h/2;

 if(w/h<aspect)w=h*aspect;
 else h=w/aspect;

 if(w>sw){w=sw;h=w/aspect}
 if(h>sh){h=sh;w=h*aspect}

 x=Math.min(Math.max(0,cx-w/2),sw-w);
 y=Math.min(Math.max(0,cy-h/2),sh-h);
 return {x,y,w,h,sw,sh};
}
function cropImageHtml(url,photo,region,className,aspect,padX=0,padY=0,attrs="",alt=""){
 const r=cropRectFor(region,photo,aspect,padX,padY);
 if(!url||!r)return "";
 const width=(r.sw/r.w*100).toFixed(4);
 const left=(-r.x/r.w*100).toFixed(4);
 const top=(-r.y/r.h*100).toFixed(4);
 return '<div class="'+className+' archiveCrop"'+(attrs?' '+attrs:'')+'><img src="'+esc(url)+'" alt="'+esc(alt)+'" style="width:'+width+'%;height:auto;left:'+left+'%;top:'+top+'%"></div>';
}
function personIdentityUnknown(p){
 const name=String(p?.canonical_name||"").trim().toLowerCase();
 return !p || (p.identification_status||"")!=="подтверждено" || !name || name==="не установлено" || name==="имя не установлено";
}
function personDisplayName(p){
 return personIdentityUnknown(p)?"Имя не установлено · № "+(p?.number??""):p.canonical_name;
}
function personThumbHtml(p,className="personPortrait"){
 const r=classPhotoState?.regions?.[p.id],cp=classPhotoState?.photo,url=classPhotoState?.url;
 if(!r||!cp||!url)return "";
 const aspect=className==="classSelectionPortrait"?64/82:4/5;
 const label=personDisplayName(p)||("Позиция № "+(p.number??""));
 return cropImageHtml(url,cp,r,className,aspect,0,0,'aria-label="'+esc(label)+'"',label);
}
function selectPerson(id,scrollList=true){
 selectedPersonId=id;
 renderPeople();
 if(scrollList){
   const card=document.querySelector('[data-person-id="'+CSS.escape(id)+'"]');
   card?.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
}
function showPersonLinks(p){
 const stories=p?.story_refs||[];
 const media=p?.data?.media_links||[];
 openPhotoModal(personDisplayName(p),
   '<div class="notice">Связанные материалы участника.</div>'+
   (stories.length?'<label>Истории</label>'+stories.map(s=>'<button class="secondary" type="button" data-person-story-open="'+esc(s.id)+'">'+esc(s.title||s.id)+'</button>').join(""):'<div class="small">Связанных историй пока нет.</div>')+
   (media.length?'<label>Фотографии</label>'+media.map(m=>'<button class="secondary" type="button" data-person-media-open="'+esc(m.media_id)+'">'+esc(m.media_id)+'</button>').join(""):""),
   async()=>{}
 );
 $("photoModalSave").textContent="Закрыть";photoModalSubmit=async()=>closePhotoModal();
 document.querySelectorAll("[data-person-story-open]").forEach(b=>b.onclick=()=>{closePhotoModal();showView("stories");openStory(b.dataset.personStoryOpen)});
 document.querySelectorAll("[data-person-media-open]").forEach(b=>b.onclick=()=>{closePhotoModal();mediaFocus=b.dataset.personMediaOpen;showView("photos");setTimeout(()=>openArchivePhoto(b.dataset.personMediaOpen),120)});
}
function openPersonContext(id){
 const p=peopleCache.find(x=>x.id===id);if(!p)return;
 selectedPersonId=id;renderPeople();
 const unknown=personIdentityUnknown(p),editor=profile?.role==="editor"||profile?.role==="admin";
 const preview=classPhotoState?.regions?.[p.id]?personThumbHtml(p,"identitySuggestCrop"):"";
 const actions=[
   {icon:"◎",label:"Показать на общей фотографии",hint:p.group_name+" · позиция № "+(p.number??""),kind:"primary",run:()=>{selectedPersonId=id;renderPeople();setTimeout(()=>$("peopleList")?.querySelector(".classPhotoPanel")?.scrollIntoView({behavior:"smooth",block:"start"}),50)}},
   (p.story_refs?.length||p.data?.media_links?.length)?{icon:"⌁",label:"Связанные материалы",hint:(p.story_refs?.length||0)+" историй",run:()=>showPersonLinks(p)}:null,
   unknown&&!editor?{icon:"✎",label:"Предложить имя",hint:"Редактор проверит подпись",run:()=>suggestPersonIdentity(id)}:null,
   editor?{icon:"✎",label:unknown?"Назначить имя":"Исправить подпись",hint:"Имя, статус и подтверждение",run:()=>editPersonIdentity(id)}:null
 ];
 openContextSheet({eyebrow:"УЧАСТНИК КЛАССА",title:personDisplayName(p),meta:[p.group_name,"позиция № "+(p.number??""),p.person_role].filter(Boolean).join(" · "),preview,actions});
}
function renderClassPhotoPanel(arr){
 if(!["10А","10Б"].includes(peopleGroup))return "";
 const cp=classPhotoState?.photo, url=classPhotoState?.url, regs=classPhotoState?.regions||{};
 const editor=profile?.role==="editor"||profile?.role==="admin";
 let stage="";
 if(url&&cp){
   const hotspots=arr.map(p=>{
     const r=regs[p.id]; if(!r)return "";
     const left=(r.x/cp.source_width*100),top=(r.y/cp.source_height*100),w=(r.w/cp.source_width*100),hh=(r.h/cp.source_height*100);
     const active=p.id===selectedPersonId;
     const unknown=personIdentityUnknown(p);
     const label=unknown?"Имя не установлено · нажмите, чтобы выбрать":p.canonical_name;
     return '<button class="classHotspot '+(active?"active ":"")+(showClassNumbers?"showNo ":"")+(unknown?"unknown":"")+'" data-hot-person="'+esc(p.id)+'" data-unknown="'+(unknown?"1":"0")+'" data-person-label="'+esc(label)+'" title="'+esc(label)+'" style="left:'+left+'%;top:'+top+'%;width:'+w+'%;height:'+hh+'%">'+(showClassNumbers?esc(p.number||""):"")+'</button>';
   }).join("");
   stage='<div class="classPhotoStage" style="aspect-ratio:'+cp.source_width+' / '+cp.source_height+'"><img src="'+url+'" alt="'+esc(cp.title)+'">'+hotspots+'</div>';
 }else{
   const loading=classPhotoState?.loading;
   stage='<div class="classPhotoStage"><div class="classPhotoMissing"><div><b>Общая фотография '+esc(peopleGroup)+'</b><br>'+(loading?'Фотография загружается…':'Фото появится здесь после загрузки.')+(!loading&&editor?'<br><button class="secondary" id="uploadClassPhotoBtn">Загрузить фотографию</button>':'')+'</div></div></div>';
 }
 return '<div class="classPhotoPanel"><div class="classPhotoHead"><div><b>'+esc(peopleGroup)+' · 1982–1983</b><div class="small">Наведите курсор на лицо или нажмите на него</div></div>'+(url?'<button class="mini '+(showClassNumbers?"on":"")+'" id="toggleClassNumbers">Показать №</button>':'')+'</div>'+stage+(selectedPersonId?(()=>{const p=peopleCache.find(x=>x.id===selectedPersonId);if(!p)return "";const portrait=classPhotoState?.regions?.[p.id]?personThumbHtml(p,"classSelectionPortrait"):"";const stories=(p.story_refs||[]);const unknown=personIdentityUnknown(p);const editor=profile?.role==="editor"||profile?.role==="admin";return '<div class="classSelection contextObject" data-selected-person-context="'+esc(p.id)+'">'+portrait+'<div class="classSelectionText"><b>'+esc(personDisplayName(p))+'</b><div class="small">'+esc(p.group_name||"")+' · позиция № '+esc(p.number??"")+(p.person_role?" · "+esc(p.person_role):"")+'</div>'+(unknown?'<div class="small">Лицо выбрано. Нажмите на карточку, чтобы выбрать действие.</div>':'<div class="small">Нажмите на карточку, чтобы открыть действия.</div>')+(stories.length?'<div class="small">'+stories.length+' связанн'+(stories.length===1?"ая история":"ых истории")+'</div>':'')+'</div></div>'})():'')+'</div>';
}
function renderPeople(){
 const q=($("peopleSearch")?.value||"").trim().toLowerCase();
 const arr=peopleCache.filter(p=>(peopleGroup==="all"||p.group_name===peopleGroup)&&(!q||(p.canonical_name||"").toLowerCase().includes(q)||(p.aliases||[]).join(" ").toLowerCase().includes(q)));
 if(q&&arr.length===1&&peopleGroup==="10Б")selectedPersonId=arr[0].id;
 const cards=arr.map(p=>{
   const linkedStories=(p.story_refs||[]);
   const stories=linkedStories.map(x=>'<button class="mini" data-pstory="'+esc(x.id)+'">'+esc(x.title||x.id)+'</button>').join("");
   const media=(p.data?.media_links||[]).map(x=>'<button class="mini" data-pmedia="'+esc(x.media_id)+'">▧ '+esc(x.media_id)+'</button>').join("");
   const mobilePortraitLite=window.matchMedia?.("(max-width:760px)")?.matches;
   const thumb=!mobilePortraitLite&&["10А","10Б"].includes(peopleGroup)&&classPhotoState?.url&&classPhotoState?.regions?.[p.id]
     ?personThumbHtml(p,"personPortrait")
     :'<div class="personNo">'+esc(p.number??"")+'</div>';
   const editor=profile?.role==="editor"||profile?.role==="admin";
   const status=p.identification_status||"подтверждено";
   const shownName=personDisplayName(p);
   const confirmed=!personIdentityUnknown(p);
   return '<article class="personCard contextObject '+(p.id===selectedPersonId?"selected":"")+'" data-person-context="'+esc(p.id)+'" tabindex="0">'+thumb+'<div class="personMeta"><h3>'+esc(shownName)+'</h3>'+
     '<div class="personAlbumSub">'+esc(p.group_name||"")+' · № '+esc(p.number??"")+(p.person_role?" · "+esc(p.person_role):"")+'</div>'+
     (!confirmed?'<span class="badge">имя уточняется</span>':'')+
     (p.identification_note&&!confirmed?'<div class="small" style="margin-top:5px">'+esc(p.identification_note)+'</div>':'')+
     ((linkedStories.length||p.data?.media_links?.length)?'<div class="small" style="margin-top:6px">Нажмите, чтобы открыть действия</div>':'<div class="small" style="margin-top:6px">Нажмите, чтобы открыть действия</div>')+
     (editor?'<div class="personTech">'+esc(p.id)+' · '+esc(status)+(p.aliases?.length?" · в чате: "+esc(p.aliases.join(", ")):"")+'</div>':'')+
   '</div></article>';
 }).join("")||'<div class="notice">Ничего не найдено.</div>';
 if(["10А","10Б"].includes(peopleGroup)){
   $("peopleList").className="";
   $("peopleList").innerHTML='<div class="classPeopleLayout">'+renderClassPhotoPanel(arr)+'<div class="peopleSide">'+cards+'</div></div>';
 }else{
   $("peopleList").className="";
   $("peopleList").innerHTML='<div class="peopleSide">'+cards+'</div>';
 }
 $("peopleList").querySelectorAll("[data-person-context]").forEach(el=>{el.onclick=()=>openPersonContext(el.dataset.personContext);el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openPersonContext(el.dataset.personContext)}}});
 $("peopleList").querySelectorAll("[data-selected-person-context]").forEach(el=>el.onclick=()=>openPersonContext(el.dataset.selectedPersonContext));
 $("peopleList").querySelectorAll("[data-hot-person]").forEach(b=>b.onclick=()=>openPersonContext(b.dataset.hotPerson));
 if($("toggleClassNumbers"))$("toggleClassNumbers").onclick=()=>{showClassNumbers=!showClassNumbers;renderPeople()};
 if($("uploadClassPhotoBtn"))$("uploadClassPhotoBtn").onclick=()=>{$("classPhotoInput").value="";$("classPhotoInput").click()};
}

function suggestPersonIdentity(id){
 const p=peopleCache.find(x=>x.id===id);if(!p||!user)return;
 const classPhotoId=p.group_name==="10А"?"CLASS-10A":"CLASS-10B";
 const crop=classPhotoState?.regions?.[p.id]?personThumbHtml(p,"identitySuggestCrop"):"";
 openPhotoModal("Кто это? · "+p.group_name+" № "+(p.number??""),
   crop+
   '<div class="notice">Вы подписываете именно выбранное лицо — позицию № '+esc(p.number??"")+'. Предложите имя; редактор сверит фотографию и подтверждение.</div>'+
   '<label>Фамилия и имя</label><input id="pfSuggestedName" placeholder="Например: Иванов Сергей">'+
   '<label>Почему вы уверены?</label><textarea id="pfSuggestedNote" placeholder="Например: сидели за одной партой; подтвердил ещё кто-то"></textarea>',
   async()=>{
     const name=$("pfSuggestedName").value.trim();if(name.length<2)throw new Error("Укажите имя.");
     const {error}=await sb.from("identity_suggestions").insert({class_photo_id:classPhotoId,person_id:id,suggested_name:name,note:$("pfSuggestedNote").value.trim()||null,submitted_by:user.id});
     if(error)throw error;
     $("photoModalBody").innerHTML='<div class="notice"><b>Спасибо.</b><br>Подпись «'+esc(name)+'» отправлена редактору на подтверждение.</div>';
     $("photoModalSave").textContent="Закрыть";photoModalSubmit=async()=>closePhotoModal();
   }
 );
}

function editPersonIdentity(id){
 const p=peopleCache.find(x=>x.id===id);if(!p)return;
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const currentName=personIdentityUnknown(p)?"":(p.canonical_name||"");
 const currentStatus=p.identification_status||"не установлено";
 const crop=classPhotoState?.regions?.[p.id]?personThumbHtml(p,"identitySuggestCrop"):"";
 openPhotoModal("Идентификация · "+(p.group_name||"")+" № "+(p.number??""),
   crop+
   '<div class="notice">Редактируется выбранная позиция на общей фотографии: <b>'+esc(p.id)+'</b>. При статусе «не установлено» имя не сохраняется.</div>'+
   '<label>Фамилия и имя</label><input id="pfPersonName" value="'+esc(currentName)+'" placeholder="Например: Иванова Елена">'+
   '<label>Статус</label><select id="pfPersonStatus">'+
     ['не установлено','предположительно','подтверждено'].map(x=>'<option '+(x===currentStatus?"selected":"")+'>'+x+'</option>').join("")+
   '</select>'+
   '<label>Комментарий / кто подтвердил</label><textarea id="pfPersonNote" placeholder="Например: имя подтвердили Марина и Татьяна">'+esc(p.identification_note||"")+'</textarea>'+
   '<div class="formHint">Если имя уже подтверждено на другой позиции этого класса, сохранение будет остановлено.</div>',
   async()=>{
     const name=$("pfPersonName").value.trim();
     const status=$("pfPersonStatus").value;
     const note=$("pfPersonNote").value.trim();
     if(status!=="не установлено"&&(!name||["не установлено","имя не установлено"].includes(name.toLowerCase())))throw new Error("Укажите реальное имя.");
     const {error}=await sb.rpc("set_person_identity",{p_person_id:id,p_name:name,p_status:status,p_note:note||null});
     if(error)throw error;
     peopleCache=[];
     await loadPeople();
     if(status==="подтверждено"&&p.group_name==="10А")setTimeout(()=>alert("Имя подтверждено. Связанный вопрос 10А автоматически отмечен решённым."),50);
   }
 );
}
async function loadClassPhoto(){
 const seq=++classPhotoLoadSeq;
 const group=peopleGroup;
 if(!["10А","10Б"].includes(group)){classPhotoState=null;return}
 const cached=classPhotoStateCache.get(group);
 if(cached){
   classPhotoState=cached;
   if(activeViewId()==="people")renderPeople();
   return;
 }
 classPhotoState={photo:null,regions:{},url:null,loading:true};
 if(activeViewId()==="people")renderPeople();
 const classId=group==="10А"?"CLASS-10A":"CLASS-10B";
 const [{data:cp,error:ce},{data:regions,error:re}]=await Promise.all([
   sb.from("class_photos").select("id,group_name,title,storage_path,source_width,source_height").eq("group_name",group).maybeSingle(),
   sb.from("class_photo_regions").select("person_id,x,y,w,h").eq("class_photo_id",classId)
 ]);
 if(seq!==classPhotoLoadSeq||group!==peopleGroup||ce||re||!cp)return;
 const map={};(regions||[]).forEach(r=>map[r.person_id]=r);
 classPhotoState={photo:cp,regions:map,url:null,loading:true};
 if(activeViewId()==="people")renderPeople();
 if(!cp.storage_path){classPhotoState.loading=false;return}
 const url=await archiveSignedImage(cp.storage_path);
 if(seq!==classPhotoLoadSeq||group!==peopleGroup)return;
 classPhotoState={photo:cp,regions:map,url,loading:false};
 classPhotoStateCache.set(group,classPhotoState);
 if(activeViewId()==="people")renderPeople();
}
async function enrichPeopleStoryRefs(){
 try{
   const {data:stories,error}=await sb.from("archive_stories").select("id,title,data").order("id");
   if(error)return;
   storyIndex=stories||[];
   const storyRefsByPerson=new Map();
   for(const s of storyIndex){
     const ids=new Set(s.data?.people||[]);
     const ps=s.data?.chapter?.participants||{};
     ["confirmed","possible","absent","absent_or_not_on_photo"].forEach(k=>(ps[k]||[]).forEach(x=>x?.id&&ids.add(x.id)));
     ids.forEach(id=>{
       if(!storyRefsByPerson.has(id))storyRefsByPerson.set(id,[]);
       storyRefsByPerson.get(id).push({id:s.id,title:s.title});
     });
   }
   peopleCache=peopleCache.map(p=>({...p,story_refs:storyRefsByPerson.get(p.id)||[]}));
   if(activeViewId()==="people")renderPeople();
 }catch(e){}
}
async function ensurePeopleData(){
 if(peopleCache.length)return true;
 if(peopleLoadPromise)return peopleLoadPromise;
 peopleLoadPromise=(async()=>{
   const {data,error}=await sb.from("archive_people").select("id,group_name,number,canonical_name,person_role,aliases,data,identification_status,identification_note").order("group_name").order("number");
   if(error)throw new Error(error.message);
   peopleCache=(data||[]).map(p=>({...p,story_refs:[]}));
   setTimeout(enrichPeopleStoryRefs,0);
   return true;
 })().finally(()=>{peopleLoadPromise=null});
 return peopleLoadPromise;
}
async function loadPeople(){
 if(!user||!profile?.is_active){$("peopleList").innerHTML='<div class="notice">Сначала войдите в профиль.</div>';return}
 if(!peopleCache.length)$("peopleList").innerHTML='<div class="notice">Загружаю список класса…</div>';
 try{await ensurePeopleData()}catch(e){$("peopleList").innerHTML='<div class="notice">'+esc(e.message||String(e))+'</div>';return}
 renderPeople();
 loadClassPhoto();
}
$("classPhotoInput").onchange=async()=>{
 const file=$("classPhotoInput").files?.[0];if(!file)return;
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 try{
   const mime=ensureImageFile(file);
   if(file.size>10*1024*1024)throw new Error("Файл больше 10 МБ.");
   const ok=confirm("Загрузить общую фотографию "+peopleGroup+"?\n\n"+file.name+"\n"+Math.round(file.size/1024)+" КБ");
   if(!ok){$("classPhotoInput").value="";return}
   const classId=peopleGroup==="10А"?"CLASS-10A":"CLASS-10B";
   const slug=peopleGroup==="10А"?"10A":"10B";
   const path="class-photos/"+slug+"-"+Date.now()+"-"+safeName(file.name);
   const {error:ue}=await sb.storage.from("archive-media").upload(path,file,{contentType:mime,upsert:false});if(ue)throw ue;
   const {error:de}=await sb.from("class_photos").update({storage_path:path,updated_at:new Date().toISOString()}).eq("id",classId);if(de)throw de;
   classPhotoStateCache.delete(peopleGroup);
   await loadClassPhoto();renderPeople();
 }catch(e){alert("Фото класса не загружено: "+(e.message||e))}
 finally{$("classPhotoInput").value=""}
};document.querySelectorAll("[data-pgroup]").forEach(b=>b.onclick=()=>{
 peopleGroup=b.dataset.pgroup;selectedPersonId=null;showClassNumbers=false;classPhotoState=null;
 document.querySelectorAll("[data-pgroup]").forEach(x=>x.classList.toggle("on",x===b));
 renderPeople();
 loadClassPhoto();
});
$("peopleSearch").addEventListener("input",renderPeople);

