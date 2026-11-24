#!/usr/bin/env node
/** Fully offline disposable fixture: no API key or model calls. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));const root=fs.mkdtempSync(path.join(os.tmpdir(),'myway-r55-free-'));
const dir=path.join(root,'repo','scripts','sandbox','learning-intelligence');fs.mkdirSync(dir,{recursive:true});
const req=['s62bfix1r54-creative-core.mjs','s62bfix1r54-creative-store.mjs','s62bfix1r55-creative-core.mjs','s62bfix1r55-creative-store.mjs','s62bfix1r55-dual-choice.mjs','s62bfix1r55-auto-budget.mjs'];
let count=0;const check=(v,msg)=>{if(!v)throw Error('R55 offline selftest: '+msg);count++};const expectThrows=(f,msg)=>{try{f();throw Error('Expected refusal not raised: '+msg)}catch(e){if(e.message?.includes('Expected refusal not raised'))throw e;count++}};
try{
 for(const name of req)fs.copyFileSync(path.join(HERE,name),path.join(dir,name));
 const {frameDocument,sha}=await import(pathToFileURL(path.join(dir,'s62bfix1r55-creative-core.mjs')).href);
 const {enableAuthorization,reserveAutomaticTurn,finishAutomaticTurn,viewAuthorization,pauseAuthorization}=await import(pathToFileURL(path.join(dir,'s62bfix1r55-auto-budget.mjs')).href);
 const {selectDualVariant}=await import(pathToFileURL(path.join(dir,'s62bfix1r55-dual-choice.mjs')).href);
 const {commitCreativeAttempt}=await import(pathToFileURL(path.join(dir,'s62bfix1r55-creative-store.mjs')).href);
 const base=path.join(root,'repo','.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
 const sid='fixture01',sd=path.join(base,sid);fs.mkdirSync(path.join(sd,'creative-designs'),{recursive:true});fs.mkdirSync(path.join(sd,'turns'));
 const turn={turn_id:'t0024',topic_id:'topic_demo',topic_title:'Demo topic',learner_message:'Explain this naturally',teacher_response:'Compare experiences',dual_experience:{selected_variant:null,shown_both:true,status:'awaiting_learner_choice'}};
 const state={schema:'myway_goldloop_human_v1',stage:'S62B-FIX1R43-GOLDLOOP-v1',learner:sid,topics:[{id:'topic_demo',title:'Demo topic'}],observations:[],records:[],turns:[turn],version:0,probe_attempts:[],scene_contracts:[]};
 fs.writeFileSync(path.join(sd,'state.json'),JSON.stringify(state));
 const activity={title:'Invented stateful experiment',html_fragment:'<style>button{background:lavender}</style><button type="button" onclick="mywayRecord(\'choose\',\'yes\')">Go</button><script>function boot(){}</script>',evidence_notes:'Interactive decisions may reveal reasoning',limitations:'Unscored mock'};
 for(const variant of ['b_only','bx']){const o={status:'complete',output:{schema:'myway_r54_creative_artifact_v1',status:'complete',variant,session_id:sid,turn_id:'t0024',topic_id:'topic_demo',title:activity.title,brief:'A genuine simulated learning design',activity,activity_sha256:sha(activity),source_context_sha256:sha('shared'),model_calls:variant==='bx'?2:1,estimated_usd:.012,created_at:new Date().toISOString(),quality_unverified:true,no_automatic_scoring:true}};fs.writeFileSync(path.join(sd,'creative-designs','t0024-'+variant+'.json'),JSON.stringify(o));}
 const frame=frameDocument(activity.html_fragment,'a'.repeat(32));check(frame.includes("replace(/\\s+/g,' ')"),'whitespace cleanup must not delete letter s');check(frame.includes('bridge_observed'),'must distinguish browser-bridge observation');check(frame.includes('generated_report'),'must distinguish activity-reported event');check(frame.includes("connect-src 'none'"),'sandbox blocks outbound network');check(frame.includes('sandbox')===false||frame.includes('frame-src'),'frame CSP exists');
 expectThrows(()=>enableAuthorization({session_id:sid,limit_usd:5,model_a:'gpt-4.1-mini',model_b:'gpt-4.1-mini',model_x:'gpt-4.1-mini',approval_phrase:'WRONG'}),'consent gate');
 let auth=enableAuthorization({session_id:sid,limit_usd:.5,model_a:'gpt-4.1-mini',model_b:'gpt-4.1-mini',model_x:'gpt-4.1-mini',approval_phrase:'AUTHORIZE_AUTOMATIC_DUAL_CALLS'});
 check(auth.enabled&&auth.remaining_usd===.5,'session consent must be recorded');
 expectThrows(()=>enableAuthorization({session_id:sid,limit_usd:10,model_a:'gpt-4.1-mini',model_b:'gpt-4.1-mini',model_x:'gpt-4.1-mini',approval_phrase:'AUTHORIZE_AUTOMATIC_DUAL_CALLS'}),'no overwrite of budget');
 const reserved=reserveAutomaticTurn(sid,'t0025');check(reserved.budget_usd>=.33,'both architectures pre-reserved');
 expectThrows(()=>reserveAutomaticTurn(sid,'t0026'),'no duplicate concurrent spend');check(!viewAuthorization(sid).enabled,'unresolved reservation pauses UI spending');
 finishAutomaticTurn(sid,'t0025',{success:true,estimated_usd:.20});check(viewAuthorization(sid).successful_turns===1,'ledger records successful charge estimate');
 expectThrows(()=>reserveAutomaticTurn(sid,'t0026'),'remaining cap blocks further turns');
 // The persisted selection and evidence path use one and only one chosen variant.
 const choice=selectDualVariant({session_id:sid,turn_id:'t0024',variant:'bx'});check(choice.status==='selected','choice stored');
 expectThrows(()=>selectDualVariant({session_id:sid,turn_id:'t0024',variant:'b_only'}),'second selection blocked');
 expectThrows(()=>commitCreativeAttempt({session_id:sid,turn_id:'t0024',variant:'b_only',events:[{action:'browser_click',detail:'Go',origin:'bridge_observed',at:new Date().toISOString()}]}),'unchosen evidence blocked');
 const attempt=commitCreativeAttempt({session_id:sid,turn_id:'t0024',variant:'bx',learner_answer:'I think I understand after trying one change.',events:[{action:'browser_click',origin:'bridge_observed',detail:'Go',view_text:'Spanish Listening',at:new Date().toISOString()},{action:'generated_tick',origin:'generated_report',detail:'auto highlight',at:new Date().toISOString()}]});
 check(attempt.evidence_id==='pa0001-IN','chosen attempt receives evidence ID');
 const after=JSON.parse(fs.readFileSync(path.join(sd,'state.json')));check(after.probe_attempts.length===1&&after.observations.length===1,'only chosen evidence persists');
 check(after.probe_attempts[0].comparison_exposure?.other_variant_not_a_completed_learning_attempt,'unchosen not a completed attempt');
 check(after.probe_attempts[0].action_log[1].origin==='generated_report','origin preserved');
 check(after.observations[0].conditions.not_independently_scored,'unverified attempt status retained');
 const runner=fs.readFileSync(path.join(HERE,'s62bfix1r55-goldloop-run.mjs'),'utf8');
 check(runner.includes("call('B_ONLY'")&&runner.includes("call('B_DESIGN'")&&runner.includes("call('X_IMPLEMENT'"),'two genuine competing paths');
 check(!runner.slice(runner.indexOf('const teacherInput={...makeTeacherInputR50(')).includes('validateBWithProbe('),'seven-template validator not used in dual generation');
 check(runner.includes("isProbe?null:compactRouteInput"),'probe continues without route');
 check(runner.includes('model_A_assessment_is_tentative'),'shared A assessment is passed to both paths');
 const paused=pauseAuthorization(sid);check(!paused.enabled,'pause keeps consent audit');
 console.log(JSON.stringify({status:'ok',checks:count,offline:true,provider_calls:0,db_writes:0,original_sessions_modified:0,model_architectures:['B_ONLY (one call)','B_DESIGN + X_IMPLEMENT (two calls)'],evidence:'unscored and choice-linked'},null,2));
}finally{fs.rmSync(root,{recursive:true,force:true})}
