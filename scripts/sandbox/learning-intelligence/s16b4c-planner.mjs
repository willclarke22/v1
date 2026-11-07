/**
 * S1.6B.4C — an inspectable, deterministic teaching-action planner.
 * Uses the 4A envelope and the 4B selected evidence. No inference, I/O,
 * profile writes, or new memory claims. 4D will wire this into a shadow run.
 */
import {TEACHING_ACTIONS} from './s16b4a-teaching-contract.mjs';
import {validateTeachingPlan} from './s16b4a-interfaces.mjs';

export const TEACHING_PLANNER_VERSION='myway_teaching_planner_v1';
export const TEACHING_FOCUSES=Object.freeze(['auto','mechanism','misconception','check','progress']);
export const CLARIFICATION_STATUSES=Object.freeze(['UNRESOLVED','RESOLVED_NO_CHANGE','REPAIR_PROPOSED_UNAPPLIED']);
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const ready=new Set(['READY','READY_WITH_GAPS']);
const validatedSelection=s=>isObj(s)&&s.schema_version==='myway_context_selection_result_v1'&&Array.isArray(s.selected)&&isObj(s.audit)&&typeof s.context_text==='string'&&isObj(s.usage);
const signal=x=>({chosen_interest:null,use_interest:'do_not_use',reason:'4C does not choose interests; evidence-based selection is reserved for 4D.',structural_mapping:'',anti_distortion_guard:'Never insert an interest unless 4D validates a useful, faithful connection.'});

function actionFor(intent,focus,closure){
 if(intent==='correction')return 'acknowledge_correction';
 if(intent==='clarification_answer')return closure==='UNRESOLVED'?'acknowledge_correction':'close_clarification';
 if(intent==='reported_progress')return focus==='check'?'verify_understanding':'advance_after_progress';
 if(focus==='misconception')return 'repair_misconception';
 if(focus==='check')return 'verify_understanding';
 if(intent==='follow_up')return 'extend_follow_up';
 return 'explain_missing_mechanism';
}
const OBJECTIVES=Object.freeze({
 explain_missing_mechanism:'Build the missing causal link in the assessed root difficulty; avoid restating definitions alone.',
 repair_misconception:'Contrast the specific, evidence-supported misconception with the correct mechanism, without inventing beliefs.',
 extend_follow_up:'Address the new unresolved link using only relevant earlier teaching; do not restart the lesson.',
 acknowledge_correction:'Reflect the correction accurately, avoid any claim of changed history, and ask only for missing distinguishing evidence.',
 close_clarification:'Confirm what the clarification resolved, avoid another unsolicited explanation, and offer a concise continuation if useful.',
 verify_understanding:'Offer one meaningful application, prediction, or comparison; do not imply demonstrated mastery without evidence.',
 advance_after_progress:'Acknowledge reported progress as a report; offer a sensible next step without declaring mastery.'
});
/**
 * Planner inputs are already validated by 4A and 4B. Reselect evidence using
 * 4B rather than trusting hints, and never infer a correction target by recency.
 */
export function planTeachingMove(envelope,selection,{focus='auto',clarificationStatus='UNRESOLVED'}={}){
 if(!isObj(envelope)||envelope.schema_version!=='myway_teaching_context_envelope_v1'||!isObj(envelope.learner))throw Error('Expected validated 4A envelope');
 if(!validatedSelection(selection)||selection.learner_intent!==envelope.learner.intent)throw Error('Expected corresponding 4B context selection');
 if(!TEACHING_FOCUSES.includes(focus)||!CLARIFICATION_STATUSES.includes(clarificationStatus))throw Error('Invalid teaching planner options');
 const intent=envelope.learner.intent;
 const blocked=!ready.has(selection.status)||Boolean(selection.audit.requiresHumanReview);
 if(blocked)return {
  schema_version:'myway_teaching_decision_v1',planner_version:TEACHING_PLANNER_VERSION,status:'BLOCKED_CONTEXT',
  action:null,plan:null,reason:'Required historical context is missing, excluded, or too large. Do not guess a corrected event or present incomplete evidence as resolved.',
  context_status:selection.status,selected_evidence_ids:[],requires_human_review:true,model_generation_authorized:false
 };
 // 4B supplies exact historical-target evidence for correction and clarification.
 const target=new Set(selection.audit.requiredTargets??[]),turns=selection.audit.requiredTurns??[];
 if(['correction','clarification_answer'].includes(intent)&&(target.size+turns.length===0 || !selection.selected.some(x=>x.inclusion_reason==='explicit_historical_target'))){
  return {schema_version:'myway_teaching_decision_v1',planner_version:TEACHING_PLANNER_VERSION,status:'BLOCKED_CONTEXT',action:null,plan:null,reason:'No exact eligible historical correction anchor.',context_status:selection.status,selected_evidence_ids:[],requires_human_review:true,model_generation_authorized:false};
 }
 const action=actionFor(intent,focus,clarificationStatus);
 if(!TEACHING_ACTIONS.includes(action))throw Error('Unknown teaching action');
 const evidence=selection.selected.map(e=>e.evidence_id);
 const plan={schema_version:'myway_teaching_plan_v1',action,objective:OBJECTIVES[action],reasoning_evidence_ids:evidence,
  personalization_decision:signal(),status:'PLANNED_UNTESTED'};
 validateTeachingPlan(plan);
 return {schema_version:'myway_teaching_decision_v1',planner_version:TEACHING_PLANNER_VERSION,status:'READY_UNTESTED',action,plan,
  context_status:selection.status,selected_evidence_ids:evidence,clarification_status:clarificationStatus,
  // A pending or proposed correction never authorizes claiming that history was changed.
  memory_change_claim_authorized:false,model_generation_authorized:false,requires_human_review:false,
  reason:'Deterministic intent/action routing; pedagogical effectiveness and learner understanding are not established.'};
}
