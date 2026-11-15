#!/usr/bin/env node
/** Pure free plan for the learner-first longitudinal journey; no embeddings, API or DB. */
import {parseArgs,loadPlans,selectedSchedule} from './s62a-fix1c-journey.mjs';
import {fixturePublic} from './s16b60-fixture.mjs';
import {admissionEstimate,selectModels} from './s16b61fix1-models.mjs';
const argv=process.argv.slice(2).filter(x=>x!=='--allow-spend');
const index=argv.indexOf('--budget-usd');if(index>=0)argv.splice(index,2);
const m=argv.indexOf('--mode');if(m>=0){argv[m+1]='offline'}else argv.push('--mode','offline');
try{
 const o=parseArgs(argv),plans=loadPlans(),f=fixturePublic(),schedule=selectedSchedule(f,plans,o),models=selectModels(o);
 const estimate=admissionEstimate(schedule,o.turnsPerVisit,o,models);
 console.log('S62A-FIX1C JOURNEY PLAN (NO API/EMBEDDING/DB CALLS)\n'+JSON.stringify({learner:o.learner,visits:schedule.length,turns_per_visit:o.turnsPerVisit,total_turns:schedule.length*o.turnsPerVisit,models,retrieval:o.retrieval,planned_mode:'read_only_plan',estimated_usd:estimate.estimated_usd,maximum_modeled_calls:estimate.upper_calls,limitations:['Six authored visit openings per learner; eight-visit follow-ups are deferred','Admission estimation only, NOT a billing cap','Actual learner comprehension not evaluated automatically']},null,2));
}catch(e){console.error('S62A-FIX1C PLAN STOP: '+String(e?.message??e));process.exitCode=1}
