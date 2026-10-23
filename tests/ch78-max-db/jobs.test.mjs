import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let serial=0;
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const name of ['20261020200734_ch78_max_ingest.sql','20261021183218_ch78_max_jobs.sql','20261021193637_ch78_max_group_conversation.sql','20261023173750_ch78_max_reactions.sql'])
  await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
});
beforeEach(async()=>{
 await db.exec("reset role;delete from ch78_max_jobs;delete from ch78_max_messages;update ch78_max_bot_config set commands_enabled=false,generation_enabled=false,sending_enabled=false,reaction_mode='off',activated_at=clock_timestamp()-interval '1 minute'");
});
after(()=>db.close());
async function backend(sql,args=[]){await db.exec('set role service_role');try{return (await db.query(sql,args)).rows;}finally{await db.exec('reset role')}}
async function insert({chat='-78143291213122',id='message-'+(++serial),text='/ask Вопрос',user='17770818',bot=false,age=0,link=null}={}){
 await backend('insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,text,sender,linked_message,source_message) values($1,$2,$3,$3,$4,$5,$6,\'{}\') on conflict do nothing',
  [chat,id,Date.now()+age,text,JSON.stringify({user_id:Number(user),is_bot:bot}),link]);return id;
}
async function enable(){await db.exec('update ch78_max_bot_config set commands_enabled=true,generation_enabled=true');}
const jobs=async()=> (await db.query('select * from ch78_max_jobs order by created_at')).rows;
async function claim(stage='generate'){return (await backend('select * from ch78_max_claim_job($1)',[stage]))[0]}
async function finish(job,state,reply=null,result=null,sent=null){return (await backend('select ch78_max_finish_job($1,$2,$3,$4,$5,$6) done',[job.id,job.lease,state,reply,result,sent]))[0].done}
test('disabled by default: archival insertion works without enqueue',async()=>{
 await insert();assert.equal((await jobs()).length,0);assert.equal((await db.query('select count(*) n from ch78_max_messages')).rows[0].n,1);
});
test('new owner command atomically creates one job; duplicate delivery creates none',async()=>{
 await enable();const id=await insert({text:'/ASK Какой опыт у Аллы?'});await insert({id});
 const rows=await jobs();assert.equal(rows.length,1);assert.equal(rows[0].action,'answer');assert.equal(rows[0].question,'Какой опыт у Аллы?');
});
test('other group, sender, bot, old import, future event and malformed commands only archive',async()=>{
 await enable();for(const item of [{chat:'-99'},{user:'0'},{bot:true},{age:-120000},{age:60000},{text:'Обычное сообщение'},{text:'/other '},{text:'а'.repeat(301)},{text:'/asking вопрос'}])await insert(item);
 assert.equal((await jobs()).length,0);assert.equal((await db.query('select count(*) n from ch78_max_messages')).rows[0].n,9);
});
test('admission enforces interval and daily budget, preserving all source messages',async()=>{
 await enable();await insert({text:'/find школа'});await insert();assert.equal((await jobs()).length,2);
 for(let i=1;i<20;i++){await db.exec("update ch78_max_jobs set created_at=clock_timestamp()-interval '1 minute'");await insert();}
 await db.exec("update ch78_max_jobs set created_at=clock_timestamp()-interval '1 minute'");await insert();
 assert.equal((await jobs()).filter(j=>!j.result?.kind).length,20);assert.equal((await jobs()).at(-1).result.kind,'daily_limit');assert.equal((await db.query('select count(*) n from ch78_max_messages')).rows[0].n,22);
});
test('claim leases once; wrong lease cannot save; valid generation saves ready before send',async()=>{
 await enable();await insert();const job=await claim();assert.ok(job.lease);assert.equal(await claim(),undefined);
 assert.equal(await finish({...job,lease:'00000000-0000-0000-0000-000000000000'},'ready','Текст',{}),false);
 assert.equal(await finish(job,'ready','Текст',{}),true);assert.equal(await finish(job,'ready','Другой',{}),false);
 assert.equal(await claim('send'),undefined);await db.exec('update ch78_max_bot_config set sending_enabled=true');
 const send=await claim('send');assert.equal(send.reply_text,'Текст');assert.equal(await finish(send,'sent',null,null,'mid.sent'),true);
 assert.equal(await claim('send'),undefined);
});
test('expired generation and delivery leases become unknown and are never replayed',async()=>{
 await enable();await insert();const job=await claim();
 await db.exec("update ch78_max_jobs set lease_until=clock_timestamp()-interval '1 second'");
 assert.equal(await claim(),undefined);assert.equal((await jobs())[0].state,'generation_unknown');assert.equal(await finish(job,'ready','Поздно',{}),false);
 await db.exec("update ch78_max_jobs set state='ready',reply_text='Текст';update ch78_max_bot_config set sending_enabled=true");
 await claim('send');await db.exec("update ch78_max_jobs set lease_until=clock_timestamp()-interval '1 second'");
 assert.equal(await claim('send'),undefined);assert.equal((await jobs())[0].state,'delivery_unknown');
});
test('kill switch prevents an already leased external effect',async()=>{
 await enable();await insert();const job=await claim();
 const gate=async()=> (await backend('select ch78_max_job_gate($1,$2) allowed',[job.id,job.lease]))[0].allowed;
 assert.equal(await gate(),true);await db.exec('update ch78_max_bot_config set generation_enabled=false');assert.equal(await gate(),false);
});
test('parallel claim requests cannot lease a job twice',async()=>{
 await enable();await insert();const results=await Promise.all(Array.from({length:10},()=>db.query("select * from ch78_max_claim_job('generate')")));
 assert.equal(results.flatMap(r=>r.rows).length,1);
});
test('public clients cannot read jobs/config or execute controls; archive grants preserved',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);try{
   await assert.rejects(db.query('select * from ch78_max_jobs'),/permission denied/);
   await assert.rejects(db.query('select * from ch78_max_bot_config'),/permission denied/);
   await assert.rejects(db.query("select * from ch78_max_claim_job('send')"),/permission denied/);
  }finally{await db.exec('reset role');}
 }
 const p=(await db.query("select has_table_privilege('service_role','ch78_max_messages','UPDATE') as update_archive, has_table_privilege('service_role','ch78_max_bot_config','UPDATE') as change_config")).rows[0];
 assert.deepEqual(p,{update_archive:false,change_config:false});
 assert.ok((await db.query("select prosecdef from pg_proc where proname like 'ch78_max_%'")).rows.every(p=>!p.prosecdef));
});

test('evidence search excludes bot replies and commands while preserving raw rows',async()=>{
 await insert({text:'Алла пела в хоре.'});await insert({text:'/ask Алла пела в хоре?'});await insert({bot:true,text:'Алла пела в хоре.'});
 const rows=await backend("select * from ch78_max_search('-78143291213122','Алла')");assert.equal(rows.length,1);assert.equal(rows[0].content,'Алла пела в хоре.');
 assert.equal((await db.query('select count(*) n from ch78_max_messages')).rows[0].n,3);
});

test('persisted usage survives delivery without being counted a second time',async()=>{
 await enable();await insert();const generation=await claim();
 const result={usage:{version:1,requests:2,complete:true,input_tokens:200,output_tokens:40,total_tokens:240}};
 assert.equal(await finish(generation,'ready','Ответ',result),true);
 await db.exec('update ch78_max_bot_config set sending_enabled=true');const send=await claim('send');
 assert.equal(await finish(send,'sent',null,null,'mid.saved'),true);
 assert.deepEqual((await jobs())[0].result,result);assert.equal(await claim('send'),undefined);
});

async function usageJob(result,action='answer'){
 const id=await insert();await db.query("insert into ch78_max_jobs(chat_id,message_id,action,question,state,result) values('-78143291213122',$1,$2,'Вопрос','failed',$3)",[id,action,result]);
}
async function reportUsage(){return (await db.query(await readFile(new URL('../../ops/ch78-max-usage-report.sql',import.meta.url),'utf8'))).rows;}
test('usage report exposes unknown legacy and incomplete observations separately',async()=>{
 await usageJob(null);
 await usageJob({usage:{version:1,requests:0,complete:true,reports:[]}},'search');
 await usageJob({usage:{version:1,requests:2,complete:false,reports:[{input_tokens:100,output_tokens:20,total_tokens:120,cached_input_tokens:40,reasoning_tokens:5}]}});
 const before=await jobs(),r=(await reportUsage())[0];
 assert.equal(Number(r.jobs),3);assert.equal(Number(r.tracked_jobs),2);assert.equal(Number(r.untracked_jobs),1);assert.equal(Number(r.incomplete_jobs),1);
 assert.equal(Number(r.tracked_model_attempts),2);assert.equal(Number(r.known_total_tokens),120);assert.deepEqual(await jobs(),before);
});
test('usage report returns known zero for search-only tracked work',async()=>{
 await usageJob({usage:{version:1,requests:0,complete:true,reports:[]}},'search');
 const r=(await reportUsage())[0];assert.equal(Number(r.known_total_tokens),0);assert.equal(Number(r.untracked_jobs),0);
});


test('all human members can ask independently; same-person flood gets one free notice',async()=>{
 await enable();await insert({user:'101'});await insert({user:'102'});await insert({user:'101'});await insert({user:'101'});
 const rows=await jobs();assert.equal(rows.length,3);assert.equal(rows.filter(j=>j.state==='queued').length,2);
 assert.equal(rows[2].result.kind,'cooldown');assert.equal(rows[2].result.usage.requests,0);
});
test('Russian address and bot-qualified commands route without ordinary chatter',async()=>{
 await enable();await insert({text:'Хранитель, что вспомнили о школе?',user:'101'});
 await insert({text:'/find@id631934518295_1_bot школа',user:'102'});
 await insert({text:'Наш хранитель архива вспомнил школу',user:'103'});
 await insert({text:'/ask@other_bot вопрос',user:'104'});
 const rows=await jobs();assert.equal(rows.length,2);assert.equal(rows[0].question,'что вспомнили о школе?');assert.equal(rows[1].action,'search');
});
test('help, greetings, thanks and malformed addressed questions skip generation',async()=>{
 await enable();for(const [i,text] of ['/help','Хранитель, привет!','Хранитель, спасибо','/ask','Хранитель, '+ 'я'.repeat(301)].entries())await insert({text,user:String(200+i)});
 const rows=await jobs();assert.equal(rows.length,5);assert.ok(rows.every(j=>j.state==='ready'&&j.result.usage.requests===0));
 assert.equal(rows[2].result.kind,'thanks');assert.ok(rows[0].reply_text.includes('/find'));assert.equal(await claim(),undefined);
});
test('only a reply to a recorded delivered bot message can start a follow-up',async()=>{
 await enable();await insert({text:'/ask Что пела Алла?',user:'101'});const first=(await jobs())[0];
 await db.query("update ch78_max_jobs set state='sent',sent_message_id='mid.real',result='{}' where id=$1",[first.id]);
 await insert({user:'102',text:'А где она выступала?',link:{type:'reply',message:{mid:'mid.real'}}});
 await insert({user:'103',text:'Поддельный ответ',link:{type:'reply',sender:{user_id:531401311},message:{mid:'mid.fake'}}});
 await insert({user:'104',text:'Пересылка',link:{type:'forward',message:{mid:'mid.real'}}});
 const rows=await jobs();assert.equal(rows.length,2);assert.ok(rows[1].question.includes('Что пела Алла?'));assert.ok(rows[1].question.includes('А где она выступала?'));
});
test('addressed questions and recorded follow-ups never become archive evidence',async()=>{
 await enable();await insert({text:'Алла пела в хоре.',user:'101'});await insert({text:'Хранитель, Алла пела?',user:'102'});
 const rows=await backend("select * from ch78_max_search('-78143291213122','Алла')");assert.equal(rows.length,1);assert.equal(rows[0].content,'Алла пела в хоре.');
});
test('service reply flood is bounded separately from archive allowance',async()=>{
 await enable();for(let i=0;i<61;i++)await insert({text:'/help',user:String(1000+i)});
 assert.equal((await jobs()).length,60);await insert({user:'2000',text:'/ask школа'});
 assert.equal((await jobs()).filter(j=>j.state==='queued').length,1);
});

test('thanks after a question gets a free acknowledgement, repeated help is bounded',async()=>{
 await enable();await insert({user:'101'});await insert({user:'101',text:'Хранитель, спасибо!'});await insert({user:'101',text:'/help'});
 const rows=await jobs();assert.equal(rows.length,2);assert.equal(rows[1].result.kind,'thanks');
});
test('long reply threads request a complete question instead of losing context',async()=>{
 await enable();await insert({user:'101',text:'/ask '+ 'а'.repeat(280)});
 await db.exec("update ch78_max_jobs set state='sent',sent_message_id='mid.long',result='{}'");
 await insert({user:'102',text:'А в каком году это происходило?',link:{type:'reply',message:{mid:'mid.long'}}});
 const rows=await jobs();assert.equal(rows[1].result.kind,'clarification');assert.equal(rows[1].state,'ready');
});

test('reply to a help message accepts a full question without adding help as context',async()=>{
 await enable();await insert({user:'101',text:'/help'});
 await db.exec("update ch78_max_jobs set state='sent',sent_message_id='mid.help'");
 await insert({user:'102',text:'Что пела Алла?',link:{type:'reply',message:{mid:'mid.help'}}});
 const rows=await jobs();assert.equal(rows.length,2);assert.equal(rows[1].question,'Что пела Алла?');assert.equal(rows[1].state,'queued');
});
test('explicit address inside a reply keeps the prior question as context',async()=>{
 await enable();await insert({user:'101',text:'/ask Что пела Алла?'});
 await db.exec("update ch78_max_jobs set state='sent',sent_message_id='mid.context',result='{}'");
 await insert({user:'102',text:'Хранитель, а где она выступала?',link:{type:'reply',message:{mid:'mid.context'}}});
 const row=(await jobs())[1];assert.ok(row.question.includes('Что пела Алла?'));assert.ok(row.question.includes('а где она выступала?'));
 const evidence=await backend("select * from ch78_max_search('-78143291213122','выступала')");assert.equal(evidence.length,0);
});

test('suppressed reply flood is excluded from evidence even when no job is created',async()=>{
 await enable();await insert({user:'101',text:'/ask Алла'});
 await db.exec("update ch78_max_jobs set state='sent',sent_message_id='mid.flood',result='{}'");
 const link={type:'reply',message:{mid:'mid.flood'}};
 for(let i=0;i<3;i++)await insert({user:'102',text:'Алла выступала?',link});
 assert.equal((await jobs()).length,3);
 const rows=await backend("select * from ch78_max_search('-78143291213122','выступала')");assert.equal(rows.length,0);
});

const story='Помню, как после уроков в школе мы всем классом собирались во дворе и долго обсуждали планы на летние каникулы. А потом шли к Волге.';
async function reactions(mode='draft'){
 await enable();await db.query("update ch78_max_bot_config set reaction_mode=$1,reactions_activated_at=clock_timestamp()-interval '1 minute'",[mode]);
}
test('reactions are off by default and never enqueue paid work',async()=>{
 await enable();await insert({text:story});assert.equal((await jobs()).length,0);
});
test('draft admission is bounded, human-only, fresh and group-scoped',async()=>{
 await reactions();for(const item of [{chat:'-99'},{bot:true},{user:'0'},{age:-120000},{text:'Помню школу'},{text:'Обычный длинный текст '.repeat(8)},{link:{type:'forward'}}])await insert({text:story,...item});
 assert.equal((await jobs()).length,0);const id=await insert({text:story});await insert({text:story,id});await insert({text:story});
 const rows=await jobs();assert.equal(rows.length,1);assert.equal(rows[0].action,'reaction');assert.equal(rows[0].review_required,true);
});
test('model-declined and failed reactions still consume the bounded evaluation allowance',async()=>{
 await reactions();for(let i=0;i<5;i++){
  await db.exec("update ch78_max_jobs set created_at=clock_timestamp()-interval '31 minutes'");await insert({text:story});
 }
 await db.exec("update ch78_max_jobs set created_at=clock_timestamp()-interval '31 minutes'");await insert({text:story});
 assert.equal((await jobs()).length,5);
});
test('reaction drafts never dispatch, even after auto mode is enabled later',async()=>{
 await reactions();await insert({text:story});const j=await claim();assert.equal(j.action,'reaction');
 assert.equal(await finish(j,'ready','Нельзя',{}),false);assert.equal(await finish(j,'review','Черновик',{found:true}),true);
 await db.exec("update ch78_max_bot_config set sending_enabled=true,reaction_mode='auto'");assert.equal(await claim('send'),undefined);
});
test('silence is a terminal skipped decision, not a reply or retry',async()=>{
 await reactions();await insert({text:story});const j=await claim();assert.equal(await finish(j,'skipped',null,{found:false}),true);assert.equal(await claim(),undefined);
});
test('reaction kill switch works after leasing and stale ready reactions cannot send',async()=>{
 await reactions('auto');await insert({text:story});const j=await claim();
 await db.exec("update ch78_max_bot_config set reaction_mode='off'");assert.equal((await backend('select ch78_max_job_gate($1,$2) allowed',[j.id,j.lease]))[0].allowed,false);
 await db.exec("update ch78_max_bot_config set reaction_mode='auto',sending_enabled=true");await finish(j,'ready','Реакция',{});
 await db.exec("update ch78_max_jobs set created_at=clock_timestamp()-interval '31 minutes'");assert.equal(await claim('send'),undefined);assert.equal((await jobs())[0].state,'skipped');
});
test('explicit questions have priority and their own quota; reaction posts stay searchable',async()=>{
 await reactions();await insert({text:story,user:'101'});await insert({text:'/ask Что было в школе?',user:'101'});
 const j=await claim();assert.equal(j.action,'answer');
 const found=await backend("select * from ch78_max_search('-78143291213122','каникулы')");assert.equal(found.length,1);assert.equal(found[0].content,story);
});
test('context includes the anchor and preceding human messages only in the same group',async()=>{
 await reactions();await insert({text:'Короткая реплика',age:-5000});await insert({text:'Бот',bot:true,age:-4000});await insert({text:'Чужая группа',chat:'-99',age:-3000});
 const id=await insert({text:story,age:-1000});await insert({text:'Позже',age:1000});
 const context=await backend('select * from ch78_max_reaction_context($1)',[id]);
 assert.equal(context.length,2);assert.equal(context[0].message_id,id);assert.equal(context[1].content,'Короткая реплика');
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);try{await assert.rejects(db.query('select * from ch78_max_reaction_context($1)',[id]),/permission denied/);}finally{await db.exec('reset role');}
 }
});

test('auto reactions can be sent only once and the mode gate blocks a leased send',async()=>{
 await reactions('auto');await insert({text:story});const generation=await claim();
 assert.equal(await finish(generation,'ready','Реакция',{found:true}),true);
 await db.exec("update ch78_max_bot_config set sending_enabled=true");const send=await claim('send');assert.equal(send.action,'reaction');
 await db.exec("update ch78_max_bot_config set reaction_mode='draft'");assert.equal((await backend('select ch78_max_job_gate($1,$2) allowed',[send.id,send.lease]))[0].allowed,false);
 await db.exec("update ch78_max_bot_config set reaction_mode='auto'");assert.equal(await finish(send,'sent',null,null,'mid.once'),true);assert.equal(await claim('send'),undefined);
});
test('switching queued auto work into draft latches review permanently',async()=>{
 await reactions('auto');await insert({text:story});await db.exec("update ch78_max_bot_config set reaction_mode='draft'");const j=await claim();assert.equal(j.review_required,true);
 assert.equal(await finish(j,'review','Черновик',{}),true);await db.exec("update ch78_max_bot_config set reaction_mode='auto',sending_enabled=true");assert.equal(await claim('send'),undefined);
});

test('human replies to an unsolicited reaction remain memories, not implicit commands',async()=>{
 await reactions('auto');await insert({text:story});await db.exec("update ch78_max_jobs set state='sent',sent_message_id='mid.reaction'");
 await insert({user:'102',text:'Мы тогда слушали школьный ансамбль.',link:{type:'reply',message:{mid:'mid.reaction'}}});
 assert.equal((await jobs()).length,1);
 const results=await backend("select * from ch78_max_search('-78143291213122','ансамбль')");assert.equal(results.length,1);assert.equal(results[0].content,'Мы тогда слушали школьный ансамбль.');
});
