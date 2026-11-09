/** S57-R1: human-facing offer/consent and compact evidence-to-teaching bridge.
 * No graphics are rendered. Synthetic interactions are never reported as real learner outcomes.
 */
export const DECISION_SCHEMA={type:'object',additionalProperties:false,properties:{accept:{type:'boolean'},reason:{type:'string'}},required:['accept','reason']};
const bounded=(x,n)=>typeof x==='string'&&x.length<=n;
export function validateDecision(x){if(!x||typeof x.accept!=='boolean'||!bounded(x.reason,280))throw Error('Invalid simulated offer decision');return {accept:x.accept,reason:x.reason};}
export function visibleOffer(plan){if(!plan?.offer)return null;const modality=plan.modality==='3d'?'3D':'2D';return `If you want to try it, we could use a short ${modality} interactive activity: ${plan.title}. ${plan.learner_instruction} Would you like to try?`;}
/** One opportunity after some explanation, not a fixed forced action. This contract only supports the named chemiosmosis scene family. */
export function eligibleForActivity({learner,sessionTurns,activityAlreadySeen}){
 if(activityAlreadySeen||sessionTurns.length<2||typeof learner!=='string')return false;
 const t=learner.toLowerCase();return /(mitochond|chloroplast|thylakoid|proton|atp synthase)/.test(t)&&/(proton|gradient|direction|compartment|flow|similar|compar)/.test(t);
}
export function seededLearnerBelief(profile){return ({
 'adaptive':'No forced answer or misconception: react as a variable, imperfect synthetic learner. Select without seeing private scoring.',
 'needs-feedback':'Synthetic learner initially tends to treat the chloroplast stroma as the proton-rich space; keep this tentative belief if the activity does not change it. Do not act as if chasing a score.',
 'persistent-error':'Synthetic learner holds a persistent mistaken idea about the chloroplast proton compartment and may not correct it after one explanation. Do not deliberately copy private answer keys.',
 'correct':'Synthetic learner is relatively confident in organelle compartments, but still answer from visible controls rather than scoring rules.',
 'decline':'Synthetic learner currently wants to continue verbally rather than open an interactive activity.'
})[profile]??'No scripted preference';}
/** Reasoning not scoring. Keep model A next move intact (never truncate before inclusion). */
export function teachingBrief(observation){
 if(!observation)return null;const e=observation.evidence||{};
 return {source:'synthetic_interaction_not_real_human',scene_id:observation.scene_id,
  accepted:!!e.accepted,first_score:e.first_score,last_score:e.last_score,
  attempts:(e.attempts||[]).map(a=>({attempt:a.attempt,correct:a.correct,total:a.total,request_hint:a.request_hint,
   errors:(a.by_control||[]).filter(c=>!c.correct).map(c=>({control_id:c.control_id,selected_target:c.selected_target})),
   explanation:a.explanation})),
  model_a_assessment_status:observation.assessment_status,
  demonstrated_understanding:observation.assessment?.demonstrated_understanding??null,
  remaining_uncertainty:observation.assessment?.remaining_uncertainty??null,
  transfer_interpretation:observation.assessment?.cross_context_transfer??null,
  next_teaching_move:observation.assessment?.next_teaching_move??null,
  preference_status:'NOT_ESTABLISHED',causal_effect_of_visual:'NOT_ESTABLISHED'};
}
export function adaptationDisposition(evidence,assessment){
 if(!evidence.accepted)return {kind:'declined_no_penalty',next:'Continue by dialogue; learner declined an optional activity.',status:'provisional'};
 const attempts=evidence.attempts.filter(a=>a.accepted),last=attempts.at(-1);const unresolved=(last?.by_control??[]).filter(x=>!x.correct).map(x=>x.control_id);
 return {kind:unresolved.length?'remaining_task_errors':evidence.improvement_after_feedback?'feedback_assisted_success':'first_attempt_success',
  unresolved_control_ids:unresolved,next:assessment?.next_teaching_move??'Check learner reasoning with a different example rather than claim mastery.',status:'provisional_synthetic_observation'};
}
