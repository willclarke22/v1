/** Read-only evaluation categories. Never conflate a provisional repeated-difficulty proposal with an actual DB merge. */
export const labels=['same','distinct','refinement','ambiguous','no_history','fault_missing_scores'];
export const relations=['new_difficulty','repeated_difficulty','review_candidate','possible_refinement','uncertain'];
export function riskCategory(expected,relation,effectiveAction){
  if(relation===null)return 'operational_error';
  if(expected==='fault_missing_scores')return effectiveAction==='hold'?'fault_abstained':'unsafe_fault_routing';
  if(expected==='no_history')return relation==='new_difficulty'?'new_identity_proposal':'unexpected_no_history';
  if(expected==='same'){
    if(relation==='repeated_difficulty')return 'supported_repeat_proposal';
    if(relation==='new_difficulty')return 'possible_duplicate_identity';
    return 'conservative_review_or_hold';
  }
  if(expected==='distinct'){
    if(relation==='repeated_difficulty')return 'unsafe_repeat_proposal';
    if(relation==='new_difficulty')return 'supported_distinct_proposal';
    return 'conservative_review_or_hold';
  }
  if(expected==='refinement'){
    if(relation==='repeated_difficulty')return 'premature_repeat_hypothesis';
    if(relation==='new_difficulty')return 'premature_novelty_hypothesis';
    return 'conservative_review_or_hold';
  }
  if(expected==='ambiguous'){
    if(relation==='repeated_difficulty')return 'premature_repeat_hypothesis';
    if(relation==='new_difficulty')return 'premature_novelty_hypothesis';
    return 'conservative_review_or_hold';
  }
  return 'unscored';
}
export function aggregate(rows,mode,suite){
  const counted=rows.filter(x=>x.semanticLabel&&mode==='semantic'&&suite==='challenge'&&x.semanticLabel!=='fault_missing_scores'&&x.semanticLabel!=='no_history'&&x.actual!==null);
  const matrix={};for(const row of counted){matrix[row.semanticLabel]??={};matrix[row.semanticLabel][row.actual]=(matrix[row.semanticLabel][row.actual]??0)+1;}
  const byRisk={};for(const row of rows)byRisk[row.risk]=(byRisk[row.risk]??0)+1;
  const highRisk=['unsafe_repeat_proposal','possible_duplicate_identity','premature_repeat_hypothesis','premature_novelty_hypothesis','unsafe_fault_routing'];
  return {
    total:rows.length,operationalErrors:rows.filter(x=>x.error).length,
    evaluatedSemanticCases:counted.length,reviewOrHold:rows.filter(x=>['hold'].includes(x.effectiveAction)||['review_candidate','possible_refinement','uncertain'].includes(x.actual)).length,
    unsafeRepeatProposals:counted.filter(x=>x.risk==='unsafe_repeat_proposal').length,
    possibleDuplicateIdentityProposals:counted.filter(x=>x.risk==='possible_duplicate_identity').length,
    prematureIdentityProposals:counted.filter(x=>['premature_repeat_hypothesis','premature_novelty_hypothesis'].includes(x.risk)).length,
    faultInjectionCases:rows.filter(x=>x.semanticLabel==='fault_missing_scores').length,
    faultGuardsPassed:rows.filter(x=>x.risk==='fault_abstained').length,
    highRiskFindings:rows.filter(x=>highRisk.includes(x.risk)).length,
    matrix,byRisk,
    calibrationStatus:'not_calibrated',
    sourceWarning:'Reference labels are human-authored hypotheses, not independent expert-grounded gold. Candidate topic similarities and labels are synthetic. No actual DB merges occur.',
  };
}
