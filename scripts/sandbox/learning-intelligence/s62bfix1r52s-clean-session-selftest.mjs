#!/usr/bin/env node
/** FREE synthetic-only tests. No credentials, models, embeddings or user state. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {previewFromDir,applyFromDir,verifyFromDir,fingerprintDirectory,deriveCleanState} from './s62bfix1r52s-clean-session.mjs';
let checks=0;const yes=(x,m)=>{assert.ok(x,m);checks++};
const eq=(x,y,m)=>{assert.deepEqual(x,y,m);checks++};
const fail=(fn,rx)=>{assert.throws(fn,rx);checks++};
const base=fs.mkdtempSync(path.join(os.tmpdir(),'myway-r52s-test-'));
const source='fixture01',target='fixture_clean',removed='topic_challenges_with_spanish_grammar',neutral='topic_neutral',second='topic_another';
const root=path.join(base,source);fs.mkdirSync(path.join(root,'turns'),{recursive:true});fs.mkdirSync(path.join(root,'inputs'));
const obs=(id,topic,text,prior=null,exposure=null)=>({id,topic_id:topic,kind:'human_learner_utterance',text,compact_index_text:text,conditions:{source:'real_human_chat_input',prior_teacher_turn_id:prior,prior_teacher_message_present:!!prior,assumed_mastery:false},teaching_exposure_before_attempt:exposure,not_human_ground_truth:false});
const turn=(id,topic,title,msg)=>({turn_id:id,topic_id:topic,topic_title:title,learner_message:msg,teacher_response:'A useful new teaching response.',B_output:{teaching_mode:'explanation',teaching_intent:'Teach an example',beats:[{id:'b01',narration:'A useful new teaching response.',educational_purpose:'Practice',visual_opportunity:'Show',learner_action:''}],probe_plan:{offer:false}},X_output:{moments:[{beat_id:'b01',scene_description:'Show a simple neutral example.'}]},A_brief:{current_understanding:'This is only a hypothesis.'},evidence_id:id+'-IN',visuals_rendered:false});
const state={schema:'myway_goldloop_human_v1',stage:'S62B-FIX1R43-GOLDLOOP-v1',learner:source,topics:[{id:neutral,title:'Neutral study'},{id:removed,title:'Spanish grammar'},{id:second,title:'Another subject'}],observations:[obs('t0001-IN',neutral,'Neutral question.'),obs('t0002-IN',removed,'Spanish example.' ,'t0001','Other lesson'),obs('t0003-IN',second,'Other question.','t0002','Teacher taught Spanish grammar.')],records:[{id:'r01',type:'root',topics:[neutral],possible_instances:[],evidence:{supports_current:['t0001-IN'],challenges_current:[],context:[],historical_context:[]},revisions:[]}],turns:[turn('t0001',neutral,'Neutral study','Neutral question.'),turn('t0002',removed,'Spanish grammar','Spanish example.'),turn('t0003',second,'Another subject','Other question.')],version:3,semantic_index:{version:'myway_semantic_index_v1',provider:'local_minilm_http_127_0_0_1_8001_embed',dimension:384,vectors:{dummy:{text_sha256:'dummy',vector:[0,1]}}},root_backfill_history:[],scene_contracts:[],probe_attempts:[]};
try{
 const put=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
 put(path.join(root,'state.json'),state);
 for(const t of state.turns){put(path.join(root,'turns',t.turn_id+'.json'),{schema:'myway_goldloop_turn_v1',session_id:source,turn_id:t.turn_id,status:'complete',calls:[{role:'A',model:'gpt-4.1-mini',request:{messages:['Spanish must not leak']},response_raw:'model raw Spanish',estimated_usd:0.001}],total_estimated_usd:0.001});fs.writeFileSync(path.join(root,'inputs',t.turn_id+'.txt'),t.learner_message);}
 const initial=fingerprintDirectory(root);
 const p=previewFromDir(base,{sourceId:source,targetId:target,topicId:removed});
 eq(p.status,'preview_only_no_writes');eq(p.topics_after,2);eq(p.turns_after,2);eq(p.observations_after,2);eq(p.cached_vectors_after,0);eq(p.roots_after,1);
 yes(!fs.existsSync(path.join(base,target)),'preview wrote target');
 fail(()=>applyFromDir(base,{sourceId:source,targetId:target,topicId:removed,expectedFingerprint:'a'.repeat(64)}),/source changed after preview/);
 const a=applyFromDir(base,{sourceId:source,targetId:target,topicId:removed,expectedFingerprint:p.source_fingerprint});eq(a.verified,true);
 const v=verifyFromDir(path.join(base,target),{sourceId:source,targetId:target,topicId:removed});eq(v.status,'clean_session_verified');eq(v.embedding_cache_entries,0);eq(v.roots,1);
 const cleaned=JSON.parse(fs.readFileSync(path.join(base,target,'state.json')));eq(cleaned.observations.find(x=>x.id==='t0003-IN').teaching_exposure_before_attempt,null);
 eq(cleaned.observations.find(x=>x.id==='t0003-IN').conditions.prior_teacher_turn_id,null);
 yes(!cleaned.turns.find(t=>t.turn_id==='t0003').A_brief,'unreviewed A brief remained');
 eq(cleaned.derived_session.source_max_turn_number,3);
 eq(fingerprintDirectory(root).fingerprint,initial.fingerprint,'source modified');
 fail(()=>applyFromDir(base,{sourceId:source,targetId:target,topicId:removed,expectedFingerprint:p.source_fingerprint}),/target session already exists/);
 fail(()=>deriveCleanState({...state,unknown_future_source_field:'unsafe'},{sourceId:source,targetId:target,excludedTopicId:removed,sourceFingerprint:initial.fingerprint}),/unreviewed state fields/);
 const pending=path.join(root,'turns','t0004.pending.json');put(pending,{status:'provider_unknown'});
 fail(()=>previewFromDir(base,{sourceId:source,targetId:'anotherTarget',topicId:removed}),/pending paid operation/);
 fs.unlinkSync(pending);
 console.log(JSON.stringify({ok:true,checks,model_calls:0,embedding_calls:0,db_writes:0,source_unchanged:true,tests:'fresh session excludes target topic, evidence, semantic cache, prior exposure, raw provider traces; validates stale preview, overwrite, pending and unknown schema'},null,2));
}finally{fs.rmSync(base,{recursive:true,force:true});}
