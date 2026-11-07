#!/usr/bin/env node
/** S1.6B.3 no-provider, no-database regression and mocked paid-model tests. */
import assert from 'node:assert/strict';
import {loadJourneySeedB3,parseArgs,runJourney,formatReport} from './s16b3-journey.mjs';
import {inferIntent,teacherContextB3,teacherReview,assessmentSkip,memorySkip} from './s16b3-intent.mjs';
import {checkRevisions,resolveCorrection,undoSyntheticRevision} from './s16b3-resolution.mjs';
const seed=loadJourneySeedB3(),original=JSON.stringify(seed);
const offline=await runJourney(parseArgs(['--mode','offline','--limit','10','--inject-fault']),{seed,silent:true});
assert.equal(offline.errors.length,0);assert.equal(offline.summary.processed,10);
assert.equal(offline.summary.correctionCandidates,2);assert.equal(offline.summary.correctionsResolvedWithoutChange,1);
assert.equal(offline.summary.simulatedRepairsApplied,1);assert.equal(offline.summary.refinementsSuppressed,1);
assert.equal(offline.summary.positiveRefinementCandidates,1);assert.equal(offline.summary.refinementProposals,1);
assert.equal(offline.summary.liveWrites,0);assert.equal(offline.summary.modelASkipped,4);
assert.equal(offline.turns[2].intent.intent,'correction');assert.equal(offline.turns[3].intent.intent,'clarification_answer');
assert.equal(offline.turns[3].resolution.status,'RESOLVED_NO_CHANGE');
assert.equal(offline.turns[4].action.kind,'reuse_with_refinement_candidate');
assert.equal(offline.turns[6].resolution.status,'SIMULATED_RELINK_APPLIED');
assert.equal(offline.turns[6].resolution.selectedTargetTurnId,'T07');
assert.equal(offline.turns[6].resolution.applied,true);assert.equal(offline.summary.revisionAudit.pass,true);
const rev=offline.finalState.memoryRevisions[0];
const repaired=offline.finalState.topics.flatMap(t=>t.events).find(x=>x.event_id===rev.eventId);
assert.equal(repaired.difficulty_id,rev.toDifficultyId);
const light=offline.finalState.topics.find(t=>t.topic_id==='sim-photosynthesis').events.find(e=>e.turn_id==='T01');
assert.notEqual(light.difficulty_id,rev.toDifficultyId,'Original real light-reaction question must remain untouched');
const inverse=structuredClone(offline.finalState);
assert.equal(undoSyntheticRevision(inverse,rev.id).restoredDifficultyId,rev.fromDifficultyId);
assert.equal(checkRevisions(inverse).pass,true);
assert.throws(()=>undoSyntheticRevision(inverse,rev.id),/already undone/);
assert.ok(formatReport(offline).includes('SIMULATED REVERSIBLE MEMORY REVISIONS'));
assert.ok(formatReport(offline).includes('MODEL B INTENT-AWARE STYLE FLAGS'));
assert.equal(JSON.stringify(seed),original);
const noFault=await runJourney(parseArgs(['--mode','offline','--limit','7']),{seed,silent:true});
assert.equal(noFault.summary.simulatedRepairsApplied,0);
assert.equal(noFault.finalState.memoryRevisions.length,0);
assert.equal(noFault.turns[3].resolution.status,'RESOLVED_NO_CHANGE');
assert.equal(inferIntent('I get this now.').intent,'reported_progress');
assert.equal(inferIntent('But why does it split?',{previous:[{turnId:'T01'}]}).intent,'follow_up');
assert.equal(inferIntent('My earlier question was about CO2.').intent,'correction');
assert.equal(inferIntent('Yes, keep my earlier question unchanged.',{pending:{id:'x',status:'AWAITING_CLARIFICATION'}}).intent,'clarification_answer');
assert.equal(assessmentSkip('correction'),true);assert.equal(memorySkip('reported_progress'),true);
const bc=teacherContextB3('I was correcting the earlier interpretation',{topic_name:'Continuing learner correction',root_problem:'Clarify earlier attribution',evidence_quote:'I was correcting'},{short:'Older lesson was about ATP and NADPH'}, {intent:'correction'}, {clarification:{question:'Did you mean the earlier light-reaction question?'}});
assert.match(bc.original_statement,/Acknowledge the learner correction FIRST/);
assert.ok(bc.original_statement.length<=1850);
assert.ok(!bc.original_statement.includes('scripted_assessment'));
assert.equal(teacherReview({teaching_strategy:'Great question!'}, {intent:'correction'}).possibleCannedPraise,true);
class FakeLedger {constructor(){this.rows=[];} reserve(){}record(x){this.rows.push(x);}summary(){return {attemptedCalls:this.rows.length,knownEstimatedUsd:+(this.rows.length*.0004).toFixed(5),complete:true,notInvoice:true};}}
function fake({badC=false,transportFail=false}={}){
 const calls=[];let firstC=true;
 const deps={CostLedger:FakeLedger,ledger:new FakeLedger(),parseUsage:()=>({total_tokens:30}),voice:{S15_ASSESSMENT_ADDENDUM:' TEST'},
  runtime:{assessment:{ASSESSMENT_SCHEMA:{type:'object'},ASSESSMENT_SYSTEM_PROMPT:'Evidence first.',validateAssessment:(raw)=>({assessment:JSON.parse(raw),warnings:[]}),resolveAssessmentRoute:()=> 'proceed'},cost:{}},
  shadowAssessmentGate:()=>({route:'proceed'}),
  rankFixtureEvidence:async(a,{bank})=>{const t=bank.find(x=>x.topic_id==='sim-photosynthesis');const cal=/Calvin|CO2|carbon|RuBP|six-carbon/i.test(a.root_problem);const scored=t.events.map(e=>({...e,similarity:cal?/Calvin|carbon|RuBP|six-carbon|3-PGA/i.test(e.root_problem)?0.89:0.16:/photons|ATP|NADPH/i.test(e.root_problem)?0.93:0.13})).sort((x,y)=>y.similarity-x.similarity);
   return {topicId:t.topic_id,topicLabel:t.topic_label,events:scored,topicCandidates:[{topicId:t.topic_id,topicLabel:t.topic_label,bestEventSimilarity:.89}],retrievalStatus:'MOCK_WHOLE_BANK'};},
  scoreEvents:async(r,events)=>events,chooseHistory:(x,id,n)=>x.slice(0,n),evidenceIntegrity:()=>({status:'candidate_ready'}),
  s13:{s13Input:x=>x,validS13Input:()=>true,parseS13:(raw,input)=>{const d=JSON.parse(raw);if(d.identity_rationale.length>600)return {decision:null,error:'Invalid explanation lengths'};if(!input.historical_observations.some(e=>e.event_id===d.anchor_event_id))return {decision:null,error:'Invalid anchor'};return {decision:d,error:null};}},
  send:async(url,payload)=>{
   const text=JSON.stringify(payload);calls.push({stage:payload.stage??'assessment',text,payload});
   if(payload.userPrompt){const current=payload.userPrompt.match(/CURRENT LEARNER \(quote evidence from THIS line only\):\n([^\n]*)/)?.[1]??'';const cal=/Calvin|carbon dioxide|RuBP|six-carbon|CO2/i.test(current);
    return {model:'gpt-4.1-mini',raw:JSON.stringify({topic_name:'Photosynthesis',root_problem:cal?'How the Calvin cycle fixes CO2 into organic molecules':'How photon energy becomes ATP and NADPH',evidence_quote:current,root_problem_confidence:.9,next_action:'proceed',clarifying_question:'',confusion:6,insight:1}),usage:{total_tokens:30}};}
   if(payload.stage==='teaching'){
    const orig=payload.context.original_statement;const intent=orig.match(/INTENT=(\w+)/)?.[1]??'unknown';
    return {model:'gpt-4.1-mini',raw:JSON.stringify({teaching_strategy:intent==='correction'?'Ah, I see—you are correcting how I interpreted the earlier question. I have not changed the historical record yet.':intent==='clarification_answer'?'Thanks for clarifying. I will keep the historical note under review rather than assume a repair.':'Here is the specific mechanism that connects the pieces you mentioned.',next_step:intent==='correction'?'Which earlier question do you mean?':'Would you like to trace one step together?',visual_intent:'none'}),usage:{total_tokens:30}};}
   if(transportFail)throw Error('Injected provider transport failure');
   const msg=payload.context.learner_statement;const cal=/Calvin|RuBP|CO2|carbon dioxide|six-carbon/i.test(msg);const history=payload.context.historical_observations;
   const preferred=history.find(e=>cal?/Calvin|carbon|CO2/i.test(e.root_problem):/light|photon/i.test(e.root_problem))??history[0];
   const isT22=/six-carbon/i.test(msg);
   const proposed=isT22?'Why the unstable six-carbon intermediate splits into two three-carbon 3-PGA molecules after Rubisco fixes CO2 to RuBP in the Calvin cycle':'How the Calvin cycle fixes carbon dioxide into organic carbon molecules';
   const decision={identity:'same',interpretation:cal?'refine':'retain',anchor_event_id:preferred.event_id,identity_rationale:badC&&firstC?'x'.repeat(610):'Matching the semantic root in a historical observation.',interpretation_rationale:'A conservative proposal that must pass evidence gating.',evidence_basis:'Compared to existing history.',proposed_hypothesis:cal?proposed:'',missing_evidence:''};
   firstC=false;
   return {model:'gpt-4.1-mini',raw:JSON.stringify(decision),usage:{total_tokens:30}};
  }};
 return {deps,calls};
}
assert.equal(parseArgs(['--mode','model','--allow-spend','--budget-usd','0.12']).limit,4);
assert.throws(()=>parseArgs(['--mode','model']),/allow-spend/);
assert.throws(()=>parseArgs(['--mode','model','--limit','8','--allow-spend','--budget-usd','0.12']),/MODEL REFUSED|capped/);
const mode=parseArgs(['--mode','model','--limit','4','--allow-spend','--budget-usd','0.12']);
const {deps,calls}=fake();const paid=await runJourney(mode,{seed,deps,silent:true});
assert.equal(paid.errors.length,0);assert.equal(paid.turns.length,4);
assert.equal(paid.summary.modelBRealResponses,4);assert.equal(paid.summary.modelCalls,8,'2 A, 4 B, 2 C, with correction and answer skipping A/C');
assert.equal(paid.turns[2].action.kind,'correction_hold');assert.equal(paid.turns[3].action.kind,'clarification_resolved_no_change');
assert.equal(paid.summary.simulatedRepairsApplied,0);
assert.ok(calls.some(c=>c.stage==='teaching'&&c.text.includes('Acknowledge the learner correction FIRST')));
assert.ok(calls.some(c=>c.stage==='teaching'&&c.text.includes('INTENT=clarification_answer')));
assert.ok(!calls.some(c=>c.text.includes('scripted_assessment')||c.text.includes('scripted_simulation_transition')||c.text.includes('expected')||c.text.includes('referenceForEvaluationOnly')));
assert.ok(calls.every(c=>Buffer.byteLength(c.text)<6400));
const repairSeed=loadJourneySeedB3({scenario:'repair'});
const full=await runJourney(parseArgs(['--mode','model','--scenario','repair','--limit','5','--allow-spend','--budget-usd','0.12']),{seed:repairSeed,deps:fake().deps,silent:true});
assert.equal(full.errors.length,0);assert.equal(full.summary.simulatedRepairsApplied,0,'No paid-test automatic repair permitted');
assert.ok(full.summary.modelCalls<=15);
const retried=await runJourney(mode,{seed,deps:fake({badC:true}).deps,silent:true});
assert.equal(retried.errors.length,0);assert.equal(retried.turns[0].modelCDiagnostics.attempts,2);
assert.equal(retried.summary.modelCalls,9);
const broken=await runJourney(mode,{seed,deps:fake({transportFail:true}).deps,silent:true});
assert.equal(broken.errors.length,1);assert.equal(broken.turns[0].action.kind,'stopped_on_operational_error');
console.log('S1.6B.3 SELFTEST PASS: intent routing, natural tutor prompt modes, no false-alarm rewrite, positive and negative refinement examples, evidence-gated reversible offline correction, paid no-repair, A/C skips, model C format retry, transport fail-closed, prompt and cost bounds, unchanged seed, zero real calls/writes.');
