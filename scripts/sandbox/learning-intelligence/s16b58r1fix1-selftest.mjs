#!/usr/bin/env node
/** Synthetic regression only, zero providers, zero DB writes. */
import assert from 'node:assert/strict';
import {parseArgs} from './s16b58-journey.mjs';
import {makePairedFixture,runFixed,evidenceReview} from './s16b58r1fix1-journey.mjs';
import {checkValidity} from './s16b58r1-core.mjs';
const pairs=[['LEARNER-A','T01'],['LEARNER-B','T02'],['LEARNER-A','T05'],['LEARNER-B','T06']];
const results={};
const args=(l,t)=>parseArgs(['--mode','offline','--limit','12','--learner-id',l,'--trial-id',t,'--retrieval','lexical']);
for(const [l,trial] of pairs){
 const f=makePairedFixture(l,trial),result=await runFixed(args(l,trial),{rootCheck:false});
 assert.equal(f.trial.first_learner_message,'Does sunlight get built into glucose?');
 assert.deepEqual([f.trial.suggested_probe_sequence[0],f.trial.later_unprompted_transfer_probe],['BIO01-P1','CHEM02-P1']);
 assert.equal(result.summary.initial_roots_exposed,['T05','T06'].includes(trial)?0:2);
 assert.equal(result.summary.observations_exposed,6);
 assert.equal(result.summary.probe_responses_observed,2);
 assert.equal(result.summary.unscored_responses_preserved,1);
 assert.equal(result.summary.observation_evidence_available,2);
 assert.equal(result.summary.invalid_probes,0);
 assert.equal(result.summary.db_writes,0);
 assert.equal(result.summary.authoritative_memory_writes,0);
 assert.equal(result.summary.stopped,false);
 assert.ok(!JSON.stringify(result).includes('"knowledge_state"'));
 assert.ok(!JSON.stringify(result).includes('"probe_scoring_PRIVATE"'));
 const [first,second]=result.probe_observations;
 assert.equal(first.probe_id,'BIO01-P1');assert.equal(second.probe_id,'CHEM02-P1');
 assert.equal(first.scoring_screen.correctness,'unknown_not_semantically_graded');
 assert.equal(second.scoring_screen.correctness,'unknown_not_semantically_graded');
 assert.ok(first.verbatim_response.length>5);
 if(l==='LEARNER-A'){
  assert.match(first.verbatim_response,/sunlight supplies part of the carbon/i);
  assert.equal(first.scoring_screen.screen_passed,false);
  assert.equal(first.interpretation_status,'commentary_only_no_root_stance');
 }
 results[trial]=result;
}
for(const [a,b] of [['T01','T05'],['T02','T06']]){
 assert.equal(results[a].paired_comparison.public_probe_fingerprint,results[b].paired_comparison.public_probe_fingerprint);
 assert.deepEqual(results[a].probe_observations.map(x=>x.verbatim_response),results[b].probe_observations.map(x=>x.verbatim_response));
}
// A and B produce DIFFERENT observations to identical questions, not fabricated accuracy labels.
assert.notEqual(results.T01.probe_observations[0].verbatim_response,results.T02.probe_observations[0].verbatim_response);
assert.throws(()=>makePairedFixture('LEARNER-C','T04'),/four paired/);
const a=makePairedFixture('LEARNER-A','T01');
const invalid={...a.probes.find(p=>p.probe_id==='BIO01-P1'),prompt:'Three CO2 molecules make one glucose molecule with six carbons. Explain why.'};
assert.equal(checkValidity(invalid,a.scenes).valid,false);
// Declined responses are observations of preference/consent, not evidence of incorrect science.
assert.deepEqual(evidenceReview({probe_events:[{phase:'baseline',probe_id:'BIO01-P1',offer_status:'declined_not_failure',response:{response:'Not now'}}]})[0].scoring_screen.correctness,'unknown_not_semantically_graded');
console.log('S58-R1-FIX1 SELFTEST PASS: paired A/B and roots/no-roots opening/probes; 8 observed responses including unscored misconceptions; no incorrect correctness claims; prior research untouched; zero DB/model calls.');
