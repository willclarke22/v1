"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { SemanticScenePlayer } from "./scene-player";
import { getSemanticSceneTimelineBeats, prepareSemanticSceneFromTurnResult } from "./scene-player/semantic-scene-layout";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

type RequestBody = {
  provider: "scaffold" | "deepseek" | "openai";
  learner_message: string;
  topic_label: string;
  user_interests: string;
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
  user_interests: "",
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

const jsonPreStyle: CSSProperties = {
  margin: 0,
  maxHeight: 720,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "rgba(226,232,240,0.9)",
  fontSize: 12,
  lineHeight: 1.5,
  background: "rgba(2,6,23,0.64)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 14,
  padding: 14,
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

function parseUserInterests(value: string) {
  return value
    .split(/[,;\n]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "grid", gap: 8, color: "rgba(255,255,255,0.78)", fontSize: 13 }}>
      <span>{label}</span>
      {children}
      {hint ? <span style={{ color: "rgba(255,255,255,0.48)", fontSize: 12, lineHeight: 1.45 }}>{hint}</span> : null}
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

function InfoBlock({ title, value, subvalue }: { title: string; value: string; subvalue?: string }) {
  return (
    <div style={{ borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 12, marginBottom: 6 }}>{title}</div>
      <strong>{value}</strong>
      {subvalue ? <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 1.5, margin: "8px 0 0" }}>{subvalue}</p> : null}
    </div>
  );
}

function JsonInspectionPanel({ title, description, value }: { title: string; description: string; value: JsonValue | undefined }) {
  return (
    <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
      <div>
        <h3 style={{ margin: "0 0 0.35rem" }}>{title}</h3>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.62)", lineHeight: 1.5 }}>{description}</p>
      </div>
      <pre style={jsonPreStyle}>{JSON.stringify(value ?? null, null, 2)}</pre>
    </section>
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

function buildModelStoryJson(result: JsonValue | undefined): JsonValue {
  const root = asRecord(result);
  if (!root) return null;

  const modelOutput =
    asRecord(root.semantic_draft_output) ??
    asRecord(root.parsed_output) ??
    asRecord(root.assembled_output) ??
    asRecord(root.normalized_output) ??
    asRecord(root.output);

  const scene = getRecord(modelOutput, "scene") ?? getRecord(getRecord(modelOutput, "visual_experience"), "semantic_scene_plan");
  const visualExperience = getRecord(modelOutput, "visual_experience");

  return {
    source:
      root.semantic_draft_output ? "semantic_draft_output"
      : root.parsed_output ? "parsed_output"
      : root.assembled_output ? "assembled_output"
      : root.normalized_output ? "normalized_output"
      : "output",
    learning_focus: getRecord(modelOutput, "learning_focus"),
    orientation_segments: getArray(modelOutput, "orientation_segments").length
      ? getArray(modelOutput, "orientation_segments")
      : getArray(visualExperience, "orientation_segments"),
    scene: {
      title: scene?.title ?? null,
      directed_scene: getRecord(scene, "directed_scene"),
      story_beats: getArray(scene, "story_beats"),
      entities: getArray(scene, "entities"),
      relationships: getArray(scene, "relationships"),
      executable_beats: getArray(scene, "beats"),
      camera_notes: scene?.camera_notes ?? null,
      interaction_notes: scene?.interaction_notes ?? null,
    },
    guided_interaction: getRecord(modelOutput, "guided_interaction"),
    probe: getRecord(modelOutput, "probe") ?? getRecord(modelOutput, "followup_probe"),
    personalization_hypotheses: getArray(modelOutput, "personalization_hypotheses"),
    confidence: getRecord(modelOutput, "confidence"),
  };
}

function buildRendererInspectionJson(result: JsonValue | undefined): JsonValue {
  const root = asRecord(result);
  if (!root) return null;

  const output = asRecord(root.output);
  const input = asRecord(root.input);
  const resolved = asRecord(root.resolved);
  const visualExperience = getRecord(output, "visual_experience");
  const scenePlan = getRecord(visualExperience, "semantic_scene_plan");
  const timelineBeats = getSemanticSceneTimelineBeats(result);

  const prepared_by_beat = timelineBeats.map((_, index) => {
    const prepared = prepareSemanticSceneFromTurnResult({ result, activeBeatIndex: index, selectedEntityId: null });
    if (!prepared) return null;

    return {
      beat_index: index + 1,
      active_beat_id: prepared.active_beat?.id ?? null,
      active_beat_title_internal: prepared.active_beat?.title ?? null,
      render_plan_kind: prepared.render_plan.kind,
      spatial_constraints: prepared.render_plan.spatial_constraints,
      motion_tracks: prepared.render_plan.motion_tracks,
      camera_tracks: prepared.render_plan.camera_tracks,
      entity_geometry: prepared.render_plan.entity_geometry,
      faithfulness_warnings: prepared.faithfulness_warnings,
      story_focus_entity_id: prepared.story_focus_entity_id,
      active_narration_text: prepared.active_narration_text,
      director_intent: prepared.director_intent,
      camera: prepared.camera,
      directed_story_beat: prepared.directed_story_beat,
      actions: prepared.actions,
      entities: prepared.entities.map((entity) => ({
        id: entity.id,
        display_name: entity.display_name,
        position: entity.position,
        render_kind: entity.render_kind,
        render_role: entity.render_role,
        scale: entity.scale,
        is_active: entity.is_active,
        is_action_target: entity.is_action_target,
        should_show_label: entity.should_show_label,
        action_types: entity.action_types,
        event_types: entity.event_types,
        motion_tracks: entity.motion_tracks,
        connector_from_id: entity.connector_from_id,
        connector_to_id: entity.connector_to_id,
        geometry_evidence: entity.geometry_evidence,
      })),
    };
  }).filter(Boolean);

  const allWarnings = Array.from(
    new Set(
      prepared_by_beat
        .flatMap((item) => asArray(asRecord(item)?.faithfulness_warnings))
        .map(String)
        .filter(Boolean),
    ),
  );

  const personalizationContext = getRecord(input, "personalization_context");

  return {
    request_body: root.request_body ?? null,
    personalization_context: {
      bridge_level: personalizationContext?.bridge_level ?? null,
      jargon_level: getRecord(personalizationContext, "language_policy")?.jargon_level ?? null,
      preferred_style: personalizationContext?.preferred_style ?? null,
      user_interests: personalizationContext?.user_interests ?? [],
      profile_snapshot: personalizationContext?.profile_snapshot ?? null,
    },
    timeline: {
      beat_count: timelineBeats.length,
      beat_ids: timelineBeats.map((beat) => beat.id),
    },
    faithfulness_warnings: allWarnings,
    prepared_by_beat,
    resolved: {
      render_bindings: getArray(resolved, "render_bindings"),
      validation: getRecord(resolved, "validation"),
      queued_asset_needs: getArray(resolved, "queued_asset_needs"),
    },
    final_scene_plan_sent_to_scene_player: scenePlan,
  };
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
        <h2 style={{ margin: 0 }}>Interactive visual scene</h2>
        <p style={{ color: "rgba(255,255,255,0.68)", lineHeight: 1.6 }}>
          Generate a full turn to see the learner-facing scene. Detailed model/render inspection now lives in the two JSON panels below.
        </p>
      </section>
    );
  }

  return (
    <section style={{ ...cardStyle, display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 8px" }}>Interactive visual scene</h2>
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
          {normalizationNotes.length || fatalErrors.length || validationWarnings.length ? (
            <pre style={{ ...jsonPreStyle, maxHeight: 220 }}>
              {JSON.stringify({ normalization_notes: normalizationNotes, fatal_errors: fatalErrors, validation_warnings: validationWarnings }, null, 2)}
            </pre>
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
        </>
      ) : null}
    </section>
  );
}

export function VisualExperienceLab() {
  const [body, setBody] = useState<RequestBody>(defaultRequestBody);
  const [debugResult, setDebugResult] = useState<JsonValue | undefined>();
  const [resolveResult, setResolveResult] = useState<JsonValue | undefined>();
  const [generateResult, setGenerateResult] = useState<JsonValue | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPayload = useMemo(
    () => ({
      ...body,
      user_interests: parseUserInterests(body.user_interests),
    }),
    [body],
  );
  const activeResult = generateResult ?? resolveResult ?? debugResult;
  const modelStoryJson = useMemo(() => buildModelStoryJson(activeResult), [activeResult]);
  const rendererJson = useMemo(() => buildRendererInspectionJson(activeResult), [activeResult]);

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
          <Pill>Visual Experience · Step 8e clean inspection UI</Pill>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 4.2rem)", letterSpacing: -1.5 }}>
            Interactive directed-scene lab
          </h1>
          <p style={{ maxWidth: 980, margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.7 }}>
            Generate a model-directed visual learning scene, play the interactive renderer, then compare the model JSON against the MyWay renderer JSON.
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

            <Field
              label="User interests / example domains"
              hint="Comma- or line-separated. Example: cars, hockey, cooking, Minecraft, music production, animation, plumbing, biology"
            >
              <textarea
                value={body.user_interests}
                onChange={(event) => setBody((current) => ({ ...current, user_interests: event.target.value }))}
                rows={3}
                placeholder="cars, animation, mechanical systems"
                style={{ ...inputStyle, resize: "vertical" }}
              />
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

          <FullTurnSummary result={activeResult} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 }}>
          <JsonInspectionPanel
            title="Model story + directed scene JSON"
            description="The model-created teaching JSON: learning focus, orientation, directed scene, story beats, probe, and tentative personalization hypotheses."
            value={modelStoryJson}
          />
          <JsonInspectionPanel
            title="MyWay renderer execution JSON"
            description="The MyWay-side renderer JSON: request context, compiled timeline, constraints, motion/camera tracks, geometry, warnings, validation, and final scene plan."
            value={rendererJson}
          />
        </div>
      </div>
    </main>
  );
}

export default VisualExperienceLab;
