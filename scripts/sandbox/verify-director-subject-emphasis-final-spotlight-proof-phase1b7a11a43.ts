import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  const preview = source("sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx");
  const registry = source("sandbox/probe-lab/motion-camera-library/director-capability-registry.ts");
  const coverage = source("sandbox/probe-lab/scenes/director-runtime-coverage.ts");
  const room = source("sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx");
  const a42 = source("scripts/sandbox/verify-director-subject-emphasis-closeout-phase1b7a11a42.ts");
  const a41 = source("scripts/sandbox/verify-director-subject-emphasis-selective-lighting-phase1b7a11a41.ts");
  const a39 = source("scripts/sandbox/verify-director-lighting-style-closeout-phase1b7a11a39.ts");
  const a31 = source("scripts/sandbox/verify-director-tracking-mounted-merge-closeout-phase1b7a11a31.ts");

  for (const marker of [
    "DIRECTOR_SUBJECT_SPOTLIGHT_KEY_INTENSITY = 72",
    "DIRECTOR_TRACKING_SPOTLIGHT_KEY_INTENSITY = 64",
    "DIRECTOR_SUBJECT_SPOTLIGHT_FILL_INTENSITY = 18",
    "const fillSpotRef = useRef<THREE.SpotLight>(null);",
    "const cameraPlanarRef = useRef(new THREE.Vector3());",
    ".copy(camera.position)",
    ".sub(targetPoint);",
    "cameraPlanar.normalize();",
    'mode === "spotlight" ? 2.15 : 1.95',
    "fillSpot.target = targetObject;",
    "const activeSpotlightProof = mode !== \"dim_environment\";",
    "mode === \"dim_environment\" ? 0.56 : mode === \"track\" ? 0.36 : 0.38",
    "decay={mode === \"dim_environment\" ? 2 : 1.45}",
    "intensity={DIRECTOR_SUBJECT_SPOTLIGHT_FILL_INTENSITY}",
    "spot.target = targetObject;",
  ]) {
    assert(runtime.includes(marker), `A.11A.43 shared spotlight marker missing: ${marker}`);
  }

  const spotlightStart = runtime.indexOf("function DirectorSubjectSpotlight({");
  const spotlightEnd = runtime.indexOf("function DirectorMotivatedLight({", spotlightStart);
  assert(spotlightStart >= 0 && spotlightEnd > spotlightStart, "DirectorSubjectSpotlight block is missing.");
  const spotlightBlock = runtime.slice(spotlightStart, spotlightEnd);
  assert(
    !spotlightBlock.includes("<pointLight"),
    "A.11A.43 must keep Spotlight/Tracking proof on real SpotLights; a point light may not become the primary or fallback proof.",
  );

  for (const marker of [
    "const subjectSpotlightProof =",
    'capabilityId === "spotlight_subject" || capabilityId === "track_spotlight"',
    'color={subjectSpotlightProof ? "#273244" : "#07111f"}',
    "roughness={subjectSpotlightProof ? 0.98 : 0.94}",
    "neutral matte receiver lets the real subject SpotLight prove",
  ]) {
    assert(preview.includes(marker), `A.11A.43 receiver-proof marker missing: ${marker}`);
  }

  // Highlight Subject was already accepted before the spotlight campaign.
  for (const marker of [
    'const goldenHighlight = capability.id === "highlight_subject"',
    "<AtomicGoldenControlledOutline",
    "goldenHighlight={goldenHighlight}",
  ]) {
    assert(preview.includes(marker), `A.11A.43 frozen Highlight Subject marker missing: ${marker}`);
  }

  // Tracking motion was solved in A.11A.42; do not retune it while repairing light.
  for (const marker of [
    'id: "demo_tracking_spotlight_subject_travel"',
    'behaviour: "move_to"',
    "start_ms: 450",
    "duration_ms: 5400",
    "start_position: [-3.4, 0, 0.85]",
    "target_position: [3.4, 0, -0.85]",
    "large left-to-right stage travel",
  ]) {
    assert(registry.includes(marker), `A.11A.43 frozen Tracking-travel marker missing: ${marker}`);
  }

  for (const marker of [
    "camera-aware actor-targeted SpotLight key plus a narrow actor-targeted support SpotLight",
    "same camera-aware real SpotLight key/support pair",
  ]) {
    assert(coverage.includes(marker), `A.11A.43 runtime-coverage marker missing: ${marker}`);
  }

  for (const marker of [
    "A.11A.43 is the final shared-spotlight repair pass",
    "neutral matte receiver",
    "localized pool/falloff",
    "A.11A.42 large left-to-right hero travel frozen",
    "defer Spotlight subject and Tracking spotlight",
    "rather than entering another renderer-specific tuning loop",
  ]) {
    assert(room.includes(marker), `A.11A.43 Qualification Room stopping-rule marker missing: ${marker}`);
  }

  assert(
    a42.includes("Later successors may strengthen the shared subject-spotlight photometrics") &&
      a42.includes("durable selective-lighting runtime marker") &&
      !a42.includes("? 7.4 : 10.6") &&
      !a42.includes('decay={mode === "spotlight" ? 1.8 : 2}'),
    "A.11A.42 must be successor-safe for A.11A.43 photometric refinement.",
  );
  assert(
    a41.includes("Tracking Spotlight uses a true actor-tracked SpotLight") &&
      a39.includes("directorQualificationExpectedActiveCapabilityCount(") &&
      a31.includes("centralized live Qualification-active policy"),
    "A.11A.43 predecessor successor-safety lineage regressed.",
  );

  console.log("Director Subject emphasis Phase 1B.7A.11A.43 final spotlight-proof verification passed.");
  console.log("Spotlight Subject and Tracking Spotlight now share camera-aware real SpotLight key/fill photometrics and a neutral matte proof receiver; Highlight and Tracking travel remain frozen, with an explicit defer-if-still-weak stopping rule.");
}

main();
