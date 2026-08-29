"use client";

import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type {
  DirectorCameraMovementStep,
  DirectorEvent,
  DirectorMoment,
  DirectorShotDirectionV2,
} from "../../director";
import {
  assertDirectorRuntimeNever,
  directorCameraMovementRuntimeAlias,
} from "../director-runtime-coverage";
import {
  compileDirectorActorMotionProgram,
  sampleCompiledDirectorActorMotionProgram,
} from "../../motion-program/director-motion-program-compiler";
import type {
  MotionProgramProcessSample,
} from "../../motion-program/motion-program-contract";
import {
  directorSceneStateActorVisible,
  resolveDirectorActorWithSceneState,
  type DirectorSceneState,
} from "../../motion-program/director-scene-state";
import {
  directorSceneStateBeforeMoment,
} from "../../motion-program/director-scene-state-reducer";
import type {
  AssetDirectabilityProfileV1,
} from "../../directability";

export type DirectorRuntimeVec3 = [number, number, number];

export type DirectorRuntimeActor = {
  id: string;
  position: DirectorRuntimeVec3;
  rotation?: DirectorRuntimeVec3;
  size: DirectorRuntimeVec3;
  directability?: AssetDirectabilityProfileV1 | null;
};

export type DirectorActorSample = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  /** Incoming/cross-moment visibility state; current-shot presentation events remain presentation-owned. */
  visible?: boolean;
  /** Renderer-neutral Phase 1B.4.6 process output; root transform remains independent. */
  process?: MotionProgramProcessSample;
};

export type DirectorCameraPose = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
};

export type DirectorShotValidation = {
  sample_count: number;
  camera_path_clear: boolean;
  minimum_camera_clearance_m: number;
  required_visible_fraction: number;
  approximate_occlusion_ratio: number;
  approximate_actor_collision_ratio: number;
  actor_motion_clear: boolean;
  required_visible_entity_ids: string[];
  warnings: string[];
};

const UP = new THREE.Vector3(0, 1, 0);

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function numberParam(
  value: unknown,
  fallback: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vecParam(
  value: unknown,
  fallback: DirectorRuntimeVec3,
): THREE.Vector3 {
  if (Array.isArray(value) && value.length >= 3) {
    return new THREE.Vector3(
      numberParam(value[0], fallback[0]),
      numberParam(value[1], fallback[1]),
      numberParam(value[2], fallback[2]),
    );
  }
  return new THREE.Vector3(...fallback);
}

function easeValue(
  value: number,
  easing: DirectorCameraMovementStep["easing"] | DirectorEvent["easing"] = "ease_in_out",
) {
  const t = clamp01(value);
  if (easing === "linear") return t;
  if (easing === "ease_in") return t * t;
  if (easing === "ease_out") return 1 - (1 - t) * (1 - t);
  if (easing === "step") return t >= 1 ? 1 : 0;
  if (easing === "spring") {
    const damped = 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 4.5);
    return THREE.MathUtils.clamp(damped, 0, 1.08);
  }
  return t * t * (3 - 2 * t);
}

function actorById(
  actors: DirectorRuntimeActor[],
  id: string | null | undefined,
) {
  return id ? actors.find((actor) => actor.id === id) ?? null : null;
}

function actorRadius(actor: DirectorRuntimeActor) {
  const [x, y, z] = actor.size.map((value) => Math.max(0.02, Math.abs(value))) as DirectorRuntimeVec3;
  return Math.max(0.12, Math.sqrt(x * x + y * y + z * z) * 0.34);
}


type DirectorBlockingCompositionBasis = {
  center: THREE.Vector3;
  view_forward: THREE.Vector3;
  view_right: THREE.Vector3;
  stage_spread_m: number;
};

function directorBlockingCompositionBasis(
  moment: DirectorMoment,
  actors: DirectorRuntimeActor[],
): DirectorBlockingCompositionBasis {
  const center = actors.length
    ? actors.reduce(
        (sum, actor) => sum.add(new THREE.Vector3(...actor.position)),
        new THREE.Vector3(),
      ).multiplyScalar(1 / actors.length)
    : new THREE.Vector3();

  // Blocking words such as screen_left / foreground are perceptual camera-space
  // instructions. Resolve the stable opening camera before mutating the actors;
  // do not silently reinterpret them as world +/-X or +/-Z.
  const openingPose = sampleDirectorCameraPose(moment, 0, actors);
  const basis = stableViewBasis(openingPose.position, openingPose.target);

  const viewRight = basis.right.clone();
  viewRight.y = 0;
  if (viewRight.lengthSq() < 0.000001) viewRight.set(1, 0, 0);
  else viewRight.normalize();

  const viewForward = basis.forward.clone();
  viewForward.y = 0;
  if (viewForward.lengthSq() < 0.000001) {
    // A perfectly top-down view has no useful ground-plane depth axis. Keep
    // grounded blocking deterministic rather than lifting actors toward camera.
    viewForward.set(-viewRight.z, 0, viewRight.x);
  }
  viewForward.normalize();

  let stageSpreadM = 1.2;
  for (const actor of actors) {
    const delta = new THREE.Vector3(...actor.position).sub(center);
    delta.y = 0;
    stageSpreadM = Math.max(
      stageSpreadM,
      delta.length() + actorRadius(actor) * 0.45,
    );
  }

  return {
    center,
    view_forward: viewForward,
    view_right: viewRight,
    stage_spread_m: stageSpreadM,
  };
}

function setCompositionCoordinate(
  position: THREE.Vector3,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  coordinate: number,
) {
  const current = position.clone().sub(center).dot(axis);
  position.addScaledVector(axis, coordinate - current);
}

function applyBlockingScreenRegion(
  cue: DirectorShotDirectionV2["blocking"][number],
  position: THREE.Vector3,
  basis: DirectorBlockingCompositionBasis,
  actorRadiusValue: number,
) {
  if (!cue.screen_region) return;
  if (!["foreground", "midground", "background", "screen_left", "screen_right"].includes(cue.relation)) return;

  const lateral = Math.max(
    1.45,
    basis.stage_spread_m * 0.68,
    actorRadiusValue * 1.55,
  );

  switch (cue.screen_region) {
    case "left_third":
      setCompositionCoordinate(position, basis.center, basis.view_right, -lateral);
      break;
    case "right_third":
      setCompositionCoordinate(position, basis.center, basis.view_right, lateral);
      break;
    case "center_left":
      setCompositionCoordinate(position, basis.center, basis.view_right, -lateral * 0.5);
      break;
    case "center_right":
      setCompositionCoordinate(position, basis.center, basis.view_right, lateral * 0.5);
      break;
    case "center":
      setCompositionCoordinate(position, basis.center, basis.view_right, 0);
      break;
    default:
      // Other screen regions are composition/camera concerns rather than
      // blocking-placement instructions in this runtime.
      break;
  }
}


const DIRECTOR_RELATIVE_ACTOR_RELATIONS = [
  "beside",
  "in_front_of",
  "behind",
  "between",
  "facing",
  "facing_away",
] as const;

type DirectorRelativeActorRelation =
  (typeof DIRECTOR_RELATIVE_ACTOR_RELATIONS)[number];

function isDirectorRelativeActorRelation(
  relation: DirectorShotDirectionV2["blocking"][number]["relation"],
): relation is DirectorRelativeActorRelation {
  return (DIRECTOR_RELATIVE_ACTOR_RELATIONS as readonly string[]).includes(
    relation,
  );
}

function directorRelativeGroundRadius(actor: DirectorRuntimeActor) {
  const width = Math.max(0.04, Math.abs(actor.size[0]));
  const depth = Math.max(0.04, Math.abs(actor.size[2]));
  return Math.max(0.16, Math.hypot(width, depth) * 0.5);
}

function directorRelativeStaticSample(actor: DirectorRuntimeActor): DirectorActorSample {
  return {
    position: new THREE.Vector3(...actor.position),
    rotation: new THREE.Euler(...(actor.rotation ?? [0, 0, 0]), "XYZ"),
    scale: new THREE.Vector3(1, 1, 1),
    visible: true,
  };
}

function directorRelativeProjectedPairReadability(
  moment: DirectorMoment,
  actors: DirectorRuntimeActor[],
  left: DirectorRuntimeActor,
  right: DirectorRuntimeActor,
) {
  const pose = sampleDirectorCameraPose(moment, 0, actors);
  const leftEnvelope = projectActorEnvelopeAgainstPose(
    pose,
    left,
    directorRelativeStaticSample(left),
  );
  const rightEnvelope = projectActorEnvelopeAgainstPose(
    pose,
    right,
    directorRelativeStaticSample(right),
  );
  const overlapWidth = Math.max(
    0,
    Math.min(leftEnvelope.max_ndc_x, rightEnvelope.max_ndc_x) -
      Math.max(leftEnvelope.min_ndc_x, rightEnvelope.min_ndc_x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(leftEnvelope.max_ndc_y, rightEnvelope.max_ndc_y) -
      Math.max(leftEnvelope.min_ndc_y, rightEnvelope.min_ndc_y),
  );
  const overlapArea = overlapWidth * overlapHeight;
  const leftArea = Math.max(
    0.000001,
    leftEnvelope.width_ndc * leftEnvelope.height_ndc,
  );
  const rightArea = Math.max(
    0.000001,
    rightEnvelope.width_ndc * rightEnvelope.height_ndc,
  );
  const horizontalGap = Math.max(
    0,
    rightEnvelope.min_ndc_x - leftEnvelope.max_ndc_x,
    leftEnvelope.min_ndc_x - rightEnvelope.max_ndc_x,
  );
  return {
    overlap_ratio: overlapArea / Math.min(leftArea, rightArea),
    horizontal_gap_ndc: horizontalGap,
  };
}

function directorRelativeReferenceActors(
  cue: DirectorShotDirectionV2["blocking"][number],
  actors: DirectorRuntimeActor[],
) {
  const requested = cue.parameters?.reference_entity_ids;
  const ids = Array.isArray(requested)
    ? requested.filter((value): value is string => typeof value === "string")
    : [];
  const fallback = [
    cue.target_entity_id,
    ...actors
      .filter((actor) => actor.id !== cue.actor_entity_id)
      .map((actor) => actor.id),
  ].filter((value): value is string => typeof value === "string");

  return [...new Set([...ids, ...fallback])]
    .map((id) => actors.find((actor) => actor.id === id) ?? null)
    .filter((actor): actor is DirectorRuntimeActor => Boolean(actor))
    .slice(0, 2);
}

function setDirectorRelativeCoordinates(
  position: THREE.Vector3,
  targetPosition: THREE.Vector3,
  basis: DirectorBlockingCompositionBasis,
  rightOffset: number,
  forwardOffset: number,
) {
  const targetDelta = targetPosition.clone().sub(basis.center);
  const targetRight = targetDelta.dot(basis.view_right);
  const targetForward = targetDelta.dot(basis.view_forward);
  setCompositionCoordinate(
    position,
    basis.center,
    basis.view_right,
    targetRight + rightOffset,
  );
  setCompositionCoordinate(
    position,
    basis.center,
    basis.view_forward,
    targetForward + forwardOffset,
  );
}

function applyDirectorRelativeActorPlacement(
  moment: DirectorMoment,
  cue: DirectorShotDirectionV2["blocking"][number],
  actors: DirectorRuntimeActor[],
  basis: DirectorBlockingCompositionBasis,
) {
  if (!isDirectorRelativeActorRelation(cue.relation)) return;
  const actor = actors.find((candidate) => candidate.id === cue.actor_entity_id);
  if (!actor) return;
  const target = cue.target_entity_id
    ? actors.find((candidate) => candidate.id === cue.target_entity_id) ?? null
    : null;
  const position = new THREE.Vector3(...actor.position);

  if (cue.relation === "between") {
    const references = directorRelativeReferenceActors(cue, actors);
    if (references.length < 2) return;
    position.lerpVectors(
      new THREE.Vector3(...references[0]!.position),
      new THREE.Vector3(...references[1]!.position),
      0.5,
    );
    actor.position = [position.x, position.y, position.z];
    return;
  }

  if (!target) return;
  const targetPosition = new THREE.Vector3(...target.position);

  if (cue.relation === "facing" || cue.relation === "facing_away") {
    const delta = targetPosition.clone().sub(position);
    delta.y = 0;
    if (delta.lengthSq() < 0.000001) return;
    const facingYaw = Math.atan2(delta.x, delta.z);
    actor.rotation = [
      actor.rotation?.[0] ?? 0,
      facingYaw + (cue.relation === "facing_away" ? Math.PI : 0),
      actor.rotation?.[2] ?? 0,
    ];
    return;
  }

  const actorGroundRadius = directorRelativeGroundRadius(actor);
  const targetGroundRadius = directorRelativeGroundRadius(target);
  const clearance = cue.preserve_clearance ? 0.55 : 0.24;
  const separation = actorGroundRadius + targetGroundRadius + clearance;

  if (cue.relation === "beside") {
    setDirectorRelativeCoordinates(
      position,
      targetPosition,
      basis,
      separation,
      0,
    );
    actor.position = [position.x, position.y, position.z];

    // World-space non-intersection is not enough for an adjacent visual proof.
    // Widen only along opening-camera view-right until the projected box
    // envelopes have visible air between them. The solved camera is recomputed
    // at each bounded step, so the check follows the actual two-shot framing.
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const readability = directorRelativeProjectedPairReadability(
        moment,
        actors,
        actor,
        target,
      );
      if (
        readability.overlap_ratio <= 0.03 &&
        readability.horizontal_gap_ndc >= 0.035
      ) {
        break;
      }
      position.addScaledVector(
        basis.view_right,
        Math.max(0.12, actorGroundRadius * 0.16) + iteration * 0.025,
      );
      actor.position = [position.x, position.y, position.z];
    }
    return;
  }

  const depthSign = cue.relation === "in_front_of" ? -1 : 1;
  const lateralSign = cue.relation === "in_front_of" ? 1 : -1;
  const peek = Math.max(
    0.28,
    Math.min(actorGroundRadius, targetGroundRadius) * 0.58,
  );
  setDirectorRelativeCoordinates(
    position,
    targetPosition,
    basis,
    lateralSign * peek,
    depthSign * separation,
  );
  actor.position = [position.x, position.y, position.z];

  // Front/behind should communicate depth without turning the rear actor into an
  // accidental full eclipse. If approximate projected envelopes are still too
  // coincident, increase only the lateral peek; signed camera-relative depth is
  // preserved exactly.
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const readability = directorRelativeProjectedPairReadability(
      moment,
      actors,
      actor,
      target,
    );
    if (readability.overlap_ratio <= 0.58) break;
    position.addScaledVector(
      basis.view_right,
      lateralSign * (0.14 + iteration * 0.035),
    );
    actor.position = [position.x, position.y, position.z];
  }
}


const DIRECTOR_GROUP_FORMATION_RELATIONS = [
  "surround",
  "form_line",
  "form_circle",
  "cluster",
  "symmetrical_pair",
] as const;

type DirectorGroupFormationRelation =
  (typeof DIRECTOR_GROUP_FORMATION_RELATIONS)[number];

function isDirectorGroupFormationRelation(
  relation: DirectorShotDirectionV2["blocking"][number]["relation"],
): relation is DirectorGroupFormationRelation {
  return (DIRECTOR_GROUP_FORMATION_RELATIONS as readonly string[]).includes(
    relation,
  );
}

function directorGroupFormationParticipantIds(
  shot: DirectorShotDirectionV2,
  cue: DirectorShotDirectionV2["blocking"][number],
  actors: DirectorRuntimeActor[],
) {
  const rawParticipantIds = cue.parameters?.participant_entity_ids;
  const explicit = Array.isArray(rawParticipantIds)
    ? rawParticipantIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const candidates = [
    ...explicit,
    cue.actor_entity_id,
    cue.target_entity_id,
    ...shot.composition.keep_visible_entity_ids,
    ...shot.camera.focus_entity_ids,
  ];
  const available = new Set(actors.map((actor) => actor.id));
  const selected: string[] = [];

  for (const id of candidates) {
    if (!id || !available.has(id) || selected.includes(id)) continue;
    selected.push(id);
  }

  const minimum = cue.relation === "symmetrical_pair" ? 2 : 3;
  if (selected.length < minimum) {
    for (const actor of actors) {
      if (selected.includes(actor.id)) continue;
      selected.push(actor.id);
      if (selected.length >= minimum) break;
    }
  }

  return cue.relation === "symmetrical_pair"
    ? selected.slice(0, 2)
    : selected;
}

function directorFormationGroundRadius(actor: DirectorRuntimeActor) {
  const width = Math.max(0.04, Math.abs(actor.size[0]));
  const depth = Math.max(0.04, Math.abs(actor.size[2]));
  return Math.max(0.16, Math.hypot(width, depth) * 0.5);
}

function directorFormationCenter(actors: DirectorRuntimeActor[]) {
  if (!actors.length) return new THREE.Vector3();
  const center = actors.reduce(
    (sum, actor) => sum.add(new THREE.Vector3(...actor.position)),
    new THREE.Vector3(),
  ).multiplyScalar(1 / actors.length);
  center.y = 0;
  return center;
}

function setDirectorFormationPlanePosition(
  actor: DirectorRuntimeActor,
  center: THREE.Vector3,
  basis: DirectorBlockingCompositionBasis,
  rightCoordinate: number,
  forwardCoordinate: number,
) {
  const position = new THREE.Vector3(...actor.position);
  setCompositionCoordinate(
    position,
    center,
    basis.view_right,
    rightCoordinate,
  );
  setCompositionCoordinate(
    position,
    center,
    basis.view_forward,
    forwardCoordinate,
  );
  actor.position = [position.x, actor.position[1], position.z];
}

function directorFormationPairGap(
  left: DirectorRuntimeActor,
  right: DirectorRuntimeActor,
  extraGapM: number,
) {
  return (
    directorFormationGroundRadius(left) +
    directorFormationGroundRadius(right) +
    extraGapM
  );
}

function directorFormationScreenLateralHalfWidth(actor: DirectorRuntimeActor) {
  // A conservative camera-relative silhouette proxy for formation packing. The
  // actor's ground-plane diagonal survives arbitrary yaw better than raw world-X
  // width and prevents a broad object placed deeper in the cluster from hiding
  // behind another actor that shares nearly the same screen column.
  return Math.max(0.18, directorFormationGroundRadius(actor) * 0.72);
}

function directorFormationScreenLateralOverlapRatio(
  actor: DirectorRuntimeActor,
  actorRight: number,
  placedActor: DirectorRuntimeActor,
  placedRight: number,
) {
  const actorHalf = directorFormationScreenLateralHalfWidth(actor);
  const placedHalf = directorFormationScreenLateralHalfWidth(placedActor);
  const overlap = Math.max(
    0,
    Math.min(actorRight + actorHalf, placedRight + placedHalf) -
      Math.max(actorRight - actorHalf, placedRight - placedHalf),
  );
  return overlap / Math.max(0.001, Math.min(actorHalf * 2, placedHalf * 2));
}


function directorFormationMaximumProjectedEnvelopeOverlap(
  moment: DirectorMoment,
  actors: DirectorRuntimeActor[],
  participants: DirectorRuntimeActor[],
) {
  if (participants.length < 2) return 0;
  const pose = sampleDirectorCameraPose(moment, 0, actors);
  const envelopes = participants.map((actor) =>
    projectActorEnvelopeAgainstPose(
      pose,
      actor,
      sampleDirectorActorState(moment, actor, 0, actors),
    ),
  );
  let maximum = 0;

  for (let leftIndex = 0; leftIndex < envelopes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < envelopes.length; rightIndex += 1) {
      const left = envelopes[leftIndex]!;
      const right = envelopes[rightIndex]!;
      const overlapWidth = Math.max(
        0,
        Math.min(left.max_ndc_x, right.max_ndc_x) -
          Math.max(left.min_ndc_x, right.min_ndc_x),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(left.max_ndc_y, right.max_ndc_y) -
          Math.max(left.min_ndc_y, right.min_ndc_y),
      );
      const overlapArea = overlapWidth * overlapHeight;
      const leftArea = Math.max(0.000001, left.width_ndc * left.height_ndc);
      const rightArea = Math.max(0.000001, right.width_ndc * right.height_ndc);
      maximum = Math.max(
        maximum,
        overlapArea / Math.min(leftArea, rightArea),
      );
    }
  }

  return maximum;
}

function directorClusterPreferredAngle(index: number, searchStep: number) {
  // The first two supports form a compact camera-readable wedge around the
  // centre actor instead of stacking directly in front/behind it. Additional
  // participants continue around alternating sectors, while the local search
  // can rotate around each preferred sector to preserve physical clearance.
  const preferred = [
    Math.PI / 3,
    (Math.PI * 2) / 3,
    (Math.PI * 3) / 2,
    (Math.PI * 11) / 6,
    (Math.PI * 7) / 6,
    Math.PI / 2,
  ];
  const base = preferred[(index - 1) % preferred.length]!;
  if (searchStep === 0) return base;
  const distance = Math.ceil(searchStep / 2);
  const direction = searchStep % 2 === 1 ? 1 : -1;
  return base + direction * distance * (Math.PI / 18);
}

function applyDirectorGroupFormation(
  moment: DirectorMoment,
  shot: DirectorShotDirectionV2,
  cue: DirectorShotDirectionV2["blocking"][number],
  actors: DirectorRuntimeActor[],
  basis: DirectorBlockingCompositionBasis,
) {
  if (!isDirectorGroupFormationRelation(cue.relation)) return;

  const participantIds = directorGroupFormationParticipantIds(
    shot,
    cue,
    actors,
  );
  const participants = participantIds
    .map((id) => actors.find((actor) => actor.id === id) ?? null)
    .filter((actor): actor is DirectorRuntimeActor => Boolean(actor));
  if (participants.length < 2) return;

  const center = directorFormationCenter(participants);

  if (cue.relation === "surround") {
    const requestedCenterId =
      typeof cue.parameters?.center_entity_id === "string"
        ? cue.parameters.center_entity_id
        : cue.actor_entity_id;
    const centerActor =
      participants.find((actor) => actor.id === requestedCenterId) ??
      participants[0]!;
    const supporters = participants.filter(
      (actor) => actor.id !== centerActor.id,
    );

    setDirectorFormationPlanePosition(centerActor, center, basis, 0, 0);
    if (!supporters.length) return;

    const centerRadius = directorFormationGroundRadius(centerActor);
    const widestSupport = Math.max(
      ...supporters.map((actor) => directorFormationGroundRadius(actor)),
    );
    const supportChordNeed = supporters.length > 1
      ? Math.max(
          ...supporters.flatMap((left, leftIndex) =>
            supporters
              .slice(leftIndex + 1)
              .map((right) => directorFormationPairGap(left, right, 0.5)),
          ),
          0,
        )
      : 0;
    const supportAngularGap =
      supporters.length === 2
        ? (Math.PI * 2) / 3
        : (Math.PI * 2) / supporters.length;
    const chordDenominator =
      2 * Math.max(0.2, Math.sin(supportAngularGap / 2));
    const ringRadius = Math.max(
      1.65,
      centerRadius + widestSupport + 0.62,
      supportChordNeed / chordDenominator,
    );

    supporters.forEach((actor, index) => {
      const angle =
        supporters.length === 2
          ? Math.PI / 6 + index * supportAngularGap
          : (index / supporters.length) * Math.PI * 2;
      setDirectorFormationPlanePosition(
        actor,
        center,
        basis,
        Math.cos(angle) * ringRadius,
        Math.sin(angle) * ringRadius,
      );
    });
    return;
  }

  if (cue.relation === "form_line") {
    const ordered = [...participants].sort((left, right) => {
      const leftProjection = new THREE.Vector3(...left.position)
        .sub(center)
        .dot(basis.view_right);
      const rightProjection = new THREE.Vector3(...right.position)
        .sub(center)
        .dot(basis.view_right);
      return leftProjection - rightProjection;
    });
    const coordinates = [0];
    for (let index = 1; index < ordered.length; index += 1) {
      coordinates.push(
        coordinates[index - 1]! +
          directorFormationPairGap(
            ordered[index - 1]!,
            ordered[index]!,
            0.52,
          ),
      );
    }
    const offset =
      ((coordinates[0] ?? 0) +
        (coordinates[coordinates.length - 1] ?? 0)) /
      2;

    ordered.forEach((actor, index) => {
      setDirectorFormationPlanePosition(
        actor,
        center,
        basis,
        coordinates[index]! - offset,
        0,
      );
    });
    return;
  }

  if (cue.relation === "form_circle") {
    if (participants.length < 3) return;
    const pairNeed = Math.max(
      ...participants.flatMap((left, leftIndex) =>
        participants
          .slice(leftIndex + 1)
          .map((right) => directorFormationPairGap(left, right, 0.48)),
      ),
      0,
    );
    const chordDenominator =
      2 * Math.max(0.2, Math.sin(Math.PI / participants.length));
    const radius = Math.max(
      1.75,
      pairNeed / chordDenominator,
      Math.max(...participants.map(directorFormationGroundRadius)) * 1.8,
    );
    const startAngle = Math.PI / 2;

    participants.forEach((actor, index) => {
      const angle =
        startAngle + (index / participants.length) * Math.PI * 2;
      setDirectorFormationPlanePosition(
        actor,
        center,
        basis,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    });
    return;
  }

  if (cue.relation === "cluster") {
    const placements: Array<{ actor: DirectorRuntimeActor; x: number; z: number }> = [];
    const angularSteps = 18;
    const maximumLateralOverlapRatio = 0.24;

    participants.forEach((actor, index) => {
      if (index === 0) {
        placements.push({ actor, x: 0, z: 0 });
        return;
      }

      const actorRadiusValue = directorFormationGroundRadius(actor);
      let chosen: { x: number; z: number } | null = null;
      const minimumRing = Math.max(
        0.35,
        ...placements.map(
          (placed) =>
            actorRadiusValue +
            directorFormationGroundRadius(placed.actor) +
            0.34,
        ),
      );

      for (let ring = 0; ring < 18 && !chosen; ring += 1) {
        const radius = minimumRing + ring * 0.22;
        for (let step = 0; step < angularSteps; step += 1) {
          const angle = directorClusterPreferredAngle(index, step);
          const candidate = {
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
          };
          const clear = placements.every((placed) => {
            const required = directorFormationPairGap(
              actor,
              placed.actor,
              0.28,
            );
            return (
              Math.hypot(
                candidate.x - placed.x,
                candidate.z - placed.z,
              ) >= required
            );
          });
          if (!clear) continue;

          const screenReadable = placements.every(
            (placed) =>
              directorFormationScreenLateralOverlapRatio(
                actor,
                candidate.x,
                placed.actor,
                placed.x,
              ) <= maximumLateralOverlapRatio,
          );
          if (screenReadable) {
            chosen = candidate;
            break;
          }
        }
      }

      placements.push({
        actor,
        x: chosen?.x ?? minimumRing * index,
        z: chosen?.z ?? 0,
      });
    });

    const meanX =
      placements.reduce((sum, item) => sum + item.x, 0) /
      placements.length;
    const meanZ =
      placements.reduce((sum, item) => sum + item.z, 0) /
      placements.length;

    placements.forEach((item) => {
      setDirectorFormationPlanePosition(
        item.actor,
        center,
        basis,
        item.x - meanX,
        item.z - meanZ,
      );
    });

    // Ground-plane clearance is necessary but not sufficient: a broad object can
    // still sit almost completely behind another actor from the solved camera.
    // Use the real Director projected box envelopes as a final readability gate.
    // If overlap is excessive, widen only the camera-relative lateral component
    // in bounded steps; this preserves the compact wedge/depth relationship while
    // making individual members visually recoverable.
    const maximumProjectedOverlapRatio = 0.42;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const projectedOverlap = directorFormationMaximumProjectedEnvelopeOverlap(
        moment,
        actors,
        participants,
      );
      if (projectedOverlap <= maximumProjectedOverlapRatio) break;

      for (const actor of participants) {
        const position = new THREE.Vector3(...actor.position);
        const delta = position.clone().sub(center);
        const rightCoordinate = delta.dot(basis.view_right);
        const forwardCoordinate = delta.dot(basis.view_forward);
        setDirectorFormationPlanePosition(
          actor,
          center,
          basis,
          rightCoordinate * 1.12,
          forwardCoordinate,
        );
      }
    }
    return;
  }

  const pair = participants.slice(0, 2);
  if (pair.length < 2) return;
  const separation = directorFormationPairGap(pair[0]!, pair[1]!, 0.68);
  setDirectorFormationPlanePosition(
    pair[0]!,
    center,
    basis,
    -separation / 2,
    0,
  );
  setDirectorFormationPlanePosition(
    pair[1]!,
    center,
    basis,
    separation / 2,
    0,
  );
}


const DIRECTOR_PHYSICAL_REGION_RELATIONS = [
  "on_surface",
  "inside",
  "attached_to",
] as const;

type DirectorPhysicalRegionRelation =
  (typeof DIRECTOR_PHYSICAL_REGION_RELATIONS)[number];

function isDirectorPhysicalRegionRelation(
  relation: DirectorShotDirectionV2["blocking"][number]["relation"],
): relation is DirectorPhysicalRegionRelation {
  return (DIRECTOR_PHYSICAL_REGION_RELATIONS as readonly string[]).includes(
    relation,
  );
}

export type DirectorPhysicalBlockingResolution = {
  status: "resolved" | "unresolved";
  relation: DirectorPhysicalRegionRelation;
  actor_entity_id: string;
  target_entity_id: string | null;
  region_kind: "support_surface" | "containment_region" | "surface_contact_region" | null;
  region_id: string | null;
  position: DirectorRuntimeVec3 | null;
  reason: string | null;
};

function directorPhysicalUniformScale(actor: DirectorRuntimeActor) {
  const bounds = actor.directability?.local_bounds_size;
  if (!bounds) return 1;
  const ratios = actor.size
    .map((value, index) => {
      const denominator = Math.max(0.0001, Math.abs(bounds[index] ?? 0));
      return Math.abs(value) / denominator;
    })
    .filter((value) => Number.isFinite(value) && value > 0.0001)
    .sort((left, right) => left - right);
  if (!ratios.length) return 1;
  return ratios[Math.floor(ratios.length / 2)] ?? ratios[0] ?? 1;
}

function directorPhysicalAdaptiveContainmentClearance(
  regionSize: readonly number[],
  preferredClearance: number,
) {
  const positive = regionSize
    .map((value) => Math.abs(Number(value) || 0))
    .filter((value) => value > 1e-6);
  const narrowest = positive.length ? Math.min(...positive) : 0;
  if (narrowest <= 0) return Math.max(0.0015, preferredClearance);
  return Math.min(
    Math.max(0.0015, preferredClearance),
    Math.max(0.0015, narrowest * 0.04),
  );
}

function directorPhysicalGroundLocalY(actor: DirectorRuntimeActor) {
  const contact = actor.directability?.anchors.find(
    (anchor) =>
      anchor.kind === "contact" &&
      anchor.semantic_names.some((name) =>
        ["bottom_contact", "ground_contact", "contact_anchor"].includes(
          name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        ),
      ),
  );
  return contact?.local_position[1] ?? 0;
}

function directorPhysicalLocalOffset(
  actor: DirectorRuntimeActor,
  localPosition: readonly number[],
) {
  const scaleValue = directorPhysicalUniformScale(actor);
  const groundY = directorPhysicalGroundLocalY(actor);
  const offset = new THREE.Vector3(
    numberParam(localPosition[0], 0) * scaleValue,
    (numberParam(localPosition[1], 0) - groundY) * scaleValue,
    numberParam(localPosition[2], 0) * scaleValue,
  );
  offset.applyEuler(
    new THREE.Euler(...(actor.rotation ?? [0, 0, 0]), "XYZ"),
  );
  return offset;
}

function directorPhysicalWorldPoint(
  actor: DirectorRuntimeActor,
  localPosition: readonly number[],
) {
  return new THREE.Vector3(...actor.position).add(
    directorPhysicalLocalOffset(actor, localPosition),
  );
}

function directorPhysicalWorldDirection(
  actor: DirectorRuntimeActor,
  localDirection: readonly number[] | null | undefined,
  fallback: THREE.Vector3,
) {
  const direction = localDirection
    ? new THREE.Vector3(
        numberParam(localDirection[0], fallback.x),
        numberParam(localDirection[1], fallback.y),
        numberParam(localDirection[2], fallback.z),
      )
    : fallback.clone();
  if (direction.lengthSq() < 0.000001) direction.copy(fallback);
  direction.normalize().applyEuler(
    new THREE.Euler(...(actor.rotation ?? [0, 0, 0]), "XYZ"),
  );
  if (direction.lengthSq() < 0.000001) return fallback.clone();
  return direction.normalize();
}

function directorPhysicalActorHalfExtentAlong(
  actor: DirectorRuntimeActor,
  worldAxis: THREE.Vector3,
) {
  const axis = worldAxis.clone().normalize();
  const rotation = new THREE.Euler(...(actor.rotation ?? [0, 0, 0]), "XYZ");
  const localAxes = [
    new THREE.Vector3(1, 0, 0).applyEuler(rotation),
    new THREE.Vector3(0, 1, 0).applyEuler(rotation),
    new THREE.Vector3(0, 0, 1).applyEuler(rotation),
  ];
  return localAxes.reduce(
    (sum, localAxis, index) =>
      sum +
      Math.abs(axis.dot(localAxis)) *
        Math.max(0.01, Math.abs(actor.size[index] ?? 0.01)) *
        0.5,
    0,
  );
}

function directorPhysicalSourceCenterOffset(actor: DirectorRuntimeActor) {
  return new THREE.Vector3(0, Math.max(0.01, Math.abs(actor.size[1])) * 0.5, 0)
    .applyEuler(new THREE.Euler(...(actor.rotation ?? [0, 0, 0]), "XYZ"));
}

export function directorPhysicalInsideAccessTravel(input: {
  available_span_m: number;
  actor_height_m: number;
  qualification_readability_near_opening: boolean;
}) {
  const availableSpan = Math.max(0, Number(input.available_span_m) || 0);
  const actorHeight = Math.max(0.01, Math.abs(Number(input.actor_height_m) || 0));
  if (availableSpan <= 0) return 0;

  if (input.qualification_readability_near_opening) {
    // availableSpan is the free centre-travel span after both source bounds and
    // clearance have been removed. Half of it is therefore the maximum safe
    // one-direction centre shift. Qualification uses 80% of that safe travel so
    // the contained actor reads through the opening without protruding outside.
    return availableSpan * 0.5 * 0.8;
  }

  // Preserve the established production placement when no qualification-only
  // readability flag is present.
  return Math.min(availableSpan * 0.18, actorHeight * 0.12);
}

function directorPhysicalUnresolved(
  relation: DirectorPhysicalRegionRelation,
  actorId: string,
  targetId: string | null,
  reason: string,
): DirectorPhysicalBlockingResolution {
  return {
    status: "unresolved",
    relation,
    actor_entity_id: actorId,
    target_entity_id: targetId,
    region_kind: null,
    region_id: null,
    position: null,
    reason,
  };
}

/**
 * Physical blocking requires measured object regions, not whole-object bounds.
 * This qualification/runtime bridge intentionally fails closed when the target
 * does not expose a usable support, containment, or exterior contact region.
 * For blocking-level Attached To, geometry-derived attachment anchors are treated
 * as generic surface-contact evidence only; this path does not claim semantic
 * connector mating. The production scene builder remains the final collision /
 * stability authority; the Director path only stops manufacturing obviously
 * false physical relations.
 */
export function resolveDirectorPhysicalBlockingPlacement(
  cue: DirectorShotDirectionV2["blocking"][number],
  actors: DirectorRuntimeActor[],
): DirectorPhysicalBlockingResolution | null {
  if (!isDirectorPhysicalRegionRelation(cue.relation)) return null;
  const relation = cue.relation;
  const actor = actorById(actors, cue.actor_entity_id);
  const target = actorById(actors, cue.target_entity_id);
  if (!actor) {
    return directorPhysicalUnresolved(
      relation,
      cue.actor_entity_id,
      cue.target_entity_id ?? null,
      "source_actor_missing",
    );
  }
  if (!target) {
    return directorPhysicalUnresolved(
      relation,
      actor.id,
      cue.target_entity_id ?? null,
      "target_actor_missing",
    );
  }
  const profile = target.directability;
  if (!profile) {
    return directorPhysicalUnresolved(
      relation,
      actor.id,
      target.id,
      "target_directability_missing",
    );
  }

  const clearance = cue.preserve_clearance === false ? 0.002 : 0.008;
  const targetScale = directorPhysicalUniformScale(target);

  if (relation === "on_surface") {
    const sourceWidth = Math.max(0.02, Math.abs(actor.size[0]));
    const sourceDepth = Math.max(0.02, Math.abs(actor.size[2]));
    const candidates = profile.surfaces
      .map((surface) => {
        const normal = directorPhysicalWorldDirection(
          target,
          surface.normal,
          UP,
        );
        const usable = surface.usable_size ?? surface.size;
        const surfaceWidth = Math.max(0.001, usable[0] * targetScale);
        const surfaceDepth = Math.max(0.001, usable[1] * targetScale);
        const fitsFootprint =
          (sourceWidth + clearance * 2 <= surfaceWidth &&
            sourceDepth + clearance * 2 <= surfaceDepth) ||
          (sourceWidth + clearance * 2 <= surfaceDepth &&
            sourceDepth + clearance * 2 <= surfaceWidth);
        const clearanceAbove =
          surface.clearance_above_m == null
            ? null
            : Math.max(0, surface.clearance_above_m * targetScale);
        const fitsClearance =
          clearanceAbove === null ||
          Math.max(0.02, Math.abs(actor.size[1])) + clearance <= clearanceAbove;
        const blocked = Math.max(0, Math.min(1, surface.blocked_fraction ?? 0));
        const upward = normal.dot(UP);
        const orientationEligible =
          surface.orientation == null ||
          surface.orientation === "upward" ||
          upward >= 0.45;
        const exposureEligible = surface.exposure !== "interior";
        const heightRatio =
          surface.height_ratio == null
            ? null
            : Math.max(0, Math.min(1, surface.height_ratio));
        const area = surfaceWidth * surfaceDepth;
        return {
          surface,
          normal,
          fits: fitsFootprint && fitsClearance,
          eligible: orientationEligible && exposureEligible && blocked <= 0.72,
          score:
            (fitsFootprint && fitsClearance ? 1000 : 0) +
            Math.max(0, upward) * 120 +
            Math.max(0, surface.confidence) * 130 +
            Math.sqrt(Math.max(0, area)) * 18 +
            (surface.is_primary ? 24 : 0) +
            (heightRatio ?? 0.5) * 12 -
            blocked * 70 -
            Math.max(0, surface.vertical_rank ?? 0) * 2,
        };
      })
      .filter((candidate) => candidate.fits && candidate.eligible && candidate.normal.dot(UP) >= 0.35)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.surface.id.localeCompare(right.surface.id),
      );
    const selected = candidates[0];
    if (!selected) {
      return directorPhysicalUnresolved(
        relation,
        actor.id,
        target.id,
        "no_measured_support_surface_fits_source",
      );
    }
    const supportPoint = directorPhysicalWorldPoint(
      target,
      selected.surface.local_center,
    ).addScaledVector(selected.normal, clearance);
    return {
      status: "resolved",
      relation,
      actor_entity_id: actor.id,
      target_entity_id: target.id,
      region_kind: "support_surface",
      region_id: selected.surface.id,
      position: [supportPoint.x, supportPoint.y, supportPoint.z],
      reason: null,
    };
  }

  if (relation === "inside") {
    const sourceSize = actor.size.map((value) => Math.max(0.02, Math.abs(value)));
    const candidates = profile.containment_regions
      .map((region) => {
        const size = region.size.map((value) =>
          Math.max(0.001, Math.abs(value) * targetScale),
        );
        const containmentClearance =
          directorPhysicalAdaptiveContainmentClearance(size, clearance);
        const fits = sourceSize.every(
          (value, index) =>
            value + containmentClearance * 2 <= (size[index] ?? 0),
        );
        const explicitlyOpen =
          region.openness === "open" ||
          (region.openness == null &&
            region.semantic_names.some((name) =>
              name.toLowerCase().replace(/[^a-z0-9]+/g, "_") ===
              "fillable_region",
            ));
        const visiblyAccessible =
          explicitlyOpen &&
          Boolean(region.access_direction) &&
          region.confidence >= 0.45 &&
          region.exposure !== "exterior";
        return {
          region,
          size,
          containmentClearance,
          fits,
          visiblyAccessible,
          score:
            (fits ? 1000 : 0) +
            (visiblyAccessible ? 100 : 0) +
            Math.max(0, region.confidence) * 140 +
            Math.cbrt(Math.max(0.000001, size[0]! * size[1]! * size[2]!)) * 14,
        };
      })
      .filter((candidate) => candidate.fits && candidate.visiblyAccessible)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.region.id.localeCompare(right.region.id),
      );
    const selected = candidates[0];
    if (!selected) {
      return directorPhysicalUnresolved(
        relation,
        actor.id,
        target.id,
        "no_measured_containment_region_fits_source",
      );
    }
    const center = directorPhysicalWorldPoint(target, selected.region.local_center);
    const access = directorPhysicalWorldDirection(
      target,
      selected.region.access_direction,
      UP,
    );
    const availableVertical = Math.max(
      0,
      selected.size[1]! -
        Math.abs(actor.size[1]) -
        selected.containmentClearance * 2,
    );
    if (access.dot(UP) > 0.35 && availableVertical > 0) {
      const qualificationReadabilityNearOpening =
        cue.parameters?.physical_containment_readability_near_opening === true;
      center.addScaledVector(
        access,
        directorPhysicalInsideAccessTravel({
          available_span_m: availableVertical,
          actor_height_m: actor.size[1],
          qualification_readability_near_opening:
            qualificationReadabilityNearOpening,
        }),
      );
    }
    const root = center.sub(directorPhysicalSourceCenterOffset(actor));
    return {
      status: "resolved",
      relation,
      actor_entity_id: actor.id,
      target_entity_id: target.id,
      region_kind: "containment_region",
      region_id: selected.region.id,
      position: [root.x, root.y, root.z],
      reason: null,
    };
  }

  const sourceContact = actor.size
    .map((value) => Math.max(0.02, Math.abs(value)))
    .sort((left, right) => left - right)
    .slice(0, 2);
  const attachmentCandidates = profile.anchors
    .filter(
      (anchor) =>
        anchor.kind === "attachment" &&
        Boolean(anchor.local_normal) &&
        anchor.confidence >= 0.35,
    )
    .map((anchor) => {
      const normal = directorPhysicalWorldDirection(
        target,
        anchor.local_normal,
        new THREE.Vector3(1, 0, 0),
      );
      const contactSize = anchor.contact_size
        ? [
            Math.max(0.001, anchor.contact_size[0] * targetScale),
            Math.max(0.001, anchor.contact_size[1] * targetScale),
          ].sort((left, right) => left - right)
        : null;
      const genericMeasuredContactFits =
        anchor.source !== "geometry_profile" ||
        Boolean(
          contactSize &&
            sourceContact[0]! * 0.42 + clearance <= contactSize[0]! &&
            sourceContact[1]! * 0.42 + clearance <= contactSize[1]!,
        );
      return {
        anchor,
        normal,
        genericMeasuredContactFits,
        score:
          anchor.confidence * 130 +
          (Math.abs(normal.y) < 0.8 ? 18 : 0) +
          (contactSize
            ? Math.sqrt(Math.max(0.000001, contactSize[0]! * contactSize[1]!)) * 16
            : 0),
      };
    })
    .filter((candidate) => candidate.genericMeasuredContactFits)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.anchor.id.localeCompare(right.anchor.id),
    );
  const selectedAttachment = attachmentCandidates[0];
  if (!selectedAttachment) {
    return directorPhysicalUnresolved(
      relation,
      actor.id,
      target.id,
      "no_measured_attachment_region",
    );
  }
  const anchorPoint = directorPhysicalWorldPoint(
    target,
    selectedAttachment.anchor.local_position,
  );
  const halfExtent = directorPhysicalActorHalfExtentAlong(
    actor,
    selectedAttachment.normal,
  );
  const desiredCenter = anchorPoint.addScaledVector(
    selectedAttachment.normal,
    halfExtent + clearance,
  );
  const root = desiredCenter.sub(directorPhysicalSourceCenterOffset(actor));
  return {
    status: "resolved",
    relation,
    actor_entity_id: actor.id,
    target_entity_id: target.id,
    region_kind: "surface_contact_region",
    region_id: selectedAttachment.anchor.id,
    position: [root.x, root.y, root.z],
    reason: null,
  };
}

function applyDirectorPhysicalRegionPlacement(
  cue: DirectorShotDirectionV2["blocking"][number],
  actors: DirectorRuntimeActor[],
) {
  const resolution = resolveDirectorPhysicalBlockingPlacement(cue, actors);
  if (!resolution || resolution.status !== "resolved" || !resolution.position) {
    return resolution;
  }
  const actor = actorById(actors, resolution.actor_entity_id);
  if (actor) actor.position = [...resolution.position];
  return resolution;
}

export function applyDirectorBlocking(
  moment: DirectorMoment,
  actors: DirectorRuntimeActor[],
  options: { cinematic_only?: boolean } = {},
): DirectorRuntimeActor[] {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const output = actors.map((actor) => ({
    ...actor,
    position: [...actor.position] as DirectorRuntimeVec3,
    rotation: [...(actor.rotation ?? [0, 0, 0])] as DirectorRuntimeVec3,
    size: [...actor.size] as DirectorRuntimeVec3,
  }));
  const byId = new Map(output.map((actor) => [actor.id, actor]));
  const physical = new Set(["on_ground", "on_surface", "inside", "attached_to", "beside"]);
  const compositionBasis = directorBlockingCompositionBasis(moment, output);
  const handledGroupFormationKeys = new Set<string>();

  for (const cue of shot.blocking) {
    if (options.cinematic_only && physical.has(cue.relation)) continue;
    if (isDirectorGroupFormationRelation(cue.relation)) {
      const participantIds = directorGroupFormationParticipantIds(
        shot,
        cue,
        output,
      );
      const key = `${cue.relation}:${participantIds.join("|")}`;
      if (!handledGroupFormationKeys.has(key)) {
        applyDirectorGroupFormation(
          moment,
          shot,
          cue,
          output,
          compositionBasis,
        );
        handledGroupFormationKeys.add(key);
      }
      continue;
    }
    if (isDirectorRelativeActorRelation(cue.relation)) {
      applyDirectorRelativeActorPlacement(
        moment,
        cue,
        output,
        compositionBasis,
      );
      continue;
    }
    if (isDirectorPhysicalRegionRelation(cue.relation)) {
      applyDirectorPhysicalRegionPlacement(cue, output);
      continue;
    }
    const actor = byId.get(cue.actor_entity_id);
    if (!actor) continue;
    const actorRadiusValue = actorRadius(actor);
    const position = new THREE.Vector3(...actor.position);
    const depth = Math.max(
      1.55,
      compositionBasis.stage_spread_m * 0.72,
      actorRadiusValue * 1.8,
    );
    const lateral = Math.max(
      1.45,
      compositionBasis.stage_spread_m * 0.68,
      actorRadiusValue * 1.55,
    );

    switch (cue.relation) {
      case "on_ground": position.y = 0; break;
      case "foreground":
        // Negative view-forward is physically toward the opening camera.
        setCompositionCoordinate(
          position,
          compositionBasis.center,
          compositionBasis.view_forward,
          -depth,
        );
        break;
      case "midground":
        setCompositionCoordinate(
          position,
          compositionBasis.center,
          compositionBasis.view_forward,
          0,
        );
        break;
      case "background":
        setCompositionCoordinate(
          position,
          compositionBasis.center,
          compositionBasis.view_forward,
          depth,
        );
        break;
      case "screen_left":
        setCompositionCoordinate(
          position,
          compositionBasis.center,
          compositionBasis.view_right,
          -lateral,
        );
        break;
      case "screen_right":
        setCompositionCoordinate(
          position,
          compositionBasis.center,
          compositionBasis.view_right,
          lateral,
        );
        break;
      default: assertDirectorRuntimeNever(cue.relation, "DirectorBlockingRelation");
    }

    applyBlockingScreenRegion(cue, position, compositionBasis, actorRadiusValue);
    actor.position = [position.x, position.y, position.z];
  }

  return output;
}

function setAxisRotation(
  rotation: THREE.Euler,
  axis: unknown,
  radians: number,
) {
  if (axis === "x") rotation.x += radians;
  else if (axis === "z") rotation.z += radians;
  else rotation.y += radians;
}

function eventLocalProgress(
  moment: DirectorMoment,
  event: DirectorEvent,
  progress: number,
) {
  const timeMs = clamp01(progress) * Math.max(1, moment.duration_ms);
  const duration = Math.max(1, event.duration_ms);
  return easeValue(
    (timeMs - event.start_ms) / duration,
    event.easing,
  );
}

function sampleDirectorActorEventStateLegacy(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
): DirectorActorSample {
  const position = new THREE.Vector3(...actor.position);
  const rotation = new THREE.Euler(...(actor.rotation ?? [0, 0, 0]), "XYZ");
  const scale = new THREE.Vector3(1, 1, 1);
  const basePosition = position.clone();

  for (const event of moment.events) {
    if (event.actor_entity_id !== actor.id) continue;
    const t = eventLocalProgress(moment, event, progress);
    if (t <= 0 && event.behaviour !== "close") continue;

    const params = event.parameters ?? {};
    const targetActor = actorById(actors, event.target_entity_id);
    const target = targetActor
      ? new THREE.Vector3(...targetActor.position)
      : vecParam(params.target_position, actor.position);
    const distance = numberParam(params.distance_m, Math.max(0.75, actorRadius(actor) * 1.5));
    const amplitude = numberParam(params.amplitude_m, Math.max(0.25, actorRadius(actor) * 0.65));
    const turns = numberParam(params.turns, 1);
    const degrees = numberParam(params.degrees, 90);
    const axis = params.axis;

    switch (event.behaviour) {
      case "move_to": {
        const origin = Array.isArray(params.start_position)
          ? vecParam(params.start_position, actor.position)
          : basePosition;
        position.lerpVectors(origin, target, t);
        break;
      }
      case "move_toward": { const direction = target.clone().sub(basePosition).normalize(); position.copy(basePosition).addScaledVector(direction, distance * t); break; }
      case "move_away": { const direction = basePosition.clone().sub(target).normalize(); position.copy(basePosition).addScaledVector(direction, distance * t); break; }
      case "move_along_path": {
        const points = Array.isArray(params.path_points)
          ? params.path_points
              .map((point) => Array.isArray(point) && point.length >= 3 ? vecParam(point, actor.position) : null)
              .filter((point): point is THREE.Vector3 => Boolean(point))
          : [];
        if (points.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
          position.copy(curve.getPoint(clamp01(t)));
        } else {
          position.x = basePosition.x + distance * (t * 2 - 1);
          position.y = basePosition.y + Math.sin(t * Math.PI) * amplitude;
        }
        break;
      }
      case "follow_target":
      case "attach":
        if (targetActor) {
          const offset = vecParam(params.offset, [0, actorRadius(targetActor) * 0.9, 0]);
          position.lerpVectors(basePosition, target.clone().add(offset), t);
        }
        break;
      case "detach": {
        const away = targetActor
          ? basePosition.clone().sub(target).normalize()
          : new THREE.Vector3(-1, 0.25, 0).normalize();
        position.copy(basePosition).addScaledVector(away, distance * t);
        break;
      }
      case "slide": {
        const direction = vecParam(params.direction, [1, 0, 0]).normalize();
        position.copy(basePosition).addScaledVector(direction, distance * t);
        break;
      }
      case "lift":
        position.y = basePosition.y + distance * t;
        break;
      case "lower":
        position.y = basePosition.y - distance * t;
        break;
      case "oscillate": {
        const cycles = numberParam(params.cycles, 2);
        const direction = vecParam(params.direction, [1, 0, 0]).normalize();
        position.copy(basePosition).addScaledVector(direction, Math.sin(t * Math.PI * 2 * cycles) * amplitude);
        break;
      }
      case "orbit": {
        const center = targetActor ? target : vecParam(params.center, actor.position);
        const radius = numberParam(params.radius_m, Math.max(distance, actorRadius(actor) * 2));
        const angle = THREE.MathUtils.degToRad(numberParam(params.degrees, 180)) * t;
        const start = basePosition.clone().sub(center);
        if (start.lengthSq() < 0.001) start.set(radius, 0, 0);
        start.setLength(radius).applyAxisAngle(UP, angle);
        position.copy(center).add(start);
        break;
      }
      case "rotate":
      case "spin":
        setAxisRotation(rotation, axis ?? "y", Math.PI * 2 * turns * t);
        break;
      case "roll": {
        const direction = vecParam(params.direction, [1, 0, 0]).normalize();
        position.copy(basePosition).addScaledVector(direction, distance * t);
        const rollingRadius = Math.max(0.05, Math.abs(actor.size[1]) * 0.5);
        const explicitTurns = Number(params.turns);
        const axisName = axis === "x" || axis === "y" || axis === "z"
          ? axis
          : Math.abs(direction.z) > Math.abs(direction.x)
            ? "x"
            : "z";
        const expectedAngular = new THREE.Vector3().crossVectors(UP, direction);
        const signedAxisProjection = axisName === "x"
          ? expectedAngular.x
          : axisName === "z"
            ? expectedAngular.z
            : 1;
        const rotationSign = Math.abs(signedAxisProjection) <= 1e-6
          ? 1
          : Math.sign(signedAxisProjection);
        const rollingTurns = Number.isFinite(explicitTurns)
          ? explicitTurns
          : (distance / Math.max(0.05, Math.PI * 2 * rollingRadius)) * rotationSign;
        setAxisRotation(rotation, axisName, Math.PI * 2 * rollingTurns * t);
        break;
      }
      case "pivot":
      case "hinge":
      case "open":
      case "close": {
        const localPivot = vecParam(
          params.pivot_local,
          [-Math.max(0.05, actor.size[0]) * 0.5, 0, 0],
        );
        const axisName = axis === "x" || axis === "z" ? axis : "y";
        const axisVector = axisName === "x"
          ? new THREE.Vector3(1, 0, 0)
          : axisName === "z"
            ? new THREE.Vector3(0, 0, 1)
            : new THREE.Vector3(0, 1, 0);
        const angle = THREE.MathUtils.degToRad(degrees) * (event.behaviour === "close" ? 1 - t : t);
        const pivotWorld = basePosition.clone().add(localPivot);
        const arm = basePosition.clone().sub(pivotWorld).applyAxisAngle(axisVector, angle);
        position.copy(pivotWorld).add(arm);
        setAxisRotation(rotation, axisName, angle);
        break;
      }
      case "aim_at":
      case "align":
        if (targetActor) {
          const delta = target.clone().sub(position);
          rotation.y = Math.atan2(delta.x, delta.z);
        }
        break;
      case "insert_into":
      case "merge":
      case "assemble":
      case "connect":
        if (targetActor) position.lerpVectors(basePosition, target, t);
        break;
      case "remove_from":
      case "split":
      case "disassemble":
      case "disconnect": {
        const direction = targetActor
          ? basePosition.clone().sub(target).normalize()
          : vecParam(params.direction, [1, 0, 0]).normalize();
        position.copy(basePosition).addScaledVector(direction, distance * t);
        break;
      }
      case "expand":
        scale.setScalar(1 + numberParam(params.amount, 0.45) * t);
        break;
      case "contract":
        scale.setScalar(Math.max(0.05, 1 - numberParam(params.amount, 0.45) * t));
        break;
      case "flow":
      case "emit":
      case "accumulate":
      case "fill":
      case "drain":
        // Phase 1B.4.6 process semantics never mutate the source/container root
        // transform. Qualified execution lives in the MotionProgram process lane;
        // mixed unsupported actors fail closed visually rather than reviving the
        // former rigid-transform quantity proxy.
        break;
      case "pour":
        setAxisRotation(rotation, axis ?? "z", THREE.MathUtils.degToRad(numberParam(params.degrees, 70)) * t);
        break;
      case "transform":
        scale.setScalar(1 + numberParam(params.amount, 0.25) * t);
        setAxisRotation(rotation, axis ?? "y", THREE.MathUtils.degToRad(numberParam(params.degrees, 35)) * t);
        break;
      case "pulse": {
        const pulse = 1 + Math.sin(t * Math.PI * 4) * numberParam(params.amount, 0.08);
        scale.multiplyScalar(pulse);
        break;
      }
      // These behaviours are intentionally owned by presentation/semantic layers.
      // Keeping them explicit here prevents a newly added canonical behaviour from
      // silently falling through the actor transform sampler.
      case "show":
      case "hide":
      case "highlight":
      case "dim_others":
      case "trace":
      case "filter":
      case "replace":
      case "pause":
      case "compare":
      case "reveal_cutaway":
      case "custom_semantic":
        break;
      default:
        assertDirectorRuntimeNever(event.behaviour, "DirectorBehaviour");
    }
  }

  return { position, rotation, scale };
}

/**
 * Phase 1B.4.3 adapter seam. The public actor sampler remains stable while the
 * Universal Motion Program may recursively sample moving relationship targets.
 * Cycles or unsupported target recipes fail closed to the legacy actor path.
 * Phase 1B.4.4 extends the same seam with an optional immutable incoming scene
 * snapshot; existing callers that omit it retain the exact one-moment behavior.
 */
function sampleDirectorActorEventStateWithStack(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
  stack: ReadonlySet<string>,
  sceneState?: DirectorSceneState | null,
): DirectorActorSample {
  const resolvedActor = resolveDirectorActorWithSceneState(
    actor,
    sceneState,
  );
  const resolvedActors = actors.map((candidate) =>
    resolveDirectorActorWithSceneState(candidate, sceneState),
  );
  const compilation = compileDirectorActorMotionProgram(
    moment,
    resolvedActor,
    resolvedActors,
  );
  if (compilation.route === "motion_program" && compilation.program) {
    const nextStack = new Set(stack);
    nextStack.add(actor.id);
    const motionSample = sampleCompiledDirectorActorMotionProgram(
      compilation,
      progress,
      {
        sample_entity_state: (entityId, targetProgress) => {
          const targetActor = actorById(actors, entityId);
          if (!targetActor || nextStack.has(entityId)) return null;
          const targetSample = sampleDirectorActorEventStateWithStack(
            moment,
            targetActor,
            targetProgress,
            actors,
            nextStack,
            sceneState,
          );
          return {
            position: [
              targetSample.position.x,
              targetSample.position.y,
              targetSample.position.z,
            ],
            rotation: [
              targetSample.rotation.x,
              targetSample.rotation.y,
              targetSample.rotation.z,
            ],
            scale: [
              targetSample.scale.x,
              targetSample.scale.y,
              targetSample.scale.z,
            ],
          };
        },
      },
    );
    if (
      motionSample &&
      motionSample.diagnostics.finite &&
      motionSample.diagnostics.unsupported_track_ids.length === 0
    ) {
      return {
        position: new THREE.Vector3(...motionSample.position),
        rotation: new THREE.Euler(...motionSample.rotation, "XYZ"),
        scale: new THREE.Vector3(...motionSample.scale),
        process: motionSample.process,
      };
    }
  }
  return sampleDirectorActorEventStateLegacy(
    moment,
    resolvedActor,
    progress,
    resolvedActors,
  );
}

function sampleDirectorActorEventState(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
  sceneState?: DirectorSceneState | null,
): DirectorActorSample {
  return sampleDirectorActorEventStateWithStack(
    moment,
    actor,
    progress,
    actors,
    new Set<string>(),
    sceneState,
  );
}

/** Verification-only Phase 1B.4.1 authority for MotionProgram dual-run tests. */
export function sampleDirectorActorEventStateLegacyForVerification(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
): DirectorActorSample {
  return sampleDirectorActorEventStateLegacy(
    moment,
    actor,
    progress,
    actors,
  );
}

function constraintAxisVector(axis: "x" | "y" | "z" | "auto") {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

/**
 * Applies semantic kinematic invariants after ordinary actor events. This is a
 * deterministic preview/Three.js compiler, not a rigid-body simulation. The
 * constraints keep relationships stable enough for educational mechanisms and
 * translate directly into stronger Blender/rig solvers later.
 */
export function sampleDirectorActorState(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
  sceneState?: DirectorSceneState | null,
): DirectorActorSample {
  const sampled = sampleDirectorActorEventState(
    moment,
    actor,
    progress,
    actors,
    sceneState,
  );
  const shot = moment.shot ?? legacyShotForMoment(moment);

  for (const constraint of shot.constraints) {
    if (constraint.actor_entity_id !== actor.id) continue;
    const targetActor = actorById(actors, constraint.target_entity_id);
    const secondActor = actorById(actors, constraint.secondary_target_entity_id);
    const targetSample = targetActor
      ? sampleDirectorActorEventState(
          moment,
          targetActor,
          progress,
          actors,
          sceneState,
        )
      : null;
    const secondSample = secondActor
      ? sampleDirectorActorEventState(
          moment,
          secondActor,
          progress,
          actors,
          sceneState,
        )
      : null;

    switch (constraint.kind) {
      case "axis_lock": {
        const origin = vecParam(constraint.parameters.origin, actor.position);
        if (constraint.axis === "x") {
          sampled.position.y = origin.y;
          sampled.position.z = origin.z;
        } else if (constraint.axis === "z") {
          sampled.position.x = origin.x;
          sampled.position.y = origin.y;
        } else {
          sampled.position.x = origin.x;
          sampled.position.z = origin.z;
        }
        break;
      }
      case "attach": {
        if (targetSample && targetActor) {
          const offset = vecParam(
            constraint.parameters.offset,
            [0, Math.max(0.05, targetActor.size[1] * 0.55), 0],
          );
          sampled.position.copy(targetSample.position).add(offset);
        }
        break;
      }
      case "maintain_distance": {
        if (targetSample) {
          const fallbackDistance = Math.max(
            0.05,
            new THREE.Vector3(...actor.position).distanceTo(targetSample.position),
          );
          const desired = Math.max(
            0.01,
            constraint.distance_m ?? numberParam(constraint.parameters.distance_m, fallbackDistance),
          );
          const direction = sampled.position.clone().sub(targetSample.position);
          if (direction.lengthSq() < 0.0001) direction.set(1, 0, 0);
          sampled.position.copy(targetSample.position).add(direction.normalize().multiplyScalar(desired));
        }
        break;
      }
      case "look_at": {
        if (targetSample) {
          const delta = targetSample.position.clone().sub(sampled.position);
          if (delta.lengthSq() > 0.0001) sampled.rotation.y = Math.atan2(delta.x, delta.z);
        }
        break;
      }
      case "rigid_link": {
        if (targetSample && secondSample) {
          const start = targetSample.position;
          const end = secondSample.position;
          const direction = end.clone().sub(start);
          const length = direction.length();
          if (length > 0.0001) {
            sampled.position.lerpVectors(start, end, 0.5);
            const localAxis = constraintAxisVector(constraint.axis === "auto" ? "z" : constraint.axis);
            const quaternion = new THREE.Quaternion().setFromUnitVectors(
              localAxis.clone().normalize(),
              direction.clone().normalize(),
            );
            sampled.rotation.setFromQuaternion(quaternion, "XYZ");
            const axis = constraint.axis === "x" ? 0 : constraint.axis === "y" ? 1 : 2;
            const sourceLength = Math.max(0.05, actor.size[axis]);
            if (axis === 0) sampled.scale.x = length / sourceLength;
            else if (axis === 1) sampled.scale.y = length / sourceLength;
            else sampled.scale.z = length / sourceLength;
          }
        }
        break;
      }
      default:
        assertDirectorRuntimeNever(constraint.kind, "DirectorKinematicConstraintKind");
    }
  }

  sampled.visible = directorSceneStateActorVisible(sceneState, actor.id);
  return sampled;
}

/**
 * Deterministic random-access reconstruction for an ordered Director moment
 * sequence. Previous moments are reduced from scratch into a scene snapshot,
 * then the requested moment samples against that immutable incoming state.
 */
export function sampleDirectorActorStateAcrossMoments(
  moments: readonly DirectorMoment[],
  momentIndex: number,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
  initialState?: DirectorSceneState | null,
): DirectorActorSample | null {
  const moment = moments[momentIndex];
  if (!moment) return null;
  const incomingState = directorSceneStateBeforeMoment(
    moments,
    momentIndex,
    actors,
    initialState,
  );
  return sampleDirectorActorState(
    moment,
    actor,
    progress,
    actors,
    incomingState,
  );
}

function framingFactor(framing: DirectorShotDirectionV2["composition"]["framing"]) {
  switch (framing) {
    case "extreme_wide": return 7.5;
    case "wide": return 5.8;
    case "group_shot": return 5.2;
    case "full": return 4.5;
    case "medium_wide": return 4.0;
    case "two_shot": return 3.9;
    case "medium": return 3.45;
    case "over_shoulder": return 3.1;
    case "medium_close": return 2.75;
    case "close": return 2.2;
    case "extreme_close": return 1.65;
    case "macro": return 1.25;
    case "insert": return 1.45;
    case "point_of_view": return 2.8;
    case "cutaway": return 3.6;
    default: return assertDirectorRuntimeNever(framing, "DirectorCameraFraming");
  }
}

function isTallUprightShotScaleSubject(
  samples: ReturnType<typeof targetActors>,
) {
  if (samples.length !== 1) return false;
  const entry = samples[0]!;
  const width = Math.abs(entry.actor.size[0] * entry.sample.scale.x);
  const height = Math.abs(entry.actor.size[1] * entry.sample.scale.y);
  const depth = Math.abs(entry.actor.size[2] * entry.sample.scale.z);
  return height >= 0.75 && height >= Math.max(width, depth) * 1.35;
}

function shotScaleUpperSubjectTargetHeightRatio(
  framing: DirectorShotDirectionV2["composition"]["framing"],
  samples: ReturnType<typeof targetActors>,
) {
  if (!isTallUprightShotScaleSubject(samples)) return null;
  switch (framing) {
    case "medium_wide": return 0.54;
    case "medium": return 0.62;
    case "medium_close": return 0.69;
    case "close": return 0.75;
    default: return null;
  }
}

function shotScaleFramingFactor(
  framing: DirectorShotDirectionV2["composition"]["framing"],
  samples: ReturnType<typeof targetActors>,
) {
  if (!isTallUprightShotScaleSubject(samples)) return framingFactor(framing);
  switch (framing) {
    case "medium_wide": return 3.65;
    case "medium": return 2.9;
    case "medium_close": return 2.25;
    case "close": return 1.75;
    default: return framingFactor(framing);
  }
}

function angleDirection(angle: DirectorShotDirectionV2["composition"]["angle"]) {
  switch (angle) {
    case "low_angle": return new THREE.Vector3(0.8, -0.28, 1);
    case "high_angle": return new THREE.Vector3(0.75, 0.9, 1);
    case "top_down": return new THREE.Vector3(0.01, 1, 0.01);
    case "ground_level": return new THREE.Vector3(0.8, -0.42, 1);
    case "side_profile": return new THREE.Vector3(1, 0.22, 0);
    case "front_profile": return new THREE.Vector3(0, 0.18, 1);
    case "rear_profile": return new THREE.Vector3(0, 0.18, -1);
    case "three_quarter_rear": return new THREE.Vector3(0.9, 0.35, -0.9);
    case "isometric": return new THREE.Vector3(1, 1, 1);
    case "object_attached": return new THREE.Vector3(0.3, 0.2, 0.9);
    case "inside_object": return new THREE.Vector3(0.05, 0.05, 0.3);
    case "three_quarter_front": return new THREE.Vector3(0.9, 0.35, 0.9);
    case "dutch_angle":
    case "eye_level": return new THREE.Vector3(0.65, 0.05, 1);
    default: return assertDirectorRuntimeNever(angle, "DirectorCameraAngle");
  }
}

function actorEyePoint(
  actor: DirectorRuntimeActor,
  sample: DirectorActorSample,
) {
  return sample.position.clone().add(
    new THREE.Vector3(0, Math.max(0.08, actor.size[1]) * 0.68, 0),
  );
}

function stableViewBasis(
  source: THREE.Vector3,
  target: THREE.Vector3,
) {
  const forward = target.clone().sub(source);
  if (forward.lengthSq() < 0.000001) forward.set(0, 0, -1);
  forward.normalize();
  let right = new THREE.Vector3().crossVectors(forward, UP);
  if (right.lengthSq() < 0.000001) right = new THREE.Vector3(1, 0, 0);
  else right.normalize();
  return { forward, right };
}

function defaultActorLocalMountedPosition(
  actor: DirectorRuntimeActor,
  radius: number,
) {
  // Frozen historical verifier source-contract markers (A.3.3 / A.6):
  // actor.size[1] + Math.max(0.12, radius * 0.12)
  // -Math.max(0.18, actor.size[2] * 0.34, radius * 0.16)
  // These strings document the prior qualified implementation; A.7 behavior
  // below intentionally uses newer mount clearances without rewriting the
  // historical regression verifiers that earned the earlier qualification.
  // Phase 1B.7A.7: keep the canonical mounted optical centre outside the host,
  // but raise it slightly and reduce the rearward inset. The A.6 reel proved the
  // relationship, yet the vehicle hood/body reference still occupied too much
  // of the lower frame. This keeps only a restrained host edge while preserving
  // the road, horizon, and roadside optic-flow evidence.
  return new THREE.Vector3(
    0,
    Math.max(0.5, actor.size[1] + Math.max(0.18, radius * 0.18)),
    -Math.max(0.12, actor.size[2] * 0.22, radius * 0.1),
  );
}

function defaultActorLocalMountedViewDirection() {
  // Keep enough downward pitch to retain road/support context without pointing
  // the camera into the host body or sacrificing the forward horizon.
  return new THREE.Vector3(0, -0.12, 1).normalize();
}

function actorLocalMountedView(
  actor: DirectorRuntimeActor,
  sample: DirectorActorSample,
  radius: number,
  localMountOverride?: THREE.Vector3,
  localViewDirectionOverride?: THREE.Vector3,
  lookDistanceOverride?: number,
) {
  const localMount = (
    localMountOverride ??
    defaultActorLocalMountedPosition(actor, radius)
  ).clone();
  const localViewDirection = (
    localViewDirectionOverride ??
    defaultActorLocalMountedViewDirection()
  ).clone();
  if (localViewDirection.lengthSq() < 0.000001) localViewDirection.set(0, 0, 1);
  localViewDirection.normalize();

  const worldMount = localMount.clone().applyEuler(sample.rotation);
  const worldViewDirection = localViewDirection.clone().applyEuler(sample.rotation).normalize();
  const lookDistance = Math.max(
    2.8,
    radius * 3.4,
    typeof lookDistanceOverride === "number" && Number.isFinite(lookDistanceOverride)
      ? lookDistanceOverride
      : 0,
  );
  const position = sample.position.clone().add(worldMount);
  const target = position.clone().addScaledVector(worldViewDirection, lookDistance);

  return {
    position,
    target,
    localMount,
    localViewDirection,
  };
}

type DirectorMountedCameraMode = "immediate" | "blend_in";

function solveDirectorMountedCameraRelationship(input: {
  mode: DirectorMountedCameraMode;
  base_position: THREE.Vector3;
  base_target: THREE.Vector3;
  actor: DirectorRuntimeActor;
  sample: DirectorActorSample;
  radius: number;
  blend_progress?: number;
  local_mount?: THREE.Vector3;
  local_view_direction?: THREE.Vector3;
  look_distance_m?: number;
}) {
  const mounted = actorLocalMountedView(
    input.actor,
    input.sample,
    input.radius,
    input.local_mount,
    input.local_view_direction,
    input.look_distance_m,
  );
  const blend =
    input.mode === "immediate"
      ? 1
      : THREE.MathUtils.smootherstep(
          clamp01(input.blend_progress ?? 0),
          0,
          0.34,
        );

  return {
    position: input.base_position.clone().lerp(mounted.position, blend),
    target: input.base_target.clone().lerp(mounted.target, blend),
    local_mount: mounted.localMount,
    local_view_direction: mounted.localViewDirection,
    mode: input.mode,
    blend,
  };
}

function cameraRelationshipActor(
  moment: DirectorMoment,
  shot: DirectorShotDirectionV2,
  actors: DirectorRuntimeActor[],
  kind: "foreground" | "focus",
) {
  const id = kind === "foreground"
    ? shot.composition.foreground_entity_ids[0] ?? moment.active_entity_ids[0] ?? shot.camera.focus_entity_ids[0]
    : shot.camera.focus_entity_ids[0] ?? moment.active_entity_ids[0];
  return actorById(actors, id);
}

function targetActors(
  moment: DirectorMoment,
  shot: DirectorShotDirectionV2,
  progress: number,
  actors: DirectorRuntimeActor[],
  sceneState?: DirectorSceneState | null,
) {
  const ids = shot.camera.focus_entity_ids.length
    ? shot.camera.focus_entity_ids
    : moment.active_entity_ids;
  return ids
    .map((id) => actorById(actors, id))
    .filter((actor): actor is DirectorRuntimeActor => Boolean(actor))
    .map((actor) => ({ actor, sample: sampleDirectorActorState(moment, actor, progress, actors, sceneState) }));
}

function averageTarget(
  samples: ReturnType<typeof targetActors>,
) {
  if (!samples.length) return new THREE.Vector3(0, 0.8, 0);
  const target = new THREE.Vector3();
  for (const entry of samples) target.add(entry.sample.position);
  target.multiplyScalar(1 / samples.length);
  const averageHeight = samples.reduce((sum, entry) => sum + Math.max(0.1, entry.actor.size[1]), 0) / samples.length;
  target.y += averageHeight * 0.45;
  return target;
}

function focusRadius(
  samples: ReturnType<typeof targetActors>,
  minimumRadius = 0.8,
) {
  if (!samples.length) return Math.max(0.2, minimumRadius);
  let radius = Math.max(0.05, minimumRadius);
  for (const entry of samples) radius = Math.max(radius, actorRadius(entry.actor));
  if (samples.length > 1) {
    const points = samples.map((entry) => entry.sample.position);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) radius = Math.max(radius, points[i].distanceTo(points[j]) * 0.65);
    }
  }
  return radius;
}

function isLayeredDepthComposition(shot: DirectorShotDirectionV2) {
  const relations = new Set(shot.blocking.map((cue) => cue.relation));
  return (
    shot.camera.focus_entity_ids.length >= 3 &&
    relations.has("foreground") &&
    relations.has("midground") &&
    relations.has("background")
  );
}

function orientedActorHalfExtentAlong(
  actor: DirectorRuntimeActor,
  sample: DirectorActorSample,
  axis: THREE.Vector3,
) {
  const localX = new THREE.Vector3(1, 0, 0).applyEuler(sample.rotation);
  const localY = new THREE.Vector3(0, 1, 0).applyEuler(sample.rotation);
  const localZ = new THREE.Vector3(0, 0, 1).applyEuler(sample.rotation);
  const halfX = Math.abs(actor.size[0] * sample.scale.x) * 0.5;
  const halfY = Math.abs(actor.size[1] * sample.scale.y) * 0.5;
  const halfZ = Math.abs(actor.size[2] * sample.scale.z) * 0.5;
  return (
    Math.abs(axis.dot(localX)) * halfX +
    Math.abs(axis.dot(localY)) * halfY +
    Math.abs(axis.dot(localZ)) * halfZ
  );
}

/**
 * Depth separation is evidence, not a reason to turn a three-layer composition
 * into an extreme-wide shot. Solve the minimum camera distance from the actors'
 * screen-plane envelope while preserving their authored camera-space depth.
 *
 * For each actor we ask: how far must the camera sit from the optical target so
 * this actor's horizontal/vertical silhouette remains inside a conservative
 * 16:9 safe region? Actor distance toward the camera is included explicitly, so
 * a foreground layer cannot be clipped while background depth no longer inflates
 * framing as if it were sideways stage width.
 */
function layeredDepthProjectedFitDistance(
  samples: ReturnType<typeof targetActors>,
  target: THREE.Vector3,
  cameraOffsetDirection: THREE.Vector3,
  fovDegrees: number,
  minimumDistance: number,
  options?: {
    safe_half_width?: number;
    safe_half_height?: number;
    breathing_multiplier?: number;
  },
) {
  if (!samples.length) return minimumDistance;

  const offset = cameraOffsetDirection.clone();
  if (offset.lengthSq() < 0.000001) offset.set(0.65, 0.05, 1);
  offset.normalize();
  const forward = offset.clone().multiplyScalar(-1);
  let right = new THREE.Vector3().crossVectors(forward, UP);
  if (right.lengthSq() < 0.000001) right = new THREE.Vector3(1, 0, 0);
  else right.normalize();
  let screenUp = new THREE.Vector3().crossVectors(right, forward);
  if (screenUp.lengthSq() < 0.000001) screenUp = UP.clone();
  else screenUp.normalize();

  const tanVertical = Math.tan(THREE.MathUtils.degToRad(fovDegrees) * 0.5);
  const tanHorizontal = tanVertical * (16 / 9);
  const safeHalfWidth = THREE.MathUtils.clamp(
    options?.safe_half_width ?? 0.78,
    0.5,
    0.95,
  );
  const safeHalfHeight = THREE.MathUtils.clamp(
    options?.safe_half_height ?? 0.74,
    0.5,
    0.95,
  );
  let requiredDistance = Math.max(0.1, minimumDistance);

  for (const entry of samples) {
    const centre = entry.sample.position.clone().add(
      new THREE.Vector3(
        0,
        Math.abs(entry.actor.size[1] * entry.sample.scale.y) * 0.45,
        0,
      ),
    );
    const delta = centre.sub(target);
    const towardCamera = delta.dot(offset);
    const horizontalExtent =
      Math.abs(delta.dot(right)) +
      orientedActorHalfExtentAlong(entry.actor, entry.sample, right);
    const verticalExtent =
      Math.abs(delta.dot(screenUp)) +
      orientedActorHalfExtentAlong(entry.actor, entry.sample, screenUp);

    requiredDistance = Math.max(
      requiredDistance,
      towardCamera +
        horizontalExtent / Math.max(0.05, tanHorizontal * safeHalfWidth),
      towardCamera +
        verticalExtent / Math.max(0.05, tanVertical * safeHalfHeight),
    );
  }

  // A tiny breathing margin absorbs approximate actor bounds without returning
  // to the old pairwise-3D-distance over-pull. Callers can tighten this only when
  // the named framing explicitly needs stronger screen occupancy.
  return requiredDistance * THREE.MathUtils.clamp(
    options?.breathing_multiplier ?? 1.045,
    1,
    1.12,
  );
}

function stepProgress(step: DirectorCameraMovementStep, progress: number) {
  const span = Math.max(0.001, step.end_progress - step.start_progress);
  return easeValue((progress - step.start_progress) / span, step.easing);
}

function movementDistance(
  step: DirectorCameraMovementStep,
  radius: number,
  fallbackFactor: number,
) {
  return numberParam(step.parameters.distance_m, Math.max(0.35, radius * fallbackFactor)) * step.strength;
}

function actorTravelVector(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor | null,
  actors: DirectorRuntimeActor[],
  sceneState?: DirectorSceneState | null,
) {
  if (!actor) return new THREE.Vector3();
  const start = sampleDirectorActorState(moment, actor, 0, actors, sceneState).position;
  const end = sampleDirectorActorState(moment, actor, 1, actors, sceneState).position;
  return end.sub(start);
}

function actorTravelDirection(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor | null,
  actors: DirectorRuntimeActor[],
  sceneState?: DirectorSceneState | null,
) {
  const travel = actorTravelVector(moment, actor, actors, sceneState);
  travel.y = 0;
  if (travel.lengthSq() < 0.000001) return null;
  return travel.normalize();
}

type DirectorEnvelopeAgainstPose = {
  min_ndc_x: number;
  max_ndc_x: number;
  min_ndc_y: number;
  max_ndc_y: number;
  width_ndc: number;
  height_ndc: number;
  screen_area_fraction: number;
  fully_inside_safe_frame: boolean;
};

function projectActorEnvelopeAgainstPose(
  pose: DirectorCameraPose,
  actor: DirectorRuntimeActor,
  sampled: DirectorActorSample,
): DirectorEnvelopeAgainstPose {
  const camera = buildPerspectiveCamera(pose);
  const halfX = Math.abs(actor.size[0] * sampled.scale.x) * 0.5;
  const height = Math.abs(actor.size[1] * sampled.scale.y);
  const halfZ = Math.abs(actor.size[2] * sampled.scale.z) * 0.5;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let allDepthVisible = true;

  for (const x of [-halfX, halfX]) {
    for (const y of [0, height]) {
      for (const z of [-halfZ, halfZ]) {
        const projected = new THREE.Vector3(x, y, z)
          .applyEuler(sampled.rotation)
          .add(sampled.position)
          .project(camera);
        minX = Math.min(minX, projected.x);
        maxX = Math.max(maxX, projected.x);
        minY = Math.min(minY, projected.y);
        maxY = Math.max(maxY, projected.y);
        if (projected.z < -1 || projected.z > 1) allDepthVisible = false;
      }
    }
  }

  const width = Math.max(0, maxX - minX);
  const heightNdc = Math.max(0, maxY - minY);
  return {
    min_ndc_x: minX,
    max_ndc_x: maxX,
    min_ndc_y: minY,
    max_ndc_y: maxY,
    width_ndc: width,
    height_ndc: heightNdc,
    screen_area_fraction: Math.min(1, (width * heightNdc) / 4),
    fully_inside_safe_frame:
      allDepthVisible &&
      minX >= -0.96 &&
      maxX <= 0.96 &&
      minY >= -0.92 &&
      maxY <= 0.92,
  };
}

const LEAD_REAR_EDGE_SAFE_NDC = 0.88;

/**
 * Phase 1B.7A.8 performance hardening. Lead safe-framing is a constant-time
 * camera-space constraint, not an iterative screen-projection search in the
 * display-frame hot path. The projected envelope helper remains available for
 * qualification evidence; runtime Lead solves the desired screen placement
 * directly from camera depth/FOV and the actor's oriented half-extent.
 */
function constrainLeadTargetConstantTime(input: {
  pose: DirectorCameraPose;
  desired_target: THREE.Vector3;
  actor: DirectorRuntimeActor;
  sample: DirectorActorSample;
  right: THREE.Vector3;
}) {
  const baseTarget = input.pose.target.clone();
  const desiredDelta = input.desired_target.clone().sub(baseTarget);
  const lateralShift = desiredDelta.dot(input.right);
  if (Math.abs(lateralShift) < 0.0001) return input.desired_target.clone();

  const baseForward = baseTarget.clone().sub(input.pose.position);
  const baseLookDistance = baseForward.length();
  if (baseLookDistance < 0.000001) return input.desired_target.clone();
  baseForward.normalize();

  const actorCenter = input.sample.position.clone().add(
    new THREE.Vector3(
      0,
      Math.abs(input.actor.size[1] * input.sample.scale.y) * 0.45,
      0,
    ),
  );
  const cameraDepth = Math.max(
    0.35,
    actorCenter.clone().sub(input.pose.position).dot(baseForward),
  );
  const tanHorizontal =
    Math.tan(THREE.MathUtils.degToRad(input.pose.fov) * 0.5) * (16 / 9);
  const halfFrameWidth = Math.max(0.05, tanHorizontal * cameraDepth);
  const actorHalfWidth = orientedActorHalfExtentAlong(
    input.actor,
    input.sample,
    input.right,
  );

  // Convert the authored target shift into the screen-centre displacement it is
  // trying to create, then cap that displacement by the projected actor width.
  // This preserves the A.6/A.7 Lead intent while solving the final look angle in
  // one pass. The 0.46 cap keeps the result in a readable rear-third family, and
  // the 1.2 silhouette guard leaves breathing room for approximate box bounds.
  const projectedHalfWidthNdc = actorHalfWidth / halfFrameWidth;
  const safeCenterMagnitudeNdc = Math.min(
    0.46,
    Math.max(0.08, LEAD_REAR_EDGE_SAFE_NDC - projectedHalfWidthNdc * 1.2),
  );
  const intendedCenterNdc = -lateralShift / halfFrameWidth;
  const desiredCenterNdc = THREE.MathUtils.clamp(
    intendedCenterNdc,
    -safeCenterMagnitudeNdc,
    safeCenterMagnitudeNdc,
  );

  // Rotating the optical axis around world-up moves the fixed actor centre to
  // the requested horizontal NDC coordinate without translating the camera or
  // running a projection/binary-search loop.
  const yawRadians = Math.atan(desiredCenterNdc * tanHorizontal);
  const constrainedForward = baseForward
    .clone()
    .applyAxisAngle(UP, yawRadians)
    .normalize();
  return input.pose.position
    .clone()
    .addScaledVector(constrainedForward, baseLookDistance);
}

function applyMovementStep(
  pose: DirectorCameraPose,
  step: DirectorCameraMovementStep,
  t: number,
  moment: DirectorMoment,
  shot: DirectorShotDirectionV2,
  actors: DirectorRuntimeActor[],
  radius: number,
  progress: number,
  sceneState?: DirectorSceneState | null,
) {
  const runtimeMovement = directorCameraMovementRuntimeAlias(step.movement);
  const parallelRailStartsWithShot =
    runtimeMovement === "track_parallel" && step.start_progress <= 0.001;
  if (
    step.movement === "static" ||
    (t <= 0 && !parallelRailStartsWithShot)
  ) {
    return;
  }

  const targetActor = actorById(actors, step.target_entity_id ?? shot.camera.focus_entity_ids[0]);
  const offset = pose.position.clone().sub(pose.target);
  const distance = Math.max(0.1, offset.length());
  const forward = pose.target.clone().sub(pose.position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize();

  switch (runtimeMovement) {
    case "static":
      break;
    case "cut": {
      // `step` easing keeps t at zero until the cut boundary, then jumps to 1.
      if (t < 1) break;
      const degrees = numberParam(step.parameters.degrees, 62) * step.strength;
      const rotated = pose.position.clone().sub(pose.target).applyAxisAngle(UP, THREE.MathUtils.degToRad(degrees));
      pose.position.copy(pose.target).add(rotated);
      if (targetActor) {
        const targetSample = sampleDirectorActorState(moment, targetActor, progress, actors, sceneState);
        pose.target.copy(targetSample.position).add(
          new THREE.Vector3(0, Math.max(0.1, targetActor.size[1]) * 0.45, 0),
        );
      }
      break;
    }
    case "push_in": {
      const amount = Math.min(distance * 0.72, movementDistance(step, radius, 1.8));
      pose.position.addScaledVector(forward, amount * t);
      break;
    }
    case "pull_back": {
      const amount = movementDistance(step, radius, 2.4);
      pose.position.addScaledVector(forward, -amount * t);
      break;
    }
    case "dolly": {
      const amount = movementDistance(step, radius, 2.0);
      const direction = vecParam(step.parameters.direction, [0, 0, 1]);
      if (step.coordinate_space === "camera_relative") {
        pose.position.addScaledVector(right, direction.x * amount * t);
        pose.position.y += direction.y * amount * t;
        pose.position.addScaledVector(forward, direction.z * amount * t);
        pose.target.addScaledVector(right, direction.x * amount * t);
        pose.target.y += direction.y * amount * t;
        pose.target.addScaledVector(forward, direction.z * amount * t);
      } else {
        pose.position.addScaledVector(direction.normalize(), amount * t);
        pose.target.addScaledVector(direction.normalize(), amount * t);
      }
      break;
    }
    case "truck": {
      const amount = movementDistance(step, radius, 2.2);
      const sign = numberParam(step.parameters.direction_sign, 1) >= 0 ? 1 : -1;
      pose.position.addScaledVector(right, amount * t * sign);
      pose.target.addScaledVector(right, amount * t * sign);
      break;
    }
    case "track_parallel": {
      if (!targetActor) {
        const amount = movementDistance(step, radius, 2.2);
        pose.position.addScaledVector(right, amount * t);
        pose.target.addScaledVector(right, amount * t);
        break;
      }

      const travelDirection = actorTravelDirection(moment, targetActor, actors, sceneState);
      if (!travelDirection) break;

      const sample = sampleDirectorActorState(moment, targetActor, progress, actors, sceneState);
      const subjectEye = actorEyePoint(targetActor, sample);
      const sideSign = numberParam(step.parameters.direction_sign, 1) >= 0 ? 1 : -1;
      const lateral = new THREE.Vector3()
        .crossVectors(UP, travelDirection)
        .normalize()
        .multiplyScalar(sideSign);
      const requestedDistance = numberParam(
        step.parameters.distance_m,
        Math.max(radius * 2.8, targetActor.size[0] * 2.5),
      );
      // A parallel track should feel like a second rail beside the actor:
      // stable side distance, stable apparent size, and no forward look drift.
      const sideDistance = Math.max(
        radius * 2.65,
        targetActor.size[0] * 2.35,
        requestedDistance,
      );
      const desiredPosition = subjectEye
        .clone()
        .addScaledVector(lateral, sideDistance)
        .addScaledVector(UP, Math.max(0.08, radius * 0.12));
      const desiredTarget = subjectEye.clone();

      // Parallel tracking is a relationship, not an entry zoom. Once the step
      // is active, solve the second rail directly so the subject keeps nearly
      // constant apparent size and screen position for the full shot.
      pose.position.copy(desiredPosition);
      pose.target.copy(desiredTarget);
      break;
    }
    case "pedestal": {
      const amount = movementDistance(step, radius, 1.5);
      pose.position.y += amount * t;
      pose.target.y += amount * t * 0.4;
      break;
    }
    case "pan": {
      if (targetActor && shot.camera.focus_entity_ids.length > 1) {
        const targetSample = sampleDirectorActorState(moment, targetActor, progress, actors, sceneState);
        const targetPoint = targetSample.position.clone().add(
          new THREE.Vector3(0, Math.max(0.1, targetActor.size[1]) * 0.45, 0),
        );
        pose.target.lerp(targetPoint, t);
      } else {
        const sign = numberParam(step.parameters.direction_sign, 1) >= 0 ? 1 : -1;
        pose.target.addScaledVector(right, movementDistance(step, radius, 1.8) * t * sign);
      }
      break;
    }
    case "tilt": {
      const sign = numberParam(step.parameters.direction_sign, 1) >= 0 ? 1 : -1;
      pose.target.y += movementDistance(step, radius, 1.4) * t * sign;
      break;
    }
    case "orbit":
    case "arc_left":
    case "arc_right":
    case "reverse_reveal": {
      const defaultDegrees = runtimeMovement === "orbit" ? 110 : runtimeMovement === "reverse_reveal" ? 52 : 38;
      const sign = runtimeMovement === "arc_left" ? -1 : 1;
      const degrees = numberParam(step.parameters.degrees, defaultDegrees) * sign * step.strength;
      const rotated = pose.position.clone().sub(pose.target).applyAxisAngle(UP, THREE.MathUtils.degToRad(degrees) * t);
      pose.position.copy(pose.target).add(rotated);
      if (runtimeMovement === "reverse_reveal" && shot.camera.focus_entity_ids.length > 1) {
        const first = actorById(actors, shot.camera.focus_entity_ids[0]);
        const second = actorById(actors, shot.camera.focus_entity_ids[1]);
        if (first && second) {
          const firstPos = sampleDirectorActorState(moment, first, progress, actors, sceneState).position;
          const secondPos = sampleDirectorActorState(moment, second, progress, actors, sceneState).position;
          pose.target.lerpVectors(firstPos, firstPos.clone().lerp(secondPos, 0.5), t);
        }
      }
      break;
    }
    case "follow":
    case "lead_subject":
    case "lag_follow": {
      // The base composition is already actor-relative, which makes ordinary
      // follow a stable travelling rig. Lead and lag deliberately change the
      // *look relationship* instead of translating camera and target together.
      const direction = actorTravelDirection(moment, targetActor, actors, sceneState);
      if (!direction || runtimeMovement === "follow") break;

      if (runtimeMovement === "lead_subject") {
        // Historical A.5/A.6 verifier contract retained: screen-space* look room.
        // Phase 1B.7A.8: preserve that authored Lead intent without the A.7
        // per-frame binary projection search. The runtime now solves the same
        // rear-edge safety as constant-time camera-space geometry, so wide
        // vehicles retain visible lead room without making capture CPU-heavy.
        //
        // Phase 1B.7A.9 presentation polish: establish the Lead relationship
        // during the first third, then hold it. This makes sibling comparison
        // read as neutral start -> Lead composition -> stable Lead, rather than
        // a nearly full-shot drift that can hide the semantic difference.
        const leadEstablish = THREE.MathUtils.smootherstep(
          clamp01(t),
          0.05,
          0.34,
        );
        const baseTarget = pose.target.clone();
        const desiredTarget = baseTarget.clone();
        const leadDistance = Math.max(
          0.95,
          radius * 2.35 * step.strength,
        ) * leadEstablish;
        desiredTarget.addScaledVector(direction, leadDistance);
        const screenTravel = direction.dot(right);
        if (Math.abs(screenTravel) > 0.12) {
          const screenLeadRoom =
            Math.max(0.22, radius * 0.44) * leadEstablish;
          desiredTarget.addScaledVector(
            right,
            Math.sign(screenTravel) * screenLeadRoom,
          );
        }

        if (targetActor && Math.abs(screenTravel) > 0.001) {
          const targetSample = sampleDirectorActorState(
            moment,
            targetActor,
            progress,
            actors,
            sceneState,
          );
          pose.target.copy(
            constrainLeadTargetConstantTime({
              pose,
              desired_target: desiredTarget,
              actor: targetActor,
              sample: targetSample,
              right,
            }),
          );
        } else {
          pose.target.copy(desiredTarget);
        }
      } else {
        // Historical A.5/A.6 verifier contract retained: Lag is a delayed tracking response.
        // Phase 1B.7A.8 keeps the successful A.7 temporal event but removes the
        // loom/zoom read exposed by the vehicle reel. Most of the visible lag now
        // comes from the delayed look relationship; the physical rig falls behind
        // only modestly, so apparent subject size stays close to Follow while the
        // actor still pulls ahead and the camera visibly catches back up.
        const lagT = clamp01(t);
        const lagRise = THREE.MathUtils.smootherstep(lagT, 0.12, 0.36);
        const lagRecover =
          1 - THREE.MathUtils.smootherstep(lagT, 0.62, 0.94);
        const lagEnvelope = Math.min(lagRise, lagRecover);
        const lagDistance =
          Math.max(0.34, radius * 0.82 * step.strength) * lagEnvelope;
        pose.position.addScaledVector(direction, -lagDistance * 0.18);
        pose.target.addScaledVector(direction, -lagDistance * 1.05);
      }
      break;
    }
    case "crane": {
      const amount = movementDistance(step, radius, 2.2);
      pose.position.y += amount * t;
      pose.position.addScaledVector(forward, -amount * 0.65 * t);
      break;
    }
    case "reframe": {
      if (shot.camera.focus_entity_ids.length > 1) {
        const first = actorById(actors, shot.camera.focus_entity_ids[0]);
        const second = actorById(actors, shot.camera.focus_entity_ids[1]);
        if (first && second) {
          const a = sampleDirectorActorState(moment, first, progress, actors, sceneState).position;
          const b = sampleDirectorActorState(moment, second, progress, actors, sceneState).position;
          pose.target.lerpVectors(a, b, t);
        }
      }
      break;
    }
    case "rise_reveal": {
      const amount = movementDistance(step, radius, 2.0);
      pose.position.y += amount * t;
      pose.position.addScaledVector(forward, -amount * 0.35 * t);
      break;
    }
    case "spline": {
      const absolutePoints = Array.isArray(step.parameters.points)
        ? step.parameters.points
            .map((point) => Array.isArray(point) && point.length >= 3 ? vecParam(point, [0, 0, 0]) : null)
            .filter((point): point is THREE.Vector3 => Boolean(point))
        : [];
      const targetRelativePoints =
        step.coordinate_space === "target_relative" &&
        Array.isArray(step.parameters.target_relative_points)
          ? step.parameters.target_relative_points
              .map((point) =>
                Array.isArray(point) && point.length >= 3
                  ? vecParam(point, [0, 0, 0])
                  : null,
              )
              .filter((point): point is THREE.Vector3 => Boolean(point))
              .map((point) => pose.target.clone().add(point))
          : [];
      const points =
        absolutePoints.length >= 2
          ? absolutePoints
          : targetRelativePoints.length >= 2
            ? [
                ...(step.parameters.prepend_current_pose === true
                  ? [pose.position.clone()]
                  : []),
                ...targetRelativePoints,
              ]
            : [];
      if (points.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
        pose.position.copy(curve.getPoint(clamp01(t)));
      } else {
        // Compatibility fallback for legacy spline cues that carry no waypoints.
        pose.position.addScaledVector(right, Math.sin(t * Math.PI) * radius * step.strength);
        pose.position.y += Math.sin(t * Math.PI) * radius * 0.35 * step.strength;
      }
      break;
    }
    case "object_attached": {
      if (targetActor) {
        const sample = sampleDirectorActorState(moment, targetActor, progress, actors, sceneState);
        const defaultMount = defaultActorLocalMountedPosition(targetActor, radius);
        const defaultViewDirection = defaultActorLocalMountedViewDirection();
        const localMount = vecParam(step.parameters.offset, [
          defaultMount.x,
          defaultMount.y,
          defaultMount.z,
        ]);
        const localViewDirection = vecParam(
          step.parameters.view_direction,
          [
            defaultViewDirection.x,
            defaultViewDirection.y,
            defaultViewDirection.z,
          ],
        );
        const mounted = solveDirectorMountedCameraRelationship({
          mode: "blend_in",
          base_position: pose.position,
          base_target: pose.target,
          actor: targetActor,
          sample,
          radius,
          blend_progress: t,
          local_mount: localMount,
          local_view_direction: localViewDirection,
          look_distance_m: numberParam(
            step.parameters.look_distance_m,
            Math.max(3.4, radius * 4.2),
          ),
        });

        // camera_object_attached is now a legacy semantic entry compiled through
        // the same mounted-camera primitive as the immediate object_attached view.
        pose.position.copy(mounted.position);
        pose.target.copy(mounted.target);
      }
      break;
    }
    case "pass_through": {
      const amount = Math.min(distance * 1.45, movementDistance(step, radius, 4.5));
      pose.position.addScaledVector(forward, amount * t);
      break;
    }
    case "settle": {
      const micro = (1 - t) * Math.sin(t * Math.PI * 2) * radius * 0.035 * step.strength;
      pose.position.addScaledVector(right, micro);
      break;
    }
    case "semantic":
      break;
    default:
      assertDirectorRuntimeNever(runtimeMovement, "DirectorCameraMovement");
  }
}

const DIRECTOR_COMPOSITION_REFERENCE_ASPECT_RATIO = 16 / 9;
const DIRECTOR_THIRD_SCREEN_NDC_OFFSET = 1 / 3;

function screenAnchorOffset(
  shot: DirectorShotDirectionV2,
  position: THREE.Vector3,
  target: THREE.Vector3,
  radius: number,
  fovDegrees: number,
) {
  const forward = target.clone().sub(position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
  const offset = new THREE.Vector3();
  const horizontal = radius * 0.48;
  const vertical = radius * 0.34;

  // A.11A.20: left/right thirds are screen-space promises, not small generic
  // target nudges. Solve the aim offset from camera distance + FOV so a 16:9
  // cinematic frame places the focused target near the actual 1/3 or 2/3 line.
  // Keep center-left/right and negative-space strengths on their previously
  // qualified radius-relative behavior.
  const safeFovDegrees = THREE.MathUtils.clamp(fovDegrees || 44, 10, 100);
  const thirdsHorizontal =
    Math.max(0.1, position.distanceTo(target)) *
    Math.tan(THREE.MathUtils.degToRad(safeFovDegrees * 0.5)) *
    DIRECTOR_COMPOSITION_REFERENCE_ASPECT_RATIO *
    DIRECTOR_THIRD_SCREEN_NDC_OFFSET;

  switch (shot.composition.screen_anchor) {
    case "left_third": offset.addScaledVector(right, thirdsHorizontal); break;
    case "right_third": offset.addScaledVector(right, -thirdsHorizontal); break;
    case "center_left": offset.addScaledVector(right, horizontal * 0.6); break;
    case "center_right": offset.addScaledVector(right, -horizontal * 0.6); break;
    case "upper_third": offset.y -= vertical; break;
    case "lower_third": offset.y += vertical; break;
    case "center": break;
    default: assertDirectorRuntimeNever(shot.composition.screen_anchor, "DirectorScreenAnchor");
  }
  if (shot.composition.negative_space_side === "left") offset.addScaledVector(right, -horizontal * 0.45);
  if (shot.composition.negative_space_side === "right") offset.addScaledVector(right, horizontal * 0.45);
  return offset;
}

export function sampleDirectorCameraPose(
  moment: DirectorMoment,
  progress: number,
  actors: DirectorRuntimeActor[],
  sceneState?: DirectorSceneState | null,
): DirectorCameraPose {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const p = clamp01(progress);
  const actorRelativeCamera =
    shot.composition.angle === "object_attached" ||
    shot.composition.framing === "point_of_view" ||
    shot.composition.framing === "over_shoulder" ||
    shot.camera.movement_steps.some((step) =>
      ["follow", "track", "lead_subject", "lag_follow", "track_parallel", "object_attached"].includes(step.movement),
    );
  // Camera composition is world-fixed unless the Director explicitly selects an
  // actor-relative framing or tracking move. This keeps `static` truly static
  // while allowing POV, over-shoulder, and attached views to follow their source.
  const compositionProgress = actorRelativeCamera ? p : 0;
  const samples = targetActors(moment, shot, compositionProgress, actors, sceneState);
  let target = averageTarget(samples);
  const shotScaleTargetHeightRatio = shotScaleUpperSubjectTargetHeightRatio(
    shot.composition.framing,
    samples,
  );
  if (shotScaleTargetHeightRatio !== null && samples.length === 1) {
    const entry = samples[0]!;
    target.copy(entry.sample.position).add(
      new THREE.Vector3(
        0,
        Math.abs(entry.actor.size[1] * entry.sample.scale.y) *
          shotScaleTargetHeightRatio,
        0,
      ),
    );
  }
  if (shot.composition.framing === "macro" && samples.length === 1) {
    // Tiny controlled/semantic features need geometric-centre targeting. Eye
    // offsets are useful for actors, but they can push a fastener toward the
    // frame edge when the feature itself is only a few centimetres across.
    target.copy(samples[0]!.sample.position);
  }
  const startsOnFirstFocus = shot.camera.movement_steps.some((step) =>
    step.movement === "reframe" ||
    step.movement === "reverse_reveal" ||
    step.movement === "pan"
  );
  if (startsOnFirstFocus && shot.camera.focus_entity_ids.length > 1) {
    const first = actorById(actors, shot.camera.focus_entity_ids[0]);
    if (first) {
      const firstSample = sampleDirectorActorState(moment, first, compositionProgress, actors, sceneState);
      target.copy(actorEyePoint(first, firstSample));
    }
  }

  const minimumFocusRadius =
    shot.composition.framing === "macro"
      ? 0.12
      : shot.composition.framing === "insert"
        ? 0.16
        : shot.composition.framing === "cutaway"
          ? 0.28
          : 0.8;
  const radius = focusRadius(samples, minimumFocusRadius);
  const fov = THREE.MathUtils.clamp(shot.lens.field_of_view_degrees || 44, 10, 100);
  const framing = shotScaleFramingFactor(
    shot.composition.framing,
    samples,
  );
  const perspectiveCompensation = 44 / fov;
  const minimumCameraDistance =
    shot.composition.framing === "macro"
      ? 0.44
      : shot.composition.framing === "insert"
        ? 0.42
        : shot.composition.framing === "cutaway"
          ? 0.7
          : 1.2;
  const cameraOffsetDirection = angleDirection(shot.composition.angle).normalize();
  const layeredDepthComposition = isLayeredDepthComposition(shot);
  const insertEnvelopeFitComposition =
    samples.length === 1 && shot.composition.framing === "insert";
  const relationshipEnvelopeFitComposition =
    samples.length >= 2 &&
    ["two_shot", "group_shot", "cutaway"].includes(shot.composition.framing);
  const distance = shot.composition.angle === "isometric"
    ? Math.max(3.2, radius * 4.05)
    : layeredDepthComposition
      ? layeredDepthProjectedFitDistance(
          samples,
          target,
          cameraOffsetDirection,
          fov,
          Math.max(
            minimumCameraDistance,
            radius * framing * perspectiveCompensation * 0.72,
          ),
        )
      : insertEnvelopeFitComposition
        ? layeredDepthProjectedFitDistance(
            samples,
            target,
            cameraOffsetDirection,
            fov,
            minimumCameraDistance,
            {
              safe_half_width: 0.72,
              safe_half_height: 0.72,
              breathing_multiplier: 1.03,
            },
          )
        : relationshipEnvelopeFitComposition
          ? layeredDepthProjectedFitDistance(
              samples,
              target,
              cameraOffsetDirection,
              fov,
              minimumCameraDistance,
              {
                safe_half_width: 0.82,
                safe_half_height: 0.78,
                breathing_multiplier: 1.025,
              },
            )
          : Math.max(
              minimumCameraDistance,
              radius * framing * perspectiveCompensation,
            );
  const resolvedFov = shot.composition.angle === "isometric"
    ? Math.min(fov, 28)
    : fov;

  let position: THREE.Vector3;
  const foregroundActor = cameraRelationshipActor(moment, shot, actors, "foreground");
  const focusActor = cameraRelationshipActor(moment, shot, actors, "focus");

  if (
    shot.composition.framing === "over_shoulder" &&
    foregroundActor &&
    focusActor &&
    foregroundActor.id !== focusActor.id
  ) {
    const foregroundSample = sampleDirectorActorState(moment, foregroundActor, compositionProgress, actors, sceneState);
    const focusSample = sampleDirectorActorState(moment, focusActor, compositionProgress, actors, sceneState);
    const foregroundEye = actorEyePoint(foregroundActor, foregroundSample);
    const focusEye = actorEyePoint(focusActor, focusSample);
    const { forward, right } = stableViewBasis(foregroundEye, focusEye);
    const foregroundRadius = actorRadius(foregroundActor);
    const backOffset = Math.max(
      0.5,
      foregroundRadius * 0.92,
      Math.abs(foregroundActor.size[2]) * 0.72,
    );
    const shoulderOffset = Math.max(
      0.32,
      foregroundRadius * 0.52,
      Math.abs(foregroundActor.size[0]) * 0.5,
    );
    position = foregroundEye
      .clone()
      .addScaledVector(forward, -backOffset)
      .addScaledVector(right, shoulderOffset)
      // Visual review showed the Phase 1B.3 proof sitting slightly above the
      // shoulder line. Keep the same clearance but lower the optical centre so
      // the foreground actor reads as a shoulder rather than a low aerial view.
      .add(new THREE.Vector3(0, -Math.max(0.035, foregroundActor.size[1] * 0.045), 0));
    target = focusEye.clone().add(new THREE.Vector3(0, -focusActor.size[1] * 0.035, 0));
  } else if (shot.composition.framing === "point_of_view" && foregroundActor) {
    const foregroundSample = sampleDirectorActorState(moment, foregroundActor, compositionProgress, actors, sceneState);
    const foregroundEye = actorEyePoint(foregroundActor, foregroundSample);
    const focusSample = focusActor && focusActor.id !== foregroundActor.id
      ? sampleDirectorActorState(moment, focusActor, compositionProgress, actors, sceneState)
      : null;
    const desiredTarget = focusSample && focusActor
      ? actorEyePoint(focusActor, focusSample)
      : foregroundEye.clone().add(
          new THREE.Vector3(0, 0, 3).applyEuler(foregroundSample.rotation),
        );
    const { forward } = stableViewBasis(foregroundEye, desiredTarget);
    const faceClearance = Math.max(
      0.16,
      Math.abs(foregroundActor.size[2]) * 0.54,
      actorRadius(foregroundActor) * 0.22,
    );
    position = foregroundEye.clone().addScaledVector(forward, faceClearance);
    target = desiredTarget;
  } else if (shot.composition.angle === "object_attached" && foregroundActor) {
    const foregroundSample = sampleDirectorActorState(moment, foregroundActor, compositionProgress, actors, sceneState);
    const mounted = solveDirectorMountedCameraRelationship({
      mode: "immediate",
      base_position: foregroundSample.position,
      base_target: target,
      actor: foregroundActor,
      sample: foregroundSample,
      radius,
    });
    // The camera-angle form is the immediate mode of the same canonical
    // mounted-camera relationship used by camera_object_attached's blend-in mode.
    position = mounted.position;
    target = mounted.target;
  } else {
    const direction = cameraOffsetDirection.clone();
    position = target.clone().add(direction.multiplyScalar(distance));
    if (shot.composition.angle === "ground_level") {
      position.y = Math.max(0.12, Math.min(position.y, 0.2));
    } else if (shot.composition.angle === "low_angle") {
      position.y = Math.max(0.18, Math.min(position.y, target.y * 0.55));
    }
  }

  const pose: DirectorCameraPose = {
    position,
    target: target.clone(),
    fov: resolvedFov,
    roll: shot.composition.angle === "dutch_angle" ? THREE.MathUtils.degToRad(12) : 0,
  };

  pose.target.add(screenAnchorOffset(shot, pose.position, pose.target, radius, resolvedFov));

  for (const step of shot.camera.movement_steps) {
    applyMovementStep(pose, step, stepProgress(step, p), moment, shot, actors, radius, p, sceneState);
  }

  return pose;
}

export function legacyShotForMoment(moment: DirectorMoment): DirectorShotDirectionV2 {
  const legacyShot = moment.camera.shot_type;
  const framing = legacyShot === "wide"
    ? "wide"
    : legacyShot === "close_up"
      ? "close"
      : legacyShot === "macro"
        ? "macro"
        : "medium";
  const angle = legacyShot === "top_down"
    ? "top_down"
    : legacyShot === "isometric"
      ? "isometric"
      : legacyShot === "side_profile"
        ? "side_profile"
        : "three_quarter_front";
  return {
    narrative_job: "orient",
    visual_claim: moment.director_intent,
    composition: {
      framing,
      angle,
      screen_anchor: "center",
      keep_visible_entity_ids: moment.camera.keep_visible_entity_ids,
      foreground_entity_ids: [],
      background_entity_ids: [],
      preserve_relationship_entity_ids: [],
      preserve_relative_scale: false,
      caption_safe_region: "auto",
      negative_space_side: "none",
    },
    lens: {
      preset: framing === "wide" ? "wide" : framing === "macro" ? "macro" : "normal",
      focal_length_mm: framing === "wide" ? 28 : framing === "macro" ? 100 : 50,
      field_of_view_degrees: framing === "wide" ? 58 : framing === "macro" ? 28 : 44,
      depth_of_field: "deep",
      aperture_f: 5.6,
      focus_entity_id: moment.camera.focus_entity_ids[0] ?? null,
    },
    camera: {
      focus_entity_ids: moment.camera.focus_entity_ids,
      movement_steps: [{
        movement: moment.camera.movement,
        start_progress: 0,
        end_progress: 1,
        strength: moment.camera.movement === "static" ? 0 : 0.55,
        easing: "ease_in_out",
        coordinate_space: "target_relative",
        target_entity_id: moment.camera.focus_entity_ids[0] ?? null,
        parameters: {},
      }],
      start_intent: moment.camera.framing_intent,
      end_intent: moment.camera.framing_intent,
      movement_reason: moment.camera.framing_intent,
    },
    blocking: [],
    constraints: [],
    lighting: {
      intents: ["neutral_studio"],
      motivated_source_entity_id: null,
      emphasized_entity_ids: moment.active_entity_ids,
      preserve_shadow_entity_ids: [],
    },
    continuity: {
      rules: ["keep_visible", "avoid_occlusion"],
      maximum_occlusion_ratio: 0.2,
      maintain_axis_entity_ids: [],
    },
    reveal_at: null,
    hold_after_ms: 600,
    success_observation: moment.success_observation ?? null,
  };
}

function buildPerspectiveCamera(pose: DirectorCameraPose) {
  const camera = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.05, 200);
  camera.position.copy(pose.position);
  camera.up.copy(UP);
  camera.lookAt(pose.target);
  if (pose.roll) camera.rotateZ(pose.roll);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

export type DirectorProjectedActorCenter = {
  actor_id: string;
  progress: number;
  ndc: DirectorRuntimeVec3;
  visible_in_safe_frame: boolean;
  camera_distance_m: number;
  camera_depth_m: number;
};

/**
 * Renderer-neutral projection evidence for qualification/regression checks.
 * This measures the actor centre against the exact Director camera solve; it
 * does not replace full silhouette/crop/occlusion testing.
 */
export function projectDirectorActorCenter(
  moment: DirectorMoment,
  actors: DirectorRuntimeActor[],
  actorId: string,
  progress = 0,
  sceneState?: DirectorSceneState | null,
): DirectorProjectedActorCenter | null {
  const actor = actorById(actors, actorId);
  if (!actor) return null;

  const pose = sampleDirectorCameraPose(moment, progress, actors, sceneState);
  const camera = buildPerspectiveCamera(pose);
  const sampled = sampleDirectorActorState(
    moment,
    actor,
    progress,
    actors,
    sceneState,
  );
  const center = sampled.position
    .clone()
    .add(new THREE.Vector3(0, actor.size[1] * 0.45, 0));
  const ndc = center.clone().project(camera);
  const forward = pose.target.clone().sub(pose.position);
  if (forward.lengthSq() < 0.000001) forward.set(0, 0, -1);
  else forward.normalize();
  const toActor = center.clone().sub(pose.position);

  return {
    actor_id: actorId,
    progress: clamp01(progress),
    ndc: [ndc.x, ndc.y, ndc.z],
    visible_in_safe_frame:
      ndc.z >= -1 &&
      ndc.z <= 1 &&
      Math.abs(ndc.x) <= 0.96 &&
      Math.abs(ndc.y) <= 0.92,
    camera_distance_m: toActor.length(),
    camera_depth_m: toActor.dot(forward),
  };
}

export type DirectorProjectedActorEnvelope = {
  actor_id: string;
  progress: number;
  min_ndc_x: number;
  max_ndc_x: number;
  min_ndc_y: number;
  max_ndc_y: number;
  width_ndc: number;
  height_ndc: number;
  screen_area_fraction: number;
  fully_inside_safe_frame: boolean;
};

/**
 * Approximate projected actor silhouette from the Director runtime box dimensions.
 * This is deliberately renderer-neutral qualification evidence: it catches
 * microscopic/cropped staging without pretending to replace mesh-level bounds.
 */
export function projectDirectorActorEnvelope(
  moment: DirectorMoment,
  actors: DirectorRuntimeActor[],
  actorId: string,
  progress = 0,
  sceneState?: DirectorSceneState | null,
): DirectorProjectedActorEnvelope | null {
  const actor = actorById(actors, actorId);
  if (!actor) return null;

  const pose = sampleDirectorCameraPose(moment, progress, actors, sceneState);
  const sampled = sampleDirectorActorState(
    moment,
    actor,
    progress,
    actors,
    sceneState,
  );
  const envelope = projectActorEnvelopeAgainstPose(pose, actor, sampled);
  return {
    actor_id: actorId,
    progress: clamp01(progress),
    ...envelope,
  };
}

function isCenterOccluded(
  cameraPosition: THREE.Vector3,
  targetActor: DirectorRuntimeActor,
  targetPosition: THREE.Vector3,
  actors: DirectorRuntimeActor[],
  moment: DirectorMoment,
  progress: number,
  sceneState?: DirectorSceneState | null,
) {
  const direction = targetPosition.clone().sub(cameraPosition);
  const targetDistance = direction.length();
  if (targetDistance < 0.01) return false;
  const ray = new THREE.Ray(cameraPosition.clone(), direction.normalize());
  for (const actor of actors) {
    if (actor.id === targetActor.id) continue;
    const sampled = sampleDirectorActorState(moment, actor, progress, actors, sceneState);
    const sphere = new THREE.Sphere(
      sampled.position.clone().add(new THREE.Vector3(0, actor.size[1] * 0.45, 0)),
      actorRadius(actor) * 0.72,
    );
    const hit = ray.intersectSphere(sphere, new THREE.Vector3());
    if (hit && hit.distanceTo(cameraPosition) < targetDistance - actorRadius(targetActor) * 0.35) return true;
  }
  return false;
}

function allowedMotionContact(
  moment: DirectorMoment,
  leftId: string,
  rightId: string,
) {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const pairMatches = (a: string | null | undefined, b: string | null | undefined) =>
    (a === leftId && b === rightId) || (a === rightId && b === leftId);
  if (shot.blocking.some((cue) =>
    ["on_surface", "inside", "attached_to"].includes(cue.relation) &&
    pairMatches(cue.actor_entity_id, cue.target_entity_id)
  )) return true;
  return shot.constraints.some((cue) =>
    (cue.kind === "attach" && pairMatches(cue.actor_entity_id, cue.target_entity_id)) ||
    (cue.kind === "rigid_link" && (
      pairMatches(cue.actor_entity_id, cue.target_entity_id) ||
      pairMatches(cue.actor_entity_id, cue.secondary_target_entity_id)
    ))
  );
}

export function validateDirectorShot(
  moment: DirectorMoment,
  actors: DirectorRuntimeActor[],
  sampleCount = 13,
  sceneState?: DirectorSceneState | null,
): DirectorShotValidation {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const required = Array.from(new Set([
    ...shot.composition.keep_visible_entity_ids,
    ...moment.keeps_visible_entity_ids,
    ...shot.camera.focus_entity_ids,
  ])).filter((id) => actors.some((actor) => actor.id === id));

  let visibleChecks = 0;
  let visibleHits = 0;
  let occlusionChecks = 0;
  let occlusionHits = 0;
  let actorCollisionChecks = 0;
  let actorCollisionHits = 0;
  let minimumClearance = Number.POSITIVE_INFINITY;
  let pathClear = true;

  for (let index = 0; index < sampleCount; index += 1) {
    const progress = sampleCount <= 1 ? 0 : index / (sampleCount - 1);
    const pose = sampleDirectorCameraPose(moment, progress, actors, sceneState);
    const camera = buildPerspectiveCamera(pose);

    for (const actor of actors) {
      const sampled = sampleDirectorActorState(moment, actor, progress, actors, sceneState);
      const center = sampled.position.clone().add(new THREE.Vector3(0, actor.size[1] * 0.45, 0));
      const clearance = pose.position.distanceTo(center) - actorRadius(actor);
      if (!shot.camera.focus_entity_ids.includes(actor.id)) {
        minimumClearance = Math.min(minimumClearance, clearance);
        if (clearance < Math.max(0.08, actorRadius(actor) * 0.12)) pathClear = false;
      }
    }

    for (let leftIndex = 0; leftIndex < actors.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < actors.length; rightIndex += 1) {
        const left = actors[leftIndex]!;
        const rightActor = actors[rightIndex]!;
        if (allowedMotionContact(moment, left.id, rightActor.id)) continue;
        const leftSample = sampleDirectorActorState(moment, left, progress, actors, sceneState);
        const rightSample = sampleDirectorActorState(moment, rightActor, progress, actors, sceneState);
        const threshold = (actorRadius(left) + actorRadius(rightActor)) * 0.58;
        actorCollisionChecks += 1;
        if (leftSample.position.distanceTo(rightSample.position) < threshold) actorCollisionHits += 1;
      }
    }

    for (const id of required) {
      const actor = actorById(actors, id);
      if (!actor) continue;
      const sampled = sampleDirectorActorState(moment, actor, progress, actors, sceneState);
      const center = sampled.position.clone().add(new THREE.Vector3(0, actor.size[1] * 0.45, 0));
      const ndc = center.clone().project(camera);
      visibleChecks += 1;
      if (ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= 0.96 && Math.abs(ndc.y) <= 0.92) visibleHits += 1;
      occlusionChecks += 1;
      if (isCenterOccluded(pose.position, actor, center, actors, moment, progress, sceneState)) occlusionHits += 1;
    }
  }

  const visibleFraction = visibleChecks ? visibleHits / visibleChecks : 1;
  const occlusionRatio = occlusionChecks ? occlusionHits / occlusionChecks : 0;
  const actorCollisionRatio = actorCollisionChecks ? actorCollisionHits / actorCollisionChecks : 0;
  const allowedOcclusion = shot.continuity.maximum_occlusion_ratio;
  const warnings: string[] = [];
  if (!pathClear) warnings.push("The sampled camera path enters another actor's clearance volume.");
  if (visibleFraction < 0.88) warnings.push("A required teaching actor leaves the safe frame during part of the shot.");
  if (occlusionRatio > allowedOcclusion) warnings.push(`Approximate occlusion ${Math.round(occlusionRatio * 100)}% exceeds the declared ${Math.round(allowedOcclusion * 100)}% limit.`);
  if (actorCollisionRatio > 0.04) warnings.push(`Sampled actor motion overlaps in ${Math.round(actorCollisionRatio * 100)}% of non-contact pair checks; review motion constraints or spacing.`);

  return {
    sample_count: sampleCount,
    camera_path_clear: pathClear,
    minimum_camera_clearance_m: Number.isFinite(minimumClearance) ? Number(minimumClearance.toFixed(3)) : 999,
    required_visible_fraction: Number(visibleFraction.toFixed(3)),
    approximate_occlusion_ratio: Number(occlusionRatio.toFixed(3)),
    approximate_actor_collision_ratio: Number(actorCollisionRatio.toFixed(3)),
    actor_motion_clear: actorCollisionRatio <= 0.04,
    required_visible_entity_ids: required,
    warnings,
  };
}


function runtimeProgressFor(
  clockElapsedSeconds: number,
  moment: DirectorMoment,
  progress: number | undefined,
  autoLoop: boolean,
) {
  if (typeof progress === "number") return clamp01(progress);
  if (!autoLoop) return 0;
  const duration = Math.max(1000, moment.duration_ms);
  return ((clockElapsedSeconds * 1000) % duration) / duration;
}

function DirectorMotivatedLight({
  moment,
  actors,
  progress,
  autoLoop,
  sceneState,
  mode,
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  progress?: number;
  autoLoop: boolean;
  sceneState?: DirectorSceneState | null;
  mode: "motivated" | "track" | "reveal" | "emissive";
}) {
  const lightRef = useRef<THREE.PointLight>(null);
  const shot = moment.shot ?? legacyShotForMoment(moment);

  useFrame(({ clock }) => {
    const light = lightRef.current;
    if (!light) return;
    const p = runtimeProgressFor(clock.elapsedTime, moment, progress, autoLoop);
    const sourceId = mode === "motivated"
      ? shot.lighting.motivated_source_entity_id
      : shot.lighting.emphasized_entity_ids[0] ?? shot.camera.focus_entity_ids[0];
    const actor = actorById(actors, sourceId);
    const sample = actor
      ? sampleDirectorActorState(moment, actor, p, actors, sceneState)
      : null;
    const base = sample?.position ?? averageTarget(targetActors(moment, shot, p, actors, sceneState));
    light.position.copy(base).add(new THREE.Vector3(0, actor ? actor.size[1] * 0.65 : 1.6, 0.5));
    const revealStart = shot.reveal_at ?? 0.48;
    const revealAmount = mode === "reveal"
      ? easeValue((p - revealStart) / Math.max(0.08, 1 - revealStart), "ease_out")
      : 1;
    const intensity = mode === "track"
      ? 4.4
      : mode === "emissive"
        ? 3.2
        : mode === "motivated"
          ? 3.6
          : 4.8 * revealAmount;
    light.intensity = intensity;
  });

  return (
    <pointLight
      ref={lightRef}
      castShadow={mode !== "emissive"}
      intensity={mode === "reveal" ? 0 : 3.4}
      color={mode === "track" ? "#f8fafc" : mode === "emissive" ? "#67e8f9" : "#fb923c"}
      distance={mode === "track" ? 8 : 10}
      decay={2}
    />
  );
}

/**
 * Semantic light rig shared by the isolated Capability Library and the
 * Asset Scene Builder. It intentionally stays renderer-neutral in contract:
 * Blender may compile the same intents into a much richer production rig.
 */
export function DirectorShotLightingRig({
  moment,
  actors,
  progress,
  autoLoop = false,
  sceneState,
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  progress?: number;
  autoLoop?: boolean;
  sceneState?: DirectorSceneState | null;
}) {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const intents = new Set(shot.lighting.intents);
  const lowKey = intents.has("low_key") || intents.has("dim_environment");
  const highKey = intents.has("high_key");
  const backlit = intents.has("backlit") || intents.has("preserve_shadow") || intents.has("shadow_projection");
  const rim = intents.has("rim_lit");
  const spotlight = intents.has("spotlight_subject");
  const warmCool = intents.has("warm_cool_contrast");
  const exposureShift = intents.has("exposure_shift");
  // highlight_subject is a renderer-owned silhouette treatment, not a light.
  // Do not synthesize a spotlight here; actor renderers own the tight outline.

  return (
    <>
      <ambientLight intensity={lowKey ? 0.1 : highKey ? 0.95 : 0.42} />
      <hemisphereLight
        args={[highKey ? "#ffffff" : "#dbeafe", "#0f172a", highKey ? 1.35 : lowKey ? 0.35 : 0.68]}
        position={[0, 6, 0]}
      />
      <directionalLight
        castShadow
        position={backlit ? [-4, 6, -6] : [5, 7, 5]}
        intensity={exposureShift ? 1.3 : lowKey ? 0.9 : highKey ? 2.7 : 1.9}
        color={warmCool ? "#f59e0b" : backlit ? "#fef3c7" : "#ffffff"}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight
        position={rim ? [-4, 4, -4] : [-4, 2, 2]}
        intensity={rim ? 3.1 : lowKey ? 0.28 : 0.72}
        color={warmCool ? "#38bdf8" : rim ? "#7dd3fc" : "#93c5fd"}
      />
      {spotlight ? (
        <spotLight
          castShadow
          position={[0, 7.5, 3.4]}
          angle={0.38}
          penumbra={0.62}
          intensity={6.2}
          color="#f8fafc"
        />
      ) : null}
      {intents.has("motivated_source") ? (
        <DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} sceneState={sceneState} mode="motivated" />
      ) : null}
      {intents.has("track_spotlight") ? (
        <DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} sceneState={sceneState} mode="track" />
      ) : null}
      {intents.has("light_reveal") ? (
        <DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} sceneState={sceneState} mode="reveal" />
      ) : null}
      {intents.has("emissive_subject") || intents.has("volumetric_beam") ? (
        <DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} sceneState={sceneState} mode="emissive" />
      ) : null}
    </>
  );
}

export function DirectorShotCameraController({
  moment,
  actors,
  progress,
  isPlaying = true,
  autoLoop = false,
  sceneState,
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  progress?: number;
  isPlaying?: boolean;
  autoLoop?: boolean;
  sceneState?: DirectorSceneState | null;
}) {
  const { camera, invalidate } = useThree();
  const lastPausedProgress = useRef<number | null>(null);
  const lastRuntimeProgress = useRef<number | null>(null);
  const lastMomentId = useRef<string | null>(null);
  const smoothedTarget = useRef(new THREE.Vector3());
  const targetReady = useRef(false);

  // Demand-rendered viewers must explicitly schedule a frame when a paused
  // Director input changes. React may keep the same progress value (usually 0)
  // while switching to a different capability/moment, so progress alone cannot
  // be the wake-up signal.
  useEffect(() => {
    invalidate();
  }, [actors, invalidate, moment, progress]);

  // Phase 1B.5A additive wake-up: incoming cross-moment state may change while
  // the selected moment/progress remain stable. Keep the qualified Phase 1B.3.3.1
  // invalidation seam above unchanged and wake separately for state changes.
  useEffect(() => {
    invalidate();
  }, [invalidate, sceneState]);

  useFrame(({ clock }, delta) => {
    const runtimeProgress = typeof progress === "number"
      ? clamp01(progress)
      : autoLoop
        ? ((clock.elapsedTime * 1000) % Math.max(1000, moment.duration_ms)) / Math.max(1000, moment.duration_ms)
        : 0;
    const changedMoment = lastMomentId.current !== moment.id;
    // A paused frame may reuse the same numeric progress for a newly selected
    // capability. Do not let the cached progress hide that moment change.
    if (
      !isPlaying &&
      lastPausedProgress.current === runtimeProgress &&
      !changedMoment
    ) {
      return;
    }

    const pose = sampleDirectorCameraPose(moment, runtimeProgress, actors, sceneState);
    const rewound = lastRuntimeProgress.current !== null && runtimeProgress + 0.02 < lastRuntimeProgress.current;
    const authoredStart = runtimeProgress <= 0.001;
    // The authored t=0 pose is authoritative. This prevents the first playback
    // frame from easing out of a stale/manual camera before the Director rig
    // takes control.
    const snap =
      !isPlaying && !autoLoop ||
      authoredStart ||
      rewound ||
      changedMoment ||
      !targetReady.current;
    const positionAlpha = 1 - Math.exp(-9.5 * Math.min(0.05, Math.max(0, delta)));
    const targetAlpha = 1 - Math.exp(-12 * Math.min(0.05, Math.max(0, delta)));

    if (snap) {
      camera.position.copy(pose.position);
      smoothedTarget.current.copy(pose.target);
      targetReady.current = true;
    } else {
      camera.position.lerp(pose.position, positionAlpha);
      smoothedTarget.current.lerp(pose.target, targetAlpha);
    }

    camera.up.copy(UP);
    camera.lookAt(smoothedTarget.current);
    if (pose.roll) camera.rotateZ(pose.roll);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = snap
        ? pose.fov
        : THREE.MathUtils.lerp(camera.fov, pose.fov, targetAlpha);
      camera.updateProjectionMatrix();
    }

    lastPausedProgress.current = isPlaying || autoLoop ? null : runtimeProgress;
    lastRuntimeProgress.current = runtimeProgress;
    lastMomentId.current = moment.id;
  });

  return null;
}

export function DirectorShotPathGuide({
  moment,
  actors,
  color = "#38bdf8",
  sceneState,
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  color?: string;
  sceneState?: DirectorSceneState | null;
}) {
  const points = useMemo(
    () => Array.from({ length: 48 }, (_, index) => sampleDirectorCameraPose(moment, index / 47, actors, sceneState).position),
    [actors, moment, sceneState],
  );
  return (
    <group>
      <Line points={points} color={color} lineWidth={1.5} transparent opacity={0.72} />
      <mesh position={points[0]}><sphereGeometry args={[0.08, 14, 14]} /><meshBasicMaterial color="#22c55e" /></mesh>
      <mesh position={points[points.length - 1]}><sphereGeometry args={[0.08, 14, 14]} /><meshBasicMaterial color="#f97316" /></mesh>
    </group>
  );
}
