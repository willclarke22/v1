

"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { DirectorPerceptualCapability } from "../director-perceptual-capabilities";
import {
  DIRECTOR_PERCEPTUAL_DIRECTION_PRESETS,
  directorPerceptualDefaultDirectionDegrees,
  directorPerceptualPreviewSlots,
  directorPerceptualSupportsDirectionalSide,
  directorPerceptualSupportsTravelDirection,
  type DirectorPerceptualTravelDirection,
} from "../director-perceptual-runtime";
import {
  directorLevel1VisualizationGuide,
} from "../director-level1-visualization-guides";
import {
  DirectorPerceptualCapabilityAuditViewer,
  type DirectorPerceptualLibraryAsset,
  type ResolvedPerceptualPreviewSlot,
} from "./director-perceptual-capability-audit-viewer";

type LibraryResponse = {
  ok: boolean;
  count?: number;
  assets?: DirectorPerceptualLibraryAsset[];
  error?: string;
};

type Props = {
  capability: DirectorPerceptualCapability;
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function assetLabel(asset: DirectorPerceptualLibraryAsset) {
  return asset.display_name || asset.canonical_label || asset.asset_id;
}

function assetSearchText(asset: DirectorPerceptualLibraryAsset) {
  return normalized(
    [
      asset.asset_id,
      asset.canonical_label,
      asset.display_name,
      ...(asset.aliases ?? []),
      ...(asset.semantic_tags ?? []),
    ].join(" "),
  );
}

function isLoadableLibraryAsset(asset: DirectorPerceptualLibraryAsset) {
  return (
    asset.file_stats?.exists === true &&
    Boolean(asset.public_path) &&
    (asset.asset_type === "glb" || asset.asset_type === "gltf") &&
    asset.status !== "rejected" &&
    asset.scene_review_status !== "rejected" &&
    asset.semantic_review_status !== "rejected" &&
    asset.semantic_review_status !== "mismatch" &&
    asset.safe_to_use_in_sandbox !== false
  );
}

export function DirectorLevel1CapabilityVisualization({ capability }: Props) {
  const slots = useMemo(
    () => directorPerceptualPreviewSlots(capability),
    [capability],
  );
  const guide = useMemo(
    () => directorLevel1VisualizationGuide(capability),
    [capability],
  );

  const [assets, setAssets] = useState<DirectorPerceptualLibraryAsset[]>([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [roleAssetOverrides, setRoleAssetOverrides] = useState<Record<string, string>>({});
  const [roleSearchQueries, setRoleSearchQueries] = useState<Record<string, string>>({});
  const [roleYawOffsets, setRoleYawOffsets] = useState<Record<string, number>>({});
  const [directionDegrees, setDirectionDegrees] = useState(() =>
    directorPerceptualDefaultDirectionDegrees(capability),
  );
  const [travelDirection, setTravelDirection] = useState<DirectorPerceptualTravelDirection>("forward");

  const supportsDirectionalSide = directorPerceptualSupportsDirectionalSide(capability);
  const supportsTravelDirection = directorPerceptualSupportsTravelDirection(capability);

  const loadableAssets = useMemo(
    () =>
      assets
        .filter(isLoadableLibraryAsset)
        .slice()
        .sort((left, right) => assetLabel(left).localeCompare(assetLabel(right))),
    [assets],
  );

  const resolvedSlots = useMemo<ResolvedPerceptualPreviewSlot[]>(
    () =>
      slots.map((slot) => ({
        slot,
        asset:
          loadableAssets.find(
            (asset) => asset.asset_id === roleAssetOverrides[slot.slot_id],
          ) ?? null,
      })),
    [loadableAssets, roleAssetOverrides, slots],
  );

  useEffect(() => {
    setRoleAssetOverrides({});
    setRoleSearchQueries({});
    setRoleYawOffsets({});
    setDirectionDegrees(directorPerceptualDefaultDirectionDegrees(capability));
    setTravelDirection("forward");
  }, [capability.id]);

  useEffect(() => {
    if (!assetsLoaded) {
      void loadAssets(true);
      return;
    }
    autoFillSlots(assets);
  }, [assetsLoaded, capability.id]);

  function autoFillSlots(sourceAssets: DirectorPerceptualLibraryAsset[]) {
    const available = sourceAssets
      .filter(isLoadableLibraryAsset)
      .slice()
      .sort((left, right) => assetLabel(left).localeCompare(assetLabel(right)));

    const next: Record<string, string> = {};
    const used = new Set<string>();
    for (const slot of slots) {
      const candidate = available.find((asset) => !used.has(asset.asset_id));
      if (!candidate) continue;
      next[slot.slot_id] = candidate.asset_id;
      used.add(candidate.asset_id);
    }
    setRoleAssetOverrides(next);
    setRoleYawOffsets({});
  }

  async function loadAssets(autoFill = false) {
    if (assetsLoading) return;

    if (assetsLoaded) {
      if (autoFill && Object.keys(roleAssetOverrides).length === 0) {
        autoFillSlots(assets);
      }
      return;
    }

    setAssetsLoading(true);
    setAssetError(null);
    try {
      const response = await fetch("/api/sandbox/probe-lab/assets/library", {
        cache: "no-store",
      });
      const payload = (await response.json()) as LibraryResponse;
      if (!response.ok || !payload.ok || !Array.isArray(payload.assets)) {
        throw new Error(payload.error || "The Asset Library could not be loaded.");
      }
      setAssets(payload.assets);
      setAssetsLoaded(true);
      if (autoFill) autoFillSlots(payload.assets);
    } catch (error) {
      setAssets([]);
      setAssetsLoaded(false);
      setAssetError(error instanceof Error ? error.message : String(error));
    } finally {
      setAssetsLoading(false);
    }
  }

  function setRoleAssetOverride(slotId: string, assetId: string) {
    setRoleAssetOverrides((current) => {
      const next = { ...current };
      if (assetId) next[slotId] = assetId;
      else delete next[slotId];
      return next;
    });
    setRoleYawOffsets((current) => ({ ...current, [slotId]: 0 }));
  }

  function setRoleYawOffset(slotId: string, degrees: number) {
    setRoleYawOffsets((current) => ({
      ...current,
      [slotId]: Math.max(-180, Math.min(180, degrees)),
    }));
  }

  const travelLabels = capability.id === "occlusion_to_parallax_discovery"
    ? { forward: "Clockwise reveal", reverse: "Counterclockwise reveal" }
    : capability.id === "recap_sweep"
      ? { forward: "A → B → C", reverse: "C → B → A" }
      : { forward: "Clockwise camera arc", reverse: "Counterclockwise camera arc" };

  return (
    <section style={shellStyle}>
      <div style={guideStyle}>
        <div style={{ display: "grid", gap: 5 }}>
          <span style={eyebrowStyle}>Level 1 real-asset visualization</span>
          <strong style={{ fontSize: 16 }}>
            {guide?.headline ?? capability.visual_job}
          </strong>
          <span style={mutedStyle}>
            The animation below executes this perceptual capability with reviewed real
            Asset Library models rather than proxy geometry.
          </span>
        </div>
        {guide ? (
          <div style={watchGridStyle}>
            {guide.watch_for.map((item, index) => (
              <div key={item} style={watchItemStyle}>
                <span style={watchNumberStyle}>{index + 1}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={directionCardStyle}>
        <div style={{ display: "grid", gap: 5 }}>
          <strong style={{ fontSize: 13 }}>Directional capability variants</strong>
          <span style={mutedStyle}>
            Change the side or path owned by the capability itself. This does not rotate the whole scene and does not change an asset's facing correction.
          </span>
        </div>

        {supportsDirectionalSide ? (
          <div style={directionControlsStyle}>
            <span style={controlLabelStyle}>
              {capability.id === "agent_approach_contact_response_retreat"
                ? "Approach from"
                : capability.id === "arrive_settle_present_depart"
                  ? "Enter / depart from"
                  : capability.id === "overlapping_attention_handoff"
                    ? "Handoff axis"
                    : capability.id === "context_to_hero_resolution"
                      ? "Camera resolves from"
                      : "Causal context side"}
            </span>
            <div style={directionButtonRowStyle}>
              {DIRECTOR_PERCEPTUAL_DIRECTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDirectionDegrees(preset.degrees)}
                  style={{
                    ...miniButtonStyle,
                    ...(directionDegrees === preset.degrees ? activeMiniButtonStyle : null),
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <label style={directionSliderLabelStyle}>
              <span>Any angle · {directionDegrees}°</span>
              <input
                type="range"
                min={0}
                max={345}
                step={15}
                value={directionDegrees}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDirectionDegrees(Number(event.target.value))
                }
                style={{ width: "100%" }}
              />
            </label>
          </div>
        ) : null}

        {supportsTravelDirection ? (
          <div style={directionControlsStyle}>
            <span style={controlLabelStyle}>Path direction</span>
            <div style={directionButtonRowStyle}>
              {(["forward", "reverse"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTravelDirection(value)}
                  style={{
                    ...miniButtonStyle,
                    ...(travelDirection === value ? activeMiniButtonStyle : null),
                  }}
                >
                  {travelLabels[value]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!supportsDirectionalSide && !supportsTravelDirection ? (
          <span style={mutedStyle}>This capability has no meaningful directional variant in the current real-asset execution.</span>
        ) : null}
      </div>

      <DirectorPerceptualCapabilityAuditViewer
        capability={capability}
        resolvedSlots={resolvedSlots}
        realAssetsLoaded={assetsLoaded}
        realAssetsLoading={assetsLoading}
        realAssetCount={loadableAssets.length}
        realAssetError={assetError}
        onRequestRealAssets={() => void loadAssets(true)}
        directionDegrees={directionDegrees}
        travelDirection={travelDirection}
        roleYawOffsets={roleYawOffsets}
      />

      <details style={detailsStyle}>
        <summary style={summaryStyle}>
          Real-asset role binding
          <span style={summaryHintStyle}>
            searchable reviewed GLBs · defaults auto-fill, then stay fully switchable
          </span>
        </summary>

        <div style={detailsBodyStyle}>
          {!assetsLoaded ? (
            <div style={loadRowStyle}>
              <span style={mutedStyle}>
                The Asset Library loads automatically for real-asset execution. You can
                retry here if the current snapshot is unavailable.
              </span>
              <button
                type="button"
                onClick={() => void loadAssets(false)}
                disabled={assetsLoading}
                style={buttonStyle}
              >
                {assetsLoading ? "Loading assets…" : "Retry Asset Library"}
              </button>
              {assetError ? <span style={errorStyle}>{assetError}</span> : null}
            </div>
          ) : (
            <>
              <div style={bindingHeaderStyle}>
                <span style={mutedStyle}>
                  {loadableAssets.length} browser-loadable reviewed GLBs. Defaults auto-fill automatically, but every role stays searchable and switchable below.
                </span>
                <button
                  type="button"
                  onClick={() => autoFillSlots(assets)}
                  style={buttonStyle}
                >
                  Auto-fill distinct assets
                </button>
              </div>

              <div style={roleGridStyle}>
                {slots.map((slot) => {
                  const selectedAssetId = roleAssetOverrides[slot.slot_id] ?? "";
                  const selectedAsset =
                    loadableAssets.find(
                      (asset) => asset.asset_id === selectedAssetId,
                    ) ?? null;
                  const query = normalized(roleSearchQueries[slot.slot_id] ?? "");
                  const matching = query
                    ? loadableAssets.filter((asset) =>
                        assetSearchText(asset).includes(query),
                      )
                    : loadableAssets;
                  const visibleAssets =
                    selectedAsset &&
                    !matching.some(
                      (asset) => asset.asset_id === selectedAsset.asset_id,
                    )
                      ? [selectedAsset, ...matching]
                      : matching;

                  return (
                    <div key={slot.slot_id} style={roleCardStyle}>
                      <div style={roleHeaderStyle}>
                        <strong>{slot.label}</strong>
                        <span style={roleRequirementStyle}>
                          {slot.required ? "required" : "optional"}
                        </span>
                      </div>

                      <input
                        value={roleSearchQueries[slot.slot_id] ?? ""}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setRoleSearchQueries((current) => ({
                            ...current,
                            [slot.slot_id]: event.target.value,
                          }))
                        }
                        placeholder={`Search ${loadableAssets.length} Asset Library models…`}
                        style={inputStyle}
                      />

                      <select
                        value={selectedAssetId}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          setRoleAssetOverride(slot.slot_id, event.target.value)
                        }
                        style={selectStyle}
                      >
                        <option value="">{slot.required ? "Select a real asset" : "No asset · optional role"}</option>
                        {visibleAssets.map((asset) => (
                          <option key={asset.asset_id} value={asset.asset_id}>
                            {assetLabel(asset)} · {asset.asset_id}
                          </option>
                        ))}
                      </select>

                      {selectedAsset ? (
                        <div style={facingControlStyle}>
                          <div style={facingHeaderStyle}>
                            <span style={controlLabelStyle}>Asset facing correction</span>
                            <code style={facingValueStyle}>{roleYawOffsets[slot.slot_id] ?? 0}°</code>
                          </div>
                          <div style={directionButtonRowStyle}>
                            {[-90, 0, 90, 180].map((value) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setRoleYawOffset(slot.slot_id, value)}
                                style={{
                                  ...miniButtonStyle,
                                  ...((roleYawOffsets[slot.slot_id] ?? 0) === value ? activeMiniButtonStyle : null),
                                }}
                              >
                                {value > 0 ? `+${value}°` : `${value}°`}
                              </button>
                            ))}
                          </div>
                          <input
                            aria-label={`${slot.label} asset facing correction`}
                            type="range"
                            min={-180}
                            max={180}
                            step={15}
                            value={roleYawOffsets[slot.slot_id] ?? 0}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setRoleYawOffset(slot.slot_id, Number(event.target.value))
                            }
                            style={{ width: "100%" }}
                          />
                          <small style={mutedStyle}>Rotates only this model inside its semantic role; capability direction and camera path stay unchanged.</small>
                        </div>
                      ) : null}

                      <small style={mutedStyle}>
                        {query
                          ? `${matching.length} of ${loadableAssets.length} assets match`
                          : `${loadableAssets.length} assets available`}
                        {" · "}
                        {slot.purpose}
                      </small>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {guide ? (
            <div style={boundaryStyle}>
              <strong>{guide.source_mechanism}</strong>
              <span>{guide.production_boundary}</span>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}

const shellStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const guideStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)",
  gap: 14,
  padding: "13px 14px",
  borderRadius: 14,
  border: "1px solid rgba(56,189,248,0.16)",
  background: "rgba(14,116,144,0.07)",
};

const eyebrowStyle: CSSProperties = {
  color: "#7dd3fc",
  fontSize: 9,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

const mutedStyle: CSSProperties = {
  color: "rgba(226,232,240,0.62)",
  lineHeight: 1.5,
};

const watchGridStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const watchItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "22px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  color: "rgba(241,245,249,0.8)",
  fontSize: 11,
  lineHeight: 1.45,
};

const watchNumberStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 20,
  height: 20,
  borderRadius: 999,
  background: "rgba(56,189,248,0.14)",
  border: "1px solid rgba(125,211,252,0.22)",
  color: "#bae6fd",
  fontWeight: 900,
  fontSize: 9,
};

const detailsStyle: CSSProperties = {
  borderRadius: 13,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(15,23,42,0.42)",
  overflow: "hidden",
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  padding: "11px 13px",
  fontWeight: 850,
  color: "#e2e8f0",
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const summaryHintStyle: CSSProperties = {
  color: "rgba(226,232,240,0.45)",
  fontWeight: 650,
  fontSize: 10,
};

const detailsBodyStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: "0 13px 13px",
};

const loadRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const bindingHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const roleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 9,
};

const roleCardStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  padding: 10,
  borderRadius: 11,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(2,6,23,0.5)",
};

const roleHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const roleRequirementStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 9,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 9,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.8)",
  color: "#f8fafc",
  padding: "8px 9px",
  fontSize: 11,
};

const selectStyle: CSSProperties = {
  width: "100%",
  borderRadius: 9,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "#0f172a",
  color: "#f8fafc",
  padding: "8px 9px",
  fontSize: 11,
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 9,
  background: "rgba(15,23,42,0.88)",
  color: "#e2e8f0",
  padding: "8px 10px",
  fontWeight: 800,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  color: "#fca5a5",
  fontSize: 11,
};

const directionCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
  alignItems: "start",
  padding: "11px 13px",
  borderRadius: 13,
  border: "1px solid rgba(250,204,21,0.14)",
  background: "rgba(120,53,15,0.08)",
};
const directionControlsStyle: CSSProperties = { display: "grid", gap: 8 };
const directionButtonRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const controlLabelStyle: CSSProperties = { color: "rgba(241,245,249,0.82)", fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: "0.06em" };
const miniButtonStyle: CSSProperties = { appearance: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, background: "rgba(15,23,42,0.88)", color: "#e2e8f0", padding: "6px 9px", fontSize: 11, fontWeight: 800, cursor: "pointer" };
const activeMiniButtonStyle: CSSProperties = { border: "1px solid rgba(125,211,252,0.36)", background: "rgba(8,145,178,0.22)", color: "#ecfeff" };
const directionSliderLabelStyle: CSSProperties = { display: "grid", gap: 5, color: "rgba(241,245,249,0.72)", fontSize: 11, fontWeight: 700 };
const facingControlStyle: CSSProperties = { display: "grid", gap: 7, padding: "8px 9px", borderRadius: 9, border: "1px solid rgba(125,211,252,0.12)", background: "rgba(8,47,73,0.12)" };
const facingHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const facingValueStyle: CSSProperties = { color: "#bae6fd", fontSize: 11, fontWeight: 900 };

const boundaryStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(250,204,21,0.14)",
  background: "rgba(120,53,15,0.08)",
  color: "rgba(254,243,199,0.72)",
  fontSize: 10,
  lineHeight: 1.45,
};


