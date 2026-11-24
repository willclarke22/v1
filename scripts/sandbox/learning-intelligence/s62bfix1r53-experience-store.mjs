/** R5.3 flexible, multi-step browser-native X experience: save unscored attempt with exact provenance. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateXExperience} from './s62bfix1r53-research-plan.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const BASE=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/,TURN=/^t\d{4,}$/,hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const assert=(v,msg)=>{if(!v)throw Error('R53 EXPERIENCE: '+msg);};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const writeNew=(p,obj)=>fs.writeFileSync(p,JSON.stringify(obj,null,2)+'\n',{flag:'wx',mode:0o600});
const clone=x=>structuredClone(x);
function atomicReplace(p,x){const tmp=p+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';try{writeNew(tmp,x);fs.renameSync(tmp,p);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
export function validateExperienceAnswers(plan,answers){
 validateXExperience(plan);assert(answers&&typeof answers==='object'&&!Array.isArray(answers),'answers must be object');
 assert(Object.keys(answers).length<=5,'too many submitted stage answers');
 const result=[];
 for(const step of plan.steps){const a=answers[step.id]??{selection:'',response:''};assert(a&&typeof a==='object'&&!Array.isArray(a),'invalid step answer');
  assert(typeof a.selection==='string'&&a.selection.length<=200&&typeof a.response==='string'&&a.response.length<=1200,'invalid answer');
  if(step.kind==='choose')assert(step.options.includes(a.selection),'choose from offered options');
  if(['predict','explain','compare'].includes(step.kind))assert(a.response.trim().length>=1,'enter a response for '+step.id);
  if(step.kind==='reveal')assert(!a.selection&&!a.response,'reveal does not collect an answer');
  if(step.kind!=='choose')assert(!a.selection,'non-choice stage must not have a selected option');
  result.push({id:step.id,kind:step.kind,context:step.context,challenge:step.challenge,selection:a.selection,response:a.response});
 }
 assert(Object.keys(answers).every(k=>plan.steps.some(s=>s.id===k)),'unknown step answer');return result;
}
export function commitExperienceAttempt(body,{base=BASE}={}){
 assert(body&&ID.test(body.session_id??'')&&TURN.test(body.turn_id??''),'invalid session/turn ID');
 const dir=path.join(base,body.session_id),stateFile=path.join(dir,'state.json'),designFile=path.join(dir,'experience-designs',body.turn_id+'.json');
 assert(fs.existsSync(stateFile)&&fs.existsSync(designFile),'session or paid X design missing');
 const state=read(stateFile),designTrace=read(designFile),design=designTrace.status==='complete'?designTrace.output:null;
 assert(state.schema==='myway_goldloop_human_v1'&&state.learner===body.session_id,'state identity mismatch');
 const turn=state.turns.find(x=>x.turn_id===body.turn_id);
 assert(turn&&turn===state.turns.at(-1),'only latest completed turn accepts new X experience attempt');
 const plan=turn.probe_plan??turn.B_output?.probe_plan;
 assert(plan?.offer===true,'Model B did not offer a probe');
 assert(design.schema==='myway_r53_experimental_x_v1'&&design.kind==='x'&&design.session_id===body.session_id&&design.turn_id===body.turn_id&&design.topic_id===turn.topic_id,'X design identity mismatch');
 assert(design.plan_sha256===hash(design.plan),'X design hash mismatch');
 assert(!fs.readdirSync(path.join(dir,'turns')).some(x=>x.endsWith('.pending.json')),'incomplete paid turn blocks new attempt');
 assert((state.probe_attempts??[]).filter(x=>x.turn_id===body.turn_id).length<8,'maximum attempts reached');
 const steps=validateExperienceAnswers(design.plan,body.answers);
 const hints=body.hint_count??0;assert(Number.isInteger(hints)&&hints>=0&&hints<=20,'bad hint count');
 const events=body.events??[];assert(Array.isArray(events)&&events.length<=100&&events.every(e=>e&&typeof e.action==='string'&&e.action.length<=50&&typeof e.detail==='string'&&e.detail.length<=400&&typeof e.at==='string'&&e.at.length<=50),'bad event trail');
 const all=state.probe_attempts??[];let seq=1;while(all.some(x=>x.attempt_id==='pa'+String(seq).padStart(4,'0')))seq++;
 const attemptId='pa'+String(seq).padStart(4,'0');const evidenceId=attemptId+'-IN';
 const summary=steps.map(s=>`${s.id} (${s.kind}): ${s.challenge} | ${s.selection||s.response||'[revealed]'}`).join('\n').slice(0,3200);
 const answerText=steps.filter(s=>s.kind!=='reveal').map(s=>`${s.id}: ${s.selection||s.response}`).join(' | ').slice(0,3500);
 const attempt={schema:'myway_human_probe_attempt_v1',attempt_id:attemptId,evidence_id:evidenceId,session_id:body.session_id,turn_id:body.turn_id,topic_id:turn.topic_id,scene_id:turn.scene_contract_id??'unknown',modality:'x_composed_experience',probe_purpose:plan.purpose,task_as_offered:'X-authored multi-step experience: '+design.plan.title+' | '+design.plan.educational_intent,task_sha256:hash(plan),status:'submitted',learner_answer:answerText,selection:'',ordered_items:[],matches:{},selected_items:[],values:{},hints_requested:hints,action_log:clone(events),experience_design_sha256:design.plan_sha256,experience_design_id:body.turn_id,experience_steps:steps,submitted_at:new Date().toISOString(),evidence_limits:['This is an X-authored experimental text/control interaction, not validated external cognition or physics','No objective scoring or diagnostic inference','Hints, repeated views and prior B teaching are exposure, not independent mastery','The originating B probe plan is retained as a compatibility anchor, but X authored the actual task'],model_calls:0,embedding_calls:0};
 const obs={id:evidenceId,topic_id:turn.topic_id,kind:'human_probe_attempt',text:(`Learner attempted X-authored interactive experience ${design.plan.title}. Original educational purpose: ${plan.purpose}. Browser-recorded responses: ${summary}. Hints: ${hints}. These are unscored; no independent correctness verified.`).slice(0,3900),compact_index_text:(`X experience ${design.plan.title} ${summary}`).slice(0,2800),conditions:{source:'real_browser_X_composed_experience_r53',status:'attempt_unscored',attempt_id:attemptId,source_turn_id:body.turn_id,scene_id:attempt.scene_id,modality:'x_composed_experience',experience_design_id:body.turn_id,experience_design_sha256:design.plan_sha256,actual_hint_count:hints,learner_actions_recorded:true,not_verified_by_renderer:true,not_independently_scored:true,assumed_mastery:false},teaching_exposure_before_attempt:turn.teacher_response,not_human_ground_truth:false};
 assert(!(state.observations??[]).some(o=>o.id===evidenceId),'duplicate evidence ID');
 const newState=clone(state);newState.probe_attempts=[...all,attempt];newState.observations.push(obs);
 const backupDir=path.join(dir,'probe-state-backups'),attemptsDir=path.join(dir,'probe-attempts');fs.mkdirSync(backupDir,{recursive:true});fs.mkdirSync(attemptsDir,{recursive:true});
 const backup=path.join(backupDir,attemptId+'-state-before.json');fs.copyFileSync(stateFile,backup,fs.constants.COPYFILE_EXCL);
 atomicReplace(stateFile,newState);writeNew(path.join(attemptsDir,attemptId+'.json'),attempt);
 return {status:'saved_unscored',attempt_id:attemptId,evidence_id:evidenceId,model_calls:0,scored:false,experience_design_sha256:design.plan_sha256,can_use_existing_probe_continuation:true};
}
