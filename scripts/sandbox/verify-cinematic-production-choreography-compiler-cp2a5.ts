import fs from "node:fs";
import path from "node:path";

import {
  buildLunchGoldenDerivedStarterPlan,
  buildLunchReproductionQualityDiagnostics,
  sampleCinematicReproductionPlan,
  validateCinematicReproductionPlan,
} from "../../sandbox/probe-lab/cinematic-production/cinematic-reproduction-plan";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function horizontal(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
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

const starter = buildLunchGoldenDerivedStarterPlan();
const starterValidation = validateCinematicReproductionPlan(starter);
assert(
  starterValidation.ok && starterValidation.warnings.length === 0,
  `CP.2A.5 must preserve the zero-warning Golden oracle: ${JSON.stringify(starterValidation)}.`,
);
const starterQuality = buildLunchReproductionQualityDiagnostics(starter);
assert(
  starterQuality.cow_authored_hold_drift_m < 0.03 &&
    starterQuality.chicken_authored_hold_drift_m < 0.03 &&
    starterQuality.fish_forward_yaw_error_deg < 2 &&
    starterQuality.cow_compiled_vertical_arc_m > 0.04 &&
    starterQuality.chicken_compiled_vertical_arc_m > 0.04 &&
    starterQuality.attention_target_peak_speed_mps < 1.5,
  `CP.2A.5 Golden choreography calibration drifted: ${JSON.stringify(starterQuality)}.`,
);

// Reproduce the specific CP.2A.4 authoring failures: the animal has already
// moved by its nominal departure-start key, and the fish is turned 180 degrees.
const bad = structuredClone(starter);
const cowSettled = bad.actors.cow.keys.reduce((best, key) =>
  Math.abs(key.t - 9.15) < Math.abs(best.t - 9.15) ? key : best,
);
bad.actors.cow.keys.push({
  ...structuredClone(cowSettled),
  t: 10.55,
  position: [cowSettled.position[0] + 0.5, cowSettled.position[1], cowSettled.position[2] + 0.12],
});
bad.actors.cow.keys.sort((a, b) => a.t - b.t);

const chickenSettled = bad.actors.chicken.keys.reduce((best, key) =>
  Math.abs(key.t - 11.55) < Math.abs(best.t - 11.55) ? key : best,
);
bad.actors.chicken.keys.push({
  ...structuredClone(chickenSettled),
  t: 13.05,
  position: [chickenSettled.position[0] - 0.5, chickenSettled.position[1], chickenSettled.position[2] + 0.12],
});
bad.actors.chicken.keys.sort((a, b) => a.t - b.t);
for (const key of bad.actors.goldfish.keys) key.rotation[1] = Math.PI;
for (const key of bad.actors.hand.keys) {
  if (key.t > 1.35 && key.t < 6.65) key.position = [0.5, 0.25, -0.2];
}

const cowFocus = bad.camera.keys.reduce((best, key) =>
  Math.abs(key.t - 9.35) < Math.abs(best.t - 9.35) ? key : best,
);
cowFocus.focus_role = "cow";
cowFocus.focus_weight = 0.6;
const chickenFocus = bad.camera.keys.reduce((best, key) =>
  Math.abs(key.t - 12.85) < Math.abs(best.t - 12.85) ? key : best,
);
chickenFocus.focus_role = "chicken";
chickenFocus.focus_weight = 0.6;

const badValidation = validateCinematicReproductionPlan(bad);
for (const phrase of [
  "Cow authored track moves",
  "Chicken authored track moves",
  "Goldfish semantic forward yaw",
]) {
  assert(
    badValidation.warnings.some((item) => item.includes(phrase)),
    `CP.2A.5 raw authoring warning missing: ${phrase}. ${JSON.stringify(badValidation)}`,
  );
}

const cowHoldA = sampleCinematicReproductionPlan(bad, 9.15).cow.position;
const cowHoldB = sampleCinematicReproductionPlan(bad, 10.55).cow.position;
assert(
  horizontal(cowHoldA, cowHoldB) < 0.02,
  `CP.2A.5 cow compiler must hold through departure start: ${JSON.stringify({ cowHoldA, cowHoldB })}.`,
);
const chickenHoldA = sampleCinematicReproductionPlan(bad, 11.55).chicken.position;
const chickenHoldB = sampleCinematicReproductionPlan(bad, 13.05).chicken.position;
assert(
  horizontal(chickenHoldA, chickenHoldB) < 0.02,
  `CP.2A.5 chicken compiler must hold through departure start: ${JSON.stringify({ chickenHoldA, chickenHoldB })}.`,
);
const fish = sampleCinematicReproductionPlan(bad, 15.25).goldfish;
assert(
  Math.abs(fish.rotation[1]) < 0.08,
  `CP.2A.5 semantic fish forward must override 180-degree raw yaw: ${fish.rotation[1]}.`,
);
const handA = sampleCinematicReproductionPlan(bad, 2.2).hand.position;
const handB = sampleCinematicReproductionPlan(bad, 4.2).hand.position;
assert(
  horizontal(handA, handB) < 0.001 && Math.abs(handA[1] - handB[1]) < 0.001,
  `CP.2A.5 hand actor track must remain staging evidence while CP.1F owns travel: ${JSON.stringify({ handA, handB })}.`,
);
const cowPeak = sampleCinematicReproductionPlan(bad, 9.35);
const chickenPeak = sampleCinematicReproductionPlan(bad, 12.3);
assert(
  cowPeak.cow.emphasis > 0.9 && chickenPeak.chicken.emphasis > 0.9,
  `CP.2A.5 semantic attention must drive actor emphasis: ${JSON.stringify({ cow: cowPeak.cow.emphasis, chicken: chickenPeak.chicken.emphasis })}.`,
);
const badQuality = buildLunchReproductionQualityDiagnostics(bad);
assert(
  badQuality.attention_target_peak_speed_mps < 1.5,
  `CP.2A.5 cow→chicken attention must remain continuous: ${badQuality.attention_target_peak_speed_mps}.`,
);

for (const marker of [
  "compileLunchActorChoreography",
  "arrive -> settle -> hold -> depart",
  "compileLunchGoldfishPose",
  "Semantic forward authority",
  "compileLunchHandStagingPose",
  "sampledCameraAttentionWeights",
  "compiledCameraAttentionStrength",
  "Temporary camera attention and outline emphasis are one semantic beat",
  "cow_authored_hold_drift_m",
  "chicken_authored_hold_drift_m",
  "fish_forward_yaw_error_deg",
  "attention_target_peak_speed_mps",
]) {
  assert(planSource.includes(marker), `CP.2A.5 plan marker missing: ${marker}.`);
}

for (const marker of [
  "semanticEffectorLocked",
  "WHOLE interaction",
  "lunch_hand_semantic_effector_v2",
  'performance_cache: "interaction_compiled"',
  'generated_contact_frame: cached.semanticEffectorLocked',
]) {
  assert(runtime.includes(marker), `CP.2A.5 runtime marker missing: ${marker}.`);
}
const needsCompile = runtime.match(/const needsCompile =[\s\S]*?;\n\n      \/\/ CP\.2A\.5 deliberately/)?.[0] ?? "";
assert(
  needsCompile && !needsCompile.includes("cached.phase"),
  "CP.2A.5 active interaction cache must not recompile merely because approach/contact/retreat phase changed.",
);

for (const marker of [
  'contract_revision: "cp2a5"',
  "normalizedPlanSignature",
  "repairQualityBurden",
  "repairChanged && candidateBurden < initialRepairBurden",
  "unchanged repairs are evidence only",
  "HOLD the settled pose through 10.55",
  "HOLD the settled pose through 13.05",
  "use rotation_deg near [0,0,0], NOT [0,180,0]",
  "DO NOT animate the hand root into the burger",
]) {
  assert(route.includes(marker), `CP.2A.5 route marker missing: ${marker}.`);
}

assert(
  lab.includes("CP.2A.1 → CP.2A.3 → CP.2A.4 → CP.2A.5") &&
    lab.includes("repair rejected (no measured improvement)"),
  "CP.2A.5 lab must expose choreography compiler lineage and repair-improvement status.",
);
for (const phrase of [
  "CP.2A.5 — Choreography Compiler Fidelity",
  "Whole-interaction semantic hand effector",
  "Actor arrival → settle → hold → depart grammar",
  "Continuous attention + emphasis envelope",
  "Semantic fish forward axis",
  "Repair improvement gate",
]) {
  assert(readme.includes(phrase), `CP.2A.5 README marker missing: ${phrase}.`);
}

console.log("Cinematic Production CP.2A.5 choreography-compiler fidelity verification passed.");
console.log(
  "Hand contact now uses one semantic-effector interaction solution, animal inserts compile arrival/hold/depart motion, camera attention crossfades continuously into matching emphasis, fish facing is semantic, and unchanged GLM repairs are rejected as evidence-only.",
);
