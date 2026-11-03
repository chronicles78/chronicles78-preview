/* UI-001 acceptance: production files, synthetic data, no real backend. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const stub=require('./frontend-fixture.cjs'),seed=require('./ui-fixture.cjs'),root=path.resolve(__dirname,'..');
let checks=0;const results=[];
function check(ok,name){assert.ok(ok,name);checks++;results.push({name,ok:true})}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 async function page(width,height){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,locale:'ru-RU',timezoneId:'Europe/Samara'});
  await context.addInitScript(()=>{try{localStorage.setItem('ch78-guide-dismissed-v1','1');localStorage.setItem('chronicles78-theme','light')}catch{}});
  const p=await context.newPage();p.errors=[];p.external=[];
  p.on('pageerror',e=>p.errors.push(e.message));
  await p.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.hostname==='cdn.jsdelivr.net')return r.fulfill({contentType:'application/javascript',body:'('+stub.toString()+')();('+seed.toString()+')()'});
   if(u.hostname!=='ui-test.local'){p.external.push(u.hostname);return r.abort()}
   if(u.pathname==='/version.json')return r.fulfill({contentType:'application/json',body:'{}'});
   if(u.pathname.startsWith('/audit/')){const portrait=u.pathname.includes('portrait'),wide=u.pathname.includes('wide'),w=portrait?900:1600,h=portrait?1600:wide?500:900;return r.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#e4d4af"/><text x="30" y="60" font-size="24">Синтетическое изображение UI-001</text></svg>`})}
   const file=path.join(root,u.pathname==='/'?'index.html':u.pathname),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webmanifest':'application/manifest+json'};
   try{return r.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'})}catch{return r.fulfill({status:404,body:''})}
  });
  await p.goto('https://ui-test.local/',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>typeof appNavEnabled!=='undefined'&&appNavEnabled);await p.locator('#accountShade.open').waitFor();return p;
 }
 async function settle(p){await p.waitForTimeout(180)}
 async function member(p){await p.evaluate(async()=>{auditSession={user:{id:'audit-user'},access_token:'fixture'};await hydrateProfileFromSession(auditSession,{render:false});renderProfile();closeAccountModal()})}
 async function screenshot(p,name,fullPage=false){if(process.env.UI_SCREENSHOT_DIR){fs.mkdirSync(process.env.UI_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.UI_SCREENSHOT_DIR,name+'.jpg'),type:'jpeg',quality:80,fullPage})}}
 for(const [width,height] of [[320,568],[375,844],[390,844],[430,844],[768,1024],[1024,768],[1366,768],[1920,1080]]){
  const p=await page(width,height);
  check(await p.locator('#accountAuthHost #archiveWelcome').isVisible(),width+' welcome belongs to visible account host');
  await member(p);
  const home=await p.evaluate(()=>({button:parseFloat(getComputedStyle(document.querySelector('.h2Actions button')).fontSize),text:parseFloat(getComputedStyle(document.querySelector('.h2WeekText p')).fontSize),horizontal:document.documentElement.scrollWidth>innerWidth}));
  check(home.button>=15&&home.text>=16&&!home.horizontal,width+' readable home without horizontal overflow');
  if(width>=1280){const flow=await p.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();return rect('.communityHome').bottom<=rect('.h2Week').top&&rect('.h2Week').bottom<=rect('.h2Fresh').top});check(flow,width+' home panels do not overlap');const heroActions=await p.evaluate(()=>{const hero=document.querySelector('.h2Hero').getBoundingClientRect();return [...document.querySelectorAll('.h2Actions button')].every(el=>{const r=el.getBoundingClientRect();return r.top>=hero.top&&r.bottom<=hero.bottom&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el})});check(heroActions,width+' hero actions remain unclipped and clickable')}
  if(width===1366)await screenshot(p,'1366-home',true);
  for(const role of ['member','admin']){
   await p.evaluate(role=>{profile.role=role;renderProfile();syncAccountNavigation();showView('people')},role);await settle(p);
   if(width<1280){await p.locator('#mobileMenuBtn').click();await p.locator('#moreNavMenu [data-more-view="questions"]').click();check(await p.locator('#questions.active').isVisible(),width+' '+role+' questions via compact menu')}
   else{const rects=await p.locator('.desktopTopNav button:visible,.topRight button:visible').evaluateAll(xs=>xs.map(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}));check(rects.every(Boolean),width+' '+role+' desktop controls in viewport');await p.locator('.desktopTopNav [data-view="questions"]').click();check(await p.locator('#questions.active').isVisible(),width+' '+role+' direct questions entry')}
  }
  for(const view of ['people','stories','photos','city','questions','chat']){await p.evaluate(v=>showView(v),view);await settle(p);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' '+view+' no horizontal overflow')}
  if(width===768)await screenshot(p,'768-navigation');
  await p.evaluate(()=>{profile.role='member';showView('chat')});await settle(p);
  const composer=await p.locator('#chat .composer').boundingBox();check(composer.y>=0&&composer.y+composer.height<=height+1,width+' composer inside viewport');
  const taps=await p.locator('#voiceInputBtn,#attachBtn').evaluateAll(xs=>xs.map(el=>el.getBoundingClientRect().height));check(taps.every(h=>h>=44),width+' voice and attachment tap areas');
  const primaries=await p.locator('#meetingOpenBtn,#sendBtn').evaluateAll(xs=>xs.map(el=>getComputedStyle(el).backgroundColor));check(primaries[0]===primaries[1],width+' consistent primary palette');
  await p.evaluate(()=>{const box=document.getElementById('messages'),el=document.querySelector('.bubble[data-mid="M-011"]');box.scrollTop+=el.getBoundingClientRect().top-box.getBoundingClientRect().top-5});await settle(p);
  await p.locator('.bubble[data-mid="M-011"]').click({button:'right',position:{x:70,y:15}});
  for(const button of await p.locator('details.footMenu[open] .menuBtn').all()){await button.scrollIntoViewIfNeeded();check(await button.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el}),width+' every message action can be reached')}
  if(width===390)await screenshot(p,'390-message-menu');
  await p.keyboard.press('Escape');check(await p.locator('details.footMenu[open]').count()===0,width+' Escape closes message menu');
  await p.locator('#messages .bubble').last().scrollIntoViewIfNeeded();const r=await p.locator('#messages .bubble').last().boundingBox();
  await p.mouse.move(r.x+40,r.y+15);await p.mouse.down();await p.waitForTimeout(720);await p.mouse.up();await settle(p);check(await p.locator('details.footMenu[open]').count()===1,width+' long press survives release');
  await p.locator('details.footMenu[open] [data-reply]').click();check(await p.locator('details.footMenu[open]').count()===0,width+' reply closes menu');check(await p.locator('#composer').evaluate(el=>el===document.activeElement),width+' reply focuses composer');
  if(width===390){await p.locator('#messages .bubble').last().scrollIntoViewIfNeeded();const r=await p.locator('#messages .bubble').last().boundingBox(),cdp=await p.context().newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+40,y:r.y+15}]});await p.waitForTimeout(720);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(p);check(await p.locator('details.footMenu[open]').count()===1,'native touch release preserves menu');await p.keyboard.press('Escape')}
  await p.locator('#storyAssistBtn').scrollIntoViewIfNeeded();await p.locator('#storyAssistBtn').click();await p.evaluate(()=>document.querySelector('[data-guide-start]').click());await settle(p);check(await p.locator('.storyAssistantShade.open').isVisible()&&!await p.locator('.guideCard').isVisible(),width+' assistant takes precedence');await p.evaluate(()=>document.querySelector('.storyAssistantShade.open')?.classList.remove('open'));await settle(p);await p.keyboard.press('Escape');
  if(width>=1280){await p.evaluate(()=>setChatUnreadBadge(12));const overlap=await p.evaluate(()=>{const button=document.querySelector('.desktopTopNav [data-view="chat"]'),badge=button.querySelector('.chatUnreadBadge'),text=[...button.childNodes].find(x=>x.nodeType===3),range=document.createRange();range.selectNodeContents(text);const t=range.getBoundingClientRect(),b=badge.getBoundingClientRect();return Math.max(0,Math.min(t.right,b.right)-Math.max(t.left,b.left))*Math.max(0,Math.min(t.bottom,b.bottom)-Math.max(t.top,b.top))});check(overlap===0,width+' unread badge leaves label visible')}
  await p.evaluate(()=>applyTheme('dark'));check(await p.locator('#composer').evaluate(el=>getComputedStyle(el).color!==getComputedStyle(el).backgroundColor),width+' dark composer contrast preserved');
  check(p.errors.length===0,width+' no JavaScript errors '+p.errors.join(';'));check(!p.external.some(host=>host.endsWith('supabase.co')),width+' no real backend requests');await p.context().close();console.log('PASS width',width);
 }
 for(const [width,height] of [[568,320],[844,390],[390,430]]){const p=await page(width,height);await member(p);await p.evaluate(()=>showView('chat'));await settle(p);await p.locator('#composer').focus();await p.evaluate(()=>{archiveMediaDock.hidden=false;archiveMediaDock.classList.add('compact')});await settle(p);const c=await p.locator('#chat .composer').boundingBox(),d=await p.locator('#archiveMediaDock').boundingBox();check(c.y>=0&&c.y+c.height<=d.y,width+'x'+height+' focused composer above compact player');if(width===568)await screenshot(p,'568-landscape-chat');check(p.errors.length===0,width+' short viewport no errors');await p.context().close()}
 await browser.close();if(process.env.UI_RESULTS_FILE)fs.writeFileSync(process.env.UI_RESULTS_FILE,JSON.stringify({checks,results},null,2));console.log(checks+' UI-001 regression checks passed (Chromium, synthetic fixtures, no live backend).');
})().catch(e=>{console.error(e);process.exit(1)});
