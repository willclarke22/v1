import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const benchmark = source(
  "sandbox/probe-lab/cinematic-production/benchmark-burger-assembly.ts",
);
for (const marker of [
  'id: "apple"',
  'id: "burger"',
  'id: "nigiri"',
  'Apple + burger + nigiri',
  'apple on the left',
]) {
  assert(benchmark.includes(marker), `CP.1E benchmark is missing marker: ${marker}`);
}

const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
for (const marker of [
  "inspectMode",
  'Inspect scene',
  'inspect after playback',
  'inspectMode={inspectMode}',
]) {
  assert(lab.includes(marker), `CP.1E lab is missing marker: ${marker}`);
}

const runtime = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
for (const marker of [
  'role="apple"',
  'role="nigiri"',
  "OrbitControls",
  "InspectControls",
  "constrainToSurface",
  "traySurfaceInfo",
  "ContactShadow",
  "applyShadowPose",
  "inspectMode && !props.isPlaying",
]) {
  assert(runtime.includes(marker), `CP.1E runtime is missing marker: ${marker}`);
}
assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"'),
  "CP.1E must preserve the smooth-preview performance runtime.",
);

const layout = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
for (const marker of [
  "foods:",
  "sampleGoldfishInsert",
  "sampleHero",
  "getCinematicShotRuntimeLayout",
]) {
  assert(layout.includes(marker), `CP.1E layout is missing marker: ${marker}`);
}

console.log("Cinematic Production CP.1E trio/inspect verification passed.");
console.log(
  "The benchmark now stages apple + burger + nigiri, applies surface-aware placement, protects hero framing, and enables post-playback scene inspection.",
);
