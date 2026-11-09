#!/usr/bin/env node
import assert from 'node:assert/strict';
import {parseArgs,loadScenario,runStudy,validateCWithoutLabelGate,admissionEstimate} from './s16b56-journey.mjs';
import {createState,createObservation,retrieve,contextForB,scenarioCheck,observeIntent,recordCommitment} from './s16b56-core.mjs';
const scenario=loadScenario();assert.equal(scenarioCheck(scenario).sessions.length,3);
assert.throws(()=>parseArgs(['--mode','model']),/Paid run/);
assert.throws(()=>parseArgs(['--mode','offline','--allow-spend']),/Offline/);
assert.ok(admissionEstimate(9,'model')>admissionEstimate(9,'scripted'));
const candidate=[{id:'existing-root',topic_label:'Photosynthesis - carbon fixation',first_quote:'where carbon comes from',root_problem:'Confuses carbon atoms with sunlight'}];
assert.deepEqual(validateCWithoutLabelGate({identity:'same',anchor_id:'existing-root',rationale:'Same underlying issue'},candidate).guard.action,'accepted');
assert.equal(validateCWithoutLabelGate({identity:'same',anchor_id:'fabricated',rationale:'No anchor'},candidate).decision,null);
assert.equal(validateCWithoutLabelGate({identity:'distinct',anchor_id:'existing-root',rationale:'No'},candidate).guard.action,'hold');
const offline=await runStudy(parseArgs(['--mode','offline','--limit','12','--history','resumed']),{rootCheck:false});
assert.equal(offline.summary.processed,12);assert.equal(offline.summary.stopped,false);
assert.equal(offline.summary.sessions,3);assert.equal(offline.cost.calls,0);assert.equal(offline.summary.db_writes,0);
assert.equal(offline.events[4].teaching_context.older_raw_messages_exposed,0);
assert.ok(offline.events[4].teaching_context.retrieved_root_ids.length>=1);
assert.equal(offline.summary.evidence,12);assert.ok(offline.state.commitments.some(x=>x.status==='question_delivered_not_yet_answered'));
assert.ok(offline.state.visuals.every(v=>!v.rendered));
const full=await runStudy(parseArgs(['--mode','offline','--limit','12','--history','full']),{rootCheck:false});
assert.equal(full.summary.processed,12);assert.equal(full.events[4].teaching_context.older_raw_messages_exposed,8);
// Local MiniLM requests are mocked with the documented 384D response contract.
const st=createState();st.topics.push({id:'topic',label:'Photosynthesis'});st.roots.push({id:'root',topic_id:'topic',root_problem:'Where does carbon in glucose come from?',first_quote:'where is the carbon',source_turn:'Z',observation_turn_ids:[]});
let embeddingCalls=0;const semantic=await retrieve(st,'source of carbon atoms in sugar',{method:'semantic',request:async(url,opts)=>{embeddingCalls++;assert.equal(url,'http://127.0.0.1:8001/embed');const q=JSON.parse(opts.body);assert.equal(q.texts.length,2);return {ok:true,json:async()=>({vectors:[[1,...Array(383).fill(0)],[1,...Array(383).fill(0)]]})};}});
assert.equal(embeddingCalls,1);assert.equal(semantic.candidates[0].id,'root');assert.equal(semantic.method,'semantic');
await assert.rejects(()=>retrieve(st,'carbon',{method:'semantic',request:async()=>{throw Error('local embeddings offline');}}),/offline/);
const teaching=contextForB(st,{sessionId:'S2',message:'Is it carbon dioxide?',history:'resumed',retrieval:semantic});
assert.equal(teaching.raw_prior_messages,0);assert.equal(teaching.memory[0].original_learner_quote,'where is the carbon');
const obs=createObservation(st,{turnId:'Z2',sessionId:'S2',learner:'Is it carbon dioxide?',assessment:null,source:'not_scored'});assert.equal(obs.demonstrated_mastery,false);
recordCommitment(st,'Z3','Please check me with one question','What is the source?');assert.equal(st.commitments[0].status,'question_delivered_not_yet_answered');
const proposals=observeIntent(st,{turnId:'Z4',learner:'Can you draw a diagram comparing the two?',assessment:null});assert.ok(proposals.visual);observeIntent(st,{turnId:'Z5',learner:'Before a diagram, ask me a question',assessment:null});assert.equal(st.visuals[0].status,'deferred');
// Mocked provider chain: ensure B precedes A, C raw retained, label mismatch never vetoes C.
const calls=[];
const fake=async(p,_ctx,role)=>{calls.push(role);
 if(role==='B')return {raw:JSON.stringify({reply:'The carbon is sourced from CO2. Would you like a question?'}),usage:{prompt_tokens:100,completion_tokens:30},finishReason:'stop'};
 if(role==='L')return {raw:JSON.stringify({learner:'Can you clarify why sunlight does not itself supply carbon atoms?'}),usage:{prompt_tokens:120,completion_tokens:30},finishReason:'stop'};
 if(role==='A'){
  const u=JSON.parse(p.messages.at(-1).content).current_learner_message;
  return {raw:JSON.stringify({kind:'new_or_continuing_difficulty',topic_label:u.includes("I'm back")?'photosynthesis':'Photosynthesis - source of carbon in sugar',root_problem:'Uncertainty about whether sunlight supplies carbon atoms in glucose',evidence_quote:u.slice(0,Math.min(35,u.length)),uncertainty:'medium'}),usage:{prompt_tokens:110,completion_tokens:35},finishReason:'stop'};
 }
 const data=JSON.parse(p.messages.at(-1).content);const anchor=data.historical_candidates[0]?.id??null;
 return {raw:JSON.stringify({identity:anchor?'same':'distinct',anchor_id:anchor,rationale:'Model suggests a historical match; not independently verified'}),usage:{prompt_tokens:80,completion_tokens:30},finishReason:'stop'};
};
const opts=parseArgs(['--mode','model','--limit','5','--history','resumed','--retrieval','lexical','--learner','model','--allow-spend','--budget-usd','0.40']);
const modeled=await runStudy(opts,{rootCheck:false,send:fake,credential:()=>({key:'TEST',url:'https://test.invalid'})});
assert.equal(modeled.summary.processed,5);assert.equal(modeled.summary.stopped,false);assert.equal(calls[0],'B');assert.equal(calls[1],'A');assert.ok(modeled.cost.byRole.L>=2);
assert.equal(modeled.events[4].teaching_context.raw_prior_messages,0);assert.equal(modeled.events[4].model_c_guard?.action,'accepted');
assert.equal(modeled.events[4].model_c_raw?.identity,'same');assert.equal(modeled.events[4].model_c_final?.identity,'same');
const invalid=await runStudy(parseArgs(['--mode','model','--limit','1','--allow-spend','--budget-usd','0.20']),{rootCheck:false,send:async(p,_ctx,role)=>({raw:role==='B'?JSON.stringify({reply:'I can explain.'}):'{}',usage:{prompt_tokens:100,completion_tokens:20}}),credential:()=>({key:'TEST',url:'https://test.invalid'})});
assert.equal(invalid.summary.processed,1);assert.equal(invalid.events[0].assessment_status,'invalid_A_held');assert.equal(invalid.events[0].tutor_status,'REAL_MODEL_VALIDATED_UNSCORED');assert.equal(invalid.summary.stopped,false);
const unknown=await runStudy(parseArgs(['--mode','model','--limit','1','--allow-spend','--budget-usd','0.20']),{rootCheck:false,send:async()=>({raw:'{}',usage:null}),credential:()=>({key:'TEST',url:'https://test.invalid'})});
assert.equal(unknown.summary.stopped,true);assert.equal(unknown.cost.unknownUsage,1);assert.equal(unknown.events[0].stop.includes('incomplete billing'),true);
console.log('S1.6B.5.6 SELFTEST PASS: 12-turn 3-session model-B-first integrated journey; semantic adapter, adaptive learner mock, real A/C mock, raw C decision before exact-anchor-only guard, evidence, optional personalization/visuals, failed A does not block B, unknown cost stops, no DB/provider calls.');
