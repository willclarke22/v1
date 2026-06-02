import type { RefObject } from "react";
import * as THREE from "three";
import type { LearningSpaceTopic } from "@/types/learning-space";
import {
  BACKGROUND_TOPIC_POSITION_LERP_ALPHA,
  FOCUSED_BACKGROUND_TOPIC_BODY_SCALE,
  FOCUSED_SELECTED_BACKGROUND_TOPIC_BODY_SCALE,
  FOCUSED_TOPIC_BODY_SCALE,
  FOCUSED_TOPIC_POSITION_LERP_ALPHA,
  LABEL_DISTANCE_FADE_BACKGROUND_MIN_OPACITY,
  LABEL_DISTANCE_FADE_CURRENT_MIN_OPACITY,
  LABEL_DISTANCE_FADE_FAR_MULTIPLIER,
  LABEL_DISTANCE_FADE_NEAR_MULTIPLIER,
  LOCAL_BOB_MAX_AMPLITUDE,
  LOCAL_BOB_MIN_RESERVE,
  LOCAL_BOB_RESERVE_USAGE,
  OVERVIEW_TOPIC_BODY_SCALE,
  OVERVIEW_TOPIC_POSITION_LERP_ALPHA,
  PROBE_TOPIC_POSITION_LERP_ALPHA,
  RADIAL_EXPANSION_CURVE_GAIN,
  RADIAL_EXPANSION_CURVE_POWER,
  RADIAL_EXPANSION_LINEAR_GAIN,
  RADIAL_EXPANSION_MAX_BOOST,
  RADIAL_EXPANSION_START,
  SELECTED_TOPIC_BODY_SCALE,
  VISUAL_SPACE_SCALE_XZ,
  VISUAL_SPACE_SCALE_Y,
  MOVEMENT_TRAIL_BACKGROUND_OPACITY,
  MOVEMENT_TRAIL_FOCUSED_OPACITY,
  MOVEMENT_TRAIL_OVERVIEW_OPACITY,
} from "./constants";

export type AnimatedTopicPositionsRef = RefObject<Map<string, THREE.Vector3>>;

export function getCurrentViewDirection(
  camera: THREE.Camera,
  currentTarget: THREE.Vector3,
) {
  const direction = new THREE.Vector3().subVectors(
    camera.position,
    currentTarget,
  );

  if (direction.lengthSq() === 0) {
    direction.set(0, 0, 1);
  }

  return direction.normalize();
}


export function stableHash(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}


export function stableUnitInterval(text: string) {
  return stableHash(text) / 4_294_967_295;
}


export function getRadialExpansionBoost(planarDistance: number) {
  const beyondStart = Math.max(0, planarDistance - RADIAL_EXPANSION_START);

  if (beyondStart <= 0) {
    return 1;
  }

  const boost =
    beyondStart * RADIAL_EXPANSION_LINEAR_GAIN +
    Math.pow(beyondStart, RADIAL_EXPANSION_CURVE_POWER) *
      RADIAL_EXPANSION_CURVE_GAIN;

  return 1 + Math.min(RADIAL_EXPANSION_MAX_BOOST, boost);
}


export function getTopicVisualRadius(args: {
  topic: LearningSpaceTopic;
  isSelected: boolean;
  isFocused: boolean;
  isAnyTopicFocused: boolean;
}) {
  const baseRadius = args.topic.render_state.radius;

  if (args.isFocused) {
    return baseRadius * FOCUSED_TOPIC_BODY_SCALE;
  }

  if (args.isAnyTopicFocused) {
    return (
      baseRadius *
      (args.isSelected
        ? FOCUSED_SELECTED_BACKGROUND_TOPIC_BODY_SCALE
        : FOCUSED_BACKGROUND_TOPIC_BODY_SCALE)
    );
  }

  return (
    baseRadius *
    (args.isSelected ? SELECTED_TOPIC_BODY_SCALE : OVERVIEW_TOPIC_BODY_SCALE)
  );
}


export function getTopicCameraRadius(topic: LearningSpaceTopic) {
  return topic.render_state.radius * FOCUSED_TOPIC_BODY_SCALE;
}


export function getCollisionSafeBobAmplitude(args: {
  topic: LearningSpaceTopic;
  isFocused: boolean;
  isAnyTopicFocused: boolean;
  isEnteringProbe: boolean;
}) {
  if (args.isEnteringProbe) return 0;

  const radius = args.topic.render_state.radius;
  const collisionRadius =
    typeof args.topic.render_state.collision_radius === "number" &&
    Number.isFinite(args.topic.render_state.collision_radius)
      ? args.topic.render_state.collision_radius
      : radius + LOCAL_BOB_MIN_RESERVE;

  /**
   * Only use a fraction of the spacing envelope beyond the visible radius.
   * The remaining reserve leaves room for rings, badges, future blobiness, and
   * small numeric/layout imperfections.
   */
  const availableReserve = Math.max(
    0,
    collisionRadius - radius - LOCAL_BOB_MIN_RESERVE,
  );

  const modeFactor = args.isFocused ? 0.72 : args.isAnyTopicFocused ? 0.42 : 1;

  return (
    Math.min(
      LOCAL_BOB_MAX_AMPLITUDE,
      availableReserve * LOCAL_BOB_RESERVE_USAGE,
    ) * modeFactor
  );
}


export function toRenderPosition(position: LearningSpaceTopic["position"]) {
  const rawX = position[0];
  const rawY = position[1];
  const rawZ = position[2];

  const planarDistance = Math.sqrt(rawX * rawX + rawZ * rawZ);
  const radialBoost = getRadialExpansionBoost(planarDistance);

  return new THREE.Vector3(
    rawX * VISUAL_SPACE_SCALE_XZ * radialBoost,
    rawY * VISUAL_SPACE_SCALE_Y,
    rawZ * VISUAL_SPACE_SCALE_XZ * radialBoost,
  );
}


export function getTopicPositionVector(topic: LearningSpaceTopic) {
  return toRenderPosition(topic.position);
}


export function getAnimatedTopicPosition(
  topic: LearningSpaceTopic,
  animatedTopicPositionsRef?: AnimatedTopicPositionsRef,
) {
  return (
    animatedTopicPositionsRef?.current.get(topic.topic_id)?.clone() ??
    getTopicPositionVector(topic)
  );
}


export function getTopicPositionKey(topic: LearningSpaceTopic) {
  const renderPosition = getTopicPositionVector(topic);

  return [renderPosition.x, renderPosition.y, renderPosition.z]
    .map((value) => value.toFixed(4))
    .join(",");
}


export function getScreenSpaceRadiusPx(args: {
  camera: THREE.Camera;
  size: { width: number; height: number };
  worldPosition: THREE.Vector3;
  worldRadius: number;
}) {
  const { camera, size, worldPosition, worldRadius } = args;

  if ("isPerspectiveCamera" in camera && camera.isPerspectiveCamera) {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const distance = perspectiveCamera.position.distanceTo(worldPosition);
    const visibleHeight =
      2 *
      Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov * 0.5)) *
      distance;

    if (visibleHeight <= 0) return 0;

    const pixelsPerWorldUnit = size.height / visibleHeight;
    return worldRadius * pixelsPerWorldUnit;
  }

  if ("isOrthographicCamera" in camera && camera.isOrthographicCamera) {
    const orthographicCamera = camera as THREE.OrthographicCamera;
    const visibleHeight =
      (orthographicCamera.top - orthographicCamera.bottom) /
      orthographicCamera.zoom;

    if (visibleHeight <= 0) return 0;

    const pixelsPerWorldUnit = size.height / visibleHeight;
    return worldRadius * pixelsPerWorldUnit;
  }

  return 0;
}


export function getTopicDepthFadeMultiplier(args: {
  camera: THREE.Camera;
  worldPosition: THREE.Vector3;
  worldRadius: number;
  isCurrentTopic: boolean;
}) {
  const distance = args.camera.position.distanceTo(args.worldPosition);
  const safeRadius = Math.max(0.001, args.worldRadius);

  /**
   * Fade is based on camera-to-topic distance, not just absolute world Z or the
   * topic's semantic position. That keeps the fade consistent with the user's
   * current viewing angle while still letting far-away topics recede.
   */
  const nearDistance = safeRadius * LABEL_DISTANCE_FADE_NEAR_MULTIPLIER;
  const farDistance = safeRadius * LABEL_DISTANCE_FADE_FAR_MULTIPLIER;

  const distanceFade =
    1 -
    THREE.MathUtils.clamp(
      (distance - nearDistance) / Math.max(1, farDistance - nearDistance),
      0,
      1,
    );

  const minOpacity = args.isCurrentTopic
    ? LABEL_DISTANCE_FADE_CURRENT_MIN_OPACITY
    : LABEL_DISTANCE_FADE_BACKGROUND_MIN_OPACITY;

  return THREE.MathUtils.lerp(minOpacity, 1, distanceFade);
}


export function getTopicMovementAlpha(args: {
  isFocused: boolean;
  isAnyTopicFocused: boolean;
  isEnteringProbe: boolean;
}) {
  if (args.isEnteringProbe) return PROBE_TOPIC_POSITION_LERP_ALPHA;
  if (args.isFocused) return FOCUSED_TOPIC_POSITION_LERP_ALPHA;
  if (args.isAnyTopicFocused) return BACKGROUND_TOPIC_POSITION_LERP_ALPHA;
  return OVERVIEW_TOPIC_POSITION_LERP_ALPHA;
}


export function getTrailInitialOpacity(args: {
  isFocused: boolean;
  isAnyTopicFocused: boolean;
}) {
  if (args.isFocused) return MOVEMENT_TRAIL_FOCUSED_OPACITY;
  if (args.isAnyTopicFocused) return MOVEMENT_TRAIL_BACKGROUND_OPACITY;
  return MOVEMENT_TRAIL_OVERVIEW_OPACITY;
}


export function clampOpacity(value: number) {
  return Math.max(0, Math.min(1, value));
}


export function getProjectedScreenPoint(args: {
  point: THREE.Vector3;
  camera: THREE.Camera;
  size: { width: number; height: number };
}) {
  const projected = args.point.clone().project(args.camera);

  return {
    x: (projected.x * 0.5 + 0.5) * args.size.width,
    y: (-projected.y * 0.5 + 0.5) * args.size.height,
    z: projected.z,
  };
}
