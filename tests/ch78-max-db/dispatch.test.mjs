import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let serial=0;const commands={};
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const name of ['20261020200734_ch78_max_ingest.sql','20261021183218_ch78_max_jobs.sql'])
  await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.exec(`create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
 insert into vault.decrypted_secrets values('ch78_max_worker_secret','fictional-worker-secret');
 create schema net;create table net.calls(id bigserial,body jsonb);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint
 language plpgsql as $$ declare n bigint;begin insert into net.calls(body) values(body) returning id into n;return n;end $$;`);
 const script=await readFile(new URL('../../ops/ch78-max-refresh-dispatch.sql',import.meta.url),'utf8');
 for(const m of script.matchAll(/cron\.schedule\('ch78-max-(generate|send)'[\s\S]*?\$job\$([\s\S]*?)\$job\$\);/g))commands[m[1]]=m[2];
 assert.deepEqual(Object.keys(commands).sort(),['generate','send']);
});
beforeEach(async()=>{await db.exec(`delete from net.calls;delete from ch78_max_jobs;delete from ch78_max_messages;
 update ch78_max_bot_config set generation_enabled=true,sending_enabled=true;`);});
after(()=>db.close());
async function job(state,chat='-78143291213122',expired=false){
 const mid='fixture-'+(++serial);
 await db.query(`insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,text,source_message) values($1,$2,1,1,'Данные','{}')`,[chat,mid]);
 await db.query(`insert into ch78_max_jobs(chat_id,message_id,action,question,state,reply_text,lease,lease_until)
 values($1,$2,'search','Вопрос',$3,'Текст',gen_random_uuid(),clock_timestamp()+$4::interval)`,[chat,mid,state,expired?'-1 second':'5 minutes']);
}
async function tick(){await db.exec(commands.generate);await db.exec(commands.send);return (await db.query('select body from net.calls order by id')).rows.map(r=>r.body.stage);}
test('empty queues generate no HTTP calls at all',async()=>{assert.deepEqual(await tick(),[]);});
test('queued work invokes only generation; ready work invokes only sending',async()=>{
 await job('queued');assert.deepEqual(await tick(),['generate']);
 await db.exec('delete from net.calls;update ch78_max_jobs set state=\'ready\'');assert.deepEqual(await tick(),['send']);
});
test('disabled stage cannot dispatch eligible work',async()=>{
 await job('queued');await job('ready');await db.exec('update ch78_max_bot_config set generation_enabled=false,sending_enabled=false');assert.deepEqual(await tick(),[]);
});
test('expired leases become unknown without HTTP calls or automatic replay',async()=>{
 await job('generating','-78143291213122',true);await job('sending','-78143291213122',true);
 assert.deepEqual(await tick(),[]);
 assert.deepEqual((await db.query('select state from ch78_max_jobs order by state')).rows.map(r=>r.state),['delivery_unknown','generation_unknown']);
 assert.deepEqual(await tick(),[]);
});
test('active leases, failed and sent jobs do not wake workers',async()=>{
 for(const state of ['generating','sending','failed','sent','delivery_unknown','generation_unknown'])await job(state);
 assert.deepEqual(await tick(),[]);
});
test('another group cannot wake either worker',async()=>{await job('queued','-99');await job('ready','-99');assert.deepEqual(await tick(),[]);});
