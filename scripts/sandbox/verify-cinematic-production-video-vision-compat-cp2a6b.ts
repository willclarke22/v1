import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const compareRoute = source(
  "sandbox/probe-lab/cinematic-production/routes/compare-videos.ts",
);
const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
const apiRoute = source(
  "app/api/sandbox/probe-lab/cinematic-production/video-compare/route.ts",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const marker of [
  "NVIDIA_REFERENCE_VIDEO_URL",
  "VIDEO_SAMPLING_ATTEMPTS",
  "numFrames: 32",
  "numFrames: 16",
  "numFrames: 8",
  "media_io_kwargs",
  "mm_processor_kwargs",
  "max_num_tiles",
  "analyzeVideoWithRetries",
  "runReferenceVideoSmoke",
  "two_video_descriptions_then_text_compare",
  "single finalized H.264/MP4 blob",
]) {
  assert(compareRoute.includes(marker), `CP.2A.6B route marker missing: ${marker}`);
}

assert(
  !compareRoute.includes('comparison_mode: "direct_two_video"'),
  "CP.2A.6B must not use direct two-video inference as its primary path.",
);

assert(
  lab.includes("recorder.start();"),
  "CP.2A.6B must record one finalized MP4 blob.",
);
assert(
  !lab.includes("recorder.start(1000);"),
  "CP.2A.6B must not concatenate one-second MP4 fragments.",
);
assert(
  lab.includes("Nemotron is analyzing Golden and Generated separately with controlled video sampling"),
  "CP.2A.6B UI status must describe the single-video-first comparison path.",
);

assert(
  apiRoute.includes('export const runtime = "nodejs"') &&
    apiRoute.includes("export const maxDuration = 300"),
  "Cinematic video comparison API must retain Node runtime and 300-second envelope.",
);

console.log("Cinematic Production CP.2A.6B video compatibility verification passed.");
console.log(
  "Capture now emits one finalized MP4; Nemotron analyzes Golden and Generated separately with 32→16→8 frame retries, one-tile preprocessing, and a known-good NVIDIA reference-video smoke diagnostic.",
);
