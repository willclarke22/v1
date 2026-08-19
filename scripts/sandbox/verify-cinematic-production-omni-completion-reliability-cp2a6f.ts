import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const projectRoot = process.cwd();

const comparePath = path.join(
  projectRoot,
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "routes",
  "compare-videos.ts",
);
const labPath = path.join(
  projectRoot,
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "ui",
  "cinematic-production-lab.tsx",
);
const generatePath = path.join(
  projectRoot,
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "routes",
  "generate-reproduction.ts",
);
const apiPath = path.join(
  projectRoot,
  "app",
  "api",
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "video-compare",
  "route.ts",
);

for (const requiredPath of [comparePath, labPath, generatePath, apiPath]) {
  assert(fs.existsSync(requiredPath), `Required CP.2A.6F path is missing: ${requiredPath}`);
}

const compareRoute = fs.readFileSync(comparePath, "utf8");
const lab = fs.readFileSync(labPath, "utf8");
const generateRoute = fs.readFileSync(generatePath, "utf8");
const apiRoute = fs.readFileSync(apiPath, "utf8");

for (const marker of [
  'type OmniCallMode = "smoke" | "perception" | "comparison"',
  "const OMNI_PERCEPTION_MAX_TOKENS = 8_192",
  "const OMNI_SMOKE_MAX_TOKENS = 1_024",
  "function omniResponseMetadata",
  "finish_reason",
  "prompt_tokens",
  "completion_tokens",
  "reasoning_tokens",
  "reasoning_chars",
  "content_chars",
  "function responseMetadataSummary",
  "6 to 10 meaningful beats",
  "target under 3500 characters",
  "function ultraCompactVideoPrompt",
  "4 to 8 beats maximum",
  "under 1800 characters",
  'mode: "perception"',
  'mode: "comparison"',
  "temperature: isComparison ? 0.6 : 0.2",
  "top_p: isComparison ? 0.95 : 0.9",
  "chat_template_kwargs: { enable_thinking: isComparison }",
  "body.reasoning_budget = OMNI_REASONING_BUDGET",
  'attempt: "compact"',
  'attempt: "ultra_compact"',
  "used_ultra_compact_retry",
  'compact_retry: "ultra_compact_on_parse_failure"',
  'parser: "balanced_schema_scored_json_objects"',
  "golden_observation: goldenAnalysis.observation_diagnostics",
  "generated_observation: generatedAnalysis.observation_diagnostics",
  "let goldenAnalysis: OmniVideoAnalysisResult",
  "let generatedAnalysis: OmniVideoAnalysisResult",
  "comparison_response: comparison.response_metadata",
]) {
  assert(compareRoute.includes(marker), `CP.2A.6F route marker missing: ${marker}`);
}

assert(
  compareRoute.includes('Array.isArray(item.beats) ? 10 : 0'),
  "CP.2A.6F parser must score compact beats-based video observations.",
);

assert(
  compareRoute.includes("if (isComparison) {") &&
    compareRoute.includes("body.reasoning_budget = OMNI_REASONING_BUDGET;"),
  "Reasoning budget must be reserved for the final comparison call.",
);

const reasoningAssignments = compareRoute.match(/body\.reasoning_budget\s*=/g) ?? [];
assert(
  reasoningAssignments.length === 1,
  `Expected exactly one conditional reasoning-budget assignment, found ${reasoningAssignments.length}.`,
);

assert(
  lab.includes(
    "Both movies captured · Nemotron Omni is making compact non-thinking visual observations, then reasoning over their comparison…",
  ),
  "CP.2A.6F UI status marker is missing.",
);

assert(
  lab.includes("setVisionVideoDiagnostics(payload.video_diagnostics ?? null)"),
  "Vision diagnostics wiring must remain intact.",
);

assert(
  lab.includes("recorder.start();") && !lab.includes("recorder.start(1000);"),
  "Finalized MP4 capture contract regressed.",
);

assert(
  generateRoute.includes("controller.abort(), 300_000") &&
    generateRoute.includes("300-second generation/repair attempt"),
  "GLM 300-second timeout must remain intact.",
);

assert(
  apiRoute.includes('export const runtime = "nodejs"') &&
    apiRoute.includes("export const maxDuration = 300"),
  "Cinematic video comparison API must retain the Node runtime and 300-second envelope.",
);

console.log("Cinematic Production CP.2A.6F Omni completion reliability verification passed.");
