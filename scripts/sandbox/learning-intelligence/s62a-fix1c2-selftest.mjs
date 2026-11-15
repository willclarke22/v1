#!/usr/bin/env node
/** No API / embeddings / database. Deterministic contract and full-loop integration checks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {parseAndValidateA,applyActions,memoryCandidates} from './s62a-fix1c2-core.mjs';
import {parseArgs,run} from './s62a-fix1c2-journey.mjs';
const sample=(id,action='create',target=null,type='root')=>({current_assessment:{learner_intent:'Understand a quantitative relationship',assessed_task:'answer a tutor question',task_conditions:'fictional, unscored',demonstrated:[{claim:'Learner produced a verbal explanation',evidence_ids:[id],conditions:'tutor-guided'}],not_demonstrated:['Independent transfer'],interpretations:[],overall_uncertainty:'medium'},competing_causes:[],memory_actions:[{action,record_type:type,target_id:target,claim:'Learner may confuse rate with cumulative total',reason:'Synthetic observation',task_conditions:'mock',uncertainty:'medium',evidence_roles:[{id,role:action==='weaken'?'challenges_current':'supports_current'}]}],next_teaching:{goal:'Test distinction',approach:'Use an appropriate example',optional_probe:null,probe_purpose:null,request_more_context:{scope:null,why:null}}});
const s={learner_id:'TEST',memory_records:[],history_version:0,roots:[],relationships:[]};
const a=parseAndValidateA(sample('E1'),['E1'],[], 'E1');const first=applyActions(s,a,'E1');assert.equal(first.length,1);assert.equal(first[0].record_id,'TEST-R-001');
const candidates=memoryCandidates(s,{text:'rate and cumulative total'},['E1','E2']);
assert.equal(candidates[0].record_type,'root');
assert.throws(()=>parseAndValidateA(sample('E2','weaken','TEST-R-001','understanding'),['E2'],candidates,'E2'),/wrong-type/);
assert.throws(()=>parseAndValidateA(sample('NOT_ALLOWED','weaken','TEST-R-001'),['E2'],candidates,'E2'),/invalid evidence/);
assert.throws(()=>parseAndValidateA(sample('E2','weaken','NOT_REAL'),['E2'],candidates,'E2'),/missing or wrong-type/);
const valid=parseAndValidateA(sample('E2','weaken','TEST-R-001'),['E2'],candidates,'E2');const next=applyActions(s,valid,'E2');
assert.equal(next[0].action,'weaken');assert.equal(s.memory_records[0].status,'challenged');assert.equal(s.memory_records[0].revisions.length,2);assert.deepEqual(s.memory_records[0].evidence.supports_current,['E1']);assert.deepEqual(s.memory_records[0].evidence.challenges_current,['E2']);
const empty=sample('E2');empty.memory_actions=[];assert.equal(parseAndValidateA(empty,['E2'],candidates,'E2').memory_actions.length,0);
assert.throws(()=>parseArgs(['--mode','model','--learner','ELLI']),/explicit/);
assert.throws(()=>parseArgs(['--mode','offline','--allow-spend']),/reject spend/);
let aCalls=0, mainSawBelief=false, shadowNoLeak=true;
const invoke=async(role,input,payload,meta)=>{
 const usage={prompt_tokens:180,completion_tokens:80,total_tokens:260};
 if(role==='A'){
  aCalls++;const response=sample(input.latest_observation_id,aCalls===1?'create':'weaken',aCalls===1?null:'ELLI-R-001');
  if(aCalls>1){assert.equal(input.memory_candidates.some(x=>x.id==='ELLI-R-001'),true);}
  return {raw:JSON.stringify(response),usage};
 }
 if(role==='B'){
  if(meta.kind==='B_MEMORY_OFF_SHADOW'){
   if(input.memory_candidates.length||input.learner_memory_brief.length||input.model_a_provisional_advisory||input.context.roots.length||input.context.relationships.length||input.explicit_instructions.length)shadowNoLeak=false;
  }else if(input.memory_candidates.some(x=>x.id==='ELLI-R-001'))mainSawBelief=true;
  return {raw:JSON.stringify({reply:'Could we compare the changing rate with the total?',probe_offer:null,context_request:{scope:null,reason:null}}),usage};
 }
 return {raw:JSON.stringify({learner_message:'I think the total can still rise when the rate slows.',accept_probe:null,reasoning:'fictional response to tutoring'}),usage};
};
const runId='SELFTEST_'+String(process.pid);
const o=parseArgs(['--mode','offline','--learner','ELLI','--visits','1','--turns-per-visit','2','--b-shadow','on','--run-id',runId]);
const result=await run(o,{invoke});
assert.equal(result.trace.complete,true,JSON.stringify(result.trace.failure));
assert.equal(result.trace.timeline.length,2);assert.equal(result.trace.timeline[0].memory_changes[0].action,'create');assert.equal(result.trace.timeline[1].memory_changes[0].action,'weaken');
assert.equal(result.trace.learner_history.records[0].revisions.length,2);assert.equal(result.trace.timeline[1].state_before[0].status,'provisional');assert.equal(result.trace.timeline[1].state_after[0].status,'challenged');
assert.equal(mainSawBelief,true);assert.equal(shadowNoLeak,true);assert.equal(result.trace.summary.model_b_shadow_calls,2);
assert.equal(result.trace.summary.model_calls,0);assert.equal(result.trace.summary.no_database_writes,true);
assert.equal(fs.existsSync(path.join(result.dir,'TURN_INSPECTOR.html')),true);
// Simulated invalid A output must be recorded and safely skipped, not mutate memory.
let invalidCount=0;
const broken=async(role,input)=>{if(role==='A'){invalidCount++;return {raw:JSON.stringify(sample(input.latest_observation_id,'revise','ELLI-R-999')),usage:{prompt_tokens:100,completion_tokens:70}}}return invoke(role,input,{},{kind:'B_MEMORY_OFF_SHADOW'});};
const o2=parseArgs(['--mode','offline','--learner','ELLI','--visits','1','--turns-per-visit','2','--run-id',runId+'X']);
const r2=await run(o2,{invoke:broken});
assert.equal(r2.trace.complete,true,JSON.stringify(r2.trace.failure));assert.equal(r2.trace.summary.invalid_a_outputs,2);assert.equal(r2.trace.learner_history.records.length,0);
fs.rmSync(result.dir,{recursive:true,force:true});fs.rmSync(r2.dir,{recursive:true,force:true});
console.log('S62A-FIX1C2 SELFTEST PASS | typed records; history/polarity; invalid IDs refused; full A→memory→B→L loop; genuine B memory-off shadow; inspector; zero real API/embeddings/DB');
