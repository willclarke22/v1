"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  EngineRenderableProbe,
  ProbeAttemptType,
  ProbeType,
} from "@/lib/engine";
import type { ProbeContractSnapshot } from "@/types/contracts";
import {
  ProbeRenderer,
  type ProbeAnswerDraft,
  type ProbeRendererSubmitPayload,
} from "./index";

export type ProbeSummary = {
  id: string;
  topicId: string;
  topicLabel?: string;
  title: string;
  instruction: string;
  status: "available" | "active" | "completed";
  intent?: string | null;
  probeType?: string | null;
  expectedResponseType?: string | null;
  helperText?: string | null;

  /**
   * Exact contract snapshot attached to the delivered probe. This must be sent
   * back with the submitted attempt so backend judging evaluates the probe the
   * learner actually answered.
   */
  probeContractSnapshot?: ProbeContractSnapshot | null;

  /**
   * Engine-native renderable probe carried from the delivered probe contract.
   * Prefer this when present so the UI does not have to reconstruct the engine
   * contract from the older ProbeContractSnapshot shape.
   */
  engineRenderableProbe?: EngineRenderableProbe | null;
};

type ProbeSurfaceProps = {
  probe: ProbeSummary | null;
  probeFeedback?: {
    reply: string;
    suggestedAction: string;
  } | null;
  isSubmitting?: boolean;
  onExit: () => void;
  onSubmit: (payload: {
    probeId: string;
    topicId: string;
    response: string;
    attempt?: ProbeAnswerDraft;
    engineRenderableProbe?: EngineRenderableProbe | null;
    probeContractSnapshot?: ProbeContractSnapshot | null;
  }) => void;
};

const PROBE_TYPES: ProbeType[] = [
  "explain",
  "discriminate",
  "apply_transfer",
  "sequence",
  "single_choice",
  "multi_choice",
  "drag_drop_placements",
  "predict",
  "slider",
  "graph_relationship",
  "audio_clip_question",
  "audio_response_question",
  "video_click_interval",
  "video_explanation",
];

const PROBE_ATTEMPT_TYPES: ProbeAttemptType[] = [
  "text",
  "single_choice",
  "multi_choice",
  "ordered_items",
  "drag_drop_placements",
  "numeric",
  "graph",
  "audio_response",
  "video_click",
  "none",
  "unknown",
];

function getProbeStatusLabel(status: ProbeSummary["status"]) {
  if (status === "active") return "In progress";
  if (status === "completed") return "Completed";
  return "Ready";
}

function formatBadgeLabel(value?: string | null) {
  if (!value) return null;
  return value.replaceAll("_", " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function isProbeType(value: unknown): value is ProbeType {
  return typeof value === "string" && PROBE_TYPES.includes(value as ProbeType);
}

function isProbeAttemptType(value: unknown): value is ProbeAttemptType {
  return (
    typeof value === "string" &&
    PROBE_ATTEMPT_TYPES.includes(value as ProbeAttemptType)
  );
}

function normalizeProbeType(value: unknown): ProbeType {
  if (isProbeType(value)) return value;

  if (value === "transform") return "sequence";
  if (value === "diagnostic") return "explain";
  if (value === "multiple_choice") return "multi_choice";
  if (value === "interactive_action") return "drag_drop_placements";
  if (value === "audio") return "audio_response_question";
  if (value === "video") return "video_explanation";

  return "explain";
}

function normalizeAttemptType(
  value: unknown,
  probeType: ProbeType,
): ProbeAttemptType {
  if (isProbeAttemptType(value)) return value;

  if (value === "multiple_choice") return "multi_choice";
  if (value === "interactive_action") return "drag_drop_placements";
  if (value === "audio") return "audio_response";
  if (value === "video") return "none";

  if (probeType === "single_choice" || probeType === "discriminate") {
    return "single_choice";
  }

  if (probeType === "multi_choice") return "multi_choice";
  if (probeType === "drag_drop_placements") return "drag_drop_placements";
  if (probeType === "sequence") return "ordered_items";
  if (probeType === "slider") return "numeric";
  if (probeType === "graph_relationship") return "graph";
  if (probeType === "audio_response_question") return "audio_response";
  if (probeType === "video_click_interval") return "video_click";
  if (probeType === "video_explanation") return "none";

  return "text";
}

function getSnapshotProbeType(snapshot: unknown): ProbeType | null {
  if (!isRecord(snapshot)) return null;

  if (isProbeType(snapshot.probe_type)) return snapshot.probe_type;
  if (isProbeType(snapshot.probeType)) return snapshot.probeType;

  return null;
}

function getSnapshotAttemptType(snapshot: unknown): ProbeAttemptType | null {
  if (!isRecord(snapshot)) return null;

  if (isProbeAttemptType(snapshot.expected_attempt_type)) {
    return snapshot.expected_attempt_type;
  }

  if (isProbeAttemptType(snapshot.expectedAttemptType)) {
    return snapshot.expectedAttemptType;
  }

  return null;
}

function getSnapshotRendererParams(snapshot: unknown) {
  if (!isRecord(snapshot)) return null;

  const rendererParams = snapshot.renderer_params ?? snapshot.rendererParams;

  return isRecord(rendererParams) ? rendererParams : null;
}

function getSnapshotAnswerKey(snapshot: unknown) {
  if (!isRecord(snapshot)) return null;

  const answerKey = snapshot.answer_key ?? snapshot.answerKey;

  return isRecord(answerKey) ? answerKey : null;
}

function getSnapshotMisconceptionMarkers(snapshot: unknown) {
  if (!isRecord(snapshot)) return [];

  const markers = snapshot.misconception_markers ?? snapshot.misconceptionMarkers;

  return Array.isArray(markers) ? markers : [];
}

function buildPrompt(args: {
  probe: ProbeSummary;
  snapshot: unknown;
}) {
  if (isRecord(args.snapshot) && isRecord(args.snapshot.prompt)) {
    const prompt = args.snapshot.prompt;

    const task = getString(prompt.task);
    const fullPrompt = getString(prompt.full_prompt) ?? getString(prompt.fullPrompt);

    if (task && fullPrompt) {
      return {
        root_problem_explanation:
          getString(prompt.root_problem_explanation) ??
          getString(prompt.rootProblemExplanation) ??
          "MyWay is checking the specific part of the idea that may need repair.",
        reshaping_explanation:
          getString(prompt.reshaping_explanation) ??
          getString(prompt.reshapingExplanation) ??
          "Use the probe to make your current understanding visible.",
        task,
        full_prompt: fullPrompt,
      };
    }
  }

  return {
    root_problem_explanation:
      "MyWay is checking the specific part of this topic that may need repair.",
    reshaping_explanation:
      "Answer in the way that best shows what makes sense to you right now.",
    task: args.probe.instruction,
    full_prompt: args.probe.instruction,
  };
}

function buildRenderableProbe(probe: ProbeSummary): EngineRenderableProbe {
  if (probe.engineRenderableProbe) {
    return probe.engineRenderableProbe;
  }

  const snapshot = probe.probeContractSnapshot ?? null;

  const probeType =
    getSnapshotProbeType(snapshot) ??
    normalizeProbeType(probe.probeType ?? probe.expectedResponseType);

  const expectedAttemptType =
    getSnapshotAttemptType(snapshot) ??
    normalizeAttemptType(probe.expectedResponseType, probeType);

  const rendererParams = getSnapshotRendererParams(snapshot);
  const answerKey = getSnapshotAnswerKey(snapshot);
  const misconceptionMarkers = getSnapshotMisconceptionMarkers(snapshot);

  return {
    schema_version: "engine_renderable_probe_v1",
    probe_type: probeType,
    expected_attempt_type: expectedAttemptType,
    prompt: buildPrompt({ probe, snapshot }),
    presentation_support: undefined,
    answer_key: answerKey as EngineRenderableProbe["answer_key"],
    misconception_markers:
      misconceptionMarkers as EngineRenderableProbe["misconception_markers"],
    renderer_params: rendererParams as EngineRenderableProbe["renderer_params"],
    delivery_context: null,
    confidence: 0.5,
    renderer_compatibility: {
      renderer_kind: probeType,
      is_renderable: true,
      blocking_reasons: [],
      warnings: rendererParams
        ? []
        : [
            "ProbeSurface used a generic fallback renderer because no renderer_params were supplied.",
          ],
    },
  };
}

function getInstructionHint(probe: ProbeSummary | null) {
  if (!probe) return "";

  if (probe.helperText?.trim()) {
    return probe.helperText;
  }

  const lower = probe.instruction.toLowerCase();

  if (
    lower.includes("apply") ||
    lower.includes("different situation") ||
    lower.includes("what changes")
  ) {
    return "Try to show what carries over and what changes in the new setting.";
  }

  if (lower.includes("predict") || lower.includes("what happens next")) {
    return "Focus on what you think will happen and why.";
  }

  if (
    lower.includes("example") ||
    lower.includes("concrete") ||
    lower.includes("cause-and-effect")
  ) {
    return "Use a concrete example or a step-by-step chain if that helps.";
  }

  return "Answer in your own words. Aim for reasoning, not just keywords.";
}

function stringifyAttempt(attempt: ProbeAnswerDraft) {
  if (attempt.text_response?.trim()) return attempt.text_response.trim();

  if (attempt.audio_response_transcript?.trim()) {
    return attempt.audio_response_transcript.trim();
  }

  if (attempt.selected_option_id) return attempt.selected_option_id;

  if (attempt.selected_option_ids?.length) {
    return attempt.selected_option_ids.join(", ");
  }

  if (attempt.ordered_item_ids?.length) {
    return attempt.ordered_item_ids.join(" -> ");
  }

  if (attempt.placements && Object.keys(attempt.placements).length > 0) {
    return JSON.stringify(attempt.placements);
  }

  if (typeof attempt.numeric_response === "number") {
    return String(attempt.numeric_response);
  }

  if (attempt.graph_features?.length) {
    return attempt.graph_features.join("\n");
  }

  if (typeof attempt.selected_click_seconds === "number") {
    return String(attempt.selected_click_seconds);
  }

  return "";
}

function getEncouragement(response: string, isSubmitting: boolean) {
  if (isSubmitting) return "Submitting your response...";
  const trimmed = response.trim();
  if (!trimmed) return "Start when youâ€™re ready.";
  const words = trimmed.split(/\s+/).length;
  if (words < 8) return "You can submit now, or add a little more reasoning.";
  if (words < 20) return "Nice start. A bit more structure could make your thinking clearer.";
  return "Good â€” this has enough substance to judge.";
}

export default function ProbeSurface({
  probe,
  probeFeedback = null,
  isSubmitting = false,
  onExit,
  onSubmit,
}: ProbeSurfaceProps) {
  const [draftResponse, setDraftResponse] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setDraftResponse("");
  }, [probe?.id]);

  const renderableProbe = useMemo(
    () => (probe ? buildRenderableProbe(probe) : null),
    [probe],
  );

  const trimmedResponse = draftResponse.trim();
  const wordCount = trimmedResponse ? trimmedResponse.split(/\s+/).length : 0;
  const canSubmit = trimmedResponse.length > 0 && !isSubmitting;

  const probeHint = useMemo(() => getInstructionHint(probe), [probe]);
  const encouragement = useMemo(
    () => getEncouragement(draftResponse, isSubmitting),
    [draftResponse, isSubmitting],
  );

  function handleSubmitFromRenderer(payload: ProbeRendererSubmitPayload) {
    if (!probe || isSubmitting) return;

    const response = stringifyAttempt(payload.attempt).trim();
    if (!response) return;

    onSubmit({
      probeId: probe.id,
      topicId: probe.topicId,
      response,
      attempt: payload.attempt,
      engineRenderableProbe:
        payload.probe ?? renderableProbe ?? probe.engineRenderableProbe ?? null,
      probeContractSnapshot: probe.probeContractSnapshot ?? null,
    });
  }

  if (!probe || !renderableProbe) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.82)_0%,rgba(101,45,175,0.94)_42%,rgba(18,4,34,1)_100%)] text-white">
        <div
          className={`rounded-3xl border border-white/10 bg-white/[0.05] p-8 backdrop-blur-md transition-all duration-500 ${
            isVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-4 opacity-0"
          }`}
        >
          <p className="text-lg font-medium">No active probe</p>
          <p className="mt-2 max-w-md text-sm leading-7 text-zinc-200/80">
            There is not an active probe loaded right now. Return to the learning
            space and continue from there.
          </p>
          <button
            onClick={onExit}
            type="button"
            className="mt-5 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.08]"
          >
            Back to learning space
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.9)_0%,rgba(101,45,175,0.98)_42%,rgba(16,3,30,1)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_24%),radial-gradient(circle_at_bottom,rgba(37,0,71,0.25),transparent_36%)]" />

      <div
        className={`relative z-10 flex h-full w-full items-center justify-center px-6 py-10 transition-all duration-500 ${
          isVisible ? "scale-100 opacity-100" : "scale-[0.985] opacity-0"
        }`}
      >
        <div className="w-full max-w-4xl rounded-[2rem] border border-white/12 bg-black/20 p-6 shadow-[0_0_50px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/12 bg-white/[0.07] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-200/80">
                  Probe
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-300/75">
                  {getProbeStatusLabel(probe.status)}
                </span>
                {probe.intent ? (
                  <span className="rounded-full border border-purple-200/20 bg-purple-200/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-purple-100/85">
                    {formatBadgeLabel(probe.intent)}
                  </span>
                ) : null}
                {probe.probeType ? (
                  <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-100/85">
                    {formatBadgeLabel(probe.probeType)}
                  </span>
                ) : null}
              </div>

              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                {probe.title}
              </h2>

              {probe.topicLabel ? (
                <p className="mt-2 text-sm text-zinc-300/80">
                  Topic: {probe.topicLabel}
                </p>
              ) : null}

              <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-100/90">
                {probe.instruction}
              </p>

              <p className="mt-3 text-xs leading-6 text-zinc-300/75">
                {probeHint}
              </p>
            </div>

            <button
              onClick={onExit}
              type="button"
              disabled={isSubmitting}
              className="shrink-0 rounded-2xl border border-white/12 bg-white/[0.08] px-4 py-2 text-sm text-zinc-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Exit
            </button>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              {probeFeedback ? (
                <div className="rounded-3xl border border-white/12 bg-white/[0.06] px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-300/70">
                    MyWay feedback
                  </p>
                  <p className="mt-3 text-sm leading-7 text-zinc-100/95">
                    {probeFeedback.reply}
                  </p>
                  {probeFeedback.suggestedAction ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-300/65">
                        Next move
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-100/90">
                        {probeFeedback.suggestedAction}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={probeFeedback ? "mt-6" : ""}>
                <ProbeRenderer
                  probe={renderableProbe}
                  disabled={isSubmitting}
                  showDebug={process.env.NODE_ENV !== "production"}
                  onDraftChange={(draft) => setDraftResponse(stringifyAttempt(draft))}
                  onSubmit={handleSubmitFromRenderer}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-300/70">
                <div>
                  {wordCount > 0 ? `${wordCount} words` : "No response yet"}
                </div>
                <div>{encouragement}</div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={onExit}
                  type="button"
                  disabled={isSubmitting}
                  className="rounded-2xl border border-white/12 bg-white/[0.08] px-4 py-2.5 text-sm text-zinc-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  onClick={() =>
                    handleSubmitFromRenderer({
                      probe: renderableProbe,
                      attempt: {
                        attempt_type: renderableProbe.expected_attempt_type,
                        text_response: draftResponse,
                      },
                    })
                  }
                  type="button"
                  disabled={!canSubmit}
                  className="rounded-2xl border border-purple-200/35 bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit response"}
                </button>
              </div>
            </div>

            <aside className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-300/70">
                Guidance
              </p>

              <div className="mt-4 space-y-4 text-sm leading-6 text-zinc-100/85">
                <div>
                  <p className="font-medium text-white">What to aim for</p>
                  <p className="mt-1 text-zinc-300/80">
                    Try to explain your thinking clearly, not just give a short
                    answer.
                  </p>
                </div>

                {probe.expectedResponseType ? (
                  <div>
                    <p className="font-medium text-white">Expected response</p>
                    <p className="mt-1 text-zinc-300/80">
                      {formatBadgeLabel(probe.expectedResponseType)}
                    </p>
                  </div>
                ) : null}

                <div>
                  <p className="font-medium text-white">Helpful approach</p>
                  <p className="mt-1 text-zinc-300/80">
                    Use causes, steps, contrasts, or an example when that makes
                    your reasoning easier to see.
                  </p>
                </div>

                <div>
                  <p className="font-medium text-white">Submission</p>
                  <p className="mt-1 text-zinc-300/80">
                    Use the probe control to answer, then submit. Text-style
                    probes can still be answered in your own words.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}




