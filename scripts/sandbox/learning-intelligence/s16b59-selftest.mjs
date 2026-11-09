#!/usr/bin/env node
/** S59 offline/mock regression: no provider traffic or learner DB writes. */
import assert from 'node:assert/strict';
import {loadFixture} from './s16b58-fixture.mjs';
import {publicSeed,record,contextSlice,validateA,makeRequest,parseResult,scriptedMock,PROMPTS} from './s16b59-lean-core.mjs';
import {runLean,args} from './s16b59-journey.mjs';
const f=loadFixture('LEARNER-A','T01'),seed=publicSeed(f);
assert.equal(seed.topics.length,30);assert.equal(seed.links.length,44);assert.equal(seed.obs.length,6);assert.equal(seed.roots.length,2);assert.equal(seed.relationships.length,1);
const query='Does sunlight become part of glucose?';
record(seed,'N-1',query);
const b=contextSlice(seed,query,{role:'B',turn:1});
assert.ok(b.topics.length<=4&&b.observations.length<=8&&b.roots.length<=2&&b.relationships.length<=1);
assert.ok(!JSON.stringify(b).includes('knowledge_state'));
assert.ok(Buffer.byteLength(JSON.stringify(b))<13000);
assert.ok(Buffer.byteLength(JSON.stringify({topics:f.topics,links:f.curriculumLinks,history:f.learner}))>Buffer.byteLength(JSON.stringify(b)));
const aWide=contextSlice(seed,query,{role:'A',explore:true,turn:2});
assert.ok(aWide.coverage.included_observation_ids.length>=b.coverage.included_observation_ids.length);
assert.ok(aWide.observations.some(o=>['BIO05','CELL01','REAS02'].includes(o.topic_id)),'Exploratory retrieval must sample unrelated topics');
const a=scriptedMock('A');a.relationship_actions=[{existing_id:null,action:'propose',contexts:['BIO05','CELL01'],learner_pattern:'Correct in mitochondrial context, uncertain in chloroplast context',alternatives:['Unfamiliar labels'],observation_ids:['A-H04','A-H05']}];
let validation=validateA(a,seed);assert.equal(validation.proposals.length,1);assert.equal(validation.proposals[0].type,'relationship');
const before=seed.relationships.length;
a.relationship_actions[0].observation_ids=['A-H04','NONEXISTENT'];validation=validateA(a,seed);
assert.equal(validation.proposals.length,0);assert.equal(seed.relationships.length,before,'Model must not mutate learner graph');
a.relationship_actions[0].observation_ids=['A-H04'];assert.equal(validateA(a,seed).proposals.length,0,'One episode cannot create strong learner cross-context relation');
record(seed,'N-PREF','Please keep explanations brief.');
const prefA=scriptedMock('A');prefA.explicit_instruction_observations=[{instruction:'Keep explanations brief',scope:'conversation',evidence_id:'N-PREF',exact_excerpt:'Please keep explanations brief.'}];
assert.equal(validateA(prefA,seed).explicit_instructions.length,1);
prefA.explicit_instruction_observations[0].exact_excerpt='Not actually said';assert.equal(validateA(prefA,seed).explicit_instructions.length,0);
assert.equal(PROMPTS.A.includes('LEARNER RELATIONSHIPS'),true);
assert.equal(PROMPTS.B.includes('OPTIONAL probe'),true);
const fakeB=scriptedMock('B');assert.deepEqual(parseResult(JSON.stringify(fakeB),'B'),fakeB);
assert.equal(makeRequest('A',{message:query}).response_format.json_schema.strict,true);
const fixtureWithout=loadFixture('LEARNER-A','T05');
const opts={mode:'offline',learner:'scripted',learnerId:'LEARNER-A',trialId:'T05',limit:4,c:'off',explore:'on',probeId:'BIO01-P1',allowSpend:false,budget:null};
const offline=await runLean(opts);
assert.equal(offline.summary.turns,4);assert.equal(offline.summary.initial_roots,0);assert.equal(offline.summary.db_writes,0);assert.equal(offline.summary.authoritative_memory_writes,0);
assert.equal(offline.probe.observation.text.includes('not sure'),true);
assert.equal(offline.probe.scientific_correctness,'not_independently_established');
assert.equal(offline.public_context.private_learner_truth_exposed,false);
assert.ok(!JSON.stringify(offline).includes('hidden_competing_truths'));
assert.throws(()=>args(['--mode','model']),/allow-spend/);
assert.throws(()=>args(['--mode','offline','--allow-spend']),/forbids/);
let broader=0,hadC=false,privateOnlyL=true,previousAContextSeen=false;
const modelFixture=loadFixture('LEARNER-A','T01');
// Extend the fixture only inside this mock test to verify genuinely distant-topic retrieval.
modelFixture.learner.prior_sessions.push(
 {id:'A-X07',topic_id:'QUANT02',turn:'X07',learner_quote:'I mix the slope and the total amount on a graph.',evidence_type:'uncertain_reasoning'},
 {id:'A-X08',topic_id:'PHYS06',turn:'X08',learner_quote:'In the kidney I mix up moving ions with consuming energy.',evidence_type:'uncertain_reasoning'},
 {id:'A-X09',topic_id:'PHYS04',turn:'X09',learner_quote:'I can explain when muscles use ATP but not where it is produced.',evidence_type:'contrast'}); 
const mock=(role,data)=>{
 if(role!=='L'&&JSON.stringify(data).includes('private_synthetic_character'))privateOnlyL=false;
 if(role==='L')return scriptedMock('L');
 if(role==='B'){if(data.previous_model_a_advisory)previousAContextSeen=true;return scriptedMock('B');}
 if(role==='A'){
  const z=scriptedMock('A');
  if(!data.requested_expansion_reason){z.request_more_context={scope:'unlinked distant learner episodes',why:'Check if this mechanism recurs across organelles'};return z;}
  broader++;
  z.relationship_actions=[{existing_id:null,action:'propose',contexts:['BIO05','CELL01'],learner_pattern:'Learner correctly describes mitochondrial proton pumping but not chloroplast compartment mapping',alternatives:['Diagram terminology difference'],observation_ids:['A-H04','A-H05']}];
  return z;
 }
 if(role==='C'){hadC=true;return scriptedMock('C');}
 throw Error('Unexpected model role');
};
const paidMock=await runLean({mode:'model',learner:'scripted',learnerId:'LEARNER-A',trialId:'T01',limit:2,c:'auto',explore:'on',probeId:null,allowSpend:true,budget:0.40},{fixture:modelFixture,invoke:mock});
assert.equal(paidMock.summary.proposed_learner_relationships,2);
assert.equal(broader,2);assert.equal(previousAContextSeen,true);assert.equal(hadC,true);assert.equal(privateOnlyL,true);
assert.equal(paidMock.summary.db_writes,0);
assert.ok(paidMock.events.every(e=>e.context_b.topics.length<=4));
// Exercise model L with a private state while affirming its exclusion from serialized trace and all A/B/C inputs.
let invokedL=false;const lMock=(role,data)=>{if(role==='L'){invokedL=true;assert.ok(data.private_synthetic_character.knowledge_state);return scriptedMock('L');}if(role!=='L'&&JSON.stringify(data).includes('private_synthetic_character'))privateOnlyL=false;return scriptedMock(role);};
const withL=await runLean({mode:'model',learner:'model',learnerId:'LEARNER-A',trialId:'T01',limit:2,c:'off',explore:'off',probeId:null,allowSpend:true,budget:0.40},{invoke:lMock});
assert.equal(invokedL,true);assert.equal(privateOnlyL,true);assert.ok(!JSON.stringify(withL).includes('private_synthetic_character'));
console.log('S59 LEAN SELFTEST PASS: 30-topic fixture reused; reduced B context; independent distant-topic exploration; A proposed a NEW learner relationship; invalid IDs held; optional C; T05 with roots withheld; private knowledge only L; probe response preserved unscored; no provider or DB writes.');
