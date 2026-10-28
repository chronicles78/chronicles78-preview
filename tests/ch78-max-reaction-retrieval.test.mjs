import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,questionQuery} from '../supabase/functions/ch78-max-assistant/handler.mjs';
import {checkedDecision} from '../supabase/functions/ch78-max-assistant/conversation.mjs';
const project='https://fnwpkmjjdhflnqghnogj.supabase.co',secret='s'.repeat(40),now=Date.UTC(2026,9,28);
const env=k=>({SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'local-only',CH78_MAX_WEBHOOK_SECRET:secret,CH78_MAX_CHAT_ID:'-72977812571458',OPENAI_API_KEY:'local-only'}[k]);
const row=(id,text,ts=now-1000)=>({message_id:id,message_ts:ts,author:'Вымышленный участник',content:text,score:1});
const draft=extra=>({action:'reply',recipient:'group',intent:'archive_question',reason:'archive_link',answer:'Подтверждённая часть [S1].',citations:['S1'],...extra});
function setup({lookup=()=>[],decision=draft(),context=[],post={},failure=false}={}){
 const calls=[];let input;
 const run=createHandler({env,fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body});
  if(url.startsWith(project))return failure?new Response('unavailable',{status:503}):Response.json(lookup(body,url));
  input=JSON.parse(body.input);
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(decision)}]}]});
 }});
 return {calls,get input(){return input},run:async q=>{
  const response=await run(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify({action:'reaction',q,post:{message_id:'control',message_ts:now,content:q,...post},context})}));
  return {status:response.status,data:await response.json()};
 }};
}
test('narrow order lane recovers the short fact missed by a noisy original query',async()=>{
 const q='Друзья, что заказали к встрече 8 сентября 2026 года?',target=row('short-order','Заказали закуски на десятерых.'),noise=Array.from({length:8},(_,i)=>row('noise-'+i,'Другие школьные воспоминания.'));
 const x=setup({lookup:b=>b.p_query==='"заказали"'?[target]:noise});
 const r=await x.run(q);assert.equal(r.status,200);assert.ok(x.input.archive_sources.some(s=>s.message_id===target.message_id));
 const models=x.calls.filter(c=>c.url.includes('openai.com'));assert.equal(models.length,1);assert.equal(models[0].body.text.format.name,'archive_reaction');
 assert.ok(x.calls.filter(c=>c.url.startsWith(project)).length<=6);
 assert.ok(x.calls.some(c=>c.body.p_query===questionQuery(q)));
});
test('quoted title is searched as a phrase and its short source is retained',async()=>{
 const q='Кто пел песню «Старый маяк»?',target=row('song','Олег исполнял песню «Старый маяк».'),noise=Array.from({length:8},(_,i)=>row('noise-'+i,'Пели другие песни.'));
 const x=setup({lookup:b=>b.p_query==='"Старый маяк"'?[target]:noise});
 await x.run(q);assert.equal(x.input.archive_sources[0].message_id,'song');assert.ok(x.calls.some(c=>c.body.p_query==='"Старый маяк"'));
});
test('future high-rank matches and anchor are excluded before fusion and reservation',async()=>{
 const q='Кто пел «Старый маяк»?',old=row('old','Пели песню.'),future=row('future','Пели песню.',now+1),anchor=row('control','Пели песню.',now);
 const x=setup({lookup:()=>[future,anchor,old]});await x.run(q);
 assert.deepEqual(x.input.archive_sources.map(s=>s.message_id),['old']);
});
test('month candidates are supplementary and cannot erase an older announcement',async()=>{
 const q='Кто пел на встрече 8 сентября 2026 года?',announcement=row('announcement','Встречу планировали, предлагали спеть.',Date.UTC(2026,7,28)),recap=row('recap','Встретились, спели.',Date.UTC(2026,8,9));
 const x=setup({lookup:(_,url)=>url.endsWith('ch78_max_search_month')?[recap]:[announcement]});await x.run(q);
 assert.ok(x.calls.some(c=>c.url.endsWith('ch78_max_search_month')));assert.ok(x.input.archive_sources.some(s=>s.message_id==='announcement'));assert.ok(x.input.archive_sources.some(s=>s.message_id==='recap'));
});
test('group archive reply is not suppressed solely by direct_request with valid citations',async()=>{
 const x=setup({lookup:()=>[row('proof','Вымышленное подтверждение.')],decision:draft({reason:'direct_request'})});
 const r=await x.run('Друзья, напомните старое название?');assert.equal(r.status,200);assert.equal(r.data.found,true);assert.equal(r.data.conversation.action,'reply');assert.equal(r.data.conversation.proposed_action,'reply');
});
test('the group exception does not open uncited replies or direct keeper requests',()=>{
 assert.equal(checkedDecision(draft({reason:'direct_request',citations:[]})).action,'silence');
 assert.equal(checkedDecision(draft({reason:'direct_request',recipient:'keeper'})).action,'silence');
 assert.equal(checkedDecision(draft({reason:'direct_request',intent:'story'})).action,'silence');
 assert.equal(checkedDecision(draft({reason:'direct_request',action:'silence'})).action,'silence');
});
test('unknown citations still fail after allowing a group archive request',async()=>{
 const x=setup({lookup:()=>[row('proof','Текст.')],decision:draft({reason:'direct_request',answer:'Подтверждение [S99].',citations:['S99']})});
 assert.equal((await x.run('Друзья, напомните событие?')).status,502);
});
test('diagnostics retain the proposed action when a hard boundary overrides it',()=>{
 const d=checkedDecision(draft({intent:'group_decision',reason:'group_consent'}));assert.equal(d.action,'silence');assert.equal(d.proposed_action,'reply');
 assert.equal(checkedDecision(draft({recipient:'person',reason:'human_exchange'})).action,'defer');
});
test('quote syntax is normalized into bounded data and cannot inject operators',async()=>{
 const q='Кто помнит «маяк; DROP TABLE --» и "1983 год"?',x=setup({decision:draft({action:'silence',reason:'no_added_value',answer:'',citations:[]})});
 await x.run(q);const searches=x.calls.filter(c=>c.url.startsWith(project));assert.ok(searches.length<=6);
 assert.ok(searches.every(c=>c.body.p_query.length<=300&&!/[;\n]/.test(c.body.p_query)));assert.ok(searches.some(c=>c.body.p_query==='"1983 год"'));
});
for(const [name,q,post,context] of [
 ['command','Хранитель, найди историю.',{},[]],
 ['consent','Закуски заказываю?',{},[]],
 ['correction','Эта история не про обиду.',{},[]],
 ['declined','Не хочу обсуждать этот рассказ.',{},[]],
 ['pace','Не успеваю читать.',{},[]],
 ['human','Вот подробности.',{reply_to:'human',reply_to_is_bot:false,reply_to_user_id:'42'},[]]
])test('preflight '+name+' performs no retrieval or model effect',async()=>{
 const x=setup({post,context});const r=await x.run(q);assert.equal(r.status,200);assert.equal(r.data.found,false);assert.equal(x.calls.length,0);
});
test('a retrieval failure aborts before the model with no retry',async()=>{
 const x=setup({failure:true});const r=await x.run('Кто пел «Старый маяк»?');assert.equal(r.status,503);assert.ok(!x.calls.some(c=>c.url.includes('openai.com')));
});
