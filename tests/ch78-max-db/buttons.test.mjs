import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let serial=0;
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const n of ['20261020200734_ch78_max_ingest.sql','20261021183218_ch78_max_jobs.sql','20261021193637_ch78_max_group_conversation.sql','20261023173750_ch78_max_reactions.sql','20261023175553_ch78_max_buttons.sql','20261025193750_ch78_max_source_toggle.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+n,import.meta.url),'utf8'));
});
beforeEach(async()=>{await db.exec("reset role;delete from ch78_max_callbacks;delete from ch78_max_jobs;delete from ch78_max_messages;update ch78_max_bot_config set buttons_enabled=false,commands_enabled=false,sending_enabled=false");});
after(()=>db.close());
async function backend(sql,args=[]){await db.exec('set role service_role');try{return (await db.query(sql,args)).rows;}finally{await db.exec('reset role');}}
async function parent(){
 const mid='fixture-'+(++serial);await backend("insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,text,source_message) values('-78143291213122',$1,1000,1000,'Вопрос','{}')",[mid]);
 return (await db.query("insert into ch78_max_jobs(chat_id,message_id,action,question,state,sent_message_id,result) values('-78143291213122',$1,'answer','Вопрос','sent',$2,$3) returning *",[mid,'sent-'+mid,{found:true,citations:['S4'],sources:[{ref:'S1',text:'Постороннее'},{ref:'S4',text:'Истинный источник',author:'Тест',message_ts:1000}]}])).rows[0];
}
async function enable(){await db.exec('update ch78_max_bot_config set commands_enabled=true,sending_enabled=true,buttons_enabled=true');}
async function claim(j,{id='click-'+(++serial),chat='-78143291213122',user='123',mid=j.sent_message_id,action='help',ref=null}={}){
 return (await backend('select ch78_max_claim_callback($1,$2,$3,$4,$5,$6,$7) as result',[id,chat,user,j.id,mid,action,ref]))[0].result;
}
test('buttons default off; claims require enabled commands and sending',async()=>{
 const j=await parent();assert.equal(await claim(j),null);await enable();assert.ok(await claim(j));
 await db.exec('update ch78_max_bot_config set sending_enabled=false');assert.equal(await claim(j),null);
});
test('callback binds actual sent parent in the same group; unrelated sources cannot leak',async()=>{
 const j=await parent();await enable();
 for(const opts of [{chat:'-99'},{user:'0'},{mid:'forged'},{action:'source',ref:'S1'},{action:'source',ref:'S99'}])assert.equal(await claim(j,opts),null);
 assert.ok(await claim(j,{action:'source',ref:'S4'}));
});
test('duplicate delivery can reserve only one effect',async()=>{
 const j=await parent();await enable();assert.ok(await claim(j,{id:'same'}));assert.equal(await claim(j,{id:'same'}),null);
 assert.equal((await db.query('select count(*) n from ch78_max_callbacks')).rows[0].n,1);
});
test('per-user/group click intervals prevent bursts',async()=>{
 const j=await parent();await enable();assert.ok(await claim(j));assert.equal(await claim(j),null);assert.equal(await claim(j,{user:'124'}),null);
 await db.exec("update ch78_max_callbacks set created_at=clock_timestamp()-interval '3 seconds'");assert.ok(await claim(j));
});
test('source navigation accepts only successful child messages of the same parent',async()=>{
 const j=await parent(),other=await parent();await enable();assert.ok(await claim(j,{id:'first'}));
 assert.equal((await backend("select ch78_max_finish_callback('first','done','child.mid') ok"))[0].ok,true);
 await db.exec("update ch78_max_callbacks set created_at=clock_timestamp()-interval '3 seconds'");
 assert.equal(await claim(other,{mid:'child.mid'}),null);assert.ok(await claim(j,{mid:'child.mid',action:'source',ref:'S4'}));
});
test('missing source sent ID fails closed even with null equality',async()=>{
 const j=await parent();await db.query('update ch78_max_jobs set sent_message_id=null where id=$1',[j.id]);await enable();assert.equal(await claim({...j,sent_message_id:null}),null);
});
test('public clients cannot read callback metadata or invoke private controls',async()=>{
 const j=await parent();await enable();await claim(j);
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);try{
   await assert.rejects(db.query('select * from ch78_max_callbacks'),/permission denied/);
   await assert.rejects(db.query('select ch78_max_buttons_enabled()'),/permission denied/);
  }finally{await db.exec('reset role');}
 }
 assert.ok((await db.query("select prosecdef from pg_proc where proname like 'ch78_max_%'")).rows.every(r=>!r.prosecdef));
});

test('draft reactions and unsent answers cannot expose sources through callbacks',async()=>{
 const j=await parent();await enable();await db.query("update ch78_max_jobs set state='review',action='reaction',review_required=true where id=$1",[j.id]);
 assert.equal(await claim(j,{action:'source',ref:'S4'}),null);
});
test('the daily callback cap does not consume model jobs',async()=>{
 const j=await parent();await enable();
 await db.query("insert into ch78_max_callbacks(callback_id,chat_id,user_id,parent_id,action,created_at) select 'budget-'||g,'-78143291213122','123',$1,'help',clock_timestamp()-interval '3 seconds' from generate_series(1,100) g",[j.id]);
 assert.equal(await claim(j),null);assert.equal((await db.query('select count(*) n from ch78_max_jobs')).rows[0].n,1);
});

async function ageClicks(){await db.exec("update ch78_max_callbacks set created_at=created_at-interval '3 seconds'");}
async function finishPanel(id,state='done',mid='original'){return (await backend('select ch78_max_finish_callback($1,$2,$3) ok',[id,state,state==='done'?mid:null]))[0].ok;}
test('source toggle edits original answer, switches references, and collapses without model jobs',async()=>{
 const j=await parent();await enable();
 await db.query("update ch78_max_jobs set result=jsonb_set(result,'{citations}','[\"S1\",\"S4\"]') where id=$1",[j.id]);
 const show=await claim(j,{id:'show',action:'source',ref:'S4'});assert.equal(show.source_effect,'show');assert.equal(show.edit_mid,j.sent_message_id);
 assert.equal(await finishPanel('show','done',j.sent_message_id),true);await ageClicks();
 const next=await claim(j,{id:'switch',action:'source',ref:'S1'});assert.equal(next.source_effect,'show');
 await finishPanel('switch','done',j.sent_message_id);await ageClicks();
 const hide=await claim(j,{id:'hide',action:'source',ref:'S1'});assert.equal(hide.source_effect,'hide');
 await finishPanel('hide','done',j.sent_message_id);await ageClicks();
 assert.equal((await claim(j,{id:'again',action:'source',ref:'S4'})).source_effect,'show');
 assert.equal((await db.query('select count(*) n from ch78_max_jobs')).rows[0].n,1);
});
test('pending and uncertain source edits block competing edits even after cooldown',async()=>{
 const j=await parent();await enable();await claim(j,{id:'pending',action:'source',ref:'S4'});await ageClicks();
 assert.equal(await claim(j,{action:'source',ref:'S4'}),null);
 await finishPanel('pending','unknown');await ageClicks();assert.equal(await claim(j,{action:'source',ref:'S4'}),null);
});
test('known rejected source edit preserves prior disclosure state',async()=>{
 const j=await parent();await enable();await claim(j,{id:'rejected',action:'source',ref:'S4'});await finishPanel('rejected','failed');await ageClicks();
 assert.equal((await claim(j,{action:'source',ref:'S4'})).source_effect,'show');
});
