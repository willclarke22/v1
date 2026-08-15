import type { MyWayAssetRecord } from "../assets/asset-types";
import { compileDirectableAssetAffordanceGraph } from "./directable-asset-compiler";
import type { DirectableAssetAffordanceKind } from "./affordance-graph-contract";
import type { DirectableAssetOperatorId } from "./interaction-operator-contract";
import { qualifyDirectableAssetForAllOperators } from "./interaction-operator-resolver";

export const DIRECTABLE_ASSET_LIBRARY_AUDIT_VERSION =
  "director_directable_asset_library_audit_phase1b5b1_v1" as const;

export type DirectableAssetLibraryAuditV1 = {
  version: typeof DIRECTABLE_ASSET_LIBRARY_AUDIT_VERSION;
  asset_count: number;
  geometry_profile_count: number;
  measured_geometry_count: number;
  rigged_count: number;
  directability_override_count: number;
  affordance_counts: Record<string, number>;
  executable_affordance_counts: Record<string, number>;
  candidate_affordance_counts: Record<string, number>;
  operator_status_counts: Record<string, number>;
  top_missing_requirements: Array<{ label: string; count: number }>;
  deep_geometry_note: string;
};

export function buildDirectableAssetLibraryAudit(
  assets: readonly MyWayAssetRecord[],
  operatorIds: readonly DirectableAssetOperatorId[],
): DirectableAssetLibraryAuditV1 {
  const affordanceCounts = new Map<DirectableAssetAffordanceKind, number>();
  const executableAffordanceCounts = new Map<DirectableAssetAffordanceKind, number>();
  const candidateAffordanceCounts = new Map<DirectableAssetAffordanceKind, number>();
  const statusCounts = new Map<string, number>();
  const missingCounts = new Map<string, number>();

  for (const asset of assets) {
    const graph = compileDirectableAssetAffordanceGraph(asset);
    const seenKinds = new Set<DirectableAssetAffordanceKind>();
    const seenExecutableKinds = new Set<DirectableAssetAffordanceKind>();
    const seenCandidateKinds = new Set<DirectableAssetAffordanceKind>();
    for (const affordance of graph.affordances) {
      if (!seenKinds.has(affordance.kind)) {
        seenKinds.add(affordance.kind);
        affordanceCounts.set(
          affordance.kind,
          (affordanceCounts.get(affordance.kind) ?? 0) + 1,
        );
      }
      if (
        affordance.evidence.executable &&
        !seenExecutableKinds.has(affordance.kind)
      ) {
        seenExecutableKinds.add(affordance.kind);
        executableAffordanceCounts.set(
          affordance.kind,
          (executableAffordanceCounts.get(affordance.kind) ?? 0) + 1,
        );
      }
      if (
        !affordance.evidence.executable &&
        (affordance.kind === "containment_candidate" ||
          affordance.kind === "support_surface" ||
          affordance.kind === "surface_contact_region") &&
        !seenCandidateKinds.has(affordance.kind)
      ) {
        seenCandidateKinds.add(affordance.kind);
        candidateAffordanceCounts.set(
          affordance.kind,
          (candidateAffordanceCounts.get(affordance.kind) ?? 0) + 1,
        );
      }
    }
    for (const qualification of qualifyDirectableAssetForAllOperators(
      graph,
      operatorIds,
    )) {
      statusCounts.set(
        qualification.status,
        (statusCounts.get(qualification.status) ?? 0) + 1,
      );
      for (const label of qualification.missing_required_labels) {
        missingCounts.set(label, (missingCounts.get(label) ?? 0) + 1);
      }
    }
  }

  return {
    version: DIRECTABLE_ASSET_LIBRARY_AUDIT_VERSION,
    asset_count: assets.length,
    geometry_profile_count: assets.filter((asset) => Boolean(asset.geometry_profile)).length,
    measured_geometry_count: assets.filter(
      (asset) => asset.geometry_profile?.audit?.status === "measured",
    ).length,
    rigged_count: assets.filter((asset) => asset.rigged).length,
    directability_override_count: assets.filter(
      (asset) => Boolean(asset.directability_overrides),
    ).length,
    affordance_counts: Object.fromEntries(
      [...affordanceCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    ),
    executable_affordance_counts: Object.fromEntries(
      [...executableAffordanceCounts.entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
    ),
    candidate_affordance_counts: Object.fromEntries(
      [...candidateAffordanceCounts.entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
    ),
    operator_status_counts: Object.fromEntries(
      [...statusCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    ),
    top_missing_requirements: [...missingCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([label, count]) => ({ label, count })),
    deep_geometry_note:
      "Library-wide audit uses stored geometry/directability evidence only. Stored raw interiors/exterior regions are audited separately from executable semantic affordances. Actual GLB surface-shape inference remains on-demand per selected asset so the diagnostic page does not bulk-load every model.",
  };
}
