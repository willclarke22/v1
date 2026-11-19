/** R2: Preserve valid A assessments when individual optional memory actions are invalid.
 * No semantic repair or invented citations. The original raw response is retained by the caller.
 */
import {verifyA,applyA,learnerBrief,A_PROMPT,A_SCHEMA,B_PROMPT,B_SCHEMA,L_PROMPT,L_SCHEMA} from './s62b-core.mjs';
export {applyA,learnerBrief,A_SCHEMA,B_PROMPT,B_SCHEMA,L_PROMPT,L_SCHEMA};
export const A_PROMPT_R2=A_PROMPT+`

Memory contract precision (not required actions): Create => target_id must be null. Revise/weaken/retire => target_id must name an existing, same-type memory record. possible_instances contains ROOT RECORD IDs ONLY for a shared_root hypothesis; it must be [] for a topic-specific root, understanding, interest, or teaching_response. Evidence IDs belong in evidence[].id, never possible_instances. A shared_root needs at least two distinct candidate roots and direct cited observations from two topics. Do not invent IDs or use an existing ID as a create target. It is perfectly acceptable to return memory_decisions: [] on any turn. A root claim should hypothesize a learner-specific explanatory mechanism, not merely paraphrase a presenting question. Cite the observation's condition: an authored, unscored opening is NOT an independent scored attempt. A learner's question is NOT proof that their tentative difficulty persists. Keep both supporting and contradicting observations, distinguish coached from unhinted performance. The learning brief should be useful independently of whether any memory edit can be applied.`;
const clone=x=>structuredClone(x);
function requireString(x,label){if(typeof x!=='string'||!x.trim()||x.length>5000)throw Error(`A: invalid ${label}`);}
export function verifyAIsolated(raw,packet,state){
 const result={assessment_valid:false,error:null,output:null,accepted_memory_actions:[],rejected_memory_actions:[],proposed_memory_actions:0};
 let a;
 try{a=typeof raw==='string'?JSON.parse(raw):clone(raw);
  // Validate main assessment and its evidence independently of optional memory proposals.
  if(!a||!Array.isArray(a.memory_decisions))throw Error('A: memory_decisions must be an array');
  verifyA({...a,memory_decisions:[]},packet,state);
  requireString(a.observed.demonstrated,'observed.demonstrated');
  requireString(a.observed.conditions,'observed.conditions');
  requireString(a.observed.untested_or_incorrect,'observed.untested_or_incorrect');
  if(!Array.isArray(a.interpretation.hypotheses)||a.interpretation.hypotheses.length>15||a.interpretation.hypotheses.some(x=>typeof x!=='string'))throw Error('A: invalid hypotheses');
  if(!['low','medium','high'].includes(a.interpretation.uncertainty))throw Error('A: invalid uncertainty');
  if(a.interpretation.more_history_needed!==null&&typeof a.interpretation.more_history_needed!=='string')throw Error('A: invalid retrieval request');
  for(const [key,val] of Object.entries(a.learner_brief_for_B))if(key!=='possible_shared_root')requireString(val,'learner brief '+key);
  if(a.learner_brief_for_B.possible_shared_root!==null&&typeof a.learner_brief_for_B.possible_shared_root!=='string')throw Error('A: invalid shared-root brief');
  result.assessment_valid=true;
 }catch(e){result.error=String(e?.message??e);return result;}
 result.proposed_memory_actions=a.memory_decisions.length;
 result.output={...a,memory_decisions:[]};
 const usedTargets=new Set();
 // Large proposal arrays are a contract failure for memory only, not for the cognitive assessment.
 for(const [index,m] of a.memory_decisions.entries()){
  try{
   if(index>=5)throw Error('A: memory action count exceeds five');
   verifyA({...a,memory_decisions:[m]},packet,state);
   if(m.action!=='create'){
    if(usedTargets.has(m.target_id))throw Error('A: duplicate memory target in turn');
    usedTargets.add(m.target_id);
   }
   result.accepted_memory_actions.push(m);
  }catch(e){result.rejected_memory_actions.push({index,error:String(e?.message??e),raw_action:clone(m)});}
 }
 result.output.memory_decisions=clone(result.accepted_memory_actions);
 return result;
}
