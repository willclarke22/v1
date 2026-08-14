import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_ASSET_DIRECTABILITY_VERSION,
  ASSET_DIRECTABILITY_PROFILE_SCHEMA_VERSION,
  ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
  buildAssetDirectabilityProfile,
  directabilityForwardHorizontalAxis,
  directabilityRollingRadiusForActor,
  normalizeAssetDirectabilityOverrides,
  resolveAssetDirectabilityRequirement,
} from "../../sandbox/probe-lab/directability";
import {
  normalizeMyWayAssetRecord,
} from "../../sandbox/probe-lab/assets/normalize-asset-record";
import type {
  MyWayAssetRecord,
} from "../../sandbox/probe-lab/assets/asset-types";
import type {
  DirectorEvent,
  DirectorMoment,
} from "../../sandbox/probe-lab/director/director-contract";
import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  compileDirectorActorMotionProgram,
} from "../../sandbox/probe-lab/motion-program/director-motion-program-compiler";
import {
  MOTION_PROGRAM_RUNTIME_CHANNELS,
} from "../../sandbox/probe-lab/motion-program/motion-program-contract";
import type {
  DirectorMotionProgramActor,
} from "../../sandbox/probe-lab/motion-program/director-motion-program-compiler";
import {
  makeResolvedSceneAssetBinding,
} from "../../sandbox/probe-lab/scenes/resolved-scene";
import type {
  PrimitiveBuilderAssetRequirement,
} from "../../sandbox/probe-lab/primitive-builder/asset-requirement-plan";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(left: number, right: number, tolerance = 1e-8) {
  return Math.abs(left - right) <= tolerance;
}

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function normalizedText(value: string) {
  return value
    .toLowerCase()
    .replace(/[`*#>~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function event(
  id: string,
  behaviour: DirectorEvent["behaviour"],
  actorId: string,
  targetId: string | null,
  parameters: Record<string, unknown> = {},
): DirectorEvent {
  return {
    id,
    behaviour,
    actor_entity_id: actorId,
    target_entity_id: targetId,
    supporting_entity_ids: [],
    start_ms: 0,
    duration_ms: 1000,
    easing: "linear",
    path_hint: null,
    description: id,
    parameters,
    fallback_behaviour: null,
  };
}

function moment(
  id: string,
  events: DirectorEvent[],
): DirectorMoment {
  return {
    id,
    title: id,
    learning_job: id,
    director_intent: id,
    source_explanation_piece_ids: [],
    duration_ms: 1000,
    introduces_entity_ids: [],
    keeps_visible_entity_ids: [],
    active_entity_ids: [],
    camera: {
      shot_type: "medium",
      movement: "static",
      focus_entity_ids: [],
      framing_intent: id,
      keep_visible_entity_ids: [],
    },
    events,
    text_cues: [],
  };
}

function rawAsset(input: {
  id: string;
  overrides?: unknown;
  inlet?: boolean;
  outlet?: boolean;
  withGeometry?: boolean;
}) {
  const withGeometry = input.withGeometry !== false;
  const override = input.overrides ?? {
    schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
    orientation: {
      up_axis: [0, 1, 0],
      forward_axis: [0, 0, 1],
      confidence: 0.99,
    },
    anchors: [
      ...(input.outlet
        ? [{
            id: "outlet",
            semantic_names: ["flow_outlet", "emission_origin"],
            kind: "outlet",
            local_position: [0, 0.8, 0.5],
            local_normal: [0, 0, 1],
            confidence: 1,
          }]
        : []),
      ...(input.inlet
        ? [{
            id: "inlet",
            semantic_names: ["flow_inlet"],
            kind: "inlet",
            local_position: [0, 0.8, -0.5],
            local_normal: [0, 0, -1],
            confidence: 1,
          }]
        : []),
    ],
    pivots: [
      {
        id: "door_hinge",
        semantic_names: ["hinge_anchor", "hinge_axis", "door_hinge"],
        local_position: [-0.9, 0.5, 0],
        axis: [0, 1, 0],
        target_scope: "subpart",
        subpart_id: "door",
        min_degrees: 0,
        max_degrees: 85,
        confidence: 1,
      },
    ],
    subparts: [
      {
        id: "door",
        semantic_names: ["door", "opening_panel"],
        node_name: "DoorMesh",
        capabilities: ["articulate", "rotate"],
        pivot_id: "door_hinge",
        confidence: 1,
      },
    ],
    rolling: {
      radius_m: 0.25,
      axis: [0, 0, 1],
      local_center: [0, 0.25, 0],
      confidence: 1,
    },
    rig: {
      bone_map: {
        left_hand: "Hand.L",
      },
      clip_map: {
        walk: "WalkCycle",
      },
      confidence: 1,
    },
  };

  return {
    asset_id: input.id,
    canonical_label: input.id,
    display_name: input.id,
    public_path: `/sandbox-assets/${input.id}.glb`,
    source_type: "manual",
    asset_type: "glb",
    status: "approved",
    scene_review_status: "approved",
    semantic_review_status: "verified",
    dimensions_m: [2, 1, 1],
    default_scale: 1,
    default_rotation: [0, 0, 0],
    ground_offset_m: 0,
    rigged: true,
    animation_clips: ["WalkCycle"],
    quality_score: 1,
    reuse_count: 0,
    license_kind: "self_owned",
    license_status: "app_ready",
    commercial_use_allowed: true,
    raw_redistribution_allowed: true,
    safe_to_use_in_sandbox: true,
    safe_to_promote_to_app: true,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    geometry_profile: withGeometry
      ? {
          schema_version: "myway_asset_geometry_profile_v1",
          coordinate_space: "normalized_glb_y_up",
          local_bounds: {
            min: [-1, 0, -0.5],
            max: [1, 1, 0.5],
            size: [2, 1, 1],
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
            size: [1.8, 0.8],
            area: 1.44,
            confidence: 0.9,
          },
          support_surfaces: [
            {
              id: "top_surface",
              label: "Top surface",
              center: [0, 1, 0],
              normal: [0, 1, 0],
              u_axis: [1, 0, 0],
              v_axis: [0, 0, 1],
              size: [1.8, 0.8],
              area: 1.44,
              confidence: 0.9,
              source: "blender_geometry",
            },
          ],
          interior_volumes: [
            {
              id: "interior",
              label: "Interior",
              center: [0, 0.55, 0],
              size: [1.5, 0.7, 0.6],
              rotation: [0, 0, 0],
              confidence: 0.85,
              source: "blender_geometry",
              exposure: "interior",
              openness: "open",
              access_direction: [0, 1, 0],
            },
          ],
          attachment_regions: [
            {
              id: "front_attachment",
              label: "Front attachment",
              center: [0, 0.5, 0.5],
              normal: [0, 0, 1],
              u_axis: [1, 0, 0],
              v_axis: [0, 1, 0],
              size: [0.6, 0.6],
              confidence: 0.8,
              source: "blender_geometry",
              exposure: "exterior",
              orientation: "vertical",
              side: "front",
            },
          ],
          collision_boxes: [],
          primary_support_surface_id: "top_surface",
          audit: {
            status: "measured",
            confidence: 0.9,
            warnings: [],
            mesh_object_count: 2,
            included_mesh_count: 2,
            excluded_mesh_names: [],
            triangle_count: 1200,
            support_surface_count: 1,
          },
          content_hash: "synthetic",
          generated_at: new Date(0).toISOString(),
          generator: "synthetic_verifier",
        }
      : null,
    directability_overrides: override,
  };
}

function normalizedAsset(raw: ReturnType<typeof rawAsset>) {
  const asset = normalizeMyWayAssetRecord(raw);
  assert(asset, "Synthetic asset failed normalization.");
  return asset;
}

assert(
  DIRECTOR_ASSET_DIRECTABILITY_VERSION ===
    "director_asset_directability_phase1b5_v1",
  "Phase 1B.5 directability version drifted.",
);
assert(
  ASSET_DIRECTABILITY_PROFILE_SCHEMA_VERSION ===
    "myway_asset_directability_profile_v1",
  "Asset directability profile schema drifted.",
);
assert(
  !(MOTION_PROGRAM_RUNTIME_CHANNELS as readonly string[]).includes(
    "articulation",
  ),
  "Phase 1B.5 must not falsely promote arbitrary subpart articulation execution.",
);
assert(
  !(MOTION_PROGRAM_RUNTIME_CHANNELS as readonly string[]).includes(
    "skeletal",
  ),
  "Phase 1B.5 must not falsely promote skeletal execution.",
);

const badOverride = normalizeAssetDirectabilityOverrides({
  schema_version: "wrong",
  pivots: [],
});
assert(
  badOverride === null,
  "Directability override normalizer accepted an unknown schema.",
);

const sourceAsset = normalizedAsset(
  rawAsset({
    id: "source_asset",
    outlet: true,
  }),
);
assert(
  sourceAsset.directability_overrides?.pivots?.[0]?.id === "door_hinge",
  "Asset normalization did not preserve versioned directability overrides.",
);
const sourceProfile = buildAssetDirectabilityProfile(sourceAsset);
assert(
  sourceProfile.asset_id === sourceAsset.asset_id,
  "Directability profile lost stable asset identity.",
);
assert(
  sourceProfile.orientation.forward_axis[2] > 0.99,
  "Directability orientation frame did not preserve forward evidence.",
);
assert(
  sourceProfile.surfaces.length === 1,
  "Measured support surface did not bridge into directability.",
);
assert(
  sourceProfile.containment_regions.length === 1,
  "Measured interior volume did not bridge into containment directability.",
);
assert(
  sourceProfile.anchors.some(
    (anchor) => anchor.id === "front_attachment",
  ),
  "Measured attachment region did not bridge into an attachment anchor.",
);
assert(
  sourceProfile.pivots.length === 1 &&
    sourceProfile.subparts.length === 1,
  "Explicit hinge/subpart directability metadata was lost.",
);
assert(
  sourceProfile.rolling?.radius_m === 0.25,
  "Explicit rolling radius was lost.",
);
assert(
  sourceProfile.rig.bone_map.left_hand === "Hand.L" &&
    sourceProfile.rig.clip_map.walk === "WalkCycle",
  "Semantic rig/clip maps were lost.",
);

const geometryOnly = normalizedAsset(
  rawAsset({
    id: "geometry_only",
    overrides: {
      schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
    },
  }),
);
const geometryOnlyProfile =
  buildAssetDirectabilityProfile(geometryOnly);
assert(
  geometryOnlyProfile.pivots.length === 0 &&
    geometryOnlyProfile.subparts.length === 0 &&
    geometryOnlyProfile.rolling === null,
  "Phase 1B.5 invented semantic pivots/subparts/rolling metadata from geometry.",
);

assert(
  directabilityForwardHorizontalAxis(sourceProfile) === "z",
  "Directability forward-axis resolver did not select +Z.",
);
assert(
  approx(
    directabilityRollingRadiusForActor(
      sourceProfile,
      [4, 2, 2],
    ) ?? Number.NaN,
    0.5,
  ),
  "Rolling radius did not scale from asset-local to actor-world size.",
);

const hingeRequirement = resolveAssetDirectabilityRequirement(
  sourceProfile,
  {
    id: "hinge_req",
    target_entity_id: "source",
    kind: "anchor",
    semantic_name: "hinge_anchor",
    required: true,
    runtime_status: "declared",
  },
);
assert(
  hingeRequirement.resolved &&
    hingeRequirement.evidence_kind === "pivot",
  "Hinge requirement did not resolve from semantic pivot evidence.",
);

const targetAsset = normalizedAsset(
  rawAsset({
    id: "target_asset",
    inlet: true,
  }),
);
const targetProfile = buildAssetDirectabilityProfile(targetAsset);

const sourceActor: DirectorMotionProgramActor = {
  id: "source",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  size: [4, 2, 2],
  directability: sourceProfile,
};
const targetActor: DirectorMotionProgramActor = {
  id: "target",
  position: [4, 0, 0],
  rotation: [0, 0, 0],
  size: [2, 2, 2],
  directability: targetProfile,
};
const actors = [sourceActor, targetActor];

const rollCompilation = compileDirectorActorMotionProgram(
  moment("roll_directability", [
    event("roll", "roll", "source", null, {
      distance_m: 1,
    }),
  ]),
  sourceActor,
  actors,
);
assert(
  rollCompilation.route === "motion_program" &&
    rollCompilation.program,
  "Roll did not compile through MotionProgram with directability.",
);
const rollRotation = rollCompilation.program.tracks.find(
  (track) => track.id.endsWith(":roll_rotation"),
);
assert(
  rollRotation?.operation === "lerp_angle" &&
    rollRotation.parameters.axis === "z" &&
    approx(rollRotation.parameters.to_radians, 2),
  "Roll did not consume directability radius/axis.",
);
assert(
  rollCompilation.program.requirements.every(
    (requirement) => requirement.runtime_status === "resolved",
  ),
  "Roll directability requirements did not resolve.",
);
assert(
  rollCompilation.program.diagnostics.directability_version ===
    DIRECTOR_ASSET_DIRECTABILITY_VERSION,
  "MotionProgram diagnostics did not record Phase 1B.5.",
);

const alignCompilation = compileDirectorActorMotionProgram(
  moment("align_directability", [
    event("align", "align", "source", "target"),
  ]),
  sourceActor,
  actors,
);
const alignTrack = alignCompilation.program?.tracks.find(
  (track) => track.operation === "orient_axis_toward_target",
);
assert(
  alignTrack?.operation === "orient_axis_toward_target" &&
    alignTrack.parameters.axis === "z",
  "Align did not consume the asset forward orientation frame.",
);

const openCompilation = compileDirectorActorMotionProgram(
  moment("open_directability", [
    event("open", "open", "source", null),
  ]),
  sourceActor,
  actors,
);
assert(
  openCompilation.program?.requirements.length === 2 &&
    openCompilation.program.requirements.every(
      (requirement) => requirement.runtime_status === "resolved",
    ),
  "Open/Hinge requirements did not resolve from directability pivot evidence.",
);
assert(
  openCompilation.program.tracks.every(
    (track) => String(track.channel) !== "articulation",
  ),
  "Phase 1B.5 falsely switched Open to arbitrary subpart articulation.",
);

const fillCompilation = compileDirectorActorMotionProgram(
  moment("fill_directability", [
    event("fill", "fill", "source", null),
  ]),
  sourceActor,
  actors,
);
assert(
  fillCompilation.program?.requirements.some(
    (requirement) =>
      requirement.semantic_name === "containment_region" &&
      requirement.runtime_status === "resolved",
  ),
  "Fill containment requirement did not resolve from measured interior geometry.",
);

const flowCompilation = compileDirectorActorMotionProgram(
  moment("flow_directability", [
    event("flow", "flow", "source", "target"),
  ]),
  sourceActor,
  actors,
);
const flowRequirements =
  flowCompilation.program?.requirements ?? [];
assert(
  flowRequirements.some(
    (requirement) =>
      requirement.semantic_name === "flow_outlet" &&
      requirement.runtime_status === "resolved",
  ),
  "Flow outlet did not resolve from source actor directability.",
);
assert(
  flowRequirements.some(
    (requirement) =>
      requirement.semantic_name === "flow_inlet" &&
      requirement.target_entity_id === "target" &&
      requirement.runtime_status === "resolved",
  ),
  "Flow inlet did not resolve against the target actor's directability profile.",
);

const noProfileActor: DirectorMotionProgramActor = {
  id: "plain",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  size: [2, 2, 2],
};
const noProfileOpen = compileDirectorActorMotionProgram(
  moment("open_without_profile", [
    event("open_plain", "open", "plain", null),
  ]),
  noProfileActor,
  [noProfileActor],
);
assert(
  noProfileOpen.route === "motion_program" &&
    noProfileOpen.program?.requirements.every(
      (requirement) => requirement.runtime_status === "declared",
    ),
  "Missing directability evidence should remain declared without breaking the qualified fallback.",
);
assert(
  noProfileOpen.program?.diagnostics.directability_version == null,
  "A missing profile was incorrectly reported as Phase 1B.5 evidence.",
);

const sceneRequirement = {
  instance_id: "source_instance",
  concept: "source asset",
  aliases: [],
  semantic_tags: [],
  domain: "generic",
  target_extent_m: 2,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  layout_proxy_node_ids: [],
  placement_relation: "on_ground",
  placement_anchor: "auto",
  placement_region: "auto",
  placement_source: "explicit",
  placement_offset: [0, 0, 0],
  placement_uv: [0.5, 0.5],
  layout_priority: 0,
  clearance_m: 0.02,
} as unknown as PrimitiveBuilderAssetRequirement;
const binding = makeResolvedSceneAssetBinding({
  requirement: sceneRequirement,
  asset: sourceAsset,
});
assert(
  binding.directability_profile?.asset_id === sourceAsset.asset_id,
  "Resolved scene binding did not carry the derived directability profile.",
);

const supportCounts = DIRECTOR_CAPABILITIES.reduce(
  (counts, capability) => {
    counts[capability.compiler.threejs] += 1;
    return counts;
  },
  {
    direct: 0,
    compound: 0,
    approximate: 0,
    declared: 0,
  },
);
assert(
  DIRECTOR_CAPABILITIES.length === 183,
  "Phase 1B.5 changed the semantic capability catalog size.",
);
assert(
  supportCounts.direct === 101 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.5 silently changed support classifications: ${JSON.stringify(supportCounts)}.`,
);

const runtimeSource = read(
  "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
);
assert(
  runtimeSource.includes(
    "directability?: AssetDirectabilityProfileV1 | null;",
  ),
  "Director runtime actor no longer carries optional asset directability.",
);
const builderSource = read(
  "sandbox/probe-lab/primitive-builder/ui/primitive-builder-lab.tsx",
);
assert(
  builderSource.includes(
    "directability: binding.directability_profile ?? null",
  ),
  "Primitive Builder is not passing resolved asset directability into Director actors.",
);
const capabilityLibrarySource = read(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
assert(
  !capabilityLibrarySource.includes("<Canvas"),
  "Capability Library directly owns a Canvas after Phase 1B.5.",
);
assert(
  capabilityLibrarySource.includes("asset_directability:"),
  "Capability Library inspector is missing Phase 1B.5 directability diagnostics.",
);

const directabilityReadme = normalizedText(
  read("sandbox/probe-lab/directability/README.md"),
);
for (const concept of [
  "measured geometry",
  "directability_overrides",
  "does not infer semantic mesh parts",
  "asset scene builder",
  "does not claim arbitrary subpart execution",
]) {
  assert(
    directabilityReadme.includes(concept),
    `Directability documentation is missing concept: ${concept}.`,
  );
}
const motionReadme = normalizedText(
  read("sandbox/probe-lab/motion-program/README.md"),
);
for (const concept of [
  "phase 1b.5",
  "asset directability foundation",
  "resolved scene bindings",
  "missing required evidence",
  "arbitrary glb child/subpart execution",
]) {
  assert(
    motionReadme.includes(concept),
    `MotionProgram Phase 1B.5 documentation is missing concept: ${concept}.`,
  );
}

console.log(
  "Director asset directability Phase 1B.5 verification passed.",
);
console.log(
  "Measured orientation/surfaces/containment/attachment evidence, explicit pivots/subparts/rolling/rig mappings, per-entity requirement resolution, and real resolved-binding propagation passed.",
);
console.log(
  "Roll/Align consume safe directability metadata; Open/Hinge requirements resolve without falsely promoting arbitrary subpart articulation. Capability counts/support labels and single-Canvas policy remain unchanged.",
);
