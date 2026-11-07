/** S1.6B.1 deterministic longitudinal context and safe simulated-memory policies. No I/O. */
import crypto from 'node:crypto';
export const clipped=(value,max=180)=>String(value??'').replace(/[\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export const stableId=(key)=>{const h=crypto.createHash('sha256').update('myway-s16b1:'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
export function classifyLearnerSignal(message){
 const raw=clipped(message,600);
 const correction=/\b(?:was not confused|wasn't confused|never (?:confused|had trouble)|not (?:confused|what i meant)|i meant|what i meant|specifically|to clarify|actually,? i meant)\b/i.test(raw);
 const reportedProgress=/\b(?:i (?:now )?understand|i get|i learned|i know (?:now|how)|makes sense now)\b/i.test(raw);
 return {isCorrection:correction,reportedProgress,signal:correction?'explicit_learner_correction':reportedProgress?'reported_progress':'new_or_continuing_difficulty',verbatim:raw};
}
export function compactContext(previous,message,{maxTurns=2,maxChars=600}={}){
 if(!Array.isArray(previous)||maxTurns<0||maxTurns>2||maxChars>600)throw Error('Unsafe conversation context configuration');
 const records=previous.slice(-maxTurns).map(p=>({turnId:p.turnId,learner:clipped(p.message,135),teaching:clipped(p.teaching?.teaching_strategy,115),root:clipped(p.assessment?.root_problem,90)}));
 const signal=classifyLearnerSignal(message);
 const lines=records.map(p=>`Earlier ${p.turnId}: learner=${p.learner}; MyWay taught=${p.teaching||'(none)'}`);
 const concise=lines.join('\n').slice(0,maxChars);
 return {signal,prior:records,short:concise,usedTurns:records.length,usedChars:concise.length};
}
export function assessmentPrompt(current,ctx,runtime){
 const suffix=ctx.short?`\nPRIOR CONTEXT (not quotation evidence for this turn):\n${ctx.short}`:'';
 const correction=ctx.signal.isCorrection?'\nLearner is correcting earlier understanding; avoid inventing an alternative comparison.':'';
 const message=`CURRENT LEARNER (quote evidence from THIS line only):\n${clipped(current,500)}${suffix}${correction}`;
 if(message.length>1500)throw Error('Assessment context too large');
 return {userPrompt:message,systemPrompt:runtime.assessment.ASSESSMENT_SYSTEM_PROMPT+'\nS1.6 research: learner corrections are evidence about past interpretation; do not turn them into unrelated new questions. Quote the CURRENT statement only; context is not current learner evidence.'};
}
export function teachingInput(message,assessment,ctx){
 const current=clipped(message,500);
 const history=ctx.short?`\nEARLIER CONTEXT (learner and MyWay, not new evidence):\n${ctx.short}`:'';
 const correction=ctx.signal.isCorrection?'\nPRIORITY: acknowledge learner correction and teach the CURRENT remaining gap; do not invent a new comparison.':'';
 return {topic:clipped(assessment.topic_name,110),root_problem:clipped(assessment.root_problem,500),evidence_quote:clipped(assessment.evidence_quote,450),original_statement:`CURRENT LEARNER:\n${current}${history}${correction}`.slice(0,2500),clarification_answer:''};
}
export function stableConcept(state,topicId,difficultyId){
 const topic=state.topics.find(t=>t.topic_id===topicId);
 const earliest=topic?.events.find(e=>e.difficulty_id===difficultyId);
 return earliest?.root_problem??null;
}
export function proposeCorrection(state,turn,prior,signal){
 if(!signal.isCorrection)return null;
 const related=prior.filter(p=>p.action?.difficultyId&&p.retrieval?.topicId&&p.action?.newEventId);
 const latest=related.at(-1);
 const candidate={id:stableId('correction:'+turn.turn_id),turnId:turn.turn_id,learnerQuote:clipped(turn.message,500),status:'NEEDS_INDEPENDENT_REVIEW',kind:'learner_disputes_prior_interpretation',priorTurnIds:prior.slice(-2).map(p=>p.turnId),candidatePriorEventId:latest?.action?.newEventId??null,proposedAction:'reassess_not_mutate',automaticRepairApplied:false};
 state.correctionProposals.push(candidate);state.audit.push({kind:'learner_correction_recorded',turnId:turn.turn_id,priorEventId:candidate.candidatePriorEventId});
 return candidate;
}
export function evolveSafely(state,turn,assessment,retrieval,decision,{correction=false}={}){
 const topic=state.topics.find(t=>t.topic_id===retrieval?.topicId);
 if(!topic)return {kind:'memory_hold',reason:'No supported topic'};
 if(correction)return {kind:'correction_hold',reason:'Explicit learner correction awaits independent memory review; no automatic re-link'};
 if(!decision||decision.identity==='uncertain'||decision.interpretation==='insufficient_evidence')return {kind:'memory_hold',reason:'No validated actionable identity and interpretation decision'};
 if(decision.identity==='same'){
  const anchor=topic.events.find(e=>e.event_id===decision.anchor_event_id);
  if(!anchor)return {kind:'memory_hold',reason:'Anchor not in selected topic'};
  const eventId=stableId('event:'+turn.turn_id);
  if(topic.events.some(e=>e.event_id===eventId))throw Error('Duplicate event');
  // Retain the established root in retrieval memory; store Model A's current hypothesis as observation only.
  const concept=stableConcept(state,topic.topic_id,anchor.difficulty_id);
  topic.events.push({event_id:eventId,difficulty_id:anchor.difficulty_id,root_problem:concept,observed_root_problem:assessment.root_problem,origin:'s16b1_simulated_observation',turn_id:turn.turn_id,learner_statement:turn.message});
  if(decision.interpretation==='refine'){
   const proposal={id:stableId('refine:'+turn.turn_id),turnId:turn.turn_id,difficultyId:anchor.difficulty_id,anchorEventId:anchor.event_id,priorCanonicalRoot:concept,proposedRoot:clipped(decision.proposed_hypothesis,500),status:'UNVERIFIED_REFINEMENT',automaticCanonicalRewrite:false};
   state.refinementProposals.push(proposal);
   state.audit.push({kind:'refinement_candidate_only',turnId:turn.turn_id,difficultyId:anchor.difficulty_id});
   return {kind:'reuse_with_refinement_candidate',difficultyId:anchor.difficulty_id,newEventId:eventId,refinementProposalId:proposal.id};
  }
  state.audit.push({kind:'reused_existing_difficulty',turnId:turn.turn_id,difficultyId:anchor.difficulty_id});
  return {kind:'reuse',difficultyId:anchor.difficulty_id,newEventId:eventId};
 }
 if(decision.identity==='distinct'){
  const id=stableId('difficulty:'+turn.turn_id),eventId=stableId('event:'+turn.turn_id);
  topic.events.push({event_id:eventId,difficulty_id:id,root_problem:assessment.root_problem,origin:'s16b1_simulated_new_identity',turn_id:turn.turn_id,learner_statement:turn.message});
  state.audit.push({kind:'created_distinct_simulated_difficulty',turnId:turn.turn_id,difficultyId:id});
  return {kind:'create_distinct',difficultyId:id,newEventId:eventId};
 }
 return {kind:'memory_hold',reason:'Unsupported Model C identity'};
}
export function recoverC(parse,raw,input){
 const parsed=parse(raw,input);
 return {decision:parsed.decision??null,diagnostic:parsed.error??null,valid:!!parsed.decision};
}
export function maxPayloadSafe(payload){return Buffer.byteLength(JSON.stringify(payload),'utf8')<=6400;}
