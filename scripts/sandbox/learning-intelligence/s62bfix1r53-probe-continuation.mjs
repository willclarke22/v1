/** R5.2P: typed, evidence-linked probe continuation. No provider calls here.
 * A browser probe is not a fabricated human chat message, a correct answer, or
 * independently rendered manipulation. All decisions use saved source records.
 */
import crypto from 'node:crypto';
export const ATTEMPT_RE=/^pa[0-9]{4,}$/;
export const sourceHash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assert=(condition,reason)=>{if(!condition)throw Error('R52P: '+reason);};
const clip=(value,n)=>String(value??'').slice(0,n);
export function probeContinuationContext(state,attemptId){
 assert(state?.schema==='myway_goldloop_human_v1'&&typeof state.learner==='string','Invalid session state');
 assert(ATTEMPT_RE.test(attemptId??''),'Invalid saved attempt ID');
 const attempts=state.probe_attempts??[];
 const attempt=attempts.find(a=>a.attempt_id===attemptId);
 assert(attempt&&attempt.schema==='myway_human_probe_attempt_v1','Unknown structured probe attempt');
 assert(attempt.session_id===state.learner&&attempt.status==='submitted','Only a submitted probe from this session can continue');
 assert(attempts.at(-1)?.attempt_id===attemptId,'A newer probe attempt exists; review rather than continuing stale evidence');
 const sourceTurn=state.turns?.find(t=>t.turn_id===attempt.turn_id);
 assert(sourceTurn&&state.turns.at(-1)?.turn_id===sourceTurn.turn_id,'The probe must belong to the most recent completed learning turn');
 assert(sourceTurn.topic_id===attempt.topic_id,'Probe topic differs from source turn');
 const topic=state.topics?.find(t=>t.id===attempt.topic_id);
 assert(topic,'The probe topic no longer exists');
 const plan=sourceTurn.probe_plan??sourceTurn.B_output?.probe_plan;
 assert(plan?.offer===true&&sourceHash(plan)===attempt.task_sha256,'Offered task changed since submission');
 const observation=state.observations?.find(o=>o.id===attempt.evidence_id);
 assert(observation&&observation.id===`${attemptId}-IN`&&observation.topic_id===topic.id&&observation.kind==='human_probe_attempt','Authoritative probe evidence is missing or inconsistent');
 assert(observation.conditions?.attempt_id===attemptId,'Probe evidence provenance is inconsistent');
 assert(!state.turns.some(t=>t.continuation_source?.attempt_id===attemptId),'This probe already generated a completed continuation');
 const attemptSha=sourceHash(attempt);
 // This is explicitly a host-created EVENT MARKER, not user-authored chat.
 const marker=JSON.stringify({input_kind:'submitted_probe_attempt',attempt_id:attemptId,evidence_id:attempt.evidence_id,source_turn_id:sourceTurn.turn_id,topic_id:topic.id,attempt_sha256:attemptSha});
 const answer=clip(attempt.learner_answer,3500);
 const response=answer||clip(attempt.selection,350)||clip(JSON.stringify({order:attempt.ordered_items,matches:attempt.matches,selected_items:attempt.selected_items,values:attempt.values}),3500);
 const visibleText=`Submitted ${attempt.modality} probe (${attemptId}, originally offered in ${sourceTurn.turn_id}): ${response}`.slice(0,3900);
 return {attempt,sourceTurn,topic,observation,attemptSha,marker,visibleText};
}
export function probeModelEvidence(info){
 const a=info.attempt;
 return {input_kind:'submitted_probe_attempt',original_attempt_id:a.attempt_id,original_evidence_id:a.evidence_id,original_turn_id:a.turn_id,original_topic_id:a.topic_id,original_scene_id:a.scene_id,original_task_sha256:a.task_sha256,experience_design_sha256:a.experience_design_sha256??null,experience_steps:(a.experience_steps??[]).slice(0,5),original_attempt_sha256:info.attemptSha,task_as_offered:a.task_as_offered,educational_purpose:a.probe_purpose,modality:a.modality,status:a.status,learner_answer:a.learner_answer,selection:a.selection,ordered_items:a.ordered_items,matches:a.matches,selected_items:a.selected_items,values:a.values,hints_requested:a.hints_requested,action_log:(a.action_log??[]).slice(-12),source_is_real_browser_submission:true,correctness_not_independently_scored:true,placeholder_not_real_renderer:true,original_experience_is_unscored:true,not_a_new_learner_chat_message:true};
}
