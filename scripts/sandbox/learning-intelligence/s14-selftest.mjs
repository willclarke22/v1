#!/usr/bin/env node
import assert from 'node:assert/strict';
import {flags,makeBank,missingReferent,compareEvidence,chooseHistory,runFlow} from './s14-flow.mjs';
assert.throws(()=>flags(['--mode','model']),/PAID MODE REFUSED/);
assert.throws(()=>flags(['--mode','fixture','--allow-spend']),/Paid flags/);
assert.throws(()=>flags(['--source','sandbox']),/Live sandbox source/);
assert.equal(flags(['--mode','model','--allow-spend','--budget-usd','0.04']).budget,.04);
assert.equal(makeBank().length,17);
assert.equal(missingReferent('I am confused why the voltage dropped there in the circuit'),true);
assert.equal(missingReferent('The voltage dropped across the resistor'),false);
assert.equal(compareEvidence('Why did the voltage drop there?', [{similarity:.6},{similarity:.5}]).requiresClarification,true);
assert.equal(compareEvidence('Why does the resistor voltage drop?', [{similarity:.6},{similarity:.5}]).requiresClarification,false);
assert.equal(chooseHistory([{event_id:'1',similarity:.8,topic_id:'a'},{event_id:'1',similarity:.7,topic_id:'a'}],'a').length,1);
const logger={log:()=>{}};
const u=await runFlow(flags(['--case','U02-ambiguous']),{logger});
assert.equal(u.finalAction,'hold_ambiguous_reference');assert.equal(u.cost.attemptedCalls,0);
const q=await runFlow(flags(['--case','Q03-refinement']),{logger});
assert.equal(q.finalAction,'await_model_c');assert.equal(q.retrieval.topicId,'fixture-03');
let count=0;
const usage={promptTokens:80,completionTokens:30,cachedTokens:0,totalTokens:110};
function fakeResponse(code,obj){return {ok:code>=200&&code<300,status:code,json:async()=>obj};}
const modelRequest=async(url,options)=>{
 const data=JSON.parse(options.body);count++;
 if(url.includes('/local-assessment/openai')){
  const c=data.userPrompt.includes('voltage dropped')?u:q;
  const a={...c.assessment,next_action:'proceed',clarifying_question:''};
  return fakeResponse(200,{raw:JSON.stringify(a),model:'gpt-4.1-mini',usage});
 }
 if(url.includes('memory-adjudicator-s13')){
  const id=data.input.historical_observations[0]?.event_id;
  return fakeResponse(200,{raw:JSON.stringify({identity:'same',interpretation:'retain',anchor_event_id:id,
   identity_rationale:'Same underlying conceptual gap based on stated evidence.',interpretation_rationale:'No materially new concept is evident.',
   evidence_basis:'The learner refers to the same general concept as the chosen history.',proposed_hypothesis:'',missing_evidence:''}),model:'gpt-4.1-mini',usage});
 }
 throw Error('Unapproved mock URL: '+url);
};
const paid=flags(['--mode','model','--case','U02-ambiguous','--allow-spend','--budget-usd','0.04']);
const test=await runFlow(paid,{logger,request:modelRequest,simulate:true});
assert.equal(test.finalAction,'hold_ambiguous_reference');assert.equal(test.adjudication.modelDecision.identity,'same');
assert.equal(test.cost.attemptedCalls,2);assert.equal(test.cost.complete,true);assert.ok(test.cost.knownEstimatedUsd>0);
const stopRequest=async(url,options)=>fakeResponse(200,{raw:JSON.stringify({...u.assessment,next_action:'clarify',clarifying_question:'Which circuit component?',root_problem_confidence:0.3}),model:'gpt-4.1-mini',usage});
const stop=await runFlow(paid,{logger,request:stopRequest,simulate:true});
assert.equal(stop.finalAction,'clarify_before_retrieval');assert.equal(stop.cost.attemptedCalls,1);
assert.ok(count>=2);
console.log('S1.4 SELFTEST PASS: 17-domain controlled bank, 2 end-to-end fixture paths, raw A->gate->C mocked, early clarification gate, optional history, cost accounting, ambiguity holds.');
