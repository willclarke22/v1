"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SemanticSceneCanvas } from "../../visual-experience/ui/scene-player/semantic-scene-canvas";
import { prepareSemanticSceneFromTurnResult } from "../../visual-experience/ui/scene-player/semantic-scene-layout";

type JsonRecord = Record<string, unknown>;

type ScriptCue = {
  id: string;
  story_step_id: string;
  moment_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  visual_event_ids: string[];
};

type MomentRange = {
  id: string;
  story_step_id: string;
  start_ms: number;
  end_ms: number;
  director_intent: string;
  success_observation: string;
};

type Timeline = {
  duration_ms: number;
  full_prompt: string;
  script_cues: ScriptCue[];
  moment_ranges: MomentRange[];
  camera_track: unknown[];
  motion_tracks: unknown[];
  capability_warnings: string[];
};

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTimeline(result: unknown): Timeline | null {
  const root = record(result);
  const raw = record(root?.cinematic_timeline);
  if (!raw) return null;

  const scriptCues = array(raw.script_cues).map(record).filter(Boolean).map((cue, index) => ({
    id: text(cue?.id, `cue_${index + 1}`),
    story_step_id: text(cue?.story_step_id),
    moment_id: text(cue?.moment_id),
    text: text(cue?.text),
    start_ms: numberValue(cue?.start_ms),
    end_ms: numberValue(cue?.end_ms),
    visual_event_ids: array(cue?.visual_event_ids).map(String).filter(Boolean),
  }));

  const momentRanges = array(raw.moment_ranges).map(record).filter(Boolean).map((moment, index) => ({
    id: text(moment?.id, `moment_${index + 1}`),
    story_step_id: text(moment?.story_step_id),
    start_ms: numberValue(moment?.start_ms),
    end_ms: numberValue(moment?.end_ms),
    director_intent: text(moment?.director_intent),
    success_observation: text(moment?.success_observation),
  }));

  return {
    duration_ms: Math.max(1, numberValue(raw.duration_ms, 1)),
    full_prompt: text(raw.full_prompt),
    script_cues: scriptCues,
    moment_ranges: momentRanges,
    camera_track: array(raw.camera_track),
    motion_tracks: array(raw.motion_tracks),
    capability_warnings: array(raw.capability_warnings).map(String).filter(Boolean),
  };
}

function findIndexAtTime<T extends { start_ms: number; end_ms: number }>(items: T[], timeMs: number) {
  const exact = items.findIndex((item) => timeMs >= item.start_ms && timeMs < item.end_ms);
  if (exact >= 0) return exact;
  if (!items.length) return 0;
  if (timeMs >= items[items.length - 1]!.end_ms) return items.length - 1;
  return Math.max(0, items.findIndex((item) => item.start_ms > timeMs) - 1);
}

export function ContinuousDirectorPlayer({ result }: { result: unknown }) {
  const timeline = useMemo(() => parseTimeline(result), [result]);
  const [timeMs, setTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const previousRef = useRef<number | null>(null);

  useEffect(() => {
    setTimeMs(0);
    setIsPlaying(false);
    setSelectedEntityId(null);
  }, [result]);

  useEffect(() => {
    if (!isPlaying || !timeline) return;

    const tick = (timestamp: number) => {
      const previous = previousRef.current ?? timestamp;
      const delta = timestamp - previous;
      previousRef.current = timestamp;
      setTimeMs((current) => {
        const next = current + delta;
        if (next >= timeline.duration_ms) {
          setIsPlaying(false);
          previousRef.current = null;
          return timeline.duration_ms;
        }
        return next;
      });
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      previousRef.current = null;
    };
  }, [isPlaying, timeline]);

  if (!timeline) {
    return <div style={emptyStyle}>Render a turn to compile the continuous director timeline.</div>;
  }

  const cueIndex = findIndexAtTime(timeline.script_cues, timeMs);
  const cue = timeline.script_cues[cueIndex] ?? null;
  const momentIndex = findIndexAtTime(timeline.moment_ranges, timeMs);
  const moment = timeline.moment_ranges[momentIndex] ?? null;
  const scene = prepareSemanticSceneFromTurnResult({
    result,
    activeBeatIndex: Math.max(0, momentIndex),
    selectedEntityId,
  });
  const cueProgress = cue ? Math.max(0, Math.min(1, (timeMs - cue.start_ms) / Math.max(1, cue.end_ms - cue.start_ms))) : 1;
  const totalProgress = Math.max(0, Math.min(1, timeMs / timeline.duration_ms));

  return (
    <section style={shellStyle}>
      <div style={topRowStyle}>
        <div>
          <div style={eyebrowStyle}>Continuous director runtime</div>
          <h3 style={{ margin: "4px 0 6px", fontSize: 22 }}>One script, one timeline, one camera story</h3>
          <div style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
            Legacy beats are compatibility ranges only. The master clock controls exact text, active scene state, motion timing, and camera targets.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={primaryButtonStyle} onClick={() => {
            if (timeMs >= timeline.duration_ms) setTimeMs(0);
            setIsPlaying((current) => !current);
          }}>{isPlaying ? "Pause" : "Play continuous story"}</button>
          <button type="button" style={buttonStyle} onClick={() => { setIsPlaying(false); setTimeMs(0); }}>Restart</button>
        </div>
      </div>

      <input
        aria-label="Master timeline"
        type="range"
        min={0}
        max={timeline.duration_ms}
        step={16}
        value={Math.min(timeMs, timeline.duration_ms)}
        onChange={(event) => { setIsPlaying(false); setTimeMs(Number(event.target.value)); }}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.58)", fontSize: 12 }}>
        <span>{(timeMs / 1000).toFixed(1)}s</span>
        <span>{Math.round(totalProgress * 100)}%</span>
        <span>{(timeline.duration_ms / 1000).toFixed(1)}s</span>
      </div>

      {scene ? (
        <SemanticSceneCanvas
          scene={scene}
          selectedEntityId={selectedEntityId}
          onSelectEntity={setSelectedEntityId}
          storyCaption={cue?.text ?? ""}
          storyProgress={cueProgress}
          storyMode
          isPlaying={isPlaying}
        />
      ) : <div style={emptyStyle}>The compatibility scene could not be prepared.</div>}

      <div style={transcriptStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <strong>Exact learner-facing transcript</strong>
          <span style={pillStyle}>word-for-word source of truth</span>
        </div>
        <p style={{ margin: 0, lineHeight: 1.8, fontSize: 16 }}>
          {timeline.script_cues.map((item, index) => (
            <span
              key={item.id}
              style={index === cueIndex ? activeCueStyle : inactiveCueStyle}
              onClick={() => { setIsPlaying(false); setTimeMs(item.start_ms); }}
            >
              {item.text}{index < timeline.script_cues.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <div style={infoStyle}><strong>Current director intent</strong><span>{moment?.director_intent || "No director intent supplied."}</span></div>
        <div style={infoStyle}><strong>Success observation</strong><span>{moment?.success_observation || "No success condition supplied."}</span></div>
        <div style={infoStyle}><strong>Compiled tracks</strong><span>{timeline.motion_tracks.length} motion · {timeline.camera_track.length} camera</span></div>
      </div>

      {timeline.capability_warnings.length ? (
        <div style={warningStyle}><strong>Capability warning:</strong> {timeline.capability_warnings[0]}</div>
      ) : null}
    </section>
  );
}

const shellStyle: CSSProperties = { display: "grid", gap: 14, borderRadius: 24, padding: 16, border: "1px solid rgba(125,211,252,0.22)", background: "linear-gradient(135deg, rgba(14,165,233,0.1), rgba(168,85,247,0.08))" };
const topRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { color: "#7dd3fc", fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" };
const buttonStyle: CSSProperties = { border: "1px solid rgba(255,255,255,0.16)", borderRadius: 12, padding: "9px 12px", background: "rgba(255,255,255,0.08)", color: "white", cursor: "pointer", fontWeight: 800 };
const primaryButtonStyle: CSSProperties = { ...buttonStyle, background: "linear-gradient(135deg, #0284c7, #2563eb)", borderColor: "rgba(125,211,252,0.7)" };
const transcriptStyle: CSSProperties = { display: "grid", gap: 10, padding: 15, borderRadius: 18, background: "rgba(2,6,23,0.72)", border: "1px solid rgba(255,255,255,0.1)" };
const activeCueStyle: CSSProperties = { background: "rgba(125,211,252,0.2)", color: "white", borderRadius: 6, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", padding: "2px 3px", cursor: "pointer" };
const inactiveCueStyle: CSSProperties = { color: "rgba(255,255,255,0.64)", cursor: "pointer" };
const pillStyle: CSSProperties = { borderRadius: 999, padding: "5px 8px", background: "rgba(125,211,252,0.1)", border: "1px solid rgba(125,211,252,0.2)", color: "#bae6fd", fontSize: 12 };
const infoStyle: CSSProperties = { display: "grid", gap: 6, padding: 12, borderRadius: 14, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.1)", lineHeight: 1.45, color: "rgba(255,255,255,0.72)" };
const warningStyle: CSSProperties = { borderRadius: 14, padding: 12, background: "rgba(120,53,15,0.34)", border: "1px solid rgba(251,191,36,0.22)", color: "rgba(255,255,255,0.8)", lineHeight: 1.5 };
const emptyStyle: CSSProperties = { minHeight: 300, borderRadius: 18, border: "1px dashed rgba(255,255,255,0.18)", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.55)", padding: 24, textAlign: "center" };
