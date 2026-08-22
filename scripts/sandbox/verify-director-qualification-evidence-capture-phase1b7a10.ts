import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_QUALIFICATION_CAPTURE_FPS,
  DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
  buildDirectorQualificationEvidenceZip,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-evidence";
import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

async function main() {
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const evidence = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-evidence.ts",
  );
  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  const packageJson = source("package.json");

  for (const marker of [
    "function QualificationCaptureCanvasBridge",
    'active={evidenceCapturePhase === "recording"}',
    "captureSurface.captureStream(0)",
    "videoTrack.requestFrame",
    "new MediaRecorder(stream",
    "DIRECTOR_QUALIFICATION_ENCODER_WARMUP_MS",
    "recorder.start();",
    "ENCODER WARM-UP",
    "DIRECTOR_QUALIFICATION_COMPLETE_HOLD_MS",
    'phase !== "complete" || evidenceCapturePhase !== "recording"',
    "Render gauntlet + export evidence",
    'const recordingFilename = "recording.webm"',
    'const manifestFilename = "recording-manifest.json"',
    'const summaryFilename = "evidence-summary.json"',
    "qualificationStateRef.current.reviews",
    "reel_time_zero_recording_offset_ms",
    'capture_burnin_in_video: true',
    'dom_overlays_in_video: false',
    "buildDirectorQualificationEvidenceZip",
    "downloadDirectorQualificationEvidence",
    "Evidence capture cancelled; no package was downloaded.",
  ]) {
    assert(room.includes(marker), `A.10 Qualification recorder marker missing: ${marker}`);
  }

  assert(
    (room.match(/<Canvas\b/g) ?? []).length === 1 &&
      room.includes('frameloop="demand"') &&
      room.includes("dpr={1}"),
    "A.10 must reuse the one demand-rendered Qualification Canvas rather than create a recording renderer.",
  );

  assert(
    room.includes("setShowCameraPath(false)") &&
      room.includes("setShowRoleLabels(false)") &&
      room.includes("disabled={evidenceCaptureBusy}"),
    "A.10 automated capture must neutralize/lock debug presentation controls while evidence is being recorded.",
  );

  assert(
    /const nextManifest = buildManifest\(\);[\s\S]*manifest: nextManifest,[\s\S]*setManifest\(nextManifest\)/.test(
      room,
    ),
    "A.10 must bind MediaRecorder metadata and the reel state machine to the same manifest instance.",
  );

  for (const marker of [
    "director_qualification_evidence_phase1b7a10f_v1",
    "DIRECTOR_QUALIFICATION_CAPTURE_FPS = 30",
    '"video/webm;codecs=vp9"',
    '"video/webm;codecs=vp8"',
    "async function crc32Blob",
    "Store-only ZIP writer for Qualification evidence",
    "0x04034b50",
    "0x02014b50",
    "0x06054b50",
    "nameBytes: ArrayBuffer",
    "const nameBytes = new ArrayBuffer(encodedName.byteLength)",
    "new Uint8Array(nameBytes).set(encodedName)",
  ]) {
    assert(evidence.includes(marker), `A.10 evidence utility marker missing: ${marker}`);
  }

  assert(
    !/"(?:jszip|fflate|archiver|adm-zip)"\s*:/.test(packageJson),
    "A.10 should not add a ZIP dependency for already-compressed WebM evidence.",
  );

  for (const marker of [
    "Phase 1B.7A.10 — automated gauntlet evidence capture",
    "Render gauntlet + export evidence",
    "same manifest instance",
    "QualificationCaptureCanvasBridge",
    "REEL COMPLETE",
    "recording.webm",
    "recording-manifest.json",
    "evidence-summary.json",
    "reel_time_zero_recording_offset_ms",
    "webgl_plus_capture_burnin",
    "capture_burnin_in_video: true",
    "dom_overlays_in_video: false",
    "Phase 1B.7A.11",
  ]) {
    assert(readme.includes(marker), `A.10 README marker missing: ${marker}`);
  }

  assert(
    DIRECTOR_QUALIFICATION_CAPTURE_FPS === 30 &&
      DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION ===
        "director_qualification_evidence_phase1b7a10f_v1",
    "A.10 evidence constants drifted from its A.10E successor-compatible capture contract.",
  );

  const zip = await buildDirectorQualificationEvidenceZip([
    { name: "recording.webm", blob: new Blob(["webm-proof"]) },
    { name: "recording-manifest.json", blob: new Blob(["{\"reel\":true}"]) },
    { name: "evidence-summary.json", blob: new Blob(["{\"status\":\"complete\"}"]) },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoded = new TextDecoder().decode(bytes);
  assert(view.getUint32(0, true) === 0x04034b50, "A.10 ZIP local header signature is invalid.");
  assert(
    view.getUint32(bytes.byteLength - 22, true) === 0x06054b50,
    "A.10 ZIP end-of-central-directory signature is invalid.",
  );
  assert(
    view.getUint16(bytes.byteLength - 12, true) === 3 &&
      decoded.includes("recording.webm") &&
      decoded.includes("recording-manifest.json") &&
      decoded.includes("evidence-summary.json"),
    "A.10 ZIP proof must contain exactly the three promised evidence entries.",
  );

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
    `A.10 must not mutate the Level 2 vocabulary/support distribution: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)}.`,
  );

  console.log("Director Qualification Room Phase 1B.7A.10 evidence-capture verification passed.");
  console.log(
    "One existing WebGL Canvas remains authoritative while the A.10E lightweight warm-up compositor records the same-run gauntlet, auto-stops after REEL COMPLETE, and exports a valid WebM + manifest + summary ZIP without a new package dependency.",
  );
}

void main();
