import type {
  AnswerKey,
  ConfidenceScore,
  MisconceptionMarker,
  PresentationSupport,
  ProbeAttemptType,
  ProbeDeliveryContext,
  ProbePrompt,
  ProbeType,
  RendererParams,
} from "../schemas";

export type EngineRendererKind = ProbeType;

export type RendererCompatibilityReport = {
  renderer_kind: EngineRendererKind;
  is_renderable: boolean;
  blocking_reasons: string[];
  warnings: string[];
};

export type EngineRenderableProbe = {
  schema_version: "engine_renderable_probe_v1";

  probe_type: ProbeType;
  expected_attempt_type: ProbeAttemptType;

  prompt: ProbePrompt;

  presentation_support?: PresentationSupport[];

  answer_key?: AnswerKey | null;

  misconception_markers: MisconceptionMarker[];

  renderer_params?: RendererParams | null;

  delivery_context?: ProbeDeliveryContext | null;

  confidence: ConfidenceScore;

  renderer_compatibility: RendererCompatibilityReport;
};

export type ProbeRendererAdapterResult = {
  ok: boolean;
  renderable_probe: EngineRenderableProbe | null;
  warnings: string[];
  blocking_reasons: string[];
};


