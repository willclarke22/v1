"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import type { LearningSpaceTopic } from "@/types/learning-space";
import {
  LABEL_HIDE_SCREEN_RADIUS_PX,
  LABEL_MAX_WIDTH_OVERVIEW,
  LABEL_MAX_WIDTH_PROMINENT,
  LABEL_OFFSET_MIN_PX,
  LABEL_OFFSET_MAX_PX,
  LABEL_OFFSET_SCREEN_RADIUS_MULTIPLIER,
  LABEL_OFFSET_SCREEN_RADIUS_BIAS_PX,
  LABEL_OFFSET_CURRENT_TOPIC_EXTRA_PX,
  LABEL_OCCLUSION_RADIUS_MULTIPLIER,
  LABEL_OCCLUSION_DEPTH_PADDING,
  LABEL_OCCLUSION_FADE_BAND,
  LABEL_OCCLUSION_MAX_OPACITY_MULTIPLIER,
  LABEL_OCCLUSION_SCREEN_RADIUS_MULTIPLIER,
  LABEL_OCCLUSION_SCREEN_PADDING_PX,
  LABEL_OCCLUSION_SCREEN_FADE_BAND_PX,
  LABEL_OCCLUSION_SCREEN_HARD_CORE_MULTIPLIER,
  LABEL_CURRENT_MIN_OPACITY_WHEN_VISIBLE,
} from "./constants";
import {
  getAnimatedTopicPosition,
  getProjectedScreenPoint,
  getScreenSpaceRadiusPx,
  getTopicDepthFadeMultiplier,
  getTopicVisualRadius,
  type AnimatedTopicPositionsRef,
} from "./geometry-utils";

export function getTopicDisplayLabel(topic: LearningSpaceTopic) {
  return topic.topic_label.trim() || "Untitled Topic";
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


export function TopicLabel({
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
