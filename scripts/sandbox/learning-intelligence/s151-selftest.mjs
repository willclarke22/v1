#!/usr/bin/env node
import assert from 'node:assert/strict';
import {args} from './s15-flow.mjs';
import {rankFixtureEvidence,evidenceIntegrity} from './s151-retrieval.mjs';
const vec=(a,b)=>{const out=new Array(384).fill(0);out[0]=a;out[1]=b;return out;};
const norm=x=>vec(x,Math.sqrt(1-x*x));
const card='How the sinoatrial node initiates electrical activation';
const circuit='How Kirchhoff current law conserves current at a junction';
const bank=[{topic_id:'c1',topic_label:'Heart biology',domain:'Cardiac physiology',events:[{event_id:'11111111-1111-4111-8111-111111111111',root_problem:card}]},
 {topic_id:'c2',topic_label:'Electrical circuits',domain:'Electrical circuits',events:[{event_id:'22222222-2222-4222-8222-222222222222',root_problem:circuit}]}];
const q={topic_name:'SA node depolarization',root_problem:'How SA node ion currents generate depolarization'};
function makeMock(rootScores){return async (url,init)=>{
 assert.equal(url,'http://127.0.0.1:8001/embed');const x=JSON.parse(init.body).texts;
 return {ok:true,json:async()=>({vectors:x.map(text=>{
  if(text===q.topic_name+' '+q.root_problem)return vec(1,0);  // topic label prefers wrong electrical domain
  if(text===q.root_problem)return vec(0,1);
  if(text==='Heart biology Cardiac physiology')return norm(.20);
  if(text==='Electrical circuits Electrical circuits')return norm(.85);
  if(text===card){const y=rootScores[0];return vec(Math.sqrt(1-y*y),y);}
  if(text===circuit){const y=rootScores[1];return vec(Math.sqrt(1-y*y),y);}
  throw Error('Unexpected embed text '+text);
 })})};
};}
const r=await rankFixtureEvidence(q,{bank,request:makeMock([.89,.39])});
assert.equal(r.topicId,'c1','Must rescue evidence-bearing cardiac topic from misleading short topic labels');
assert.equal(r.diagnostics.nearestTopicLabelByScore,'Electrical circuits');
assert.equal(r.topicCandidates[0].topicLabel,'Heart biology');
assert.equal(evidenceIntegrity(r,r.events).status,'candidate_ready');
const weak=await rankFixtureEvidence(q,{bank,request:makeMock([.30,.25])});
assert.equal(evidenceIntegrity(weak,weak.events).reason,'no_supported_historical_match');
const tie=await rankFixtureEvidence(q,{bank,request:makeMock([.61,.60])});
assert.equal(evidenceIntegrity(tie,tie.events).reason,'competing_topics_close');
assert.equal(evidenceIntegrity({...r,retrievalStatus:'semantic_pgvector'},r.events).status,'review_only');
assert.equal(args(['--mode','model','--allow-spend','--budget-usd','0.05','--retrieval-policy','integrity']).retrievalPolicy,'integrity');
assert.equal(args(['--mode','fixture']).retrievalPolicy,'baseline');
assert.throws(()=>args(['--mode','fixture','--retrieval-policy','integrity']));
assert.throws(()=>args(['--mode','model','--allow-spend','--budget-usd','0.05','--retrieval-policy','unsafe']));
console.log('S1.5.1 SELFTEST PASS: cross-topic historical rescue, low-evidence hold, near-tie hold, conservative sandbox hold, opt-in parser and unchanged default.');
