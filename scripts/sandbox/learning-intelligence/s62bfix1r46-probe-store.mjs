/** Human-operated universal probe placeholders; local-only, NO API, NO scoring.
 * Learner actions in the UI are self-reported browser events, not verified manipulation
 * of any 2D/3D asset. Do not claim physics/simulation or correctness.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PROBE_SCHEMA,validateProbe} from './s62bfix1r46-probe-core.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const DEFAULT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const idRE=/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/,turnRE=/^t[0-9]{4,}$/;
const assert=(c,m)=>{if(!c)throw Error('R46 probe: '+m);};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const safeText=(v,max)=>typeof v==='string'&&v.length<=max;
const clone=v=>structuredClone(v);
function atomicJSON(filename,value){const tmp=filename+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,filename);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
export function commitProbeAttempt(payload,{outputDir=DEFAULT}={}){
 assert(payload&&typeof payload==='object'&&!Array.isArray(payload),'Invalid body');
 const {session_id:session,turn_id:turnId,status,learner_answer:answer='',selection='',ordered_items=[],matches={},selected_items=[],values={},hint_count=0,events=[]}=payload;
 assert(idRE.test(session??'')&&turnRE.test(turnId??''),'Invalid session or turn ID');
 assert(['submitted','skipped'].includes(status),'Invalid probe status');
 assert(safeText(answer,3500)&&safeText(selection,350)&&Number.isInteger(hint_count)&&hint_count>=0&&hint_count<=20,'Invalid answer/selection/hint count');
 assert(Array.isArray(ordered_items)&&ordered_items.length<=8&&ordered_items.every(x=>safeText(x,180)),'Invalid sequence');
 assert(Array.isArray(selected_items)&&selected_items.length<=8&&selected_items.every(x=>safeText(x,180)),'Invalid construction');
 assert(matches&&typeof matches==='object'&&!Array.isArray(matches)&&Object.entries(matches).length<=8&&Object.entries(matches).every(([k,v])=>safeText(k,180)&&safeText(v,180)),'Invalid matching');
 assert(values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).length<=3&&Object.entries(values).every(([k,v])=>/^[a-z][a-z0-9_]{0,34}$/.test(k)&&Number.isFinite(v)),'Invalid manipulation');
 assert(Array.isArray(events)&&events.length<=100&&events.every(e=>e&&typeof e==='object'&&safeText(e.action,50)&&safeText(e.detail,400)&&safeText(e.at,50)),'Invalid event trail');
 const dir=path.join(outputDir,session),statePath=path.join(dir,'state.json');assert(fs.existsSync(statePath),'No completed session');
 const state=read(statePath);assert(state.schema==='myway_goldloop_human_v1'&&state.learner===session,'Bad source state');
 assert(!fs.existsSync(path.join(dir,'turns',turnId+'.pending.json')),'Pending paid turn');
 const selectedTurn=state.turns.find(t=>t.turn_id===turnId);assert(selectedTurn,'Unknown completed turn');
 const plan=selectedTurn.probe_plan??selectedTurn.B_output?.probe_plan;assert(plan&&plan.offer===true,'No structured B probe was offered on this turn');validateProbe(plan);
 assert((state.probe_attempts??[]).filter(a=>a.turn_id===turnId).length<8,'Maximum of eight attempts per offered probe');
 const allowed=(lst,x)=>lst.includes(x);
 if(status==='submitted'){
  if(plan.modality==='choice')assert(allowed(plan.choices,selection),'Choose an available option');
  if(plan.modality==='sequence')assert(ordered_items.length===plan.items.length&&new Set(ordered_items).size===plan.items.length&&ordered_items.every(x=>allowed(plan.items,x)),'Sequence must contain all offered items');
  if(plan.modality==='match')assert(Object.keys(matches).length===plan.items.length&&plan.items.every(x=>allowed(plan.targets,matches[x])),'Match each offered item to a valid target');
  if(plan.modality==='construct')assert(selected_items.length>0&&selected_items.every(x=>allowed(plan.items,x)),'Select at least one available component');
  if(['prediction','explain'].includes(plan.modality))assert(answer.trim().length>=1,'Answer or prediction required');
  if(plan.modality==='manipulate')assert(Object.keys(values).length>=1||answer.trim().length>0,'Manipulate or explain a variable');
 }
 for(const [k,v] of Object.entries(values)){const spec=plan.variables.find(x=>x.key===k);assert(spec&&v>=spec.min&&v<=spec.max,'Variable outside offered range');}
 const existing=state.probe_attempts??[];let i=1;while(existing.some(a=>a.attempt_id==='pa'+String(i).padStart(4,'0')))i++;const attemptId='pa'+String(i).padStart(4,'0'),evidenceId=attemptId+'-IN';
 const attempt={schema:'myway_human_probe_attempt_v1',attempt_id:attemptId,evidence_id:evidenceId,session_id:session,turn_id:turnId,topic_id:selectedTurn.topic_id,scene_id:selectedTurn.scene_contract_id??'unknown',modality:plan.modality,probe_purpose:plan.purpose,task_as_offered:plan.prompt,task_sha256:hash(plan),status,learner_answer:answer,selection:selection??'',ordered_items:clone(ordered_items),matches:clone(matches),selected_items:clone(selected_items),values:clone(values),hints_requested:hint_count,action_log:clone(events),submitted_at:new Date().toISOString(),evidence_limits:['Browser events are learner-controlled and not independently verified','No 2D/3D activity was rendered','Model B proposed the task; Model A has not independently assessed correctness','No mastery or root cause has been inferred'],model_calls:0,embedding_calls:0};
 const summary=status==='skipped'?`Learner skipped optional ${plan.modality} probe; this is NOT evidence of misunderstanding.`:
  `Learner attempted ${plan.modality} probe from ${turnId}. Task: ${plan.prompt} | Selection: ${attempt.selection} | Answer: ${answer.slice(0,1500)} | Order: ${ordered_items.join(' > ')} | Matches: ${JSON.stringify(matches)} | Chosen components: ${selected_items.join(', ')} | Variables: ${JSON.stringify(values)} | Hints requested: ${hint_count}. UNVERIFIED placeholder attempt; not independently scored.`;
 const observation={id:evidenceId,topic_id:selectedTurn.topic_id,kind:status==='skipped'?'human_probe_skipped':'human_probe_attempt',text:summary.slice(0,2900),compact_index_text:summary.slice(0,2900),conditions:{source:'learner_ui_probe_placeholder_r46',status:status==='skipped'?'voluntary_skip_not_failure':'attempt_unscored',attempt_id:attemptId,source_turn_id:turnId,scene_id:attempt.scene_id,modality:plan.modality,actual_hint_count:hint_count,learner_actions_recorded:true,not_verified_by_renderer:true,not_independently_scored:true,assumed_mastery:false},not_human_ground_truth:false};
 assert(!(state.observations??[]).some(o=>o.id===evidenceId),'Evidence ID collision');
 state.probe_attempts=[...existing,attempt];state.observations.push(observation);
 // State is authoritative, with a pre-write backup and atomic replacement. Any sidecar is for inspection only.
 const backupDir=path.join(dir,'probe-state-backups');fs.mkdirSync(backupDir,{recursive:true});
 const backup=path.join(backupDir,attemptId+'-state-before.json');fs.copyFileSync(statePath,backup,fs.constants.COPYFILE_EXCL);
 atomicJSON(statePath,state);
 const attemptsDir=path.join(dir,'probe-attempts');fs.mkdirSync(attemptsDir,{recursive:true});
 atomicJSON(path.join(attemptsDir,attemptId+'.json'),attempt);
 return {attempt_id:attemptId,evidence_id:evidenceId,turn_id:turnId,status,modality:plan.modality,scene_id:attempt.scene_id,model_calls:0,score:null,interpretation:'pending_next_normal_model_A_assessment',no_claim_of_mastery:true};
}
