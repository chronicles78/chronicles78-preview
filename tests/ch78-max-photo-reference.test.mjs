import test from 'node:test';
import assert from 'node:assert/strict';
import {reactionPreflight} from '../supabase/functions/ch78-max-assistant/conversation.mjs';
import {createHandler} from '../supabase/functions/ch78-max-assistant/handler.mjs';
import {createHandler as createWorker} from '../supabase/functions/ch78-max-worker/handler.mjs';
const project='https://fnwpkmjjdhflnqghnogj.supabase.co',secret='s'.repeat(40);
const env=k=>({SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'local-test',CH78_MAX_WEBHOOK_SECRET:secret,CH78_MAX_CHAT_ID:'-72977812571458',OPENAI_API_KEY:'local-test'}[k]);
const questions=[
 'Это же я рядом с Лидой? Не могу точно определить. В очках кто рядом?',
 'Кто на этой фотографии рядом с учителем?',
 'Угадайте, кто на первом фото?',
 'Я ли это на снимке?',
 'Кто в очках рядом?'
];
for(const content of questions)test('text-only reaction does not identify a person: '+content,async()=>{
 let effects=0;
 const handler=createHandler({env,fetchImpl:async()=>{effects++;throw Error('Unexpected retrieval or model effect');}});
 const response=await handler(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify({action:'reaction',q:content,post:{message_id:'synthetic-photo-question',message_ts:Date.UTC(2026,9,29),content},context:[]})}));
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.found,false);assert.equal(result.answer,'');assert.equal(result.conversation.action,'silence');assert.equal(effects,0);
});
for(const content of [
 'Кто выкладывал фотографии после встречи?',
 'Кто пользовался фотоаппаратом на встрече?',
 'В каком году сделали фотографию класса?',
 'В архиве кто рассказывал про ремонт очков?'
])test('ordinary text archive question remains eligible: '+content,()=>{
 assert.equal(reactionPreflight({content},[]),null);
});
test('explicit human reply retains its conversation boundary',()=>{
 const d=reactionPreflight({content:'Кто на этом фото?',reply_to:'human',reply_to_is_bot:false},[]);
 assert.equal(d.action,'defer');assert.equal(d.reason,'human_exchange');
});
test('private photo preview is rejected before quota reservation or model effects',async()=>{
 let effects=0;
 const workerSecret='w'.repeat(40);
 const run=createWorker({env:k=>({SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'local-test',CH78_MAX_WORKER_SECRET:workerSecret,CH78_MAX_CHAT_ID:'-72977812571458'}[k]),fetchImpl:async()=>{effects++;throw Error('Unexpected quota or database effect');},assistantImpl:async()=>{effects++;throw Error('Unexpected model effect');}});
 const content=questions[0];
 const r=await run(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-CH78-Worker-Secret':workerSecret},body:JSON.stringify({stage:'preview_reaction',id:'e2e0388f-05d6-4802-8258-202610290001',q:content,post:{message_id:'synthetic-photo',message_ts:Date.UTC(2026,9,29),content},context:[]})}));
 assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.budget_reserved,false);assert.equal(body.result.conversation.action,'silence');assert.equal(body.result.usage.requests,0);assert.equal(effects,0);
});
