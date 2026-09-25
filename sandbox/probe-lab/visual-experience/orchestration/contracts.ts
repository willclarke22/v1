export const VISUAL_ORCHESTRATION_STAGES = [1, 2, 3] as const;

export type VisualOrchestrationStage = (typeof VISUAL_ORCHESTRATION_STAGES)[number];
export type VisualOrchestrationModel = "z-ai/glm-5.3" | "z-ai/glm-5.3-flash";
export type VisualOrchestrationReasoningEffort = "low" | "high" | "max";
export type VisualOrchestrationAssetMode =
  | "bodyparts3d_full_atlas"
  | "bodyparts3d_slp_pilot";

export type VisualOrchestrationRequest = {
  stage: VisualOrchestrationStage;
  learner_message: string;
  model: VisualOrchestrationModel;
  reasoning_effort: VisualOrchestrationReasoningEffort;
  asset_collection_mode: VisualOrchestrationAssetMode;
};

export type VisualConceptRequirement = {
  semantic_name: string;
  role: string;
  semantic_tags?: string[];
};

export type VisualSemanticRelationship = {
  source_semantic_name: string;
  relationship: string;
  target_semantic_name: string;
  learning_reason: string;
};

export const VISUAL_ORCHESTRATION_STAGE_DEFINITIONS = {
  1: {
    title: "Root problem",
    purpose: "Can GLM identify the precise missing mental model without solving the whole turn?",
    max_tokens: 768,
  },
  2: {
    title: "Anatomy requirements",
    purpose: "Can GLM request the minimum semantic anatomy cast needed to make the root problem visible?",
    max_tokens: 1400,
  },
  3: {
    title: "Target takeaway + relationships",
    purpose: "Can GLM turn the root problem into a compact target mental model and semantic mechanism graph?",
    max_tokens: 2000,
  },
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeVisualOrchestrationStage(value: unknown): VisualOrchestrationStage {
  return value === 2 || value === 3 ? value : 1;
}

export function normalizeVisualOrchestrationModel(value: unknown): VisualOrchestrationModel {
  return value === "z-ai/glm-5.3-flash" ? value : "z-ai/glm-5.3";
}

export function normalizeVisualOrchestrationReasoningEffort(
  value: unknown,
): VisualOrchestrationReasoningEffort {
  return value === "high" || value === "max" ? value : "low";
}

export function normalizeVisualOrchestrationAssetMode(
  value: unknown,
): VisualOrchestrationAssetMode {
  return value === "bodyparts3d_slp_pilot"
    ? value
    : "bodyparts3d_full_atlas";
}

export function validateVisualOrchestrationOutput(
  stage: VisualOrchestrationStage,
  value: unknown,
) {
  const output = asRecord(value);
  const fatal_errors: string[] = [];
  if (!output) {
    return { valid: false, fatal_errors: ["Model output is not a JSON object."] };
  }
  const expectedSchema = `myway_visual_orchestration_stage${stage}_v1`;
  if (output.schema_version !== expectedSchema) {
    fatal_errors.push(`schema_version must be ${expectedSchema}.`);
  }
  if (!nonEmptyString(output.topic_label)) fatal_errors.push("topic_label is required.");
  if (!nonEmptyString(output.root_problem)) fatal_errors.push("root_problem is required.");

  if (stage >= 2) {
    const concepts = Array.isArray(output.required_visual_concepts)
      ? output.required_visual_concepts
      : [];
    if (concepts.length === 0) {
      fatal_errors.push("required_visual_concepts must contain at least one item.");
    }
    concepts.forEach((concept, index) => {
      const record = asRecord(concept);
      if (!record || !nonEmptyString(record.semantic_name) || !nonEmptyString(record.role)) {
        fatal_errors.push(`required_visual_concepts[${index}] needs semantic_name and role.`);
      }
    });
  }

  if (stage >= 3) {
    if (!nonEmptyString(output.target_takeaway)) fatal_errors.push("target_takeaway is required.");
    const relationships = Array.isArray(output.relationships) ? output.relationships : [];
    if (relationships.length === 0) fatal_errors.push("relationships must contain at least one item.");
    const conceptNames = new Set(
      (Array.isArray(output.required_visual_concepts) ? output.required_visual_concepts : [])
        .map((concept) => asRecord(concept)?.semantic_name)
        .filter((name): name is string => nonEmptyString(name))
        .map((name) => name.trim().toLowerCase()),
    );
    relationships.forEach((relationship, index) => {
      const record = asRecord(relationship);
      if (
        !record ||
        !nonEmptyString(record.source_semantic_name) ||
        !nonEmptyString(record.relationship) ||
        !nonEmptyString(record.target_semantic_name) ||
        !nonEmptyString(record.learning_reason)
      ) {
        fatal_errors.push(`relationships[${index}] is incomplete.`);
        return;
      }
      const source = String(record.source_semantic_name).trim().toLowerCase();
      const target = String(record.target_semantic_name).trim().toLowerCase();
      if (!conceptNames.has(source) || !conceptNames.has(target)) {
        fatal_errors.push(`relationships[${index}] must reference required_visual_concepts by semantic_name.`);
      }
    });
  }

  return { valid: fatal_errors.length === 0, fatal_errors };
}

export function visualConceptSemanticNames(value: unknown) {
  const output = asRecord(value);
  if (!output || !Array.isArray(output.required_visual_concepts)) return [];
  return output.required_visual_concepts
    .map((concept) => asRecord(concept)?.semantic_name)
    .filter((name): name is string => nonEmptyString(name));
}
