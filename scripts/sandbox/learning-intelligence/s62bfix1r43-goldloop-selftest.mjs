#!/usr/bin/env node
/** Offline source-contract selftest. Fake vectors are injected TEST ONLY; NO paid/localhost calls. */
import assert from 'node:assert/strict';
import {ROUTE_SCHEMA,B_GOLD_SCHEMA,X_GOLD_SCHEMA,validateRoute,routeTopic,validateB,validateX,makeObservation,packEvidence,makeTeacherInput,makeXInput,teacherText} from './s62bfix1r43-goldloop-core.mjs';
import {A_SCHEMA,verifyAIsolated,applyA} from './s62bfix1r2-core.mjs';
import {retrieveR3} from './s62bfix1r3-retrieval.mjs';
import {parseArgs} from './s62bfix1r43-goldloop-run.mjs';
const state={learner:'LOCALTEST',topics:[],observations:[],records:[],turns:[],version:0};
function no(f){assert.throws(f)}
const route=validateRoute({decision:'new',existing_topic_id:null,new_topic_title:'What is probability?',rationale:'New learner question'},state.topics);const topic=routeTopic(state,route);assert.equal(topic.id,'topic_what_is_probability');
no(()=>validateRoute({decision:'existing',existing_topic_id:'madeup',new_topic_title:null,rationale:'wrong'},state.topics));
const obs=makeObservation(state,topic,'Graphs all look the same and I find stats boring.','t001');state.observations.push(obs);
const mini=async texts=>texts.map((t)=>Array.from({length:384},(_,i)=>i===0?1:i===1?(t.includes('stats')?0.1:0.4):0));
const packet=await retrieveR3(state,obs,{method:'semantic',embedFn:mini});assert.equal(packet.current.id,obs.id);assert.deepEqual(packet.allowed_evidence_ids,[obs.id]);assert.equal(packet.coverage.embedding.provider,'injected_test_only');assert.equal(packet.coverage.embedding.real_local_service,false);
const packed=packEvidence(state,obs,packet);assert.equal(packed.input.current.text,obs.text);assert.deepEqual(packed.input.allowed_evidence_ids,[obs.id]);
const a={observed:{kind:'question',evidence_ids:[obs.id],demonstrated:'Self-reported low engagement; no tested statistics performance',untested_or_incorrect:'Probability computation not tested',conditions:'Human message, no scored activity'},interpretation:{hypotheses:['Unclear whether low interest or question-reading is the dominant immediate obstacle'],uncertainty:'high',more_history_needed:null},memory_decisions:[],learner_brief_for_B:{current_understanding:'Learner knows that stats may be relevant; actual competence unknown',remaining_uncertainty:'No worked stats problems observed',relevant_history:'No confirmed history',possible_shared_root:null,teaching_response_evidence:'No demonstrated successful teaching'} };
const checked=verifyAIsolated(a,packed.packet,state);assert.equal(checked.assessment_valid,true);assert.deepEqual(applyA(state,checked.output,obs.id),[]);
no(()=>verifyAIsolated({...a,observed:{...a.observed,evidence_ids:['invented']}},packed.packet,state).assessment_valid||(()=>{throw Error('bad citation')})());
const b=validateB({teaching_mode:'explanation',teaching_intent:'Find a practical entry',beats:[{id:'b01',narration:'A fixed number of tries can give different numbers of wins.',educational_purpose:'What is being counted',visual_opportunity:'A series of repeated trials',learner_action:''},{id:'b02',narration:'What part feels least clear so far?',educational_purpose:'Invite correction',visual_opportunity:'Keep prior scene visible',learner_action:'Describe confusion'}]});
assert.equal(teacherText(b),'A fixed number of tries can give different numbers of wins.\n\nWhat part feels least clear so far?');
const bi=makeTeacherInput(state,obs,a,packet),xi=makeXInput(b,bi);assert.equal(xi.B_exact_beats.length,2);
const x={visual_concept:'One arcade world',continuity_plan:'The same machine throughout',implementation_status:'textual_storyboard_only',limitations:'No actual images rendered',moments:[{beat_id:'b01',scene_description:'Show five tokens drop into one arcade machine while a win count changes.',transition_from_previous:'Open scene',cues:[{narration_quote:'fixed number of tries',on_screen_change:'Put five tokens onscreen'}],accuracy_boundaries:'A visual metaphor only',possible_interaction:''},{beat_id:'b02',scene_description:'Hold the arcade machine on screen and make it easy to respond in text.',transition_from_previous:'The camera settles',cues:[{narration_quote:'least clear',on_screen_change:'Subtle focus on the displayed question'}],accuracy_boundaries:'No claim of real interaction',possible_interaction:'Text response'}]};
assert.equal(validateX(x,b).moments.length,2);
no(()=>validateX({...x,moments:[{...x.moments[0],cues:[{narration_quote:'NOT IN TEACHER TEXT',on_screen_change:'Fake quote'}]},x.moments[1]]},b));
const after={...state,observations:[obs],topics:[topic],turns:[{turn_id:'t001',topic_id:topic.id,topic_title:topic.title,learner_message:obs.text,teacher_response:teacherText(b)}]};
const second=makeObservation(after,topic,'I like examples more than equations.','t002');assert.equal(second.conditions.prior_teacher_message_present,true);
no(()=>parseArgs(['--mode','model','--session-id','test','--turn-id','t002','--message-file','safe.txt','--budget-usd','0.50']));
assert.equal(parseArgs(['--mode','plan']).mode,'plan');
const full=await retrieveR3({...after,observations:[obs,second]},second,{method:'semantic',embedFn:mini});assert(full.allowed_evidence_ids.includes(obs.id));assert(full.allowed_evidence_ids.includes(second.id));assert.equal(full.coverage.embedding.real_local_service,false);
const fresh=packEvidence(after,second,full);assert(fresh.packet.allowed_evidence_ids.includes(second.id));
console.log(JSON.stringify({pass:true,contracts:'A real evidence citation, dynamic topic route, B one-source narration, X exact subtitle cues, memory no-op, history inclusion, no paid calls',mock_embeddings:'injected_test_only, NOT MiniLM',provider_calls:0,db_writes:0},null,2));
