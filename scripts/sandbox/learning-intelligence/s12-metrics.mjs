/** Diagnostic comparisons, never calibrated accuracy estimates. */
export const baselineClass=x=>x==='repeated_difficulty'?'same':x==='new_difficulty'?'distinct':x==='uncertain'?'uncertain':x==='review_candidate'||x==='possible_refinement'?'defer':null;
export const modelClass=x=>x==='same_difficulty'?'same':x==='root_problem_refinement'?'refinement':x==='distinct_difficulty'?'distinct':x==='uncertain'?'uncertain':null;
export const expectedClass=x=>x==='ambiguous'?'uncertain':x==='same'||x==='refinement'||x==='distinct'?x:null;
export function classifyRisk(expected,decision){
 const e=expectedClass(expected);
 if(!e||!decision)return null;
 if(e==='distinct'&&(decision==='same'||decision==='refinement'))return 'potential_false_merge';
 if((e==='same'||e==='refinement')&&decision==='distinct')return 'potential_duplicate_identity';
 if(e==='uncertain'&&decision!=='uncertain'&&decision!=='defer')return 'missed_abstention';
 return null;
}
export function metrics(rows){
 const filtered=rows.filter(r=>expectedClass(r.label));
 const count=(predicate)=>filtered.filter(predicate).length;
 const confusion={baseline:{},modelC:{}};
 for(const r of filtered){
  for(const [name,pred] of [['baseline',r.baselineCategory],['modelC',r.modelCategory]]){
   if(!pred)continue;
   const e=expectedClass(r.label);confusion[name][e]??={};confusion[name][e][pred]=(confusion[name][e][pred]??0)+1;
  }
 }
 const modelRows=filtered.filter(r=>r.modelCategory);
 const baselineRows=filtered.filter(r=>r.baselineCategory);
 return {analyzed:rows.length,labeled:filtered.length,semanticScored:count(r=>r.scoreSource==='local_embedding'),modelValid:modelRows.length,modelErrors:rows.filter(r=>r.modelAttempted&&!r.modelCategory).length,
  baselineExactMatches:baselineRows.filter(r=>r.baselineCategory===expectedClass(r.label)).length,baselineScored:baselineRows.length,
  modelExactMatches:modelRows.filter(r=>r.modelCategory===expectedClass(r.label)).length,modelScored:modelRows.length,
  baselinePotentialFalseMerges:count(r=>classifyRisk(r.label,r.baselineCategory)==='potential_false_merge'),
  baselinePotentialDuplicates:count(r=>classifyRisk(r.label,r.baselineCategory)==='potential_duplicate_identity'),
  modelPotentialFalseMerges:count(r=>classifyRisk(r.label,r.modelCategory)==='potential_false_merge'),
  modelPotentialDuplicates:count(r=>classifyRisk(r.label,r.modelCategory)==='potential_duplicate_identity'),
  baselineDeferrals:count(r=>r.baselineCategory==='defer'||r.baselineCategory==='uncertain'),
  modelAbstentions:count(r=>r.modelCategory==='uncertain'),
  confusion,
  note:'Exact matches and risks are against analyst-authored hypothetical labels, NOT expert ground truth or production accuracy.'};
}
