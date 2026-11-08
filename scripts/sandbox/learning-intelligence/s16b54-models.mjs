/** Research Model A / B / C adapters. They all use GPT-4.1 mini in this experiment.
 * This is NOT the production adapters; offline is scripted. No DB access. */
import {assessGuard,memoryDecisionGuard,overlap} from './s16b54-core.mjs';
export const MODEL='gpt-4.1-mini';
const nullable={type:['string','null']};
export const A_SCHEMA={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['new_or_continuing_difficulty','question_or_followup','reported_progress','correction','clarification','other']},topic_label:{type:'string'},root_problem:nullable,evidence_quote:nullable,uncertainty:{type:'string',enum:['low','medium','high']}},required:['kind','topic_label','root_problem','evidence_quote','uncertainty']};
export const B_SCHEMA={type:'object',additionalProperties:false,properties:{reply:{type:'string'}},required:['reply']};
export const C_SCHEMA={type:'object',additionalProperties:false,properties:{identity:{type:'string',enum:['same','distinct','uncertain']},anchor_id:nullable,rationale:{type:'string'}},required:['identity','anchor_id','rationale']};
const str=(s,max=4000)=>typeof s==='string'&&!!s.trim()&&s.length<=max;
export function validatedJson(raw,schema){let o;try{o=JSON.parse(raw)}catch{throw Error('Model returned non-JSON content')};if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join('|')!==Object.keys(schema.properties).sort().join('|'))throw Error('Model returned unexpected JSON fields');return o;}
export function validateReply(raw){const o=validatedJson(raw,B_SCHEMA);if(!str(o.reply,4000))throw Error('Invalid Model B reply');return o.reply.trim();}
export function requestA(state,current){
 const recent=state.turns.slice(-4).map(t=>({learner:t.learner,myway_reply:t.reply}));
 const system='You are MyWay Model A in a READ-ONLY learning research simulation. From the current learner message and the latest dialogue, identify a subject and a possible root difficulty only when supported. Preserve uncertainty; an ordinary follow-up or reported progress is not automatically a new problem. The evidence_quote must be an exact contiguous substring of the CURRENT learner message (or null). If there is no grounded root difficulty, use null. A root is a hypothesis, not a confirmed misconception. Return JSON schema fields only.';
 const user=JSON.stringify({current_learner_message:current,previous_dialogue:recent});
 if(Buffer.byteLength(user)>10500)throw Error('Assessment input too large');
 return {model:MODEL,store:false,messages:[{role:'system',content:system},{role:'user',content:user}],max_tokens:280,response_format:{type:'json_schema',json_schema:{name:'myway_s16b54_A',strict:true,schema:A_SCHEMA}}};
}
export function requestB(teaching){return {model:MODEL,store:false,messages:teaching.messages,max_tokens:550,response_format:{type:'json_schema',json_schema:{name:'myway_s16b54_B',strict:true,schema:B_SCHEMA}}};}
export function requestC(assessment,candidates,current){
 const system='You are MyWay Model C in a LOCAL, READ-ONLY research simulation. Decide whether the newly proposed root describes the SAME underlying difficulty as one listed candidate, a DISTINCT difficulty, or is UNCERTAIN. A shared topic or word overlap does not prove same identity. For SAME, cite the exact candidate root ID in anchor_id. For distinct or uncertain, anchor_id must be null. Do not alter any historical roots; do not infer mastery or learner identity. The current statement is the only new learner evidence. Reply using the strict JSON schema.';
 const context={topic:assessment.topic_label,proposed_root:assessment.root_problem,current_learner_message:current,exact_evidence_quote:assessment.evidence_quote,candidates:candidates.map(c=>({id:c.id,topic:c.topic_label,root:c.root_problem,original_quote:c.first_quote,source_turn:c.source_turn}))};
 if(Buffer.byteLength(JSON.stringify(context))>6000)throw Error('Memory-adjudication input too large');
 return {model:MODEL,store:false,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(context)}],max_tokens:230,response_format:{type:'json_schema',json_schema:{name:'myway_s16b54_C',strict:true,schema:C_SCHEMA}}};
}
export function offlineA(turn){return assessGuard({...turn.offline_assessment,source:'OFFLINE_AUTHOR_SCRIPT_NOT_MODEL_A'},turn.learner);}
export function offlineB(turn){if(!str(turn.offline_reply,4000))throw Error('Missing offline authored tutor reply');return turn.offline_reply;}
export function offlineC(assessment,candidates){
 if(!assessment?.root_problem)return null;
 if(candidates.length===0)return {identity:'distinct',anchor_id:null,rationale:'OFFLINE fixture: no root candidates; provisional new root, not validated identity'};
 const sameTopic=candidates.filter(c=>c.topicMatched);
 const ranked=sameTopic.map(c=>({...c,sim:overlap(c.root_problem,assessment.root_problem)})).sort((a,b)=>b.sim-a.sim);
 if(ranked[0]?.sim>=0.52)return memoryDecisionGuard({identity:'same',anchor_id:ranked[0].id,rationale:'OFFLINE lexical similarity only; not semantic adjudication'},candidates);
 if(ranked.length===0)return {identity:'distinct',anchor_id:null,rationale:'OFFLINE no same-topic candidate; provisional only'};
 return {identity:'uncertain',anchor_id:null,rationale:'OFFLINE ambiguity; lexical overlap insufficient for identity inference'};
}
export function credentials(){
 if(process.env.VERCEL==='1'||process.env.CI==='true'||process.env.NODE_ENV==='production')throw Error('Cloud/CI/production model calls prohibited');
 const key=process.env.OPENAI_API_KEY;if(!str(key,1000))throw Error('OPENAI_API_KEY missing; no calls made');
 let u;try{u=new URL((process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'')+'/chat/completions')}catch{throw Error('Invalid provider URL')};
 if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]','::1'].includes(u.hostname)))throw Error('Provider URL must use HTTPS or localhost');
 return {key,url:u.toString()};
}
export const RATE={input:0.4,cache:0.1,output:1.6};
export function usageCost(u){
 if(!u||!Number.isSafeInteger(u.prompt_tokens)||u.prompt_tokens<0||!Number.isSafeInteger(u.completion_tokens)||u.completion_tokens<0)throw Error('Unknown provider token usage: stop');
 const cached=u.prompt_tokens_details?.cached_tokens??0;if(!Number.isSafeInteger(cached)||cached<0||cached>u.prompt_tokens)throw Error('Invalid cached tokens');
 return Number(((u.prompt_tokens-cached)*RATE.input/1e6+cached*RATE.cache/1e6+u.completion_tokens*RATE.output/1e6).toFixed(9));
}
export async function callProvider(payload,ctx){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),32000);
 let res;try{res=await fetch(ctx.url,{method:'POST',headers:{Authorization:'Bearer '+ctx.key,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',cache:'no-store',signal:controller.signal})}finally{clearTimeout(timer)}
 if(!res.ok)throw Error('Provider returned HTTP '+res.status);
 const body=await res.json();const content=body?.choices?.[0]?.message?.content;
 if(typeof content!=='string'||body?.choices?.[0]?.finish_reason!=='stop')throw Error('Provider response missing or truncated');
 return {raw:content,usage:body.usage,model:body.model??null,finishReason:body.choices[0].finish_reason};
}
