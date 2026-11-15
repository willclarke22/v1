#!/usr/bin/env node
/** No network/API/embedding or DB access; synthetic evidence contracts, not learner truth. */
import assert from 'node:assert/strict';
import {parseArgs} from './s62a-fix1b1-journey.mjs';
import {summarySafeForCitation,rejectionDetails,rehydratePriorState,EXPECTED_INITIAL_TRACE_SHA} from './s62a-fix1b1-resume.mjs';
assert.match(EXPECTED_INITIAL_TRACE_SHA,/^[a-f0-9]{64}$/);
const filtered=summarySafeForCitation([{source_observation_id:'OLD',demonstrated:[{claim:'Historical learning',observation_ids:['OLD','CURRENT']}],not_yet_demonstrated:[],conditions:'Coached',observations:[{kind:'strength',claim:'Correct evidence',observation_ids:['OLD']}],uncertainty:'medium'}],['CURRENT']);
assert.equal(filtered[0].source_observation_id,null);
assert.deepEqual(filtered[0].demonstrated[0].observation_ids,['CURRENT']);
assert.deepEqual(filtered[0].observations[0].observation_ids,[]);
const bad=rejectionDetails({step:21,attempt:0,error:Error('FIX1B invalid demonstrated evidence'),raw:JSON.stringify({current_understanding:{demonstrated:[{observation_ids:['FAKE','CURRENT']}]}}),allowed:['CURRENT'],input:{allowed_observation_ids:['CURRENT']}});
assert.deepEqual(bad.disallowed_observation_ids,['FAKE']);assert.equal(bad.step,21);
const event={step:20,learner_id:'RUNE',case_id:'S62-RUNE-V4',topic_id:'X17',topic_title:'Water',visit_turn:2,learner_observation_id:'RUNE-S62-RUNE-V4-T2',learner:'test answer',learner_source:'MODEL_L',tutor:'Can you explain?',probe:{question:'What do you think?'},model_l:{learner_message:'answer for T3'}};
const history={topic_visits:['S62-RUNE-V4'],observations:[{id:'RUNE-S62-RUNE-V4-T2',text:'test answer'},{id:'RUNE-S62-RUNE-V4-T3',text:'answer for T3'}],roots:[],relationships:[],learner_model_events:[],explicit_instructions:[],teaching_effects:[],memory_events:[]};
const reconstructed=rehydratePriorState(history,[event]);assert.equal(reconstructed.obs.length,1);assert.equal(reconstructed.dialogue[0].step,20);
assert.throws(()=>rehydratePriorState({...history,observations:[...history.observations,{id:'extra'}]},[event]),/exactly one/);
assert.throws(()=>parseArgs(['--mode','offline','--max-reference-corrections','2']),/at most one/);
console.log('S62A-FIX1B1 SELFTEST PASS | bounded citations, exact checkpoint reconstruction, detailed rejected evidence, correction limit; zero network/API/DB');
