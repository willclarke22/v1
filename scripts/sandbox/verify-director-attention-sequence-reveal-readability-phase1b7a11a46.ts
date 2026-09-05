import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildActiveDirectorQualificationFamilies,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function main() {
  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  const families = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-families.ts",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const a45 = source(
    "scripts/sandbox/verify-asset-identity-director-fixture-stability-phase1b7a11a45.ts",
  );
  const a44 = source(
    "scripts/sandbox/verify-director-attention-sequence-merge-closeout-phase1b7a11a44.ts",
  );
  const a43 = source(
    "scripts/sandbox/verify-director-subject-emphasis-final-spotlight-proof-phase1b7a11a43.ts",
  );

  const activeAttention = buildActiveDirectorQualificationFamilies(
    DIRECTOR_CAPABILITIES,
  ).find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Attention sequence",
  );
  assert(activeAttention, "Active Attention sequence family is missing.");
  assert(
    activeAttention.capability_ids.join("|") ===
      "establish|isolate|compare|reveal|introduce",
    `A.11A.46 must not change the reduced Attention-sequence membership: ${activeAttention.capability_ids.join("|")}.`,
  );

  const reveal = directorCapabilityDemoMoment(capability("reveal"));
  assert(reveal.shot, "Reveal demo shot is missing.");
  assert(
    reveal.shot.narrative_job === "reveal" &&
      reveal.shot.lighting.intents.includes("low_key") &&
      reveal.shot.lighting.intents.includes("light_reveal") &&
      reveal.shot.lighting.intents.includes("rim_lit") &&
      reveal.shot.reveal_at === 0.52,
    "Reveal must preserve its accepted low-key + light-reveal + rim-lit visual grammar and timing.",
  );

  const introduce = directorCapabilityDemoMoment(capability("introduce"));
  assert(introduce.shot, "Introduce demo shot is missing.");
  assert(
    introduce.shot.narrative_job === "introduce" &&
      introduce.shot.lighting.intents.includes("light_reveal") &&
      introduce.shot.camera.movement_steps.some(
        (step) => step.movement === "reframe",
      ) &&
      introduce.shot.camera.movement_steps.some(
        (step) => step.movement === "settle",
      ),
    "Introduce compound behavior must remain unchanged while Reveal readability is repaired.",
  );

  for (const marker of [
    "DIRECTOR_ATTENTION_REVEAL_READABILITY_FILL_INTENSITY = 18",
    "const revealReadabilityFillRef = useRef<THREE.SpotLight>(null);",
    "const revealReadabilityTargetRef = useRef<THREE.Object3D>(null);",
    "const revealReadabilityCameraPlanarRef = useRef(new THREE.Vector3());",
    'mode === "reveal" && shot.narrative_job === "reveal"',
    "A.11A.46: Reveal keeps the environment low-key but adds a soft",
    ".copy(camera.position)",
    ".sub(targetPoint);",
    "cameraPlanar.normalize();",
    "readabilityFill.target = readabilityTarget;",
    "DIRECTOR_ATTENTION_REVEAL_READABILITY_FILL_INTENSITY * revealAmount",
    "castShadow={false}",
    "angle={0.62}",
    "penumbra={0.9}",
    "distance={7.5}",
    "decay={1.35}",
  ]) {
    assert(runtime.includes(marker), `A.11A.46 Reveal-readability marker missing: ${marker}`);
  }

  const motivatedStart = runtime.indexOf("function DirectorMotivatedLight({");
  const motivatedEnd = runtime.indexOf(
    "function DirectorShadowProjectionKey({",
    motivatedStart,
  );
  assert(
    motivatedStart >= 0 && motivatedEnd > motivatedStart,
    "DirectorMotivatedLight block is missing.",
  );
  const motivatedBlock = runtime.slice(motivatedStart, motivatedEnd);
  assert(
    motivatedBlock.includes(
      'const dedicatedRevealReadabilityFill =\n    mode === "reveal" && shot.narrative_job === "reveal";',
    ) &&
      motivatedBlock.includes(
        "readabilityFill.intensity =\n        DIRECTOR_ATTENTION_REVEAL_READABILITY_FILL_INTENSITY * revealAmount;",
      ),
    "The new readability fill must be both Reveal-only and synchronized to the existing reveal envelope.",
  );
  assert(
    !motivatedBlock.includes('shot.narrative_job === "introduce"') &&
      !motivatedBlock.includes('shot.narrative_job === "foreshadow"') &&
      !motivatedBlock.includes('shot.narrative_job === "reverse_assumption"'),
    "A.11A.46 must not opt Introduce/Foreshadow/Reverse assumption into the dedicated Reveal readability fill.",
  );

  // A.11A.43 is frozen. Its subject-spotlight key/fill proof must remain intact.
  for (const marker of [
    "DIRECTOR_SUBJECT_SPOTLIGHT_KEY_INTENSITY = 72",
    "DIRECTOR_TRACKING_SPOTLIGHT_KEY_INTENSITY = 64",
    "DIRECTOR_SUBJECT_SPOTLIGHT_FILL_INTENSITY = 18",
    "function DirectorSubjectSpotlight({",
  ]) {
    assert(runtime.includes(marker), `A.11A.43 frozen spotlight marker missing: ${marker}`);
  }

  // A.11A.44 owns the merge/compound closeout. A.11A.46 is a visual robustness repair only.
  for (const marker of [
    'orient: {',
    'canonical_capability_id: "establish"',
    'semantic_job: "orient"',
    'threejs: "compound"',
    'fallback: "establish"',
  ]) {
    assert(registry.includes(marker), `A.11A.44 registry marker missing: ${marker}`);
  }
  assert(
    families.includes('orient: "narrative_attention:Attention sequence"') &&
      room.includes("10 clips") &&
      room.includes("Introduce remains active but is classified honestly as a compound"),
    "A.11A.44 reduced Attention-sequence closeout markers regressed.",
  );

  assert(
    a45.includes(
      "A.11A.45 Asset Identity / Director Fixture Stability verification passed.",
    ) &&
      a44.includes(
        "Director Attention sequence Phase 1B.7A.11A.44 merge closeout verification passed.",
      ) &&
      a43.includes(
        "Director Subject emphasis Phase 1B.7A.11A.43 final spotlight-proof verification passed.",
      ),
    "A.11A.46 predecessor lineage is incomplete.",
  );

  console.log(
    "Director Attention sequence Phase 1B.7A.11A.46 Reveal-readability verification passed.",
  );
  console.log(
    "Reveal now adds a Reveal-only, camera-side soft fill that ramps with the existing reveal envelope; Establish/Isolate/Compare remain untouched, Introduce remains compound and unchanged, and Orient remains merged into Establish.",
  );
}

main();
