#!/usr/bin/env node
/** FIX1 strictly local QA: no model calls, embeddings or database writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packAssessmentInput,preparePartialRecovery,parseArgs} from './s62bfix1r42fix1-runtime.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const topics=Array.from({length:30},(_,i)=>({id:'T'+String(i+1).padStart(2,'0'),title:'Neutral topic '+i,status:'available'}));
const activity={schema:'myway_experience_observation_v1',activity_instance_id:'test-1',design_id:'test-2',requested_modality:'2d',delivered_modality:'symbolic_actions_only',real_2d_rendered:false,real_3d_rendered:false,real_audio_played:false,original_educational_task:'Explore a pattern and explain what happens',presented:Array.from({length:3},(_,i)=>({phase:i+1,instruction:'Observe a pattern '+i,visible_scene:'symbolic',available_interactions:Array.from({length:5},(_,j)=>({control_id:'c'+j,description:'Slider '+j,control_kind:'slider',value_format:'0 to 100',perceptual_caveat:'not rendered '+'.'.repeat(300)}))})),learner_attempts:[{phase:1,normalized_response:{learner_utterance:'I will change the rate and predict the outcome',selected_actions:[{control:'c1',operation:'set_value',value:'5'}],request_hint:false,declines:false},raw_response:{learner_utterance:'I will change the rate and predict the outcome'},accepted:true}],executed_events:[],results:[{phase:1,status:'submitted',objective_check:{kind:'not_independently_verified',value:null}}],feedback_delivered:[],technical_failure:null,observation_status:'symbolic_simulation_not_rendered',teacher_response_presented_before_attempt:'An explanation',cognitive_understanding_verified_by_runtime:false};
const observations=Array.from({length:18},(_,i)=>({id:'OBS'+i,topic_id:'T'+String(i%30+1).padStart(2,'0'),text:'Learner statement '+i+' '.repeat(1000),source:'learner_message',kind:'question',task_conditions:{independent_performance:false}}));
const packet={evidence:observations,allowed_evidence_ids:observations.map(x=>x.id)};
const input={stage:'post',current:{id:'CUR',topic_id:'T01',text:'I moved a slider'},activity_actual_evidence:activity,allowed_evidence_ids:['CUR',...packet.allowed_evidence_ids],observations,memory_candidates:[],coverage:{method:'semantic'},available_topics:topics,recent_dialogue:[{episode:1,learner:'abc',tutor:'example'},{episode:2,learner:'def',tutor:'example'},{episode:3,learner:'ghi',tutor:'example'}]};
const sourceJSON=JSON.stringify(input);
const packed=packAssessmentInput(input,packet);
assert.equal(JSON.stringify(input),sourceJSON,'source input must remain unchanged');
assert.ok(Buffer.byteLength(JSON.stringify(packed.input))<=30000,'bounded input');
assert.equal(packed.input.current.id,'CUR');
assert.equal(packed.packing.exact_current_observation_preserved,true);
assert.ok(packed.input.coverage.context_packing,'explicit coverage/omissions required');
assert.ok(packed.packet.allowed_evidence_ids.every(id=>id==='CUR'||packed.input.observations.some(x=>x.id===id)));
assert.throws(()=>parseArgs(['--lab','journey','--mode','plan','--recover-partial','abc','--resume-from','other','--visits','1','--run-id','x']),/RecoverPartial/);
const source=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42','journeys','r42_atlas_paid_next6_budget210','TRACE.json');
if(fs.existsSync(source)){
 const s=preparePartialRecovery('r42_atlas_paid_next6_budget210');
 assert.equal(s.state.visit_count,8);assert.equal(s.original.model_calls,46);assert.equal(s.pending_entry.visit,8);
 assert.equal(s.original.failure.phase,'A:post');assert.equal(s.entries.filter(x=>x.post_a?.valid).length,5);
}
console.log('S62B-FIX1R42FIX1 SELFTEST PASS | bounded provenance, no replay, no provider/DB');
