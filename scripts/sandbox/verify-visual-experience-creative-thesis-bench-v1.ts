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
  assert(fs.existsSync(path.join(process.cwd(), relative)), `Missing Creative Thesis Bench file: ${relative}`);
}

const story = source(files.story);
const contracts = source(files.contracts);
const prompts = source(files.prompts);
const runner = source(files.runner);
const route = source(files.route);
const api = source(files.api);

for (const marker of [
  "CREATIVE VISUAL THESIS BENCH V1",
  "NO ASSETS DURING IDEATION",
  "NO DIRECTOR PALETTE DURING IDEATION",
  "FREEFORM ESCAPE HATCH",
  "Generate ${creativeBrief.candidate_count ?? 4} visual theses",
  "Copy selected execution brief",
  "KNOWN EXECUTION SKILLS · OPTIONAL AFTER SELECTION",
  "/api/sandbox/probe-lab/visual-experience/creative-thesis",
]) {
  assert(story.includes(marker), `2D Story Lab creative-bench marker missing: ${marker}`);
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
  "validateCreativeVisualThesisCandidates",
  "validateCreativeVisualThesisSelection",
  "CreativeVisualThesisNormalizedRequest",
  "): CreativeVisualThesisNormalizedRequest",
]) {
  assert(contracts.includes(marker), `Creative thesis contract marker missing: ${marker}`);
}

for (const marker of [
  "You are MyWay's Creative Visual Thesis Generator.",
  "Do not assume any asset inventory exists.",
  "Do not request or name Director capability ids.",
  "Generate fundamentally different representation strategies",
  "You are MyWay's independent Visual Thesis Critic.",
  "Do not reward an idea merely because it would be easy to render.",
]) {
  assert(prompts.includes(marker), `Creative prompt marker missing: ${marker}`);
}

assert(
  !prompts.includes("director_authoring_manifest") &&
    !prompts.includes("capability_id") &&
    !prompts.includes("asset_collection_mode"),
  "Creative divergence/selection prompts must remain upstream of asset and Director capability binding.",
);

for (const marker of [
  "callVisualOrchestrationCalibrationModel",
  "temperature: 0.8",
  "temperature: 0.1",
  "buildCreativeThesisDivergenceMessages",
  "buildCreativeThesisSelectionMessages",
  "buildVisualExperienceDirectorAuthoringManifest",
  "Only AFTER the thesis is selected",
  "capabilities_are_optional: true",
  "freeform_execution_allowed: true",
  "assets_were_not_exposed_during_ideation: true",
  "director_palette_was_not_exposed_during_ideation: true",
]) {
  assert(runner.includes(marker), `Creative thesis runner marker missing: ${marker}`);
}

const selectionIndex = runner.indexOf("const selected = candidates.find");
const capabilityIndex = runner.indexOf("buildVisualExperienceDirectorAuthoringManifest({");
assert(selectionIndex >= 0 && capabilityIndex > selectionIndex, "Director capability assist must occur only after thesis selection.");

assert(route.includes("runCreativeVisualThesisBench"), "Creative thesis sandbox route is not wired to the runner.");
assert(api.includes('runtime = "nodejs"') && api.includes("maxDuration = 240"), "Creative thesis API route must use a bounded Node runtime envelope.");


console.log("PASS: Creative Visual Thesis Bench V1 verified.");
console.log("Divergence and critic remain unconstrained by assets/Director ids; optional capability assist occurs only after selection, with a preserved freeform escape hatch and the existing sandboxed GSAP runtime intact.");
