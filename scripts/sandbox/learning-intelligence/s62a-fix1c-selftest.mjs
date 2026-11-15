#!/usr/bin/env node
/* Pure synthetic engineering checks. No real learner truths, no API, embedding or DB writes. */
import assert from 'node:assert/strict';
import {COHERENCE_SCHEMA,parseCoherence,applyKnowledgeActions,boundedKnowledgeRecords} from './s62a-fix1c-core.mjs';
import {parseArgs,runJourney} from './s62a-fix1c-journey.mjs';
import {pairRequests,parseOpts} from './s62a-fix1c-compare.mjs';
const allowed=['OBS1','OBS2'];
const state={learner_id:'TEST',knowledge_records:[],history_version:0};
const sample=(id,action='propose',existing_id=null)=>({current_understanding:{learner_intent:null,assessed_task:'synthetic transfer question',demonstrated:[{claim:'Synthetic behavior—not scientifically scored',observation_ids:[id]}],task_conditions:'unhinted synthetic',not_yet_demonstrated:[],uncertainty:'medium'},learner_model_delta:{observations:[],underlying_cause_hypotheses:[],knowledge_actions:[{existing_id,action,kind:'understanding',claim:action==='propose'?'Tentative graph interpretation':'Graph interpretation may have improved',rationale:'Test recorded behavior',uncertainty:'medium',task_conditions:'synthetic',evidence_roles:[{id,role:action==='propose'?'support':'counter'}],confounds:[]}],memory_actions:[],explicit_instructions:[]},next_teaching:{advisory:'Explain naturally',next_probe:{purpose:null,probe_type:null,separates_hypotheses:[]},request_more_context:{scope:null,why:null}}});
const first=parseCoherence(sample('OBS1'),allowed,[]);const made=applyKnowledgeActions(state,first,{id:'OBS1'});
assert.equal(made.length,1);assert.deepEqual(state.knowledge_records[0].support_ids,['OBS1']);
const id=made[0].id;const second=parseCoherence(sample('OBS2','weaken',id),allowed,state.knowledge_records);const updated=applyKnowledgeActions(state,second,{id:'OBS2'});
assert.equal(updated[0].action,'weaken');assert.deepEqual(state.knowledge_records[0].counter_ids,['OBS2']);assert.equal(state.knowledge_records[0].status,'challenged_provisional');assert.equal(state.knowledge_records[0].revisions.length,2);
assert.throws(()=>parseCoherence(sample('HALLUCINATED'),allowed,state.knowledge_records),/uncitable|invalid/);
assert.throws(()=>parseCoherence(sample('OBS1','revise','FAKE'),allowed,state.knowledge_records),/target missing/);
assert.deepEqual(boundedKnowledgeRecords(state,['OBS2'])[0].citable_support_ids,[]);
assert.deepEqual(boundedKnowledgeRecords(state,['OBS2'])[0].citable_counter_ids,['OBS2']);
const baseInput={learner_message:'test message',allowed_observation_ids:['OBS1'],context:{observations:[{id:'OBS1',text:'test'}]}};
const pair=pairRequests(baseInput,'gpt-4.1-mini');assert.equal(pair.old.messages[1].content,pair.new.messages[1].content);assert.notEqual(pair.old.messages[0].content,pair.new.messages[0].content);
assert.throws(()=>parseOpts(['--frozen','x','--run']),/Paid comparison requires/);
const fake=async(role,input)=>{
 const usage={prompt_tokens:120,completion_tokens:40,total_tokens:160};
 if(role==='A'){
  const row={current_understanding:{learner_intent:null,assessed_task:'fictional session',demonstrated:[],task_conditions:'simulated; no independent mastery claim',not_yet_demonstrated:['unknown'],uncertainty:'high'},learner_model_delta:{observations:[],underlying_cause_hypotheses:[],knowledge_actions:[],memory_actions:[],explicit_instructions:[]},next_teaching:{advisory:'Respond to the learner',next_probe:{purpose:null,probe_type:null,separates_hypotheses:[]},request_more_context:{scope:null,why:null}}};
  if(input.learner_knowledge_records?.length)throw Error('Unexpected knowledge records in simple mock');
  return {raw:JSON.stringify(row),usage};
 }
 if(role==='B'){assert.deepEqual(input.learner_model_summary,[]);assert.deepEqual(input.learner_knowledge_records,[]);assert.deepEqual(input.context.roots,[]);return {reply:'Let us compare one concrete example.',probe_offer:null,usage};}
 return {learner_message:'I wonder about an example.',accept_probe:null,reasoning:'Synthetic reply',usage};
};
const o=parseArgs(['--mode','model','--allow-spend','--budget-usd','1','--learner','ELLI','--visits','1','--turns-per-visit','2','--retrieval','lexical','--explore','off','--memory-mode','off']);
const t=await runJourney(o,{invoke:fake});assert.equal(t.summary.run_complete,true,JSON.stringify(t.failure));assert.equal(t.summary.steps,2);assert.equal(t.summary.database_writes,0);
for(const row of t.timeline){assert.equal(row.model_inputs.B.learner_knowledge_records.length,0);assert.equal(row.model_inputs.B.learner_model_summary.length,0)}
console.log('S62A-FIX1C SELFTEST PASS | revisions retain support/counter/history, bounded citations, memory-off B isolation, frozen evidence, mocked journey; no real API/DB');
