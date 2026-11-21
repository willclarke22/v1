/**
 * MyWay FIX6A - corrected audit-only context reconstruction utilities.
 * No model/provider calls, persistence, network, embeddings or DB access.
 * NOTE: an original stored observation may itself be a clipped projection from
 * the older runner. FIX6 never calls a stored projection the complete real event.
 */
import crypto from 'node:crypto';

export const STAGE = 'S62B-FIX1R42FIX6A';
export const sha = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const clone = value => structuredClone(value);
const idsOf = list => (list ?? []).map(x => x?.id).filter(x => typeof x === 'string');
const unique = arr => [...new Set(arr)];
export function evidenceTime(id) {
  const m = /^[A-Z][A-Z0-9_-]*-(\d{3})-(IN|OUT)$/.exec(id ?? '');
  return m ? {round:Number(m[1]), phase:m[2]} : null;
}
export function eligibleAt(obs, round, stage) {
  const t = evidenceTime(obs?.id);
  return !!t && (t.round < round || (t.round === round && stage === 'post' && t.phase === 'IN'));
}
export function originalRequest(c, stage) {
  const a = c?.[stage + '_a'];
  if (!a?.valid || !a.delivered_input?.current?.id) throw Error(`No valid original ${stage} assessment for ${c?.case_id}`);
  const originalHash = sha(a.delivered_input);
  const matches = (a.all_model_A_calls ?? []).filter(r => r.status === 'returned' && r.request?.messages?.[0]?.role === 'system' && r.request?.messages?.[1]?.role === 'user').filter(r => {
    try { return sha(JSON.parse(r.request.messages[1].content)) === originalHash; } catch { return false; }
  });
  const req = matches.at(-1)?.request;
  if (!req) throw Error(`Could not verify the exact original A request for ${c.case_id}/${stage}. Refusing to fabricate a baseline.`);
  return clone(req);
}
export function sourceObservationView(obs) {
  // Use the COMPLETE *stored* historical observation, not the 1,800-character
  // assessment projection nor the 3,000-character embedding index.
  const out = {id:obs.id, topic_id:obs.topic_id, source:obs.source ?? obs.kind ?? 'observation', kind:obs.kind ?? null, text:String(obs.text ?? ''),
    task_conditions:clone(obs.task_conditions ?? obs.conditions ?? null)};
  if (obs.teaching_exposure_before_attempt != null) out.teaching_exposure_before_attempt = clone(obs.teaching_exposure_before_attempt);
  return out;
}
export function sourceEvidence(branch, c, stage) {
  if (!branch || !Array.isArray(branch.observations)) throw Error(`Final state lacks observations for ${c.case_id}`);
  const allowed = branch.observations.filter(o => eligibleAt(o,c.round,stage));
  if (new Set(idsOf(allowed)).size !== allowed.length) throw Error(`Duplicate source observation IDs in ${c.case_id}`);
  return allowed;
}
function requiredIds(input) {
  return new Set([input.current.id, ...(input.memory_candidates ?? []).flatMap(m => [ ...(m.evidence_ids ?? []), ...(m.supporting_evidence_ids ?? []), ...(m.contradicting_evidence_ids ?? []) ])]);
}
function candidateOrder(eligible, caseAssessment, input) {
  const delivered = new Set(idsOf(input.observations));
  const retrieved = new Set(idsOf(caseAssessment.original_retrieval?.selected));
  const required = requiredIds(input);
  const ranks = new Map((caseAssessment.original_retrieval?.ranked_preview ?? []).map((r,i)=>[r.id,i]));
  const reason = o => {
    if (required.has(o.id)) return 'linked_memory_evidence';
    if (o.topic_id === input.current.topic_id) return 'same_topic_historical';
    if (retrieved.has(o.id)) return 'semantic_retrieval_selected';
    return 'other_historical';
  };
  const priority = {linked_memory_evidence:0,same_topic_historical:1,semantic_retrieval_selected:2,other_historical:3};
  return eligible.filter(o => !delivered.has(o.id)).map(o => ({observation:o,selection_reason:reason(o)})).sort((a,b)=>
    priority[a.selection_reason]-priority[b.selection_reason] ||
    (ranks.get(a.observation.id) ?? 9999)-(ranks.get(b.observation.id) ?? 9999) ||
    (evidenceTime(b.observation.id)?.round ?? 0)-(evidenceTime(a.observation.id)?.round ?? 0)
  );
}
function decorate(input, stage, variant, eligible, dropped, targetBytes) {
  const output = clone(input), retained = idsOf(output.observations);
  const permitted = new Set([output.current.id, ...retained]);
  output.allowed_evidence_ids = unique([output.current.id,...retained]);
  output.coverage = {...(output.coverage ?? {}),
    context_packing:{kind:'fix6_counterfactual_context',variant,stage, research_only:true,
      saved_history_is_not_perfect_raw_capture:true,context_target_bytes:targetBytes,
      eligible_historical_evidence_ids:idsOf(eligible),retained_evidence_ids:retained.filter(id=>id!==output.current.id),
      original_current_observation_also_in_observations:retained.includes(output.current.id),
      omitted_evidence_ids:idsOf(eligible).filter(id=>!permitted.has(id)),
      note:'Only delivered evidence IDs are citable. Added history is sourced from a final frozen state filtered to its original time. Relevance and competence remain unverified.'}};
  const topicMap = new Map((input.available_topics ?? []).map(t=>[t.id,t]));
  for(const obs of eligible) if(permitted.has(obs.id) && !topicMap.has(obs.topic_id))
    topicMap.set(obs.topic_id,{id:obs.topic_id,title:'Historical topic '+obs.topic_id,status:'historical_context_only'});
  output.available_topics = [...topicMap.values()];
  output.coverage.context_packing.after_bytes = bytes(output);
  output.coverage.context_packing.not_delivered_due_to_budget = dropped;
  return output;
}
function assertIntegrity(original, changed, c, stage, eligible) {
  const fields = ['current','activity_actual_evidence','memory_candidates','recent_dialogue'];
  for(const key of fields) if(sha(original[key] ?? null) !== sha(changed[key] ?? null)) throw Error(`FIX6 mutated ${key} for ${c.case_id}/${stage}`);
  const authorized=new Set(idsOf(eligible));
  // Enforce time validation even for evidence present in the original packet.
  // The *current* observation is the sole same-stage exception.
  authorized.add(original.current.id);
  for(const obs of changed.observations) if(!authorized.has(obs.id)) throw Error(`Future/unknown evidence ${obs.id} entered ${c.case_id}/${stage}`);
  const keys=idsOf(changed.observations);if(new Set(keys).size!==keys.length)throw Error('Duplicate delivered evidence');
  const allow=new Set(changed.allowed_evidence_ids);
  if(!allow.has(changed.current.id)||keys.some(x=>!allow.has(x)))throw Error('Citation allowlist does not include all actually delivered evidence');
}
export function buildAssessmentVariants(c,stage,branch,{targetBytes=110000}={}) {
  const a=c?.[stage+'_a'];const req=originalRequest(c,stage);
  const orig=clone(JSON.parse(req.messages[1].content));
  if(orig.current?.id !== a.current_id || sha(orig)!==sha(a.delivered_input))throw Error('Inspector/request evidence mismatch');
  // The recorded current observation may ALSO appear in observations. It is not
  // historical evidence but was available at the assessment's own time. FIX6
  // incorrectly rejected it in the first real PRE case (ATLAS-001-IN).
  const point=evidenceTime(orig.current.id), expectedPhase=stage==='pre'?'IN':'OUT';
  if(!point || point.round!==c.round || point.phase!==expectedPhase)
    throw Error(`Current evidence time/phase mismatch for ${c.case_id}/${stage}: ${orig.current.id}`);
  const currentSaved=(branch.observations ?? []).filter(x=>x.id===orig.current.id);
  if(currentSaved.length!==1 || currentSaved[0].topic_id!==orig.current.topic_id)
    throw Error(`Current observation not unique/grounded in saved branch at ${c.case_id}/${stage}`);
  const eligible=sourceEvidence(branch,c,stage),sourceMap=new Map(eligible.map(x=>[x.id,x]));
  const originalIds=idsOf(orig.observations), originalSet=new Set(originalIds);
  if(originalIds.length!==(orig.observations??[]).length || new Set(originalIds).size!==originalIds.length)
    throw Error(`Invalid or duplicate original observation IDs at ${c.case_id}/${stage}`);
  const permittedOriginal=new Set([...sourceMap.keys(),orig.current.id]);
  const sourceMissing=originalIds.filter(x=>!permittedOriginal.has(x));
  if(sourceMissing.length)throw Error(`Original request includes truly future/unknown evidence at ${c.case_id}/${stage}: ${sourceMissing.join(',')}`);
  const selectedIds=idsOf(a.original_retrieval?.selected);
  const reported=(a.reported_omissions ?? []);
  const candidates=candidateOrder(eligible,a,orig);
  const expInput=clone(orig);for(const o of eligible)if(!originalSet.has(o.id))expInput.observations.push(sourceObservationView(o));
  const expanded=decorate(expInput,stage,'expanded',eligible,[],null);
  const awareInput=clone(orig), added=[],dropped=[];
  for(const cnd of candidates){
    const view=sourceObservationView(cnd.observation);
    awareInput.observations.push(view);
    const estimate=decorate(awareInput,stage,'evidence_aware',eligible,dropped,targetBytes);
    if(bytes(estimate)>targetBytes){awareInput.observations.pop();dropped.push({id:view.id,reason:'whole_observation_exceeds_context_target_no_clipping',source_selection_reason:cnd.selection_reason});}
    else added.push({id:view.id,selection_reason:cnd.selection_reason});
  }
  const aware=decorate(awareInput,stage,'evidence_aware',eligible,dropped,targetBytes);
  assertIntegrity(orig,expanded,c,stage,eligible);assertIntegrity(orig,aware,c,stage,eligible);
  if(bytes(aware)>targetBytes)throw Error(`Baseline context alone exceeds FIX6 target ${targetBytes}; refuse silent truncation`);
  const variants=[['original',orig],['expanded',expanded],['evidence_aware',aware]].map(([name,input])=>({
    name,input,request: name==='original' ? req : {...clone(req),messages:[req.messages[0],{role:'user',content:JSON.stringify(input)}]},
    input_sha256:sha(input),input_bytes:bytes(input),approx_tokens_bytes_div_4:Math.ceil(bytes(input)/4),
    delivered_historical_ids:idsOf(input.observations),
  }));
  const sourceForProjection=new Map([...sourceMap,[orig.current.id,currentSaved[0]]]);
  const clippedStored=orig.observations.filter(o=>{
    const saved=sourceForProjection.get(o.id);return saved&&String(saved.text??'').length>String(o.text??'').length&&String(saved.text).startsWith(String(o.text??''));
  }).map(o=>({id:o.id,delivered_text_chars:String(o.text??'').length,stored_text_chars:String(sourceForProjection.get(o.id).text??'').length}));
  return {case_id:c.case_id,round:c.round,arm:c.arm,stage,current_id:orig.current.id,topic_id:orig.current.topic_id,
    source_run:c.source_run,original_system_prompt_sha256:sha(req.messages[0].content),original_request_sha256:sha(req),
    source_eligible_ids:idsOf(eligible),source_observations_sha256:sha(eligible),
    retrieved_ids:selectedIds,reported_omissions:reported,
    original_current_observation_also_in_observations:originalSet.has(orig.current.id),
    retrieved_but_not_delivered:selectedIds.filter(id=>!originalSet.has(id)&&id!==orig.current.id),
    stored_but_not_retrieved:idsOf(eligible).filter(id=>!selectedIds.includes(id)),
    original_delivery_text_projection_detected:clippedStored,
    explicit_selection_rationale:'Prioritize memory-linked evidence, same-topic observations, already retrieved observations, then other recent evidence. This is not an oracle of educational relevance.',
    evidence_aware_added:added,evidence_aware_omitted_for_budget:dropped,
    variants,limitations:['Historical observations in the recorded state may already be truncated by the original capture path; FIX6 cannot restore omitted pre-storage raw content.','History relevance and learner competence are not objectively graded.','No model calls; this is an input-construction experiment. Current observation may also be present in original observations; it is never counted as historical.']};
}
export function buildHandoffVariants(c, request, {nextRound, fullStoredObservation=null}={}) {
  if(!c?.post_a?.current_id||!request?.messages?.[1])throw Error('Missing original B request or post-A evidence');
  const base=JSON.parse(request.messages[1].content), src=fullStoredObservation ?? c.post_a.current_observation;
  const aClaim=String(c.post_a.structured_output?.observed?.demonstrated??'');
  if(!aClaim)throw Error('No Model A description of previously observed demonstration');
  if(src?.id !== c.post_a.current_id)throw Error('Post evidence does not match source ID');
  const n=evidenceTime(src.id),next=Number(nextRound);
  if(!n || !Number.isInteger(next) || next<=n.round)throw Error('B handoff would include current/future evidence');
  if(!base.learner_brief || typeof base.learner_request!=='string')throw Error('Malformed B request baseline');
  const scope={source_evidence_id:src.id,source_stage:'post',earlier_round:c.round,next_round:next,
    source_class:'recorded_model_A_interpretation_not_independently_verified',
    model_a_claim:aClaim, original_saved_observation_text:String(src.text??''),
    task_conditions:clone(src.task_conditions ?? src.conditions ?? null),
    objective_outcome_verified:(src.task_conditions ?? src.conditions)?.objective_outcome_verified ?? null,
    instruction_preceded_attempt:(src.task_conditions ?? src.conditions)?.teacher_explanation_presented_before_attempt ?? null,
    uncertainty:'Do not infer independent mastery from an explanation or successful control execution.'};
  const explicit=clone(base);
  explicit.learner_brief.assessment={...(explicit.learner_brief.assessment ?? {}),
    relevant_history:[explicit.learner_brief.assessment?.relevant_history??'',`Earlier source ${src.id}: Model A reported: ${aClaim}. This is an unverified interpretation; assess teaching/assistance conditions and original attempts before treating as mastery.`].filter(Boolean).join('\n')};
  const sourced=clone(base);
  sourced.learner_brief.prior_knowledge=[...(sourced.learner_brief.prior_knowledge ?? []),{
    kind:'counterfactual_provisional_competence_not_saved_memory',source_evidence_id:src.id,
    claim:aClaim,verification:'not_independently_verified',uncertainty:'understanding may remain untested',
    factual_evidence:{observation_text:scope.original_saved_observation_text,task_conditions:scope.task_conditions}}];
  const entries=[['original',base],['explicit_evidence_brief',explicit],['evidence_linked_counterfactual_memory',sourced]];
  return {case_id:c.case_id,source_evidence_id:src.id,source_round:c.round,next_round:next,original_system_prompt_sha256:sha(request.messages[0].content),
    full_source_claim_chars:aClaim.length,original_saved_observation_chars:scope.original_saved_observation_text.length, source_provenance:scope,
    variants:entries.map(([name,input])=>({name,input,request:name==='original'?clone(request):{...clone(request),messages:[request.messages[0],{role:'user',content:JSON.stringify(input)}]},input_sha256:sha(input),input_bytes:bytes(input),approx_tokens_bytes_div_4:Math.ceil(bytes(input)/4)})),
    warnings:['A learner competence claim is NOT independently verified by a Model A interpretation.','The original saved observation may itself contain prior capture-time clipping.','These are prepared inputs only; no teacher responses or measured educational benefits.']};
}
