#!/usr/bin/env node
/** S57-R1: learner-facing offer/consent, scored retries, Model A-directed B continuation. Zero paid/provider/DB calls. */
import assert from 'node:assert/strict';
import {parseArgs,runStudy} from './s16b57r1-journey.mjs';
import {visibleOffer,validateDecision,teachingBrief,adaptationDisposition,eligibleForActivity} from './s16b57r1-loop.mjs';
import {scriptedAction} from './s16b57-activity.mjs';
const plan={offer:true,modality:'2d',title:'Compare proton gradients',learning_goal:'Place H+ markers in mitochondria and chloroplasts.',reason_for_activity:'Check compartment reasoning.',learner_instruction:'Place each proton marker and choose ATP synthase flow direction.',followup_question:'Can you predict what happens if flow stops?'};
assert.match(visibleOffer(plan),/Would you like to try/);assert.doesNotMatch(visibleOffer(plan),/rendered/);
assert.throws(()=>validateDecision({accept:'true',reason:'yes'}),/decision/);
assert.equal(eligibleForActivity({learner:'How do proton gradients compare in mitochondria?',sessionTurns:[{},{},{}],activityAlreadySeen:false}),true);
assert.equal(eligibleForActivity({learner:'Explain CO2 to me',sessionTurns:[{},{}],activityAlreadySeen:false}),false);
assert.equal(eligibleForActivity({learner:'Proton direction',sessionTurns:[{},{}],activityAlreadySeen:true}),false);
const opts=(profile)=>parseArgs(['--mode','offline','--limit','12','--activity-profile',profile]);
for(const profile of ['correct','needs-feedback','persistent-error','decline']){
 const t=await runStudy(opts(profile),{rootCheck:false});
 assert.equal(t.summary.stopped,false);assert.equal(t.summary.simulated_activities,1);assert.equal(t.summary.db_writes,0);
 const event=t.events.find(e=>e.activity);assert.equal(event.id,'J3-2');assert.ok(event.reply.includes('Would you like to try?'));
 assert.equal(event.activity.scene.renderer_status,'NOT_RENDERED_SIMULATED');
 assert.equal(event.activity.offer_decision.accept,profile!=='decline');
 assert.equal(t.state.activity_adaptations.length,1);assert.equal(t.state.personalization_hypotheses[0].status,'insufficient_evidence_for_stable_preference');
 const kind=t.state.activity_adaptations[0].disposition.kind;
 assert.equal(kind,({correct:'first_attempt_success','needs-feedback':'feedback_assisted_success','persistent-error':'remaining_task_errors','decline':'declined_no_penalty'})[profile]);
 assert.ok(t.events.find(e=>e.id==='J3-3').teaching_context);
 const b=teachingBrief(t.state.activity_observations[0]);assert.equal(b.preference_status,'NOT_ESTABLISHED');
 if(profile==='decline')assert.equal(b.accepted,false);
 if(profile==='needs-feedback')assert.equal(b.last_score,'4/4');
}
const usage={prompt_tokens:120,completion_tokens:60};
for(const [profile,wantConsent,wantFirst,wantKind] of [['needs-feedback',true,2,'feedback_assisted_success'],['decline',false,null,'declined_no_penalty']]){
 let actions=0,offer=0,continued=0,assessed=0;const displayed=[];
 const mock=async(req,_auth,role)=>{
  const name=req.response_format?.json_schema?.name??'';let result;
  if(name==='myway_s57_scene_plan')result=plan;
  else if(name==='myway_s57r1_offer_decision'){offer++;result={accept:wantConsent,reason:wantConsent?'Sounds worth trying.':'Please explain in words.'};}
  else if(name==='myway_s57_synthetic_activity'){actions++;result=scriptedAction(profile,actions);}
  else if(name==='myway_s57_activity_assessment'){assessed++;result={demonstrated_understanding:'Two correct first, then four after feedback.',remaining_uncertainty:'Unknown unaided recall.',cross_context_transfer:'Chloroplast had initial errors.',teaching_approach_hypothesis:'No causal preference inference.',next_teaching_move:'Ask for a fresh unaided prediction about gradients.',confidence:'low'};}
  else if(name==='myway_s57r1_adaptive_continuation'){
   continued++;const payload=JSON.parse(req.messages.at(-1).content);displayed.push(payload);
   if(wantConsent){assert.equal(payload.activity.next_teaching_move,'Ask for a fresh unaided prediction about gradients.');assert.equal(payload.activity.last_score,'4/4');assert.equal(payload.activity.attempts[0].correct,2);}
   else assert.equal(payload.activity.accepted,false);
   result={reply:'Thanks for trying. Could you predict what happens if the gradient disappears?'};
  }
  else if(role==='B')result={reply:'The proton gradient powers ATP synthase. What part is confusing?'};
  else if(role==='L')result={learner:'I am not sure whether the two compartments are arranged alike; could you explain the proton gradients?'};
  else if(role==='A'){
   const d=JSON.parse(req.messages.at(-1).content);const msg=d.current_learner_message;
   result={kind:'new_or_continuing_difficulty',topic_label:'chemiosmosis',root_problem:'unclear mechanism of proton gradient in organelles',evidence_quote:msg.slice(0,Math.min(80,msg.length)),uncertainty:'medium'};
  }else if(role==='C'){
   const d=JSON.parse(req.messages.at(-1).content);result={identity:'same',anchor_id:d.historical_candidates[0]?.id,rationale:'Ongoing question about a shared mechanism.'};
  }else throw Error('Unexpected mock '+role+' '+name);
  return {raw:JSON.stringify(result),usage};
 };
 const opt=parseArgs(['--mode','model','--limit','12','--retrieval','lexical','--learner','model','--activity-profile',profile,'--allow-spend','--budget-usd','0.40']);
 const t=await runStudy(opt,{rootCheck:false,credential:()=>({key:'MOCK',url:'https://invalid.example'}),send:mock});
 assert.equal(t.summary.stopped,false,JSON.stringify(t.events.filter(e=>e.stop)));assert.equal(t.summary.processed,12);
 assert.equal(offer,1);assert.equal(continued,1);assert.equal(t.summary.activity_adaptations,1);assert.equal(t.summary.db_writes,0);
 assert.equal(t.state.activity_adaptations[0].disposition.kind,wantKind);
 assert.equal(actions,wantConsent?2:0);assert.equal(assessed,wantConsent?1:0);
 assert.ok(t.events.find(e=>e.id==='J3-3').teaching_context);
 assert.equal(displayed.length,1);
}
// Model A failure is separately visible, but the tutor must continue, not silently call a failed assessment trustworthy.
const partial=adaptationDisposition({accepted:true,improvement_after_feedback:false,attempts:[{accepted:true,by_control:[{control_id:'chloroplast_pool',correct:false}]}]},null);
assert.equal(partial.kind,'remaining_task_errors');
console.log('S1.6B.5.7-R1 SELFTEST PASS: optional offer in visible dialogue, separate synthetic consent, distinct learner profiles, scored retries, Model A next move into Model B, persistent provisional memory, non-causal preference claims, zero provider/DB writes.');
