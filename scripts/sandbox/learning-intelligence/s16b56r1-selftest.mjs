#!/usr/bin/env node
/** S56-R1 behavior tests: evidence & model decisions, not synthetic expected semantic correctness. */
import assert from 'node:assert/strict';
import {parseArgs,runStudy,validateCWithoutLabelGate} from './s16b56r1-journey.mjs';
const candidate=[{id:'past-root',topic_label:'photosynthesis'}];
const long='The present question asks how ATP and NADPH are used to change intermediates in the Calvin cycle; the earlier hypothesis asks where carbon atoms originate. These questions may be connected within photosynthesis without representing the same specific conceptual difficulty. A distinct root is defensible here, although the learner may have linked the questions in their own mental model.';
assert.ok(long.length>350&&long.length<2000,`unexpected rationale fixture length: ${long.length}`);
const accepted=validateCWithoutLabelGate({identity:'distinct',anchor_id:null,rationale:long},candidate);
assert.equal(accepted.guard.action,'accepted','valid long C explanation must not be rejected for >350 characters');
assert.equal(accepted.decision.identity,'distinct');
assert.equal(validateCWithoutLabelGate({identity:'same',anchor_id:'invented',rationale:'same'},candidate).guard.reason,'unknown_or_missing_historical_anchor');
assert.equal(validateCWithoutLabelGate({identity:'distinct',anchor_id:'past-root',rationale:'no'},candidate).guard.reason,'nonmatching_anchor_for_identity');
assert.equal(validateCWithoutLabelGate({identity:'uncertain',anchor_id:null,rationale:'a'.repeat(2001)},candidate).guard.action,'hold','large input hygiene bound remains');

const opt=(n)=>parseArgs(['--mode','model','--limit',String(n),'--history','resumed','--retrieval','lexical','--allow-spend','--budget-usd','0.40']);
const fake=(interpret)=>async(req,_credentials,role)=>{
 const usage={prompt_tokens:100,completion_tokens:50};
 if(role==='B')return {raw:JSON.stringify({reply:'Carbon comes from CO2. Could you tell me how you understand this?'}),usage};
 if(role==='A'){
  const msg=JSON.parse(req.messages.at(-1).content).current_learner_message;
  return {raw:JSON.stringify({kind:'new_or_continuing_difficulty',topic_label:'photosynthesis',root_problem:'uncertainty about the roles of sunlight and carbon in glucose',evidence_quote:msg.slice(0,Math.min(95,msg.length)),uncertainty:'medium'}),usage};
 }
 if(role==='C'){
  const data=JSON.parse(req.messages.at(-1).content),id=data.historical_candidates[0].id;
  return {raw:JSON.stringify(interpret(id)),usage};
 }
 throw Error('Unexpected role '+role);
};
const deps={rootCheck:false,credential:()=>({key:'TEST',url:'https://example.invalid'})};
const same=await runStudy(opt(6),{...deps,send:fake(id=>({identity:'same',anchor_id:id,rationale:'The learner revisits the same carbon/sunlight distinction.'}))});
assert.equal(same.summary.processed,6);assert.equal(same.summary.stopped,false);assert.equal(same.cost.byRole.B,6);
assert.equal(same.summary.guard_rejections,0);assert.equal(same.summary.held_turns,0);
assert.deepEqual(same.events[1].retrieval_for_tutor.candidates[0].observation_turn_ids,['J1-1'],'J1-2 saved retrieval must not show later observation IDs');
assert.deepEqual(same.events[1].retrieval_for_C.candidates[0].observation_turn_ids,['J1-1'],'C retrieval must also be frozen');
assert.ok(same.state.roots[0].observation_turn_ids.length>=6,'live state should continue to accumulate evidence');
assert.equal(same.events[1].retrieval_for_tutor.candidates[0].observation_turn_ids.length,1,'earlier snapshot cannot be changed by later turns');
const distinct=await runStudy(opt(2),{...deps,send:fake(()=>({identity:'distinct',anchor_id:null,rationale:long}))});
assert.equal(distinct.summary.provisional_roots,2,'valid C distinct should create a provisional root');
assert.equal(distinct.events[1].model_c_guard.action,'accepted');
assert.equal(distinct.summary.guard_rejections,0);assert.equal(distinct.summary.held_turns,0);
const invalid=await runStudy(opt(2),{...deps,send:fake(()=>({identity:'same',anchor_id:null,rationale:'No exact root identifier provided.'}))});
assert.equal(invalid.events[1].model_c_guard.action,'hold');
assert.equal(invalid.summary.guard_rejections,1);assert.equal(invalid.summary.held_turns,1);
assert.equal(invalid.summary.transient_held_turns,1);assert.equal(invalid.summary.unresolved_identity_holds,0);
assert.deepEqual(invalid.summary.guard_rejection_reasons,{unknown_or_missing_historical_anchor:1});
assert.equal(invalid.summary.holds,0,'legacy holds counts unresolved state holds, not transient software rejections');
const uncertain=await runStudy(opt(2),{...deps,send:fake(()=>({identity:'uncertain',anchor_id:null,rationale:'Insufficient evidence for root identity.'}))});
assert.equal(uncertain.summary.held_turns,1);assert.equal(uncertain.summary.unresolved_identity_holds,1);
assert.equal(uncertain.summary.transient_held_turns,0);assert.equal(uncertain.summary.guard_rejections,0);
const offline=await runStudy(parseArgs(['--mode','offline','--limit','12','--history','resumed','--retrieval','lexical']),{rootCheck:false});
assert.equal(offline.summary.processed,12);assert.equal(offline.cost.calls,0);assert.equal(offline.summary.db_writes,0);
assert.equal(offline.summary.guard_rejections,0);
console.log('S1.6B.5.6-R1 SELFTEST PASS: C rationale >350 accepted, exact-anchor rules retained, genuine unresolved holds separated from transient guard rejections, immutable historical retrieval snapshots, 12 offline turns, no paid/DB calls.');
