/** Local-only learner feedback on specific narration or storyboard spans.
 * This is self-reported experience evidence, NOT a demonstrated misunderstanding.
 * No production DB or external storage. Original paid traces remain unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
export const ROOT=path.resolve(HERE,'../../..');
export const OUTPUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
export const ID=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
export const REASONS=['lost','bored','too_simple','too_complicated','other'];
export const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
export const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{mode:0o600});
export const clone=x=>structuredClone(x);
export function assert(cond,msg){if(!cond)throw Error('R44: '+msg);}
export function dirFor(session){assert(ID.test(session??''),'Invalid session ID');return path.join(OUTPUT,session);}
export function stateFor(session){const dir=dirFor(session),p=path.join(dir,'state.json');assert(fs.existsSync(p),'Session has no saved state');const s=read(p);assert(s.schema==='myway_goldloop_human_v1'&&s.learner===session&&Array.isArray(s.turns)&&Array.isArray(s.observations),'Unrecognized session state');return {dir,state:s,statePath:p};}
export function turnFor(state,turnId){assert(/^t\d{3,}$/.test(turnId??''),'Invalid turn ID');const turn=state.turns.find(t=>t.turn_id===turnId);assert(!!turn&&Array.isArray(turn.B_output?.beats)&&Array.isArray(turn.X_output?.moments),'Turn has no complete B/X storyboard');return turn;}
export function activeSha(turn){return sha({B_output:turn.B_output,X_output:turn.X_output});}
export function fullText(turn,span){const i=turn.B_output.beats.findIndex(b=>b.id===span.beat_id);assert(i>=0,'Unknown beat ID');if(span.surface==='narration')return turn.B_output.beats[i].narration;if(span.surface==='visual')return turn.X_output.moments[i]?.scene_description??'';throw Error('R44: Unknown selection surface');}
export function validateSelections(turn,spans){assert(Array.isArray(spans)&&spans.length>=1&&spans.length<=8,'Select 1-8 text spans');const output=[];let total=0;
 for(let i=0;i<spans.length;i++){const s=spans[i];assert(s&&typeof s==='object'&&['narration','visual'].includes(s.surface),'Invalid selection surface');assert(typeof s.beat_id==='string'&&/^b\d{2}$/.test(s.beat_id),'Invalid beat identifier');assert(REASONS.includes(s.reason),'Choose why the section needs a retry');assert(typeof s.note==='string'&&s.note.length<=350,'Notes may not exceed 350 characters');const txt=fullText(turn,s);
  assert(Number.isSafeInteger(s.start)&&Number.isSafeInteger(s.end)&&s.start>=0&&s.end>s.start&&s.end<=txt.length,'Selection offset is outside the original text');const excerpt=txt.slice(s.start,s.end);assert(excerpt.trim().length>=3&&excerpt.length<=1150,'Select at least 3 and at most 1150 characters');total+=excerpt.length;assert(total<=3500,'Too much text selected');
  output.push({selection_id:'s'+String(i+1).padStart(2,'0'),surface:s.surface,beat_id:s.beat_id,start:s.start,end:s.end,reason:s.reason,note:s.note.trim(),excerpt});}
 for(let i=0;i<output.length;i++)for(let j=i+1;j<output.length;j++){const a=output[i],b=output[j];if(a.beat_id===b.beat_id&&a.surface===b.surface)assert(a.end<=b.start||b.end<=a.start,'Selections cannot overlap');}
 return output;
}
export function listFeedback(session){const dir=path.join(dirFor(session),'feedback');if(!fs.existsSync(dir))return [];return fs.readdirSync(dir).filter(n=>/^fb\d{4,}\.json$/.test(n)).sort().map(n=>read(path.join(dir,n)));}
export function listRetries(session){const dir=path.join(dirFor(session),'retries');if(!fs.existsSync(dir))return [];return fs.readdirSync(dir).filter(n=>/^r\d{4,}\.json$/.test(n)).sort().map(n=>read(path.join(dir,n)));}
export function hasPending(session){const d=dirFor(session);for(const folder of ['turns','retries']){const p=path.join(d,folder);if(fs.existsSync(p)&&fs.readdirSync(p).some(x=>x.endsWith('.pending.json')))return true;}return false;}
function nextFile(dir,prefix){fs.mkdirSync(dir,{recursive:true});for(let i=1;i<10000;i++){const id=prefix+String(i).padStart(4,'0');if(!fs.existsSync(path.join(dir,id+'.json'))&&!fs.existsSync(path.join(dir,id+'.pending.json')))return id;}throw Error('R44: Event ID space full');}
export function nextRetryId(session){return nextFile(path.join(dirFor(session),'retries'),'r');}
export function saveFeedback(session,turnId,baseSha,rawSelections){const {dir,state,statePath}=stateFor(session);assert(!hasPending(session),'A paid turn is pending. Inspect it before changing session state');const turn=turnFor(state,turnId);assert(activeSha(turn)===baseSha,'Teaching content changed since highlighting; reload the page');const selected=validateSelections(turn,rawSelections);
 const fd=path.join(dir,'feedback'),id=nextFile(fd,'fb'),stamp=new Date().toISOString();const record={schema:'myway_goldloop_highlight_feedback_v1',feedback_id:id,session_id:session,turn_id:turnId,topic_id:turn.topic_id,base_sha256:baseSha,created_at:stamp,selections:selected,provenance:'Learner-selected text and self-reported teaching experience; NOT an objective probe or established cognitive root',retry_ids:[]};
 const observations=selected.map(s=>({id:`${id}-${s.selection_id}`,topic_id:turn.topic_id,kind:'human_teaching_experience_feedback',text:`On ${turnId} ${s.beat_id}, learner marked ${s.surface} text (${s.reason}): “${s.excerpt}”${s.note?' Learner note: '+s.note:''}`,compact_index_text:`${s.reason} ${s.excerpt} ${s.note}`.slice(0,3000),conditions:{source:'user_selected_span',status:'subjective_experience_feedback_not_scored_understanding',turn_id:turnId,beat_id:s.beat_id,surface:s.surface,reason:s.reason,selection_offsets:[s.start,s.end],feedback_id:id,assumed_mastery:false},teaching_exposure_before_attempt:turn.teacher_response,not_human_ground_truth:false}));
 assert(state.observations.length+observations.length<=20000,'Observation limit reached');state.observations.push(...observations);const original=fs.readFileSync(statePath);const feedbackFile=path.join(fd,id+'.json');const backupDir=path.join(dir,'feedback-backups');fs.mkdirSync(backupDir,{recursive:true});const backup=path.join(backupDir,`${id}-state-before.json`);fs.writeFileSync(backup,original,{flag:'wx',mode:0o600});
 const temp=path.join(dir,`.state-${id}-${crypto.randomBytes(6).toString('hex')}.tmp`);
 try{fs.writeFileSync(feedbackFile,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});write(temp,state);fs.renameSync(temp,statePath);}catch(e){try{fs.unlinkSync(temp);}catch{}if(fs.existsSync(feedbackFile))try{fs.unlinkSync(feedbackFile);}catch{}throw e;}
 return {feedback_id:id,added_evidence_ids:observations.map(x=>x.id),record};
}
