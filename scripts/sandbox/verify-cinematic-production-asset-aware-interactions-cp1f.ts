import fs from "node:fs";
import path from "node:path";

import {
  assetInteractionGeometryOverlaps,
  enforceDirectionalSurfaceClearance,
  resolveAssetAwareInteractionMotion,
  type AssetInteractionGeometry,
  type AssetInteractionPose,
} from "../../sandbox/probe-lab/scenes/asset-aware-interaction-motion";
import {
  sampleCinematicBurgerRuntime,
} from "../../sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function near(a: number, b: number, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance;
}

function boxGeometry(
  size: [number, number, number],
): AssetInteractionGeometry {
  return {
    local_bounds: {
      min: [-size[0] / 2, 0, -size[2] / 2],
      max: [size[0] / 2, size[1], size[2] / 2],
      center: [0, size[1] / 2, 0],
      size,
    },
    contact_regions: [],
    collision_boxes: [],
  };
}

const root = process.cwd();
const layoutPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
const runtimePath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
const safetyPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-camera-safety.ts",
);
const solverPath = path.join(
  root,
  "sandbox/probe-lab/scenes/asset-aware-interaction-motion.ts",
);
const labPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
const readmePath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/README.md",
);
const benchmarkPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/benchmark-burger-assembly.ts",
);

const layout = fs.readFileSync(layoutPath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");
const safety = fs.readFileSync(safetyPath, "utf8");
const solverSource = fs.readFileSync(solverPath, "utf8");
const lab = fs.readFileSync(labPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");
const benchmark = fs.readFileSync(benchmarkPath, "utf8");

for (const marker of [
  "myway_asset_interaction_motion_solution_v1",
  "contactPairCandidates",
  "boundsFaceRegions",
  "geometryProjectionInterval",
  "solveClearancePath",
  "contact_collision_free",
  "contact_obstacle_ids",
  "enforceDirectionalSurfaceClearance",
]) {
  assert(
    solverSource.includes(marker),
    `CP.1F shared interaction solver marker missing: ${marker}.`,
  );
}

assert(
  solverSource.includes("complete visible normalized hull") &&
    solverSource.includes("Candidate ordering preserves semantic preference") &&
    solverSource.includes("Builder may") &&
    solverSource.includes("fail-safe"),
  "CP.1F must explicitly preserve measured-hull safety and Builder-style physical authority.",
);

const handGeometry = boxGeometry([0.46, 0.18, 1.2]);
const burgerGeometry = boxGeometry([0.96, 0.44, 0.96]);
const appleGeometry = boxGeometry([0.52, 0.58, 0.52]);
const trayGeometry = boxGeometry([4.4, 0.12, 3.0]);

const handStart: AssetInteractionPose = {
  position: [-2.34, 1.24, 1.02],
  rotation: [0.12, Math.PI, 0],
  scale: 1,
};
const burgerPose: AssetInteractionPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
};
const obstacles = [
  {
    id: "apple",
    pose: {
      position: [-1.36, 0, 0.36],
      rotation: [0, 0, 0],
      scale: 1,
    } satisfies AssetInteractionPose,
    geometry: appleGeometry,
    clearance_m: 0.035,
  },
  {
    id: "tray",
    pose: {
      position: [0, -0.12, 0],
      rotation: [0, 0, 0],
      scale: 1,
    } satisfies AssetInteractionPose,
    geometry: trayGeometry,
    clearance_m: 0.02,
  },
];

const baseSolution = resolveAssetAwareInteractionMotion({
  intent: {
    id: "synthetic_hand_nudge",
    kind: "nudge",
    approach_direction: [1, -0.12, -0.08],
    preferred_target_side: "left",
    contact_clearance_m: 0.008,
    obstacle_clearance_m: 0.035,
  },
  sourcePose: handStart,
  sourceGeometry: handGeometry,
  targetPose: burgerPose,
  targetGeometry: burgerGeometry,
  obstacles,
});

assert(
  baseSolution.contact.status !== "blocked" &&
    baseSolution.diagnostics.approach_collision_free &&
    baseSolution.diagnostics.contact_collision_free &&
    baseSolution.diagnostics.retreat_collision_free,
  "CP.1F synthetic hand/burger interaction must find a physically valid approach/contact/retreat around the apple/tray.",
);
assert(
  baseSolution.contact.surface_gap_m >= 0.006 &&
    baseSolution.contact.surface_gap_m <= 0.012,
  `CP.1F intended contact gap must stay small and positive; got ${baseSolution.contact.surface_gap_m}.`,
);
assert(
  !assetInteractionGeometryOverlaps({
    leftPose: baseSolution.contact.source_pose,
    leftGeometry: handGeometry,
    rightPose: burgerPose,
    rightGeometry: burgerGeometry,
    toleranceM: 0.0005,
  }),
  "CP.1F solved hand contact must not interpenetrate the burger's complete visible hull.",
);
assert(
  baseSolution.contact.target_region_id !== "bounds_face:left",
  "CP.1F candidate search should be allowed to abandon a semantically preferred contact face when the apple blocks that physical route.",
);

const measuredHand: AssetInteractionGeometry = {
  ...handGeometry,
  contact_regions: [
    {
      id: "measured_palm",
      label: "Measured palm contact",
      local_position: [0, 0, 0],
      local_normal: [0, -1, 0],
      size: [0.32, 0.42],
      confidence: 0.94,
      source: "geometry_profile",
      side: "bottom",
    },
  ],
};
const measuredBurger: AssetInteractionGeometry = {
  ...burgerGeometry,
  contact_regions: [
    {
      id: "measured_top",
      label: "Measured burger top",
      local_position: [0, 0.44, 0],
      local_normal: [0, 1, 0],
      size: [0.72, 0.72],
      confidence: 0.95,
      source: "geometry_profile",
      side: "top",
    },
  ],
};
const measuredSolution = resolveAssetAwareInteractionMotion({
  intent: {
    id: "measured_surface_contact",
    kind: "touch",
    approach_direction: [0.4, -1, -0.2],
    preferred_target_side: "top",
    contact_clearance_m: 0.006,
    obstacle_clearance_m: 0.02,
  },
  sourcePose: {
    position: [-0.7, 1.5, 0.4],
    rotation: [0, 0, 0],
    scale: 1,
  },
  sourceGeometry: measuredHand,
  targetPose: burgerPose,
  targetGeometry: measuredBurger,
});
assert(
  measuredSolution.contact.status === "resolved" &&
    measuredSolution.contact.source_region_id === "measured_palm" &&
    measuredSolution.contact.target_region_id === "measured_top" &&
    measuredSolution.diagnostics.source_contact_evidence === "measured_surface" &&
    measuredSolution.diagnostics.target_contact_evidence === "measured_surface",
  "CP.1F must prefer trusted measured exterior contact evidence when both assets provide it.",
);

// Maintaining contact is target-relative, not two coincident independent tracks.
const targetDelta: [number, number, number] = [0.14, 0.03, -0.08];
const movedBurger: AssetInteractionPose = {
  ...burgerPose,
  position: targetDelta,
};
const movedSolution = resolveAssetAwareInteractionMotion({
  intent: {
    id: "synthetic_hand_nudge",
    kind: "nudge",
    approach_direction: [1, -0.12, -0.08],
    preferred_target_side: "left",
    contact_clearance_m: 0.008,
    obstacle_clearance_m: 0.035,
  },
  sourcePose: handStart,
  sourceGeometry: handGeometry,
  targetPose: movedBurger,
  targetGeometry: burgerGeometry,
  obstacles,
});
const sourceDelta = movedSolution.contact.source_pose.position.map(
  (value, index) => value - baseSolution.contact.source_pose.position[index],
) as [number, number, number];
assert(
  baseSolution.contact.target_region_id === movedSolution.contact.target_region_id &&
    near(sourceDelta[0], targetDelta[0], 0.015) &&
    near(sourceDelta[1], targetDelta[1], 0.015) &&
    near(sourceDelta[2], targetDelta[2], 0.015),
  "CP.1F contact root must follow the target's resolved world motion while contact is maintained.",
);

// Generalized directional spacing: center distance is not the contract.
const fishGeometry = boxGeometry([0.72, 0.34, 0.28]);
const spacing = enforceDirectionalSurfaceClearance({
  movingPose: {
    position: [0, 0, -0.7],
    rotation: [0, 0, 0],
    scale: 1,
  },
  movingGeometry: fishGeometry,
  anchorPose: burgerPose,
  anchorGeometry: burgerGeometry,
  direction: [0, 0, -1],
  minimumSurfaceGapM: 0.3,
});
assert(
  spacing.current_surface_gap_m < 0.3 &&
    spacing.applied_shift_m > 0.15 &&
    spacing.pose.position[2] < -0.85,
  "CP.1F directional spacing must push an underspaced actor farther along the semantic direction until the surface gap is safe.",
);

assert(
  layout.includes("CP.1F: the film clock now authors only interaction intent") &&
    layout.includes('id: "hand_nudges_burger"') &&
    layout.includes('kind: "nudge"') &&
    layout.includes('sourceRole: "hand"') &&
    layout.includes('targetRole: "burger"') &&
    layout.includes("maintainContact") &&
    layout.includes("directionalClearanceConstraints") &&
    !layout.includes("handContactPosition"),
  "CP.1F layout must author semantic interaction/spacing constraints rather than a literal hand contact coordinate.",
);

const contactMoment = sampleCinematicBurgerRuntime(3.35);
const activeContact = contactMoment.interactions?.find(
  (item) => item.id === "hand_nudges_burger",
);
assert(
  activeContact?.phase === "contact" &&
    activeContact.maintainContact === true &&
    activeContact.obstacleRoles.includes("apple") &&
    activeContact.obstacleRoles.includes("tray"),
  "CP.1F one-film sampler must expose contact-maintenance intent and obstacle roles during the nudge.",
);

assert(
  layout.includes("const burgerNudge = smoothTimeWindow(filmTimeS, 3.18") &&
    layout.includes("earlyBurgerX") &&
    layout.includes("burgerNudge * 0.07") &&
    layout.includes("burgerNudge * 0.055"),
  "CP.1F burger translation must begin after geometry contact starts and resolve before release.",
);

for (const marker of [
  "../../scenes/asset-aware-interaction-motion",
  "surfaceContactRegions",
  "collisionBoxes",
  "resolveAssetAwareInteractionMotion",
  "enforceDirectionalSurfaceClearance",
  "apply measured pair-spacing constraints",
  "contact_status",
  "contact_collision_free",
  "contact_obstacle_ids",
  "Builder-style fail-closed behavior",
]) {
  assert(runtime.includes(marker), `CP.1F runtime integration marker missing: ${marker}.`);
}

assert(
  runtime.includes("profile?.attachment_regions") &&
    runtime.includes('region.exposure !== "interior"') &&
    runtime.includes("profile?.collision_boxes"),
  "CP.1F runtime geometry preparation must bridge measured exterior contact regions and collision boxes into interaction geometry.",
);

// Camera continuity is deliberately not re-authored in CP.1F.
assert(
  runtime.includes("CP.1E.12 soft post-rail camera safety") &&
    runtime.includes("advanceSoftCameraSafetyCorrection") &&
    safety.includes("Playback-only temporal governor") &&
    layout.includes("C2 through-motion master camera rail"),
  "CP.1F must preserve the approved C2 + soft final-camera continuity stack.",
);
assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"') &&
    runtime.includes("CameraAwareStudioRig") &&
    (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1F must preserve the single low-overhead cinematic Canvas/runtime.",
);

assert(
  lab.includes("MyWay · Cinematic Production · CP.1F") &&
    lab.includes("asset-aware") &&
    lab.includes("surface-to-surface"),
  "CP.1F lab copy must expose the asset-aware contact/spacing promotion.",
);
assert(
  readme.includes("CP.1F — Asset-Aware Interaction Geometry Foundation") &&
    readme.includes("Intentional contact versus collision") &&
    readme.includes("Contact-coupled motion") &&
    readme.includes("Generalized surface spacing") &&
    readme.includes("Rigid-contact boundary"),
  "CP.1F README must document the shared interaction authority and its rigid-contact boundary.",
);
assert(
  benchmark.includes("geometry-aware rigid contact/nudge") &&
    benchmark.includes("articulated finger wrapping / grasp"),
  "CP.1F benchmark notes must distinguish rigid contact from future rig/IK grasping.",
);

console.log("Cinematic Production CP.1F asset-aware interaction verification passed.");
console.log(
  "Semantic nudge intent now resolves through measured/fallback contact surfaces, complete-hull separation, swept obstacle clearance, target-relative contact maintenance, and surface-to-surface negative-space constraints while the approved continuous camera remains locked.",
);
