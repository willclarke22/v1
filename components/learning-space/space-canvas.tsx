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
import type { LearningSpace, LearningSpaceTopic } from "@/types/learning-space";
import type { ProbeSummary } from "@/components/probes/probe-surface";

type TrackballControlsRef = ElementRef<typeof TrackballControls>;
type SceneArrivalMode = "warp" | "focus";

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 0, 46);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);
const ZOOMED_OUT_DISTANCE = 46;

/**
 * Renderer-only expansion.
 *
 * Supabase topic_position / semantic_position stay in canonical semantic-map
 * units. The canvas expands those coordinates for a more spacious,
 * NASA-Eyes-like overview without corrupting persisted layout math.
 *
 * Keep X/Z meaningfully larger than Y so the learning space remains a readable
 * semantic solar-system plane instead of becoming an arbitrary 3D cloud.
 */
const VISUAL_SPACE_SCALE_XZ = 5.15;
const VISUAL_SPACE_SCALE_Y = 1.42;

/**
 * NASA-Eyes-style composition shaping.
 *
 * The first pass now uses a larger mostly-linear X/Z scale so pairwise semantic
 * relationships are preserved as much as possible. This radial boost is kept
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
const RADIAL_EXPANSION_MAX_BOOST = 0.48;

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

/**
 * Visual-only movement policy.
 *
 * Canonical topic positions still come from learningSpace.topics[].position.
 * These values only control how the renderer eases toward that already-committed
 * renderer-safe position.
 */
const OVERVIEW_TOPIC_POSITION_LERP_ALPHA = 0.065;
const FOCUSED_TOPIC_POSITION_LERP_ALPHA = 0.048;
const BACKGROUND_TOPIC_POSITION_LERP_ALPHA = 0.026;
const PROBE_TOPIC_POSITION_LERP_ALPHA = 0;

/**
 * Elegant semantic drift trail policy.
 *
 * The trail should feel like a subtle memory of movement, not a busy sci-fi
 * effect. It appears only after a meaningful committed position change and
 * fades away automatically.
 */
const MOVEMENT_TRAIL_MIN_DISTANCE = 0.18;
const MOVEMENT_TRAIL_FADE_RATE = 0.958;
const MOVEMENT_TRAIL_TARGET_REACHED_FADE_RATE = 0.92;
const MOVEMENT_TRAIL_MIN_OPACITY = 0.01;
const MOVEMENT_TRAIL_OVERVIEW_OPACITY = 0.22;
const MOVEMENT_TRAIL_FOCUSED_OPACITY = 0.18;
const MOVEMENT_TRAIL_BACKGROUND_OPACITY = 0.08;

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
 * Labels are useful for overview navigation, but they become redundant once a
 * topic is close enough to read through the focused/right-panel context.
 * Hide labels in focused scenes and whenever a topic body becomes large enough
 * on screen from manual mouse-wheel zoom.
 */
const LABEL_HIDE_SCREEN_RADIUS_PX = 44;
const LABEL_MAX_WIDTH_OVERVIEW = 172;
const LABEL_MAX_WIDTH_PROMINENT = 220;

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

  return baseRadius * (args.isSelected ? SELECTED_TOPIC_BODY_SCALE : OVERVIEW_TOPIC_BODY_SCALE);
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

function TopicLabel({
  topic,
  isSelected,
  isFocused,
  isAppearing,
  isSceneSettled,
  isAnyTopicFocused,
  isEnteringProbe,
  worldPositionRef,
  visualRadius,
}: {
  topic: LearningSpaceTopic;
  isSelected: boolean;
  isFocused: boolean;
  isAppearing: boolean;
  isSceneSettled: boolean;
  isAnyTopicFocused: boolean;
  isEnteringProbe: boolean;
  worldPositionRef: RefObject<THREE.Vector3>;
  visualRadius: number;
}) {
  const { camera, size } = useThree();
  const containerRef = useRef<HTMLDivElement | null>(null);

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
     * Mode A label policy, refined:
     * - show all labels in overview when the scene is settled
     * - hide labels during camera/user motion
     * - hide labels in focused/double-click scenes because the right panel owns
     *   the focused topic title
     * - hide labels when manual zoom makes a topic large enough on screen
     */
    const isCloseEnoughToReadWithoutMapLabel =
      screenRadiusPx >= LABEL_HIDE_SCREEN_RADIUS_PX;

    const shouldShow =
      isSceneSettled &&
      !isEnteringProbe &&
      !isAnyTopicFocused &&
      !isCloseEnoughToReadWithoutMapLabel;

    const labelOffsetPx = Math.min(
      68,
      Math.max(22, screenRadiusPx * 0.62 + 14),
    );

    const targetOpacity = shouldShow
      ? isSelected
        ? 0.96
        : isAppearing
          ? 0.9
          : 0.78
      : 0;

    const targetScale = shouldShow ? (isSelected ? 1.02 : 0.94) : 0.92;
    const targetBlur = shouldShow ? 0 : 3;
    const targetYOffset = shouldShow ? -labelOffsetPx : -(labelOffsetPx - 6);

    el.style.opacity = `${targetOpacity}`;
    el.style.filter = `blur(${targetBlur}px)`;
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
          transform: "translate3d(0, -22px, 0) scale(0.92)",
          filter: "blur(3px)",
          transition:
            "opacity 180ms ease, transform 220ms ease, filter 220ms ease",
          willChange: "transform, opacity, filter",
          maxWidth: isProminent
            ? LABEL_MAX_WIDTH_PROMINENT
            : LABEL_MAX_WIDTH_OVERVIEW,
          textShadow:
            "0 2px 8px rgba(0,0,0,0.96), 0 0 18px rgba(0,0,0,0.86)",
        }}
        className={`px-1 text-[11px] font-medium leading-tight tracking-[0.01em] ${
          isProminent ? "text-white" : "text-zinc-100/90"
        }`}
      >
        <span className="block truncate whitespace-nowrap">
          {getTopicDisplayLabel(topic)}
        </span>
      </div>
    </Html>
  );
}

function ProbeMarker({
  probe,
  isVisible,
  onOpenProbe,
}: {
  probe: ProbeSummary;
  isVisible: boolean;
  onOpenProbe: (probe: ProbeSummary) => void;
}) {
  return (
    <Html
      position={[0, 0, 0]}
      center
      distanceFactor={10}
      style={{
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <button
        type="button"
        aria-label="Open probe"
        title="Open probe"
        onClick={(event) => {
          event.stopPropagation();
          onOpenProbe(probe);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-purple-300/45 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),rgba(168,85,247,0.28)_45%,rgba(50,18,84,0.9)_100%)] text-white shadow-[0_0_24px_rgba(168,85,247,0.28)] backdrop-blur-md transition duration-200 hover:scale-105 hover:border-purple-200/60 hover:shadow-[0_0_30px_rgba(168,85,247,0.38)]"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: `scale(${isVisible ? 1 : 0.82})`,
          transition: "opacity 180ms ease, transform 220ms ease",
        }}
      >
        <span className="absolute inset-0 rounded-full border border-purple-200/20 opacity-70" />
        <span className="absolute inset-[5px] rounded-full border border-white/10" />
        <span className="text-sm leading-none">✦</span>
      </button>
    </Html>
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
        color="#a78bfa"
        transparent
        opacity={0}
        depthWrite={false}
        depthTest
      />
    </line>
  );
}

function TopicSphere({
  topic,
  isSelected,
  isFocused,
  focusedTopicId,
  topicProbe,
  isAppearing,
  isSceneSettled,
  isEnteringProbe,
  onSelect,
  onFocusTopic,
  onUnfocus,
  onOpenProbe,
}: {
  topic: LearningSpaceTopic;
  isSelected: boolean;
  isFocused: boolean;
  focusedTopicId: string | null;
  topicProbe: ProbeSummary | null;
  isAppearing: boolean;
  isSceneSettled: boolean;
  isEnteringProbe: boolean;
  onSelect: (id: string) => void;
  onFocusTopic: (id: string) => void;
  onUnfocus: () => void;
  onOpenProbe: (probe: ProbeSummary) => void;
}) {
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
  const lastTapRef = useRef<{ time: number; topicId: string } | null>(null);
  const singleClickTimeoutRef = useRef<number | null>(null);

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
    return () => {
      if (singleClickTimeoutRef.current !== null) {
        window.clearTimeout(singleClickTimeoutRef.current);
      }
    };
  }, []);

  useFrame((state, delta) => {
    const current = appearProgressRef.current;
    appearProgressRef.current = current + (1 - current) * 0.05;

    const t = appearProgressRef.current;
    const eased = 1 - Math.pow(1 - t, 3);
    const overshoot = 1 + Math.sin(Math.min(t, 1) * Math.PI) * 0.1;
    const finalScale = Math.max(0.001, eased * overshoot);

    if (movementAlpha > 0) {
      currentPositionRef.current.lerp(targetPositionRef.current, movementAlpha);

      if (
        currentPositionRef.current.distanceToSquared(targetPositionRef.current) <
        0.0001
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
      trailGeometryRef.current.setFromPoints([
        trailStartPositionRef.current,
        currentPositionRef.current,
      ]);

      trailMaterialRef.current.opacity = trailOpacityRef.current * eased;
      trailMaterialRef.current.visible = trailOpacityRef.current > 0;
    }

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
    const lastTap = lastTapRef.current;
    const isDoubleClick =
      !!lastTap &&
      lastTap.topicId === topic.topic_id &&
      now - lastTap.time <= 260;

    if (isDoubleClick) {
      clearPendingSingleClick();
      lastTapRef.current = null;
      runDoubleClick();
      return;
    }

    lastTapRef.current = {
      time: now,
      topicId: topic.topic_id,
    };

    clearPendingSingleClick();
    singleClickTimeoutRef.current = window.setTimeout(() => {
      runSingleClick();
      singleClickTimeoutRef.current = null;
    }, 260);
  }

  const showProbeMarker =
    !!topicProbe && (isFocused || isSelected) && isSceneSettled;

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
            />
          </mesh>

          <TopicLabel
            topic={topic}
            isSelected={isSelected}
            isFocused={isFocused}
            isAppearing={isAppearing}
            isSceneSettled={isSceneSettled}
            isAnyTopicFocused={isAnyTopicFocused}
            isEnteringProbe={isEnteringProbe}
            worldPositionRef={currentPositionRef}
            visualRadius={visualRadius}
          />

          {topicProbe && (
            <ProbeMarker
              probe={topicProbe}
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
  onCameraMotionChange,
}: {
  topics: LearningSpaceTopic[];
  selectedTopicId: string | null;
  focusedTopicId: string | null;
  arrivalMode: SceneArrivalMode;
  controlsRef: RefObject<TrackballControlsRef | null>;
  isEnteringProbe: boolean;
  probeEntryTopicId: string | null;
  onProbeEntryComplete: () => void;
  onCameraMotionChange?: (moving: boolean) => void;
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

    if (isEnteringProbe && probeEntryTopicId) {
      const topic = getTopicById(topics, probeEntryTopicId);
      if (!topic) {
        previousFocusedTopicIdRef.current = focusedTopicId;
        return;
      }

      const target = getTopicPositionVector(topic);
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

      const target = getTopicPositionVector(topic);
      const topicPositionKey = getTopicPositionKey(topic);

      const focusTargetChanged =
        lastHandledFocusedTopicIdRef.current !== focusedTopicId;
      const arrivalChanged = lastHandledArrivalModeRef.current !== arrivalMode;
      const focusPositionChanged =
        lastHandledFocusedTopicPositionKeyRef.current !== null &&
        lastHandledFocusedTopicPositionKeyRef.current !== topicPositionKey &&
        desiredTarget.current.distanceTo(target) >= CAMERA_TETHER_MIN_TOPIC_MOVE;

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

      const target = getTopicPositionVector(topic);
      const topicPositionKey = getTopicPositionKey(topic);

      const selectedTargetChanged =
        lastHandledSelectedTopicIdRef.current !== selectedTopicId;
      const selectedPositionChanged =
        lastHandledSelectedTopicPositionKeyRef.current !== null &&
        lastHandledSelectedTopicPositionKeyRef.current !== topicPositionKey &&
        desiredTarget.current.distanceTo(target) >= CAMERA_TETHER_MIN_TOPIC_MOVE;

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
  ]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (targetAnimatingRef.current) {
      controls.target.lerp(desiredTarget.current, currentTargetAlphaRef.current);

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
      setCameraMoving(false);

      if (pendingProbeEntryCompleteRef.current) {
        pendingProbeEntryCompleteRef.current = false;
        onProbeEntryComplete();
      }
    }
  });

  return null;
}

type SpaceCanvasProps = {
  learningSpace: LearningSpace;
  selectedTopicId: string | null;
  focusedTopicId: string | null;
  arrivalMode?: SceneArrivalMode;
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

  const [appearingTopicIds, setAppearingTopicIds] = useState<Set<string>>(
    new Set(),
  );
  const [isUserControlling, setIsUserControlling] = useState(false);
  const [isCameraInMotion, setIsCameraInMotion] = useState(false);
  const [isSceneSettled, setIsSceneSettled] = useState(true);

  const topicIdsKey = useMemo(
    () => learningSpace.topics.map((topic) => topic.topic_id).join("|"),
    [learningSpace.topics],
  );

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
    const isMoving = isUserControlling || isCameraInMotion || isEnteringProbe;

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
  }, [isUserControlling, isCameraInMotion, isEnteringProbe]);

  return (
    <section
      className="relative h-full w-full overflow-hidden bg-black"
      onPointerLeave={() => {
        document.body.style.cursor = "default";
      }}
    >
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 46], fov: 50 }}>
          <color attach="background" args={["#000000"]} />

          <ambientLight intensity={1.1} />
          <directionalLight position={[5, 5, 5]} intensity={1.4} />
          <pointLight position={[-4, -2, 4]} intensity={1.2} />

          <Stars
            radius={390}
            depth={210}
            count={5200}
            factor={3.25}
            saturation={0}
            fade
            speed={0.24}
          />

          {learningSpace.topics.map((topic) => {
            const topicProbe =
              availableProbe &&
              availableProbe.topicId === topic.topic_id &&
              availableProbe.status === "available"
                ? availableProbe
                : null;

            return (
              <TopicSphere
                key={topic.topic_id}
                topic={topic}
                isSelected={topic.topic_id === selectedTopicId}
                isFocused={topic.topic_id === focusedTopicId}
                focusedTopicId={focusedTopicId}
                topicProbe={topicProbe}
                isAppearing={appearingTopicIds.has(topic.topic_id)}
                isSceneSettled={isSceneSettled}
                isEnteringProbe={isEnteringProbe}
                onSelect={(id) => onSelectTopic(id)}
                onFocusTopic={(id) => onFocusTopicChange?.(id)}
                onUnfocus={() => onFocusTopicChange?.(null)}
                onOpenProbe={onOpenProbe}
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
            onCameraMotionChange={setIsCameraInMotion}
          />

          <TrackballControls
            ref={controlsRef}
            noPan
            minDistance={0.06}
            maxDistance={180}
            rotateSpeed={3.2}
            zoomSpeed={1.2}
            dynamicDampingFactor={0.12}
            onStart={() => {
              setIsUserControlling(true);
            }}
            onEnd={() => {
              setIsUserControlling(false);
            }}
          />
        </Canvas>
      </div>

      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-500 ${
          isEnteringProbe ? "opacity-100" : "opacity-0"
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
              Send a message to begin, and your first topic sphere will form here.
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
