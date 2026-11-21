/** FIX6B: offline-only frozen context comparison, non-destructive; no model or DB. */
import crypto from 'node:crypto';
export const STAGE='S62B-FIX1R42FIX6B';
export const sha=(x)=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const byteLength=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
export const clone=x=>structuredClone(x);
const assert=(ok,msg)=>{if(!ok)throw Error('FIX6B INTEGRITY: '+msg);};
const ids=x=>(x??[]).map(y=>y?.id).filter(y=>typeof y==='string');
const uniq=x=>[...new Set(x)];
function t(id){const m=/^[A-Z][A-Z0-9_-]*-(\d{3})-(IN|OUT)$/.exec(id??'');return m?{round:+m[1],phase:m[2]}:null;}
function eligible(id,packet){const x=t(id);return x && (x.round<packet.round || x.round===packet.round && packet.stage==='post' && x.phase==='IN');}
function memoryIds(mem){return new Set((mem??[]).flatMap(m=>[...(m.evidence_ids??[]),...(m.supporting_evidence_ids??[]),...(m.contradicting_evidence_ids??[]),...(m.visible_support_ids??[]),...(m.visible_counter_ids??[]),...(m.evidence?.supports_current??[]),...(m.evidence?.challenges_current??[])]));}
function coverage(old){return {method:'fix6b_frozen_context_counterfactual',original_retrieval_method:old?.method??null,explanation:'This is a frozen offline context representation; learner competence and relevance have not been independently verified. Cite only the observations and current evidence supplied.',selection_by_host_not_cognitive_truth:true};}
function inputWithAdded(original,additional){const out=clone(original);out.observations.push(...additional.map(clone));out.allowed_evidence_ids=uniq([out.current.id,...ids(out.observations)]);out.coverage=coverage(original.coverage);return out;}
function requestFor(originalRequest,input){const r=clone(originalRequest);assert(r.messages?.[0]?.role==='system'&&r.messages?.[1]?.role==='user','recorded A request missing system/user');r.messages[1].content=JSON.stringify(input);return r;}
function verifyReq(v,p){assert(sha(v.input)===v.input_sha256,'FIX6A '+p+' variant input SHA mismatch');assert(JSON.stringify(v.input)===v.request.messages?.[1]?.content,'FIX6A '+p+' request not faithful to declared input');}
function ranksFor(additions,packet,original){
 const root=memoryIds(original.memory_candidates),retrieved=new Set(packet.retrieved_ids??[]);const currentTopic=original.current.topic_id;
 const rank=o=>root.has(o.id)?0:o.topic_id===currentTopic?1:retrieved.has(o.id)?2:3;
 return additions.map(x=>({observation:x,rank:rank(x),reason:['memory_evidence_link','same_topic','retrieved_semantic','other_history'][rank(x)]})).sort((a,b)=>a.rank-b.rank||b.observation.id.localeCompare(a.observation.id));
}
export function prepareComparison(packet,{targetBytes=55000}={}){
 assert(Number.isInteger(targetBytes)&&targetBytes>=8000&&targetBytes<=500000,'invalid targetBytes');
 assert(packet&&Array.isArray(packet.variants)&&packet.variants.length===3,'FIX6A A packet must have three variants');
 const [base,expanded,oldAware]=packet.variants;
 assert(base.name==='original'&&expanded.name==='expanded'&&oldAware.name==='evidence_aware','FIX6A packet variants out of order');
 for(const v of packet.variants)verifyReq(v,v.name);
 assert(sha(base.request)===packet.original_request_sha256,'original frozen request SHA changed');
 assert(sha(base.request.messages[0].content)===packet.original_system_prompt_sha256,'system prompt changed');
 const orig=base.input,full=expanded.input;
 assert(orig.current?.id===packet.current_id && full.current?.id===packet.current_id,'current ID mismatch');
 assert(sha(orig.current)===sha(full.current),'FIX6A expanded changed current evidence');
 assert(sha(orig.activity_actual_evidence??null)===sha(full.activity_actual_evidence??null),'expanded changed activity evidence');
 assert(sha(orig.memory_candidates??null)===sha(full.memory_candidates??null),'expanded changed memory');
 assert(sha(orig.recent_dialogue??null)===sha(full.recent_dialogue??null),'expanded changed dialogue');
 const origIds=ids(orig.observations),fullIds=ids(full.observations),origSet=new Set(origIds),fullSet=new Set(fullIds);
 assert(origIds.length===(orig.observations??[]).length&&origSet.size===origIds.length,'invalid original IDs');
 assert(fullIds.length===(full.observations??[]).length&&fullSet.size===fullIds.length,'invalid expanded IDs');
 for(const id of origIds)assert(fullSet.has(id),'expanded lost original '+id);
 const origCurrentT=t(orig.current.id);assert(origCurrentT&&origCurrentT.round===packet.round&&origCurrentT.phase===(packet.stage==='pre'?'IN':'OUT'),'bad current chronology');
 for(const o of full.observations)assert(o.id===orig.current.id||eligible(o.id,packet),'future evidence '+o.id);
 const additions=full.observations.filter(o=>!origSet.has(o.id));
 const addedIds=new Set(ids(additions));assert(addedIds.size===additions.length,'duplicate source evidence');
 const eligIds=new Set(packet.source_eligible_ids??[]);
 for(const id of addedIds)assert(eligIds.has(id),'added source observation not in available historical pool: '+id);
 const ranked=ranksFor(additions,packet,orig);
 const fullInput=inputWithAdded(orig,ranked.map(x=>x.observation));
 const selInput=inputWithAdded(orig,[]),selected=[],omitted=[];
 for(const r of ranked){
   selInput.observations.push(clone(r.observation));selInput.allowed_evidence_ids=uniq([selInput.current.id,...ids(selInput.observations)]);
   if(byteLength(selInput)<=targetBytes) selected.push({id:r.observation.id,reason:r.reason,source_text_sha256:sha(String(r.observation.text??''))});
   else {selInput.observations.pop();selInput.allowed_evidence_ids=uniq([selInput.current.id,...ids(selInput.observations)]);omitted.push({id:r.observation.id,reason:'budget_cannot_fit_full_saved_observation',priority:r.reason});}
 }
 assert(byteLength(selInput)<=targetBytes,'baseline plus normalized coverage exceeds target budget');
 for(const key of ['current','activity_actual_evidence','memory_candidates','recent_dialogue','available_topics']){
   assert(sha(selInput[key]??null)===sha(fullInput[key]??null),'selective/full differ in '+key);
 }
 assert(sha(selInput.coverage)===sha(fullInput.coverage),'selective/full coverage differs');
 assert(sha(selInput.observations.slice(0,origIds.length))===sha(orig.observations),'selective modified original observations');
 assert(sha(fullInput.observations.slice(0,origIds.length))===sha(orig.observations),'full modified original observations');
 const normalized = [['full_history',fullInput],['selective_evidence',selInput]].map(([variant,input])=>({name:variant,input,input_bytes:byteLength(input),input_sha256:sha(input),request:requestFor(base.request,input),included_ids:ids(input.observations)}));
 const originalHistory=origIds.filter(id=>id!==packet.current_id);
 const originallyRetrieved=(packet.retrieved_ids??[]).filter(id=>id!==packet.current_id);
 const originallyAvailable=uniq([...originalHistory,packet.current_id]);
 const omissionsReported=packet.reported_omissions??[];
 const retrievalNotDelivered=originallyRetrieved.filter(id=>!originallyAvailable.includes(id));
 const storedNotDelivered=(packet.source_eligible_ids??[]).filter(id=>!origSet.has(id));
 const clipped=packet.original_delivery_text_projection_detected??[];
 return {
   case_id:packet.case_id,stage:packet.stage,round:packet.round,arm:packet.arm,topic_id:packet.topic_id,current_id:packet.current_id,
   baseline_source_request_sha256:packet.original_request_sha256,system_prompt_sha256:packet.original_system_prompt_sha256,
   source_packet_sha256:sha(packet),budget_bytes:targetBytes,
   controls:{original:base,full_history:normalized[0],selective_evidence:normalized[1]},
   accounting:{historical_available:eligIds.size,historical_retrieved_ids:originallyRetrieved,historical_originally_delivered_ids:originalHistory,
     historical_retrieved_not_delivered_ids:retrievalNotDelivered,reported_context_packing_omissions:omissionsReported,
     historical_stored_not_delivered_ids:storedNotDelivered,original_text_shorter_than_saved:clipped,
     added_historical_source_ids:ranked.map(r=>r.observation.id),
     full_history_added_count:ranked.length,selective_added:selected,selective_omitted:omitted,
     selective_is_genuinely_different:omitted.length>0,
     original_bytes:base.input_bytes,full_bytes:normalized[0].input_bytes,selective_bytes:normalized[1].input_bytes,
     original_topic_metadata_sha256:sha(orig.available_topics??null),full_topic_metadata_sha256:sha(fullInput.available_topics??null),selective_topic_metadata_sha256:sha(selInput.available_topics??null),
     original_dialogue_sha256:sha(orig.recent_dialogue??null),full_dialogue_sha256:sha(fullInput.recent_dialogue??null),selective_dialogue_sha256:sha(selInput.recent_dialogue??null),
     original_activity_evidence_sha256:sha(orig.activity_actual_evidence??null),full_activity_evidence_sha256:sha(fullInput.activity_actual_evidence??null),
     note:'Retrieved/packed omissions are separate measures; historical relevance and competence are NOT verified by this accounting.'},
   limitations:['Original observations may already be projected or clipped at capture time; they are kept byte-identical in controls.',
   'Ranked selection uses observed metadata, not an oracle of pedagogical significance.',
   'Original request is frozen; new variants normalize coverage metadata equally but replace only historical evidence arrays and citation allowlists differently.',
   'Not executable through the original ~34 KB per-call runner without an explicitly tested adapter. No model calls here.']
 };
}
