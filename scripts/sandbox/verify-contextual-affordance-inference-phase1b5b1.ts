import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  MyWayAssetGeometryProfileV1,
  MyWayAssetRecord,
} from "../../sandbox/probe-lab/assets/asset-types";
import {
  DIRECTABLE_ASSET_GEOMETRY_SHAPE_INSPECTION_SCHEMA_VERSION,
  DIRECTABLE_ASSET_STRUCTURE_INSPECTION_SCHEMA_VERSION,
  type DirectableAssetStructureInspectionV1,
} from "../../sandbox/probe-lab/directability/affordance-graph-contract";
import {
  compileDirectableAssetAffordanceGraph,
} from "../../sandbox/probe-lab/directability/directable-asset-compiler";
import {
  buildDirectableAssetLibraryAudit,
  DIRECTABLE_ASSET_LIBRARY_AUDIT_VERSION,
} from "../../sandbox/probe-lab/directability/directable-asset-library-audit";
import {
  DIRECTABLE_ASSET_CONTEXTUAL_INFERENCE_VERSION,
  inferGeometryShapeInspectionFromSamples,
  qualifiedGeometryRollCandidates,
} from "../../sandbox/probe-lab/directability/geometry-affordance-inference";
import {
  DIRECTABLE_ASSET_OPERATOR_SPECS,
  type DirectableAssetOperatorId,
} from "../../sandbox/probe-lab/directability/interaction-operator-contract";
import {
  qualifyDirectableAssetForOperator,
} from "../../sandbox/probe-lab/directability/interaction-operator-resolver";
import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const BASE_GEOMETRY: MyWayAssetGeometryProfileV1 = {
  schema_version: "myway_asset_geometry_profile_v1",
  coordinate_space: "normalized_glb_y_up",
  local_bounds: {
    min: [-0.5, 0, -0.5],
    max: [0.5, 1, 0.5],
    size: [1, 1, 1],
    center: [0, 0.5, 0],
  },
  orientation: {
    up_axis: [0, 1, 0],
    forward_axis: [0, 0, 1],
  },
  bottom_contact_region: {
    id: "bottom_contact",
    center: [0, 0, 0],
    normal: [0, 1, 0],
    size: [0.8, 0.8],
    area: 0.64,
    confidence: 0.96,
  },
  support_surfaces: [],
  interior_volumes: [],
  attachment_regions: [],
  collision_boxes: [],
  primary_support_surface_id: null,
  audit: {
    status: "measured",
    confidence: 0.94,
    warnings: [],
    mesh_object_count: 1,
    included_mesh_count: 1,
    excluded_mesh_names: [],
    triangle_count: 1200,
    support_surface_count: 0,
  },
  generated_at: "2026-08-14T00:00:00.000Z",
  generator: "phase1b5b1_verifier",
};

function asset(
  id: string,
  overrides: Partial<MyWayAssetRecord> = {},
): MyWayAssetRecord {
  return {
    asset_id: id,
    canonical_label: id,
    display_name: id,
    aliases: [],
    semantic_tags: [],
    asset_type: "glb",
    domain: "generic",
    source_type: "manual",
    public_path: `/sandbox-assets/myway/${id}.glb`,
    dimensions_m: [1, 1, 1],
    default_scale: 1,
    default_rotation: [0, 0, 0],
    ground_offset_m: 0,
    rigged: false,
    animation_clips: [],
    quality_score: 1,
    reuse_count: 0,
    license_kind: "self_owned",
    license_status: "app_ready",
    commercial_use_allowed: true,
    raw_redistribution_allowed: true,
    safe_to_use_in_sandbox: true,
    safe_to_promote_to_app: true,
    status: "approved",
    scene_review_status: "approved",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
    geometry_profile: BASE_GEOMETRY,
    ...overrides,
  };
}

function structureWithRollCandidate(
  axisName: "x" | "y" | "z",
  score = 0.92,
): DirectableAssetStructureInspectionV1 {
  return {
    schema_version: DIRECTABLE_ASSET_STRUCTURE_INSPECTION_SCHEMA_VERSION,
    source: "browser_gltf",
    node_names: ["Root"],
    mesh_names: ["Mesh"],
    bone_names: [],
    animation_clip_names: [],
    geometry_shape: {
      schema_version: DIRECTABLE_ASSET_GEOMETRY_SHAPE_INSPECTION_SCHEMA_VERSION,
      source: "browser_gltf_surface_sample",
      sample_count: 2400,
      triangle_count: 1200,
      local_bounds_size: [1, 0.35, 1],
      roll_candidates: [
        {
          axis_name: axisName,
          axis: axisName === "x" ? [1, 0, 0] : axisName === "y" ? [0, 1, 0] : [0, 0, 1],
          score,
          confidence: 0.91,
          effective_radius_ratio: 0.5,
          projected_span_ratio: 0.98,
          axial_span_ratio: 0.35,
          angular_coverage: 0.96,
          boundary_circularity: 0.94,
          note: "synthetic circular surface candidate",
        },
      ],
    },
  };
}

assert(
  DIRECTABLE_ASSET_CONTEXTUAL_INFERENCE_VERSION ===
    "director_contextual_affordance_inference_phase1b5b1_v1",
  "Unexpected Phase 1B.5B.1 contextual inference version.",
);
assert(
  DIRECTABLE_ASSET_LIBRARY_AUDIT_VERSION ===
    "director_directable_asset_library_audit_phase1b5b1_v1",
  "Unexpected Phase 1B.5B.1 library audit version.",
);

const ringSamples: Array<[number, number, number]> = [];
for (let index = 0; index < 96; index += 1) {
  const angle = (index / 96) * Math.PI * 2;
  for (const y of [-0.15, 0.15]) {
    ringSamples.push([Math.cos(angle) * 0.5, y, Math.sin(angle) * 0.5]);
  }
}
const ringInspection = inferGeometryShapeInspectionFromSamples(ringSamples, 1000);
assert(
  ringInspection &&
    qualifiedGeometryRollCandidates(ringInspection).some((item) => item.axis_name === "y"),
  "Circular/ring surface samples must produce a strong geometry-derived rolling axis.",
);

const squareSamples: Array<[number, number, number]> = [];
for (let index = 0; index <= 30; index += 1) {
  const t = -0.5 + index / 30;
  for (const y of [-0.15, 0.15]) {
    squareSamples.push(
      [-0.5, y, t],
      [0.5, y, t],
      [t, y, -0.5],
      [t, y, 0.5],
    );
  }
}
const squareInspection = inferGeometryShapeInspectionFromSamples(squareSamples, 1000);
assert(
  squareInspection && qualifiedGeometryRollCandidates(squareInspection).length === 0,
  "Square/box perimeter samples must fail the circular-boundary roll threshold.",
);

const bagelLike = compileDirectableAssetAffordanceGraph(
  asset("bagel_like", {
    geometry_profile: {
      ...BASE_GEOMETRY,
      local_bounds: {
        min: [-0.5, 0, -0.5],
        max: [0.5, 0.35, 0.5],
        size: [1, 0.35, 1],
        center: [0, 0.175, 0],
      },
    },
  }),
  { structure: structureWithRollCandidate("y") },
);
const inferredRolling = bagelLike.affordances.find(
  (item) => item.kind === "rolling",
);
assert(
  inferredRolling?.kind === "rolling" &&
    inferredRolling.derivation === "geometry_inference" &&
    inferredRolling.evidence.qualification === "inferred" &&
    inferredRolling.evidence.executable,
  "A strong actual-geometry roll candidate must compile as inferred executable evidence rather than explicit metadata.",
);
assert(
  inferredRolling.kind === "rolling" &&
    inferredRolling.default_pose === "requires_reorientation" &&
    inferredRolling.context_requirements.some((item) => item.includes("reorient")),
  "A Y-axis wheel/bagel candidate in a Y-up default pose must require reorientation before floor rolling.",
);
const bagelRoll = qualifyDirectableAssetForOperator(bagelLike, "roll");
assert(
  bagelRoll.status === "contextual_candidate" &&
    bagelRoll.asset_qualification_level === "inferred" &&
    bagelRoll.context_requirements.length >= 2,
  "Geometry-inferred Roll must remain contextual rather than being promoted to executable_as_is.",
);

const weakShape = compileDirectableAssetAffordanceGraph(
  asset("box_like"),
  {
    structure: {
      ...structureWithRollCandidate("y", 0.61),
      geometry_shape: {
        ...structureWithRollCandidate("y", 0.61).geometry_shape!,
        roll_candidates: [
          {
            ...structureWithRollCandidate("y", 0.61).geometry_shape!.roll_candidates[0],
            score: 0.61,
            confidence: 0.62,
            angular_coverage: 0.55,
            boundary_circularity: 0.36,
          },
        ],
      },
    },
  },
);
assert(
  !weakShape.affordances.some((item) => item.kind === "rolling") &&
    qualifyDirectableAssetForOperator(weakShape, "roll").status ===
      "requires_asset_authoring",
  "Weak/non-circular geometry must fail closed instead of manufacturing Roll support.",
);

const explicitRolling = compileDirectableAssetAffordanceGraph(
  asset("explicit_wheel", {
    directability_overrides: {
      schema_version: "myway_asset_directability_overrides_v1",
      rolling: {
        radius_m: 0.42,
        axis: [0, 0, 1],
        local_center: [0, 0.42, 0],
        confidence: 0.99,
      },
    },
  }),
  { structure: structureWithRollCandidate("y") },
);
const explicit = explicitRolling.affordances.find((item) => item.kind === "rolling");
assert(
  explicit?.kind === "rolling" &&
    explicit.derivation === "explicit" &&
    qualifyDirectableAssetForOperator(explicitRolling, "roll").status ===
      "executable_as_is",
  "Explicit verified rolling metadata must outrank geometry inference and preserve executable-as-is behavior.",
);

const metadataOnly = compileDirectableAssetAffordanceGraph(
  asset("metadata_only", {
    affordances: ["rollable"],
    geometry_profile: null,
  }),
);
assert(
  !metadataOnly.affordances.some((item) => item.kind === "rolling") &&
    metadataOnly.suggestions.length === 1,
  "Free-form metadata must remain suggestion-only after contextual inference is added.",
);

const operatorIds = DIRECTABLE_ASSET_OPERATOR_SPECS.map(
  (item) => item.id,
) as DirectableAssetOperatorId[];
const libraryAudit = buildDirectableAssetLibraryAudit(
  [asset("plain"), asset("rigged", { rigged: true })],
  operatorIds,
);
assert(
  libraryAudit.asset_count === 2 &&
    libraryAudit.geometry_profile_count === 2 &&
    libraryAudit.deep_geometry_note.includes("on-demand"),
  "Library audit must stay cheap and explicitly keep deep GLB geometry inference on-demand.",
);

const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, item) => {
    counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  supportCounts.direct === 102 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.5B.1 must not change Director support classifications: ${JSON.stringify(supportCounts)}.`,
);

const browserInspector = source(
  "sandbox/probe-lab/directability/ui/browser-asset-structure-inspection.ts",
);
for (const marker of [
  "MAX_VERTEX_SAMPLES",
  "MAX_TRIANGLE_SAMPLES",
  "inferGeometryShapeInspectionFromSamples",
  "gltf.scene.updateMatrixWorld(true)",
]) {
  assert(browserInspector.includes(marker), `Geometry inspector marker missing: ${marker}.`);
}
assert(
  !browserInspector.includes("<Canvas") && !browserInspector.includes("@react-three/fiber"),
  "Deep geometry inspection must remain Canvas-free.",
);
const inferenceSource = source(
  "sandbox/probe-lab/directability/geometry-affordance-inference.ts",
);
for (const marker of [
  "DIRECTABLE_ASSET_ROLL_ANGLE_BINS = 24",
  "boundaryCircularity",
  "scoreRollAxisFromPointSamples",
  "qualifiedGeometryRollCandidates",
]) {
  assert(inferenceSource.includes(marker), `Geometry inference marker missing: ${marker}.`);
}

const qualificationLab = source(
  "sandbox/probe-lab/directability/ui/directable-asset-qualification-lab.tsx",
);
for (const marker of [
  "Phase 1B.5B.1",
  "Library-wide qualification audit",
  "Geometry-derived candidates",
  "Contextual candidate",
  "Scene context required",
  "Deep surface-shape inference is intentionally on-demand",
]) {
  assert(qualificationLab.includes(marker), `Qualification lab marker missing: ${marker}.`);
}
assert(
  !qualificationLab.includes("<Canvas"),
  "Directable Asset Qualification must not add a second WebGL Canvas.",
);

const readme = source("sandbox/probe-lab/directability/README.md").toLowerCase();
for (const concept of [
  "phase 1b.5b.1",
  "contextual affordance inference",
  "geometry-inferred",
  "on-demand",
  "semantic truth",
]) {
  assert(readme.includes(concept), `Directability README missing Phase 1B.5B.1 concept: ${concept}.`);
}

console.log("Contextual affordance inference Phase 1B.5B.1 verification passed.");
console.log("Strong GLB shape can produce inferred/contextual Roll without metadata; weak shape and free-form tags still fail closed, explicit rolling remains authoritative, and library-wide deep inspection stays on-demand.");
console.log("Director support counts, UMP/runtime ownership, camera/scene-state boundaries, Builder authority, and no-arbitrary-subpart/no-physics constraints remain unchanged.");
