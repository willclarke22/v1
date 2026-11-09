#!/usr/bin/env node
/** No external calls or DB writes. Must pass before installing. */
import assert from 'node:assert/strict';
import {loadFixture} from './s16b58-fixture.mjs';
import {parseArgs} from './s16b58-journey.mjs';
import {prepareFixture,choosePair,checkValidity,independentCheck,guardRevision} from './s16b58r1-core.mjs';
import {runConsolidated} from './s16b58r1-journey.mjs';
const opts=(id,trial,mode='offline')=>parseArgs(['--mode',mode,'--limit',mode==='offline'?'12':'2','--learner-id',id,'--trial-id',trial,'--retrieval','lexical',...(mode==='model'?['--learner','model','--allow-spend','--budget-usd','0.40']:[])]);
for(const [id,trial] of [['LEARNER-A','T01'],['LEARNER-B','T02'],['LEARNER-A','T03'],['LEARNER-C','T04'],['LEARNER-A','T05'],['LEARNER-B','T06']]){
 const t=await runConsolidated(opts(id,trial),{rootCheck:false});
 assert.equal(t.summary.base_turns,12);assert.equal(t.summary.db_writes,0);assert.equal(t.summary.authoritative_memory_writes,0);
 assert.equal(t.trial_condition.roots_exposed,trial==='T05'||trial==='T06'?0:2);
 assert.equal(t.base.seed_audit.existing_learner_root_hypotheses,t.trial_condition.roots_exposed);
 assert.equal(t.base.public_history.length,6);assert.equal(t.summary.probe_offers,trial==='T04'?1:2,'vetted probe count');
 assert.equal(t.summary.probes_answered,trial==='T04'?1:2);assert.equal(t.summary.stopped,false,JSON.stringify(t.probe_events));
 assert.equal(t.learner_memory_review.relationship_writes,0);assert.equal(t.learner_memory_review.personalization_established,false);
 assert.ok(!JSON.stringify(t).includes('"knowledge_state"'));assert.ok(!JSON.stringify(t).includes('"rubric"'));
 assert.equal(t.base.state.roots.filter(x=>x.seeded).length,t.trial_condition.roots_exposed);
 if(trial==='T03'){assert.ok(t.summary.relationship_updates>=1,'chloroplast evidence should propose a learner-specific relationship review');assert.ok(t.probe_events[0].substitution,'a vetted substitution should be auditable');}
 if(trial==='T04')assert.equal(t.summary.invalid_probes,1,'unsupported transfer probe withheld');
}
const a=prepareFixture(loadFixture('LEARNER-A','T05')),b=prepareFixture(loadFixture('LEARNER-B','T06'));
assert.equal(a.trial.first_learner_message,b.trial.first_learner_message,'controlled same opening');
assert.equal(a.learner.provisional_root_hypotheses.length,0);assert.equal(b.learner.provisional_root_hypotheses.length,0);
const flawed={...loadFixture('LEARNER-A','T01').probes.find(x=>x.probe_id==='BIO01-P1'),prompt:'Three CO2 molecules make one glucose molecule with six carbon atoms. Explain why.'};
assert.equal(checkValidity(flawed,[]).valid,false,'known tutor-origin false premise must be blocked');
const vague={...loadFixture('LEARNER-A','T05').probes.find(x=>x.probe_id==='CHEM01-P1')};
assert.equal(checkValidity(vague,[]).valid,false,'underspecified unvetted probe withheld');
const f=loadFixture('LEARNER-A','T01'),probe=f.probes.find(x=>x.probe_id==='CHEM03-P1');
const good=independentCheck(probe,f.scenes,{accept:true,response:'Sunlight provides energy and CO2 gives carbon atoms; light does not donate carbon atoms.',selected_object_id:null});
assert.equal(good.scored,true);assert.equal(good.correct,null,'lexical screen NOT verified correct');
const bad=independentCheck(probe,f.scenes,{accept:true,response:'Sunlight gives carbon atoms.',selected_object_id:null});
assert.equal(bad.scored,false,'unverifiable natural answer must abstain, not declare wrong');
const refusal=independentCheck(probe,f.scenes,{accept:false,response:'Not now',selected_object_id:null});
assert.equal(refusal.status,'declined_not_failure');
const state={roots:[{id:'A-R1'}],relationships:[{id:'A-LR1'}]},response={response:'Light gives energy but carbon comes from CO2.'};
const valid={root_id:'A-R1',relationship_id:null,root_stance:'weakens',relationship_stance:'insufficient',evidence_quote:'carbon comes from CO2',interpretation:'A narrow item of evidence weakens the broad misconception hypothesis.',alternative_explanation:'The learner could be repeating a recent explanation.',next_teaching_move:'Test with a new example.'};
assert.equal(guardRevision(valid,response,good,state).accepted,true);
assert.equal(guardRevision({...valid,evidence_quote:'not spoken by learner'},response,good,state).accepted,false);
assert.equal(guardRevision({...valid,root_id:'ROOT_FAKE'},response,good,state).accepted,false);
assert.equal(guardRevision(valid,response,bad,state).accepted,false);
assert.equal(guardRevision({...valid,root_id:null,root_stance:'insufficient'},response,bad,state).accepted,true);
const sceneProbe=f.probes.find(x=>x.probe_id==='CHEM01-P2');
assert.equal(checkValidity(sceneProbe,f.scenes).valid,true);
assert.equal(independentCheck(sceneProbe,f.scenes,{accept:true,response:'I select CO2.',selected_object_id:'SCN01-O00'}).correct,true);
assert.equal(independentCheck(sceneProbe,f.scenes,{accept:true,response:'I select light.',selected_object_id:'SCN01-O02'}).correct,false);
// Mock provider: L can see the PRIVATE synthetic knowledge; A and B must not.
const usage={prompt_tokens:200,completion_tokens:70};let seen={A:0,B:0,C:0,L:0,revision:0,probeL:0,followup:0};
const send=async(req,_auth,role)=>{
 seen[role]++;const serial=JSON.stringify(req);
 if(role!=='L'){assert.ok(!serial.includes('private_synthetic_knowledge_state'));assert.ok(!serial.includes('private_synthetic_character'));assert.ok(!serial.includes('"knowledge_state"'));assert.ok(!serial.includes('"rubric"'));}
 const name=req.response_format?.json_schema?.name;
 if(name==='myway_s58r1_probe_learner'){seen.probeL++;assert.match(serial,/private_synthetic_knowledge_state/);return {raw:JSON.stringify({accept:true,response:'Light gives energy; CO2 supplies carbon atoms and sunlight does not donate carbon.',selected_object_id:null}),usage};}
 if(name==='myway_s58r1_revision'){seen.revision++;const input=JSON.parse(req.messages.at(-1).content);return {raw:JSON.stringify({root_id:'A-R1',relationship_id:null,root_stance:'weakens',relationship_stance:'insufficient',evidence_quote:'CO2 supplies carbon',interpretation:'Provisional evidence weakens this particular broad claim but is not causal proof.',alternative_explanation:'Could recall recently presented science facts.',next_teaching_move:'Ask a new prediction and explain reasoning.'}),usage};}
 if(name==='myway_s58r1_tutor_continuation'){seen.followup++;return {raw:JSON.stringify({reply:'How could we distinguish a source of energy from a source of matter in a different example?'}),usage};}
 if(role==='L')return {raw:JSON.stringify({learner:'I still wonder where the carbon atoms originate in photosynthesis.'}),usage};
 if(role==='B')return {raw:JSON.stringify({reply:'Light supplies energy, while carbon atoms originate in CO2. What reasoning would you use?'}),usage};
 if(role==='A'){let current=JSON.parse(req.messages.at(-1).content).current_learner_message;return {raw:JSON.stringify({kind:'new_or_continuing_difficulty',topic_label:'Photosynthesis',root_problem:'May confuse sources of matter with sources of energy',evidence_quote:current.slice(0,Math.min(70,current.length)),uncertainty:'medium'}),usage};}
 if(role==='C')return {raw:JSON.stringify({identity:'uncertain',anchor_id:null,rationale:'Evidence does not yet distinguish same underlying cause from alternatives.'}),usage};
 throw Error('Unexpected model '+name);
};
const model=await runConsolidated(opts('LEARNER-A','T01','model'),{rootCheck:false,send,credential:()=>({key:'MOCK',url:'https://invalid.example'})});
assert.equal(model.summary.stopped,false,JSON.stringify(model.probe_events));assert.equal(model.summary.probes_answered,2);
assert.ok(seen.A>0&&seen.B>0&&seen.C>0&&seen.L>0&&seen.revision===2&&seen.probeL===2&&seen.followup===1);
assert.ok(model.cost.additional.calls===5);assert.equal(model.summary.db_writes,0);
console.log('S58-R1 SELFTEST PASS: reused S58 runner; controlled T05/T06 same question and no prior roots; 12-turn offline A/B plus two probes; independent exact-scene scoring and conservative text abstention; invalid tutor premise held; evidence-anchored provisional revisions; private L-only state in mocked paid path; no provider/DB writes.');
