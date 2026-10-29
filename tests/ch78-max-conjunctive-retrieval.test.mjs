import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,reactionQueries,questionQuery,rankSources} from '../supabase/functions/ch78-max-assistant/handler.mjs';
const project='https://fnwpkmjjdhflnqghnogj.supabase.co',secret='s'.repeat(40),now=1793000000000;
const row=(message_id,content)=>({message_id,content,message_ts:now-1000,author:'Вымышленный автор',score:1});
const noise=Array.from({length:8},(_,i)=>row('noise-'+i,'Виктор обсуждал другие школьные события.'));
async function run(q,lookup){
 const calls=[];let input;
 const env=k=>({SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'test-only',CH78_MAX_WEBHOOK_SECRET:secret,CH78_MAX_CHAT_ID:'-72977812571458',OPENAI_API_KEY:'test-only'}[k]);
 const h=createHandler({env,fetchImpl:async(url,options)=>{
  const b=JSON.parse(options.body);calls.push({url,b});
  if(url.startsWith(project))return Response.json(lookup(b));
  input=JSON.parse(b.input);
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({action:'silence',recipient:'group',intent:'archive_question',reason:'no_added_value',answer:'',citations:[]})}]}]});
 }});
 const r=await h(new Request(project,{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify({action:'reaction',q,post:{message_id:'anchor',message_ts:now,content:q},context:[]})}));
 assert.equal(r.status,200);return {input,calls};
}
test('a topic conjunction preserves evidence displaced by matches on a common name',async()=>{
 const q='Какой двигатель катера обсуждал Виктор?',target=row('engine','Двигатель катера был дизельным.');
 const x=await run(q,b=>b.p_query==='"двигатель" "катера"'?[target]:b.p_query.includes(' OR ')?noise:[]);
 assert.equal(x.input.archive_sources[0].message_id,'engine');
 assert.equal(x.calls.filter(c=>c.url.includes('openai.com')).length,1);
 assert.ok(x.calls.some(c=>c.b.p_query===questionQuery(q)));
});
test('empty stricter searches retain the original broad fallback',async()=>{
 const q='Какой двигатель катера обсуждал Виктор?',target=row('broad','Воспоминание сформулировано другими словами.');
 const x=await run(q,b=>b.p_query===questionQuery(q)?[target]:[]);
 assert.ok(x.input.archive_sources.some(s=>s.message_id==='broad'));
});
test('multiple strict lanes deduplicate evidence and keep the eight-source cap',()=>{
 const p=reactionQueries('Какой двигатель катера обсуждал Виктор?'),target=row('same','Двигатель катера.');
 const batches=p.queries.map(q=>[q,[target,...noise.slice(0,7)]]);
 const ranked=rankSources(batches,p.focus);assert.equal(ranked.length,8);assert.equal(new Set(ranked.map(x=>x.message_id)).size,8);
});
test('every search term comes from the question and total retrieval stays bounded',()=>{
 for(const q of ['Напомните название лагеря?','Кто пел песню «Зелёный берег» в сентябре 2026 года?','Какой двигатель катера обсуждал Виктор?','слово '.repeat(300),'Кто помнит «маяк; DROP TABLE»?']){
  const p=reactionQueries(q),tokens=new Set(q.match(/[\p{L}\p{N}]+/gu)??[]);
  assert.ok(p.queries.length+(p.month_query?1:0)<=6);
  for(const query of p.queries){
   assert.ok(query.length<=300&&!/[;\n]/.test(query));
   if(!/пел|пение|поёт/.test(query))for(const m of query.matchAll(/"([^"]+)"/g))for(const token of m[1].split(' '))assert.ok(tokens.has(token));
  }
 }
});
test('explicit title and order lane retain priority',()=>{
 assert.equal(reactionQueries('Кто заказал «Ночной рейс»?').focus[0],'"Ночной рейс"');
 assert.equal(reactionQueries('Друзья, что заказали к встрече в сентябре 2026 года?').focus[0],'"заказали"');
});
test('a weak first conjunction does not consume every precise reservation',()=>{
 const weak=row('weak','An unrelated mention'),target=row('target','Specific object and action'),another=row('another','Other specific evidence');
 weak.score=0.001;target.score=0.09;another.score=0.1;
 const ranked=rankSources([['"Виктор" "рассказывал"',[weak]],['"первые" "деньги"',[another,target]],['broad',noise]],[], '', ['"Виктор" "рассказывал"','"первые" "деньги"']);
 assert.equal(ranked[0].message_id,'another');assert.equal(ranked[1].message_id,'target');assert.ok(ranked.length<=8);
});
test('precise reservation cannot displace an explicit title lane',()=>{
 const title=row('title','Named event'),specific=row('specific','Two words');title.score=0.001;specific.score=100;
 const ranked=rankSources([['"Синий берег"',[title]],['"катер" "двигатель"',[specific]]],['"Синий берег"'],'',['"катер" "двигатель"']);
 assert.equal(ranked[0].message_id,'title');
});
