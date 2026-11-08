#!/usr/bin/env node
/** S1.6B.5.2 synthetic-only research quality and safety regression. 0 real network/model/DB calls. */
import assert from 'node:assert/strict';
import {loadRealismCorpus,prepareCase,caseInputs,corpusCoverage} from './s16b52-corpus.mjs';
import {parseRealismArgs,runRealism,reviewText,blindReviewText,blindReviewCSV,answerKey} from './s16b52-eval.mjs';
const c=loadRealismCorpus();const cover=corpusCoverage(c);
assert.equal(cover.threads,10);assert.equal(cover.snapshots,48);assert.equal(cover.dev,36);assert.equal(cover.holdout,12);
assert.equal(Object.keys(cover.actions).length,7);assert.ok(cover.minWords<9&&cover.maxWords>=17);assert.ok(cover.ambiguity.context_required>=12);
for(const s of c.snapshots){
 const source=caseInputs(s,{routing:'oracle'});
 for(const x of source.context_candidates){const raw=s.prior_turns.find(t=>t.turn_id===x.turn_id);assert.ok(raw);
  assert.equal(x.text,raw.text);assert.equal(x.source,raw.role==='learner'?'historical_learner_statement':'prior_teaching');
  assert.equal(x.verified_as_learner_evidence,raw.role==='learner');}
 assert.equal(source.profileInput.user_interests.length,0);
 for(const routing of ['oracle','inferred']){
  const plan=prepareCase(s,{routing});
  assert.ok(['PREPARED','SAFE_HOLD'].includes(plan.status));
  if(plan.status==='PREPARED'){
   assert.equal(plan.request.voice_version,'adaptive_v5');assert.equal(plan.trace.interest_mode,'do_not_use');
   assert.equal(plan.request.model,'gpt-4.1-mini');assert.equal(plan.trace.only_synthetic_source,true);
   assert.ok(plan.selected.every(x=>source.context_candidates.some(y=>y.text===x.text&&y.evidence_id===x.evidence_id)));
   if(routing==='oracle')assert.equal(plan.action,s.oracle.action,'oracle action should match authored target');
   if(['correction','clarification_answer'].includes(routing==='oracle'?s.oracle.intent:plan.trace.inferred_intent)){
    assert.ok(plan.trace.evidence_target.length>0,'Must pin an exact correction anchor');
    assert.ok(plan.trace.evidence_target.every(id=>plan.selected.some(x=>x.evidence_id===id)),'Pinned anchor must be selected');
   }
  }
 }
}
for(const args of [['--mode','model'],['--mode','offline','--allow-spend'],['--set','holdout'],['--set','all'],['--mode','model','--allow-spend','--budget-usd','0.5','--limit','7'],['--routing','bad']])assert.throws(()=>parseRealismArgs(args));
let calls=0;
const offline=await runRealism(parseRealismArgs(['--limit','36']),{rootCheck:false,corpus:c,invoke:()=>{calls++;throw Error('Provider forbidden');}});
assert.equal(calls,0);assert.equal(offline.results.length,72);
assert.equal(offline.results.filter(r=>r.routing==='oracle'&&r.action===r.expected_action_for_analysis).length,36);
assert.ok(offline.results.filter(r=>r.routing==='inferred'&&r.action!==r.expected_action_for_analysis).length>0);
assert.equal(offline.costs.attemptedCalls,0);assert.equal(offline.costs.knownEstimatedUsd,0);
const sample=parseRealismArgs(['--mode','model','--limit','1','--routing','both','--allow-spend','--budget-usd','0.05']);
const valid=JSON.stringify({teaching_strategy:'The earlier phrasing missed the actual question. Here is the causal link.',next_step:'Invite a check only if requested.',visual_intent:'none'});
const mocked=await runRealism(sample,{rootCheck:false,corpus:c,invoke:async()=>{calls++;return {raw:valid,usage:{promptTokens:250,completionTokens:55,cachedTokens:0}};}});
assert.equal(mocked.results.length,2);assert.equal(mocked.costs.attemptedCalls,2);assert.equal(mocked.costs.validationFailures,0);
assert.equal(mocked.results.every(x=>x.status==='PROVIDER_VALIDATED_UNSCORED'),true);
assert.equal(answerKey(mocked).length,2);
const blind=blindReviewText(mocked),csv=blindReviewCSV(mocked);
assert.ok(!blind.includes('oracle')&&!blind.includes('inferred')&&!blind.includes('planned_action='));
assert.ok(csv.includes('blind_code')&&!csv.includes('oracle')&&!csv.includes('inferred'));
assert.ok(reviewText(mocked).includes('RAW SCRIPTED CONVERSATION'));
let n=0;const recovered=await runRealism(parseRealismArgs(['--mode','model','--routing','oracle','--limit','1','--allow-spend','--budget-usd','0.03']),
 {rootCheck:false,corpus:c,invoke:async()=>{n++;return {raw:n===1?JSON.stringify({teaching_strategy:'x'.repeat(700),next_step:'Next',visual_intent:'none'}):valid,
 usage:{promptTokens:120,completionTokens:100,cachedTokens:0}};}});
assert.equal(recovered.results[0].status,'PROVIDER_VALIDATED_UNSCORED');assert.equal(recovered.costs.attemptedCalls,2);assert.equal(recovered.costs.retries,1);
assert.equal(recovered.costs.validationFailures,1);assert.ok(recovered.costs.knownEstimatedUsd>0);
const unknown=await runRealism(parseRealismArgs(['--mode','model','--routing','oracle','--limit','1','--allow-spend','--budget-usd','0.03']),
 {rootCheck:false,corpus:c,invoke:async()=>({raw:valid,usage:null})});
assert.equal(unknown.results[0].status,'UNPRICED_STOP');assert.equal(unknown.costs.complete,false);
const transport=await runRealism(parseRealismArgs(['--mode','model','--routing','oracle','--limit','1','--allow-spend','--budget-usd','0.03']),
 {rootCheck:false,corpus:c,invoke:async()=>{throw Error('synthetic transport test');}});
assert.equal(transport.results[0].status,'TRANSPORT_STOP');assert.equal(transport.costs.retries,0);
const hold=await runRealism(parseRealismArgs(['--set','holdout','--limit','12','--unlock-holdout']),{rootCheck:false,corpus:c,invoke:()=>{throw Error('Never call');}});
assert.equal(hold.results.length,24);assert.ok(hold.results.every(r=>r.split==='holdout'));
console.log('S1.6B.5.2 SELFTEST PASS: 10 scripted multi-turn threads, 48 exact raw-turn snapshots, 36 development/12 locked holdouts, 7 actions; oracle vs existing-heuristic disagreement exposed, no polished root as learner history; offline 0 calls; model mocks + bounded formatting retry, priced rejection, unknown usage/transport fail-closed; no DB/profile/memory writes.');
