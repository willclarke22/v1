#!/usr/bin/env node
/** R4.7v2 recovery compatibility: original paid B response is revalidated, not a derived normalized copy.
 * Carefully bounded t0006 OFFLINE recovery: no model calls, no MiniLM, no silent paid retry.
 * Only for session goldpilot01, B beat coverage error. Requires all paid replies returned.
 * Read-only check is default; explicit --commit with state/pending backups.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,clone,validateRoute,routeTopic,makeObservation,teacherText,traceSummary,makeXInput} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
import {validateBWithProbe,makeSceneContract} from './s62bfix1r46-probe-core.mjs';
import {applyA} from './s62bfix1r2-core.mjs';
import {reconcileXCoverage} from './s62bfix1r47-x-coverage.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const SESSION='goldpilot01',TURN_ID='t0006';
const DIR=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop',SESSION);
const STATE=path.join(DIR,'state.json'),PENDING=path.join(DIR,'turns',TURN_ID+'.pending.json');
const COMPLETE=path.join(DIR,'turns',TURN_ID+'.json'),INPUT=path.join(DIR,'inputs',TURN_ID+'.txt');
const BACKUP=path.join(DIR,'recovery-backups','t0006-r47v2-coverage-offline');
const assert=(v,why)=>{if(!v)throw Error('RECOVERY REFUSED: '+why);};
const stable=x=>JSON.stringify(x);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const writeExclusive=(p,x)=>fs.writeFileSync(p,x,{flag:'wx',mode:0o600});
function prepare(){
 for(const p of [STATE,PENDING,INPUT])assert(fs.existsSync(p),'Required file missing: '+p);
 assert(!fs.existsSync(COMPLETE),'Completed t0006 already exists; no action allowed');
 assert(!fs.existsSync(BACKUP),'Prior R4.7 t0006 recovery backup exists; manually inspect before retrying');
 const stateBefore=fs.readFileSync(STATE),pendingBefore=fs.readFileSync(PENDING),inputBefore=fs.readFileSync(INPUT);
 const st=read(STATE),tr=read(PENDING);const msg=inputBefore.toString('utf8').replace(/^\uFEFF/,'').trim();
 assert(st.schema==='myway_goldloop_human_v1'&&st.learner===SESSION,'Unexpected session schema or identity');
 assert(Array.isArray(st.turns)&&st.turns.length===5&&st.turns.at(-1)?.turn_id==='t0005','Expected 5 prior completed teaching turns; no timeline rewrite');
 assert(!st.turns.some(t=>t.turn_id===TURN_ID)&&!st.observations.some(o=>o.id===TURN_ID+'-IN'),'Turn 6 already appears in durable state');
 assert(tr.schema==='myway_goldloop_turn_v1'&&tr.session_id===SESSION&&tr.turn_id===TURN_ID,'Pending session/turn identity mismatch');
 assert(tr.status==='manual_review_required_after_failure'&&String(tr.failure??'').includes('X must cover every B beat'),'Not the expected X beat coverage failure');
 assert(tr.X===null,'X was already partially committed; manual review instead');
 assert(sha(inputBefore)===tr.learner_message_file_sha256&&msg.length>0&&msg.length<=4000,'Learner input integrity mismatch');
 assert(/Spanish|haber|\bse\b/i.test(msg),'This is not clearly the recorded Spanish topic-switch message; inspect before recovery');
 assert(Array.isArray(tr.calls)&&tr.calls.length>=4&&tr.calls.length<=5,'Unexpected model call count');
 assert(tr.calls[0].role==='ROUTE'&&tr.calls.at(-2).role==='B'&&tr.calls.at(-1).role==='X','Unexpected model call sequence');
 assert(tr.calls.filter(c=>c.role==='A').length>=1&&tr.calls.filter(c=>c.role==='A').length<=2,'Unexpected A calls');
 assert(fs.readdirSync(path.join(DIR,'turns')).filter(n=>n.endsWith('.pending.json')).every(n=>n===TURN_ID+'.pending.json'),'Another pending learning turn exists');
 for(const c of tr.calls){
  assert(c.status==='returned'&&typeof c.response_raw==='string'&&sha(c.response_raw)===c.response_sha256,'Unreturned/modified paid reply: '+c.role);
  assert(c.request&&sha(c.request)===c.request_sha256,'Modified request: '+c.role);
  assert(Number.isFinite(c.estimated_usd)&&c.estimated_usd>=0,'Missing estimated spend: '+c.role);
 }
 assert(Number.isFinite(tr.total_estimated_usd),'Missing total cost estimate');
 assert(tr.A?.validation?.assessment_valid===true&&tr.A.output&&Array.isArray(tr.A.changes),'Missing previously validated A assessment');
 assert(tr.B?.input&&tr.B.output&&tr.B.input.learner_message===msg,'B learner input or output mismatch');
 assert(stable(JSON.parse(tr.calls.at(-2).request.messages.at(-1).content))===stable(tr.B.input),'Original paid B request is not the saved B input');
 assert(JSON.parse(tr.calls[0].request.messages.at(-1).content).learner_message===msg,'Routing request did not use the same learner message');
 const reconstructed=clone(st),{resolved_topic,...rawRoute}=tr.route??{};
 const routed=validateRoute(rawRoute,reconstructed.topics);
 assert(routed.decision==='new','Spanish spontaneous topic switch was not recognized as new; inspect routing before recovery');
 const topic=routeTopic(reconstructed,routed);
 assert(/Spanish|espa[nñ]ol|grammar|haber|language|word order/i.test(topic.title),'New topic title does not reflect the Spanish question');
 assert(stable(topic)===stable(resolved_topic),'Routed topic mismatch with original pending result');
 const current=makeObservation(reconstructed,topic,msg,TURN_ID);
 assert(stable(current)===stable(tr.current),'Learner evidence differs from original pending');
 const resultChanges=applyA(reconstructed,tr.A.output,current.id);
 assert(stable(resultChanges)===stable(tr.A.changes),'Replayed root-memory changes differ from original A interpretation');
 // R4.6 may replace an invalid optional probe with its empty disabled plan and a
 // `disabled_reason` audit field. The normalized plan must not be revalidated as
 // if it were the raw model reply (which would reject that audit field).
 // Re-validate EXACT original paid B bytes from the hash-verified call entry,
 // then compare that deterministic validated result with the originally saved B.
 const originalPaidBRaw=JSON.parse(tr.calls.at(-2).response_raw);
 const b=validateBWithProbe(originalPaidBRaw);
 assert(stable(b)===stable(tr.B.output),'Saved B differs from the original paid reply after R4.6 validation');
 const probeReplayInfo=b.probe_plan?.disabled_reason
  ? {status:'disabled_optional_probe_from_original_R46_validation',reason:b.probe_plan.disabled_reason,no_probe_offered:true}
  : {status:'original_probe_contract_valid',no_probe_offered:!b.probe_plan?.offer};
 assert(teacherText(b)===tr.teacher_response,'B spoken narration altered');
 const reqX=tr.calls.at(-1).request;const paidXInput=JSON.parse(reqX.messages.at(-1).content);
 const expectedXInput=makeXInput(b,tr.B.input);
 assert(stable(paidXInput.B_exact_beats)===stable(expectedXInput.B_exact_beats),'X paid prompt is not grounded in original B beats');
 assert(stable(paidXInput.narration_anchor_catalog)===stable(expectedXInput.narration_anchor_catalog),'X paid anchor catalog differs from B');
 assert(stable(paidXInput.B_optional_probe_plan)===stable(b.probe_plan),'X requested a different probe plan');
 const rawX=JSON.parse(tr.calls.at(-1).response_raw);
 const {output:x,report}=reconcileXCoverage(rawX,b);
 assert(report.missing_beat_ids.length>=1,'Expected missing X beats to be diagnosed; no mutation if coverage is complete');
 const scene=makeSceneContract(reconstructed,TURN_ID,topic,b,x);
 reconstructed.observations.push(current);
 reconstructed.scene_contracts??=[];reconstructed.scene_contracts.push(scene);
 reconstructed.turns.push({runtime_patch_version:'r46_adaptive_probe_placeholder_v1_offline_r47_recovered',turn_id:TURN_ID,topic_id:topic.id,topic_title:topic.title,learner_message:msg,teacher_response:tr.teacher_response,B_output:b,X_output:x,probe_plan:b.probe_plan,scene_contract_id:scene.scene_id,scene_contract:scene,A_brief:tr.A.output.learner_brief_for_B,evidence_id:current.id,visuals_rendered:false,probe_opportunity:{teaching_mode:b.teaching_mode,offered_actions:b.beats.map(beat=>({beat_id:beat.id,learner_action:beat.learner_action})).filter(z=>z.learner_action),status:b.probe_plan?.offer?'offered_not_observed_or_scored':'not_offered',structured_probe_plan:b.probe_plan}});
 const complete=clone(tr);complete.X={input:paidXInput,output:x,alignment_verified:false,coverage_report:report,normalization_note:'Original model X raw reply preserved in calls; marked host placeholders fill missing visual beats'};
 complete.scene_contract=scene;complete.status='complete';delete complete.failure;complete.completed_at=new Date().toISOString();
 complete.recovery={kind:'offline_reviewed_r47v2_coverage_gap',original_pending_sha256:sha(pendingBefore.toString()),original_paid_x_response_sha256:tr.calls.at(-1).response_sha256,coverage_report:report,model_calls_added:0,embedding_calls_added:0,source:'Host visual holds, not Model X-authored content',raw_paid_responses_untouched:true,original_A_B_inputs_outputs_preserved:true};
 complete.summary=traceSummary(complete);
 return {stateBefore,pendingBefore,stateAfter:JSON.stringify(reconstructed,null,2)+'\n',completeAfter:JSON.stringify(complete,null,2)+'\n',report,topic,modelCalls:tr.calls.length,costUsd:tr.total_estimated_usd,probeReplayInfo};
}
function commit(p){
 fs.mkdirSync(BACKUP,{recursive:true});
 writeExclusive(path.join(BACKUP,'state.before.json'),p.stateBefore);
 writeExclusive(path.join(BACKUP,'t0006.pending.before.json'),p.pendingBefore);
 writeExclusive(path.join(BACKUP,'README.txt'),'Backups of the original pending Spanish learning turn and prior state. Zero paid calls were made to recover it. Raw provider replies were preserved.\n');
 const stTmp=STATE+'.r47v2-recovery-tmp',turnTmp=COMPLETE+'.r47v2-recovery-tmp';
 assert(!fs.existsSync(stTmp)&&!fs.existsSync(turnTmp),'Recovery temp files already exist; manual review required');
 writeExclusive(stTmp,p.stateAfter);writeExclusive(turnTmp,p.completeAfter);
 assert(fs.readFileSync(STATE).equals(p.stateBefore)&&fs.readFileSync(PENDING).equals(p.pendingBefore),'Session changed since recovery check; stop');
 fs.renameSync(stTmp,STATE);fs.renameSync(turnTmp,COMPLETE);
 assert(fs.existsSync(COMPLETE),'Completion trace was not created; manually restore backup');
 const archived=path.join(BACKUP,'t0006.pending.original.json');fs.renameSync(PENDING,archived);
 return {status:'recovered_and_unblocked',state:STATE,turn_trace:COMPLETE,original_pending_archived:archived,backups:BACKUP};
}
try{
 const cmd=process.argv.slice(2);assert(cmd.length===1&&['--check','--commit'].includes(cmd[0]),'Usage --check or --commit');
 const p=prepare(),out={mode:cmd[0],read_only:cmd[0]==='--check',session_id:SESSION,turn_id:TURN_ID,status:'ready_for_explicit_commit',topic:p.topic.title,prior_completed_turns:5,recovered_completed_turns:6,original_paid_model_calls:p.modelCalls,new_model_calls:0,new_embedding_calls:0,estimated_prior_usd:p.costUsd,coverage:p.report,probe_replay:p.probeReplayInfo};
 if(cmd[0]==='--commit')Object.assign(out,commit(p));
 console.log(JSON.stringify(out,null,2));
}catch(e){console.error(String(e.message));process.exitCode=1;}
