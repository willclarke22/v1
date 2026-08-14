import * as THREE from "three";

import {
  applyDirectorBlocking,
  sampleDirectorActorEventStateLegacyForVerification,
  sampleDirectorActorState,
  validateDirectorShot,
  type DirectorRuntimeActor,
} from "../scenes/ui/director-shot-runtime";
import {
  compileDirectorActorMotionProgram,
  sampleCompiledDirectorActorMotionProgram,
} from "../motion-program/director-motion-program-compiler";
import {
  MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION,
  MOTION_PROGRAM_PROCESS_QUANTITY_VERSION,
  MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
  type MyWayMotionProgramV1,
} from "../motion-program/motion-program-contract";
import {
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "./director-capability-registry";
import {
  directorControlledAuditRoleLayout,
  directorVisualAuditDefinition,
  type DirectorAuditFixtureKind,
} from "./director-visual-audit";

export const DIRECTOR_OBJECT_MOTION_FIDELITY_VERSION =
  "director_object_motion_fidelity_phase1b4_1_v1" as const;

export const DIRECTOR_OBJECT_MOTION_FIDELITY_PROGRESS = [
  0,
  0.25,
  0.5,
  0.75,
  1,
] as const;

export const DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES = [
  "translate",
  "rotate",
  "pivot",
  "oscillate",
] as const;

export const DIRECTOR_OBJECT_MOTION_PHASE1B4_3_RECIPE_CAPABILITIES = [
  "follow_target",
  "attach",
  "detach",
  "align",
  "aim_at",
  "hinge",
  "object_open",
  "object_close",
  "slide",
  "roll",
] as const;


export const DIRECTOR_OBJECT_MOTION_PHASE1B4_5_CHOREOGRAPHY_CAPABILITIES = [
  "scatter",
  "insert_into",
  "remove_from",
  "assemble",
  "disassemble",
  "split",
  "merge",
] as const;

export const DIRECTOR_OBJECT_MOTION_PHASE1B4_6_PROCESS_CAPABILITIES = [
  "flow",
  "emit",
  "fill",
  "drain",
  "accumulate",
] as const;

export const DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY: Record<
  string,
  {
    peers: string[];
    reason: string;
  }
> = {
  spin: {
    peers: ["rotate"],
    reason:
      "Spin and Rotate still share one repeated-rotation approximation; dedicated continuous spin semantics remain a later strengthening.",
  },
};

export type DirectorObjectMotionFidelityCheck = {
  id: string;
  description: string;
  passed: boolean;
  measured: string;
  kind:
    | "finite"
    | "regression_canary"
    | "recipe_strengthening"
    | "process_strengthening"
    | "redundancy_diagnostic";
};

export type DirectorObjectMotionFidelitySample = {
  progress: number;
  primary_position: [number, number, number];
  primary_rotation_degrees: [number, number, number];
  primary_scale: [number, number, number];
  distance_to_secondary_m: number;
};

export type DirectorObjectMotionQualificationState =
  | "frozen_canary"
  | "recipe_strengthened"
  | "choreography_strengthened"
  | "process_strengthened"
  | "fixture_ready_for_review"
  | "needs_semantic_strengthening";

export type DirectorObjectMotionProgramEvidence = {
  route: "motion_program" | "legacy_required" | "no_motion";
  reason: string;
  program: MyWayMotionProgramV1 | null;
  compiled_event_ids: string[];
  unsupported_event_ids: string[];
  legacy_equivalence: null | {
    sample_count: number;
    samples: Array<{
      progress: number;
      position_error_m: number;
      rotation_error_degrees: number;
      scale_error: number;
    }>;
    maximum_position_error_m: number;
    maximum_rotation_error_degrees: number;
    maximum_scale_error: number;
    passed: boolean;
  };
};

export type DirectorObjectMotionFidelityReport = {
  schema_version: typeof DIRECTOR_OBJECT_MOTION_FIDELITY_VERSION;
  capability_id: string;
  support_level: DirectorCapability["compiler"]["threejs"];
  fixture: DirectorAuditFixtureKind;
  controlled_geometry: true;
  strengthening_version:
    | typeof MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION
    | typeof MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION
    | typeof MOTION_PROGRAM_PROCESS_QUANTITY_VERSION
    | null;
  motion_program: DirectorObjectMotionProgramEvidence;
  samples: DirectorObjectMotionFidelitySample[];
  motion_signature: {
    translation_m: number;
    rotation_envelope_degrees: number;
    scale_envelope: number;
    target_distance_delta_m: number;
    path_envelope_m: number;
  };
  checks: DirectorObjectMotionFidelityCheck[];
  automated_status: "pass" | "review" | "known_redundancy";
  qualification_state: DirectorObjectMotionQualificationState;
  redundancy_peers: string[];
  limitations: string[];
  visual_review_required: true;
  validation: ReturnType<typeof validateDirectorShot>;
};

function rounded(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function vectorTuple(vector: THREE.Vector3): [number, number, number] {
  return [rounded(vector.x), rounded(vector.y), rounded(vector.z)];
}

function rotationTuple(rotation: THREE.Euler): [number, number, number] {
  return [
    rounded(THREE.MathUtils.radToDeg(rotation.x), 2),
    rounded(THREE.MathUtils.radToDeg(rotation.y), 2),
    rounded(THREE.MathUtils.radToDeg(rotation.z), 2),
  ];
}

function scaleTuple(scale: THREE.Vector3): [number, number, number] {
  return [rounded(scale.x), rounded(scale.y), rounded(scale.z)];
}

function actorFor(
  actors: DirectorRuntimeActor[],
  id: string,
) {
  return actors.find((actor) => actor.id === id) ?? null;
}

export function directorObjectMotionFidelityFixtureActors(
  capability: DirectorCapability,
): DirectorRuntimeActor[] {
  const fixture = directorVisualAuditDefinition(capability).fixture;
  const roleIds = [
    "primary_subject",
    "secondary_subject",
    "context_subject",
  ];

  const actors = roleIds.map((id) => {
    const layout = directorControlledAuditRoleLayout(fixture, id);
    return {
      id,
      position: [...layout.position] as [number, number, number],
      rotation: [...layout.rotation] as [number, number, number],
      size: [
        layout.target_extent_m,
        layout.target_extent_m,
        layout.target_extent_m,
      ] as [number, number, number],
    };
  });

  const moment = directorCapabilityDemoMoment(capability);
  return applyDirectorBlocking(moment, actors);
}

function sample(
  capability: DirectorCapability,
  actors: DirectorRuntimeActor[],
  progress: number,
): DirectorObjectMotionFidelitySample {
  const moment = directorCapabilityDemoMoment(capability);
  const primary = actorFor(actors, "primary_subject");
  const secondary = actorFor(actors, "secondary_subject");
  if (!primary || !secondary) {
    throw new Error(
      `Object-motion fidelity fixture for ${capability.id} is missing required actors.`,
    );
  }

  const primaryState = sampleDirectorActorState(
    moment,
    primary,
    progress,
    actors,
  );
  const secondaryState = sampleDirectorActorState(
    moment,
    secondary,
    progress,
    actors,
  );

  return {
    progress,
    primary_position: vectorTuple(primaryState.position),
    primary_rotation_degrees: rotationTuple(primaryState.rotation),
    primary_scale: scaleTuple(primaryState.scale),
    distance_to_secondary_m: rounded(
      primaryState.position.distanceTo(secondaryState.position),
    ),
  };
}

function vectorFromTuple(value: [number, number, number]) {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function sampleTravel(samples: DirectorObjectMotionFidelitySample[]) {
  let distance = 0;
  for (let index = 1; index < samples.length; index += 1) {
    distance += vectorFromTuple(samples[index]!.primary_position).distanceTo(
      vectorFromTuple(samples[index - 1]!.primary_position),
    );
  }
  return distance;
}

function rotationEnvelope(samples: DirectorObjectMotionFidelitySample[]) {
  const start = samples[0]!.primary_rotation_degrees;
  return Math.max(
    ...samples.map((entry) =>
      Math.sqrt(
        entry.primary_rotation_degrees.reduce(
          (sum, value, index) =>
            sum + (value - start[index]!) ** 2,
          0,
        ),
      ),
    ),
  );
}

function scaleEnvelope(samples: DirectorObjectMotionFidelitySample[]) {
  const start = samples[0]!.primary_scale;
  return Math.max(
    ...samples.map((entry) =>
      Math.max(
        ...entry.primary_scale.map(
          (value, index) => Math.abs(value - start[index]!),
        ),
      ),
    ),
  );
}

function pathEnvelope(
  capability: DirectorCapability,
  actors: DirectorRuntimeActor[],
) {
  const moment = directorCapabilityDemoMoment(capability);
  const primary = actorFor(actors, "primary_subject");
  if (!primary) return 0;

  const start = sampleDirectorActorState(moment, primary, 0, actors).position;
  let maximum = 0;
  for (let index = 0; index <= 16; index += 1) {
    const state = sampleDirectorActorState(
      moment,
      primary,
      index / 16,
      actors,
    );
    maximum = Math.max(
      maximum,
      state.position.distanceTo(start),
    );
  }
  return maximum;
}

function finiteCheck(
  samples: DirectorObjectMotionFidelitySample[],
): DirectorObjectMotionFidelityCheck {
  const values = samples.flatMap((entry) => [
    ...entry.primary_position,
    ...entry.primary_rotation_degrees,
    ...entry.primary_scale,
    entry.distance_to_secondary_m,
  ]);
  return {
    id: "finite_actor_samples",
    description:
      "All controlled actor samples must remain finite at 0/25/50/75/100%.",
    passed: values.every(Number.isFinite),
    measured: `${values.length} sampled scalar values`,
    kind: "finite",
  };
}

function canaryCheck(
  capability: DirectorCapability,
  actors: DirectorRuntimeActor[],
  samples: DirectorObjectMotionFidelitySample[],
): DirectorObjectMotionFidelityCheck | null {
  const start = samples[0]!;
  const end = samples[samples.length - 1]!;
  const startPosition = vectorFromTuple(start.primary_position);
  const endPosition = vectorFromTuple(end.primary_position);
  const endTravel = startPosition.distanceTo(endPosition);
  const rotation = rotationEnvelope(samples);
  const scale = scaleEnvelope(samples);
  const envelope = pathEnvelope(capability, actors);

  if (capability.id === "translate") {
    return {
      id: "translate_regression_canary",
      description:
        "Translate remains a readable position change without unintended rotation or scale.",
      passed: endTravel > 2 && rotation < 1 && scale < 0.01,
      measured:
        `end travel ${rounded(endTravel)} m; rotation envelope ${rounded(rotation)}°; scale envelope ${rounded(scale)}`,
      kind: "regression_canary",
    };
  }

  if (capability.id === "rotate") {
    return {
      id: "rotate_regression_canary",
      description:
        "Rotate changes orientation strongly while preserving root position and scale.",
      passed: endTravel < 0.05 && rotation > 300 && scale < 0.01,
      measured:
        `root drift ${rounded(endTravel)} m; rotation envelope ${rounded(rotation)}°; scale envelope ${rounded(scale)}`,
      kind: "regression_canary",
    };
  }

  if (capability.id === "pivot") {
    return {
      id: "pivot_regression_canary",
      description:
        "Pivot combines angular change with visible off-centre root travel around the declared contact point.",
      passed: endTravel > 0.25 && rotation > 55 && scale < 0.01,
      measured:
        `root arc chord ${rounded(endTravel)} m; rotation envelope ${rounded(rotation)}°; scale envelope ${rounded(scale)}`,
      kind: "regression_canary",
    };
  }

  if (capability.id === "oscillate") {
    return {
      id: "oscillate_regression_canary",
      description:
        "Oscillate leaves the rest pose, reverses direction, and returns close to its starting position.",
      passed: envelope > 0.45 && endTravel < 0.08 && scale < 0.01,
      measured:
        `dense path envelope ${rounded(envelope)} m; end drift ${rounded(endTravel)} m; scale envelope ${rounded(scale)}`,
      kind: "regression_canary",
    };
  }

  return null;
}

function recipeStrengtheningCheck(
  capability: DirectorCapability,
  motionProgram: DirectorObjectMotionProgramEvidence,
): DirectorObjectMotionFidelityCheck | null {
  const isRecipeCapability = (
    DIRECTOR_OBJECT_MOTION_PHASE1B4_3_RECIPE_CAPABILITIES as readonly string[]
  ).includes(capability.id);
  if (!isRecipeCapability) return null;

  const recipeIds =
    motionProgram.program?.diagnostics.recipe_ids ?? [];
  const strengtheningVersion =
    motionProgram.program?.diagnostics.strengthening_version ?? null;
  return {
    id: "phase1b4_3_recipe_strengthening",
    description:
      "The selected Director semantic compiles to a distinct Phase 1B.4.3 relational/articulation recipe without changing its declared support level.",
    passed:
      motionProgram.route === "motion_program" &&
      strengtheningVersion ===
        MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION &&
      recipeIds.length > 0,
    measured:
      recipeIds.length > 0
        ? `${recipeIds.join(", ")} · support remains ${capability.compiler.threejs}`
        : `${motionProgram.route} · ${motionProgram.reason}`,
    kind: "recipe_strengthening",
  };
}

function choreographyStrengtheningCheck(
  capability: DirectorCapability,
  motionProgram: DirectorObjectMotionProgramEvidence,
): DirectorObjectMotionFidelityCheck | null {
  const isChoreographyCapability = (
    DIRECTOR_OBJECT_MOTION_PHASE1B4_5_CHOREOGRAPHY_CAPABILITIES as readonly string[]
  ).includes(capability.id);
  if (!isChoreographyCapability) return null;

  const recipeIds =
    motionProgram.program?.diagnostics.recipe_ids ?? [];
  const choreographyVersion =
    motionProgram.program?.diagnostics.choreography_version ?? null;
  return {
    id: "phase1b4_5_multi_actor_choreography",
    description:
      "The selected semantic compiles through the Phase 1B.4.5 multi-actor choreography planner without changing its declared support level.",
    passed:
      motionProgram.route === "motion_program" &&
      choreographyVersion ===
        MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION &&
      recipeIds.length > 0,
    measured:
      recipeIds.length > 0
        ? `${recipeIds.join(", ")} · support remains ${capability.compiler.threejs}`
        : `${motionProgram.route} · ${motionProgram.reason}`,
    kind: "recipe_strengthening",
  };
}

function processStrengtheningCheck(
  capability: DirectorCapability,
  motionProgram: DirectorObjectMotionProgramEvidence,
): DirectorObjectMotionFidelityCheck | null {
  const isProcessCapability = (
    DIRECTOR_OBJECT_MOTION_PHASE1B4_6_PROCESS_CAPABILITIES as readonly string[]
  ).includes(capability.id);
  if (!isProcessCapability) return null;

  const recipeIds =
    motionProgram.program?.diagnostics.recipe_ids ?? [];
  const processVersion =
    motionProgram.program?.diagnostics.process_version ?? null;
  const processTrackCount =
    motionProgram.program?.tracks.filter(
      (track) => track.channel === "process",
    ).length ?? 0;
  return {
    id: "phase1b4_6_process_quantity",
    description:
      "The selected semantic compiles through the Phase 1B.4.6 process/quantity lane without changing the actor root transform or declared support level.",
    passed:
      motionProgram.route === "motion_program" &&
      processVersion === MOTION_PROGRAM_PROCESS_QUANTITY_VERSION &&
      processTrackCount > 0 &&
      recipeIds.length > 0,
    measured:
      recipeIds.length > 0
        ? `${recipeIds.join(", ")} · ${processTrackCount} process track(s) · support remains ${capability.compiler.threejs}`
        : `${motionProgram.route} · ${motionProgram.reason}`,
    kind: "process_strengthening",
  };
}

function redundancyCheck(
  capability: DirectorCapability,
): DirectorObjectMotionFidelityCheck | null {
  const diagnostic =
    DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY[capability.id];
  if (!diagnostic) return null;
  return {
    id: "known_semantic_redundancy",
    description:
      "This capability intentionally remains unqualified in Phase 1B.4.1 because its current runtime branch overlaps a different semantic verb.",
    passed: false,
    measured: diagnostic.reason,
    kind: "redundancy_diagnostic",
  };
}

function limitationsFor(
  capability: DirectorCapability,
  fixture: DirectorAuditFixtureKind,
) {
  const limitations: string[] = [];
  const redundancy =
    DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY[capability.id];

  if (redundancy) {
    limitations.push(redundancy.reason);
  }

  if (fixture === "object_motion_articulation") {
    limitations.push(
      "The controlled door fixture makes the pivot/state transition judgeable. Phase 1B.5 can resolve semantic hinge/pivot/subpart evidence when a real asset declares it, but arbitrary GLB child execution is still not promoted.",
    );
  }
  if (fixture === "object_motion_containment") {
    limitations.push(
      "The controlled peg/socket fixture makes containment direction judgeable; final fit, clearance, and allowed intersection remain Asset Scene Builder geometry responsibilities.",
    );
  }
  if (fixture === "object_motion_multi_part") {
    limitations.push(
      "Phase 1B.4.5 coordinates predeclared stable actor IDs into deterministic slots/spreads; it does not invent missing parts, clone geometry, or replace Asset Scene Builder collision/fit authority.",
    );
  }
  if (fixture === "object_motion_process") {
    limitations.push(
      "Phase 1B.4.6 supplies deterministic renderer-neutral quantity channels and carrier samples; it does not claim fluid, smoke, granular, collision, or production particle simulation.",
    );
  }

  return limitations;
}

function motionProgramEvidence(
  capability: DirectorCapability,
  actors: DirectorRuntimeActor[],
): DirectorObjectMotionProgramEvidence {
  const moment = directorCapabilityDemoMoment(capability);
  const primary = actorFor(actors, "primary_subject");
  if (!primary) {
    return {
      route: "no_motion",
      reason: "Controlled fixture is missing primary_subject.",
      program: null,
      compiled_event_ids: [],
      unsupported_event_ids: [],
      legacy_equivalence: null,
    };
  }

  const compilation = compileDirectorActorMotionProgram(
    moment,
    primary,
    actors,
  );
  const isCanary = (
    DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES as readonly string[]
  ).includes(capability.id);
  if (!isCanary || !compilation.program) {
    return {
      route: compilation.route,
      reason: compilation.reason,
      program: compilation.program,
      compiled_event_ids: compilation.compiled_event_ids,
      unsupported_event_ids: compilation.unsupported_event_ids,
      legacy_equivalence: null,
    };
  }

  const progressValues =
    capability.id === "oscillate"
      ? Array.from({ length: 33 }, (_, index) => index / 32)
      : [...DIRECTOR_OBJECT_MOTION_FIDELITY_PROGRESS];
  const samples = progressValues.map((progress) => {
    const legacy = sampleDirectorActorEventStateLegacyForVerification(
      moment,
      primary,
      progress,
      actors,
    );
    const program = sampleCompiledDirectorActorMotionProgram(
      compilation,
      progress,
    );
    if (!program) {
      throw new Error(
        `MotionProgram compilation for ${capability.id} disappeared during dual-run sampling.`,
      );
    }
    const programPosition = new THREE.Vector3(...program.position);
    const programRotation = new THREE.Vector3(...program.rotation);
    const legacyRotation = new THREE.Vector3(
      legacy.rotation.x,
      legacy.rotation.y,
      legacy.rotation.z,
    );
    const programScale = new THREE.Vector3(...program.scale);
    return {
      progress: rounded(progress, 5),
      position_error_m: rounded(
        legacy.position.distanceTo(programPosition),
        8,
      ),
      rotation_error_degrees: rounded(
        THREE.MathUtils.radToDeg(
          legacyRotation.distanceTo(programRotation),
        ),
        8,
      ),
      scale_error: rounded(
        legacy.scale.distanceTo(programScale),
        8,
      ),
    };
  });
  const maximumPosition = Math.max(
    ...samples.map((sample) => sample.position_error_m),
  );
  const maximumRotation = Math.max(
    ...samples.map((sample) => sample.rotation_error_degrees),
  );
  const maximumScale = Math.max(
    ...samples.map((sample) => sample.scale_error),
  );

  return {
    route: compilation.route,
    reason: compilation.reason,
    program: compilation.program,
    compiled_event_ids: compilation.compiled_event_ids,
    unsupported_event_ids: compilation.unsupported_event_ids,
    legacy_equivalence: {
      sample_count: samples.length,
      samples,
      maximum_position_error_m: maximumPosition,
      maximum_rotation_error_degrees: maximumRotation,
      maximum_scale_error: maximumScale,
      passed:
        maximumPosition <= 1e-6 &&
        maximumRotation <= 1e-5 &&
        maximumScale <= 1e-6,
    },
  };
}

export function buildDirectorObjectMotionFidelityReport(
  capability: DirectorCapability,
): DirectorObjectMotionFidelityReport | null {
  if (
    capability.category !== "object_motion" ||
    capability.group !== "Actor movement"
  ) {
    return null;
  }

  const fixture = directorVisualAuditDefinition(capability).fixture;
  const actors = directorObjectMotionFidelityFixtureActors(capability);
  const moment = directorCapabilityDemoMoment(capability);
  const samples = DIRECTOR_OBJECT_MOTION_FIDELITY_PROGRESS.map(
    (progress) => sample(capability, actors, progress),
  );
  const start = samples[0]!;
  const end = samples[samples.length - 1]!;
  const motionProgram = motionProgramEvidence(capability, actors);
  const checks = [finiteCheck(samples)];
  const canary = canaryCheck(capability, actors, samples);
  if (canary) checks.push(canary);
  const recipeStrengthening = recipeStrengtheningCheck(
    capability,
    motionProgram,
  );
  if (recipeStrengthening) checks.push(recipeStrengthening);
  const choreographyStrengthening = choreographyStrengtheningCheck(
    capability,
    motionProgram,
  );
  if (choreographyStrengthening) checks.push(choreographyStrengthening);
  const processStrengthening = processStrengtheningCheck(
    capability,
    motionProgram,
  );
  if (processStrengthening) checks.push(processStrengthening);
  const redundancy = redundancyCheck(capability);
  if (redundancy) checks.push(redundancy);

  const known =
    DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY[capability.id];
  const isCanary = (
    DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES as readonly string[]
  ).includes(capability.id);
  const isRecipeStrengthened = (
    DIRECTOR_OBJECT_MOTION_PHASE1B4_3_RECIPE_CAPABILITIES as readonly string[]
  ).includes(capability.id);
  const isChoreographyStrengthened = (
    DIRECTOR_OBJECT_MOTION_PHASE1B4_5_CHOREOGRAPHY_CAPABILITIES as readonly string[]
  ).includes(capability.id);
  const isProcessStrengthened = (
    DIRECTOR_OBJECT_MOTION_PHASE1B4_6_PROCESS_CAPABILITIES as readonly string[]
  ).includes(capability.id);
  const canaryPassed =
    !canary || canary.passed;

  return {
    schema_version: DIRECTOR_OBJECT_MOTION_FIDELITY_VERSION,
    capability_id: capability.id,
    support_level: capability.compiler.threejs,
    fixture,
    controlled_geometry: true,
    strengthening_version:
      isProcessStrengthened
        ? MOTION_PROGRAM_PROCESS_QUANTITY_VERSION
        : isChoreographyStrengthened
          ? MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION
          : isRecipeStrengthened
            ? MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION
            : null,
    motion_program: motionProgram,
    samples,
    motion_signature: {
      translation_m: rounded(sampleTravel(samples)),
      rotation_envelope_degrees: rounded(rotationEnvelope(samples), 2),
      scale_envelope: rounded(scaleEnvelope(samples)),
      target_distance_delta_m: rounded(
        end.distance_to_secondary_m -
        start.distance_to_secondary_m,
      ),
      path_envelope_m: rounded(pathEnvelope(capability, actors)),
    },
    checks,
    automated_status:
      known
        ? "known_redundancy"
        : isCanary && canaryPassed && checks[0]!.passed
          ? "pass"
          : "review",
    qualification_state:
      known
        ? "needs_semantic_strengthening"
        : isCanary && canaryPassed
          ? "frozen_canary"
          : isProcessStrengthened &&
              processStrengthening?.passed
            ? "process_strengthened"
            : isChoreographyStrengthened &&
                choreographyStrengthening?.passed
              ? "choreography_strengthened"
              : isRecipeStrengthened && recipeStrengthening?.passed
                ? "recipe_strengthened"
                : "fixture_ready_for_review",
    redundancy_peers: known?.peers ?? [],
    limitations: limitationsFor(capability, fixture),
    visual_review_required: true,
    validation: validateDirectorShot(moment, actors),
  };
}
