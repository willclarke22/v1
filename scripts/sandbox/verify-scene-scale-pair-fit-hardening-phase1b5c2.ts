import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  MyWayAssetGeometryProfileV1,
  MyWayAssetRecord,
} from "../../sandbox/probe-lab/assets/asset-types";
import {
  ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
} from "../../sandbox/probe-lab/directability/asset-directability-contract";
import type {
  DirectableAssetAffordanceGraphV1,
  DirectableAssetPortAffordance,
  DirectableAssetStructureInspectionV1,
} from "../../sandbox/probe-lab/directability/affordance-graph-contract";
import {
  DIRECTABLE_ASSET_STRUCTURE_INSPECTION_SCHEMA_VERSION,
} from "../../sandbox/probe-lab/directability/affordance-graph-contract";
import {
  compileDirectableAssetAffordanceGraph,
} from "../../sandbox/probe-lab/directability/directable-asset-compiler";
import {
  inferGeometryShapeInspectionFromSamples,
} from "../../sandbox/probe-lab/directability/geometry-affordance-inference";
import {
  DIRECTABLE_ASSET_PAIR_FIT_HARDENING_VERSION,
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
    generator: "phase1b5c2_verifier",
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

const explicitPairScale = {
  source_dimensions_m: [1, 1, 1] as [number, number, number],
  target_dimensions_m: [1, 1, 1] as [number, number, number],
  source_dimensions_authority: "explicit_context" as const,
  target_dimensions_authority: "explicit_context" as const,
};

assert(
  DIRECTABLE_ASSET_PAIR_RESOLVER_VERSION ===
    "director_asset_pair_interaction_resolver_phase1b5c2_v1",
  "Unexpected Phase 1B.5C.2 pair resolver version.",
);
assert(
  DIRECTABLE_ASSET_PAIR_FIT_HARDENING_VERSION ===
    "director_scene_scale_pair_fit_hardening_phase1b5c2_v1",
  "Unexpected Phase 1B.5C.2 fit-hardening version.",
);

const compactSource = compileDirectableAssetAffordanceGraph(
  asset("compact_source", {
    geometry_profile: geometry({
      bottom_contact_region: {
        id: "bottom_contact",
        center: [0, 0, 0],
        normal: [0, 1, 0],
        size: [0.2, 0.2],
        area: 0.04,
        confidence: 0.96,
      },
    }),
  }),
);
const strongSupport = compileDirectableAssetAffordanceGraph(
  asset("strong_support", {
    geometry_profile: geometry({
      support_surfaces: [
        {
          id: "top",
          label: "Top support",
          center: [0, 1, 0],
          normal: [0, 1, 0],
          u_axis: [1, 0, 0],
          v_axis: [0, 0, 1],
          size: [0.34, 0.34],
          usable_size: [0.32, 0.32],
          area: 0.1156,
          confidence: 0.98,
          source: "blender_geometry",
          region_kind: "support",
          exposure: "exterior",
          orientation: "upward",
          openness: "open",
          vertical_rank: 1,
          clearance_above_m: 1,
          blocked_fraction: 0,
          enclosure_confidence: 0,
          edge_margin_m: 0.01,
        },
      ],
      primary_support_surface_id: "top",
    }),
  }),
);

const baselinePlace = resolveDirectableAssetPairInteraction(
  compactSource,
  strongSupport,
  "place_on",
  {
    source_dimensions_m: [1, 1, 1],
    target_dimensions_m: [1, 1, 1],
  },
);
assert(
  baselinePlace.status === "contextual_candidate" &&
    baselinePlace.fit.fits === true &&
    baselinePlace.diagnostics.source_scale_source === "asset_baseline" &&
    baselinePlace.diagnostics.target_scale_source === "asset_baseline" &&
    baselinePlace.missing_requirements.includes(
      "authoritative final scene dimensions/instance scale",
    ),
  "Asset Library baseline dimensions may preview Place fit but must not promote it to resolved_candidate.",
);

const explicitPlace = resolveDirectableAssetPairInteraction(
  compactSource,
  strongSupport,
  "place_on",
  explicitPairScale,
);
assert(
  explicitPlace.status === "resolved_candidate" &&
    explicitPlace.fit.fits === true &&
    Boolean(explicitPlace.candidate_transform) &&
    explicitPlace.evidence.source_evidence_ids.includes("contact:bottom_contact") &&
    explicitPlace.fit.source_size_m?.every((value) => value <= 0.21) &&
    explicitPlace.proposed_relationship?.type === "support_contact" &&
    explicitPlace.proposed_relationship.activation_state === "proposed",
  "Authoritative Place must use the measured contact footprint, not whole-asset X/Z bounds, and emit only a proposed support relation.",
);

const weakSupport = compileDirectableAssetAffordanceGraph(
  asset("weak_support", {
    geometry_profile: geometry({
      support_surfaces: [
        {
          id: "marginal_patch",
          label: "Marginal patch",
          center: [0, 0.6, 0],
          normal: [0, 0.58, 0.82],
          u_axis: [1, 0, 0],
          v_axis: [0, 0.82, -0.58],
          size: [0.35, 0.35],
          usable_size: [0.28, 0.28],
          area: 0.1225,
          confidence: 0.62,
          source: "blender_geometry",
          region_kind: "support",
          exposure: "exterior",
          orientation: "upward",
          openness: "open",
          vertical_rank: 0.5,
          clearance_above_m: null,
          blocked_fraction: 0.2,
          enclosure_confidence: 0,
          edge_margin_m: 0.035,
        },
      ],
      primary_support_surface_id: "marginal_patch",
    }),
  }),
);
const weakPlace = resolveDirectableAssetPairInteraction(
  compactSource,
  weakSupport,
  "place_on",
  explicitPairScale,
);
assert(
  weakPlace.status === "fallback_only" &&
    weakPlace.missing_requirements.includes("strong target support surface"),
  "Place must not promote marginal support patches that fail the hardened viability threshold.",
);

const cupPoints: Array<[number, number, number]> = [];
for (const y of [0, 0.25, 0.5, 0.75, 1]) {
  for (let index = 0; index < 96; index += 1) {
    const angle = (index / 96) * Math.PI * 2;
    cupPoints.push([0.5 * Math.cos(angle), y, 0.5 * Math.sin(angle)]);
  }
}
const cupShape = inferGeometryShapeInspectionFromSamples(cupPoints, 480);
assert(cupShape?.top_opening_candidates?.length, "Cup canary must expose measured top-opening geometry.");
const inferredContainer = compileDirectableAssetAffordanceGraph(
  asset("inferred_container", { affordances: ["container"] }),
  { structure: structure(cupShape!) },
);
const inferredOpening = inferredContainer.affordances.find(
  (item): item is DirectableAssetPortAffordance =>
    item.kind === "inlet_port" && item.id === "inlet_port:semantic_top_opening",
);
assert(
  inferredOpening?.opening_size &&
    inferredOpening.opening_size[0] > 0 &&
    inferredOpening.opening_size[1] > 0,
  "Measured open-top geometry must propagate usable aperture dimensions into the inferred inlet_port.",
);

const tinySource = compileDirectableAssetAffordanceGraph(asset("tiny_source"));
const baselineInsert = resolveDirectableAssetPairInteraction(
  tinySource,
  inferredContainer,
  "insert",
  {
    source_dimensions_m: [0.15, 0.15, 0.15],
    target_dimensions_m: [1, 1, 1],
  },
);
assert(
  baselineInsert.status === "contextual_candidate" &&
    baselineInsert.fit.fits === true,
  "Insertion at Asset Library baseline scale must remain contextual even when aperture and volume appear to fit.",
);

const explicitInsert = resolveDirectableAssetPairInteraction(
  tinySource,
  inferredContainer,
  "insert",
  {
    source_dimensions_m: [0.15, 0.15, 0.15],
    target_dimensions_m: [1, 1, 1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  explicitInsert.status === "resolved_candidate" &&
    explicitInsert.fit.fits === true &&
    Boolean(explicitInsert.candidate_transform) &&
    explicitInsert.evidence.target_evidence_ids.some((id) => id.startsWith("inlet_port:")) &&
    explicitInsert.proposed_relationship?.type === "containment_membership" &&
    explicitInsert.proposed_relationship.activation_state === "proposed" &&
    explicitInsert.proposed_relationship.activation_requirements.length > 0,
  "Authoritative insertion must require aperture + containment fit and emit only proposed containment membership.",
);

const manualContainer = compileDirectableAssetAffordanceGraph(
  asset("manual_container", {
    geometry_profile: geometry({
      interior_volumes: [
        {
          id: "interior",
          label: "Open interior",
          center: [0, 0.5, 0],
          size: [0.8, 0.8, 0.8],
          rotation: [0, 0, 0],
          confidence: 0.98,
          source: "blender_geometry",
          exposure: "interior",
          openness: "open",
          access_direction: [0, 1, 0],
        },
      ],
    }),
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      anchors: [
        {
          id: "interior",
          semantic_names: ["container_opening"],
          kind: "inlet",
          local_position: [0, 1, 0],
          local_normal: [0, 1, 0],
          confidence: 1,
        },
      ],
    },
  }),
);
const apertureTarget: DirectableAssetAffordanceGraphV1 = {
  ...manualContainer,
  affordances: manualContainer.affordances.map((item) =>
    item.kind === "inlet_port" && item.id === "inlet_port:interior"
      ? { ...item, opening_size: [0.2, 0.2] }
      : item,
  ),
};
const volumeFitsOpeningFails = resolveDirectableAssetPairInteraction(
  tinySource,
  apertureTarget,
  "insert",
  {
    source_dimensions_m: [0.5, 0.5, 0.5],
    target_dimensions_m: [1, 1, 1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  volumeFitsOpeningFails.status === "fallback_only" &&
    volumeFitsOpeningFails.fit.fits === false &&
    volumeFitsOpeningFails.fit.note.includes("aperture"),
  "A source that fits the internal volume but cannot pass through the measured opening must fail closed at authoritative scale.",
);

const noApertureContainer = compileDirectableAssetAffordanceGraph(
  asset("no_aperture_container", {
    geometry_profile: geometry({
      interior_volumes: [
        {
          id: "interior",
          label: "Open interior",
          center: [0, 0.5, 0],
          size: [0.8, 0.8, 0.8],
          rotation: [0, 0, 0],
          confidence: 0.98,
          source: "blender_geometry",
          exposure: "interior",
          openness: "open",
          access_direction: [0, 1, 0],
        },
      ],
    }),
  }),
);
const unknownApertureInsert = resolveDirectableAssetPairInteraction(
  tinySource,
  noApertureContainer,
  "insert",
  {
    source_dimensions_m: [0.2, 0.2, 0.2],
    target_dimensions_m: [1, 1, 1],
    source_dimensions_authority: "explicit_context",
    target_dimensions_authority: "explicit_context",
  },
);
assert(
  unknownApertureInsert.status === "contextual_candidate" &&
    unknownApertureInsert.fit.fits === true &&
    unknownApertureInsert.missing_requirements.some((item) => item.includes("aperture")),
  "Trusted containment without measured aperture dimensions must remain contextual rather than becoming resolved insertion.",
);

const hoseGraph = compileDirectableAssetAffordanceGraph(
  asset("authored_hose_canary", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      anchors: [
        {
          id: "fluid_connector",
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
const socketGraph = compileDirectableAssetAffordanceGraph(
  asset("authored_hydrant_socket_canary", {
    directability_overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
      anchors: [
        {
          id: "fluid_socket",
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
const authoredAttach = resolveDirectableAssetPairInteraction(
  hoseGraph,
  socketGraph,
  "precise_attach",
  explicitPairScale,
);
assert(
  authoredAttach.status === "resolved_candidate" &&
    authoredAttach.proposed_relationship?.type === "persistent_attachment" &&
    authoredAttach.proposed_relationship.activation_state === "proposed" &&
    !("relationship" in authoredAttach),
  "Explicitly authored connector canary must prove positive Precise Attach while keeping the relationship proposal unactivated.",
);

const faucetGraph = compileDirectableAssetAffordanceGraph(
  asset("authored_faucet_canary", {
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
const waterReceiverGraph = compileDirectableAssetAffordanceGraph(
  asset("authored_water_receiver_canary", {
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
const authoredFlow = resolveDirectableAssetPairInteraction(
  faucetGraph,
  waterReceiverGraph,
  "flow",
  { ...explicitPairScale, medium: "water" },
);
assert(
  authoredFlow.status === "resolved_candidate" &&
    Boolean(authoredFlow.route) &&
    authoredFlow.proposed_relationship?.type === "directed_flow_link" &&
    authoredFlow.proposed_relationship.activation_state === "proposed",
  "Explicitly authored outlet/inlet canaries must prove the positive Flow branch without inventing production Asset Library semantics.",
);

const uiSource = source(
  "sandbox/probe-lab/directability/ui/directable-asset-pair-lab.tsx",
);
for (const marker of [
  "source_dimensions_authority",
  "target_dimensions_authority",
  "asset_baseline",
  "Scene-scale authority",
  "proposed_relationship",
]) {
  assert(uiSource.includes(marker), `Pair UI missing 1B.5C.2 marker: ${marker}.`);
}
assert(
  !uiSource.includes("<Canvas") && !uiSource.includes("@react-three/fiber"),
  "Phase 1B.5C.2 must not add another WebGL Canvas.",
);

const resolverSource = source(
  "sandbox/probe-lab/directability/pair-interaction-resolver.ts",
);
for (const marker of [
  "MIN_PLACE_SUPPORT_VIABILITY",
  "asset_baseline",
  "opening_size",
  "fit3dThroughOpening",
  "activation_state",
]) {
  assert(resolverSource.includes(marker), `Pair resolver missing 1B.5C.2 marker: ${marker}.`);
}
assert(
  !resolverSource.includes("ASSET_PAIR_MATRIX") &&
    !resolverSource.includes("assetPairMatrix"),
  "Scene-scale hardening must remain generic rather than introducing a pair matrix.",
);

const phaseDoc = source(
  "sandbox/probe-lab/directability/PHASE1B5C2_SCENE_SCALE_PAIR_FIT_HARDENING.md",
).toLowerCase();
for (const phrase of [
  "asset_baseline",
  "scene_instance",
  "aperture",
  "proposed_relationship",
  "asset scene builder",
  "authored-positive canaries",
]) {
  assert(phaseDoc.includes(phrase), `Phase 1B.5C.2 documentation missing: ${phrase}.`);
}

assert(
  DIRECTOR_CAPABILITIES.length === 183,
  "Phase 1B.5C.2 must not change the 183-capability Director catalog.",
);

console.log("Scene-scale + pair-fit hardening Phase 1B.5C.2 verification passed.");
console.log("Asset baseline dimensions remain preview-only; authoritative scene scale gates strong pair outcomes, Place uses hardened support/contact evidence, Insert gates on aperture + volume fit, and relationships remain proposed until downstream validation.");
console.log("Positive Precise Attach/Flow branches are proven with explicit authored canaries without fabricating semantic ports in the production Asset Library.");
