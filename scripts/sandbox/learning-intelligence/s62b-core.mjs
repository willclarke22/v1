/** S62B: learner-state and typed root identity contract. Experimental, not production. */
const obj=p=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)});
const arr=t=>({type:'array',items:t});
const str={type:'string'}, nul={type:['string','null']}, yes={type:'boolean'};
const en=values=>({type:'string',enum:values});
export const KINDS=['understanding','root','shared_root','teaching_response','interest'];
export const ACTIONS=['create','revise','weaken','retire'];
export const ROLES=['supports_current','challenges_current','historical_context','context'];
export const A_SCHEMA=obj({
 observed:obj({kind:en(['question','attempt','explanation','activity','other']),evidence_ids:arr(str),demonstrated:str,untested_or_incorrect:str,conditions:str}),
 interpretation:obj({hypotheses:arr(str),uncertainty:en(['low','medium','high']),more_history_needed:nul}),
 memory_decisions:arr(obj({action:en(ACTIONS),record_type:en(KINDS),target_id:nul,claim:str,topics:arr(str),possible_instances:arr(str),evidence:arr(obj({id:str,role:en(ROLES)})),rationale:str,uncertainty:en(['low','medium','high'])})),
 learner_brief_for_B:obj({current_understanding:str,remaining_uncertainty:str,relevant_history:str,possible_shared_root:nul,teaching_response_evidence:str})
});
export const B_SCHEMA=obj({teacher_response:str,experience_proposal:obj({modality:en(['none','text','2d','3d','audio','mixed']),setting:str,learner_task:str,possible_actions:arr(str),private_assessment_intent:str})});
export const L_SCHEMA=obj({learner_utterance:str,selected_actions:arr(obj({control:str,operation:str,value:str})),request_hint:yes,declines:yes});
export const A_PROMPT=`You are Model A, MyWay's learner-understanding investigator. You do not teach or design the learner's activity. Your goal is to build and revise a useful, evidence-grounded understanding of this particular learner.

First describe what was actually observed and under what conditions. Distinguish a question, a guess, a coached attempt, a correct independent attempt, an error and a request for practice. Do not turn curiosity into demonstrated understanding, or treat successful repetition as independent mastery. Attend to contradictions and partial correctness within a response.

Compare new evidence against the learner's current knowledge and provisional root-problem hypotheses. A root hypothesis explains why this learner may struggle, rather than naming a topic or restating a wrong answer. Different topics may reveal one shared root, but similarity alone does not establish it. Preserve alternatives, supporting and contradicting evidence, and the limits of each tested context.

Decide what, if anything, is worth remembering for future learning. New observations may create, refine, weaken, or retire a belief; doing nothing is sometimes appropriate. Retain why an older belief was held when updating its current status. Never invent an observation or record ID. If consequential evidence is missing, request a bounded retrieval with the specific question it would help resolve.

Give Model B a concise, pedagogically useful learner brief: current understanding, uncertainty, potentially relevant roots and evidence about past teaching. Do not write Model B's probe, script, scene or task. Return the requested assessment and optional memory decisions in structured form. All conclusions remain provisional. Current answers are not automatically proof that a historic problem ended, nor proof it persists.`;
export const B_PROMPT=`You are Model B, a creative, knowledgeable, warm, natural teacher and learning-experience designer. Help this particular learner develop real understanding, responding first to what they are actually trying to learn.

Use the learner brief as useful but fallible guidance about what they appear to understand, where they may struggle, and what has helped before. Adapt the explanation and challenge to the learner. Do not impose a learning-style label or reveal private hypotheses as facts. If a recurring confusion seems relevant, make the connection tentatively and in ordinary language.

Own the teaching and the next experience. You may tell a story, explain an idea, introduce a challenge, offer a text question, imagine a 2D or 3D interactive world, use sound, or combine approaches. Choose the experience that best serves the learner, not the most elaborate one. Describe what the learner encounters, what they can try, and what their attempt might reveal. You are free to be imaginative; do not design around any particular software architecture.

For an independent challenge, do not give away the solution before the learner attempts it. For teaching practice, make helpful guidance available. Speak like a thoughtful teacher, not a test machine. Respond naturally and supply an optional experience proposal and its educational intent.`;
export const L_PROMPT=`You are Model L, a fictional learner in a research simulation, not a grader or teacher. Behave as one coherent person across sessions. Your simulated knowledge, uncertainty, interests, fatigue, hesitation and progress may change based on what you actually experience.

Use only the learner-visible conversation and actual presented activity, permitted controls, and feedback made available so far. Never access a hidden answer key, Model A's learner hypotheses, or Model B's private assessment notes. If you are shown an interactive activity, submit plausible permitted actions rather than claiming actions in prose. You may misunderstand instructions, make mistakes, request hints, explore or decline. Do not force an outcome merely because a test expects it.

Return an utterance and/or permitted actions, with brief learner-facing reasoning when natural. Your output is fictional behaviour, not evidence of human usability, perception, or teaching effectiveness.`;
const clone=x=>structuredClone(x);
export function verifyA(raw,packet,state){
 const a=typeof raw==='string'?JSON.parse(raw):clone(raw);
 if(!a?.observed||!a?.interpretation||!Array.isArray(a.memory_decisions)||!a?.learner_brief_for_B)throw Error('A: missing fields');
 const allowed=new Set(packet.allowed_evidence_ids),targetMap=new Map(packet.memory_candidates.map(x=>[x.id,x]));
 const topics=new Set(state.topics.map(x=>x.id));
 const ids=new Set();
 const check=(x,label)=>{if(!Array.isArray(x)||x.length>20||x.some(id=>!allowed.has(id))||new Set(x).size!==x.length)throw Error(`A: invalid cited evidence ${label}`);};
 check(a.observed.evidence_ids,'observation');
 if(!a.observed.evidence_ids.includes(packet.current.id))throw Error('A: current observation uncited');
 if(a.memory_decisions.length>5)throw Error('A: too many memory actions');
 for(const [i,m] of a.memory_decisions.entries()){
  if(!ACTIONS.includes(m.action)||!KINDS.includes(m.record_type)||typeof m.claim!=='string'||!m.claim.trim()||m.claim.length>1000||!['low','medium','high'].includes(m.uncertainty)||!m.rationale?.trim())throw Error(`A: malformed memory action ${i}`);
  if(!Array.isArray(m.evidence)||!m.evidence.length||m.evidence.length>20)throw Error('A: memory action missing evidence');
  check(m.evidence.map(x=>x.id),'memory action');
  if(!m.evidence.some(x=>x.id===packet.current.id))throw Error('A: action missing current evidence');
  if(m.evidence.some(x=>!ROLES.includes(x.role)))throw Error('A: invalid evidence role');
  if(!Array.isArray(m.topics)||!m.topics.length||m.topics.some(x=>!topics.has(x)))throw Error('A: invalid topic IDs');
  if(!Array.isArray(m.possible_instances)||m.possible_instances.some(x=>!targetMap.has(x)||!['root','shared_root'].includes(targetMap.get(x)?.type)))throw Error('A: invalid root instance IDs');
  if(m.record_type!=='shared_root'&&m.possible_instances.length)throw Error('A: possible instances only on shared root');
  if(m.record_type==='shared_root'&&(m.topics.length<2||m.possible_instances.length<2))throw Error('A: shared root needs 2 topics and 2 candidate roots');
  if(m.record_type==='shared_root'&&m.action==='create'){
   const sameInstances=state.records.some(r=>r.type==='shared_root'&&r.status!=='historical'&&JSON.stringify([...r.possible_instances].sort())===JSON.stringify([...m.possible_instances].sort()));
   if(sameInstances)throw Error('A: existing shared root with identical possible instances; revise or abstain');
   const distinct=new Set(m.evidence.map(e=>state.observations.find(o=>o.id===e.id)?.topic_id).filter(Boolean));
   if([...m.topics].filter(t=>distinct.has(t)).length<2)throw Error('A: shared root creation lacks direct cited observations from two topics');
  }
  if(m.action==='create'&&m.target_id!==null)throw Error('A: create target must be null');
  if(m.action!=='create'){
   const t=targetMap.get(m.target_id);
   if(!t||t.type!==m.record_type)throw Error('A: wrong or absent typed memory target');
   if(ids.has(m.target_id))throw Error('A: duplicate target in turn');ids.add(m.target_id);
  }
 }
 return a;
}
export function applyA(state,validated,currentId){
 const records=clone(state.records),events=[];
 const occupied=new Set(records.map(x=>x.id));
 for(const m of validated.memory_decisions){
  let r=m.action==='create'?null:records.find(x=>x.id===m.target_id);
  if(m.action!=='create'&&(!r||r.type!==m.record_type))throw Error('Memory application target missing/wrong-type');
  if(!r){const prefix=m.record_type==='shared_root'?'S':m.record_type==='root'?'R':'K';let i=1,newId;do{newId=`${state.learner}-${prefix}-${String(i++).padStart(3,'0')}`}while(occupied.has(newId));occupied.add(newId);
   r={id:newId,type:m.record_type,claim:'',topics:[],possible_instances:[],status:'provisional',uncertainty:'high',evidence:{supports_current:[],challenges_current:[],historical_context:[],context:[]},revisions:[],not_ground_truth:true};records.push(r);
  }
  const before={claim:r.claim,status:r.status,topics:r.topics,uncertainty:r.uncertainty,possible_instances:r.possible_instances};
  r.claim=m.claim;r.topics=[...m.topics];r.uncertainty=m.uncertainty;r.possible_instances=[...m.possible_instances];r.status=m.action==='weaken'?'challenged':m.action==='retire'?'historical':'provisional';
  for(const e of m.evidence)if(!r.evidence[e.role].includes(e.id))r.evidence[e.role].push(e.id);
  const change={version:state.version+events.length+1,source_id:currentId,action:m.action,before,after:{claim:r.claim,status:r.status,topics:r.topics,uncertainty:r.uncertainty,possible_instances:r.possible_instances},evidence:clone(m.evidence),reason:m.rationale};
  r.revisions.push(change);events.push({id:r.id,type:r.type,...change});
 }
 state.records=records;state.version+=events.length;return events;
}
export function learnerBrief(a,records,selectedIds=[],topicId=null){
 const summaries=records.filter(r=>selectedIds.includes(r.id)&&(!topicId||r.topics.includes(topicId))).slice(0,5).map(r=>({claim:r.claim,uncertainty:r.uncertainty,provisional:true}));
 return {assessment:a?clone(a.learner_brief_for_B):null,prior_knowledge:summaries,provisional:true};
}
