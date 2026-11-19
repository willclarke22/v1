#!/usr/bin/env node
/** Pure offline engineering fixtures; never used as expected cognitive answers in paid mode. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run,parseArgs} from './s62bfix1r3-journey.mjs';
import {retrieveR3} from './s62bfix1r3-retrieval.mjs';
import {learnerView,normalizeAttempt,evidenceR3} from './s62bfix1r3-evidence.mjs';
import {compileExperience,executePhase} from './s62bfix1r2-experience.mjs';
import {initialState} from './s62b-scenario.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r3');
const seed=String(process.pid);
const fakeEmbed=async texts=>texts.map(t=>{
 // Deterministic 64-dimensional engineering fixture, not semantic intelligence/real MiniLM.
 const s=String(t);const v=Array(64).fill(0);for(let i=0;i<s.length;i++){v[(s.charCodeAt(i)+i*17)%64]+=1;}return v;
});
assert.throws(()=>parseArgs(['--mode','offline','--retrieval','lexical']),/Invalid S62B configuration/);
assert.equal(parseArgs(['--mode','offline','--retrieval','semantic']).method,'semantic');
const state=initialState();
const current={id:'E-SELFTEST-CURRENT',topic_id:'T01',text:'Why does a slowing positive rate not necessarily mean falling storage?'};state.observations.push(current);
let calls=0;const embed=async t=>{calls++;return fakeEmbed(t)};
const packet=await retrieveR3(state,current,{embedFn:embed});
assert.equal(packet.coverage.embedding.provider,'injected_test_only');
assert.equal(packet.coverage.embedding.lexical_fallback,false);
assert(packet.coverage.embedding.embedded_now>0);
assert(packet.allowed_evidence_ids.includes(current.id));
assert(packet.memory_candidates.some(x=>x.id==='NORA-S-001'));
assert(packet.ranked_preview.length>0);
await retrieveR3(state,current,{embedFn:embed});
assert.equal(calls,1,'previously indexed texts should not be recomputed');
await assert.rejects(retrieveR3(initialState(),current,{embedFn:async()=>{throw Error('service unavailable')}}),/service unavailable/);
const proposal={teacher_response:'Try a water-control task.',experience_proposal:{modality:'2d',setting:'Two symbolic valves, no actual rendering',learner_task:'Set inflow and outflow; explain the predicted outcome.',possible_actions:['adjust two rates'],private_assessment_intent:'Listen to the reasoning'}};
const x={status:'compiled',reason:'symbolic controls',stages:[{instruction:'Set two rates.',visible_scene:'Textual valves only',controls:[{id:'inflow',kind:'slider',label:'Inflow',choices:[],min:0,max:10},{id:'outflow',kind:'slider',label:'Outflow',choices:[],min:0,max:10}],feedback_on_submit:'Values recorded',hint_text:'Compare both rates',reveal_next_on_submit:false}],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}};
const plan=compileExperience(proposal,x,{instanceKey:'r3self'});const view=learnerView(plan,0);
assert.equal(view.available_interactions[0].canonical_operation,'set_value');
const raw={learner_utterance:'I am guessing.',selected_actions:[{control:'inflow',operation:'set',value:'8'},{control:'outflow',operation:'set',value:'5'}],request_hint:false,declines:false};
const adapted=normalizeAttempt(raw,view);assert.equal(adapted.normalized_response.selected_actions[0].operation,'set_value');assert.equal(adapted.normalizations.length,2);assert.equal(raw.selected_actions[0].operation,'set');
const delivered=executePhase(plan,0,adapted.normalized_response,[]);
const good=evidenceR3(plan,[{...delivered,phase:1}],{learner_id:'NORA',topic_id:'T02',observation_id:'E-GOOD',presented:[view],attempts:[{phase:1,raw_response:raw,normalized_response:adapted.normalized_response,normalizations:adapted.normalizations,accepted:true}]});
assert.equal(good.task_conditions.observation_status,'executed_attempt');assert.equal(good.actual_activity.learner_attempts[0].raw_response.selected_actions[0].operation,'set');
assert(good.actual_activity.executed_events.some(x=>x.operation==='set_value'));assert.equal(good.actual_activity.real_2d_rendered,false);
const bad=evidenceR3(plan,[],{learner_id:'NORA',topic_id:'T02',observation_id:'E-FAILED',presented:[view],attempts:[{phase:1,raw_response:{...raw,selected_actions:[{control:'inflow',operation:'teleport',value:'99'}]},accepted:false,error:'unsupported operation'}],technicalFailure:{phase:1,error:'unsupported operation'}});
assert.equal(bad.task_conditions.technical_failure,true);assert.equal(bad.actual_activity.executed_events.length,0);assert.equal(bad.actual_activity.learner_attempts[0].accepted,false);assert.match(bad.compact_index_text,/Technical execution failure/);
const first='selftest_r3a_'+seed,second='selftest_r3b_'+seed;
const r1=await run({mode:'offline',episodes:2,method:'semantic',runId:first},{embedFn:fakeEmbed,suppressHtml:true});
assert.equal(r1.trace.complete,true,JSON.stringify(r1.trace.failure));assert.equal(r1.trace.timeline.length,2);assert.equal(r1.trace.state.last_completed_episode,2);
assert.equal(r1.trace.summary.full_learning_loops_with_valid_post_assessment,2);
assert.equal(r1.trace.cost.calls,0);assert.equal(r1.trace.state.events.length>0,true);
assert.equal(fs.existsSync(path.join(r1.dir,'STATE.json')),true);
const r2=await run({mode:'offline',episodes:2,method:'semantic',runId:second,resumeFrom:first},{embedFn:fakeEmbed,suppressHtml:true});
assert.equal(r2.trace.complete,true,JSON.stringify(r2.trace.failure));assert.deepEqual(r2.trace.timeline.map(x=>x.step),[3,4]);
assert.equal(r2.trace.state.last_completed_episode,4);assert.equal(r2.trace.lineage.previous_run_id,first);
assert(r2.trace.state.observations.some(x=>x.id==='NORA-01-OUT'));
assert(r2.trace.state.observations.some(x=>x.id==='NORA-04-IN'));
assert(r2.trace.state.semantic_index.vectors&&Object.keys(r2.trace.state.semantic_index.vectors).length>Object.keys(r1.trace.state.semantic_index.vectors).length);

// Integration test: a simulated learner emits an invalid action. A still sees the factual
// attempted interaction but must not mutate understanding solely from the interface error.
const techRunId='selftest_r3tech_'+seed;
const techReply=(kind,id)=>({observed:{kind:'question',evidence_ids:[id],demonstrated:'Only a request or an unexecuted interaction was observed.',untested_or_incorrect:'The interface did not establish performance.',conditions:'Fictional test with a technical action rejection.'},interpretation:{hypotheses:[],uncertainty:'high',more_history_needed:null},memory_decisions:kind==='post'?[{action:'revise',record_type:'root',target_id:'NORA-R-001',claim:'False post-tech evidence update should never apply.',topics:['T01'],possible_instances:[],evidence:[{id,role:'context'}],rationale:'Invalid assertion based only on interface error.',uncertainty:'low'}]:[],learner_brief_for_B:{current_understanding:'Question only.',remaining_uncertainty:'No independent evidence.',relevant_history:'Earlier unscored opening.',possible_shared_root:null,teaching_response_evidence:'None'}});
const simulatedInvoke=(role,input)=>{
 if(role==='A')return {raw:JSON.stringify(techReply(input.stage,input.current.id))};
 if(role==='B')return {raw:JSON.stringify(proposal)};
 if(role==='X')return {raw:JSON.stringify(x)};
 if(role==='L')return {raw:JSON.stringify({...raw,selected_actions:[{control:'inflow',operation:'teleport',value:'8'}]})};
 throw Error('Unexpected role');
};
const t=await run({mode:'offline',episodes:1,method:'semantic',runId:techRunId},{embedFn:fakeEmbed,invoke:simulatedInvoke,suppressHtml:true});
assert.equal(t.trace.complete,true,JSON.stringify(t.trace.failure));
const episode=t.trace.timeline[0];
assert.equal(episode.activity_evidence.task_conditions.technical_failure,true);
assert.equal(episode.activity_evidence.actual_activity.executed_events.length,0);
assert.equal(episode.activity_evidence.actual_activity.learner_attempts[0].accepted,false);
assert.equal(episode.post_a.valid,true);
assert.equal(episode.post_a.memory_changes.length,0);
assert(episode.post_a.rejected_memory_actions.some(x=>/Technical non-execution/.test(x.error)));
assert.equal(t.trace.summary.full_learning_loops_with_valid_post_assessment,0);
if(fs.existsSync(path.join(dir,techRunId)))fs.rmSync(path.join(dir,techRunId),{recursive:true,force:true});

const corrupt='selftest_r3corrupt_'+seed;
// no production state mutation; wrong run ID must fail before any write
await assert.rejects(run({mode:'offline',episodes:1,method:'semantic',runId:corrupt,resumeFrom:'nonexistent_r3_previous_run'},{embedFn:fakeEmbed,suppressHtml:true}));
for(const rid of [first,second]){const p=path.join(dir,rid);if(fs.existsSync(p))fs.rmSync(p,{recursive:true,force:true});}
console.log('S62B-FIX1R3 SELFTEST PASS | real-local-embedding contract with injected test vectors; cache and no fallback; safe event adaptation; technical failure evidence; 2+2 offline resume; A/B/X/L loop; zero API/DB');
