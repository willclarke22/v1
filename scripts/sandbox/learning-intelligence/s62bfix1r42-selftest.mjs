#!/usr/bin/env node
/** Free R4.2 regression. No provider, localhost MiniLM, credentials, DB, or graded labels. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseArgs,run,injectedEmbeddings,labDir} from './s62bfix1r42-runtime.mjs';
import {TOPIC_BANK,LEARNERS} from './s62bfix1r42-topics.mjs';
import {B_ONE_SCHEMA,L_ROUTE_SCHEMA} from './s62bfix1r42-contracts.mjs';
import {CHALLENGES} from './s62bfix1r42-challenges.mjs';
const n=crypto.randomUUID().slice(0,8);const cleanup=[];
const name=s=>'selftest42_'+s+'_'+n;
const keep=(lab,id)=>{cleanup.push(labDir(lab,id));return id};
const checked=o=>run(o,{embedFn:injectedEmbeddings});
assert.equal(TOPIC_BANK.length,30);assert.equal(new Set(TOPIC_BANK.map(x=>x.id)).size,30);
assert.equal(Object.keys(LEARNERS).length,3);assert.equal(CHALLENGES.length,10);
assert.equal(B_ONE_SCHEMA.properties.implementation.properties.status.enum.includes('not_called'),true);
assert(L_ROUTE_SCHEMA.properties.topic_id);
assert.throws(()=>parseArgs(['--lab','journey','--mode','model','--run-id',name('denied')]),/Paid mode/);
assert.throws(()=>parseArgs(['--lab','journey','--mode','offline','--allow-spend','--run-id',name('denied2')]),/spending/i);
assert.throws(()=>parseArgs(['--lab','assessment','--mode','offline','--run-id',name('nsource')]),/requires --source-run/);
try{
 // Two learners, no seeded root or cross-topic memories, with complete real symbolic action replay.
 const r1=keep('journey',name('j_atlas_2'));
 const a=await checked({lab:'journey',mode:'offline',learner:'ATLAS',runId:r1,pathway:'b-only',visits:2});
 assert(a.report.complete,JSON.stringify(a.report.failure));assert.equal(a.report.entries.length,2);
 assert(a.report.entries.every(x=>x.pre_a?.valid&&x.post_a?.valid));
 assert(a.report.entries.every(x=>x.execution?.status==='text_executable'&&x.phases?.length));
 assert(a.report.requests.filter(x=>x.role==='B_ONE').length===2);
 assert(a.report.requests.filter(x=>x.role==='X').length===0);
 assert(a.report.entries[0].memory_before.length===0);
 assert(a.report.entries.every(x=>TOPIC_BANK.some(t=>t.id===x.topic_id)));
 const r2=keep('journey',name('j_atlas_next4'));
 const b=await checked({lab:'journey',mode:'offline',learner:'ATLAS',runId:r2,pathway:'b-only',visits:4,resumeFrom:r1});
 assert(b.report.complete,JSON.stringify(b.report.failure));assert.equal(b.report.completed_visits,6);
 const state=JSON.parse(fs.readFileSync(path.join(labDir('journey',r2),'STATE.json'),'utf8'));
 assert.equal(state.state.visit_count,6);assert.equal(state.state.observations.length,12);
 assert.equal(state.state.records.length,0);assert.equal(state.state.semantic_index.provider,'injected_test_only');
 assert(state.state.learner_visible_history.every(x=>x.topic_id&&x.opening&&x.teacher_response));
 assert.equal(b.report.lineage.previous_run_id,r1);
 const juno=keep('journey',name('j_juno_2'));
 const c=await checked({lab:'journey',mode:'offline',learner:'JUNO',runId:juno,pathway:'b+x',visits:2});
 assert(c.report.complete,JSON.stringify(c.report.failure));
 assert.equal(c.report.requests.filter(x=>x.role==='B_ONE').length,0);
 assert.equal(c.report.requests.filter(x=>x.role==='B').length,2);
 assert.equal(c.report.requests.filter(x=>x.role==='X').length,2);
 assert(c.report.entries.every(x=>x.phases?.length>0));
 // Neutral capability challenges are isolated, not injected into the natural 30-topic journeys.
 const challenge=keep('challenge',name('ch10'));
 const d=await checked({lab:'challenge',mode:'offline',runId:challenge,cases:10});
 assert(d.report.complete,JSON.stringify(d.report.failure));assert.equal(d.report.entries.length,10);
 assert(d.report.entries.every(x=>x.assessment_valid));
 const as=keep('assessment',name('as4'));
 const e=await checked({lab:'assessment',mode:'offline',runId:as,sourceRun:r2,cases:4});
 assert(e.report.complete,JSON.stringify(e.report.failure));assert.equal(e.report.entries.length,4);
 assert(e.report.entries.every(x=>x.evidence_citations_in_supplied_ids));
 const comp=keep('implementation',name('imp2'));
 const f=await checked({lab:'implementation',mode:'offline',runId:comp,sourceRun:r2,cases:2});
 assert(f.report.complete,JSON.stringify(f.report.failure));assert.equal(f.report.entries.length,2);
 assert(f.report.entries.every(x=>x.arms.length===2));
 assert.equal(f.report.requests.filter(x=>x.role==='B_ONE').length,2);
 assert.equal(f.report.requests.filter(x=>x.role==='B').length,2);
 assert.equal(f.report.requests.filter(x=>x.role==='X').length,2);
 assert(f.report.entries.every(x=>x.arms.every(z=>z.execution?.status==='text_executable')));
 assert(f.report.entries.every(x=>x.arms[0].teacher_request.messages.length===2));
 assert(f.report.entries.every(x=>x.arms[0].teacher_request.messages[1].content.includes('single_call_design_and_implementation')));
 const rd=keep('readiness',name('readiness'));
 const g=await checked({lab:'readiness',mode:'offline',runId:rd});
 assert(g.report.complete);assert.match(g.report.decision,/UNDETERMINED/);
 assert.equal(g.report.model_calls,0);
 console.log('S62B-FIX1R4.2 SELFTEST PASS | 30 neutral topics; 2+4 resumable learner visits; one-call B has ZERO X calls; B+X two-call path; action replay; isolated A challenges; evidence replay; matched implementation; readiness unscored; zero provider/DB');
}finally{
 for(const p of cleanup)if(fs.existsSync(p))fs.rmSync(p,{recursive:true,force:true});
}
