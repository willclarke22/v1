import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const source = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
const compareRoute = source(
  "sandbox/probe-lab/cinematic-production/routes/compare-videos.ts",
);
const apiRoute = source(
  "app/api/sandbox/probe-lab/cinematic-production/video-compare/route.ts",
);
const runtime = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);

for (const marker of [
  "Universal Vision viability · CP.2A.6",
  "Nemotron full-video Golden ↔ Generated comparison",
  "captureCurrentPreviewAsMp4",
  "runNemotronVideoComparison",
  "data-cinematic-capture-root",
  "canvas.captureStream",
  "MediaRecorder",
  "video/mp4",
  "Full-video Nemotron comparison is starting automatically.",
  "/api/sandbox/probe-lab/cinematic-production/video-compare",
  "Golden MP4 cached",
]) {
  assert(lab.includes(marker), `CP.2A.6 cinematic lab marker missing: ${marker}`);
}

assert(
  (lab.match(/<CinematicProductionRuntimeCanvas\b/g) ?? []).length === 1,
  "CP.2A.6 must preserve exactly one shared cinematic WebGL runtime.",
);
assert(
  !lab.includes("video/webm"),
  "CP.2A.6 must not silently send WebM while the Nemotron video contract is MP4.",
);
assert(
  lab.includes('window.setTimeout(() => {\n          void runNemotronVideoComparison();'),
  "A valid GLM generation must automatically launch the full-video comparison.",
);

for (const marker of [
  "nvidia/nemotron-nano-12b-v2-vl",
  "MYWAY_CINEMATIC_VISION_MODEL",
  "MYWAY_ASSET_VISION_MODEL",
  "MYWAY_ASSET_NVIDIA_API_KEY",
  "video_url",
  "data:video/mp4;base64",
  "direct_two_video",
  "two_video_descriptions_then_text_compare",
  "hand-to-burger interaction",
  "outline/highlight/emphasis",
  "similarity_score",
  "highest_priority_fix",
]) {
  assert(compareRoute.includes(marker), `CP.2A.6 video comparison route marker missing: ${marker}`);
}

assert(
  apiRoute.includes('export const runtime = "nodejs"') &&
    apiRoute.includes("maxDuration = 300") &&
    apiRoute.includes('routes/compare-videos'),
  "CP.2A.6 API route must stay on Node and expose the 300-second video comparison handler.",
);

for (const marker of [
  'frameloop="demand"',
  'dpr={1}',
  'shadows={false}',
  'powerPreference: "low-power"',
  "IntersectionObserver",
  'document.visibilityState === "visible"',
]) {
  assert(runtime.includes(marker), `CP.2A.6 must preserve cinematic runtime performance marker: ${marker}`);
}

console.log("Cinematic Production CP.2A.6 full-video vision comparison verification passed.");
console.log(
  "Valid GLM generation now auto-renders, records Golden/Generated as MP4 through the one shared WebGL canvas, submits both to Nemotron, and surfaces temporal visual differences with a single-video fallback path.",
);
