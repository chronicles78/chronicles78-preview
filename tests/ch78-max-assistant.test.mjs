import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,validateAnswer,validatedQueries,outputJSON} from '../supabase/functions/ch78-max-assistant/handler.mjs';
const secret='s'.repeat(40),PROJECT_URL='https://fnwpkmjjdhflnqghnogj.supabase.co';
const config={SUPABASE_URL:PROJECT_URL,SUPABASE_SERVICE_ROLE_KEY:'db-test-key',CH78_MAX_WEBHOOK_SECRET:secret,CH78_MAX_CHAT_ID:'-78143291213122',OPENAI_API_KEY:'model-test-key'};
const row={message_id:'fiction-1',message_ts:1000,author:'Тестовый автор',content:'На школьной дискотеке танцевали под музыку.',score:0.1};
const res=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const model=data=>res({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}]});
function setup({rows=[row],plan={queries:['дискотека','танцы']},draft={found:true,answer:'Вспоминали танцы на школьной дискотеке [S1].',citations:['S1']},overrides={},failure=null}={}){
 const calls=[];let modelCalls=0;
 return {calls,handler:createHandler({env:n=>({...config,...overrides})[n],fetchImpl:async(url,opts)=>{
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
 for(const draft of [{found:true,answer:'Текст [S99]',citations:['S1']},{found:true,answer:'Текст',citations:['S1']},{found:true,answer:'Текст [S1]',citations:[]},{found:true,answer:'Текст [S1]',citations:['S99']}])assert.throws(()=>validateAnswer(draft,[{ref:'S1'}]));
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
