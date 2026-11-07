#!/usr/bin/env node
/** S1.6B.3: intent-aware tutoring and correction resolution; Isolated synthetic JSON memory only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import {loadJourneySeed as loadBaseJourneySeed} from './s16b-journey.mjs';
import {flags as baseFlags} from './s16-space-sim.mjs';
import {clipped,stableId,compactContext,assessmentPrompt,evolveSafely,recoverC,maxPayloadSafe} from './s16b1-continuity.mjs';
import {correctionRecord,refinementEvidence} from './s16b2-evidence.mjs';
import {inferIntent,assessmentSkip,memorySkip,teacherContextB3,teacherReview} from './s16b3-intent.mjs';
import {markPending,resolveCorrection,proposedRefinementPositive,checkRevisions} from './s16b3-resolution.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../');
const BASE='http://127.0.0.1:3001';
const ENDPOINT_A=BASE+'/api/sandbox/probe-lab/local-assessment/openai';
const ENDPOINT_BC=BASE+'/api/sandbox/probe-lab/local-assessment/myway-shadow-s15';
const REPORT_ROOT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b3');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ALLOWED_JOURNEY_HASH='9ebebff726b25373917851dd4f48f0b5f8710a731acb08c2afdff90ccc2692f0';
const ALLOWED_ENGINE_HASH='9ee7e829d9bcd28c2d898873e047b76071ffe152769b439fb6c4983c3045d2e5';
const PLAN=['T01','T07','T10','T10A','T22','T23','T23A','T06','T15','T11'];
const PLANS={full:PLAN,continuity:['T01','T07','T10','T10A'],repair:['T01','T07','T22','T23','T23A']};
export function loadJourneySeedB3({scenario='full'}={}){
 if(!Object.hasOwn(PLANS,scenario))throw Error('Unknown scenario');
 const base=loadBaseJourneySeed();
 const all=new Map(base.turns.map(t=>[t.turn_id,t]));
 const additions=[
 {turn_id:'T10A',message:'To clarify: my T01 question about how photon energy becomes ATP and NADPH was real then, and I understand it now. Keep that earlier note. My current question is about carbon fixation.',scripted_assessment:{topic_id:'sim-photosynthesis',topic_name:'Photosynthesis',root_problem:'Clarifying earlier understanding and current carbon-fixation focus'},expected:{topic_id:'sim-photosynthesis',identity:'no_change'}},
 {turn_id:'T22',message:'I understand that Rubisco fixes CO2 onto RuBP, but I still cannot explain why the unstable six-carbon intermediate immediately splits into two three-carbon 3-PGA molecules in the Calvin cycle.',scripted_assessment:{topic_id:'sim-photosynthesis',topic_name:'Photosynthesis',root_problem:'Why the unstable six-carbon intermediate splits into two three-carbon 3-PGA molecules after Rubisco fixes CO2 to RuBP in the Calvin cycle'},scripted_simulation_transition:{identity:'same',interpretation:'refine'},expected:{topic_id:'sim-photosynthesis',identity:'same',interpretation:'refine'}},
 {turn_id:'T23',message:'You wrongly linked my T07 Calvin-cycle carbon fixation question to the light-reaction ATP and NADPH difficulty. That earlier question belonged with carbon fixation.',scripted_assessment:{topic_id:'sim-photosynthesis',topic_name:'Photosynthesis',root_problem:'Correction of prior Calvin cycle difficulty attribution'},expected:{topic_id:'sim-photosynthesis',identity:'correction'}},
 {turn_id:'T23A',message:'Yes, T07 was wrongly linked to the light-reaction ATP and NADPH difficulty. My T07 Calvin-cycle question was about how CO2 becomes sugars; it belongs with carbon fixation. Keep T01 unchanged.',scripted_assessment:{topic_id:'sim-photosynthesis',topic_name:'Photosynthesis',root_problem:'Clarification specifying the target of a past difficulty correction'},expected:{topic_id:'sim-photosynthesis',identity:'repair_if_fault_present'}}
 ];
 for(const t of additions)all.set(t.turn_id,t);
 return {...base,notice:base.notice+' S1.6B.3: pre-authored learner clarification replies, no autonomous conversation generation.',turns:PLANS[scenario].map(id=>{const t=all.get(id);if(!t)throw Error('Missing journey turn '+id);return structuredClone(t);})};
}
export function parseArgs(argv){
 let scenario='full';const flags=[];for(let i=0;i<argv.length;i++){if(argv[i]==='--scenario'){scenario=argv[++i];if(!scenario)throw Error('Missing scenario');}else if(argv[i]!=='--no-c-retry')flags.push(argv[i]);}
 if(!Object.hasOwn(PLANS,scenario))throw Error('Unsupported scenario');
 const f=baseFlags(flags);f.cRetry=!argv.includes('--no-c-retry');f.scenario=scenario;
 if(!flags.includes('--limit'))f.limit=f.mode==='model'?Math.min(4,PLANS[scenario].length):PLANS[scenario].length;
 if(f.limit>PLANS[scenario].length)throw Error('S1.6B.3 limit exceeds scenario length');
 if(f.mode==='model'&&f.limit>6)throw Error('Paid S1.6B.3 capped at six visits by the original engine');
 return f;
}
function stateFromSeed(seed){return {schema:'myway-s16b3-isolated-state-v1',topics:structuredClone(seed.topics),learnerProgress:[],correctionProposals:[],refinementProposals:[],relationshipHypotheses:[],audit:[],injectedErrors:[],memoryRevisions:[],noSupabaseWrites:true};}
function recordProgress(state,turn,signal){if(signal.reportedProgress||signal.isCorrection){const record={turnId:turn.turn_id,type:signal.signal,quote:clipped(turn.message,500),verification:'learner_report_only_not_demonstrated_mastery'};state.learnerProgress.push(record);state.audit.push({kind:'learner_progress_or_correction',...record});return record;}return null;}
function offlineA(turn){const a=turn.scripted_assessment;return {topic_name:a.topic_name,root_problem:a.root_problem,evidence_quote:turn.message,root_problem_confidence:0.9,next_action:'proceed',clarifying_question:'',confusion:6,insight:1};}
function offlineB(a,intent){return {teaching_strategy:'[OFFLINE STUB, NOT MODEL B] Intent='+intent.intent+'; topic: '+a.root_problem,next_step:'Human review required in paid mode.',visual_intent:'none'};}
function textTokens(s){return new Set(String(s).toLowerCase().match(/[a-z]{4,}/g)||[]);}
function overlap(a,b){const A=textTokens(a),B=textTokens(b);let n=0;for(const w of A)if(B.has(w))n++;return A.size&&B.size?n/Math.sqrt(A.size*B.size):0;}
function offlineRetrieval(state,turn,a){const topic=state.topics.find(x=>x.topic_id===turn.scripted_assessment.topic_id);
 const candidates=state.topics.map(t=>({topicId:t.topic_id,topicLabel:t.topic_label,bestEventSimilarity:Math.max(0,...t.events.map(e=>overlap(a.root_problem,e.root_problem)))})).sort((x,y)=>y.bestEventSimilarity-x.bestEventSimilarity);
 const events=topic?.events.map(e=>({...e,similarity:overlap(a.root_problem,e.root_problem)})).sort((x,y)=>y.similarity-x.similarity).slice(0,5)??[];
 return {retrievalStatus:'OFFLINE_ORACLE_TOPIC_NOT_MODEL_RETRIEVAL',topicId:topic?.topic_id,topicLabel:topic?.topic_label,topicCandidates:candidates,events,integrity:{status:'offline_only',reason:'Scripted topic and lexical memory; no semantic intelligence'}};
}
function offlineC(turn,found){const top=found.events[0];const scripted=turn.scripted_simulation_transition;
 if(scripted?.identity==='distinct')return {identity:'distinct',interpretation:'not_applicable',anchor_event_id:'',identity_rationale:'Scripted free-mode state transition for mechanics only',source:'OFFLINE_STUB'};
 if(scripted?.identity==='same'&&top){const anchor=turn.turn_id==='T22'?(found.events.find(e=>e.event_id==='41885b47-b28d-49ea-828a-89653ec3c09e')??top):top;return {identity:'same',interpretation:scripted.interpretation==='refine'?'refine':'retain',anchor_event_id:anchor.event_id,proposed_hypothesis:turn.scripted_assessment.root_problem,identity_rationale:'Scripted free-mode hypothesis',source:'OFFLINE_STUB'};}
 if(top?.similarity>=0.48)return {identity:'same',interpretation:'retain',anchor_event_id:top.event_id,identity_rationale:'Lexical fixture only',source:'OFFLINE_STUB'};
 return {identity:'uncertain',interpretation:'not_applicable',anchor_event_id:'',missing_evidence:'A real semantic model would be needed',source:'OFFLINE_STUB'};
}
async function post(url,payload){if(!maxPayloadSafe(payload))throw Error('Local shadow payload exceeds conservative 6400-byte cap');const abort=new AbortController();const t=setTimeout(()=>abort.abort(),45000);
 try{const response=await fetch(url,{method:'POST',redirect:'error',cache:'no-store',signal:abort.signal,headers:{Origin:BASE,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));if(!response.ok){const error=Error('HTTP '+response.status+' '+clipped(data.error,160));error.usage=data.usage;throw error;}return data;
 }finally{clearTimeout(t);}
}
export async function initialize(){
 const [{loadRuntime},{loadS13},{CostLedger,parseUsage},{rankFixtureEvidence,evidenceIntegrity},{scoreEvents,chooseHistory},{shadowAssessmentGate}]=await Promise.all([
  import('./runtime-loader.mjs'),import('./s13-evaluator.mjs'),import('./ledger.mjs'),import('./s151-retrieval.mjs'),import('./s14-flow.mjs'),import('./s15-flow.mjs')]);
 const require=createRequire(import.meta.url);const ts=require(path.join(ROOT,'node_modules/typescript/lib/typescript.js'));
 const file=path.join(ROOT,'sandbox/probe-lab/learning-space/myway-shadow-voice-s15.ts');const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});const voice={};new Function('exports',compiled.outputText)(voice);
 return {runtime:loadRuntime(ROOT),s13:loadS13(ROOT),CostLedger,parseUsage,rankFixtureEvidence,evidenceIntegrity,scoreEvents,chooseHistory,shadowAssessmentGate,voice};
}
async function bill(deps,turnId,stage,url,payload,model){
 deps.ledger.reserve(stage,model);const began=performance.now();let data=null,error=null;
 try{data=await (deps.send??post)(url,payload);}catch(e){error=e;}
 deps.ledger.record({caseId:turnId,stage,model:data?.model??model,usage:deps.parseUsage(data??(error?.usage?{usage:error.usage}:null)),elapsedMs:performance.now()-began,status:error?'failed':'ok'});
 if(error)throw Error(`${stage}: ${clipped(error.message,170)}; provider usage may be unknown; STOP`);
 if(!deps.ledger.summary().complete)throw Error(`${stage}: incomplete provider token usage; STOP`);
 return data;
}
async function modelA(deps,turn,ctx,model){const prompt=assessmentPrompt(turn.message,ctx,deps.runtime);
 const payload={userPrompt:prompt.userPrompt,systemPrompt:prompt.systemPrompt+deps.voice.S15_ASSESSMENT_ADDENDUM,responseSchema:deps.runtime.assessment.ASSESSMENT_SCHEMA,model};
 const data=await bill(deps,turn.turn_id,'s16b1_A_'+turn.turn_id,ENDPOINT_A,payload,model);
 const parsed=deps.runtime.assessment.validateAssessment(data.raw,turn.message);
 if(!parsed.assessment)return {assessment:null,gate:{route:'clarify',reason:'Model A validation failed',question:'Which specific part would you like to understand?'},error:parsed.error,contextChars:ctx.usedChars};
 const a=parsed.assessment,base=deps.runtime.assessment.resolveAssessmentRoute(a,null,.65);
 const gate=deps.shadowAssessmentGate(a,'myway',turn.message,null,base);
 return {assessment:a,gate,contextChars:ctx.usedChars,warnings:parsed.warnings??[]};
}
async function modelB(deps,turn,assessment,ctx,model,intent,{clarification=null,resolution=null}={}){const payload={format:'myway_s15_shadow_model_v1',stage:'teaching',context:teacherContextB3(turn.message,assessment,ctx,intent,{clarification,resolution}),model};
 const data=await bill(deps,turn.turn_id,'s16b1_B_'+turn.turn_id,ENDPOINT_BC,payload,model);
 let value;try{value=JSON.parse(data.raw);}catch{return {teaching:null,error:'Invalid teacher JSON'};}
 if(!value||Object.keys(value).sort().join('|')!=='next_step|teaching_strategy|visual_intent'||['teaching_strategy','next_step','visual_intent'].some(k=>typeof value[k]!=='string'||!value[k].trim()||value[k].length>620))return {teaching:null,error:'Invalid compact teacher schema'};
 return {teaching:value,error:null};
}
async function modelRetrieval(deps,state,a){const bank=state.topics.map(t=>({topic_id:t.topic_id,topic_label:t.topic_label,domain:t.domain,events:t.events.map(e=>({event_id:e.event_id,root_problem:e.root_problem,difficulty_id:e.difficulty_id}))}));
 const found=await deps.rankFixtureEvidence(a,{bank});const scored=await deps.scoreEvents(a.root_problem,found.events);const chosen=deps.chooseHistory(scored,found.topicId,5);const integrity=deps.evidenceIntegrity(found,chosen);
 return {...found,events:chosen,integrity};
}
async function modelC(deps,turn,a,found,model,{retry=true}={}){
 const selected=found.events??[];
 if(!selected.length)return {decision:null,attempts:0,validationErrors:['no_history']};
 const input=deps.s13.s13Input({topic_label:found.topicLabel,learner_statement:turn.message,proposed_root_problem:a.root_problem,historical_observations:selected.map(e=>({event_id:e.event_id,root_problem:e.root_problem})),max_similarity:Math.max(...selected.map(e=>e.similarity))});
 if(!deps.s13.validS13Input(input))return {decision:null,attempts:0,validationErrors:['invalid_history_input']};
 const errors=[];for(let n=0;n<(retry?2:1);n++){
  const payload={format:'myway_s15_shadow_model_v1',stage:'memory',context:input,model};
  const response=await bill(deps,turn.turn_id,'s16b1_C_'+turn.turn_id+'_attempt'+(n+1),ENDPOINT_BC,payload,model);
  const parsed=recoverC(deps.s13.parseS13,response.raw,input);
  if(parsed.valid)return {decision:parsed.decision,attempts:n+1,validationErrors:errors};
  errors.push(parsed.diagnostic);
  // Only retry length / formatting issues. Never retry fabricated anchors or identity-schema violations.
  if(!['Invalid explanation lengths','Invalid JSON response','Unexpected response fields'].includes(parsed.diagnostic))break;
 }
 return {decision:null,attempts:errors.length,validationErrors:errors,heldBecause:'model_c_validation_failed'};
}
function explicitRelationships(state,turn){const m=turn.message.toLowerCase();if(!/\b(analogy|compar|similar|different|related|both|like|share a name)\b/.test(m))return [];
 const found=state.topics.filter(t=>[t.topic_label,...(t.aliases??[])].some(n=>n.length>=4&&m.includes(n.toLowerCase())));
 if(found.length<2)return [];
 const pair=found.slice(0,2).map(x=>x.topic_id),id=stableId('relation:'+pair.join('|')+turn.turn_id);
 const proposal={id,turnId:turn.turn_id,from:pair[0],to:pair[1],type:'UNVERIFIED_CONCEPTUAL_COMPARISON',evidence_quote:turn.message,direction:'unknown',automaticGraphWrite:false};
 state.relationshipHypotheses.push(proposal);return [proposal];
}
function injectOfflineFault(state,turn,action){if(turn.turn_id!=='T07'||!action.newEventId)return null;
 const topic=state.topics.find(t=>t.topic_id==='sim-photosynthesis');const current=topic?.events.find(e=>e.event_id===action.newEventId);const wrong=topic?.events.find(e=>/ATP and NADPH/i.test(e.root_problem)&&e.origin==='synthetic_seed');
 if(!current||!wrong)return null;
 const original=current.difficulty_id;current.difficulty_id=wrong.difficulty_id;
 const injected={turnId:turn.turn_id,eventId:current.event_id,from:original,to:wrong.difficulty_id,source:'EXPLICIT_OFFLINE_FAULT_ONLY'};
 state.injectedErrors.push(injected);state.audit.push({kind:'injected_false_link_for_diagnostic',...injected});return injected;
}
export async function runJourney(f,{seed=loadJourneySeedB3({scenario:f.scenario}),deps=null,silent=false}={}){
 const state=stateFromSeed(seed),result={schema:'myway-s16b3-intent-and-repair-v1',mode:f.mode,turns:[],errors:[],cost:null,finalState:null,safeguards:{noDatabaseWrites:true,noProductionPromptChanges:true,syntheticExpectationsNeverSent:true,paidRepairsNotApplied:true},callLedger:[]};
 let live=deps;
 if(f.mode==='model'){live??=await initialize();live.ledger??=new live.CostLedger(live.runtime.cost,f.budget);}
 let pending=null;
 for(const turn of seed.turns.slice(0,f.limit)){
  const ctx=compactContext(result.turns,turn.message),intent=inferIntent(turn.message,{pending,previous:result.turns});
  const signal={signal:intent.intent,isCorrection:intent.intent==='correction',reportedProgress:/\b(?:i (?:now )?understand|i understand|i get|i know now|i can follow)\b/i.test(turn.message)};
  const tr={turnId:turn.turn_id,message:turn.message,context:{usedTurns:ctx.usedTurns,usedChars:ctx.usedChars,records:ctx.prior},intent,signal,assessment:null,gate:null,teaching:null,teachingReview:null,retrieval:null,integrity:null,modelC:null,modelCDiagnostics:null,progress:null,correction:null,resolution:null,refinementGate:null,positiveRefinement:null,memoryClarification:null,relationships:[],action:{kind:'not_started'},error:null,source:f.mode==='model'?'LIVE_GPT_MODELS':'OFFLINE_SCRIPTED'};
  // Handle the prior learner correction BEFORE a new model call. Answer is not a new difficulty.
  if(intent.intent==='clarification_answer'&&pending){
   tr.resolution=resolveCorrection(state,pending,turn,{mode:f.mode,allowSyntheticRepair:f.mode==='offline'&&f.injectFault});
   if(tr.resolution.status!=='NEEDS_MORE_EVIDENCE')pending=null;
  }
  if(intent.intent==='correction'){
   tr.correction=markPending(state,correctionRecord(state,turn,result.turns,{isCorrection:true}));
   tr.memoryClarification=tr.correction?.clarification??null;
   if(tr.memoryClarification){const previousText=result.turns.find(t=>t.turnId==='T01')?.message??'';
    const cited=turn.message.match(/\b(T\d{2})\b/i)?.[1]?.toUpperCase();
    if(cited&&tr.correction?.rankedTargets?.some(e=>e.priorTurnId===cited))tr.memoryClarification.question='Are you saying your earlier Calvin-cycle question was assigned to the light-reaction difficulty, and that the earlier photon-energy question should stay unchanged?';
    else if(/ATP formation/i.test(turn.message)&&previousText)tr.memoryClarification.question='Was your earlier question about how photon energy becomes ATP and NADPH a real difficulty at that time, or was the question always about carbon fixation?';
   }
   pending=tr.correction;
  }
  if(signal.reportedProgress||intent.intent==='clarification_answer')tr.progress=recordProgress(state,turn,signal);
  try{
   // Previous assessment is reused for clarification/progress, saving A and C calls.
   if(assessmentSkip(intent.intent)){
    const priorAssessment=[...result.turns].reverse().find(t=>t.assessment)?.assessment;
    tr.assessment=intent.intent==='correction'||intent.intent==='clarification_answer'?{topic_name:'Continuing learner correction',root_problem:'Clarify earlier learning difficulty attribution without inventing a new difficulty',evidence_quote:turn.message,root_problem_confidence:0,next_action:'proceed',clarifying_question:''}:(priorAssessment?{...priorAssessment}:offlineA(turn));
    tr.gate={route:'proceed',reason:'intent-only turn: skip Model A and avoid interpreting this as a new difficulty'};
   }else if(f.mode==='model'){
    const a=await modelA(live,turn,ctx,f.model);tr.assessment=a.assessment;tr.gate=a.gate;
    if(a.error)tr.assessmentWarning=a.error;
   }else{tr.assessment=offlineA(turn);tr.gate={route:'proceed',reason:'OFFLINE SCRIPTED, NOT MODEL A'};}
   if(tr.gate.route!=='proceed'||!tr.assessment){tr.action={kind:'hold_for_clarification',reason:tr.gate.question??tr.assessmentWarning};}
   else{
    if(f.mode==='model'){
     const b=await modelB(live,turn,tr.assessment,ctx,f.model,intent,{clarification:tr.memoryClarification,resolution:tr.resolution});tr.teaching=b.teaching;tr.teacherError=b.error??null;
    }else tr.teaching=offlineB(tr.assessment,intent);
    tr.teachingReview=teacherReview(tr.teaching,intent);
    if(intent.intent==='clarification_answer')tr.action={kind:tr.resolution?.applied?'simulated_repair_applied':tr.resolution?.status==='RESOLVED_NO_CHANGE'?'clarification_resolved_no_change':'clarification_pending_evidence',resolutionStatus:tr.resolution?.status??null};
    else if(intent.intent==='reported_progress')tr.action={kind:'progress_only_no_memory_change'};
    else if(intent.intent==='correction')tr.action={kind:'correction_hold',reason:'Clarify which prior historical interpretation is disputed; no Model C or automatic relink',question:tr.memoryClarification?.question??null};
    else{
     const found=f.mode==='model'?await modelRetrieval(live,state,tr.assessment):offlineRetrieval(state,turn,tr.assessment);
     tr.retrieval={topicId:found.topicId,topicLabel:found.topicLabel,topicCandidates:found.topicCandidates.slice(0,5),selectedEvents:found.events};tr.integrity=found.integrity;
     if(f.mode==='model'&&found.integrity.status!=='candidate_ready')tr.action={kind:'memory_hold',reason:found.integrity.reason};
     else{
      const c=f.mode==='model'?await modelC(live,turn,tr.assessment,found,f.model,{retry:f.cRetry}):{decision:offlineC(turn,found),attempts:0,validationErrors:[]};
      tr.modelC=c.decision;tr.modelCDiagnostics={attempts:c.attempts,validationErrors:c.validationErrors,heldBecause:c.heldBecause??null};
      tr.refinementGate=refinementEvidence({state,retrieval:found,decision:c.decision,assessment:tr.assessment,learnerMessage:turn.message});
      if(c.decision?.identity==='same'&&c.decision?.interpretation==='refine'){
       const anchored=state.topics.find(t=>t.topic_id===found.topicId)?.events.find(e=>e.event_id===c.decision.anchor_event_id);
       if(anchored)tr.positiveRefinement=proposedRefinementPositive({state,topicId:found.topicId,anchorDifficultyId:anchored.difficulty_id,message:turn.message,proposedRoot:c.decision.proposed_hypothesis});
      }
      const unsupported=tr.refinementGate?.status==='retain_without_supported_refinement';
      const accepted=tr.positiveRefinement?.accepted&&tr.refinementGate?.status==='unverified_specificity_candidate';
      const effective=c.decision?.identity==='same'&&c.decision?.interpretation==='refine'&&!accepted?{...c.decision,interpretation:'retain'}:c.decision;
      if(unsupported||c.decision?.interpretation==='refine'&&!accepted)state.audit.push({kind:'unsupported_refinement_suppressed',turnId:turn.turn_id,reason:tr.refinementGate?.reason??'missing positive specificity'});
      tr.action=evolveSafely(state,turn,tr.assessment,found,effective,{correction:false});
      if(!c.decision)tr.action={kind:'memory_hold',reason:'Model C invalid or no sufficient evidence'};
      if(f.mode==='offline'&&f.injectFault)tr.injectedFault=injectOfflineFault(state,turn,tr.action);
     }
    }
    tr.relationships=explicitRelationships(state,turn);
   }
  }catch(e){tr.error=clipped(e?.message??e,250);tr.action={kind:'stopped_on_operational_error'};result.errors.push({turnId:turn.turn_id,error:tr.error});result.turns.push(tr);break;}
  result.turns.push(tr);
  if(!silent)console.log(`TURN ${tr.turnId} | intent=${intent.intent} | A=${assessmentSkip(intent.intent)?'reused':tr.assessment?'yes':'no'} | B=${tr.teaching?'yes':'no'} | C=${tr.modelC?.identity??'skipped'} | action=${tr.action.kind}`);
 }
 result.finalState=state;result.cost=live?.ledger?.summary()??{attemptedCalls:0,knownEstimatedUsd:0,complete:true,notInvoice:true};result.callLedger=live?.ledger?.rows??[];
 result.summary={processed:result.turns.length,modelCalls:result.cost.attemptedCalls,modelBRealResponses:result.turns.filter(t=>f.mode==='model'&&t.teaching).length,intents:Object.fromEntries([...new Set(result.turns.map(t=>t.intent.intent))].map(i=>[i,result.turns.filter(t=>t.intent.intent===i).length])),modelASkipped:result.turns.filter(t=>assessmentSkip(t.intent.intent)).length,modelCSkippedByIntent:result.turns.filter(t=>memorySkip(t.intent.intent)).length,refinementsSuppressed:state.audit.filter(x=>x.kind==='unsupported_refinement_suppressed').length,positiveRefinementCandidates:result.turns.filter(t=>t.positiveRefinement?.accepted).length,refinementProposals:state.refinementProposals.length,correctionCandidates:state.correctionProposals.length,correctionsResolvedWithoutChange:state.correctionProposals.filter(c=>c.status==='RESOLVED_NO_CHANGE').length,simulatedRepairsApplied:state.memoryRevisions.length,revisionAudit:checkRevisions(state),relationshipsUnverified:state.relationshipHypotheses.length,liveWrites:0,operationalErrors:result.errors.length};
 return result;
}
export function formatReport(r){const lines=[];const o=(...x)=>lines.push(...x);
 o('MYWAY S1.6B.3 — INTENT-AWARE TEACHING AND CORRECTION RESOLUTION','='.repeat(86),`Mode: ${r.mode}. Same synthetic learner, prewritten clarification answers, local-only memory.`,
  'IMPORTANT: offline outputs are scripted. Model-mode outputs require independent educational review.',
  'Never updates Supabase, production prompts, authoritative memory or real topic relationships.','',
  'SUMMARY',JSON.stringify(r.summary,null,2),'');
 for(const t of r.turns){o(`===== ${t.turnId} =====`,'LEARNER: '+t.message,
  `CONTEXT (recent ${t.context.usedTurns} turns, ${t.context.usedChars} characters): ${JSON.stringify(t.context.records)}`,
  `LEARNER INTENT (HEURISTIC): ${JSON.stringify(t.intent)}`,
  `LEARNER SIGNAL: ${t.signal.signal}; note: reported progress is not demonstrated mastery`,
  `MODEL A: ${JSON.stringify(t.assessment)}`,
  `ASSESSMENT GATE: ${JSON.stringify(t.gate)}`,
  'MODEL B — TEACHING: '+clipped(t.teaching?.teaching_strategy??'(not available)',1000),
  'NEXT STEP: '+clipped(t.teaching?.next_step??'(not available)',700),
  'VISUAL: '+clipped(t.teaching?.visual_intent??'none',700),
  'MODEL B REVIEW (human; not auto-scored): accurate mechanism? acknowledges correction? adapts to earlier teaching? sounds like MyWay? useful next step?',
  `RETRIEVAL: ${JSON.stringify(t.retrieval?.topicCandidates?.slice(0,3)??[])}`,
  `INTEGRITY: ${JSON.stringify(t.integrity)}`,
  `MODEL C: ${JSON.stringify(t.modelC)}`,
  `MODEL C VALIDATION/RECOVERY: ${JSON.stringify(t.modelCDiagnostics)}`,
  `REFINEMENT SUPPORT GATE (lexical evidence, not semantic proof): ${JSON.stringify(t.refinementGate)}`,
  `CORRECTION TARGETS (ranked, none selected for write): ${JSON.stringify(t.correction?.rankedTargets??[])}`,
  `TARGETED MEMORY CLARIFICATION: ${JSON.stringify(t.memoryClarification)}`,
  `TEACHER REVIEW: did it acknowledge an explicit correction before explaining?`,
  `SIMULATED MEMORY ACTION: ${JSON.stringify(t.action)}`,
  `LEARNER PROGRESS: ${JSON.stringify(t.progress)}`,
  `CORRECTION CANDIDATE: ${JSON.stringify(t.correction)}`,
  `CLARIFICATION RESOLUTION: ${JSON.stringify(t.resolution)}`,
  `MODEL B INTENT-AWARE STYLE FLAGS: ${JSON.stringify(t.teachingReview)}`,
  `POSITIVE REFINEMENT EVIDENCE: ${JSON.stringify(t.positiveRefinement)}`,
  `RELATIONSHIP HYPOTHESES (unverified): ${JSON.stringify(t.relationships)}`);
  if(t.injectedFault)o('TEST-ONLY INJECTED FAULT: '+JSON.stringify(t.injectedFault));
  if(t.error)o('OPERATIONAL STOP: '+t.error);
  o('');}
 o('===== CANONICAL DIFFICULTY IDENTITIES (EARLIEST RECORD WINS) =====');
 for(const topic of r.finalState.topics){const ids=new Map();for(const e of topic.events){if(!ids.has(e.difficulty_id))ids.set(e.difficulty_id,[]);ids.get(e.difficulty_id).push(e);}o(`${topic.topic_label}: ${ids.size} identities, ${topic.events.length} observations`);for(const [id,events] of ids)o(` ${id} — ${events[0].root_problem} (${events.length} observations)`);}
 o('','===== LEARNER-REPORTED PROGRESS (NOT VERIFIED MASTERY) =====',...r.finalState.learnerProgress.map(x=>JSON.stringify(x)),'',
  '===== REVIEWABLE REFINEMENTS — CANONICAL ROOTS UNCHANGED =====',...r.finalState.refinementProposals.map(x=>JSON.stringify(x)),'',
  '===== RANKED CORRECTION EVIDENCE / CLARIFICATION — NO AUTO RE-LINKS =====',...r.finalState.correctionProposals.map(x=>JSON.stringify(x)),'',
  '===== SIMULATED REVERSIBLE MEMORY REVISIONS (OFFLINE ONLY) =====',...r.finalState.memoryRevisions.map(x=>JSON.stringify(x)),'',
  '===== UNVERIFIED RELATIONSHIPS =====',...r.finalState.relationshipHypotheses.map(x=>JSON.stringify(x)),'',
  '===== AUDIT AND ERROR DIAGNOSTICS =====',...r.finalState.audit.map(x=>JSON.stringify(x)),...r.errors.map(x=>JSON.stringify(x)),'',
  '===== COST =====',JSON.stringify(r.cost,null,2),'',
  'LIMITATIONS: Intent, refinement evidence and correction ranking are heuristic safeguards, NOT expert/semantic decisions. Offline repair uses user wording and lexical support, NOT an independent semantic verifier. Prior context is compact, not a full multi-turn dialog. Seeded learner responses are not generated from teaching. Model C validation retry may make one additional paid call per turn; paid runs NEVER apply corrections; errors with unknown usage stop the run. Relationship discovery and autonomous repair remain unvalidated. No authoritative memory writes.');
 return lines.join('\n')+'\n';
}
export function save(r){const directory=path.join(REPORT_ROOT,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
 if(!path.resolve(directory).startsWith(path.resolve(REPORT_ROOT)+path.sep)||fs.existsSync(directory))throw Error('Unsafe report path');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 for(const [name,obj] of [['S16B3_INTENT_REVIEW.txt',formatReport(r)],['trace.json',JSON.stringify(r,null,2)+'\n'],['final-state.json',JSON.stringify(r.finalState,null,2)+'\n']])fs.writeFileSync(path.join(directory,name),obj,{flag:'wx',mode:0o600});
 return directory;}
function guard(){const original=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8'));if(original.release!=='v37d2c7a3s12')throw Error('Unexpected guarded local release');
 if(!fs.existsSync(path.join(ROOT,'scripts/sandbox/v37d2c7a3s16b2/installation.json')))throw Error('S1.6B.2 missing');
 if(sha(path.join(HERE,'s16b-journey.mjs'))!==ALLOWED_JOURNEY_HASH||sha(path.join(HERE,'s16-space-sim.mjs'))!==ALLOWED_ENGINE_HASH)throw Error('Source baseline drift; refusing paid longitudinal run');}
async function main(){const f=parseArgs(process.argv.slice(2));if(f.help){console.log('S1.6B.3 --mode offline|model [--scenario full|continuity|repair] [--limit 1..10] [--inject-fault OFFLINE ONLY] [--allow-spend --budget-usd 0.03..0.50 MODEL ONLY] [--no-c-retry]. Paid max 6 turns. Local Next :3001 and embeddings :8001 for model. No database writes.');return;}
 guard();console.log(`S1.6B.3 intent-aware continuity | ${f.mode} | visits=${f.limit} | LIVE DB WRITES=0`);
 if(f.mode==='model')console.log(`PAID OPT-IN: ${f.model} | up to ${f.limit*(f.cRetry?4:3)} admission-planned calls (actual less due to intent skips); $${f.budget} USD is NOT a hard billing cap`);
 const result=await runJourney(f);const dir=save(result);console.log('NOTEPAD: '+path.join(dir,'S16B3_INTENT_REVIEW.txt'));console.log('TRACE: '+path.join(dir,'trace.json'));console.log('MEMORY: '+path.join(dir,'final-state.json'));console.log('SUMMARY: '+JSON.stringify(result.summary));console.log('COST: '+JSON.stringify(result.cost));if(result.errors.length)process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S1.6B.3 REFUSED: '+clipped(e?.message??e,350));process.exitCode=1;});
