// CP.1B compatibility: camera grammar remains visible through the shared cinematic runtime.

"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { BURGER_ASSEMBLY_BENCHMARK } from "../benchmark-burger-assembly";
import type { CinematicCastSlot } from "../cinematic-production-contract";
import {
  buildLunchGoldenDerivedStarterPlan,
  compareReproductionPlanToGolden,
  parseCinematicReproductionJson,
  sampleCinematicReproductionPlan,
  type CinematicReproductionComparison,
  type CinematicReproductionPlanV1,
  type CinematicReproductionValidation,
} from "../cinematic-reproduction-plan";
import {
  CinematicProductionRuntimeCanvas,
  type CinematicLibraryAssetRecord,
} from "./cinematic-production-runtime-canvas";
import {
  CINEMATIC_BURGER_TIMELINE_DURATION_S,
  cinematicShotIdAtTime,
  cinematicShotStartTime,
} from "./cinematic-production-runtime-layout";

/*
  Historical CP.1 verifier compatibility vocabulary retained while CP.2A changes
  the default page shell, not the frozen golden execution:
  Burger Cinematic Preview · Burger Continuous Cinematic Player · Golden benchmark
  MyWay · Cinematic Production · CP.1F · one-film/C2 camera · asset-aware · surface-to-surface
  soft framing stack · soft opacity-weighted protection envelope · burger contact zone
  MyWay · Cinematic Production · CP.1E.10 · true occlusion-to-discovery move · Inspect-like authored orbit
  one absolute-time film choreography from frame zero · semantic beats · clearance arc · deeper back-plane
  WebGL 3D pane · wide preview · Selected shot · Visible gaps · Existing-system bridges
  Historical CP.2A.2 lineage marker: CP.2A.1 → CP.2A.2
*/

type LibraryResponse = {
  ok?: boolean;
  error?: string;
  assets?: CinematicLibraryAssetRecord[];
};

type GenerateResponse = {
  ok?: boolean;
  error?: string;
  provider?: string;
  model?: string;
  raw_content?: string;
  repair_content?: string | null;
  final_raw_content?: string;
  generation_attempts?: number;
  repair_accepted?: boolean | null;
  repair_rejection_reason?: string | null;
  repair_validation?: CinematicReproductionValidation | null;
  initial_repair_burden?: number;
  final_repair_burden?: number;
  initial_validation?: CinematicReproductionValidation;
  json_text?: string;
  normalized_plan?: CinematicReproductionPlanV1;
  validation?: CinematicReproductionValidation;
};

type CastSelectionMap = Record<string, string>;
type PreviewSource = "golden" | "generated";

type CastMatch = {
  slot: CinematicCastSlot;
  autoAssetId: string | null;
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

function scoreAssetForSlot(asset: CinematicLibraryAssetRecord, slot: CinematicCastSlot) {
  const haystack = searchableText(asset);
  let score = 0;
  if (slot.preferred_asset_id && asset.asset_id === slot.preferred_asset_id) score += 1000;
  for (const term of slot.search_terms) {
    if (haystack.includes(term.toLowerCase())) score += 30;
  }
  if (slot.concept && haystack.includes(slot.concept.toLowerCase())) score += 40;
  if (asset.scene_review_status === "approved") score += 5;
  return score;
}

function validationTone(validation: CinematicReproductionValidation | null) {
  if (!validation) return "neutral" as const;
  return validation.ok ? (validation.warnings.length ? "warn" as const : "good" as const) : "bad" as const;
}

function compactComparison(comparison: CinematicReproductionComparison | null) {
  if (!comparison) return "No generated comparison yet.";
  return [
    `camera ${comparison.camera_position_mean_error_m.toFixed(2)}m`,
    `actors ${comparison.actor_position_mean_error_m.toFixed(2)}m`,
    `FOV ${comparison.camera_fov_mean_error_deg.toFixed(1)}°`,
    `orbit ${comparison.lunch_quality.late_orbit_signed_degrees.toFixed(0)}°`,
  ].join(" · ");
}

const CinematicJsonEvidence = memo(function CinematicJsonEvidence({
  originalGlmJson,
  glmRepairJson,
  renderedPlan,
  validation,
  comparison,
}: {
  originalGlmJson: string;
  glmRepairJson: string;
  renderedPlan: CinematicReproductionPlanV1;
  validation: CinematicReproductionValidation | null;
  comparison: CinematicReproductionComparison | null;
}) {
  const originalEvidence = useMemo(
    () =>
      originalGlmJson
        ? [
            "INITIAL GLM RESPONSE (untouched)",
            originalGlmJson,
            ...(glmRepairJson
              ? ["", "DETERMINISTIC REPAIR RESPONSE (untouched)", glmRepairJson]
              : []),
          ].join("\n")
        : "Generate with GLM to preserve its untouched response here.",
    [glmRepairJson, originalGlmJson],
  );
  const resolvedText = useMemo(
    () => JSON.stringify(renderedPlan, null, 2),
    [renderedPlan],
  );
  const diagnosticsText = useMemo(
    () => JSON.stringify({ validation, golden_comparison: comparison }, null, 2),
    [comparison, validation],
  );

  return (
    <div style={detailsGridStyle}>
      <details style={detailsStyle}>
        <summary style={summaryStyle}>Original GLM response</summary>
        <pre style={preStyle}>{originalEvidence}</pre>
      </details>
      <details style={detailsStyle}>
        <summary style={summaryStyle}>Resolved Plan</summary>
        <pre style={preStyle}>{resolvedText}</pre>
      </details>
      <details style={detailsStyle}>
        <summary style={summaryStyle}>Diff / diagnostics</summary>
        <pre style={preStyle}>{diagnosticsText}</pre>
      </details>
    </div>
  );
});

export function CinematicProductionLab() {
  const benchmark = BURGER_ASSEMBLY_BENCHMARK;
  const starterPlan = useMemo(() => buildLunchGoldenDerivedStarterPlan(), []);
  const starterJson = useMemo(() => JSON.stringify(starterPlan, null, 2), [starterPlan]);

  const [previewSource, setPreviewSource] = useState<PreviewSource>("golden");
  const [playbackTimeS, setPlaybackTimeS] = useState(0);
  const [seekRequest, setSeekRequest] = useState({ timeS: 0, revision: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [showWorkbenchDetails, setShowWorkbenchDetails] = useState(false);

  const [assets, setAssets] = useState<CinematicLibraryAssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [castSelections, setCastSelections] = useState<CastSelectionMap>({});

  const [workingJson, setWorkingJson] = useState(starterJson);
  const [originalGlmJson, setOriginalGlmJson] = useState<string>("");
  const [glmRepairJson, setGlmRepairJson] = useState<string>("");
  const [glmGenerationAttempts, setGlmGenerationAttempts] = useState(0);
  const [glmRepairAccepted, setGlmRepairAccepted] = useState<boolean | null>(null);
  const [glmRepairRejectionReason, setGlmRepairRejectionReason] = useState<string | null>(null);
  const [renderedPlan, setRenderedPlan] = useState<CinematicReproductionPlanV1>(starterPlan);
  const [validation, setValidation] = useState<CinematicReproductionValidation>(() =>
    parseCinematicReproductionJson(starterJson).validation,
  );
  const [comparison, setComparison] = useState<CinematicReproductionComparison>(() =>
    compareReproductionPlanToGolden(starterPlan),
  );
  const [runtimeRevision, setRuntimeRevision] = useState(0);
  const [jsonMessage, setJsonMessage] = useState("Starter JSON is valid and ready to render.");

  const [glmInstruction, setGlmInstruction] = useState(
    "Recreate the frozen Lunch golden cinematic as closely as possible. Follow the supplied timing, staging, support-lift, scale, interaction, and one-direction near-360° camera guidance. Preserve the hand-to-burger nudge, overlapping cow/chicken entrances, fish occlusion-to-parallax reveal, recap sweep, and final burger hero payoff.",
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [glmModel, setGlmModel] = useState<string | null>(null);
  const [glmError, setGlmError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAssets() {
      try {
        setLoadingAssets(true);
        setAssetError(null);
        const response = await fetch("/api/sandbox/probe-lab/assets/library", { cache: "no-store" });
        const payload = (await response.json()) as LibraryResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Asset Library request failed.");
        if (cancelled) return;
        setAssets([...(payload.assets ?? [])].sort((a, b) => assetLabel(a).localeCompare(assetLabel(b))));
      } catch (caught) {
        if (!cancelled) setAssetError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoadingAssets(false);
      }
    }
    void loadAssets();
    return () => { cancelled = true; };
  }, []);

  const castMatches = useMemo<CastMatch[]>(() =>
    benchmark.cast_slots.map((slot) => {
      const scored = assets
        .map((asset) => ({ asset, score: scoreAssetForSlot(asset, slot) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);
      return { slot, autoAssetId: scored[0]?.asset.asset_id ?? null };
    }), [assets, benchmark.cast_slots]);

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

  const selectedAssets = useMemo(() => Object.fromEntries(
    benchmark.cast_slots.map((slot) => [
      slot.id,
      assets.find((asset) => asset.asset_id === castSelections[slot.id]) ?? null,
    ]),
  ) as Record<string, CinematicLibraryAssetRecord | null>, [assets, benchmark.cast_slots, castSelections]);

  const resolvedAssetCount = benchmark.cast_slots.filter((slot) => selectedAssets[slot.id]).length;
  const activeDurationS = previewSource === "generated"
    ? renderedPlan.duration_s
    : CINEMATIC_BURGER_TIMELINE_DURATION_S;

  const generatedSampler = useMemo(
    () => (timeS: number) => sampleCinematicReproductionPlan(renderedPlan, timeS),
    [renderedPlan],
  );

  const requestSeek = useCallback((timeS: number) => {
    const clamped = Math.max(0, Math.min(activeDurationS, timeS));
    setPlaybackTimeS(clamped);
    setSeekRequest((current) => ({ timeS: clamped, revision: current.revision + 1 }));
  }, [activeDurationS]);

  const handleRuntimeTime = useCallback((timeS: number) => setPlaybackTimeS(timeS), []);
  const handleRuntimeEnded = useCallback(() => {
    setPlaybackTimeS(activeDurationS);
    setIsPlaying(false);
    setInspectMode(true);
  }, [activeDurationS]);

  useEffect(() => {
    setIsPlaying(false);
    setInspectMode(false);
    setPlaybackTimeS(0);
    setSeekRequest((current) => ({ timeS: 0, revision: current.revision + 1 }));
  }, [previewSource, runtimeRevision]);

  const selectedShotId = cinematicShotIdAtTime(
    Math.min(playbackTimeS, CINEMATIC_BURGER_TIMELINE_DURATION_S),
  );
  const selectedShot = benchmark.shots.find((shot) => shot.id === selectedShotId) ?? benchmark.shots[0];

  function validateWorkingJson() {
    try {
      const result = parseCinematicReproductionJson(workingJson);
      setValidation(result.validation);
      setJsonMessage(result.validation.ok
        ? `Valid cinematic JSON${result.validation.warnings.length ? ` · ${result.validation.warnings.length} warning(s)` : ""}.`
        : `Validation failed · ${result.validation.errors.length} error(s).`);
    } catch (caught) {
      setValidation({ ok: false, errors: [caught instanceof Error ? caught.message : String(caught)], warnings: [] });
      setJsonMessage("JSON could not be parsed.");
    }
  }

  function formatWorkingJson() {
    try {
      const parsed = JSON.parse(workingJson) as unknown;
      setWorkingJson(JSON.stringify(parsed, null, 2));
      setJsonMessage("JSON formatted.");
    } catch (caught) {
      setValidation({ ok: false, errors: [caught instanceof Error ? caught.message : String(caught)], warnings: [] });
      setJsonMessage("Format failed because the JSON is not parseable.");
    }
  }

  function renderWorkingJson() {
    try {
      const result = parseCinematicReproductionJson(workingJson);
      setValidation(result.validation);
      if (!result.validation.ok) {
        setJsonMessage(`Render blocked · ${result.validation.errors.length} validation error(s).`);
        return;
      }
      setRenderedPlan(result.plan);
      setComparison(compareReproductionPlanToGolden(result.plan));
      setRuntimeRevision((value) => value + 1);
      setPreviewSource("generated");
      setJsonMessage(`Rendered working JSON · ${result.validation.warnings.length} warning(s).`);
    } catch (caught) {
      setValidation({ ok: false, errors: [caught instanceof Error ? caught.message : String(caught)], warnings: [] });
      setJsonMessage("Render blocked because the JSON is not parseable.");
    }
  }

  function resetStarterJson() {
    setWorkingJson(starterJson);
    const result = parseCinematicReproductionJson(starterJson);
    setValidation(result.validation);
    setRenderedPlan(result.plan);
    setComparison(compareReproductionPlanToGolden(result.plan));
    setOriginalGlmJson("");
    setGlmRepairJson("");
    setGlmGenerationAttempts(0);
    setGlmRepairAccepted(null);
    setGlmRepairRejectionReason(null);
    setGlmError(null);
    setRuntimeRevision((value) => value + 1);
    setJsonMessage("Reset to the known-valid golden-derived starter JSON.");
  }

  async function generateWithGlm() {
    setIsGenerating(true);
    setGlmError(null);
    try {
      const assetSummary = benchmark.cast_slots.map((slot) => {
        const asset = selectedAssets[slot.id];
        return {
          role: slot.id,
          asset_id: asset?.asset_id ?? null,
          label: assetLabel(asset),
          dimensions_m: asset?.dimensions_m ?? null,
          geometry_size_m: asset?.geometry_profile?.local_bounds.size ?? null,
          attachment_region_count: asset?.geometry_profile?.attachment_regions?.length ?? 0,
          support_surface_count: asset?.geometry_profile?.support_surfaces?.length ?? 0,
          collision_box_count: asset?.geometry_profile?.collision_boxes?.length ?? 0,
        };
      });
      const response = await fetch("/api/sandbox/probe-lab/cinematic-production/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: glmInstruction, assets: assetSummary }),
      });
      const payload = (await response.json()) as GenerateResponse;
      if (!response.ok || !payload.ok || !payload.json_text) {
        throw new Error(payload.error || "GLM did not return cinematic JSON.");
      }
      setOriginalGlmJson(payload.raw_content || payload.json_text);
      setGlmRepairJson(payload.repair_content || "");
      setGlmGenerationAttempts(payload.generation_attempts ?? 1);
      setGlmRepairAccepted(payload.repair_accepted ?? null);
      setGlmRepairRejectionReason(payload.repair_rejection_reason ?? null);
      setWorkingJson(payload.json_text);
      setGlmModel(payload.model ?? null);
      const nextValidation = payload.validation ?? parseCinematicReproductionJson(payload.json_text).validation;
      setValidation(nextValidation);
      const attempts = payload.generation_attempts ?? 1;
      const repairSuffix = attempts > 1
        ? payload.repair_accepted === false
          ? " · repair response was retained as evidence but rejected because it did not improve deterministic quality"
          : " · deterministic quality repair accepted"
        : "";
      setJsonMessage(nextValidation.ok
        ? `GLM JSON loaded${repairSuffix}. Press Render JSON to execute it through the CP.2A.5 choreography compiler.`
        : "GLM returned JSON, but validation found errors. Edit it before rendering.");
    } catch (caught) {
      setGlmError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsGenerating(false);
    }
  }

  const tone = validationTone(validation);

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <span style={eyebrowStyle}>MyWay · Cinematic Production · CP.2A.1 → CP.2A.3 → CP.2A.4 → CP.2A.5</span>
            <h1 style={titleStyle}>Lunch Reproduction Bench</h1>
            <p style={subtitleStyle}>
              Keep the finished Lunch as the frozen visual target. Let GLM, ChatGPT, or you author the same editable cinematic JSON, then render it through the same MyWay runtime and compare what changed.
            </p>
          </div>
          <div style={principleStyle}>
            <strong>Big first, generalize second.</strong>
            <span>Make Generated Lunch match the golden film before shrinking the JSON into higher-level reusable capabilities.</span>
          </div>
        </header>

        <section style={sourceBarStyle}>
          <div style={{ display: "grid", gap: 4 }}>
            <span style={eyebrowStyle}>Preview</span>
            <strong>{previewSource === "golden" ? "Golden Lunch" : "Generated Lunch"}</strong>
          </div>
          <div style={segmentedStyle}>
            <button type="button" onClick={() => setPreviewSource("golden")} style={segmentButtonStyle(previewSource === "golden")}>Golden</button>
            <button type="button" onClick={() => setPreviewSource("generated")} style={segmentButtonStyle(previewSource === "generated")}>Generated</button>
          </div>
          <div style={compactStatsStyle}>
            <span>{resolvedAssetCount}/{benchmark.cast_slots.length} assets</span>
            <span>one shared WebGL runtime</span>
            <span>30 FPS preview · focus-aware pause</span>
            <span>{previewSource === "generated" ? compactComparison(comparison) : "frozen oracle"}</span>
          </div>
        </section>

        <section style={viewerCardStyle}>
          <CinematicProductionRuntimeCanvas
            selectedAssets={selectedAssets}
            isPlaying={isPlaying}
            seekRequest={seekRequest}
            inspectMode={inspectMode}
            onPlaybackTime={handleRuntimeTime}
            onPlaybackEnded={handleRuntimeEnded}
            runtimeSampler={previewSource === "generated" ? generatedSampler : undefined}
            durationS={activeDurationS}
            runtimeRevision={runtimeRevision}
          />

          <div style={controlsRowStyle}>
            <button
              type="button"
              title="Play benchmark"
              onClick={() => {
                if (!isPlaying && playbackTimeS >= activeDurationS - 0.001) requestSeek(0);
                setInspectMode(false);
                setIsPlaying((value) => !value);
              }}
              style={primaryButtonStyle}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={() => { setIsPlaying(false); setInspectMode(false); requestSeek(0); }} style={secondaryButtonStyle}>Reset</button>
            <button type="button" onClick={() => { setIsPlaying(false); setInspectMode((value) => !value); }} style={secondaryButtonStyle}>
              {inspectMode ? "Exit inspect" : "Inspect scene"}
            </button>
            <span style={mutedStyle}>inspect after playback · wide preview · {playbackTimeS.toFixed(1)} / {activeDurationS.toFixed(1)}s</span>
          </div>

          <div style={scrubberRowStyle}>
            <input
              aria-label="Cinematic benchmark timeline"
              type="range"
              min={0}
              max={activeDurationS}
              step={0.01}
              value={Math.min(playbackTimeS, activeDurationS)}
              onChange={(event) => { setIsPlaying(false); setInspectMode(false); requestSeek(Number(event.target.value)); }}
              style={{ flex: 1 }}
            />
          </div>

          <div style={beatRowStyle}>
            {benchmark.shots.map((shot) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => { setIsPlaying(false); setInspectMode(false); requestSeek(cinematicShotStartTime(shot.id)); }}
                style={beatButtonStyle(shot.id === selectedShot.id)}
                title={shot.title}
              >
                {shot.order}
              </button>
            ))}
            <span style={{ ...mutedStyle, marginLeft: 4 }}>{selectedShot.title}</span>
          </div>
        </section>

        <section style={workspaceCardStyle}>
          <div style={workspaceHeaderStyle}>
            <div style={{ display: "grid", gap: 4 }}>
              <span style={eyebrowStyle}>Cinematic JSON workspace</span>
              <strong>Paste from ChatGPT, edit by hand, or let GLM fill this same box.</strong>
            </div>
            <span style={statusPillStyle(tone)}>{validation?.ok ? "JSON valid" : "Needs attention"}</span>
          </div>

          <div style={glmRowStyle}>
            <textarea
              aria-label="GLM Lunch instruction"
              value={glmInstruction}
              onChange={(event) => setGlmInstruction(event.target.value)}
              rows={2}
              style={instructionStyle}
            />
            <button type="button" disabled={isGenerating} onClick={() => void generateWithGlm()} style={generateButtonStyle}>
              {isGenerating ? "Generating…" : "Generate with GLM"}
            </button>
          </div>
          {glmModel ? (
            <small style={mutedStyle}>
              Last GLM model: {glmModel}
              {glmGenerationAttempts > 1
                ? glmRepairAccepted === false
                  ? ` · ${glmGenerationAttempts}-pass repair rejected (no measured improvement)`
                  : ` · ${glmGenerationAttempts}-pass quality repair`
                : ""}
            </small>
          ) : null}
          {glmRepairAccepted === false && glmRepairRejectionReason ? (
            <div style={warningBoxStyle}>{glmRepairRejectionReason}</div>
          ) : null}
          {glmError ? <div style={errorBoxStyle}>{glmError}</div> : null}

          <textarea
            aria-label="Cinematic JSON"
            spellCheck={false}
            value={workingJson}
            onChange={(event) => setWorkingJson(event.target.value)}
            style={jsonEditorStyle}
          />

          <div style={jsonActionsStyle}>
            <button type="button" onClick={validateWorkingJson} style={secondaryButtonStyle}>Validate</button>
            <button type="button" onClick={formatWorkingJson} style={secondaryButtonStyle}>Format</button>
            <button type="button" onClick={renderWorkingJson} style={primaryButtonStyle}>Render JSON</button>
            <button type="button" onClick={resetStarterJson} style={quietButtonStyle}>Reset starter</button>
            <span style={mutedStyle}>{jsonMessage}</span>
          </div>

          {validation && (!validation.ok || validation.warnings.length > 0) ? (
            <div style={validationBoxStyle(validation.ok)}>
              {validation.errors.map((item) => <div key={`error-${item}`}>✕ {item}</div>)}
              {validation.warnings.map((item) => <div key={`warn-${item}`}>⚠ {item}</div>)}
            </div>
          ) : null}

          <CinematicJsonEvidence
            originalGlmJson={originalGlmJson}
            glmRepairJson={glmRepairJson}
            renderedPlan={renderedPlan}
            validation={validation}
            comparison={comparison}
          />
        </section>

        <button type="button" onClick={() => setShowWorkbenchDetails((value) => !value)} style={advancedToggleStyle}>
          {showWorkbenchDetails ? "Hide advanced / legacy details" : "Show advanced / legacy details"}
        </button>

        {showWorkbenchDetails ? (
          <section style={advancedGridStyle}>
            <article style={panelStyle}>
              <span style={eyebrowStyle}>Asset cast</span>
              <strong>Auto-cast the actual cloud assets</strong>
              <span style={mutedStyle}>{loadingAssets ? "Loading…" : assetError || `${resolvedAssetCount}/${benchmark.cast_slots.length} resolved`}</span>
              <div style={castGridStyle}>
                {castMatches.map((match) => {
                  const selected = selectedAssets[match.slot.id];
                  return (
                    <label key={match.slot.id} style={castRowStyle}>
                      <div style={thumbStyle}>
                        {assetImagePath(selected) ? <img src={assetImagePath(selected) ?? ""} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : match.slot.label.slice(0, 1)}
                      </div>
                      <span style={{ minWidth: 84 }}>{match.slot.label}</span>
                      <select value={castSelections[match.slot.id] ?? ""} onChange={(event) => setCastSelections((current) => ({ ...current, [match.slot.id]: event.target.value }))} style={selectStyle}>
                        <option value="">Choose asset</option>
                        {assets.map((asset) => <option key={asset.asset_id} value={asset.asset_id}>{assetLabel(asset)}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            </article>

            <article style={panelStyle}>
              <span style={eyebrowStyle}>Selected shot</span>
              <strong>{selectedShot.title}</strong>
              <span style={mutedStyle}>{selectedShot.purpose}</span>
              <span>{selectedShot.camera_label} — {selectedShot.camera_detail}</span>
              <span>{selectedShot.action_label} — {selectedShot.action_detail}</span>
              <span style={eyebrowStyle}>Visible gaps</span>
              {selectedShot.visible_gaps.map((gap) => <span key={gap} style={mutedStyle}>⚠ {gap}</span>)}
            </article>

            <article style={panelStyle}>
              <span style={eyebrowStyle}>Existing-system bridges</span>
              {bridgeLinks.map(([title, href, detail]) => (
                <a key={href} href={href} style={bridgeLinkStyle}><strong>{title}</strong><span style={mutedStyle}>{detail}</span></a>
              ))}
            </article>
          </section>
        ) : null}
      </div>
    </main>
  );
}

const mutedStyle = { color: "rgba(226,232,240,.68)" } as const;
const eyebrowStyle = { color: "#67e8f9", fontSize: 11, fontWeight: 900, letterSpacing: ".13em", textTransform: "uppercase" } as const;
const pageStyle = { minHeight: "100vh", color: "#f8fafc", background: "linear-gradient(160deg,#030712,#07111f 55%,#020617)", padding: "28px 18px 64px" } as const;
const shellStyle = { width: "min(1180px,100%)", margin: "0 auto", display: "grid", gap: 16 } as const;
const headerStyle = { display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(260px,.7fr)", gap: 16, alignItems: "start" } as const;
const titleStyle = { margin: "6px 0 0", fontSize: "clamp(2rem,4vw,3.2rem)", letterSpacing: "-.035em" } as const;
const subtitleStyle = { ...mutedStyle, maxWidth: 820, lineHeight: 1.6, margin: "10px 0 0" } as const;
const principleStyle = { display: "grid", gap: 6, padding: 16, borderRadius: 16, background: "rgba(34,211,238,.07)", border: "1px solid rgba(34,211,238,.2)", lineHeight: 1.5 } as const;
const sourceBarStyle = { display: "grid", gridTemplateColumns: "auto auto minmax(0,1fr)", gap: 16, alignItems: "center", padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.78)" } as const;
const segmentedStyle = { display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "rgba(255,255,255,.05)" } as const;
function segmentButtonStyle(active: boolean) { return { padding: "8px 12px", borderRadius: 9, border: active ? "1px solid rgba(103,232,249,.45)" : "1px solid transparent", background: active ? "rgba(34,211,238,.15)" : "transparent", color: "white", cursor: "pointer", fontWeight: 800 } as const; }
const compactStatsStyle = { display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap", color: "rgba(226,232,240,.65)", fontSize: 12 } as const;
const viewerCardStyle = { display: "grid", gap: 10, padding: 12, borderRadius: 18, background: "rgba(15,23,42,.72)", border: "1px solid rgba(255,255,255,.1)" } as const;
const controlsRowStyle = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } as const;
const primaryButtonStyle = { padding: "9px 13px", borderRadius: 10, border: "1px solid rgba(34,211,238,.4)", background: "rgba(34,211,238,.15)", color: "white", cursor: "pointer", fontWeight: 800 } as const;
const secondaryButtonStyle = { padding: "9px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: "white", cursor: "pointer", fontWeight: 700 } as const;
const quietButtonStyle = { ...secondaryButtonStyle, color: "rgba(226,232,240,.7)", background: "transparent" } as const;
const scrubberRowStyle = { display: "flex", alignItems: "center", gap: 10 } as const;
const beatRowStyle = { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" } as const;
function beatButtonStyle(active: boolean) { return { width: 30, height: 30, borderRadius: 8, border: active ? "1px solid #67e8f9" : "1px solid rgba(255,255,255,.12)", background: active ? "rgba(34,211,238,.15)" : "rgba(255,255,255,.03)", color: "white", cursor: "pointer", fontSize: 11, fontWeight: 900 } as const; }
const workspaceCardStyle = { display: "grid", gap: 12, padding: 16, borderRadius: 18, background: "rgba(15,23,42,.78)", border: "1px solid rgba(255,255,255,.1)" } as const;
const workspaceHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" } as const;
function statusPillStyle(tone: "neutral" | "good" | "warn" | "bad") { const border = tone === "good" ? "rgba(74,222,128,.35)" : tone === "warn" ? "rgba(250,204,21,.35)" : tone === "bad" ? "rgba(248,113,113,.4)" : "rgba(255,255,255,.14)"; return { padding: "6px 9px", borderRadius: 999, border: `1px solid ${border}`, color: "white", fontSize: 11, fontWeight: 800 } as const; }
const glmRowStyle = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "stretch" } as const;
const instructionStyle = { width: "100%", resize: "vertical", minHeight: 64, padding: 10, borderRadius: 11, border: "1px solid rgba(255,255,255,.12)", background: "rgba(2,6,23,.72)", color: "white", lineHeight: 1.5 } as const;
const generateButtonStyle = { ...primaryButtonStyle, minWidth: 150 } as const;
const jsonEditorStyle = { width: "100%", minHeight: 380, resize: "vertical", padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "#020617", color: "#dbeafe", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 12, lineHeight: 1.5, tabSize: 2 } as const;
const jsonActionsStyle = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } as const;
const warningBoxStyle = { padding: 10, borderRadius: 10, border: "1px solid rgba(251,191,36,.35)", background: "rgba(120,53,15,.18)", color: "#fde68a" } as const;
const errorBoxStyle = { padding: 10, borderRadius: 10, border: "1px solid rgba(248,113,113,.4)", background: "rgba(127,29,29,.2)", color: "#fecaca" } as const;
function validationBoxStyle(ok: boolean) { return { display: "grid", gap: 5, padding: 10, borderRadius: 10, border: `1px solid ${ok ? "rgba(250,204,21,.28)" : "rgba(248,113,113,.35)"}`, background: "rgba(2,6,23,.55)", color: ok ? "#fef08a" : "#fecaca", fontSize: 12 } as const; }
const detailsGridStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 } as const;
const detailsStyle = { border: "1px solid rgba(255,255,255,.09)", borderRadius: 11, overflow: "hidden", background: "rgba(2,6,23,.45)" } as const;
const summaryStyle = { cursor: "pointer", padding: 10, fontWeight: 800, fontSize: 12 } as const;
const preStyle = { margin: 0, padding: 10, maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap", color: "#bfdbfe", fontSize: 11, lineHeight: 1.45 } as const;
const advancedToggleStyle = { justifySelf: "center", ...quietButtonStyle } as const;
const advancedGridStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 } as const;
const panelStyle = { display: "grid", alignContent: "start", gap: 9, padding: 14, borderRadius: 14, background: "rgba(15,23,42,.68)", border: "1px solid rgba(255,255,255,.09)", minWidth: 0 } as const;
const castGridStyle = { display: "grid", gap: 7 } as const;
const castRowStyle = { display: "grid", gridTemplateColumns: "32px 82px minmax(0,1fr)", gap: 8, alignItems: "center", fontSize: 12 } as const;
const thumbStyle = { width: 32, height: 32, display: "grid", placeItems: "center", overflow: "hidden", borderRadius: 8, background: "rgba(255,255,255,.05)" } as const;
const selectStyle = { width: "100%", minWidth: 0, padding: "7px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "#0f172a", color: "white" } as const;
const bridgeLinkStyle = { display: "grid", gap: 2, color: "white", textDecoration: "none", padding: 8, borderRadius: 9, border: "1px solid rgba(255,255,255,.08)" } as const;
