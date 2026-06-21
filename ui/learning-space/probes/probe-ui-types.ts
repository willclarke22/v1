import type {
  EngineRenderableProbe,
  ProbeAttemptType,
  ProbeType,
  RendererParams,
} from "@/lib/engine";

export type ProbeGraphModeDraft = "2d" | "3d";

export type ProbeGraphFunctionDraft = {
  id: string;
  label?: string;
  expression: string;
  enabled?: boolean;
};

export type ProbeGraphParameterDraft = {
  name: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
};

export type ProbeGraphWindowDraft = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type ProbeGraphWindow3DDraft = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
};

export type ProbeGraphView3DDraft = {
  yaw: number;
  pitch: number;
  zoom: number;
};

export type ProbeGraphPointDraft = {
  x: number;
  y: number;
  expression?: string | null;
};

export type ProbeGraphPoint3DDraft = {
  x: number;
  y: number;
  z: number;
  expression?: string | null;
};

export type ProbeAnswerDraft = {
  attempt_type: ProbeAttemptType;
  text_response?: string | null;
  selected_option_id?: string | null;
  selected_option_ids?: string[];
  ordered_item_ids?: string[];
  placements?: Record<string, string>;
  numeric_response?: number | null;
  graph_features?: string[];
  graph_mode?: ProbeGraphModeDraft;
  graph_functions?: ProbeGraphFunctionDraft[];
  graph_parameters?: ProbeGraphParameterDraft[];
  graph_window?: ProbeGraphWindowDraft;
  graph_3d_window?: ProbeGraphWindow3DDraft;
  graph_3d_view?: ProbeGraphView3DDraft;
  graph_surface_expression?: string | null;
  graph_selected_point?: ProbeGraphPointDraft | null;
  graph_selected_point_3d?: ProbeGraphPoint3DDraft | null;
  graph_notes?: string | null;
  audio_response_transcript?: string | null;
  audio_recording_url?: string | null;
  audio_recording_duration_seconds?: number | null;
  audio_recording_mime_type?: string | null;
  audio_recording_size_bytes?: number | null;
  selected_click_seconds?: number | null;
  selected_click_label?: string | null;
  self_reported_confidence?: number | null;
};

export type ProbeRendererSubmitPayload = {
  probe: EngineRenderableProbe;
  attempt: ProbeAnswerDraft;
};

export type GenericProbeComponentProps = {
  probe: EngineRenderableProbe;
  draft: ProbeAnswerDraft;
  disabled?: boolean;
  showDebug?: boolean;
  onDraftChange: (nextDraft: ProbeAnswerDraft) => void;
  onSubmit?: (payload: ProbeRendererSubmitPayload) => void;
};

export type ProbeOption = NonNullable<RendererParams["options"]>[number];
export type ProbeItem = NonNullable<RendererParams["items"]>[number];
export type ProbePlacementTarget =
  NonNullable<RendererParams["placement_targets"]>[number];

export function createEmptyProbeAnswerDraft(
  attemptType: ProbeAttemptType,
): ProbeAnswerDraft {
  return {
    attempt_type: attemptType,
    text_response: "",
    selected_option_id: null,
    selected_option_ids: [],
    ordered_item_ids: [],
    placements: {},
    numeric_response: null,
    graph_features: [],
    graph_mode: "2d",
    graph_functions: [],
    graph_parameters: [],
    graph_window: undefined,
    graph_3d_window: undefined,
    graph_3d_view: undefined,
    graph_surface_expression: "",
    graph_selected_point: null,
    graph_selected_point_3d: null,
    graph_notes: "",
    audio_response_transcript: "",
    audio_recording_url: null,
    audio_recording_duration_seconds: null,
    audio_recording_mime_type: null,
    audio_recording_size_bytes: null,
    selected_click_seconds: null,
    selected_click_label: null,
    self_reported_confidence: null,
  };
}

export function getProbeOptions(probe: EngineRenderableProbe): ProbeOption[] {
  return probe.renderer_params?.options ?? [];
}

export function getProbeItems(probe: EngineRenderableProbe): ProbeItem[] {
  return probe.renderer_params?.items ?? [];
}

export function getProbePlacementTargets(
  probe: EngineRenderableProbe,
): ProbePlacementTarget[] {
  return probe.renderer_params?.placement_targets ?? [];
}

export function getProbeTypeLabel(probeType: ProbeType): string {
  return probeType.replaceAll("_", " ");
}

export function submitProbe(
  props: GenericProbeComponentProps,
  draft: ProbeAnswerDraft,
): void {
  props.onSubmit?.({
    probe: props.probe,
    attempt: draft,
  });
}
