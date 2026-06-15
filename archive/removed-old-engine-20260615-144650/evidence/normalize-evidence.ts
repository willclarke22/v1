import type { EntityId, NewAttemptInput } from "@/types/contracts";
import type {
  EvidenceCompletion,
  EvidenceModality,
  EvidenceSourceKind,
  NormalizedEvidenceInput,
  NormalizedEvidenceValue,
} from "./evidence-types";

function normalizeCompletion(
  completion: NewAttemptInput["completion_status"],
): EvidenceCompletion {
  if (
    completion === "complete" ||
    completion === "partial" ||
    completion === "skipped" ||
    completion === "abandoned" ||
    completion === "unclear"
  ) {
    return completion;
  }

  return "unclear";
}

function normalizeSourceKind(attempt: NewAttemptInput): EvidenceSourceKind {
  if (attempt.linked_probe_id) return "probe_attempt";
  if (attempt.source_message_id) return "message";
  return "unknown";
}

function normalizeModality(attempt: NewAttemptInput): EvidenceModality {
  const responseType = attempt.response_type;
  const deliveryModality = attempt.delivery_context?.modality ?? null;
  const rendererType = attempt.delivery_context?.renderer_type ?? null;

  if (responseType === "choice") return "choice";
  if (responseType === "multiple_choice") return "multiple_choice";
  if (responseType === "ordering") return "ordering";
  if (responseType === "classify") return "classification";
  if (responseType === "predict") return "prediction";
  if (responseType === "audio") return "audio";
  if (responseType === "video") return "video";
  if (responseType === "interactive_action") return "interactive_action";
  if (responseType === "dynamic_task") return "simulation";
  if (responseType === "text" || responseType === "transform") return "text";

  if (deliveryModality === "audio") return "audio";
  if (deliveryModality === "video") return "video";
  if (deliveryModality === "interactive") return "interactive_action";
  if (deliveryModality === "text") return "text";

  if (rendererType?.includes("drag")) return "drag_drop";
  if (rendererType?.includes("slider")) return "slider";
  if (rendererType?.includes("graph")) return "interactive_action";

  if (attempt.raw_response === null) return "none";

  return "unknown";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeTextValue(text: string): NormalizedEvidenceValue {
  const trimmed = text.trim();
  const wordCount = trimmed.length
    ? trimmed.split(/\s+/).filter(Boolean).length
    : 0;

  return {
    kind: "text",
    text: trimmed,
    word_count: wordCount,
    character_count: trimmed.length,
  };
}

function readStringCandidate(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function readStringArrayCandidate(record: Record<string, unknown>, keys: string[]): string[] {
  const values: string[] = [];

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      values.push(value.trim());
    }

    values.push(...stringArray(value));
  }

  return uniqueStrings(values);
}

function normalizeChoiceValue(raw: NewAttemptInput["raw_response"]): NormalizedEvidenceValue {
  if (typeof raw === "string") {
    return {
      kind: "choice",
      selected_option_ids: [raw].filter(Boolean),
      selected_labels: [],
      raw_value: raw,
    };
  }

  const record = asRecord(raw);
  if (!record) {
    return {
      kind: "choice",
      selected_option_ids: [],
      selected_labels: [],
      raw_value: raw,
    };
  }

  return {
    kind: "choice",
    selected_option_ids: readStringArrayCandidate(record, [
      "selected_option_ids",
      "selectedOptionIds",
      "selected_option_id",
      "selectedOptionId",
      "choice_selected",
      "choiceSelected",
      "selected_choices",
      "selectedChoices",
      "option_id",
      "choice_id",
    ]),
    selected_labels: readStringArrayCandidate(record, [
      "selected_labels",
      "selectedLabels",
      "selected_label",
      "selectedLabel",
      "label",
      "choice_label",
      "choiceLabel",
    ]),
    raw_value: raw,
  };
}

function normalizeOrderingValue(raw: NewAttemptInput["raw_response"]): NormalizedEvidenceValue {
  if (Array.isArray(raw)) {
    return {
      kind: "ordering",
      ordered_item_ids: stringArray(raw),
      raw_value: raw,
    };
  }

  const record = asRecord(raw);
  if (!record) {
    return {
      kind: "ordering",
      ordered_item_ids: [],
      raw_value: raw,
    };
  }

  return {
    kind: "ordering",
    ordered_item_ids: readStringArrayCandidate(record, [
      "ordering_sequence",
      "orderingSequence",
      "ordered_item_ids",
      "orderedItemIds",
      "sequence",
      "item_order",
      "itemOrder",
    ]),
    raw_value: raw,
  };
}

function normalizeSliderValue(raw: NewAttemptInput["raw_response"]): NormalizedEvidenceValue {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return {
      kind: "slider",
      value: raw,
      raw_value: raw,
    };
  }

  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    return {
      kind: "slider",
      value: Number.isFinite(parsed) ? parsed : null,
      raw_value: raw,
    };
  }

  const record = asRecord(raw);
  if (!record) {
    return {
      kind: "slider",
      value: null,
      raw_value: raw,
    };
  }

  const candidates = [
    record.slider_value,
    record.sliderValue,
    record.prediction,
    record.predicted_value,
    record.predictedValue,
    record.value,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return {
        kind: "slider",
        value: candidate,
        raw_value: raw,
      };
    }

    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return {
          kind: "slider",
          value: parsed,
          raw_value: raw,
        };
      }
    }
  }

  return {
    kind: "slider",
    value: null,
    raw_value: raw,
  };
}

function normalizeMatchArray(value: unknown): Array<{ item_id: EntityId; target_id: EntityId }> {
  return asArray(value)
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .map((record) => {
      const itemId =
        readStringCandidate(record, ["item_id", "itemId", "source_id", "sourceId"]) ?? "";
      const targetId =
        readStringCandidate(record, ["target_id", "targetId", "drop_target_id", "dropTargetId"]) ?? "";

      return {
        item_id: itemId,
        target_id: targetId,
      };
    })
    .filter((match) => match.item_id.length > 0 && match.target_id.length > 0);
}

function normalizeDragDropValue(raw: NewAttemptInput["raw_response"]): NormalizedEvidenceValue {
  const record = asRecord(raw);

  if (!record) {
    return {
      kind: "drag_drop",
      matches: [],
      raw_value: raw,
    };
  }

  const directMatches =
    normalizeMatchArray(record.matches).length > 0
      ? normalizeMatchArray(record.matches)
      : normalizeMatchArray(record.drag_drop_positions).length > 0
        ? normalizeMatchArray(record.drag_drop_positions)
        : normalizeMatchArray(record.dragDropPositions);

  if (directMatches.length) {
    return {
      kind: "drag_drop",
      matches: directMatches,
      raw_value: raw,
    };
  }

  const matchMap = asRecord(record.match_map) ?? asRecord(record.matchMap) ?? {};
  const matches = Object.entries(matchMap)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([item_id, target_id]) => ({ item_id, target_id }));

  return {
    kind: "drag_drop",
    matches,
    raw_value: raw,
  };
}

function normalizeGraphMatchValue(raw: NewAttemptInput["raw_response"]): NormalizedEvidenceValue {
  const record = asRecord(raw);

  if (!record) {
    return {
      kind: "graph_match",
      selected_edge_ids: [],
      raw_value: raw,
    };
  }

  return {
    kind: "graph_match",
    selected_edge_ids: readStringArrayCandidate(record, [
      "selected_edge_ids",
      "selectedEdgeIds",
      "graph_selection",
      "graphSelection",
      "edges",
    ]),
    raw_value: raw,
  };
}

function normalizeClassificationValue(raw: NewAttemptInput["raw_response"]): NormalizedEvidenceValue {
  if (typeof raw === "string") {
    return {
      kind: "classification",
      selected_label: raw.trim() || null,
      labels_by_item_id: {},
      raw_value: raw,
    };
  }

  const record = asRecord(raw);
  if (!record) {
    return {
      kind: "classification",
      selected_label: null,
      labels_by_item_id: {},
      raw_value: raw,
    };
  }

  const labelsMap =
    asRecord(record.labels_by_item_id) ??
    asRecord(record.labelsByItemId) ??
    asRecord(record.classifications) ??
    {};

  const labels_by_item_id = Object.fromEntries(
    Object.entries(labelsMap).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  return {
    kind: "classification",
    selected_label: readStringCandidate(record, [
      "selected_label",
      "selectedLabel",
      "label",
      "classification",
      "class",
    ]),
    labels_by_item_id,
    raw_value: raw,
  };
}

function normalizeInteractionValue(raw: NewAttemptInput["raw_response"]): NormalizedEvidenceValue {
  const record = asRecord(raw);

  if (!record) {
    return {
      kind: "interaction",
      action_count: 0,
      actions: [],
      final_state: null,
      raw_value: raw,
    };
  }

  const actions =
    asArray(record.actions).length > 0
      ? asArray(record.actions)
      : asArray(record.simulation_actions).length > 0
        ? asArray(record.simulation_actions)
        : asArray(record.simulationActions);

  return {
    kind: "interaction",
    action_count: actions.length,
    actions,
    final_state: asRecord(record.final_state) ?? asRecord(record.finalState),
    raw_value: raw,
  };
}

function normalizeStructuredValue(raw: NewAttemptInput["raw_response"]): NormalizedEvidenceValue {
  const record = asRecord(raw);

  if (!record) {
    return {
      kind: "none",
      value: null,
    };
  }

  return {
    kind: "structured",
    value: record,
    keys: Object.keys(record).sort(),
  };
}

function normalizeRawValue(
  raw: NewAttemptInput["raw_response"],
  modality: EvidenceModality,
): NormalizedEvidenceValue {
  if (typeof raw === "string" && modality === "text") {
    return normalizeTextValue(raw);
  }

  if (typeof raw === "string" && raw.trim() && modality === "unknown") {
    return normalizeTextValue(raw);
  }

  switch (modality) {
    case "choice":
    case "multiple_choice":
      return normalizeChoiceValue(raw);
    case "ordering":
      return normalizeOrderingValue(raw);
    case "slider":
    case "prediction":
      return normalizeSliderValue(raw);
    case "drag_drop":
      return normalizeDragDropValue(raw);
    case "classification":
      return normalizeClassificationValue(raw);
    case "interactive_action":
      return normalizeDragDropValue(raw);
    case "simulation":
      return normalizeInteractionValue(raw);
    case "text":
    case "audio":
    case "video":
      return typeof raw === "string" ? normalizeTextValue(raw) : normalizeStructuredValue(raw);
    case "mixed":
    case "unknown":
      if (typeof raw === "string") return normalizeTextValue(raw);
      return normalizeStructuredValue(raw);
    case "none":
    default:
      return {
        kind: "none",
        value: null,
      };
  }
}

function evidenceValueIsEmpty(value: NormalizedEvidenceValue) {
  switch (value.kind) {
    case "text":
      return value.character_count === 0;
    case "choice":
      return value.selected_option_ids.length === 0 && value.selected_labels.length === 0;
    case "ordering":
      return value.ordered_item_ids.length === 0;
    case "slider":
      return value.value === null;
    case "drag_drop":
      return value.matches.length === 0;
    case "graph_match":
      return value.selected_edge_ids.length === 0;
    case "classification":
      return (
        value.selected_label === null &&
        Object.keys(value.labels_by_item_id).length === 0
      );
    case "interaction":
      return value.action_count === 0 && value.final_state === null;
    case "structured":
      return value.keys.length === 0;
    case "none":
      return true;
  }
}

export function normalizeAttemptEvidence(
  attempt: NewAttemptInput,
): NormalizedEvidenceInput {
  const modality = normalizeModality(attempt);
  const value = normalizeRawValue(attempt.raw_response, modality);
  const inferredCompletion = evidenceValueIsEmpty(value)
    ? "skipped"
    : normalizeCompletion(attempt.completion_status);

  return {
    evidence_id: attempt.attempt_id,
    timestamp: attempt.timestamp,

    source_kind: normalizeSourceKind(attempt),
    linked_topic_id: attempt.linked_topic_id,
    linked_probe_id: attempt.linked_probe_id,

    response_type: attempt.response_type,
    expected_response_type: undefined,
    probe_type: undefined,

    modality,
    completion: inferredCompletion,

    value,

    delivery_context: attempt.delivery_context,
    submission_metadata: attempt.submission_metadata,

    raw_attempt: attempt,
  };
}
