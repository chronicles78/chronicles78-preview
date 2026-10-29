// Offline preparation only. No credentials, outgoing requests or paid model calls.
// All supplied source rows are curated fixtures, not a replay of database retrieval.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createHandler} from '../../supabase/functions/ch78-max-assistant/handler.mjs';
import {validConversationInput,reactionPreflight,REACTION_PROTOCOL_VERSION} from '../../supabase/functions/ch78-max-assistant/conversation.mjs';

export async function captureCase(c){
 const q=c.question??c.post.content.slice(0,300);
 if(!q.trim()||q.length>300||!validConversationInput(c.post,c.context))throw Error('invalid_fixture:'+c.slot);
 if(c.context.some(x=>Number(x.message_ts)>=Number(c.post.message_ts)))throw Error('context_not_earlier:'+c.slot);
 const sources=c.sources??[];
 if(sources.some(x=>!x.message_id||!x.author||!x.content||x.message_ts>=c.post.message_ts))throw Error('invalid_fixture_source:'+c.slot);
 const secret='offline-only-'.padEnd(40,'x'),project='https://fnwpkmjjdhflnqghnogj.supabase.co';
 const config={SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'offline',CH78_MAX_CHAT_ID:'-72977812571458',CH78_MAX_WEBHOOK_SECRET:secret,OPENAI_API_KEY:'offline-not-a-key'};
 const captures=[];let stubSearchRequests=0;
 const handler=createHandler({env:n=>config[n],fetchImpl:async(url,opts)=>{
  const body=JSON.parse(opts.body);
  if(url===project+'/rest/v1/rpc/ch78_max_search'||url===project+'/rest/v1/rpc/ch78_max_search_month'){
   stubSearchRequests++;
   return Response.json(sources.map(x=>({...x,score:1})));
  }
  if(url==='https://api.openai.com/v1/responses'){
   captures.push(body);
   // A canned silence lets the handler finish; it is never a model verdict.
   return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({action:'silence',recipient:'group',intent:'other',reason:'no_added_value',answer:'',citations:[]})}]}]});
  }
  throw Error('unexpected_offline_route');
 }});
 const response=await handler(new Request('https://offline.invalid',{method:'POST',headers:{'Content-Type':'application/json','X-Max-Bot-Api-Secret':secret},body:JSON.stringify({action:'reaction',q,post:c.post,context:c.context})}));
 if(response.status!==200)throw Error('capture_failed:'+c.slot+':'+response.status);
 const preflight=reactionPreflight(c.post,c.context);
 return {slot:c.slot,origin:c.origin,fixture_sha256:createHash('sha256').update(JSON.stringify(c)).digest('hex'),protocol:REACTION_PROTOCOL_VERSION,status:preflight?'PROGRAMMATIC_BOUNDARY_OBSERVED':'MODEL_EVALUATION_NOT_RUN',preflight,stub_search_requests:stubSearchRequests,actual_network_requests:0,paid_model_calls:0,stub_model_requests:captures.length,queue_selection_proven:false,retrieval_verified:false,semantics_verified:false,prompts:captures,preview_request:{stage:'preview_reaction',q,post:c.post,context:c.context}};
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw Error('Usage: node capture.mjs FIXTURES.json OUTPUT.json');
 const data=JSON.parse(await readFile(input,'utf8')),results=[];
 for(const c of data.cases)results.push(await captureCase(c));
 const report={status:'PREPARATION_ONLY_NOT_ACCEPTANCE',actual_network_requests:0,paid_model_calls:0,eligible_for_pilot:false,open_slots:data.open_slots??[],results};
 await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify({cases:results.length,programmatic_stops:results.filter(x=>x.preflight).length,prompts_prepared:results.filter(x=>x.prompts.length).length,paid_model_calls:0,semantic_acceptance:'NOT_RUN'})+'\n');
}
