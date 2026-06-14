import type {
  ContractJudgingInput,
  StructuredJudgment,
  StructuredJudgmentOutcome,
} from "../judging-types";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getInputSchema(input: ContractJudgingInput) {
  const contract = input.probeContractSnapshot as
    | { input_schema?: unknown }
    | null
    | undefined;
  return asRecord(contract?.input_schema);
}

function getStructuredEvidenceRecord(input: ContractJudgingInput) {
  const rawValue = input.normalizedEvidence?.value as unknown;
  const value = asRecord(rawValue);

  if (value.kind === "structured") return asRecord(value.value);
  if (value.kind === "drag_drop") return { ...value, ...asRecord(value.value) };

  return asRecord((value.value as unknown) ?? value);
}

function structuredUnjudgeable(reason: string, caution?: string): StructuredJudgment {
  return {
    method: "deterministic_drag_drop",
    outcome: "unjudgeable",
    performance_score: 0,
    confidence: 0.12,
    item_count: 0,
    correct_count: 0,
    incorrect_count: 0,
    reasons: [reason],
    cautions: caution ? [caution] : [],
  };
}

function outcomeFromPerformance(score: number): StructuredJudgmentOutcome {
  if (score >= 0.98) return "correct";
  if (score >= 0.45) return "partially_correct";
  return "incorrect";
}

function submittedMatches(value: Record<string, unknown>) {
  const direct =
    asArray(value.matches).length > 0
      ? asArray(value.matches)
      : asArray(value.correct_matches).length > 0
        ? asArray(value.correct_matches)
        : asArray(value.drag_drop_positions).length > 0
          ? asArray(value.drag_drop_positions)
          : asArray(value.dragDropPositions);

  if (direct.length) {
    return direct
      .map(asRecord)
      .map((match) => ({
        item_id:
          typeof match.item_id === "string"
            ? match.item_id
            : typeof match.itemId === "string"
              ? match.itemId
              : null,
        target_id:
          typeof match.target_id === "string"
            ? match.target_id
            : typeof match.targetId === "string"
              ? match.targetId
              : null,
      }))
      .filter(
        (match): match is { item_id: string; target_id: string } =>
          Boolean(match.item_id && match.target_id),
      );
  }

  const matchMap = Object.keys(asRecord(value.match_map)).length
    ? asRecord(value.match_map)
    : asRecord(value.matchMap);

  return Object.entries(matchMap)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([item_id, target_id]) => ({ item_id, target_id }));
}

export function judgeDragDrop(input: ContractJudgingInput): StructuredJudgment {
  const schema = getInputSchema(input);
  const correctMatches = asArray(schema.correct_matches)
    .map(asRecord)
    .map((match) => ({
      item_id: typeof match.item_id === "string" ? match.item_id : null,
      target_id: typeof match.target_id === "string" ? match.target_id : null,
    }))
    .filter(
      (match): match is { item_id: string; target_id: string } =>
        Boolean(match.item_id && match.target_id),
    );
  const submitted = submittedMatches(getStructuredEvidenceRecord(input));

  if (!correctMatches.length) {
    return structuredUnjudgeable(
      "Drag/drop contract did not include correct matches.",
      "This is expected for early scaffold contracts that still use placeholder match schemas.",
    );
  }

  if (!submitted.length) {
    return structuredUnjudgeable(
      "No drag/drop matches were available in the submitted evidence.",
    );
  }

  const expectedByItem = new Map(
    correctMatches.map((match) => [match.item_id, match.target_id]),
  );
  const submittedByItem = new Map(
    submitted.map((match) => [match.item_id, match.target_id]),
  );

  const correctCount = correctMatches.reduce((count, match) => {
    return count + (submittedByItem.get(match.item_id) === match.target_id ? 1 : 0);
  }, 0);
  const incorrectCount = correctMatches.length - correctCount;
  const extraCount = submitted.filter((match) => !expectedByItem.has(match.item_id)).length;
  const performanceScore = clamp01(correctCount / Math.max(1, correctMatches.length));

  return {
    method: "deterministic_drag_drop",
    outcome: outcomeFromPerformance(performanceScore),
    performance_score: performanceScore,
    confidence: 0.88,
    item_count: correctMatches.length,
    correct_count: correctCount,
    incorrect_count: incorrectCount + extraCount,
    reasons: [
      `Compared ${submitted.length} submitted match(es) against ${correctMatches.length} expected match(es).`,
      `${correctCount} match(es) were correct.`,
    ],
    cautions: extraCount
      ? [`Ignored ${extraCount} submitted match(es) for unknown item ids.`]
      : [],
  };
}
