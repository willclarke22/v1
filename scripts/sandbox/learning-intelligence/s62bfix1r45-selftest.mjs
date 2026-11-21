#!/usr/bin/env node
/** FREE local synthetic R4.5 test; no model or MiniLM requests, no production writes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {makeServer} from './s62bfix1r45-goldloop-web.mjs';
import {OUTPUT,backfillSources,backfillPreview,validateBackfill,applyBackfill,rootSummary,rankCandidateRoots,sha} from './s62bfix1r45-root-memory.mjs';
let checks=0;const ok=(condition,description)=>{assert.ok(condition,description);checks++;};
const session='r45selftest_'+crypto.randomBytes(5).toString('hex');const dir=path.join(OUTPUT,session),turnDir=path.join(dir,'turns');
let srv=null;
async function main(){
 try{
  fs.mkdirSync(turnDir,{recursive:true});const topics=[{id:'topic_stats',title:'Statistics'},{id:'topic_water',title:'Treading water'}];
  const obs=[{id:'t0001-IN',topic_id:'topic_stats',kind:'human_learner_utterance',text:'I can follow a coin story but get lost in math word problems.',compact_index_text:'I can follow a coin story but get lost in math word problems.',conditions:{status:'self_report_or_question_not_independently_scored'}},{id:'t0002-IN',topic_id:'topic_water',kind:'human_learner_utterance',text:'Why do I tire when treading water but I can run for a long time?',compact_index_text:'Why do I tire when treading water but I can run for a long time?',conditions:{status:'self_report_or_question_not_independently_scored'}}];
  const turns=obs.map((o,i)=>({turn_id:'t'+String(i+1).padStart(4,'0'),topic_id:o.topic_id,topic_title:topics[i].title,learner_message:o.text,teacher_response:'A generic previous explanation.',B_output:{teaching_mode:'conversation',teaching_intent:'Curiosity',beats:[{id:'b01',narration:'A generic previous explanation.',educational_purpose:'',visual_opportunity:'',learner_action:''}]},X_output:{moments:[{beat_id:'b01',scene_description:'An educational visual thought experiment'}]}}));
  const state={schema:'myway_goldloop_human_v1',learner:session,stage:'synthetic',topics,observations:obs,records:[],turns,version:0};fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state));
  for(const [i,t] of turns.entries())fs.writeFileSync(path.join(turnDir,t.turn_id+'.json'),JSON.stringify({status:'complete',session_id:session,A:{output:{interpretation:{hypotheses:[i===0?'Maybe word-problem representation is hard':'Maybe activity-specific coordination matters'],uncertainty:'high'}}}}));
  const inputs=backfillSources(state,turnDir);ok(inputs.observations.length===2,'Backfill draws exactly original evidence');ok(inputs.previous_A_interpretations.length===2,'Backfill sees original A historical hypotheses');
  const preview=backfillPreview(state,turnDir);ok(preview.status==='preview_only_no_writes','Free preview only');ok(preview.original_hypotheses.length===2,'Preview exposes historical prompts');
  const proposed={overview:'Two unrelated provisional hypotheses.',roots:[{topic_id:'topic_stats',claim:'This learner may find it difficult to select a mathematical structure from word-problem language.',why_underlying:'The question-to-representation step may be uncertain.',uncertainty:'high',support_ids:['t0001-IN'],counter_ids:[],alternatives:['Boredom'],testable_next:'Try an unfamiliar no-hint choice.'},{topic_id:'topic_water',claim:'This learner may expect running endurance to transfer directly to treading water.',why_underlying:'Activity-specific coordination is untested.',uncertainty:'high',support_ids:['t0002-IN'],counter_ids:[],alternatives:['Swimming technique'],testable_next:'Offer a contrasting physical scenario.'}],shared_root_candidates:[],limitations:['No independent attempts.']};
  const checked=validateBackfill(proposed,inputs);ok(checked.roots.length===2,'Two topic roots accepted');
  const bad=structuredClone(proposed);bad.shared_root_candidates=[{claim:'Assumed shared generalized learning problem across both subjects.',root_indices:[0,1],evidence_ids:['t0001-IN'],uncertainty:'medium',alternative:'Independent topics',next_test:'Check'}];ok(validateBackfill(bad,inputs).shared.length===0,'Shared root lacking two-topic direct support rejected');
  const badId=structuredClone(proposed);badId.roots[0].support_ids=['imaginary'];ok(validateBackfill(badId,inputs).roots.length===1,'Hallucinated evidence ID rejected');
  const originalHash=sha(state.turns);const applied=applyBackfill(state,checked,{traceId:'bf0001'});ok(sha(applied.state.turns)===originalHash,'Backfill never modifies past turns');ok(applied.state.records.length===2&&applied.state.root_backfill_history.length===1,'Versioned root records and provenance created');
  ok(rootSummary(applied.state).provisional_record_count===2,'Root state inspector matches');
  const indexed=structuredClone(applied.state);const fakeEmbed=async items=>items.map(x=>{const v=new Array(384).fill(0);const low=x.toLowerCase();v[0]=low.includes('water')?2:0.1;v[1]=low.includes('word')?2:0.1;v[2]=1;return v;});
  const ranked=await rankCandidateRoots(indexed,{text:'Why do I get tired in water?',topic_id:'topic_water'},{embedFn:fakeEmbed});ok(ranked.candidates.length===2&&ranked.cross_topic_root_pairs.length===1,'Semantic comparison emits unverified cross-topic candidate pair');ok(ranked.not_proven_relationship===true,'Similarity is never called proof');
  // Web tests are read-only. The mock backfill above was pure and not written to the disk state.
  const token='a'.repeat(64),csrf='b'.repeat(64);const {server}=makeServer({port:0,token,csrf,verifyBranch:false});srv=server;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  let r=await fetch(base+'/api/roots?id='+session);ok(r.status===401,'Authentication blocks root history');
  r=await fetch(base+'/?access='+token,{redirect:'manual'});ok(r.status===302,'Token establishes cookie');const cookie=r.headers.get('set-cookie').split(';')[0];
  r=await fetch(base+'/api/roots?id='+session,{headers:{Cookie:cookie}});const d=await r.json();ok(r.status===200&&d.preview.available_prior_A_assessments===2,'Authenticated read-only root preview works');
  r=await fetch(base+'/api/session?id='+session,{headers:{Cookie:cookie}});const sessionRes=await r.json();ok(r.status===200&&sessionRes.memory_record_count===0,'Web state is original untouched');
  r=await fetch(base+'/api/export?id='+session,{headers:{Cookie:cookie}});const zip=Buffer.from(await r.arrayBuffer());ok(r.status===200&&zip.subarray(0,2).toString()==='PK','Existing session ZIP still works');
  const postHeaders={Cookie:cookie,'Content-Type':'application/json','X-MyWay-CSRF':csrf,Origin:base};
  r=await fetch(base+'/api/root-backfill',{method:'POST',headers:postHeaders,body:JSON.stringify({session_id:session,model_a:'gpt-4.1-mini',budget_usd:0.5,allow_spend:false})});ok(r.status===400,'No paid backfill without explicit authorization');
  r=await fetch(base+'/api/root-backfill',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-MyWay-CSRF':csrf},body:JSON.stringify({session_id:session,model_a:'gpt-4.1-mini',budget_usd:0.5,allow_spend:true})});ok(r.status===403,'No paid action without same-origin header');
  r=await fetch(base+'/api/roots?id=../escape',{headers:{Cookie:cookie}});ok(r.status!==200,'Session traversal rejected');
  const bf=path.join(dir,'root-backfill');fs.mkdirSync(bf,{recursive:true});fs.writeFileSync(path.join(bf,'bf0001.pending.json'),'{}');r=await fetch(base+'/api/session?id='+session,{headers:{Cookie:cookie}});const pend=await r.json();ok(pend.blocked_pending===true,'Unresolved root backfill blocks subsequent paid work');
  console.log(JSON.stringify({result:'PASS',free_checks:checks,paid_model_calls:0,real_embedding_calls:0,production_writes:0,synthetic_test_session_cleaned:true},null,2));
 }finally{if(srv)await new Promise(resolve=>srv.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e.stack??e.message);process.exitCode=1;});
