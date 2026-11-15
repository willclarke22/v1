#!/usr/bin/env node
/** Offline tests; deliberately synthetic plumbing only, not learner understanding grading. */
import assert from 'node:assert/strict';
import {diagnoseStep,chooseCases,parseArgs} from './s62a-diag1.mjs';
import {scriptedMock} from './s16b59-lean-core.mjs';
const old={id:'ELLI-test-T1',text:'I think the tank level falls when inflow slows',topic_id:'T1',source:'curator',task_conditions:'independent_opening_unscored'};
const curr={id:'ELLI-test-T2',text:'I calculated that the total keeps increasing',topic_id:'T1',source:'MODEL_L_REACTED_TO_ACTUAL_TUTOR',task_conditions:'independent_opening_unscored'};
const before={id:'ELLI-R-001',claim:'This learner confuses slowing inflow with falling accumulated amount',status:'provisional',support_ids:[old.id],counter_ids:[],revisions:[{version:1,action:'propose',source_event_id:old.id,observation_ids:[old.id]}]};
const after={...before,claim:'Potential verbal interpretation of slowing',support_ids:[old.id,curr.id],counter_ids:[curr.id],revisions:[...before.revisions,{version:2,action:'refine',source_event_id:curr.id,reason:'Verbal framing may be involved',observation_ids:[curr.id],counter_ids:[curr.id]}]};
const a={...scriptedMock('A',{}),observed_understanding:[{claim:'The learner computed accumulation',observation_ids:[curr.id]}],possible_underlying_causes:[{claim:'The cause might be a language heuristic',support_ids:[old.id],counter_ids:[curr.id],alternatives:['Graph mapping'],uncertainty:'medium'}],root_actions:[{existing_id:before.id,action:'refine',reason:'Updating hypothesis',observation_ids:[curr.id]}]};
const input={research_only:true,role:'A',learner_message:curr.text,allowed_observation_ids:[old.id,curr.id],context:{topics:[{id:'T1'}],roots:[before],observations:[old,curr]},recent_dialogue:[{tutor:'Let us calculate the total'}],probe_conditions:null};
const st={step:2,learner_id:'ELLI',case_id:'test',topic_id:'T1',learner_observation_id:curr.id,learner:curr.text,learner_source:curr.source,model_a:a,model_b:{reply:'Another example?'},model_inputs:{A:input},validation:[{type:'root',action:'refine',accepted:true,reason:'structural_reference_integrity_only'}],memory_changes:[{type:'root',id:before.id,version:2,action:'refine'}]};
const trace={learner_histories:{ELLI:{observations:[old,curr],roots:[after],relationships:[]}},timeline:[st]};
const dossier=diagnoseStep(trace,st,{hash:'fedcba9876543210',file:'/synthetic/trace.json'});
assert.equal(dossier.root_and_relationship_revisions[0].implied_bucket,'support_ids');
assert(dossier.structural_questions.some(x=>x.startsWith('REFINE_ASSIGNS_ACTION_CITATIONS_TO_SUPPORT')));
assert(dossier.structural_questions.some(x=>x.startsWith('COUNTEREVIDENCE_CITED_IN_SUPPORT_BUCKET')));
assert(dossier.structural_questions.includes('MODEL_L_FOLLOWUP_WITHOUT_PROBE_NOT_INDEPENDENCE_PROOF'));
assert.equal(dossier.independent_structural_recheck.matches_archived_checks,true);
assert.equal(dossier.input_coverage.unseen_historical_ids.length,0);
const chosen=chooseCases([dossier],15);assert.equal(chosen.length,1);
assert.equal(parseArgs(['--auto','--limit','8']).limit,8);
assert.throws(()=>parseArgs(['--auto','--limit','55']));
console.log('S62A-DIAG1 SELFTEST PASS | synthetic reducer-polarity, provenance, structural validation, deterministic selection, CLI; no model, network or DB calls');
