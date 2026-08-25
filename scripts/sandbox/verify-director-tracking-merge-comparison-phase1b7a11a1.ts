import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
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
  const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const tracking = families.find(
    (family) => family.group === "Tracking & attached camera",
  );
  assert(tracking, "Tracking family could not be resolved.");

  const mountedProfile = directorQualificationCapabilityProfile(
    tracking,
    "camera_object_attached",
  );
  assert(
    mountedProfile.merge_compare_with_capability_id === "object_attached",
    "Mounted tracking capability must still compare against object_attached.",
  );

  const immediateProfile = directorQualificationCapabilityProfile(
    tracking,
    "object_attached",
  );
  assert(
    immediateProfile.suitable_primary_cast_slots.length === 1 &&
      immediateProfile.suitable_primary_cast_slots[0] === "vehicle" &&
      immediateProfile.requires_directional_facing,
    "Object-attached comparison reference must be vehicle-gated and directional inside Tracking.",
  );
  assert(
    immediateProfile.qualification_note?.startsWith("Immediate mounted-camera comparison reference") ?? false,
    "Tracking profile for object_attached must explain the immediate-start comparison purpose.",
  );

  const roomSource = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  assert(
    roomSource.includes("buildTrackingMountedComparisonClip") &&
      roomSource.includes('candidate.id === "object_attached"'),
    "Qualification Room must build an explicit mounted comparison clip for object_attached.",
  );
  assert(
    roomSource.includes('capability.id === "camera_object_attached"') &&
      roomSource.includes("output.push(mountedComparison)"),
    "Tracking reel must append the mounted object_attached comparison clip after camera_object_attached.",
  );
  assert(
    roomSource.includes("Mounted primitive immediate-start comparison"),
    "Qualification Room must label the mounted immediate-start comparison block distinctly.",
  );

  const readmeSource = source(
    "sandbox/probe-lab/motion-camera-library/README.md",
  );
  assert(
    readmeSource.includes("Phase 1B.7A.11A.1 — tracking merge-comparison evidence") &&
      readmeSource.includes("blend-in timing vs immediate"),
    "README must document the explicit mounted comparison evidence change.",
  );

  console.log("Director Tracking merge-comparison Phase 1B.7A.11A.1 verification passed.");
  console.log(
    "Tracking now emits same-host object_attached comparison references after camera_object_attached so merge/deprecation decisions are evidence-backed rather than inferred.",
  );
}

main();
