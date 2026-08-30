import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const authoritative = [
    "scripts/sandbox/verify-director-composition-thirds-negative-space-phase1b7a11a20.ts",
    "scripts/sandbox/verify-director-detail-relationship-closeout-phase1b7a11a23.ts",
    "scripts/sandbox/verify-director-lens-perspective-qualification-phase1b7a11a24.ts",
    "scripts/sandbox/verify-director-shot-scale-semantic-framing-phase1b7a11a25.ts",
    "scripts/sandbox/verify-director-complex-camera-paths-phase1b7a11a26.ts",
    "scripts/sandbox/verify-director-qualification-preload-backpressure-phase1b7a11a27.ts",
    "scripts/sandbox/verify-director-linear-camera-travel-phase1b7a11a28.ts",
  ] as const;

  for (const path of authoritative) {
    const text = source(path);
    assert(
      !text.includes('source("sandbox/probe-lab/motion-camera-library/README.md")'),
      `Authoritative regression verifier must not gate installation on historical README prose: ${path}`,
    );
  }

  const a20 = source(authoritative[0]);
  assert(
    a20.includes("DIRECTOR_CAPABILITIES.length - deferred.length") &&
      !a20.includes("activeIds.length === 183"),
    "A.11A.20 must derive active coverage from the live deferred set.",
  );

  const a23 = source(authoritative[1]);
  for (const marker of [
    "DIRECTOR_CAPABILITIES.length - deferred.length",
    "expectedActiveDetailIds",
    "DIRECTOR_DETAIL_RELATIONSHIP_CLEANUP_FIXTURE_POLICY_VERSION",
    "DIRECTOR_DETAIL_RELATIONSHIP_GROUP_PROJECTION_FIXTURE_POLICY_VERSION",
    "DIRECTOR_DETAIL_RELATIONSHIP_GROUP_VIEW_RIGHT_BASIS",
    'merge_compare_with_capability_id === "show_inside_outside"',
    'JSON.stringify(["character"])',
  ]) {
    assert(a23.includes(marker), `A.11A.23 lost a durable A.11A.21/A.11A.22 successor invariant: ${marker}`);
  }
  for (const forbidden of [
    "activeIds.length === 180",
    "Group-shot Qualification must form a compact triangular cluster",
    "Cutaway is also deferred as an atomic camera framing",
    "This reel qualifies Insert, Two shot, Group shot, Over shoulder, and",
  ]) {
    assert(!a23.includes(forbidden), `A.11A.23 reintroduced a superseded historical gate: ${forbidden}`);
  }

  const a24 = source(authoritative[2]);
  assert(
    a24.includes("DIRECTOR_CAPABILITIES.length - deferred.length") &&
      a24.includes("chooseLensPerspectivePrimaryAsset") &&
      a24.includes("chooseLensPerspectiveSupportingAsset"),
    "A.11A.24 must preserve live-coverage and structural lens-fixture checks.",
  );

  const a25 = source(authoritative[3]);
  assert(
    a25.includes("DIRECTOR_CAPABILITIES.length - deferred.length") &&
      a25.includes("A.11A.25 lineage requires"),
    "A.11A.25 must remain successor-safe for live deferred coverage.",
  );

  const a26 = source(authoritative[4]);
  assert(
    a26.includes("DIRECTOR_CAPABILITIES.length - deferred.length") &&
      a26.includes("expectedActiveComplexIds") &&
      !a26.includes("activeIds.length === 175"),
    "A.11A.26 must derive active Complex-path coverage from the live deferred set.",
  );

  const a27 = source(authoritative[5]);
  assert(
    a27.includes("DIRECTOR_CAPABILITIES.length - deferred.length") &&
      a27.includes("QUALIFICATION_SINGLE_FLIGHT_PRELOAD_TIMEOUT_MS = 25_000") &&
      !a27.includes("activeIds.length === 175"),
    "A.11A.27 must preserve live coverage plus single-flight preparation semantics.",
  );

  const a28 = source(authoritative[6]);
  assert(
    a28.includes("DIRECTOR_CAPABILITIES.length - deferred.length") &&
      a28.includes("DIRECTOR_DOLLY_DEMO_CAMERA_RELATIVE_DIRECTION") &&
      a28.includes("dolly_translates_whole_rig"),
    "A.11A.28 must preserve live coverage plus the qualified Dolly disambiguation contract.",
  );


  const a11a27 = source(
    "scripts/sandbox/verify-director-qualification-preload-backpressure-phase1b7a11a27.ts",
  );
  assert(
    a11a27.includes(
      "const deferred = [...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS] as readonly string[];",
    ),
    "A.11A.27 must widen the frozen deferred tuple before string-based successor checks so TypeScript does not reject legitimate non-deferred capability ids.",
  );

  console.log("Director Qualification authoritative regression-chain verification passed.");
  console.log("A.11A.21/A.11A.22 are superseded Detail/relationship stages; A.11A.23 carries their durable invariants. Authoritative A.11A.20/A.11A.23-A.11A.28 verifiers do not use README prose as install gates.");
}

main();
