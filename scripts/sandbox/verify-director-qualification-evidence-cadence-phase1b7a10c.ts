import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CAPTURE_FPS,
  DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
  DIRECTOR_QUALIFICATION_MAX_CONSECUTIVE_MISSED_FRAMES,
  DIRECTOR_QUALIFICATION_MAX_EFFECTIVE_SUBMISSION_FPS,
  DIRECTOR_QUALIFICATION_MAX_MISSED_FRAME_RATIO,
  DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS,
  DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS,
  DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS,
  DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS,
  evaluateDirectorQualificationEvidenceIntegrity,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-evidence";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const evidence = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-evidence.ts",
  );
  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");

  for (const marker of [
    "serviceQualificationEvidenceDeadline",
    "recordMissedQualificationEvidenceFrames",
    "captureFrameTimingIdentity",
    "next_capture_sequence_index",
    "capture_schedule_started_performance_ms",
    "evidence_frame_timing: active.frame_timing",
    "scheduled_frame_count",
    "missed_frame_count",
    "max_consecutive_missed_frames",
    "Math.floor((now - scheduleStartedAt) / frameMs)",
    "if (now + 0.5 < nextExpectedMs) return false",
    "active.next_capture_sequence_index = dueSequenceIndex + 1",
    "DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS",
  ]) {
    assert(room.includes(marker), `A.10C deterministic-cadence marker missing: ${marker}`);
  }

  assert(
    !room.includes("keepCaptureFramesFlowing") &&
      !room.includes("window.setTimeout(\n        keepCaptureFramesFlowing"),
    "A.10C must remove the redundant recurring QualificationCaptureCanvasBridge invalidation clock.",
  );

  assert(
    room.includes("Playback already invalidates") &&
      room.includes("One activation invalidate is enough"),
    "A.10C must document why the capture bridge no longer owns a second 30 Hz timer.",
  );

  for (const marker of [
    "director_qualification_evidence_phase1b7a10f_v1",
    "DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS = 2_000",
    "DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS = 29",
    "DIRECTOR_QUALIFICATION_MAX_EFFECTIVE_SUBMISSION_FPS = 30.5",
    "DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS = 100",
    "DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS = 250",
    "DIRECTOR_QUALIFICATION_MAX_MISSED_FRAME_RATIO = 0.01",
    "DIRECTOR_QUALIFICATION_MAX_CONSECUTIVE_MISSED_FRAMES = 2",
    "capture_submission_rate_above_ceiling",
    "capture_missed_frame_ratio_too_high",
    "capture_consecutive_missed_frames_too_high",
    "DirectorQualificationEvidenceFrameTiming",
    "frame_timing_entry_count",
  ]) {
    assert(evidence.includes(marker), `A.10C evidence contract marker missing: ${marker}`);
  }

  assert(
    DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION ===
      "director_qualification_evidence_phase1b7a10f_v1" &&
      DIRECTOR_QUALIFICATION_CAPTURE_FPS === 30 &&
      DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS === 2_000 &&
      DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS === 29 &&
      DIRECTOR_QUALIFICATION_MAX_EFFECTIVE_SUBMISSION_FPS === 30.5 &&
      DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS === 100 &&
      DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS === 250 &&
      DIRECTOR_QUALIFICATION_MAX_MISSED_FRAME_RATIO === 0.01 &&
      DIRECTOR_QUALIFICATION_MAX_CONSECUTIVE_MISSED_FRAMES === 2,
    "A.10C deterministic evidence constants drifted.",
  );

  const passing = evaluateDirectorQualificationEvidenceIntegrity({
    expected_recording_duration_ms: 10_000,
    measured_recording_duration_ms: 10_010,
    evidence_window_duration_ms: 10_010,
    media_duration_ms: 9_990,
    scheduled_frame_count: 301,
    submitted_frame_count: 300,
    missed_frame_count: 1,
    max_consecutive_missed_frames: 1,
    largest_submission_gap_ms: 67,
    completion_frame_captured: true,
  });
  assert(
    passing.evidence_integrity === "pass" &&
      passing.integrity_failures.length === 0 &&
      passing.effective_submission_fps >= 29 &&
      passing.missed_frame_ratio < 0.01,
    `A.10C near-30Hz evidence with one isolated miss should pass: ${JSON.stringify(passing)}`,
  );


  const oversubmitted = evaluateDirectorQualificationEvidenceIntegrity({
    expected_recording_duration_ms: 10_000,
    measured_recording_duration_ms: 10_000,
    evidence_window_duration_ms: 10_000,
    media_duration_ms: 10_000,
    scheduled_frame_count: 346,
    submitted_frame_count: 345,
    missed_frame_count: 1,
    max_consecutive_missed_frames: 1,
    largest_submission_gap_ms: 40,
    completion_frame_captured: true,
  });
  assert(
    oversubmitted.evidence_integrity === "fail" &&
      oversubmitted.integrity_failures.includes("capture_submission_rate_above_ceiling"),
    `A.10C must reject the old ~34.5 FPS oversubmission pattern: ${JSON.stringify(oversubmitted)}`,
  );

  const stalled = evaluateDirectorQualificationEvidenceIntegrity({
    expected_recording_duration_ms: 10_000,
    measured_recording_duration_ms: 10_000,
    evidence_window_duration_ms: 10_000,
    media_duration_ms: 10_030,
    scheduled_frame_count: 300,
    submitted_frame_count: 270,
    missed_frame_count: 30,
    max_consecutive_missed_frames: 28,
    largest_submission_gap_ms: 962,
    completion_frame_captured: true,
  });
  assert(
    stalled.evidence_integrity === "fail" &&
      stalled.integrity_failures.includes("capture_submission_rate_below_floor") &&
      stalled.integrity_failures.includes("capture_submission_gap_too_large") &&
      stalled.integrity_failures.includes("capture_missed_frame_ratio_too_high") &&
      stalled.integrity_failures.includes("capture_consecutive_missed_frames_too_high"),
    `A.10C must reject an A.10B-style one-second motion hole: ${JSON.stringify(stalled)}`,
  );

  for (const marker of [
    "Phase 1B.7A.10C — deterministic evidence cadence",
    "30 Hz sequence/deadline",
    "does **not burst-fill stale frames**",
    "evidence_frame_timing",
    "5-second timeslice",
    "29–30.5 FPS",
    "100 ms",
    "Phase 1B.7A.11",
  ]) {
    assert(readme.includes(marker), `A.10C README marker missing: ${marker}`);
  }

  const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
    (counts, item) => {
      counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
      return counts;
    },
    {},
  );
  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      supportCounts.direct === 102 &&
      supportCounts.compound === 65 &&
      supportCounts.approximate === 15 &&
      supportCounts.declared === 2,
    `A.10C must not mutate the Level 2 vocabulary/support distribution: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)}.`,
  );

  console.log("Director Qualification Room Phase 1B.7A.10C deterministic-cadence verification passed.");
  console.log(
    "Evidence now submits at most one frame per authoritative 30 Hz sequence slot, records missed slots explicitly, and fails closed on long motion holes before A.11 can consume the run.",
  );
}

main();
