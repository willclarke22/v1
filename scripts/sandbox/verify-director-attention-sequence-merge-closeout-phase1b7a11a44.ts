import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_AUTHORABLE_CAPABILITIES,
  DIRECTOR_CAPABILITIES,
  DIRECTOR_LEGACY_MERGED_CAPABILITY_ALIASES,
  directorCanonicalCapabilityIdForAuthoring,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  directorQualificationExpectedActiveCapabilityCount,
  directorQualificationMergedCapabilityIdsForFamily,
  isDirectorQualificationCapabilityMerged,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

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
  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  const familiesSource = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-families.ts",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const a43 = source(
    "scripts/sandbox/verify-director-subject-emphasis-final-spotlight-proof-phase1b7a11a43.ts",
  );
  const a39 = source(
    "scripts/sandbox/verify-director-lighting-style-closeout-phase1b7a11a39.ts",
  );
  const a31 = source(
    "scripts/sandbox/verify-director-tracking-mounted-merge-closeout-phase1b7a11a31.ts",
  );
  const a24 = source(
    "scripts/sandbox/verify-director-lens-perspective-qualification-phase1b7a11a24.ts",
  );
  const a23 = source(
    "scripts/sandbox/verify-director-detail-relationship-closeout-phase1b7a11a23.ts",
  );
  const a20 = source(
    "scripts/sandbox/verify-director-composition-thirds-negative-space-phase1b7a11a20.ts",
  );

  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.44 must preserve the frozen 184-capability compatibility vocabulary.",
  );

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenAttention = frozenFamilies.find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Attention sequence",
  );
  const activeAttention = activeFamilies.find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Attention sequence",
  );
  assert(frozenAttention && activeAttention, "Attention sequence family is missing.");

  assert(
    frozenAttention.capability_ids.join("|") ===
      "establish|isolate|compare|reveal|orient|introduce",
    `Frozen Attention-sequence compatibility membership changed unexpectedly: ${frozenAttention.capability_ids.join("|")}.`,
  );
  assert(
    activeAttention.capability_ids.join("|") ===
      "establish|isolate|compare|reveal|introduce",
    `Active Attention sequence must remove only merged Orient: ${activeAttention.capability_ids.join("|")}.`,
  );

  const orientAlias = DIRECTOR_LEGACY_MERGED_CAPABILITY_ALIASES.orient;
  assert(
    orientAlias.canonical_capability_id === "establish" &&
      orientAlias.semantic_job === "orient" &&
      directorCanonicalCapabilityIdForAuthoring("orient") === "establish" &&
      directorCanonicalCapabilityIdForAuthoring("establish") === "establish",
    "Orient must remain readable as semantic compatibility vocabulary while canonical capability authoring resolves to Establish.",
  );
  assert(
    !DIRECTOR_AUTHORABLE_CAPABILITIES.some((item) => item.id === "orient") &&
      DIRECTOR_AUTHORABLE_CAPABILITIES.some((item) => item.id === "establish") &&
      DIRECTOR_AUTHORABLE_CAPABILITIES.length ===
        DIRECTOR_CAPABILITIES.length -
          Object.keys(DIRECTOR_LEGACY_MERGED_CAPABILITY_ALIASES).length,
    "Canonical authoring must exclude every completed merged alias without hard-coding the number of future merges.",
  );

  const merged = [...DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_IDS] as readonly string[];
  assert(
    merged.includes("orient") &&
      merged.includes("camera_object_attached") &&
      isDirectorQualificationCapabilityMerged("orient") &&
      directorQualificationMergedCapabilityIdsForFamily(
        "narrative_attention:Attention sequence",
      ).includes("orient"),
    "Orient must be recorded as a completed Attention-sequence merge while preserving earlier mounted-camera lineage.",
  );

  const orientProfile = directorQualificationCapabilityProfile(
    frozenAttention,
    "orient",
  );
  assert(
    orientProfile.merge_compare_with_capability_id === "establish" &&
      orientProfile.qualification_note?.includes("closes Orient into Establish") === true,
    "Frozen Orient profile must retain explicit Establish merge lineage.",
  );

  const introduce = capability("introduce");
  assert(
    introduce.compiler.threejs === "compound" &&
      introduce.compiler.fallback_capability_id === "establish",
    "Introduce must be classified honestly as a compound narrative motif with Establish as its safe fallback.",
  );
  const introduceMoment = directorCapabilityDemoMoment(introduce);
  assert(
    introduceMoment.shot?.narrative_job === "introduce" &&
      introduceMoment.shot.camera.movement_steps.some(
        (step) => step.movement === "reframe",
      ) &&
      introduceMoment.shot.camera.movement_steps.some(
        (step) => step.movement === "settle",
      ) &&
      introduceMoment.shot.lighting.intents.includes("light_reveal") &&
      introduceMoment.events.some(
        (event) =>
          event.behaviour === "move_to" &&
          event.actor_entity_id === "primary_subject",
      ),
    "Introduce compound proof must preserve actor entrance + attention reframe + reveal + settle behavior.",
  );

  const establishMoment = directorCapabilityDemoMoment(capability("establish"));
  assert(
    establishMoment.shot?.composition.framing === "wide" &&
      establishMoment.shot.composition.keep_visible_entity_ids.join("|") ===
        "primary_subject|secondary_subject|context_subject" &&
      establishMoment.shot.camera.movement_steps.some(
        (step) => step.movement === "push_in",
      ) &&
      establishMoment.shot.camera.movement_steps.some(
        (step) => step.movement === "settle",
      ),
    "Accepted Establish visual behavior must remain intact.",
  );

  const compareProfile = directorQualificationCapabilityProfile(
    frozenAttention,
    "compare",
  );
  assert(
    compareProfile.qualification_note?.includes(
      "Qualification is proof instrumentation only",
    ) === true,
    "Compare must document that its dashed Qualification guide is proof instrumentation, not production semantics.",
  );

  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);
  assert(
    activeIds.length ===
      directorQualificationExpectedActiveCapabilityCount(DIRECTOR_CAPABILITIES) &&
      new Set(activeIds).size === activeIds.length,
    "A.11A.44 active coverage must remain owned by the centralized live Qualification policy.",
  );

  for (const marker of [
    'orient: {',
    'canonical_capability_id: "establish"',
    'semantic_job: "orient"',
    'threejs: "compound"',
    'fallback: "establish"',
  ]) {
    assert(registry.includes(marker), `A.11A.44 registry marker missing: ${marker}`);
  }
  for (const marker of [
    '"orient",',
    'orient: "narrative_attention:Attention sequence"',
    'merge_compare_with_capability_id: "establish"',
    "A.11A.44 closes Orient into Establish",
  ]) {
    assert(
      familiesSource.includes(marker),
      `A.11A.44 Qualification-family marker missing: ${marker}`,
    );
  }
  for (const marker of [
    "A.11A.44 closes the reviewed Attention sequence",
    "Orient is a completed",
    "merge into Establish",
    "Introduce remains active but is classified honestly as a compound",
    "Compare&apos;s dashed",
    "Qualification-only proof instrumentation",
    "10 clips",
  ]) {
    assert(room.includes(marker), `A.11A.44 Qualification Room marker missing: ${marker}`);
  }

  // The support-class shift (Introduce direct -> compound) is legitimate.
  // Older support verifiers must account for known classes dynamically rather
  // than pinning an A.11A.24-era distribution.
  for (const [label, verifier] of [
    ["A.11A.24", a24],
    ["A.11A.23", a23],
    ["A.11A.20", a20],
  ] as const) {
    assert(
      verifier.includes(
        "support-class accounting must remain internally complete",
      ) &&
        verifier.includes(
          'const supportKinds = ["direct", "compound", "approximate", "declared"] as const;',
        ) &&
        !verifier.includes("supportCounts.compound === 65") &&
        !verifier.includes("supportCounts.direct === 101"),
      `${label} historical verifier must remain successor-safe for the truthful Introduce support reclassification.`,
    );
  }

  // A.11A.31 owns the mounted-camera merge only. It must not veto later
  // completed merges by freezing authorable or merged-set cardinality.
  assert(
    a31.includes("Object.keys(") &&
      a31.includes("DIRECTOR_LEGACY_MERGED_CAPABILITY_ALIASES") &&
      !a31.includes("DIRECTOR_AUTHORABLE_CAPABILITIES.length === 183") &&
      !a31.includes("merged.length === 1") &&
      a31.includes("merged.includes(legacyId)") &&
      a31.includes("centralized live Qualification-active policy"),
    "A.11A.31 must be successor-safe for later completed merge aliases.",
  );
  assert(
    a39.includes('!a31.includes("merged.length === 1")') &&
      a39.includes('a31.includes("merged.includes(legacyId)")') &&
      a39.includes("centralized live policy"),
    "A.11A.39 must preserve mounted-camera lineage without freezing the global completed-merge cardinality.",
  );
  assert(
    a43.includes(
      "Director Subject emphasis Phase 1B.7A.11A.43 final spotlight-proof verification passed.",
    ),
    "A.11A.43 frozen predecessor lineage is missing.",
  );

  console.log(
    "Director Attention sequence Phase 1B.7A.11A.44 merge closeout verification passed.",
  );
  console.log(
    `Frozen/authorable/active=${DIRECTOR_CAPABILITIES.length}/${DIRECTOR_AUTHORABLE_CAPABILITIES.length}/${activeIds.length}; Orient -> Establish completed merge, Introduce remains active/compound, and the active Attention reel is ${activeAttention.capability_ids.length} capabilities.`,
  );
}

main();
