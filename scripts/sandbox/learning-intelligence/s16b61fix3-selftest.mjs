#!/usr/bin/env node
/** Deterministic injected-provider tests. Zero API, database or production calls. */
import assert from 'node:assert/strict';
import {scriptedMock} from './s16b59-lean-core.mjs';
import {parseArgs,prepare,runComparison,renderComparison,renderBlindWorksheet} from './s16b61fix3-compare.mjs';
const a=scriptedMock('A',{}),b=scriptedMock('B',{});
const base={schema:'myway_s16b61_longitudinal_v1',run_type:'model',summary:{run_complete:true},private_truth_in_A_B_C:false,database_writes:0,
 options:{prompt:'s60',models:{A:'gpt-4.1-mini',B:'gpt-4.1-mini',C:'gpt-4.1-mini',L:'gpt-4.1-mini'}},timeline:[]};
for(let s=1;s<=2;s++){const id='TEST-'+s;const context={observations:[{id,text:'Learner demonstrates a correct distinction in a practice example.',topic_id:'T'}],roots:[{id:'ROOT-1',claim:'Possible prior rate-versus-total confusion'}],relationships:[],coverage:{included_observation_ids:[id]}};
 base.timeline.push({step:s,learner_id:'TEST',topic_id:'T',topic_title:'Controlled sample',learner_observation_id:id,
  learner:'Is an increasing slope different from the amount already present?',model_a:structuredClone(a),model_b:structuredClone(b),
  model_inputs:{A:{role:'A',topic_id:'T',latest_observation_id:id,learner_message:'Question',allowed_observation_ids:[id],context},
   B:{role:'B',topic_id:'T',latest_observation_id:id,learner_message:'Question',allowed_observation_ids:[id],context}},
  retrieval:{A:{included_ids:[id]},B:{included_ids:[id]}}});}
const opts={mode:'model',role:'A',trace:'injected',model:'gpt-4.1',limit:2,budget:1,allowSpend:true};
const prepared=prepare(base,opts);assert.equal(prepared.steps.length,2);assert.equal(prepared.baselineModel,'gpt-4.1-mini');
let count=0;
const fake=async payload=>{count++;assert.equal(payload.model,'gpt-4.1');assert.match(payload.messages[0].content,/Model A/i);
 const answer=structuredClone(a);answer.presenting_difficulty=null;
 answer.root_actions=[{existing_id:'ROOT-1',action:'weaken',reason:'New answer suggests improvement; history remains provisional',observation_ids:['TEST-'+count]}];
 return {raw:JSON.stringify(answer),usage:{prompt_tokens:1100,completion_tokens:300,prompt_tokens_details:{cached_tokens:0}}};};
const output=await runComparison(base,opts,{invoke:fake,sourceTraceHash:'synthetic-test'});
assert.equal(output.completed,2);assert.equal(output.complete,true);assert.equal(output.cost.calls,2);assert.ok(output.cost.estimated_usd>0);
assert.deepEqual(output.results[0].candidate_checks.unknown_citation_ids,[]);
assert.equal(output.results[0].candidate.root_actions[0].action,'weaken');
assert.ok(renderComparison(output).includes('weaken'));
assert.ok(renderBlindWorksheet(output).includes('Candidate X'));
assert.ok(renderBlindWorksheet(output).includes('Candidate Y'));
const offline=await runComparison(base,{...opts,mode:'offline',budget:0,allowSpend:false},{sourceTraceHash:'offline'});
assert.equal(offline.cost.calls,0);assert.equal(offline.results[0].status,'offline_packet_verified');
assert.throws(()=>prepare({...base,options:{...base.options,models:{...base.options.models,A:'gpt-4.1'}}},opts),/baseline/);
assert.throws(()=>prepare({...base,private_truth_in_A_B_C:true},opts),/isolation/);
assert.throws(()=>prepare({...base,timeline:[{...base.timeline[0],model_inputs:{A:{...base.timeline[0].model_inputs.A,private_fictional_state_not_truth:'secret'}}},base.timeline[1]]},opts),/Private simulated state/);
assert.throws(()=>parseArgs(['--mode','model','--trace','any','--role','A','--model','gpt-4.1']),/spend/);
console.log('S61-FIX3 SELFTEST PASS: frozen same-input A replay, mini baseline provenance, evidence IDs, blind comparison, optional B contract, spend opt-in, no hidden truth, zero real API/DB calls.');
