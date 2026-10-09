/* Public meet.jit.si disables IFrame API (checked 2026-10-09): use explicit external links. */
(()=>{
 const TOKEN=/^Chronicles78-[a-f0-9]{48}$/;
 const params=new URL(location.href).searchParams;
 let room=TOKEN.test(params.get('meeting')||'')?params.get('meeting'):null;
 let previousFocus=null;
 const shade=document.createElement('div');shade.className='meetingShade';shade.hidden=true;
 shade.innerHTML='<section class="meetingPanel" role="dialog" aria-modal="true" aria-labelledby="meetingTitle" tabindex="-1"><div class="meetingHead"><h2 id="meetingTitle">Встреча одноклассников</h2><button type="button" id="meetingClose" aria-label="Закрыть приглашение">Закрыть ×</button></div><p>Для 5–15 участников. Для начала встречи организатору нужен отдельный вход в аккаунт Jitsi; вход на нашем сайте его не заменяет. Участники могут присоединиться без регистрации здесь, когда организатор начнёт встречу.</p><p>Ссылкой может воспользоваться любой, кому её передадут. Зал ожидания и ручной допуск мы не включаем. Камеру можно выключить и общаться только со звуком.</p><div class="meetingActions"><button type="button" id="meetingCreate">Создать новую встречу</button><button class="primary" type="button" id="meetingJoin">Присоединиться</button><button type="button" id="meetingCopy">Скопировать ссылку</button><a id="meetingSeparate" target="_blank" rel="noopener noreferrer">Открыть встречу отдельно</a></div><input class="meetingLink" id="meetingLink" readonly aria-label="Ссылка приглашения"><div id="meetingStatus" role="status" aria-live="polite"></div><p class="meetingServiceLimit">Публичный meet.jit.si сейчас отключает встроенный IFrame API. Встреча откроется в отдельной вкладке; камера, микрофон и полноэкранный режим управляются там. Чтобы выйти и освободить камеру и микрофон, завершите звонок в Jitsi или закройте вкладку встречи.</p></section>';
 document.body.append(shade);
 const el=id=>document.getElementById(id),panel=shade.querySelector('.meetingPanel');
 const status=message=>{el('meetingStatus').textContent=message};
 function invitation(){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('meeting',room);return url.href}
 function update(){
  const hasRoom=!!room;el('meetingJoin').disabled=!hasRoom;el('meetingCopy').disabled=!hasRoom;
  el('meetingLink').value=hasRoom?invitation():'';el('meetingLink').hidden=!hasRoom;
  el('meetingSeparate').hidden=!hasRoom;
  if(hasRoom)el('meetingSeparate').href='https://meet.jit.si/'+room;
  el('meetingCreate').hidden=!(user&&profile?.is_active);
 }
 function close(){shade.hidden=true;previousFocus?.focus()}
 window.closeClassMeeting=()=>{if(!shade.hidden)close()};
 function open(){closeMoreNav();previousFocus=document.activeElement;shade.hidden=false;update();status(room?'Встреча готова. Нажмите «Присоединиться» для проверки камеры и микрофона.':'Войдите на сайт, чтобы организовать встречу, или откройте полученную ссылку.');el('meetingClose').focus()}
 el('meetingOpenBtn').onclick=open;el('meetingClose').onclick=close;
 el('meetingCreate').onclick=()=>{
  if(!user||!profile?.is_active){status('Для организации встречи войдите на сайт.');return}
  const bytes=crypto.getRandomValues(new Uint8Array(24));room='Chronicles78-'+Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');update();status('Новая встреча создана. Скопируйте ссылку и передайте участникам.');
 };
 el('meetingCopy').onclick=async()=>{if(!room)return;try{await navigator.clipboard.writeText(invitation());status('Ссылка скопирована.')}catch{el('meetingLink').focus();el('meetingLink').select();status('Не удалось скопировать автоматически. Скопируйте выделенную ссылку.')}};
 el('meetingJoin').onclick=()=>{
  if(!room)return;
  window.open('https://meet.jit.si/'+room,'_blank','noopener,noreferrer');
  status('Открываю Jitsi в отдельной вкладке. Если она не открылась, нажмите «Открыть встречу отдельно». Для выхода завершите звонок в этой вкладке.');
 };
 shade.addEventListener('click',event=>{if(event.target===shade)close()});
 document.addEventListener('keydown',event=>{if(shade.hidden)return;if(event.key==='Escape'){event.preventDefault();close()}else if(event.key==='Tab'){const buttons=[...panel.querySelectorAll('button,a,input')].filter(x=>!x.disabled&&x.getClientRects().length);const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
 sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){close();room=null}});
 if(room)open();
})();
