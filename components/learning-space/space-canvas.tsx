"use client";

import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Float, Html, Stars, TrackballControls } from "@react-three/drei";
import {
  useEffect,
  useRef,
  useState,
  type ElementRef,
} from "react";
import * as THREE from "three";
import type { LearningSpace, LearningSpaceTopic } from "@/types/learning-space";
import type { ProbeSummary } from "@/components/probes/probe-surface";

type TrackballControlsRef = ElementRef<typeof TrackballControls>;
type SceneArrivalMode = "warp" | "focus";

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 0, 10.5);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);
const ZOOMED_OUT_DISTANCE = 10.5;
const SETTLE_DELAY_MS = 220;

function getTopicById(
  topics: LearningSpaceTopic[],
  topicId: string | null
): LearningSpaceTopic | null {
  if (!topicId) return null;
  return topics.find((topic) => topic.topic_id === topicId) ?? null;
}

function getCurrentViewDirection(
  camera: THREE.Camera,
  currentTarget: THREE.Vector3
) {
  const direction = new THREE.Vector3().subVectors(
    camera.position,
    currentTarget
  );

  if (direction.lengthSq() === 0) {
    direction.set(0, 0, 1);
  }

  return direction.normalize();
}

function getTopicDisplayLabel(topic: LearningSpaceTopic) {
  return topic.label ?? topic.topic_name ?? "Untitled Topic";
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

function TopicLabel({
  topic,
  isSelected,
  isFocused,
  isAppearing,
  isSceneSettled,
}: {
  topic: LearningSpaceTopic;
  isSelected: boolean;
  isFocused: boolean;
  isAppearing: boolean;
  isSceneSettled: boolean;
}) {
  const { camera, size } = useThree();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topicPositionRef = useRef(new THREE.Vector3(...topic.position));

  useEffect(() => {
    topicPositionRef.current.set(...topic.position);
  }, [topic.position]);

  useFrame(() => {
    const el = containerRef.current;
    if (!el) return;

    const shouldShow =
      isSceneSettled && (isSelected || isFocused || isAppearing);

    const screenRadiusPx = getScreenSpaceRadiusPx({
      camera,
      size,
      worldPosition: topicPositionRef.current,
      worldRadius: topic.render_state.radius,
    });

    const labelOffsetPx = Math.min(
      52,
      Math.max(18, screenRadiusPx * 0.55 + 10)
    );

    const targetOpacity = shouldShow ? 1 : 0;
    const targetScale = shouldShow ? 1 : 0.96;
    const targetBlur = shouldShow ? 0 : 3;
    const targetYOffset = shouldShow ? -labelOffsetPx : -(labelOffsetPx - 6);

    el.style.opacity = `${targetOpacity}`;
    el.style.filter = `blur(${targetBlur}px)`;
    el.style.transform = `translate3d(0, ${targetYOffset}px, 0) scale(${targetScale})`;
  });

  return (
    <Html
      position={[0, 0, 0]}
      center
      distanceFactor={10}
      style={{
        pointerEvents: "none",
      }}
    >
      <div
        ref={containerRef}
        style={{
          opacity: 0,
          transform: "translate3d(0, -18px, 0) scale(0.96)",
          filter: "blur(3px)",
          transition:
            "opacity 180ms ease, transform 220ms ease, filter 220ms ease",
          willChange: "transform, opacity, filter",
        }}
        className={`rounded-full border px-3 py-1 text-[11px] backdrop-blur-md ${
          isFocused || isSelected
            ? "border-purple-300/40 bg-purple-400/18 text-white shadow-[0_0_24px_rgba(168,85,247,0.12)]"
            : "border-white/10 bg-black/55 text-zinc-200"
        }`}
      >
        {getTopicDisplayLabel(topic)}
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

function TopicSphere({
  topic,
  isSelected,
  isFocused,
  focusedTopicId,
  topicProbe,
  isAppearing,
  isSceneSettled,
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
  onSelect: (id: string) => void;
  onFocusTopic: (id: string) => void;
  onUnfocus: () => void;
  onOpenProbe: (probe: ProbeSummary) => void;
}) {
  const isAnyTopicFocused = focusedTopicId !== null;

  const groupRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const appearProgressRef = useRef(isAppearing ? 0 : 1);

  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );
  const lastTapRef = useRef<{ time: number; topicId: string } | null>(null);
  const singleClickTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    appearProgressRef.current = isAppearing ? 0 : 1;
  }, [isAppearing, topic.topic_id]);

  useEffect(() => {
    return () => {
      if (singleClickTimeoutRef.current !== null) {
        window.clearTimeout(singleClickTimeoutRef.current);
      }
    };
  }, []);

  useFrame((_, delta) => {
    const current = appearProgressRef.current;
    appearProgressRef.current = current + (1 - current) * 0.05;

    const t = appearProgressRef.current;
    const eased = 1 - Math.pow(1 - t, 3);
    const overshoot = 1 + Math.sin(Math.min(t, 1) * Math.PI) * 0.1;
    const finalScale = Math.max(0.001, eased * overshoot);

    if (groupRef.current) {
      groupRef.current.scale.setScalar(finalScale);
    }

    if (sphereRef.current) {
      sphereRef.current.rotation.y += delta * (isFocused ? 0.34 : 0.18);
    }

    if (materialRef.current) {
      materialRef.current.opacity =
        (isAnyTopicFocused && !isFocused ? 0.72 : 1) * eased;

      const baseGlow = isFocused ? 1.45 : isSelected ? 1.05 : 0.35;
      const appearanceBoost = isAppearing ? 0.5 * (1 - t) : 0;

      materialRef.current.emissiveIntensity =
        (baseGlow + appearanceBoost) * (0.35 + eased * 0.65);
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
    <Float speed={1.25} rotationIntensity={0.32} floatIntensity={0.78}>
      <group ref={groupRef} position={topic.position}>
        <mesh
          ref={sphereRef}
          scale={topic.render_state.radius}
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
            opacity={isAnyTopicFocused && !isFocused ? 0.72 : 1}
            transparent
          />
        </mesh>

        <TopicLabel
          topic={topic}
          isSelected={isSelected}
          isFocused={isFocused}
          isAppearing={isAppearing}
          isSceneSettled={isSceneSettled}
        />

        {topicProbe && (
          <ProbeMarker
            probe={topicProbe}
            isVisible={showProbeMarker}
            onOpenProbe={onOpenProbe}
          />
        )}
      </group>
    </Float>
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
  controlsRef: React.RefObject<TrackballControlsRef | null>;
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

      const target = new THREE.Vector3(...topic.position);
      const probeEntryDistance = Math.max(
        0.16,
        topic.render_state.radius * 0.46
      );

      desiredTarget.current.copy(target);
      desiredCameraPosition.current.copy(
        target.clone().add(currentDirection.multiplyScalar(probeEntryDistance))
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
      return;
    }

    if (!isFocused && wasFocused) {
      const outwardDirection = getCurrentViewDirection(camera, currentTarget);
      const zoomOutTarget = currentTarget.clone();
      const zoomOutDistance = Math.max(
        ZOOMED_OUT_DISTANCE,
        currentTarget.length() + 6
      );

      desiredTarget.current.copy(zoomOutTarget);
      desiredCameraPosition.current.copy(
        zoomOutTarget
          .clone()
          .add(outwardDirection.multiplyScalar(zoomOutDistance))
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
      return;
    }

    if (focusedTopicId) {
      const topic = getTopicById(topics, focusedTopicId);
      if (!topic) {
        previousFocusedTopicIdRef.current = focusedTopicId;
        return;
      }

      const focusTargetChanged =
        lastHandledFocusedTopicIdRef.current !== focusedTopicId;
      const arrivalChanged =
        lastHandledArrivalModeRef.current !== arrivalMode;

      if (focusTargetChanged || arrivalChanged) {
        const target = new THREE.Vector3(...topic.position);

        if (arrivalMode === "warp") {
          const warpDistance = Math.max(5.2, topic.render_state.radius * 4.6);
          desiredTarget.current.copy(target);
          desiredCameraPosition.current.copy(
            target.clone().add(currentDirection.multiplyScalar(warpDistance))
          );
          currentCameraAlphaRef.current = 0.125;
          currentTargetAlphaRef.current = 0.13;
        } else {
          const focusDistance = Math.max(4.1, topic.render_state.radius * 3.7);
          desiredTarget.current.copy(target);
          desiredCameraPosition.current.copy(
            target.clone().add(currentDirection.multiplyScalar(focusDistance))
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
        return;
      }
    }

    if (selectedTopicId) {
      const topic = getTopicById(topics, selectedTopicId);
      if (!topic) {
        previousFocusedTopicIdRef.current = focusedTopicId;
        return;
      }

      const selectedTargetChanged =
        lastHandledSelectedTopicIdRef.current !== selectedTopicId;

      if (selectedTargetChanged) {
        const target = new THREE.Vector3(...topic.position);

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
        return;
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
      currentCameraAlphaRef.current
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
    new Set()
  );
  const [isUserControlling, setIsUserControlling] = useState(false);
  const [isCameraInMotion, setIsCameraInMotion] = useState(false);
  const [isSceneSettled, setIsSceneSettled] = useState(true);

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
  }, [learningSpace.topics]);

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
        <Canvas camera={{ position: [0, 0, 10.5], fov: 50 }}>
          <color attach="background" args={["#000000"]} />

          <ambientLight intensity={1.1} />
          <directionalLight position={[5, 5, 5]} intensity={1.4} />
          <pointLight position={[-4, -2, 4]} intensity={1.2} />

          <Stars
            radius={80}
            depth={40}
            count={2500}
            factor={3}
            saturation={0}
            fade
            speed={0.35}
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
            maxDistance={18}
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