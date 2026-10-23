import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,validateAnswer,validatedQueries,outputJSON,questionQuery,readTokenUsage,samaraDate} from '../supabase/functions/ch78-max-assistant/handler.mjs';
const secret='s'.repeat(40),PROJECT_URL='https://fnwpkmjjdhflnqghnogj.supabase.co';
const config={SUPABASE_URL:PROJECT_URL,SUPABASE_SERVICE_ROLE_KEY:'db-test-key',CH78_MAX_WEBHOOK_SECRET:secret,CH78_MAX_CHAT_ID:'-78143291213122',OPENAI_API_KEY:'model-test-key'};
const row={message_id:'fiction-1',message_ts:1000,author:'Тестовый автор',content:'На школьной дискотеке танцевали под музыку.',score:0.1};
const res=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const model=data=>res({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}]});
function setup({rows=[row],plan={queries:['дискотека','танцы']},draft={found:true,answer:'Вспоминали танцы на школьной дискотеке [S1].',citations:['S1']},overrides={},failure=null,now=()=>Date.now()}={}){
 const calls=[];let modelCalls=0;
 return {calls,handler:createHandler({env:n=>({...config,...overrides})[n],now,fetchImpl:async(url,opts)=>{
   calls.push({url,body:JSON.parse(opts.body),headers:opts.headers});
   if(failure)return new Response('PRIVATE_ERROR_DETAIL',{status:failure});
   if(url.startsWith(PROJECT_URL))return res(rows);
   modelCalls++;return model(modelCalls===1?plan:draft);
 }})};
}
function req(body={action:'search',q:'дискотека'},headers={}){
 return new Request('https://local.test',{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret,...headers},body:JSON.stringify(body)});
}
test('unauthorized, empty query and wrong chat config cannot reach data/model',async()=>{
 let {handler,calls}=setup();assert.equal((await handler(req(undefined,{'X-Max-Bot-Api-Secret':'bad'}))).status,403);
 assert.equal((await handler(req({action:'search',q:''}))).status,400);assert.equal(calls.length,0);
 ({handler,calls}=setup({overrides:{CH78_MAX_CHAT_ID:'junk-123junk'}}));assert.equal((await handler(req())).status,503);assert.equal(calls.length,0);
});
test('search returns actual sources, never calls OpenAI and ignores body-supplied group',async()=>{
 const {handler,calls}=setup();const result=await (await handler(req({action:'search',q:'дискотека',chat_id:'-other'}))).json();
 assert.equal(calls.length,1);assert.equal(calls[0].body.p_chat_id,config.CH78_MAX_CHAT_ID);
 assert.equal(result.sources[0].message_id,row.message_id);assert.equal(result.sources[0].ref,'S1');
 assert.ok(!JSON.stringify(result).includes('db-test-key'));assert.ok(!JSON.stringify(result).includes('model-test-key'));
});
test('no lexical matches returns no arbitrary top ten',async()=>{
 const {handler}=setup({rows:[]});const result=await (await handler(req())).json();assert.equal(result.found,false);assert.deepEqual(result.sources,[]);
});
test('answer plans bounded queries, deduplicates sources and cites real source',async()=>{
 const {handler,calls}=setup();const response=await handler(req({action:'answer',q:'Что вспоминали о школьных танцах?'}));
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.found,true);assert.equal(result.sources.length,1);assert.deepEqual(result.citations,['S1']);
 assert.equal(calls.filter(c=>c.url==='https://api.openai.com/v1/responses').length,2);
 for(const call of calls.filter(c=>c.url.includes('openai.com'))){assert.equal(call.body.store,false);assert.equal(call.body.text.format.strict,true);assert.equal(call.body.model,'gpt-5-mini');}
});
test('answer with no sources does not call the answer generator',async()=>{
 const {handler,calls}=setup({rows:[]});const result=await (await handler(req({action:'answer',q:'Неизвестная тема'}))).json();
 assert.equal(result.found,false);assert.deepEqual(result.sources,[]);assert.equal(calls.filter(c=>c.url.includes('openai.com')).length,1);
});
test('model can reject irrelevant/test-only sources without invented response',async()=>{
 const {handler}=setup({draft:{found:false,answer:'Fabricated text must not be surfaced',citations:[]}});
 const result=await (await handler(req({action:'answer',q:'танцы'}))).json();assert.equal(result.found,false);assert.ok(!result.answer.includes('Fabricated'));
});
test('citation validator rejects nonexistent, missing and mismatched inline references',()=>{
 for(const draft of [{found:true,answer:'Текст [S99]',citations:['S1']},{found:true,answer:'Текст [S1]',citations:[]},{found:true,answer:'Текст [S1]',citations:['S99']}])assert.throws(()=>validateAnswer(draft,[{ref:'S1'}]));
});
test('malformed plan, incomplete model output and refusals are not treated as answers',()=>{
 for(const plan of [{queries:[]},{queries:['good; DROP TABLE']},{queries:['a','b','c','d']}])assert.throws(()=>validatedQueries(plan));
 assert.throws(()=>outputJSON({status:'incomplete',output:[]}));
 assert.throws(()=>outputJSON({status:'completed',output:[{content:[{type:'refusal'}]}]}));
});
test('upstream errors are sanitized; missing key does not trigger a model call',async()=>{
 for(const status of [403,429,500]){const {handler}=setup({failure:status});const r=await handler(req());assert.equal(r.status,503);assert.ok(!(await r.text()).includes('PRIVATE_ERROR'));}
 const {handler,calls}=setup({overrides:{OPENAI_API_KEY:''}});assert.equal((await handler(req({action:'answer',q:'танцы'}))).status,503);assert.equal(calls.length,0);
});
test('request and source budgets are enforced',async()=>{
 const {handler}=setup();assert.equal((await handler(req({action:'search',q:'x'.repeat(9000)}))).status,413);
 const items=Array.from({length:8},(_,i)=>({...row,message_id:String(i),content:'a'.repeat(12000)}));
 const h=setup({rows:items}).handler;const result=await (await h(req())).json();
 assert.ok(result.sources.reduce((n,s)=>n+s.text.length,0)<=20000);assert.ok(result.sources.every(s=>s.truncated));
});

test('configured models retain their name without an incompatible forced reasoning option',async()=>{
 const {handler,calls}=setup({overrides:{STORY_ASSISTANT_MODEL:'gpt-4.1-mini'}});
 assert.equal((await handler(req({action:'answer',q:'танцы'}))).status,200);
 for(const call of calls.filter(c=>c.url.includes('openai.com'))){assert.equal(call.body.model,'gpt-4.1-mini');assert.equal(call.body.reasoning,undefined);}
});
test('model HTTP failures carry only allowlisted diagnostics, never raw provider details',async()=>{
 for(const [status,expected] of [[400,'model_parameters'],[401,'model_key_rejected'],[403,'model_access_denied'],[404,'model_not_found'],[429,'model_limit'],[500,'model_unavailable']]){
  const handler=createHandler({env:n=>config[n],fetchImpl:async()=>new Response(JSON.stringify({error:{message:'PRIVATE model-test-key',code:'unsupported_parameter',param:'reasoning.effort'}}),{status})});
  const r=await handler(req({action:'answer',q:'танцы'})),result=await r.json();
  assert.equal(result.error,expected);assert.deepEqual(result.diagnostic,{http_status:status,code:'unsupported_parameter',param:'reasoning.effort'});assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }
 const handler=createHandler({env:n=>config[n],fetchImpl:async()=>new Response(JSON.stringify({error:{code:'PRIVATE',param:'PRIVATE'}}),{status:400})});
 const result=await (await handler(req({action:'answer',q:'танцы'}))).json();assert.equal(result.diagnostic.code,'other');assert.equal(result.diagnostic.param,'other');
});

test('original question retrieval survives over-specific zero-hit plans',async()=>{
 const calls=[];
 const handler=createHandler({env:n=>config[n],fetchImpl:async(url,opts)=>{
  const body=JSON.parse(opts.body);calls.push({url,body});
  if(url.startsWith(PROJECT_URL))return res(body.p_query===questionQuery('Какой певческий опыт был у Аллы?')?[row]:[]);
  return body.text.format.name==='archive_queries'?model({queries:['редкое сочетание отсутствующее']}):model({found:true,answer:'В источнике есть ответ [S1].',citations:['S1']});
 }});
 const result=await (await handler(req({action:'answer',q:'Какой певческий опыт был у Аллы?',mode:'literal'}))).json();
 assert.equal(result.found,true);assert.equal(result.sources[0].message_id,row.message_id);
 assert.ok(calls.filter(c=>c.url.startsWith(PROJECT_URL)).every(c=>c.body.p_mode==='forms'));
});
test('quoted names and punctuated planner keywords are safe OR terms',()=>{
 assert.deepEqual(validatedQueries({queries:['«Танин Шанхай»','Алла, хоровой ансамбль']}),['"Танин" OR "Шанхай"','"Алла" OR "хоровой" OR "ансамбль"']);
 assert.ok(questionQuery('слово '.repeat(150)).length<=300);
 assert.ok(!questionQuery('" OR; DROP TABLE').includes(';'));
});
test('invalid or incomplete planning falls back once without a paid planner retry',async()=>{
 for(const bad of [{status:'completed',output:[{content:[{type:'output_text',text:'not JSON'}]}]},{status:'completed',output:[{content:[{type:'output_text',text:'{"queries":[]}'}]}]},{status:'incomplete',output:[]}]){
  let count=0,searchCount=0;
  const handler=createHandler({env:n=>config[n],fetchImpl:async(url)=>{
   if(url.startsWith(PROJECT_URL)){searchCount++;return res([row])}
   count++;return count===1?res(bad):model({found:true,answer:'Ответ [S1]',citations:['S1']});
  }});
  const result=await (await handler(req({action:'answer',q:'Алла'}))).json();
  assert.equal(result.found,true);assert.equal(count,2);assert.equal(searchCount,1);
 }
});

test('known model-declared citations are rendered when inline markers are absent',()=>{
 const result=validateAnswer({found:true,answer:'Факт из архива.',citations:['S1']},[{ref:'S1'}]);
 assert.equal(result.answer,'Факт из архива.\n\nИсточники: [S1]');assert.deepEqual(result.citations,['S1']);
});
test('grouped markers normalize; unknown, ambiguous and undeclared IDs still fail',()=>{
 const sources=[{ref:'S1'},{ref:'S2'}];
 assert.equal(validateAnswer({found:true,answer:'Факт [S1, S2]',citations:['S1','S2']},sources).answer,'Факт [S1] [S2]');
 for(const answer of ['Факт [S1, S99]','Факт [S1–S2]','Факт [S2]']){
  assert.throws(()=>validateAnswer({found:true,answer,citations:['S1']},sources));
 }
 assert.throws(()=>validateAnswer({found:true,answer:'Факт',citations:[]},sources));
});

const tokenUsage={input_tokens:100,output_tokens:20,total_tokens:120,input_tokens_details:{cached_tokens:40},output_tokens_details:{reasoning_tokens:5}};
test('token parser validates totals and treats absent details as unknown',()=>{
 assert.deepEqual(readTokenUsage(tokenUsage),{input_tokens:100,output_tokens:20,total_tokens:120,cached_input_tokens:40,reasoning_tokens:5});
 for(const bad of [null,{...tokenUsage,total_tokens:121},{...tokenUsage,input_tokens:-1}])assert.equal(readTokenUsage(bad),null);
 assert.equal(readTokenUsage({...tokenUsage,input_tokens_details:{cached_tokens:500}}).cached_input_tokens,null);
});
test('ordinary search records zero model calls without unknown consumption',async()=>{
 const {handler}=setup();const data=await (await handler(req())).json();
 assert.equal(data.usage.requests,0);assert.equal(data.usage.complete,true);assert.equal(data.usage.total_tokens,0);
});
function usageSetup({missing=false,secondFailure=false,incomplete=false}={}){
 let count=0;
 const handler=createHandler({env:n=>config[n],fetchImpl:async(url,opts)=>{
  if(url.startsWith(PROJECT_URL))return res([row]);count++;
  if(count===2&&secondFailure)throw Error('PRIVATE key');
  const payload=count===1?{queries:['дискотека']}:{found:true,answer:'Факт [S1]',citations:['S1']};
  return res({status:count===2&&incomplete?'incomplete':'completed',model:'gpt-5-mini',...(missing?{}:{usage:tokenUsage}),output:[{content:[{type:'output_text',text:JSON.stringify(payload)}]}]});
 }});
 return {handler,count:()=>count};
}
test('two reported calls are summed once with cached/reasoning subsets separate',async()=>{
 const x=usageSetup();const data=await (await x.handler(req({action:'answer',q:'дискотека'}))).json();
 assert.equal(data.usage.requests,2);assert.equal(data.usage.reported_requests,2);assert.equal(data.usage.complete,true);
 assert.equal(data.usage.input_tokens,200);assert.equal(data.usage.output_tokens,40);assert.equal(data.usage.total_tokens,240);
 assert.equal(data.usage.cached_input_tokens,80);assert.equal(data.usage.reasoning_tokens,10);
 assert.deepEqual(data.usage.reports.map(r=>r.phase),['archive_queries','archive_answer']);assert.equal(x.count(),2);
});
test('missing provider usage is unknown rather than falsely zero',async()=>{
 const x=usageSetup({missing:true});const data=await (await x.handler(req({action:'answer',q:'дискотека'}))).json();
 assert.equal(data.usage.requests,2);assert.equal(data.usage.reported_requests,0);assert.equal(data.usage.complete,false);assert.equal(data.usage.total_tokens,null);
});
test('network failure preserves known first-call usage without retrying',async()=>{
 const x=usageSetup({secondFailure:true});const r=await x.handler(req({action:'answer',q:'дискотека'})),data=await r.json();
 assert.equal(r.status,503);assert.equal(data.usage.requests,2);assert.equal(data.usage.reported_requests,1);assert.equal(data.usage.complete,false);
 assert.equal(data.usage.total_tokens,null);assert.equal(data.usage.reports[0].total_tokens,120);assert.equal(x.count(),2);assert.ok(!JSON.stringify(data).includes('PRIVATE'));
});
test('incomplete final output still carries provider-reported usage',async()=>{
 const x=usageSetup({incomplete:true});const data=await (await x.handler(req({action:'answer',q:'дискотека'}))).json();
 assert.equal(data.error,'model_incomplete');assert.equal(data.usage.total_tokens,240);assert.equal(data.usage.complete,true);
});


test('Samara source dates cross UTC midnight correctly and reject invalid timestamps',()=>{
 assert.equal(samaraDate(Date.parse('2026-09-08T21:30:00Z')),'2026-09-09 01:30');
 assert.equal(samaraDate(Date.parse('2026-09-08T20:00:00Z')),'2026-09-09 00:00');
 assert.throws(()=>samaraDate(9000000000000000));
});
test('both model phases get the same trusted question date, not a body override',async()=>{
 const fixed=Date.parse('2026-10-23T21:10:00Z');
 const x=setup({now:()=>fixed,rows:[{...row,message_ts:Date.parse('2026-09-08T21:30:00Z')}]});
 const r=await x.handler(req({action:'answer',q:'Когда мы встречались этой осенью?',time_context:{question_date:'1999-01-01'}}));
 assert.equal(r.status,200);
 const calls=x.calls.filter(c=>c.url.includes('openai.com'));assert.equal(calls.length,2);
 for(const c of calls){const input=JSON.parse(c.body.input);assert.deepEqual(input.time_context,{question_date:'2026-10-24',time_zone:'Europe/Samara'});}
 const input=JSON.parse(calls[1].body.input);assert.equal(input.sources[0].posted_at,'2026-09-09 01:30');
 assert.equal(input.sources[0].message_ts,Date.parse('2026-09-08T21:30:00Z'));
 assert.ok(calls[1].body.instructions.includes('дата публикации, не дата описанного события'));
 assert.ok(calls[1].body.instructions.includes('бронирование'));
 assert.ok(!calls[0].body.instructions.includes('Алла'));
});
test('invalid archive dates cannot reach the answer generator',async()=>{
 const x=setup({rows:[{...row,message_ts:9000000000000000}]});
 const r=await x.handler(req({action:'answer',q:'Когда встречались?'}));assert.equal(r.status,503);
 assert.equal((await r.json()).error,'archive_invalid');assert.equal(x.calls.filter(c=>c.url.includes('openai.com')).length,1);
});
test('ordinary search adds readable publication dates without model calls',async()=>{
 const x=setup();const r=await (await x.handler(req())).json();assert.equal(r.sources[0].posted_at,samaraDate(row.message_ts));
 assert.equal(r.sources[0].time_zone,'Europe/Samara');assert.equal(r.usage.requests,0);
});
