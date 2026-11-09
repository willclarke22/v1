#!/usr/bin/env node
/** S58 no-provider fixture and real-model-transport mocks; never writes to DB. */
import assert from 'node:assert/strict';
import {loadFixture,makeSeed,scenarioForFixture} from './s16b58-fixture.mjs';
import {parseArgs,runStudy} from './s16b58-journey.mjs';
const opts=(id,trial,mode='offline')=>parseArgs(['--mode',mode,'--limit',mode==='offline'?'12':'3','--learner-id',id,'--trial-id',trial,'--retrieval','lexical',...(mode==='model'?['--learner','model','--allow-spend','--budget-usd','0.40']:[])]);
for(const [id,trial] of [['LEARNER-A','T01'],['LEARNER-B','T02'],['LEARNER-C','T04']]){
 const f=loadFixture(id,trial),s=makeSeed(f),sc=scenarioForFixture(f);
 assert.equal(s.topics.length,30);assert.equal(s.observations.length,6);assert.equal(s.roots.length,2);assert.equal(s.relationships.length,1);
 assert.ok(s.roots.every(r=>r.alternative_hypotheses.length&&r.supporting_observation_ids.length));
 assert.equal(sc.sessions.length,3);assert.equal(sc.sessions.flatMap(x=>x.steps).length,12);
 const t=await runStudy(opts(id,trial),{rootCheck:false,fixture:f});
 assert.equal(t.summary.processed,12);assert.equal(t.summary.stopped,false,JSON.stringify(t.events.filter(e=>e.stop)));
 assert.equal(t.summary.db_writes,0);assert.equal(t.summary.authoritative_memory_writes,0);
 assert.equal(t.seed_audit.existing_learner_relationships,1);assert.equal(t.summary.probe_suggestions_not_evidence,4);
 assert.equal(t.suggested_probes.every(p=>!p.offered&&!p.attempted&&!p.scored),true);
 assert.equal(t.curriculum_reference_edges.length,44);
 assert.equal(t.state.observations.length,18);
 assert.equal(t.state.relationships.length,1,'catalog keyword links must not become learner relationships');
 assert.ok(!JSON.stringify(t).includes('"knowledge_state"'));assert.ok(!JSON.stringify(t).includes('"rubric"'));
}
assert.notEqual(makeSeed(loadFixture('LEARNER-A','T01')).roots[0].root_problem,makeSeed(loadFixture('LEARNER-B','T02')).roots[0].root_problem);
assert.throws(()=>loadFixture('LEARNER-C','T01'),/mismatch/);
// Real-model mock asserts PRIVATE latent character is visible only to L, not A/B/C.
let sawL=false,sawA=false,sawB=false,sawC=false;
const usage={prompt_tokens:200,completion_tokens:50};
const send=async(req,_auth,role)=>{
 const payload=JSON.stringify(req);
 if(role==='L'){sawL=true;assert.match(payload,/private_synthetic_character/);assert.match(payload,/knowledge_state/);return {raw:JSON.stringify({learner:'I think energy is being added like an ingredient, but the carbon has to come from somewhere else.'}),usage};}
 assert.ok(!payload.includes('private_synthetic_character'),'private learner simulator in '+role);
 assert.ok(!payload.includes('"knowledge_state"'),'private state in '+role);
 assert.ok(!payload.includes('"rubric"'),'private scoring in '+role);
 if(role==='B'){sawB=true;assert.match(payload,/PREEXISTING PUBLIC SYNTHETIC LEARNER HISTORY/);return {raw:JSON.stringify({reply:'The carbon atoms come from CO₂. How would you test the difference between an energy source and a material source?'}),usage};}
 if(role==='A'){sawA=true;assert.match(payload,/underlying ROOT CAUSE/);let q=JSON.parse(req.messages.at(-1).content).current_learner_message;return {raw:JSON.stringify({kind:'new_or_continuing_difficulty',topic_label:'Photosynthesis',root_problem:'May be conflating energy transfer with material incorporation',evidence_quote:q.slice(0,Math.min(80,q.length)),uncertainty:'medium'}),usage};}
 if(role==='C'){sawC=true;return {raw:JSON.stringify({identity:'uncertain',anchor_id:null,rationale:'Competing root causes remain plausible; no unambiguous identity.'}),usage};}
 throw Error('Unexpected '+role);
};
const t=await runStudy(opts('LEARNER-A','T01','model'),{rootCheck:false,credential:()=>({key:'MOCK_NOT_REAL',url:'https://invalid.example'}),send});
assert.equal(t.summary.stopped,false,JSON.stringify(t.events.filter(x=>x.stop)));assert.equal(t.summary.processed,3);
assert.ok(sawL&&sawA&&sawB&&sawC);assert.equal(t.summary.db_writes,0);
console.log('S1.6B.5.8 SELFTEST PASS: 30-topic catalog / 44 curricular links separate, 3 learner-specific seeded histories (6 observations/2 underlying roots/1 learner relationship each), 12-turn offline tests, four unadministered curated probe suggestions, hidden simulator state only L, no private rubrics in model context or trace, mocked A/B/C/L, zero live provider or DB writes.');
