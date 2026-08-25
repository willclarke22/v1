import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  directorQualificationInsidePairKey,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-support-containment-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

// Functional identity canary: final admission keys the exact source/receiver
// assets, not region IDs or pass labels.
const baselineKey = directorQualificationInsidePairKey(
  "takeaway_cup",
  "open_mug",
);
assert(
  baselineKey !== null,
  "A.11A.13 must produce an Inside evidence pair key for two real asset IDs.",
);
assert(
  directorQualificationInsidePairKey("takeaway_cup", "open_mug") === baselineKey,
  "A.11A.13 identical source/receiver assets must produce the same reel-admission identity.",
);
assert(
  directorQualificationInsidePairKey("apple", "open_mug") !== baselineKey &&
    directorQualificationInsidePairKey("takeaway_cup", "open_bowl") !== baselineKey,
  "A.11A.13 a genuinely different source or receiver must produce a different Inside evidence identity.",
);
assert(
  directorQualificationInsidePairKey(null, "open_mug") === null &&
    directorQualificationInsidePairKey("takeaway_cup", undefined) === null,
  "A.11A.13 malformed role bindings must fail closed rather than create a reusable Inside pair key.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
const plannerStart = room.indexOf("function buildPlannedClips");
const plannerEnd = room.indexOf("function capabilityForPlannedClip", plannerStart);
assert(
  plannerStart >= 0 && plannerEnd > plannerStart,
  "A.11A.13 could not locate the final planned-reel builder.",
);
const planner = room.slice(plannerStart, plannerEnd);

for (const marker of [
  "const usedInsidePairKeys = new Set<string>()",
  "directorQualificationInsidePairKey(",
  'capability.id === "inside"',
  "usedInsidePairKeys.has(insidePairKey)",
  "usedInsidePairKeys.add(insidePairKey)",
  "output.push({",
]) {
  assert(
    planner.includes(marker),
    `A.11A.13 final-admission marker missing from buildPlannedClips: ${marker}`,
  );
}

const duplicateGuard = planner.indexOf(
  "usedInsidePairKeys.has(insidePairKey)",
);
const admitRecord = planner.indexOf(
  "usedInsidePairKeys.add(insidePairKey)",
  duplicateGuard,
);
const outputPush = planner.indexOf("output.push({", admitRecord);
assert(
  duplicateGuard >= 0 &&
    admitRecord > duplicateGuard &&
    outputPush > admitRecord,
  "A.11A.13 must reject/record the Inside pair identity before the clip is appended to the planned reel.",
);

assert(
  room.includes(
    "open_container_evidence_found_but_no_distinct_real_source_receiver_pair_fits_pass",
  ),
  "A.11A.13 must preserve explicit coverage-gap reporting after a duplicate Inside clip is omitted.",
);

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
assert(
  readme.includes(
    "Phase 1B.7A.11A.13 — Inside final-admission evidence guard",
  ) &&
    readme.includes(
      "directorQualificationInsidePairKey(source_asset_id, receiver_asset_id)",
    ) &&
    readme.includes(
      "open_container_evidence_found_but_no_distinct_real_source_receiver_pair_fits_pass",
    ),
  "Director README is missing the A.11A.13 final-admission evidence contract.",
);

console.log(
  "Director Support & containment Phase 1B.7A.11A.13 final-admission evidence verification passed.",
);
console.log(
  "The planned reel now rejects any Inside source/receiver pair that was already admitted by an earlier pass; when no genuinely new pair exists, the later clip is omitted and the existing explicit coverage gap becomes authoritative.",
);
