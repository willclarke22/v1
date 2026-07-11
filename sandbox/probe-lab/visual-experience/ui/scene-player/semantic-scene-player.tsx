"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { getSemanticSceneTimelineBeats, prepareSemanticSceneFromTurnResult } from "./semantic-scene-layout";
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
  return getSemanticSceneTimelineBeats(result);
}

function splitWords(value: string): string[] {
  return value.trim().match(/\S+/g) ?? [];
}

function wordDelayMs(word: string) {
  const cleaned = word.replace(/[^\p{L}\p{N}]/gu, "");
  let delay = 180 + Math.min(260, cleaned.length * 22);

  if (/[,.]$/.test(word)) delay += 180;
  if (/[!?;:]$/.test(word)) delay += 320;
  if (cleaned.length <= 2) delay -= 50;
  if (cleaned.length >= 9) delay += 110;

  return Math.max(110, delay);
}

function chunkWordsForCaption(value: string, maxWordsOnScreen = 5) {
  const words = splitWords(value);
  const maxWords = Math.max(3, Math.min(8, Math.round(maxWordsOnScreen || 5)));
  const chunks: string[] = [];

  for (let index = 0; index < words.length;) {
    let end = Math.min(words.length, index + maxWords);
    for (let cursor = index + 2; cursor < end; cursor += 1) {
      if (/[,.!?;:]$/.test(words[cursor] ?? "")) {
        end = cursor + 1;
        break;
      }
    }
    chunks.push(words.slice(index, end).join(" "));
    index = end;
  }

  return chunks;
}

function chunkDelayMs(chunk: string) {
  const words = splitWords(chunk);
  const delay = words.reduce<number>((sum, word) => sum + wordDelayMs(word), 0);
  return Math.max(850, Math.min(2400, delay));
}

function useSpokenCaptionStream(value: string, enabled: boolean, resetKey: unknown, maxWordsOnScreen = 5) {
  const chunks = useMemo(() => chunkWordsForCaption(value, maxWordsOnScreen), [value, maxWordsOnScreen]);
  const [chunkIndex, setChunkIndex] = useState(0);

  useEffect(() => {
    setChunkIndex(0);
  }, [enabled, value, resetKey, maxWordsOnScreen]);

  useEffect(() => {
    if (!enabled || !chunks.length) return;
    if (chunkIndex >= chunks.length - 1) return;

    const timer = window.setTimeout(() => {
      setChunkIndex((current) => Math.min(chunks.length - 1, current + 1));
    }, chunkDelayMs(chunks[chunkIndex] ?? ""));

    return () => window.clearTimeout(timer);
  }, [chunks, chunkIndex, enabled, resetKey, value]);

  return {
    caption: chunks[chunkIndex] ?? "",
    progress: chunks.length ? (chunkIndex + 1) / chunks.length : 1,
    done: chunks.length > 0 && chunkIndex >= chunks.length - 1,
  };
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

function buttonStyle(active = false): CSSProperties {
  return {
    border: active ? "1px solid rgba(125,211,252,0.78)" : "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 12,
    textAlign: "left",
    color: "white",
    background: active ? "rgba(14,165,233,0.22)" : "rgba(255,255,255,0.055)",
    cursor: "pointer",
  };
}

function modeButtonStyle(active = false): CSSProperties {
  return {
    border: active ? "1px solid rgba(125,211,252,0.72)" : "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999,
    padding: "8px 12px",
    color: "white",
    background: active ? "rgba(14,165,233,0.26)" : "rgba(255,255,255,0.08)",
    cursor: "pointer",
    fontWeight: 800,
  };
}

export function SemanticScenePlayer({ result }: { result: unknown }) {
  const beats = getBeats(result);
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<"story" | "inspect">("story");
  const scene = useMemo(
    () => prepareSemanticSceneFromTurnResult({ result, activeBeatIndex, selectedEntityId }),
    [result, activeBeatIndex, selectedEntityId],
  );
  const storyText =
    scene?.cinematic_caption_text ||
    scene?.active_narration_text ||
    scene?.orientation_text ||
    scene?.target_takeaway ||
    "";
  const captionPolicy = asRecord(scene?.caption_policy);
  const streamedCaption = useSpokenCaptionStream(
    storyText,
    mode === "story" && isPlaying,
    scene?.active_beat?.id ?? activeBeatIndex,
    Number(captionPolicy?.max_words_on_screen ?? 5),
  );

  useEffect(() => {
    setActiveBeatIndex(0);
    setSelectedEntityId(null);
    setIsPlaying(false);
    setMode("story");
  }, [result]);

  useEffect(() => {
    if (!isPlaying || beats.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveBeatIndex((current) => {
        if (current + 1 >= beats.length) {
          setIsPlaying(false);
          setMode("inspect");
          return current;
        }

        return current + 1;
      });
    }, 5200);

    return () => window.clearInterval(timer);
  }, [beats.length, isPlaying]);

  useEffect(() => {
    if (!scene || selectedEntityId) return;

    const firstTarget = scene.actions.find((action) => action.target_entity_id)?.target_entity_id;
    const firstActive = scene.active_beat?.active_entity_ids[0];
    setSelectedEntityId(firstTarget ?? firstActive ?? scene.entities[0]?.id ?? null);
  }, [scene, selectedEntityId]);

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

  const selectedEntity = scene.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const inspectionRelationships = selectedEntity
    ? scene.relationships.filter(
        (relationship) =>
          relationship.source_entity_id === selectedEntity.id ||
          relationship.target_entity_ids.includes(selectedEntity.id),
      )
    : [];

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
          <h3 style={{ margin: "0 0 6px", fontSize: "1.25rem" }}>Directed visual story</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill>{scene.title}</Pill>
            <Pill>beat {scene.active_beat_index + 1}/{Math.max(1, beats.length)}</Pill>
            <Pill>{scene.entities.length} entities</Pill>
            <Pill>{scene.relationships.length} relationships</Pill>
            <Pill>{mode === "story" ? "story mode" : "inspect mode"}</Pill>
            <Pill>directed-scene compiler</Pill>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              setMode("story");
              setIsPlaying((value) => !value);
            }}
            style={modeButtonStyle(isPlaying)}
          >
            {isPlaying ? "Pause story" : "Play story"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("story");
              setIsPlaying(false);
              setActiveBeatIndex((current) => (current + 1 >= beats.length ? 0 : current + 1));
            }}
            style={modeButtonStyle(false)}
          >
            Next beat
          </button>
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setMode((value) => (value === "story" ? "inspect" : "story"));
            }}
            style={modeButtonStyle(mode === "inspect")}
          >
            {mode === "inspect" ? "Back to story" : "Inspect objects"}
          </button>
        </div>
      </div>

      <SemanticSceneCanvas
        scene={scene}
        selectedEntityId={selectedEntityId}
        onSelectEntity={(entityId) => {
          setSelectedEntityId(entityId);
          if (entityId) {
            setIsPlaying(false);
            setMode("inspect");
          }
        }}
        storyCaption={mode === "story" ? (isPlaying ? streamedCaption.caption : "") : ""}
        storyProgress={streamedCaption.progress}
        storyMode={mode === "story"}
        isPlaying={isPlaying}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(300px, 0.9fr)",
          gap: 14,
          alignItems: "start",
        }}
      >
        <section style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              borderRadius: 18,
              padding: 14,
              background: "rgba(2,6,23,0.46)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <h4 style={{ margin: 0 }}>{scene.active_beat?.title ?? "Scene"}</h4>
              </div>
              {scene.scene_concept ? (
                <p style={{ margin: 0, lineHeight: 1.55, color: "rgba(125,211,252,0.92)" }}>{scene.scene_concept}</p>
              ) : null}
              <p style={{ margin: 0, color: "rgba(255,255,255,0.84)", lineHeight: 1.65 }}>{storyText}</p>
              {scene.director_intent ? (
                <p style={{ margin: 0, color: "rgba(255,255,255,0.62)", lineHeight: 1.55 }}>
                  <strong style={{ color: "rgba(255,255,255,0.8)" }}>Director intent:</strong> {scene.director_intent}
                </p>
              ) : null}
              {scene.faithfulness_warnings.length ? (
                <div style={{ borderRadius: 14, padding: 10, background: "rgba(120,53,15,0.32)", border: "1px solid rgba(251,191,36,0.2)", color: "rgba(255,255,255,0.76)", lineHeight: 1.45 }}>
                  <strong style={{ color: "rgba(253,230,138,0.92)" }}>Compiler warning:</strong> {scene.faithfulness_warnings[0]}
                </div>
              ) : null}
            </div>
          </div>

          {mode === "inspect" && scene.actions.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {scene.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => action.target_entity_id && setSelectedEntityId(action.target_entity_id)}
                  style={{
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(255,255,255,0.055)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "white",
                    textAlign: "left",
                    cursor: action.target_entity_id ? "pointer" : "default",
                  }}
                >
                  <Pill>{action.type}</Pill>
                  <p style={{ margin: "8px 0 0", lineHeight: 1.55, color: "rgba(255,255,255,0.76)" }}>
                    {action.narration ?? action.target_entity_id}
                  </p>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section style={{ display: "grid", gap: 12 }}>
          {mode === "inspect" ? (
            <div style={{ borderRadius: 18, padding: 14, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <h4 style={{ margin: "0 0 8px" }}>Inspect the scene</h4>
              {selectedEntity ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Pill>{selectedEntity.render_role}</Pill>
                    {selectedEntity.render_kind !== selectedEntity.render_role ? <Pill>{selectedEntity.render_kind}</Pill> : null}
                    {selectedEntity.is_active ? <Pill>active in this beat</Pill> : null}
                  </div>
                  <strong>{selectedEntity.display_name}</strong>
                  <p style={{ margin: 0, lineHeight: 1.55, color: "rgba(255,255,255,0.78)" }}>{selectedEntity.semantic_role}</p>
                  <p style={{ margin: 0, lineHeight: 1.55, color: "rgba(255,255,255,0.62)" }}>{selectedEntity.visual_need?.description}</p>
                  {inspectionRelationships.length ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      {inspectionRelationships.slice(0, 3).map((relationship) => (
                        <div key={relationship.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
                          <Pill>{relationship.relationship_type}</Pill>
                          <p style={{ margin: "6px 0 0", lineHeight: 1.45, color: "rgba(255,255,255,0.66)" }}>{relationship.explanation}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p style={{ margin: 0, lineHeight: 1.55, color: "rgba(255,255,255,0.72)" }}>
                  Click an object in the 3D scene to inspect what it means.
                </p>
              )}
            </div>
          ) : (
            <div style={{ borderRadius: 18, padding: 14, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <h4 style={{ margin: "0 0 8px" }}>Watch first</h4>
              <p style={{ margin: 0, lineHeight: 1.6, color: "rgba(255,255,255,0.74)" }}>
                The scene should teach through motion before the learner needs to click around. After the story plays, switch to inspect mode and click the objects that matter.
              </p>
            </div>
          )}

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
                    onClick={() => {
                      setIsPlaying(false);
                      setMode("story");
                      setActiveBeatIndex(index);
                    }}
                    style={buttonStyle(isActive)}
                  >
                    <strong>
                      {index + 1}. {text(record?.title, `Beat ${index + 1}`)}
                    </strong>
                  </button>
                );
              })}
            </div>
          </section>
        </section>
      </div>
    </section>
  );
}
