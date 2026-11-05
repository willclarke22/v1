#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {args,shadowAssessmentGate,runS15} from './s15-flow.mjs';
import {loadCases} from './s13-evaluator.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const cases=loadCases();
const q03=cases.find(c=>c.id==='Q03-refinement'),u02=cases.find(c=>c.id==='U02-ambiguous');
assert.ok(q03&&u02);
const q03Assess={topic_name:q03.topicLabel,evidence_quote:q03.message,root_problem:q03.root,root_problem_confidence:.9,next_action:'clarify',clarifying_question:'What do you know about ion channels?'};
assert.equal(shadowAssessmentGate(q03Assess,'baseline',q03.message,null,'clarify').route,'clarify');
assert.equal(shadowAssessmentGate(q03Assess,'myway',q03.message,null,'clarify').route,'proceed');
assert.equal(shadowAssessmentGate(q03Assess,'myway',q03.message,null,'clarify').shadowOverride,true);
assert.equal(shadowAssessmentGate({...q03Assess,evidence_quote:''},'myway',q03.message,null,'clarify').route,'clarify');
const u02Assess={...q03Assess,topic_name:u02.topicLabel,evidence_quote:u02.message,root_problem:u02.root};
assert.equal(shadowAssessmentGate(u02Assess,'myway',u02.message,null,'clarify').route,'clarify');
assert.equal(shadowAssessmentGate(u02Assess,'myway',u02.message,'At the battery terminals','proceed').route,'proceed');
for(const invalid of [['--mode','model'],['--mode','fixture','--allow-spend'],['--source','sandbox','--message','test'],['--model','gpt-large']])assert.throws(()=>args(invalid));
const silent={log(){}};
const fixture={mode:'fixture',source:'fixture',policy:'paired',caseId:'Q03-refinement',message:null,answer:null,model:'gpt-4.1-mini',budget:null,allowSpend:false,saveEvidence:false};
const replay=await runS15(fixture,{logger:silent});
assert.equal(replay.policies.length,2);assert.equal(replay.policies[0].finalAction,'clarify_learner');
assert.equal(replay.policies[1].finalAction,'teaching_complete_memory_pending_model_c');
assert.equal(replay.policies[1].teaching.teaching_strategy.startsWith('This is an offline'),true);
assert.equal(replay.cost.attemptedCalls,0);
const unclear=await runS15({...fixture,policy:'myway',caseId:'U02-ambiguous'},{logger:silent});
assert.equal(unclear.policies[0].finalAction,'clarify_learner');
assert.match(unclear.policies[0].clarification,/which point or component/i);
const clarified=await runS15({...fixture,policy:'myway',caseId:'U02-ambiguous',answer:'At the battery terminals.'},{logger:silent});
assert.equal(clarified.policies[0].finalAction,'teaching_complete_memory_pending_model_c');
assert.equal(clarified.policies[0].stages.filter(s=>s.stage==='assessment_gate').length,2);
const usage={promptTokens:170,completionTokens:75,cachedTokens:0,totalTokens:245};
const fetchEvents=[];
async function mock(url,params){
 const body=JSON.parse(params.body);fetchEvents.push({url,body});let raw;
 if(url.includes('/openai')){
  const follow=body.userPrompt.includes('LATEST LEARNER ANSWER:');
  raw=JSON.stringify({topic_name:q03.topicLabel,evidence_quote:follow?'At the SA node membrane':q03.message,
   root_problem:q03.root,confusion:5,insight:1,next_action:follow?'proceed':'clarify',clarifying_question:follow?'':'What do you know about ion channels?',root_problem_confidence:.9});
 }else if(url.endsWith('/embed')){
  const texts=body.texts||[];const v=Array.from({length:384},(_,i)=>i===0?1:0);
  return {ok:true,json:async()=>({vectors:texts.map(()=>v)})};
 }else if(url.includes('shadow-s15')&&body.stage==='teaching'){
  raw=JSON.stringify({teaching_strategy:'SA node cells slowly depolarize as ion currents change the membrane voltage.',next_step:'Compare the gradual drift with the rapid upstroke.',visual_intent:'A pacemaker potential versus time diagram.'});
 }else if(url.includes('/teaching')){
  raw=JSON.stringify({teaching_strategy:'The SA node generates recurring electrical activity.',next_step:'Compare the phases.',visual_intent:'none'});
 }else if(url.includes('shadow-s15')&&body.stage==='memory'||url.includes('memory-adjudicator-s13')){
  const input=body.context??body.input;raw=JSON.stringify({identity:'same',interpretation:'retain',anchor_event_id:input.historical_observations[0].event_id,
   identity_rationale:'Both statements express the same underlying learning obstacle.',interpretation_rationale:'No meaningful evidence to revise root issue.',evidence_basis:'Both descriptions concern the same mechanism.',proposed_hypothesis:'',missing_evidence:''});
 }else throw Error('Unexpected mocked endpoint '+url);
 return {ok:true,json:async()=>({raw,model:'gpt-4.1-mini',usage})};
}
const model={...fixture,mode:'model',policy:'myway',budget:.10,allowSpend:true};
const full=await runS15(model,{request:mock,logger:silent});
assert.equal(full.policies[0].finalAction,'teaching_complete_shadow_memory_proposal',JSON.stringify(full.policies[0].error||''));
assert.equal(full.policies[0].modelC.identity,'same');
assert.equal(full.cost.attemptedCalls,3);assert.equal(full.cost.complete,true);
assert.ok(fetchEvents.some(x=>x.url.includes('shadow-s15')&&x.body.stage==='teaching'));
assert.ok(fetchEvents.some(x=>x.url.includes('shadow-s15')&&x.body.stage==='memory'));
assert.equal(fetchEvents.filter(x=>x.url.includes('openai')).length,1);
assert.ok(!fetchEvents.some(x=>JSON.stringify(x.body).includes('benchmark_label')));
const result2=await runS15({...model,answer:'At the SA node membrane'},{request:mock,logger:silent});
assert.equal(result2.policies[0].finalAction,'teaching_complete_shadow_memory_proposal',JSON.stringify(result2.policies[0].error||''));
assert.equal(result2.cost.attemptedCalls,4);
assert.ok(fetchEvents.filter(x=>x.url.includes('openai')).some(x=>x.body.userPrompt.includes('EARLIER LEARNER STATEMENT:')));
console.log('S1.5 SELFTEST PASS: Q03 grounded continuation, U02 safe clarification, two-turn replay, unchanged baseline, mocked A/B/C, token costs and no writes.');
