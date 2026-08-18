import fs from "node:fs";
import path from "node:path";

import {
  buildLunchGoldenDerivedStarterPlan,
  compareReproductionPlanToGolden,
  parseCinematicReproductionJson,
  sampleCinematicReproductionPlan,
  CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
} from "../../sandbox/probe-lab/cinematic-production/cinematic-reproduction-plan";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const lab = source("sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx");
const runtime = source("sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx");
const planSource = source("sandbox/probe-lab/cinematic-production/cinematic-reproduction-plan.ts");
const route = source("sandbox/probe-lab/cinematic-production/routes/generate-reproduction.ts");
const apiRoute = source("app/api/sandbox/probe-lab/cinematic-production/generate/route.ts");
const readme = source("sandbox/probe-lab/cinematic-production/README.md");

for (const marker of [
  "Lunch Reproduction Bench",
  "Golden Lunch",
  "Generated Lunch",
  "Cinematic JSON workspace",
  "Generate with GLM",
  "Render JSON",
  "Original GLM response",
  "Resolved Plan",
  "Diff / diagnostics",
  'aria-label="Cinematic JSON"',
  "renderWorkingJson",
  "generateWithGlm",
]) {
  assert(lab.includes(marker), `CP.2A bench UI marker missing: ${marker}.`);
}

const renderFunction = lab.match(/function renderWorkingJson\(\)[\s\S]*?\n  }\n\n  function resetStarterJson/)?.[0] ?? "";
assert(
  renderFunction.includes("parseCinematicReproductionJson") &&
    renderFunction.includes("setRenderedPlan") &&
    !renderFunction.includes("fetch("),
  "CP.2A Render JSON must compile the local editor immediately without calling GLM.",
);

assert(
  lab.includes('/api/sandbox/probe-lab/cinematic-production/generate') &&
    lab.includes("setOriginalGlmJson") &&
    lab.includes("setWorkingJson(payload.json_text)"),
  "CP.2A GLM generation must preserve original evidence and populate the same editable JSON box.",
);

for (const marker of [
  "CinematicRuntimeSampler",
  "runtimeSampler = sampleCinematicBurgerRuntime",
  "const layout = runtimeSampler(timelineTimeS)",
  "generated-Lunch bridge",
  'frameloop="demand"',
  'powerPreference: "low-power"',
  "CameraAwareStudioRig",
  "protectCameraFraming",
]) {
  assert(runtime.includes(marker), `CP.2A shared runtime marker missing: ${marker}.`);
}
assert(
  (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.2A must keep one WebGL Canvas and switch samplers rather than mount parallel renderers.",
);

for (const marker of [
  '"myway_cinematic_reproduction_plan_v1"',
  "normalizeCinematicReproductionPlan",
  "validateCinematicReproductionPlan",
  "sampleCinematicReproductionPlan",
  "buildLunchGoldenDerivedStarterPlan",
  "compareReproductionPlanToGolden",
  "CinematicReproductionInteraction",
  "CinematicReproductionDirectionalClearance",
]) {
  assert(planSource.includes(marker), `CP.2A reproduction-plan marker missing: ${marker}.`);
}

const starter = buildLunchGoldenDerivedStarterPlan();
const parsed = parseCinematicReproductionJson(JSON.stringify(starter));
assert(
  parsed.validation.ok &&
    parsed.plan.schema_version === CINEMATIC_REPRODUCTION_SCHEMA_VERSION &&
    parsed.plan.duration_s === 26,
  "CP.2A starter JSON must round-trip as a valid 26-second reproduction plan.",
);
for (const timeS of [0, 3.35, 9, 15.5, 24, 26]) {
  const sample = sampleCinematicReproductionPlan(parsed.plan, timeS);
  assert(
    sample.camera.position.every(Number.isFinite) &&
      sample.camera.target.every(Number.isFinite) &&
      Number.isFinite(sample.camera.fov),
    `CP.2A generated sampler produced a non-finite camera at ${timeS}s.`,
  );
}
const comparison = compareReproductionPlanToGolden(parsed.plan);
assert(
  comparison.camera_position_mean_error_m < 1e-6 &&
    comparison.camera_target_mean_error_m < 1e-6 &&
    comparison.camera_fov_mean_error_deg < 1e-6,
  "CP.2A golden-derived starter should prove the JSON camera compiler can reproduce the frozen golden C2 camera exactly.",
);
assert(
  comparison.actor_position_mean_error_m < 0.12 &&
    comparison.actor_opacity_mean_error < 0.04,
  `CP.2A sparse starter should remain a close actor-track scaffold; got ${JSON.stringify(comparison)}.`,
);

for (const marker of [
  "NVIDIA_API_KEY",
  "NVIDIA_BASE_URL",
  "MYWAY_CINEMATIC_GLM_MODEL",
  "MYWAY_GLM_MODEL",
  '"z-ai/glm-5.2"',
  "/chat/completions",
  "assetDossier",
  "Semantic beat dossier",
  "Return exactly one JSON object",
  "max_tokens: 20_000",
]) {
  assert(route.includes(marker), `CP.2A GLM route marker missing: ${marker}.`);
}
assert(
  !route.includes("sampleCinematicBurgerRuntime") &&
    !route.includes("buildLunchGoldenDerivedStarterPlan") &&
    !route.includes("MASTER_CAMERA_KEYS"),
  "CP.2A GLM prompt must not secretly receive the frozen golden coordinate implementation.",
);
assert(
  apiRoute.includes('runtime = "nodejs"') &&
    apiRoute.includes("maxDuration = 300") &&
    apiRoute.includes("generate-reproduction"),
  "CP.2A API wrapper must expose the NVIDIA/GLM reproduction route with a long-running server allowance.",
);

assert(
  readme.includes("CP.2A — Lunch Reproduction Bench + Editable Cinematic JSON") &&
    readme.includes("One renderer, two samplers") &&
    readme.includes("Reproduction JSON is intentionally verbose") &&
    readme.includes("Frozen-oracle boundary"),
  "CP.2A README must document the reproduction-bench experiment and frozen-golden boundary.",
);

console.log("Cinematic Production CP.2A Lunch reproduction bench verification passed.");
console.log("Golden and generated plans share one renderer; pasted JSON renders locally; GLM fills the same editor while preserving untouched response evidence.");
