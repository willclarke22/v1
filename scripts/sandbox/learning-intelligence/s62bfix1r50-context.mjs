/** R5.0 evidence delivery: real semantic candidates; compact provenance-preserving projections.
 * Retrieval similarity is not adjudication. The full unmodified sources remain in state/export.
 * No lexical fallback, no invented cross-topic root relationships or mastery.
 */
import {retrieveR3} from './s62bfix1r3-retrieval.mjs';
import {clone,sha} from './s62bfix1r43-goldloop-core.mjs';
const bytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
const cut=(s,n)=>typeof s==='string'?(s.length>n?s.slice(0,n)+' … [excerpt; full text retained locally]':s):s;
const historical=(o,current)=>({id:o.id,topic_id:o.topic_id,kind:o.kind,text:cut(o.text,1400),compact_index_text:cut(o.compact_index_text??o.text,400),conditions:clone(o.conditions??{}),teaching_exposure_before_attempt:o.topic_id===current.topic_id?cut(o.teaching_exposure_before_attempt,350):null,not_human_ground_truth:o.not_human_ground_truth??false,source_full_text_in_unmodified_local_state:true,source_sha256:sha(o)});
function compactMemory(list,current){return (list??[]).filter(r=>r.status!=='historical').slice(-12).map(r=>({id:r.id,type:r.type,current_claim:cut(r.current_claim,600),status:r.status,uncertainty:r.uncertainty,topics:r.topics,possible_instances:r.possible_instances,visible_support_ids:r.visible_support_ids??[],visible_counter_ids:r.visible_counter_ids??[],not_ground_truth:true}));}
function compactDialogue(turns,current){const same=turns.filter(t=>t.topic_id===current.topic_id);const recents=[...same.slice(-2),...turns.slice(-1)].filter((v,i,a)=>a.findIndex(x=>x.turn_id===v.turn_id)===i).slice(-3);return recents.map(t=>({turn_id:t.turn_id,topic_id:t.topic_id,learner:cut(t.learner_message,1200),tutor_excerpt:cut(t.teacher_response,850),full_tutor_text_not_resent:true}));}
const ensure=(v,message)=>{if(!v)throw Error('R50: '+message);};
export function selectRelevant(state,current,retrieved,{sameLimit=6,crossLimit=1,additionalQuery=null}={}){
 const prior=state.observations.filter(x=>x.id!==current.id),byId=new Map(prior.map(o=>[o.id,o]));
 const same=prior.filter(x=>x.topic_id===current.topic_id);
 const selected=[],reasons={};const add=(o,why)=>{if(o&&!selected.some(x=>x.id===o.id)){selected.push(o);reasons[o.id]=why;}};
 // The learner's own latest corrections are essential even when embeddings rank other topics higher.
 for(const o of same.slice(-3))add(o,'recent_current_topic');
 // Ranking is semantic; this filter cannot infer truth or shared roots.
 for(const r of retrieved.ranked_preview??[])if(selected.filter(x=>x.topic_id===current.topic_id).length<sameLimit){const o=byId.get(r.id);if(o?.topic_id===current.topic_id)add(o,'semantic_current_topic_candidate');}
 // Only a deliberate focused history query opens limited cross-topic evidence, unless a root
 // explicitly names existing supporting IDs. Generic root similarity alone is NOT enough.
 const evidenceRootIds=new Set(state.records.filter(r=>r.type==='shared_root'&&r.status!=='historical').flatMap(r=>r.evidence?.supports_current??[]));
 for(const r of retrieved.ranked_preview??[])if(selected.filter(x=>x.topic_id!==current.topic_id).length<crossLimit){const o=byId.get(r.id);if(o&&o.topic_id!==current.topic_id&&(additionalQuery||evidenceRootIds.has(o.id)))add(o,'bounded_cross_topic_candidate_not_proof');}
 add(current,'current_verbatim');
 return {selected,reasons,omitted_retrieved_ids:(retrieved.evidence??[]).filter(x=>!selected.some(v=>v.id===x.id)).map(x=>x.id)};
}
export function packEvidenceR50(state,current,retrieved,{maxBytes=28000,additionalQuery=null}={}){
 ensure(maxBytes>=6000&&maxBytes<=42000,'bad delivery budget');
 const selection=selectRelevant(state,current,retrieved,{additionalQuery});
 const memory=compactMemory(retrieved.memory_candidates,current);
 const modelCurrent={...clone(current),teaching_exposure_before_attempt:cut(current.teaching_exposure_before_attempt,700),full_teaching_exposure_retained_in_session:true};
 const input={current:modelCurrent,activity_actual_evidence:null,allowed_evidence_ids:[],observations:[],memory_candidates:memory,coverage:{method:'semantic',available_historical:state.observations.filter(x=>x.id!==current.id).length,query_sources:retrieved.coverage?.query_sources??[],embedding:retrieved.coverage?.embedding??{},delivery:{budget_bytes:maxBytes,selected_source_ids:[],omitted_retrieved_source_ids:[],all_current_text_preserved:true,delivery_bytes:0,source_projection:'full current; compact historical; original complete sources retained in session export',selection_reasons:selection.reasons}},available_topics:state.topics.map(t=>({id:t.id,title:t.title})),recent_dialogue:compactDialogue(state.turns,current),research_mode:'real-human learner; selected observations include unverified self-report and unscored probe attempts. Do not infer mastery from words or skipped probes'};
 // Include metadata in the candidate BEFORE making the budget decision.
 const queue=[current,...selection.selected.filter(x=>x.id!==current.id)];
 const omitted=[];
 const finalize=()=>{
  const allow=new Set(input.allowed_evidence_ids);
  input.memory_candidates=input.memory_candidates.map(r=>({...r,visible_support_ids:(r.visible_support_ids??[]).filter(id=>allow.has(id)),visible_counter_ids:(r.visible_counter_ids??[]).filter(id=>allow.has(id))}));
  input.coverage.delivery.selected_source_ids=[...input.allowed_evidence_ids];
  input.coverage.delivery.omitted_retrieved_source_ids=[...omitted,...selection.omitted_retrieved_ids];
  for(let i=0;i<5;i++){const n=bytes(input);if(n===input.coverage.delivery.delivery_bytes)break;input.coverage.delivery.delivery_bytes=n;}
 };
 for(const original of queue){
  const projection=original.id===current.id?clone(modelCurrent):historical(original,current);
  input.observations.push(projection);input.allowed_evidence_ids.push(projection.id);finalize();
  if(bytes(input)>maxBytes){input.observations.pop();input.allowed_evidence_ids.pop();omitted.push(original.id);finalize();if(original.id===current.id)throw Error('R50: Current learner message cannot fit safely, no clipping permitted');}
 }
 finalize();ensure(bytes(input)<=maxBytes,'metadata-inclusive packet budget invariant failed');
 ensure(input.allowed_evidence_ids.includes(current.id),'current evidence must be delivered verbatim');
 const resultPacket={...retrieved,current:clone(current),evidence:clone(input.observations),allowed_evidence_ids:[...input.allowed_evidence_ids],memory_candidates:clone(input.memory_candidates),coverage:clone(input.coverage)};
 return {input,packet:resultPacket,omitted:input.coverage.delivery.omitted_retrieved_source_ids,actual_bytes:bytes(input)};
}
export async function retrieveAndPackR50(state,current,{additionalQuery=null,cap=12,embedFn}={}){
 const retrieved=await retrieveR3(state,current,{method:'semantic',cap,additionalQuery,embedFn});
 return packEvidenceR50(state,current,retrieved,{additionalQuery});
}
/** Only spend on a second A if there is genuinely unseen same-topic history. Having a
 * question that needs a learner attempt is NOT evidence that more history exists. */
export async function focusedRetrievalDecision(state,current,firstPacked,request,{embedFn}={}){
 const question=typeof request==='string'?request.trim():'';
 if(!question)return {use:false,reason:'no_request'};
 // Requests for independent success cannot be satisfied by skipped/merely offered probes.
 // This is a cost-saving heuristic, not a claim that the learner knows or does not know.
 const independentRequest=/(successfully|independen|demonstrat|mastery|unassisted|without hints|probe performance|completed attempt)/i.test(question);
 const completedAttempts=(state.probe_attempts??[]).filter(a=>a.status==='submitted'||a.status==='completed');
 if(independentRequest&&!completedAttempts.length)return {use:false,reason:'no_completed_probe_attempts; do not pay A again merely to confirm missing independent performance evidence'};
 if(state.observations.filter(o=>o.id!==current.id&&o.topic_id===current.topic_id).every(o=>firstPacked.packet.allowed_evidence_ids.includes(o.id)))return {use:false,reason:'all_same_topic_history_already_delivered; new observation or probe may be needed'};
 const next=await retrieveAndPackR50(state,current,{additionalQuery:question,cap:12,embedFn});
 const old=new Set(firstPacked.packet.allowed_evidence_ids);const newlySelected=next.packet.allowed_evidence_ids.filter(id=>!old.has(id)&&state.observations.find(o=>o.id===id)?.topic_id===current.topic_id);
 if(!newlySelected.length)return {use:false,reason:'focused_semantic_search_found_no_new_current_topic_evidence',newlySelected:[]};
 return {use:true,reason:'new_topic_relevant_prior_evidence_found',newlySelected,packed:next};
}
export function makeTeacherInputR50(state,current,a,packet){
 const history=packet.evidence.filter(o=>o.id!==current.id).filter(o=>o.topic_id===current.topic_id).slice(-6);
 const topic=state.topics.find(t=>t.id===current.topic_id);
 const relevant=packet.memory_candidates.filter(r=>r.status!=='historical'&&((r.topics??[]).includes(current.topic_id)||['interest','teaching_response'].includes(r.type))).slice(-6);
 const priorSame=state.turns.filter(t=>t.topic_id===current.topic_id);
 const dialogue=priorSame.slice(-2).map(t=>({turn_id:t.turn_id,topic:t.topic_title,learner:t.learner_message,teacher_excerpt:cut(t.teacher_response,900),full_explanation_available_in_session_not_repeated:true}));
 const recentFeedback=state.observations.filter(o=>o.topic_id===current.topic_id&&o.kind==='human_teaching_experience_feedback').slice(-3).map(o=>({id:o.id,text:cut(o.text,1000),conditions:o.conditions,feedback_is_experience_not_misconception:true}));
 return {learner_message:current.text,topic,learner_brief_for_B:clone(a.learner_brief_for_B),provisional_retrieved_memory:clone(relevant),previous_learner_observations:history.map(o=>({id:o.id,topic_id:o.topic_id,verbatim_learner_text:o.text,conditions:o.conditions,teacher_before_response:cut(o.teaching_exposure_before_attempt,500)??null})),retrieval_details:{selected_evidence_ids:packet.allowed_evidence_ids,not_all_historical_evidence_may_be_available:true},recent_visible_dialogue:dialogue,learner_feedback_about_previous_teaching:recentFeedback,most_recent_same_topic_correction:priorSame.length?priorSame.at(-1).learner_message:null,no_assumed_independent_mastery:true,corrective_instruction:'The current learner message is authoritative. When the learner rejects or corrects a prior teaching approach, acknowledge their actual requested change and choose a NEW instructional strategy rather than adding detail to the rejected approach. Do not over-teach taxonomies in response to a request for procedural or real-time skill. A fresh useful probe is optional; skipped probes are not failure.'};
}
export function compactRouteInput(state,msg){return {learner_message:msg,known_topics:state.topics.map(t=>({id:t.id,title:t.title})),recent_visible_dialogue:state.turns.slice(-3).map(t=>({topic_id:t.topic_id,learner:t.learner_message,tutor_excerpt:cut(t.teacher_response,550)})),note:'Route based on the latest learner meaning. Returning to a previous subject is possible. Topic identity is not a learner root or mastery judgement.'};}
