#!/usr/bin/env node
/** FIX2 fully offline validation, pricing, retry, and safety regression. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {inspectTeacherOutput,FIX2_MAX_RETRIES_PER_RUN} from './s16b4d-fix2-validation.mjs';
import {parseEvaluationArgs,runComparison} from './s16b4d-eval.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const good={teaching_strategy:'This is the mechanism that matters.',next_step:'Try one comparison.',visual_intent:'none'};
const valid=raw=>inspectTeacherOutput(JSON.stringify(raw)).diagnostic;
assert.equal(valid(good).ok,true);
const long=valid({...good,teaching_strategy:'X'.repeat(621)});
assert.equal(long.ok,false);assert.equal(long.field_diagnostics[0].field,'teaching_strategy');assert.equal(long.field_diagnostics[0].length_utf16,621);
for(const prop of ['teaching_strategy','next_step','visual_intent']){
 const p={...good,[prop]:' '};const r=valid(p);assert.equal(r.ok,false);assert.equal(r.field_diagnostics[0].field,prop);
}
assert.equal(inspectTeacherOutput('{broken').diagnostic.reason,'invalid_json');
assert.equal(valid({...good,extra:'unsafe'}).ok,false);
const args=parseEvaluationArgs(['--mode','model','--limit','1','--variants','contract','--allow-spend','--budget-usd','0.06']);
let count=0;
const oneRetry=await runComparison(args,{doRootCheck:false,invoke:async(_url,payload)=>{
 count++;
 assert.equal(payload.format_retry??false,count===2);
 return {raw:JSON.stringify(count===1?{...good,teaching_strategy:'z'.repeat(650)}:good),
 usage:{promptTokens:700,completionTokens:120,cachedTokens:0}};
}});
assert.equal(count,2);assert.equal(oneRetry.results[0].status,'PROVIDER_VALIDATED_UNSCORED');
assert.equal(oneRetry.cost.attemptedCalls,2);assert.equal(oneRetry.cost.formatRetryRecoveries,1);
assert.equal(oneRetry.cost.validationFailures,1);assert.equal(oneRetry.cost.unknownOrIncompleteCalls,0);
assert.equal(oneRetry.cost.complete,true);assert.ok(oneRetry.cost.knownEstimatedUsd>0);
assert.equal(oneRetry.results[0].attempts[0].validation.field_diagnostics[0].length_utf16,650);
assert.equal(oneRetry.results[0].attempts[0].rejected_output.stored,true);
const persist=await runComparison(args,{doRootCheck:false,invoke:async(_url,payload)=>({raw:JSON.stringify({...good,teaching_strategy:'z'.repeat(680)}),usage:{promptTokens:510,completionTokens:100,cachedTokens:0}})});
assert.equal(persist.results[0].status,'VALIDATION_STOP');assert.equal(persist.cost.attemptedCalls,2);
assert.equal(persist.cost.unknownOrIncompleteCalls,0);assert.equal(persist.cost.complete,true);
assert.ok(persist.cost.knownEstimatedUsd>0);assert.equal(persist.results[0].teaching,null);
const baselineArgs={...args,variants:['baseline']};
const base=await runComparison(baselineArgs,{doRootCheck:false,invoke:async()=>({raw:JSON.stringify({...good,teaching_strategy:'x'.repeat(700)}),usage:{promptTokens:470,completionTokens:90,cachedTokens:0}})});
assert.equal(base.cost.attemptedCalls,1);assert.equal(base.cost.formatRetriesAttempted,0);
assert.equal(base.results[0].status,'VALIDATION_STOP');assert.equal(base.cost.complete,true);
const transport=await runComparison(args,{doRootCheck:false,invoke:async()=>{throw Error('HTTP 502 transport failure');}});
assert.equal(transport.cost.attemptedCalls,1);assert.equal(transport.cost.unknownOrIncompleteCalls,1);
assert.equal(transport.cost.complete,false);assert.equal(transport.cost.formatRetriesAttempted,0);
const usageMissing=await runComparison(args,{doRootCheck:false,invoke:async()=>({raw:JSON.stringify(good),usage:null})});
assert.equal(usageMissing.results[0].status,'UNPRICED_STOP');assert.equal(usageMissing.cost.complete,false);
const route=fs.readFileSync(path.join(root,'app/api/sandbox/probe-lab/local-assessment/s16b4d-teaching/route.ts'),'utf8');
assert.match(route,/format_retry/);assert.match(route,/OUTPUT_LENGTH_RULE/);assert.match(route,/RETRY_LENGTH_RULE/);
assert.match(route,/localOnly\(request\)/);assert.match(route,/VERCEL==='1'/);assert.match(route,/store:false/);
assert.match(route,/COMPACT_TEACH_SCHEMA/);assert.doesNotMatch(route,/\b(?:supabase|db\.query|prisma)\b/i);
assert.equal(FIX2_MAX_RETRIES_PER_RUN,2);
console.log('S1.6B.4D FIX2 SELFTEST PASS: field diagnostics; rejected evidence retained; one bounded format retry; valid recovery; persistent invalid hold; provider usage priced on rejected outputs; unknown transport fails closed; no provider or database calls.');
