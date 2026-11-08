#!/usr/bin/env node
/** S1.6B.5.4 unified learning journey. Offline = author-scripted A/B + lexical C.
 * Paid model mode = real GPT-4.1 mini A/B/C research roles, read-only; NO live database or Learning Space writes.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {newState,SCHEMA,assessGuard,candidateRoots,teachingContext,memoryDecisionGuard,safeMemoryProposal,relationshipProposals,visualProposal,projection} from './s16b54-core.mjs';
import {MODEL,requestA,requestB,requestC,offlineA,offlineB,offlineC,validatedJson,validateReply,A_SCHEMA,C_SCHEMA,credentials,callProvider,usageCost,RATE} from './s16b54-models.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));const ROOT=path.resolve(HERE,'../../..');
const SEED=path.join(HERE,'s16b54-journey-seed.json');const STAGE='v37d2c7a3s16b54';
export function loadSeed(){const seed=JSON.parse(fs.readFileSync(SEED,'utf8'));
 if(seed.schema!=='myway_s16b54_synthetic_journey_v1'||seed.privacy_class!=='synthetic_example_only'||seed.source!=='researcher_authored_no_real_learners')throw Error('Unapproved journey seed');
 const all=seed.sessions.flatMap(s=>s.turns);if(all.length!==12||new Set(all.map(t=>t.id)).size!==12||all.some(t=>typeof t.learner!=='string'||t.learner.length>1800||typeof t.offline_reply!=='string'))throw Error('Unexpected synthetic scenario set');
 return seed;
}
export function parseArgs(argv){const o={mode:'offline',limit:null,personalization:'off',budget:null,allowSpend:false,help:false};
 for(let i=0;i<argv.length;i++){let k=argv[i];if(k==='--help'){o.help=true;continue;}if(k==='--allow-spend'){o.allowSpend=true;continue;}
  if(!['--mode','--limit','--personalization','--budget-usd'].includes(k))throw Error('Unsupported flag '+k);
  if(i+1>=argv.length)throw Error('Missing '+k+' value');const v=argv[++i];if(k==='--mode')o.mode=v;else if(k==='--limit')o.limit=Number(v);else if(k==='--personalization')o.personalization=v;else o.budget=Number(v);
 }
 if(!['offline','model'].includes(o.mode)||!['off','explicit'].includes(o.personalization))throw Error('Unsupported mode or personalization');
 if(o.limit===null)o.limit=o.mode==='offline'?12:3;if(!Number.isInteger(o.limit)||o.limit<1||o.limit>(o.mode==='offline'?12:6))throw Error('Limit out of allowed range');
 if(o.mode==='offline'&&(o.allowSpend||o.budget!==null))throw Error('Offline mode refuses spending flags');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<0.06||o.budget>0.60))throw Error('Model mode requires --allow-spend --budget-usd 0.06..0.60');
 return o;
}
export function admissionEstimate(limit){const maxCalls=limit*3;return Number(((maxCalls+1)*(12000*RATE.input+550*RATE.output)/1e6).toFixed(6));}
function checkRoot({paid=false}={}){
 if(path.basename(ROOT).toLowerCase()!=='v1-learning-experiment')throw Error('Wrong experimental worktree');
 const git=(folder,...args)=>execFileSync('git',['-C',folder,...args],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();
 if(git(ROOT,'branch','--show-current')!=='myway/learning-sandbox-v3_7a')throw Error('Wrong experiment branch');
 const orig=path.join(path.dirname(ROOT),'v1');if(git(orig,'branch','--show-current')!=='main'||git(orig,'rev-parse','--verify','HEAD^{commit}')!=='462a7a4b6ce8b2b20a91021acca716307f4aa2d1')throw Error('Original main checkpoint differs');
 if(JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8')).release!=='v37d2c7a3s12')throw Error('Experimental release changed');
 for(const s of ['s16b53','s16b54'])if(!fs.existsSync(path.join(ROOT,`scripts/sandbox/v37d2c7a3${s}/installation.json`)))throw Error('Missing installed stage '+s);
 if(paid&&(process.env.VERCEL==='1'||process.env.CI==='true'||process.env.NODE_ENV==='production'))throw Error('Paid research denied in CI/cloud/production');
}
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
export async function runJourney(options,{rootCheck=true,send=callProvider,cred=credentials,seed=loadSeed()}={}){
 if(rootCheck)checkRoot({paid:options.mode==='model'});
 const state=newState(seed);const turns=seed.sessions.flatMap(s=>s.turns.map(t=>({...t,session_id:s.id,session_label:s.label}))).slice(0,options.limit);
 const admission=admissionEstimate(turns.length);if(options.mode==='model'&&admission>options.budget+1e-12)throw Error('Admission budget insufficient; need at least $'+admission.toFixed(5)+' (NOT a billing cap)');
 const ctx=options.mode==='model'?cred():null;
 const ledger={attemptedCalls:0,byRole:{A:0,B:0,C:0},knownEstimatedUsd:0,unknownOrIncompleteCalls:0,complete:true,admissionBudgetUsd:options.budget,conservativeAdmissionEstimateUsd:admission,notInvoice:true};
 const trace={schema:SCHEMA,mode:options.mode,model:options.mode==='model'?MODEL:'OFFLINE_SCRIPTED',source:'synthetic_research_not_real_learners',personalization:options.personalization,events:[],sessions:[],state:null,projection:null,cost:ledger,limitations:['Scripted learner messages do not adapt to Model B responses','Offline A/B are human-authored, C is lexical; no evidence of real-model quality','Model mode uses GPT-4.1 mini for all three research roles, not the production adapters','All memory and graph state is LOCAL, PROVISIONAL, and NOT persisted','Visuals are proposed metadata only, not rendered']};
 async function invoke(role,payload){ledger.attemptedCalls++;ledger.byRole[role]++;let res;try{res=await send(payload,ctx,role);}catch(e){ledger.unknownOrIncompleteCalls++;ledger.complete=false;throw Error(role+' transport STOP: '+String(e?.message??e).slice(0,220));}
  let cost;try{cost=usageCost(res.usage);}catch(e){ledger.unknownOrIncompleteCalls++;ledger.complete=false;throw Error(role+' usage STOP: '+String(e?.message??e));}
  ledger.knownEstimatedUsd=Number((ledger.knownEstimatedUsd+cost).toFixed(9));return {...res,cost};
 }
 let currentSession=null;
 for(const t of turns){
  if(t.session_id!==currentSession){currentSession=t.session_id;state.sessions.push({id:currentSession,label:t.session_label});}
  const entry={id:t.id,session_id:t.session_id,learner:t.learner,assessment:null,model_a_status:null,reply:null,model_b_status:null,model_c:null,model_c_status:null,model_a_request:null,model_b_context:null,model_c_request:null,candidate_roots:[],memory_action:null,relationships:[],visual:null,quality_review_required:true,stop:null};
  trace.events.push(entry);
  try{
   let a;
   if(options.mode==='offline'){a=offlineA(t);entry.model_a_status='OFFLINE_AUTHOR_SCRIPT_NOT_MODEL_A';}
   else{const req=requestA(state,t.learner);entry.model_a_request=req.messages;const resp=await invoke('A',req);
    try{const parsed=validatedJson(resp.raw,A_SCHEMA);a=assessGuard({...parsed,source:'MODEL_A_RESEARCH_GPT41MINI'},t.learner);entry.model_a_status='PROVIDER_VALIDATED_UNSCORED';}
    catch(e){a=null;entry.model_a_status='HELD_INVALID_MODEL_A';entry.model_a_validation_error=String(e?.message??e).slice(0,220);}
   }
   entry.assessment=a;
   const teaching=teachingContext(state,t.learner,a,{personalization:options.personalization,seedProfile:seed.profile});entry.model_b_context=teaching.messages;entry.candidate_roots=candidateRoots(state,a,t.learner);
   let reply;if(options.mode==='offline'){reply=offlineB(t);entry.model_b_status='OFFLINE_AUTHOR_SCRIPT_NOT_MODEL_B';}
   else{const resp=await invoke('B',requestB(teaching));reply=validateReply(resp.raw);entry.model_b_status='PROVIDER_VALIDATED_UNSCORED';}
   entry.reply=reply;
   // Conversation continuity never depends on the Model C decision.
   state.turns.push({id:t.id,session_id:t.session_id,learner:t.learner,reply,model_b_source:entry.model_b_status});
   let c=null;
   if(a?.uncertainty==='high'){entry.model_c_status='SKIPPED_ASSESSMENT_HIGH_UNCERTAINTY';}
   else if(a?.root_problem&&a.evidence_quote&&['new_or_continuing_difficulty','question_or_followup'].includes(a.kind)){
    if(!entry.candidate_roots.length){c={identity:'distinct',anchor_id:null,rationale:'No eligible historical candidate: local provisional hypothesis only'};entry.model_c_status='SKIPPED_NO_ELIGIBLE_HISTORY';}
    else if(options.mode==='offline'){c=offlineC(a,entry.candidate_roots);entry.model_c_status='OFFLINE_LEXICAL_NOT_MODEL_C';}
    else{const req=requestC(a,entry.candidate_roots,t.learner);entry.model_c_request=req.messages;const resp=await invoke('C',req);
     try{c=memoryDecisionGuard(validatedJson(resp.raw,C_SCHEMA),entry.candidate_roots);entry.model_c_status='PROVIDER_VALIDATED_UNSCORED';}
     catch(e){c=null;entry.model_c_status='HELD_INVALID_MODEL_C';entry.model_c_validation_error=String(e?.message??e).slice(0,220);}
    }
   }else entry.model_c_status='SKIPPED_NOT_A_NEW_MEMORY_IDENTITY_DECISION';
   // Even a C SAME decision cannot silently relink different topics.
   if(c?.identity==='same'){
    const anchor=entry.candidate_roots.find(x=>x.id===c.anchor_id);
    if(anchor&&!anchor.topicMatched){c={identity:'uncertain',anchor_id:null,rationale:'Independent cross-topic identity gate: proposal held for review'};entry.model_c_status='CROSS_TOPIC_HOLD';}
   }
   entry.model_c=c;
   entry.memory_action=safeMemoryProposal(state,t,a,entry.candidate_roots,c);
   entry.relationships=relationshipProposals(state,t,a);
   entry.visual=visualProposal(state,t,a);
   state.audit.push({turn:t.id,model_a:entry.model_a_status,model_b:entry.model_b_status,model_c:entry.model_c_status,memory:entry.memory_action.status,relations:entry.relationships.length,visual:!!entry.visual});
  }catch(e){entry.stop=String(e?.message??e).slice(0,250);state.audit.push({turn:t.id,stopped:true,reason:entry.stop});break;}
 }
 trace.state=state;trace.projection=projection(state);
 trace.summary={processed:state.turns.length,attempted:turns.length,stopped:trace.events.some(e=>e.stop),topics:state.topics.length,provisional_roots:state.roots.length,observations:state.evidence.length,relationship_hypotheses:state.relationships.length,visual_proposals:state.visual_proposals.length,sessions_reached:state.sessions.length,live_memory_writes:0,authoritative_memory_writes:0};
 return trace;
}
function report(t){const out=['MYWAY S1.6B.5.4 — UNIFIED LEARNING JOURNEY',`MODE: ${t.mode} | ${t.model} | SYNTHETIC STUDY ONLY`,'Assessment A and memory C are hypotheses; teaching B receives ordered raw conversation and relevant provisional roots.','Not a browser product; not a real learner study; no DB or graph writes.','',`SUMMARY: ${JSON.stringify(t.summary)}`,`COST: ${JSON.stringify(t.cost)}`,''];
 for(const e of t.events){out.push('='.repeat(76),`${e.id} / ${e.session_id}`,'LEARNER: '+e.learner,`MODEL A [${e.model_a_status}]: `+JSON.stringify(e.assessment),`MODEL B [${e.model_b_status}]: `+(e.reply??'[not generated]'),`MODEL C [${e.model_c_status}]: `+JSON.stringify(e.model_c),`MEMORY PROPOSAL: `+JSON.stringify(e.memory_action),`SELECTED ROOTS: `+JSON.stringify(e.candidate_roots.map(r=>({id:r.id,quote:r.first_quote,root:r.root_problem}))),`RELATIONSHIPS (unverified): `+JSON.stringify(e.relationships),`VISUAL (not rendered): `+JSON.stringify(e.visual),'TEACHER CONTEXT: '+(e.model_b_context?'raw conversation; '+e.model_b_context.length+' message objects':'none'),`REVIEW: accuracy [ ] | responsive [ ] | natural [ ] | context preserved [ ] | progress not overclaimed [ ] | visualization useful [ ]`);
  if(e.stop)out.push('STOP: '+e.stop);
 }
 out.push('','FINAL TOPICS: '+JSON.stringify(t.state.topics,null,2),'ROOT PROBLEMS: '+JSON.stringify(t.state.roots,null,2),'PROVENANCE / OBSERVATIONS: '+JSON.stringify(t.state.evidence,null,2),'RELATIONSHIP HYPOTHESES: '+JSON.stringify(t.state.relationships,null,2),'VISUAL PROPOSALS: '+JSON.stringify(t.state.visual_proposals,null,2),'SAFEGUARDS: '+JSON.stringify(t.state.safeguards));
 return out.join('\n')+'\n';}
export function saveReports(t){const dir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b54',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
 fs.mkdirSync(dir,{recursive:true});for(const [n,body] of [['S16B54_UNIFIED_LEARNING_JOURNEY.txt',report(t)],['S16B54_LEARNING_SPACE_PROJECTION.json',JSON.stringify(t.projection,null,2)+'\n'],['S16B54_MEMORY_TIMELINE.json',JSON.stringify({audit:t.state.audit,roots:t.state.roots,evidence:t.state.evidence,relationships:t.state.relationships,safeguards:t.state.safeguards},null,2)+'\n'],['trace.json',JSON.stringify(t,null,2)+'\n']])fs.writeFileSync(path.join(dir,n),body,{flag:'wx',mode:0o600});return dir;}
async function main(){const args=parseArgs(process.argv.slice(2));if(args.help){console.log('Usage: node s16b54-journey.mjs --mode offline --limit 12 [--personalization explicit]; paid: --mode model --limit 3 --allow-spend --budget-usd 0.12 (uses GPT-4.1 mini for A/B/C; admission estimate NOT a cap)');return;}
 console.log(`S1.6B.5.4 UNIFIED | ${args.mode} | ${args.limit} synthetic learner turns | personalization=${args.personalization} | DB WRITES=0`);
 if(args.mode==='model')console.log(`PAID OPT-IN: planned max ${(args.limit*3)} calls across research A/B/C; conservative admission $${admissionEstimate(args.limit).toFixed(5)}; admission budget is NOT a billing cap.`);
 const t=await runJourney(args);const dir=saveReports(t);
 for(const e of t.events)console.log(`${e.id} | A=${e.model_a_status} | B=${e.model_b_status} | C=${e.model_c_status} | MEM=${e.memory_action?.status??'none'} | REL=${e.relationships.length} | VIS=${!!e.visual}${e.stop?' | STOP='+e.stop:''}`);
 console.log('REPORT: '+path.join(dir,'S16B54_UNIFIED_LEARNING_JOURNEY.txt'));
 console.log('MEMORY: '+path.join(dir,'S16B54_MEMORY_TIMELINE.json'));
 console.log('SPACE: '+path.join(dir,'S16B54_LEARNING_SPACE_PROJECTION.json'));
 console.log('TRACE: '+path.join(dir,'trace.json'));
 console.log('SUMMARY: '+JSON.stringify(t.summary));console.log('COST: '+JSON.stringify(t.cost));if(t.summary.stopped)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S1.6B.5.4 REFUSED: '+String(e?.message??e).slice(0,250));process.exitCode=1;});
