import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CAST,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-cast";
import {
  DIRECTOR_QUALIFICATION_DECISIONS,
  DIRECTOR_QUALIFICATION_SCHEMA_VERSION,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-contract";
import {
  buildDirectorQualificationFamilies,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_QUALIFICATION_SCENES,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert(
  DIRECTOR_CAPABILITIES.length === 184,
  `Phase 1B.7A must qualify the existing 184 Level 2 capabilities; found ${DIRECTOR_CAPABILITIES.length}.`,
);
assert(
  DIRECTOR_QUALIFICATION_SCHEMA_VERSION ===
    "director_qualification_phase1b7a_v1",
  "Qualification schema version drifted.",
);

const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
assert(families.length > 8, "Qualification Room should expose meaningful Level 2 audition families.");

const groupedIds = families.flatMap((family) => family.capability_ids);
assert(
  groupedIds.length === DIRECTOR_CAPABILITIES.length,
  "Every Level 2 capability must appear in exactly one family audition group.",
);
assert(
  new Set(groupedIds).size === DIRECTOR_CAPABILITIES.length,
  "A Level 2 capability was duplicated across qualification families.",
);
for (const capability of DIRECTOR_CAPABILITIES) {
  assert(
    groupedIds.includes(capability.id),
    `Qualification family coverage is missing ${capability.id}.`,
  );
}

assert(
  DIRECTOR_QUALIFICATION_SCENES.length === 4 &&
    DIRECTOR_QUALIFICATION_SCENES.map((scene) => scene.version).join("|") ===
      "scene_a_v1|scene_b_v1|scene_c_v1|scene_d_v1",
  "Phase 1B.7A must freeze Scene A-D v1 contracts.",
);
assert(
  DIRECTOR_QUALIFICATION_CAST.length >= 9,
  "Qualification Cast must span at least nine semantic geometry classes.",
);
for (const castId of [
  "character",
  "compact_rigid",
  "small_asymmetric",
  "furniture",
  "small_detail",
  "simple_rigid",
  "irregular_hero",
  "organic_elongated",
  "vehicle",
]) {
  assert(
    DIRECTOR_QUALIFICATION_CAST.some((slot) => slot.id === castId),
    `Qualification Cast is missing ${castId}.`,
  );
}
for (const decision of [
  "qualified",
  "fix",
  "merge_candidate",
  "redefine",
  "restrict",
  "retire",
  "blocked",
]) {
  assert(
    DIRECTOR_QUALIFICATION_DECISIONS.includes(
      decision as (typeof DIRECTOR_QUALIFICATION_DECISIONS)[number],
    ),
    `Qualification decision ${decision} is missing.`,
  );
}

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  'import dynamic from "next/dynamic";',
  'import("./director-qualification-room")',
  'const DirectorQualificationRoom = dynamic(',
  'import { DirectorLibraryTabs } from "./director-library-tabs";',
  'activeTab === "qualification"',
  'activeTab="capabilities"',
  'onOpenQualificationRoom',
]) {
  assert(
    library.includes(marker),
    `Director Capability Library tab integration is missing marker: ${marker}.`,
  );
}
assert(
  !library.includes("<Canvas"),
  "Canonical Director shell must continue delegating Canvas ownership to the active viewer.",
);
assert(
  !library.includes('import { DirectorQualificationRoom } from "./director-qualification-room";'),
  "Qualification Room should remain code-split instead of inflating the initial Capabilities bundle.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
for (const marker of [
  "Director Qualification Room",
  "Run family gauntlet",
  "Export recording manifest",
  "Fixed 16:9 frame for Windows Snipping Tool recordings.",
  'aspectRatio: "16 / 9"',
  'frameloop="demand"',
  'fixtureMode="real_assets"',
  "QUALIFICATION_STORAGE_KEY",
  "QUALIFICATION_CAST_STORAGE_KEY",
  "recording_start_offset_ms",
  "qualificationReviewForCapability",
  "updateReview",
  "Qualification cast",
]) {
  assert(room.includes(marker), `Qualification Room is missing marker: ${marker}.`);
}
assert(
  (room.match(/<Canvas/g) ?? []).length === 1,
  "Qualification Room must own exactly one active WebGL Canvas.",
);
assert(
  !room.includes("Controlled proof"),
  "Qualification Room must not expose the retired Controlled proof UI.",
);

const tabs = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-library-tabs.tsx",
);
assert(
  tabs.includes("Capabilities") && tabs.includes("Qualification Room"),
  "Director tab bar must expose Capabilities and Qualification Room.",
);

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
for (const marker of [
  "Phase 1B.7A — Director Qualification Room foundation",
  "scene_a_v1",
  "scene_d_v1",
  "Family gauntlets",
  "A Director capability earns its place in MyWay through evidence",
]) {
  assert(readme.includes(marker), `Qualification README is missing marker: ${marker}.`);
}

console.log("Director Qualification Room Phase 1B.7A verification passed.");
console.log(`${DIRECTOR_CAPABILITIES.length} Level 2 capabilities are covered exactly once across ${families.length} dynamic audition families.`);
console.log("Scene A-D, semantic Qualification Cast, one-Canvas recording reel, run manifests, and keep/fix/merge/redefine/restrict/retire decisions are wired.");
