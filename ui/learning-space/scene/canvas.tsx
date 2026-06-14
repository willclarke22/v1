"use client";

import { Canvas } from "@react-three/fiber";
import { Stars, TrackballControls } from "@react-three/drei";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import type {
  LearningSpace,
  LearningSpaceRelationship,
  LearningSpaceTopic,
  RelationshipViewMode,
} from "@/types/learning-space";
import type { ProbeSummary } from "@/ui/learning-space/probes/probe-surface";
import {
  DEFAULT_CAMERA_POSITION, DEFAULT_TARGET, ZOOMED_OUT_DISTANCE, VISUAL_SPACE_SCALE_XZ,
  VISUAL_SPACE_SCALE_Y, RADIAL_EXPANSION_START, RADIAL_EXPANSION_LINEAR_GAIN,
  RADIAL_EXPANSION_CURVE_GAIN, RADIAL_EXPANSION_CURVE_POWER,
  RADIAL_EXPANSION_MAX_BOOST, OVERVIEW_TOPIC_BODY_SCALE, SELECTED_TOPIC_BODY_SCALE,
  FOCUSED_TOPIC_BODY_SCALE, FOCUSED_BACKGROUND_TOPIC_BODY_SCALE,
  FOCUSED_SELECTED_BACKGROUND_TOPIC_BODY_SCALE, SETTLE_DELAY_MS,
  TOPIC_CLICK_SEQUENCE_MS, VIEW_DRAG_LABEL_HIDE_THRESHOLD_PX,
  TOPIC_APPEARANCE_LERP_ALPHA, TOPIC_APPEARANCE_START_SCALE,
  OVERVIEW_TOPIC_POSITION_LERP_ALPHA, FOCUSED_TOPIC_POSITION_LERP_ALPHA,
  BACKGROUND_TOPIC_POSITION_LERP_ALPHA, PROBE_TOPIC_POSITION_LERP_ALPHA,
  MOVEMENT_TRAIL_MIN_DISTANCE, MOVEMENT_TRAIL_FADE_RATE,
  MOVEMENT_TRAIL_TARGET_REACHED_FADE_RATE, MOVEMENT_TRAIL_MIN_OPACITY,
  MOVEMENT_TRAIL_OVERVIEW_OPACITY, MOVEMENT_TRAIL_FOCUSED_OPACITY,
  MOVEMENT_TRAIL_BACKGROUND_OPACITY, CAMERA_TETHER_MIN_TOPIC_MOVE,
  FOCUSED_TOPIC_TETHER_CAMERA_ALPHA, FOCUSED_TOPIC_TETHER_TARGET_ALPHA,
  SELECTED_TOPIC_TETHER_TARGET_ALPHA, LOCAL_BOB_MAX_AMPLITUDE, LOCAL_BOB_RESERVE_USAGE,
  LOCAL_BOB_MIN_RESERVE, LOCAL_BOB_XZ_FACTOR, LOCAL_BOB_LERP_ALPHA,
  LOCAL_BOB_BASE_SPEED, LOCAL_BOB_SPEED_VARIATION, LABEL_HIDE_SCREEN_RADIUS_PX,
  LABEL_MAX_WIDTH_OVERVIEW, LABEL_MAX_WIDTH_PROMINENT, LABEL_OFFSET_MIN_PX,
  LABEL_OFFSET_MAX_PX, LABEL_OFFSET_SCREEN_RADIUS_MULTIPLIER,
  LABEL_OFFSET_SCREEN_RADIUS_BIAS_PX, LABEL_OFFSET_CURRENT_TOPIC_EXTRA_PX,
  SEMANTIC_RELATIONSHIP_ARC_SEGMENTS, SEMANTIC_RELATIONSHIP_ARC_MIN_OPACITY,
  SEMANTIC_RELATIONSHIP_ARC_BASE_OPACITY,
  SEMANTIC_RELATIONSHIP_ARC_FOCUSED_OPACITY_BOOST,
  SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MIN,
  SEMANTIC_RELATIONSHIP_ARC_HOVERLESS_LIFT_MAX,
  SEMANTIC_RELATIONSHIP_ARC_LIFT_DISTANCE_FACTOR,
  SEMANTIC_RELATIONSHIP_MIN_SCREEN_DISTANCE_PX,
  SEMANTIC_RELATIONSHIP_MAX_SCREEN_FRACTION, LABEL_OCCLUSION_RADIUS_MULTIPLIER,
  LABEL_OCCLUSION_DEPTH_PADDING, LABEL_OCCLUSION_FADE_BAND,
  LABEL_OCCLUSION_MAX_OPACITY_MULTIPLIER, LABEL_OCCLUSION_SCREEN_RADIUS_MULTIPLIER,
  LABEL_OCCLUSION_SCREEN_PADDING_PX, LABEL_OCCLUSION_SCREEN_FADE_BAND_PX,
  LABEL_OCCLUSION_SCREEN_HARD_CORE_MULTIPLIER, LABEL_DISTANCE_FADE_NEAR_MULTIPLIER,
  LABEL_DISTANCE_FADE_FAR_MULTIPLIER, LABEL_DISTANCE_FADE_BACKGROUND_MIN_OPACITY,
  LABEL_DISTANCE_FADE_CURRENT_MIN_OPACITY, LABEL_CURRENT_MIN_OPACITY_WHEN_VISIBLE,
  VIEWPOINT_SCANNER_RELATIONSHIP_MAX_COUNT, VIEWPOINT_SCANNER_SETTLE_MS,
  VIEWPOINT_SCANNER_CORRIDOR_RADIUS_PX, VIEWPOINT_SCANNER_CORE_RADIUS_PX,
  VIEWPOINT_SCANNER_MAX_SCREEN_FRACTION, VIEWPOINT_SCANNER_FAR_CORRIDOR_MIN_SCORE,
  VIEWPOINT_SCANNER_MIN_SCORE, VIEWPOINT_SCANNER_ACTIVE_TOPIC_BIAS,
  RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MIN, RELATIONSHIP_ARC_DEFAULT_TUBE_RADIUS_MAX,
  RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MIN, RELATIONSHIP_ARC_SCANNER_TUBE_RADIUS_MAX,
  RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MIN,
  RELATIONSHIP_ARC_SETTLED_SCAN_TUBE_RADIUS_MAX, RELATIONSHIP_ARC_TUBE_RADIAL_SEGMENTS,
  RELATIONSHIP_ARC_TUBE_SEGMENTS, RELATIONSHIP_ARC_ENDPOINT_COLOR_BLEND_FRACTION,
  VIEWPOINT_SCANNER_BLUE, CONFUSION_SIGNAL_RELATIONSHIP_RED,
  INSIGHT_SIGNAL_RELATIONSHIP_GREEN, RELATIONSHIP_VIEW_MODE_ARC_MAX_COUNT,
  SHOW_DEBUG_PROBE_THUMBNAILS_FOR_ALL_TOPICS, PROBE_DISPLAY_SPHERE_SCALE,
  PROBE_DISPLAY_GLOW_SCALE, PROBE_DISPLAY_RENDER_ORDER,
  PROBE_DISPLAY_GLOW_RENDER_ORDER, PROBE_DISPLAY_TEXTURE_WIDTH,
  PROBE_DISPLAY_TEXTURE_HEIGHT, PROBE_DISPLAY_GLOW_OPACITY,
  PROBE_DISPLAY_FRONT_ROTATION_Y, PROBE_EXIT_CAMERA_ALPHA, PROBE_EXIT_TARGET_ALPHA,
  PROBE_MARKER_DEFAULT_NORMAL, RELATIONSHIP_DEFAULT_ENDPOINT_ACTIVE_COLOR,
  RELATIONSHIP_DEFAULT_ENDPOINT_BACKGROUND_COLOR, TOPIC_SPHERE_RENDER_ORDER,
  RELATIONSHIP_ENDPOINT_STENCIL_RENDER_ORDER, RELATIONSHIP_ARC_RENDER_ORDER,
  RELATIONSHIP_STENCIL_REF_MIN, RELATIONSHIP_STENCIL_REF_MAX,
} from "./constants";

import {
  getAnimatedTopicPosition,
  getCollisionSafeBobAmplitude,
  getCurrentViewDirection,
  getProjectedScreenPoint,
  getScreenSpaceRadiusPx,
  getTopicCameraRadius,
  getTopicDepthFadeMultiplier,
  getTopicMovementAlpha,
  getTopicPositionKey,
  getTopicPositionVector,
  getTopicVisualRadius,
  getTrailInitialOpacity,
  stableHash,
  stableUnitInterval,
  clampOpacity,
  type AnimatedTopicPositionsRef,
} from "./geometry-utils";

import { getDebugProbeThumbnailStyle } from "./probe-marker";

import { getTopicDisplayLabel } from "./topic-label";
import { TopicSphere } from "./topic-sphere";
import {
  CameraController,
  type PreProbeViewSnapshot,
  type PreProbeViewSnapshotRef,
  type SceneArrivalMode,
  type TrackballControlsRef,
} from "./camera-controller";
import {
  SemanticRelationshipArc,
  ViewpointRelationshipScanner,
  areStringArraysEqual,
  getRelationshipByIdMap,
  getRelationshipListFromIds,
  getRelationshipSortScore,
  relationshipMatchesViewMode,
  relationshipTouchesTopic,
  shouldShowRelationshipOnFocus,
  type RelationshipArcVariant,
} from "./relationship-arcs";

type RelationshipDisplayMode = "default_mode" | "scanning" | "settled_scan";

function buildDebugProbeSummaryForTopic(topic: LearningSpaceTopic): ProbeSummary {
  const label = getTopicDisplayLabel(topic);
  const style = getDebugProbeThumbnailStyle(topic);

  return {
    id: `debug-probe-${topic.topic_id}`,
    topicId: topic.topic_id,
    topicLabel: label,
    title: "Probe check",
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
  isProbeSurfaceActive?: boolean;
  probeEntryTopicId: string | null;
  onSelectTopic: (id: string | null) => void;
  onFocusTopicChange?: (topicId: string | null) => void;
  onOpenProbe: (probe: ProbeSummary) => void;
  onProbeEntryComplete: () => void;
  onProbeExitRestoreStart?: () => void;
  onProbeExitRestoreComplete?: () => void;
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
  isProbeSurfaceActive = false,
  probeEntryTopicId,
  onSelectTopic,
  onFocusTopicChange,
  onOpenProbe,
  onProbeEntryComplete,
  onProbeExitRestoreStart,
  onProbeExitRestoreComplete,
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

  /**
   * Probe state is intentionally split into separate meanings:
   *
   * - isProbeImmersiveActive suppresses probe-surface visuals only while the
   *   learner is entering or actually inside the probe.
   * - isProbeTransitionActive is reserved for camera/panel restore bookkeeping.
   *   Do not use it to hide the visible Learning Space during exit.
   *
   * This prevents probe exit from looking like the whole Learning Space reloads:
   * sphere bodies, probe thumbnails, relationship lines, and topic labels are
   * allowed to remain stable/visible as soon as the probe surface closes.
   */
  const isProbeImmersiveActive = isEnteringProbe || isProbeSurfaceActive;
  const isProbeTransitionActive = isProbeImmersiveActive || isProbeExitAnimating;

  /**
   * Exit should feel like moving back out into the existing map, not like a
   * reload. Therefore visual suppression stops as soon as the probe surface
   * closes. The exit flag can keep panels/camera bookkeeping alive, but it does
   * not hide labels, relationship lines, sphere colors, or probe thumbnails.
   */
  const suppressLearningSpaceOverlaysForProbe = isProbeImmersiveActive;

  /**
   * Keep the safety state and the visual veil state separate.
   *
   * isProbeTransitionActive is still useful for knowing that the camera is
   * restoring from a probe, but it should not blank labels, relationship lines,
   * sphere colors, or probe thumbnails. On exit, the purple veil fades
   * immediately so the learner can see the already-mounted Learning Space during
   * the motion instead of after the motion.
   */
  const probeVeilOpacityClassName = isProbeImmersiveActive
    ? "opacity-100 duration-300 ease-out"
    : isProbeExitAnimating
      ? "opacity-0 duration-500 ease-out"
      : "opacity-0 duration-500 ease-out";

  useEffect(() => {
    if (isProbeImmersiveActive && isProbeExitAnimating) {
      setIsProbeExitAnimating(false);
      onProbeExitRestoreComplete?.();
    }
  }, [
    isProbeImmersiveActive,
    isProbeExitAnimating,
    onProbeExitRestoreComplete,
  ]);

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
          gl={{ stencil: true, antialias: true, powerPreference: "high-performance" }}
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
            isEnteringProbe={suppressLearningSpaceOverlaysForProbe}
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
                isEnteringProbe={suppressLearningSpaceOverlaysForProbe}
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
                isProbeVisualSuppressed={isProbeImmersiveActive}
                isProbeLabelSuppressed={suppressLearningSpaceOverlaysForProbe}
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
            isProbeImmersiveActive={isProbeImmersiveActive}
            probeEntryTopicId={probeEntryTopicId}
            onProbeEntryComplete={onProbeEntryComplete}
            onProbeExitRestoreStart={() => {
              setIsProbeExitAnimating(true);
              onProbeExitRestoreStart?.();
            }}
            onProbeExitRestoreComplete={() => {
              setIsProbeExitAnimating(false);
              onProbeExitRestoreComplete?.();
            }}
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
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity ${probeVeilOpacityClassName} bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.92)_0%,rgba(101,45,175,0.98)_42%,rgba(26,6,46,1)_100%)]`}
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

