#!/usr/bin/env node
/** S57: test contract, independent scoring, dialogue continuation, opt-out, real-model mocks. */
import assert from 'node:assert/strict';
import {compileScene,scriptedAction,gradeAction,feedbackFor,compactEvidence,validateAction,publicScene} from './s16b57-activity.mjs';
import {parseArgs,runStudy} from './s16b57-journey.mjs';
const plan={offer:true,modality:'3d',title:'Compare gradients',learning_goal:'Place protons and trace ATP synthase flow across two organelles.',reason_for_activity:'Compare structural transfer.',learner_instruction:'Place H+ markers and choose flow paths.',followup_question:'What was shared?'};
const scene=compileScene(plan,'J3-2');assert.equal(scene.schema,'myway_s57_scene_contract_v1');assert.equal(scene.canvas.camera.projection,'perspective');assert.equal(scene.nodes.length,8);assert.equal(scene.controls.length,4);assert.equal(scene.interaction_protocol.allowed_transitions.length,6);
assert.ok(!JSON.stringify(publicScene(scene)).includes('mito_inter_membrane\":\"'), 'synthetic learner scene must not expose private scoring map');
const first=gradeAction(scriptedAction('needs-feedback',1),scene,1),second=gradeAction(scriptedAction('needs-feedback',2),scene,2);
assert.equal(first.correct,2);assert.equal(second.correct,4);assert.ok(feedbackFor(first).includes('chloroplast'));
const evidence=compactEvidence(scene,[first,second]);assert.equal(evidence.improvement_after_feedback,true);assert.equal(evidence.stable_preference,'NOT_ESTABLISHED');assert.equal(evidence.causal_effect_of_visual,'NOT_ESTABLISHED_NO_CONTROL');
assert.equal(gradeAction(scriptedAction('decline',1),scene,1).accepted,false);
assert.throws(()=>validateAction({...scriptedAction('correct',1),chloroplast_pool:'invalid'},scene),/not allowed/);
for(const profile of ['needs-feedback','correct','persistent-error','decline']){
 const o=parseArgs(['--mode','offline','--limit','12','--activity-profile',profile]);
 const t=await runStudy(o,{rootCheck:false});assert.equal(t.summary.processed,12);assert.equal(t.summary.stopped,false);assert.equal(t.cost.calls,0);assert.equal(t.summary.db_writes,0);assert.equal(t.summary.simulated_activities,1);
 const a=t.events.find(e=>e.id==='J3-2').activity;assert.equal(a.scene.renderer_status,'NOT_RENDERED_SIMULATED');assert.equal(a.scene.modality,'2d');
 assert.equal(t.state.activity_observations.length,1);assert.equal(t.state.personalization_hypotheses[0].status,'insufficient_evidence_for_stable_preference');
 assert.equal(t.state.learner_relationship_hypotheses.length,profile==='decline'?0:1);
 assert.equal(a.activity_evidence.accepted,profile!=='decline');
 if(profile==='needs-feedback')assert.equal(a.activity_evidence.improvement_after_feedback,true);
 if(profile==='persistent-error')assert.equal(a.activity_evidence.improvement_after_feedback,false);
 assert.ok(t.events.find(e=>e.id==='J3-3').teaching_context,'subsequent conversation must continue');
}
const off=await runStudy(parseArgs(['--mode','offline','--limit','12','--activity','off']),{rootCheck:false});assert.equal(off.summary.simulated_activities,0);assert.equal(off.summary.visual_proposals,1,'legacy no-render scene intent retains independent behavior');
assert.throws(()=>parseArgs(['--mode','model','--learner','model','--activity-profile','correct','--allow-spend','--budget-usd','0.40']),/require --activity-profile adaptive/);
const usage={prompt_tokens:120,completion_tokens:60};
let attemptedScene=0,attemptedAction=0;
const mock=async(request,_context,role)=>{
 const name=request?.response_format?.json_schema?.name??'';let result;
 if(name==='myway_s57_scene_plan'){attemptedScene++;result=plan;}
 else if(name==='myway_s57_synthetic_activity'){attemptedAction++;result=scriptedAction('needs-feedback',attemptedAction===1?1:2);}
 else if(name==='myway_s57_activity_assessment')result={demonstrated_understanding:'Two parts correct first; four after feedback.',remaining_uncertainty:'Long-term retention untested.',cross_context_transfer:'Mitochondria correct, chloroplast initially wrong.',teaching_approach_hypothesis:'Single visual task cannot establish preference.',next_teaching_move:'Ask for a verbal explanation.',confidence:'medium'};
 else if(role==='B')result={reply:'Explain why protons are directed through ATP synthase, then try another case.'};
 else if(role==='L')result={learner:'I am wondering whether the same proton rule applies in chloroplasts and mitochondria. Can you explain?'};
 else if(role==='A'){
  const data=JSON.parse(request.messages.at(-1).content),msg=data.current_learner_message;
  result={kind:'new_or_continuing_difficulty',topic_label:'chemiosmosis',root_problem:'question about proton gradients and ATP synthase in organelles',evidence_quote:msg.slice(0,Math.min(90,msg.length)),uncertainty:'medium'};
 } else if(role==='C'){
  const data=JSON.parse(request.messages.at(-1).content);result={identity:'same',anchor_id:data.historical_candidates[0]?.id,rationale:'The learner continues exploring similar proton mechanisms.'};
 }else throw Error('Unexpected mock role '+role+' '+name);
 return {raw:JSON.stringify(result),usage};
};
const paidOpts=parseArgs(['--mode','model','--limit','12','--history','resumed','--retrieval','lexical','--learner','model','--activity-profile','adaptive','--allow-spend','--budget-usd','0.40']);
const paid=await runStudy(paidOpts,{rootCheck:false,credential:()=>({key:'MOCK',url:'https://invalid.example'}),send:mock});
assert.equal(paid.summary.stopped,false,JSON.stringify(paid.events.filter(e=>e.stop)));assert.equal(paid.summary.processed,12);assert.equal(attemptedScene,1);assert.equal(attemptedAction,2);
assert.equal(paid.events.find(e=>e.id==='J3-2').activity.assessment_status,'real_model_validated_unscored');assert.equal(paid.summary.simulated_activities,1);assert.ok(paid.cost.byRole.A>12);assert.ok(paid.cost.byRole.B>12);assert.equal(paid.summary.db_writes,0);assert.ok(paid.events.find(e=>e.id==='J3-3').teaching_context);
console.log('S1.6B.5.7 SELFTEST PASS: renderer-ready 2D/3D scene topology, actions, independent key, correction/decline/no-gain branches, model B/L/A mocks and subsequent teaching, provisional learner relations/preferences, no DB/provider calls.');
