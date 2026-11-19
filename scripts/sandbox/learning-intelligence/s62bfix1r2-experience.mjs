/** R2: implementation-independent experience seam; present symbolic adapter is intentionally limited.
 * Do not confuse a description with actual rendered 2D/3D/audio.
 */
import crypto from 'node:crypto';
import {TRANSLATOR_SCHEMA,TRANSLATOR_PROMPT,compileExperience,publicStage,executePhase,evidenceFromAttempt,assertReplay} from './s62bfix1-experience.mjs';
export {TRANSLATOR_SCHEMA,compileExperience,publicStage,executePhase,evidenceFromAttempt,assertReplay};
export const TRANSLATOR_PROMPT_R2=TRANSLATOR_PROMPT+`

Model B OWNS the creative educational goal, story, experience, learner-meaningful actions, feedback intent and inquiry. You own ONLY technical realization. B is NOT restricted to this prototype's controls; suggest an unsupported response if fidelity requires something not implemented here, rather than silently changing the educational question. This prototype offers text, select (2+ explicit choices), numeric sliders, basic symbolic move/rotate/play events. A button/reset is NOT a select with one choice; omit an optional reset from the symbolic controls when it is nonessential to B's educational task, with explicit omission in the reason, otherwise return unsupported. The numeric min and max of each control must be finite with min <= max. Non-select controls MUST have choices: []; selection controls MUST have at least two choices. Assessment kind 'choice' ONLY when control_a identifies a select and expected_choice EXACTLY matches an available option in the FINAL stage; never attach it to a slider. 'balance' ONLY when final-stage control_a and control_b identify sliders and equality is truly the teacher's specified goal, not simply because two sliders happen to exist. Otherwise use assessment kind 'unverified'; this does not prevent recording the actions for Model A. A proposed answer key is never independent proof of mastery. Avoid introducing extra computations or educational mechanisms that B did not design. In a graph of quantity against time, the graphed y-value is the quantity; area beneath it is a different mathematical quantity, not the original graphed value. For symbolic 2D/3D/audio explicitly describe it as a CONTROL AND SCENE DESCRIPTION only; do not assert that images were rendered, animations displayed, or sound heard. Keep learner task and action possibilities as faithful to B's design as possible. If the user-visible experience would depend on unimplemented visual/audio perception, report unsupported instead of assuming L can perceive it. If a previous attempt and exact validator error are supplied, repair only what the error requires, preserving B's intent; no arbitrary redesign. This is not a question-answering task: there is no required model output to satisfy an authored reference answer.`;
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);}
/** Versioned seam: B's source intent, X's implementation, and runtime-delivered experience.
 * Version 1 is deliberately small. Future renderers can implement this seam without altering B.
 */
export function experienceContract(creative,translation,execution,{attempts=[],fidelityReview='not_independently_assessed'}={}){
 const p=structuredClone(creative.experience_proposal);
 return {
  version:'myway_experience_boundary_v1',
  intent:{source:'Model_B',teacher_response:creative.teacher_response,requested_modality:p.modality,setting:p.setting,learner_task:p.learner_task,learner_meaningful_actions:p.possible_actions,private_assessment_intent:p.private_assessment_intent},
  implementation:{source:'Model_X',translator_status:translation?.status??'not_called',translator_reason:translation?.reason??'',adapter:'symbolic_staged_controls_v1',attempts:attempts.length,stages:translation?.stages??[],assessment:translation?.assessment??null},
  delivery:{source:'MyWay_runtime',status:execution.status,requested_modality:execution.requested_modality,delivered_modality:execution.delivered_modality,limitations:execution.fidelity,design_id:execution.design_id,activity_instance_id:execution.activity_instance_id,stages_available:execution.stages?.length??0,real_2d_rendered:false,real_3d_rendered:false,real_audio_played:false},
  checks:{structural:!['rejected'].includes(execution.status),semantic_fidelity:fidelityReview,educational_effectiveness:'not_measured'},
  provenance:{creative_design_sha256_16:hash(creative),translated_implementation_sha256_16:hash(translation),implementation_is_replaceable:true}
 };
}
export function errorForRepair(execution,translationError){
 if(translationError)return `Translator response could not be parsed: ${translationError}`;
 if(execution.status==='rejected')return execution.fidelity?.join(' ; ')||'Prototype rejected translation';
 return null;
}
