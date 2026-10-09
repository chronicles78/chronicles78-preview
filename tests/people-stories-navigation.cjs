const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const stub=require('./frontend-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});let checks=0;
 for(const width of [320,375,390,430,1366]){
  const p=await browser.newPage({viewport:{width,height:844},hasTouch:width<761});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'('+stub.toString()+')()'}));
  await p.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:8009/');await p.waitForTimeout(200);
  await p.evaluate(async()=>{
   auditRows.archive_people.push({id:'10B-02',number:2,group_name:'10Б',canonical_name:'Семёнов Борис',aliases:['Боря'],identification_status:'подтверждено',data:{}});
   auditRows.class_photos=[{id:'CLASS-10A',group_name:'10А',title:'10А',storage_path:'fixture.jpg',source_width:1000,source_height:800}];
   auditRows.class_photo_regions=[{class_photo_id:'CLASS-10A',person_id:'10A-11',x:410,y:210,w:90,h:130}];
   auditSession={user:{id:'audit-user'},access_token:'fixture'};await hydrateProfileFromSession(auditSession,{render:false});renderProfile();closeAccountModal();await showView('people');
  });
  await p.locator('[data-pgroup="10А"]').click();await p.waitForFunction(()=>document.querySelector('#peopleList .personCard h3')?.textContent==='Ульянов Альберт');assert.equal(await p.locator('#peopleList .personCard').count(),1);checks++;
  await p.locator('#toggleClassNumbers').waitFor();await p.locator('#toggleClassNumbers').click();assert.equal(await p.evaluate(()=>showClassNumbers),true);await p.locator('#toggleClassNumbers').click();assert.equal(await p.evaluate(()=>showClassNumbers),false);checks++;
  await p.locator('[data-pgroup="10Б"]').click();await p.waitForFunction(()=>document.querySelectorAll('#peopleList .personCard').length===2);checks++;
  await p.locator('[data-pgroup="all"]').click();await p.waitForFunction(()=>document.querySelectorAll('#peopleList .personCard').length===3);checks++;
  await p.locator('[data-pgroup="10Б"]').click();await p.locator('#peopleSearch').fill('  УЛЬЯНОВ  ');await p.waitForFunction(()=>document.querySelector('#peopleList .personCard h3')?.textContent==='Ульянов Альберт');assert.equal(await p.locator('[data-pgroup="all"]').getAttribute('class'),'mini on');checks++;
  await p.locator('#peopleSearch').fill('семенов');await p.waitForFunction(()=>document.querySelector('#peopleList .personCard h3')?.textContent==='Семёнов Борис');checks++;
  await p.locator('#peopleSearch').fill('боря');assert.equal(await p.locator('#peopleList .personCard h3').textContent(),'Семёнов Борис');checks++;
  await p.locator('#peopleSearch').fill('Несуществующий');assert.match(await p.locator('#peopleList').textContent(),/Ничего не найдено/);await p.locator('[data-pgroup="10А"]').click();assert.equal(await p.locator('#peopleSearch').inputValue(),'');await p.waitForFunction(()=>document.querySelector('#peopleList .personCard h3')?.textContent==='Ульянов Альберт');checks++;
  await p.evaluate(async()=>{auditRows.archive_stories[0].title='ДлинныйЗаголовок'.repeat(25);auditRows.archive_stories[0].data.story_text='Воспоминание'.repeat(120);await showView('stories')});
  if(width<761){
   const sizes=await p.locator('#stories,#storiesList,.communityStoryCard').evaluateAll(xs=>xs.map(x=>({client:x.clientWidth,scroll:x.scrollWidth})));assert.ok(sizes.every(x=>x.scroll<=x.client+1),JSON.stringify(sizes));checks++;
   await p.mouse.wheel(100,400);assert.equal(await p.evaluate(()=>scrollX),0);checks++;
   await p.evaluate(()=>openStory('S-001'));await p.locator('#storyDetail.open').waitFor();assert.equal(await p.locator('#storyDetail').evaluate(x=>{x.scrollLeft=100;return x.scrollLeft}),0);assert.equal(await p.locator('#storyDetail').evaluate(x=>getComputedStyle(x).touchAction),'pan-y pinch-zoom');checks++;
   await p.evaluate(()=>showView('home'));assert.equal(await p.locator('.h2Nav').isVisible(),false);assert.equal(await p.locator('#mobileMenuBtn').isVisible(),true);assert.equal(await p.locator('#mobileThemeBtn').isVisible(),true);checks++;
   const before=await p.locator('#mobileMenuBtn,#mobileThemeBtn').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().top));await p.evaluate(()=>scrollTo(0,550));const after=await p.locator('#mobileMenuBtn,#mobileThemeBtn').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().top));assert.deepEqual(after,before);checks++;
   await p.locator('#mobileThemeBtn').click();assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');assert.equal(await p.locator('#mobileThemeBtn').getAttribute('aria-pressed'),'true');await p.locator('#mobileThemeBtn').click();assert.equal(await p.locator('html').getAttribute('data-theme'),'light');checks++;
   await p.locator('#mobileMenuBtn').click();await p.locator('[data-more-view="people"]').click();assert.equal(await p.locator('#people.active').count(),1);checks++;
  }else{await p.evaluate(()=>showView('home'));assert.equal(await p.locator('.h2Nav').isVisible(),false);assert.equal(await p.locator('#mobileThemeBtn').isVisible(),true);await p.locator('#mobileMenuBtn').click();assert.equal(await p.locator('#moreNavMenu').isVisible(),true);await p.locator('#moreNavClose').click();checks++}
  assert.deepEqual(errors,[]);await p.close();
 }
 await browser.close();console.log(checks+' targeted checks passed (fixture data; Chromium).');
})().catch(error=>{console.error(error);process.exit(1)});
