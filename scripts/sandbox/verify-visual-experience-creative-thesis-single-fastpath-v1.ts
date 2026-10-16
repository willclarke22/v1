import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const files = {
  story: "sandbox/probe-lab/visual-experience/ui/gsap-story-lab.tsx",
  contracts: "sandbox/probe-lab/visual-experience/creative-thesis/contracts.ts",
  prompts: "sandbox/probe-lab/visual-experience/creative-thesis/prompts.ts",
  runner: "sandbox/probe-lab/visual-experience/creative-thesis/run.server.ts",
  route: "sandbox/probe-lab/visual-experience/routes/creative-thesis.ts",
  api: "app/api/sandbox/probe-lab/visual-experience/creative-thesis/route.ts",
};

for (const relative of Object.values(files)) {
  assert(fs.existsSync(path.join(process.cwd(), relative)), `Missing single-thesis Creative Thesis file: ${relative}`);
}

const story = source(files.story);
const contracts = source(files.contracts);
const prompts = source(files.prompts);
const runner = source(files.runner);
const route = source(files.route);
const api = source(files.api);

for (const marker of [
  "CREATIVE VISUAL THESIS BENCH V1",
  "ONE MODEL CALL",
  "NO ASSETS DURING IDEATION",
  "NO DIRECTOR PALETTE DURING IDEATION",
  "FREEFORM ESCAPE HATCH",
  "Generate 1 visual thesis",
  "Generating one thesis…",
  "No second critic model call will run",
  "Copy selected execution brief",
  "KNOWN EXECUTION SKILLS · OPTIONAL AFTER SELECTION",
  "/api/sandbox/probe-lab/visual-experience/creative-thesis",
]) {
  assert(story.includes(marker), `Single-thesis Story Lab marker missing: ${marker}`);
}

for (const historicalMarker of [
  'sandbox="allow-scripts"',
  "No generated code runs in the MyWay parent document.",
  "GSAP_CDN_URL",
  "story.timeline",
  "Reset example",
]) {
  assert(story.includes(historicalMarker), `Existing GSAP Story Lab behavior was lost: ${historicalMarker}`);
}

for (const marker of [
  "myway_creative_visual_thesis_candidates_v1",
  "myway_creative_visual_thesis_selection_v1",
  "freeform_execution_needs",
  "structural_bridge",
  "do_not_use",
  "const count = 1;",
  "candidates must contain exactly 1 visual thesis in single-thesis fast-path mode.",
  "CreativeVisualThesisNormalizedRequest",
]) {
  assert(contracts.includes(marker), `Single-thesis contract marker missing: ${marker}`);
}

for (const marker of [
  "You are MyWay's Creative Visual Thesis Generator.",
  "Invent one strongest representation strategy from first principles",
  "Do not assume any asset inventory exists.",
  "Do not request or name Director capability ids.",
  "Create one strongest visual thesis for this learner.",
  "Return exactly one thesis in the candidates array.",
]) {
  assert(prompts.includes(marker), `Single-thesis prompt marker missing: ${marker}`);
}

assert(!prompts.includes("CREATIVE_THESIS_SELECTION_SYSTEM_PROMPT"), "Single-thesis prompt path must not retain an active critic prompt.");
assert(!prompts.includes("buildCreativeThesisSelectionMessages"), "Single-thesis prompt path must not build a second critic request.");
assert(
  !prompts.includes("director_authoring_manifest") &&
    !prompts.includes("capability_id") &&
    !prompts.includes("asset_collection_mode"),
  "Creative generation must remain upstream of asset and Director capability binding.",
);

for (const marker of [
  "callVisualOrchestrationCalibrationModel",
  "timeout_ms: 180_000",
  "temperature: 0.8",
  "buildCreativeThesisDivergenceMessages",
  "Single-thesis fast path",
  "provider_duration_ms: 0",
  "selection_duration_ms: 0",
  "buildVisualExperienceDirectorAuthoringManifest",
  "Only AFTER the thesis is selected",
  "capabilities_are_optional: true",
  "freeform_execution_allowed: true",
  "assets_were_not_exposed_during_ideation: true",
  "director_palette_was_not_exposed_during_ideation: true",
]) {
  assert(runner.includes(marker), `Single-thesis runner marker missing: ${marker}`);
}

const providerCalls = runner.match(/callVisualOrchestrationCalibrationModel\s*\(/g) ?? [];
assert(providerCalls.length === 1, `Expected exactly one model call in single-thesis mode; found ${providerCalls.length}.`);
assert(!runner.includes("buildCreativeThesisSelectionMessages"), "Runner must not make a critic model call in single-thesis mode.");
assert(!runner.includes("timeout_ms: 90_000"), "Old 90-second model timeout must not remain in the single-thesis runner.");

const selectedIndex = runner.indexOf("const selected = candidates[0]");
const capabilityIndex = runner.indexOf("buildVisualExperienceDirectorAuthoringManifest({");
assert(selectedIndex >= 0 && capabilityIndex > selectedIndex, "Director capability assist must occur only after the thesis exists.");

assert(route.includes("runCreativeVisualThesisBench"), "Creative thesis sandbox route is not wired to the runner.");
assert(api.includes('runtime = "nodejs"') && api.includes("maxDuration = 240"), "Creative thesis API route must retain a Node runtime envelope longer than the 180-second provider timeout.");

console.log("PASS: Creative Visual Thesis single-thesis fast path V1 verified.");
console.log("Exactly one unconstrained thesis is generated with one GLM call and a 180-second provider timeout; the second critic call is skipped, then optional capability assist occurs afterward with the freeform escape hatch intact.");
