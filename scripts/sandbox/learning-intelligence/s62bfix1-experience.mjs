/** S62B execution boundary: B freeform -> independent technical translation -> supported action log.
 * No software claims rich scenes rendered: 2d/3d/audio are SYMBOLIC simulations only.
 */
import crypto from 'node:crypto';
const obj=p=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)});
const arr=t=>({type:'array',items:t});const str={type:'string'};
const en=x=>({type:'string',enum:x});
export const TRANSLATOR_PROMPT=`You translate a creative teacher's activity proposal into a machine-executable symbolic prototype for research. You are NOT the teacher or grader. Do not alter the educational meaning or invent capabilities. Support only text responses, multiple-choice selections, numeric sliders, simple object move/rotate commands and audio-play-request logs. Split staged reveals so later numeric facts cannot be exposed early. If unsupported or a meaningful fallback would change the assessment objective, return unsupported and explain. Define checks only for independently executable exact-choice or arithmetic balance when fully specified in the teacher's proposal; otherwise mark unverified. Never claim a visual/audio renderer actually exists. Return strict JSON.`;
export const TRANSLATOR_SCHEMA=obj({
 status:en(['compiled','unsupported']),reason:str,
 stages:arr(obj({
  instruction:str,
  visible_scene:str,
  controls:arr(obj({id:str,kind:en(['text','select','slider','move','rotate','play']),label:str,choices:arr(str),min:{type:'number'},max:{type:'number'}})),
  feedback_on_submit:str,hint_text:str,
  reveal_next_on_submit:{type:'boolean'}
 })),
 assessment:obj({kind:en(['unverified','balance','choice']),control_a:str,control_b:str,expected_choice:str,explanation:str})
});
const safeClone=x=>structuredClone(x);
const stable=s=>crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0,14);
function validateStages(spec){
 if(!spec||!['compiled','unsupported'].includes(spec.status)||!Array.isArray(spec.stages)||spec.stages.length>4)throw Error('Interpreter: bad stage structure');
 if(spec.status==='compiled'&&!spec.stages.length)throw Error('Interpreter: compiled plan empty');
 let count=0;
 for(const [i,stage] of spec.stages.entries()){
  if(typeof stage.instruction!=='string'||!stage.instruction.trim()||stage.instruction.length>1000||typeof stage.visible_scene!=='string'||stage.visible_scene.length>2000)throw Error('Interpreter: missing/oversized visible stage');
  if(!Array.isArray(stage.controls)||stage.controls.length>10||!stage.controls.length)throw Error('Interpreter: empty/oversized controls');
  const ids=new Set();
  for(const c of stage.controls){
   if(!/^[a-zA-Z][\w-]{0,45}$/.test(c.id)||ids.has(c.id))throw Error('Interpreter: duplicate/invalid control');ids.add(c.id);
   if(!['text','select','slider','move','rotate','play'].includes(c.kind)||!Number.isFinite(c.min)||!Number.isFinite(c.max)||c.min>c.max)throw Error('Interpreter: invalid control domain');
   if(!Array.isArray(c.choices)||c.choices.length>25||c.choices.some(x=>typeof x!=='string'||x.length>100))throw Error('Interpreter: invalid choices');
   if(c.kind==='select'&&c.choices.length<2)throw Error('Interpreter: choice options missing');
   if(c.kind!=='select'&&c.choices.length)throw Error('Interpreter: choices on non-selection control');
  }
  count+=stage.controls.length;
  if(stage.reveal_next_on_submit&&i===spec.stages.length-1)throw Error('Interpreter: final stage cannot reveal next');
  if(i<spec.stages.length-1&&!stage.reveal_next_on_submit)throw Error('Interpreter: intermediate stage must explicitly reveal next after submit');
 }
 if(count>24)throw Error('Interpreter: too many total controls');
 if(!['unverified','balance','choice'].includes(spec.assessment?.kind))throw Error('Interpreter: bad check');
 if(spec.assessment.kind!=='unverified'){
  // Only support independently executable checks against final stage controls.
  const all=spec.stages.at(-1)?.controls??[],lookup=new Map(all.map(x=>[x.id,x]));
  if(spec.assessment.kind==='balance'&&(!['slider'].includes(lookup.get(spec.assessment.control_a)?.kind)||!['slider'].includes(lookup.get(spec.assessment.control_b)?.kind)))throw Error('Interpreter: balance check incompatible controls');
  if(spec.assessment.kind==='choice'&&!(lookup.get(spec.assessment.control_a)?.choices??[]).includes(spec.assessment.expected_choice))throw Error('Interpreter: choice check incompatible answer');
 }
 return safeClone(spec);
}
export function compileExperience(creative,translated,{mode='research_symbolic',instanceKey=null}={}){
 if(typeof creative?.teacher_response!=='string'||!creative.teacher_response.trim()||!creative.experience_proposal||typeof creative.experience_proposal.learner_task!=='string')throw Error('B output missing creative response/activity');
 const modality=creative.experience_proposal.modality;
 // Stable template/design identity is separate from each delivered learner attempt.
 const design_id='DES-'+stable({creative,translated});
 const activity_instance_id='AIN-'+stable({design_id,nonce:instanceKey??crypto.randomUUID()});
 const id=activity_instance_id;
 if(modality==='none')return {id,design_id,activity_instance_id,status:'no_activity',requested_modality:modality,delivered_modality:'none',fidelity:['Teacher chose normal conversation'],stages:[],assessment:{kind:'unverified'},source_proposal:safeClone(creative.experience_proposal)};
 let s;
 try{s=validateStages(translated)}catch(e){return {id,design_id,activity_instance_id,status:'rejected',requested_modality:modality,delivered_modality:'none',fidelity:[String(e.message)],stages:[],assessment:{kind:'unverified'},source_proposal:safeClone(creative.experience_proposal)}}
 if(s.status==='unsupported')return {id,design_id,activity_instance_id,status:'rejected',requested_modality:modality,delivered_modality:'none',fidelity:[s.reason],stages:[],assessment:{kind:'unverified'},source_proposal:safeClone(creative.experience_proposal)};
 const symbolic=['2d','3d','audio','mixed'].includes(modality);
 const label=symbolic?'symbolic_simulation_not_rendered':'text_executable';
 // A symbolic plan is not an actual human-usable visual or auditory scene.
 return {id,design_id,activity_instance_id,status:label,requested_modality:modality,delivered_modality:symbolic?'symbolic_actions_only':'text',fidelity:symbolic?['This is a control/scene description only; visual/audio perception and renderer are NOT tested']:[],stages:s.stages,assessment:s.assessment,source_proposal:safeClone(creative.experience_proposal),mode};
}
/** Only the active stage and its permitted controls are learner-visible. Never include hidden assessment. */
export function publicStage(plan,index,progress={}){
 if(plan.status==='no_activity')return {activity_id:plan.activity_instance_id,design_id:plan.design_id,activity_instance_id:plan.activity_instance_id,status:'no_activity',teacher_text:progress.teacherText??''};
 if(plan.status==='rejected')return {activity_id:plan.activity_instance_id,design_id:plan.design_id,activity_instance_id:plan.activity_instance_id,status:'unsupported',message:'The suggested interactive activity is not currently available.',request:plan.source_proposal.learner_task};
 const s=plan.stages[index];if(!s)throw Error('Public stage out of bounds');
 return {activity_id:plan.activity_instance_id,design_id:plan.design_id,activity_instance_id:plan.activity_instance_id,phase:index+1,total_phases:plan.stages.length,modality:plan.delivered_modality,perceptual_limitation:plan.fidelity,visible_scene:s.visible_scene,instruction:s.instruction,controls:s.controls.map(x=>({id:x.id,kind:x.kind,label:x.label,choices:x.choices,min:x.min,max:x.max})),feedback_already_revealed:progress.feedback??null,hint_revealed:progress.hint??null};
}
function validateAction(action,view){
 if(!action||typeof action!=='object'||typeof action.control!=='string'||typeof action.operation!=='string'||typeof action.value!=='string')throw Error('Runtime: invalid event structure');
 const c=view.controls?.find(x=>x.id===action.control);
 if(!c)throw Error('Runtime: action not in learner-visible controls');
 const operations={text:'text_response',select:'select',slider:'set_value',move:'move',rotate:'rotate',play:'play'};
 if(action.operation!==operations[c.kind])throw Error('Runtime: wrong event operation');
 if(action.value.length>1000)throw Error('Runtime: overly long event value');
 if(c.kind==='select'&&!c.choices.includes(action.value))throw Error('Runtime: selected option not available');
 if(c.kind==='slider'&&(!Number.isFinite(Number(action.value))||Number(action.value)<c.min||Number(action.value)>c.max))throw Error('Runtime: slider value outside allowed range');
 if(c.kind==='rotate'&&(!Number.isFinite(Number(action.value))||Number(action.value)<c.min||Number(action.value)>c.max))throw Error('Runtime: rotation outside allowed range');
 if(c.kind==='move'&&!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(action.value))throw Error('Runtime: unsupported move coordinate');
 return {control:action.control,operation:action.operation,value:action.value};
}
/** Deterministic event logs; objective check only when independently executable. */
export function executePhase(plan,index,response,log=[]){
 const view=publicStage(plan,index);
 const eventBase={activity_instance_id:plan.activity_instance_id,design_id:plan.design_id};
 if(!['text_executable','symbolic_simulation_not_rendered'].includes(plan.status))return {events:[],result:{status:'not_executed',activity_instance_id:plan.activity_instance_id,reason:plan.fidelity.join('; '),objective_check:{kind:'not_attempted',source:'not_executed'}},feedback:null};
 if(response?.declines){const e={...eventBase,seq:log.length+1,phase:index+1,type:'declined'};return {events:[e],result:{status:'declined',activity_instance_id:plan.activity_instance_id,phase:index+1,objective_check:{kind:'not_attempted',source:'declined'}},feedback:null};}
 if(response?.request_hint){const hint=plan.stages[index]?.hint_text||null;const events=[{...eventBase,seq:log.length+1,phase:index+1,type:'hint_requested'}];if(hint)events.push({...eventBase,seq:log.length+2,phase:index+1,type:'hint_delivered',text:hint});return {events,result:{status:'hint_requested',activity_instance_id:plan.activity_instance_id,phase:index+1,objective_check:{kind:'not_attempted',source:'hint_requested'}},feedback:null,hint};}
 const actions=response?.selected_actions;
 if(!Array.isArray(actions)||actions.length>30)throw Error('Runtime: missing/too many actions');
 // Empty and unanswered submissions are *not* evidence of an incorrect answer.
 // An empty text response likewise does not count as a completed task.
 const meaningful=actions.filter(a=>!(view.controls.find(c=>c.id===a?.control)?.kind==='text'&&typeof a?.value==='string'&&!a.value.trim()));
 if(!meaningful.length)return {events:[{...eventBase,seq:log.length+1,phase:index+1,type:'no_attempt'}],result:{status:'no_attempt',activity_instance_id:plan.activity_instance_id,phase:index+1,actions:0,objective_check:{kind:'not_attempted',source:'no_meaningful_actions'},learner_utterance:String(response?.learner_utterance??'').slice(0,2000)},feedback:null};
 if(meaningful.length!==actions.length)throw Error('Runtime: mixed empty text and meaningful actions');
 const events=[];const seq=()=>log.length+events.length+1;
 // Hint requests are handled as a separate, observable phase before any answer.
 for(const a of actions){const v=validateAction(a,view);events.push({...eventBase,seq:seq(),phase:index+1,type:'action',...v});}
 events.push({...eventBase,seq:seq(),phase:index+1,type:'submit'});
 const state=Object.fromEntries(actions.map(x=>[x.control,x.value]));
 let checked={kind:'not_independently_verified',value:null,source:'teacher_assessment_not_authoritative'};
 let status='submitted';
 if(index===plan.stages.length-1&&plan.assessment.kind==='balance'){
  const required=[plan.assessment.control_a,plan.assessment.control_b];
  const missing=required.filter(id=>!Object.prototype.hasOwnProperty.call(state,id));
  if(missing.length){status='incomplete';checked={kind:'insufficient_controls',missing,source:'runtime_insufficient_data'};}
  else{
   const a=Number(state[required[0]]),b=Number(state[required[1]]);
   if(!Number.isFinite(a)||!Number.isFinite(b)){status='incomplete';checked={kind:'insufficient_controls',missing:required,source:'runtime_nonfinite_numeric'};}
   else checked={kind:'independently_computed_balance',net_difference:a-b,goal_met:a===b,source:'arithmetic'};
  }
 }else if(index===plan.stages.length-1&&plan.assessment.kind==='choice'){
  const target=plan.assessment.control_a;
  if(!Object.prototype.hasOwnProperty.call(state,target)){status='incomplete';checked={kind:'insufficient_controls',missing:[target],source:'runtime_insufficient_data'};}
  else checked={kind:'teacher_proposed_choice_key_not_independently_verified',selected:state[target],matched_proposed_key:state[target]===plan.assessment.expected_choice,source:'technical_translation_of_teacher_key'};
 }
 const had_hint=log.some(e=>e.activity_instance_id===plan.activity_instance_id&&e.phase===index+1&&e.type==='hint_delivered');
 const result={status,phase:index+1,actions:actions.length,learner_utterance:String(response?.learner_utterance??'').slice(0,2000),objective_check:checked,had_hint,activity_instance_id:plan.activity_instance_id};
 const feedback=status==='submitted'?(plan.stages[index].feedback_on_submit||null):null;
 return {events,result,feedback};
}
export function evidenceFromAttempt(plan,completed,{learner_id,topic_id,observation_id}){
 const events=completed.flatMap(x=>x.events);let summary=events.filter(x=>x.type==='action').map(x=>`${x.control}: ${x.value}`).join(' | ');
 if(!summary)summary=events.some(e=>e.type==='declined')?'Learner declined':'No instrumented action';
 const results=completed.map(x=>x.result);
 return {id:observation_id,topic_id,learner_id,source:'research_simulated_activity',text:`Activity instance ${plan.activity_instance_id} (design ${plan.design_id}): ${summary}. ${results.map(x=>x.learner_utterance??'').filter(Boolean).join(' ')}`.slice(0,2400),task_conditions:{simulated:true,design_id:plan.design_id,activity_instance_id:plan.activity_instance_id,attempt_outcomes:results.map(x=>x.status),requested_modality:plan.requested_modality,delivered_modality:plan.delivered_modality,execution_status:plan.status,assistance:events.some(e=>e.type==='hint_delivered'),feedback_order:'after_submit_except_requested_hints_delivered_before_next_attempt',phases:completed.length,objective_checks:results.map(x=>x.objective_check),perceptual_limitations:plan.fidelity},actual_activity:{id:plan.activity_instance_id,design_id:plan.design_id,activity_instance_id:plan.activity_instance_id,status:plan.status,stages_presented:completed.map(x=>{const phase=x.result?.phase??x.phase;const stage=plan.stages[phase-1];return {phase,instruction:stage?.instruction,visible_scene:stage?.visible_scene,controls:stage?.controls.map(c=>({id:c.id,kind:c.kind,choices:c.choices,min:c.min,max:c.max}))};}),events,results},compact_index_text:`${plan.source_proposal.learner_task} ${summary}`.slice(0,1200)};
}
export function replay(plan,responses){const all=[],completed=[];for(const [idx,entry] of responses.entries()){const index=Number.isInteger(entry?.phase)?entry.phase:idx;const response=entry?.response??entry;const x=executePhase(plan,index,response,all);all.push(...x.events);completed.push(x)}return {events:all,completed};}
export function assertReplay(plan,responses,original){const a=replay(plan,responses);if(JSON.stringify(a)!==JSON.stringify(original))throw Error('Runtime: event replay mismatch');return true;}
