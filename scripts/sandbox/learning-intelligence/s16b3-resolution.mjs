/** S1.6B.3 correction resolution; local synthetic simulation only. Not an expert semantic adjudicator. */
import {clipped,stableId,stableConcept} from './s16b1-continuity.mjs';
import {terms} from './s16b2-evidence.mjs';
const sim=(a,b)=>{const A=new Set(terms(a)),B=new Set(terms(b));if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return Math.round(n/Math.sqrt(A.size*B.size)*10000)/10000;};
const POSITIVE=/\b(?:wrongly|incorrectly|mistakenly|misclassified|linked|filed|put|assigned|connected)\b/i;
const KEEP=/\b(?:keep|remain|stay|don't change|do not change|was accurate|was correct|leave .*unchanged|still accurate)\b/i;
const CALVIN=/\b(?:calvin|carbon fixation|co2|carbon dioxide)\b/i;
const LIGHT=/\b(?:light reaction|light-driven|photons|nadph|atp)\b/i;
export function markPending(state,correction){
 if(!correction)return null;
 correction.status='AWAITING_CLARIFICATION';
 return correction;
}
function identifyPriorEvent(state,turnId){
 for(const topic of state.topics)for(const ev of topic.events)if(ev.turn_id===turnId)return {topic,event:ev};
 return null;
}
/** Return suggestions and evidence, never uses expected labels or injected-error metadata to choose a repair. */
export function resolveCorrection(state,pending,answer,{mode='offline',allowSyntheticRepair=false}={}){
 if(!pending||pending.status!=='AWAITING_CLARIFICATION')return {status:'NO_OPEN_CORRECTION',applied:false};
 const m=clipped(answer.message??answer,500);
 const current=state.correctionProposals.find(c=>c.id===pending.id);
 if(!current)return {status:'CORRECTION_RECORD_MISSING',applied:false};
 const cited=m.match(/\b(T\d{2})\b/i)?.[1]?.toUpperCase()??null;
 const ranked=(pending.rankedTargets??[]);
 const proposedTarget=cited?ranked.find(c=>c.priorTurnId===cited):ranked[0];
 const result={status:'NEEDS_MORE_EVIDENCE',applied:false,answerTurnId:answer.turn_id??null,priorCorrectionId:pending.id,selectedTargetTurnId:proposedTarget?.priorTurnId??null,selectedTargetEventId:proposedTarget?.eventId??null,explicitTurnId:cited,source:'learner_answer_plus_historical_evidence',explanation:'No model-only or oracle-only relinking',candidates:[],reverseOperation:null};
 if(!proposedTarget||!proposedTarget.eventId){current.resolution=result;current.status=result.status;return result;}
 const located=identifyPriorEvent(state,proposedTarget.priorTurnId);
 if(!located||located.event.event_id!==proposedTarget.eventId){current.resolution=result;current.status=result.status;return result;}
 const {topic,event}=located;
 const originalStatement=event.learner_statement??proposedTarget.priorLearnerQuote??event.observed_root_problem??'';
 const semanticTarget=event.observed_root_problem??originalStatement;
 const matches=topic.events.filter(e=>e.origin==='synthetic_seed'&&e.difficulty_id!==event.difficulty_id)
   .map(e=>({difficultyId:e.difficulty_id,anchorEventId:e.event_id,canonicalRoot:stableConcept(state,topic.topic_id,e.difficulty_id),support:sim(semanticTarget,e.root_problem)}))
   .sort((a,b)=>b.support-a.support||a.difficultyId.localeCompare(b.difficultyId));
 result.candidates=matches.slice(0,3);
 const keep=KEEP.test(m)&&!POSITIVE.test(m);
 // Deliberately conservative: a denial that may describe learner progress, not an erroneous link, is NOT a repair.
 if(keep){result.status='RESOLVED_NO_CHANGE';result.explanation='Learner confirmed earlier record should be kept; correction was about current focus/progress.';}
 else if(cited&&POSITIVE.test(m)&&CALVIN.test(m)&&LIGHT.test(m)&&topic.topic_id==='sim-photosynthesis'){
  const top=matches[0],runner=matches[1];const margin=top?top.support-(runner?.support??0):0;
  result.checks={specificTarget:cited===proposedTarget.priorTurnId,learnerExplicitContrast:true,topicIdentitySupported:!!top&&top.support>=0.38&&margin>=0.12,margin};
  if(result.checks.specificTarget&&result.checks.topicIdentitySupported){
   result.status='SIMULATED_RELINK_PROPOSAL';result.toDifficultyId=top.difficultyId;result.fromDifficultyId=event.difficulty_id;
   if(mode==='offline'&&allowSyntheticRepair){
    const from=event.difficulty_id;event.difficulty_id=top.difficultyId;
    const revision={id:stableId('s16b3-repair:'+answer.turn_id),eventId:event.event_id,fromDifficultyId:from,toDifficultyId:top.difficultyId,correctionId:pending.id,evidenceTurnId:answer.turn_id,source:'OFFLINE_EVIDENCE_GATED_NOT_MODEL_VERIFIED',reversible:true};
    state.memoryRevisions.push(revision);state.audit.push({kind:'SIMULATED_CORRECTION_APPLIED',...revision});
    result.status='SIMULATED_RELINK_APPLIED';result.applied=true;result.reverseOperation={kind:'relink_event',eventId:event.event_id,from:top.difficultyId,to:from};
   }
  }
 }else result.explanation='Answer is not explicit enough to justify altering historical identity.';
 if(result.status==='NEEDS_MORE_EVIDENCE')current.status='AWAITING_CLARIFICATION';else current.status=result.status;
 current.resolution=result;return result;
}
export function checkRevisions(state){const errors=[];for(const revision of state.memoryRevisions??[]){const found=state.topics.flatMap(t=>t.events).find(e=>e.event_id===revision.eventId);if(found?.difficulty_id!==(revision.undone?revision.fromDifficultyId:revision.toDifficultyId))errors.push(revision.eventId);}return {pass:errors.length===0,errors};}
export function proposedRefinementPositive({state,topicId,anchorDifficultyId,message,proposedRoot}){
 const canonical=stableConcept(state,topicId,anchorDifficultyId);if(!canonical)return {accepted:false,reason:'no_history'};
 const raw=clipped(message,500);const unresolved=raw.split(/\bbut\b/i).at(-1)??raw;
 const base=new Set(terms(canonical)),proposal=new Set(terms(proposedRoot)),evidence=new Set(terms(unresolved));
 const newTerms=[...proposal].filter(t=>!base.has(t)&&evidence.has(t));
 const score=sim(canonical,proposedRoot);
 return {accepted:newTerms.length>=2&&score>=0.20,newTerms,score,canonical,proposedRoot:clipped(proposedRoot,350),kind:'UNVERIFIED_POSITIVE_SPECIFICITY_CANDIDATE'};
}

/** Explicit rollback for an isolated test revision. Refuse conflicting later edits. */
export function undoSyntheticRevision(state,revisionId){
 if(!state?.noSupabaseWrites)throw Error('Only isolated synthetic memory can be rolled back');
 const revision=state.memoryRevisions?.find(r=>r.id===revisionId);
 if(!revision||!revision.reversible)throw Error('Unknown or irreversible synthetic revision');
 if(revision.undone)throw Error('Revision already undone');
 const target=state.topics.flatMap(t=>t.events).find(e=>e.event_id===revision.eventId);
 if(!target||target.difficulty_id!==revision.toDifficultyId)throw Error('Conflicting current identity; refusing undo');
 target.difficulty_id=revision.fromDifficultyId;
 revision.undone=true;
 state.audit.push({kind:'SIMULATED_CORRECTION_UNDONE',revisionId,eventId:target.event_id,restoredDifficultyId:revision.fromDifficultyId});
 return {status:'UNDO_APPLIED_SYNTHETIC_ONLY',eventId:target.event_id,restoredDifficultyId:target.difficulty_id};
}
