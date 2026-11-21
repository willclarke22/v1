#!/usr/bin/env node
/** MOCK TRANSPORT integration test — fully local, no actual models/MiniLM/charges. */
import fs from 'node:fs';import path from 'node:path';import {main,sessionDir} from './s62bfix1r43-goldloop-run.mjs';
const id='test_mock_'+process.pid;const session=sessionDir(id);const msgFile=path.join(session,'test-message.txt');
fs.mkdirSync(session,{recursive:true});process.env.OPENAI_API_KEY='TEST_NONSECRET';process.env.OPENAI_BASE_URL='http://127.0.0.1:9876/v1';process.env.CI='false';process.env.NODE_ENV='development';delete process.env.VERCEL;
let calls=[];const originalFetch=globalThis.fetch;
const send=x=>({ok:true,status:200,json:async()=>x});
globalThis.fetch=async (url,opt)=>{
 const u=String(url),body=JSON.parse(opt.body);
 if(u.endsWith('/embed'))return send({vectors:body.texts.map(x=>{let length=384;return Array.from({length},(_,i)=>i===(x.toLowerCase().includes('binomial')?1:2)?1:i===0?.5:0);})});
 if(u.endsWith('/chat/completions')){
 const name=body.response_format.json_schema.name,inp=JSON.parse(body.messages[1].content);calls.push(name);let out;
 if(name.endsWith('_route')){out={decision:inp.known_topics.length?'existing':'new',existing_topic_id:inp.known_topics[0]?.id??null,new_topic_title:inp.known_topics.length?null:'Binomial distribution',rationale:'Continuation of learner topic'};}
 else if(name.endsWith('_a')){out={observed:{kind:'question',evidence_ids:[inp.current.id],demonstrated:'Learner described a question or uncertainty, not a scored solution',untested_or_incorrect:'Independent math performance not tested',conditions:'Human supplied message, mock API is not a model'},interpretation:{hypotheses:['May need more concrete examples'],uncertainty:'high',more_history_needed:null},memory_decisions:[],learner_brief_for_B:{current_understanding:'Understanding uncertain',remaining_uncertainty:'No demonstration',relevant_history:'Available evidence only',possible_shared_root:null,teaching_response_evidence:'No independently measured benefit'}};}
 else if(name.endsWith('_b')){out={teaching_mode:'explanation',teaching_intent:'Show what a binomial question counts',beats:[{id:'b01',narration:'Imagine five basketball shots, and count how many go in.',educational_purpose:'Concrete repeated event',visual_opportunity:'Five attempts and a total score',learner_action:''},{id:'b02',narration:'Which part still feels most unfamiliar?',educational_purpose:'Invite natural learner control',visual_opportunity:'Hold previous scene',learner_action:'Explain what is unclear'}]};}
 else if(name.endsWith('_x')){out={visual_concept:'Continuous basketball court',continuity_plan:'Hold the same court across moments',implementation_status:'textual_storyboard_only',limitations:'No real renderer in this research',moments:[{beat_id:'b01',scene_description:'Use one court and five sequential balls with a visible count, no formula.',transition_from_previous:'Establish court',cues:[{narration_quote:'five basketball shots',on_screen_change:'Reveal five basketballs'}],accuracy_boundaries:'Idealized independent shots',possible_interaction:''},{beat_id:'b02',scene_description:'Keep the same court and soften camera movement while inviting response.',transition_from_previous:'Gently settle the view',cues:[{narration_quote:'most unfamiliar',on_screen_change:'Highlight what the learner can choose'}],accuracy_boundaries:'None',possible_interaction:'Free text'}]};}
 else throw Error('Unexpected API role '+name);
 return send({choices:[{message:{content:JSON.stringify(out)},finish_reason:'stop'}],usage:{prompt_tokens:600,completion_tokens:350,prompt_tokens_details:{cached_tokens:0}},model:body.model});
 }
 throw Error('Unexpected network attempt '+u);
};
try{
 fs.writeFileSync(msgFile,'I do not get binomial distribution. Stats all sounds the same.');
 const one=await main(['--mode','model','--session-id',id,'--turn-id','t001','--message-file',msgFile,'--allow-spend','--budget-usd','0.50']);
 if(one.B_beats!==2||one.X_beats!==2||one.A_validation!==true)throw Error('First-turn failed');
 fs.writeFileSync(msgFile,'Those examples help, but I still cannot tell which word problem is binomial.');
 const two=await main(['--mode','model','--session-id',id,'--turn-id','t002','--message-file',msgFile,'--allow-spend','--budget-usd','0.50']);
 const st=JSON.parse(fs.readFileSync(two.state,'utf8'));if(st.observations.length!==2||st.topics.length!==1||st.turns.length!==2||!st.semantic_index||!st.semantic_index.vectors)throw Error('Continuity or embedding-cache persistence failed');
 const t=JSON.parse(fs.readFileSync(two.trace,'utf8'));if(!t.A.retrieval_summary.selected_ids.includes('t001-IN'))throw Error('Semantic retrieval did not deliver history');
 if(calls.length!==8)throw Error('Call count unexpected '+calls.length);
 console.log(JSON.stringify({pass:true,route_calls:2,assessment_calls:2,teacher_calls:2,visual_builder_calls:2,turns:2,history_retrieved_in_second_turn:true,embedding_cache_persisted:true,model_calls:'MOCKED local transport, NOT actual provider',embeddings:'MOCKED, NOT real MiniLM',network_access:'intercepted entirely',production_db_writes:0},null,2));
}finally{globalThis.fetch=originalFetch;fs.rmSync(session,{recursive:true,force:true});}
