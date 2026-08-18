import fs from "node:fs";
import path from "node:path";

import {
  buildLunchGoldenDerivedStarterPlan,
  buildLunchReproductionQualityDiagnostics,
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
const runtime = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
const goldenLayout = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
const readme = source(
  "sandbox/probe-lab/cinematic-production/README.md",
);

for (const marker of [
  "focus_role",
  "focus_weight",
  "sampleOpacityWithMinimumFade",
  "choreography, not physical contact",
  "hand_precontact_target_drift_m",
  "cow_focus_target_x_m",
  "chicken_focus_target_x_m",
  "fish_reveal_separation_ratio_15s",
  "non_hand_physical_interaction_count",
  "Physical causality",
]) {
  assert(
    planSource.includes(marker),
    `CP.2A.2 plan marker missing: ${marker}.`,
  );
}

const starter = buildLunchGoldenDerivedStarterPlan();
const starterResult = parseCinematicReproductionJson(JSON.stringify(starter));
assert(
  starterResult.validation.ok && starterResult.validation.warnings.length === 0,
  `CP.2A.2 golden-derived starter must remain clean: ${JSON.stringify(starterResult.validation)}.`,
);
const starterQuality = buildLunchReproductionQualityDiagnostics(starterResult.plan);
assert(
  starterQuality.fast_opacity_transition_count === 0 &&
    starterQuality.hand_precontact_target_drift_m < 0.02 &&
    starterQuality.cow_focus_target_x_m > 0.28 &&
    starterQuality.chicken_focus_target_x_m < -0.28 &&
    starterQuality.fish_reveal_separation_ratio_15s <= 1.5 &&
    starterQuality.non_hand_physical_interaction_count === 0,
  `CP.2A.2 diagnostics must be calibrated against Golden Lunch: ${JSON.stringify(starterQuality)}.`,
);

// Round-2-style unsupported reveal relations must never be converted into CP.1F nudges.
const relationFixture = {
  ...starter,
  interactions: [
    ...starter.interactions,
    {
      id: "cow_arrives",
      kind: "reveal",
      source_role: "cow",
      target_role: "tray",
      approach_start_s: 7.55,
      contact_start_s: 9.15,
      contact_end_s: 10.55,
      retreat_end_s: 11.75,
      approach_direction: [-1, 0, -0.15],
      preferred_target_side: "right",
      contact_clearance_m: 0.02,
      obstacle_clearance_m: 0.04,
      obstacle_roles: ["burger"],
      maintain_contact: true,
    },
    {
      id: "fish_pop",
      kind: "pop_reveal",
      source_role: "goldfish",
      target_role: "burger",
      approach_start_s: 12.95,
      contact_start_s: 13.72,
      contact_end_s: 18.2,
      retreat_end_s: 19.12,
      approach_direction: [0, 0, 1],
      preferred_target_side: "back",
      contact_clearance_m: 0.3,
      obstacle_clearance_m: 0.05,
      obstacle_roles: ["burger"],
      maintain_contact: true,
    },
  ],
};
const relationResult = parseCinematicReproductionJson(
  JSON.stringify(relationFixture),
);
assert(
  relationResult.plan.interactions.length === 1 &&
    relationResult.plan.interactions[0].id === "hand_nudges_burger",
  "CP.2A.2 must keep only genuine touch/nudge/push relations in the physical lane.",
);
assert(
  relationResult.validation.warnings.filter((item) =>
    item.includes("choreography, not physical contact")
  ).length === 2,
  "CP.2A.2 must visibly report ignored reveal/pop-reveal interaction misuse.",
);

// Very fast opacity changes are rendered through a longer visibility envelope.
const fastFadeFixture = {
  ...starter,
  actors: {
    ...starter.actors,
    cow: {
      interpolation: "c2",
      keys: [
        {
          t: 0,
          visible: false,
          position: [2.4, 0, 0.1],
          rotation_deg: [0, -85, 0],
          scale_multiplier: 0.72,
          opacity: 0,
          emphasis: 0,
        },
        {
          t: 7.35,
          visible: true,
          position: [2.4, 0, 0.1],
          rotation_deg: [0, -85, 0],
          scale_multiplier: 0.72,
          opacity: 0,
          emphasis: 0,
        },
        {
          t: 7.55,
          visible: true,
          position: [2.2, 0, 0.05],
          rotation_deg: [0, -82, 0],
          scale_multiplier: 0.74,
          opacity: 1,
          emphasis: 0.5,
        },
        {
          t: 9.15,
          visible: true,
          position: [1.16, 0, -0.24],
          rotation_deg: [0, -78, 0],
          scale_multiplier: 0.82,
          opacity: 1,
          emphasis: 0.6,
        },
      ],
    },
  },
};
const fastFadeResult = parseCinematicReproductionJson(
  JSON.stringify(fastFadeFixture),
);
const fadeAtAuthoredEnd = sampleCinematicReproductionPlan(
  fastFadeResult.plan,
  7.55,
).cow.opacity;
assert(
  fadeAtAuthoredEnd > 0.15 && fadeAtAuthoredEnd < 0.95,
  `CP.2A.2 should soften a 0.20s opacity pop instead of already reaching 1.0; got ${fadeAtAuthoredEnd}.`,
);
assert(
  fastFadeResult.validation.warnings.some((item) =>
    item.includes("opacity transition")
  ),
  "CP.2A.2 must surface fast authored opacity transitions.",
);

// Temporary camera focus may move attention away from x=0 without changing the hero identity.
const focusFixture = {
  ...starter,
  camera: {
    ...starter.camera,
    keys: starter.camera.keys.map((key) =>
      Math.abs(key.t - 9.35) < 0.01
        ? {
            ...key,
            target: [0, 0.32, -0.12],
            focus_role: "cow",
            focus_weight: 0.6,
          }
        : key
    ),
  },
};
const focusResult = parseCinematicReproductionJson(JSON.stringify(focusFixture));
const cowFocusSample = sampleCinematicReproductionPlan(focusResult.plan, 9.35);
assert(
  cowFocusSample.camera.target[0] > 0.4,
  `CP.2A.2 focus_role should bias target toward the cow; got x=${cowFocusSample.camera.target[0]}.`,
);

// Causality lock prevents model-authored target drift before nudge contact.
const driftFixture = {
  ...starter,
  actors: {
    ...starter.actors,
    burger: {
      interpolation: "c2",
      keys: [
        {
          t: 0,
          visible: true,
          position: [0, 0, 0.02],
          rotation_deg: [0, 0, 0],
          scale_multiplier: 0.96,
          opacity: 1,
          emphasis: 0.4,
        },
        {
          t: 3.15,
          visible: true,
          position: [0.25, 0, -0.2],
          rotation_deg: [0, 0, 0],
          scale_multiplier: 1,
          opacity: 1,
          emphasis: 0.6,
        },
        {
          t: 4.55,
          visible: true,
          position: [0.3, 0, -0.25],
          rotation_deg: [0, 0, 0],
          scale_multiplier: 1,
          opacity: 1,
          emphasis: 0.6,
        },
      ],
    },
  },
};
const driftResult = parseCinematicReproductionJson(JSON.stringify(driftFixture));
const beforeContact = sampleCinematicReproductionPlan(driftResult.plan, 3.0).foods[1];
const approachStart = sampleCinematicReproductionPlan(driftResult.plan, 1.35).foods[1];
assert(
  Math.hypot(
    beforeContact.position[0] - approachStart.position[0],
    beforeContact.position[2] - approachStart.position[2],
  ) < 1e-6,
  "CP.2A.2 generated compiler must causally hold a push/nudge target until contact.",
);

for (const marker of [
  "interactions is ONLY for literal touch/nudge/push contact",
  "focus_role",
  "Sparse early camera evidence",
  "visibility fades over roughly 0.5–0.8s",
  "fish reveal is PHYSICAL OCCLUSION",
  "generated contact-frame alignment",
  "Fish separates too quickly",
  'contract_revision: "cp2a2"',
]) {
  assert(route.includes(marker), `CP.2A.2 GLM guidance marker missing: ${marker}.`);
}

for (const marker of [
  "generatedContactFramePose",
  "generated_contact_orientation_applied",
  "runtimeSampler !== sampleCinematicBurgerRuntime",
  "contactRegionLocalNormal",
]) {
  assert(runtime.includes(marker), `CP.2A.2 generated contact-frame runtime marker missing: ${marker}.`);
}
assert(
  runtime.includes("runtimeSampler = sampleCinematicBurgerRuntime"),
  "CP.2A.2 must preserve Golden Lunch as the default runtime sampler.",
);
assert(
  runtime.includes("generated-vs-golden belongs to the layout/interaction") &&
    runtime.includes("runtimeSampler !== sampleCinematicBurgerRuntime"),
  "CP.2A.2 generated-lane flag must be passed at applyRuntimeLayout, where contact orientation is resolved.",
);
assert(
  !runtime.includes("isPlaying,\n      runtimeSampler !== sampleCinematicBurgerRuntime,\n    );\n  }\n}"),
  "CP.2A.2 generated-lane flag must not be passed to protectCameraFraming.",
);
assert(
  goldenLayout.includes("C2 through-motion master camera rail"),
  "CP.2A.2 must not replace the frozen Golden Lunch camera authority.",
);
assert(
  lab.includes("CP.2A.1 → CP.2A.2"),
  "CP.2A.2 bench should visibly identify the new fidelity pass while retaining CP.2A.1 lineage.",
);
assert(
  readme.includes("CP.2A.2 — Cinematic Relationship + Contact-Frame Fidelity") &&
    readme.includes("Physical interaction is no longer a catch-all") &&
    readme.includes("Generated contact-frame orientation") &&
    readme.includes("Hero anchor versus temporary focus"),
  "CP.2A.2 README must document the Round-2 lessons and new responsibilities.",
);

console.log(
  "Cinematic Production CP.2A.2 relationship/contact-frame fidelity verification passed.",
);
console.log(
  "Generated Lunch now separates reveal choreography from literal contact, aligns contact orientation, softens visibility pressure, supports temporary camera attention, preserves target causality, and measures fish reveal rate while Golden Lunch remains the frozen oracle.",
);
