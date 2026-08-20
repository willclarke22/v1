import fs from "node:fs";
import path from "node:path";

import {
  CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
  parseFreeformCinematicReproductionJson,
  sampleFreeformCinematicReproductionPlan,
} from "../../sandbox/probe-lab/cinematic-production/cinematic-reproduction-plan";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const source = (
  relative: string,
) =>
  fs.readFileSync(
    path.join(
      root,
      relative,
    ),
    "utf8",
  );

const planSource = source(
  "sandbox/probe-lab/cinematic-production/cinematic-reproduction-plan.ts",
);
const routeSource = source(
  "sandbox/probe-lab/cinematic-production/routes/freeform-closed-loop.ts",
);
const visionSource = source(
  "sandbox/probe-lab/cinematic-production/routes/freeform-vision.ts",
);
const uiSource = source(
  "sandbox/probe-lab/cinematic-production/ui/freeform-closed-loop-lab.tsx",
);
const runtimeSource = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
const readme = source(
  "sandbox/probe-lab/cinematic-production/README.md",
);
const probePage = source(
  "app/sandbox/probe-lab/page.tsx",
);

for (const marker of [
  "parseFreeformCinematicReproductionJson",
  "validateFreeformCinematicReproductionPlan",
  "sampleFreeformCinematicReproductionPlan",
  "Generic physical causality",
  "CP.2B.1 sparse-authoring contract",
  "directionalClearanceConstraints",
]) {
  assert(
    planSource.includes(
      marker,
    ),
    `CP.2B generic plan/sampler marker is missing: ${marker}`,
  );
}

const freeformSamplerStart =
  planSource.indexOf(
    "export function sampleFreeformCinematicReproductionPlan",
  );
const freeformSamplerEnd =
  planSource.indexOf(
    "function actorKey(",
    freeformSamplerStart,
  );
const freeformSamplerText =
  planSource.slice(
    freeformSamplerStart,
    freeformSamplerEnd,
  );

for (const forbidden of [
  "compileLunchActorChoreography(",
  "compiledLunchAttentionEmphasis(",
  "sampleCinematicBurgerRuntime(",
  "buildLunchGoldenDerivedStarterPlan(",
  "MASTER_CAMERA_KEYS",
]) {
  assert(
    !freeformSamplerText.includes(
      forbidden,
    ),
    `CP.2B freeform sampler leaked Lunch/Golden choreography: ${forbidden}`,
  );
}

for (const marker of [
  "Create a clear, polished short film from the user's request.",
  "creative_template:",
  "compactAssetList",
  "6–8 purposeful camera keys",
  "later actor keys may omit unchanged fields",
  "Return one valid JSON object",
  'action?: "generate" | "repair"',
  "Patch V1 instead of redesigning it.",
  "contract_repair_attempted",
  "max_tokens: 6_000",
  "stream: true",
  "first_event_ms",
  "first_token_ms",
  "glm_initial_response_chars",
]) {
  assert(
    routeSource.includes(
      marker,
    ),
    `CP.2B GLM route marker is missing: ${marker}`,
  );
}

for (const forbidden of [
  "BURGER_ASSEMBLY_BENCHMARK",
  "buildLunchGoldenDerivedStarterPlan",
  "MASTER_CAMERA_KEYS",
  "function assetDossier(",
  "function schemaShape(",
  "max_tokens: 20_000",
  "stream: false",
]) {
  assert(
    !routeSource.includes(
      forbidden,
    ),
    `CP.2B GLM route must not import/use the Golden creative oracle: ${forbidden}`,
  );
}

for (const marker of [
  "There is no reference video",
  '"preserve": ["visible strength to keep"]',
  '"problem": "what visibly goes wrong"',
  '"desired_change": "what should visibly change"',
  '"top_repairs": ["highest-priority repair"]',
  "max_tokens: 2_500",
  "enable_thinking: false",
  "cp2b2_compact_omni_critique_v1",
  "reference_smoke_before_each_call:",
  "omni_ms",
]) {
  assert(
    visionSource.includes(
      marker,
    ),
    `CP.2B.2 compact Omni route marker is missing: ${marker}`,
  );
}

for (const forbidden of [
  '"assessments"',
  '"overall_quality_score"',
  '"confidence": 0.0',
  '"impact": "why it hurts the user\'s intent"',
]) {
  assert(
    !visionSource.includes(
      forbidden,
    ),
    `CP.2B.2 compact Omni prompt must not request legacy review field: ${forbidden}`,
  );
}

for (const marker of [
  "Freeform Closed-Loop Production Test",
  "Run V1 → Omni → V2",
  "Generate V1 only",
  "Ask Omni about V1",
  "Generate V2 from Omni notes",
  "Optional final Omni check",
  "sampleFreeformCinematicReproductionPlan",
  "Time to V1 ready",
  "V1 first content token",
  "Full V1→Omni→V2",
  "real-time evaluation MP4",
]) {
  assert(
    uiSource.includes(
      marker,
    ),
    `CP.2B workbench marker is missing: ${marker}`,
  );
}

for (const marker of [
  "currentCritique.summary",
  "currentCritique.preserve.map",
  "problem.desired_change",
]) {
  assert(
    uiSource.includes(marker),
    `CP.2B.2 compact Omni UI marker is missing: ${marker}`,
  );
}

for (const forbidden of [
  "currentCritique.overall_quality_score",
  "problem.confidence",
  "currentCritique.what_the_video_communicates",
]) {
  assert(
    !uiSource.includes(forbidden),
    `CP.2B.2 compact Omni UI must not render legacy critique field: ${forbidden}`,
  );
}

for (const marker of [
  "resolveAssetAwareInteractionMotion",
  "enforceDirectionalSurfaceClearance",
  "protectCameraFraming",
  "asset-aware interaction runtime",
]) {
  assert(
    runtimeSource.includes(
      marker,
    ),
    `CP.2B must keep the shared deterministic runtime machinery: ${marker}`,
  );
}

assert(
  readme.includes(
    "CP.2B — Freeform Closed-Loop Production Test",
  ) &&
    readme.includes(
      "The current MP4 capture intentionally remains real-time",
    ),
  "CP.2B README documentation is missing.",
);

assert(
  probePage.includes(
    "/sandbox/probe-lab/cinematic-production/freeform",
  ),
  "Probe Lab index must expose the CP.2B freeform route.",
);

const rawPlan = {
  schema_version:
    CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
  title:
    "Synthetic freeform verifier",
  duration_s: 20,
  aspect_ratio: "9:16",
  intent_summary:
    "Verify that authored tracks stay authoritative.",
  camera: {
    interpolation: "c2",
    keys: [
      {
        t: 0,
        position: [
          0,
          3,
          6,
        ],
        target: [
          0,
          0.3,
          0,
        ],
        fov: 36,
      },
      {
        t: 5,
        position: [
          1,
          2.8,
          5.2,
        ],
        target: [
          0,
          0.3,
          0,
        ],
        fov: 34,
      },
      {
        t: 10,
        position: [
          2,
          2.4,
          4.2,
        ],
        target: [
          0,
          0.3,
          0,
        ],
        fov: 32,
      },
      {
        t: 14,
        position: [
          1.6,
          2.2,
          3.8,
        ],
        target: [
          0,
          0.3,
          0,
        ],
        fov: 31,
      },
      {
        t: 17,
        position: [
          0.7,
          2.1,
          4.1,
        ],
        target: [
          0,
          0.3,
          0,
        ],
        fov: 31,
      },
      {
        t: 20,
        position: [
          0,
          2,
          4.4,
        ],
        target: [
          0,
          0.35,
          0,
        ],
        fov: 30,
      },
    ],
  },
  actors: Object.fromEntries(
    [
      "tray",
      "apple",
      "burger",
      "nigiri",
      "cow",
      "chicken",
      "goldfish",
      "hand",
    ].map((role) => [
      role,
      {
        interpolation:
          "linear",
        keys: [
          {
            t: 0,
            visible: true,
            position:
              role === "cow"
                ? [
                    0.9,
                    0,
                    0.7,
                  ]
                : role ===
                    "hand"
                  ? [
                      -2,
                      1.4,
                      1,
                    ]
                  : [
                      0,
                      0,
                      0,
                    ],
            rotation_deg: [
              0,
              0,
              0,
            ],
            scale_multiplier: 1,
            opacity: 1,
            emphasis:
              role === "cow"
                ? 0.37
                : 0,
          },
          {
            t: 20,
            visible: true,
            position:
              role === "cow"
                ? [
                    0.9,
                    0,
                    0.7,
                  ]
                : role ===
                    "hand"
                  ? [
                      -2,
                      1.4,
                      1,
                    ]
                  : [
                      0,
                      0,
                      0,
                    ],
            rotation_deg: [
              0,
              0,
              0,
            ],
            scale_multiplier: 1,
            opacity: 1,
            emphasis:
              role === "cow"
                ? 0.37
                : 0,
          },
        ],
      },
    ]),
  ),
  interactions: [
    {
      id:
        "generic_touch",
      kind: "touch",
      source_role: "hand",
      target_role: "burger",
      approach_start_s: 4,
      contact_start_s: 5,
      contact_end_s: 6,
      retreat_end_s: 7,
      approach_direction: [
        1,
        -0.1,
        0,
      ],
      preferred_target_side:
        "top",
      contact_clearance_m:
        0.008,
      obstacle_clearance_m:
        0.03,
      obstacle_roles: [
        "apple",
      ],
      maintain_contact: true,
    },
  ],
  directional_clearance: [
    {
      id:
        "generic_gap",
      moving_role:
        "goldfish",
      anchor_role:
        "burger",
      start_s: 8,
      end_s: 12,
      direction: [
        0,
        0,
        -1,
      ],
      minimum_surface_gap_m:
        0.25,
    },
  ],
  notes: [],
};

const parsed =
  parseFreeformCinematicReproductionJson(
    JSON.stringify(
      rawPlan,
    ),
  );
assert(
  parsed.validation.ok,
  `Synthetic freeform plan must validate: ${JSON.stringify(parsed.validation)}`,
);

const sparseCameraPlan =
  structuredClone(
    rawPlan,
  ) as any;
sparseCameraPlan.camera.keys = [
  {
    t: 0,
    position: [0, 3, 6],
    target: [0, 0.3, 0],
    fov: 40,
    focus_role: "burger",
    focus_weight: 0.25,
  },
  {
    t: 10,
    position: [1.5, 2.5, 4.8],
  },
  {
    t: 20,
    target: [0.2, 0.4, -0.1],
    focus_role: null,
  },
];
const sparseParsed =
  parseFreeformCinematicReproductionJson(
    JSON.stringify(
      sparseCameraPlan,
    ),
  );
assert(
  sparseParsed.validation.ok,
  `Sparse camera plan must validate: ${JSON.stringify(sparseParsed.validation)}`,
);
const sparseCameraKeys =
  sparseParsed.plan.camera.keys;
assert(
  sparseCameraKeys.length === 3,
  `Sparse camera test must normalize exactly 3 keys; got ${sparseCameraKeys.length}.`,
);
const inheritedCameraKey =
  sparseCameraKeys[1]!;
const clearedFocusCameraKey =
  sparseCameraKeys[2]!;

assert(
  Math.abs(
    inheritedCameraKey.target[1] -
      0.3,
  ) < 1e-6 &&
    Math.abs(
      inheritedCameraKey.fov -
        40,
    ) < 1e-6 &&
    inheritedCameraKey.focus_role ===
      "burger" &&
    Math.abs(
      (inheritedCameraKey.focus_weight ?? 0) -
        0.25,
    ) < 1e-6,
  "Sparse camera keys must inherit unchanged target/FOV/focus fields.",
);
assert(
  Math.abs(
    clearedFocusCameraKey.position[0] -
      1.5,
  ) < 1e-6 &&
    Math.abs(
      clearedFocusCameraKey.fov -
        40,
    ) < 1e-6 &&
    clearedFocusCameraKey.focus_role ===
      null,
  "Sparse camera keys must inherit position/FOV while allowing explicit focus clearing.",
);

const sample =
  sampleFreeformCinematicReproductionPlan(
    parsed.plan,
    10,
  );

assert(
  Math.abs(
    sample.cow.position[0] -
      0.9,
  ) < 1e-6 &&
    Math.abs(
      sample.cow.position[2] -
        0.7,
    ) < 1e-6,
  "Freeform sampler must preserve the authored cow track instead of applying Lunch insert choreography.",
);
assert(
  Math.abs(
    sample.cow.emphasis -
      0.37,
  ) < 1e-6,
  "Freeform sampler must preserve authored emphasis instead of injecting Lunch attention envelopes.",
);
assert(
  (sample.directionalClearanceConstraints ?? [])
    .some(
      (item) =>
        item.id ===
        "generic_gap",
    ),
  "Freeform sampler must forward directional-clearance intent to the shared runtime.",
);

const contactSample =
  sampleFreeformCinematicReproductionPlan(
    parsed.plan,
    5.5,
  );
assert(
  (contactSample.interactions ?? []).some(
    (item) =>
      item.id ===
        "generic_touch" &&
      item.phase ===
        "contact",
  ),
  "Freeform sampler must forward literal contact intent to CP.1F runtime solving.",
);

console.log(
  "Cinematic Production CP.2B.2 freeform closed-loop verification passed.",
);
console.log(
  "CP.2B.2 keeps the CP.2B.1 sparse GLM path and replaces the heavy Omni review packet with a compact summary/preserve/problems/top-repairs witness contract while preserving the same V2 repair loop.",
);
