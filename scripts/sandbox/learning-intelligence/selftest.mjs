#!/usr/bin/env node
/** Offline unit tests; no network, database, provider, or Git writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadRuntime} from './runtime-loader.mjs';
import {CostLedger,parseUsage} from './ledger.mjs';
import {replaySequence} from './simulation.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(here,'../../../');
const {identity,topic,assessment,verifier,cost}=loadRuntime(root);
const data=JSON.parse(fs.readFileSync(path.join(here,'core.json'),'utf8'));
assert.equal(data.cases.length,160);
assert.equal(new Set(data.cases.map(c=>c.id)).size,160);
assert.equal(new Set(data.cases.map(c=>c.domain)).size,16);
assert.ok(assessment.ASSESSMENT_SYSTEM_PROMPT.includes('evidence_quote'));
assert.equal(typeof assessment.validateAssessment,'function');
assert.equal(typeof verifier.parseVerifier,'function');
assert.equal(typeof topic.compareTopicMemory,'function');
let correct=0,wrong=[];
for(const c of data.cases){
 const scores=c.scores.map(s=>({topicId:c.topicId,...s}));
 const d=identity.classifyDifficulty({myway_learning_evidence:c.approved},c.root,{approvedEventScores:scores,topicSimilarity:c.topicSimilarity,
   competingTopicSimilarity:c.competingTopicSimilarity,topicLabelFit:c.topicLabelFit,rootConfidence:c.rootConfidence,
   retrievalStatus:c.retrievalStatus});
 if(d.relation===c.expected)correct++;else wrong.push(`${c.id}: expected ${c.expected}, got ${d.relation}`);
}
// Baseline differences are reported, not silently relabeled. Future releases can improve them.
assert.ok(correct>=130,'Fixture baseline unexpectedly degraded: '+correct+' /160; '+wrong.slice(0,8).join('; '));
const ledger=new CostLedger(cost,0.10);
ledger.reserve('assessment','gpt-4.1-mini');
const bill=ledger.record({caseId:'fixture',stage:'assessment',model:'gpt-4.1-mini',usage:parseUsage({usage:{promptTokens:1000,completionTokens:200,totalTokens:1200,cachedTokens:100}}),elapsedMs:90,status:'ok'});
assert.equal(bill.estimatedUsd,(900*.4+100*.1+200*1.6)/1e6);
assert.equal(ledger.summary().complete,true);
assert.throws(()=>new CostLedger(cost,0).reserve('assessment','gpt-4.1-mini'),/BUDGET STOP/);
const repeat=data.cases.find(c=>c.id==='D01-exact');
const replay=replaySequence(identity,[
 {topicId:'synthetic-test',root:repeat.root,evidence:{},simulateApproval:true,choice:'new_distinct'},
 {topicId:'synthetic-test',root:repeat.root,evidence:{},simulateApproval:true,choice:'reuse_existing'},
]);
assert.equal(replay.history.length,2);assert.equal(replay.history[0].difficulty_id,replay.history[1].difficulty_id);
assert.equal(replay.history[1].difficulty_relation,'repeated_difficulty');
// Explicit model spend gates must fail before any network calls or report writes.
const cli=path.join(here,'run.mjs');
for(const args of [['--mode','model'],['--mode','model','--allow-spend'],['--mode','fixture','--allow-spend'],['--mode','fixture','--budget-usd','1']]){
 const p=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
 assert.notEqual(p.status,0,'unapproved model/fixture spend options should fail: '+args.join(' '));
}
console.log(`7A.3S1 SELFTEST PASS: 160 cases / 16 subjects; baseline same=${correct}, differences=${wrong.length}; loader, cost, replay and spend gates verified.`);
if(wrong.length)console.log('Baseline fixture disagreements (not hidden): '+wrong.slice(0,8).join('; '));
