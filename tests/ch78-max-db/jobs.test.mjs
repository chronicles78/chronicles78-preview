import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let serial=0;
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const name of ['20261020200734_ch78_max_ingest.sql','20261021183218_ch78_max_jobs.sql'])
  await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
});
beforeEach(async()=>{
 await db.exec("reset role;delete from ch78_max_jobs;delete from ch78_max_messages;update ch78_max_bot_config set commands_enabled=false,generation_enabled=false,sending_enabled=false,activated_at=clock_timestamp()-interval '1 minute'");
});
after(()=>db.close());
async function backend(sql,args=[]){await db.exec('set role service_role');try{return (await db.query(sql,args)).rows;}finally{await db.exec('reset role')}}
async function insert({chat='-78143291213122',id='message-'+(++serial),text='/ask Вопрос',user='17770818',bot=false,age=0}={}){
 await backend('insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,text,sender,source_message) values($1,$2,$3,$3,$4,$5,\'{}\') on conflict do nothing',
  [chat,id,Date.now()+age,text,JSON.stringify({user_id:Number(user),is_bot:bot})]);return id;
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
 await enable();for(const item of [{chat:'-99'},{user:'99'},{bot:true},{age:-120000},{age:60000},{text:'Обычное сообщение'},{text:'/ask '},{text:'/ask '+ 'а'.repeat(301)},{text:'/asking вопрос'}])await insert(item);
 assert.equal((await jobs()).length,0);assert.equal((await db.query('select count(*) n from ch78_max_messages')).rows[0].n,9);
});
test('admission enforces interval and daily budget, preserving all source messages',async()=>{
 await enable();await insert({text:'/find школа'});await insert();assert.equal((await jobs()).length,1);
 for(let i=1;i<20;i++){await db.exec("update ch78_max_jobs set created_at=clock_timestamp()-interval '1 minute'");await insert();}
 await db.exec("update ch78_max_jobs set created_at=clock_timestamp()-interval '1 minute'");await insert();
 assert.equal((await jobs()).length,20);assert.equal((await db.query('select count(*) n from ch78_max_messages')).rows[0].n,22);
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
