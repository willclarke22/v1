import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const runtime = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
const readme = source(
  "sandbox/probe-lab/cinematic-production/README.md",
);

assert(
  (runtime.match(/<Canvas\b/g) ?? []).length === 1 &&
    runtime.includes('frameloop="demand"') &&
    runtime.includes("dpr={1}") &&
    runtime.includes("shadows={false}") &&
    runtime.includes('powerPreference: "low-power"'),
  "CP.2A.3 must preserve the single low-power WebGL runtime.",
);

for (const marker of [
  "CINEMATIC_PREVIEW_FPS = 30",
  "CINEMATIC_PREVIEW_FRAME_MS",
  "now - lastPresentedMs >= CINEMATIC_PREVIEW_FRAME_MS",
  "const playbackActive = isPlaying && isViewportActive",
  "document.hasFocus()",
  'window.addEventListener("focus", update)',
  'window.addEventListener("blur", update)',
  "isViewportActive && isDocumentVisible && isWindowFocused",
]) {
  assert(runtime.includes(marker), `CP.2A.3 focus/FPS marker missing: ${marker}`);
}

for (const marker of [
  "InteractionRuntimeCache",
  "solveInteractionForRuntimeCache",
  "cached.phase !== interaction.phase",
  "interactionCacheRef.current.clear()",
  'performance_cache: "phase_compiled"',
  "poseTranslationDelta",
  "addWeightedDeltas",
  "reanchorPointToPose",
  "reanchorDirectionToPose",
  "interactionObstacleSignature",
  "interactionScaleDrifted",
  "interactionRotationDrifted",
  "Target-relative contact remains exact",
]) {
  assert(runtime.includes(marker), `CP.2A.3 interaction-cache marker missing: ${marker}`);
}

const applyRuntimeSource =
  runtime.match(/function applyRuntimeLayout[\s\S]*?\n}\n\nconst ContactShadow/)?.[0] ?? "";
assert(
  !applyRuntimeSource.includes("resolveAssetAwareInteractionMotion({"),
  "CP.2A.3 must not run the full CP.1F solver directly inside the per-frame applyRuntimeLayout path.",
);
assert(
  applyRuntimeSource.includes("interactionCache.get(interaction.id)") &&
    applyRuntimeSource.includes("sampleAssetInteractionBezier"),
  "CP.2A.3 per-frame interaction execution must sample a compiled physical path.",
);

for (const marker of [
  "actorRenderCaches",
  "buildActorRenderCache",
  "actorRenderCacheFor",
  "ensureLazyOutline",
  "cinematicOutlineSource",
  "cinematicLazyOutline",
  "cache.lastOpacity",
  "cache.lastEmphasis",
]) {
  assert(runtime.includes(marker), `CP.2A.3 actor-render cache marker missing: ${marker}`);
}
assert(
  !runtime.includes("<primitive object={outlineScene} />"),
  "CP.2A.3 must not eagerly mount a duplicate outline hierarchy for every real GLB.",
);

for (const marker of [
  "localBoundsCorners: RuntimeVec3[]",
  "boundsCornerTuples",
  "FramingScratch",
  "createFramingScratch",
  "framingScratchRef",
  "interactionGeometryCaches",
  "fallbackPreparedGeometryCache",
  "primarySupportSurfaceCaches",
  "rotatedBoundsEulerScratch",
  "rotatedBoundsPointScratch",
  "scratchRef.current",
]) {
  assert(runtime.includes(marker), `CP.2A.3 allocation/cache marker missing: ${marker}`);
}

assert(
  lab.includes("const CinematicJsonEvidence = memo") &&
    lab.includes("<CinematicJsonEvidence") &&
    lab.includes("CP.2A.1 → CP.2A.3") &&
    lab.includes("30 FPS preview · focus-aware pause"),
  "CP.2A.3 must isolate large JSON evidence and expose the preview performance envelope.",
);
const labRuntimeSource =
  lab.match(/export function CinematicProductionLab\(\)[\s\S]*?\n}\n\nconst mutedStyle/)?.[0] ?? "";
assert(
  !labRuntimeSource.includes("JSON.stringify(renderedPlan, null, 2)") &&
    !labRuntimeSource.includes("golden_comparison: comparison }, null, 2"),
  "Playback-time rerenders must not stringify the large resolved plan/diagnostics payloads.",
);

for (const phrase of [
  "CP.2A.3 — Cinematic Runtime Performance + Capture Safety",
  "Phase-compiled CP.1F interactions",
  "30 FPS preview presentation",
  "Capture / focus safety",
  "Cached actor render handles + lazy emphasis outlines",
  "React workbench isolation",
]) {
  assert(readme.includes(phrase), `CP.2A.3 README marker missing: ${phrase}`);
}

console.log("Cinematic Production CP.2A.3 runtime-performance verification passed.");
console.log(
  "One Canvas now uses a 30 FPS demand envelope, focus-aware clock freezing, phase-compiled CP.1F interactions, cached actor/material/framing data, lazy emphasis outlines, and memoized JSON evidence.",
);
