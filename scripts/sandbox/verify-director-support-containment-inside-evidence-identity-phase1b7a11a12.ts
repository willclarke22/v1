import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  directorQualificationInsidePairIndex,
  directorQualificationSelectDistinctInsidePairs,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-support-containment-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const rankedCandidates = [
  {
    source_asset: { asset_id: "takeaway_cup" },
    target: { asset: { asset_id: "open_mug" } },
    region_id: "best_open_cavity_region",
    score: 100,
  },
  {
    source_asset: { asset_id: "takeaway_cup" },
    target: { asset: { asset_id: "open_mug" } },
    region_id: "second_region_same_real_pair",
    score: 99,
  },
  {
    source_asset: { asset_id: "takeaway_cup" },
    target: { asset: { asset_id: "open_bowl" } },
    region_id: "second_receiver",
    score: 90,
  },
  {
    source_asset: { asset_id: "apple" },
    target: { asset: { asset_id: "open_mug" } },
    region_id: "second_source",
    score: 80,
  },
] as const;

const distinctPairs =
  directorQualificationSelectDistinctInsidePairs(rankedCandidates);

assert(
  distinctPairs.length === 3,
  `A.11A.12 must collapse duplicate Inside source/receiver identities; got ${distinctPairs.length} candidates.`,
);
assert(
  distinctPairs[0]?.region_id === "best_open_cavity_region",
  "A.11A.12 must retain the strongest already-ranked region for a repeated source/receiver identity.",
);
assert(
  distinctPairs[1]?.target.asset.asset_id === "open_bowl" &&
    distinctPairs[2]?.source_asset.asset_id === "apple",
  "A.11A.12 must preserve later genuinely distinct source/receiver identities after de-duplication.",
);

const oneRealPair = directorQualificationSelectDistinctInsidePairs(
  rankedCandidates.slice(0, 2),
);
assert(
  oneRealPair.length === 1 &&
    directorQualificationInsidePairIndex({
      pass_kind: "baseline",
      pair_count: oneRealPair.length,
    }) === 0 &&
    directorQualificationInsidePairIndex({
      pass_kind: "diversity",
      pair_count: oneRealPair.length,
    }) === null,
  "A.11A.12 must omit Inside Diversity when multiple physical regions still describe only one real asset pair.",
);

assert(
  directorQualificationInsidePairIndex({
    pass_kind: "diversity",
    pair_count: distinctPairs.length,
  }) === 1,
  "A.11A.12 must allow Diversity only when a second unique source/receiver pair exists.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
const insideCandidatesStart = room.indexOf(
  "function directorInsidePhysicalPairCandidates",
);
const insideChooserStart = room.indexOf(
  "function chooseDirectorInsidePhysicalPair",
);
assert(
  insideCandidatesStart >= 0 &&
    insideChooserStart > insideCandidatesStart,
  "A.11A.12 could not locate the Inside physical candidate/chooser boundary.",
);
const insideCandidateSection = room.slice(
  insideCandidatesStart,
  insideChooserStart,
);
assert(
  insideCandidateSection.includes(
    "directorQualificationSelectDistinctInsidePairs(ranked)",
  ),
  "A.11A.12 Qualification Room must de-duplicate Inside candidates by real source/receiver identity before pass indexing.",
);
assert(
  room.includes(
    "open_container_evidence_found_but_no_distinct_real_source_receiver_pair_fits_pass",
  ),
  "A.11A.12 must preserve explicit coverage-gap reporting when no distinct Inside pair exists for a later pass.",
);

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
assert(
  readme.includes(
    "Phase 1B.7A.11A.12 — Inside evidence identity hardening",
  ) &&
    readme.includes("source_asset_id + receiver_asset_id") &&
    readme.includes(
      "open_container_evidence_found_but_no_distinct_real_source_receiver_pair_fits_pass",
    ),
  "Director README is missing the A.11A.12 Inside evidence-identity contract.",
);

console.log(
  "Director Support & containment Phase 1B.7A.11A.12 Inside evidence identity verification passed.",
);
console.log(
  "Inside candidate regions now collapse by source_asset_id + receiver_asset_id before pass indexing; alternate regions on one real pair cannot satisfy Diversity, and a missing second pair becomes an explicit coverage gap.",
);
