#!/usr/bin/env node
/** R4 free engineering checks; synthetic vectors and mock decisions are NOT educational gold standards. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run,parseArgs} from './s62bfix1r4-journey.mjs';
import {R4_OPPORTUNITIES,evidenceR4,forAssessmentR4,makeQualityReport,fidelityReview} from './s62bfix1r4-quality.mjs';
import {compileExperience,executePhase} from './s62bfix1r2-experience.mjs';
import {learnerView,normalizeAttempt} from './s62bfix1r3-evidence.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const reports=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r4');
const seed=String(process.pid),ids=[];
const fakeEmbed=async texts=>texts.map(t=>{const s=String(t),v=Array(64).fill(0);for(let i=0;i<s.length;i++)v[(s.charCodeAt(i)+i*17)%64]++;return v;});
assert.equal(R4_OPPORTUNITIES.length,6);
assert.throws(()=>parseArgs(['--mode','offline','--episodes','7']),/Invalid S62B configuration/);
assert.throws(()=>parseArgs(['--mode','model','--episodes','2']),/Paid mode requires/);
assert.equal(parseArgs(['--mode','plan']).episodes,6);
// Independent flags distinguish factual execution from cognition.
const b={teacher_response:'The inflow and outflow matter.',experience_proposal:{modality:'2d',setting:'Two symbolic valves',learner_task:'Compare inflow and outflow',possible_actions:['adjust both rates'],private_assessment_intent:'Check net-change reasoning'}};
const x={status:'compiled',reason:'test fixture',stages:[{instruction:'Set two rates',visible_scene:'Symbolic rates, not 2D rendering',controls:[{id:'inflow',kind:'slider',label:'Inflow',choices:[],min:0,max:10},{id:'outflow',kind:'slider',label:'Outflow',choices:[],min:0,max:10}],feedback_on_submit:'You set both values',hint_text:'Compare rates',reveal_next_on_submit:false}],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}};
const plan=compileExperience(b,x,{instanceKey:'r4test'}),view=learnerView(plan,0);
const raw={learner_utterance:'I think it fills',selected_actions:[{control:'inflow',operation:'set',value:'8'},{control:'outflow',operation:'set',value:'5'}],request_hint:false,declines:false};
const normalized=normalizeAttempt(raw,view),recorded=executePhase(plan,0,normalized.normalized_response,[]);
const obs=evidenceR4(plan,[{...recorded,phase:1}],{learner_id:'NORA',topic_id:'T02',observation_id:'test-ok',presented:[view],attempts:[{phase:1,raw_response:raw,normalized_response:normalized.normalized_response,accepted:true}],teacherResponse:b.teacher_response});
assert.equal('learner_cognitive_performance_verified' in obs.task_conditions,false);
assert.equal(obs.task_conditions.interaction_execution_verified,true);
assert.equal(obs.task_conditions.cognitive_understanding_verified_by_runtime,false);
assert.match(forAssessmentR4(obs).teaching_exposure_before_attempt,/inflow and outflow/);
assert.equal(fidelityReview(b,x,plan).review_status,'unscored_review_required');
const bad=evidenceR4(plan,[],{learner_id:'NORA',topic_id:'T02',observation_id:'test-failed',presented:[view],attempts:[{phase:1,raw_response:{...raw,selected_actions:[{control:'inflow',operation:'teleport',value:'99'}]},accepted:false,error:'technical'}],technicalFailure:{phase:1,error:'technical'},teacherResponse:b.teacher_response});
assert.equal(bad.task_conditions.interaction_execution_verified,false);
assert.equal(bad.task_conditions.cognitive_understanding_verified_by_runtime,false);
try{
 const runA='selftest_r4a_'+seed;ids.push(runA);
 const a=await run({mode:'offline',episodes:2,method:'semantic',runId:runA},{embedFn:fakeEmbed,suppressHtml:true});
 assert.equal(a.trace.complete,true,JSON.stringify(a.trace.failure));
 assert.equal(a.trace.timeline.length,2);
 assert(a.trace.timeline.every(t=>t.opening_L_raw&&t.opening_L_input.hidden_model_A_memory_not_supplied===true));
 assert(a.trace.timeline.every(t=>t.fidelity_review.review_status==='unscored_review_required'));
 assert(a.trace.timeline.every(t=>t.activity_evidence?.task_conditions?.cognitive_understanding_verified_by_runtime===false));
 assert.equal(a.trace.state.last_completed_episode,2);
 assert.equal(a.trace.cost.calls,0);
 assert.equal(fs.existsSync(path.join(a.dir,'QUALITY_REVIEW.json')),true);
 assert.equal(fs.existsSync(path.join(a.dir,'STATE.json')),true);
 const runB='selftest_r4b_'+seed;ids.push(runB);
 const z=await run({mode:'offline',episodes:4,method:'semantic',runId:runB,resumeFrom:runA},{embedFn:fakeEmbed,suppressHtml:true});
 assert.equal(z.trace.complete,true,JSON.stringify(z.trace.failure));
 assert.deepEqual(z.trace.timeline.map(x=>x.step),[3,4,5,6]);
 assert.equal(z.trace.state.last_completed_episode,6);
 assert(z.trace.lineage.previous_state_sha256);
 assert.equal(z.trace.state.learner_visible_history.length,6);
 assert(z.trace.state.observations.some(x=>x.id==='NORA-01-IN'));
 assert(z.trace.state.observations.some(x=>x.id==='NORA-06-OUT'));
 assert.equal(z.trace.state.semantic_index.provider,'injected_test_only');
 assert.equal(z.trace.summary.db_writes,0);
 const review=makeQualityReport(z.trace);
 assert.equal(review.educational_quality_scored,false);
 assert.equal(review.episodes.length,4);
 // A separate no-activity fixture verifies ordinary B conversation can still generate L evidence and A reassessment.
 const runChat='selftest_r4chat_'+seed;ids.push(runChat);
 const originalInvoke=(role,input)=>{
  if(role==='L'&&input.opening_request)return {raw:JSON.stringify({learner_utterance:'I have a question about that graph, and I may need another example.',selected_actions:[],request_hint:false,declines:false})};
  if(role==='L'&&input.conversation_reply_request)return {raw:JSON.stringify({learner_utterance:'I think the line could still be rising. Could we try a new example?',selected_actions:[],request_hint:false,declines:false})};
  if(role==='B')return {raw:JSON.stringify({teacher_response:'A rising line can be flattening. Let us talk about why.',experience_proposal:{modality:'none',setting:'No activity',learner_task:'',possible_actions:[],private_assessment_intent:'Conversation only'}})};
  if(role==='A')return {raw:JSON.stringify({observed:{kind:'question',evidence_ids:[input.current.id],demonstrated:'A question or conversation only',untested_or_incorrect:'Independent application untested',conditions:'Only ordinary dialogue observed'},interpretation:{hypotheses:[],uncertainty:'high',more_history_needed:null},memory_decisions:[],learner_brief_for_B:{current_understanding:'The learner is asking',remaining_uncertainty:'Not tested',relevant_history:'Unscored questions',possible_shared_root:null,teaching_response_evidence:'Conversation only'}})};
  throw Error('X should not be called for no activity');
 };
 const c=await run({mode:'offline',episodes:1,method:'semantic',runId:runChat},{invoke:originalInvoke,embedFn:fakeEmbed,suppressHtml:true});
 assert.equal(c.trace.complete,true,JSON.stringify(c.trace.failure));
 assert.equal(c.trace.timeline[0].execution.status,'no_activity');
 assert.equal(c.trace.timeline[0].post_a.valid,true);
 assert.equal(c.trace.timeline[0].activity_evidence.kind,'fictional_conversation_response');
 assert.equal(c.trace.summary.full_learning_loops_with_valid_post_assessment,0);
 assert.equal(c.trace.summary.conversation_only_replies,1);
 // Research review compares B→X; it does not claim or execute a B-only fidelity arm.
 console.log('S62B-FIX1R4 SELFTEST PASS | guided openings, factual evidence flags, 2+4 resume, semantic cache, no-activity conversation, B/X review, 0 API/DB calls; no quality scoring');
}finally{
 for(const id of ids){const d=path.join(reports,id);if(fs.existsSync(d))fs.rmSync(d,{recursive:true,force:true});}
}
