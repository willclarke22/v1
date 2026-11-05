#!/usr/bin/env node
/** S1.3 two-stage, read-only Model C shadow experiment. No DB or memory writes. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import {loadRuntime} from './runtime-loader.mjs';
import {CostLedger,parseUsage} from './ledger.mjs';
import {baselineClass,modelClass} from './s12-metrics.mjs';
import {localAdjudicate as localS12Adjudicate} from './s12-evaluator.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../');
const S13_ENDPOINT='http://127.0.0.1:3001/api/sandbox/probe-lab/local-assessment/memory-adjudicator-s13';
const EMBED='http://127.0.0.1:8001/embed';
export const BALANCED=['Q01-same','Q01-distinct','Q01-refinement','A02-competing','Q02-same','Q02-distinct','Q03-refinement','Q06-same','Q04-refinement','Q09-distinct','Q10-same','Q10-refinement','Q12-same','Q13-distinct','Q14-refinement','Q16-same','A10-competing','U01-ambiguous','U02-ambiguous','U03-ambiguous','U04-ambiguous','U05-same','U06-distinct'];
export const PRIORITY=['Q06-same','Q10-same','Q12-same','Q15-same','Q16-same','Q03-refinement','Q04-refinement','Q05-refinement','Q06-refinement','Q09-refinement','Q10-refinement','Q12-refinement','Q13-refinement','Q14-refinement','Q15-refinement','U01-ambiguous','U02-ambiguous','U03-ambiguous','U04-ambiguous','A10-competing'];
const csv=x=>{const s=x===null||x===undefined?'':String(x);return /[,"\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
function help(){console.log(`MyWay S1.3: read-only identity/interpretation benchmark
  --mode fixture|semantic|model             default fixture
  --selection balanced|priority|ambiguity|all default balanced
  --limit N                                default 23 fixture / 8 semantic / 2 model; model max 10
  --case ID                                explicit single challenge case
  --model gpt-4.1-mini|gpt-4o-mini        default gpt-4.1-mini
  --compare-s12-live                       OPTIONAL: second PAID S1.2 model call on each same case
  --allow-spend --budget-usd N             mandatory for --mode model; 0.01..2.00 USD
  --report-dir DIRECTORY                   inside .myway-patch-backups/learning-intelligence-reports
  0.01 USD reserve per admitted call, NOT a hard billing cap. No install-time paid calls.
  The model never receives reference labels, gold rationales, or expected decisions.
  A10 remains contested and is excluded from scored metrics.`)}
export function parseFlags(args){
 const f={mode:'fixture',selection:'balanced',limit:null,caseId:null,model:'gpt-4.1-mini',compareS12Live:false,allowSpend:false,budget:null,reportDir:null,help:false};
 const fields={'--mode':'mode','--selection':'selection','--limit':'limit','--case':'caseId','--model':'model','--budget-usd':'budget','--report-dir':'reportDir'};
 for(let i=0;i<args.length;i++){
  const k=args[i];if(k==='--help'){f.help=true;continue;}
  if(k==='--compare-s12-live'){f.compareS12Live=true;continue;}
  if(k==='--allow-spend'){f.allowSpend=true;continue;}
  if(!Object.hasOwn(fields,k)||i===args.length-1)throw Error('Unknown or incomplete argument '+k);
  f[fields[k]]=args[++i];
 }
 if(!['fixture','semantic','model'].includes(f.mode)||!['balanced','priority','ambiguity','all'].includes(f.selection))throw Error('Unknown mode or selection');
 if(!['gpt-4.1-mini','gpt-4o-mini'].includes(f.model))throw Error('Unsupported model');
 if(f.limit!==null&&!/^[1-9]\d*$/.test(String(f.limit)))throw Error('Invalid --limit');
 f.limit=f.limit===null?(f.mode==='fixture'?23:f.mode==='semantic'?8:2):Number(f.limit);
 if(f.limit>(f.mode==='model'?10:59))throw Error('Case limit exceeds safety cap');
 if(f.mode==='model'){
  if(!f.allowSpend||f.budget===null||!/^(?:\d+)(?:\.\d{1,6})?$/.test(f.budget)||Number(f.budget)<0.01||Number(f.budget)>2)throw Error('MODEL RUN REFUSED: --allow-spend and --budget-usd 0.01..2 required');
  f.budget=Number(f.budget);
 }else if(f.allowSpend||f.budget!==null||f.compareS12Live)throw Error('Paid flags permitted only with --mode model');
 return f;
}
export function loadCases(){
 const old=JSON.parse(fs.readFileSync(path.join(here,'challenge.json'),'utf8'));
 const extra=JSON.parse(fs.readFileSync(path.join(here,'s13-extra-cases.json'),'utf8'));
 if(old.schema!=='myway-s11-challenge-v1'||old.cases?.length!==53||extra.schema!=='myway-s13-extra-cases-v1'||extra.cases?.length!==6)throw Error('Unexpected benchmark sources');
 const all=[...old.cases.map(c=>c.id==='A10-competing'?{...c,referenceStatus:'contested_original_label_excluded_from_scoring'}:c),...extra.cases];
 if(new Set(all.map(c=>c.id)).size!==59)throw Error('Duplicate challenge cases');
 return all;
}
export function selectCases(cases,f){
 const order=f.caseId?[f.caseId]:f.selection==='balanced'?BALANCED:f.selection==='priority'?PRIORITY:f.selection==='ambiguity'?['U01-ambiguous','U02-ambiguous','U03-ambiguous','U04-ambiguous','U05-same','U06-distinct','A10-competing']:cases.map(c=>c.id);
 const map=new Map(cases.map(c=>[c.id,c]));
 if(order.some(id=>!map.has(id)))throw Error('Unknown case ID');
 return order.map(id=>map.get(id)).slice(0,f.limit);
}
export function loadS13(rootDir=root){
 const require=createRequire(import.meta.url);
 const ts=require(path.join(rootDir,'node_modules/typescript/lib/typescript.js'));
 const rel='sandbox/probe-lab/learning-space/memory-adjudication-s13.ts';
 const source=fs.readFileSync(path.join(rootDir,rel),'utf8');
 const result=ts.transpileModule(source,{fileName:rel,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 if((result.diagnostics??[]).some(x=>x.category===ts.DiagnosticCategory.Error))throw Error('S1.3 contract TypeScript invalid');
 const m={exports:{}};new Function('exports','module',result.outputText)(m.exports,m);return m.exports;
}
const goodVector=x=>Array.isArray(x)&&x.length===384&&x.every(n=>typeof n==='number'&&Number.isFinite(n));
const cosine=(a,b)=>{let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):0;};
export async function embedScores(c,request=fetch){
 if(!c.approved.length)return [];
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await request(EMBED,{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:[c.root,...c.approved.map(e=>e.root_problem)]})});
  if(!response.ok)throw Error('Local embedding HTTP '+response.status);
  const body=await response.json();
  if(!Array.isArray(body.vectors)||body.vectors.length!==c.approved.length+1||!body.vectors.every(goodVector))throw Error('Invalid 384-D local embedding vectors');
  return c.approved.map((e,i)=>({eventId:e.event_id,similarity:Number(cosine(body.vectors[0],body.vectors[i+1]).toFixed(4))}));
 }finally{clearTimeout(timer);}
}
export async function localS13Adjudicate(input,model,request=fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),41000);
 try{
  const r=await request(S13_ENDPOINT,{method:'POST',cache:'no-store',signal:controller.signal,headers:{Origin:'http://127.0.0.1:3001','Content-Type':'application/json'},body:JSON.stringify({format:'myway_s13_two_stage_memory_v1',input,model})});
  const body=await r.json().catch(()=>({}));
  if(!r.ok||typeof body.raw!=='string'){
   const e=new Error('S1.3 HTTP '+r.status+': '+String(body.error??'missing response').slice(0,140));e.usage=body.usage;throw e;
  }
  return body;
 }finally{clearTimeout(timer);}
}
export function relationToIdentity(className){return className==='same'||className==='refinement'?'same':className==='distinct'?'distinct':className==='defer'||className==='uncertain'?'uncertain':null;}
export function expectedIdentity(label){return label==='same'||label==='refinement'?'same':label==='distinct'?'distinct':label==='ambiguous'?'uncertain':null;}
export function expectedInterpretation(label){return label==='same'?'retain':label==='refinement'?'refine':label==='distinct'||label==='ambiguous'?'not_applicable':null;}
export function risk(expected,pred){const e=expectedIdentity(expected);if(!e||!pred)return null;
 return e==='distinct'&&pred==='same'?'potential_false_merge':e==='same'&&pred==='distinct'?'potential_duplicate_identity':e==='uncertain'&&pred!=='uncertain'?'missed_abstention':null;}
export function metrics(rows){
 const scored=rows.filter(r=>r.scorable),count=(predicate)=>scored.filter(predicate).length;
 const confusion={baseline:{},s12:{},s13:{}};
 for(const r of scored){const e=r.expectedIdentity;
  for(const [name,result] of [['baseline',r.baselineIdentity],['s12',r.s12Identity],['s13',r.s13Identity]]){
   if(!result)continue;const matrix=confusion[name];matrix[e]??={};matrix[e][result]=(matrix[e][result]??0)+1;
  }
 }
 const result={cases:rows.length,scored:scored.length,contested:rows.length-scored.length,
  semanticCases:rows.filter(r=>r.scoreSource==='local_embedding').length,
  s13Valid:rows.filter(r=>r.s13Identity).length,s12Valid:rows.filter(r=>r.s12Identity).length,
  baselineIdentityExact:count(r=>r.baselineIdentity===r.expectedIdentity),
  s12IdentityExact:count(r=>r.s12Identity===r.expectedIdentity),
  s13IdentityExact:count(r=>r.s13Identity===r.expectedIdentity),
  baselineScored:count(r=>Boolean(r.baselineIdentity)),s12Scored:count(r=>Boolean(r.s12Identity)),s13Scored:count(r=>Boolean(r.s13Identity)),
  s13InterpretationExact:count(r=>r.s13Interpretation===r.expectedInterpretation),
  s13InterpretationScored:count(r=>Boolean(r.s13Interpretation)),
  baselinePotentialFalseMerges:count(r=>risk(r.label,r.baselineIdentity)==='potential_false_merge'),
  s12PotentialFalseMerges:count(r=>risk(r.label,r.s12Identity)==='potential_false_merge'),
  s13PotentialFalseMerges:count(r=>risk(r.label,r.s13Identity)==='potential_false_merge'),
  baselinePotentialDuplicates:count(r=>risk(r.label,r.baselineIdentity)==='potential_duplicate_identity'),
  s12PotentialDuplicates:count(r=>risk(r.label,r.s12Identity)==='potential_duplicate_identity'),
  s13PotentialDuplicates:count(r=>risk(r.label,r.s13Identity)==='potential_duplicate_identity'),
  s13IdentityAbstentions:rows.filter(r=>r.s13Identity==='uncertain').length,
  s13InterpretationRefinements:rows.filter(r=>r.s13Interpretation==='refine').length,
  confusion,limitations:'Author-authored hypotheses, not expert ground truth; A10 contested and excluded; no end-to-end retrieval or memory writes.'};
 return result;
}
export function makeRow(c,scores,runtime,s13){
 const input=s13.s13Input({topic_label:c.topicLabel,learner_statement:c.message,proposed_root_problem:c.root,
  historical_observations:c.approved.map(e=>({event_id:e.event_id,root_problem:e.root_problem})),
  max_similarity:(scores??c.fixtureScores).length?Math.max(...(scores??c.fixtureScores).map(s=>s.similarity)):null});
 if(!s13.validS13Input(input))throw Error('S1.3 generated input invalid');
 const events=scores??c.fixtureScores;
 const identity=runtime.identity.classifyDifficulty({myway_learning_evidence:c.approved},c.root,{
  approvedEventScores:events.map(s=>({...s,topicId:c.topicId})),competingTopicSimilarity:c.competingTopicSimilarity,
  retrievalStatus:c.retrievalStatus,topicSimilarity:c.topicSimilarity,topicLabelFit:c.topicLabelFit,rootConfidence:c.rootConfidence});
 const baselineCategory=baselineClass(identity.relation);
 const scorable=c.referenceStatus!=='contested_original_label_excluded_from_scoring';
 return {id:c.id,domain:c.domain,label:c.semanticLabel,referenceStatus:c.referenceStatus,scorable,
  root:c.root,historicalRoots:c.approved.map(e=>e.root_problem),eventIds:c.approved.map(e=>e.event_id),
  scores:events,scoreSource:scores===null?'synthetic_fixture':'local_embedding',
  expectedIdentity:expectedIdentity(c.semanticLabel),expectedInterpretation:expectedInterpretation(c.semanticLabel),
  baselineRelation:identity.relation,baselineCategory,baselineIdentity:relationToIdentity(baselineCategory),baselineRationale:identity.rationale,
  s12Relation:null,s12Category:null,s12Identity:null,s12Rationale:null,s12Error:null,s12Anchor:null,s12Cost:null,s12ElapsedMs:null,
  s13Identity:null,s13Interpretation:null,s13Anchor:null,s13IdentityRationale:null,s13InterpretationRationale:null,s13Evidence:null,s13Missing:null,s13ProposedHypothesis:null,
  s13Error:null,s13Cost:null,s13ElapsedMs:null,s13Attempted:false,s12Attempted:false,
  input,flags:{readOnly:true,syntheticCandidate:true,modelBlindToLabels:true,contestedExcluded:!scorable}};
}
function safeDir(value){
 const anchor=path.join(root,'.myway-patch-backups','learning-intelligence-reports');
 const dir=path.resolve(value??path.join(anchor,'s13',new Date().toISOString().replace(/[:.]/g,'-')));
 if(!dir.startsWith(anchor+path.sep))throw Error('Report path must be inside '+anchor);
 return dir;
}
export async function evaluate(flags,{requestS13=localS13Adjudicate,requestS12=localS12Adjudicate,embed=embedScores}={}){
 const release=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/current-local-release.json'),'utf8'));
 if(release.release!=='v37d2c7a3s12'||!fs.existsSync(path.join(root,'scripts/sandbox/v37d2c7a3s13/installation.json')))throw Error('S1.3 overlay or S1.2 release is missing');
 const cases=selectCases(loadCases(),flags),runtime=loadRuntime(root),s13=loadS13(root),ledger=new CostLedger(runtime.cost,flags.budget??0);
 const rows=[],began=performance.now();let stopped=null;
 console.log(`MyWay S1.3 | mode=${flags.mode} | selection=${flags.selection} | cases=${cases.length} | learner_writes=0`);
 console.log('Two stages: identity same/distinct/uncertain; interpretation retain/refine/insufficient/not_applicable. Labels are NOT sent to either model.');
 console.log('A10 remains CONTESTED and is excluded from accuracy-style summaries. All reference labels are provisional hypotheses.');
 if(flags.mode==='model')console.log(`MODEL C OPT-IN | ${flags.model} | USD admission budget=${flags.budget.toFixed(2)} | paired_S12=${flags.compareS12Live} | NOT a hard billing cap`);
 for(const c of cases){let r=null;
  try{
   const scores=flags.mode==='fixture'?null:await embed(c);
   r=makeRow(c,scores,runtime,s13);
   if(flags.mode==='model'){
    // Mandatory no-spend preparation before making a paid call. No labels leak.
    ledger.reserve('model_c_s13_two_stage',flags.model);r.s13Attempted=true;
    let response=null,error=null;const t=performance.now();
    try{response=await requestS13(r.input,flags.model);}catch(e){error=e;}
    const cost=ledger.record({caseId:c.id,stage:'model_c_s13_two_stage',model:response?.model??flags.model,
     usage:parseUsage(response??(error?.usage?{usage:error.usage}:null)),elapsedMs:performance.now()-t,status:error?'error':'ok'});
    r.s13ElapsedMs=cost.elapsedMs;r.s13Cost=cost.estimatedUsd;
    if(error){r.s13Error=String(error.message??error).slice(0,240);stopped='S1.3 model call failure; costs may be unknown';}
    else{
     const parsed=s13.parseS13(response.raw,r.input);
     if(!parsed.decision){r.s13Error=parsed.error;stopped='Invalid S1.3 response; no further spending';}
     else{const d=parsed.decision;
      Object.assign(r,{s13Identity:d.identity,s13Interpretation:d.interpretation,s13Anchor:d.anchor_event_id,s13IdentityRationale:d.identity_rationale,
       s13InterpretationRationale:d.interpretation_rationale,s13Evidence:d.evidence_basis,s13Missing:d.missing_evidence,s13ProposedHypothesis:d.proposed_hypothesis});}
     if(cost.estimatedUsd===null)stopped='Unknown S1.3 provider usage';
    }
    if(!stopped&&flags.compareS12Live){
     ledger.reserve('model_c_s12_comparator',flags.model);r.s12Attempted=true;
     const s12input=runtime.adjudicator.adjudicatorInput(r.input);
     if(!runtime.adjudicator.validAdjudicatorInput(s12input))throw Error('S1.2 comparator input invalid');
     let old=null,oldError=null;const priorT=performance.now();
     try{old=await requestS12(s12input,flags.model);}catch(e){oldError=e;}
     const oldCost=ledger.record({caseId:c.id,stage:'model_c_s12_comparator',model:old?.model??flags.model,
      usage:parseUsage(old??(oldError?.usage?{usage:oldError.usage}:null)),elapsedMs:performance.now()-priorT,status:oldError?'error':'ok'});
     r.s12Cost=oldCost.estimatedUsd;r.s12ElapsedMs=oldCost.elapsedMs;
     if(oldError){r.s12Error=String(oldError.message??oldError).slice(0,240);stopped='S1.2 comparator request failed';}
     else{const parsed=runtime.adjudicator.parseAdjudicator(old.raw,s12input);
      if(!parsed.decision){r.s12Error=parsed.error;stopped='Invalid S1.2 response';}
      else{const d=parsed.decision;r.s12Relation=d.relation;r.s12Category=modelClass(d.relation);r.s12Identity=relationToIdentity(r.s12Category);
       r.s12Anchor=d.anchor_event_id;r.s12Rationale=d.rationale;}}
     if(oldCost.estimatedUsd===null)stopped='Unknown S1.2 comparator usage';
    }
   }
  }catch(e){const message=e instanceof Error?e.message:String(e);
   if(message.startsWith('MODEL BUDGET STOP'))stopped=message;
   else if(flags.mode==='model')stopped='Evaluator error; possible billable attempt';
   if(!r)r={id:c.id,domain:c.domain,label:c.semanticLabel,scorable:c.id!=='A10-competing',baselineIdentity:null,s13Identity:null,s12Identity:null,s13Error:message};
   else r.s13Error??=message;
  }
  rows.push(r);
  const score=r.scores?.length?Math.max(...r.scores.map(x=>x.similarity)).toFixed(4):'n/a';
  const riskLabel=r.scorable?risk(r.label,r.s13Identity):null;
  console.log(`${r.s13Error?'ERR ':riskLabel?'WARN':'OBS '} ${c.id.padEnd(21)} ref=${r.scorable?c.semanticLabel.padEnd(10):'contested '} base=${String(r.baselineIdentity??'-').padEnd(9)} C12=${String(r.s12Identity??'-').padEnd(9)} C13=${String(r.s13Identity??'-').padEnd(9)} interpretation=${String(r.s13Interpretation??'-').padEnd(20)} cosine=${score}${r.s13Error?' '+r.s13Error:''}`);
  if(stopped)break;
 }
 const measure=metrics(rows),cost=flags.mode==='model'?ledger.summary():{knownEstimatedUsd:0,attemptedCalls:0,complete:true};
 const report={schema:'myway-s13-shadow-benchmark-v1',createdAt:new Date().toISOString(),mode:flags.mode,selection:flags.selection,
  compareS12Live:flags.compareS12Live,requestedCases:cases.length,completedCases:rows.length,elapsedMs:Math.round(performance.now()-began),stopped,
  metrics:measure,modelCost:cost,limitations:['No expert-adjudicated gold labels; metrics are diagnostic only.','A10 classification is contested and excluded from scoring.','S1.2 comparator is called only with --compare-s12-live; otherwise no C12 result is produced.',
   'Live topic candidates are not retrieved; case topics and approved events are synthetic; no complete learner history, no Model A or B.',
   'No memory write, Supabase query, or automatic decision authority.','Spending estimates are not provider billing caps; unknown-cost failures may still be billed.']};
 const dir=safeDir(flags.reportDir);
 if(fs.existsSync(dir))throw Error('Report destination exists; refusing overwrite: '+dir);
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'traces.json'),JSON.stringify(rows,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'cost-ledger.json'),JSON.stringify({summary:cost,stages:ledger.rows},null,2)+'\n');
 const fields=['id','domain','label','scorable','baselineRelation','baselineIdentity','s12Relation','s12Identity','s13Identity','s13Interpretation','s13Anchor','s13ProposedHypothesis','s13Cost','s12Cost','s13Error','s12Error'];
 fs.writeFileSync(path.join(dir,'cases.csv'),fields.join(',')+'\n'+rows.map(r=>fields.map(f=>csv(r[f])).join(',')).join('\n')+'\n');
 console.log(`\nRESULT | analyzed=${measure.cases} | scored=${measure.scored} | contested=${measure.contested} | C13_valid=${measure.s13Valid} | C12_valid=${measure.s12Valid} | C13_identity_matches=${measure.s13IdentityExact}/${measure.s13Scored} | C13_interpretation_matches=${measure.s13InterpretationExact}/${measure.s13InterpretationScored}`);
 console.log(`COST | known_estimated_USD=${cost.knownEstimatedUsd.toFixed(6)} | attempted=${cost.attemptedCalls} | complete=${cost.complete}`);
 console.log('REPORTS | '+dir);
 console.log('NOT A DEPLOYMENT GATE: provisional labels, synthetic topic candidates, no validated end-to-end learner reliability.');
 if(stopped||rows.some(x=>x.s13Error||x.s12Error))process.exitCode=2;
 return {rows,report,dir};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const flags=parseFlags(process.argv.slice(2));if(flags.help)help();else await evaluate(flags);}catch(e){console.error('S1.3 REFUSED:',e instanceof Error?e.message:String(e));process.exitCode=1;}
}
