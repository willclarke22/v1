import type { NewAttemptInput } from "@/types/contracts";
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

  if (attempt.raw_response === null) return "none";

  return "unknown";
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

function normalizeRawValue(raw: NewAttemptInput["raw_response"]): NormalizedEvidenceValue {
  if (typeof raw === "string") {
    return normalizeTextValue(raw);
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return {
      kind: "structured",
      value: raw,
      keys: Object.keys(raw).sort(),
    };
  }

  return {
    kind: "none",
    value: null,
  };
}

export function normalizeAttemptEvidence(
  attempt: NewAttemptInput,
): NormalizedEvidenceInput {
  const value = normalizeRawValue(attempt.raw_response);
  const inferredCompletion =
    value.kind === "none" ||
    (value.kind === "text" && value.character_count === 0)
      ? "skipped"
      : normalizeCompletion(attempt.completion_status);

  return {
    evidence_id: attempt.attempt_id,
    timestamp: attempt.timestamp,

    source_kind: normalizeSourceKind(attempt),
    linked_topic_id: attempt.linked_topic_id,
    linked_probe_id: attempt.linked_probe_id,

    response_type: attempt.response_type,
    modality: normalizeModality(attempt),
    completion: inferredCompletion,

    value,

    delivery_context: attempt.delivery_context,
    submission_metadata: attempt.submission_metadata,

    raw_attempt: attempt,
  };
}
