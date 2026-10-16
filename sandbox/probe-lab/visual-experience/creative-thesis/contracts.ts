export const CREATIVE_VISUAL_THESIS_CANDIDATES_SCHEMA_VERSION =
  "myway_creative_visual_thesis_candidates_v1" as const;
export const CREATIVE_VISUAL_THESIS_SELECTION_SCHEMA_VERSION =
  "myway_creative_visual_thesis_selection_v1" as const;

export type CreativeThesisModel =
  | "z-ai/glm-5.3"
  | "z-ai/glm-5.3-flash"
  | "deepseek-ai/deepseek-v4-pro";
export type CreativeThesisReasoningEffort = "low" | "high" | "max";
export type CreativeInterestUse = "structural_bridge" | "light_tone" | "do_not_use";

export type CreativeVisualThesisRequest = {
  learner_message: string;
  root_problem: string;
  current_strategy?: string;
  failure_mode?: string;
  target_learning_delta: string;
  teaching_signals?: string;
  prior_response_evidence?: string;
  profile_summary?: string;
  interests?: string;
  model?: CreativeThesisModel;
  reasoning_effort?: CreativeThesisReasoningEffort;
  candidate_count?: number;
};

export type CreativeVisualThesisCandidate = {
  id: string;
  title: string;
  visual_thesis: string;
  representation_strategy: string;
  story_arc: string[];
  critical_realization: string;
  why_this_targets_root_problem: string;
  personalization_fit: string;
  interest_use: CreativeInterestUse;
  truth_guard: string;
  execution_jobs: string[];
  freeform_execution_needs: string[];
};

export type CreativeVisualThesisCandidatesOutput = {
  schema_version: typeof CREATIVE_VISUAL_THESIS_CANDIDATES_SCHEMA_VERSION;
  candidates: CreativeVisualThesisCandidate[];
};

export type CreativeVisualThesisScorecard = {
  candidate_id: string;
  root_problem_fit: number;
  mental_model_change: number;
  personalization_fit: number;
  cognitive_load: number;
  truthfulness: number;
  visual_teachability: number;
  originality: number;
  reason: string;
};

export type CreativeVisualThesisSelectionOutput = {
  schema_version: typeof CREATIVE_VISUAL_THESIS_SELECTION_SCHEMA_VERSION;
  selected_candidate_id: string;
  selection_reason: string;
  critical_teaching_moment: string;
  scorecards: CreativeVisualThesisScorecard[];
};

export type CreativeCapabilityAssistItem = {
  capability_id: string;
  label: string;
  category: string;
  group: string;
  semantic_intent: string;
  fallback_capability_id: string | null;
  parameter_ids: string[];
};

export type CreativeVisualThesisNormalizedRequest = Required<
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
> & {
  model: CreativeThesisModel;
  reasoning_effort: CreativeThesisReasoningEffort;
  candidate_count: number;
};

export type CreativeVisualThesisRunSuccess = {
  ok: true;
  route: "visual-experience/creative-thesis";
  creative_brief: CreativeVisualThesisNormalizedRequest;
  divergence: {
    output: CreativeVisualThesisCandidatesOutput;
    provider_duration_ms: number;
    prompt_chars: number;
  };
  selection: {
    output: CreativeVisualThesisSelectionOutput;
    provider_duration_ms: number;
    prompt_chars: number;
  };
  selected_thesis: CreativeVisualThesisCandidate;
  capability_assist: {
    policy: {
      thesis_precedes_capabilities: true;
      capabilities_are_optional: true;
      freeform_execution_allowed: true;
      assets_were_not_exposed_during_ideation: true;
      director_palette_was_not_exposed_during_ideation: true;
    };
    manifest_schema_version: string;
    global_production_active: number;
    known_skills: CreativeCapabilityAssistItem[];
    freeform_execution_needs: string[];
  };
  metrics: {
    total_route_duration_ms: number;
    divergence_duration_ms: number;
    selection_duration_ms: number;
    candidate_count: number;
  };
};

export type CreativeVisualThesisRunFailure = {
  ok: false;
  route: "visual-experience/creative-thesis";
  phase: "divergence_provider" | "divergence_parse" | "divergence_validation" | "selection_provider" | "selection_parse" | "selection_validation";
  error: string;
  details?: unknown;
};

export type CreativeVisualThesisRunResponse =
  | CreativeVisualThesisRunSuccess
  | CreativeVisualThesisRunFailure;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean)
    : [];
}

function score(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10;
}

export function normalizeCreativeVisualThesisRequest(
  raw: Partial<CreativeVisualThesisRequest>,
): CreativeVisualThesisNormalizedRequest {
  // Single-thesis fast path: keep candidate_count in the request shape for
  // compatibility, but normalize every run to exactly one creative thesis.
  const count = 1;
  return {
    learner_message:
      stringValue(raw.learner_message) ||
      "Spanish sentences like ‘Se me cayó el vaso’ feel backwards even when I know the words.",
    root_problem:
      stringValue(raw.root_problem) ||
      "The learner over-relies on English-like linear word position to infer semantic roles and does not yet automatically use Spanish grammatical markers to reconstruct the underlying event structure.",
    current_strategy:
      stringValue(raw.current_strategy) ||
      "Translate each word into English, rearrange it into familiar English order, then infer the meaning.",
    failure_mode:
      stringValue(raw.failure_mode) ||
      "Clitics, omitted subjects, and non-English event packaging make role assignment unstable and overload working memory.",
    target_learning_delta:
      stringValue(raw.target_learning_delta) ||
      "Spanish grammatical cues should directly evoke a stable event structure before an English translation is built.",
    teaching_signals:
      stringValue(raw.teaching_signals) ||
      "Explicit relationship mapping helps. The learner often understands after explanation but wants intuitive recognition rather than another memorized grammar rule. Spatial and visual representations are promising.",
    prior_response_evidence:
      stringValue(raw.prior_response_evidence) ||
      "The learner strongly recognized the root-problem diagnosis as matching their real experience.",
    profile_summary:
      stringValue(raw.profile_summary) ||
      "Prefer intuitive visual explanations that expose hidden relationships before formal terminology. Avoid rote memorization and unnecessary jargon.",
    interests: stringValue(raw.interests),
    model:
      raw.model === "z-ai/glm-5.3-flash" ||
      raw.model === "deepseek-ai/deepseek-v4-pro"
        ? raw.model
        : "z-ai/glm-5.3",
    reasoning_effort:
      raw.reasoning_effort === "low" || raw.reasoning_effort === "high"
        ? raw.reasoning_effort
        : "max",
    candidate_count: count,
  };
}

export function validateCreativeVisualThesisCandidates(value: unknown) {
  const root = asRecord(value);
  const errors: string[] = [];
  if (!root) return { valid: false as const, errors: ["Output is not an object."] };
  if (root.schema_version !== CREATIVE_VISUAL_THESIS_CANDIDATES_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${CREATIVE_VISUAL_THESIS_CANDIDATES_SCHEMA_VERSION}.`);
  }
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  if (candidates.length !== 1) {
    errors.push("candidates must contain exactly 1 visual thesis in single-thesis fast-path mode.");
  }
  const ids = new Set<string>();
  candidates.forEach((candidate, index) => {
    const item = asRecord(candidate);
    if (!item) {
      errors.push(`candidate ${index + 1} is not an object.`);
      return;
    }
    const id = stringValue(item.id);
    if (!id) errors.push(`candidate ${index + 1} is missing id.`);
    if (id && ids.has(id)) errors.push(`candidate id ${id} is duplicated.`);
    if (id) ids.add(id);
    for (const key of [
      "title",
      "visual_thesis",
      "representation_strategy",
      "critical_realization",
      "why_this_targets_root_problem",
      "personalization_fit",
      "truth_guard",
    ]) {
      if (!stringValue(item[key])) errors.push(`candidate ${id || index + 1} is missing ${key}.`);
    }
    if (!stringArray(item.story_arc).length) errors.push(`candidate ${id || index + 1} needs story_arc.`);
    if (!stringArray(item.execution_jobs).length) errors.push(`candidate ${id || index + 1} needs execution_jobs.`);
    if (!Array.isArray(item.freeform_execution_needs)) {
      errors.push(`candidate ${id || index + 1} needs freeform_execution_needs array.`);
    }
    if (
      item.interest_use !== "structural_bridge" &&
      item.interest_use !== "light_tone" &&
      item.interest_use !== "do_not_use"
    ) {
      errors.push(`candidate ${id || index + 1} has invalid interest_use.`);
    }
  });
  return { valid: errors.length === 0, errors };
}

export function validateCreativeVisualThesisSelection(
  value: unknown,
  candidateIds: string[],
) {
  const root = asRecord(value);
  const errors: string[] = [];
  if (!root) return { valid: false as const, errors: ["Selection output is not an object."] };
  if (root.schema_version !== CREATIVE_VISUAL_THESIS_SELECTION_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${CREATIVE_VISUAL_THESIS_SELECTION_SCHEMA_VERSION}.`);
  }
  const selectedId = stringValue(root.selected_candidate_id);
  if (!candidateIds.includes(selectedId)) {
    errors.push("selected_candidate_id must reference one of the generated candidates.");
  }
  if (!stringValue(root.selection_reason)) errors.push("selection_reason is required.");
  if (!stringValue(root.critical_teaching_moment)) errors.push("critical_teaching_moment is required.");
  const scorecards = Array.isArray(root.scorecards) ? root.scorecards : [];
  if (!scorecards.length) errors.push("scorecards are required.");
  scorecards.forEach((scorecard, index) => {
    const item = asRecord(scorecard);
    if (!item) {
      errors.push(`scorecard ${index + 1} is not an object.`);
      return;
    }
    if (!candidateIds.includes(stringValue(item.candidate_id))) {
      errors.push(`scorecard ${index + 1} references an unknown candidate.`);
    }
    for (const key of [
      "root_problem_fit",
      "mental_model_change",
      "personalization_fit",
      "cognitive_load",
      "truthfulness",
      "visual_teachability",
      "originality",
    ]) {
      if (!score(item[key])) errors.push(`scorecard ${index + 1} has invalid ${key}; expected 0-10.`);
    }
    if (!stringValue(item.reason)) errors.push(`scorecard ${index + 1} needs reason.`);
  });
  return { valid: errors.length === 0, errors };
}
