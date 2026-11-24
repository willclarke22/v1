#!/usr/bin/env node
/** R4.3 HUMAN GOLDLOOP — research-only, isolated A routing -> A evidence -> B narration -> X textual storyboard.
 * - Real provider calls ONLY in --mode model --allow-spend with explicit budget and unique turn-id.
 * - Real localhost MiniLM ONLY; no fake vectors in model mode or silent lexical substitution.
 * - No production routes, asset library, Director, DB, Vercel, or rendering.
 * - Never automatically retry a possibly billable model call; logs include all attempted payloads and raw replies.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';
import {A_SCHEMA,verifyAIsolated,applyA} from './s62bfix1r2-core.mjs';
import {R41_A_PROMPT,PROMPT_SET_VERSION} from './s62bfix1r41-prompts.mjs';
import {retrieveR3} from './s62bfix1r3-retrieval.mjs';
import {localMiniLM} from './s16b60-retrieval.mjs';
import {rankCandidateRoots,pendingExists} from './s62bfix1r45-root-memory.mjs';
import {normalizeTeachingR50,normalizeVisualR50} from './s62bfix1r50-output.mjs';
import {retrieveAndPackR50,focusedRetrievalDecision,makeTeacherInputR50,compactRouteInput} from './s62bfix1r50-context.mjs';

import {B_R46_SCHEMA,B_R46_PROMPT,validateBWithProbe,sceneCatalog,makeSceneContract} from './s62bfix1r46-probe-core.mjs';
import {validateRouteR52,ROUTE_R52_ADDITION} from './s62bfix1r52-route-policy.mjs';
import {ATTEMPT_RE,probeContinuationContext,probeModelEvidence} from './s62bfix1r55-probe-continuation.mjs';
import {B_BRIEF_SCHEMA,sha as activitySha} from './s62bfix1r54-creative-core.mjs';
import {STORY_ACTIVITY_SCHEMA,validateStoryActivity} from './s62bfix1r551-story-core.mjs';
import {callProviderExtended} from './s62bfix1r54r-provider.mjs';
import {STAGE,ROUTE_SCHEMA,B_GOLD_SCHEMA,X_GOLD_SCHEMA,ROUTE_PROMPT,A_GOLD_ADDITION,B_GOLD_PROMPT,X_GOLD_PROMPT,idOK,sha,clone,validateRoute,routeTopic,validateB,validateX,makeObservation,packEvidence,makeTeacherInput,makeXInput,teacherText,traceSummary} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const require=createRequire(import.meta.url);
const ROOT_OUTPUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const VERSION='myway_goldloop_human_v1';
const RUNTIME_VERSION='r551_automatic_dual_visual_story_v1';
const A_R45_MEMORY_POLICY=`\n\nR4.5 LONGITUDINAL ROOT MEMORY (human learner): Current typed root/shared_root records are provisional, not established facts. Inspect their support/counter evidence and the current learner statement. When a specific explanatory mechanism is genuinely supported by cited observations, propose a small, valid create/revise/weaken/retire root memory_decision; do not keep every vague topic-level or motivation-only description as a root. A zero-action response is correct when evidence is insufficient. Do not use embedding cosine score as proof of a shared root. Shared_root requires two distinct learner-specific existing root IDs and DIRECT observations from two topics, with genuine mechanism-level evidence; when uncertain, abstain. Preserve contrasting alternatives, provisional status and historical evidence. A learner's curiosity or positive self-report does not verify independent mastery. An offered B learner_action is NOT an executed or scored probe; interpret a subsequent real learner response as a possible attempt only if the actual text justifies it and disclose any hints/exposure. Use Model A's existing structured memory schema; do not invent IDs, claims or new user facts. B alone chooses whether to offer a probe or natural question.\n`;
const A_R46_PROBE_POLICY=`\nR4.6 REAL PROBE EVIDENCE: Recent probe_attempts are raw browser actions and learner-authored answers, not independently verified conceptual mastery. Interpret the particular task, whether learner skipped/used a hint, the order of action events, and whether it was a placeholder or a genuine interactive simulation. The particular activity may be rendered browser HTML but is not proof of audio or real physical simulation. Never infer a capability from its title alone. A correct-looking option without reason is limited evidence, and probe non-participation is never failure. Do not assert independent mastery solely from an answer or a model-proposed task. When root hypotheses are affected, cite the probe observation ID (ending -IN) in a valid memory_decision and distinguish support vs counterevidence. Do NOT interpret interface exploration, multiple moves or returning to an initial order as an error or working-memory deficit. A visually pre-arranged sequence or repeated instructed order is not independent transfer. Distinguish the model's earlier claims and teaching suggestions from learner-authored source evidence. An X-composed or B-only custom browser experience is sandboxed, has unverified event instrumentation and is unscored, not an objectively executed simulation. Model-generated events such as animations, progress ticks and automatic word highlights are not learner decisions; even browser-bridge origin tags may be spoofed by generated code. A comparison option shown but unchosen is exposure, not completed practice. Look for a discriminating novel action or reasoning before claiming improvement. No fabricated probe results or simulations. If a past attempt is not among the allowed evidence IDs, do not cite it as supporting evidence until retrieved.\n`;
const ALLOWED_MODELS=new Set(Object.keys(PRICING));
const flags={'--mode':'mode','--session-id':'sessionId','--turn-id':'turnId','--message-file':'messageFile','--model-a':'modelA','--model-b':'modelB','--model-x':'modelX','--budget-usd':'budget','--second-retrieval':'secondRetrieval','--attempt-id':'attemptId'};
const fail=m=>{throw Error('GOLDLOOP: '+m);};
export function parseArgs(argv){const o={mode:'plan',sessionId:'sample_session',turnId:'t001',messageFile:null,modelA:'gpt-4.1-mini',modelB:'gpt-4.1-mini',modelX:'gpt-4.1-mini',budget:null,allowSpend:false,secondRetrieval:'on',attemptId:null};
 for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--allow-spend'){o.allowSpend=true;continue;}if(!(a in flags)||!argv[i+1])fail('Unknown or incomplete argument '+a);o[flags[a]]=argv[++i];}
 if(!['plan','preflight','retrieval-check','model','route-recovery-check','route-recovery-continue','probe-continue','probe-continuation-check'].includes(o.mode)||!idOK(o.sessionId)||!idOK(o.turnId))fail('Invalid mode/session-id/turn-id');
 if([o.modelA,o.modelB,o.modelX].some(x=>!ALLOWED_MODELS.has(x)))fail('Use verified gpt-4.1-mini or gpt-4.1 structured-output models; other models not yet API-validated');
 if(!['on','off'].includes(o.secondRetrieval))fail('second retrieval must be on/off');
 o.budget=o.budget===null?null:Number(o.budget);
 if(['model','route-recovery-continue','probe-continue'].includes(o.mode)&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>10||!o.messageFile))fail('Paid mode requires --allow-spend, --budget-usd (0,10], and --message-file');
 if(!['model','route-recovery-continue','probe-continue'].includes(o.mode)&&(o.allowSpend||o.budget!==null))fail('Free modes cannot accept paid flags');
 if(['probe-continue','probe-continuation-check'].includes(o.mode)&&!ATTEMPT_RE.test(o.attemptId??''))fail('Probe continuation requires --attempt-id paNNNN');
 if(!['probe-continue','probe-continuation-check'].includes(o.mode)&&o.attemptId!==null)fail('--attempt-id is valid only for probe continuation');
 if(o.mode==='retrieval-check'&&!o.messageFile)fail('retrieval-check requires --message-file');
 if(o.mode==='route-recovery-check'&&o.messageFile)fail('route-recovery-check uses original saved files; do not supply a message file');
 if(o.messageFile)o.messageFile=path.resolve(o.messageFile);
 return o;
}
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{mode:0o600});
export const sessionDir=id=>path.join(ROOT_OUTPUT,id);
function defaultState(learner){return {schema:VERSION,stage:STAGE,learner,topics:[],observations:[],records:[],turns:[],version:0};}
function checkState(state,o){if(state.schema!==VERSION||state.learner!==o.sessionId||!Array.isArray(state.topics)||!Array.isArray(state.observations)||!Array.isArray(state.records)||!Array.isArray(state.turns)||!Number.isInteger(state.version))fail('Unexpected state format or learner');}
function loadEnv(){if(process.env.OPENAI_API_KEY)return;const p=path.join(ROOT,'.env.local');if(!fs.existsSync(p))return;let parser;try{parser=require('dotenv');}catch{fail('dotenv is needed to load local .env.local; or set OPENAI_API_KEY in this terminal');}const e=parser.parse(fs.readFileSync(p));process.env.OPENAI_API_KEY=e.OPENAI_API_KEY||e.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&e.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=e.OPENAI_BASE_URL;}
function response(role,input,prompt,schema,model,maxTokens){if(Buffer.byteLength(JSON.stringify(input))>56000)fail('Oversized '+role+' input; no silent evidence clipping');return {model,store:false,max_tokens:maxTokens,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'myway_g43_'+role.toLowerCase(),strict:true,schema}}};}
function basePlan(o){return {stage:STAGE,runtime_patch_version:RUNTIME_VERSION,mode:o.mode,session_id:o.sessionId,turn_id:o.turnId,prompt_base_version:PROMPT_SET_VERSION,model_roles:{route:'A',A:o.modelA,B_ONLY:o.modelB,B_DESIGN:o.modelB,X_IMPLEMENT:o.modelX},expected_calls:o.mode==='probe-continue'?'4 (A, B_ONLY, B_DESIGN, X_IMPLEMENT), with optional extra A':'5 (ROUTE, A, B_ONLY, B_DESIGN, X_IMPLEMENT), with optional extra A',embedding:'REAL all-MiniLM-L6-v2 at http://127.0.0.1:8001/embed; mandatory in model mode',topic_route:'model-guided with exact existing ID validation and free creation; not preassigned',learner:'human input, no Model L, no inferred mastery',B_narration:'B-only creates complete runnable teaching in one call; B+X B provides learner-facing educational design',X:'creates self-contained executable HTML in sandboxed browser iframe; no Director/assets integration',persistence:'ignored local .myway-patch-backups/.../s62bfix1r43-goldloop',app_writes:false,requires_paid_opt_in:true,no_automatic_retry:true,educational_quality_auto_scored:false,dual_variant_selection_required_before_scored_attempt:true};}
async function retrievalCheck(o){
 const p=path.join(sessionDir(o.sessionId),'state.json');if(!fs.existsSync(p))fail('No existing completed session state for retrieval-check');
 const state=read(p);checkState(state,o);if(!fs.existsSync(o.messageFile))fail('Missing query message file');
 const query=fs.readFileSync(o.messageFile,'utf8').trim();if(!query||query.length>4000)fail('Invalid retrieval query');
 const current={id:'AUDIT-QUERY',topic_id:state.turns.at(-1)?.topic_id??'unassigned',text:query,compact_index_text:query};
 const copy=clone(state);copy.observations.push(current);
 const p1=await retrieveR3(copy,current,{method:'semantic',cap:12});
 const delivered=(await retrieveAndPackR50(copy,current,{cap:12}));
 return {mode:'retrieval-check',real_local_minilm:true,session:o.sessionId,query_sha256:sha(query),available_prior:state.observations.length,selected_evidence:delivered.packet.evidence.filter(x=>x.id!==current.id).map(x=>({id:x.id,topic_id:x.topic_id,source_excerpt:String(x.text??'').slice(0,420),selection_reason:delivered.packet.selection_reasons[x.id]})),omitted_evidence_ids:delivered.omitted,ranked_preview:p1.ranked_preview,coverage:delivered.input.coverage,model_calls:0,DB_writes:0,warning:'Similarity ranks CANDIDATE history; correctness/relevance must be independently reviewed. The audit query is NOT stored.'};
}
async function preflight(o){const sample=await localMiniLM(['A learner is confused by probability graphs.','A learner wants to understand why treading water is tiring.']);return {...basePlan(o),local_minilm_ok:true,vector_dimension:sample[0].length,embedding_count:sample.length,embedding_finite:sample.every(v=>v.every(Number.isFinite)),used_local_real_service:true,model_calls:0,db_writes:0,not_a_semantic_accuracy_benchmark:true};}
/** Exact, fail-closed recovery only for the user-reviewed goldpilot01/t0010 export (9).
 * Check mode is strictly read-only. Original ROUTE request/response and timestamps retained.
 */
const RECOVERED={session:'goldpilot01',turn:'t0010',state_sha:'f1f76b5a76216e19dcd0657f74eaf1fe2e5a6576ca3c39ef0737edb1ed9d4ba5',pending_sha:'01b8c7641e35fd4975166cdcc26204858e9a9bb9a0565df487e9185ce0d98e8e',input_sha:'4be47ee5d7cc1042c307871118c47ed9710167420f9a95740f594493e4c79473'};
const fileHash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function exactExperimentBranch(){const r=spawnSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8',timeout:10000});if(r.status!==0||r.stdout.trim()!=='myway/learning-sandbox-v3_7a')fail('R5.2 recovery requires the exact isolated Git branch; main is protected');}
export function checkRecoveredRouteFiles({statePath,pendingPath,inputPath,sessionId='goldpilot01',turnId='t0010'}={}){
 if(sessionId!==RECOVERED.session||turnId!==RECOVERED.turn)fail('R5.2 recovered route is authorized for goldpilot01/t0010 only');
 for(const [file,expected] of [[statePath,RECOVERED.state_sha],[pendingPath,RECOVERED.pending_sha],[inputPath,RECOVERED.input_sha]]){
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()||fileHash(file)!==expected)fail('Reviewed recovery input no longer matches the user-supplied export; do not repeat a paid call; re-export for review');
 }
 const state=read(statePath),turn=read(pendingPath),message=fs.readFileSync(inputPath,'utf8').replace(/^\uFEFF/,'').trim();
 if(state.learner!==RECOVERED.session||state.schema!==VERSION||state.turns.length!==9||state.turns.some(t=>t.turn_id===RECOVERED.turn)||state.observations.some(e=>e.id===RECOVERED.turn+'-IN'))fail('Reviewed completed session does not match t0010 recovery baseline');
 if(turn.session_id!==RECOVERED.session||turn.turn_id!==RECOVERED.turn||turn.status!=='manual_review_required_after_failure'||turn.A||turn.B||turn.X||turn.route||turn.current||turn.calls.length!==1)fail('Unexpected pending checkpoint; no retry permitted');
 const c=turn.calls[0];
 if(c.role!=='ROUTE'||c.status!=='returned'||typeof c.response_raw!=='string'||sha(c.request)!==c.request_sha256||sha(c.response_raw)!==c.response_sha256||!Number.isFinite(c.estimated_usd))fail('ROUTE paid-response provenance failed validation');
 const body=JSON.parse(c.request?.messages?.[1]?.content??'null');
 if(!body||body.learner_message!==message||!Array.isArray(body.known_topics)||body.known_topics.length!==state.topics.length||body.known_topics.some((t,i)=>t.id!==state.topics[i].id))fail('Original paid route request is not the reviewed learner message/topics');
 const route=validateRouteR52(c.response_raw,state.topics);
 if(route.decision!=='new'||route.existing_topic_id!==null||!route.new_topic_title.includes('Facial Weakness'))fail('Unexpected recovery route meaning');
 return {state,turn,route,message};
}
function prepareRecoveredRoute(o){
 exactExperimentBranch();
 const dir=sessionDir(o.sessionId),turnDir=path.join(dir,'turns'),pending=path.join(turnDir,o.turnId+'.pending.json'),complete=path.join(turnDir,o.turnId+'.json'),stateFile=path.join(dir,'state.json');
 if(fs.existsSync(complete))fail('Turn already complete; no paid continuation permitted');
 const inputPath=path.join(dir,'inputs',o.turnId+'.txt');
 const obj=checkRecoveredRouteFiles({statePath:stateFile,pendingPath:pending,inputPath,sessionId:o.sessionId,turnId:o.turnId});
 if(path.resolve(o.messageFile)!==path.resolve(inputPath))fail('Must use the original on-disk learner input for recovery');
 for(const f of fs.readdirSync(turnDir).filter(x=>x.endsWith('.pending.json')))if(f!==o.turnId+'.pending.json')fail('Another pending turn exists; recovery blocked');
 const backups=path.join(dir,'recovery-backups','t0010-r52-route');fs.mkdirSync(backups,{recursive:true});
 const origPending=path.join(backups,'original-reviewed-pending.json'),origState=path.join(backups,'original-reviewed-state.json');
 if(fs.existsSync(origPending)||fs.existsSync(origState))fail('Recovery backup already exists; do not attempt continuation twice');
 fs.writeFileSync(origPending,fs.readFileSync(pending),{flag:'wx',mode:0o600});fs.writeFileSync(origState,fs.readFileSync(stateFile),{flag:'wx',mode:0o600});
 const turn=obj.turn;
 turn.recovery={schema:'r52_explicit_reviewed_ROUTE_reuse_v1',original_failure_preserved:true,source_pending_sha256:RECOVERED.pending_sha,source_state_sha256:RECOVERED.state_sha,original_route_request_sha256:turn.calls[0].request_sha256,original_route_response_sha256:turn.calls[0].response_sha256,backups:{pending:origPending,state:origState},reused_role:'ROUTE',original_calls_not_repeated:true,learner_message_unchanged:true,requires_paid_opt_in_for_A_B_X:true};
 turn.runtime_patch_version=RUNTIME_VERSION;
 return {dir,turnDir,pending,complete,stateFile,state:obj.state,turn,recoveredRoute:obj.route};
}
export function routeRecoveryCheck(o){
 exactExperimentBranch();const dir=sessionDir(o.sessionId),state=path.join(dir,'state.json'),pending=path.join(dir,'turns',o.turnId+'.pending.json'),input=path.join(dir,'inputs',o.turnId+'.txt');
 if(fs.existsSync(path.join(dir,'turns',o.turnId+'.json')))fail('t0010 is already complete; do not recover');
 const info=checkRecoveredRouteFiles({statePath:state,pendingPath:pending,inputPath:input,sessionId:o.sessionId,turnId:o.turnId});
 return {status:'ready_for_explicit_paid_continuation',read_only:true,session_id:o.sessionId,turn_id:o.turnId,prior_completed_turns:info.state.turns.length,valid_new_topic_title:info.route.new_topic_title,valid_topic_title_length:info.route.new_topic_title.length,saved_ROUTE_status:'returned_and_hash_verified',saved_ROUTE_estimated_usd:info.turn.total_estimated_usd,new_model_calls:0,embedding_calls:0,writes:0,remaining_roles:['A','B','X'],auto_retry:false,warning:'Do not run original R5.0 model command or rerun ROUTE. Only explicitly approved route-recovery-continue may continue from this reviewed checkpoint.'};
}
function reserve(o){const dir=sessionDir(o.sessionId),turnDir=path.join(dir,'turns');fs.mkdirSync(turnDir,{recursive:true});
 const pending=path.join(turnDir,o.turnId+'.pending.json'); const complete=path.join(turnDir,o.turnId+'.json');
 if(fs.existsSync(complete)||fs.existsSync(pending))fail('This turn-id already attempted; never automatically retry a billable call. Inspect reports first.');
 const stateFile=path.join(dir,'state.json');if(fs.existsSync(stateFile)){const st=read(stateFile);checkState(st,o);if(pendingExists(dir))fail('Another incomplete paid turn, retry or root backfill exists; inspect before continuing');}
 const state=fs.existsSync(stateFile)?read(stateFile):defaultState(o.sessionId);
 const turn={schema:'myway_goldloop_turn_v1',stage:STAGE,runtime_patch_version:RUNTIME_VERSION,turn_id:o.turnId,session_id:o.sessionId,status:'reserved',started_at:new Date().toISOString(),learner_message_file_sha256:sha(fs.readFileSync(o.messageFile)),calls:[],route:null,A:null,B:null,X:null,ethical_boundary:'Real learner utterances are not independently verified mastery. Do not commit or publish this trace.'};
 // The write is atomic creation. Even process crash or provider uncertainty leaves a no-retry marker.
 fs.writeFileSync(pending,JSON.stringify(turn,null,2)+'\n',{flag:'wx',mode:0o600});
 return {dir,turnDir,pending,complete,stateFile,state,turn};
}
async function modelTurn(o,recovering=false){if(!fs.existsSync(o.messageFile)||!fs.statSync(o.messageFile).isFile())fail('Message file not found');const msg=fs.readFileSync(o.messageFile,'utf8').replace(/^\uFEFF/,'').trim();if(!msg||msg.length>4000)fail('Turn event marker/message must be 1..4000 characters');
 const isProbe=o.mode==='probe-continue';
 // Preflight embedding BEFORE reserving the paid attempt. Fail rather than use lexical or test vectors.
 await localMiniLM(['Goldloop real MiniLM preflight']);loadEnv();const context=credentials();
 const costReserve={ 'gpt-4.1-mini':0.055, 'gpt-4.1':0.29};
 const admission=(recovering||isProbe?2:3)*costReserve[o.modelA]+2*costReserve[o.modelB]+costReserve[o.modelX];
 if(o.budget<admission)fail(`Pre-admission budget too low: ${admission.toFixed(3)} suggested for 4 calls + possible A follow-up; this is NOT a provider billing cap. No model call made.`);
 let checkedProbe=null,claimPath=null;
 if(isProbe){
  exactExperimentBranch();
  const sourceStatePath=path.join(sessionDir(o.sessionId),'state.json');
  if(!fs.existsSync(sourceStatePath))fail('Missing source state for saved probe');
  const source=read(sourceStatePath);checkState(source,o);
  checkedProbe=probeContinuationContext(source,o.attemptId);
  if(msg!==checkedProbe.marker)fail('Probe event marker does not match authoritative saved attempt; no paid call');
  const sourceDir=sessionDir(o.sessionId);
  if(pendingExists(sourceDir))fail('Pending paid operation requires review before probe continuation');
  const claims=path.join(sourceDir,'probe-continuations');fs.mkdirSync(claims,{recursive:true});
  claimPath=path.join(claims,o.attemptId+'.json');
  if(fs.existsSync(claimPath))fail('This probe has already been reserved for continuation. Never repeat a paid call.');
  // A durable single-use claim prevents accidental duplicate paid attempts even after
  // a partial failure or process crash. Claimed IDs require manual review to release.
  fs.writeFileSync(claimPath,JSON.stringify({schema:'myway_probe_continuation_claim_v1',attempt_id:o.attemptId,evidence_id:checkedProbe.attempt.evidence_id,turn_id:o.turnId,session_id:o.sessionId,attempt_sha256:checkedProbe.attemptSha,event_marker_sha256:sha(msg),claimed_at:new Date().toISOString(),status:'reserved_not_auto_retryable'},null,2)+'\n',{flag:'wx',mode:0o600});
 }
 const r=recovering?prepareRecoveredRoute(o):reserve(o),{state,turn}=r;let spent=recovering?Number(turn.total_estimated_usd??0):0;
 if(isProbe){
  const nowProbe=probeContinuationContext(state,o.attemptId);
  if(nowProbe.attemptSha!==checkedProbe.attemptSha||nowProbe.marker!==msg)fail('Probe source changed while reserving; review pending trace before further calls');
  turn.input_kind='submitted_probe_attempt';
  turn.continuation_source={attempt_id:nowProbe.attempt.attempt_id,evidence_id:nowProbe.attempt.evidence_id,source_turn_id:nowProbe.sourceTurn.turn_id,topic_id:nowProbe.topic.id,source_attempt_sha256:nowProbe.attemptSha,raw_browser_attempt_not_autoscored:true,route_call_skipped_because_topic_known:true};
  turn.learner_message_file_kind='host_generated_event_marker_not_user_chat';
  turn.learner_message_display=nowProbe.visibleText;
 }
 const flush=()=>write(r.pending,turn);
 async function call(role,input,prompt,schema,model,maxTokens){if(spent+costReserve[model]>o.budget)fail(`Conservative pre-admission budget threshold before ${role}: estimated ${spent.toFixed(4)} + ${costReserve[model]} > ${o.budget}. No retry; use new turn-id only after reviewing.`);
  const req=response(role,input,prompt,schema,model,maxTokens),entry={role,model,request_sha256:sha(req),input_sha256:sha(input),request:req,status:'submitted',sent_at:new Date().toISOString(),response_sha256:null,response_raw:null,usage:null,estimated_usd:null};turn.calls.push(entry);turn.status='model_call_submitted_'+role;flush();
  let out;try{out=['B_ONLY','B_DESIGN','X_IMPLEMENT'].includes(role)?await callProviderExtended(req,context,{timeoutMs:120000}):await callProvider(req,context);}catch(e){entry.status='transport_or_provider_error_unknown_usage';entry.error=String(e.message);turn.status='manual_review_required_unsafe_to_retry';flush();throw e;}
  entry.response_sha256=sha(out.raw);entry.response_raw=out.raw;entry.usage=out.usage;entry.provider_model=out.model;entry.status='returned';entry.received_at=new Date().toISOString();try{entry.estimated_usd=estimateCost(out.usage,model);spent+=entry.estimated_usd;}catch(e){entry.usage_error=String(e.message);turn.status='manual_review_required_unknown_cost';flush();throw e;}turn.total_estimated_usd=+spent.toFixed(8);flush();return JSON.parse(out.raw);
 }
 try{
  if(recovering){turn.status='reviewed_route_reused_before_A';flush();}
  const probeInfo=isProbe?probeContinuationContext(state,o.attemptId):null;
  const routeInput=isProbe?null:compactRouteInput(state,msg);
  const rawRoute=isProbe?null:(recovering?JSON.parse(turn.calls[0].response_raw):await call('ROUTE',routeInput,ROUTE_PROMPT+ROUTE_R52_ADDITION,ROUTE_SCHEMA,o.modelA,800));
  const route=isProbe?{decision:'existing',existing_topic_id:probeInfo.topic.id,new_topic_title:null,rationale:'Source probe has an already-known topic; ROUTE not called'}:validateRouteR52(rawRoute,state.topics);
  const topic=isProbe?probeInfo.topic:routeTopic(state,route);
  // For probe continuation, CURRENT is the original saved paNNNN-IN observation.
  // Never manufacture a chat utterance or duplicate an existing evidence ID.
  const current=isProbe?clone(probeInfo.observation):makeObservation(state,topic,msg,o.turnId);
  turn.route={...route,resolved_topic:topic,route_origin:isProbe?'locked_source_probe':'model'};turn.current=current;flush();
  const packetState={...state,observations:isProbe?[...state.observations]:[...state.observations,current]};
  async function assess(additionalQuery=null,cap=12){const packed=await retrieveAndPackR50(packetState,current,{additionalQuery,cap});const candidateRoots=await rankCandidateRoots(packetState,current);const prior=state.turns.at(-1);const priorProbe=prior?.B_output?.beats?.length?{previous_turn_id:prior.turn_id,previous_topic_id:prior.topic_id,previous_teaching_mode:prior.B_output.teaching_mode,original_learner_actions:prior.B_output.beats.map(b=>({beat_id:b.id,offered_action:b.learner_action})).filter(x=>x.offered_action),status:'offered_in_text_not_executed_or_scored',next_input_may_or_may_not_respond_to_probe:true}:null;const recentAttempts=(state.probe_attempts??[]).slice(-3).map(z=>({attempt_id:z.attempt_id,evidence_id:z.evidence_id,source_turn_id:z.turn_id,scene_id:z.scene_id,modality:z.modality,probe_purpose:z.probe_purpose,task_as_offered:String(z.task_as_offered??'').slice(0,650),status:z.status,learner_answer:String(z.learner_answer??'').slice(0,900),selection:z.selection,ordered_items:z.ordered_items,matches:z.matches,selected_items:z.selected_items,values:z.values,hints_requested:z.hints_requested,comparison_exposure:z.comparison_exposure??null,action_log:(z.action_log??[]).slice(-10),full_raw_record_in_state_and_export:true,experience_design_sha256:z.experience_design_sha256??null,experience_steps:(z.experience_steps??[]).slice(0,5),placeholder_not_real_renderer:true,not_auto_scored:true}));let selectedExperience=null;const lastTurn=state.turns.at(-1),lastVariant=lastTurn?.dual_experience?.selected_variant;
    if(lastVariant&&['b_only','bx'].includes(lastVariant)){
      const file=path.join(r.dir,'creative-designs',lastTurn.turn_id+'-'+lastVariant+'.json');
      if(fs.existsSync(file)){const art=read(file)?.output;selectedExperience={source_turn_id:lastTurn.turn_id,variant:lastVariant,title:art?.title??null,brief:String(art?.brief??'').slice(0,900),evidence_notes:String(art?.activity?.evidence_notes??'').slice(0,500),limitations:String(art?.activity?.limitations??'').slice(0,500),both_options_shown:true,unchosen_option_not_completed:true,selection_alone_is_not_learner_mastery:true};}
    }
    const aInput={...packed.input,recent_selected_experience_context:selectedExperience,...(isProbe?{current_input_kind:'submitted_probe_attempt',probe_submission_as_primary_evidence:probeModelEvidence(probeInfo),avoid_inventing_new_chat_message:true}:{}),assessment_phase:'pre_teacher',focused_history_question:additionalQuery,root_similarity_candidates:candidateRoots,prior_probe_opportunity:priorProbe,actual_recent_probe_attempts:recentAttempts,policy:'Assessment evidence is NOT automatically a diagnosed root or mastery; cosine similarity NOT a root merge. Raw probe actions are unscored learner evidence, NOT model-verified accuracy'};
   const result=await call('A',aInput,R41_A_PROMPT+A_GOLD_ADDITION+A_R45_MEMORY_POLICY+A_R46_PROBE_POLICY,A_SCHEMA,o.modelA,2400);const valid=verifyAIsolated(result,packed.packet,packetState);if(!valid.assessment_valid)fail('A failed grounded validation: '+valid.error+'; no automatic paid retry');return {output:valid.output,validation:valid,packet:packed.packet,input:aInput,omitted:packed.omitted};}
  let a=await assess();let second=null;
  if(a.output.interpretation.more_history_needed&&o.secondRetrieval==='on'&&state.observations.length){
    const focused=a.output.interpretation.more_history_needed;const decision=await focusedRetrievalDecision(packetState,current,a,focused);
    second={requested:focused,used:decision.use,reason:decision.reason,newly_selected_evidence_ids:decision.newlySelected??[]};
    if(decision.use){a=await assess(focused,12);second.used=true;}
  }
  let changes=[];if(a.output.memory_decisions?.length)changes=applyA(state,a.output,current.id);
  turn.A={input:a.input,output:a.output,root_similarity_candidates:a.input.root_similarity_candidates,validation:{assessment_valid:true,proposed_memory_actions:a.validation.proposed_memory_actions,rejected_memory_actions:a.validation.rejected_memory_actions},changes,focused_retrieval:second,retrieval_summary:{...a.packet.coverage,selected_ids:a.packet.allowed_evidence_ids,omitted_delivered:a.omitted,relevance_not_truth:true},retrieval_preview:a.packet.ranked_preview};flush();
  // Both experimental branches receive the same immutable learner context and A assessment.
  // Neither branch is constrained by the R4.6 seven-template / scene validator.
  const teacherInput={...makeTeacherInputR50(state,current,a.output,a.packet),recent_selected_experience_context:a.input.recent_selected_experience_context,current_input_kind:isProbe?'submitted_probe_attempt':'human_chat_message',source_probe_submission:isProbe?probeModelEvidence(probeInfo):null,
    model_A_assessment_is_tentative:a.output.learner_brief_for_B,educational_policy:'Teach naturally. Interaction may be useful, but never force a quiz. Design freely for this learner. Prior lesson and learner performance are not verification.'};
  const shared={learner_context:teacherInput,current_observation:{id:current.id,kind:current.kind,text:current.text,topic_id:topic.id},source_is_saved_probe:isProbe,topic_label:topic.title,
    prior_experience_was_not_necessarily_seen:state.turns.at(-1)?.selected_variant??null,unselected_generated_variants_are_not_mastery:true};
  const B_ONLY_SYSTEM=`You are MyWay Model B in the SINGLE-CALL experimental architecture. In ONE call you must teach, design AND technically IMPLEMENT a coherent browser experience. Do not defer implementation to X. Create genuinely helpful learner-facing teaching, possibly interactive, suited to current uncertainty. You may build a thoughtful interactive explanation, narrative, exploration, visualization or challenge. Do not default to a grammar drill, generic quiz, or forced probe; if no challenge is useful, produce an accessible interactive explanation with meaningful controls or self-paced exploration. Use self-contained HTML/CSS/JS/SVG/Canvas only, no networking, remote resources or storage. Return a functional HTML fragment containing inline <style> and <script> (not a full page), and truthful limitations. Label important learner decisions with window.mywayRecord(action,details) but those reports are unverified. Avoid invented grading, fake audio, claims of measured mastery or fabricated learner state. Keep UI simple, attractive and mobile-friendly. No fixed probe templates or mandatory scene IDs. Preserve imaginative VISUAL STORYTELLING throughout: the learner-facing narration, visual scene changes, metaphors, transitions and any interactions must form ONE coherent synchronized experience inside the HTML. What the learner reads or hears, sees, and does should advance together, rather than appending an unrelated quiz. You are free to choose the number and structure of moments: no mandatory beat IDs, fixed modality or scene template. Also provide visual_storyboard as a concise readable outline of the planned narration/visual/action progression; it is descriptive design intent, NOT proof the HTML implements every detail. Prefer the MyWay dark navy/black (#080c18), violet (#9b85f5), light-blue (#8ad4ff) visual identity while retaining creative subject-specific colors and accessible contrast. No fake playback or simulated audio labelled as real listening.`;
  const B_DESIGN_SYSTEM=`You are MyWay Model B in the TWO-CALL experimental architecture. DESIGN AND TEACH: determine what educational experience will most help this learner now. It may be an explanation, exploration, story, challenge or interactive investigation, not necessarily a quiz. Give X a creative but concrete design brief that includes exact learner-facing teaching, the intended interaction and what evidence the learner could generate, including honest limits. No old seven-template vocabulary, scene selection fields, arbitrary stage IDs or seeded hypotheses. Do not write executable code; X handles implementation. Adapt to the latest learner evidence and do not invent mastery. Describe the visual narrative you want X to create, how narration changes with the scene, and what learner actions would naturally belong inside it. Preserve creative freedom; do not force a probe. Prefer the MyWay dark navy, violet and light-blue visual language while leaving subject-specific room for artistic choices.`;
  const X_IMPLEMENT_SYSTEM=`You are MyWay Model X in the TWO-CALL architecture: creatively IMPLEMENT the exact educational purpose and learner-facing instruction from B's brief. Build self-contained responsive HTML/CSS/JS/SVG/Canvas with functional interaction and clear feedback. No remote resources, network access, imports, workers, storage or external libraries. Return an HTML FRAGMENT (not a full page) with inline <style> and <script>. You may invent interaction mechanics without using old seven probe templates, while preserving B's learning intent. Use window.mywayRecord(action,details) for meaningful learner actions; such reports are unverified and not an independent correctness measure. Don't pretend text highlighting is audio, and disclose limitations, illustrative simulations and non-measured skills. Keep it coherent, vivid and runnable. Preserve imaginative VISUAL STORYTELLING throughout: the learner-facing narration, visual scene changes, metaphors, transitions and any interactions must form ONE coherent synchronized experience inside the HTML. What the learner reads or hears, sees, and does should advance together, rather than appending an unrelated quiz. You are free to choose the number and structure of moments: no mandatory beat IDs, fixed modality or scene template. Also provide visual_storyboard as a concise readable outline of the planned narration/visual/action progression; it is descriptive design intent, NOT proof the HTML implements every detail. Prefer the MyWay dark navy/black (#080c18), violet (#9b85f5), light-blue (#8ad4ff) visual identity while retaining creative subject-specific colors and accessible contrast. No fake playback or simulated audio labelled as real listening.`;
  const only=validateStoryActivity(await call('B_ONLY',{...shared,architecture:'one_B_call_design_teach_implement'},B_ONLY_SYSTEM,STORY_ACTIVITY_SCHEMA,o.modelB,9000));
  const bDesign=await call('B_DESIGN',{...shared,architecture:'B_teaches_and_designs_only_then_X_implements'},B_DESIGN_SYSTEM,B_BRIEF_SCHEMA,o.modelB,3500);
  if(typeof bDesign?.brief!=='string'||!bDesign.brief.trim())fail('B design returned empty brief; paid trace retained');
  const bx=validateStoryActivity(await call('X_IMPLEMENT',{shared_learner_context:shared,B_educational_design:bDesign.brief,architecture:'two_call_B_plus_X'},X_IMPLEMENT_SYSTEM,STORY_ACTIVITY_SCHEMA,o.modelX,9000));
  const arts={b_only:{title:only.title,brief:'One-call B-only experience: design, teaching and executable implementation created in a single response.',activity:only,model_calls:1,est_cost:turn.calls.find(z=>z.role==='B_ONLY')?.estimated_usd??0},bx:{title:bx.title,brief:bDesign.brief,activity:bx,model_calls:2,est_cost:(turn.calls.find(z=>z.role==='B_DESIGN')?.estimated_usd??0)+(turn.calls.find(z=>z.role==='X_IMPLEMENT')?.estimated_usd??0)}};
  turn.dual_experience={schema:'myway_dual_turn_v1',variants:Object.fromEntries(Object.entries(arts).map(([k,v])=>[k,{title:v.title,activity_sha256:activitySha(v.activity),estimated_usd:v.est_cost,model_calls:v.model_calls,visual_storyboard_present:!!v.activity.visual_storyboard}])),both_generated_before_selection:true,choice_pending:true};
  turn.B={input:teacherInput,output:{teaching_intent:'Dual model-first comparison. Both variants narrate, visualize and implement experiences.',beats:[],probe_plan:{offer:false},b_only_visual_storyboard:only.visual_storyboard,bx_design_brief:bDesign.brief}};
  turn.X={input:{source:'B design for B+X'},output:{moments:[],visual_concept:bx.title,visual_storyboard:bx.visual_storyboard,implementation_mode:'synchronized_narrative_visual_interaction_html'},alignment_verified:null,visual_story_fidelity:'not_independently_verified'};
  turn.teacher_response='Two independent learning experiences were generated. Choose which one to explore and continue.';flush();
  if(packetState.semantic_index)state.semantic_index=packetState.semantic_index;
  if(!isProbe)state.observations.push(current);
  state.turns.push({runtime_patch_version:RUNTIME_VERSION,turn_id:o.turnId,input_kind:isProbe?'submitted_probe_attempt':'human_chat_message',continuation_source:isProbe?turn.continuation_source:null,topic_id:topic.id,topic_title:topic.title,learner_message:isProbe?probeInfo.visibleText:msg,teacher_response:turn.teacher_response,B_output:turn.B.output,X_output:turn.X.output,probe_plan:{offer:false},scene_contract_id:null,scene_contract:null,A_brief:a.output.learner_brief_for_B,evidence_id:current.id,visuals_rendered:true,dual_experience:{variants:['b_only','bx'],status:'awaiting_learner_choice',selected_variant:null,shown_both:true},probe_opportunity:{status:'creative_variants_generated_not_yet_attempted',structured_probe_plan:null}});
  // Canonical creative artifacts use R5.4's unchanged designFor() evidence path.
  // Reserve both artifacts exclusively; a failed write leaves a pending trace for manual review.
  const folder=path.join(r.dir,'creative-designs');fs.mkdirSync(folder,{recursive:true});
  for(const variant of ['b_only','bx']){
    const v=arts[variant],file=path.join(folder,o.turnId+'-'+variant+'.json');
    const output={schema:'myway_r54_creative_artifact_v1',status:'complete',variant,session_id:o.sessionId,turn_id:o.turnId,topic_id:topic.id,title:v.title,brief:v.brief,visual_storyboard:v.activity.visual_storyboard,story_fidelity_unverified:true,activity:v.activity,activity_sha256:activitySha(v.activity),source_context_sha256:activitySha(shared),model_calls:v.model_calls,estimated_usd:+v.est_cost.toFixed(8),created_at:new Date().toISOString(),quality_unverified:true,no_automatic_scoring:true,automatic_dual_r55:true,shared_A_turn_id:o.turnId};
    fs.writeFileSync(file,JSON.stringify({status:'complete',output},null,2)+'\n',{flag:'wx',mode:0o600});
  }
  turn.status='complete';turn.completed_at=new Date().toISOString();turn.summary={status:'dual_complete',turn_id:o.turnId,model_calls:turn.calls.map(c=>c.role)};flush();
  write(r.stateFile,state);fs.renameSync(r.pending,r.complete);
  return {status:'complete',runtime_patch_version:RUNTIME_VERSION,input_kind:isProbe?'submitted_probe_attempt':'human_chat_message',session_id:o.sessionId,turn_id:o.turnId,topic:topic.title,model_calls:turn.calls.map(c=>c.role),estimated_usd:+spent.toFixed(8),A_validation:true,dual_generated:true,variant_costs:{b_only:arts.b_only.est_cost,bx:arts.bx.est_cost},requires_learner_choice:true,original_learner_evidence_preserved:true};
 }catch(e){if(turn.status!=='manual_review_required_unsafe_to_retry'&&turn.status!=='manual_review_required_unknown_cost')turn.status='manual_review_required_after_failure';turn.failure=String(e.stack??e.message);flush();throw Error(String(e.message)+'\nPaid-turn trace retained: '+r.pending+'\nDo NOT rerun this turn ID automatically.');}
}
export function probeContinuationCheck(o){
 exactExperimentBranch();
 const dir=sessionDir(o.sessionId),statePath=path.join(dir,'state.json');
 if(!fs.existsSync(statePath))fail('No saved session for probe check');
 const state=read(statePath);checkState(state,o);
 const info=probeContinuationContext(state,o.attemptId);
 if(pendingExists(dir))fail('Pending operation blocks continuation; inspect trace first');
 if(fs.existsSync(path.join(dir,'probe-continuations',o.attemptId+'.json')))fail('Probe continuation already reserved; no retry');
 return {status:'ready_for_explicit_paid_probe_continuation',read_only:true,session_id:o.sessionId,attempt_id:o.attemptId,evidence_id:info.observation.id,source_turn_id:info.sourceTurn.turn_id,topic_id:info.topic.id,attempt_sha256:info.attemptSha,roles:['A','B','X'],route_call_skipped:true,already_scored:false,model_calls:0,embedding_calls:0,writes:0,requires_explicit_approval:true};
}
export async function main(argv=process.argv.slice(2)){const o=parseArgs(argv);if(o.mode==='plan')return basePlan(o);if(o.mode==='preflight')return await preflight(o);if(o.mode==='retrieval-check')return await retrievalCheck(o);if(o.mode==='route-recovery-check')return routeRecoveryCheck(o);if(o.mode==='probe-continuation-check')return probeContinuationCheck(o);return await modelTurn(o,o.mode==='route-recovery-continue');}
const thisModule=path.resolve(fileURLToPath(import.meta.url));if(process.argv[1]&&path.resolve(process.argv[1])===thisModule)main().then(v=>{console.log(JSON.stringify(v,null,2));}).catch(e=>{console.error(String(e.message));process.exitCode=1;});
