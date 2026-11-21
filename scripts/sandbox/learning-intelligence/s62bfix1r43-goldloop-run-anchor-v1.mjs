#!/usr/bin/env node
/** R4.3 HUMAN GOLDLOOP — research-only, isolated A routing -> A evidence -> B narration -> X textual storyboard.
 * - Real provider calls ONLY in --mode model --allow-spend with explicit budget and unique turn-id.
 * - Real localhost MiniLM ONLY; no fake vectors in model mode or silent lexical substitution.
 * - No production routes, asset library, Director, DB, Vercel, or rendering.
 * - Never automatically retry a possibly billable model call; logs include all attempted payloads and raw replies.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';
import {A_SCHEMA,verifyAIsolated,applyA} from './s62bfix1r2-core.mjs';
import {R41_A_PROMPT,PROMPT_SET_VERSION} from './s62bfix1r41-prompts.mjs';
import {retrieveR3} from './s62bfix1r3-retrieval.mjs';
import {localMiniLM} from './s16b60-retrieval.mjs';
import {STAGE,ROUTE_SCHEMA,B_GOLD_SCHEMA,X_GOLD_SCHEMA,ROUTE_PROMPT,A_GOLD_ADDITION,B_GOLD_PROMPT,X_GOLD_PROMPT,idOK,sha,clone,validateRoute,routeTopic,validateB,validateX,makeObservation,packEvidence,makeTeacherInput,makeXInput,teacherText,traceSummary} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const require=createRequire(import.meta.url);
const ROOT_OUTPUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const VERSION='myway_goldloop_human_v1';
const ALLOWED_MODELS=new Set(Object.keys(PRICING));
const flags={'--mode':'mode','--session-id':'sessionId','--turn-id':'turnId','--message-file':'messageFile','--model-a':'modelA','--model-b':'modelB','--model-x':'modelX','--budget-usd':'budget','--second-retrieval':'secondRetrieval'};
const fail=m=>{throw Error('GOLDLOOP: '+m);};
export function parseArgs(argv){const o={mode:'plan',sessionId:'sample_session',turnId:'t001',messageFile:null,modelA:'gpt-4.1-mini',modelB:'gpt-4.1-mini',modelX:'gpt-4.1-mini',budget:null,allowSpend:false,secondRetrieval:'on'};
 for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--allow-spend'){o.allowSpend=true;continue;}if(!(a in flags)||!argv[i+1])fail('Unknown or incomplete argument '+a);o[flags[a]]=argv[++i];}
 if(!['plan','preflight','retrieval-check','model'].includes(o.mode)||!idOK(o.sessionId)||!idOK(o.turnId))fail('Invalid mode/session-id/turn-id');
 if([o.modelA,o.modelB,o.modelX].some(x=>!ALLOWED_MODELS.has(x)))fail('Use verified gpt-4.1-mini or gpt-4.1 structured-output models; other models not yet API-validated');
 if(!['on','off'].includes(o.secondRetrieval))fail('second retrieval must be on/off');
 o.budget=o.budget===null?null:Number(o.budget);
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>10||!o.messageFile))fail('Model mode requires --allow-spend, --budget-usd (0,10], and --message-file');
 if(o.mode!=='model'&&(o.allowSpend||o.budget!==null))fail('Free modes cannot accept paid flags');
 if(o.mode==='retrieval-check'&&!o.messageFile)fail('retrieval-check requires --message-file');
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
function basePlan(o){return {stage:STAGE,mode:o.mode,session_id:o.sessionId,turn_id:o.turnId,prompt_base_version:PROMPT_SET_VERSION,model_roles:{route:'A',A:o.modelA,B:o.modelB,X:o.modelX},expected_calls:'4 (route, A, B, X), plus 1 A only if focused retrieval requested',embedding:'REAL all-MiniLM-L6-v2 at http://127.0.0.1:8001/embed; mandatory in model mode',topic_route:'model-guided with exact existing ID validation and free creation; not preassigned',learner:'human input, no Model L, no inferred mastery',B_narration:'authoritative learner-facing words segmented into beats',X:'aligned textual directions only; does NOT invoke Director/assets/renderer',persistence:'ignored local .myway-patch-backups/.../s62bfix1r43-goldloop',app_writes:false,requires_paid_opt_in:true,no_automatic_retry:true,educational_quality_auto_scored:false};}
async function retrievalCheck(o){
 const p=path.join(sessionDir(o.sessionId),'state.json');if(!fs.existsSync(p))fail('No existing completed session state for retrieval-check');
 const state=read(p);checkState(state,o);if(!fs.existsSync(o.messageFile))fail('Missing query message file');
 const query=fs.readFileSync(o.messageFile,'utf8').trim();if(!query||query.length>4000)fail('Invalid retrieval query');
 const current={id:'AUDIT-QUERY',topic_id:state.turns.at(-1)?.topic_id??'unassigned',text:query,compact_index_text:query};
 const copy=clone(state);copy.observations.push(current);
 const p1=await retrieveR3(copy,current,{method:'semantic',cap:12});
 const delivered=packEvidence(copy,current,p1);
 return {mode:'retrieval-check',real_local_minilm:true,session:o.sessionId,query_sha256:sha(query),available_prior:state.observations.length,selected_evidence:delivered.packet.evidence.filter(x=>x.id!==current.id).map(x=>({id:x.id,topic_id:x.topic_id,source_excerpt:String(x.text??'').slice(0,420),selection_reason:delivered.packet.selection_reasons[x.id]})),omitted_evidence_ids:delivered.omitted,ranked_preview:p1.ranked_preview,coverage:delivered.input.coverage,model_calls:0,DB_writes:0,warning:'Similarity ranks CANDIDATE history; correctness/relevance must be independently reviewed. The audit query is NOT stored.'};
}
async function preflight(o){const sample=await localMiniLM(['A learner is confused by probability graphs.','A learner wants to understand why treading water is tiring.']);return {...basePlan(o),local_minilm_ok:true,vector_dimension:sample[0].length,embedding_count:sample.length,embedding_finite:sample.every(v=>v.every(Number.isFinite)),used_local_real_service:true,model_calls:0,db_writes:0,not_a_semantic_accuracy_benchmark:true};}
function reserve(o){const dir=sessionDir(o.sessionId),turnDir=path.join(dir,'turns');fs.mkdirSync(turnDir,{recursive:true});
 const pending=path.join(turnDir,o.turnId+'.pending.json'); const complete=path.join(turnDir,o.turnId+'.json');
 if(fs.existsSync(complete)||fs.existsSync(pending))fail('This turn-id already attempted; never automatically retry a billable call. Inspect reports first.');
 const stateFile=path.join(dir,'state.json');if(fs.existsSync(stateFile)){const st=read(stateFile);checkState(st,o);if(fs.readdirSync(turnDir).some(x=>x.endsWith('.pending.json')))fail('Another incomplete paid turn exists; inspect before continuing');}
 const state=fs.existsSync(stateFile)?read(stateFile):defaultState(o.sessionId);
 const turn={schema:'myway_goldloop_turn_v1',stage:STAGE,turn_id:o.turnId,session_id:o.sessionId,status:'reserved',started_at:new Date().toISOString(),learner_message_file_sha256:sha(fs.readFileSync(o.messageFile)),calls:[],route:null,A:null,B:null,X:null,ethical_boundary:'Real learner utterances are not independently verified mastery. Do not commit or publish this trace.'};
 // The write is atomic creation. Even process crash or provider uncertainty leaves a no-retry marker.
 fs.writeFileSync(pending,JSON.stringify(turn,null,2)+'\n',{flag:'wx',mode:0o600});
 return {dir,turnDir,pending,complete,stateFile,state,turn};
}
async function modelTurn(o){if(!fs.existsSync(o.messageFile)||!fs.statSync(o.messageFile).isFile())fail('Message file not found');const msg=fs.readFileSync(o.messageFile,'utf8').replace(/^\uFEFF/,'').trim();if(!msg||msg.length>4000)fail('Learner message must be 1..4000 characters');
 // Preflight embedding BEFORE reserving the paid attempt. Fail rather than use lexical or test vectors.
 await localMiniLM(['Goldloop real MiniLM preflight']);loadEnv();const context=credentials();
 const costReserve={ 'gpt-4.1-mini':0.055, 'gpt-4.1':0.29};
 const admission=3*costReserve[o.modelA]+costReserve[o.modelB]+costReserve[o.modelX];
 if(o.budget<admission)fail(`Pre-admission budget too low: ${admission.toFixed(3)} suggested for 4 calls + possible A follow-up; this is NOT a provider billing cap. No model call made.`);
 const r=reserve(o),{state,turn}=r;let spent=0;
 const flush=()=>write(r.pending,turn);
 async function call(role,input,prompt,schema,model,maxTokens){if(spent+costReserve[model]>o.budget)fail(`Conservative pre-admission budget threshold before ${role}: estimated ${spent.toFixed(4)} + ${costReserve[model]} > ${o.budget}. No retry; use new turn-id only after reviewing.`);
  const req=response(role,input,prompt,schema,model,maxTokens),entry={role,model,request_sha256:sha(req),input_sha256:sha(input),request:req,status:'submitted',sent_at:new Date().toISOString(),response_sha256:null,response_raw:null,usage:null,estimated_usd:null};turn.calls.push(entry);turn.status='model_call_submitted_'+role;flush();
  let out;try{out=await callProvider(req,context);}catch(e){entry.status='transport_or_provider_error_unknown_usage';entry.error=String(e.message);turn.status='manual_review_required_unsafe_to_retry';flush();throw e;}
  entry.response_sha256=sha(out.raw);entry.response_raw=out.raw;entry.usage=out.usage;entry.provider_model=out.model;entry.status='returned';entry.received_at=new Date().toISOString();try{entry.estimated_usd=estimateCost(out.usage,model);spent+=entry.estimated_usd;}catch(e){entry.usage_error=String(e.message);turn.status='manual_review_required_unknown_cost';flush();throw e;}turn.total_estimated_usd=+spent.toFixed(8);flush();return JSON.parse(out.raw);
 }
 try{
  const routeInput={learner_message:msg,known_topics:state.topics.map(t=>({id:t.id,title:t.title})),recent_visible_dialogue:state.turns.slice(-3).map(t=>({topic_id:t.topic_id,learner:t.learner_message,tutor:t.teacher_response})),note:'Select an existing topic when continuing, otherwise create new; the 30-topic fictional bank is not the user topic universe'};
  const rawRoute=await call('ROUTE',routeInput,ROUTE_PROMPT,ROUTE_SCHEMA,o.modelA,800);const route=validateRoute(rawRoute,state.topics);const topic=routeTopic(state,route);const current=makeObservation(state,topic,msg,o.turnId);turn.route={...route,resolved_topic:topic};turn.current=current;flush();
  // Observations in session state are historical only until this turn commits. Retrieval always injects current.
  const packetState={...state,observations:[...state.observations,current]};
  async function assess(additionalQuery=null,cap=12){const p=await retrieveR3(packetState,current,{method:'semantic',cap,additionalQuery});const packed=packEvidence(packetState,current,p);const aInput={...packed.input,assessment_phase:'pre_teacher',focused_history_question:additionalQuery,policy:'Assessment evidence is NOT automatically a diagnosed root or mastery'};
   const result=await call('A',aInput,R41_A_PROMPT+A_GOLD_ADDITION,A_SCHEMA,o.modelA,2400);const valid=verifyAIsolated(result,packed.packet,packetState);if(!valid.assessment_valid)fail('A failed grounded validation: '+valid.error+'; no automatic paid retry');return {output:valid.output,validation:valid,packet:packed.packet,input:aInput,omitted:packed.omitted};}
  let a=await assess();let second=null;
  if(a.output.interpretation.more_history_needed&&o.secondRetrieval==='on'&&state.observations.length){const focused=a.output.interpretation.more_history_needed;second={requested:focused};a=await assess(focused,18);second.used=true;}
  let changes=[];if(a.output.memory_decisions?.length)changes=applyA(state,a.output,current.id);
  turn.A={input:a.input,output:a.output,validation:{assessment_valid:true,proposed_memory_actions:a.validation.proposed_memory_actions,rejected_memory_actions:a.validation.rejected_memory_actions},changes,focused_retrieval:second,retrieval_summary:{...a.packet.coverage,selected_ids:a.packet.allowed_evidence_ids,omitted_delivered:a.omitted,relevance_not_truth:true},retrieval_preview:a.packet.ranked_preview};flush();
  const teacherInput=makeTeacherInput(state,current,a.output,a.packet);
  const bOutput=validateB(await call('B',teacherInput,B_GOLD_PROMPT,B_GOLD_SCHEMA,o.modelB,3300));turn.B={input:teacherInput,output:bOutput};turn.teacher_response=teacherText(bOutput);flush();
  const xInput=makeXInput(bOutput,teacherInput);
  const xOutput=validateX(await call('X',xInput,X_GOLD_PROMPT,X_GOLD_SCHEMA,o.modelX,4000),bOutput);turn.X={input:xInput,output:xOutput,alignment_verified:true};flush();
  if(packetState.semantic_index)state.semantic_index=packetState.semantic_index;
  state.observations.push(current);state.turns.push({turn_id:o.turnId,topic_id:topic.id,topic_title:topic.title,learner_message:msg,teacher_response:turn.teacher_response,B_output:bOutput,X_output:xOutput,A_brief:a.output.learner_brief_for_B,evidence_id:current.id,visuals_rendered:false});
  turn.status='complete';turn.completed_at=new Date().toISOString();turn.summary=traceSummary(turn);flush();
  // State write is only permitted after both structured model outputs and X alignment validate.
  write(r.stateFile,state);fs.renameSync(r.pending,r.complete);
  return {status:'complete',session_id:o.sessionId,turn_id:o.turnId,topic:topic.title,estimated_usd:+spent.toFixed(8),retrieval_real_minilm:true,A_validation:true,B_beats:bOutput.beats.length,X_beats:xOutput.moments.length,trace:r.complete,state:r.stateFile,teacher_response:turn.teacher_response,storyboard:bOutput.beats.map((beat,i)=>({id:beat.id,narration:beat.narration,scene:xOutput.moments[i].scene_description,cues:xOutput.moments[i].cues})),no_real_renderer:true};
 }catch(e){if(turn.status!=='manual_review_required_unsafe_to_retry'&&turn.status!=='manual_review_required_unknown_cost')turn.status='manual_review_required_after_failure';turn.failure=String(e.stack??e.message);flush();throw Error(String(e.message)+'\nPaid-turn trace retained: '+r.pending+'\nDo NOT rerun this turn ID automatically.');}
}
export async function main(argv=process.argv.slice(2)){const o=parseArgs(argv);if(o.mode==='plan')return basePlan(o);if(o.mode==='preflight')return await preflight(o);if(o.mode==='retrieval-check')return await retrievalCheck(o);return await modelTurn(o);}
const thisModule=path.resolve(fileURLToPath(import.meta.url));if(process.argv[1]&&path.resolve(process.argv[1])===thisModule)main().then(v=>{console.log(JSON.stringify(v,null,2));}).catch(e=>{console.error(String(e.message));process.exitCode=1;});
