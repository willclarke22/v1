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

/**
 * Probe Contract V1
 *
 * A probe is a measurement contract:
 * - what it is testing
 * - how it should render
 * - what response it expects
 * - what success/failure means
 * - how evidence maps back to diagnosis updates
 */

export const PROBE_CONTRACT_VERSION = "probe_contract_v1" as const;

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
};

export type TextExplanationInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "text_explanation";
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
  options: MultipleChoiceOption[];
  allow_multiple: boolean;
};

export type OrderingInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "ordering";
  items: Array<{
    item_id: EntityId;
    label: string;
    text: string;
    correct_position: number;
  }>;
};

export type SliderPredictionInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "slider_prediction";
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
  min_duration_ms: number;
  max_duration_ms: number;
  transcript_required: boolean;
};

export type VideoCheckpointInputSchema = ProbeInputSchemaBase & {
  renderer_kind: "video_checkpoint";
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
  };
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
};

export type BuildProbeContractResult = {
  contract: ProbeContract;
  selected_renderer_kind: ProbeRendererKind;
  reasons: string[];
};
