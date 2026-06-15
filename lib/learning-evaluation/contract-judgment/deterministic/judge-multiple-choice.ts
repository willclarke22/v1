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
  if (value.kind === "choice") return asRecord(value.value).constructor === Object
    ? { ...value, ...asRecord(value.value) }
    : value;

  return asRecord((value.value as unknown) ?? value);
}

function structuredUnjudgeable(reason: string, caution?: string): StructuredJudgment {
  return {
    method: "deterministic_multiple_choice",
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

function selectedOptionIds(value: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...stringArray(value.selected_option_ids),
    ...stringArray(value.selectedOptionIds),
    ...stringArray(value.choice_selected),
    ...stringArray(value.selected_choices),
    ...stringArray(value.selectedChoices),
    typeof value.selected_option_id === "string" ? value.selected_option_id : "",
    typeof value.selectedOptionId === "string" ? value.selectedOptionId : "",
    typeof value.option_id === "string" ? value.option_id : "",
    typeof value.choice_id === "string" ? value.choice_id : "",
    typeof value.choiceSelected === "string" ? value.choiceSelected : "",
  ]);
}

export function judgeMultipleChoice(
  input: ContractJudgingInput,
): StructuredJudgment {
  const schema = getInputSchema(input);
  const options = asArray(schema.options).map(asRecord);
  const selectedIds = selectedOptionIds(getStructuredEvidenceRecord(input));

  if (!options.length) {
    return structuredUnjudgeable("Multiple-choice contract did not include options.");
  }

  if (!selectedIds.length) {
    return structuredUnjudgeable(
      "No selected option id was available in the submitted evidence.",
    );
  }

  const correctIds = new Set(
    options
      .filter((option) => option.is_correct === true)
      .map((option) => option.option_id)
      .filter((id): id is string => typeof id === "string"),
  );

  const optionIds = new Set(
    options
      .map((option) => option.option_id)
      .filter((id): id is string => typeof id === "string"),
  );

  const validSelected = selectedIds.filter((id) => optionIds.has(id));
  const invalidSelected = selectedIds.filter((id) => !optionIds.has(id));

  if (!correctIds.size || !validSelected.length) {
    return structuredUnjudgeable(
      !correctIds.size
        ? "Multiple-choice contract did not mark any option as correct."
        : "Submitted option id did not match any contract option.",
    );
  }

  const selectedCorrectCount = validSelected.filter((id) => correctIds.has(id)).length;
  const selectedIncorrectCount = validSelected.length - selectedCorrectCount;
  const missedCorrectCount = [...correctIds].filter(
    (id) => !validSelected.includes(id),
  ).length;

  const allowMultiple = schema.allow_multiple === true;
  const expectedSelectionCount = allowMultiple ? correctIds.size : 1;
  const rawScore = allowMultiple
    ? selectedCorrectCount / Math.max(1, correctIds.size) -
      (selectedIncorrectCount / Math.max(1, optionIds.size - correctIds.size)) * 0.5 -
      (missedCorrectCount / Math.max(1, correctIds.size)) * 0.25
    : selectedCorrectCount === 1 && selectedIncorrectCount === 0
      ? 1
      : 0;

  const performanceScore = clamp01(rawScore);
  const incorrectCount =
    selectedIncorrectCount + missedCorrectCount + invalidSelected.length;

  return {
    method: "deterministic_multiple_choice",
    outcome: outcomeFromPerformance(performanceScore),
    performance_score: performanceScore,
    confidence: 0.94,
    item_count: expectedSelectionCount,
    correct_count: selectedCorrectCount,
    incorrect_count: incorrectCount,
    reasons: [
      `Evaluated ${validSelected.length} selected option(s) against ${options.length} contract option(s).`,
      `${selectedCorrectCount} selected option(s) were marked correct by the contract.`,
    ],
    cautions: invalidSelected.length
      ? [
          `Ignored ${invalidSelected.length} submitted option id(s) that were not in the contract.`,
        ]
      : [],
  };
}
