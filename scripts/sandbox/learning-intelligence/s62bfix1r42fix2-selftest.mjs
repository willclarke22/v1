#!/usr/bin/env node
/** FIX2 local QA. No provider calls, no production DB, injected local test vectors. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {paired,preparePairedRecovery,injectedEmbeddings,parseArgs,plan,labDir} from './s62bfix1r42fix2-runtime.mjs';
import {compileExperience,executePhase,assertReplay} from './s62bfix1r42fix2-executor.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=(id)=>labDir('paired',id);
function cleanup(id){fs.rmSync(dir(id),{recursive:true,force:true});}
const makeC=(prefix)=>`${prefix}_${process.pid}`;
const [firstId,secondId,partialId,recoverId,badId]=['first','second','partial','recover','unknown'].map(x=>makeC('qa_fix2_'+x));
for(const i of [firstId,secondId,partialId,recoverId,badId])cleanup(i);
try{
 assert.throws(()=>parseArgs(['--lab','paired','--mode','model','--visits','5','--run-id','a']),/Paid mode/);
 assert.throws(()=>parseArgs(['--lab','paired','--mode','offline','--visits','5','--run-id','a','--recover-from','z','--resume-from','b']),/RecoverFrom/);
 const p=plan({lab:'paired',mode:'model',visits:5,runId:'qa',budget:3.5});
 assert.equal(p.admission_estimate_usd,3.5);
 const b={teacher_response:'Try this series and tell me what you notice',experience_proposal:{modality:'text',learner_task:'Observe and reflect'}};
 const t={status:'compiled',reason:'Verbal reflection',assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''},stages:Array.from({length:6},(_,i)=>({instruction:'Look at step '+i,visible_scene:'Pattern step '+i,controls:[],hint_text:'Observe carefully',feedback_on_submit:'Thank you for explaining',reveal_next_on_submit:i===5}))};
 const exp=compileExperience(b,t,{instanceKey:'test'});
 assert.equal(exp.stages.length,6);assert.equal(exp.status,'text_executable');assert.equal(exp.mechanical_navigation_corrections.length,6);
 const v={learner_utterance:'I think the value changes as we go.',selected_actions:[],request_hint:false,declines:false};
 const r=executePhase(exp,0,v,[]);assert.equal(r.result.status,'observed_not_verified');assert.equal(r.events[0].type,'observe_continue');
 assertReplay(exp,[{phase:0,response:v}],{events:r.events,completed:[r]});
 const first=await paired({mode:'offline',lab:'paired',learner:'ATLAS',visits:10,runId:firstId,secondRetrieval:'on'},{embedFn:injectedEmbeddings});
 assert.equal(first.report.complete,true,JSON.stringify(first.report.failure));
 assert.equal(first.report.completed_rounds,10);
 assert.equal(first.report.entries.length,10);
 assert.equal(first.report.entries[0].arms['b-only'].opening.learner_utterance,first.report.entries[0].arms['b+x'].opening.learner_utterance);
 assert.equal(first.report.entries[0].arms['b-only'].opening.topic_id,first.report.entries[0].arms['b+x'].opening.topic_id);
 assert.equal(first.report.requests.filter(x=>x.arm==='b-only'&&x.role==='B_ONE').length,10);
 assert.equal(first.report.requests.filter(x=>x.arm==='b-only'&&x.role==='X').length,0);
 assert.equal(first.report.requests.filter(x=>x.arm==='b+x'&&x.role==='B').length,10);
 assert.equal(first.report.requests.filter(x=>x.arm==='b+x'&&x.role==='X').length,10);
 const second=await paired({mode:'offline',lab:'paired',learner:'ATLAS',visits:10,resumeFrom:firstId,runId:secondId,secondRetrieval:'on'},{embedFn:injectedEmbeddings});
 assert.equal(second.report.complete,true,JSON.stringify(second.report.failure));
 assert.equal(second.report.completed_rounds,20);
 const s=JSON.parse(fs.readFileSync(path.join(dir(secondId),'STATE.json'),'utf8'));
 assert.equal(s.state.branches['b-only'].visit_count,20);assert.equal(s.state.branches['b+x'].visit_count,20);
 assert.deepEqual(s.state.branches['b-only'].records,[]);assert.deepEqual(s.state.branches['b+x'].records,[]);
 assert.equal(s.state.branches['b-only'].learner_visible_history.length,20);
 assert.equal(s.state.branches['b+x'].learner_visible_history.length,20);
 assert.throws(()=>parseArgs(['--lab','paired','--mode','offline','--visits','11','--run-id','too_large']),/Invalid R4.2 options/);
 await assert.rejects(()=>paired({mode:'offline',lab:'paired',learner:'ATLAS',visits:1,resumeFrom:secondId,runId:makeC('qa_overflow')},{embedFn:injectedEmbeddings}),/capped at 20/);
 let n=0;const failEmbed=async texts=>{n++;if(n>=3)throw Error('INJECTED_KNOWN_LOCAL_EMBEDDING_FAILURE');return injectedEmbeddings(texts);};
 const partial=await paired({mode:'offline',lab:'paired',learner:'ATLAS',visits:2,runId:partialId,secondRetrieval:'on'},{embedFn:failEmbed});
 assert.equal(partial.report.complete,false);assert.ok(partial.report.requests.length>0);assert.ok(partial.report.requests.every(r=>r.status==='returned'));
 const pre=preparePairedRecovery(partialId);assert.ok(pre.calls.length>0);
 const recovered=await paired({mode:'offline',lab:'paired',learner:'ATLAS',visits:2,recoverFrom:partialId,runId:recoverId,secondRetrieval:'on'},{embedFn:injectedEmbeddings});
 assert.equal(recovered.report.complete,true,JSON.stringify(recovered.report.failure));
 assert.equal(recovered.report.completed_rounds,2);
 assert.equal(recovered.report.replayed_calls,pre.calls.length);
 assert.ok(recovered.report.requests.filter(r=>r.status==='replayed_returned').length===pre.calls.length);
 // fail closed: transport unknown cannot be recovered.
 let once=false;const broken=await paired({mode:'offline',lab:'paired',learner:'ATLAS',visits:1,runId:badId},{embedFn:injectedEmbeddings,invoke:async()=>{if(!once){once=true;throw Error('SIMULATED_NETWORK_UNKNOWN');}return {raw:'{}'}}});
 assert.equal(broken.report.complete,false);assert.equal(broken.report.requests[0].status,'transport_unknown');
 assert.throws(()=>preparePairedRecovery(badId),/Uncertain provider/);
 console.log('S62B-FIX1R42FIX2 SELFTEST PASS | 20+20 visits, one-call B, 2-call B+X, shared opening, replay recovery, uncertainty fail-closed, extended symbolic stages, no provider or DB');
} finally {for(const i of [firstId,secondId,partialId,recoverId,badId])cleanup(i);}
