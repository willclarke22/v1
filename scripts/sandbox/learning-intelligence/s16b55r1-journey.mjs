#!/usr/bin/env node
/** S1.6B.5.5-R1: trace-reviewed evidence, identity and intent hardening, research only.
 * Offline: authored A and B, evidence-aware lexical C. Real-model pilot: opt-in GPT-4.1 mini.
 * No Supabase, browser APIs, graph writes, approved memories, or automatic skill claims.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {assessGuard,candidateRoots,projection} from './s16b54-core.mjs';
import {MODEL,RATE,requestA,requestB,requestC,offlineC,validatedJson,validateReply,A_SCHEMA,credentials,callProvider,usageCost} from './s16b54-models.mjs';
import {C55_SCHEMA,validateScenarios,branchFromReply,researchMemory,evidenceQuality,retrievalDiagnostic} from './s16b55-core.mjs';
import {SCHEMA_R1,newR1State,offlineIdentityR1,protectModelIdentity,snapshotR1,recordTurn,createContextR1,selectiveRelationship,selectiveVisual,r1Summary} from './s16b55r1-core.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));const ROOT=path.resolve(HERE,'../../..');
const STAGE='v37d2c7a3s16b55r1';
export function loadScenarios(){return validateScenarios(JSON.parse(fs.readFileSync(path.join(HERE,'s16b55-scenarios.json'),'utf8')));}
export function parseArgs(argv){
 const o={mode:'offline',limit:null,context:'resumed',allowSpend:false,budget:null,help:false};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--help'){o.help=true;continue;}if(k==='--allow-spend'){o.allowSpend=true;continue;}
  if(!['--mode','--limit','--context','--budget-usd'].includes(k))throw Error('Unknown option '+k);
  if(!argv[i+1])throw Error('Missing '+k);const v=argv[++i];if(k==='--mode')o.mode=v;else if(k==='--context')o.context=v;else if(k==='--limit')o.limit=Number(v);else o.budget=Number(v);
 }
 if(!['offline','model'].includes(o.mode)||!['resumed','full'].includes(o.context))throw Error('Invalid mode or context');
 if(o.limit===null)o.limit=o.mode==='offline'?9:4;
 if(!Number.isInteger(o.limit)||o.limit<1||o.limit>(o.mode==='offline'?9:6))throw Error('Turn limit invalid');
 if(o.mode==='offline'&&(o.allowSpend||o.budget!==null))throw Error('Offline mode refuses paid flags');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<0.06||o.budget>0.60))throw Error('Model mode requires --allow-spend --budget-usd 0.06..0.60');
 return o;
}
export function admissionEstimate(limit){return Number(((limit*3+1)*(12000*RATE.input+650*RATE.output)/1e6).toFixed(6));}
function git(folder,...args){return execFileSync('git',['-C',folder,...args],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();}
export function checkRoot({paid=false}={}){
 if(path.basename(ROOT).toLowerCase()!=='v1-learning-experiment'||git(ROOT,'branch','--show-current')!=='myway/learning-sandbox-v3_7a')throw Error('Not the expected experiment branch/worktree');
 const orig=path.join(path.dirname(ROOT),'v1');
 if(git(orig,'branch','--show-current')!=='main'||git(orig,'rev-parse','--verify','HEAD^{commit}')!=='462a7a4b6ce8b2b20a91021acca716307f4aa2d1')throw Error('Original main HEAD mismatch');
 if(JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8')).release!=='v37d2c7a3s12')throw Error('Release pointer mismatch');
 for(const stage of ['s16b54','s16b55'])if(!fs.existsSync(path.join(ROOT,`scripts/sandbox/v37d2c7a3${stage}/installation.json`)))throw Error('Missing stage receipt '+stage);
 if(paid&&(process.env.VERCEL==='1'||process.env.CI==='true'||process.env.NODE_ENV==='production'))throw Error('No model calls in cloud/CI/production');
}
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
export function requestC55(assessment,candidates,learner){
 const old=requestC(assessment,candidates,learner);
 old.messages[0].content+=' An explicit refinement is a NEW observation that narrows or corrects a known SAME-TOPIC root; only use refinement with a cited exact historical anchor. Refinement is a PROPOSAL, never update a historical root. Respond identity same, distinct, refinement, or uncertain.';
 old.response_format={type:'json_schema',json_schema:{name:'myway_s16b55_C',strict:true,schema:C55_SCHEMA}};
 return old;
}
export async function runStudy(options,{rootCheck=true,scenarios=loadScenarios(),send=callProvider,cred=credentials,teacher=null}={}){
 validateScenarios(scenarios);
 if(rootCheck)checkRoot({paid:options.mode==='model'});
 const available=scenarios.sessions.flatMap(s=>s.steps.map(x=>({...x,session_id:s.id,session_label:s.label}))).slice(0,options.limit);
 const admission=admissionEstimate(available.length);
 if(options.mode==='model'&&admission>options.budget+1e-12)throw Error('Budget admission insufficient; needs at least $'+admission+' (NOT hard invoice cap)');
 const auth=options.mode==='model'?cred():null;
 const state=newR1State(scenarios);
 const ledger={attemptedCalls:0,byRole:{A:0,B:0,C:0},knownEstimatedUsd:0,unknownOrIncompleteCalls:0,complete:true,admissionBudgetUsd:options.budget,conservativeAdmissionEstimateUsd:admission,notInvoice:true,providerCallsDuringInstall:0};
 const trace={schema:SCHEMA_R1,mode:options.mode,model:options.mode==='model'?MODEL:'OFFLINE_AUTHORED',context:options.context,source:'RESEARCHER_AUTHORED_SYNTHETIC_NOT_REAL_LEARNER',limitations:[
  'Finite authored branch rules, not a trained or human-validated learner simulator','Offline tutor and assessment are authored, not measured provider quality','S54 lexical retrieval baseline only; no MiniLM or approved-event vector verification',
  'Snapshot is in-process serialized research memory (not DB recovery); only bounded provenance excerpts, not full past messages','Refinement, identities, root/visual/relationship proposals are never authoritative','No actual imagery, learning effectiveness assessment or real-learner data; identity distinctions use narrow synthetic research rules',
  'Admission estimate is NOT a hard provider billing cap'],events:[],session_boundaries:[],evidence_timeline:[],cost:ledger,state:null,projection:null,summary:null};
 async function invoke(role,payload){
  ledger.attemptedCalls++;ledger.byRole[role]++;
  let response;try{response=await send(payload,auth,role);}catch(e){ledger.complete=false;ledger.unknownOrIncompleteCalls++;throw Error(role+' provider transport/timeout STOP (usage unknown): '+String(e?.message??e).slice(0,160));}
  let cost;try{cost=usageCost(response.usage);}catch(e){ledger.complete=false;ledger.unknownOrIncompleteCalls++;throw Error(role+' provider usage STOP: '+String(e?.message??e).slice(0,160));}
  ledger.knownEstimatedUsd=Number((ledger.knownEstimatedUsd+cost).toFixed(9));return response;
 }
 let lastSession=null,previousReply=null,boundarySnapshot=null;
 for(const step of available){
  if(step.session_id!==lastSession){
   const previousTurnCount=state.turns.length;
   boundarySnapshot=snapshotR1(state);lastSession=step.session_id;previousReply=null;
   trace.session_boundaries.push({session_id:lastSession,serialized_snapshot_schema:boundarySnapshot.schema,previous_tutor_turns_not_in_snapshot:previousTurnCount,
    snapshot_root_ids:boundarySnapshot.roots.map(x=>x.id),snapshot_evidence_count:boundarySnapshot.evidence.length,snapshot_ledger_count:boundarySnapshot.observation_ledger.length,snapshot_unresolved_holds:boundarySnapshot.unresolved_holds.length,snapshot_commitments:boundarySnapshot.conversation_commitments.length,
    old_dialogue_removed_from_resumed_context:options.context==='resumed'});
   state.sessions.push({id:lastSession,label:step.session_label});
  }
  const branch=branchFromReply(step,previousReply);const selected=branch.option;
  const turn={id:step.id,session_id:step.session_id,learner:selected.learner,evidence_kind:selected.evidence_kind};
  const e={id:turn.id,session_id:turn.session_id,learner:turn.learner,selected_branch:selected.key,branch_rule:branch.reason,branch_condition_met:branch.matched,
   previous_tutor_reply_sha256:previousReply?hash(previousReply):null,assessment:null,model_a_status:null,reply:null,model_b_status:null,
   model_c_status:null,model_c:null,memory_action:null,relation_proposals:[],visual_proposal:null,
   retrieval:null,context_audit:null,comparison:null,evidence:null,durable_observation:null,visual_intent:null,identity_warning:null,stop:null,quality_review_required:true};trace.events.push(e);
  try{
   const localSessionTurns=state.turns.filter(t=>t.session_id===turn.session_id);
   const aView={...state,turns:options.context==='resumed'?localSessionTurns:state.turns};
   let assessment=null;
   if(options.mode==='offline'){assessment=assessGuard({...selected.assessment,source:'OFFLINE_AUTHOR_SCRIPT_NOT_MODEL_A'},turn.learner);e.model_a_status='OFFLINE_AUTHOR_SCRIPT_NOT_MODEL_A';}
   else{
    const response=await invoke('A',requestA(aView,turn.learner));
    try{assessment=assessGuard({...validatedJson(response.raw,A_SCHEMA),source:'MODEL_A_GPT41MINI_RESEARCH'},turn.learner);e.model_a_status='PROVIDER_VALIDATED_UNSCORED';}
    catch(err){e.model_a_status='HELD_INVALID_MODEL_A';e.a_error=String(err?.message??err).slice(0,160);}
   }
   e.assessment=assessment;
   const scopedMemory={...boundarySnapshot,topics:state.topics,roots:state.roots,observation_ledger:state.observation_ledger,unresolved_holds:state.unresolved_holds,conversation_commitments:state.conversation_commitments};
   const resumed=createContextR1(state,turn.session_id,turn.learner,assessment,'resumed',{snapshot:scopedMemory});
   const full=createContextR1(state,turn.session_id,turn.learner,assessment,'full');
   const actual=options.context==='resumed'?resumed:full;
   e.context_audit={history_policy:options.context,raw_prior_messages:actual.raw_prior_messages,older_raw_messages_exposed:actual.older_raw_messages_exposed,
    roots_retrieved:actual.selected_roots,quote_provenance_complete:actual.memory_quote_provenance_complete,session_boundary_snapshot:boundarySnapshot.schema,structured_memory:actual.structured_note};
   e.comparison={resumed_raw_prior:resumed.raw_prior_messages,full_raw_prior:full.raw_prior_messages,resumed_older_raw_exposed:resumed.older_raw_messages_exposed,
    full_older_raw_exposed:full.older_raw_messages_exposed,resumed_memory_roots:resumed.selected_roots.map(x=>x.source_turn),
    full_memory_roots:full.selected_roots.map(x=>x.source_turn),model_responses_not_paired_automatically:true};
   e.retrieval=retrievalDiagnostic(state,assessment,turn.learner);
   if(options.mode==='offline'){
    e.reply=typeof teacher==='function'?teacher({step,turn,branch,context:actual,defaultReply:step.offline_reply}):step.offline_reply;
    if(typeof e.reply!=='string'||!e.reply.trim()||e.reply.length>4000)throw Error('Offline teacher must return bounded reply');
    e.model_b_status='OFFLINE_AUTHOR_SCRIPT_NOT_MODEL_B';
   }else{
    const response=await invoke('B',requestB(actual));e.reply=validateReply(response.raw);e.model_b_status='PROVIDER_VALIDATED_UNSCORED';
   }
   previousReply=e.reply;
   state.turns.push({...turn,reply:e.reply,model_b_source:e.model_b_status});
   const candidates=candidateRoots(state,assessment,turn.learner); // memoized history excludes current until root proposal below
   let decision=null;
   if(assessment?.uncertainty==='high')e.model_c_status='SKIPPED_ASSESSMENT_HIGH_UNCERTAINTY';
   else if(assessment?.root_problem&&assessment.evidence_quote&&['new_or_continuing_difficulty','question_or_followup'].includes(assessment.kind)){
    if(!candidates.length){decision={identity:'distinct',anchor_id:null,rationale:'No eligible historical candidate; local proposal only'};e.model_c_status='SKIPPED_NO_HISTORY';}
    else if(options.mode==='offline'){
     decision=offlineIdentityR1(assessment,candidates,turn.learner);e.model_c_status=decision.rule?'OFFLINE_NARROW_DISTINCT_RULE_NOT_MODEL_C':'OFFLINE_LEXICAL_NOT_MODEL_C';
    }else{
     const response=await invoke('C',requestC55(assessment,candidates,turn.learner));
     try{const checked=protectModelIdentity(validatedJson(response.raw,C55_SCHEMA),assessment,candidates,turn.learner);decision=checked.decision;e.identity_warning=checked.warning;e.model_c_status='PROVIDER_VALIDATED_UNSCORED';}
     catch(err){e.model_c_status='HELD_INVALID_MODEL_C';e.c_error=String(err?.message??err).slice(0,160);}
    }
   }else e.model_c_status='SKIPPED_NOT_ROOT_IDENTITY_EVIDENCE';
   e.model_c=decision;
   e.memory_action=researchMemory(state,turn,assessment,candidates,decision);
   e.relation_proposals=selectiveRelationship(state,turn,assessment);
   e.visual_intent=selectiveVisual(state,turn,assessment);e.visual_proposal=e.visual_intent.proposal;
   e.evidence=evidenceQuality(turn,assessment,e.memory_action);trace.evidence_timeline.push(e.evidence);
   e.durable_observation=recordTurn(state,turn,assessment,e.memory_action,{ordinal:trace.events.length,modelAStatus:e.model_a_status,modelBStatus:e.model_b_status,decision});
   state.audit.push({turn:turn.id,branch:selected.key,model_a:e.model_a_status,model_b:e.model_b_status,model_c:e.model_c_status,memory:e.memory_action.status});
  }catch(err){e.stop=String(err?.message??err).slice(0,260);state.audit.push({turn:turn.id,stopped:true,reason:e.stop});break;}
 }
 trace.state=state;trace.projection=projection(state);
 trace.summary={processed:state.turns.length,attempted:available.length,stopped:trace.events.some(e=>!!e.stop),sessions_reached:state.sessions.length,
  resumed_sessions:trace.session_boundaries.filter(x=>x.previous_tutor_turns_not_in_snapshot>0).length,distinct_branch_rules_seen:new Set(trace.events.map(e=>e.branch_rule)).size,
  branch_choices:trace.events.filter(e=>e.branch_condition_met!==null).map(e=>({turn:e.id,selected:e.selected_branch,matched:e.branch_condition_met})),
  roots_provisional:state.roots.length,evidence_observations:trace.evidence_timeline.length,identity_holds:trace.events.filter(e=>e.memory_action?.status?.startsWith('HELD_')).length,
  visual_proposals:state.visual_proposals.length,relationship_hypotheses:state.topic_mechanism_hypotheses.length,root_relationships:state.relationships.length,
  ...r1Summary(state,trace),authoritative_memory_writes:0,db_writes:0,visuals_rendered:0};
 return trace;
}
function textReport(t){const a=['MYWAY S1.6B.5.5-R1 — TRACE-REVIEWED LONGITUDINAL RESEARCH','Mode: '+t.mode+' | History: '+t.context+' | '+t.model,
 'Synthetic learner branch rules; NOT authentic human behavior. Offline A/B scripted; C lexical.','No DB writes, real learning record updates, images, automatic mastery or integration into Learning Space.',
 'SUMMARY: '+JSON.stringify(t.summary),'COST: '+JSON.stringify(t.cost),''];
 for(const e of t.events){a.push('='.repeat(72),`${e.id} | ${e.session_id} | ${e.selected_branch} | rule=${e.branch_rule} match=${e.branch_condition_met}`,
 'LEARNER: '+e.learner,`A [${e.model_a_status}] `+JSON.stringify(e.assessment),`B [${e.model_b_status}] `+(e.reply??'[unavailable]'),`C [${e.model_c_status}] `+JSON.stringify(e.model_c),
 'MEMORY: '+JSON.stringify(e.memory_action),'DURABLE OBSERVATION: '+JSON.stringify(e.durable_observation),'VISUAL INTENT: '+JSON.stringify(e.visual_intent),'RETRIEVAL: '+JSON.stringify(e.retrieval),'RESUMPTION/FULL CONTROL: '+JSON.stringify(e.comparison),
 'EVIDENCE: '+JSON.stringify(e.evidence),'RELATIONSHIP (unverified): '+JSON.stringify(e.relation_proposals),'VISUAL (not rendered): '+JSON.stringify(e.visual_proposal),
 'REVIEW: [ ] scientific accuracy [ ] directness [ ] correction [ ] learner-contingency [ ] confidence calibrated [ ] false merge [ ] useful retrieval [ ] naturalness');
 if(e.stop)a.push('STOP: '+e.stop);
 }
 a.push('', 'SESSION SNAPSHOTS: '+JSON.stringify(t.session_boundaries,null,2),'PROVISIONAL ROOTS: '+JSON.stringify(t.state.roots,null,2),
 'EVIDENCE TIMELINE: '+JSON.stringify(t.evidence_timeline,null,2),'RESUMABLE EVIDENCE LEDGER: '+JSON.stringify(t.state.observation_ledger,null,2),'UNRESOLVED HOLDS: '+JSON.stringify(t.state.unresolved_holds,null,2),'COMMITMENTS: '+JSON.stringify(t.state.conversation_commitments,null,2),'TOPIC-ONLY MECHANISM HYPOTHESES: '+JSON.stringify(t.state.topic_mechanism_hypotheses,null,2),'LIMITATIONS: '+JSON.stringify(t.limitations,null,2));return a.join('\n')+'\n';}
export function saveReports(t){
 const dir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b55r1',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
 fs.mkdirSync(dir,{recursive:true});for(const [file,body] of [['S16B55R1_HARDENED_JOURNEY.txt',textReport(t)],['S16B55R1_EVIDENCE_TIMELINE.json',JSON.stringify(t.evidence_timeline,null,2)+'\n'],
 ['S16B55R1_SESSION_BOUNDARIES.json',JSON.stringify(t.session_boundaries,null,2)+'\n'],['S16B55R1_LEARNING_SPACE_PROJECTION.json',JSON.stringify(t.projection,null,2)+'\n'],['trace.json',JSON.stringify(t,null,2)+'\n']])fs.writeFileSync(path.join(dir,file),body,{flag:'wx',mode:0o600});return dir;
}
async function main(){const options=parseArgs(process.argv.slice(2));if(options.help){console.log('Usage: node s16b55r1-journey.mjs --mode offline --limit 9 --context resumed|full; paid pilot: --mode model --limit 4 --context resumed --allow-spend --budget-usd 0.20 (opt-in, admission estimate is NOT a billing cap)');return;}
 console.log('S1.6B.5.5-R1 research-only | '+JSON.stringify(options)+' | DB writes=0');
 if(options.mode==='model')console.log('Explicit paid pilot planned calls maximum: '+(options.limit*3)+'; admission estimate $'+admissionEstimate(options.limit)+' (NOT hard invoice cap)');
 const t=await runStudy(options);const folder=saveReports(t);
 for(const e of t.events)console.log(`${e.id}: branch=${e.selected_branch}, A=${e.model_a_status}, B=${e.model_b_status}, C=${e.model_c_status}, memory=${e.memory_action?.status??'none'}${e.stop?', STOP='+e.stop:''}`);
 console.log('REPORT: '+path.join(folder,'S16B55R1_HARDENED_JOURNEY.txt'));
 console.log('TRACE: '+path.join(folder,'trace.json'));
 console.log('SUMMARY: '+JSON.stringify(t.summary));console.log('COST: '+JSON.stringify(t.cost));if(t.summary.stopped)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S1.6B.5.5-R1 REFUSED: '+String(e?.message??e).slice(0,280));process.exitCode=1;});
