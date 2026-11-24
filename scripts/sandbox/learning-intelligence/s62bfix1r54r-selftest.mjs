#!/usr/bin/env node
/** Provider-free R5.4R tests. Only writes disposable OS temporary fixtures, not learner sessions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {parseArgs,run} from './s62bfix1r54r-x-recovery.mjs';
import {designFor} from './s62bfix1r54-creative-store.mjs';
import {sha} from './s62bfix1r54-creative-core.mjs';
import {callProviderExtended} from './s62bfix1r54r-provider.mjs';
let checks=0;function ok(v,msg){assert.ok(v,msg);checks++;}
function throws(f,msg){assert.throws(f);checks++;}
const mockActivity={title:'Creative Task',html_fragment:'<button onclick="mywayRecord(\'choose\',\'A\')">Select action</button>',evidence_notes:'Unscored.',limitations:'Illustrative only.'};
const usage={prompt_tokens:1800,completion_tokens:650,prompt_tokens_details:{cached_tokens:0}};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'myway-r54r-offline-'));
const args=['--mode','check','--session-id','recover_test','--turn-id','t0022','--model-x','gpt-4.1-mini'];
const paid=['--mode','model','--session-id','recover_test','--turn-id','t0022','--model-x','gpt-4.1-mini','--budget-usd','0.20','--allow-spend'];
try{
 throws(()=>parseArgs(paid.filter(x=>x!=='--allow-spend')),'requires payment approval');
 throws(()=>parseArgs(['--mode','model','--session-id','recover_test','--turn-id','t0022','--budget-usd','0.001','--allow-spend']),'admission cost floor');
 ok(parseArgs(paid).modelX==='gpt-4.1-mini','model validation');
 const dir=path.join(tmp,'recover_test'),designDir=path.join(dir,'creative-designs');fs.mkdirSync(designDir,{recursive:true});fs.mkdirSync(path.join(dir,'turns'));
 const state={schema:'myway_goldloop_human_v1',learner:'recover_test',turns:[{turn_id:'t0022',topic_id:'topic_spanish',A_brief:{current_understanding:'Learner wants practical listening help',remaining_uncertainty:'Actual task performance unknown'}}]};fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state));
 const brief='Build an original interactive conversation where users make predictions, then inspect new outcomes and revise their reasoning.';
 const ctx={source_turn_id:'t0022',topic_id:'topic_spanish',model_A_learner_brief_is_tentative:'[object Object]'};
 const request={model:'gpt-4.1-mini',store:false,max_tokens:7800,messages:[{role:'system',content:'Design a creative interactive activity.'},{role:'user',content:JSON.stringify({learner_context:ctx,model_B_educational_design:brief,request:'Implement.'})}],response_format:{type:'json_schema',json_schema:{name:'myway_r54_x_implementation',strict:true,schema:{type:'object'}}}};
 const original={schema:'myway_r54_creative_trace_v1',status:'manual_review_required_no_automatic_retry',session_id:'recover_test',turn_id:'t0022',topic_id:'topic_spanish',variant:'bx',calls:[{role:'B_DESIGN',status:'returned',raw:JSON.stringify({brief})},{role:'X_IMPLEMENT',status:'billing_unknown_do_not_retry',request,error:'This operation was aborted'}]};
 const origPath=path.join(designDir,'t0022-bx.pending.json');fs.writeFileSync(origPath,JSON.stringify(original));const origBytes=fs.readFileSync(origPath);
 const pre=await run(args,{skipBranch:true,base:tmp});ok(pre.status==='recoverable_read_only'&&pre.model_calls===0,'read only check');ok(!fs.existsSync(path.join(designDir,'t0022-bx.json')),'check no writes');
 let called=0;const invoke=async(req,role)=>{called++;ok(role==='X_RECOVERY_NEW_CALL','X only');ok(!req.messages[1].content.includes('[object Object]'),'structured A no object-coercion');ok(req.messages[1].content.includes('Learner wants practical listening help'),'full A context included');ok(JSON.parse(req.messages[1].content).model_B_educational_design===brief,'exact B reused');return {raw:JSON.stringify(mockActivity),usage,model:'gpt-4.1-mini'};};
 const result=await run(paid,{skipBranch:true,base:tmp,invoke});ok(result.status==='complete','recovered');ok(called===1,'exactly one paid call simulated');ok(fs.readFileSync(origPath).equals(origBytes),'original pending bytes preserved');
 const record=designFor('recover_test','t0022','bx',{base:tmp});ok(record.activity.title===mockActivity.title,'canonical artifact reusable by old UI/A');ok(record.recovery.original_B_call_not_repeated,'source provenance');
 const recoveryRecord=JSON.parse(fs.readFileSync(path.join(designDir,'t0022-bx.recovery01.json')));ok(recoveryRecord.status==='complete'&&recoveryRecord.calls.length===1,'new audit complete');ok(!fs.existsSync(path.join(designDir,'t0022-bx.recovery01.pending.json')),'recovery checkpoint retired after full success');
 await assert.rejects(()=>run(paid,{skipBranch:true,base:tmp,invoke}));checks++;
 const failDir=path.join(tmp,'recover_failed'),failFolder=path.join(failDir,'creative-designs');fs.mkdirSync(failFolder,{recursive:true});fs.mkdirSync(path.join(failDir,'turns'));fs.writeFileSync(path.join(failDir,'state.json'),JSON.stringify({...state,learner:'recover_failed'}));fs.writeFileSync(path.join(failFolder,'t0022-bx.pending.json'),JSON.stringify({...original,session_id:'recover_failed'}));
 let failedOnce=false;
 await assert.rejects(()=>run(paid.map(x=>x==='recover_test'?'recover_failed':x),{skipBranch:true,base:tmp,invoke:async()=>{failedOnce=true;throw Error('simulated timeout');}}));checks++;
 ok(failedOnce,'failed request was attempted once');ok(!fs.existsSync(path.join(failFolder,'t0022-bx.json')),'no fabricated successful activity');ok(fs.existsSync(path.join(failFolder,'t0022-bx.recovery01.pending.json')),'failed recovery trace preserved');
 await assert.rejects(()=>run(paid.map(x=>x==='recover_test'?'recover_failed':x),{skipBranch:true,base:tmp,invoke:async()=>({raw:JSON.stringify(mockActivity),usage})}));checks++;
 const source=fs.readFileSync(new URL('./s62bfix1r54r-goldloop-web.mjs',import.meta.url),'utf8'),client=fs.readFileSync(new URL('./s62bfix1r54r-goldloop-client.js',import.meta.url),'utf8'),newRun=fs.readFileSync(new URL('./s62bfix1r54r-creative-run.mjs',import.meta.url),'utf8');
 for(const t of ['/api/creative-x-recover','NEW_X_CALL_OLD_X_BILLING_UNKNOWN','X_RECOVERY_RUNNER','creativeRecovery(t)'])ok(source.includes(t),'web endpoint '+t);
 for(const t of ['Recover with X only','original X call has UNKNOWN billing','/api/creative-x-recover'])ok(client.includes(t),'client action '+t);
 for(const t of ['JSON.stringify(t.A_brief??null)','callProviderExtended','timeoutMs:120000'])ok(newRun.includes(t),'new creative runner '+t);
 // Provider adapter mock validates timeout monitoring without network calls.
 const payload={model:'gpt-4.1-mini'};const resp=await callProviderExtended(payload,{url:'https://example.invalid/test',key:'not-real'},{timeoutMs:120000,fetchFn:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{}'},finish_reason:'stop'}],usage})})});ok(resp.raw==='{}','creative provider wrapper handles complete response');
 console.log(JSON.stringify({status:'ok',checks,paid_provider_calls:0,fixture_paid_calls_simulated:2,learner_session_writes:0,original_pending_immutable:true,new_X_only_recovery:true},null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
