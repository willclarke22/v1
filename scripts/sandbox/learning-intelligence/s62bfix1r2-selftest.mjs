#!/usr/bin/env node
/** R2 offline regressions. All model outputs below are synthetic engineering fixtures,
 * NOT reference answers or evidence of human cognitive or educational quality.
 * Zero API and DB calls. The real model pathway must stay independent of these fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from './s62bfix1r2-journey.mjs';
import {verifyAIsolated} from './s62bfix1r2-core.mjs';
import {experienceContract,errorForRepair,compileExperience} from './s62bfix1r2-experience.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const copy=x=>structuredClone(x);
const obsId='NORA-01-IN';
const seedA={observed:{kind:'question',evidence_ids:[obsId],demonstrated:'An unscored question was asked.',untested_or_incorrect:'No independent performance recorded.',conditions:'Fictional authored unscored opening.'},interpretation:{hypotheses:['Could conflate slower rate with falling total, not established.'],uncertainty:'high',more_history_needed:null},memory_decisions:[],learner_brief_for_B:{current_understanding:'Question about a change.',remaining_uncertainty:'Needs an independent attempt.',relevant_history:'Earlier unscored question only.',possible_shared_root:null,teaching_response_evidence:'No scored teaching feedback.'}};
const memory={action:'revise',record_type:'root',target_id:'NORA-R-001',claim:'Provisional explanatory uncertainty about rate and total.',topics:['T01'],possible_instances:[],evidence:[{id:obsId,role:'context'}],rationale:'Unscored current question informs uncertainty but not mastery.',uncertainty:'high'};
const packet={current:{id:obsId,topic_id:'T01'},allowed_evidence_ids:[obsId,'E-001'],memory_candidates:[{id:'NORA-R-001',type:'root'},{id:'NORA-R-002',type:'root'}]};
const state={topics:[{id:'T01'},{id:'T02'}],records:[],observations:[]};
const invalid1={...memory,possible_instances:['NORA-R-002']};
const invalid2={...memory,action:'create',target_id:'NORA-R-001',possible_instances:[obsId]};
let v=verifyAIsolated({...seedA,memory_decisions:[invalid1,memory,{...memory,action:'create',target_id:null,possible_instances:[],claim:'A proposed separate candidate',topics:['T01']}]},packet,state);
assert.equal(v.assessment_valid,true);assert.equal(v.rejected_memory_actions.length,1);assert.equal(v.accepted_memory_actions.length,2);assert.equal(v.output.learner_brief_for_B.current_understanding,seedA.learner_brief_for_B.current_understanding);
v=verifyAIsolated({...seedA,memory_decisions:[invalid2]},packet,state);
assert.equal(v.assessment_valid,true);assert.equal(v.accepted_memory_actions.length,0);assert.equal(v.rejected_memory_actions.length,1);
assert.equal(verifyAIsolated({...seedA,observed:{...seedA.observed,evidence_ids:['INVENTED']}},packet,state).assessment_valid,false);

const proposal={teacher_response:'Welcome to an imaginative canal village. Experiment with the water gates.',experience_proposal:{modality:'2d',setting:'A village canal with two adjustable gates',learner_task:'Try different flow settings, then explain how the level might change.',possible_actions:['adjust inlet','adjust outlet','describe observations'],private_assessment_intent:'Listen to reasoning, not score a hidden answer key'}};
function xOutput(kind){
 if(kind==='unsupported')return {status:'unsupported',reason:'Symbolic representation cannot convey the essential learner experience.',stages:[],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}};
 const controls=[{id:'inlet',kind:'slider',label:'Inlet',choices:[],min:0,max:10},{id:'outlet',kind:'slider',label:'Outlet',choices:[],min:0,max:10}];
 return {status:'compiled',reason:kind==='bad'?'incorrect control assessment':'Symbolic two-gate control prototype',stages:[{instruction:proposal.experience_proposal.learner_task,visible_scene:'Description: canal gates; no actual display is rendered',controls,feedback_on_submit:'What did you notice?',hint_text:'Consider both gates.',reveal_next_on_submit:false}],assessment:kind==='bad'?{kind:'choice',control_a:'inlet',control_b:'',expected_choice:'slower',explanation:'Invalid slider-choice mismatch'}:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:'Record actions and explanation without pretending to grade.'}};
}
const rejected=compileExperience(proposal,xOutput('bad'),{instanceKey:'qa'});
assert.equal(rejected.status,'rejected');assert.match(errorForRepair(rejected,null),/choice check incompatible answer/);
const accepted=compileExperience(proposal,xOutput('good'),{instanceKey:'qa'});
const boundary=experienceContract(proposal,xOutput('good'),accepted,{attempts:[{},{},]});
assert.equal(boundary.version,'myway_experience_boundary_v1');assert.equal(boundary.intent.learner_task,proposal.experience_proposal.learner_task);assert.equal(boundary.delivery.real_2d_rendered,false);assert.equal(boundary.implementation.adapter,'symbolic_staged_controls_v1');
let calls={A:0,B:0,X:0,L:0};let validBriefPassed=false,repairedExactError=false,unchangedB=false,postEvidence=false;
const invoke=(role,input)=>{
 calls[role]++;
 if(role==='A'){
  const isPost=input.stage==='post',eid=input.current.id;
  if(isPost){postEvidence=!!input.activity_actual_evidence?.events?.length&&input.current.task_conditions?.simulated===true;}
  const reply=copy(seedA);reply.observed.evidence_ids=[eid];
  // First A response repeats the real paid pilot's invalid root-instance mistake;
  // a real model is NOT required to produce this or any other fixed answer.
  if(!isPost&&input.current.topic_id==='T01')reply.memory_decisions=[{...invalid1,evidence:[{id:eid,role:'context'}]}];
  return {raw:JSON.stringify(reply)};
 }
 if(role==='B'){
  validBriefPassed=!!input.learner_brief?.assessment?.current_understanding;
  if(input.topic.includes('reservoir'))return {raw:JSON.stringify({teacher_response:'A normal conversation can be enough.',experience_proposal:{modality:'none',setting:'',learner_task:'',possible_actions:[],private_assessment_intent:''}})};
  return {raw:JSON.stringify(proposal)};
 }
 if(role==='X'){
  unchangedB=JSON.stringify(input.creative)===JSON.stringify(proposal);
  if(input.previous_validation_error){repairedExactError=/choice check incompatible answer/.test(input.previous_validation_error);return {raw:JSON.stringify(xOutput('good'))};}
  return {raw:JSON.stringify(xOutput('bad'))};
 }
 if(role==='L'){
  assert.equal(input.hidden_rubric_not_supplied,true);
  assert.equal(input.current_stage.perceptual_limitation.length>0,true);
  assert.deepEqual(input.current_stage.controls.map(x=>x.id),['inlet','outlet']);
  return {raw:JSON.stringify({learner_utterance:'I wonder if the balance matters.',selected_actions:[{control:'inlet',operation:'set_value',value:'6'},{control:'outlet',operation:'set_value',value:'4'}],request_hint:false,declines:false})};
 }
 throw Error('Unexpected model role '+role);
};
let dir=null;
try{
 const runId='r2qa_'+process.pid+'_'+Date.now().toString(36);
 const result=await run({mode:'offline',episodes:2,method:'lexical',runId,secondRetrieval:'off'},{invoke,suppressHtml:true});dir=result.dir;
 assert.equal(result.trace.complete,true);
 assert.equal(result.trace.summary.full_learning_loops_with_valid_post_assessment,1);
 assert.equal(result.trace.summary.invalid_memory_actions,1);
 assert.equal(result.trace.summary.x_repair_calls,1);
 assert.equal(result.trace.summary.no_activity_by_B,1);
 assert.equal(result.trace.summary.invalid_translations_after_repair,0);
 assert.equal(result.trace.cost.calls,0);
 assert.equal(result.trace.db_writes,0);
 assert.equal(result.trace.timeline[0].event_replay_verified,true);
 assert.equal(result.trace.timeline[0].pre_a.valid,true);
 assert.equal(result.trace.timeline[0].pre_a.accepted_memory_actions,0);
 assert.equal(result.trace.timeline[0].pre_a.rejected_memory_actions.length,1);
 assert.equal(result.trace.timeline[0].experience_contract.intent.learner_task,proposal.experience_proposal.learner_task);
 assert.equal(result.trace.timeline[0].translation_attempts[0].validation_status,'rejected');
 assert.equal(result.trace.timeline[0].translation_attempts[1].validation_status,'symbolic_simulation_not_rendered');
 assert.equal(result.trace.timeline[1].execution.status,'no_activity');
 assert.deepEqual(calls,{A:3,B:2,X:2,L:1});
 assert.ok(validBriefPassed&&repairedExactError&&unchangedB&&postEvidence);
 assert.equal(fs.existsSync(path.join(dir,'TURN_INSPECTOR.html')),false);
 assert.equal(fs.existsSync(path.join(dir,'TRACE.json')),true);
}finally{if(dir&&fs.existsSync(dir))fs.rmSync(dir,{recursive:true,force:true});}
console.log('S62B-FIX1R2 SELFTEST PASS | A assessment isolated, rejected edits logged, B untouched, X bounded repair, staged L events/A post, no-activity skip, symbolic delivery, no API/DB');
