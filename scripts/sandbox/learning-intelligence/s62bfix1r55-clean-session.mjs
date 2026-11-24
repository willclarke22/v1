#!/usr/bin/env node
/** R5.4S Spanish-clean continuation, standalone local tool. No model calls, DB, network or edits to source. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const REPO = path.resolve(process.env.MYWAY_PROJECT_ROOT || process.cwd());
const BASE = path.join(REPO,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const EXPECTED_BRANCH = 'myway/learning-sandbox-v3_7a';
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const TURN = /^t[0-9]{4,}$/;
const STATE_KEYS = ['derived_session','schema','stage','learner','topics','observations','records','turns','version','semantic_index','root_backfill_history','scene_contracts','probe_attempts'];
const LANGUAGE = /\bspanish\b|espa[nñ]ol|\bhaber\b|\bhab[ií]a\b/i;
const SOURCE = 'goldpilot01_clean04';
const TARGET = 'goldpilot01_clean05';
const fail = message => {throw new Error('MYWAY R55 CLEAN RESET: '+message);};
const check = (truth,message) => {if(!truth)fail(message);};
const clone = x => structuredClone(x);
const sha = input => crypto.createHash('sha256').update(input).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const write = (file,obj) => fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n',{flag:'wx',mode:0o600});
function sessionPath(id) {check(ID.test(id),'invalid session identifier'); return path.join(BASE,id);}
function listFiles(dir) {
 const result=[];
 function visit(at,rel='') {
  check(fs.existsSync(at),'missing folder '+at);
  check(fs.lstatSync(at).isDirectory()&&!fs.lstatSync(at).isSymbolicLink(),'invalid directory '+at);
  for(const ent of fs.readdirSync(at,{withFileTypes:true})) {
   const local=path.posix.join(rel,ent.name),p=path.join(at,ent.name);
   check(!ent.isSymbolicLink(),'symlink encountered: '+local);
   if(ent.isDirectory())visit(p,local);
   else {check(ent.isFile(),'unusual file '+local);result.push(local);}
  }
 }
 visit(dir);return result.sort();
}
function fingerprint(dir) {
 const files=listFiles(dir);
 const content=files.map(f=>f+'\0'+sha(fs.readFileSync(path.join(dir,...f.split('/'))))+'\n').join('');
 return {fingerprint:sha(content),file_count:files.length};
}
function noPending(dir,state,excludedTopicIds) {
 const excludedTurnIds=new Set(state.turns.filter(t=>excludedTopicIds.includes(t.topic_id)).map(t=>t.turn_id));
 for(const folder of ['turns','retries','root-backfill','experience-designs','revision-plans','creative-designs','probe-continuations']) {
  const p=path.join(dir,folder);if(!fs.existsSync(p))continue;
  for(const name of fs.readdirSync(p).filter(n=>n.endsWith('.pending.json'))){
   // Never modify source traces. A pending research artifact may be LEFT BEHIND
   // only if it belongs to an excluded Spanish turn; a retained-topic pending
   // operation always blocks a reset.
   if(['turns','retries','root-backfill','probe-continuations'].includes(folder))fail('pending paid operation found in '+folder);
   const trace=read(path.join(p,name)),turnId=trace.turn_id??trace.source_turn_id??name.match(/^t\d{4,}/)?.[0];
   check(typeof turnId==='string'&&excludedTurnIds.has(turnId),'pending research operation is not exclusively Spanish: '+folder+'/'+name);
  }
 }
}
function spanishTopicIds(state) {
 const ids=state.topics.filter(t=>LANGUAGE.test(String(t.title??''))).map(t=>t.id);
 check(ids.length>0,'no Spanish-labelled topic found; refusing speculative reset');
 check(ids.length===new Set(ids).size,'duplicate excluded topic ids');
 // Require known previously inspected Spanish IDs when they remain in the current session.
 for(const id of ['topic_understanding_the_spanish_prono','topic_challenges_with_spanish_listeni']) {
  if(state.topics.some(t=>t.id===id))check(ids.includes(id),'known Spanish topic omitted');
 }
 return ids;
}
function evidenceRefs(record) {
 const ids=[];
 for(const value of Object.values(record.evidence??{}))if(Array.isArray(value))for(const x of value){
  if(typeof x==='string')ids.push(x);else if(x&&typeof x==='object'&&typeof x.id==='string')ids.push(x.id);
 }
 for(const r of record.revisions??[])for(const x of r.evidence??[])if(x?.id)ids.push(x.id);
 return ids;
}
function forbiddenCheck(obj,excludedIds) {
 const s=typeof obj==='string'?obj:JSON.stringify(obj);
 for(const id of excludedIds)check(!s.includes(id),'Spanish topic id leaked into result: '+id);
 check(!LANGUAGE.test(s),'Spanish text leaked into retained result');
}
function projectState(state,excludedIds,sourceFingerprint) {
 check(state?.schema==='myway_goldloop_human_v1'&&state.learner===SOURCE,'wrong source learner state');
 check(STATE_KEYS.every(k=>Object.hasOwn(state,k)),'missing state field');
 const extra=Object.keys(state).filter(k=>!STATE_KEYS.includes(k));
 check(extra.length===0,'unreviewed state fields: '+extra.join(','));
 for(const k of ['topics','observations','records','turns','root_backfill_history','scene_contracts','probe_attempts'])check(Array.isArray(state[k]),'bad state field '+k);
 const excluded=new Set(excludedIds);
 const retained=new Set(state.topics.filter(t=>!excluded.has(t.id)).map(t=>t.id));
 check(retained.size>0,'reset would remove all topics');
 const firstExcluded=state.turns.findIndex(t=>excluded.has(t.topic_id));
 check(firstExcluded>=0,'no Spanish turns found');
 const sourceTurnTopic=new Map(state.turns.map(t=>[t.turn_id,t.topic_id]));
 const topics=state.topics.filter(t=>retained.has(t.id)).map(clone);
 const turns=state.turns.filter(t=>retained.has(t.topic_id)).map(t=>{
  const keep=['runtime_patch_version','turn_id','topic_id','topic_title','learner_message','teacher_response','B_output','X_output','probe_plan','scene_contract_id','scene_contract','visuals_rendered','probe_opportunity'];
  if(state.turns.indexOf(t)<firstExcluded)keep.push('A_brief');
  const projected={};for(const k of keep)if(Object.hasOwn(t,k))projected[k]=clone(t[k]);
  projected.evidence_id=t.evidence_id;return projected;
 });
 const turnIds=new Set(turns.map(t=>t.turn_id));
 check(turns.every(t=>TURN.test(t.turn_id)),'invalid retained turn id');
 const observations=state.observations.filter(o=>retained.has(o.topic_id)).map(o=>{
  const c=clone(o),previous=c.conditions?.prior_teacher_turn_id;
  if(previous&&!retained.has(sourceTurnTopic.get(previous))){
   c.teaching_exposure_before_attempt=null;
   c.conditions={...c.conditions,prior_teacher_message_present:false,prior_teacher_turn_id:null,prior_exposure_removed_for_clean_continuation:true};
  }
  return c;
 });
 const evidence=new Set(observations.map(o=>o.id));
 const records=state.records.filter(r=>(r.topics??[]).every(x=>retained.has(x)) &&
  (r.possible_instances??[]).every(x=>typeof x!=='string'||!x.startsWith('topic_')||retained.has(x)) &&
  evidenceRefs(r).every(x=>evidence.has(x))).map(clone);
 const scene_contracts=state.scene_contracts.filter(x=>retained.has(x.topic_id)&&turnIds.has(x.source_turn_id)).map(clone);
 const probe_attempts=state.probe_attempts.filter(x=>retained.has(x.topic_id)&&turnIds.has(x.turn_id)).map(clone);
 const maxTurn=Math.max(state.derived_session?.source_max_turn_number??0,0,...state.turns.map(t=>Number(t.turn_id?.slice(1))||0));
 const idx=state.semantic_index??{};
 const result={schema:state.schema,stage:state.stage,learner:TARGET,topics,observations,records,turns,version:state.version,
  semantic_index:{version:idx.version??'myway_semantic_index_v1',provider:idx.provider??'local_minilm_http_127_0_0_1_8001_embed',dimension:idx.dimension??384,vectors:{}},
  root_backfill_history:clone(state.root_backfill_history),scene_contracts,probe_attempts,
  derived_session:{schema:'myway_r52s_clean_continuation_v1',source_fingerprint:sourceFingerprint,source_max_turn_number:maxTurn,
   original_model_traces_not_carried:true,semantic_cache_cleared:true,original_session_untouched:true,reset_excluded_topic_count:excludedIds.length}};
 forbiddenCheck(result,excludedIds);
 check(records.every(r=>(r.topics??[]).every(x=>retained.has(x))&&evidenceRefs(r).every(x=>evidence.has(x))),'dangling root evidence');
 check(observations.every(o=>!o.conditions?.prior_teacher_turn_id||turnIds.has(o.conditions.prior_teacher_turn_id)),'dangling teacher context');
 return {state:result,turnIds,counts:{topics_before:state.topics.length,topics_after:topics.length,turns_before:state.turns.length,turns_after:turns.length,
  observations_before:state.observations.length,observations_after:observations.length,roots_before:state.records.length,roots_after:records.length,
  scenes_before:state.scene_contracts.length,scenes_after:scene_contracts.length,attempts_before:state.probe_attempts.length,attempts_after:probe_attempts.length,
  cached_vectors_before:Object.keys(idx.vectors??{}).length,cached_vectors_after:0}};
}
function traceProjection(trace,turn){
 check(trace.status==='complete'&&trace.turn_id===turn.turn_id,'missing/incomplete prior trace '+turn.turn_id);
 return {schema:'myway_r52s_sanitized_historical_trace_v1',session_id:TARGET,turn_id:turn.turn_id,topic_id:turn.topic_id,status:'complete',
  source_trace_sha256:sha(JSON.stringify(trace)),started_at:trace.started_at??null,completed_at:trace.completed_at??null,
  total_estimated_usd:trace.total_estimated_usd??null,
  calls:(trace.calls??[]).map(c=>({role:c.role,model:c.model,status:'historical_returned_no_payload',estimated_usd:c.estimated_usd??null,
   request_sha256:c.request_sha256??null,response_sha256:c.response_sha256??null,usage:c.usage??null})),
  route:null,A:null,B:null,X:null,sanitization:{model_requests_and_responses_omitted:true,not_a_new_paid_turn:true,
   other_topic_context_not_replayed:true,teaching_content_from_state:true}};
}
function getSource() {
 const src=sessionPath(SOURCE);check(fs.existsSync(src),'missing source session '+SOURCE);
 const state=read(path.join(src,'state.json'));
 const excludedIds=spanishTopicIds(state);noPending(src,state,excludedIds);const fp=fingerprint(src);
 const projection=projectState(state,excludedIds,fp.fingerprint);
 for(const t of projection.state.turns){
  const traceFile=path.join(src,'turns',t.turn_id+'.json');check(fs.existsSync(traceFile),'missing turn trace '+t.turn_id);
  check(read(traceFile).status==='complete','incomplete trace '+t.turn_id);
 }
 // Do not silently lose any non-Spanish feedback, attempts, revisions or creative designs.
 const retainedFiles=[];
 for(const folder of ['feedback','retries','probe-attempts','probe-continuations','experience-designs','revision-plans','creative-designs']) {
  const dir=path.join(src,folder);if(!fs.existsSync(dir))continue;
  for(const file of fs.readdirSync(dir).filter(n=>n.endsWith('.json'))) {
   const item=read(path.join(dir,file));
   if(projection.turnIds.has(item.turn_id)||projection.turnIds.has(item.source_turn)||projection.turnIds.has(item.source_turn_id))retainedFiles.push(folder+'/'+file);
  }
 }
 check(retainedFiles.length===0,'unmigrated non-Spanish attachments need review: '+retainedFiles.join(','));
 return {src,state,excludedIds,fp,projection};
}
function verify(dir,source=null) {
 const state=read(path.join(dir,'state.json'));
 check(state.schema==='myway_goldloop_human_v1'&&state.learner===TARGET,'wrong target identity');
 check(state.derived_session?.schema==='myway_r52s_clean_continuation_v1','missing clean-session provenance');
 const excluded=source?spanishTopicIds(source):[];
 forbiddenCheck(state,excluded);
 const topics=new Set(state.topics.map(t=>t.id)),turnIds=new Set(state.turns.map(t=>t.turn_id)),obs=new Set(state.observations.map(o=>o.id));
 check(!state.topics.some(t=>LANGUAGE.test(t.title??'')),'Spanish topic remains');
 check(Object.keys(state.semantic_index.vectors).length===0,'semantic cache not empty');
 check(state.topics.length>0&&state.turns.length>0,'empty derived session');
 check(state.turns.every(t=>topics.has(t.topic_id)),'dangling turn topic');
 check(state.observations.every(o=>topics.has(o.topic_id)),'dangling observation topic');
 check(state.records.every(r=>r.topics.every(x=>topics.has(x))&&evidenceRefs(r).every(x=>obs.has(x))),'dangling root');
 check(state.scene_contracts.every(x=>topics.has(x.topic_id)&&turnIds.has(x.source_turn_id)),'dangling scene');
 check(state.probe_attempts.every(x=>topics.has(x.topic_id)&&turnIds.has(x.turn_id)),'dangling attempt');
 const files=listFiles(dir);
 for(const file of files) {
  check(/^state\.json$|^turns\/t\d{4,}\.json$|^inputs\/t\d{4,}\.txt$/.test(file),'unexpected raw file in target: '+file);
  forbiddenCheck(fs.readFileSync(path.join(dir,...file.split('/')),'utf8'),excluded);
 }
 for(const t of state.turns) {
  const tr=read(path.join(dir,'turns',t.turn_id+'.json'));
  check(tr.schema==='myway_r52s_sanitized_historical_trace_v1'&&tr.session_id===TARGET&&tr.status==='complete','bad historical trace');
  check(tr.calls.every(c=>!Object.hasOwn(c,'request')&&!Object.hasOwn(c,'response_raw')),'raw model payload leaked');
  check(fs.readFileSync(path.join(dir,'inputs',t.turn_id+'.txt'),'utf8')===t.learner_message,'input/state mismatch');
 }
 return {status:'clean_session_verified',session:TARGET,topics:state.topics.length,turns:state.turns.length,observations:state.observations.length,
  roots:state.records.length,scenes:state.scene_contracts.length,probe_attempts:state.probe_attempts.length,embedding_cache_entries:0,
  source_unchanged:true,model_calls:0,embedding_calls:0};
}
function branchCheck() {
 const r=spawnSync('git',['-C',REPO,'branch','--show-current'],{encoding:'utf8',timeout:10000});
 check(r.status===0&&r.stdout.trim()===EXPECTED_BRANCH,'wrong Git branch: only '+EXPECTED_BRANCH+' permitted');
}
function main(){
 const argv=process.argv.slice(2),mode=argv[0],fingerprintExpected=argv[1];
 check(['preview','apply','verify'].includes(mode)&&argv.length<=(mode==='apply'?2:1),'usage: node reset-spanish.mjs preview|apply <fingerprint>|verify');
 branchCheck();
 const target=sessionPath(TARGET);
 if(mode==='verify'){check(fs.existsSync(target),'target session not found');return verify(target,fs.existsSync(sessionPath(SOURCE))?read(path.join(sessionPath(SOURCE),'state.json')):null);}
 const source=getSource();
 if(mode==='preview')return {status:'preview_only_no_writes',source_session:SOURCE,target_session:TARGET,excluded_topic_ids:source.excludedIds,
  source_fingerprint:source.fp.fingerprint,source_files:source.fp.file_count,target_exists:fs.existsSync(target),blocked_pending:false,
  ...source.projection.counts,source_unchanged:true,model_calls:0,embedding_calls:0};
 check(/^[0-9a-f]{64}$/.test(fingerprintExpected??''),'apply requires 64-character fingerprint from preview');
 check(source.fp.fingerprint===fingerprintExpected,'source changed since preview; aborting');
 check(!fs.existsSync(target),'target already exists; refusing overwrite');
 const stage=path.join(BASE,'.r55-staging-'+crypto.randomBytes(12).toString('hex'));
 let staged=false;
 try{
  fs.mkdirSync(stage,{mode:0o700});staged=true;
  fs.mkdirSync(path.join(stage,'turns'));
  fs.mkdirSync(path.join(stage,'inputs'));
  for(const t of source.projection.state.turns){
   const trace=read(path.join(source.src,'turns',t.turn_id+'.json'));
   write(path.join(stage,'turns',t.turn_id+'.json'),traceProjection(trace,t));
   fs.writeFileSync(path.join(stage,'inputs',t.turn_id+'.txt'),t.learner_message,{flag:'wx',mode:0o600});
  }
  write(path.join(stage,'state.json'),source.projection.state);
  check(fingerprint(source.src).fingerprint===fingerprintExpected,'source changed during projection; aborting');
  const report=verify(stage,source.state);
  check(!fs.existsSync(target),'target appeared during creation; aborting');
  fs.renameSync(stage,target);staged=false;
  return {status:'created_new_session',source_session:SOURCE,target_session:TARGET,excluded_topic_ids:source.excludedIds,
   ...source.projection.counts,verified:true,verification:report,original_source_unchanged:true,model_calls:0,embedding_calls:0,
   target_directory:target};
 }finally{if(staged)fs.rmSync(stage,{recursive:true,force:true});}
}
try {console.log(JSON.stringify(main(),null,2));}catch(e){console.error(String(e.stack??e));process.exitCode=1;}
