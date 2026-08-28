import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const deferred = [...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS] as readonly string[];

  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      frozenFamilies.length === 33 &&
      activeFamilies.length === 33,
    "A.11A.21 H2 must preserve the frozen Director taxonomy and 33 qualification families.",
  );
  assert(
    deferred.includes("inside_object") && deferred.includes("macro"),
    `A.11A.21 H2 lineage requires inside_object + macro to remain deferred. Got ${JSON.stringify(deferred)}.`,
  );

  const detail = activeFamilies.find(
    (family) =>
      family.category === "camera_framing" &&
      family.group === "Detail & relationship framing",
  );
  assert(detail, "Detail & relationship framing active family is missing.");

  for (const id of ["insert", "two_shot", "group_shot", "cutaway"]) {
    const profile = directorQualificationCapabilityProfile(detail, id);
    assert(
      profile.comparison_group === null,
      `${id} must not invent a comparison_group outside the established tracking/mounted-camera union.`,
    );
  }

  const familiesSource = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-families.ts",
  );
  for (const forbidden of [
    'comparison_group: "detail_target"',
    'comparison_group: "relationship_frame"',
    'comparison_group: "detail_context"',
  ]) {
    assert(!familiesSource.includes(forbidden), `Invalid comparison-group marker remains: ${forbidden}`);
  }

  const a11a19 = source(
    "scripts/sandbox/verify-director-special-viewpoints-object-attached-phase1b7a11a19.ts",
  );
  assert(
    a11a19.includes("deferredCapabilityIds") &&
      a11a19.includes("DIRECTOR_CAPABILITIES.length - deferredCapabilityIds.length") &&
      !a11a19.includes("DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS.length === 1") &&
      !a11a19.includes("activeCapabilityIds.length === 183"),
    "A.11A.19 verifier must be successor-safe instead of hard-coding one deferral / 183 active capabilities.",
  );

  console.log("Director A.11A.21 build hotfix H2 verification passed.");
  console.log("Detail/relationship comparison metadata stays within the typed union, and the A.11A.19 lineage verifier now derives active coverage from the live deferred set.");
}

main();
