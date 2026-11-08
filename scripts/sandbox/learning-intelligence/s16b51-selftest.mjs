#!/usr/bin/env node
/** S1.6B.5.1 no provider, DB or file writes; mock calls only. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {buildCalibratedDialoguePrompt,S16B51_VOICE_VERSION,inspectActionFidelity} from './s16b51-fidelity.mjs';
import {S16B5_VOICE_VERSION} from './s16b5-dialogue.mjs';
import {prepareS16B51Cases,parseS16B51Args,runS16B51} from './s16b51-eval.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const corpus=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence/s16b4d-fixtures.json'),'utf8')).scenarios;
const probes=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence/s16b5-action-probes.json'),'utf8')).scenarios;
const all=[...corpus,...probes];
const actionSpec={acknowledge_correction:'PRIOR RESPONSE',close_clarification:'One or two concise sentences',advance_after_progress:'REPORTS understanding',verify_understanding:'SINGLE topic-specific',repair_misconception:'faulty inference',extend_follow_up:'new follow-up',explain_missing_mechanism:'causal WHY/HOW'};
for(const [action,expected] of Object.entries(actionSpec)){
 const p=buildCalibratedDialoguePrompt(action);
 assert.ok(p.includes(expected),action);assert.ok(p.includes('LEARNER-STATE CALIBRATION'));assert.ok(p.includes('No automatic follow-up question'));
 assert.ok(p.includes('teaching_strategy'));assert.ok(p.includes('620'));assert.ok(p.includes('do_not_use'));
 assert.ok(buildCalibratedDialoguePrompt(action,{formatRetry:true}).includes('FORMAT-ONLY RETRY'));
}
assert.throws(()=>buildCalibratedDialoguePrompt('not_an_action'));assert.throws(()=>buildCalibratedDialoguePrompt('close_clarification',{formatRetry:'yes'}));
const close=inspectActionFidelity({teaching_strategy:'Exactly. Your earlier photon question was real then; now you are asking about carbon fixation.'},{action:'close_clarification'});
assert.equal(close.warning_closure_question,false);assert.equal(close.warning_closure_reteaching,false);
const faulty=inspectActionFidelity({teaching_strategy:'Great, Rubisco carboxylates RuBP into 3-PGA. What next?'},{action:'close_clarification'});
assert.equal(faulty.warning_closure_question,true);assert.equal(faulty.warning_closure_reteaching,true);
assert.equal(inspectActionFidelity({teaching_strategy:'You have mastered it.'},{action:'advance_after_progress'}).warning_unsupported_mastery,true);
assert.equal(inspectActionFidelity({teaching_strategy:'Could you explain that?'},{action:'acknowledge_correction'}).warning_persistent_question_after_correction,true);
assert.throws(()=>parseS16B51Args(['--allow-spend']));
assert.throws(()=>parseS16B51Args(['--mode','model']));
assert.throws(()=>parseS16B51Args(['--variants','calibrated,calibrated']));
assert.throws(()=>parseS16B51Args(['--variants','adaptive_personalized']));
const wanted=['PHOTO_T10','PHOTO_T10A','PROGRESS01','BIO01','MED_VERIFY'];
const selected=wanted.map(id=>all.find(x=>x.id===id));assert.ok(selected.every(Boolean));
const trio=prepareS16B51Cases(selected,['current','adaptive','calibrated']);assert.equal(trio.length,15);
for(let i=0;i<trio.length;i+=3){
 const [a,b,c]=trio.slice(i,i+3);assert.equal(a.request.voice_version,undefined);assert.equal(b.request.voice_version,S16B5_VOICE_VERSION);assert.equal(c.request.voice_version,S16B51_VOICE_VERSION);
 assert.deepEqual(a.request.context,b.request.context);assert.deepEqual(b.request.context,c.request.context);
 assert.deepEqual(a.selectedEvidence,c.selectedEvidence);assert.equal(a.action,c.action);assert.equal(c.request.variant,'contract');assert.equal(c.request.personalization.use_interest,'do_not_use');
}
assert.deepEqual(trio.filter((x,i)=>i%3===2).map(x=>x.action),['acknowledge_correction','close_clarification','advance_after_progress','extend_follow_up','verify_understanding']);
const good=JSON.stringify({teaching_strategy:'I misunderstood the focus of your current question. You are asking about carbon fixation now.',next_step:'none',visual_intent:'none'});
const long=JSON.stringify({teaching_strategy:'x'.repeat(621),next_step:'none',visual_intent:'none'});
const usage={promptTokens:620,completionTokens:120,cachedTokens:0};
const opts={mode:'model',scenario:'PHOTO_T10',set:'focused',limit:1,variants:['adaptive','calibrated'],budget:0.03};
let received=[];const ok=await runS16B51(opts,{rootCheck:false,scenarioCorpus:selected,invoke:async(_url,r)=>{received.push(r);return {raw:good,usage};}});
assert.equal(ok.results.length,2);assert.ok(ok.results.every(x=>x.status==='PROVIDER_VALIDATED_UNSCORED'));assert.equal(ok.costs.attemptedCalls,2);assert.equal(received[0].voice_version,S16B5_VOICE_VERSION);assert.equal(received[1].voice_version,S16B51_VOICE_VERSION);assert.deepEqual(received[0].context,received[1].context);
let n=0;const retry=await runS16B51({...opts,variants:['calibrated']},{rootCheck:false,scenarioCorpus:selected,invoke:async(_u,r)=>{n++;if(n===2)assert.equal(r.format_retry,true);return {raw:n===1?long:good,usage};}});
assert.equal(retry.results[0].status,'PROVIDER_VALIDATED_UNSCORED');assert.equal(retry.costs.retries,1);assert.equal(retry.costs.recoveries,1);assert.equal(retry.costs.attemptedCalls,2);
n=0;const failed=await runS16B51({...opts,variants:['calibrated']},{rootCheck:false,scenarioCorpus:selected,invoke:async()=>{n++;return {raw:long,usage};}});assert.equal(failed.results[0].status,'VALIDATION_STOP');assert.equal(n,2);
const stopped=await runS16B51({...opts,variants:['calibrated']},{rootCheck:false,scenarioCorpus:selected,invoke:async()=>{throw Error('mock offline transport fail');}});assert.equal(stopped.results[0].status,'STOPPED_ON_ERROR');assert.equal(stopped.costs.unknownOrIncompleteCalls,1);
const unknown=await runS16B51({...opts,variants:['calibrated']},{rootCheck:false,scenarioCorpus:selected,invoke:async()=>({raw:good,usage:null})});assert.equal(unknown.results[0].status,'UNPRICED_STOP');
const offline=await runS16B51({mode:'offline',set:'focused',scenario:null,limit:3,variants:['adaptive','calibrated'],budget:null},{rootCheck:false,scenarioCorpus:all,invoke:async()=>{throw Error('Offline attempted provider!');}});
assert.equal(offline.results.length,6);assert.equal(offline.costs.attemptedCalls,0);assert.ok(offline.results.every(x=>x.status==='OFFLINE_PREPARED'));
const actions=await runS16B51({mode:'offline',set:'actions',scenario:null,limit:7,variants:['adaptive','calibrated'],budget:null},{rootCheck:false,scenarioCorpus:all});
assert.equal(new Set(actions.results.map(x=>x.action)).size,7);assert.equal(actions.results.length,14);
console.log('S1.6B.5.1 SELFTEST PASS: 7 action instructions, 5 frozen scenario pairs with identical evidence and action, correction/closure/reported-progress calibration, no false mastery, bounded FIX2 formatting recovery, fail-closed unknown usage and transport, offline zero calls/writes.');
