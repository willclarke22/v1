#!/usr/bin/env node
/** S1.4 guarded end-to-end shadow REPLAY: learner -> Model A -> retrieval -> Model C.
 * No database writes, no approval headers, no production decision changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {loadRuntime} from './runtime-loader.mjs';
import {loadS13,loadCases} from './s13-evaluator.mjs';
import {CostLedger,parseUsage} from './ledger.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(here,'../../../');
const BASE='http://127.0.0.1:3001';
const EMBED='http://127.0.0.1:8001/embed';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const hasOwn=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const scalar=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const validVector=v=>Array.isArray(v)&&v.length===384&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
const cosine=(a,b)=>{let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):0;};
const round=n=>Math.round(n*10000)/10000;
const delay=(ms,fn)=>Promise.race([fn(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Timed out')),ms))]);
const tempToken=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
export function flags(args){
 const f={mode:'fixture',source:'fixture',caseId:'U02-ambiguous',message:null,model:'gpt-4.1-mini',budget:null,allowSpend:false,saveEvidence:false,help:false};
 const values={'--mode':'mode','--source':'source','--case':'caseId','--message':'message','--model':'model','--budget-usd':'budget'};
 for(let i=0;i<args.length;i++){const k=args[i];if(k==='--allow-spend'){f.allowSpend=true;continue;}if(k==='--save-evidence'){f.saveEvidence=true;continue;}if(k==='--help'){f.help=true;continue;}
  if(!hasOwn(values,k)||i===args.length-1)throw Error('Unknown/incomplete parameter '+k);f[values[k]]=args[++i];}
 if(!['fixture','model'].includes(f.mode)||!['fixture','sandbox'].includes(f.source))throw Error('Unsupported mode or source');
 if(!['gpt-4.1-mini','gpt-4o-mini'].includes(f.model))throw Error('Unsupported model');
 if(f.message!==null&&(f.message.trim().length<8||f.message.length>600))throw Error('Message must be 8..600 characters');
 if(f.source==='sandbox'&&f.message===null)throw Error('Live sandbox source requires explicit --message');
 if(f.source==='sandbox'&&f.mode==='fixture')throw Error('Live sandbox mode needs real Model A; choose --mode model');
 if(f.mode==='model'){
  if(!f.allowSpend||f.budget===null||!/^(?:\d+)(?:\.\d{1,6})?$/.test(f.budget)||Number(f.budget)<0.02||Number(f.budget)>0.5)throw Error('PAID MODE REFUSED: --allow-spend and --budget-usd 0.02..0.50 required');
  f.budget=Number(f.budget);
 }else if(f.allowSpend||f.budget!==null)throw Error('Paid flags forbidden in fixture mode');
 return f;
}
function candidateData(caseId){const cases=loadCases();const c=cases.find(x=>x.id===caseId);if(!c)throw Error('Unknown S1.3 case '+caseId);return c;}
export function makeBank(){
 const cases=loadCases();const byDomain=new Map();
 const chosen=['Q01-same','Q02-distinct','Q03-refinement','Q04-refinement','Q05-same','Q06-same','Q07-same','Q08-same','Q09-distinct','Q10-same','Q11-same','Q12-same','Q13-distinct','Q14-refinement','Q15-same','Q16-same','U02-ambiguous','U05-same','U06-distinct'];
 for(const id of chosen){const c=cases.find(x=>x.id===id);if(!c)throw Error('Missing bank seed '+id);const label=c.topicLabel, key=c.domain;
  if(!byDomain.has(key))byDomain.set(key,{topic_id:'fixture-'+String(byDomain.size+1).padStart(2,'0'),topic_label:label,domain:key,events:[]});
  const row=byDomain.get(key);for(const e of c.approved)if(!row.events.some(old=>old.event_id===e.event_id))row.events.push({event_id:e.event_id,root_problem:e.root_problem});
 }
 return [...byDomain.values()];
}
const fixtureAssessment=c=>({topic_name:c.topicLabel,evidence_quote:c.message,root_problem:c.root,confusion:6,insight:1,next_action:'proceed',clarifying_question:'',root_problem_confidence:c.rootConfidence??0.85});
export function missingReferent(message){return /\b(there|that part|this part|that graph|it changed|that changed|right there)\b/i.test(message)&&!/\b(across (the |a )?(resistor|battery|capacitor)|at (the )?(battery|terminal|junction)|in (the )?(loop|function)|on the [xy]-axis)\b/i.test(message);}
export function compareEvidence(message,events){
 // Research gate, not a semantic truth oracle. A vague referent plus at least two plausible histories requires review.
 const vague=missingReferent(message);
 const credible=events.filter(e=>e.similarity>=0.40);
 return {vagueReferent:vague,credibleHistories:credible.length,requiresClarification:vague&&credible.length>=2,
  rationale:vague&&credible.length>=2?'The learner used an unresolved reference and at least two prior difficulties remain plausible. Request distinguishing learner evidence before identity reuse.':'No structural ambiguity guard triggered; Model C still needs to justify identity against rival histories.'};
}
async function post(url,payload,request=fetch,timeout=60000){
 const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),timeout);
 try{const r=await request(url,{method:'POST',signal:ac.signal,redirect:'error',cache:'no-store',headers:{Origin:BASE,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const obj=await r.json().catch(()=>({}));if(!r.ok){const e=Error('HTTP '+r.status+' '+String(obj.error??'unknown').slice(0,180));e.usage=obj.usage;throw e;}return obj;
 }finally{clearTimeout(timer);}
}
async function embedMany(texts,request=fetch){
 if(!texts.length||texts.length>50)throw Error('Invalid embedding request size');
 const result=await post(EMBED,{texts},request,40000);
 if(!Array.isArray(result.vectors)||result.vectors.length!==texts.length||!result.vectors.every(validVector))throw Error('Invalid local 384-D embedding response');
 return result.vectors;
}
export async function fixtureRetrieve(c,assessment,request=fetch,simulate=false){
 const bank=makeBank();const query=assessment.topic_name+' '+assessment.root_problem;
 if(simulate){const top=bank.find(row=>row.domain===c.domain);if(!top)throw Error('Missing fixture topic');
  const candidates=[{topicId:top.topic_id,topicLabel:top.topic_label,similarity:0.75}];
  return {retrievalStatus:'fixture_stub',topicCandidates:candidates,topicId:top.topic_id,topicLabel:top.topic_label,
   events:top.events.slice(0,8).map((e,i)=>({...e,similarity:i===0?0.7:0.5,topic_id:top.topic_id})), note:'synthetic routing and similarity, not measured',preview:null};}
 const v=await embedMany([query,...bank.map(row=>row.topic_label+' '+row.domain)],request);
 const candidates=bank.map((row,i)=>({topicId:row.topic_id,topicLabel:row.topic_label,similarity:round(cosine(v[0],v[i+1]))})).sort((a,b)=>b.similarity-a.similarity).slice(0,3);
 const best=candidates[0];if(!best)throw Error('No fixture topic candidates');const source=bank.find(row=>row.topic_id===best.topicId);
 const histories=source.events.slice(-8);return {retrievalStatus:'fixture_local_embedding',topicCandidates:candidates,topicId:best.topicId,topicLabel:best.topicLabel,
  events:histories.map(e=>({...e,topic_id:best.topicId})),note:'real embedding topic selection; curated synthetic historical events; no Supabase',preview:null};
}
export async function sandboxRetrieve(message,assessment,request=fetch){
 const query=(assessment.topic_name+' '+assessment.root_problem).slice(0,1500);
 const result=await post(BASE+'/api/sandbox/probe-lab/learning-space/retrieve',{
  message,topicName:assessment.topic_name,searchText:query,rootProblem:assessment.root_problem,
  evidenceQuote:assessment.evidence_quote,originalMessage:message,rootConfidence:assessment.root_problem_confidence,
  confusion:assessment.confusion,insight:assessment.insight},request,90000);
 const candidates=(Array.isArray(result.matches)?result.matches:[]).slice(0,3).filter(x=>UUID.test(x.topicId)&&typeof x.topicLabel==='string').map(x=>({topicId:x.topicId,topicLabel:x.topicLabel,similarity:x.similarity}));
 const target=result.topicMemory?.targetTopicId;
 const chosen=candidates.find(x=>x.topicId===target)??candidates[0];
 if(result.status!=='semantic_pgvector'||!chosen)return {retrievalStatus:result.status??'unavailable',topicCandidates:candidates,topicId:null,topicLabel:null,events:[],note:'No trusted semantic topic candidate; Model C must not run',preview:{action:result.topicMemory?.action,reasonCode:result.topicMemory?.reasonCode}};
 const read=await post(BASE+'/api/sandbox/probe-lab/local-assessment/memory-history-s14',{
  format:'myway_s14_history_readonly_v1',topic_ids:candidates.map(c=>c.topicId)},request,40000);
 if(read.schema!=='myway_s14_approved_history_readonly_v1'||!Array.isArray(read.topics))throw Error('Unexpected approved-history schema');
 const histories=[];
 for(const t of read.topics){if(!candidates.some(c=>c.topicId===t.topic_id))throw Error('Unrequested history topic');
  for(const e of t.events??[]){if(UUID.test(e.event_id)&&typeof e.root_problem==='string'&&e.root_problem.length>=15&&e.root_problem.length<=500)
    histories.push({...e,topic_id:t.topic_id});}
 }
 return {retrievalStatus:result.status,topicCandidates:candidates,topicId:chosen.topicId,topicLabel:chosen.topicLabel,
  events:histories.slice(0,24),note:'real read-only sandbox pgvector + approved-event SELECT; zero write operations',
  preview:{action:result.topicMemory?.action,reasonCode:result.topicMemory?.reasonCode,continuity:result.topicMemory?.difficultyContinuity?.relation??null}};
}
export async function scoreEvents(root,events,request=fetch,simulate=false){
 if(!events.length)return [];
 if(simulate)return events.map(e=>({...e,similarity:Number.isFinite(e.similarity)?e.similarity:0.45}));
 const vectors=await embedMany([root,...events.map(e=>e.root_problem)],request);
 return events.map((e,i)=>({...e,similarity:round(cosine(vectors[0],vectors[i+1]))}));
}
export function chooseHistory(rows,selectedTopic,max=5){
 const preferred=rows.filter(e=>e.topic_id===selectedTopic).sort((a,b)=>b.similarity-a.similarity);
 const rival=rows.filter(e=>e.topic_id!==selectedTopic).sort((a,b)=>b.similarity-a.similarity);
 // Preserve the top two rival candidates if cross-topic evidence is competitive.
 const cut=[...preferred.slice(0,max),...rival.slice(0,2)].sort((a,b)=>b.similarity-a.similarity).slice(0,max);
 const seen=new Set();return cut.filter(e=>!seen.has(e.event_id)&&seen.add(e.event_id));
}
export async function runFlow(f,{request=fetch,runtime=null,s13=null,simulate=false,logger=console}={}){
 const r=runtime??loadRuntime(ROOT),validator=s13??loadS13(ROOT);
 const item=f.source==='fixture'?candidateData(f.caseId):null;
 const message=f.message??item?.message;if(!message)throw Error('No learner statement');
 const ledger=new CostLedger(r.cost,f.budget??0);
 const trace={schema:'myway-s14-full-chain-v1',source:f.source,mode:f.mode,caseId:item?.id??null,learnerMessage:message,
  stages:[],reference:item?.semanticLabel??null,assessment:null,retrieval:null,adjudication:null,finalAction:'not_started',cost:null};
 const stage=(name,details)=>{trace.stages.push({name,...details});logger.log('STAGE '+name+' | '+JSON.stringify(details));};
 async function paidCall(name,endpoint,payload){
  ledger.reserve(name,f.model);let body=null,error=null;const t=performance.now();
  try{body=await post(endpoint,payload,request);}catch(e){error=e;}
  const cost=ledger.record({caseId:item?.id??'custom',stage:name,model:body?.model??f.model,
   usage:parseUsage(body??(error?.usage?{usage:error.usage}:null)),elapsedMs:performance.now()-t,status:error?'failed':'ok'});
  if(error)throw Error(name+': '+error.message+' (unknown billable usage; STOP)');
  if(!ledger.summary().complete)throw Error(name+': missing token usage; STOP');
  return {body,cost};
 }
 try{
  let assessment;
  if(f.mode==='fixture'){assessment=fixtureAssessment(item);stage('model_a',{status:'offline_fixture',nextAction:assessment.next_action,rootConfidence:assessment.root_problem_confidence});}
  else{
   const {body,cost}=await paidCall('model_a_assessment',BASE+'/api/sandbox/probe-lab/local-assessment/openai',{
    userPrompt:r.assessment.buildUserPrompt(message,null),systemPrompt:r.assessment.ASSESSMENT_SYSTEM_PROMPT,
    responseSchema:r.assessment.ASSESSMENT_SCHEMA,model:f.model});
   const checked=r.assessment.validateAssessment(body.raw,message);
   if(!checked.assessment)throw Error('Model A assessment rejected: '+checked.error);
   assessment=checked.assessment;stage('model_a',{status:'provider_validated',nextAction:assessment.next_action,rootConfidence:assessment.root_problem_confidence,warnings:checked.warnings??[],costUSD:cost.estimatedUsd});
  }
  trace.assessment=assessment;
  const route=r.assessment.resolveAssessmentRoute(assessment,null,0.65);
  if(route!=='proceed'){trace.finalAction='clarify_before_retrieval';stage('assessment_gate',{status:'hold',reason:'Model A indicated insufficient evidence',route,question:assessment.clarifying_question});return trace;}
  stage('assessment_gate',{status:'proceed',route});
  let found=f.source==='sandbox'?await sandboxRetrieve(message,assessment,request):await fixtureRetrieve(item,assessment,request,simulate||f.mode==='fixture');
  stage('topic_retrieval',{status:found.retrievalStatus,topicId:found.topicId,candidates:found.topicCandidates.length,approvedEvents:found.events.length,preview:found.preview??null});
  if(!found.topicId||!found.events.length){trace.finalAction='hold_no_approved_history';return trace;}
  let scored=await scoreEvents(assessment.root_problem,found.events,request,simulate||f.mode==='fixture');
  const candidate=chooseHistory(scored,found.topicId,5);
  const maxSimilarity=candidate.length?Math.max(...candidate.map(x=>x.similarity)):null;
  trace.retrieval={...found,scoredEvents:candidate};
  const early=compareEvidence(message,candidate);
  stage('evidence_sufficiency',{...early,selectedApprovedEventCount:candidate.length});
  if(!candidate.length){trace.finalAction='hold_no_history_after_selection';return trace;}
  const input=validator.s13Input({topic_label:found.topicLabel,learner_statement:message,
    proposed_root_problem:assessment.root_problem,
    historical_observations:candidate.map(e=>({event_id:e.event_id,root_problem:e.root_problem})),max_similarity:maxSimilarity});
  if(!validator.validS13Input(input))throw Error('Model C input fails strict S1.3 validator');
  let modelDecision=null;
  if(f.mode==='model'){
   const {body,cost}=await paidCall('model_c_two_stage',BASE+'/api/sandbox/probe-lab/local-assessment/memory-adjudicator-s13',{
    format:'myway_s13_two_stage_memory_v1',input,model:f.model});
   const checked=validator.parseS13(body.raw,input);
   if(!checked.decision)throw Error('Model C response rejected: '+checked.error);
   modelDecision=checked.decision;stage('model_c',{status:'provider_validated',identity:modelDecision.identity,interpretation:modelDecision.interpretation,anchor:modelDecision.anchor_event_id??'',costUSD:cost.estimatedUsd});
  }else stage('model_c',{status:'not_called_fixture_mode'});
  const effective=early.requiresClarification?'hold_ambiguous_reference':!modelDecision?'await_model_c':modelDecision.identity==='uncertain'?'hold_model_uncertain':'shadow_proposal_only';
  trace.adjudication={input,modelDecision,earlyEvidenceGate:early,action:effective};trace.finalAction=effective;
  stage('final_shadow_gate',{action:effective,noWrite:true});
  return trace;
 }catch(e){trace.finalAction='stopped_on_error';trace.error=e?.message??String(e);stage('error',{message:trace.error});return trace;}
 finally{trace.cost=ledger.summary();}
}
const reportPath=()=>path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s14',new Date().toISOString().replace(/[:.]/g,'-')+'-flow.json');
function help(){console.log(`S1.4 raw learner -> actual Model A -> semantic retrieval -> approved-event context -> Model C read-only shadow.
 --mode fixture|model (default fixture); --source fixture|sandbox (default fixture)
 --case U02-ambiguous|Q03-refinement|Q06-same|...  (default U02-ambiguous)
 --message "learner statement" (required for sandbox, optional for fixture)
 --allow-spend --budget-usd 0.02..0.50 (required for model; at most 2 intended paid calls)
 --model gpt-4.1-mini|gpt-4o-mini; --save-evidence (store raw custom learner text locally)
 fixture: no network/model/API/DB. model+fixture: real A + local embeddings + real C, curated histories.
 model+sandbox: real A + actual read-only pgvector + approved history SELECT + real C.
 Never invokes commit/write operations; may stop after A asks clarification. Budget is NOT hard billing cap.`);}
async function main(){const f=flags(process.argv.slice(2));if(f.help){help();return;}
 const pointer=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8'));
 if(pointer.release!=='v37d2c7a3s12'||!fs.existsSync(path.join(ROOT,'scripts/sandbox/v37d2c7a3s14/installation.json')))throw Error('S1.4 overlay missing or unexpected release');
 console.log(`MyWay S1.4 FULL CHAIN | mode=${f.mode} source=${f.source} | learner_writes=0`);
 console.log('Model A may stop for clarification BEFORE Model C. No benchmark labels supplied to any model.');
 if(f.mode==='model')console.log('PAID OPT-IN | up to two intended model calls | budget '+f.budget.toFixed(2)+' admission only, NOT a hard billing cap');
 const result=await runFlow(f);
 const output=reportPath();fs.mkdirSync(path.dirname(output),{recursive:true});
 const toStore=structuredClone(result);
 if(!f.saveEvidence){
  if(f.source==='sandbox'){
   const raw=JSON.stringify(toStore);toStore.privacy={rawLearnerTextStored:false,messageSha256:sha(result.learnerMessage)};
   delete toStore.learnerMessage;delete toStore.assessment;delete toStore.retrieval;delete toStore.adjudication;
  }
 }
 fs.writeFileSync(output,JSON.stringify(toStore,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('RESULT | action='+result.finalAction+' | stages='+result.stages.length+' | costs='+JSON.stringify(result.cost));
 console.log('REPORT | '+output+(f.source==='sandbox'&&!f.saveEvidence?' (private evidence suppressed by default)':''));
 console.log('NO DEPLOYMENT GATE | This is a shadow replay; no learner memory updates, approvals or SQL.');
 if(result.error)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S1.4 REFUSED: '+e.message);process.exitCode=1;});
