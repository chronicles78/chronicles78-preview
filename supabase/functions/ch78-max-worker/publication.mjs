import {REACTION_PROTOCOL_VERSION,validConversationInput,reactionPreflight} from '../ch78-max-assistant/conversation.mjs';

// Necessary conditions only. A valid citation does not prove semantic truth.
// Caller supplies a fresh database context, never a model-provided post.
export function publicationDecision(result,post,context){
 const deny=reason=>({allowed:false,reason});
 if(!validConversationInput(post,context))return deny('invalid_context');
 if(reactionPreflight(post,context))return deny('conversation_boundary');
 const p=result?.publication,c=result?.conversation;
 if(p?.protocol_version!==REACTION_PROTOCOL_VERSION||p.anchor_id!==post.message_id||p.anchor_ts!==Number(post.message_ts))return deny('protocol_or_anchor');
 if(result?.mode!=='reaction'||result.found!==true||result.error||c?.stage!=='model'||c.version!==1||
  c.action!=='reply'||c.proposed_action!=='reply'||c.recipient!=='group'||c.intent!=='archive_question'||c.reason!=='archive_link')return deny('pilot_scope');
 if(typeof result.answer!=='string'||!result.answer.trim()||result.answer.length>600||
  /[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(result.answer))return deny('invalid_answer');
 const {citations,sources}=result;
 if(!Array.isArray(citations)||citations.length<1||citations.length>8||new Set(citations).size!==citations.length||
  citations.some(x=>typeof x!=='string'||!/^S[1-8]$/.test(x))||!Array.isArray(sources)||sources.length<1||sources.length>8)return deny('invalid_citations');
 const refs=new Set(),ids=new Set();
 for(const source of sources){
  if(!source||typeof source.ref!=='string'||!/^S[1-8]$/.test(source.ref)||refs.has(source.ref)||
   typeof source.message_id!=='string'||!source.message_id.length||source.message_id.length>512||ids.has(source.message_id)||
   source.message_id===post.message_id||!Number.isSafeInteger(source.message_ts)||source.message_ts<0||source.message_ts>=Number(post.message_ts)||
   !Number.isFinite(new Date(source.message_ts).getTime())||typeof source.author!=='string'||typeof source.text!=='string'||!source.text.trim())return deny('invalid_source');
  refs.add(source.ref);ids.add(source.message_id);
 }
 if(citations.some(x=>!refs.has(x)))return deny('invalid_citations');
 const inline=[...result.answer.matchAll(/\[S([0-9]+)\]/g)].map(m=>'S'+m[1]);
 if(!inline.length||inline.some(x=>!citations.includes(x))||citations.some(x=>!inline.includes(x)))return deny('invalid_citations');
 return {allowed:true,reason:'verified_archive_reply'};
}
