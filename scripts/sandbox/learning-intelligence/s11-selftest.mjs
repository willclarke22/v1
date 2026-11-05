#!/usr/bin/env node
/** S1.1 evaluation safety, fault injection, metrics, version compatibility. No network or paid calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadRuntime} from './runtime-loader.mjs';
import {riskCategory,aggregate} from './s11-metrics.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../');
const challenge=JSON.parse(fs.readFileSync(path.join(here,'challenge.json'),'utf8'));
assert.equal(challenge.schema,'myway-s11-challenge-v1');
assert.equal(challenge.cases.length,53);
assert.equal(new Set(challenge.cases.map(x=>x.domain)).size,17); // 16 domains plus one no-history astronomy control
assert.equal(new Set(challenge.cases.map(x=>x.id)).size,53);
for(const caseData of challenge.cases){
 assert.ok(caseData.semanticLabel);assert.ok(caseData.referenceStatus);assert.ok(caseData.goldRationale);
 assert.ok(caseData.approved.every(e=>e.origin==='v37d2c_validated_assessment'));
}
const {identity,topic}=loadRuntime(root);
assert.equal(typeof topic.compareTopicMemory,'function');
assert.equal(typeof identity.classifyDifficulty,'function');
const same=challenge.cases.find(x=>x.id==='Q01-same');
const decision=identity.classifyDifficulty({myway_learning_evidence:same.approved},same.root,{
 approvedEventScores:same.fixtureScores.map(score=>({...score,topicId:same.topicId})),
 retrievalStatus:same.retrievalStatus,rootConfidence:same.rootConfidence,topicSimilarity:same.topicSimilarity,
 topicLabelFit:same.topicLabelFit,competingTopicSimilarity:same.competingTopicSimilarity
});
assert.equal(decision.relation,'repeated_difficulty');
assert.equal(riskCategory('distinct','repeated_difficulty','associate_existing_manual_only'),'unsafe_repeat_proposal');
assert.equal(riskCategory('same','new_difficulty','associate_existing_manual_only'),'possible_duplicate_identity');
assert.equal(riskCategory('fault_missing_scores','new_difficulty','hold'),'fault_abstained');
const sample=aggregate([{semanticLabel:'distinct',actual:'repeated_difficulty',risk:'unsafe_repeat_proposal',effectiveAction:'associate_existing_manual_only',error:null}], 'semantic','challenge');
assert.equal(sample.unsafeRepeatProposals,1);
// The existing route still has an approved-history guard when event comparisons are missing.
const route=fs.readFileSync(path.join(root,'app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'),'utf8');
assert.ok(route.includes('approvedHistoryPresent && !inTopic.length'));
assert.ok(route.includes('topicMemory.autoEligible=false'));
const evaluator=fs.readFileSync(path.join(here,'s11-evaluator.mjs'),'utf8');
assert.ok(evaluator.includes('approvedCount>0&&validScoreCount===0'));
assert.ok(evaluator.includes("identity.relation==='uncertain'||identity.relation==='possible_refinement'"));
// Preserve real paid-model testing compatibility: the original S1 runner accepts new release pointer.
const original=fs.readFileSync(path.join(here,'run.mjs'),'utf8');
assert.ok(original.includes("'v37d2c7a3s11'"));
// Reject all spending options at the S1.1 evaluator entrypoint. Even --mode model must fail before fetch.
for(const argv of [['--mode','model'],['--allow-spend'],['--budget-usd','0.10']]){
 const p=spawnSync(process.execPath,[path.join(here,'s11-evaluator.mjs'),...argv],{encoding:'utf8'});
 assert.notEqual(p.status,0,'Disallowed spending flags passed: '+argv.join(' '));
}
// Execute actual CLI in fixture-only mode, and clean disposable report artifacts.
const reportDir=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s11-selftest-temp');
if(fs.existsSync(reportDir))throw Error('Refusing to overwrite pre-existing S1.1 selftest report directory');
try{
 const result=spawnSync(process.execPath,[path.join(here,'s11-evaluator.mjs'),'--mode','fixture','--suite','challenge','--limit','53','--report-dir',reportDir],{encoding:'utf8',maxBuffer:2*1024*1024,timeout:120000});
 if(result.status!==0)throw Error('S1.1 evaluation smoke failed: '+result.stderr+' '+result.stdout.slice(-1500));
 const out=JSON.parse(fs.readFileSync(path.join(reportDir,'summary.json'),'utf8'));
 assert.equal(out.metrics.total,53);assert.equal(out.metrics.operationalErrors,0);
 assert.equal(out.metrics.faultInjectionCases,2);assert.equal(out.metrics.faultGuardsPassed,2);
 assert.equal(out.metrics.evaluatedSemanticCases,0);assert.equal(out.apiCost.knownEstimatedUsd,0);
 assert.equal(JSON.parse(fs.readFileSync(path.join(reportDir,'traces.json'),'utf8')).length,53);
}finally{fs.rmSync(reportDir,{recursive:true,force:true});}
console.log('7A.3S1.1 SELFTEST PASS: 53 challenge cases / 16 challenge domains + astronomy control; fault-hold, metric taxonomy, runtime classifier, zero spend and prior model runner compatibility.');
