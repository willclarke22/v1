#!/usr/bin/env node
/** Zero-provider, zero-DB, model-first architecture and transport selftest. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {buildConversationCase,buildProviderRequest,normalizeReply,selectComparisonCases,VARIANTS,SIMPLE_REPLY_SCHEMA,DEFAULT_CASES} from './s16b53-conversation.mjs';
import {parseArgs,run,dollarCost,blindText,reviewText} from './s16b53-eval.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const c=selectComparisonCases({limit:6});assert.deepEqual(c.map(x=>x.id),[...DEFAULT_CASES]);
assert.ok(c.every(x=>x.split==='development'&&x.privacy_class==='synthetic_example_only'));
assert.deepEqual(VARIANTS,['direct','simple','action','current']);
const photo=buildConversationCase(c[0]);assert.equal(photo.learner,'no i wasnt asking how ATP is made, you keep going back to that');
assert.equal(photo.prior.length,4);assert.equal(photo.prior[1].role,'tutor');
const raw=buildProviderRequest(photo,'direct');assert.equal(raw.model,'gpt-4.1-mini');assert.equal(raw.store,false);assert.equal(raw.messages.at(-1).content,photo.learner);
assert.deepEqual(raw.messages.slice(2).map(m=>m.role),photo.prior.map(t=>t.role==='learner'?'user':'assistant').concat('user'));
assert.ok(!JSON.stringify(raw.messages).includes('author_action_for_review'));
assert.ok(!JSON.stringify(raw.messages).includes('oracle_action'));
assert.equal(raw.response_format,undefined);assert.ok(raw.messages[0].content.toLowerCase().includes('clarif'));
const simple=buildProviderRequest(photo,'simple');assert.equal(simple.response_format.type,'json_schema');assert.deepEqual(simple.response_format.json_schema.schema,SIMPLE_REPLY_SCHEMA);
assert.ok(!simple.messages[0].content.includes('experimental heuristic selected'));
assert.equal(simple.messages.at(-1).content,raw.messages.at(-1).content);
const action=buildProviderRequest(photo,'action');assert.ok(action.messages[0].content.includes('heuristic selected'));
assert.equal(action.messages.at(-1).content,simple.messages.at(-1).content);
assert.equal(normalizeReply('One natural answer.','direct'),'One natural answer.');
assert.equal(normalizeReply('{"reply":" I see your correction. "}','simple'),'I see your correction.');
for(const p of ['', '{"reply":""}', '{"reply":2}', '{"reply":"yes","next_step":"no"}'])assert.throws(()=>normalizeReply(p,'simple'));
assert.throws(()=>parseArgs(['--mode','model']),/Paid mode requires/);
assert.throws(()=>parseArgs(['--mode','offline','--allow-spend']),/Offline refuses/);
assert.throws(()=>parseArgs(['--mode','model','--allow-spend','--budget-usd','0.01']),/Paid mode requires/);
assert.throws(()=>parseArgs(['--limit','12']),/Invalid limit/);
assert.throws(()=>parseArgs(['--variants','direct,direct']),/distinct/);
assert.throws(()=>parseArgs(['--variants','direct,sneaky']),/known/);
assert.throws(()=>selectComparisonCases({caseId:'R52-PHOTO-05'}),/development/);
assert.equal(dollarCost({promptTokens:100,completionTokens:50,cachedTokens:0}),.00012);
assert.equal(dollarCost({promptTokens:100,completionTokens:50,cachedTokens:200}),null);
assert.equal(dollarCost(null),null);
const noModel=parseArgs(['--mode','offline','--limit','2']);
let invoked=0;const never=async()=>{invoked++;throw Error('should not call');};
const off=await run(noModel,{rootCheck:false,directCall:never,currentCall:never,preflight:never,env:never});
assert.equal(invoked,0);assert.equal(off.results.length,8);assert.ok(off.results.every(x=>x.status==='OFFLINE_PREPARED'));assert.equal(off.cost.attemptedCalls,0);
assert.equal(off.db_writes,0);assert.equal(off.persistent_memory_writes,0);assert.ok(reviewText(off).includes('ACTUAL RAW CONVERSATION'));
assert.ok(blindText(off).includes('Scores deliberately blank'));
const u={promptTokens:500,completionTokens:100,cachedTokens:0};
const valid=JSON.stringify({teaching_strategy:'I misunderstood your question. You meant carbon fixation, not ATP.',next_step:'Follow the carbon into RuBP.',visual_intent:'none'});
const modeled=parseArgs(['--mode','model','--limit','1','--allow-spend','--budget-usd','0.10']);
let pre=0,api=0,local=0;
const r=await run(modeled,{rootCheck:false,preflight:async()=>{pre++;},env:()=>({key:'MOCK_DO_NOT_USE',url:'https://example.test/'}),
 directCall:async(input)=>{api++;return {raw:input.response_format?JSON.stringify({reply:'I see what you meant.'}):'I see what you meant.',usage:u};},
 currentCall:async()=>{local++;return {raw:valid,usage:u};}});
assert.equal(pre,1);assert.equal(api,3);assert.equal(local,1);assert.equal(r.cost.attemptedCalls,4);assert.ok(r.results.every(x=>x.status==='PROVIDER_VALIDATED_UNSCORED'));
assert.ok(r.cost.knownEstimatedUsd>0&&r.cost.complete);
let retries=0;const retry=await run(parseArgs(['--mode','model','--limit','1','--variants','direct,simple','--allow-spend','--budget-usd','0.05']),{
 rootCheck:false,env:()=>({key:'MOCK',url:'https://example.test/'}),directCall:async(input)=>{
  if(input.response_format){retries++;return {raw:retries===1?'not json':JSON.stringify({reply:'Recovery works.'}),usage:u};}
  return {raw:'Direct response.',usage:u};}});
assert.equal(retry.cost.retries,1);assert.equal(retry.cost.recoveries,1);assert.equal(retry.cost.validationFailures,1);
let stops=0;const fail=await run(parseArgs(['--mode','model','--limit','1','--variants','direct,simple','--allow-spend','--budget-usd','0.05']),{
 rootCheck:false,env:()=>({key:'MOCK',url:'https://example.test/'}),directCall:async()=>{stops++;return {raw:'Answer',usage:null};}});
assert.equal(stops,1);assert.equal(fail.cost.complete,false);assert.equal(fail.results[0].status,'UNKNOWN_USAGE_STOP');
const existing=fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence/s16b52-corpus.mjs'),'utf8');
assert.ok(existing.includes('CORPUS_SHA'));
console.log('S1.6B.5.3 SELFTEST PASS: same GPT-4.1-mini, ordered exact raw synthetic turns, single-reply schema, action advisory, existing comparator unchanged; 6 development cases; offline zero calls, mocked provider + bounded retry/cost/unknown-usage stop; no DB/learner/profile writes.');
