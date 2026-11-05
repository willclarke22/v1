#!/usr/bin/env node
/** S1.5 read-only conversation research; no memory writers, approvals or automatic deployments. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import ts from 'typescript';
import {loadRuntime} from './runtime-loader.mjs';
import {loadS13,loadCases} from './s13-evaluator.mjs';
import {CostLedger,parseUsage} from './ledger.mjs';
import {fixtureRetrieve,sandboxRetrieve,scoreEvents,chooseHistory,compareEvidence,missingReferent} from './s14-flow.mjs';
import {rankFixtureEvidence,evidenceIntegrity} from './s151-retrieval.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));const ROOT=path.resolve(here,'../../../');
const BASE='http://127.0.0.1:3001',S15_ROUTE=BASE+'/api/sandbox/probe-lab/local-assessment/myway-shadow-s15';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
export function args(argv){
 const f={mode:'fixture',source:'fixture',policy:'myway',retrievalPolicy:'baseline',caseId:'Q03-refinement',message:null,answer:null,model:'gpt-4.1-mini',budget:null,allowSpend:false,saveEvidence:false,help:false};
 const names={'--mode':'mode','--source':'source','--policy':'policy','--retrieval-policy':'retrievalPolicy','--case':'caseId','--message':'message','--answer':'answer','--model':'model','--budget-usd':'budget'};
 for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--help'){f.help=true;continue;}if(arg==='--allow-spend'){f.allowSpend=true;continue;}if(arg==='--save-evidence'){f.saveEvidence=true;continue;}
  if(!names[arg]||i===argv.length-1)throw Error('Unknown or incomplete argument '+arg);f[names[arg]]=argv[++i];}
 if(!['fixture','model'].includes(f.mode)||!['fixture','sandbox'].includes(f.source)||!['baseline','myway','paired'].includes(f.policy)||!['baseline','integrity'].includes(f.retrievalPolicy))throw Error('Invalid mode/source/policy');
 if(!['gpt-4.1-mini','gpt-4o-mini'].includes(f.model))throw Error('Invalid model');
 for(const k of ['message','answer'])if(f[k]!==null&&(f[k].trim().length<5||f[k].length>500))throw Error(k+' must be 5..500 characters');
 if(f.retrievalPolicy==='integrity'&&f.mode==='fixture')throw Error('Integrity retrieval requires actual local embeddings: --mode model');
 if(f.source==='sandbox'&&(f.mode==='fixture'||f.message===null))throw Error('Sandbox needs real model and explicit --message');
 if(f.mode==='model'){
  if(!f.allowSpend||f.budget===null||!/^(?:\d+)(?:\.\d{1,6})?$/.test(f.budget)||Number(f.budget)<0.02||Number(f.budget)>0.5)throw Error('Paid mode requires --allow-spend and --budget-usd 0.02..0.50');
  f.budget=Number(f.budget);
 }else if(f.allowSpend||f.budget!==null)throw Error('Fixture mode forbids spending flags');
 return f;
}
export function shadowAssessmentGate(assessment,policy,original,answer=null,baselineRoute='clarify'){
 const combined=answer?original+'\nLearner clarification: '+answer:original;
 const unresolved=missingReferent(combined);
 const grounded=typeof assessment?.root_problem==='string'&&assessment.root_problem.trim().length>=15&&
  typeof assessment?.evidence_quote==='string'&&assessment.evidence_quote.trim().length>0&&
  typeof assessment?.root_problem_confidence==='number'&&assessment.root_problem_confidence>=0.65&&
  assessment.topic_name!=='unspecified topic';
 const stopBaseline=baselineRoute!=='proceed';
 const needsQuestion=policy==='baseline'?stopBaseline:!grounded||unresolved;
 let question=String(assessment?.clarifying_question||'').trim();
 if(unresolved){
  const match=combined.match(/\b(there|that part|this part|it)\b/i);
  if(match){const referent=match[1].toLowerCase();
   question=/\bcircuit|voltage|battery|resistor\b/i.test(combined)?`When you say “${referent},” which point or component in the circuit do you mean?`:
     `When you say “${referent},” which specific part or event are you referring to?`;
  }
 }
 if(!question)question='Which part feels unclear to you?';
 return {grounded,unresolvedReferent:unresolved,originalRoute:baselineRoute,route:needsQuestion?'clarify':'proceed',
  shadowOverride:policy==='myway'&&stopBaseline&&!needsQuestion,teachingReady:!needsQuestion,memoryReady:!needsQuestion,question};
}
function loadVoice(){const file=path.join(ROOT,'sandbox/probe-lab/learning-space/myway-shadow-voice-s15.ts');
 const source=fs.readFileSync(file,'utf8');const compiled=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 if(compiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('S1.5 shadow prompt syntax invalid');
 const mod={exports:{}};new Function('module','exports',compiled.outputText)(mod,mod.exports);
 return mod.exports;
}
function fixtureAssessment(caseId,caseData,turn,answer){
 const isU02=caseId==='U02-ambiguous';const isQ03=caseId==='Q03-refinement';
 if(turn===2){const alt=/\bbattery|terminal\b/i.test(answer||'')?'Why terminal voltage falls at the battery contacts':caseData.root;
  return {topic_name:caseData.topicLabel,evidence_quote:answer||'',root_problem:alt,confusion:5,insight:1,next_action:'proceed',clarifying_question:'',root_problem_confidence:0.82};}
 return {topic_name:caseData.topicLabel,evidence_quote:caseData.message,root_problem:caseData.root,confusion:6,insight:1,
  next_action:isU02||isQ03?'clarify':'proceed',clarifying_question:isU02?'What do you mean by “there”?':'What do you already know about ion channels?',root_problem_confidence:0.90};
}
function fixtureTeacher(assessment){return {teaching_strategy:'This is an offline teaching fixture, not a generated explanation.',next_step:'Inspect a real paid teaching run for actual voice quality.',visual_intent:'none'};}
function teachingContext(assessment,original,answer){return {topic:String(assessment.topic_name).slice(0,110),root_problem:String(assessment.root_problem).slice(0,500),
 evidence_quote:String(assessment.evidence_quote).slice(0,450),original_statement:original.slice(0,2500),clarification_answer:(answer||'').slice(0,2500)};}
function validTeaching(raw){let value;try{value=JSON.parse(raw);}catch{return {error:'Teaching response is not JSON'};}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!=='next_step|teaching_strategy|visual_intent')return {error:'Unexpected teaching fields'};
 for(const k of ['teaching_strategy','next_step','visual_intent'])if(typeof value[k]!=='string'||!value[k].trim()||value[k].length>620)return {error:'Invalid teaching field '+k};
 return {value};
}
async function post(url,payload,request=fetch,timeout=45000){const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),timeout);
 try{const r=await request(url,{method:'POST',redirect:'error',cache:'no-store',signal:abort.signal,
  headers:{Origin:BASE,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json().catch(()=>({}));if(!r.ok){const err=Error('HTTP '+r.status+': '+String(data.error||'unavailable').slice(0,140));err.usage=data.usage;throw err;}return data;
 }finally{clearTimeout(timer);}
}
export async function runS15(f,{request=fetch,runtime=null,s13=null,voice=null,fixtureSimulator=null,logger=console}={}){
 const r=runtime??loadRuntime(ROOT),valid=s13??loadS13(ROOT),v=voice??loadVoice();
 const item=f.source==='fixture'?loadCases().find(x=>x.id===f.caseId):null;
 if(f.source==='fixture'&&!item)throw Error('Unrecognized fixture case');
 const original=f.message??item?.message;const ledger=new CostLedger(r.cost,f.budget||0);
 const trace={schema:'myway-s15-conversation-shadow-v1',source:f.source,mode:f.mode,caseId:item?.id??null,policies:[],cost:null,rawMessage:original,clarificationAnswer:f.answer,
  safeguards:{noWrites:true,realProductionPromptsChanged:false,referenceLabelsNotSent:true,retrievalPolicy:f.retrievalPolicy??'baseline'}};
 const stage=(p,name,details)=>{p.stages.push({stage:name,...details});logger.log('STAGE '+p.policy+'.'+name+' | '+JSON.stringify(details));};
 async function paidCall(id,endpoint,payload){ledger.reserve(id,f.model);const t=performance.now();let body=null,error=null;
  try{body=await post(endpoint,payload,request);}catch(e){error=e;}
  const cost=ledger.record({caseId:item?.id??'custom',stage:id,model:body?.model??f.model,usage:parseUsage(body??(error?.usage?{usage:error.usage}:null)),elapsedMs:performance.now()-t,status:error?'failed':'ok'});
  if(error)throw Error(id+': '+error.message+'; provider usage may be unknown, STOP');
  if(!ledger.summary().complete)throw Error(id+': provider token accounting missing, STOP');return {body,cost};
 }
 const policies=f.policy==='paired'?['baseline','myway']:[f.policy];
 for(const policy of policies){
  const out={policy,stages:[],finalAction:'not_started',assessment:null,teaching:null,modelC:null,history:null,clarification:null};trace.policies.push(out);
  try{
   let assessment=null;let gate=null;
   for(let turn=1;turn<=(f.answer?2:1);turn++){
    const text=turn===1?original:f.answer;
    const context=turn===2?{originalMessage:original,question:gate?.question??assessment?.clarifying_question??'Please clarify.',depth:1}:null;
    if(f.mode==='fixture')assessment=(fixtureSimulator??fixtureAssessment)(f.caseId,item,turn,f.answer);
    else{
     const {body,cost}=await paidCall(policy+'_model_a_turn_'+turn,BASE+'/api/sandbox/probe-lab/local-assessment/openai',{
      userPrompt:r.assessment.buildUserPrompt(text,context),
      systemPrompt:r.assessment.ASSESSMENT_SYSTEM_PROMPT+(policy==='myway'?v.S15_ASSESSMENT_ADDENDUM:''),
      responseSchema:r.assessment.ASSESSMENT_SCHEMA,model:f.model});
     const checked=r.assessment.validateAssessment(body.raw,turn===1?original:[original,f.answer]);
     if(!checked.assessment)throw Error('Model A validator: '+checked.error);
     assessment=checked.assessment;
     stage(out,'assessment',{turn,status:'provider_validated',nextAction:assessment.next_action,rootConfidence:assessment.root_problem_confidence,warnings:checked.warnings||[],costUSD:cost.estimatedUsd});
    }
    const base=r.assessment.resolveAssessmentRoute(assessment,null,0.65);
    gate=shadowAssessmentGate(assessment,policy,original,turn===2?f.answer:null,base);
    stage(out,'assessment_gate',{turn,...gate});
    if(turn===1&&f.answer){stage(out,'clarification_turn',{status:'answer_provided_for_replay',originalAssessmentRoute:gate.route});}
   }
   out.assessment=assessment;
   if(gate.route==='clarify'){
    out.clarification=gate.question;out.finalAction='clarify_learner';
    stage(out,'learner_reply',{kind:'targeted_clarification',text:gate.question});continue;
   }
   // Teaching readiness is independent from memory identity. Deliver teaching even without approved history.
   const teaching=teachingContext(assessment,original,f.answer);
   if(f.mode==='fixture')out.teaching=fixtureTeacher(assessment);
   else{
    const baseline=policy==='baseline';const payload=baseline?{format:'myway_learning_space_teaching_v1',context:teaching,model:f.model}:
      {format:'myway_s15_shadow_model_v1',stage:'teaching',context:teaching,model:f.model};
    const {body,cost}=await paidCall(policy+'_model_b_teaching',baseline?BASE+'/api/sandbox/probe-lab/local-assessment/teaching':S15_ROUTE,payload);
    const parsed=validTeaching(body.raw);if(parsed.error)throw Error(parsed.error);out.teaching=parsed.value;
    stage(out,'model_b',{status:'provider_validated',costUSD:cost.estimatedUsd,teaching_strategy:out.teaching.teaching_strategy,next_step:out.teaching.next_step,visual_intent:out.teaching.visual_intent});
   }
   if(f.mode==='fixture')stage(out,'model_b',{status:'offline_stub',contract:'compact three-field response only'});
   let found;
   const completeStatement=f.answer?original+'\nLearner clarification: '+f.answer:original;
   if(f.source==='sandbox')found=await sandboxRetrieve(original,assessment,request);
   else if(f.retrievalPolicy==='integrity')found=await rankFixtureEvidence(assessment,{request});
   else found=await fixtureRetrieve(item,assessment,request,f.mode==='fixture');
   stage(out,'topic_retrieval',{status:found.retrievalStatus,topicId:found.topicId,topicLabel:found.topicLabel,topicCandidates:found.topicCandidates.length,approvedEvents:found.events.length,diagnostics:found.diagnostics??null});
   if(!found.topicId||!found.events.length){out.finalAction='teaching_complete_memory_hold_no_history';continue;}
   const scored=await scoreEvents(assessment.root_problem,found.events,request,f.mode==='fixture');
   const chosen=chooseHistory(scored,found.topicId,5);out.history={source:found.retrievalStatus,selectedEventCount:chosen.length,topicCandidates:found.topicCandidates,events:chosen};
   if(f.retrievalPolicy==='integrity'){const integrity=evidenceIntegrity(found,chosen);out.retrievalIntegrity=integrity;stage(out,'retrieval_integrity',integrity);
    if(integrity.status==='hold'){out.finalAction='teaching_complete_memory_hold_retrieval_integrity';continue;}
    if(integrity.status==='review_only'){out.finalAction='teaching_complete_memory_hold_sandbox_top_k';continue;}
   }
   const early=compareEvidence(completeStatement,chosen);
   stage(out,'evidence_sufficiency',{...early,selectedEventCount:chosen.length});
   if(early.requiresClarification){out.finalAction='teaching_complete_memory_hold_ambiguous_reference';continue;}
   if(!chosen.length){out.finalAction='teaching_complete_memory_hold_no_candidates';continue;}
   const memoryInput=valid.s13Input({topic_label:found.topicLabel,learner_statement:completeStatement.slice(0,600),
    proposed_root_problem:assessment.root_problem,historical_observations:chosen.map(x=>({event_id:x.event_id,root_problem:x.root_problem})),
    max_similarity:Math.max(...chosen.map(x=>x.similarity))});
   if(!valid.validS13Input(memoryInput))throw Error('Historical evidence fails S1.3 model C validator');
   if(f.mode==='fixture'){
    out.finalAction='teaching_complete_memory_pending_model_c';stage(out,'model_c',{status:'offline_stub',historicalEvents:chosen.length});continue;
   }
   const baseline=policy==='baseline';const bodyPayload=baseline?{format:'myway_s13_two_stage_memory_v1',input:memoryInput,model:f.model}:
    {format:'myway_s15_shadow_model_v1',stage:'memory',context:memoryInput,model:f.model};
   const {body,cost}=await paidCall(policy+'_model_c_identity',baseline?BASE+'/api/sandbox/probe-lab/local-assessment/memory-adjudicator-s13':S15_ROUTE,bodyPayload);
   const parsed=valid.parseS13(body.raw,memoryInput);if(!parsed.decision)throw Error('Model C evidence validation: '+parsed.error);
   out.modelC=parsed.decision;out.finalAction=out.modelC.identity==='uncertain'?'teaching_complete_memory_hold_uncertain':'teaching_complete_shadow_memory_proposal';
   stage(out,'model_c',{status:'provider_validated',identity:out.modelC.identity,interpretation:out.modelC.interpretation,anchor:out.modelC.anchor_event_id,costUSD:cost.estimatedUsd});
  }catch(e){out.finalAction='stopped_on_error';out.error=e.message;stage(out,'error',{message:e.message});break;}
 }
 trace.cost=ledger.summary();trace.calls=ledger.rows;return trace;
}
function filePath(){return path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s15',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex')+'.json');}
async function main(){const f=args(process.argv.slice(2));if(f.help){console.log('S1.5: --mode fixture|model --source fixture|sandbox --policy baseline|myway|paired --retrieval-policy baseline|integrity --case Q03-refinement --answer "clarification" --message "learner message" --allow-spend --budget-usd 0.02..0.50 --save-evidence. Models on 127.0.0.1:3001; local embeddings on :8001. Shadow only, no learner writes.');return;}
 const current=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8'));
 if(current.release!=='v37d2c7a3s12'||!fs.existsSync(path.join(ROOT,'scripts/sandbox/v37d2c7a3s15/installation.json')))throw Error('Unexpected release or missing S1.5 marker');
 console.log(`MyWay S1.5 | mode=${f.mode} source=${f.source} policy=${f.policy} retrieval=${f.retrievalPolicy} | learner_writes=0`);
 if(f.mode==='model')console.log(`PAID OPT-IN | at most ${f.policy==='paired'?8:4} intended calls with one clarification answer; USD budget ${f.budget}; not a hard provider billing cap`);
 const result=await runS15(f);const save=structuredClone(result);
 if(f.source==='sandbox'&&!f.saveEvidence){save.privacy={redacted:true,messageSHA256:hash(result.rawMessage),answerSHA256:result.clarificationAnswer?hash(result.clarificationAnswer):null};
  delete save.rawMessage;delete save.clarificationAnswer;
  for(const policy of save.policies){delete policy.assessment;delete policy.teaching;delete policy.history;delete policy.modelC;delete policy.clarification;policy.stages=policy.stages.map(s=>({stage:s.stage,status:s.status,turn:s.turn,route:s.route,costUSD:s.costUSD}));}
 }
 const output=filePath();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(save,null,2)+'\n',{flag:'wx',mode:0o600});
 for(const p of result.policies)console.log(`RESULT ${p.policy} | ${p.finalAction} | teaching=${p.teaching?'yes':'no'} | modelC=${p.modelC?.identity||'-'} | override=${p.stages.some(s=>s.shadowOverride)}`);
 console.log('COST | '+JSON.stringify(result.cost));console.log('REPORT | '+output);console.log('SHADOW ONLY | no memory writes; no automatic release gate.');
 if(result.policies.some(p=>p.error))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S1.5 REFUSED: '+e.message);process.exitCode=1;});
