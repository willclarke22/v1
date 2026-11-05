#!/usr/bin/env node
/** 7A.3S1.2: read-only balanced evaluation of existing classifier vs specialist Model C. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {loadRuntime} from './runtime-loader.mjs';
import {CostLedger,parseUsage} from './ledger.mjs';
import {baselineClass,modelClass,classifyRisk,metrics} from './s12-metrics.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../');
const EMBED='http://127.0.0.1:8001/embed';
const ADJUDICATE='http://127.0.0.1:3001/api/sandbox/probe-lab/local-assessment/memory-adjudicator';
const BALANCED=['Q01-same','Q01-distinct','Q01-refinement','A02-competing','Q02-same','Q02-distinct','Q03-refinement','Q06-same','Q04-refinement','Q09-distinct','Q10-same','Q10-refinement','Q12-same','Q13-distinct','Q14-refinement','Q16-same','A10-competing'];
const PRIORITY=['Q06-same','Q10-same','Q12-same','Q15-same','Q16-same','Q03-refinement','Q04-refinement','Q05-refinement','Q06-refinement','Q09-refinement','Q10-refinement','Q12-refinement','Q13-refinement','Q14-refinement','Q15-refinement','A10-competing'];
const csv=x=>{const s=x===null||x===undefined?'':String(x);return /[,"\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
function help(){console.log(`MyWay 7A.3S1.2 (read-only, synthetic cases; no database writes)
  node scripts/sandbox/learning-intelligence/s12-evaluator.mjs --mode fixture|semantic|model --selection balanced|priority|all
  --mode fixture   synthetic scores, no network or cost. Default
  --mode semantic  real local embeddings, no paid LLM
  --mode model     real local embeddings + paid GPT-4.1 mini Model C via localhost:3001 (NO Model A/B)
  --selection      balanced (default), priority (previous flagged cases), all (53 cases)
  --limit N        default: 17 fixture / 8 semantic / 4 model; cap 53 fixture or semantic, 20 model
  --case ID        single case (overrides selection; required case must be in challenge corpus)
  --model          gpt-4.1-mini (default) or gpt-4o-mini
  --allow-spend    explicitly required for model mode
  --budget-usd N   explicitly required (0.01 to 2.00); 0.01 USD admission reserve per call
  --report-dir     custom output inside .myway-patch-backups/learning-intelligence-reports
No automatic SQL, Supabase, learner-memory update, deployment, Git mutation, or approval-token issuance.
IMPORTANT: A budget gate is NOT a hard billing limit. Failed/time-out requests might be billable.`)}
export function parseFlags(argv){
 const x={mode:'fixture',selection:'balanced',limit:null,caseId:null,reportDir:null,model:'gpt-4.1-mini',allowSpend:false,budget:null,help:false};
 const withValue=new Map([['--mode','mode'],['--selection','selection'],['--limit','limit'],['--case','caseId'],['--report-dir','reportDir'],['--model','model'],['--budget-usd','budget']]);
 for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--help'){x.help=true;continue;}if(a==='--allow-spend'){x.allowSpend=true;continue;}
  if(!withValue.has(a)||i+1>=argv.length)throw Error('Unknown or incomplete argument '+a);x[withValue.get(a)]=argv[++i];}
 if(!['fixture','semantic','model'].includes(x.mode)||!['balanced','priority','all'].includes(x.selection))throw Error('Invalid mode or selection');
 if(!['gpt-4.1-mini','gpt-4o-mini'].includes(x.model))throw Error('Model outside pinned allowed list');
 if(x.limit!==null&&!/^[1-9]\d*$/.test(x.limit))throw Error('Invalid --limit');
 x.limit=x.limit===null?(x.mode==='fixture'?17:x.mode==='semantic'?8:4):Number(x.limit);
 if(x.limit>(x.mode==='model'?20:53))throw Error('Limit exceeds safe case cap');
 if(x.mode==='model'){
  if(!x.allowSpend||x.budget===null||!/^(?:\d+)(?:\.\d{1,6})?$/.test(x.budget)||Number(x.budget)<0.01||Number(x.budget)>2)throw Error('MODEL RUN REFUSED: require --allow-spend and --budget-usd 0.01..2');
  x.budget=Number(x.budget);
 } else if(x.allowSpend||x.budget!==null)throw Error('Spending flags only valid in model mode');
 return x;
}
export function selectCases(corpus,flags){
 const ordered=flags.caseId?[flags.caseId]:flags.selection==='balanced'?BALANCED:flags.selection==='priority'?PRIORITY:corpus.cases.map(x=>x.id);
 const map=new Map(corpus.cases.map(x=>[x.id,x]));
 if(ordered.some(id=>!map.has(id)))throw Error('Unknown challenge case ID');
 if(new Set(ordered).size!==ordered.length)throw Error('Repeated selection ID');
 return ordered.map(x=>map.get(x)).slice(0,flags.limit);
}
const safeDir=value=>{const anchor=path.join(root,'.myway-patch-backups','learning-intelligence-reports');const out=path.resolve(value??path.join(anchor,'s12',new Date().toISOString().replace(/[:.]/g,'-')));
 if(out!==anchor&&!out.startsWith(anchor+path.sep))throw Error('Report directory must remain in '+anchor);return out;};
function goodVector(x){return Array.isArray(x)&&x.length===384&&x.every(n=>typeof n==='number'&&Number.isFinite(n));}
function similarity(a,b){let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):0;}
async function embed(c){if(!c.approved.length)return [];
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const r=await fetch(EMBED,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,
  body:JSON.stringify({texts:[c.root,...c.approved.map(e=>e.root_problem)]})});
  if(!r.ok)throw Error(`Local embedding HTTP ${r.status}`);
  const data=await r.json();if(!Array.isArray(data.vectors)||data.vectors.length!==1+c.approved.length||!data.vectors.every(goodVector))throw Error('Invalid 384-D embedding service response');
  return c.approved.map((e,i)=>({eventId:e.event_id,similarity:Number(similarity(data.vectors[0],data.vectors[i+1]).toFixed(4))}));
 }finally{clearTimeout(timer);}
}
export async function localAdjudicate(input,model,request=fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),41000);
 try{const r=await request(ADJUDICATE,{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','Origin':'http://127.0.0.1:3001'},
  body:JSON.stringify({format:'myway_s12_memory_adjudication_v1',input,model})});
  const body=await r.json().catch(()=>({}));
  if(!r.ok||typeof body.raw!=='string'){const err=new Error('Local adjudicator HTTP '+r.status+': '+String(body.error??'missing model output').slice(0,130));err.usage=body.usage;throw err;}
  return body;
 }finally{clearTimeout(timer);}
}
function payload(c,scores,validator){return validator.adjudicatorInput({topic_label:c.topicLabel,learner_statement:c.message,proposed_root_problem:c.root,
 historical_observations:c.approved.map(e=>({event_id:e.event_id,root_problem:e.root_problem})),
 max_similarity:scores.length?Math.max(...scores.map(e=>e.similarity)):null});}
function rowFor(c,scores,identity,validator){
 const scoreSource=scores===null?'synthetic_fixture':'local_embedding';const events=scores??c.fixtureScores;
 const id=identity.classifyDifficulty({myway_learning_evidence:c.approved},c.root,{
 approvedEventScores:events.map(s=>({...s,topicId:c.topicId})),competingTopicSimilarity:c.competingTopicSimilarity,
 retrievalStatus:c.retrievalStatus,topicSimilarity:c.topicSimilarity,topicLabelFit:c.topicLabelFit,rootConfidence:c.rootConfidence});
 const base=baselineClass(id.relation);
 return {id:c.id,domain:c.domain,label:c.semanticLabel,referenceStatus:c.referenceStatus,root:c.root,historicalRoots:c.approved.map(e=>e.root_problem),
  eventIds:c.approved.map(e=>e.event_id),scoreSource,scores:events,baselineRelation:id.relation,baselineCategory:base,
  baselineRisk:classifyRisk(c.semanticLabel,base),baselineRationale:id.rationale,topicSimilarity:c.topicSimilarity,
  modelRelation:null,modelCategory:null,modelRisk:null,modelAnchor:null,modelRationale:null,modelEvidence:null,missingEvidence:null,
  modelAttempted:false,modelError:null,modelElapsedMs:null,costEstimatedUsd:null,flags:{syntheticTopicCandidate:true,noWrite:true,unreviewedLabels:true},
  modelInput:payload(c,events,validator)};
}
async function main(){const flags=parseFlags(process.argv.slice(2));if(flags.help){help();return;}
 const pointer=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/current-local-release.json'),'utf8'));
 if(pointer.release!=='v37d2c7a3s12')throw Error('S1.2 package not installed or wrong release marker');
 const corpus=JSON.parse(fs.readFileSync(path.join(here,'challenge.json'),'utf8'));
 if(corpus.schema!=='myway-s11-challenge-v1'||corpus.cases.length!==53)throw Error('Unexpected challenge fixture source');
 const cases=selectCases(corpus,flags),{identity,adjudicator,cost}=loadRuntime(root);const ledger=new CostLedger(cost,flags.budget??0);
 const rows=[];let stopped=null;const started=performance.now();
 console.log(`MyWay S1.2 | mode=${flags.mode} | selection=${flags.selection} | cases=${cases.length} | learner_writes=0`);
 console.log('Reference labels are analyst-authored hypotheses; model never sees expected labels. Topic candidates remain fixture-supplied.');
 if(flags.mode==='model')console.log(`MODEL C OPT-IN | model=${flags.model} | USD budget=${flags.budget.toFixed(2)} | call reserve=USD 0.01 | NOT a hard billing cap`);
 for(const c of cases){let row=null;
  try{const scores=flags.mode==='fixture'?null:await embed(c);
   row=rowFor(c,scores,identity,adjudicator);
   if(!adjudicator.validAdjudicatorInput(row.modelInput))throw Error('Invalid generated adjudicator context');
   if(flags.mode==='model'){
    ledger.reserve('model_c_adjudication',flags.model);
    row.modelAttempted=true;const began=performance.now();let body=null,error=null;
    try{body=await localAdjudicate(row.modelInput,flags.model);}catch(e){error=e;}
    const call=ledger.record({caseId:c.id,stage:'model_c_adjudication',model:body?.model??flags.model,
     usage:parseUsage(body??(error?.usage?{usage:error.usage}:null)),elapsedMs:performance.now()-began,status:error?'error':'ok'});
    row.modelElapsedMs=call.elapsedMs;row.costEstimatedUsd=call.estimatedUsd;
    if(error){row.modelError=String(error.message??error).slice(0,200);stopped='Model call failure; possible unreported charges';}
    else{const parsed=adjudicator.parseAdjudicator(body.raw,row.modelInput);
     if(!parsed.decision){row.modelError=parsed.error??'Invalid adjudication output';}
     else{row.modelRelation=parsed.decision.relation;row.modelCategory=modelClass(parsed.decision.relation);row.modelRisk=classifyRisk(c.semanticLabel,row.modelCategory);
      row.modelAnchor=parsed.decision.anchor_event_id;row.modelRationale=parsed.decision.rationale;row.modelEvidence=parsed.decision.evidence_basis;row.missingEvidence=parsed.decision.missing_evidence;}
     if(!call.estimatedUsd&&call.estimatedUsd!==0)stopped='Unknown provider usage; possible unreported charges';
    }
   }
  }catch(err){const reason=err instanceof Error?err.message:String(err);
   if(reason.startsWith('MODEL BUDGET STOP'))stopped=reason;
   if(!row){row={id:c.id,domain:c.domain,label:c.semanticLabel,scoreSource:null,baselineRelation:null,baselineCategory:null,modelCategory:null,modelAttempted:false,modelError:reason};}
   else row.modelError=reason;
   if(flags.mode==='model'&&!stopped)stopped='Evaluation error; model attempts may have incurred charges';
  }
  rows.push(row);
  const score=row.scores?.length?Math.max(...row.scores.map(s=>s.similarity)).toFixed(4):'n/a';
  console.log(`${row.modelError?'ERR ':row.modelRisk?'WARN':'OBS '} ${c.id.padEnd(20)} label=${c.semanticLabel.padEnd(11)} baseline=${String(row.baselineCategory??'error').padEnd(9)} C=${String(row.modelCategory??'-').padEnd(11)} cosine=${score} ${row.modelError??''}`);
  if(stopped)break;
 }
 const result=metrics(rows),ledgerSummary=flags.mode==='model'?ledger.summary():{knownEstimatedUsd:0,attemptedCalls:0,complete:true,source:'No paid calls'};
 const report={schema:'myway-s12-model-c-benchmark-v1',mode:flags.mode,selection:flags.selection,requestedCases:cases.length,completedCases:rows.length,
  generatedAt:new Date().toISOString(),elapsedMs:Math.round(performance.now()-started),stopped,metrics:result,modelCost:ledgerSummary,
  limitations:['Human-authored labels are hypotheses and some refinement labels may themselves be disputable.',
   'Current runtime difficulty classifier is invoked unmodified; candidate topic similarity is fixture-supplied, not live pgvector retrieval.',
   'Model C receives learner statements and eligible historical event roots but NOT labels or fixture rationales.',
   'This evaluation does not replay conversation history, call Model A, write to Supabase or grant Model C persistence authority.',
   'OpenAI charges are standard-rate estimates from returned usage, not billing limits; failures can incur unknown charges.'],rows};
 const dir=safeDir(flags.reportDir);if(fs.existsSync(dir))throw Error('Report folder exists: '+dir);
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({...report,rows:undefined},null,2)+'\n');
 fs.writeFileSync(path.join(dir,'traces.json'),JSON.stringify(rows,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'cost-ledger.json'),JSON.stringify({summary:ledgerSummary,stages:ledger.rows},null,2)+'\n');
 const fields=['id','domain','label','baselineRelation','baselineCategory','modelRelation','modelCategory','baselineRisk','modelRisk','modelAnchor','modelElapsedMs','costEstimatedUsd','modelError'];
 fs.writeFileSync(path.join(dir,'cases.csv'),fields.join(',')+'\n'+rows.map(row=>fields.map(k=>csv(row[k])).join(',')).join('\n')+'\n');
 console.log(`\nRESULT | analyzed=${result.analyzed} | model_valid=${result.modelValid} | model_errors=${result.modelErrors} | baseline_potential_duplicates=${result.baselinePotentialDuplicates} | model_potential_duplicates=${result.modelPotentialDuplicates} | model_potential_false_merges=${result.modelPotentialFalseMerges}`);
 console.log(`COST | estimated_known_USD=${ledgerSummary.knownEstimatedUsd.toFixed(6)} | attempted=${ledgerSummary.attemptedCalls} | complete=${ledgerSummary.complete}`);
 console.log('REPORTS | '+dir);console.log('NO AUTOMATION GATE: unreviewed reference labels, synthetic topic candidates, no end-to-end learner reliability validation.');
 if(stopped||rows.some(row=>row.modelError))process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S1.2 REFUSED:',e instanceof Error?e.message:String(e));process.exitCode=1;});
