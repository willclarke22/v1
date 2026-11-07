/** S1.6B.2 evidence-grounding helpers. Pure, local-only, no model/DB I/O. */
import crypto from 'node:crypto';
import {clipped,stableConcept} from './s16b1-continuity.mjs';

const STOP=new Set('a an the is are was were be been being i me my we our you your he she it they them their its this that those these do does did of at by in on to from for with and or but so what why how which who when where into over under about than then now not no still already just actually specifically exactly part process thing things know knew understand understood confusion confused question problem issue mechanism different same during after before using makes make made can cannot could would should'.split(' '));
const ALIAS=new Map(Object.entries({photons:'photon',electron:'electron',electrons:'electron',reactions:'reaction',molecules:'molecule',sugars:'sugar',fixes:'fix',fixed:'fix',fixing:'fix',formation:'form',forming:'form',formed:'form',incorporates:'incorporate',incorporated:'incorporate',incorporating:'incorporate',converting:'convert',converted:'convert',transforms:'convert',transformation:'convert',creates:'create',creating:'create',produces:'produce',production:'produce',stored:'store',storing:'store',absorption:'absorb',absorbed:'absorb',currents:'current',ions:'ion',proteins:'protein',channels:'channel',chemicals:'chemical',enzymes:'enzyme',phosphates:'phosphate',intermediates:'intermediate'}));
export function terms(text){return [...new Set((String(text??'').toLowerCase().match(/[a-z][a-z0-9+]{1,}/g)??[]).map(x=>ALIAS.get(x)??x).filter(x=>x.length>2&&!STOP.has(x)))];}
function similarity(a,b){const A=new Set(terms(a)),B=new Set(terms(b));if(!A.size||!B.size)return 0;let common=0;for(const v of A)if(B.has(v))common++;return Math.round(common/Math.sqrt(A.size*B.size)*10000)/10000;}
function splitCorrection(message){const m=clipped(message,500);
 const denial=m.match(/\b(?:i (?:was|am|have been|had been) not confused about|i wasn['’]t confused about|i never (?:had trouble with|was confused about)|not (?:my|the) (?:question|difficulty) (?:about|with))\s+([^;,.]{2,120})/i);
 const contrast=m.match(/\b(?:specifically|what i meant|i meant|my (?:actual )?question (?:was|is)|instead)\b\s*([^;,.]{5,160})/i);
 return {disputed:clipped(denial?.[1]??'',110),correctedFocus:clipped(contrast?.[1]??'',160),verbatim:m};
}
/** Rank EVERY prior *observed* learner event, not just the most recent event. A rank is never proof of an error. */
export function rankCorrectionTargets(message,priorTurns,{maxCandidates=5}={}){
 const segments=splitCorrection(message),out=[];
 for(const p of priorTurns){
  if(!p?.action?.newEventId||!p?.action?.difficultyId||!p?.assessment?.root_problem)continue;
  const root=p.assessment.root_problem,said=p.message??'';
  const disputedRoot=similarity(segments.disputed,root),disputedSaid=similarity(segments.disputed,said);
  const focusRoot=similarity(segments.correctedFocus,root);
  const scored=segments.disputed?0.72*disputedRoot+0.28*disputedSaid-0.10*focusRoot:0.45*similarity(message,root)+0.2*similarity(message,said);
  out.push({priorTurnId:p.turnId,eventId:p.action.newEventId,difficultyId:p.action.difficultyId,priorRoot:clipped(root,190),priorLearnerQuote:clipped(said,190),signals:{disputedRoot,disputedSaid,correctedFocusRoot:focusRoot},score:Math.round(Math.max(0,scored)*10000)/10000,status:'RANKED_LEXICAL_EVIDENCE_NOT_VALIDATED'});
 }
 out.sort((a,b)=>b.score-a.score||a.priorTurnId.localeCompare(b.priorTurnId));
 return {segments,candidates:out.slice(0,maxCandidates),evaluatedCount:out.length,selectedForMutation:null,quality:'LEXICAL_RANKING_ONLY'};
}
export function clarificationForCorrection(rank){
 if(!rank)return null;
 const top=rank.candidates[0],second=rank.candidates[1];
 const specific=rank.segments.disputed;
 const ambiguity=Boolean(!top||top.score<0.10||(second&&top.score-second.score<0.09));
 const label=top?.priorRoot?`“${clipped(top.priorRoot,110)}”`:'an earlier difficulty';
 const prefix=specific?`When you say you were not confused about “${clipped(specific,70)}”, `:'When you correct my earlier understanding, ';
 const question=ambiguity?'which earlier difficulty should I reconsider, and what did I misunderstand?':`${prefix}are you correcting my earlier interpretation ${label}, or only narrowing your current question?`;
 return {status:'TARGETED_CLARIFICATION_PROPOSED',needsLearnerAnswer:true,question:clipped(question,300),reason:ambiguity?'no_uniquely_supported_prior_target':'learner_denial_may_conflict_with_earlier_record',targetEvidenceOnly:top?.eventId??null,ambiguity,scope:'memory_only_teacher_can_continue'};
}
export function correctionRecord(state,turn,prior,signal){
 if(!signal.isCorrection)return null;
 const ranking=rankCorrectionTargets(turn.message,prior);
 const clarification=clarificationForCorrection(ranking);
 const record={id:'s16b2-'+turn.turn_id,turnId:turn.turn_id,learnerQuote:clipped(turn.message,500),status:'MEMORY_HOLD_AWAITING_LEARNER_CLARIFICATION',kind:'correction_of_prior_interpretation',candidatePriorEventId:null,rankedTargets:ranking.candidates,rankQuality:ranking.quality,disputedPhrase:ranking.segments.disputed,correctedFocus:ranking.segments.correctedFocus,clarification,automaticRepairApplied:false,proposedAction:'reassess_only_after_answer_and_independent_check'};
 state.correctionProposals.push(record);state.audit.push({kind:'correction_evidence_noted_without_relink',turnId:turn.turn_id,rankedTargetIds:ranking.candidates.map(x=>x.eventId),clarificationNeeded:true});
 return record;
}
/** Conservative, lexical support gate: cannot establish semantic novelty. Suppress weak proposals. */
export function refinementEvidence({state,retrieval,decision,assessment,learnerMessage}){
 if(decision?.identity!=='same'||decision.interpretation!=='refine')return null;
 const topic=state.topics.find(t=>t.topic_id===retrieval?.topicId);
 const anchor=topic?.events.find(e=>e.event_id===decision.anchor_event_id);
 if(!anchor)return {status:'hold_identity',reason:'anchor_not_in_selected_topic'};
 const canonical=stableConcept(state,retrieval.topicId,anchor.difficulty_id)??anchor.root_problem;
 const hypothesis=clipped(decision.proposed_hypothesis,500);
 const raw=clipped(learnerMessage,500);
 // Only the unresolved portion of this message can support a more specific root.
 // Prior or reported-mastered clauses must not become new difficulty evidence.
 const unresolved=(raw.match(/\b(?:but|however)\s+(.+)$/i)?.[1]??raw);
 const canonicalTerms=new Set(terms(canonical));
 const proposedTerms=new Set(terms(hypothesis));
 const unresolvedTerms=new Set(terms(unresolved));
 const supportedNew=[...proposedTerms].filter(t=>!canonicalTerms.has(t)&&unresolvedTerms.has(t));
 const unsupportedNew=[...proposedTerms].filter(t=>!canonicalTerms.has(t)&&!unresolvedTerms.has(t));
 const canonicalSimilarity=similarity(canonical,hypothesis);
 const supported=Boolean(hypothesis && supportedNew.length>=2 && canonicalSimilarity>=0.22);
 return {status:supported?'unverified_specificity_candidate':'retain_without_supported_refinement',reason:supported?'at_least_two_current_unresolved_detail_terms_not_in_canonical':'no_sufficient_new_current_unresolved_conceptual_evidence',canonicalRoot:canonical,modelProposedRoot:hypothesis,unresolvedQuote:clipped(unresolved,180),supportedNewTerms:supportedNew,unsupportedModelOnlyTerms:unsupportedNew.slice(0,12),canonicalSimilarity,automaticRootRewrite:false,verification:'LEXICAL_GATE_NOT_SEMANTIC_PROOF'};
}
export function teacherContextB2(message,assessment,ctx,correction){
 const earlier=(ctx.short?`\nPRIOR (not new learner evidence): ${ctx.short}`:'');
 const rule=correction?'\nINSTRUCTION: This is a correction of our interpretation. Acknowledge it explicitly; distinguish reported progress from demonstrated mastery. Do not invent a contrast, reteach unnecessarily, or suggest an unrelated analogy. If memory attribution is unclear, ask ONE concise targeted question.':
 '\nINSTRUCTION: Answer the current conceptual gap conversationally; briefly connect earlier learning only if helpful. No canned praise or unnecessary recap.';
 const clarified=correction?.clarification?.question?`\nMEMORY CLARIFICATION (do not pretend answered): ${correction.clarification.question}`:'';
 const original=`CURRENT LEARNER: ${clipped(message,500)}${earlier}${rule}${clarified}`.slice(0,1900);
 return {topic:clipped(assessment.topic_name,110),root_problem:clipped(assessment.root_problem,500),evidence_quote:clipped(assessment.evidence_quote,450),original_statement:original,clarification_answer:''};
}
