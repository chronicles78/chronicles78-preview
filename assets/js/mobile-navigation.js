/* Shared navigation uses the existing section routing and account component. */
(()=>{
 const theme=document.getElementById('mobileThemeBtn');
 const syncTheme=()=>{const dark=document.documentElement.dataset.theme==='dark';theme.textContent=dark?'☀':'☾';theme.setAttribute('aria-pressed',String(dark));theme.setAttribute('aria-label',dark?'Включить светлую тему':'Включить тёмную тему')};
 theme.onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(THEME_KEY,next)}catch{}applyTheme(next)};
 new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});syncTheme();
 const button=document.getElementById('mobileMenuBtn'),menu=document.getElementById('moreNavMenu');
 button.onclick=()=>menu.classList.contains('open')?closeMoreNav():openMoreNav();
 let chatFrame=0;
 function sizeChatWorkspace(){
  cancelAnimationFrame(chatFrame);
  chatFrame=requestAnimationFrame(()=>{
   const chat=document.querySelector('#chat.active .chat');
   if(!chat)return;
   const vv=window.visualViewport,top=vv?.offsetTop||0,height=vv?.height||innerHeight;
   const inset=parseFloat(getComputedStyle(document.body).paddingBottom)||0;
   const available=Math.max(0,top+height-chat.getBoundingClientRect().top-inset);
   chat.style.setProperty('--chat-workspace-height',available+'px');
  });
 }
 window.addEventListener('resize',sizeChatWorkspace);
 window.visualViewport?.addEventListener('resize',sizeChatWorkspace);
 window.visualViewport?.addEventListener('scroll',sizeChatWorkspace);
 new ResizeObserver(sizeChatWorkspace).observe(document.querySelector('.top'));
 function sync(){
  sizeChatWorkspace();
  const current=activeViewId();
  menu.querySelectorAll('[data-more-view]').forEach(item=>{
   item.classList.toggle('active',item.dataset.moreView===current);
   if(item.dataset.moreView===current)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  });
  document.getElementById('editorBuildInfo').hidden=profile?.role!=='admin';
 }
 new MutationObserver(sync).observe(document.querySelector('main'),{subtree:true,attributes:true,attributeFilter:['class']});
 sb.auth.onAuthStateChange(()=>setTimeout(sync,0));sync();
 document.addEventListener('keydown',event=>{
  if(!menu.classList.contains('open'))return;
  if(event.key==='Escape'){event.preventDefault();closeMoreNav();return}
  if(event.key!=='Tab')return;
  const items=[...menu.querySelectorAll('button')].filter(x=>!x.hidden&&x.getClientRects().length);
  const first=items[0],last=items.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 });
 window.matchMedia('(max-width:1279px)').addEventListener('change',closeMoreNav);
})();
