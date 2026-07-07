"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { prepareSemanticSceneFromTurnResult } from "./semantic-scene-layout";
import { SemanticSceneCanvas } from "./semantic-scene-canvas";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function getRecord(root: unknown, key: string): Record<string, unknown> | null {
  const record = asRecord(root);
  return record ? asRecord(record[key]) : null;
}

function getOutput(result: unknown) {
  return getRecord(result, "output");
}

function getBeats(result: unknown) {
  const output = getOutput(result);
  const visualExperience = getRecord(output, "visual_experience");
  const scenePlan = getRecord(visualExperience, "semantic_scene_plan");
  return asArray(scenePlan?.beats);
}

function getProbeOptions(result: unknown) {
  const output = getOutput(result);
  const followupProbe = getRecord(output, "followup_probe");
  const rendererParams = getRecord(followupProbe, "renderer_params");
  return asArray(rendererParams?.options);
}

function getProbePrompt(result: unknown) {
  const output = getOutput(result);
  const followupProbe = getRecord(output, "followup_probe");
  const prompt = getRecord(followupProbe, "prompt");
  return text(prompt?.full_prompt, text(prompt?.task, ""));
}

function getAnswerKey(result: unknown) {
  const output = getOutput(result);
  const followupProbe = getRecord(output, "followup_probe");
  return getRecord(followupProbe, "answer_key");
}

function getGuidedInteraction(result: unknown) {
  const output = getOutput(result);
  return getRecord(output, "guided_interaction");
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

export function SemanticScenePlayer({ result }: { result: unknown }) {
  const beats = getBeats(result);
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const scene = useMemo(
    () => prepareSemanticSceneFromTurnResult({ result, activeBeatIndex }),
    [result, activeBeatIndex],
  );
  const guidedInteraction = getGuidedInteraction(result);
  const probeOptions = getProbeOptions(result);
  const answerKey = getAnswerKey(result);
  const correctOptionId = text(answerKey?.correct_option_id, "");

  if (!scene) {
    return (
      <section
        style={{
          borderRadius: 22,
          padding: 18,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "rgba(255,255,255,0.68)",
        }}
      >
        Generate a valid proceed turn to preview the semantic scene.
      </section>
    );
  }

  return (
    <section
      style={{
        display: "grid",
        gap: 16,
        borderRadius: 24,
        padding: 16,
        background: "linear-gradient(135deg, rgba(14,165,233,0.12), rgba(168,85,247,0.1))",
        border: "1px solid rgba(125,211,252,0.22)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: "0 0 6px", fontSize: "1.25rem" }}>Primitive semantic scene</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill>{scene.title}</Pill>
            <Pill>beat {scene.active_beat_index + 1}/{Math.max(1, beats.length)}</Pill>
            <Pill>{scene.entities.length} entities</Pill>
            <Pill>{scene.relationships.length} relationships</Pill>
          </div>
        </div>
      </div>

      <SemanticSceneCanvas scene={scene} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(260px, 0.65fr)",
          gap: 14,
          alignItems: "start",
        }}
      >
        <section style={{ display: "grid", gap: 12 }}>
          <div style={{ borderRadius: 18, padding: 14, background: "rgba(2,6,23,0.46)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <h4 style={{ margin: "0 0 8px" }}>{scene.active_beat?.title ?? "Scene"}</h4>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.84)", lineHeight: 1.65 }}>{scene.orientation_text || scene.target_takeaway}</p>
          </div>

          {scene.actions.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {scene.actions.map((action) => (
                <div key={action.id} style={{ borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <Pill>{action.type}</Pill>
                  <p style={{ margin: "8px 0 0", lineHeight: 1.55, color: "rgba(255,255,255,0.76)" }}>{action.narration ?? action.target_entity_id}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section style={{ display: "grid", gap: 10 }}>
          <h4 style={{ margin: 0 }}>Beat scrubber</h4>
          <div style={{ display: "grid", gap: 8 }}>
            {beats.map((beat, index) => {
              const record = asRecord(beat);
              const isActive = index === scene.active_beat_index;
              return (
                <button
                  key={text(record?.id, String(index))}
                  type="button"
                  onClick={() => setActiveBeatIndex(index)}
                  style={{
                    border: isActive ? "1px solid rgba(125,211,252,0.78)" : "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 12,
                    textAlign: "left",
                    color: "white",
                    background: isActive ? "rgba(14,165,233,0.22)" : "rgba(255,255,255,0.055)",
                    cursor: "pointer",
                  }}
                >
                  <strong>{index + 1}. {text(record?.title, `Beat ${index + 1}`)}</strong>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div style={{ borderRadius: 18, padding: 14, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
        <h4 style={{ margin: "0 0 8px" }}>Guided interaction</h4>
        <p style={{ margin: "0 0 8px", lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }}>{text(guidedInteraction?.instruction, "Explore the scene and explain what changes from beat to beat.")}</p>
        <Pill>{text(guidedInteraction?.required_action_type, "scrub_beats")}</Pill>
      </div>

      <div style={{ borderRadius: 18, padding: 14, background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.22)" }}>
        <h4 style={{ margin: "0 0 8px" }}>Follow-up probe preview</h4>
        <p style={{ margin: "0 0 12px", lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }}>{getProbePrompt(result) || "The follow-up probe appears here after generation."}</p>
        {probeOptions.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {probeOptions.map((option, index) => {
              const item = asRecord(option);
              const id = text(item?.id, String(index));
              const isCorrect = correctOptionId && id === correctOptionId;
              return (
                <div key={id} style={{ borderRadius: 14, padding: 12, background: isCorrect ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.055)", border: isCorrect ? "1px solid rgba(34,197,94,0.26)" : "1px solid rgba(255,255,255,0.1)" }}>
                  <strong>{text(item?.label, String.fromCharCode(65 + index))}.</strong> {text(item?.text, "")}
                  {isCorrect ? <span style={{ marginLeft: 8, color: "#bbf7d0" }}>correct</span> : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
