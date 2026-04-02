"use client";

import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Float, Html, Stars, TrackballControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { LearningSpace, LearningSpaceTopic } from "@/types/learning-space";
import type { ProbeSummary } from "@/components/probes/probe-surface";

type ControlsLike = {
  enabled: boolean;
  target: THREE.Vector3;
  update?: () => void;
};

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

function TopicLabel({
  topic,
  isSelected,
  isFocused,
  isAppearing,
}: {
  topic: LearningSpaceTopic;
  isSelected: boolean;
  isFocused: boolean;
  isAppearing: boolean;
}) {
  const { camera } = useThree();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const topicPosition = useMemo(
    () => new THREE.Vector3(...topic.position),
    [topic.position]
  );

  const directionToTopic = useMemo(() => new THREE.Vector3(), []);
  const cameraForward = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const el = containerRef.current;
    if (!el) return;

    const distance = camera.position.distanceTo(topicPosition);

    directionToTopic.subVectors(topicPosition, camera.position).normalize();
    camera.getWorldDirection(cameraForward);

    const facingScore = cameraForward.dot(directionToTopic);

    let targetOpacity = 0;

    if (isFocused) {
      targetOpacity = 1;
    } else if (isSelected) {
      targetOpacity = 0.95;
    } else if (isAppearing) {
      targetOpacity = 0.88;
    } else if (facingScore > 0.965 && distance < 9) {
      targetOpacity = 0.88;
    } else if (facingScore > 0.92 && distance < 7.8) {
      targetOpacity = 0.42;
    } else {
      targetOpacity = 0;
    }

    const current = Number(el.style.opacity || 0);
    const next = current + (targetOpacity - current) * 0.12;
    el.style.opacity = `${next}`;
  });

  return (
    <Html
      position={[0, -1.35 * topic.render_state.radius, 0]}
      center
      distanceFactor={10}
      style={{ pointerEvents: "none" }}
    >
      <div
        ref={containerRef}
        style={{ opacity: isSelected || isFocused ? 1 : 0 }}
        className={`rounded-full border px-3 py-1 text-xs backdrop-blur transition-colors ${
          isFocused || isSelected
            ? "border-purple-300/40 bg-purple-400/20 text-white"
            : "border-white/10 bg-black/65 text-zinc-200"
        }`}
      >
        {getTopicDisplayLabel(topic)}
      </div>
    </Html>
  );
}

function ProbeBadge({
  topic,
  probe,
  isVisible,
  onOpenProbe,
}: {
  topic: LearningSpaceTopic;
  probe: ProbeSummary;
  isVisible: boolean;
  onOpenProbe: (probe: ProbeSummary) => void;
}) {
  return (
    <Html
      position={[0, topic.render_state.radius * 1.38, 0]}
      center
      distanceFactor={10}
      style={{
        pointerEvents: isVisible ? "auto" : "none",
        opacity: isVisible ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenProbe(probe);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        className="rounded-full border border-purple-300/45 bg-purple-500/25 px-3 py-1 text-[11px] font-medium text-white shadow-[0_0_18px_rgba(168,85,247,0.32)] backdrop-blur-md transition hover:bg-purple-500/35"
      >
        Start probe
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

  const showProbeBadge = !!topicProbe && (isFocused || isSelected);

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
        />

        {topicProbe && (
          <ProbeBadge
            topic={topic}
            probe={topicProbe}
            isVisible={showProbeBadge}
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
  controlsRef,
  isEnteringProbe,
  probeEntryTopicId,
  onProbeEntryComplete,
}: {
  topics: LearningSpaceTopic[];
  selectedTopicId: string | null;
  focusedTopicId: string | null;
  controlsRef: React.RefObject<ControlsLike | null>;
  isEnteringProbe: boolean;
  probeEntryTopicId: string | null;
  onProbeEntryComplete: () => void;
}) {
  const { camera } = useThree();

  const desiredCameraPosition = useRef(new THREE.Vector3(0, 0, 8));
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));

  const restoreCameraPositionRef = useRef(new THREE.Vector3(0, 0, 8));
  const restoreTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const previousFocusedTopicIdRef = useRef<string | null>(null);

  const cameraAnimatingRef = useRef(false);
  const targetAnimatingRef = useRef(false);
  const pendingProbeEntryCompleteRef = useRef(false);

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
      const probeEntryDistance = Math.max(0.16, topic.render_state.radius * 0.46);

      desiredTarget.current.copy(target);
      desiredCameraPosition.current.copy(
        target.clone().add(currentDirection.multiplyScalar(probeEntryDistance))
      );

      pendingProbeEntryCompleteRef.current = true;
      cameraAnimatingRef.current = true;
      targetAnimatingRef.current = true;
      controls.enabled = false;
      previousFocusedTopicIdRef.current = focusedTopicId;
      return;
    }

    if (isFocused && !wasFocused) {
      restoreCameraPositionRef.current.copy(camera.position);

      const focusedTopic = getTopicById(topics, focusedTopicId);
      if (focusedTopic) {
        restoreTargetRef.current.set(...focusedTopic.position);
      } else {
        restoreTargetRef.current.copy(controls.target);
      }
    }

    if (!isFocused && wasFocused) {
      desiredCameraPosition.current.copy(restoreCameraPositionRef.current);
      desiredTarget.current.copy(restoreTargetRef.current);

      pendingProbeEntryCompleteRef.current = false;
      cameraAnimatingRef.current = true;
      targetAnimatingRef.current = true;
      controls.enabled = false;
      previousFocusedTopicIdRef.current = focusedTopicId;
      return;
    }

    if (focusedTopicId) {
      const topic = getTopicById(topics, focusedTopicId);
      if (!topic) {
        previousFocusedTopicIdRef.current = focusedTopicId;
        return;
      }

      const target = new THREE.Vector3(...topic.position);
      const focusDistance = Math.max(4.1, topic.render_state.radius * 3.7);

      desiredTarget.current.copy(target);
      desiredCameraPosition.current.copy(
        target.clone().add(currentDirection.multiplyScalar(focusDistance))
      );

      pendingProbeEntryCompleteRef.current = false;
      cameraAnimatingRef.current = true;
      targetAnimatingRef.current = true;
      controls.enabled = false;
      previousFocusedTopicIdRef.current = focusedTopicId;
      return;
    }

    if (selectedTopicId) {
      const topic = getTopicById(topics, selectedTopicId);
      if (!topic) {
        previousFocusedTopicIdRef.current = focusedTopicId;
        return;
      }

      const target = new THREE.Vector3(...topic.position);

      desiredTarget.current.copy(target);

      pendingProbeEntryCompleteRef.current = false;
      targetAnimatingRef.current = true;
      cameraAnimatingRef.current = false;
      previousFocusedTopicIdRef.current = focusedTopicId;
      return;
    }

    desiredTarget.current.set(0, 0, 0);
    desiredCameraPosition.current.set(0, 0, 8);

    pendingProbeEntryCompleteRef.current = false;
    cameraAnimatingRef.current = true;
    targetAnimatingRef.current = true;
    controls.enabled = false;
    previousFocusedTopicIdRef.current = focusedTopicId;
  }, [
    topics,
    selectedTopicId,
    focusedTopicId,
    isEnteringProbe,
    probeEntryTopicId,
    camera,
    controlsRef,
  ]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (targetAnimatingRef.current) {
      const targetAlpha = pendingProbeEntryCompleteRef.current ? 0.14 : 0.1;

      controls.target.lerp(desiredTarget.current, targetAlpha);

      if (controls.target.distanceTo(desiredTarget.current) < 0.01) {
        controls.target.copy(desiredTarget.current);
        targetAnimatingRef.current = false;
      }

      controls.update?.();
    }

    if (!cameraAnimatingRef.current) return;

    const cameraAlpha = pendingProbeEntryCompleteRef.current ? 0.14 : 0.095;

    camera.position.lerp(desiredCameraPosition.current, cameraAlpha);
    controls.target.lerp(desiredTarget.current, cameraAlpha);
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
  availableProbe,
  isEnteringProbe,
  probeEntryTopicId,
  onSelectTopic,
  onFocusTopicChange,
  onOpenProbe,
  onProbeEntryComplete,
  isBootstrappingTopics = false,
}: SpaceCanvasProps) {
  const controlsRef = useRef<ControlsLike | null>(null);
  const seenTopicIdsRef = useRef<Set<string>>(new Set());
  const [appearingTopicIds, setAppearingTopicIds] = useState<Set<string>>(
    new Set()
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
  }, [learningSpace.topics]);

  return (
    <section
      className="relative h-full w-full overflow-hidden bg-black"
      onPointerLeave={() => {
        document.body.style.cursor = "default";
      }}
    >
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
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
            controlsRef={controlsRef}
            isEnteringProbe={isEnteringProbe}
            probeEntryTopicId={probeEntryTopicId}
            onProbeEntryComplete={onProbeEntryComplete}
          />

          <TrackballControls
            ref={controlsRef}
            noPan
            minDistance={0.06}
            maxDistance={12}
            rotateSpeed={3.2}
            zoomSpeed={1.2}
            dynamicDampingFactor={0.12}
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