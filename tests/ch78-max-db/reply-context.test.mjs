import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler as worker} from '../../supabase/functions/ch78-max-worker/handler.mjs';
import {reactionPreflight,validConversationInput} from '../../supabase/functions/ch78-max-assistant/conversation.mjs';
const db=new PGlite(),chat='-72977812571458',stamp=100000000;
const oldSQL=await readFile(new URL('../../ops/ch78-max-reaction-context-v1-baseline.sql',import.meta.url),'utf8');
const newSQL=await readFile(new URL('../../supabase/migrations/20261027173833_ch78_max_reaction_reply_context_v2.sql',import.meta.url),'utf8');
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create table public.ch78_max_messages(chat_id text,message_id text,message_ts bigint,text text,sender jsonb,linked_message jsonb,primary key(chat_id,message_id));
  create table public.ch78_max_bot_config(id boolean,chat_id text);
  create table public.ch78_max_jobs(chat_id text,message_id text,action text);
  insert into public.ch78_max_bot_config values(true,'${chat}');
  create function public.ch78_max_parse_address(text) returns text language sql as $$ select case when $1 like '/ask%' then 'command' else null end $$;
  grant select on all tables in schema public to service_role;
  alter table public.ch78_max_messages enable row level security;
  create policy service_read on public.ch78_max_messages for select to service_role using(true);`);
 await db.exec(oldSQL);
 await db.exec('revoke all on function public.ch78_max_reaction_context(text) from public,anon,authenticated;grant execute on function public.ch78_max_reaction_context(text) to service_role;');
 await db.exec(newSQL);
});
after(()=>db.close());
const sender=(name='Адресат',is_bot=false,user_id=42)=>({name,is_bot,user_id});
async function insert(id,ts,text,who,link=null,group=chat){await db.query('insert into ch78_max_messages values($1,$2,$3,$4,$5,$6)',[group,id,ts,text,JSON.stringify(who),link&&JSON.stringify(link)]);}
async function fixture({type='reply',mid='target',group=chat,target=true,targetChat=chat,targetTime=stamp-1000,targetSender=sender(),linkOverrides={}}={}){
 await db.exec('delete from ch78_max_jobs;delete from ch78_max_messages;');
 if(target)await insert('target',targetTime,'Предыдущая реплика',targetSender,null,targetChat);
 await insert('anchor',stamp,'Мне запомнилось другое.',sender('Автор',false,11),{type,chat_id:group,message:{mid},...linkOverrides});
 return (await db.query('select * from ch78_max_reaction_context_v2($1)',['anchor'])).rows;
}
test('exact MAX reply shape retains target ID, verified author and user identity',async()=>{
 const rows=await fixture();const p=rows[0];assert.equal(p.message_id,'anchor');
 assert.equal(p.reply_to,'target');assert.equal(p.reply_to_author,'Адресат');assert.equal(p.reply_to_is_bot,false);assert.equal(p.reply_to_user_id,'42');
 const old=(await db.query('select * from ch78_max_reaction_context($1)',['anchor'])).rows;
 assert.deepEqual(rows.map(({reply_to,reply_to_author,reply_to_is_bot,reply_to_user_id,...rest})=>rest),old);
});
test('older human target remains known without extending the six-hour text context',async()=>{
 const rows=await fixture({targetTime:stamp-7*3600000});assert.equal(rows.length,1);
 assert.equal(rows[0].reply_to_author,'Адресат');assert.equal(rows[0].reply_to_is_bot,false);
 assert.equal(reactionPreflight(rows[0],[]).action,'defer');
});
test('forwarded messages and explicit foreign-chat references do not become reply links',async()=>{
 for(const options of [{type:'forward'},{group:'-99'}]){
  const [p]=await fixture(options);assert.equal(p.reply_to,null);assert.equal(p.reply_to_author,null);assert.equal(p.reply_to_is_bot,null);
 }
});
test('same target ID in another group cannot supply an author or identity',async()=>{
 const [p]=await fixture({targetChat:'-99'});assert.equal(p.reply_to,'target');assert.equal(p.reply_to_author,null);assert.equal(p.reply_to_is_bot,null);
 assert.equal(reactionPreflight(p,[]).action,'silence');
});
test('missing and future targets retain only the pointer, never future personal metadata',async()=>{
 for(const options of [{target:false},{targetTime:stamp+1000}]){
  const [p]=await fixture(options);assert.equal(p.reply_to,'target');assert.equal(p.reply_to_author,null);assert.equal(p.reply_to_user_id,null);
  assert.equal(reactionPreflight(p,[]).reason,'unclear_addressee');
 }
});
test('malformed, oversized and self-referential IDs are ignored',async()=>{
 for(const mid of [42,'','x'.repeat(513),'anchor'])assert.equal((await fixture({mid}))[0].reply_to,null);
});
test('known Keeper, another bot and unknown sender are distinct',async()=>{
 const [keeper]=await fixture({targetSender:sender('Хранитель',true,531401311)});
 assert.equal(reactionPreflight(keeper,[]),null);
 const [other]=await fixture({targetSender:sender('Другой бот',true,99)});
 assert.equal(reactionPreflight(other,[]).action,'silence');
 const [unknown]=await fixture({targetSender:{name:'Неустановленный'}});
 assert.equal(reactionPreflight(unknown,[]).action,'silence');
});
test('private context is executable by service role and inaccessible to public roles',async()=>{
 await fixture();
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  try{await assert.rejects(db.query('select * from public.ch78_max_reaction_context_v2($1)',['anchor']),/permission denied/);}finally{await db.exec('reset role');}
 }
 await db.exec('set role service_role');
 try{assert.equal((await db.query('select * from public.ch78_max_reaction_context_v2($1)',['anchor'])).rows[0].reply_to,'target');}finally{await db.exec('reset role');}
 const row=(await db.query("select prosecdef,proconfig from pg_proc where proname='ch78_max_reaction_context_v2'")).rows[0];
 assert.equal(row.prosecdef,false);assert.ok(row.proconfig.includes('search_path=""'));
});
test('reply metadata is bounded and typed before network/model effects',()=>{
 const base={message_id:'anchor',message_ts:stamp,content:'Текст',reply_to:'target'};
 assert.equal(validConversationInput({...base,reply_to_author:'Имя',reply_to_is_bot:false,reply_to_user_id:'42'},[]),true);
 for(const bad of [{reply_to_author:'x'.repeat(301)},{reply_to_is_bot:'false'},{reply_to_user_id:42},{reply_to_user_id:'-42'},{reply_to:''}])assert.equal(validConversationInput({...base,...bad},[]),false);
});
test('PostgreSQL character bounds and JavaScript bounds agree for text with emoji',async()=>{
 await fixture();
 await insert('emoji-context',stamp-500,'а'.repeat(499)+'😀',sender('Участник'));
 const rows=(await db.query('select * from ch78_max_reaction_context_v2($1)',['anchor'])).rows;
 const context=rows.find(r=>r.message_id==='emoji-context');assert.equal(context.content.length,501);
 assert.equal(Array.from(context.content).length,500);
 assert.equal(validConversationInput(rows[0],rows.slice(1)),true);
 assert.equal(validConversationInput({...rows[0],content:'😀'.repeat(4000)},[]),true);
 assert.equal(validConversationInput({...rows[0],content:'😀'.repeat(4001)},[]),false);
 assert.equal(validConversationInput(rows[0],[{...context,content:context.content+'а'}]),false);
 const x=await replay(rows);assert.equal(x.response.state,'skipped');assert.equal(x.saved[0].p_result.usage.requests,0);
});

async function replay(rows,{missingRPC=false}={}){
 const project='https://fnwpkmjjdhflnqghnogj.supabase.co',secret='w'.repeat(40),calls=[],saved=[];
 const env=k=>({CH78_MAX_WORKER_SECRET:secret,CH78_MAX_WEBHOOK_SECRET:secret,CH78_MAX_CHAT_ID:chat,SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'test-only',OPENAI_API_KEY:'test-only'}[k]);
 const run=worker({env,fetchImpl:async(url,opts)=>{
  const b=JSON.parse(opts.body);calls.push({url,body:b});
  if(url.endsWith('ch78_max_claim_job'))return Response.json([{id:'11111111-1111-4111-8111-111111111111',lease:'22222222-2222-4222-8222-222222222222',chat_id:chat,message_id:'anchor',question:'Продолжение рассказа',action:'reaction',review_required:true,state:'generating'}]);
  if(url.endsWith('ch78_max_job_gate'))return Response.json(true);
  if(url.endsWith('ch78_max_reaction_context_v2'))return missingRPC?new Response('',{status:404}):Response.json(rows);
  if(url.endsWith('ch78_max_finish_job')){saved.push(b);return Response.json(true);}
  if(url.endsWith('ch78_max_search'))return Response.json([]);
  if(url==='https://api.openai.com/v1/responses')return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({action:'silence',recipient:'keeper',intent:'other',reason:'no_added_value',answer:'',citations:[]})}]}]});
  throw Error('Unexpected effect '+url);
 }});
 const response=await run(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-CH78-Worker-Secret':secret},body:'{"stage":"generate"}'}));
 return {response:await response.json(),saved,calls};
}
test('SQL → worker → assistant: human reply is skipped without model or MAX calls',async()=>{
 const rows=await fixture({targetTime:stamp-7*3600000});const x=await replay(rows);
 assert.equal(x.response.state,'skipped');assert.equal(x.saved[0].p_result.conversation.action,'defer');
 assert.equal(x.saved[0].p_result.usage.requests,0);assert.ok(!x.calls.some(c=>c.url.includes('openai.com')||c.url.includes('max.ru')));
});
test('SQL → worker → assistant: unresolved target stays silent without model calls',async()=>{
 const x=await replay(await fixture({target:false}));assert.equal(x.response.state,'skipped');
 assert.equal(x.saved[0].p_result.conversation.reason,'unclear_addressee');assert.equal(x.saved[0].p_result.usage.requests,0);
});
test('reply to verified Keeper carries exact relationship into the model input',async()=>{
 const x=await replay(await fixture({targetSender:sender('Хранитель',true,531401311)}));assert.equal(x.response.state,'skipped');
 const call=x.calls.find(c=>c.url.includes('openai.com'));assert.ok(call);
 const input=JSON.parse(call.body.input);assert.equal(input.new_post.reply_to,'target');assert.equal(input.new_post.reply_to_author,'Хранитель');assert.equal(input.new_post.reply_to_user_id,'531401311');
 assert.equal(x.calls.filter(c=>c.url.includes('openai.com')).length,1);
});
test('preceding conversation retains its own reply links in model context',async()=>{
 await fixture({targetSender:sender('Хранитель',true,531401311)});
 await insert('root',stamp-3000,'Ранняя реплика',sender('Собеседник',false,43));
 await insert('observer',stamp-2000,'Предыдущий ответ',sender('Участник',false,44),{type:'reply',message:{mid:'root'}});
 const rows=(await db.query('select * from ch78_max_reaction_context_v2($1)',['anchor'])).rows;
 const x=await replay(rows);const call=x.calls.find(c=>c.url.includes('openai.com'));assert.ok(call);
 const context=JSON.parse(call.body.input).conversation_context;
 const previous=context.find(c=>c.message_id==='observer');assert.equal(previous.reply_to,'root');assert.equal(previous.reply_to_author,'Собеседник');assert.equal(previous.reply_to_user_id,'43');
});
test('missing v2 function fails closed without old-context fallback or model calls',async()=>{
 const x=await replay(await fixture(),{missingRPC:true});assert.equal(x.response.state,'failed');
 assert.ok(!x.calls.some(c=>c.url.includes('openai.com')||c.url.endsWith('ch78_max_reaction_context')));
});
