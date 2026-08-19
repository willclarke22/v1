import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const projectRoot = process.cwd();
const compareRoutePath = path.join(
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
const apiRoutePath = path.join(
  projectRoot,
  "app",
  "api",
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "video-compare",
  "route.ts",
);
const generateRoutePath = path.join(
  projectRoot,
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "routes",
  "generate-reproduction.ts",
);

for (const requiredPath of [compareRoutePath, labPath, apiRoutePath, generateRoutePath]) {
  assert(fs.existsSync(requiredPath), `Required CP.2A.6G path is missing: ${requiredPath}`);
}

const compareRoute = fs.readFileSync(compareRoutePath, "utf8");
const lab = fs.readFileSync(labPath, "utf8");
const apiRoute = fs.readFileSync(apiRoutePath, "utf8");
const generateRoute = fs.readFileSync(generateRoutePath, "utf8");

for (const marker of [
  'observation_mode: "two_independent_video_descriptions"',
  "golden_description: goldenAnalysis.raw",
  "generated_description: generatedAnalysis.raw",
  'mode: "perception"',
  "chat_template_kwargs: { enable_thinking: isComparison }",
  "temperature: isComparison ? 0.6 : 0.2",
  "used_ultra_compact_retry",
  'compact_retry: "ultra_compact_on_parse_failure"',
  'parser: "balanced_schema_scored_json_objects"',
  "golden_observation: goldenAnalysis.observation_diagnostics",
  "generated_observation: generatedAnalysis.observation_diagnostics",
]) {
  assert(compareRoute.includes(marker), `CP.2A.6G route marker missing: ${marker}`);
}

assert(
  !compareRoute.includes("let comparison: OmniCallResult;"),
  "CP.2A.6G observation viewer must stop after Golden and Generated perception rather than running the final comparison call.",
);
assert(
  !compareRoute.includes("raw_content: comparison.raw"),
  "CP.2A.6G must not return the old comparison raw content.",
);
assert(
  compareRoute.includes('const REQUEST_TIMEOUT_MS = 300_000'),
  "Nemotron 300-second request timeout regressed.",
);

for (const marker of [
  'golden_description?: string;',
  'generated_description?: string;',
  'const [visionGoldenDescription, setVisionGoldenDescription] = useState<string>("");',
  'const [visionGeneratedDescription, setVisionGeneratedDescription] = useState<string>("");',
  "Golden Lunch",
  "Generated Lunch",
  "Omni description",
  "What does Omni actually see?",
  "Re-run Omni descriptions",
  "visionDescriptionGridStyle",
  "visionDescriptionTextStyle",
]) {
  assert(lab.includes(marker), `CP.2A.6G UI marker missing: ${marker}`);
}

for (const stale of [
  "visionComparison",
  "visionComparisonMode",
  "visionDirectCompareError",
  "visionRawContent",
  "Vision evidence / route details",
  "Highest-priority fix",
  "Similarity</span>",
]) {
  assert(!lab.includes(stale), `CP.2A.6G simplified Omni UI still contains stale comparison surface: ${stale}`);
}

assert(
  lab.includes("recorder.start();") && !lab.includes("recorder.start(1000);"),
  "Finalized MP4 capture contract regressed.",
);
assert(
  apiRoute.includes('export const runtime = "nodejs"') &&
    apiRoute.includes("export const maxDuration = 300"),
  "Video description API route must retain Node runtime and 300-second envelope.",
);
assert(
  generateRoute.includes("controller.abort(), 300_000") &&
    generateRoute.includes("300-second generation/repair attempt"),
  "GLM 300-second timeout must remain intact.",
);

console.log("Cinematic Production CP.2A.6G Omni observation viewer verification passed.");
