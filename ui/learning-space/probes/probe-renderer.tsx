"use client";

import { useMemo, useState } from "react";
import type { EngineRenderableProbe } from "@/lib/engine";
import { AudioClipProbe } from "./audio-clip-probe";
import { AudioResponseProbe } from "./audio-response-probe";
import { DragDropProbe } from "./drag-drop-probe";
import { GraphProbe } from "./graph-probe";
import { GeneratedVideoProbe, hasGeneratedAnimationContract } from "./sandbox/generated-video";
import { MultiChoiceProbe } from "./multi-choice-probe";
import type {
  ProbeAnswerDraft,
  ProbeRendererSubmitPayload,
} from "./probe-ui-types";
import { createEmptyProbeAnswerDraft } from "./probe-ui-types";
import { SequenceProbe } from "./sequence-probe";
import { SingleChoiceProbe } from "./single-choice-probe";
import { SliderProbe } from "./slider-probe";
import { TextProbe } from "./text-probe";
import { VideoClickProbe } from "./video-click-probe";
import { VideoExplanationProbe } from "./video-explanation-probe";
import { VisualStoryProbe, hasVisualStoryContract } from "./sandbox/visual-story-probe";

export type ProbeRendererProps = {
  probe: EngineRenderableProbe;
  disabled?: boolean;
  showDebug?: boolean;
  initialDraft?: ProbeAnswerDraft;
  onDraftChange?: (draft: ProbeAnswerDraft) => void;
  onSubmit?: (payload: ProbeRendererSubmitPayload) => void;
};

export function ProbeRenderer(props: ProbeRendererProps) {
  const initialDraft = useMemo(
    () =>
      props.initialDraft ??
      createEmptyProbeAnswerDraft(props.probe.expected_attempt_type),
    [props.initialDraft, props.probe.expected_attempt_type],
  );

  const [draft, setDraft] = useState<ProbeAnswerDraft>(initialDraft);

  function updateDraft(nextDraft: ProbeAnswerDraft) {
    setDraft(nextDraft);
    props.onDraftChange?.(nextDraft);
  }

  const sharedProps = {
    probe: props.probe,
    draft,
    disabled: props.disabled,
    showDebug: props.showDebug,
    onDraftChange: updateDraft,
    onSubmit: props.onSubmit,
  };

  switch (props.probe.probe_type) {
    case "single_choice":
      return <SingleChoiceProbe {...sharedProps} />;

    case "multi_choice":
      return <MultiChoiceProbe {...sharedProps} />;

    case "drag_drop_placements":
      return <DragDropProbe {...sharedProps} />;

    case "sequence":
      return <SequenceProbe {...sharedProps} />;

    case "slider":
      return <SliderProbe {...sharedProps} />;

    case "graph_relationship":
      if (hasVisualStoryContract(props.probe)) {
        return <VisualStoryProbe {...sharedProps} />;
      }
      return <GraphProbe {...sharedProps} />;

    case "audio_clip_question":
      return <AudioClipProbe {...sharedProps} />;

    case "audio_response_question":
      return <AudioResponseProbe {...sharedProps} />;

    case "video_click_interval":
      return <VideoClickProbe {...sharedProps} />;

    case "video_explanation":
      if (hasVisualStoryContract(props.probe)) {
        return <VisualStoryProbe {...sharedProps} />;
      }
      if (hasGeneratedAnimationContract(props.probe)) {
        return <GeneratedVideoProbe {...sharedProps} />;
      }
      return <VideoExplanationProbe {...sharedProps} />;

    case "discriminate":
      if (props.probe.expected_attempt_type === "single_choice") {
        return <SingleChoiceProbe {...sharedProps} />;
      }
      return <TextProbe {...sharedProps} />;

    case "explain":
    case "apply_transfer":
    case "predict":
      if (props.probe.expected_attempt_type === "single_choice") {
        return <SingleChoiceProbe {...sharedProps} />;
      }
      if (props.probe.expected_attempt_type === "numeric") {
        return <SliderProbe {...sharedProps} />;
      }
      return <TextProbe {...sharedProps} />;

    default:
      return <TextProbe {...sharedProps} />;
  }
}
