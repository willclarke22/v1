import * as THREE from "three";

import {
  applyDirectorBlocking,
  sampleDirectorActorState,
  validateDirectorShot,
  type DirectorRuntimeActor,
} from "../scenes/ui/director-shot-runtime";
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

export const DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY: Record<
  string,
  {
    peers: string[];
    reason: string;
  }
> = {
  attach: {
    peers: ["follow_target"],
    reason:
      "Attach and Follow target currently share the same target-offset interpolation branch.",
  },
  follow_target: {
    peers: ["attach"],
    reason:
      "Follow target does not yet prove a persistent relationship to a moving target; it shares Attach's interpolation branch.",
  },
  align: {
    peers: ["aim_at"],
    reason:
      "Align and Aim at currently share the same yaw-to-target implementation instead of distinct axis-alignment semantics.",
  },
  aim_at: {
    peers: ["align"],
    reason:
      "Aim at currently shares Align's yaw-to-target implementation.",
  },
  spin: {
    peers: ["rotate"],
    reason:
      "Spin and Rotate share the same rotation branch and the current demo supplies the same one-turn parameter.",
  },
  scatter: {
    peers: ["move_away"],
    reason:
      "Scatter currently aliases to one actor using move_away instead of diverging several actors.",
  },
  insert_into: {
    peers: ["assemble", "merge"],
    reason:
      "Insert, Assemble, and Merge currently share one lerp-to-target transform branch.",
  },
  assemble: {
    peers: ["insert_into", "merge"],
    reason:
      "Assemble currently moves one actor to one target instead of coordinating several parts.",
  },
  merge: {
    peers: ["insert_into", "assemble"],
    reason:
      "Merge currently moves one actor to one target instead of converging represented actors or streams.",
  },
  remove_from: {
    peers: ["disassemble", "split"],
    reason:
      "Remove, Disassemble, and Split share one move-away branch; their topology semantics are not yet distinct.",
  },
  disassemble: {
    peers: ["remove_from", "split"],
    reason:
      "Disassemble currently separates one actor instead of preserving several component identities.",
  },
  split: {
    peers: ["remove_from", "disassemble"],
    reason:
      "Split currently moves one represented actor away rather than producing multiple spatially distinct results.",
  },
  flow: {
    peers: ["emit"],
    reason:
      "Flow and Emit currently share the same upward-translation plus scale transform.",
  },
  emit: {
    peers: ["flow"],
    reason:
      "Emit currently shares Flow's transform instead of originating multiple carriers/signals from a source.",
  },
  fill: {
    peers: ["accumulate"],
    reason:
      "Fill and Accumulate currently share the same scale-up proxy instead of distinct occupied-volume versus build-up semantics.",
  },
  accumulate: {
    peers: ["fill"],
    reason:
      "Accumulate currently shares Fill's scale-up proxy instead of visibly adding quantity at a region.",
  },
};

export type DirectorObjectMotionFidelityCheck = {
  id: string;
  description: string;
  passed: boolean;
  measured: string;
  kind: "finite" | "regression_canary" | "redundancy_diagnostic";
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
  | "fixture_ready_for_review"
  | "needs_semantic_strengthening";

export type DirectorObjectMotionFidelityReport = {
  schema_version: typeof DIRECTOR_OBJECT_MOTION_FIDELITY_VERSION;
  capability_id: string;
  support_level: DirectorCapability["compiler"]["threejs"];
  fixture: DirectorAuditFixtureKind;
  controlled_geometry: true;
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
      "The controlled door fixture makes the pivot/state transition judgeable, but arbitrary real GLBs still need semantic hinge/pivot metadata for faithful articulation.",
    );
  }
  if (fixture === "object_motion_containment") {
    limitations.push(
      "The controlled peg/socket fixture makes containment direction judgeable; final fit, clearance, and allowed intersection remain Asset Scene Builder geometry responsibilities.",
    );
  }
  if (fixture === "object_motion_multi_part") {
    limitations.push(
      "The fixture deliberately exposes when one rigid actor is being used where the capability promises several independently directed parts.",
    );
  }
  if (fixture === "object_motion_process") {
    limitations.push(
      "The process fixture distinguishes container/source/route context, but Three.js quantity/particle semantics are still proxies until the next strengthening pass.",
    );
  }

  return limitations;
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
  const checks = [finiteCheck(samples)];
  const canary = canaryCheck(capability, actors, samples);
  if (canary) checks.push(canary);
  const redundancy = redundancyCheck(capability);
  if (redundancy) checks.push(redundancy);

  const known =
    DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY[capability.id];
  const isCanary = (
    DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES as readonly string[]
  ).includes(capability.id);
  const canaryPassed =
    !canary || canary.passed;

  return {
    schema_version: DIRECTOR_OBJECT_MOTION_FIDELITY_VERSION,
    capability_id: capability.id,
    support_level: capability.compiler.threejs,
    fixture,
    controlled_geometry: true,
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
          : "fixture_ready_for_review",
    redundancy_peers: known?.peers ?? [],
    limitations: limitationsFor(capability, fixture),
    visual_review_required: true,
    validation: validateDirectorShot(moment, actors),
  };
}
