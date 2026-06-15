import type {
  EngineRenderableProbe,
  ProbeAttemptType,
  ProbeType,
  RendererParams,
} from "@/lib/engine";

export type ProbeAnswerDraft = {
  attempt_type: ProbeAttemptType;
  text_response?: string | null;
  selected_option_id?: string | null;
  selected_option_ids?: string[];
  ordered_item_ids?: string[];
  placements?: Record<string, string>;
  numeric_response?: number | null;
  graph_features?: string[];
  audio_response_transcript?: string | null;
  selected_click_seconds?: number | null;
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
    audio_response_transcript: "",
    selected_click_seconds: null,
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

