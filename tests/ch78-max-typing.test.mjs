import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withTyping} from '../supabase/functions/ch78-max-worker/typing.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup({allowed=true,wrongBot=false,success=true,network=false}={}){
 const calls=[],timers=new Map();let id=0,gateCalls=0;
 return {calls,timers,get gateCalls(){return gateCalls},options:{env:()=> 'token',gate:async()=>{gateCalls++;return typeof allowed==='function'?allowed():allowed;},
  schedule:fn=>{timers.set(++id,fn);return id},cancel:key=>timers.delete(key),
  fetchImpl:async(url)=>{calls.push(url);if(network)throw Error('network');return Response.json(url.endsWith('/me')?{user_id:wrongBot?99:531401311,is_bot:true}:{success});}},
  async tick(){const [key,fn]=timers.entries().next().value;timers.delete(key);fn();await flush();}};
}
test('refreshes while model runs, checks identity once, then cancels timer',async()=>{
 const s=setup(),task=deferred();let models=0;
 const result=withTyping(()=>{models++;return task.promise},s.options);await flush();
 assert.equal(s.calls.length,2);await s.tick();assert.equal(s.calls.length,3);assert.equal(s.gateCalls,2);
 task.resolve('answer');assert.equal(await result,'answer');assert.equal(models,1);assert.equal(s.timers.size,0);
});
test('disabled gate and missing token cause no MAX effects',async()=>{
 for(const missing of [false,true]){const s=setup({allowed:false}),task=deferred();if(missing)s.options.env=()=>'';
  const result=withTyping(()=>task.promise,s.options);await flush();task.resolve(4);assert.equal(await result,4);assert.deepEqual(s.calls,[]);}
});
test('identity mismatch, network failure and API success=false do not affect answer',async()=>{
 for(const config of [{wrongBot:true},{network:true},{success:false}]){
  const s=setup(config),task=deferred();const result=withTyping(()=>task.promise,s.options);await flush();
  assert.equal(s.timers.size,0);task.resolve('ok');assert.equal(await result,'ok');assert.equal(s.calls.length,config.success===false?2:1);
 }
});
test('stops refresh when gate switches off',async()=>{
 let allowed=true;const s=setup({allowed:()=>allowed}),task=deferred();const result=withTyping(()=>task.promise,s.options);await flush();
 allowed=false;await s.tick();assert.equal(s.calls.length,2);assert.equal(s.timers.size,0);task.resolve();await result;
});
test('bounded pulses even with an indefinitely running task',async()=>{
 const s=setup(),task=deferred();const result=withTyping(()=>task.promise,s.options);await flush();
 for(let i=0;i<17;i++)await s.tick();assert.equal(s.calls.length,19);assert.equal(s.timers.size,0);task.resolve();await result;
});
test('model failure cancels indicator without retry',async()=>{
 const s=setup(),task=deferred();let models=0;const result=withTyping(()=>{models++;return task.promise},s.options);await flush();
 task.reject(Error('model'));await assert.rejects(result,/model/);assert.equal(s.timers.size,0);assert.equal(models,1);
});
test('completion aborts a pending gate and sends no late status',async()=>{
 const s=setup();let aborted=false;
 s.options.gate=signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('abort'))},{once:true}));
 assert.equal(await withTyping(async()=> 'fast',s.options),'fast');assert.equal(aborted,true);assert.equal(s.calls.length,0);
});
test('completion aborts an in-flight MAX request',async()=>{
 const s=setup(),task=deferred();let aborted=false;
 s.options.fetchImpl=async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(Error('abort'))},{once:true}));
 const result=withTyping(()=>task.promise,s.options);await flush();task.resolve('ok');assert.equal(await result,'ok');assert.equal(aborted,true);assert.equal(s.timers.size,0);
});
