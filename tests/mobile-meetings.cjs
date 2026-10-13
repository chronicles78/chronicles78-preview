const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const stub=require('./frontend-fixture.cjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8008/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});let count=0;
 async function page(width=390,url=base){const p=await browser.newPage({viewport:{width,height:844}});p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));await p.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'('+stub.toString()+')()',contentType:'application/javascript'}));await p.context().route('https://meet.jit.si/**',r=>r.fulfill({body:'<title>Jitsi placeholder for link test</title>',contentType:'text/html'}));await p.goto(url);await p.waitForTimeout(200);await p.evaluate(()=>closeAccountModal());return p}
 async function member(p,role='member'){await p.evaluate(async role=>{auditRows.profiles[0].role=role;auditSession={user:{id:'audit-user'},access_token:'fixture'};await hydrateProfileFromSession(auditSession,{render:false});renderProfile();closeAccountModal()},role)}
 for(const width of [320,375,390,430,1366]){
  const p=await page(width);await member(p);await p.evaluate(()=>showView('home'));
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);count++;
  if(width<=760){
   const buttons=await p.locator('.h2Actions button,.h2WeekText .h2Button,.h2SectionHead button,.communityHome button,.h2HomeTv .eraTvDials button').evaluateAll(xs=>xs.map(x=>{const r=x.getBoundingClientRect();return {w:r.width,h:r.height,right:r.right,scroll:x.scrollWidth,client:x.clientWidth}}));
   assert.ok(buttons.length>=3);for(const b of buttons){assert.ok(b.w>=44&&b.h>=44&&b.right<=width&&b.scroll<=b.client+1,JSON.stringify(b))}count++;
   assert.equal(await p.locator('.bottom').isVisible(),false);
   await p.locator('#mobileMenuBtn').click();assert.equal(await p.locator('#mobileMenuBtn').getAttribute('aria-expanded'),'true');
   assert.equal(await p.locator('#moreNavMenu [data-more-view]:visible').count(),7);count++;
   for(const view of ['people','stories','chat','photos','city','questions','home']){
    if(!await p.locator('#moreNavMenu').isVisible())await p.locator('#mobileMenuBtn').click();
    await p.locator('[data-more-view="'+view+'"]').click();await p.waitForTimeout(80);
    assert.equal(await p.locator('#'+view+'.active').count(),1);assert.equal(await p.locator('.bottom').isVisible(),false);assert.equal(await p.locator('#moreNavMenu').isVisible(),false);
    assert.equal(await p.evaluate(()=>parseFloat(getComputedStyle(document.body).paddingBottom)),0);count++;
   }
   await p.locator('#mobileMenuBtn').click();await p.keyboard.press('Escape');assert.equal(await p.locator('#mobileMenuBtn').evaluate(x=>x===document.activeElement),true);
   await p.locator('#mobileMenuBtn').click();await p.locator('#mobileMenuBtn').click();assert.equal(await p.locator('#moreNavMenu').isVisible(),false);
   await p.locator('#mobileMenuBtn').click();await p.locator('#moreNavShade').click({position:{x:2,y:2}});assert.equal(await p.locator('#moreNavMenu').isVisible(),false);count++;
   await p.evaluate(()=>showView('chat'));assert.equal(await p.locator('#sendBtn').isVisible(),true);assert.equal(await p.locator('#attachBtn').isVisible(),true);count++;
  }else{assert.equal(await p.locator('#mobileMenuBtn').isVisible(),false);assert.equal(await p.locator('.h2Nav').isVisible(),true);count++}
  assert.equal(await p.locator('#buildVersion').isVisible(),false);assert.equal(await p.locator('.h2Version,#loginBuildMark').count(),0);count++;
  assert.equal(p.errors.length,0,p.errors.join(';'));await p.close();
 }
 const a=await page();await member(a,'admin');await a.evaluate(()=>showView('profile'));assert.equal(await a.locator('#buildVersion').isVisible(),true);count++;
 await a.evaluate(()=>showView('chat'));assert.equal(await a.locator('script[src*="meet.jit.si"]').count(),0);await a.locator('#meetingOpenBtn').click();assert.equal(await a.locator('script[src*="meet.jit.si"]').count(),0);await a.locator('#meetingCreate').click();const link=await a.locator('#meetingLink').inputValue(),token=new URL(link).searchParams.get('meeting');assert.match(token,/^Chronicles78-[a-f0-9]{48}$/);count++;
 await a.context().grantPermissions(['clipboard-read','clipboard-write']);await a.locator('#meetingCopy').click();assert.equal(await a.evaluate(()=>navigator.clipboard.readText()),link);count++;
 const [firstPopup]=await Promise.all([a.waitForEvent('popup'),a.locator('#meetingJoin').click()]);await firstPopup.waitForLoadState();assert.equal(firstPopup.url(),'https://meet.jit.si/'+token);count++;
 const b=await page(375,link);assert.equal(await b.locator('#meetingCreate').isVisible(),false);
 const [secondPopup]=await Promise.all([b.waitForEvent('popup'),b.locator('#meetingJoin').click()]);await secondPopup.waitForLoadState();assert.equal(secondPopup.url(),firstPopup.url());assert.equal(await b.evaluate(()=>auditSession),null);count++;
 assert.equal(await b.locator('#meetingSeparate').getAttribute('href'),'https://meet.jit.si/'+token);assert.match(await b.locator('.meetingServiceLimit').textContent(),/отключает/);count++;
 assert.equal(await b.locator('iframe').count(),0);assert.equal(await b.locator('script[src*="meet.jit.si"]').count(),0);await b.locator('#meetingClose').click();count++;
 await a.locator('#meetingClose').click();await a.locator('#meetingOpenBtn').click();assert.equal(await a.locator('#meetingLink').inputValue(),link);count++;
 await a.evaluate(()=>showView('home'));assert.equal(await a.locator('.meetingShade').isVisible(),false);count++;
 await a.evaluate(()=>showView('chat'));await a.locator('#meetingOpenBtn').click();await a.locator('#meetingCreate').click();assert.notEqual(await a.locator('#meetingLink').inputValue(),link);count++;
 await firstPopup.close();await secondPopup.close();
 assert.equal(a.errors.length,0,a.errors.join(';'));assert.equal(b.errors.length,0,b.errors.join(';'));await a.close();await b.close();await browser.close();console.log(count+' checks passed (mock Supabase and Jitsi destination; no live media call).');
})().catch(error=>{console.error(error);process.exit(1)});
