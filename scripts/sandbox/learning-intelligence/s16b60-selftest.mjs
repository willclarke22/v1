#!/usr/bin/env node
/** Offline only; no paid model, local embedding server, DB or cloud required. */
import assert from 'node:assert/strict';
import {fixturePublic,privateFixtureAudit} from './s16b60-fixture.mjs';
import {retrievalPacket,localMiniLM} from './s16b60-retrieval.mjs';
import {promptFor} from './s16b60-prompts.mjs';
import {runBenchmark,parseArgs} from './s16b60-benchmark.mjs';
import {scriptedMock} from './s16b59-lean-core.mjs';
const f=fixturePublic();assert.equal(f.topics.length,30);assert.equal(f.cases.length,30);assert.equal(f.private_keys_exposed,false);assert.equal(privateFixtureAudit().profiles,8);
assert.equal(new Set(f.cases.map(x=>x.learner_id)).size,8);
for(const c of f.cases){
 const p=await retrievalPacket(f,c,{method:'lexical',role:'A',explore:true});
 assert.ok(p.context.observations.some(x=>x.id===c.latest_observation.id));
 assert.ok(p.context.coverage.included_observation_ids.length<=12);
 assert.ok(p.context.coverage.included_observation_ids.every(id=>[...c.historical_observations,c.latest_observation].some(o=>o.id===id)));
 assert.ok(p.context.observations.every(x=>x.task_conditions&&x.source));
 assert.ok(!JSON.stringify(p).includes('suggested_relationship_stance'));
}
const c=f.cases[11],p=await retrievalPacket(f,c,{role:'A',method:'lexical',explore:true});
assert.ok(p.context.observations.some(x=>x.topic_id!=='X12'),'Explorer should access other topics');
assert.ok(promptFor('B','s60').includes('diagnostic learning move'));assert.ok(promptFor('A','s60').includes('learner-specific'));
const syntheticallyEncoded=async(_url,init)=>({ok:true,json:async()=>({vectors:JSON.parse(init.body).texts.map((t,i)=>Array.from({length:40},(_,k)=>((t.charCodeAt(k%t.length)||65)+i+k)%13/13))})});
const semantic=await retrievalPacket(f,c,{role:'A',method:'semantic',explore:false,semanticTransport:syntheticallyEncoded});assert.equal(semantic.context.coverage.mode,'semantic');
const mixed=await retrievalPacket(f,c,{role:'A',method:'mixed',explore:false,semanticTransport:syntheticallyEncoded});assert.equal(mixed.context.coverage.mode,'mixed');
await assert.rejects(()=>localMiniLM(['q'],{url:'https://example.org/embed',transport:syntheticallyEncoded}),/localhost/);
await assert.rejects(()=>localMiniLM(['q'],{transport:async()=>({ok:true,json:async()=>({vectors:[[0]]})})}),/shape invalid/);
let checkInputs=0,allCitationsAllowed=true,privateNeverPresent=true;
const mock=(role,data,payload)=>{
 checkInputs++;const s=JSON.stringify({data,payload});if(s.includes('suggested_relationship_stance')||s.includes('researcher_hypothesis_not_ground_truth'))privateNeverPresent=false;
 const all=new Set(data.allowed_observation_ids);for(const x of data.recent_dialogue||[])if(!all.has(x.observation_id))allCitationsAllowed=false;
 const m=scriptedMock(role);if(role==='A')m.observed_understanding=[{claim:'No demonstrated mastery established',observation_ids:[data.latest_observation_id]}];
 return m;
};
const bench=await runBenchmark({mode:'model',retrieval:'lexical',prompt:'compare',role:'both',explore:'on',c:'off',limit:3,caseId:null,semanticUrl:'http://127.0.0.1:8001/embed',allowSpend:true,budget:0.50},{fixture:f,invoke:mock});
assert.equal(bench.summary.cases,3);assert.equal(bench.summary.outputs,12);assert.equal(checkInputs,12);assert.ok(allCitationsAllowed);assert.ok(privateNeverPresent);
assert.equal(bench.summary.db_writes,0);assert.equal(bench.summary.authoritative_memory_writes,0);
assert.throws(()=>parseArgs(['--mode','model']),/allow-spend/);assert.throws(()=>parseArgs(['--mode','offline','--allow-spend']),/forbids/);
assert.throws(()=>parseArgs(['--mode','model','--allow-spend','--budget-usd','0.10','--limit','30']),/limit/);
const offline=await runBenchmark({mode:'offline',retrieval:'lexical',prompt:'compare',role:'both',explore:'on',c:'off',limit:30,caseId:null,semanticUrl:'http://127.0.0.1:8001/embed',allowSpend:false,budget:null});
assert.equal(offline.summary.cases,30);assert.equal(offline.summary.outputs,120);assert.equal(offline.cost.calls,0);
console.log('S60 SELFTEST PASS: 30 distinct topics/cases, 8 learner profiles, private rubric isolation, stable citable IDs, retrieval/semantic contract, A/B matched prompt ablation, original S59 preserved, no model/DB/cloud traffic.');
