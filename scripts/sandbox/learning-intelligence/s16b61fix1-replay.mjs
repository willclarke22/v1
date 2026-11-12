#!/usr/bin/env node
/** Matched frozen-context model replay. Never resumes a learner or writes learner memory. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {makeRequest,parseResult} from './s16b59-lean-core.mjs';
import {promptFor} from './s16b60-prompts.mjs';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export function options(argv){const o={trace:null,role:'A',model:'gpt-4.1',mode:'offline',budget:null,allowSpend:false,limit:4};for(let i=0;i<argv.length;i++){
 const x=argv[i];if(x==='--allow-spend'){o.allowSpend=true;continue;}
 const m={'--trace':'trace','--role':'role','--model':'model','--mode':'mode','--budget-usd':'budget','--limit':'limit'};
 if(!m[x]||i+1>=argv.length)throw Error('Invalid replay arg '+x);o[m[x]]=argv[++i];}
 o.limit=Number(o.limit);
 if(!o.trace||!['A','B'].includes(o.role)||!PRICING[o.model]||!['offline','model'].includes(o.mode)||!Number.isInteger(o.limit)||o.limit<1||o.limit>40)throw Error('Invalid replay arguments');
 if(o.mode==='model'&&(!o.allowSpend||!(Number(o.budget)>0)))throw Error('Replay spend requires explicit approval and budget');return o;}
export async function replay(trace,o,{invoke}={}){
 const steps=trace.timeline.filter(x=>x.model_inputs?.[o.role]).slice(0,o.limit),out=[],ledger={calls:0,estimated_usd:0};
 if(o.mode==='model'){const price=PRICING[o.model];const admission=steps.length*(16000*price.input+1400*price.output)/1e6;
  if(admission>Number(o.budget))throw Error(`Replay admission estimate $${admission.toFixed(4)} exceeds budget; no calls made`);}
 for(const x of steps){const input=x.model_inputs[o.role];const payload=makeRequest(o.role,input);payload.model=o.model;payload.messages[0].content=promptFor(o.role,trace.options?.prompt??'s60');
  if(o.mode==='offline'){out.push({step:x.step,learner_observation_id:x.learner_observation_id,source_model_output:x['model_'+o.role.toLowerCase()],comparison_status:'NOT_RUN_OFFLINE_ONLY',same_exact_input:true});continue;}
  try{
   const res=invoke?await invoke(payload,x):await callProvider(payload,credentials());ledger.calls++;
   if(!res.usage)throw Error('Replay usage not available');ledger.estimated_usd=+(ledger.estimated_usd+estimateCost(res.usage,o.model)).toFixed(9);
   if(ledger.estimated_usd>Number(o.budget))throw Error('Estimated replay budget reached');
   const value=typeof res.raw==='string'?parseResult(res.raw,o.role):res;
   out.push({step:x.step,learner_observation_id:x.learner_observation_id,original:x['model_'+o.role.toLowerCase()],replayed:value,
    context_exactly_matched:true,semantic_winner_not_automatically_determined:true});
  }catch(err){out.push({step:x.step,error:String(err.message),partial:true});break;}
 }
 return {schema:'myway_s61fix1_frozen_context_replay_v1',model:o.model,role:o.role,mode:o.mode,original_prompt:trace.options?.prompt,
  note:'Same stored model input and prompt; stochastic provider output may differ. Compare independently; no automatic accuracy claim.',rows:out,ledger,
  complete:out.length===steps.length&&!out.some(x=>x.error),database_writes:0};
}
async function main(){const o=options(process.argv.slice(2)),f=path.resolve(o.trace),root=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b61');
 if(!f.startsWith(root+path.sep)||path.basename(f)!=='trace.json')throw Error('Replay accepts only S61 generated report trace.json');
 const t=JSON.parse(fs.readFileSync(f,'utf8'));if(t.schema!=='myway_s16b61_longitudinal_v1')throw Error('Wrong trace schema');
 if(!t.timeline.some(x=>x.model_inputs))throw Error('Trace does not contain frozen model inputs; run FIX1 journey first');
 const r=await replay(t,o);const dir=path.dirname(f),name=`MATCHED_REPLAY_${o.role}_${o.model.replace(/[^a-z0-9_-]/gi,'-')}.json`;
 fs.writeFileSync(path.join(dir,name),JSON.stringify(r,null,2)+'\n',{flag:'wx'});
 console.log('MATCHED REPLAY '+path.join(dir,name));console.log('RESULT '+JSON.stringify({calls:r.ledger.calls,known_estimated_usd:r.ledger.estimated_usd,complete:r.complete}));if(!r.complete)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('MATCHED REPLAY STOP '+String(e.message).slice(0,300));process.exitCode=1;});
