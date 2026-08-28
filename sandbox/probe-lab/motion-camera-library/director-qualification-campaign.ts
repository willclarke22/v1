import type { DirectorQualificationCoverageMode } from "./director-qualification-contract";
import type { DirectorQualificationFamily } from "./director-qualification-families";

export const DIRECTOR_QUALIFICATION_CAMPAIGN_SCHEMA_VERSION =
  "director_qualification_campaign_phase1b7a11a_v1" as const;

export const DIRECTOR_QUALIFICATION_CAMPAIGN_STORAGE_KEY =
  "myway_director_qualification_campaign_phase1b7a11a_v1";

export const DIRECTOR_QUALIFICATION_CAMPAIGN_FAMILY_STATUSES = [
  "not_started",
  "awaiting_perceptual_review",
  "review_in_progress",
  "reviewed",
  "needs_re_evidence",
  "blocked",
] as const;

export type DirectorQualificationCampaignFamilyStatus =
  (typeof DIRECTOR_QUALIFICATION_CAMPAIGN_FAMILY_STATUSES)[number];

export const DIRECTOR_QUALIFICATION_CAMPAIGN_FAMILY_STATUS_LABELS: Record<
  DirectorQualificationCampaignFamilyStatus,
  string
> = {
  not_started: "Not started",
  awaiting_perceptual_review: "Awaiting ChatGPT review",
  review_in_progress: "Review in progress",
  reviewed: "Reviewed",
  needs_re_evidence: "Needs re-evidence",
  blocked: "Blocked",
};

export type DirectorQualificationCampaignEvidenceIntegrity = "pass" | "fail";

export type DirectorQualificationCampaignFamilyRecord = {
  family_key: string;
  family_label: string;
  capability_ids: string[];
  status: DirectorQualificationCampaignFamilyStatus;
  latest_evidence_reel_id: string | null;
  latest_evidence_integrity: DirectorQualificationCampaignEvidenceIntegrity | null;
  latest_evidence_coverage_mode: DirectorQualificationCoverageMode | null;
  latest_evidence_at: string | null;
  reviewed_at: string | null;
  updated_at: string | null;
  family_notes: string;
  frozen_capability_ids: string[];
  re_evidence_reason: string;
};

export type DirectorQualificationCampaignState = {
  schema_version: typeof DIRECTOR_QUALIFICATION_CAMPAIGN_SCHEMA_VERSION;
  campaign_id: string;
  created_at: string;
  updated_at: string;
  current_family_key: string | null;
  family_order: string[];
  families: Record<string, DirectorQualificationCampaignFamilyRecord>;
};

export type DirectorQualificationCampaignCounts = {
  family_count: number;
  reviewed: number;
  awaiting_perceptual_review: number;
  review_in_progress: number;
  needs_re_evidence: number;
  blocked: number;
  not_started: number;
  frozen_capability_count: number;
};

function uniqueStrings(values: readonly string[]) {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string" && Boolean(value))),
  );
}

function campaignIdForIso(iso: string) {
  return `QCAM-${iso.replace(/\D/g, "").slice(0, 14) || "campaign"}`;
}

function emptyFamilyRecord(
  family: DirectorQualificationFamily,
): DirectorQualificationCampaignFamilyRecord {
  return {
    family_key: family.key,
    family_label: family.label,
    capability_ids: [...family.capability_ids],
    status: "not_started",
    latest_evidence_reel_id: null,
    latest_evidence_integrity: null,
    latest_evidence_coverage_mode: null,
    latest_evidence_at: null,
    reviewed_at: null,
    updated_at: null,
    family_notes: "",
    frozen_capability_ids: [],
    re_evidence_reason: "",
  };
}

export function emptyDirectorQualificationCampaignState(
  families: DirectorQualificationFamily[],
  nowIso = new Date().toISOString(),
): DirectorQualificationCampaignState {
  return {
    schema_version: DIRECTOR_QUALIFICATION_CAMPAIGN_SCHEMA_VERSION,
    campaign_id: campaignIdForIso(nowIso),
    created_at: nowIso,
    updated_at: nowIso,
    current_family_key: families[0]?.key ?? null,
    family_order: families.map((family) => family.key),
    families: Object.fromEntries(
      families.map((family) => [family.key, emptyFamilyRecord(family)]),
    ),
  };
}

function normalizedStatus(
  value: unknown,
): DirectorQualificationCampaignFamilyStatus {
  return DIRECTOR_QUALIFICATION_CAMPAIGN_FAMILY_STATUSES.includes(
    value as DirectorQualificationCampaignFamilyStatus,
  )
    ? (value as DirectorQualificationCampaignFamilyStatus)
    : "not_started";
}

function normalizedCoverage(
  value: unknown,
): DirectorQualificationCoverageMode | null {
  return value === "baseline" || value === "cross_asset" || value === "full_cast"
    ? value
    : null;
}

export function normalizeDirectorQualificationCampaignState(
  value: unknown,
  families: DirectorQualificationFamily[],
  nowIso = new Date().toISOString(),
): DirectorQualificationCampaignState {
  const fallback = emptyDirectorQualificationCampaignState(families, nowIso);
  if (!value || typeof value !== "object") return fallback;

  const input = value as Partial<DirectorQualificationCampaignState>;
  const knownFamilyKeys = new Set(families.map((family) => family.key));
  const sourceFamilies =
    input.families && typeof input.families === "object" ? input.families : {};

  const normalizedFamilies: Record<
    string,
    DirectorQualificationCampaignFamilyRecord
  > = {};

  for (const family of families) {
    const fallbackFamily = emptyFamilyRecord(family);
    const candidate = sourceFamilies[family.key];
    if (!candidate || typeof candidate !== "object") {
      normalizedFamilies[family.key] = fallbackFamily;
      continue;
    }

    const record = candidate as Partial<DirectorQualificationCampaignFamilyRecord>;
    const capabilitySet = new Set(family.capability_ids);
    const recordedCapabilityIds = uniqueStrings(record.capability_ids ?? []);
    const capabilityMembershipChanged =
      recordedCapabilityIds.length > 0 &&
      (recordedCapabilityIds.length !== family.capability_ids.length ||
        recordedCapabilityIds.some((capabilityId) => !capabilitySet.has(capabilityId)));
    const hasPriorEvidence =
      typeof record.latest_evidence_reel_id === "string" &&
      record.latest_evidence_reel_id.length > 0;
    normalizedFamilies[family.key] = {
      ...fallbackFamily,
      status:
        capabilityMembershipChanged && hasPriorEvidence
          ? "needs_re_evidence"
          : normalizedStatus(record.status),
      latest_evidence_reel_id:
        typeof record.latest_evidence_reel_id === "string"
          ? record.latest_evidence_reel_id
          : null,
      latest_evidence_integrity:
        record.latest_evidence_integrity === "pass" ||
        record.latest_evidence_integrity === "fail"
          ? record.latest_evidence_integrity
          : null,
      latest_evidence_coverage_mode: normalizedCoverage(
        record.latest_evidence_coverage_mode,
      ),
      latest_evidence_at:
        typeof record.latest_evidence_at === "string"
          ? record.latest_evidence_at
          : null,
      reviewed_at:
        typeof record.reviewed_at === "string" ? record.reviewed_at : null,
      updated_at:
        typeof record.updated_at === "string" ? record.updated_at : null,
      family_notes:
        typeof record.family_notes === "string" ? record.family_notes : "",
      frozen_capability_ids: uniqueStrings(record.frozen_capability_ids ?? []).filter(
        (capabilityId) => capabilitySet.has(capabilityId),
      ),
      re_evidence_reason:
        capabilityMembershipChanged && hasPriorEvidence
          ? "Active qualification capability membership changed; render fresh deterministic evidence for the current family."
          : typeof record.re_evidence_reason === "string"
            ? record.re_evidence_reason
            : "",
    };
  }

  const requestedOrder = uniqueStrings(input.family_order ?? []).filter((key) =>
    knownFamilyKeys.has(key),
  );
  const familyOrder = [
    ...requestedOrder,
    ...families.map((family) => family.key).filter((key) => !requestedOrder.includes(key)),
  ];
  const currentFamilyKey =
    typeof input.current_family_key === "string" &&
    knownFamilyKeys.has(input.current_family_key)
      ? input.current_family_key
      : familyOrder[0] ?? null;

  return {
    schema_version: DIRECTOR_QUALIFICATION_CAMPAIGN_SCHEMA_VERSION,
    campaign_id:
      typeof input.campaign_id === "string" && input.campaign_id
        ? input.campaign_id
        : fallback.campaign_id,
    created_at:
      typeof input.created_at === "string" ? input.created_at : fallback.created_at,
    updated_at:
      typeof input.updated_at === "string" ? input.updated_at : fallback.updated_at,
    current_family_key: currentFamilyKey,
    family_order: familyOrder,
    families: normalizedFamilies,
  };
}

export function directorQualificationCampaignFamilyRecord(
  state: DirectorQualificationCampaignState,
  family: DirectorQualificationFamily,
): DirectorQualificationCampaignFamilyRecord {
  return state.families[family.key] ?? emptyFamilyRecord(family);
}

function withFamilyRecord(
  state: DirectorQualificationCampaignState,
  family: DirectorQualificationFamily,
  record: DirectorQualificationCampaignFamilyRecord,
  nowIso: string,
): DirectorQualificationCampaignState {
  return {
    ...state,
    schema_version: DIRECTOR_QUALIFICATION_CAMPAIGN_SCHEMA_VERSION,
    updated_at: nowIso,
    current_family_key: family.key,
    families: {
      ...state.families,
      [family.key]: record,
    },
  };
}

export function recordDirectorQualificationCampaignEvidence(
  state: DirectorQualificationCampaignState,
  family: DirectorQualificationFamily,
  evidence: {
    reel_id: string;
    integrity: DirectorQualificationCampaignEvidenceIntegrity;
    coverage_mode: DirectorQualificationCoverageMode;
    evidence_at?: string;
  },
): DirectorQualificationCampaignState {
  const nowIso = evidence.evidence_at ?? new Date().toISOString();
  const current = directorQualificationCampaignFamilyRecord(state, family);
  return withFamilyRecord(
    state,
    family,
    {
      ...current,
      status:
        evidence.integrity === "pass"
          ? "awaiting_perceptual_review"
          : "needs_re_evidence",
      latest_evidence_reel_id: evidence.reel_id,
      latest_evidence_integrity: evidence.integrity,
      latest_evidence_coverage_mode: evidence.coverage_mode,
      latest_evidence_at: nowIso,
      reviewed_at: evidence.integrity === "pass" ? current.reviewed_at : null,
      updated_at: nowIso,
      re_evidence_reason:
        evidence.integrity === "pass"
          ? ""
          : "Evidence integrity failed; render a new deterministic reel before perceptual review.",
    },
    nowIso,
  );
}

export function markDirectorQualificationCampaignReviewInProgress(
  state: DirectorQualificationCampaignState,
  family: DirectorQualificationFamily,
  nowIso = new Date().toISOString(),
): DirectorQualificationCampaignState {
  const current = directorQualificationCampaignFamilyRecord(state, family);
  if (current.status === "reviewed" || current.status === "needs_re_evidence") {
    return state;
  }
  return withFamilyRecord(
    state,
    family,
    {
      ...current,
      status:
        current.latest_evidence_integrity === "pass"
          ? "review_in_progress"
          : current.status,
      updated_at: nowIso,
    },
    nowIso,
  );
}

export function markDirectorQualificationCampaignFamilyReviewed(
  state: DirectorQualificationCampaignState,
  family: DirectorQualificationFamily,
  input: {
    frozen_capability_ids: string[];
    family_notes?: string;
    reviewed_at?: string;
  },
): DirectorQualificationCampaignState {
  const nowIso = input.reviewed_at ?? new Date().toISOString();
  const current = directorQualificationCampaignFamilyRecord(state, family);
  if (
    current.latest_evidence_integrity !== "pass" ||
    current.status === "needs_re_evidence"
  ) {
    return state;
  }
  const capabilitySet = new Set(family.capability_ids);
  return withFamilyRecord(
    state,
    family,
    {
      ...current,
      status: "reviewed",
      reviewed_at: nowIso,
      updated_at: nowIso,
      family_notes:
        typeof input.family_notes === "string"
          ? input.family_notes
          : current.family_notes,
      frozen_capability_ids: uniqueStrings(input.frozen_capability_ids).filter(
        (capabilityId) => capabilitySet.has(capabilityId),
      ),
      re_evidence_reason: "",
    },
    nowIso,
  );
}

export function markDirectorQualificationCampaignNeedsReEvidence(
  state: DirectorQualificationCampaignState,
  family: DirectorQualificationFamily,
  reason: string,
  nowIso = new Date().toISOString(),
): DirectorQualificationCampaignState {
  const current = directorQualificationCampaignFamilyRecord(state, family);
  return withFamilyRecord(
    state,
    family,
    {
      ...current,
      status: "needs_re_evidence",
      updated_at: nowIso,
      re_evidence_reason: reason.trim(),
    },
    nowIso,
  );
}

export function updateDirectorQualificationCampaignFamilyNotes(
  state: DirectorQualificationCampaignState,
  family: DirectorQualificationFamily,
  notes: string,
  nowIso = new Date().toISOString(),
): DirectorQualificationCampaignState {
  const current = directorQualificationCampaignFamilyRecord(state, family);
  return withFamilyRecord(
    state,
    family,
    {
      ...current,
      family_notes: notes,
      updated_at: nowIso,
    },
    nowIso,
  );
}

export function setDirectorQualificationCampaignCurrentFamily(
  state: DirectorQualificationCampaignState,
  familyKey: string,
  nowIso = new Date().toISOString(),
): DirectorQualificationCampaignState {
  if (!state.families[familyKey] || state.current_family_key === familyKey) {
    return state;
  }
  return {
    ...state,
    updated_at: nowIso,
    current_family_key: familyKey,
  };
}

export function directorQualificationCampaignCounts(
  state: DirectorQualificationCampaignState,
): DirectorQualificationCampaignCounts {
  const counts: DirectorQualificationCampaignCounts = {
    family_count: state.family_order.length,
    reviewed: 0,
    awaiting_perceptual_review: 0,
    review_in_progress: 0,
    needs_re_evidence: 0,
    blocked: 0,
    not_started: 0,
    frozen_capability_count: 0,
  };

  for (const familyKey of state.family_order) {
    const record = state.families[familyKey];
    if (!record) continue;
    counts[record.status] += 1;
    counts.frozen_capability_count += record.frozen_capability_ids.length;
  }
  return counts;
}

export function nextDirectorQualificationCampaignFamilyKey(
  state: DirectorQualificationCampaignState,
  currentFamilyKey: string | null,
): string | null {
  const order = state.family_order;
  if (!order.length) return null;
  const currentIndex = currentFamilyKey ? order.indexOf(currentFamilyKey) : -1;

  for (let step = 1; step <= order.length; step += 1) {
    const index = (Math.max(-1, currentIndex) + step + order.length) % order.length;
    const familyKey = order[index];
    const record = state.families[familyKey];
    if (!record || record.status !== "reviewed") return familyKey;
  }
  return null;
}
