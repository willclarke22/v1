import type {
  ExampleDomainSignalScope,
  PersonalizationOutcomeTag,
  PersonalizationSignalDirection,
  PersonalizationSignalKind,
  PersonalizationSignalScope,
  PersonalizationUpdateReason,
  ProbeDeliveryContext,
} from "../schemas";

import {
  buildValidationResult,
  isKnownString,
  isNonEmptyString,
  isRecord,
  pathJoin,
  pushIssue,
  validateDeltaField,
  validateEvidenceCountField,
  validateOptionalString,
  validatePreferenceScoreField,
  validateRequiredString,
  validateScoreField,
  type ValidationIssue,
  type ValidationResult,
} from "./shared";

const SIGNAL_KINDS = [
  "bridge_level",
  "jargon_level",
  "presentation_style",
  "support_kind",
  "probe_type",
  "verification_pattern",
] as const satisfies readonly PersonalizationSignalKind[];

const SIGNAL_DIRECTIONS = [
  "prefer",
  "avoid",
  "verify",
] as const satisfies readonly PersonalizationSignalDirection[];

const SIGNAL_SCOPES = [
  "global",
  "topic",
  "diagnosis_label",
  "probe_type",
] as const satisfies readonly PersonalizationSignalScope[];

const EXAMPLE_DOMAIN_SCOPES = [
  "global",
  "topic",
  "diagnosis_label",
] as const satisfies readonly ExampleDomainSignalScope[];

const OUTCOME_TAGS = [
  "misconception_persisted",
  "partial_improvement",
  "strong_local_success",
  "correct_but_needs_verification",
  "neutral_or_unclear",
  "user_correction",
] as const satisfies readonly PersonalizationOutcomeTag[];

const UPDATE_REASONS = [
  "teaching_move_helped",
  "teaching_move_did_not_repair",
  "try_lower_jargon",
  "try_more_targeted_probe",
  "avoid_repetition",
  "needs_verification",
] as const satisfies readonly PersonalizationUpdateReason[];

function validateScopeKey(
  scope: unknown,
  scopeKey: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  validateOptionalString(scopeKey, issues, `${path}.scope_key`);

  if (scope === "global" && scopeKey !== undefined && scopeKey !== null) {
    pushIssue(
      issues,
      "warning",
      "global_scope_should_not_have_scope_key",
      "Global personalization signals should usually use scope_key: null.",
      `${path}.scope_key`,
    );
  }

  if (scope !== "global" && !isNonEmptyString(scopeKey)) {
    pushIssue(
      issues,
      "warning",
      "scoped_signal_should_have_scope_key",
      "Non-global personalization signals should usually include a scope_key.",
      `${path}.scope_key`,
    );
  }
}

function validateTeachingSignal(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isRecord(value)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_signal",
      "Expected personalization signal to be an object.",
      path,
    );
    return;
  }

  validateRequiredString(value.signal_id, issues, `${path}.signal_id`);

  if (!isKnownString(value.kind, SIGNAL_KINDS)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_signal_kind",
      "Expected a valid personalization signal kind.",
      `${path}.kind`,
    );
  }

  validateRequiredString(value.value, issues, `${path}.value`);

  if (!isKnownString(value.direction, SIGNAL_DIRECTIONS)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_signal_direction",
      "Expected a valid personalization signal direction.",
      `${path}.direction`,
    );
  }

  if (!isKnownString(value.scope, SIGNAL_SCOPES)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_signal_scope",
      "Expected a valid personalization signal scope.",
      `${path}.scope`,
    );
  } else {
    validateScopeKey(value.scope, value.scope_key, issues, path);
  }

  validatePreferenceScoreField(value.preference_score, issues, `${path}.preference_score`);
  validateScoreField(value.confidence, issues, `${path}.confidence`);
  validateEvidenceCountField(value.evidence_count, issues, `${path}.evidence_count`);
  validateRequiredString(value.summary, issues, `${path}.summary`);
}

function validateExampleDomainSignal(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isRecord(value)) {
    pushIssue(
      issues,
      "error",
      "invalid_example_domain_signal",
      "Expected example domain signal to be an object.",
      path,
    );
    return;
  }

  validateRequiredString(value.domain, issues, `${path}.domain`);
  validatePreferenceScoreField(value.preference_score, issues, `${path}.preference_score`);
  validateScoreField(value.confidence, issues, `${path}.confidence`);
  validateEvidenceCountField(value.evidence_count, issues, `${path}.evidence_count`);
  validateEvidenceCountField(value.recent_use_count, issues, `${path}.recent_use_count`);
  validateOptionalString(value.last_used_at, issues, `${path}.last_used_at`);

  if (!isKnownString(value.scope, EXAMPLE_DOMAIN_SCOPES)) {
    pushIssue(
      issues,
      "error",
      "invalid_example_domain_scope",
      "Expected a valid example domain scope.",
      `${path}.scope`,
    );
  } else {
    validateScopeKey(value.scope, value.scope_key, issues, path);
  }

  validateRequiredString(value.summary, issues, `${path}.summary`);
}

function validateTeachingSignalUpdate(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isRecord(value)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_signal_update",
      "Expected personalization signal update to be an object.",
      path,
    );
    return;
  }

  validateRequiredString(value.signal_id, issues, `${path}.signal_id`);

  if (!isKnownString(value.kind, SIGNAL_KINDS)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_signal_update_kind",
      "Expected personalization signal update to include a valid kind.",
      `${path}.kind`,
    );
  }

  validateRequiredString(value.value, issues, `${path}.value`);

  if (!isKnownString(value.direction, SIGNAL_DIRECTIONS)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_signal_update_direction",
      "Expected personalization signal update to include a valid direction.",
      `${path}.direction`,
    );
  }

  if (!isKnownString(value.scope, SIGNAL_SCOPES)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_signal_update_scope",
      "Expected personalization signal update to include a valid scope.",
      `${path}.scope`,
    );
  } else {
    validateScopeKey(value.scope, value.scope_key, issues, path);
  }

  if (!isKnownString(value.outcome_tag, OUTCOME_TAGS)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_outcome_tag",
      "Expected a valid personalization outcome_tag.",
      `${path}.outcome_tag`,
    );
  }

  if (!isKnownString(value.update_reason, UPDATE_REASONS)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_update_reason",
      "Expected a valid personalization update_reason.",
      `${path}.update_reason`,
    );
  }

  validateDeltaField(value.preference_score_delta, issues, `${path}.preference_score_delta`);
  validateDeltaField(value.confidence_delta, issues, `${path}.confidence_delta`);
  validateDeltaField(value.evidence_count_delta, issues, `${path}.evidence_count_delta`);
  validateRequiredString(value.summary, issues, `${path}.summary`);
}

function validateExampleDomainUpdate(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isRecord(value)) {
    pushIssue(
      issues,
      "error",
      "invalid_example_domain_update",
      "Expected example domain update to be an object.",
      path,
    );
    return;
  }

  validateRequiredString(value.domain, issues, `${path}.domain`);

  if (!isKnownString(value.scope, EXAMPLE_DOMAIN_SCOPES)) {
    pushIssue(
      issues,
      "error",
      "invalid_example_domain_update_scope",
      "Expected example domain update to include a valid scope.",
      `${path}.scope`,
    );
  } else {
    validateScopeKey(value.scope, value.scope_key, issues, path);
  }

  if (!isKnownString(value.outcome_tag, OUTCOME_TAGS)) {
    pushIssue(
      issues,
      "error",
      "invalid_example_domain_outcome_tag",
      "Expected a valid example domain outcome_tag.",
      `${path}.outcome_tag`,
    );
  }

  if (!isKnownString(value.update_reason, UPDATE_REASONS)) {
    pushIssue(
      issues,
      "error",
      "invalid_example_domain_update_reason",
      "Expected a valid example domain update_reason.",
      `${path}.update_reason`,
    );
  }

  validateDeltaField(value.preference_score_delta, issues, `${path}.preference_score_delta`);
  validateDeltaField(value.confidence_delta, issues, `${path}.confidence_delta`);
  validateDeltaField(value.evidence_count_delta, issues, `${path}.evidence_count_delta`);

  if (value.recent_use_count_delta !== undefined) {
    validateDeltaField(value.recent_use_count_delta, issues, `${path}.recent_use_count_delta`);
  }

  validateOptionalString(value.last_used_at, issues, `${path}.last_used_at`);
  validateRequiredString(value.summary, issues, `${path}.summary`);
}

export function validatePersonalizationProfileSnapshot(
  value: unknown,
  path = "personalization_profile_snapshot",
): ValidationResult<unknown> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_profile_snapshot",
      "Expected personalization profile snapshot to be an object.",
      path,
    );
    return buildValidationResult(value, issues);
  }

  if (value.schema_version !== "personalization_profile_snapshot_v1") {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_profile_snapshot_schema_version",
      "Expected schema_version: 'personalization_profile_snapshot_v1'.",
      `${path}.schema_version`,
    );
  }

  validateRequiredString(value.summary, issues, `${path}.summary`);

  if (!Array.isArray(value.teaching_signals)) {
    pushIssue(
      issues,
      "error",
      "invalid_teaching_signals",
      "Expected teaching_signals to be an array.",
      `${path}.teaching_signals`,
    );
  } else {
    value.teaching_signals.forEach((signal, index) => {
      validateTeachingSignal(signal, issues, pathJoin(`${path}.teaching_signals`, index));
    });
  }

  if (!Array.isArray(value.example_domains)) {
    pushIssue(
      issues,
      "error",
      "invalid_example_domains",
      "Expected example_domains to be an array.",
      `${path}.example_domains`,
    );
  } else {
    value.example_domains.forEach((domain, index) => {
      validateExampleDomainSignal(domain, issues, pathJoin(`${path}.example_domains`, index));
    });
  }

  return buildValidationResult(value, issues);
}

export function validatePersonalizationProfileDelta(
  value: unknown,
  path = "personalization_delta",
): ValidationResult<unknown> {
  const issues: ValidationIssue[] = [];

  if (value === undefined || value === null) {
    return buildValidationResult(value, issues);
  }

  if (!isRecord(value)) {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_delta",
      "Expected personalization_delta to be an object.",
      path,
    );
    return buildValidationResult(value, issues);
  }

  if (value.schema_version !== "personalization_profile_delta_v1") {
    pushIssue(
      issues,
      "error",
      "invalid_personalization_delta_schema_version",
      "Expected schema_version: 'personalization_profile_delta_v1'.",
      `${path}.schema_version`,
    );
  }

  validateRequiredString(value.summary, issues, `${path}.summary`);

  if (value.teaching_signal_updates !== undefined) {
    if (!Array.isArray(value.teaching_signal_updates)) {
      pushIssue(
        issues,
        "error",
        "invalid_teaching_signal_updates",
        "Expected teaching_signal_updates to be an array when provided.",
        `${path}.teaching_signal_updates`,
      );
    } else {
      value.teaching_signal_updates.forEach((update, index) => {
        validateTeachingSignalUpdate(
          update,
          issues,
          pathJoin(`${path}.teaching_signal_updates`, index),
        );
      });
    }
  }

  if (value.example_domain_updates !== undefined) {
    if (!Array.isArray(value.example_domain_updates)) {
      pushIssue(
        issues,
        "error",
        "invalid_example_domain_updates",
        "Expected example_domain_updates to be an array when provided.",
        `${path}.example_domain_updates`,
      );
    } else {
      value.example_domain_updates.forEach((update, index) => {
        validateExampleDomainUpdate(
          update,
          issues,
          pathJoin(`${path}.example_domain_updates`, index),
        );
      });
    }
  }

  return buildValidationResult(value, issues);
}

export function validateProbeDeliveryContext(
  value: unknown,
  path = "delivery_context",
): ValidationResult<ProbeDeliveryContext | null> {
  const issues: ValidationIssue[] = [];

  if (value === undefined || value === null) {
    return buildValidationResult(null, issues);
  }

  if (!isRecord(value)) {
    pushIssue(
      issues,
      "error",
      "invalid_probe_delivery_context",
      "Expected delivery_context to be an object.",
      path,
    );
    return buildValidationResult(null, issues);
  }

  if (!isNonEmptyString(value.bridge_level)) {
    pushIssue(
      issues,
      "error",
      "delivery_context_bridge_level_required",
      "delivery_context.bridge_level is required.",
      `${path}.bridge_level`,
    );
  }

  if (!isRecord(value.language_policy)) {
    pushIssue(
      issues,
      "error",
      "delivery_context_language_policy_required",
      "delivery_context.language_policy is required.",
      `${path}.language_policy`,
    );
  }

  if (value.presentation_styles_used !== undefined && !Array.isArray(value.presentation_styles_used)) {
    pushIssue(
      issues,
      "error",
      "invalid_presentation_styles_used",
      "Expected presentation_styles_used to be an array when provided.",
      `${path}.presentation_styles_used`,
    );
  }

  if (value.support_kinds_used !== undefined && !Array.isArray(value.support_kinds_used)) {
    pushIssue(
      issues,
      "error",
      "invalid_support_kinds_used",
      "Expected support_kinds_used to be an array when provided.",
      `${path}.support_kinds_used`,
    );
  }

  if (value.example_domains_used !== undefined && !Array.isArray(value.example_domains_used)) {
    pushIssue(
      issues,
      "error",
      "invalid_example_domains_used",
      "Expected example_domains_used to be an array when provided.",
      `${path}.example_domains_used`,
    );
  }

  return buildValidationResult(value as ProbeDeliveryContext, issues);
}

