import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function source(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

const provider = source("sandbox/probe-lab/visual-experience/model-provider.server.ts");
const resolver = source("sandbox/probe-lab/visual-experience/resolve-visual-learning-turn-assets.server.ts");
const lab = source("sandbox/probe-lab/visual-experience/ui/visual-experience-lab.tsx");
const orchestrationUi = source("sandbox/probe-lab/visual-experience/ui/orchestration-lab.tsx");
const contracts = source("sandbox/probe-lab/visual-experience/orchestration/contracts.ts");
const prompts = source("sandbox/probe-lab/visual-experience/orchestration/prompts.ts");
const runner = source("sandbox/probe-lab/visual-experience/orchestration/run-stage.server.ts");
const route = source("sandbox/probe-lab/visual-experience/routes/orchestration-stage.ts");
const apiRoute = source("app/api/sandbox/probe-lab/visual-experience/orchestration-stage/route.ts");
const readme = source("sandbox/probe-lab/visual-experience/README.md");

for (const marker of [
  "callVisualOrchestrationCalibrationModel",
  "retry_transient_errors: false",
  "max_attempts: 1",
  "timeout_ms: args.timeout_ms ?? 90_000",
  '"z-ai/glm-5.3-flash"',
]) assert(provider.includes(marker), `Shared calibration provider marker missing: ${marker}`);

for (const marker of [
  "resolveSandboxBodyParts3dSemanticConcepts",
  "exact_unique",
  "exact_multiple",
  "phrase_unique",
  "phrase_multiple",
  "assetMatchesSemanticPhrase",
  "runtime_collection_space",
  "runtime_transform",
]) assert(resolver.includes(marker), `BodyParts semantic resolver marker missing: ${marker}`);

assert(lab.includes("Full Turn") && lab.includes("Orchestration Lab"), "Visual Experience sibling tabs are missing.");
assert(lab.includes('params.get("tab") === "orchestration"'), "Orchestration deep-link query param is missing.");
assert(lab.includes("<OrchestrationLab />"), "Orchestration Lab is not mounted from the existing Visual Experience workbench.");

for (const marker of [
  "Root problem",
  "Anatomy requirements",
  "Target takeaway + relationships",
  "Later ladder stages",
  "Exact model request",
  "MyWay deterministic result",
]) assert(orchestrationUi.includes(marker), `Orchestration UI marker missing: ${marker}`);

assert(
  orchestrationUi.includes('const summaryMetrics: Array<{ label: string; value: string }>') &&
    orchestrationUi.includes('value: String(metrics?.prompt_chars ?? "—")') &&
    orchestrationUi.includes('summaryMetrics.map((metric) =>'),
  "Orchestration metric cards must convert unknown API metric values to typed display strings before rendering.",
);
assert(
  !orchestrationUi.includes('].map(([label, metric]) =>'),
  "The V1 heterogeneous tuple metric renderer must not return; it inferred label as unknown under React 19 types.",
);

assert(contracts.includes("VISUAL_ORCHESTRATION_STAGES = [1, 2, 3]"), "Only Stages 1-3 should be active in the first calibration patch.");
assert(contracts.includes("schema_version must be") && contracts.includes("must reference required_visual_concepts"), "Stage contracts must validate schema version and relationship references.");
assert(prompts.includes("Never output BodyParts3D ids"), "Prompt must preserve the semantic-name-only asset authority boundary.");
assert(!prompts.includes("director_authoring_manifest"), "Stages 1-3 must not expose the Director capability palette yet.");
assert(!prompts.includes("camera_notes") && !prompts.includes("director_plan"), "Stages 1-3 must remain pre-Director calibration contracts.");

for (const marker of [
  "buildVisualOrchestrationMessages",
  "callVisualOrchestrationCalibrationModel",
  "validateVisualOrchestrationOutput",
  "resolveSandboxBodyParts3dSemanticConcepts",
  'fallback_provider: "none"',
]) assert(runner.includes(marker), `Stage runner marker missing: ${marker}`);

assert(route.includes("runVisualOrchestrationStage"), "Sandbox orchestration route is not wired to the runner.");
assert(apiRoute.includes('runtime = "nodejs"') && apiRoute.includes("maxDuration = 120"), "App API route must use Node runtime with a bounded server envelope.");
assert(readme.includes("Orchestration Lab calibration ladder"), "Visual Experience README does not document the new calibration lane.");

// Historical Full Turn behavior must still be present rather than replaced.
for (const marker of [
  "runGenerateFullTurn",
  "Generation launch contract",
  "Generate full turn",
  "Build request only",
  "Resolve scaffold",
]) assert(lab.includes(marker), `Existing Full Turn behavior was lost: ${marker}`);

console.log("PASS: Visual Experience Orchestration Lab Stage 1-3 V2 verified.");
console.log("Full Turn remains intact; calibration stages isolate root problem, semantic anatomy resolution, and target-takeaway/relationship reasoning before Director orchestration is introduced.");
