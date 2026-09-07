import {
  DIRECTOR_CAPABILITIES,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_COMPONENTS_BY_ID,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  isDirectorQualificationCapabilityObjectMotionCompound,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function capability(id: string): DirectorCapability {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function main() {
  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.56 must preserve the frozen 184-capability Director vocabulary.",
  );

  const frozenFamily = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES).find(
    (family) => family.key === "object_motion:Basic actor motion",
  );
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamily = activeFamilies.find(
    (family) => family.key === "object_motion:Basic actor motion",
  );

  assert(frozenFamily, "A.11A.56 must preserve the frozen Basic actor motion family.");
  assert(activeFamily, "A.11A.56 must keep Basic actor motion active for its seven qualified primitives.");
  const frozenExpected = [
    "translate",
    "rotate",
    "pivot",
    "oscillate",
    "follow_path",
    "enter_frame",
    "exit_frame",
    "move_toward",
    "move_away",
    "follow_target",
    "align",
    "aim_at",
  ];
  const activeExpected = [
    "translate",
    "rotate",
    "follow_path",
    "enter_frame",
    "exit_frame",
    "move_toward",
    "move_away",
  ];

  assert(
    frozenFamily.capability_ids.join("|") === frozenExpected.join("|"),
    `A.11A.56 frozen Basic actor motion vocabulary drifted: ${frozenFamily.capability_ids.join("|")}`,
  );
  assert(
    activeFamily.capability_ids.join("|") === activeExpected.join("|"),
    `A.11A.56 Basic actor motion must expose exactly seven independent primitives after Follow target closeout: ${activeFamily.capability_ids.join("|")}`,
  );

  assert(
    isDirectorQualificationCapabilityObjectMotionCompound("follow_target"),
    "A.11A.56 Follow target must be excluded from independent Qualification as a compound relational behavior.",
  );
  assert(
    (
      DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_CAPABILITY_IDS as readonly string[]
    ).includes("follow_target"),
    "A.11A.56 object-motion compound classification is missing Follow target.",
  );
  assert(
    DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_COMPONENTS_BY_ID.follow_target.join(
      "|",
    ) === "translate",
    "A.11A.56 Follow target must preserve Translate as its reusable atomic motion component.",
  );

  const follow = capability("follow_target");
  assert(
    follow.compiler.threejs === "compound",
    `A.11A.56 must preserve Follow target's existing compound Director support classification; found ${follow.compiler.threejs}.`,
  );

  const followProfile = directorQualificationCapabilityProfile(
    frozenFamily,
    "follow_target",
  );
  assert(
    followProfile.merge_compare_with_capability_id === "translate",
    "A.11A.56 Follow target profile must point back to Translate as the closest atomic comparison primitive.",
  );
  assert(
    followProfile.qualification_note?.includes(
      "coordinated target-relative translation",
    ) &&
      followProfile.qualification_note.includes("compound relational behavior") &&
      followProfile.qualification_note.includes("proof-only cues"),
    "A.11A.56 Follow target profile must record the cold-read reason for compound closeout without inventing UI proof semantics.",
  );

  for (const id of activeExpected) {
    assert(
      !isDirectorQualificationCapabilityObjectMotionCompound(id),
      `A.11A.56 qualified primitive ${id} must not be accidentally reclassified as an object-motion compound.`,
    );
  }

  console.log(
    "A.11A.56 successor-safe Basic actor motion final semantic closeout verified: 184 vocabulary entries preserved; seven independent primitives remain; Follow target is preserved as a compound relational Director verb over reusable translation/target-relative constraint semantics; unrelated later family closeouts may reduce the global active-family count.",
  );
}

main();
