import { makeId } from "@/lib/utils/ids";
import type {
  LearningSourceKind,
  LearningSourceRightsScope,
  LearningSourceTrustLevel,
  ProbeAuthoringMode,
  ProbeAuthoringReadiness,
} from "@/types/contracts";
import type {
  NormalizedLearningSourceChunk,
} from "@/archive/old-engine/source-processing/source-types";
import type {
  ProbeGenerationMode,
  ProbeRendererKind,
} from "@/archive/old-engine/probes/probe-types";
import {
  PROBE_AUTHORING_VERSION,
  type BuildProbeAuthoringContextInput,
  type ProbeAuthoringContext,
  type ProbeAuthoringRightsSummary,
  type ProbeAuthoringTrustSummary,
} from "./authoring-types";

const TRUST_RANK: Record<LearningSourceTrustLevel, number> = {
  unknown: 0,
  model_generated: 1,
  unverified_public: 2,
  learner_notes: 3,
  user_provided: 4,
  trusted_public: 5,
  human_reviewed: 6,
};

function nowIso() {
  return new Date().toISOString();
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function normalizeTopicLabel(label: string) {
  return label.trim() || "this topic";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeTrust(
  chunks: NormalizedLearningSourceChunk[],
): ProbeAuthoringTrustSummary {
  const trustLevels = unique(chunks.map((chunk) => chunk.trust_level));
  const sorted = [...trustLevels].sort((a, b) => TRUST_RANK[a] - TRUST_RANK[b]);

  return {
    lowest_trust_level: sorted[0] ?? "unknown",
    highest_trust_level: sorted[sorted.length - 1] ?? "unknown",
    trust_levels_present: sorted,
  };
}

function summarizeRights(
  chunks: NormalizedLearningSourceChunk[],
): ProbeAuthoringRightsSummary {
  const rightsScopes = unique(chunks.map((chunk) => chunk.rights_scope));

  return {
    rights_scopes_present: rightsScopes,
    contains_private_upload: rightsScopes.includes("user_uploaded_private"),
    contains_public_reference: rightsScopes.includes("public_reference"),
    contains_generated_or_unknown:
      rightsScopes.includes("generated_ephemeral") ||
      rightsScopes.includes("unknown"),
  };
}

function inferGenerationMode(
  chunks: NormalizedLearningSourceChunk[],
): ProbeGenerationMode {
  const kinds = unique(chunks.map((chunk) => chunk.source_kind));

  if (!chunks.length) return "generic_scaffold";

  if (kinds.includes("human_reviewed_reference")) return "content_grounded";

  if (
    kinds.includes("uploaded_document") ||
    kinds.includes("course_material") ||
    kinds.includes("manual_notes")
  ) {
    return "user_uploaded_content_grounded";
  }

  if (
    kinds.includes("trusted_public_reference") ||
    kinds.includes("web_excerpt")
  ) {
    return "retrieval_grounded";
  }

  if (kinds.includes("generated_text")) return "content_grounded";

  return "unknown";
}

function hasAnyKind(
  chunks: NormalizedLearningSourceChunk[],
  kinds: LearningSourceKind[],
) {
  return chunks.some((chunk) => kinds.includes(chunk.source_kind));
}

function inferReadiness(args: {
  chunks: NormalizedLearningSourceChunk[];
  confidence: number;
  canAuthorLowStakes: boolean;
  canAuthorSourceGrounded: boolean;
  canAuthorStrongAnswerKey: boolean;
}): ProbeAuthoringReadiness {
  if (!args.canAuthorLowStakes) return "not_ready";
  if (args.canAuthorStrongAnswerKey && args.confidence >= 0.78) return "trusted_ready";
  if (args.canAuthorSourceGrounded && args.confidence >= 0.58) return "candidate_ready";
  return "low_stakes_only";
}

function allowedAuthoringModes(args: {
  chunks: NormalizedLearningSourceChunk[];
  confidence: number;
  canAuthorLowStakes: boolean;
  canAuthorSourceGrounded: boolean;
  canAuthorStrongAnswerKey: boolean;
}): ProbeAuthoringMode[] {
  const modes: ProbeAuthoringMode[] = [];

  if (!args.canAuthorLowStakes) return ["not_authorable"];

  modes.push("low_stakes_reflection_probe");

  if (args.canAuthorSourceGrounded) {
    modes.push("source_grounded_text_explanation");
  }

  if (args.canAuthorSourceGrounded && args.confidence >= 0.58) {
    modes.push("source_grounded_multiple_choice_candidate");
  }

  const hasLongEnoughText = args.chunks.some((chunk) => chunk.text.length >= 500);

  if (args.canAuthorSourceGrounded && hasLongEnoughText) {
    modes.push("source_grounded_ordering_candidate");
    modes.push("source_grounded_graph_candidate");
  }

  return unique(modes);
}

function preferredRenderersFor(args: {
  modes: ProbeAuthoringMode[];
  requested: ProbeRendererKind[];
}): ProbeRendererKind[] {
  const renderers: ProbeRendererKind[] = [];

  if (args.modes.includes("source_grounded_text_explanation")) {
    renderers.push("text_explanation");
  }

  if (args.modes.includes("source_grounded_multiple_choice_candidate")) {
    renderers.push("multiple_choice");
  }

  if (args.modes.includes("source_grounded_ordering_candidate")) {
    renderers.push("ordering");
  }

  if (args.modes.includes("source_grounded_graph_candidate")) {
    renderers.push("graph_match");
  }

  if (!renderers.length && args.modes.includes("low_stakes_reflection_probe")) {
    renderers.push("text_explanation");
  }

  const requestedSet = new Set(args.requested);
  const requestedFirst = args.requested.filter((renderer) =>
    renderers.includes(renderer),
  );
  const remaining = renderers.filter((renderer) => !requestedSet.has(renderer));

  return unique([...requestedFirst, ...remaining]);
}

function summarizeSourceText(chunks: NormalizedLearningSourceChunk[]) {
  const summaries = chunks
    .map((chunk) => chunk.source_summary || chunk.text.slice(0, 160).trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!summaries.length) return null;

  return summaries.join("\n---\n");
}

export function buildProbeAuthoringContext(
  input: BuildProbeAuthoringContextInput,
): ProbeAuthoringContext {
  const topicLabel = normalizeTopicLabel(input.topicLabel);
  const chunks = input.sourceChunks.filter((chunk) => chunk.text.trim().length > 0);
  const sourceIds = unique(chunks.map((chunk) => chunk.source_id));
  const chunkIds = unique(chunks.map((chunk) => chunk.chunk_id));

  const confidence = clamp01(average(chunks.map((chunk) => chunk.confidence)));
  const trustSummary = summarizeTrust(chunks);
  const rightsSummary = summarizeRights(chunks);

  const canAuthorLowStakesProbe = chunks.some(
    (chunk) => chunk.usable_for_probe_authoring,
  );
  const canAuthorSourceGroundedProbe =
    canAuthorLowStakesProbe &&
    chunks.some((chunk) => chunk.confidence >= 0.5) &&
    !hasAnyKind(chunks, ["generated_text", "unknown"]);

  const canAuthorStrongAnswerKey =
    chunks.length > 0 &&
    chunks.every((chunk) => chunk.usable_for_strong_correctness_claims) &&
    confidence >= 0.78;

  const requiresReviewBeforeUse = !canAuthorStrongAnswerKey;

  const recommendedGenerationMode = inferGenerationMode(chunks);
  const readiness = inferReadiness({
    chunks,
    confidence,
    canAuthorLowStakes: canAuthorLowStakesProbe,
    canAuthorSourceGrounded: canAuthorSourceGroundedProbe,
    canAuthorStrongAnswerKey,
  });

  const modes = allowedAuthoringModes({
    chunks,
    confidence,
    canAuthorLowStakes: canAuthorLowStakesProbe,
    canAuthorSourceGrounded: canAuthorSourceGroundedProbe,
    canAuthorStrongAnswerKey,
  });

  const preferredRendererKinds = preferredRenderersFor({
    modes,
    requested: input.preferredRendererKinds ?? [],
  });

  const reasons = [
    `Built authoring context for ${topicLabel}.`,
    `Included ${chunks.length} normalized source chunk(s).`,
    `Average source confidence is ${confidence.toFixed(2)}.`,
    `Recommended generation mode is ${recommendedGenerationMode}.`,
    `Authoring readiness is ${readiness}.`,
  ];

  if (canAuthorLowStakesProbe) {
    reasons.push("At least one chunk can support low-stakes probe authoring.");
  }

  if (canAuthorSourceGroundedProbe) {
    reasons.push("Source chunks are usable for source-grounded probe candidates.");
  }

  if (canAuthorStrongAnswerKey) {
    reasons.push("Source chunks are high-trust enough for strong answer-key authoring.");
  }

  const cautions: string[] = [];

  if (!chunks.length) {
    cautions.push("No normalized source chunks were provided.");
  }

  if (!canAuthorLowStakesProbe) {
    cautions.push("The provided chunks are not ready for probe authoring.");
  }

  if (!canAuthorStrongAnswerKey) {
    cautions.push(
      "Use this context for low-stakes or reviewable probe candidates, not trusted answer keys.",
    );
  }

  if (rightsSummary.contains_private_upload) {
    cautions.push(
      "This context includes private uploaded/user-provided material; persistence and reuse should respect that rights scope.",
    );
  }

  if (rightsSummary.contains_generated_or_unknown) {
    cautions.push(
      "This context includes generated or unknown-rights content and needs review before authoritative use.",
    );
  }

  return {
    authoring_context_id: makeId("probe-authoring-context"),
    version: PROBE_AUTHORING_VERSION,
    created_at: input.createdAt ?? nowIso(),

    target_topic_id: input.targetTopicId ?? null,
    topic_label: topicLabel,
    assessment_target: input.assessmentTarget ?? null,

    source_ids: sourceIds,
    source_chunk_ids: chunkIds,
    source_chunks: chunks,

    source_confidence: confidence,
    trust_summary: trustSummary,
    rights_summary: rightsSummary,

    recommended_generation_mode: recommendedGenerationMode,
    readiness,

    allowed_authoring_modes: modes,
    preferred_renderer_kinds: preferredRendererKinds,

    can_author_low_stakes_probe: canAuthorLowStakesProbe,
    can_author_source_grounded_probe: canAuthorSourceGroundedProbe,
    can_author_strong_answer_key: canAuthorStrongAnswerKey,
    requires_review_before_use: requiresReviewBeforeUse,

    source_summary: summarizeSourceText(chunks),
    reasons,
    cautions,
  };
}

