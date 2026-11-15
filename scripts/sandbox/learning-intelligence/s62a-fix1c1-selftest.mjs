#!/usr/bin/env node
/** Pure no-provider validation checks; keeps invalid model actions invalid. */
import assert from 'node:assert/strict';
import {parseCoherence} from './s62a-fix1c-core.mjs';
import {parseLearnerFirst} from './s62a-fix1b-core.mjs';
import {optsParse} from './s62a-fix1c1-compare.mjs';
const x={current_understanding:{learner_intent:null,assessed_task:'fictional practice',demonstrated:[],task_conditions:'synthetic, not scientific',not_yet_demonstrated:[],uncertainty:'high'},learner_model_delta:{observations:[],underlying_cause_hypotheses:[],memory_actions:[],explicit_instructions:[],knowledge_actions:[]},next_teaching:{advisory:'',next_probe:{purpose:null,probe_type:null,separates_hypotheses:[]},request_more_context:{scope:null,why:null}}};
assert.equal(parseCoherence(x,['OBS'],[]).learner_model_delta.knowledge_actions.length,0);
const invalid=structuredClone(x);invalid.learner_model_delta.knowledge_actions=[{existing_id:'MICA-R-001',action:'revise',kind:'understanding',claim:'This is invalid because no learner knowledge record exists',rationale:'model conflates root ID with knowledge ID',uncertainty:'high',task_conditions:'synthetic',evidence_roles:[{id:'OBS',role:'support'}],confounds:[]}];
assert.throws(()=>parseCoherence(invalid,['OBS'],[]),/knowledge action target missing or wrong kind/);
const valid=structuredClone(invalid);valid.learner_model_delta.knowledge_actions[0].action='propose';valid.learner_model_delta.knowledge_actions[0].existing_id=null;
assert.equal(parseCoherence(valid,['OBS'],[]).learner_model_delta.knowledge_actions[0].action,'propose');
const old=structuredClone(x);old.current_understanding.presenting_question=null;delete old.current_understanding.learner_intent;delete old.current_understanding.assessed_task;delete old.learner_model_delta.knowledge_actions;
assert.equal(parseLearnerFirst(old,['OBS']).current_understanding.presenting_question,null);
assert.throws(()=>optsParse(['--frozen','x','--archive','y','--run']),/Paid resume requires/);
assert.throws(()=>optsParse(['--frozen','x','--archive','y','--run','--allow-spend','--budget-usd','15']),/Paid resume requires/);
console.log('S62A-FIX1C1 SELFTEST PASS | incorrect cross-collection targets remain invalid, valid proposals accepted, bounded payment opt-in, zero API/DB calls');
