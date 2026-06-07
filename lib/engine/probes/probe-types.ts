import type {
  DiagnosisDelta,
  DiagnosisType,
  EntityId,
  ISO8601String,
  ProbeExpectedResponseType,
  ProbeIntent,
  ProbeType,
} from "@/types/contracts";
import type { DiagnosisState } from "@/lib/engine/diagnosis";
import type { EvidenceJudgingTier, JudgingMethod } from "@/lib/engine/judging";

/**
 * Probe Contract V1.1
 *
 * A probe is a measurement contract:
 * - what it is testing
 * - how it should render
 * - what response it expects
 * - what success/failure means
 * - how evidence maps back to diagnosis updates
 *
 * V1.1 keeps the existing contract shape but adds room for:
 * - deterministic judging
 * - rubric/model judging later
 * - personalization-safe rendering
 * - content-grounded probe generation
 * - explicit answer-capture hints
 */

export const PROBE_CONTRACT_VERSION = "probe_contract_v1_1" as const;

export type ProbeContractVersion = typeof PROBE_CONTRACT_VERSION;

export type ProbeRendererKind =
  | "text_explanation"
  | "multiple_choice"
  | "ordering"
  | "slider_prediction"
  | "drag_drop_match"
  | "graph_match"
  | "simulation"
  | "audio_explanation"
  | "video_checkpoint";

export type ProbeAssessmentTarget =
  | "recall"
  | "representation"
  | "procedure"
  | "discrimination"
  | "transfer"
  | "metacognition";

export type ProbeDifficulty = "easy" | "medium" | "hard" | "adaptive";

export type ProbeGenerationMode =
  | "generic_scaffold"
  | "content_grounded"
  | "retrieval_grounded"
  | "user_uploaded_content_grounded"
  | "manual"
  | "unknown";

export type ProbePersonalizationMode =
  | "none"
  | "light"
  | "moderate"
  | "strong";

export type ProbeScaffoldLevel = "none" | "low" | "medium" | "high";

export type ProbeTelemetryKey =
  | "latency_ms"
  | "revision_count"
  | "hint_usage"
  | "choice_selected"
  | "ordering_sequence"
  | "drag_drop_positions"
  | "slider_value"
  | "graph_selection"
  | "simulation_actions"
  | "audio_duration_ms"
  | "video_checkpoint_time"
  | "retry_count"
  | "confidence_rating";

export type ProbeSuccessMarker = {
  marker_id: EntityId;
  label: string;
  description: string;
  required: boolean;
  weight: number;
};

export type ProbeFailureMarker = {
  marker_id: EntityId;
  label: string;
  description: string;
  maps_to_diagnosis: DiagnosisType;
  diagnosis_delta: DiagnosisDelta;
  severity: number;
};

export type ProbeMisconceptionMapping = {
  misconception_id: EntityId;
  label: string;
  description: string;
  likely_diagnosis: DiagnosisType;
  failure_marker_ids: EntityId[];
};

export type ProbeInputSchemaBase = {
  renderer_kind: ProbeRendererKind;
  expected_response_type: ProbeExpectedResponseType;
  required: boolean;

  /**
   * V1.1.
   *
   * Names the normalized evidence shape that the submit route / evidence
   * normalizer should produce.
   */
  normalized_value_kind?:
    | "text"
    | "choice"
    | "ordering"
    | "slider"
    | "drag_drop"
    | "graph_match"
    | "classification"
    | "interaction"
    | "structured";

  /**
   * V1.1.
   *
   * Helps renderer and submit code capture the exact fields deterministic
   * judges expect.
   */
  answer_capture_keys?: string[];
};

export type TextExplanationInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "text_explanation";
  normalized_value_kind?: "text";
  min_words: number;
  max_words: number;
  require_example: boolean;
};

export type MultipleChoiceOption = {
  option_id: EntityId;
  label: string;
  text: string;
  is_correct: boolean;
  maps_to_misconception_id: EntityId | null;
};

export type MultipleChoiceInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "multiple_choice";
  normalized_value_kind?: "choice";
  options: MultipleChoiceOption[];
  allow_multiple: boolean;
};

export type OrderingInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "ordering";
  normalized_value_kind?: "ordering";
  items: Array<{
    item_id: EntityId;
    label: string;
    text: string;
    correct_position: number;
  }>;
};

export type SliderPredictionInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "slider_prediction";
  normalized_value_kind?: "slider";
  min: number;
  max: number;
  step: number;
  target_value: number | null;
  acceptable_range: [number, number] | null;
  left_label: string;
  right_label: string;
};

export type DragDropMatchInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "drag_drop_match";
  normalized_value_kind?: "drag_drop";
  draggable_items: Array<{
    item_id: EntityId;
    label: string;
    text: string;
  }>;
  drop_targets: Array<{
    target_id: EntityId;
    label: string;
    text: string;
  }>;
  correct_matches: Array<{
    item_id: EntityId;
    target_id: EntityId;
  }>;
};

export type GraphMatchInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "graph_match";
  normalized_value_kind?: "graph_match";
  graph_prompt: string;
  nodes: Array<{
    node_id: EntityId;
    label: string;
  }>;
  candidate_edges: Array<{
    edge_id: EntityId;
    source_node_id: EntityId;
    target_node_id: EntityId;
    label: string;
    is_correct: boolean;
  }>;
};

export type SimulationInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "simulation";
  normalized_value_kind?: "interaction";
  simulation_kind: string;
  initial_state: Record<string, unknown>;
  controllable_variables: Array<{
    variable_id: EntityId;
    label: string;
    value_type: "number" | "boolean" | "choice";
    allowed_values: unknown[] | null;
  }>;
  target_observations: string[];
};

export type AudioExplanationInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "audio_explanation";
  normalized_value_kind?: "text";
  min_duration_ms: number;
  max_duration_ms: number;
  transcript_required: boolean;
};

export type VideoCheckpointInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "video_checkpoint";
  normalized_value_kind?: "text";
  checkpoint_time_ms: number | null;
  prompt_at_checkpoint: string;
  expected_observation: string;
};

export type ProbeInputSchema =
  | TextExplanationInputSchema
  | MultipleChoiceInputSchema
  | OrderingInputSchema
  | SliderPredictionInputSchema
  | DragDropMatchInputSchema
  | GraphMatchInputSchema
  | SimulationInputSchema
  | AudioExplanationInputSchema
  | VideoCheckpointInputSchema;

export type ProbeJudgingSchema = {
  success_markers: ProbeSuccessMarker[];
  failure_markers: ProbeFailureMarker[];
  misconception_mappings: ProbeMisconceptionMapping[];
  telemetry_to_capture: ProbeTelemetryKey[];
  allow_partial_credit: boolean;
  minimum_evidence_strength_for_success: number;

  /**
   * V1.1.
   *
   * What judging methods are expected to be useful for this probe.
   */
  expected_judging_methods?: JudgingMethod[];

  /**
   * V1.1.
   *
   * Best expected evidence tier if the probe is rendered and submitted as
   * planned. This lets downstream systems know whether the probe can produce
   * deterministic correctness evidence or only softer rubric evidence.
   */
  expected_evidence_tier?: EvidenceJudgingTier;

  /**
   * V1.1.
   *
   * Whether the structured answer can be judged by code without semantic model
   * interpretation.
   */
  deterministic_judging_available?: boolean;

  /**
   * V1.1.
   *
   * Whether open-ended rubric/model judging is expected to be needed.
   */
  rubric_judging_required?: boolean;
};

export type ProbeRendererConfig = {
  renderer_kind: ProbeRendererKind;
  title: string;
  instructions: string;
  prompt: string;
  thumbnail_label: string;
  thumbnail_icon: string;
  estimated_seconds: number | null;
  ui_hints: {
    compact: boolean;
    show_confidence_rating: boolean;
    allow_hint: boolean;
    allow_retry: boolean;

    /**
     * V1.1 optional renderer hints.
     */
    scaffold_level?: ProbeScaffoldLevel;
    show_explanation_box?: boolean;
    require_reasoning_after_structured_answer?: boolean;
  };
};

export type ProbePersonalizationApplication = {
  mode: ProbePersonalizationMode;
  tone: "neutral" | "encouraging" | "challenging" | "calm" | null;
  pacing: "slow" | "normal" | "fast" | null;
  language_style: "plain" | "technical" | "metaphorical" | null;
  scaffold_level: ProbeScaffoldLevel;
  preferred_modality_reason: string | null;
  example_context: string | null;
  adaptation_reasons: string[];
};

export type ProbeGenerationMetadata = {
  generation_mode: ProbeGenerationMode;
  source_content_ids: EntityId[];
  source_topic_ids: EntityId[];
  generated_by: "engine_scaffold" | "llm" | "manual" | "unknown";
  generator_version: string | null;
  content_grounding_summary: string | null;
};

export type ProbeContract = {
  contract_id: EntityId;
  version: ProbeContractVersion;
  created_at: ISO8601String;

  target_topic_id: EntityId | null;
  target_topic_label: string;
  target_diagnosis: DiagnosisType | null;

  intent: ProbeIntent;
  probe_type: ProbeType;
  renderer_kind: ProbeRendererKind;
  assessment_target: ProbeAssessmentTarget;
  difficulty: ProbeDifficulty;

  input_schema: ProbeInputSchema;
  judging_schema: ProbeJudgingSchema;
  renderer_config: ProbeRendererConfig;

  /**
   * V1.1 optional metadata. These fields let the engine distinguish generic
   * scaffold probes from content-grounded personalized probes without changing
   * the core measurement contract.
   */
  generation_metadata?: ProbeGenerationMetadata;
  personalization_application?: ProbePersonalizationApplication | null;

  diagnosis_state_snapshot: DiagnosisState | null;

  reasons: string[];
  cautions: string[];
};

export type BuildProbeContractInput = {
  targetTopicId?: EntityId | null;
  targetTopicLabel: string;
  targetDiagnosis?: DiagnosisType | null;
  intent?: ProbeIntent | null;
  probeType?: ProbeType | null;
  rendererKind?: ProbeRendererKind | null;
  expectedResponseType?: ProbeExpectedResponseType | null;
  diagnosisState?: DiagnosisState | null;
  createdAt?: ISO8601String | null;

  /**
   * V1.1 optional construction metadata.
   */
  generationMode?: ProbeGenerationMode | null;
  sourceContentIds?: EntityId[] | null;
  sourceTopicIds?: EntityId[] | null;
  personalization?: Partial<ProbePersonalizationApplication> | null;
};

export type BuildProbeContractResult = {
  contract: ProbeContract;
  selected_renderer_kind: ProbeRendererKind;
  reasons: string[];
};
