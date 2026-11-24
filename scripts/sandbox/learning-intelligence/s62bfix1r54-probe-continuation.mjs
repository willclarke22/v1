/** Accept R5.4 custom browser experience as typed probe-origin evidence, without requiring a legacy B probe offer. */
import {probeContinuationContext as oldContext,probeModelEvidence as oldEvidence,sourceHash,ATTEMPT_RE} from './s62bfix1r53-probe-continuation.mjs';
import {designFor} from './s62bfix1r54-creative-store.mjs';
export {ATTEMPT_RE};
const check=(v,m)=>{if(!v)throw Error('R54 continuation: '+m);};
export function probeContinuationContext(state,id){
 const a=(state?.probe_attempts??[]).find(x=>x.attempt_id===id);
 if(a?.modality!=='creative_sandbox')return oldContext(state,id);
 check(ATTEMPT_RE.test(id)&&a.schema==='myway_human_probe_attempt_v1'&&a.session_id===state.learner&&a.status==='submitted','invalid custom attempt');
 check(state.probe_attempts.at(-1)?.attempt_id===id,'newer attempt exists');
 const sourceTurn=state.turns.find(t=>t.turn_id===a.turn_id);check(sourceTurn&&state.turns.at(-1)?.turn_id===sourceTurn.turn_id,'stale source turn');
 const topic=state.topics.find(t=>t.id===a.topic_id);check(topic&&topic.id===sourceTurn.topic_id,'source topic mismatch');
 const variant=a.experience_design_id?.endsWith('-b_only')?'b_only':a.experience_design_id?.endsWith('-bx')?'bx':null;check(variant,'invalid creative design identity');
 const design=designFor(state.learner,a.turn_id,variant);check(design&&design.activity_sha256===a.experience_design_sha256&&a.task_sha256===sourceHash(design.activity),'saved creative design changed');
 const observation=state.observations.find(o=>o.id===a.evidence_id);check(observation?.kind==='human_probe_attempt'&&observation.topic_id===topic.id&&observation.conditions?.attempt_id===id,'source observation missing');
 check(!state.turns.some(t=>t.continuation_source?.attempt_id===id),'already continued');
 const attemptSha=sourceHash(a);
 const marker=JSON.stringify({input_kind:'submitted_probe_attempt',attempt_id:id,evidence_id:a.evidence_id,source_turn_id:a.turn_id,topic_id:topic.id,attempt_sha256:attemptSha});
 const summary=a.learner_answer||a.action_log?.map(e=>e.action+': '+e.detail).join(' | ')||'[no learner answer]';
 const visibleText=`Submitted creative browser experience (${id}, ${variant}, ${sourceTurn.turn_id}): ${summary}`.slice(0,3900);
 return {attempt:a,sourceTurn,topic,observation,attemptSha,marker,visibleText,creative_design_sha256:design.activity_sha256};
}
export function probeModelEvidence(info){
 const result=oldEvidence(info);
 if(info.attempt.modality==='creative_sandbox')return {...result,custom_html_activity_executed_inside_opaque_sandbox:true,reported_event_log_not_verified_as_correctness:true,activity_provenance_hash:info.creative_design_sha256,not_from_legacy_template:true};
 return result;
}
