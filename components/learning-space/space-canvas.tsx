"use client";

import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Html, Stars, TrackballControls } from "@react-three/drei";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
  type RefObject,
} from "react";
import * as THREE from "three";
import type {
  LearningSpace,
  LearningSpaceRelationship,
  LearningSpaceTopic,
  RelationshipViewMode,
} from "@/types/learning-space";
import type { ProbeSummary } from "@/components/probes/probe-surface";

type TrackballControlsRef = ElementRef<typeof TrackballControls>;
type SceneArrivalMode = "warp" | "focus";
type AnimatedTopicPositionsRef = RefObject<Map<string, THREE.Vector3>>;
type PreProbeViewSnapshot = {
  cameraPosition: THREE.Vector3;
  cameraQuaternion: THREE.Quaternion;
  cameraUp: THREE.Vector3;
  cameraZoom: number;
  target: THREE.Vector3;
  capturedAt: number;
};
type PreProbeViewSnapshotRef = { current: PreProbeViewSnapshot | null };

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 18, 72);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);
const ZOOMED_OUT_DISTANCE = 72;

/**
 * Renderer-only expansion.
 *
 * Supabase topic_position / semantic_position stay in canonical semantic-map
 * units. The canvas expands those coordinates for a more spacious,
 * NASA-Eyes-like overview without corrupting persisted layout math.
 *
 * v15: X/Z still provide the broad map, but Y now has enough scale to make
 * the learning space genuinely explorable from different viewpoints.
 */
const VISUAL_SPACE_SCALE_XZ = 6.85;
const VISUAL_SPACE_SCALE_Y = 4.35;

/**
 * NASA-Eyes-style composition shaping.
 *
 * This pass gives the map more "system scale" while preserving relationships:
 * most of the extra spacing comes from uniform X/Z expansion, not nonlinear
 * distortion. This radial boost is kept
 * deliberately gentle: it helps far topics feel like they live in a larger
 * solar-system space, but it should not become the main source of semantic
 * distance. The backend semantic layout still owns topic relationships.
 *
 * This is renderer-only. It does not modify topic_position or semantic_position.
 */
const RADIAL_EXPANSION_START = 1.35;
const RADIAL_EXPANSION_LINEAR_GAIN = 0.045;
const RADIAL_EXPANSION_CURVE_GAIN = 0.018;
const RADIAL_EXPANSION_CURVE_POWER = 1.18;
const RADIAL_EXPANSION_MAX_BOOST = 0.42;

/**
 * Renderer-only body scale.
 *
 * The learning-space contract still owns render_state.radius. These factors
 * only decide how large the bodies appear in this particular scene composition.
 * Smaller background bodies create a stronger sense of navigable space, while
 * the selected/focused body can become visually dominant like a planet view.
 */
const OVERVIEW_TOPIC_BODY_SCALE = 0.74;
const SELECTED_TOPIC_BODY_SCALE = 0.94;
const FOCUSED_TOPIC_BODY_SCALE = 1.28;
const FOCUSED_BACKGROUND_TOPIC_BODY_SCALE = 0.5;
const FOCUSED_SELECTED_BACKGROUND_TOPIC_BODY_SCALE = 0.68;

const SETTLE_DELAY_MS = 220;
const TOPIC_CLICK_SEQUENCE_MS = 280;

/**
 * Global labels should hide only for real manual view manipulation.
 * A normal click/select, worker refresh, semantic-layout commit, or
 * programmatic camera ride should not blank every topic label.
 */
const VIEW_DRAG_LABEL_HIDE_THRESHOLD_PX = 8;

/**
 * Topic arrival should feel like a gentle materialization, not a flash.
 * These values only control the creation animation for genuinely new topic ids.
 */
const TOPIC_APPEARANCE_LERP_ALPHA = 0.075;
const TOPIC_APPEARANCE_START_SCALE = 0.58;

/**
 * Visual-only movement policy.
 *
 * Canonical topic positions still come from learningSpace.topics[].position.
 * These values only control how the renderer eases toward that already-committed
 * renderer-safe position. Keep these intentionally calm so semantic-layout
 * updates feel like graceful migration rather than abrupt jumps.
 *
 * Keep the overview/focused/background alphas matched for now so a staged
 * layout release feels like one synchronized migration event instead of the
 * highlighted topic arriving before or after the rest of the map.
 */
const OVERVIEW_TOPIC_POSITION_LERP_ALPHA = 0.009;
const FOCUSED_TOPIC_POSITION_LERP_ALPHA = 0.009;
const BACKGROUND_TOPIC_POSITION_LERP_ALPHA = 0.009;
const PROBE_TOPIC_POSITION_LERP_ALPHA = 0;

/**
 * Elegant semantic drift trail policy.
 *
 * The trail should feel like a subtle memory of movement, not a busy sci-fi
 * effect. It appears only after a meaningful committed position change and
 * fades away automatically. White keeps it readable over the starfield without
 * adding another semantic color language.
 */
const MOVEMENT_TRAIL_MIN_DISTANCE = 0.14;
const MOVEMENT_TRAIL_FADE_RATE = 0.985;
const MOVEMENT_TRAIL_TARGET_REACHED_FADE_RATE = 0.982;
const MOVEMENT_TRAIL_MIN_OPACITY = 0.012;
const MOVEMENT_TRAIL_OVERVIEW_OPACITY = 0.72;
const MOVEMENT_TRAIL_FOCUSED_OPACITY = 0.62;
const MOVEMENT_TRAIL_BACKGROUND_OPACITY = 0.42;

/**
 * Camera tether policy.
 *
 * This is deliberately gentler than a user-triggered warp/focus. Topic movement
 * should not yank the camera around; only the currently focused/selected topic
 * is softly followed.
 */
const CAMERA_TETHER_MIN_TOPIC_MOVE = 0.035;
const FOCUSED_TOPIC_TETHER_CAMERA_ALPHA = 0.045;
const FOCUSED_TOPIC_TETHER_TARGET_ALPHA = 0.055;
const SELECTED_TOPIC_TETHER_TARGET_ALPHA = 0.045;

/**
 * Collision-safe local liveliness.
 *
 * Topic center positions remain controlled by semantic layout + backend commit.
 * This small local bob is reserved inside render_state.collision_radius, so it
 * should not break the non-overlap contract. Keep this subtle: MyWay should
 * feel alive without making topic placement visually untrustworthy.
 */
const LOCAL_BOB_MAX_AMPLITUDE = 0.055;
const LOCAL_BOB_RESERVE_USAGE = 0.52;
const LOCAL_BOB_MIN_RESERVE = 0.045;
const LOCAL_BOB_XZ_FACTOR = 0.22;
const LOCAL_BOB_LERP_ALPHA = 0.08;
const LOCAL_BOB_BASE_SPEED = 0.62;
const LOCAL_BOB_SPEED_VARIATION = 0.28;

/**
 * Map-label policy.
 *
 * Labels are useful for navigation, but the current topic's label becomes
 * redundant in close-up because the right panel owns that context.
 * Do not hide all labels just because a topic is focused or because layout
 * migration is staged; other labels should remain visible so the learner can
 * stay oriented.
 */
const LABEL_HIDE_SCREEN_RADIUS_PX = 44;
const LABEL_MAX_WIDTH_OVERVIEW = 210;
const LABEL_MAX_WIDTH_PROMINENT = 260;
const LABEL_OFFSET_MIN_PX = 34;
const LABEL_OFFSET_MAX_PX = 112;
const LABEL_OFFSET_SCREEN_RADIUS_MULTIPLIER = 0.86;
const LABEL_OFFSET_SCREEN_RADIUS_BIAS_PX = 22;
const LABEL_OFFSET_CURRENT_TOPIC_EXTRA_PX = 18;
const SEMANTIC_RELATIONSHIP_ARC_MAX_COUNT = 3;
const SEMANTIC_RELATIONSHIP_ARC_SEGMENTS = 72;
const SEMANTIC_RELATIONSHIP_ARC_MIN_OPACITY = 0.1;
const SEMANTIC_RELATIONSHIP_ARC_BASE_OPACITY = 0.18;
const SEMANTIC_RELATIONSHIP_ARC_FOCUSED_OPACITY_BOOST = 0.12;
const SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MIN = 0.9;
const SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MAX = 4.8;
const SEMANTIC_RELATIONSHIP_ARC_LIFT_DISTANCE_FACTOR = 0.18;
const SEMANTIC_RELATIONSHIP_MIN_SCREEN_DISTANCE_PX = 54;
const SEMANTIC_RELATIONSHIP_MAX_SCREEN_FRACTION = 0.82;
const LABEL_OCCLUSION_RADIUS_MULTIPLIER = 1.14;
const LABEL_OCCLUSION_DEPTH_PADDING = 0.08;
const LABEL_OCCLUSION_FADE_BAND = 0.48;
const LABEL_OCCLUSION_MAX_OPACITY_MULTIPLIER = 0.34;
const LABEL_OCCLUSION_SCREEN_RADIUS_MULTIPLIER = 1.12;
const LABEL_OCCLUSION_SCREEN_PADDING_PX = 18;
const LABEL_OCCLUSION_SCREEN_FADE_BAND_PX = 44;
const LABEL_OCCLUSION_SCREEN_HARD_CORE_MULTIPLIER = 0.82;
const LABEL_DISTANCE_FADE_NEAR_MULTIPLIER = 4.2;
const LABEL_DISTANCE_FADE_FAR_MULTIPLIER = 18;
const LABEL_DISTANCE_FADE_BACKGROUND_MIN_OPACITY = 0.68;
const LABEL_DISTANCE_FADE_CURRENT_MIN_OPACITY = 0.84;
const LABEL_CURRENT_MIN_OPACITY_WHEN_VISIBLE = 0.78;

/**
 * Mode-driven relationship scanner.
 *
 * Relationship lines now behave as a visual lens. The active mode decides what
 * the arcs mean:
 *
 * - semantic_similarity: semantic neighborhood arcs
 * - confusion: shared confusion signal arcs
 * - insight: shared insight signal arcs
 * - off: no relationship arcs
 *
 * While the user rotates the view, scanner relationships are selected from the
 * current camera/view corridor. On release, the last scanner result stays
 * briefly before returning to the current mode's default focused relationships.
 */
const VIEWPOINT_SCANNER_RELATIONSHIP_MAX_COUNT = 3;
const VIEWPOINT_SCANNER_SETTLE_MS = 3000;
const VIEWPOINT_SCANNER_CORRIDOR_RADIUS_PX = 280;
const VIEWPOINT_SCANNER_CORE_RADIUS_PX = 82;
const VIEWPOINT_SCANNER_MAX_SCREEN_FRACTION = 0.74;
const VIEWPOINT_SCANNER_FAR_CORRIDOR_MIN_SCORE = 0.11;
const VIEWPOINT_SCANNER_MIN_SCORE = 0.18;
const VIEWPOINT_SCANNER_ACTIVE_TOPIC_BIAS = 0.2;
const RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MIN = 0.014;
const RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MAX = 0.058;
const RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MIN = 0.038;
const RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MAX = 0.135;
const RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MIN = 0.034;
const RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MAX = 0.112;
const RELATIONSHIP_ARC_TUBE_RADIAL_SEGMENTS = 8;
const RELATIONSHIP_ARC_TUBE_SEGMENTS = 48;

/**
 * Relationship-line occlusion rule.
 *
 * Non-connected topics should obey normal real-world depth:
 * if a relationship line is closer to the camera than an unrelated sphere, the
 * line can appear in front; if the unrelated sphere is closer, it hides the
 * line.
 *
 * Connected endpoint topics are different. Relationship lines should still tuck
 * into the topics they connect to, so each relationship creates its own tiny
 * stencil mask for only its two endpoint topics. The actual topic spheres do not
 * write the relationship stencil globally.
 */
const RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION = 0.18;
const VIEWPOINT_SCANNER_BLUE = "#7BAFD4";
const VIEWPOINT_SCANNER_SETTLED_BLUE = VIEWPOINT_SCANNER_BLUE;

const CONFUSION_SIGNAL_RELATIONSHIP_RED = "#fb7185";
const INSIGHT_SIGNAL_RELATIONSHIP_GREEN = "#34d399";
const RELATIONSHIP_VIEW_MODE_ARC_MAX_COUNT = 3;

/**
 * Probe surface thumbnail.
 *
 * Temporary dev mode keeps probe-like thumbnails visible on every topic so the
 * surface treatment can be tuned without repeatedly creating new eligible
 * probes. Turn this back to false once the thumbnail feels right.
 */
const SHOW_DEBUG_PROBE_THUMBNAILS_FOR_ALL_TOPICS = true;

/**
 * The probe display should feel like the topic sphere itself becomes the
 * thumbnail, similar to a miniature Vegas Sphere. This is intentionally
 * viewer-facing so the probe stays upright and readable as the camera rotates.
 *
 * This display is visual-only for pointer behavior. Normal topic click,
 * double-click, and drag/scanning interactions still belong to the underlying
 * topic sphere.
 */
const PROBE_DISPLAY_SPHERE_SCALE = 1.002;
const PROBE_DISPLAY_GLOW_SCALE = 1.006;
const PROBE_DISPLAY_RENDER_ORDER = 24;
const PROBE_DISPLAY_GLOW_RENDER_ORDER = 23;
const PROBE_DISPLAY_TEXTURE_WIDTH = 1024;
const PROBE_DISPLAY_TEXTURE_HEIGHT = 512;
const PROBE_DISPLAY_GLOW_OPACITY = 0;
const PROBE_DISPLAY_FRONT_ROTATION_Y = -Math.PI / 2;
const PROBE_EXIT_CAMERA_ALPHA = 0.068;
const PROBE_EXIT_TARGET_ALPHA = 0.074;
const PROBE_MARKER_DEFAULT_NORMAL = new THREE.Vector3(0.48, 0.55, 0.68).normalize();

const RELATIONSHIP_DEFAULT_ENDPOINT_ACTIVE_COLOR = "#ead7ff";
const RELATIONSHIP_DEFAULT_ENDPOINT_BACKGROUND_COLOR = "#d4d4d8";
const TOPIC_SPHERE_RENDER_ORDER = 10;
const RELATIONSHIP_ENDPOINT_STENCIL_RENDER_ORDER = 18;
const RELATIONSHIP_ARC_RENDER_ORDER = 20;
const TOPIC_STENCIL_REF = 1;
const RELATIONSHIP_STENCIL_REF_MIN = 2;
const RELATIONSHIP_STENCIL_REF_MAX = 255;

type RelationshipDisplayMode = "default_mode" | "scanning" | "settled_scan";
type RelationshipArcVariant = "default" | "scanner" | "settled_scan";

function getTopicById(
  topics: LearningSpaceTopic[],
  topicId: string | null,
): LearningSpaceTopic | null {
  if (!topicId) return null;
  return topics.find((topic) => topic.topic_id === topicId) ?? null;
}

function getCurrentViewDirection(
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

function getTopicDisplayLabel(topic: LearningSpaceTopic) {
  return topic.topic_label.trim() || "Untitled Topic";
}

function stableHash(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function stableUnitInterval(text: string) {
  return stableHash(text) / 4_294_967_295;
}

function getRadialExpansionBoost(planarDistance: number) {
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

function getTopicVisualRadius(args: {
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

function getTopicCameraRadius(topic: LearningSpaceTopic) {
  return topic.render_state.radius * FOCUSED_TOPIC_BODY_SCALE;
}

function getCollisionSafeBobAmplitude(args: {
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

function toRenderPosition(position: LearningSpaceTopic["position"]) {
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

function getTopicPositionVector(topic: LearningSpaceTopic) {
  return toRenderPosition(topic.position);
}

function getAnimatedTopicPosition(
  topic: LearningSpaceTopic,
  animatedTopicPositionsRef?: AnimatedTopicPositionsRef,
) {
  return (
    animatedTopicPositionsRef?.current.get(topic.topic_id)?.clone() ??
    getTopicPositionVector(topic)
  );
}

function getTopicPositionKey(topic: LearningSpaceTopic) {
  const renderPosition = getTopicPositionVector(topic);

  return [renderPosition.x, renderPosition.y, renderPosition.z]
    .map((value) => value.toFixed(4))
    .join(",");
}

function getScreenSpaceRadiusPx(args: {
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


function getTopicDepthFadeMultiplier(args: {
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

function getTopicMovementAlpha(args: {
  isFocused: boolean;
  isAnyTopicFocused: boolean;
  isEnteringProbe: boolean;
}) {
  if (args.isEnteringProbe) return PROBE_TOPIC_POSITION_LERP_ALPHA;
  if (args.isFocused) return FOCUSED_TOPIC_POSITION_LERP_ALPHA;
  if (args.isAnyTopicFocused) return BACKGROUND_TOPIC_POSITION_LERP_ALPHA;
  return OVERVIEW_TOPIC_POSITION_LERP_ALPHA;
}

function getTrailInitialOpacity(args: {
  isFocused: boolean;
  isAnyTopicFocused: boolean;
}) {
  if (args.isFocused) return MOVEMENT_TRAIL_FOCUSED_OPACITY;
  if (args.isAnyTopicFocused) return MOVEMENT_TRAIL_BACKGROUND_OPACITY;
  return MOVEMENT_TRAIL_OVERVIEW_OPACITY;
}

function getRelationshipOtherTopicId(
  relationship: LearningSpaceRelationship,
  topicId: string,
) {
  if (relationship.source_topic_id === topicId)
    return relationship.target_topic_id;
  if (relationship.target_topic_id === topicId)
    return relationship.source_topic_id;
  return null;
}

function relationshipTouchesTopic(
  relationship: LearningSpaceRelationship,
  topicId: string | null,
) {
  if (!topicId) return false;

  return (
    relationship.source_topic_id === topicId ||
    relationship.target_topic_id === topicId
  );
}

function isSemanticSimilarityRelationship(
  relationship: LearningSpaceRelationship,
) {
  return relationship.relationship_type === "semantic_similarity";
}

function isConfusionSignalRelationship(
  relationship: LearningSpaceRelationship,
) {
  return relationship.relationship_type === "shared_confusion_pattern";
}

function isInsightSignalRelationship(
  relationship: LearningSpaceRelationship,
) {
  return relationship.relationship_type === "shared_insight_pattern";
}

function isDiagnosticSignalRelationship(
  relationship: LearningSpaceRelationship,
) {
  return (
    isConfusionSignalRelationship(relationship) ||
    isInsightSignalRelationship(relationship)
  );
}

function relationshipMatchesViewMode(
  relationship: LearningSpaceRelationship,
  relationshipViewMode: RelationshipViewMode,
) {
  if (relationshipViewMode === "semantic_similarity") {
    return isSemanticSimilarityRelationship(relationship);
  }

  if (relationshipViewMode === "confusion") {
    return isConfusionSignalRelationship(relationship);
  }

  if (relationshipViewMode === "insight") {
    return isInsightSignalRelationship(relationship);
  }

  return false;
}

function shouldShowRelationshipOnFocus(args: {
  relationship: LearningSpaceRelationship;
  relationshipViewMode: RelationshipViewMode;
  activeTopicId: string;
  topicsById: Map<string, LearningSpaceTopic>;
}) {
  const { relationship, relationshipViewMode, activeTopicId, topicsById } = args;

  if (!relationshipMatchesViewMode(relationship, relationshipViewMode)) {
    return false;
  }

  if (!relationshipTouchesTopic(relationship, activeTopicId)) return false;
  if (!topicsById.has(relationship.source_topic_id)) return false;
  if (!topicsById.has(relationship.target_topic_id)) return false;

  return relationship.display_policy?.show_on_focus !== false;
}

function getRelationshipSortScore(relationship: LearningSpaceRelationship) {
  const priority = Number.isFinite(relationship.display_policy?.priority)
    ? relationship.display_policy.priority
    : 0;
  const strength = Number.isFinite(relationship.strength)
    ? relationship.strength
    : 0;
  const confidence = Number.isFinite(relationship.confidence)
    ? relationship.confidence
    : 0;
  const similarity =
    typeof relationship.basis?.similarity === "number" &&
    Number.isFinite(relationship.basis.similarity)
      ? relationship.basis.similarity
      : 0;

  return priority * 4 + strength * 2 + confidence + similarity;
}

function clampOpacity(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getRelationshipLineStrength(relationship: LearningSpaceRelationship) {
  if (
    typeof relationship.strength === "number" &&
    Number.isFinite(relationship.strength)
  ) {
    return THREE.MathUtils.clamp(relationship.strength, 0, 1);
  }

  if (
    typeof relationship.basis?.similarity === "number" &&
    Number.isFinite(relationship.basis.similarity)
  ) {
    return THREE.MathUtils.clamp(relationship.basis.similarity, 0, 1);
  }

  return 0.4;
}

function getRelationshipTubeRadius(args: {
  variant: RelationshipArcVariant;
  strength: number;
}) {
  const strength = THREE.MathUtils.clamp(args.strength, 0, 1);

  /**
   * Relationship values tend to live in a fairly narrow middle range right now,
   * so a stronger shaping curve makes thickness differences readable without
   * making weak relationships disappear.
   */
  const shapedStrength = Math.pow(strength, 0.52);

  if (args.variant === "scanner") {
    return THREE.MathUtils.lerp(
      RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MIN,
      RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MAX,
      shapedStrength,
    );
  }

  if (args.variant === "settled_scan") {
    return THREE.MathUtils.lerp(
      RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MIN,
      RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MAX,
      shapedStrength,
    );
  }

  return THREE.MathUtils.lerp(
    RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MIN,
    RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MAX,
    shapedStrength,
  );
}

function getRelationshipBaseColor(args: {
  relationship: LearningSpaceRelationship;
  variant: RelationshipArcVariant;
}) {
  if (isConfusionSignalRelationship(args.relationship)) {
    return CONFUSION_SIGNAL_RELATIONSHIP_RED;
  }

  if (isInsightSignalRelationship(args.relationship)) {
    return INSIGHT_SIGNAL_RELATIONSHIP_GREEN;
  }

  if (isSemanticSimilarityRelationship(args.relationship)) {
    return VIEWPOINT_SCANNER_BLUE;
  }

  if (args.variant === "scanner" || args.variant === "settled_scan") {
    return VIEWPOINT_SCANNER_BLUE;
  }

  return "#f8fafc";
}

function getRelationshipStencilRef(relationshipId: string) {
  const range = RELATIONSHIP_STENCIL_REF_MAX - RELATIONSHIP_STENCIL_REF_MIN + 1;

  return (
    RELATIONSHIP_STENCIL_REF_MIN + (stableHash(relationshipId) % range)
  );
}

function getRelationshipEndpointVisualRadius(args: {
  topic: LearningSpaceTopic;
  activeTopicId: string;
  isAnyTopicFocused: boolean;
}) {
  const isActiveTopic = args.topic.topic_id === args.activeTopicId;

  return getTopicVisualRadius({
    topic: args.topic,
    isSelected: isActiveTopic,
    isFocused: isActiveTopic && args.isAnyTopicFocused,
    isAnyTopicFocused: args.isAnyTopicFocused,
  });
}


function getRelationshipEndpointColor(args: {
  topic: LearningSpaceTopic;
  activeTopicId: string;
  isAnyTopicFocused: boolean;
}) {
  const isActiveTopic = args.topic.topic_id === args.activeTopicId;

  if (isActiveTopic) {
    return RELATIONSHIP_DEFAULT_ENDPOINT_ACTIVE_COLOR;
  }

  if (args.isAnyTopicFocused) {
    return "#a1a1aa";
  }

  return RELATIONSHIP_DEFAULT_ENDPOINT_BACKGROUND_COLOR;
}

function applyRelationshipArcVertexColors(args: {
  geometry: THREE.BufferGeometry;
  startColor: string;
  middleColor: string;
  endColor: string;
}) {
  const startColor = new THREE.Color(args.startColor);
  const middleColor = new THREE.Color(args.middleColor);
  const endColor = new THREE.Color(args.endColor);
  const colorValues: number[] = [];
  const rowLength = RELATIONSHIP_ARC_TUBE_RADIAL_SEGMENTS + 1;
  const positionAttribute = args.geometry.getAttribute("position");
  const vertexCount = positionAttribute.count;

  for (let index = 0; index < vertexCount; index += 1) {
    const segmentIndex = Math.floor(index / rowLength);
    const u = THREE.MathUtils.clamp(
      segmentIndex / RELATIONSHIP_ARC_TUBE_SEGMENTS,
      0,
      1,
    );
    let color = middleColor.clone();

    if (u < RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION) {
      color = startColor
        .clone()
        .lerp(middleColor, u / RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION);
    } else if (u > 1 - RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION) {
      color = middleColor
        .clone()
        .lerp(
          endColor,
          (u - (1 - RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION)) /
            RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION,
        );
    }

    colorValues.push(color.r, color.g, color.b);
  }

  args.geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colorValues, 3),
  );
}

function disposeRelationshipGroupChildren(group: THREE.Group) {
  for (const child of [...group.children]) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }

    group.remove(child);
  }
}

function buildArcPoints(args: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  strength: number;
}) {
  const distance = args.start.distanceTo(args.end);
  const lift =
    Math.min(
      SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MAX,
      Math.max(
        SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MIN,
        distance * SEMANTIC_RELATIONSHIP_ARC_LIFT_DISTANCE_FACTOR,
      ),
    ) *
    (0.82 + Math.max(0, Math.min(1, args.strength)) * 0.18);

  const midpoint = args.start.clone().lerp(args.end, 0.5);
  const control = midpoint.clone().add(new THREE.Vector3(0, lift, 0));
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= SEMANTIC_RELATIONSHIP_ARC_SEGMENTS; index += 1) {
    const t = index / SEMANTIC_RELATIONSHIP_ARC_SEGMENTS;
    const oneMinusT = 1 - t;
    const point = args.start
      .clone()
      .multiplyScalar(oneMinusT * oneMinusT)
      .add(control.clone().multiplyScalar(2 * oneMinusT * t))
      .add(args.end.clone().multiplyScalar(t * t));

    points.push(point);
  }

  return points;
}

function getProjectedScreenPoint(args: {
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

function getCameraAngleRelationshipLegibility(args: {
  camera: THREE.Camera;
  size: { width: number; height: number };
  sourcePosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
}) {
  /**
   * Free-exploration rule: relationships should feel like they appear from the
   * current viewpoint when both endpoints are in front of the camera and the
   * relationship is visually legible in screen space. This is not a hard mode;
   * it is a soft opacity gate driven by camera angle and line of sight.
   */
  const source = getProjectedScreenPoint({
    point: args.sourcePosition,
    camera: args.camera,
    size: args.size,
  });
  const target = getProjectedScreenPoint({
    point: args.targetPosition,
    camera: args.camera,
    size: args.size,
  });

  const sourceInFront = source.z > -1 && source.z < 1;
  const targetInFront = target.z > -1 && target.z < 1;

  if (!sourceInFront || !targetInFront) return 0;

  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const screenDistance = Math.sqrt(dx * dx + dy * dy);
  const screenMax = Math.max(args.size.width, args.size.height);

  const tooCloseFade = THREE.MathUtils.clamp(
    (screenDistance - SEMANTIC_RELATIONSHIP_MIN_SCREEN_DISTANCE_PX) /
      SEMANTIC_RELATIONSHIP_MIN_SCREEN_DISTANCE_PX,
    0,
    1,
  );
  const tooFarFade = THREE.MathUtils.clamp(
    (screenMax * SEMANTIC_RELATIONSHIP_MAX_SCREEN_FRACTION - screenDistance) /
      Math.max(1, screenMax * 0.22),
    0.18,
    1,
  );

  return tooCloseFade * tooFarFade;
}

function getLabelOcclusionStrength(args: {
  topic: LearningSpaceTopic;
  allTopics: LearningSpaceTopic[];
  camera: THREE.Camera;
  size: { width: number; height: number };
  selectedTopicId: string | null;
  focusedTopicId: string | null;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
  labelWorldPosition: THREE.Vector3;
  labelOffsetPx: number;
}) {
  /**
   * Drei Html labels are DOM overlays, so they do not automatically disappear
   * behind nearer topic spheres. This custom test combines:
   *
   * 1. screen-space overlap against nearer/active topic bodies, and
   * 2. a 3D camera-ray test for geometric line-of-sight occlusion.
   *
   * The active-topic screen-space branch is intentionally allowed even when the
   * camera is very close to, or partially inside, the focused sphere. This keeps
   * labels from showing through the sphere while backing out of a probe.
   */
  const cameraPosition = args.camera.position;
  const labelVector = args.labelWorldPosition.clone().sub(cameraPosition);
  const labelDistance = labelVector.length();

  if (labelDistance <= 0.001) return 0;

  const labelProjected = getProjectedScreenPoint({
    point: args.labelWorldPosition,
    camera: args.camera,
    size: args.size,
  });

  const labelScreenPoint = {
    x: labelProjected.x,
    y: labelProjected.y - args.labelOffsetPx,
  };

  const rayDirection = labelVector.clone().multiplyScalar(1 / labelDistance);
  const isAnyTopicFocused = args.focusedTopicId !== null;
  let strongestOcclusion = 0;

  for (const otherTopic of args.allTopics) {
    if (otherTopic.topic_id === args.topic.topic_id) continue;

    const isSelectedBlocker = otherTopic.topic_id === args.selectedTopicId;
    const isFocusedBlocker = otherTopic.topic_id === args.focusedTopicId;
    const isActiveBlocker = isSelectedBlocker || isFocusedBlocker;

    const otherPosition = getAnimatedTopicPosition(
      otherTopic,
      args.animatedTopicPositionsRef,
    );
    const toOther = otherPosition.clone().sub(cameraPosition);
    const otherDistance = toOther.length();
    const alongRayDistance = toOther.dot(rayDirection);

    const otherVisualRadius = getTopicVisualRadius({
      topic: otherTopic,
      isSelected: isSelectedBlocker,
      isFocused: isFocusedBlocker,
      isAnyTopicFocused,
    });

    /**
     * Only topics clearly between the camera and this label should normally
     * occlude it. A small padding avoids labels popping when two topics are
     * almost coplanar from the current view.
     */
    const isBetweenCameraAndLabel =
      alongRayDistance > LABEL_OCCLUSION_DEPTH_PADDING &&
      alongRayDistance < labelDistance - LABEL_OCCLUSION_DEPTH_PADDING &&
      otherDistance < labelDistance - LABEL_OCCLUSION_DEPTH_PADDING;

    /**
     * Probe exit is a special camera state: the camera may be very close to or
     * inside the selected/focused sphere while moving back out. In that case the
     * sphere can visually cover labels even if its center is not cleanly between
     * the camera and label ray, so active blockers get an extra screen-space
     * occlusion path.
     */
    const isCameraInsideOrNearActiveBlocker =
      isActiveBlocker &&
      otherDistance <= otherVisualRadius * 2.2 &&
      labelDistance > otherDistance + LABEL_OCCLUSION_DEPTH_PADDING;

    const canScreenOcclude =
      isBetweenCameraAndLabel || isCameraInsideOrNearActiveBlocker;

    if (canScreenOcclude) {
      const otherProjected = getProjectedScreenPoint({
        point: otherPosition,
        camera: args.camera,
        size: args.size,
      });

      if (otherProjected.z > -1 && otherProjected.z < 1) {
        const activeScreenPadding = isActiveBlocker
          ? LABEL_OCCLUSION_SCREEN_PADDING_PX * 1.9
          : LABEL_OCCLUSION_SCREEN_PADDING_PX;

        const otherScreenRadius =
          getScreenSpaceRadiusPx({
            camera: args.camera,
            size: args.size,
            worldPosition: otherPosition,
            worldRadius:
              otherVisualRadius * LABEL_OCCLUSION_SCREEN_RADIUS_MULTIPLIER,
          }) + activeScreenPadding;

        const screenDx = labelScreenPoint.x - otherProjected.x;
        const screenDy = labelScreenPoint.y - otherProjected.y;
        const screenDistance = Math.sqrt(
          screenDx * screenDx + screenDy * screenDy,
        );

        const hardCoreRadius =
          otherScreenRadius *
          (isActiveBlocker ? 0.94 : LABEL_OCCLUSION_SCREEN_HARD_CORE_MULTIPLIER);

        if (screenDistance <= hardCoreRadius) {
          /**
           * Html labels render as DOM overlays, so they need an explicit hard
           * occlusion rule. If the label's visible screen position is deep
           * inside a foreground sphere, hide it completely. This is especially
           * important when exiting a probe from inside the current topic sphere.
           */
          return 1;
        }

        if (screenDistance <= otherScreenRadius) {
          return 1;
        }

        const screenOcclusion = THREE.MathUtils.clamp(
          (otherScreenRadius +
            LABEL_OCCLUSION_SCREEN_FADE_BAND_PX -
            screenDistance) /
            LABEL_OCCLUSION_SCREEN_FADE_BAND_PX,
          0,
          1,
        );

        strongestOcclusion = Math.max(strongestOcclusion, screenOcclusion);
      }
    }

    if (!isBetweenCameraAndLabel) continue;

    const closestPointOnRay = cameraPosition
      .clone()
      .add(rayDirection.clone().multiplyScalar(alongRayDistance));
    const perpendicularDistance = otherPosition.distanceTo(closestPointOnRay);
    const occlusionRadius =
      otherVisualRadius * LABEL_OCCLUSION_RADIUS_MULTIPLIER;

    if (perpendicularDistance < occlusionRadius + LABEL_OCCLUSION_FADE_BAND) {
      const radiusOcclusion = THREE.MathUtils.clamp(
        (occlusionRadius + LABEL_OCCLUSION_FADE_BAND - perpendicularDistance) /
          LABEL_OCCLUSION_FADE_BAND,
        0,
        1,
      );

      /**
       * Nearer blockers should count more. This keeps the fade intuitive when a
       * topic is barely in front of the label versus clearly blocking the view.
       */
      const depthOcclusion = THREE.MathUtils.clamp(
        (labelDistance - alongRayDistance) / Math.max(1, labelDistance * 0.35),
        0.35,
        1,
      );

      strongestOcclusion = Math.max(
        strongestOcclusion,
        radiusOcclusion * depthOcclusion,
      );
    }

    if (strongestOcclusion >= 0.995) return 1;
  }

  return strongestOcclusion;
}


function TopicLabel({
  topic,
  allTopics,
  selectedTopicId,
  focusedTopicId,
  animatedTopicPositionsRef,
  isSelected,
  isFocused,
  isAppearing,
  hideLabelsForViewDrag,
  forceShowLabel = false,
  isAnyTopicFocused,
  isEnteringProbe,
  worldPositionRef,
  visualRadius,
}: {
  topic: LearningSpaceTopic;
  allTopics: LearningSpaceTopic[];
  selectedTopicId: string | null;
  focusedTopicId: string | null;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
  isSelected: boolean;
  isFocused: boolean;
  isAppearing: boolean;
  hideLabelsForViewDrag: boolean;
  forceShowLabel?: boolean;
  isAnyTopicFocused: boolean;
  isEnteringProbe: boolean;
  worldPositionRef: RefObject<THREE.Vector3>;
  visualRadius: number;
}) {
  const { camera, size } = useThree();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelOpacityRef = useRef(0);

  useFrame(() => {
    const el = containerRef.current;
    if (!el) return;

    const screenRadiusPx = getScreenSpaceRadiusPx({
      camera,
      size,
      worldPosition: worldPositionRef.current,
      worldRadius: visualRadius,
    });

    /**
     * Mode A label policy, refined again:
     * - show labels for navigation during normal layout migration
     * - hide labels only during actual user view dragging and probe entry
     * - hide only the current topic label when that specific sphere is close
     *   enough to be readable through focus/right-panel context
     * - if the selected/focused topic becomes large from manual wheel zoom,
     *   hide that topic's label; other topic labels remain visible
     *
     * Important: focusedTopicId should not become a global "hide all labels"
     * switch. Otherwise labels disappear after a double-click focus even if the
     * user manually zooms back out.
     */
    const isCloseEnoughToReadWithoutMapLabel =
      screenRadiusPx >= LABEL_HIDE_SCREEN_RADIUS_PX;

    const isCurrentTopic = isFocused || isSelected;
    const hideBecauseCurrentTopicIsClose =
      isCurrentTopic && isCloseEnoughToReadWithoutMapLabel;

    const shouldShow =
      (!hideLabelsForViewDrag || forceShowLabel) &&
      !isEnteringProbe &&
      !hideBecauseCurrentTopicIsClose;

    const baseLabelOffsetPx = Math.min(
      LABEL_OFFSET_MAX_PX,
      Math.max(
        LABEL_OFFSET_MIN_PX,
        screenRadiusPx * LABEL_OFFSET_SCREEN_RADIUS_MULTIPLIER +
          LABEL_OFFSET_SCREEN_RADIUS_BIAS_PX,
      ),
    );
    const labelOffsetPx = isCurrentTopic
      ? Math.min(
          LABEL_OFFSET_MAX_PX + LABEL_OFFSET_CURRENT_TOPIC_EXTRA_PX,
          baseLabelOffsetPx + LABEL_OFFSET_CURRENT_TOPIC_EXTRA_PX,
        )
      : baseLabelOffsetPx;

    const occlusionStrength = shouldShow
      ? getLabelOcclusionStrength({
          topic,
          allTopics,
          camera,
          selectedTopicId,
          focusedTopicId,
          animatedTopicPositionsRef,
          labelWorldPosition: worldPositionRef.current,
          size,
          labelOffsetPx,
        })
      : 0;

    const occlusionOpacityMultiplier =
      occlusionStrength >= 0.995
        ? 0
        : 1 - occlusionStrength * (1 - LABEL_OCCLUSION_MAX_OPACITY_MULTIPLIER);

    const distanceFadeMultiplier = getTopicDepthFadeMultiplier({
      camera,
      worldPosition: worldPositionRef.current,
      worldRadius: visualRadius,
      isCurrentTopic,
    });

    const baseVisibleOpacity = forceShowLabel
      ? isSelected || isFocused
        ? 0.98
        : 0.88
      : isSelected
        ? 0.96
        : isFocused
          ? 0.9
          : 0.78;

    const targetOpacity = shouldShow
      ? Math.max(
          isCurrentTopic ? LABEL_CURRENT_MIN_OPACITY_WHEN_VISIBLE : 0,
          baseVisibleOpacity *
            distanceFadeMultiplier *
            occlusionOpacityMultiplier,
        )
      : 0;

    /**
     * Keep label visibility sticky. Semantic layout staging and migration should
     * never become a visible pre-movement warning. Labels only fade out for
     * actual user drag, probe entry, close-up current-topic redundancy, or
     * actual 3D line-of-sight occlusion behind another topic sphere.
     */
    const opacityAlpha = targetOpacity > labelOpacityRef.current ? 0.18 : 0.24;
    labelOpacityRef.current +=
      (targetOpacity - labelOpacityRef.current) * opacityAlpha;

    if (Math.abs(labelOpacityRef.current - targetOpacity) < 0.005) {
      labelOpacityRef.current = targetOpacity;
    }

    const targetScale = shouldShow ? (isProminent ? 1.04 : 0.98) : 0.98;
    const targetYOffset = shouldShow ? -labelOffsetPx : -(labelOffsetPx - 2);

    el.style.opacity = `${labelOpacityRef.current}`;
    el.style.filter = "none";
    el.style.transform = `translate3d(0, ${targetYOffset}px, 0) scale(${targetScale})`;
  });

  const isProminent = isFocused || isSelected;

  return (
    <Html
      position={[0, 0, 0]}
      center
      style={{
        pointerEvents: "none",
      }}
    >
      <div
        ref={containerRef}
        style={{
          opacity: 0,
          transform: "translate3d(0, -34px, 0) scale(0.98)",
          background: "transparent",
          border: "none",
          boxShadow: "none",
          filter: "none",
          transition: "transform 220ms ease",
          willChange: "transform, opacity",
          maxWidth: isProminent
            ? LABEL_MAX_WIDTH_PROMINENT
            : LABEL_MAX_WIDTH_OVERVIEW,
          fontFamily:
            '"Oswald", "Avenir Next", "Inter", "SF Pro Display", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 500,
          letterSpacing: isProminent ? "0.055em" : "0.065em",
          textShadow:
            "0 1px 3px rgba(0,0,0,0.88), 0 0 10px rgba(196,181,253,0.22)",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
        className={`p-0 leading-tight ${
          isProminent ? "text-[14px] text-white" : "text-[13px] text-zinc-100"
        }`}
      >
        <span className="block truncate whitespace-nowrap">
          {getTopicDisplayLabel(topic)}
        </span>
      </div>
    </Html>
  );
}

function getProbeMarkerSurfaceNormal(topic: LearningSpaceTopic) {
  const marker = topic.surface_markers.find(
    (candidate) => candidate.marker_type === "probe_available",
  );
  const normalHint = marker?.surface_anchor.normal_hint;

  if (
    Array.isArray(normalHint) &&
    normalHint.length === 3 &&
    normalHint.every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    const hintedNormal = new THREE.Vector3(
      normalHint[0],
      normalHint[1],
      normalHint[2],
    );

    if (hintedNormal.lengthSq() > 0.0001) {
      return hintedNormal.normalize();
    }
  }

  return PROBE_MARKER_DEFAULT_NORMAL.clone();
}

function getProbeMarkerPreview(topic: LearningSpaceTopic) {
  return topic.surface_markers.find(
    (marker) =>
      marker.marker_type === "probe_available" && marker.visible_by_default,
  )?.preview;
}

type ProbeMarkerPreview = NonNullable<
  LearningSpaceTopic["surface_markers"][number]["preview"]
>;
type ProbeMarkerThumbnailStyle = ProbeMarkerPreview["thumbnail_style"];

function getDebugProbeThumbnailStyle(topic: LearningSpaceTopic) {
  const styles: ProbeMarkerThumbnailStyle[] = [
    "choice_card",
    "slider_card",
    "drag_drop_card",
    "graph_card",
    "audio_card",
    "video_card",
    "simulation_card",
    "text_card",
  ];
  return styles[stableHash(topic.topic_id) % styles.length];
}

function getProbeThumbnailIcon(thumbnailStyle: ProbeMarkerThumbnailStyle) {
  switch (thumbnailStyle) {
    case "choice_card":
      return "●";
    case "drag_drop_card":
      return "↗";
    case "slider_card":
      return "●";
    case "graph_card":
      return "↗";
    case "video_card":
      return "▶";
    case "audio_card":
      return "≋";
    case "simulation_card":
      return "⟳";
    case "text_card":
      return "☰";
    case "generic_card":
    default:
      return "?";
  }
}

function getProbeThumbnailLabel(thumbnailStyle: ProbeMarkerThumbnailStyle) {
  switch (thumbnailStyle) {
    case "choice_card":
      return "Choice";
    case "drag_drop_card":
      return "Drag";
    case "slider_card":
      return "Predict";
    case "graph_card":
      return "Graph";
    case "video_card":
      return "Video";
    case "audio_card":
      return "Audio";
    case "simulation_card":
      return "Sim";
    case "text_card":
      return "Text";
    case "generic_card":
    default:
      return "Task";
  }
}

function getProbeTilePalette(thumbnailStyle: ProbeMarkerThumbnailStyle) {
  switch (thumbnailStyle) {
    case "choice_card":
      return {
        core: "#67e8f9",
        mid: "#8b5cf6",
        deep: "#111827",
        accent: "#ecfeff",
      };
    case "drag_drop_card":
      return {
        core: "#f0abfc",
        mid: "#7c3aed",
        deep: "#12061f",
        accent: "#fdf4ff",
      };
    case "slider_card":
      return {
        core: "#38bdf8",
        mid: "#2563eb",
        deep: "#08111f",
        accent: "#e0f2fe",
      };
    case "graph_card":
      return {
        core: "#7dd3fc",
        mid: "#22d3ee",
        deep: "#07151e",
        accent: "#ecfeff",
      };
    case "video_card":
      return {
        core: "#fb7185",
        mid: "#a855f7",
        deep: "#180611",
        accent: "#fff1f2",
      };
    case "audio_card":
      return {
        core: "#34d399",
        mid: "#06b6d4",
        deep: "#041713",
        accent: "#ecfdf5",
      };
    case "simulation_card":
      return {
        core: "#fbbf24",
        mid: "#f97316",
        deep: "#1c0f02",
        accent: "#fffbeb",
      };
    case "text_card":
    case "generic_card":
    default:
      return {
        core: "#c4b5fd",
        mid: "#7c3aed",
        deep: "#10051e",
        accent: "#f5f3ff",
      };
  }
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawProbeSphereDisplayTexture(args: {
  context: CanvasRenderingContext2D;
  style: ProbeMarkerThumbnailStyle;
  icon: string;
  width: number;
  height: number;
}) {
  const { context, style, icon, width, height } = args;
  const palette = getProbeTilePalette(style);

  context.clearRect(0, 0, width, height);

  const baseGradient = context.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, palette.deep);
  baseGradient.addColorStop(0.18, palette.mid);
  baseGradient.addColorStop(0.5, palette.core);
  baseGradient.addColorStop(0.82, palette.mid);
  baseGradient.addColorStop(1, palette.deep);
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, width, height);

  const latitudeGlow = context.createLinearGradient(0, 0, 0, height);
  latitudeGlow.addColorStop(0, "rgba(255,255,255,0.05)");
  latitudeGlow.addColorStop(0.24, "rgba(255,255,255,0.14)");
  latitudeGlow.addColorStop(0.5, "rgba(255,255,255,0.28)");
  latitudeGlow.addColorStop(0.76, "rgba(255,255,255,0.14)");
  latitudeGlow.addColorStop(1, "rgba(255,255,255,0.05)");
  context.fillStyle = latitudeGlow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.14;
  context.strokeStyle = "rgba(255,255,255,0.58)";
  context.lineWidth = 1.2;
  for (let y = height * 0.12; y <= height * 0.88; y += 28) {
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(width * 0.2, y - 14, width * 0.8, y + 14, width, y);
    context.stroke();
  }
  context.restore();

  context.save();
  context.globalAlpha = 0.18;
  context.strokeStyle = "rgba(255,255,255,0.34)";
  context.lineWidth = 2;
  for (let x = -width * 0.18; x < width * 1.08; x += 42) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + width * 0.18, height);
    context.stroke();
  }
  context.restore();

  /**
   * Repeat the main motif around the sphere width so the surface still feels
   * coherent even though the display is viewer-facing and texture-wrapped.
   */
  const motifCenters = [0.0, 0.25, 0.5, 0.75, 1.0];

  motifCenters.forEach((centerX, index) => {
    const x = width * centerX;
    const y = height * (index === 1 ? 0.5 : 0.52);
    const motifScale = index === 2 ? 1 : 0.82;

    const bloom = context.createRadialGradient(
      x,
      y,
      height * 0.04,
      x,
      y,
      height * 0.34 * motifScale,
    );
    bloom.addColorStop(0, "rgba(255,255,255,0.46)");
    bloom.addColorStop(0.34, "rgba(255,255,255,0.18)");
    bloom.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = bloom;
    context.fillRect(
      x - width * 0.2,
      y - height * 0.22,
      width * 0.4,
      height * 0.44,
    );

    context.save();
    context.globalCompositeOperation = "screen";
    context.globalAlpha = index === 2 ? 0.92 : 0.58;
    context.strokeStyle = palette.accent;
    context.fillStyle = palette.accent;
    context.shadowColor = palette.accent;
    context.shadowBlur = index === 2 ? 22 : 14;
    context.lineWidth = index === 2 ? 5 : 4;

    if (style === "choice_card") {
      const cellRadius = 22 * motifScale;
      const cellGapX = 58 * motifScale;
      const cellGapY = 52 * motifScale;
      const cells = [
        { label: "A", dx: -cellGapX / 2, dy: -cellGapY / 2, selected: false },
        { label: "B", dx: cellGapX / 2, dy: -cellGapY / 2, selected: true },
        { label: "C", dx: -cellGapX / 2, dy: cellGapY / 2, selected: false },
        { label: "D", dx: cellGapX / 2, dy: cellGapY / 2, selected: false },
      ];

      context.font = `700 ${22 * motifScale}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI`;
      context.textAlign = "center";
      context.textBaseline = "middle";

      cells.forEach((cell) => {
        const cellX = x + cell.dx;
        const cellY = y + cell.dy;

        context.beginPath();
        context.arc(cellX, cellY, cellRadius, 0, Math.PI * 2);

        if (cell.selected) {
          context.fill();
          context.save();
          context.globalCompositeOperation = "destination-out";
          context.beginPath();
          context.arc(cellX, cellY, cellRadius * 0.58, 0, Math.PI * 2);
          context.fill();
          context.restore();
          context.beginPath();
          context.arc(cellX, cellY, cellRadius, 0, Math.PI * 2);
          context.stroke();
        } else {
          context.stroke();
        }

        context.save();
        context.shadowBlur = 0;
        context.fillStyle = palette.accent;
        context.fillText(cell.label, cellX, cellY + 1 * motifScale);
        context.restore();
      });
    } else if (style === "drag_drop_card") {
      const tileSize = 42 * motifScale;
      const sourceX = x - 86 * motifScale;
      const sourceY = y - 22 * motifScale;
      const targetX = x + 48 * motifScale;
      const targetY = y - 44 * motifScale;

      context.lineCap = "round";
      context.lineJoin = "round";

      drawRoundedRect(
        context,
        sourceX,
        sourceY,
        tileSize,
        tileSize,
        10 * motifScale,
      );
      context.fill();

      context.save();
      context.globalAlpha *= 0.78;
      context.setLineDash([10 * motifScale, 8 * motifScale]);
      drawRoundedRect(
        context,
        targetX,
        targetY,
        tileSize,
        tileSize,
        10 * motifScale,
      );
      context.stroke();
      context.restore();

      /**
       * Object-to-target movement: the path leads from the filled tile into the
       * dashed destination, while the pointer reads as the active "drag" hand.
       */
      context.save();
      context.globalAlpha *= 0.9;
      context.setLineDash([8 * motifScale, 7 * motifScale]);
      context.beginPath();
      context.moveTo(sourceX + tileSize + 8 * motifScale, sourceY + 9 * motifScale);
      context.bezierCurveTo(
        x - 12 * motifScale,
        y - 70 * motifScale,
        x + 34 * motifScale,
        y - 70 * motifScale,
        targetX + tileSize * 0.5,
        targetY + tileSize + 6 * motifScale,
      );
      context.stroke();
      context.setLineDash([]);
      context.restore();

      context.beginPath();
      context.moveTo(targetX + tileSize * 0.5 - 12 * motifScale, targetY + tileSize + 2 * motifScale);
      context.lineTo(targetX + tileSize * 0.5, targetY + tileSize + 17 * motifScale);
      context.lineTo(targetX + tileSize * 0.5 + 12 * motifScale, targetY + tileSize + 2 * motifScale);
      context.stroke();

      const pointerX = x - 10 * motifScale;
      const pointerY = y + 8 * motifScale;
      context.beginPath();
      context.moveTo(pointerX, pointerY);
      context.lineTo(pointerX + 58 * motifScale, pointerY + 42 * motifScale);
      context.lineTo(pointerX + 28 * motifScale, pointerY + 52 * motifScale);
      context.lineTo(pointerX + 18 * motifScale, pointerY + 82 * motifScale);
      context.lineTo(pointerX - 2 * motifScale, pointerY + 75 * motifScale);
      context.lineTo(pointerX + 8 * motifScale, pointerY + 47 * motifScale);
      context.lineTo(pointerX - 22 * motifScale, pointerY + 58 * motifScale);
      context.closePath();
      context.fill();
    } else if (style === "slider_card") {
      const trackX = x - 88 * motifScale;
      const trackWidth = 176 * motifScale;
      const rows = [
        { y: y - 46 * motifScale, knob: 0.74, alpha: 0.88 },
        { y, knob: 0.34, alpha: 1 },
        { y: y + 46 * motifScale, knob: 0.56, alpha: 0.88 },
      ];

      context.lineCap = "round";
      context.lineJoin = "round";

      rows.forEach((row) => {
        context.save();
        context.globalAlpha *= row.alpha;

        context.beginPath();
        context.moveTo(trackX, row.y);
        context.lineTo(trackX + trackWidth, row.y);
        context.stroke();

        const knobX = trackX + trackWidth * row.knob;
        drawRoundedRect(
          context,
          knobX - 17 * motifScale,
          row.y - 24 * motifScale,
          34 * motifScale,
          48 * motifScale,
          16 * motifScale,
        );
        context.fill();

        context.save();
        context.globalCompositeOperation = "destination-out";
        context.beginPath();
        context.moveTo(knobX, row.y - 14 * motifScale);
        context.lineTo(knobX, row.y + 14 * motifScale);
        context.lineWidth = 4 * motifScale;
        context.stroke();
        context.restore();

        context.restore();
      });
    } else if (style === "graph_card") {
      const originX = x - 74 * motifScale;
      const originY = y + 52 * motifScale;
      const graphWidth = 148 * motifScale;
      const graphHeight = 104 * motifScale;

      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(originX, originY - graphHeight);
      context.lineTo(originX, originY);
      context.lineTo(originX + graphWidth, originY);
      context.stroke();

      const points = [
        [originX + 22 * motifScale, originY - 22 * motifScale],
        [originX + 58 * motifScale, originY - 62 * motifScale],
        [originX + 96 * motifScale, originY - 44 * motifScale],
        [originX + 130 * motifScale, originY - 86 * motifScale],
      ];

      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      for (const [pointX, pointY] of points.slice(1)) {
        context.lineTo(pointX, pointY);
      }
      context.stroke();

      points.forEach(([pointX, pointY]) => {
        context.beginPath();
        context.arc(pointX, pointY, 7 * motifScale, 0, Math.PI * 2);
        context.fill();
      });
    } else if (style === "audio_card") {
      context.lineCap = "round";
      for (let barIndex = 0; barIndex < 9; barIndex += 1) {
        const barX = x - 60 * motifScale + barIndex * 15 * motifScale;
        const barHeight =
          (14 + Math.abs(Math.sin(barIndex * 1.35)) * 34) * motifScale;

        context.beginPath();
        context.moveTo(barX, y - barHeight);
        context.lineTo(barX, y + barHeight);
        context.stroke();
      }
    } else if (style === "video_card") {
      drawRoundedRect(
        context,
        x - 72 * motifScale,
        y - 48 * motifScale,
        144 * motifScale,
        96 * motifScale,
        18 * motifScale,
      );
      context.stroke();

      context.beginPath();
      context.moveTo(x - 16 * motifScale, y - 24 * motifScale);
      context.lineTo(x - 16 * motifScale, y + 24 * motifScale);
      context.lineTo(x + 28 * motifScale, y);
      context.closePath();
      context.fill();
    } else if (style === "simulation_card") {
      const panelX = x - 92 * motifScale;
      const panelY = y - 66 * motifScale;
      const panelWidth = 184 * motifScale;
      const panelHeight = 132 * motifScale;

      context.lineCap = "round";
      context.lineJoin = "round";

      /**
       * MyWay simulation: a compact control console for manipulating variables
       * and watching a system respond. The lever has a clear vertical slot and
       * handle so it reads as an actual control, not a random connector.
       */
      drawRoundedRect(
        context,
        panelX,
        panelY,
        panelWidth,
        panelHeight,
        18 * motifScale,
      );
      context.stroke();

      const readoutY = panelY + 22 * motifScale;
      [0, 1, 2].forEach((index) => {
        const readoutX = panelX + (22 + index * 54) * motifScale;
        drawRoundedRect(
          context,
          readoutX,
          readoutY,
          36 * motifScale,
          16 * motifScale,
          5 * motifScale,
        );
        context.stroke();
      });

      const dialY = panelY + 62 * motifScale;
      const dialXs = [
        panelX + 38 * motifScale,
        panelX + 92 * motifScale,
        panelX + 146 * motifScale,
      ];

      dialXs.forEach((dialX, dialIndex) => {
        context.beginPath();
        context.arc(dialX, dialY, 15 * motifScale, 0, Math.PI * 2);
        context.stroke();

        for (let tick = 0; tick < 6; tick += 1) {
          const tickAngle = Math.PI * (1.1 + tick * 0.16);
          context.beginPath();
          context.moveTo(
            dialX + Math.cos(tickAngle) * 11 * motifScale,
            dialY + Math.sin(tickAngle) * 11 * motifScale,
          );
          context.lineTo(
            dialX + Math.cos(tickAngle) * 15 * motifScale,
            dialY + Math.sin(tickAngle) * 15 * motifScale,
          );
          context.stroke();
        }

        const angle = (-0.74 + dialIndex * 0.28) * Math.PI;
        context.beginPath();
        context.moveTo(dialX, dialY);
        context.lineTo(
          dialX + Math.cos(angle) * 10 * motifScale,
          dialY + Math.sin(angle) * 10 * motifScale,
        );
        context.stroke();
      });

      const leverSlotX = panelX + 30 * motifScale;
      const leverSlotY = panelY + 88 * motifScale;
      const leverSlotWidth = 20 * motifScale;
      const leverSlotHeight = 36 * motifScale;

      drawRoundedRect(
        context,
        leverSlotX,
        leverSlotY,
        leverSlotWidth,
        leverSlotHeight,
        8 * motifScale,
      );
      context.stroke();

      /**
       * Keep the lever compact and anchored to its own slot. The earlier
       * version reached too far into the indicator-light area, so the arm now
       * stays left of the center controls and reads as a separate input.
       */
      const leverBaseX = leverSlotX + leverSlotWidth * 0.5;
      const leverBaseY = leverSlotY + leverSlotHeight * 0.72;
      const leverKnobX = leverBaseX + 24 * motifScale;
      const leverKnobY = leverBaseY - 17 * motifScale;

      context.beginPath();
      context.moveTo(leverBaseX, leverBaseY);
      context.lineTo(leverKnobX, leverKnobY);
      context.stroke();

      context.beginPath();
      context.arc(leverKnobX, leverKnobY, 9 * motifScale, 0, Math.PI * 2);
      context.fill();

      const indicatorPositions = [
        [panelX + 112 * motifScale, panelY + 92 * motifScale, false],
        [panelX + 152 * motifScale, panelY + 92 * motifScale, false],
        [panelX + 112 * motifScale, panelY + 118 * motifScale, true],
        [panelX + 152 * motifScale, panelY + 118 * motifScale, true],
      ] as const;

      indicatorPositions.forEach(([lightX, lightY, filled]) => {
        drawRoundedRect(
          context,
          lightX - 7 * motifScale,
          lightY - 7 * motifScale,
          14 * motifScale,
          14 * motifScale,
          4 * motifScale,
        );

        if (filled) {
          context.fill();
        } else {
          context.stroke();
        }
      });
    } else if (style === "text_card") {
      const bubbleX = x - 76 * motifScale;
      const bubbleY = y - 48 * motifScale;
      const bubbleWidth = 152 * motifScale;
      const bubbleHeight = 88 * motifScale;

      drawRoundedRect(
        context,
        bubbleX,
        bubbleY,
        bubbleWidth,
        bubbleHeight,
        24 * motifScale,
      );
      context.stroke();

      context.beginPath();
      context.moveTo(x - 28 * motifScale, bubbleY + bubbleHeight);
      context.lineTo(x - 8 * motifScale, bubbleY + bubbleHeight + 20 * motifScale);
      context.lineTo(x + 8 * motifScale, bubbleY + bubbleHeight);
      context.stroke();

      context.lineCap = "round";
      [0, 1, 2].forEach((lineIndex) => {
        const lineY = y - 22 * motifScale + lineIndex * 24 * motifScale;
        const lineWidth = (lineIndex === 1 ? 84 : 106) * motifScale;

        context.beginPath();
        context.moveTo(x - lineWidth / 2, lineY);
        context.lineTo(x + lineWidth / 2, lineY);
        context.stroke();
      });
    } else {
      context.font = `700 ${58 * motifScale}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(icon, x, y);
    }

    context.restore();
  });

  /**
   * Softly fade the poles/outer extents so the underlying topic sphere still
   * shows through a bit and the display feels integrated instead of pasted on.
   */
  context.save();
  context.globalCompositeOperation = "destination-in";
  const globeMask = context.createRadialGradient(
    width * 0.5,
    height * 0.5,
    height * 0.12,
    width * 0.5,
    height * 0.5,
    width * 0.62,
  );
  globeMask.addColorStop(0, "rgba(255,255,255,1)");
  globeMask.addColorStop(0.72, "rgba(255,255,255,0.97)");
  globeMask.addColorStop(1, "rgba(255,255,255,0.44)");
  context.fillStyle = globeMask;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function createProbeSphereDisplayTexture(args: {
  style: ProbeMarkerThumbnailStyle;
  icon: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = PROBE_DISPLAY_TEXTURE_WIDTH;
  canvas.height = PROBE_DISPLAY_TEXTURE_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  drawProbeSphereDisplayTexture({
    context,
    style: args.style,
    icon: args.icon,
    width: canvas.width,
    height: canvas.height,
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return texture;
}

function ProbeMarker({
  probe,
  topic,
  visualRadius,
  isVisible,
  onOpenProbe,
}: {
  probe: ProbeSummary;
  topic: LearningSpaceTopic;
  visualRadius: number;
  isVisible: boolean;
  onOpenProbe: (probe: ProbeSummary) => void;
}) {
  const { camera } = useThree();
  const displayGroupRef = useRef<THREE.Group | null>(null);

  /**
   * The whole-sphere probe display is intentionally visual-only for pointer
   * events. Keeping these references acknowledged avoids accidental future
   * removal of the prop contract while preserving normal topic click / double
   * click / drag behavior on the underlying sphere.
   */
  void probe;
  void onOpenProbe;

  const preview = getProbeMarkerPreview(topic);
  const thumbnailStyle =
    preview?.thumbnail_style ?? getDebugProbeThumbnailStyle(topic);
  const icon = getProbeThumbnailIcon(thumbnailStyle);

  const texture = useMemo(
    () =>
      createProbeSphereDisplayTexture({
        style: thumbnailStyle,
        icon,
      }),
    [thumbnailStyle, icon],
  );

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  /**
   * Keep the probe display viewer-facing and upright, like a spherical display
   * surface rather than a texture that tumbles with the world. The textured
   * shell below has a small UV/front correction rotation so the main icon sits
   * near the visual center instead of drifting off to the side.
   */
  useFrame(() => {
    if (!displayGroupRef.current) return;
    displayGroupRef.current.quaternion.copy(camera.quaternion);
  });

  const palette = getProbeTilePalette(thumbnailStyle);
  const opacity = isVisible ? 0.9 : 0;
  const glowOpacity = opacity * PROBE_DISPLAY_GLOW_OPACITY;
  const scale = isVisible ? 1 : 0.9;
  const shellScale = visualRadius * PROBE_DISPLAY_SPHERE_SCALE;
  const glowScale = visualRadius * PROBE_DISPLAY_GLOW_SCALE;

  return (
    <group
      ref={displayGroupRef}
      scale={scale}
      renderOrder={PROBE_DISPLAY_RENDER_ORDER}
    >
      <mesh
        renderOrder={PROBE_DISPLAY_GLOW_RENDER_ORDER}
        visible={glowOpacity > 0.01}
        raycast={() => null}
      >
        <sphereGeometry args={[glowScale, 56, 56]} />
        <meshBasicMaterial
          color={palette.core}
          transparent
          opacity={glowOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest
          toneMapped={false}
        />
      </mesh>

      <mesh
        renderOrder={PROBE_DISPLAY_RENDER_ORDER}
        visible={opacity > 0.01}
        rotation={[0, PROBE_DISPLAY_FRONT_ROTATION_Y, 0]}
        raycast={() => null}
      >
        <sphereGeometry args={[shellScale, 56, 56]} />
        <meshBasicMaterial
          map={texture ?? undefined}
          color="#ffffff"
          transparent
          opacity={opacity}
          depthWrite={false}
          depthTest
          blending={THREE.NormalBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function MovementTrail({
  geometryRef,
  materialRef,
}: {
  geometryRef: RefObject<THREE.BufferGeometry | null>;
  materialRef: RefObject<THREE.LineBasicMaterial | null>;
}) {
  return (
    <line>
      <bufferGeometry ref={geometryRef} />
      <lineBasicMaterial
        ref={materialRef}
        color="#ffffff"
        transparent
        opacity={0}
        depthWrite={false}
        depthTest={false}
      />
    </line>
  );
}


function RelationshipEndpointStencilMask({
  topic,
  activeTopicId,
  isAnyTopicFocused,
  animatedTopicPositionsRef,
  stencilRef,
}: {
  topic: LearningSpaceTopic;
  activeTopicId: string;
  isAnyTopicFocused: boolean;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
  stencilRef: number;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const position = getAnimatedTopicPosition(topic, animatedTopicPositionsRef);
    const visualRadius = getRelationshipEndpointVisualRadius({
      topic,
      activeTopicId,
      isAnyTopicFocused,
    });

    mesh.position.copy(position);
    mesh.scale.setScalar(visualRadius * 1.012);
    mesh.renderOrder = RELATIONSHIP_ENDPOINT_STENCIL_RENDER_ORDER;
  });

  return (
    <mesh ref={meshRef} renderOrder={RELATIONSHIP_ENDPOINT_STENCIL_RENDER_ORDER}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial
        colorWrite={false}
        depthWrite={false}
        depthTest
        stencilWrite
        stencilRef={stencilRef}
        stencilFunc={THREE.AlwaysStencilFunc}
        stencilFail={THREE.KeepStencilOp}
        stencilZFail={THREE.KeepStencilOp}
        stencilZPass={THREE.ReplaceStencilOp}
      />
    </mesh>
  );
}

function SemanticRelationshipArc({
  relationship,
  activeTopicId,
  topicsById,
  animatedTopicPositionsRef,
  isAnyTopicFocused,
  hideBecauseUserIsControlling,
  isEnteringProbe,
  variant = "default",
}: {
  relationship: LearningSpaceRelationship;
  activeTopicId: string;
  topicsById: Map<string, LearningSpaceTopic>;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
  isAnyTopicFocused: boolean;
  hideBecauseUserIsControlling: boolean;
  isEnteringProbe: boolean;
  variant?: RelationshipArcVariant;
}) {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const opacityRef = useRef(0);

  const sourceTopic = topicsById.get(relationship.source_topic_id) ?? null;
  const targetTopic = topicsById.get(relationship.target_topic_id) ?? null;
  const otherTopicId = getRelationshipOtherTopicId(relationship, activeTopicId);

  const strength = getRelationshipLineStrength(relationship);
  const maxOpacity =
    typeof relationship.display_policy?.max_opacity === "number" &&
    Number.isFinite(relationship.display_policy.max_opacity)
      ? relationship.display_policy.max_opacity
      : 0.45;

  const isScannerVariant = variant === "scanner" || variant === "settled_scan";
  const arcColor = getRelationshipBaseColor({ relationship, variant });
  const tubeRadius = getRelationshipTubeRadius({ variant, strength });
  const stencilRef = getRelationshipStencilRef(relationship.relationship_id);

  useFrame(() => {
    const group = groupRef.current;

    if (!group || !sourceTopic || !targetTopic || !otherTopicId) {
      return;
    }

    group.renderOrder = RELATIONSHIP_ARC_RENDER_ORDER;

    const sourcePosition = getAnimatedTopicPosition(
      sourceTopic,
      animatedTopicPositionsRef,
    );
    const targetPosition = getAnimatedTopicPosition(
      targetTopic,
      animatedTopicPositionsRef,
    );

    const arcPoints = buildArcPoints({
      start: sourcePosition,
      end: targetPosition,
      strength,
    });

    const cameraLegibility = getCameraAngleRelationshipLegibility({
      camera,
      size,
      sourcePosition,
      targetPosition,
    });

    const scannerOpacityBoost =
      variant === "scanner" ? 0.18 : variant === "settled_scan" ? 0.1 : 0;
    const scannerLegibilityFloor = isScannerVariant ? 0.42 : 0;
    const effectiveCameraLegibility = Math.max(
      scannerLegibilityFloor,
      cameraLegibility,
    );

    const targetOpacity =
      hideBecauseUserIsControlling || isEnteringProbe
        ? 0
        : clampOpacity(
            Math.min(
              maxOpacity,
              SEMANTIC_RELATIONSHIP_ARC_BASE_OPACITY +
                scannerOpacityBoost +
                strength * 0.32 +
                (isAnyTopicFocused
                  ? SEMANTIC_RELATIONSHIP_ARC_FOCUSED_OPACITY_BOOST
                  : 0),
            ) * effectiveCameraLegibility,
          );

    const alpha = targetOpacity > opacityRef.current ? 0.085 : 0.16;
    opacityRef.current += (targetOpacity - opacityRef.current) * alpha;

    if (opacityRef.current < SEMANTIC_RELATIONSHIP_ARC_MIN_OPACITY) {
      opacityRef.current = targetOpacity === 0 ? 0 : opacityRef.current;
    }

    disposeRelationshipGroupChildren(group);

    if (opacityRef.current <= 0.002 || arcPoints.length < 2) {
      return;
    }

    const geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(arcPoints),
      RELATIONSHIP_ARC_TUBE_SEGMENTS,
      tubeRadius,
      RELATIONSHIP_ARC_TUBE_RADIAL_SEGMENTS,
      false,
    );
    applyRelationshipArcVertexColors({
      geometry,
      startColor: getRelationshipEndpointColor({
        topic: sourceTopic,
        activeTopicId,
        isAnyTopicFocused,
      }),
      middleColor: arcColor,
      endColor: getRelationshipEndpointColor({
        topic: targetTopic,
        activeTopicId,
        isAnyTopicFocused,
      }),
    });

    const material = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      vertexColors: true,
      transparent: true,
      opacity: opacityRef.current,

      /**
       * Normal depth handles non-connected topics. The relationship-specific
       * stencil handles only this relationship's two endpoint topics.
       */
      depthTest: true,
      depthWrite: false,
      stencilWrite: false,
      stencilRef,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = RELATIONSHIP_ARC_RENDER_ORDER;
    group.add(mesh);
  });

  useEffect(() => {
    return () => {
      if (groupRef.current) {
        disposeRelationshipGroupChildren(groupRef.current);
      }
    };
  }, []);

  if (!sourceTopic || !targetTopic || !otherTopicId) {
    return null;
  }

  return (
    <>
      <RelationshipEndpointStencilMask
        topic={sourceTopic}
        activeTopicId={activeTopicId}
        isAnyTopicFocused={isAnyTopicFocused}
        animatedTopicPositionsRef={animatedTopicPositionsRef}
        stencilRef={stencilRef}
      />
      <RelationshipEndpointStencilMask
        topic={targetTopic}
        activeTopicId={activeTopicId}
        isAnyTopicFocused={isAnyTopicFocused}
        animatedTopicPositionsRef={animatedTopicPositionsRef}
        stencilRef={stencilRef}
      />
      <group ref={groupRef} renderOrder={RELATIONSHIP_ARC_RENDER_ORDER} />
    </>
  );
}

function areStringArraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }

  return true;
}

function getRelationshipByIdMap(relationships: LearningSpaceRelationship[]) {
  return new Map(
    relationships.map((relationship) => [
      relationship.relationship_id,
      relationship,
    ]),
  );
}

function getRelationshipListFromIds(args: {
  relationshipIds: string[];
  relationshipsById: Map<string, LearningSpaceRelationship>;
}) {
  return args.relationshipIds
    .map((relationshipId) => args.relationshipsById.get(relationshipId) ?? null)
    .filter((relationship): relationship is LearningSpaceRelationship =>
      Boolean(relationship),
    );
}

function getScannerRelationshipScore(args: {
  relationship: LearningSpaceRelationship;
  activeTopicId: string;
  topicsById: Map<string, LearningSpaceTopic>;
  camera: THREE.Camera;
  size: { width: number; height: number };
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
}) {
  const activeTopic = args.topicsById.get(args.activeTopicId);
  const otherTopicId = getRelationshipOtherTopicId(
    args.relationship,
    args.activeTopicId,
  );

  if (!activeTopic || !otherTopicId) return null;

  const otherTopic = args.topicsById.get(otherTopicId);
  if (!otherTopic) return null;

  const activePosition = getAnimatedTopicPosition(
    activeTopic,
    args.animatedTopicPositionsRef,
  );
  const otherPosition = getAnimatedTopicPosition(
    otherTopic,
    args.animatedTopicPositionsRef,
  );
  const activeProjected = getProjectedScreenPoint({
    point: activePosition,
    camera: args.camera,
    size: args.size,
  });
  const otherProjected = getProjectedScreenPoint({
    point: otherPosition,
    camera: args.camera,
    size: args.size,
  });

  if (
    activeProjected.z <= -1 ||
    activeProjected.z >= 1 ||
    otherProjected.z <= -1 ||
    otherProjected.z >= 1
  ) {
    return null;
  }

  const screenDx = otherProjected.x - activeProjected.x;
  const screenDy = otherProjected.y - activeProjected.y;
  const screenDistance = Math.sqrt(screenDx * screenDx + screenDy * screenDy);

  const screenMax = Math.max(args.size.width, args.size.height);
  const farCorridorRadius = Math.max(
    VIEWPOINT_SCANNER_CORRIDOR_RADIUS_PX,
    screenMax * VIEWPOINT_SCANNER_MAX_SCREEN_FRACTION,
  );

  if (screenDistance > farCorridorRadius) {
    return null;
  }

  const corridorScore = THREE.MathUtils.clamp(
    (farCorridorRadius - screenDistance) /
      Math.max(1, farCorridorRadius - VIEWPOINT_SCANNER_CORE_RADIUS_PX),
    0,
    1,
  );
  const coreBonus =
    screenDistance <= VIEWPOINT_SCANNER_CORE_RADIUS_PX
      ? VIEWPOINT_SCANNER_ACTIVE_TOPIC_BIAS
      : 0;
  const cameraLegibility = getCameraAngleRelationshipLegibility({
    camera: args.camera,
    size: args.size,
    sourcePosition: activePosition,
    targetPosition: otherPosition,
  });
  const relationshipScore = getRelationshipSortScore(args.relationship);
  const normalizedRelationshipScore = THREE.MathUtils.clamp(
    relationshipScore / 8,
    0,
    1,
  );
  const score =
    (normalizedRelationshipScore * 0.55 + corridorScore * 0.45 + coreBonus) *
    Math.max(0.22, cameraLegibility);

  const minimumScore =
    screenDistance > VIEWPOINT_SCANNER_CORRIDOR_RADIUS_PX
      ? VIEWPOINT_SCANNER_FAR_CORRIDOR_MIN_SCORE
      : VIEWPOINT_SCANNER_MIN_SCORE;

  if (score < minimumScore) return null;

  return {
    relationship: args.relationship,
    score,
  };
}

function ViewpointRelationshipScanner({
  activeTopicId,
  relationships,
  topicsById,
  animatedTopicPositionsRef,
  isScanning,
  isEnteringProbe,
  relationshipViewMode,
  onScannerRelationshipIdsChange,
}: {
  activeTopicId: string | null;
  relationships: LearningSpaceRelationship[];
  relationshipViewMode: RelationshipViewMode;
  topicsById: Map<string, LearningSpaceTopic>;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
  isScanning: boolean;
  isEnteringProbe: boolean;
  onScannerRelationshipIdsChange: (relationshipIds: string[]) => void;
}) {
  const { camera, size } = useThree();
  const lastRelationshipIdsKeyRef = useRef("");

  useFrame(() => {
    if (!isScanning || isEnteringProbe || !activeTopicId) {
      /**
       * Do not clear scanner ids here. On mouse release, SpaceCanvas copies the
       * latest scanner ids into the settled-scanner state so the blue scanner
       * lines can remain on screen for a few seconds. Clearing from this frame
       * loop creates an extra state transition and can look like a flicker.
       * The next scan is explicitly reset in beginRelationshipScan().
       */
      lastRelationshipIdsKeyRef.current = "";
      return;
    }

    const nextRelationshipIds = relationships
      .filter((relationship) =>
        relationshipMatchesViewMode(relationship, relationshipViewMode),
      )
      .filter((relationship) =>
        relationshipTouchesTopic(relationship, activeTopicId),
      )
      .map((relationship) =>
        getScannerRelationshipScore({
          relationship,
          activeTopicId,
          topicsById,
          camera,
          size,
          animatedTopicPositionsRef,
        }),
      )
      .filter(
        (
          scored,
        ): scored is {
          relationship: LearningSpaceRelationship;
          score: number;
        } => Boolean(scored),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, VIEWPOINT_SCANNER_RELATIONSHIP_MAX_COUNT)
      .map((scored) => scored.relationship.relationship_id);

    const nextKey = nextRelationshipIds.join("|");

    if (nextKey === lastRelationshipIdsKeyRef.current) return;

    lastRelationshipIdsKeyRef.current = nextKey;
    onScannerRelationshipIdsChange(nextRelationshipIds);
  });

  return null;
}

function TopicSphere({
  topic,
  allTopics,
  selectedTopicId,
  isSelected,
  isFocused,
  focusedTopicId,
  topicProbe,
  isAppearing,
  isSceneSettled,
  isEnteringProbe,
  hideLabelsForViewDrag,
  forceShowLabelDuringViewDrag,
  onSelect,
  onFocusTopic,
  onUnfocus,
  onOpenProbe,
  controlsRef,
  preProbeViewSnapshotRef,
  animatedTopicPositionsRef,
}: {
  topic: LearningSpaceTopic;
  allTopics: LearningSpaceTopic[];
  selectedTopicId: string | null;
  isSelected: boolean;
  isFocused: boolean;
  focusedTopicId: string | null;
  topicProbe: ProbeSummary | null;
  isAppearing: boolean;
  isSceneSettled: boolean;
  isEnteringProbe: boolean;
  hideLabelsForViewDrag: boolean;
  forceShowLabelDuringViewDrag: boolean;
  onSelect: (id: string) => void;
  onFocusTopic: (id: string) => void;
  onUnfocus: () => void;
  onOpenProbe: (probe: ProbeSummary) => void;
  controlsRef: RefObject<TrackballControlsRef | null>;
  preProbeViewSnapshotRef: PreProbeViewSnapshotRef;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
}) {
  const { camera } = useThree();
  const isAnyTopicFocused = focusedTopicId !== null;

  const groupRef = useRef<THREE.Group>(null);
  const visualGroupRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const appearProgressRef = useRef(isAppearing ? 0 : 1);

  const initialRenderPosition = getTopicPositionVector(topic);

  const currentPositionRef = useRef(initialRenderPosition.clone());
  const targetPositionRef = useRef(initialRenderPosition.clone());

  const bobPhaseRef = useRef(stableUnitInterval(topic.topic_id) * Math.PI * 2);
  const bobSpeedRef = useRef(
    LOCAL_BOB_BASE_SPEED +
      stableUnitInterval(`${topic.topic_id}:bob-speed`) *
        LOCAL_BOB_SPEED_VARIATION,
  );

  const trailStartPositionRef = useRef(initialRenderPosition.clone());
  const trailOpacityRef = useRef(0);
  const trailGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const trailMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);

  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const clickSequenceRef = useRef<{
    time: number;
    topicId: string;
    count: number;
  } | null>(null);
  const singleClickTimeoutRef = useRef<number | null>(null);
  const doubleClickTimeoutRef = useRef<number | null>(null);

  const movementAlpha = getTopicMovementAlpha({
    isFocused,
    isAnyTopicFocused,
    isEnteringProbe,
  });

  const visualRadius = getTopicVisualRadius({
    topic,
    isSelected,
    isFocused,
    isAnyTopicFocused,
  });

  useEffect(() => {
    appearProgressRef.current = isAppearing ? 0 : 1;
  }, [isAppearing, topic.topic_id]);

  useEffect(() => {
    const nextTarget = getTopicPositionVector(topic);
    const currentTarget = targetPositionRef.current;
    const targetDistance = currentTarget.distanceTo(nextTarget);
    const currentDistance = currentPositionRef.current.distanceTo(nextTarget);

    if (
      !isEnteringProbe &&
      targetDistance >= MOVEMENT_TRAIL_MIN_DISTANCE &&
      currentDistance >= MOVEMENT_TRAIL_MIN_DISTANCE
    ) {
      trailStartPositionRef.current.copy(currentPositionRef.current);
      trailOpacityRef.current = getTrailInitialOpacity({
        isFocused,
        isAnyTopicFocused,
      });
    }

    targetPositionRef.current.copy(nextTarget);
  }, [topic.position, isEnteringProbe, isFocused, isAnyTopicFocused]);

  useEffect(() => {
    animatedTopicPositionsRef.current.set(
      topic.topic_id,
      currentPositionRef.current.clone(),
    );

    return () => {
      animatedTopicPositionsRef.current.delete(topic.topic_id);

      if (singleClickTimeoutRef.current !== null) {
        window.clearTimeout(singleClickTimeoutRef.current);
      }
    };
  }, [animatedTopicPositionsRef, topic.topic_id]);

  useFrame((state, delta) => {
    const current = appearProgressRef.current;
    appearProgressRef.current =
      current + (1 - current) * TOPIC_APPEARANCE_LERP_ALPHA;

    if (appearProgressRef.current > 0.995) {
      appearProgressRef.current = 1;
    }

    const t = appearProgressRef.current;
    const eased = 1 - Math.pow(1 - t, 3);

    /**
     * Keep final body size identical for new and existing topics.
     * The arrival animation only fades/scales up toward the intended size; it
     * never overshoots above 1, which prevents new topics from looking larger
     * than established topics after creation.
     */
    const finalScale = isAppearing
      ? Math.max(
          0.001,
          TOPIC_APPEARANCE_START_SCALE +
            (1 - TOPIC_APPEARANCE_START_SCALE) * eased,
        )
      : 1;

    if (movementAlpha > 0) {
      currentPositionRef.current.lerp(targetPositionRef.current, movementAlpha);

      if (
        currentPositionRef.current.distanceToSquared(
          targetPositionRef.current,
        ) < 0.0001
      ) {
        currentPositionRef.current.copy(targetPositionRef.current);
      }
    }

    const distanceToTarget = currentPositionRef.current.distanceTo(
      targetPositionRef.current,
    );

    if (isEnteringProbe) {
      trailOpacityRef.current = 0;
    } else if (distanceToTarget < 0.04) {
      trailOpacityRef.current *= MOVEMENT_TRAIL_TARGET_REACHED_FADE_RATE;
    } else {
      trailOpacityRef.current *= MOVEMENT_TRAIL_FADE_RATE;
    }

    if (trailOpacityRef.current < MOVEMENT_TRAIL_MIN_OPACITY) {
      trailOpacityRef.current = 0;
    }

    if (trailGeometryRef.current && trailMaterialRef.current) {
      /**
       * Show the full committed layout update, not only the distance already
       * traveled this frame. This makes a layout update legible immediately:
       * "this topic is moving from here to there." The sphere itself still
       * eases along the path through currentPositionRef.
       */
      trailGeometryRef.current.setFromPoints([
        trailStartPositionRef.current,
        targetPositionRef.current,
      ]);

      trailMaterialRef.current.opacity = trailOpacityRef.current * eased;
      trailMaterialRef.current.visible = trailOpacityRef.current > 0;
    }

    animatedTopicPositionsRef.current.set(
      topic.topic_id,
      currentPositionRef.current.clone(),
    );

    if (groupRef.current) {
      groupRef.current.position.copy(currentPositionRef.current);
      groupRef.current.scale.setScalar(finalScale);
    }

    if (visualGroupRef.current) {
      const bobAmplitude = getCollisionSafeBobAmplitude({
        topic,
        isFocused,
        isAnyTopicFocused,
        isEnteringProbe,
      });
      const bobAngle =
        state.clock.elapsedTime * bobSpeedRef.current + bobPhaseRef.current;
      const targetBob = new THREE.Vector3(
        Math.sin(bobAngle * 0.71) * bobAmplitude * LOCAL_BOB_XZ_FACTOR,
        Math.sin(bobAngle) * bobAmplitude,
        Math.cos(bobAngle * 0.53) * bobAmplitude * LOCAL_BOB_XZ_FACTOR,
      );

      visualGroupRef.current.position.lerp(targetBob, LOCAL_BOB_LERP_ALPHA);
    }

    if (sphereRef.current) {
      sphereRef.current.rotation.y += delta * (isFocused ? 0.34 : 0.18);
    }

    if (materialRef.current) {
      materialRef.current.opacity =
        (isAnyTopicFocused && !isFocused ? 0.46 : 1) * eased;

      const baseGlow = isFocused ? 1.45 : isSelected ? 1.05 : 0.35;
      const appearanceBoost = isAppearing ? 0.5 * (1 - t) : 0;
      const movementGlow =
        trailOpacityRef.current > 0 && !isAnyTopicFocused ? 0.16 : 0;

      materialRef.current.emissiveIntensity =
        (baseGlow + appearanceBoost + movementGlow) * (0.35 + eased * 0.65);
    }
  });

  function clearPendingSingleClick() {
    if (singleClickTimeoutRef.current !== null) {
      window.clearTimeout(singleClickTimeoutRef.current);
      singleClickTimeoutRef.current = null;
    }
  }

  function clearPendingDoubleClick() {
    if (doubleClickTimeoutRef.current !== null) {
      window.clearTimeout(doubleClickTimeoutRef.current);
      doubleClickTimeoutRef.current = null;
    }
  }

  function clearPendingClickActions() {
    clearPendingSingleClick();
    clearPendingDoubleClick();
  }

  function runSingleClick() {
    onSelect(topic.topic_id);
  }

  function runDoubleClick() {
    if (focusedTopicId === null) {
      onSelect(topic.topic_id);
      onFocusTopic(topic.topic_id);
      return;
    }

    if (focusedTopicId === topic.topic_id) {
      onUnfocus();
      return;
    }

    onSelect(topic.topic_id);
    onFocusTopic(topic.topic_id);
  }

  function runTripleClick() {
    if (!topicProbe) {
      runDoubleClick();
      return;
    }

    const controls = controlsRef.current;
    if (controls) {
      /**
       * Capture the exact viewpoint before any selection/probe-entry state can
       * move the camera. Probe exit restores this snapshot so the learner backs
       * out to the same angle, zoom, and target they triple-clicked from.
       */
      preProbeViewSnapshotRef.current = {
        cameraPosition: camera.position.clone(),
        cameraQuaternion: camera.quaternion.clone(),
        cameraUp: camera.up.clone(),
        cameraZoom: camera.zoom,
        target: controls.target.clone(),
        capturedAt: performance.now(),
      };
    }

    onSelect(topic.topic_id);
    onOpenProbe(topicProbe);
  }

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    pointerDownRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();

    const down = pointerDownRef.current;
    pointerDownRef.current = null;

    if (!down) return;

    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    const movement = Math.sqrt(dx * dx + dy * dy);

    if (movement > 8) {
      return;
    }

    const now = performance.now();
    const previousSequence = clickSequenceRef.current;
    const isSameTopicSequence =
      !!previousSequence &&
      previousSequence.topicId === topic.topic_id &&
      now - previousSequence.time <= TOPIC_CLICK_SEQUENCE_MS;

    const nextCount = isSameTopicSequence ? previousSequence.count + 1 : 1;

    clickSequenceRef.current = {
      time: now,
      topicId: topic.topic_id,
      count: nextCount,
    };

    if (nextCount === 1) {
      clearPendingClickActions();
      singleClickTimeoutRef.current = window.setTimeout(() => {
        runSingleClick();
        singleClickTimeoutRef.current = null;
        clickSequenceRef.current = null;
      }, TOPIC_CLICK_SEQUENCE_MS);
      return;
    }

    if (nextCount === 2) {
      clearPendingSingleClick();
      clearPendingDoubleClick();

      /**
       * Delay the double-click action briefly so a third click can become
       * probe entry without stealing normal double-click focus/unfocus behavior.
       */
      doubleClickTimeoutRef.current = window.setTimeout(() => {
        runDoubleClick();
        doubleClickTimeoutRef.current = null;
        clickSequenceRef.current = null;
      }, TOPIC_CLICK_SEQUENCE_MS);
      return;
    }

    clearPendingClickActions();
    clickSequenceRef.current = null;
    runTripleClick();
  }

  const showProbeMarker =
    !!topicProbe &&
    !isEnteringProbe &&
    (SHOW_DEBUG_PROBE_THUMBNAILS_FOR_ALL_TOPICS || isFocused || isSelected);

  return (
    <>
      <MovementTrail
        geometryRef={trailGeometryRef}
        materialRef={trailMaterialRef}
      />

      <group ref={groupRef} position={currentPositionRef.current}>
        <group ref={visualGroupRef}>
          <mesh
            ref={sphereRef}
            renderOrder={TOPIC_SPHERE_RENDER_ORDER}
            scale={visualRadius}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerOver={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "default";
            }}
          >
            <sphereGeometry args={[1, 40, 40]} />
            <meshStandardMaterial
              ref={materialRef}
              color={isSelected ? "#ffffff" : "#d4d4d8"}
              emissive={
                isFocused ? "#c084fc" : isSelected ? "#a855f7" : "#3f3f46"
              }
              emissiveIntensity={isFocused ? 1.45 : isSelected ? 1.05 : 0.35}
              metalness={0.18}
              roughness={0.42}
              opacity={isAnyTopicFocused && !isFocused ? 0.46 : 1}
              transparent
              depthWrite
              depthTest
            />
          </mesh>

          <TopicLabel
            topic={topic}
            allTopics={allTopics}
            selectedTopicId={selectedTopicId}
            focusedTopicId={focusedTopicId}
            animatedTopicPositionsRef={animatedTopicPositionsRef}
            isSelected={isSelected}
            isFocused={isFocused}
            isAppearing={isAppearing}
            hideLabelsForViewDrag={hideLabelsForViewDrag}
            forceShowLabel={forceShowLabelDuringViewDrag}
            isAnyTopicFocused={isAnyTopicFocused}
            isEnteringProbe={isEnteringProbe}
            worldPositionRef={currentPositionRef}
            visualRadius={visualRadius}
          />

          {topicProbe && (
            <ProbeMarker
              probe={topicProbe}
              topic={topic}
              visualRadius={visualRadius}
              isVisible={showProbeMarker}
              onOpenProbe={onOpenProbe}
            />
          )}
        </group>
      </group>
    </>
  );
}

function CameraController({
  topics,
  selectedTopicId,
  focusedTopicId,
  arrivalMode,
  controlsRef,
  isEnteringProbe,
  probeEntryTopicId,
  onProbeEntryComplete,
  onProbeExitRestoreStart,
  onProbeExitRestoreComplete,
  onCameraMotionChange,
  preProbeViewSnapshotRef,
  animatedTopicPositionsRef,
}: {
  topics: LearningSpaceTopic[];
  selectedTopicId: string | null;
  focusedTopicId: string | null;
  arrivalMode: SceneArrivalMode;
  controlsRef: RefObject<TrackballControlsRef | null>;
  isEnteringProbe: boolean;
  probeEntryTopicId: string | null;
  onProbeEntryComplete: () => void;
  onProbeExitRestoreStart?: () => void;
  onProbeExitRestoreComplete?: () => void;
  onCameraMotionChange?: (moving: boolean) => void;
  preProbeViewSnapshotRef: PreProbeViewSnapshotRef;
  animatedTopicPositionsRef: AnimatedTopicPositionsRef;
}) {
  const { camera } = useThree();

  const desiredCameraPosition = useRef(DEFAULT_CAMERA_POSITION.clone());
  const desiredTarget = useRef(DEFAULT_TARGET.clone());

  const previousFocusedTopicIdRef = useRef<string | null>(null);
  const lastHandledSelectedTopicIdRef = useRef<string | null>(null);
  const lastHandledFocusedTopicIdRef = useRef<string | null>(null);
  const lastHandledArrivalModeRef = useRef<SceneArrivalMode | null>(null);
  const lastHandledSelectedTopicPositionKeyRef = useRef<string | null>(null);
  const lastHandledFocusedTopicPositionKeyRef = useRef<string | null>(null);
  const previousIsEnteringProbeRef = useRef(false);
  const preProbeCameraPositionRef = useRef<THREE.Vector3 | null>(null);
  const preProbeCameraQuaternionRef = useRef<THREE.Quaternion | null>(null);
  const preProbeCameraUpRef = useRef<THREE.Vector3 | null>(null);
  const preProbeCameraZoomRef = useRef<number | null>(null);
  const preProbeTargetRef = useRef<THREE.Vector3 | null>(null);
  const isRestoringPreProbeViewRef = useRef(false);

  const cameraAnimatingRef = useRef(false);
  const targetAnimatingRef = useRef(false);
  const pendingProbeEntryCompleteRef = useRef(false);
  const isCameraMovingRef = useRef(false);
  const currentCameraAlphaRef = useRef(0.095);
  const currentTargetAlphaRef = useRef(0.1);

  function setCameraMoving(next: boolean) {
    if (isCameraMovingRef.current === next) return;
    isCameraMovingRef.current = next;
    onCameraMotionChange?.(next);
  }

  useEffect(() => {
    return () => {
      setCameraMoving(false);
    };
  }, []);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || cameraAnimatingRef.current || targetAnimatingRef.current) {
      return;
    }

    desiredCameraPosition.current.copy(camera.position);
    desiredTarget.current.copy(controls.target);
  });

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const wasFocused = previousFocusedTopicIdRef.current !== null;
    const isFocused = focusedTopicId !== null;

    const currentTarget = controls.target.clone();
    const currentDirection = getCurrentViewDirection(camera, currentTarget);
    const wasEnteringProbe = previousIsEnteringProbeRef.current;
    previousIsEnteringProbeRef.current = isEnteringProbe;

    if (isEnteringProbe && probeEntryTopicId) {
      if (!wasEnteringProbe) {
        const snapshot = preProbeViewSnapshotRef.current;
        preProbeCameraPositionRef.current =
          snapshot?.cameraPosition.clone() ?? camera.position.clone();
        preProbeCameraQuaternionRef.current =
          snapshot?.cameraQuaternion.clone() ?? camera.quaternion.clone();
        preProbeCameraUpRef.current =
          snapshot?.cameraUp.clone() ?? camera.up.clone();
        preProbeCameraZoomRef.current = snapshot?.cameraZoom ?? camera.zoom;
        preProbeTargetRef.current =
          snapshot?.target.clone() ?? controls.target.clone();
        isRestoringPreProbeViewRef.current = false;
      }

      const topic = getTopicById(topics, probeEntryTopicId);
      if (!topic) {
        previousFocusedTopicIdRef.current = focusedTopicId;
        return;
      }

      const target = getAnimatedTopicPosition(topic, animatedTopicPositionsRef);
      const cameraRadius = getTopicCameraRadius(topic);
      const probeEntryDistance = Math.max(0.18, cameraRadius * 0.5);

      desiredTarget.current.copy(target);
      desiredCameraPosition.current.copy(
        target.clone().add(currentDirection.multiplyScalar(probeEntryDistance)),
      );

      currentCameraAlphaRef.current = 0.14;
      currentTargetAlphaRef.current = 0.14;
      pendingProbeEntryCompleteRef.current = true;
      cameraAnimatingRef.current = true;
      targetAnimatingRef.current = true;
      controls.enabled = false;
      setCameraMoving(true);

      previousFocusedTopicIdRef.current = focusedTopicId;
      lastHandledSelectedTopicIdRef.current = selectedTopicId;
      lastHandledFocusedTopicIdRef.current = focusedTopicId;
      lastHandledArrivalModeRef.current = arrivalMode;
      lastHandledSelectedTopicPositionKeyRef.current = selectedTopicId
        ? getTopicById(topics, selectedTopicId)
          ? getTopicPositionKey(getTopicById(topics, selectedTopicId)!)
          : null
        : null;
      lastHandledFocusedTopicPositionKeyRef.current = focusedTopicId
        ? getTopicById(topics, focusedTopicId)
          ? getTopicPositionKey(getTopicById(topics, focusedTopicId)!)
          : null
        : null;
      return;
    }

    if (wasEnteringProbe && !isEnteringProbe) {
      const snapshot = preProbeViewSnapshotRef.current;
      const savedCameraPosition =
        snapshot?.cameraPosition.clone() ?? preProbeCameraPositionRef.current;
      const savedTarget = snapshot?.target.clone() ?? preProbeTargetRef.current;

      if (savedCameraPosition && savedTarget) {
        /**
         * Probe exit should feel like backing out of the same sphere/view the
         * learner entered from, not like a generic refocus from a far-away
         * location. Restore the exact pre-probe camera position and target.
         */
        desiredCameraPosition.current.copy(savedCameraPosition);
        desiredTarget.current.copy(savedTarget);

        currentCameraAlphaRef.current = PROBE_EXIT_CAMERA_ALPHA;
        currentTargetAlphaRef.current = PROBE_EXIT_TARGET_ALPHA;
        pendingProbeEntryCompleteRef.current = false;
        isRestoringPreProbeViewRef.current = true;
        onProbeExitRestoreStart?.();
        cameraAnimatingRef.current = true;
        targetAnimatingRef.current = true;
        controls.enabled = false;
        setCameraMoving(true);

        previousFocusedTopicIdRef.current = focusedTopicId;
        lastHandledSelectedTopicIdRef.current = selectedTopicId;
        lastHandledFocusedTopicIdRef.current = focusedTopicId;
        lastHandledArrivalModeRef.current = arrivalMode;
        lastHandledSelectedTopicPositionKeyRef.current = selectedTopicId
          ? getTopicById(topics, selectedTopicId)
            ? getTopicPositionKey(getTopicById(topics, selectedTopicId)!)
            : null
          : null;
        lastHandledFocusedTopicPositionKeyRef.current = focusedTopicId
          ? getTopicById(topics, focusedTopicId)
            ? getTopicPositionKey(getTopicById(topics, focusedTopicId)!)
            : null
          : null;
        return;
      }

      const restoreTopicId = focusedTopicId ?? probeEntryTopicId ?? selectedTopicId;
      const topic = getTopicById(topics, restoreTopicId);

      if (topic) {
        const target = getAnimatedTopicPosition(topic, animatedTopicPositionsRef);
        const cameraRadius = getTopicCameraRadius(topic);
        const restoreDistance = Math.max(4.2, cameraRadius * 3.35);

        desiredTarget.current.copy(target);
        desiredCameraPosition.current.copy(
          target.clone().add(currentDirection.multiplyScalar(restoreDistance)),
        );

        currentCameraAlphaRef.current = PROBE_EXIT_CAMERA_ALPHA;
        currentTargetAlphaRef.current = PROBE_EXIT_TARGET_ALPHA;
        pendingProbeEntryCompleteRef.current = false;
        isRestoringPreProbeViewRef.current = true;
        onProbeExitRestoreStart?.();
        cameraAnimatingRef.current = true;
        targetAnimatingRef.current = true;
        controls.enabled = false;
        setCameraMoving(true);

        previousFocusedTopicIdRef.current = focusedTopicId;
        lastHandledSelectedTopicIdRef.current = selectedTopicId;
        lastHandledFocusedTopicIdRef.current = focusedTopicId;
        lastHandledArrivalModeRef.current = arrivalMode;
        lastHandledSelectedTopicPositionKeyRef.current = selectedTopicId
          ? getTopicById(topics, selectedTopicId)
            ? getTopicPositionKey(getTopicById(topics, selectedTopicId)!)
            : null
          : null;
        lastHandledFocusedTopicPositionKeyRef.current = focusedTopicId
          ? getTopicById(topics, focusedTopicId)
            ? getTopicPositionKey(getTopicById(topics, focusedTopicId)!)
            : null
          : null;
        return;
      }
    }

    if (!isFocused && wasFocused) {
      const outwardDirection = getCurrentViewDirection(camera, currentTarget);
      const zoomOutTarget = currentTarget.clone();
      const zoomOutDistance = Math.max(
        ZOOMED_OUT_DISTANCE,
        currentTarget.length() + 6,
      );

      desiredTarget.current.copy(zoomOutTarget);
      desiredCameraPosition.current.copy(
        zoomOutTarget
          .clone()
          .add(outwardDirection.multiplyScalar(zoomOutDistance)),
      );

      currentCameraAlphaRef.current = 0.095;
      currentTargetAlphaRef.current = 0.1;
      pendingProbeEntryCompleteRef.current = false;
      cameraAnimatingRef.current = true;
      targetAnimatingRef.current = true;
      controls.enabled = false;
      setCameraMoving(true);

      previousFocusedTopicIdRef.current = focusedTopicId;
      lastHandledSelectedTopicIdRef.current = selectedTopicId;
      lastHandledFocusedTopicIdRef.current = focusedTopicId;
      lastHandledArrivalModeRef.current = arrivalMode;
      lastHandledSelectedTopicPositionKeyRef.current = selectedTopicId
        ? getTopicById(topics, selectedTopicId)
          ? getTopicPositionKey(getTopicById(topics, selectedTopicId)!)
          : null
        : null;
      lastHandledFocusedTopicPositionKeyRef.current = null;
      return;
    }

    if (focusedTopicId) {
      const topic = getTopicById(topics, focusedTopicId);
      if (!topic) {
        previousFocusedTopicIdRef.current = focusedTopicId;
        return;
      }

      const target = getAnimatedTopicPosition(topic, animatedTopicPositionsRef);
      const topicPositionKey = getTopicPositionKey(topic);

      const focusTargetChanged =
        lastHandledFocusedTopicIdRef.current !== focusedTopicId;
      const arrivalChanged = lastHandledArrivalModeRef.current !== arrivalMode;
      const focusPositionChanged =
        lastHandledFocusedTopicPositionKeyRef.current !== null &&
        lastHandledFocusedTopicPositionKeyRef.current !== topicPositionKey &&
        desiredTarget.current.distanceTo(target) >=
          CAMERA_TETHER_MIN_TOPIC_MOVE;

      if (focusTargetChanged || arrivalChanged) {
        if (arrivalMode === "warp") {
          const cameraRadius = getTopicCameraRadius(topic);
          const warpDistance = Math.max(5.6, cameraRadius * 4.15);
          desiredTarget.current.copy(target);
          desiredCameraPosition.current.copy(
            target.clone().add(currentDirection.multiplyScalar(warpDistance)),
          );
          currentCameraAlphaRef.current = 0.125;
          currentTargetAlphaRef.current = 0.13;
        } else {
          const cameraRadius = getTopicCameraRadius(topic);
          const focusDistance = Math.max(4.2, cameraRadius * 3.35);
          desiredTarget.current.copy(target);
          desiredCameraPosition.current.copy(
            target.clone().add(currentDirection.multiplyScalar(focusDistance)),
          );
          currentCameraAlphaRef.current = 0.095;
          currentTargetAlphaRef.current = 0.1;
        }

        pendingProbeEntryCompleteRef.current = false;
        cameraAnimatingRef.current = true;
        targetAnimatingRef.current = true;
        controls.enabled = false;
        setCameraMoving(true);

        previousFocusedTopicIdRef.current = focusedTopicId;
        lastHandledSelectedTopicIdRef.current = selectedTopicId;
        lastHandledFocusedTopicIdRef.current = focusedTopicId;
        lastHandledArrivalModeRef.current = arrivalMode;
        lastHandledFocusedTopicPositionKeyRef.current = topicPositionKey;
        lastHandledSelectedTopicPositionKeyRef.current = selectedTopicId
          ? getTopicById(topics, selectedTopicId)
            ? getTopicPositionKey(getTopicById(topics, selectedTopicId)!)
            : null
          : null;
        return;
      }

      if (focusPositionChanged && !isEnteringProbe) {
        const tetherDistance = Math.max(
          camera.position.distanceTo(currentTarget),
          getTopicCameraRadius(topic) * 3.35,
        );

        desiredTarget.current.copy(target);
        desiredCameraPosition.current.copy(
          target.clone().add(currentDirection.multiplyScalar(tetherDistance)),
        );

        currentCameraAlphaRef.current = FOCUSED_TOPIC_TETHER_CAMERA_ALPHA;
        currentTargetAlphaRef.current = FOCUSED_TOPIC_TETHER_TARGET_ALPHA;
        pendingProbeEntryCompleteRef.current = false;
        cameraAnimatingRef.current = true;
        targetAnimatingRef.current = true;
        controls.enabled = false;
        setCameraMoving(true);

        previousFocusedTopicIdRef.current = focusedTopicId;
        lastHandledSelectedTopicIdRef.current = selectedTopicId;
        lastHandledFocusedTopicIdRef.current = focusedTopicId;
        lastHandledArrivalModeRef.current = arrivalMode;
        lastHandledFocusedTopicPositionKeyRef.current = topicPositionKey;
        return;
      }

      if (lastHandledFocusedTopicPositionKeyRef.current === null) {
        lastHandledFocusedTopicPositionKeyRef.current = topicPositionKey;
      }
    }

    if (selectedTopicId && !focusedTopicId) {
      const topic = getTopicById(topics, selectedTopicId);
      if (!topic) {
        previousFocusedTopicIdRef.current = focusedTopicId;
        return;
      }

      const target = getAnimatedTopicPosition(topic, animatedTopicPositionsRef);
      const topicPositionKey = getTopicPositionKey(topic);

      const selectedTargetChanged =
        lastHandledSelectedTopicIdRef.current !== selectedTopicId;
      const selectedPositionChanged =
        lastHandledSelectedTopicPositionKeyRef.current !== null &&
        lastHandledSelectedTopicPositionKeyRef.current !== topicPositionKey &&
        desiredTarget.current.distanceTo(target) >=
          CAMERA_TETHER_MIN_TOPIC_MOVE;

      if (selectedTargetChanged) {
        desiredTarget.current.copy(target);

        currentCameraAlphaRef.current = 0.095;
        currentTargetAlphaRef.current = 0.1;
        pendingProbeEntryCompleteRef.current = false;
        targetAnimatingRef.current = true;
        cameraAnimatingRef.current = false;
        setCameraMoving(true);

        previousFocusedTopicIdRef.current = focusedTopicId;
        lastHandledSelectedTopicIdRef.current = selectedTopicId;
        lastHandledFocusedTopicIdRef.current = focusedTopicId;
        lastHandledArrivalModeRef.current = arrivalMode;
        lastHandledSelectedTopicPositionKeyRef.current = topicPositionKey;
        return;
      }

      if (selectedPositionChanged && !isEnteringProbe) {
        desiredTarget.current.copy(target);

        currentTargetAlphaRef.current = SELECTED_TOPIC_TETHER_TARGET_ALPHA;
        pendingProbeEntryCompleteRef.current = false;
        targetAnimatingRef.current = true;
        cameraAnimatingRef.current = false;
        setCameraMoving(true);

        previousFocusedTopicIdRef.current = focusedTopicId;
        lastHandledSelectedTopicIdRef.current = selectedTopicId;
        lastHandledFocusedTopicIdRef.current = focusedTopicId;
        lastHandledArrivalModeRef.current = arrivalMode;
        lastHandledSelectedTopicPositionKeyRef.current = topicPositionKey;
        return;
      }

      if (lastHandledSelectedTopicPositionKeyRef.current === null) {
        lastHandledSelectedTopicPositionKeyRef.current = topicPositionKey;
      }
    }

    if (
      selectedTopicId === null &&
      focusedTopicId === null &&
      (lastHandledSelectedTopicIdRef.current !== null ||
        lastHandledFocusedTopicIdRef.current !== null)
    ) {
      desiredTarget.current.copy(DEFAULT_TARGET);
      desiredCameraPosition.current.copy(DEFAULT_CAMERA_POSITION);

      currentCameraAlphaRef.current = 0.095;
      currentTargetAlphaRef.current = 0.1;
      pendingProbeEntryCompleteRef.current = false;
      cameraAnimatingRef.current = true;
      targetAnimatingRef.current = true;
      controls.enabled = false;
      setCameraMoving(true);

      previousFocusedTopicIdRef.current = focusedTopicId;
      lastHandledSelectedTopicIdRef.current = selectedTopicId;
      lastHandledFocusedTopicIdRef.current = focusedTopicId;
      lastHandledArrivalModeRef.current = arrivalMode;
      lastHandledSelectedTopicPositionKeyRef.current = null;
      lastHandledFocusedTopicPositionKeyRef.current = null;
    }
  }, [
    topics,
    selectedTopicId,
    focusedTopicId,
    arrivalMode,
    isEnteringProbe,
    probeEntryTopicId,
    camera,
    controlsRef,
    animatedTopicPositionsRef,
    onProbeExitRestoreStart,
  ]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    /**
     * Ride with the topic's visible animated position during semantic migration.
     * The backend may commit the final semantic location immediately, but the
     * sphere moves there over time. Camera framing should follow the displayed
     * sphere, not jump ahead to the final target.
     */
    if (!isEnteringProbe && !isRestoringPreProbeViewRef.current) {
      const rideTopicId = focusedTopicId ?? selectedTopicId;
      const rideTopic = getTopicById(topics, rideTopicId);

      if (rideTopic) {
        const displayedTarget = getAnimatedTopicPosition(
          rideTopic,
          animatedTopicPositionsRef,
        );
        const previousTarget = desiredTarget.current.clone();
        const targetDelta = displayedTarget.clone().sub(previousTarget);

        if (targetDelta.lengthSq() > 0.000001) {
          desiredTarget.current.copy(displayedTarget);

          if (focusedTopicId) {
            desiredCameraPosition.current.add(targetDelta);
          }

          if (!targetAnimatingRef.current) {
            targetAnimatingRef.current = true;
            currentTargetAlphaRef.current = focusedTopicId
              ? FOCUSED_TOPIC_TETHER_TARGET_ALPHA
              : SELECTED_TOPIC_TETHER_TARGET_ALPHA;
          }
        }
      }
    }

    if (targetAnimatingRef.current) {
      controls.target.lerp(
        desiredTarget.current,
        currentTargetAlphaRef.current,
      );

      if (controls.target.distanceTo(desiredTarget.current) < 0.01) {
        controls.target.copy(desiredTarget.current);
        targetAnimatingRef.current = false;
      }

      controls.update?.();
    }

    if (!cameraAnimatingRef.current) {
      if (!targetAnimatingRef.current) {
        controls.enabled = true;
        setCameraMoving(false);
      }
      return;
    }

    camera.position.lerp(
      desiredCameraPosition.current,
      currentCameraAlphaRef.current,
    );
    controls.target.lerp(desiredTarget.current, currentCameraAlphaRef.current);
    controls.update?.();

    const cameraDone =
      camera.position.distanceTo(desiredCameraPosition.current) < 0.01;

    const targetDone = controls.target.distanceTo(desiredTarget.current) < 0.01;

    if (cameraDone && targetDone) {
      camera.position.copy(desiredCameraPosition.current);
      controls.target.copy(desiredTarget.current);
      controls.update?.();

      controls.enabled = true;
      cameraAnimatingRef.current = false;
      targetAnimatingRef.current = false;

      if (isRestoringPreProbeViewRef.current) {
        const snapshot = preProbeViewSnapshotRef.current;
        const savedQuaternion =
          snapshot?.cameraQuaternion ?? preProbeCameraQuaternionRef.current;
        const savedUp = snapshot?.cameraUp ?? preProbeCameraUpRef.current;
        const savedZoom = snapshot?.cameraZoom ?? preProbeCameraZoomRef.current;

        if (savedUp) {
          camera.up.copy(savedUp);
        }

        if (typeof savedZoom === "number" && Number.isFinite(savedZoom)) {
          camera.zoom = savedZoom;
          camera.updateProjectionMatrix();
        }

        controls.update?.();

        /**
         * Position + target restore the functional view. Keeping the captured
         * quaternion as a final correction preserves subtle Trackball roll when
         * it is not overwritten by controls.update.
         */
        if (savedQuaternion) {
          camera.quaternion.slerp(savedQuaternion, 0.35);
        }

        isRestoringPreProbeViewRef.current = false;
        preProbeCameraPositionRef.current = null;
        preProbeCameraQuaternionRef.current = null;
        preProbeCameraUpRef.current = null;
        preProbeCameraZoomRef.current = null;
        preProbeTargetRef.current = null;
        preProbeViewSnapshotRef.current = null;
        onProbeExitRestoreComplete?.();
      }

      setCameraMoving(false);

      if (pendingProbeEntryCompleteRef.current) {
        pendingProbeEntryCompleteRef.current = false;
        onProbeEntryComplete();
      }
    }
  });

  return null;
}

function buildDebugProbeSummaryForTopic(topic: LearningSpaceTopic): ProbeSummary {
  const label = getTopicDisplayLabel(topic);
  const style = getDebugProbeThumbnailStyle(topic);

  return {
    id: `debug-probe-${topic.topic_id}`,
    topicId: topic.topic_id,
    topicLabel: label,
    title: `${getProbeThumbnailLabel(style)} check`,
    instruction: `Temporary visual-development probe for ${label}. This lets the surface thumbnail be tested before real probe eligibility is restored.`,
    status: "available",
    intent: "diagnostic",
    probeType:
      style === "slider_card"
        ? "predict"
        : style === "drag_drop_card"
          ? "apply_transfer"
          : style === "choice_card"
            ? "discriminate"
            : style === "text_card"
              ? "explain"
              : null,
    expectedResponseType:
      style === "slider_card"
        ? "predict"
        : style === "choice_card"
          ? "multiple_choice"
          : style === "drag_drop_card" || style === "graph_card" || style === "simulation_card"
            ? "interactive_action"
            : style === "audio_card"
              ? "audio"
              : style === "video_card"
                ? "video"
                : "text",
    helperText:
      "Temporary dev thumbnail. Real probe availability will be restored after the surface treatment looks right.",
  };
}

type SpaceCanvasProps = {
  learningSpace: LearningSpace;
  selectedTopicId: string | null;
  focusedTopicId: string | null;
  arrivalMode?: SceneArrivalMode;
  relationshipViewMode?: RelationshipViewMode;
  availableProbe: ProbeSummary | null;
  isEnteringProbe: boolean;
  probeEntryTopicId: string | null;
  onSelectTopic: (id: string | null) => void;
  onFocusTopicChange?: (topicId: string | null) => void;
  onOpenProbe: (probe: ProbeSummary) => void;
  onProbeEntryComplete: () => void;
  isBootstrappingTopics?: boolean;
};

export default function SpaceCanvas({
  learningSpace,
  selectedTopicId,
  focusedTopicId,
  arrivalMode = "focus",
  relationshipViewMode = "semantic_similarity",
  availableProbe,
  isEnteringProbe,
  probeEntryTopicId,
  onSelectTopic,
  onFocusTopicChange,
  onOpenProbe,
  onProbeEntryComplete,
  isBootstrappingTopics = false,
}: SpaceCanvasProps) {
  const controlsRef = useRef<TrackballControlsRef | null>(null);
  const seenTopicIdsRef = useRef<Set<string>>(new Set());
  const settleTimeoutRef = useRef<number | null>(null);
  const viewPointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const animatedTopicPositionsRef = useRef<Map<string, THREE.Vector3>>(
    new Map(),
  );
  const preProbeViewSnapshotRef = useRef<PreProbeViewSnapshot | null>(null);

  const [appearingTopicIds, setAppearingTopicIds] = useState<Set<string>>(
    new Set(),
  );
  const [isUserControlling, setIsUserControlling] = useState(false);
  const [isCameraInMotion, setIsCameraInMotion] = useState(false);
  const [isProbeExitAnimating, setIsProbeExitAnimating] = useState(false);
  const [isSceneSettled, setIsSceneSettled] = useState(true);
  const scannerSettleTimeoutRef = useRef<number | null>(null);
  const scannerRelationshipIdsRef = useRef<string[]>([]);
  const [scannerRelationshipIds, setScannerRelationshipIds] = useState<
    string[]
  >([]);
  const [settledScannerRelationshipIds, setSettledScannerRelationshipIds] =
    useState<string[]>([]);

  const topicIdsKey = useMemo(
    () => learningSpace.topics.map((topic) => topic.topic_id).join("|"),
    [learningSpace.topics],
  );

  const topicsById = useMemo(() => {
    return new Map(
      learningSpace.topics.map((topic) => [topic.topic_id, topic]),
    );
  }, [learningSpace.topics]);

  const activeRelationshipTopicId = focusedTopicId ?? selectedTopicId;
  const isProbeTransitionActive = isEnteringProbe || isProbeExitAnimating;

  useEffect(() => {
    if (isEnteringProbe && isProbeExitAnimating) {
      setIsProbeExitAnimating(false);
    }
  }, [isEnteringProbe, isProbeExitAnimating]);

  const visibleModeRelationships = useMemo(() => {
    if (!activeRelationshipTopicId || relationshipViewMode === "off") {
      return [];
    }

    return (learningSpace.relationships ?? [])
      .filter((relationship) =>
        shouldShowRelationshipOnFocus({
          relationship,
          relationshipViewMode,
          activeTopicId: activeRelationshipTopicId,
          topicsById,
        }),
      )
      .sort((a, b) => getRelationshipSortScore(b) - getRelationshipSortScore(a))
      .slice(0, RELATIONSHIP_VIEW_MODE_ARC_MAX_COUNT);
  }, [
    activeRelationshipTopicId,
    learningSpace.relationships,
    relationshipViewMode,
    topicsById,
  ]);

  const relationshipsById = useMemo(
    () => getRelationshipByIdMap(learningSpace.relationships ?? []),
    [learningSpace.relationships],
  );

  const scannerRelationships = useMemo(
    () =>
      getRelationshipListFromIds({
        relationshipIds: scannerRelationshipIds,
        relationshipsById,
      }),
    [scannerRelationshipIds, relationshipsById],
  );

  const settledScannerRelationships = useMemo(
    () =>
      getRelationshipListFromIds({
        relationshipIds: settledScannerRelationshipIds,
        relationshipsById,
      }),
    [settledScannerRelationshipIds, relationshipsById],
  );

  const relationshipDisplayMode: RelationshipDisplayMode = isUserControlling
    ? "scanning"
    : settledScannerRelationships.length > 0
      ? "settled_scan"
      : "default_mode";

  const displayedRelationships =
    relationshipViewMode === "off"
      ? []
      : relationshipDisplayMode === "scanning"
        ? scannerRelationships
        : relationshipDisplayMode === "settled_scan"
          ? settledScannerRelationships
          : visibleModeRelationships;

  const displayedRelationshipVariant: RelationshipArcVariant =
    relationshipDisplayMode === "scanning"
      ? "scanner"
      : "settled_scan";

  const relationshipLabelTopicIds = useMemo(() => {
    const ids = new Set<string>();

    /**
     * During relationship scanning, most map labels can hide so the scan feels
     * clean. The exception is the active topic and the topics touched by the
     * currently displayed scanner relationships. That way, as a new relationship
     * appears from the current camera angle, its endpoint topic label appears too.
     */
    if (
      relationshipDisplayMode !== "scanning" &&
      relationshipDisplayMode !== "settled_scan"
    ) {
      return ids;
    }

    if (activeRelationshipTopicId) {
      ids.add(activeRelationshipTopicId);
    }

    for (const relationship of displayedRelationships) {
      ids.add(relationship.source_topic_id);
      ids.add(relationship.target_topic_id);
    }

    return ids;
  }, [
    activeRelationshipTopicId,
    displayedRelationships,
    relationshipDisplayMode,
  ]);


  function clearScannerSettleTimeout() {
    if (scannerSettleTimeoutRef.current !== null) {
      window.clearTimeout(scannerSettleTimeoutRef.current);
      scannerSettleTimeoutRef.current = null;
    }
  }

  function updateScannerRelationshipIds(nextRelationshipIds: string[]) {
    if (
      areStringArraysEqual(
        scannerRelationshipIdsRef.current,
        nextRelationshipIds,
      )
    ) {
      return;
    }

    scannerRelationshipIdsRef.current = nextRelationshipIds;
    setScannerRelationshipIds(nextRelationshipIds);
  }

  function beginRelationshipScan() {
    clearScannerSettleTimeout();
    setSettledScannerRelationshipIds([]);

    /**
     * Start the next scan from a clean scanner set. We intentionally do this
     * at scan start instead of clearing scanner ids on scan end. Clearing on
     * mouse release causes an extra relationship-render transition right when
     * the settled scanner lines should remain visually stable.
     */
    scannerRelationshipIdsRef.current = [];
    setScannerRelationshipIds([]);

    setIsUserControlling(true);
  }

  function endRelationshipScan() {
    const finalScannerRelationshipIds = scannerRelationshipIdsRef.current;

    clearScannerSettleTimeout();

    if (finalScannerRelationshipIds.length > 0) {
      setSettledScannerRelationshipIds(finalScannerRelationshipIds);

      scannerSettleTimeoutRef.current = window.setTimeout(() => {
        setSettledScannerRelationshipIds([]);
        scannerSettleTimeoutRef.current = null;
      }, VIEWPOINT_SCANNER_SETTLE_MS);
    } else {
      setSettledScannerRelationshipIds([]);
    }

    setIsUserControlling(false);
  }

  useEffect(() => {
    clearScannerSettleTimeout();
    scannerRelationshipIdsRef.current = [];
    setScannerRelationshipIds([]);
    setSettledScannerRelationshipIds([]);
  }, [relationshipViewMode]);

  useEffect(() => {
    const currentIds = learningSpace.topics.map((topic) => topic.topic_id);
    const nextAppearingIds = new Set<string>();

    for (const id of currentIds) {
      if (!seenTopicIdsRef.current.has(id)) {
        nextAppearingIds.add(id);
        seenTopicIdsRef.current.add(id);
      }
    }

    if (nextAppearingIds.size === 0) return;

    setAppearingTopicIds((previous) => {
      const merged = new Set(previous);
      nextAppearingIds.forEach((id) => merged.add(id));
      return merged;
    });

    const timeout = window.setTimeout(() => {
      setAppearingTopicIds((previous) => {
        const updated = new Set(previous);
        nextAppearingIds.forEach((id) => updated.delete(id));
        return updated;
      });
    }, 2600);

    return () => window.clearTimeout(timeout);
  }, [topicIdsKey, learningSpace.topics]);

  useEffect(() => {
    // Labels should not flicker just because a semantic layout commit or a soft
    // camera tether is happening. Hide/fade labels only for direct user control
    // (rotate/scroll) and probe entry. Programmatic camera motion is ignored
    // here so layout updates do not briefly blank the map labels.
    const isMoving = isUserControlling || isEnteringProbe;

    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }

    if (isMoving) {
      setIsSceneSettled(false);
      return;
    }

    settleTimeoutRef.current = window.setTimeout(() => {
      setIsSceneSettled(true);
      settleTimeoutRef.current = null;
    }, SETTLE_DELAY_MS);

    return () => {
      if (settleTimeoutRef.current !== null) {
        window.clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
      }
    };
  }, [isUserControlling, isEnteringProbe]);

  useEffect(() => {
    return () => {
      viewPointerDownRef.current = null;
      clearScannerSettleTimeout();
    };
  }, []);

  return (
    <section
      className="relative h-full w-full overflow-hidden bg-black"
      onPointerDownCapture={(event) => {
        viewPointerDownRef.current = {
          x: event.clientX,
          y: event.clientY,
        };
      }}
      onPointerMoveCapture={(event) => {
        const down = viewPointerDownRef.current;
        if (!down || isUserControlling) return;

        const dx = event.clientX - down.x;
        const dy = event.clientY - down.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= VIEW_DRAG_LABEL_HIDE_THRESHOLD_PX) {
          beginRelationshipScan();
        }
      }}
      onPointerUpCapture={() => {
        viewPointerDownRef.current = null;

        if (isUserControlling) {
          endRelationshipScan();
          return;
        }

        setIsUserControlling(false);
      }}
      onWheelCapture={() => {
        // Wheel zoom is already handled per-topic through screen-size label
        // hiding. Do not globally hide every map label on scroll.
      }}
      onPointerLeave={() => {
        document.body.style.cursor = "default";
        viewPointerDownRef.current = null;

        if (isUserControlling) {
          endRelationshipScan();
          return;
        }

        setIsUserControlling(false);
      }}
    >
      <div className="absolute inset-0 z-0">
        <Canvas
          camera={{ position: [0, 18, 72], fov: 50 }}
          gl={{ stencil: true }}
        >
          <color attach="background" args={["#000000"]} />

          <ambientLight intensity={1.1} />
          <directionalLight position={[5, 5, 5]} intensity={1.4} />
          <pointLight position={[-4, -2, 4]} intensity={1.2} />

          <Stars
            radius={920}
            depth={520}
            count={7600}
            factor={3.15}
            saturation={0}
            fade
            speed={0.24}
          />

          <ViewpointRelationshipScanner
            activeTopicId={activeRelationshipTopicId}
            relationships={learningSpace.relationships ?? []}
            relationshipViewMode={relationshipViewMode}
            topicsById={topicsById}
            animatedTopicPositionsRef={animatedTopicPositionsRef}
            isScanning={isUserControlling}
            isEnteringProbe={isProbeTransitionActive}
            onScannerRelationshipIdsChange={updateScannerRelationshipIds}
          />

          {activeRelationshipTopicId &&
            displayedRelationships.map((relationship) => (
              <SemanticRelationshipArc
                key={relationship.relationship_id}
                relationship={relationship}
                activeTopicId={activeRelationshipTopicId}
                topicsById={topicsById}
                animatedTopicPositionsRef={animatedTopicPositionsRef}
                isAnyTopicFocused={focusedTopicId !== null}
                hideBecauseUserIsControlling={false}
                isEnteringProbe={isProbeTransitionActive}
                variant={displayedRelationshipVariant}
              />
            ))}

          {learningSpace.topics.map((topic) => {
            const realTopicProbe =
              availableProbe &&
              availableProbe.topicId === topic.topic_id &&
              availableProbe.status === "available"
                ? availableProbe
                : null;

            const topicProbe =
              realTopicProbe ??
              (SHOW_DEBUG_PROBE_THUMBNAILS_FOR_ALL_TOPICS
                ? buildDebugProbeSummaryForTopic(topic)
                : null);

            return (
              <TopicSphere
                key={topic.topic_id}
                topic={topic}
                allTopics={learningSpace.topics}
                selectedTopicId={selectedTopicId}
                isSelected={topic.topic_id === selectedTopicId}
                isFocused={topic.topic_id === focusedTopicId}
                focusedTopicId={focusedTopicId}
                topicProbe={topicProbe}
                isAppearing={appearingTopicIds.has(topic.topic_id)}
                isSceneSettled={isSceneSettled}
                isEnteringProbe={isProbeTransitionActive}
                hideLabelsForViewDrag={isUserControlling}
                forceShowLabelDuringViewDrag={relationshipLabelTopicIds.has(
                  topic.topic_id,
                )}
                onSelect={(id) => onSelectTopic(id)}
                onFocusTopic={(id) => onFocusTopicChange?.(id)}
                onUnfocus={() => onFocusTopicChange?.(null)}
                onOpenProbe={onOpenProbe}
                controlsRef={controlsRef}
                preProbeViewSnapshotRef={preProbeViewSnapshotRef}
                animatedTopicPositionsRef={animatedTopicPositionsRef}
              />
            );
          })}

          <CameraController
            topics={learningSpace.topics}
            selectedTopicId={selectedTopicId}
            focusedTopicId={focusedTopicId}
            arrivalMode={arrivalMode}
            controlsRef={controlsRef}
            isEnteringProbe={isEnteringProbe}
            probeEntryTopicId={probeEntryTopicId}
            onProbeEntryComplete={onProbeEntryComplete}
            onProbeExitRestoreStart={() => setIsProbeExitAnimating(true)}
            onProbeExitRestoreComplete={() => setIsProbeExitAnimating(false)}
            onCameraMotionChange={setIsCameraInMotion}
            preProbeViewSnapshotRef={preProbeViewSnapshotRef}
            animatedTopicPositionsRef={animatedTopicPositionsRef}
          />

          <TrackballControls
            ref={controlsRef}
            noPan
            minDistance={0.06}
            maxDistance={520}
            rotateSpeed={3.2}
            zoomSpeed={1.2}
            dynamicDampingFactor={0.11}
            onStart={() => {
              // TrackballControls can emit start events for non-drag updates.
              // Label hiding is driven by section-level drag-distance detection
              // instead, so semantic layout updates cannot look like rotation.
            }}
            onEnd={() => {
              viewPointerDownRef.current = null;

              if (isUserControlling) {
                endRelationshipScan();
                return;
              }

              setIsUserControlling(false);
            }}
          />
        </Canvas>
      </div>

      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-700 ${
          isProbeTransitionActive ? "opacity-100" : "opacity-0"
        } bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.92)_0%,rgba(101,45,175,0.98)_42%,rgba(26,6,46,1)_100%)]`}
      />

      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(88,92,180,0.12),transparent_30%),radial-gradient(circle_at_bottom,rgba(30,30,60,0.18),transparent_40%)]" />

      {!isBootstrappingTopics && learningSpace.topics.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
          <div className="max-w-md rounded-2xl border border-white/10 bg-black/35 px-6 py-5 text-center backdrop-blur-md">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
              Learning Space
            </p>
            <p className="mt-3 text-lg text-zinc-100">
              Your learning space is empty.
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Send a message to begin, and your first topic sphere will form
              here.
            </p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-0 top-0 z-20 px-5 py-5 md:px-8 md:py-7">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
          Learning Space
        </p>
      </div>
    </section>
  );
}
