#!/usr/bin/env node
/** Deterministic structural tests: no network, keys, model requests or database. */
import assert from 'node:assert/strict';
import {fixturePublic} from './s16b60-fixture.mjs';
import {loadPlans,selectedSchedule,parseArgs,runJourney,assertPublicInput} from './s16b61-journey.mjs';
import {scriptedMock} from './s16b59-lean-core.mjs';
const f=fixturePublic(),p=loadPlans();
assert.equal(f.topics.length,30);assert.equal(p.profiles.length,8);
const all=selectedSchedule(f,p,parseArgs(['--mode','offline','--learner','ALL','--visits','30']));
assert.equal(all.length,30);assert.equal(new Set(all.map(x=>x.case.focus_topic_id)).size,30);
assert.equal(new Set(all.map(x=>x.case.case_id)).size,30);
assert.throws(()=>parseArgs(['--mode','model']),/requires --allow-spend/);
assert.throws(()=>parseArgs(['--mode','offline','--allow-spend']),/offline mode/);
assert.throws(()=>assertPublicInput({private_fictional_state_not_truth:'secret'}),/leaked/);
const o=parseArgs(['--mode','offline','--learner','SAGE','--visits','3','--turns-per-visit','3']);
const r=await runJourney(o);
assert.equal(r.summary.run_complete,true,JSON.stringify(r.failure));
assert.equal(r.summary.steps,9);assert.equal(r.summary.topic_visits,3);assert.equal(r.summary.model_L_reactions,6);
assert.equal(r.summary.model_calls,0);assert.equal(r.summary.database_writes,0);
assert.equal(r.learner_histories.SAGE.topic_visits.length,3);
assert.equal(r.learner_histories.SAGE.observations.length,3*3+f.cases.find(c=>c.case_id==='C03').historical_observations.length);
assert.ok(r.timeline[1].learner_source.startsWith('MODEL_L'));
assert.ok(r.timeline.every(x=>x.model_a&&x.model_b&&x.learner_observation_id));
// Inject a local fake structured provider into "model" mode. It must receive no private-profile fields for A/B/C.
let seenA=0,seenB=0,seenL=0,mutatedRoot=false;
const modelOpts=parseArgs(['--mode','model','--learner','SAGE','--visits','2','--turns-per-visit','2','--allow-spend','--budget-usd','5.00']);
const report=await runJourney(modelOpts,{invoke:async (role,data,payload)=>{
 if(role!=='L'){assertPublicInput(data);assert.ok(!JSON.stringify(data).includes('private_fictional_state_not_truth'));}
 const usage={prompt_tokens:400,completion_tokens:150,prompt_tokens_details:{cached_tokens:0}};
 if(role==='A'){
  seenA++;
  const a=scriptedMock('A',data),id=data.latest_observation_id,existing=data.context.roots?.[0]?.id;
  a.presenting_difficulty='Can the learner distinguish stock and rate?';
  a.possible_underlying_causes=[{claim:'Possible confusion about stock and rate, not established',support_ids:[id],counter_ids:[],alternatives:['Unfamiliar diagram'],uncertainty:'high'}];
  a.root_actions=[{existing_id:existing??null,action:existing?'support':'propose',reason:'Observe reasoning under new probe',observation_ids:[id]}];
  if(existing)mutatedRoot=true;
  return {raw:JSON.stringify(a),usage};
 }
 if(role==='B'){seenB++;const b=scriptedMock('B',data);b.reply='Please predict what changes in this new example before I explain.';b.probe_offer='If the input rate doubles but outflow is steady, what happens to the stored amount?';return {raw:JSON.stringify(b),usage};}
 if(role==='L'){seenL++;assert.ok(data.private_fictional_state_not_truth);assert.ok(data.actual_tutor_probe);return {raw:JSON.stringify({learner_message:'I think it rises, but I am not certain how quickly. Would it rise faster?',accept_probe:true,reasoning:'A first prediction after a question'}),usage};}
 throw Error('Unexpected C');
}});
assert.equal(report.summary.run_complete,true,JSON.stringify(report.failure));
assert.equal(report.summary.steps,4);assert.equal(report.summary.model_L_reactions,2);
assert.equal(report.summary.model_calls,10);assert.equal(seenA,4);assert.equal(seenB,4);assert.equal(seenL,2);
assert.ok(report.summary.root_records>=1);assert.equal(mutatedRoot,true);
assert.ok(report.timeline[1].learner.includes('I think it rises'));
assert.equal(report.learner_histories.SAGE.roots[0].revisions.length,4);
assert.ok(report.learner_histories.SAGE.observations.some(x=>x.probe?.accepted===true));
assert.equal(report.summary.invalid_reference_checks,0);
console.log('S61 SELFTEST PASS: 30 topics, 8 separate fictional learners, model-L continuity, no hidden A/B input, evolving provisional roots, evidence IDs, zero API/DB writes.');
