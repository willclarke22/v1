/** S56: small pure learning-memory research model. No persistence, policy engine or product routes. */
import crypto from 'node:crypto';
import {overlap} from './s16b54-core.mjs';
export const SCHEMA='myway_s16b56_integrated_journey_v1';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const id=(prefix,key)=>prefix+'-'+sha('myway-s56|'+key).slice(0,14);
const clean=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const bounded=s=>typeof s==='string'&&s.trim()&&s.length<=2000;
export function scenarioCheck(s){
 if(s?.schema!=='myway_s16b56_synthetic_journey_v1'||s?.source!=='researcher_authored_synthetic_not_human'||s.sessions?.length!==3)throw Error('Synthetic S56 scenario required');
 let n=0;const ids=new Set();for(const ses of s.sessions){if(!bounded(ses.id)||ses.steps?.length!==4)throw Error('Invalid session');for(const step of ses.steps){if(ids.has(step.id)||!bounded(step.learner)||!bounded(step.aim)||!bounded(step.offline_reply))throw Error('Invalid step');ids.add(step.id);n++;}}if(n!==12)throw Error('Expected twelve synthetic goals');return s;
}
export function createState(){return {topics:[],roots:[],observations:[],holds:[],commitments:[],visuals:[],relationships:[],turns:[],preferences:[],authoritative_writes:0,db_writes:0};}
export function sessionDialogue(state,sessionId,mode){const turns=mode==='full'?state.turns:state.turns.filter(t=>t.session_id===sessionId);return turns.slice(-20).flatMap(t=>[{role:'user',content:t.learner},{role:'assistant',content:t.reply}]);}
function similarity(a,b){return overlap(a,b);}
export async function retrieve(state,message,{method='lexical',request=fetch}={}){
 if(!['lexical','semantic'].includes(method))throw Error('Retrieval method must be explicit');
 const roots=state.roots;if(!roots.length)return {method,candidates:[],scored:[],note:'no history'};
 let scores=[];
 if(method==='semantic'){
  const strings=[message,...roots.map(r=>r.root_problem+' | '+r.first_quote)];
  if(strings.length>45)throw Error('Local embeddings batch cap');
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),30000);let response;
  try{response=await request('http://127.0.0.1:8001/embed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:strings}),signal:ac.signal,redirect:'error'});}finally{clearTimeout(timer);}
  if(!response.ok)throw Error('Local embeddings unavailable HTTP '+response.status+'; no silent lexical fallback');
  const o=await response.json();if(o.vectors?.length!==strings.length||!o.vectors.every(v=>Array.isArray(v)&&v.length===384&&v.every(Number.isFinite)))throw Error('Invalid local 384D embeddings');
  const cos=(a,b)=>{let p=0,x=0,y=0;for(let i=0;i<384;i++){p+=a[i]*b[i];x+=a[i]**2;y+=b[i]**2;}return x&&y?p/Math.sqrt(x*y):0;};
  scores=roots.map((r,i)=>({root:r,score:+cos(o.vectors[0],o.vectors[i+1]).toFixed(4)}));
 }else scores=roots.map(root=>({root,score:similarity(message,root.root_problem+' '+root.first_quote)}));
 scores.sort((a,b)=>b.score-a.score);
 // A discovery filter, not an identity or memory-write rule; include no roots if unsupported.
 const floor=method==='semantic'?0.24:0.08;
 return {method,candidates:scores.filter(x=>x.score>=floor).slice(0,4).map(({root,score})=>({...root,similarity:score,topic_label:state.topics.find(t=>t.id===root.topic_id)?.label??'unknown'})),scored:scores.map(({root,score})=>({root_id:root.id,similarity:score})),note:'similarity proposes candidates, never determines root identity'};
}
export function contextForB(state,{sessionId,message,history,retrieval,personalization='on'}){
 const raw=sessionDialogue(state,sessionId,history);const memory=retrieval.candidates.slice(0,3).map(r=>({id:r.id,root:r.root_problem,original_learner_quote:r.first_quote,source_turn:r.source_turn,confidence:'provisional',similarity:r.similarity}));
 const prefs=personalization==='on'?state.preferences.slice(-2).map(p=>({preference:p.preference,learner_excerpt:p.quote})):[];
 const messages=[{role:'system',content:'You are MyWay, a natural, accurate, concise tutor. Answer the learner\'s actual current request. Respond to corrections and explicit instructions; ask clarifying questions only if needed. If asked for a check, ask a suitable question rather than explaining the answer. Historical memory is unverified supporting context, never proof of mastery or a mandate to repeat teaching. Do not claim that a visual has been rendered, or that durable learner memory has been changed. Tone is warm but not scripted. Keep mechanisms scientifically accurate.'},
  {role:'system',content:'Optional evidence-backed learning context (unverified): '+JSON.stringify({relevant_roots:memory,preferences:prefs})},...raw,{role:'user',content:message}];
 if(Buffer.byteLength(JSON.stringify(messages))>23000)throw Error('Research tutor context cap exceeded');
 return {messages,raw_prior_messages:raw.length,older_raw_messages_exposed:history==='full'?state.turns.filter(t=>t.session_id!==sessionId).length*2:0,memory,preferences:prefs};
}
export function recordPreference(state,message,turnId){if(/please keep it brief|short explanations|concise explanations/i.test(message))state.preferences.push({source_turn:turnId,preference:'concise explanations',quote:message});}
export function createObservation(state,{turnId,sessionId,learner,assessment,source}){
 const quote=assessment?.evidence_quote&&learner.includes(assessment.evidence_quote)?assessment.evidence_quote:learner.slice(0,Math.min(130,learner.length));
 const obs={id:id('obs',turnId),turn_id:turnId,session_id:sessionId,source:'synthetic_learner',learner_message_sha256:sha(learner),verbatim_quote:quote,assessment_source:source,kind:assessment?.kind??'unclassified',root_hypothesis:assessment?.root_problem??null,demonstrated_mastery:false,review_required:true};state.observations.push(obs);return obs;
}
export function recordCommitment(state,turnId,learner,reply){
 if(/\b(?:check me|test me|quiz me|ask me (?:one|a) question)\b/i.test(learner)){
  state.commitments.push({id:id('commitment',turnId),turn_id:turnId,request:'understanding_check',status:/\?/.test(reply)?'question_delivered_not_yet_answered':'requested_not_delivered',learner_quote:learner});
 }
 return state.commitments.at(-1)??null;
}
export function observeIntent(state,{turnId,learner,assessment}){
 let visual=null,relationship=null;
 if(/\b(?:before|not yet|later|first)\b.{0,65}\b(?:diagram|drawing|visual)\b|\b(?:diagram|drawing|visual)\b.{0,40}\b(?:later|not yet)\b/i.test(learner)){
  for(const v of state.visuals.filter(x=>x.status==='proposed'))v.status='deferred';
 }else if(/\b(?:can|could|please|would)\b.{0,45}\b(?:draw|show|create|make)\b.{0,45}\b(?:diagram|visual|drawing)\b|\bdiagram could help\b/i.test(learner)){
  visual={id:id('visual',turnId),turn_id:turnId,request_quote:learner,educational_objective:learner.slice(0,350),status:'proposed',rendered:false};state.visuals.push(visual);
 }
 if(/\b(?:related|same mechanism|similar|compare|difference|different)\b/i.test(learner)&&state.topics.length>1){
  relationship={id:id('relationship',turnId),source_turn:turnId,learner_quote:learner,candidate_topic_ids:state.topics.slice(-3).map(t=>t.id),status:'topic_connection_to_review',root_identity_implied:false};state.relationships.push(relationship);
 }
 return {visual,relationship};
}
export function memoryProposal(state,{turnId,sessionId,assessment,decision,candidates,rawDecision}){
 if(!assessment?.root_problem||!assessment.evidence_quote)return {status:'observation_only',reason:'No grounded current root proposed'};
 if(!decision)return {status:'held',reason:'No valid identity proposal',candidates:candidates.map(x=>x.id)};
 if(decision.identity==='uncertain'){
  const hold={turn_id:turnId,reason:decision.rationale,candidate_root_ids:candidates.map(x=>x.id)};state.holds.push(hold);return {status:'held',hold};
 }
 if(['same','refinement'].includes(decision.identity)){
  const root=state.roots.find(x=>x.id===decision.anchor_id);if(!root)return {status:'held',reason:'Unrecognized historical anchor'};
  root.observation_turn_ids.push(turnId);
  return {status:decision.identity==='same'?'provisional_reuse':'proposed_refinement',root_id:root.id,original_root_unchanged:true,review_required:true};
 }
 if(decision.identity!=='distinct')return {status:'held',reason:'Unknown identity'};
 // Topic label is descriptive metadata, not a veto for historical root identity.
 const label=assessment.topic_label;const existing=state.topics.find(t=>{const a=clean(t.label),b=clean(label);return a===b||a.length>=8&&b.includes(a)||b.length>=8&&a.includes(b);});
 const topic=existing??{id:id('topic',turnId),label,status:'provisional'};if(!existing)state.topics.push(topic);
 const root={id:id('root',turnId),topic_id:topic.id,root_problem:assessment.root_problem,first_quote:assessment.evidence_quote,source_turn:turnId,observation_turn_ids:[turnId],status:'provisional'};state.roots.push(root);
 return {status:'provisional_new_root',root_id:root.id,topic_id:topic.id,review_required:true};
}
export function projection(state){return {schema:'myway_s16b56_readonly_projection_v1',simulation_only:true,semantic_layout_claim:false,topics:state.topics,roots:state.roots,relationships:state.relationships,visual_proposals:state.visuals,observations_count:state.observations.length,authoritative_writes:0};}
