import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  DIRECTOR_DOLLY_DEMO_CAMERA_RELATIVE_DIRECTION,
  DIRECTOR_DOLLY_DEMO_DISTANCE_M,
  DIRECTOR_LINEAR_CAMERA_TRAVEL_DEMO_POLICY_VERSION,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import { buildDirectorCameraFidelityReport } from "../../sandbox/probe-lab/motion-camera-library/director-camera-fidelity";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

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

type Vec3 = readonly [number, number, number];

function subtract(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(value: Vec3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(value: Vec3): [number, number, number] {
  const magnitude = Math.max(0.000001, length(value));
  return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude];
}

function addScaled(
  value: Vec3,
  basis: Vec3,
  scale: number,
): [number, number, number] {
  return [
    value[0] + basis[0] * scale,
    value[1] + basis[1] * scale,
    value[2] + basis[2] * scale,
  ];
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
    "A.11A.28 must preserve the frozen 184-capability / 33-family Director taxonomy.",
  );
  assert(
    new Set(activeIds).size === DIRECTOR_CAPABILITIES.length - deferred.length &&
      activeIds.length === DIRECTOR_CAPABILITIES.length - deferred.length,
    `A.11A.28 active coverage must derive from the live deferred set. Got ${activeIds.length} active / ${deferred.length} deferred.`,
  );
  for (const id of deferred) {
    assert(!activeIds.includes(id), `Deferred capability leaked into active Qualification: ${id}.`);
    assert(frozenIds.includes(id), `Deferred capability disappeared from frozen taxonomy: ${id}.`);
  }

  const frozenLinear = frozenFamilies.find(
    (family) =>
      family.category === "camera_movement" &&
      family.group === "Linear camera travel",
  );
  assert(frozenLinear, "Frozen Linear camera travel family is missing.");
  assert(
    JSON.stringify(frozenLinear.capability_ids) ===
      JSON.stringify([
        "static",
        "push_in",
        "pull_out",
        "dolly",
        "truck_right",
        "pedestal_up",
        "crane",
        "settle",
      ]),
    `Frozen Linear camera travel membership changed: ${JSON.stringify(frozenLinear.capability_ids)}.`,
  );

  assert(
    DIRECTOR_LINEAR_CAMERA_TRAVEL_DEMO_POLICY_VERSION ===
      "director_linear_camera_travel_demo_phase1b7a11a28_v1",
    "A.11A.28 Dolly demo policy version mismatch.",
  );
  assert(
    JSON.stringify(DIRECTOR_DOLLY_DEMO_CAMERA_RELATIVE_DIRECTION) ===
      JSON.stringify([0.7, 0, 0.7]) &&
      DIRECTOR_DOLLY_DEMO_DISTANCE_M === 0.8,
    "A.11A.28 Dolly demo must retain the bounded diagonal camera-relative rail.",
  );

  const push = capability("push_in");
  const dolly = capability("dolly");
  const pushMoment = directorCapabilityDemoMoment(push);
  const dollyMoment = directorCapabilityDemoMoment(dolly);
  const pushStep = pushMoment.shot?.camera.movement_steps[0];
  const dollyStep = dollyMoment.shot?.camera.movement_steps[0];

  assert(pushStep?.movement === "push_in", "Push-in demo no longer authors push_in.");
  assert(
    dollyStep?.movement === "dolly" &&
      dollyStep.coordinate_space === "camera_relative" &&
      JSON.stringify(dollyStep.parameters.direction) ===
        JSON.stringify([...DIRECTOR_DOLLY_DEMO_CAMERA_RELATIVE_DIRECTION]) &&
      dollyStep.parameters.distance_m === DIRECTOR_DOLLY_DEMO_DISTANCE_M,
    "Dolly demo must author the bounded diagonal whole-rig translation cue.",
  );

  const pushProfile = directorQualificationCapabilityProfile(
    frozenLinear,
    "push_in",
  );
  const dollyProfile = directorQualificationCapabilityProfile(
    frozenLinear,
    "dolly",
  );
  const pushNote = pushProfile.qualification_note ?? "";
  const dollyNote = dollyProfile.qualification_note ?? "";
  assert(
    pushProfile.merge_compare_with_capability_id === null &&
      pushNote.includes("optical target fixed") &&
      pushNote.includes("whole-rig translation"),
    "Push-in Qualification guidance must describe the fixed-target distance-closing contract.",
  );
  assert(
    dollyProfile.merge_compare_with_capability_id === null &&
      dollyNote.includes("whole-rig translation") &&
      dollyNote.includes("camera-to-target distance stays effectively constant") &&
      dollyNote.includes("stationary subject drifts/parallaxes"),
    "Dolly Qualification guidance must preserve the generic whole-rig translation interpretation instead of marking a merge.",
  );

  const pushReport = buildDirectorCameraFidelityReport(push);
  const dollyReport = buildDirectorCameraFidelityReport(dolly);
  assert(pushReport, "Push-in camera-fidelity report was not produced.");
  assert(dollyReport, "Dolly camera-fidelity report was not produced.");

  const pushCheck = pushReport.checks.find(
    (check) => check.id === "push_in_closes_distance",
  );
  const dollyCheck = dollyReport.checks.find(
    (check) => check.id === "dolly_translates_whole_rig",
  );
  assert(pushCheck?.passed, `Push-in fixed-target fidelity check failed: ${pushCheck?.measured ?? "missing"}.`);
  assert(dollyCheck?.passed, `Dolly whole-rig fidelity check failed: ${dollyCheck?.measured ?? "missing"}.`);
  assert(
    pushReport.motion_signature.target_travel_m < 0.06 &&
      pushReport.motion_signature.camera_target_distance_delta_m < -0.08,
    `Push-in signature must close distance against a fixed target. Signature=${JSON.stringify(pushReport.motion_signature)}.`,
  );
  assert(
    dollyReport.motion_signature.camera_travel_m > 0.35 &&
      dollyReport.motion_signature.target_travel_m > 0.35 &&
      Math.abs(dollyReport.motion_signature.camera_target_distance_delta_m) < 0.06 &&
      dollyReport.motion_signature.primary_actor_travel_m < 0.06,
    `Dolly signature must move camera + target together around a stationary actor. Signature=${JSON.stringify(dollyReport.motion_signature)}.`,
  );

  const dollyStart = dollyReport.samples[0]!;
  const dollyEnd = dollyReport.samples[dollyReport.samples.length - 1]!;
  const cameraDelta = subtract(dollyEnd.camera_position, dollyStart.camera_position);
  const targetDelta = subtract(dollyEnd.target_position, dollyStart.target_position);
  const deltaMismatch = length(subtract(cameraDelta, targetDelta));
  const openingForward = normalize(
    subtract(dollyStart.target_position, dollyStart.camera_position),
  );
  const forwardTravel = dot(cameraDelta, openingForward);
  const lateralVector = addScaled(cameraDelta, openingForward, -forwardTravel);
  const lateralTravel = length(lateralVector);

  assert(
    deltaMismatch < 0.07 &&
      Math.abs(forwardTravel) > 0.18 &&
      lateralTravel > 0.18,
    `Dolly must preserve the rig while visibly combining forward + lateral translation. deltaMismatch=${deltaMismatch.toFixed(3)} forward=${forwardTravel.toFixed(3)} lateral=${lateralTravel.toFixed(3)}.`,
  );

  const visualAudit = source(
    "sandbox/probe-lab/motion-camera-library/director-visual-audit.ts",
  );
  for (const marker of [
    "The stationary teaching subject should remain on the optical axis",
    "The whole camera rig should translate on the authored diagonal rail",
    "making Dolly visibly different from centered Push in and pure-lateral Truck",
  ]) {
    assert(
      visualAudit.includes(marker),
      `A.11A.28 visual-audit guidance marker missing: ${marker}`,
    );
  }

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  assert(
    runtime.includes('case "push_in": {') &&
      runtime.includes('case "dolly": {') &&
      runtime.includes("pose.target.addScaledVector(right, direction.x * amount * t)") &&
      runtime.includes("pose.target.addScaledVector(forward, direction.z * amount * t)"),
    "Production runtime must retain the existing distinct Push-in and Dolly branches; A.11A.28 is not a camera-solver rewrite.",
  );

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    "QUALIFICATION_SINGLE_FLIGHT_PRELOAD_TIMEOUT_MS = 25_000",
    "const activePreloadAsset = pendingScheduledAssets[0] ?? null",
    'frameloop="demand"',
  ]) {
    assert(room.includes(marker), `A.11A.27 preparation regression: ${marker}`);
  }

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  for (const marker of [
    "Phase 1B.7A.11A.28 — Linear camera travel Dolly disambiguation",
    "QR-20260829-124529",
    "No production `director-shot-runtime.tsx` behavior is changed.",
    "bounded `0.8 m` camera-relative diagonal direction `[0.7, 0, 0.7]`",
    "Render a fresh **Linear camera travel** gauntlet",
  ]) {
    assert(readme.includes(marker), `A.11A.28 README marker missing: ${marker}`);
  }

  console.log("Director Linear camera travel Phase 1B.7A.11A.28 verification passed.");
  console.log(
    "Dolly now proves bounded diagonal whole-rig translation while Push in remains fixed-target distance closing; production runtime and live deferred coverage are preserved.",
  );
}

main();
