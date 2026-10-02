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

export type VisualAssetIntentRole =
  | "primary_subject"
  | "context"
  | "supporting"
  | "environment"
  | "effect";
export type VisualAssetIntentImportance = "required" | "preferred" | "optional";
export type VisualAssetIntentLaterality = "left" | "right" | "bilateral" | "unspecified";

export type VisualAssetIntent = {
  concept: string;
  role: VisualAssetIntentRole;
  importance: VisualAssetIntentImportance;
  quantity?: number;
  laterality?: VisualAssetIntentLaterality;
  appearance?: {
    color?: string;
    material?: string;
    style?: string;
  };
};

// Legacy Stage 2/3 shape retained only as a compatibility input for diagnostics/verifiers.
export type VisualConceptRequirement = {
  semantic_name: string;
  role: string;
  semantic_tags?: string[];
};

export type VisualSemanticRelationship = {
  source_concept?: string;
  source_semantic_name?: string;
  relationship: string;
  target_concept?: string;
  target_semantic_name?: string;
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
    purpose: "Can GLM name the minimum concrete asset concepts needed to make the root problem visible?",
    max_tokens: 1200,
  },
  3: {
    title: "Target takeaway + relationships",
    purpose: "Can GLM name the asset cast and the smallest semantic mechanism graph needed to correct the mental model?",
    max_tokens: 1800,
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

function isAssetIntentRole(value: unknown): value is VisualAssetIntentRole {
  return value === "primary_subject" || value === "context" || value === "supporting" || value === "environment" || value === "effect";
}

function isAssetIntentImportance(value: unknown): value is VisualAssetIntentImportance {
  return value === "required" || value === "preferred" || value === "optional";
}

function isAssetIntentLaterality(value: unknown): value is VisualAssetIntentLaterality {
  return value === "left" || value === "right" || value === "bilateral" || value === "unspecified";
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
  const expectedSchema = stage === 1
    ? "myway_visual_orchestration_stage1_v1"
    : `myway_visual_orchestration_stage${stage}_v2`;
  if (output.schema_version !== expectedSchema) {
    fatal_errors.push(`schema_version must be ${expectedSchema}.`);
  }
  if (!nonEmptyString(output.topic_label)) fatal_errors.push("topic_label is required.");
  if (!nonEmptyString(output.root_problem)) fatal_errors.push("root_problem is required.");

  if (stage >= 2) {
    const intents = Array.isArray(output.asset_intents) ? output.asset_intents : [];
    if (intents.length === 0) {
      fatal_errors.push("asset_intents must contain at least one item.");
    }
    intents.forEach((intent, index) => {
      const record = asRecord(intent);
      if (!record || !nonEmptyString(record.concept)) {
        fatal_errors.push(`asset_intents[${index}].concept is required.`);
        return;
      }
      if (!isAssetIntentRole(record.role)) {
        fatal_errors.push(`asset_intents[${index}].role is invalid.`);
      }
      if (!isAssetIntentImportance(record.importance)) {
        fatal_errors.push(`asset_intents[${index}].importance is invalid.`);
      }
      if (record.laterality !== undefined && !isAssetIntentLaterality(record.laterality)) {
        fatal_errors.push(`asset_intents[${index}].laterality is invalid.`);
      }
      if (record.quantity !== undefined && (!Number.isInteger(record.quantity) || Number(record.quantity) < 1 || Number(record.quantity) > 12)) {
        fatal_errors.push(`asset_intents[${index}].quantity must be an integer from 1 to 12.`);
      }
    });
  }

  if (stage >= 3) {
    if (!nonEmptyString(output.target_takeaway)) fatal_errors.push("target_takeaway is required.");
    const relationships = Array.isArray(output.relationships) ? output.relationships : [];
    if (relationships.length === 0) fatal_errors.push("relationships must contain at least one item.");
    const conceptNames = new Set(
      (Array.isArray(output.asset_intents) ? output.asset_intents : [])
        .map((intent) => asRecord(intent)?.concept)
        .filter((name): name is string => nonEmptyString(name))
        .map((name) => name.trim().toLowerCase()),
    );
    relationships.forEach((relationship, index) => {
      const record = asRecord(relationship);
      const source = String(record?.source_concept ?? record?.source_semantic_name ?? "").trim();
      const target = String(record?.target_concept ?? record?.target_semantic_name ?? "").trim();
      if (!record || !source || !nonEmptyString(record.relationship) || !target || !nonEmptyString(record.learning_reason)) {
        fatal_errors.push(`relationships[${index}] is incomplete.`);
        return;
      }
      if (!conceptNames.has(source.toLowerCase()) || !conceptNames.has(target.toLowerCase())) {
        fatal_errors.push(`relationships[${index}] must reference asset_intents by concept.`);
      }
    });
  }

  // Preserve the historical contract wording for legacy Stage 2/3 diagnostics.
  if (Array.isArray(output.required_visual_concepts)) {
    const legacyNames = new Set(
      output.required_visual_concepts
        .map((concept) => asRecord(concept)?.semantic_name)
        .filter((name): name is string => nonEmptyString(name))
        .map((name) => name.trim().toLowerCase()),
    );
    for (const relationship of Array.isArray(output.relationships) ? output.relationships : []) {
      const record = asRecord(relationship);
      const source = String(record?.source_semantic_name ?? "").trim().toLowerCase();
      const target = String(record?.target_semantic_name ?? "").trim().toLowerCase();
      if ((source && !legacyNames.has(source)) || (target && !legacyNames.has(target))) {
        fatal_errors.push("relationships must reference required_visual_concepts by semantic_name.");
        break;
      }
    }
  }

  return { valid: fatal_errors.length === 0, fatal_errors };
}

export function visualConceptSemanticNames(value: unknown) {
  const output = asRecord(value);
  if (!output) return [];
  if (Array.isArray(output.asset_intents)) {
    return output.asset_intents
      .map((intent) => asRecord(intent)?.concept)
      .filter((name): name is string => nonEmptyString(name));
  }
  if (!Array.isArray(output.required_visual_concepts)) return [];
  return output.required_visual_concepts
    .map((concept) => asRecord(concept)?.semantic_name)
    .filter((name): name is string => nonEmptyString(name));
}
