import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/ch78-max-assistant/handler.mjs';
const project='https://fnwpkmjjdhflnqghnogj.supabase.co',secret='x'.repeat(40);
const env=k=>({CH78_MAX_WEBHOOK_SECRET:secret,CH78_MAX_CHAT_ID:'-72977812571458',SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'test-only',OPENAI_API_KEY:'test-only'}[k]);
function setup(authors,rows=[]){
 const calls=[];
 const run=createHandler({env,fetchImpl:async(url,opts)=>{
  const body=JSON.parse(opts.body);calls.push({url,body});
  if(url.endsWith('ch78_max_resolve_author'))return Response.json(authors);
  if(url.endsWith('ch78_max_author_messages'))return Response.json(rows);
  if(url.endsWith('ch78_max_thread_context'))return Response.json([]);
  if(url==='https://api.openai.com/v1/responses')return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({found:true,answer:'Последние темы подтверждены источником [S1].',citations:['S1']})}]}]});
  throw Error('Unexpected effect '+url);
 }});
 return {calls,run:q=>run(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify({action:'answer',q})}))};
}
test('same first name asks for identity before fetching posts or calling a model',async()=>{
 const x=setup([{user_id:'42',author:'Павел Первый'},{user_id:'43',author:'Павел Второй'}]);
 const r=await (await x.run('О чём Павел рассказывал в последних постах?')).json();
 assert.equal(r.found,false);assert.equal(r.retrieval,'author_ambiguity');assert.match(r.answer,/Павел Первый/);assert.match(r.answer,/Павел Второй/);
 assert.equal(r.usage.requests,0);assert.equal(x.calls.length,1);assert.deepEqual(r.sources,[]);
});
test('full identity uses chronological author records and one answer call without keyword planning',async()=>{
 const rows=Array.from({length:8},(_,i)=>({message_id:'fiction-'+i,message_ts:10000-i,author:'Павел Первый',content:'Вымышленная тема '+i,score:1}));
 const x=setup([{user_id:'42',author:'Павел Первый'}],rows);
 const r=await (await x.run('О чём Павел Первый рассказывал в последних постах?')).json();assert.equal(r.found,true);
 assert.equal(x.calls.find(c=>c.url.endsWith('ch78_max_author_messages')).body.p_user_id,'42');
 const models=x.calls.filter(c=>c.url.includes('openai.com'));assert.equal(models.length,1);
 assert.equal(models[0].body.text.format.name,'archive_answer');
 const input=JSON.parse(models[0].body.input);assert.equal(input.retrieval_context.kind,'author_recent');
 assert.deepEqual(input.sources.map(s=>s.message_id),rows.map(s=>s.message_id));
 assert.ok(!x.calls.some(c=>c.url.endsWith('ch78_max_search')));
});
