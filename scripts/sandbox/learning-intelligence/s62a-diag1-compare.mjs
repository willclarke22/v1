#!/usr/bin/env node
/** Strict, opt-in, paid frozen-input Model A comparison. No learning-journey or database writes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makeRequest,parseResult} from './s16b59-lean-core.mjs';
import {promptFor} from './s16b60-prompts.mjs';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const REPORTS=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports');
const OUTBASE=path.join(REPORTS,'s62a-diag1');
const NOTE='RESEARCH-ONLY. Frozen evidence; no scientific correctness adjudicated. Results can differ stochastically.';
const ABSTENTION='S62A EXPERIMENTAL ABSTENTION INSTRUCTION: Do not generate a memory action merely because another turn has occurred. A request for practice or a correct response may warrant no change. If the current evidence does not materially change an existing hypothesis or justify a new one, return empty root_actions/relationship_actions arrays. Distinguish an older difficulty from current demonstrated understanding; cite only observed evidence. This is a prompt variant, not a requirement to abstain.';
const CLARIFIED=`S62A-DIAG1 ACTION-SEMANTICS EXPERIMENT (not an answer key): Assess learner-specific understanding, alternative root causes, strengths, uncertainty, transfer and how teaching may confound observations before deciding whether any action is warranted. Distinguish presenting question, historical difficulty, current evidence of that difficulty, and independent generalization. A correct answer after tutoring may leave active-root confidence uncertain; do not treat it as positive proof of persistent confusion merely because it followed an old root. A correct independent transfer can contradict a hypothesis that the difficulty remains active while not erasing the historical fact it once occurred. The current S62A reducer treats action=refine cited IDs as SUPPORTING IDs, not neutral; do not choose refine for contradictory-only evidence. For strong contradictory evidence about an existing root, use weaken or challenge with the appropriate existing_id; if no meaningful update, choose empty actions. The root cause should be the particular learner's plausible mechanism, not a restatement of their topic question. Do not invent a relationship because subjects are semantically similar. Maintain uncertainty and cited alternatives. Use only supplied evidence IDs. No labels or software rule proves causal learning.`;
function parse(argv){
 const o={cases:'',model:'gpt-4.1-mini',variant:'clarified',limit:3,budget:0,allowSpend:false};
 const fields={'--cases':'cases','--model-a':'model','--variant':'variant','--limit':'limit','--budget-usd':'budget'};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--allow-spend'){o.allowSpend=true;continue;}
  if(!fields[k]||i+1===argv.length)throw Error('Invalid compare option '+k);o[fields[k]]=argv[++i];
 }
 o.limit=Number(o.limit);o.budget=Number(o.budget);
 if(!o.allowSpend||!o.cases||!Object.hasOwn(PRICING,o.model)||!['baseline','no-update','clarified'].includes(o.variant)||!Number.isInteger(o.limit)||o.limit<1||o.limit>8||!Number.isFinite(o.budget)||o.budget<=0||o.budget>2)throw Error('Explicit --allow-spend, --budget-usd (0,2], --cases and compatible model required; max 8 cases');
 return o;
}
function frozenSource(file){
 const p=path.resolve(file);
 if(path.basename(p)!=='FROZEN_CASES.json'||!p.startsWith(OUTBASE+path.sep))throw Error('Cases must be a DIAG1 FROZEN_CASES.json inside ignored report root');
 if(!fs.existsSync(p)||!fs.statSync(p).isFile()||fs.statSync(p).size>20e6)throw Error('Cases file missing or oversized');
 const real=fs.realpathSync(p),base=fs.realpathSync(OUTBASE);
 if(!real.startsWith(base+path.sep))throw Error('Symlink or path escape rejected');
 const raw=fs.readFileSync(real);const data=JSON.parse(raw.toString('utf8'));
 if(data.schema!=='myway_s62adiag1_frozen_v1'||!data.research_only||!Array.isArray(data.cases)||!data.cases.length)throw Error('Unexpected frozen-cases format');
 return {data,real,hash:crypto.createHash('sha256').update(raw).digest('hex')};
}
function loadDotEnv(){
 if(process.env.OPENAI_API_KEY)return;
 const p=path.join(ROOT,'.env.local');if(!fs.existsSync(p))return;
 const raw=fs.readFileSync(p,'utf8');
 for(const line of raw.split(/\r?\n/)){
  const m=line.match(/^\s*(?:export\s+)?(OPENAI_API_KEY|OPENAI_BASE_URL)\s*=\s*(.*?)\s*$/);
  if(!m||process.env[m[1]])continue;
  let value=m[2];if(value.length>=2&&((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))))value=value.slice(1,-1);
  process.env[m[1]]=value;
 }
}
async function main(){
 const opts=parse(process.argv.slice(2));const frozen=frozenSource(opts.cases),selected=frozen.data.cases.slice(0,opts.limit);
 // A conservative planning bound: use all request UTF-8 bytes as an upper approximation of token count;
 // this is a spending admission estimate, never a hard provider billing cap.
 const jobs=selected.map(c=>{
  if(!c.input?.research_only||c.input.role!=='A'||!c.original_model_a||!Array.isArray(c.input.allowed_observation_ids))throw Error('Malformed frozen Model A case');
  const p=makeRequest('A',c.input);p.model=opts.model;p.messages[0].content=promptFor('A','s60')+(opts.variant==='no-update'?'\n'+ABSTENTION:opts.variant==='clarified'?'\n'+CLARIFIED:'');
  const bytes=Buffer.byteLength(JSON.stringify(p));if(bytes>33000)throw Error('Full serialized request exceeds S62A safety ceiling');
  const r=PRICING[opts.model];
  return {case:c,payload:p,estimate:((bytes*r.input+1250*r.output)/1e6)};
 });
 const admission=jobs.reduce((n,j)=>n+j.estimate,0);
 if(admission>opts.budget)throw Error(`Pessimistic admission estimate $${admission.toFixed(6)} exceeds specified budget $${opts.budget.toFixed(2)}. Reduce --limit or approve a larger budget. No API calls made.`);
 loadDotEnv();const auth=credentials();
 fs.mkdirSync(OUTBASE,{recursive:true});const out=fs.mkdtempSync(path.join(OUTBASE,new Date().toISOString().replace(/[:.]/g,'-')+'-cmp-'));
 const results=[],report={schema:'myway_s62adiag1_comparison_v1',note:NOTE,options:{model:opts.model,variant:opts.variant,limit:opts.limit,budget_usd:opts.budget,admission_estimate_usd:admission,hard_provider_cap:false},frozen_cases_path:frozen.real,frozen_cases_sha256:frozen.hash,known_estimated_usd:0,results,complete:false};
 const write=()=>fs.writeFileSync(path.join(out,'COMPARISON_RESULTS.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 try{
  for(const job of jobs){
   // Fail closed if the preceding observed cost plus worst-case next-call estimate exceeds the approved budget.
   if(report.known_estimated_usd+job.estimate>opts.budget)throw Error('Remaining estimated budget insufficient for next call');
   const res=await callProvider(job.payload,auth);
   if(!res.usage)throw Error('Provider usage missing; stop further calls');
   const incremental=estimateCost(res.usage,opts.model);report.known_estimated_usd=+(report.known_estimated_usd+incremental).toFixed(9);
   const assessment=parseResult(res.raw,'A');
   results.push({case_id:job.case.case_id,source:job.case.source,model:opts.model,variant:opts.variant,input_sha256:crypto.createHash('sha256').update(JSON.stringify(job.case.input)).digest('hex'),original_a:job.case.original_model_a,comparison_a:assessment,cost_usd:incremental,usage:res.usage,scientific_accuracy:'UNSCORED',memory_writes:0});
   write();
   if(report.known_estimated_usd>opts.budget)throw Error('Estimated budget exceeded (not a hard billing cap), stopping immediately');
  }
  report.complete=true;write();
 }catch(e){report.failure=String(e?.message??e);write();throw Error(report.failure+'; partial results at '+out);}
 fs.writeFileSync(path.join(out,'READ_ME_FIRST.md'),`# Frozen evidence Model A comparison\n\n${NOTE}\n\nRead COMPARISON_RESULTS.json, independently compare observed_understanding, learner-specific causes, uncertainty and actions using **identical historical input**. No synthetic reviewer judgments are authoritative. No DB or learner-memory writes. Known estimated cost $${report.known_estimated_usd.toFixed(6)}; estimate is not an invoice or hard cap.\n`,{flag:'wx',mode:0o600});
 console.log('S62A-DIAG1 COMPARE REPORT '+out);console.log('SUMMARY '+JSON.stringify({complete:true,cases:results.length,known_estimated_usd:report.known_estimated_usd,database_writes:0}));
}
main().catch(e=>{console.error('S62A-DIAG1 COMPARE STOP: '+String(e?.message??e));process.exitCode=1;});
