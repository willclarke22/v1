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

export type CinematicShotRuntimeLayout = {
  camera: RuntimeCameraPose;
  tray: RuntimeActorPose;
  foods: [RuntimeActorPose, RuntimeActorPose, RuntimeActorPose];
  cow: RuntimeActorPose;
  chicken: RuntimeActorPose;
  goldfish: RuntimeActorPose;
  hand: RuntimeActorPose;
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

  // Movement leads the transition. Opacity only drops in the final portion so the
  // food reads as physically clearing the shot rather than lingering as a ghost.
  const fadeTail = smootherStep(clamp01((focus - 0.7) / 0.3));
  return {
    opacity: lerp(1, 0.035, fadeTail),
    xOffset: side * 0.22 * movement,
    zOffset: 0.14 * movement,
    scale: lerp(1, 0.93, movement),
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
      { position: [1.38, 1.76, 3.46], target: [0.72, 0.3, -0.18], fov: 30.2 },
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
      { position: [-1.36, 1.76, 3.46], target: [-0.72, 0.3, -0.18], fov: 30.2 },
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
  const arrival = smootherStep(clamp01((progress - 0.05) / 0.31));
  const departure = smootherStep(clamp01((progress - 0.76) / 0.2));
  const fishFocus = smoothWindow(progress, 0.08, 0.34, 0.7, 0.94);
  const animalOpacity = smoothWindow(progress, 0.1, 0.28, 0.74, 0.93);
  const appleTransition = supportTransitionForInsert(progress, -1, 0.02);
  const nigiriTransition = supportTransitionForInsert(progress, 1, 0.04);
  const burgerDeemphasis = smootherStep(fishFocus);
  const swim = Math.sin(progress * Math.PI * 5.2) * 0.022 * (1 - departure);
  const tail = Math.sin(progress * Math.PI * 10.4) * 0.08 * (1 - departure);
  return {
    camera: lerpCamera(
      { position: [0.32, 2.08, 4.12], target: [0.02, 0.34, -0.02], fov: 32.2 },
      { position: [0.2, 1.62, 3.18], target: [0.18, 0.28, -0.24], fov: 29.4 },
      fishFocus,
    ),
    tray: trayPose(),
    foods: [
      pose(
        [-1.42 + appleTransition.xOffset, RESTING_LIFT_Y, 0.4 + appleTransition.zOffset],
        [0.02, -0.18, 0.04],
        0.72 * appleTransition.scale,
        appleTransition.opacity,
      ),
      pose(
        [lerp(0.04, -0.92, burgerDeemphasis), RESTING_LIFT_Y, lerp(-0.04, 0.28, burgerDeemphasis)],
        [0, lerp(0.04, -0.12, burgerDeemphasis), 0],
        lerp(0.98, 0.72, burgerDeemphasis),
        lerp(1, 0.18, smootherStep(clamp01((burgerDeemphasis - 0.72) / 0.28))),
      ),
      pose(
        [1.42 + nigiriTransition.xOffset, RESTING_LIFT_Y, 0.4 + nigiriTransition.zOffset],
        [0.02, 0.26, -0.05],
        0.72 * nigiriTransition.scale,
        nigiriTransition.opacity,
      ),
    ],
    cow: hiddenActor(),
    chicken: hiddenActor(),
    goldfish: pose(
      [
        lerp(1.48, 0.2, arrival) + departure * 0.36,
        Math.sin(arrival * Math.PI) * 0.055 + swim,
        lerp(0.06, -0.3, arrival),
      ],
      [0.02 + tail * 0.05, lerp(-1.38, -1.68, arrival), 0.02 + tail * 0.08],
      lerp(0.68, 0.9, arrival) * lerp(1, 0.96, departure),
      animalOpacity,
      smoothWindow(progress, 0.3, 0.42, 0.68, 0.84),
    ),
    hand: hiddenActor(),
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
  const { segment, progress } = segmentAtTime(timeS);
  switch (segment.shotId) {
    case "shot_01_establish":
      return sampleEstablish(progress);
    case "shot_02_hand_nudge":
      return sampleHandNudge(progress);
    case "shot_03_hero_shift":
      return sampleHeroShift(progress);
    case "shot_04_cow_insert":
      return sampleCowInsert(progress);
    case "shot_05_chicken_insert":
      return sampleChickenInsert(progress);
    case "shot_06_goldfish_insert":
      return sampleGoldfishInsert(progress);
    case "shot_07_return_tray":
      return sampleReturnTray(progress);
    case "shot_08_hero":
      return sampleHero(progress);
    default:
      return sampleEstablish(0);
  }
}

function cameraVelocityAtRawTime(timeS: number, sampleWindowS = 0.06) {
  const beforeTime = Math.max(0, timeS - sampleWindowS);
  const afterTime = Math.min(CINEMATIC_BURGER_TIMELINE_DURATION_S, timeS + sampleWindowS);
  const duration = Math.max(0.001, afterTime - beforeTime);
  const before = sampleRawCinematicBurgerRuntime(beforeTime).camera;
  const after = sampleRawCinematicBurgerRuntime(afterTime).camera;
  return {
    position: [
      (after.position[0] - before.position[0]) / duration,
      (after.position[1] - before.position[1]) / duration,
      (after.position[2] - before.position[2]) / duration,
    ] as RuntimeVec3,
    target: [
      (after.target[0] - before.target[0]) / duration,
      (after.target[1] - before.target[1]) / duration,
      (after.target[2] - before.target[2]) / duration,
    ] as RuntimeVec3,
    fov: (after.fov - before.fov) / duration,
  };
}

function continuousCameraAtTime(timeS: number, rawCamera: RuntimeCameraPose): RuntimeCameraPose {
  const blendWindowS = 0.34;
  const boundary = CINEMATIC_BURGER_TIMELINE_SEGMENTS
    .slice(1)
    .map((segment) => segment.startS)
    .find((startS) => Math.abs(timeS - startS) < blendWindowS);

  if (typeof boundary !== "number") return rawCamera;

  const startS = Math.max(0, boundary - blendWindowS);
  const endS = Math.min(CINEMATIC_BURGER_TIMELINE_DURATION_S, boundary + blendWindowS);
  const durationS = Math.max(0.001, endS - startS);
  const progress = clamp01((timeS - startS) / durationS);
  const start = sampleRawCinematicBurgerRuntime(startS).camera;
  const end = sampleRawCinematicBurgerRuntime(endS).camera;
  const startVelocity = cameraVelocityAtRawTime(startS);
  const endVelocity = cameraVelocityAtRawTime(endS);

  return {
    position: hermiteVec3(
      start.position,
      end.position,
      startVelocity.position,
      endVelocity.position,
      progress,
      durationS,
    ),
    target: hermiteVec3(
      start.target,
      end.target,
      startVelocity.target,
      endVelocity.target,
      progress,
      durationS,
    ),
    fov: hermiteScalar(
      start.fov,
      end.fov,
      startVelocity.fov,
      endVelocity.fov,
      progress,
      durationS,
    ),
  };
}

export function sampleCinematicBurgerRuntime(
  timeS: number,
): CinematicShotRuntimeLayout {
  const rawLayout = sampleRawCinematicBurgerRuntime(timeS);
  return {
    ...rawLayout,
    camera: continuousCameraAtTime(timeS, rawLayout.camera),
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
