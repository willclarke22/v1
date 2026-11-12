#!/usr/bin/env node
/** S62A offline/injected structural QA; these mocks are never scored as learning outcomes. */
import assert from 'node:assert/strict';
import {runJourney,parseArgs,loadPlans,selectedSchedule,cacheEmbeddingTransport,assertPublicInput} from './s62a-journey.mjs';
import {fixturePublic} from './s16b60-fixture.mjs';
import {scriptedMock} from './s16b59-lean-core.mjs';
import crypto from 'node:crypto';
const base=['--mode','offline','--learner','ELLI','--visits','2','--turns-per-visit','3','--retrieval','lexical'];
assert.equal(parseArgs(base).learner,'ELLI');
assert.equal(loadPlans().profiles.length,4);
assert.equal(selectedSchedule(fixturePublic(),loadPlans(),parseArgs(['--mode','offline','--learner','ALL','--visits','24','--turns-per-visit','6'])).length,24);
for(const invalid of [ ['--retrieval','bad'],['--turns-per-visit','8'],['--a-variant','unbounded'] ])assert.throws(()=>parseArgs([...base,...invalid]));
assert.throws(()=>assertPublicInput({private_fictional_state_not_truth:'hidden'}));
let requests=0;
async function fakeTransport(url,init){requests++;const {texts}=JSON.parse(init.body);return {ok:true,status:200,json:async()=>({vectors:texts.map(text=>Array.from({length:48},(_,i)=>{const hash=crypto.createHash('sha256').update(text+'#'+Math.floor(i/4)).digest();return (hash[i%32]-128)/128;}))})};}
const cache=cacheEmbeddingTransport(fakeTransport);
const transport=cache.transport;
const first=await transport('http://127.0.0.1:8001/embed',{body:JSON.stringify({texts:['a','b','a']})});
assert.equal((await first.json()).vectors.length,3);assert.equal(cache.stats.embedded_texts,2);
await transport('http://127.0.0.1:8001/embed',{body:JSON.stringify({texts:['b','a']})});
assert.equal(requests,1);assert.ok(cache.stats.cache_hits>=2);
const offline=await runJourney(parseArgs(base));
assert.equal(offline.summary.steps,6);assert.equal(offline.summary.model_calls,0);assert.equal(offline.summary.database_writes,0);
assert.equal(offline.timeline.some(x=>x.model_inputs.A?.private_fictional_state_not_truth),false);
assert.equal(offline.learner_histories.ELLI.observations.length,6);
const full=await runJourney(parseArgs(['--mode','offline','--learner','ALL','--visits','24','--turns-per-visit','6','--retrieval','lexical','--explore','off']));
assert.equal(full.summary.steps,144);assert.equal(full.summary.topic_visits,24);assert.equal(Object.keys(full.learner_histories).length,4);assert.equal(full.summary.database_writes,0);
const semantic=await runJourney(parseArgs(['--mode','offline','--learner','ELLI','--visits','2','--turns-per-visit','3','--retrieval','semantic','--audit-retrieval','on']),{semanticTransport:fakeTransport});
assert.equal(semantic.summary.steps,6);assert.equal(semantic.summary.retrieval_shadow_comparisons,6);
assert.ok(semantic.embedding_cache.embedded_texts>0);assert.equal(semantic.embedding_cache.local_service_required,true);
assert.ok(semantic.timeline.every(x=>x.retrieval.A.mode==='semantic'));
let denied=false;
try{await runJourney(parseArgs(['--mode','offline','--learner','ELLI','--visits','1','--turns-per-visit','2','--retrieval','semantic']),{semanticTransport:async()=>{throw Error('OFFLINE EMBEDDINGS DOWN');}});}catch(e){denied=/EMBEDDINGS DOWN/.test(String(e.message));}assert.equal(denied,true);
let calls={A:0,B:0,L:0,C:0};
async function injected(role,data){
 calls[role]++;
 const o=scriptedMock(role,data);
 if(role==='A'){
   const id=data.latest_observation_id;
   const roots=data.context.roots;
   if(!roots.length)o.root_actions=[{existing_id:null,action:'propose',reason:'Tentative learner-specific explanation; unproven from one observation',observation_ids:[id]}];
   else if(calls.A===3)o.root_actions=[{existing_id:roots[0].id,action:'weaken',reason:'Learner can give a contradictory response',observation_ids:[id]}];
   else o.root_actions=[];
 }
 if(role==='L')o.learner_message='Hmm, I am not sure. Can we try a different example?';
 return {raw:JSON.stringify(o),usage:{prompt_tokens:500,completion_tokens:110,prompt_tokens_details:{cached_tokens:0}}};
}
const modeled=await runJourney(parseArgs(['--mode','model','--learner','ELLI','--visits','2','--turns-per-visit','3','--retrieval','semantic','--a-variant','no-update','--audit-retrieval','on','--allow-spend','--budget-usd','1.00']),{invoke:injected,semanticTransport:fakeTransport});
assert.equal(modeled.summary.steps,6);assert.equal(modeled.summary.root_records,1);assert.ok(modeled.summary.memory_revision_events>=2);
assert.equal(modeled.summary.root_no_update_turns,4);assert.equal(modeled.summary.database_writes,0);
assert.ok(modeled.timeline.every(x=>x.model_inputs.A.allowed_observation_ids.includes(x.learner_observation_id)));
assert.ok(modeled.timeline.every(x=>!JSON.stringify(x.model_inputs.A).includes('private_fictional_state_not_truth')));
assert.ok(modeled.timeline.every(x=>!JSON.stringify(x.model_inputs.B).includes('private_fictional_state_not_truth')));
assert.equal(modeled.options.aVariant,'no-update');assert.ok(modeled.summary.max_request_bytes<25000);
console.log(`S62A SELFTEST PASS: 4 private fictional learners, 24 six-visit streams, 144-turn long offline, semantic cache/preflight, lexical shadow, injected root revision/abstention, private L isolation, 0 API/DB writes in offline; injected model calls ${modeled.cost.calls}. Synthetic behaviors NOT scientific truth.`);
