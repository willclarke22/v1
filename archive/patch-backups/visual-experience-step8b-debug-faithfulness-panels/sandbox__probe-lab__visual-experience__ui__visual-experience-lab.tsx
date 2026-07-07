"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { SemanticScenePlayer } from "./scene-player";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

type RequestBody = {
  provider: "scaffold" | "deepseek" | "openai";
  learner_message: string;
  topic_label: string;
  bridge_level: string;
  jargon_level: string;
  preferred_style: string;
  force_clarification: boolean;
  use_fallback_on_invalid: boolean;
};

const defaultRequestBody: RequestBody = {
  provider: "deepseek",
  learner_message: "I can’t picture the Krebs cycle.",
  topic_label: "Krebs cycle",
  bridge_level: "bridge_0",
  jargon_level: "none",
  preferred_style: "visual_description",
  force_clarification: false,
  use_fallback_on_invalid: true,
};

const unclearRequestBody: RequestBody = {
  ...defaultRequestBody,
  learner_message: "I don’t get this.",
  topic_label: "",
  force_clarification: true,
};

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(circle at top left, #1e293b 0, #020617 42%, #020617 100%)",
  color: "white",
  padding: 24,
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 22,
  padding: 18,
  background: "rgba(15,23,42,0.72)",
  boxShadow: "0 22px 60px rgba(0,0,0,0.25)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(2,6,23,0.8)",
  color: "white",
  padding: "10px 12px",
  outline: "none",
};

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 999,
  background: "rgba(255,255,255,0.1)",
  color: "white",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 650,
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(135deg, rgba(56,189,248,0.95), rgba(129,140,248,0.95))",
  border: "none",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getRecord(root: unknown, key: string): Record<string, unknown> | null {
  const record = asRecord(root);
  return record ? asRecord(record[key]) : null;
}

function getArray(root: unknown, key: string): unknown[] {
  const record = asRecord(root);
  return record ? asArray(record[key]) : [];
}

function JsonPanel({ title, value }: { title: string; value: JsonValue | undefined }) {
  return (
    <section style={cardStyle}>
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>{title}</h3>
      <pre
        style={{
          margin: 0,
          maxHeight: 420,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "rgba(226,232,240,0.88)",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 8, color: "rgba(255,255,255,0.78)", fontSize: 13 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "5px 9px",
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.12)",
        fontSize: 12,
        color: "rgba(255,255,255,0.8)",
      }}
    >
      {children}
    </span>
  );
}

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as JsonValue;

  if (!response.ok) {
    throw new Error(JSON.stringify(json ?? { status: response.status }, null, 2));
  }

  return json;
}

function FullTurnSummary({ result }: { result: JsonValue | undefined }) {
  const root = asRecord(result);
  const output = asRecord(root?.output);
  const resolved = asRecord(root?.resolved);
  const validation = getRecord(resolved, "validation");
  const turnStatus = text(output?.turn_status, "not generated yet");
  const clarificationGate = getRecord(output, "clarification_gate");
  const topicResolution = getRecord(output, "topic_resolution");
  const diagnosis = getRecord(output, "diagnosis");
  const learningFocus = getRecord(output, "learning_focus");
  const visualExperience = getRecord(output, "visual_experience");
  const scenePlan = getRecord(visualExperience, "semantic_scene_plan");
  const guidedInteraction = getRecord(output, "guided_interaction");
  const followupProbe = getRecord(output, "followup_probe");

  const orientationSegments = getArray(visualExperience, "orientation_segments");
  const entities = getArray(scenePlan, "entities");
  const beats = getArray(scenePlan, "beats");
  const renderBindings = getArray(resolved, "render_bindings");
  const queuedAssetNeeds = getArray(resolved, "queued_asset_needs");
  const probeRendererParams = getRecord(followupProbe, "renderer_params");
  const probeOptions = getArray(probeRendererParams, "options");
  const diagnostics = getRecord(root, "diagnostics");
  const fallbackReason = text(root?.fallback_reason, "");
  const likelyCause = text(diagnostics?.likely_cause, "");
  const normalizationApplied = diagnostics?.normalization_applied;
  const normalizationNotes = getArray(diagnostics, "normalization_notes");
  const fatalErrors = getArray(diagnostics, "model_validation_fatal_errors");
  const validationWarnings = getArray(diagnostics, "model_validation_warnings");

  if (!root) {
    return (
      <section style={cardStyle}>
        <h2 style={{ margin: 0 }}>Resolved visual learning turn</h2>
        <p style={{ color: "rgba(255,255,255,0.68)", lineHeight: 1.6 }}>
          Generate a full turn to see the root problem, orientation-driven scene, validation, render bindings, and follow-up probe.
        </p>
      </section>
    );
  }

  return (
    <section style={{ ...cardStyle, display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 8px" }}>Resolved visual learning turn</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill>status: {turnStatus}</Pill>
            <Pill>provider: {text(root.provider_used, "unknown")}</Pill>
            <Pill>model: {text(root.provider_model, "unknown")}</Pill>
            <Pill>fallback: {String(Boolean(root.fallback_used))}</Pill>
            <Pill>valid: {String(Boolean(validation?.valid))}</Pill>
          </div>
        </div>
      </div>

      {Boolean(root.fallback_used) || likelyCause || normalizationApplied ? (
        <div
          style={{
            borderRadius: 18,
            padding: 16,
            background: Boolean(root.fallback_used) ? "rgba(248,113,113,0.12)" : "rgba(14,165,233,0.1)",
            border: Boolean(root.fallback_used) ? "1px solid rgba(248,113,113,0.28)" : "1px solid rgba(14,165,233,0.22)",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Model diagnostics</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <Pill>parse: {String(Boolean(root.parse_ok))}</Pill>
            <Pill>normalization: {String(Boolean(normalizationApplied))}</Pill>
            <Pill>fallback: {String(Boolean(root.fallback_used))}</Pill>
          </div>
          {fallbackReason ? (
            <p style={{ margin: "0 0 8px", lineHeight: 1.6, color: "rgba(255,255,255,0.88)" }}>
              <strong>Fallback reason:</strong> {fallbackReason}
            </p>
          ) : null}
          {likelyCause ? (
            <p style={{ margin: "0 0 8px", lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }}>
              <strong>Likely cause:</strong> {likelyCause}
            </p>
          ) : null}
          {normalizationNotes.length ? (
            <div style={{ marginTop: 10 }}>
              <strong>Normalization notes</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "rgba(255,255,255,0.72)", lineHeight: 1.55 }}>
                {normalizationNotes.map((note, index) => <li key={index}>{String(note)}</li>)}
              </ul>
            </div>
          ) : null}
          {fatalErrors.length || validationWarnings.length ? (
            <div style={{ marginTop: 10 }}>
              <strong>Validation details</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "rgba(255,255,255,0.72)", lineHeight: 1.55 }}>
                {fatalErrors.map((item, index) => <li key={`fatal-${index}`}>fatal: {String(item)}</li>)}
                {validationWarnings.map((item, index) => <li key={`warning-${index}`}>warning: {String(item)}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {turnStatus === "needs_clarification" ? (
        <div style={{ borderRadius: 18, padding: 16, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.24)" }}>
          <h3 style={{ marginTop: 0 }}>Clarification needed</h3>
          <p style={{ marginBottom: 0, color: "rgba(255,255,255,0.86)", lineHeight: 1.6 }}>
            {text(clarificationGate?.clarification_question, "The model asked for clarification.")}
          </p>
        </div>
      ) : null}

      {turnStatus === "proceed" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <InfoBlock title="Topic" value={text(topicResolution?.topic_label, "—")} subvalue={text(topicResolution?.reason, "")} />
            <InfoBlock title="Diagnosis" value={text(diagnosis?.diagnosis, "—")} subvalue={`confidence: ${String(diagnosis?.diagnosis_confidence ?? "—")}`} />
            <InfoBlock title="Target takeaway" value={text(learningFocus?.target_takeaway, "—")} subvalue={text(learningFocus?.why_visual_first, "")} />
          </div>
          <SemanticScenePlayer result={root} />

          <div style={{ borderRadius: 18, padding: 16, background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.22)" }}>
            <h3 style={{ marginTop: 0 }}>Root problem</h3>
            <p style={{ marginBottom: 0, lineHeight: 1.7, color: "rgba(255,255,255,0.88)" }}>{text(learningFocus?.root_problem, "—")}</p>
          </div>

          <div>
            <h3 style={{ marginBottom: 10 }}>Orientation segments</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {orientationSegments.map((segment, index) => {
                const item = asRecord(segment);
                return (
                  <div key={text(item?.id, String(index))} style={{ borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <Pill>{text(item?.purpose, "orientation")}</Pill>
                    <p style={{ margin: "10px 0 0", lineHeight: 1.6 }}>{text(item?.text, "—")}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <section style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Scene entities + render bindings</h3>
              {entities.map((entity, index) => {
                const item = asRecord(entity);
                const entityId = text(item?.id, String(index));
                const binding = renderBindings
                  .map((candidate) => asRecord(candidate))
                  .find((candidate) => candidate?.entity_id === entityId);
                const bindingRecord = getRecord(binding, "binding");
                const visualNeed = getRecord(item, "visual_need");
                return (
                  <div key={entityId} style={{ borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <strong>{text(item?.display_name, entityId)}</strong>
                    <p style={{ margin: "6px 0", color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>{text(item?.semantic_role, "")}</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Pill>need: {text(visualNeed?.preferred_render_kind, "any")}</Pill>
                      <Pill>binding: {text(bindingRecord?.kind, "none")} {text(bindingRecord?.primitive, "")}</Pill>
                    </div>
                  </div>
                );
              })}
            </section>

            <section style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Beats locked to orientation</h3>
              {beats.map((beat, index) => {
                const item = asRecord(beat);
                return (
                  <div key={text(item?.id, String(index))} style={{ borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <strong>{text(item?.title, `Beat ${index + 1}`)}</strong>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {getArray(item, "source_orientation_segment_ids").map((id, idIndex) => (
                        <Pill key={`${String(id)}-${idIndex}`}>from {String(id)}</Pill>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>

          <div style={{ borderRadius: 18, padding: 16, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.24)" }}>
            <h3 style={{ marginTop: 0 }}>Guided interaction</h3>
            <p style={{ margin: "0 0 8px", lineHeight: 1.7 }}>{text(guidedInteraction?.instruction, "—")}</p>
            <Pill>{text(guidedInteraction?.required_action_type, "none")}</Pill>
          </div>

          <div style={{ borderRadius: 18, padding: 16, background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.24)" }}>
            <h3 style={{ marginTop: 0 }}>Follow-up probe</h3>
            <p style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.7 }}>{text(getRecord(followupProbe, "prompt")?.full_prompt, "—")}</p>
            <div style={{ display: "grid", gap: 8 }}>
              {probeOptions.map((option, index) => {
                const item = asRecord(option);
                return (
                  <div key={text(item?.id, String(index))} style={{ borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <strong>{text(item?.label, String.fromCharCode(65 + index))}.</strong> {text(item?.text, "")}
                  </div>
                );
              })}
            </div>
          </div>

          {queuedAssetNeeds.length ? (
            <div>
              <h3>Queued asset needs</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {queuedAssetNeeds.map((need, index) => {
                  const item = asRecord(need);
                  return <Pill key={index}>{text(item?.description, "asset need")}</Pill>;
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function InfoBlock({ title, value, subvalue }: { title: string; value: string; subvalue?: string }) {
  return (
    <div style={{ borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 12, marginBottom: 6 }}>{title}</div>
      <strong>{value}</strong>
      {subvalue ? <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 1.5, margin: "8px 0 0" }}>{subvalue}</p> : null}
    </div>
  );
}

export function VisualExperienceLab() {
  const [body, setBody] = useState<RequestBody>(defaultRequestBody);
  const [debugResult, setDebugResult] = useState<JsonValue | undefined>();
  const [resolveResult, setResolveResult] = useState<JsonValue | undefined>();
  const [generateResult, setGenerateResult] = useState<JsonValue | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPayload = useMemo(() => ({ ...body }), [body]);

  async function run(path: string, setter: (value: JsonValue) => void) {
    setIsLoading(true);
    setError(null);

    try {
      const json = await postJson(path, currentPayload);
      setter(json);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main style={shellStyle}>
      <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gap: 20 }}>
        <header style={{ display: "grid", gap: 8 }}>
          <Pill>Visual Experience · Step 7</Pill>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 4.2rem)", letterSpacing: -1.5 }}>
            Semantic scene primitive player
          </h1>
          <p style={{ maxWidth: 980, margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.7 }}>
            This step takes the validated semantic scene plan from the model, resolves it into primitive render bindings,`r`n            and previews the beat-by-beat visual learning scene before richer GLB assets are required.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 440px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
          <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <h2 style={{ margin: 0 }}>Request controls</h2>

            <Field label="Provider">
              <select value={body.provider} onChange={(event) => setBody((current) => ({ ...current, provider: event.target.value as RequestBody["provider"] }))} style={inputStyle}>
                <option value="deepseek">DeepSeek via NVIDIA</option>
                <option value="openai">openai</option>
                <option value="scaffold">scaffold fallback</option>
              </select>
            </Field>

            <Field label="Learner message">
              <textarea
                value={body.learner_message}
                onChange={(event) => setBody((current) => ({ ...current, learner_message: event.target.value }))}
                rows={5}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>

            <Field label="Known topic label, optional">
              <input value={body.topic_label} onChange={(event) => setBody((current) => ({ ...current, topic_label: event.target.value }))} style={inputStyle} />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Bridge level">
                <select value={body.bridge_level} onChange={(event) => setBody((current) => ({ ...current, bridge_level: event.target.value }))} style={inputStyle}>
                  <option value="bridge_0">bridge_0</option>
                  <option value="bridge_1">bridge_1</option>
                  <option value="bridge_2">bridge_2</option>
                  <option value="full_bridge">full_bridge</option>
                </select>
              </Field>
              <Field label="Jargon level">
                <select value={body.jargon_level} onChange={(event) => setBody((current) => ({ ...current, jargon_level: event.target.value }))} style={inputStyle}>
                  <option value="none">none</option>
                  <option value="light">light</option>
                  <option value="standard">standard</option>
                  <option value="full">full</option>
                </select>
              </Field>
            </div>

            <Field label="Preferred style">
              <select value={body.preferred_style} onChange={(event) => setBody((current) => ({ ...current, preferred_style: event.target.value }))} style={inputStyle}>
                <option value="visual_description">visual_description</option>
                <option value="step_by_step">step_by_step</option>
                <option value="concrete_examples">concrete_examples</option>
                <option value="plain_direct">plain_direct</option>
                <option value="gentle_coaching">gentle_coaching</option>
                <option value="metaphor_based">metaphor_based</option>
              </select>
            </Field>

            <label style={{ display: "flex", gap: 10, alignItems: "center", color: "rgba(255,255,255,0.74)" }}>
              <input type="checkbox" checked={body.force_clarification} onChange={(event) => setBody((current) => ({ ...current, force_clarification: event.target.checked }))} />
              Force clarification mode
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center", color: "rgba(255,255,255,0.74)" }}>
              <input type="checkbox" checked={body.use_fallback_on_invalid} onChange={(event) => setBody((current) => ({ ...current, use_fallback_on_invalid: event.target.checked }))} />
              Fallback to scaffold if model output is invalid
            </label>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button disabled={isLoading} onClick={() => run("/api/sandbox/probe-lab/visual-experience/generate-full-turn", setGenerateResult)} style={primaryButtonStyle}>
                {isLoading ? "Running…" : "Generate full turn"}
              </button>
              <button disabled={isLoading} onClick={() => run("/api/sandbox/probe-lab/visual-experience/full-turn-debug", setDebugResult)} style={buttonStyle}>
                Build request only
              </button>
              <button disabled={isLoading} onClick={() => run("/api/sandbox/probe-lab/visual-experience/resolve-full-turn", setResolveResult)} style={buttonStyle}>
                Resolve scaffold
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button onClick={() => setBody(defaultRequestBody)} style={buttonStyle}>Krebs example</button>
              <button onClick={() => setBody(unclearRequestBody)} style={buttonStyle}>Unclear example</button>
            </div>

            {error ? (
              <pre style={{ margin: 0, color: "#fecaca", background: "rgba(127,29,29,0.34)", padding: 12, borderRadius: 12, whiteSpace: "pre-wrap" }}>{error}</pre>
            ) : null}
          </section>

          <FullTurnSummary result={generateResult ?? resolveResult ?? debugResult} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
          <JsonPanel title="Generate full-turn result" value={generateResult} />
          <JsonPanel title="Build request result" value={debugResult} />
          <JsonPanel title="Resolve scaffold result" value={resolveResult} />
        </div>
      </div>
    </main>
  );
}

export default VisualExperienceLab;

