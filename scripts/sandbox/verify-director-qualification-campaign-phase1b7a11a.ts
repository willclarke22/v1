import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CAMPAIGN_FAMILY_STATUS_LABELS,
  DIRECTOR_QUALIFICATION_CAMPAIGN_SCHEMA_VERSION,
  DIRECTOR_QUALIFICATION_CAMPAIGN_STORAGE_KEY,
  directorQualificationCampaignCounts,
  directorQualificationCampaignFamilyRecord,
  emptyDirectorQualificationCampaignState,
  markDirectorQualificationCampaignFamilyReviewed,
  markDirectorQualificationCampaignNeedsReEvidence,
  markDirectorQualificationCampaignReviewInProgress,
  nextDirectorQualificationCampaignFamilyKey,
  normalizeDirectorQualificationCampaignState,
  recordDirectorQualificationCampaignEvidence,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-campaign";
import { buildDirectorQualificationFamilies } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  assert(
    families.length === 33,
    `A.11A campaign must cover the existing 33 qualification families, found ${families.length}.`,
  );
  assert(
    families.reduce((total, family) => total + family.capability_ids.length, 0) === 184,
    "A.11A campaign must preserve exact 184-capability coverage.",
  );
  assert(
    DIRECTOR_QUALIFICATION_CAMPAIGN_SCHEMA_VERSION ===
      "director_qualification_campaign_phase1b7a11a_v1",
    "A.11A campaign schema version changed unexpectedly.",
  );
  assert(
    DIRECTOR_QUALIFICATION_CAMPAIGN_STORAGE_KEY ===
      "myway_director_qualification_campaign_phase1b7a11a_v1",
    "A.11A campaign localStorage key changed unexpectedly.",
  );

  const tracking = families.find(
    (family) => family.group === "Tracking & attached camera",
  );
  assert(tracking, "A.11A verifier could not resolve Tracking & attached camera.");

  const start = emptyDirectorQualificationCampaignState(
    families,
    "2026-08-22T17:00:00.000Z",
  );
  const startCounts = directorQualificationCampaignCounts(start);
  assert(
    startCounts.family_count === 33 &&
      startCounts.not_started === 33 &&
      startCounts.reviewed === 0,
    `Fresh A.11A campaign counts are wrong: ${JSON.stringify(startCounts)}`,
  );

  const reviewedWithoutEvidence = markDirectorQualificationCampaignFamilyReviewed(
    start,
    tracking,
    {
      frozen_capability_ids: ["follow"],
      family_notes: "should not close",
      reviewed_at: "2026-08-22T17:00:30.000Z",
    },
  );
  assert(
    directorQualificationCampaignFamilyRecord(reviewedWithoutEvidence, tracking).status ===
      "not_started",
    "A.11A family close must fail closed when no PASS deterministic evidence is attached.",
  );

  const withEvidence = recordDirectorQualificationCampaignEvidence(
    start,
    tracking,
    {
      reel_id: "QR-20260822004239",
      integrity: "pass",
      coverage_mode: "cross_asset",
      evidence_at: "2026-08-22T17:01:00.000Z",
    },
  );
  const evidenceRecord = directorQualificationCampaignFamilyRecord(
    withEvidence,
    tracking,
  );
  assert(
    evidenceRecord.status === "awaiting_perceptual_review" &&
      evidenceRecord.latest_evidence_reel_id === "QR-20260822004239" &&
      evidenceRecord.latest_evidence_integrity === "pass" &&
      evidenceRecord.latest_evidence_coverage_mode === "cross_asset",
    `PASS A.10F evidence must become ChatGPT-review-ready campaign evidence: ${JSON.stringify(evidenceRecord)}`,
  );

  const inReview = markDirectorQualificationCampaignReviewInProgress(
    withEvidence,
    tracking,
    "2026-08-22T17:02:00.000Z",
  );
  assert(
    directorQualificationCampaignFamilyRecord(inReview, tracking).status ===
      "review_in_progress",
    "Recording perceptual decisions after PASS evidence must mark the family Review in progress.",
  );

  const reviewed = markDirectorQualificationCampaignFamilyReviewed(
    inReview,
    tracking,
    {
      frozen_capability_ids: [
        "follow",
        "lead_subject",
        "lag_follow",
        "track_parallel",
        "not_in_family",
      ],
      family_notes: "ChatGPT + human review complete.",
      reviewed_at: "2026-08-22T17:03:00.000Z",
    },
  );
  const reviewedRecord = directorQualificationCampaignFamilyRecord(
    reviewed,
    tracking,
  );
  assert(
    reviewedRecord.status === "reviewed" &&
      reviewedRecord.frozen_capability_ids.length === 4 &&
      !reviewedRecord.frozen_capability_ids.includes("not_in_family") &&
      reviewedRecord.family_notes === "ChatGPT + human review complete.",
    `Closing a family must freeze only qualified in-family capabilities: ${JSON.stringify(reviewedRecord)}`,
  );
  const nextFamilyKey = nextDirectorQualificationCampaignFamilyKey(
    reviewed,
    tracking.key,
  );
  assert(
    nextFamilyKey !== null && nextFamilyKey !== tracking.key,
    "A.11A must advance from a reviewed family to the next unresolved family.",
  );

  const reopened = markDirectorQualificationCampaignNeedsReEvidence(
    reviewed,
    tracking,
    "Lag repair needs a focused comparison.",
    "2026-08-22T17:04:00.000Z",
  );
  const reopenedRecord = directorQualificationCampaignFamilyRecord(
    reopened,
    tracking,
  );
  assert(
    reopenedRecord.status === "needs_re_evidence" &&
      reopenedRecord.frozen_capability_ids.length === 4 &&
      reopenedRecord.re_evidence_reason.includes("Lag repair"),
    "Needs re-evidence must reopen the family without discarding already-frozen siblings.",
  );

  const illegallyReclosed = markDirectorQualificationCampaignFamilyReviewed(
    reopened,
    tracking,
    {
      frozen_capability_ids: reopenedRecord.frozen_capability_ids,
      family_notes: reopenedRecord.family_notes,
      reviewed_at: "2026-08-22T17:04:30.000Z",
    },
  );
  assert(
    directorQualificationCampaignFamilyRecord(illegallyReclosed, tracking).status ===
      "needs_re_evidence",
    "A.11A must require a new PASS reel after Needs re-evidence before the family can close again.",
  );

  const normalized = normalizeDirectorQualificationCampaignState(
    {
      ...reopened,
      family_order: [...reopened.family_order, "unknown-family"],
      current_family_key: "unknown-family",
      families: {
        ...reopened.families,
        "unknown-family": {
          family_key: "unknown-family",
          family_label: "Unknown",
          capability_ids: ["fake"],
          status: "reviewed",
        },
      },
    },
    families,
    "2026-08-22T17:05:00.000Z",
  );
  assert(
    normalized.family_order.length === 33 &&
      normalized.current_family_key !== "unknown-family" &&
      !normalized.families["unknown-family"],
    "A.11A normalization must discard stale/unknown families and preserve the live 33-family authority.",
  );

  const failedEvidence = recordDirectorQualificationCampaignEvidence(
    normalized,
    tracking,
    {
      reel_id: "QR-FAILED",
      integrity: "fail",
      coverage_mode: "cross_asset",
      evidence_at: "2026-08-22T17:06:00.000Z",
    },
  );
  assert(
    directorQualificationCampaignFamilyRecord(failedEvidence, tracking).status ===
      "needs_re_evidence",
    "Failed technical evidence must never become review-ready campaign evidence.",
  );

  assert(
    DIRECTOR_QUALIFICATION_CAMPAIGN_FAMILY_STATUS_LABELS.awaiting_perceptual_review ===
      "Awaiting ChatGPT review",
    "A.11A must name ChatGPT's perceptual-review handoff explicitly.",
  );

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    "Qualification campaign · A.11A",
    "One family → deterministic evidence ZIP → ChatGPT + human review",
    "DIRECTOR_QUALIFICATION_CAMPAIGN_STORAGE_KEY",
    "recordDirectorQualificationCampaignEvidence",
    "Save family review",
    "Save review & go to next family",
    "Needs re-evidence",
    "Go to next unresolved family",
    "frozen_capability_ids",
    "latest_evidence_integrity",
    "Evidence gate.",
    "Perceptual review gate.",
    "Campaign family board",
    "Render gauntlet + export evidence",
  ]) {
    assert(room.includes(marker), `A.11A Qualification Room marker missing: ${marker}`);
  }
  assert(
    !room.includes(">Run qualification batch<") &&
      !room.includes(">Render all families<"),
    "A.11A must not introduce unattended all-family rendering.",
  );

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  for (const marker of [
    "Phase 1B.7A.11A — qualification campaign state",
    "not** an unattended all-family renderer",
    "ChatGPT + human perceptual review",
    "A.10F deterministic export automatically attaches itself",
    "Save family review",
    "Needs re-evidence",
    "lab notebook",
  ]) {
    assert(readme.includes(marker), `A.11A README marker missing: ${marker}`);
  }

  console.log(
    "Director Qualification Room Phase 1B.7A.11A qualification-campaign verification passed.",
  );
  console.log(
    "A.11A keeps one-family A.10F ZIPs as the ChatGPT/human perceptual-review unit while persisting 33-family progress, evidence handoff, frozen siblings, and targeted re-evidence state.",
  );
}

main();
