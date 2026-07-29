
"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";

type RunResult = {
  ok?: boolean;
  error?: string;
  learner_need?: string;
  visual_style?: string;
  glm?: {
    model?: string;
    duration_ms?: number;
    raw_text?: string;
    parse_ok?: boolean;
    parse_error?: string | null;
    diagnostics?: unknown;
    request_payload_preview?: unknown;
  };
  storyboard?: {
    title?: string;
    teaching_goal?: string;
    misconception_or_blocker?: string;
    visual_concept?: string;
    video_prompt?: string;
    negative_prompt?: string;
    shot_plan?: Array<{
      beat?: number;
      time_range?: string;
      visual_action?: string;
      teaching_purpose?: string;
    }>;
    success_checks?: string[];
  };
  cosmos?: {
    endpoint?: string;
    request_payload?: unknown;
    response_metadata?: unknown;
    duration_ms?: number;
    video_url?: string;
    video_bytes?: number;
  };
  total_duration_ms?: number;
  created_at?: string;
};

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  color: "white",
  background:
    "radial-gradient(circle at top left, rgba(168,85,247,0.24), transparent 34%), linear-gradient(135deg, #050816, #111827)",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 22,
  padding: 18,
  background: "rgba(15,23,42,0.74)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(2,6,23,0.82)",
  color: "white",
  padding: "10px 12px",
  outline: "none",
};

const jsonStyle: CSSProperties = {
  margin: 0,
  maxHeight: 520,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "rgba(226,232,240,0.92)",
  fontSize: 12,
  lineHeight: 1.5,
  background: "rgba(2,6,23,0.66)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 14,
  padding: 14,
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: 8,
        color: "rgba(255,255,255,0.8)",
        fontSize: 13,
      }}
    >
      <span>{label}</span>
      {children}
      {hint ? (
        <span
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function formatDuration(value?: number) {
  return typeof value === "number"
    ? `${(value / 1000).toFixed(1)} s`
    : "—";
}

export function CosmosVideoLab() {
  const [learnerNeed, setLearnerNeed] = useState(
    "I understand that fuel burns, but I do not understand how expanding gas makes the piston turn the crankshaft.",
  );
  const [visualStyle, setVisualStyle] = useState(
    "polished educational technical cutaway, realistic materials, clean studio lighting, one engine cylinder",
  );
  const [durationSeconds, setDurationSeconds] = useState(6);
  const [resolution, setResolution] = useState("720_16_9");
  const [fps, setFps] = useState(24);
  const [seed, setSeed] = useState(42);
  const [steps, setSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7);
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);

  const numOutputFrames = useMemo(
    () => Math.max(49, Math.round(durationSeconds * fps) + 1),
    [durationSeconds, fps],
  );

  async function generate() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/cosmos-video/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            learner_need: learnerNeed,
            visual_style: visualStyle,
            duration_seconds: durationSeconds,
            resolution,
            fps,
            num_output_frames: numOutputFrames,
            seed,
            steps,
            guidance_scale: guidanceScale,
          }),
        },
      );

      const payload = (await response.json().catch(() => ({
        ok: false,
        error: `The route returned HTTP ${response.status} without JSON.`,
      }))) as RunResult;

      setResult(payload);
    } catch (caught) {
      setResult({
        ok: false,
        error: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={shellStyle}>
      <div
        style={{
          width: "min(1180px, 100%)",
          margin: "0 auto",
          display: "grid",
          gap: 18,
        }}
      >
        <div>
          <a
            href="/sandbox/probe-lab"
            style={{
              color: "rgba(216,180,254,0.9)",
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            ← Probe Lab
          </a>
          <p
            style={{
              margin: "18px 0 0",
              color: "rgba(255,255,255,0.55)",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            MyWay experimental lane
          </p>
          <h1
            style={{
              margin: "8px 0 0",
              fontSize: "clamp(2rem, 5vw, 4rem)",
            }}
          >
            GLM 5.2 + Cosmos3 Nano
          </h1>
          <p
            style={{
              maxWidth: 820,
              color: "rgba(255,255,255,0.7)",
              lineHeight: 1.65,
            }}
          >
            GLM converts a learner need into a constrained educational video
            brief. Cosmos3 Nano receives that brief, generates an MP4, and the
            sandbox preserves the prompts and diagnostics for comparison.
          </p>
        </div>

        <section
          style={{
            ...cardStyle,
            display: "grid",
            gap: 16,
          }}
        >
          <Field
            label="Learner confusion or explanation goal"
            hint="Describe what the learner understands and the exact connection that is missing."
          >
            <textarea
              value={learnerNeed}
              onChange={(event) => setLearnerNeed(event.target.value)}
              rows={5}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <Field
            label="Visual style"
            hint="Keep this focused on one coherent scene rather than a montage."
          >
            <input
              value={visualStyle}
              onChange={(event) => setVisualStyle(event.target.value)}
              style={inputStyle}
            />
          </Field>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
            }}
          >
            <Field label="Duration">
              <input
                type="number"
                min={3}
                max={12}
                value={durationSeconds}
                onChange={(event) =>
                  setDurationSeconds(Number(event.target.value) || 6)
                }
                style={inputStyle}
              />
            </Field>

            <Field label="Resolution">
              <input
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="FPS">
              <input
                type="number"
                min={8}
                max={60}
                value={fps}
                onChange={(event) =>
                  setFps(Number(event.target.value) || 24)
                }
                style={inputStyle}
              />
            </Field>

            <Field label="Frames" hint="Calculated from duration × FPS + 1.">
              <input value={numOutputFrames} readOnly style={inputStyle} />
            </Field>

            <Field label="Seed">
              <input
                type="number"
                min={0}
                value={seed}
                onChange={(event) =>
                  setSeed(Number(event.target.value) || 0)
                }
                style={inputStyle}
              />
            </Field>

            <Field label="Steps">
              <input
                type="number"
                min={1}
                max={100}
                value={steps}
                onChange={(event) =>
                  setSteps(Number(event.target.value) || 30)
                }
                style={inputStyle}
              />
            </Field>

            <Field label="Guidance">
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={guidanceScale}
                onChange={(event) =>
                  setGuidanceScale(Number(event.target.value) || 7)
                }
                style={inputStyle}
              />
            </Field>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={generate}
              disabled={loading || !learnerNeed.trim()}
              style={{
                border: 0,
                borderRadius: 999,
                padding: "11px 18px",
                cursor: loading ? "wait" : "pointer",
                color: "white",
                fontWeight: 750,
                background:
                  "linear-gradient(135deg, rgba(168,85,247,0.96), rgba(59,130,246,0.96))",
                opacity: loading ? 0.65 : 1,
              }}
            >
              {loading
                ? "Directing and generating…"
                : "Generate text-to-video"}
            </button>
            <span
              style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: 12,
              }}
            >
              The route may take several minutes and uses the NVIDIA preview
              endpoint configured on your server.
            </span>
          </div>
        </section>

        {result?.error ? (
          <section
            style={{
              ...cardStyle,
              borderColor: "rgba(248,113,113,0.5)",
              background: "rgba(127,29,29,0.2)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Generation failed</h2>
            <pre style={jsonStyle}>{result.error}</pre>
          </section>
        ) : null}

        {result?.cosmos?.video_url ? (
          <section style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  {result.storyboard?.title ?? "Generated video"}
                </h2>
                <p
                  style={{
                    margin: "6px 0 0",
                    color: "rgba(255,255,255,0.58)",
                    fontSize: 13,
                  }}
                >
                  GLM {formatDuration(result.glm?.duration_ms)} · Cosmos{" "}
                  {formatDuration(result.cosmos.duration_ms)} · total{" "}
                  {formatDuration(result.total_duration_ms)}
                </p>
              </div>
              <a
                href={result.cosmos.video_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "rgba(216,180,254,0.96)",
                  fontSize: 13,
                }}
              >
                Open MP4
              </a>
            </div>

            <video
              controls
              playsInline
              src={result.cosmos.video_url}
              style={{
                display: "block",
                width: "100%",
                marginTop: 16,
                borderRadius: 16,
                background: "black",
                maxHeight: 680,
              }}
            />
          </section>
        ) : null}

        {result?.storyboard ? (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 18,
            }}
          >
            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Teaching direction</h2>
              <p>
                <strong>Goal:</strong> {result.storyboard.teaching_goal}
              </p>
              <p>
                <strong>Blocker:</strong>{" "}
                {result.storyboard.misconception_or_blocker}
              </p>
              <p>
                <strong>Visual concept:</strong>{" "}
                {result.storyboard.visual_concept}
              </p>
            </div>

            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Shot plan</h2>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  display: "grid",
                  gap: 10,
                }}
              >
                {(result.storyboard.shot_plan ?? []).map((beat, index) => (
                  <li key={`${beat.beat ?? index}-${beat.time_range}`}>
                    <strong>{beat.time_range}</strong>:{" "}
                    {beat.visual_action}
                    {beat.teaching_purpose ? (
                      <div
                        style={{
                          marginTop: 3,
                          color: "rgba(255,255,255,0.58)",
                          fontSize: 12,
                        }}
                      >
                        {beat.teaching_purpose}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {result ? (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 18,
            }}
          >
            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>GLM video prompt</h2>
              <pre style={jsonStyle}>
                {result.storyboard?.video_prompt ?? "No prompt returned."}
              </pre>
            </div>

            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Negative prompt</h2>
              <pre style={jsonStyle}>
                {result.storyboard?.negative_prompt ??
                  "No negative prompt returned."}
              </pre>
            </div>

            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Cosmos request</h2>
              <pre style={jsonStyle}>
                {formatJson(result.cosmos?.request_payload)}
              </pre>
            </div>

            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>GLM diagnostics</h2>
              <pre style={jsonStyle}>
                {formatJson({
                  model: result.glm?.model,
                  parse_ok: result.glm?.parse_ok,
                  parse_error: result.glm?.parse_error,
                  diagnostics: result.glm?.diagnostics,
                  request_payload_preview:
                    result.glm?.request_payload_preview,
                })}
              </pre>
            </div>

            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Raw GLM response</h2>
              <pre style={jsonStyle}>
                {result.glm?.raw_text ?? "No raw response."}
              </pre>
            </div>

            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Cosmos metadata</h2>
              <pre style={jsonStyle}>
                {formatJson({
                  endpoint: result.cosmos?.endpoint,
                  response_metadata:
                    result.cosmos?.response_metadata,
                  video_bytes: result.cosmos?.video_bytes,
                  created_at: result.created_at,
                })}
              </pre>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
