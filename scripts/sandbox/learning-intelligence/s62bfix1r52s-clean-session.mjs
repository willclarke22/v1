#!/usr/bin/env node
/** R5.2S CLEAN SESSION RESET (local-only, no providers, no DB writes).
 * Safely derives an active new session with one topic absent. The original is
 * NEVER edited. Deliberately does not carry old paid prompt/response traces.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const OUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const EXPECTED_BRANCH='myway/learning-sandbox-v3_7a';
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const TURN=/^t[0-9]{4,}$/;
const SOURCE_KEYS=['schema','stage','learner','topics','observations','records','turns','version','semantic_index','root_backfill_history','scene_contracts','probe_attempts'];
const FORBIDDEN_SENSITIVE=/(?:spanish|espa[nñ]ol|\bhaber\b|\bhab[ií]a\b)/i;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const clone=x=>structuredClone(x);
const err=(x)=>{throw Error('R52S RESET: '+x);};
const assert=(v,m)=>{if(!v)err(m);};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx',mode:0o600});
function sessionPath(base,id){assert(ID.test(id??''),'invalid session identifier');return path.join(base,id);}
function safeWalk(dir){
 const result=[];
 function walk(d,relative=''){
  if(!fs.existsSync(d))return;
  const st=fs.lstatSync(d);assert(st.isDirectory()&&!st.isSymbolicLink(),'source contains a link/non-directory');
  for(const item of fs.readdirSync(d,{withFileTypes:true})){
   const rel=path.posix.join(relative,item.name),p=path.join(d,item.name);
   if(item.isSymbolicLink())err('source contains symbolic link: '+rel);
   if(item.isDirectory()){walk(p,rel);continue;}
   assert(item.isFile(),'source contains unusual file: '+rel);
   result.push(rel);
  }
 }
 walk(dir);return result.sort();
}
export function fingerprintDirectory(dir){
 const hashes=safeWalk(dir).map(n=>n+'\0'+sha(fs.readFileSync(path.join(dir,...n.split('/'))))+'\n');
 return {fingerprint:sha(hashes.join('')),file_count:hashes.length};
}
function noPending(dir){
 for(const folder of ['turns','retries','root-backfill']){
  const p=path.join(dir,folder);
  if(fs.existsSync(p)&&fs.readdirSync(p).some(n=>n.endsWith('.pending.json')))err('pending paid operation present in '+folder+'; no reset allowed until reviewed');
 }
}
function collectEvidenceRefs(record){
 const e=record.evidence??{},ids=[];
 for(const v of Object.values(e))if(Array.isArray(v))for(const x of v){
  if(typeof x==='string')ids.push(x);else if(x&&typeof x==='object'&&typeof x.id==='string')ids.push(x.id);
 }
 for(const rev of record.revisions??[])for(const item of rev.evidence??[])if(item?.id)ids.push(item.id);
 return ids;
}
function scanForExcludedContent(obj,topicId){
 const s=JSON.stringify(obj);
 assert(!s.includes(topicId),'excluded topic id leaked into new state');
 assert(!FORBIDDEN_SENSITIVE.test(s),'excluded language or content leaked into new state');
}
function cleanObservation(obs,retained,sourceTurnTopics){
 const c=clone(obs);
 assert(retained.has(c.topic_id),'observation references excluded topic');
 const oldPrevious=c.conditions?.prior_teacher_turn_id;
 if(oldPrevious && !retained.has(sourceTurnTopics.get(oldPrevious))){
  c.teaching_exposure_before_attempt=null;
  c.conditions={...c.conditions,prior_teacher_message_present:false,prior_teacher_turn_id:null,prior_exposure_removed_for_clean_continuation:true};
 }
 return c;
}
function cleanTurn(turn,{dropHistoricalBrief}){
 // Only the fields actually used by current history display, routing and
 // teaching scene continuity. Drop repair provenance, model input packets and
 // historical A narrative whenever excluded history could have influenced it.
 const allow=['runtime_patch_version','turn_id','topic_id','topic_title','learner_message','teacher_response','B_output','X_output','probe_plan','scene_contract_id','scene_contract','visuals_rendered','probe_opportunity'];
 const result={};for(const k of allow)if(Object.hasOwn(turn,k))result[k]=clone(turn[k]);
 if(!dropHistoricalBrief && Object.hasOwn(turn,'A_brief'))result.A_brief=clone(turn.A_brief);
 result.evidence_id=turn.evidence_id;
 return result;
}
function cleanRoot(record,retained,knownEvidence){
 if(!(record.topics??[]).every(t=>retained.has(t)))return null;
 if(!(record.possible_instances??[]).every(id=>typeof id!=='string'||!id.startsWith('topic_')||retained.has(id)))return null;
 if(!collectEvidenceRefs(record).every(id=>knownEvidence.has(id)))return null;
 return clone(record);
}
/** Pure projection, no I/O. Excludes unknown fields to prevent stealth context. */
export function deriveCleanState(state,{sourceId,targetId,excludedTopicId,sourceFingerprint}){
 assert(state?.schema==='myway_goldloop_human_v1'&&state.learner===sourceId,'source learner state mismatch');
 assert(SOURCE_KEYS.every(k=>Object.hasOwn(state,k)),'source has missing expected fields');
 const unexpected=Object.keys(state).filter(k=>!SOURCE_KEYS.includes(k));
 assert(unexpected.length===0,'unreviewed state fields: '+unexpected.join(', '));
 for(const k of ['topics','observations','records','turns','scene_contracts','probe_attempts','root_backfill_history'])assert(Array.isArray(state[k]),k+' is not an array');
 const found=state.topics.filter(t=>t.id===excludedTopicId);
 assert(found.length===1,'target topic must exist exactly once');
 const retained=new Set(state.topics.filter(t=>t.id!==excludedTopicId).map(t=>t.id));
 assert(retained.size>0,'reset would remove all topics');
 const sourceTurnTopics=new Map(state.turns.map(t=>[t.turn_id,t.topic_id]));
 const firstExcluded=state.turns.findIndex(t=>t.topic_id===excludedTopicId);
 assert(firstExcluded>=0,'no turns belong to excluded topic');
 const topics=state.topics.filter(t=>retained.has(t.id)).map(clone);
 const turns=state.turns.filter(t=>retained.has(t.topic_id)).map(t=>cleanTurn(t,{dropHistoricalBrief:state.turns.indexOf(t)>firstExcluded}));
 const retainedTurnIds=new Set(turns.map(t=>t.turn_id));
 assert(turns.every(t=>TURN.test(t.turn_id)),'invalid retained turn IDs');
 const observations=state.observations.filter(o=>retained.has(o.topic_id)).map(o=>cleanObservation(o,retained,sourceTurnTopics));
 const knownEvidence=new Set(observations.map(o=>o.id));
 const records=state.records.map(r=>cleanRoot(r,retained,knownEvidence)).filter(Boolean);
 const scene_contracts=state.scene_contracts.filter(s=>retained.has(s.topic_id)&&retainedTurnIds.has(s.source_turn_id)).map(clone);
 const probe_attempts=state.probe_attempts.filter(a=>retained.has(a.topic_id)&&retainedTurnIds.has(a.turn_id)).map(clone);
 const index={version:state.semantic_index?.version??'myway_semantic_index_v1',provider:state.semantic_index?.provider??'local_minilm_http_127_0_0_1_8001_embed',dimension:state.semantic_index?.dimension??384,vectors:{}};
 const max_source_turn_number=Math.max(0,...state.turns.map(t=>Number(t.turn_id?.slice(1))||0));
 const out={schema:state.schema,stage:state.stage,learner:targetId,topics,observations,records,turns,version:state.version,semantic_index:index,root_backfill_history:clone(state.root_backfill_history),scene_contracts,probe_attempts,derived_session:{schema:'myway_r52s_clean_continuation_v1',source_fingerprint:sourceFingerprint,source_max_turn_number:max_source_turn_number,original_model_traces_not_carried:true,semantic_cache_cleared:true,original_session_untouched:true}};
 // All original model payloads, discarded revisions, and source trace files are
 // intentionally excluded. Audit records are minimal and cannot reconstruct them.
 scanForExcludedContent(out,excludedTopicId);
 for(const r of records){assert(r.topics.every(id=>retained.has(id)),'root references removed topic');assert(collectEvidenceRefs(r).every(id=>knownEvidence.has(id)),'root references missing evidence');}
 for(const o of observations){const p=o.conditions?.prior_teacher_turn_id;if(p)assert(retainedTurnIds.has(p),'stale teacher predecessor');}
 const counts={topics_before:state.topics.length,topics_after:topics.length,turns_before:state.turns.length,turns_after:turns.length,observations_before:state.observations.length,observations_after:observations.length,roots_before:state.records.length,roots_after:records.length,scenes_before:state.scene_contracts.length,scenes_after:scene_contracts.length,attempts_before:state.probe_attempts.length,attempts_after:probe_attempts.length,cached_vectors_before:Object.keys(state.semantic_index?.vectors??{}).length,cached_vectors_after:0};
 return {state:out,counts,retainedTurnIds};
}
function traceProjection(sourceTrace,turn,targetId){
 assert(sourceTrace.status==='complete'&&sourceTrace.turn_id===turn.turn_id,'retained original trace is missing or incomplete '+turn.turn_id);
 const calls=(sourceTrace.calls??[]).map(x=>({role:x.role,model:x.model,status:'historical_returned_no_payload',estimated_usd:x.estimated_usd??null,request_sha256:x.request_sha256??null,response_sha256:x.response_sha256??null,usage:x.usage??null}));
 return {schema:'myway_r52s_sanitized_historical_trace_v1',session_id:targetId,turn_id:turn.turn_id,topic_id:turn.topic_id,status:'complete',source_trace_sha256:sha(JSON.stringify(sourceTrace)),started_at:sourceTrace.started_at??null,completed_at:sourceTrace.completed_at??null,total_estimated_usd:sourceTrace.total_estimated_usd??null,calls,route:null,A:null,B:null,X:null,sanitization:{model_requests_and_responses_omitted:true,not_a_new_paid_turn:true,other_topic_context_not_replayed:true,teaching_content_from_state:true}};
}
function readSource(sourceDir,sourceId,topicId,targetId){
 assert(fs.existsSync(path.join(sourceDir,'state.json')),'source state.json missing');
 noPending(sourceDir);
 const state=read(path.join(sourceDir,'state.json'));
 const fp=fingerprintDirectory(sourceDir);
 const derived=deriveCleanState(state,{sourceId,targetId,excludedTopicId:topicId,sourceFingerprint:fp.fingerprint});
 for(const t of derived.state.turns){
  const p=path.join(sourceDir,'turns',t.turn_id+'.json');
  assert(fs.existsSync(p),'missing retained paid trace '+t.turn_id);
  const trace=read(p);assert(trace.status==='complete','retained trace not complete '+t.turn_id);
 }
 const retainedFeedbackFiles=[];
 for(const folder of ['feedback','retries','probe-attempts']){
  const dir=path.join(sourceDir,folder);if(!fs.existsSync(dir))continue;
  for(const filename of fs.readdirSync(dir).filter(x=>x.endsWith('.json'))){
   const item=read(path.join(dir,filename));
   if(derived.retainedTurnIds.has(item.turn_id))retainedFeedbackFiles.push(folder+'/'+filename);
  }
 }
 // Current source has no feedback/retries/attempts for retained turns. Future
 // versions with such data need a reviewed migration, never silent deletion.
 assert(retainedFeedbackFiles.length===0,'retained-topic feedback/probe file migration needs review: '+retainedFeedbackFiles.join(', '));
 return {sourceDir,sourceId,topicId,targetId,state,fp,derived};
}
export function previewFromDir(base,{sourceId,targetId,topicId}){
 assert(sourceId!==targetId,'source and destination must differ');
 const src=sessionPath(base,sourceId),dest=sessionPath(base,targetId);
 const data=readSource(src,sourceId,topicId,targetId);
 return {status:'preview_only_no_writes',source_session:sourceId,target_session:targetId,source_fingerprint:data.fp.fingerprint,source_files:data.fp.file_count,blocked_pending:false,target_exists:fs.existsSync(dest),...data.derived.counts,model_calls:0,embedding_calls:0,source_unchanged:true,requires_explicit_apply:true};
}
export function applyFromDir(base,{sourceId,targetId,topicId,expectedFingerprint}){
 assert(sourceId!==targetId,'source and destination must differ');
 assert(/^[0-9a-f]{64}$/.test(expectedFingerprint??''),'expected source fingerprint required');
 const src=sessionPath(base,sourceId),dest=sessionPath(base,targetId);
 assert(!fs.existsSync(dest),'target session already exists; refusing overwrite');
 const data=readSource(src,sourceId,topicId,targetId);
 assert(data.fp.fingerprint===expectedFingerprint,'source changed after preview; rerun preview');
 const stage=path.join(base,'.r52s-staging-'+crypto.randomBytes(10).toString('hex'));
 let wrote=false;
 try{
  fs.mkdirSync(stage,{recursive:false,mode:0o700});wrote=true;
  fs.mkdirSync(path.join(stage,'turns'));
  fs.mkdirSync(path.join(stage,'inputs'));
  for(const t of data.derived.state.turns){
   const originalTrace=read(path.join(src,'turns',t.turn_id+'.json'));
   const projected=traceProjection(originalTrace,t,targetId);
   write(path.join(stage,'turns',t.turn_id+'.json'),projected);
   fs.writeFileSync(path.join(stage,'inputs',t.turn_id+'.txt'),t.learner_message,{flag:'wx',mode:0o600});
  }
  write(path.join(stage,'state.json'),data.derived.state);
  assert(fingerprintDirectory(src).fingerprint===expectedFingerprint,'source changed while building projection');
  verifyFromDir(stage,{targetId,topicId,sourceId});
  assert(!fs.existsSync(dest),'target appeared during write; refusing overwrite');
  fs.renameSync(stage,dest);
  wrote=false;
  return {status:'created_new_session',source_session:sourceId,target_session:targetId,source_unchanged:true,model_calls:0,embedding_calls:0,local_state_write_only:true,...data.derived.counts,new_session_directory:dest,verified:true};
 }finally{if(wrote)fs.rmSync(stage,{recursive:true,force:true});}
}
export function verifyFromDir(dir,{targetId,topicId,sourceId=null}){
 const s=read(path.join(dir,'state.json'));
 assert(s.schema==='myway_goldloop_human_v1'&&s.learner===targetId,'bad derived state identity');
 assert(s.derived_session?.schema==='myway_r52s_clean_continuation_v1','not a derived clean session');
 const expected=new Set(s.topics.map(t=>t.id)),evidence=new Set(s.observations.map(o=>o.id)),turnIds=new Set(s.turns.map(t=>t.turn_id));
 assert(!expected.has(topicId),'excluded topic still exists');
 scanForExcludedContent(s,topicId);
 assert(Object.keys(s.semantic_index.vectors).length===0,'cached vectors not cleared');
 assert(s.turns.length>0&&s.topics.length>0,'unexpected empty derived session');
 assert(s.turns.every(t=>expected.has(t.topic_id)),'retained turn points to removed topic');
 assert(s.observations.every(o=>expected.has(o.topic_id)),'observation topic no longer exists');
 assert(s.records.every(r=>r.topics.every(t=>expected.has(t))&&collectEvidenceRefs(r).every(e=>evidence.has(e))),'dangling root reference');
 assert(s.scene_contracts.every(x=>expected.has(x.topic_id)&&turnIds.has(x.source_turn_id)),'dangling scene');
 assert(s.probe_attempts.every(x=>expected.has(x.topic_id)&&turnIds.has(x.turn_id)),'dangling attempt');
 const all=safeWalk(dir);
 for(const f of all){
  assert(/^state\.json$|^turns\/t\d{4,}\.json$|^inputs\/t\d{4,}\.txt$/.test(f),'unexpected raw file in derived session: '+f);
  assert(!FORBIDDEN_SENSITIVE.test(fs.readFileSync(path.join(dir,...f.split('/')),'utf8')),'excluded content found in '+f);
 }
 for(const t of s.turns){
  assert(fs.existsSync(path.join(dir,'turns',t.turn_id+'.json'))&&fs.existsSync(path.join(dir,'inputs',t.turn_id+'.txt')),'missing sanitized turn or input');
  const tr=read(path.join(dir,'turns',t.turn_id+'.json'));
  assert(tr.schema==='myway_r52s_sanitized_historical_trace_v1'&&tr.status==='complete'&&tr.session_id===targetId,'unexpected unredacted historical trace');
  assert(tr.calls.every(c=>!Object.hasOwn(c,'request')&&!Object.hasOwn(c,'response_raw')),'raw model response leaked');
  assert(fs.readFileSync(path.join(dir,'inputs',t.turn_id+'.txt'),'utf8')===t.learner_message,'input and state mismatch');
 }
 if(sourceId)assert(sourceId!==targetId,'source and target same');
 return {status:'clean_session_verified',session:targetId,topics:s.topics.length,turns:s.turns.length,observations:s.observations.length,roots:s.records.length,scenes:s.scene_contracts.length,probe_attempts:s.probe_attempts.length,embedding_cache_entries:0,raw_prior_model_payloads:0,model_calls:0,embedding_calls:0};
}
function args(argv){const out={mode:null,sourceId:'goldpilot01',targetId:'goldpilot01_clean01',topicId:'topic_challenges_with_spanish_grammar',expectedFingerprint:null,ack:null};for(let i=0;i<argv.length;i++){
 const k=argv[i];const attr={'--mode':'mode','--source-session':'sourceId','--target-session':'targetId','--topic-id':'topicId','--expected-source-fingerprint':'expectedFingerprint','--acknowledge':'ack'}[k];assert(attr&&i+1<argv.length,'unknown/missing option '+k);assert(out[attr]===null||['sourceId','targetId','topicId'].includes(attr),'duplicate option '+k);out[attr]=argv[++i];}
 assert(['preview','apply','verify'].includes(out.mode),'--mode preview|apply|verify required');assert(ID.test(out.sourceId)&&ID.test(out.targetId)&&ID.test(out.topicId),'invalid argument ID');
 if(out.mode==='apply')assert(out.ack==='CREATE_NEW_SESSION_ONLY','explicit acknowledgement required for apply');else assert(out.ack===null&&!out.expectedFingerprint,'verify/preview cannot create or modify sessions');
 return out;
}
async function cli(){const o=args(process.argv.slice(2));const source=sessionPath(OUT,o.sourceId),target=sessionPath(OUT,o.targetId);
 if(o.mode==='preview')return previewFromDir(OUT,o);
 if(o.mode==='verify')return verifyFromDir(target,o);
 const branch=spawnSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8',timeout:10000});
 assert(branch.status===0&&branch.stdout.trim()===EXPECTED_BRANCH,'wrong Git branch; original main protected');
 assert(fs.existsSync(OUT)&&fs.existsSync(source),'GoldLoop source session missing');
 return applyFromDir(OUT,{...o,expectedFingerprint:o.expectedFingerprint});
}
const THIS=path.resolve(fileURLToPath(import.meta.url));
if(process.argv[1]&&path.resolve(process.argv[1])===THIS)cli().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(String(e.stack??e));process.exitCode=1;});
