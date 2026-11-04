/** 7A.3R: approved-event difficulty continuity; no mastery, migrations, or silent merging.
 * A topic is a subject; a difficulty is an ID shared by explicitly reviewed observations.
 * Semantic scores are provisional hypotheses; only the server-held approved event can anchor reuse.
 */
export type DifficultyContinuity = {
  relation: "new_difficulty" | "repeated_difficulty" | "possible_refinement" | "review_candidate" | "uncertain";
  difficultyId: string | null;
  relatedEventId: string | null;
  rationale: string;
  matchMethod?: "exact_approved_event" | "semantic_approved_event" | "semantic_review_candidate" | "lexical_possible_refinement";
  semanticSimilarity?: number | null;
  matchedRootProblem?: string | null; // From the specific approved event, not a topic summary.
};
export type ApprovedEventSimilarity = { topicId: string; eventId: string; similarity: number };
export type ContinuityEvidence = {
  approvedEventScores?: ApprovedEventSimilarity[];
  competingTopicSimilarity?: number;
  retrievalStatus?: string;
  topicSimilarity?: number | null;
  topicLabelFit?: number;
  rootConfidence?: number;
};
export type EligibleEvidence = {event_id?:unknown;difficulty_id?:unknown;root_problem?:unknown;origin?:unknown};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const norm=(s:string)=>s.toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const skip=new Set("the and are was that with from have this been their does about which because could would learner struggles does not understand how why what in on at of as to a an is it".split(" "));
const tokens=(s:string)=>[...new Set(norm(s).split(" ").filter(w=>w.length>=4&&!skip.has(w)))];
const overlap=(a:string,b:string)=>{const x=tokens(a),y=tokens(b);if(x.length<2||y.length<2)return 0;return x.filter(t=>y.includes(t)).length/Math.max(x.length,y.length);};
export function eligibleDifficultyEvents(topicJson:unknown):EligibleEvidence[]{
 const data=obj(topicJson);
 return (Array.isArray(data.myway_learning_evidence)?data.myway_learning_evidence:[])
  .filter((v):v is EligibleEvidence=>{
   const e=obj(v);
   return typeof e.event_id==="string"&&uuid.test(e.event_id) &&
      typeof e.root_problem==="string"&&e.root_problem.trim().length>=15&&e.root_problem.trim().length<=500&&
      (e.origin==="v37d2c_validated_assessment" ||
        (e.origin==="v37d2a_explicit_user_approval"&&data.myway_memory_origin==="v37d2a_explicit_user_approval"));
  });
}
function anchor(event:EligibleEvidence,approved:EligibleEvidence[]):string{
 const id=String(event.event_id);
 const candidate=event.difficulty_id;
 // A reused identity must point to a REAL approved event within this topic. Otherwise fail closed to self.
 return typeof candidate==="string"&&uuid.test(candidate)&&
   approved.some(e=>String(e.event_id)===candidate)?candidate:id;
}
const fresh=(rationale:string):DifficultyContinuity=>({relation:"new_difficulty",difficultyId:null,relatedEventId:null,rationale});
export function classifyDifficulty(topicJson:unknown,rootProblem:string,evidence:ContinuityEvidence={}):DifficultyContinuity{
 const prior=eligibleDifficultyEvents(topicJson);
 const input=norm(rootProblem);
 if(input.length<15)return fresh("Assessment is too short to identify a prior difficulty.");
 // Exact, approved and unambiguous normalized matches remain safe without an embedding service.
 const exact=prior.filter(e=>norm(String(e.root_problem))===input);
 if(exact.length){
  const ids=new Set(exact.map(e=>anchor(e,prior)));
  if(ids.size!==1)return {relation:"uncertain",difficultyId:null,relatedEventId:null,rationale:"Conflicting approved identities have the same root wording; no automatic linking or new ID."};
  const newest=exact[exact.length-1];
  return {relation:"repeated_difficulty",difficultyId:anchor(newest,prior),relatedEventId:String(newest.event_id),
    matchMethod:"exact_approved_event",semanticSimilarity:null,rationale:"An approved historical observation has the same normalized root problem. One reviewed new event may reuse its difficulty ID."};
 }
 // Unapproved summaries, topic-label matches and verifier judgments are deliberately excluded.
 const eligibleById=new Map(prior.map(e=>[String(e.event_id),e]));
 const bestByIdentity=new Map<string,{event:EligibleEvidence;score:number}>();
 for(const score of evidence.approvedEventScores??[]){
  if(!score||typeof score.eventId!=="string"||!Number.isFinite(score.similarity)||score.similarity< -1||score.similarity>1)continue;
  const event=eligibleById.get(score.eventId);if(!event)continue;
  const id=anchor(event,prior),found=bestByIdentity.get(id);
  if(!found||score.similarity>found.score)bestByIdentity.set(id,{event,score:score.similarity});
 }
 const ranked=[...bestByIdentity.values()].sort((a,b)=>b.score-a.score);
 const first=ranked[0],runner=ranked[1];
 // 7A.3R2: a borderline similarity is evidence to REVIEW, not evidence of novelty.
 // We can expose one specifically approved historical event for explicit human
 // equivalence review, but cannot claim a repeat or reuse its ID automatically.
 if(first&&first.score>=0.70){
  const highConfidence=evidence.retrievalStatus==="semantic_pgvector" &&
    (evidence.rootConfidence??0)>=0.78 &&
    (evidence.topicSimilarity??0)>=(first.score>=0.80?0.17:0.60) &&
    (evidence.topicLabelFit??0)>=(first.score>=0.80?0.20:0.67);
  const unique=(!runner||first.score-runner.score>=0.08) &&
    (!Number.isFinite(evidence.competingTopicSimilarity)||first.score-(evidence.competingTopicSimilarity??-1)>=0.08);
  if(highConfidence&&unique){
   const eventRoot=String(first.event.root_problem);
   if(first.score>=0.80) return {relation:"repeated_difficulty",difficultyId:anchor(first.event,prior),
    relatedEventId:String(first.event.event_id),matchMethod:"semantic_approved_event",semanticSimilarity:first.score,
    matchedRootProblem:eventRoot,
    rationale:`Approved-event similarity ${first.score.toFixed(3)} suggests a repeat. Explicitly review whether the underlying difficulty is really the same; no write is automatic.`};
   return {relation:"review_candidate",difficultyId:anchor(first.event,prior),
    relatedEventId:String(first.event.event_id),matchMethod:"semantic_review_candidate",semanticSimilarity:first.score,
    matchedRootProblem:eventRoot,
    rationale:`Approved-event similarity ${first.score.toFixed(3)} is borderline. The old and current roots may describe the same difficulty, a refinement, or distinct difficulties. Compare both statements before selecting one reviewed action; no automatic identity is assumed.`};
  }
  return {relation:"uncertain",difficultyId:null,relatedEventId:String(first.event.event_id),
    semanticSimilarity:first.score,matchedRootProblem:String(first.event.root_problem),
    rationale:"An approved event is semantically near but topic certainty or candidate uniqueness is insufficient. No new or reused ID may be saved; clarify first."};
 }
 if(first&&first.score>=0.64){
  return {relation:"possible_refinement",difficultyId:null,relatedEventId:String(first.event.event_id),semanticSimilarity:first.score,
   matchedRootProblem:String(first.event.root_problem),
   rationale:"Some approved-event semantic similarity exists, but is too weak for reliable identity review. Clarify whether this is a recurring or distinct learning difficulty before saving."};
 }
 const near=prior.map(event=>({event,score:overlap(rootProblem,String(event.root_problem))})).sort((a,b)=>b.score-a.score)[0];
 if(near&&near.score>=0.72){
  return {relation:"possible_refinement",difficultyId:null,relatedEventId:String(near.event.event_id),matchMethod:"lexical_possible_refinement",
   rationale:"Wording resembles an earlier difficulty, but repetition/refinement is not confirmed. Preserve both observations; no silent merge or new ID."};
 }
 return fresh(prior.length?"No supported recurrence found in approved difficulty observations; a distinct difficulty may be reviewed.":"No approved historical difficulty events exist for this topic.");
}
/** This pure validator is called again after the commit-time fresh database digest check.
 * The client never supplies a topic ID, event ID or difficulty UUID to choose what to reuse.
 */
export function resolveReviewedIdentity(topicJson:unknown,rootProblem:string,proposal:DifficultyContinuity|undefined,choice:unknown):
  {relation:"new_difficulty"|"repeated_difficulty";difficultyId:string|null;relatedEventId:string|null}|null {
 if(choice!=="reuse_existing"&&choice!=="new_distinct")return null;
 if(!proposal)return choice==="new_distinct"?{relation:"new_difficulty",difficultyId:null,relatedEventId:null}:null;
 const approved=eligibleDifficultyEvents(topicJson);
 if(proposal.relation==="uncertain"||proposal.relation==="possible_refinement")return null;
 if(proposal.relation==="new_difficulty")return choice==="new_distinct"?{relation:"new_difficulty",difficultyId:null,relatedEventId:null}:null;
 if(!["repeated_difficulty","review_candidate"].includes(proposal.relation)||!proposal.relatedEventId||!proposal.difficultyId)return null;
 const event=approved.find(e=>e.event_id===proposal.relatedEventId);
 if(!event||anchor(event,approved)!==proposal.difficultyId)return null;
 if(proposal.matchMethod==="exact_approved_event" && norm(String(event.root_problem))!==norm(rootProblem))return null;
 if(proposal.matchMethod==="semantic_approved_event" &&
    !(typeof proposal.semanticSimilarity==="number"&&proposal.semanticSimilarity>=0.80&&proposal.semanticSimilarity<=1))return null;
 if(proposal.matchMethod==="semantic_review_candidate" &&
    !(proposal.relation==="review_candidate"&&typeof proposal.semanticSimilarity==="number"&&
      proposal.semanticSimilarity>=0.70&&proposal.semanticSimilarity<0.80&&
      proposal.matchedRootProblem===String(event.root_problem)))return null;
 if(!["exact_approved_event","semantic_approved_event","semantic_review_candidate"].includes(proposal.matchMethod??""))return null;
 return choice==="reuse_existing"?
  {relation:"repeated_difficulty",difficultyId:proposal.difficultyId,relatedEventId:proposal.relatedEventId}:
  {relation:"new_difficulty",difficultyId:null,relatedEventId:proposal.relatedEventId};
}
