"use client";

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, type CSSProperties, type ChangeEvent, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoEvents,
  directorCapabilityDemoShot,
  type DirectorCapability,
} from "../director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CAST,
  directorQualificationCastSlot,
  directorQualificationMountedCameraHostSuitability,
  type DirectorQualificationCastSlot,
  type DirectorQualificationCastSlotId,
} from "../director-qualification-cast";
import {
  DIRECTOR_QUALIFICATION_COVERAGE_VERSION,
  DIRECTOR_QUALIFICATION_DECISION_LABELS,
  DIRECTOR_QUALIFICATION_SCHEMA_VERSION,
  emptyDirectorQualificationState,
  normalizeDirectorQualificationState,
  qualificationReviewForCapability,
  type DirectorQualificationCoverageMode,
  type DirectorQualificationDecision,
  type DirectorQualificationCoverageGap,
  type DirectorQualificationPassKind,
  type DirectorQualificationPhysicalRegionOverride,
  type DirectorQualificationPhysicalResolutionEvidence,
  type DirectorQualificationRecordingManifest,
  type DirectorQualificationRunAsset,
  type DirectorQualificationRunClip,
  type DirectorQualificationState,
} from "../director-qualification-contract";
import {
  DIRECTOR_QUALIFICATION_CAMPAIGN_FAMILY_STATUS_LABELS,
  DIRECTOR_QUALIFICATION_CAMPAIGN_STORAGE_KEY,
  directorQualificationCampaignCounts,
  directorQualificationCampaignFamilyRecord,
  emptyDirectorQualificationCampaignState,
  markDirectorQualificationCampaignFamilyReviewed,
  markDirectorQualificationCampaignNeedsReEvidence,
  markDirectorQualificationCampaignReviewInProgress,
  nextDirectorQualificationCampaignFamilyKey,
  normalizeDirectorQualificationCampaignState,
  recordDirectorQualificationCampaignEvidence,
  setDirectorQualificationCampaignCurrentFamily,
  updateDirectorQualificationCampaignFamilyNotes,
  type DirectorQualificationCampaignState,
} from "../director-qualification-campaign";
import {
  DIRECTOR_QUALIFICATION_CAPTURE_FPS,
  DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX,
  DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND,
  DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX,
  DIRECTOR_QUALIFICATION_COMPLETE_HOLD_MS,
  DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
  DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS,
  buildDirectorQualificationEvidenceZip,
  evaluateDirectorQualificationEvidenceIntegrity,
  directorQualificationEvidenceSlug,
  downloadDirectorQualificationEvidence,
  measureDirectorQualificationRecordingDurationMs,
  selectDirectorQualificationRecordingMimeType,
  type DirectorQualificationEvidenceFrameTiming,
  type DirectorQualificationEvidenceSummary,
} from "../director-qualification-evidence";
import {
  buildDirectorQualificationVp8WebM,
  type DirectorQualificationVp8Chunk,
} from "../director-qualification-deterministic-webm";
import {
  buildActiveDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  type DirectorQualificationFamily,
} from "../director-qualification-families";
import {
  directorQualificationAdjustDepthScreenFixturePositions,
  directorQualificationAdjustDetailRelationshipFixturePositions,
  directorQualificationAdjustLensPerspectiveFixturePositions,
  directorQualificationAdjustOrbitRevealFixturePositions,
  directorQualificationAdjustOrbitRevealNormalization,
  directorQualificationAdjustRelativeActorFixturePositions,
  directorQualificationAssetRoles,
  directorQualificationOrbitRevealSupportingCastSlot,
  isLensPerspectiveQualificationCapability,
  isSupportContainmentQualificationFamily,
} from "../director-qualification-fixture-policy";
import {
  directorQualificationEffectiveRenderScale,
  directorQualificationRenderedWorldSize,
} from "../director-qualification-render-geometry";
import {
  inspectDirectorQualificationPhysicalAsset,
  type DirectorQualificationPhysicalInspection,
} from "../director-qualification-physical-inspection";
import {
  DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS,
  DIRECTOR_QUALIFICATION_INSIDE_SOURCE_SCAN_LIMIT,
  DIRECTOR_QUALIFICATION_INSIDE_VALIDATION_FIXTURES,
  DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT,
  DIRECTOR_QUALIFICATION_SUPPORT_CONTAINMENT_INSPECTION_LIMIT,
  directorQualificationAdaptiveContainmentClearance,
  directorQualificationContainedSourceFitFloor,
  directorQualificationFindInsideValidationAsset,
  directorQualificationInsidePairIndex,
  directorQualificationInsidePairKey,
  directorQualificationInsideValidationFixtureForPass,
  directorQualificationOnSurfacePairIndex,
  directorQualificationSelectDistinctInsidePairs,
  directorQualificationSelectDistinctOnSurfacePairs,
  directorQualificationSupportReceiverLooksGroundLike,
  directorQualificationSupportSurfaceIsPerceptuallyEligible,
} from "../director-qualification-support-containment-policy";
import {
  normalizeAssetForDirectorQualification,
  type DirectorQualificationAssetNormalization,
  type DirectorQualificationNormalizationPolicy,
  type DirectorQualificationRoleKind,
} from "../director-qualification-normalization";
import {
  DIRECTOR_QUALIFICATION_SCENES,
  directorQualificationScene,
  type DirectorQualificationScene,
  type DirectorQualificationSceneId,
} from "../director-qualification-scenes";
import { directorVisualAuditDefinition } from "../director-visual-audit";
import { logicalAssetSizeDecision } from "../../assets/logical-asset-size";
import { buildAssetDirectabilityProfile } from "../../directability/asset-directability-from-asset";
import {
  resolveDirectorPhysicalBlockingPlacement,
} from "../../scenes/ui/director-shot-runtime";
import {
  DirectorCapabilityPreview,
  directorQualificationRuntimeActors,
  type DirectorLibraryAsset,
  type ResolvedDirectorRole,
} from "./director-capability-preview";
import { DirectorLibraryTabs } from "./director-library-tabs";
import { directorRealAssetBrowserUrl } from "./director-real-asset-browser";

type Props = {
  onOpenCapabilities: () => void;
  assets: DirectorLibraryAsset[];
  assetsLoaded: boolean;
  assetsLoading: boolean;
  assetError: string | null;
  onRequestAssets: () => void;
};

type CastPoolResolution = {
  slot: DirectorQualificationCastSlot;
  baseline: DirectorLibraryAsset | null;
  candidates: DirectorLibraryAsset[];
};

type PlannedRole = {
  role: string;
  cast_slot_id: DirectorQualificationCastSlotId;
  asset: DirectorLibraryAsset;
  normalization: DirectorQualificationAssetNormalization;
  blocking_position: [number, number, number];
  rotation: [number, number, number];
  facing_correction_degrees: number;
  physical_region_override: DirectorQualificationPhysicalRegionOverride | null;
};

type PlannedClip = {
  capability: DirectorCapability;
  primary_cast_slot_id: DirectorQualificationCastSlotId;
  pass_kind: DirectorQualificationPassKind;
  normalization_policy: DirectorQualificationNormalizationPolicy;
  evidence_block_label: string | null;
  qualification_note: string | null;
  merge_compare_with_capability_id: string | null;
  relationship_direction_degrees: number | null;
  travel_direction: "forward" | "reverse" | null;
  roles: PlannedRole[];
};

type ReelPhase = "idle" | "slate" | "playing" | "gap" | "complete";

type QualificationPhaseClock = {
  started_at_ms: number | null;
  elapsed_before_start_ms: number;
};

type EvidenceCapturePhase =
  | "idle"
  | "arming"
  | "recording"
  | "rendering"
  | "packaging"
  | "downloaded"
  | "error";

type QualificationCaptureTrack = MediaStreamTrack & {
  requestFrame?: () => void;
};

type ActiveEvidenceCapture = {
  recorder: MediaRecorder;
  stream: MediaStream;
  video_track: QualificationCaptureTrack;
  capture_canvas: HTMLCanvasElement;
  source_canvas: HTMLCanvasElement;
  chunks: Blob[];
  manifest: DirectorQualificationRecordingManifest;
  started_at: string;
  started_performance_ms: number;
  reel_started_performance_ms: number | null;
  evidence_window_stopped_performance_ms: number | null;
  reel_time_zero_recording_offset_ms: number;
  warmup_scheduled_frame_count: number;
  warmup_submitted_frame_count: number;
  warmup_missed_frame_count: number;
  warmup_largest_submission_gap_ms: number;
  mime_type: string;
  canvas_width_px: number;
  canvas_height_px: number;
  source_canvas_width_px: number;
  source_canvas_height_px: number;
  scheduled_frame_count: number;
  submitted_frame_count: number;
  missed_frame_count: number;
  max_consecutive_missed_frames: number;
  current_consecutive_missed_frames: number;
  largest_submission_gap_ms: number;
  last_submission_performance_ms: number | null;
  completion_frame_captured: boolean;
  capture_schedule_started_performance_ms: number | null;
  next_capture_sequence_index: number;
  frame_timing: DirectorQualificationEvidenceFrameTiming[];
  compositor_timer_id: number | null;
  cancelled: boolean;
};


type DeterministicEvidenceFrameState = {
  clip_index: number;
  phase: ReelPhase;
  progress: number;
  reel_elapsed_ms: number;
};

type DeterministicRenderRequest = () => Promise<void>;

type WebCodecsEncodedVideoChunkLike = {
  readonly byteLength: number;
  readonly timestamp: number;
  readonly duration: number | null;
  readonly type: "key" | "delta";
  copyTo(destination: ArrayBuffer | ArrayBufferView): void;
};

type WebCodecsVideoEncoderLike = {
  readonly encodeQueueSize: number;
  configure(config: Record<string, unknown>): void;
  encode(frame: unknown, options?: { keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
};

type WebCodecsVideoEncoderConstructor = {
  new (init: {
    output: (chunk: WebCodecsEncodedVideoChunkLike) => void;
    error: (error: DOMException) => void;
  }): WebCodecsVideoEncoderLike;
  isConfigSupported(
    config: Record<string, unknown>,
  ): Promise<{ supported?: boolean; config?: Record<string, unknown> }>;
};

type WebCodecsVideoFrameLike = {
  close(): void;
};

type WebCodecsVideoFrameConstructor = new (
  source: CanvasImageSource,
  init: { timestamp: number; duration?: number },
) => WebCodecsVideoFrameLike;

type DeterministicEvidenceDrawContext = Pick<
  ActiveEvidenceCapture,
  "capture_canvas" | "manifest" | "reel_started_performance_ms" | "completion_frame_captured"
>;

const QUALIFICATION_STORAGE_KEY =
  "myway_director_qualification_phase1b7a_v1";
const QUALIFICATION_CAST_STORAGE_KEY =
  "myway_director_qualification_cast_phase1b7a_v1";
const SLATE_MS = 900;
const GAP_MS = 500;
const QUALIFICATION_PREVIEW_FPS = 30;
const QUALIFICATION_PREVIEW_FRAME_MS = 1000 / QUALIFICATION_PREVIEW_FPS;
// A.11A.27: prepare large real-asset reels with backpressure. One GLTF is allowed
// to fetch/parse/upload at a time, and a stalled Suspense load must become an
// explicit retryable preparation error instead of freezing the Room indefinitely.
const QUALIFICATION_SINGLE_FLIGHT_PRELOAD_TIMEOUT_MS = 25_000;
// Module-lived so tab remounts do not forget which Qualification GLTF URLs are resident.
const QUALIFICATION_RESIDENT_GLTF_URLS = new Map<string, string>();
// A.11A.14: browser physical inspection is substantially heavier than simple
// metadata planning. Cache each exact GLB+rotation inspection across Room
// remounts so revisiting Support & containment does not repeatedly parse and
// raycast the same receiver.
const QUALIFICATION_PHYSICAL_INSPECTION_CACHE = new Map<
  string,
  Promise<DirectorQualificationPhysicalInspection | null>
>();

function directorQualificationPhysicalInspectionCacheKey(
  asset: DirectorLibraryAsset,
) {
  return [
    directorRealAssetBrowserUrl(asset),
    ...(asset.default_rotation ?? [0, 0, 0]),
  ].join("|");
}

function inspectDirectorQualificationPhysicalAssetCached(
  asset: DirectorLibraryAsset,
) {
  const key = directorQualificationPhysicalInspectionCacheKey(asset);
  const cached = QUALIFICATION_PHYSICAL_INSPECTION_CACHE.get(key);
  if (cached) return cached;

  const pending = inspectDirectorQualificationPhysicalAsset({
    public_url: directorRealAssetBrowserUrl(asset),
    default_rotation: asset.default_rotation,
  }).catch((error) => {
    // A transient failure should be retryable rather than permanently poisoning
    // the module-lived cache.
    QUALIFICATION_PHYSICAL_INSPECTION_CACHE.delete(key);
    throw error;
  });
  QUALIFICATION_PHYSICAL_INSPECTION_CACHE.set(key, pending);
  return pending;
}

function stoppedPhaseClock(
  elapsedBeforeStartMs = 0,
): QualificationPhaseClock {
  return {
    started_at_ms: null,
    elapsed_before_start_ms: Math.max(0, elapsedBeforeStartMs),
  };
}

function runningPhaseClock(
  elapsedBeforeStartMs = 0,
): QualificationPhaseClock {
  return {
    started_at_ms: performance.now(),
    elapsed_before_start_ms: Math.max(0, elapsedBeforeStartMs),
  };
}

function elapsedPhaseClockMs(
  clock: QualificationPhaseClock,
  now = performance.now(),
) {
  return (
    clock.elapsed_before_start_ms +
    (clock.started_at_ms === null ? 0 : Math.max(0, now - clock.started_at_ms))
  );
}

const PASS_LABELS: Record<DirectorQualificationPassKind, string> = {
  baseline: "Stable baseline",
  diversity: "Rotating diversity",
  physical_stress: "Physical-size stress",
};

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function assetSearchText(asset: DirectorLibraryAsset) {
  return normalized(
    [
      asset.asset_id,
      asset.canonical_label,
      asset.verified_canonical_label,
      asset.display_name,
      asset.requested_concept,
      asset.source_display_name,
      ...(asset.aliases ?? []),
      ...(asset.verified_aliases ?? []),
      ...(asset.semantic_tags ?? []),
      ...(asset.preferred_for_concepts ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function assetLabel(asset: DirectorLibraryAsset) {
  return asset.display_name || asset.canonical_label || asset.asset_id;
}

const DIRECTOR_QUALIFICATION_CONTAINER_SEMANTIC_HINTS = new Set([
  "container",
  "fillable",
  "vessel",
  "cup",
  "bowl",
  "pot",
  "bucket",
  "basket",
  "bin",
  "jar",
  "vase",
  "box",
  "bathtub",
  "tub",
]);

function directorQualificationHasContainerSemantics(asset: DirectorLibraryAsset) {
  const words = new Set(assetSearchText(asset).split(/\s+/).filter(Boolean));
  return [...DIRECTOR_QUALIFICATION_CONTAINER_SEMANTIC_HINTS].some((hint) =>
    words.has(hint),
  );
}

function directorQualificationContainmentOverrideFromInspection(
  asset: DirectorLibraryAsset,
  inspection: DirectorQualificationPhysicalInspection | null | undefined,
): DirectorQualificationPhysicalRegionOverride | null {
  if (
    !inspection?.top_opening ||
    !inspection.containment_topology ||
    !directorQualificationHasContainerSemantics(asset)
  ) {
    return null;
  }
  const cavity = inspection.containment_topology;
  if (
    cavity.method !== "raycast_open_cavity" ||
    !cavity.center_access_clear ||
    cavity.access_clear_ratio < 0.52 ||
    cavity.opening_occupancy_ratio < 0.72 ||
    cavity.cavity_depth_m <= 0
  ) {
    return null;
  }

  // A.11A.9 predecessor evidence label retained for lineage/static verification:
  // semantic_plus_browser_geometry. A.11A.10 requires semantic truth PLUS
  // ray-confirmed access and cavity depth before positive containment can exist.
  return {
    kind: "containment_region",
    id: "qualification_semantic_raycast_open_cavity",
    label: "Semantic container + ray-confirmed open cavity",
    local_center: [...cavity.local_center],
    size: [...cavity.size],
    access_direction: [...cavity.access_direction],
    confidence: cavity.confidence,
    openness: "open",
    evidence_source: "semantic_plus_browser_raycast_topology",
    topology: {
      method: "raycast_open_cavity",
      sampled_ray_count: cavity.sampled_ray_count,
      accessible_ray_count: cavity.accessible_ray_count,
      access_clear_ratio: cavity.access_clear_ratio,
      center_access_clear: cavity.center_access_clear,
      cavity_depth_m: cavity.cavity_depth_m,
      opening_size: [...cavity.opening_size],
      opening_occupancy_ratio: cavity.opening_occupancy_ratio,
    },
  } satisfies DirectorQualificationPhysicalRegionOverride;
}

function directorQualificationContactOverridesFromInspection(
  inspection: DirectorQualificationPhysicalInspection | null | undefined,
): DirectorQualificationPhysicalRegionOverride[] {
  const output: DirectorQualificationPhysicalRegionOverride[] = [];
  for (const candidate of inspection?.surface_contact_candidates ?? []) {
    const topology = candidate.topology;
    if (
      candidate.evidence_method !== "raycast_contiguous_patch" ||
      topology.method !== "raycast_contiguous_patch" ||
      !topology.center_hit ||
      topology.occupancy_ratio < 0.68
    ) {
      continue;
    }

    // A.11A.9 predecessor evidence label retained for lineage/static verification:
    // browser_gltf_surface_sample. A.11A.10 positive Attached-To proof is stricter.
    const override = {
      kind: "surface_contact_region",
      id: candidate.id,
      label: candidate.label,
      local_position: [...candidate.local_position],
      local_normal: [...candidate.local_normal],
      size: [...candidate.contact_size],
      confidence: candidate.confidence,
      evidence_source: "browser_gltf_raycast_surface",
      topology: {
        method: "raycast_contiguous_patch",
        side: candidate.side,
        occupancy_ratio: topology.occupancy_ratio,
        contiguous_cell_count: topology.contiguous_cell_count,
        tested_cell_count: topology.tested_cell_count,
        center_hit: topology.center_hit,
        depth_variation_m: topology.depth_variation_m,
        normal_alignment: topology.normal_alignment,
        center_height_ratio: topology.center_height_ratio,
      },
    } satisfies DirectorQualificationPhysicalRegionOverride;
    output.push(override);
  }
  return output;
}

function directorQualificationAttachedProofReadabilityScore(
  regionOverride: DirectorQualificationPhysicalRegionOverride,
) {
  if (
    regionOverride.kind !== "surface_contact_region" ||
    regionOverride.topology?.method !== "raycast_contiguous_patch"
  ) {
    return 0;
  }
  const topology = regionOverride.topology;
  // The demo camera is three-quarter-front. Prefer a real front/right patch when
  // available so contact is seen obliquely rather than hidden on the far face.
  const cameraFacingBonus =
    topology.side === "front" || topology.side === "right" ? 26 : 0;
  // Do not ban lower-body contact; merely stop a pedestal/leg patch from
  // outranking a comparably strong broad body/backrest patch in visual proof.
  const heightReadability =
    topology.center_height_ratio < 0.22
      ? -34
      : topology.center_height_ratio >= 0.36
        ? 12
        : 0;
  return (
    cameraFacingBonus +
    heightReadability +
    topology.occupancy_ratio * 24 +
    topology.normal_alignment * 10
  );
}

function directorQualificationDirectabilityOverride(
  asset: DirectorLibraryAsset,
  regionOverride: DirectorQualificationPhysicalRegionOverride | null,
) {
  if (!regionOverride) return undefined;
  const base = buildAssetDirectabilityProfile(asset);
  if (regionOverride.kind === "support_surface") {
    return {
      ...base,
      surfaces: [
        {
          id: regionOverride.id,
          semantic_names: [
            "support_surface",
            "top_surface",
            regionOverride.label,
          ],
          local_center: [...regionOverride.local_center] as [number, number, number],
          normal: [...regionOverride.normal] as [number, number, number],
          size: [...regionOverride.size] as [number, number],
          usable_size: [...regionOverride.usable_size] as [number, number],
          clearance_above_m: regionOverride.clearance_above_m ?? null,
          blocked_fraction: regionOverride.blocked_fraction ?? 0,
          exposure: regionOverride.exposure ?? "exterior",
          orientation: regionOverride.orientation ?? "upward",
          openness: regionOverride.openness ?? "open",
          vertical_rank: regionOverride.vertical_rank ?? 0,
          height_ratio: regionOverride.height_ratio ?? null,
          is_primary: true,
          source: "geometry_profile" as const,
          confidence: regionOverride.confidence,
        },
      ],
    };
  }
  if (regionOverride.kind === "surface_contact_region") {
    return {
      ...base,
      anchors: [
        ...base.anchors.filter((anchor) => anchor.kind !== "attachment"),
        {
          id: regionOverride.id,
          semantic_names: ["surface_contact", "exterior_contact", regionOverride.label],
          kind: "attachment" as const,
          local_position: [...regionOverride.local_position] as [number, number, number],
          local_normal: [...regionOverride.local_normal] as [number, number, number],
          target_scope: "root" as const,
          subpart_id: null,
          source: "geometry_profile" as const,
          confidence: regionOverride.confidence,
          contact_size: [...regionOverride.size] as [number, number],
        },
      ],
    };
  }
  return {
    ...base,
    containment_regions: [
      {
        id: regionOverride.id,
        semantic_names: [
          "containment_region",
          "fillable_region",
          "semantic_container_with_measured_opening",
        ],
        local_center: [...regionOverride.local_center] as [number, number, number],
        size: [...regionOverride.size] as [number, number, number],
        access_direction: [...regionOverride.access_direction] as [number, number, number],
        source: "geometry_profile" as const,
        confidence: regionOverride.confidence,
        openness: "open" as const,
        exposure: "interior" as const,
      },
    ],
  };
}


type QualificationCaptureTimelineState = {
  phase: "arming" | "slate" | "playing" | "gap" | "complete";
  clip: DirectorQualificationRunClip | null;
  elapsed_ms: number;
};

function qualificationCaptureTimelineState(
  active: DeterministicEvidenceDrawContext,
  now: number,
  reelElapsedOverrideMs?: number,
): QualificationCaptureTimelineState {
  if (typeof reelElapsedOverrideMs === "number") {
    const elapsedMs = Math.max(0, reelElapsedOverrideMs);
    if (elapsedMs >= active.manifest.estimated_recording_duration_ms) {
      return { phase: "complete", clip: null, elapsed_ms: elapsedMs };
    }

    for (const clip of active.manifest.clips) {
      const relativeMs = elapsedMs - clip.recording_start_offset_ms;
      if (relativeMs < 0) break;
      if (relativeMs < clip.slate_ms) {
        return { phase: "slate", clip, elapsed_ms: elapsedMs };
      }
      if (relativeMs < clip.slate_ms + clip.duration_ms) {
        return { phase: "playing", clip, elapsed_ms: elapsedMs };
      }
      if (relativeMs < clip.slate_ms + clip.duration_ms + clip.gap_ms) {
        return { phase: "gap", clip, elapsed_ms: elapsedMs };
      }
    }

    return { phase: "complete", clip: null, elapsed_ms: elapsedMs };
  }

  if (
    active.reel_started_performance_ms === null ||
    now < active.reel_started_performance_ms
  ) {
    return { phase: "arming", clip: null, elapsed_ms: 0 };
  }

  const elapsedMs = Math.max(0, now - active.reel_started_performance_ms);
  if (elapsedMs >= active.manifest.estimated_recording_duration_ms) {
    return { phase: "complete", clip: null, elapsed_ms: elapsedMs };
  }

  for (const clip of active.manifest.clips) {
    const relativeMs = elapsedMs - clip.recording_start_offset_ms;
    if (relativeMs < 0) break;
    if (relativeMs < clip.slate_ms) {
      return { phase: "slate", clip, elapsed_ms: elapsedMs };
    }
    if (relativeMs < clip.slate_ms + clip.duration_ms) {
      return { phase: "playing", clip, elapsed_ms: elapsedMs };
    }
    if (relativeMs < clip.slate_ms + clip.duration_ms + clip.gap_ms) {
      return { phase: "gap", clip, elapsed_ms: elapsedMs };
    }
  }

  return { phase: "complete", clip: null, elapsed_ms: elapsedMs };
}

function deterministicEvidenceFrameState(
  manifest: DirectorQualificationRecordingManifest,
  reelElapsedMs: number,
): DeterministicEvidenceFrameState {
  const elapsedMs = Math.max(0, reelElapsedMs);
  if (elapsedMs >= manifest.estimated_recording_duration_ms) {
    return {
      clip_index: Math.max(0, manifest.clips.length - 1),
      phase: "complete",
      progress: 1,
      reel_elapsed_ms: elapsedMs,
    };
  }

  for (const clip of manifest.clips) {
    const relativeMs = elapsedMs - clip.recording_start_offset_ms;
    if (relativeMs < 0) break;
    if (relativeMs < clip.slate_ms) {
      return {
        clip_index: clip.sequence_index,
        phase: "slate",
        progress: 0,
        reel_elapsed_ms: elapsedMs,
      };
    }
    if (relativeMs < clip.slate_ms + clip.duration_ms) {
      const playElapsedMs = relativeMs - clip.slate_ms;
      return {
        clip_index: clip.sequence_index,
        phase: "playing",
        progress: Math.min(1, Math.max(0, playElapsedMs / Math.max(1, clip.duration_ms))),
        reel_elapsed_ms: elapsedMs,
      };
    }
    if (relativeMs < clip.slate_ms + clip.duration_ms + clip.gap_ms) {
      return {
        clip_index: clip.sequence_index,
        phase: "gap",
        progress: 1,
        reel_elapsed_ms: elapsedMs,
      };
    }
  }

  return {
    clip_index: Math.max(0, manifest.clips.length - 1),
    phase: "complete",
    progress: 1,
    reel_elapsed_ms: elapsedMs,
  };
}

function captureText(value: string, maxLength = 58) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}

function drawQualificationEvidenceFrame(
  active: DeterministicEvidenceDrawContext,
  sourceCanvas: HTMLCanvasElement,
  now: number,
  reelElapsedOverrideMs?: number,
) {
  const captureCanvas = active.capture_canvas;
  const context = captureCanvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Qualification capture compositor could not acquire a 2D context.");
  }

  const width = captureCanvas.width;
  const height = captureCanvas.height;
  context.save();
  context.fillStyle = "#020617";
  context.fillRect(0, 0, width, height);

  const sourceWidth = Math.max(1, sourceCanvas.width);
  const sourceHeight = Math.max(1, sourceCanvas.height);
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;
  context.imageSmoothingEnabled = true;
  context.drawImage(
    sourceCanvas,
    0,
    0,
    sourceWidth,
    sourceHeight,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );

  const timeline = qualificationCaptureTimelineState(
    active,
    now,
    reelElapsedOverrideMs,
  );
  const clip = timeline.clip;
  const clipNumber = clip ? clip.sequence_index + 1 : active.manifest.clip_count;
  const phaseLabel =
    timeline.phase === "playing"
      ? "PLAY"
      : timeline.phase === "slate"
        ? "SLATE"
        : timeline.phase === "gap"
          ? "GAP"
          : timeline.phase === "complete"
            ? "REEL COMPLETE"
            : "ENCODER WARM-UP";

  context.fillStyle = "rgba(2, 6, 23, 0.88)";
  context.fillRect(0, 0, width, 58);
  context.fillRect(0, height - 54, width, 54);

  context.textBaseline = "middle";
  context.font = "600 18px system-ui, sans-serif";
  context.fillStyle = "#e2e8f0";
  context.fillText(
    captureText(
      clip
        ? `${String(clipNumber).padStart(2, "0")} / ${String(active.manifest.clip_count).padStart(2, "0")} · ${clip.capability_label.toUpperCase()} · ${clip.primary_cast_slot_id.toUpperCase()}`
        : `${active.manifest.clip_count} AUDITIONS · ${active.manifest.family_label.toUpperCase()}`,
      86,
    ),
    20,
    29,
  );

  context.textAlign = "right";
  context.font = "700 16px system-ui, sans-serif";
  context.fillStyle = timeline.phase === "complete" ? "#86efac" : "#7dd3fc";
  context.fillText(phaseLabel, width - 20, 29);
  context.textAlign = "left";

  context.font = "500 15px system-ui, sans-serif";
  context.fillStyle = "#cbd5e1";
  const assetName = clip?.assets[0]?.asset_label ?? "no primary asset";
  context.fillText(captureText(assetName, 56), 20, height - 27);

  context.textAlign = "right";
  context.fillStyle = "#94a3b8";
  const elapsedSeconds = Math.max(0, timeline.elapsed_ms / 1000);
  context.fillText(
    `${active.manifest.reel_id} · ${elapsedSeconds.toFixed(2)}s`,
    width - 20,
    height - 27,
  );
  context.textAlign = "left";

  if (timeline.phase === "arming") {
    context.fillStyle = "rgba(2, 6, 23, 0.78)";
    context.fillRect(0, 0, width, height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "800 38px system-ui, sans-serif";
    context.fillStyle = "#7dd3fc";
    context.fillText("ENCODER WARM-UP", width / 2, height / 2 - 24);
    context.font = "500 18px system-ui, sans-serif";
    context.fillStyle = "#cbd5e1";
    context.fillText(
      "Qualification evidence begins after reel time zero.",
      width / 2,
      height / 2 + 20,
    );
    context.textAlign = "left";
  }

  if (timeline.phase === "complete") {
    active.completion_frame_captured = true;
    context.fillStyle = "rgba(2, 6, 23, 0.72)";
    context.fillRect(0, 0, width, height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "800 42px system-ui, sans-serif";
    context.fillStyle = "#86efac";
    context.fillText("REEL COMPLETE", width / 2, height / 2 - 28);
    context.font = "650 22px system-ui, sans-serif";
    context.fillStyle = "#e2e8f0";
    context.fillText(
      `${active.manifest.clip_count} / ${active.manifest.clip_count} · ${active.manifest.family_label}`,
      width / 2,
      height / 2 + 20,
    );
    context.font = "500 16px system-ui, sans-serif";
    context.fillStyle = "#94a3b8";
    context.fillText(active.manifest.reel_id, width / 2, height / 2 + 56);
    context.textAlign = "left";
  }

  context.restore();
}

function stopQualificationEvidenceCompositor(active: ActiveEvidenceCapture) {
  if (active.compositor_timer_id !== null) {
    window.clearTimeout(active.compositor_timer_id);
    active.compositor_timer_id = null;
  }
}

function captureFrameTimingIdentity(
  active: ActiveEvidenceCapture,
  absoluteTimeMs: number,
) {
  const timeline = qualificationCaptureTimelineState(active, absoluteTimeMs);
  return {
    phase: timeline.phase,
    capability_id: timeline.clip?.capability_id ?? null,
    run_id: timeline.clip?.run_id ?? null,
  } as const;
}

function recordMissedQualificationEvidenceFrames(
  active: ActiveEvidenceCapture,
  firstSequenceIndex: number,
  lastSequenceIndex: number,
  frameMs: number,
) {
  if (lastSequenceIndex < firstSequenceIndex) return;
  const scheduleStartedAt = active.capture_schedule_started_performance_ms;
  if (scheduleStartedAt === null) return;

  const missedCount = lastSequenceIndex - firstSequenceIndex + 1;
  active.missed_frame_count += missedCount;
  active.current_consecutive_missed_frames += missedCount;
  active.max_consecutive_missed_frames = Math.max(
    active.max_consecutive_missed_frames,
    active.current_consecutive_missed_frames,
  );

  for (let sequenceIndex = firstSequenceIndex; sequenceIndex <= lastSequenceIndex; sequenceIndex += 1) {
    const expectedAbsoluteMs = scheduleStartedAt + sequenceIndex * frameMs;
    const identity = captureFrameTimingIdentity(active, expectedAbsoluteMs);
    active.frame_timing.push({
      sequence_index: sequenceIndex,
      expected_offset_ms: Number((sequenceIndex * frameMs).toFixed(3)),
      actual_offset_ms: null,
      lateness_ms: null,
      status: "missed",
      phase: identity.phase,
      capability_id: identity.capability_id,
      run_id: identity.run_id,
    });
  }
}

function submitQualificationEvidenceFrame(
  active: ActiveEvidenceCapture,
  sourceCanvas: HTMLCanvasElement,
  sequenceIndex: number,
  expectedAbsoluteMs: number,
  now = performance.now(),
) {
  drawQualificationEvidenceFrame(active, sourceCanvas, now);

  if (active.last_submission_performance_ms !== null) {
    active.largest_submission_gap_ms = Math.max(
      active.largest_submission_gap_ms,
      now - active.last_submission_performance_ms,
    );
  }
  active.last_submission_performance_ms = now;
  active.current_consecutive_missed_frames = 0;
  active.submitted_frame_count += 1;
  active.scheduled_frame_count = Math.max(
    active.scheduled_frame_count,
    sequenceIndex + 1,
  );

  const scheduleStartedAt = active.capture_schedule_started_performance_ms;
  const expectedOffsetMs =
    scheduleStartedAt === null ? 0 : expectedAbsoluteMs - scheduleStartedAt;
  const actualOffsetMs =
    scheduleStartedAt === null ? 0 : now - scheduleStartedAt;
  const identity = captureFrameTimingIdentity(active, now);
  active.frame_timing.push({
    sequence_index: sequenceIndex,
    expected_offset_ms: Number(expectedOffsetMs.toFixed(3)),
    actual_offset_ms: Number(actualOffsetMs.toFixed(3)),
    lateness_ms: Number(Math.max(0, now - expectedAbsoluteMs).toFixed(3)),
    status: "submitted",
    phase: identity.phase,
    capability_id: identity.capability_id,
    run_id: identity.run_id,
  });
  active.video_track.requestFrame?.();
}

function serviceQualificationEvidenceDeadline(
  active: ActiveEvidenceCapture,
  sourceCanvas: HTMLCanvasElement,
  now = performance.now(),
) {
  const scheduleStartedAt = active.capture_schedule_started_performance_ms;
  if (scheduleStartedAt === null) return false;

  const frameMs = 1000 / DIRECTOR_QUALIFICATION_CAPTURE_FPS;
  const nextSequenceIndex = active.next_capture_sequence_index;
  const nextExpectedMs = scheduleStartedAt + nextSequenceIndex * frameMs;

  // setTimeout may wake a fraction early. Never submit until this exact sequence
  // deadline is due; this is the A.10C guard that prevents >30 FPS duplicates.
  if (now + 0.5 < nextExpectedMs) return false;

  const dueSequenceIndex = Math.max(
    nextSequenceIndex,
    Math.floor((now - scheduleStartedAt) / frameMs),
  );
  if (dueSequenceIndex > nextSequenceIndex) {
    recordMissedQualificationEvidenceFrames(
      active,
      nextSequenceIndex,
      dueSequenceIndex - 1,
      frameMs,
    );
  }

  const expectedAbsoluteMs = scheduleStartedAt + dueSequenceIndex * frameMs;
  submitQualificationEvidenceFrame(
    active,
    sourceCanvas,
    dueSequenceIndex,
    expectedAbsoluteMs,
    now,
  );
  active.next_capture_sequence_index = dueSequenceIndex + 1;
  active.scheduled_frame_count = Math.max(
    active.scheduled_frame_count,
    active.next_capture_sequence_index,
  );
  return true;
}

function startQualificationEvidenceCompositor(
  active: ActiveEvidenceCapture,
  sourceCanvas: HTMLCanvasElement,
  scheduleStartedAt = performance.now(),
) {
  const frameMs = 1000 / DIRECTOR_QUALIFICATION_CAPTURE_FPS;
  active.capture_schedule_started_performance_ms = scheduleStartedAt;
  active.next_capture_sequence_index = 0;

  const serviceDeadline = () => {
    if (active.cancelled || active.recorder.state === "inactive") return;

    serviceQualificationEvidenceDeadline(active, sourceCanvas, performance.now());

    const scheduleStartedAt = active.capture_schedule_started_performance_ms;
    if (scheduleStartedAt === null) return;
    const nextTargetMs =
      scheduleStartedAt + active.next_capture_sequence_index * frameMs;
    active.compositor_timer_id = window.setTimeout(
      serviceDeadline,
      Math.max(1, nextTargetMs - performance.now()),
    );
  };

  serviceDeadline();
}

function resetQualificationEvidenceWindowMetrics(active: ActiveEvidenceCapture) {
  active.scheduled_frame_count = 0;
  active.submitted_frame_count = 0;
  active.missed_frame_count = 0;
  active.max_consecutive_missed_frames = 0;
  active.current_consecutive_missed_frames = 0;
  active.largest_submission_gap_ms = 0;
  active.last_submission_performance_ms = null;
  active.completion_frame_captured = false;
  active.capture_schedule_started_performance_ms = null;
  active.next_capture_sequence_index = 0;
  active.frame_timing = [];
  active.evidence_window_stopped_performance_ms = null;
}

function finalizeQualificationEncoderWarmup(active: ActiveEvidenceCapture) {
  active.warmup_scheduled_frame_count = active.scheduled_frame_count;
  active.warmup_submitted_frame_count = active.submitted_frame_count;
  active.warmup_missed_frame_count = active.missed_frame_count;
  active.warmup_largest_submission_gap_ms = active.largest_submission_gap_ms;
  stopQualificationEvidenceCompositor(active);
  resetQualificationEvidenceWindowMetrics(active);
}

function isLoadableLibraryAsset(asset: DirectorLibraryAsset) {
  return (
    asset.file_stats?.exists === true &&
    Boolean(asset.public_path) &&
    (asset.asset_type === "glb" || asset.asset_type === "gltf") &&
    asset.status !== "rejected" &&
    asset.scene_review_status !== "rejected" &&
    asset.semantic_review_status !== "rejected" &&
    asset.semantic_review_status !== "mismatch" &&
    asset.safe_to_use_in_sandbox !== false
  );
}

function scoreAssetForCastSlot(
  asset: DirectorLibraryAsset,
  slot: DirectorQualificationCastSlot,
) {
  const haystack = ` ${assetSearchText(asset)} `;
  let semantic = slot.preferred_asset_ids?.includes(asset.asset_id) ? 10_000 : 0;

  for (const concept of slot.concepts) {
    const phrase = normalized(concept);
    if (!phrase) continue;
    if (haystack.includes(` ${phrase} `)) semantic += 160;
    for (const token of phrase.split(" ").filter((item) => item.length >= 3)) {
      if (haystack.includes(` ${token} `)) semantic += 24;
    }
  }

  let quality = 0;
  if (asset.scene_review_status === "approved") quality += 42;
  if (asset.semantic_review_status === "verified") quality += 34;
  if (asset.status === "approved") quality += 24;
  quality += Math.max(0, Number(asset.quality_score) || 0) * 8;
  quality += Math.min(20, Math.max(0, Number(asset.reuse_count) || 0));

  return {
    semantic,
    total: semantic * 100 + quality,
  };
}

function resolveQualificationPools(
  assets: DirectorLibraryAsset[],
  overrides: Record<string, string>,
): CastPoolResolution[] {
  const loadable = assets.filter(isLoadableLibraryAsset);

  return DIRECTOR_QUALIFICATION_CAST.map((slot) => {
    const override = overrides[slot.id];
    const overriddenAsset = override
      ? loadable.find((asset) => asset.asset_id === override) ?? null
      : null;

    const ranked = loadable
      .map((asset) => ({ asset, score: scoreAssetForCastSlot(asset, slot) }))
      .filter(({ asset, score }) =>
        asset.asset_id === overriddenAsset?.asset_id || score.semantic > 0,
      )
      .sort(
        (left, right) =>
          right.score.total - left.score.total ||
          left.asset.asset_id.localeCompare(right.asset.asset_id),
      );

    const ordered: DirectorLibraryAsset[] = [];
    if (overriddenAsset) ordered.push(overriddenAsset);
    for (const candidate of ranked) {
      if (ordered.some((item) => item.asset_id === candidate.asset.asset_id)) continue;
      ordered.push(candidate.asset);
      if (ordered.length >= slot.pool_size) break;
    }

    return {
      slot,
      baseline: ordered[0] ?? null,
      candidates: ordered,
    };
  });
}

function poolFor(
  pools: CastPoolResolution[],
  slotId: DirectorQualificationCastSlotId,
) {
  return pools.find((entry) => entry.slot.id === slotId) ?? null;
}

function passKinds(coverage: DirectorQualificationCoverageMode) {
  if (coverage === "baseline") return ["baseline"] as DirectorQualificationPassKind[];
  if (coverage === "cross_asset") {
    return ["baseline", "diversity"] as DirectorQualificationPassKind[];
  }
  return [
    "baseline",
    "diversity",
    "physical_stress",
  ] as DirectorQualificationPassKind[];
}

function flattenFamilyCandidates(
  family: DirectorQualificationFamily,
  pools: CastPoolResolution[],
) {
  const output: Array<{
    slot_id: DirectorQualificationCastSlotId;
    asset: DirectorLibraryAsset;
  }> = [];
  const seen = new Set<string>();

  for (const slotId of family.primary_cast_slots) {
    const pool = poolFor(pools, slotId);
    for (const asset of pool?.candidates ?? []) {
      if (seen.has(asset.asset_id)) continue;
      seen.add(asset.asset_id);
      output.push({ slot_id: slotId, asset });
    }
  }
  return output;
}

function candidateForSlot(
  pools: CastPoolResolution[],
  slotId: DirectorQualificationCastSlotId,
  candidateIndex = 0,
) {
  const pool = poolFor(pools, slotId);
  if (!pool) return null;
  const asset =
    pool.candidates[candidateIndex] ??
    pool.baseline ??
    pool.candidates[0] ??
    null;
  return asset ? { slot_id: slotId, asset } : null;
}

function trackingComparisonSlotForPass(
  capability: DirectorCapability,
  passKind: DirectorQualificationPassKind,
): DirectorQualificationCastSlotId | null {
  if (
    ["follow", "lead_subject", "lag_follow", "track_parallel"].includes(
      capability.id,
    )
  ) {
    return passKind === "baseline" ? "character" : "vehicle";
  }
  if (
    capability.id === "camera_object_attached" ||
    capability.id === "object_attached"
  ) {
    return "vehicle";
  }
  return null;
}

function trackingCandidateIndexForPass(
  capability: DirectorCapability,
  passKind: DirectorQualificationPassKind,
) {
  if (passKind === "baseline") return 0;
  if (passKind === "diversity") {
    // The four sibling tracking relationships deliberately share the same
    // vehicle so visual differences come from the camera grammar, not geometry.
    return capability.id === "camera_object_attached" ? 1 : 0;
  }
  return capability.id === "camera_object_attached" ? 2 : 1;
}

function mountedCameraHostCandidateForPass(
  pools: CastPoolResolution[],
  passKind: DirectorQualificationPassKind,
) {
  const pool = poolFor(pools, "vehicle");
  if (!pool) return null;

  const suitableHosts = pool.candidates.filter(
    (asset) => directorQualificationMountedCameraHostSuitability(asset).suitable,
  );
  if (!suitableHosts.length) return null;

  const desiredIndex =
    passKind === "baseline" ? 0 : passKind === "diversity" ? 1 : 2;
  const asset = suitableHosts[desiredIndex] ?? suitableHosts[0];
  return asset ? { slot_id: "vehicle" as const, asset } : null;
}

function trackingEvidenceBlockLabel(
  capability: DirectorCapability,
  passKind: DirectorQualificationPassKind,
) {
  const slot = trackingComparisonSlotForPass(capability, passKind);
  if (!slot) return null;
  if (capability.id === "camera_object_attached") {
    return `Mounted primitive merge/deprecation check · ${slot}`;
  }
  if (capability.id === "object_attached") {
    return `Mounted primitive immediate-start comparison · ${slot}`;
  }
  return `Sibling comparison · ${slot}`;
}

function buildTrackingMountedComparisonClip(input: {
  family: DirectorQualificationFamily;
  scene: DirectorQualificationScene;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  passKind: DirectorQualificationPassKind;
  capabilityIndex: number;
  primary: { slot_id: DirectorQualificationCastSlotId; asset: DirectorLibraryAsset };
  normalization_policy: DirectorQualificationNormalizationPolicy;
}) {
  const comparisonCapability = DIRECTOR_CAPABILITIES.find(
    (candidate) => candidate.id === "object_attached",
  );
  if (!comparisonCapability) return null;

  const roles = buildPlannedRoles({
    capability: comparisonCapability,
    family: input.family,
    scene: input.scene,
    pools: input.pools,
    all_assets: input.all_assets,
    pass_kind: input.passKind,
    capability_index: input.capabilityIndex,
    primary: input.primary,
  });
  if (!roles) return null;

  const profile = directorQualificationCapabilityProfile(
    input.family,
    comparisonCapability.id,
  );
  const travelHeading = profile.requires_directional_facing
    ? primaryTravelHeadingRadians(comparisonCapability)
    : null;

  return {
    capability: comparisonCapability,
    primary_cast_slot_id: input.primary.slot_id,
    pass_kind: input.passKind,
    normalization_policy: input.normalization_policy,
    evidence_block_label: trackingEvidenceBlockLabel(
      comparisonCapability,
      input.passKind,
    ),
    qualification_note: profile.qualification_note,
    merge_compare_with_capability_id: null,
    relationship_direction_degrees:
      travelHeading === null ? null : (travelHeading * 180) / Math.PI,
    travel_direction: travelHeading === null ? null : "forward",
    roles,
  } satisfies PlannedClip;
}

function lensPerspectiveCandidateIndexForPass(
  passKind: DirectorQualificationPassKind,
) {
  return passKind === "baseline" ? 0 : passKind === "diversity" ? 1 : 2;
}

function chooseLensPerspectivePrimaryAsset(
  pools: CastPoolResolution[],
  passKind: DirectorQualificationPassKind,
) {
  const slotId = "character" as const;
  const pool = poolFor(pools, slotId);
  const desiredIndex = lensPerspectiveCandidateIndexForPass(passKind);
  const asset = pool?.candidates[desiredIndex] ?? null;
  return asset ? { slot_id: slotId, asset } : null;
}

function chooseLensPerspectiveSupportingAsset(
  pools: CastPoolResolution[],
  slotId: DirectorQualificationCastSlotId,
  passKind: DirectorQualificationPassKind,
  excludedAssetIds: Set<string>,
) {
  const candidates = poolFor(pools, slotId)?.candidates ?? [];
  const desiredIndex = lensPerspectiveCandidateIndexForPass(passKind);
  if (!candidates[desiredIndex]) return null;
  for (let index = desiredIndex; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate && !excludedAssetIds.has(candidate.asset_id)) return candidate;
  }
  return null;
}

function choosePrimary(
  family: DirectorQualificationFamily,
  pools: CastPoolResolution[],
  passKind: DirectorQualificationPassKind,
  capabilityIndex: number,
  capability: DirectorCapability,
) {
  const profile = directorQualificationCapabilityProfile(
    family,
    capability.id,
  );

  if (isLensPerspectiveQualificationCapability(family, capability)) {
    // A.11A.24: each focal-length sibling must see the same primary within a
    // pass. Baseline uses Character candidate 0, Diversity candidate 1, and the
    // optional physical-stress pass candidate 2. Do not rotate by capability.
    return chooseLensPerspectivePrimaryAsset(pools, passKind);
  }

  if (
    family.category === "camera_framing" &&
    family.group === "Detail & relationship framing" &&
    (capability.id === "over_shoulder" || capability.id === "point_of_view")
  ) {
    // A.11A.22: OTS needs an actual shoulder/body foreground reference, and POV
    // needs a stable viewpoint source so Baseline/Diversity can prove perspective
    // by changing the viewed target/reference rather than swapping in a mug as the
    // camera host. Production POV remains actor-relative; this is evidence policy.
    return candidateForSlot(pools, "character", 0);
  }

  if (
    family.category === "camera_angle" &&
    family.group === "Special viewpoints" &&
    capability.id === "object_attached"
  ) {
    // A.11A.19: the angle proof must use the same mount-suitable solid-bodied
    // vehicle gate as the already-qualified mounted movement comparison. Do not
    // manufacture "diversity" with a character or open-frame bicycle.
    return mountedCameraHostCandidateForPass(pools, passKind);
  }

  if (
    family.category === "camera_movement" &&
    family.group === "Tracking & attached camera"
  ) {
    const slotId = trackingComparisonSlotForPass(capability, passKind);
    if (capability.id === "camera_object_attached") {
      // A.10B: the general Vehicle pool includes bicycles for tracking stress, but
      // the current canonical mounted primitive needs a broad host-body reference.
      // Filter to mount-suitable hosts; if the requested diversity index is absent,
      // reuse the proven host instead of manufacturing an empty-road false failure.
      return mountedCameraHostCandidateForPass(pools, passKind);
    }
    if (slotId) {
      return candidateForSlot(
        pools,
        slotId,
        trackingCandidateIndexForPass(capability, passKind),
      );
    }
  }

  const eligibleFamily = {
    ...family,
    primary_cast_slots: profile.suitable_primary_cast_slots,
  };
  const all = flattenFamilyCandidates(eligibleFamily, pools);
  const baseline = profile.suitable_primary_cast_slots
    .map((slotId) => {
      const asset = poolFor(pools, slotId)?.baseline ?? null;
      return asset ? { slot_id: slotId, asset } : null;
    })
    .find((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!baseline) return null;
  if (passKind === "baseline") return baseline;

  const diversity = all.filter((entry) => entry.asset.asset_id !== baseline.asset.asset_id);
  if (!diversity.length) return baseline;

  const offset = passKind === "physical_stress" ? Math.ceil(diversity.length / 2) : 0;
  return diversity[(capabilityIndex + offset) % diversity.length] ?? baseline;
}

function chooseSupportingAsset(
  pools: CastPoolResolution[],
  slotId: DirectorQualificationCastSlotId,
  passKind: DirectorQualificationPassKind,
  capabilityIndex: number,
  excludedAssetIds: Set<string>,
) {
  const candidates = poolFor(pools, slotId)?.candidates ?? [];
  if (!candidates.length) return null;
  if (passKind === "baseline") {
    return candidates.find((asset) => !excludedAssetIds.has(asset.asset_id)) ?? candidates[0];
  }
  const offset = passKind === "physical_stress" ? 2 : 1;
  for (let step = 0; step < candidates.length; step += 1) {
    const candidate = candidates[(capabilityIndex + offset + step) % candidates.length];
    if (!excludedAssetIds.has(candidate.asset_id)) return candidate;
  }
  return candidates[(capabilityIndex + offset) % candidates.length] ?? candidates[0];
}

const DIRECTOR_SUPPORT_PHYSICAL_RELATIONS = [
  "on_surface",
  "attached_to",
  "inside",
] as const;

type DirectorSupportPhysicalRelation =
  (typeof DIRECTOR_SUPPORT_PHYSICAL_RELATIONS)[number];

type DirectorPhysicalQualificationTarget = {
  slot_id: DirectorQualificationCastSlotId;
  asset: DirectorLibraryAsset;
  normalization: DirectorQualificationAssetNormalization;
  region_id: string;
  region_label: string;
  region_override: DirectorQualificationPhysicalRegionOverride | null;
  score: number;
};

type DirectorPhysicalQualificationPair = {
  source_slot_id: DirectorQualificationCastSlotId;
  source_asset: DirectorLibraryAsset;
  source_normalization: DirectorQualificationAssetNormalization;
  target: DirectorPhysicalQualificationTarget;
  score: number;
};

function directorSupportPhysicalRelation(
  family: DirectorQualificationFamily,
  capability: DirectorCapability,
): DirectorSupportPhysicalRelation | null {
  if (family.category !== "blocking_placement") return null;
  return (DIRECTOR_SUPPORT_PHYSICAL_RELATIONS as readonly string[]).includes(
    capability.id,
  )
    ? (capability.id as DirectorSupportPhysicalRelation)
    : null;
}

function qualificationScaleBounds(
  normalization: DirectorQualificationAssetNormalization,
): [number, number] {
  return normalization.logical_extent_source.startsWith(
    "inside_fixture_asset_authoritative:",
  )
    ? [
        DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS[0],
        DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS[1],
      ]
    : [0.02, 40];
}

function qualificationWorldDimensions(
  asset: DirectorLibraryAsset,
  normalization: DirectorQualificationAssetNormalization,
): [number, number, number] {
  return directorQualificationRenderedWorldSize({
    dimensions_m: asset.dimensions_m,
    target_extent_m: normalization.target_extent_m,
    scale_bounds: qualificationScaleBounds(normalization),
  });
}

function qualificationCastSlotForAsset(
  asset: DirectorLibraryAsset,
  pools: CastPoolResolution[],
): DirectorQualificationCastSlotId | null {
  for (const pool of pools) {
    if (pool.candidates.some((candidate) => candidate.asset_id === asset.asset_id)) {
      return pool.slot.id;
    }
  }

  let best: { slot: DirectorQualificationCastSlot; score: number } | null = null;
  for (const slot of DIRECTOR_QUALIFICATION_CAST) {
    const scored = scoreAssetForCastSlot(asset, slot);
    if (scored.semantic <= 0) continue;
    if (!best || scored.total > best.score) {
      best = { slot, score: scored.total };
    }
  }
  return best?.slot.id ?? null;
}

function directorPhysicalPairSuitability(input: {
  relation: DirectorSupportPhysicalRelation;
  source_asset: DirectorLibraryAsset;
  source_normalization: DirectorQualificationAssetNormalization;
  target_asset: DirectorLibraryAsset;
  target_normalization: DirectorQualificationAssetNormalization;
  target_inspection?: DirectorQualificationPhysicalInspection | null;
}) {
  const geometry = input.target_asset.geometry_profile;
  const sourceSize = qualificationWorldDimensions(
    input.source_asset,
    input.source_normalization,
  );
  const targetScale = directorQualificationEffectiveRenderScale({
    dimensions_m: input.target_asset.dimensions_m,
    target_extent_m: input.target_normalization.target_extent_m,
    scale_bounds: qualificationScaleBounds(input.target_normalization),
  });
  const margin = 0.012;

  if (input.relation === "on_surface") {
    if (!geometry || geometry.audit?.status === "review_required") return null;
    const targetWorldSize = qualificationWorldDimensions(
      input.target_asset,
      input.target_normalization,
    );
    // Qualification should visibly distinguish On Surface from On Ground. Very
    // thin floor/rug-like receivers remain valid production assets, but they are
    // poor standalone proof receivers when staged directly on the ground plane.
    if (directorQualificationSupportReceiverLooksGroundLike(targetWorldSize)) {
      return null;
    }
    const candidates = geometry.support_surfaces
      .filter(
        (surface) =>
          surface.source !== "legacy_ratio" &&
          surface.confidence >= 0.35 &&
          directorQualificationSupportSurfaceIsPerceptuallyEligible({
            normal_y: surface.normal[1],
            exposure: surface.exposure,
            openness: surface.openness,
            blocked_fraction: surface.blocked_fraction,
            height_ratio: surface.height_ratio,
          }),
      )
      .map((surface) => {
        const usable = surface.usable_size ?? surface.size;
        const surfaceSize: [number, number] = [
          Math.max(0.001, usable[0] * targetScale),
          Math.max(0.001, usable[1] * targetScale),
        ];
        const sourceFootprint: [number, number] = [sourceSize[0], sourceSize[2]];
        const fits =
          (sourceFootprint[0] + margin * 2 <= surfaceSize[0] &&
            sourceFootprint[1] + margin * 2 <= surfaceSize[1]) ||
          (sourceFootprint[0] + margin * 2 <= surfaceSize[1] &&
            sourceFootprint[1] + margin * 2 <= surfaceSize[0]);
        const blocked = Math.max(0, Math.min(1, surface.blocked_fraction ?? 0));
        const clearanceAbove =
          surface.clearance_above_m == null
            ? null
            : Math.max(0, surface.clearance_above_m * targetScale);
        const fitsClearance =
          clearanceAbove === null || sourceSize[1] + margin <= clearanceAbove;
        const area = surfaceSize[0] * surfaceSize[1];
        const primaryBonus =
          geometry.primary_support_surface_id === surface.id ? 32 : 0;
        const heightRatio = Math.max(
          0,
          Math.min(1, Number(surface.height_ratio) || 0),
        );
        return {
          region_id: surface.id,
          region_label: surface.label || surface.id,
          region_override: {
            kind: "support_surface",
            id: surface.id,
            label: surface.label || surface.id,
            local_center: [...surface.center] as [number, number, number],
            normal: [...surface.normal] as [number, number, number],
            size: [...surface.size] as [number, number],
            usable_size: [...usable] as [number, number],
            confidence: surface.confidence,
            clearance_above_m: surface.clearance_above_m,
            orientation: surface.orientation,
            exposure: surface.exposure,
            openness: surface.openness,
            blocked_fraction: surface.blocked_fraction,
            vertical_rank: surface.vertical_rank,
            height_ratio: surface.height_ratio,
            evidence_source: "asset_geometry_profile",
          } satisfies DirectorQualificationPhysicalRegionOverride,
          fits: fits && fitsClearance,
          score:
            surface.confidence * 130 +
            Math.sqrt(Math.max(0, area)) * 18 +
            primaryBonus +
            heightRatio * 54 -
            blocked * 90 -
            Math.max(0, surface.vertical_rank ?? 0) * 10,
        };
      })
      .filter((candidate) => candidate.fits)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.region_id.localeCompare(right.region_id),
      );
    return candidates[0] ?? null;
  }

  if (input.relation === "inside") {
    const measuredCandidates = geometry && geometry.audit?.status !== "review_required"
      ? geometry.interior_volumes
          .filter(
            (volume) =>
              volume.confidence >= 0.45 &&
              volume.openness === "open" &&
              Array.isArray(volume.access_direction),
          )
          .map((volume) => {
            const size: [number, number, number] = [
              Math.max(0.001, Math.abs(volume.size[0]) * targetScale),
              Math.max(0.001, Math.abs(volume.size[1]) * targetScale),
              Math.max(0.001, Math.abs(volume.size[2]) * targetScale),
            ];
            const containmentClearance =
              directorQualificationAdaptiveContainmentClearance(size, 0.008);
            const fits = sourceSize.every(
              (value, index) =>
                value + containmentClearance * 2 <= size[index]!,
            );
            const volumeM3 = size[0] * size[1] * size[2];
            return {
              region_id: volume.id,
              region_label: volume.label || volume.id,
              region_override: null as DirectorQualificationPhysicalRegionOverride | null,
              fits,
              score:
                volume.confidence * 140 +
                Math.cbrt(Math.max(0.000001, volumeM3)) * 14,
            };
          })
      : [];

    const inferredOverride = directorQualificationContainmentOverrideFromInspection(
      input.target_asset,
      input.target_inspection,
    );
    const inferredCandidates = inferredOverride
      ? (() => {
          const size = inferredOverride.size.map((value) =>
            Math.max(0.001, Math.abs(value) * targetScale),
          ) as [number, number, number];
          const containmentClearance =
            directorQualificationAdaptiveContainmentClearance(size, 0.008);
          const fits = sourceSize.every(
            (value, index) =>
              value + containmentClearance * 2 <= size[index]!,
          );
          const volumeM3 = size[0] * size[1] * size[2];
          return [
            {
              region_id: inferredOverride.id,
              region_label: inferredOverride.label,
              region_override: inferredOverride,
              fits,
              score:
                inferredOverride.confidence * 150 +
                Math.cbrt(Math.max(0.000001, volumeM3)) * 14 +
                18,
            },
          ];
        })()
      : [];

    return [...measuredCandidates, ...inferredCandidates]
      .filter((candidate) => candidate.fits)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.region_id.localeCompare(right.region_id),
      )[0] ?? null;
  }

  const sourceContact = [...sourceSize]
    .sort((left, right) => left - right)
    .slice(0, 2);
  const renderedContactCandidates = directorQualificationContactOverridesFromInspection(
    input.target_inspection,
  ).map((regionOverride) => {
    const size = regionOverride.kind === "surface_contact_region"
      ? [...regionOverride.size]
          .map((value) => Math.max(0.001, value * targetScale))
          .sort((left, right) => left - right)
      : [0, 0];
    const fits =
      sourceContact[0]! * 0.42 + margin <= size[0]! &&
      sourceContact[1]! * 0.42 + margin <= size[1]!;
    return {
      region_id: regionOverride.id,
      region_label: regionOverride.label,
      region_override: regionOverride,
      fits,
      score:
        regionOverride.confidence * 150 +
        Math.sqrt(Math.max(0.000001, size[0]! * size[1]!)) * 18 +
        directorQualificationAttachedProofReadabilityScore(regionOverride) +
        30,
    };
  });

  // Historical Blender profiles exposed four whole-bounds pseudo-faces named
  // attachment_left/right/front/back. A.11A.9 refuses those as positive
  // Attached-To evidence: if the exact rendered GLB can be inspected, we use
  // real sampled exterior patches; explicit/manual or future non-bounds measured
  // regions remain valid fallback evidence.
  const retiredWholeBoundsIds = new Set([
    "attachment_left",
    "attachment_right",
    "attachment_front",
    "attachment_back",
  ]);
  const profileCandidates = geometry && geometry.audit?.status !== "review_required"
    ? geometry.attachment_regions
        .filter(
          (region) =>
            region.source !== "legacy_ratio" &&
            region.confidence >= 0.35 &&
            region.exposure !== "interior" &&
            !(
              region.source === "blender_geometry" &&
              retiredWholeBoundsIds.has(region.id)
            ),
        )
        .map((region) => {
          const size = [
            Math.max(0.001, region.size[0] * targetScale),
            Math.max(0.001, region.size[1] * targetScale),
          ].sort((left, right) => left - right);
          const fits =
            sourceContact[0]! * 0.42 + margin <= size[0]! &&
            sourceContact[1]! * 0.42 + margin <= size[1]!;
          return {
            region_id: region.id,
            region_label: region.label || region.id,
            region_override: null as DirectorQualificationPhysicalRegionOverride | null,
            fits,
            score:
              region.confidence * 130 +
              Math.sqrt(Math.max(0.000001, size[0]! * size[1]!)) * 16 +
              (region.orientation === "vertical" ? 18 : 0),
          };
        })
    : [];

  return [...renderedContactCandidates, ...profileCandidates]
    .filter((candidate) => candidate.fits)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.region_id.localeCompare(right.region_id),
    )[0] ?? null;
}

function directorPhysicalTargetCandidates(input: {
  relation: DirectorSupportPhysicalRelation;
  source_asset: DirectorLibraryAsset;
  source_normalization: DirectorQualificationAssetNormalization;
  scene: DirectorQualificationScene;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  policy: DirectorQualificationNormalizationPolicy;
  physical_inspections: Record<string, DirectorQualificationPhysicalInspection | null>;
  excluded_asset_ids: Set<string>;
}) {
  const preferred = poolFor(input.pools, input.scene.secondary_cast_slot)?.candidates ?? [];
  const ordered: DirectorLibraryAsset[] = [];
  const seen = new Set<string>();
  for (const asset of [...preferred, ...input.all_assets]) {
    if (seen.has(asset.asset_id) || input.excluded_asset_ids.has(asset.asset_id)) continue;
    if (!isLoadableLibraryAsset(asset)) continue;
    seen.add(asset.asset_id);
    ordered.push(asset);
  }

  const candidates: DirectorPhysicalQualificationTarget[] = [];
  for (let orderIndex = 0; orderIndex < ordered.length; orderIndex += 1) {
    const asset = ordered[orderIndex]!;
    const slotId = qualificationCastSlotForAsset(asset, input.pools);
    const slot = slotId ? directorQualificationCastSlot(slotId) : null;
    if (!slot) continue;
    const normalization = normalizeAssetForDirectorQualification({
      asset,
      slot,
      scene: input.scene,
      role_kind: "secondary",
      policy: input.policy,
    });
    const suitability = directorPhysicalPairSuitability({
      relation: input.relation,
      source_asset: input.source_asset,
      source_normalization: input.source_normalization,
      target_asset: asset,
      target_normalization: normalization,
      target_inspection: input.physical_inspections[asset.asset_id] ?? null,
    });
    if (!suitability) continue;
    const preferredPoolBonus = preferred.some(
      (candidate) => candidate.asset_id === asset.asset_id,
    )
      ? 1000
      : 0;
    candidates.push({
      slot_id: slot.id,
      asset,
      normalization,
      region_id: suitability.region_id,
      region_label: suitability.region_label,
      region_override: suitability.region_override,
      score:
        preferredPoolBonus +
        suitability.score -
        orderIndex * 0.001,
    });
  }
  return candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.asset.asset_id.localeCompare(right.asset.asset_id),
  );
}

function chooseDirectorPhysicalSupportingAsset(input: {
  relation: DirectorSupportPhysicalRelation;
  source_asset: DirectorLibraryAsset;
  source_normalization: DirectorQualificationAssetNormalization;
  scene: DirectorQualificationScene;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  policy: DirectorQualificationNormalizationPolicy;
  physical_inspections: Record<string, DirectorQualificationPhysicalInspection | null>;
  pass_kind: DirectorQualificationPassKind;
  variant_index: number;
  excluded_asset_ids: Set<string>;
}) {
  const candidates = directorPhysicalTargetCandidates({
    relation: input.relation,
    source_asset: input.source_asset,
    source_normalization: input.source_normalization,
    scene: input.scene,
    pools: input.pools,
    all_assets: input.all_assets,
    policy: input.policy,
    physical_inspections: input.physical_inspections,
    excluded_asset_ids: input.excluded_asset_ids,
  });
  if (!candidates.length) return null;
  // Keep the three On Surface receiver canaries disjoint across evidence passes
  // whenever the library has enough compatible targets: baseline 0-2,
  // diversity 3-5, physical-stress 6-8. Smaller compatible pools wrap
  // deterministically instead of inventing an unsuitable receiver.
  const passOffset =
    input.relation === "on_surface"
      ? input.pass_kind === "baseline"
        ? 0
        : input.pass_kind === "diversity"
          ? 3
          : 6
      : input.pass_kind === "baseline"
        ? 0
        : input.pass_kind === "diversity"
          ? 1
          : 2;
  return candidates[(passOffset + input.variant_index) % candidates.length] ?? candidates[0];
}

function directorOnSurfacePhysicalPairCandidates(input: {
  preferred_primary: {
    slot_id: DirectorQualificationCastSlotId;
    asset: DirectorLibraryAsset;
  };
  family: DirectorQualificationFamily;
  scene: DirectorQualificationScene;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  policy: DirectorQualificationNormalizationPolicy;
  physical_inspections: Record<string, DirectorQualificationPhysicalInspection | null>;
}) {
  const profile = directorQualificationCapabilityProfile(input.family, "on_surface");
  const ordered: DirectorLibraryAsset[] = [];
  const seen = new Set<string>();
  const tryAddSource = (asset: DirectorLibraryAsset | null | undefined) => {
    if (
      !asset ||
      ordered.length >= DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT ||
      seen.has(asset.asset_id) ||
      !isLoadableLibraryAsset(asset)
    ) {
      return false;
    }
    const slotId = qualificationCastSlotForAsset(asset, input.pools);
    if (!slotId || !profile.suitable_primary_cast_slots.includes(slotId)) {
      return false;
    }
    seen.add(asset.asset_id);
    ordered.push(asset);
    return true;
  };

  tryAddSource(input.preferred_primary.asset);
  const sourcePools = profile.suitable_primary_cast_slots.map(
    (slotId) => poolFor(input.pools, slotId)?.candidates ?? [],
  );
  // Round-robin cast classes instead of walking the entire Asset Library for
  // every source. This keeps Cross-asset evidence broad while bounding the
  // in-memory pair search that used to grow quadratically with library size.
  for (let depth = 0; ordered.length < DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT; depth += 1) {
    let foundAtDepth = false;
    for (const pool of sourcePools) {
      const asset = pool[depth];
      if (asset) foundAtDepth = true;
      tryAddSource(asset);
      if (ordered.length >= DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT) break;
    }
    if (!foundAtDepth) break;
  }
  for (const asset of input.all_assets) {
    if (ordered.length >= DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT) break;
    tryAddSource(asset);
  }

  const pairs: DirectorPhysicalQualificationPair[] = [];
  for (let sourceIndex = 0; sourceIndex < ordered.length; sourceIndex += 1) {
    const sourceAsset = ordered[sourceIndex]!;
    const sourceSlotId = qualificationCastSlotForAsset(sourceAsset, input.pools);
    const sourceSlot = sourceSlotId ? directorQualificationCastSlot(sourceSlotId) : null;
    if (!sourceSlot) continue;
    const sourceNormalization = normalizeAssetForDirectorQualification({
      asset: sourceAsset,
      slot: sourceSlot,
      scene: input.scene,
      role_kind: "primary",
      policy: input.policy,
    });
    const targets = directorPhysicalTargetCandidates({
      relation: "on_surface",
      source_asset: sourceAsset,
      source_normalization: sourceNormalization,
      scene: input.scene,
      pools: input.pools,
      all_assets: input.all_assets,
      policy: input.policy,
      physical_inspections: input.physical_inspections,
      excluded_asset_ids: new Set([sourceAsset.asset_id]),
    });
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = targets[targetIndex]!;
      pairs.push({
        source_slot_id: sourceSlot.id,
        source_asset: sourceAsset,
        source_normalization: sourceNormalization,
        target,
        score: target.score - sourceIndex * 0.01 - targetIndex * 0.001,
      });
    }
  }

  const ranked = pairs.sort(
    (left, right) =>
      right.score - left.score ||
      left.source_asset.asset_id.localeCompare(right.source_asset.asset_id) ||
      left.target.asset.asset_id.localeCompare(right.target.asset.asset_id),
  );

  // A.11A.17: one On Surface canary per distinct source identity. Source
  // semantics are unrestricted; measured fit/readability decides eligibility.
  // Prefer distinct receivers too so Cross-asset evidence cannot succeed on one
  // lucky support geometry repeated under several source labels.
  return directorQualificationSelectDistinctOnSurfacePairs(ranked);
}

function chooseDirectorOnSurfacePhysicalPair(input: {
  preferred_primary: {
    slot_id: DirectorQualificationCastSlotId;
    asset: DirectorLibraryAsset;
  };
  family: DirectorQualificationFamily;
  scene: DirectorQualificationScene;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  policy: DirectorQualificationNormalizationPolicy;
  physical_inspections: Record<string, DirectorQualificationPhysicalInspection | null>;
  pass_kind: DirectorQualificationPassKind;
  variant_index: number;
}) {
  const pairs = directorOnSurfacePhysicalPairCandidates(input);
  const pairIndex = directorQualificationOnSurfacePairIndex({
    pass_kind: input.pass_kind,
    variant_index: input.variant_index,
    pair_count: pairs.length,
    canaries_per_pass: 3,
  });
  return pairIndex === null ? null : pairs[pairIndex] ?? null;
}

function directorInsidePhysicalPairCandidates(input: {
  preferred_primary: {
    slot_id: DirectorQualificationCastSlotId;
    asset: DirectorLibraryAsset;
  };
  family: DirectorQualificationFamily;
  scene: DirectorQualificationScene;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  policy: DirectorQualificationNormalizationPolicy;
  physical_inspections: Record<string, DirectorQualificationPhysicalInspection | null>;
}) {
  const profile = directorQualificationCapabilityProfile(input.family, "inside");
  const ordered: DirectorLibraryAsset[] = [];
  const seen = new Set<string>();
  const tryAddSource = (asset: DirectorLibraryAsset | null | undefined) => {
    if (
      !asset ||
      ordered.length >= DIRECTOR_QUALIFICATION_INSIDE_SOURCE_SCAN_LIMIT ||
      seen.has(asset.asset_id) ||
      !isLoadableLibraryAsset(asset)
    ) {
      return false;
    }
    const slotId = qualificationCastSlotForAsset(asset, input.pools);
    if (!slotId || !profile.suitable_primary_cast_slots.includes(slotId)) {
      return false;
    }
    seen.add(asset.asset_id);
    ordered.push(asset);
    return true;
  };
  tryAddSource(input.preferred_primary.asset);
  const sourcePools = profile.suitable_primary_cast_slots.map(
    (slotId) => poolFor(input.pools, slotId)?.candidates ?? [],
  );
  for (let depth = 0; ordered.length < DIRECTOR_QUALIFICATION_INSIDE_SOURCE_SCAN_LIMIT; depth += 1) {
    let foundAtDepth = false;
    for (const pool of sourcePools) {
      const asset = pool[depth];
      if (asset) foundAtDepth = true;
      tryAddSource(asset);
      if (ordered.length >= DIRECTOR_QUALIFICATION_INSIDE_SOURCE_SCAN_LIMIT) break;
    }
    if (!foundAtDepth) break;
  }
  for (const asset of input.all_assets) {
    if (ordered.length >= DIRECTOR_QUALIFICATION_INSIDE_SOURCE_SCAN_LIMIT) break;
    tryAddSource(asset);
  }

  const pairs: DirectorPhysicalQualificationPair[] = [];
  for (let sourceIndex = 0; sourceIndex < ordered.length; sourceIndex += 1) {
    const sourceAsset = ordered[sourceIndex]!;
    const sourceSlotId = qualificationCastSlotForAsset(sourceAsset, input.pools);
    const sourceSlot = sourceSlotId ? directorQualificationCastSlot(sourceSlotId) : null;
    if (!sourceSlot) continue;
    const sourceNormalization = normalizeAssetForDirectorQualification({
      asset: sourceAsset,
      slot: sourceSlot,
      scene: input.scene,
      role_kind: "primary",
      policy: input.policy,
    });
    const targets = directorPhysicalTargetCandidates({
      relation: "inside",
      source_asset: sourceAsset,
      source_normalization: sourceNormalization,
      scene: input.scene,
      pools: input.pools,
      all_assets: input.all_assets,
      policy: input.policy,
      physical_inspections: input.physical_inspections,
      excluded_asset_ids: new Set([sourceAsset.asset_id]),
    });
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = targets[targetIndex]!;
      pairs.push({
        source_slot_id: sourceSlot.id,
        source_asset: sourceAsset,
        source_normalization: sourceNormalization,
        target,
        score:
          target.score +
          (sourceAsset.asset_id === input.preferred_primary.asset.asset_id
            ? 2000
            : 0) -
          sourceIndex * 0.01 -
          targetIndex * 0.001,
      });
    }
  }
  const ranked = pairs.sort(
    (left, right) =>
      right.score - left.score ||
      left.source_asset.asset_id.localeCompare(right.source_asset.asset_id) ||
      left.target.asset.asset_id.localeCompare(right.target.asset.asset_id),
  );

  // A.11A.12: a scan may produce multiple usable regions on one receiver.
  // Collapse those to one strongest candidate per real source/receiver identity
  // before baseline/diversity indexing so a second region cannot masquerade as
  // a second pair.
  return directorQualificationSelectDistinctInsidePairs(ranked);
}

function directorInsideValidationFixtureNormalization(input: {
  asset: DirectorLibraryAsset;
  slot: DirectorQualificationCastSlot;
  scene: DirectorQualificationScene;
  role_kind: DirectorQualificationRoleKind;
  policy: DirectorQualificationNormalizationPolicy;
  concept: string;
  target_extent_m?: number;
}) {
  const baseline = normalizeAssetForDirectorQualification({
    asset: input.asset,
    slot: input.slot,
    scene: input.scene,
    role_kind: input.role_kind,
    policy: input.policy,
  });
  const logical = logicalAssetSizeDecision({
    concept: input.concept,
  });
  const preferredTargetExtent = logical.target_extent_m;
  const targetExtent = Math.max(
    0.02,
    Math.min(
      logical.max_extent_m,
      input.target_extent_m ?? preferredTargetExtent,
    ),
  );
  const fitAdjusted = Math.abs(targetExtent - preferredTargetExtent) > 0.0005;
  const renderScale = directorQualificationEffectiveRenderScale({
    dimensions_m: input.asset.dimensions_m,
    target_extent_m: targetExtent,
    scale_bounds: [
      DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS[0],
      DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS[1],
    ],
  });

  return {
    ...baseline,
    logical_extent_m: preferredTargetExtent,
    logical_extent_source:
      `inside_fixture_asset_authoritative:${fitAdjusted ? "relationship_fit:" : ""}${logical.source}`,
    requested_target_extent_m: preferredTargetExtent,
    target_extent_m: targetExtent,
    render_scale_multiplier: Math.round(renderScale * 1000) / 1000,
    metadata_warning:
      renderScale > 24 || renderScale < 1 / 24
        ? `Inside validation fixture requires a ${renderScale.toFixed(3)}× source-unit correction to preserve physical ${input.concept} scale.`
        : null,
    reason: fitAdjusted
      ? `Inside validation fixture starts from the "${logical.profile_key ?? input.concept}" real-world size (${preferredTargetExtent.toFixed(2)} m) and fit-adjusts only the contained source to ${targetExtent.toFixed(3)} m within a plausible small-specimen range proven against the measured cavity.`
      : `Inside validation fixture uses the "${logical.profile_key ?? input.concept}" asset-authoritative real-world size (${targetExtent.toFixed(2)} m) and deliberately ignores generic cast-slot presentation sizing.`,
  } satisfies DirectorQualificationAssetNormalization;
}

function directorInsideValidationFixturePair(input: {
  scene: DirectorQualificationScene;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  policy: DirectorQualificationNormalizationPolicy;
  physical_inspections: Record<string, DirectorQualificationPhysicalInspection | null>;
  pass_kind: DirectorQualificationPassKind;
}): DirectorPhysicalQualificationPair | null {
  const fixture = directorQualificationInsideValidationFixtureForPass(
    input.pass_kind,
  );
  if (!fixture) return null;

  const sourceAsset = directorQualificationFindInsideValidationAsset(
    input.all_assets,
    {
      preferred_asset_ids: fixture.preferred_source_asset_ids,
      phrases: fixture.source_phrases,
    },
  );
  const receiverAsset = directorQualificationFindInsideValidationAsset(
    input.all_assets,
    {
      preferred_asset_ids: fixture.preferred_receiver_asset_ids,
      phrases: fixture.receiver_phrases,
    },
  );
  if (
    !sourceAsset ||
    !receiverAsset ||
    sourceAsset.asset_id === receiverAsset.asset_id
  ) {
    return null;
  }

  // Explicit validation fixtures already define the semantic roles we intend
  // to judge. Do not ask the generic cast taxonomy to rediscover that identity:
  // e.g. a valid Bathtub asset is not required to contain the word "furniture".
  const sourceSlot = directorQualificationCastSlot(fixture.source_cast_slot_id);
  const receiverSlot = directorQualificationCastSlot(
    fixture.receiver_cast_slot_id,
  );
  if (!sourceSlot || !receiverSlot) return null;

  const receiverNormalization = directorInsideValidationFixtureNormalization({
    asset: receiverAsset,
    slot: receiverSlot,
    scene: input.scene,
    role_kind: "secondary",
    policy: input.policy,
    concept: fixture.receiver_phrases[0],
  });
  const sourceLogical = logicalAssetSizeDecision({
    concept: fixture.source_phrases[0],
  });
  const sourceFitFloor = directorQualificationContainedSourceFitFloor(
    sourceLogical.min_extent_m,
  );

  const pairAtExtent = (targetExtentM: number) => {
    const normalization = directorInsideValidationFixtureNormalization({
      asset: sourceAsset,
      slot: sourceSlot,
      scene: input.scene,
      role_kind: "primary",
      policy: input.policy,
      concept: fixture.source_phrases[0],
      target_extent_m: targetExtentM,
    });
    const suitability = directorPhysicalPairSuitability({
      relation: "inside",
      source_asset: sourceAsset,
      source_normalization: normalization,
      target_asset: receiverAsset,
      target_normalization: receiverNormalization,
      target_inspection:
        input.physical_inspections[receiverAsset.asset_id] ?? null,
    });
    return { normalization, suitability };
  };

  let fitted = pairAtExtent(sourceLogical.target_extent_m);
  if (!fitted.suitability) {
    const floor = pairAtExtent(sourceFitFloor);
    if (!floor.suitability) return null;

    // Find the largest plausible contained specimen that fits the measured
    // cavity. This is a bounded pure fit search; it does not reload the GLB or
    // enlarge the receiver to manufacture a pass.
    let low = sourceFitFloor;
    let high = sourceLogical.target_extent_m;
    fitted = floor;
    for (let step = 0; step < 10; step += 1) {
      const midpoint = (low + high) * 0.5;
      const candidate = pairAtExtent(midpoint);
      if (candidate.suitability) {
        low = midpoint;
        fitted = candidate;
      } else {
        high = midpoint;
      }
    }
  }

  const sourceNormalization = fitted.normalization;
  const suitability = fitted.suitability;
  if (!suitability) return null;

  return {
    source_slot_id: sourceSlot.id,
    source_asset: sourceAsset,
    source_normalization: sourceNormalization,
    target: {
      slot_id: receiverSlot.id,
      asset: receiverAsset,
      normalization: receiverNormalization,
      region_id: suitability.region_id,
      region_label: suitability.region_label,
      region_override: suitability.region_override,
      score: suitability.score,
    },
    // Explicit qualification fixtures outrank generic Inside pair discovery.
    score: 100_000 + suitability.score,
  };
}

function chooseDirectorInsidePhysicalPair(input: {
  preferred_primary: {
    slot_id: DirectorQualificationCastSlotId;
    asset: DirectorLibraryAsset;
  };
  family: DirectorQualificationFamily;
  scene: DirectorQualificationScene;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  policy: DirectorQualificationNormalizationPolicy;
  physical_inspections: Record<string, DirectorQualificationPhysicalInspection | null>;
  pass_kind: DirectorQualificationPassKind;
}) {
  const validationFixture = directorQualificationInsideValidationFixtureForPass(
    input.pass_kind,
  );
  if (validationFixture) {
    // A.11A.14: Cross-asset Inside uses two intentionally legible fixtures:
    // pineapple -> bathtub at baseline and apple -> the established coffee mug
    // at diversity. If either requested real pair is missing or physically
    // invalid, fail closed instead of silently substituting an ambiguous pair.
    return directorInsideValidationFixturePair(input);
  }

  const pairs = directorInsidePhysicalPairCandidates(input);
  // A.11A.11: later passes must be genuinely distinct source/receiver pairs.
  // Do not wrap a single proven pair and relabel the same evidence as diversity.
  const pairIndex = directorQualificationInsidePairIndex({
    pass_kind: input.pass_kind,
    pair_count: pairs.length,
  });
  return pairIndex === null ? null : pairs[pairIndex] ?? null;
}

function basePosition(
  scene: DirectorQualificationScene,
  roleIndex: number,
): [number, number, number] {
  if (roleIndex === 0) return [...scene.blocking.primary];
  if (roleIndex === 1) return [...scene.blocking.secondary];
  if (roleIndex === 2) return [...scene.blocking.context];
  const angle = ((roleIndex - 2) / Math.max(3, roleIndex + 1)) * Math.PI * 2;
  const radius = 2.55 + (roleIndex % 2) * 0.45;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius - 0.8];
}

function separateFrom(
  position: [number, number, number],
  anchor: [number, number, number],
  requiredDistance: number,
) {
  const dx = position[0] - anchor[0];
  const dz = position[2] - anchor[2];
  const distance = Math.hypot(dx, dz);
  if (distance >= requiredDistance) return position;
  const safeDistance = Math.max(0.001, distance);
  const ux = distance > 0.001 ? dx / safeDistance : 1;
  const uz = distance > 0.001 ? dz / safeDistance : 0;
  return [
    anchor[0] + ux * requiredDistance,
    position[1],
    anchor[2] + uz * requiredDistance,
  ] as [number, number, number];
}

function adjustBlockingPositions(
  scene: DirectorQualificationScene,
  normalizations: DirectorQualificationAssetNormalization[],
) {
  const positions = normalizations.map((_, index) => basePosition(scene, index));
  if (!positions.length) return positions;

  for (let index = 1; index < positions.length; index += 1) {
    const required =
      scene.normalization.minimum_clearance_m +
      (normalizations[0].target_extent_m + normalizations[index].target_extent_m) * 0.42;
    positions[index] = separateFrom(positions[index], positions[0], required);
  }

  if (positions.length >= 3) {
    const required =
      scene.normalization.minimum_clearance_m +
      (normalizations[1].target_extent_m + normalizations[2].target_extent_m) * 0.38;
    positions[2] = separateFrom(positions[2], positions[1], required);
  }
  return positions;
}

function roleKind(index: number): DirectorQualificationRoleKind {
  if (index === 0) return "primary";
  if (index === 1) return "secondary";
  return "context";
}

function isTrackingQualificationFamily(family: DirectorQualificationFamily | undefined) {
  return Boolean(
    family?.category === "camera_movement" &&
      family.group === "Tracking & attached camera",
  );
}

function primaryTravelHeadingRadians(capability: DirectorCapability) {
  const travel = directorCapabilityDemoEvents(capability).find(
    (event) =>
      event.actor_entity_id === "primary_subject" &&
      event.behaviour === "move_to",
  );
  const start = travel?.parameters.start_position;
  const target = travel?.parameters.target_position;
  if (
    !Array.isArray(start) ||
    !Array.isArray(target) ||
    start.length < 3 ||
    target.length < 3
  ) {
    return null;
  }
  const dx = Number(target[0]) - Number(start[0]);
  const dz = Number(target[2]) - Number(start[2]);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 0.05) {
    return null;
  }
  // Director actor-local forward is +Z. Keep capability direction separate from
  // Asset Library default_rotation; this outer role yaw aligns canonical forward
  // to the authored travel path without rewriting asset identity.
  return Math.atan2(dx, dz);
}

function buildPlannedRoles(input: {
  capability: DirectorCapability;
  family: DirectorQualificationFamily;
  scene: DirectorQualificationScene;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  physical_inspections?: Record<string, DirectorQualificationPhysicalInspection | null>;
  pass_kind: DirectorQualificationPassKind;
  capability_index: number;
  physical_pair_variant_index?: number;
  primary: { slot_id: DirectorQualificationCastSlotId; asset: DirectorLibraryAsset };
}) {
  const policy: DirectorQualificationNormalizationPolicy =
    input.pass_kind === "physical_stress"
      ? "physical_context"
      : input.family.normalization_policy;
  const profile = directorQualificationCapabilityProfile(
    input.family,
    input.capability.id,
  );
  const travelHeading = profile.requires_directional_facing
    ? primaryTravelHeadingRadians(input.capability)
    : null;

  const physicalRelation = directorSupportPhysicalRelation(
    input.family,
    input.capability,
  );
  const insidePair =
    physicalRelation === "inside"
      ? chooseDirectorInsidePhysicalPair({
          preferred_primary: input.primary,
          family: input.family,
          scene: input.scene,
          pools: input.pools,
          all_assets: input.all_assets,
          policy,
          physical_inspections: input.physical_inspections ?? {},
          pass_kind: input.pass_kind,
        })
      : null;
  const onSurfacePair =
    physicalRelation === "on_surface"
      ? chooseDirectorOnSurfacePhysicalPair({
          preferred_primary: input.primary,
          family: input.family,
          scene: input.scene,
          pools: input.pools,
          all_assets: input.all_assets,
          policy,
          physical_inspections: input.physical_inspections ?? {},
          pass_kind: input.pass_kind,
          variant_index: input.physical_pair_variant_index ?? 0,
        })
      : null;
  if (physicalRelation === "inside" && !insidePair) return null;
  if (physicalRelation === "on_surface" && !onSurfacePair) return null;
  const selectedPhysicalPair = insidePair ?? onSurfacePair;
  const effectivePrimary = selectedPhysicalPair
    ? {
        slot_id: selectedPhysicalPair.source_slot_id,
        asset: selectedPhysicalPair.source_asset,
      }
    : input.primary;
  const excluded = new Set<string>([effectivePrimary.asset.asset_id]);
  const roleBindings: Array<{
    role: string;
    cast_slot_id: DirectorQualificationCastSlotId;
    asset: DirectorLibraryAsset;
    normalization: DirectorQualificationAssetNormalization;
    rotation: [number, number, number];
    facing_correction_degrees: number;
    physical_region_override: DirectorQualificationPhysicalRegionOverride | null;
  }> = [];

  const qualificationAssetRoles = isTrackingQualificationFamily(input.family)
    ? input.capability.demo.asset_roles.slice(0, 1)
    : directorQualificationAssetRoles(
        input.family,
        input.capability,
      );

  // Phase 1B.7A.8: Tracking camera grammar is judged against one real primary
  // actor plus the lightweight procedural road/corridor. A.8 primary-only
  // tracking evidence excludes arbitrary supporting GLBs. A.11A.2 applies the
  // same neutral-evidence principle to Depth & screen placement. A.11A.3/A.11A.4
  // make Group formations participant-aware. A.11A.5 extends that discipline to
  // Relative actor placement: five binary relations render exactly two actors;
  // Between alone renders its primary plus both references. A.11A.7 makes
  // Support & containment relation-aware: On Ground renders only its source,
  // while On Surface / Attached To / Inside select an actually compatible
  // measured receiver before the clip is admitted to the gauntlet.
  for (let index = 0; index < qualificationAssetRoles.length; index += 1) {
    const role = qualificationAssetRoles[index];
    let slotId: DirectorQualificationCastSlotId;
    let asset: DirectorLibraryAsset | null;
    let normalizationOverride: DirectorQualificationAssetNormalization | null = null;
    let physicalRegionOverride: DirectorQualificationPhysicalRegionOverride | null = null;

    if (index === 0) {
      slotId = effectivePrimary.slot_id;
      asset = effectivePrimary.asset;
      normalizationOverride = selectedPhysicalPair?.source_normalization ?? null;
    } else if (index === 1) {
      const sourceBinding = roleBindings[0];
      if (physicalRelation && sourceBinding) {
        const target =
          physicalRelation === "inside" && insidePair
            ? insidePair.target
            : physicalRelation === "on_surface" && onSurfacePair
              ? onSurfacePair.target
              : chooseDirectorPhysicalSupportingAsset({
                relation: physicalRelation,
                source_asset: sourceBinding.asset,
                source_normalization: sourceBinding.normalization,
                scene: input.scene,
                pools: input.pools,
                all_assets: input.all_assets,
                policy,
                physical_inspections: input.physical_inspections ?? {},
                pass_kind: input.pass_kind,
                variant_index: input.physical_pair_variant_index ?? 0,
                excluded_asset_ids: excluded,
              });
        if (!target) return null;
        slotId = target.slot_id;
        asset = target.asset;
        normalizationOverride = target.normalization;
        physicalRegionOverride = target.region_override;
      } else {
        slotId = directorQualificationOrbitRevealSupportingCastSlot(
          input.family,
          input.capability,
          input.scene.secondary_cast_slot,
        );
        asset = isLensPerspectiveQualificationCapability(
          input.family,
          input.capability,
        )
          ? chooseLensPerspectiveSupportingAsset(
              input.pools,
              slotId,
              input.pass_kind,
              excluded,
            )
          : chooseSupportingAsset(
              input.pools,
              slotId,
              input.pass_kind,
              input.capability_index,
              excluded,
            );
      }
    } else {
      slotId = input.scene.context_cast_slot;
      asset = isLensPerspectiveQualificationCapability(
        input.family,
        input.capability,
      )
        ? chooseLensPerspectiveSupportingAsset(
            input.pools,
            slotId,
            input.pass_kind,
            excluded,
          )
        : chooseSupportingAsset(
            input.pools,
            slotId,
            input.pass_kind,
            input.capability_index + index,
            excluded,
          );
    }

    if (!asset) return null;
    excluded.add(asset.asset_id);
    const slot = directorQualificationCastSlot(slotId);
    if (!slot) return null;
    const original =
      input.capability.demo.blocking.find((item) => item.role === role.role) ??
      input.capability.demo.blocking[index];
    const rotation = original?.rotation
      ? ([...original.rotation] as [number, number, number])
      : ([0, 0, 0] as [number, number, number]);
    const facingCorrectionDegrees =
      index === 0 && travelHeading !== null
        ? (travelHeading * 180) / Math.PI
        : 0;
    if (index === 0 && travelHeading !== null) {
      rotation[1] += travelHeading;
    }

    const normalized =
      normalizationOverride ??
      normalizeAssetForDirectorQualification({
        asset,
        slot,
        scene: input.scene,
        role_kind: roleKind(index),
        policy,
      });
    const qualificationNormalization =
      directorQualificationAdjustOrbitRevealNormalization({
        family: input.family,
        capability: input.capability,
        role: role.role,
        normalization: normalized,
      });

    roleBindings.push({
      role: role.role,
      cast_slot_id: slotId,
      asset,
      normalization: qualificationNormalization,
      rotation,
      facing_correction_degrees: facingCorrectionDegrees,
      physical_region_override: physicalRegionOverride,
    });
  }

  const positions = adjustBlockingPositions(
    input.scene,
    roleBindings.map((entry) => entry.normalization),
  );
  const depthScreenFixturePositions =
    directorQualificationAdjustDepthScreenFixturePositions({
      family: input.family,
      capability: input.capability,
      scene: input.scene,
      positions,
    });
  const relativeFixturePositions = directorQualificationAdjustRelativeActorFixturePositions({
    family: input.family,
    capability: input.capability,
    scene: input.scene,
    positions: depthScreenFixturePositions,
    target_extents_m: roleBindings.map(
      (entry) => entry.normalization.target_extent_m,
    ),
  });
  const orbitRevealFixturePositions =
    directorQualificationAdjustOrbitRevealFixturePositions({
      family: input.family,
      capability: input.capability,
      scene: input.scene,
      positions: relativeFixturePositions,
      target_extents_m: roleBindings.map(
        (entry) => entry.normalization.target_extent_m,
      ),
    });
  const detailRelationshipFixturePositions =
    directorQualificationAdjustDetailRelationshipFixturePositions({
      family: input.family,
      capability: input.capability,
      scene: input.scene,
      positions: orbitRevealFixturePositions,
      target_extents_m: roleBindings.map(
        (entry) => entry.normalization.target_extent_m,
      ),
    });
  const fixturePositions = directorQualificationAdjustLensPerspectiveFixturePositions({
    family: input.family,
    capability: input.capability,
    scene: input.scene,
    positions: detailRelationshipFixturePositions,
    target_extents_m: roleBindings.map(
      (entry) => entry.normalization.target_extent_m,
    ),
  });
  return roleBindings.map<PlannedRole>((entry, index) => ({
    ...entry,
    blocking_position:
      fixturePositions[index] ?? basePosition(input.scene, index),
  }));
}

function buildPlannedClips(input: {
  capabilities: DirectorCapability[];
  family: DirectorQualificationFamily;
  scene: DirectorQualificationScene;
  coverage: DirectorQualificationCoverageMode;
  pools: CastPoolResolution[];
  all_assets: DirectorLibraryAsset[];
  physical_inspections?: Record<string, DirectorQualificationPhysicalInspection | null>;
}) {
  const output: PlannedClip[] = [];
  const usedInsidePairKeys = new Set<string>();

  // A.11A.13: candidate selection is not the final evidence authority. Guard the
  // planned reel itself so a later Inside pass cannot admit a source/receiver
  // identity that has already appeared, even if an upstream selector, fallback,
  // cache, or future refactor returns it again.
  // Baseline clips intentionally run as one contiguous sibling-comparison block.
  // Diversity and physical-stress blocks follow afterward instead of interleaving,
  // making the Snipping Tool reel much easier to compare visually.
  for (const passKind of passKinds(input.coverage)) {
    input.capabilities.forEach((capability, capabilityIndex) => {
      const primary = choosePrimary(
        input.family,
        input.pools,
        passKind,
        capabilityIndex,
        capability,
      );
      if (!primary) return;
      const profile = directorQualificationCapabilityProfile(
        input.family,
        capability.id,
      );
      const travelHeading = profile.requires_directional_facing
        ? primaryTravelHeadingRadians(capability)
        : null;
      const normalizationPolicy: DirectorQualificationNormalizationPolicy =
        passKind === "physical_stress"
          ? "physical_context"
          : input.family.normalization_policy;
      const onSurfaceCanaryCount =
        isSupportContainmentQualificationFamily(input.family) &&
        capability.id === "on_surface"
          ? 3
          : 1;

      for (let variantIndex = 0; variantIndex < onSurfaceCanaryCount; variantIndex += 1) {
        const roles = buildPlannedRoles({
          capability,
          family: input.family,
          scene: input.scene,
          pools: input.pools,
          all_assets: input.all_assets,
          physical_inspections: input.physical_inspections,
          pass_kind: passKind,
          capability_index: capabilityIndex,
          physical_pair_variant_index: variantIndex,
          primary,
        });
        if (!roles) continue;

        if (
          isSupportContainmentQualificationFamily(input.family) &&
          capability.id === "inside"
        ) {
          const insidePairKey = directorQualificationInsidePairKey(
            roles[0]?.asset.asset_id,
            roles[1]?.asset.asset_id,
          );
          if (!insidePairKey || usedInsidePairKeys.has(insidePairKey)) {
            // plannedCoverageGaps(...) will turn this omitted later-pass proof
            // into an explicit no-distinct-pair gap instead of false Diversity.
            return;
          }
          usedInsidePairKeys.add(insidePairKey);
        }

        output.push({
          capability,
          primary_cast_slot_id: roles[0]?.cast_slot_id ?? primary.slot_id,
          pass_kind: passKind,
          normalization_policy: normalizationPolicy,
          evidence_block_label:
            isLensPerspectiveQualificationCapability(input.family, capability)
              ? `Controlled lens perspective block · fixed cast + blocking · ${passKind}`
              : input.family.group === "Tracking & attached camera"
                ? trackingEvidenceBlockLabel(capability, passKind)
                : onSurfaceCanaryCount > 1
                ? `On Surface Cross-asset source canary ${variantIndex + 1}/${onSurfaceCanaryCount} · ${assetLabel(roles[0]!.asset)} · ${passKind}`
                : isSupportContainmentQualificationFamily(input.family) &&
                    capability.id === "inside"
                  ? `Inside validation · ${
                      directorQualificationInsideValidationFixtureForPass(passKind)?.label ??
                      "physical-stress pair"
                    } · ${passKind}`
                  : capability.id === "attached_to"
                    ? `Measured physical-region proof · ${passKind}`
                    : null,
          qualification_note: profile.qualification_note,
          merge_compare_with_capability_id:
            profile.merge_compare_with_capability_id,
          relationship_direction_degrees:
            travelHeading === null ? null : (travelHeading * 180) / Math.PI,
          travel_direction: travelHeading === null ? null : "forward",
          roles,
        });
      }

      if (
        input.family.group === "Tracking & attached camera" &&
        capability.id === "camera_object_attached"
      ) {
        const mountedComparison = buildTrackingMountedComparisonClip({
          family: input.family,
          scene: input.scene,
          pools: input.pools,
          all_assets: input.all_assets,
          passKind,
          capabilityIndex,
          primary,
          normalization_policy: normalizationPolicy,
        });
        if (mountedComparison) {
          output.push(mountedComparison);
        }
      }
    });
  }
  return output;
}

function capabilityForPlannedClip(clip: PlannedClip) {
  const groupFormation = [
    "surround",
    "form_line",
    "form_circle",
    "cluster",
    "symmetrical_pair",
  ].includes(clip.capability.id);
  const relativeActorPlacement = [
    "beside",
    "in_front_of",
    "behind",
    "between",
    "facing",
    "facing_away",
    "attached_to",
  ].includes(clip.capability.id);
  const supportContainment = [
    "on_ground",
    "on_surface",
    "inside",
  ].includes(clip.capability.id);
  const detailRelationshipEvidence =
    clip.capability.category === "camera_framing" &&
    ["two_shot", "group_shot", "point_of_view", "cutaway"].includes(
      clip.capability.id,
    );
  const lensPerspectiveEvidence =
    clip.capability.category === "camera_framing" &&
    [
      "lens_ultra_wide",
      "lens_wide",
      "lens_normal",
      "lens_portrait",
      "lens_telephoto",
    ].includes(clip.capability.id);
  const plannedRoleIds = clip.roles.map((role) => role.role);

  return {
    ...clip.capability,
    demo: {
      ...clip.capability.demo,
      // A.11A.4 formation evidence and A.11A.5 relative-actor evidence can
      // deliberately change the generic role count. Promote the planned roles
      // into the demo visibility contract so directorCapabilityDemoShot frames
      // exactly the evidence relationship: extra Surround/Circle supports, three
      // actors for Between, and no optional context for binary relationships.
      required_visible_roles: groupFormation
        ? plannedRoleIds
        : relativeActorPlacement
          ? plannedRoleIds
          : supportContainment
            ? plannedRoleIds
            : detailRelationshipEvidence || lensPerspectiveEvidence
              ? plannedRoleIds
              : clip.capability.demo.required_visible_roles,
      blocking: clip.roles.map((role) => ({
        role: role.role,
        position: [...role.blocking_position] as [number, number, number],
        rotation: [...role.rotation] as [number, number, number],
        target_extent_m: role.normalization.target_extent_m,
      })),
    },
  };
}

function resolvedRolesForPlannedClip(clip: PlannedClip): ResolvedDirectorRole[] {
  const resolved = clip.roles.map((role) => ({
    role: role.role,
    asset: role.asset,
    blocking: {
      role: role.role,
      position: [...role.blocking_position] as [number, number, number],
      rotation: [...role.rotation] as [number, number, number],
      target_extent_m: role.normalization.target_extent_m,
    },
    matched_concept: role.cast_slot_id,
    // Phase 1B.7A.1 default remains the live qualification renderer boundary.
    // Explicit Inside validation fixtures may widen it below only when their
    // asset-authoritative logical size requires correcting unusual source units.
    render_scale_bounds: [0.02, 40] as [number, number],
    scale_ground_offset_with_render: true,
    directability_override: directorQualificationDirectabilityOverride(
      role.asset,
      role.physical_region_override,
    ),
  }));

  for (let index = 0; index < resolved.length; index += 1) {
    const role = clip.roles[index];
    const current = resolved[index];
    if (!role || !current) continue;
    current.render_scale_bounds = qualificationScaleBounds(role.normalization);
  }

  return resolved;
}

function plannedClipFromManifest(
  clip: DirectorQualificationRunClip,
  assets: DirectorLibraryAsset[],
) {
  const capability = DIRECTOR_CAPABILITIES.find((item) => item.id === clip.capability_id);
  if (!capability) return null;
  const plannedRoles: PlannedRole[] = [];
  for (const manifestAsset of clip.assets) {
    const asset = manifestAsset.asset_id
      ? assets.find((item) => item.asset_id === manifestAsset.asset_id) ?? null
      : null;
    const slot = directorQualificationCastSlot(
      manifestAsset.cast_slot_id as DirectorQualificationCastSlotId,
    );
    if (!asset || !slot) return null;
    plannedRoles.push({
      role: manifestAsset.role,
      cast_slot_id: slot.id,
      asset,
      normalization: {
        normalization_version: "director_qualification_normalization_phase1b7a1_v1",
        cast_slot_id: slot.id,
        policy: manifestAsset.normalization_policy,
        role_kind: roleKind(plannedRoles.length),
        source_dimensions_m: manifestAsset.source_dimensions_m ?? [1, 1, 1],
        source_largest_extent_m: manifestAsset.source_largest_extent_m ?? 1,
        logical_extent_m: manifestAsset.logical_extent_m ?? manifestAsset.target_extent_m,
        logical_extent_source: manifestAsset.logical_extent_source ?? "manifest",
        requested_target_extent_m: manifestAsset.target_extent_m,
        target_extent_m: manifestAsset.target_extent_m,
        render_scale_multiplier: manifestAsset.render_scale_multiplier ?? 1,
        metadata_warning: manifestAsset.normalization_warning,
        reason: manifestAsset.normalization_reason,
      },
      blocking_position: [...manifestAsset.blocking_position],
      rotation: (() => {
        const original =
          capability.demo.blocking.find(
            (item) => item.role === manifestAsset.role,
          )?.rotation ?? [0, 0, 0];
        const rotation = [...original] as [number, number, number];
        rotation[1] +=
          (Number(manifestAsset.facing_correction_degrees) || 0) *
          (Math.PI / 180);
        return rotation;
      })(),
      facing_correction_degrees:
        Number(manifestAsset.facing_correction_degrees) || 0,
      physical_region_override: manifestAsset.physical_region_override ?? null,
    });
  }
  return {
    capability,
    primary_cast_slot_id: clip.primary_cast_slot_id as DirectorQualificationCastSlotId,
    pass_kind: clip.pass_kind,
    normalization_policy: clip.normalization_policy,
    evidence_block_label: clip.evidence_block_label ?? null,
    qualification_note: clip.qualification_note ?? null,
    merge_compare_with_capability_id:
      clip.merge_compare_with_capability_id ?? null,
    relationship_direction_degrees:
      clip.relationship_direction_degrees ?? null,
    travel_direction: clip.travel_direction ?? null,
    roles: plannedRoles,
  } satisfies PlannedClip;
}

function compactTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("") +
    "-" +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("")
  );
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function decisionCounts(
  state: DirectorQualificationState,
  capabilityIds: readonly string[],
) {
  const counts: Record<DirectorQualificationDecision, number> = {
    unreviewed: 0,
    qualified: 0,
    fix: 0,
    merge_candidate: 0,
    redefine: 0,
    restrict: 0,
    retire: 0,
    blocked: 0,
  };

  for (const capabilityId of capabilityIds) {
    counts[qualificationReviewForCapability(state, capabilityId).decision] += 1;
  }
  return counts;
}

function plannedClipPhysicalResolutionEvidence(
  clip: PlannedClip,
): DirectorQualificationPhysicalResolutionEvidence | null {
  const relation = (DIRECTOR_SUPPORT_PHYSICAL_RELATIONS as readonly string[]).includes(
    clip.capability.id,
  )
    ? (clip.capability.id as DirectorSupportPhysicalRelation)
    : null;
  if (!relation) return null;

  const capability = capabilityForPlannedClip(clip);
  const resolvedRoles = resolvedRolesForPlannedClip(clip);
  const runtimeActors = directorQualificationRuntimeActors(resolvedRoles);
  const cue = directorCapabilityDemoShot(capability).blocking.find(
    (candidate) => candidate.relation === relation,
  );
  if (!cue) return null;
  const resolution = resolveDirectorPhysicalBlockingPlacement(cue, runtimeActors);
  if (!resolution) return null;

  const sourceActor = runtimeActors.find(
    (actor) => actor.id === resolution.actor_entity_id,
  );
  const targetActor = runtimeActors.find(
    (actor) => actor.id === resolution.target_entity_id,
  );
  const targetRole = resolvedRoles.find(
    (role) => role.role === resolution.target_entity_id,
  );
  const targetPlannedRole = clip.roles.find(
    (role) => role.role === resolution.target_entity_id,
  );
  const targetScale = targetRole
    ? directorQualificationEffectiveRenderScale({
        dimensions_m: targetRole.asset?.dimensions_m,
        target_extent_m: targetRole.blocking.target_extent_m ?? 1.6,
        scale_bounds: targetRole.render_scale_bounds,
      })
    : 1;

  let selectedRegionLabel: string | null = null;
  let targetRegionWorldSize: number[] | null = null;
  let fitMargin: number | null = null;
  const clearance = cue.preserve_clearance === false ? 0.002 : 0.008;

  if (resolution.status === "resolved" && targetActor?.directability && sourceActor) {
    if (resolution.region_kind === "support_surface") {
      const surface = targetActor.directability.surfaces.find(
        (candidate) => candidate.id === resolution.region_id,
      );
      if (surface) {
        selectedRegionLabel = surface.semantic_names[0] ?? surface.id;
        const usable = surface.usable_size ?? surface.size;
        targetRegionWorldSize = usable.map((value) =>
          Math.max(0.001, Math.abs(value) * targetScale),
        );
        const sourceFootprint = [
          Math.abs(sourceActor.size[0]),
          Math.abs(sourceActor.size[2]),
        ];
        const [width, depth] = targetRegionWorldSize;
        const marginA = Math.min(
          (width ?? 0) - sourceFootprint[0]! - clearance * 2,
          (depth ?? 0) - sourceFootprint[1]! - clearance * 2,
        );
        const marginB = Math.min(
          (width ?? 0) - sourceFootprint[1]! - clearance * 2,
          (depth ?? 0) - sourceFootprint[0]! - clearance * 2,
        );
        fitMargin = Math.max(marginA, marginB) * 0.5;
      }
    } else if (resolution.region_kind === "containment_region") {
      const region = targetActor.directability.containment_regions.find(
        (candidate) => candidate.id === resolution.region_id,
      );
      if (region) {
        selectedRegionLabel = region.semantic_names[0] ?? region.id;
        targetRegionWorldSize = region.size.map((value) =>
          Math.max(0.001, Math.abs(value) * targetScale),
        );
        const containmentClearance =
          directorQualificationAdaptiveContainmentClearance(
            targetRegionWorldSize,
            clearance,
          );
        fitMargin = Math.min(
          ...targetRegionWorldSize.map(
            (value, index) =>
              (
                value -
                Math.abs(sourceActor.size[index] ?? 0) -
                containmentClearance * 2
              ) * 0.5,
          ),
        );
      }
    } else if (resolution.region_kind === "surface_contact_region") {
      const anchor = targetActor.directability.anchors.find(
        (candidate) => candidate.id === resolution.region_id,
      );
      if (anchor) {
        selectedRegionLabel = anchor.semantic_names[0] ?? anchor.id;
        targetRegionWorldSize = anchor.contact_size
          ? anchor.contact_size.map((value) =>
              Math.max(0.001, Math.abs(value) * targetScale),
            )
          : null;
        if (targetRegionWorldSize) {
          const sourceContact = [...sourceActor.size]
            .map((value) => Math.max(0.001, Math.abs(value)))
            .sort((left, right) => left - right)
            .slice(0, 2);
          const contact = [...targetRegionWorldSize].sort(
            (left, right) => left - right,
          );
          fitMargin = Math.min(
            contact[0]! - sourceContact[0]! * 0.42 - clearance,
            contact[1]! - sourceContact[1]! * 0.42 - clearance,
          );
        }
      }
    }
  }

  return {
    status: resolution.status,
    relation,
    actor_entity_id: resolution.actor_entity_id,
    target_entity_id: resolution.target_entity_id,
    selected_region_kind: resolution.region_kind,
    selected_region_id: resolution.region_id,
    selected_region_label: selectedRegionLabel,
    resolved_position: resolution.position,
    source_world_size_m: sourceActor ? [...sourceActor.size] : null,
    target_region_world_size_m: targetRegionWorldSize,
    fit_margin_m:
      fitMargin == null || !Number.isFinite(fitMargin) ? null : fitMargin,
    unresolved_reason: resolution.reason,
    selected_region_evidence_source:
      targetPlannedRole?.physical_region_override?.evidence_source ??
      (resolution.region_id ? "asset_directability_profile" : null),
  };
}

function directorInsideValidationFixtureCoverageGapReason(input: {
  pass_kind: DirectorQualificationPassKind;
  all_assets: DirectorLibraryAsset[];
  physical_inspections: Record<string, DirectorQualificationPhysicalInspection | null>;
}) {
  const fixture = directorQualificationInsideValidationFixtureForPass(
    input.pass_kind,
  );
  if (!fixture) {
    return "open_container_evidence_found_but_no_distinct_real_source_receiver_pair_fits_pass";
  }
  const source = directorQualificationFindInsideValidationAsset(
    input.all_assets,
    {
      preferred_asset_ids: fixture.preferred_source_asset_ids,
      phrases: fixture.source_phrases,
    },
  );
  if (!source) {
    return `inside_fixture_${fixture.id}_source_not_found_or_not_loadable`;
  }
  const receiver = directorQualificationFindInsideValidationAsset(
    input.all_assets,
    {
      preferred_asset_ids: fixture.preferred_receiver_asset_ids,
      phrases: fixture.receiver_phrases,
    },
  );
  if (!receiver) {
    return `inside_fixture_${fixture.id}_receiver_not_found_or_not_loadable`;
  }
  if (!(receiver.asset_id in input.physical_inspections)) {
    return `inside_fixture_${fixture.id}_receiver_not_physically_inspected`;
  }
  const inspection = input.physical_inspections[receiver.asset_id] ?? null;
  if (!directorQualificationContainmentOverrideFromInspection(receiver, inspection)) {
    return `inside_fixture_${fixture.id}_receiver_has_no_verified_open_cavity`;
  }
  return `inside_fixture_${fixture.id}_pair_failed_plausible_contained_source_fit`;
}

function plannedCoverageGaps(input: {
  family: DirectorQualificationFamily;
  capabilities: DirectorCapability[];
  coverage: DirectorQualificationCoverageMode;
  clips: PlannedClip[];
  all_assets?: DirectorLibraryAsset[];
  physical_inspections?: Record<string, DirectorQualificationPhysicalInspection | null>;
}): DirectorQualificationCoverageGap[] {
  if (
    !input.capabilities.some((capability) =>
      (DIRECTOR_SUPPORT_PHYSICAL_RELATIONS as readonly string[]).includes(
        capability.id,
      ),
    )
  ) {
    return [];
  }
  const gaps: DirectorQualificationCoverageGap[] = [];
  for (const passKind of passKinds(input.coverage)) {
    for (const capability of input.capabilities) {
      if (
        !(DIRECTOR_SUPPORT_PHYSICAL_RELATIONS as readonly string[]).includes(
          capability.id,
        )
      ) {
        continue;
      }
      const expectedClipCount = capability.id === "on_surface" ? 3 : 1;
      const actualClipCount = input.clips.filter(
        (clip) =>
          clip.capability.id === capability.id && clip.pass_kind === passKind,
      ).length;
      if (actualClipCount >= expectedClipCount) continue;
      gaps.push({
        capability_id: capability.id,
        pass_kind: passKind,
        relation: capability.id as DirectorSupportPhysicalRelation,
        expected_clip_count: expectedClipCount,
        actual_clip_count: actualClipCount,
        missing_clip_count: expectedClipCount - actualClipCount,
        reason: (() => {
          if (capability.id === "on_surface") {
            return "fewer_than_three_distinct_on_surface_sources_fit_readable_support_regions";
          }
          if (capability.id === "inside") {
            const fixture = directorQualificationInsideValidationFixtureForPass(
              passKind,
            );
            if (fixture) {
              return directorInsideValidationFixtureCoverageGapReason({
                pass_kind: passKind,
                all_assets: input.all_assets ?? [],
                physical_inspections: input.physical_inspections ?? {},
              });
            }
            const containerEvidenceCount = (input.all_assets ?? []).filter((asset) =>
              Boolean(
                directorQualificationContainmentOverrideFromInspection(
                  asset,
                  input.physical_inspections?.[asset.asset_id] ?? null,
                ),
              ),
            ).length;
            return containerEvidenceCount > 0
              ? "open_container_evidence_found_but_no_distinct_real_source_receiver_pair_fits_pass"
              : "no_semantic_open_container_evidence_available";
          }
          if (capability.id === "attached_to") {
            const contactEvidenceCount = Object.values(input.physical_inspections ?? {}).reduce(
              (count, inspection) =>
                count + directorQualificationContactOverridesFromInspection(inspection).length,
              0,
            );
            return contactEvidenceCount > 0
              ? "mesh_contact_patches_found_but_no_real_pair_fits"
              : "no_real_mesh_contact_patch_available";
          }
          return "no_compatible_measured_real_asset_pair_available";
        })(),
      });
    }
  }
  return gaps;
}

function manifestAsset(role: PlannedRole): DirectorQualificationRunAsset {
  return {
    cast_slot_id: role.cast_slot_id,
    role: role.role,
    asset_id: role.asset.asset_id,
    asset_label: assetLabel(role.asset),
    facing_correction_degrees: role.facing_correction_degrees,
    normalization_policy: role.normalization.policy,
    source_dimensions_m: role.normalization.source_dimensions_m,
    source_largest_extent_m: role.normalization.source_largest_extent_m,
    logical_extent_m: role.normalization.logical_extent_m,
    logical_extent_source: role.normalization.logical_extent_source,
    target_extent_m: role.normalization.target_extent_m,
    render_scale_multiplier: role.normalization.render_scale_multiplier,
    normalization_reason: role.normalization.reason,
    normalization_warning: role.normalization.metadata_warning,
    blocking_position: [...role.blocking_position],
    physical_region_override: role.physical_region_override,
  };
}

type QualificationPreloadBoundaryProps = {
  resetKey: string;
  assetId: string;
  onError: (assetId: string, message: string) => void;
  children: ReactNode;
};

type QualificationPreloadBoundaryState = {
  error: Error | null;
};

class QualificationPreloadBoundary extends Component<
  QualificationPreloadBoundaryProps,
  QualificationPreloadBoundaryState
> {
  state: QualificationPreloadBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): QualificationPreloadBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(this.props.assetId, error.message);
    console.warn(
      `[Director Qualification Room] preload failed for ${this.props.assetId}.`,
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(previousProps: QualificationPreloadBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    return this.state.error ? null : this.props.children;
  }
}

function QualificationAssetPreloader({
  asset,
  onReady,
}: {
  asset: DirectorLibraryAsset;
  onReady: (assetId: string) => void;
}) {
  const url = directorRealAssetBrowserUrl(asset);
  useGLTF(url);

  useEffect(() => {
    onReady(asset.asset_id);
  }, [asset.asset_id, onReady, url]);

  return null;
}

function QualificationCaptureCanvasBridge({
  active,
  onCanvas,
  onRenderRequest,
}: {
  active: boolean;
  onCanvas: (canvas: HTMLCanvasElement | null) => void;
  onRenderRequest: (request: DeterministicRenderRequest | null) => void;
}) {
  const { gl, invalidate } = useThree();
  const pendingRenderResolvers = useRef<Array<() => void>>([]);

  const requestDeterministicRender = useCallback(
    () =>
      new Promise<void>((resolve) => {
        pendingRenderResolvers.current.push(resolve);
        invalidate();
      }),
    [invalidate],
  );

  useFrame(() => {
    if (!pendingRenderResolvers.current.length) return;
    const resolvers = pendingRenderResolvers.current.splice(0);
    // R3F invokes useFrame subscribers before gl.render. A microtask resolves only
    // after the current render stack has completed, so capture reads the finished
    // deterministic frame rather than the previous WebGL buffer.
    queueMicrotask(() => {
      for (const resolve of resolvers) resolve();
    });
  });

  useEffect(() => {
    onCanvas(gl.domElement);
    onRenderRequest(requestDeterministicRender);
    return () => {
      onCanvas(null);
      onRenderRequest(null);
      const resolvers = pendingRenderResolvers.current.splice(0);
      for (const resolve of resolvers) resolve();
    };
  }, [gl, onCanvas, onRenderRequest, requestDeterministicRender]);

  useEffect(() => {
    if (!active) return;
    // A.10C: the compositor owns the real-time evidence cadence. Playback already
    // invalidates dynamic WebGL frames at 30 Hz; a second recurring bridge timer
    // only creates competing work. Playback already invalidates moving frames at 30 Hz.
    // One activation invalidate is enough for static slate/gap pixels. Deterministic
    // export uses requestDeterministicRender for exact frame-by-frame advancement.
    invalidate();
  }, [active, invalidate]);

  return null;
}

/**
 * Phase 1B.7A.3 capture-performance seam.
 *
 * The page-level Qualification Room changes React state only at reel/phase boundaries.
 * High-frequency playback presentation lives inside the Canvas and samples absolute
 * wall time at a capped 30 FPS. If desktop capture temporarily steals scheduling time,
 * the next rendered frame catches up to the correct movie time instead of stretching
 * the audition.
 */
function QualificationPlaybackPreview({
  capability,
  roles,
  phase,
  paused,
  phaseClock,
  durationMs,
  showCameraPath,
  showRoleLabels,
  fixtureKind,
  deterministicProgress,
}: {
  capability: DirectorCapability;
  roles: ResolvedDirectorRole[];
  phase: ReelPhase;
  paused: boolean;
  phaseClock: QualificationPhaseClock;
  durationMs: number;
  showCameraPath: boolean;
  showRoleLabels: boolean;
  fixtureKind: ReturnType<typeof directorVisualAuditDefinition>["fixture"];
  deterministicProgress: number | null;
}) {
  const { invalidate } = useThree();
  const [presentedProgress, setPresentedProgress] = useState(
    phase === "gap" || phase === "complete" ? 1 : 0,
  );

  useEffect(() => {
    if (deterministicProgress !== null) {
      invalidate();
      return;
    }

    if (phase !== "playing" || paused) {
      const staticProgress =
        phase === "playing"
          ? Math.min(
              1,
              Math.max(
                0,
                elapsedPhaseClockMs(phaseClock) / Math.max(1, durationMs),
              ),
            )
          : phase === "gap" || phase === "complete"
            ? 1
            : 0;
      setPresentedProgress(staticProgress);
      invalidate();
      return;
    }

    let cancelled = false;
    let timerId = 0;

    // Phase 1B.7A.8: presentation itself is capped at 30 Hz. The prior rAF pump
    // woke at the monitor refresh rate (often 120/144 Hz) only to discard most
    // callbacks. Wall-time remains authoritative, so delayed callbacks still
    // catch up to the correct audition time without stretching the movie.
    const present = () => {
      if (cancelled) return;
      const now = performance.now();
      const elapsedMs = elapsedPhaseClockMs(phaseClock, now);
      const nextProgress = Math.min(
        1,
        Math.max(0, elapsedMs / Math.max(1, durationMs)),
      );
      setPresentedProgress((current) =>
        Math.abs(current - nextProgress) >= 0.0005
          ? nextProgress
          : current,
      );
      invalidate();
      timerId = window.setTimeout(present, QUALIFICATION_PREVIEW_FRAME_MS);
    };

    timerId = window.setTimeout(present, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [deterministicProgress, durationMs, invalidate, paused, phase, phaseClock]);

  const effectiveProgress = deterministicProgress ?? presentedProgress;

  return (
    <DirectorCapabilityPreview
      capability={capability}
      roles={roles}
      progress={effectiveProgress}
      isPlaying={deterministicProgress === null && phase === "playing" && !paused}
      showCameraPath={showCameraPath}
      showRoleLabels={showRoleLabels}
      fixtureMode="real_assets"
      fixtureKind={fixtureKind}
      auditSnap
      qualificationVisibilityAssist
      preserveActorInstances
    />
  );
}

export function DirectorQualificationRoom({
  onOpenCapabilities,
  assets,
  assetsLoaded,
  assetsLoading,
  assetError,
  onRequestAssets,
}: Props) {
  const families = useMemo(
    () => buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES),
    [],
  );
  const activeCapabilityIds = useMemo(
    () => families.flatMap((family) => family.capability_ids),
    [families],
  );
  const [familyKey, setFamilyKey] = useState(families[0]?.key ?? "");
  const selectedFamily =
    families.find((family) => family.key === familyKey) ?? families[0];
  const [sceneId, setSceneId] = useState<DirectorQualificationSceneId>(
    selectedFamily?.recommended_scene_id ?? "scene_a_character_target",
  );
  const scene = directorQualificationScene(sceneId);
  const [coverage, setCoverage] =
    useState<DirectorQualificationCoverageMode>("cross_asset");

  const [castOverrides, setCastOverrides] = useState<Record<string, string>>({});
  const [qualificationState, setQualificationState] =
    useState<DirectorQualificationState>(() => emptyDirectorQualificationState());
  const [campaignState, setCampaignState] =
    useState<DirectorQualificationCampaignState>(() =>
      emptyDirectorQualificationCampaignState(families),
    );
  const [manifest, setManifest] =
    useState<DirectorQualificationRecordingManifest | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<ReelPhase>("idle");
  const [phaseClock, setPhaseClock] =
    useState<QualificationPhaseClock>(() => stoppedPhaseClock());
  const [paused, setPaused] = useState(false);
  const [showCameraPath, setShowCameraPath] = useState(false);
  const [showRoleLabels, setShowRoleLabels] = useState(false);
  const [preparedAssetIds, setPreparedAssetIds] = useState<string[]>([]);
  const [preloadErrors, setPreloadErrors] = useState<Record<string, string>>({});
  const [preloadGeneration, setPreloadGeneration] = useState(0);
  const [physicalInspections, setPhysicalInspections] = useState<
    Record<string, DirectorQualificationPhysicalInspection | null>
  >({});
  const [physicalInspectionErrors, setPhysicalInspectionErrors] = useState<
    Record<string, string>
  >({});
  const [physicalInspectionCompletedKey, setPhysicalInspectionCompletedKey] =
    useState("");
  const [evidenceCapturePhase, setEvidenceCapturePhase] =
    useState<EvidenceCapturePhase>("idle");
  const [evidenceCaptureMessage, setEvidenceCaptureMessage] =
    useState<string | null>(null);
  const [deterministicProgress, setDeterministicProgress] =
    useState<number | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeEvidenceCaptureRef = useRef<ActiveEvidenceCapture | null>(null);
  const deterministicRenderRequestRef = useRef<DeterministicRenderRequest | null>(null);
  const deterministicExportCancelledRef = useRef(false);
  const qualificationStateRef = useRef(qualificationState);
  const campaignStateRef = useRef(campaignState);

  const evidenceCaptureBusy =
    evidenceCapturePhase === "arming" ||
    evidenceCapturePhase === "recording" ||
    evidenceCapturePhase === "rendering" ||
    evidenceCapturePhase === "packaging";

  const registerCaptureCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    captureCanvasRef.current = canvas;
  }, []);
  const registerDeterministicRenderRequest = useCallback(
    (request: DeterministicRenderRequest | null) => {
      deterministicRenderRequestRef.current = request;
    },
    [],
  );

  const loadableAssets = useMemo(
    () =>
      assetsLoaded
        ? assets
            .filter(isLoadableLibraryAsset)
            .slice()
            .sort((left, right) => assetLabel(left).localeCompare(assetLabel(right)))
        : [],
    [assets, assetsLoaded],
  );
  const resolvedPools = useMemo(
    () => (assetsLoaded ? resolveQualificationPools(loadableAssets, castOverrides) : []),
    [assetsLoaded, castOverrides, loadableAssets],
  );
  const familyCapabilities = useMemo(
    () =>
      selectedFamily
        ? selectedFamily.capability_ids
            .map((id) => DIRECTOR_CAPABILITIES.find((capability) => capability.id === id))
            .filter((capability): capability is DirectorCapability => Boolean(capability))
        : [],
    [selectedFamily],
  );

  const physicalInspectionRequired = Boolean(
    selectedFamily &&
      (isSupportContainmentQualificationFamily(selectedFamily) ||
        (selectedFamily.category === "blocking_placement" &&
          selectedFamily.capability_ids.includes("attached_to"))),
  );
  const physicalInspectionCandidates = useMemo(() => {
    if (!selectedFamily || !physicalInspectionRequired) return [];

    // A.11A.17 keeps heavy exact-GLB inspection scoped to the relation that can
    // consume it. Support & containment now needs only the two Inside receivers
    // (Bathtub + established mug). Attached To moved to Relative actor placement
    // and inspects only its two contact-readable receiver canaries when that
    // family is selected. No unrelated receiver GLBs are parsed speculatively.
    const insideFixtureReceivers = isSupportContainmentQualificationFamily(
      selectedFamily,
    )
      ? DIRECTOR_QUALIFICATION_INSIDE_VALIDATION_FIXTURES
          .map((fixture) =>
            directorQualificationFindInsideValidationAsset(loadableAssets, {
              preferred_asset_ids: fixture.preferred_receiver_asset_ids,
              phrases: fixture.receiver_phrases,
            }),
          )
          .filter((asset): asset is DirectorLibraryAsset => Boolean(asset))
      : [];
    const contactReadabilityReceivers = selectedFamily.capability_ids.includes(
      "attached_to",
    )
      ? ["chair", "stool"]
          .map((word) =>
            loadableAssets.find((asset) =>
              assetSearchText(asset).split(/\s+/).includes(word),
            ),
          )
          .filter((asset): asset is DirectorLibraryAsset => Boolean(asset))
      : [];

    const seen = new Set<string>();
    return [...insideFixtureReceivers, ...contactReadabilityReceivers]
      .filter((asset) => {
        if (seen.has(asset.asset_id)) return false;
        seen.add(asset.asset_id);
        return true;
      })
      .slice(0, DIRECTOR_QUALIFICATION_SUPPORT_CONTAINMENT_INSPECTION_LIMIT);
  }, [loadableAssets, physicalInspectionRequired, selectedFamily]);
  const physicalInspectionKey = useMemo(
    () =>
      physicalInspectionCandidates
        .map(
          (asset) =>
            `${asset.asset_id}:${asset.public_path}:${(asset.default_rotation ?? [0, 0, 0]).join(",")}`,
        )
        .join("|"),
    [physicalInspectionCandidates],
  );

  useEffect(() => {
    if (!physicalInspectionRequired || !assetsLoaded || assetsLoading) {
      setPhysicalInspections({});
      setPhysicalInspectionErrors({});
      setPhysicalInspectionCompletedKey("");
      return;
    }
    let cancelled = false;
    setPhysicalInspectionCompletedKey("");
    setPhysicalInspectionErrors({});
    const candidates = [...physicalInspectionCandidates];

    void (async () => {
      const next: Record<string, DirectorQualificationPhysicalInspection | null> = {};
      const errors: Record<string, string> = {};
      let cursor = 0;
      const worker = async () => {
        while (!cancelled) {
          const index = cursor;
          cursor += 1;
          const asset = candidates[index];
          if (!asset) return;
          try {
            next[asset.asset_id] =
              await inspectDirectorQualificationPhysicalAssetCached(asset);
          } catch (error) {
            next[asset.asset_id] = null;
            errors[asset.asset_id] =
              error instanceof Error ? error.message : "Physical mesh inspection failed.";
          }
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(2, Math.max(1, candidates.length)) },
          worker,
        ),
      );
      if (cancelled) return;
      setPhysicalInspections(next);
      setPhysicalInspectionErrors(errors);
      setPhysicalInspectionCompletedKey(physicalInspectionKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    assetsLoaded,
    assetsLoading,
    physicalInspectionCandidates,
    physicalInspectionKey,
    physicalInspectionRequired,
    selectedFamily,
  ]);

  const physicalInspectionReady =
    !physicalInspectionRequired ||
    physicalInspectionCompletedKey === physicalInspectionKey;
  const plannedClips = useMemo(
    () =>
      selectedFamily
        ? buildPlannedClips({
            capabilities: familyCapabilities,
            family: selectedFamily,
            scene,
            coverage,
            pools: resolvedPools,
            all_assets: loadableAssets,
            physical_inspections: physicalInspections,
          })
        : [],
    [
      coverage,
      familyCapabilities,
      loadableAssets,
      physicalInspections,
      resolvedPools,
      scene,
      selectedFamily,
    ],
  );

  const familyPoolEntries = useMemo(
    () =>
      (selectedFamily?.primary_cast_slots ?? [])
        .map((slotId) => poolFor(resolvedPools, slotId))
        .filter((entry): entry is CastPoolResolution => Boolean(entry)),
    [resolvedPools, selectedFamily],
  );
  const globalPoolAssetCount = useMemo(
    () =>
      new Set(
        resolvedPools.flatMap((pool) => pool.candidates.map((asset) => asset.asset_id)),
      ).size,
    [resolvedPools],
  );
  const familyPoolAssetCount = useMemo(
    () =>
      new Set(
        familyPoolEntries.flatMap((pool) =>
          pool.candidates.map((asset) => asset.asset_id),
        ),
      ).size,
    [familyPoolEntries],
  );
  const mountedCameraHostCandidates = useMemo(
    () =>
      (poolFor(resolvedPools, "vehicle")?.candidates ?? []).filter(
        (asset) => directorQualificationMountedCameraHostSuitability(asset).suitable,
      ),
    [resolvedPools],
  );
  const mountedHostCoverageMissing =
    familyCapabilities.some((capability) =>
      ["camera_object_attached", "object_attached"].includes(capability.id),
    ) && mountedCameraHostCandidates.length === 0;

  const scheduledAssetIds = useMemo(
    () =>
      new Set(
        plannedClips.flatMap((clip) => clip.roles.map((role) => role.asset.asset_id)),
      ),
    [plannedClips],
  );
  const scheduledAssets = useMemo(
    () =>
      loadableAssets.filter((asset) => scheduledAssetIds.has(asset.asset_id)),
    [loadableAssets, scheduledAssetIds],
  );
  const pendingScheduledAssets = useMemo(
    () =>
      scheduledAssets.filter(
        (asset) =>
          !preparedAssetIds.includes(asset.asset_id) &&
          !preloadErrors[asset.asset_id],
      ),
    [preparedAssetIds, preloadErrors, scheduledAssets],
  );
  // Single-flight preloading keeps GLTF parse/GPU-upload spikes bounded. The next
  // asset mounts only after the current asset resolves or becomes a visible error.
  const activePreloadAsset = pendingScheduledAssets[0] ?? null;
  useEffect(() => {
    const nextAssets = new Map(
      scheduledAssets.map((asset) => [
        asset.asset_id,
        directorRealAssetBrowserUrl(asset),
      ] as const),
    );
    const retiredIds: string[] = [];
    for (const [assetId, previousUrl] of QUALIFICATION_RESIDENT_GLTF_URLS) {
      const nextUrl = nextAssets.get(assetId);
      if (nextUrl === previousUrl) continue;
      useGLTF.clear(previousUrl);
      retiredIds.push(assetId);
    }
    QUALIFICATION_RESIDENT_GLTF_URLS.clear();
    for (const [assetId, url] of nextAssets) {
      QUALIFICATION_RESIDENT_GLTF_URLS.set(assetId, url);
    }
    if (retiredIds.length) {
      const retired = new Set(retiredIds);
      setPreparedAssetIds((current) => current.filter((assetId) => !retired.has(assetId)));
      setPreloadErrors((current) => {
        const next = { ...current };
        for (const assetId of retired) delete next[assetId];
        return next;
      });
    }
  }, [scheduledAssets]);

  const preparedScheduledCount = useMemo(
    () =>
      scheduledAssets.filter((asset) => preparedAssetIds.includes(asset.asset_id)).length,
    [preparedAssetIds, scheduledAssets],
  );
  const scheduledPreloadFailures = useMemo(
    () =>
      scheduledAssets.filter((asset) => Boolean(preloadErrors[asset.asset_id])),
    [preloadErrors, scheduledAssets],
  );
  const preparationComplete =
    scheduledAssets.length > 0 &&
    preparedScheduledCount === scheduledAssets.length &&
    scheduledPreloadFailures.length === 0;
  const scheduledCastSlots = useMemo(
    () =>
      new Set(
        plannedClips.flatMap((clip) => clip.roles.map((role) => role.cast_slot_id)),
      ),
    [plannedClips],
  );
  const thinFamilyPools = familyPoolEntries.filter(
    (entry) => entry.candidates.length < 2,
  );

  const supportingMissing = isTrackingQualificationFamily(selectedFamily)
    ? []
    : [scene.secondary_cast_slot, scene.context_cast_slot].filter(
        (slotId) => !(poolFor(resolvedPools, slotId)?.baseline),
      );
  const noPrimaryCoverage = !familyPoolEntries.some((entry) => entry.baseline);
  const canPrepare =
    assetsLoaded &&
    !assetsLoading &&
    !supportingMissing.length &&
    !noPrimaryCoverage &&
    !mountedHostCoverageMissing &&
    plannedClips.length > 0;
  const canRun = canPrepare && physicalInspectionReady && preparationComplete;
  const physicalInspectionErrorCount = Object.keys(physicalInspectionErrors).length;

  const currentClip = manifest?.clips[currentIndex] ?? null;
  const currentPlannedClip = useMemo(() => {
    if (currentClip) {
      return plannedClipFromManifest(currentClip, loadableAssets);
    }
    return plannedClips[0] ?? null;
  }, [currentClip, loadableAssets, plannedClips]);
  const currentCapability =
    currentPlannedClip?.capability ?? familyCapabilities[0] ?? DIRECTOR_CAPABILITIES[0];
  const previewCapability = useMemo(
    () =>
      currentPlannedClip
        ? capabilityForPlannedClip(currentPlannedClip)
        : currentCapability,
    [currentCapability, currentPlannedClip],
  );
  const currentRoles = useMemo(
    () =>
      currentPlannedClip
        ? resolvedRolesForPlannedClip(currentPlannedClip)
        : [],
    [currentPlannedClip],
  );
  const currentFixtureKind = useMemo(
    () => directorVisualAuditDefinition(currentCapability).fixture,
    [currentCapability],
  );
  // A.11A.32: shadow-dependent lighting proofs need real renderer shadow maps,
  // but keep them disabled for every other clip so A.11A.27 preload/render
  // performance remains the default.
  const qualificationShadowsEnabled =
    previewCapability.id === "shadow_projection" ||
    previewCapability.id === "preserve_shadow";
  const currentPrimaryRole = currentPlannedClip?.roles[0] ?? null;
  const currentReview = qualificationReviewForCapability(
    qualificationState,
    currentCapability.id,
  );
  const counts = decisionCounts(qualificationState, activeCapabilityIds);

  const campaignCounts = directorQualificationCampaignCounts(campaignState);
  const selectedCampaignFamily = selectedFamily
    ? directorQualificationCampaignFamilyRecord(campaignState, selectedFamily)
    : null;
  const selectedFamilyReviews = selectedFamily
    ? selectedFamily.capability_ids.map((capabilityId) =>
        qualificationReviewForCapability(qualificationState, capabilityId),
      )
    : [];
  const selectedFamilyLatestEvidenceAtMs = selectedCampaignFamily?.latest_evidence_at
    ? Date.parse(selectedCampaignFamily.latest_evidence_at)
    : Number.NaN;
  const selectedFamilyCurrentReviewCount = selectedFamilyReviews.filter((review) => {
    if (
      review.decision === "qualified" &&
      selectedCampaignFamily?.frozen_capability_ids.includes(review.capability_id)
    ) {
      return true;
    }
    if (review.decision === "unreviewed" || !review.updated_at) return false;
    if (!Number.isFinite(selectedFamilyLatestEvidenceAtMs)) return false;
    return Date.parse(review.updated_at) >= selectedFamilyLatestEvidenceAtMs;
  }).length;
  const selectedFamilyReviewComplete =
    selectedFamilyReviews.length > 0 &&
    selectedFamilyCurrentReviewCount === selectedFamilyReviews.length;
  const selectedFamilyQualifiedCapabilityIds = selectedFamilyReviews
    .filter((review) => review.decision === "qualified")
    .map((review) => review.capability_id);
  const selectedFamilyActionCount = selectedFamilyReviews.filter(
    (review) =>
      review.decision !== "qualified" && review.decision !== "unreviewed",
  ).length;
  const selectedFamilyCanCloseReview =
    Boolean(selectedCampaignFamily) &&
    selectedCampaignFamily?.latest_evidence_integrity === "pass" &&
    selectedCampaignFamily?.status !== "needs_re_evidence" &&
    selectedFamilyReviewComplete;
  const nextCampaignFamilyKey = nextDirectorQualificationCampaignFamilyKey(
    campaignState,
    selectedFamily?.key ?? null,
  );

  const markPreparedAsset = useCallback((assetId: string) => {
    setPreparedAssetIds((current) =>
      current.includes(assetId) ? current : [...current, assetId],
    );
    setPreloadErrors((current) => {
      if (!current[assetId]) return current;
      const next = { ...current };
      delete next[assetId];
      return next;
    });
  }, []);

  const markPreloadError = useCallback((assetId: string, message: string) => {
    setPreloadErrors((current) => ({
      ...current,
      [assetId]: message || "Asset preload failed.",
    }));
  }, []);

  useEffect(() => {
    if (!canPrepare || preparationComplete || !activePreloadAsset) return;
    const assetId = activePreloadAsset.asset_id;
    const assetUrl = directorRealAssetBrowserUrl(activePreloadAsset);
    const timeoutId = window.setTimeout(() => {
      // Remove the unresolved loader entry before exposing Retry preparation so
      // a retry starts from a clean request rather than inheriting a stuck promise.
      useGLTF.clear(assetUrl);
      setPreloadErrors((current) =>
        current[assetId]
          ? current
          : {
              ...current,
              [assetId]: `Asset preload timed out after ${Math.round(
                QUALIFICATION_SINGLE_FLIGHT_PRELOAD_TIMEOUT_MS / 1000,
              )}s. Retry preparation to request it again.`,
            },
      );
    }, QUALIFICATION_SINGLE_FLIGHT_PRELOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [
    activePreloadAsset,
    canPrepare,
    preparationComplete,
    preloadGeneration,
  ]);

  function retryPreparation() {
    // Preserve already-prepared good assets when only one model failed or timed
    // out. This prevents Retry from creating another large parse/upload burst.
    const retryAssets = scheduledPreloadFailures.length
      ? scheduledPreloadFailures
      : scheduledAssets;
    for (const asset of retryAssets) {
      useGLTF.clear(directorRealAssetBrowserUrl(asset));
    }
    const retryIds = new Set(retryAssets.map((asset) => asset.asset_id));
    setPreparedAssetIds((current) =>
      current.filter((assetId) => !retryIds.has(assetId)),
    );
    setPreloadErrors((current) => {
      const next = { ...current };
      for (const assetId of retryIds) delete next[assetId];
      return next;
    });
    setPreloadGeneration((value) => value + 1);
  }

  useEffect(() => {
    qualificationStateRef.current = qualificationState;
  }, [qualificationState]);

  useEffect(() => {
    campaignStateRef.current = campaignState;
  }, [campaignState]);

  useEffect(() => {
    return () => {
      deterministicExportCancelledRef.current = true;
      const active = activeEvidenceCaptureRef.current;
      if (!active) return;
      active.cancelled = true;
      stopQualificationEvidenceCompositor(active);
      if (active.recorder.state !== "inactive") active.recorder.stop();
      active.stream.getTracks().forEach((track) => track.stop());
      activeEvidenceCaptureRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(QUALIFICATION_STORAGE_KEY);
      if (raw) {
        setQualificationState(normalizeDirectorQualificationState(JSON.parse(raw)));
      }
      const rawCast = window.localStorage.getItem(QUALIFICATION_CAST_STORAGE_KEY);
      if (rawCast) {
        const parsed = JSON.parse(rawCast);
        if (parsed && typeof parsed === "object") {
          setCastOverrides(parsed as Record<string, string>);
        }
      }
      const rawCampaign = window.localStorage.getItem(
        DIRECTOR_QUALIFICATION_CAMPAIGN_STORAGE_KEY,
      );
      if (rawCampaign) {
        const normalizedCampaign = normalizeDirectorQualificationCampaignState(
          JSON.parse(rawCampaign),
          families,
        );
        setCampaignState(normalizedCampaign);
        campaignStateRef.current = normalizedCampaign;
        if (normalizedCampaign.current_family_key) {
          setFamilyKey(normalizedCampaign.current_family_key);
        }
      }
    } catch (error) {
      console.warn("Director Qualification Room state could not be restored.", error);
    }
  }, []);

  useEffect(() => {
    if (!selectedFamily) return;
    setSceneId(selectedFamily.recommended_scene_id);
    setManifest(null);
    setCurrentIndex(0);
    setPhase("idle");
    setPaused(false);
    setPhaseClock(stoppedPhaseClock());
    setEvidenceCapturePhase("idle");
    setEvidenceCaptureMessage(null);
    setDeterministicProgress(null);
    deterministicExportCancelledRef.current = true;
  }, [selectedFamily?.key]);

  useEffect(() => {
    setManifest(null);
    setCurrentIndex(0);
    setPhase("idle");
    setPaused(false);
    setPhaseClock(stoppedPhaseClock());
    setEvidenceCapturePhase("idle");
    setEvidenceCaptureMessage(null);
    setDeterministicProgress(null);
    deterministicExportCancelledRef.current = true;
  }, [coverage, sceneId, castOverrides]);

  useEffect(() => {
    if (
      !manifest ||
      !currentClip ||
      paused ||
      phase === "idle" ||
      phase === "complete" ||
      phaseClock.started_at_ms === null
    ) {
      return;
    }

    const limitMs =
      phase === "slate"
        ? currentClip.slate_ms
        : phase === "playing"
          ? currentClip.duration_ms
          : currentClip.gap_ms;
    const scheduledElapsedMs = elapsedPhaseClockMs(phaseClock);
    const remainingMs = Math.max(0, limitMs - scheduledElapsedMs);

    const timer = window.setTimeout(() => {
      const now = performance.now();
      const actualElapsedMs = elapsedPhaseClockMs(phaseClock, now);
      const overshootMs = Math.max(0, actualElapsedMs - limitMs);

      if (phase === "slate") {
        setPhase("playing");
        setPhaseClock({
          started_at_ms: now,
          elapsed_before_start_ms: overshootMs,
        });
        return;
      }

      if (phase === "playing") {
        setPhase("gap");
        setPhaseClock({
          started_at_ms: now,
          elapsed_before_start_ms: overshootMs,
        });
        return;
      }

      if (currentIndex >= manifest.clips.length - 1) {
        setPhase("complete");
        setPhaseClock(stoppedPhaseClock());
        setPaused(false);
        return;
      }

      setCurrentIndex((value) => value + 1);
      setPhase("slate");
      setPhaseClock({
        started_at_ms: now,
        elapsed_before_start_ms: overshootMs,
      });
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [
    currentClip,
    currentIndex,
    manifest,
    paused,
    phase,
    phaseClock,
  ]);

  useEffect(() => {
    if (phase !== "complete" || evidenceCapturePhase !== "recording") return;
    const active = activeEvidenceCaptureRef.current;
    if (!active || active.cancelled) return;

    const timer = window.setTimeout(() => {
      if (active.cancelled || active.recorder.state === "inactive") return;
      // Service the current 30 Hz deadline once more before stopping. The deadline
      // service never submits twice for one intended sequence slot, so this preserves
      // REEL COMPLETE without creating an out-of-band >30 FPS frame.
      const evidenceStoppedAtMs = performance.now();
      serviceQualificationEvidenceDeadline(
        active,
        active.source_canvas,
        evidenceStoppedAtMs,
      );
      active.evidence_window_stopped_performance_ms = evidenceStoppedAtMs;
      stopQualificationEvidenceCompositor(active);
      setEvidenceCapturePhase("packaging");
      setEvidenceCaptureMessage("Finalizing recording and checking evidence integrity…");
      // A.10D intentionally has no periodic timeslice or mid-reel requestData().
      // stop() is the only evidence-window flush so encoder chunk delivery cannot
      // compete with a capability proof in the middle of the gauntlet.
      active.recorder.stop();
    }, DIRECTOR_QUALIFICATION_COMPLETE_HOLD_MS);

    return () => window.clearTimeout(timer);
  }, [evidenceCapturePhase, phase]);

  function persistCampaignState(next: DirectorQualificationCampaignState) {
    campaignStateRef.current = next;
    setCampaignState(next);
    try {
      window.localStorage.setItem(
        DIRECTOR_QUALIFICATION_CAMPAIGN_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch (error) {
      console.warn("Director qualification campaign state could not be persisted.", error);
    }
  }

  function selectCampaignFamily(nextFamilyKey: string) {
    const nextFamily = families.find((family) => family.key === nextFamilyKey);
    if (!nextFamily) return;
    setFamilyKey(nextFamily.key);
    persistCampaignState(
      setDirectorQualificationCampaignCurrentFamily(
        campaignStateRef.current,
        nextFamily.key,
      ),
    );
  }

  function updateSelectedCampaignFamilyNotes(notes: string) {
    if (!selectedFamily) return;
    persistCampaignState(
      updateDirectorQualificationCampaignFamilyNotes(
        campaignStateRef.current,
        selectedFamily,
        notes,
      ),
    );
  }

  function markSelectedFamilyNeedsReEvidence() {
    if (!selectedFamily) return;
    persistCampaignState(
      markDirectorQualificationCampaignNeedsReEvidence(
        campaignStateRef.current,
        selectedFamily,
        "A reviewed capability changed or needs another visual proof. Render a new deterministic reel and send the ZIP for perceptual review.",
      ),
    );
  }

  function closeSelectedFamilyReview(goToNext: boolean) {
    if (!selectedFamily || !selectedFamilyCanCloseReview) return;
    const currentCampaignFamily = directorQualificationCampaignFamilyRecord(
      campaignStateRef.current,
      selectedFamily,
    );
    const reviewed = markDirectorQualificationCampaignFamilyReviewed(
      campaignStateRef.current,
      selectedFamily,
      {
        frozen_capability_ids: selectedFamilyQualifiedCapabilityIds,
        family_notes: currentCampaignFamily.family_notes,
      },
    );
    persistCampaignState(reviewed);

    if (!goToNext) return;
    const nextFamilyKey = nextDirectorQualificationCampaignFamilyKey(
      reviewed,
      selectedFamily.key,
    );
    if (nextFamilyKey) selectCampaignFamily(nextFamilyKey);
  }

  function persistQualificationState(next: DirectorQualificationState) {
    setQualificationState(next);
    try {
      window.localStorage.setItem(QUALIFICATION_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn("Director qualification state could not be persisted.", error);
    }
  }

  function updateReview(
    decision: DirectorQualificationDecision,
    notes = currentReview.notes,
  ) {
    const next: DirectorQualificationState = {
      schema_version: DIRECTOR_QUALIFICATION_SCHEMA_VERSION,
      reviews: {
        ...qualificationState.reviews,
        [currentCapability.id]: {
          capability_id: currentCapability.id,
          decision,
          notes,
          evidence_run_id: currentClip?.run_id ?? null,
          updated_at: new Date().toISOString(),
        },
      },
    };
    persistQualificationState(next);
    if (
      selectedFamily &&
      directorQualificationCampaignFamilyRecord(
        campaignStateRef.current,
        selectedFamily,
      ).latest_evidence_integrity === "pass"
    ) {
      persistCampaignState(
        markDirectorQualificationCampaignReviewInProgress(
          campaignStateRef.current,
          selectedFamily,
        ),
      );
    }
  }

  function setCastOverride(slotId: string, assetId: string) {
    const next = { ...castOverrides };
    if (assetId) next[slotId] = assetId;
    else delete next[slotId];
    setCastOverrides(next);
    try {
      window.localStorage.setItem(
        QUALIFICATION_CAST_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch (error) {
      console.warn("Qualification cast overrides could not be persisted.", error);
    }
  }

  function buildManifest(): DirectorQualificationRecordingManifest {
    const created = new Date();
    const reelId = `QR-${compactTimestamp(created)}`;
    const clips: DirectorQualificationRunClip[] = [];
    let offset = 0;

    for (const planned of plannedClips) {
      const clipIndex = clips.length;
      const runId = `${reelId}-${String(clipIndex + 1).padStart(2, "0")}`;
      const duration = Math.max(1000, planned.capability.demo.duration_ms);
      clips.push({
        run_id: runId,
        sequence_index: clipIndex,
        capability_id: planned.capability.id,
        capability_label: planned.capability.label,
        capability_group: planned.capability.group,
        family_key: selectedFamily.key,
        family_label: selectedFamily.label,
        scene_id: scene.id,
        scene_version: scene.version,
        primary_cast_slot_id: planned.primary_cast_slot_id,
        pass_kind: planned.pass_kind,
        normalization_policy: planned.normalization_policy,
        duration_ms: duration,
        slate_ms: SLATE_MS,
        gap_ms: GAP_MS,
        recording_start_offset_ms: offset,
        relationship_direction_degrees:
          planned.relationship_direction_degrees,
        travel_direction: planned.travel_direction,
        evidence_block_label: planned.evidence_block_label,
        qualification_note: planned.qualification_note,
        merge_compare_with_capability_id:
          planned.merge_compare_with_capability_id,
        physical_resolution: plannedClipPhysicalResolutionEvidence(planned),
        assets: planned.roles.map(manifestAsset),
      });
      offset += SLATE_MS + duration + GAP_MS;
    }

    const distinctAssets = new Set(
      clips.flatMap((clip) =>
        clip.assets.flatMap((asset) => (asset.asset_id ? [asset.asset_id] : [])),
      ),
    );
    const representedSlots = new Set(
      clips.flatMap((clip) => clip.assets.map((asset) => asset.cast_slot_id)),
    );

    return {
      schema_version: DIRECTOR_QUALIFICATION_SCHEMA_VERSION,
      coverage_version: DIRECTOR_QUALIFICATION_COVERAGE_VERSION,
      reel_id: reelId,
      created_at: created.toISOString(),
      family_key: selectedFamily.key,
      family_label: selectedFamily.label,
      scene_id: scene.id,
      scene_version: scene.version,
      coverage_mode: coverage,
      clip_count: clips.length,
      distinct_asset_count: distinctAssets.size,
      represented_cast_slots: Array.from(representedSlots),
      estimated_recording_duration_ms: offset,
      coverage_gaps: plannedCoverageGaps({
        family: selectedFamily,
        capabilities: familyCapabilities,
        coverage,
        clips: plannedClips,
        all_assets: loadableAssets,
        physical_inspections: physicalInspections,
      }),
      clips,
    };
  }

  function runGauntlet() {
    if (!selectedFamily || !canRun || evidenceCaptureBusy) return;
    const next = buildManifest();
    setEvidenceCapturePhase("idle");
    setEvidenceCaptureMessage(null);
    setManifest(next);
    setCurrentIndex(0);
    setPhase("slate");
    setPhaseClock(runningPhaseClock());
    setPaused(false);
  }

  function cancelEvidenceCapture(showMessage = false) {
    deterministicExportCancelledRef.current = true;
    setDeterministicProgress(null);
    const active = activeEvidenceCaptureRef.current;
    if (active) {
      active.cancelled = true;
      stopQualificationEvidenceCompositor(active);
      if (active.recorder.state !== "inactive") active.recorder.stop();
      active.stream.getTracks().forEach((track) => track.stop());
      activeEvidenceCaptureRef.current = null;
    }
    setEvidenceCapturePhase("idle");
    setEvidenceCaptureMessage(
      showMessage ? "Evidence capture cancelled; no package was downloaded." : null,
    );
  }

  async function finalizeEvidenceCapture(active: ActiveEvidenceCapture) {
    stopQualificationEvidenceCompositor(active);
    active.stream.getTracks().forEach((track) => track.stop());
    if (active.cancelled) return;

    try {
      const completedAt = new Date();
      const measuredDurationMs = Math.max(
        0,
        Math.round(performance.now() - active.started_performance_ms),
      );
      const recording = new Blob(active.chunks, { type: active.mime_type });
      if (!recording.size) {
        throw new Error("MediaRecorder produced an empty recording.");
      }

      const mediaDurationMs =
        await measureDirectorQualificationRecordingDurationMs(recording);
      const expectedRecordingDurationMs =
        active.reel_time_zero_recording_offset_ms +
        active.manifest.estimated_recording_duration_ms +
        DIRECTOR_QUALIFICATION_COMPLETE_HOLD_MS;
      const evidenceWindowDurationMs = Math.max(
        1,
        Math.round(
          (active.evidence_window_stopped_performance_ms ?? performance.now()) -
            (active.reel_started_performance_ms ?? active.started_performance_ms),
        ),
      );
      const integrity = evaluateDirectorQualificationEvidenceIntegrity({
        expected_recording_duration_ms: expectedRecordingDurationMs,
        measured_recording_duration_ms: measuredDurationMs,
        evidence_window_duration_ms: evidenceWindowDurationMs,
        media_duration_ms: mediaDurationMs,
        scheduled_frame_count: active.scheduled_frame_count,
        submitted_frame_count: active.submitted_frame_count,
        missed_frame_count: active.missed_frame_count,
        max_consecutive_missed_frames: active.max_consecutive_missed_frames,
        largest_submission_gap_ms: active.largest_submission_gap_ms,
        completion_frame_captured: active.completion_frame_captured,
      });

      const recordingFilename = "recording.webm";
      const manifestFilename = "recording-manifest.json";
      const summaryFilename = "evidence-summary.json";
      const summary: DirectorQualificationEvidenceSummary = {
        schema_version: DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
        status: "complete",
        evidence_integrity: integrity.evidence_integrity,
        integrity_failures: integrity.integrity_failures,
        reel_id: active.manifest.reel_id,
        family_key: active.manifest.family_key,
        family_label: active.manifest.family_label,
        coverage_mode: active.manifest.coverage_mode,
        clip_count: active.manifest.clip_count,
        completed_clip_count: active.manifest.clip_count,
        expected_recording_duration_ms: expectedRecordingDurationMs,
        measured_recording_duration_ms: measuredDurationMs,
        media_duration_ms: mediaDurationMs,
        timeline_drift_ms: integrity.timeline_drift_ms,
        reel_time_zero_recording_offset_ms:
          active.reel_time_zero_recording_offset_ms,
        encoder_warmup_target_ms: DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS,
        encoder_warmup_actual_ms: active.reel_time_zero_recording_offset_ms,
        warmup_scheduled_frame_count: active.warmup_scheduled_frame_count,
        warmup_submitted_frame_count: active.warmup_submitted_frame_count,
        warmup_missed_frame_count: active.warmup_missed_frame_count,
        warmup_largest_submission_gap_ms: Number(
          active.warmup_largest_submission_gap_ms.toFixed(3),
        ),
        evidence_window_duration_ms: evidenceWindowDurationMs,
        recorder_periodic_timeslice: false,
        capture_started_at: active.started_at,
        capture_completed_at: completedAt.toISOString(),
        capture_method: "composited_canvas_capture_stream_media_recorder",
        capture_scope: "webgl_plus_capture_burnin",
        capture_fps: DIRECTOR_QUALIFICATION_CAPTURE_FPS,
        requested_capture_fps: DIRECTOR_QUALIFICATION_CAPTURE_FPS,
        scheduled_frame_count: active.scheduled_frame_count,
        submitted_frame_count: active.submitted_frame_count,
        missed_frame_count: active.missed_frame_count,
        missed_frame_ratio: integrity.missed_frame_ratio,
        max_consecutive_missed_frames: active.max_consecutive_missed_frames,
        effective_submission_fps: integrity.effective_submission_fps,
        largest_submission_gap_ms: Number(
          active.largest_submission_gap_ms.toFixed(3),
        ),
        capture_mime_type: active.mime_type,
        capture_video_bits_per_second:
          DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND,
        canvas_width_px: active.canvas_width_px,
        canvas_height_px: active.canvas_height_px,
        source_canvas_width_px: active.source_canvas_width_px,
        source_canvas_height_px: active.source_canvas_height_px,
        capture_burnin_in_video: true,
        completion_frame_captured: active.completion_frame_captured,
        dom_overlays_in_video: false,
        frame_timing_entry_count: active.frame_timing.length,
        recording_filename: recordingFilename,
        manifest_filename: manifestFilename,
        evidence_summary_filename: summaryFilename,
      };
      const manifestPayload = {
        ...active.manifest,
        qualification_reviews: qualificationStateRef.current.reviews,
        evidence_capture: summary,
        evidence_frame_timing: active.frame_timing,
      };
      const manifestBlob = new Blob([JSON.stringify(manifestPayload, null, 2)], {
        type: "application/json",
      });
      const summaryBlob = new Blob([JSON.stringify(summary, null, 2)], {
        type: "application/json",
      });
      const evidenceZip = await buildDirectorQualificationEvidenceZip(
        [
          { name: recordingFilename, blob: recording },
          { name: manifestFilename, blob: manifestBlob },
          { name: summaryFilename, blob: summaryBlob },
        ],
        completedAt,
      );
      if (active.cancelled) return;
      const familySlug = directorQualificationEvidenceSlug(
        active.manifest.family_label,
      );
      const packageFilename = `director-gauntlet-${familySlug}-${active.manifest.reel_id.toLowerCase()}.zip`;
      downloadDirectorQualificationEvidence(packageFilename, evidenceZip);

      activeEvidenceCaptureRef.current = null;
      setEvidenceCapturePhase("downloaded");
      setEvidenceCaptureMessage(
        `Evidence package downloaded: ${packageFilename} · ${active.manifest.clip_count}/${active.manifest.clip_count} clips · integrity ${integrity.evidence_integrity.toUpperCase()}${integrity.integrity_failures.length ? ` (${integrity.integrity_failures.join(", ")})` : ""}.`,
      );
    } catch (error) {
      activeEvidenceCaptureRef.current = null;
      setEvidenceCapturePhase("error");
      setEvidenceCaptureMessage(
        error instanceof Error
          ? `Evidence packaging failed: ${error.message}`
          : "Evidence packaging failed.",
      );
    }
  }

  async function recordGauntletAndExportEvidence() {
    if (!selectedFamily || !canRun || evidenceCaptureBusy) return;

    setEvidenceCapturePhase("arming");
    setEvidenceCaptureMessage("Arming synchronized evidence compositor…");
    setManifest(null);
    setCurrentIndex(0);
    setPhase("idle");
    setPhaseClock(stoppedPhaseClock());
    setPaused(false);
    setShowCameraPath(false);
    setShowRoleLabels(false);

    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        );
      });

      const sourceCanvas = captureCanvasRef.current;
      if (!sourceCanvas) {
        throw new Error("Qualification Canvas is not ready for capture.");
      }
      if (sourceCanvas.width < 2 || sourceCanvas.height < 2) {
        throw new Error("Qualification Canvas has no captureable pixel surface yet.");
      }

      const captureSurface = document.createElement("canvas");
      captureSurface.width = DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX;
      captureSurface.height = DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX;
      const captureContext = captureSurface.getContext("2d", { alpha: false });
      if (!captureContext) {
        throw new Error("Qualification evidence compositor could not create a 2D canvas.");
      }
      captureContext.fillStyle = "#020617";
      captureContext.fillRect(0, 0, captureSurface.width, captureSurface.height);

      if (typeof captureSurface.captureStream !== "function") {
        throw new Error("This browser does not support HTMLCanvasElement.captureStream().");
      }
      const mimeType = selectDirectorQualificationRecordingMimeType();
      if (!mimeType) {
        throw new Error("This browser does not expose a supported WebM MediaRecorder codec.");
      }

      // A.10B records a dedicated capture canvas at a manual frame cadence. The
      // WebGL Canvas remains the one rendering authority; the compositor only
      // copies its pixels and adds evidence-native labels.
      const stream = captureSurface.captureStream(0);
      const videoTrack = stream.getVideoTracks()[0] as
        | QualificationCaptureTrack
        | undefined;
      if (!videoTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Evidence compositor did not produce a video track.");
      }
      if (typeof videoTrack.requestFrame !== "function") {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(
          "This browser does not support manual CanvasCaptureMediaStreamTrack.requestFrame().",
        );
      }

      const nextManifest = buildManifest();
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND,
      });
      const active: ActiveEvidenceCapture = {
        recorder,
        stream,
        video_track: videoTrack,
        capture_canvas: captureSurface,
        source_canvas: sourceCanvas,
        chunks: [],
        manifest: nextManifest,
        started_at: new Date().toISOString(),
        started_performance_ms: performance.now(),
        reel_started_performance_ms: null,
        evidence_window_stopped_performance_ms: null,
        reel_time_zero_recording_offset_ms: 0,
        warmup_scheduled_frame_count: 0,
        warmup_submitted_frame_count: 0,
        warmup_missed_frame_count: 0,
        warmup_largest_submission_gap_ms: 0,
        mime_type: mimeType,
        canvas_width_px: captureSurface.width,
        canvas_height_px: captureSurface.height,
        source_canvas_width_px: sourceCanvas.width,
        source_canvas_height_px: sourceCanvas.height,
        scheduled_frame_count: 0,
        submitted_frame_count: 0,
        missed_frame_count: 0,
        max_consecutive_missed_frames: 0,
        current_consecutive_missed_frames: 0,
        largest_submission_gap_ms: 0,
        last_submission_performance_ms: null,
        completion_frame_captured: false,
        capture_schedule_started_performance_ms: null,
        next_capture_sequence_index: 0,
        frame_timing: [],
        compositor_timer_id: null,
        cancelled: false,
      };
      activeEvidenceCaptureRef.current = active;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) active.chunks.push(event.data);
      });
      recorder.addEventListener(
        "error",
        () => {
          active.cancelled = true;
          stopQualificationEvidenceCompositor(active);
          active.stream.getTracks().forEach((track) => track.stop());
          activeEvidenceCaptureRef.current = null;
          setEvidenceCapturePhase("error");
          setEvidenceCaptureMessage(
            "MediaRecorder reported a capture failure; no evidence package was exported.",
          );
          setPhase("idle");
          setPaused(false);
          setPhaseClock(stoppedPhaseClock());
        },
        { once: true },
      );
      recorder.addEventListener(
        "stop",
        () => {
          if (active.cancelled) return;
          void finalizeEvidenceCapture(active);
        },
        { once: true },
      );

      // A.10D starts MediaRecorder without a periodic timeslice. Encoder startup
      // and any one-time WebM codec initialization are intentionally absorbed by a visible
      // warm-up interval before reel time zero; no dataavailable flush is requested
      // while qualification evidence is in progress.
      recorder.start();
      startQualificationEvidenceCompositor(active, sourceCanvas);
      setEvidenceCaptureMessage(
        `Encoder warm-up · ${DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS} ms before qualification reel time zero…`,
      );

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS);
      });
      if (
        active.cancelled ||
        active.recorder.state === "inactive" ||
        activeEvidenceCaptureRef.current !== active
      ) {
        return;
      }

      // Service the warm-up deadline one last time, snapshot those diagnostics,
      // then reset every integrity metric so encoder initialization can never
      // masquerade as missing qualification evidence.
      serviceQualificationEvidenceDeadline(active, sourceCanvas, performance.now());
      finalizeQualificationEncoderWarmup(active);

      const reelStartedAtMs = performance.now();
      active.reel_started_performance_ms = reelStartedAtMs;
      active.reel_time_zero_recording_offset_ms = Math.max(
        0,
        Math.round(reelStartedAtMs - active.started_performance_ms),
      );
      setManifest(nextManifest);
      setCurrentIndex(0);
      setPhase("slate");
      setPhaseClock({
        started_at_ms: reelStartedAtMs,
        elapsed_before_start_ms: 0,
      });
      setPaused(false);
      setEvidenceCapturePhase("recording");
      startQualificationEvidenceCompositor(active, sourceCanvas, reelStartedAtMs);
      setEvidenceCaptureMessage(
        `Recording ${nextManifest.clip_count} clips on one authoritative 30 Hz evidence deadline clock through the ${captureSurface.width}×${captureSurface.height} compositor · encoder warm-up complete.`,
      );
    } catch (error) {
      const active = activeEvidenceCaptureRef.current;
      if (active) {
        active.cancelled = true;
        stopQualificationEvidenceCompositor(active);
        if (active.recorder.state !== "inactive") active.recorder.stop();
        active.stream.getTracks().forEach((track) => track.stop());
        activeEvidenceCaptureRef.current = null;
      }
      setEvidenceCapturePhase("error");
      setEvidenceCaptureMessage(
        error instanceof Error
          ? `Evidence capture could not start: ${error.message}`
          : "Evidence capture could not start.",
      );
    }
  }

  async function renderGauntletAndExportEvidenceDeterministically() {
    if (!selectedFamily || !canRun || evidenceCaptureBusy) return;
    const exportFamily = selectedFamily;

    deterministicExportCancelledRef.current = false;
    setEvidenceCapturePhase("arming");
    setEvidenceCaptureMessage("Preparing deterministic WebCodecs evidence export…");
    setManifest(null);
    setCurrentIndex(0);
    setPhase("idle");
    setPhaseClock(stoppedPhaseClock());
    setPaused(true);
    setShowCameraPath(false);
    setShowRoleLabels(false);
    setDeterministicProgress(null);

    let encoder: WebCodecsVideoEncoderLike | null = null;

    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        );
      });

      if (deterministicExportCancelledRef.current) return;

      const sourceCanvas = captureCanvasRef.current;
      const renderFrame = deterministicRenderRequestRef.current;
      if (!sourceCanvas || sourceCanvas.width < 2 || sourceCanvas.height < 2) {
        throw new Error("Qualification Canvas is not ready for deterministic export.");
      }
      if (!renderFrame) {
        throw new Error("Qualification deterministic render bridge is not ready.");
      }

      const webCodecs = globalThis as typeof globalThis & {
        VideoEncoder?: WebCodecsVideoEncoderConstructor;
        VideoFrame?: WebCodecsVideoFrameConstructor;
      };
      const VideoEncoderCtor = webCodecs.VideoEncoder as
        | WebCodecsVideoEncoderConstructor
        | undefined;
      const VideoFrameCtor = webCodecs.VideoFrame as
        | WebCodecsVideoFrameConstructor
        | undefined;
      if (!VideoEncoderCtor || !VideoFrameCtor) {
        throw new Error(
          "This browser does not support the WebCodecs VideoEncoder/VideoFrame APIs required for deterministic qualification export.",
        );
      }

      const captureSurface = document.createElement("canvas");
      captureSurface.width = DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX;
      captureSurface.height = DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX;
      const captureContext = captureSurface.getContext("2d", { alpha: false });
      if (!captureContext) {
        throw new Error("Deterministic evidence exporter could not create a 2D canvas.");
      }
      captureContext.fillStyle = "#020617";
      captureContext.fillRect(0, 0, captureSurface.width, captureSurface.height);

      const encoderConfig: Record<string, unknown> = {
        codec: "vp8",
        width: captureSurface.width,
        height: captureSurface.height,
        bitrate: DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND,
        framerate: DIRECTOR_QUALIFICATION_CAPTURE_FPS,
        latencyMode: "quality",
      };
      const supported = await VideoEncoderCtor.isConfigSupported(encoderConfig);
      if (!supported.supported) {
        throw new Error(
          "WebCodecs is available, but VP8 deterministic encoding is not supported by this browser.",
        );
      }

      const nextManifest = buildManifest();
      const evidenceWindowDurationMs =
        nextManifest.estimated_recording_duration_ms +
        DIRECTOR_QUALIFICATION_COMPLETE_HOLD_MS;
      const frameMs = 1000 / DIRECTOR_QUALIFICATION_CAPTURE_FPS;
      const expectedFrameCount = Math.ceil(
        (evidenceWindowDurationMs * DIRECTOR_QUALIFICATION_CAPTURE_FPS) / 1000,
      );
      const encodedChunks: DirectorQualificationVp8Chunk[] = [];
      const frameTiming: DirectorQualificationEvidenceFrameTiming[] = [];
      let encoderFailure: Error | null = null;
      let maxFrameRenderWallTimeMs = 0;

      encoder = new VideoEncoderCtor({
        output: (chunk) => {
          const data = new ArrayBuffer(chunk.byteLength);
          chunk.copyTo(data);
          encodedChunks.push({
            timestamp_us: chunk.timestamp,
            duration_us:
              chunk.duration ??
              Math.round(1_000_000 / DIRECTOR_QUALIFICATION_CAPTURE_FPS),
            key_frame: chunk.type === "key",
            data,
          });
        },
        error: (error) => {
          encoderFailure =
            error instanceof Error
              ? error
              : new Error(`WebCodecs deterministic encoder failed: ${String(error)}`);
        },
      });
      encoder.configure(supported.config ?? encoderConfig);

      const exportStartedAt = new Date();
      const exportStartedPerformanceMs = performance.now();
      const drawContext: DeterministicEvidenceDrawContext = {
        capture_canvas: captureSurface,
        manifest: nextManifest,
        reel_started_performance_ms: 0,
        completion_frame_captured: false,
      };

      flushSync(() => {
        setManifest(nextManifest);
        setCurrentIndex(0);
        setPhase("slate");
        setPhaseClock(stoppedPhaseClock());
        setPaused(true);
        setEvidenceCapturePhase("rendering");
        setDeterministicProgress(0);
      });
      setEvidenceCaptureMessage(
        `Deterministic export · 0/${expectedFrameCount} logical frames · machine speed affects export time, not movie time.`,
      );

      for (let frameIndex = 0; frameIndex < expectedFrameCount; frameIndex += 1) {
        if (deterministicExportCancelledRef.current) {
          throw new Error("DETERMINISTIC_EXPORT_CANCELLED");
        }
        if (encoderFailure) throw encoderFailure;

        const reelElapsedMs = Math.min(
          evidenceWindowDurationMs,
          frameIndex * frameMs,
        );
        const frameState = deterministicEvidenceFrameState(
          nextManifest,
          reelElapsedMs,
        );
        const frameStartedPerformanceMs = performance.now();

        flushSync(() => {
          setCurrentIndex(frameState.clip_index);
          setPhase(frameState.phase);
          setPhaseClock(stoppedPhaseClock());
          setPaused(true);
          setDeterministicProgress(frameState.progress);
        });

        await renderFrame();
        if (deterministicExportCancelledRef.current) {
          throw new Error("DETERMINISTIC_EXPORT_CANCELLED");
        }

        drawQualificationEvidenceFrame(
          drawContext,
          sourceCanvas,
          performance.now(),
          reelElapsedMs,
        );

        const timestampUs = Math.round(
          (frameIndex * 1_000_000) / DIRECTOR_QUALIFICATION_CAPTURE_FPS,
        );
        const nextTimestampUs = Math.round(
          ((frameIndex + 1) * 1_000_000) / DIRECTOR_QUALIFICATION_CAPTURE_FPS,
        );
        const frameDurationUs = Math.max(1, nextTimestampUs - timestampUs);
        const videoFrame = new VideoFrameCtor(captureSurface, {
          timestamp: timestampUs,
          duration: frameDurationUs,
        });
        encoder.encode(videoFrame, {
          keyFrame:
            frameIndex === 0 ||
            frameIndex % (DIRECTOR_QUALIFICATION_CAPTURE_FPS * 2) === 0,
        });
        videoFrame.close();

        // Backpressure is deterministic: wait for the codec rather than dropping a
        // logical frame. Export may run slower than real time, but the media timestamp
        // for this frame remains frameIndex / 30.
        if (encoder.encodeQueueSize > 8) {
          await encoder.flush();
        }
        if (encoderFailure) throw encoderFailure;

        const renderWallTimeMs =
          performance.now() - frameStartedPerformanceMs;
        maxFrameRenderWallTimeMs = Math.max(
          maxFrameRenderWallTimeMs,
          renderWallTimeMs,
        );
        const identity = qualificationCaptureTimelineState(
          drawContext,
          0,
          reelElapsedMs,
        );
        frameTiming.push({
          sequence_index: frameIndex,
          expected_offset_ms: Number((frameIndex * frameMs).toFixed(3)),
          actual_offset_ms: Number((frameIndex * frameMs).toFixed(3)),
          lateness_ms: 0,
          status: "submitted",
          phase: identity.phase,
          capability_id: identity.clip?.capability_id ?? null,
          run_id: identity.clip?.run_id ?? null,
          render_wall_time_ms: Number(renderWallTimeMs.toFixed(3)),
        });

        if (
          frameIndex === expectedFrameCount - 1 ||
          frameIndex % (DIRECTOR_QUALIFICATION_CAPTURE_FPS * 2) === 0
        ) {
          setEvidenceCaptureMessage(
            `Deterministic export · ${frameIndex + 1}/${expectedFrameCount} logical frames · ${((frameIndex + 1) / expectedFrameCount * 100).toFixed(1)}%.`,
          );
          // Yield UI ownership occasionally. This never advances movie time.
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      await encoder.flush();
      if (encoderFailure) throw encoderFailure;
      encoder.close();
      encoder = null;

      const exportCompletedAt = new Date();
      const exportWallTimeMs = Math.max(
        0,
        Math.round(performance.now() - exportStartedPerformanceMs),
      );
      setEvidenceCapturePhase("packaging");
      setEvidenceCaptureMessage(
        "Muxing deterministic VP8 frames and validating evidence integrity…",
      );

      const recording = buildDirectorQualificationVp8WebM({
        width: captureSurface.width,
        height: captureSurface.height,
        fps: DIRECTOR_QUALIFICATION_CAPTURE_FPS,
        duration_ms: evidenceWindowDurationMs,
        chunks: encodedChunks,
      });
      const mediaDurationMs =
        await measureDirectorQualificationRecordingDurationMs(recording);
      const integrity = evaluateDirectorQualificationEvidenceIntegrity({
        expected_recording_duration_ms: evidenceWindowDurationMs,
        measured_recording_duration_ms:
          mediaDurationMs ?? evidenceWindowDurationMs,
        evidence_window_duration_ms: evidenceWindowDurationMs,
        media_duration_ms: mediaDurationMs,
        scheduled_frame_count: expectedFrameCount,
        submitted_frame_count: frameTiming.length,
        missed_frame_count: 0,
        max_consecutive_missed_frames: 0,
        largest_submission_gap_ms: frameMs,
        completion_frame_captured: drawContext.completion_frame_captured,
        expected_encoded_frame_count: expectedFrameCount,
        encoded_frame_count: encodedChunks.length,
      });

      const recordingFilename = "recording.webm";
      const manifestFilename = "recording-manifest.json";
      const summaryFilename = "evidence-summary.json";
      const summary: DirectorQualificationEvidenceSummary = {
        schema_version: DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
        status: "complete",
        evidence_integrity: integrity.evidence_integrity,
        integrity_failures: integrity.integrity_failures,
        reel_id: nextManifest.reel_id,
        family_key: nextManifest.family_key,
        family_label: nextManifest.family_label,
        coverage_mode: nextManifest.coverage_mode,
        clip_count: nextManifest.clip_count,
        completed_clip_count: nextManifest.clip_count,
        expected_recording_duration_ms: evidenceWindowDurationMs,
        measured_recording_duration_ms:
          mediaDurationMs ?? evidenceWindowDurationMs,
        media_duration_ms: mediaDurationMs,
        timeline_drift_ms: integrity.timeline_drift_ms,
        reel_time_zero_recording_offset_ms: 0,
        encoder_warmup_target_ms: 0,
        encoder_warmup_actual_ms: 0,
        warmup_scheduled_frame_count: 0,
        warmup_submitted_frame_count: 0,
        warmup_missed_frame_count: 0,
        warmup_largest_submission_gap_ms: 0,
        evidence_window_duration_ms: evidenceWindowDurationMs,
        recorder_periodic_timeslice: false,
        deterministic_frame_export: true,
        expected_frame_count: expectedFrameCount,
        rendered_frame_count: frameTiming.length,
        encoded_frame_count: encodedChunks.length,
        export_wall_time_ms: exportWallTimeMs,
        max_frame_render_wall_time_ms: Number(
          maxFrameRenderWallTimeMs.toFixed(3),
        ),
        webcodecs_codec: "vp8",
        capture_started_at: exportStartedAt.toISOString(),
        capture_completed_at: exportCompletedAt.toISOString(),
        capture_method: "deterministic_webcodecs_vp8_frame_export",
        capture_scope: "webgl_plus_capture_burnin",
        capture_fps: DIRECTOR_QUALIFICATION_CAPTURE_FPS,
        requested_capture_fps: DIRECTOR_QUALIFICATION_CAPTURE_FPS,
        scheduled_frame_count: expectedFrameCount,
        submitted_frame_count: frameTiming.length,
        missed_frame_count: 0,
        missed_frame_ratio: integrity.missed_frame_ratio,
        max_consecutive_missed_frames: 0,
        effective_submission_fps: integrity.effective_submission_fps,
        largest_submission_gap_ms: Number(frameMs.toFixed(3)),
        capture_mime_type: "video/webm;codecs=vp8",
        capture_video_bits_per_second:
          DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND,
        canvas_width_px: captureSurface.width,
        canvas_height_px: captureSurface.height,
        source_canvas_width_px: sourceCanvas.width,
        source_canvas_height_px: sourceCanvas.height,
        capture_burnin_in_video: true,
        completion_frame_captured: drawContext.completion_frame_captured,
        dom_overlays_in_video: false,
        frame_timing_entry_count: frameTiming.length,
        recording_filename: recordingFilename,
        manifest_filename: manifestFilename,
        evidence_summary_filename: summaryFilename,
      };
      const manifestPayload = {
        ...nextManifest,
        qualification_reviews: qualificationStateRef.current.reviews,
        evidence_capture: summary,
        evidence_frame_timing: frameTiming,
      };
      const manifestBlob = new Blob([JSON.stringify(manifestPayload, null, 2)], {
        type: "application/json",
      });
      const summaryBlob = new Blob([JSON.stringify(summary, null, 2)], {
        type: "application/json",
      });
      const evidenceZip = await buildDirectorQualificationEvidenceZip(
        [
          { name: recordingFilename, blob: recording },
          { name: manifestFilename, blob: manifestBlob },
          { name: summaryFilename, blob: summaryBlob },
        ],
        exportCompletedAt,
      );

      if (deterministicExportCancelledRef.current) return;
      const familySlug = directorQualificationEvidenceSlug(
        nextManifest.family_label,
      );
      const packageFilename = `director-gauntlet-${familySlug}-${nextManifest.reel_id.toLowerCase()}.zip`;
      downloadDirectorQualificationEvidence(packageFilename, evidenceZip);
      persistCampaignState(
        recordDirectorQualificationCampaignEvidence(
          campaignStateRef.current,
          exportFamily,
          {
            reel_id: nextManifest.reel_id,
            integrity: integrity.evidence_integrity,
            coverage_mode: nextManifest.coverage_mode,
            evidence_at: exportCompletedAt.toISOString(),
          },
        ),
      );

      flushSync(() => {
        setCurrentIndex(Math.max(0, nextManifest.clips.length - 1));
        setPhase("complete");
        setPhaseClock(stoppedPhaseClock());
        setPaused(false);
        setDeterministicProgress(null);
      });
      setEvidenceCapturePhase("downloaded");
      setEvidenceCaptureMessage(
        `Deterministic evidence package downloaded: ${packageFilename} · ${frameTiming.length}/${expectedFrameCount} frames · integrity ${integrity.evidence_integrity.toUpperCase()}${integrity.integrity_failures.length ? ` (${integrity.integrity_failures.join(", ")})` : ""}.`,
      );
    } catch (error) {
      try {
        encoder?.close();
      } catch {
        // Ignore codec shutdown errors while handling the original export failure.
      }
      encoder = null;
      setDeterministicProgress(null);

      if (
        error instanceof Error &&
        error.message === "DETERMINISTIC_EXPORT_CANCELLED"
      ) {
        setEvidenceCapturePhase("idle");
        setEvidenceCaptureMessage(
          "Deterministic evidence export cancelled; no package was downloaded.",
        );
        return;
      }

      setEvidenceCapturePhase("error");
      setEvidenceCaptureMessage(
        error instanceof Error
          ? `Deterministic evidence export failed: ${error.message}`
          : "Deterministic evidence export failed.",
      );
    }
  }

  function stopGauntlet() {
    if (
      activeEvidenceCaptureRef.current ||
      evidenceCapturePhase === "arming" ||
      evidenceCapturePhase === "rendering"
    ) {
      cancelEvidenceCapture(true);
    }
    setDeterministicProgress(null);
    setPhase("idle");
    setPaused(false);
    setPhaseClock(stoppedPhaseClock());
    setCurrentIndex(0);
  }

  function togglePaused() {
    if (evidenceCaptureBusy || phase === "idle" || phase === "complete") return;
    const now = performance.now();

    if (paused) {
      setPhaseClock((current) => ({
        started_at_ms: now,
        elapsed_before_start_ms: current.elapsed_before_start_ms,
      }));
      setPaused(false);
      return;
    }

    setPhaseClock((current) =>
      stoppedPhaseClock(elapsedPhaseClockMs(current, now)),
    );
    setPaused(true);
  }

  function exportManifest() {
    if (!selectedFamily || !plannedClips.length || evidenceCaptureBusy) return;
    const output = manifest ?? buildManifest();
    downloadJson(`${output.reel_id.toLowerCase()}-recording-manifest.json`, {
      ...output,
      qualification_reviews: qualificationState.reviews,
    });
  }

  function jumpToClip(index: number) {
    if (!manifest) return;
    setCurrentIndex(index);
    setPhase("slate");
    setPhaseClock(stoppedPhaseClock());
    setPaused(true);
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={eyebrowStyle}>MyWay Probe Lab · Director Capability Library</div>
            <h1 style={titleStyle}>Director Qualification Room</h1>
            <p style={subtitleStyle}>
              Run repeatable Level 2 auditions with a stable baseline plus rotating
              real-asset coverage. Each run normalizes asset scale before judging the
              capability, so bad source sizing is not mistaken for bad directing.
            </p>
          </div>
          <DirectorLibraryTabs
            activeTab="qualification"
            onTabChange={(tab) => {
              if (tab === "capabilities") onOpenCapabilities();
            }}
          />
        </header>

        <section style={statsStyle}>
          <Stat label="Level 2" value={DIRECTOR_CAPABILITIES.length} />
          <Stat label="Qualified" value={counts.qualified} />
          <Stat
            label="Needs action"
            value={
              counts.fix +
              counts.merge_candidate +
              counts.redefine +
              counts.restrict +
              counts.retire
            }
          />
          <Stat label="Unreviewed" value={counts.unreviewed} />
        </section>

        <section style={campaignCardStyle}>
          <div style={campaignHeaderStyle}>
            <div style={{ display: "grid", gap: 4 }}>
              <span style={eyebrowStyle}>Qualification campaign · A.11A</span>
              <strong style={{ fontSize: 20 }}>
                One family → deterministic evidence ZIP → ChatGPT + human review
              </strong>
              <span style={mutedStyle}>
                A.11A is the campaign notebook, not an automated judge. Render one family
                with A.10F, send that ZIP to ChatGPT for perceptual review, record the
                capability decisions here, freeze the siblings that passed, then continue
                or re-evidence only what changed.
              </span>
            </div>
            <code style={runCodeStyle}>{campaignState.campaign_id}</code>
          </div>

          <div style={campaignStatsStyle}>
            <Stat label="Families" value={campaignCounts.family_count} />
            <Stat label="Reviewed" value={campaignCounts.reviewed} />
            <Stat
              label="Awaiting review"
              value={
                campaignCounts.awaiting_perceptual_review +
                campaignCounts.review_in_progress
              }
            />
            <Stat label="Needs re-evidence" value={campaignCounts.needs_re_evidence} />
            <Stat label="Frozen capabilities" value={campaignCounts.frozen_capability_count} />
          </div>

          {selectedCampaignFamily && selectedFamily ? (
            <div style={campaignFocusStyle}>
              <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
                <span style={campaignStatusStyle}>
                  {
                    DIRECTOR_QUALIFICATION_CAMPAIGN_FAMILY_STATUS_LABELS[
                      selectedCampaignFamily.status
                    ]
                  }
                </span>
                <strong style={{ fontSize: 17 }}>{selectedFamily.label}</strong>
                <span style={mutedStyle}>
                  {selectedFamily.capability_ids.length} capabilities ·{" "}
                  {selectedFamilyCurrentReviewCount}/{selectedFamily.capability_ids.length} current decisions ·{" "}
                  {selectedFamilyQualifiedCapabilityIds.length} qualified ·{" "}
                  {selectedFamilyActionCount} need action
                </span>
                <span style={mutedStyle}>
                  Evidence:{" "}
                  {selectedCampaignFamily.latest_evidence_reel_id
                    ? `${selectedCampaignFamily.latest_evidence_reel_id} · ${selectedCampaignFamily.latest_evidence_integrity?.toUpperCase() ?? "UNKNOWN"} · ${selectedCampaignFamily.latest_evidence_coverage_mode ?? "unknown coverage"}`
                    : "none attached yet — the next successful A.10F export will attach automatically"}
                </span>
                {selectedCampaignFamily.re_evidence_reason ? (
                  <span style={campaignNeedsEvidenceStyle}>
                    {selectedCampaignFamily.re_evidence_reason}
                  </span>
                ) : null}
              </div>

              <div style={campaignActionsStyle}>
                <button
                  type="button"
                  onClick={() => closeSelectedFamilyReview(false)}
                  disabled={!selectedFamilyCanCloseReview || evidenceCaptureBusy}
                  style={primaryButtonStyle}
                >
                  Save family review
                </button>
                <button
                  type="button"
                  onClick={() => closeSelectedFamilyReview(true)}
                  disabled={!selectedFamilyCanCloseReview || evidenceCaptureBusy}
                  style={buttonStyle}
                >
                  Save review & go to next family
                </button>
                <button
                  type="button"
                  onClick={markSelectedFamilyNeedsReEvidence}
                  disabled={evidenceCaptureBusy}
                  style={buttonStyle}
                >
                  Needs re-evidence
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (nextCampaignFamilyKey) selectCampaignFamily(nextCampaignFamilyKey);
                  }}
                  disabled={!nextCampaignFamilyKey || evidenceCaptureBusy}
                  style={buttonStyle}
                >
                  Go to next unresolved family
                </button>
              </div>
            </div>
          ) : null}

          <label style={campaignNotesStyle}>
            <span>Family review notes</span>
            <textarea
              value={selectedCampaignFamily?.family_notes ?? ""}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                updateSelectedCampaignFamilyNotes(event.target.value)
              }
              rows={3}
              placeholder="Summarize the ChatGPT/human review at family level: what is frozen, what needs repair, and what comparison should be rerun."
              style={notesStyle}
            />
          </label>

          {selectedCampaignFamily &&
          selectedCampaignFamily.latest_evidence_integrity !== "pass" ? (
            <div style={campaignInstructionStyle}>
              <strong>Evidence gate.</strong>
              <span>
                A family cannot be closed until a deterministic A.10F reel is attached with
                evidence_integrity: PASS. Render the family below, send the ZIP to ChatGPT,
                then record the visual decisions in Human qualification.
              </span>
            </div>
          ) : !selectedFamilyReviewComplete ? (
            <div style={campaignInstructionStyle}>
              <strong>Perceptual review gate.</strong>
              <span>
                Evidence is technically valid. Send the ZIP to ChatGPT, judge every
                capability, and assign Qualified / Fix / Merge / Redefine / Restrict /
                Retire / Blocked before closing this family.
              </span>
            </div>
          ) : (
            <div style={campaignInstructionStyle}>
              <strong>Ready to close.</strong>
              <span>
                All capability decisions are recorded against PASS evidence. Saving the
                family review freezes only the capabilities marked Qualified; action items
                remain visible for targeted repair.
              </span>
            </div>
          )}

          <details style={detailsStyle}>
            <summary style={summaryStyle}>
              Campaign family board · {campaignCounts.reviewed}/{campaignCounts.family_count} reviewed
            </summary>
            <div style={campaignFamilyListStyle}>
              {families.map((family, index) => {
                const campaignFamily = directorQualificationCampaignFamilyRecord(
                  campaignState,
                  family,
                );
                return (
                  <button
                    key={family.key}
                    type="button"
                    onClick={() => selectCampaignFamily(family.key)}
                    disabled={evidenceCaptureBusy}
                    style={{
                      ...campaignFamilyRowStyle,
                      ...(family.key === selectedFamily?.key
                        ? activeCampaignFamilyRowStyle
                        : null),
                    }}
                  >
                    <span style={queueIndexStyle}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
                      <strong>{family.label}</strong>
                      <small style={mutedStyle}>
                        {family.capability_ids.length} capabilities ·{" "}
                        {campaignFamily.latest_evidence_reel_id
                          ? `evidence ${campaignFamily.latest_evidence_integrity?.toUpperCase() ?? "unknown"}`
                          : "no campaign evidence"}{" "}
                        · {campaignFamily.frozen_capability_ids.length} frozen
                      </small>
                    </span>
                    <span style={campaignFamilyStatusPillStyle}>
                      {
                        DIRECTOR_QUALIFICATION_CAMPAIGN_FAMILY_STATUS_LABELS[
                          campaignFamily.status
                        ]
                      }
                    </span>
                  </button>
                );
              })}
            </div>
          </details>
        </section>

        <section style={controlCardStyle}>
          <div style={threeColumnControlsStyle}>
            <label style={fieldStyle}>
              <span>Audition family</span>
              <select
                value={selectedFamily?.key ?? ""}
                disabled={evidenceCaptureBusy}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  selectCampaignFamily(event.target.value)
                }
                style={selectStyle}
              >
                {families.map((family) => (
                  <option key={family.key} value={family.key}>
                    {family.label} · {family.capability_ids.length}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldStyle}>
              <span>Canonical scene</span>
              <select
                value={sceneId}
                disabled={evidenceCaptureBusy}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setSceneId(event.target.value as DirectorQualificationSceneId)
                }
                style={selectStyle}
              >
                {DIRECTOR_QUALIFICATION_SCENES.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.short_label} · {candidate.title}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldStyle}>
              <span>Asset coverage</span>
              <select
                value={coverage}
                disabled={evidenceCaptureBusy}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setCoverage(event.target.value as DirectorQualificationCoverageMode)
                }
                style={selectStyle}
              >
                <option value="baseline">Baseline · stable comparison</option>
                <option value="cross_asset">Cross-asset · baseline + diversity</option>
                <option value="full_cast">Full · + physical-size stress</option>
              </select>
            </label>
          </div>

          <div style={sceneSummaryStyle}>
            <div style={{ display: "grid", gap: 3 }}>
              <strong>
                {scene.short_label} · {scene.title}
              </strong>
              <span style={mutedStyle}>{scene.purpose}</span>
            </div>
            <div style={queueSummaryStyle}>
              <strong>{familyCapabilities.length}</strong>
              <span>capabilities</span>
              <strong>{passKinds(coverage).length}</strong>
              <span>passes each</span>
              <strong>{plannedClips.length}</strong>
              <span>auditions</span>
            </div>
          </div>

          <div style={coverageStripStyle}>
            <span>
              <strong>{familyPoolEntries.length}</strong> geometry classes
            </span>
            <span>
              <strong>{familyPoolAssetCount}</strong> real assets in this family pool
            </span>
            <span>
              <strong>{scheduledAssetIds.size}</strong> distinct assets scheduled
            </span>
            <span>
              <strong>{globalPoolAssetCount}</strong> distinct assets across all qualification pools
            </span>
            <span>
              Scale guard: <strong>{selectedFamily?.normalization_policy === "physical_context" ? "physical context" : "fair display"}</strong>
              {coverage === "full_cast" ? " + physical stress" : ""}
            </span>
          </div>

          {selectedFamily?.group === "Tracking & attached camera" ? (
            <div style={softWarningStyle}>
              <strong>Tracking sibling-comparison plan.</strong>{" "}
              Follow / Lead / Lag / Track Parallel run on the same Character in
              Baseline and the same Vehicle in Cross-asset so camera grammar—not
              changing geometry—creates the difference. Directional actors are
              aligned to the authored travel heading independently of Asset Library
              default facing. Object-attached camera remains vehicle-gated but now also
              requires a canonical body-mount host (car/hood/body reference) before it is
              scheduled; open-frame bicycle-style vehicles wait for a specialized mount
              primitive instead of producing false empty-road evidence. It compiles through
              the same canonical mounted-camera primitive as Object-attached view, and
              remains the legacy merge/deprecation candidate. Tracking reels now use only
              the real primary actor plus the lightweight procedural corridor; arbitrary
              supporting GLBs are intentionally excluded so they cannot contaminate the camera evidence.
            </div>
          ) : null}
        </section>

        {assetError ? (
          <div style={errorStyle}>
            <strong>Asset Library unavailable.</strong>
            <span>{assetError}</span>
            <button type="button" onClick={onRequestAssets} style={buttonStyle}>
              Retry
            </button>
          </div>
        ) : null}

        {noPrimaryCoverage || supportingMissing.length ? (
          <div style={warningStyle}>
            <strong>Qualification asset coverage needs attention.</strong>
            <span>
              {noPrimaryCoverage
                ? "No reviewed browser-loadable primary asset matches this family's geometry classes. "
                : ""}
              {supportingMissing.length
                ? `Supporting class missing: ${supportingMissing.join(", ")}. `
                : ""}
              Open Asset coverage & normalization below to choose a baseline override.
            </span>
          </div>
        ) : null}

        {selectedFamily?.category === "camera_angle" &&
        selectedFamily.group === "Special viewpoints" ? (
          <div style={softWarningStyle}>
            Inside-object is deferred from active Qualification Room coverage until
            MyWay has interior-safe asset/directability metadata. The capability remains
            in the frozen Director vocabulary; this reel qualifies only Isometric and
            Object-attached.
          </div>
        ) : null}

        {selectedFamily?.category === "camera_framing" &&
        selectedFamily.group === "Detail & relationship framing" ? (
          <div style={softWarningStyle}>
            Macro remains deferred until reviewed assets expose semantic feature/sub-part
            anchors. Cutaway remains deferred to narrative/editing grammar. Point of view
            is now deferred until directable assets expose a semantic viewpoint anchor plus
            a trustworthy forward axis; a bounds-derived camera origin is not enough visual
            proof. This reel qualifies Insert, Two shot, Group shot, and Over shoulder. OTS
            keeps a Character foreground source while diversity varies the viewed target.
            Group shot uses a camera-view-right left/centre/right qualification cluster so
            all three actors must remain distinct in projected screen space.
          </div>
        ) : null}

        {selectedFamily?.category === "camera_movement" &&
        selectedFamily.group === "Complex camera paths" ? (
          <div style={softWarningStyle}>
            Pass through is deferred until asset/scene directability can identify a
            genuine traversable opening or representation boundary. The active reel
            now qualifies Spline only, using an explicit target-relative multi-waypoint
            Catmull-Rom rail instead of the legacy no-waypoint sinusoidal fallback.
          </div>
        ) : null}

        {selectedFamily?.category === "camera_framing" &&
        selectedFamily.group === "Shot scale" ? (
          <div style={softWarningStyle}>
            Extreme close is deferred until a semantic region / feature anchor can
            identify the meaningful tiny region instead of magnifying an arbitrary
            bounds centre. Extreme wide, Wide, and Full keep their established framing.
            Medium wide through Close now use an ordered upper-subject crop ladder for
            tall/upright single subjects while arbitrary non-tall Diversity assets retain
            geometric-centre framing.
          </div>
        ) : null}

        {selectedFamily?.category === "camera_framing" &&
        selectedFamily.group === "Lens" ? (
          <div style={softWarningStyle}>
            Macro lens, Shallow focus, and Deep focus are deferred from active
            Qualification. Macro lens waits for semantic feature anchors plus a real
            close-focus / magnification model; Shallow/Deep focus wait for rendered
            depth-of-field. This reel compares only Ultra-wide, Wide, Normal, Portrait,
            and Telephoto using the same three assets and identical near/mid/far blocking
            within each pass so focal length / FOV is the only intended visual variable.
          </div>
        ) : null}

        {mountedHostCoverageMissing ? (
          <div style={softWarningStyle}>
            Mounted-camera evidence is blocked: the Vehicle pool has no reviewed asset
            with a canonical body/hood/bodywork mount reference. Add or override a
            solid-bodied mount-suitable vehicle rather than substituting a character or
            open-frame bicycle.
          </div>
        ) : null}

        {thinFamilyPools.length ? (
          <div style={softWarningStyle}>
            Coverage note: {thinFamilyPools.map((entry) => entry.slot.label).join(", ")} currently
            {thinFamilyPools.length === 1 ? " has" : " have"} fewer than two matching reviewed assets.
            The gauntlet will not substitute unrelated models just to inflate coverage.
          </div>
        ) : null}

        <section ref={hostRef} style={auditionCardStyle}>
          <div style={auditionHeaderStyle}>
            <div style={{ display: "grid", gap: 4 }}>
              <span style={eyebrowStyle}>Recording viewport</span>
              <strong>
                {currentCapability.label} · {scene.short_label}
              </strong>
              <span style={mutedStyle}>
                Fixed 16:9 frame for Windows Snipping Tool recordings. A.10B records the same
                WebGL authority through a synchronized 1280×720 evidence compositor with
                capture-native clip labels, timeline checks, and a recorded REEL COMPLETE frame.
              </span>
            </div>
            <div style={headerBadgesStyle}>
              <span style={badgeStyle}>
                {manifest
                  ? `${Math.min(currentIndex + 1, manifest.clip_count)}/${manifest.clip_count}`
                  : `${plannedClips.length} planned`}
              </span>
              <span style={badgeStyle}>
                {currentPlannedClip ? PASS_LABELS[currentPlannedClip.pass_kind] : "waiting"}
              </span>
              <span style={badgeStyle}>
                {phase === "idle" ? "ready" : paused ? "paused" : phase}
              </span>
            </div>
          </div>

          <div style={recordingViewportStyle}>
            {!assetsLoaded || assetsLoading ? (
              <div style={viewerMessageStyle}>
                <strong>
                  {assetsLoading
                    ? "Loading qualification asset index…"
                    : "Starting qualification asset request…"}
                </strong>
              </div>
            ) : !currentPlannedClip || !canPrepare ? (
              <div style={viewerMessageStyle}>
                <strong>Resolve the missing qualification asset classes first.</strong>
              </div>
            ) : (
              <Canvas
                camera={{ position: [5.8, 3.1, 6.8], fov: 42, near: 0.05, far: 90 }}
                dpr={1}
                frameloop="demand"
                gl={{
                  antialias: false,
                  alpha: false,
                  powerPreference: "low-power",
                  // A.10B compositor copies the presented WebGL bitmap into a
                  // dedicated evidence canvas. Preserve the completed draw long
                  // enough for that readback without adding a second WebGL renderer.
                  preserveDrawingBuffer: true,
                }}
                shadows={qualificationShadowsEnabled}
              >
                <QualificationCaptureCanvasBridge
                  active={evidenceCapturePhase === "recording"}
                  onCanvas={registerCaptureCanvas}
                  onRenderRequest={registerDeterministicRenderRequest}
                />

                {!preparationComplete && activePreloadAsset ? (
                  <QualificationPreloadBoundary
                    key={`${activePreloadAsset.asset_id}:${activePreloadAsset.public_path}:${preloadGeneration}`}
                    resetKey={`${activePreloadAsset.asset_id}:${activePreloadAsset.public_path}:${preloadGeneration}`}
                    assetId={activePreloadAsset.asset_id}
                    onError={markPreloadError}
                  >
                    <Suspense fallback={null}>
                      <QualificationAssetPreloader
                        asset={activePreloadAsset}
                        onReady={markPreparedAsset}
                      />
                    </Suspense>
                  </QualificationPreloadBoundary>
                ) : null}

                {preparationComplete ? (
                  <QualificationPlaybackPreview
                    capability={previewCapability}
                    roles={currentRoles}
                    phase={phase}
                    paused={paused}
                    phaseClock={phaseClock}
                    durationMs={currentClip?.duration_ms ?? currentCapability.demo.duration_ms}
                    showCameraPath={showCameraPath}
                    showRoleLabels={showRoleLabels}
                    fixtureKind={currentFixtureKind}
                    deterministicProgress={deterministicProgress}
                  />
                ) : null}
              </Canvas>
            )}

            {canPrepare && !preparationComplete ? (
              <div style={preparationOverlayStyle}>
                <span style={slateEyebrowStyle}>PREPARING AUDITION REEL</span>
                <strong>
                  {scheduledPreloadFailures.length
                    ? `${scheduledPreloadFailures.length} asset preload failed`
                    : activePreloadAsset
                      ? `${preparedScheduledCount}/${scheduledAssets.length} assets ready · loading ${assetLabel(activePreloadAsset)}`
                      : `${preparedScheduledCount}/${scheduledAssets.length} assets ready`}
                </strong>
                <span>
                  {scheduledPreloadFailures.length
                    ? "Retry preparation before recording so a broken load is never mistaken for a capability failure."
                    : "The reel will unlock only after every scheduled real asset is cached."}
                </span>
              </div>
            ) : null}

            {phase === "slate" && currentClip ? (
              <div style={slateStyle}>
                <span style={slateEyebrowStyle}>DIRECTOR AUDITION</span>
                <strong style={slateTitleStyle}>{currentClip.capability_label}</strong>
                <span>
                  {scene.short_label} · {PASS_LABELS[currentClip.pass_kind]}
                </span>
                {currentClip.evidence_block_label ? (
                  <span>{currentClip.evidence_block_label}</span>
                ) : null}
                <span>
                  {currentClip.assets[0]?.asset_label ?? currentClip.primary_cast_slot_id} ·{" "}
                  {currentClip.assets[0]?.target_extent_m.toFixed(2)} m audition extent
                  {typeof currentClip.relationship_direction_degrees === "number"
                    ? ` · facing ${currentClip.relationship_direction_degrees.toFixed(0)}° travel`
                    : ""}
                </span>
                {currentClip.merge_compare_with_capability_id ? (
                  <span>
                    MERGE / DEPRECATION CHECK · compare with {currentClip.merge_compare_with_capability_id}
                  </span>
                ) : null}
                <code style={runCodeStyle}>{currentClip.run_id}</code>
              </div>
            ) : null}

            {phase === "complete" && manifest ? (
              <div style={completeSlateStyle}>
                <span style={completeEyebrowStyle}>REEL COMPLETE</span>
                <strong style={completeTitleStyle}>{manifest.family_label}</strong>
                <span>
                  {manifest.clip_count} auditions finished · safe to stop the Snipping Tool recording.
                </span>
                <code style={runCodeStyle}>{manifest.reel_id}</code>
              </div>
            ) : null}

            <div style={burnInStyle}>
              <span>{currentClip?.run_id ?? "QUALIFICATION PREVIEW"}</span>
              <span>{currentPrimaryRole ? assetLabel(currentPrimaryRole.asset) : "no asset"}</span>
              {currentPrimaryRole ? (
                <span>{currentPrimaryRole.normalization.target_extent_m.toFixed(2)}m</span>
              ) : null}
            </div>
          </div>

          <div style={transportStyle}>
            <button
              type="button"
              onClick={runGauntlet}
              disabled={!canRun || evidenceCaptureBusy}
              style={primaryButtonStyle}
            >
              {!physicalInspectionReady && isSupportContainmentQualificationFamily(selectedFamily)
                ? "Inspecting real physical surfaces…"
                : canPrepare && !preparationComplete
                  ? `Preparing ${preparedScheduledCount}/${scheduledAssets.length} assets…`
                  : "Run family gauntlet"}
            </button>
            <button
              type="button"
              onClick={() => void renderGauntletAndExportEvidenceDeterministically()}
              disabled={!canRun || evidenceCaptureBusy}
              style={buttonStyle}
            >
              {evidenceCapturePhase === "arming"
                ? "Preparing deterministic export…"
                : evidenceCapturePhase === "rendering"
                  ? "Rendering deterministic evidence…"
                  : evidenceCapturePhase === "recording"
                    ? "Recording legacy evidence…"
                    : evidenceCapturePhase === "packaging"
                      ? "Packaging evidence…"
                      : "Render gauntlet + export evidence"}
            </button>
            {isSupportContainmentQualificationFamily(selectedFamily) && physicalInspectionReady ? (
              <span style={transportMetaStyle}>
                Physical mesh inspection: {physicalInspectionCandidates.length - physicalInspectionErrorCount}/{physicalInspectionCandidates.length} ready
                {physicalInspectionErrorCount ? ` · ${physicalInspectionErrorCount} unavailable` : ""}
              </span>
            ) : null}
            {scheduledPreloadFailures.length ? (
              <button
                type="button"
                onClick={retryPreparation}
                style={buttonStyle}
              >
                Retry preparation
              </button>
            ) : null}
            <button
              type="button"
              onClick={togglePaused}
              disabled={evidenceCaptureBusy || phase === "idle" || phase === "complete"}
              style={buttonStyle}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={stopGauntlet}
              disabled={
                evidenceCapturePhase === "packaging" ||
                (phase === "idle" && !manifest)
              }
              style={buttonStyle}
            >
              Stop
            </button>
            <button
              type="button"
              onClick={exportManifest}
              disabled={!selectedFamily || !plannedClips.length || evidenceCaptureBusy}
              style={buttonStyle}
            >
              Export recording manifest
            </button>
            <label style={toggleStyle}>
              <input
                type="checkbox"
                checked={showCameraPath}
                disabled={evidenceCaptureBusy}
                onChange={(event) => setShowCameraPath(event.target.checked)}
              />
              camera path
            </label>
            <label style={toggleStyle}>
              <input
                type="checkbox"
                checked={showRoleLabels}
                disabled={evidenceCaptureBusy}
                onChange={(event) => setShowRoleLabels(event.target.checked)}
              />
              role labels
            </label>
          </div>
          {evidenceCaptureMessage ? (
            <div
              style={
                evidenceCapturePhase === "error"
                  ? evidenceCaptureErrorStyle
                  : evidenceCaptureStatusStyle
              }
            >
              <strong>Automated evidence capture</strong>
              <span>{evidenceCaptureMessage}</span>
              <span>
                The WebM contains WebGL pixels only; DOM slates are mapped exactly by
                recording-manifest.json inside the downloaded ZIP.
              </span>
            </div>
          ) : null}
        </section>

        <section style={reviewCardStyle}>
          <div style={reviewHeaderStyle}>
            <div style={{ display: "grid", gap: 4 }}>
              <span style={eyebrowStyle}>Human qualification</span>
              <strong style={{ fontSize: 18 }}>{currentCapability.label}</strong>
              <span style={mutedStyle}>
                Judge the capability, not a bad import scale. The manifest records the
                exact asset, source bounds, audition extent, scale multiplier, and pass type.
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {currentReview.decision === "qualified" &&
              selectedCampaignFamily?.frozen_capability_ids.includes(
                currentCapability.id,
              ) ? (
                <span style={frozenBadgeStyle}>FROZEN</span>
              ) : null}
              <code style={runCodeStyle}>{currentClip?.run_id ?? currentCapability.id}</code>
            </div>
          </div>

          <div style={decisionRowStyle}>
            {(
              [
                "qualified",
                "fix",
                "merge_candidate",
                "redefine",
                "restrict",
                "retire",
                "blocked",
              ] as DirectorQualificationDecision[]
            ).map((decision) => (
              <button
                key={decision}
                type="button"
                onClick={() => updateReview(decision)}
                style={{
                  ...decisionButtonStyle,
                  ...(currentReview.decision === decision ? activeDecisionButtonStyle : null),
                }}
              >
                {DIRECTOR_QUALIFICATION_DECISION_LABELS[decision]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => updateReview("unreviewed", "")}
              style={decisionButtonStyle}
            >
              Clear
            </button>
          </div>

          <textarea
            value={currentReview.notes}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              updateReview(currentReview.decision, event.target.value)
            }
            rows={3}
            placeholder="What looked good? What needs to change? Mention the run ID when the issue is specific to one audition."
            style={notesStyle}
          />
        </section>

        <section style={lowerGridStyle}>
          <div style={queueCardStyle}>
            <div style={sectionHeaderStyle}>
              <div style={{ display: "grid", gap: 3 }}>
                <span style={eyebrowStyle}>Audition queue</span>
                <strong>{manifest?.clip_count ?? plannedClips.length} clips</strong>
                {manifest?.coverage_gaps?.length ? (
                  <span> · {manifest.coverage_gaps.length} explicit physical coverage gap(s)</span>
                ) : null}
              </div>
              <span style={mutedStyle}>
                Stable sibling baseline first · rotating diversity next · physical stress last
              </span>
            </div>

            <div style={queueListStyle}>
              {(manifest?.clips ?? []).length ? (
                manifest!.clips.map((clip, index) => {
                  const review = qualificationReviewForCapability(
                    qualificationState,
                    clip.capability_id,
                  );
                  return (
                    <button
                      key={clip.run_id}
                      type="button"
                      onClick={() => jumpToClip(index)}
                      style={{
                        ...queueRowStyle,
                        ...(index === currentIndex ? activeQueueRowStyle : null),
                      }}
                    >
                      <span style={queueIndexStyle}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
                        <strong>{clip.capability_label}</strong>
                        <small style={mutedStyle}>
                          {PASS_LABELS[clip.pass_kind]} · {clip.assets[0]?.asset_label ?? clip.primary_cast_slot_id} · {clip.run_id}
                        </small>
                      </span>
                      <span style={queueDecisionStyle}>
                        {DIRECTOR_QUALIFICATION_DECISION_LABELS[review.decision]}
                        {review.decision === "qualified" &&
                        selectedCampaignFamily?.frozen_capability_ids.includes(
                          clip.capability_id,
                        )
                          ? " · FROZEN"
                          : ""}
                      </span>
                    </button>
                  );
                })
              ) : (
                plannedClips.map((clip, index) => (
                  <div key={`${clip.pass_kind}:${clip.capability.id}:${index}`} style={plannedQueueRowStyle}>
                    <span style={queueIndexStyle}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span style={{ display: "grid", gap: 2 }}>
                      <strong>{clip.capability.label}</strong>
                      <small style={mutedStyle}>
                        {PASS_LABELS[clip.pass_kind]} · {assetLabel(clip.roles[0].asset)}
                      </small>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={sideStackStyle}>
            <details style={detailsStyle}>
              <summary style={summaryStyle}>Asset coverage & normalization</summary>
              <div style={detailsBodyStyle}>
                <span style={mutedStyle}>
                  Qualification cast classes now resolve small rotating pools instead of one
                  permanent demo asset. Baseline stays stable for sibling comparison; later
                  passes rotate real assets and geometry classes without brute-forcing the library.
                </span>

                {familyPoolEntries.map((entry) => (
                  <div key={entry.slot.id} style={poolRowStyle}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <strong>
                        {entry.slot.label} · {entry.candidates.length} match
                        {entry.candidates.length === 1 ? "" : "es"}
                      </strong>
                      <small style={mutedStyle}>
                        {entry.candidates.length
                          ? entry.candidates.slice(0, 4).map(assetLabel).join(" · ")
                          : "No semantic match — unrelated assets are not substituted."}
                      </small>
                    </div>
                  </div>
                ))}

                <div style={normalizationRuleStyle}>
                  <strong>Scale false-negative guard</strong>
                  <span>
                    Fair-display runs normalize each geometry class to a readable scene-relative
                    extent. Object-motion/blocking families use plausible physical sizing. Full
                    coverage adds a physical-size stress pass. Source bounds, logical size,
                    target extent, scale multiplier, and placement are written to the manifest.
                  </span>
                </div>

                {currentPlannedClip ? (
                  <div style={currentNormalizationStyle}>
                    <strong>Current audition sizing</strong>
                    {currentPlannedClip.roles.map((role) => (
                      <span key={role.role}>
                        {role.role}: {assetLabel(role.asset)} · source {role.normalization.source_largest_extent_m.toFixed(2)}m → target {role.normalization.target_extent_m.toFixed(2)}m · {role.normalization.render_scale_multiplier.toFixed(2)}×
                        {role.normalization.metadata_warning ? ` · ⚠ ${role.normalization.metadata_warning}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}

                <details style={nestedDetailsStyle}>
                  <summary style={nestedSummaryStyle}>Qualification cast baseline overrides</summary>
                  <div style={detailsBodyStyle}>
                    {resolvedPools.map(({ slot, baseline }) => (
                      <label key={slot.id} style={castFieldStyle}>
                        <span style={{ display: "grid", gap: 2 }}>
                          <strong>{slot.label}</strong>
                          <small style={mutedStyle}>{slot.purpose}</small>
                        </span>
                        <select
                          value={castOverrides[slot.id] ?? ""}
                          disabled={evidenceCaptureBusy}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            setCastOverride(slot.id, event.target.value)
                          }
                          style={selectStyle}
                        >
                          <option value="">
                            {baseline ? `Auto baseline · ${assetLabel(baseline)}` : "No automatic match"}
                          </option>
                          {loadableAssets.map((candidate) => (
                            <option key={`${slot.id}:${candidate.asset_id}`} value={candidate.asset_id}>
                              {assetLabel(candidate)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            </details>

            <div style={principleStyle}>
              <strong>Qualification rule</strong>
              <span>
                A capability earns its place through evidence. A working runtime is not enough:
                weak, redundant, misleading, or overly broad vocabulary can be fixed, merged,
                restricted, redefined, or retired.
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statStyle}>
      <span style={statLabelStyle}>{label}</span>
      <strong style={{ fontSize: 24 }}>{value}</strong>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  color: "white",
  padding: "min(2.2vw, 24px)",
  background:
    "radial-gradient(circle at 12% 0%, rgba(14,165,233,0.18), transparent 28%), radial-gradient(circle at 88% 8%, rgba(249,115,22,0.12), transparent 25%), linear-gradient(180deg, #020617, #030712 42%, #020617)",
};
const shellStyle: CSSProperties = {
  width: "min(1680px, 100%)",
  margin: "0 auto",
  display: "grid",
  gap: 14,
};
const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 18,
  flexWrap: "wrap",
};
const titleStyle: CSSProperties = {
  margin: "5px 0 5px",
  fontSize: "clamp(2rem, 3.4vw, 3.6rem)",
  lineHeight: 1,
  letterSpacing: "-0.04em",
};
const subtitleStyle: CSSProperties = {
  margin: 0,
  maxWidth: 980,
  color: "rgba(226,232,240,0.68)",
  lineHeight: 1.55,
  fontSize: 14,
};
const eyebrowStyle: CSSProperties = {
  color: "#7dd3fc",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};
const mutedStyle: CSSProperties = { color: "rgba(226,232,240,0.64)" };
const statsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};
const statStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "11px 13px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(15,23,42,0.62)",
};
const statLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};
const controlCardStyle: CSSProperties = {
  display: "grid",
  gap: 11,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.78)",
};
const threeColumnControlsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};
const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: "rgba(226,232,240,0.8)",
  fontSize: 11,
  fontWeight: 800,
};
const selectStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  borderRadius: 11,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#07111f",
  color: "white",
  padding: "9px 10px",
};
const sceneSummaryStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "center",
  flexWrap: "wrap",
  paddingTop: 10,
  borderTop: "1px solid rgba(255,255,255,0.07)",
};
const queueSummaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto auto auto auto auto auto",
  gap: "3px 7px",
  alignItems: "baseline",
  fontSize: 11,
  color: "rgba(226,232,240,0.65)",
};
const coverageStripStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 14px",
  padding: "9px 10px",
  borderRadius: 12,
  border: "1px solid rgba(125,211,252,0.12)",
  background: "rgba(8,47,73,0.12)",
  color: "rgba(224,242,254,0.72)",
  fontSize: 10,
};
const auditionCardStyle: CSSProperties = { display: "grid", gap: 10 };
const auditionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};
const headerBadgesStyle: CSSProperties = { display: "flex", gap: 7, flexWrap: "wrap" };
const badgeStyle: CSSProperties = {
  display: "inline-flex",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "#cbd5e1",
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 850,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
const recordingViewportStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  maxHeight: "72vh",
  minHeight: 360,
  overflow: "hidden",
  borderRadius: 20,
  border: "1px solid rgba(125,211,252,0.24)",
  background: "#020617",
  boxShadow: "0 24px 80px rgba(0,0,0,0.34)",
};
const viewerMessageStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeContent: "center",
  padding: 24,
  textAlign: "center",
  color: "rgba(226,232,240,0.72)",
};
const slateStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 12,
  display: "grid",
  placeContent: "center",
  justifyItems: "center",
  gap: 7,
  padding: "clamp(18px, 4vw, 52px)",
  background: "rgba(2,6,23,0.92)",
  textAlign: "center",
  pointerEvents: "none",
};
const slateEyebrowStyle: CSSProperties = {
  color: "#7dd3fc",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.2em",
};
const slateTitleStyle: CSSProperties = {
  width: "min(92%, 1100px)",
  fontSize: "clamp(1.45rem, 4.1vw, 3.9rem)",
  lineHeight: 1.04,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};
const preparationOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 11,
  display: "grid",
  placeContent: "center",
  justifyItems: "center",
  gap: 7,
  padding: 28,
  background: "rgba(2,6,23,0.9)",
  color: "rgba(226,232,240,0.78)",
  textAlign: "center",
  pointerEvents: "none",
};
const completeSlateStyle: CSSProperties = {
  ...slateStyle,
  background:
    "radial-gradient(circle at 50% 42%, rgba(14,165,233,0.18), transparent 34%), rgba(2,6,23,0.94)",
};
const completeEyebrowStyle: CSSProperties = {
  ...slateEyebrowStyle,
  color: "#86efac",
};
const completeTitleStyle: CSSProperties = {
  ...slateTitleStyle,
  fontSize: "clamp(1.35rem, 3.6vw, 3.2rem)",
};
const runCodeStyle: CSSProperties = {
  color: "#bae6fd",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 11,
};
const burnInStyle: CSSProperties = {
  position: "absolute",
  right: 10,
  bottom: 9,
  zIndex: 10,
  display: "flex",
  gap: 8,
  padding: "5px 7px",
  borderRadius: 7,
  background: "rgba(2,6,23,0.72)",
  color: "rgba(226,232,240,0.78)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 9,
  pointerEvents: "none",
};
const evidenceCaptureStatusStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(34,197,94,0.28)",
  background: "rgba(20,83,45,0.12)",
  color: "rgba(220,252,231,0.92)",
  fontSize: 11,
  lineHeight: 1.45,
};

const evidenceCaptureErrorStyle: CSSProperties = {
  ...evidenceCaptureStatusStyle,
  border: "1px solid rgba(248,113,113,0.32)",
  background: "rgba(127,29,29,0.16)",
  color: "rgba(254,226,226,0.94)",
};

const transportStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(2,6,23,0.78)",
};
const transportMetaStyle: CSSProperties = {
  color: "rgba(186,230,253,0.82)",
  fontSize: 10,
  lineHeight: 1.35,
};
const buttonStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  padding: "8px 11px",
  cursor: "pointer",
  fontWeight: 800,
};
const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: "1px solid rgba(125,211,252,0.55)",
  background: "linear-gradient(135deg, #0284c7, #2563eb)",
};
const toggleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  color: "rgba(226,232,240,0.68)",
  fontSize: 11,
};
const campaignCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(56,189,248,0.18)",
  background: "linear-gradient(180deg, rgba(8,47,73,0.14), rgba(2,6,23,0.7))",
};
const campaignHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};
const campaignStatsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
};
const campaignFocusStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
  alignItems: "start",
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(125,211,252,0.16)",
  background: "rgba(15,23,42,0.54)",
};
const campaignActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: 7,
  maxWidth: 420,
};
const campaignStatusStyle: CSSProperties = {
  width: "fit-content",
  borderRadius: 999,
  border: "1px solid rgba(125,211,252,0.28)",
  background: "rgba(2,132,199,0.14)",
  color: "#bae6fd",
  padding: "4px 8px",
  fontSize: 10,
  fontWeight: 850,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};
const campaignNeedsEvidenceStyle: CSSProperties = {
  color: "#fde68a",
  fontSize: 11,
  lineHeight: 1.45,
};
const campaignNotesStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: "rgba(226,232,240,0.78)",
  fontSize: 11,
  fontWeight: 800,
};
const campaignInstructionStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "9px 11px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(15,23,42,0.42)",
  color: "rgba(203,213,225,0.76)",
  fontSize: 11,
  lineHeight: 1.45,
};
const campaignFamilyListStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  maxHeight: 420,
  overflowY: "auto",
  padding: "0 10px 10px",
};
const campaignFamilyRowStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "36px minmax(0,1fr) auto",
  gap: 9,
  alignItems: "center",
  textAlign: "left",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(15,23,42,0.5)",
  color: "white",
  padding: "8px 9px",
  cursor: "pointer",
};
const activeCampaignFamilyRowStyle: CSSProperties = {
  border: "1px solid rgba(125,211,252,0.44)",
  background: "rgba(8,145,178,0.14)",
};
const campaignFamilyStatusPillStyle: CSSProperties = {
  color: "rgba(226,232,240,0.7)",
  fontSize: 9,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};
const frozenBadgeStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(134,239,172,0.4)",
  background: "rgba(22,163,74,0.14)",
  color: "#bbf7d0",
  padding: "4px 8px",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.06em",
};

const reviewCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(56,189,248,0.16)",
  background: "rgba(8,47,73,0.12)",
};
const reviewHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};
const decisionRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 7 };
const decisionButtonStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(15,23,42,0.78)",
  color: "#cbd5e1",
  padding: "7px 10px",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
};
const activeDecisionButtonStyle: CSSProperties = {
  border: "1px solid rgba(125,211,252,0.55)",
  background: "rgba(2,132,199,0.24)",
  color: "#f0f9ff",
};
const notesStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  minHeight: 72,
  borderRadius: 11,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#020617",
  color: "white",
  padding: 10,
};
const lowerGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.65fr)",
  gap: 12,
  alignItems: "start",
};
const queueCardStyle: CSSProperties = {
  display: "grid",
  gap: 9,
  padding: 12,
  borderRadius: 17,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(2,6,23,0.72)",
};
const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};
const queueListStyle: CSSProperties = {
  display: "grid",
  maxHeight: 390,
  overflowY: "auto",
  gap: 5,
};
const queueRowStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "36px minmax(0,1fr) auto",
  gap: 9,
  alignItems: "center",
  textAlign: "left",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(15,23,42,0.54)",
  color: "white",
  padding: "8px 9px",
  cursor: "pointer",
};
const plannedQueueRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px minmax(0,1fr)",
  gap: 9,
  alignItems: "center",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.06)",
  background: "rgba(15,23,42,0.42)",
  padding: "8px 9px",
};
const activeQueueRowStyle: CSSProperties = {
  border: "1px solid rgba(125,211,252,0.44)",
  background: "rgba(8,145,178,0.14)",
};
const queueIndexStyle: CSSProperties = {
  color: "#7dd3fc",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 10,
};
const queueDecisionStyle: CSSProperties = {
  color: "rgba(226,232,240,0.62)",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};
const sideStackStyle: CSSProperties = { display: "grid", gap: 10 };
const detailsStyle: CSSProperties = {
  borderRadius: 17,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(2,6,23,0.72)",
  overflow: "hidden",
};
const summaryStyle: CSSProperties = { cursor: "pointer", padding: 12, fontWeight: 850 };
const detailsBodyStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: "0 12px 12px",
};
const poolRowStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  paddingTop: 8,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};
const normalizationRuleStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(34,211,238,0.16)",
  background: "rgba(8,145,178,0.08)",
  color: "rgba(207,250,254,0.8)",
  fontSize: 11,
  lineHeight: 1.45,
};
const currentNormalizationStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(15,23,42,0.6)",
  color: "rgba(226,232,240,0.72)",
  fontSize: 10,
};
const nestedDetailsStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.07)",
  overflow: "hidden",
};
const nestedSummaryStyle: CSSProperties = {
  cursor: "pointer",
  padding: 10,
  fontSize: 11,
  fontWeight: 800,
};
const castFieldStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  paddingTop: 8,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};
const principleStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 13,
  borderRadius: 16,
  border: "1px solid rgba(249,115,22,0.2)",
  background: "rgba(124,45,18,0.14)",
  color: "rgba(255,237,213,0.82)",
  lineHeight: 1.5,
  fontSize: 12,
};
const errorStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(127,29,29,0.2)",
  color: "#fecaca",
};
const warningStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(250,204,21,0.2)",
  background: "rgba(120,53,15,0.14)",
  color: "#fef3c7",
};
const softWarningStyle: CSSProperties = {
  padding: "9px 11px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(15,23,42,0.45)",
  color: "rgba(203,213,225,0.68)",
  fontSize: 10,
  lineHeight: 1.4,
};
