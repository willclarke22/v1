
export type RuntimeVec3 = [number, number, number];

export type RuntimeActorPose = {
  visible: boolean;
  position: RuntimeVec3;
  rotation: RuntimeVec3;
  scale: number;
  opacity: number;
  emphasis: number;
};

export type RuntimeCameraPose = {
  position: RuntimeVec3;
  target: RuntimeVec3;
  fov: number;
};

export type RuntimeActorRole =
  | "tray"
  | "apple"
  | "burger"
  | "nigiri"
  | "cow"
  | "chicken"
  | "goldfish"
  | "hand";

export type RuntimeAssetInteractionPhase =
  | "approach"
  | "contact"
  | "retreat";

export type RuntimeAssetInteractionIntent = {
  id: string;
  kind: "touch" | "nudge" | "push";
  sourceRole: RuntimeActorRole;
  targetRole: RuntimeActorRole;
  phase: RuntimeAssetInteractionPhase;
  phaseProgress: number;
  approachDirection: RuntimeVec3;
  preferredTargetSide:
    | "left"
    | "right"
    | "front"
    | "back"
    | "top"
    | "bottom"
    | "unknown";
  contactClearanceM: number;
  obstacleClearanceM: number;
  obstacleRoles: RuntimeActorRole[];
  maintainContact: boolean;
};

export type RuntimeDirectionalClearanceConstraint = {
  id: string;
  movingRole: RuntimeActorRole;
  anchorRole: RuntimeActorRole;
  direction: RuntimeVec3;
  minimumSurfaceGapM: number;
};

export type CinematicShotRuntimeLayout = {
  camera: RuntimeCameraPose;
  tray: RuntimeActorPose;
  foods: [RuntimeActorPose, RuntimeActorPose, RuntimeActorPose];
  cow: RuntimeActorPose;
  chicken: RuntimeActorPose;
  goldfish: RuntimeActorPose;
  hand: RuntimeActorPose;
  interactions?: RuntimeAssetInteractionIntent[];
  directionalClearanceConstraints?: RuntimeDirectionalClearanceConstraint[];
};

export type CinematicTimelineSegment = {
  shotId: string;
  startS: number;
  endS: number;
  durationS: number;
};

const SHOT_DURATIONS: Array<[string, number]> = [
  ["shot_01_establish", 2.6],
  ["shot_02_hand_nudge", 3.0],
  ["shot_03_hero_shift", 3.2],
  ["shot_04_cow_insert", 2.8],
  ["shot_05_chicken_insert", 2.8],
  ["shot_06_goldfish_insert", 2.8],
  ["shot_07_return_tray", 3.4],
  ["shot_08_hero", 5.4],
];

export const CINEMATIC_BURGER_TIMELINE_SEGMENTS: CinematicTimelineSegment[] = (() => {
  let cursor = 0;
  return SHOT_DURATIONS.map(([shotId, durationS]) => {
    const segment = {
      shotId,
      startS: cursor,
      endS: cursor + durationS,
      durationS,
    };
    cursor += durationS;
    return segment;
  });
})();

export const CINEMATIC_BURGER_TIMELINE_DURATION_S =
  CINEMATIC_BURGER_TIMELINE_SEGMENTS[
    CINEMATIC_BURGER_TIMELINE_SEGMENTS.length - 1
  ]?.endS ?? 26;

const HERO_CLOSEUP_SAFE_FOV = 30.2;
const HERO_CLOSEUP_SAFE_DISTANCE = 3.62;
const INSERT_CLEARANCE_Z = 0.44;
const STRAIGHT_HAND_ROTATION: RuntimeVec3 = [0.12, Math.PI, 0];

// Surface-aware runtime interprets non-hand actor Y as lift above measured support.
const RESTING_LIFT_Y = 0;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function easeInOut(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(value: number) {
  const t = 1 - clamp01(value);
  return 1 - t * t * t;
}

function easeOutBack(value: number) {
  const t = clamp01(value);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpVec3(a: RuntimeVec3, b: RuntimeVec3, t: number): RuntimeVec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function cubicBezierVec3(
  start: RuntimeVec3,
  controlA: RuntimeVec3,
  controlB: RuntimeVec3,
  end: RuntimeVec3,
  progress: number,
): RuntimeVec3 {
  const t = clamp01(progress);
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;
  return [
    start[0] * a + controlA[0] * b + controlB[0] * c + end[0] * d,
    start[1] * a + controlA[1] * b + controlB[1] * c + end[1] * d,
    start[2] * a + controlA[2] * b + controlB[2] * c + end[2] * d,
  ];
}

function pose(
  position: RuntimeVec3,
  rotation: RuntimeVec3 = [0, 0, 0],
  scale = 1,
  opacity = 1,
  emphasis = 0,
): RuntimeActorPose {
  return {
    visible: true,
    position,
    rotation,
    scale,
    opacity: clamp01(opacity),
    emphasis: clamp01(emphasis),
  };
}

function hiddenActor(): RuntimeActorPose {
  return {
    visible: false,
    position: [0, -8, 0],
    rotation: [0, 0, 0],
    scale: 0.001,
    opacity: 0,
    emphasis: 0,
  };
}

function smootherStep(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function smoothWindow(
  progress: number,
  fadeInStart: number,
  fadeInEnd: number,
  fadeOutStart: number,
  fadeOutEnd: number,
) {
  const fadeIn = smootherStep(
    clamp01((progress - fadeInStart) / Math.max(0.001, fadeInEnd - fadeInStart)),
  );
  const fadeOut = 1 - smootherStep(
    clamp01((progress - fadeOutStart) / Math.max(0.001, fadeOutEnd - fadeOutStart)),
  );
  return Math.min(fadeIn, fadeOut);
}

function fadeEnvelope(
  progress: number,
  fadeInEnd = 0.34,
  fadeOutStart = 0.72,
) {
  return smoothWindow(progress, 0.12, fadeInEnd, fadeOutStart, 0.9);
}

function supportFadeForInsert(progress: number) {
  const focus = smoothWindow(progress, 0.06, 0.27, 0.72, 0.94);
  return lerp(1, 0.08, focus);
}

function supportTransitionForInsert(
  progress: number,
  side: -1 | 1,
  delay = 0,
) {
  const shifted = clamp01((progress - delay) / Math.max(0.001, 1 - delay));
  const legacyOpacity = supportFadeForInsert(shifted);
  const focus = clamp01((1 - legacyOpacity) / 0.92);
  const movement = smootherStep(focus);

  // CP.1E.7 staging-first de-emphasis: supporting foods remain physically solid
  // while they drift outward/back. Only the final edge-clearance tail uses opacity.
  const fadeTail = smootherStep(clamp01((focus - 0.9) / 0.1));
  return {
    opacity: lerp(1, 0.18, fadeTail),
    xOffset: side * 0.34 * movement,
    zOffset: 0.22 * movement,
    scale: lerp(1, 0.9, movement),
  };
}

function recapPulse(
  progress: number,
  start: number,
  peakIn: number,
  peakOut: number,
  end: number,
) {
  return smoothWindow(progress, start, peakIn, peakOut, end);
}

function smoothTimeProgress(timeS: number, startS: number, endS: number) {
  return smootherStep(
    clamp01((timeS - startS) / Math.max(0.001, endS - startS)),
  );
}

function smoothTimeWindow(
  timeS: number,
  fadeInStartS: number,
  fadeInEndS: number,
  fadeOutStartS: number,
  fadeOutEndS: number,
) {
  const fadeIn = smoothTimeProgress(timeS, fadeInStartS, fadeInEndS);
  const fadeOut = 1 - smoothTimeProgress(timeS, fadeOutStartS, fadeOutEndS);
  return Math.min(fadeIn, fadeOut);
}

function blendActorPose(
  from: RuntimeActorPose,
  to: RuntimeActorPose,
  progress: number,
): RuntimeActorPose {
  const t = smootherStep(progress);
  return {
    visible: from.visible || to.visible,
    position: lerpVec3(from.position, to.position, t),
    rotation: lerpVec3(from.rotation, to.rotation, t),
    scale: lerp(from.scale, to.scale, t),
    opacity: lerp(from.opacity, to.opacity, t),
    emphasis: lerp(from.emphasis, to.emphasis, t),
  };
}

function arrivalProgress(progress: number) {
  return smootherStep(clamp01((progress - 0.06) / 0.34));
}

function departureProgress(progress: number) {
  return smootherStep(clamp01((progress - 0.72) / 0.24));
}

function focusEmphasis(progress: number) {
  return smoothWindow(progress, 0.3, 0.42, 0.66, 0.82);
}

function lerpCamera(
  from: RuntimeCameraPose,
  to: RuntimeCameraPose,
  progress: number,
): RuntimeCameraPose {
  const t = easeInOut(progress);
  return {
    position: lerpVec3(from.position, to.position, t),
    target: lerpVec3(from.target, to.target, t),
    fov: lerp(from.fov, to.fov, t),
  };
}

function hermiteScalar(
  start: number,
  end: number,
  startVelocity: number,
  endVelocity: number,
  progress: number,
  durationS: number,
) {
  const t = clamp01(progress);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return (
    h00 * start +
    h10 * startVelocity * durationS +
    h01 * end +
    h11 * endVelocity * durationS
  );
}

function hermiteVec3(
  start: RuntimeVec3,
  end: RuntimeVec3,
  startVelocity: RuntimeVec3,
  endVelocity: RuntimeVec3,
  progress: number,
  durationS: number,
): RuntimeVec3 {
  return [
    hermiteScalar(start[0], end[0], startVelocity[0], endVelocity[0], progress, durationS),
    hermiteScalar(start[1], end[1], startVelocity[1], endVelocity[1], progress, durationS),
    hermiteScalar(start[2], end[2], startVelocity[2], endVelocity[2], progress, durationS),
  ];
}

function quinticHermiteScalar(
  start: number,
  end: number,
  startVelocity: number,
  endVelocity: number,
  startAcceleration: number,
  endAcceleration: number,
  progress: number,
  durationS: number,
) {
  const t = clamp01(progress);
  const duration2 = durationS * durationS;

  const c0 = start;
  const c1 = startVelocity * durationS;
  const c2 = 0.5 * startAcceleration * duration2;

  const d0 = end - (c0 + c1 + c2);
  const d1 = endVelocity * durationS - (c1 + 2 * c2);
  const d2 = endAcceleration * duration2 - 2 * c2;

  const c3 = 10 * d0 - 4 * d1 + 0.5 * d2;
  const c4 = -15 * d0 + 7 * d1 - d2;
  const c5 = 6 * d0 - 3 * d1 + 0.5 * d2;

  return c0 +
    c1 * t +
    c2 * t * t +
    c3 * t * t * t +
    c4 * t * t * t * t +
    c5 * t * t * t * t * t;
}

function quinticHermiteVec3(
  start: RuntimeVec3,
  end: RuntimeVec3,
  startVelocity: RuntimeVec3,
  endVelocity: RuntimeVec3,
  startAcceleration: RuntimeVec3,
  endAcceleration: RuntimeVec3,
  progress: number,
  durationS: number,
): RuntimeVec3 {
  return [
    quinticHermiteScalar(
      start[0],
      end[0],
      startVelocity[0],
      endVelocity[0],
      startAcceleration[0],
      endAcceleration[0],
      progress,
      durationS,
    ),
    quinticHermiteScalar(
      start[1],
      end[1],
      startVelocity[1],
      endVelocity[1],
      startAcceleration[1],
      endAcceleration[1],
      progress,
      durationS,
    ),
    quinticHermiteScalar(
      start[2],
      end[2],
      startVelocity[2],
      endVelocity[2],
      startAcceleration[2],
      endAcceleration[2],
      progress,
      durationS,
    ),
  ];
}

function trayPose(): RuntimeActorPose {
  return pose([0, 0.08, 0.1]);
}

function segmentAtTime(timeS: number) {
  const clamped = Math.min(
    CINEMATIC_BURGER_TIMELINE_DURATION_S,
    Math.max(0, timeS),
  );
  const segment =
    CINEMATIC_BURGER_TIMELINE_SEGMENTS.find(
      (candidate, index) =>
        clamped < candidate.endS ||
        index === CINEMATIC_BURGER_TIMELINE_SEGMENTS.length - 1,
    ) ?? CINEMATIC_BURGER_TIMELINE_SEGMENTS[0];
  const localS = Math.max(0, clamped - segment.startS);
  return {
    segment,
    localS,
    progress: clamp01(localS / Math.max(segment.durationS, 0.001)),
  };
}

export function cinematicShotStartTime(shotId: string) {
  return (
    CINEMATIC_BURGER_TIMELINE_SEGMENTS.find(
      (segment) => segment.shotId === shotId,
    )?.startS ?? 0
  );
}

export function cinematicShotIdAtTime(timeS: number) {
  return segmentAtTime(timeS).segment.shotId;
}

function sampleEstablish(progress: number): CinematicShotRuntimeLayout {
  const t = easeInOut(progress);
  const settle = easeOutBack(Math.min(1, progress / 0.4));
  return {
    camera: lerpCamera(
      { position: [0.04, 3.18, 5.74], target: [0, 0.26, 0.16], fov: 36 },
      { position: [0, 2.74, 5.18], target: [0, 0.3, 0.12], fov: 35 },
      t,
    ),
    tray: trayPose(),
    foods: [
      pose([-1.36, RESTING_LIFT_Y, 0.36], [0.02, -0.2, 0.03], 0.88 * settle),
      pose([0, RESTING_LIFT_Y, 0.02], [0, 0.02, 0], 0.96 * settle),
      pose([1.34, RESTING_LIFT_Y, 0.35], [0.02, 0.22, -0.04], 0.86 * settle),
    ],
    cow: hiddenActor(),
    chicken: hiddenActor(),
    goldfish: hiddenActor(),
    hand: hiddenActor(),
  };
}

function sampleHandNudge(progress: number): CinematicShotRuntimeLayout {
  const cameraProgress = easeInOut(progress);
  const handIn = easeOutCubic(clamp01(progress / 0.28));
  const handOut = easeInOut(clamp01((progress - 0.72) / 0.24));
  const handBlend = Math.min(handIn, 1 - handOut);
  const nudge = easeInOut(clamp01((progress - 0.26) / 0.34));
  const lift = Math.sin(clamp01((progress - 0.24) / 0.36) * Math.PI) * 0.018;

  return {
    camera: lerpCamera(
      { position: [-0.24, 4.68, 4.06], target: [-0.04, 0.28, 0.18], fov: 31.5 },
      { position: [-0.18, 4.86, 3.68], target: [-0.04, 0.28, 0.08], fov: 30.8 },
      cameraProgress,
    ),
    tray: trayPose(),
    foods: [
      pose([-1.5, RESTING_LIFT_Y, 0.38], [0.02, -0.22, 0.04], 0.88),
      pose(
        [lerp(0, 0.09, nudge), lift, lerp(0.02, -0.08, nudge)],
        [0, lerp(0.02, 0.05, nudge), 0],
        lerp(0.96, 1.0, nudge),
        1,
        smoothWindow(progress, 0.3, 0.42, 0.62, 0.76),
      ),
      pose([1.4, RESTING_LIFT_Y, 0.36], [0.02, 0.24, -0.05], 0.84),
    ],
    cow: hiddenActor(),
    chicken: hiddenActor(),
    goldfish: hiddenActor(),
    hand:
      handBlend > 0.015
        ? pose(
            [lerp(-2.26, -0.88, handBlend), lerp(1.18, 0.62, handBlend), lerp(0.96, 0.18, handBlend)],
            STRAIGHT_HAND_ROTATION,
            lerp(0.78, 0.88, handBlend),
          )
        : hiddenActor(),
  };
}

// Hero-safe framing and insert-side occlusion cleanup.
function sampleHeroShift(progress: number): CinematicShotRuntimeLayout {
  const t = easeInOut(progress);
  const edgeFade = lerp(1, 0.74, t);
  return {
    camera: lerpCamera(
      { position: [0.06, 2.24, 4.46], target: [0, 0.34, 0.04], fov: 35 },
      { position: [0.08, 2.0, 4.02], target: [0.04, 0.37, -0.02], fov: 33.2 },
      t,
    ),
    tray: trayPose(),
    foods: [
      pose(
        [lerp(-1.36, -1.66, t), RESTING_LIFT_Y, lerp(0.36, 0.46, t)],
        [0.02, -0.22, 0.05],
        0.84 * edgeFade,
      ),
      pose(
        [lerp(0, 0.03, t), RESTING_LIFT_Y, lerp(0.02, -0.08, t)],
        [0, lerp(0.02, 0.05, t), 0],
        lerp(0.96, 1.06, t),
        1,
        smoothWindow(progress, 0.42, 0.54, 0.72, 0.86),
      ),
      pose(
        [lerp(1.34, 1.66, t), RESTING_LIFT_Y, lerp(0.35, 0.48, t)],
        [0.03, 0.26, -0.05],
        0.82 * edgeFade,
      ),
    ],
    cow: hiddenActor(),
    chicken: hiddenActor(),
    goldfish: hiddenActor(),
    hand: hiddenActor(),
  };
}

function sampleCowInsert(progress: number): CinematicShotRuntimeLayout {
  const arrival = arrivalProgress(progress);
  const departure = departureProgress(progress);
  const animalOpacity = smoothWindow(progress, 0.14, 0.31, 0.72, 0.91);
  const appleTransition = supportTransitionForInsert(progress, -1, 0.06);
  const nigiriTransition = supportTransitionForInsert(progress, 1, 0);
  const supportOpacity = 0.02;
  const settle = Math.sin(arrival * Math.PI * 2.2) * Math.pow(1 - arrival, 2) * 0.045;
  const lift = Math.sin(arrival * Math.PI) * 0.065 * (1 - departure);
  const emphasis = focusEmphasis(progress);
  const animalCameraFocus = smoothWindow(progress, 0.08, 0.36, 0.66, 0.92);
  return {
    camera: lerpCamera(
      { position: [1.66, 2.08, 4.4], target: [0.12, 0.33, 0.02], fov: 33 },
      { position: [1.04, 1.94, 4.02], target: [0.52, 0.31, -0.1], fov: 31.6 },
      animalCameraFocus,
    ),
    tray: trayPose(),
    foods: [
      pose(
        [-1.54 + appleTransition.xOffset, RESTING_LIFT_Y, INSERT_CLEARANCE_Z + appleTransition.zOffset],
        [0.01, -0.18, 0],
        0.78 * appleTransition.scale,
        Math.max(appleTransition.opacity, supportOpacity),
      ),
      pose([0.02, RESTING_LIFT_Y, -0.04], [0, 0.04, 0], 1.0),
      pose(
        [1.54 + nigiriTransition.xOffset, RESTING_LIFT_Y, INSERT_CLEARANCE_Z + nigiriTransition.zOffset],
        [0.02, 0.26, -0.04],
        0.74 * nigiriTransition.scale,
        Math.max(nigiriTransition.opacity, supportOpacity),
      ),
    ],
    cow: pose(
      [
        lerp(2.42, 1.22, arrival) + departure * 0.34,
        lift,
        lerp(0.08, -0.2, arrival) + settle,
      ],
      [0.02, lerp(-1.3, -0.82, arrival) - departure * 0.12, settle * 0.35],
      lerp(0.72, 0.82, arrival) * lerp(1, 0.96, departure),
      animalOpacity,
      emphasis,
    ),
    chicken: hiddenActor(),
    goldfish: hiddenActor(),
    hand: hiddenActor(),
  };
}

function sampleChickenInsert(progress: number): CinematicShotRuntimeLayout {
  const arrival = arrivalProgress(progress);
  const departure = departureProgress(progress);
  const animalOpacity = smoothWindow(progress, 0.14, 0.31, 0.72, 0.91);
  const appleTransition = supportTransitionForInsert(progress, -1, 0);
  const nigiriTransition = supportTransitionForInsert(progress, 1, 0.06);
  const supportOpacity = 0.02;
  const settle = Math.sin(arrival * Math.PI * 2.4) * Math.pow(1 - arrival, 2) * 0.05;
  const lift = Math.sin(arrival * Math.PI) * 0.055 * (1 - departure);
  const emphasis = focusEmphasis(progress);
  const animalCameraFocus = smoothWindow(progress, 0.08, 0.36, 0.66, 0.92);
  return {
    camera: lerpCamera(
      { position: [-1.64, 2.08, 4.4], target: [-0.12, 0.33, 0.02], fov: 33 },
      { position: [-1.04, 1.94, 4.02], target: [-0.52, 0.31, -0.1], fov: 31.6 },
      animalCameraFocus,
    ),
    tray: trayPose(),
    foods: [
      pose(
        [-1.52 + appleTransition.xOffset, RESTING_LIFT_Y, INSERT_CLEARANCE_Z + appleTransition.zOffset],
        [0.02, -0.22, 0.04],
        0.76 * appleTransition.scale,
        Math.max(appleTransition.opacity, supportOpacity),
      ),
      pose([-0.02, RESTING_LIFT_Y, -0.04], [0, 0.04, 0], 1.0),
      pose(
        [1.52 + nigiriTransition.xOffset, RESTING_LIFT_Y, INSERT_CLEARANCE_Z + nigiriTransition.zOffset],
        [0.02, 0.18, -0.02],
        0.78 * nigiriTransition.scale,
        Math.max(nigiriTransition.opacity, supportOpacity),
      ),
    ],
    cow: hiddenActor(),
    chicken: pose(
      [
        lerp(-2.4, -1.22, arrival) - departure * 0.34,
        lift,
        lerp(0.08, -0.2, arrival) - settle * 0.3,
      ],
      [0.02, lerp(1.24, 0.8, arrival) + departure * 0.12, -settle * 0.42],
      lerp(0.7, 0.8, arrival) * lerp(1, 0.96, departure),
      animalOpacity,
      emphasis,
    ),
    goldfish: hiddenActor(),
    hand: hiddenActor(),
  };
}

function sampleGoldfishInsert(progress: number): CinematicShotRuntimeLayout {
  // CP.1E.9 fallback sampler mirrors the spatial reveal used by the active
  // continuous insert journey: the burger remains a solid foreground occluder
  // and the fish occupies real depth behind it. The master camera performs the
  // reveal; the burger does not slide aside to fake visibility.
  const arrival = smootherStep(clamp01((progress - 0.04) / 0.28));
  const departure = smootherStep(clamp01((progress - 0.78) / 0.18));
  const fishFocus = smoothWindow(progress, 0.12, 0.34, 0.7, 0.9);
  const animalOpacity = smoothWindow(progress, 0.04, 0.24, 0.8, 0.96);
  const swim = Math.sin(progress * Math.PI * 4.6) * 0.018 * (1 - departure);
  const tail = Math.sin(progress * Math.PI * 9.2) * 0.06 * (1 - departure);
  return {
    camera: {
      position: [lerp(-0.32, 1.72, fishFocus), lerp(2.02, 1.78, fishFocus), lerp(4.24, 3.5, fishFocus)],
      target: [lerp(0.02, 0.18, fishFocus), 0.3, lerp(-0.22, -0.4, fishFocus)],
      fov: lerp(32, 31.2, fishFocus),
    },
    tray: trayPose(),
    foods: [
      pose([-1.58, RESTING_LIFT_Y, 0.52], [0.02, -0.18, 0.04], 0.7, 0.98),
      pose([0.02, RESTING_LIFT_Y, -0.06], [0, 0.04, 0], 1, 1),
      pose([1.58, RESTING_LIFT_Y, 0.52], [0.02, 0.26, -0.05], 0.68, 0.98),
    ],
    cow: hiddenActor(),
    chicken: hiddenActor(),
    goldfish: pose(
      [
        lerp(0.72, 0.16, arrival) + departure * 0.48,
        Math.sin(arrival * Math.PI) * 0.035 + swim,
        lerp(-0.56, -0.72, arrival) - departure * 0.08,
      ],
      [0.02 + tail * 0.04, lerp(-1.42, -1.62, arrival), tail * 0.06],
      lerp(0.72, 0.9, arrival) * lerp(1, 0.96, departure),
      animalOpacity,
      fishFocus,
    ),
    hand: hiddenActor(),
  };
}

const CONTINUOUS_INSERT_START_S = 0;
const CONTINUOUS_INSERT_END_S = CINEMATIC_BURGER_TIMELINE_DURATION_S;

function sampleContinuousInsertJourney(
  timeS: number,
): CinematicShotRuntimeLayout {
  // CP.1E.11: the legacy function name is retained for compatibility, but this
  // sampler now owns the ENTIRE 0 -> 26 second film. Semantic shots are seek and
  // story metadata only; they never select runtime actor state.
  //
  // CP.1E.10: from the end of the early hero shift onward was the first persistent
  // journey. CP.1E.11 removes that remaining handoff from frame zero.
  // CP.1E.10 compatibility marker: once the spatial journey begins it owns actor continuity.
  const filmTimeS = Math.min(
    CINEMATIC_BURGER_TIMELINE_DURATION_S,
    Math.max(0, timeS),
  );

  // One continuous early-tabletop choreography. The hand, burger cue, trio
  // restaging and cow entrance deliberately overlap. There is no "prepare,
  // settle, then start the cow shot" phase.
  const initialSettle = smoothTimeProgress(filmTimeS, 0.0, 1.45);
  const handArrival = smoothTimeProgress(filmTimeS, 1.35, 3.15);
  const handDeparture = smoothTimeProgress(filmTimeS, 4.55, 6.65);
  const handOpacity = smoothTimeWindow(filmTimeS, 1.2, 1.85, 4.85, 6.55);
  const handBlend = handArrival * (1 - handDeparture);

  // CP.1F: the film clock now authors only interaction intent. The literal hand
  // contact/root is solved downstream from the selected hand + burger geometry.
  // This removes the last burger-specific contact coordinate from motion authority.
  const handInteractionPhase: RuntimeAssetInteractionPhase | null =
    filmTimeS >= 1.35 && filmTimeS < 3.15
      ? "approach"
      : filmTimeS >= 3.15 && filmTimeS < 4.55
        ? "contact"
        : filmTimeS >= 4.55 && filmTimeS < 6.65
          ? "retreat"
          : null;
  const handInteractionProgress =
    handInteractionPhase === "approach"
      ? smoothTimeProgress(filmTimeS, 1.35, 3.15)
      : handInteractionPhase === "contact"
        ? smoothTimeProgress(filmTimeS, 3.15, 4.55)
        : handInteractionPhase === "retreat"
          ? smoothTimeProgress(filmTimeS, 4.55, 6.65)
          : 0;
  const handInteraction: RuntimeAssetInteractionIntent | null =
    handInteractionPhase
      ? {
          id: "hand_nudges_burger",
          kind: "nudge",
          sourceRole: "hand",
          targetRole: "burger",
          phase: handInteractionPhase,
          phaseProgress: handInteractionProgress,
          // Semantic travel direction only. The runtime chooses the actual
          // source/target contact regions and exact root transform.
          approachDirection: [1, -0.12, -0.08],
          preferredTargetSide: "left",
          contactClearanceM: 0.008,
          obstacleClearanceM: 0.035,
          obstacleRoles: ["apple", "nigiri", "tray"],
          maintainContact: handInteractionPhase === "contact",
        }
      : null;

  // Attention may begin before contact, but literal burger translation begins
  // only after the hand reaches the geometry-solved contact state and resolves
  // before release. This keeps cause and motion physically legible.
  const burgerCue = smoothTimeWindow(filmTimeS, 2.95, 3.3, 4.7, 5.55);
  const burgerNudge = smoothTimeWindow(filmTimeS, 3.18, 3.55, 4.28, 4.52);

  // IMPORTANT: this single easing result is consumed directly. Do not feed it
  // through a second pose interpolation/easing layer; stacked easing created the
  // perceptual stop immediately before the cow in CP.1E.10.
  const galleryTravel = smoothTimeProgress(filmTimeS, 4.9, 9.35);

  const lateTravel = smoothTimeProgress(filmTimeS, 16.85, 21.6);
  const heroSettle = smoothTimeProgress(filmTimeS, 21.0, 25.4);
  const supportDeemphasis = smoothTimeProgress(filmTimeS, 22.1, 25.0);
  const appleRecap = smoothTimeWindow(filmTimeS, 17.75, 18.1, 18.55, 18.9);
  const burgerRecap = smoothTimeWindow(filmTimeS, 18.75, 19.1, 19.55, 19.9);
  const nigiriRecap = smoothTimeWindow(filmTimeS, 19.75, 20.1, 20.55, 20.9);
  const finalEmphasis = smoothTimeWindow(filmTimeS, 23.05, 23.55, 25.25, 25.85);

  // Foreground anchor: keep the burger physical, opaque, and nearly stationary.
  // Early trio -> gallery. These trajectories are already moving before the
  // cow becomes visible and continue moving after it begins to arrive.
  const earlyAppleX = lerp(-1.36, -1.58, galleryTravel);
  const earlyAppleZ = lerp(0.36, 0.52, galleryTravel);
  const earlyAppleScale = lerp(0.88, 0.7, galleryTravel) *
    lerp(0.94, 1, initialSettle);

  const earlyBurgerX = lerp(0, 0.02, galleryTravel) + burgerNudge * 0.07;
  const earlyBurgerZ = lerp(0.02, -0.06, galleryTravel) - burgerNudge * 0.055;
  const earlyBurgerScale = lerp(0.96, 1, galleryTravel) *
    lerp(0.96, 1, initialSettle) + burgerNudge * 0.045;

  const earlyNigiriX = lerp(1.34, 1.58, galleryTravel);
  const earlyNigiriZ = lerp(0.35, 0.52, galleryTravel);
  const earlyNigiriScale = lerp(0.86, 0.68, galleryTravel) *
    lerp(0.94, 1, initialSettle);

  // Gallery -> recap -> hero remains the CP.1E.10 persistent spatial journey.
  const lateAppleX = lerp(earlyAppleX, -1.34, lateTravel);
  const lateAppleZ = lerp(earlyAppleZ, 0.36, lateTravel);
  const lateAppleScale = lerp(earlyAppleScale, 0.88, lateTravel);
  const appleHeroX = -1.04 - supportDeemphasis * 0.08;
  const appleHeroZ = 0.22 + supportDeemphasis * 0.05;

  const lateBurgerX = lerp(earlyBurgerX, 0.02, lateTravel);
  const lateBurgerZ = lerp(earlyBurgerZ, 0.02, lateTravel);
  const lateBurgerScale = lerp(earlyBurgerScale, 0.96, lateTravel);

  const lateNigiriX = lerp(earlyNigiriX, 1.34, lateTravel);
  const lateNigiriZ = lerp(earlyNigiriZ, 0.35, lateTravel);
  const lateNigiriScale = lerp(earlyNigiriScale, 0.86, lateTravel);
  const nigiriHeroX = 1.04 + supportDeemphasis * 0.08;
  const nigiriHeroZ = 0.22 + supportDeemphasis * 0.05;

  const foods: CinematicShotRuntimeLayout["foods"] = [
    pose(
      [
        lerp(lateAppleX, appleHeroX, heroSettle) - appleRecap * 0.04,
        RESTING_LIFT_Y,
        lerp(lateAppleZ, appleHeroZ, heroSettle) - appleRecap * 0.07,
      ],
      [0.02, -0.2 - appleRecap * 0.04, 0.04],
      lerp(lateAppleScale, lerp(0.68, 0.64, supportDeemphasis), heroSettle) *
        (1 + appleRecap * 0.08),
      lerp(1, lerp(1, 0.58, supportDeemphasis), heroSettle),
      appleRecap,
    ),
    pose(
      [
        lerp(lateBurgerX, 0.02, heroSettle),
        RESTING_LIFT_Y,
        lerp(lateBurgerZ, -0.11, heroSettle) - burgerRecap * 0.05,
      ],
      [0, 0.02 + galleryTravel * 0.02 + Math.sin(heroSettle * Math.PI) * 0.025, 0],
      lerp(lateBurgerScale, 1.12, heroSettle) * (1 + burgerRecap * 0.08),
      1,
      Math.max(burgerCue, burgerRecap, finalEmphasis),
    ),
    pose(
      [
        lerp(lateNigiriX, nigiriHeroX, heroSettle) + nigiriRecap * 0.04,
        RESTING_LIFT_Y,
        lerp(lateNigiriZ, nigiriHeroZ, heroSettle) - nigiriRecap * 0.07,
      ],
      [0.03, 0.22 + galleryTravel * 0.04 + nigiriRecap * 0.04, -0.04],
      lerp(lateNigiriScale, lerp(0.66, 0.62, supportDeemphasis), heroSettle) *
        (1 + nigiriRecap * 0.08),
      lerp(1, lerp(1, 0.58, supportDeemphasis), heroSettle),
      nigiriRecap,
    ),
  ];

  // Cow begins while the trio is still physically travelling toward gallery
  // staging. This overlap is the explicit repair for the CP.1E.10 pre-cow seam.
  const cowArrival = smoothTimeProgress(filmTimeS, 7.55, 9.15);
  const cowDeparture = smoothTimeProgress(filmTimeS, 10.55, 11.75);
  const cowOpacity = smoothTimeWindow(filmTimeS, 7.35, 8.05, 11.0, 11.78);
  const cowFocus = smoothTimeWindow(filmTimeS, 8.65, 9.2, 10.25, 10.75);
  const cowSettle = Math.sin(cowArrival * Math.PI * 2.0) *
    Math.pow(1 - cowArrival, 2) * 0.04;

  const chickenArrival = smoothTimeProgress(filmTimeS, 10.55, 11.55);
  const chickenDeparture = smoothTimeProgress(filmTimeS, 13.05, 14.55);
  const chickenOpacity = smoothTimeWindow(filmTimeS, 10.45, 11.05, 13.75, 14.62);
  const chickenFocus = smoothTimeWindow(filmTimeS, 11.35, 11.8, 12.85, 13.45);
  const chickenSettle = Math.sin(chickenArrival * Math.PI * 2.2) *
    Math.pow(1 - chickenArrival, 2) * 0.04;

  // Fish parallax proof, strengthened in CP.1E.10 and retained here:
  // The fish reaches a real back-plane position before its semantic beat begins.
  // Its long axis is aligned roughly down the initial viewing ray so the entire
  // fish can disappear behind the burger silhouette rather than leaking a tail.
  // The fish then HOLDS that world-space position while the master camera makes
  // an Inspect-like orbit around the burger. Visibility is earned by viewpoint.
  const fishArrival = smoothTimeProgress(filmTimeS, 12.95, 13.72);
  const fishDeparture = smoothTimeProgress(filmTimeS, 18.2, 19.05);
  const fishOpacity = smoothTimeWindow(filmTimeS, 12.9, 13.45, 18.45, 19.12);
  const fishFocus = smoothTimeWindow(filmTimeS, 14.75, 15.25, 17.75, 18.3);
  const fishSwim = Math.sin(filmTimeS * Math.PI * 2.0) * 0.012 *
    (1 - fishDeparture);
  const fishTail = Math.sin(filmTimeS * Math.PI * 4.2) * 0.035 *
    (1 - fishDeparture);

  // The tray also belongs to the same film track. CP.1E.10 still jumped from
  // trayPose() [0,.08,.10] into [.04,.28] at the hidden 7.4s authority handoff.
  const trayGalleryTravel = smoothTimeProgress(filmTimeS, 4.35, 10.0);
  const trayHeroTravel = smoothTimeProgress(filmTimeS, 21.5, 25.6);

  return {
    // This camera is intentionally not authoritative. sampleCinematicBurgerRuntime
    // replaces it with the global C2 master rail below.
    camera: {
      position: MASTER_CAMERA_KEYS[0].position,
      target: MASTER_CAMERA_KEYS[0].target,
      fov: MASTER_CAMERA_KEYS[0].fov,
    },
    tray: pose(
      [
        0,
        lerp(0.08, 0.04, trayGalleryTravel),
        lerp(0.1, lerp(0.28, 0.4, trayHeroTravel), trayGalleryTravel),
      ],
      [0, 0, 0],
      0.88,
    ),
    foods,
    cow:
      cowOpacity > 0.001
        ? pose(
            [
              lerp(2.42, 1.16, cowArrival) + cowDeparture * 0.86,
              Math.sin(cowArrival * Math.PI) * 0.055 * (1 - cowDeparture),
              lerp(0.1, -0.24, cowArrival) + cowSettle + cowDeparture * 0.1,
            ],
            [0.02, lerp(-1.3, -0.82, cowArrival) - cowDeparture * 0.16, cowSettle * 0.3],
            lerp(0.72, 0.82, cowArrival) * lerp(1, 0.94, cowDeparture),
            cowOpacity,
            cowFocus,
          )
        : hiddenActor(),
    chicken:
      chickenOpacity > 0.001
        ? pose(
            [
              lerp(-2.4, -1.16, chickenArrival) - chickenDeparture * 0.84,
              Math.sin(chickenArrival * Math.PI) * 0.05 * (1 - chickenDeparture),
              lerp(0.1, -0.24, chickenArrival) - chickenSettle * 0.25 + chickenDeparture * 0.1,
            ],
            [0.02, lerp(1.24, 0.8, chickenArrival) + chickenDeparture * 0.16, -chickenSettle * 0.38],
            lerp(0.7, 0.8, chickenArrival) * lerp(1, 0.94, chickenDeparture),
            chickenOpacity,
            chickenFocus,
          )
        : hiddenActor(),
    goldfish:
      fishOpacity > 0.001
        ? pose(
            [
              lerp(0.08, 0.02, fishArrival) + fishDeparture * 0.72,
              Math.sin(fishArrival * Math.PI) * 0.025 + fishSwim,
              // CP.1E.13 deepens the CP.1E.12 negative-space fix. The fish still
              // stays directly behind the burger for occlusion, but its settled
              // back-plane now leaves a visibly cleaner gap after the orbit reveal.
              lerp(-1.48, -1.78, fishArrival) + fishDeparture * 0.22,
            ],
            // Near-zero yaw turns the fish length into depth from the initial
            // frontal approach; the later orbit reveals its side profile.
            [0.02 + fishTail * 0.03, fishTail * 0.05, fishTail * 0.07],
            lerp(0.68, 0.82, fishArrival) * lerp(1, 0.94, fishDeparture),
            fishOpacity,
            fishFocus,
          )
        : hiddenActor(),
    hand:
      handOpacity > 0.001
        ? pose(
            // This is a staging/exit pose, not a literal contact coordinate.
            // CP.1F's asset-aware solver owns approach/contact/retreat roots.
            [-2.34, 1.24, 1.02],
            STRAIGHT_HAND_ROTATION,
            lerp(0.76, 0.86, handBlend),
            handOpacity,
          )
        : hiddenActor(),
    interactions: handInteraction ? [handInteraction] : [],
    directionalClearanceConstraints:
      fishOpacity > 0.001
        ? [
            {
              id: "fish_behind_burger_surface_gap",
              movingRole: "goldfish",
              anchorRole: "burger",
              direction: [0, 0, -1],
              // Surface-to-surface negative space, not center-to-center distance.
              minimumSurfaceGapM: 0.3,
            },
          ]
        : [],
  };
}

function sampleReturnTray(progress: number): CinematicShotRuntimeLayout {
  const reset = smootherStep(clamp01(progress / 0.18));
  const appleRecap = recapPulse(progress, 0.16, 0.24, 0.31, 0.39);
  const burgerRecap = recapPulse(progress, 0.37, 0.45, 0.53, 0.61);
  const nigiriRecap = recapPulse(progress, 0.58, 0.66, 0.74, 0.82);
  // One continuous lateral/arc move carries the recap across apple -> burger ->
  // nigiri, then recentres for the hero. The outline pulses carry semantic focus;
  // the camera no longer restarts a mini zoom for every food.
  const sweep = smootherStep(clamp01((progress - 0.08) / 0.7));
  const recenter = smootherStep(clamp01((progress - 0.78) / 0.22));
  const sweepX = lerp(-0.72, 0.82, sweep);
  const cameraX = lerp(sweepX, 0.06, recenter);
  const targetX = lerp(sweepX * 0.82, 0, recenter);
  const arcLift = Math.sin(sweep * Math.PI) * 0.12 * (1 - recenter);
  return {
    camera: {
      position: [cameraX * 0.34, 2.46 + arcLift, lerp(4.64, 4.28, sweep)],
      target: [targetX, 0.31, lerp(0.11, 0.04, sweep)],
      fov: lerp(33.2, 31.8, sweep),
    },
    tray: trayPose(),
    foods: [
      pose(
        [lerp(-1.18, -1.36, reset) - appleRecap * 0.04, RESTING_LIFT_Y, lerp(0.28, 0.36, reset) - appleRecap * 0.08],
        [0.02, -0.18 - appleRecap * 0.04, 0.04],
        lerp(0.82, 0.88, reset) * (1 + appleRecap * 0.1),
        lerp(0.84, 1, appleRecap),
        appleRecap,
      ),
      pose(
        [0.02, RESTING_LIFT_Y, lerp(-0.08, 0.02, reset) - burgerRecap * 0.08],
        [0, 0.03 + burgerRecap * 0.03, 0],
        lerp(1.02, 0.96, reset) * (1 + burgerRecap * 0.1),
        lerp(0.88, 1, burgerRecap),
        burgerRecap,
      ),
      pose(
        [lerp(1.18, 1.34, reset) + nigiriRecap * 0.04, RESTING_LIFT_Y, lerp(0.28, 0.35, reset) - nigiriRecap * 0.08],
        [0.03, 0.24 + nigiriRecap * 0.04, -0.04],
        lerp(0.8, 0.86, reset) * (1 + nigiriRecap * 0.1),
        lerp(0.84, 1, nigiriRecap),
        nigiriRecap,
      ),
    ],
    cow: hiddenActor(),
    chicken: hiddenActor(),
    goldfish: hiddenActor(),
    hand: hiddenActor(),
  };
}

function sampleHero(progress: number): CinematicShotRuntimeLayout {
  const settle = smootherStep(clamp01(progress / 0.22));
  const beautyPush = smootherStep(clamp01((progress - 0.12) / 0.78));
  const sideDrift = Math.sin(beautyPush * Math.PI) * 0.08;
  const supportDeemphasis = smootherStep(clamp01((progress - 0.24) / 0.52));
  const finalEmphasis = smoothWindow(progress, 0.48, 0.58, 0.76, 0.88);
  return {
    camera: {
      position: [
        lerp(0.22, 0.08, beautyPush) + sideDrift,
        lerp(2.02, 1.82, beautyPush),
        lerp(4.08, HERO_CLOSEUP_SAFE_DISTANCE, beautyPush),
      ],
      target: [0.02, lerp(0.38, 0.42, beautyPush), lerp(-0.02, -0.08, beautyPush)],
      fov: lerp(31.4, HERO_CLOSEUP_SAFE_FOV, beautyPush),
    },
    tray: pose([0, 0.04, lerp(0.34, 0.4, beautyPush)], [0, 0, 0], 0.88),
    foods: [
      pose(
        [lerp(-1.02, -0.96, settle) - supportDeemphasis * 0.08, RESTING_LIFT_Y, lerp(0.22, 0.18, settle) + supportDeemphasis * 0.06],
        [0.02, -0.18, 0.04],
        lerp(0.68, 0.64, supportDeemphasis),
        lerp(1, 0.58, supportDeemphasis),
      ),
      pose(
        [0.02, RESTING_LIFT_Y, lerp(-0.04, -0.11, beautyPush)],
        [0, Math.sin(beautyPush * Math.PI) * 0.025, 0],
        lerp(1.03, 1.12, beautyPush),
        1,
        finalEmphasis,
      ),
      pose(
        [lerp(1.02, 0.96, settle) + supportDeemphasis * 0.08, RESTING_LIFT_Y, lerp(0.24, 0.18, settle) + supportDeemphasis * 0.06],
        [0.03, 0.24, -0.04],
        lerp(0.66, 0.62, supportDeemphasis),
        lerp(1, 0.58, supportDeemphasis),
      ),
    ],
    cow: hiddenActor(),
    chicken: hiddenActor(),
    goldfish: hiddenActor(),
    hand: hiddenActor(),
  };
}

function sampleRawCinematicBurgerRuntime(
  timeS: number,
): CinematicShotRuntimeLayout {
  // CP.1E.11: no semantic-shot switch is allowed in normal playback. The old
  // sampleEstablish/sampleHandNudge/... helpers remain below as compatibility
  // references for earlier verifiers and midpoint inspection, but the rendered
  // film is sampled from one absolute-time choreography only.
  return sampleContinuousInsertJourney(
    Math.min(
      CINEMATIC_BURGER_TIMELINE_DURATION_S,
      Math.max(CONTINUOUS_INSERT_START_S, timeS),
    ),
  );
}

type MasterCameraKey = {
  timeS: number;
  position: RuntimeVec3;
  target: RuntimeVec3;
  fov: number;
};

// CP.1E.11 C2 through-motion master camera rail. Keys remain offset from semantic
// boundaries. The prior time-aware Hermite tangents remain as the velocity
// authority, while shared per-key accelerations feed a quintic Hermite spline so
// both velocity AND acceleration stay continuous through camera control points.
// The late path still uses the CP.1E.10 broad Inspect-like orbit.
const MASTER_CAMERA_KEYS: MasterCameraKey[] = [
  { timeS: 0, position: [0.04, 3.18, 5.74], target: [0, 0.28, 0.14], fov: 36 },
  { timeS: 2.1, position: [-0.12, 3.5, 5.08], target: [-0.04, 0.3, 0.1], fov: 34.4 },
  { timeS: 4.7, position: [-0.08, 3.2, 4.78], target: [-0.03, 0.33, 0.04], fov: 33.8 },
  { timeS: 7.35, position: [0.24, 2.45, 4.62], target: [0.05, 0.34, 0], fov: 33.5 },

  // Cow -> chicken: lateral travel continues through the semantic handoff.
  { timeS: 9.35, position: [1.05, 2.08, 4.15], target: [0.58, 0.32, -0.12], fov: 32.0 },
  { timeS: 11.0, position: [0.45, 2.0, 4.15], target: [0.1, 0.32, -0.14], fov: 32.0 },
  { timeS: 12.85, position: [-1.05, 2.02, 4.15], target: [-0.56, 0.31, -0.15], fov: 31.8 },

  // CP.1E.10 Inspect-like orbit. The fish is already fully hidden behind the
  // foreground burger as this begins. The camera then keeps rotating in ONE
  // direction: front -> right side -> behind -> left side -> front hero.
  { timeS: 13.75, position: [-0.5, 2.02, 4.25], target: [-0.05, 0.31, -0.24], fov: 32.2 },
  { timeS: 14.55, position: [-0.05, 1.96, 4.15], target: [0.02, 0.31, -0.36], fov: 31.9 },
  { timeS: 15.25, position: [1.55, 1.82, 3.65], target: [0.05, 0.3, -0.52], fov: 31.6 },
  { timeS: 16.05, position: [3.15, 1.7, 2.2], target: [0.03, 0.3, -0.62], fov: 31.4 },
  { timeS: 16.85, position: [3.75, 1.68, 0.55], target: [0.01, 0.31, -0.62], fov: 31.6 },

  // Do not "return to the shot." Continue the same orbital direction through
  // fish resolution, recap, and the final hero so late semantic boundaries do
  // not read as camera resets.
  { timeS: 18.0, position: [3.45, 1.82, -1.75], target: [0.02, 0.32, -0.5], fov: 32.0 },
  { timeS: 19.25, position: [1.65, 2.2, -3.45], target: [0.02, 0.33, -0.25], fov: 32.6 },
  { timeS: 20.45, position: [-0.8, 2.35, -3.75], target: [0.01, 0.34, -0.1], fov: 33.0 },
  { timeS: 21.75, position: [-2.85, 2.2, -2.45], target: [0, 0.35, -0.06], fov: 32.8 },
  { timeS: 23.0, position: [-3.25, 2.05, -0.15], target: [0, 0.36, -0.05], fov: 32.2 },
  { timeS: 24.4, position: [-2.1, 1.98, 2.85], target: [0.01, 0.39, -0.07], fov: 31.2 },
  { timeS: 26, position: [0.08, 1.9, 3.82], target: [0.02, 0.41, -0.08], fov: HERO_CLOSEUP_SAFE_FOV },
]

function masterCameraVec3TangentAt(
  index: number,
  field: "position" | "target",
): RuntimeVec3 {
  const current = MASTER_CAMERA_KEYS[index];
  const previous = MASTER_CAMERA_KEYS[Math.max(0, index - 1)];
  const next = MASTER_CAMERA_KEYS[Math.min(MASTER_CAMERA_KEYS.length - 1, index + 1)];

  if (index === 0) {
    const span = Math.max(0.001, next.timeS - current.timeS);
    return [
      (next[field][0] - current[field][0]) / span,
      (next[field][1] - current[field][1]) / span,
      (next[field][2] - current[field][2]) / span,
    ];
  }

  if (index === MASTER_CAMERA_KEYS.length - 1) {
    const span = Math.max(0.001, current.timeS - previous.timeS);
    return [
      (current[field][0] - previous[field][0]) / span,
      (current[field][1] - previous[field][1]) / span,
      (current[field][2] - previous[field][2]) / span,
    ];
  }

  const span = Math.max(0.001, next.timeS - previous.timeS);
  return [
    (next[field][0] - previous[field][0]) / span,
    (next[field][1] - previous[field][1]) / span,
    (next[field][2] - previous[field][2]) / span,
  ];
}

function masterCameraScalarTangentAt(index: number) {
  const current = MASTER_CAMERA_KEYS[index];
  const previous = MASTER_CAMERA_KEYS[Math.max(0, index - 1)];
  const next = MASTER_CAMERA_KEYS[Math.min(MASTER_CAMERA_KEYS.length - 1, index + 1)];

  if (index === 0) {
    return (next.fov - current.fov) /
      Math.max(0.001, next.timeS - current.timeS);
  }
  if (index === MASTER_CAMERA_KEYS.length - 1) {
    return (current.fov - previous.fov) /
      Math.max(0.001, current.timeS - previous.timeS);
  }
  return (next.fov - previous.fov) /
    Math.max(0.001, next.timeS - previous.timeS);
}

function masterCameraVec3AccelerationAt(
  index: number,
  field: "position" | "target",
): RuntimeVec3 {
  if (index <= 0 || index >= MASTER_CAMERA_KEYS.length - 1) {
    return [0, 0, 0];
  }

  const previous = MASTER_CAMERA_KEYS[index - 1];
  const current = MASTER_CAMERA_KEYS[index];
  const next = MASTER_CAMERA_KEYS[index + 1];
  const previousSpan = Math.max(0.001, current.timeS - previous.timeS);
  const nextSpan = Math.max(0.001, next.timeS - current.timeS);
  const totalSpan = previousSpan + nextSpan;

  const previousSlope: RuntimeVec3 = [
    (current[field][0] - previous[field][0]) / previousSpan,
    (current[field][1] - previous[field][1]) / previousSpan,
    (current[field][2] - previous[field][2]) / previousSpan,
  ];
  const nextSlope: RuntimeVec3 = [
    (next[field][0] - current[field][0]) / nextSpan,
    (next[field][1] - current[field][1]) / nextSpan,
    (next[field][2] - current[field][2]) / nextSpan,
  ];

  return [
    2 * (nextSlope[0] - previousSlope[0]) / totalSpan,
    2 * (nextSlope[1] - previousSlope[1]) / totalSpan,
    2 * (nextSlope[2] - previousSlope[2]) / totalSpan,
  ];
}

function masterCameraScalarAccelerationAt(index: number) {
  if (index <= 0 || index >= MASTER_CAMERA_KEYS.length - 1) return 0;

  const previous = MASTER_CAMERA_KEYS[index - 1];
  const current = MASTER_CAMERA_KEYS[index];
  const next = MASTER_CAMERA_KEYS[index + 1];
  const previousSpan = Math.max(0.001, current.timeS - previous.timeS);
  const nextSpan = Math.max(0.001, next.timeS - current.timeS);
  const previousSlope = (current.fov - previous.fov) / previousSpan;
  const nextSlope = (next.fov - current.fov) / nextSpan;

  return 2 * (nextSlope - previousSlope) / (previousSpan + nextSpan);
}

function masterCameraAtTime(timeS: number): RuntimeCameraPose {
  const clamped = Math.min(
    CINEMATIC_BURGER_TIMELINE_DURATION_S,
    Math.max(0, timeS),
  );
  let rightIndex = MASTER_CAMERA_KEYS.findIndex((key) => clamped <= key.timeS);
  if (rightIndex <= 0) rightIndex = 1;
  if (rightIndex < 0) rightIndex = MASTER_CAMERA_KEYS.length - 1;

  const leftIndex = Math.max(0, rightIndex - 1);
  const left = MASTER_CAMERA_KEYS[leftIndex];
  const right = MASTER_CAMERA_KEYS[rightIndex];
  const span = Math.max(0.001, right.timeS - left.timeS);

  // Intentionally linear time parameterization. CP.1E.9 removed per-key
  // smootherStep stops; CP.1E.11 keeps that rule and upgrades the spatial curve
  // to shared-velocity/shared-acceleration quintic Hermite interpolation.
  const t = clamp01((clamped - left.timeS) / span);

  return {
    position: quinticHermiteVec3(
      left.position,
      right.position,
      masterCameraVec3TangentAt(leftIndex, "position"),
      masterCameraVec3TangentAt(rightIndex, "position"),
      masterCameraVec3AccelerationAt(leftIndex, "position"),
      masterCameraVec3AccelerationAt(rightIndex, "position"),
      t,
      span,
    ),
    target: quinticHermiteVec3(
      left.target,
      right.target,
      masterCameraVec3TangentAt(leftIndex, "target"),
      masterCameraVec3TangentAt(rightIndex, "target"),
      masterCameraVec3AccelerationAt(leftIndex, "target"),
      masterCameraVec3AccelerationAt(rightIndex, "target"),
      t,
      span,
    ),
    fov: quinticHermiteScalar(
      left.fov,
      right.fov,
      masterCameraScalarTangentAt(leftIndex),
      masterCameraScalarTangentAt(rightIndex),
      masterCameraScalarAccelerationAt(leftIndex),
      masterCameraScalarAccelerationAt(rightIndex),
      t,
      span,
    ),
  };
}

export function sampleCinematicBurgerRuntime(
  timeS: number,
): CinematicShotRuntimeLayout {
  const rawLayout = sampleRawCinematicBurgerRuntime(timeS);
  return {
    ...rawLayout,
    camera: masterCameraAtTime(timeS),
  };
}

export function getCinematicShotRuntimeLayout(
  shotId: string,
): CinematicShotRuntimeLayout {
  const segment = CINEMATIC_BURGER_TIMELINE_SEGMENTS.find(
    (candidate) => candidate.shotId === shotId,
  );
  if (!segment) return sampleEstablish(0);
  return sampleCinematicBurgerRuntime(segment.startS + segment.durationS * 0.5);
}
