import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keyboard,callbackText,COMMANDS,SITE_URL} from '../supabase/functions/ch78-max-ui/controls.mjs';
import {configureUI} from '../supabase/functions/ch78-max-ui/configure.mjs';
import {createHandler} from '../supabase/functions/ch78-max-webhook/handler.mjs';
const parent='11111111-1111-1111-1111-111111111111';
const source={ref:'S4',message_ts:1000,author:'Автор <b>имя</b>',text:'Школьный архив <script> & '.repeat(500)};
const job={id:parent,action:'answer',result:{found:true,answer:'Проверенный ответ [S4].',citations:['S4'],sources:[{...source,ref:'S1',text:'Постороннее'},source]}};
const config={CH78_MAX_INGEST_ENABLED:'true',CH78_MAX_CHAT_ID:'-72977812571458',CH78_MAX_WEBHOOK_SECRET:'s'.repeat(40),SUPABASE_URL:'https://fnwpkmjjdhflnqghnogj.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'db-test',CH78_MAX_TOKEN:'max-test'};
const response=x=>new Response(JSON.stringify(x));
function event(){return {update_type:'message_callback',timestamp:Date.now(),callback:{callback_id:'click-1',user:{user_id:123,is_bot:false},payload:'ch78:source:'+parent+':S4'},message:{recipient:{chat_id:-72977812571458},sender:{user_id:531401311,is_bot:true},body:{mid:'mid.parent'}}};}
function req(e=event(),secret=config.CH78_MAX_WEBHOOK_SECRET){return new Request('https://local.test',{method:'POST',headers:{'content-type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify(e)});}
function setup({claimed=true,wrongBot=false,sendFailure=null,saveFailure=false,effect='show',editRejected=false}={}){
 const calls=[];let consumed=false;
 const handler=createHandler({env:n=>config[n],fetchImpl:async(url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):{};calls.push({url,body,method:opts.method});
  if(url.endsWith('ch78_max_claim_callback')){if(consumed||!claimed)return response(null);consumed=true;return response({parent_id:parent,action:job.action,result:job.result,source_effect:effect,edit_mid:'mid.parent'});}
  if(url.endsWith('ch78_max_buttons_enabled'))return response(true);
  if(url.endsWith('ch78_max_finish_callback')){if(saveFailure)throw Error('PRIVATE');return response(true);}
  if(url.endsWith('/me'))return response({user_id:wrongBot?999:531401311,is_bot:true});
  if(url.includes('/answers?'))return response({success:true});
  if(url.includes('/messages?')){if(sendFailure==='network')throw Error('PRIVATE');if(sendFailure)return new Response('PRIVATE',{status:sendFailure});return opts.method==='PUT'?response({success:!editRejected}):response({message:{body:{mid:'mid.source'}}});}
  throw Error('Unexpected '+url);
 }});return {handler,calls};
}
test('keyboards expose only cited sources, with no repeated help or website links',()=>{
 const buttons=keyboard(job)[0].payload.buttons.flat();assert.ok(buttons.some(b=>b.payload==='ch78:source:'+parent+':S4'));
 assert.ok(!buttons.some(b=>b.payload?.endsWith(':S1')));assert.ok(buttons.every(b=>b.type==='callback'&&b.payload.startsWith('ch78:source:')));
 assert.equal(keyboard(job)[0].payload.buttons.flat().length,1);assert.deepEqual(keyboard(job,true),[]);assert.deepEqual(keyboard({...job,result:{found:false,sources:[]}}),[]);
 assert.deepEqual(COMMANDS.map(c=>c.name),['ask','find','help']);assert.throws(()=>keyboard({id:'arbitrary'}));
});
test('source display is escaped, bounded and refuses unrelated IDs',()=>{
 const text=callbackText('source',job,'S4');assert.ok(text.length<=4000);assert.ok(text.includes('&lt;script&gt;'));assert.ok(!text.includes('<script>'));
 assert.throws(()=>callbackText('source',job,'S1'));assert.ok(callbackText('help',job).includes('/ask'));assert.ok(callbackText('examples',job).includes('Примеры'));
});
test('callback requires webhook authentication before any reads or effects',async()=>{
 const x=setup();assert.equal((await x.handler(req(event(),'wrong'))).status,403);assert.equal(x.calls.length,0);
});
test('foreign chat, bots, stale events and malformed payloads are ignored before DB',async()=>{
 for(const change of [e=>e.message.recipient.chat_id=-99,e=>e.callback.user.is_bot=true,e=>e.timestamp=1,e=>e.callback.payload='ch78:source:'+parent+':S99',e=>e.message=null,e=>e.callback.callback_id='']){
  const e=event();change(e);const x=setup();assert.equal((await x.handler(req(e))).status,200);assert.equal(x.calls.length,0);
 }
});
test('source callback edits only the verified original answer and never posts or invokes OpenAI',async()=>{
 const x=setup();assert.equal((await (await x.handler(req())).json()).state,'done');assert.ok(x.calls[0].url.endsWith('ch78_max_claim_callback'));
 const sent=x.calls.find(c=>c.url.includes('/messages?'));assert.ok(sent.url.endsWith('message_id=mid.parent'));assert.equal(sent.method,'PUT');assert.ok(!x.calls.some(c=>c.method==='POST'&&c.url.includes('/messages?')));assert.equal(sent.body.format,'html');assert.equal(sent.body.notify,false);
 assert.ok(!x.calls.some(c=>c.url.includes('openai')));assert.ok(!x.calls.some(c=>c.url.includes('ch78_max_messages')));
});
test('duplicate delivery and a rejected claim have no repeated MAX effect',async()=>{
 const x=setup();await x.handler(req());await x.handler(req());assert.equal(x.calls.filter(c=>c.url.includes('/messages?')).length,1);
 const y=setup({claimed:false});await y.handler(req());assert.equal(y.calls.length,1);
});
test('wrong bot identity cannot publish; uncertain sends are recorded without retry',async()=>{
 const wrong=setup({wrongBot:true});await wrong.handler(req());assert.ok(!wrong.calls.some(c=>c.url.includes('/messages?')));
 for(const sendFailure of ['network',500]){
  const x=setup({sendFailure});assert.equal((await (await x.handler(req())).json()).state,'unknown');await x.handler(req());assert.equal(x.calls.filter(c=>c.url.includes('/messages?')).length,1);
 }
});
test('lost DB confirmation does not repeat a successful callback reply',async()=>{
 const x=setup({saveFailure:true});await x.handler(req());await x.handler(req());assert.equal(x.calls.filter(c=>c.url.includes('/messages?')).length,1);
});
test('configuration verifies bot, preserves subscription types and updates only commands/callbacks',async()=>{
 const calls=[],webhook=config.SUPABASE_URL+'/functions/v1/ch78-max-webhook';
 const out=await configureUI({env:n=>config[n],fetchImpl:async(url,opts)=>{
  const b=opts.body?JSON.parse(opts.body):null;calls.push({url,method:opts.method,body:b});
  if(url.endsWith('/me'))return response({user_id:531401311,is_bot:true,commands:COMMANDS});
  if(url.endsWith('/subscriptions')&&opts.method==='GET')return response({subscriptions:[{url:webhook,update_types:calls.some(c=>c.method==='POST')?['message_created','bot_added','message_callback']:['message_created','bot_added'],version:'0.1.0'}]});
  return response({success:true});
 }});
 assert.equal(out.callbacks_subscribed,true);const post=calls.find(c=>c.method==='POST');assert.deepEqual(post.body.update_types,['message_created','bot_added','message_callback']);assert.equal(post.body.url,webhook);
 assert.ok(!calls.some(c=>c.url.endsWith('/me')&&c.method!=='GET'));assert.ok(!calls.some(c=>c.url.includes('/messages')));
});

test('configuration refuses wrong bot and missing subscription before modifying MAX',async()=>{
 for(const wrong of [true,false]){
  const calls=[];await assert.rejects(configureUI({env:n=>config[n],fetchImpl:async(url,opts)=>{
   calls.push({url,method:opts.method});return url.endsWith('/me')?response({user_id:wrong?999:531401311,is_bot:true}):response({subscriptions:[]});
  }}));assert.ok(calls.every(c=>c.method==='GET'));
 }
});

test('repeated source click collapses content and restores the single source button',async()=>{
 const x=setup({effect:'hide'});assert.equal((await (await x.handler(req())).json()).state,'done');
 const edit=x.calls.find(c=>c.url.includes('/messages?'));assert.equal(edit.method,'PUT');assert.equal(edit.body.text,'Проверенный ответ.');
 assert.equal(edit.body.attachments[0].payload.buttons.flat().length,1);assert.equal(edit.body.attachments[0].payload.buttons[0][0].text,'Источники');
});
test('expanded source has a hide button, escaped bounded text, and treats HTTP 200 rejection as failed',async()=>{
 const x=setup();await x.handler(req());const edit=x.calls.find(c=>c.url.includes('/messages?'));
 assert.ok(edit.body.text.length<=4000);assert.ok(edit.body.text.includes('&lt;script&gt;'));assert.ok(!edit.body.text.includes('<script>'));
 assert.equal(edit.body.attachments[0].payload.buttons[0][0].text,'Скрыть источники');
 const y=setup({editRejected:true});assert.equal((await (await y.handler(req())).json()).state,'failed');
});
