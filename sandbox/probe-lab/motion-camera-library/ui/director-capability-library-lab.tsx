
"use client";

import { Canvas } from "@react-three/fiber";
import type { CSSProperties, ChangeEvent, ErrorInfo, ReactNode } from "react";
import { Component, useEffect, useMemo, useState } from "react";

import {
  DIRECTOR_CAPABILITIES,
  DIRECTOR_CAPABILITY_CATEGORIES,
  DIRECTOR_CATEGORY_LABELS,
  directorCapabilityDemoMoment,
  type DirectorCapability,
  type DirectorCapabilityCategory,
  type DirectorCapabilitySupportLevel,
} from "../director-capability-registry";
import {
  DirectorCapabilityPreview,
  type DirectorLibraryAsset,
  type ResolvedDirectorRole,
} from "./director-capability-preview";
import {
  applyDirectorBlocking,
  validateDirectorShot,
  type DirectorRuntimeActor,
} from "../../scenes/ui";

type LibraryResponse = {
  ok: boolean;
  count?: number;
  assets?: DirectorLibraryAsset[];
  error?: string;
};

type CategoryFilter = "all" | DirectorCapabilityCategory;
type SupportFilter = "all" | DirectorCapabilitySupportLevel;

const STATUS_COLORS: Record<DirectorCapabilitySupportLevel, string> = {
  direct: "#22c55e",
  compound: "#38bdf8",
  approximate: "#f59e0b",
  declared: "#a78bfa",
};

const CATEGORY_ACCENTS: Record<DirectorCapabilityCategory, string> = {
  narrative_attention: "#f97316",
  camera_framing: "#38bdf8",
  camera_angle: "#22d3ee",
  camera_movement: "#3b82f6",
  object_motion: "#a78bfa",
  blocking_placement: "#34d399",
  lighting_emphasis: "#facc15",
  transition_continuity: "#fb7185",
};

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function assetSearchText(asset: DirectorLibraryAsset) {
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

function isLoadableLibraryAsset(asset: DirectorLibraryAsset) {
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

function scoreAssetForConcepts(asset: DirectorLibraryAsset, concepts: string[]) {
  const haystack = ` ${assetSearchText(asset)} `;
  let score = 0;
  for (const concept of concepts) {
    const phrase = normalized(concept);
    if (!phrase) continue;
    if (haystack.includes(` ${phrase} `)) score += 160;
    const tokens = phrase.split(" ").filter(Boolean);
    score += tokens.filter((token) => haystack.includes(` ${token} `)).length * 28;
  }
  if (asset.scene_review_status === "approved") score += 48;
  if (asset.semantic_review_status === "verified") score += 32;
  if (asset.status === "approved") score += 24;
  score += Math.max(0, Number(asset.quality_score) || 0) * 8;
  return score;
}

function resolveDemoRoles(
  capability: DirectorCapability,
  assets: DirectorLibraryAsset[],
): ResolvedDirectorRole[] {
  const loadable = assets.filter(isLoadableLibraryAsset);
  const used = new Set<string>();

  return capability.demo.asset_roles.map((role, index) => {
    const blocking =
      capability.demo.blocking.find((item) => item.role === role.role) ??
      capability.demo.blocking[index] ?? {
        role: role.role,
        position: [index * 1.5 - 1.5, 0, 0] as [number, number, number],
        target_extent_m: 1.5,
      };

    const ranked = loadable
      .filter((asset) => !used.has(asset.asset_id))
      .map((asset) => ({
        asset,
        score:
          (role.preferred_asset_ids?.includes(asset.asset_id) ? 100_000 : 0) +
          scoreAssetForConcepts(asset, role.preferred_concepts),
      }))
      .sort((a, b) => b.score - a.score || a.asset.asset_id.localeCompare(b.asset.asset_id));

    const chosen = ranked[0]?.asset ?? null;
    if (chosen) used.add(chosen.asset_id);

    let matchedConcept: string | null = null;
    if (chosen) {
      const haystack = ` ${assetSearchText(chosen)} `;
      matchedConcept = role.preferred_asset_ids?.includes(chosen.asset_id)
        ? chosen.asset_id
        : role.preferred_concepts.find((concept) =>
            haystack.includes(` ${normalized(concept)} `),
          ) ?? null;
    }

    return {
      role: role.role,
      asset: chosen,
      blocking,
      matched_concept: matchedConcept,
    };
  });
}

function validationActorsFromRoles(roles: ResolvedDirectorRole[]): DirectorRuntimeActor[] {
  return roles.map((role) => ({
    id: role.role,
    position: [...role.blocking.position] as [number, number, number],
    rotation: [...(role.blocking.rotation ?? [0, 0, 0])] as [number, number, number],
    size: [
      role.blocking.target_extent_m ?? 1.6,
      role.blocking.target_extent_m ?? 1.6,
      role.blocking.target_extent_m ?? 1.6,
    ],
  }));
}

function supportLabel(status: DirectorCapabilitySupportLevel) {
  switch (status) {
    case "compound":
      return "compound controller";
    case "approximate":
      return "approximate preview";
    case "declared":
      return "declared contract";
    case "direct":
    default:
      return "direct";
  }
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Director Capability Library preview failed.", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={viewerMessageStyle}>
          <strong>The selected asset preview failed.</strong>
          <span>{this.state.error}</span>
          <span>
            Select another capability or refresh the Asset Library snapshot. The
            capability contract remains available in the inspector.
          </span>
        </div>
      );
    }
    return this.props.children;
  }
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

function SupportBadge({ status }: { status: DirectorCapabilitySupportLevel }) {
  return (
    <span
      style={{
        ...badgeStyle,
        color: STATUS_COLORS[status],
        borderColor: `${STATUS_COLORS[status]}55`,
        background: `${STATUS_COLORS[status]}14`,
      }}
    >
      {supportLabel(status)}
    </span>
  );
}

function CapabilityCard({
  capability,
  selected,
  onSelect,
}: {
  capability: DirectorCapability;
  selected: boolean;
  onSelect: () => void;
}) {
  const accent = CATEGORY_ACCENTS[capability.category];
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...capabilityCardStyle,
        borderColor: selected ? `${accent}cc` : "rgba(255,255,255,0.1)",
        background: selected
          ? `linear-gradient(145deg, ${accent}20, rgba(2,6,23,0.92))`
          : "rgba(2,6,23,0.68)",
        boxShadow: selected ? `0 18px 60px ${accent}18` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "grid", gap: 5, textAlign: "left" }}>
          <span style={{ color: accent, fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {capability.group}
          </span>
          <strong style={{ color: "white", fontSize: 16 }}>{capability.label}</strong>
        </div>
        <span style={{ width: 9, height: 9, borderRadius: 999, marginTop: 5, background: STATUS_COLORS[capability.compiler.threejs], boxShadow: `0 0 16px ${STATUS_COLORS[capability.compiler.threejs]}` }} />
      </div>
      <span style={{ ...mutedStyle, textAlign: "left", lineHeight: 1.55 }}>{capability.summary}</span>
      <code style={capabilityIdStyle}>{capability.id}</code>
    </button>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <details style={detailsStyle}>
      <summary style={summaryStyle}>{title}</summary>
      <pre style={preStyle}>{formatJson(value)}</pre>
    </details>
  );
}

export function DirectorCapabilityLibraryLab() {
  const [selectedId, setSelectedId] = useState("establish");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [support, setSupport] = useState<SupportFilter>("all");
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<DirectorLibraryAsset[]>([]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showCameraPath, setShowCameraPath] = useState(false);
  const [showRoleLabels, setShowRoleLabels] = useState(true);

  const selected =
    DIRECTOR_CAPABILITIES.find((capability) => capability.id === selectedId) ??
    DIRECTOR_CAPABILITIES[0];

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return DIRECTOR_CAPABILITIES.filter((capability) => {
      if (category !== "all" && capability.category !== category) return false;
      if (support !== "all" && capability.compiler.threejs !== support) return false;
      if (!needle) return true;
      const haystack = normalized(
        [
          capability.id,
          capability.label,
          capability.group,
          capability.summary,
          capability.semantic_intent,
          DIRECTOR_CATEGORY_LABELS[capability.category],
        ].join(" "),
      );
      return haystack.includes(needle);
    });
  }, [category, query, support]);

  const resolvedRoles = useMemo(
    () => resolveDemoRoles(selected, assets),
    [assets, selected],
  );

  const loadableAssetCount = useMemo(
    () => assets.filter(isLoadableLibraryAsset).length,
    [assets],
  );

  const requiredRoleNames = selected.demo.required_visible_roles;
  const resolvedRequiredCount = resolvedRoles.filter(
    (role) => requiredRoleNames.includes(role.role) && Boolean(role.asset),
  ).length;
  const requiredRoleCount = requiredRoleNames.length;
  const usesFallback = resolvedRoles.some(
    (role) => requiredRoleNames.includes(role.role) && !role.asset,
  );

  const previewResetKey = `${selected.id}:${resolvedRoles
    .map((role) => role.asset?.asset_id ?? "fallback")
    .join(":")}`;
  const demoMoment = useMemo(() => directorCapabilityDemoMoment(selected), [selected]);
  const demoValidation = useMemo(() => {
    const actors = applyDirectorBlocking(demoMoment, validationActorsFromRoles(resolvedRoles));
    return validateDirectorShot(demoMoment, actors);
  }, [demoMoment, resolvedRoles]);

  async function loadAssets() {
    setIsLoadingAssets(true);
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
    } catch (error) {
      setAssets([]);
      setAssetError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingAssets(false);
    }
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const duration = Math.max(1000, selected.demo.duration_ms);
    const stepMs = 100;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = current + stepMs / duration;
        return next >= 1 ? next - 1 : next;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, selected.demo.duration_ms]);

  useEffect(() => {
    setProgress(0);
    setIsPlaying(true);
  }, [selected.id]);

  useEffect(() => {
    if (!filtered.some((capability) => capability.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? DIRECTOR_CAPABILITIES[0].id);
    }
  }, [filtered, selectedId]);

  const compiledExecution = {
    capability_id: selected.id,
    compiler_id: selected.compiler.compiler_id,
    support: {
      threejs: selected.compiler.threejs,
      blender: selected.compiler.blender,
    },
    fallback_capability_id: selected.compiler.fallback_capability_id ?? null,
    capability_parameters: selected.parameters ?? [],
    compatible_with: selected.compatible_with ?? [],
    coordinate_spaces: selected.coordinate_spaces ?? [],
    composed_shot_v2: demoMoment.shot ?? null,
    semantic_events: demoMoment.events,
    runtime_inputs: {
      progress_0_to_1: Number(progress.toFixed(3)),
      duration_ms: selected.demo.duration_ms,
      resolved_roles: resolvedRoles.map((role) => ({
        role: role.role,
        asset_id: role.asset?.asset_id ?? null,
        public_path: role.asset?.public_path ?? null,
        matched_concept: role.matched_concept,
        placement: role.blocking,
      })),
    },
  };

  const diagnostics = {
    schema_version: "myway_director_capability_preview_diagnostics_v2",
    capability_id: selected.id,
    phase: "isolated_library_proof",
    one_webgl_canvas: true,
    asset_library: {
      total_records: assets.length,
      browser_loadable_records: loadableAssetCount,
      required_roles_resolved: `${resolvedRequiredCount}/${requiredRoleCount}`,
      uses_declared_fallback_actor: usesFallback,
      load_error: assetError,
    },
    camera: {
      path_visualization_available: true,
      collision_free_path_required: selected.demo.camera_path_clear_required,
      production_collision_solver_invoked: false,
      parameterized_composition_solver: true,
      sampled_preview_validation: demoValidation,
      note: "This lab now runs an approximate camera/framing/occlusion proof. The Asset Scene Builder uses the same Director runtime against measured geometry and its production placement solver.",
    },
    visibility_contract: {
      required_visible_roles: selected.demo.required_visible_roles,
      maximum_occlusion_ratio: selected.demo.maximum_occlusion_ratio ?? null,
      analytic_occlusion_measurement: "sampled bounding-volume approximation",
    },
    promotion_path: [
      "declared capability",
      "single-viewer visual proof",
      "multi-asset verification",
      "Asset Scene Builder directed-camera bridge",
      "Visual Experience integration",
      "Blender compiler implementation",
    ],
  };

  const groupedFiltered = useMemo(() => {
    const groups = new Map<string, DirectorCapability[]>();
    for (const capability of filtered) {
      const key = capability.group;
      const current = groups.get(key) ?? [];
      current.push(capability);
      groups.set(key, current);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>MyWay Probe Lab · canonical director route</div>
            <h1 style={titleStyle}>Director Capability Library</h1>
            <p style={subtitleStyle}>
              A visual proof environment for the words GLM 5.2 may use when it
              directs a scene. Every capability connects semantic intent to a
              named compiler, a Three.js support level, a future Blender status,
              a fallback, real Asset Library casting, and an inspectable demo.
            </p>
          </div>
          <div style={principleStyle}>
            <strong style={{ color: "#f8fafc" }}>Christopher Nolan Principle</strong>
            <span>
              Direct the visual argument first. MyWay then performs exact,
              bounded, renderer-specific execution without silently changing what
              the learner must notice.
            </span>
          </div>
        </header>

        <section style={statsGridStyle}>
          <Stat label="Capabilities" value={DIRECTOR_CAPABILITIES.length} detail="one typed registry" />
          <Stat label="Categories" value={DIRECTOR_CAPABILITY_CATEGORIES.length} detail="attention through continuity" />
          <Stat label="Library assets" value={isLoadingAssets ? "…" : loadableAssetCount} detail="browser-loadable examples" />
          <Stat label="WebGL canvases" value={1} detail="hard laptop-safety invariant" />
        </section>

        <section style={workbenchGridStyle}>
          <div style={viewerColumnStyle}>
            <div style={viewerHeaderStyle}>
              <div style={{ display: "grid", gap: 5 }}>
                <span style={{ color: CATEGORY_ACCENTS[selected.category], fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {DIRECTOR_CATEGORY_LABELS[selected.category]} · {selected.group}
                </span>
                <h2 style={{ margin: 0, fontSize: "clamp(1.45rem, 2.5vw, 2.3rem)" }}>{selected.label}</h2>
                <p style={{ ...mutedStyle, margin: 0, lineHeight: 1.55 }}>{selected.summary}</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                <SupportBadge status={selected.compiler.threejs} />
                <span style={badgeStyle}>Blender: {supportLabel(selected.compiler.blender)}</span>
              </div>
            </div>

            <div style={viewerStyle}>
              <PreviewErrorBoundary resetKey={previewResetKey}>
                <Canvas
                  camera={{ position: [5.8, 3.1, 6.8], fov: 42, near: 0.05, far: 80 }}
                  dpr={[1, 1.5]}
                  gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
                  shadows
                >
                  <DirectorCapabilityPreview
                    capability={selected}
                    roles={resolvedRoles}
                    progress={progress}
                    isPlaying={isPlaying}
                    showCameraPath={showCameraPath}
                    showRoleLabels={showRoleLabels}
                  />
                </Canvas>
              </PreviewErrorBoundary>
              <div style={viewerOverlayStyle}>
                <span>one active Canvas</span>
                <span>{resolvedRequiredCount}/{requiredRoleCount} required roles use real library assets</span>
                <span>{usesFallback ? "fallback actor visible" : "all required actors resolved"}</span>
              </div>
              <div style={safeFrameStyle} aria-hidden="true" />
            </div>

            <div style={transportStyle}>
              <button type="button" onClick={() => setIsPlaying((value) => !value)} style={primaryButtonStyle}>
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button type="button" onClick={() => setProgress(0)} style={buttonStyle}>Restart</button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={progress}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setIsPlaying(false);
                  setProgress(Number(event.target.value));
                }}
                style={{ flex: 1, minWidth: 180 }}
                aria-label="Capability timeline"
              />
              <span style={timeStyle}>{Math.round(progress * selected.demo.duration_ms)} / {selected.demo.duration_ms} ms</span>
              <label style={toggleLabelStyle}>
                <input type="checkbox" checked={showCameraPath} onChange={(event: ChangeEvent<HTMLInputElement>) => setShowCameraPath(event.target.checked)} />
                camera path
              </label>
              <label style={toggleLabelStyle}>
                <input type="checkbox" checked={showRoleLabels} onChange={(event: ChangeEvent<HTMLInputElement>) => setShowRoleLabels(event.target.checked)} />
                role labels
              </label>
            </div>

            <div style={narrationStyle}>
              <span style={eyebrowStyle}>Demo narration / visual claim</span>
              <strong>{selected.demo.narration}</strong>
              <span style={mutedStyle}>{selected.semantic_intent}</span>
            </div>

            <div style={roleGridStyle}>
              {resolvedRoles.map((role) => (
                <div key={role.role} style={roleCardStyle}>
                  <span style={statLabelStyle}>{role.role.replace(/_/g, " ")}</span>
                  <strong>{role.asset?.display_name || role.asset?.canonical_label || "Declared fallback actor"}</strong>
                  <small style={mutedStyle}>
                    {role.asset
                      ? `${role.asset.asset_id} · ${role.asset.license_kind}${role.matched_concept ? ` · matched ${role.matched_concept}` : ""}`
                      : "No browser-loadable reviewed asset was available for this role."}
                  </small>
                </div>
              ))}
            </div>
          </div>

          <aside style={capabilitySidebarStyle}>
            <div style={sidebarControlsStyle}>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={eyebrowStyle}>Visible capabilities</span>
                <strong style={{ fontSize: 22 }}>{filtered.length} available</strong>
                <span style={mutedStyle}>Select one without leaving the active WebGL viewer.</span>
              </div>

              <input
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                placeholder="Search reveal, orbit, facing, shadow…"
                style={inputStyle}
              />

              <div style={sidebarFilterGridStyle}>
                <select
                  value={category}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setCategory(event.target.value as CategoryFilter)
                  }
                  style={selectStyle}
                >
                  <option value="all">All categories</option>
                  {DIRECTOR_CAPABILITY_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {DIRECTOR_CATEGORY_LABELS[item]}
                    </option>
                  ))}
                </select>
                <select
                  value={support}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setSupport(event.target.value as SupportFilter)
                  }
                  style={selectStyle}
                >
                  <option value="all">All Three.js support</option>
                  <option value="direct">Direct</option>
                  <option value="compound">Compound</option>
                  <option value="approximate">Approximate</option>
                  <option value="declared">Declared</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => void loadAssets()}
                style={buttonStyle}
                disabled={isLoadingAssets}
              >
                {isLoadingAssets ? "Loading assets…" : "Refresh Asset Library"}
              </button>
              {assetError ? <div style={errorStyle}>{assetError}</div> : null}
            </div>

            <div style={sidebarCatalogueStyle}>
              {groupedFiltered.length ? (
                groupedFiltered.map(([group, capabilities]) => (
                  <div key={group} style={sidebarGroupStyle}>
                    <h3 style={{ margin: 0, fontSize: 13, color: "#cbd5e1" }}>{group}</h3>
                    <div style={sidebarCapabilityListStyle}>
                      {capabilities.map((capability) => (
                        <CapabilityCard
                          key={capability.id}
                          capability={capability}
                          selected={capability.id === selected.id}
                          onSelect={() => setSelectedId(capability.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div style={viewerMessageStyle}>No capabilities match the current filters.</div>
              )}
            </div>
          </aside>
        </section>

        <section style={inspectorSectionStyle}>
          <div style={inspectorHeaderStyle}>
            <div style={{ display: "grid", gap: 8 }}>
              <span style={eyebrowStyle}>Capability inspector</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 28 }}>{selected.label}</h2>
                <code style={selectedIdStyle}>{selected.id}</code>
              </div>
              <p style={{ ...mutedStyle, margin: 0, lineHeight: 1.55, maxWidth: 1000 }}>
                GLM receives the semantic contract and supported capability IDs,
                not renderer code. MyWay compiles the chosen instruction into the
                controller and bounded preview execution shown here.
              </p>
            </div>

            <div style={supportMatrixStyle}>
              <div><span>Three.js</span><SupportBadge status={selected.compiler.threejs} /></div>
              <div><span>Blender</span><SupportBadge status={selected.compiler.blender} /></div>
              <div><span>Fallback</span><code>{selected.compiler.fallback_capability_id ?? "none"}</code></div>
              <div><span>Compiler</span><code>{selected.compiler.compiler_id}</code></div>
            </div>
          </div>

          <div style={inspectorGridStyle}>
            <JsonPanel title="1. Director instruction" value={selected.director_instruction} />
            <JsonPanel title="2. Compiled preview execution" value={compiledExecution} />
            <JsonPanel title="3. Validation and promotion diagnostics" value={diagnostics} />
          </div>

          <div style={honestyStyle}>
            <strong>Important boundary</strong>
            <span>
              This library visually proves composable V2 shot direction with real
              library assets and approximate sampled camera validation. Final
              placement and physical collision authority remains in the Asset Scene
              Builder, which now consumes the same Director shot language.
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  color: "white",
  padding: "min(3vw, 30px)",
  background:
    "radial-gradient(circle at 12% 0%, rgba(14,165,233,0.2), transparent 28%), radial-gradient(circle at 88% 8%, rgba(249,115,22,0.14), transparent 25%), linear-gradient(180deg, #020617, #030712 42%, #020617)",
};

const shellStyle: CSSProperties = {
  width: "min(1760px, 100%)",
  margin: "0 auto",
  display: "grid",
  gap: 22,
};

const headerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(300px, 0.55fr)",
  gap: 20,
  alignItems: "end",
};

const titleStyle: CSSProperties = {
  margin: "8px 0 8px",
  fontSize: "clamp(2.4rem, 5vw, 5rem)",
  lineHeight: 0.98,
  letterSpacing: "-0.045em",
};

const eyebrowStyle: CSSProperties = {
  color: "#7dd3fc",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  maxWidth: 1050,
  color: "rgba(226,232,240,0.75)",
  lineHeight: 1.7,
  fontSize: 16,
};

const principleStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 18,
  borderRadius: 20,
  border: "1px solid rgba(249,115,22,0.3)",
  background: "linear-gradient(145deg, rgba(124,45,18,0.35), rgba(2,6,23,0.8))",
  color: "rgba(226,232,240,0.75)",
  lineHeight: 1.55,
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const statStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  padding: 15,
  borderRadius: 17,
  background: "rgba(15,23,42,0.72)",
  border: "1px solid rgba(255,255,255,0.09)",
};

const statLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 10,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  fontWeight: 900,
};

const mutedStyle: CSSProperties = {
  color: "rgba(226,232,240,0.65)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  borderRadius: 12,
  border: "1px solid rgba(125,211,252,0.25)",
  background: "#020617",
  color: "white",
  padding: "10px 12px",
};

const selectStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#07111f",
  color: "white",
  padding: "10px 12px",
};

const buttonStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  padding: "10px 13px",
  cursor: "pointer",
  fontWeight: 850,
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(135deg, #0284c7, #2563eb)",
  borderColor: "rgba(125,211,252,0.65)",
};

const errorStyle: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(248,113,113,0.3)",
  background: "rgba(127,29,29,0.25)",
  color: "#fecaca",
};

const workbenchGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(330px, 0.65fr)",
  gap: 16,
  alignItems: "start",
};

const viewerColumnStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  minWidth: 0,
};

const viewerHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  padding: 17,
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.72)",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.16)",
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#cbd5e1",
  background: "rgba(255,255,255,0.05)",
};

const viewerStyle: CSSProperties = {
  position: "relative",
  minHeight: "clamp(520px, 63vh, 780px)",
  overflow: "hidden",
  borderRadius: 24,
  border: "1px solid rgba(125,211,252,0.22)",
  background: "#020617",
  boxShadow: "0 30px 100px rgba(0,0,0,0.42)",
};

const viewerOverlayStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  right: 12,
  zIndex: 5,
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
  pointerEvents: "none",
  color: "#dbeafe",
  fontSize: 10,
};

const safeFrameStyle: CSSProperties = {
  position: "absolute",
  inset: "9% 8%",
  zIndex: 4,
  border: "1px dashed rgba(255,255,255,0.16)",
  borderRadius: 8,
  pointerEvents: "none",
};

const viewerMessageStyle: CSSProperties = {
  minHeight: 300,
  display: "grid",
  placeContent: "center",
  gap: 8,
  padding: 24,
  textAlign: "center",
  color: "rgba(226,232,240,0.72)",
  background: "#020617",
};

const transportStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.78)",
};

const timeStyle: CSSProperties = {
  color: "#bae6fd",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 11,
};

const toggleLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "rgba(226,232,240,0.72)",
  fontSize: 11,
};

const narrationStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  padding: 15,
  borderRadius: 17,
  border: "1px solid rgba(249,115,22,0.18)",
  background: "linear-gradient(145deg, rgba(124,45,18,0.22), rgba(2,6,23,0.72))",
};

const roleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const roleCardStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 13,
  borderRadius: 15,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(15,23,42,0.72)",
  minWidth: 0,
  overflowWrap: "anywhere",
};

const capabilitySidebarStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  position: "sticky",
  top: 14,
  height: "calc(100vh - 28px)",
  minHeight: 560,
  overflow: "hidden",
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.11)",
  background: "rgba(2,6,23,0.9)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.32)",
};

const sidebarControlsStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  flex: "0 0 auto",
  padding: 15,
  borderBottom: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(2,6,23,0.97)",
  zIndex: 2,
};

const sidebarFilterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 8,
};

const sidebarCatalogueStyle: CSSProperties = {
  display: "grid",
  flex: "1 1 auto",
  minHeight: 0,
  alignContent: "start",
  gap: 18,
  padding: 12,
  overflowY: "auto",
  overscrollBehavior: "contain",
};

const sidebarGroupStyle: CSSProperties = {
  display: "grid",
  gap: 9,
};

const sidebarCapabilityListStyle: CSSProperties = {
  display: "grid",
  gap: 9,
};

const selectedIdStyle: CSSProperties = {
  display: "inline-block",
  width: "fit-content",
  borderRadius: 8,
  padding: "7px 9px",
  color: "#e0f2fe",
  background: "rgba(14,165,233,0.12)",
  border: "1px solid rgba(56,189,248,0.25)",
};

const supportMatrixStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 12,
  borderRadius: 14,
  background: "rgba(15,23,42,0.66)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const detailsStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(15,23,42,0.62)",
  overflow: "hidden",
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  padding: 12,
  fontWeight: 850,
  color: "#dbeafe",
};

const preStyle: CSSProperties = {
  margin: 0,
  maxHeight: 360,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  padding: 12,
  borderTop: "1px solid rgba(255,255,255,0.07)",
  background: "#020617",
  color: "#bfdbfe",
  fontSize: 10,
  lineHeight: 1.5,
};

const honestyStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(245,158,11,0.25)",
  background: "rgba(120,53,15,0.2)",
  color: "rgba(254,243,199,0.82)",
  lineHeight: 1.5,
  fontSize: 12,
};

const inspectorSectionStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 18,
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.72)",
};

const inspectorHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 0.45fr)",
  gap: 18,
  alignItems: "start",
};

const inspectorGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  alignItems: "start",
};

const capabilityCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  minHeight: 146,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.1)",
  cursor: "pointer",
  font: "inherit",
};

const capabilityIdStyle: CSSProperties = {
  justifySelf: "start",
  color: "#93c5fd",
  fontSize: 10,
  borderRadius: 7,
  padding: "4px 6px",
  background: "rgba(30,64,175,0.22)",
};
