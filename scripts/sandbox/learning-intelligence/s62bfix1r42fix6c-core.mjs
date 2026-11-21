/** FIX6C pure frozen-request integrity, comparison, and independent review helpers. */
import crypto from 'node:crypto';
export const STAGE = 'S62B-FIX1R42FIX6C';
export const CASES = ['R15_bonly','R17_bonly'];
export const VARIANTS = ['original','selective_evidence','full_history'];
export const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
export const bytes = x => Buffer.byteLength(JSON.stringify(x),'utf8');
const verify = (ok,msg) => { if(!ok) throw Error('FIX6C source integrity: '+msg); };
const same = (a,b) => sha(a)===sha(b);
const ids = input => (input.observations??[]).map(o=>o.id);
function evidenceEpoch(id,round,stage) {
 const m=/^ATLAS-(\d{3})-(IN|OUT)$/.exec(id??'');
 verify(!!m,'invalid source evidence ID '+id);
 const n=Number(m[1]);
 verify(n<=round && (n<round||stage==='post'||m[2]==='IN'), 'future evidence ID '+id+' in round '+round+'/'+stage);
}
export function validatePacket(packet,caseId){
 verify(packet.case_id===caseId && packet.stage==='post','unexpected case/phase');
 verify(Number.isInteger(packet.round)&&packet.round===Number(caseId.slice(1,3)), 'round mismatch');
 verify(packet.current_id===`ATLAS-${String(packet.round).padStart(3,'0')}-OUT`,'current/round mismatch');
 verify(packet.controls&&Object.keys(packet.controls).length===3,'require exactly 3 recorded variants');
 const controls=packet.controls; const base=controls.original;
 verify(!!base.request && typeof base.request.messages?.[0]?.content==='string','missing original request');
 verify(sha(base.request)===packet.baseline_source_request_sha256,'baseline request changed');
 verify(sha(base.request.messages[0].content)===packet.system_prompt_sha256,'system prompt hash mismatch');
 const common=structuredClone(base.request);common.messages[1].content='__INPUT_PLACEHOLDER__';
 const system=base.request.messages[0].content; const model=base.request.model;
 verify(model==='gpt-4.1-mini','model must stay gpt-4.1-mini');
 verify(base.request.store===false,'request must be no-store');
 verify(base.request.messages.length===2&&base.request.messages[1].role==='user','expected system+user only');
 verify(base.request.response_format?.type==='json_schema' && base.request.response_format?.json_schema?.strict===true,'strict schema missing');
 verify(base.request.max_tokens===2400,'unexpected output limit');
 const named={};
 for(const name of VARIANTS){
  const v=controls[name];verify(v?.name===name,'missing/misnamed variant '+name);
  verify(v.input?.current?.id===packet.current_id,'wrong current event in '+name);
  verify(v.input.stage==='post','wrong stage in '+name);
  verify(sha(v.input)===v.input_sha256 && bytes(v.input)===v.input_bytes,'input hash/byte mismatch '+name);
  verify(v.request?.messages?.[0]?.content===system,'system prompt changed '+name);
  verify(v.request.model===model && v.request.store===false,'model/store drift '+name);
  verify(v.request.messages?.length===2,'request shape drift '+name);
  const skeleton=structuredClone(v.request);skeleton.messages[1].content='__INPUT_PLACEHOLDER__';
  verify(same(skeleton,common),'request parameters differ beyond user context '+name);
  const userText=v.request.messages[1].content;
  verify(typeof userText==='string' && same(JSON.parse(userText),v.input),'request body does not match input '+name);
  verify(sha(v.input.current)===sha(base.input.current),'current observation differs '+name);
  for(const field of ['activity_actual_evidence','memory_candidates','recent_dialogue','available_topics'])
   verify(same(v.input[field],base.input[field]),'confounded field '+field+' in '+name);
  const list=ids(v.input),all=new Set(list);
  verify(all.size===list.length,'duplicate observations '+name);
  verify(all.has(packet.current_id),'current observation not included '+name);
  for(const id of list) evidenceEpoch(id,packet.round,packet.stage);
  const allowed=new Set(v.input.allowed_evidence_ids??[]);
  verify(allowed.has(packet.current_id),'current not allowed '+name);
  for(const id of list)verify(allowed.has(id),'delivered observation not citable '+name+': '+id);
  for(const id of allowed) verify(all.has(id)||id===packet.current_id,'allowed citation points to undelivered evidence '+name+': '+id);
  named[name]={name,request:v.request,input_sha256:v.input_sha256,request_sha256:sha(v.request),input_bytes:v.input_bytes,evidence_ids:list};
 }
 const full=new Set(named.full_history.evidence_ids),selected=new Set(named.selective_evidence.evidence_ids);
 for(const id of named.original.evidence_ids)verify(full.has(id)&&selected.has(id),'original evidence lost '+id);
 for(const id of selected)verify(full.has(id),'selective contains evidence not in full '+id);
 verify(named.full_history.input_sha256!==named.selective_evidence.input_sha256,'selective/full identical');
 verify(named.original.input_sha256!==named.selective_evidence.input_sha256,'original/selective identical');
 return {case_id:caseId,topic_id:packet.topic_id,round:packet.round,stage:packet.stage,current_id:packet.current_id,system_prompt_sha256:packet.system_prompt_sha256,baseline_source_request_sha256:packet.baseline_source_request_sha256,source_packet_sha256:sha(packet),controls:named};
}
export function prepareJobs(packets){
 const items=CASES.map(c=>validatePacket(packets[c],c));
 verify(items.every(x=>x.system_prompt_sha256===items[0].system_prompt_sha256),'system prompt differs between cases');
 return {case_summary:items.map(x=>({case_id:x.case_id,topic_id:x.topic_id,current_id:x.current_id,source_packet_sha256:x.source_packet_sha256,evidence_counts:Object.fromEntries(VARIANTS.map(v=>[v,x.controls[v].evidence_ids.length]))})),
 jobs:items.flatMap(x=>VARIANTS.map(v=>({job_id:`${x.case_id}_post_${v}`,case_id:x.case_id,stage:'post',variant:v,model:'gpt-4.1-mini',current_id:x.current_id,topic_id:x.topic_id,source_packet_sha256:x.source_packet_sha256,system_prompt_sha256:x.system_prompt_sha256,request_sha256:x.controls[v].request_sha256,input_sha256:x.controls[v].input_sha256,input_bytes:x.controls[v].input_bytes,evidence_ids:x.controls[v].evidence_ids,request:x.controls[v].request}))),
 system_prompt_sha256:items[0].system_prompt_sha256};
}
export function objectiveReview(packet){
 const a=packet.controls.original.input.activity_actual_evidence;
 const events=a?.executed_events??[];
 const entries=Object.fromEntries(events.filter(e=>e.type==='action'&&typeof e.control==='string').map(e=>[e.control,e.value]));
 if(packet.case_id==='R15_bonly'){
  const n=x=>Number(entries[x]);
  const controls={initial_amount:n('initial_amount'),growth_rate:n('growth_rate'),time_period:n('time_period'),final_amount:n('final_amount'),initial_amount1:n('initial_amount1'),growth_rate1:n('growth_rate1'),time_period1:n('time_period1'),final_amount1:n('final_amount1'),initial_amount2:n('initial_amount2'),growth_rate2:n('growth_rate2'),time_period2:n('time_period2'),final_amount2:n('final_amount2')};
  const check=(initial,rate,t,submitted)=>({initial,rate,t,submitted,expected:Number((initial*Math.pow(1+rate,t)).toFixed(6)),matches_at_0_1_tolerance:Math.abs(initial*Math.pow(1+rate,t)-submitted)<=0.1});
  return {case_id:packet.case_id,mode:'review_sidecar_not_model_input',objective_checks:[
   {label:'first selected controls',assumption:'growth_rate=0.05 is fraction per period',...check(controls.initial_amount,controls.growth_rate,controls.time_period,controls.final_amount)},
   {label:'learner narrative alternative',assumption:'learner said starting amount 1000; not selected control 50',...check(1000,0.05,10,controls.final_amount)},
   {label:'scenario 1',assumption:'growth_rate1=10 means 10% (0.10), not factor 10',...check(controls.initial_amount1,controls.growth_rate1/100,controls.time_period1,controls.final_amount1)},
   {label:'scenario 2',assumption:'growth_rate2=10 means 10% (0.10), not factor 10',...check(controls.initial_amount2,controls.growth_rate2/100,controls.time_period2,controls.final_amount2)}],
   limitations:['Selected controls and narrative are inconsistent in the first scenario.','10 can be interpreted as 10% only under stated assumption.','This sidecar is not delivered to Model A; no independent competence judgment is inferred.','The original activity executor marked all submitted values not independently verified.']};
 }
 if(packet.case_id==='R17_bonly'){
  const k=Number(entries.scale_factor);
  return {case_id:packet.case_id,mode:'review_sidecar_not_model_input',objective_checks:[{label:'area factor',scale:k,submitted:Number(entries.predicted_area_factor),expected:k*k,matches:Number(entries.predicted_area_factor)===k*k},{label:'volume factor',scale:k,submitted:Number(entries.predicted_volume_factor),expected:k*k*k,matches:Number(entries.predicted_volume_factor)===k*k*k}],
   unverified_claims:[{control:'paint_liters',submitted:entries.paint_liters,reason:'Requires original paint amount/paint coverage to evaluate.'},{control:'water_volume',submitted:entries.water_volume,reason:'Requires original water volume; 8x scaling alone does not establish exactly 8 liters.'}],
   limitations:['The learner saw task feedback prior to later attempts.','No executor result independently verifies learner cognitive understanding.','A correct numeric prediction is not sufficient proof of transfer.']};
 }
 throw Error('Unrecognized case in reference review');
}
export function reviewResponse(job,raw){
 let answer;try{answer=JSON.parse(raw);}catch{return {valid_json:false,valid_structure:false,review_needed:true,reason:'non_JSON_response'};}
 const o=answer?.observed,brief=answer?.learner_brief_for_B,interpretation=answer?.interpretation;
 const structure=!!(o&&typeof o.demonstrated==='string'&&typeof o.untested_or_incorrect==='string'&&typeof o.conditions==='string'&&Array.isArray(o.evidence_ids)&&interpretation&&Array.isArray(interpretation.hypotheses)&&Array.isArray(answer.memory_decisions)&&brief&&typeof brief.current_understanding==='string');
 const known=new Set(job.evidence_ids),cites=Array.isArray(o?.evidence_ids)?o.evidence_ids:[];
 const memoryRefs=Array.isArray(answer?.memory_decisions)?answer.memory_decisions.flatMap(m=>(m.evidence??[]).map(e=>e.id)):[];
 return {valid_json:true,valid_structure:structure,current_cited:cites.includes(job.current_id),observed_cited_ids:cites,unsupported_observed_citations:cites.filter(id=>!known.has(id)),unsupported_memory_citations:memoryRefs.filter(id=>!known.has(id)),hypotheses_count:interpretation?.hypotheses?.length??null,uncertainty:interpretation?.uncertainty??null,memory_proposal_count:answer?.memory_decisions?.length??null,brief_chars:JSON.stringify(brief??{}).length,demonstrated:o?.demonstrated??null,untested_or_incorrect:o?.untested_or_incorrect??null,conditions:o?.conditions??null,learner_brief_for_B:brief??null,review_needed:true,interpretation_not_objective_truth:true};
}
