/** FREE R4.6 synthetic contract/evidence tests. No provider or embeddings. */
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {validateBWithProbe,emptyProbe,validateProbe,makeSceneContract,sceneCatalog,B_R46_SCHEMA} from './s62bfix1r46-probe-core.mjs';
import {commitProbeAttempt} from './s62bfix1r46-probe-store.mjs';
let count=0;const test=(label,fn)=>{fn();count++;console.log('PASS '+count+': '+label);};
const original=()=>({teaching_mode:'exploration',teaching_intent:'Find an intuitive model for counting repeated trials',beats:[{id:'b01',narration:'Imagine a marble machine where you can try again and again.',educational_purpose:'Concrete trial',visual_opportunity:'Marble machine',learner_action:''}]});
const p=(modality)=>({...emptyProbe(),offer:true,modality,purpose:'See whether the learner can apply a concept',prompt:'Try this question or activity with the controls below.',choices:['Binomial','Not binomial'],items:['First','Second','Third'],targets:['A','B','C'],variables:[{key:'chance',label:'Red probability',min:0,max:100,step:10,initial:50}],hint:'Consider whether each draw is independent.',scene_decision:'new',scene_reason:'First learner experience for this concept',novelty:'diagnostic'});
const b=(mod='choice')=>validateBWithProbe({...original(),probe_plan:p(mod)});
for(const modality of ['choice','prediction','manipulate','sequence','match','construct','explain'])test(modality+' schema valid',()=>{assert.equal(b(modality).probe_plan.modality,modality)});
test('no probe is valid',()=>assert.equal(validateBWithProbe({...original(),probe_plan:emptyProbe()}).probe_plan.offer,false));
test('malformed optional B probe falls back without failing narration',()=>{const v=p('choice');v.choices=['only one'];assert.equal(validateBWithProbe({...original(),probe_plan:v}).probe_plan.offer,false);});
test('strict B response schema includes optional probe plan',()=>assert.deepEqual(Object.keys(B_R46_SCHEMA.properties).sort(),['beats','probe_plan','teaching_intent','teaching_mode'].sort()));
const x={visual_concept:'A playful marble machine',continuity_plan:'Same apparatus throughout',moments:[{scene_description:'A red and blue marble machine on the table'}]};
const scene=makeSceneContract({scene_contracts:[]},'t0001',{id:'topic_stats'},b(),x);
test('scene preserves X storyboard and declares non-rendered status',()=>{assert.equal(scene.scene_id,'scene_t0001');assert.equal(scene.visuals_rendered,false);assert.equal(scene.source_turn_id,'t0001');});
test('reusing original scene ID retains continuity',()=>{const reuse=b('explain');reuse.probe_plan.scene_decision='reuse';reuse.probe_plan.reuse_scene_id='scene_t0001';const z=makeSceneContract({scene_contracts:[scene]},'t0002',{id:'topic_stats'},reuse,x);assert.equal(z.scene_id,scene.scene_id);assert.equal(z.scene_reuse,'reuse');});
test('no reuse across unrelated topics',()=>{const reuse=b('explain');reuse.probe_plan.scene_decision='reuse';reuse.probe_plan.reuse_scene_id='scene_t0001';assert.equal(makeSceneContract({scene_contracts:[scene]},'t0002',{id:'topic_other'},reuse,x).scene_id,'scene_t0002')});
test('scene catalog uses prior scene reference',()=>assert.equal(sceneCatalog({scene_contracts:[scene]},'topic_stats')[0].scene_id,'scene_t0001'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'myway-r46-free-'));
try{
 const session='testlearner',dir=path.join(tmp,session);fs.mkdirSync(path.join(dir,'turns'),{recursive:true});
 const state={schema:'myway_goldloop_human_v1',learner:session,version:0,topics:[{id:'topic_stats',title:'Stats'}],records:[],observations:[],scene_contracts:[],turns:[]};
 for(let i=0;i<7;i++){const turnId='t'+String(i+1).padStart(4,'0'),plan=p(['choice','prediction','manipulate','sequence','match','construct','explain'][i]);state.turns.push({turn_id:turnId,topic_id:'topic_stats',scene_contract_id:'scene_t0001',probe_plan:plan});}
 fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state));
 const payloads=[
  {selection:'Binomial',learner_answer:'Because trials are independent'},
  {learner_answer:'I predict 3 red outcomes',values:{chance:60}},
  {values:{chance:70},learner_answer:'I think this makes drawing red more common'},
  {ordered_items:['Third','First','Second'],learner_answer:'I grouped the events'},
  {matches:{First:'A',Second:'B',Third:'C'},learner_answer:'I compared the labels'},
  {selected_items:['First','Third'],learner_answer:'Selected a set of blocks'},
  {learner_answer:'The representation suggests repeated independent trials'}
 ];
 for(let i=0;i<7;i++){const turnId=state.turns[i].turn_id;const result=commitProbeAttempt({session_id:session,turn_id:turnId,status:'submitted',selection:'',ordered_items:[],matches:{},selected_items:[],values:{},hint_count:i===0?1:0,events:[{action:'click',detail:'Learner clicked one control',at:'2026-01-01T00:00:00Z'}],...payloads[i]},{outputDir:tmp});assert.equal(result.evidence_id,'pa'+String(i+1).padStart(4,'0')+'-IN');assert.equal(result.model_calls,0);}
 test('all seven modalities persisted as real unscored observations',()=>{const saved=JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8'));assert.equal(saved.observations.length,7);assert.equal(saved.probe_attempts.length,7);assert.ok(saved.observations.every(o=>o.conditions.not_independently_scored===true));});
 test('raw action log and hint exposure are retained',()=>{const z=JSON.parse(fs.readFileSync(path.join(dir,'probe-attempts','pa0001.json')));assert.equal(z.hints_requested,1);assert.equal(z.action_log.length,1);assert.equal(z.model_calls,0);});
 test('backup exists and input turn traces unchanged',()=>{assert.ok(fs.existsSync(path.join(dir,'probe-state-backups','pa0001-state-before.json')));assert.deepEqual(fs.readdirSync(path.join(dir,'turns')),[]);});
 test('skip is distinct from failure',()=>{const z=commitProbeAttempt({session_id:session,turn_id:'t0007',status:'skipped',hint_count:0,events:[]},{outputDir:tmp});assert.equal(z.status,'skipped');const saved=JSON.parse(fs.readFileSync(path.join(dir,'state.json')));assert.equal(saved.observations.at(-1).conditions.status,'voluntary_skip_not_failure');});
 test('reject unknown turn ID',()=>assert.throws(()=>commitProbeAttempt({session_id:session,turn_id:'t9999',status:'submitted'},{outputDir:tmp}),/Unknown completed turn/));
 test('reject non-offered probe',()=>{const state2=JSON.parse(fs.readFileSync(path.join(dir,'state.json')));state2.turns[0].probe_plan=emptyProbe();fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state2));assert.throws(()=>commitProbeAttempt({session_id:session,turn_id:'t0001',status:'submitted'},{outputDir:tmp}),/No structured B probe/);});
 test('reject manipulated input outside B variable bounds',()=>assert.throws(()=>commitProbeAttempt({session_id:session,turn_id:'t0002',status:'submitted',learner_answer:'hello',values:{chance:9999}},{outputDir:tmp}),/outside offered range/));
 test('reject malformed client event payload',()=>assert.throws(()=>commitProbeAttempt({session_id:session,turn_id:'t0002',status:'submitted',learner_answer:'hello',events:[{action:'x'.repeat(100),detail:'bad',at:'now'}]},{outputDir:tmp}),/event trail/));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log(JSON.stringify({status:'PASS',free_tests:count,provider_calls:0,embedding_calls:0,existing_user_sessions_modified:false},null,2));
