import type { DirectorQualificationCoverageMode } from "./director-qualification-contract";

export const DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION =
  "director_qualification_evidence_phase1b7a10f_v1" as const;

export const DIRECTOR_QUALIFICATION_CAPTURE_FPS = 30;
export const DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX = 960;
export const DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX = 540;
export const DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND = 2_750_000;
export const DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS = 2_000;
export const DIRECTOR_QUALIFICATION_COMPLETE_HOLD_MS = 900;
export const DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS = 29;
export const DIRECTOR_QUALIFICATION_MAX_EFFECTIVE_SUBMISSION_FPS = 30.5;
export const DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS = 100;
export const DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS = 250;
export const DIRECTOR_QUALIFICATION_MAX_MISSED_FRAME_RATIO = 0.01;
export const DIRECTOR_QUALIFICATION_MAX_CONSECUTIVE_MISSED_FRAMES = 2;

export type DirectorQualificationEvidenceStatus = "complete" | "incomplete";
export type DirectorQualificationEvidenceIntegrity = "pass" | "fail";
export type DirectorQualificationEvidenceFrameStatus = "submitted" | "missed";
export type DirectorQualificationEvidenceFramePhase =
  | "arming"
  | "slate"
  | "playing"
  | "gap"
  | "complete";

export type DirectorQualificationEvidenceFrameTiming = {
  sequence_index: number;
  expected_offset_ms: number;
  actual_offset_ms: number | null;
  lateness_ms: number | null;
  status: DirectorQualificationEvidenceFrameStatus;
  phase: DirectorQualificationEvidenceFramePhase;
  capability_id: string | null;
  run_id: string | null;
  /** Wall time spent preparing/rendering this logical frame. Deterministic export only. */
  render_wall_time_ms?: number;
};

export type DirectorQualificationEvidenceIntegrityInput = {
  expected_recording_duration_ms: number;
  measured_recording_duration_ms: number;
  evidence_window_duration_ms: number;
  media_duration_ms: number | null;
  scheduled_frame_count: number;
  submitted_frame_count: number;
  missed_frame_count: number;
  max_consecutive_missed_frames: number;
  largest_submission_gap_ms: number;
  completion_frame_captured: boolean;
  /** Deterministic exporters can fail closed if the codec did not emit one chunk per logical frame. */
  expected_encoded_frame_count?: number;
  encoded_frame_count?: number;
};

export type DirectorQualificationEvidenceIntegrityResult = {
  evidence_integrity: DirectorQualificationEvidenceIntegrity;
  integrity_failures: string[];
  timeline_drift_ms: number | null;
  effective_submission_fps: number;
  missed_frame_ratio: number;
};

export function evaluateDirectorQualificationEvidenceIntegrity(
  input: DirectorQualificationEvidenceIntegrityInput,
): DirectorQualificationEvidenceIntegrityResult {
  // Submission cadence is judged only over the qualification evidence window.
  // A.10D deliberately records an encoder warm-up before reel time zero; counting
  // that warm-up against submitted evidence frames would create a false low-FPS
  // failure even when the reel itself is perfectly paced.
  const evidenceSeconds = Math.max(0.001, input.evidence_window_duration_ms / 1000);
  const effectiveSubmissionFps = input.submitted_frame_count / evidenceSeconds;
  const missedFrameRatio =
    input.scheduled_frame_count > 0
      ? input.missed_frame_count / input.scheduled_frame_count
      : 1;
  const timelineDriftMs =
    input.media_duration_ms === null
      ? null
      : Math.round(
          input.media_duration_ms - input.expected_recording_duration_ms,
        );
  const failures: string[] = [];

  if (input.media_duration_ms === null) {
    failures.push("recorded_media_duration_unverified");
  } else if (
    Math.abs(timelineDriftMs ?? 0) >
    DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS
  ) {
    failures.push("recorded_media_timeline_drift");
  }

  if (
    effectiveSubmissionFps <
    DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS
  ) {
    failures.push("capture_submission_rate_below_floor");
  }

  if (
    effectiveSubmissionFps >
    DIRECTOR_QUALIFICATION_MAX_EFFECTIVE_SUBMISSION_FPS
  ) {
    failures.push("capture_submission_rate_above_ceiling");
  }

  if (
    input.largest_submission_gap_ms >
    DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS
  ) {
    failures.push("capture_submission_gap_too_large");
  }

  if (missedFrameRatio > DIRECTOR_QUALIFICATION_MAX_MISSED_FRAME_RATIO) {
    failures.push("capture_missed_frame_ratio_too_high");
  }

  if (
    input.max_consecutive_missed_frames >
    DIRECTOR_QUALIFICATION_MAX_CONSECUTIVE_MISSED_FRAMES
  ) {
    failures.push("capture_consecutive_missed_frames_too_high");
  }

  if (!input.completion_frame_captured) {
    failures.push("reel_complete_frame_missing");
  }

  if (
    typeof input.expected_encoded_frame_count === "number" &&
    typeof input.encoded_frame_count === "number" &&
    input.encoded_frame_count !== input.expected_encoded_frame_count
  ) {
    failures.push("deterministic_encoded_frame_count_mismatch");
  }

  return {
    evidence_integrity: failures.length ? "fail" : "pass",
    integrity_failures: failures,
    timeline_drift_ms: timelineDriftMs,
    effective_submission_fps: Number(effectiveSubmissionFps.toFixed(3)),
    missed_frame_ratio: Number(missedFrameRatio.toFixed(6)),
  };
}

export type DirectorQualificationEvidenceSummary = {
  schema_version: typeof DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION;
  status: DirectorQualificationEvidenceStatus;
  evidence_integrity: DirectorQualificationEvidenceIntegrity;
  integrity_failures: string[];
  reel_id: string;
  family_key: string;
  family_label: string;
  coverage_mode: DirectorQualificationCoverageMode;
  clip_count: number;
  completed_clip_count: number;
  expected_recording_duration_ms: number;
  measured_recording_duration_ms: number;
  media_duration_ms: number | null;
  timeline_drift_ms: number | null;
  reel_time_zero_recording_offset_ms: number;
  encoder_warmup_target_ms: number;
  encoder_warmup_actual_ms: number;
  warmup_scheduled_frame_count: number;
  warmup_submitted_frame_count: number;
  warmup_missed_frame_count: number;
  warmup_largest_submission_gap_ms: number;
  evidence_window_duration_ms: number;
  recorder_periodic_timeslice: false;
  deterministic_frame_export?: true;
  expected_frame_count?: number;
  rendered_frame_count?: number;
  encoded_frame_count?: number;
  export_wall_time_ms?: number;
  max_frame_render_wall_time_ms?: number;
  webcodecs_codec?: "vp8";
  capture_started_at: string;
  capture_completed_at: string;
  capture_method:
    | "composited_canvas_capture_stream_media_recorder"
    | "deterministic_webcodecs_vp8_frame_export";
  capture_scope: "webgl_plus_capture_burnin";
  capture_fps: number;
  requested_capture_fps: number;
  scheduled_frame_count: number;
  submitted_frame_count: number;
  missed_frame_count: number;
  missed_frame_ratio: number;
  max_consecutive_missed_frames: number;
  effective_submission_fps: number;
  largest_submission_gap_ms: number;
  capture_mime_type: string;
  capture_video_bits_per_second: number;
  canvas_width_px: number;
  canvas_height_px: number;
  source_canvas_width_px: number;
  source_canvas_height_px: number;
  capture_burnin_in_video: true;
  completion_frame_captured: boolean;
  dom_overlays_in_video: false;
  frame_timing_entry_count: number;
  recording_filename: string;
  manifest_filename: string;
  evidence_summary_filename: string;
};

/**
 * Read the duration Chrome assigns to the finalized WebM. Some MediaRecorder WebM
 * blobs initially report Infinity; seeking far forward forces Chrome to index the
 * final cluster and emit a finite duration without replaying the full reel.
 */
export async function measureDirectorQualificationRecordingDurationMs(
  blob: Blob,
  timeoutMs = 2500,
): Promise<number | null> {
  if (typeof document === "undefined" || typeof URL === "undefined") return null;
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  return await new Promise<number | null>((resolve) => {
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const finiteDuration = () =>
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration * 1000)
        : null;

    const onDuration = () => {
      const measured = finiteDuration();
      if (measured !== null) finish(measured);
    };
    const timeoutId = window.setTimeout(() => finish(finiteDuration()), timeoutMs);

    video.addEventListener(
      "loadedmetadata",
      () => {
        const measured = finiteDuration();
        if (measured !== null) {
          finish(measured);
          return;
        }
        try {
          video.currentTime = 1e101;
        } catch {
          finish(null);
        }
      },
      { once: true },
    );
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("error", () => finish(null), { once: true });
    video.src = url;
  });
}

export type DirectorQualificationZipEntry = {
  name: string;
  blob: Blob;
};

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function updateCrc32(crc: number, bytes: Uint8Array) {
  let next = crc >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    next = CRC32_TABLE[(next ^ bytes[index]) & 0xff] ^ (next >>> 8);
  }
  return next >>> 0;
}

async function crc32Blob(blob: Blob) {
  let crc = 0xffffffff;

  if (typeof blob.stream === "function") {
    const reader = blob.stream().getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        crc = updateCrc32(crc, value);
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    crc = updateCrc32(crc, new Uint8Array(await blob.arrayBuffer()));
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: ((hours << 11) | (minutes << 5) | seconds) & 0xffff,
    date: (((year - 1980) << 9) | (month << 5) | day) & 0xffff,
  };
}

function binaryHeader(byteLength: number, write: (view: DataView) => void) {
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  write(view);
  return buffer;
}

/**
 * Store-only ZIP writer for Qualification evidence.
 * WebM is already compressed, so deflating it again adds CPU/memory pressure without
 * useful size savings. Blob parts keep the video payload out of a second giant copy.
 */
export async function buildDirectorQualificationEvidenceZip(
  entries: DirectorQualificationZipEntry[],
  createdAt = new Date(),
) {
  if (!entries.length) throw new Error("Evidence ZIP requires at least one file.");

  const encoder = new TextEncoder();
  const prepared = [] as Array<{
    entry: DirectorQualificationZipEntry;
    nameBytes: ArrayBuffer;
    crc32: number;
    size: number;
    localOffset: number;
  }>;

  let localOffset = 0;
  for (const entry of entries) {
    const encodedName = encoder.encode(entry.name.replace(/\\/g, "/"));
    // Next/TypeScript's DOM lib requires BlobPart views to be backed by ArrayBuffer,
    // not the broader ArrayBufferLike generic carried by TextEncoder Uint8Array.
    // Copy only the tiny filename bytes into an explicit ArrayBuffer; the WebM Blob
    // itself remains zero-copy in the store-only ZIP assembly.
    const nameBytes = new ArrayBuffer(encodedName.byteLength);
    new Uint8Array(nameBytes).set(encodedName);
    const size = entry.blob.size;
    if (size > 0xffffffff) {
      throw new Error(`Evidence file is too large for the simple ZIP writer: ${entry.name}`);
    }
    const crc32 = await crc32Blob(entry.blob);
    prepared.push({ entry, nameBytes, crc32, size, localOffset });
    localOffset += 30 + nameBytes.byteLength + size;
  }

  if (localOffset > 0xffffffff) {
    throw new Error("Evidence package is too large for the simple ZIP writer.");
  }

  const { time, date } = dosDateTime(createdAt);
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let centralSize = 0;

  for (const file of prepared) {
    const localHeader = binaryHeader(30, (view) => {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, time, true);
      view.setUint16(12, date, true);
      view.setUint32(14, file.crc32, true);
      view.setUint32(18, file.size, true);
      view.setUint32(22, file.size, true);
      view.setUint16(26, file.nameBytes.byteLength, true);
      view.setUint16(28, 0, true);
    });
    localParts.push(localHeader, file.nameBytes, file.entry.blob);

    const centralHeader = binaryHeader(46, (view) => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, time, true);
      view.setUint16(14, date, true);
      view.setUint32(16, file.crc32, true);
      view.setUint32(20, file.size, true);
      view.setUint32(24, file.size, true);
      view.setUint16(28, file.nameBytes.byteLength, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, file.localOffset, true);
    });
    centralParts.push(centralHeader, file.nameBytes);
    centralSize += 46 + file.nameBytes.byteLength;
  }

  const centralOffset = localOffset;
  const end = binaryHeader(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, prepared.length, true);
    view.setUint16(10, prepared.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true);
  });

  return new Blob([...localParts, ...centralParts, end], {
    type: "application/zip",
  });
}

export function selectDirectorQualificationRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  // A.10E prefers VP8 for qualification evidence because temporal reliability
  // matters more here than maximum compression efficiency. VP9 remains a fallback.
  for (const mimeType of [
    "video/webm;codecs=vp8",
    "video/webm;codecs=vp9",
    "video/webm",
  ]) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return null;
}

export function directorQualificationEvidenceSlug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "qualification"
  );
}

export function downloadDirectorQualificationEvidence(
  filename: string,
  blob: Blob,
) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
