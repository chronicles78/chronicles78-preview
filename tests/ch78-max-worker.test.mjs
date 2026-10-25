import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,renderReply} from '../supabase/functions/ch78-max-worker/handler.mjs';
const secret='w'.repeat(40),PROJECT='https://fnwpkmjjdhflnqghnogj.supabase.co';
const config={CH78_MAX_WORKER_SECRET:secret,SUPABASE_URL:PROJECT,SUPABASE_SERVICE_ROLE_KEY:'db-secret',CH78_MAX_CHAT_ID:'-78143291213122',CH78_MAX_TOKEN:'max-secret'};
const job={id:'11111111-1111-1111-1111-111111111111',lease:'22222222-2222-2222-2222-222222222222',chat_id:config.CH78_MAX_CHAT_ID,message_id:'mid.command',action:'answer',question:'Вопрос',state:'generating',reply_text:'Сохранённый ответ'};
const data={found:true,answer:'Подтверждено [S1]',citations:['S1'],sources:[{ref:'S1',message_ts:1000,author:'Тест',text:'Тестовый источник'}]};
const response=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
function req(stage='generate',headers={}){return new Request('https://local.test',{method:'POST',headers:{'Content-Type':'application/json','X-CH78-Worker-Secret':secret,...headers},body:JSON.stringify({stage})});}
function setup({overrides={},gate=true,empty=false,badJob={},sendFailure=null,modelFailure=null,saveFailure=false,wrongBot=false,usage=null,assistantData=null,buttons=false}={}){
 const calls=[];let done=false;
 return {calls,handler:createHandler({env:n=>({...config,...overrides})[n],assistantImpl:async r=>{
  calls.push({type:'model',body:await r.json()});if(modelFailure==='network')throw Error('PRIVATE');
  return modelFailure?new Response(JSON.stringify({error:modelFailure,message:'PRIVATE',...(usage?{usage}:{})}),{status:503}):response({...data,...(assistantData??{}),...(usage?{usage}:{})});
 },fetchImpl:async(url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):{};calls.push({type:'fetch',url,body,headers:opts.headers});
  if(url.endsWith('ch78_max_claim_job'))return response(empty||done?[]:[{...job,state:body.p_stage==='send'?'sending':'generating',...badJob}]);
  if(url.endsWith('ch78_max_reaction_context'))return response([{message_id:job.message_id,message_ts:1000,content:'Воспоминание о школе',author:'Тест'}]);
  if(url.endsWith('ch78_max_typing_gate'))return response(false);
  if(url.endsWith('ch78_max_buttons_enabled'))return response(buttons);
  if(url.endsWith('ch78_max_job_gate'))return response(gate);
  if(url.endsWith('ch78_max_finish_job')){if(saveFailure)throw Error('PRIVATE');done=true;return response(true);}
  if(url==='https://platform-api2.max.ru/me')return response({user_id:wrongBot?99:531401311,is_bot:true});
  if(url.startsWith('https://platform-api2.max.ru/')){
   if(sendFailure==='network')throw Error('PRIVATE');if(sendFailure==='bad_json')return new Response('bad');
   if(sendFailure)return new Response('PRIVATE',{status:sendFailure});return response({message:{body:{mid:'mid.sent'}}});
  }throw Error('unexpected request');
 }})};
}
test('worker requires dedicated secret and valid configuration before all effects',async()=>{
 const {handler,calls}=setup();assert.equal((await handler(req('generate',{'X-CH78-Worker-Secret':'bad'}))).status,403);assert.equal(calls.length,0);
 const missing=setup({overrides:{CH78_MAX_WORKER_SECRET:''}});assert.equal((await missing.handler(req())).status,503);assert.equal(missing.calls.length,0);
});
test('invalid request and empty queue cannot trigger model or MAX',async()=>{
 const x=setup({empty:true});assert.equal((await x.handler(req('other'))).status,400);assert.equal(x.calls.length,0);
 assert.deepEqual(await (await x.handler(req())).json(),{ok:true,idle:true});assert.equal(x.calls.length,1);
 const large=new Request('https://local.test',{method:'POST',headers:{'Content-Type':'application/json','X-CH78-Worker-Secret':secret},body:'x'.repeat(8193)});
 assert.equal((await x.handler(large)).status,400);
});
test('generation persists answer and sources, never sends a MAX message',async()=>{
 const x=setup();assert.deepEqual(await (await x.handler(req())).json(),{ok:true,state:'ready'});
 const saved=x.calls.find(c=>c.body?.p_state==='ready');assert.equal(saved.body.p_result.sources[0].text,'Тестовый источник');assert.ok(saved.body.p_reply.includes('[S1]'));
 assert.equal(x.calls.filter(c=>c.type==='model').length,1);assert.ok(!x.calls.some(c=>c.url?.includes('platform-api2')));
});
test('send uses stored text, reply link, fixed group and header token; never regenerates',async()=>{
 const x=setup();assert.deepEqual(await (await x.handler(req('send'))).json(),{ok:true,state:'sent'});
 const sent=x.calls.find(c=>c.url?.includes('/messages?'));assert.equal(sent.body.text,job.reply_text);assert.equal(sent.headers.Authorization,'max-secret');
 assert.deepEqual(sent.body.link,{type:'reply',mid:'mid.command'});assert.equal(sent.body.notify,false);assert.equal(sent.body.format,undefined);
 assert.ok(!sent.url.includes('max-secret'));assert.ok(sent.url.includes('chat_id=-78143291213122'));
 assert.ok(!x.calls.some(c=>c.type==='model'));assert.equal(x.calls.find(c=>c.body?.p_state==='sent').body.p_sent_id,'mid.sent');
 assert.equal((await (await x.handler(req('send'))).json()).idle,true);
});
test('missing MAX token, wrong group or closed gate prevents all external effects',async()=>{
 for(const opts of [{overrides:{CH78_MAX_TOKEN:''}},{badJob:{chat_id:'-other'}},{gate:false}]){
  const x=setup(opts);await x.handler(req('send'));assert.ok(!x.calls.some(c=>c.type==='model'||c.url?.includes('platform-api2')));
 }
});
test('ambiguous send is parked as unknown with no retry',async()=>{
 for(const sendFailure of ['network','bad_json',500]){
  const x=setup({sendFailure});const r=await x.handler(req('send'));assert.equal((await r.json()).state,'delivery_unknown');
  await x.handler(req('send'));assert.equal(x.calls.filter(c=>c.url?.includes('/messages?')).length,1);
  assert.equal(x.calls.find(c=>c.body?.p_state==='delivery_unknown').body.p_error,sendFailure===500?'max_rejected':'delivery_uncertain');
 }
});
test('known provider rejection is failed without raw error data',async()=>{
 const x=setup({sendFailure:403});const text=await (await x.handler(req('send'))).text();assert.ok(!text.includes('PRIVATE'));assert.equal(JSON.parse(text).state,'failed');
});
test('model error prepares an honest notice and never retries a paid request',async()=>{
 for(const modelFailure of ['network','model_limit']){
  const x=setup({modelFailure});const r=await x.handler(req());assert.equal((await r.json()).state,'ready');
  await x.handler(req());assert.equal(x.calls.filter(c=>c.type==='model').length,1);assert.ok(!x.calls.some(c=>c.url?.includes('platform-api2')));
  const saved=x.calls.find(c=>c.body?.p_state==='ready');assert.ok(saved.body.p_reply.includes('/find'));assert.ok(!saved.body.p_reply.includes('PRIVATE'));assert.ok(saved.body.p_result.error);
 }
});
test('loss of database confirmation after send does not cause another send',async()=>{
 const x=setup({saveFailure:true});const r=await x.handler(req('send'));assert.equal(r.status,503);assert.equal(x.calls.filter(c=>c.url?.includes('/messages?')).length,1);
});
test('reply bounds, source markers and no-evidence display are preserved',()=>{
 const sources=Array.from({length:8},(_,i)=>({ref:'S'+(i+1),message_ts:1000,author:'А'.repeat(100),text:'б'.repeat(5000)}));
 assert.ok(Array.from(renderReply({...data,answer:'я'.repeat(5000),sources},'answer')).length<=4000);
 assert.ok(Array.from(renderReply({sources},'search')).length<=4000);
 const no=renderReply({...data,found:false,answer:'Нет сведений'},'answer');assert.ok(no.includes('Нет сведений'));assert.ok(!no.includes('Тестовый источник'));
 assert.throws(()=>renderReply({...data,sources:[{...data.sources[0],ref:'S99'}]},'answer'));
});

test('token of a different bot cannot send a message',async()=>{
 const x=setup({wrongBot:true});const r=await x.handler(req('send'));assert.equal((await r.json()).state,'failed');
 assert.ok(!x.calls.some(c=>c.url?.includes('/messages?')));assert.equal(x.calls.find(c=>c.body?.p_state==='failed').body.p_error,'max_identity');
});

test('answer displays only cited sources, excluding unrelated search candidates',()=>{
 const extra={ref:'S4',message_ts:2000,author:'Другой автор',text:'Постороннее обсуждение сайта'};
 const result={...data,sources:[...data.sources,extra]};
 const text=renderReply(result,'answer');
 assert.ok(text.includes('[S1]'));assert.ok(text.includes('Тестовый источник'));
 assert.ok(!text.includes('[S4]'));assert.ok(!text.includes(extra.text));
 const search=renderReply(result,'search');assert.ok(search.includes('[S4]'));assert.ok(search.includes(extra.text));
});
test('cited source IDs are preserved and unresolved citations cannot be published',()=>{
 const fourth={ref:'S4',message_ts:2000,author:'Тест',text:'Подтверждение'};
 const result={...data,answer:'Факт [S4]',citations:['S4'],sources:[data.sources[0],fourth]};
 const text=renderReply(result,'answer');assert.ok(text.includes('[S4]'));assert.ok(!text.includes('[S1]'));
 assert.throws(()=>renderReply({...result,citations:['S8']},'answer'));
 assert.throws(()=>renderReply({...result,citations:[]},'answer'));
});

test('usage is saved for successful answers and error notices, without raw error details',async()=>{
 const usage={version:1,requests:2,reported_requests:1,complete:false,total_tokens:null,reports:[{input_tokens:100,output_tokens:20,total_tokens:120}]};
 for(const modelFailure of [null,'model_limit']){
  const x=setup({usage,modelFailure});await x.handler(req());
  const saved=x.calls.find(c=>c.body?.p_state==='ready');
  assert.deepEqual(saved.body.p_result.usage,usage);assert.ok(!JSON.stringify(saved.body.p_result).includes('PRIVATE'));
 }
});


test('HTML reply escapes model, author and archive text instead of executing markup',()=>{
 const x={...data,answer:'<b>Факт</b> & [S1]',sources:[{...data.sources[0],author:'<a href="max://user/1">Автор</a>',text:'<script>alert(1)</script> & «цитата»'}]};
 const html=renderReply(x,'answer');assert.ok(html.startsWith('<b>Ответ по архиву</b>'));
 assert.ok(html.includes('&lt;b&gt;Факт&lt;/b&gt; &amp; [S1]'));assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<a href='));assert.ok(html.includes('<blockquote>'));
 assert.ok(html.includes('Даты сообщений — по Самаре'));
});
test('escaping-heavy eight-source replies stay within raw MAX size with balanced markup',()=>{
 const sources=Array.from({length:8},(_,i)=>({ref:'S'+(i+1),message_ts:1000,author:'<&😀'.repeat(100),text:'&<😀>'.repeat(2000)}));
 for(const action of ['answer','search']){
  const html=renderReply({...data,answer:'<&😀>'.repeat(2000),citations:sources.map(s=>s.ref),sources},action);
  assert.ok(html.length<=4000);assert.equal((html.match(/<blockquote>/g)||[]).length,8);
  assert.equal((html.match(/<\/blockquote>/g)||[]).length,8);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(html));
  for(const s of sources)assert.ok(html.includes('['+s.ref+']'));
 }
});
test('format is persisted with new generated answers and sent only for marked jobs',async()=>{
 const generation=setup();await generation.handler(req());
 assert.equal(generation.calls.find(c=>c.body?.p_state==='ready').body.p_result.reply_format,'html');
 const formatted=setup({badJob:{result:{reply_format:'html'}}});await formatted.handler(req('send'));
 assert.equal(formatted.calls.find(c=>c.url?.includes('/messages?')).body.format,'html');
 for(const result of [null,{kind:'help'},{reply_format:'markdown'}]){
  const legacy=setup({badJob:{result}});await legacy.handler(req('send'));
  assert.equal(legacy.calls.find(c=>c.url?.includes('/messages?')).body.format,undefined);
 }
});
test('a single cited excerpt gets room for a readable quote without unrelated sources',()=>{
 const x={...data,sources:[{...data.sources[0],text:'Рассказ '.repeat(100)}]};
 const html=renderReply(x,'answer');assert.ok(html.includes('Рассказ '.repeat(20)));assert.ok(html.includes('…</blockquote>'));
 const no=renderReply({...x,found:false},'answer');assert.ok(!no.includes('<blockquote>'));assert.ok(!no.includes('<b>Источники</b>'));
});

test('reaction drafts persist for review and do not send; silence becomes skipped',async()=>{
 for(const found of [true,false]){
  const x=setup({badJob:{action:'reaction',review_required:true},assistantData:{found,answer:found?'А кто ещё помнит школьный двор?':'',citations:[],sources:[]}});
  const r=await x.handler(req());assert.equal((await r.json()).state,found?'review':'skipped');
  const saved=x.calls.find(c=>c.body?.p_state===(found?'review':'skipped'));assert.ok(saved);
  assert.ok(!x.calls.some(c=>c.url?.includes('platform-api2')));assert.equal(x.calls.filter(c=>c.type==='model').length,1);
  const input=x.calls.find(c=>c.type==='model').body;assert.equal(input.post.message_id,job.message_id);assert.ok(Array.isArray(input.context));
 }
});
test('automatic reaction prepares one ready reply; errors stay silent instead of posting failure notices',async()=>{
 const x=setup({badJob:{action:'reaction',review_required:false},assistantData:{found:true,answer:'Кто помнит эту школьную встречу?',citations:[],sources:[]}});
 assert.equal((await (await x.handler(req())).json()).state,'ready');
 for(const modelFailure of ['network','model_limit']){
  const y=setup({badJob:{action:'reaction',review_required:false},modelFailure});assert.equal((await (await y.handler(req())).json()).state,'failed');
  assert.ok(!y.calls.some(c=>c.body?.p_state==='ready'));assert.equal(y.calls.filter(c=>c.type==='model').length,1);
 }
});

test('enabled buttons show one source control and compact answer without generation',async()=>{
 const x=setup({buttons:true,badJob:{result:{...data,reply_format:'html'}}});await x.handler(req('send'));
 const sent=x.calls.find(c=>c.url?.includes('/messages?'));assert.equal(sent.body.attachments[0].type,'inline_keyboard');
 const all=sent.body.attachments[0].payload.buttons.flat();assert.equal(all.length,1);assert.equal(all[0].text,'Источники');
 assert.equal(sent.body.text,'Подтверждено');assert.ok(!sent.body.text.includes('Тестовый источник'));
 assert.equal(data.sources[0].text,'Тестовый источник');
 assert.ok(!x.calls.some(c=>c.type==='model'));
});

test('UI configuration stage keeps dedicated secret protection and does not claim archive jobs',async()=>{
 const x=setup();const r=await x.handler(req('configure_ui',{'X-CH78-Worker-Secret':'wrong'}));assert.equal(r.status,403);assert.equal(x.calls.length,0);
});

test('only answer generation checks typing; searches, drafts and send never start it',async()=>{
 for(const [action,stage] of [['answer','generate'],['search','generate'],['reaction','generate'],['answer','send']]){
  const x=setup({badJob:{action,review_required:true},assistantData:action==='reaction'?{found:false,answer:'',citations:[],sources:[]}:null});
  assert.equal((await x.handler(req(stage))).status,200);
  assert.equal(x.calls.filter(c=>c.url?.endsWith('ch78_max_typing_gate')).length,action==='answer'&&stage==='generate'?1:0);
  assert.equal(x.calls.filter(c=>c.url?.endsWith('/actions')).length,0);
 }
});

test('compact formatting retains citation validation, escaping and full fallback evidence',()=>{
 assert.equal(renderReply({...data,answer:'<b>Факт</b> [S1].'},'answer',true),'&lt;b&gt;Факт&lt;/b&gt;.');
 assert.equal(renderReply(data,'search',true),'Найдено сообщений: 1.');
 assert.throws(()=>renderReply({...data,citations:['S8']},'answer',true));
 assert.ok(renderReply(data,'answer').includes('Тестовый источник'));
});
