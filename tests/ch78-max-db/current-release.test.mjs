import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),main='-72977812571458',old='-78143291213122',stamp=Date.UTC(2026,8,7,10);
const migrations=[
 '20261020200734_ch78_max_ingest.sql','20261021174929_ch78_max_search.sql','20261021183218_ch78_max_jobs.sql',
 '20261021193637_ch78_max_group_conversation.sql','20261023173750_ch78_max_reactions.sql',
 '20261023175553_ch78_max_buttons.sql','20261023182008_ch78_max_typing.sql','20261023183326_ch78_max_miniapp.sql',
 '20261025154122_ch78_max_miniapp_recovery.sql','20261025160656_ch78_max_reaction_memory_filter.sql',
 '20261025193750_ch78_max_source_toggle.sql','20261026165900_ch78_max_main_chat.sql',
 '20261026172038_ch78_max_month_retrieval.sql','20261026181050_ch78_max_author_context.sql',
 '20261027173833_ch78_max_reaction_reply_context_v2.sql'
];
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const name of migrations)await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
});
beforeEach(async()=>{await db.exec("reset role;delete from ch78_max_jobs;delete from ch78_max_messages;delete from ch78_max_miniapp_requests;update ch78_max_bot_config set commands_enabled=false,generation_enabled=false,sending_enabled=false,reaction_mode='off',miniapp_enabled=false,miniapp_ai_enabled=false;");});
after(()=>db.close());
async function backend(sql,args=[]){await db.exec('set role service_role');try{return (await db.query(sql,args)).rows;}finally{await db.exec('reset role');}}
async function insert(id,{chat=main,user=42,name='Павел Первый',text='Тема '+id,ts=stamp,bot=false,link=null}={}){
 await backend("insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,text,sender,linked_message,source_message) values($1,$2,$3,$3,$4,$5::jsonb,$6::jsonb,'{}')",[chat,id,ts,text,JSON.stringify({user_id:user,name,is_bot:bot}),link&&JSON.stringify(link)]);
}
test('complete archive schema chain selects main group and starts with all effects disabled',async()=>{
 const c=(await db.query('select * from ch78_max_bot_config')).rows[0];assert.equal(c.chat_id,main);
 for(const key of ['commands_enabled','generation_enabled','sending_enabled','miniapp_enabled','miniapp_ai_enabled'])assert.equal(c[key],false);
 assert.equal(c.reaction_mode,'off');
});
test('same first name remains ambiguous; full label resolves only its own identifier',async()=>{
 await insert('one');await insert('two',{user:43,name:'Павел Второй',ts:stamp+1});
 const question='О чём Павел рассказывал в последних постах?';
 assert.equal((await backend('select * from ch78_max_resolve_author($1,$2)',[main,question])).length,2);
 assert.deepEqual((await backend('select user_id from ch78_max_resolve_author($1,$2)',[main,'О чём Павел Первый рассказывал в последних постах?'])).map(r=>r.user_id),['42']);
});
test('latest eight author records are chronological and exclude other senders, bots, blank text and commands',async()=>{
 for(let i=0;i<12;i++)await insert('story-'+i,{ts:stamp+i});
 await insert('other',{user:43,ts:stamp+100});await insert('bot',{bot:true,ts:stamp+101});
 await insert('blank',{text:' ',ts:stamp+102});await insert('command',{text:'/ask вопрос',ts:stamp+103});
 const rows=await backend('select * from ch78_max_author_messages($1,$2,null,null,null,8)',[main,'42']);
 assert.deepEqual(rows.map(r=>r.message_id),Array.from({length:8},(_,i)=>'story-'+(11-i)));
});
test('publication month and day use Samara local time',async()=>{
 await insert('before',{ts:Date.UTC(2026,8,30,19)});await insert('after',{ts:Date.UTC(2026,8,30,21)});
 const september=await backend('select * from ch78_max_author_messages($1,$2,9,2026,null,8)',[main,'42']);
 const october=await backend('select * from ch78_max_author_messages($1,$2,10,2026,1,8)',[main,'42']);
 assert.deepEqual(september.map(r=>r.message_id),['before']);assert.deepEqual(october.map(r=>r.message_id),['after']);
});
test('reply identity comes from active group even when old archive has the same message ID',async()=>{
 await insert('parent');await insert('parent',{chat:old,user:43,name:'Иной автор'});
 await insert('reply',{ts:stamp+1000,link:{type:'reply',chat_id:main,message:{mid:'parent'}}});
 const rows=await backend('select * from ch78_max_reaction_context_v2($1)',['reply']);
 assert.equal(rows[0].reply_to,'parent');assert.equal(rows[0].reply_to_user_id,'42');assert.equal(rows[0].reply_to_author,'Павел Первый');
 assert.equal((await backend('select * from ch78_max_reaction_context_v2($1)',['absent'])).length,0);
});
test('old-chat requests do not consume main-chat claim rate or identity',async()=>{
 await db.exec("update ch78_max_bot_config set miniapp_enabled=true,miniapp_ai_enabled=true,generation_enabled=true;");
 const existing='11111111-1111-4111-8111-111111111111',fresh='22222222-2222-4222-8222-222222222222',fingerprint='a'.repeat(64);
 await db.query("insert into ch78_max_miniapp_requests(id,chat_id,user_id,action,fingerprint) values($1,$2,'42','answer',$3)",[existing,old,fingerprint]);
 const claim=await backend("select ch78_max_miniapp_claim($1,'42','answer',$2) as result",[fresh,fingerprint]);assert.equal(claim[0].result.kind,'claimed');
 const wrong=await backend("select ch78_max_miniapp_claim($1,'42','answer',$2) as result",[existing,fingerprint]);assert.equal(wrong[0].result.kind,'conflict');
});
test('new structural and date RPCs remain restricted to service role',async()=>{
 const signatures=['ch78_max_search_month(text,text,integer,integer,integer)','ch78_max_resolve_author(text,text)','ch78_max_author_messages(text,text,integer,integer,integer,integer)','ch78_max_thread_context(text,text[],integer)','ch78_max_reaction_context_v2(text)'];
 for(const fn of signatures){
  const row=(await db.query("select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as auth,has_function_privilege('service_role',$1,'execute') as service",[fn])).rows[0];
  assert.deepEqual(row,{anon:false,auth:false,service:true});
 }
});
test('usage report follows active archive without mixing preserved old-chat jobs',async()=>{
 await insert('main-report');await insert('old-report',{chat:old});
 for(const [chat,mid] of [[main,'main-report'],[old,'old-report']])await db.query("insert into ch78_max_jobs(chat_id,message_id,action,question) values($1,$2,'search','Вымышленный вопрос')",[chat,mid]);
 const report=await readFile(new URL('../../ops/ch78-max-usage-report.sql',import.meta.url),'utf8');
 const rows=(await db.query(report)).rows;assert.equal(rows.reduce((n,r)=>n+Number(r.jobs),0),1);
});
