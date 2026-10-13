/* CH78-GUIDE-001: UI-only tour. Never loads archive data or starts authentication. */
(()=>{
 'use strict';
 const VERSION='1',STORAGE_KEY='ch78-guide-dismissed-v'+VERSION;
 const mobile=matchMedia('(max-width:760px)'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const descriptions={
  home:['Это главная страница нашего архива. Здесь появляются новые материалы и самые интересные находки.','Здесь начинается наш архив: новые фотографии, интересные материалы и история недели.'],
  people:['Выберите 10А или 10Б, воспользуйтесь поиском по фамилии и откройте сведения об одноклассниках.','Найдите одноклассника, посмотрите фотографии и вспомните тех, с кем учились в 10А и 10Б.'],
  stories:['Воспоминания распределены по темам. Выберите главу и откройте заинтересовавшую историю.','Здесь собраны наши воспоминания. Выбирайте интересующую тему и читайте.'],
  photos:['Здесь собраны фотографии и видео. Они помогают вспомнить людей, места и события.','Наш общий фотоальбом и видеолетопись. Откройте альбом и рассматривайте снимки.'],
  city:['Наш Куйбышев — не только на карте, но и в памяти каждого из нас.','Вспомним Куйбышев нашей юности: улицы, дворы, Волгу и знакомые места.'],
  questions:['Если кто-то или что-то забыто, мы можем восстановить подробности сообща.','Здесь мы вместе восстанавливаем забытые имена, события и обстоятельства.'],
  chat:['Место для живого общения, которое дополняет нашу общую книгу воспоминаний.','Здесь мы разговариваем друг с другом. После входа можно читать доступные сообщения и участвовать в беседе.'],
  menu:['','За кнопкой «Меню» находятся разделы нашего архива. Это действующее меню сайта.'],
  account:['Здесь можно войти, заполнить анкету «Тогда / Сейчас» и управлять своими данными.','Здесь находятся вход и меню участника. После входа можно заполнить анкету «Тогда / Сейчас».'],
  finish:['Экскурсия закончилась. А наши «Хроники» продолжаются — вместе с вами.','Теперь вы знаете дорогу. Добро пожаловать домой — в наши «Хроники-78»!']
 };
 const titles={home:'Главная',people:'Люди',stories:'Истории',photos:'Фото и видео',city:'Город и время',questions:'Открытые вопросы',chat:'Чат',menu:'Меню',account:'Вход / профиль',finish:'Добро пожаловать!'};
 const scenarios={mobile:['home','people','stories','chat','menu','photos','city','questions','account','finish'],desktop:['home','people','stories','photos','city','questions','chat','account','finish']};
 const byId=id=>document.getElementById(id);
 const visible=el=>!!el&&!!el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden],[aria-hidden="true"]');
 const first=selector=>[...document.querySelectorAll(selector)].find(visible)||null;
 const menuOpen=()=>byId('moreNavMenu')?.classList.contains('open');
 const ready=()=>typeof appNavEnabled!=='undefined'&&appNavEnabled&& !authSyncPromise;
 const admitted=()=>typeof profile!=='undefined'&&!!profile?.is_active&&!profile?.access_blocked;
 const blocked=()=>!!first('.modalShade.open,.contextShade.open,.meetingShade:not([hidden]),#h2Search:not([hidden])')||!ready();
 const invitationBusy=()=>blocked()||menuOpen()||visible(byId('archiveMediaDock'));
 let dismissed=false;
 try{dismissed=localStorage.getItem(STORAGE_KEY)==='1'}catch{}
 let running=false,stepId='home',ownsMenu=false,returnFocus=null,frame=0,quietSince=0,lastSignature='',scrollTarget=null,suspended=false;
 const ring=document.createElement('div');ring.className='guideRing';ring.hidden=true;ring.setAttribute('aria-hidden','true');
 const card=document.createElement('section');card.className='guideCard';card.hidden=true;card.setAttribute('role','dialog');card.setAttribute('aria-modal','false');card.setAttribute('aria-labelledby','guideTitle');card.setAttribute('aria-describedby','guideText guideNote');
 card.innerHTML='<p class="guideProgress" id="guideProgress" aria-live="polite"></p><h2 id="guideTitle"></h2><div class="guideBody" tabindex="0" aria-label="Описание шага"><p id="guideText"></p><p class="guideNote" id="guideNote"></p></div><div class="guideControls"><button type="button" data-guide-back>Назад</button><button type="button" data-guide-next>Далее</button><button type="button" data-guide-end>Завершить</button></div>';
 const invite=document.createElement('section');invite.className='guideInvitation';invite.hidden=true;invite.setAttribute('aria-label','Приглашение в экскурсию');
 invite.innerHTML='<p>Впервые в «Хрониках-78»? Мы покажем вам, что здесь можно найти. Экскурсия займёт несколько минут.</p><div class="guideControls"><button type="button" data-guide-start>Начать экскурсию</button><button type="button" data-guide-later>Позже</button></div>';
 document.body.append(ring,card,invite);
 const sequence=()=>mobile.matches?scenarios.mobile:scenarios.desktop;
 function dismiss(){dismissed=true;invite.hidden=true;try{localStorage.setItem(STORAGE_KEY,'1')}catch{}}
 function closeOwnedMenu(){if(ownsMenu){closeMoreNav();ownsMenu=false}}
 function targetFor(id){
  if(id==='finish')return null;
  if(mobile.matches){
   if(id==='menu')return first('#mobileMenuBtn');
   return id==='account'?first('#moreNavMenu .accountEntryBtn'):first('#moreNavMenu [data-more-view="'+id+'"]');
  }
  if(id==='home')return first('.homeBrand,.bottom [data-view="home"],#home2Stage');
  if(id==='account')return first('#accountBtnHome,#accountBtnTop,#accountBtnBottom');
  return first('.h2Nav [data-home-view="'+id+'"],.desktopTopNav [data-view="'+id+'"],.bottom [data-view="'+id+'"]');
 }
 function ensureMenu(){
  if(mobile.matches&&stepId!=='finish'){
   if(!menuOpen()&&visible(byId('mobileMenuBtn'))){openMoreNav();ownsMenu=true}
  }else closeOwnedMenu();
 }
 function usableTarget(target){
  if(!target||target.id==='home2Stage')return target;
  const vv=window.visualViewport,top=vv?.offsetTop||0,height=vv?.height||innerHeight;
  const navigation=mobile.matches?first('#mobileMenuBtn'):first('.bottom,.desktopTopNav');
  const floor=navigation?Math.max(top+12,navigation.getBoundingClientRect().bottom+12):top+12;
  const dock=first('#archiveMediaDock'),bottom=Math.min(top+height-12,dock?dock.getBoundingClientRect().top-24:Infinity);
  const space=()=>{const r=target.getBoundingClientRect();return Math.max(r.top-floor,bottom-r.bottom)-12};
  const menu=target.closest('#moreNavMenu');
  if(menu){
   const r=target.getBoundingClientRect(),m=menu.getBoundingClientRect();
   if(r.top<m.top)menu.scrollTop+=r.top-m.top;
   else if(r.bottom>m.bottom)menu.scrollTop+=r.bottom-m.bottom;
  }
  if(space()<180&&menu){
   menu.scrollTop+=target.getBoundingClientRect().top-menu.getBoundingClientRect().top-12;
  }
  // A short landscape viewport can leave no room beside a real button.
  // Use the same safe text fallback rather than cover the highlighted control.
  return space()>=180?target:null;
 }
 function position(target){
  const vv=window.visualViewport,left=vv?.offsetLeft||0,top=vv?.offsetTop||0,w=vv?.width||innerWidth,margin=12,gap=12;
  const dock=first('#archiveMediaDock');
  const h=Math.min(vv?.height||innerHeight,dock?Math.max(160,dock.getBoundingClientRect().top-top-gap):Infinity);
  const navigation=mobile.matches?first('#mobileMenuBtn'):first('.bottom,.desktopTopNav');
  const cardTop=navigation?Math.max(top+margin,navigation.getBoundingClientRect().bottom+gap):top+margin;
  card.style.width=Math.min(360,w-2*margin)+'px';card.style.maxHeight=Math.max(100,top+h-margin-cardTop)+'px';
  const cw=card.offsetWidth;
  const rect=target?.getBoundingClientRect();
  if(rect){
   const space=Math.max(rect.top-cardTop,top+h-margin-rect.bottom)-gap;
   if(space>=160)card.style.maxHeight=space+'px';
  }
  const ch=card.offsetHeight;
  let x=left+(w-cw)/2,y=top+(h-ch)/2;
  if(rect){
   x=Math.max(left+margin,Math.min(rect.left,left+w-cw-margin));
   const above=rect.top-cardTop,below=top+h-margin-rect.bottom;
   if(below>=ch+gap)y=rect.bottom+gap;
   else if(above>=ch+gap)y=rect.top-ch-gap;
   else y=above>below?cardTop:top+h-ch-margin;
   // If a large target fills the screen, use the border as an outline, never a shade.
   ring.style.left=Math.max(left,rect.left-3)+'px';ring.style.top=Math.max(top,rect.top-3)+'px';
   ring.style.width=Math.max(0,Math.min(rect.right+3,left+w)-Math.max(left,rect.left-3))+'px';
   ring.style.height=Math.max(0,Math.min(rect.bottom+3,top+h)-Math.max(top,rect.top-3))+'px';
  }
  card.style.left=x+'px';card.style.top=Math.max(cardTop,Math.min(y,top+h-ch-margin))+'px';
  ring.hidden=!rect;
 }
 function render({focus=false}={}){
  if(!running)return;
  if(blocked()){suspended=true;card.hidden=ring.hidden=true;closeOwnedMenu();return}
  focus=focus||suspended;suspended=false;
  ensureMenu();
  const steps=sequence();if(!steps.includes(stepId))stepId='photos';
  const index=steps.indexOf(stepId),rawTarget=targetFor(stepId),target=usableTarget(rawTarget),isMember=admitted();
  const signature=[mobile.matches,stepId,isMember,!!rawTarget,!!target].join('|');
  if(signature!==lastSignature){
   byId('guideProgress').textContent='Шаг '+(index+1)+' из '+steps.length;
   byId('guideTitle').textContent=titles[stepId];
   let text=descriptions[stepId][mobile.matches?1:0];
   if(stepId==='account'&&!isMember)text='Укажите e-mail и подтвердите его 8-значным кодом из последнего письма. Код действует 10 минут. Если вы здесь впервые, понадобится также имя и согласие с правилами.';
   if(!isMember&&['people','stories','photos','city','questions','chat'].includes(stepId))text+=' Для просмотра закрытых материалов потребуется вход.';
   byId('guideText').textContent=text;
   byId('guideNote').textContent=stepId==='questions'&&!rawTarget&&!mobile.matches?'В текущей компьютерной навигации отдельной кнопки этого раздела нет. На мобильном экране он находится в меню.':(!target&&stepId!=='finish'?(rawTarget?'На этом размере экрана подсветка недоступна. Можно продолжить экскурсию.':'Элемент сейчас недоступен. Можно продолжить экскурсию.'):'');
   byId('guideNote').hidden=!byId('guideNote').textContent;
   card.querySelector('[data-guide-back]').disabled=index===0;
   card.querySelector('[data-guide-next]').hidden=stepId==='finish';
   card.scrollTop=0;
   card.querySelector('.guideBody').scrollTop=0;
   lastSignature=signature;
  }
  card.hidden=false;
  if(target&&target!==scrollTarget){
   scrollTarget=target;
   const r=target.getBoundingClientRect();
   if(r.top<0||r.bottom>innerHeight)target.scrollIntoView({block:'nearest',inline:'nearest',behavior:reduced.matches?'instant':'smooth'});
  }
  position(target);
  if(focus)card.querySelector(stepId==='finish'?'[data-guide-end]':'[data-guide-next]').focus({preventScroll:true});
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;render()})}
 function end({restore=true}={}){
  if(!running)return;
  running=false;suspended=false;card.hidden=ring.hidden=true;closeOwnedMenu();scrollTarget=null;lastSignature='';
  if(restore){
   const destination=visible(returnFocus)?returnFocus:first('.guideEntry,#mobileMenuBtn');
   destination?.focus({preventScroll:true});
  }
 }
 function start(button){
  if(blocked())return;
  dismiss();returnFocus=button||document.activeElement;
  if(button?.closest('#moreNavMenu'))closeMoreNav();
  running=true;stepId='home';scrollTarget=null;lastSignature='';render({focus:true});
 }
 function move(delta){
  const steps=sequence(),index=steps.indexOf(stepId);
  stepId=steps[Math.max(0,Math.min(steps.length-1,index+delta))];scrollTarget=null;render({focus:true});
 }
 document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-guide-start'))start(button);
  else if(button.hasAttribute('data-guide-later'))dismiss();
  else if(button.hasAttribute('data-guide-back'))move(-1);
  else if(button.hasAttribute('data-guide-next'))move(1);
  else if(button.hasAttribute('data-guide-end'))end();
  else if(running&&button.matches('[data-view],[data-home-view],[data-more-view],.accountEntryBtn,#mobileMenuBtn,#mobileMoreBtn,#moreNavClose'))end({restore:false});
 },true);
 document.addEventListener('keydown',e=>{
  if(running&&!card.hidden&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();end()}
 },true);
 new MutationObserver(records=>{
  if(records.some(record=>!record.target.closest?.('.guideCard,.guideRing,.guideInvitation'))){
   if(invitationBusy()){quietSince=0;invite.hidden=true}
   schedule();
  }
 }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','aria-hidden'],childList:true});
 window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
 window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
 mobile.addEventListener('change',()=>{if(!mobile.matches&&stepId==='menu')stepId='photos';scrollTarget=null;render()});
 // The existing init() restores auth and can schedule login/confirmation dialogs.
 // Wait for a quiet second after it finishes; never close those dialogs for the tour.
 setInterval(()=>{
  if(blocked()){quietSince=0;invite.hidden=true;if(running)render();return}
  if(running){render();return}
  if(dismissed||document.hidden||invitationBusy()){invite.hidden=true;quietSince=0;return}
  if(!quietSince)quietSince=Date.now();
  if(Date.now()-quietSince>=1000&&!menuOpen())invite.hidden=false;
 },250);
})();
