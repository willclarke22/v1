import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CAPTURE_FPS,
  DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX,
  DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND,
  DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX,
  DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
  evaluateDirectorQualificationEvidenceIntegrity,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-evidence";
import {
  buildDirectorQualificationVp8WebM,
  type DirectorQualificationVp8Chunk,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-deterministic-webm";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function fakeVp8Chunk(index: number): DirectorQualificationVp8Chunk {
  const data = new ArrayBuffer(4);
  new Uint8Array(data).set([0x9d, 0x01, 0x2a, index & 0xff]);
  return {
    timestamp_us: Math.round((index * 1_000_000) / 30),
    duration_us: Math.round(1_000_000 / 30),
    key_frame: index === 0,
    data,
  };
}

async function main() {
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const evidence = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-evidence.ts",
  );
  const muxer = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-deterministic-webm.ts",
  );
  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");

  assert(
    DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION ===
      "director_qualification_evidence_phase1b7a10f_v1",
    "A.10F must advance the evidence schema.",
  );
  assert(
    DIRECTOR_QUALIFICATION_CAPTURE_FPS === 30 &&
      DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX === 960 &&
      DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX === 540 &&
      DIRECTOR_QUALIFICATION_CAPTURE_VIDEO_BITS_PER_SECOND === 2_750_000,
    "A.10F must preserve the proven A.10E lightweight evidence profile.",
  );

  for (const marker of [
    "renderGauntletAndExportEvidenceDeterministically",
    "deterministicEvidenceFrameState",
    "requestDeterministicRender",
    "pendingRenderResolvers",
    "useFrame(() =>",
    "queueMicrotask(() =>",
    "flushSync(() =>",
    'codec: "vp8"',
    "VideoEncoderCtor.isConfigSupported",
    "new VideoFrameCtor(captureSurface",
    "encoder.encodeQueueSize > 8",
    "await encoder.flush()",
    "frameIndex * 1_000_000",
    "render_wall_time_ms",
    "expected_encoded_frame_count",
    "encoded_frame_count",
    'capture_method: "deterministic_webcodecs_vp8_frame_export"',
    'capture_mime_type: "video/webm;codecs=vp8"',
    "machine speed affects export time, not movie time",
    "buildDirectorQualificationVp8WebM",
    "Render gauntlet + export evidence",
  ]) {
    assert(room.includes(marker), `A.10F Qualification Room marker missing: ${marker}`);
  }

  assert(
    room.includes(
      "onClick={() => void renderGauntletAndExportEvidenceDeterministically()}",
    ) &&
      !room.includes(
        "onClick={() => void recordGauntletAndExportEvidence()}",
      ),
    "A.10F UI must route the evidence action to deterministic export rather than real-time MediaRecorder.",
  );

  assert(
    (room.match(/<Canvas\b/g) ?? []).length === 1 &&
      room.includes('frameloop="demand"') &&
      room.includes("preserveDrawingBuffer: true"),
    "A.10F must keep one demand-rendered WebGL authority.",
  );

  for (const marker of [
    "deterministic_encoded_frame_count_mismatch",
    "deterministic_frame_export?: true",
    "expected_frame_count?: number",
    "rendered_frame_count?: number",
    "encoded_frame_count?: number",
    "export_wall_time_ms?: number",
    "max_frame_render_wall_time_ms?: number",
    'webcodecs_codec?: "vp8"',
    '"deterministic_webcodecs_vp8_frame_export"',
  ]) {
    assert(evidence.includes(marker), `A.10F evidence marker missing: ${marker}`);
  }

  assert(
    !/\b\d+n\b/.test(muxer) &&
      muxer.includes("BigInt(1)") &&
      muxer.includes("BigInt(0xff)"),
    "A.10F WebM muxer must avoid ES2020 BigInt literal syntax so the Next.js ES2017 target can type-check it.",
  );

  for (const marker of [
    "Dependency-free WebM muxer",
    'stringElement(0x86, "V_VP8")',
    "simpleBlock(",
    "buildClusters(",
    "float64Element(0x4489, input.duration_ms)",
    "new Blob([...ebml.parts, ...segment.parts]",
  ]) {
    assert(muxer.includes(marker), `A.10F deterministic WebM marker missing: ${marker}`);
  }

  const good = evaluateDirectorQualificationEvidenceIntegrity({
    expected_recording_duration_ms: 10_000,
    measured_recording_duration_ms: 10_000,
    evidence_window_duration_ms: 10_000,
    media_duration_ms: 10_000,
    scheduled_frame_count: 300,
    submitted_frame_count: 300,
    missed_frame_count: 0,
    max_consecutive_missed_frames: 0,
    largest_submission_gap_ms: 1000 / 30,
    completion_frame_captured: true,
    expected_encoded_frame_count: 300,
    encoded_frame_count: 300,
  });
  assert(
    good.evidence_integrity === "pass" &&
      good.integrity_failures.length === 0 &&
      good.effective_submission_fps === 30,
    `A.10F complete deterministic fixture should pass: ${JSON.stringify(good)}`,
  );

  const missingEncodedFrame = evaluateDirectorQualificationEvidenceIntegrity({
    expected_recording_duration_ms: 10_000,
    measured_recording_duration_ms: 10_000,
    evidence_window_duration_ms: 10_000,
    media_duration_ms: 10_000,
    scheduled_frame_count: 300,
    submitted_frame_count: 300,
    missed_frame_count: 0,
    max_consecutive_missed_frames: 0,
    largest_submission_gap_ms: 1000 / 30,
    completion_frame_captured: true,
    expected_encoded_frame_count: 300,
    encoded_frame_count: 299,
  });
  assert(
    missingEncodedFrame.evidence_integrity === "fail" &&
      missingEncodedFrame.integrity_failures.includes(
        "deterministic_encoded_frame_count_mismatch",
      ),
    `A.10F must fail closed when WebCodecs omits a logical frame: ${JSON.stringify(missingEncodedFrame)}`,
  );

  const fakeWebM = buildDirectorQualificationVp8WebM({
    width: 960,
    height: 540,
    fps: 30,
    duration_ms: 100,
    chunks: [fakeVp8Chunk(0), fakeVp8Chunk(1), fakeVp8Chunk(2)],
  });
  const bytes = new Uint8Array(await fakeWebM.arrayBuffer());
  assert(
    fakeWebM.type === "video/webm;codecs=vp8" &&
      bytes.length > 64 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3 &&
      Array.from(bytes).some((value, index) =>
        value === 0x18 &&
        bytes[index + 1] === 0x53 &&
        bytes[index + 2] === 0x80 &&
        bytes[index + 3] === 0x67
      ),
    "A.10F muxer must emit EBML + Segment signatures in a VP8 WebM Blob.",
  );

  for (const marker of [
    "Phase 1B.7A.10F — deterministic frame-by-frame evidence export",
    "Frame N is now an obligation, not a deadline",
    "WebCodecs `VideoEncoder`",
    "frameIndex / 30",
    "render_wall_time_ms",
    "deterministic_webcodecs_vp8_frame_export",
    "A slow",
    "Render gauntlet + export evidence",
    "Phase 1B.7A.11",
  ]) {
    assert(readme.includes(marker), `A.10F README marker missing: ${marker}`);
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
    `A.10F must not mutate the Level 2 vocabulary/support distribution: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)}.`,
  );

  console.log(
    "Director Qualification Room Phase 1B.7A.10F deterministic-export verification passed.",
  );
  console.log(
    "Every logical evidence frame is now rendered, awaited, VP8-encoded with an explicit media timestamp, muxed into WebM, and counted before the strict evidence contract can pass.",
  );
}

void main();
