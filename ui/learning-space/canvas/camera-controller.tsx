"use client";

import { TrackballControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useRef,
  type ElementRef,
  type RefObject,
} from "react";
import * as THREE from "three";
import type { LearningSpaceTopic } from "@/types/learning-space";
import {
  CAMERA_TETHER_MIN_TOPIC_MOVE,
  DEFAULT_CAMERA_POSITION,
  DEFAULT_TARGET,
  FOCUSED_TOPIC_TETHER_CAMERA_ALPHA,
  FOCUSED_TOPIC_TETHER_TARGET_ALPHA,
  PROBE_EXIT_CAMERA_ALPHA,
  PROBE_EXIT_TARGET_ALPHA,
  SELECTED_TOPIC_TETHER_TARGET_ALPHA,
  ZOOMED_OUT_DISTANCE,
} from "./constants";
import {
  getAnimatedTopicPosition,
  getCurrentViewDirection,
  getTopicCameraRadius,
  getTopicPositionKey,
  type AnimatedTopicPositionsRef,
} from "./geometry-utils";

export type TrackballControlsRef = ElementRef<typeof TrackballControls>;
export type SceneArrivalMode = "warp" | "focus";
export type PreProbeViewSnapshot = {
  cameraPosition: THREE.Vector3;
  cameraQuaternion: THREE.Quaternion;
  cameraUp: THREE.Vector3;
  cameraZoom: number;
  target: THREE.Vector3;
  capturedAt: number;
};
export type PreProbeViewSnapshotRef = { current: PreProbeViewSnapshot | null };

function getTopicById(
  topics: LearningSpaceTopic[],
  topicId: string | null,
): LearningSpaceTopic | null {
  if (!topicId) return null;
  return topics.find((topic) => topic.topic_id === topicId) ?? null;
}

export function CameraController({
  topics,
  selectedTopicId,
  focusedTopicId,
  arrivalMode,
  controlsRef,
  isEnteringProbe,
  isProbeImmersiveActive,
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
  isProbeImmersiveActive: boolean;
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
  const previousIsProbeImmersiveActiveRef = useRef(false);
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
    const wasProbeImmersiveActive = previousIsProbeImmersiveActiveRef.current;
    previousIsEnteringProbeRef.current = isEnteringProbe;
    previousIsProbeImmersiveActiveRef.current = isProbeImmersiveActive;

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

    if (wasProbeImmersiveActive && !isProbeImmersiveActive) {
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
    isProbeImmersiveActive,
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
    if (!isProbeImmersiveActive && !isRestoringPreProbeViewRef.current) {
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
