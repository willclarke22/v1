import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CAPTURE_FPS,
  DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS,
  DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
  DIRECTOR_QUALIFICATION_MAX_CONSECUTIVE_MISSED_FRAMES,
  DIRECTOR_QUALIFICATION_MAX_EFFECTIVE_SUBMISSION_FPS,
  DIRECTOR_QUALIFICATION_MAX_MISSED_FRAME_RATIO,
  DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS,
  DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS,
  DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS,
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
    "finalizeQualificationEncoderWarmup",
    "resetQualificationEvidenceWindowMetrics",
    "warmup_scheduled_frame_count",
    "warmup_submitted_frame_count",
    "warmup_missed_frame_count",
    "warmup_largest_submission_gap_ms",
    "evidence_window_stopped_performance_ms",
    "ENCODER WARM-UP",
    "DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS",
    "recorder.start();",
    "startQualificationEvidenceCompositor(active, sourceCanvas, reelStartedAtMs)",
    "encoder_warmup_target_ms",
    "encoder_warmup_actual_ms",
    "evidence_window_duration_ms",
    "recorder_periodic_timeslice: false",
  ]) {
    assert(room.includes(marker), `A.10D recorder warm-up marker missing: ${marker}`);
  }

  assert(
    !room.includes("DIRECTOR_QUALIFICATION_RECORDER_TIMESLICE_MS") &&
      !room.includes("recorder.start(5000)") &&
      !room.includes("recorder.start(5_000)") &&
      !/active\.recorder\.requestData\s*\(/.test(room),
    "A.10D must have no periodic MediaRecorder timeslice or mid-reel requestData flush.",
  );

  assert(
    /recorder\.start\(\);[\s\S]*startQualificationEvidenceCompositor\(active, sourceCanvas\);[\s\S]*DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS[\s\S]*finalizeQualificationEncoderWarmup\(active\);[\s\S]*active\.reel_started_performance_ms = reelStartedAtMs[\s\S]*startQualificationEvidenceCompositor\(active, sourceCanvas, reelStartedAtMs\)/.test(
      room,
    ),
    "A.10D must warm the encoder before reel time zero, reset diagnostics, then restart the 30 Hz clock exactly at reel zero.",
  );

  assert(
    /function resetQualificationEvidenceWindowMetrics[\s\S]*active\.scheduled_frame_count = 0;[\s\S]*active\.submitted_frame_count = 0;[\s\S]*active\.missed_frame_count = 0;[\s\S]*active\.frame_timing = \[\];/.test(
      room,
    ),
    "A.10D must exclude warm-up timing from the actual evidence-window cadence metrics.",
  );

  for (const marker of [
    "director_qualification_evidence_phase1b7a10f_v1",
    "DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS = 2_000",
    "evidence_window_duration_ms",
    "const evidenceSeconds = Math.max",
    "input.evidence_window_duration_ms / 1000",
    "recorder_periodic_timeslice: false",
  ]) {
    assert(evidence.includes(marker), `A.10D evidence contract marker missing: ${marker}`);
  }

  assert(
    !evidence.includes("DIRECTOR_QUALIFICATION_RECORDER_TIMESLICE_MS"),
    "A.10D evidence contract must retire the periodic recorder-timeslice constant.",
  );

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
    "A.10D must preserve the A.10C fail-closed cadence thresholds while adding a two-second warm-up.",
  );

  // Total recording includes two seconds of encoder warm-up, but evidence cadence
  // is judged only over the ten-second reel window. If the implementation still
  // divided by total recording duration this sample would incorrectly read 25 FPS.
  const warmupSeparated = evaluateDirectorQualificationEvidenceIntegrity({
    expected_recording_duration_ms: 12_000,
    measured_recording_duration_ms: 12_020,
    evidence_window_duration_ms: 10_000,
    media_duration_ms: 12_010,
    scheduled_frame_count: 300,
    submitted_frame_count: 300,
    missed_frame_count: 0,
    max_consecutive_missed_frames: 0,
    largest_submission_gap_ms: 40,
    completion_frame_captured: true,
  });
  assert(
    warmupSeparated.evidence_integrity === "pass" &&
      warmupSeparated.effective_submission_fps === 30 &&
      warmupSeparated.integrity_failures.length === 0,
    `A.10D encoder warm-up must not dilute evidence FPS: ${JSON.stringify(warmupSeparated)}`,
  );

  const stillFailClosed = evaluateDirectorQualificationEvidenceIntegrity({
    expected_recording_duration_ms: 12_000,
    measured_recording_duration_ms: 12_000,
    evidence_window_duration_ms: 10_000,
    media_duration_ms: 12_030,
    scheduled_frame_count: 300,
    submitted_frame_count: 270,
    missed_frame_count: 30,
    max_consecutive_missed_frames: 24,
    largest_submission_gap_ms: 858,
    completion_frame_captured: true,
  });
  assert(
    stillFailClosed.evidence_integrity === "fail" &&
      stillFailClosed.integrity_failures.includes("capture_submission_rate_below_floor") &&
      stillFailClosed.integrity_failures.includes("capture_submission_gap_too_large") &&
      stillFailClosed.integrity_failures.includes("capture_missed_frame_ratio_too_high") &&
      stillFailClosed.integrity_failures.includes("capture_consecutive_missed_frames_too_high"),
    `A.10D must not hide an A.10C-style in-evidence stall behind the warm-up: ${JSON.stringify(stillFailClosed)}`,
  );

  for (const marker of [
    "Phase 1B.7A.10D — recorder warm-up + non-flushing evidence window",
    "without a periodic timeslice",
    "2-second encoder",
    "ENCODER WARM-UP",
    "evidence_window_duration_ms",
    "recorder_periodic_timeslice: false",
    "Phase 1B.7A.11",
  ]) {
    assert(readme.includes(marker), `A.10D README marker missing: ${marker}`);
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
    `A.10D must not mutate the Level 2 vocabulary/support distribution: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)}.`,
  );

  console.log("Director Qualification Room Phase 1B.7A.10D recorder-warm-up verification passed.");
  console.log(
    "Encoder startup and data delivery are outside the qualification evidence window; the strict A.10C 30 Hz cadence gate remains unchanged for reel time zero through REEL COMPLETE.",
  );
}

main();
