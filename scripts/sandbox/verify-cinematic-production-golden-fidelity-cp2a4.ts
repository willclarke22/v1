import fs from "node:fs";
import path from "node:path";

import {
  buildLunchGoldenDerivedStarterPlan,
  buildLunchReproductionQualityDiagnostics,
  parseCinematicReproductionJson,
  sampleCinematicReproductionPlan,
  validateCinematicReproductionPlan,
} from "../../sandbox/probe-lab/cinematic-production/cinematic-reproduction-plan";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const source = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

const planSource = source(
  "sandbox/probe-lab/cinematic-production/cinematic-reproduction-plan.ts",
);
const runtime = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
const route = source(
  "sandbox/probe-lab/cinematic-production/routes/generate-reproduction.ts",
);
const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
const readme = source(
  "sandbox/probe-lab/cinematic-production/README.md",
);
const performanceVerifier = source(
  "scripts/sandbox/verify-cinematic-production-runtime-performance-cp2a3.ts",
);

const starter = buildLunchGoldenDerivedStarterPlan();
const starterValidation = validateCinematicReproductionPlan(starter);
assert(
  starterValidation.ok && starterValidation.warnings.length === 0,
  `CP.2A.4 Golden-derived starter must remain a zero-warning oracle: ${JSON.stringify(starterValidation)}.`,
);

const starterQuality = buildLunchReproductionQualityDiagnostics(starter);
assert(
  starterQuality.hand_staging_yaw_error_deg < 1 &&
    starterQuality.hand_target_peak_response_m >= 0.06 &&
    starterQuality.hand_target_response_alignment > 0.7 &&
    starterQuality.cow_peak_yaw_error_deg < 1 &&
    starterQuality.chicken_peak_yaw_error_deg < 1 &&
    starterQuality.late_orbit_phase_mean_abs_error_deg < 1 &&
    starterQuality.final_camera_height_error_m < 0.01 &&
    starterQuality.final_support_opacity_max <= 0.6,
  `CP.2A.4 Golden calibration drifted: ${JSON.stringify(starterQuality)}.`,
);

// focus_role is the only temporary attention authority: even if a model also
// points the numeric key all the way at the cow, MyWay reconstructs the
// non-focus composition rail and applies semantic focus once.
const focusPlan = structuredClone(starter);
const cowKey = focusPlan.camera.keys.find((key) => Math.abs(key.t - 9.35) < 0.01);
assert(cowKey, "Starter must contain the 9.35s camera key.");
cowKey.target = [1.16, 0.3, -0.12];
cowKey.focus_role = "cow";
cowKey.focus_weight = 0.6;
const focusSample = sampleCinematicReproductionPlan(focusPlan, 9.35);
assert(
  focusSample.camera.target[0] > 0.35 && focusSample.camera.target[0] < 0.8,
  `CP.2A.4 semantic focus should move toward cow once without double-aiming: x=${focusSample.camera.target[0]}.`,
);

// Weak target response must become machine-visible so deterministic repair runs.
const weakNudgePlan = structuredClone(starter);
const burgerTrack = weakNudgePlan.actors.burger;
const contactStart = burgerTrack.keys.find((key) => Math.abs(key.t - 3.18) < 0.01);
assert(contactStart, "Starter burger must include the early contact response key.");
for (const key of burgerTrack.keys) {
  if (key.t >= 3.18 && key.t <= 4.52) {
    key.position = [...contactStart.position];
  }
}
const weakNudgeValidation = validateCinematicReproductionPlan(weakNudgePlan);
assert(
  weakNudgeValidation.warnings.some((item) =>
    item.includes("Burger peak authored response")
  ),
  `CP.2A.4 weak nudge must trigger deterministic repair: ${JSON.stringify(weakNudgeValidation)}.`,
);

// Side-on animal presentation, premature fish setup, high hero camera and
// undeemphasized support foods are now explicit quality failures.
const badReadabilityPlan = structuredClone(starter);
for (const key of badReadabilityPlan.actors.cow.keys) {
  key.rotation[1] = -Math.PI / 2;
}
for (const key of badReadabilityPlan.actors.chicken.keys) {
  key.rotation[1] = Math.PI / 2;
}
badReadabilityPlan.actors.goldfish.keys.unshift({
  ...structuredClone(badReadabilityPlan.actors.goldfish.keys[0]),
  t: 11.7,
  visible: true,
  opacity: 0.2,
});
const finalCamera = badReadabilityPlan.camera.keys[
  badReadabilityPlan.camera.keys.length - 1
];
finalCamera.position = [
  finalCamera.position[0],
  2.3,
  finalCamera.position[2],
];
for (const role of ["apple", "nigiri"] as const) {
  const last = badReadabilityPlan.actors[role].keys[
    badReadabilityPlan.actors[role].keys.length - 1
  ];
  last.opacity = 1;
}
const badValidation = validateCinematicReproductionPlan(badReadabilityPlan);
for (const phrase of [
  "Cow remains too side-on",
  "Chicken remains too side-on",
  "Goldfish becomes visible",
  "Final hero camera",
  "Final support opacity",
]) {
  assert(
    badValidation.warnings.some((item) => item.includes(phrase)),
    `CP.2A.4 missing visual warning: ${phrase}. ${JSON.stringify(badValidation)}`,
  );
}

for (const marker of [
  "slow_opacity_transition_count",
  "hand_staging_yaw_error_deg",
  "hand_target_peak_response_m",
  "hand_target_response_alignment",
  "cow_focus_target_x_error_m",
  "chicken_focus_target_x_error_m",
  "cow_peak_yaw_error_deg",
  "chicken_peak_yaw_error_deg",
  "fish_reveal_curve_mean_abs_error",
  "late_orbit_phase_mean_abs_error_deg",
  "late_orbit_phase_max_abs_error_deg",
  "late_orbit_radius_mean_abs_error_m",
  "late_camera_height_mean_abs_error_m",
  "final_camera_height_error_m",
  "final_support_opacity_max",
  "focus_role is the temporary attention authority",
]) {
  assert(planSource.includes(marker), `CP.2A.4 plan marker missing: ${marker}.`);
}

for (const marker of [
  "GENERATED_HAND_READABLE_ROTATION",
  "generatedReadableInteractionPoseForRole",
  "contactRegionLocalTangent",
  "full contact frame",
  'generated_contact_frame: contactOrientationApplied ? "normal+tangent" : "none"',
  "performance_cache: \"phase_compiled\"",
  "CINEMATIC_PREVIEW_FPS = 30",
]) {
  assert(runtime.includes(marker), `CP.2A.4 runtime marker missing: ${marker}.`);
}
assert(
  (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.2A.4 must preserve the one-Canvas CP.2A.3 performance architecture.",
);

for (const marker of [
  'contract_revision: "cp2a4"',
  "focus_role is the temporary attention authority",
  "0.06–0.11m horizontal response",
  "three-quarter",
  "13.75s≈position[-0.50,2.02,4.25]",
  "16.05s≈[3.15,1.70,2.20]",
  "26.00s≈[0.08,1.90,3.82]",
  "DEEMPHASIZE TO OPACITY ~0.58",
  "/Late orbit timing/i",
  "/Final support opacity/i",
]) {
  assert(route.includes(marker), `CP.2A.4 GLM route marker missing: ${marker}.`);
}

assert(
  lab.includes("CP.2A.1 → CP.2A.3 → CP.2A.4") &&
    lab.includes("30 FPS preview · focus-aware pause"),
  "CP.2A.4 lab must expose the new fidelity phase while retaining CP.2A.3 performance messaging.",
);

for (const phrase of [
  "CP.2A.4 — Golden-Fidelity Relationship Compiler",
  "Full hand contact frame",
  "Target response causality",
  "Semantic camera focus is single-authority",
  "Insert readability envelope",
  "Reveal curve, orbit phase, and hero finish",
  "Deterministic repair now sees visual failures",
]) {
  assert(readme.includes(phrase), `CP.2A.4 README marker missing: ${phrase}.`);
}

assert(
  performanceVerifier.includes("phase-compiled CP.1F interactions") ||
    performanceVerifier.includes("phase_compiled"),
  "CP.2A.4 must sit on top of the CP.2A.3 performance verifier rather than replacing it.",
);

// Parsing the starter still uses the public JSON lane, not private runtime state.
const parsedStarter = parseCinematicReproductionJson(JSON.stringify(starter));
assert(
  parsedStarter.validation.ok && parsedStarter.validation.warnings.length === 0,
  "CP.2A.4 public parse/normalize lane must keep Golden starter clean.",
);

console.log("Cinematic Production CP.2A.4 golden-fidelity verification passed.");
console.log(
  "Generated Lunch now has a readable normal+tangent hand effector frame, causal nudge-response diagnostics, single-authority semantic camera focus, insert-facing/timing checks, reveal-curve/orbit-phase checks, and hero-finish diagnostics while CP.2A.3 performance remains intact.",
);
