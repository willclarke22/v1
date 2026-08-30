import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  projectDirectorActorEnvelope,
  sampleDirectorCameraPose,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function main() {
  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenIds = frozenFamilies.flatMap((family) => family.capability_ids);
  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);
  const deferred: string[] = [...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS].sort();
  const requiredDeferred = [
    "cutaway",
    "extreme_close",
    "focus_deep",
    "focus_shallow",
    "inside_object",
    "lens_macro",
    "macro",
    "point_of_view",
  ];

  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      frozenFamilies.length === 33 &&
      frozenIds.length === 184 &&
      new Set(frozenIds).size === 184,
    "A.11A.25 must preserve the frozen 184-capability / 33-family Director taxonomy.",
  );
  assert(
    activeFamilies.length === 33 &&
      activeIds.length === DIRECTOR_CAPABILITIES.length - deferred.length &&
      new Set(activeIds).size === activeIds.length,
    `A.11A.25 successor coverage must derive from the live deferred set. Got ${activeIds.length} active / ${deferred.length} deferred.`,
  );
  for (const id of requiredDeferred) {
    assert(
      deferred.includes(id),
      `A.11A.25 lineage requires ${id} to remain deferred under successor phases.`,
    );
  }
  for (const id of deferred) {
    assert(!activeIds.includes(id), `Deferred capability leaked into active Qualification: ${id}.`);
    assert(frozenIds.includes(id), `Deferred capability disappeared from frozen taxonomy: ${id}.`);
  }

  const shotScale = activeFamilies.find(
    (family) =>
      family.category === "camera_framing" &&
      family.group === "Shot scale",
  );
  assert(shotScale, "Active Shot scale family is missing.");
  assert(
    JSON.stringify(shotScale.capability_ids) ===
      JSON.stringify([
        "extreme_wide",
        "wide",
        "full",
        "medium_wide",
        "medium",
        "medium_close",
        "close",
      ]),
    `Active Shot scale order mismatch: ${JSON.stringify(shotScale.capability_ids)}.`,
  );
  assert(
    frozenIds.includes("extreme_close") && !activeIds.includes("extreme_close"),
    "Extreme close must remain frozen while leaving active Qualification.",
  );
  const extremeCloseProfile = directorQualificationCapabilityProfile(
    buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES).find(
      (family) =>
        family.category === "camera_framing" &&
        family.group === "Shot scale",
    )!,
    "extreme_close",
  );
  assert(
    extremeCloseProfile.qualification_note?.includes("semantic region / feature anchor"),
    "Extreme-close qualification must document the missing semantic-region prerequisite.",
  );

  const tallActor: DirectorRuntimeActor = {
    id: "primary_subject",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    size: [0.65, 1.8, 0.45],
    directability: null,
  };
  const ladderIds = ["full", "medium_wide", "medium", "medium_close", "close"];
  const poses = ladderIds.map((id) =>
    sampleDirectorCameraPose(
      directorCapabilityDemoMoment(capability(id)),
      0.5,
      [tallActor],
    ),
  );
  const distances = poses.map((pose) => pose.position.distanceTo(pose.target));
  const targetYs = poses.map((pose) => pose.target.y);
  const envelopes = ladderIds.map((id) =>
    projectDirectorActorEnvelope(
      directorCapabilityDemoMoment(capability(id)),
      [tallActor],
      "primary_subject",
      0.5,
    ),
  );
  assert(envelopes.every(Boolean), "Shot-scale tall-subject projected envelopes are missing.");

  assert(
    Math.abs(targetYs[0]! - 0.81) < 0.03,
    `Full framing target unexpectedly changed: ${targetYs[0]!.toFixed(3)}.`,
  );
  assert(
    targetYs[1]! < targetYs[2]! &&
      targetYs[2]! < targetYs[3]! &&
      targetYs[3]! < targetYs[4]!,
    `Medium-wide → Close target height must rise monotonically: ${targetYs.map((value) => value.toFixed(3)).join(" / ")}.`,
  );
  assert(
    distances[0]! > distances[1]! &&
      distances[1]! > distances[2]! &&
      distances[2]! > distances[3]! &&
      distances[3]! > distances[4]!,
    `Full → Close camera distance must tighten monotonically: ${distances.map((value) => value.toFixed(3)).join(" / ")}.`,
  );
  const heights = envelopes.map((entry) => entry!.height_ndc);
  assert(
    heights[0]! < heights[1]! &&
      heights[1]! < heights[2]! &&
      heights[2]! < heights[3]! &&
      heights[3]! < heights[4]!,
    `Full → Close projected subject occupancy must grow monotonically: ${heights.map((value) => value.toFixed(3)).join(" / ")}.`,
  );
  assert(
    envelopes[3]!.max_ndc_y >= 0.65 &&
      envelopes[3]!.max_ndc_y <= 0.96 &&
      envelopes[4]!.max_ndc_y >= 0.65 &&
      envelopes[4]!.max_ndc_y <= 0.96 &&
      envelopes[3]!.min_ndc_y < -1 &&
      envelopes[4]!.min_ndc_y < envelopes[3]!.min_ndc_y - 0.3,
    `Medium-close/Close should preserve a visible upper subject while cropping progressively farther below frame. MC=${JSON.stringify(envelopes[3])}; Close=${JSON.stringify(envelopes[4])}.`,
  );

  const nonTallActor: DirectorRuntimeActor = {
    id: "primary_subject",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    size: [1.6, 0.7, 1.1],
    directability: null,
  };
  const nonTallMedium = sampleDirectorCameraPose(
    directorCapabilityDemoMoment(capability("medium")),
    0.5,
    [nonTallActor],
  );
  assert(
    Math.abs(nonTallMedium.target.y - 0.315) < 0.03,
    `Non-tall Medium target must retain the established 45% geometric-centre bias; got ${nonTallMedium.target.y.toFixed(3)}.`,
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "isTallUprightShotScaleSubject",
    "shotScaleUpperSubjectTargetHeightRatio",
    'case "medium_wide": return 0.54',
    'case "medium": return 0.62',
    'case "medium_close": return 0.69',
    'case "close": return 0.75',
    'case "medium_wide": return 3.65',
    'case "medium": return 2.9',
    'case "medium_close": return 2.25',
    'case "close": return 1.75',
  ]) {
    assert(runtime.includes(marker), `A.11A.25 runtime marker missing: ${marker}`);
  }
  for (const marker of [
    'case "extreme_wide": return 7.5',
    'case "wide": return 5.8',
    'case "full": return 4.5',
  ]) {
    assert(runtime.includes(marker), `Previously qualified wide/full framing changed unexpectedly: ${marker}`);
  }


  const a24 = source(
    "scripts/sandbox/verify-director-lens-perspective-qualification-phase1b7a11a24.ts",
  );
  assert(
    a24.includes("DIRECTOR_CAPABILITIES.length - deferred.length") &&
      a24.includes("A.11A.24 lineage requires") &&
      !a24.includes("activeIds.length === 177"),
    "A.11A.24 verifier must be successor-safe under the Shot-scale deferral.",
  );


  console.log("Director Shot-scale semantic framing Phase 1B.7A.11A.25 verification passed.");
  console.log(
    `Frozen/active taxonomy: 184/${activeIds.length}. Tall-subject target Y: ${targetYs.map((value) => value.toFixed(3)).join(" / ")}. Distance: ${distances.map((value) => value.toFixed(3)).join(" / ")}.`,
  );
}

main();
