/** V3.7D.2C.7A.2: read-only explanations of the existing deterministic policy.
 * Never changes action, issues approval, or treats Model C as write authority.
 */
import type { TopicMemoryPreview } from "./topic-memory-preview";
import type { VerifierDecision } from "./topic-association-verifier";

type ReviewStatus={ok:boolean;reason:string}|null;

export function topicDecisionExplanation(preview:TopicMemoryPreview):string {
  if(preview.action==="associate_existing" &&
    ["review_candidate","repeated_difficulty"].includes(preview.difficultyContinuity?.relation??"")){
    return "The existing subject is supported, and a SPECIFIC approved historical difficulty event is a candidate. Compare both root-problem statements before choosing same ID or a genuinely distinct ID. Neither a semantic score nor Model C confirms equivalence automatically.";
  }
  switch(preview.reasonCode){
    case "semantic_root_problem_match":
    case "historical_root_problem_match":
      return "The topic and a historical root-problem description appear semantically related. Only a separate match to a validated approved event can support difficulty-ID reuse, and that requires an explicit reviewed choice.";
    case "reviewed_topic_new_difficulty":
      return "A grounded existing TOPIC has been found, even though its difficulty history is absent or different. A fresh, explicit human approval can add an immutable difficulty observation; no automatic association is authorized.";
    case "strong_topic_level_match":
      return "Existing topic subject matched; the learner may have a NEW difficulty within that topic. Do not claim the historical difficulty has repeated.";
    case "no_close_semantic_candidate":
      return "A separate, specifically named topic has been proposed for review. Related broader subjects do not automatically require merging; a missing match does not prove novelty.";
    case "difficulty_identity_review_needed":
      return "A nearby approved difficulty is ambiguous or possibly refined. Hold this write and clarify; never mint a duplicate identity silently.";
    case "existing_label_needs_review":
      return "The proposed subject label already exists. Hold rather than duplicate it without further topic-scope evidence.";
    default:
      return preview.action==="hold"
        ? "Insufficient evidence for a safe topic-memory change. Nearby topic labels do not establish a shared learning difficulty."
        : "This is a diagnostic proposal; database changes still require the existing server-held approval safeguards.";
  }
}

export function verifierComparisonExplanation(preview:TopicMemoryPreview,
 decision:VerifierDecision,review:ReviewStatus):string {
  const relation=decision.relation;
  if(relation==="uncertain")return "Model C is uncertain; the deterministic memory decision remains unchanged.";
  if(relation==="new_topic"){
    return preview.action==="propose_new"
      ? "Model C also suggests a new topic. This agreement is advisory, not proof that the concept is novel."
      : "Model C suggests a new topic, but the deterministic memory decision does not authorize that change.";
  }
  if(!decision.target_topic_id)return "Model C supplied no supported existing-topic target.";
  if(!review?.ok){
    return `Model C suggests an existing topic, but the evidence gate does not support manual association (${review?.reason?.replaceAll("_"," ")??"no approval"}). The deterministic ${preview.action.replaceAll("_"," ")} decision stands.`;
  }
  if(preview.action==="associate_existing"&&preview.targetTopicId===decision.target_topic_id){
    return "Model C and the deterministic preview point to the same topic. An explicit, freshly validated manual approval is still required to save evidence.";
  }
  return "Model C's suggestion differs from the deterministic preview, but the existing server evidence gate permits a separate human-reviewed association. No automatic write is authorized.";
}
