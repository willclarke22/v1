#!/usr/bin/env node
/** Contract tests only. NO provider calls, no DB accesses, no writes to learner state. */
import assert from 'node:assert/strict';
import {MYWAY_TEACHING_CONTRACT,TEACHING_ACTIONS,LEARNER_INTENTS,INTEREST_USE_MODES} from './s16b4a-teaching-contract.mjs';
import {adaptExistingPersonalization,createTeachingContextEnvelope,validateTeachingPlan,validateExistingModelBOutput} from './s16b4a-interfaces.mjs';
const signal=(direction='prefer')=>({signal_id:'sig-1',kind:'presentation_style',value:'step_by_step',direction,scope:'topic',scope_key:'photosynthesis',preference_score:direction==='avoid'?-0.5:0.6,confidence:0.8,evidence_count:3,summary:'Synthetic profile fixture; not a real learner preference'});
const domain={domain:'soccer',preference_score:0.3,confidence:0.4,evidence_count:1,recent_use_count:3,scope:'global',scope_key:null,summary:'Synthetic interest with unproven teaching benefit'};
const p={schema_version:'personalization_profile_snapshot_v1',summary:'Synthetic educational test profile',teaching_signals:[signal('avoid')],example_domains:[domain]};
const profile=adaptExistingPersonalization({profile_snapshot:p,user_interests:[{interest:'soccer',user_interest_confidence:0.9}],preferred_style:'plain_direct',bridge_level:'bridge_1',jargon_level:'light'});
assert.equal(profile.source_schema,'personalization_profile_snapshot_v1');
assert.equal(profile.teaching_signals[0].direction,'avoid');
assert.equal(profile.teaching_signals[0].evidence_count,3);
assert.equal(profile.example_domains[0].recent_use_count,3);
assert.notEqual(profile.example_domains[0].confidence,profile.explicitly_provided_interests[0].user_interest_confidence,'Evidence confidence and stated interest confidence must not collapse');
assert.equal(profile.source_counts.signals,1);
assert.deepEqual(profile.omitted_counts,{signals:0,example_domains:0,explicit_interests:0});
p.summary='MODIFIED';assert.equal(profile.summary,'Synthetic educational test profile','Adapter must not alias original objects');
assert.throws(()=>adaptExistingPersonalization({profile_snapshot:{...p,schema_version:'personalization_profile_snapshot_v2'}}),/Invalid existing profile/);
assert.throws(()=>adaptExistingPersonalization({profile_snapshot:{...p,teaching_signals:[{...signal(),confidence:1.7}]}}),/confidence/);
assert.throws(()=>adaptExistingPersonalization({user_interests:['soccer']}),/Invalid explicit interest/);
assert.throws(()=>adaptExistingPersonalization({profile_snapshot:{...p,example_domains:[{...domain,scope:'topic',scope_key:undefined}]}}),/scope_key/);
const candidates=[
 {evidence_id:'t01',source:'historical_learner_statement',text:'I did not understand how light becomes ATP and NADPH.',turn_id:'T01',difficulty_id:'d-light',reason_for_consideration:'Earlier disputed interpretation',verified_as_learner_evidence:true},
 {evidence_id:'t07',source:'prior_teaching',text:'The Calvin cycle fixes CO2.',turn_id:'T07',reason_for_consideration:'Recent teaching',verified_as_learner_evidence:false}
];
const args={learner:{message:'I meant the Calvin cycle, but the earlier light-reaction question was genuine.',intent:'clarification_answer',turn_id:'T10A'},assessment:{topic:'Photosynthesis',root_problem:'How carbon becomes part of sugars',evidence_quote:'I meant the Calvin cycle'},state:{canonical_difficulty:{difficulty_id:'d-carbon',root_problem:'How the Calvin cycle fixes carbon'},pending_correction_id:'corr-1',reported_progress_note:'Reports understanding ATP formation; not independently demonstrated'},context_candidates:candidates,personalization:profile};
const envelope=createTeachingContextEnvelope(args);
assert.equal(envelope.schema_version,'myway_teaching_context_envelope_v1');
assert.equal(envelope.context_selection_status,'NOT_IMPLEMENTED_IN_4A');
assert.equal(envelope.context_candidates[0].evidence_id,'t01');
assert.equal(envelope.context_candidates[0].verified_as_learner_evidence,true);
assert.equal(envelope.context_candidates[1].verified_as_learner_evidence,false);
assert.equal(envelope.limits.ordinary_context_token_target,650);
assert.equal(envelope.limits.correction_context_token_ceiling,1200);
assert.equal(envelope.state.reported_progress_note.includes('not independently demonstrated'),true);
assert.throws(()=>createTeachingContextEnvelope({...args,context_candidates:[...candidates,candidates[0]]}),/Duplicate evidence_id/);
assert.throws(()=>createTeachingContextEnvelope({...args,limits:{ordinary_context_token_target:1400,correction_context_token_ceiling:800}}),/Correction budget/);
assert.throws(()=>createTeachingContextEnvelope({...args,learner:{...args.learner,intent:'unsupported_intent'}}),/Invalid learner.intent/);
const noProfile=createTeachingContextEnvelope({...args,personalization:null});assert.equal(noProfile.personalization,null);
const plan={schema_version:'myway_teaching_plan_v1',action:'close_clarification',objective:'Confirm both historical difficulties without repeating a lesson',reasoning_evidence_ids:['t01','t07'],personalization_decision:{chosen_interest:null,use_interest:'do_not_use',reason:'Interest is irrelevant to this correction',structural_mapping:null,anti_distortion_guard:'Do not mistake interests for evidence'},status:'PLANNED_UNTESTED'};
assert.equal(validateTeachingPlan(plan),true);
assert.throws(()=>validateTeachingPlan({...plan,personalization_decision:{...plan.personalization_decision,use_interest:'structural_bridge',chosen_interest:'soccer'}}),/structural_mapping/);
assert.throws(()=>validateTeachingPlan({...plan,personalization_decision:{...plan.personalization_decision,chosen_interest:'soccer'}}),/disabled/);
assert.equal(validateExistingModelBOutput({teaching_strategy:'Okay, that clarifies the earlier difference.',next_step:'We can focus on the carbon fixation mechanism.',visual_intent:'none'}),true);
assert.throws(()=>validateExistingModelBOutput({teaching_strategy:'Text',next_step:'Next',visual_intent:'none',extra:'not allowed'}),/shape drift/);
assert.throws(()=>validateExistingModelBOutput({teaching_strategy:'X'.repeat(621),next_step:'Next',visual_intent:'none'}),/Invalid Model B/);
assert.equal(TEACHING_ACTIONS.length,7);assert.equal(LEARNER_INTENTS.length,5);assert.deepEqual(INTEREST_USE_MODES,['structural_bridge','light_tone','do_not_use']);
assert.equal(MYWAY_TEACHING_CONTRACT.outputCompatibility.format,'myway_s15_shadow_model_v1');
assert.equal(MYWAY_TEACHING_CONTRACT.outputCompatibility.maxCharsPerField,620);
console.log('S1.6B.4A SELFTEST PASS: shared schema adapter, no inferred interests, evidence provenance, context envelope, explicit token targets, typed action and style contracts, unchanged compact Model B transport, no I/O or inference.');
