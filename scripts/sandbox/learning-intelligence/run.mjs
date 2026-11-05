#!/usr/bin/env node
/** 7A.3S1: offline-first, append-only LOCAL REPORT benchmark; zero MyWay database writes. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {loadRuntime} from './runtime-loader.mjs';
import {CostLedger,parseUsage} from './ledger.mjs';
import {replaySequence} from './simulation.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../');
function usage(){console.log(`MyWay Learning Intelligence S1 (read-only, 0 database writes)
  node scripts/sandbox/learning-intelligence/run.mjs [options]
  --mode fixture|semantic|model   Default fixture. semantic calls loopback /embed; model calls loopback OpenAI API routes.
  --suite core                   Synthetic, labeled 160-case corpus (only suite in S1)
  --limit N                      Default: all fixture, 12 semantic, 2 model. Maximum: 160 fixture/semantic, 10 model
  --case CASE-ID                 Filter by fixture ID (e.g. D02-borderline)
  --report-dir PATH              Optional directory UNDER project .myway-patch-backups/learning-intelligence-reports
  --allow-spend                  Required for model mode. Does NOT bypass budget.
  --budget-usd N                 Required for model mode, e.g. 0.10. Conservative USD reserve per call: 0.01
  --model gpt-4.1-mini           Only this or gpt-4o-mini for MyWay local API. Default gpt-4.1-mini
  --skip-verifier                Model mode runs assessment only; otherwise also calls Model C
  --help                         Print help
No keys read from terminal. No SQL, state-change endpoints, cloud topic reads, Git actions, or deployments.`);}
function argsOf(argv){
 const x={mode:'fixture',suite:'core',limit:null,caseId:null,reportDir:null,allowSpend:false,budget:null,model:'gpt-4.1-mini',skipVerifier:false,help:false};
 const one=new Map([['--mode','mode'],['--suite','suite'],['--limit','limit'],['--case','caseId'],['--report-dir','reportDir'],['--budget-usd','budget'],['--model','model']]);
 for(let i=0;i<argv.length;i++){
  const a=argv[i];if(a==='--help'){x.help=true;continue;}if(a==='--allow-spend'){x.allowSpend=true;continue;}
  if(a==='--skip-verifier'){x.skipVerifier=true;continue;}
  if(!one.has(a)||i+1>=argv.length)throw Error('Unknown/missing CLI argument '+a);
  x[one.get(a)]=argv[++i];
 }
 if(!['fixture','semantic','model'].includes(x.mode))throw Error('Invalid mode');
 if(x.suite!=='core')throw Error('Only core suite exists');
 if(!['gpt-4.1-mini','gpt-4o-mini'].includes(x.model))throw Error('Model must be in MyWay local assessment allowlist');
 if(x.limit!==null&&(!/^\d+$/.test(x.limit)||Number(x.limit)<1))throw Error('Positive integer --limit required');
 x.limit=x.limit===null?(x.mode==='fixture'?160:x.mode==='semantic'?12:2):Number(x.limit);
 if(x.limit>(x.mode==='model'?10:160))throw Error('Limit exceeds mode cap');
 if(x.mode==='model'){
  if(!x.allowSpend)throw Error('MODEL RUN REFUSED: --allow-spend is required');
  if(x.budget===null||!/^(?:\d+)(?:\.\d+)?$/.test(x.budget)||Number(x.budget)<0.01||Number(x.budget)>10)throw Error('MODEL RUN REFUSED: explicit --budget-usd between 0.01 and 10 required');
  x.budget=Number(x.budget);
 }else{
  if(x.allowSpend||x.budget!==null)throw Error('Spending options are only available in explicit model mode');
 }
 return x;
}
const isSafeDir=(p)=>{const home=path.resolve(root,'.myway-patch-backups/learning-intelligence-reports');const dest=path.resolve(p);if(dest!==home&&!dest.startsWith(home+path.sep))throw Error('Report directory must remain within '+home);return dest;};
const fmt=x=>x===null||x===undefined?'n/a':typeof x==='number'?x.toFixed(4):String(x);
const csv=x=>{const s=x===undefined||x===null?'':String(x);return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
function vectorsValid(v){return Array.isArray(v)&&v.length===384&&v.every(x=>typeof x==='number'&&Number.isFinite(x));}
function cosine(a,b){let dot=0,ma=0,mb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];ma+=a[i]*a[i];mb+=b[i]*b[i];}return ma&&mb?dot/Math.sqrt(ma*mb):0;}
const ENDPOINT='http://127.0.0.1:8001/embed';
async function embed(texts){if(!texts.length)return [];
 const controller=new AbortController();const t=setTimeout(()=>controller.abort(),25000);
 try{const r=await fetch(ENDPOINT,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts}),signal:controller.signal});
  if(!r.ok)throw Error('Local embedding service HTTP '+r.status);
  const obj=await r.json();if(!Array.isArray(obj.vectors)||obj.vectors.length!==texts.length||!obj.vectors.every(vectorsValid))throw Error('Local embedding service must return one 384-D finite vector per text');
  return obj.vectors;
 }finally{clearTimeout(t);}}
async function embedCase(rootProblem,approved){const texts=[rootProblem,...approved.map(e=>e.root_problem)];const vec=await embed(texts);return approved.map((e,i)=>({eventId:e.event_id,similarity:Number(cosine(vec[0],vec[i+1]).toFixed(4))}));}
const LOCAL_API='http://127.0.0.1:3001';
async function localModelCall(route,payload){const controller=new AbortController();const t=setTimeout(()=>controller.abort(),42000);
 try{const r=await fetch(LOCAL_API+route,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Origin':LOCAL_API},body:JSON.stringify(payload),signal:controller.signal});
  const body=await r.json().catch(()=>({}));if(!r.ok||typeof body.raw!=='string')throw Error('Local model endpoint error '+r.status+': '+String(body.error??'invalid response').slice(0,180));return body;
 }finally{clearTimeout(t);}}
function context(c,scores){return {approvedEventScores:scores.map(x=>({topicId:c.topicId,...x})),competingTopicSimilarity:c.competingTopicSimilarity,
 retrievalStatus:c.retrievalStatus,topicSimilarity:c.topicSimilarity,topicLabelFit:c.topicLabelFit,rootConfidence:c.rootConfidence};}
function grade(actual,expected){return actual===expected;}
function summary(results){const graded=results.filter(r=>r.actual!==null),correct=graded.filter(r=>r.actual===r.expected);
 const topicTotal=graded.filter(r=>r.topicCorrect!==null).length,topicCorrectCount=graded.filter(r=>r.topicCorrect===true).length;
 const byExpected={};for(const r of graded){const x=byExpected[r.expected]??={total:0,correct:0,wrong:0};x.total++;if(r.actual===r.expected)x.correct++;else x.wrong++;}
 return {cases:results.length,completed:graded.length,correct:correct.length,incorrect:graded.length-correct.length,errors:results.length-graded.length,
 rawAgreement:graded.length?Number((correct.length/graded.length).toFixed(4)):null,topicAssociationProxy:{evaluated:topicTotal,correct:topicCorrectCount,warning:'Single fixture topic supplied; not real multi-candidate pgvector routing.'},byExpected,
 warning:'Fixture expected labels and scores are hypothetical; this is not validated user-facing precision or recall.'};}
function reportFiles(dir,payload){fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({...payload,rows:undefined,ledgerRows:undefined},null,2)+'\n');
 fs.writeFileSync(path.join(dir,'traces.json'),JSON.stringify(payload.rows,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'cost-ledger.json'),JSON.stringify({summary:payload.cost,stages:payload.ledgerRows},null,2)+'\n');
 const fields=['id','domain','expected','actual','correct','topicAction','topicReason','topicTarget','topicCorrect','matchMethod','approvedSimilarity','modelCRelation','modelCAgreement','elapsedMs','error'];
 fs.writeFileSync(path.join(dir,'cases.csv'),fields.join(',')+'\n'+payload.rows.map(r=>fields.map(k=>csv(r[k])).join(',')).join('\n')+'\n');
}
async function main(){
 const flags=argsOf(process.argv.slice(2));if(flags.help){usage();return;}
 if(!fs.existsSync(path.join(root,'scripts/sandbox/current-local-release.json')))throw Error('Run from installed MyWay experiment worktree');
 const pointer=JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/current-local-release.json'),'utf8'));
 if(!['v37d2c7a3r2','v37d2c7a3s1','v37d2c7a3s11','v37d2c7a3s12'].includes(pointer.release))throw Error('Unsupported baseline release');
 const {identity,topic,assessment,verifier,cost}=loadRuntime(root);
 const corpus=JSON.parse(fs.readFileSync(path.join(here,'core.json'),'utf8'));
 if(corpus.schema!=='myway-learning-intelligence-fixtures-v1')throw Error('Unexpected suite schema');
 let cases=corpus.cases;
 if(flags.caseId){cases=cases.filter(c=>c.id===flags.caseId);if(!cases.length)throw Error('Unknown case ID '+flags.caseId);}
 cases=cases.slice(0,flags.limit);
 const reportDir=isSafeDir(flags.reportDir??path.join(root,'.myway-patch-backups/learning-intelligence-reports'));
 const ledger=new CostLedger(cost,flags.budget??0);
 const records=[];const begun=performance.now();let stopped=null;
 console.log(`MyWay S1 | mode=${flags.mode} | cases=${cases.length} | database_writes=0 | runtime classifier=unchanged`);
 if(flags.mode==='model')console.log(`MODEL OPT-IN | ${flags.model} | budget US$${flags.budget.toFixed(3)} | local Next server only | no hard server-side billing ceiling`);
 for(let c of cases){
  let actual=null,topicAction=null,topicReason=null,topicTarget=null,topicCorrect=null,modelCRelation=null,modelCAgreement=null,approvedSimilarity=null,matchMethod=null,error=null,rootProblem=c.root,scores=c.scores,assessedTopic=c.topicLabel,evidenceQuote=c.message;
  const started=performance.now();
  try{
   if(flags.mode==='model'){
    ledger.reserve('assessment',flags.model);
    const st=performance.now();let body=null;let err=null;
    try{body=await localModelCall('/api/sandbox/probe-lab/local-assessment/openai',{
      userPrompt:assessment.buildUserPrompt(c.message,null),systemPrompt:assessment.ASSESSMENT_SYSTEM_PROMPT,responseSchema:assessment.ASSESSMENT_SCHEMA,model:flags.model});}
    catch(e){err=e;}
    ledger.record({caseId:c.id,stage:'assessment',model:body?.model??flags.model,usage:parseUsage(body),elapsedMs:performance.now()-st,status:err?'error':'ok'});
    if(err)throw err;
    const validated=assessment.validateAssessment(body.raw,c.message);
    if(!validated.assessment||validated.error)throw Error('Assessment validation: '+String(validated.error));
    rootProblem=validated.assessment.root_problem;assessedTopic=validated.assessment.topic_name;evidenceQuote=validated.assessment.evidence_quote;
    if(!rootProblem||validated.assessment.next_action==='clarify')throw Error('Model A returned clarification; standalone one-turn fixture cannot resolve this (not a routing error).');
    // Confidence comes from model A in this mode; fixture still supplies topic context as a controlled comparison input.
    c={...c,rootConfidence:validated.assessment.root_problem_confidence};
   }
   if(flags.mode!=='fixture')scores=await embedCase(rootProblem,c.approved);
   // Reuse the existing deterministic topic-routing function with a synthetic subject row.
   // This is not production pgvector: the topic candidate similarity remains a fixture input.
   const topicResult=topic.compareTopicMemory({retrievalStatus:c.retrievalStatus,
      matches:[{topicId:c.topicId,topicLabel:c.topicLabel,similarity:c.topicSimilarity}],
      rows:[{topic_id:c.topicId,topic_label:c.topicLabel,diagnosis:'representation_gap',
        topic_json:{myway_learning_evidence:c.approved}}],
      topicName:assessedTopic,rootProblem,evidenceQuote,originalMessage:c.message,currentMessage:c.message,
      rootConfidence:c.rootConfidence,confusion:5,insight:2,
      rootSemanticMatches:scores.length?{[c.topicId]:Math.max(...scores.map(s=>s.similarity))}:{}
   });
   topicAction=topicResult.action;topicReason=topicResult.reasonCode;topicTarget=topicResult.targetTopicId;
   topicCorrect=topicAction==='associate_existing'&&topicTarget===c.topicId;
   const decision=identity.classifyDifficulty({myway_learning_evidence:c.approved},rootProblem,context(c,scores));
   actual=decision.relation;matchMethod=decision.matchMethod??null;
   approvedSimilarity=typeof decision.semanticSimilarity==='number'?decision.semanticSimilarity:(scores[0]?.similarity??null);
   if(flags.mode==='model'&&!flags.skipVerifier){
    ledger.reserve('verifier',flags.model);
    const vInput=verifier.verifierInput({topicName:c.topicLabel,rootProblem,originalStatement:c.message,clarification:'',candidates:[{
      topicId:c.topicId,topicLabel:c.topicLabel,topicSimilarity:c.topicSimilarity,
      difficultySimilarity:scores.length?Math.max(...scores.map(x=>x.similarity)):null,storedRootProblems:c.approved.map(e=>e.root_problem).slice(0,3)
    }]});
    const st=performance.now();let body=null,err=null;
    try{body=await localModelCall('/api/sandbox/probe-lab/local-assessment/teaching',{
      format:verifier.VERIFIER_FORMAT,context:vInput,model:flags.model});}
    catch(e){err=e;}
    ledger.record({caseId:c.id,stage:'verifier',model:body?.model??flags.model,usage:parseUsage(body),elapsedMs:performance.now()-st,status:err?'error':'ok'});
    if(err)throw err;
    const v=verifier.parseVerifier(body.raw,vInput);if(!v.decision)throw Error('Verifier validation: '+v.error);
    modelCRelation=v.decision.relation;
    const shouldSame=actual==='repeated_difficulty'||actual==='review_candidate';
    modelCAgreement=shouldSame?modelCRelation==='same_topic_same_difficulty':
       actual==='new_difficulty'?modelCRelation==='same_topic_new_difficulty':null;
   }
  }catch(e){error=e instanceof Error?e.message:String(e);if(error.startsWith('MODEL BUDGET STOP'))stopped=error;}
  const row={id:c.id,domain:c.domain,expected:c.expected,actual,correct:actual===null?null:grade(actual,c.expected),topicAction,topicReason,topicTarget,topicCorrect,matchMethod,
    approvedSimilarity,modelCRelation,modelCAgreement,elapsedMs:Math.round(performance.now()-started),error};
  records.push(row);
  console.log(`${row.correct===true?'OK ':row.correct===false?'DIFF':'ERR'} ${row.id.padEnd(18)} expected=${row.expected.padEnd(20)} actual=${String(row.actual??'n/a').padEnd(20)} score=${fmt(row.approvedSimilarity)} topic=${row.topicAction??'n/a'} ${row.error??''}`);
  if(stopped)break;
 }
 const metrics=summary(records);
 const costSummary=flags.mode==='model'?ledger.summary():{knownEstimatedUsd:0,attemptedCalls:0,complete:true,budgetUsd:null,source:'no paid LLM requests in fixture/semantic mode'};
 const payload={schema:'myway-intelligence-benchmark-report-v1',mode:flags.mode,suite:flags.suite,runCompletedAt:new Date().toISOString(),
  elapsedMs:Math.round(performance.now()-begun),stopped,metrics,cost:costSummary,
  limitations:['Fixture labels and candidate scores are hypothetical, not a calibrated accuracy dataset.',
  'Semantic mode uses local event-to-event embeddings with fixture topic routing context, NOT production pgvector topic search.',
  'Model mode tests real MyWay Model A and Model C endpoints against synthetic cases; no teaching call, no live topic memory, no database writes.',
  'USD is a standard-rate estimate from provider usage, not an invoice; API errors may incur unreported costs.'],
  rows:records,ledgerRows:ledger.rows};
 reportFiles(reportDir,payload);
 console.log(`\nRESULT | completed=${metrics.completed}/${records.length} | correct=${metrics.correct} | differing=${metrics.incorrect} | errors=${metrics.errors} | agreement=${fmt(metrics.rawAgreement)}`);
 console.log(`COST | known US$${costSummary.knownEstimatedUsd.toFixed(6)} | attempted=${costSummary.attemptedCalls} | complete=${costSummary.complete}${costSummary.complete?'':' (unknown billing possible)'}`);
 console.log('REPORTS | '+reportDir+'\\{summary.json,traces.json,cases.csv,cost-ledger.json}');
 console.log('NOT A DEPLOYMENT GATE: no measured end-to-end reliability target established yet.');
 if(stopped)process.exitCode=2;
}
main().catch(err=>{console.error('S1 TEST REFUSED:',err instanceof Error?err.message:String(err));process.exitCode=1;});
