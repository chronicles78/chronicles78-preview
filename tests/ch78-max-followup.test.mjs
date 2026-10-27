import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/ch78-max-assistant/handler.mjs';
const project='https://fnwpkmjjdhflnqghnogj.supabase.co',secret='x'.repeat(40);
const env=k=>({CH78_MAX_WEBHOOK_SECRET:secret,CH78_MAX_CHAT_ID:'-72977812571458',SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'test-only',OPENAI_API_KEY:'test-only'}[k]);
for(const variant of ['verified','ambiguous','missing_seed'])test('follow-up retrieval '+variant,async()=>{
 const time=Date.UTC(2026,8,7),row=(message_id,offset,content)=>({message_id,message_ts:time+offset,content,author:'Вымышленный участник',score:1});
 const plan=row('plan',0,'Посуда ко встрече; можно заказать отдельно.'),order=row('order',3600000,'Заказала закуски.'),next=row('next',24*3600000,'Возьмите сменную обувь.'),later=row('later',5*86400000,'Другая тема.');
 let finalSources,authorReads=0;
 const run=createHandler({env,fetchImpl:async(url,opts)=>{
  const body=JSON.parse(opts.body);
  if(url==='https://api.openai.com/v1/responses'){
   const draft=body.text.format.name==='archive_queries'?{queries:['встреча сентябрь']}:{found:false,answer:'',citations:[]};
   if(body.text.format.name==='archive_answer')finalSources=JSON.parse(body.input).sources;
   return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(draft)}]}]});
  }
  if(['ch78_max_search','ch78_max_search_month'].some(n=>url.endsWith(n)))return Response.json([plan,order]);
  if(url.endsWith('ch78_max_thread_context'))return Response.json([]);
  if(url.endsWith('ch78_max_resolve_author'))return Response.json(variant==='ambiguous'?[{user_id:'42'},{user_id:'43'}]:[{user_id:'42'}]);
  if(url.endsWith('ch78_max_author_messages')){authorReads++;return Response.json(variant==='missing_seed'?[next,later]:[order,next,later]);}
  throw Error('Unexpected effect');
 }});
 const response=await run(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify({action:'answer',q:'Что участница заказала к встрече 8 сентября и что просила взять?'})}));
 assert.equal(response.status,200);assert.ok(finalSources.some(s=>s.message_id==='order'));
 assert.equal(finalSources.some(s=>s.message_id==='next'),variant==='verified');assert.equal(finalSources.some(s=>s.message_id==='later'),false);
 assert.equal(authorReads,variant==='ambiguous'?0:1);
});
function reaction(draft,rows=[]){
 const calls=[];
 const run=createHandler({env,now:()=>Date.UTC(2026,9,27),fetchImpl:async(url,opts)=>{
  const body=JSON.parse(opts.body);calls.push({url,body});
  if(url.startsWith(project))return Response.json(rows);
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(draft)}]}]});
 }});
 return {calls,run:()=>run(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify({action:'reaction',q:'Рассказ',post:{message_id:'anchor',message_ts:10000,content:'Я хочу поделиться воспоминанием.',author:'Автор'},context:[]})}))};
}
const question={action:'clarify',recipient:'group',intent:'story',reason:'memory_question',answer:'Какое место вам запомнилось?',citations:[]};
test('model defer retains candidate privately with no publishable answer',async()=>{
 const x=reaction({...question,action:'defer',recipient:'person',reason:'human_exchange'});
 const r=await (await x.run()).json();assert.equal(r.found,false);assert.equal(r.answer,'');assert.deepEqual(r.sources,[]);
 assert.equal(r.conversation.candidate.answer,question.answer);assert.equal(x.calls.filter(c=>c.url.includes('openai.com')).length,1);
});
test('historical reaction excludes future evidence and anchors time to the source post',async()=>{
 const row=(id,ts)=>({message_id:id,message_ts:ts,author:'Архивный автор',content:'Вымышленный текст',score:1});
 const x=reaction(question,[row('old',9000),row('future',10001),row('anchor',10000)]);assert.equal((await x.run()).status,200);
 const input=JSON.parse(x.calls.find(c=>c.url.includes('openai.com')).body.input);
 assert.deepEqual(input.archive_sources.map(s=>s.message_id),['old']);assert.equal(input.time_context.question_date,'1970-01-01');assert.deepEqual(input.participant_preferences,[]);
});
