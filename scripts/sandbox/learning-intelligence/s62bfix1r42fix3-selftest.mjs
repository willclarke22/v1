#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {paired,preparePairedRecovery,injectedEmbeddings,labDir,parseArgs} from './s62bfix1r42fix3-runtime.mjs';
import {paired as priorPaired} from './s62bfix1r42fix2-runtime.mjs';
const id='qa_fix3_'+process.pid;
const fixture=id+'_fixture',partial=id+'_partial',recovered=id+'_recovered';
const dir=x=>labDir('paired',x);
for(const x of [fixture,partial,recovered])fs.rmSync(dir(x),{recursive:true,force:true});
try{
 const base=await paired({mode:'offline',lab:'paired',learner:'ATLAS',visits:1,runId:fixture,secondRetrieval:'on'},{embedFn:injectedEmbeddings});
 assert.equal(base.report.complete,true, JSON.stringify(base.report.failure));
 const samples={};for(const r of base.report.requests)if(!samples[r.role])samples[r.role]=JSON.parse(r.raw);
 for(const role of ['L_ROUTE','A','B_ONE','B','X','L'])assert.ok(samples[role],role);
 const aFor=(input,more=null,invalid=false)=>{
  const out=structuredClone(samples.A);out.observed.evidence_ids=[invalid?'ATLAS-001-IN':input.current.id];out.interpretation.more_history_needed=more;out.memory_decisions=[];return {raw:JSON.stringify(out)};
 };
 let nPre2=0;
 const failInvoke=async(role,input,req,record)=>{
  if(role==='A'){
   if(record==='pre:A'&&input.current.id==='ATLAS-002-IN'){
    nPre2++;if(nPre2===2)return aFor(input,'Find prior ecosystem observation');
   }
   if(record==='pre:A_more_history')return aFor(input,null,true);
   return aFor(input);
  }
  if(role==='L_ROUTE')return {raw:JSON.stringify({...samples.L_ROUTE,topic_id:'T01',learner_utterance:'Can we think through another example of this concept?'})};
  return {raw:JSON.stringify(samples[role])};
 };
 const one=await priorPaired({mode:'offline',lab:'paired',learner:'ATLAS',visits:2,runId:partial,secondRetrieval:'on'},{embedFn:injectedEmbeddings,invoke:failInvoke});
 assert.equal(one.report.complete,false, 'should have rejected A second response');
 assert.equal(one.report.completed_rounds,1);
 assert.equal(one.report.failure.phase,'round_2:b+x');
 assert.equal(one.report.entries.at(-1).arms['b+x'].pre_a.error,'A: current observation uncited');
 const rec=preparePairedRecovery(partial,{replaceInvalidA:true});
 assert.equal(rec.completed_rounds,1);assert.equal(rec.start_round,2);
 assert.equal(rec.replacedInvalidA.source_error,'A: current observation uncited');
 assert.equal(rec.calls.length,one.report.requests.filter(r=>r.round===2).length-1);
 assert.throws(()=>parseArgs(['--lab','paired','--mode','plan','--visits','1','--run-id','x','--replace-invalid-a']),/replace-invalid-a/);
 let newA=0;
 const recoverInvoke=async(role,input,req,record)=>{
  if(role==='A'){
   if(record==='pre:A_more_history'){newA++;return aFor(input,null,true)}
   if(record==='pre:A_current_evidence_retry'){newA++;return aFor(input)}
   return aFor(input);
  }
  if(role==='L_ROUTE')return {raw:JSON.stringify({...samples.L_ROUTE,topic_id:'T01',learner_utterance:'Can we think through another example of this concept?'})};
  return {raw:JSON.stringify(samples[role])};
 };
 const two=await paired({mode:'offline',lab:'paired',learner:'ATLAS',visits:1,runId:recovered,recoverFrom:partial,replaceInvalidA:true,secondRetrieval:'on'},{embedFn:injectedEmbeddings,invoke:recoverInvoke});
 assert.equal(two.report.complete,true,JSON.stringify(two.report.failure));
 assert.equal(two.report.completed_rounds,2);assert.equal(two.report.replayed_calls,rec.calls.length);
 assert.equal(two.report.model_calls,0);assert.equal(newA,2,'one rejected A call plus one model-generated repair');
 assert.equal(two.report.entries.at(-1).arms['b+x'].pre_a.validation_retry.retry_valid,true);
 assert.equal(two.report.lineage.replacement_of_invalid_A.source_response_sha256,rec.replacedInvalidA.source_response_sha256);
 assert.equal(two.report.requests.filter(r=>r.role==='B_ONE'&&r.status==='replayed_returned').length,1);
 assert.equal(two.report.requests.filter(r=>r.role==='B_ONE'&&r.status==='returned').length,0);
 console.log('S62B-FIX1R42FIX3 SELFTEST PASS | selective known-invalid A replacement; replayed B-only and prior A/L; fresh A validation retry; checkpoint/state integrity; no provider or DB');
}finally{for(const x of [fixture,partial,recovered])fs.rmSync(dir(x),{recursive:true,force:true});}
