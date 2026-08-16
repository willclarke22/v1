"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { BURGER_ASSEMBLY_BENCHMARK } from "../benchmark-burger-assembly";
import type {
  CinematicCastSlot,
  CinematicShot,
} from "../cinematic-production-contract";
import {
  CinematicProductionRuntimeCanvas,
  type CinematicLibraryAssetRecord,
} from "./cinematic-production-runtime-canvas";
import {
  CINEMATIC_BURGER_TIMELINE_DURATION_S,
  cinematicShotIdAtTime,
  cinematicShotStartTime,
} from "./cinematic-production-runtime-layout";

type LibraryResponse = {
  ok?: boolean;
  error?: string;
  assets?: CinematicLibraryAssetRecord[];
};

type CastSelectionMap = Record<string, string>;

type CastMatch = {
  slot: CinematicCastSlot;
  autoAssetId: string | null;
};

const executionLabels: Record<CinematicShot["execution_lane"], string> = {
  browser_rigid_runtime: "Browser runtime",
  prepared_controller: "Prepared controller",
  skeletal_animation: "Rig / animation",
  blender_procedural: "Blender procedural",
  blender_simulation: "Blender simulation",
  composited_graphics: "Composited graphics",
};

const statusLabels: Record<CinematicShot["status"], string> = {
  benchmark_defined: "Benchmark defined",
  storyboard_ready: "Storyboard ready",
  animatic_ready: "Animatic ready",
  production_blocked: "Production blocked",
  production_ready: "Production ready",
};

const bridgeLinks = [
  ["Director", "/sandbox/probe-lab/director-capability-library", "camera + motion grammar"],
  ["Directability", "/sandbox/probe-lab/directable-assets", "asset + pair qualification"],
  ["Asset Library", "/sandbox/probe-lab/asset-library", "casting + source assets"],
  ["Scene Builder", "/sandbox/probe-lab/primitive-builder", "placement + physical staging"],
  ["Blender Foundry", "/sandbox/probe-lab/blender-python-builder", "hero assets + complex shots"],
] as const;

function assetLabel(asset: CinematicLibraryAssetRecord | null) {
  return asset?.display_name || asset?.canonical_label || asset?.asset_id || "Unknown asset";
}

function searchableText(asset: CinematicLibraryAssetRecord) {
  return [
    asset.asset_id,
    asset.display_name,
    asset.canonical_label,
    ...(asset.aliases ?? []),
    ...(asset.semantic_tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function assetImagePath(asset: CinematicLibraryAssetRecord | null) {
  if (!asset) return null;
  return asset.thumbnail_path || null;
}

function scoreAssetForSlot(
  asset: CinematicLibraryAssetRecord,
  slot: CinematicCastSlot,
) {
  const haystack = searchableText(asset);
  let score = 0;
  if (
    slot.preferred_asset_id &&
    asset.asset_id === slot.preferred_asset_id
  ) {
    score += 1000;
  }
  for (const term of slot.search_terms) {
    if (haystack.includes(term.toLowerCase())) score += 30;
  }
  if (slot.concept && haystack.includes(slot.concept.toLowerCase())) {
    score += 40;
  }
  if (asset.scene_review_status === "approved") score += 5;
  return score;
}

export function CinematicProductionLab() {
  const benchmark = BURGER_ASSEMBLY_BENCHMARK;
  const [playbackTimeS, setPlaybackTimeS] = useState(0);
  const [seekRequest, setSeekRequest] = useState({ timeS: 0, revision: 0 });
  const [assets, setAssets] = useState<CinematicLibraryAssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [castSelections, setCastSelections] = useState<CastSelectionMap>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [showWorkbenchDetails, setShowWorkbenchDetails] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      try {
        setLoadingAssets(true);
        setAssetError(null);
        const response = await fetch(
          "/api/sandbox/probe-lab/assets/library",
          { cache: "no-store" },
        );
        const payload = (await response.json()) as LibraryResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error || "Asset Library request failed.",
          );
        }
        if (cancelled) return;
        const nextAssets = [...(payload.assets ?? [])].sort((a, b) =>
          assetLabel(a).localeCompare(assetLabel(b)),
        );
        setAssets(nextAssets);
      } catch (caught) {
        if (!cancelled) {
          setAssetError(
            caught instanceof Error ? caught.message : String(caught),
          );
        }
      } finally {
        if (!cancelled) setLoadingAssets(false);
      }
    }

    void loadAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  const castMatches = useMemo<CastMatch[]>(() => {
    return benchmark.cast_slots.map((slot) => {
      const scored = assets
        .map((asset) => ({ asset, score: scoreAssetForSlot(asset, slot) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);
      return {
        slot,
        autoAssetId: scored[0]?.asset.asset_id ?? null,
      };
    });
  }, [assets, benchmark.cast_slots]);

  useEffect(() => {
    if (!castMatches.length) return;
    setCastSelections((current) => {
      const next = { ...current };
      let changed = false;
      for (const match of castMatches) {
        if (!next[match.slot.id] && match.autoAssetId) {
          next[match.slot.id] = match.autoAssetId;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [castMatches]);

  const requestSeek = useCallback((timeS: number) => {
    const clamped = Math.max(
      0,
      Math.min(CINEMATIC_BURGER_TIMELINE_DURATION_S, timeS),
    );
    setPlaybackTimeS(clamped);
    setSeekRequest((current) => ({
      timeS: clamped,
      revision: current.revision + 1,
    }));
  }, []);

  const handleRuntimeTime = useCallback((timeS: number) => {
    setPlaybackTimeS(timeS);
  }, []);

  const handleRuntimeEnded = useCallback(() => {
    setPlaybackTimeS(CINEMATIC_BURGER_TIMELINE_DURATION_S);
    setIsPlaying(false);
    setInspectMode(true);
  }, []);

  const selectedShotId = cinematicShotIdAtTime(playbackTimeS);
  const selectedShot = useMemo(
    () =>
      benchmark.shots.find((shot) => shot.id === selectedShotId) ??
      benchmark.shots[0],
    [benchmark.shots, selectedShotId],
  );

  const blockedCount = benchmark.shots.filter(
    (shot) => shot.status === "production_blocked",
  ).length;
  const readyCount = benchmark.shots.filter(
    (shot) => shot.status === "production_ready",
  ).length;

  const selectedAssets = useMemo(() => {
    return Object.fromEntries(
      benchmark.cast_slots.map((slot) => [
        slot.id,
        assets.find((asset) => asset.asset_id === castSelections[slot.id]) ??
          null,
      ]),
    ) as Record<string, CinematicLibraryAssetRecord | null>;
  }, [assets, benchmark.cast_slots, castSelections]);

  if (!selectedShot) return null;

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ display: "grid", gap: 8 }}>
          <span style={eyebrowStyle}>MyWay · Cinematic Production · CP.1D</span>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(2rem, 4vw, 3.35rem)",
              letterSpacing: "-0.035em",
            }}
          >
            Burger Cinematic Preview
          </h1>
          <p
            style={{
              ...mutedStyle,
              maxWidth: 940,
              fontSize: 15,
              lineHeight: 1.65,
            }}
          >
            Benchmark first, generalize second. CP.1D keeps the continuous cinematic preview, but this pass starts making it MyWay-specific: apple on the left, burger in the middle, nigiri on the right, better surface-aware staging, and an inspectable 3D scene after playback.
          </p>
        </header>

        <section style={benchmarkHeaderStyle}>
          <div style={{ display: "grid", gap: 8 }}>
            <span style={eyebrowStyle}>Golden benchmark</span>
            <strong style={{ fontSize: 22 }}>{benchmark.title}</strong>
            <span style={mutedStyle}>{benchmark.subtitle}</span>
          </div>
          <div style={benchmarkStatsStyle}>
            <strong>{benchmark.duration_target_s}s</strong>
            <span>target</span>
            <strong>{benchmark.shots.length}</strong>
            <span>shots</span>
            <strong>{readyCount}</strong>
            <span>ready</span>
            <strong>{blockedCount}</strong>
            <span>blocked</span>
          </div>
        </section>

        <section style={workspaceStyle}>
          <div style={viewerColumnStyle}>
            <div style={viewerHeaderStyle}>
              <div style={{ display: "grid", gap: 4 }}>
                <span style={eyebrowStyle}>WebGL 3D pane</span>
                <strong>Approximate the video&apos;s camera grammar, entrances, and pacing on one continuous timeline.</strong>
              </div>
              <div style={cameraModePillStyle}>
                wide preview · demand-rendered · moving camera + actors · inspect after playback
              </div>
            </div>

            <CinematicProductionRuntimeCanvas
              selectedAssets={selectedAssets}
              isPlaying={isPlaying}
              seekRequest={seekRequest}
              inspectMode={inspectMode}
              onPlaybackTime={handleRuntimeTime}
              onPlaybackEnded={handleRuntimeEnded}
            />

            <div style={controlsRowStyle}>
              <button
                type="button"
                onClick={() => {
                  if (!isPlaying && playbackTimeS >= CINEMATIC_BURGER_TIMELINE_DURATION_S) {
                    requestSeek(0);
                  }
                  setInspectMode(false);
                  setIsPlaying((value) => !value);
                }}
                style={primaryButtonStyle}
              >
                {isPlaying ? "Pause benchmark" : playbackTimeS >= CINEMATIC_BURGER_TIMELINE_DURATION_S ? "Replay benchmark" : "Play benchmark"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setInspectMode(false);
                  requestSeek(0);
                }}
                style={secondaryButtonStyle}
              >
                Reset to shot 01
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setInspectMode((value) => !value);
                }}
                style={secondaryButtonStyle}
              >
                {inspectMode ? "Exit inspect mode" : "Inspect scene"}
              </button>
              <span style={mutedStyle}>
                When paused or finished, inspect mode lets you rotate the stage and check clearances, surfaces, and framing.
              </span>
            </div>

            <div style={scrubberRowStyle}>
              <span style={timecodeStyle}>{playbackTimeS.toFixed(1)}s</span>
              <input
                aria-label="Cinematic benchmark timeline"
                type="range"
                min={0}
                max={CINEMATIC_BURGER_TIMELINE_DURATION_S}
                step={0.01}
                value={playbackTimeS}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setIsPlaying(false);
                  setInspectMode(false);
                  requestSeek(next);
                }}
                style={{ flex: 1, minWidth: 220 }}
              />
              <span style={timecodeStyle}>{CINEMATIC_BURGER_TIMELINE_DURATION_S.toFixed(1)}s</span>
            </div>

            <div style={timelineStyle}>
              {benchmark.shots.map((shot) => (
                <button
                  key={shot.id}
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setInspectMode(false);
                    const seekTime = cinematicShotStartTime(shot.id);
                    requestSeek(seekTime);
                  }}
                  style={{
                    ...shotButtonStyle,
                    borderColor:
                      shot.id === selectedShot.id
                        ? "#67e8f9"
                        : "rgba(255,255,255,.1)",
                    background:
                      shot.id === selectedShot.id
                        ? "rgba(34,211,238,.1)"
                        : "rgba(255,255,255,.025)",
                  }}
                >
                  <span
                    style={{ color: "#67e8f9", fontSize: 11, fontWeight: 900 }}
                  >
                    {String(shot.order).padStart(2, "0")}
                  </span>
                  <strong style={{ fontSize: 12, lineHeight: 1.25 }}>
                    {shot.title}
                  </strong>
                  <small style={mutedStyle}>{shot.duration_s.toFixed(1)}s</small>
                </button>
              ))}
            </div>
          </div>

          <aside style={inspectorStyle}>
            <span style={eyebrowStyle}>Selected shot</span>
            <h2 style={{ margin: 0, fontSize: 22 }}>{selectedShot.title}</h2>
            <p style={{ ...mutedStyle, margin: 0, lineHeight: 1.55 }}>
              {selectedShot.purpose}
            </p>
            <div style={pillRowStyle}>
              <span style={pillStyle}>{statusLabels[selectedShot.status]}</span>
              <span style={pillStyle}>
                {executionLabels[selectedShot.execution_lane]}
              </span>
              <span style={pillStyle}>
                {selectedShot.duration_s.toFixed(1)} sec
              </span>
            </div>
            <InfoBlock label="Teaching point" text={selectedShot.teaching_point} />
            <InfoBlock
              label="Camera"
              text={`${selectedShot.camera_label} — ${selectedShot.camera_detail}`}
            />
            <InfoBlock
              label="Action"
              text={`${selectedShot.action_label} — ${selectedShot.action_detail}`}
            />
            <div style={{ display: "grid", gap: 8 }}>
              <span style={eyebrowStyle}>Visible gaps</span>
              {selectedShot.visible_gaps.map((gap) => (
                <div key={gap} style={gapStyle}>
                  ⚠ {gap}
                </div>
              ))}
            </div>
          </aside>
        </section>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => setShowWorkbenchDetails((value) => !value)}
            style={secondaryButtonStyle}
          >
            {showWorkbenchDetails ? "Hide production details" : "Show production details"}
          </button>
        </div>

        {showWorkbenchDetails ? (
          <>
        <section style={simpleGridStyle}>
          <article style={panelStyle}>
            <span style={eyebrowStyle}>Production brief</span>
            <p style={{ margin: "10px 0 0", lineHeight: 1.65 }}>
              {benchmark.production_brief}
            </p>
            <p style={{ ...mutedStyle, lineHeight: 1.55 }}>
              {benchmark.source_note}
            </p>
          </article>
          <article style={panelStyle}>
            <span style={eyebrowStyle}>North star</span>
            <p style={{ margin: "10px 0 0", lineHeight: 1.65 }}>
              {benchmark.north_star}
            </p>
          </article>
        </section>

        <section style={panelStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 5 }}>
              <span style={eyebrowStyle}>Asset cast</span>
              <strong>
                Auto-cast the actual cloud assets, then override manually if
                needed.
              </strong>
            </div>
            <span style={mutedStyle}>
              {loadingAssets
                ? "Loading asset library…"
                : assetError
                  ? assetError
                  : `${assets.length} assets loaded`}
            </span>
          </div>
          <div style={castGridStyle}>
            {castMatches.map((match) => {
              const selected = selectedAssets[match.slot.id];
              return (
                <div key={match.slot.id} style={castCardStyle}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={eyebrowStyle}>{match.slot.label}</span>
                    <strong>
                      {selected ? assetLabel(selected) : "No asset selected"}
                    </strong>
                    <span style={mutedStyle}>
                      {match.slot.notes || match.slot.concept}
                    </span>
                  </div>
                  <select
                    value={castSelections[match.slot.id] ?? ""}
                    onChange={(event) =>
                      setCastSelections((current) => ({
                        ...current,
                        [match.slot.id]: event.target.value,
                      }))
                    }
                    style={selectStyle}
                  >
                    <option value="">
                      {match.autoAssetId ? "Auto-cast available" : "Choose asset"}
                    </option>
                    {assets.map((asset) => (
                      <option key={asset.asset_id} value={asset.asset_id}>
                        {assetLabel(asset)} · {asset.asset_id}
                      </option>
                    ))}
                  </select>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "74px 1fr",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div style={thumbFrameStyle}>
                      {assetImagePath(selected) ? (
                        <img
                          src={assetImagePath(selected) ?? ""}
                          alt={match.slot.label}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            color: "rgba(226,232,240,.7)",
                          }}
                        >
                          No thumb
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "rgba(226,232,240,.82)",
                      }}
                    >
                      <div>
                        auto match: <strong>{match.autoAssetId ?? "none"}</strong>
                      </div>
                      <div>
                        selected: <strong>{selected?.asset_id ?? "none"}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={panelStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 5 }}>
              <span style={eyebrowStyle}>Existing-system bridges</span>
              <strong>Reuse the labs; do not duplicate them here.</strong>
            </div>
            <span style={mutedStyle}>
              CP.1C adds continuous benchmark playback, not a second Director or second scene authority.
            </span>
          </div>
          <div style={bridgeGridStyle}>
            {bridgeLinks.map(([title, href, detail]) => (
              <a key={href} href={href} style={bridgeStyle}>
                <strong>{title}</strong>
                <span style={mutedStyle}>{detail}</span>
                <span style={{ color: "#67e8f9", fontSize: 12 }}>
                  Open lab →
                </span>
              </a>
            ))}
          </div>
        </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function InfoBlock({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <span style={eyebrowStyle}>{label}</span>
      <span style={{ lineHeight: 1.55 }}>{text}</span>
    </div>
  );
}

const mutedStyle = { color: "rgba(226,232,240,.68)" } as const;
const eyebrowStyle = {
  color: "#67e8f9",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: ".13em",
  textTransform: "uppercase",
} as const;
const pageStyle = {
  minHeight: "100vh",
  color: "#f8fafc",
  background:
    "radial-gradient(circle at 20% 0%,rgba(8,145,178,.18),transparent 28%),linear-gradient(160deg,#030712,#07111f 55%,#020617)",
  padding: "32px 20px 64px",
} as const;
const shellStyle = {
  width: "min(1240px,100%)",
  margin: "0 auto",
  display: "grid",
  gap: 22,
} as const;
const benchmarkHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  alignItems: "center",
  flexWrap: "wrap",
  padding: 18,
  border: "1px solid rgba(255,255,255,.09)",
  borderRadius: 18,
  background: "rgba(15,23,42,.72)",
} as const;
const benchmarkStatsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4,auto)",
  gap: "2px 12px",
  alignItems: "baseline",
  fontSize: 12,
  color: "rgba(226,232,240,.65)",
} as const;
const workspaceStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1.65fr) minmax(300px,.75fr)",
  gap: 16,
  alignItems: "start",
} as const;
const viewerColumnStyle = {
  display: "grid",
  gap: 12,
  minWidth: 0,
} as const;
const viewerHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
} as const;
const cameraModePillStyle = {
  padding: "7px 10px",
  borderRadius: 999,
  background: "rgba(34,211,238,.1)",
  border: "1px solid rgba(34,211,238,.25)",
  color: "#a5f3fc",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
} as const;
const scrubberRowStyle = { display: "flex", gap: 10, alignItems: "center", padding: "8px 2px" } as const;
const timecodeStyle = { minWidth: 42, fontSize: 11, color: "rgba(226,232,240,.72)", fontVariantNumeric: "tabular-nums" } as const;
const controlsRowStyle = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
} as const;
const primaryButtonStyle = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(34,211,238,.35)",
  background: "rgba(34,211,238,.12)",
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
} as const;
const secondaryButtonStyle = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.04)",
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
} as const;
const timelineStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(8,minmax(100px,1fr))",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 4,
} as const;
const shotButtonStyle = {
  display: "grid",
  gap: 4,
  minWidth: 100,
  minHeight: 84,
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.1)",
  color: "white",
  textAlign: "left",
  cursor: "pointer",
} as const;
const inspectorStyle = {
  display: "grid",
  gap: 15,
  padding: 18,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,.09)",
  background: "rgba(15,23,42,.82)",
  position: "sticky",
  top: 18,
} as const;
const pillRowStyle = { display: "flex", flexWrap: "wrap", gap: 7 } as const;
const pillStyle = {
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.09)",
  fontSize: 11,
  color: "#cbd5e1",
} as const;
const gapStyle = {
  padding: "9px 10px",
  borderRadius: 10,
  border: "1px solid rgba(251,191,36,.18)",
  background: "rgba(120,53,15,.16)",
  color: "#fde68a",
  fontSize: 12,
  lineHeight: 1.45,
} as const;
const simpleGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 16,
} as const;
const panelStyle = {
  padding: 18,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,.09)",
  background: "rgba(15,23,42,.65)",
} as const;
const bridgeGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 10,
  marginTop: 14,
} as const;
const bridgeStyle = {
  display: "grid",
  gap: 5,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(2,6,23,.5)",
  color: "white",
  textDecoration: "none",
} as const;
const castGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(245px,1fr))",
  gap: 12,
  marginTop: 14,
} as const;
const castCardStyle = {
  display: "grid",
  gap: 10,
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(2,6,23,.46)",
} as const;
const selectStyle = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(15,23,42,.8)",
  color: "white",
} as const;
const thumbFrameStyle = {
  width: 74,
  height: 74,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.04)",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
} as const;
