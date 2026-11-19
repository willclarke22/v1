#!/usr/bin/env node
/** Contract and integration tests: zero real model API, embeddings, DB, renderer, audio calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {A_SCHEMA,B_SCHEMA,L_SCHEMA,A_PROMPT,B_PROMPT,verifyA,applyA} from './s62b-core.mjs';
import {compileExperience,publicStage,executePhase,replay,assertReplay,evidenceFromAttempt} from './s62bfix1-experience.mjs';
import {initialState,EPISODES,routeAuthoredEpisode} from './s62b-scenario.mjs';
import {retrieve} from './s62b-retrieval.mjs';
import {parseArgs,run} from './s62bfix1-journey.mjs';
const st=initialState();assert.equal(st.topics.length,5);assert.equal(EPISODES.length,20);assert.equal(new Set(EPISODES.map(x=>x.topic_id)).size,13);
for(const x of EPISODES)routeAuthoredEpisode(st,x);assert.equal(st.topics.length,13);assert.equal(st.topics.filter(x=>x.status==='new_from_authored_opening').length,8);
assert.ok(!B_PROMPT.includes('set_value')&&!B_PROMPT.includes('MyWay')&&!B_PROMPT.includes('event handler'));
for(const x of [A_SCHEMA,B_SCHEMA,L_SCHEMA])assert.equal(x.additionalProperties,false);
const q={id:'E-TEST',topic_id:'T01',text:'I think the total fell when the positive slope slowed',conditions:{mode:'question'}};st.observations.push(q);
const pkt=await retrieve(st,q,{method:'lexical',cap:7});assert.equal(pkt.allowed_evidence_ids.includes(q.id),true);assert.equal(pkt.allowed_evidence_ids.length<=7,true);assert.equal(pkt.memory_candidates.some(x=>x.id==='NORA-R-001'),true);
const a={observed:{kind:'question',evidence_ids:['E-TEST'],demonstrated:'The learner expressed uncertainty',untested_or_incorrect:'No independent solution was attempted',conditions:'question'},interpretation:{hypotheses:[],uncertainty:'high',more_history_needed:null},memory_decisions:[{action:'weaken',record_type:'root',target_id:'NORA-R-001',claim:'Rate-versus-level difficulty may be reduced in the tested context',topics:['T01'],possible_instances:[],evidence:[{id:'E-TEST',role:'context'}],rationale:'Synthetic testing only; not an educational claim',uncertainty:'high'}],learner_brief_for_B:{current_understanding:'Unclear',remaining_uncertainty:'Further testing',relevant_history:'One related question',possible_shared_root:null,teaching_response_evidence:''}};
assert.throws(()=>verifyA({...a,memory_decisions:[{...a.memory_decisions[0],target_id:'NORA-R-999'}]},pkt,st),/typed memory target/);
assert.throws(()=>verifyA({...a,memory_decisions:[{...a.memory_decisions[0],record_type:'understanding'}]},pkt,st),/typed memory target/);
assert.throws(()=>verifyA({...a,memory_decisions:[{...a.memory_decisions[0],evidence:[{id:'E-NO',role:'supports_current'}]}]},pkt,st),/invalid cited evidence/);
const before=JSON.stringify(st.records[0]),ok=verifyA(a,pkt,st),actions=applyA(st,ok,'E-TEST');assert.equal(actions.length,1);assert.equal(st.records[0].status,'challenged');assert.equal(st.records[0].evidence.context.includes('E-TEST'),true);assert.notEqual(JSON.stringify(st.records[0]),before);
const createShare={...a,memory_decisions:[{action:'create',record_type:'shared_root',target_id:null,claim:'Possible shared cause',topics:['T01','T02'],possible_instances:['NORA-R-001','NORA-R-002'],evidence:[{id:'E-TEST',role:'context'}],rationale:'Mock',uncertainty:'high'}]};
assert.throws(()=>verifyA({...createShare,memory_decisions:[{...createShare.memory_decisions[0],topics:['T01']}]},pkt,st),/shared root/);
assert.throws(()=>verifyA(createShare,pkt,st),/existing shared root/);
const creative={teacher_response:'Imagine a reservoir and predict what happens.',experience_proposal:{modality:'2d',setting:'Reservoir valves',learner_task:'Predict changing water level',possible_actions:['adjust valves'],private_assessment_intent:'Rate versus total'}};
const translated={status:'compiled',reason:'symbolic',stages:[
 {instruction:'Predict from words only',visible_scene:'The river is slowing. No numbers shown.',controls:[{id:'prediction',kind:'select',label:'Predict',choices:['rise','fall','unknown'],min:0,max:0}],feedback_on_submit:'Now you can see the numbers.',hint_text:'Think about what else affects the level.',reveal_next_on_submit:true},
 {instruction:'Now compare inflow and outflow',visible_scene:'Inflow 6, outflow 2',controls:[{id:'inflow',kind:'slider',label:'Inflow',choices:[],min:0,max:10},{id:'outflow',kind:'slider',label:'Outflow',choices:[],min:0,max:10}],feedback_on_submit:'Done',hint_text:'Compare the two numbers.',reveal_next_on_submit:false}],assessment:{kind:'balance',control_a:'inflow',control_b:'outflow',expected_choice:'',explanation:'The rates can be compared'}};
const plan=compileExperience(creative,translated),phase0=publicStage(plan,0);
assert.equal(JSON.stringify(phase0).includes('Inflow 6'),false);assert.equal(JSON.stringify(phase0).includes('Think about'),false);assert.equal(JSON.stringify(phase0).includes('balance'),false);
const hint=executePhase(plan,0,{learner_utterance:'Can I have a hint?',selected_actions:[],request_hint:true,declines:false});assert.equal(hint.result.status,'hint_requested');assert.equal(hint.events.at(-1).type,'hint_delivered');
const publicHint=publicStage(plan,0,{hint:hint.hint});assert.equal(publicHint.hint_revealed,hint.hint);
const first=executePhase(plan,0,{learner_utterance:'I think it falls',selected_actions:[{control:'prediction',operation:'select',value:'fall'}],request_hint:false,declines:false},hint.events);
const second=executePhase(plan,1,{learner_utterance:'It rises',selected_actions:[{control:'inflow',operation:'set_value',value:'6'},{control:'outflow',operation:'set_value',value:'2'}],request_hint:false,declines:false},[...hint.events,...first.events]);
assert.equal(second.result.objective_check.net_difference,4);
assert.throws(()=>executePhase(plan,0,{selected_actions:[{control:'inflow',operation:'set_value',value:'6'}],request_hint:false,declines:false}),/not in learner-visible/);
assert.throws(()=>executePhase(plan,0,{selected_actions:[{control:'prediction',operation:'select',value:'always'}],request_hint:false,declines:false}),/not available/);
const scripted=[{phase:0,response:{learner_utterance:'Can I have a hint?',selected_actions:[],request_hint:true,declines:false}},{phase:0,response:{learner_utterance:'I think it falls',selected_actions:[{control:'prediction',operation:'select',value:'fall'}],request_hint:false,declines:false}},{phase:1,response:{learner_utterance:'It rises',selected_actions:[{control:'inflow',operation:'set_value',value:'6'},{control:'outflow',operation:'set_value',value:'2'}],request_hint:false,declines:false}}];
assertReplay(plan,scripted,{events:[...hint.events,...first.events,...second.events],completed:[hint,first,second]});
const all=[hint,first,second],attempt=evidenceFromAttempt(plan,all,{learner_id:'NORA',topic_id:'T02',observation_id:'E-ATT'});
assert.equal(attempt.task_conditions.assistance,true);assert.equal(attempt.task_conditions.objective_checks.at(-1).net_difference,4);
assert.equal(attempt.actual_activity.events.some(e=>e.type==='hint_delivered'),true);
assert.equal(JSON.stringify(attempt).includes('Misunderstanding'),false);
assert.equal(plan.status,'symbolic_simulation_not_rendered');
const reject=compileExperience({...creative,experience_proposal:{...creative.experience_proposal,modality:'audio'}},{status:'unsupported',reason:'No real audio playback',stages:[],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}});assert.equal(reject.status,'rejected');
assert.equal(compileExperience(creative,{...translated,stages:[{...translated.stages[0],reveal_next_on_submit:false},translated.stages[1]]}).status,'rejected');

// FIX1 evidence: stable design, unique delivery IDs, event provenance and replay.
const reusedA=compileExperience(creative,translated,{instanceKey:'learner-episode-1'});
const reusedB=compileExperience(creative,translated,{instanceKey:'learner-episode-2'});
assert.equal(reusedA.design_id,reusedB.design_id);
assert.notEqual(reusedA.activity_instance_id,reusedB.activity_instance_id);
assert.equal(reusedA.id,reusedA.activity_instance_id);
assert.equal(publicStage(reusedA,0).activity_instance_id,reusedA.activity_instance_id);
const actA=executePhase(reusedA,0,{learner_utterance:'fall',selected_actions:[{control:'prediction',operation:'select',value:'fall'}],request_hint:false,declines:false});
const actB=executePhase(reusedB,0,{learner_utterance:'rise',selected_actions:[{control:'prediction',operation:'select',value:'rise'}],request_hint:false,declines:false});
assert.equal(actA.events[0].activity_instance_id,reusedA.activity_instance_id);
assert.equal(actB.events[0].activity_instance_id,reusedB.activity_instance_id);
assert.notEqual(actA.events[0].activity_instance_id,actB.events[0].activity_instance_id);
assertReplay(reusedA,[{phase:0,response:{learner_utterance:'fall',selected_actions:[{control:'prediction',operation:'select',value:'fall'}],request_hint:false,declines:false}}],{events:actA.events,completed:[actA]});
const noAttempt=executePhase(reusedA,1,{learner_utterance:'',selected_actions:[],request_hint:false,declines:false});
assert.equal(noAttempt.result.status,'no_attempt');assert.equal(noAttempt.feedback,null);
assert.equal(noAttempt.result.objective_check.kind,'not_attempted');
assert.equal(noAttempt.events[0].type,'no_attempt');assert.equal(noAttempt.result.objective_check.goal_met,undefined);
const emptyText=compileExperience({...creative,experience_proposal:{...creative.experience_proposal,modality:'text'}},
{status:'compiled',reason:'text',stages:[{instruction:'Answer',visible_scene:'Text question',controls:[{id:'answer',kind:'text',label:'Answer',choices:[],min:0,max:0}],feedback_on_submit:'Feedback',hint_text:'Think',reveal_next_on_submit:false}],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}});
assert.equal(executePhase(emptyText,0,{selected_actions:[{control:'answer',operation:'text_response',value:'  '}],request_hint:false,declines:false}).result.status,'no_attempt');
const partial=executePhase(reusedA,1,{learner_utterance:'only inflow',selected_actions:[{control:'inflow',operation:'set_value',value:'6'}],request_hint:false,declines:false});
assert.equal(partial.result.status,'incomplete');assert.equal(partial.feedback,null);
assert.equal(partial.result.objective_check.kind,'insufficient_controls');
assert.equal(partial.result.objective_check.goal_met,undefined);
const full=executePhase(reusedA,1,{learner_utterance:'equal rates',selected_actions:[{control:'inflow',operation:'set_value',value:'5'},{control:'outflow',operation:'set_value',value:'5'}],request_hint:false,declines:false});
assert.equal(full.result.status,'submitted');assert.equal(full.result.objective_check.goal_met,true);
const declined=executePhase(reusedA,1,{declines:true,request_hint:false,selected_actions:[]});
assert.equal(declined.result.status,'declined');assert.equal(declined.result.objective_check.kind,'not_attempted');
const noObs=evidenceFromAttempt(reusedA,[noAttempt],{learner_id:'NORA',topic_id:'T01',observation_id:'NO-ATTEMPT'});
assert.equal(noObs.actual_activity.activity_instance_id,reusedA.activity_instance_id);
assert.deepEqual(noObs.task_conditions.attempt_outcomes,['no_attempt']);
assert.ok(noObs.actual_activity.events.every(e=>e.activity_instance_id===reusedA.activity_instance_id));
const actualHint=executePhase(reusedA,0,{learner_utterance:'hint please',selected_actions:[],request_hint:true,declines:false});
const retry=executePhase(reusedA,0,{learner_utterance:'fall',selected_actions:[{control:'prediction',operation:'select',value:'fall'}],request_hint:false,declines:false},actualHint.events);
assert.equal(retry.result.had_hint,true);
const hintThenAttempt=evidenceFromAttempt(reusedA,[actualHint,retry],{learner_id:'NORA',topic_id:'T01',observation_id:'HINT-ATTEMPT'});
assert.equal(hintThenAttempt.task_conditions.assistance,true);
assert.deepEqual(hintThenAttempt.actual_activity.stages_presented.map(x=>x.phase),[1,1]);
assert.ok(hintThenAttempt.actual_activity.stages_presented.every(x=>!x.visible_scene.includes('Inflow 6')));
assert.throws(()=>executePhase(reusedA,0,{selected_actions:[{control:'inflow',operation:'set_value',value:'6'}],request_hint:false,declines:false}),/not in learner-visible/);
assert.equal(reject.stages.length,0);

const id='SELFTEST_'+process.pid;
const o=parseArgs(['--mode','offline','--episodes','4','--run-id',id]);
const rr=await run(o);assert.equal(rr.trace.complete,true,JSON.stringify(rr.trace.failure));assert.equal(rr.trace.summary.episodes,4);assert.equal(rr.trace.summary.new_topics,1);assert.equal(rr.trace.summary.unexecuted_experiences,1);assert.equal(rr.trace.summary.db_writes,0);
assert.equal(rr.trace.timeline[0].phases[0].view.modality,'symbolic_actions_only');
assert.ok(rr.trace.timeline[0].phases[0].events.some(e=>e.type==='action'));
assert.equal(rr.trace.timeline[0].phases[0].result.actions,2);
assert.equal(rr.trace.timeline[0].phases[0].result.objective_check.goal_met,true);
assert.equal(rr.trace.timeline[1].phases[0].result.actions,2);
assert.equal(rr.trace.timeline[0].execution.design_id,rr.trace.timeline[1].execution.design_id);
assert.notEqual(rr.trace.timeline[0].execution.activity_instance_id,rr.trace.timeline[1].execution.activity_instance_id);
assert.equal(rr.trace.timeline[0].activity_evidence.actual_activity.activity_instance_id,rr.trace.timeline[0].execution.activity_instance_id);
assert.ok(rr.trace.timeline[0].phases[0].events.every(e=>e.activity_instance_id===rr.trace.timeline[0].execution.activity_instance_id));
assert.equal(rr.trace.timeline[2].execution.status,'rejected');
assert.equal(rr.trace.timeline.filter(e=>e.event_replay_verified).length,3);
assert.equal(rr.trace.request_log.every(r=>r.request.store===false),true);
assert.equal(rr.trace.request_log.every(r=>!JSON.stringify(r.request).includes('OPENAI_API_KEY')),true);
assert.equal(fs.existsSync(path.join(rr.dir,'TURN_INSPECTOR.html')),true);
fs.rmSync(rr.dir,{recursive:true,force:true});
const injectedCases=['no_attempt','partial','declined','invalid'];
for(const tag of injectedCases){
 const callback=async(role,input)=>{
  if(role==='A')return {raw:JSON.stringify({observed:{kind:'question',evidence_ids:[input.current.id],demonstrated:'Simulated observation',untested_or_incorrect:'No validated mastery',conditions:'fault injection'},interpretation:{hypotheses:[],uncertainty:'high',more_history_needed:null},memory_decisions:[],learner_brief_for_B:{current_understanding:'Uncertain',remaining_uncertainty:'Unverified',relevant_history:'None',possible_shared_root:null,teaching_response_evidence:'None'}})};
  if(role==='B')return {raw:JSON.stringify(creative)};
  if(role==='X')return {raw:JSON.stringify({...translated,stages:[{...translated.stages[1],reveal_next_on_submit:false}]})};
  if(role==='L'){
   const selected_actions=tag==='no_attempt'?[]:tag==='partial'?[{control:'inflow',operation:'set_value',value:'5'}]:tag==='invalid'?[{control:'unknown',operation:'set_value',value:'5'}]:[];
   return {raw:JSON.stringify({learner_utterance:'Test learner',selected_actions,request_hint:false,declines:tag==='declined'})};
  }
  throw Error('Unexpected role');
 };
 const injected=await run(parseArgs(['--mode','offline','--episodes','1','--run-id',`FIX1_${tag}_${process.pid}`]),{invoke:callback});
 assert.equal(injected.trace.complete,true,JSON.stringify(injected.trace.failure));
 const ep=injected.trace.timeline[0];
 if(tag==='invalid'){assert.ok(ep.invalid_attempt);assert.equal(ep.activity_evidence.task_conditions.invalid_action.includes('not in learner-visible controls'),true);assert.equal(ep.phases.length,0);}
 else {const res=ep.phases[0].result;assert.equal(res.status,tag==='partial'?'incomplete':tag);assert.equal(res.objective_check.goal_met,undefined);assert.equal(ep.activity_evidence.actual_activity.activity_instance_id,ep.execution.activity_instance_id);}
 assert.ok(ep.post_a.valid,'Post-assessment receives activity observation');
 fs.rmSync(injected.dir,{recursive:true,force:true});
}
console.log('S62B-FIX1 SELFTEST PASS | 5→13 topics, typed root provenance, phase gates, hinted actions, replay, unsupported audio, full A-B-X-L-A mock loop; zero API/DB');
