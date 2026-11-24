/** R5.4: save actual browser activity events into the same A-readable probe evidence path.
 * No academic correctness, execution fidelity or independent mastery is assumed.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ID,TURN,VARIANTS,sha,validateActivity,validateEvents} from './s62bfix1r54-creative-core.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export const BASE=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const check=(v,m)=>{if(!v)throw Error('R54 creative store: '+m);};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const newWrite=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx',mode:0o600});
function atomic(p,x){const tmp=p+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';try{newWrite(tmp,x);fs.renameSync(tmp,p);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
export function designFor(session,turn,variant,{base=BASE}={}){
 check(ID.test(session)&&TURN.test(turn)&&VARIANTS.has(variant),'invalid reference');
 const fp=path.join(base,session,'creative-designs',turn+'-'+variant+'.json');
 if(!fs.existsSync(fp))return null;
 const data=read(fp);if(data.status!=='complete')return null;
 const record=data.output;
 check(record?.session_id===session&&record.turn_id===turn&&record.variant===variant,'design identity mismatch');
 validateActivity(record.activity);
 check(sha(record.activity)===record.activity_sha256,'design content hash mismatch');
 return record;
}
export function commitCreativeAttempt(body,{base=BASE}={}){
 check(ID.test(body?.session_id)&&TURN.test(body?.turn_id)&&VARIANTS.has(body?.variant),'invalid session/turn/variant');
 const dir=path.join(base,body.session_id),stateFile=path.join(dir,'state.json');check(fs.existsSync(stateFile),'state missing');
 const state=read(stateFile);check(state.schema==='myway_goldloop_human_v1'&&state.learner===body.session_id,'wrong session state');
 const turn=state.turns?.at(-1);check(turn?.turn_id===body.turn_id,'Only latest completed turn may accept a creative activity submission');
 check(!(fs.readdirSync(path.join(dir,'turns')).some(x=>x.endsWith('.pending.json'))),'pending model turn');
 const artifact=designFor(body.session_id,body.turn_id,body.variant,{base});check(artifact?.topic_id===turn.topic_id,'creative design missing or topic mismatch');
 const events=validateEvents(body.events??[]);const answer=String(body.learner_answer??'');check(answer.length<=3500,'learner answer too long');
 check(events.length>0||answer.trim().length>0,'An activity attempt needs a learner response or recorded interaction');
 const existing=state.probe_attempts??[];let n=1;while(existing.some(x=>x.attempt_id==='pa'+String(n).padStart(4,'0')))n++;
 const attemptId='pa'+String(n).padStart(4,'0'),evidenceId=attemptId+'-IN';
 const ev=(events.map(x=>x.action+': '+x.detail+(x.view_text?' [visible: '+x.view_text.slice(0,180)+']':'')).join(' | ')).slice(0,2600);
 const info=`Activity: ${artifact.activity.title}. B design: ${String(artifact.brief??'').slice(0,850)}. Learner response: ${answer.slice(0,1750)}. Recorded browser event reports: ${ev}. Unscored and not independently verified.`.slice(0,3900);
 const hints=events.filter(e=>/hint|help|replay/i.test(e.action)).length;
 const visibleStatic=artifact.activity.html_fragment.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,1000);
 const attempt={schema:'myway_human_probe_attempt_v1',attempt_id:attemptId,evidence_id:evidenceId,session_id:body.session_id,turn_id:body.turn_id,topic_id:turn.topic_id,scene_id:turn.scene_contract_id??'unknown',modality:'creative_sandbox',probe_purpose:'B/X freely authored experience research: '+artifact.activity.title,task_as_offered:'Creative sandbox ('+body.variant+'): '+artifact.activity.title+' | Visible static material (approximate, not full interactive state): '+visibleStatic+' | Evidence notes: '+artifact.activity.evidence_notes,task_sha256:sha(artifact.activity),status:'submitted',learner_answer:answer,selection:'',ordered_items:[],matches:{},selected_items:[],values:{},hints_requested:hints,action_log:events,experience_design_sha256:artifact.activity_sha256,experience_design_id:body.turn_id+'-'+body.variant,experience_steps:[],submitted_at:new Date().toISOString(),evidence_limits:['Model-generated HTML/JS executed inside isolated iframe; event reports are instrumented but not independently verified','No independent correctness scoring or mastery assumption','No claim that proposed visual/simulation mechanics were scientifically accurate','B/X educational intentions are hypotheses, not learner evidence'],model_calls:0,embedding_calls:0};
 const obs={id:evidenceId,topic_id:turn.topic_id,kind:'human_probe_attempt',text:info,compact_index_text:info.slice(0,2800),conditions:{source:'creative_sandbox_r54',status:'attempt_unscored',attempt_id:attemptId,source_turn_id:body.turn_id,scene_id:attempt.scene_id,modality:'creative_sandbox',variant:body.variant,experience_design_id:attempt.experience_design_id,experience_design_sha256:artifact.activity_sha256,actual_hint_count:hints,learner_actions_recorded:events.length>0,not_independently_scored:true,assumed_mastery:false,untrusted_activity_event_reports:true},teaching_exposure_before_attempt:turn.teacher_response,not_human_ground_truth:false};
 check(!state.observations.some(x=>x.id===evidenceId),'duplicate evidence');
 const next=structuredClone(state);next.probe_attempts=[...existing,attempt];next.observations.push(obs);
 const backups=path.join(dir,'probe-state-backups'),out=path.join(dir,'probe-attempts');fs.mkdirSync(backups,{recursive:true});fs.mkdirSync(out,{recursive:true});
 fs.copyFileSync(stateFile,path.join(backups,attemptId+'-state-before.json'),fs.constants.COPYFILE_EXCL);
 atomic(stateFile,next);newWrite(path.join(out,attemptId+'.json'),attempt);
 return {status:'saved_unscored',attempt_id:attemptId,evidence_id:evidenceId,model_calls:0,variant:body.variant,can_continue_via_A_B_X:true};
}
