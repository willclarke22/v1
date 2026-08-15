"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";

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
  buildDirectorCameraFidelityReport,
  type DirectorCameraFidelityReport,
} from "../director-camera-fidelity";
import {
  buildDirectorObjectMotionFidelityReport,
  type DirectorObjectMotionFidelityReport,
} from "../director-object-motion-fidelity";
import {
  DIRECTOR_VISUAL_AUDIT_VERSION,
  directorVisualAuditDefinition,
  emptyDirectorVisualAuditState,
  normalizeDirectorVisualAuditState,
  reviewForCapability,
  reviewedCapabilityCount,
  type DirectorVisualAuditState,
  type DirectorVisualAuditStatus,
} from "../director-visual-audit";
import {
  type DirectorLibraryAsset,
  type ResolvedDirectorRole,
} from "./director-capability-preview";
import {
  DIRECTOR_CAPABILITY_AUTHORITY_SCHEMA_VERSION,
  DIRECTOR_CAPABILITY_AUTHORITY_LAYERS,
  directorCapabilityAssetAuthorityPath,
} from "../../directability/capability-authority-contract";
import { DirectorAuditViewer } from "./director-audit-viewer";
import { buildUnnamedMotionGeneralityProof } from "../../motion-program/motion-program-diagnostics";
import {
  buildDirectorSceneStateInspectorSnapshot,
} from "../../motion-program/director-scene-state-reducer";
import {
  applyDirectorBlocking,
  validateDirectorShot,
  type DirectorRuntimeActor,
} from "../../scenes/ui";
import {
  buildDirectorRealAssetExecutionQualification,
  type DirectorRealAssetExecutionQualificationReport,
  type DirectorRealAssetExecutionStatus,
} from "../director-real-asset-execution-qualification";

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
  roleAssetOverrides: Record<string, string>,
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

    const overrideAssetId = roleAssetOverrides[role.role] ?? "";
    const reviewerSelected =
      overrideAssetId
        ? loadable.find((asset) => asset.asset_id === overrideAssetId) ?? null
        : null;

    const ranked = loadable
      .filter((asset) => !used.has(asset.asset_id))
      .map((asset) => ({
        asset,
        score:
          (role.preferred_asset_ids?.includes(asset.asset_id) ? 100_000 : 0) +
          scoreAssetForConcepts(asset, role.preferred_concepts),
      }))
      .sort((a, b) => b.score - a.score || a.asset.asset_id.localeCompare(b.asset.asset_id));

    const chosen = reviewerSelected ?? ranked[0]?.asset ?? null;
    // Explicit reviewer choices may intentionally use the same library asset in
    // more than one role. Auto-matching still avoids duplicates.
    if (chosen && !reviewerSelected) used.add(chosen.asset_id);

    let matchedConcept: string | null = null;
    if (chosen) {
      const haystack = ` ${assetSearchText(chosen)} `;
      matchedConcept = reviewerSelected
        ? "reviewer-selected asset"
        : role.preferred_asset_ids?.includes(chosen.asset_id)
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
  const [open, setOpen] = useState(false);
  return (
    <details
      style={detailsStyle}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary style={summaryStyle}>{title}</summary>
      {open ? <pre style={preStyle}>{formatJson(value)}</pre> : null}
    </details>
  );
}

function CameraFidelityEvidence({
  report,
}: {
  report: DirectorCameraFidelityReport;
}) {
  const keySamples = [report.samples[0], report.samples[2], report.samples[4]].filter(
    (sample): sample is DirectorCameraFidelityReport["samples"][number] => Boolean(sample),
  );
  const passed = report.checks.filter((check) => check.passed).length;
  return (
    <div style={fidelityPanelStyle}>
      <div style={fidelityHeaderStyle}>
        <div style={{ display: "grid", gap: 5 }}>
          <span style={eyebrowStyle}>Phase 1B controlled camera proof</span>
          <strong style={{ fontSize: 16 }}>
            {report.fixture.replace(/_/g, " ")}
          </strong>
        </div>
        <span
          style={{
            ...badgeStyle,
            color: report.automated_status === "pass" ? "#86efac" : "#fbbf24",
            borderColor:
              report.automated_status === "pass"
                ? "rgba(134,239,172,0.35)"
                : "rgba(251,191,36,0.35)",
            background:
              report.automated_status === "pass"
                ? "rgba(22,101,52,0.2)"
                : "rgba(146,64,14,0.2)",
          }}
        >
          {passed}/{report.checks.length} automated checks
        </span>
      </div>

      <div style={fidelitySamplesStyle}>
        {keySamples.map((sample) => (
          <div key={sample.progress} style={fidelitySampleStyle}>
            <span style={statLabelStyle}>
              {sample.progress === 0
                ? "start"
                : sample.progress === 0.5
                  ? "mid"
                  : "end"}
            </span>
            <strong>{sample.camera_target_distance_m.toFixed(2)} m</strong>
            <small style={mutedStyle}>
              camera → target · FOV {sample.fov_degrees.toFixed(1)}°
            </small>
            <code style={fidelityVectorStyle}>
              [{sample.camera_position.map((value) => value.toFixed(2)).join(", ")}]
            </code>
          </div>
        ))}
      </div>

      <div style={fidelityChecksStyle}>
        {report.checks.map((check) => (
          <div key={check.id} style={fidelityCheckStyle}>
            <span
              aria-hidden="true"
              style={{
                color: check.passed ? "#86efac" : "#fbbf24",
                fontWeight: 900,
              }}
            >
              {check.passed ? "✓" : "!"}
            </span>
            <div style={{ display: "grid", gap: 2 }}>
              <strong style={{ fontSize: 12 }}>{check.description}</strong>
              <small style={mutedStyle}>{check.measured}</small>
            </div>
          </div>
        ))}
      </div>

      {report.limitations.length ? (
        <div style={fidelityLimitationStyle}>
          <strong>Known fidelity boundary</strong>
          <span>{report.limitations.join(" ")}</span>
        </div>
      ) : null}
    </div>
  );
}


function ObjectMotionFidelityEvidence({
  report,
}: {
  report: DirectorObjectMotionFidelityReport;
}) {
  const keySamples = [
    report.samples[0],
    report.samples[2],
    report.samples[4],
  ].filter(
    (
      sample,
    ): sample is DirectorObjectMotionFidelityReport["samples"][number] =>
      Boolean(sample),
  );
  const statusColor =
    report.automated_status === "pass"
      ? "#86efac"
      : report.automated_status === "known_redundancy"
        ? "#fda4af"
        : "#fbbf24";
  const statusLabel =
    report.qualification_state === "frozen_canary"
      ? "frozen regression canary"
      : report.qualification_state === "process_strengthened"
        ? "Phase 1B.4.6 process strengthened"
        : report.qualification_state === "choreography_strengthened"
          ? "Phase 1B.4.5 choreography strengthened"
          : report.qualification_state === "recipe_strengthened"
            ? "Phase 1B.4.3 recipe strengthened"
            : report.qualification_state === "needs_semantic_strengthening"
              ? "known semantic overlap"
              : "fixture ready for review";

  return (
    <div style={fidelityPanelStyle}>
      <div style={fidelityHeaderStyle}>
        <div style={{ display: "grid", gap: 5 }}>
          <span style={eyebrowStyle}>
            Phase 1B.4.1 controlled object-motion proof
          </span>
          <strong style={{ fontSize: 16 }}>
            {report.fixture.replace(/_/g, " ")}
          </strong>
        </div>
        <span
          style={{
            ...badgeStyle,
            color: statusColor,
            borderColor: `${statusColor}55`,
            background: `${statusColor}14`,
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div style={fidelityLimitationStyle}>
        <strong>
          Universal Motion Program ·{" "}
          {report.qualification_state === "process_strengthened"
            ? "Phase 1B.4.6 process / quantity lane"
            : report.qualification_state === "choreography_strengthened"
              ? "Phase 1B.4.5 multi-actor choreography"
              : report.strengthening_version
                ? "Phase 1B.4.3 relational/articulation recipe"
                : "Phase 1B.4.2 foundation"}
        </strong>
        <span>
          {report.motion_program.route === "motion_program"
            ? `${report.motion_program.program?.tracks.length ?? 0} deterministic track(s) · ${
                report.motion_program.program?.diagnostics.recipe_ids?.length
                  ? `recipe ${report.motion_program.program.diagnostics.recipe_ids.join(", ")}`
                  : report.motion_program.legacy_equivalence?.passed
                    ? "legacy-equivalent canary"
                    : "program available"
              }`
            : `legacy compatibility path · ${report.motion_program.reason}`}
        </span>
      </div>

      <div style={fidelitySamplesStyle}>
        {keySamples.map((sample) => (
          <div key={sample.progress} style={fidelitySampleStyle}>
            <span style={statLabelStyle}>
              {sample.progress === 0
                ? "start"
                : sample.progress === 0.5
                  ? "mid"
                  : "end"}
            </span>
            <strong>
              [{sample.primary_position.map((value) => value.toFixed(2)).join(", ")}]
            </strong>
            <small style={mutedStyle}>
              primary position · target distance{" "}
              {sample.distance_to_secondary_m.toFixed(2)} m
            </small>
            <code style={fidelityVectorStyle}>
              rot [
              {sample.primary_rotation_degrees
                .map((value) => value.toFixed(0))
                .join(", ")}
              ]° · scale [
              {sample.primary_scale.map((value) => value.toFixed(2)).join(", ")}
              ]
            </code>
          </div>
        ))}
      </div>

      <div style={fidelityChecksStyle}>
        {report.checks.map((check) => (
          <div key={check.id} style={fidelityCheckStyle}>
            <span
              aria-hidden="true"
              style={{
                color: check.passed ? "#86efac" : "#fbbf24",
                fontWeight: 900,
              }}
            >
              {check.passed ? "✓" : "!"}
            </span>
            <div style={{ display: "grid", gap: 2 }}>
              <strong style={{ fontSize: 12 }}>{check.description}</strong>
              <small style={mutedStyle}>{check.measured}</small>
            </div>
          </div>
        ))}
      </div>

      {report.redundancy_peers.length ? (
        <div style={fidelityLimitationStyle}>
          <strong>Compare semantic overlap</strong>
          <span>{report.redundancy_peers.join(", ")}</span>
        </div>
      ) : null}

      {report.limitations.length ? (
        <div style={fidelityLimitationStyle}>
          <strong>Known fidelity boundary</strong>
          <span>{report.limitations.join(" ")}</span>
        </div>
      ) : null}
    </div>
  );
}

const DIRECTOR_AUDIT_STORAGE_KEY =
  "myway_director_visual_audit_phase1b2_v1";
const INITIAL_CATALOG_LIMIT = 36;


const REAL_ASSET_STATUS_META: Record<
  DirectorRealAssetExecutionStatus,
  { label: string; color: string }
> = {
  not_asset_gated: { label: "visual proof only", color: "#93c5fd" },
  missing_required_asset: { label: "select required asset", color: "#fbbf24" },
  asset_authoring_required: { label: "asset authoring required", color: "#fca5a5" },
  runtime_pending: { label: "runtime pending", color: "#c4b5fd" },
  fallback_only: { label: "fallback only", color: "#fda4af" },
  context_required: { label: "context required", color: "#fbbf24" },
  builder_validation_required: { label: "Builder validation required", color: "#67e8f9" },
  ready_for_visual_proof: { label: "ready for visual proof", color: "#86efac" },
};

function readableOperatorStatus(value: string) {
  return value.replace(/_/g, " ");
}

function RealAssetExecutionQualificationPanel({
  capability,
  assets,
  assetsLoaded,
  assetsLoading,
  assetError,
  resolvedRoles,
  roleAssetOverrides,
  onRoleAssetOverride,
  onRequestAssets,
  report,
}: {
  capability: DirectorCapability;
  assets: DirectorLibraryAsset[];
  assetsLoaded: boolean;
  assetsLoading: boolean;
  assetError: string | null;
  resolvedRoles: ResolvedDirectorRole[];
  roleAssetOverrides: Record<string, string>;
  onRoleAssetOverride: (role: string, assetId: string) => void;
  onRequestAssets: () => void;
  report: DirectorRealAssetExecutionQualificationReport;
}) {
  const loadable = useMemo(
    () =>
      assets
        .filter(isLoadableLibraryAsset)
        .slice()
        .sort((left, right) =>
          (left.display_name || left.canonical_label).localeCompare(
            right.display_name || right.canonical_label,
          ),
        ),
    [assets],
  );
  const statusMeta = REAL_ASSET_STATUS_META[report.execution_status];

  return (
    <div style={realAssetBenchStyle}>
      <div style={realAssetBenchHeaderStyle}>
        <div style={{ display: "grid", gap: 5 }}>
          <span style={eyebrowStyle}>Phase 1B.5E · real-asset execution qualification</span>
          <strong style={{ fontSize: 18 }}>Choose the real actors, then inspect why execution is or is not qualified.</strong>
          <span style={mutedStyle}>
            This bench reuses the existing single audit viewer. It does not create
            another Canvas, and it does not promote pair candidates past Builder
            fit/collision authority.
          </span>
        </div>
        <span
          style={{
            ...badgeStyle,
            color: statusMeta.color,
            borderColor: `${statusMeta.color}55`,
            background: `${statusMeta.color}14`,
          }}
        >
          {statusMeta.label}
        </span>
      </div>

      {!assetsLoaded ? (
        <div style={realAssetLoadStyle}>
          <span style={mutedStyle}>
            The Asset Library remains deferred until you request a real-asset proof.
          </span>
          <button
            type="button"
            onClick={onRequestAssets}
            disabled={assetsLoading}
            style={buttonStyle}
          >
            {assetsLoading ? "Loading assets…" : "Load Asset Library for real-asset proof"}
          </button>
          {assetError ? <div style={errorStyle}>{assetError}</div> : null}
        </div>
      ) : (
        <div style={realAssetSelectorGridStyle}>
          {resolvedRoles.map((role) => (
            <label key={role.role} style={realAssetSelectorStyle}>
              <span style={statLabelStyle}>{role.role.replace(/_/g, " ")}</span>
              <select
                value={roleAssetOverrides[role.role] ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  onRoleAssetOverride(role.role, event.target.value)
                }
                style={selectStyle}
              >
                <option value="">
                  Auto-match · {role.asset?.display_name || role.asset?.canonical_label || "fallback actor"}
                </option>
                {loadable.map((asset) => (
                  <option key={asset.asset_id} value={asset.asset_id}>
                    {asset.display_name || asset.canonical_label} · {asset.asset_id}
                  </option>
                ))}
              </select>
              <small style={mutedStyle}>
                Effective:{" "}
                {role.asset
                  ? `${role.asset.display_name || role.asset.canonical_label} · ${role.asset.asset_id}`
                  : "no loadable real asset"}
              </small>
            </label>
          ))}
        </div>
      )}

      <div style={realAssetSummaryStyle}>
        <strong>{report.summary}</strong>
        <span style={mutedStyle}>
          Runtime support: {supportLabel(report.runtime_support)}
          {report.authority_path
            ? ` · Director action: ${report.authority_path.director_action_label}`
            : " · no Phase 1B.5D asset gate for this capability"}
        </span>
      </div>

      {report.operator_proofs.length ? (
        <div style={realAssetProofGridStyle}>
          {report.operator_proofs.map((proof, index) => (
            <div
              key={`${proof.side}:${proof.role}:${proof.qualification?.operator_id ?? index}`}
              style={realAssetProofCardStyle}
            >
              <span style={statLabelStyle}>
                {proof.side} · {proof.role.replace(/_/g, " ")}
              </span>
              <strong>
                {proof.qualification?.label ?? "Asset not selected"}
              </strong>
              <span style={mutedStyle}>
                {proof.qualification
                  ? `${readableOperatorStatus(proof.qualification.status)} · ${proof.qualification.resolved_required_count}/${proof.qualification.required_count} required signals`
                  : "Qualification waits for a real asset."}
              </span>
              {proof.qualification?.missing_required_labels.length ? (
                <small style={{ ...mutedStyle, color: "#fca5a5" }}>
                  Missing: {proof.qualification.missing_required_labels.join(", ")}
                </small>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {report.pair_proofs.length ? (
        <div style={realAssetProofGridStyle}>
          {report.pair_proofs.map((proof, index) => (
            <div
              key={`${proof.source_role}:${proof.target_role}:${proof.resolution?.interaction_id ?? index}`}
              style={realAssetProofCardStyle}
            >
              <span style={statLabelStyle}>
                pair · {proof.source_role.replace(/_/g, " ")} → {proof.target_role.replace(/_/g, " ")}
              </span>
              <strong>
                {proof.resolution?.label ?? "Pair qualification waits for both assets"}
              </strong>
              <span style={mutedStyle}>
                {proof.resolution
                  ? `${readableOperatorStatus(proof.resolution.status)}${proof.resolution.score == null ? "" : ` · score ${proof.resolution.score.toFixed(2)}`}`
                  : "Select both source and target real assets."}
              </span>
              {proof.resolution?.missing_requirements.length ? (
                <small style={{ ...mutedStyle, color: "#fca5a5" }}>
                  Missing: {proof.resolution.missing_requirements.join(", ")}
                </small>
              ) : proof.resolution?.builder_validation_handoff.length ? (
                <small style={mutedStyle}>
                  Next authority: Builder validation ·{" "}
                  {proof.resolution.builder_validation_handoff[0]}
                </small>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <details style={detailsStyle}>
        <summary style={summaryStyle}>Phase 1B.5E qualification report JSON</summary>
        <pre style={preStyle}>{formatJson(report)}</pre>
      </details>
    </div>
  );
}

export function DirectorCapabilityLibraryLab() {
  const [selectedId, setSelectedId] = useState("over_shoulder");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [support, setSupport] = useState<SupportFilter>("all");
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<DirectorLibraryAsset[]>([]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [roleAssetOverrides, setRoleAssetOverrides] = useState<Record<string, string>>({});
  const [catalogLimit, setCatalogLimit] = useState(INITIAL_CATALOG_LIMIT);
  const [auditState, setAuditState] = useState<DirectorVisualAuditState>(
    () => emptyDirectorVisualAuditState(),
  );

  const selected =
    DIRECTOR_CAPABILITIES.find((capability) => capability.id === selectedId) ??
    DIRECTOR_CAPABILITIES[0];

  const capabilityAuthorityPath =
    directorCapabilityAssetAuthorityPath(selected.id);

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
    () => resolveDemoRoles(selected, assets, roleAssetOverrides),
    [assets, roleAssetOverrides, selected],
  );

  const realAssetExecutionQualification = useMemo(
    () =>
      buildDirectorRealAssetExecutionQualification(
        selected,
        resolvedRoles.map((role) => ({
          role: role.role,
          asset: role.asset,
          target_extent_m: role.blocking.target_extent_m ?? 1.6,
        })),
      ),
    [resolvedRoles, selected],
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

  const auditDefinition = useMemo(
    () => directorVisualAuditDefinition(selected),
    [selected],
  );
  const selectedReview = reviewForCapability(auditState, selected.id);
  const reviewedCount = reviewedCapabilityCount(auditState);

  const demoMoment = useMemo(() => directorCapabilityDemoMoment(selected), [selected]);
  const demoActors = useMemo(
    () => applyDirectorBlocking(
      demoMoment,
      validationActorsFromRoles(resolvedRoles),
    ),
    [demoMoment, resolvedRoles],
  );
  const demoValidation = useMemo(
    () => validateDirectorShot(demoMoment, demoActors),
    [demoActors, demoMoment],
  );
  const sceneStateContinuity = useMemo(
    () => buildDirectorSceneStateInspectorSnapshot(
      demoMoment,
      demoActors,
    ),
    [demoActors, demoMoment],
  );
  const cameraFidelity = useMemo(
    () => buildDirectorCameraFidelityReport(selected),
    [selected],
  );
  const objectMotionFidelity = useMemo(
    () => buildDirectorObjectMotionFidelityReport(selected),
    [selected],
  );
  const unnamedMotionGeneralityProof = useMemo(
    () => buildUnnamedMotionGeneralityProof(),
    [],
  );

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
      setAssetsLoaded(true);
    } catch (error) {
      setAssets([]);
      setAssetsLoaded(false);
      setAssetError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingAssets(false);
    }
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DIRECTOR_AUDIT_STORAGE_KEY);
      if (raw) {
        setAuditState(normalizeDirectorVisualAuditState(JSON.parse(raw)));
      }
    } catch (error) {
      console.warn("Director visual audit state could not be restored.", error);
    }
  }, []);

  useEffect(() => {
    setCatalogLimit(INITIAL_CATALOG_LIMIT);
  }, [category, query, support]);

  useEffect(() => {
    setRoleAssetOverrides({});
  }, [selected.id]);

  useEffect(() => {
    if (!filtered.some((capability) => capability.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? DIRECTOR_CAPABILITIES[0].id);
    }
  }, [filtered, selectedId]);

  function setRoleAssetOverride(role: string, assetId: string) {
    setRoleAssetOverrides((current) => {
      const next = { ...current };
      if (assetId) next[role] = assetId;
      else delete next[role];
      return next;
    });
  }

  function persistAuditState(next: DirectorVisualAuditState) {
    setAuditState(next);
    try {
      window.localStorage.setItem(
        DIRECTOR_AUDIT_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch (error) {
      console.warn("Director visual audit state could not be persisted.", error);
    }
  }

  function updateSelectedReview(input: {
    status?: DirectorVisualAuditStatus;
    notes?: string;
  }) {
    const current = reviewForCapability(auditState, selected.id);
    const next: DirectorVisualAuditState = {
      schema_version: DIRECTOR_VISUAL_AUDIT_VERSION,
      reviews: {
        ...auditState.reviews,
        [selected.id]: {
          ...current,
          ...input,
          capability_id: selected.id,
          updated_at: new Date().toISOString(),
        },
      },
    };
    persistAuditState(next);
  }

  function exportAudit() {
    const payload = {
      ...auditState,
      exported_at: new Date().toISOString(),
      capability_count: DIRECTOR_CAPABILITIES.length,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `myway-director-visual-audit-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function selectRelativeCapability(delta: number) {
    if (!filtered.length) return;
    const index = filtered.findIndex((item) => item.id === selected.id);
    const current = index >= 0 ? index : 0;
    const next = (current + delta + filtered.length) % filtered.length;
    setSelectedId(filtered[next].id);
  }

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
    universal_motion_program: objectMotionFidelity?.motion_program ?? null,
    multi_actor_choreography:
      objectMotionFidelity?.motion_program.program?.diagnostics
        .choreography_version
        ? {
            version:
              objectMotionFidelity.motion_program.program.diagnostics
                .choreography_version,
            recipe_ids:
              objectMotionFidelity.motion_program.program.diagnostics
                .recipe_ids ?? [],
            participant_state:
              sceneStateContinuity.outgoing_state,
          }
        : null,
    asset_directability:
      objectMotionFidelity?.motion_program.program?.diagnostics
        .directability ?? null,
    process_quantity:
      objectMotionFidelity?.motion_program.program?.diagnostics
        .process_version
        ? {
            version:
              objectMotionFidelity.motion_program.program.diagnostics
                .process_version,
            recipe_ids:
              objectMotionFidelity.motion_program.program.diagnostics
                .recipe_ids ?? [],
            process_tracks:
              objectMotionFidelity.motion_program.program.tracks.filter(
                (track) => track.channel === "process",
              ),
            persistent_state: sceneStateContinuity.outgoing_state,
          }
        : null,
    unnamed_motion_generality_proof: unnamedMotionGeneralityProof,
    scene_state_continuity: sceneStateContinuity,
    real_asset_execution_qualification: realAssetExecutionQualification,
    runtime_inputs: {
      playback_clock: "isolated audit viewer; catalogue does not rerender during playback",
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
      controlled_fidelity_fixture: cameraFidelity,
      visual_audit_fixture: auditDefinition,
      note: "Phase 1B.2 separates deterministic controlled visual qualification from optional real-asset proof. The Asset Scene Builder still uses the same Director runtime against measured geometry and its production placement solver.",
    },
    object_motion: {
      controlled_fidelity_fixture: objectMotionFidelity,
      qualification_foundation:
        objectMotionFidelity
          ? "Phase 1B.4.1 specialized fixture + sampled actor-state evidence"
          : null,
      universal_motion_program_foundation:
        "Phase 1B.4.2 deterministic renderer-neutral tracks + narrow frozen-canary adapter",
      selected_execution_route: objectMotionFidelity?.motion_program.route ?? null,
      unnamed_program_requires_capability_id:
        unnamedMotionGeneralityProof.named_director_capability_required,
      runtime_semantics_rewritten_in_this_phase: false,
      scene_state_continuity:
        "Phase 1B.4.4 immutable incoming/outgoing snapshots + deterministic moment reduction",
      multi_actor_choreography:
        "Phase 1B.4.5 stable actor IDs + per-participant deterministic tracks + persistent choreography relations",
      process_quantity:
        "Phase 1B.4.6 deterministic quantity channels + renderer-neutral carrier samples + persistent process state without root-transform proxies",
    },
    authority_vocabulary: {
      schema_version: DIRECTOR_CAPABILITY_AUTHORITY_SCHEMA_VERSION,
      layers: DIRECTOR_CAPABILITY_AUTHORITY_LAYERS,
      selected_capability_path: capabilityAuthorityPath,
      note: "Phase 1B.5D labels the authority boundaries only; it does not add a second motion runtime or move Builder fit/collision authority.",
    },
    real_asset_execution_qualification: {
      version: realAssetExecutionQualification.version,
      report: realAssetExecutionQualification,
      selected_role_overrides: roleAssetOverrides,
      directability_profile_injected_into_shared_runtime: true,
      pair_relationship_activation_in_this_phase: false,
      note: "Phase 1B.5E exposes asset/operator/pair evidence and passes selected real-asset directability into the existing shared preview runtime. Phase 1B.5E pair relationships remain proposed until downstream Builder validation.",
    },
    performance: {
      playback_clock_owner: "DirectorAuditViewer",
      canvas_render_policy: "demand",
      audit_dpr: 1,
      shadows_default: false,
      role_labels_default: false,
      camera_path_default: false,
      asset_library_loading: "deferred until real-asset proof is requested",
      offscreen_sleep: true,
      hidden_tab_sleep: true,
      catalogue_mount_limit: INITIAL_CATALOG_LIMIT,
    },
    visual_review: {
      schema_version: DIRECTOR_VISUAL_AUDIT_VERSION,
      selected_review: selectedReview,
      reviewed_capabilities: reviewedCount,
      total_capabilities: DIRECTOR_CAPABILITIES.length,
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

  const visibleFiltered = useMemo(
    () => filtered.slice(0, catalogLimit),
    [catalogLimit, filtered],
  );

  const groupedFiltered = useMemo(() => {
    const groups = new Map<string, DirectorCapability[]>();
    for (const capability of visibleFiltered) {
      const key = capability.group;
      const current = groups.get(key) ?? [];
      current.push(capability);
      groups.set(key, current);
    }
    return Array.from(groups.entries());
  }, [visibleFiltered]);

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>MyWay Probe Lab · canonical director route</div>
            <h1 style={titleStyle}>Director Capability Library</h1>
            <p style={subtitleStyle}>
              A visual proof environment for the Director actions GLM 5.2 may
              use when it directs a scene. Phase 1B.5D keeps those actions distinct
              from internal asset-qualification operators, pair-interaction lanes,
              and Builder placement relations. Phase 1B.5E adds selectable real-asset
              execution qualification while preserving the same shared runtime.
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
          <Stat label="Reviewed" value={reviewedCount} detail="persisted locally in audit mode" />
          <Stat
            label="Library assets"
            value={isLoadingAssets ? "…" : assetsLoaded ? loadableAssetCount : "deferred"}
            detail="deferred until real-asset execution proof"
          />
          <Stat label="WebGL canvases" value={1} detail="DPR 1 · demand-rendered · sleeps offscreen" />
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

            <RealAssetExecutionQualificationPanel
              capability={selected}
              assets={assets}
              assetsLoaded={assetsLoaded}
              assetsLoading={isLoadingAssets}
              assetError={assetError}
              resolvedRoles={resolvedRoles}
              roleAssetOverrides={roleAssetOverrides}
              onRoleAssetOverride={setRoleAssetOverride}
              onRequestAssets={() => void loadAssets()}
              report={realAssetExecutionQualification}
            />

            <DirectorAuditViewer
              capability={selected}
              realRoles={resolvedRoles}
              realAssetCount={loadableAssetCount}
              realAssetsLoaded={assetsLoaded}
              realAssetsLoading={isLoadingAssets}
              realAssetError={assetError}
              onRequestRealAssets={() => void loadAssets()}
            />

            <div style={auditPanelStyle}>
              <div style={auditHeaderStyle}>
                <div style={{ display: "grid", gap: 5 }}>
                  <span style={eyebrowStyle}>Visual audit</span>
                  <strong style={{ fontSize: 18 }}>
                    {reviewedCount}/{DIRECTOR_CAPABILITIES.length} capabilities reviewed
                  </strong>
                  <span style={mutedStyle}>
                    The controlled fixture is the qualification proof. Use real assets only
                    to check whether the capability generalizes.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => selectRelativeCapability(-1)} style={buttonStyle}>
                    Previous
                  </button>
                  <button type="button" onClick={() => selectRelativeCapability(1)} style={buttonStyle}>
                    Next
                  </button>
                  <button type="button" onClick={exportAudit} style={buttonStyle}>
                    Export audit JSON
                  </button>
                </div>
              </div>

              <div style={auditExpectationsStyle}>
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={statLabelStyle}>Controlled fixture</span>
                  <strong>{auditDefinition.fixture.replace(/_/g, " ")}</strong>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={statLabelStyle}>Expected behavior</span>
                  {auditDefinition.expected_behavior.map((item) => (
                    <span key={item} style={auditExpectationItemStyle}>
                      <span aria-hidden="true">•</span>
                      <span>{item}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div style={auditStatusRowStyle}>
                {([
                  ["pass", "Pass"],
                  ["needs_work", "Needs work"],
                  ["blocked", "Blocked / needs metadata"],
                  ["approximate_ok", "Approximation acceptable"],
                ] as const).map(([statusValue, label]) => (
                  <button
                    key={statusValue}
                    type="button"
                    onClick={() => updateSelectedReview({ status: statusValue })}
                    style={{
                      ...auditStatusButtonStyle,
                      ...(selectedReview.status === statusValue
                        ? auditStatusButtonActiveStyle
                        : null),
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateSelectedReview({
                      status: "unreviewed",
                      notes: "",
                    })
                  }
                  style={auditStatusButtonStyle}
                >
                  Clear review
                </button>
              </div>

              <textarea
                value={selectedReview.notes}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  updateSelectedReview({ notes: event.target.value })
                }
                placeholder="Visual notes: what looks wrong, what should be different, or what metadata/runtime support is missing?"
                style={auditNotesStyle}
                rows={3}
              />

              {auditDefinition.compare_capability_ids.length ? (
                <div style={compareRowStyle}>
                  <span style={statLabelStyle}>Compare with</span>
                  {auditDefinition.compare_capability_ids.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedId(id)}
                      style={compareButtonStyle}
                    >
                      {id.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {cameraFidelity ? (
              <CameraFidelityEvidence report={cameraFidelity} />
            ) : null}
            {objectMotionFidelity ? (
              <ObjectMotionFidelityEvidence report={objectMotionFidelity} />
            ) : null}

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
                <span style={mutedStyle}>
                  Only {Math.min(catalogLimit, filtered.length)} cards are mounted at once.
                  Search or filter before loading more.
                </span>
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
                {isLoadingAssets
                  ? "Loading assets…"
                  : assetsLoaded
                    ? "Refresh optional Asset Library"
                    : "Load optional Asset Library"}
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
              {catalogLimit < filtered.length ? (
                <button
                  type="button"
                  onClick={() => setCatalogLimit((value) => value + INITIAL_CATALOG_LIMIT)}
                  style={buttonStyle}
                >
                  Load {Math.min(INITIAL_CATALOG_LIMIT, filtered.length - catalogLimit)} more
                </button>
              ) : null}
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
                not renderer code. Phase 1B.2 keeps the catalogue static while a
                lightweight isolated audit viewer exercises the compiled direction.
                Phase 1B.4.2 exposes the deterministic Universal Motion Program
                underneath qualified actor-motion canaries without adding WebGL work.
                Phase 1B.4.4 exposes immutable incoming/outgoing scene state
                so continuity can be inspected without mutable playback history.
                Phase 1B.4.5 composes predeclared actors into coordinated assembly,
                separation, containment, connection, merge, split, and scatter recipes.
                Phase 1B.4.6 separates Fill/Drain/Accumulate quantities and
                Flow/Emit carrier transport from rigid actor transforms. Phase
                1B.5D then names the authority boundary: Director actions describe
                intent, asset operators qualify real-asset evidence, pair lanes
                qualify compatibility, and Builder placement owns final measured fit.
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
            <JsonPanel
              title="1B. Phase 1B.5D capability authority path"
              value={{
                schema_version: DIRECTOR_CAPABILITY_AUTHORITY_SCHEMA_VERSION,
                layers: DIRECTOR_CAPABILITY_AUTHORITY_LAYERS,
                selected_capability_path: capabilityAuthorityPath,
                interpretation: capabilityAuthorityPath
                  ? "Mapped Director action. Internal operator/pair/placement names are implementation roles, not alternate Director commands."
                  : "No asset-authority mapping is required for this capability in Phase 1B.5D.",
              }}
            />
            <JsonPanel title="2. Compiled preview execution" value={compiledExecution} />
            {cameraFidelity ? (
              <JsonPanel title="3. Controlled camera fidelity evidence" value={cameraFidelity} />
            ) : null}
            {objectMotionFidelity ? (
              <JsonPanel
                title="3. Controlled object-motion fidelity evidence"
                value={objectMotionFidelity}
              />
            ) : null}
            {objectMotionFidelity ? (
              <JsonPanel
                title="4. Universal Motion Program execution"
                value={{
                  selected_actor_program: objectMotionFidelity.motion_program,
                  unnamed_generality_proof: unnamedMotionGeneralityProof,
                }}
              />
            ) : null}
            <JsonPanel
              title={objectMotionFidelity ? "5. Scene state continuity" : "4. Scene state continuity"}
              value={sceneStateContinuity}
            />
            <JsonPanel
              title={
                objectMotionFidelity
                  ? "6. Validation and promotion diagnostics"
                  : cameraFidelity
                    ? "5. Validation and promotion diagnostics"
                    : "5. Validation and promotion diagnostics"
              }
              value={diagnostics}
            />
          </div>

          <div style={honestyStyle}>
            <strong>Important boundary</strong>
            <span>
              This library visually proves composable V2 direction. Director
              action labels are the semantic language; Directable Asset operators
              and pair interactions are internal qualification mechanisms. Final
              placement, stability, and physical collision authority remains in the
              Asset Scene Builder, which consumes the same Director language.
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}


const realAssetBenchStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(167,139,250,0.24)",
  background: "linear-gradient(145deg, rgba(76,29,149,0.14), rgba(2,6,23,0.84))",
};

const realAssetBenchHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const realAssetLoadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  padding: 12,
  borderRadius: 14,
  border: "1px dashed rgba(255,255,255,0.12)",
  background: "rgba(15,23,42,0.48)",
};

const realAssetSelectorGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 10,
};

const realAssetSelectorStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 10,
  borderRadius: 13,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(2,6,23,0.62)",
};

const realAssetSummaryStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 11,
  borderRadius: 13,
  border: "1px solid rgba(125,211,252,0.14)",
  background: "rgba(14,116,144,0.08)",
};

const realAssetProofGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 9,
};

const realAssetProofCardStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  padding: 10,
  borderRadius: 13,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(2,6,23,0.66)",
};

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

const fidelityPanelStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(56,189,248,0.2)",
  background: "linear-gradient(145deg, rgba(8,47,73,0.28), rgba(2,6,23,0.78))",
};

const fidelityHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const fidelitySamplesStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const fidelitySampleStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(2,6,23,0.58)",
};

const fidelityVectorStyle: CSSProperties = {
  color: "#7dd3fc",
  fontSize: 10,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
};

const fidelityChecksStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 8,
};

const fidelityCheckStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px minmax(0, 1fr)",
  gap: 7,
  alignItems: "start",
  padding: "8px 10px",
  borderRadius: 12,
  background: "rgba(15,23,42,0.58)",
};

const fidelityLimitationStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "9px 11px",
  borderRadius: 12,
  border: "1px solid rgba(251,191,36,0.2)",
  background: "rgba(120,53,15,0.16)",
  color: "rgba(254,243,199,0.88)",
  fontSize: 12,
  lineHeight: 1.5,
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


const auditPanelStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(167,139,250,0.22)",
  background: "linear-gradient(145deg, rgba(76,29,149,0.18), rgba(2,6,23,0.8))",
};

const auditHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const auditExpectationsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 0.35fr) minmax(0, 1fr)",
  gap: 12,
  padding: 12,
  borderRadius: 14,
  background: "rgba(15,23,42,0.56)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const auditExpectationItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "12px minmax(0, 1fr)",
  gap: 7,
  color: "rgba(226,232,240,0.78)",
  fontSize: 12,
  lineHeight: 1.5,
};

const auditStatusRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const auditStatusButtonStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.05)",
  color: "#cbd5e1",
  padding: "8px 11px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 11,
};

const auditStatusButtonActiveStyle: CSSProperties = {
  borderColor: "rgba(167,139,250,0.68)",
  background: "rgba(124,58,237,0.2)",
  color: "#f5f3ff",
};

const auditNotesStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  borderRadius: 12,
  border: "1px solid rgba(167,139,250,0.25)",
  background: "#020617",
  color: "white",
  padding: 11,
  lineHeight: 1.5,
  font: "inherit",
  fontSize: 12,
};

const compareRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
};

const compareButtonStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(56,189,248,0.2)",
  background: "rgba(14,165,233,0.08)",
  color: "#bae6fd",
  padding: "6px 9px",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 800,
};