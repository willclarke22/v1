import fs from "node:fs";
import path from "node:path";
import { normalizeCreativeVisualThesisRequest } from "../../sandbox/probe-lab/visual-experience/creative-thesis/contracts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const story = source("sandbox/probe-lab/visual-experience/ui/gsap-story-lab.tsx");
const contracts = source("sandbox/probe-lab/visual-experience/creative-thesis/contracts.ts");
const runner = source("sandbox/probe-lab/visual-experience/creative-thesis/run.server.ts");
const provider = source("sandbox/probe-lab/visual-experience/model-provider.server.ts");

for (const marker of [
  '<option value="deepseek-ai/deepseek-v4-pro">DeepSeek V4 Pro via NVIDIA</option>',
  'Reasoning {creativeBrief.model === "deepseek-ai/deepseek-v4-pro" ? "(GLM only)" : ""}',
  'disabled={creativeBrief.model === "deepseek-ai/deepseek-v4-pro"}',
  "Generate 1 visual thesis",
  "ONE MODEL CALL",
]) {
  assert(story.includes(marker), `Creative Thesis DeepSeek UI marker missing: ${marker}`);
}

for (const marker of [
  '| "deepseek-ai/deepseek-v4-pro";',
  'raw.model === "deepseek-ai/deepseek-v4-pro"',
  "const count = 1;",
]) {
  assert(contracts.includes(marker), `Creative Thesis DeepSeek contract marker missing: ${marker}`);
}

const normalized = normalizeCreativeVisualThesisRequest({
  learner_message: "test learner message",
  root_problem: "test root problem",
  target_learning_delta: "test delta",
  model: "deepseek-ai/deepseek-v4-pro",
});
assert(
  normalized.model === "deepseek-ai/deepseek-v4-pro",
  `DeepSeek model normalization drifted: ${normalized.model}`,
);
assert(normalized.candidate_count === 1, "DeepSeek option must preserve the one-thesis fast path.");

for (const marker of [
  '| "deepseek-ai/deepseek-v4-pro";',
  'if (value === "deepseek-ai/deepseek-v4-pro") return value;',
  'const isDeepSeek = model === "deepseek-ai/deepseek-v4-pro";',
  'getNvidiaProviderConfig(isDeepSeek ? "deepseek" : "glm", "reliable")',
  '? "NVIDIA/DeepSeek V4 Pro"',
  'reasoningEffort: isDeepSeek ? undefined : reasoningEffort',
  'useResponseFormat: configBase.useResponseFormat',
]) {
  assert(provider.includes(marker), `Shared calibration provider DeepSeek marker missing: ${marker}`);
}

for (const existingDeepSeekMarker of [
  'if (provider === "deepseek")',
  '"deepseek-ai/deepseek-v4-pro"',
  'providerLabel: "NVIDIA/DeepSeek"',
  'process.env.MYWAY_VISUAL_EXPERIENCE_DEEPSEEK_MODEL',
]) {
  assert(provider.includes(existingDeepSeekMarker), `Existing full-turn DeepSeek configuration was lost: ${existingDeepSeekMarker}`);
}

assert(runner.includes("timeout_ms: 180_000"), "Creative Thesis 180-second timeout was lost.");
const providerCalls = runner.match(/callVisualOrchestrationCalibrationModel\s*\(/g) ?? [];
assert(providerCalls.length === 1, `One-thesis fast path should still make one model call; found ${providerCalls.length}.`);
assert(runner.includes("Only AFTER the thesis is selected"), "Capabilities must remain downstream of thesis generation.");
assert(runner.includes("freeform_execution_allowed: true"), "Freeform execution escape hatch was lost.");

console.log("PASS: Creative Visual Thesis DeepSeek option V1 verified.");
console.log("2D Story Lab can select the existing NVIDIA DeepSeek V4 Pro model while preserving one-thesis generation, the 180-second timeout, GLM-specific reasoning controls, and downstream capability binding.");
