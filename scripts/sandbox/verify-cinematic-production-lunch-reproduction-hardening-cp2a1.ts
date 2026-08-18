import fs from "node:fs";
import path from "node:path";

import {
  buildLunchGoldenDerivedStarterPlan,
  buildLunchReproductionQualityDiagnostics,
  cinematicReproductionPlanSchemaExample,
  parseCinematicReproductionJson,
  sampleCinematicReproductionPlan,
} from "../../sandbox/probe-lab/cinematic-production/cinematic-reproduction-plan";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const source = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

const planSource = source(
  "sandbox/probe-lab/cinematic-production/cinematic-reproduction-plan.ts",
);
const route = source(
  "sandbox/probe-lab/cinematic-production/routes/generate-reproduction.ts",
);
const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
const runtime = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
const goldenLayout = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
const cameraSafety = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-camera-safety.ts",
);
const readme = source(
  "sandbox/probe-lab/cinematic-production/README.md",
);

for (const marker of [
  "rotation_deg",
  "scale_multiplier",
  "support_lift_y",
  "sampleLocalBoundedScalar",
  "bounded actor channels must never inherit future C2 tangents",
  "buildLunchReproductionQualityDiagnostics",
  "late_orbit_signed_degrees",
  "late_orbit_reversal_count",
  "opening_trio_max_abs_surface_lift_m",
  "actor/target aliases",
  "actor/blocker aliases",
]) {
  assert(
    planSource.includes(marker),
    `CP.2A.1 reproduction-plan hardening marker missing: ${marker}.`,
  );
}

const schemaExample = cinematicReproductionPlanSchemaExample() as any;
assert(
  schemaExample.actors.apple.keys[0].rotation_deg &&
    schemaExample.actors.apple.keys[0].scale_multiplier === 1 &&
    schemaExample.interactions[0]?.source_role === "hand" &&
    schemaExample.interactions[0]?.target_role === "burger" &&
    schemaExample.directional_clearance[0]?.moving_role === "goldfish" &&
    schemaExample.directional_clearance[0]?.anchor_role === "burger",
  "CP.2A.1 prompt example must show unit semantics plus complete interaction/clearance object shapes.",
);

const starter = buildLunchGoldenDerivedStarterPlan();
const starterResult = parseCinematicReproductionJson(JSON.stringify(starter));
assert(
  starterResult.validation.ok && starterResult.validation.warnings.length === 0,
  `CP.2A.1 golden-derived starter should remain clean: ${JSON.stringify(starterResult.validation)}.`,
);
const starterQuality = buildLunchReproductionQualityDiagnostics(
  starterResult.plan,
);
assert(
  starterQuality.camera_key_count >= 14 &&
    starterQuality.late_orbit_signed_degrees > 330 &&
    starterQuality.late_orbit_reversal_count === 0 &&
    starterQuality.fish_hold_horizontal_drift_m < 0.18 &&
    starterQuality.hand_interaction_declared &&
    starterQuality.fish_clearance_declared &&
    starterQuality.opening_trio_max_abs_surface_lift_m < 0.01 &&
    starterQuality.smallest_visible_scale_multiplier >= 0.58,
  `CP.2A.1 starter must prove the deterministic Lunch quality diagnostics: ${JSON.stringify(starterQuality)}.`,
);

const compatibilityPlan = {
  ...starter,
  actors: {
    ...starter.actors,
    apple: {
      interpolation: "c2",
      keys: [
        {
          t: 0,
          visible: true,
          position: [-1.36, 0, 0.36],
          rotation_deg: [0, 180, 0],
          scale_multiplier: 0.88,
          opacity: 1,
          emphasis: 0,
        },
        {
          t: 26,
          visible: true,
          position: [-1.1, 0, 0.28],
          rotation_deg: [0, 0, 0],
          scale_multiplier: 0.64,
          opacity: 0.58,
          emphasis: 0,
        },
      ],
    },
  },
  interactions: [
    {
      type: "hand_to_burger_nudge",
      t_start: 3.15,
      t_end: 4.55,
      actor: "hand",
      target: "burger",
      nudge_vector: [1, -0.12, -0.08],
      contact_point: [99, 99, 99],
      contact_normal: [0, 1, 0],
    },
  ],
  directional_clearance: [
    {
      type: "surface_gap",
      actor: "goldfish",
      blocker: "burger",
      t_start: 12.9,
      t_end: 19.12,
      direction: [0, 0, -1],
      min_gap_m: 0.3,
    },
  ],
};
const compatibilityResult = parseCinematicReproductionJson(
  JSON.stringify(compatibilityPlan),
);
assert(
  compatibilityResult.validation.ok &&
    compatibilityResult.plan.interactions[0]?.source_role === "hand" &&
    compatibilityResult.plan.interactions[0]?.target_role === "burger" &&
    compatibilityResult.plan.directional_clearance[0]?.moving_role ===
      "goldfish" &&
    compatibilityResult.plan.directional_clearance[0]?.anchor_role ===
      "burger" &&
    Math.abs(
      compatibilityResult.plan.actors.apple.keys[0].rotation[1] - Math.PI,
    ) < 1e-6 &&
    Math.abs(
      compatibilityResult.plan.actors.apple.keys[0].scale - 0.88,
    ) < 1e-6,
  "CP.2A.1 must normalize the first-run GLM aliases and explicit degree/scale-multiplier authoring without dropping physical intents.",
);
assert(
  compatibilityResult.validation.warnings.some((item) =>
    item.includes("actor/target aliases")
  ) &&
    compatibilityResult.validation.warnings.some((item) =>
      item.includes("actor/blocker aliases")
    ) &&
    compatibilityResult.validation.warnings.some((item) =>
      item.includes("CP.1F ignores those coordinates")
    ),
  "CP.2A.1 must surface compatibility/contact-authority warnings instead of silently discarding GLM fields.",
);

// Bounded scalar channels must not pre-echo a future entrance just because
// position/rotation remain C2.
const opacityFixture = {
  ...starter,
  cow: undefined,
  actors: {
    ...starter.actors,
    cow: {
      interpolation: "c2",
      keys: [
        {
          t: 0,
          visible: false,
          position: [2.4, 0, 0.1],
          rotation_deg: [0, -75, 0],
          scale_multiplier: 0.72,
          opacity: 0,
          emphasis: 0,
        },
        {
          t: 7.35,
          visible: false,
          position: [2.4, 0, 0.1],
          rotation_deg: [0, -75, 0],
          scale_multiplier: 0.72,
          opacity: 0,
          emphasis: 0,
        },
        {
          t: 8.05,
          visible: true,
          position: [1.7, 0, -0.1],
          rotation_deg: [0, -60, 0],
          scale_multiplier: 0.78,
          opacity: 1,
          emphasis: 0.8,
        },
      ],
    },
  },
};
const opacityResult = parseCinematicReproductionJson(
  JSON.stringify(opacityFixture),
);
const beforeEntrance = sampleCinematicReproductionPlan(
  opacityResult.plan,
  7.34,
);
assert(
  beforeEntrance.cow.opacity < 1e-6 && !beforeEntrance.cow.visible,
  `CP.2A.1 bounded opacity must prevent C2 pre-echo before the authored entrance; got ${beforeEntrance.cow.opacity}.`,
);

for (const marker of [
  "AUTHORING CONTRACT — DO NOT GUESS THESE UNITS",
  "support_lift_y=0",
  "Use rotation_deg",
  "Use scale_multiplier",
  "EXACT RELATION FIELD NAMES",
  "one-direction near-full orbit",
  "front-right ~15.25",
  "back-left ~20.45",
  "SPARSE GOLDEN STAGING ANCHORS",
  "goldfish settles near [0.02,0,-1.78]",
  "REPAIR PASS",
  "criticalRepairWarnings",
  "generation_attempts",
  "repair_content",
]) {
  assert(route.includes(marker), `CP.2A.1 GLM guidance marker missing: ${marker}.`);
}
assert(
  !route.includes("sampleCinematicBurgerRuntime") &&
    !route.includes("MASTER_CAMERA_KEYS") &&
    !route.includes("buildLunchGoldenDerivedStarterPlan"),
  "CP.2A.1 GLM route must receive reproducible guidance without importing the frozen golden camera implementation.",
);

for (const marker of [
  "MyWay · Cinematic Production · CP.2A.1",
  "glmRepairJson",
  "glmGenerationAttempts",
  "DETERMINISTIC REPAIR RESPONSE",
  "quality repair",
]) {
  assert(lab.includes(marker), `CP.2A.1 bench marker missing: ${marker}.`);
}

assert(
  runtime.includes("runtimeSampler = sampleCinematicBurgerRuntime") &&
    runtime.includes("generated-Lunch bridge") &&
    (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.2A.1 must keep the CP.2A single-renderer sampler bridge unchanged.",
);
assert(
  goldenLayout.includes("C2 through-motion master camera rail") &&
    cameraSafety.includes("Playback-only temporal governor"),
  "CP.2A.1 must preserve the frozen golden camera and final soft-safety stack.",
);

assert(
  readme.includes("CP.2A.1 — Reproduction Contract + GLM Guidance Hardening") &&
    readme.includes("Authoring semantics are explicit") &&
    readme.includes("Relations cannot silently disappear") &&
    readme.includes("Better diagnostics"),
  "CP.2A.1 README must document the first GLM-run lessons and hardened experiment boundary.",
);

console.log(
  "Cinematic Production CP.2A.1 reproduction-contract/GLM-guidance verification passed.",
);
console.log(
  "GLM now receives explicit support/scale/rotation/relation semantics, deterministic Lunch quality targets, a visible one-pass repair lane, and bounded actor scalar interpolation while Golden Lunch stays protected.",
);
