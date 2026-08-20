
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_PERCEPTUAL_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-perceptual-capabilities";
import {
  DIRECTOR_LEVEL1_VISUALIZATION_GUIDES,
  DIRECTOR_LEVEL1_VISUALIZATION_VERSION,
} from "../../sandbox/probe-lab/motion-camera-library/director-level1-visualization-guides";
import {
  directorPerceptualPreviewSlots,
  sampleDirectorPerceptualCapabilityRuntime,
} from "../../sandbox/probe-lab/motion-camera-library/director-perceptual-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string) {
  const value = DIRECTOR_PERCEPTUAL_CAPABILITIES.find((item) => item.id === id);
  assert(value, `Missing Level 1 capability ${id}.`);
  return value;
}

function pose(
  capabilityId: string,
  progress: number,
  slotId: string,
) {
  const sample = sampleDirectorPerceptualCapabilityRuntime(
    capability(capabilityId),
    progress,
  );
  const actor = sample.actor_poses.find((item) => item.slot_id === slotId);
  assert(actor, `${capabilityId} is missing visualization actor ${slotId}.`);
  return actor;
}

assert(
  DIRECTOR_LEVEL1_VISUALIZATION_VERSION ===
    "director_level1_visualizations_phase1b6_2_v1",
  "Unexpected Level 1 visualization version.",
);
assert(
  DIRECTOR_PERCEPTUAL_CAPABILITIES.length === 7,
  `Expected exactly 7 Level 1 capabilities, found ${DIRECTOR_PERCEPTUAL_CAPABILITIES.length}.`,
);
assert(
  DIRECTOR_LEVEL1_VISUALIZATION_GUIDES.length ===
    DIRECTOR_PERCEPTUAL_CAPABILITIES.length,
  "Every Level 1 capability must have one human-review visualization guide.",
);

for (const item of DIRECTOR_PERCEPTUAL_CAPABILITIES) {
  const guide = DIRECTOR_LEVEL1_VISUALIZATION_GUIDES.find(
    (candidate) => candidate.capability_id === item.id,
  );
  assert(guide, `${item.id} is missing a Level 1 visualization guide.`);
  assert(
    guide.watch_for.length >= 3,
    `${item.id} needs at least three concrete visual review observations.`,
  );
  assert(
    guide.production_boundary.toLowerCase().includes("production"),
    `${item.id} must state the normalized-proof vs production boundary.`,
  );

  const slots = directorPerceptualPreviewSlots(item);
  assert(slots.length >= 2, `${item.id} needs at least two visualization roles.`);

  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const sample = sampleDirectorPerceptualCapabilityRuntime(item, progress);
    assert(
      sample.capability_id === item.id,
      `${item.id} visualization sample changed capability identity.`,
    );
    assert(
      sample.actor_poses.length >= 2,
      `${item.id} visualization needs at least two actor poses.`,
    );
    assert(
      sample.camera.position.every(Number.isFinite) &&
        sample.camera.target.every(Number.isFinite) &&
        Number.isFinite(sample.camera.fov_degrees),
      `${item.id} visualization produced a non-finite camera sample.`,
    );
  }
}

// Golden-extraction behavior canaries. These are deliberately normalized
// visual-proof checks, not production world-coordinate contracts.
{
  const id = "agent_approach_contact_response_retreat";
  const startEffector = pose(id, 0, "effector");
  const contactEffector = pose(id, 0.46, "effector");
  const endEffector = pose(id, 1, "effector");
  const startTarget = pose(id, 0, "target");
  const endTarget = pose(id, 1, "target");
  assert(
    Math.abs(contactEffector.position[0] - startTarget.position[0]) <
      Math.abs(startEffector.position[0] - startTarget.position[0]),
    "Causal visualization must visibly approach the target before response.",
  );
  assert(
    endTarget.position[0] > startTarget.position[0] + 0.25,
    "Causal visualization must retain a readable target consequence.",
  );
  assert(
    endEffector.position[0] < contactEffector.position[0] - 1.5,
    "Causal visualization must retreat after the intervention.",
  );
}

{
  const id = "arrive_settle_present_depart";
  const start = pose(id, 0, "insert_actor");
  const presentation = pose(id, 0.55, "insert_actor");
  const end = pose(id, 1, "insert_actor");
  assert(
    start.position[0] > presentation.position[0] + 1.5,
    "Presentation visualization must arrive from outside the active composition.",
  );
  assert(
    end.position[0] > presentation.position[0] + 1.5,
    "Presentation visualization must depart from the settled pose.",
  );
}

{
  const id = "overlapping_attention_handoff";
  const sourceStart = pose(id, 0, "source_actor");
  const sourceEnd = pose(id, 1, "source_actor");
  const targetStart = pose(id, 0, "target_actor");
  const targetEnd = pose(id, 1, "target_actor");
  const cameraStart = sampleDirectorPerceptualCapabilityRuntime(capability(id), 0);
  const cameraEnd = sampleDirectorPerceptualCapabilityRuntime(capability(id), 1);
  assert(
    sourceStart.emphasis > sourceEnd.emphasis &&
      targetEnd.emphasis > targetStart.emphasis,
    "Attention handoff must transfer emphasis from source to target.",
  );
  assert(
    cameraEnd.camera.target[0] > cameraStart.camera.target[0] + 1,
    "Attention handoff must move camera target bias continuously toward the destination.",
  );
}

{
  const id = "occlusion_to_parallax_discovery";
  const hiddenStart = pose(id, 0, "hidden_subject");
  const hiddenEnd = pose(id, 1, "hidden_subject");
  const occluderStart = pose(id, 0, "occluder");
  const occluderEnd = pose(id, 1, "occluder");
  const cameraStart = sampleDirectorPerceptualCapabilityRuntime(capability(id), 0);
  const cameraEnd = sampleDirectorPerceptualCapabilityRuntime(capability(id), 1);
  assert(
    hiddenStart.position.join("|") === hiddenEnd.position.join("|") &&
      occluderStart.position.join("|") === occluderEnd.position.join("|"),
    "Parallax discovery must keep the spatial relationship world-stable.",
  );
  assert(
    Math.abs(cameraEnd.camera.position[0] - cameraStart.camera.position[0]) > 4,
    "Parallax discovery must be primarily camera-earned.",
  );
}

{
  const id = "context_to_hero_resolution";
  const heroStart = pose(id, 0, "hero");
  const heroEnd = pose(id, 1, "hero");
  const start = sampleDirectorPerceptualCapabilityRuntime(capability(id), 0);
  const end = sampleDirectorPerceptualCapabilityRuntime(capability(id), 1);
  assert(
    heroEnd.emphasis > heroStart.emphasis + 0.5,
    "Hero resolution must progressively increase hero emphasis.",
  );
  assert(
    end.camera.position[2] < start.camera.position[2] - 2 &&
      end.camera.position[1] < start.camera.position[1] - 0.8,
    "Hero resolution must visibly push/lower into the final composition.",
  );
}

{
  const id = "recap_sweep";
  const aPeak = pose(id, 0.22, "target_a");
  const bPeak = pose(id, 0.5, "target_b");
  const cPeak = pose(id, 0.8, "target_c");
  assert(
    aPeak.emphasis > 0.85 &&
      bPeak.emphasis > 0.85 &&
      cPeak.emphasis > 0.85,
    "Recap sweep must give each established target a distinct attention peak.",
  );
}

{
  const id = "action_consequence_reframe";
  const changedStart = pose(id, 0, "changed_target");
  const changedEnd = pose(id, 1, "changed_target");
  const contextStart = pose(id, 0, "causal_context");
  const contextEnd = pose(id, 1, "causal_context");
  assert(
    changedEnd.emphasis > changedStart.emphasis + 0.5 &&
      contextEnd.emphasis < contextStart.emphasis,
    "Consequence reframe must transfer compositional priority to the changed state.",
  );
}

const integration = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-level1-capability-visualization.tsx",
);
for (const marker of [
  "DirectorPerceptualCapabilityAuditViewer",
  "Level 1 real-asset visualization",
  "Real-asset role binding",
  "Search ${loadableAssets.length} Asset Library models",
  "directorLevel1VisualizationGuide",
  "/api/sandbox/probe-lab/assets/library",
]) {
  assert(
    integration.includes(marker),
    `Level 1 visualization integration is missing marker: ${marker}.`,
  );
}
assert(
  !integration.includes("<Canvas"),
  "Level 1 integration shell must not own another WebGL Canvas.",
);

const viewer = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-audit-viewer.tsx",
);
assert(
  (viewer.match(/<Canvas/g) ?? []).length === 1 &&
    viewer.includes('frameloop="demand"') &&
    viewer.includes('dpr={1}'),
  "Level 1 visualizations must keep the existing single demand-rendered DPR-1 Canvas.",
);

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
assert(
  library.includes('import { DirectorLevel1CapabilityVisualization } from "./director-level1-capability-visualization";') &&
    library.includes(
      "<DirectorLevel1CapabilityVisualization capability={selectedLibraryEntry.capability} />",
    ),
  "Canonical Director Capability Library must render the Level 1 visualization workbench.",
);

const runtime = source(
  "sandbox/probe-lab/motion-camera-library/director-perceptual-runtime.ts",
);
for (const forbidden of [
  "cinematic-production",
  "benchmark-burger",
  "cheeseburger_ms193r4w",
]) {
  assert(
    !runtime.includes(forbidden),
    `Level 1 proof runtime must not depend on Golden implementation detail: ${forbidden}.`,
  );
}

console.log("Director Level 1 visualization Phase 1B.6.2 verification passed.");
console.log("All 7 perceptual/composite capabilities now have deterministic WebGL visual proofs in the canonical Director Capability Library.");
console.log("Golden-extracted visual mechanisms remain normalized audit fixtures; production coordinates remain geometry/directability-derived.");

