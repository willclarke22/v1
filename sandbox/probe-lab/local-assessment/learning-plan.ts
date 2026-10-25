/** V3.5 isolated, read-only experimental teaching contract. No durable learning claims. */
export type TeachingStyle = "unsure" | "examples_first" | "rules_first" | "visual_first" | "step_by_step";
export type LearnerProfile = { interests: string[]; preferred_style: TeachingStyle; goal: string };
export type CandidateRelationship = {
  label: string; description: string; similarity: number;
  source: "mock_difficulty_embedding"; status: "candidate";
};
export type TeachingInput = {
  topic: string; root_problem: string; evidence_quote: string;
  root_problem_confidence: number;
  related_subjects: { label: string; similarity: number }[];
  candidate_relationships: CandidateRelationship[];
  profile: LearnerProfile;
};
export type TeachingPlan = {
  learner_reflection: string; teaching_strategy: string; next_step: string;
  visual_intent: string; use_interest: "structural_bridge" | "light_tone" | "do_not_use";
  chosen_interest: string; reason: string;
};
export const TEACH_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    learner_reflection: { type: "string" }, teaching_strategy: { type: "string" },
    next_step: { type: "string" }, visual_intent: { type: "string" },
    use_interest: { type: "string", enum: ["structural_bridge", "light_tone", "do_not_use"] },
    chosen_interest: { type: "string" }, reason: { type: "string" },
  },
  required: ["learner_reflection", "teaching_strategy", "next_step", "visual_intent", "use_interest", "chosen_interest", "reason"],
} as const;
export const TEACH_SYSTEM_PROMPT = `Plan one short way to help the learner, using only the supported difficulty and context. Return JSON only. Reflect the difficulty without inventing knowledge or progress. Choose a concrete teaching strategy, one doable next step, and visual intent (not asset IDs). Relationships are unverified candidates, not facts. Interests are optional; use only if they truly help, otherwise do_not_use. Don't claim a teaching style is proven effective. Be warm, clear, brief; no quizzes or full lesson.`;
export function normalizeProfile(raw: { interests: string; preferred_style: TeachingStyle; goal: string }): LearnerProfile {
  return {
    interests: raw.interests.split(/[,\n]/).map(x => x.trim()).filter(Boolean).slice(0, 5).map(x => x.slice(0, 45)),
    preferred_style: raw.preferred_style,
    goal: raw.goal.trim().slice(0, 140),
  };
}
export function discoverRelationshipCandidates(
  rootProblem: string, comparisons: { label: string; rootProblem: string; similarity: number }[],
): CandidateRelationship[] {
  if (!rootProblem.trim()) return [];
  return comparisons.filter(x => x.similarity >= 0.50 && x.rootProblem.trim())
    .slice(0, 2).map(x => ({
      label: x.label, description: x.rootProblem.slice(0, 240), similarity: x.similarity,
      source: "mock_difficulty_embedding" as const, status: "candidate" as const,
    }));
}
export function makeTeachingInput(
  assessment: { topic_name: string; root_problem: string; evidence_quote: string; root_problem_confidence: number },
  comparisons: { subjects: { label: string; similarity: number }[]; difficulties: { label: string; rootProblem: string; similarity: number }[] },
  profile: LearnerProfile,
): TeachingInput {
  return {
    topic: assessment.topic_name.slice(0, 110), root_problem: assessment.root_problem.slice(0, 500),
    evidence_quote: assessment.evidence_quote.slice(0, 450),
    root_problem_confidence: assessment.root_problem_confidence,
    related_subjects: comparisons.subjects.slice(0, 3).map(x => ({ label: x.label, similarity: x.similarity })),
    candidate_relationships: discoverRelationshipCandidates(assessment.root_problem, comparisons.difficulties),
    profile,
  };
}
export function validateTeachingPlan(raw: string, input: TeachingInput): { plan?: TeachingPlan; error?: string } {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return { error: "Teaching model returned invalid JSON." }; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { error: "Teaching plan must be an object." };
  const record = obj as Record<string, unknown>;
  const fields = TEACH_SCHEMA.required;
  if (Object.keys(record).sort().join("|") !== [...fields].sort().join("|")) return { error: "Teaching plan has missing or extra fields." };
  for (const field of fields) {
    if (typeof record[field] !== "string" || (record[field] as string).length > 620) return { error: `Invalid teaching field: ${field}` };
  }
  const plan = record as TeachingPlan;
  if (!(TEACH_SCHEMA.properties.use_interest.enum as readonly string[]).includes(plan.use_interest)) return { error: "Unknown interest decision." };
  for (const field of ["learner_reflection", "teaching_strategy", "next_step", "visual_intent", "reason"] as const) {
    if (!plan[field].trim()) return { error: `Empty teaching field: ${field}` };
  }
  const matches = input.profile.interests.find(i => i.toLowerCase() === plan.chosen_interest.trim().toLowerCase());
  if (plan.use_interest !== "do_not_use" && !matches) return { error: "Model chose an interest absent from the learner's test profile." };
  if (plan.use_interest === "do_not_use" && plan.chosen_interest.trim()) return { error: "Model supplied an interest despite declining personalization." };
  return { plan: { ...plan, chosen_interest: matches ?? "" } };
}
