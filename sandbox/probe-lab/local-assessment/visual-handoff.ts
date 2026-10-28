/** V3.6 frozen, sandbox-only teaching-to-visual handoff. No visual model inference and no production writes. */
import type { TeachingPlan } from "./learning-plan";
export type VisualHandoff = Readonly<{
  schema_version: "myway_visual_handoff_v1";
  source: "validated_assessment_and_teaching";
  learner_message: string;
  topic: string;
  root_problem: string;
  learner_evidence: string;
  root_problem_confidence: number;
  resolution: "proceed" | "provisional";
  teaching_strategy: string;
  target_next_step: string;
  visual_intent: string;
  personalization: Readonly<{ use_interest: TeachingPlan["use_interest"]; chosen_interest: string | null; rationale: string; evidence_status: "model_proposal_not_effectiveness_evidence" }>;
  providers: Readonly<{ assessment: "edge" | "openai" | "glm"; teaching: "edge" | "openai" | "glm" }>;
  visual_stage: "not_run";
}>;
export function buildVisualHandoff(input: {
  learnerMessage: string; topic: string; rootProblem: string; evidenceQuote: string;
  rootConfidence: number; resolution: string; teaching: TeachingPlan;
  assessmentProvider: "edge" | "openai" | "glm"; teachingProvider: "edge" | "openai" | "glm";
}): { handoff?: VisualHandoff; error?: string } {
  if (!["proceed", "provisional"].includes(input.resolution)) return { error: "Visual handoff requires a completed, supported assessment." };
  if (![input.learnerMessage, input.topic, input.rootProblem, input.evidenceQuote, input.teaching.teaching_strategy, input.teaching.next_step, input.teaching.visual_intent].every(x => typeof x === "string" && !!x.trim()))
    return { error: "Visual handoff is missing validated upstream evidence or teaching decisions." };
  if (!Number.isFinite(input.rootConfidence) || input.rootConfidence < 0 || input.rootConfidence > 1) return { error: "Invalid root confidence." };
  if (input.teaching.use_interest !== "do_not_use" && !input.teaching.chosen_interest.trim()) return { error: "Invalid personalization choice." };
  const handoff: VisualHandoff = {
    schema_version: "myway_visual_handoff_v1", source: "validated_assessment_and_teaching",
    learner_message: input.learnerMessage.slice(0, 5600), topic: input.topic.slice(0, 110),
    root_problem: input.rootProblem.slice(0, 500), learner_evidence: input.evidenceQuote.slice(0, 450),
    root_problem_confidence: input.rootConfidence, resolution: input.resolution as "proceed" | "provisional",
    teaching_strategy: input.teaching.teaching_strategy,
    target_next_step: input.teaching.next_step,
    visual_intent: input.teaching.visual_intent,
    personalization: Object.freeze({
      use_interest: input.teaching.use_interest,
      chosen_interest: input.teaching.use_interest === "do_not_use" ? null : input.teaching.chosen_interest,
      rationale: input.teaching.reason,
      evidence_status: "model_proposal_not_effectiveness_evidence" as const,
    }),
    providers: Object.freeze({ assessment: input.assessmentProvider, teaching: input.teachingProvider }),
    visual_stage: "not_run",
  };
  return { handoff: Object.freeze(handoff) };
}
