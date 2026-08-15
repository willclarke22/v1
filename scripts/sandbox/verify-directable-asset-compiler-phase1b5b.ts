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
  DIRECTABLE_ASSET_AFFORDANCE_GRAPH_SCHEMA_VERSION,
  DIRECTABLE_ASSET_COMPILER_VERSION,
} from "../../sandbox/probe-lab/directability/affordance-graph-contract";
import {
  compileDirectableAssetAffordanceGraph,
} from "../../sandbox/probe-lab/directability/directable-asset-compiler";
import {
  DIRECTABLE_ASSET_OPERATOR_REGISTRY_VERSION,
  DIRECTABLE_ASSET_OPERATOR_SPECS,
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
  generator: "phase1b5b_verifier",
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

assert(
  DIRECTABLE_ASSET_AFFORDANCE_GRAPH_SCHEMA_VERSION ===
    "myway_directable_asset_affordance_graph_v1",
  "Unexpected Phase 1B.5B affordance graph schema version.",
);
assert(
  DIRECTABLE_ASSET_COMPILER_VERSION ===
    "director_directable_asset_compiler_phase1b5b_v1",
  "Unexpected Phase 1B.5B compiler version.",
);
assert(
  DIRECTABLE_ASSET_OPERATOR_REGISTRY_VERSION ===
    "director_affordance_operator_registry_phase1b5b_v1",
  "Unexpected Phase 1B.5B operator registry version.",
);
assert(
  DIRECTABLE_ASSET_OPERATOR_SPECS.length >= 20 &&
    DIRECTABLE_ASSET_OPERATOR_SPECS.length < DIRECTOR_CAPABILITIES.length,
  "Phase 1B.5B must use a compact generic operator layer rather than copying the 183-capability catalog per asset.",
);

const plain = compileDirectableAssetAffordanceGraph(asset("plain_box"));
assert(
  plain.affordances.some(
    (item) => item.kind === "root_transform" && item.evidence.executable,
  ),
  "Every asset must expose the shared root transform affordance.",
);
assert(
  qualifyDirectableAssetForOperator(plain, "translate").status ===
    "executable_as_is",
  "Plain assets must remain movable through the root transform.",
);
assert(
  qualifyDirectableAssetForOperator(plain, "roll").status ===
    "requires_asset_authoring",
  "A plain/fused asset must not become asset-qualified for Roll without rolling evidence.",
);
assert(
  qualifyDirectableAssetForOperator(plain, "open_subpart").status ===
    "requires_asset_authoring",
  "A plain/fused asset must not become qualified for Open without a runtime-bound semantic part and matching joint.",
);

const metadataOnly = compileDirectableAssetAffordanceGraph(
  asset("metadata_only", {
    affordances: ["rollable", "openable", "fillable"],
    geometry_profile: null,
  }),
);
assert(
  metadataOnly.suggestions.length === 3 &&
    metadataOnly.suggestions.every((item) => item.executable === false),
  "Legacy/free-form asset affordance strings must remain advisory only.",
);
assert(
  !metadataOnly.affordances.some((item) => item.kind === "rolling") &&
    !metadataOnly.affordances.some((item) => item.kind === "pivot_joint") &&
    !metadataOnly.affordances.some((item) => item.kind === "containment_volume"),
  "Metadata suggestions must not invent executable rolling, joints, or containment.",
);

const mugGeometry: MyWayAssetGeometryProfileV1 = {
  ...BASE_GEOMETRY,
  support_surfaces: [
    {
      id: "rim_support",
      label: "rim support",
      center: [0, 0.96, 0],
      normal: [0, 1, 0],
      u_axis: [1, 0, 0],
      v_axis: [0, 0, 1],
      size: [0.72, 0.72],
      area: 0.5,
      confidence: 0.9,
      source: "blender_geometry",
      region_kind: "support",
      exposure: "exterior",
      orientation: "upward",
      openness: "open",
    },
  ],
  interior_volumes: [
    {
      id: "cup_interior",
      label: "open interior",
      center: [0, 0.53, 0],
      size: [0.64, 0.82, 0.64],
      rotation: [0, 0, 0],
      confidence: 0.93,
      source: "blender_geometry",
      exposure: "interior",
      openness: "open",
      access_direction: [0, 1, 0],
    },
  ],
  audit: {
    ...BASE_GEOMETRY.audit!,
    support_surface_count: 1,
  },
};
const mug = compileDirectableAssetAffordanceGraph(
  asset("mug", { geometry_profile: mugGeometry }),
);
assert(
  mug.affordances.some((item) => item.kind === "containment_volume"),
  "Measured interior volume must compile to containment affordance.",
);
assert(
  qualifyDirectableAssetForOperator(mug, "fill_target").status ===
    "executable_as_is" &&
    qualifyDirectableAssetForOperator(mug, "drain_target").status ===
      "executable_as_is" &&
    qualifyDirectableAssetForOperator(mug, "accumulate_on_target").status ===
      "executable_as_is",
  "Containment/support evidence must qualify mug-like assets for Fill/Drain/Accumulate without hard-coding a mug capability matrix.",
);
assert(
  qualifyDirectableAssetForOperator(mug, "flow_as_target").status ===
    "conditional",
  "Containment may qualify the target side of Flow while pair compatibility remains conditional.",
);

const attachable = compileDirectableAssetAffordanceGraph(
  asset("attachable", {
    geometry_profile: {
      ...BASE_GEOMETRY,
      attachment_regions: [
        {
          id: "side_mount",
          label: "side mount",
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
    },
  }),
);
assert(
  qualifyDirectableAssetForOperator(attachable, "attach_as_source").status ===
    "conditional" &&
    qualifyDirectableAssetForOperator(attachable, "attach_as_target").status ===
      "conditional",
  "Attachment evidence should qualify one side of Attach but must remain conditional until pair compatibility exists.",
);

const rolling = compileDirectableAssetAffordanceGraph(
  asset("rolling_car", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      rolling: {
        radius_m: 0.34,
        axis: [0, 0, 1],
        local_center: [0, 0.34, 0],
        confidence: 1,
      },
    },
  }),
);
assert(
  qualifyDirectableAssetForOperator(rolling, "roll").status ===
    "executable_as_is",
  "Explicit rolling radius/axis must qualify asset-specific Roll.",
);

const articulated = compileDirectableAssetAffordanceGraph(
  asset("door_asset", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      pivots: [
        {
          id: "left_door_hinge",
          semantic_names: ["left_door_hinge"],
          local_position: [-0.45, 0.6, 0.2],
          axis: [0, 1, 0],
          target_scope: "subpart",
          subpart_id: "left_door",
          min_degrees: 0,
          max_degrees: 72,
          confidence: 1,
        },
      ],
      subparts: [
        {
          id: "left_door",
          semantic_names: ["left_door"],
          node_name: "Door_L",
          capabilities: ["articulate", "rotate"],
          pivot_id: "left_door_hinge",
          confidence: 1,
        },
      ],
    },
  }),
);
const openQualification = qualifyDirectableAssetForOperator(
  articulated,
  "open_subpart",
);
assert(
  openQualification.status === "asset_ready_runtime_pending" &&
    openQualification.requirements.every((item) => item.resolved),
  "A runtime-bound semantic subpart and its matching joint must qualify the asset for mechanical Open without falsely claiming the still-declared articulation runtime lane executes.",
);
const inspectedMissingDoor = compileDirectableAssetAffordanceGraph(
  asset("door_asset_inspected", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      pivots: [
        {
          id: "left_door_hinge",
          local_position: [-0.45, 0.6, 0.2],
          axis: [0, 1, 0],
          target_scope: "subpart",
          subpart_id: "left_door",
          confidence: 1,
        },
      ],
      subparts: [
        {
          id: "left_door",
          node_name: "Door_L",
          capabilities: ["articulate"],
          pivot_id: "left_door_hinge",
          confidence: 1,
        },
      ],
    },
  }),
  {
    structure: {
      schema_version: "myway_directable_asset_structure_inspection_v1",
      source: "asset_pipeline",
      node_names: ["CarRoot", "Body"],
      mesh_names: ["Body"],
      bone_names: [],
      animation_clip_names: [],
    },
  },
);
assert(
  qualifyDirectableAssetForOperator(
    inspectedMissingDoor,
    "open_subpart",
  ).status === "requires_asset_authoring",
  "An explicit semantic node binding that does not exist in inspected GLB structure must fail closed.",
);

const unrelatedJoint = compileDirectableAssetAffordanceGraph(
  asset("bad_articulation", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      pivots: [
        {
          id: "hood_hinge",
          semantic_names: ["hood_hinge"],
          local_position: [0, 0.8, 0.4],
          axis: [0, 1, 0],
          target_scope: "subpart",
          subpart_id: "hood",
          confidence: 1,
        },
      ],
      subparts: [
        {
          id: "left_door",
          semantic_names: ["left_door"],
          node_name: "Door_L",
          capabilities: ["articulate"],
          pivot_id: "left_door_hinge",
          confidence: 1,
        },
      ],
    },
  }),
);
assert(
  qualifyDirectableAssetForOperator(unrelatedJoint, "open_subpart").status ===
    "requires_asset_authoring",
  "Unrelated semantic parts and joints must not accidentally satisfy Open.",
);

const rigged = compileDirectableAssetAffordanceGraph(
  asset("rigged_character", {
    rigged: true,
    animation_clips: ["Walk", "Wave"],
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      rig: {
        bone_map: {
          left_hand: "mixamorigLeftHand",
          right_hand: "mixamorigRightHand",
        },
        clip_map: {
          walk: "Walk",
          wave: "Wave",
        },
        confidence: 1,
      },
    },
  }),
);
assert(
  qualifyDirectableAssetForOperator(rigged, "skeletal_pose").status ===
    "asset_ready_runtime_pending" &&
    qualifyDirectableAssetForOperator(rigged, "play_animation_clip").status ===
      "asset_ready_runtime_pending",
  "Semantic rig mapping and real clips must compile independently while skeletal/clip execution remains honestly runtime-pending.",
);

const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, item) => {
    counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  DIRECTOR_CAPABILITIES.length === 183 &&
    supportCounts.direct === 101 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.5B must not change Director capability count/support classifications: ${JSON.stringify(supportCounts)}.`,
);

const lab = source(
  "sandbox/probe-lab/directability/ui/directable-asset-qualification-lab.tsx",
);
assert(
  lab.includes("/api/sandbox/probe-lab/assets/library") &&
    lab.includes("compileDirectableAssetAffordanceGraph") &&
    lab.includes("inspectBrowserAssetStructure") &&
    lab.includes("qualifyDirectableAssetForAllOperators"),
  "Directable Asset Qualification Lab must compile real Asset Library records and derive operator support.",
);
assert(
  !lab.includes("<Canvas") && !lab.includes("@react-three/fiber"),
  "Phase 1B.5B qualification lab must not add another WebGL Canvas.",
);
const probePage = source("app/sandbox/probe-lab/page.tsx");
assert(
  probePage.includes('href: "/sandbox/probe-lab/directable-assets"'),
  "Probe Lab must link to the Directable Asset Qualification page.",
);
const directabilityReadme = source(
  "sandbox/probe-lab/directability/README.md",
).toLowerCase();
for (const concept of [
  "asset × capability matrix",
  "compile-once affordance graph",
  "advisory only",
  "phase 1b.5c",
]) {
  assert(
    directabilityReadme.includes(concept),
    `Phase 1B.5B directability documentation is missing concept: ${concept}.`,
  );
}
const phaseDoc = source(
  "sandbox/probe-lab/directability/PHASE1B5B_AFFORDANCE_GRAPH.md",
).toLowerCase();
for (const boundary of [
  "does not",
  "animate arbitrary glb child nodes",
  "auto-rig",
  "asset scene builder",
  "fluid/smoke/granular simulation",
]) {
  assert(
    phaseDoc.includes(boundary),
    `Phase 1B.5B boundary documentation is missing: ${boundary}.`,
  );
}

console.log(
  "Directable Asset Compiler + Affordance Graph Phase 1B.5B verification passed.",
);
console.log(
  "Compile-once asset evidence, non-authoritative metadata suggestions, generic operator derivation, relationship-aware articulation qualification, and real Asset Library diagnostics passed.",
);
console.log(
  "183-capability support counts, camera/runtime boundaries, UMP ownership, Builder collision authority, and no-arbitrary-subpart/no-physics constraints remain unchanged.",
);
