import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  DIRECTOR_CAPABILITY_SUPPORT_LEVELS,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  directorQualificationMountedCameraHostSuitability,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-cast";
import {
  DIRECTOR_QUALIFICATION_CAPTURE_FPS,
  DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX,
  DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX,
  DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
  buildDirectorQualificationEvidenceZip,
  evaluateDirectorQualificationEvidenceIntegrity,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-evidence";

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
  const cast = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-cast.ts",
  );
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  const packageJson = source("package.json");

  for (const marker of [
    "Fixed 16:9 frame for Windows Snipping Tool recordings.",
    "function startQualificationEvidenceCompositor",
    "function submitQualificationEvidenceFrame",
    "function drawQualificationEvidenceFrame",
    "qualificationCaptureTimelineState",
    "captureSurface.captureStream(0)",
    "videoTrack.requestFrame",
    "preserveDrawingBuffer: true",
    "REEL COMPLETE",
    "capture_burnin_in_video: true",
    "completion_frame_captured",
    "measureDirectorQualificationRecordingDurationMs",
    "evaluateDirectorQualificationEvidenceIntegrity",
    'capture_method: "composited_canvas_capture_stream_media_recorder"',
    'capture_scope: "webgl_plus_capture_burnin"',
  ]) {
    assert(room.includes(marker), `A.10B Qualification capture marker missing: ${marker}`);
  }

  assert(
    (room.match(/<Canvas\b/g) ?? []).length === 1 &&
      room.includes('frameloop="demand"') &&
      room.includes("dpr={1}"),
    "A.10B must preserve exactly one R3F/WebGL Canvas; the evidence compositor is a 2D copy surface, not a second renderer.",
  );

  assert(
    !room.includes("canvas.captureStream(DIRECTOR_QUALIFICATION_CAPTURE_FPS)") &&
      room.includes("captureSurface.captureStream(0)"),
    "A.10B must retire direct demand-canvas recording in favor of manual-frame compositor capture.",
  );

  assert(
    /const nextManifest = buildManifest\(\);[\s\S]*manifest: nextManifest,[\s\S]*setManifest\(nextManifest\)/.test(
      room,
    ),
    "A.10B must keep recorder metadata and reel playback bound to the same manifest instance.",
  );

  for (const marker of [
    "director_qualification_evidence_phase1b7a10f_v1",
    "DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX = 960",
    "DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX = 540",
    "DIRECTOR_QUALIFICATION_MIN_EFFECTIVE_SUBMISSION_FPS = 29",
    "DIRECTOR_QUALIFICATION_MAX_SUBMISSION_GAP_MS = 100",
    "DIRECTOR_QUALIFICATION_MAX_TIMELINE_DRIFT_MS = 250",
    "recorded_media_duration_unverified",
    "recorded_media_timeline_drift",
    "capture_submission_rate_below_floor",
    "capture_submission_gap_too_large",
    "reel_complete_frame_missing",
  ]) {
    assert(evidence.includes(marker), `A.10B evidence-integrity marker missing: ${marker}`);
  }

  assert(
    DIRECTOR_QUALIFICATION_CAPTURE_FPS === 30 &&
      DIRECTOR_QUALIFICATION_CAPTURE_WIDTH_PX === 960 &&
      DIRECTOR_QUALIFICATION_CAPTURE_HEIGHT_PX === 540 &&
      DIRECTOR_QUALIFICATION_EVIDENCE_SCHEMA_VERSION ===
        "director_qualification_evidence_phase1b7a10f_v1",
    "A.10B capture constants/schema drifted from its A.10E successor contract.",
  );

  const passingIntegrity = evaluateDirectorQualificationEvidenceIntegrity({
    expected_recording_duration_ms: 10_000,
    measured_recording_duration_ms: 10_030,
    evidence_window_duration_ms: 10_030,
    media_duration_ms: 10_020,
    scheduled_frame_count: 300,
    submitted_frame_count: 299,
    missed_frame_count: 1,
    max_consecutive_missed_frames: 1,
    largest_submission_gap_ms: 48,
    completion_frame_captured: true,
  });
  assert(
    passingIntegrity.evidence_integrity === "pass" &&
      passingIntegrity.integrity_failures.length === 0 &&
      Math.abs(passingIntegrity.timeline_drift_ms ?? 9999) <= 30 &&
      passingIntegrity.effective_submission_fps > 29,
    `A.10B good evidence should pass integrity: ${JSON.stringify(passingIntegrity)}`,
  );

  const failingIntegrity = evaluateDirectorQualificationEvidenceIntegrity({
    expected_recording_duration_ms: 10_000,
    measured_recording_duration_ms: 10_000,
    evidence_window_duration_ms: 10_000,
    media_duration_ms: 8_200,
    scheduled_frame_count: 300,
    submitted_frame_count: 160,
    missed_frame_count: 140,
    max_consecutive_missed_frames: 28,
    largest_submission_gap_ms: 900,
    completion_frame_captured: false,
  });
  assert(
    failingIntegrity.evidence_integrity === "fail" &&
      failingIntegrity.integrity_failures.includes("recorded_media_timeline_drift") &&
      failingIntegrity.integrity_failures.includes("capture_submission_rate_below_floor") &&
      failingIntegrity.integrity_failures.includes("capture_submission_gap_too_large") &&
      failingIntegrity.integrity_failures.includes("capture_missed_frame_ratio_too_high") &&
      failingIntegrity.integrity_failures.includes("capture_consecutive_missed_frames_too_high") &&
      failingIntegrity.integrity_failures.includes("reel_complete_frame_missing"),
    `A.10B bad evidence must fail closed: ${JSON.stringify(failingIntegrity)}`,
  );

  for (const marker of [
    "directorQualificationMountedCameraHostSuitability",
    "open_frame_vehicle_requires_specialized_mount",
    "body_host_semantics",
    "no_canonical_body_mount_reference",
  ]) {
    assert(cast.includes(marker), `A.10B mounted-host gate marker missing: ${marker}`);
  }
  assert(
    room.includes("mountedCameraHostCandidateForPass") &&
      room.includes("directorQualificationMountedCameraHostSuitability(asset).suitable") &&
      room.includes("suitableHosts[desiredIndex] ?? suitableHosts[0]") &&
      room.includes("mountedHostCoverageMissing") &&
      room.includes("Mounted-camera evidence is blocked"),
    "A.10B mounted evidence must filter Vehicle candidates by host suitability and reuse the proven host when diversity is unavailable.",
  );

  const car = {
    canonical_label: "lamborghini sports car",
    display_name: "Lamborghini",
    verified_canonical_label: "sports car",
    aliases: ["car"],
    verified_aliases: [],
    semantic_tags: ["vehicle", "automobile", "car"],
    contains: ["bodywork", "hood"],
    affordances: ["drive"],
    preferred_for_concepts: ["sports car"],
    dimensions_m: [4.4, 1.2, 1.9],
  } as any;
  const bicycle = {
    canonical_label: "road bicycle",
    display_name: "Bicycle",
    verified_canonical_label: "bicycle",
    aliases: ["bike"],
    verified_aliases: [],
    semantic_tags: ["vehicle", "bicycle"],
    contains: ["frame", "wheels"],
    affordances: ["ride"],
    preferred_for_concepts: ["bike"],
    dimensions_m: [1.8, 1.1, 0.45],
  } as any;
  assert(
    directorQualificationMountedCameraHostSuitability(car).suitable,
    "A.10B must accept a car/body host for the canonical mounted-camera proof.",
  );
  assert(
    !directorQualificationMountedCameraHostSuitability(bicycle).suitable,
    "A.10B must keep open-frame bicycle geometry out of the current hood/body mounted-camera proof.",
  );

  assert(
    preview.includes("intensity={0.78}") &&
      preview.includes("qualificationVisibilityAssist?: boolean") &&
      preview.includes("lighting_emphasis therefore remains authored-lighting-only"),
    "A.10B may modestly strengthen the camera-family qualification fill but must keep it Qualification-only and out of lighting evidence.",
  );

  for (const marker of [
    "Phase 1B.7A.10B — evidence integrity + mounted-host hardening",
    "1280×720 evidence",
    "captureStream(0)",
    "requestFrame()",
    "evidence_integrity",
    "mounted-host suitability gate",
    "REEL COMPLETE",
    "Phase 1B.7A.11",
  ]) {
    assert(readme.includes(marker), `A.10B README marker missing: ${marker}`);
  }

  assert(
    !/"(?:jszip|fflate|archiver|adm-zip)"\s*:/.test(packageJson),
    "A.10B must retain the dependency-free store-only ZIP path.",
  );

  const zip = await buildDirectorQualificationEvidenceZip([
    { name: "recording.webm", blob: new Blob(["webm-proof"]) },
    { name: "recording-manifest.json", blob: new Blob(["{\"reel\":true}"]) },
    { name: "evidence-summary.json", blob: new Blob(["{\"evidence_integrity\":\"pass\"}"]) },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoded = new TextDecoder().decode(bytes);
  assert(view.getUint32(0, true) === 0x04034b50, "A.10B ZIP local header signature is invalid.");
  assert(
    view.getUint32(bytes.byteLength - 22, true) === 0x06054b50,
    "A.10B ZIP end-of-central-directory signature is invalid.",
  );
  assert(
    view.getUint16(bytes.byteLength - 12, true) === 3 &&
      decoded.includes("recording.webm") &&
      decoded.includes("recording-manifest.json") &&
      decoded.includes("evidence-summary.json"),
    "A.10B must preserve the three-file evidence package contract.",
  );

  // Successor-safe historical invariant: A.10B owns evidence capture/integrity, not the
  // later semantic reclassification of Director support levels. Qualification closeout phases
  // legitimately move capabilities between direct/compound/approximate while preserving the
  // 184-capability vocabulary. Keep this verifier focused on vocabulary cardinality and valid
  // support classifications instead of freezing a one-time distribution from A.10B.
  const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
    (counts, item) => {
      counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const recognizedSupportKinds = new Set<string>(
    DIRECTOR_CAPABILITY_SUPPORT_LEVELS,
  );
  const unknownSupportKinds = Object.keys(supportCounts).filter(
    (kind) => !recognizedSupportKinds.has(kind),
  );
  const classifiedCapabilityCount = Object.values(supportCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      classifiedCapabilityCount === DIRECTOR_CAPABILITIES.length &&
      unknownSupportKinds.length === 0,
    `A.10B must preserve the 184-capability vocabulary and recognized support classifications: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)} unknown=${JSON.stringify(unknownSupportKinds)}.`,
  );

  console.log("Director Qualification Room Phase 1B.7A.10B evidence-integrity verification passed.");
  console.log(
    "Evidence retains the A.10B manual-frame compositor/burn-in/integrity foundation; A.10E lowers only the capture-cost profile while mounted-camera diversity stays host-suitable.",
  );
}

void main();
