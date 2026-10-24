import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let serial=0;
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const n of ['20261020200734_ch78_max_ingest.sql','20261021183218_ch78_max_jobs.sql','20261021193637_ch78_max_group_conversation.sql','20261023173750_ch78_max_reactions.sql','20261023183326_ch78_max_miniapp.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+n,import.meta.url),'utf8'));
});
beforeEach(async()=>{await db.exec('reset role;delete from ch78_max_miniapp_requests;update ch78_max_bot_config set miniapp_enabled=false,miniapp_ai_enabled=false,miniapp_ai_daily_limit=5,generation_enabled=true');});
after(()=>db.close());
async function backend(sql,args=[]){await db.exec('set role service_role');try{return (await db.query(sql,args)).rows;}finally{await db.exec('reset role');}}
const newId=()=>`11111111-1111-4111-8111-${String(++serial).padStart(12,'0')}`;
const fingerprint='a'.repeat(64);
async function claim({id=newId(),user='123',action='answer',hash=fingerprint}={}){return (await backend('select ch78_max_miniapp_claim($1,$2,$3,$4) result',[id,user,action,hash]))[0].result;}
async function enable(){await db.exec('update ch78_max_bot_config set miniapp_enabled=true,miniapp_ai_enabled=true');}
test('read and AI start disabled; search remains usable when paid answers are off',async()=>{
 assert.equal((await claim()).kind,'disabled');await db.exec('update ch78_max_bot_config set miniapp_enabled=true');
 assert.equal((await claim()).kind,'ai_disabled');assert.equal((await claim({action:'search'})).kind,'claimed');
});
test('same request atomically claims once; foreign users and modified inputs never get saved data',async()=>{
 await enable();const id=newId(),r=await claim({id});assert.equal(r.kind,'claimed');assert.equal((await claim({id})).kind,'processing');
 for(const opts of [{user:'124'},{hash:'b'.repeat(64)},{action:'search'}])assert.equal((await claim({id,...opts})).kind,'conflict');
 assert.equal((await db.query('select count(*) n from ch78_max_miniapp_requests')).rows[0].n,1);
});
test('completed result is reusable with no second charge; wrong lease cannot overwrite it',async()=>{
 await enable();const id=newId(),r=await claim({id}),result={found:true,answer:'Сохранено'};
 assert.equal((await backend('select ch78_max_miniapp_finish($1,$2,$3,true) ok',[id,'00000000-0000-0000-0000-000000000000',result]))[0].ok,false);
 assert.equal((await backend('select ch78_max_miniapp_finish($1,$2,$3,true) ok',[id,r.lease,result]))[0].ok,true);
 assert.deepEqual(await claim({id}),{kind:'done',result});
 assert.equal((await backend('select ch78_max_miniapp_finish($1,$2,$3,true) ok',[id,r.lease,result]))[0].ok,false);
});
test('uncertain requests expire without automatic retry and reject late completion',async()=>{
 await enable();const id=newId(),r=await claim({id});await db.exec("update ch78_max_miniapp_requests set created_at=clock_timestamp()-interval '121 seconds'");
 assert.equal((await claim({id})).kind,'unknown');assert.equal((await claim({id})).kind,'unknown');
 assert.equal((await backend("select ch78_max_miniapp_finish($1,$2,'{}',true) ok",[id,r.lease]))[0].ok,false);
});
test('per-user intervals and separate daily AI budget include failed/uncertain attempts',async()=>{
 await enable();assert.equal((await claim()).kind,'claimed');assert.equal((await claim()).kind,'rate_limit');
 for(let i=1;i<5;i++)assert.equal((await claim({user:String(123+i)})).kind,'claimed');
 await db.exec("update ch78_max_miniapp_requests set state='failed'");assert.equal((await claim({user:'999'})).kind,'daily_limit');
 assert.equal((await claim({action:'search',user:'999'})).kind,'claimed');
});
test('search cap, invalid identifiers and disabled generation fail closed',async()=>{
 await enable();await db.exec('update ch78_max_bot_config set generation_enabled=false');assert.equal((await claim()).kind,'ai_disabled');
 assert.equal((await claim({user:'0'})).kind,'invalid');
 await db.query("insert into ch78_max_miniapp_requests(id,chat_id,user_id,action,fingerprint,created_at) select gen_random_uuid(),'-78143291213122','111','search',$1,clock_timestamp()-interval '3 seconds' from generate_series(1,200)",[fingerprint]);
 assert.equal((await claim({action:'search',user:'999'})).kind,'daily_limit');
});
test('seven-day records are pruned on use; disabling app also blocks cached results',async()=>{
 await enable();const id=newId();await claim({id});await db.exec("update ch78_max_miniapp_requests set created_at=clock_timestamp()-interval '8 days'");await claim({action:'search'});
 assert.equal((await db.query('select count(*) n from ch78_max_miniapp_requests where id=$1',[id])).rows[0].n,0);
 await db.exec('update ch78_max_bot_config set miniapp_enabled=false');assert.equal((await claim({id})).kind,'disabled');
});
test('archive remains private; app roles cannot read requests or invoke service RPCs',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{
  for(const sql of ['select * from ch78_max_miniapp_requests','select ch78_max_miniapp_status()',"select ch78_max_miniapp_claim(null,null,null,null)"] )await assert.rejects(db.query(sql),/permission denied/);
 }finally{await db.exec('reset role');}}
 const status=(await backend('select ch78_max_miniapp_status() s'))[0].s;assert.equal(status.test_archive,true);assert.equal(status.messages,0);
 assert.ok((await db.query("select prosecdef from pg_proc where proname like 'ch78_max_miniapp_%'")).rows.every(r=>!r.prosecdef));
});
