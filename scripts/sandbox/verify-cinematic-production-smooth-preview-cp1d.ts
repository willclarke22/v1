import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
for (const marker of [
  "Burger Cinematic Preview",
  "showWorkbenchDetails",
  "onPlaybackTime={handleRuntimeTime}",
  "seekRequest={seekRequest}",
  "wide preview",
]) {
  assert(lab.includes(marker), `CP.1D lab is missing marker: ${marker}`);
}
assert(
  !lab.includes("playbackTimeRef"),
  "CP.1D must not restore the page-level mutable playback clock.",
);
assert(
  !lab.includes("window.requestAnimationFrame"),
  "CP.1D page shell must not rerender itself from a requestAnimationFrame loop.",
);
assert(
  lab.includes("return asset.thumbnail_path || null;"),
  "CP.1D thumbnail UI must not try to decode GLB public paths as <img> sources.",
);

const runtime = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
for (const marker of [
  'frameloop="demand"',
  "dpr={1}",
  "shadows={false}",
  'powerPreference: "low-power"',
  "IntersectionObserver",
  'document.visibilityState === "visible"',
  "playAnchorWallMsRef",
  "sampleCinematicBurgerRuntime",
  "AnimatedCameraAndActors",
  "requestAnimationFrame",
  'minHeight: 560',
]) {
  assert(runtime.includes(marker), `CP.1D runtime is missing performance marker: ${marker}`);
}

assert(
  !runtime.includes('aspectRatio: "9 / 16"') &&
    runtime.includes('width: "100%"') &&
    runtime.includes('minHeight: 560'),
  "CP.1D.1 must restore the earlier wide rectangular preview without changing the performance runtime.",
);

const canvasCount = (runtime.match(/<Canvas\b/g) ?? []).length;
assert(
  canvasCount === 1,
  `CP.1D must keep exactly one WebGL Canvas; found ${canvasCount}.`,
);
assert(
  !runtime.includes("shadow-mapSize-width") &&
    !runtime.includes("shadow-mapSize-height"),
  "CP.1D must not restore the expensive 1024px live shadow map.",
);
assert(
  !runtime.includes("setPlaybackTimeS"),
  "CP.1D WebGL runtime should report throttled time outward rather than own React page state.",
);

const cp1cVerifier = source(
  "scripts/sandbox/verify-cinematic-production-continuous-player-cp1c.ts",
);
assert(
  cp1cVerifier.includes("runtimeDrivenClock") &&
    cp1cVerifier.includes("playAnchorWallMsRef"),
  "CP.1D must make the CP.1C historical verifier compatible with the runtime-owned clock.",
);

const readme = source(
  "sandbox/probe-lab/cinematic-production/README.md",
).toLowerCase();
for (const phrase of [
  "smooth performance preview",
  'frameloop="demand"',
  "low-power webgl preference",
  "wall-time anchored",
  "wide rectangular desktop pane",
  "hard reframes / cuts between beats",
]) {
  assert(readme.includes(phrase), `CP.1D README is missing phrase: ${phrase}`);
}

console.log("Cinematic Production CP.1D smooth-preview verification passed.");
console.log("The burger player uses a runtime-owned wall clock, demand rendering, DPR 1, no dynamic shadows, visibility gating, the restored wide rectangular preview, and throttled React UI updates.");
