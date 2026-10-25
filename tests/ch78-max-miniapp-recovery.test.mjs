// Execute the actual UI script against a minimal DOM and fully fake transport.
// No browser/MAX session, real archive, or paid model requests are used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto,randomUUID} from 'node:crypto';
const code=await readFile(new URL('../keeper/app.mjs',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(setImmediate);};
const result={found:true,answer:'Пели Алла и Павел. [S1]',citations:['S1'],sources:[{ref:'S1',author:'Тест',text:'Вымышленный источник',message_ts:1000}]};
class Element {
 constructor(){this.disabled=false;this.hidden=false;this.value='';this.textContent='';this.children=[];this.events={};this.attrs={};}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
 dispatchEvent(event){for(const fn of this.events[event.type]??[])fn(event);}
 setAttribute(k,v){this.attrs[k]=v;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 focus(){} scrollIntoView(){}
}
async function app(transport,{latest=null}={}){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 get('mode').value='forms';get('recovery').hidden=true;get('question').disabled=true;
 const requests=[],brand=new Element();
 const context=vm.createContext({document:{getElementById:get,createElement:()=>new Element(),createTextNode:text=>({textContent:text}),querySelectorAll:()=>[],querySelector:()=>brand,head:new Element()},location:{href:'https://fixture.invalid/keeper/'},window:{WebApp:{initData:'fake-launch'}},URL,Uint8Array,crypto:{randomUUID,getRandomValues:webcrypto.getRandomValues.bind(webcrypto)},AbortSignal,Event,matchMedia:()=>({matches:true}),setTimeout,clearTimeout,fetch:async(_url,options)=>{
  const b=JSON.parse(options.body);if(b.action==='status')return Response.json({messages:10,ai_enabled:true});if(b.action==='recover'&&!b.request_id)return typeof latest==='function'?latest():Response.json(latest??{state:'none'});requests.push(b);return transport(b,requests.length);
 }});
 vm.runInContext(code,context);await flush();
 return {get,requests,fire:(id,type='click')=>get(id).dispatchEvent({type,preventDefault(){}}),flush};
}
function enter(a,text='Кто пел?'){a.get('question').value=text;a.fire('question','input');}
function send(a){a.fire('question-form','submit');}

test('rapid repeated submit and example/tab events cannot create concurrent requests',async()=>{
 let release;const a=await app(()=>new Promise(r=>{release=r;}));enter(a);send(a);send(a);a.fire('tab-search');
 assert.equal(a.requests.length,1);assert.equal(a.get('submit').disabled,true);assert.equal(a.get('tab-search').disabled,true);assert.equal(a.get('question-form').attrs['aria-busy'],'true');
 release(Response.json({state:'done',result}));await a.flush();assert.equal(a.get('results').hidden,false);assert.equal(a.get('submit').disabled,false);
});
test('offline before admission preserves input and request ID for explicit recovery',async()=>{
 const a=await app((_b,n)=>{if(n===1)throw Error('offline');return Response.json({state:'done',result});});enter(a);send(a);await a.flush();
 assert.equal(a.get('recovery').hidden,false);assert.equal(a.get('question').value,'Кто пел?');assert.equal(a.get('submit').disabled,true);
 a.fire('check-result');await a.flush();assert.equal(a.requests[0].request_id,a.requests[1].request_id);assert.equal(a.get('recovery').hidden,true);assert.equal(a.get('results').hidden,false);
});
test('lost completed response is recovered without a second simulated generation',async()=>{
 const completed=new Map();let generations=0;
 const a=await app(b=>{if(completed.has(b.request_id))return Response.json(completed.get(b.request_id));generations++;completed.set(b.request_id,{state:'done',result});throw Error('response_lost');});
 enter(a);send(a);await a.flush();a.fire('check-result');await a.flush();assert.equal(generations,1);assert.equal(a.requests.length,2);assert.equal(a.get('results').hidden,false);
});
test('processing and unknown states never retry automatically; explicit new question gets a new ID',async()=>{
 const a=await app((_b,n)=>Response.json({state:n===1?'processing':'unknown'}));enter(a);send(a);await a.flush();assert.equal(a.requests.length,1);
 a.fire('check-result');await a.flush();assert.equal(a.requests.length,2);assert.equal(a.requests[0].request_id,a.requests[1].request_id);assert.equal(a.get('recovery').hidden,false);
 a.fire('new-question');assert.equal(a.get('submit').disabled,false);send(a);await a.flush();assert.notEqual(a.requests[1].request_id,a.requests[2].request_id);
});
test('malformed transport response and uncertain server result retain same-request recovery',async()=>{
 for(const response of [()=>new Response('invalid JSON'),()=>Response.json({error:'result_unknown'},{status:503}),()=>Response.json({error:'connection_unavailable'},{status:503})]){
  const a=await app(response);enter(a);send(a);await a.flush();assert.equal(a.get('recovery').hidden,false);assert.equal(a.get('submit').disabled,true);assert.equal(a.requests.length,1);
 }
});
test('blank input, terminal failures and expired MAX entry do not loop or auto-submit',async()=>{
 const a=await app(()=>Response.json({state:'failed',result:{error:'answer_unavailable'}}));enter(a,'   ');send(a);await a.flush();assert.equal(a.requests.length,0);
 enter(a);send(a);await a.flush();assert.equal(a.get('recovery').hidden,true);assert.equal(a.get('submit').disabled,false);assert.match(a.get('status').textContent,/Не удалось/);
 const expired=await app(()=>Response.json({error:'launch_expired'},{status:401}));enter(expired);send(expired);await expired.flush();assert.match(expired.get('status').textContent,/Время входа истекло/);assert.equal(expired.requests.length,1);
});
test('full restart restores last completed result without resubmitting input or invoking generation',async()=>{
 const a=await app(()=>{throw Error('offline');});enter(a);send(a);await a.flush();const oldId=a.requests[0].request_id;
 const restored=await app(()=>{throw Error('must not generate');},{latest:{state:'done',request_id:oldId,action:'answer',result}});
 assert.equal(restored.requests.length,0);assert.equal(restored.get('question').value,'');assert.equal(restored.get('results').hidden,false);assert.match(restored.get('status').textContent,/Восстановлен/);
});
test('restart with active or unknown request blocks fresh submission until explicit decision',async()=>{
 for(const state of ['processing','unknown']){const a=await app(()=>Response.json({state:'done',request_id:'old-id',action:'answer',result}),{latest:{state,request_id:'old-id',action:'answer'}});
 assert.equal(a.get('recovery').hidden,false);assert.equal(a.get('submit').disabled,true);a.fire('check-result');await a.flush();assert.equal(a.requests[0].action,'recover');assert.equal(a.requests[0].request_id,'old-id');assert.equal(a.get('results').hidden,false);}
});
test('same-window recovery after offline never creates a missing request',async()=>{
 const a=await app(b=>{if(b.action==='answer')throw Error('offline');return Response.json({state:'none'});});enter(a);send(a);await a.flush();a.fire('check-result');await a.flush();
 assert.equal(a.requests[1].action,'recover');assert.equal(a.get('recovery').hidden,true);assert.equal(a.get('submit').disabled,false);assert.match(a.get('status').textContent,/не найден/);
});
test('startup recovery network failure locks new generation and offers explicit recovery',async()=>{
 const a=await app(()=>{throw Error('unexpected');},{latest:()=>{throw Error('offline');}});assert.equal(a.get('submit').disabled,true);assert.equal(a.get('recovery').hidden,false);assert.equal(a.requests.length,0);
 a.fire('new-question');assert.equal(a.get('submit').disabled,false);assert.match(a.get('status').textContent,/предыдущая попытка/);
});
