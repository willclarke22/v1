import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CAPTURE_FPS,
  DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX,
  DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND,
  DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX,
  DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS,
  DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
  DIRECTOR_QUALIFICATION_MAX_CONSECUTIVE_MISSED_FRAMES,
  DIRECTOR_QUALIFICATION_MAX_EFFECTIVE_SUBMISSION_FPS,
  DIRECTOR_QUALIFICATION_MAX_MISSED_FRAME_RATIO,
  DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS,
  DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS,
  DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS,
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

  assert(
    DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION ===
      "director_qualification_evidence_phase1b7a10f_v1" &&
      DIRECTOR_QUALIFICATION_CAPTURE_FPS === 30 &&
      DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX === 960 &&
      DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX === 540 &&
      DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND === 2_750_000,
    "A.10E must use the lightweight 960x540 / 2.75 Mbps evidence profile at 30 FPS.",
  );

  assert(
    DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX *
        DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX ===
      518_400 &&
      518_400 / (1280 * 720) === 0.5625,
    "A.10E should reduce compositor pixels by exactly 43.75% from the A.10D 720p profile.",
  );

  assert(
    /for \(const mimeType of \[\s*"video\/webm;codecs=vp8",\s*"video\/webm;codecs=vp9",\s*"video\/webm",\s*\]\)/.test(
      evidence,
    ),
    "A.10E must prefer VP8, retain VP9 as fallback, then generic WebM.",
  );

  for (const marker of [
    "capture_video_bits_per_second: number",
    "VP8 for qualification evidence",
    "DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS = 2_000",
    "DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS = 29",
    "DIRECTOR_QUALIFICATION_MAX_EFFECTIVE_SUBMISSION_FPS = 30.5",
    "DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS = 100",
    "DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS = 250",
    "DIRECTOR_QUALIFICATION_MAX_MISSED_FRAME_RATIO = 0.01",
    "DIRECTOR_QUALIFICATION_MAX_CONSECUTIVE_MISSED_FRAMES = 2",
  ]) {
    assert(evidence.includes(marker), `A.10E evidence marker missing: ${marker}`);
  }

  for (const marker of [
    "captureSurface.width = DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX",
    "captureSurface.height = DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX",
    "captureSurface.captureStream(0)",
    "videoTrack.requestFrame",
    "videoBitsPerSecond: DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND",
    "recorder.start();",
    "ENCODER WARM-UP",
    "capture_video_bits_per_second:",
    "DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND",
  ]) {
    assert(room.includes(marker), `A.10E Qualification Room marker missing: ${marker}`);
  }

  assert(
    (room.match(/<Canvas\b/g) ?? []).length === 1 &&
      room.includes('frameloop="demand"') &&
      room.includes("dpr={1}"),
    "A.10E must preserve the single demand-rendered WebGL qualification authority.",
  );

  assert(
    !room.includes("DIRECTOR_QUALIFICATION_RECORDER_TIMESLICE_MS") &&
      !/recorder\.start\(\s*\d+\s*\)/.test(room) &&
      !/active\.recorder\.requestData\s*\(/.test(room),
    "A.10E must preserve the A.10D no-timeslice/no-mid-reel-flush recorder contract.",
  );

  assert(
    DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS === 2_000 &&
      DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS === 29 &&
      DIRECTOR_QUALIFICATION_MAX_EFFECTIVE_SUBMISSION_FPS === 30.5 &&
      DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS === 100 &&
      DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS === 250 &&
      DIRECTOR_QUALIFICATION_MAX_MISSED_FRAME_RATIO === 0.01 &&
      DIRECTOR_QUALIFICATION_MAX_CONSECUTIVE_MISSED_FRAMES === 2,
    "A.10E must lower encoder load without loosening any A.10C/A.10D evidence-integrity gate.",
  );

  for (const marker of [
    "Phase 1B.7A.10E — lightweight evidence capture",
    "960×540",
    "43.75% fewer pixels",
    "VP8 first",
    "2.75 Mbps",
    "capture_video_bits_per_second",
    "2-second ENCODER WARM-UP",
    "Phase 1B.7A.11",
    "deterministic frame-by-frame export",
  ]) {
    assert(readme.includes(marker), `A.10E README marker missing: ${marker}`);
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
    `A.10E must not mutate the Level 2 vocabulary/support distribution: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)}.`,
  );

  console.log("Director Qualification Room Phase 1B.7A.10E lightweight-capture verification passed.");
  console.log(
    "Qualification evidence now prefers VP8 at 960x540 / 2.75 Mbps while preserving warm-up, deterministic 30 Hz scheduling, strict integrity gates, burn-ins, mounted-host rules, and one WebGL authority.",
  );
}

main();
