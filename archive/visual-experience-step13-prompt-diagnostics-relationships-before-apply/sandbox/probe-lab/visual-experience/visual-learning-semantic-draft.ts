import type {
  ConfidenceScore,
  DiagnosisLabel,
  PersonalizationSignalDirection,
  PersonalizationSignalKind,
  PersonalizationSignalScope,
  ProbeType,
} from "@/lib/engine/schemas/shared";
import type {
  VisualExperienceMode,
  VisualPrimitiveKind,
  VisualSceneActionType,
} from "./visual-learning-turn";

export type VisualLearningSemanticDraft = {
  schema_version: "myway_visual_learning_semantic_draft_v1";
  turn_status: "proceed" | "needs_clarification";
  clarification?: {
    question?: string | null;
    reason?: string | null;
    confidence?: {
      overall?: ConfidenceScore | null;
      topic?: ConfidenceScore | null;
      learner_goal?: ConfidenceScore | null;
    } | null;
  } | null;
  topic?: {
    label?: string | null;
    confidence?: ConfidenceScore | null;
    reason?: string | null;
  } | null;
  diagnosis?: {
    label?: DiagnosisLabel | string | null;
    confidence?: ConfidenceScore | null;
    reason?: string | null;
  } | null;
  learning_focus?: {
    root_problem?: string | null;
    target_takeaway?: string | null;
    why_visual_first?: string | null;
  } | null;
  orientation_segments?: VisualLearningSemanticDraftOrientationSegment[];
  personalization_decision?: VisualLearningSemanticDraftPersonalizationDecision | null;
  directed_scene?: VisualLearningDirectedScene | null;
  scene?: VisualLearningSemanticDraftScene | null;
  guided_interaction?: {
    instruction?: string | null;
    required_action_type?: string | null;
    target_entity_ids?: string[];
    success_observation?: string | null;
  } | null;
  probe?: VisualLearningSemanticDraftProbe | null;
  personalization_hypotheses?: VisualLearningSemanticDraftPersonalizationHypothesis[];
  confidence?:
    | ConfidenceScore
    | {
        overall?: ConfidenceScore | null;
        scene?: ConfidenceScore | null;
        probe?: ConfidenceScore | null;
      }
    | null;
};

export type VisualLearningSemanticDraftOrientationSegment = {
  id?: string | null;
  text?: string | null;
  purpose?: string | null;
};

export type VisualLearningSemanticDraftPersonalizationDecision = {
  chosen_interest?: string | null;
  use_interest?: "structural_bridge" | "light_tone" | "do_not_use" | string | null;
  reason?: string | null;
  structural_mapping?: string | null;
  anti_distortion_guard?: string | null;
};

export type VisualLearningSemanticDraftScene = {
  title?: string | null;
  /** Compatibility layout hint. directed_scene is the richer source of visual direction. */
  experience_mode?: VisualExperienceMode | string | null;
  directed_scene?: VisualLearningDirectedScene | null;
  story_beats?: VisualLearningDirectedStoryBeat[];
  caption_policy?: Record<string, unknown> | null;
  label_policy?: Record<string, unknown> | null;
  entities?: VisualLearningSemanticDraftEntity[];
  relationships?: VisualLearningSemanticDraftRelationship[];
  beats?: VisualLearningSemanticDraftBeat[];
  camera_notes?: string | null;
  interaction_notes?: string | null;
};

export type VisualLearningDirectedScene = {
  scene_concept?: string | null;
  visual_metaphor?: string | null;
  emotional_tone?: string | null;
  spatial_design?: string | null;
  cinematography?: Record<string, unknown> | null;
  caption_policy?: Record<string, unknown> | null;
  label_policy?: Record<string, unknown> | null;
  renderer_directive?: string | null;
  [key: string]: unknown;
};

export type VisualLearningDirectedStoryBeat = {
  id?: string | null;
  title?: string | null;
  director_intent?: string | null;
  camera?: Record<string, unknown> | null;
  visual_events?: Array<Record<string, unknown>>;
  spoken_caption?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type VisualLearningSemanticDraftEntity = {
  id?: string | null;
  display_name?: string | null;
  semantic_role?: string | null;
  visual_need?:
    | string
    | {
        description?: string | null;
        semantic_tags?: string[];
        preferred_render_kind?: VisualPrimitiveKind | "registered_asset" | "any" | string | null;
      }
    | null;
  semantic_tags?: string[];
  preferred_render_kind?: VisualPrimitiveKind | "registered_asset" | "any" | string | null;
};

export type VisualLearningSemanticDraftRelationship = {
  id?: string | null;
  source_entity_id?: string | null;
  target_entity_ids?: string[];
  relationship_type?: string | null;
  explanation?: string | null;
};

export type VisualLearningSemanticDraftBeat = {
  id?: string | null;
  title?: string | null;
  source_orientation_segment_ids?: string[];
  active_entity_ids?: string[];
  actions?: VisualLearningSemanticDraftAction[];
};

export type VisualLearningSemanticDraftAction = {
  type?: VisualSceneActionType | string | null;
  target_entity_id?: string | null;
  narration?: string | null;
  params?: Record<string, unknown> | null;
};

export type VisualLearningSemanticDraftProbe = {
  probe_type?: ProbeType | string | null;
  question?: string | null;
  options?: Array<{ id?: string | null; text?: string | null; label?: string | null }>;
  correct_option_id?: string | null;
  correct_option_ids?: string[];
  expected_ideas?: string[];
  misconception_markers?: Array<{
    misconception_id?: string | null;
    label?: string | null;
    description?: string | null;
  }>;
  what_it_measures?: string | null;
};

export type VisualLearningSemanticDraftPersonalizationHypothesis = {
  kind?: PersonalizationSignalKind | string | null;
  value?: string | null;
  direction?: PersonalizationSignalDirection | string | null;
  scope?: PersonalizationSignalScope | string | null;
  scope_key?: string | null;
  confidence?: ConfidenceScore | null;
  reason?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isVisualLearningSemanticDraftLike(value: unknown): value is VisualLearningSemanticDraft {
  const record = asRecord(value);
  if (!record) return false;

  if (record.schema_version === "myway_visual_learning_semantic_draft_v1") return true;

  // Do not treat the final strict MyWay output as a semantic draft.
  if (record.schema_version === "myway_visual_learning_turn_output_v1") return false;

  // Near-miss semantic drafts usually have scene/probe rather than visual_experience/followup_probe.
  return Boolean(record.scene || record.probe || record.orientation_segments || record.learning_focus);
}
