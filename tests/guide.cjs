/* UI acceptance with fixtures only. No server or real Supabase account is required. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const stub=require('./frontend-fixture.cjs');
const root=path.resolve(__dirname,'..');
let count=0;
function check(value,message){assert.ok(value,message);count++}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
 async function page(width=390,height=844,options={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:options.reduced?'reduce':'no-preference'});
  const p=await context.newPage();p.errors=[];p.remote=[];p.setDefaultTimeout(10000);
  p.on('pageerror',e=>p.errors.push(e.message));
  if(options.dismissed)await p.addInitScript(()=>localStorage.setItem('ch78-guide-dismissed-v1','1'));
  await p.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.hostname==='cdn.jsdelivr.net'){
    let body='('+stub.toString()+')()';
    if(options.authDelay)body+=';(()=>{const create=supabase.createClient;supabase.createClient=(...args)=>{const client=create(...args),get=client.auth.getSession;let held=false;client.auth.getSession=()=>{if(held)return get();held=true;return new Promise(resolve=>{window.auditReleaseAuth=async()=>resolve(await get())})};return client}})()';
    return r.fulfill({body,contentType:'application/javascript'});
   }
   if(u.hostname!=='guide.local'){p.remote.push(u.hostname);return r.abort()}
   if(u.pathname==='/version.json')return r.fulfill({body:'{}',contentType:'application/json'});
   const file=path.join(root,u.pathname==='/'?'index.html':u.pathname);
   const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
   try{return r.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'})}catch{return r.fulfill({status:404,body:''})}
  });
  await p.goto('http://guide.local/',{waitUntil:'domcontentloaded'});
  if(options.authDelay){await p.waitForFunction(()=>typeof window.auditReleaseAuth==='function');check(!await p.locator('.guideInvitation').isVisible(),'invitation waits for delayed session restore');check(!await p.evaluate(()=>appNavEnabled),'auth restore still pending');await p.evaluate(()=>window.auditReleaseAuth())}
  await p.waitForFunction(()=>typeof appNavEnabled!=='undefined'&&appNavEnabled);
  await p.locator('#accountShade.open').waitFor();return p;
 }
 async function settle(p){await p.waitForTimeout(80)}
 async function member(p){await p.evaluate(async()=>{auditSession={user:{id:'audit-user'},access_token:'fixture'};await hydrateProfileFromSession(auditSession,{render:false});renderProfile();closeAccountModal()})}
 async function manual(p,width){
  if(width<1280){await p.locator('#mobileMenuBtn').click();await p.locator('#moreNavMenu [data-guide-start]').click()}
  else await p.locator('.guideHomeEntry').click();await settle(p);
 }
 async function bounds(p,target){
  const card=await p.locator('.guideCard').boundingBox(),v=p.viewportSize();
  check(card&&card.x>=0&&card.y>=0&&card.x+card.width<=v.width+1&&card.y+card.height<=v.height+1,'card inside viewport');
  const control=p.locator('[data-guide-next]:visible,[data-guide-end]:visible').first();
  check(await control.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el}),'guide control can be clicked');
  if(target){
   const t=await p.locator(target).boundingBox(),r=await p.locator('.guideRing').boundingBox();
   check(t&&r&&Math.abs(r.x-Math.max(0,t.x-3))<2&&Math.abs(r.y-Math.max(0,t.y-3))<2,'outline follows real target');
   if(t.height<100)check(card.y+card.height<=t.y+1||card.y>=t.y+t.height-1||card.x+card.width<=t.x||card.x>=t.x+t.width,'card leaves target uncovered');
  }else check(!await p.locator('.guideRing').isVisible(),'text-only fallback has no outline');
 }
 // Initial and repeated visits, postponed invitation, modal precedence.
 const first=await page();await first.waitForTimeout(1300);
 check(!await first.locator('.guideInvitation').isVisible(),'no invitation over automatic login');
 await first.locator('#accountModalClose').click();await first.locator('.guideInvitation').waitFor({state:'visible'});
 await first.locator('[data-guide-later]').click();check(await first.evaluate(()=>localStorage.getItem('ch78-guide-dismissed-v1'))==='1','postpone is saved');
 await first.reload();await first.waitForTimeout(1500);await first.evaluate(()=>closeAccountModal());await first.waitForTimeout(1300);
 check(!await first.locator('.guideInvitation').isVisible(),'repeat visit does not invite');await first.context().close();
 const delayed=await page(390,844,{authDelay:true});await delayed.context().close();
 const invited=await page(390);await invited.locator('#accountModalClose').click();
 await invited.locator('.guideInvitation').waitFor({state:'visible'});
 await invited.evaluate(()=>{archiveMediaDock.hidden=false;archiveMediaDock.classList.add('compact')});await settle(invited);
 check(!await invited.locator('.guideInvitation').isVisible(),'invitation yields to archive player');
 await invited.evaluate(()=>{archiveMediaDock.hidden=true});await invited.locator('.guideInvitation').waitFor({state:'visible'});
 await invited.locator('.guideInvitation [data-guide-start]').click();await settle(invited);check(await invited.locator('.guideCard').isVisible(),'invitation launches tour');
 await invited.keyboard.press('Escape');check(await invited.evaluate(()=>localStorage.getItem('ch78-guide-dismissed-v1'))==='1','starting tour saves invitation dismissal');await invited.context().close();
 for(const width of [320,390,760,820,1024,1366]){
  for(const signedIn of [false,true]){
   const p=await page(width,width===320?568:844,{dismissed:true,reduced:width===320});
   await p.locator('#accountModalClose').click();if(signedIn)await member(p);
   await manual(p,width);
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   const callsBefore=await p.evaluate(()=>auditCalls.filter(x=>x.table).length);
   const mobile=width<1280;
   const ids=mobile?['home','people','stories','chat','menu','photos','city','questions','account','finish']:['home','people','stories','photos','city','questions','chat','account','finish'];
   for(let i=0;i<ids.length;i++){
    const id=ids[i];check(await p.locator('#guideProgress').textContent()==='Шаг '+(i+1)+' из '+ids.length,'progress matches scenario');
    let target=null;
    if(mobile&&id!=='finish')target=id==='menu'?'#mobileMenuBtn':id==='account'?'#moreNavMenu .accountEntryBtn':'#moreNavMenu [data-more-view="'+id+'"]';
    else if(!mobile&&id!=='finish')target=id==='home'?'#home2Stage':id==='account'?'#accountBtnHome':'.h2Nav [data-home-view="'+id+'"]';
    await bounds(p,target);
    if(['people','stories','photos','city','questions','chat'].includes(id))check((await p.locator('#guideText').textContent()).includes('потребуется вход')===!signedIn,'access wording follows active membership');
    if(id==='account')check((await p.locator('#guideText').textContent()).includes('8-значным')===!signedIn,'current OTP explanation');
    if(id==='questions'&&!mobile)check(!(await p.locator('#guideNote').textContent()).includes('отдельной кнопки'),'desktop questions has a real target');
    if(i===2){await p.locator('[data-guide-back]').click();await settle(p);check((await p.locator('#guideProgress').textContent()).startsWith('Шаг 2 '),'back returns to previous step');await p.locator('[data-guide-next]').click();await settle(p)}
    if(i<ids.length-1){await p.locator('[data-guide-next]').click();await settle(p)}
   }
   check(await p.evaluate(()=>auditCalls.filter(x=>x.table).length)===callsBefore,'tour adds no table requests');
   await p.locator('[data-guide-end]').click();check(!await p.locator('.guideCard').isVisible()&&!await p.locator('.guideRing').isVisible(),'finish cleans up');
   if(mobile)check(!await p.locator('#moreNavMenu').isVisible(),'owned menu closes');
   await manual(p,width);await p.keyboard.press('Escape');check(!await p.locator('.guideCard').isVisible(),'Escape exits repeat launch');
   check(await p.evaluate(()=>document.activeElement?.matches('.guideEntry,#mobileMenuBtn')),'focus returns to visible entry');
   check(p.errors.length===0,p.errors.join(';'));check(!p.remote.some(x=>x.endsWith('supabase.co')),'no real Supabase requests');await p.context().close();
  }
 }
 // Internal desktop/tablet navigation and mobile navigation still run normally.
 for(const width of [390,820,1366]){
  const p=await page(width,844,{dismissed:true});await member(p);await p.evaluate(()=>showView('people'));await settle(p);
  if(width<1280){await p.locator('#mobileMenuBtn').click();await p.locator('#moreNavMenu [data-guide-start]').click()}
  else await p.locator(width<1280?'#moreNavMenu [data-guide-start]':'.desktopTopNav [data-guide-start]').click();
  await p.locator('[data-guide-next]').click();await settle(p);
  await bounds(p,width<1280?'#moreNavMenu [data-more-view="people"]':width<1280?'#moreNavMenu [data-more-view="people"]':'.desktopTopNav [data-view="people"]');
  await p.locator('[data-guide-next]').click();await settle(p);
  const destination=width<1280?'#moreNavMenu [data-more-view="stories"]':width<1280?'#moreNavMenu [data-more-view="stories"]':'.desktopTopNav [data-view="stories"]';
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'internal navigation has no horizontal overflow');
  // A real navigation click ends the tour and is handled by the original router.
  await p.locator(destination).click();await settle(p);
  check(await p.locator('#stories.active').count()===1&&!await p.locator('.guideCard').isVisible(),'real navigation exits guide and works');
  check(p.errors.length===0,p.errors.join(';'));await p.context().close();
 }
 const p=await page(390,844,{dismissed:true});await p.locator('#accountModalClose').click();await manual(p,390);
 // Active guide suspends beneath auth/consent, then resumes at the same step.
 await p.locator('[data-guide-next]').click();await p.evaluate(()=>openAccountModal());await settle(p);
 check(!await p.locator('.guideCard').isVisible()&&!await p.locator('#moreNavMenu').isVisible(),'account modal takes precedence');
 await p.locator('#accountModalClose').click();await settle(p);check(await p.locator('.guideCard').isVisible()&&(await p.locator('#guideProgress').textContent()).startsWith('Шаг 2 '),'guide resumes same step');
 await p.evaluate(()=>{user={id:'pending'};pendingProfile={is_active:true};profile=null;consentRequired=true;openAccountModal()});await settle(p);
 check(await p.locator('#consentGateBox').isVisible()&&!await p.locator('.guideCard').isVisible(),'consent modal takes precedence');
 await p.evaluate(()=>{user=null;pendingProfile=null;consentRequired=false;closeAccountModal()});await settle(p);
 // Preserve the semantic step when the scenario changes.
 for(let i=0;i<3;i++)await p.locator('[data-guide-next]').click();await settle(p);
 check(await p.locator('#guideTitle').textContent()==='Меню','mobile menu step');
 await p.setViewportSize({width:1366,height:844});await p.waitForFunction(()=>document.getElementById('guideTitle').textContent==='Фото и видео');check(await p.locator('#guideTitle').textContent()==='Фото и видео','menu maps to archive on desktop');
 check(!await p.locator('#moreNavMenu').isVisible(),'resize closes owned menu');await bounds(p,'.h2Nav [data-home-view="photos"]');
 await p.setViewportSize({width:320,height:568});await p.waitForFunction(()=>document.getElementById('guideProgress').textContent==='Шаг 6 из 10');check((await p.locator('#guideProgress').textContent()).startsWith('Шаг 6 из 10'),'resize preserves archive step');await bounds(p,'#moreNavMenu [data-more-view="photos"]');
 for(let i=0;i<3;i++)await p.locator('[data-guide-next]').click();
 await p.setViewportSize({width:568,height:320});await settle(p);
 check(await p.locator('#guideTitle').textContent()==='Вход / профиль','landscape keeps account step');
 await bounds(p,await p.locator('.guideRing').isVisible()?'#moreNavMenu .accountEntryBtn':null);
 await p.keyboard.press('Escape');await p.setViewportSize({width:1366,height:844});await settle(p);await manual(p,1366);
 await p.evaluate(()=>applyTheme('dark'));await settle(p);
 check(await p.locator('.guideCard').evaluate(el=>{
  const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
  const style=getComputedStyle(el),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
 }),'dark text contrast meets 4.5:1');
 await p.evaluate(()=>{document.querySelector('.h2Nav [data-home-view="people"]').hidden=true});await p.locator('[data-guide-next]').click();await settle(p);
 await bounds(p,null);check((await p.locator('#guideNote').textContent()).includes('недоступен'),'hidden target uses safe fallback');
 await p.locator('[data-guide-next]').click();await settle(p);check(await p.locator('#guideTitle').textContent()==='Истории','fallback does not block next');
 await p.keyboard.press('Escape');await p.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('Storage unavailable')}});await manual(p,1366);check(await p.locator('.guideCard').isVisible(),'manual launch tolerates unavailable storage');
 await p.keyboard.press('Tab');check(await p.locator('[data-guide-end]').evaluate(el=>el===document.activeElement),'Tab reaches finish button');await p.keyboard.press('Escape');
 check(p.errors.length===0,p.errors.join(';'));await p.context().close();await browser.close();
 console.log(count+' guide checks passed (Chromium, local files, mocked Supabase; no live backend).');
})().catch(error=>{console.error(error);process.exit(1)});
