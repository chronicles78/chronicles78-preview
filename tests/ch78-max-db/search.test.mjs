import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const sql=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
before(async()=>{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(await sql('20261020200734_ch78_max_ingest.sql'));
 const rows=[['1','На школьной дискотеке мы танцевали.'],['2','Танцы под музыку после уроков.'],['3','В школу ходили пешком.'],['4','В школе была ёлка.'],['5',''],['6','Случайный текст о рыбалке.']];
 for(const [id,text] of rows)await db.query("insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,text,sender,source_message) values('-78',$1,$2,$2,$3,'{\"first_name\":\"Тест\",\"last_name\":\"Автор\"}','{}')",[id,Number(id),text]);
 await db.query("insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,text,source_message) values('-99','other',1,1,'дискотека','{}')");
 await db.exec(await sql('20261021174929_ch78_max_search.sql'));
});
after(()=>db.close());
async function search(q,mode='forms',limit=8){
 await db.exec('set role service_role');try{return (await db.query('select * from ch78_max_search($1,$2,$3,$4)',['-78',q,mode,limit])).rows;}finally{await db.exec('reset role');}
}
test('Russian morphology and yo/e search return only source matches',async()=>{
 assert.equal((await search('дискотеки'))[0].message_id,'1');
 assert.deepEqual((await search('школа')).map(r=>r.message_id).sort(),['3','4']);
 assert.equal((await search('елка'))[0].message_id,'4');
});
test('literal mode keeps exact substring behavior',async()=>{
 assert.equal((await search('дискот','literal'))[0].message_id,'1');
 assert.equal((await search('школа','literal')).length,0);
 assert.equal((await search('елка','literal')).length,0);
});
test('web search OR works but absent/stopword queries never get arbitrary nearest rows',async()=>{
 assert.deepEqual((await search('дискотека OR танцы')).map(r=>r.message_id).sort(),['1','2']);
 assert.equal((await search('межзвёздный космолёт')).length,0);
 assert.equal((await search('и в на')).length,0);
});
test('source fields, limit and group isolation',async()=>{
 const rows=await search('дискотека OR танцы','forms',1);assert.equal(rows.length,1);
 assert.ok(!rows.some(r=>r.message_id==='other'));
 assert.deepEqual(Object.keys(rows[0]).sort(),['author','content','message_id','message_ts','score']);
 assert.equal(rows[0].author,'Тест Автор');
});
test('invalid parameters do not fall back to unfiltered archive',async()=>{
 for(const [q,mode,limit] of [['','forms',8],['a'.repeat(301),'forms',8],['школа','unknown',8],['школа','forms',500]])await assert.rejects(search(q,mode,limit),/Invalid search parameters/);
});
test('anon/authenticated cannot execute RPC even with knowledge of its name',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  try{await assert.rejects(db.query("select * from ch78_max_search('-78','школа')"),/permission denied/);}finally{await db.exec('reset role');}
 }
 const row=(await db.query("select prosecdef from pg_proc where proname='ch78_max_search'")).rows[0];assert.equal(row.prosecdef,false);
});
test('search leaves original archive rows and permissions intact',async()=>{
 const before=(await db.query('select message_id,text,source_message from ch78_max_messages order by message_id')).rows;
 await search('школа');await search('неизвестно');
 assert.deepEqual((await db.query('select message_id,text,source_message from ch78_max_messages order by message_id')).rows,before);
 const p=(await db.query("select has_table_privilege('authenticated','ch78_max_messages','SELECT') as client_read, has_table_privilege('service_role','ch78_max_messages','UPDATE') as backend_update")).rows[0];
 assert.deepEqual(p,{client_read:false,backend_update:false});
});
