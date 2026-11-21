#!/usr/bin/env node
/** One-time offline recovery of the reviewed goldpilot01 t0004 X-cue validation failure.
 * Read-only by default. No imports of provider, retrieval, or model-runtime modules.
 * This script preserves original paid raw outputs and backs up all touched data.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  sha, clone, validateRoute, routeTopic, validateB, validateX,
  makeObservation, makeXInput, teacherText, traceSummary,
} from './s62bfix1r43-goldloop-core.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const DIR=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop','goldpilot01');
const STATE=path.join(DIR,'state.json');
const PENDING=path.join(DIR,'turns','t0004.pending.json');
const COMPLETE=path.join(DIR,'turns','t0004.json');
const INPUT=path.join(DIR,'inputs','t0004.txt');
const EXPECTED_RAW_X_SHA='080044b1bee8005166bc6bb7527f5eb1a46435912873df70d1b278d49f8eddb1';
const EXPECTED_INPUT_TEXT='Why is it that I can run for longer than someone and I have better cardio than them, but I get more tired when treading water than someone else even though I can swim?';
const assert=(v,why)=>{if(!v)throw Error('RECOVERY ABORT: '+why);};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const stable=x=>JSON.stringify(x);
const json=x=>JSON.stringify(x,null,2)+'\n';
const writePrivate=(p,s)=>fs.writeFileSync(p,s,{flag:'wx',mode:0o600});

function prepare(){
  for(const p of [STATE,PENDING,INPUT])assert(fs.existsSync(p),'Missing '+p);
  assert(!fs.existsSync(COMPLETE),'Completed t0004 already exists; no recovery needed');
  const stateOriginal=fs.readFileSync(STATE),pendingOriginal=fs.readFileSync(PENDING),inputOriginal=fs.readFileSync(INPUT);
  const state=read(STATE),pending=read(PENDING);
  assert(state.schema==='myway_goldloop_human_v1'&&state.learner==='goldpilot01','Unexpected session state');
  assert(Array.isArray(state.turns)&&state.turns.length===3&&state.turns.every((t,i)=>t.turn_id===`t000${i+1}`),'Expected only completed turns t0001..t0003');
  assert(Array.isArray(state.topics)&&state.topics.length===1&&Array.isArray(state.records)&&Array.isArray(state.observations)&&state.observations.length===3,'Unexpected prior history: manually review rather than overwrite');
  assert(!state.turns.some(t=>t.turn_id==='t0004')&&!state.observations.some(o=>o.id==='t0004-IN'),'t0004 is already present in state');
  assert(Number.isInteger(state.version),'Unexpected version');
  assert(pending.schema==='myway_goldloop_turn_v1'&&pending.turn_id==='t0004'&&pending.session_id==='goldpilot01','Pending identity mismatch');
  assert(pending.status==='manual_review_required_after_failure'&&typeof pending.failure==='string'&&pending.failure.includes('X cue quote does not occur in B b06'),'This recovery applies ONLY to the reviewed b06 cue mismatch');
  assert(pending.X===null,'Pending X field unexpectedly populated');
  assert(Array.isArray(pending.calls)&&pending.calls.length===5&&pending.calls.every(c=>c.status==='returned'),'Not all original model calls returned; do not recover');
  assert(pending.calls.map(c=>c.role).join(',')==='ROUTE,A,A,B,X','Unexpected provider call order');
  for(const c of pending.calls){
    assert(typeof c.response_raw==='string'&&sha(c.response_raw)===c.response_sha256,'Raw model response SHA mismatch: '+c.role);
    assert(typeof c.request==='object'&&sha(c.request)===c.request_sha256,'Original request SHA mismatch: '+c.role);
    assert(typeof c.estimated_usd==='number'&&Number.isFinite(c.estimated_usd),'Missing call cost');
  }
  const xcall=pending.calls.at(-1);
  assert(xcall.response_sha256===EXPECTED_RAW_X_SHA,'This is not the reviewed Model X response');
  assert(sha(inputOriginal)===pending.learner_message_file_sha256,'Learner input file changed since model run');
  assert(inputOriginal.toString('utf8').trim()===EXPECTED_INPUT_TEXT,'This is not the reviewed learner question');
  const reconstructed=clone(state);
  const {resolved_topic,...rawRoute}=pending.route??{};
  const route=validateRoute(rawRoute,reconstructed.topics);
  assert(route.decision==='new','Expected the routed topic switch');
  const topic=routeTopic(reconstructed,route);
  assert(stable(topic)===stable(resolved_topic),'Recovered topic differs from originally routed topic');
  const current=makeObservation(reconstructed,topic,EXPECTED_INPUT_TEXT,'t0004');
  assert(stable(current)===stable(pending.current),'Original observation mismatch');
  assert(pending.A?.validation?.assessment_valid===true&&Array.isArray(pending.A.changes)&&pending.A.changes.length===0,'Assessment/memory state requires manual adjudication');
  assert(Array.isArray(pending.A.output?.memory_decisions)&&pending.A.output.memory_decisions.length===0,'Memory changes are not safe for this recovery');
  const b=validateB(pending.B?.output);
  assert(pending.B.input?.learner_message===EXPECTED_INPUT_TEXT,'B did not receive the same learner message');
  const teacher=teacherText(b);
  assert(teacher===pending.teacher_response,'Preserved teacher narration mismatch');
  const xInputFromPaidRequest=JSON.parse(xcall.request.messages.at(-1).content);
  assert(stable(xInputFromPaidRequest)===stable(makeXInput(b,pending.B.input)),'Paid X request context does not match B and original input');
  const originalX=JSON.parse(xcall.response_raw);
  assert(Array.isArray(originalX.moments)&&originalX.moments.length===b.beats.length,'Original X beat coverage mismatch');
  const repairedX=clone(originalX);
  const invalid=[];
  for(let i=0;i<repairedX.moments.length;i++){
    const m=repairedX.moments[i],beat=b.beats[i];
    assert(m.beat_id===beat.id,'Moment order mismatch');
    const keep=[];
    for(let j=0;j<m.cues.length;j++){
      const cue=m.cues[j];
      if(beat.narration.includes(cue.narration_quote)){keep.push(cue);continue;}
      invalid.push({beat_id:beat.id,cue_index:j,narration_quote:cue.narration_quote,on_screen_change:cue.on_screen_change});
      assert(beat.id==='b06'&&cue.narration_quote==='Think about an activity you do that feels easier or harder than running','Unexpected invalid X cue');
      assert(beat.learner_action.includes(cue.narration_quote),'Bad cue does not actually originate from learner_action');
    }
    m.cues=keep;
  }
  assert(invalid.length===1,'Expected precisely one learner-action cue to remove');
  const checkedX=validateX(repairedX,b);
  reconstructed.observations.push(current);
  reconstructed.turns.push({turn_id:'t0004',topic_id:topic.id,topic_title:topic.title,learner_message:EXPECTED_INPUT_TEXT,teacher_response:teacher,B_output:b,X_output:checkedX,A_brief:clone(pending.A.output.learner_brief_for_B),evidence_id:current.id,visuals_rendered:false});
  // NOTE: MiniLM vector for t0004 is intentionally NOT fabricated; it will be computed on demand later.
  const complete=clone(pending);
  complete.X={input:xInputFromPaidRequest,output:checkedX,alignment_verified:true};
  complete.status='complete';
  delete complete.failure;
  complete.completed_at=new Date().toISOString();
  complete.recovery={kind:'manual_reviewed_offline_cue_recovery_v1',original_raw_X_sha256:EXPECTED_RAW_X_SHA,original_pending_sha256:sha(pendingOriginal.toString()),removed_from_display_cues:invalid,reason:'X quoted B.learner_action instead of B.narration; host does not pronounce learner_action',source_truth:'All five paid response_raw values preserved without modification; no paid or embedding calls',semantic_index_note:'New observation vector may be recomputed by real MiniLM next retrieval'};
  complete.summary=traceSummary(complete);
  return {stateOriginal,pendingOriginal,newState:json(reconstructed),newComplete:json(complete),topic,invalid,oldEstimatedUsd:pending.total_estimated_usd,priorTurns:state.turns.length};
}

function commit(plan){
  // Permanent before-state backups; no automatic cleanup.
  const backup=path.join(DIR,'recovery-backups','t0004-manual-review-v1');
  assert(!fs.existsSync(backup),'Recovery backup already exists. Stop and inspect '+backup);
  fs.mkdirSync(backup,{recursive:true});
  writePrivate(path.join(backup,'state.before.json'),plan.stateOriginal);
  writePrivate(path.join(backup,'t0004.pending.before.json'),plan.pendingOriginal);
  writePrivate(path.join(backup,'README.txt'),`Manual recovery backup for goldpilot01 t0004. Restore only after expert review; never re-send model calls.\n`);
  const tempState=STATE+'.recover-t0004.tmp';
  const tempComplete=COMPLETE+'.recover-t0004.tmp';
  assert(!fs.existsSync(tempState)&&!fs.existsSync(tempComplete),'Prior interrupted recovery temp files found');
  writePrivate(tempState,plan.newState);
  writePrivate(tempComplete,plan.newComplete);
  // Recheck originals after all validation; fail closed for concurrent writers.
  assert(fs.readFileSync(STATE).equals(plan.stateOriginal)&&fs.readFileSync(PENDING).equals(plan.pendingOriginal),'Session files changed since dry-run');
  fs.renameSync(tempState,STATE);
  fs.renameSync(tempComplete,COMPLETE);
  // Original failed trace remains in immutable-ish backup, not pending. Do not delete until complete exists.
  assert(fs.existsSync(COMPLETE),'Completed trace missing after state write');
  const archived=path.join(backup,'t0004.pending.original.json');
  fs.renameSync(PENDING,archived);
  return {status:'recovered_and_unblocked',state:STATE,complete_trace:COMPLETE,original_pending_preserved_at:archived,backups:backup};
}

try{
  const args=process.argv.slice(2);
  assert(args.length===1&&['--check','--commit'].includes(args[0]),'Usage: node s62bfix1r43-recover-t0004-offline-v1.mjs --check|--commit');
  const plan=prepare();
  const result={session_id:'goldpilot01',turn_id:'t0004',mode:args[0],read_only:args[0]==='--check',prior_completed_turns:plan.priorTurns,recovered_completed_turns:plan.priorTurns+1,new_topic:plan.topic.title,removed_x_cues:plan.invalid.length,removed_cue_source:'B.learner_action (not spoken narration)',original_raw_X_preserved:true,estimated_original_usd:plan.oldEstimatedUsd,api_calls:0,embedding_calls:0,db_calls:0};
  if(args[0]==='--commit')Object.assign(result,commit(plan));
  else result.status='ready_to_recover_if_checks_look_correct';
  console.log(JSON.stringify(result,null,2));
}catch(e){console.error(String(e.stack??e.message));process.exitCode=1;}
