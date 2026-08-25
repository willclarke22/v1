import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DirectableAssetTopOpeningCandidateV1 } from "../../sandbox/probe-lab/directability/affordance-graph-contract";
import {
  DIRECTOR_QUALIFICATION_PHYSICAL_INSPECTION_VERSION,
  DIRECTOR_QUALIFICATION_PHYSICAL_TOPOLOGY_VERSION,
  inferDirectorQualificationOpenCavityFromRayDepths,
  inferDirectorQualificationSurfaceContactsFromRayHits,
  type DirectorQualificationCavityRayDepth,
  type DirectorQualificationPhysicalBounds,
  type DirectorQualificationRayContactHit,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-physical-inspection";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function approx(left: number, right: number, epsilon = 0.05) {
  return Math.abs(left - right) <= epsilon;
}

const bounds: DirectorQualificationPhysicalBounds = {
  min: [-1, 0, -1],
  max: [1, 1.2, 1],
  size: [2, 1.2, 2],
  center: [0, 0.6, 0],
};

function rightPatchHits() {
  const hits: DirectorQualificationRayContactHit[] = [];
  // Broad continuous body surface at x=.62. In the right-side grid, U is Y and
  // V is Z. This should become one usable contiguous patch.
  for (let u = 3; u <= 8; u += 1) {
    for (let v = 3; v <= 8; v += 1) {
      hits.push({
        u_index: u,
        v_index: v,
        local_position: [0.62, 0.05 + u * 0.09, -0.9 + v * 0.15],
        local_normal: [1, 0, 0],
      });
    }
  }
  // Misleading global +X protrusions/islands. They are disconnected and must
  // not expand the broad patch to the x=1.0 whole-object bound.
  for (const [u, v] of [[0, 0], [0, 11], [11, 0], [11, 11]] as const) {
    hits.push({
      u_index: u,
      v_index: v,
      local_position: [1, 0.05 + u * 0.09, -0.9 + v * 0.15],
      local_normal: [1, 0, 0],
    });
  }
  return hits;
}

function openingCandidate(): DirectableAssetTopOpeningCandidateV1 {
  return {
    axis_name: "y",
    axis: [0, 1, 0],
    score: 0.94,
    confidence: 0.92,
    center_void_score: 0.96,
    rim_angular_coverage: 0.94,
    opening_size_ratio: [0.8, 0.8],
    local_center: [0, 1, 0],
    opening_size: [0.8, 0.8],
    access_direction: [0, 1, 0],
    note: "synthetic rim proposal",
  };
}

function cavityDepths(depth: number): DirectorQualificationCavityRayDepth[] {
  const output: DirectorQualificationCavityRayDepth[] = [];
  for (let u = 0; u < 7; u += 1) {
    for (let v = 0; v < 7; v += 1) {
      output.push({ u_index: u, v_index: v, depth_m: depth });
    }
  }
  return output;
}

function main() {
  assert(
    DIRECTOR_QUALIFICATION_PHYSICAL_INSPECTION_VERSION ===
      "director_qualification_physical_inspection_phase1b7a11a9_v1",
    "A.11A.10 must preserve the frozen A.11A.9 physical-inspection version.",
  );
  assert(
    DIRECTOR_QUALIFICATION_PHYSICAL_TOPOLOGY_VERSION ===
      "director_qualification_physical_topology_phase1b7a11a10_v1",
    "A.11A.10 topology version drifted.",
  );

  const contacts = inferDirectorQualificationSurfaceContactsFromRayHits({
    side: "right",
    grid_size: 12,
    local_bounds: bounds,
    hits: rightPatchHits(),
  });
  assert(contacts.length > 0, "A.11A.10 contiguous right-side ray patch did not resolve.");
  const broad = contacts[0]!;
  assert(
    broad.evidence_method === "raycast_contiguous_patch" &&
      broad.topology.method === "raycast_contiguous_patch" &&
      broad.topology.center_hit &&
      broad.topology.occupancy_ratio >= 0.68,
    `A.11A.10 contact topology evidence is incomplete: ${JSON.stringify(broad)}.`,
  );
  assert(
    approx(broad.local_position[0], 0.62, 0.04) && broad.local_position[0] < 0.8,
    `Disconnected x=1.0 protrusions must not replace the occupied x=.62 body surface: ${broad.local_position[0]}.`,
  );
  assert(
    !contacts.some(
      (candidate) =>
        candidate.contact_size[0] > bounds.size[1] * 0.8 &&
        candidate.contact_size[1] > bounds.size[2] * 0.8,
    ),
    "Disconnected corner islands were incorrectly promoted into one whole-side contact rectangle.",
  );

  const containerBounds: DirectorQualificationPhysicalBounds = {
    min: [-0.5, 0, -0.5],
    max: [0.5, 1, 0.5],
    size: [1, 1, 1],
    center: [0, 0.5, 0],
  };
  const openCavity = inferDirectorQualificationOpenCavityFromRayDepths({
    opening: openingCandidate(),
    local_bounds: containerBounds,
    grid_size: 7,
    sampled_opening_size: [0.5, 0.5],
    depths: cavityDepths(0.94),
  });
  assert(
    openCavity?.method === "raycast_open_cavity" &&
      openCavity.center_access_clear &&
      openCavity.access_clear_ratio >= 0.52 &&
      openCavity.cavity_depth_m > 0.8,
    `Open-cavity ray canary failed: ${JSON.stringify(openCavity)}.`,
  );

  const closedLid = inferDirectorQualificationOpenCavityFromRayDepths({
    opening: openingCandidate(),
    local_bounds: containerBounds,
    grid_size: 7,
    sampled_opening_size: [0.5, 0.5],
    depths: cavityDepths(0.02),
  });
  assert(
    closedLid === null,
    `A solid lid must fail closed even when point samples propose a rim: ${JSON.stringify(closedLid)}.`,
  );

  const inspection = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-physical-inspection.ts",
  );
  for (const marker of [
    "DIRECTOR_QUALIFICATION_PHYSICAL_TOPOLOGY_VERSION",
    "raycast_contiguous_patch",
    "raycast_open_cavity",
    "Strict four-neighbour topology",
    "centerHit || occupancyRatio < 0.68",
    "maximumExteriorDepth",
    "central 62%",
    "containment_topology: containmentTopology",
  ]) {
    assert(inspection.includes(marker), `A.11A.10 inspection marker missing: ${marker}`);
  }

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    'candidate.evidence_method !== "raycast_contiguous_patch"',
    'topology.method !== "raycast_contiguous_patch"',
    'evidence_source: "browser_gltf_raycast_surface"',
    'evidence_source: "semantic_plus_browser_raycast_topology"',
    "satisfies DirectorQualificationPhysicalRegionOverride",
    "directorQualificationAttachedProofReadabilityScore",
    "directorQualificationContactOverridesFromInspection(inspection).length",
  ]) {
    assert(room.includes(marker), `A.11A.10 Qualification Room marker missing: ${marker}`);
  }
  assert(
    room.includes("semantic_plus_browser_geometry") &&
      room.includes("browser_gltf_surface_sample"),
    "A.11A.10 must preserve A.11A.9 predecessor evidence labels for lineage/static verification.",
  );
  assert(
    room.includes("On Surface measured-region canary") &&
      room.includes("onSurfaceCanaryCount") &&
      room.includes("? 3") &&
      room.includes(": 6"),
    "A.11A.10 must not disturb the frozen six-proof On Surface gauntlet.",
  );

  const contract = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-contract.ts",
  );
  for (const marker of [
    "DirectorQualificationSurfaceTopologyEvidence",
    "DirectorQualificationContainmentTopologyEvidence",
    'method: "raycast_contiguous_patch"',
    'method: "raycast_open_cavity"',
    '"browser_gltf_raycast_surface"',
    '"semantic_plus_browser_raycast_topology"',
  ]) {
    assert(contract.includes(marker), `A.11A.10 evidence-contract marker missing: ${marker}`);
  }

  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  assert(
    registry.includes("physical_contact_readability_oblique") &&
      registry.includes('capability.id === "attached_to"') &&
      registry.includes('? "high_angle"') &&
      registry.includes(': "three_quarter_front"'),
    "Attached-To qualification must retain an oblique, contact-readable demo camera while Inside stays high-angle.",
  );

  const a11a9 = source(
    "scripts/sandbox/verify-director-support-containment-physical-surface-truth-phase1b7a11a9.ts",
  );
  const a11a8 = source(
    "scripts/sandbox/verify-director-support-containment-scale-parity-phase1b7a11a8.ts",
  );
  const a11a7 = source(
    "scripts/sandbox/verify-director-support-containment-phase1b7a11a7.ts",
  );
  assert(
    a11a9.includes("director_qualification_physical_inspection_phase1b7a11a9_v1") &&
      a11a8.includes("0.17 m canary") &&
      a11a7.includes("On Surface measured-region canary"),
    "A.11A.10 must preserve A.11A.9/A.11A.8/A.11A.7 earned boundaries.",
  );

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  assert(
    readme.includes("Phase 1B.7A.11A.10 — Support & containment physical topology hardening"),
    "Director README is missing the A.11A.10 note.",
  );

  console.log(
    "Director Support & containment Phase 1B.7A.11A.10 physical-topology verification passed.",
  );
  console.log(
    `Continuous contact patch ${broad.id} is ray-occupied at x=${broad.local_position[0].toFixed(2)}; disconnected islands do not become one broad patch; open cavity depth=${openCavity.cavity_depth_m.toFixed(3)}m while the solid-lid canary fails closed.`,
  );
  console.log(
    "On Ground / On Surface remain frozen. Attached To requires contiguous ray-hit surface truth and an oblique proof; Inside requires ray-confirmed access plus cavity depth before semantic containment can qualify.",
  );
}

main();
