#!/usr/bin/env node
/** Synthetic structural tests only: not educational ground truth. */
import assert from 'node:assert/strict';
import {sha,bytes,evidenceTime,buildAssessmentVariants,buildHandoffVariants} from './s62bfix1r42fix6a-context.mjs';
const observe=(id,topic_id,text)=>({id,topic_id,kind:'fictional_activity_attempt',text,conditions:{teacher_explanation_presented_before_attempt:true}});
const source=[observe('ATLAS-014-IN','T01','Earlier learner question stored without clipping '+('A'.repeat(800))),observe('ATLAS-014-OUT','T01','Complete earlier saved activity description '+('B'.repeat(1400))),observe('ATLAS-015-IN','T01','Current learner request'),observe('ATLAS-015-OUT','T01','Current learner response'),observe('ATLAS-016-IN','T01','FUTURE LEAK SENTINEL')];
const makeInput=(phase)=>({stage:phase,current:{id:`ATLAS-015-${phase==='pre'?'IN':'OUT'}`,topic_id:'T01',text:'CURRENT EXACT',actual_activity:undefined},activity_actual_evidence:{actual:'UNCHANGED'},
 allowed_evidence_ids:['ATLAS-014-IN'],observations:[{id:'ATLAS-014-IN',topic_id:'T01',kind:'fictional_activity_attempt',text:'Earlier learner question'}],memory_candidates:[],coverage:{context_packing:{omitted_evidence_ids:['ATLAS-014-OUT']}},available_topics:[{id:'T01',title:'Original topic'}],recent_dialogue:[{learner:'test',tutor:'text'}]});
const assessment=(stage)=>{const input=makeInput(stage);const request={model:'gpt-4.1-mini',messages:[{role:'system',content:'FROZEN ORIGINAL PROMPT'},{role:'user',content:JSON.stringify(input)}]};return {valid:true,current_id:input.current.id,delivered_input:input,original_retrieval:{selected:[{id:'ATLAS-014-IN'},{id:'ATLAS-014-OUT'}],ranked_preview:[{id:'ATLAS-014-OUT'}]},reported_omissions:['ATLAS-014-OUT'],all_model_A_calls:[{status:'returned',request}],current_observation:input.current,structured_output:{observed:{demonstrated:'A'.repeat(720)}}};};
const c={case_id:'R15_bonly',round:15,arm:'b-only',topic_id:'T01',pre_a:assessment('pre'),post_a:assessment('post')};
// Real-world regression: FIX4 original request can duplicate CURRENT in observations.
for(const stage of ['pre','post']) {
  const a=c[stage+'_a'];const cur=a.delivered_input.current;
  a.delivered_input.observations.push({id:cur.id,topic_id:cur.topic_id,kind:'current_event_projection',text:'CURRENT EXACT'});
  a.delivered_input.allowed_evidence_ids.push(cur.id);
  a.all_model_A_calls[0].request.messages[1].content=JSON.stringify(a.delivered_input);
}

const branch={observations:source};
assert.deepEqual(evidenceTime('ATLAS-015-IN'),{round:15,phase:'IN'});
for(const stage of ['pre','post']){
 const out=buildAssessmentVariants(c,stage,branch,{targetBytes:40000});
 assert.equal(out.variants.length,3);assert.equal(out.variants[0].request.messages[0].content,'FROZEN ORIGINAL PROMPT');
 assert.equal(sha(out.variants[0].input),sha(c[stage+'_a'].delivered_input));
 assert.deepEqual(out.retrieved_but_not_delivered,['ATLAS-014-OUT']);
 assert.equal(out.original_delivery_text_projection_detected.length,1);
 const expanded=out.variants[1].input,evidenceAware=out.variants[2].input;
 assert(expanded.observations.find(x=>x.id==='ATLAS-014-OUT').text.length>1000);
 assert(evidenceAware.observations.some(x=>x.id==='ATLAS-014-OUT'));
 assert(!expanded.observations.some(x=>x.id==='ATLAS-016-IN'));
 if(stage==='pre')assert(expanded.observations.filter(x=>x.id==='ATLAS-015-IN').length===1);
 else {assert(expanded.observations.some(x=>x.id==='ATLAS-015-IN'));assert(expanded.observations.filter(x=>x.id==='ATLAS-015-OUT').length===1); }
 assert.equal(out.original_current_observation_also_in_observations,true);
 assert.equal(sha(expanded.current),sha(c[stage+'_a'].delivered_input.current));
 assert.equal(sha(evidenceAware.activity_actual_evidence),sha(c[stage+'_a'].delivered_input.activity_actual_evidence));
 assert(bytes(evidenceAware)<=40000);
}
// A whole observation that does not fit is omitted with its ID. No text clipping.
const hugeBranch={observations:[...source,observe('ATLAS-013-OUT','T01','Z'.repeat(70000))]};
const huge=buildAssessmentVariants(c,'pre',hugeBranch,{targetBytes:40000});
assert(huge.variants[1].input.observations.some(x=>x.id==='ATLAS-013-OUT'));
assert(!huge.variants[2].input.observations.some(x=>x.id==='ATLAS-013-OUT'));
assert(huge.evidence_aware_omitted_for_budget.some(x=>x.id==='ATLAS-013-OUT'));
const bReq={model:'gpt-4.1-mini',messages:[{role:'system',content:'B FROZEN ORIGINAL PROMPT'},{role:'user',content:JSON.stringify({learner_request:'new topic request',learner_brief:{assessment:{relevant_history:'old'},prior_knowledge:[]}})}]};
const b=buildHandoffVariants(c,bReq,{nextRound:17,fullStoredObservation:source[3]});
assert.equal(b.full_source_claim_chars,720);
assert.equal(b.source_provenance.task_conditions.teacher_explanation_presented_before_attempt,true);
assert(b.variants[1].input.learner_brief.assessment.relevant_history.includes('A'.repeat(720)));
assert(b.variants[2].input.learner_brief.prior_knowledge[0].factual_evidence.observation_text===source[3].text);
assert.equal(sha(b.variants[0].request),sha(bReq));
assert.throws(()=>buildHandoffVariants(c,bReq,{nextRound:15}),/current\/future/);

// A current-event duplicate must NOT permit earlier access to the same-round OUT
// or to a genuinely later observation. Original payloads are also chronology-checked.
function withBadOriginal(stage,badId) {
  const copy=structuredClone(c),a=copy[stage+'_a'];
  a.delivered_input.observations.push({id:badId,topic_id:'T01',text:'future evidence'});
  a.all_model_A_calls[0].request.messages[1].content=JSON.stringify(a.delivered_input);
  return copy;
}
assert.throws(()=>buildAssessmentVariants(withBadOriginal('pre','ATLAS-015-OUT'),'pre',branch,{targetBytes:40000}),/future\/unknown evidence/);
assert.throws(()=>buildAssessmentVariants(withBadOriginal('post','ATLAS-016-IN'),'post',branch,{targetBytes:40000}),/future\/unknown evidence/);
assert.throws(()=>buildAssessmentVariants(withBadOriginal('pre','ATLAS-999-IN'),'pre',branch,{targetBytes:40000}),/future\/unknown evidence/);
// Current evidence is available through its own current field, not automatically
// judged 'retrieved but not delivered' when not duplicated in observations.
const single=structuredClone(c);single.pre_a.delivered_input.observations=single.pre_a.delivered_input.observations.filter(o=>o.id!=='ATLAS-015-IN');
single.pre_a.all_model_A_calls[0].request.messages[1].content=JSON.stringify(single.pre_a.delivered_input);
single.pre_a.original_retrieval.selected.push({id:'ATLAS-015-IN'});
assert(!buildAssessmentVariants(single,'pre',branch,{targetBytes:40000}).retrieved_but_not_delivered.includes('ATLAS-015-IN'));

console.log('FIX6A SELFTEST PASS | original prompt/input fidelity; chronological evidence; no clipped additions; provenance; B full claim; free only');
