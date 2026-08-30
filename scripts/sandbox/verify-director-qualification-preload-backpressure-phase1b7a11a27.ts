import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  directorQualificationExpectedActiveCapabilityCount,
  buildActiveDirectorQualificationFamilies,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const deferred = [...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS] as readonly string[];
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);

  assert(DIRECTOR_CAPABILITIES.length === 184, "A.11A.27 must not mutate the frozen 184-capability vocabulary.");
  assert(
    activeIds.length === directorQualificationExpectedActiveCapabilityCount(DIRECTOR_CAPABILITIES) &&
      new Set(activeIds).size === activeIds.length,
    `A.11A.27 successor coverage must equal the centralized live Qualification-active count. Got ${activeIds.length} active / ${deferred.length} deferred.`,
  );
  assert(
    deferred.includes("spline") ? !activeIds.includes("spline") : activeIds.includes("spline"),
    "A.11A.27 must mirror Spline's live deferred/active state while preserving the preload cleanup.",
  );

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    "QUALIFICATION_SINGLE_FLIGHT_PRELOAD_TIMEOUT_MS = 25_000",
    "const pendingScheduledAssets = useMemo(",
    "const activePreloadAsset = pendingScheduledAssets[0] ?? null",
    "Asset preload timed out after ${Math.round(",
    "const retryAssets = scheduledPreloadFailures.length",
    "active={evidenceCapturePhase === \"recording\"}",
    'frameloop="demand"',
    "dpr={1}",
    'powerPreference: "low-power"',
    "preserveDrawingBuffer: true",
  ]) {
    assert(room.includes(marker), `A.11A.27 Qualification Room marker missing: ${marker}`);
  }
  assert(
    !room.includes("? scheduledAssets.map((asset) => ("),
    "Qualification preparation must not fan out every scheduled GLTF concurrently.",
  );
  assert(
    room.includes("!preparationComplete && activePreloadAsset ? (") &&
      room.includes("asset={activePreloadAsset}"),
    "Qualification preparation must mount exactly the active single-flight asset.",
  );

  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  assert(
    registry.includes("DIRECTOR_SPLINE_DEMO_TARGET_RELATIVE_WAYPOINTS") &&
      registry.includes("target_relative_points"),
    "A.11A.27 must preserve the A.11A.26 authored Spline waypoint contract.",
  );
  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  assert(
    runtime.includes('case "spline": {') &&
      runtime.includes("targetRelativePoints") &&
      runtime.includes("new THREE.CatmullRomCurve3(points, false, \"catmullrom\", 0.4)"),
    "A.11A.27 must preserve the A.11A.26 Catmull-Rom runtime branch.",
  );


  console.log("Director Qualification Room preload backpressure Phase 1B.7A.11A.27 verification passed.");
  console.log(
    `Frozen/active taxonomy: 184/${activeIds.length}. Single-flight GLTF preparation + watchdog are present; A.11A.26 Spline semantics remain intact.`,
  );
}

main();
