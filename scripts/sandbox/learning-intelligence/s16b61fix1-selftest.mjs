#!/usr/bin/env node
/** Strict offline / injected-provider tests. Never send API requests or modify a database. */
import assert from 'node:assert/strict';
import {fixturePublic} from './s16b60-fixture.mjs';
import {parseArgs,runJourney,loadPlans,assertPublicInput} from './s16b61-journey.mjs';
import {scriptedMock} from './s16b59-lean-core.mjs';
import {buildBoundedInput,recordBytes} from './s16b61fix1-context.mjs';
import {buildScorecard} from './s16b61fix1-scorecard.mjs';
import {selectModels,estimateCost,admissionEstimate} from './s16b61fix1-models.mjs';
import {replay} from './s16b61fix1-replay.mjs';
import {review} from './s16b61fix1-review.mjs';
const cases=fixturePublic(),plans=loadPlans();
assert.equal(cases.topics.length,30);assert.equal(plans.profiles.length,8);
assert.ok(plans.profiles.every(p=>p.private_fictional_state_not_truth.personality_and_behavior?.personality));
assert.throws(()=>parseArgs(['--mode','offline','--model-a','foo']),/Unsupported/);
assert.throws(()=>assertPublicInput({private_fictional_state_not_truth:'not allowed'}),/leaked/);
assert.deepEqual(selectModels(parseArgs(['--mode','offline','--model-a','gpt-4.1'])).A,'gpt-4.1');
assert.equal(estimateCost({prompt_tokens:1000000,completion_tokens:1000000,prompt_tokens_details:{cached_tokens:0}},'gpt-4.1'),10);
const offlineOpts=parseArgs(['--mode','offline','--learner','SAGE','--visits','5','--turns-per-visit','4']);
const original=await runJourney(offlineOpts);
assert.equal(original.summary.steps,20);assert.equal(original.summary.run_complete,true,JSON.stringify(original.failure));
assert.ok(original.request_log.every(r=>r.input_bytes<25000));
assert.ok(original.timeline.every(e=>e.request_diagnostics.A.bytes<=20500 && e.request_diagnostics.B.bytes<=20500));
assert.equal(buildScorecard(original).overall_verdict,'TECHNICALLY_COMPLETE_EDUCATIONAL_QUALITY_NOT_YET_VALIDATED');
assert.equal(buildScorecard(original).capabilities.find(x=>x.key==='learning_outcomes').status,'not_established_by_current_simulated_run');
let seenA=0,seenB=0,seenL=0;
const o=parseArgs(['--mode','model','--learner','SAGE','--visits','5','--turns-per-visit','4','--explore','on','--model-a','gpt-4.1','--model-b','gpt-4.1','--memory-mode','on','--allow-spend','--budget-usd','10.00']);
const t=await runJourney(o,{invoke:async(role,data,payload)=>{
 if(role!=='L'){assertPublicInput(data);assert.ok(!JSON.stringify(data).includes('personality_and_behavior'));}
 assert.ok(recordBytes(data)<25000);
 assert.equal(payload.model,role==='A'||role==='B'?'gpt-4.1':'gpt-4.1-mini');
 const usage={prompt_tokens:400,completion_tokens:150,prompt_tokens_details:{cached_tokens:0}};
 if(role==='A'){
  seenA++;const a=scriptedMock('A',data),id=data.latest_observation_id,prior=data.context.roots?.[0]?.id;
  a.presenting_difficulty='Maybe context-specific rate/quantity question';
  a.possible_underlying_causes=[{claim:'Possible learner-specific rate/amount confusion, unverified',support_ids:[id],counter_ids:[],alternatives:['Question could be only clarification'],uncertainty:'high'}];
  a.root_actions=[{existing_id:prior??null,action:prior?'refine':'propose',reason:'Tentative interpretation only, not confirmed',observation_ids:[id]}];
  return {raw:JSON.stringify(a),usage};
 }
 if(role==='B'){
  seenB++;const b=scriptedMock('B',data);b.reply='What do you think happens in a different example?';b.probe_offer='Can you explain your prediction in one sentence?';return {raw:JSON.stringify(b),usage};
 }
 seenL++;assert.ok(data.private_fictional_state_not_truth.personality_and_behavior);return {raw:JSON.stringify({learner_message:'I think the quantity changes but I am not sure if the rate changed too.',accept_probe:true,reasoning:'A natural uncertain prediction'}),usage};
 }});
assert.equal(t.summary.steps,20,JSON.stringify(t.failure));assert.equal(t.summary.run_complete,true,JSON.stringify(t.failure));
assert.ok(t.summary.root_records>=1);assert.ok(t.learner_histories.SAGE.roots[0].revisions.length>=10);
assert.ok(t.request_log.every(x=>x.input_bytes<25000));
assert.ok(t.timeline.every(x=>x.request_diagnostics.A.bytes<20501&&x.request_diagnostics.B.bytes<20501));
assert.ok(t.timeline.every(x=>x.model_inputs.A&&x.model_inputs.B));
assert.equal(t.summary.database_writes,0);assert.ok(seenA>=20&&seenB>=20&&seenL===15);
const ablation=parseArgs(['--mode','offline','--memory-mode','off','--learner','SAGE','--visits','2','--turns-per-visit','2']);
const ab=await runJourney(ablation);
assert.ok(ab.timeline.every(x=>x.model_inputs.B.context.roots.length===0&&x.model_inputs.B.context.relationships.length===0&&x.model_inputs.B.model_a_provisional_advisory===null));
const rep=await replay(t,{mode:'offline',model:'gpt-4.1',role:'A',limit:2});
assert.equal(rep.rows.length,2);assert.ok(rep.rows.every(x=>x.same_exact_input));
const rev=await review(t,{mode:'offline',limit:2,model:'gpt-4.1-mini'});
assert.equal(rev.reviews.length,2);assert.equal(rev.ledger.calls,0);
console.log('S61-FIX1 SELFTEST PASS: 20-turn sustained memory, compact bounded prompts, role-specific models, character profiles, A/B frozen replay, unscored evaluator, zero real API/DB writes.');
