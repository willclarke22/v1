#!/usr/bin/env node
/** S60: additive, case-based A/B prompt and retrieval ablations; NOT another learning journey. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {fixturePublic,privateRubricForReview} from './s16b60-fixture.mjs';
import {retrievalPacket} from './s16b60-retrieval.mjs';
import {promptFor} from './s16b60-prompts.mjs';
import {makeRequest,parseResult,scriptedMock,validateA,validateC} from './s16b59-lean-core.mjs';
import {RATE,credentials,callProvider,usageCost} from './s16b54-models.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const clone=x=>JSON.parse(JSON.stringify(x));
export function parseArgs(argv){
 const o={mode:'offline',retrieval:'lexical',prompt:'compare',role:'both',explore:'on',c:'off',limit:4,caseId:null,semanticUrl:'http://127.0.0.1:8001/embed',allowSpend:false,budget:null,help:false};
 const options=new Set(['--mode','--retrieval','--prompt','--role','--explore','--c','--limit','--case-id','--semantic-url','--budget-usd']);
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--help'){o.help=true;continue;}if(k==='--allow-spend'){o.allowSpend=true;continue;}
  if(!options.has(k)||!argv[i+1])throw Error('Missing/unknown S60 option: '+k);
  const val=argv[++i];if(k==='--case-id')o.caseId=val;else if(k==='--semantic-url')o.semanticUrl=val;else if(k==='--budget-usd')o.budget=Number(val);else if(k==='--limit')o.limit=Number(val);else o[k.slice(2)]=val;
 }
 if(!['offline','model'].includes(o.mode)||!['lexical','semantic','mixed'].includes(o.retrieval)||!['s59','s60','compare'].includes(o.prompt)||!['A','B','both'].includes(o.role)||!['on','off','force'].includes(o.explore)||!['off','auto'].includes(o.c)||!Number.isInteger(o.limit)||o.limit<1||o.limit>30||o.caseId&&!/^C(?:0[1-9]|[12]\d|30)$/.test(o.caseId))throw Error('Invalid S60 options');
 if(o.mode==='offline'&&(o.allowSpend||o.budget!==null))throw Error('Offline forbids spend flags');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<0.10||o.budget>1.50||o.limit>10))throw Error('Model mode requires explicit --allow-spend --budget-usd 0.10..1.50; limit <=10');
 return o;
}
function git(p,...args){return execFileSync('git',['-C',p,...args],{encoding:'utf8',timeout:10000}).trim();}
function paidGate(){
 if(path.basename(ROOT).toLowerCase()!=='v1-learning-experiment'||git(ROOT,'branch','--show-current')!=='myway/learning-sandbox-v3_7a')throw Error('Paid S60 calls restricted to experiment branch');
 const main=path.join(path.dirname(ROOT),'v1');if(git(main,'branch','--show-current')!=='main'||git(main,'rev-parse','--verify','HEAD^{commit}')!=='462a7a4b6ce8b2b20a91021acca716307f4aa2d1')throw Error('Protected original main differs');
 for(const x of ['scripts/sandbox/v37d2c7a3s16b59/installation.json','scripts/sandbox/v37d2c7a3s16b60/installation.json'])if(!fs.existsSync(path.join(ROOT,x)))throw Error('Missing installation stage '+x);
 if(process.env.VERCEL||process.env.CI==='true'||process.env.NODE_ENV==='production')throw Error('No cloud/CI model experiments');
 execFileSync(process.execPath,[path.join(ROOT,'scripts/sandbox/v37d2c7a3s16b60/verify-v37d2c7a3s16b60.mjs')],{cwd:ROOT,timeout:90000,stdio:'pipe'});
}
function modelInput(f,c,packet,role){
 // Stable IDs are attached to ALL displayed history: do not show unreferencable dialogue.
 const allowed=new Set(packet.context.coverage.included_observation_ids);
 const recent=c.historical_observations.filter(x=>allowed.has(x.id)).slice(-3).map(o=>({observation_id:o.id,topic_id:o.topic_id,learner_message:o.text,task_conditions:o.task_conditions}));
 const common={latest_observation_id:c.latest_observation.id,latest_message:c.latest_observation.text,recent_dialogue:recent,context:packet.context,allowed_observation_ids:[...allowed],task_conditions:{synthetic:true,scientific_probe_validity:'not_independently_certified',scoring:'unscored_open_ended',latest_response_independent_of_tutor_answer:true},tools_available:role==='A'?['request_more_context','explore_history']:['request_more_context']};
 return role==='A'?{...common,previous_dialogue:recent}: {...common,prior_model_a_advisory:null,research_only:true};
}
function stateForValidation(f,c){return {obs:[...c.historical_observations,c.latest_observation].map(x=>({id:x.id,text:x.text,topic_id:x.topic_id})),roots:clone(c.provisional_roots),relationships:clone(c.learner_relationships),topics:f.topics.map(x=>({id:x.topic_id})),links:[],proposals:[],explicit_instructions:[]};}
function validateOutput(role,result,f,c,packet){
 const allowed=new Set(packet.context.coverage.included_observation_ids);
 if(role==='A'){
  const state=stateForValidation(f,c),checked=validateA(result,state,allowed);
  const validClaimRefs=checked.checks.filter(x=>['observation','cause'].includes(x.type));
  return {provisional_proposals:checked.proposals,validation_checks:checked.checks,invalid_references:checked.checks.filter(x=>!x.accepted).length,invalid_claim_references:validClaimRefs.filter(x=>!x.accepted).length,relationships_proposed:checked.proposals.filter(x=>x.type==='relationship').length,roots_proposed:checked.proposals.filter(x=>x.type==='root').length,context_request:result.request_more_context?.scope??null,not_scientific_verification:true};
 }
 if(typeof result.reply!=='string'||!result.reply.trim())throw Error('Model B empty reply');
 return {probe_offered:result.probe_offer!==null,context_request:result.context_request?.scope??null,reply_available:true,scientific_validity_unverified:true};
}
export async function runBenchmark(o,deps={}){
 const f=deps.fixture??fixturePublic(),cases=(o.caseId?f.cases.filter(x=>x.case_id===o.caseId):f.cases.slice(0,o.limit));if(!cases.length)throw Error('S60 case not found');
 const versions=o.prompt==='compare'?['s59','s60']:[o.prompt],roles=o.role==='both'?['A','B']:[o.role];
 const callMax=cases.length*versions.length*roles.length*((o.explore==='on'?2:1)+(o.c==='auto'?1:0));
 const estimatedAdmission=+(callMax*((12500*RATE.input+1400*RATE.output)/1e6)).toFixed(6);
 if(o.mode==='model'&&estimatedAdmission>o.budget)throw Error('Conservative admission estimate $'+estimatedAdmission+' exceeds budget $'+o.budget+'; reduce --limit, --role or versions');
 if(o.mode==='model'&&!deps.invoke)paidGate();const auth=o.mode==='model'&&!deps.invoke?credentials():null;
 const ledger={calls:0,known_estimated_usd:0,unknown_usage:0,not_invoice:true,estimated_admission_usd:estimatedAdmission,hard_billing_cap:false,by_role:{A:0,B:0,C:0}};
 const trace={schema:'myway_s16b60_ablation_v1',research_only:true,source:'SYNTHETIC_RESEARCHER_AUTHORED_NOT_HUMAN',public_topics:f.topics.length,private_truth_exposed:false,mode:o.mode,options:{...o,allowSpend:o.allowSpend},runs:[],cost:ledger,summary:null,limitations:['Offline tests prove plumbing, not model intelligence','Author-authored private rubrics are fallible hypotheses for human review','No science grading of open responses, no mastery or causal conclusions','No production database or Learning Space writes','Case-based matched prompt comparisons; not longitudinal autonomous tutoring']};
 const doCall=async(role,data,version)=>{
  let answer;if(o.mode==='offline')answer=clone((deps.mock??scriptedMock)(role,data));
  else{
   const payload=makeRequest(role,data);if(role==='A'||role==='B')payload.messages[0].content=promptFor(role,version);
   ledger.calls++;ledger.by_role[role]++;
   let res;try{res=deps.invoke?await deps.invoke(role,clone(data),clone(payload)):await callProvider(payload,auth);}catch(e){ledger.unknown_usage++;throw Error('S60 provider failure: '+String(e?.message??e).slice(0,140));}
   if(res?.usage)ledger.known_estimated_usd=+(ledger.known_estimated_usd+usageCost(res.usage)).toFixed(9);else if(!deps.invoke){ledger.unknown_usage++;throw Error('S60 provider usage missing; stop');}
   if(ledger.known_estimated_usd>o.budget)throw Error('S60 estimated cost exceeded budget; stop (not a billing cap)');
   answer=typeof res?.raw==='string'?parseResult(res.raw,role):clone(res);
  }
  return answer;
 };
 for(const c of cases){
  const packets={};for(const role of roles)packets[role]=await retrievalPacket(f,c,{role,method:o.retrieval,explore:o.explore==='force',semanticUrl:o.semanticUrl,semanticTransport:deps.semanticTransport});
  const review=privateRubricForReview(c.case_id); // After packet creation; never included in any model input.
  for(const version of versions){
   const record={case_id:c.case_id,focus_topic_id:c.focus_topic_id,scenario_kind:c.scenario_kind,learner_id:c.learner_id,prompt_version:version,roles:{},research_review:{suggested_relationship_stance:review.suggested_relationship_stance,not_ground_truth:true,manual_review_questions:review.manual_review_questions}};
   for(const role of roles){
    let packet=packets[role],data=modelInput(f,c,packet,role),inputJSON=JSON.stringify(data);
    const privateLeak=s=>s.includes('researcher_hypothesis_not_ground_truth')||s.includes('suggested_relationship_stance')||s.includes('knowledge_state')||s.includes('manual_review_questions');
    if(privateLeak(inputJSON))throw Error('Private evaluator contamination');
    let output=await doCall(role,data,version),expansion=null;
    const request=role==='A'?output.request_more_context:output.context_request;
    if(o.explore==='on'&&typeof request?.scope==='string'&&request.scope&&typeof (request.why??request.reason)==='string'&&(request.why??request.reason)){
     const wider=await retrievalPacket(f,c,{role,method:o.retrieval,explore:true,semanticUrl:o.semanticUrl,semanticTransport:deps.semanticTransport});
     if(wider.context.coverage.included_observation_ids.join('|')!==packet.context.coverage.included_observation_ids.join('|')){
      expansion={scope:request.scope,reason:request.why??request.reason,first_pass:output,initial_ids:packet.context.coverage.included_observation_ids};
      packet=wider;data={...modelInput(f,c,packet,role),requested_expansion_reason:expansion.reason,requested_expansion_scope:expansion.scope};
      if(privateLeak(JSON.stringify(data)))throw Error('Private evaluator contamination in expansion');
      output=await doCall(role,data,version);
     }
    }
    const checked=validateOutput(role,output,f,c,packet),ids=packet.context.coverage.included_observation_ids;
    const hits=(keys)=>keys.filter(x=>ids.includes(x)).length;
    record.roles[role]={latest_observation_id:c.latest_observation.id,expansion,context:{included_ids:ids,context_bytes:packet.metrics.context_bytes,ranking:packet.metrics.lexical_ranking},evaluation:{anchor_recall_fraction:review.candidate_cross_domain_evidence_ids.length?+(hits(review.candidate_cross_domain_evidence_ids)/review.candidate_cross_domain_evidence_ids.length).toFixed(3):null,contradiction_recall_fraction:review.contradiction_or_control_ids.length?+(hits(review.contradiction_or_control_ids)/review.contradiction_or_control_ids.length).toFixed(3):null, ...checked},model_output:output};
    // A-only vs optional C ablation only for ACTUAL unresolved proposed identity and supplied candidate evidence.
    if(role==='A'&&o.c==='auto'&&o.mode==='model'&&checked.provisional_proposals.some(x=>x.type==='root'&&x.action==='propose')&&c.provisional_roots.length){
     const p=checked.provisional_proposals.find(x=>x.type==='root'&&x.action==='propose');
     const cRes=await doCall('C',{new_hypothesis:p,prior_candidates:c.provisional_roots,evidence:packet.context.observations},version);
     try{record.roles.A.optional_c=validateC(cRes,c.provisional_roots,packet.context.observations);}catch(e){record.roles.A.optional_c={decision:'uncertain',invalid_response:String(e.message).slice(0,120)};}
    }
   }
   trace.runs.push(record);
  }
 }
 const perRole=trace.runs.flatMap(r=>Object.entries(r.roles).map(([role,v])=>({role,...v.evaluation}))),mean=xs=>xs.length?+(xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(3):null;
 trace.summary={cases:cases.length,outputs:perRole.length,role_counts:{A:perRole.filter(x=>x.role==='A').length,B:perRole.filter(x=>x.role==='B').length},average_anchor_recall:mean(perRole.map(x=>x.anchor_recall_fraction).filter(x=>x!==null)),average_contradiction_recall:mean(perRole.map(x=>x.contradiction_recall_fraction).filter(x=>x!==null)),invalid_reference_events:perRole.reduce((n,x)=>n+(x.invalid_references??0),0),model_calls:ledger.calls,provisional_only:true,db_writes:0,authoritative_memory_writes:0};
 return trace;
}
export function saveReport(t){
 const base=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b60');fs.mkdirSync(base,{recursive:true});
 const dir=path.join(base,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));fs.mkdirSync(dir);
 fs.writeFileSync(path.join(dir,'trace.json'),JSON.stringify(t,null,2)+'\n',{flag:'wx',mode:0o600});
 const lines=['S60 RESEARCH A/B ABLATION | ZERO DATABASE WRITES','OPTIONS '+JSON.stringify(t.options),'SUMMARY '+JSON.stringify(t.summary),'COST '+JSON.stringify(t.cost),'PRIVATE CURATOR RUBRICS ARE NOT GROUND TRUTH','MODEL OUTPUTS HAVE NOT BEEN SCIENTIFICALLY CERTIFIED'];
 for(const x of t.runs){lines.push('',x.case_id+' '+x.prompt_version+' ['+x.scenario_kind+']');for(const [role,v] of Object.entries(x.roles))lines.push(role+' retrieved: '+JSON.stringify(v.context.included_ids),role+' evaluation: '+JSON.stringify(v.evaluation),role+' model: '+JSON.stringify(v.model_output));}
 fs.writeFileSync(path.join(dir,'READABLE_REVIEW.txt'),lines.join('\n')+'\n',{flag:'wx',mode:0o600});return dir;
}
async function main(){const o=parseArgs(process.argv.slice(2));if(o.help){console.log('S60 offline: node scripts/sandbox/learning-intelligence/s16b60-benchmark.mjs --mode offline --limit 30 --prompt compare --retrieval lexical');console.log('S60 paid: --mode model --limit 4 --role both --prompt compare --retrieval lexical --allow-spend --budget-usd 0.40');console.log('Optional local embeddings: --retrieval semantic|mixed (start services.embeddings.app first).');return;}const r=await runBenchmark(o);const dir=saveReport(r);console.log('S60 BENCHMARK COMPLETE | NO DB WRITES');console.log('SUMMARY '+JSON.stringify(r.summary));console.log('COST '+JSON.stringify(r.cost));console.log('REPORT '+dir);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S60 STOP: '+String(e?.message??e).slice(0,320));process.exitCode=1;});
