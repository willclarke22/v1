#!/usr/bin/env node
/** Offline S1.2 tests. NO model or embedding services or database connections. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadRuntime} from './runtime-loader.mjs';
import {parseFlags,selectCases,localAdjudicate} from './s12-evaluator.mjs';
import {metrics,baselineClass,modelClass,classifyRisk} from './s12-metrics.mjs';
import {CostLedger,parseUsage} from './ledger.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../');
const {adjudicator,identity,cost}=loadRuntime(root);
const corpus=JSON.parse(fs.readFileSync(path.join(here,'challenge.json'),'utf8'));
assert.equal(corpus.cases.length,53);
assert.equal(selectCases(corpus,parseFlags([])).length,17);
assert.equal(selectCases(corpus,parseFlags(['--selection','priority','--limit','16'])).length,16);
assert.equal(selectCases(corpus,parseFlags(['--case','Q02-distinct','--limit','1']))[0].id,'Q02-distinct');
for(const opts of [['--mode','model'],['--mode','model','--allow-spend'],['--mode','model','--allow-spend','--budget-usd','2.01'],['--mode','model','--allow-spend','--budget-usd','0.01','--limit','21'],['--mode','fixture','--allow-spend']])assert.throws(()=>parseFlags(opts));
const accepted=parseFlags(['--mode','model','--allow-spend','--budget-usd','0.10']);assert.equal(accepted.limit,4);
const sample=corpus.cases.find(c=>c.id==='Q01-same');
const input=adjudicator.adjudicatorInput({topic_label:sample.topicLabel,learner_statement:sample.message,proposed_root_problem:sample.root,
 historical_observations:sample.approved.map(e=>({event_id:e.event_id,root_problem:e.root_problem})),max_similarity:0.86});
assert.ok(adjudicator.validAdjudicatorInput(input));
assert.equal(Object.hasOwn(input,'semanticLabel'),false,'Gold label leaked');
assert.equal(JSON.stringify(input).includes('goldRationale'),false,'Expected gold rationale leaked');
const valid={relation:'same_difficulty',anchor_event_id:sample.approved[0].event_id,evidence_basis:'Both descriptions concern chlorophyll photons',rationale:'They express the same obstacle in new words.',missing_evidence:''};
assert.equal(adjudicator.parseAdjudicator(JSON.stringify(valid),input).decision?.anchor_event_id,sample.approved[0].event_id);
assert.equal(adjudicator.parseAdjudicator(JSON.stringify({...valid,anchor_event_id:'11111111-1111-4111-8111-111111111111'}),input).decision,null);
assert.equal(adjudicator.parseAdjudicator(JSON.stringify({...valid,relation:'distinct_difficulty',anchor_event_id:sample.approved[0].event_id}),input).decision,null);
assert.equal(adjudicator.parseAdjudicator(JSON.stringify({...valid,relation:'root_problem_refinement'}),input).decision?.relation,'root_problem_refinement');
assert.equal(adjudicator.parseAdjudicator(JSON.stringify({...valid,relation:'uncertain',anchor_event_id:''}),input).decision?.relation,'uncertain');
assert.equal(adjudicator.parseAdjudicator(JSON.stringify({...valid,malicious_field:true}),input).decision,null);
assert.equal(modelClass('root_problem_refinement'),'refinement');assert.equal(baselineClass('possible_refinement'),'defer');
assert.equal(classifyRisk('distinct','same'),'potential_false_merge');assert.equal(classifyRisk('same','distinct'),'potential_duplicate_identity');
const counts=metrics([{label:'distinct',baselineCategory:'same',modelCategory:'distinct',scoreSource:'local_embedding',modelAttempted:true},
 {label:'same',baselineCategory:'distinct',modelCategory:'same',scoreSource:'local_embedding',modelAttempted:true}]);
assert.equal(counts.baselinePotentialFalseMerges,1);assert.equal(counts.baselinePotentialDuplicates,1);assert.equal(counts.modelExactMatches,2);
const ledger=new CostLedger(cost,0.02);ledger.reserve('model_c_adjudication','gpt-4.1-mini');ledger.record({caseId:'mock',stage:'model_c_adjudication',model:'gpt-4.1-mini',usage:parseUsage({usage:{promptTokens:1000,completionTokens:100,cachedTokens:100,totalTokens:1100}}),elapsedMs:123,status:'ok'});
assert.ok(ledger.summary().knownEstimatedUsd>0);assert.equal(ledger.summary().unknownOrIncompleteCalls,0);
ledger.reserve('model_c_adjudication','gpt-4.1-mini');ledger.record({caseId:'failed',stage:'model_c_adjudication',model:'gpt-4.1-mini',usage:null,elapsedMs:21,status:'error'});
assert.equal(ledger.summary().complete,false);
let calls=0;
const fakeFetch=async(url,opts)=>{calls++;assert.ok(url.startsWith('http://127.0.0.1:3001/'));
 assert.equal(opts.headers.Origin,'http://127.0.0.1:3001');const request=JSON.parse(opts.body);
 assert.deepEqual(Object.keys(request).sort(),['format','input','model']);assert.ok(!JSON.stringify(request).includes('semanticLabel'));
 return {ok:true,status:200,json:async()=>({raw:JSON.stringify(valid),model:'gpt-4.1-mini',usage:{promptTokens:100,completionTokens:50,cachedTokens:0}})};};
const mocked=await localAdjudicate(input,'gpt-4.1-mini',fakeFetch);assert.equal(calls,1);assert.equal(adjudicator.parseAdjudicator(mocked.raw,input).decision?.relation,'same_difficulty');
const file=path.join(here,'s12-evaluator.mjs');
for(const options of [['--mode','model'],['--mode','model','--budget-usd','0.10'],['--mode','model','--allow-spend'],['--mode','fixture','--budget-usd','0.10']]){
 const p=spawnSync(process.execPath,[file,...options],{encoding:'utf8',timeout:20000});assert.notEqual(p.status,0,'Spend guard failed '+options.join(' '));
}
const report=path.join(root,'.myway-patch-backups/learning-intelligence-reports/s12-selftest-temp');
if(fs.existsSync(report))throw Error('Pre-existing s12 selftest output; refusing to overwrite');
try{
 const p=spawnSync(process.execPath,[file,'--mode','fixture','--selection','balanced','--limit','17','--report-dir',report],{encoding:'utf8',maxBuffer:2*1024*1024,timeout:90000});
 if(p.status!==0)throw Error('Fixture test failed: '+p.stderr+' '+p.stdout.slice(-1700));
 const s=JSON.parse(fs.readFileSync(path.join(report,'summary.json'),'utf8'));
 assert.equal(s.metrics.analyzed,17);assert.equal(s.modelCost.attemptedCalls,0);
 assert.equal(JSON.parse(fs.readFileSync(path.join(report,'traces.json'),'utf8')).length,17);
}finally{fs.rmSync(report,{recursive:true,force:true});}
// The unchanged runtime identity classifier is still callable and no automatic writes are introduced.
const d=identity.classifyDifficulty({myway_learning_evidence:sample.approved},sample.root,{approvedEventScores:[{topicId:sample.topicId,eventId:sample.approved[0].event_id,similarity:0.86}],retrievalStatus:'semantic_pgvector',topicSimilarity:0.74,topicLabelFit:1,rootConfidence:0.86,competingTopicSimilarity:-1});
assert.equal(d.relation,'repeated_difficulty');
const route=fs.readFileSync(path.join(root,'app/api/sandbox/probe-lab/local-assessment/memory-adjudicator/route.ts'),'utf8');
assert.ok(route.includes('NODE_ENV!=="development"'));assert.ok(!route.includes('topic_state'));
assert.ok(fs.readFileSync(path.join(root,'app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'),'utf8').includes('topicMemory.autoEligible=false'));
console.log('7A.3S1.2 SELFTEST PASS: 17 balanced cases, blind input, strict anchored parsing, spending/refusal, mock C endpoint, runtime classifier and no-write guards.');
