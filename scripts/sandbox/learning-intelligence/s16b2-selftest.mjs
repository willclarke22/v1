#!/usr/bin/env node
/** Strict offline + mock provider tests: no real calls, DB, or Git writes. */
import assert from 'node:assert/strict';
import {loadJourneySeed} from './s16b-journey.mjs';
import {parseArgs,runJourney,formatReport} from './s16b2-journey.mjs';
import {correctionRecord,rankCorrectionTargets,clarificationForCorrection,refinementEvidence,teacherContextB2} from './s16b2-evidence.mjs';
import {stableConcept,compactContext} from './s16b1-continuity.mjs';
const seed=loadJourneySeed(),original=JSON.stringify(seed);
assert.equal(parseArgs(['--mode','offline']).limit,8);
assert.equal(parseArgs(['--mode','model','--allow-spend','--budget-usd','0.12']).limit,3);
assert.throws(()=>parseArgs(['--mode','model']),/allow-spend/);
assert.throws(()=>parseArgs(['--mode','model','--limit','5','--allow-spend','--budget-usd','0.12']),/capped/);
const offline=await runJourney(parseArgs(['--mode','offline','--limit','8','--inject-fault']),{seed,silent:true});
assert.equal(offline.turns.length,8);assert.equal(offline.errors.length,0);
assert.equal(offline.summary.refinementsSuppressed,1);
assert.equal(offline.summary.correctionEvidenceRecorded,1);
assert.equal(offline.summary.refinementProposals,0);
assert.equal(offline.summary.clarificationsProposed,1);
assert.equal(offline.summary.relationshipsUnverified,4);
assert.equal(offline.summary.canonicalRootsAutomaticallyRewritten,0);
assert.equal(offline.summary.liveWrites,0);
assert.equal(offline.summary.modelCalls,0);
assert.equal(offline.turns[1].action.kind,'reuse');
assert.equal(offline.turns[2].action.kind,'correction_hold');
const correction=offline.turns[2].correction;
assert.ok(correction.rankedTargets.length>=2);
assert.equal(correction.rankedTargets[0].priorTurnId,'T01','Correction must consider old disputed interpretation, not latest event');
assert.equal(correction.rankedTargets[1].priorTurnId,'T07');
assert.equal(correction.candidatePriorEventId,null,'No event chosen for mutation by lexical ranking');
assert.equal(correction.automaticRepairApplied,false);
assert.match(correction.clarification.question,/earlier interpretation/i);
assert.equal(offline.finalState.injectedErrors.length,1);
assert.equal(JSON.stringify(seed),original);
assert.equal(stableConcept(offline.finalState,'sim-photosynthesis',offline.turns[0].action.difficultyId),seed.topics[0].events[0].root_problem);
for(const token of ['REFINEMENT SUPPORT GATE','CORRECTION TARGETS','TARGETED MEMORY CLARIFICATION','MODEL B — TEACHING','CANONICAL DIFFICULTY'])assert.ok(formatReport(offline).includes(token));
const idx=rankCorrectionTargets('I was not confused about ATP formation; it was the Calvin cycle',offline.turns.slice(0,2));
assert.equal(idx.candidates[0].priorTurnId,'T01');
assert.equal(idx.selectedForMutation,null);
assert.equal(clarificationForCorrection(idx).needsLearnerAnswer,true);
const ctx=compactContext(offline.turns.slice(0,2),seed.turns[2].message);
const tc=teacherContextB2(seed.turns[2].message,{topic_name:'Photosynthesis',root_problem:'How carbon dioxide is fixed',evidence_quote:'Calvin cycle'},ctx,correction);
assert.ok(tc.original_statement.includes('Acknowledge it explicitly'));
assert.ok(tc.original_statement.length<=1900);
assert.ok(!tc.original_statement.includes('referenceForEvaluationOnly'));
const withoutEvidence=refinementEvidence({state:offline.finalState,retrieval:{topicId:'sim-photosynthesis'},decision:{identity:'uncertain',interpretation:'not_applicable'},assessment:{},learnerMessage:'test'});
assert.equal(withoutEvidence,null);
class FakeLedger {constructor(){this.rows=[];}reserve(){}record(x){this.rows.push(x);return {estimatedUsd:0.0004};}summary(){return {attemptedCalls:this.rows.length,knownEstimatedUsd:+(this.rows.length*0.0004).toFixed(6),complete:true,notInvoice:true};}}
function makeFake({alwaysBadC=false,throwC=false}={}){
 const calls=[];
 const deps={CostLedger:FakeLedger,ledger:new FakeLedger(),parseUsage:()=>({total_tokens:50}),voice:{S15_ASSESSMENT_ADDENDUM:' TEST'},
  runtime:{assessment:{ASSESSMENT_SCHEMA:{type:'object'},ASSESSMENT_SYSTEM_PROMPT:'Evidence first.',validateAssessment:(raw)=>({assessment:JSON.parse(raw),warnings:[]}),resolveAssessmentRoute:()=> 'proceed'},cost:{}},
  shadowAssessmentGate:()=>({route:'proceed'}),
  rankFixtureEvidence:async(a,{bank})=>{
   const t=bank.find(x=>x.topic_id==='sim-photosynthesis'),events=t.events.map(e=>({...e,similarity:/Calvin|carbon|CO2/i.test(a.root_problem)?/Calvin|carbon|CO2/i.test(e.root_problem)?0.88:0.13:/photons|ATP|NADPH/i.test(e.root_problem)?0.91:0.12})).sort((x,y)=>y.similarity-x.similarity);
   return {topicId:t.topic_id,topicLabel:t.topic_label,events,topicCandidates:bank.map(x=>({topicId:x.topic_id,topicLabel:x.topic_label,bestEventSimilarity:x.topic_id===t.topic_id?0.88:0.2})),retrievalStatus:'mock_whole_bank'};
  },scoreEvents:async(root,events)=>events,chooseHistory:(x,id,max)=>x.slice(0,max),evidenceIntegrity:()=>({status:'candidate_ready'}),
  s13:{s13Input:x=>x,validS13Input:()=>true,parseS13:(raw,input)=>{const d=JSON.parse(raw);if(d.identity_rationale.length>600)return {decision:null,error:'Invalid explanation lengths'};
   if(!input.historical_observations.some(e=>e.event_id===d.anchor_event_id))return {decision:null,error:'Missing or forged historical event anchor'};
   return {decision:d,error:null};}},
  send:async(url,payload)=>{
   const text=JSON.stringify(payload);calls.push({url,stage:payload.stage??'assessment',text});
   if(payload.userPrompt){const current=payload.userPrompt.match(/CURRENT LEARNER \(quote evidence from THIS line only\):\n([^\n]*)/)?.[1]??'';
    const calvin=/Calvin|CO2|carbon dioxide/i.test(current);const root=calvin?'How carbon dioxide is incorporated into organic molecules by the Calvin cycle':'How captured photon energy is converted into ATP and NADPH';
    return {model:'gpt-4.1-mini',raw:JSON.stringify({topic_name:'Photosynthesis',root_problem:root,evidence_quote:current,root_problem_confidence:0.9,next_action:'proceed',clarifying_question:'',confusion:6,insight:1}),usage:{total_tokens:50}};}
   if(payload.stage==='teaching')return {model:'gpt-4.1-mini',raw:JSON.stringify({teaching_strategy:'Current scientific explanation (mock).',next_step:'Draw the mechanism.',visual_intent:'Diagram'}),usage:{total_tokens:50}};
   if(throwC)throw Error('Injected transport failure');
   const current=payload.context.learner_statement;const isT10=/I was not confused/i.test(current);
   const priorC=calls.filter(c=>c.stage==='memory'&&c.text.includes('I was not confused')).length;
   const history=payload.context.historical_observations;
   const d={identity:'same',interpretation:/Calvin|CO2/i.test(current)?'refine':'retain',anchor_event_id:history[0].event_id,identity_rationale:(isT10&&(alwaysBadC||priorC===1))?'x'.repeat(610):'This is a related history event.',interpretation_rationale:'The learner describes an ongoing obstacle.',evidence_basis:'The learner reports the specific conceptual mechanism.',proposed_hypothesis:/Calvin|CO2/i.test(current)?'How the Calvin cycle incorporates carbon dioxide into organic compounds':'',missing_evidence:''};
   return {model:'gpt-4.1-mini',raw:JSON.stringify(d),usage:{total_tokens:50}};
  }};
 return {deps,calls};
}

const liveF=parseArgs(['--mode','model','--limit','3','--allow-spend','--budget-usd','0.12']);
const {deps,calls}=makeFake();
const result=await runJourney(liveF,{seed,deps,silent:true});
assert.equal(result.turns.length,3);assert.equal(result.errors.length,0);
assert.equal(result.summary.teacherResponsesFromModel,3);
assert.equal(result.summary.modelCalls,8,'A+B on each of 3 turns, Model C only on first two');
assert.equal(result.summary.correctionModelCCallsSkipped,1);
assert.equal(result.turns[2].modelCDiagnostics.attempts,0);
assert.equal(result.turns[2].action.kind,'correction_hold');
assert.equal(result.turns[2].correction.rankedTargets[0].priorTurnId,'T01');
assert.ok(!calls.some(x=>x.stage==='memory'&&x.text.includes('I was not confused')));
assert.ok(calls.some(x=>x.stage==='teaching'&&x.text.includes('Acknowledge it explicitly')));
assert.ok(!calls.some(x=>x.text.includes('scripted_assessment')||x.text.includes('referenceForEvaluationOnly')||x.text.includes('scripted_simulation_transition')));
assert.ok(result.turns[1].refinementGate?.status==='retain_without_supported_refinement');
assert.equal(result.summary.refinementProposals,0);
assert.equal(result.summary.canonicalRootsAutomaticallyRewritten,0);
assert.equal(JSON.stringify(seed),original);
// Deliberately malformed C output on first attempt, valid second: paid calls bounded to one retry.
const retry=makeFake();let broken=false;const originalSend=retry.deps.send;
retry.deps.send=async(url,payload)=>{
 if(payload.stage==='memory'&&!broken){broken=true;const ret=await originalSend(url,payload);const data=JSON.parse(ret.raw);data.identity_rationale='x'.repeat(610);return {...ret,raw:JSON.stringify(data)};}
 return originalSend(url,payload);
};
const retried=await runJourney(liveF,{seed,deps:retry.deps,silent:true});
assert.equal(retried.turns[0].modelCDiagnostics.attempts,2);
assert.equal(retried.summary.modelCalls,9);
assert.equal(retried.errors.length,0);
// Transport failure remains fail-closed (no retry and no silent continuation).
const failed=makeFake({throwC:true});
const stopped=await runJourney(liveF,{seed,deps:failed.deps,silent:true});
assert.equal(stopped.errors.length,1);assert.equal(stopped.turns.length,1);
assert.equal(stopped.turns[0].action.kind,'stopped_on_operational_error');
console.log('S1.6B.2 SELFTEST PASS: conservative refinement, cross-event correction ranking (T01 over T07), teacher correction context, targeted clarification, C skipped on correction, bounded retry, transport stop, unchanged canonical roots, 4 unverified relationships, offline and mocked paid traces, no DB/provider calls.');
