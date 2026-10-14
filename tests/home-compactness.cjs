/* UI-001-F01: measured desktop height, readable content, real hit-testing; no live data. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const stub=require('./frontend-fixture.cjs'),seed=require('./ui-fixture.cjs');
const root=process.env.UI_SOURCE_ROOT||path.resolve(__dirname,'..'),results=[];let checks=0;
function check(ok,message){assert.ok(ok,message);checks++}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 async function page(width,height,scheme='light'){
  const p=await browser.newPage({viewport:{width,height},colorScheme:scheme,locale:'ru-RU'});p.errors=[];
  await p.addInitScript(scheme=>{try{localStorage.setItem('ch78-guide-dismissed-v1','1');localStorage.setItem('chronicles78-theme',scheme)}catch{}},scheme);
  p.on('pageerror',e=>p.errors.push(e.message));
  await p.route('**/*',r=>{const u=new URL(r.request().url());
   if(u.hostname==='cdn.jsdelivr.net')return r.fulfill({contentType:'application/javascript',body:'('+stub.toString()+')();('+seed.toString()+')()'});
   if(u.hostname!=='cover.local')return r.abort();
   if(u.pathname==='/version.json')return r.fulfill({contentType:'application/json',body:'{}'});
   if(u.pathname.startsWith('/audit/'))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="#e4d4af"/><text x="40" y="60" font-size="25">Синтетические материалы приёмки F01</text></svg>'});
   const file=path.join(root,u.pathname==='/'?'index.html':u.pathname),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webmanifest':'application/manifest+json'};
   try{return r.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'})}catch{return r.fulfill({status:404,body:''})}
  });
  await p.goto('https://cover.local/',{waitUntil:'domcontentloaded'});await p.locator('#accountShade.open').waitFor();await p.evaluate(()=>closeAccountModal());return p;
 }
 async function role(p,value){if(value==='anonymous')return;await p.evaluate(async value=>{auditRows.profiles[0].role=value;auditSession={user:{id:'audit-user'},access_token:'fixture'};await hydrateProfileFromSession(auditSession,{render:false});renderProfile();closeAccountModal();await showView('home')},value)}
 async function measure(p){return p.evaluate(()=>{
  const doc=document.documentElement,scroll=document.scrollingElement,vv=visualViewport,rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
  const blocks=Object.fromEntries(['.h2Nav','.h2Hero','.communityHome','.h2Week','.h2HomeTv','.h2Fresh','.h2Final'].map(s=>[s,rect(document.querySelector(s))]));
  const fonts=Object.fromEntries(['.h2Actions button','.h2WeekText p','.h2WeekText h3','.h2FreshCard h3','.h2FreshCard p','.communityHome h3','.h2Class figcaption'].map(s=>[s,parseFloat(getComputedStyle(document.querySelector(s)).fontSize)]));
  const controls=[...document.querySelectorAll('.h2Nav button:not([hidden]),.h2Actions button,.h2SectionHead button,#h2WeekRead,.h2FreshCard,.communityPanel>button,.eraTvDials button,#mobileMenuBtn,#mobileThemeBtn,.communityHome .onlinePerson,.guideHomeEntry,.h2Credits')].filter(el=>el.getClientRects().length).map(el=>{const r=rect(el),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{label:el.getAttribute('aria-label')||el.textContent.trim(),rect:r,hit:hit===el||el.contains(hit)}});
  const hero=blocks['.h2Hero'],heroActions=[...document.querySelectorAll('.h2Actions button')].map(el=>{const r=rect(el);return r.y>=hero.y&&r.bottom<=hero.bottom});
  return{scrollHeight:scroll.scrollHeight,clientHeight:doc.clientHeight,innerHeight,visualHeight:vv.height,scrollWidth:scroll.scrollWidth,clientWidth:doc.clientWidth,visualWidth:vv.width,stage:rect(document.getElementById('home2Stage')),stageOverflow:getComputedStyle(document.getElementById('home2Stage')).overflowY,blocks,fonts,controls,heroActions};
 })}
 async function shot(p,name){if(process.env.HOME_SCREENSHOT_DIR){fs.mkdirSync(process.env.HOME_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.HOME_SCREENSHOT_DIR,name+'.jpg'),type:'jpeg',quality:86,fullPage:false})}}
 for(const [width,height] of [[1280,720],[1366,768],[1440,900],[1920,1080],[768,1024],[1024,768]])for(const scheme of ['light','dark'])for(const memberRole of ['anonymous','member','admin']){
  const p=await page(width,height,scheme);await role(p,memberRole);await p.waitForTimeout(220);const m=await measure(p),name=width+'x'+height+'-'+memberRole+'-'+scheme;
  check(m.scrollHeight<=m.clientHeight+2,name+' scrollHeight <= clientHeight + 2');
  check(m.scrollHeight<=m.visualHeight+2,name+' fits actual visual viewport height');
  check(m.scrollWidth<=m.clientWidth+2&&m.scrollWidth<=m.visualWidth+2,name+' no horizontal scroll');
  check(m.stageOverflow==='visible',name+' main content is not hidden by overflow');
  check(Math.abs(m.stage.height-m.visualHeight)<=2,name+' cover fills visible height');
  for(const [selector,r] of Object.entries(m.blocks))check(r.y>=-2&&r.bottom<=m.visualHeight+2&&r.x>=-2&&r.right<=m.visualWidth+2,name+' '+selector+' entirely in viewport');
  for(const [a,b] of [['.h2Hero','.communityHome'],['.communityHome','.h2Week'],['.h2Week','.h2Fresh'],['.h2Fresh','.h2Final']])check(m.blocks[a].bottom<=m.blocks[b].y+2,name+' '+a+' does not overlap '+b);
  check(m.fonts['.h2Actions button']>=15&&m.fonts['.h2WeekText p']>=16&&m.fonts['.h2FreshCard p']>=15&&m.fonts['.h2Class figcaption']>=14,name+' readable content minima');
  check(m.heroActions.every(Boolean),name+' hero actions are not clipped');
  for(const button of m.controls){check(button.rect.y>=-2&&button.rect.bottom<=m.visualHeight+2,name+' '+button.label+' in viewport');check(button.hit,name+' '+button.label+' can be clicked')}
  check(await p.locator('.h2Class img,.h2WeekPhoto img,.h2FreshImage img').evaluateAll(xs=>xs.every(el=>getComputedStyle(el).objectFit==='contain')),name+' photo proportions preserved by contain');
  await p.mouse.wheel(0,800);await p.waitForTimeout(80);check(await p.evaluate(()=>scrollY)<=2,name+' wheel does not scroll the cover');
  check(p.errors.length===0,name+' no JS errors '+p.errors.join(';'));results.push({name,requiredCompact:true,metrics:m});await shot(p,name);await p.close();console.log('PASS',name);
 }
 // Do not conceal content on physically small windows: record exceptions with reachable controls.
 for(const [width,height] of [[320,568],[390,844],[844,390],[568,320],[1280,600]]){
  const p=await page(width,height);await role(p,'member');await p.waitForTimeout(180);const m=await measure(p),name=width+'x'+height+'-exception';
  check(m.scrollWidth<=m.clientWidth+2,name+' no horizontal scroll');
  for(const selector of ['#h2WeekRead','#h2FreshPhoto','#h2FreshStory','#h2FreshFace','.h2Final']){await p.locator(selector).evaluate(el=>el.scrollIntoView({block:'center'}));check(await p.locator(selector).isVisible(),name+' '+selector+' reachable')}
  check(p.errors.length===0,name+' no JS errors');results.push({name,requiredCompact:false,exception:m.scrollHeight>m.visualHeight+2,reason:'Single cover requires width >= 768, with height >= 716 at width >=1280, >=760 at width 1024–1279, or >=856 at width 768–1023; narrower phones and shorter windows retain accessible scrolling content pending editor approval.',metrics:m});await shot(p,name);await p.close();console.log('EXCEPTION',name,m.scrollHeight,m.visualHeight);
 }
 await browser.close();if(process.env.HOME_RESULTS_FILE)fs.writeFileSync(process.env.HOME_RESULTS_FILE,JSON.stringify({checks,results},null,2));console.log(checks+' F01 checks passed; '+results.filter(x=>x.exception).length+' explicit exceptions for approval.');
})().catch(e=>{console.error(e);process.exit(1)});
