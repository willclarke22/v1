#!/usr/bin/env node
/** S59: lean replacement RESEARCH pathway, not a modification of production Learning Space. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {loadFixture,scenarioForFixture} from './s16b58-fixture.mjs';
import {MODEL,RATE,credentials,callProvider,usageCost} from './s16b54-models.mjs';
import {PROMPTS,SCHEMAS,publicSeed,record,contextSlice,validateA,validateC,makeRequest,parseResult,scriptedMock,hash} from './s16b59-lean-core.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const clone=x=>JSON.parse(JSON.stringify(x));
export function args(argv){
 const out={mode:'offline',learner:'scripted',learnerId:'LEARNER-A',trialId:'T01',limit:4,c:'auto',explore:'on',probeId:null,allowSpend:false,budget:null,help:false};
 const valid=new Set(['--mode','--learner','--learner-id','--trial-id','--limit','--c','--explore','--probe-id','--budget-usd']);
 for(let i=0;i<argv.length;i++){const k=argv[i];if(k==='--help'){out.help=true;continue;}if(k==='--allow-spend'){out.allowSpend=true;continue;}if(!valid.has(k)||!argv[i+1])throw Error('Unknown/missing option: '+k);const v=argv[++i];if(k==='--learner-id')out.learnerId=v;else if(k==='--trial-id')out.trialId=v;else if(k==='--probe-id')out.probeId=v;else if(k==='--budget-usd')out.budget=Number(v);else if(k==='--limit')out.limit=Number(v);else out[k.slice(2)]=v;}
 if(!['offline','model'].includes(out.mode)||!['scripted','model'].includes(out.learner)||!['off','on'].includes(out.explore)||!['off','auto'].includes(out.c)||!Number.isInteger(out.limit)||out.limit<1||out.limit>12)throw Error('Invalid run options');
 if(out.mode==='offline'&&(out.learner!=='scripted'||out.allowSpend||out.budget!==null))throw Error('Offline run forbids paid flags');
 if(out.mode==='model'&&(!out.allowSpend||!Number.isFinite(out.budget)||out.budget<0.10||out.budget>1.5))throw Error('Paid runs require --allow-spend --budget-usd 0.10..1.50');
 return out;
}
function git(dir,...argv){return execFileSync('git',['-C',dir,...argv],{encoding:'utf8',timeout:12000}).trim();}
function paidGate(){
 if(path.basename(ROOT).toLowerCase()!=='v1-learning-experiment'||git(ROOT,'branch','--show-current')!=='myway/learning-sandbox-v3_7a')throw Error('Refusing paid call outside isolated experiment branch');
 const orig=path.join(path.dirname(ROOT),'v1');if(git(orig,'branch','--show-current')!=='main'||git(orig,'rev-parse','--verify','HEAD^{commit}')!=='462a7a4b6ce8b2b20a91021acca716307f4aa2d1')throw Error('Original main changed');
 const receipt=path.join(ROOT,'scripts/sandbox/v37d2c7a3s16b59/installation.json');if(!fs.existsSync(receipt))throw Error('Missing S59 guarded installation');
 if(process.env.VERCEL==='1'||process.env.CI==='true'||process.env.NODE_ENV==='production')throw Error('Cloud provider calls forbidden');
}
function eligible(a){return Array.isArray(a)&&a.length>0;}
function cleanState(s){return {topics_available:s.topics.length,observations:s.obs.length,roots:s.roots.length,relationships:s.relationships.length,new_proposals:s.proposals.length,explicit_instructions:s.explicit_instructions.length};}
function sampleReply(response){return typeof response?.reply==='string'?response.reply.slice(0,4000):null;}
function actualProbe(curated,id){if(!id)return null;const p=curated.probes.find(x=>x.probe_id===id);if(!p||p.supports_diagnostic_inference!==true)throw Error('Unapproved probe ID');return {probe_id:p.probe_id,topic_id:p.topic_id,type:p.type,response_mode:p.response_mode,public_task:p.prompt,scene_id:p.scene_id??null,validity_status:'curated_public_contract_not_automatically_scientifically_verified'};}
function contextForA(state,text,currentId,step,explore=false){return {latest_observation_id:currentId,latest_message:text,previous_dialogue:state.dialogue.slice(-4),context:contextSlice(state,text,{role:'A',explore,turn:step}),task_conditions:{synthetic:true,independent_transfer_test:false,hints_given:'not_recorded',observed_after_tutoring:step>1},tools_available:['request_more_context','explore_history']};}
function contextForB(state,text,step){const advisory=state.lastAssessment&&state.lastAssessment.turn===step-1?state.lastAssessment:null;return {latest_message:text,recent_dialogue:state.dialogue.slice(-4),context:contextSlice(state,text,{role:'B',turn:step}),previous_model_a_advisory:advisory,tools_available:['request_more_context'],research_only:true};}
function keepRecord(x){return clone(x);}
export async function runLean(options,deps={}){
 const fixture=deps.fixture??loadFixture(options.learnerId,options.trialId);
 // No-prior-roots condition is enforced BEFORE either tutor or assessor sees state.
 if(fixture.trial.condition==='history_without_prior_root_hypotheses')fixture.learner.provisional_root_hypotheses=[];
 const state=publicSeed(fixture);const scenario=scenarioForFixture(fixture),steps=scenario.sessions.flatMap(s=>s.steps).slice(0,options.limit);
 const ledger={calls:0,byRole:{A:0,B:0,C:0,L:0},known_estimated_usd:0,unknown_usage:0,not_invoice:true};
 const maxCalls=4*steps.length+(options.probeId?4:0)+2;
 const admission=+(maxCalls*((12500*RATE.input+1400*RATE.output)/1e6)).toFixed(4);
 if(options.mode==='model'&&admission>options.budget)throw Error('Conservative admission estimate '+admission+' exceeds budget '+options.budget+' (not hard cap)');
 if(options.mode==='model'&&!deps.invoke)paidGate();
 const auth=options.mode==='model'&&!deps.invoke?credentials():null;
 const trace={schema:'myway_s16b59_lean_research_v1',source:'SYNTHETIC_NOT_REAL_LEARNER',mode:options.mode,parameters:{...options,allowSpend:options.allowSpend},fixture_id:fixture.learner.learner_id,trial_condition:fixture.trial.condition,public_context:{available_topics:state.topics.length,available_curriculum_links:state.links.length,seeded_observations:state.obs.length,seeded_roots:state.roots.length,seeded_learner_relationships:state.relationships.length,private_learner_truth_exposed:false},events:[],probe:null,proposals:[],summary:null,cost:ledger,limits:['The S59 research pathway is not connected to live Learning Space or its database','Offline examples test contracts, not intelligence','Model-generated synthetic learners do not establish human learning efficacy','Similarity/graph retrieval only proposes evidence; models interpret','All hypotheses remain provisional; no authoritative memory writes']};
 async function invoke(role,data){
  if(options.mode==='offline')return clone((deps.mock??scriptedMock)(role,data));
  const payload=makeRequest(role,data);ledger.calls++;ledger.byRole[role]++;
  let result;
  try{result=deps.invoke?await deps.invoke(role,clone(data),payload):await callProvider(payload,auth);}catch(e){ledger.unknown_usage++;throw Error('Provider/model transport error; unknown usage: '+String(e?.message??e).slice(0,140));}
  if(!deps.invoke){try{ledger.known_estimated_usd=+(ledger.known_estimated_usd+usageCost(result.usage)).toFixed(8);}catch{ledger.unknown_usage++;throw Error('Unknown token usage, stop');}}
  else if(result?.usage)ledger.known_estimated_usd=+(ledger.known_estimated_usd+usageCost(result.usage)).toFixed(8);
  if(options.budget!==null&&ledger.known_estimated_usd>options.budget)throw Error('Estimated spend exceeded admission budget; stop (not invoice cap)');
  return typeof result?.raw==='string'?parseResult(result.raw,role):clone(result);
 }
 let previousReply=null;
 for(let i=0;i<steps.length;i++){
  const step=steps[i],eid='N-'+(i+1);let learner=step.learner;
  if(options.mode==='model'&&options.learner==='model'&&previousReply){
   // PRIVATE state exists ONLY in Model L request. We do not persist its request in the trace.
   const l=await invoke('L',{visible_tutor_reply:previousReply,dialogue:state.dialogue.slice(-3),private_synthetic_character:{knowledge_state:fixture.privateSimulator.knowledge_state,response_generation_constraints:fixture.privateSimulator.response_generation_constraints},goal_not_answer_key:step.aim});
   learner=l.learner_message;
  }
  if(typeof learner!=='string'||learner.length>1800||!learner.trim())throw Error('Invalid synthetic learner output');
  const observed=record(state,eid,learner,{source:'synthetic_utterance',topic_id:null,context:{turn:i+1}});
  const bContext=contextForB(state,learner,i+1);
  let b=await invoke('B',bContext);
  if(b.context_request?.scope&&b.context_request?.reason){
   const wider=contextSlice(state,learner,{role:'B',explore:true,turn:i+1});
   if(wider.coverage.included_observation_ids.join('|')!==bContext.context.coverage.included_observation_ids.join('|'))b=await invoke('B',{...bContext,context:wider,lookup_reason:b.context_request.reason});
  }
  if(!sampleReply(b))throw Error('Model B empty reply');previousReply=b.reply;
  // The assessor sees the learner utterance and preceding dialogue, not B's current answer.
  const aContext=contextForA(state,learner,eid,i+1,false);
  let a=await invoke('A',aContext);let broadened=false;
  if(options.explore==='on'&&a.request_more_context?.scope&&a.request_more_context?.why){
   const wider=contextForA(state,learner,eid,i+1,true);if(wider.context.coverage.included_observation_ids.join('|')!==aContext.context.coverage.included_observation_ids.join('|')){a=await invoke('A',{...wider,requested_expansion_reason:a.request_more_context.why});broadened=true;}
  }
  const visibleContext=broadened?contextForA(state,learner,eid,i+1,true):aContext;
  const checked=validateA(a,state,new Set(visibleContext.context.coverage.included_observation_ids));for(const e of checked.explicit_instructions)if(!state.explicit_instructions.some(x=>x.evidence_id===e.evidence_id&&x.instruction===e.instruction))state.explicit_instructions.push(e);const events=[];
  for(const p of checked.proposals){
   let identity=null;
   if(options.c==='auto'&&['root','relationship'].includes(p.type)&&p.action==='propose'){
    const candidateContext=contextSlice(state,p.type==='root'?p.reason:p.learner_pattern,{role:'A',explore:false,turn:i+1});
    const candidates=(p.type==='root'?candidateContext.roots:candidateContext.relationships).slice(0,4);
    if(!candidates.length)identity={decision:'uncertain',status:'candidate_retrieval_incomplete_not_new_identity'};
    else {const c=await invoke('C',{new_hypothesis:p,prior_candidates:candidates,evidence:contextSlice(state,p.reason||p.learner_pattern||'',{role:'A',explore:false,turn:i+1}).observations});try{identity=validateC(c,candidates,state.obs);}catch(e){identity={decision:'uncertain',status:'invalid_model_C_held',reason:String(e.message).slice(0,120)};}}
   }
   const proposal={...p,identity_review:identity,source_turn:eid,candidate_causes:p.type==='root'?clone(a.possible_underlying_causes):[]};events.push(proposal);state.proposals.push(proposal);
  }
  state.lastAssessment={turn:i+1,presenting_difficulty:a.presenting_difficulty,observed_understanding:a.observed_understanding,next_probe:a.next_probe,overall_uncertainty:a.overall_uncertainty,not_a_diagnosis:true};
  state.dialogue.push({turn_id:eid,learner,reply:b.reply});
  trace.events.push({turn_id:eid,learner_observation:observed,model_b:{reply:b.reply,probe_offer:b.probe_offer},model_a:keepRecord(a),context_b:{ids:bContext.context.coverage.included_observation_ids,topics:bContext.context.topics.map(t=>t.id),roots:bContext.context.roots.map(x=>x.id),relationships:bContext.context.relationships.map(x=>x.id),bytes:Buffer.byteLength(JSON.stringify(bContext))},context_a:{ids:aContext.context.coverage.included_observation_ids,expanded:broadened,bytes:Buffer.byteLength(JSON.stringify(aContext))},validation:checked.checks,proposals:events});
 }
 if(options.probeId){
  const probe=actualProbe(fixture,options.probeId);
  // The task is public to L/B/A. No answer key or private rubric is passed.
  const response=options.mode==='model'&&options.learner==='model'?(await invoke('L',{visible_probe:probe,prior_tutor_message:previousReply,private_synthetic_character:{knowledge_state:fixture.privateSimulator.knowledge_state,response_generation_constraints:fixture.privateSimulator.response_generation_constraints}})).learner_message:(deps.probeResponse??'I am not sure; I would like to explain my current thinking before seeing feedback.');
  if(typeof response!=='string'||response.length>1800)throw Error('Invalid probe response');
  const obs=record(state,'P-1',response,{source:'synthetic_probe_response',topic_id:probe.topic_id,context:{probe_id:probe.probe_id,answer_visible_before_attempt:false,scoring:'unscored_open_text_not_automatically_correct'}});
  const a=await invoke('A',{...contextForA(state,response,obs.id,steps.length+1,false),probe,task_conditions:{synthetic:true,probe_validity:'curated_only_not_scientifically_certified',scoring:'free_text_unscored',prior_tutor_answer_may_have_primed_response:true}});
  const checked=validateA(a,state,new Set(contextForA(state,response,obs.id,steps.length+1,false).context.coverage.included_observation_ids));for(const e of checked.explicit_instructions)if(!state.explicit_instructions.some(x=>x.evidence_id===e.evidence_id&&x.instruction===e.instruction))state.explicit_instructions.push(e);
  const b=await invoke('B',{...contextForB(state,response,steps.length+1),probe,interpretation_advisory:a,task_result:'unscored_response',mode:'feedback_after_probe'});
  trace.probe={public_probe:probe,observation:obs,interpretation:a,validation:checked.checks,proposals:checked.proposals.map(x=>({...x,source_turn:'P-1'})),next_tutor_reply:b.reply,scientific_correctness:'not_independently_established',status:'attempt_recorded_no_mastery_claim'};
  state.proposals.push(...trace.probe.proposals);
 }
 trace.proposals=clone(state.proposals);
 trace.summary={turns:trace.events.length,initial_topics:trace.public_context.available_topics,initial_roots:trace.public_context.seeded_roots,initial_relationships:trace.public_context.seeded_learner_relationships,observations:state.obs.length,proposed_roots:state.proposals.filter(p=>p.type==='root').length,proposed_learner_relationships:state.proposals.filter(p=>p.type==='relationship').length,proposed_teaching_effects:state.proposals.filter(p=>p.type==='teaching_effect').length,probing:trace.probe?.status??'not_administered',db_writes:0,authoritative_memory_writes:0};
 return trace;
}
export function saveReport(trace){
 const dir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b59',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));fs.mkdirSync(dir,{recursive:true});
 const sanitized={...trace,parameters:{...trace.parameters,budget:trace.parameters.budget}};
 fs.writeFileSync(path.join(dir,'trace.json'),JSON.stringify(sanitized,null,2)+'\n',{flag:'wx',mode:0o600});
 const lines=['S59 LEAN RESEARCH | NO DATABASE WRITES','CONFIG: '+JSON.stringify(trace.parameters),'SUMMARY: '+JSON.stringify(trace.summary),'COST: '+JSON.stringify(trace.cost),'NO INFERENCE IS VERIFIED ROOT TRUTH'];
 for(const e of trace.events)lines.push('','TURN '+e.turn_id,'LEARNER: '+e.learner_observation.text,'MODEL B: '+e.model_b.reply,'MODEL A: '+JSON.stringify(e.model_a),'PROVISIONAL ACTIONS: '+JSON.stringify(e.proposals),'RETRIEVED: '+JSON.stringify({B:e.context_b,A:e.context_a}));
 if(trace.probe)lines.push('','PROBE: '+trace.probe.public_probe.public_task,'RESPONSE: '+trace.probe.observation.text,'MODEL A: '+JSON.stringify(trace.probe.interpretation),'MODEL B: '+trace.probe.next_tutor_reply);
 fs.writeFileSync(path.join(dir,'READABLE_REVIEW.txt'),lines.join('\n')+'\n',{flag:'wx',mode:0o600});
 return dir;
}
async function main(){const o=args(process.argv.slice(2));if(o.help){console.log('S59 lean research: --mode offline --learner-id LEARNER-A --trial-id T01 --limit 4 [--probe-id BIO01-P1]. Paid: --mode model --learner model --allow-spend --budget-usd 0.40. Research-only, no DB writes.');return;}
 const t=await runLean(o);const dir=saveReport(t);console.log('S59 LEAN RESEARCH COMPLETE; NO DB WRITES');console.log('SUMMARY '+JSON.stringify(t.summary));console.log('COST '+JSON.stringify(t.cost));console.log('REPORT '+dir);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S59 STOP: '+String(e?.message??e).slice(0,280));process.exitCode=1;});
