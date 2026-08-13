import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_AUDIT_FIXTURE_KINDS,
  DIRECTOR_VISUAL_AUDIT_VERSION,
  directorVisualAuditDefinition,
} from "../../sandbox/probe-lab/motion-camera-library/director-visual-audit";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const ids = new Set(DIRECTOR_CAPABILITIES.map((capability) => capability.id));
assert(DIRECTOR_CAPABILITIES.length === 183, "Phase 1B.2 expects the current 183-capability registry.");

for (const capability of DIRECTOR_CAPABILITIES) {
  const definition = directorVisualAuditDefinition(capability);
  assert(
    definition.capability_id === capability.id,
    `${capability.id} audit definition changed identity.`,
  );
  assert(
    DIRECTOR_AUDIT_FIXTURE_KINDS.includes(definition.fixture),
    `${capability.id} has unknown audit fixture ${definition.fixture}.`,
  );
  assert(
    definition.expected_behavior.length >= 2,
    `${capability.id} needs at least two human-review expectations.`,
  );
  for (const compareId of definition.compare_capability_ids) {
    assert(
      ids.has(compareId),
      `${capability.id} compares against missing capability ${compareId}.`,
    );
  }
}

const expectedFixtures: Record<string, string> = {
  over_shoulder: "two_subject_viewpoint",
  point_of_view: "two_subject_viewpoint",
  object_attached: "mounted_camera",
  camera_object_attached: "mounted_camera",
  follow: "travelling_subject",
  lead_subject: "travelling_subject",
  lag_follow: "travelling_subject",
  track_parallel: "travelling_subject",
  isometric: "technical_overview",
  macro: "detail_target",
  insert: "detail_target",
};

for (const [id, expected] of Object.entries(expectedFixtures)) {
  const capability = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(capability, `Missing audit canary ${id}.`);
  assert(
    directorVisualAuditDefinition(capability).fixture === expected,
    `${id} should use ${expected} controlled fixture.`,
  );
}

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  "DirectorAuditViewer",
  "myway_director_visual_audit_phase1b2_v1",
  "Export audit JSON",
  "INITIAL_CATALOG_LIMIT = 36",
  "filtered.slice(0, catalogLimit)",
  "localStorage",
  "Only {Math.min(catalogLimit, filtered.length)} cards are mounted at once",
  "Controlled fixture",
  "Expected behavior",
  "Approximation acceptable",
]) {
  assert(
    library.includes(marker),
    `Director Capability Library is missing Phase 1B.2 audit marker: ${marker}.`,
  );
}
assert(
  !library.includes("window.setInterval"),
  "The catalogue page must not own the playback timer after Phase 1B.2.",
);
assert(
  !library.includes("<Canvas"),
  "The catalogue page must not own the WebGL Canvas after Phase 1B.2.",
);

const viewer = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-audit-viewer.tsx",
);
for (const marker of [
  'type PreviewMode = "controlled" | "real_assets"',
  'frameloop="demand"',
  "dpr={1}",
  'powerPreference: "low-power"',
  "shadows={false}",
  "IntersectionObserver",
  'document.visibilityState === "visible"',
  "window.setInterval",
  "showRoleLabels",
  "showCameraPath",
  "no GLB required",
]) {
  assert(
    viewer.includes(marker),
    `Isolated Director audit viewer is missing performance marker: ${marker}.`,
  );
}

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  "ControlledAuditActor",
  'fixtureMode?: "controlled" | "real_assets"',
  "fixtureKind?: DirectorAuditFixtureKind",
  "auditSnap?: boolean",
  'fixtureKind === "detail_target"',
  'fixtureKind === "two_subject_viewpoint"',
  'fixtureKind === "mounted_camera"',
  "auditSnap ? false : isPlaying",
]) {
  assert(
    preview.includes(marker),
    `Director preview is missing controlled-fixture marker: ${marker}.`,
  );
}

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
for (const marker of [
  "Phase 1B.2 visual audit harness",
  "DPR 1",
  "Asset Library is not fetched on page load",
  "persisted in browser localStorage",
  "exported as JSON",
]) {
  assert(
    readme.includes(marker),
    `Director Capability README is missing Phase 1B.2 marker: ${marker}.`,
  );
}

console.log("Director visual audit harness Phase 1B.2 verification passed.");
console.log(`Audit version: ${DIRECTOR_VISUAL_AUDIT_VERSION}.`);
console.log(`Capabilities with controlled audit definitions: ${DIRECTOR_CAPABILITIES.length}.`);
console.log(`Fixture families: ${DIRECTOR_AUDIT_FIXTURE_KINDS.length}.`);
console.log("Playback is isolated from the catalogue; Canvas is demand-rendered at DPR 1 and sleeps offscreen/hidden.");
console.log("Audit review state is locally persisted and exportable; real GLBs are opt-in only.");
