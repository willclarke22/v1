#!/usr/bin/env node
/** R4.9 exact reviewed-session OFFLINE recovery: t0007 paid A/B, no X call.
 * No provider/embedding calls; reject unless local state/pending exactly match supplied reviewed export.
 * Text-only X host placeholders are explicit, never misattributed to Model X.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,clone,validateRoute,routeTopic,makeObservation,teacherText,traceSummary,validateX} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
import {makeSceneContract} from './s62bfix1r46-probe-core.mjs';
import {applyA} from './s62bfix1r2-core.mjs';
import {normalizeBBeats} from './s62bfix1r49-b-beats.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const SESSION='goldpilot01',TURN='t0007';
const DIR=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop',SESSION);
const STATE=path.join(DIR,'state.json'),PENDING=path.join(DIR,'turns',TURN+'.pending.json'),COMPLETE=path.join(DIR,'turns',TURN+'.json'),INPUT=path.join(DIR,'inputs',TURN+'.txt');
const BACKUP=path.join(DIR,'recovery-backups','t0007-r49-reviewed-B-overrun-text-only');
const REVIEWED={state_sha256:'a25599da5d94d438315a39b683f0b0706e424952caf3520d913328d886ed014c',pending_sha256:'0ebae48124306605d22ab3e5fe42fb643f7efbd07aaf85970cf104f9cc9f8951',original_B_response_sha256:'6301190f410ef9a1935a8366b140746ba955754091b5e4593f8915b92b5bc01b'};
const assert=(v,why)=>{if(!v)throw Error('R49 RECOVERY REFUSED: '+why);};
const stable=v=>JSON.stringify(v);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const exclusive=(p,data)=>fs.writeFileSync(p,data,{flag:'wx',mode:0o600});
function build(){
 for(const p of [STATE,PENDING,INPUT])assert(fs.existsSync(p),'Required file missing: '+p);
 assert(!fs.existsSync(COMPLETE),'Turn already completed; do not recover twice');
 assert(!fs.existsSync(BACKUP),'Recovery backup already present; manual review');
 const stateBefore=fs.readFileSync(STATE),pendingBefore=fs.readFileSync(PENDING),inputBefore=fs.readFileSync(INPUT);
 assert(sha(stateBefore.toString())===REVIEWED.state_sha256,'Session state differs from reviewed upload');
 assert(sha(pendingBefore.toString())===REVIEWED.pending_sha256,'Pending trace differs from reviewed upload');
 const state=read(STATE),tr=read(PENDING),msg=inputBefore.toString('utf8').replace(/^\uFEFF/,'').trim();
 assert(state.schema==='myway_goldloop_human_v1'&&state.learner===SESSION&&state.turns.length===6&&state.turns.at(-1).turn_id==='t0006','Expected reviewed six-turn state');
 assert(tr.session_id===SESSION&&tr.turn_id===TURN&&tr.status==='manual_review_required_after_failure'&&String(tr.failure).includes('B beats must be 1..8'),'Not the reviewed B overrun');
 assert(tr.X===null&&tr.B===null,'B/X were already committed in pending trace; manual review');
 assert(sha(inputBefore)===tr.learner_message_file_sha256&&msg.length>0,'Original message differs');
 assert(!state.observations.some(o=>o.id==='t0007-IN')&&!state.turns.some(t=>t.turn_id===TURN),'Turn 7 evidence already present');
 assert(fs.readdirSync(path.join(DIR,'turns')).filter(n=>n.endsWith('.pending.json')).every(n=>n===TURN+'.pending.json'),'Another pending turn exists');
 assert(Array.isArray(tr.calls)&&tr.calls.length===4&&tr.calls.map(x=>x.role).join(',')==='ROUTE,A,A,B','Unexpected model call sequence; no X expected');
 for(const c of tr.calls){assert(c.status==='returned'&&typeof c.response_raw==='string'&&sha(c.response_raw)===c.response_sha256,'Altered/missing paid '+c.role+' response');assert(sha(c.request)===c.request_sha256,'Paid request hash mismatch');assert(Number.isFinite(c.estimated_usd)&&c.estimated_usd>=0,'Missing cost record');}
 assert(tr.calls.at(-1).response_sha256===REVIEWED.original_B_response_sha256,'B response not the reviewed ten-beat output');
 assert(tr.A?.validation?.assessment_valid===true&&Array.isArray(tr.A.changes),'Expected validated A output');
 const rebuilt=clone(state); const {resolved_topic,...routeRaw}=tr.route;const route=validateRoute(routeRaw,rebuilt.topics);
 assert(route.decision==='existing'&&route.existing_topic_id==='topic_challenges_with_spanish_grammar','Unexpected topic routing');
 const topic=routeTopic(rebuilt,route);assert(stable(topic)===stable(resolved_topic),'Resolved topic changed');
 const current=makeObservation(rebuilt,topic,msg,TURN);
 assert(stable(current)===stable(tr.current),'Learner evidence mismatch');
 assert(stable(applyA(rebuilt,tr.A.output,current.id))===stable(tr.A.changes),'Model A memory replay differs');
 const bInput=JSON.parse(tr.calls.at(-1).request.messages.at(-1).content);
 assert(bInput.learner_message===msg,'B request was not for this exact learner message');
 const rawB=JSON.parse(tr.calls.at(-1).response_raw);
 const {output:b,report:bReport}=normalizeBBeats(rawB);
 assert(rawB.beats.length===10&&b.beats.length===8&&bReport.original_narration_unchanged,'Expected lossless 10-to-8 grouping');
 const narration=teacherText(b);
 assert(narration===rawB.beats.map(z=>z.narration).join('\n\n'),'Raw narrated words changed');
 const placeholder={visual_concept:'TEXT-ONLY RECOVERY — no Model X storyboard was generated',continuity_plan:'No new Model X scene exists for this turn. Show neutral placeholders; do not claim storyboard generation.',implementation_status:'textual_storyboard_only',limitations:'Host-generated recovery placeholders, NOT Model X output or interactive visuals; no graphics rendered.',moments:b.beats.map(beat=>({beat_id:beat.id,scene_description:'NO MODEL X SCENE — This turn stopped before an X call. The words of Model B are preserved for reading; this is only a labelled host placeholder.',transition_from_previous:'Host-only placeholder; no X-generated transition.',cues:[{anchor_id:'a00',on_screen_change:'Host placeholder only. No visual activity or animation was generated.'}],accuracy_boundaries:'Do not infer a visualization exists or was generated by Model X.',possible_interaction:'No actual interactive scene generated for this beat.'}))};
 const x=validateX(placeholder,b);
 const xAudit={status:'text_only_recovery_no_X_call',expected_b_beats:8,authored_x_moments:0,host_only_placeholder_beat_ids:b.beats.map(z=>z.id),alignment_verified:false,raw_X_reply_exists:false,visuals_rendered:false,teacher_narration_preserved:true};
 const scene=makeSceneContract(rebuilt,TURN,topic,b,x);
 scene.scene_id='scene_t0007_host_text_only';scene.original_scene_turn_id=TURN;scene.source_turn_id=TURN;scene.source='host_labelled_text_only_recovery_no_Model_X_call';scene.scene_reuse='none';scene.scene_reason='No model X call was performed; host placeholders are not authored visuals.';scene.contract_sha256=sha({turnId:TURN,scene_id:scene.scene_id,x,source:scene.source});
 rebuilt.observations.push(current);
 rebuilt.scene_contracts??=[];rebuilt.scene_contracts.push(scene);
 rebuilt.turns.push({runtime_patch_version:'r49_offline_B_overrun_text_only',turn_id:TURN,topic_id:topic.id,topic_title:topic.title,learner_message:msg,teacher_response:narration,B_output:b,X_output:x,probe_plan:b.probe_plan,scene_contract_id:scene.scene_id,scene_contract:scene,A_brief:tr.A.output.learner_brief_for_B,evidence_id:current.id,visuals_rendered:false,probe_opportunity:{teaching_mode:b.teaching_mode,offered_actions:b.beats.map(z=>({beat_id:z.id,learner_action:z.learner_action})).filter(z=>z.learner_action),status:b.probe_plan.offer?'offered_not_observed_or_scored':'not_offered',structured_probe_plan:b.probe_plan},recovery_provenance:{kind:'text_only_host_placeholder_no_Model_X_call',lossless_B_normalization:bReport,original_paid_raw_B_sha256:tr.calls.at(-1).response_sha256}});
 const complete=clone(tr);complete.B={input:bInput,output:b,normalization:bReport};complete.teacher_response=narration;complete.X={input:null,output:x,alignment_verified:false,coverage_report:xAudit,normalization_note:'Host placeholders; no Model X request was ever made for t0007'};complete.scene_contract=scene;complete.status='complete';complete.completed_at=new Date().toISOString();delete complete.failure;
 complete.recovery={kind:'offline_reviewed_r49_B_ten_beats_text_only',original_pending_sha256:sha(pendingBefore.toString()),original_B_response_sha256:tr.calls.at(-1).response_sha256,original_paid_calls_preserved:true,model_calls_added:0,embedding_calls_added:0,visual_X_model_calls:0,host_only_visual_placeholders:true,lossless_B_report:bReport};complete.summary=traceSummary(complete);
 return {stateBefore,pendingBefore,stateAfter:JSON.stringify(rebuilt,null,2)+'\n',completeAfter:JSON.stringify(complete,null,2)+'\n',bReport,xAudit,cost:tr.total_estimated_usd,oldTurns:6,newTurns:rebuilt.turns.length,recordsBefore:state.records.length,recordsAfter:rebuilt.records.length};
}
function commit(p){
 fs.mkdirSync(BACKUP,{recursive:true});
 exclusive(path.join(BACKUP,'state.before.json'),p.stateBefore);exclusive(path.join(BACKUP,'t0007.pending.before.json'),p.pendingBefore);
 exclusive(path.join(BACKUP,'README.txt'),'R4.9 offline recovery backups. Original paid model replies remain in the archived pending and complete trace. Model X was NOT called.\n');
 const tmpState=STATE+'.r49-t7-temp',tmpComplete=COMPLETE+'.r49-t7-temp';assert(!fs.existsSync(tmpState)&&!fs.existsSync(tmpComplete),'Unfinished previous temporary recovery');
 exclusive(tmpState,p.stateAfter);exclusive(tmpComplete,p.completeAfter);
 assert(fs.readFileSync(STATE).equals(p.stateBefore)&&fs.readFileSync(PENDING).equals(p.pendingBefore),'Session modified since preview; restore from backup and inspect');
 fs.renameSync(tmpState,STATE);fs.renameSync(tmpComplete,COMPLETE);
 const archived=path.join(BACKUP,'t0007.pending.original.json');fs.renameSync(PENDING,archived);
 return {status:'recovered_and_unblocked',complete_trace:COMPLETE,original_pending_backed_up:archived,backup_folder:BACKUP};
}
try{const args=process.argv.slice(2);assert(args.length===1&&['--check','--commit'].includes(args[0]),'Usage --check or --commit');const p=build(),result={mode:args[0],read_only:args[0]==='--check',status:'ready_for_explicit_commit',session_id:SESSION,turn_id:TURN,previous_turns:p.oldTurns,recovered_turns:p.newTurns,topic:'Challenges with Spanish Grammar and Sentence Structure',original_paid_calls:4,new_model_calls:0,new_embedding_calls:0,estimated_original_cost_usd:p.cost,old_memory_records:p.recordsBefore,new_memory_records:p.recordsAfter,B_beat_normalization:p.bReport,visual_recovery:p.xAudit};if(args[0]==='--commit')Object.assign(result,commit(p));console.log(JSON.stringify(result,null,2));}
catch(e){console.error(String(e.stack??e.message));process.exitCode=1;}
