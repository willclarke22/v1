import type {
  ContractJudgingInput,
  StructuredJudgment,
  StructuredJudgmentOutcome,
} from "../judging-types";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
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
  if (value.kind === "ordering") return { ...value, ...asRecord(value.value) };

  return asRecord((value.value as unknown) ?? value);
}

function structuredUnjudgeable(reason: string): StructuredJudgment {
  return {
    method: "deterministic_ordering",
    outcome: "unjudgeable",
    performance_score: 0,
    confidence: 0.12,
    item_count: 0,
    correct_count: 0,
    incorrect_count: 0,
    reasons: [reason],
    cautions: [],
  };
}

function outcomeFromPerformance(score: number): StructuredJudgmentOutcome {
  if (score >= 0.98) return "correct";
  if (score >= 0.45) return "partially_correct";
  return "incorrect";
}

function submittedOrderingIds(value: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...stringArray(value.ordering_sequence),
    ...stringArray(value.orderingSequence),
    ...stringArray(value.ordered_item_ids),
    ...stringArray(value.orderedItemIds),
    ...stringArray(value.sequence),
    ...stringArray(value.item_order),
    ...stringArray(value.itemOrder),
  ]);
}

export function judgeOrdering(input: ContractJudgingInput): StructuredJudgment {
  const schema = getInputSchema(input);
  const items = asArray(schema.items).map(asRecord);
  const submittedIds = submittedOrderingIds(getStructuredEvidenceRecord(input));

  if (!items.length) {
    return structuredUnjudgeable("Ordering contract did not include items.");
  }

  if (!submittedIds.length) {
    return structuredUnjudgeable(
      "No ordering sequence was available in the submitted evidence.",
    );
  }

  const expected = [...items]
    .filter((item) => typeof item.item_id === "string")
    .sort(
      (a, b) =>
        safeNumber(a.correct_position, Number.MAX_SAFE_INTEGER) -
        safeNumber(b.correct_position, Number.MAX_SAFE_INTEGER),
    )
    .map((item) => item.item_id as string);

  if (!expected.length) {
    return structuredUnjudgeable("Ordering contract did not include valid item ids.");
  }

  const expectedSet = new Set(expected);
  const validSubmitted = submittedIds.filter((id) => expectedSet.has(id));
  const invalidSubmitted = submittedIds.filter((id) => !expectedSet.has(id));

  const positionCorrectCount = expected.reduce((count, expectedId, index) => {
    return count + (validSubmitted[index] === expectedId ? 1 : 0);
  }, 0);

  const missingCount = expected.filter((id) => !validSubmitted.includes(id)).length;
  const incorrectCount =
    Math.max(0, expected.length - positionCorrectCount) + invalidSubmitted.length;

  const performanceScore = clamp01(positionCorrectCount / Math.max(1, expected.length));

  return {
    method: "deterministic_ordering",
    outcome: outcomeFromPerformance(performanceScore),
    performance_score: performanceScore,
    confidence: 0.9,
    item_count: expected.length,
    correct_count: positionCorrectCount,
    incorrect_count: incorrectCount,
    reasons: [
      `Compared submitted order against ${expected.length} expected item position(s).`,
      `${positionCorrectCount} item(s) were in the expected position.`,
    ],
    cautions: [
      ...(missingCount
        ? [`${missingCount} expected item(s) were missing from the submitted order.`]
        : []),
      ...(invalidSubmitted.length
        ? [
            `Ignored ${invalidSubmitted.length} submitted item id(s) that were not in the contract.`,
          ]
        : []),
    ],
  };
}
