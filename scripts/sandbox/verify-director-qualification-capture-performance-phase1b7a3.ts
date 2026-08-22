import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);

for (const marker of [
  "type QualificationPhaseClock",
  "const QUALIFICATION_PREVIEW_FPS = 30",
  "const QUALIFICATION_PREVIEW_FRAME_MS = 1000 / QUALIFICATION_PREVIEW_FPS",
  "function elapsedPhaseClockMs",
  "function QualificationPlaybackPreview",
  "performance.now()",
  "window.setTimeout(present, QUALIFICATION_PREVIEW_FRAME_MS)",
  "window.setTimeout(() =>",
  "elapsed_before_start_ms: overshootMs",
  "const previewCapability = useMemo(",
  "const currentRoles = useMemo(",
  "preserveActorInstances",
]) {
  assert(
    room.includes(marker),
    `Qualification capture-performance marker missing: ${marker}`,
  );
}

for (const retired of [
  "const CLOCK_STEP_MS = 50",
  "setPhaseElapsedMs",
  "window.setInterval(",
  "window.requestAnimationFrame(pump)",
  "phaseElapsedMs / Math.max",
]) {
  assert(
    !room.includes(retired),
    `Qualification Room must retire additive page-clock marker: ${retired}`,
  );
}

assert(
  !room.includes("document.hasFocus()") &&
    !room.includes('window.addEventListener("blur"') &&
    !room.includes('window.addEventListener("focus"'),
  "Snipping Tool capture must not pause merely because browser focus changes.",
);

assert(
  room.includes('frameloop="demand"') &&
    room.includes("dpr={1}") &&
    room.includes("antialias: false") &&
    room.includes("shadows={false}") &&
    room.includes('powerPreference: "low-power"') &&
    (room.match(/<Canvas\b/g) ?? []).length === 1,
  "Qualification Room must preserve its single low-overhead demand-rendered Canvas.",
);

assert(
  /!preparationComplete\s*\?\s*scheduledAssets\.map/.test(room),
  "Hidden GLTF preload components must unmount after reel preparation completes.",
);

for (const marker of [
  "if (!goldenHighlight) return null;",
  "[gltf.scene, goldenHighlight]",
  'preserveActorInstances = false',
  'preserveActorInstances ? "stable" : capability.id',
]) {
  assert(
    preview.includes(marker),
    `Director preview capture-performance marker missing: ${marker}`,
  );
}

assert(
  preview.includes(
    "{goldenHighlight && outlineScene ? <primitive object={outlineScene} scale={1.028} /> : null}",
  ),
  "Golden outline rendering must tolerate the lazy null outline scene.",
);

for (const marker of [
  "Phase 1B.7A.3 — capture-safe Qualification Room playback",
  "wall-time anchored playback clock",
  "QualificationPlaybackPreview",
  "30 FPS",
  "preserve mounted actor instances",
  "Golden silhouette clone/material pass is now lazy",
]) {
  assert(
    readme.includes(marker),
    `Qualification README is missing capture-performance marker: ${marker}`,
  );
}

console.log(
  "Director Qualification Room Phase 1B.7A.3 capture-performance verification passed.",
);
console.log(
  "Reel timing is wall-time anchored, high-frequency playback is Canvas-local at 30 FPS, sibling GLB instances are preserved, and hidden preload/outline work is removed from ordinary auditions.",
);
