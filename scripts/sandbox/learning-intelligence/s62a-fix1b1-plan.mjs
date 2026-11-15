#!/usr/bin/env node
/** Zero model, embedding, or DB calls. Verifies the exact saved RUNE checkpoint and options. */
import {parseArgs,loadPlans,selectedSchedule} from './s62a-fix1b1-journey.mjs';
import {inspectResumeFile,assertResumeTrace} from './s62a-fix1b1-resume.mjs';
import {fixturePublic} from './s16b60-fixture.mjs';
import {selectModels,admissionEstimate} from './s16b61fix1-models.mjs';
const args=process.argv.slice(2);let tracePath='',budget=1,corrections=0;
for(let i=0;i<args.length;i++){
 const a=args[i];if(i+1>=args.length)throw Error('Missing value for '+a);
 if(a==='--resume-from')tracePath=args[++i];
 else if(a==='--budget-usd')budget=Number(args[++i]);
 else if(a==='--max-reference-corrections')corrections=Number(args[++i]);
 else throw Error('Unknown plan option '+a);
}
if(!tracePath||!Number.isFinite(budget)||budget<=0||budget>8||!Number.isInteger(corrections)||corrections<0||corrections>1)throw Error('Invalid free plan parameters');
const {trace,sha256}=inspectResumeFile(tracePath),p=trace.options;
const a=['--mode','model','--learner',p.learner,'--visits',String(p.visits),'--turns-per-visit',String(p.turnsPerVisit),'--retrieval',p.retrieval,'--audit-retrieval',p.auditRetrieval,'--explore',p.explore,'--c',p.c,'--prompt',p.prompt,'--seed-history',p.seedHistory,'--memory-mode',p.memoryMode,'--a-variant',p.aVariant,'--model-a',p.modelA,'--model-b',p.modelB,'--model-c',p.modelC,'--model-l',p.modelL,'--budget-usd',String(budget),'--max-reference-corrections',String(corrections),'--resume-from',tracePath,'--allow-spend'];
const o=parseArgs(a),schedule=selectedSchedule(fixturePublic(),loadPlans(),o),check=assertResumeTrace(trace,o,schedule);
const admission=admissionEstimate(schedule,o.turnsPerVisit,o,selectModels(o)),remainingEstimate=+(admission.estimated_usd*check.remaining_steps/(schedule.length*o.turnsPerVisit)).toFixed(6);
const result={stage:'S62A-FIX1B.1',type:'RUNE exact-checkpoint continuation',read_only_plan:true,archive_trace_sha256:sha256,original_completed_steps:check.completed_steps,unfinished_step:check.next_step,remaining_steps:check.remaining_steps,expected_total_steps:schedule.length*o.turnsPerVisit,original_model_calls:trace.cost.calls,original_known_estimated_usd:trace.cost.known_estimated_usd,additional_estimated_admission_usd:remainingEstimate,new_authorization_budget_usd:budget,max_reference_corrections_per_resume:corrections,original_last_failure:trace.failure.message,uncommitted_original_observations_to_reconstruct:check.uncommitted_observation_ids,model:o.modelA,retrieval:o.retrieval,notes:['No model, embedding or DB calls in Plan','Historical calls not repeated; new spending explicit on Model run','Admission estimate is not billing cap','No automatic scientific correctness grading']};
console.log('S62A-FIX1B1 RESUME PLAN (NO API/EMBEDDING/DB CALLS)');console.log(JSON.stringify(result,null,2));
if(remainingEstimate>budget)throw Error('Remaining admission estimate exceeds the new budget');
console.log('S62A-FIX1B1 PLAN PASS');
