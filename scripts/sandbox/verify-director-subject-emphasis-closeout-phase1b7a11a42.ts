import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const families = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-families.ts",
  );
  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  const runtime = source(
    "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
  );
  const coverage = source(
    "sandbox/probe-lab/scenes/director-runtime-coverage.ts",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const a41 = source(
    "scripts/sandbox/verify-director-subject-emphasis-selective-lighting-phase1b7a11a41.ts",
  );
  const a40 = source(
    "scripts/sandbox/verify-director-lighting-style-family-closeout-phase1b7a11a40.ts",
  );
  const a39 = source(
    "scripts/sandbox/verify-director-lighting-style-closeout-phase1b7a11a39.ts",
  );
  const a31 = source(
    "scripts/sandbox/verify-director-tracking-mounted-merge-closeout-phase1b7a11a31.ts",
  );

  for (const marker of [
    "DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_CAPABILITY_IDS",
    '"dim_environment"',
    "DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_TARGET_BY_ID",
    'dim_environment: "spotlight_subject"',
    "isDirectorQualificationCapabilityMergeCandidate",
    "!isDirectorQualificationCapabilityMergeCandidate(capabilityId)",
    "merge-candidate, and successfully merged legacy capabilities",
  ]) {
    assert(
      families.includes(marker),
      `A.11A.42 merge-candidate marker missing: ${marker}`,
    );
  }

  const mergeCandidateStart = families.indexOf(
    "export const DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_CAPABILITY_IDS = [",
  );
  assert(mergeCandidateStart >= 0, "A.11A.42 merge-candidate set is missing.");
  const mergeCandidateEnd = families.indexOf("] as const;", mergeCandidateStart);
  assert(
    mergeCandidateEnd > mergeCandidateStart,
    "A.11A.42 merge-candidate set is malformed.",
  );
  const mergeCandidateBlock = families.slice(
    mergeCandidateStart,
    mergeCandidateEnd,
  );
  assert(
    mergeCandidateBlock.includes('"dim_environment"'),
    "Dim environment must be non-active as an explicit merge candidate.",
  );

  const deferredStart = families.indexOf(
    "export const DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS = [",
  );
  const deferredEnd = families.indexOf("] as const;", deferredStart);
  const deferredBlock = families.slice(deferredStart, deferredEnd);
  assert(
    deferredBlock.includes('"emissive_subject"') &&
      !deferredBlock.includes('"dim_environment"'),
    "Emissive Subject remains deferred while Dim environment must be modeled as a merge candidate, not mislabeled as a deferral.",
  );

  for (const marker of [
    'familyCategory === "lighting_emphasis"',
    'familyGroup === "Subject emphasis"',
    'capabilityId === "dim_environment"',
    'merge_compare_with_capability_id: "spotlight_subject"',
    "composable environment-dim lighting modifier / compatibility intent",
    "Spotlight-subject qualification must prove a localized pool",
    "Tracking-spotlight qualification must show large primary-subject travel",
  ]) {
    assert(
      families.includes(marker),
      `A.11A.42 Subject-emphasis profile marker missing: ${marker}`,
    );
  }

  for (const marker of [
    "A.11A.42 gives active Spotlight / Tracking Spotlight enough receiver",
    'capability.id === "dim_environment" ? "two_shot" : "medium_wide"',
    'capability.category === "lighting_emphasis"',
    'capability.id === "track_spotlight"',
    'id: "demo_tracking_spotlight_subject_travel"',
    'behaviour: "move_to"',
    "start_ms: 450",
    "duration_ms: 5400",
    "start_position: [-3.4, 0, 0.85]",
    "target_position: [3.4, 0, -0.85]",
    "large left-to-right stage travel",
  ]) {
    assert(
      registry.includes(marker),
      `A.11A.42 registry proof marker missing: ${marker}`,
    );
  }

  // Successor-safe: A.11A.42 owns the semantic architecture and the large
  // Tracking travel proof, not one forever-frozen set of SpotLight photometrics.
  // Later successors may strengthen the shared subject-spotlight photometrics
  // as long as both active modes remain true actor-targeted SpotLights.
  for (const marker of [
    "type DirectorSubjectSpotlightMode =",
    'mode === "spotlight"',
    "const spotRef = useRef<THREE.SpotLight>(null);",
    "spot.target = targetObject;",
    "const strongSubjectIsolation = spotlight || trackSpotlight;",
    "strongSubjectIsolation",
    'mode="spotlight"',
    'mode="track"',
  ]) {
    assert(
      runtime.includes(marker),
      `A.11A.42 durable selective-lighting runtime marker missing: ${marker}`,
    );
  }

  assert(
    runtime.includes(
      'const trackSpotlight = intents.has("track_spotlight");',
    ) &&
      runtime.includes(
        'const spotlight = intents.has("spotlight_subject");',
      ),
    "Spotlight Subject and Tracking Spotlight must remain explicit runtime intents.",
  );

  // Successor-safe runtime coverage: preserve explicit real-light ownership and
  // the Dim-environment consolidation without freezing later descriptive prose.
  for (const marker of [
    'spotlight_subject: coverage("lighting_rig", "explicit",',
    'dim_environment: coverage("lighting_rig", "explicit",',
    "A.11A.42 removes standalone Qualification",
    'track_spotlight: coverage("lighting_rig", "explicit",',
  ]) {
    assert(
      coverage.includes(marker),
      `A.11A.42 runtime-coverage marker missing: ${marker}`,
    );
  }

  for (const marker of [
    'selectedFamily.group === "Subject emphasis"',
    "Dim environment is now a non-active merge",
    "composable environment-dim modifier / compatibility intent",
    "reel now proves Spotlight subject, Highlight subject, and Tracking spotlight",
  ]) {
    assert(
      room.includes(marker),
      `A.11A.42 Qualification Room closeout marker missing: ${marker}`,
    );
  }

  // Highlight Subject was already human-accepted before this phase. Protect the
  // renderer-owned Golden Lunch outline path and do not fold it into lighting.
  for (const marker of [
    'const goldenHighlight = capability.id === "highlight_subject"',
    "<AtomicGoldenControlledOutline",
    "goldenHighlight={goldenHighlight}",
  ]) {
    assert(
      preview.includes(marker),
      `A.11A.42 frozen Highlight Subject marker missing: ${marker}`,
    );
  }

  assert(
    a41.includes(
      "Director Subject emphasis Phase 1B.7A.11A.41 successor-safe verification passed.",
    ) &&
      a41.includes("later successors may consolidate Dim Environment") &&
      !a41.includes(
        "subject, Highlight subject, Dim environment, and Tracking spotlight.",
      ),
    "A.11A.41 verifier must be successor-safe under the A.11A.42 Dim-environment consolidation.",
  );
  assert(
    a40.includes(
      "Director Lighting style & motivation Phase 1B.7A.11A.40 verification passed.",
    ),
    "A.11A.40 lighting-style predecessor lineage verifier is missing.",
  );
  assert(
    a39.includes("directorQualificationExpectedActiveCapabilityCount(") &&
      a39.includes("centralized live policy") &&
      a39.includes('!a31.includes("DIRECTOR_CAPABILITIES.length -")') &&
      a31.includes("centralized live Qualification-active policy") &&
      !a31.includes("DIRECTOR_CAPABILITIES.length -"),
    "A.11A.39/A.11A.31 lineage must stay successor-safe for A.11A.42 merge-candidate exclusions without freezing old active-count arithmetic.",
  );

  console.log(
    "Director Subject emphasis Phase 1B.7A.11A.42 closeout verification passed.",
  );
  console.log(
    "Dim Environment remains a non-active merge candidate/modifier, Highlight Subject remains frozen, and the shared real-SpotLight architecture plus large Tracking travel proof stay available for later photometric refinement.",
  );
}

main();
