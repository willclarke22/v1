#!/usr/bin/env node
/** S1.1: read-only terminal evaluation of MyWay's unchanged runtime topic/difficulty classifiers. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {loadRuntime} from './runtime-loader.mjs';
import {riskCategory,aggregate} from './s11-metrics.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../');
const SERVICE='http://127.0.0.1:8001/embed';
const fmt=x=>typeof x==='number'?x.toFixed(4):'n/a';
function usage(){console.log(`MyWay S1.1 evaluation (READ-ONLY; no model API calls, database reads/writes, or Git actions)
  node scripts/sandbox/learning-intelligence/s11-evaluator.mjs --mode fixture|semantic --suite challenge|core
  --mode fixture        Offline policy observations using synthetic supplied scores (free, default)
  --mode semantic       Real loopback MiniLM embeddings for approved event comparisons (no paid LLM)
  --suite challenge     53 human-authored cases across 16 subjects; not independently adjudicated (default)
  --suite core          Original S1 160 synthetic rule cases; unscored in semantic mode
  --limit N             Cases to evaluate; default all in fixture, 12 in semantic
  --case ID             Run exactly one case; IDs are case-sensitive
  --report-dir PATH     Destination below .myway-patch-backups/learning-intelligence-reports only
  --strict             Exit nonzero on high-risk findings (useful after calibration)
Model A + Model C paid-cost tracking is still in unchanged original run.mjs --mode model.
No user records, API keys, Supabase, storage mutations, or browser requests.`);}
function argsOf(argv){
 const out={mode:'fixture',suite:'challenge',limit:null,caseId:null,reportDir:null,strict:false,help:false};
 const opts=new Map([['--mode','mode'],['--suite','suite'],['--limit','limit'],['--case','caseId'],['--report-dir','reportDir']]);
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--help'){out.help=true;continue;}if(k==='--strict'){out.strict=true;continue;}
  if(!opts.has(k)||i+1>=argv.length)throw Error('Unexpected or incomplete argument '+k);
  out[opts.get(k)]=argv[++i];
 }
 if(!['fixture','semantic'].includes(out.mode))throw Error('Only fixture or semantic mode supported (no paid calls)');
 if(!['core','challenge'].includes(out.suite))throw Error('Unknown evaluation suite');
 if(out.limit!==null&&(!/^\d+$/.test(out.limit)||Number(out.limit)<1||Number(out.limit)>160))throw Error('Invalid limit 1..160');
 out.limit=out.limit===null?(out.mode==='fixture'?160:12):Number(out.limit);
 return out;
}
function safeDir(value){const anchor=path.resolve(root,'.myway-patch-backups/learning-intelligence-reports');const dir=path.resolve(value??path.join(anchor,'s11',new Date().toISOString().replace(/[:.]/g,'-')));if(dir!==anchor&&!dir.startsWith(anchor+path.sep))throw Error('Report directory must stay under '+anchor);return dir;}
function csv(x){const s=x===null||x===undefined?'':String(x);return /[",\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}
function validVector(x){return Array.isArray(x)&&x.length===384&&x.every(v=>typeof v==='number'&&Number.isFinite(v));}
function cosine(a,b){let dot=0,asq=0,bsq=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];asq+=a[i]*a[i];bsq+=b[i]*b[i];}return asq&&bsq?dot/Math.sqrt(asq*bsq):0;}
async function embed(texts){if(texts.length===0)return [];
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetch(SERVICE,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts}),signal:controller.signal});
  if(!response.ok)throw Error('Embedding service responded '+response.status);
  const body=await response.json();if(!Array.isArray(body.vectors)||body.vectors.length!==texts.length||!body.vectors.every(validVector))throw Error('Embedding API returned invalid 384D vectors');
  return body.vectors;
 }finally{clearTimeout(timer);}}
async function scoreCase(c){if(!c.approved.length)return [];
 const vectors=await embed([c.root,...c.approved.map(e=>e.root_problem)]);
 return c.approved.map((e,i)=>({eventId:e.event_id,similarity:Number(cosine(vectors[0],vectors[i+1]).toFixed(4))}));
}
function adaptCore(c){return {...c,semanticLabel:c.id.endsWith('missing_semantic_scores')?'fault_missing_scores':null,
 fault:c.id.endsWith('missing_semantic_scores')?'event_embedding_unavailable':null,
 fixtureScores:c.scores,referenceStatus:'threshold_contract_only'};}
function validateCorpus(corpus,suite){if(!Array.isArray(corpus.cases)||corpus.cases.length<1)throw Error('Empty challenge suite');
 if(suite==='challenge'&&(corpus.schema!=='myway-s11-challenge-v1'||corpus.cases.length!==53))throw Error('Unexpected challenge corpus');
 if(suite==='core'&&corpus.schema!=='myway-learning-intelligence-fixtures-v1')throw Error('Unexpected core corpus');
 const seen=new Set();for(const c of corpus.cases){if(typeof c.id!=='string'||seen.has(c.id))throw Error('Invalid duplicate case '+c.id);seen.add(c.id);
  if(typeof c.root!=='string'||c.root.length<15||!Array.isArray(c.approved)||!Array.isArray(c.fixtureScores))throw Error('Invalid case '+c.id);
  if(!c.approved.every(e=>typeof e.event_id==='string'&&typeof e.root_problem==='string'&&e.origin==='v37d2c_validated_assessment'))throw Error('Invalid approved evidence '+c.id);
 }
}
/** Routing safety proxy matching the explicit guards in the committed retrieval route.
 * Not a substitute for a live Next.js integration test: does not call the route or write DB state.
 */
export function effectiveAction(topicProposal,identity,approvedCount,validScoreCount){
 if(topicProposal.action!=='associate_existing')return topicProposal.action;
 if(approvedCount>0&&validScoreCount===0)return 'hold';
 if(identity.relation==='uncertain'||identity.relation==='possible_refinement')return 'hold';
 return 'associate_existing_manual_only';
}
async function run(){
 const flags=argsOf(process.argv.slice(2));if(flags.help){usage();return;}
 const pointer=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/current-local-release.json'),'utf8'));
 if(!['v37d2c7a3s1','v37d2c7a3s11','v37d2c7a3s12'].includes(pointer.release))throw Error('Unexpected MyWay release pointer');
 const {identity,topic}=loadRuntime(root);
 const corpus=JSON.parse(fs.readFileSync(path.join(here,flags.suite==='challenge'?'challenge.json':'core.json'),'utf8'));
 if(flags.suite==='core')corpus.cases=corpus.cases.map(adaptCore);
 validateCorpus(corpus,flags.suite);
 let cases=corpus.cases;
 if(flags.caseId){cases=cases.filter(c=>c.id===flags.caseId);if(cases.length!==1)throw Error('Unknown case '+flags.caseId);}
 cases=cases.slice(0,flags.limit);
 const rows=[],startedAt=performance.now();
 console.log(`MyWay S1.1 | mode=${flags.mode} | suite=${flags.suite} | cases=${cases.length} | paid_API_calls=0 | DB_writes=0`);
 console.log('Reference: analyst-authored hypothetical labels; no calibrated precision. Topic candidate similarities are fixture-supplied.');
 for(const c of cases){
  const started=performance.now();let scores=[],scoreOrigin='none',topicProposal=null,decision=null,error=null,eff=null;
  try{
   if(c.fault==='event_embedding_unavailable'){
    scoreOrigin='injected_service_failure';
   }else if(flags.mode==='semantic'&&c.approved.length){
    scores=await scoreCase(c);scoreOrigin='real_local_embeddings';
   }else if(flags.mode==='fixture'){
    scores=c.fixtureScores??[];scoreOrigin='synthetic_fixture_scores';
   }
   const maxScore=scores.length?Math.max(...scores.map(x=>x.similarity)):null;
   topicProposal=topic.compareTopicMemory({retrievalStatus:c.retrievalStatus,
     matches:[{topicId:c.topicId,topicLabel:c.topicLabel,similarity:c.topicSimilarity}],
     rows:[{topic_id:c.topicId,topic_label:c.topicLabel,diagnosis:'representation_gap',topic_json:{myway_learning_evidence:c.approved}}],
     topicName:c.topicLabel,rootProblem:c.root,evidenceQuote:c.message,originalMessage:c.message,currentMessage:c.message,
     rootConfidence:c.rootConfidence,confusion:5,insight:2,
     rootSemanticMatches:maxScore===null?{}:{[c.topicId]:maxScore}
   });
   decision=identity.classifyDifficulty({myway_learning_evidence:c.approved},c.root,{
     approvedEventScores:scores.map(s=>({...s,topicId:c.topicId})),
     competingTopicSimilarity:c.competingTopicSimilarity,retrievalStatus:c.retrievalStatus,
     topicSimilarity:c.topicSimilarity,topicLabelFit:c.topicLabelFit,rootConfidence:c.rootConfidence
   });
   eff=effectiveAction(topicProposal,decision,c.approved.length,scores.length);
  }catch(e){error=e instanceof Error?e.message:String(e);}
  const r={id:c.id,domain:c.domain,semanticLabel:c.semanticLabel??null,referenceStatus:c.referenceStatus,
    rootProblem:c.root,approvedRoots:c.approved.map(e=>e.root_problem),
    topicAction:topicProposal?.action??null,topicReason:topicProposal?.reasonCode??null,
    topicTarget:topicProposal?.targetTopicId??null,relation:decision?.relation??null,
    actual:decision?.relation??null,matchMethod:decision?.matchMethod??null,
    similarity:decision?.semanticSimilarity??(scores.length?Math.max(...scores.map(s=>s.similarity)):null),
    scores,scoreOrigin,effectiveAction:eff,autoWriteAllowed:false,
    rationale:decision?.rationale??null,
    risk:error?'operational_error':riskCategory(c.semanticLabel??null,decision?.relation??null,eff),
    elapsedMs:Math.round(performance.now()-started),error};
  rows.push(r);
  const tag=error?'ERR':flags.mode==='semantic'&&flags.suite==='challenge'&&['unsafe_repeat_proposal','possible_duplicate_identity','premature_repeat_hypothesis','premature_novelty_hypothesis','unsafe_fault_routing'].includes(r.risk)?'WARN':'OBS';
  console.log(`${tag.padEnd(4)} ${r.id.padEnd(27)} label=${String(r.semanticLabel??'unscored').padEnd(22)} proposed=${String(r.actual??'ERROR').padEnd(20)} score=${fmt(r.similarity)} gate=${r.effectiveAction??'n/a'} ${error??''}`);
 }
 const metrics=aggregate(rows,flags.mode,flags.suite);
 const report={schema:'myway-s11-evaluation-report-v1',mode:flags.mode,suite:flags.suite,generatedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-startedAt),
  metrics,apiCost:{paidModelCalls:0,knownEstimatedUsd:0,costLedgerPreservedInOriginalS1:true,note:'Local embedding inference uses local compute; paid model A/C tests remain in existing S1 runner.'},
  limitations:['This uses actual current MyWay TypeScript classifier and topic-policy functions, but supplies a single synthetic topic candidate, not full pgvector ranking.',
    'The effective-action check mirrors the retrieval route guard; it does not call the route itself and makes no DB queries or writes.',
    'Challenge reference labels are authored hypotheses, not independently expert-adjudicated gold.',
    'No automatic database merge or new topic creation is performed; repeated_difficulty is a provisional proposal.',
    'Fault cases deliberately suppress approved-event scores. Such cases are not semantic accuracy measurements.',
    'No Model A/C is invoked here; S1 model runner with budgeted OpenAI calls remains unchanged.'],rows};
 const dir=safeDir(flags.reportDir);if(fs.existsSync(dir))throw Error('Report directory already exists; choose a new --report-dir or use default timestamped path');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({...report,rows:undefined},null,2)+'\n');
 fs.writeFileSync(path.join(dir,'traces.json'),JSON.stringify(rows,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'cost-ledger.json'),JSON.stringify(report.apiCost,null,2)+'\n');
 const keys=['id','domain','semanticLabel','relation','effectiveAction','risk','similarity','scoreOrigin','topicAction','topicReason','elapsedMs','error'];
 fs.writeFileSync(path.join(dir,'cases.csv'),keys.join(',')+'\n'+rows.map(r=>keys.map(k=>csv(r[k])).join(',')).join('\n')+'\n');
 console.log(`\nRESULT | analyzed=${metrics.total} | scored_semantic_labels=${metrics.evaluatedSemanticCases} | errors=${metrics.operationalErrors} | unsafe_repeat_suggestions=${metrics.unsafeRepeatProposals} | possible_duplicate_suggestions=${metrics.possibleDuplicateIdentityProposals} | provisional_reviews_or_holds=${metrics.reviewOrHold}`);
 console.log(`FAULTS | injected=${metrics.faultInjectionCases} | hold_guard_pass=${metrics.faultGuardsPassed}`);
 console.log(`COST | paid model calls=0 | known USD 0.000000 (local compute excluded)`);
 console.log('REPORTS | '+dir);console.log('NOT A RELEASE GATE: no independent expert gold or complete retrieval integration.');
 if(metrics.operationalErrors||flags.strict&&metrics.highRiskFindings)process.exitCode=2;
}
run().catch(e=>{console.error('S1.1 EVALUATION REFUSED:',e instanceof Error?e.message:String(e));process.exitCode=1;});
