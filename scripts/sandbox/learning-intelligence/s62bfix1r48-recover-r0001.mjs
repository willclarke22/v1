#!/usr/bin/env node
/** One-off, user-approved editorial recovery of the exact Spanish retry uploaded Nov 21.
 * --check does not write. --commit applies explicitly disclosed editorial adjustments.
 * --reject archives the invalid paid retry without applying B or X changes.
 * All modes make ZERO API and embedding calls. Local isolated goldpilot01 only.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ROOT,OUTPUT,clone,sha,activeSha} from './s62bfix1r44-feedback-store.mjs';
import {makeSceneContract} from './s62bfix1r46-probe-core.mjs';
const SESSION='goldpilot01',TURN='t0006',RID='r0001',FID='fb0001';
const EXPECT={state:'550cff56f96a0339c6e1809108673c4f51fbdcb06928c52cb8ecdddc80c9e780',pending:'0c1d65e96b7cd10e9f3d0b3ba795c2fb2582fb27a09dc2661222d2b01920ea11',feedback:'0577ef0ceea8e772194a0262829f4e2d88f573e84e093bfb9e5111cecb1c47a0',turn:'448b7a079ff6b5b3aa738fd7626d31953e06644b9175fee9c970e91f8213db16'};
const DIR=path.join(OUTPUT,SESSION),STATE=path.join(DIR,'state.json'),PENDING=path.join(DIR,'retries',RID+'.pending.json'),FINAL=path.join(DIR,'retries',RID+'.json'),FEEDBACK=path.join(DIR,'feedback',FID+'.json'),TURNFILE=path.join(DIR,'turns',TURN+'.json'),BACKUP=path.join(DIR,'retry-backups','r48-reviewed-r0001');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assert=(v,m)=>{if(!v)throw Error('R48 reviewed retry: '+m);};
const stable=x=>JSON.stringify(x);
const writeExclusive=(p,b)=>fs.writeFileSync(p,b,{flag:'wx',mode:0o600});
const EDITORIAL={
 s01:'important helping verb',
 s02:'show an action without naming who does it (passive), or describe what people generally do (impersonal).',
 s03:' the subject acting on themselves (reflexive), or an action without a named doer (passive or impersonal)?'
};
function readVerified(p,digest,label){assert(fs.existsSync(p),'Missing '+label);const buf=fs.readFileSync(p);assert(hash(buf)===digest,label+' differs from the exact uploaded, reviewed ZIP; stop and export again');return {buf,obj:JSON.parse(buf.toString('utf8'))};}
function build(){
 assert(!fs.existsSync(FINAL)&&!fs.existsSync(BACKUP),'Retry has already been processed or backup exists; refusing');
 const state=readVerified(STATE,EXPECT.state,'state'),pending=readVerified(PENDING,EXPECT.pending,'pending retry'),feedback=readVerified(FEEDBACK,EXPECT.feedback,'feedback'),turn=readVerified(TURNFILE,EXPECT.turn,'original completed Spanish turn');
 const s=state.obj,p=pending.obj,f=feedback.obj,t=turn.obj;
 assert(s.schema==='myway_goldloop_human_v1'&&s.learner===SESSION&&s.turns?.length===6&&s.turns.at(-1).turn_id===TURN,'Expected the six-turn learning session');
 assert(s.turns.at(-1).targeted_retry_history===undefined,'Spanish teaching already changed');
 assert(p.retry_id===RID&&p.session_id===SESSION&&p.turn_id===TURN&&p.feedback_id===FID&&p.status==='manual_review_required_after_failure','Expected failed retry only');
 assert(f.feedback_id===FID&&f.turn_id===TURN&&f.selections.length===3,'Different highlighted feedback');
 assert(p.base_sha256===activeSha(s.turns.at(-1))&&p.base_sha256===f.base_sha256,'Teaching version mismatch');
 assert(Array.isArray(p.calls)&&p.calls.length===2&&p.calls[0].role==='B_RETRY'&&p.calls[1].role==='X_RETRY'&&p.calls.every(c=>c.status==='returned'),'Incomplete paid model replies');
 for(const c of p.calls){assert(sha(c.request)===c.request_sha256,'Tampered paid request '+c.role);assert(sha(c.response_raw)===c.response_sha256,'Tampered paid response '+c.role);}
 const bPaid=JSON.parse(p.calls[0].response_raw),xPaid=JSON.parse(p.calls[1].response_raw);
 assert(stable(bPaid)===stable(p.B_replacement_raw),'B paid response differs from stored raw');
 assert(p.composite_B_output?.beats?.length===5,'No saved B composite');
 assert(xPaid.moments.length===1&&xPaid.moments[0].beat_id==='b02','Not the reviewed one-beat X reply');
 assert(p.failure.includes('X must cover every B beat'),'Different pending failure');
 const base=s.turns.at(-1),b=clone(base.B_output),x=clone(base.X_output);
 const expectedIds=f.selections.map(z=>z.selection_id);
 assert(stable(expectedIds)===stable(['s01','s02','s03']),'Unexpected selection IDs');
 for(const beat of b.beats){
  const sels=f.selections.filter(z=>z.surface==='narration'&&z.beat_id===beat.id).sort((a,b)=>b.start-a.start);
  for(const selection of sels){
   assert(beat.narration.slice(selection.start,selection.end)===selection.excerpt,'Original selection moved');
   beat.narration=beat.narration.slice(0,selection.start)+EDITORIAL[selection.selection_id]+beat.narration.slice(selection.end);
  }
 }
 const bText=b.beats.map(z=>z.narration).join('\n\n');
 assert(b.beats.length===5&&bText.includes('an important helping verb')&&bText.includes("Is 'se' showing the subject acting"),'Editorial stitch did not complete');
 assert(!bText.includes('showingIs')&&!bText.includes('an helper verb'),'Known prior grammar defects remain');
 // Keep X-authored b02 scene but explicitly editorially repair its misleading passive panel label.
 const authored=xPaid.moments[0];const m=x.moments.findIndex(y=>y.beat_id==='b02');assert(m===1,'Unexpected original scene layout');
 const m2={...clone(authored)};
 assert(m2.scene_description.includes("'Actions done to someone else' with a relevant sentence"),'X scene differs from reviewed visual text');
 m2.scene_description=m2.scene_description.replace("'Actions done to someone else' with a relevant sentence","'Passive' with an example where the doer is not named");
 assert(m2.cues?.length===1&&m2.cues[0].anchor_id==='a00','Unexpected X anchor catalog');
 m2.cues=[{narration_quote:b.beats[1].narration,on_screen_change:m2.cues[0].on_screen_change}];
 x.moments[m]=m2;
 const fallback=[];for(const beatId of ['b03','b05']){
  const ix=b.beats.findIndex(z=>z.id===beatId),mm=x.moments[ix];
  assert(mm.beat_id===beatId&&mm.cues.length>=1,'No earlier X scene for '+beatId);
  // This rebinds cue timing only. Scene text stays exactly the original X-authored scene.
  mm.cues=mm.cues.map(c=>({...c,narration_quote:b.beats[ix].narration}));fallback.push(beatId);
 }
 for(let i=0;i<b.beats.length;i++){const beat=b.beats[i],mom=x.moments[i];assert(mom.beat_id===beat.id&&mom.cues.every(c=>beat.narration.includes(c.narration_quote)),'Scene cue does not correspond to new B narration '+beat.id);}
 // Unselected beats and original completed paid-turn trace must not change.
 for(const id of ['b01','b04']){const ix=b.beats.findIndex(a=>a.id===id);assert(stable(b.beats[ix])===stable(base.B_output.beats[ix])&&stable(x.moments[ix])===stable(base.X_output.moments[ix]),'Unselected beat changed');}
 const recovered=clone(s),last=recovered.turns.at(-1);
 last.B_output=b;last.X_output=x;last.teacher_response=bText;
 const latest=activeSha(last);
 const coverage={expected_affected_beat_ids:['b02','b03','b05'],x_authored_new_beat_ids:['b02'],reused_original_x_scene_beat_ids:['b03','b05'],manually_editorially_repaired_x_beat_ids:['b02'],host_reanchored_cues:['b02','b03','b05'],real_visuals_rendered:false,complete_narration_coverage:true,semantic_quality_not_independently_verified:true};
 last.targeted_retry_history=[...(last.targeted_retry_history??[]),{retry_id:RID,feedback_id:FID,base_sha256:f.base_sha256,latest_sha256:latest,time:new Date().toISOString(),editorial_recovery:true,x_retry_coverage:coverage}];
 let sceneUpdated=false;
 if(Array.isArray(recovered.scene_contracts)&&last.scene_contract_id){
  const scene=makeSceneContract(recovered,TURN,{id:last.topic_id,title:last.topic_title},b,x);
  const idx=recovered.scene_contracts.findIndex(y=>y.scene_id===last.scene_contract_id&&y.source_turn_id===TURN);
  assert(idx>=0&&scene.scene_id===last.scene_contract_id,'Saved scene contract identity mismatch');
  scene.source='Original and paid retry Model X scenes with explicitly reviewed editorial repair and host cue rebinding';
  recovered.scene_contracts[idx]=scene;last.scene_contract=scene;sceneUpdated=true;
 }
 const completed=clone(p);
 completed.status='complete_offline_editorially_recovered';delete completed.failure;
 completed.completed_at=new Date().toISOString();completed.composite_B_output=b;completed.composite_X_output=x;completed.latest_sha256=latest;
 completed.recovery={kind:'reviewed_human_editorial_recovery_of_paid_retry',source:'Original B/X paid outputs preserved verbatim under calls, but published composite has explicitly assistant-authored editorial span repairs, not B-authoring',model_calls_added:0,embedding_calls_added:0,raw_model_responses_unchanged:true,original_turn_trace_unchanged:true,unselected_beats_preserved:true,editorial_replacements:EDITORIAL,editorial_visual_label_change:{beat_id:'b02',original:'Actions done to someone else',revised:'Passive'},visual_coverage:coverage,original_B_replacement_raw_preserved:true,original_X_response_raw_preserved:true};
 completed.changes={selected_spans:f.selections,affected_beat_ids:['b02','b03','b05'],editorial_replacements:EDITORIAL,x_retry_coverage:coverage,non_selected_beats_preserved:true,source_trace:'turns/'+TURN+'.json',base_sha256:f.base_sha256};
 return {state,pending,feedback,turn,recovered,completed,b,coverage,sceneUpdated,bPaid,xPaid};
}
function saveExclusive(p,body){writeExclusive(p,typeof body==='string'?body:JSON.stringify(body,null,2)+'\n');}
function processCommit(g,choice){
 // Preconditions re-checked immediately before committing, fail closed on changes.
 assert(fs.readFileSync(STATE).equals(g.state.buf)&&fs.readFileSync(PENDING).equals(g.pending.buf),'State or pending trace changed after review');
 fs.mkdirSync(BACKUP,{recursive:true});
 saveExclusive(path.join(BACKUP,'state.before.json'),g.state.buf);
 saveExclusive(path.join(BACKUP,'r0001.pending.original.json'),g.pending.buf);
 saveExclusive(path.join(BACKUP,'feedback.original.json'),g.feedback.buf);
 saveExclusive(path.join(BACKUP,'t0006.original.json'),g.turn.buf);
 saveExclusive(path.join(BACKUP,'README.txt'),'This folder preserves the exact paid retry, prior state, and Spanish teaching source. Original model responses are never silently overwritten.\n');
 const done=choice==='commit'?g.completed:{...clone(g.pending.obj),status:'reviewed_rejected_no_effect',closed_at:new Date().toISOString(),review:{reason:'Paid B composite contains stitching defects and X returned only one of three affected beats',no_teaching_change:true,preserved_raw_paid_responses:true,model_calls_added:0}};
 const scratch=FINAL+'.r48.tmp';saveExclusive(scratch,done);
 if(choice==='commit'){
  const stateTmp=STATE+'.r48-recovery.tmp';saveExclusive(stateTmp,g.recovered);
  assert(fs.readFileSync(STATE).equals(g.state.buf)&&fs.readFileSync(PENDING).equals(g.pending.buf),'Files changed during recovery');
  fs.renameSync(stateTmp,STATE);
 }
 fs.renameSync(scratch,FINAL);
 fs.renameSync(PENDING,path.join(BACKUP,'r0001.pending.archived.json'));
 return {status:choice==='commit'?'editorial_retry_recovered_and_unblocked':'invalid_retry_archived_without_changes',original_pending_archived_in:BACKUP,completed_retry_file:FINAL,original_turn_trace_unchanged:true,new_api_calls:0,new_embedding_calls:0};
}
try{
 const modes=['--check','--commit','--reject'];const mode=process.argv[2];assert(process.argv.length===3&&modes.includes(mode),'Usage: --check | --commit | --reject');
 const g=build();const report={mode,read_only:mode==='--check',status:'ready_for_explicit_choice',session_id:SESSION,turn_id:TURN,retry_id:RID,original_highlight_count:3,original_model_calls:2,estimated_prior_usd:g.pending.obj.total_estimated_usd,alternative:'--reject archives the defective paid retry but DOES NOT change the lesson',
 editorial_recovery:'--commit publishes reviewed, assistant-editorially-adjusted text; this is NOT verbatim Model B output',editorial_replacements:EDITORIAL,selected_visuals:g.coverage,scene_contract_updated:g.sceneUpdated,
 proposed_revised_beat_text:g.b.beats.filter(x=>['b02','b03','b05'].includes(x.id)).map(x=>({beat_id:x.id,narration:x.narration}))};
 if(mode!=='--check')Object.assign(report,processCommit(g,mode.slice(2)));
 console.log(JSON.stringify(report,null,2));
}catch(e){console.error(String(e.stack??e.message));process.exitCode=1;}
