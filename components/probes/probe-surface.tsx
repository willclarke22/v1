"use client";

import { useEffect, useMemo, useState } from "react";

export type ProbeSummary = {
  id: string;
  topicId: string;
  topicName?: string;
  title: string;
  instruction: string;
  status: "available" | "active" | "completed";
  intent?: string | null;
  probeType?: string | null;
  expectedResponseType?: string | null;
  helperText?: string | null;
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
  }) => void;
};

function getProbeStatusLabel(status: ProbeSummary["status"]) {
  if (status === "active") return "In progress";
  if (status === "completed") return "Completed";
  return "Ready";
}

function formatBadgeLabel(value?: string | null) {
  if (!value) return null;
  return value.replaceAll("_", " ");
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

function getEncouragement(response: string, isSubmitting: boolean) {
  if (isSubmitting) return "Submitting your response...";
  const trimmed = response.trim();
  if (!trimmed) return "Start writing when you’re ready.";
  const words = trimmed.split(/\s+/).length;
  if (words < 8) return "You can submit now, or add a little more reasoning.";
  if (words < 20) return "Nice start. A bit more structure could make your thinking clearer.";
  return "Good — this has enough substance to judge.";
}

export default function ProbeSurface({
  probe,
  probeFeedback = null,
  isSubmitting = false,
  onExit,
  onSubmit,
}: ProbeSurfaceProps) {
  const [response, setResponse] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setResponse("");
  }, [probe?.id]);

  const trimmedResponse = response.trim();
  const wordCount = trimmedResponse ? trimmedResponse.split(/\s+/).length : 0;
  const canSubmit = trimmedResponse.length > 0 && !isSubmitting;

  const probeHint = useMemo(() => getInstructionHint(probe), [probe]);
  const encouragement = useMemo(
    () => getEncouragement(response, isSubmitting),
    [response, isSubmitting]
  );

  function handleSubmit() {
    if (!probe || !trimmedResponse || isSubmitting) return;

    onSubmit({
      probeId: probe.id,
      topicId: probe.topicId,
      response: trimmedResponse,
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  if (!probe) {
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

              {probe.topicName ? (
                <p className="mt-2 text-sm text-zinc-300/80">
                  Topic: {probe.topicName}
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
                <label className="mb-3 block text-sm font-medium text-white">
                  Your response
                </label>

                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write your answer here. Press Enter to submit, or Shift+Enter for a new line."
                  disabled={isSubmitting}
                  className="min-h-[240px] w-full rounded-3xl border border-white/12 bg-black/20 px-5 py-4 text-sm leading-7 text-white outline-none placeholder:text-zinc-300/45 focus:border-purple-300/45 disabled:cursor-not-allowed disabled:opacity-70"
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
                  onClick={handleSubmit}
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
                    Press Enter to submit. Use Shift+Enter if you want a new
                    line instead.
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