/** S1.6B.4D: offline-constructible opt-in Model B assembly. No calls or writes. */
import {createTeachingContextEnvelope,adaptExistingPersonalization,validateTeachingPlan} from './s16b4a-interfaces.mjs';
import {selectRelevantTeachingContext} from './s16b4b-context.mjs';
import {planTeachingMove} from './s16b4c-planner.mjs';
import {prepareTeachingRequest} from './s16b4c-voice.mjs';
import {chooseTeachingPersonalization} from './s16b4d-personalization.mjs';
export const INTEGRATION_VERSION='myway_teaching_integration_v1';
const byte=s=>Buffer.byteLength(s,'utf8');
const quote=s=>JSON.stringify(s);
const valid=x=>x&&typeof x==='object'&&!Array.isArray(x);
const allowedVariants=new Set(['contract','personalized']);
function note(d){
 const p=d.preferences;
 const parts=[];
 if(p.preferred_style)parts.push(`style=${quote(p.preferred_style)}`);
 if(p.jargon_level)parts.push(`jargon=${quote(p.jargon_level)}`);
 if(d.use_interest!=='do_not_use'){
  parts.push(`interest=${quote(d.chosen_interest)}`);
  parts.push(`use=${d.use_interest}`);
  if(d.structural_mapping)parts.push(`proposed_mapping=${quote(d.structural_mapping)}`);
  parts.push(`analogy_limit=${quote(d.anti_distortion_guard)}`);
 }
 return parts.length?`\nPROFILE GUIDANCE (optional; not learner-evidence; never force interest): ${parts.join('; ')}`:'';
}
/** The 4D route is opt-in and independent of the unchanged S1.5 model B endpoint.
 * Source candidate priority is controlled by the 4B selector, with progressive budgets.
 * An exact target is NEVER truncated to make room for profile suggestions. */
export function assembleTeachingExperiment({learner,assessment,state={},context_candidates=[],profileInput={},bridgeCandidates=[],selectorOptions={},plannerOptions={},variant='contract'}={}){
 if(!allowedVariants.has(variant)||!valid(selectorOptions)||!valid(plannerOptions))throw Error('Invalid teaching experiment options');
 const normalized=adaptExistingPersonalization(profileInput);
 const budgets=[[650,1200,8],[540,970,6],[430,790,4],[330,610,3],[220,400,2]];
 const attempts=[];
 for(const [ordinary,correction,maxSelected] of budgets){
  const envelope=createTeachingContextEnvelope({learner,assessment,state,context_candidates,personalization:normalized,
   limits:{ordinary_context_token_target:ordinary,correction_context_token_ceiling:correction}});
  const selection=selectRelevantTeachingContext(envelope,{...selectorOptions,maxSelected});
  const decision=planTeachingMove(envelope,selection,plannerOptions);
  if(decision.status!=='READY_UNTESTED')return {schema_version:'myway_teaching_assembly_v1',status:'BLOCKED_CONTEXT',reason:decision.reason,attempts,selection,decision,request:null};
  const personalization=variant==='personalized'?chooseTeachingPersonalization({profileInput,topic:assessment.topic,action:decision.action,bridgeCandidates}):
   chooseTeachingPersonalization({profileInput:{},topic:assessment.topic,action:decision.action,bridgeCandidates:[]});
  const plan={...decision.plan,personalization_decision:{chosen_interest:personalization.chosen_interest,use_interest:personalization.use_interest,reason:personalization.reason,
   structural_mapping:personalization.structural_mapping,anti_distortion_guard:personalization.anti_distortion_guard}};
  validateTeachingPlan(plan);
  const planned={...decision,plan};
  const prepared=prepareTeachingRequest(envelope,selection,planned);
  if(prepared.status!=='READY_UNTESTED'){
   attempts.push({ordinary,correction,maxSelected,result:prepared.status,reason:prepared.reason,selected_evidence_ids:decision.selected_evidence_ids});continue;
  }
  const context=structuredClone(prepared.request);
  const personalizationText=variant==='personalized'?note(personalization):'';
  const available=2500-context.original_statement.length;
  let includedPersonalization=personalizationText;
  if(personalizationText.length>available)includedPersonalization=''; // Optional text only, exact history untouched.
  context.original_statement+=includedPersonalization;
  const payload={format:'myway_s16b4d_teaching_v1',variant,model:'gpt-4.1-mini',action:decision.action,context,
   personalization:{chosen_interest:includedPersonalization?personalization.chosen_interest:null,
    use_interest:includedPersonalization?personalization.use_interest:'do_not_use',
    reason:includedPersonalization?personalization.reason:'Interest omitted for transport-size safety.',
    structural_mapping:includedPersonalization?personalization.structural_mapping:'',
    anti_distortion_guard:includedPersonalization?personalization.anti_distortion_guard:'No analogy authorized.'}};
  const bytes=byte(JSON.stringify(payload));
  if(bytes>6200){attempts.push({ordinary,correction,maxSelected,result:'BLOCKED_SIZE',serialized_request_bytes:bytes,selected_evidence_ids:decision.selected_evidence_ids});continue;}
  return {schema_version:'myway_teaching_assembly_v1',status:'READY_EXPERIMENTAL_OPT_IN',variant,action:decision.action,
   request:payload,selection,decision:planned,personalization,
   audit:{selected_evidence_ids:decision.selected_evidence_ids,selected_evidence_count:selection.selected.length,
    excluded_evidence:selection.omitted.map(x=>({evidence_id:x.evidence_id,reason:x.reason})),
    estimated_supplemental_context_tokens:selection.usage.estimatedTokens,
    profile_guidance_included:!!includedPersonalization,profile_guidance_omitted_due_size:!!personalizationText&&!includedPersonalization,
    personalization_selected:personalization.use_interest,serialized_request_bytes:bytes,attempts,
    target_evidence_truncated:false,production_model_b_unchanged:true,model_b_calls_per_turn:1,requires_paid_opt_in:true}};
 }
 return {schema_version:'myway_teaching_assembly_v1',status:'BLOCKED_SIZE',reason:'Required evidence cannot fit existing compact model transport without truncation.',attempts,request:null};
}
/** S1.6B.3 baseline request: same learner/assessment, no new teaching voice. */
export function createBaselineTeachingRequest({learner,assessment,previousTeaching=''}){
 if(!learner||!assessment||typeof learner.message!=='string')throw Error('Invalid baseline inputs');
 const ctx={topic:assessment.topic,root_problem:assessment.root_problem,evidence_quote:assessment.evidence_quote,
  original_statement:`${learner.message}${previousTeaching?'\nPrevious teaching: '+previousTeaching:''}`,clarification_answer:''};
 if(ctx.original_statement.length>2500||ctx.topic.length>110||ctx.root_problem.length>500||ctx.evidence_quote.length>450)throw Error('Baseline input exceeds existing endpoint schema');
 return {format:'myway_s15_shadow_model_v1',stage:'teaching',context:ctx,model:'gpt-4.1-mini'};
}
