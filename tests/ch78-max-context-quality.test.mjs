import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,rankSources,focusQueries,questionQuery} from '../supabase/functions/ch78-max-assistant/handler.mjs';
const project='https://fnwpkmjjdhflnqghnogj.supabase.co',secret='x'.repeat(40);
const env=k=>({CH78_MAX_WEBHOOK_SECRET:secret,CH78_MAX_CHAT_ID:'-72977812571458',SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'local-only',OPENAI_API_KEY:'local-only'}[k]);
const row=(id,content,author='Вымышленный автор')=>({message_id:id,message_ts:Date.UTC(2026,8,10),author,content,score:1});
const completion=d=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(d)}]}]});
function setup({authors=[],rows=[],draft={found:false,answer:'Непроверенный текст не должен выводиться',citations:[]},plan={queries:['пение встреча 8 сентября 2026']}}={}){
 const calls=[];
 const run=createHandler({env,fetchImpl:async(url,opts)=>{
  const body=JSON.parse(opts.body);calls.push({url,body});
  if(url.endsWith('ch78_max_resolve_author'))return Response.json(authors);
  if(url.endsWith('ch78_max_thread_context'))return Response.json([]);
  if(url.startsWith(project))return Response.json(rows);
  return completion(body.text.format.name==='archive_queries'?plan:draft);
 }});
 return {calls,run:async q=>(await run(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify({action:'answer',q})}))).json()};
}
test('singing-only stem collision is excluded rather than merely demoted',()=>{
 const q='Кто пел на встрече 8 сентября 2026 года?',focus=focusQueries(q);
 const falseHit=row('false','Петя пошёл в первый класс.'),real=row('real','Встретились, спели, вспомнили школу.');
 assert.deepEqual(rankSources([[focus[0],[falseHit,real]]],focus,q).map(s=>s.message_id),['real']);
});
test('a stem collision independently found by another query remains available as context',()=>{
 const q='Кто пел на встрече?',focus=focusQueries(q),context=row('context','Петя предложил встречу в клубе.');
 assert.deepEqual(rankSources([[focus[0],[context]],['другой запрос',[context]]],focus,q).map(s=>s.message_id),['context']);
});
test('a mixed query may supply useful context even when it mentions singing',()=>{
 const context=row('choir','Школьный ансамбль выступал на площади.');
 assert.deepEqual(rankSources([['"пела" OR "ансамбль"',[context]]],[],'Что известно об ансамбле?').map(s=>s.message_id),['choir']);
});
test('singing lane keeps grammatical forms and rejects the collision in month retrieval too',()=>{
 const q='Кто пел на встрече?',focus=focusQueries(q);
 const rows=['Хор пело всё село.','Занимались пением.','Говорили о пении.','Мы поём вместе.','Песня пелась хором.'].map((text,i)=>row('form-'+i,text));
 assert.equal(rankSources([[focus[0],rows]],focus,q).length,rows.length);
 assert.deepEqual(rankSources([['month:'+focus[0],[row('false','Петя пошёл в школу.')]]],['month:'+focus[0]],q),[]);
});
test('dated answer queries do not retrieve calendar numbers as standalone topic alternatives',async()=>{
 const x=setup({rows:[row('actual','Встретились и спели.')]});
 await x.run('Кто пел на встрече 8 сентября 2026 года?');
 const queries=x.calls.filter(c=>/ch78_max_search(?:_month)?$/.test(c.url)).map(c=>c.body.p_query);
 assert.ok(queries.length>0);assert.ok(queries.every(q=>!/(?:"8"|"2026"|"сентября"|"года")/.test(q)),queries.join('\n'));
 assert.ok(queries.some(q=>q.includes('"пел"')));
 assert.ok(x.calls.some(c=>c.url.endsWith('ch78_max_search_month')&&c.body.p_month===9&&c.body.p_year===2026));
});
test('recent author refusal states the bounded text subset without surfacing uncited model text',async()=>{
 const x=setup({authors:[{user_id:'42',author:'Николай Тестовый'}],rows:Array.from({length:8},(_,i)=>row('item-'+i,'Вымышленная тема.','Николай Тестовый'))});
 const r=await x.run('Как называлось судно, о котором Николай Тестовый рассказывал в последних постах?');
 assert.equal(r.found,false);assert.match(r.answer,/Николай Тестовый/);assert.match(r.answer,/8/);assert.match(r.answer,/последн/);assert.match(r.answer,/вложени/);assert.ok(!r.answer.includes('Непроверенный'));
 assert.equal(x.calls.filter(c=>c.url.includes('openai.com')).length,1);
});
test('dated author refusal does not call the selected period latest posts',async()=>{
 const x=setup({authors:[{user_id:'42',author:'Николай Тестовый'}],rows:[row('dated','Вымышленная тема.','Николай Тестовый')]});
 const r=await x.run('О чём Николай Тестовый писал в сентябре 2026?');
 assert.equal(r.found,false);assert.match(r.answer,/указанный период/);assert.ok(!/последн/.test(r.answer));
});
test('cited partial answer is retained without being replaced by a generic refusal',async()=>{
 const x=setup({rows:[row('order','Закуски заказаны, о посуде пока спрашиваем.')],draft:{found:false,answer:'Заказаны закуски; подтверждения посуды в подборке нет [S1].',citations:['S1']}});
 const r=await x.run('Что заказали к встрече 8 сентября?');assert.equal(r.partial,true);assert.match(r.answer,/подтверждения посуды/);
});
test('an undated numerical topic retains its numbers and names',async()=>{
 const x=setup({rows:[row('class','Вспоминали школу 78 и 1983 год.')],plan:{queries:['школа 78 1983']}});
 await x.run('Что вспоминали о школе 78 в 1983 году?');
 assert.ok(x.calls.some(c=>c.url.endsWith('ch78_max_search')&&c.body.p_query===questionQuery('Что вспоминали о школе 78 в 1983 году?')));
});
test('date-only questions retain their calendar search when no subject remains',async()=>{
 const x=setup({plan:{queries:['8 сентября 2026']}});await x.run('Что было 8 сентября 2026 года?');
 assert.ok(x.calls.some(c=>c.url.endsWith('ch78_max_search')&&c.body.p_query===questionQuery('Что было 8 сентября 2026 года?')));
});
test('school number in a dated topical question is preserved',async()=>{
 const x=setup({plan:{queries:['школа 78 сентябрь 2026']}});await x.run('Какие песни пели в школе 78 в сентябре 2026 года?');
 const queries=x.calls.filter(c=>/ch78_max_search(?:_month)?$/.test(c.url)).map(c=>c.body.p_query);
 assert.ok(queries.some(q=>q.includes('"78"')));assert.ok(queries.every(q=>!q.includes('"2026"')));
});
