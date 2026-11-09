#!/usr/bin/env node
/** S55R1 research regression: requires zero provider calls and zero DB writes. */
import assert from 'node:assert/strict';
import {loadScenarios,parseArgs,runStudy,admissionEstimate,requestC55} from './s16b55r1-journey.mjs';
import {C55_SCHEMA,branchFromReply} from './s16b55-core.mjs';
import {newR1State,snapshotR1,markMechanism,distinctEvidence,protectModelIdentity,classifyVisualIntent,selectiveVisual,recordTurn} from './s16b55r1-core.mjs';
const seed=loadScenarios(),steps=seed.sessions.flatMap(x=>x.steps);
assert.equal(steps.length,9);
assert.throws(()=>parseArgs(['--mode','model','--limit','4']),/allow-spend/);
assert.throws(()=>parseArgs(['--mode','offline','--allow-spend']),/refuses/);
assert.throws(()=>parseArgs(['--limit','10']),/limit/i);
assert.throws(()=>parseArgs(['--context','everything']),/context/i);
assert.ok(admissionEstimate(4)<0.20);
assert.equal(branchFromReply(steps[1],'Would you like to try a question?').option.key,'asked_check');
assert.equal(branchFromReply(steps[1],'The carbon source is CO2.').option.key,'no_check');
const run=await runStudy(parseArgs(['--mode','offline','--limit','9']),{rootCheck:false,scenarios:seed});
assert.equal(run.summary.processed,9);
assert.equal(run.summary.stopped,false);
assert.equal(run.cost.attemptedCalls,0);
assert.equal(run.summary.db_writes,0);
assert.equal(run.summary.roots_provisional,3); // carbon, distinct oxygen, proton gradients
assert.equal(run.summary.durable_evidence_entries,9);
assert.equal(run.state.observation_ledger.length,9);
assert.equal(run.summary.understanding_check_commitments,2);
assert.equal(run.summary.quote_provenance_complete,true);
assert.equal(run.summary.identity_holds,0);
assert.equal(run.events[3].memory_action.status,'PROVISIONAL_REUSE');
assert.equal(run.events[5].memory_action.status,'PROVISIONAL_NEW_ROOT');
assert.equal(run.events[5].model_c.identity,'distinct');
assert.equal(run.events[5].model_c.rule,'explicit_separate_mechanism');
assert.notEqual(run.events[5].memory_action.root_id,run.events[0].memory_action.root_id);
assert.equal(run.summary.false_s55_oxygen_hold_avoided,true);
assert.equal(run.events[6].relation_proposals.length,1);
assert.equal(run.events[6].relation_proposals[0].type,'TOPIC_MECHANISM_HYPOTHESIS');
assert.equal(run.events[6].relation_proposals[0].root_relation_supported,false);
assert.equal(run.events[6].relation_proposals[0].automatic_graph_write,false);
assert.equal(run.state.relationships.length,0);
assert.equal(run.events[7].visual_intent.intent,'request');
assert.ok(/protons accumulate/i.test(run.events[7].visual_proposal.focus));
assert.equal(run.events[8].visual_intent.intent,'defer');
assert.equal(run.events[8].visual_proposal,null);
assert.equal(run.summary.visual_proposals,1);
assert.equal(run.summary.visual_deferred,1);
assert.equal(run.state.visual_proposals[0].status,'DEFERRED_BY_LEARNER');
assert.equal(run.events[3].context_audit.older_raw_messages_exposed,0);
assert.equal(run.events[3].comparison.full_older_raw_exposed,6);
assert.equal(run.events[3].context_audit.raw_prior_messages,0);
assert.equal(run.session_boundaries[1].snapshot_ledger_count,3);
assert.equal(run.session_boundaries[1].snapshot_commitments,1);
assert.ok(run.events[3].context_audit.structured_memory.conversation_commitments.some(x=>x.kind==='understanding_check_requested'));
assert.ok(run.events[3].context_audit.roots_retrieved.some(r=>r.source_turn==='S55-01'));
assert.equal(run.projection.not_semantic_layout,true);
assert.equal(run.state.safeguards.authoritative_mastery_awards,0);
assert.equal(run.state.safeguards.committed_memory_writes,0);
const snap=snapshotR1(run.state);
assert.ok(!('turns' in snap));assert.ok(!('audit' in snap));
assert.equal(snap.observation_ledger.length,9);
assert.ok(snap.observation_ledger.every(e=>e.speaker==='learner'&&e.verbatim_excerpt&&e.source_message_sha256&&!('complete_message' in e)));
const full=await runStudy(parseArgs(['--mode','offline','--limit','9','--context','full']),{rootCheck:false,scenarios:seed});
assert.equal(full.summary.processed,9);
assert.equal(full.events[3].context_audit.older_raw_messages_exposed,6);
assert.equal(full.events[3].context_audit.raw_prior_messages,6);
assert.equal(full.events[3].memory_action.status,run.events[3].memory_action.status);
const alternate=await runStudy(parseArgs(['--mode','offline','--limit','9']),{rootCheck:false,scenarios:seed,teacher:({step,defaultReply})=>step.id==='S55-01'?'The carbon comes from CO2.':step.id==='S55-02'?'ATP is important.':step.id==='S55-07'?'The mechanisms share something.':defaultReply});
assert.equal(alternate.summary.processed,9);
assert.equal(alternate.events[1].selected_branch,'no_check');
assert.equal(alternate.events[2].selected_branch,'atp_correction');
assert.equal(alternate.events[7].selected_branch,'visual_not_offered');
assert.equal(alternate.events[7].visual_intent.intent,'request');
assert.equal(alternate.events[8].visual_intent.intent,'defer'); // requests check before potentially displayed diagram
assert.equal(markMechanism('I wonder where the oxygen gas released during photosynthesis comes from'),'source_of_released_oxygen');
assert.equal(markMechanism('Confuses sunlight with origin of carbon in glucose'),'source_of_carbon_in_glucose');
assert.equal(distinctEvidence({root_problem:'Uncertain where released oxygen gas comes from during photosynthesis',evidence_quote:'oxygen'},[{id:'old',topicMatched:true,root_problem:'Confuses sunlight and source of carbon in glucose',first_quote:'carbon in glucose',lexical_similarity:0.05}], 'I have a separate question about oxygen gas released during photosynthesis').identity,'distinct');
assert.equal(distinctEvidence({root_problem:'Uncertain oxygen gas',evidence_quote:'oxygen'},[{id:'old',topicMatched:true,root_problem:'Source of carbon in glucose',first_quote:'carbon',lexical_similarity:0.01}], 'oxygen gas released during photosynthesis'),null);
assert.equal(classifyVisualIntent('Before a diagram, please check my reasoning').kind,'defer');
assert.equal(classifyVisualIntent('I thought the diagram was colorful.').kind,'mention');
assert.equal(classifyVisualIntent('Do not draw a diagram yet.').kind,'cancel');
assert.equal(classifyVisualIntent('Can you draw a diagram?').kind,'request_needs_focus');
assert.equal(classifyVisualIntent('Can you draw a diagram comparing where protons accumulate in chloroplast versus mitochondrion?').kind,'request');
const visuals=newR1State(seed);
assert.equal(selectiveVisual(visuals,{id:'v0',learner:'I mentioned a diagram.'},null).intent,'mention');
assert.equal(visuals.visual_proposals.length,0);
assert.equal(selectiveVisual(visuals,{id:'v1',learner:'Can you draw a diagram?'},null).intent,'request_needs_focus');
assert.equal(visuals.visual_proposals.length,0);
const held=newR1State(seed),heldTurn={id:'HOLD-1',session_id:'S55-SESSION-2',learner:'I am unsure how light and sugar relate.',evidence_kind:'expressed_uncertainty'};
recordTurn(held,heldTurn,{evidence_quote:'how light and sugar relate',root_problem:'Unclear link',topic_label:'Photosynthesis'},
 {status:'HELD_IDENTITY_UNCERTAIN',candidates:['root-old']},{ordinal:1,modelAStatus:'offline',modelBStatus:'offline'});
const heldSnap=snapshotR1(held);assert.equal(heldSnap.unresolved_holds.length,1);
assert.equal(heldSnap.unresolved_holds[0].possible_anchors[0],'root-old');
const candidate=[{id:'root-c',topicMatched:true,root_problem:'Confuses carbon in glucose with sunlight',first_quote:'where does carbon in glucose come from'}];
const forbidden=protectModelIdentity({identity:'same',anchor_id:'root-c',rationale:'model says same'},
 {root_problem:'Uncertain where oxygen gas released during photosynthesis comes from'},candidate,
 'I have a separate question: where does the oxygen gas released during photosynthesis come from?');
assert.equal(forbidden.decision.identity,'uncertain');
assert.equal(forbidden.warning,'MODEL_IDENTITY_MECHANISM_CONTRADICTION');
assert.equal(requestC55({topic_label:'Photosynthesis',root_problem:'carbon',evidence_quote:'carbon'},candidate,'carbon').response_format.json_schema.schema,C55_SCHEMA);
// Four-turn mocked provider evaluation: no API requests, but model contracts, ledger and cost guards are exercised.
const opt=parseArgs(['--mode','model','--limit','4','--context','resumed','--allow-spend','--budget-usd','0.20']);
const choices=steps.flatMap(s=>s.options);
const fake=async(req,_auth,role)=>{
 let payload;if(role==='A'){
  const current=JSON.parse(req.messages.at(-1).content).current_learner_message;
  const choice=choices.find(o=>o.learner===current);
  assert.ok(choice);payload=choice.assessment;
 }else if(role==='B'){
  payload={reply:'MOCK: I heard that. Shall we try a question?'};
 }else{
  const context=JSON.parse(req.messages.at(-1).content);
  const candidate=context.candidates.find(x=>x.topic===context.topic);
  payload=candidate?{identity:'same',anchor_id:candidate.id,rationale:'Mock same topic'}:{identity:'uncertain',anchor_id:null,rationale:'Mock uncertain'};
 }
 return {raw:JSON.stringify(payload),usage:{prompt_tokens:90,completion_tokens:40,prompt_tokens_details:{cached_tokens:0}},model:'gpt-4.1-mini',finishReason:'stop'};
};
const modeled=await runStudy(opt,{rootCheck:false,scenarios:seed,send:fake,cred:()=>({key:'MOCK',url:'https://mock.invalid'})});
assert.equal(modeled.summary.processed,4);assert.equal(modeled.summary.stopped,false);
assert.equal(modeled.cost.byRole.A,4);assert.equal(modeled.cost.byRole.B,4);
assert.equal(modeled.summary.durable_evidence_entries,4);
assert.equal(modeled.events[3].context_audit.older_raw_messages_exposed,0);
let requests=0;
const bad=await runStudy(opt,{rootCheck:false,scenarios:seed,send:async()=>{requests++;return {raw:'{}',usage:null};},cred:()=>({key:'MOCK',url:'https://mock.invalid'})});
assert.equal(requests,1);assert.equal(bad.summary.stopped,true);assert.equal(bad.cost.unknownOrIncompleteCalls,1);
console.log('S1.6B.5.5-R1 SELFTEST PASS: reviewed distinct mechanism, 9 provenance entries, persisted holds/requests, 1 focused deferred diagram, topic-only relation, paired session contexts and alternative learner branches; mocked provider/unknown-usage guards; zero network or DB calls.');
