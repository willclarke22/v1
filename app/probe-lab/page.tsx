"use client";

import { useMemo, useState } from "react";
import type { EngineRenderableProbe } from "@/lib/engine";
import {
  ProbeRenderer,
  type ProbeAnswerDraft,
  type ProbeRendererSubmitPayload,
} from "@/ui/learning-space/probes";

function makeProbe(
  id: string,
  probe: Partial<EngineRenderableProbe>,
): EngineRenderableProbe & { lab_id: string } {
  return {
    lab_id: id,
    schema_version: "engine_renderable_probe_v1",
    probe_type: "explain",
    expected_attempt_type: "text",
    prompt: {
      root_problem_explanation:
        "MyWay is checking whether the learner can make the hidden structure visible.",
      reshaping_explanation:
        "Answer in the way that best shows your current thinking.",
      task: "Explain the idea in your own words.",
      full_prompt:
        "Explain the idea in your own words. A partial answer is okay.",
    },
    presentation_support: [],
    answer_key: {
      kind: "text",
      expected_ideas: ["clear reasoning", "specific example"],
    },
    misconception_markers: [],
    renderer_params: {},
    delivery_context: null,
    confidence: 0.72,
    renderer_compatibility: {
      renderer_kind: probe.probe_type ?? "explain",
      is_renderable: true,
      blocking_reasons: [],
      warnings: [],
    },
    ...probe,
  } as EngineRenderableProbe & { lab_id: string };
}

const probes = [
  makeProbe("explain", {
    probe_type: "explain",
    expected_attempt_type: "text",
    prompt: {
      root_problem_explanation:
        "The learner may have the words but not the model yet.",
      reshaping_explanation: "Make the idea visible in plain language.",
      task: "Explain what is happening.",
      full_prompt:
        "Explain what is happening in your own words. Use a concrete example if it helps.",
    },
  }),

  makeProbe("single-choice", {
    probe_type: "single_choice",
    expected_attempt_type: "single_choice",
    prompt: {
      root_problem_explanation:
        "The learner may be mixing up two nearby ideas.",
      reshaping_explanation: "Choose the option that best matches the situation.",
      task: "Choose the best match.",
      full_prompt: "Which option best explains what is happening?",
    },
    renderer_params: {
      options: [
        { id: "a", label: "A", text: "The first idea fits best." },
        { id: "b", label: "B", text: "The second idea fits best." },
        { id: "c", label: "C", text: "Both ideas mean the same thing." },
      ],
    },
  }),

  makeProbe("multi-choice", {
    probe_type: "multi_choice",
    expected_attempt_type: "multi_choice",
    prompt: {
      root_problem_explanation:
        "The learner may know pieces but not which pieces belong.",
      reshaping_explanation: "Select every idea that fits.",
      task: "Choose all that apply.",
      full_prompt: "Which ideas are part of the explanation?",
    },
    renderer_params: {
      options: [
        { id: "a", label: "A", text: "A cause is named." },
        { id: "b", label: "B", text: "A result is named." },
        { id: "c", label: "C", text: "The link between them is explained." },
      ],
    },
  }),

  makeProbe("drag-drop-icons", {
    probe_type: "drag_drop_placements",
    expected_attempt_type: "drag_drop_placements",
    prompt: {
      root_problem_explanation:
        "The learner may be sorting roles or categories incorrectly.",
      reshaping_explanation: "Drag each icon to the field where it belongs.",
      task: "Sort the icons.",
      full_prompt: "Drag each icon into the correct drop field.",
    },
    renderer_params: {
      items: [
        { id: "cause", text: "Cause" },
        { id: "effect", text: "Effect" },
        { id: "evidence", text: "Evidence" },
        { id: "claim", text: "Claim" },
        { id: "energy", text: "Energy transfer" },
        { id: "role", text: "Receiver role" },
      ],
      placement_targets: [
        { id: "starts_it", label: "Starts it" },
        { id: "shows_it", label: "Shows it" },
        { id: "receives_it", label: "Receives it" },
      ],
    },
  }),

  makeProbe("sequence", {
    probe_type: "sequence",
    expected_attempt_type: "ordered_items",
    prompt: {
      root_problem_explanation:
        "The learner may know the pieces but not the order.",
      reshaping_explanation: "Put the steps in the order that makes sense.",
      task: "Order the steps.",
      full_prompt: "Put these steps in order from first to last.",
    },
    renderer_params: {
      items: [
        { id: "first", text: "First step" },
        { id: "second", text: "Second step" },
        { id: "third", text: "Third step" },
        { id: "fourth", text: "Fourth step" },
      ],
    },
  }),

  makeProbe("slider", {
    probe_type: "slider",
    expected_attempt_type: "numeric",
    prompt: {
      root_problem_explanation:
        "The learner may need to estimate a quantity or strength.",
      reshaping_explanation: "Use the slider to show your estimate.",
      task: "Make an estimate.",
      full_prompt: "Move the slider to show your estimate.",
    },
    renderer_params: {
      slider: {
        min: 0,
        max: 100,
        step: 0.01,
        unit: "%",
      },
    },
  }),

  makeProbe("graph-2d", {
    probe_type: "graph_relationship",
    expected_attempt_type: "graph",
    prompt: {
      root_problem_explanation:
        "The learner may see the graph but not the relationship.",
      reshaping_explanation: "Create or adjust a function and describe what changes.",
      task: "Explore a 2D function.",
      full_prompt:
        "Create a function, click the graph to mark a point, and describe the pattern you notice.",
    },
  }),

  makeProbe("graph-3d", {
    probe_type: "graph_relationship",
    expected_attempt_type: "graph",
    prompt: {
      root_problem_explanation:
        "The learner may need to understand how a value depends on two variables at once.",
      reshaping_explanation: "Use a 3D surface to explore z = f(x,y).",
      task: "Explore a 3D surface.",
      full_prompt:
        "Switch to 3D, adjust the surface, and describe the shape you notice.",
    },
  }),

  makeProbe("audio-response", {
    probe_type: "audio_response_question",
    expected_attempt_type: "audio_response",
    prompt: {
      root_problem_explanation:
        "The learner may explain better out loud than in typed text.",
      reshaping_explanation: "Use a spoken response or add a typed note.",
      task: "Explain it out loud.",
      full_prompt:
        "Press record, explain your thinking, then stop the recording.",
    },
  }),

  makeProbe("video-click", {
    probe_type: "video_click_interval",
    expected_attempt_type: "video_click",
    prompt: {
      root_problem_explanation:
        "The learner may recognize an important moment better than describe it.",
      reshaping_explanation: "Click when the target moment happens.",
      task: "Click the target moment.",
      full_prompt:
        "Watch the video and click when you see or hear the moment MyWay is focusing on.",
    },
    renderer_params: {
      video: {
        video_url: "",
        duration_seconds: 30,
        informational_only: false,
      },
    },
  }),

  makeProbe("video-explanation", {
    probe_type: "video_explanation",
    expected_attempt_type: "none",
    prompt: {
      root_problem_explanation:
        "The learner may need to watch a short explanation before attempting.",
      reshaping_explanation: "Watch first, then continue.",
      task: "Watch the explanation.",
      full_prompt: "Watch the explanation, then return to the learning space.",
    },
    renderer_params: {
      video: {
        video_url: "",
        duration_seconds: 30,
        informational_only: true,
      },
    },
  }),
];

function stringifyAttempt(attempt: ProbeAnswerDraft) {
  return JSON.stringify(attempt, null, 2);
}

export default function ProbeLabPage() {
  const [selectedId, setSelectedId] = useState(probes[0]?.lab_id ?? "explain");
  const [latestDraft, setLatestDraft] = useState<ProbeAnswerDraft | null>(null);
  const [latestSubmit, setLatestSubmit] =
    useState<ProbeRendererSubmitPayload | null>(null);

  const selectedProbe = useMemo(
    () => probes.find((probe) => probe.lab_id === selectedId) ?? probes[0],
    [selectedId],
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(126,34,206,0.38),transparent_34%),linear-gradient(135deg,#150022,#2b0647_48%,#090014)] px-6 py-6 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-purple-100/70">
            MyWay Probe Lab
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Probe template viewer
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-200/78">
            Use this local page to inspect every probe renderer without waiting
            for the model to generate that exact probe type.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-white/10 bg-black/20 p-4 backdrop-blur-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300/70">
              Templates
            </p>

            <div className="grid gap-2">
              {probes.map((probe) => {
                const active = selectedId === probe.lab_id;

                return (
                  <button
                    key={probe.lab_id}
                    type="button"
                    onClick={() => {
                      setSelectedId(probe.lab_id);
                      setLatestDraft(null);
                      setLatestSubmit(null);
                    }}
                    className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                      active
                        ? "border-purple-200/45 bg-purple-200/18 text-white"
                        : "border-white/10 bg-white/[0.05] text-zinc-200/78 hover:bg-white/[0.08]"
                    }`}
                  >
                    <span className="block font-semibold">
                      {probe.lab_id.replaceAll("-", " ")}
                    </span>
                    <span className="mt-1 block text-xs opacity-70">
                      {probe.expected_attempt_type.replaceAll("_", " ")}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 rounded-[2rem] border border-white/10 bg-black/20 p-5 backdrop-blur-xl">
            <ProbeRenderer
              key={selectedProbe.lab_id}
              probe={selectedProbe}
              showDebug={false}
              initialDraft={
                selectedProbe.lab_id === "graph-3d"
                  ? {
                      attempt_type: "graph",
                      graph_mode: "3d",
                      graph_surface_expression: "a*x^2 + b*y^2 + c",
                      graph_notes: "",
                      graph_features: [],
                    }
                  : undefined
              }
              onDraftChange={setLatestDraft}
              onSubmit={setLatestSubmit}
            />
          </section>
        </div>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-black/20 p-4 backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300/70">
              Latest draft
            </p>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-black/30 p-4 text-xs text-zinc-200/80">
              {latestDraft ? stringifyAttempt(latestDraft) : "No draft yet."}
            </pre>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/20 p-4 backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300/70">
              Latest submit
            </p>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-black/30 p-4 text-xs text-zinc-200/80">
              {latestSubmit
                ? stringifyAttempt(latestSubmit.attempt)
                : "Nothing submitted yet."}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
