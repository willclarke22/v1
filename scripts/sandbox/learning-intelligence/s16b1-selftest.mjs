#!/usr/bin/env node
/** No provider, embeddings, Supabase, DB or Git writes. Mock live calls; strict failure tests. */
import assert from 'node:assert/strict';
import {loadJourneySeed} from './s16b-journey.mjs';
import {parseArgs,runJourney,formatReport} from './s16b1-journey.mjs';
import {compactContext,assessmentPrompt,teachingInput,classifyLearnerSignal,stableConcept,recoverC,evolveSafely,maxPayloadSafe} from './s16b1-continuity.mjs';
const seed=loadJourneySeed();const original=JSON.stringify(seed);
assert.equal(parseArgs(['--mode','offline']).limit,8);
assert.equal(parseArgs(['--mode','model','--allow-spend','--budget-usd','0.12']).limit,3);
assert.throws(()=>parseArgs(['--mode','model','--limit','5','--allow-spend','--budget-usd','0.12']),/capped at four/);
assert.throws(()=>parseArgs(['--mode','model','--limit','3']),/allow-spend/);
assert.throws(()=>parseArgs(['--mode','offline','--allow-spend']),/Offline mode forbids/);
assert.throws(()=>parseArgs(['--mode','model','--allow-spend','--budget-usd','0.12','--inject-fault']),/offline/);
const progress=classifyLearnerSignal(seed.turns[1].message),correction=classifyLearnerSignal(seed.turns[2].message);
assert.equal(progress.reportedProgress,true);assert.equal(progress.isCorrection,false);
assert.equal(correction.isCorrection,true);
const prev=[{turnId:'T01',message:seed.turns[0].message,teaching:{teaching_strategy:'Photons excite electrons.'},assessment:{root_problem:'Light energy to ATP.'}},{turnId:'T07',message:seed.turns[1].message,teaching:{teaching_strategy:'Carbon dioxide enters the Calvin cycle.'},assessment:{root_problem:'Carbon fixation.'}}];
const ctx=compactContext(prev,seed.turns[2].message);
assert.equal(ctx.usedTurns,2);assert.ok(ctx.short.includes('T01')&&ctx.short.includes('T07'));assert.ok(ctx.usedChars<=600);
const mockRuntime={assessment:{ASSESSMENT_SYSTEM_PROMPT:'Brief baseline',ASSESSMENT_SCHEMA:{type:'object'}}};
const prompt=assessmentPrompt(seed.turns[2].message,ctx,mockRuntime);
assert.ok(prompt.userPrompt.includes('CURRENT LEARNER'));
assert.ok(prompt.userPrompt.includes('not quotation evidence'));
assert.ok(!prompt.userPrompt.includes('expected_identity'));
const teach=teachingInput(seed.turns[2].message,{topic_name:'Photosynthesis',root_problem:'How carbon is fixed in the Calvin cycle',evidence_quote:'my photosynthesis question was specifically why the Calvin cycle incorporates CO2 into sugars'},ctx);
assert.deepEqual(Object.keys(teach).sort(),['clarification_answer','evidence_quote','original_statement','root_problem','topic'].sort());
assert.ok(teach.original_statement.includes('acknowledge learner correction'));
assert.ok(teach.original_statement.length<=2500);
assert.ok(maxPayloadSafe({foo:'bar'}));assert.ok(!maxPayloadSafe({foo:'a'.repeat(7000)}));
const f=parseArgs(['--mode','offline','--limit','8','--inject-fault']);const offline=await runJourney(f,{seed,silent:true});
assert.equal(offline.turns.length,8);assert.equal(offline.summary.modelCalls,0);assert.equal(offline.summary.teacherResponsesFromModel,0);assert.equal(offline.errors.length,0);
assert.equal(offline.turns[0].action.kind,'reuse');assert.equal(offline.turns[1].action.kind,'reuse_with_refinement_candidate');assert.equal(offline.turns[2].action.kind,'correction_hold');
assert.equal(offline.summary.learnerProgressEvents,3);assert.equal(offline.summary.correctionEvidenceRecorded,1);assert.equal(offline.summary.refinementProposals,1);
assert.equal(offline.finalState.injectedErrors.length,1);assert.equal(offline.finalState.correctionProposals[0].candidatePriorEventId,offline.turns[1].action.newEventId);
assert.equal(offline.finalState.correctionProposals[0].automaticRepairApplied,false);
assert.equal(offline.finalState.refinementProposals[0].automaticCanonicalRewrite,false);
assert.equal(stableConcept(offline.finalState,'sim-photosynthesis',offline.turns[0].action.difficultyId),seed.topics[0].events[0].root_problem);
assert.equal(JSON.stringify(seed),original,'Must never mutate source seed');
const notepad=formatReport(offline);for(const term of ['MODEL B — TEACHING','CORRECTION CANDIDATE','CANONICAL DIFFICULTY','LEARNER-REPORTED PROGRESS','UNVERIFIED RELATIONSHIPS'])assert.ok(notepad.includes(term));
const noCall=await runJourney(parseArgs(['--mode','offline','--limit','3']),{seed,silent:true});assert.equal(noCall.finalState.injectedErrors.length,0);assert.equal(noCall.turns.length,3);
const malformed=recoverC(()=>({decision:null,error:'Invalid explanation lengths'}),'{}',{});assert.equal(malformed.valid,false);
const held=evolveSafely({topics:[{topic_id:'a',events:[]}],audit:[],refinementProposals:[]},{turn_id:'x'},{root_problem:'foo'},{topicId:'a'},{identity:'same',interpretation:'insufficient_evidence',anchor_event_id:'x'});
assert.equal(held.kind,'memory_hold');

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
const mocked=await runJourney(liveF,{seed,deps,silent:true});
assert.equal(mocked.turns.length,3);assert.equal(mocked.errors.length,0);assert.equal(mocked.summary.teacherResponsesFromModel,3);
assert.equal(mocked.turns[2].modelCDiagnostics.attempts,2,'Only length-format model C failure receives one paid retry');
assert.deepEqual(mocked.turns[2].modelCDiagnostics.validationErrors,['Invalid explanation lengths']);
assert.equal(mocked.turns[2].action.kind,'correction_hold');assert.equal(mocked.summary.modelCalls,10);
assert.equal(mocked.summary.canonicalRootsAutomaticallyRewritten,0);
assert.ok(calls.find(x=>x.stage==='teaching'&&x.text.includes('EARLIER CONTEXT')));
assert.ok(calls.find(x=>x.stage==='assessment'&&x.text.includes('not quotation evidence')));
assert.ok(!calls.some(x=>x.text.includes('scripted_assessment')||x.text.includes('expected_identity')));
const failure=makeFake({alwaysBadC:true});const heldRun=await runJourney(liveF,{seed,deps:failure.deps,silent:true});
assert.equal(heldRun.turns.length,3);assert.equal(heldRun.turns[2].action.kind,'correction_hold');assert.equal(heldRun.summary.modelCValidationHolds,1);assert.equal(heldRun.errors.length,0);
const operational=makeFake({throwC:true});const stopped=await runJourney(liveF,{seed,deps:operational.deps,silent:true});
assert.equal(stopped.turns.length,1);assert.equal(stopped.errors.length,1);assert.equal(stopped.turns[0].action.kind,'stopped_on_operational_error');
console.log('S1.6B.1 SELFTEST PASS: 8-visit offline continuity, learner progress separate, canonical roots stable, correction-first logging, false-link control, mocked real A/B/C 10 calls, bounded C validation retry and recoverable hold, fatal transport STOP, zero DB/provider calls.');
