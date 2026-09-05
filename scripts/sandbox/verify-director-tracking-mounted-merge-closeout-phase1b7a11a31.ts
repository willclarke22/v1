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
  DIRECTOR_QUALIFICATION_CAMPAIGN_NORMALIZATION_VERSION,
  emptyDirectorQualificationCampaignState,
  normalizeDirectorQualificationCampaignState,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-campaign";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
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
  const legacyId = "camera_object_attached";
  const canonicalId = "object_attached";

  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.31 must preserve the frozen 184-capability compatibility vocabulary.",
  );
  const mergedAliasIds = Object.keys(
    DIRECTOR_LEGACY_MERGED_CAPABILITY_ALIASES,
  );
  assert(
    DIRECTOR_AUTHORABLE_CAPABILITIES.length + mergedAliasIds.length ===
      DIRECTOR_CAPABILITIES.length &&
      !DIRECTOR_AUTHORABLE_CAPABILITIES.some((item) => item.id === legacyId) &&
      DIRECTOR_AUTHORABLE_CAPABILITIES.some((item) => item.id === canonicalId),
    "Canonical authoring must exclude completed merge aliases while retaining canonical object_attached.",
  );

  const alias = DIRECTOR_LEGACY_MERGED_CAPABILITY_ALIASES.camera_object_attached;
  assert(
    alias.canonical_capability_id === canonicalId &&
      alias.transition_mode === "blend_in" &&
      directorCanonicalCapabilityIdForAuthoring(legacyId) === canonicalId &&
      directorCanonicalCapabilityIdForAuthoring(canonicalId) === canonicalId,
    "Legacy mounted-camera authoring must resolve to canonical object_attached with blend-in entry timing.",
  );

  const legacy = capability(legacyId);
  const canonical = capability(canonicalId);
  assert(
    legacy.category === "camera_movement" && canonical.category === "camera_angle",
    "Frozen compatibility must retain the historical category spelling while canonical authoring points to object_attached.",
  );

  const legacyMoment = directorCapabilityDemoMoment(legacy);
  const legacyStep = legacyMoment.shot?.camera.movement_steps[0];
  assert(
    legacyStep?.movement === "object_attached" &&
      legacyStep.parameters.view_direction instanceof Array &&
      legacyStep.parameters.look_distance_m === 5.0,
    "Legacy camera_object_attached must compile through the canonical object_attached mounted movement step.",
  );

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenTracking = frozenFamilies.find(
    (family) =>
      family.category === "camera_movement" &&
      family.group === "Tracking & attached camera",
  );
  const activeTracking = activeFamilies.find(
    (family) =>
      family.category === "camera_movement" &&
      family.group === "Tracking & attached camera",
  );
  assert(frozenTracking && activeTracking, "Tracking & attached camera family is missing.");
  assert(
    frozenTracking.capability_ids.join("|") ===
      "follow|lead_subject|lag_follow|track_parallel|camera_object_attached",
    `Frozen Tracking membership changed unexpectedly: ${frozenTracking.capability_ids.join("|")}.`,
  );
  assert(
    activeTracking.capability_ids.join("|") ===
      "follow|lead_subject|lag_follow|track_parallel",
    `Active Tracking must exclude the merged legacy mounted id: ${activeTracking.capability_ids.join("|")}.`,
  );

  const trackingMergedIds =
    directorQualificationMergedCapabilityIdsForFamily(activeTracking.key);
  assert(
    trackingMergedIds.length === 1 && trackingMergedIds[0] === legacyId,
    `Tracking merge lineage must retain ${legacyId} after active-family removal: ${JSON.stringify(trackingMergedIds)}.`,
  );

  const membershipReEvidenceReason =
    "Active qualification capability membership changed; render fresh deterministic evidence for the current family.";

  // Migration case 1: pre-A.11A.31 persisted evidence still carries the old
  // five-member Tracking family. Removing only the completed merged alias must
  // preserve the PASS evidence rather than demanding a circular rerender.
  const oldTrackingCampaign = emptyDirectorQualificationCampaignState(
    frozenFamilies,
    "2026-08-29T23:20:00.000Z",
  );
  const oldTrackingRecord = oldTrackingCampaign.families[frozenTracking.key]!;
  oldTrackingCampaign.families[frozenTracking.key] = {
    ...oldTrackingRecord,
    capability_ids: [...frozenTracking.capability_ids],
    status: "awaiting_perceptual_review",
    latest_evidence_reel_id: "QR-MERGE-PROOF",
    latest_evidence_integrity: "pass",
    latest_evidence_coverage_mode: "cross_asset",
    latest_evidence_at: "2026-08-29T23:21:00.000Z",
    frozen_capability_ids: [
      "follow",
      "lead_subject",
      "lag_follow",
      "track_parallel",
    ],
  };
  delete (oldTrackingCampaign as Partial<typeof oldTrackingCampaign>)
    .normalization_version;

  const migratedOldTracking = normalizeDirectorQualificationCampaignState(
    oldTrackingCampaign,
    activeFamilies,
    "2026-08-29T23:22:00.000Z",
  );
  const migratedOldTrackingRecord =
    migratedOldTracking.families[activeTracking.key]!;
  assert(
    migratedOldTracking.normalization_version ===
      DIRECTOR_QUALIFICATION_CAMPAIGN_NORMALIZATION_VERSION &&
      migratedOldTrackingRecord.status === "awaiting_perceptual_review" &&
      migratedOldTrackingRecord.latest_evidence_reel_id === "QR-MERGE-PROOF" &&
      migratedOldTrackingRecord.latest_evidence_integrity === "pass" &&
      migratedOldTrackingRecord.re_evidence_reason === "" &&
      migratedOldTrackingRecord.capability_ids.join("|") ===
        "follow|lead_subject|lag_follow|track_parallel" &&
      migratedOldTrackingRecord.frozen_capability_ids.join("|") ===
        "follow|lead_subject|lag_follow|track_parallel",
    `Completed merge migration must preserve PASS evidence/frozen siblings and adopt active membership: ${JSON.stringify(migratedOldTrackingRecord)}.`,
  );

  // Migration case 2: A.11A.31 v1 may already have written the generic
  // membership-change Needs re-evidence state after dropping the legacy id.
  // Recover that exact pre-merge-aware auto-state once.
  const poisonedTrackingCampaign = emptyDirectorQualificationCampaignState(
    activeFamilies,
    "2026-08-29T23:23:00.000Z",
  );
  const poisonedTrackingRecord =
    poisonedTrackingCampaign.families[activeTracking.key]!;
  poisonedTrackingCampaign.families[activeTracking.key] = {
    ...poisonedTrackingRecord,
    status: "needs_re_evidence",
    latest_evidence_reel_id: "QR-MERGE-PROOF",
    latest_evidence_integrity: "pass",
    latest_evidence_coverage_mode: "cross_asset",
    latest_evidence_at: "2026-08-29T23:21:00.000Z",
    frozen_capability_ids: [
      "follow",
      "lead_subject",
      "lag_follow",
      "track_parallel",
    ],
    re_evidence_reason: membershipReEvidenceReason,
  };
  delete (poisonedTrackingCampaign as Partial<typeof poisonedTrackingCampaign>)
    .normalization_version;

  const recoveredTracking = normalizeDirectorQualificationCampaignState(
    poisonedTrackingCampaign,
    activeFamilies,
    "2026-08-29T23:24:00.000Z",
  );
  const recoveredTrackingRecord = recoveredTracking.families[activeTracking.key]!;
  assert(
    recoveredTrackingRecord.status === "awaiting_perceptual_review" &&
      recoveredTrackingRecord.latest_evidence_integrity === "pass" &&
      recoveredTrackingRecord.re_evidence_reason === "",
    `Pre-merge-aware Tracking Needs re-evidence poison must be cleared without losing PASS evidence: ${JSON.stringify(recoveredTrackingRecord)}.`,
  );

  // Ordinary deferral/removal remains fail-closed. Special viewpoints lost
  // inside_object for truthful-evidence reasons, so old three-capability PASS
  // evidence must still require a new reel.
  const frozenSpecial = frozenFamilies.find(
    (family) =>
      family.category === "camera_angle" && family.group === "Special viewpoints",
  );
  const activeSpecial = activeFamilies.find(
    (family) =>
      family.category === "camera_angle" && family.group === "Special viewpoints",
  );
  assert(frozenSpecial && activeSpecial, "Special viewpoints family is missing.");
  const staleSpecialCampaign = emptyDirectorQualificationCampaignState(
    frozenFamilies,
    "2026-08-29T23:25:00.000Z",
  );
  const staleSpecialRecord =
    staleSpecialCampaign.families[frozenSpecial.key]!;
  staleSpecialCampaign.families[frozenSpecial.key] = {
    ...staleSpecialRecord,
    capability_ids: [...frozenSpecial.capability_ids],
    status: "awaiting_perceptual_review",
    latest_evidence_reel_id: "QR-STALE-SPECIAL",
    latest_evidence_integrity: "pass",
    latest_evidence_coverage_mode: "cross_asset",
    latest_evidence_at: "2026-08-29T23:26:00.000Z",
    frozen_capability_ids: ["isometric"],
  };
  delete (staleSpecialCampaign as Partial<typeof staleSpecialCampaign>)
    .normalization_version;

  const normalizedSpecial = normalizeDirectorQualificationCampaignState(
    staleSpecialCampaign,
    activeFamilies,
    "2026-08-29T23:27:00.000Z",
  );
  const normalizedSpecialRecord = normalizedSpecial.families[activeSpecial.key]!;
  assert(
    normalizedSpecialRecord.status === "needs_re_evidence" &&
      normalizedSpecialRecord.re_evidence_reason === membershipReEvidenceReason &&
      normalizedSpecialRecord.frozen_capability_ids.join("|") === "isometric",
    `Non-merge membership changes must remain evidence-invalidating: ${JSON.stringify(normalizedSpecialRecord)}.`,
  );

  // Once the new normalization epoch has been persisted, do not repeatedly
  // auto-clear future Needs re-evidence states merely because this family has
  // historical merge lineage.
  const currentEpochNeedsEvidence = {
    ...recoveredTracking,
    families: {
      ...recoveredTracking.families,
      [activeTracking.key]: {
        ...recoveredTrackingRecord,
        status: "needs_re_evidence" as const,
        re_evidence_reason: membershipReEvidenceReason,
      },
    },
  };
  const currentEpochNormalized = normalizeDirectorQualificationCampaignState(
    currentEpochNeedsEvidence,
    activeFamilies,
    "2026-08-29T23:28:00.000Z",
  );
  assert(
    currentEpochNormalized.families[activeTracking.key]?.status ===
      "needs_re_evidence",
    "Merge recovery must be a one-time legacy-state migration, not a permanent bypass of re-evidence safety.",
  );

  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);
  const expectedActive = directorQualificationExpectedActiveCapabilityCount(
    DIRECTOR_CAPABILITIES,
  );
  // Successor-safe active coverage is owned by the centralized policy helper.
  // Later qualification phases may add truthful non-active states beyond the
  // A.11A.31-era deferred/completed-merge pair (for example merge candidates).
  assert(
    activeIds.length === expectedActive &&
      new Set(activeIds).size === activeIds.length,
    `A.11A.31 successor-safe active coverage must equal the centralized live Qualification-active policy; got ${activeIds.length}.`,
  );
  assert(
    !activeIds.includes(legacyId) && activeIds.includes(canonicalId),
    "Merged legacy camera_object_attached must leave active Qualification while canonical object_attached remains active.",
  );

  const deferred = [...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS] as readonly string[];
  const merged = [...DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_IDS] as readonly string[];
  // Successor-safe: A.11A.31 owns the mounted-camera merge, not the global
  // cardinality of every later completed merge. Future families may add honest
  // aliases without rewriting the mounted-camera proof.
  assert(
    !deferred.includes(legacyId) &&
      merged.includes(legacyId) &&
      isDirectorQualificationCapabilityMerged(legacyId),
    "Successful mounted-camera consolidation must remain represented as merged, not deferred.",
  );

  const legacyProfile = directorQualificationCapabilityProfile(
    frozenTracking,
    legacyId,
  );
  assert(
    legacyProfile.comparison_group === "mounted_camera" &&
      legacyProfile.merge_compare_with_capability_id === null &&
      legacyProfile.suitable_primary_cast_slots.join("|") === "vehicle",
    "Legacy mounted profile must be closed rather than left as a live merge candidate.",
  );

  const special = activeFamilies.find(
    (family) =>
      family.category === "camera_angle" && family.group === "Special viewpoints",
  );
  assert(
    special?.capability_ids.includes(canonicalId),
    "Canonical object_attached must remain active in Special viewpoints.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  assert(
    runtime.includes('type DirectorMountedCameraMode = "immediate" | "blend_in"') &&
      runtime.includes("solveDirectorMountedCameraRelationship") &&
      runtime.includes('case "object_attached": {') &&
      runtime.includes('mode: "blend_in"') &&
      runtime.includes('shot.composition.angle === "object_attached"') &&
      runtime.includes('mode: "immediate"') &&
      !runtime.includes('case "camera_object_attached": {'),
    "Runtime must preserve one mounted-camera solver with immediate angle entry and blend-in movement entry, not a second legacy branch.",
  );

  const authoritative = [
    "scripts/sandbox/verify-director-composition-thirds-negative-space-phase1b7a11a20.ts",
    "scripts/sandbox/verify-director-detail-relationship-closeout-phase1b7a11a23.ts",
    "scripts/sandbox/verify-director-lens-perspective-qualification-phase1b7a11a24.ts",
    "scripts/sandbox/verify-director-shot-scale-semantic-framing-phase1b7a11a25.ts",
    "scripts/sandbox/verify-director-complex-camera-paths-phase1b7a11a26.ts",
    "scripts/sandbox/verify-director-qualification-preload-backpressure-phase1b7a11a27.ts",
    "scripts/sandbox/verify-director-linear-camera-travel-phase1b7a11a28.ts",
    "scripts/sandbox/verify-director-orbit-arc-reveal-paths-phase1b7a11a29.ts",
    "scripts/sandbox/verify-director-rotational-reframing-phase1b7a11a30.ts",
  ] as const;
  for (const path of authoritative) {
    const text = source(path);
    assert(
      text.includes("directorQualificationExpectedActiveCapabilityCount") &&
        !text.includes('source("sandbox/probe-lab/motion-camera-library/README.md")'),
      `Authoritative verifier must use centralized active-count semantics and avoid README prose gates: ${path}`,
    );
  }

  console.log(
    "Director Tracking mounted-camera merge closeout Phase 1B.7A.11A.31 verification passed.",
  );
  console.log(
    `Frozen/authorable/active=${DIRECTOR_CAPABILITIES.length}/${DIRECTOR_AUTHORABLE_CAPABILITIES.length}/${activeIds.length}; camera_object_attached remains a merged legacy alias -> object_attached + blend_in entry while later completed aliases are allowed.`,
  );
  console.log(
    "A.11A.31 v1.1 campaign normalization preserves the merge-proof PASS reel, repairs the one-time stale Needs re-evidence state, and keeps genuine deferral/removal changes fail-closed.",
  );
}

main();
