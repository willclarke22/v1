/** S61-FIX1 scorecard: separate verifiable technical facts from qualitative review. */
const STATUS='not_independently_assessed';
const round=x=>+Number(x??0).toFixed(3);
export const CAPABILITIES=[
 {key:'learner_understanding',label:'Learner-specific underlying-cause accuracy'},
 {key:'memory_relationships',label:'Memory and learner-specific relationship quality'},
 {key:'tutoring',label:'Teaching quality and scientific accuracy'},
 {key:'learning_outcomes',label:'Independent learning and transfer outcomes'},
 {key:'personalization',label:'Evidence-backed teaching personalization'},
 {key:'reliability',label:'Technical reliability and efficiency'}
];
export function buildScorecard(trace,reviews=[]) {
 const steps=trace.timeline??[],planned=(trace.options?.visits??0)*(trace.options?.turnsPerVisit??0);
 const allObs=Object.values(trace.learner_histories??{}).flatMap(x=>x.observations??[]);
 const assessed=new Set(steps.map(x=>x.learner_observation_id));
 const pending=allObs.filter(x=>x.source==='MODEL_L_REACTED_TO_ACTUAL_TUTOR'&&!assessed.has(x.id)).map(x=>x.id);
 const checks=steps.flatMap(x=>x.validation??[]);const invalid=checks.filter(x=>x.accepted===false);
 const requests=(trace.request_log??[]).filter(x=>Number.isFinite(x.input_bytes));
 const reviewValid=reviews.filter(r=>r.validation==='passed');
 const complete=Boolean(trace.summary?.run_complete)&&!trace.failure&&steps.length===planned;
 const metrics={planned_steps:planned,completed_steps:steps.length,completion_fraction:planned?round(steps.length/planned):null,
  root_records:trace.summary?.root_records??0,learner_relationship_records:trace.summary?.learner_relationship_records??0,
  provisional_memory_revision_events:trace.summary?.memory_revision_events??0,
  invalid_evidence_checks:invalid.length,invalid_evidence_checks_blocked:invalid.length,
  unassessed_observation_ids:pending,request_diagnostics_count:requests.length,
  maximum_request_bytes:requests.length?Math.max(...requests.map(x=>x.input_bytes)):null,
  maximum_serialized_request_bytes:requests.length?Math.max(...requests.map(x=>x.serialized_request_bytes??0)):null,
  total_calls:trace.cost?.calls??0,estimated_cost_usd:trace.cost?.known_estimated_usd??0,
  database_writes:trace.summary?.database_writes??0,authoritative_memory_writes:trace.authoritative_memory_writes??0,
  independent_reviewed_steps:reviewValid.length,scientific_correctness_automatically_scored:false};
 const capabilities=CAPABILITIES.map(c=>({key:c.key,label:c.label,
  status:c.key==='reliability'?(complete?'technical_checks_passed_for_this_run':'technical_checks_incomplete'):
    c.key==='learning_outcomes'?'not_established_by_current_simulated_run':STATUS,
  evidence_ids:c.key==='reliability'?steps.map(x=>x.learner_observation_id):[],
  notes:c.key==='reliability'?(complete?'Completion, reference checks and costs shown below; this does not validate educational quality.':`Incomplete run; ${(trace.failure?.message??'missing steps')}`):
       c.key==='learning_outcomes'?'Unscored synthetic answers and immediate probes cannot prove independent learning.':
       'Model proposals and private fictional profiles are not gold-standard judgments.',
  independent_model_review_available:reviewValid.length>0 }));
 if(reviewValid.length){for(const c of capabilities){if(['learner_understanding','memory_relationships','tutoring','personalization'].includes(c.key)){
  c.status='model_review_available_human_calibration_required';
  c.evidence_ids=[...new Set(reviewValid.flatMap(x=>x.evidence_ids??[]))];
  c.notes='Independent *model-assisted* reviewer findings supplied; not a scientifically validated verdict.';
 }}}
 return {schema:'myway_s61fix1_six_capability_scorecard_v1',generated_from:'observed trace only; reference profile not used to decide correctness',
  overall_verdict:complete?'TECHNICALLY_COMPLETE_EDUCATIONAL_QUALITY_NOT_YET_VALIDATED':'INCOMPLETE_RESEARCH_RUN',
  reliability_assessment:complete?'complete':'incomplete',
  educational_effectiveness:'not_proven_by_synthetic_simulation',
  synthetic_data_not_human_outcome:true,metrics,capabilities,
  model_review:reviewValid.length?{reviewed_steps:reviewValid.length,findings:reviewValid.map(x=>({step:x.step,assessment:x.assessment,evidence_ids:x.evidence_ids,concern:x.concern}))}:null,
  required_next_evidence:['Independent science/task-validity review','Matched replay of identical observations for model comparison','Novel independent or delayed transfer tasks','Tutor-with-memory versus same tutor without long-term memory','Human-reviewed evaluation samples and reviewer-disagreement tracking']};
}
export function scorecardMarkdown(s){
 const lines=['# MyWay S61-FIX1 — Six-Capability Evaluation Scorecard','',`**Overall:** ${s.overall_verdict}`,
 '',`**Observed:** ${s.metrics.completed_steps}/${s.metrics.planned_steps} planned steps; ${s.metrics.total_calls} model calls; $${s.metrics.estimated_cost_usd} estimated API cost.`,
 '',`**Evidence checks:** ${s.metrics.invalid_evidence_checks} invalid references blocked; **database writes:** ${s.metrics.database_writes}.`,
 '',`**Unassessed learner responses:** ${s.metrics.unassessed_observation_ids.join(', ')||'none'}.`,
 '',`**Largest logged model input:** ${s.metrics.maximum_request_bytes??'not recorded'} bytes.`,
 '', '| Capability | Assessment | Basis |','|---|---|---|'];
 for(const c of s.capabilities)lines.push(`| ${c.label} | ${c.status} | ${c.notes.replace(/\|/g,'/')} |`);
 lines.push('','## Interpretation','- Technical completion does not imply correct scientific reasoning.','- Model A proposals are provisional; a proposal count is not a success metric.','- No relationship can be a correct outcome.','- Independent model-assisted review is fallible and requires human calibration.','- Fixed synthetic profiles and private rubric labels are hypotheses, not ground truth.','- Transfer and effectiveness require new tasks and comparison to a tutor without learner-specific memory.','');
 return lines.join('\n');
}
