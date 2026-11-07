#!/usr/bin/env node
/** Fully mocked, zero provider/DB/filesystem writes. */
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {S16B5_ACTIONS,buildAdaptiveDialoguePrompt,inspectAdaptiveDialogue,S16B5_VOICE_VERSION} from './s16b5-dialogue.mjs';
import {parseS16B5Args,prepareS16B5Cases,runS16B5} from './s16b5-eval.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const corpus=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence/s16b4d-fixtures.json'),'utf8')).scenarios;
const extra=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence/s16b5-action-probes.json'),'utf8')).scenarios;
assert.equal(extra.length,2);
assert.equal(Object.keys(S16B5_ACTIONS).length,7);
const specs={
 explain_missing_mechanism:'WHY or HOW',repair_misconception:'mistaken inference',extend_follow_up:'NEW question',
 acknowledge_correction:'correction',close_clarification:'one or two',verify_understanding:'one discriminating',advance_after_progress:'reported progress'};
for(const [action,keyword] of Object.entries(specs)){
 const prompt=buildAdaptiveDialoguePrompt(action);
 assert.ok(prompt.includes(keyword),action);
 for(const phrase of ['teaching_strategy','next_step','visual_intent','620','untrusted','do_not_use','INTERNAL','not a transcript'])assert.ok(prompt.toLowerCase().includes(phrase.toLowerCase()),action+' missing '+phrase);
 assert.equal(buildAdaptiveDialoguePrompt(action,{formatRetry:true}).includes('FORMAT-ONLY RETRY'),true);
}
assert.throws(()=>buildAdaptiveDialoguePrompt('invalid'));
assert.throws(()=>buildAdaptiveDialoguePrompt('close_clarification',{formatRetry:'yes'}));
let out=inspectAdaptiveDialogue({teaching_strategy:'Yes, that resolves the distinction.'},{action:'close_clarification'});
assert.equal(out.warning_question_during_closure,false);
out=inspectAdaptiveDialogue({teaching_strategy:'Great question: Does that make sense?'},{action:'close_clarification'});
assert.equal(out.warning_question_during_closure,true);assert.equal(out.warning_generic_praise,true);
assert.throws(()=>parseS16B5Args(['--mode','model']));
assert.throws(()=>parseS16B5Args(['--mode','offline','--allow-spend']));
assert.throws(()=>parseS16B5Args(['--variants','current,current']));
const focused=['PHOTO_T10','PHOTO_T10A','PROGRESS01','BIO01','LANG01','MED01'].map(id=>corpus.find(x=>x.id===id));
assert.ok(focused.every(Boolean));
const planned=prepareS16B5Cases(focused,['current','adaptive','adaptive_personalized']);
assert.equal(planned.length,18);
for(let i=0;i<planned.length;i+=3){
 const [a,b,c]=planned.slice(i,i+3);
 assert.equal(a.request.voice_version,undefined);assert.equal(b.request.voice_version,S16B5_VOICE_VERSION);
 assert.deepEqual(a.request.context,b.request.context);assert.equal(a.action,b.action);
 assert.deepEqual(a.selectedEvidence,b.selectedEvidence);
 assert.equal(a.request.variant,'contract');assert.equal(b.request.variant,'contract');assert.equal(c.request.variant,'personalized');
 assert.equal(c.request.voice_version,S16B5_VOICE_VERSION);
}
assert.equal(planned[0].action,'acknowledge_correction');
assert.equal(planned[3].action,'close_clarification');
assert.equal(planned[6].action,'advance_after_progress');
assert.equal(planned[9].action,'extend_follow_up');
const probes=prepareS16B5Cases(extra,['current','adaptive']);
assert.equal(probes[0].action,'repair_misconception');
assert.equal(probes[2].action,'verify_understanding');
const choice=focused[0];
const opts={mode:'model',scenario:choice.id,set:'focused',limit:1,variants:['current','adaptive'],budget:0.03};
const good=JSON.stringify({teaching_strategy:'I see what changed. The corrected distinction matters here.',next_step:'none',visual_intent:'none'});
const oversized=JSON.stringify({teaching_strategy:'a'.repeat(621),next_step:'none',visual_intent:'none'});
const usage={promptTokens:520,completionTokens:100,cachedTokens:0};
let calls=[];
const success=await runS16B5(opts,{rootCheck:false,scenarioCorpus:[choice],invoke:async(_url,request)=>{
 calls.push(request);return {raw:good,usage};}});
assert.equal(success.results.length,2);assert.ok(success.results.every(x=>x.status==='PROVIDER_VALIDATED_UNSCORED'));
assert.equal(success.costs.attemptedCalls,2);assert.equal(success.costs.unknownOrIncompleteCalls,0);
assert.equal(calls[0].voice_version,undefined);assert.equal(calls[1].voice_version,'adaptive_v5');
assert.deepEqual(calls[0].context,calls[1].context);
let n=0;
const recovered=await runS16B5({...opts,variants:['adaptive']},{rootCheck:false,scenarioCorpus:[choice],invoke:async(_u,p)=>{
 n++;if(n===2)assert.equal(p.format_retry,true);return {raw:n===1?oversized:good,usage};}});
assert.equal(recovered.results[0].status,'PROVIDER_VALIDATED_UNSCORED');assert.equal(recovered.costs.validationFailures,1);
assert.equal(recovered.costs.retries,1);assert.equal(recovered.costs.recoveries,1);assert.equal(recovered.costs.attemptedCalls,2);
assert.equal(recovered.costs.knownEstimatedUsd,2*((520*.4+100*1.6)/1e6));
n=0;
const failed=await runS16B5({...opts,variants:['adaptive']},{rootCheck:false,scenarioCorpus:[choice],invoke:async()=>{n++;return {raw:oversized,usage};}});
assert.equal(n,2);assert.equal(failed.results[0].status,'VALIDATION_STOP');assert.equal(failed.costs.unknownOrIncompleteCalls,0);
assert.equal(failed.costs.attemptedCalls,2);
n=0;
const transport=await runS16B5({...opts,variants:['adaptive']},{rootCheck:false,scenarioCorpus:[choice],invoke:async()=>{n++;throw Error('Mock transport unavailable');}});
assert.equal(n,1);assert.equal(transport.results[0].status,'STOPPED_ON_ERROR');assert.equal(transport.costs.complete,false);
assert.equal(transport.costs.retries,0);
const unknown=await runS16B5({...opts,variants:['adaptive']},{rootCheck:false,scenarioCorpus:[choice],invoke:async()=>({raw:good,usage:null})});
assert.equal(unknown.results[0].status,'UNPRICED_STOP');
const offline=await runS16B5({mode:'offline',set:'focused',scenario:null,limit:3,variants:['current','adaptive'],budget:null},{rootCheck:false,scenarioCorpus:corpus,
 invoke:async()=>{throw Error('Offline must never invoke model');}});
assert.equal(offline.results.length,6);assert.equal(offline.costs.attemptedCalls,0);assert.ok(offline.results.every(r=>r.status==='OFFLINE_PREPARED'));
const actionRun=await runS16B5({mode:'offline',set:'actions',scenario:null,limit:7,variants:['current','adaptive'],budget:null},{rootCheck:false,scenarioCorpus:[...corpus,...extra]});
assert.equal(actionRun.results.length,14);assert.equal(new Set(actionRun.results.map(r=>r.action)).size,7);
console.log('S1.6B.5 SELFTEST PASS: 7 dialogue actions, 6 paired frozen examples, identical A/B evidence, correction/closure/progress/follow-up, provider-free offline, mocked paid formatting retry and cost, transport/unknown-usage stops, no DB/profile writes.');
