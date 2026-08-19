import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const generationRoute = source(
  "sandbox/probe-lab/cinematic-production/routes/generate-reproduction.ts",
);
const compareRoute = source(
  "sandbox/probe-lab/cinematic-production/routes/compare-videos.ts",
);
const generationApi = source(
  "app/api/sandbox/probe-lab/cinematic-production/generate/route.ts",
);
const compareApi = source(
  "app/api/sandbox/probe-lab/cinematic-production/video-compare/route.ts",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  generationRoute.includes("const timeout = setTimeout(() => controller.abort(), 300_000);"),
  "CP.2A.6C GLM request timeout must be 300 seconds.",
);
assert(
  generationRoute.includes("GLM Lunch generation timed out during a 300-second generation/repair attempt."),
  "CP.2A.6C GLM timeout error text must report 300 seconds.",
);
assert(
  !generationRoute.includes("controller.abort(), 135_000"),
  "CP.2A.6C must remove the old 135-second GLM request timeout.",
);

assert(
  compareRoute.includes("const REQUEST_TIMEOUT_MS = 300_000;"),
  "CP.2A.6C Nemotron request timeout must be 300 seconds.",
);
assert(
  !compareRoute.includes("const REQUEST_TIMEOUT_MS = 240_000;"),
  "CP.2A.6C must remove the old 240-second Nemotron timeout.",
);

for (const [label, api] of [
  ["GLM generation API", generationApi],
  ["Nemotron video comparison API", compareApi],
] as const) {
  assert(
    api.includes('export const runtime = "nodejs"') && api.includes("export const maxDuration = 300"),
    `${label} must retain the existing Node runtime and 300-second route envelope.`,
  );
}

assert(
  compareRoute.includes("VIDEO_SAMPLING_ATTEMPTS") && compareRoute.includes("NVIDIA_REFERENCE_VIDEO_URL"),
  "CP.2A.6C expects CP.2A.6B Nemotron video compatibility logic to remain intact.",
);

console.log("Cinematic Production CP.2A.6C model timeout verification passed.");
console.log("GLM and Nemotron now each receive up to 300 seconds per individual model request.");
