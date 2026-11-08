/** S1.6B.5.2: reproducible realism fixtures. All utterances are SYNTHETIC authored scripts.
 * Raw history must be the exact earlier turn, never a polished root summary masquerading as learner speech.
 * No personal data access, generation, network, model calls, database I/O or learner-state mutation. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inferIntent} from './s16b3-intent.mjs';
import {assembleTeachingExperiment} from './s16b4d-integration.mjs';

export const REALISM_VERSION='myway_s16b52_realism_v1';
export const ACTIONS=Object.freeze(['explain_missing_mechanism','repair_misconception','extend_follow_up','acknowledge_correction','close_clarification','verify_understanding','advance_after_progress']);
const DIR=path.dirname(fileURLToPath(import.meta.url));
const DATA='s16b52-realism-corpus.json';
export const SHA=x=>crypto.createHash('sha256').update(x).digest('hex');
export const CORPUS_SHA='fd82dc36de871a195c29f97e531f84d4ada38b06f08e3fd6d5ef953a06a6ab29';
const source=()=>path.join(DIR,DATA);
export function loadRealismCorpus({verifyHash=true}={}){
 const raw=fs.readFileSync(source());
 if(verifyHash&&SHA(raw)!==CORPUS_SHA)throw Error('Frozen realism corpus hash mismatch');
 const c=JSON.parse(raw.toString('utf8'));
 if(c.schema!=='myway_s16b52_realism_corpus_v1'||c.privacy_class!=='synthetic_example_only'||c.threads?.length!==10||c.snapshots?.length!==48)throw Error('Unexpected realism corpus');
 const threads=new Map();for(const t of c.threads){
  if(threads.has(t.thread_id)||t.privacy_class!=='synthetic_example_only'||!t.scripted_tutor_replies_not_model_outputs||!Array.isArray(t.turns))throw Error('Invalid scripted thread');
  const seen=new Set();for(const x of t.turns){if(seen.has(x.turn_id)||!['learner','tutor'].includes(x.role)||typeof x.text!=='string'||!x.text.trim())throw Error('Invalid threaded turn');seen.add(x.turn_id);}
  threads.set(t.thread_id,t);
 }
 const counts={development:0,holdout:0};const ids=new Set();const uniqueActions=new Set();
 for(const s of c.snapshots){
  if(ids.has(s.id)||!threads.has(s.thread_id)||s.privacy_class!=='synthetic_example_only'||s.provenance!=='synthetic_human_authored_script'||s.learner_outcome!=='not_observed')throw Error('Invalid synthetic snapshot identity');
  ids.add(s.id);if(!(s.split in counts))throw Error('Invalid holdout assignment');counts[s.split]++;
  if(!ACTIONS.includes(s.oracle?.action)||!s.oracle.acceptable_actions.includes(s.oracle.action)||!['self_contained','context_required'].includes(s.scenario_ambiguity))throw Error('Invalid scenario oracle');
  uniqueActions.add(s.oracle.action);
  const transcript=threads.get(s.thread_id).turns;
  const index=transcript.findIndex(x=>x.turn_id===s.learner_turn_id&&x.role==='learner');
  if(index<0||transcript[index].text!==s.raw_learner_message||JSON.stringify(transcript.slice(0,index))!==JSON.stringify(s.prior_turns))throw Error('History must be exact preceding raw turns: '+s.id);
  if(s.prior_turns.some(x=>x.text===s.author_assessment_root))throw Error('Polished root summary mislabeled raw history: '+s.id);
 }
 if(counts.development!==36||counts.holdout!==12||uniqueActions.size!==7)throw Error('Insufficient realism coverage');
 return c;
}
const isCorrection=intent=>intent==='correction'||intent==='clarification_answer';
export function caseInputs(s,{routing='oracle'}={}){
 if(!['oracle','inferred'].includes(routing))throw Error('Invalid routing mode');
 const prior=s.prior_turns;
 // Pending must be derivable from a literal, preceding tutor turn; do not leak oracle labels into the inferred mode.
 const lastTutor=[...prior].reverse().find(t=>t.role==='tutor');
 const pending=lastTutor&&/\?\s*$|did you mean|which part/i.test(lastTutor.text)?{status:'AWAITING_CLARIFICATION',id:lastTutor.turn_id}:null;
 const inferred=inferIntent(s.raw_learner_message,{previous:prior.map(x=>({message:x.text})),pending});
 const intent=routing==='oracle'?s.oracle.intent:inferred.intent;
 // Always retain the literal transcript. 'Verified' means byte-matched to synthetic fixture, NOT observed learner truth.
 const context_candidates=prior.map(t=>({evidence_id:'E-'+t.turn_id,turn_id:t.turn_id,difficulty_id:'syn-'+s.thread_id,
  source:t.role==='learner'?'historical_learner_statement':'prior_teaching',text:t.text,
  reason_for_consideration:'exact preceding raw scripted '+t.role+' turn',verified_as_learner_evidence:t.role==='learner'}));
 const lastExactTutor=[...context_candidates].reverse().find(x=>x.source==='prior_teaching');
 const target=lastExactTutor??null;
 const selectorOptions={targetDifficultyIds:['syn-'+s.thread_id],recentTurnIds:prior.slice(-2).map(t=>t.turn_id)};
 if(isCorrection(intent)&&target)selectorOptions.targetEvidenceIds=[target.evidence_id];
 const plannerOptions=routing==='oracle'?{focus:s.oracle.focus,clarificationStatus:s.oracle.clarification_status}:{focus:'auto',clarificationStatus:'UNRESOLVED'};
 const learner={message:s.raw_learner_message,intent,turn_id:s.learner_turn_id};
 const assessment={topic:s.topic,root_problem:s.author_assessment_root,evidence_quote:s.raw_learner_message};
 const state={canonical_difficulty:{difficulty_id:'syn-'+s.thread_id,root_problem:s.author_assessment_root}};
 const profileInput={profile_snapshot:{schema_version:'personalization_profile_snapshot_v1',summary:'Synthetic comparison; no inferred interests.',teaching_signals:[],example_domains:[]},user_interests:[]};
 return {learner,assessment,state,context_candidates,profileInput,bridgeCandidates:[],selectorOptions,plannerOptions,
  trace:{routing,oracle_action:s.oracle.action,oracle_intent:s.oracle.intent,inferred_intent:inferred.intent,inference_reason:inferred.reason,
   evidence_target:selectorOptions.targetEvidenceIds??[],history_kind:'raw_synthetic_turns_only',curriculum_root_is_author_label_not_learner_quote:true,
   action_truth_is_human_authored_not_expert_verified:true}};
}
export function prepareCase(s,{routing='oracle',voice='adaptive'}={}){
 if(!['adaptive','calibrated'].includes(voice))throw Error('Unsupported existing voice');
 const inputs=caseInputs(s,{routing});
 const assembled=assembleTeachingExperiment({...inputs,variant:'contract'});
 if(assembled.status!=='READY_EXPERIMENTAL_OPT_IN')return {status:'SAFE_HOLD',action:null,reason:assembled.reason??assembled.status,trace:inputs.trace,selected:[],request:null};
 const request={...assembled.request,voice_version:voice==='adaptive'?'adaptive_v5':'calibrated_v5_1'};
 if(request.model!=='gpt-4.1-mini'||request.variant!=='contract'||request.format!=='myway_s16b4d_teaching_v1')throw Error('Model B transport changed');
 return {status:'PREPARED',action:assembled.action,request,selected:assembled.selection.selected.map(x=>({evidence_id:x.evidence_id,source:x.source,text:x.text,turn_id:x.turn_id})),
  trace:{...inputs.trace,planned_action:assembled.action,action_in_acceptable_set:s.oracle.acceptable_actions.includes(assembled.action),
   selected_evidence_count:assembled.selection.selected.length,selected_evidence_ids:assembled.audit.selected_evidence_ids,
   only_synthetic_source:true,interest_mode:assembled.personalization.use_interest}};
}
export function corpusCoverage(c){
 const count=(key)=>Object.fromEntries([...new Set(c.snapshots.map(key))].sort().map(v=>[v,c.snapshots.filter(x=>key(x)===v).length]));
 const words=c.snapshots.map(x=>x.raw_learner_message.trim().split(/\s+/u).length);
 return {threads:c.threads.length,snapshots:c.snapshots.length,dev:c.snapshots.filter(x=>x.split==='development').length,
  holdout:c.snapshots.filter(x=>x.split==='holdout').length,meanWords:Number((words.reduce((a,b)=>a+b,0)/words.length).toFixed(2)),minWords:Math.min(...words),maxWords:Math.max(...words),
  actions:count(x=>x.oracle.action),domains:count(x=>x.domain),ambiguity:count(x=>x.scenario_ambiguity),
  realismTags: [...new Set(c.snapshots.flatMap(x=>x.realism_tags))].sort(),reportedMasteryUnverified:true,actualLearnerData:false};
}
