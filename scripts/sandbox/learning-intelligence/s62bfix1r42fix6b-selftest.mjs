#!/usr/bin/env node
import assert from 'node:assert/strict';
import {prepareComparison,sha,byteLength} from './s62bfix1r42fix6b-context.mjs';
function mock(){
 const current={id:'ATLAS-004-IN',topic_id:'T1',text:'question'};
 const old={stage:'pre',current,observations:[current],allowed_evidence_ids:[current.id],memory_candidates:[{topics:['T1'],visible_counter_ids:['ATLAS-003-OUT']}],recent_dialogue:[{text:'hi'}],available_topics:[{id:'T1'}],activity_actual_evidence:null,coverage:{method:'semantic',context_packing:{omitted_evidence_ids:['ATLAS-003-OUT']}}};
 const request={model:'gpt-4.1-mini',messages:[{role:'system',content:'frozen'},{role:'user',content:JSON.stringify(old)}]};
 const historic=['ATLAS-001-IN','ATLAS-001-OUT','ATLAS-002-IN','ATLAS-002-OUT','ATLAS-003-IN','ATLAS-003-OUT'].map(id=>({id,topic_id:id.includes('003')?'T1':'T2',text:'A'.repeat(3500)}));
 const full=structuredClone(old);full.observations.push(...historic);
 const make=(name,input)=>({name,input,input_bytes:byteLength(input),input_sha256:sha(input),request:name==='original'?request:{...request,messages:[request.messages[0],{role:'user',content:JSON.stringify(input)}]}});
 return {case_id:'R04_bonly',round:4,arm:'b-only',stage:'pre',current_id:current.id,topic_id:'T1',source_eligible_ids:historic.map(x=>x.id),retrieved_ids:['ATLAS-003-OUT','ATLAS-004-IN'],reported_omissions:['ATLAS-003-OUT'],original_delivery_text_projection_detected:[],original_request_sha256:sha(request),original_system_prompt_sha256:sha('frozen'),variants:[make('original',old),make('expanded',full),make('evidence_aware',full)]};
}
const data=mock(),c=prepareComparison(data,{targetBytes:14500});
assert.equal(c.controls.original.request.messages[1].content,data.variants[0].request.messages[1].content);
assert.equal(c.controls.full_history.input.observations.length,7);
assert(c.accounting.selective_omitted.length>0,'Budget must select rather than include every prior record');
assert(c.accounting.selective_added.length>0,'Budget must preserve some newly selected evidence');
assert.equal(c.accounting.reported_context_packing_omissions.length,1);
assert.equal(c.accounting.historical_retrieved_not_delivered_ids.length,1);
assert(c.controls.selective_evidence.input.observations.some(x=>x.id==='ATLAS-003-OUT'),'Prioritize memory-linked contradictory evidence');
assert.equal(c.accounting.original_topic_metadata_sha256,c.accounting.full_topic_metadata_sha256);
assert.equal(c.accounting.full_topic_metadata_sha256,c.accounting.selective_topic_metadata_sha256);
assert.equal(c.accounting.full_dialogue_sha256,c.accounting.selective_dialogue_sha256);
assert.equal(c.accounting.original_dialogue_sha256,c.accounting.selective_dialogue_sha256);
assert.equal(sha(c.controls.selective_evidence.input.coverage),sha(c.controls.full_history.input.coverage));
assert(c.controls.selective_evidence.input_bytes<=14500);
const future=mock();future.variants[1].input.observations.push({id:'ATLAS-004-OUT',topic_id:'T1',text:'future'});future.variants[1].input_sha256=sha(future.variants[1].input);future.variants[1].request.messages[1].content=JSON.stringify(future.variants[1].input);future.variants[2].input=structuredClone(future.variants[1].input);future.variants[2].input_sha256=sha(future.variants[2].input);future.variants[2].request.messages[1].content=JSON.stringify(future.variants[2].input);
assert.throws(()=>prepareComparison(future,{targetBytes:14500}),/future evidence/);
const corrupted=mock();corrupted.variants[0].request.messages[0].content='NEW SYSTEM';
assert.throws(()=>prepareComparison(corrupted,{targetBytes:14500}),/original frozen request SHA changed|system prompt changed/);
const modified=mock();modified.variants[1].input.recent_dialogue=[{text:'changed'}];modified.variants[1].input_sha256=sha(modified.variants[1].input);modified.variants[1].request.messages[1].content=JSON.stringify(modified.variants[1].input);modified.variants[2].input=structuredClone(modified.variants[1].input);modified.variants[2].input_sha256=sha(modified.variants[2].input);modified.variants[2].request.messages[1].content=JSON.stringify(modified.variants[2].input);
assert.throws(()=>prepareComparison(modified,{targetBytes:14500}),/expanded changed dialogue/);
console.log('FIX6B SELFTEST PASS | frozen request; chronology; budget selection; no clipping; common metadata; provenance');
