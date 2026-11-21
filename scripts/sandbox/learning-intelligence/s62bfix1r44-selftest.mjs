#!/usr/bin/env node
/** Free isolated R44 selftest. Creates and removes an artificial session; NO provider/MiniLM calls. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {makeServer} from './s62bfix1r44-goldloop-web.mjs';
import {run,applyTextReplacements} from './s62bfix1r44-retry-run.mjs';
import {OUTPUT,sha,activeSha,saveFeedback,read,validateSelections,listFeedback} from './s62bfix1r44-feedback-store.mjs';
const session='r44selftest_'+crypto.randomBytes(5).toString('hex'),dir=path.join(OUTPUT,session);let checks=0;const ok=(x,msg)=>{assert.ok(x,msg);checks++;};
const PORT=0,token='f'.repeat(64),csrf='e'.repeat(64);let srv=null;
async function main(){const beat1='Probability is like choosing a mystery card from a deck, and repeating that choice.',beat2='You can count the successes when you try the same game five times.';
 const state={schema:'myway_goldloop_human_v1',stage:'synthetic_test_only',learner:session,topics:[{id:'topic_demo',title:'Probability'}],observations:[{id:'t0001-IN',topic_id:'topic_demo',kind:'human_learner_utterance',text:'Stats is boring',compact_index_text:'Stats is boring'}],records:[],version:0,turns:[{turn_id:'t0001',topic_id:'topic_demo',topic_title:'Probability',learner_message:'Stats is boring',teacher_response:beat1+'\n\n'+beat2,A_brief:{teaching_focus:'engagement'},B_output:{teaching_mode:'explanation',teaching_intent:'clear',beats:[{id:'b01',narration:beat1,educational_purpose:'demo',visual_opportunity:'cards',learner_action:''},{id:'b02',narration:beat2,educational_purpose:'demo',visual_opportunity:'cards',learner_action:''}]},X_output:{visual_concept:'Playing cards',continuity_plan:'two scenes',limitations:'text only',implementation_status:'textual_storyboard_only',moments:[{beat_id:'b01',scene_description:'A bright and lively deck of cards appears on a table.',transition_from_previous:'',accuracy_boundaries:'',possible_interaction:'',cues:[{narration_quote:'Probability',on_screen_change:'A card appears'}]},{beat_id:'b02',scene_description:'Five large cards flip over on the game table.',transition_from_previous:'',accuracy_boundaries:'',possible_interaction:'',cues:[{narration_quote:'You can count',on_screen_change:'Count each success'}]}]},visuals_rendered:false}]};
 try{
 fs.mkdirSync(path.join(dir,'turns'),{recursive:true});fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state));fs.writeFileSync(path.join(dir,'turns','t0001.json'),JSON.stringify({B:{input:{topic:state.topics[0],learner_brief_for_B:state.turns[0].A_brief,provisional_retrieved_memory:[]}},calls:[]}));
 const original=fs.readFileSync(path.join(dir,'state.json'),'utf8');ok(original.includes('Stats is boring'),'Synthetic input created');
 ok(applyTextReplacements('A yellow card and a blue card',[{start:2,end:8,excerpt:'yellow',replacement_text:'green'}])==='A green card and a blue card','Span replacement preserves all unmarked text');
 assert.throws(()=>validateSelections(state.turns[0],[{beat_id:'b01',surface:'narration',start:0,end:12,reason:'lost',note:''},{beat_id:'b01',surface:'narration',start:10,end:18,reason:'bored',note:''}]),/overlap/);checks++;
 const base=activeSha(state.turns[0]);assert.throws(()=>saveFeedback(session,'t0001','wrong',[{beat_id:'b01',surface:'narration',start:0,end:11,reason:'lost',note:''}]),/changed/);checks++;
 const saved=saveFeedback(session,'t0001',base,[{beat_id:'b01',surface:'narration',start:0,end:11,reason:'lost',note:'Need a real-life anchor'},{beat_id:'b02',surface:'visual',start:0,end:13,reason:'bored',note:''}]);ok(saved.feedback_id==='fb0001','Feedback ID');ok(saved.added_evidence_ids.length===2,'Typed observations created');
 const after=read(path.join(dir,'state.json'));ok(after.observations.length===3,'Feedback persisted to historical evidence for future Model A retrieval');ok(after.observations[1].conditions.status==='subjective_experience_feedback_not_scored_understanding','No invented mastery');ok(after.turns[0].teacher_response===state.turns[0].teacher_response,'Free save never rewrites teaching');ok(listFeedback(session).length===1,'Feedback retained');
 const preview=await run(['--mode','preview','--session-id',session,'--feedback-id','fb0001']);ok(preview.expected_model_calls===2&&preview.affected_beats.length===2,'Free retry preview, no API calls');
 const {server}=makeServer({port:PORT,token,csrf,verifyBranch:false});srv=server;await new Promise(res=>server.listen(0,'127.0.0.1',res));const baseURL=`http://127.0.0.1:${server.address().port}`;
 let r=await fetch(baseURL+'/api/session?id='+session);ok(r.status===401,'Unauthenticated session blocked');
 r=await fetch(baseURL+'/?access='+token,{redirect:'manual'});ok(r.status===302&&r.headers.get('set-cookie')?.includes('HttpOnly'),'Access URL creates protected cookie');const cookie=r.headers.get('set-cookie').split(';')[0];
 r=await fetch(baseURL+'/api/session?id='+session,{headers:{Cookie:cookie}});const data=await r.json();ok(r.status===200&&data.history[0].feedback.length===1,'Browser gets saved highlights');
 r=await fetch(baseURL+'/api/export?id='+session,{headers:{Cookie:cookie}});const archive=Buffer.from(await r.arrayBuffer());ok(r.status===200&&archive.subarray(0,2).toString()==='PK','Session export is ZIP');ok(archive.includes(Buffer.from('session/feedback/fb0001.json')),'Export includes feedback sidecar');
 r=await fetch(baseURL+'/api/feedback',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({session_id:session,turn_id:'t0001',base_sha256:base,selections:[]})});ok(r.status===403,'CSRF blocked');
 r=await fetch(baseURL+'/api/feedback',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-MyWay-CSRF':csrf,Origin:baseURL},body:JSON.stringify({session_id:'../escape',turn_id:'t0001',base_sha256:base,selections:[]})});ok(r.status===400,'Traversal blocked');
 r=await fetch(baseURL+'/api/retry',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-MyWay-CSRF':csrf,Origin:baseURL},body:JSON.stringify({session_id:session,feedback_id:'fb0001',model_b:'gpt-4.1-mini',model_x:'gpt-4.1-mini',budget_usd:0.5,allow_spend:false})});ok(r.status===400,'Paid retry requires explicit permission');
 console.log(JSON.stringify({stage:'S62B-R44-targeted-retry',result:'PASS',free_checks:checks,model_calls:0,embedding_calls:0,db_writes:0,synthetic_session_cleaned_after:true},null,2));
 }finally{if(srv)await new Promise(res=>srv.close(res));fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e.stack??e.message);process.exitCode=1;});
