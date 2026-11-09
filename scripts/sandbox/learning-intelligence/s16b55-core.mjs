/** MyWay S1.6B.5.5: pure contingent learner and conservative evidence controls.
 * Never reads/writes files, databases or networks. Never asserts mastery.
 */
import assert from 'node:assert/strict';
import {assessGuard,candidateRoots,teachingContext,memoryDecisionGuard,safeMemoryProposal} from './s16b54-core.mjs';
const str=x=>typeof x==='string'&&x.trim().length>0;
export const SCHEMA55='myway_s16b55_longitudinal_research_v1';
export function validateScenarios(seed){
 if(seed?.schema!=='myway_s16b55_contingent_scenarios_v1'||seed.privacy_class!=='synthetic_example_only'||seed.source!=='researcher_authored_no_real_learners'||!Array.isArray(seed.sessions)||seed.sessions.length!==3)throw Error('Unapproved synthetic S55 scenarios');
 const ids=new Set();for(const session of seed.sessions){if(!str(session.id)||!Array.isArray(session.steps)||session.steps.length!==3)throw Error('Unexpected scenario structure');for(const [i,step] of session.steps.entries()){
  if(ids.has(step.id)||!str(step.id)||!str(step.offline_reply)||!Array.isArray(step.options)||step.options.length!==(i===0?1:2)||!['opener','previous_reply_contains_question_or_try','previous_reply_mentions_atp','previous_reply_mentions_oxygen','previous_reply_mentions_diagram_or_visual'].includes(step.when))throw Error('Unapproved step');ids.add(step.id);
  for(const o of step.options){if(!str(o.key)||!str(o.learner)||o.learner.length>1800||!str(o.evidence_kind))throw Error('Unapproved learner option');assessGuard(o.assessment,o.learner);}
 }}assert.equal(ids.size,9);return seed;
}
export function branchFromReply(step,priorReply){
 if(step.when==='opener')return {option:step.options[0],reason:'session_opener',matched:null};
 if(typeof priorReply!=='string')throw Error('Contingent turn missing prior tutor reply');
 let matched;
 if(step.when==='previous_reply_contains_question_or_try')matched=/\?|\b(?:try|test|check|quiz|question)\b/i.test(priorReply);
 else if(step.when==='previous_reply_mentions_atp')matched=/\batp\b/i.test(priorReply);
 else if(step.when==='previous_reply_mentions_oxygen')matched=/\boxygen\b|\bo2\b/i.test(priorReply);
 else if(step.when==='previous_reply_mentions_diagram_or_visual')matched=/\b(?:diagram|visual|draw|picture)\b/i.test(priorReply);
 else throw Error('Unapproved branch rule');
 return {option:step.options[matched?0:1],reason:step.when,matched};
}
export function createContext(state,sessionId,learner,assessment,mode,{snapshot=null}={}){
 if(!['resumed','full'].includes(mode))throw Error('Unknown history mode');
 const sessionTurns=state.turns.filter(t=>t.session_id===sessionId);
 const visible=mode==='resumed'?sessionTurns:state.turns;
 const view=mode==='resumed'&&snapshot?{...snapshot,turns:visible}:{...state,turns:visible};
 let ctx=teachingContext(view,learner,assessment); // S54 bounded raw history, candidate roots and quotes
 if(mode==='full'){
  const all=visible.flatMap(t=>[{role:'user',content:t.learner},{role:'assistant',content:t.reply}]);
  ctx.messages=[...ctx.messages.slice(0,2),...all,{role:'user',content:learner}];
  if(Buffer.byteLength(JSON.stringify(ctx.messages))>18000)throw Error('Full-history control exceeds safe context cap');
  ctx.raw_prior_messages=all.length;
 }
 const historical=state.turns.length-sessionTurns.length;
 return {messages:ctx.messages,note:ctx.note,raw_prior_messages:ctx.raw_prior_messages,older_raw_messages_exposed:mode==='resumed'?0:historical*2,older_raw_messages_available:historical*2,selected_roots:ctx.note.relevant_historical_roots,
   memory_quote_provenance_complete:ctx.note.relevant_historical_roots.every(r=>str(r.first_learner_quote)&&str(r.source_turn)),history_policy:mode};
}
export function snapshotMemory(state){
 const snapshot=JSON.parse(JSON.stringify({schema:'s55_serialized_provisional_memory_only',topics:state.topics,roots:state.roots,evidence:state.evidence,relationships:state.relationships,visual_proposals:state.visual_proposals}));
 if('turns' in snapshot||'audit' in snapshot||'reply' in snapshot)throw Error('Session snapshot leaked conversation');
 return snapshot;
}
export const C55_SCHEMA={type:'object',additionalProperties:false,properties:{identity:{type:'string',enum:['same','distinct','refinement','uncertain']},anchor_id:{type:['string','null']},rationale:{type:'string'}},required:['identity','anchor_id','rationale']};
export function c55Guard(value,candidates){
 if(!value||!['same','distinct','refinement','uncertain'].includes(value.identity)||!str(value.rationale)||value.rationale.length>350||!Array.isArray(candidates))throw Error('C55 identity output invalid');
 if(value.identity==='refinement'){
  const anchor=candidates.find(x=>x.id===value.anchor_id);
  if(!anchor||!anchor.topicMatched)throw Error('Refinement must cite eligible same-topic historical root');
  return {identity:'refinement',anchor_id:anchor.id,rationale:value.rationale};
 }
 const x=memoryDecisionGuard(value,candidates);
 if(x.identity==='same'&&!candidates.find(y=>y.id===x.anchor_id)?.topicMatched)return {identity:'uncertain',anchor_id:null,rationale:'Cross-topic same-root claim held independently'};
 return x;
}
export function researchMemory(state,turn,assessment,candidates,decision){
 if(decision?.identity==='refinement'){
  const anchor=candidates.find(x=>x.id===decision.anchor_id);
  if(!assessment?.evidence_quote||!turn.learner.includes(assessment.evidence_quote)||!anchor)return {status:'HELD_INVALID_REFINEMENT'};
  state.evidence.push({id:`s55-refinement-${turn.id}`,turn_id:turn.id,root_id:anchor.id,quote:assessment.evidence_quote,observed_root:assessment.root_problem,
     kind:'suggested_refinement_not_approved',source:'verbatim_current_learner',review_required:true});
  return {status:'HELD_REFINEMENT_PROPOSAL',anchor_id:anchor.id,proposed_root:assessment.root_problem,previous_root_unchanged:true,review_required:true};
 }
 return safeMemoryProposal(state,turn,assessment,candidates,decision);
}
export function evidenceQuality(turn,assessment,action){
 return {turn_id:turn.id,session_id:turn.session_id,source:'synthetic_researcher_authored_learner',source_quote:assessment?.evidence_quote??null,
  complete_message:turn.learner,observation_kind:turn.evidence_kind,reported_confidence_is_mastery:false,demonstrated_mastery:false,
  provenance_quote_exact:assessment?.evidence_quote===null||assessment===null||turn.learner.includes(assessment.evidence_quote),
  root_action_status:action.status,review_required:true};
}
export function retrievalDiagnostic(state,assessment,learner){
 const candidates=candidateRoots(state,assessment,learner);
 return {method:'S54_lexical_baseline_NOT_EMBEDDINGS',candidate_count:candidates.length,candidates:candidates.map(x=>({id:x.id,topic:x.topic_label,source_turn:x.source_turn,first_quote:x.first_quote,lexical_similarity:x.lexical_similarity,topic_matched:x.topicMatched})),
  cross_topic_identity_not_automatically_accepted:true,semantic_similarity_not_measured:true};
}
