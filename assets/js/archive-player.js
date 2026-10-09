/* One persistent media element, outside replaceable photo/story modal content. */
(()=>{
 const dock=document.createElement('section');dock.id='archiveMediaDock';dock.hidden=true;dock.setAttribute('aria-label','Проигрыватель видеоархива');
 dock.innerHTML='<div class="archiveMediaHead"><b id="archiveMediaTitle"></b><button id="archiveMediaMinimize" type="button" aria-expanded="true">Свернуть</button></div><video id="archiveMediaPlayer" controls playsinline preload="metadata"></video><div class="archiveMediaActions"><button id="archiveMediaToggle" type="button">Воспроизвести</button><button id="archiveMediaStop" type="button">Выключить ×</button><button id="archiveMediaRetry" type="button" hidden>Повторить загрузку</button><label><input id="archiveMediaLoop" type="checkbox" checked> Повторять ролик</label></div><div id="archiveMediaState" role="status" aria-live="polite"></div>';
 document.body.append(dock);
 new ResizeObserver(()=>document.documentElement.style.setProperty("--archive-dock-height",dock.hidden?"0px":Math.ceil(dock.getBoundingClientRect().height+20)+"px")).observe(dock);
 const el=id=>document.getElementById(id),player=el('archiveMediaPlayer');let sequence=0,clip=null;
 const status=message=>el('archiveMediaState').textContent=message;
 function sync(){el('archiveMediaToggle').textContent=player.paused?'Воспроизвести':'Пауза';el('archiveMediaToggle').setAttribute('aria-label',player.paused?'Продолжить воспроизведение':'Приостановить воспроизведение')}
 function stop(){sequence++;clip=null;player.pause();player.removeAttribute('src');player.removeAttribute('poster');player.load();dock.hidden=true;status('');el('archiveMediaRetry').hidden=true;sync()}
 window.stopArchiveMedia=stop;
 function minimize(){if(!clip)return;dock.classList.add("compact");el("archiveMediaMinimize").textContent="Показать видео";el("archiveMediaMinimize").setAttribute("aria-expanded","false")}
 window.minimizeArchiveMedia=minimize;
 async function source(v){
  stop();if(!user||!profile?.is_active)return;
  closeContextSheet();closePhotoModal();powerOffEraTv();clip=v;dock.hidden=false;dock.classList.remove('compact');el('archiveMediaMinimize').textContent='Свернуть';el('archiveMediaMinimize').setAttribute('aria-expanded','true');
  el('archiveMediaTitle').textContent=v.title||'Видеоархив';player.loop=el('archiveMediaLoop').checked;const poster=videoPosterSigned[v.id];if(poster)player.poster=poster;
  const seq=sequence,uid=user.id,epoch=privateSessionSeq;
  const valid=()=>seq===sequence&&archiveSessionIsCurrent(uid,epoch)&&clip?.id===v.id;
  status('Загружаю ролик…');
  try{
   const {data,error}=await sb.functions.invoke('drive-video-import',{body:{action:'playback_url',mediaId:v.id}});
   if(!valid())return;if(error||!data?.ok||!data.url)throw new Error(await driveVideoError(error,data));
   player.src=data.url;
   try{await player.play();if(valid())status('Ролик играет. Можно переходить в другие разделы.')}catch{if(valid())status('Нажмите «Воспроизвести», чтобы включить ролик.')}
  }catch(error){if(valid()){status('Не удалось загрузить ролик. '+(error.message||''));el('archiveMediaRetry').hidden=false}}
 }
 window.startArchiveMedia=source;
 el('archiveMediaToggle').onclick=async()=>{if(!clip)return;if(player.paused){try{await player.play();status('Воспроизведение продолжается.')}catch{status('Не удалось включить ролик. Попробуйте загрузить его заново.');el('archiveMediaRetry').hidden=false}}else{player.pause();status('На паузе.')}};
 el('archiveMediaStop').onclick=stop;
 el('archiveMediaRetry').onclick=()=>{if(clip)void source(clip)};
 el('archiveMediaLoop').onchange=()=>{player.loop=el('archiveMediaLoop').checked};
 el('archiveMediaMinimize').onclick=()=>{const compact=dock.classList.toggle('compact');el('archiveMediaMinimize').textContent=compact?'Показать видео':'Свернуть';el('archiveMediaMinimize').setAttribute('aria-expanded',String(!compact))};
 for(const event of ['play','pause','ended'])player.addEventListener(event,sync);
 player.addEventListener('ended',()=>status('Ролик завершён. Нажмите «Воспроизвести», чтобы начать снова.'));
 player.addEventListener('waiting',()=>{if(clip)status('Подгружаю ролик…')});
 player.addEventListener('playing',()=>{if(clip)status('Ролик играет. Можно переходить в другие разделы.')});
 player.addEventListener('error',()=>{if(clip){status('Воспроизведение прервано. Попробуйте повторить загрузку.');el('archiveMediaRetry').hidden=false}});
 sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')stop()});window.addEventListener('pagehide',stop);
})();
