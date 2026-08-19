import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const comparePath = path.join(
  root,
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "routes",
  "compare-videos.ts",
);
const generatePath = path.join(
  root,
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "routes",
  "generate-reproduction.ts",
);
const labPath = path.join(
  root,
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "ui",
  "cinematic-production-lab.tsx",
);
const apiPath = path.join(
  root,
  "app",
  "api",
  "sandbox",
  "probe-lab",
  "cinematic-production",
  "video-compare",
  "route.ts",
);

const compareRoute = fs.readFileSync(comparePath, "utf8");
const generateRoute = fs.readFileSync(generatePath, "utf8");
const lab = fs.readFileSync(labPath, "utf8");
const apiRoute = fs.readFileSync(apiPath, "utf8");

for (const marker of [
  'const DEFAULT_OMNI_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"',
  'const REQUEST_TIMEOUT_MS = 300_000',
  'type OmniJsonKind = "smoke" | "video_analysis" | "comparison"',
  "class OmniOutputParseError extends Error",
  "function balancedJsonObjectCandidates",
  "function omniCandidateScore",
  "function extractExpectedJsonObject",
  'expectedJson: "smoke"',
  'expectedJson: "video_analysis"',
  'expectedJson: "comparison"',
  'parser: "balanced_schema_scored_json_objects"',
  "referenceSmoke.parse_diagnostics",
  "goldenAnalysis.parse_diagnostics",
  "generatedAnalysis.parse_diagnostics",
  "comparison.parse_diagnostics",
  "returned final assistant content",
  "does not by itself implicate the captured Lunch MP4",
]) {
  assert(compareRoute.includes(marker), `CP.2A.6E route marker missing: ${marker}`);
}

assert(
  !compareRoute.includes('const last = trimmed.lastIndexOf("}")'),
  "CP.2A.6E must remove the naive first-brace/last-brace cinematic JSON extractor.",
);
assert(
  compareRoute.includes("chat_template_kwargs: { enable_thinking: true }") &&
    compareRoute.includes("reasoning_budget: OMNI_REASONING_BUDGET"),
  "CP.2A.6E must preserve the CP.2A.6D Omni reasoning request contract.",
);
assert(
  compareRoute.includes('right.score - left.score ||') &&
    compareRoute.includes('right.keys.length - left.keys.length ||') &&
    compareRoute.includes('right.length - left.length'),
  "CP.2A.6E parser must rank candidates by schema score, key count, then object length.",
);

const scannerStart = compareRoute.indexOf("function balancedJsonObjectCandidates");
const scannerEnd = compareRoute.indexOf("function recordKeys", scannerStart);
assert(scannerStart >= 0 && scannerEnd > scannerStart, "CP.2A.6E scanner source range is missing.");
const scannerSource = compareRoute.slice(scannerStart, scannerEnd);
assert(
  scannerSource.includes('character === "\\\\"') &&
    scannerSource.includes("character === '\"'") &&
    scannerSource.includes('character === "{"') &&
    scannerSource.includes('character === "}"'),
  "CP.2A.6E balanced scanner must retain string, escape, and brace handling.",
);

assert(
  lab.includes("visionVideoDiagnostics") &&
    lab.includes("video_diagnostics: visionVideoDiagnostics"),
  "CP.2A.6E UI must surface video/parser diagnostics.",
);
assert(
  lab.includes("recorder.start();") && !lab.includes("recorder.start(1000);"),
  "CP.2A.6E must preserve finalized MP4 capture.",
);
assert(
  generateRoute.includes("controller.abort(), 300_000") &&
    generateRoute.includes("300-second generation/repair attempt"),
  "CP.2A.6E must preserve the GLM 300-second timeout.",
);
assert(
  apiRoute.includes('export const runtime = "nodejs"') &&
    apiRoute.includes("export const maxDuration = 300"),
  "CP.2A.6E must preserve the video-compare Node runtime and 300-second envelope.",
);

console.log("Cinematic Production CP.2A.6E robust Omni JSON parsing verification passed.");
