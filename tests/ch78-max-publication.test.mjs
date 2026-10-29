import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationDecision} from '../supabase/functions/ch78-max-worker/publication.mjs';
import {REACTION_PROTOCOL_VERSION,reactionInstructions} from '../supabase/functions/ch78-max-assistant/conversation.mjs';
import {createHandler,renderReply} from '../supabase/functions/ch78-max-worker/handler.mjs';
import {createHandler as assistant} from '../supabase/functions/ch78-max-assistant/handler.mjs';
const post={message_id:'anchor',message_ts:10000,content:'Друзья, кто помнит название школьного лагеря?'};
const good=()=>({found:true,mode:'reaction',answer:'В воспоминании участника назван «Маяк». [S1]',citations:['S1'],sources:[{ref:'S1',message_id:'source',message_ts:9000,author:'Вымышленный автор',text:'Лагерь назывался «Маяк».'}],conversation:{version:1,stage:'model',action:'reply',proposed_action:'reply',recipient:'group',intent:'archive_question',reason:'archive_link'},publication:{protocol_version:REACTION_PROTOCOL_VERSION,anchor_id:post.message_id,anchor_ts:post.message_ts}});
test('pilot accepts a cited group archive answer, without claiming semantic proof',()=>{
 assert.equal(publicationDecision(good(),post,[]).allowed,true);
});
test('escaping does not truncate a reaction or cut off its final qualification',()=>{
 const d=good();d.answer='&'.repeat(200)+' Это только предположение. [S1]';
 for(const compact of [false,true]){
  const text=renderReply(d,'reaction',compact);assert.ok(text.includes('Это только предположение.'));assert.ok(text.length<4000);
 }
});
for(const [name,change] of [
 ['clarification',d=>{d.conversation.action='clarify'}],
 ['defer',d=>{d.conversation.action='defer'}],
 ['silence',d=>{d.conversation.action='silence'}],
 ['person',d=>{d.conversation.recipient='person'}],
 ['keeper',d=>{d.conversation.recipient='keeper'}],
 ['unclear',d=>{d.conversation.recipient='unclear'}],
 ['story',d=>{d.conversation.intent='story'}],
 ['group decision',d=>{d.conversation.intent='group_decision'}],
 ['sensitive',d=>{d.conversation.reason='sensitive_context'}],
 ['mislabelled direct request',d=>{d.conversation.reason='direct_request'}],
 ['changed action',d=>{d.conversation.proposed_action='clarify'}],
 ['missing protocol',d=>{delete d.publication}],
 ['older protocol',d=>{d.publication.protocol_version='old'}],
 ['wrong anchor',d=>{d.publication.anchor_id='other'}],
 ['wrong anchor time',d=>{d.publication.anchor_ts++}],
 ['missing conversation',d=>{delete d.conversation}],
 ['no evidence',d=>{d.citations=[]}],
 ['unknown citation',d=>{d.citations=['S8']}],
 ['undeclared inline',d=>{d.answer+=' [S2]'}],
 ['hidden citation',d=>{d.answer='Ответ без маркера.'}],
 ['duplicate references',d=>{d.sources.push({...d.sources[0],message_id:'another'})}],
 ['duplicate messages',d=>{d.sources.push({...d.sources[0],ref:'S2'})}],
 ['duplicate citations',d=>{d.citations.push('S1')}],
 ['future evidence',d=>{d.sources[0].message_ts=10001}],
 ['same-time evidence',d=>{d.sources[0].message_ts=10000}],
 ['anchor as evidence',d=>{d.sources[0].message_id='anchor'}],
 ['empty evidence',d=>{d.sources[0].text=' '}],
 ['oversized answer',d=>{d.answer='x'.repeat(601)}],
 ['hidden direction override',d=>{d.answer+='\u202e'}],
 ['failed result',d=>{d.error='failure'}],
 ['not found',d=>{d.found=false}]
])test('publication denies '+name,()=>{const d=good();change(d);assert.equal(publicationDecision(d,post,[]).allowed,false)});
for(const content of ['Не хочу обсуждать этот рассказ.','Кто на этом фото?','Хранитель, найди рассказ.','Закуски заказать?','Не успеваю читать.'])test('post boundary outranks an apparently valid model answer: '+content,()=>{
 assert.equal(publicationDecision(good(),{...post,content},[]).allowed,false);
});
test('an actual reply to a human cannot be published despite model group label',()=>{
 assert.equal(publicationDecision(good(),{...post,reply_to:'person',reply_to_is_bot:false},[]).allowed,false);
});
const project='https://fnwpkmjjdhflnqghnogj.supabase.co',secret='w'.repeat(40);
const env=k=>({SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'test',CH78_MAX_WORKER_SECRET:secret,CH78_MAX_CHAT_ID:'-72977812571458',CH78_MAX_TOKEN:'test',CH78_MAX_WEBHOOK_SECRET:secret,OPENAI_API_KEY:'test'}[k]);
const request=stage=>new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-CH78-Worker-Secret':secret},body:JSON.stringify({stage})});
function worker({stage='generate',result=good(),review=false,gateSequence=[true,true],buttons=false,invalidContext=false}={}){
 const calls=[];let gates=0,finished=false;
 const job={id:'11111111-1111-1111-1111-111111111111',lease:'22222222-2222-2222-2222-222222222222',action:'reaction',chat_id:'-72977812571458',message_id:post.message_id,question:post.content,review_required:review,state:stage==='send'?'sending':'generating',reply_text:'UNTRUSTED LEGACY TEXT',result};
 const run=createHandler({env,assistantImpl:async()=>{calls.push({type:'model'});return Response.json(result)},fetchImpl:async(url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):{};calls.push({url,body});
  if(url.endsWith('ch78_max_claim_job'))return Response.json(finished?[]:[job]);
  if(url.endsWith('ch78_max_job_gate'))return Response.json(gateSequence[Math.min(gates++,gateSequence.length-1)]);
  if(url.endsWith('ch78_max_reaction_context_v2'))return Response.json(invalidContext?[]:[post]);
  if(url.endsWith('ch78_max_finish_job')){finished=true;return Response.json(true)}
  if(url.endsWith('ch78_max_buttons_enabled'))return Response.json(buttons);
  if(url.endsWith('/me'))return Response.json({user_id:531401311,is_bot:true});
  if(url.includes('/messages?'))return Response.json({message:{body:{mid:'sent'}}});
  throw Error('Unexpected effect');
 }});
 return {calls,run:()=>run(request(stage))};
}
test('generation admits eligible auto answer and retains review-required drafts',async()=>{
 for(const review of [false,true]){
  const x=worker({review});const r=await (await x.run()).json();assert.equal(r.state,review?'review':'ready');
  const saved=x.calls.find(c=>c.url?.endsWith('ch78_max_finish_job')).body;assert.equal(saved.p_result.publication_gate.allowed,true);
  assert.ok(!x.calls.some(c=>c.url?.includes('platform-api2')));
 }
});
test('clarification and old results are review-only even for auto jobs',async()=>{
 for(const variant of ['clarify','old']){
  const d=good();if(variant==='clarify')d.conversation.action='clarify';else delete d.publication;
  const x=worker({result:d});assert.equal((await (await x.run()).json()).state,'review');
  assert.ok(!x.calls.some(c=>c.url?.includes('platform-api2')));
 }
});
test('send blocks legacy, clarified, review-required and missing-context reactions before MAX calls',async()=>{
 const old=good();delete old.publication;
 const clarify=good();clarify.conversation.action='clarify';
 for(const opts of [{result:old},{result:clarify},{review:true},{invalidContext:true}]){
  const x=worker({stage:'send',...opts});assert.equal((await (await x.run()).json()).blocked,true);
  assert.ok(!x.calls.some(c=>c.type==='model'||c.url?.includes('platform-api2')));
 }
});
test('send renders validated evidence instead of trusting legacy reply text; never regenerates or resends',async()=>{
 for(const buttons of [false,true]){
  const x=worker({stage:'send',buttons});assert.equal((await (await x.run()).json()).state,'sent');
  const sent=x.calls.find(c=>c.url?.includes('/messages?'));assert.ok(sent.body.text.includes('Маяк'));assert.ok(!sent.body.text.includes('UNTRUSTED'));
  assert.ok(!x.calls.some(c=>c.type==='model'));await x.run();assert.equal(x.calls.filter(c=>c.url?.includes('/messages?')).length,1);
 }
});
test('disabling effects during identity lookup prevents the actual send',async()=>{
 const x=worker({stage:'send',gateSequence:[true,false]});assert.equal((await (await x.run()).json()).disabled,true);
 assert.ok(x.calls.some(c=>c.url?.endsWith('/me')));assert.ok(!x.calls.some(c=>c.url?.includes('/messages?')));
});
test('assistant sends exactly the unified instruction and stamps verified output outside model JSON',async()=>{
 let modelBody;
 const run=assistant({env,fetchImpl:async(url,opts)=>{
  if(url.startsWith(project))return Response.json([{message_id:'source',message_ts:9000,author:'Автор',content:'Лагерь назывался «Маяк».',score:1}]);
  modelBody=JSON.parse(opts.body);
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({action:'reply',recipient:'group',intent:'archive_question',reason:'archive_link',answer:'Лагерь «Маяк». [S1]',citations:['S1']})}]}]});
 }});
 const r=await run(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify({action:'reaction',q:post.content,post,context:[]})}));
 assert.equal(r.status,200);const d=await r.json();assert.equal(modelBody.instructions,reactionInstructions);
 assert.equal(JSON.parse(modelBody.input).protocol_version,REACTION_PROTOCOL_VERSION);
 assert.deepEqual(d.publication,{protocol_version:REACTION_PROTOCOL_VERSION,anchor_id:post.message_id,anchor_ts:post.message_ts});
 assert.equal(publicationDecision(d,post,[]).allowed,true);
});
