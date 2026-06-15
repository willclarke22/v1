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

function getInputSchema(input: ContractJudgingInput) {
  const contract = input.probeContractSnapshot as
    | { input_schema?: unknown }
    | null
    | undefined;
  return asRecord(contract?.input_schema);
}

function getStructuredEvidence(input: ContractJudgingInput): unknown {
  const rawValue = input.normalizedEvidence?.value as unknown;
  const value = asRecord(rawValue);

  if (value.kind === "structured") return value.value;
  if (value.kind === "slider") return Object.keys(asRecord(value.value)).length
    ? { ...value, ...asRecord(value.value) }
    : value;

  return (value.value as unknown) ?? rawValue;
}

function structuredUnjudgeable(reason: string): StructuredJudgment {
  return {
    method: "deterministic_slider",
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

function submittedSliderValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const record = asRecord(value);
  const candidates = [
    record.slider_value,
    record.sliderValue,
    record.prediction,
    record.predicted_value,
    record.predictedValue,
    record.value,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }

  return null;
}

export function judgeSlider(input: ContractJudgingInput): StructuredJudgment {
  const schema = getInputSchema(input);
  const submitted = submittedSliderValue(getStructuredEvidence(input));
  const acceptableRange = Array.isArray(schema.acceptable_range)
    ? schema.acceptable_range
    : null;
  const targetValue = safeNumber(schema.target_value, NaN);
  const min = safeNumber(schema.min, 0);
  const max = safeNumber(schema.max, 100);

  if (submitted === null) {
    return structuredUnjudgeable(
      "No slider/prediction value was available in the submitted evidence.",
    );
  }

  if (!acceptableRange && !Number.isFinite(targetValue)) {
    return structuredUnjudgeable(
      "Slider contract did not include an acceptable range or target value.",
    );
  }

  const lower = acceptableRange
    ? safeNumber(acceptableRange[0], targetValue)
    : targetValue;
  const upper = acceptableRange
    ? safeNumber(acceptableRange[1], targetValue)
    : targetValue;
  const rangeLower = Math.min(lower, upper);
  const rangeUpper = Math.max(lower, upper);
  const inRange = submitted >= rangeLower && submitted <= rangeUpper;
  const totalRange = Math.max(1, Math.abs(max - min));
  const distance = inRange
    ? 0
    : submitted < rangeLower
      ? Math.abs(rangeLower - submitted)
      : Math.abs(submitted - rangeUpper);
  const performanceScore = inRange ? 1 : clamp01(1 - distance / totalRange);

  return {
    method: "deterministic_slider",
    outcome: outcomeFromPerformance(performanceScore),
    performance_score: performanceScore,
    confidence: 0.88,
    item_count: 1,
    correct_count: inRange ? 1 : 0,
    incorrect_count: inRange ? 0 : 1,
    reasons: [
      `Compared submitted value ${submitted} against acceptable range ${rangeLower}–${rangeUpper}.`,
    ],
    cautions:
      submitted < min || submitted > max
        ? ["Submitted value fell outside the contract slider bounds."]
        : [],
  };
}
