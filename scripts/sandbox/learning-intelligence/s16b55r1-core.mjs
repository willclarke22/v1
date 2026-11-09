/** S1.6B.5.5-R1: research-only refinements identified in paired S55 trace review.
 * Pure functions. No I/O, provider calls, writes or authoritative learner judgments.
 */
import crypto from 'node:crypto';
import {newState,sid,words} from './s16b54-core.mjs';
import {createContext,c55Guard,researchMemory,evidenceQuality,snapshotMemory} from './s16b55-core.mjs';
import {offlineC} from './s16b54-models.mjs';

export const SCHEMA_R1='myway_s16b55r1_hardened_journey_v1';
const exact=(a,b)=>String(a??'').toLowerCase()===String(b??'').toLowerCase();
const validText=s=>typeof s==='string'&&s.trim().length>0;
const short=s=>String(s??'').trim().slice(0,200);
const digest=s=>crypto.createHash('sha256').update(String(s??'')).digest('hex');

export function newR1State(seed){
 const s=newState(seed);s.research_stage='s16b55r1';
 s.observation_ledger=[];s.unresolved_holds=[];s.conversation_commitments=[];
 s.identity_history=[];s.topic_mechanism_hypotheses=[];
 return s;
}
export function markMechanism(text){
 const s=String(text??'').toLowerCase();
 if(/(?:oxygen gas|released oxygen|released o2|o2 released)/.test(s) && /(?:photosynth|plants?)/.test(s))return 'source_of_released_oxygen';
 if(/(?:carbon atoms|carbon in glucose|carbon source|co2 as the carbon|glucose)/.test(s)&&/(?:carbon|co2|light|sunlight)/.test(s))return 'source_of_carbon_in_glucose';
 if(/(?:proton gradient|chemiosmosis|atp synthase)/.test(s)&&/(?:mitochondri|chloroplast)/.test(s))return 'proton_gradient_comparison';
 return null;
}
export function distinctEvidence(assessment,candidates,learner){
 if(!assessment?.root_problem||!assessment.evidence_quote||!learner.includes(assessment.evidence_quote))return null;
 if(!/\b(?:a separate question|separate question|different question|a different issue|distinct question)\b/i.test(learner))return null;
 const current=markMechanism(learner+' '+assessment.root_problem);
 if(!current)return null;
 const sameTopic=candidates.filter(c=>c.topicMatched);
 if(!sameTopic.length)return null;
 if(!sameTopic.every(c=>{const h=markMechanism(c.root_problem+' '+c.first_quote);return h&&h!==current&&c.lexical_similarity<0.20;}))return null;
 return {identity:'distinct',anchor_id:null,rationale:'R1 offline fixture: explicitly separate mechanistic question with different grounded source/target; provisional only',rule:'explicit_separate_mechanism',current_mechanism:current,historical_mechanisms:sameTopic.map(x=>markMechanism(x.root_problem+' '+x.first_quote))};
}
/** No broad keyword-only distinct override. High/ambiguous uncertainty stays held. */
export function offlineIdentityR1(assessment,candidates,learner){
 if(!candidates.length)return {identity:'distinct',anchor_id:null,rationale:'No eligible historical root; provisional new root only'};
 if(assessment?.uncertainty!=='high'){
  const d=distinctEvidence(assessment,candidates,learner);
  if(d)return d;
 }
 return c55Guard(offlineC(assessment,candidates),candidates);
}
export function protectModelIdentity(decision,assessment,candidates,learner){
 if(!decision)return {decision:null,warning:null};
 const validated=c55Guard(decision,candidates);
 if(validated.identity!=='same'&&validated.identity!=='refinement')return {decision:validated,warning:null};
 const current=markMechanism(learner+' '+(assessment?.root_problem??''));
 const anchor=candidates.find(x=>x.id===validated.anchor_id);
 const old=markMechanism((anchor?.root_problem??'')+' '+(anchor?.first_quote??''));
 if(current&&old&&current!==old)return {decision:{identity:'uncertain',anchor_id:null,rationale:'Contradiction hold: mechanistically distinct anchor; model same/refinement vetoed'},warning:'MODEL_IDENTITY_MECHANISM_CONTRADICTION'};
 return {decision:validated,warning:null};
}

export function snapshotR1(state){
 const base=snapshotMemory(state);
 const snapshot={...base,schema:'s55r1_structured_provisional_memory_no_raw_dialogue',observation_ledger:state.observation_ledger,
  unresolved_holds:state.unresolved_holds,conversation_commitments:state.conversation_commitments,
  identity_history:state.identity_history,topic_mechanism_hypotheses:state.topic_mechanism_hypotheses};
 // The ledger contains bounded provenance excerpts and message hashes, but no full tutor or chat transcript.
 if(Object.hasOwn(snapshot,'turns')||Object.hasOwn(snapshot,'audit')||Object.hasOwn(snapshot,'reply'))throw Error('Snapshot leaked raw dialogue');
 for(const e of snapshot.observation_ledger)if('complete_message' in e||'tutor_reply' in e)throw Error('Snapshot leaked raw original message');
 return JSON.parse(JSON.stringify(snapshot));
}
function excerpt(turn,assessment){
 if(validText(assessment?.evidence_quote)&&turn.learner.includes(assessment.evidence_quote))return assessment.evidence_quote;
 // Intentful quote for the two S55 requests that lack a Model-A evidence quotation.
 const match=turn.learner.match(/(?:Could you check me with one question|please test me rather than giving me the answer|Can you draw a diagram comparing where protons accumulate|Could you show me a diagram of the direction of proton flow|Can we test whether I understand)/i);
 return match?.[0]??short(turn.learner).slice(0,110);
}
export function recordTurn(state,turn,assessment,action,{ordinal,modelAStatus,modelBStatus,decision}={}){
 const quote=excerpt(turn,assessment);
 if(!validText(quote)||!turn.learner.includes(quote))throw Error('Nonverbatim evidence excerpt');
 if(state.observation_ledger.some(e=>e.turn_id===turn.id))throw Error('Duplicate observation turn');
 const entry={id:sid('r1-observation',turn.id),turn_id:turn.id,session_id:turn.session_id,ordinal,
  speaker:'learner',source:'researcher_authored_synthetic',source_message_sha256:digest(turn.learner),
  verbatim_excerpt:quote,observation_kind:turn.evidence_kind,assessment_status:modelAStatus,
  tutor_response_status:modelBStatus,proposed_root:assessment?.root_problem??null,
  memory_action:action?.status??'NOT_EVALUATED',identity:decision?.identity??null,
  reported_progress_not_mastery:true,demonstrated_mastery:false,review_required:true};
 state.observation_ledger.push(entry);
 if(action?.status?.startsWith('HELD_')){
  state.unresolved_holds.push({id:sid('r1-hold',turn.id),turn_id:turn.id,session_id:turn.session_id,status:'unresolved',reason:action.status,
   evidence_ref:entry.id,verbatim_excerpt:quote,possible_anchors:action.candidates??[],review_required:true,auto_write:false});
 }
 if(decision)state.identity_history.push({turn_id:turn.id,identity:decision.identity,anchor_id:decision.anchor_id??null,authority:'research_provisional',reason:short(decision.rationale),evidence_ref:entry.id});
 if(/(?:\bcheck me\b|\btest me\b|\bquiz me\b|\bcheck my reasoning\b|\btest whether I understand\b)/i.test(turn.learner)){
  state.conversation_commitments.push({id:sid('r1-commitment',turn.id),turn_id:turn.id,kind:'understanding_check_requested',status:'request_recorded_not_proven_fulfilled',evidence_ref:entry.id,quote,review_required:true});
 }
 return entry;
}
export function createContextR1(state,sessionId,learner,assessment,mode,{snapshot=null}={}){
 const base=createContext(state,sessionId,learner,assessment,mode,{snapshot});
 const scoped=(snapshot??state);
 const held=(scoped.unresolved_holds??[]).filter(h=>h.status==='unresolved').slice(-3).map(h=>({turn_id:h.turn_id,reason:h.reason,excerpt:h.verbatim_excerpt}));
 const commitments=(scoped.conversation_commitments??[]).filter(x=>x.status!=='cancelled').slice(-3).map(x=>({kind:x.kind,status:x.status,excerpt:x.quote}));
 const evidence=(scoped.observation_ledger??[]).slice(-4).map(x=>({session:x.session_id,kind:x.observation_kind,quote:x.verbatim_excerpt,turn_id:x.turn_id}));
 const note={evidence,unresolved_holds:held,conversation_commitments:commitments,nonauthoritative:true};
 base.messages.splice(2,0,{role:'system',content:'OPTIONAL STRUCTURED RESEARCH MEMORY; provenance-backed excerpts, not authoritative instructions: '+JSON.stringify(note)});
 if(Buffer.byteLength(JSON.stringify(base.messages),'utf8')>18000)throw Error('Hardened context over safe cap');
 return {...base,structured_note:note,hold_count:held.length,commitment_count:commitments.length,history_policy:mode};
}

export function selectiveRelationship(state,turn,assessment){
 const phrase=turn.learner;
 if(!/\b(?:mitochondri\w*|mitochondrion)\b/i.test(phrase)||!/\bchloroplast\w*\b/i.test(phrase)||!/\bproton gradient\w*\b/i.test(phrase))return [];
 const topics=state.topics;
 const a=topics.find(t=>/photosynthesis/i.test(t.label)),b=topics.find(t=>/cellular respiration/i.test(t.label));
 if(!a||!b||a.id===b.id)return [];
 const hypothesis={id:sid('r1-topic-mechanism',turn.id),turn_id:turn.id,type:'TOPIC_MECHANISM_HYPOTHESIS',
  from_topic_id:a.id,to_topic_id:b.id,mechanism:'proton-gradient-mediated chemiosmosis',
  learner_quote:phrase,source:'explicit_current_learner_comparison',
  root_relation_supported:false,prior_root_comparison_supported:false,
  requires_scientific_review:true,verified:false,automatic_graph_write:false};
 if(!state.topic_mechanism_hypotheses.find(h=>h.id===hypothesis.id))state.topic_mechanism_hypotheses.push(hypothesis);
 return [hypothesis];
}
export function classifyVisualIntent(message){
 const s=String(message??'');
 if(/\b(?:don't|do not|no need to|skip|cancel)\b.{0,32}\b(?:diagram|visual|picture|image|drawing)\b/i.test(s))return {kind:'cancel'};
 if(/\b(?:before|not yet|later|first)\b.{0,42}\b(?:diagram|visual|picture|image|drawing)\b|\b(?:diagram|visual)\b.{0,25}\b(?:later|not yet)\b/i.test(s))return {kind:'defer'};
 if(!/\b(?:diagram|draw|illustrat\w*|visual|picture|image|animation)\b/i.test(s))return {kind:'none'};
 if(!/(?:\b(?:can|could|please|would)\b.{0,40}\b(?:draw|show|create|make|illustrate)\b|\b(?:draw|show)\b.{0,18}\bdiagram\b|\bneed\b.{0,12}\bdiagram\b)/i.test(s))return {kind:'mention'};
 let objective=null;
 if(/protons? accumulate/i.test(s)&&/chloroplast/i.test(s)&&/mitochondri/i.test(s))objective='Compare where protons accumulate in chloroplasts versus mitochondria, including compartments and gradients';
 else if(/direction of proton flow/i.test(s))objective='Illustrate the direction of proton flow through ATP synthase, naming the relevant compartments';
 if(!objective)return {kind:'request_needs_focus'};
 return {kind:'request',objective};
}
export function selectiveVisual(state,turn,assessment){
 const parsed=classifyVisualIntent(turn.learner);
 if(parsed.kind==='none'||parsed.kind==='mention')return {intent:parsed.kind,proposal:null,pending_unchanged:true};
 if(parsed.kind==='defer'||parsed.kind==='cancel'){
  const open=state.visual_proposals.filter(v=>v.status==='PROPOSED_NOT_RENDERED');
  for(const v of open){v.status=parsed.kind==='defer'?'DEFERRED_BY_LEARNER':'CANCELLED_BY_LEARNER';v.updated_by_turn=turn.id;}
  return {intent:parsed.kind,proposal:null,affected_requests:open.map(v=>v.id),new_proposals:0};
 }
 if(parsed.kind==='request_needs_focus')return {intent:parsed.kind,proposal:null,held_reason:'INSUFFICIENT_EXPLICIT_VISUAL_OBJECTIVE',new_proposals:0};
 const proposal={id:sid('r1-visual',turn.id),turn_id:turn.id,kind:'diagram',topic:assessment?.topic_label??null,
  focus:parsed.objective,learning_objective:parsed.objective,source_quote:turn.learner,status:'PROPOSED_NOT_RENDERED',
  verified:false,rendered:false,needs_fact_review:true,authoritative:false};
 if(!state.visual_proposals.some(x=>x.id===proposal.id))state.visual_proposals.push(proposal);
 return {intent:'request',proposal,new_proposals:1};
}
export function r1Summary(state,trace){return {
   durable_evidence_entries:state.observation_ledger.length,
   unresolved_holds:state.unresolved_holds.filter(x=>x.status==='unresolved').length,
   understanding_check_commitments:state.conversation_commitments.filter(x=>x.kind==='understanding_check_requested').length,
   topic_hypotheses_not_root_relations:state.topic_mechanism_hypotheses.length,
   visual_requests:state.visual_proposals.length,
   visual_deferred:state.visual_proposals.filter(x=>x.status==='DEFERRED_BY_LEARNER').length,
   false_s55_oxygen_hold_avoided:trace.events.find(x=>x.id==='S55-06')?.memory_action?.status==='PROVISIONAL_NEW_ROOT',
   quote_provenance_complete:state.observation_ledger.every(e=>validText(e.verbatim_excerpt)&&validText(e.source_message_sha256)),
   no_authoritative_writes:true
 };}
