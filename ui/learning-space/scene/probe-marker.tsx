"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { LearningSpaceTopic } from "@/types/learning-space";
import type { ProbeSummary } from "@/ui/learning-space/probes/probe-surface";
import { stableHash } from "./geometry-utils";
import {
  PROBE_ICON_BASE_SCALE,
  PROBE_ICON_FOCUSED_SCALE,
  PROBE_ICON_RENDER_ORDER,
  PROBE_ICON_SURFACE_OFFSET,
  PROBE_MARKER_DEFAULT_NORMAL,
} from "./constants";

export function getProbeMarkerSurfaceNormal(topic: LearningSpaceTopic) {
  const marker = topic.surface_markers.find(
    (candidate) => candidate.marker_type === "probe_available",
  );
  const normalHint = marker?.surface_anchor.normal_hint;

  if (
    Array.isArray(normalHint) &&
    normalHint.length === 3 &&
    normalHint.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
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

export function getProbeMarkerPreview(topic: LearningSpaceTopic) {
  return topic.surface_markers.find(
    (marker) =>
      marker.marker_type === "probe_available" && marker.visible_by_default,
  )?.preview;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getRecord(value: unknown, key: string): Record<string, unknown> | null {
  const record = asRecord(value);
  return asRecord(record?.[key]);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readProbeTypeFromSnapshot(snapshot: unknown): string | null {
  const direct = asRecord(snapshot);

  if (!direct) return null;

  return (
    getString(direct.probe_type) ??
    getString(direct.probeType) ??
    getString(direct.expected_attempt_type) ??
    getString(direct.expectedAttemptType) ??
    getString(getRecord(direct, "engine_renderable_probe")?.probe_type) ??
    getString(getRecord(direct, "engine_renderable_probe")?.expected_attempt_type) ??
    getString(getRecord(direct, "probe_contract_output")?.probe_type) ??
    getString(getRecord(direct, "probe_contract_output")?.expected_attempt_type) ??
    null
  );
}

function thumbnailStyleFromProbeType(
  probeType: string | null,
): ProbeMarkerThumbnailStyle | null {
  const normalized = probeType?.trim().toLowerCase();

  if (!normalized) return null;

  if (
    normalized === "single_choice" ||
    normalized === "multi_choice" ||
    normalized === "multiple_choice" ||
    normalized === "discriminate"
  ) {
    return "choice_card";
  }

  if (
    normalized === "drag_drop_placements" ||
    normalized === "drag_drop_match" ||
    normalized === "interactive_action"
  ) {
    return "drag_drop_card";
  }

  if (
    normalized === "sequence" ||
    normalized === "ordered_items" ||
    normalized === "simulation" ||
    normalized === "transform"
  ) {
    return "simulation_card";
  }

  if (
    normalized === "slider" ||
    normalized === "numeric" ||
    normalized === "predict" ||
    normalized === "slider_prediction"
  ) {
    return "slider_card";
  }

  if (normalized === "graph" || normalized === "graph_relationship") {
    return "graph_card";
  }

  if (
    normalized === "audio" ||
    normalized === "audio_clip_question" ||
    normalized === "audio_response_question" ||
    normalized === "audio_response"
  ) {
    return "audio_card";
  }

  if (
    normalized === "video" ||
    normalized === "video_click_interval" ||
    normalized === "video_explanation" ||
    normalized === "video_checkpoint"
  ) {
    return "video_card";
  }

  if (
    normalized === "explain" ||
    normalized === "apply_transfer" ||
    normalized === "text"
  ) {
    return "text_card";
  }

  return null;
}

function getContractDrivenProbeThumbnailStyle(args: {
  probe: ProbeSummary;
  topic: LearningSpaceTopic;
}): ProbeMarkerThumbnailStyle {
  /**
   * Prefer the actual delivered probe. The surface marker remains useful as a
   * fallback, but it should not override the contract that the learner will
   * actually answer after the triple-click entry.
   */
  const contractProbeType =
    args.probe.engineRenderableProbe?.probe_type ??
    args.probe.engineRenderableProbe?.expected_attempt_type ??
    readProbeTypeFromSnapshot(args.probe.probeContractSnapshot) ??
    args.probe.probeType ??
    args.probe.expectedResponseType ??
    null;

  const contractStyle = thumbnailStyleFromProbeType(contractProbeType);

  if (contractStyle) return contractStyle;

  const previewStyle = getProbeMarkerPreview(args.topic)?.thumbnail_style;

  if (previewStyle) return previewStyle;

  return getDebugProbeThumbnailStyle(args.topic);
}

export type ProbeMarkerPreview = NonNullable<
  LearningSpaceTopic["surface_markers"][number]["preview"]
>;
export type ProbeMarkerThumbnailStyle = ProbeMarkerPreview["thumbnail_style"];

export function getDebugProbeThumbnailStyle(topic: LearningSpaceTopic) {
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

export function getProbeThumbnailIcon(thumbnailStyle: ProbeMarkerThumbnailStyle) {
  switch (thumbnailStyle) {
    case "choice_card":
      return "choice";
    case "drag_drop_card":
      return "drag";
    case "slider_card":
      return "slider";
    case "graph_card":
      return "graph";
    case "video_card":
      return "video";
    case "audio_card":
      return "audio";
    case "simulation_card":
      return "simulation";
    case "text_card":
      return "text";
    case "generic_card":
    default:
      return "generic";
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

function drawProbeIcon(args: {
  context: CanvasRenderingContext2D;
  icon: string;
  width: number;
  height: number;
}) {
  const { context, icon, width, height } = args;
  const cx = width / 2;
  const cy = height / 2;
  const scale = width / 256;

  context.clearRect(0, 0, width, height);

  const halo = context.createRadialGradient(cx, cy, width * 0.06, cx, cy, width * 0.46);
  halo.addColorStop(0, "rgba(255,255,255,0.34)");
  halo.addColorStop(0.55, "rgba(255,255,255,0.12)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(255,255,255,0.94)";
  context.fillStyle = "rgba(255,255,255,0.94)";
  context.shadowColor = "rgba(255,255,255,0.72)";
  context.shadowBlur = 14 * scale;
  context.lineWidth = 8 * scale;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (icon === "text") {
    drawRoundedRect(context, cx - 58 * scale, cy - 42 * scale, 116 * scale, 72 * scale, 22 * scale);
    context.stroke();
    context.beginPath();
    context.moveTo(cx - 18 * scale, cy + 30 * scale);
    context.lineTo(cx, cy + 52 * scale);
    context.lineTo(cx + 18 * scale, cy + 30 * scale);
    context.stroke();
    [-18, 6, 30].forEach((y, index) => {
      const lineWidth = index === 1 ? 68 : 84;
      context.beginPath();
      context.moveTo(cx - (lineWidth / 2) * scale, cy + y * scale);
      context.lineTo(cx + (lineWidth / 2) * scale, cy + y * scale);
      context.stroke();
    });
  } else if (icon === "choice") {
    const cells = [
      [-34, -32, "A"],
      [34, -32, "B"],
      [-34, 36, "C"],
      [34, 36, "D"],
    ] as const;
    context.font = `700 ${24 * scale}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    cells.forEach(([dx, dy, label], index) => {
      context.beginPath();
      context.arc(cx + dx * scale, cy + dy * scale, 24 * scale, 0, Math.PI * 2);
      if (index === 1) context.fill();
      else context.stroke();
      context.save();
      context.shadowBlur = 0;
      context.fillStyle = index === 1 ? "rgba(17,24,39,0.96)" : "rgba(255,255,255,0.94)";
      context.fillText(label, cx + dx * scale, cy + dy * scale + 1 * scale);
      context.restore();
    });
  } else if (icon === "slider") {
    [-34, 0, 34].forEach((dy, index) => {
      context.beginPath();
      context.moveTo(cx - 62 * scale, cy + dy * scale);
      context.lineTo(cx + 62 * scale, cy + dy * scale);
      context.stroke();
      const knobX = cx + [-18, 34, 4][index] * scale;
      drawRoundedRect(context, knobX - 13 * scale, cy + dy * scale - 20 * scale, 26 * scale, 40 * scale, 13 * scale);
      context.fill();
    });
  } else if (icon === "graph") {
    context.beginPath();
    context.moveTo(cx - 58 * scale, cy - 52 * scale);
    context.lineTo(cx - 58 * scale, cy + 54 * scale);
    context.lineTo(cx + 62 * scale, cy + 54 * scale);
    context.stroke();
    const points = [
      [cx - 38 * scale, cy + 32 * scale],
      [cx - 8 * scale, cy - 10 * scale],
      [cx + 24 * scale, cy + 8 * scale],
      [cx + 52 * scale, cy - 36 * scale],
    ];
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) context.lineTo(x, y);
    context.stroke();
    points.forEach(([x, y]) => {
      context.beginPath();
      context.arc(x, y, 6 * scale, 0, Math.PI * 2);
      context.fill();
    });
  } else if (icon === "audio") {
    for (let index = 0; index < 9; index += 1) {
      const x = cx - 52 * scale + index * 13 * scale;
      const h = (14 + Math.abs(Math.sin(index * 1.35)) * 34) * scale;
      context.beginPath();
      context.moveTo(x, cy - h);
      context.lineTo(x, cy + h);
      context.stroke();
    }
  } else if (icon === "video") {
    drawRoundedRect(context, cx - 60 * scale, cy - 42 * scale, 120 * scale, 84 * scale, 18 * scale);
    context.stroke();
    context.beginPath();
    context.moveTo(cx - 14 * scale, cy - 22 * scale);
    context.lineTo(cx - 14 * scale, cy + 22 * scale);
    context.lineTo(cx + 28 * scale, cy);
    context.closePath();
    context.fill();
  } else if (icon === "simulation") {
    drawRoundedRect(context, cx - 66 * scale, cy - 48 * scale, 132 * scale, 96 * scale, 18 * scale);
    context.stroke();
    [cx - 34 * scale, cx, cx + 34 * scale].forEach((x, index) => {
      context.beginPath();
      context.arc(x, cy - 8 * scale, 14 * scale, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(x, cy - 8 * scale);
      context.lineTo(x + (index - 1) * 7 * scale, cy - 20 * scale);
      context.stroke();
    });
    context.beginPath();
    context.moveTo(cx - 46 * scale, cy + 30 * scale);
    context.lineTo(cx - 16 * scale, cy + 10 * scale);
    context.stroke();
    context.beginPath();
    context.arc(cx - 12 * scale, cy + 8 * scale, 8 * scale, 0, Math.PI * 2);
    context.fill();
  } else if (icon === "drag") {
    drawRoundedRect(context, cx - 62 * scale, cy - 22 * scale, 38 * scale, 38 * scale, 10 * scale);
    context.fill();
    context.setLineDash([10 * scale, 8 * scale]);
    drawRoundedRect(context, cx + 24 * scale, cy - 44 * scale, 42 * scale, 42 * scale, 10 * scale);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(cx - 16 * scale, cy - 2 * scale);
    context.bezierCurveTo(cx + 0 * scale, cy - 52 * scale, cx + 42 * scale, cy - 52 * scale, cx + 46 * scale, cy - 2 * scale);
    context.stroke();
  } else {
    context.beginPath();
    context.arc(cx, cy, 48 * scale, 0, Math.PI * 2);
    context.stroke();
    context.font = `800 ${76 * scale}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("?", cx, cy + 2 * scale);
  }

  context.restore();
}

function createProbeIconTexture(icon: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const context = canvas.getContext("2d");
  if (!context) return null;

  drawProbeIcon({
    context,
    icon,
    width: canvas.width,
    height: canvas.height,
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function ProbeMarker({
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
  /**
   * The marker remains visual-only. The underlying topic sphere keeps normal
   * click/double-click/triple-click behavior, including probe entry. The probe
   * prop is still used as the visual source of truth so the icon cannot drift
   * back to a generic/text preview while a real contract-backed probe exists.
   */
  void onOpenProbe;

  const { camera } = useThree();
  const spriteRef = useRef<THREE.Sprite>(null);
  const topicWorldPositionRef = useRef(new THREE.Vector3());
  const cameraFacingNormalRef = useRef(new THREE.Vector3());
  const parentWorldQuaternionRef = useRef(new THREE.Quaternion());
  const localFacingNormalRef = useRef(new THREE.Vector3());

  const thumbnailStyle = getContractDrivenProbeThumbnailStyle({
    probe,
    topic,
  });
  const icon = getProbeThumbnailIcon(thumbnailStyle);

  const texture = useMemo(() => createProbeIconTexture(icon), [icon]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  /**
   * Initial fallback before the first frame updates the marker. After that, the
   * sprite is projected onto the camera-facing hemisphere every frame.
   */
  const initialPosition = useMemo(
    () =>
      PROBE_MARKER_DEFAULT_NORMAL.clone().multiplyScalar(
        visualRadius * PROBE_ICON_SURFACE_OFFSET,
      ),
    [visualRadius],
  );

  /**
   * Make the probe icon feel painted onto the full visible face of the sphere.
   *
   * The old version used a fixed surface normal, so the marker could sit on one
   * side of the topic. This version computes the world-space direction from the
   * topic center to the camera, converts that direction into the marker parent's
   * local space, and places the sprite on that front-facing hemisphere. Because
   * Three sprites already billboard toward the camera, the icon remains upright
   * while its position stays attached to the apparent face of the sphere.
   */
  useFrame(() => {
    const sprite = spriteRef.current;
    const parent = sprite?.parent;

    if (!sprite || !parent) return;

    parent.getWorldPosition(topicWorldPositionRef.current);

    cameraFacingNormalRef.current.subVectors(
      camera.position,
      topicWorldPositionRef.current,
    );

    if (cameraFacingNormalRef.current.lengthSq() < 0.0001) {
      cameraFacingNormalRef.current.copy(PROBE_MARKER_DEFAULT_NORMAL);
    } else {
      cameraFacingNormalRef.current.normalize();
    }

    parent.getWorldQuaternion(parentWorldQuaternionRef.current);

    localFacingNormalRef.current
      .copy(cameraFacingNormalRef.current)
      .applyQuaternion(parentWorldQuaternionRef.current.invert())
      .normalize();

    sprite.position.copy(
      localFacingNormalRef.current.multiplyScalar(
        visualRadius * PROBE_ICON_SURFACE_OFFSET,
      ),
    );

    const iconScale =
      visualRadius *
      (isVisible ? PROBE_ICON_FOCUSED_SCALE : PROBE_ICON_BASE_SCALE);

    sprite.scale.set(iconScale, iconScale, 1);
  });

  const iconScale =
    visualRadius *
    (isVisible ? PROBE_ICON_FOCUSED_SCALE : PROBE_ICON_BASE_SCALE);

  return (
    <sprite
      ref={spriteRef}
      position={initialPosition}
      scale={[iconScale, iconScale, 1]}
      renderOrder={PROBE_ICON_RENDER_ORDER}
      visible={isVisible}
      raycast={() => null}
    >
      <spriteMaterial
        map={texture ?? undefined}
        transparent
        opacity={isVisible ? 0.94 : 0}
        depthWrite={false}
        depthTest
        toneMapped={false}
      />
    </sprite>
  );
}
