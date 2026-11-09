/** S59 lean research core: model reasoning, software evidence/retrieval. No persistence, DB, or production hooks. */
import crypto from 'node:crypto';
const clip=(s,n=2000)=>String(s??'').slice(0,n);
const words=s=>new Set((String(s??'').toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(x=>!new Set(['this','that','what','with','from','have','about','could','would','there','they','their','when','where','which','your','does','into','than','then','were','some','because','again','please']).has(x)));
const sim=(a,b)=>{const aa=words(a),bb=words(b);return [...aa].filter(x=>bb.has(x)).length/Math.sqrt((aa.size||1)*(bb.size||1));};
const clone=x=>JSON.parse(JSON.stringify(x));
const txt=(_max=1800)=>({type:'string'});
const strOrNull={type:['string','null']};
const stringArray={type:'array',items:{type:'string'}};
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const action={type:'string',enum:['propose','support','weaken','refine','challenge','no_change']};
export const SCHEMAS={
 B:obj({reply:txt(4000),probe_offer:strOrNull,context_request:obj({scope:strOrNull,reason:strOrNull})}),
 A:obj({observed_understanding:{type:'array',items:obj({claim:txt(500),observation_ids:stringArray})},presenting_difficulty:strOrNull,
 possible_underlying_causes:{type:'array',items:obj({claim:txt(600),support_ids:stringArray,counter_ids:stringArray,alternatives:stringArray,uncertainty:{type:'string',enum:['low','medium','high']}})},
 root_actions:{type:'array',items:obj({existing_id:strOrNull,action,reason:txt(500),observation_ids:stringArray})},
 relationship_actions:{type:'array',items:obj({existing_id:strOrNull,action,contexts:stringArray,learner_pattern:txt(600),alternatives:stringArray,observation_ids:stringArray})},
 explicit_instruction_observations:{type:'array',items:obj({instruction:txt(300),scope:txt(180),evidence_id:txt(100),exact_excerpt:txt(300)})},
 teaching_effect_hypotheses:{type:'array',items:obj({context:txt(300),method:txt(300),observations:stringArray,confounds:stringArray,status:{type:'string',enum:['provisional']}})},
 next_probe:obj({purpose:strOrNull,probe_type:strOrNull,separates_hypotheses:stringArray}),
 request_more_context:obj({scope:strOrNull,why:strOrNull}),overall_uncertainty:{type:'string',enum:['low','medium','high']}}),
 C:obj({decision:{type:'string',enum:['same','refinement','distinct','uncertain']},matched_id:strOrNull,support_ids:stringArray,counter_ids:stringArray,rationale:txt(1000),request_more_candidates:{type:'boolean'}}),
 L:obj({learner_message:txt(1800),accept_probe:{type:['boolean','null']},reasoning:strOrNull})
};
export const PROMPTS={
 B:`You are Model B, the learner-facing tutor in MyWay. Help the learner understand their current request accurately, naturally and efficiently. Your voice is clear, thoughtful, curious and respectful, without excessive praise. Adapt depth and pacing to the learner's explicit instructions and relevant evidence; do not assign learning styles. Treat historical observations as reports of what happened, not evidence of permanent mastery. Roots, relationships and teaching effects are provisional hypotheses, never diagnoses. Answer the current request first. A targeted question or OPTIONAL probe is useful only if it serves a learning purpose; never reveal an answer/rubric before an independent attempt. A correct response does not establish mastery; a wrong response or refusal is not proof of deficit. Correct your own errors. You may request bounded additional context only if it would change teaching. Return the specified JSON structure. Do not claim rendered scenes, saved preferences or database writes.`,
 A:`You are Model A, MyWay's evidence-grounded interpreter of ONE learner. You do not talk to the learner and may be wrong. Separately describe observed understanding, presenting difficulty, and underlying LEARNER-SPECIFIC cause hypotheses. Questions alone are not evidence of their cause; 'unknown' and no changes are valid. Every claim about an observation cites supplied IDs. Consider support, contradiction, alternatives and what was NOT tested. Correct answers immediately after teaching, feedback or hints are not independent proof of transfer. An invalid tutor question must not be counted against the learner. Propose new or revised ROOTS and new or revised LEARNER RELATIONSHIPS when relevant, including cross-topic patterns beyond curriculum edges. Curricular similarity does not demonstrate a learner connection. Compare distinct contexts and learner actions, not merely labels. You can request more history, including UNLINKED observations from distant topics, to investigate a candidate pattern. Do not force a discovery. Propose teaching-effect hypotheses only when prior method and outcome evidence exist; include confounds. Recommend a minimal discriminating probe if useful. Record an explicit learner instruction only when the supplied utterance contains the exact quoted instruction; these are user-controlled directives, not inferred teaching efficacy. Evidence relevance and scientific interpretation are YOUR task; code checks only IDs and structural integrity. Return JSON only under the specified schema; do not invent prior IDs or claim memory writes.`,
 C:`You are optional Model C, a cautious hypothesis-identity comparator. Compare ONE proposed learner-specific root or learner relationship with supplied historical candidates, their supporting and contradicting observations. Decide same/refinement/distinct/uncertain based on the underlying learner pattern, not topic or word similarity. Two unrelated subjects may share an underlying pattern and identical questions may have different causes. If candidate coverage is incomplete, return uncertain and request more candidates; never infer distinct merely because retrieval missed a match. Cite supplied evidence IDs and exact candidate ID for same/refinement. No memory writes or mastery claims. Return schema-only JSON.`,
 L:`You are Model L, a fictional learner used ONLY in controlled MyWay research. Use the PRIVATE synthetic knowledge state and the visible tutor conversation to generate ONE plausible utterance. Preserve the assigned strengths, knowledge gaps and misconceptions, allowing change only when justified by the teaching received. Do not exploit your general knowledge to become an answer key. You may hesitate, challenge an incorrect tutor premise, ask for help, accept or decline a probe, and be wrong or right naturally. Do not force progress or confusion to satisfy the experiment. Never disclose hidden state. Return schema-only JSON.`
};
export function publicSeed(f){
 const obs=f.learner.prior_sessions.map(o=>({id:o.id,topic_id:o.topic_id,text:o.learner_quote,source:'synthetic_historical_observation',evidence_type:o.evidence_type??'reported',context:{historical:true}}));
 const roots=f.learner.provisional_root_hypotheses.map(r=>({id:r.root_id,presenting_difficulty:r.presenting_difficulty,claim:r.underlying_cause_hypothesis,alternatives:r.alternative_hypotheses,support_ids:r.supporting_observation_ids,counter_ids:r.contradicting_observation_ids,status:'provisional'}));
 const relationships=f.learner.learner_specific_relationship_hypotheses.map(r=>({id:r.relationship_id,contexts:[r.from_topic_id,r.to_topic_id],claim:r.claim,observation_ids:r.observation_ids,status:'provisional'}));
 return {topics:f.topics.map(t=>({id:t.topic_id,title:t.title,cluster:t.cluster})),links:f.curriculumLinks.map(l=>({from:l.from_topic_id,to:l.to_topic_id,kind:l.relation_type})),obs,roots,relationships,proposals:[],dialogue:[],explicit_instructions:[]};
}
export function record(state,id,message,extra={}){
 if(state.obs.some(o=>o.id===id))throw Error('Duplicate observation id');
 const o={id,topic_id:extra.topic_id??null,text:clip(message,1800),source:extra.source??'synthetic_current_utterance',evidence_type:extra.evidence_type??'raw_utterance',context:{...extra.context}};
 state.obs.push(o);return o;
}
function rank(list,q,key,n){return list.map(x=>({x,score:sim(q,key(x))})).sort((a,b)=>b.score-a.score||String(a.x.id).localeCompare(String(b.x.id))).slice(0,n).map(v=>v.x);}
export function contextSlice(state,query,{role='B',explore=false,turn=0}={}){
 const raw=state.obs.filter(o=>o.source!=='synthetic_current_utterance'||o.id!==`N-${turn}`);
 const recent=state.obs.slice(-1)[0];
 const direct=rank(raw,query,o=>o.text,role==='A'?4:3);
 const chosen=[...direct];
 const seen=new Set(chosen.map(x=>x.id));
 const include=o=>{if(o&&!seen.has(o.id)){seen.add(o.id);chosen.push(o);}};
 const roots=rank(state.roots,query,r=>r.claim+' '+r.presenting_difficulty,role==='A'?3:2).filter(r=>sim(query,r.claim+' '+r.presenting_difficulty)>0.03);
 const relationships=rank(state.relationships,query,r=>r.claim,role==='A'?2:1).filter(r=>sim(query,r.claim)>0.03);
 const pending=rank(state.proposals||[],query,p=>p.learner_pattern||p.reason||'',role==='A'?3:2).filter(p=>sim(query,p.learner_pattern||p.reason||'')>0.03).map(p=>({...p,not_approved:true}));
 // Bring evidence for hypotheses, including counterevidence: not just their labels.
 for(const r of roots)for(const id of [...(r.support_ids||[]),...(r.counter_ids||[])])include(raw.find(o=>o.id===id));
 for(const r of relationships)for(const id of r.observation_ids||[])include(raw.find(o=>o.id===id));
 if(recent)include(recent);
 const topicRank=rank(state.topics,query,t=>t.title,4).filter(t=>sim(query,t.title)>0.03);
 const topicIds=new Set(topicRank.map(t=>t.id));
 const graph=state.links.filter(l=>topicIds.has(l.from)||topicIds.has(l.to)).slice(0,4);
 const extra=[];
 if(explore){
  // Independent of lexical similarity and graph links: sample underrepresented topic clusters.
  const covered=new Set(chosen.map(o=>o.topic_id));const byTopic=new Map();
  for(const o of raw)if(!covered.has(o.topic_id)){const k=o.topic_id??'unlinked';if(!byTopic.has(k))byTopic.set(k,[]);byTopic.get(k).push(o);}
  const buckets=[...byTopic.values()].sort((a,b)=>a[0].topic_id?.localeCompare(b[0].topic_id??'')??0);
  for(let i=0;i<Math.min(8,buckets.length);i++){const b=buckets[(i+turn)%buckets.length];if(b?.[0])extra.push(b[0]);}
 }
 const cap=role==='A'?14:8;
 const observed=[...chosen,...extra].filter((x,i,a)=>a.findIndex(y=>x.id===y.id)===i).slice(0,cap);
 return {role,observations:clone(observed),roots:clone(roots),relationships:clone(relationships),pending_unverified_proposals:clone(pending),topics:clone(topicRank),curriculum_neighbors:clone(graph),coverage:{included_observation_ids:observed.map(o=>o.id),history_size:state.obs.length,exploratory:explore,truncated:chosen.length+extra.length>cap,policy:'candidate retrieval only; no root/relationship inference'},explicit_instructions:clone(state.explicit_instructions.slice(-3))};
}
const validIds=(ids,allowed)=>Array.isArray(ids)&&ids.length<=14&&ids.every(x=>typeof x==='string'&&allowed.has(x));
export function validateA(a,state,visibleObservationIds=null){
 if(!a||!Array.isArray(a.root_actions)||!Array.isArray(a.relationship_actions))throw Error('Malformed Model A object');
 const obs=new Set(state.obs.filter(x=>!visibleObservationIds||visibleObservationIds.has(x.id)).map(x=>x.id)),roots=new Set(state.roots.map(x=>x.id)),rels=new Set(state.relationships.map(x=>x.id)),contexts=new Set([...state.topics.map(x=>x.id),...roots]);
 const checks=[];
 const ok=(type,entry,ids,targetSet)=>{
  const refs=ids||[];const exists=validIds(refs,obs);
  const target=entry.existing_id===null||targetSet.has(entry.existing_id);
  const acceptable=entry.action==='no_change'||entry.action==='propose'||!!entry.existing_id;
  const sufficient=entry.action==='no_change'||refs.length>0;
  const c=type==='relationship'?Array.isArray(entry.contexts)&&entry.contexts.length>=2&&entry.contexts.every(x=>contexts.has(x))&&refs.length>=2:true;
  const pass=exists&&target&&acceptable&&sufficient&&c;
  checks.push({type,action:entry.action,accepted:pass,reason:pass?'structural_reference_integrity_only':'invalid_or_missing_evidence_reference_or_context'});
  return pass;
 };
 const proposals=[];
 for(const entry of a.root_actions){if(ok('root',entry,entry.observation_ids,roots)&&entry.action!=='no_change')proposals.push({type:'root',...clone(entry),status:'provisional_unverified_model_interpretation'});}
 for(const entry of a.relationship_actions){if(ok('relationship',entry,entry.observation_ids,rels)&&entry.action!=='no_change')proposals.push({type:'relationship',...clone(entry),status:'provisional_unverified_model_interpretation'});}
 for(const entry of a.teaching_effect_hypotheses||[]){if(validIds(entry.observations,obs)&&entry.observations.length>=2)proposals.push({type:'teaching_effect',...clone(entry),status:'provisional_not_causal'});}
 for(const entry of a.observed_understanding||[])if(!validIds(entry.observation_ids,obs))checks.push({type:'observation',accepted:false,reason:'unavailable_evidence_reference'});
 for(const entry of a.possible_underlying_causes||[])if(!validIds(entry.support_ids,obs)||!validIds(entry.counter_ids,obs))checks.push({type:'cause',accepted:false,reason:'unavailable_evidence_reference'});
 const explicit=[];
 for(const e of a.explicit_instruction_observations||[]){const source=state.obs.find(x=>x.id===e.evidence_id);const accepted=!!source&&typeof e.exact_excerpt==='string'&&e.exact_excerpt.trim()&&source.text.includes(e.exact_excerpt)&&typeof e.instruction==='string'&&e.instruction.trim().length>0&&e.instruction.length<=300;checks.push({type:'explicit_instruction',accepted:!!accepted,reason:accepted?'direct_user_instruction_with_verbatim_source':'unverified_instruction'});if(accepted)explicit.push({...clone(e),kind:'user_controlled_instruction_not_inferred_preference'});}
 const req=a.request_more_context?.scope;
 return {proposals,checks,explicit_instructions:explicit,need_more_context:typeof req==='string'&&req.length>0&&typeof a.request_more_context.why==='string'&&a.request_more_context.why.length>0};
}
export function validateC(c,allowed,observations){
 const ids=new Set(allowed.map(x=>x.id)),seen=new Set(observations.map(x=>x.id));
 if(!['same','refinement','distinct','uncertain'].includes(c.decision))throw Error('Bad C decision');
 if(['same','refinement'].includes(c.decision)?!ids.has(c.matched_id):c.matched_id!==null)throw Error('Bad C matched ID');
 if(!validIds(c.support_ids,seen)||!validIds(c.counter_ids,seen))throw Error('Bad C evidence');
 return {...c,status:'advisory_identity_only'};
}
export function makeRequest(role,data){
 if(!SCHEMAS[role])throw Error('Unknown model role');
 if(Buffer.byteLength(JSON.stringify(data))>25000)throw Error('Context too large; fail closed');
 return {model:'gpt-4.1-mini',store:false,max_tokens:role==='A'?1250:role==='B'?650:role==='L'?250:400,messages:[{role:'system',content:PROMPTS[role]},{role:'user',content:JSON.stringify(data)}],response_format:{type:'json_schema',json_schema:{name:'myway_s59_'+role,strict:true,schema:SCHEMAS[role]}}};
}
export function parseResult(raw,role){let x;try{x=JSON.parse(raw)}catch{throw Error(role+' invalid JSON')};if(!x||typeof x!=='object'||Object.keys(x).sort().join('|')!==Object.keys(SCHEMAS[role].properties).sort().join('|'))throw Error(role+' unexpected fields');return x;}
export function hash(x){return crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');}
export function scriptedMock(role,data){
 if(role==='B')return {reply:'I can help examine your reasoning. What would change if you tested that idea in a new example?',probe_offer:null,context_request:{scope:null,reason:null}};
 if(role==='A')return {observed_understanding:[],presenting_difficulty:null,possible_underlying_causes:[],root_actions:[],relationship_actions:[],explicit_instruction_observations:[],teaching_effect_hypotheses:[],next_probe:{purpose:null,probe_type:null,separates_hypotheses:[]},request_more_context:{scope:null,why:null},overall_uncertainty:'high'};
 if(role==='C')return {decision:'uncertain',matched_id:null,support_ids:[],counter_ids:[],rationale:'Offline fixture cannot judge root identity',request_more_candidates:false};
 if(role==='L')return {learner_message:'I am still working through this concept and would like to test my reasoning.',accept_probe:null,reasoning:null};
 throw Error('Invalid role');
}
