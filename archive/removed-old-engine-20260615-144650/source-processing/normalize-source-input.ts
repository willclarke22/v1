import { makeId } from "@/lib/utils/ids";
import type {
  LearningSourceRightsScope,
  LearningSourceTrustLevel,
} from "@/types/contracts";
import {
  SOURCE_PROCESSING_VERSION,
  type NormalizeSourceInputOptions,
  type NormalizeSourceInputResult,
  type NormalizedLearningSourceChunk,
  type RawLearningSourceInput,
} from "./source-types";

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function normalizeTitle(input: RawLearningSourceInput) {
  const title = input.title?.trim();
  if (title) return title;

  if (input.origin_label?.trim()) return input.origin_label.trim();

  return "Untitled learning source";
}

function normalizeTopicLabels(labels: string[] | null | undefined) {
  return [...new Set((labels ?? []).map((label) => label.trim()).filter(Boolean))];
}

function defaultTrustLevel(
  input: RawLearningSourceInput,
): LearningSourceTrustLevel {
  if (input.trust_level) return input.trust_level;

  switch (input.source_kind) {
    case "human_reviewed_reference":
      return "human_reviewed";
    case "trusted_public_reference":
      return "trusted_public";
    case "course_material":
    case "uploaded_document":
      return "user_provided";
    case "manual_notes":
      return "learner_notes";
    case "web_excerpt":
      return "unverified_public";
    case "generated_text":
      return "model_generated";
    case "unknown":
    default:
      return "unknown";
  }
}

function defaultRightsScope(
  input: RawLearningSourceInput,
): LearningSourceRightsScope {
  if (input.rights_scope) return input.rights_scope;

  switch (input.source_kind) {
    case "uploaded_document":
    case "course_material":
    case "manual_notes":
      return "user_uploaded_private";
    case "trusted_public_reference":
    case "web_excerpt":
      return "public_reference";
    case "human_reviewed_reference":
      return "internal_reviewed";
    case "generated_text":
      return "generated_ephemeral";
    case "unknown":
    default:
      return "unknown";
  }
}

function confidenceForTrustLevel(trustLevel: LearningSourceTrustLevel) {
  switch (trustLevel) {
    case "human_reviewed":
      return 0.92;
    case "trusted_public":
      return 0.78;
    case "user_provided":
      return 0.68;
    case "learner_notes":
      return 0.52;
    case "unverified_public":
      return 0.42;
    case "model_generated":
      return 0.34;
    case "unknown":
    default:
      return 0.24;
  }
}

function canUseForStrongClaims(args: {
  trustLevel: LearningSourceTrustLevel;
  rightsScope: LearningSourceRightsScope;
}) {
  if (args.trustLevel === "human_reviewed") return true;
  if (args.trustLevel === "trusted_public") return true;

  /**
   * User-provided course/uploaded material can ground personalized probes, but
   * it should not automatically support strong correctness claims until the
   * relevant source chunks/probe answers are reviewed or cross-checked.
   */
  return false;
}

function splitIntoChunks(text: string, maxChunkChars: number, minChunkChars: number) {
  if (text.length <= maxChunkChars) return [text];

  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if ((current + "\n\n" + paragraph).length <= maxChunkChars) {
      current = `${current}\n\n${paragraph}`;
      continue;
    }

    if (current.length >= minChunkChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = `${current}\n\n${paragraph}`;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChunkChars * 1.25) return [chunk];

    const pieces: string[] = [];
    for (let index = 0; index < chunk.length; index += maxChunkChars) {
      pieces.push(chunk.slice(index, index + maxChunkChars).trim());
    }
    return pieces.filter(Boolean);
  });
}

export function normalizeSourceInput(
  input: RawLearningSourceInput,
  options: NormalizeSourceInputOptions = {},
): NormalizeSourceInputResult {
  const text = cleanText(input.text);
  const sourceId = input.source_id ?? makeId("learning-source");
  const sourceTitle = normalizeTitle(input);
  const topicLabels = normalizeTopicLabels(input.topic_labels);
  const rightsScope = defaultRightsScope(input);
  const trustLevel = defaultTrustLevel(input);
  const confidence = confidenceForTrustLevel(trustLevel);
  const maxChunkChars = Math.max(400, options.max_chunk_chars ?? 1800);
  const minChunkChars = Math.max(100, options.min_chunk_chars ?? 350);

  const usableForProbeAuthoring = text.length >= 80 && trustLevel !== "unknown";
  const usableForStrongCorrectnessClaims = canUseForStrongClaims({
    trustLevel,
    rightsScope,
  });

  const rawChunks = splitIntoChunks(text, maxChunkChars, minChunkChars);

  let cursor = 0;
  const chunks: NormalizedLearningSourceChunk[] = rawChunks.map((chunkText, index) => {
    const start = text.indexOf(chunkText, cursor);
    const characterStart = start >= 0 ? start : cursor;
    const characterEnd = characterStart + chunkText.length;
    cursor = characterEnd;

    const reasons = [
      `Chunk ${index + 1} of ${rawChunks.length} from ${sourceTitle}.`,
      `Trust level is ${trustLevel}.`,
      `Rights scope is ${rightsScope}.`,
    ];

    const cautions: string[] = [];

    if (!usableForStrongCorrectnessClaims) {
      cautions.push(
        "This chunk can help author grounded probes, but should not by itself support strong correctness claims yet.",
      );
    }

    if (trustLevel === "model_generated" || trustLevel === "unknown") {
      cautions.push(
        "This chunk needs review or stronger source grounding before authoritative use.",
      );
    }

    return {
      chunk_id: makeId("source-chunk"),
      source_id: sourceId,
      source_kind: input.source_kind,
      source_title: sourceTitle,
      chunk_index: index,
      text: chunkText,
      character_start: characterStart,
      character_end: characterEnd,
      topic_labels: topicLabels,
      rights_scope: rightsScope,
      trust_level: trustLevel,
      confidence,
      usable_for_probe_authoring: usableForProbeAuthoring,
      usable_for_strong_correctness_claims: usableForStrongCorrectnessClaims,
      source_summary:
        chunkText.length > 220 ? `${chunkText.slice(0, 220).trim()}…` : chunkText,
      reasons,
      cautions,
    };
  });

  const reasons = [
    `Normalized ${sourceTitle} into ${chunks.length} source chunk(s).`,
    `Trust level is ${trustLevel}.`,
    `Rights scope is ${rightsScope}.`,
  ];

  const cautions: string[] = [];

  if (!usableForProbeAuthoring) {
    cautions.push(
      "Source text is too short or insufficiently trusted for probe authoring.",
    );
  }

  if (!usableForStrongCorrectnessClaims) {
    cautions.push(
      "Source can support grounded personalization, but strong correctness claims require review or a higher-trust source.",
    );
  }

  return {
    version: SOURCE_PROCESSING_VERSION,
    source: {
      source_id: sourceId,
      source_kind: input.source_kind,
      source_title: sourceTitle,
      origin_label: input.origin_label?.trim() || null,
      rights_scope: rightsScope,
      trust_level: trustLevel,
      processing_status: "normalized",
      created_at: input.created_at ?? nowIso(),
      topic_labels: topicLabels,
      text_length: text.length,
      chunk_count: chunks.length,
      usable_for_probe_authoring: usableForProbeAuthoring,
      usable_for_strong_correctness_claims: usableForStrongCorrectnessClaims,
      reasons,
      cautions,
    },
    chunks,
  };
}
