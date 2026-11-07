/** S1.6B.4A: runtime adapters + fail-closed schema boundaries, no provider/database I/O.
 * The existing shared.ts profile is canonical; this is an ephemeral projected view.
 * The later B/C/D stages may use these shapes; this module does NOT select context,
 * decide interests, write profile updates, or change any current Model B request. */
import {
 LEARNER_INTENTS, CONTEXT_SOURCES, INTEREST_USE_MODES, TEACHING_ACTIONS,
 MYWAY_TEACHING_CONTRACT
} from './s16b4a-teaching-contract.mjs';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=(x,max,label,{allowEmpty=false}={})=>{
 if(typeof x!=='string'||x.length>max||(!allowEmpty&&!x.trim()))throw Error(`Invalid ${label}`);
 return x;
};
const score=(x,label)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)throw Error(`Invalid ${label}`);return x;};
const preference=(x,label)=>{if(typeof x!=='number'||!Number.isFinite(x)||x< -1||x>1)throw Error(`Invalid ${label}`);return x;};
const count=(x,label)=>{if(!Number.isInteger(x)||x<0)throw Error(`Invalid ${label}`);return x;};
const allowed=(x,set,label)=>{if(!set.includes(x))throw Error(`Invalid ${label}`);return x;};
const SIGNAL_KINDS=['bridge_level','jargon_level','presentation_style','support_kind','probe_type','verification_pattern'];
const SIGNAL_DIRECTIONS=['prefer','avoid','verify'];
const SIGNAL_SCOPES=['global','topic','diagnosis_label','probe_type'];
const DOMAIN_SCOPES=['global','topic','diagnosis_label'];
const PRESENTATION_STYLES=['plain_direct','gentle_coaching','analogy_based','metaphor_based','concrete_examples','step_by_step','visual_description','curiosity_question','real_world_connection'];
const BRIDGE=['bridge_0','bridge_1','bridge_2','full_bridge'];
const JARGON=['none','light','standard','full'];

function checkScope(v,kind){allowed(v.scope,kind==='domain'?DOMAIN_SCOPES:SIGNAL_SCOPES,`${kind}.scope`);
 if(v.scope!=='global')text(v.scope_key,180,`${kind}.scope_key`);
 else if(v.scope_key!==undefined&&v.scope_key!==null&&v.scope_key!=='')throw Error('Global scope must not set scope_key');}
function checkSignal(s){if(!obj(s))throw Error('Invalid teaching signal');
 text(s.signal_id,130,'signal_id');allowed(s.kind,SIGNAL_KINDS,'signal.kind');text(s.value,140,'signal.value');allowed(s.direction,SIGNAL_DIRECTIONS,'signal.direction');checkScope(s,'signal');
 preference(s.preference_score,'signal.preference_score');score(s.confidence,'signal.confidence');count(s.evidence_count,'signal.evidence_count');text(s.summary,1000,'signal.summary',{allowEmpty:true});
 return structuredClone(s);
}
function checkDomain(d){if(!obj(d))throw Error('Invalid example domain');text(d.domain,130,'example.domain');checkScope(d,'domain');
 preference(d.preference_score,'domain.preference_score');score(d.confidence,'domain.confidence');count(d.evidence_count,'domain.evidence_count');count(d.recent_use_count,'domain.recent_use_count');
 text(d.summary,1000,'domain.summary',{allowEmpty:true});if(d.last_used_at!==undefined&&d.last_used_at!==null)text(d.last_used_at,90,'last_used_at');return structuredClone(d);
}
function limited(items,max){return {kept:items.slice(0,max),omitted:Math.max(0,items.length-max)};}
/** The adapter does NOT turn interests into teaching preferences or promote inferred signals to facts.
 * Caps are explicit and audited, not hidden; patch B will implement evidence selection. */
export function adaptExistingPersonalization(input={}){
 if(!obj(input))throw Error('Invalid personalization input');
 const profile=input.profile_snapshot??{schema_version:'personalization_profile_snapshot_v1',summary:'',teaching_signals:[],example_domains:[]};
 if(!obj(profile)||profile.schema_version!=='personalization_profile_snapshot_v1'||!Array.isArray(profile.teaching_signals)||!Array.isArray(profile.example_domains))throw Error('Invalid existing profile schema');
 text(profile.summary,3000,'profile.summary',{allowEmpty:true});
 const allSignals=profile.teaching_signals.map(checkSignal),allDomains=profile.example_domains.map(checkDomain);
 const rawInterests=input.user_interests??[];
 if(!Array.isArray(rawInterests))throw Error('user_interests must be an array of evidenced objects');
 const allInterests=rawInterests.map((x,i)=>{
   if(!obj(x))throw Error('Invalid explicit interest');
   return {interest:text(x.interest,120,`interest[${i}]`),user_interest_confidence:score(x.user_interest_confidence,`interest[${i}].confidence`)};
 });
 const style=input.preferred_style??null,bridge=input.bridge_level??null,jargon=input.jargon_level??null;
 if(style!==null)allowed(style,PRESENTATION_STYLES,'preferred_style');
 if(bridge!==null)allowed(bridge,BRIDGE,'bridge_level');
 if(jargon!==null)allowed(jargon,JARGON,'jargon_level');
 const order=input.preferred_order??[];
 if(!Array.isArray(order)||order.length>20)throw Error('Invalid preferred_order');
 order.forEach(x=>allowed(x,PRESENTATION_STYLES,'preferred_order item'));
 const signals=limited(allSignals,64),domains=limited(allDomains,32),interests=limited(allInterests,16);
 return {
   source_schema:'personalization_profile_snapshot_v1',summary:profile.summary,
   teaching_signals:signals.kept,example_domains:domains.kept,explicitly_provided_interests:interests.kept,
   presentation:{bridge_level:bridge,jargon_level:jargon,preferred_style:style,preferred_order:[...order]},
   source_counts:{signals:allSignals.length,example_domains:allDomains.length,explicit_interests:allInterests.length},
   omitted_counts:{signals:signals.omitted,example_domains:domains.omitted,explicit_interests:interests.omitted},
 };
}
/** Schema-first candidate container. Does not choose, truncate, rank or send any history. */
export function createTeachingContextEnvelope({learner,assessment,state={},context_candidates=[],personalization=null,limits={}}={}){
 if(!obj(learner)||!obj(assessment)||!obj(state)||!Array.isArray(context_candidates)||context_candidates.length>200)throw Error('Invalid teaching envelope input');
 const message=text(learner.message,6000,'learner.message'),intent=allowed(learner.intent,LEARNER_INTENTS,'learner.intent');
 const topic=text(assessment.topic,300,'assessment.topic'),root=text(assessment.root_problem,2500,'assessment.root_problem'),quote=text(assessment.evidence_quote,2000,'assessment.evidence_quote');
 const memory={};
 if(state.canonical_difficulty!==undefined&&state.canonical_difficulty!==null){const d=state.canonical_difficulty;if(!obj(d))throw Error('Invalid canonical difficulty');memory.canonical_difficulty={difficulty_id:text(d.difficulty_id,150,'difficulty_id'),root_problem:text(d.root_problem,2500,'canonical root')};}
 for(const key of ['pending_correction_id','reported_progress_note','demonstrated_understanding_note'])if(state[key]!==undefined&&state[key]!==null)memory[key]=text(state[key],key==='pending_correction_id'?180:1200,`state.${key}`);
 const seen=new Set();const candidates=context_candidates.map((x,i)=>{
  if(!obj(x))throw Error('Invalid context candidate');
  const id=text(x.evidence_id,180,`candidate[${i}].evidence_id`);if(seen.has(id))throw Error('Duplicate evidence_id');seen.add(id);
  if(typeof x.verified_as_learner_evidence!=='boolean')throw Error('Missing evidence verification status');
  return {evidence_id:id,source:allowed(x.source,CONTEXT_SOURCES,`candidate[${i}].source`),text:text(x.text,4000,`candidate[${i}].text`),
   ...(x.turn_id?{turn_id:text(x.turn_id,180,'turn_id')}:{}),...(x.difficulty_id?{difficulty_id:text(x.difficulty_id,150,'difficulty_id')}:{}),
   reason_for_consideration:text(x.reason_for_consideration,500,'reason_for_consideration'),
   verified_as_learner_evidence:x.verified_as_learner_evidence};
 });
 if(personalization!==null&&(!obj(personalization)||personalization.source_schema!=='personalization_profile_snapshot_v1'))throw Error('Expected normalized existing personalization profile');
 const ordinary=limits.ordinary_context_token_target??650,correction=limits.correction_context_token_ceiling??1200;
 for(const [n,v] of Object.entries({ordinary,correction}))if(!Number.isInteger(v)||v<100||v>2400)throw Error('Invalid context token target: '+n);
 if(correction<ordinary)throw Error('Correction budget must not be below ordinary budget');
 return {schema_version:'myway_teaching_context_envelope_v1',learner:{message,intent,...(learner.turn_id?{turn_id:text(learner.turn_id,180,'learner.turn_id')}:{})},
   assessment:{topic,root_problem:root,evidence_quote:quote},state:memory,context_candidates:candidates,
   personalization:personalization===null?null:structuredClone(personalization),
   limits:{ordinary_context_token_target:ordinary,correction_context_token_ceiling:correction},
   context_selection_status:'NOT_IMPLEMENTED_IN_4A'};
}
/** Future planning boundary only; this contract is not a prompt generator. */
export function validateTeachingPlan(plan){if(!obj(plan)||plan.schema_version!=='myway_teaching_plan_v1'||plan.status!=='PLANNED_UNTESTED')throw Error('Invalid teaching plan');
 allowed(plan.action,TEACHING_ACTIONS,'teaching.action');text(plan.objective,800,'teaching.objective');
 if(!Array.isArray(plan.reasoning_evidence_ids)||plan.reasoning_evidence_ids.length>20)throw Error('Invalid evidence ids');
 plan.reasoning_evidence_ids.forEach(x=>text(x,180,'evidence id'));
 const d=plan.personalization_decision;if(!obj(d))throw Error('Missing personalization decision');
 allowed(d.use_interest,INTEREST_USE_MODES,'use_interest');text(d.reason,600,'personalization.reason');text(d.anti_distortion_guard,600,'anti_distortion_guard');
 if(d.use_interest==='do_not_use'&&d.chosen_interest!==null&&d.chosen_interest!==undefined&&d.chosen_interest!=='')throw Error('Interest supplied while disabled');
 if(d.use_interest!=='do_not_use')text(d.chosen_interest,120,'chosen_interest');
 if(d.use_interest==='structural_bridge')text(d.structural_mapping,600,'structural_mapping');
 return true;
}
/** Compatibility test only. Does not change the 3-field transport or authorize calls. */
export function validateExistingModelBOutput(out){
 if(!obj(out)||Object.keys(out).sort().join('|')!=='next_step|teaching_strategy|visual_intent')throw Error('Model B transport shape drift');
 for(const field of MYWAY_TEACHING_CONTRACT.outputCompatibility.fields)text(out[field],620,'Model B '+field);
 return true;
}
