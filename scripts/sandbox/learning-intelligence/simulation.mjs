/** Local-only trace replay; no database adapters, mutations, or live learner records. */
export function replaySequence(identity,steps){
  const state={myway_learning_evidence:[]};const turns=[];
  for(const [index,step] of steps.entries()){
    const eventId=`deadbeef-0000-4000-8000-${(index+1).toString(16).padStart(12,'0')}`;
    const decision=identity.classifyDifficulty(state,step.root,{...step.evidence,approvedEventScores:(step.scores??[]).map(s=>({topicId:step.topicId,eventId:turns[s.index]?.eventId,similarity:s.similarity}))});
    const shouldAdd=step.simulateApproval===true && ['new_difficulty','repeated_difficulty','review_candidate'].includes(decision.relation);
    // Fixture's choice emulates explicit approval; NEVER auto-approve in the actual app.
    if(shouldAdd){
      const choice=step.choice??'new_distinct';
      const resolved=identity.resolveReviewedIdentity(state,step.root,decision,choice);
      if(resolved){const difficultyId=resolved.difficultyId??eventId;
        state.myway_learning_evidence.push({event_id:eventId,root_problem:step.root,difficulty_id:difficultyId,
          difficulty_relation:resolved.relation,origin:'v37d2c_validated_assessment',
          ...(resolved.relatedEventId?{related_event_id:resolved.relatedEventId}:{})});}
    }
    turns.push({turn:index+1,eventId,relation:decision.relation,anchor:decision.difficultyId,added:shouldAdd&&state.myway_learning_evidence.some(e=>e.event_id===eventId)});
  }
  return {turns,history:state.myway_learning_evidence};
}
