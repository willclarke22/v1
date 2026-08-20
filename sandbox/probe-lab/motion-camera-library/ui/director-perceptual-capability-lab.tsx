/**
 * Phase 1B.6 high-level Director workbench.
 *
 * This is intentionally part of the Director Capability Library, not a second
 * Motif Library. It binds reviewed Asset Library GLBs to semantic roles and runs
 * one normalized cross-asset visual proof. Production execution must derive exact
 * coordinates from measured geometry/directability rather than copying Golden Lunch.
 */

"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  DIRECTOR_FILM_POLICIES,
  DIRECTOR_PERCEPTUAL_CATEGORY_LABELS,
  DIRECTOR_PERCEPTUAL_CAPABILITY_VERSION,
  DIRECTOR_PERCEPTUAL_CAPABILITIES,
  FIRST_BUILD_PERCEPTUAL_CAPABILITY_IDS,
  type DirectorPerceptualCapability,
  type DirectorPerceptualCapabilityCategory,
  type DirectorPerceptualCapabilityStatus,
} from "../director-perceptual-capabilities";
import { directorPerceptualPreviewSlots } from "../director-perceptual-runtime";
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

type CategoryFilter = "all" | DirectorPerceptualCapabilityCategory;
type StatusFilter = "all" | DirectorPerceptualCapabilityStatus;

const CATEGORY_ACCENTS: Record<DirectorPerceptualCapabilityCategory, string> = {
  causal_interaction: "#f97316",
  presentation: "#a78bfa",
  attention_continuity: "#38bdf8",
  spatial_reveal: "#22d3ee",
  recap: "#34d399",
  resolution: "#facc15",
  consequence: "#fb7185",
};

const STATUS_COLORS: Record<DirectorPerceptualCapabilityStatus, string> = {
  first_build: "#86efac",
  next: "#93c5fd",
  candidate: "#f9a8d4",
};

const STATUS_LABELS: Record<DirectorPerceptualCapabilityStatus, string> = {
  first_build: "First build",
  next: "Next",
  candidate: "Candidate",
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function assetLabel(asset: DirectorPerceptualLibraryAsset) {
  return asset.display_name || asset.canonical_label || asset.asset_id;
}

function Stat({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div style={statStyle}>
      <span style={statLabelStyle}>{label}</span>
      <strong style={{ fontSize: 24 }}>{value}</strong>
      <small style={mutedStyle}>{detail}</small>
    </div>
  );
}

function PerceptualBadge({ status }: { status: DirectorPerceptualCapabilityStatus }) {
  return (
    <span
      style={{
        ...badgeStyle,
        color: STATUS_COLORS[status],
        borderColor: `${STATUS_COLORS[status]}55`,
        background: `${STATUS_COLORS[status]}14`,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function PerceptualCard({
  capability,
  selected,
  onSelect,
}: {
  capability: DirectorPerceptualCapability;
  selected: boolean;
  onSelect: () => void;
}) {
  const accent = CATEGORY_ACCENTS[capability.category];
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...perceptualCardStyle,
        borderColor: selected ? `${accent}cc` : "rgba(255,255,255,0.1)",
        background: selected
          ? `linear-gradient(145deg, ${accent}20, rgba(2,6,23,0.92))`
          : "rgba(2,6,23,0.68)",
        boxShadow: selected ? `0 18px 60px ${accent}18` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "grid", gap: 5, textAlign: "left" }}>
          <span style={{ color: accent, fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {DIRECTOR_PERCEPTUAL_CATEGORY_LABELS[capability.category]}
          </span>
          <strong style={{ color: "white", fontSize: 15 }}>{capability.short_label}</strong>
        </div>
        <span style={{ width: 9, height: 9, borderRadius: 999, marginTop: 5, background: STATUS_COLORS[capability.status], boxShadow: `0 0 16px ${STATUS_COLORS[capability.status]}` }} />
      </div>
      <span style={{ ...mutedStyle, textAlign: "left", lineHeight: 1.5 }}>{capability.visual_job}</span>
      <code style={perceptualIdStyle}>{capability.id}</code>
    </button>
  );
}

function DetailList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "grid", gap: 7 }}>
      {items.map((item) => (
        <div key={item} style={listItemStyle}>
          <span aria-hidden="true" style={{ color: "#7dd3fc" }}>•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function RealAssetRoleBench({
  selected,
  assets,
  assetsLoaded,
  assetsLoading,
  assetError,
  roleAssetOverrides,
  onRoleAssetOverride,
  onRequestAssets,
  onAutoFill,
}: {
  selected: DirectorPerceptualCapability;
  assets: DirectorPerceptualLibraryAsset[];
  assetsLoaded: boolean;
  assetsLoading: boolean;
  assetError: string | null;
  roleAssetOverrides: Record<string, string>;
  onRoleAssetOverride: (slotId: string, assetId: string) => void;
  onRequestAssets: () => void;
  onAutoFill: () => void;
}) {
  const slots = useMemo(() => directorPerceptualPreviewSlots(selected), [selected]);
  const loadable = useMemo(
    () =>
      assets
        .filter(isLoadableLibraryAsset)
        .slice()
        .sort((left, right) => assetLabel(left).localeCompare(assetLabel(right))),
    [assets],
  );
  const required = slots.filter((slot) => slot.required);
  const selectedRequired = required.filter((slot) => Boolean(roleAssetOverrides[slot.slot_id])).length;
  const ready = assetsLoaded && selectedRequired === required.length;
  const statusColor = ready ? "#86efac" : "#fbbf24";

  return (
    <div style={realAssetBenchStyle}>
      <div style={realAssetBenchHeaderStyle}>
        <div style={{ display: "grid", gap: 5 }}>
          <span style={eyebrowStyle}>Cross-asset capability proof</span>
          <strong style={{ fontSize: 17 }}>Bind real Asset Library GLBs to semantic capability roles.</strong>
          <span style={mutedStyle}>
            The asset changes; the capability grammar stays the same. Exact Golden Lunch camera coordinates are not inputs to this bench.
          </span>
        </div>
        <span style={{ ...badgeStyle, color: statusColor, borderColor: `${statusColor}55`, background: `${statusColor}14` }}>
          {ready ? "ready for real-asset visual proof" : `${selectedRequired}/${required.length} required roles selected`}
        </span>
      </div>

      {!assetsLoaded ? (
        <div style={loadAssetsStyle}>
          <span style={mutedStyle}>Asset loading is deferred until you request a real-asset generalization test.</span>
          <button type="button" onClick={onRequestAssets} disabled={assetsLoading} style={buttonStyle}>
            {assetsLoading ? "Loading assets…" : "Load Asset Library"}
          </button>
          {assetError ? <div style={errorStyle}>{assetError}</div> : null}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={mutedStyle}>{loadable.length} browser-loadable reviewed GLBs available.</span>
            <button type="button" onClick={onAutoFill} style={buttonStyle}>Auto-fill distinct assets</button>
          </div>
          <div style={roleSelectorGridStyle}>
            {slots.map((slot) => {
              const selectedAsset = loadable.find((asset) => asset.asset_id === roleAssetOverrides[slot.slot_id]) ?? null;
              return (
                <label key={slot.slot_id} style={roleSelectorStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={statLabelStyle}>{slot.label}</span>
                    <span style={{ ...badgeStyle, color: slot.required ? "#fde68a" : "#94a3b8" }}>{slot.required ? "required" : "optional"}</span>
                  </div>
                  <select
                    value={roleAssetOverrides[slot.slot_id] ?? ""}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => onRoleAssetOverride(slot.slot_id, event.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Controlled proxy / no real asset</option>
                    {loadable.map((asset) => (
                      <option key={asset.asset_id} value={asset.asset_id}>
                        {assetLabel(asset)} · {asset.asset_id}
                      </option>
                    ))}
                  </select>
                  <small style={mutedStyle}>{slot.purpose}</small>
                  <code style={miniCodeStyle}>
                    target extent {slot.target_extent_m.toFixed(2)}m · {selectedAsset ? selectedAsset.asset_id : "proxy"}
                  </code>
                </label>
              );
            })}
          </div>
        </>
      )}

      <div style={boundaryNoteStyle}>
        <strong>Phase 1B.6 boundary</strong>
        <span>
          This is a real-asset visual generalization proof, not production coordinate authority. Exact staging/camera values must be derived from measured geometry/directability; later qualification can score occlusion, screen occupancy, contact, crop, and continuity before promotion.
        </span>
      </div>
    </div>
  );
}

export function DirectorPerceptualCapabilityLibraryLab() {
  const [selectedId, setSelectedId] = useState("occlusion_to_parallax_discovery");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<DirectorPerceptualLibraryAsset[]>([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [roleAssetOverrides, setRoleAssetOverrides] = useState<Record<string, string>>({});

  const selected = DIRECTOR_PERCEPTUAL_CAPABILITIES.find((capability) => capability.id === selectedId) ?? DIRECTOR_PERCEPTUAL_CAPABILITIES[0];
  const slots = useMemo(() => directorPerceptualPreviewSlots(selected), [selected]);
  const loadableAssets = useMemo(() => assets.filter(isLoadableLibraryAsset), [assets]);

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return DIRECTOR_PERCEPTUAL_CAPABILITIES.filter((capability) => {
      if (category !== "all" && capability.category !== category) return false;
      if (status !== "all" && capability.status !== status) return false;
      if (!needle) return true;
      return normalized([
        capability.id,
        capability.label,
        capability.short_label,
        capability.visual_job,
        capability.proof_strategy,
        capability.summary,
        capability.source.beat,
        DIRECTOR_PERCEPTUAL_CATEGORY_LABELS[capability.category],
        ...capability.generalizes_to,
      ].join(" ")).includes(needle);
    });
  }, [category, query, status]);

  const groupedFiltered = useMemo(() => {
    const groups = new Map<DirectorPerceptualCapabilityCategory, DirectorPerceptualCapability[]>();
    for (const capability of filtered) {
      const current = groups.get(capability.category) ?? [];
      current.push(capability);
      groups.set(capability.category, current);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const resolvedSlots = useMemo<ResolvedPerceptualPreviewSlot[]>(
    () =>
      slots.map((slot) => ({
        slot,
        asset:
          loadableAssets.find((asset) => asset.asset_id === roleAssetOverrides[slot.slot_id]) ?? null,
      })),
    [loadableAssets, roleAssetOverrides, slots],
  );

  useEffect(() => {
    setRoleAssetOverrides({});
  }, [selected.id]);

  useEffect(() => {
    if (!filtered.some((capability) => capability.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? DIRECTOR_PERCEPTUAL_CAPABILITIES[0].id);
    }
  }, [filtered, selectedId]);

  async function loadAssets(autoFill = false) {
    setAssetsLoading(true);
    setAssetError(null);
    try {
      const response = await fetch("/api/sandbox/probe-lab/assets/library", { cache: "no-store" });
      const payload = (await response.json()) as LibraryResponse;
      if (!response.ok || !payload.ok || !Array.isArray(payload.assets)) {
        throw new Error(payload.error || "The Asset Library could not be loaded.");
      }
      const nextAssets = payload.assets;
      setAssets(nextAssets);
      setAssetsLoaded(true);
      if (autoFill) autoFillSlots(nextAssets);
    } catch (error) {
      setAssets([]);
      setAssetsLoaded(false);
      setAssetError(error instanceof Error ? error.message : String(error));
    } finally {
      setAssetsLoading(false);
    }
  }

  function autoFillSlots(sourceAssets = assets) {
    const available = sourceAssets.filter(isLoadableLibraryAsset);
    const next: Record<string, string> = {};
    const used = new Set<string>();
    for (const slot of slots) {
      const candidate = available.find((asset) => !used.has(asset.asset_id));
      if (!candidate) continue;
      next[slot.slot_id] = candidate.asset_id;
      used.add(candidate.asset_id);
    }
    setRoleAssetOverrides(next);
  }

  function setRoleAssetOverride(slotId: string, assetId: string) {
    setRoleAssetOverrides((current) => {
      const next = { ...current };
      if (assetId) next[slotId] = assetId;
      else delete next[slotId];
      return next;
    });
  }

  function selectRelativeCapability(delta: number) {
    if (!filtered.length) return;
    const index = filtered.findIndex((capability) => capability.id === selected.id);
    const current = index >= 0 ? index : 0;
    const next = (current + delta + filtered.length) % filtered.length;
    setSelectedId(filtered[next].id);
  }

  const accent = CATEGORY_ACCENTS[selected.category];

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>MyWay Probe Lab · hierarchical directing · perceptual/composite layer</div>
            <h1 style={titleStyle}>Director Capability Library · Perceptual / Composite</h1>
            <p style={subtitleStyle}>
              Golden Lunch has been distilled into high-level perceptual/composite Director capabilities. Select a capability, bind controlled shapes or any reviewed Asset Library GLBs to its semantic roles, and inspect whether the same visual idea survives the asset swap.
            </p>
          </div>
          <div style={principleStyle}>
            <strong style={{ color: "#f8fafc" }}>Perceptual intent, not authored coordinates.</strong>
            <span>
              These capabilities own perceptual intent and composition grammar. Assets supply geometry and appearance. Exact production staging/camera values remain geometry-derived and fail closed when a role cannot qualify.
            </span>
          </div>
        </header>

        <section style={statsGridStyle}>
          <Stat label="Capabilities" value={DIRECTOR_PERCEPTUAL_CAPABILITIES.length} detail={`${FIRST_BUILD_PERCEPTUAL_CAPABILITY_IDS.length} first-build Golden extractions`} />
          <Stat label="Film policies" value={DIRECTOR_FILM_POLICIES.length} detail="shared cinematic invariants" />
          <Stat label="Library assets" value={assetsLoading ? "…" : assetsLoaded ? loadableAssets.length : "deferred"} detail="reviewed browser-loadable GLBs" />
          <Stat label="WebGL canvases" value={1} detail="DPR 1 · demand-rendered · sleeps offscreen" />
        </section>

        <section style={workbenchGridStyle}>
          <div style={viewerColumnStyle}>
            <div style={selectedHeaderStyle}>
              <div style={{ display: "grid", gap: 5 }}>
                <span style={{ color: accent, fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {DIRECTOR_PERCEPTUAL_CATEGORY_LABELS[selected.category]} · Golden Lunch extraction
                </span>
                <h2 style={{ margin: 0, fontSize: "clamp(1.45rem, 2.5vw, 2.3rem)" }}>{selected.label}</h2>
                <p style={{ ...mutedStyle, margin: 0, lineHeight: 1.58 }}>{selected.visual_job}</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                <PerceptualBadge status={selected.status} />
                <span style={badgeStyle}>source {selected.source.time_range}</span>
              </div>
            </div>

            <RealAssetRoleBench
              selected={selected}
              assets={assets}
              assetsLoaded={assetsLoaded}
              assetsLoading={assetsLoading}
              assetError={assetError}
              roleAssetOverrides={roleAssetOverrides}
              onRoleAssetOverride={setRoleAssetOverride}
              onRequestAssets={() => void loadAssets(false)}
              onAutoFill={() => autoFillSlots()}
            />

            <DirectorPerceptualCapabilityAuditViewer
              capability={selected}
              resolvedSlots={resolvedSlots}
              realAssetsLoaded={assetsLoaded}
              realAssetsLoading={assetsLoading}
              realAssetCount={loadableAssets.length}
              realAssetError={assetError}
              onRequestRealAssets={() => void loadAssets(true)}
            />

            <div style={navigationBarStyle}>
              <div style={{ display: "grid", gap: 4 }}>
                <span style={statLabelStyle}>Golden source beat</span>
                <strong>{selected.source.beat}</strong>
                <span style={mutedStyle}>{selected.source.evidence}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => selectRelativeCapability(-1)} style={buttonStyle}>Previous</button>
                <button type="button" onClick={() => selectRelativeCapability(1)} style={buttonStyle}>Next</button>
              </div>
            </div>
          </div>

          <aside style={inspectorColumnStyle}>
            <div style={inspectorCardStyle}>
              <span style={eyebrowStyle}>Visual proof strategy</span>
              <strong>{selected.proof_strategy}</strong>
              <span style={mutedStyle}>{selected.summary}</span>
            </div>

            <div style={inspectorCardStyle}>
              <span style={eyebrowStyle}>Capability phases</span>
              <div style={phaseGridStyle}>
                {selected.phases.map((phase, index) => <span key={phase} style={phaseChipStyle}>{index + 1}. {phase}</span>)}
              </div>
            </div>

            <div style={inspectorCardStyle}>
              <span style={eyebrowStyle}>Hard rules</span>
              <DetailList items={selected.hard_rules} />
            </div>

            <div style={inspectorCardStyle}>
              <span style={eyebrowStyle}>Qualification targets</span>
              <div style={{ display: "grid", gap: 8 }}>
                {selected.qualification.map((item) => (
                  <div key={item.id} style={qualificationRowStyle}>
                    <span style={{ ...badgeStyle, color: item.kind === "hard" ? "#fca5a5" : "#93c5fd" }}>{item.kind}</span>
                    <div style={{ display: "grid", gap: 3 }}>
                      <code style={miniCodeStyle}>{item.id}</code>
                      <span style={mutedStyle}>{item.requirement}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={inspectorCardStyle}>
              <span style={eyebrowStyle}>Cross-domain examples</span>
              <div style={chipWrapStyle}>{selected.generalizes_to.map((item) => <span key={item} style={chipStyle}>{item}</span>)}</div>
            </div>
          </aside>
        </section>

        <section style={catalogSectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <span style={eyebrowStyle}>Catalog</span>
              <h2 style={{ margin: "4px 0 0" }}>Golden-derived perceptual/composite capabilities</h2>
            </div>
            <span style={mutedStyle}>{filtered.length}/{DIRECTOR_PERCEPTUAL_CAPABILITIES.length} visible</span>
          </div>

          <div style={filterBarStyle}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search capabilities, jobs, examples…" style={inputStyle} />
            <select value={category} onChange={(event) => setCategory(event.target.value as CategoryFilter)} style={selectStyle}>
              <option value="all">All categories</option>
              {Object.entries(DIRECTOR_PERCEPTUAL_CATEGORY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} style={selectStyle}>
              <option value="all">All statuses</option>
              <option value="first_build">First build</option>
              <option value="next">Next</option>
              <option value="candidate">Candidate</option>
            </select>
          </div>

          {groupedFiltered.map(([groupCategory, capabilities]) => (
            <div key={groupCategory} style={catalogGroupStyle}>
              <div style={groupHeaderStyle}>
                <strong style={{ color: CATEGORY_ACCENTS[groupCategory] }}>{DIRECTOR_PERCEPTUAL_CATEGORY_LABELS[groupCategory]}</strong>
                <span style={mutedStyle}>{capabilities.length} capability{capabilities.length === 1 ? "" : "s"}</span>
              </div>
              <div style={catalogGridStyle}>
                {capabilities.map((capability) => <PerceptualCard key={capability.id} capability={capability} selected={capability.id === selected.id} onSelect={() => setSelectedId(capability.id)} />)}
              </div>
            </div>
          ))}
        </section>

        <section style={policiesSectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <span style={eyebrowStyle}>Compiler layer</span>
              <h2 style={{ margin: "4px 0 0" }}>Film-wide policies sit above individual capabilities</h2>
            </div>
            <span style={mutedStyle}>Applied across compatible capability transitions.</span>
          </div>
          <div style={policyGridStyle}>
            {DIRECTOR_FILM_POLICIES.map((policy) => (
              <div key={policy.id} style={policyCardStyle}>
                <code style={miniCodeStyle}>{policy.id}</code>
                <strong>{policy.label}</strong>
                <span style={mutedStyle}>{policy.summary}</span>
                <div style={boundaryNoteStyle}><strong>Compiler rule</strong><span>{policy.compiler_rule}</span></div>
              </div>
            ))}
          </div>
        </section>

        <footer style={footerStyle}>
          <strong>Phase 1B.6 · {DIRECTOR_PERCEPTUAL_CAPABILITY_VERSION}</strong>
          <span>
            This page now tests the claim behind extracted perceptual capabilities: the same semantic visual program can be rebound to unrelated reviewed GLBs while one deterministic WebGL runtime supplies staging and camera motion.
          </span>
        </footer>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: "100vh", background: "#020617", color: "#f8fafc", padding: "28px 22px 64px" };
const shellStyle: CSSProperties = { width: "min(1560px, 100%)", margin: "0 auto", display: "grid", gap: 18 };
const headerStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(300px, 0.7fr)", gap: 16, alignItems: "stretch" };
const titleStyle: CSSProperties = { margin: "5px 0 8px", fontSize: "clamp(2rem, 4vw, 4.1rem)", lineHeight: 0.98, letterSpacing: "-0.045em" };
const subtitleStyle: CSSProperties = { margin: 0, maxWidth: 950, color: "rgba(255,255,255,0.58)", lineHeight: 1.65, fontSize: 14 };
const eyebrowStyle: CSSProperties = { color: "#7dd3fc", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em" };
const principleStyle: CSSProperties = { display: "grid", alignContent: "center", gap: 8, padding: "18px 20px", borderRadius: 18, border: "1px solid rgba(56,189,248,0.18)", background: "linear-gradient(145deg, rgba(14,116,144,0.16), rgba(2,6,23,0.74))", color: "rgba(255,255,255,0.62)", lineHeight: 1.55 };
const statsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 };
const statStyle: CSSProperties = { display: "grid", gap: 4, padding: "14px 15px", borderRadius: 15, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.52)" };
const statLabelStyle: CSSProperties = { color: "rgba(255,255,255,0.42)", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em" };
const mutedStyle: CSSProperties = { color: "rgba(255,255,255,0.52)" };
const badgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", width: "fit-content", padding: "4px 7px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.62)", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" };
const workbenchGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.65fr) minmax(320px, 0.7fr)", gap: 14, alignItems: "start" };
const viewerColumnStyle: CSSProperties = { display: "grid", gap: 12 };
const inspectorColumnStyle: CSSProperties = { display: "grid", gap: 10, position: "sticky", top: 12 };
const selectedHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", padding: "18px 20px", borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.72)" };
const realAssetBenchStyle: CSSProperties = { display: "grid", gap: 12, padding: "16px", borderRadius: 18, border: "1px solid rgba(52,211,153,0.15)", background: "rgba(6,78,59,0.08)" };
const realAssetBenchHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" };
const loadAssetsStyle: CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "12px", borderRadius: 12, background: "rgba(2,6,23,0.44)" };
const roleSelectorGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 };
const roleSelectorStyle: CSSProperties = { display: "grid", gap: 7, padding: "11px", borderRadius: 12, background: "rgba(2,6,23,0.5)", border: "1px solid rgba(255,255,255,0.07)" };
const selectStyle: CSSProperties = { minWidth: 0, padding: "9px 10px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "#0f172a", color: "#e2e8f0" };
const inputStyle: CSSProperties = { ...selectStyle, minWidth: 260, flex: "1 1 320px" };
const miniCodeStyle: CSSProperties = { color: "rgba(191,219,254,0.7)", fontSize: 9, overflowWrap: "anywhere" };
const boundaryNoteStyle: CSSProperties = { display: "grid", gap: 4, padding: "10px 11px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(2,6,23,0.44)", color: "rgba(255,255,255,0.56)", fontSize: 11, lineHeight: 1.5 };
const errorStyle: CSSProperties = { color: "#fca5a5", fontSize: 11 };
const buttonStyle: CSSProperties = { appearance: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, background: "rgba(15,23,42,0.9)", color: "rgba(255,255,255,0.8)", padding: "8px 11px", fontWeight: 800, cursor: "pointer" };
const navigationBarStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(2,6,23,0.58)" };
const inspectorCardStyle: CSSProperties = { display: "grid", gap: 9, padding: "14px", borderRadius: 15, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.58)", lineHeight: 1.5 };
const phaseGridStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const phaseChipStyle: CSSProperties = { padding: "5px 7px", borderRadius: 999, background: "rgba(30,64,175,0.18)", border: "1px solid rgba(96,165,250,0.14)", color: "rgba(219,234,254,0.78)", fontSize: 9 };
const listItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "10px minmax(0, 1fr)", gap: 7, color: "rgba(255,255,255,0.66)", fontSize: 11 };
const qualificationRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 8, alignItems: "start", paddingBottom: 7, borderBottom: "1px solid rgba(255,255,255,0.05)" };
const chipWrapStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const chipStyle: CSSProperties = { display: "inline-flex", padding: "5px 7px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.45)", color: "rgba(255,255,255,0.62)", fontSize: 9 };
const catalogSectionStyle: CSSProperties = { display: "grid", gap: 12, paddingTop: 4 };
const sectionHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" };
const filterBarStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, padding: "10px", borderRadius: 14, background: "rgba(15,23,42,0.44)", border: "1px solid rgba(255,255,255,0.07)" };
const catalogGroupStyle: CSSProperties = { display: "grid", gap: 8 };
const groupHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "0 2px" };
const catalogGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 8 };
const perceptualCardStyle: CSSProperties = { appearance: "none", display: "grid", gap: 9, minHeight: 155, padding: "13px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", color: "inherit", cursor: "pointer" };
const perceptualIdStyle: CSSProperties = { color: "rgba(191,219,254,0.48)", fontSize: 8, textAlign: "left", overflowWrap: "anywhere" };
const policiesSectionStyle: CSSProperties = { display: "grid", gap: 12, paddingTop: 4 };
const policyGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 };
const policyCardStyle: CSSProperties = { display: "grid", alignContent: "start", gap: 8, padding: "14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.62)" };
const footerStyle: CSSProperties = { display: "grid", gap: 6, padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(2,6,23,0.5)", color: "rgba(255,255,255,0.58)", lineHeight: 1.55 };
