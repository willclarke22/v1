#!/usr/bin/env node
/** S1.6B.5.7-R1: consent-first scene offer + assessment-informed teaching; prior runners preserved. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {assessGuard} from './s16b54-core.mjs';
import {MODEL,RATE,A_SCHEMA,requestA,requestB,validatedJson,validateReply,credentials,callProvider,usageCost} from './s16b54-models.mjs';
import {C55_SCHEMA} from './s16b55-core.mjs';
import {SCENE_SCHEMA,ACTION_SCHEMA,INTERPRET_SCHEMA,validatePlan,compileScene,publicScene,validateAction,gradeAction,feedbackFor,scriptedAction,compactEvidence,validateInterpretation} from './s16b57-activity.mjs';
import {DECISION_SCHEMA,validateDecision,visibleOffer,eligibleForActivity,seededLearnerBelief,teachingBrief,adaptationDisposition} from './s16b57r1-loop.mjs';
import {SCHEMA,scenarioCheck,createState,contextForB,retrieve,createObservation,recordCommitment,observeIntent,recordPreference,memoryProposal,projection} from './s16b56-core.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)), ROOT=path.resolve(HERE,'../../..');
// Trace objects are historical snapshots; never retain mutable references to the live memory graph.
const snapshot=value=>JSON.parse(JSON.stringify(value));
const L_SCHEMA={type:'object',additionalProperties:false,properties:{learner:{type:'string'}},required:['learner']};
export function loadScenario(){return scenarioCheck(JSON.parse(fs.readFileSync(path.join(HERE,'s16b56-scenario.json'),'utf8')));}
export function parseArgs(argv){
 const o={mode:'offline',limit:null,history:'resumed',retrieval:'lexical',learner:'scripted',personalization:'on',allowSpend:false,budget:null,activity:'simulated',activityProfile:'needs-feedback',help:false};
 const valid=new Set(['--mode','--limit','--history','--retrieval','--learner','--personalization','--budget-usd','--activity','--activity-profile']);
 for(let i=0;i<argv.length;i++){const k=argv[i];if(k==='--help'){o.help=true;continue;}if(k==='--allow-spend'){o.allowSpend=true;continue;}if(!valid.has(k)||!argv[i+1])throw Error('Unknown or missing option '+k);const v=argv[++i];if(k==='--budget-usd')o.budget=Number(v);else if(k==='--limit')o.limit=Number(v);else if(k==='--activity-profile')o.activityProfile=v;else o[k.slice(2)]=v;}
 if(!['offline','model'].includes(o.mode)||!['resumed','full'].includes(o.history)||!['lexical','semantic'].includes(o.retrieval)||!['scripted','model'].includes(o.learner)||!['on','off'].includes(o.personalization)||!['simulated','off'].includes(o.activity)||!['adaptive','correct','needs-feedback','persistent-error','decline'].includes(o.activityProfile))throw Error('Invalid mode/history/retrieval/learner/personalization');
 if(o.limit===null)o.limit=o.mode==='offline'?12:6;
 if(!Number.isInteger(o.limit)||o.limit<1||o.limit>12)throw Error('Limit must be 1..12');
 if(o.mode==='offline'&&(o.learner!=='scripted'||o.allowSpend||o.budget!==null))throw Error('Offline simulation only supports scripted learner and zero paid flags');
 // Explicit synthetic-belief variants may now be tested with Model L, without forcing an answer key. 
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<0.08||o.budget>0.80))throw Error('Paid run needs explicit --allow-spend --budget-usd 0.08..0.80');
 return o;
}
export function admissionEstimate(n,learner){const calls=2*n+Math.ceil(n/2)+(learner==='model'?n-1:0)+5;return +((calls+6)*(12000*RATE.input+750*RATE.output)/1e6).toFixed(6);}
function git(dir,...args){return execFileSync('git',['-C',dir,...args],{encoding:'utf8',timeout:12000,stdio:['ignore','pipe','pipe']}).trim();}
export function checkRoot(paid){if(path.basename(ROOT).toLowerCase()!=='v1-learning-experiment'||git(ROOT,'branch','--show-current')!=='myway/learning-sandbox-v3_7a')throw Error('Not guarded experimental worktree');
 const orig=path.join(path.dirname(ROOT),'v1');if(git(orig,'branch','--show-current')!=='main'||git(orig,'rev-parse','--verify','HEAD^{commit}')!=='462a7a4b6ce8b2b20a91021acca716307f4aa2d1')throw Error('Original protected main drift');
 if(JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8')).release!=='v37d2c7a3s12')throw Error('Local release pointer drift');
 for(const s of ['s16b54','s16b55','s16b55r1'])if(!fs.existsSync(path.join(ROOT,`scripts/sandbox/v37d2c7a3${s}/installation.json`)))throw Error('Missing predecessor receipt '+s);
 if(paid&&(process.env.VERCEL==='1'||process.env.CI==='true'||process.env.NODE_ENV==='production'))throw Error('Paid calls not permitted in CI/cloud/production');
}
export function validateCWithoutLabelGate(raw,candidates){
 if(!raw||typeof raw!=='object'||!['same','distinct','refinement','uncertain'].includes(raw.identity)||typeof raw.rationale!=='string'||!raw.rationale.trim()||raw.rationale.length>2000)return {decision:null,guard:{action:'hold',reason:'invalid_C_contract'}};
 if(['same','refinement'].includes(raw.identity)&&!candidates.some(x=>x.id===raw.anchor_id))return {decision:null,guard:{action:'hold',reason:'unknown_or_missing_historical_anchor'}};
 if(['distinct','uncertain'].includes(raw.identity)&&raw.anchor_id!==null)return {decision:null,guard:{action:'hold',reason:'nonmatching_anchor_for_identity'}};
 // Deliberately no free-text topic-label equality veto; retrieval and exact cited ID provide context.
 return {decision:{identity:raw.identity,anchor_id:raw.anchor_id,rationale:raw.rationale},guard:{action:'accepted',reason:'schema_and_exact_anchor_only; semantic correctness not asserted'}};
}
function requestL({step,priorReply,sessionTurns,preferences}){
 const content={scenario_goal_not_answer_key:step.aim,previous_tutor_reply:priorReply,conversation:sessionTurns.slice(-3).map(t=>({learner:t.learner,tutor:t.reply})),preferences,activity_evidence:step.activity_evidence??null};
 return {model:MODEL,store:false,max_tokens:200,messages:[{role:'system',content:'You are generating a SYNTHETIC learner message for a local software test. Be a realistic, sometimes skeptical learner rather than a cooperative answer-key. Reply contingent on the previous tutor message. Ask for clarification, offer imperfect reasoning or challenge inaccuracies when warranted. Stay within the educational goal without repeating scripted wording or introducing personal information. Write one learner utterance of 12-90 words, not a teacher response.'},{role:'user',content:JSON.stringify(content)}],response_format:{type:'json_schema',json_schema:{name:'myway_s16b56_learner',strict:true,schema:L_SCHEMA}}};
}
function contextualRequestC(a,candidates,current){
 const note={current_learner_message:current,current_root_hypothesis:a.root_problem,evidence_quote:a.evidence_quote,current_topic_label:a.topic_label,historical_candidates:candidates.map(c=>({id:c.id,topic_label:c.topic_label,root:c.root_problem,original_learner_quote:c.first_quote,source_turn:c.source_turn,similarity:c.similarity}))};
 return {model:MODEL,store:false,max_tokens:280,messages:[{role:'system',content:'You are MyWay research Model C. Judge whether a proposed learning difficulty refers to the same underlying issue, a distinct issue, a refinement, or is uncertain. Different text topic labels do NOT by themselves prove different topics. Similarity does not prove identity. For same/refinement, cite an exact listed historical root ID; for distinct/uncertain use null. Learner questions indicate uncertainty, not necessarily a confidently held misconception. Give a concise rationale. Never infer mastery or claim to update memory.'},{role:'user',content:JSON.stringify(note)}],response_format:{type:'json_schema',json_schema:{name:'myway_s16b56_C',strict:true,schema:C55_SCHEMA}}};
}
// One optional activity offer, only after the learner has discussed the supported mechanism.
const offlinePlan={offer:true,modality:'2d',title:'Compare the two proton gradients',learning_goal:'Show which side accumulates H+ and which way protons travel through ATP synthase in mitochondria versus chloroplasts.',reason_for_activity:'The learner asked about whether the compartments are functionally equivalent; manipulation can surface direction confusions.',learner_instruction:'Drag an H+ marker into the high-proton compartment of each organelle, then choose the arrow showing the flow through ATP synthase.',followup_question:'What stays the same about chemiosmosis despite the different compartments?'};
function requestScene(learner,reply,roots){return {model:MODEL,store:false,max_tokens:500,messages:[{role:'system',content:'You are MyWay Model B proposing an OPTIONAL, research-only interactive learning activity. The renderer does not exist; never claim a scene is shown. Only supported scene family: comparison of H+ accumulation in mitochondria vs chloroplasts and flow through ATP synthase. Decide if this activity would materially help the learner; if not, offer=false. If offering, choose 2d or 3d based on learning objective, write clear labels and a learner instruction (placing H+ markers and selecting arrows). Be scientifically correct. No learner profile claims. The proposal will be compiled into a fixed interactive scene contract with independently defined biology answers.'},{role:'user',content:JSON.stringify({current_learner_message:learner,tutor_response:reply,recent_roots:roots.map(x=>x.root_problem)})}],response_format:{type:'json_schema',json_schema:{name:'myway_s57_scene_plan',strict:true,schema:SCENE_SCHEMA}}};}
function requestOfferDecision(offer,profile,learner){return {model:MODEL,store:false,max_tokens:125,messages:[{role:'system',content:'Play a SYNTHETIC learner, not a teacher. You just heard an OPTIONAL activity offered in the tutor conversation. Choose accept or decline based on your simulated character, without being required to participate. Return a short reason. This is not a human preference measurement. '+seededLearnerBelief(profile)},{role:'user',content:JSON.stringify({learner_message:learner,actual_offer_text:offer})}],response_format:{type:'json_schema',json_schema:{name:'myway_s57r1_offer_decision',strict:true,schema:DECISION_SCHEMA}}};}
function requestActivityLearner(scene,attempt,feedback,profile){return {model:MODEL,store:false,max_tokens:400,messages:[{role:'system',content:'You are a synthetic learner participating in a SIMULATED visual interaction, not a real human or a teacher. You accepted an optional activity. Select from VISIBLE targets and paths; private scoring is withheld. You may make mistakes, request a hint, revise after feedback, and explain your choices. Do not game a hidden answer key. '+seededLearnerBelief(profile)+' You may withdraw using accept=false and all choices none.'},{role:'user',content:JSON.stringify({visible_scene:publicScene(scene),attempt,previous_feedback:feedback??null})}],response_format:{type:'json_schema',json_schema:{name:'myway_s57_synthetic_activity',strict:true,schema:ACTION_SCHEMA}}};}
function requestActivityFeedback(scene,graded){return {model:MODEL,store:false,max_tokens:320,messages:[{role:'system',content:'You are MyWay Model B in a SIMULATED 2D/3D learning activity. Based on independently checked learner actions, give brief accurate feedback, correct wrong choices gently, and ask for one retry if useful. Do not claim a real scene was rendered or real human learned. The feedback must not claim mastery. User may decline.'},{role:'user',content:JSON.stringify({scene_title:scene.title,task_goal:scene.goal,checked_actions:graded.by_control,neutral_feedback:feedbackFor(graded),learner_reasoning:graded.explanation})}],response_format:{type:'json_schema',json_schema:{name:'myway_s57_activity_feedback',strict:true,schema:{type:'object',additionalProperties:false,properties:{reply:{type:'string'}},required:['reply']}}}};}
function requestActivityAssessment(scene,evidence,history){return {model:MODEL,store:false,max_tokens:620,messages:[{role:'system',content:'You are MyWay research Model A evaluating synthetic interactive TASK EVIDENCE, not an actual learner. Explain precisely what selections and explanations demonstrate, remaining gaps and any within-person cross-context asymmetry (mitochondria versus chloroplasts). Never infer stable learning styles, causality, general mastery, or a preferred medium from one trial, even when answers improve after feedback. A correct choice without explanation provides limited evidence. A decline is not a failure. Suggest a next teaching move in plain language.'},{role:'user',content:JSON.stringify({scene_goal:scene.goal,score_evidence:evidence,preceding_message:history})}],response_format:{type:'json_schema',json_schema:{name:'myway_s57_activity_assessment',strict:true,schema:INTERPRET_SCHEMA}}};}
function requestAdaptiveContinuation({scene,offerDecision,evidence,assessment,assessment_status}){
 return {model:MODEL,store:false,max_tokens:300,messages:[{role:'system',content:'You are MyWay Model B speaking NATURALLY to a learner immediately after an OPTIONAL simulated interaction. The visual is NOT rendered and responses are synthetic. Base your next teaching move on the observed scored selections, learner explanation, and Model A research interpretation. If Model A is missing/invalid, rely on observed evidence alone. Do not infer stable learning styles, causal visual benefits, general mastery or transfer from one task. Ask at most one useful follow-up question, or honor decline. Do not announce scores unless pedagogically useful.'},{role:'user',content:JSON.stringify({scene_title:scene?.title??null,offer_decision:offerDecision,activity:teachingBrief({scene_id:scene?.scene_id,evidence,assessment,assessment_status})})}],response_format:{type:'json_schema',json_schema:{name:'myway_s57r1_adaptive_continuation',strict:true,schema:{type:'object',additionalProperties:false,properties:{reply:{type:'string'}},required:['reply']}}}};
}
async function executeActivity({mode,learnerMode,profile,step,learner,reply,retrieval,invoke,state}){
 const rawPlan=mode==='offline'?offlinePlan:validatedJson(await invoke('B',requestScene(learner,reply,retrieval.candidates)),SCENE_SCHEMA);
 const proposal=validatePlan(rawPlan);
 if(!proposal.offer)return {status:'not_offered',visible_offer:null,scene:null,activity_evidence:null,assessment:null,next_tutor_reply:null,proposed_plan:proposal};
 const offer=visibleOffer(proposal); // appended to actual user-facing tutor turn before decision
 const decision=mode==='offline'?validateDecision({accept:profile!=='decline',reason:profile==='decline'?'I would rather talk it through.':'I am willing to try.'}):
  validateDecision(validatedJson(await invoke('L',requestOfferDecision(offer,profile,learner)),DECISION_SCHEMA));
 const scene=compileScene(proposal,step.id),attempts=[];let tutorFeedback=null;
 if(!decision.accept){const evidence=compactEvidence(scene,[gradeAction(scriptedAction('decline',1),scene,1)]);
  const decisionRecord={turn_id:step.id,scene_id:scene.scene_id,source:'synthetic_interaction_not_human',evidence,assessment:null,assessment_status:'declined_not_assessed',offer_decision:decision,mastery_claim:false};
  state.activity_observations.push(decisionRecord);
  state.personalization_hypotheses.push({source_turn:step.id,scene_id:scene.scene_id,signal:'activity_declined_not_a_learning_failure',status:'insufficient_evidence_for_stable_preference'});
  const nextTutorReply=mode==='model'?validateReply(await invoke('B',requestAdaptiveContinuation({scene,offerDecision:decision,evidence,assessment:null,assessment_status:'declined_not_assessed'}))):'No problem. We can explore it in words instead.';
  state.activity_adaptations.push({source_turn:step.id,scene_id:scene.scene_id,disposition:adaptationDisposition(evidence,null),model_a_used:false});
  return {status:'simulated_declined',visible_offer:offer,offer_decision:decision,proposed_plan:proposal,scene,attempts:[],activity_evidence:evidence,assessment:null,assessment_status:'declined_not_assessed',next_tutor_reply:nextTutorReply};
 }
 for(let attempt=1;attempt<=2;attempt++){
  const raw=learnerMode==='model'&&mode==='model'?validatedJson(await invoke('L',requestActivityLearner(scene,attempt,tutorFeedback,profile)),ACTION_SCHEMA):scriptedAction(profile,attempt);
  const score=gradeAction(validateAction(raw,scene),scene,attempt);attempts.push(score);
  if(!score.accepted||score.correct===score.total||attempt===2)break;
  tutorFeedback=mode==='offline'?feedbackFor(score):validateReply(await invoke('B',requestActivityFeedback(scene,score)));
 }
 const evidence=compactEvidence(scene,attempts);let assessment=null,assessment_status='offline_not_model',assessment_error=null;
 if(mode==='model'){
  try{assessment=validateInterpretation(validatedJson(await invoke('A',requestActivityAssessment(scene,evidence,learner)),INTERPRET_SCHEMA));assessment_status='real_model_validated_unscored';}
  catch(err){if(/transport error|incomplete billing/i.test(String(err)))throw err;assessment_status='invalid_activity_assessment';assessment_error=String(err?.message??err).slice(0,200);}
 }else assessment={demonstrated_understanding:'Only the recorded choices and explanation are observed.',remaining_uncertainty:'Check any incorrect selections; retained learning not shown.',cross_context_transfer:'Compare observed results in the two organelles without claiming a transfer mechanism.',teaching_approach_hypothesis:'A single synthetic interaction cannot establish preferred modality or causal benefit.',next_teaching_move:evidence.improvement_after_feedback?'Check transfer using a new example, without answer choices.':evidence.first_score==='4/4'?'Ask for a novel mechanistic prediction.':'Revisit the remaining task-specific misconceptions without assuming stable preference.',confidence:'low'};
 const observation={turn_id:step.id,scene_id:scene.scene_id,source:'synthetic_interaction_not_human',modality:scene.modality,evidence,assessment,assessment_status,assessment_error,offer_decision:decision,mastery_claim:false};
 state.activity_observations.push(observation);
 const outcome=adaptationDisposition(evidence,assessment);
 state.activity_adaptations.push({source_turn:step.id,scene_id:scene.scene_id,disposition:outcome,model_a_used:!!assessment&&assessment_status==='real_model_validated_unscored'});
 const trend=evidence.improvement_after_feedback?'improved_after_feedback_not_visual_causality':outcome.kind==='remaining_task_errors'?'uncertainty_persisted':outcome.kind==='first_attempt_success'?'first_try_success_not_modality_preference':'activity_observed';
 state.personalization_hypotheses.push({source_turn:step.id,scene_id:scene.scene_id,signal:trend,status:'insufficient_evidence_for_stable_preference',requires:'repeat comparison across teaching approaches with genuine human outcomes'});
 const first=attempts.find(x=>x.accepted);if(first){const m=first.by_control.filter(x=>x.control_id.startsWith('mitochondrion')&&!x.correct),c=first.by_control.filter(x=>x.control_id.startsWith('chloroplast')&&!x.correct);
  state.learner_relationship_hypotheses.push({source_turn:step.id,scene_id:scene.scene_id,kind:'within_person_cross_context_comparison',observed_mitochondrion_errors:m.map(x=>x.control_id),observed_chloroplast_errors:c.map(x=>x.control_id),possible_transfer_issue:m.length!==c.length,interpretation:'Task-specific asymmetry only; not proof of cross-topic transfer.',status:'provisional'});}
 const nextTutorReply=mode==='model'?validateReply(await invoke('B',requestAdaptiveContinuation({scene,offerDecision:decision,evidence,assessment,assessment_status}))):outcome.next;
 return {status:evidence.accepted?'simulated_interaction_completed':'simulated_withdrawn',visible_offer:offer,offer_decision:decision,proposed_plan:proposal,scene,attempts,activity_evidence:evidence,assessment,assessment_status,assessment_error,next_tutor_reply:nextTutorReply};
}
export async function runStudy(options,{scenario=loadScenario(),rootCheck=true,send=callProvider,credential=credentials,embeddingsFetch=fetch,teacher=null,learnerGenerator=null}={}){
 scenarioCheck(scenario);if(rootCheck)checkRoot(options.mode==='model');
 const steps=scenario.sessions.flatMap(s=>s.steps.map(step=>({...step,session_id:s.id,session_name:s.name}))).slice(0,options.limit);
 const admission=admissionEstimate(steps.length,options.learner);
 if(options.mode==='model'&&admission>options.budget+1e-12)throw Error('Insufficient admission budget; estimated '+admission+' USD, not an invoice cap');
 const auth=options.mode==='model'?credential():null,state=createState();const ledger={calls:0,byRole:{A:0,B:0,C:0,L:0},knownEstimatedUsd:0,unknownUsage:0,admissionEstimateUsd:admission,admissionBudgetUsd:options.budget,notInvoice:true};
 state.activity_observations=[];state.activity_adaptations=[];state.personalization_hypotheses=[];state.learner_relationship_hypotheses=[];
 const trace={schema:'myway_s16b57r1_realistic_interactive_evidence_v1',mode:options.mode,model:options.mode==='model'?MODEL:'OFFLINE_AUTHORED',source:'SYNTHETIC_LEARNER_RESEARCH_NOT_REAL_HUMAN',configuration:{...options},limitations:['Scripted learner is a plumbing fixture; model-generated learner is synthetic, not validated against humans','No guaranteed educational quality or learning gain','Local semantic retrieval is only candidate discovery; no database or approved-history access','All memory is in-process provisional; no scene is rendered, learner choices are synthetic','Admission budgets are NOT invoice caps'],events:[],boundaries:[],state:null,projection:null,summary:null,cost:ledger};
 async function invoke(role,request){ledger.calls++;ledger.byRole[role]++;let response;try{response=await send(request,auth,role);}catch(e){ledger.unknownUsage++;throw Error(role+' transport error; unknown spend, stop: '+String(e?.message??e).slice(0,120));}try{ledger.knownEstimatedUsd=+(ledger.knownEstimatedUsd+usageCost(response.usage)).toFixed(9);}catch(e){ledger.unknownUsage++;throw Error(role+' incomplete billing information; stop');}return response.raw;}
 let active=null,priorReply=null;const allSessionTurns=()=>state.turns.filter(t=>t.session_id===active);
 for(const step of steps){
  if(active!==step.session_id){active=step.session_id;priorReply=null;trace.boundaries.push({session_id:active,previous_message_pairs:state.turns.length,history_mode:options.history,prior_raw_exposed:options.history==='full'?state.turns.length*2:0,provisional_roots:state.roots.length,provenance_observations:state.observations.length,unresolved_holds:state.holds.length});}
  const e={id:step.id,session_id:active,learner:null,learner_source:null,assessment:null,assessment_status:null,reply:null,tutor_status:null,retrieval_for_tutor:null,retrieval_for_C:null,model_c_raw:null,model_c_guard:null,model_c_final:null,model_c_status:'not_required',memory_action:null,observation:null,teaching_context:null,commitment:null,additional_proposals:null,stop:null};trace.events.push(e);
  try{
   let learner=step.learner;
   if(options.mode==='model'&&options.learner==='model'&&priorReply!==null){
    if(learnerGenerator)learner=learnerGenerator({step,priorReply,sessionTurns:allSessionTurns()});
    else {const raw=await invoke('L',requestL({step:{...step,activity_evidence:state.activity_observations.at(-1)?.evidence??null},priorReply,sessionTurns:allSessionTurns(),preferences:state.preferences}));learner=validatedJson(raw,L_SCHEMA).learner;}
    e.learner_source='GPT41MINI_SYNTHETIC_GENERATED';
   }else e.learner_source='AUTHOR_SEEDED_SYNTHETIC';
   if(typeof learner!=='string'||!learner.trim()||learner.length>1800)throw Error('Invalid synthetic learner utterance');e.learner=learner;
   const selection=await retrieve(state,learner,{method:options.retrieval,request:embeddingsFetch});e.retrieval_for_tutor=snapshot({...selection,candidate_count:selection.candidates.length});
   const teaching=contextForB(state,{sessionId:active,message:learner,history:options.history,retrieval:selection,personalization:options.personalization});
   if(state.activity_observations.length&&active==='J3'){teaching.messages.splice(2,0,{role:'system',content:'Recent SYNTHETIC and provisional activity evidence (not a human): '+JSON.stringify(teachingBrief(state.activity_observations.at(-1)))+' Use any Model A next_teaching_move as advisory, not mandatory. Avoid mastery or established preference claims.'});}
   e.teaching_context={raw_prior_messages:teaching.raw_prior_messages,older_raw_messages_exposed:teaching.older_raw_messages_exposed,history:options.history,retrieved_root_ids:teaching.memory.map(x=>x.id),preference_count:teaching.preferences.length};
   // MODEL B GOES FIRST; A and C never have to clear the learner-facing reply.
   if(options.mode==='offline'){e.reply=typeof teacher==='function'?teacher({step,learner,teaching}):step.offline_reply;e.tutor_status='OFFLINE_AUTHOR_SCRIPT_NOT_MODEL_B';}
   else{e.reply=validateReply(await invoke('B',requestB(teaching)));e.tutor_status='REAL_MODEL_VALIDATED_UNSCORED';}
   if(typeof e.reply!=='string'||!e.reply.trim()||e.reply.length>4000)throw Error('Tutor returned invalid reply');
   const view={turns:options.history==='full'?state.turns.slice():allSessionTurns()};
   state.turns.push({turn_id:step.id,session_id:active,learner,reply:e.reply});priorReply=e.reply;
   // Model A sees current learner and preceding dialogue, not its own post-hoc answer.
   if(options.mode==='offline'){
    const phrase=learner.match(/(?:confus\w*|don't understand|not sure|separate question|mixing up)/i);
    e.assessment=assessGuard({kind:phrase?'new_or_continuing_difficulty':'question_or_followup',topic_label:step.session_name,root_problem:phrase?'Investigate: '+learner.slice(0,185):null,evidence_quote:phrase?learner.slice(0,Math.min(100,learner.length)):null,uncertainty:'medium',source:'OFFLINE_AUTHOR_HYPOTHESIS_NOT_ORACLE'},learner);e.assessment_status='offline_not_model';
   }else{
    try{const raw=await invoke('A',requestA(view,learner));e.assessment=assessGuard({...validatedJson(raw,A_SCHEMA),source:'MODEL_A_GPT41MINI_RESEARCH'},learner);e.assessment_status='real_model_validated_unscored';}
    catch(err){if(/transport error|incomplete billing/i.test(String(err)))throw err;e.assessment_status='invalid_A_held';e.a_error=String(err?.message??err).slice(0,200);}
   }
   const a=e.assessment;
   if(a?.root_problem&&a?.evidence_quote){
    const cSelection=await retrieve(state,learner+' '+a.root_problem,{method:options.retrieval,request:embeddingsFetch});e.retrieval_for_C=snapshot(cSelection);
    if(!cSelection.candidates.length){e.model_c_raw={identity:'distinct',anchor_id:null,rationale:'No candidate discovered; proposed new root only'};e.model_c_status='no_history_provisional';}
    else if(options.mode==='offline'){
     e.model_c_raw={identity:'uncertain',anchor_id:null,rationale:'Offline mock does not adjudicate identity; no authored oracle'};e.model_c_status='offline_not_model';
    }else{
     try{e.model_c_raw=validatedJson(await invoke('C',contextualRequestC(a,cSelection.candidates,learner)),C55_SCHEMA);e.model_c_status='real_model_raw';}
     catch(err){if(/transport error|incomplete billing/i.test(String(err)))throw err;e.model_c_status='invalid_C_held';e.c_error=String(err?.message??err).slice(0,200);}
    }
    const validated=validateCWithoutLabelGate(e.model_c_raw,cSelection.candidates);e.model_c_guard=validated.guard;e.model_c_final=validated.decision;
    e.memory_action=memoryProposal(state,{turnId:step.id,sessionId:active,assessment:a,decision:validated.decision,candidates:cSelection.candidates,rawDecision:e.model_c_raw});
   }else e.memory_action={status:'observation_only',reason:a?'No current evidence-backed root':'Assessment missing/invalid; teaching still occurred'};
   e.observation=createObservation(state,{turnId:step.id,sessionId:active,learner,assessment:a,source:e.assessment_status});
   e.commitment=snapshot(recordCommitment(state,step.id,learner,e.reply));
   recordPreference(state,learner,step.id);
   e.additional_proposals=snapshot(observeIntent(state,{turnId:step.id,learner,assessment:a}));
   if(options.activity==='simulated'&&eligibleForActivity({learner,sessionTurns:allSessionTurns(),activityAlreadySeen:trace.events.some(x=>x.activity)})){
    e.activity=await executeActivity({mode:options.mode,learnerMode:options.learner,profile:options.activityProfile,step,learner,reply:e.reply,retrieval:selection,invoke,state});
    if(e.activity.visible_offer){e.reply+='\n[OPTIONAL ACTIVITY PROPOSAL] '+e.activity.visible_offer;state.turns.at(-1).reply+='\n[OPTIONAL ACTIVITY PROPOSAL] '+e.activity.visible_offer;}if(e.activity.next_tutor_reply){priorReply=e.activity.next_tutor_reply;state.turns.at(-1).reply+='\n[AFTER SYNTHETIC INTERACTION] '+priorReply;}
   }
  }catch(err){e.stop=String(err?.message??err).slice(0,300);break;}
 }
 const heldTurns=trace.events.filter(e=>e.memory_action?.status==='held');
 const rejected=trace.events.filter(e=>e.model_c_guard?.action==='hold');const invalidA=trace.events.filter(e=>e.assessment_status==='invalid_A_held');const invalidActivityA=trace.events.filter(e=>e.activity?.assessment_status==='invalid_activity_assessment');
 const rejectionReasons=Object.fromEntries([...new Set(rejected.map(e=>e.model_c_guard.reason))].sort().map(reason=>[reason,rejected.filter(e=>e.model_c_guard.reason===reason).length]));
 trace.state=state;trace.projection=projection(state);trace.learner_projection={simulation_only:true,activity_observations:state.activity_observations,activity_adaptations:state.activity_adaptations,personalization_hypotheses:state.personalization_hypotheses,learner_relationship_hypotheses:state.learner_relationship_hypotheses};
 trace.summary={processed:state.turns.length,attempted:steps.length,stopped:trace.events.some(x=>x.stop!==null),sessions:trace.boundaries.length,provisional_roots:state.roots.length,evidence:state.observations.length,
  holds:state.holds.length,unresolved_identity_holds:state.holds.length,held_turns:heldTurns.length,transient_held_turns:heldTurns.filter(e=>!e.memory_action?.hold).length,
  guard_rejections:rejected.length,guard_rejection_reasons:rejectionReasons,invalid_conversational_assessments:invalidA.length,invalid_activity_assessments:invalidActivityA.length,activity_adaptations:state.activity_adaptations.length,simulated_activities:state.activity_observations.length,simulated_scene_proposals:trace.events.filter(x=>x.activity?.scene).length,activity_decisions_not_offered:trace.events.filter(x=>x.activity?.status==='not_offered').length,
  visual_proposals:state.visuals.length,relationships_to_review:state.relationships.length,db_writes:0,authoritative_memory_writes:0};return trace;
}
function report(t){const lines=['MYWAY S1.6B.5.7-R1 — REALISTIC INTERACTIVE EVIDENCE LOOP','Study: '+JSON.stringify(t.configuration),'No real learners, no DB writes, no verified mastery or rendered visuals.','SUMMARY: '+JSON.stringify(t.summary),'COST: '+JSON.stringify(t.cost)];for(const e of t.events){lines.push('\n'+e.id+' | '+e.session_id,'LEARNER ['+e.learner_source+']: '+e.learner,'MODEL B ['+e.tutor_status+']: '+e.reply,'MODEL A ['+e.assessment_status+']: '+JSON.stringify(e.assessment),'RETRIEVAL (tutor): '+JSON.stringify(e.retrieval_for_tutor),'MODEL C RAW ['+e.model_c_status+']: '+JSON.stringify(e.model_c_raw),'C SOFTWARE GUARD: '+JSON.stringify(e.model_c_guard),'MODEL C FINAL: '+JSON.stringify(e.model_c_final),'PROVISIONAL MEMORY: '+JSON.stringify(e.memory_action),'REL/VISUAL: '+JSON.stringify(e.additional_proposals),'SIMULATED ACTIVITY: '+JSON.stringify(e.activity??null),'REVIEW: naturalness / factual accuracy / evidence / memory benefit / guard correctness / alternative plausible interpretations');if(e.stop)lines.push('STOP: '+e.stop);}return lines.join('\n')+'\n';}
export function saveReports(t){const dir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b57r1',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));fs.mkdirSync(dir,{recursive:true});for(const [f,body] of [['S16B57R1_INTERACTIVE_TRANSCRIPT.txt',report(t)],['S16B57R1_MEMORY_TIMELINE.json',JSON.stringify(t.state.observations,null,2)+'\n'],['S16B57R1_LEARNING_SPACE_PROJECTION.json',JSON.stringify(t.projection,null,2)+'\n'],['S16B57R1_SCENE_PROPOSALS.json',JSON.stringify(t.events.map(e=>({turn_id:e.id,proposed_plan:e.activity?.proposed_plan??null,scene:e.activity?.scene??null})).filter(x=>x.proposed_plan),null,2)+'\n'],['S16B57R1_INTERACTION_EVIDENCE.json',JSON.stringify(t.learner_projection,null,2)+'\n'],['S16B57R1_TEACHING_ADAPTATIONS.json',JSON.stringify(t.state.activity_adaptations,null,2)+'\n'],['trace.json',JSON.stringify(t,null,2)+'\n']])fs.writeFileSync(path.join(dir,f),body,{flag:'wx',mode:0o600});return dir;}
async function main(){const o=parseArgs(process.argv.slice(2));if(o.help){console.log('Offline: node s16b57r1-journey.mjs --mode offline --limit 12 --history resumed --retrieval lexical --activity simulated --activity-profile needs-feedback\nPaid: node s16b57r1-journey.mjs --mode model --limit 12 --history resumed --retrieval semantic --learner model --activity-profile adaptive --allow-spend --budget-usd 0.40\nNothing is rendered; synthetic actions only. Start local MiniLM on port 8001 for semantic mode.');return;}
 console.log('S1.6B.5.7-R1 RESEARCH ONLY, NO DB WRITES | '+JSON.stringify(o));if(o.mode==='model')console.log('Conservative budget admission estimate $'+admissionEstimate(o.limit,o.learner)+'; NOT a hard billing cap.');
 const t=await runStudy(o);const folder=saveReports(t);for(const e of t.events)console.log(`${e.id}: B=${e.tutor_status}, A=${e.assessment_status}, C=${e.model_c_status}, memory=${e.memory_action?.status??'none'}${e.stop?', STOP='+e.stop:''}`);
 console.log('TRANSCRIPT: '+path.join(folder,'S16B57R1_INTERACTIVE_TRANSCRIPT.txt'));console.log('TRACE: '+path.join(folder,'trace.json'));console.log('SUMMARY: '+JSON.stringify(t.summary));console.log('COST: '+JSON.stringify(t.cost));if(t.summary.stopped)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(err=>{console.error('S57 REFUSAL: '+String(err?.message??err).slice(0,300));process.exitCode=1;});
