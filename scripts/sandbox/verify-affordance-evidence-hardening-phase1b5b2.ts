import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  MyWayAssetGeometryProfileV1,
  MyWayAssetRecord,
} from "../../sandbox/probe-lab/assets/asset-types";
import {
  ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
} from "../../sandbox/probe-lab/directability/asset-directability-contract";
import {
  DIRECTABLE_ASSET_EVIDENCE_HARDENING_VERSION,
  DIRECTABLE_ASSET_STRUCTURE_INSPECTION_SCHEMA_VERSION,
  type DirectableAssetStructureInspectionV1,
} from "../../sandbox/probe-lab/directability/affordance-graph-contract";
import {
  compileDirectableAssetAffordanceGraph,
} from "../../sandbox/probe-lab/directability/directable-asset-compiler";
import {
  inferGeometryShapeInspectionFromSamples,
  rollingProfileForCandidate,
  runtimeModelForRollCandidate,
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
  generator: "phase1b5b2_verifier",
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

function structure(
  geometryShape: NonNullable<DirectableAssetStructureInspectionV1["geometry_shape"]>,
): DirectableAssetStructureInspectionV1 {
  return {
    schema_version: DIRECTABLE_ASSET_STRUCTURE_INSPECTION_SCHEMA_VERSION,
    source: "browser_gltf",
    node_names: ["Root"],
    mesh_names: ["Mesh"],
    bone_names: [],
    animation_clip_names: [],
    geometry_shape: geometryShape,
  };
}

assert(
  DIRECTABLE_ASSET_EVIDENCE_HARDENING_VERSION ===
    "director_affordance_evidence_hardening_phase1b5b2_v1",
  "Unexpected Phase 1B.5B.2 evidence hardening version.",
);

const lowInteriorGeometry: MyWayAssetGeometryProfileV1 = {
  ...BASE_GEOMETRY,
  interior_volumes: [
    {
      id: "incidental_void",
      label: "Measured containment region",
      center: [0, 0.6, 0],
      size: [0.08, 0.08, 0.08],
      rotation: [0, 0, 0],
      confidence: 0.56,
      source: "blender_geometry",
      exposure: "interior",
      openness: "open",
      access_direction: [0, 1, 0],
    },
  ],
};

const falseContainer = compileDirectableAssetAffordanceGraph(
  asset("hydrant_like", { geometry_profile: lowInteriorGeometry }),
);
assert(
  falseContainer.affordances.some(
    (item) => item.kind === "containment_candidate",
  ),
  "Raw measured interior evidence must remain visible as a containment candidate.",
);
assert(
  !falseContainer.affordances.some(
    (item) =>
      item.kind === "containment_volume" &&
      item.evidence.executable,
  ),
  "Low-confidence geometric voids must not become executable containment.",
);
assert(
  qualifyDirectableAssetForOperator(falseContainer, "fill_target").status ===
    "fallback_only",
  "A low-confidence incidental void must not qualify literal Fill.",
);

const openContainerGeometry: MyWayAssetGeometryProfileV1 = {
  ...BASE_GEOMETRY,
  interior_volumes: [
    {
      id: "open_interior",
      label: "Open interior",
      center: [0, 0.52, 0],
      size: [0.64, 0.78, 0.64],
      rotation: [0, 0, 0],
      confidence: 0.93,
      source: "blender_geometry",
      exposure: "interior",
      openness: "open",
      access_direction: [0, 1, 0],
    },
  ],
};
const openContainer = compileDirectableAssetAffordanceGraph(
  asset("measured_open_container", {
    geometry_profile: openContainerGeometry,
  }),
);
assert(
  openContainer.affordances.some(
    (item) =>
      item.kind === "containment_volume" &&
      item.evidence.executable,
  ) &&
    qualifyDirectableAssetForOperator(
      openContainer,
      "fill_target",
    ).status === "executable_as_is",
  "High-confidence open/accessibile measured interiors must remain usable containment.",
);

const genericAttachmentGeometry: MyWayAssetGeometryProfileV1 = {
  ...BASE_GEOMETRY,
  attachment_regions: [
    {
      id: "attachment_right",
      label: "Right exterior attachment region",
      center: [0.5, 0.5, 0],
      normal: [1, 0, 0],
      u_axis: [0, 1, 0],
      v_axis: [0, 0, 1],
      size: [0.25, 0.25],
      confidence: 0.72,
      source: "blender_geometry",
      exposure: "exterior",
      orientation: "vertical",
      side: "right",
    },
  ],
};
const genericAttachment = compileDirectableAssetAffordanceGraph(
  asset("generic_attachment", {
    geometry_profile: genericAttachmentGeometry,
  }),
);
assert(
  genericAttachment.affordances.some(
    (item) => item.kind === "surface_contact_region",
  ),
  "Generic exterior geometry must compile as a surface-contact region.",
);
assert(
  !genericAttachment.affordances.some(
    (item) => item.kind === "attachment_port",
  ),
  "Generic exterior geometry must not become a semantic connector port.",
);
assert(
  qualifyDirectableAssetForOperator(
    genericAttachment,
    "attach_as_source",
  ).status === "fallback_only",
  "Generic contact geometry must not satisfy precise Attach.",
);
assert(
  qualifyDirectableAssetForOperator(
    genericAttachment,
    "surface_attach_as_source",
  ).status === "conditional",
  "Generic contact geometry should remain available for later pairwise surface attachment.",
);

const semanticMountGeometry: MyWayAssetGeometryProfileV1 = {
  ...BASE_GEOMETRY,
  attachment_regions: [
    {
      id: "side_mount",
      label: "Side mount",
      center: [0.5, 0.5, 0],
      normal: [1, 0, 0],
      u_axis: [0, 1, 0],
      v_axis: [0, 0, 1],
      size: [0.2, 0.2],
      confidence: 0.88,
      source: "blender_geometry",
      exposure: "exterior",
      orientation: "vertical",
      side: "right",
    },
  ],
};
const semanticMount = compileDirectableAssetAffordanceGraph(
  asset("semantic_mount", {
    geometry_profile: semanticMountGeometry,
  }),
);
assert(
  semanticMount.affordances.some(
    (item) => item.kind === "attachment_port",
  ) &&
    qualifyDirectableAssetForOperator(
      semanticMount,
      "attach_as_source",
    ).status === "conditional",
  "Semantically specific measured mount evidence must preserve the controlled Phase 1B.5B attachment fixture.",
);

const supportGeometry: MyWayAssetGeometryProfileV1 = {
  ...BASE_GEOMETRY,
  support_surfaces: [
    {
      id: "top",
      label: "Top support",
      center: [0, 1, 0],
      normal: [0, 1, 0],
      u_axis: [1, 0, 0],
      v_axis: [0, 0, 1],
      size: [0.9, 0.9],
      usable_size: [0.82, 0.82],
      area: 0.81,
      confidence: 0.94,
      source: "blender_geometry",
      region_kind: "support",
      exposure: "exterior",
      orientation: "upward",
      openness: "open",
      clearance_above_m: 1,
      blocked_fraction: 0,
    },
  ],
};
const supportOnly = compileDirectableAssetAffordanceGraph(
  asset("support_only", { geometry_profile: supportGeometry }),
);
assert(
  qualifyDirectableAssetForOperator(
    supportOnly,
    "place_on_target",
  ).status === "contextual_candidate",
  "Place-on must stay contextual until source footprint/stability/clearance are known.",
);
assert(
  qualifyDirectableAssetForOperator(
    supportOnly,
    "accumulate_on_target",
  ).status === "contextual_candidate",
  "Support-only Accumulate must remain contextual rather than executable-as-is.",
);

const noSemanticFacing = compileDirectableAssetAffordanceGraph(
  asset("plain_directionless"),
);
assert(
  qualifyDirectableAssetForOperator(
    noSemanticFacing,
    "align",
  ).status === "executable_as_is",
  "Measured geometry frame must remain usable for Align.",
);
assert(
  qualifyDirectableAssetForOperator(
    noSemanticFacing,
    "aim",
  ).status === "fallback_only",
  "A geometric GLB frame must not silently become semantic facing for Aim.",
);

const semanticFacing = compileDirectableAssetAffordanceGraph(
  asset("authored_directional", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      orientation: {
        up_axis: [0, 1, 0],
        forward_axis: [0, 0, -1],
        confidence: 1,
      },
    },
  }),
);
assert(
  semanticFacing.affordances.some(
    (item) => item.kind === "semantic_forward_frame",
  ) &&
    qualifyDirectableAssetForOperator(
      semanticFacing,
      "aim",
    ).status === "executable_as_is",
  "Explicit directional authoring must qualify semantic Aim.",
);

const ringPoints: Array<[number, number, number]> = [];
for (let index = 0; index < 120; index += 1) {
  const angle = (index / 120) * Math.PI * 2;
  for (const y of [-0.15, 0.15]) {
    ringPoints.push([Math.cos(angle), y, Math.sin(angle)]);
  }
}
const ringShape = inferGeometryShapeInspectionFromSamples(
  ringPoints,
  240,
);
assert(ringShape, "Ring geometry inspection must exist.");
const ringCandidate = ringShape.roll_candidates[0];
assert(ringCandidate, "Ring geometry must expose a rolling candidate.");
assert(
  rollingProfileForCandidate(ringCandidate) === "wheel_or_ring" &&
    runtimeModelForRollCandidate(ringCandidate) === "constant_radius",
  "Ring geometry must be classified as a constant-radius-compatible wheel/ring profile.",
);
const ringGraph = compileDirectableAssetAffordanceGraph(
  asset("ring"),
  { structure: structure(ringShape) },
);
assert(
  qualifyDirectableAssetForOperator(ringGraph, "roll").status ===
    "contextual_candidate",
  "Constant-radius-compatible inferred Roll must remain contextual until scene support/pose/travel are known.",
);

const conePoints: Array<[number, number, number]> = [];
for (let slice = 0; slice <= 10; slice += 1) {
  const y = slice / 10 * 2;
  const radius = Math.max(0.08, 1 - slice / 10 * 0.82);
  for (let index = 0; index < 72; index += 1) {
    const angle = (index / 72) * Math.PI * 2;
    conePoints.push([
      radius * Math.cos(angle),
      y,
      radius * Math.sin(angle),
    ]);
  }
}
const coneShape = inferGeometryShapeInspectionFromSamples(
  conePoints,
  720,
);
assert(coneShape, "Tapered geometry inspection must exist.");
const coneCandidate = coneShape.roll_candidates.find(
  (candidate) => candidate.axis_name === "y",
);
assert(coneCandidate, "Tapered rotational geometry must remain visible as a physical roll candidate.");
assert(
  runtimeModelForRollCandidate(coneCandidate) === "approximate_only",
  "Tapered rotational geometry must not feed constant-radius UMP Roll directly.",
);
const coneGraph = compileDirectableAssetAffordanceGraph(
  asset("cone_like"),
  { structure: structure(coneShape) },
);
assert(
  qualifyDirectableAssetForOperator(coneGraph, "roll").status ===
    "fallback_only",
  "Tapered/irregular inferred Roll must remain approximate/fallback-only with the current UMP.",
);

const cupPoints: Array<[number, number, number]> = [];
for (const y of [0, 0.25, 0.5, 0.75, 1]) {
  for (let index = 0; index < 96; index += 1) {
    const angle = (index / 96) * Math.PI * 2;
    cupPoints.push([
      0.5 * Math.cos(angle),
      y,
      0.5 * Math.sin(angle),
    ]);
  }
}
const cupShape = inferGeometryShapeInspectionFromSamples(
  cupPoints,
  480,
);
assert(
  cupShape?.top_opening_candidates?.length,
  "Open cylindrical/rim geometry must expose a top-opening candidate.",
);

const shapeOnly = compileDirectableAssetAffordanceGraph(
  asset("shape_only"),
  { structure: structure(cupShape!) },
);
assert(
  !shapeOnly.affordances.some(
    (item) => item.kind === "containment_volume",
  ),
  "Open-top geometry alone must not manufacture semantic containment.",
);

const semanticOnly = compileDirectableAssetAffordanceGraph(
  asset("semantic_only", {
    affordances: ["container"],
  }),
);
assert(
  !semanticOnly.affordances.some(
    (item) => item.kind === "containment_volume",
  ),
  "Advisory container metadata alone must remain non-executable.",
);

const corroboratedCup = compileDirectableAssetAffordanceGraph(
  asset("corroborated_cup", {
    affordances: ["container"],
  }),
  { structure: structure(cupShape!) },
);
assert(
  corroboratedCup.affordances.some(
    (item) =>
      item.kind === "containment_volume" &&
      item.evidence.qualification === "inferred" &&
      item.evidence.executable,
  ) &&
    corroboratedCup.affordances.some(
      (item) => item.kind === "inlet_port",
    ),
  "Container semantics plus independently measured open-top geometry must be able to corroborate usable containment without trusting either signal alone.",
);
assert(
  qualifyDirectableAssetForOperator(
    corroboratedCup,
    "fill_target",
  ).status === "executable_as_is",
  "Corroborated open container must qualify literal Fill on the asset side.",
);

const operatorIds = DIRECTABLE_ASSET_OPERATOR_SPECS.map(
  (item) => item.id,
) as DirectableAssetOperatorId[];
assert(
  operatorIds.includes("surface_attach_as_source") &&
    operatorIds.includes("surface_attach_as_target") &&
    operatorIds.length >= 22 &&
    operatorIds.length < DIRECTOR_CAPABILITIES.length,
  "Phase 1B.5B.2 must extend the compact generic operator layer without copying the 183-capability catalog.",
);

const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, item) => {
    counts[item.compiler.threejs] =
      (counts[item.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  DIRECTOR_CAPABILITIES.length === 184 &&
    supportCounts.direct === 102 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.5B.2 must not change Director capability count/support classifications: ${JSON.stringify(supportCounts)}.`,
);

const compiler = source(
  "sandbox/probe-lab/directability/directable-asset-compiler.ts",
);
for (const marker of [
  "containment_candidate",
  "surface_contact_region",
  "semantic_forward_frame",
  "semantic_plus_geometry",
  "current constant-radius UMP Roll",
]) {
  assert(
    compiler.includes(marker),
    `Phase 1B.5B.2 compiler marker missing: ${marker}.`,
  );
}

const lab = source(
  "sandbox/probe-lab/directability/ui/directable-asset-qualification-lab.tsx",
);
for (const marker of [
  "Usable containment",
  "Interior candidates",
  "Surface contacts",
  "Precise attachment ports",
  "Top-opening geometry candidate",
]) {
  assert(
    lab.includes(marker),
    `Phase 1B.5B.2 qualification UI marker missing: ${marker}.`,
  );
}
assert(
  !lab.includes("<Canvas") && !lab.includes("@react-three/fiber"),
  "Phase 1B.5B.2 qualification UI must remain Canvas-free.",
);

const readme = source(
  "sandbox/probe-lab/directability/README.md",
).toLowerCase();
for (const concept of [
  "phase 1b.5b.2",
  "containment_candidate",
  "surface_contact_region",
  "semantic_forward_frame",
  "constant-radius",
  "phase 1b.5c",
]) {
  assert(
    readme.includes(concept),
    `Directability README missing Phase 1B.5B.2 concept: ${concept}.`,
  );
}

const phaseDoc = source(
  "sandbox/probe-lab/directability/PHASE1B5B2_AFFORDANCE_EVIDENCE_HARDENING.md",
).toLowerCase();
for (const boundary of [
  "does not",
  "phase 1b.5c",
  "animate arbitrary glb child nodes",
  "asset scene builder",
  "semantic truth",
]) {
  assert(
    phaseDoc.includes(boundary),
    `Phase 1B.5B.2 boundary documentation missing: ${boundary}.`,
  );
}

console.log(
  "Affordance evidence hardening Phase 1B.5B.2 verification passed.",
);
console.log(
  "Raw voids/contact regions are demoted, semantic+geometry containment corroboration is two-signal, support is contextual, Roll profiles gate constant-radius execution, and Aim requires semantic facing.",
);
console.log(
  "183-capability support counts, camera/runtime ownership, UMP semantics, Builder collision/fit authority, and no-arbitrary-subpart/no-physics boundaries remain unchanged.",
);
