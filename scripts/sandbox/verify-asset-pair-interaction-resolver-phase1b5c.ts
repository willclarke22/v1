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
  compileDirectableAssetAffordanceGraph,
} from "../../sandbox/probe-lab/directability/directable-asset-compiler";
import {
  DIRECTABLE_ASSET_PAIR_INTERACTION_IDS,
  DIRECTABLE_ASSET_PAIR_RESOLVER_VERSION,
} from "../../sandbox/probe-lab/directability/pair-interaction-contract";
import {
  resolveDirectableAssetPairInteraction,
} from "../../sandbox/probe-lab/directability/pair-interaction-resolver";
import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function geometry(
  overrides: Partial<MyWayAssetGeometryProfileV1> = {},
): MyWayAssetGeometryProfileV1 {
  return {
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
    generator: "phase1b5c_verifier",
    ...overrides,
  };
}

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
    geometry_profile: geometry(),
    ...overrides,
  };
}

assert(
  DIRECTABLE_ASSET_PAIR_RESOLVER_VERSION ===
    "director_asset_pair_interaction_resolver_phase1b5c2_v1",
  "Unexpected Phase 1B.5C pair resolver version.",
);
assert(
  DIRECTABLE_ASSET_PAIR_INTERACTION_IDS.join("|") ===
    "place_on|surface_attach|precise_attach|insert|flow",
  "Phase 1B.5C must expose exactly the five intended generic pair lanes.",
);

const sourceGraph = compileDirectableAssetAffordanceGraph(
  asset("small_source"),
);
const targetSupportGraph = compileDirectableAssetAffordanceGraph(
  asset("support_target", {
    geometry_profile: geometry({
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
          vertical_rank: 1,
          clearance_above_m: null,
          blocked_fraction: 0,
          enclosure_confidence: 0,
          edge_margin_m: 0.04,
        },
      ],
      primary_support_surface_id: "top",
    }),
  }),
);

const place = resolveDirectableAssetPairInteraction(
  sourceGraph,
  targetSupportGraph,
  "place_on",
  {
    source_dimensions_m: [0.2, 0.3, 0.2],
    target_dimensions_m: [1, 1, 1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  place.status === "resolved_candidate" &&
    place.fit.fits === true &&
    Boolean(place.candidate_transform) &&
    place.proposed_relationship?.type === "support_contact" &&
    place.proposed_relationship.activation_state === "proposed",
  "Place On must resolve contact/support evidence into a candidate transform when the source fits.",
);
assert(
  place.builder_validation_handoff.some((item) =>
    item.includes("center-of-mass"),
  ) &&
    place.builder_validation_handoff.some((item) =>
      item.includes("collision"),
    ),
  "Place On must explicitly hand stability/collision authority to Asset Scene Builder.",
);

const oversizedPlace = resolveDirectableAssetPairInteraction(
  sourceGraph,
  targetSupportGraph,
  "place_on",
  {
    source_dimensions_m: [2, 1, 2],
    target_dimensions_m: [1, 1, 1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  oversizedPlace.status === "fallback_only" &&
    oversizedPlace.fit.fits === false &&
    !oversizedPlace.candidate_transform,
  "Authoritative oversized Place On must fail closed instead of inventing a fit.",
);

const sourceSurfaceGraph = compileDirectableAssetAffordanceGraph(
  asset("poster_like", {
    geometry_profile: geometry({
      local_bounds: {
        min: [-0.25, 0, -0.01],
        max: [0.25, 0.7, 0.01],
        size: [0.5, 0.7, 0.02],
        center: [0, 0.35, 0],
      },
      attachment_regions: [
        {
          id: "back_contact",
          label: "Back exterior attachment region",
          center: [0, 0.35, -0.01],
          normal: [0, 0, -1],
          u_axis: [1, 0, 0],
          v_axis: [0, 1, 0],
          size: [0.5, 0.7],
          confidence: 0.9,
          source: "blender_geometry",
          exposure: "exterior",
          orientation: "vertical",
          side: "back",
        },
      ],
    }),
  }),
);
const targetSurfaceGraph = compileDirectableAssetAffordanceGraph(
  asset("wall_like", {
    geometry_profile: geometry({
      local_bounds: {
        min: [-1.5, 0, -0.05],
        max: [1.5, 2.5, 0.05],
        size: [3, 2.5, 0.1],
        center: [0, 1.25, 0],
      },
      attachment_regions: [
        {
          id: "front_contact",
          label: "Front exterior attachment region",
          center: [0, 1.25, 0.05],
          normal: [0, 0, 1],
          u_axis: [1, 0, 0],
          v_axis: [0, 1, 0],
          size: [3, 2.5],
          confidence: 0.9,
          source: "blender_geometry",
          exposure: "exterior",
          orientation: "vertical",
          side: "front",
        },
      ],
    }),
  }),
);

const surfaceAttach = resolveDirectableAssetPairInteraction(
  sourceSurfaceGraph,
  targetSurfaceGraph,
  "surface_attach",
  {
    source_dimensions_m: [0.5, 0.7, 0.02],
    target_dimensions_m: [3, 2.5, 0.1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  surfaceAttach.status === "contextual_candidate" &&
    surfaceAttach.fit.fits === true &&
    Boolean(surfaceAttach.candidate_transform) &&
    surfaceAttach.proposed_relationship?.type === "persistent_attachment" &&
    surfaceAttach.proposed_relationship.activation_state === "proposed" &&
    surfaceAttach.proposed_relationship.inverse_operation === "detach",
  "Surface Attach must solve geometry while retaining material/attachment policy as context.",
);
assert(
  surfaceAttach.evidence.source_evidence_ids.every((id) =>
    id.startsWith("surface_contact:"),
  ) &&
    surfaceAttach.evidence.target_evidence_ids.every((id) =>
      id.startsWith("surface_contact:"),
    ),
  "Surface Attach must use surface-contact evidence rather than silently treating it as a semantic connector.",
);

const hoseGraph = compileDirectableAssetAffordanceGraph(
  asset("hose", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      anchors: [
        {
          id: "hose_connector",
          semantic_names: ["fluid_hose", "hose_connector"],
          kind: "attachment",
          local_position: [0.5, 0.5, 0],
          local_normal: [1, 0, 0],
          confidence: 1,
        },
      ],
    },
  }),
);
const hydrantSocketGraph = compileDirectableAssetAffordanceGraph(
  asset("hydrant_socket", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      anchors: [
        {
          id: "hose_socket",
          semantic_names: ["fluid_hose", "hose_socket"],
          kind: "socket",
          local_position: [0.5, 0.5, 0],
          local_normal: [1, 0, 0],
          confidence: 1,
        },
      ],
    },
  }),
);

const preciseAttach = resolveDirectableAssetPairInteraction(
  hoseGraph,
  hydrantSocketGraph,
  "precise_attach",
  {
    source_dimensions_m: [1, 1, 1],
    target_dimensions_m: [1, 1, 1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  preciseAttach.status === "resolved_candidate" &&
    preciseAttach.evidence.shared_semantic_tokens.includes("hose") &&
    preciseAttach.proposed_relationship?.type === "persistent_attachment" &&
    preciseAttach.proposed_relationship.activation_state === "proposed" &&
    preciseAttach.proposed_relationship.inverse_operation === "detach",
  "Precise Attach must require compatible authored port semantics and emit persistent attachment intent.",
);

const usbSocketGraph = compileDirectableAssetAffordanceGraph(
  asset("usb_socket", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      anchors: [
        {
          id: "usb_socket",
          semantic_names: ["usb", "usb_socket"],
          kind: "socket",
          local_position: [0.5, 0.5, 0],
          local_normal: [1, 0, 0],
          confidence: 1,
        },
      ],
    },
  }),
);
const incompatibleAttach = resolveDirectableAssetPairInteraction(
  hoseGraph,
  usbSocketGraph,
  "precise_attach",
);
assert(
  incompatibleAttach.status === "fallback_only" &&
    incompatibleAttach.missing_requirements.includes(
      "compatible typed connector/socket semantics",
    ),
  "Unrelated authored ports must fail closed rather than mating by generic port kind.",
);

const noPortAttach = resolveDirectableAssetPairInteraction(
  sourceGraph,
  targetSupportGraph,
  "precise_attach",
);
assert(
  noPortAttach.status === "requires_asset_authoring",
  "Missing precise connector evidence must be reported as asset authoring, not invented from generic surface contacts.",
);

const containerGraph = compileDirectableAssetAffordanceGraph(
  asset("open_container", {
    geometry_profile: geometry({
      interior_volumes: [
        {
          id: "interior",
          label: "Open interior",
          center: [0, 0.52, 0],
          size: [0.64, 0.78, 0.64],
          rotation: [0, 0, 0],
          confidence: 0.95,
          source: "blender_geometry",
          exposure: "interior",
          openness: "open",
          access_direction: [0, 1, 0],
        },
      ],
    }),
  }),
);

const insert = resolveDirectableAssetPairInteraction(
  sourceGraph,
  containerGraph,
  "insert",
  {
    source_dimensions_m: [0.2, 0.2, 0.2],
    target_dimensions_m: [1, 1, 1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  insert.status === "contextual_candidate" &&
    insert.fit.mode === "volume_3d" &&
    insert.fit.fits === true &&
    Boolean(insert.candidate_transform) &&
    insert.proposed_relationship?.type === "containment_membership" &&
    insert.proposed_relationship.activation_state === "proposed" &&
    insert.proposed_relationship.inverse_operation === "remove" &&
    insert.missing_requirements.some((item) => item.includes("aperture")),
  "Insert must preserve the containment candidate but remain contextual when receiver aperture dimensions are unavailable.",
);

const oversizedInsert = resolveDirectableAssetPairInteraction(
  sourceGraph,
  containerGraph,
  "insert",
  {
    source_dimensions_m: [2, 2, 2],
    target_dimensions_m: [1, 1, 1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  oversizedInsert.status === "fallback_only" &&
    oversizedInsert.fit.fits === false,
  "Authoritative oversized insertion must fail closed.",
);

const socketInsert = resolveDirectableAssetPairInteraction(
  hoseGraph,
  hydrantSocketGraph,
  "insert",
);
assert(
  socketInsert.status === "contextual_candidate" &&
    socketInsert.fit.mode === "semantic_port" &&
    socketInsert.missing_requirements.includes(
      "socket dimensional/tolerance validation",
    ),
  "Typed socket insertion may resolve semantics but must remain contextual without bore/depth/tolerance geometry.",
);

const faucetGraph = compileDirectableAssetAffordanceGraph(
  asset("faucet", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      anchors: [
        {
          id: "water_outlet",
          semantic_names: ["water", "faucet_spout"],
          kind: "outlet",
          local_position: [0, 0.6, 0.4],
          local_normal: [0, 0, 1],
          confidence: 1,
        },
      ],
    },
  }),
);
const cupInletGraph = compileDirectableAssetAffordanceGraph(
  asset("cup_inlet", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      anchors: [
        {
          id: "water_inlet",
          semantic_names: ["water", "cup_inlet"],
          kind: "inlet",
          local_position: [0, 1, 0],
          local_normal: [0, 1, 0],
          confidence: 1,
        },
      ],
    },
  }),
);

const flow = resolveDirectableAssetPairInteraction(
  faucetGraph,
  cupInletGraph,
  "flow",
  {
    medium: "water",
    source_dimensions_m: [1, 1, 1],
    target_dimensions_m: [1, 1, 1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  flow.status === "resolved_candidate" &&
    Boolean(flow.route) &&
    flow.proposed_relationship?.type === "directed_flow_link" &&
    flow.proposed_relationship.activation_state === "proposed" &&
    flow.evidence.shared_semantic_tokens.includes("water"),
  "Flow must resolve actual outlet/inlet endpoints and compatible medium semantics.",
);
assert(
  flow.builder_validation_handoff.some((item) =>
    item.includes("world-space"),
  ) &&
    flow.builder_validation_handoff.some((item) =>
      item.includes("physics"),
    ),
  "Flow must hand endpoint composition/representation downstream without claiming fluid physics.",
);

const noOutletFlow = resolveDirectableAssetPairInteraction(
  sourceGraph,
  cupInletGraph,
  "flow",
);
assert(
  noOutletFlow.status === "requires_asset_authoring",
  "Flow must not invent a literal outlet from arbitrary source bounds.",
);

const deterministicA = resolveDirectableAssetPairInteraction(
  hoseGraph,
  hydrantSocketGraph,
  "precise_attach",
);
const deterministicB = resolveDirectableAssetPairInteraction(
  hoseGraph,
  hydrantSocketGraph,
  "precise_attach",
);
assert(
  JSON.stringify(deterministicA) === JSON.stringify(deterministicB),
  "Pair resolution must be deterministic for the same graphs/context.",
);

assert(
  targetSupportGraph.local_bounds_center.join(",") === "0,0.5,0",
  "The hardened graph must now preserve local bounds center for pair transform solving.",
);

const pairResolverSource = source(
  "sandbox/probe-lab/directability/pair-interaction-resolver.ts",
);
const pairUiSource = source(
  "sandbox/probe-lab/directability/ui/directable-asset-pair-lab.tsx",
);
const pairPageSource = source(
  "app/sandbox/probe-lab/directable-interactions/page.tsx",
);
const phaseDoc = source(
  "sandbox/probe-lab/directability/PHASE1B5C_ASSET_PAIR_INTERACTIONS.md",
);

assert(
  !pairResolverSource.includes("ASSET_PAIR_MATRIX") &&
    !pairResolverSource.includes("assetPairMatrix"),
  "Phase 1B.5C must derive pair interactions generically rather than introducing an asset-pair matrix.",
);
assert(
  !pairUiSource.includes("<Canvas") &&
    !pairUiSource.includes("@react-three/fiber"),
  "The Phase 1B.5C qualification lab must not add another WebGL Canvas.",
);
assert(
  pairUiSource.includes("resolveAllDirectableAssetPairInteractions") &&
    pairUiSource.includes("inspectBrowserAssetStructure"),
  "The pair lab must use the canonical pair resolver and on-demand GLB inspection.",
);
assert(
  pairPageSource.includes("redirect") &&
    pairPageSource.includes("/sandbox/probe-lab/directable-assets?tab=interactions"),
  "Legacy /directable-interactions must redirect to the canonical Directable Assets interactions tab.",
);
for (const phrase of [
  "Asset-to-Asset Interaction Resolution",
  "Asset Scene Builder",
  "does **not** store",
  "persistent_attachment",
  "directed_flow_link",
]) {
  assert(
    phaseDoc.includes(phrase),
    `Phase 1B.5C documentation is missing required boundary phrase: ${phrase}`,
  );
}

assert(
  DIRECTOR_CAPABILITIES.length === 183,
  "Phase 1B.5C must not change the 183-capability Director catalog.",
);

console.log(
  "Asset-pair interaction resolution Phase 1B.5C verification passed.",
);
console.log(
  "Place/Surface Attach/Precise Attach/Insert/Flow derive from two hardened graphs, emit deterministic candidate plans, fail closed on incompatible evidence, and hand exact fit/collision authority to Asset Scene Builder.",
);
console.log(
  "No asset-pair matrix, extra WebGL Canvas, capability-count change, arbitrary subpart execution, or physics promotion was introduced.",
);
