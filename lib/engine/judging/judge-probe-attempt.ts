import type {
  DiagnosisDelta,
  DiagnosisType,
  EntityId,
  ProbeContractSnapshot,
} from "@/types/contracts";
import {
  CONTRACT_JUDGING_VERSION,
  type ContractFailureMatch,
  type ContractJudgment,
  type ContractJudgmentOutcome,
  type ContractJudgingInput,
  type ContractMarkerMatch,
  type ContractMisconceptionMatch,
  type EvidenceJudgingTier,
  type JudgingMethod,
  type StructuredJudgment,
  type StructuredJudgmentOutcome,
} from "./judging-types";

const DIAGNOSIS_TYPES: DiagnosisType[] = [
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
];

function nowIso() {
  return new Date().toISOString();
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function emptyDelta(): DiagnosisDelta {
  return {
    recall_gap: 0,
    representation_gap: 0,
    procedure_gap: 0,
    discrimination_gap: 0,
    transfer_gap: 0,
  };
}

function isDiagnosisType(value: unknown): value is DiagnosisType {
  return typeof value === "string" && DIAGNOSIS_TYPES.includes(value as DiagnosisType);
}

function mergeDiagnosisDeltas(
  base: DiagnosisDelta,
  incoming: DiagnosisDelta,
  weight = 1,
): DiagnosisDelta {
  return {
    recall_gap: clamp01(base.recall_gap + incoming.recall_gap * weight),
    representation_gap: clamp01(
      base.representation_gap + incoming.representation_gap * weight,
    ),
    procedure_gap: clamp01(base.procedure_gap + incoming.procedure_gap * weight),
    discrimination_gap: clamp01(
      base.discrimination_gap + incoming.discrimination_gap * weight,
    ),
    transfer_gap: clamp01(base.transfer_gap + incoming.transfer_gap * weight),
  };
}

function scaleDiagnosisDelta(delta: DiagnosisDelta, scale: number): DiagnosisDelta {
  return {
    recall_gap: clamp01(delta.recall_gap * scale),
    representation_gap: clamp01(delta.representation_gap * scale),
    procedure_gap: clamp01(delta.procedure_gap * scale),
    discrimination_gap: clamp01(delta.discrimination_gap * scale),
    transfer_gap: clamp01(delta.transfer_gap * scale),
  };
}

function normalizeDiagnosisDelta(value: unknown): DiagnosisDelta {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyDelta();
  }

  const record = value as Partial<Record<DiagnosisType, unknown>>;

  return {
    recall_gap: clamp01(safeNumber(record.recall_gap, 0)),
    representation_gap: clamp01(safeNumber(record.representation_gap, 0)),
    procedure_gap: clamp01(safeNumber(record.procedure_gap, 0)),
    discrimination_gap: clamp01(safeNumber(record.discrimination_gap, 0)),
    transfer_gap: clamp01(safeNumber(record.transfer_gap, 0)),
  };
}

function getDominantDiagnosis(delta: DiagnosisDelta): DiagnosisType | null {
  let best: DiagnosisType | null = null;
  let bestValue = 0;

  for (const diagnosisType of DIAGNOSIS_TYPES) {
    const value = delta[diagnosisType];
    if (value > bestValue) {
      best = diagnosisType;
      bestValue = value;
    }
  }

  return bestValue > 0.03 ? best : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function getContractId(contract: ProbeContractSnapshot | null | undefined) {
  return typeof contract?.contract_id === "string" ? contract.contract_id : null;
}

function getJudgingSchema(contract: ProbeContractSnapshot | null | undefined) {
  return asRecord(contract?.judging_schema ?? null);
}

function getInputSchema(contract: ProbeContractSnapshot | null | undefined) {
  return asRecord((contract as { input_schema?: unknown } | null | undefined)?.input_schema);
}

function getRendererKind(contract: ProbeContractSnapshot | null | undefined) {
  const inputSchema = getInputSchema(contract);
  const fromInputSchema = inputSchema.renderer_kind;
  const fromContract = (contract as { renderer_kind?: unknown } | null | undefined)
    ?.renderer_kind;

  return typeof fromInputSchema === "string"
    ? fromInputSchema
    : typeof fromContract === "string"
      ? fromContract
      : null;
}

function getTargetDiagnosis(contract: ProbeContractSnapshot | null | undefined) {
  const candidate = (contract as { target_diagnosis?: unknown } | null | undefined)
    ?.target_diagnosis;
  return isDiagnosisType(candidate) ? candidate : null;
}

function getSuccessMarkers(contract: ProbeContractSnapshot | null | undefined) {
  return asArray(getJudgingSchema(contract).success_markers);
}

function getFailureMarkers(contract: ProbeContractSnapshot | null | undefined) {
  return asArray(getJudgingSchema(contract).failure_markers);
}

function getMisconceptionMappings(
  contract: ProbeContractSnapshot | null | undefined,
) {
  return asArray(getJudgingSchema(contract).misconception_mappings);
}

function getStructuredEvidenceValue(input: ContractJudgingInput) {
  const value = input.normalizedEvidence?.value;
  return value?.kind === "structured" ? value.value : null;
}

function getEvidenceText(input: ContractJudgingInput) {
  const value = input.normalizedEvidence?.value;
  return value?.kind === "text" ? value.text : "";
}

function textIncludesAny(text: string, needles: string[]) {
  const lower = text.toLowerCase();

  return needles.some((needle) => {
    const normalized = needle.trim().toLowerCase();
    return normalized.length >= 4 && lower.includes(normalized);
  });
}

function structuredNotApplicable(method: JudgingMethod = "none"): StructuredJudgment {
  return {
    method,
    outcome: "not_applicable",
    performance_score: 0,
    confidence: 0,
    item_count: 0,
    correct_count: 0,
    incorrect_count: 0,
    reasons: ["No deterministic structured judge applied to this probe."],
    cautions: [],
  };
}

function structuredUnjudgeable(args: {
  method: JudgingMethod;
  reason: string;
  caution?: string;
}): StructuredJudgment {
  return {
    method: args.method,
    outcome: "unjudgeable",
    performance_score: 0,
    confidence: 0.12,
    item_count: 0,
    correct_count: 0,
    incorrect_count: 0,
    reasons: [args.reason],
    cautions: args.caution ? [args.caution] : [],
  };
}

function outcomeFromPerformance(score: number): StructuredJudgmentOutcome {
  if (score >= 0.98) return "correct";
  if (score >= 0.45) return "partially_correct";
  return "incorrect";
}

function selectedOptionIds(value: Record<string, unknown> | null): string[] {
  if (!value) return [];

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

function judgeMultipleChoice(input: ContractJudgingInput): StructuredJudgment {
  const schema = getInputSchema(input.probeContractSnapshot);
  const options = asArray(schema.options).map(asRecord);
  const selectedIds = selectedOptionIds(getStructuredEvidenceValue(input));

  if (!options.length) {
    return structuredUnjudgeable({
      method: "deterministic_multiple_choice",
      reason: "Multiple-choice contract did not include options.",
    });
  }

  if (!selectedIds.length) {
    return structuredUnjudgeable({
      method: "deterministic_multiple_choice",
      reason: "No selected option id was available in the submitted evidence.",
    });
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
    return structuredUnjudgeable({
      method: "deterministic_multiple_choice",
      reason: !correctIds.size
        ? "Multiple-choice contract did not mark any option as correct."
        : "Submitted option id did not match any contract option.",
    });
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
      selectedIncorrectCount / Math.max(1, optionIds.size - correctIds.size) * 0.5 -
      missedCorrectCount / Math.max(1, correctIds.size) * 0.25
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
      ? [`Ignored ${invalidSelected.length} submitted option id(s) that were not in the contract.`]
      : [],
  };
}

function submittedOrderingIds(value: Record<string, unknown> | null): string[] {
  if (!value) return [];

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

function judgeOrdering(input: ContractJudgingInput): StructuredJudgment {
  const schema = getInputSchema(input.probeContractSnapshot);
  const items = asArray(schema.items).map(asRecord);
  const submittedIds = submittedOrderingIds(getStructuredEvidenceValue(input));

  if (!items.length) {
    return structuredUnjudgeable({
      method: "deterministic_ordering",
      reason: "Ordering contract did not include items.",
    });
  }

  if (!submittedIds.length) {
    return structuredUnjudgeable({
      method: "deterministic_ordering",
      reason: "No ordering sequence was available in the submitted evidence.",
    });
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
    return structuredUnjudgeable({
      method: "deterministic_ordering",
      reason: "Ordering contract did not include valid item ids.",
    });
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
      ...(missingCount ? [`${missingCount} expected item(s) were missing from the submitted order.`] : []),
      ...(invalidSubmitted.length
        ? [`Ignored ${invalidSubmitted.length} submitted item id(s) that were not in the contract.`]
        : []),
    ],
  };
}

function submittedSliderValue(value: Record<string, unknown> | null): number | null {
  if (!value) return null;

  const candidates = [
    value.slider_value,
    value.sliderValue,
    value.prediction,
    value.predicted_value,
    value.predictedValue,
    value.value,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }

  return null;
}

function judgeSlider(input: ContractJudgingInput): StructuredJudgment {
  const schema = getInputSchema(input.probeContractSnapshot);
  const submitted = submittedSliderValue(getStructuredEvidenceValue(input));
  const acceptableRange = Array.isArray(schema.acceptable_range)
    ? schema.acceptable_range
    : null;
  const targetValue = safeNumber(schema.target_value, NaN);
  const min = safeNumber(schema.min, 0);
  const max = safeNumber(schema.max, 100);

  if (submitted === null) {
    return structuredUnjudgeable({
      method: "deterministic_slider",
      reason: "No slider/prediction value was available in the submitted evidence.",
    });
  }

  if (!acceptableRange && !Number.isFinite(targetValue)) {
    return structuredUnjudgeable({
      method: "deterministic_slider",
      reason: "Slider contract did not include an acceptable range or target value.",
    });
  }

  const lower = acceptableRange
    ? safeNumber(acceptableRange[0], targetValue)
    : targetValue;
  const upper = acceptableRange
    ? safeNumber(acceptableRange[1], targetValue)
    : targetValue;
  const inRange = submitted >= lower && submitted <= upper;
  const totalRange = Math.max(1, Math.abs(max - min));
  const distance = inRange
    ? 0
    : submitted < lower
      ? Math.abs(lower - submitted)
      : Math.abs(submitted - upper);
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
      `Compared submitted value ${submitted} against acceptable range ${lower}–${upper}.`,
    ],
    cautions:
      submitted < min || submitted > max
        ? ["Submitted value fell outside the contract slider bounds."]
        : [],
  };
}

function submittedMatches(value: Record<string, unknown> | null) {
  if (!value) return [];

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

  const matchMap =
    asRecord(value.match_map).constructor === Object
      ? asRecord(value.match_map)
      : asRecord(value.matchMap);

  return Object.entries(matchMap)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([item_id, target_id]) => ({ item_id, target_id }));
}

function judgeDragDrop(input: ContractJudgingInput): StructuredJudgment {
  const schema = getInputSchema(input.probeContractSnapshot);
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
  const submitted = submittedMatches(getStructuredEvidenceValue(input));

  if (!correctMatches.length) {
    return structuredUnjudgeable({
      method: "deterministic_drag_drop",
      reason: "Drag/drop contract did not include correct matches.",
      caution: "This is expected for early scaffold contracts that still use placeholder match schemas.",
    });
  }

  if (!submitted.length) {
    return structuredUnjudgeable({
      method: "deterministic_drag_drop",
      reason: "No drag/drop matches were available in the submitted evidence.",
    });
  }

  const expectedByItem = new Map(
    correctMatches.map((match) => [match.item_id, match.target_id]),
  );
  const submittedByItem = new Map(submitted.map((match) => [match.item_id, match.target_id]));

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

function selectedEdgeIds(value: Record<string, unknown> | null): string[] {
  if (!value) return [];

  return uniqueStrings([
    ...stringArray(value.selected_edge_ids),
    ...stringArray(value.selectedEdgeIds),
    ...stringArray(value.graph_selection),
    ...stringArray(value.graphSelection),
    ...stringArray(value.edges),
  ]);
}

function judgeGraphMatch(input: ContractJudgingInput): StructuredJudgment {
  const schema = getInputSchema(input.probeContractSnapshot);
  const edges = asArray(schema.candidate_edges).map(asRecord);
  const selectedIds = selectedEdgeIds(getStructuredEvidenceValue(input));

  if (!edges.length) {
    return structuredUnjudgeable({
      method: "deterministic_graph_match",
      reason: "Graph-match contract did not include candidate edges.",
      caution: "This is expected for early scaffold contracts that still use placeholder graph schemas.",
    });
  }

  if (!selectedIds.length) {
    return structuredUnjudgeable({
      method: "deterministic_graph_match",
      reason: "No selected graph edge ids were available in the submitted evidence.",
    });
  }

  const correctIds = new Set(
    edges
      .filter((edge) => edge.is_correct === true)
      .map((edge) => edge.edge_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const edgeIds = new Set(
    edges.map((edge) => edge.edge_id).filter((id): id is string => typeof id === "string"),
  );

  if (!correctIds.size) {
    return structuredUnjudgeable({
      method: "deterministic_graph_match",
      reason: "Graph-match contract did not mark any candidate edge as correct.",
    });
  }

  const validSelected = selectedIds.filter((id) => edgeIds.has(id));
  const selectedCorrect = validSelected.filter((id) => correctIds.has(id)).length;
  const selectedIncorrect = validSelected.length - selectedCorrect;
  const missedCorrect = [...correctIds].filter((id) => !validSelected.includes(id)).length;
  const performanceScore = clamp01(
    selectedCorrect / Math.max(1, correctIds.size) -
      selectedIncorrect / Math.max(1, edgeIds.size - correctIds.size) * 0.45 -
      missedCorrect / Math.max(1, correctIds.size) * 0.2,
  );

  return {
    method: "deterministic_graph_match",
    outcome: outcomeFromPerformance(performanceScore),
    performance_score: performanceScore,
    confidence: 0.88,
    item_count: correctIds.size,
    correct_count: selectedCorrect,
    incorrect_count: selectedIncorrect + missedCorrect,
    reasons: [
      `Compared ${validSelected.length} selected edge(s) against ${correctIds.size} correct edge(s).`,
      `${selectedCorrect} selected edge(s) were correct.`,
    ],
    cautions: selectedIds.length !== validSelected.length
      ? ["Some selected edge ids were not present in the graph contract."]
      : [],
  };
}

function runStructuredJudge(input: ContractJudgingInput): StructuredJudgment | null {
  const rendererKind = getRendererKind(input.probeContractSnapshot);

  switch (rendererKind) {
    case "multiple_choice":
      return judgeMultipleChoice(input);
    case "ordering":
      return judgeOrdering(input);
    case "slider_prediction":
      return judgeSlider(input);
    case "drag_drop_match":
      return judgeDragDrop(input);
    case "graph_match":
      return judgeGraphMatch(input);
    default:
      return null;
  }
}

function isUsableStructuredJudgment(
  judgment: StructuredJudgment | null,
): judgment is StructuredJudgment {
  return (
    judgment !== null &&
    judgment.outcome !== "not_applicable" &&
    judgment.outcome !== "unjudgeable" &&
    judgment.confidence > 0
  );
}

function interpretationSuccessBase(input: ContractJudgingInput) {
  const interpretation = input.attemptInterpretation;
  const coherence = safeNumber(interpretation.features.conceptual_coherence, 0);
  const discrimination = safeNumber(
    interpretation.features.discrimination_accuracy,
    0,
  );
  const prediction = safeNumber(interpretation.features.prediction_accuracy, 0);
  const procedure = safeNumber(
    interpretation.features.procedure_order_quality,
    0,
  );
  const representation = safeNumber(
    interpretation.features.representation_quality,
    0,
  );

  const strongestFeature = Math.max(
    coherence,
    discrimination,
    prediction,
    procedure,
    representation,
  );

  const outcomeBoost =
    interpretation.outcome === "strong_evidence"
      ? 0.16
      : interpretation.outcome === "partial_evidence"
        ? 0.08
        : interpretation.outcome === "weak_evidence"
          ? -0.06
          : -0.18;

  return clamp01(
    interpretation.evidence_strength * 0.48 +
      interpretation.judgment_confidence * 0.28 +
      strongestFeature * 0.2 +
      outcomeBoost,
  );
}

function interpretationFailureBase(input: ContractJudgingInput) {
  const interpretation = input.attemptInterpretation;
  const confusion = safeNumber(interpretation.model_signals_used.confusion, 0.5);
  const insight = safeNumber(interpretation.model_signals_used.insight, 0.35);
  const evidenceWeakness = 1 - interpretation.evidence_strength;
  const confidence = interpretation.judgment_confidence;

  const outcomeBoost =
    interpretation.outcome === "no_evidence"
      ? 0.38
      : interpretation.outcome === "uninterpretable"
        ? 0.32
        : interpretation.outcome === "weak_evidence"
          ? 0.2
          : interpretation.outcome === "partial_evidence"
            ? 0.08
            : -0.08;

  return clamp01(
    evidenceWeakness * 0.38 +
      confusion * 0.22 +
      (1 - insight) * 0.18 +
      confidence * 0.08 +
      outcomeBoost,
  );
}

function applyStructuredSuccess(
  estimatedScore: number,
  structuredJudgment: StructuredJudgment | null,
) {
  if (!isUsableStructuredJudgment(structuredJudgment)) return estimatedScore;

  return clamp01(
    structuredJudgment.performance_score * 0.72 +
      estimatedScore * 0.18 +
      structuredJudgment.confidence * 0.1,
  );
}

function applyStructuredFailure(
  estimatedScore: number,
  structuredJudgment: StructuredJudgment | null,
) {
  if (!isUsableStructuredJudgment(structuredJudgment)) return estimatedScore;

  return clamp01(
    (1 - structuredJudgment.performance_score) * 0.76 +
      estimatedScore * 0.16 +
      structuredJudgment.confidence * 0.08,
  );
}

function buildSuccessMarkerMatches(
  input: ContractJudgingInput,
  structuredJudgment: StructuredJudgment | null,
): ContractMarkerMatch[] {
  const markers = getSuccessMarkers(input.probeContractSnapshot);
  const base = interpretationSuccessBase(input);
  const evidenceText = getEvidenceText(input);

  return markers.map((marker) => {
    const record = asRecord(marker);
    const label = typeof record.label === "string" ? record.label : "Success marker";
    const description =
      typeof record.description === "string" ? record.description : null;
    const weight = clamp01(safeNumber(record.weight, 0.25));
    const required = record.required === true;
    const textBonus =
      description && evidenceText
        ? textIncludesAny(evidenceText, description.split(/\s+/).slice(0, 5))
          ? 0.08
          : 0
        : 0;

    const estimatedMatchScore = clamp01(base * 0.88 + weight * 0.12 + textBonus);
    const matchScore = applyStructuredSuccess(estimatedMatchScore, structuredJudgment);

    return {
      marker_id: typeof record.marker_id === "string" ? record.marker_id : null,
      label,
      description,
      match_score: matchScore,
      weight,
      required,
      reasons: [
        isUsableStructuredJudgment(structuredJudgment)
          ? `Marker score was anchored by deterministic structured performance ${structuredJudgment.performance_score.toFixed(
              2,
            )}.`
          : `Marker estimated from evidence strength ${input.attemptInterpretation.evidence_strength.toFixed(
              2,
            )}.`,
        `Judgment confidence was ${input.attemptInterpretation.judgment_confidence.toFixed(
          2,
        )}.`,
      ],
    };
  });
}

function buildFailureMarkerMatches(
  input: ContractJudgingInput,
  structuredJudgment: StructuredJudgment | null,
): ContractFailureMatch[] {
  const markers = getFailureMarkers(input.probeContractSnapshot);
  const base = interpretationFailureBase(input);

  return markers.map((marker) => {
    const record = asRecord(marker);
    const label = typeof record.label === "string" ? record.label : "Failure marker";
    const description =
      typeof record.description === "string" ? record.description : null;
    const severity = clamp01(safeNumber(record.severity, 0.5));
    const diagnosis = isDiagnosisType(record.maps_to_diagnosis)
      ? record.maps_to_diagnosis
      : null;
    const diagnosisDelta = normalizeDiagnosisDelta(record.diagnosis_delta);
    const estimatedMatchScore = clamp01(base * 0.8 + severity * 0.2);
    const matchScore = applyStructuredFailure(estimatedMatchScore, structuredJudgment);

    return {
      marker_id: typeof record.marker_id === "string" ? record.marker_id : null,
      label,
      description,
      match_score: matchScore,
      severity,
      maps_to_diagnosis: diagnosis,
      diagnosis_delta: diagnosisDelta,
      reasons: [
        isUsableStructuredJudgment(structuredJudgment)
          ? `Failure score was anchored by deterministic structured error rate ${(
              1 - structuredJudgment.performance_score
            ).toFixed(2)}.`
          : `Failure estimate used evidence weakness ${(1 - input.attemptInterpretation.evidence_strength).toFixed(
              2,
            )}.`,
        diagnosis
          ? `Failure marker maps to ${diagnosis}.`
          : "Failure marker did not provide a valid diagnosis mapping.",
      ],
    };
  });
}

function buildMisconceptionMatches(
  input: ContractJudgingInput,
  failureMatches: ContractFailureMatch[],
): ContractMisconceptionMatch[] {
  const mappings = getMisconceptionMappings(input.probeContractSnapshot);

  return mappings.map((mapping) => {
    const record = asRecord(mapping);
    const label =
      typeof record.label === "string" ? record.label : "Possible misconception";
    const description =
      typeof record.description === "string" ? record.description : null;
    const diagnosis = isDiagnosisType(record.likely_diagnosis)
      ? record.likely_diagnosis
      : null;

    const failureMarkerIds = new Set(
      asArray(record.failure_marker_ids).filter(
        (id): id is EntityId => typeof id === "string",
      ),
    );

    const relatedFailures = failureMatches.filter(
      (failure) => failure.marker_id && failureMarkerIds.has(failure.marker_id),
    );

    const relatedScore = relatedFailures.length
      ? relatedFailures.reduce((sum, failure) => sum + failure.match_score, 0) /
        relatedFailures.length
      : 0;

    const matchScore = clamp01(
      relatedScore * 0.82 +
        input.attemptInterpretation.evidence_strength * 0.04 +
        input.attemptInterpretation.judgment_confidence * 0.06,
    );

    return {
      misconception_id:
        typeof record.misconception_id === "string"
          ? record.misconception_id
          : null,
      label,
      description,
      likely_diagnosis: diagnosis,
      match_score: matchScore,
      reasons: [
        relatedFailures.length
          ? `Matched through ${relatedFailures.length} related failure marker(s).`
          : "No related failure markers were strongly matched yet.",
      ],
    };
  });
}

function averageWeightedSuccess(matches: ContractMarkerMatch[]) {
  if (!matches.length) return 0;

  const weightTotal = matches.reduce((sum, match) => sum + match.weight, 0);
  if (weightTotal <= 0) {
    return matches.reduce((sum, match) => sum + match.match_score, 0) / matches.length;
  }

  return matches.reduce(
    (sum, match) => sum + match.match_score * match.weight,
    0,
  ) / weightTotal;
}

function averageSeverityFailure(matches: ContractFailureMatch[]) {
  if (!matches.length) return 0;

  const severityTotal = matches.reduce((sum, match) => sum + match.severity, 0);
  if (severityTotal <= 0) {
    return matches.reduce((sum, match) => sum + match.match_score, 0) / matches.length;
  }

  return matches.reduce(
    (sum, match) => sum + match.match_score * match.severity,
    0,
  ) / severityTotal;
}

function averageMisconception(matches: ContractMisconceptionMatch[]) {
  if (!matches.length) return 0;

  return matches.reduce((sum, match) => sum + match.match_score, 0) / matches.length;
}

function deriveOutcome(args: {
  hasContract: boolean;
  successScore: number;
  failureScore: number;
  evidenceStrength: number;
}): ContractJudgmentOutcome {
  if (!args.hasContract) return "no_contract";
  if (args.evidenceStrength < 0.18) return "insufficient_evidence";

  if (args.successScore >= 0.68 && args.successScore >= args.failureScore + 0.12) {
    return "contract_success";
  }

  if (args.failureScore >= 0.62 && args.failureScore >= args.successScore + 0.1) {
    return "contract_failure";
  }

  return "contract_partial";
}

function deriveContractDiagnosisDelta(args: {
  outcome: ContractJudgmentOutcome;
  failureMatches: ContractFailureMatch[];
  attemptDiagnosisDelta: DiagnosisDelta;
  failureScore: number;
  misconceptionScore: number;
}) {
  let delta = args.attemptDiagnosisDelta;

  if (args.outcome === "contract_success") {
    return scaleDiagnosisDelta(delta, 0.35);
  }

  for (const failure of args.failureMatches) {
    const weight = clamp01(
      failure.match_score * 0.5 + failure.severity * 0.3 + args.failureScore * 0.2,
    );
    delta = mergeDiagnosisDeltas(delta, failure.diagnosis_delta, weight);
  }

  if (args.outcome === "insufficient_evidence") {
    delta = mergeDiagnosisDeltas(delta, {
      ...emptyDelta(),
      representation_gap: 0.08,
      recall_gap: 0.05,
    });
  }

  if (args.misconceptionScore > 0.5) {
    const dominant = getDominantDiagnosis(delta) ?? "representation_gap";
    delta = mergeDiagnosisDeltas(delta, {
      ...emptyDelta(),
      [dominant]: 0.06,
    });
  }

  return delta;
}

function deriveResolutionDelta(args: {
  outcome: ContractJudgmentOutcome;
  successScore: number;
  contractConfidence: number;
  targetDiagnosis: DiagnosisType | null;
  diagnosisDelta: DiagnosisDelta;
}) {
  if (args.outcome !== "contract_success" && args.outcome !== "contract_partial") {
    return emptyDelta();
  }

  const diagnosisToResolve =
    args.targetDiagnosis ?? getDominantDiagnosis(args.diagnosisDelta);

  if (!diagnosisToResolve) return emptyDelta();

  const outcomeMultiplier = args.outcome === "contract_success" ? 1 : 0.32;
  const amount = clamp01(args.successScore * args.contractConfidence * 0.42 * outcomeMultiplier);

  return {
    ...emptyDelta(),
    [diagnosisToResolve]: amount,
  };
}

function deriveEvidenceTier(args: {
  hasContract: boolean;
  structuredJudgment: StructuredJudgment | null;
}) : EvidenceJudgingTier {
  if (isUsableStructuredJudgment(args.structuredJudgment)) {
    return "deterministic_structured_judgment";
  }

  if (args.hasContract) return "contract_marker_estimate";

  return "generic_attempt_interpretation";
}

function deriveJudgingMethods(args: {
  hasContract: boolean;
  structuredJudgment: StructuredJudgment | null;
}): JudgingMethod[] {
  const methods: JudgingMethod[] = [];

  if (isUsableStructuredJudgment(args.structuredJudgment)) {
    methods.push(args.structuredJudgment.method);
  }

  if (args.hasContract) methods.push("contract_marker_estimate");
  if (!methods.length) methods.push("generic_attempt_interpretation");

  return uniqueStrings(methods) as JudgingMethod[];
}

export function judgeProbeAttemptAgainstContract(
  input: ContractJudgingInput,
): ContractJudgment {
  const judgedAt = input.judgedAt ?? nowIso();
  const contract = input.probeContractSnapshot ?? null;
  const hasContract = Boolean(contract);

  const structuredJudgment = runStructuredJudge(input);
  const successMarkerMatches = buildSuccessMarkerMatches(input, structuredJudgment);
  const failureMarkerMatches = buildFailureMarkerMatches(input, structuredJudgment);
  const misconceptionMatches = buildMisconceptionMatches(
    input,
    failureMarkerMatches,
  );

  const successScore = clamp01(averageWeightedSuccess(successMarkerMatches));
  const failureScore = clamp01(averageSeverityFailure(failureMarkerMatches));
  const misconceptionScore = clamp01(averageMisconception(misconceptionMatches));
  const evidenceStrength = clamp01(input.attemptInterpretation.evidence_strength);

  const outcome = deriveOutcome({
    hasContract,
    successScore,
    failureScore,
    evidenceStrength,
  });

  const diagnosisDelta = deriveContractDiagnosisDelta({
    outcome,
    failureMatches: failureMarkerMatches,
    attemptDiagnosisDelta: input.attemptInterpretation.diagnosis_delta,
    failureScore,
    misconceptionScore,
  });

  const suggestedActiveDiagnosis = getDominantDiagnosis(diagnosisDelta);

  const structuredConfidence = isUsableStructuredJudgment(structuredJudgment)
    ? structuredJudgment?.confidence ?? 0
    : 0;

  const contractConfidence = clamp01(
    input.attemptInterpretation.judgment_confidence * 0.34 +
      evidenceStrength * 0.18 +
      Math.abs(successScore - failureScore) * 0.18 +
      structuredConfidence * 0.18 +
      (hasContract ? 0.12 : 0),
  );

  const resolutionDelta = deriveResolutionDelta({
    outcome,
    successScore,
    contractConfidence,
    targetDiagnosis: getTargetDiagnosis(contract),
    diagnosisDelta,
  });

  const evidenceTier = deriveEvidenceTier({
    hasContract,
    structuredJudgment,
  });

  const judgingMethods = deriveJudgingMethods({
    hasContract,
    structuredJudgment,
  });

  const cautions: string[] = [];

  if (!hasContract) {
    cautions.push("No probe contract snapshot was available, so contract judging could not run fully.");
  }

  if (!input.normalizedEvidence) {
    cautions.push("No normalized evidence was provided, so deterministic answer-aware judging could not inspect the raw submitted response.");
  }

  if (!successMarkerMatches.length) {
    cautions.push("No success markers were available on the probe contract.");
  }

  if (!failureMarkerMatches.length) {
    cautions.push("No failure markers were available on the probe contract.");
  }

  if (structuredJudgment?.outcome === "unjudgeable") {
    cautions.push(...structuredJudgment.cautions);
  }

  cautions.push(
    "Contract Judging V1.1 still uses scaffold marker estimation when deterministic structured judging is unavailable. Rubric/model judging should be added for open-ended responses.",
  );

  return {
    version: CONTRACT_JUDGING_VERSION,
    judged_at: judgedAt,

    contract_id: getContractId(contract),
    probe_id: input.attemptInterpretation.linked_probe_id,
    topic_id: input.attemptInterpretation.linked_topic_id,

    outcome,
    contract_confidence: contractConfidence,
    evidence_strength: evidenceStrength,
    evidence_tier: evidenceTier,
    judging_methods: judgingMethods,

    success_score: successScore,
    failure_score: failureScore,
    misconception_score: misconceptionScore,

    success_marker_matches: successMarkerMatches,
    failure_marker_matches: failureMarkerMatches,
    misconception_matches: misconceptionMatches,

    diagnosis_delta: diagnosisDelta,
    resolution_delta: resolutionDelta,
    suggested_active_diagnosis: suggestedActiveDiagnosis,

    structured_judgment: structuredJudgment ?? structuredNotApplicable(),
    rubric_judgment: null,

    reasons: [
      hasContract
        ? `Judged attempt against probe contract ${getContractId(contract) ?? "unknown"}.`
        : "No probe contract snapshot was available.",
      `Judging methods: ${judgingMethods.join(", ")}.`,
      `Evidence tier: ${evidenceTier}.`,
      `Contract success score was ${successScore.toFixed(2)}.`,
      `Contract failure score was ${failureScore.toFixed(2)}.`,
      `Outcome was ${outcome}.`,
    ],
    cautions,

    evidence_interpretation_snapshot: input.attemptInterpretation,
  };
}
