import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateLaunch} from '../supabase/functions/ch78-max-miniapp/auth.mjs';
import {createHandler} from '../supabase/functions/ch78-max-miniapp/handler.mjs';
const token='PRIVATE_MAX_TOKEN',now=1792782000000,uid=17770818,origin='https://chronicles78.github.io';
function signed({user={id:uid,first_name:'Игорь + тест'},date=now/1000,extra={}}={}){
 const fields={auth_date:String(date),query_id:'fixture-query',user:JSON.stringify(user),...extra};
 const line=Object.keys(fields).sort().map(k=>k+'='+fields[k]).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 const hash=createHmac('sha256',secret).update(line).digest('hex');
 return Object.entries({...fields,hash}).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
}
const requestId='11111111-1111-4111-8111-111111111111',lease='22222222-2222-4222-8222-222222222222';
const source={ref:'S4',author:'Тест',text:'Сообщение <script>PRIVATE</script>',message_ts:1000};
const answer={found:true,answer:'Факт [S4]',citations:['S4'],sources:[{...source,ref:'S1',text:'Не процитировано'},source]};
function req(body={},options={}){return new Request('https://local.test',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...options.headers},body:JSON.stringify({action:'answer',q:'Вопрос',request_id:requestId,init_data:signed(),...body})});}
function setup({enabled=true,member=true,wrongBot=false,claim=null,modelError=false,save=false,network=false,realAssistant=false}={}){
 const calls=[],stored=new Map();let models=0;
 const env=n=>({CH78_MAX_TOKEN:token,SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_DB',CH78_MAX_WEBHOOK_SECRET:'x'.repeat(40),SUPABASE_URL:'https://fnwpkmjjdhflnqghnogj.supabase.co',CH78_MAX_CHAT_ID:'-78143291213122'})[n];
 const handler=createHandler({env,now:()=>now,assistantImpl:realAssistant?null:async r=>{models++;calls.push({model:await r.json()});if(modelError)throw Error('PRIVATE_ERROR');return Response.json(answer);},fetchImpl:async(url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):{};calls.push({url,body});if(network)throw Error('PRIVATE_NETWORK');
  if(url.endsWith('ch78_max_miniapp_status'))return Response.json({enabled,ai_enabled:true,messages:394,ai_daily_limit:5});
  if(url.endsWith('/me'))return Response.json({user_id:wrongBot?99:531401311,is_bot:true});
  if(url.includes('/members?user_ids='))return Response.json({members:member?[{user_id:uid,is_bot:false}]:[]});
  if(url.endsWith('ch78_max_miniapp_claim')){if(claim)return Response.json(claim);if(stored.has(body.p_id))return Response.json(stored.get(body.p_id));stored.set(body.p_id,{kind:'processing'});return Response.json({kind:'claimed',lease});}
  if(url.endsWith('ch78_max_search'))return Response.json([{message_id:'mid.fixture',message_ts:1000,author:'Тест',content:'Архивный текст',score:1}]);
  if(url.endsWith('ch78_max_miniapp_finish')){if(save)throw Error('PRIVATE_SAVE');stored.set(body.p_id,{kind:body.p_ok?'done':'failed',result:body.p_result});return Response.json(true);}
  throw Error('unexpected');
 }});return {handler,calls,get models(){return models}};
}
test('valid MAX HMAC matches independently generated Node signature; plus and Unicode preserved',async()=>{
 assert.deepEqual(await validateLaunch(signed(),token,now),{userId:String(uid)});
});
test('tampering, duplicate fields/hash, missing hash and malformed escapes are rejected',async()=>{
 for(const raw of [signed().replace('fixture-query','forged'),signed()+'&hash='+ 'a'.repeat(64),signed()+'&user=x',signed().replace(/hash=[^&]+/,''),'user=%zz&hash='+'a'.repeat(64)])await assert.rejects(validateLaunch(raw,token,now));
});
test('expired, future, bots, unsafe numbers and wrong token fail closed',async()=>{
 for(const raw of [signed({date:now/1000-3601}),signed({date:now/1000+31}),signed({user:{id:uid,is_bot:true}}),signed({user:{id:9007199254740992}}),signed({user:{id:-1}})])await assert.rejects(validateLaunch(raw,token,now));
 await assert.rejects(validateLaunch(signed(),'another-token',now));
});
test('CORS and preflight expose no wildcard, archive or model effects',async()=>{
 const s=setup();assert.equal((await s.handler(req({},{headers:{Origin:'https://evil.example'}}))).status,403);
 const pre=await s.handler(new Request('https://local.test',{method:'OPTIONS',headers:{Origin:origin}}));assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(s.calls.length,0);
});
test('invalid signature or body causes no database, MAX or model access',async()=>{
 const s=setup();assert.equal((await s.handler(req({init_data:'forged'}))).status,401);
 assert.equal((await s.handler(req({q:'x'.repeat(301)}))).status,400);assert.equal(s.calls.length,0);assert.equal(s.models,0);
});
test('disabled config does not contact MAX; nonmember and wrong bot cannot read archives',async()=>{
 for(const options of [{enabled:false},{member:false},{wrongBot:true}]){const s=setup(options);const r=await s.handler(req());assert.ok([403,503].includes(r.status));assert.equal(s.models,0);assert.ok(!s.calls.some(c=>c.url?.endsWith('ch78_max_miniapp_claim')));if(options.enabled===false)assert.equal(s.calls.length,1);}
});
test('current membership overrides forged launch chat and caller user_id',async()=>{
 const s=setup();const r=await s.handler(req({user_id:99,chat_id:'-99',init_data:signed({extra:{chat:'{"id":-99,"type":"CHAT"}'}})}));assert.equal(r.status,200);
 assert.ok(s.calls.some(c=>c.url?.includes('/chats/-78143291213122/members?user_ids='+uid)));
 assert.equal(s.calls.find(c=>c.url?.endsWith('ch78_max_miniapp_claim')).body.p_user_id,String(uid));
});
test('answers return only cited sources; no attachment URL or uncited candidate leaks',async()=>{
 const s=setup();const d=await (await s.handler(req())).json();assert.equal(d.state,'done');assert.deepEqual(d.result.sources,[{...source,truncated:false}]);assert.equal(s.models,1);
 assert.ok(s.calls.filter(c=>c.url?.startsWith('https://platform-api2')).every(c=>!c.url.includes('/messages')));
});
test('duplicate completed request returns saved answer without another model call',async()=>{
 const s=setup();await s.handler(req());await s.handler(req());assert.equal(s.models,1);assert.equal(s.calls.filter(c=>c.url?.includes('/members?')).length,2);
});
test('processing, unknown, rate limits and conflict never run a model',async()=>{
 for(const kind of ['processing','unknown','rate_limit','daily_limit','conflict','ai_disabled']){const s=setup({claim:{kind}});const d=await (await s.handler(req())).json();assert.ok(d.state===kind||d.error===kind);assert.equal(s.models,0);}
});
test('model error is saved once; neither internal error nor secret is reflected',async()=>{
 const s=setup({modelError:true});const r=await s.handler(req()),text=await r.text();assert.ok(!text.includes('PRIVATE'));assert.equal(JSON.parse(text).state,'failed');await s.handler(req());assert.equal(s.models,1);
});
test('database or persistence uncertainty does not repeat model work',async()=>{
 const offline=setup({network:true});assert.equal((await offline.handler(req())).status,503);assert.equal(offline.models,0);
 const save=setup({save:true});assert.equal((await save.handler(req())).status,503);assert.equal(save.models,1);await save.handler(req());assert.equal(save.models,1);
});
test('status returns archive metadata only after live membership; no assistant calls',async()=>{
 const s=setup();const r=await s.handler(req({action:'status'}));assert.deepEqual(await r.json(),{messages:394,test_archive:true,ai_enabled:true,ai_daily_limit:5});assert.equal(s.models,0);assert.equal(r.headers.get('Cache-Control'),'no-store');
});

test('real search path retrieves sources without any OpenAI call',async()=>{
 const s=setup({realAssistant:true});const r=await s.handler(req({action:'search',q:'архив'}));const d=await r.json();
 assert.equal(d.state,'done');assert.equal(d.result.sources[0].text,'Архивный текст');
 assert.ok(!s.calls.some(c=>c.url?.includes('api.openai.com')));
});
