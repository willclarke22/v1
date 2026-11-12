#!/usr/bin/env node
/** Offline-only reliability tests; no real provider calls and no DB writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {makePacket,runReview,SCHEMA} from './s16b61fix2-review.mjs';
const base=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../../..');
const traceFile=process.env.MYWAY_FIX2_TEST_TRACE ?? path.join(base,'.myway-patch-backups','learning-intelligence-reports','s16b61','fixture-test','trace.json');
let t;
if(fs.existsSync(traceFile))t=JSON.parse(fs.readFileSync(traceFile,'utf8'));
else{
 // Minimum self-contained example for CI/offline stage verifier (not a real report).
 const mk=(step,id,txt)=>({step,learner_id:'TEST',learner_observation_id:id,topic_id:'X12',topic_title:'Graphs',learner:txt,tutor:'Explain the graph.',probe_offered:null,probe:null,
 model_a:{observed_understanding:[],presenting_difficulty:'Rate vs total?',possible_underlying_causes:[{claim:'Maybe historically confused',support_ids:['H1'],counter_ids:[id]}],root_actions:[{action:'refine',observation_ids:['H1',id]}],relationship_actions:[]},retrieval:{A:{included_ids:[id,'H1']}}});
 t={schema:'myway_s16b61_longitudinal_v1',options:{visits:1,turnsPerVisit:3},summary:{steps:3,run_complete:true},cost:{calls:0},learner_histories:{TEST:{observations:[{id:'H1',text:'I confuse the slope with total.',source:'synthetic_curator_authored',topic_id:'X12'},...[1,2,3].map(i=>({id:'T'+i,text:'Actually, I know the slope is a rate.',source:'MODEL_L_REACTED_TO_ACTUAL_TUTOR',topic_id:'X12'}))]}},timeline:[1,2,3].map(i=>mk(i,'T'+i,'Slope is a rate, not the total.'))};
}
for(const step of t.timeline){const x=makePacket(t,step);assert.ok(x.input_bytes<=17500);for(const id of step.model_a?.root_actions?.flatMap(x=>x.observation_ids??[])??[])assert.ok(x.allowed_ids.includes(id),id);
 assert.ok(!JSON.stringify(x.packet).includes('private_fictional_state_not_truth'));}
const sample=t.timeline[0],allowed=makePacket(t,sample).allowed_ids;
const ok={assessment:'mixed',scientific_accuracy:'appears_correct',learner_current_understanding:'demonstrated_correct',root_inference:'overinterpreted',relationship_inference:'appropriate_abstention',teaching_quality:'responsive',probe_independence:'primed_by_teaching',strength:'Correct scientific distinction',concern:'Root support is overinterpreted',support_rationale:'Historical evidence existed.',counter_rationale:'New correct answer does not support current confusion',alternative_explanation:'A learner can have improved.',limitations:'Unscored simulated performance',evidence_ids:[allowed[0]],next_independent_check:'New independent transfer task.'};
assert.equal(Object.keys(ok).length,Object.keys(SCHEMA.properties).length);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'s61fix2-selftest-'));
try{
 let calls=0;const inject=async(req,step)=>{calls++;return {raw:JSON.stringify({...ok,evidence_ids:calls===1?['invented-id']:[JSON.parse(req.messages[1].content).evidence[0].id]}),usage:{prompt_tokens:350,completion_tokens:250,prompt_tokens_details:{cached_tokens:0}}};};
 const opts={mode:'model',model:'gpt-4.1-mini',limit:Math.min(3,t.timeline.length),allowSpend:true,budget:2,redoLegacy:true};
 const first=await runReview(t,opts,{invoke:inject,reportPath:tmp});
 assert.equal(first.reviews.filter(x=>x.validation==='failed').length,1);assert.equal(first.reviews.filter(x=>x.validation==='passed').length,opts.limit-1);
 assert.ok(first.reviews.find(x=>x.validation==='failed').errors.some(x=>x.includes('invalid_evidence_id')));
 const before=calls;const second=await runReview(t,opts,{invoke:inject,reportPath:tmp});
 assert.equal(calls,before+1,'Only one failed step should be re-reviewed');assert.equal(second.complete,true);assert.equal(second.full_fix2_coverage,true);
 assert.ok(fs.existsSync(path.join(tmp,'SIX_CAPABILITY_SCORECARD_FIX2_ALL.md')));
 const old={reviews:[{step:t.timeline[0].step,validation:'passed',assessment:'supported',evidence_ids:['H1']}]};
 const legacy=await runReview(t,{...opts,redoLegacy:false,mode:'offline',budget:0,allowSpend:false},{initialPrevious:old});
 assert.equal(legacy.reviews[0].validation,'legacy_unverified');
 assert.equal(legacy.ledger.calls,0);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('S61-FIX2 SELFTEST PASS: all cited evidence retained, independent verdict dimensions, invented IDs blocked, rejected review preserved, resume skips previously accepted calls, legacy labels marked unverified, zero real API/DB writes.');
