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
  if (value.kind === "graph_match") return { ...value, ...asRecord(value.value) };

  return asRecord((value.value as unknown) ?? value);
}

function structuredUnjudgeable(reason: string, caution?: string): StructuredJudgment {
  return {
    method: "deterministic_graph_match",
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

function selectedEdgeIds(value: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...stringArray(value.selected_edge_ids),
    ...stringArray(value.selectedEdgeIds),
    ...stringArray(value.graph_selection),
    ...stringArray(value.graphSelection),
    ...stringArray(value.edges),
  ]);
}

export function judgeGraphMatch(input: ContractJudgingInput): StructuredJudgment {
  const schema = getInputSchema(input);
  const edges = asArray(schema.candidate_edges).map(asRecord);
  const selectedIds = selectedEdgeIds(getStructuredEvidenceRecord(input));

  if (!edges.length) {
    return structuredUnjudgeable(
      "Graph-match contract did not include candidate edges.",
      "This is expected for early scaffold contracts that still use placeholder graph schemas.",
    );
  }

  if (!selectedIds.length) {
    return structuredUnjudgeable(
      "No selected graph edge ids were available in the submitted evidence.",
    );
  }

  const correctIds = new Set(
    edges
      .filter((edge) => edge.is_correct === true)
      .map((edge) => edge.edge_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const edgeIds = new Set(
    edges
      .map((edge) => edge.edge_id)
      .filter((id): id is string => typeof id === "string"),
  );

  if (!correctIds.size) {
    return structuredUnjudgeable(
      "Graph-match contract did not mark any candidate edge as correct.",
    );
  }

  const validSelected = selectedIds.filter((id) => edgeIds.has(id));
  const selectedCorrect = validSelected.filter((id) => correctIds.has(id)).length;
  const selectedIncorrect = validSelected.length - selectedCorrect;
  const missedCorrect = [...correctIds].filter((id) => !validSelected.includes(id)).length;
  const performanceScore = clamp01(
    selectedCorrect / Math.max(1, correctIds.size) -
      (selectedIncorrect / Math.max(1, edgeIds.size - correctIds.size)) * 0.45 -
      (missedCorrect / Math.max(1, correctIds.size)) * 0.2,
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
    cautions:
      selectedIds.length !== validSelected.length
        ? ["Some selected edge ids were not present in the graph contract."]
        : [],
  };
}
