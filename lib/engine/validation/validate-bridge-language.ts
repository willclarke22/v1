import type {
  BridgeLevel,
  JargonLevel,
  LanguagePolicy,
} from "../schemas";

import {
  buildValidationResult,
  isKnownString,
  isRecord,
  pushIssue,
  type ValidationIssue,
  type ValidationResult,
} from "./shared";

const BRIDGE_LEVELS = [
  "bridge_0",
  "bridge_1",
  "bridge_2",
  "full_bridge",
] as const satisfies readonly BridgeLevel[];

const JARGON_LEVELS = [
  "none",
  "light",
  "standard",
  "full",
] as const satisfies readonly JargonLevel[];

export type BridgeLanguageInput = {
  bridge_level?: unknown;
  language_policy?: unknown;
};

export type BridgeLanguageValidationValue = {
  bridge_level?: BridgeLevel;
  language_policy?: LanguagePolicy;
};

export function validateBridgeLanguage(
  input: BridgeLanguageInput,
  path = "bridge_language",
): ValidationResult<BridgeLanguageValidationValue> {
  const issues: ValidationIssue[] = [];

  const bridgeLevel = input.bridge_level;
  const languagePolicy = input.language_policy;

  if (!isKnownString(bridgeLevel, BRIDGE_LEVELS)) {
    pushIssue(
      issues,
      "error",
      "invalid_bridge_level",
      "Expected a valid bridge level.",
      `${path}.bridge_level`,
    );
  }

  let jargonLevel: JargonLevel | undefined;

  if (!isRecord(languagePolicy)) {
    pushIssue(
      issues,
      "error",
      "invalid_language_policy",
      "Expected language_policy to be an object.",
      `${path}.language_policy`,
    );
  } else if (!isKnownString(languagePolicy.jargon_level, JARGON_LEVELS)) {
    pushIssue(
      issues,
      "error",
      "invalid_jargon_level",
      "Expected a valid jargon level.",
      `${path}.language_policy.jargon_level`,
    );
  } else {
    jargonLevel = languagePolicy.jargon_level;
  }

  if (bridgeLevel === "bridge_0" && jargonLevel && jargonLevel !== "none") {
    pushIssue(
      issues,
      "warning",
      "bridge_0_should_use_no_jargon",
      "bridge_0 should normally use jargon_level: 'none'.",
      `${path}.language_policy.jargon_level`,
    );
  }

  if (bridgeLevel === "bridge_1" && jargonLevel === "full") {
    pushIssue(
      issues,
      "warning",
      "bridge_1_jargon_too_high",
      "bridge_1 should not usually use full jargon.",
      `${path}.language_policy.jargon_level`,
    );
  }

  return buildValidationResult(
    {
      bridge_level: isKnownString(bridgeLevel, BRIDGE_LEVELS)
        ? bridgeLevel
        : undefined,
      language_policy: jargonLevel
        ? {
            jargon_level: jargonLevel,
          }
        : undefined,
    },
    issues,
  );
}

