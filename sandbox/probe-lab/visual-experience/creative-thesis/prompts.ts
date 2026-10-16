import type { CreativeVisualThesisRequest } from "./contracts";

export const CREATIVE_THESIS_DIVERGENCE_SYSTEM_PROMPT = `You are MyWay's Creative Visual Thesis Generator.

Your job is to invent the best visual idea for changing one learner's mental model. You are upstream of asset retrieval, Director capabilities, and rendering. Protect that creative freedom.

PERSONALIZATION PRIORITY:
1. Cognitive personalization: target the actual missing mental model.
2. Instructional personalization: choose the representation strategy that best creates the needed insight.
3. Aesthetic/contextual personalization: use interests, style, tone, or metaphor only when they genuinely help.

CREATIVE RULES:
- Invent one strongest representation strategy from first principles for this learner.
- You may invent metaphors, spatial systems, characters, transformations, symbolic worlds, simulations, narrative devices, diagrams, or hybrid approaches.
- Do not choose from a predefined visual template library.
- Do not assume any asset inventory exists.
- Do not request or name Director capability ids.
- Do not constrain the idea to what you think a renderer can already do.
- Prefer a visual story that performs the explanation rather than a poster that merely displays it, when that better fits the learning problem.
- Interests are optional evidence, never a theming requirement.
- Every analogy or metaphor must preserve the truth of the concept.
- Keep the thesis focused enough that a renderer could later turn it into a short coherent experience.

Return JSON only.`;

export function buildCreativeThesisDivergenceMessages(
  input: Required<
    Pick<
      CreativeVisualThesisRequest,
      | "learner_message"
      | "root_problem"
      | "current_strategy"
      | "failure_mode"
      | "target_learning_delta"
      | "teaching_signals"
      | "prior_response_evidence"
      | "profile_summary"
      | "interests"
    >
  >,
) {
  const shape = {
    schema_version: "myway_creative_visual_thesis_candidates_v1",
    candidates: [
      {
        id: "thesis_a",
        title: "short memorable name",
        visual_thesis: "the central visual idea in plain language",
        representation_strategy: "how the concept will be represented",
        story_arc: ["moment 1", "moment 2", "moment 3"],
        critical_realization: "the exact learner realization the visual should cause",
        why_this_targets_root_problem: "why this representation changes the missing mental model",
        personalization_fit: "why it fits this learner rather than a generic audience",
        interest_use: "structural_bridge | light_tone | do_not_use",
        truth_guard: "what must stay conceptually accurate",
        execution_jobs: ["semantic job the future renderer must perform"],
        freeform_execution_needs: ["creative effect that may exceed any known capability library"],
      },
    ],
  };

  return [
    { role: "system" as const, content: CREATIVE_THESIS_DIVERGENCE_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Create one strongest visual thesis for this learner.

CREATIVE_LEARNING_BRIEF:
${JSON.stringify(
  {
    learner_message: input.learner_message,
    root_problem: input.root_problem,
    current_strategy: input.current_strategy,
    failure_mode: input.failure_mode,
    target_learning_delta: input.target_learning_delta,
    teaching_signals: input.teaching_signals,
    prior_response_evidence: input.prior_response_evidence,
    profile_summary: input.profile_summary,
    interests: input.interests || null,
  },
  null,
  2,
)}

OUTPUT_JSON_SHAPE:
${JSON.stringify(shape, null, 2)}

Return exactly one thesis in the candidates array. Do not spend tokens proposing alternatives or comparing options. The single thesis should be the strongest representation you can devise for this learner from first principles. Return only JSON.`,
    },
  ];
}
