import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_QUALIFICATION_INSIDE_SOURCE_SCAN_LIMIT,
  DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT,
  directorQualificationAdaptiveContainmentClearance,
  directorQualificationContainedSourceFitFloor,
  directorQualificationOnSurfacePairIndex,
  directorQualificationSupportReceiverLooksGroundLike,
  directorQualificationSupportSurfaceIsPerceptuallyEligible,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-support-containment-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
const support = families.find(
  (family) =>
    family.category === "blocking_placement" &&
    family.group === "Support & containment",
);
const relative = families.find(
  (family) =>
    family.category === "blocking_placement" &&
    family.group === "Relative actor placement",
);
assert(support, "A.11A.17 Support & containment family is missing.");
assert(relative, "A.11A.17 Relative actor placement family is missing.");
assert(
  JSON.stringify([...support.capability_ids].sort()) ===
    JSON.stringify(["inside", "on_ground", "on_surface"]),
  `A.11A.17 Support & containment must contain exactly On Ground, On Surface and Inside; got ${JSON.stringify(support.capability_ids)}.`,
);
assert(
  relative.capability_ids.includes("attached_to"),
  "A.11A.17 Attached To must remain covered after leaving Support & containment.",
);

const everyCapability = families.flatMap((family) => family.capability_ids);
assert(
  families.length === 33 &&
    everyCapability.length === 184 &&
    new Set(everyCapability).size === 184,
  `A.11A.17 must preserve 33 families / 184 unique capability assignments; got ${families.length}/${everyCapability.length}/${new Set(everyCapability).size}.`,
);

const allSlots = [
  "character",
  "vehicle",
  "furniture",
  "irregular_hero",
  "compact_rigid",
  "simple_rigid",
  "small_asymmetric",
  "organic_elongated",
  "small_detail",
] as const;
for (const capabilityId of ["on_surface", "inside"] as const) {
  const profile = directorQualificationCapabilityProfile(support, capabilityId);
  assert(
    allSlots.every((slot) => profile.suitable_primary_cast_slots.includes(slot)),
    `A.11A.17 ${capabilityId} must admit the full Qualification Cast as potential sources; geometry/fit, not semantic bans, determines Cross-asset evidence.`,
  );
}

assert(
  directorQualificationSupportReceiverLooksGroundLike([1.5, 0.018, 1.5]) &&
    !directorQualificationSupportReceiverLooksGroundLike([0.5, 0.72, 0.5]),
  "A.11A.17 On Surface must reject rug/floor-like receivers without hard-coded asset IDs.",
);
assert(
  directorQualificationSupportSurfaceIsPerceptuallyEligible({
    normal_y: 0.99,
    exposure: "open",
    openness: "open",
    blocked_fraction: 0.1,
    height_ratio: 0.76,
  }) &&
    !directorQualificationSupportSurfaceIsPerceptuallyEligible({
      normal_y: 0.99,
      exposure: "open",
      openness: "open",
      blocked_fraction: 0.1,
      height_ratio: 0.07,
    }),
  "A.11A.17 On Surface must distinguish obvious elevated support from low accidental ledges.",
);
assert(
  directorQualificationOnSurfacePairIndex({
    pass_kind: "diversity",
    variant_index: 0,
    pair_count: 3,
    canaries_per_pass: 3,
  }) === null &&
    directorQualificationOnSurfacePairIndex({
      pass_kind: "diversity",
      variant_index: 0,
      pair_count: 6,
      canaries_per_pass: 3,
    }) === 3,
  "A.11A.17 Cross-asset On Surface diversity must not wrap baseline pairs.",
);
assert(
  DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT <= 24 &&
    DIRECTOR_QUALIFICATION_INSIDE_SOURCE_SCAN_LIMIT <= 18,
  "A.11A.17 physical-pair source scans must remain bounded rather than scaling quadratically with the whole library.",
);
const smallClearance = directorQualificationAdaptiveContainmentClearance(
  [0.06, 0.08, 0.06],
  0.008,
);
assert(
  smallClearance < 0.008 &&
    directorQualificationContainedSourceFitFloor(0.06) >= 0.045,
  "A.11A.17 Inside must use proportional small-cavity clearance and a plausible contained-source shrink floor while keeping receiver size authoritative.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
for (const marker of [
  'kind: "support_surface"',
  "directorQualificationSupportSurfaceIsPerceptuallyEligible",
  "directorQualificationSupportReceiverLooksGroundLike",
  "DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT",
  "DIRECTOR_QUALIFICATION_INSIDE_SOURCE_SCAN_LIMIT",
  "pairAtExtent",
  "step < 10",
  "On Surface Cross-asset source canary",
  "physicalInspectionRequired",
]) {
  assert(room.includes(marker), `A.11A.17 Qualification Room marker missing: ${marker}`);
}
assert(
  !room.includes("On Surface non-drinkware source canary") &&
    !room.includes("directorQualificationIsDrinkwareSource(asset)"),
  "A.11A.17 must retire semantic drinkware bans from On Surface evidence admission.",
);

const inspection = source(
  "sandbox/probe-lab/motion-camera-library/director-qualification-physical-inspection.ts",
);
assert(
  inspection.includes("directorQualificationBroadTopAccessProposal") &&
    inspection.includes("sampled.top_opening ??") &&
    inspection.includes("raycastOpenCavityTopology"),
  "A.11A.17 basin-style top access must remain a proposal until exact downward ray topology confirms a real cavity.",
);

const contract = source(
  "sandbox/probe-lab/motion-camera-library/director-qualification-contract.ts",
);
assert(
  contract.includes('kind: "support_surface"') &&
    contract.includes('evidence_source: "asset_geometry_profile"'),
  "A.11A.17 qualification must replay the exact selected measured support surface.",
);
const directability = source(
  "sandbox/probe-lab/directability/asset-directability-from-asset.ts",
);
assert(
  directability.includes("height_ratio: surface.height_ratio"),
  "A.11A.17 support elevation evidence must propagate from geometry into Directability.",
);
const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
assert(
  runtime.includes("directorPhysicalAdaptiveContainmentClearance"),
  "A.11A.17 runtime must use adaptive containment clearance for small real containers.",
);
const capabilityLibrary = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
assert(
  capabilityLibrary.includes('import("./director-qualification-room")') &&
    capabilityLibrary.includes('loadAssets("qualification")'),
  "A.11A.17 must preserve A.11A.16 Qualification auto-load/code-splitting rather than re-bloating the Director page.",
);

console.log(
  "Director Support & containment Phase 1B.7A.11A.17 three-relation generalization verification passed.",
);
console.log(
  "Support & containment is exactly On Ground / On Surface / Inside; each relation owns its own Cross-asset generalization, Attached To remains covered elsewhere, On Surface uses readable measured support without semantic source bans, and Inside uses receiver-authoritative adaptive fit plus ray-confirmed basin/vessel topology.",
);
