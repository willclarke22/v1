"use client";

import { useEffect, useMemo, useState } from "react";

type ScenePlanResponse = {
  ok?: boolean;
  plan?: unknown;
  fallback?: boolean;
  warning?: string;
  error?: string;
  debug?: Record<string, unknown>;
};

type RenderResponse = {
  ok?: boolean;
  render_id?: string;
  frame_urls?: string[];
  frame_count?: number;
  fps?: number;
  elapsed_ms?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  plan?: unknown;
};

const DEFAULT_PROMPT = "Create a cinematic stylized scene of a friendly-looking monster hiding behind a wall about to scare a kid. The kid is walking by unaware. Make it spooky, polished, readable, and not gory. Do not use text labels unless they help the composition.";
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-100">{title}</summary>
      <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/35 p-3 text-xs leading-5 text-zinc-200">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function FramePlayer({ urls, fps }: { urls: string[]; fps: number }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(urls.length > 1);

  useEffect(() => {
    setIndex(0);
    setPlaying(urls.length > 1);
  }, [urls]);

  useEffect(() => {
    if (!playing || urls.length <= 1) return;
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % urls.length);
    }, Math.max(42, Math.round(1000 / Math.max(1, fps))));
    return () => window.clearInterval(interval);
  }, [playing, urls.length, fps]);

  if (!urls.length) return null;

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
      <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[index]} alt="Blender render output" className="h-auto w-full object-contain" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-300">
        <button
          type="button"
          disabled={urls.length <= 1}
          onClick={() => setPlaying((value) => !value)}
          className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span>
          Frame {index + 1} / {urls.length} · {fps} fps
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, urls.length - 1)}
          value={index}
          onChange={(event) => setIndex(Number(event.target.value))}
          className="min-w-48 flex-1"
        />
      </div>
    </div>
  );
}

export function FreeformBlenderPlaygroundLab() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [plan, setPlan] = useState<unknown>(null);
  const [planResponse, setPlanResponse] = useState<ScenePlanResponse | null>(null);
  const [renderResponse, setRenderResponse] = useState<RenderResponse | null>(null);
  const [busy, setBusy] = useState<"plan" | "still" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const frameUrls = useMemo(() => renderResponse?.frame_urls ?? [], [renderResponse]);
  const fps = renderResponse?.fps ?? 12;

  async function requestPlan() {
    const response = await fetch("/api/probe-lab/blender-playground/scene-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, model }),
    });
    const data = (await response.json()) as ScenePlanResponse;
    setPlanResponse(data);
    if (!data.ok) throw new Error(data.error || "Scene plan generation failed.");
    setPlan(data.plan);
    return data.plan;
  }

  async function generatePlan() {
    setBusy("plan");
    setError(null);
    setRenderResponse(null);
    try {
      await requestPlan();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown scene-plan error.");
    } finally {
      setBusy(null);
    }
  }

  async function render(kind: "still" | "video") {
    setBusy(kind);
    setError(null);
    try {
      const activePlan = plan ?? (await requestPlan());
      const response = await fetch("/api/probe-lab/blender-playground/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          scene_plan: activePlan,
          frames: kind === "still" ? 1 : 48,
          fps: 12,
          width: 960,
          height: 540,
        }),
      });
      const data = (await response.json()) as RenderResponse;
      setRenderResponse(data);
      if (!data.ok) throw new Error(data.error || "Blender render failed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown render error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-semibold">Freeform prompt</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-300">
            Start simple. The model now writes a richer Blender scene plan with camera, lighting, materials, effects, and safe tool requests. Rendering will auto-generate a plan first if needed.
          </p>
        </div>

        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-200">
          Prompt
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={7}
            className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white outline-none ring-cyan-300/40 transition focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-200">
          NVIDIA model
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none ring-cyan-300/40 transition focus:ring-2"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={generatePlan}
            className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-black disabled:opacity-45"
          >
            {busy === "plan" ? "Generating…" : "Generate plan"}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => render("still")}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white disabled:opacity-45"
          >
            {busy === "still" ? "Rendering…" : "Render still"}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => render("video")}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white disabled:opacity-45"
          >
            {busy === "video" ? "Rendering…" : "Render video"}
          </button>
        </div>

        {error ? <div className="rounded-2xl border border-red-300/30 bg-red-950/30 p-4 text-sm text-red-100">{error}</div> : null}

        <div className="rounded-2xl border border-cyan-200/15 bg-cyan-950/20 p-4 text-sm leading-6 text-cyan-50/85">
          V2 target: rich scene plan → safer high-quality Blender tools. URL: <code className="rounded bg-black/30 px-1.5 py-0.5">/probe-lab/blender-playground</code>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <FramePlayer urls={frameUrls} fps={fps} />
        {renderResponse ? <JsonPanel title="Render response" value={renderResponse} /> : null}
        {planResponse?.warning ? (
          <div className="rounded-2xl border border-amber-300/25 bg-amber-950/25 p-4 text-sm text-amber-50">{planResponse.warning}</div>
        ) : null}
        {plan ? <JsonPanel title="Current rich Blender scene plan" value={plan} /> : null}
        {planResponse ? <JsonPanel title="Scene-plan route response" value={planResponse} /> : null}
      </div>
    </section>
  );
}
