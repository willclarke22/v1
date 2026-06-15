import type {
  ExampleDomainSignal,
  PersonalizationProfileDelta,
  PersonalizationProfileSnapshot,
  PersonalizationSignal,
} from "../schemas";

import {
  clamp01,
  clampPreferenceScore,
  cloneLearningTopicState,
  getNowIso,
  type LearningTopicState,
  type TopicStateUpdateResult,
} from "./learning-topic-state";

export type ApplyPersonalizationDeltaInput = {
  state: LearningTopicState;
  personalization_delta?: PersonalizationProfileDelta | null;
  now?: string | null;
};

function createEmptyProfile(): PersonalizationProfileSnapshot {
  return {
    schema_version: "personalization_profile_snapshot_v1",
    summary: "No stable personalization patterns yet.",
    teaching_signals: [],
    example_domains: [],
  };
}

function applySignalUpdate(
  profile: PersonalizationProfileSnapshot,
  update: NonNullable<PersonalizationProfileDelta["teaching_signal_updates"]>[number],
  appliedChanges: string[],
): void {
  const existingIndex = profile.teaching_signals.findIndex(
    (signal) => signal.signal_id === update.signal_id,
  );

  if (existingIndex >= 0) {
    const existing = profile.teaching_signals[existingIndex];

    const next: PersonalizationSignal = {
      ...existing,
      kind: update.kind,
      value: update.value,
      direction: update.direction,
      scope: update.scope,
      scope_key: update.scope_key ?? null,
      preference_score: clampPreferenceScore(
        existing.preference_score + update.preference_score_delta,
      ),
      confidence: clamp01(existing.confidence + update.confidence_delta),
      evidence_count: Math.max(
        0,
        existing.evidence_count + Math.trunc(update.evidence_count_delta),
      ),
      summary: update.summary || existing.summary,
    };

    profile.teaching_signals[existingIndex] = next;
    appliedChanges.push(`personalization_signal:${update.signal_id}:updated`);
    return;
  }

  const created: PersonalizationSignal = {
    signal_id: update.signal_id,
    kind: update.kind,
    value: update.value,
    direction: update.direction,
    scope: update.scope,
    scope_key: update.scope_key ?? null,
    preference_score: clampPreferenceScore(update.preference_score_delta),
    confidence: clamp01(update.confidence_delta),
    evidence_count: Math.max(0, Math.trunc(update.evidence_count_delta)),
    summary: update.summary,
  };

  profile.teaching_signals.push(created);
  appliedChanges.push(`personalization_signal:${update.signal_id}:created`);
}

function applyExampleDomainUpdate(
  profile: PersonalizationProfileSnapshot,
  update: NonNullable<PersonalizationProfileDelta["example_domain_updates"]>[number],
  appliedChanges: string[],
): void {
  const existingIndex = profile.example_domains.findIndex(
    (signal) =>
      signal.domain === update.domain &&
      signal.scope === update.scope &&
      (signal.scope_key ?? null) === (update.scope_key ?? null),
  );

  if (existingIndex >= 0) {
    const existing = profile.example_domains[existingIndex];

    const next: ExampleDomainSignal = {
      ...existing,
      preference_score: clampPreferenceScore(
        existing.preference_score + update.preference_score_delta,
      ),
      confidence: clamp01(existing.confidence + update.confidence_delta),
      evidence_count: Math.max(
        0,
        existing.evidence_count + Math.trunc(update.evidence_count_delta),
      ),
      recent_use_count: Math.max(
        0,
        existing.recent_use_count + Math.trunc(update.recent_use_count_delta ?? 0),
      ),
      last_used_at: update.last_used_at ?? existing.last_used_at ?? null,
      summary: update.summary || existing.summary,
    };

    profile.example_domains[existingIndex] = next;
    appliedChanges.push(`example_domain:${update.domain}:updated`);
    return;
  }

  const created: ExampleDomainSignal = {
    domain: update.domain,
    preference_score: clampPreferenceScore(update.preference_score_delta),
    confidence: clamp01(update.confidence_delta),
    evidence_count: Math.max(0, Math.trunc(update.evidence_count_delta)),
    recent_use_count: Math.max(0, Math.trunc(update.recent_use_count_delta ?? 0)),
    last_used_at: update.last_used_at ?? null,
    scope: update.scope,
    scope_key: update.scope_key ?? null,
    summary: update.summary,
  };

  profile.example_domains.push(created);
  appliedChanges.push(`example_domain:${update.domain}:created`);
}

function normalizeProfile(profile: PersonalizationProfileSnapshot): PersonalizationProfileSnapshot {
  return {
    ...profile,
    teaching_signals: [...profile.teaching_signals].sort((a, b) => {
      const bStrength = Math.abs(b.preference_score) * b.confidence;
      const aStrength = Math.abs(a.preference_score) * a.confidence;
      return bStrength - aStrength;
    }),
    example_domains: [...profile.example_domains].sort((a, b) => {
      const bStrength = Math.abs(b.preference_score) * b.confidence;
      const aStrength = Math.abs(a.preference_score) * a.confidence;
      return bStrength - aStrength;
    }),
  };
}

export function applyPersonalizationDelta(
  input: ApplyPersonalizationDeltaInput,
): TopicStateUpdateResult {
  const state = cloneLearningTopicState(input.state);
  const applied_changes: string[] = [];
  const warnings: string[] = [];
  const now = getNowIso(input.now);

  const delta = input.personalization_delta;

  if (!delta) {
    return {
      state,
      applied_changes,
      warnings,
    };
  }

  const profile = state.personalization_profile
    ? {
        ...state.personalization_profile,
        teaching_signals: [...state.personalization_profile.teaching_signals],
        example_domains: [...state.personalization_profile.example_domains],
      }
    : createEmptyProfile();

  if (delta.summary && delta.summary.trim().length > 0) {
    profile.summary = delta.summary;
    applied_changes.push("personalization_profile:summary_updated");
  }

  delta.teaching_signal_updates?.forEach((update) => {
    applySignalUpdate(profile, update, applied_changes);
  });

  delta.example_domain_updates?.forEach((update) => {
    applyExampleDomainUpdate(profile, update, applied_changes);
  });

  state.personalization_profile = normalizeProfile(profile);
  state.updated_at = now;

  return {
    state,
    applied_changes,
    warnings,
  };
}

