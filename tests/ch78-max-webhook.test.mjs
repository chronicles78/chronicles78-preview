import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, PROJECT_URL, MAX_BYTES } from '../supabase/functions/ch78-max-webhook/handler.mjs';
const secret = 's'.repeat(40), key = 'synthetic-service-key';
const config = { CH78_MAX_INGEST_ENABLED: 'true', CH78_MAX_WEBHOOK_SECRET: secret,
  CH78_MAX_CHAT_ID: '-72977812571458', SUPABASE_URL: PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY: key };
const update = () => ({update_type:'message_created',timestamp:1000,message:{
  recipient:{chat_id:-72977812571458,chat_type:'chat'},timestamp:900,
  sender:{user_id:42,name:'Вымышленный автор'},body:{mid:'synthetic-mid',text:'Вымышленный текст',attachments:[]}}});
const req = (data=update(), headers={}, method='POST') => new Request('https://local.test/webhook',{
  method,headers:{'content-type':'application/json','X-Max-Bot-Api-Secret':secret,...headers},
  ...(method==='POST'?{body:typeof data==='string'?data:JSON.stringify(data)}:{})});
function setup(overrides={},transport=async()=>new Response(null,{status:201})) {
  const calls=[];const values={...config,...overrides};
  return {calls,handler:createHandler({env:name=>values[name],fetchImpl:async(url,options)=>{
    calls.push({url,options});return transport(url,options);
  }})};
}
test('rejects GET without reading or returning archive', async()=>{
  const {handler,calls}=setup();assert.equal((await handler(req(null,{},'GET'))).status,405);assert.equal(calls.length,0);
});
test('disabled by default; missing required config fails closed', async()=>{
  for(const overrides of [{CH78_MAX_INGEST_ENABLED:''},{CH78_MAX_WEBHOOK_SECRET:''},{CH78_MAX_CHAT_ID:''},
    {CH78_MAX_CHAT_ID:'9007199254740993'},{SUPABASE_SERVICE_ROLE_KEY:''},{SUPABASE_URL:'https://other.supabase.co'}]){
    const {handler,calls}=setup(overrides);assert.equal((await handler(req())).status,503);assert.equal(calls.length,0);
  }
});
test('wrong or absent secret cannot cause any database call',async()=>{
  const {handler,calls}=setup();
  for(const value of ['', 'wrong', 'x'.repeat(300)])assert.equal((await handler(req(update(),{'X-Max-Bot-Api-Secret':value}))).status,403);
  assert.equal(calls.length,0);
});
test('rejects malformed JSON, invalid UTF-8, content type and excessive body',async()=>{
  const {handler,calls}=setup();
  assert.equal((await handler(req('{'))).status,400);
  assert.equal((await handler(req(update(),{'content-type':'text/plain'}))).status,415);
  assert.equal((await handler(req('x'.repeat(MAX_BYTES+1)))).status,413);
  assert.equal((await handler(req('{}',{'content-length':String(MAX_BYTES+1)}))).status,413);
  const r=new Request('https://local.test',{method:'POST',headers:{'content-type':'application/json','X-Max-Bot-Api-Secret':secret},body:new Uint8Array([255,254])});
  assert.equal((await handler(r)).status,400);assert.equal(calls.length,0);
});
test('ignores other groups, edits, removal and non-message events',async()=>{
  const {handler,calls}=setup();const other=update();other.message.recipient.chat_id=-99;
  for(const data of [other,{update_type:'message_edited'},{update_type:'message_removed'},{update_type:'bot_started'}]){
    const res=await handler(req(data));assert.equal(res.status,200);assert.equal((await res.json()).ignored,true);
  }
  assert.equal(calls.length,0);
});
test('validates message identifiers, timestamps and structure',async()=>{
  const mutations=[u=>delete u.message.body.mid,u=>u.message.body.mid='',u=>u.message.timestamp=-1,
    u=>u.timestamp='1000',u=>u.message.recipient.chat_id=9007199254740992,
    u=>u.message.body.text={},u=>u.message.body.text='a\0b',u=>u.message.body.attachments={},
    u=>u.message.sender=[],u=>u.message.link='bad'];
  for(const mutate of mutations){const u=update();mutate(u);const {handler,calls}=setup();
    assert.equal((await handler(req(u))).status,400);assert.equal(calls.length,0);}
});
test('persists metadata, source, Cyrillic and attachment-only messages without downloading files',async()=>{
  const {handler,calls}=setup();const u=update();delete u.message.body.text;
  u.message.body.attachments=[{type:'image',payload:{url:'https://do-not-download.invalid/private'}}];
  assert.equal((await handler(req(u))).status,200);
  assert.equal(calls.length,1);assert.equal(calls[0].url,PROJECT_URL+'/rest/v1/ch78_max_messages?on_conflict=chat_id,message_id');
  const saved=JSON.parse(calls[0].options.body);assert.equal(saved.text,'');assert.deepEqual(saved.source_message,u.message);
  assert.equal(saved.sender.name,'Вымышленный автор');assert.equal(saved.attachments.length,1);
  assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
  assert.equal(calls[0].options.headers.Authorization,'Bearer '+key);
});
test('does not acknowledge before commit; failures request retry without leaking error body',async()=>{
  let release;const waiting=new Promise(resolve=>release=resolve);
  const {handler}=setup({},async()=>{await waiting;return new Response(null,{status:201});});
  let done=false;const pending=handler(req()).then(r=>{done=true;return r});
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(done,false);release();assert.equal((await pending).status,200);
  for(const transport of [async()=>new Response('PRIVATE_DATABASE_DETAILS',{status:500}),async()=>{throw new Error('PRIVATE_DATABASE_DETAILS')}]){
    const {handler}=setup({},transport);const r=await handler(req());assert.equal(r.status,503);
    const text=await r.text();assert.ok(!text.includes('PRIVATE'));assert.ok(!text.includes(key));assert.ok(!text.includes(secret));
  }
});

test('forward-only messages with null body retain source and have stable explicitly synthetic identity', async()=>{
  const {handler,calls}=setup();const u=update();u.message.body=null;
  u.message.link={type:'forward',message:{mid:'linked-source'}};
  assert.equal((await handler(req(u))).status,200);
  const reversed={message:u.message,timestamp:u.timestamp,update_type:u.update_type};
  reversed.message={body:null,link:u.message.link,sender:u.message.sender,timestamp:u.message.timestamp,recipient:u.message.recipient};
  assert.equal((await handler(req(reversed))).status,200);
  const a=JSON.parse(calls[0].options.body),b=JSON.parse(calls[1].options.body);
  assert.match(a.message_id,/^forward-only:[a-f0-9]{64}$/);assert.equal(a.message_id,b.message_id);
  assert.equal(a.source_message.body,null);assert.equal(a.text,'');
});

test('retired discovery outside target chat has no effect',async()=>{
 const {handler,calls}=setup();const e=update();e.message.recipient.chat_id=-12345;e.message.body.text='Хранитель, проверка подключения.';
 assert.equal((await (await handler(req(e))).json()).ignored,true);assert.equal(calls.length,0);
});
