import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const compareRoute = source("sandbox/probe-lab/cinematic-production/routes/compare-videos.ts");
const lab = source("sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx");
const generateRoute = source("sandbox/probe-lab/cinematic-production/routes/generate-reproduction.ts");
const apiRoute = source("app/api/sandbox/probe-lab/cinematic-production/video-compare/route.ts");

for (const marker of [
  'DEFAULT_OMNI_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"',
  'LEGACY_DIAGNOSTIC_MODEL = "nvidia/nemotron-nano-12b-v2-vl"',
  "REQUEST_TIMEOUT_MS = 300_000",
  "OMNI_MAX_TOKENS = 65_536",
  "OMNI_REASONING_BUDGET = 16_384",
  "reasoning_budget: OMNI_REASONING_BUDGET",
  "chat_template_kwargs: { enable_thinking: true }",
  "temperature: 0.6",
  "top_p: 0.95",
  "runOmniReferenceVideoSmoke",
  "runLegacyReferenceVideoSmoke",
  "analyzeOmniVideo",
  "fetchReferenceVideoAsDataUrl",
  'type: "video_url"',
  "data:video/mp4;base64",
  'comparison_mode: "two_video_descriptions_then_text_compare"',
]) {
  assert(compareRoute.includes(marker), `CP.2A.6D route marker missing: ${marker}`);
}

assert(!compareRoute.includes("VIDEO_SAMPLING_ATTEMPTS"), "CP.2A.6D must remove the 32/16/8 hosted sampling retry loop.");
assert(!compareRoute.includes("MYWAY_ASSET_VISION_MODEL?.trim()"), "Cinematic Omni provider must not inherit the Asset Library model setting.");
assert(compareRoute.includes("configuredModel === LEGACY_DIAGNOSTIC_MODEL") && compareRoute.includes("? DEFAULT_OMNI_MODEL"), "Cinematic Omni model override/default contract is missing.");
const videoPartIndex = compareRoute.indexOf('{ type: "video_url", video_url: { url: input.videoUrl } }');
const textPartIndex = compareRoute.indexOf('{ type: "text", text: singleVideoPrompt(input.label, input.durationS) }');
assert(videoPartIndex >= 0 && textPartIndex > videoPartIndex, "Omni video analysis should mirror NVIDIA's video-then-text content order.");
assert(lab.includes("Nemotron Omni is analyzing Golden and Generated separately with native video reasoning"), "CP.2A.6D UI status marker missing.");
assert(lab.includes("recorder.start();") && !lab.includes("recorder.start(1000);"), "Finalized MP4 capture contract regressed.");
assert(generateRoute.includes("controller.abort(), 300_000") && generateRoute.includes("300-second generation/repair attempt"), "GLM 300-second timeout must remain intact.");
assert(apiRoute.includes('export const runtime = "nodejs"') && apiRoute.includes("export const maxDuration = 300"), "Video comparison API route must retain Node runtime and 300-second envelope.");

console.log("Cinematic Production CP.2A.6D Omni video provider verification passed.");
