"use client";

import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { LearningSpaceTopic } from "@/types/learning-space";
import type { ProbeSummary } from "@/ui/learning-space/probes/probe-surface";
import {
  LOCAL_BOB_BASE_SPEED,
  LOCAL_BOB_LERP_ALPHA,
  LOCAL_BOB_SPEED_VARIATION,
  LOCAL_BOB_XZ_FACTOR,
  MOVEMENT_TRAIL_FADE_RATE,
  MOVEMENT_TRAIL_MIN_DISTANCE,
  MOVEMENT_TRAIL_MIN_OPACITY,
  MOVEMENT_TRAIL_TARGET_REACHED_FADE_RATE,
  SHOW_DEBUG_PROBE_THUMBNAILS_FOR_ALL_TOPICS,
  TOPIC_APPEARANCE_LERP_ALPHA,
  TOPIC_APPEARANCE_START_SCALE,
  TOPIC_CLICK_SEQUENCE_MS,
  TOPIC_SPHERE_RENDER_ORDER,
} from "./constants";
import {
  getAnimatedTopicPosition,
  getCollisionSafeBobAmplitude,
  getTopicMovementAlpha,
  getTopicPositionVector,
  getTopicVisualRadius,
  getTrailInitialOpacity,
  stableUnitInterval,
  type AnimatedTopicPositionsRef,
} from "./geometry-utils";
import { MovementTrail } from "./movement-trails";
import { ProbeMarker } from "./probe-marker";
import { TopicLabel } from "./topic-label";
import type {
  PreProbeViewSnapshotRef,
  TrackballControlsRef,
} from "./camera-controller";

export function TopicSphere({
  topic,
  allTopics,
  selectedTopicId,
  isSelected,
  isFocused,
  focusedTopicId,
  topicProbe,
  isAppearing,
  isSceneSettled,
  isProbeVisualSuppressed,
  isProbeLabelSuppressed,
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
  isProbeVisualSuppressed: boolean;
  isProbeLabelSuppressed: boolean;
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
    isEnteringProbe: isProbeVisualSuppressed,
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
      !isProbeVisualSuppressed &&
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
  }, [topic.position, isProbeVisualSuppressed, isFocused, isAnyTopicFocused]);

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

    if (isProbeVisualSuppressed) {
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
        isEnteringProbe: isProbeVisualSuppressed,
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
      /**
       * Keep the solid sphere visually stable.
       *
       * Rotating a MeshStandardMaterial sphere under scene lights can make the
       * specular highlight crawl across the surface like a wave. The clean sphere
       * should stay calm so probe markers and relationship lines can carry the
       * meaning.
       */
      sphereRef.current.rotation.set(0, 0, 0);
    }

    if (materialRef.current) {
      materialRef.current.opacity =
        (isAnyTopicFocused && !isFocused ? 0.46 : 1) * eased;

      /**
       * Keep the physical body clean and readable. Selection/focus still gives a
       * readable lift without competing with probe markers or relationship lines.
       */
      const baseGlow = isFocused ? 0.42 : isSelected ? 0.28 : 0.12;
      const appearanceBoost = isAppearing ? 0.18 * (1 - t) : 0;
      const movementGlow =
        trailOpacityRef.current > 0 && !isAnyTopicFocused ? 0.08 : 0;

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
    !isProbeVisualSuppressed &&
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
            <sphereGeometry args={[1, 72, 72]} />
            <meshStandardMaterial
              ref={materialRef}
              color={isSelected ? "#ddd6fe" : "#b7a8ee"}
              emissive={
                isFocused ? "#a78bfa" : isSelected ? "#8b5cf6" : "#4c3f73"
              }
              emissiveIntensity={isFocused ? 0.42 : isSelected ? 0.28 : 0.12}
              metalness={0}
              roughness={0.88}
              opacity={isAnyTopicFocused && !isFocused ? 0.38 : 0.84}
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
            isEnteringProbe={isProbeLabelSuppressed}
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

