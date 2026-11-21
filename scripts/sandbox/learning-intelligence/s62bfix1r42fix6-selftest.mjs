#!/usr/bin/env node
/** Synthetic structural tests only: not educational ground truth. */
import assert from 'node:assert/strict';
import {sha,bytes,evidenceTime,buildAssessmentVariants,buildHandoffVariants} from './s62bfix1r42fix6-context.mjs';
const observe=(id,topic_id,text)=>({id,topic_id,kind:'fictional_activity_attempt',text,conditions:{teacher_explanation_presented_before_attempt:true}});
const source=[observe('ATLAS-014-IN','T01','Earlier learner question stored without clipping '+('A'.repeat(800))),observe('ATLAS-014-OUT','T01','Complete earlier saved activity description '+('B'.repeat(1400))),observe('ATLAS-015-IN','T01','Current learner request'),observe('ATLAS-015-OUT','T01','Current learner response'),observe('ATLAS-016-IN','T01','FUTURE LEAK SENTINEL')];
const makeInput=(phase)=>({stage:phase,current:{id:`ATLAS-015-${phase==='pre'?'IN':'OUT'}`,topic_id:'T01',text:'CURRENT EXACT',actual_activity:undefined},activity_actual_evidence:{actual:'UNCHANGED'},
 allowed_evidence_ids:['ATLAS-014-IN'],observations:[{id:'ATLAS-014-IN',topic_id:'T01',kind:'fictional_activity_attempt',text:'Earlier learner question'}],memory_candidates:[],coverage:{context_packing:{omitted_evidence_ids:['ATLAS-014-OUT']}},available_topics:[{id:'T01',title:'Original topic'}],recent_dialogue:[{learner:'test',tutor:'text'}]});
const assessment=(stage)=>{const input=makeInput(stage);const request={model:'gpt-4.1-mini',messages:[{role:'system',content:'FROZEN ORIGINAL PROMPT'},{role:'user',content:JSON.stringify(input)}]};return {valid:true,current_id:input.current.id,delivered_input:input,original_retrieval:{selected:[{id:'ATLAS-014-IN'},{id:'ATLAS-014-OUT'}],ranked_preview:[{id:'ATLAS-014-OUT'}]},reported_omissions:['ATLAS-014-OUT'],all_model_A_calls:[{status:'returned',request}],current_observation:input.current,structured_output:{observed:{demonstrated:'A'.repeat(720)}}};};
const c={case_id:'R15_bonly',round:15,arm:'b-only',topic_id:'T01',pre_a:assessment('pre'),post_a:assessment('post')};
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
 if(stage==='pre')assert(!expanded.observations.some(x=>x.id==='ATLAS-015-IN'));
 else assert(expanded.observations.some(x=>x.id==='ATLAS-015-IN'));
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
assert(b.variants[1].input.learner_brief.assessment.relevant_history.includes('A'.repeat(720)));
assert(b.variants[2].input.learner_brief.prior_knowledge[0].factual_evidence.observation_text===source[3].text);
assert.equal(sha(b.variants[0].request),sha(bReq));
assert.throws(()=>buildHandoffVariants(c,bReq,{nextRound:15}),/current\/future/);
console.log('FIX6 SELFTEST PASS | original prompt/input fidelity; chronological evidence; no clipped additions; provenance; B full claim; free only');
