export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
};

export type ValidationResult<T> = {
  ok: boolean;
  value: T;
  issues: ValidationIssue[];
};

export function pushIssue(
  issues: ValidationIssue[],
  severity: ValidationSeverity,
  code: string,
  message: string,
  path?: string,
): void {
  issues.push({ severity, code, message, path });
}

export function hasValidationErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export function buildValidationResult<T>(
  value: T,
  issues: ValidationIssue[],
): ValidationResult<T> {
  return {
    ok: !hasValidationErrors(issues),
    value,
    issues,
  };
}

export function pathJoin(base: string, key: string | number): string {
  if (typeof key === "number") {
    return `${base}[${key}]`;
  }

  return `${base}.${key}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isScore(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

export function isPreferenceScore(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -1 && value <= 1;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

export function isKnownString<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}

export function validateOptionalString(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (value !== undefined && value !== null && typeof value !== "string") {
    pushIssue(
      issues,
      "error",
      "expected_optional_string",
      "Expected a string, null, or undefined.",
      path,
    );
  }
}

export function validateRequiredString(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isNonEmptyString(value)) {
    pushIssue(
      issues,
      "error",
      "expected_non_empty_string",
      "Expected a non-empty string.",
      path,
    );
  }
}

export function validateScoreField(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isScore(value)) {
    pushIssue(
      issues,
      "error",
      "expected_score_0_to_1",
      "Expected a finite score between 0 and 1.",
      path,
    );
  }
}

export function validatePreferenceScoreField(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isPreferenceScore(value)) {
    pushIssue(
      issues,
      "error",
      "expected_preference_score_minus_1_to_1",
      "Expected a finite preference score between -1 and 1.",
      path,
    );
  }
}

export function validateDeltaField(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isFiniteNumber(value)) {
    pushIssue(
      issues,
      "error",
      "expected_finite_delta",
      "Expected a finite numeric delta.",
      path,
    );
  }
}

export function validateEvidenceCountField(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isNonNegativeInteger(value)) {
    pushIssue(
      issues,
      "error",
      "expected_non_negative_integer",
      "Expected a non-negative integer evidence count.",
      path,
    );
  }
}

