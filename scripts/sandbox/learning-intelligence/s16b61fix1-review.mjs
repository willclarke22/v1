#!/usr/bin/env node
/** Optional, post-journey model-assisted independent review. Never modifies learning memory. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';
import {buildScorecard,scorecardMarkdown} from './s16b61fix1-scorecard.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const SCHEMA={type:'object',additionalProperties:false,properties:{
 assessment:{type:'string',enum:['supported','mixed','unsupported','uncertain','not_tested']},
 concern:{type:'string'},strength:{type:'string'},evidence_ids:{type:'array',items:{type:'string'}},
 scientific_accuracy:{type:'string',enum:['appears_correct','possible_error','clear_error','unassessed']},
 root_inference:{type:'string',enum:['supported','overinterpreted','appropriate_abstention','not_tested','uncertain']},
 teaching_quality:{type:'string',enum:['responsive','mixed','unresponsive','unassessed']},
 next_independent_check:{type:'string'}
},required:['assessment','concern','strength','evidence_ids','scientific_accuracy','root_inference','teaching_quality','next_independent_check']};
function parse(argv){const o={mode:'offline',trace:null,model:'gpt-4.1-mini',budget:null,allowSpend:false,limit:12};for(let i=0;i<argv.length;i++){
 const a=argv[i];if(a==='--allow-spend'){o.allowSpend=true;continue;}
 const keys={'--mode':'mode','--trace':'trace','--model':'model','--budget-usd':'budget','--limit':'limit'};
 if(!keys[a]||i+1===argv.length)throw Error('Unknown/missing reviewer arg '+a);o[keys[a]]=argv[++i];}
 o.limit=Number(o.limit);if(!Number.isInteger(o.limit)||o.limit<1||o.limit>40||!o.trace||!['offline','model'].includes(o.mode)||!PRICING[o.model])throw Error('Invalid reviewer options');
 if(o.mode==='model'&&(!o.allowSpend||!(Number(o.budget)>0)))throw Error('Paid review requires explicit budget and allow-spend');return o;}
export async function review(trace,opts,{invoke}={}){
 const reviews=[],ledger={calls:0,estimated_usd:0,unknown_usage:0},cases=trace.timeline.slice(0,opts.limit);
 if(opts.mode==='model'){const rate=PRICING[opts.model];const admission=cases.length*(9000*rate.input+600*rate.output)/1e6;
  if(admission>Number(opts.budget))throw Error(`Reviewer admission estimate $${admission.toFixed(4)} exceeds approved budget; no calls made`);}
 for(const step of cases){
  const obs=Object.values(trace.learner_histories??{}).flatMap(x=>x.observations??[]),ids=new Set(obs.map(x=>x.id));
  const packet={step:step.step,learner_observation_id:step.learner_observation_id,learner:step.learner,
    tutor:step.tutor,probe:step.probe?.question??null,model_a:{presenting_difficulty:step.model_a.presenting_difficulty,possible_underlying_causes:step.model_a.possible_underlying_causes,
      root_actions:step.model_a.root_actions,relationship_actions:step.model_a.relationship_actions},
    nearby_observations:obs.filter(x=>step.retrieval.A.included_ids.includes(x.id)).slice(-7).map(x=>({id:x.id,text:x.text,task_conditions:x.task_conditions})),
    note:'Reviewer must not use synthetic hidden truth, infer mastery from immediate answer, or reward relationship quantity.'};
  if(opts.mode==='offline'){reviews.push({step:step.step,validation:'not_run',assessment:'not_tested',evidence_ids:[],concern:'No model review requested',input_available:true});continue;}
  const request={model:opts.model,store:false,max_tokens:550,messages:[{role:'system',content:'You are an external research reviewer, NOT the tutor or learner model. Examine learner/tutor interaction and Model A proposal independently. Distinguish scientific task correctness from learner-specific causal hypotheses. Identify at least one justified strength or limitation, or abstain when evidence is weak. Use only supplied observation IDs and do not use private learner state. A single correct answer, tutor praise or a forced model label is not proof of mastery. Return schema-only JSON.'},{role:'user',content:JSON.stringify(packet)}],response_format:{type:'json_schema',json_schema:{name:'s61fix1_review',strict:true,schema:SCHEMA}}};
  let answer;
  try{
   const response=invoke?await invoke(request,step):await callProvider(request,credentials());
   ledger.calls++;if(!response.usage)throw Error('Reviewer usage unknown; stop');
   const cost=estimateCost(response.usage,opts.model);ledger.estimated_usd=+(ledger.estimated_usd+cost).toFixed(9);
   if(ledger.estimated_usd>Number(opts.budget))throw Error('Reviewer estimated budget exceeded; stopping');
   answer=typeof response.raw==='string'?JSON.parse(response.raw):response;
   if(!answer||!Array.isArray(answer.evidence_ids)||answer.evidence_ids.some(id=>!ids.has(id)||!packet.nearby_observations.some(x=>x.id===id))||!['supported','mixed','unsupported','uncertain','not_tested'].includes(answer.assessment))throw Error('Invalid or invented reviewer evidence IDs');
   reviews.push({step:step.step,validation:'passed',...answer});
  }catch(error){reviews.push({step:step.step,validation:'failed',error:String(error.message),evidence_ids:[]});break;}
 }
 return {reviews,ledger,complete:opts.mode==='offline'||reviews.length===cases.length&&reviews.every(x=>x.validation==='passed')};
}
async function main(){const o=parse(process.argv.slice(2));const file=path.resolve(o.trace),base=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b61');
 if(!file.startsWith(base+path.sep)||path.basename(file)!=='trace.json'||!fs.statSync(file).isFile())throw Error('Review only generated S61 trace.json under ignored report folder');
 const t=JSON.parse(fs.readFileSync(file,'utf8'));
 if(t.schema!=='myway_s16b61_longitudinal_v1')throw Error('Not an S61 trace');
 const report=await review(t,o);const dir=path.dirname(file);const name='INDEPENDENT_MODEL_REVIEW.json';
 fs.writeFileSync(path.join(dir,name),JSON.stringify({warning:'MODEL-ASSISTED, FALLIBLE, NOT EXPERT GROUND TRUTH',options:{mode:o.mode,model:o.model},...report},null,2)+'\n',{flag:'wx'});
 const card=buildScorecard(t,report.reviews);fs.writeFileSync(path.join(dir,'SIX_CAPABILITY_SCORECARD_REVIEWED.md'),scorecardMarkdown(card)+'\n',{flag:'wx'});
 console.log('S61-FIX1 REVIEW '+path.join(dir,name));console.log('MODEL REVIEW '+JSON.stringify({calls:report.ledger.calls,estimated_cost_usd:report.ledger.estimated_usd,reviewed:report.reviews.filter(x=>x.validation==='passed').length,complete:report.complete}));
 if(!report.complete)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S61-FIX1 REVIEW STOP '+String(e.message).slice(0,350));process.exitCode=1;});
