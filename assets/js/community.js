/* Optional community layer for the Home 2.0 review build. Existing archive remains authoritative. */
(() => {
 'use strict';
 const node=id=>document.getElementById(id), active=()=>!!(user?.id&&profile?.is_active);
 const editor=()=>active()&&['editor','admin'].includes(profile.role);
 const owner=()=>active()?user.id:null;
 let generation=0,librarySeq=0,libraryTab='photos',libraryItems=[],libraryImages=null,memory=null,timeline='all',topic='all',heartbeatBusy=false;
 const topics=['Все темы','Смешные случаи','Первая любовь','Школьные будни',...storyShelves.map(s=>s.title)];
 const current=(uid,epoch)=>owner()===uid&&generation===epoch;
 const err=e=>String(e?.message||e||'Не удалось выполнить действие.');
 const check=r=>{if(r.error)throw r.error;return r.data};
 const closeOnly=()=>{node('photoModalSave').textContent='Закрыть';photoModalSubmit=async()=>closePhotoModal()};
 const notice=(id,message,bad=false)=>{const el=node(id);if(el){el.textContent=message;el.classList.toggle('communityError',bad)}};
 async function communityUrl(path){if(!path)return null;return check(await sb.storage.from('community-media').createSignedUrl(path,3600))?.signedUrl||null}
 async function upload(file,kind){
   const uid=owner();if(!uid)throw Error('Сначала войдите в профиль.');
   if(!file||file.size>25*1024*1024)throw Error('Максимальный размер файла — 25 МБ.');
   const audio=['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg','audio/webm'];
   if(!(kind==='audio'?audio:['image/jpeg','image/png','image/webp']).includes(file.type))throw Error(kind==='audio'?'Нужен MP3, M4A, WAV, OGG или WebM.':'Нужен JPEG, PNG или WebP.');
   const path=uid+'/'+kind+'/'+crypto.randomUUID()+'-'+safeName(file.name);
   check(await sb.storage.from('community-media').upload(path,file,{contentType:file.type,upsert:false}));
   if(owner()!==uid)throw Error('Вход завершён. Откройте профиль ещё раз.');
   return path;
 }
 function setup(){
   const chat=document.querySelector('#chat .chat');
   if(chat&&!node('communityLibrary'))chat.insertAdjacentHTML('beforeend','<aside id="communityLibrary" class="communityLibrary" aria-label="Медиатека диалога"><h3>Медиатека чата</h3><div class="communityTabs">'+[['photos','Фото'],['links','Ссылки'],['stories','Истории']].map(([k,t])=>'<button type="button" data-library-tab="'+k+'" aria-pressed="'+(k===libraryTab)+'">'+t+'</button>').join('')+'</div><div id="communityLibraryStatus" class="communityMuted" role="status">Войдите, чтобы открыть материалы диалога.</div><div id="communityLibraryItems"></div></aside>');
   const toc=node('storyToc'),list=node('storiesList');
   if(toc&&list&&!document.querySelector('.communityStoryLayout')){
     const layout=document.createElement('div');layout.className='communityStoryLayout';
     list.before(layout);const sidebar=document.createElement('aside');sidebar.className='communityStorySidebar';layout.append(sidebar);sidebar.append(toc);layout.append(list);
     renderTopicButtons();
   }
   if(node('photoStats')&&!node('communityTimeline'))node('photoStats').before(Object.assign(document.createElement('nav'),{id:'communityTimeline',className:'communityTimeline'}));
   node('communityTimeline')?.setAttribute('aria-label','Годы фотоархива');

 }
 function renderTopicButtons(){node('storyToc').innerHTML=topics.map(t=>'<button type="button" data-community-topic="'+esc(t)+'" aria-pressed="'+((topic==='all'&&t==='Все темы')||topic===t)+'">'+esc(t)+'</button>').join('')}
 function storyTopics(s){
   const explicit=Array.isArray(s.data?.topics)?s.data.topics:[];
   const shelves=storyShelves.filter(sh=>sh.ids.includes(s.id)).map(sh=>sh.title);
   // Automatic suggestions use catalogue metadata, never rewrite the original text.
   const text=[s.title,s.kind,...(s.data?.keywords||[])].join(' ').toLowerCase();
   const inferred=[];
   if(/смеш|шут|розыгрыш|анекдот|курьёз|курьез|казус/.test(text))inferred.push('Смешные случаи');
   if(/любов|влюбл|свидан|романтик/.test(text))inferred.push('Первая любовь');
   if(shelves.includes('Школа и класс')||/урок|школьн|экзамен|класс/.test(text))inferred.push('Школьные будни');
   return [...new Set([...explicit,...shelves,...inferred])];
 }
 renderStoriesCatalog=()=>{
   if(!active())return;
   const q=(node('storySearch')?.value||'').trim().toLowerCase();
   const rows=storyCache.filter(storyMatchesFilter).filter(s=>topic==='all'||storyTopics(s).includes(topic)).filter(s=>!q||JSON.stringify([s.title,s.period,s.kind,s.data?.keywords,s.data?.editorial_summary,(s.data?.people||[]).map(storyPersonName)]).toLowerCase().includes(q));
   node('storyStats').textContent=rows.length+' из '+storyCache.length+' историй';
   node('storiesList').className='communityStories';
   node('storiesList').innerHTML=rows.map(s=>{
     const cover=storyCoverFor(s),ids=s.data?.people||[],author=ids[0]?storyPersonName(ids[0]):'Автор уточняется';
     const raw=String(s.data?.story_text||''),quotation=String(s.data?.quote||raw.split(/\n+/).find(t=>t.trim())||'').trim();
     const summary=String(s.data?.editorial_summary||s.data?.chapter?.subtitle||'');
     const person=peopleCache.find(p=>p.id===ids[0]),portrait=person?personThumbHtml(person,'communityAuthorPortrait'):'';
     return '<article class="communityStoryCard '+(cover?.url?'':'noCover')+'">'+(cover?.url?'<img src="'+esc(cover.url)+'" alt="'+esc(cover.title||s.title)+'" loading="lazy">':'')+'<div><div class="communityMuted">'+esc([s.period,storyState(s)].filter(Boolean).join(' · '))+'</div><h3>'+esc(s.title)+'</h3>'+(quotation?'<blockquote>'+esc(quotation.slice(0,220))+(quotation.length>220?'…':'')+'</blockquote>':summary?'<p>'+esc(summary.slice(0,320))+'</p>':'')+'<div class="communityStoryAuthor">'+(portrait||'<span class="communityInitial" aria-hidden="true">'+esc(author.charAt(0))+'</span>')+'<span>'+esc(author)+'</span></div><button type="button" class="secondary" data-community-story="'+esc(s.id)+'">Читать историю</button>'+(editor()?' <button type="button" class="secondary" data-community-topic-edit="'+esc(s.id)+'">Темы</button>':'')+'</div></article>';
   }).join('')||'<div class="notice">В этой теме пока нет историй. Выберите другую тему или добавьте её в редакторе.</div>';
 };
 async function editTopics(id){
   if(!editor())return;const s=check(await sb.from('archive_stories').select('data,updated_at').eq('id',id).single());
   openPhotoModal('Темы истории',topics.slice(1).map(t=>'<label class="checkItem"><input type="checkbox" name="communityTopic" value="'+esc(t)+'" '+(s.data?.topics?.includes(t)?'checked':'')+'> '+esc(t)+'</label>').join(''),async()=>{
     const values=[...document.querySelectorAll('[name=communityTopic]:checked')].map(x=>x.value);
     const changed=check(await sb.from('archive_stories').update({data:{...s.data,topics:values},updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',s.updated_at).select('id'));
     if(!changed.length)throw Error('История уже изменена другим редактором. Откройте её заново.');
     await loadStories();
   });node('photoModalSave').textContent='Сохранить темы';
 }
 const originalOpenStory=openStory;
 openStory=async id=>{
   const uid=owner(),epoch=generation;await originalOpenStory(id);
   if(!uid||!current(uid,epoch)||openStoryId!==id)return;
   const section=document.createElement('section');section.className='storySection communityPanel';section.id='communityStoryMedia';
   node('storyDetailBody').append(section);
   try{await renderStoryMedia(id,section,uid,epoch)}catch(e){if(current(uid,epoch)&&section.isConnected)section.textContent='Медиа истории: '+err(e)}
 };
 async function renderStoryMedia(id,section,uid,epoch){
   const rows=check(await sb.from('story_attachments').select('*').eq('story_id',id).order('created_at').order('id'))||[];
   const media=await Promise.all(rows.map(async r=>({...r,url:await communityUrl(r.storage_path)})));
   if(!current(uid,epoch)||openStoryId!==id||!section.isConnected)return;
   section.innerHTML='<h3>Голос и слайды</h3>'+media.filter(r=>r.kind==='audio').map(r=>'<figure><figcaption>'+esc(r.caption||'Голос рассказчика')+'</figcaption><audio controls preload="none" src="'+esc(r.url)+'"></audio>'+deleteAsset(r)+'</figure>').join('')+'<div class="communitySlides">'+media.filter(r=>r.kind==='slide').map(r=>'<figure><img src="'+esc(r.url)+'" alt="'+esc(r.caption||'Архивный слайд')+'" loading="lazy"><figcaption>'+esc(r.caption)+'</figcaption>'+deleteAsset(r)+'</figure>').join('')+'</div>'+(!media.length?'<p class="communityMuted">К этой истории пока не добавлены аудиозаписи и слайды.</p>':'')+(editor()?'<div class="communityMediaUpload"><label>Добавить аудио<input id="communityAudioInput" type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm"></label><label>Добавить слайды<input id="communitySlidesInput" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><label>Подпись<input id="communityMediaCaption" maxlength="500"></label><button type="button" class="secondary" id="communityUploadStory">Сохранить медиа</button></div><div id="communityStoryMediaStatus" class="communityStatus" role="status"></div>':'');
   node('communityUploadStory')?.addEventListener('click',async e=>{
     const audio=node('communityAudioInput').files[0],slides=[...node('communitySlidesInput').files];
     if(!audio&&!slides.length){notice('communityStoryMediaStatus','Выберите аудиозапись или слайды.');return}
     e.currentTarget.disabled=true;notice('communityStoryMediaStatus','Загружаю…');
     try{
       for(const [kind,file] of [...(audio?[['audio',audio]]:[]),...slides.map(f=>['slide',f])]){
         const path=await upload(file,kind);
         try{check(await sb.from('story_attachments').insert({story_id:id,kind,storage_path:path,created_by:uid,caption:node('communityMediaCaption')?.value.trim()||''}))}catch(ex){await sb.storage.from('community-media').remove([path]);throw ex}
       }
       await renderStoryMedia(id,section,uid,epoch);
     }catch(ex){notice('communityStoryMediaStatus',err(ex),true);if(e.target.isConnected)e.target.disabled=false}
   });
   section.querySelectorAll('[data-community-remove-asset]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{check(await sb.from('story_attachments').delete().eq('id',b.dataset.communityRemoveAsset));await renderStoryMedia(id,section,uid,epoch)}catch(e){b.disabled=false;notice('communityStoryMediaStatus',err(e),true)}});
 }
 const deleteAsset=r=>editor()?'<button class="secondary" type="button" data-community-remove-asset="'+esc(r.id)+'">Убрать из истории</button>':'';
 const originalLoadRoom=loadRoom;
 loadRoom=async()=>{await originalLoadRoom();void loadLibrary()};
 async function loadLibrary(){
   const uid=owner(),epoch=generation,room=currentRoom,seq=++librarySeq;if(!uid){libraryItems=[];renderLibrary();return}
   notice('communityLibraryStatus','Собираю материалы всего диалога…');
   try{
     const rows=[];
     for(let offset=0;;offset+=500){
       const batch=check(await sb.from('messages').select('id,body,created_at,linked_entity_type,linked_entity_id,author:profiles!messages_author_id_fkey(display_name),attachments:message_attachments(id,current_storage_path,current_file_name,caption,is_removed)').eq('room_id',room).order('created_at').order('id').range(offset,offset+499))||[];
       if(!current(uid,epoch)||seq!==librarySeq||currentRoom!==room)return;
       rows.push(...batch);if(batch.length<500)break;
     }
     const items=[],seen=new Set();
     for(const m of rows){
       const base={message:m.id,body:m.body||'',date:m.created_at,author:m.author?.display_name||'Участник'};
       (m.attachments||[]).filter(a=>!a.is_removed).forEach(a=>items.push({...base,...a,kind:'photos'}));
       const urls=String(m.body||'').match(/https?:\/\/[^\s<>]+/g)||[];
       for(let raw of urls){raw=raw.replace(/[.,;!?)»]+$/,'');try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol))continue;const key='url:'+url.href;if(seen.has(key))continue;seen.add(key);items.push({...base,kind:'links',url:url.href,title:url.hostname})}catch{}}
       const ids=new Set([...(String(m.body||'').match(/\bS-\d{3}\b/g)||[]),...(m.linked_entity_type==='story'&&m.linked_entity_id?[m.linked_entity_id]:[])]);
       for(const id of ids){if(seen.has('story:'+id))continue;seen.add('story:'+id);items.push({...base,kind:'stories',story:id})}
     }
     libraryItems=items.reverse();renderLibrary();
   }catch(e){if(current(uid,epoch)&&seq===librarySeq)notice('communityLibraryStatus','Не удалось загрузить медиатеку: '+err(e),true)}
 }
 function renderLibrary(){
   const root=node('communityLibraryItems');if(!root)return;
   document.querySelectorAll('[data-library-tab]').forEach(b=>{const count=libraryItems.filter(x=>x.kind===b.dataset.libraryTab).length;b.setAttribute('aria-pressed',String(libraryTab===b.dataset.libraryTab));b.textContent=({photos:'Фото',links:'Ссылки',stories:'Истории'}[b.dataset.libraryTab])+' · '+count});
   if(!active()){root.innerHTML='';notice('communityLibraryStatus','Войдите, чтобы открыть материалы диалога.');return}
   const items=libraryItems.filter(x=>x.kind===libraryTab);
   notice('communityLibraryStatus',items.length?'Из всей истории диалога · '+items.length:'В диалоге пока нет таких материалов.');
   root.innerHTML=items.map((x,i)=>{
     const meta='<small>'+esc(x.author)+' · '+esc(new Date(x.date).toLocaleDateString('ru-RU'))+'</small>';
     if(x.kind==='links')return '<a class="communityLibraryItem" href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.url)+meta+'</a>';
     return '<button class="communityLibraryItem" type="button" data-library-item="'+i+'">'+(x.kind==='photos'?'<img data-library-image="'+i+'" alt="'+esc(x.caption||x.current_file_name||'Фото')+'" loading="lazy">'+esc(x.caption||x.current_file_name||'Фото'):esc(storyCache.find(s=>s.id===x.story)?.title||x.story))+meta+'</button>';
   }).join('');
   const uid=owner(),epoch=generation,room=currentRoom,tab=libraryTab;
   libraryImages?.disconnect();
   if(tab==='photos'){
     libraryImages=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const image=entry.target;libraryImages.unobserve(image);const item=items[Number(image.dataset.libraryImage)];signedImage(item.current_storage_path).then(url=>{if(current(uid,epoch)&&room===currentRoom&&libraryTab===tab&&image.isConnected&&url)image.src=url}).catch(e=>{if(current(uid,epoch))notice('communityLibraryStatus',err(e),true)})}},{root:node('communityLibrary'),rootMargin:'200px'});
     root.querySelectorAll('[data-library-image]').forEach(img=>libraryImages.observe(img));
   }
   root.querySelectorAll('[data-library-item]').forEach(b=>b.onclick=async()=>{
     const x=items[Number(b.dataset.libraryItem)];if(x.kind==='stories'){await showView('stories');await openStory(x.story);return}
     const url=await signedImage(x.current_storage_path);if(!current(uid,epoch)||room!==currentRoom)return;
     openPhotoModal(x.caption||x.current_file_name||'Фото из чата',(url?'<img class="photoDetailImage" src="'+esc(url)+'" alt="'+esc(x.caption||'Фото')+'">':'')+'<p>'+esc(x.body)+'</p><div class="communityMuted">'+esc(x.author)+' · '+esc(new Date(x.date).toLocaleString('ru-RU'))+'</div>',async()=>closePhotoModal());closeOnly();
   });
 }
 function yearsFor(m){
   const text=String(m.data?.event_date||m.approx_date_text||m.data?.year||m.data?.date||'');
   const range=text.match(/\b((?:19|20)\d{2})\s*[–—-]\s*((?:19|20)\d{2})\b/);
   if(range&&Number(range[2])>=Number(range[1])&&Number(range[2])-Number(range[1])<=50)return Array.from({length:Number(range[2])-Number(range[1])+1},(_,i)=>String(Number(range[1])+i));
   return [...new Set(text.match(/\b(?:19|20)\d{2}\b/g)||[])];
 }
 const oldPhotoGallery=renderPhotoGallery;
 renderPhotoGallery=()=>{
   if(!active()){node('photosList').innerHTML='<div class="notice">Сначала войдите в профиль.</div>';node('communityTimeline').innerHTML='';return}
   const all=mediaCache;
   const years=[...new Set(all.flatMap(yearsFor))].sort();
   if(node('communityTimeline')){node('communityTimeline').hidden=photoWorkspace!=='albums';node('communityTimeline').innerHTML=[['all','Все годы'],...years.map(y=>[y,y]),['unknown','Год не установлен']].map(([key,title])=>'<button type="button" data-community-year="'+key+'" aria-pressed="'+(timeline===key)+'">'+title+'</button>').join('')}
   if(timeline!=='all'&&photoWorkspace==='albums')mediaCache=all.filter(m=>timeline==='unknown'?!yearsFor(m).length:yearsFor(m).includes(timeline));
   try{
     oldPhotoGallery();
     node('photosList').querySelectorAll('[data-photo-album]').forEach(b=>{
       const cover=mediaCache.find(m=>photoAlbumId(m)===b.dataset.photoAlbum&&(mediaThumbSigned[m.id]||mediaSigned[m.id]));
       if(cover){b.classList.add('communityAlbumTile');b.insertAdjacentHTML('afterbegin','<img src="'+esc(mediaThumbSigned[cover.id]||mediaSigned[cover.id])+'" alt="" loading="lazy">')}
     });
   }finally{mediaCache=all}
 };
 const oldAlbumId=photoAlbumId,oldAlbums=getPhotoAlbums;
 photoAlbumId=m=>{
   const text=[m.title,m.category,m.data?.preliminary_topic].join(' ').toLowerCase();
   if(m.data?.album==='first-class'||/(?:1[ -]?(?:й|ый)?|первый|первом)\s*класс/.test(text))return 'first-class';
   if(m.data?.album==='graduation'||/выпускн|выпуск 1983/.test(text))return 'graduation';
   if(m.data?.album==='teachers'||/учител|педагог/.test(text))return 'teachers';
   return oldAlbumId(m);
 };
 getPhotoAlbums=()=>[{id:'first-class',title:'Наш 1-й класс',note:'Начало школьного пути.'},{id:'graduation',title:'Выпускной',note:'Последний звонок и прощание со школой.'},{id:'teachers',title:'Учителя',note:'Наши наставники.'},...oldAlbums()];
 const oldOpenPhoto=openArchivePhoto;
 openArchivePhoto=async id=>{
   const uid=owner(),epoch=generation;await oldOpenPhoto(id);if(!uid||!current(uid,epoch)||!node('photoModal').classList.contains('open'))return;
   const image=node('photoModalBody').querySelector('.photoDetailImage');if(!image)return;
   const stage=document.createElement('div');stage.className='communityTagImage';image.replaceWith(stage);stage.append(image);
   const controls=document.createElement('section');controls.className='communityPanel';controls.id='communityPhotoTools';
   controls.innerHTML='<div class="communityPhotoActions"><button type="button" class="secondary" id="communityTagStart">Отметить одноклассника</button><button type="button" class="secondary" id="communityCompareStart">Тогда / Сейчас</button>'+(editor()?'<button type="button" class="secondary" id="communitySetDay">Указать точную дату</button>':'')+'</div><p class="communityMuted">Отметки добавляют участники архива. Нажмите на подпись, чтобы увидеть человека.</p><div id="communityTagForm"></div><div id="communityPhotoStatus" role="status"></div><div id="communityComparison"></div>';
   stage.closest('figure').after(controls);
   let tagging=false;
   async function tags(){
     const rows=check(await sb.from('archive_photo_tags').select('*').eq('media_id',id))||[];
     if(!current(uid,epoch)||!stage.isConnected)return;
     stage.querySelectorAll('.communityTag').forEach(e=>e.remove());
     for(const r of rows){const b=document.createElement('button');b.type='button';b.className='communityTag';b.style.left=r.x+'%';b.style.top=r.y+'%';b.textContent=peopleCache.find(p=>p.id===r.person_id)?.canonical_name||r.person_id;b.onclick=()=>tagInfo(r);stage.append(b)}
   }
   async function tagInfo(r){
     const p=peopleCache.find(p=>p.id===r.person_id);node('communityTagForm').innerHTML='<b>'+esc(p?.canonical_name||r.person_id)+'</b> <button class="secondary" id="communityCompareTagged" type="button">Сравнить портреты</button>'+((r.created_by===uid||editor())?' <button class="secondary" id="communityDeleteTag" type="button">Убрать мою отметку</button>':'');
     node('communityCompareTagged').onclick=()=>comparePerson(r.person_id,image.src);
     node('communityDeleteTag')?.addEventListener('click',async e=>{e.target.disabled=true;try{check(await sb.from('archive_photo_tags').delete().eq('id',r.id));node('communityTagForm').innerHTML='';await tags()}catch(ex){notice('communityPhotoStatus',err(ex),true);e.target.disabled=false}});
   }
   node('communityTagStart').onclick=()=>{tagging=!tagging;stage.classList.toggle('tagging',tagging);notice('communityPhotoStatus',tagging?'Нажмите на лицо на фотографии.':'')};
   node('communitySetDay')?.addEventListener('click',async()=>{
     const row=check(await sb.from('archive_media').select('data,updated_at').eq('id',id).single());
     node('communityTagForm').innerHTML='<label>Подтверждённая дата снимка<input type="date" id="communityEventDate" value="'+esc(row.data?.event_date||'')+'"></label><button class="secondary" type="button" id="communitySaveDate">Сохранить дату</button>';
     node('communitySaveDate').onclick=async e=>{e.target.disabled=true;try{const value=node('communityEventDate').value;const changed=check(await sb.from('archive_media').update({data:{...row.data,event_date:value||null},updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',row.updated_at).select('id'));if(!changed.length)throw Error('Снимок уже изменён другим редактором. Откройте его заново.');notice('communityPhotoStatus','Дата сохранена. Снимок появится в виджете в этот день.');node('communityTagForm').innerHTML='';void homeWidgets()}catch(ex){notice('communityPhotoStatus',err(ex),true);e.target.disabled=false}};
   });
   image.addEventListener('click',e=>{
     if(!tagging)return;const rect=image.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*100,y=(e.clientY-rect.top)/rect.height*100;
     node('communityTagForm').innerHTML='<label for="communityTagPerson">Кто на снимке?</label><select id="communityTagPerson"><option value="">Выберите человека</option>'+peopleCache.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.canonical_name||p.id)+' · '+esc(p.group_name||'')+'</option>').join('')+'</select><button type="button" class="secondary" id="communitySaveTag">Сохранить отметку</button>';
     node('communitySaveTag').onclick=async e=>{const person=node('communityTagPerson').value;if(!person)return;const btn=e.currentTarget;btn.disabled=true;try{check(await sb.from('archive_photo_tags').insert({media_id:id,person_id:person,created_by:uid,x,y}));tagging=false;stage.classList.remove('tagging');node('communityTagForm').innerHTML='';notice('communityPhotoStatus','Отметка сохранена.');await tags()}catch(ex){notice('communityPhotoStatus',ex.code==='23505'?'Вы уже отметили этого человека на снимке.':err(ex),true);btn.disabled=false}};
   });
   node('communityCompareStart').onclick=()=>{
     node('communityComparison').innerHTML='<label for="communityComparePerson">Выберите одноклассника</label><select id="communityComparePerson"><option value="">Выберите человека</option>'+peopleCache.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.canonical_name||p.id)+'</option>').join('')+'</select><div id="communityCompareResult"></div>';
     node('communityComparePerson').onchange=e=>comparePerson(e.target.value,image.src);
   };
   try{await tags()}catch(e){notice('communityPhotoStatus',err(e),true)}
 };
 async function comparePerson(personId,archiveUrl){
   if(!personId)return;const uid=owner(),epoch=generation;
   let dest=node('communityCompareResult');if(!dest){node('communityComparison').innerHTML='<div id="communityCompareResult"></div>';dest=node('communityCompareResult')}
   dest.textContent='Открываю личное досье…';const requested=personId;dest.dataset.person=requested;
   try{
     const person=peopleCache.find(p=>p.id===personId);
     const profiles=check(await sb.from('profiles').select('id,display_name,person_id,class_group').eq('person_id',personId))||[];
     const record=profiles.length?check(await sb.from('member_memories').select('*').in('user_id',profiles.map(p=>p.id)).limit(1).maybeSingle()):null;
     const old=record?.then_photo?await communityUrl(record.then_photo):archiveUrl;
     const now=record?.now_photo?await communityUrl(record.now_photo):null;
     if(!current(uid,epoch)||!dest.isConnected||dest.dataset.person!==requested)return;

     const textBlock=(eyebrow,title,value)=>{
       const clean=String(value||'').trim();
       if(!clean)return '<section class="memoryDossierText empty"><div class="memoryDossierEyebrow">'+esc(eyebrow)+'</div><h4>'+esc(title)+'</h4><p>Пока не заполнено.</p></section>';
       const limit=760;
       if(clean.length<=limit)return '<section class="memoryDossierText"><div class="memoryDossierEyebrow">'+esc(eyebrow)+'</div><h4>'+esc(title)+'</h4><p>'+esc(clean)+'</p></section>';
       const short=clean.slice(0,limit).replace(/\s+\S*$/,'').trim();
       return '<section class="memoryDossierText"><div class="memoryDossierEyebrow">'+esc(eyebrow)+'</div><h4>'+esc(title)+'</h4><p>'+esc(short)+'…</p><details><summary>Читать полностью</summary><p>'+esc(clean)+'</p></details></section>';
     };

     const personName=personDisplayName(person);
     const meta=[person?.group_name,person?.number!=null?'№ '+person.number:null].filter(Boolean).join(' · ');
     if(!record){
       dest.innerHTML='<div class="memoryDossier empty"><div class="memoryDossierHead"><div><div class="memoryDossierEyebrow">ЛИЧНОЕ ДОСЬЕ</div><h3>'+esc(personName)+'</h3><span>'+esc(meta)+'</span></div></div><div class="notice">Анкета «Тогда / Сейчас» пока не заполнена.</div></div>';
       return;
     }
     dest.innerHTML=
       '<article class="memoryDossier">'+
         '<header class="memoryDossierHead"><div><div class="memoryDossierEyebrow">Тогда / Сейчас · личное досье</div><h3>'+esc(personName)+'</h3><span>'+esc(meta)+'</span></div></header>'+
         '<div class="memoryDossierPhotos">'+
           '<figure><div class="memoryPhotoFrame">'+(old?'<img src="'+esc(old)+'" alt="'+esc(personName)+' — тогда">':'<div class="memoryPhotoMissing">Архивный портрет пока не добавлен</div>')+'</div><figcaption><b>Тогда</b><span>школьные годы</span></figcaption></figure>'+
           '<figure><div class="memoryPhotoFrame">'+(now?'<img src="'+esc(now)+'" alt="'+esc(personName)+' — сейчас">':'<div class="memoryPhotoMissing">Современный портрет пока не добавлен</div>')+'</div><figcaption><b>Сейчас</b><span>наши дни</span></figcaption></figure>'+
         '</div>'+
         '<div class="memoryDossierNarrative">'+
           textBlock('ТОГДА','О чём мечтал',record.school_dream)+
           textBlock('СЕЙЧАС','Чем живёт сегодня',record.life_now)+
         '</div>'+
         (profile?.person_id===personId?'<div class="memoryDossierOwn"><button type="button" class="secondary" id="communityEditOwnMemory">Изменить мою анкету</button></div>':'')+
       '</article>';
     node('communityEditOwnMemory')?.addEventListener('click',()=>{closePhotoModal();void editMemory()});
   }catch(e){if(current(uid,epoch)&&dest.isConnected&&dest.dataset.person===requested)dest.textContent=err(e)}
 }
 async function renderMemory(){
   const root=node('communityProfile');if(!root)return;root.hidden=!active();if(!active()){memory=null;node('communityProfilePreview').innerHTML='';return}
   const uid=owner(),epoch=generation;
   try{
     const row=check(await sb.from('member_memories').select('*').eq('user_id',uid).maybeSingle());
     const [then,now]=await Promise.all([communityUrl(row?.then_photo),communityUrl(row?.now_photo)]);if(!current(uid,epoch))return;memory=row;
     node('communityProfilePreview').innerHTML='<div class="communityPair">'+[['Тогда',then,row?.school_dream],['Сейчас',now,row?.life_now]].map(([title,url,text])=>'<figure>'+(url?'<img src="'+esc(url)+'" alt="'+title+'">':'')+'<figcaption>'+title+'</figcaption><p>'+esc(text||'Пока не заполнено')+'</p></figure>').join('')+'</div>';
     node('communityEditMemory').textContent=row?'Изменить анкету':'Заполнить анкету';
   }catch(e){if(current(uid,epoch))notice('communityProfileStatus',err(e),true)}
 }
 async function editMemory(){
   if(!active())return;const uid=owner(),epoch=generation;
   const row=check(await sb.from('member_memories').select('*').eq('user_id',uid).maybeSingle());if(!current(uid,epoch))return;
   if(!profile?.person_id&&typeof ensurePeopleData==='function')await ensurePeopleData();
   const unlinked=!profile?.person_id;
   const choices=unlinked?peopleCache.filter(p=>!personIdentityUnknown(p)).map(p=>'<option value="'+esc(p.id)+'">'+esc(personDisplayName(p))+' · '+esc(p.group_name||'')+' · № '+esc(p.number??'')+'</option>').join(''):'';
   const identity=unlinked
     ?'<div class="notice memoryIdentityLink"><b>Сначала найдите себя в школьном архиве.</b><br>Это нужно один раз, чтобы ваша анкета «Тогда / Сейчас» появилась именно в вашей карточке раздела «Люди».</div><label>Кто вы в архиве<select id="communityMemoryPerson"><option value="">— выберите себя —</option>'+choices+'</select></label>'
     :'';
   openPhotoModal('Моя анкета «Тогда и Сейчас»',
     '<p class="communityMuted">Это ваша личная страница для закрытого архива: школьный портрет, сегодняшнее фото и короткий рассказ о пути между ними.</p>'+
     identity+
     '<div class="communityPair communityMemoryEditPair"><div><label>Фото школьных лет<input type="file" id="communityThenFile" accept="image/jpeg,image/png,image/webp"></label><label>О чём я мечтал в школе<textarea id="communityDream" maxlength="5000">'+esc(row?.school_dream||'')+'</textarea></label></div><div><label>Современное фото<input type="file" id="communityNowFile" accept="image/jpeg,image/png,image/webp"></label><label>Чем живу сейчас<textarea id="communityLife" maxlength="5000">'+esc(row?.life_now||'')+'</textarea></label></div></div>',
     async()=>{
       const pending=[];
       try{
         if(!profile?.person_id){
           const personId=node('communityMemoryPerson')?.value||'';
           if(!personId)throw Error('Выберите себя в школьном архиве.');
           const {data:linked,error:linkError}=await sb.rpc('link_my_archive_person',{p_person_id:personId});
           if(linkError)throw linkError;
           profile.person_id=linked?.person_id||personId;
           profile.class_group=linked?.class_group||peopleCache.find(p=>p.id===personId)?.group_name||null;
         }
         const thenFile=node('communityThenFile').files[0],nowFile=node('communityNowFile').files[0];
         const payload={user_id:uid,school_dream:node('communityDream').value.trim(),life_now:node('communityLife').value.trim(),then_photo:row?.then_photo||null,now_photo:row?.now_photo||null,updated_at:new Date().toISOString()};
         if(thenFile){payload.then_photo=await upload(thenFile,'portrait');pending.push(payload.then_photo)}
         if(nowFile){payload.now_photo=await upload(nowFile,'portrait');pending.push(payload.now_photo)}
         if(!current(uid,epoch))throw Error('Вход завершён.');
         if(row){
           const changed=check(await sb.from('member_memories').update(payload).eq('user_id',uid).eq('updated_at',row.updated_at).select('user_id'));
           if(!changed.length)throw Error('Анкета уже изменилась в другом окне. Откройте её заново.');
         }else check(await sb.from('member_memories').insert(payload));
         memory=payload;
         if(typeof syncAccountNavigation==='function')syncAccountNavigation();
       }catch(e){if(pending.length)await sb.storage.from('community-media').remove(pending);throw e}
     }
   );
   node('photoModalSave').textContent='Сохранить анкету';
 }
 window.openMemberMemoryEditor=()=>editMemory();

 async function heartbeat(){
   const uid=owner(),epoch=generation;if(!uid||document.hidden||heartbeatBusy)return;heartbeatBusy=true;
   try{
     check(await sb.from('site_presence').upsert({user_id:uid,last_seen_at:new Date().toISOString()}));
     const rows=check(await sb.from('site_presence').select('user_id,last_seen_at,person:profiles(display_name)').gt('last_seen_at',new Date(Date.now()-90000).toISOString()))||[];
     if(!current(uid,epoch))return;
     node('communityOnline').innerHTML=rows.length?'<b>'+rows.length+' онлайн</b><p>'+esc(rows.map(r=>r.person?.display_name||'Участник').join(', '))+'</p>':'Сейчас нет активных участников.';
   }catch(e){if(current(uid,epoch))node('communityOnline').textContent='Статус онлайн временно недоступен.'}finally{heartbeatBusy=false}
 }
 const oldLoadHome=loadHome;
 loadHome=async()=>{await oldLoadHome();void homeWidgets();void heartbeat()};
 async function homeWidgets(){
   const uid=owner(),epoch=generation;if(!uid)return;
   try{
     const media=await sb.from('archive_media').select('id,title,approx_date_text,data,current_storage_path').eq('media_type','photo');
     check(media);if(!current(uid,epoch))return;
     const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Samara',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),date=Object.fromEntries(parts.map(p=>[p.type,p.value]));
     const today=date.month+'-'+date.day;
     const anniversary=(media.data||[]).find(m=>/^\d{4}-\d{2}-\d{2}$/.test(m.data?.event_date||'')&&m.data.event_date.slice(5)===today&&Number(m.data.event_date.slice(0,4))<Number(date.year));
     const url=anniversary?.current_storage_path?await archiveSignedImage(anniversary.current_storage_path):null;if(!current(uid,epoch))return;
     node('communityDay').innerHTML=anniversary?(url?'<img src="'+esc(url)+'" alt="'+esc(anniversary.title)+'">':'')+'<p><b>'+esc(Number(date.year)-Number(anniversary.data.event_date.slice(0,4)))+' лет назад</b> · '+esc(anniversary.title)+'</p><button class="secondary" type="button" data-community-photo="'+esc(anniversary.id)+'">Открыть снимок</button>':'На '+date.day+'.'+date.month+' пока нет снимка с подтверждённой датой. При описании фото редактор может указать точный день.';
   }catch(e){if(current(uid,epoch)){node('communityDay').textContent='Не удалось получить архивные даты.'}}
 }
 async function openRestoration(file){
   if(!active())return;const uid=owner(),epoch=generation;
   const {data,error}=await sb.functions.invoke('restore-archive-photo',{body:{action:'status'}});
   if(!current(uid,epoch))return;
   openPhotoModal('Реставрация фотографии','<div class="communityPanel"><h3>Новая жизнь старого снимка</h3><p>'+esc(file?.name||'Выберите фотографию при загрузке.')+'</p><label>Что сделать<select id="communityRestoreMode"><option value="repair">Очистить царапины</option><option value="faces">Повысить чёткость лиц</option><option value="colorize">Колоризировать</option></select></label><p class="notice">'+(error?'Не удалось проверить подключение сервиса.':data?.configured?'Для обработки отдельная копия будет отправлена подключённому сервису. Оригинал сохранится.':'Сервис реставрации ещё не подключён. Загрузка оригиналов и обычная обработка фотографий работают.')+'</p>'+(data?.configured?'<label class="checkItem"><input type="checkbox" id="communityRestoreConsent"> Разрешаю отправить эту фотографию сервису реставрации.</label><button class="secondary" type="button" id="communityRestoreRun">Обработать копию</button>':'')+'<div id="communityRestoreStatus" role="status"></div><div id="communityRestoreResult"></div></div>',async()=>closePhotoModal());closeOnly();
   node('photoModalBody').insertAdjacentHTML('beforeend','<button type="button" class="secondary" id="communityRestoreBack">Вернуться к загрузке оригинала</button>');
   node('communityRestoreBack').onclick=()=>node('submitArchivePhotoInput').onchange();
   node('communityRestoreRun')?.addEventListener('click',async e=>{
     if(!file||!node('communityRestoreConsent').checked){notice('communityRestoreStatus','Выберите фото и подтвердите обработку.');return}
     e.target.disabled=true;let path;
     try{path=await upload(file,'restoration');notice('communityRestoreStatus','Обрабатываю копию…');const result=check(await sb.functions.invoke('restore-archive-photo',{body:{action:'restore',path,mode:node('communityRestoreMode').value,consent:true}}));if(!current(uid,epoch))return;if(!result?.ok)throw Error(result?.error||'Обработка не выполнена.');const url=await communityUrl(result.path);node('communityRestoreResult').innerHTML='<img class="photoDetailImage" src="'+esc(url)+'" alt="Реставрированная копия"><a class="secondary" href="'+esc(url)+'" download="restored.png" target="_blank" rel="noopener">Скачать копию</a>';notice('communityRestoreStatus','Копия готова. Оригинал не изменён.')}catch(ex){notice('communityRestoreStatus',err(ex),true)}finally{if(path)await sb.storage.from('community-media').remove([path]);if(e.target.isConnected)e.target.disabled=false}
   });
 }
 // Offer restoration before the existing contribution form; no file leaves the browser without a user action.
 const originalContributionChange=node('submitArchivePhotoInput')?.onchange;
 if(originalContributionChange)node('submitArchivePhotoInput').onchange=()=>{
   const file=node('submitArchivePhotoInput').files[0];originalContributionChange();if(!file)return;
   node('photoModalBody').insertAdjacentHTML('beforeend','<div class="communityRestoration"><b>ИИ-реставрация</b><p class="communityMuted">Очистка царапин, чёткость лиц, колоризация. Подключение сервиса подготовлено.</p><button type="button" class="secondary" id="communityRestoreOpen">Проверить реставрацию</button></div>');
   node('communityRestoreOpen').onclick=()=>openRestoration(file);
 };
 document.addEventListener('click',async e=>{
   const b=e.target.closest('[data-library-tab],[data-community-topic],[data-community-story],[data-community-topic-edit],[data-community-year],[data-community-view],[data-community-person],[data-community-photo],#communityEditMemory');if(!b)return;
   try{
     if(b.dataset.libraryTab){libraryTab=b.dataset.libraryTab;renderLibrary()}
     else if(b.dataset.communityTopic){topic=b.dataset.communityTopic==='Все темы'?'all':b.dataset.communityTopic;renderTopicButtons();renderStoriesCatalog()}
     else if(b.dataset.communityStory){await openStory(b.dataset.communityStory)}
     else if(b.dataset.communityTopicEdit){await editTopics(b.dataset.communityTopicEdit)}
     else if(b.dataset.communityYear){timeline=b.dataset.communityYear;mediaFocus=null;renderPhotosSection()}
     else if(b.dataset.communityView){await showView(!active()&&!['home','profile','tv'].includes(b.dataset.communityView)?'profile':b.dataset.communityView)}
     else if(b.dataset.communityPhoto){await showView('photos');await openArchivePhoto(b.dataset.communityPhoto)}
     else if(b.dataset.communityPerson){if(!active()){await showView('profile');return}if(b.dataset.communityGroup)peopleGroup=b.dataset.communityGroup;selectedPersonId=b.dataset.communityPerson;if(node('peopleSearch'))node('peopleSearch').value='';document.querySelectorAll('[data-pgroup]').forEach(x=>x.classList.toggle('on',x.dataset.pgroup===peopleGroup));await showView('people');openPersonContext(b.dataset.communityPerson)}
     else if(b.id==='communityEditMemory'){await editMemory()}
   }catch(ex){alert(err(ex))}
 });
 const oldClose=closePhotoModal;
 closePhotoModal=()=>{node('photoModalBody')?.querySelectorAll('audio').forEach(a=>a.pause());oldClose()};
 node('photoModalClose').onclick=closePhotoModal;node('photoModalCancel').onclick=closePhotoModal;
 new MutationObserver(()=>{if(!node('storyDetail').classList.contains('open'))node('storyDetailBody').querySelectorAll('audio').forEach(a=>a.pause())}).observe(node('storyDetail'),{attributes:true,attributeFilter:['class']});
 const oldPersonContext=openPersonContext;
 openPersonContext=id=>{
   oldPersonContext(id);if(!active())return;
   const person=peopleCache.find(p=>p.id===id);
   node('contextActions').insertAdjacentHTML('beforeend','<button type="button" class="contextAction" id="communityPersonMemory"><span class="contextActionIcon">◷</span><span class="contextActionText">Тогда / Сейчас<div class="contextActionHint">Личное досье: два портрета и рассказ о себе</div></span></button>'+(editor()?'<button type="button" class="contextAction" id="communityContactSearch"><span class="contextActionIcon">◎</span><span class="contextActionText">'+(person?.data?.contact_status==='missing'?'Контакт найден':'Объявить поиск контакта')+'</span></button>':''));
   node('communityPersonMemory').onclick=async()=>{
     closeContextSheet();openPhotoModal('Тогда / Сейчас','<div id="communityComparison"><div id="communityCompareResult"></div></div>',async()=>closePhotoModal());closeOnly();
     let old=null;const media=(person?.data?.media_links||[])[0]?.media_id;if(media){const row=check(await sb.from('archive_media').select('current_storage_path').eq('id',media).maybeSingle());if(row?.current_storage_path)old=await archiveSignedImage(row.current_storage_path)}
     await comparePerson(id,old||'');
   };
   node('communityContactSearch')?.addEventListener('click',async e=>{
     e.target.disabled=true;
     try{const row=check(await sb.from('archive_people').select('data,updated_at').eq('id',id).single());const status=row.data?.contact_status==='missing'?'found':'missing';const changed=check(await sb.from('archive_people').update({data:{...row.data,contact_status:status},updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',row.updated_at).select('id'));if(!changed.length)throw Error('Карточка уже изменилась. Откройте её заново.');closeContextSheet();await loadPeople();void homeWidgets()}catch(ex){alert(err(ex));e.target.disabled=false}
   });
 };
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void heartbeat()});
 sb.auth.onAuthStateChange(event=>{
   if(event==='SIGNED_OUT'){generation++;librarySeq++;memory=null;libraryItems=[];libraryImages?.disconnect();if(node('communityProfile'))node('communityProfile').hidden=true;if(node('communityProfilePreview'))node('communityProfilePreview').innerHTML='';node('storiesList').innerHTML='<div class="notice">Сначала войдите в профиль.</div>';node('photosList').innerHTML='<div class="notice">Сначала войдите в профиль.</div>';node('communityTimeline').innerHTML='';node('communityLibraryItems').innerHTML='';notice('communityLibraryStatus','Войдите, чтобы открыть материалы диалога.');node('communityOnline').textContent='Войдите, чтобы увидеть одноклассников онлайн.';node('communityDay').textContent='События и фотографии из закрытого архива.';node('storyDetailBody').querySelector('#communityStoryMedia')?.remove();closePhotoModal()}
 });
 setup();
 setInterval(()=>{void heartbeat();if(active()&&!document.hidden&&activeViewId()==='chat')void loadLibrary()},30000);
 // init() belongs to the original application and may already be awaiting auth.
 if(active()){void renderMemory();void homeWidgets();void heartbeat()}
 window.CommunityPreview={version:'20261008-12',storyTopics,yearsFor,loadLibrary};
})();
