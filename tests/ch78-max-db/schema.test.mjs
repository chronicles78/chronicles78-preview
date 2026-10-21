import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHandler, PROJECT_URL } from '../../supabase/functions/ch78-max-webhook/handler.mjs';
const db = new PGlite();
const migration = await readFile(new URL('../../supabase/migrations/20261020200734_ch78_max_ingest.sql',import.meta.url),'utf8');
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles(id int primary key, name text); insert into public.profiles values(1,'Fixture');
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  await db.exec(migration);
});
after(()=>db.close());
async function role(name,fn){await db.exec('set role '+name);try{return await fn();}finally{await db.exec('reset role');}}
test('existing site table and data remain untouched',async()=>{
  assert.deepEqual((await db.query('select * from profiles')).rows,[{id:1,name:'Fixture'}]);
});
test('anonymous and signed-in visitors cannot read or write archive',async()=>{
  for(const name of ['anon','authenticated']){
    await role(name,async()=>{
      await assert.rejects(db.query('select * from ch78_max_messages'),/permission denied/);
      await assert.rejects(db.query("insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,source_message) values('-1','unauthorized',1,1,'{}')"),/permission denied/);
    });
  }
});
test('RLS remains effective if a table SELECT is accidentally granted later',async()=>{
  await db.exec("begin; insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,text,source_message) values('-1','rls-hidden',1,1,'private fixture','{}'); grant select on ch78_max_messages to authenticated;");
  try{
    await role('authenticated',async()=>assert.deepEqual((await db.query('select * from ch78_max_messages')).rows,[]));
    const flags=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.ch78_max_messages'::regclass")).rows[0];
    assert.deepEqual(flags,{relrowsecurity:true,relforcerowsecurity:true});
    assert.equal((await db.query("select count(*)::int as n from pg_policies where tablename='ch78_max_messages'")).rows[0].n,0);
  }finally{await db.exec('rollback');}
});
test('handler + PostgreSQL: concurrent redelivery creates one durable row and cannot overwrite it',async()=>{
  const env={CH78_MAX_INGEST_ENABLED:'true',CH78_MAX_WEBHOOK_SECRET:'s'.repeat(40),CH78_MAX_CHAT_ID:'-78143291213122',SUPABASE_URL:PROJECT_URL,SUPABASE_SERVICE_ROLE_KEY:'synthetic'};
  const handler=createHandler({env:n=>env[n],fetchImpl:async(url,options)=>{
    assert.equal(url,PROJECT_URL+'/rest/v1/ch78_max_messages?on_conflict=chat_id,message_id');
    const r=JSON.parse(options.body);
    // Execute equivalent insert against real WASM PostgreSQL, under backend role.
    await db.query(`insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,text,sender,attachments,linked_message,source_message)
      values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) on conflict(chat_id,message_id) do nothing`,
      [r.chat_id,r.message_id,r.message_ts,r.event_ts,r.text,r.sender===null?null:JSON.stringify(r.sender),JSON.stringify(r.attachments),r.linked_message===null?null:JSON.stringify(r.linked_message),JSON.stringify(r.source_message)]);
    return new Response(null,{status:201});
  }});
  const request=text=>new Request('https://local.test',{method:'POST',headers:{'content-type':'application/json','X-Max-Bot-Api-Secret':env.CH78_MAX_WEBHOOK_SECRET},body:JSON.stringify({update_type:'message_created',timestamp:2000,message:{recipient:{chat_id:-78143291213122},timestamp:1000,body:{mid:'concurrent',text}}})});
  await role('service_role',async()=>{
    const responses=await Promise.all(Array.from({length:20},()=>handler(request('Исходный тестовый текст'))));
    assert.ok(responses.every(r=>r.status===200));
    assert.equal((await handler(request('Подмена повтора'))).status,200);
    assert.deepEqual((await db.query("select text from ch78_max_messages where message_id='concurrent'")).rows,[{text:'Исходный тестовый текст'}]);
    await assert.rejects(db.query("delete from ch78_max_messages"),/permission denied/);
    await assert.rejects(db.query("update ch78_max_messages set text='bad'"),/permission denied/);
  });
  assert.equal((await db.query('select count(*)::int as n from ch78_max_messages')).rows[0].n,1);
});
test('storage constraints reject malformed metadata',async()=>{
  await assert.rejects(db.query("insert into ch78_max_messages(chat_id,message_id,message_ts,event_ts,attachments,source_message) values('-1','bad-shape',1,1,'{}','{}')"),/check constraint/);
});
