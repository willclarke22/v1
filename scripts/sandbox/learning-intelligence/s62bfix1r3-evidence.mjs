/** R3 observation bridge. It normalizes *syntax* for the current symbolic adapter,
 * never invents successful actions or cognitive meaning. A future experience builder
 * can expose different affordances and deliver the same factual observation envelope.
 */
import {publicStage,evidenceFromAttempt} from './s62bfix1r2-experience.mjs';
const clone=x=>structuredClone(x);
const OPS={text:'text_response',select:'select',slider:'set_value',move:'move',rotate:'rotate',play:'play'};
const ALIASES={text:['answer','write','type'],select:['choose','pick'],slider:['set','adjust','change'],move:['drag','place'],rotate:['turn'],play:['start','listen']};
export function learnerView(plan,index,progress={}){
 const view=publicStage(plan,index,progress);
 const affordances=(view.controls??[]).map(c=>({control_id:c.id,description:c.label,control_kind:c.kind,canonical_operation:OPS[c.kind],accepted_language_aliases:ALIASES[c.kind]??[],value_format:c.kind==='move'?'x,y,z numeric coordinates':c.kind==='slider'||c.kind==='rotate'?`number from ${c.min} to ${c.max}`:c.kind==='select'?`one of ${JSON.stringify(c.choices)}`:c.kind==='play'?'play':'free text',
  coordinate_frame:c.kind==='move'?'symbolic_xyz_not_a_rendered_scene':null,
  scalar_x_shortcut:c.kind==='move'&&plan.requested_modality==='2d',
  perceptual_caveat:(view.perceptual_limitation??[]).join('; ')}));
 return {...view,available_interactions:affordances,observation_interface:'myway_experience_observation_v1',real_visualization_presented:false};
}
export function normalizeAttempt(response,view){
 if(!response||typeof response!=='object'||!Array.isArray(response.selected_actions)||response.selected_actions.length>30)throw Error('L attempted actions missing or malformed');
 const changes=[],normalized=[];
 for(const [index,raw] of response.selected_actions.entries()){
  if(typeof raw?.control!=='string'||typeof raw?.operation!=='string'||typeof raw?.value!=='string')throw Error('L action fields must be strings');
  const a=view.available_interactions?.find(x=>x.control_id===raw.control);
  if(!a)throw Error('L action uses an interaction not presented to learner');
  let operation=raw.operation.toLowerCase().trim(),value=raw.value.trim();
  if(operation!==a.canonical_operation){
   if(!a.accepted_language_aliases.includes(operation))throw Error(`L action operation not offered: ${operation}`);
   changes.push({index,control:raw.control,from:operation,to:a.canonical_operation,kind:'documented_syntax_alias'});operation=a.canonical_operation;
  }
  // ONLY when the symbolic builder explicitly advertises an x-axis shortcut.
  // This is a technical coordinate encoding, not evidence of a perceived 2D point.
  if(operation==='move'&&a.scalar_x_shortcut&&/^-?\d+(?:\.\d+)?$/.test(value)){
   changes.push({index,control:raw.control,from:value,to:`${value},0,0`,kind:'advertised_symbolic_x_axis_shortcut',caveat:'No rendered position perceived'});
   value=`${value},0,0`;
  }
  normalized.push({control:raw.control,operation,value});
 }
 return {normalized_response:{...clone(response),selected_actions:normalized},original_response:clone(response),normalizations:changes,interface_version:'myway_experience_observation_v1'};
}
/** factual envelope includes failed attempts, presented affordances, feedback ordering and replayed events */
export function evidenceR3(plan,completed,{learner_id,topic_id,observation_id,presented=[],attempts=[],technicalFailure=null}={}){
 const base=evidenceFromAttempt(plan,completed,{learner_id,topic_id,observation_id});
 const events=completed.flatMap(x=>x.events);
 const hasMeaningfulAction=events.some(x=>x.type==='action');
 const status=technicalFailure?'technical_failure':hasMeaningfulAction?'executed_attempt':events.some(x=>x.type==='declined')?'declined':'no_executed_action';
 const actual={schema:'myway_experience_observation_v1',activity_instance_id:plan.activity_instance_id,design_id:plan.design_id,
  requested_modality:plan.requested_modality,delivered_modality:plan.delivered_modality,real_2d_rendered:false,real_3d_rendered:false,real_audio_played:false,
  original_educational_task:plan.source_proposal?.learner_task??'',presented:presented.map(x=>({phase:x.phase,instruction:x.instruction,visible_scene:x.visible_scene,available_interactions:x.available_interactions,feedback_already_revealed:x.feedback_already_revealed,hint_revealed:x.hint_revealed,perceptual_limitation:x.perceptual_limitation})),
  learner_attempts:attempts.map(x=>({phase:x.phase,raw_response:x.raw_response,normalized_response:x.normalized_response??null,normalizations:x.normalizations??[],accepted:x.accepted,error:x.error??null})),
  executed_events:events,results:completed.map(x=>x.result),feedback_delivered:completed.map(x=>({phase:x.phase,feedback:x.feedback??null,hint:x.hint??null})),
  technical_failure:technicalFailure,observation_status:status,limits:plan.fidelity};
 const attemptedText=attempts.map(x=>x.raw_response?.learner_utterance??'').filter(Boolean).join(' | ').slice(0,1400);
 const executedText=events.filter(e=>e.type==='action').map(e=>`${e.control}=${e.value}`).join('; ').slice(0,700);
 const technicalText=technicalFailure?`Technical execution failure: ${technicalFailure.error}; learner skill NOT assessed by this failed action.`:'';
 const text=`Task: ${actual.original_educational_task}. ${executedText?'Executed '+executedText+'.':''} ${attemptedText?'Learner said: '+attemptedText+'.':''} ${technicalText}`.slice(0,2300);
 return {...base,text,compact_index_text:`Task ${actual.original_educational_task}. ${executedText?'Executed '+executedText+'.':''} ${technicalText} ${attemptedText}`.slice(0,1200),
  task_conditions:{...base.task_conditions,observation_status:status,technical_failure:!!technicalFailure,technical_failure_details:technicalFailure?.error??null,learner_cognitive_performance_verified:!technicalFailure&&hasMeaningfulAction,utterance_not_equivalent_to_verified_action:true},actual_activity:actual};
}
export function memoryActionUsesFailedObservation(action,observation){
 return observation?.task_conditions?.technical_failure===true&&Array.isArray(action?.evidence)&&action.evidence.length>0&&action.evidence.every(e=>e.id===observation.id);
}
/** Bounded, factual projection for A's finite context; full originals remain in STATE/TRACE.
 * If content is trimmed, the packet explicitly says so. No cognitive labels are added.
 */
export function forAssessment(observation,{includeActivity=true}={}){
 if(!observation)return null;
 const o={id:observation.id,topic_id:observation.topic_id,source:observation.source??observation.kind??'observation',kind:observation.kind??null,text:String(observation.text??'').slice(0,1800),task_conditions:observation.task_conditions?{
  observation_status:observation.task_conditions.observation_status??null,
  technical_failure:observation.task_conditions.technical_failure??false,
  technical_failure_details:String(observation.task_conditions.technical_failure_details??'').slice(0,260),
  requested_modality:observation.task_conditions.requested_modality??null,
  delivered_modality:observation.task_conditions.delivered_modality??null,
  execution_status:observation.task_conditions.execution_status??null,
  attempt_outcomes:observation.task_conditions.attempt_outcomes??[],
  assistance:observation.task_conditions.assistance??false,
  objective_checks:(observation.task_conditions.objective_checks??[]).slice(0,6),
  perceptual_limitations:(observation.task_conditions.perceptual_limitations??[]).slice(0,5),
  authored_fixture:observation.conditions?.source==='author_curated_fictional_opening'
 }:observation.conditions??null};
 if(includeActivity&&observation.actual_activity){
  const a=observation.actual_activity;
  o.actual_activity={schema:a.schema??'legacy_symbolic_observation',observation_status:a.observation_status??observation.task_conditions?.observation_status??null,
   original_educational_task:String(a.original_educational_task??'').slice(0,350),requested_modality:a.requested_modality??null,delivered_modality:a.delivered_modality??null,
   real_visualization_presented:false,technical_failure:a.technical_failure?{phase:a.technical_failure.phase,error:String(a.technical_failure.error??'').slice(0,350)}:null,
   presentations:(a.presented??a.stages_presented??[]).slice(0,5).map(v=>({phase:v.phase,instruction:String(v.instruction??'').slice(0,450),visible_scene:String(v.visible_scene??'').slice(0,450),feedback_already_revealed:v.feedback_already_revealed??null,hint_revealed:v.hint_revealed??null})),
   learner_attempts:(a.learner_attempts??[]).slice(0,7).map(t=>({phase:t.phase,accepted:t.accepted,error:String(t.error??'').slice(0,250),learner_utterance:String(t.raw_response?.learner_utterance??'').slice(0,600),raw_actions:(t.raw_response?.selected_actions??[]).slice(0,12),normalizations:(t.normalizations??[]).slice(0,10)})),
   executed_events:(a.executed_events??a.events??[]).slice(0,28).map(e=>({phase:e.phase,seq:e.seq,type:e.type,control:e.control,operation:e.operation,value:e.value,text:e.text})),
   feedback_delivered:(a.feedback_delivered??[]).slice(0,8),results:(a.results??[]).slice(0,8).map(r=>({status:r.status,objective_check:r.objective_check,had_hint:r.had_hint,learner_utterance:String(r.learner_utterance??'').slice(0,600)})),
   context_projection_note:'A bounded factual projection of original; original in auditable TRACE/STATE; never infer missing actions.'};
 }
 return o;
}
