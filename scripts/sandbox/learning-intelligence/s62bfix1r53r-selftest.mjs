#!/usr/bin/env node
/** No network, model calls, DB writes, state files or Git operations. */
import {parseArgs,deriveCRevision,applyWholeBeatReplacements} from './s62bfix1r53r-c-guided-retry.mjs';
import {emptyProbe} from './s62bfix1r46-probe-core.mjs';
const assert=(x,m)=>{if(!x)throw Error(m);checks++;};
const throws=(f,m)=>{let bad=false;try{f();}catch{bad=true;}assert(bad,m);};
let checks=0;
const c={learner_report:'I got lost on the diagram',reported_experience_not_diagnosis:true,hypotheses:[{possibility:'Diagram too abstract',observed_evidence:'Learner highlighted diagram',uncertainty:'May be another reason'}],revision_scope:'X',reason:'Try a concrete scene',preserve:['B text'],reconsider:['X metaphor'],probe_impact:'uncertain',evidence_needed:'Compare learner response',uncertainty:'Unverified'};
const beats=[{id:'b01',narration:'Initial explanation about an example.',educational_purpose:'Purpose',visual_opportunity:'Sketch',learner_action:''},{id:'b02',narration:'Second explanation about consequences.',educational_purpose:'Purpose',visual_opportunity:'Sketch',learner_action:''}];
const b={teaching_mode:'explanation',teaching_intent:'Teach something useful',beats,probe_plan:{...emptyProbe(),offer:true,modality:'explain',purpose:'Explore understanding',prompt:'Explain your answer to this question',scene_decision:'reuse',reuse_scene_id:'scene_t0001',scene_reason:'Reuse',novelty:'diagnostic'}};
const t={B_output:b,probe_plan:b.probe_plan};const fb={selections:[{beat_id:'b01',surface:'visual',reason:'lost',excerpt:'initial'}]};
const a=deriveCRevision({turn:t,feedback:fb,c});assert(a.route==='X','X plan');assert(a.affected.join(',')==='b01','affected selected');assert(a.needs_probe_review,'unsure probe needs review');
const all=deriveCRevision({turn:t,feedback:fb,c,scope:'all'});assert(all.affected.length===2,'all beats explicit');
const bc={...c,revision_scope:'B_and_X',probe_impact:'keep'};const d=deriveCRevision({turn:t,feedback:fb,c:bc});assert(d.route==='B_X','B plus X');assert(!d.needs_probe_review,'compatible plan keeps probe');
const no={...c,revision_scope:'clarify'};assert(deriveCRevision({turn:t,feedback:fb,c:no}).route==='NOT_APPLICABLE','clarify no auto change');
const withOnlyOne=applyWholeBeatReplacements(b,['b01'],[{beat_id:'b01',narration:'A completely revised explanation without a broken text join.'}]);
assert(withOnlyOne.beats[0].narration!==beats[0].narration,'revised full beat');assert(withOnlyOne.beats[1].narration===beats[1].narration,'unaffected beat unchanged');assert(b.beats[0].narration===beats[0].narration,'original untouched');
throws(()=>applyWholeBeatReplacements(b,['b01'],[]),'missing rewrite rejected');throws(()=>applyWholeBeatReplacements(b,['b01'],[{beat_id:'b02',narration:'Wrong beat replacement.'}]),'wrong beat rejected');throws(()=>applyWholeBeatReplacements(b,['b01'],[{beat_id:'b01',narration:'tiny'}]),'short rewrite rejected');throws(()=>deriveCRevision({turn:t,feedback:fb,c:{...c,revision_scope:'medical_diagnosis'}}),'unknown C scope rejected');
let parsed=parseArgs(['--session-id','test','--feedback-id','fb0001']);assert(parsed.mode==='preview'&&!parsed.allow,'preview free');throws(()=>parseArgs(['--mode','retry','--session-id','test','--feedback-id','fb0001']),'paid approval required');throws(()=>parseArgs(['--mode','preview','--session-id','test','--feedback-id','fb0001','--allow-spend']),'preview cannot pay');throws(()=>parseArgs(['--mode','retry','--session-id','test','--feedback-id','fb0001','--allow-spend','--budget-usd','100']),'excessive budget rejected');throws(()=>parseArgs(['--mode','retry','--session-id','test','--feedback-id','fb0001','--allow-spend','--budget-usd','0.2','--scope','unknown']),'unknown scope rejected');
console.log(JSON.stringify({ok:true,checks,model_calls:0,embedding_calls:0,db_writes:0,no_history_written:true,what_tested:'advisory C scope, probe invalidation, whole-beat revisions, immutable unselected content, paid/free separation'}));
