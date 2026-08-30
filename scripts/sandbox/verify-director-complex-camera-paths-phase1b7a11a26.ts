import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  DIRECTOR_SPLINE_DEMO_POLICY_VERSION,
  DIRECTOR_SPLINE_DEMO_TARGET_RELATIVE_WAYPOINTS,
  directorCapabilityDemoMoment,
  directorCapabilityDemoShot,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import { directorQualificationScene } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import {
  sampleDirectorCameraPose,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function distanceToTuple(
  point: { x: number; y: number; z: number },
  tuple: readonly [number, number, number],
) {
  return Math.hypot(
    point.x - tuple[0],
    point.y - tuple[1],
    point.z - tuple[2],
  );
}

function main() {
  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenIds = frozenFamilies.flatMap((family) => family.capability_ids);
  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);
  const deferred = [...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS] as readonly string[];

  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      frozenFamilies.length === 33 &&
      frozenIds.length === 184 &&
      new Set(frozenIds).size === 184,
    "A.11A.26 must preserve the frozen 184-capability / 33-family Director taxonomy.",
  );
  assert(
    activeFamilies.length === 33 &&
      activeIds.length === DIRECTOR_CAPABILITIES.length - deferred.length &&
      new Set(activeIds).size === activeIds.length,
    `A.11A.26 successor coverage must equal frozen coverage minus the live deferred set. Got ${activeIds.length} active / ${deferred.length} deferred.`,
  );
  for (const id of deferred) {
    assert(!activeIds.includes(id), `Deferred capability leaked into active Qualification: ${id}.`);
    assert(frozenIds.includes(id), `Deferred capability disappeared from frozen taxonomy: ${id}.`);
  }

  const frozenComplex = frozenFamilies.find(
    (family) =>
      family.category === "camera_movement" &&
      family.group === "Complex camera paths",
  );
  const activeComplex = activeFamilies.find(
    (family) =>
      family.category === "camera_movement" &&
      family.group === "Complex camera paths",
  );
  assert(frozenComplex && activeComplex, "Complex camera paths family is missing.");
  assert(
    JSON.stringify(frozenComplex.capability_ids) ===
      JSON.stringify(["spline", "pass_through"]),
    `Frozen Complex camera paths vocabulary changed: ${JSON.stringify(frozenComplex.capability_ids)}.`,
  );
  const expectedActiveComplexIds = frozenComplex.capability_ids.filter(
    (id) => !deferred.includes(id),
  );
  assert(
    JSON.stringify(activeComplex.capability_ids) === JSON.stringify(expectedActiveComplexIds),
    `A.11A.26 active Complex camera paths must mirror the live deferred set: ${JSON.stringify(activeComplex.capability_ids)} expected ${JSON.stringify(expectedActiveComplexIds)}.`,
  );
  assert(
    activeComplex.capability_ids.includes("spline"),
    "Spline must remain active unless a successor phase explicitly defers it.",
  );

  const passProfile = directorQualificationCapabilityProfile(
    frozenComplex,
    "pass_through",
  );
  assert(
    passProfile.qualification_note?.includes("traversable opening") &&
      passProfile.qualification_note.includes("entry plane") &&
      passProfile.qualification_note.includes("safe aperture"),
    "Pass-through deferral must document the missing traversable-boundary prerequisites.",
  );

  assert(
    DIRECTOR_SPLINE_DEMO_POLICY_VERSION ===
      "director_spline_demo_waypoints_phase1b7a11a26_v1",
    `Unexpected Spline demo policy version: ${DIRECTOR_SPLINE_DEMO_POLICY_VERSION}.`,
  );
  assert(
    DIRECTOR_SPLINE_DEMO_TARGET_RELATIVE_WAYPOINTS.length === 4,
    "Spline demo must author four explicit target-relative waypoints after the solved start pose.",
  );

  const splineShot = directorCapabilityDemoShot(capability("spline"));
  const splineStep = splineShot.camera.movement_steps[0];
  assert(splineStep, "Spline demo lost its camera movement step.");
  assert(splineStep.movement === "spline", "Spline demo lost its spline movement step.");
  assert(
    splineStep.coordinate_space === "target_relative" &&
      splineStep.easing === "linear" &&
      splineStep.parameters.prepend_current_pose === true,
    `Spline demo must use linear target-relative waypoint timing with the solved start pose prepended: ${JSON.stringify(splineStep)}.`,
  );
  const authoredRelative = splineStep.parameters.target_relative_points;
  assert(
    Array.isArray(authoredRelative) &&
      authoredRelative.length === DIRECTOR_SPLINE_DEMO_TARGET_RELATIVE_WAYPOINTS.length,
    "Spline demo is not carrying the authored target-relative waypoint payload.",
  );

  const scene = directorQualificationScene("scene_b_spatial_relationship");
  const actor: DirectorRuntimeActor = {
    id: "primary_subject",
    position: [...scene.blocking.primary],
    rotation: [0, 0, 0],
    size: [0.66, 1.75, 0.52],
    directability: null,
  };
  const moment = directorCapabilityDemoMoment(capability("spline"));
  const start = splineStep.start_progress;
  const end = splineStep.end_progress;
  const span = end - start;
  const startPose = sampleDirectorCameraPose(moment, start, [actor]);
  const target = startPose.target.clone();
  const expectedControlPoints: Array<readonly [number, number, number]> = [
    [startPose.position.x, startPose.position.y, startPose.position.z],
    ...DIRECTOR_SPLINE_DEMO_TARGET_RELATIVE_WAYPOINTS.map(
      ([x, y, z]) =>
        [target.x + x, target.y + y, target.z + z] as const,
    ),
  ];

  const controlProgress = expectedControlPoints.map(
    (_, index) => start + span * (index / (expectedControlPoints.length - 1)),
  );
  const controlPoses = controlProgress.map((progress) =>
    sampleDirectorCameraPose(moment, progress, [actor]),
  );
  for (let index = 0; index < expectedControlPoints.length; index += 1) {
    const error = distanceToTuple(
      controlPoses[index]!.position,
      expectedControlPoints[index]!,
    );
    assert(
      error < 0.015,
      `Spline camera missed authored waypoint ${index}: error ${error.toFixed(4)}m.`,
    );
  }

  const xs = controlPoses.map((pose) => pose.position.x);
  const ys = controlPoses.map((pose) => pose.position.y);
  const zs = controlPoses.map((pose) => pose.position.z);
  assert(
    Math.max(...xs) - Math.min(...xs) > 3 &&
      Math.max(...ys) - Math.min(...ys) > 0.45 &&
      Math.max(...zs) - Math.min(...zs) > 2.2,
    `Spline waypoint rail must be materially multi-axis. X/Y/Z spans: ${(Math.max(...xs) - Math.min(...xs)).toFixed(3)} / ${(Math.max(...ys) - Math.min(...ys)).toFixed(3)} / ${(Math.max(...zs) - Math.min(...zs)).toFixed(3)}.`,
  );

  const controlDirections = [];
  for (let index = 1; index < controlPoses.length; index += 1) {
    controlDirections.push(
      controlPoses[index]!.position
        .clone()
        .sub(controlPoses[index - 1]!.position)
        .normalize(),
    );
  }
  const turns = [];
  for (let index = 1; index < controlDirections.length; index += 1) {
    turns.push(
      controlDirections[index - 1]!.angleTo(controlDirections[index]!) *
        (180 / Math.PI),
    );
  }
  assert(
    turns.filter((value) => value > 18).length >= 2,
    `Spline control rail must contain multiple visible direction changes. Turns: ${turns.map((value) => value.toFixed(1)).join(" / ")} deg.`,
  );

  // Catmull-Rom should preserve the tangent direction *at* each interior control
  // point. The original A.11A.26 canary compared two finite-difference segments
  // that were deliberately offset away from the waypoint; on a curved rail that
  // measures local curvature, not tangent continuity. Sample one-sided secants that
  // share the waypoint itself and use a much smaller epsilon instead.
  const continuityAngles = [];
  const tangentEpsilon = span * 0.0005;
  for (let index = 1; index < expectedControlPoints.length - 1; index += 1) {
    const p = controlProgress[index]!;
    const before = sampleDirectorCameraPose(moment, p - tangentEpsilon, [actor]).position;
    const atWaypoint = sampleDirectorCameraPose(moment, p, [actor]).position;
    const after = sampleDirectorCameraPose(moment, p + tangentEpsilon, [actor]).position;
    const incoming = atWaypoint.clone().sub(before).normalize();
    const outgoing = after.clone().sub(atWaypoint).normalize();
    continuityAngles.push(incoming.angleTo(outgoing) * (180 / Math.PI));
  }
  assert(
    continuityAngles.every((value) => value < 3),
    `Spline one-sided tangent continuity regressed at a waypoint: ${continuityAngles.map((value) => value.toFixed(3)).join(" / ")} deg.`,
  );

  const minimumTargetDistance = Math.min(
    ...Array.from({ length: 25 }, (_, index) => {
      const progress = start + span * (index / 24);
      const pose = sampleDirectorCameraPose(moment, progress, [actor]);
      return pose.position.distanceTo(pose.target);
    }),
  );
  assert(
    minimumTargetDistance > 1.8,
    `Spline qualification camera approaches the teaching subject too closely: ${minimumTargetDistance.toFixed(3)}m.`,
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "target_relative_points",
    "prepend_current_pose",
    "absolutePoints.length >= 2",
    'new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4)',
    "Compatibility fallback for legacy spline cues that carry no waypoints.",
  ]) {
    assert(runtime.includes(marker), `A.11A.26 Spline runtime marker missing: ${marker}`);
  }


  const a25 = source(
    "scripts/sandbox/verify-director-shot-scale-semantic-framing-phase1b7a11a25.ts",
  );
  assert(
    a25.includes("DIRECTOR_CAPABILITIES.length - deferred.length") &&
      a25.includes("A.11A.25 lineage requires") &&
      !a25.includes("activeIds.length === 176"),
    "A.11A.25 verifier must be successor-safe under the Pass-through deferral.",
  );


  console.log("Director Complex camera paths Phase 1B.7A.11A.26 verification passed.");
  console.log(
    `Frozen/active taxonomy: 184/${activeIds.length}. Spline control turns: ${turns.map((value) => value.toFixed(1)).join(" / ")} deg; tangent continuity: ${continuityAngles.map((value) => value.toFixed(2)).join(" / ")} deg; minimum target distance ${minimumTargetDistance.toFixed(3)}m.`,
  );
}

main();
