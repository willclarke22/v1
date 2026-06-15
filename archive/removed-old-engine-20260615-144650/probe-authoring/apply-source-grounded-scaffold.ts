import { makeId } from "@/lib/utils/ids";
import type {
  NormalizedLearningSourceChunk,
} from "@/archive/old-engine/source-processing/source-types";
import type {
  ApplySourceGroundedScaffoldOptions,
  ApplySourceGroundedScaffoldResult,
  SourceGroundedProbeInputBuildResult,
  SourceGroundedScaffold,
} from "./authoring-types";

function nowIso() {
  return new Date().toISOString();
}

function cleanOneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number) {
  const cleaned = cleanOneLine(value);
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function firstSentenceLike(value: string) {
  const cleaned = cleanOneLine(value);
  const match = cleaned.match(/^(.{80,260}?[.!?])\s+/);
  return match?.[1]?.trim() || cleaned;
}

function choosePrimaryChunk(
  chunks: NormalizedLearningSourceChunk[],
): NormalizedLearningSourceChunk | null {
  const usable = chunks.filter((chunk) => chunk.usable_for_probe_authoring);
  const candidates = usable.length ? usable : chunks;

  return (
    [...candidates].sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.text.length - a.text.length;
    })[0] ?? null
  );
}

function buildSourceFocusSummary(args: {
  chunk: NormalizedLearningSourceChunk | null;
  maxChars: number;
}) {
  if (!args.chunk) return null;

  const summary = args.chunk.source_summary || firstSentenceLike(args.chunk.text);
  return truncate(summary, args.maxChars);
}

function buildPrompt(args: {
  topicLabel: string;
  sourceTitle: string | null;
  sourceFocusSummary: string | null;
}) {
  const sourcePhrase = args.sourceTitle
    ? `the source "${args.sourceTitle}"`
    : "the provided source";

  if (args.sourceFocusSummary) {
    return cleanOneLine(
      `Using ${sourcePhrase}, explain the key relationship or mechanism in ${args.topicLabel}. Focus on this source idea: ${args.sourceFocusSummary}`,
    );
  }

  return cleanOneLine(
    `Using ${sourcePhrase}, explain the key relationship or mechanism in ${args.topicLabel}.`,
  );
}

function buildInstructions(args: {
  requiresReview: boolean;
}) {
  const base =
    "Use this as a focused source-grounded check of understanding. It is okay if the learner is unsure; the goal is to reveal the next useful gap.";
  const reviewNote = args.requiresReview
    ? "This is a source-grounded but reviewable scaffold, so the goal is to reveal the learner's reasoning rather than make a final high-authority correctness claim."
    : "";

  return cleanOneLine([base, reviewNote].filter(Boolean).join(" "));
}

function scaffoldConfidence(args: {
  sourceConfidence: number;
  hasSourceFocus: boolean;
  requiresReview: boolean;
}) {
  let value = args.sourceConfidence;

  if (args.hasSourceFocus) value += 0.06;
  if (args.requiresReview) value -= 0.08;

  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Applies conservative source-grounded renderer config overrides to a
 * SourceGroundedProbeInputBuildResult.
 *
 * This does not create a trusted answer key. It only makes the learner-facing
 * prompt/title/instructions use the source chunks already attached to the probe
 * input, while preserving review/caution metadata.
 */
export function applySourceGroundedScaffold(
  result: SourceGroundedProbeInputBuildResult,
  options: ApplySourceGroundedScaffoldOptions = {},
): ApplySourceGroundedScaffoldResult {
  const probeInput = result.probe_input;
  const chunks = probeInput.normalizedSourceChunks ?? [];
  const primaryChunk = choosePrimaryChunk(chunks);
  const topicLabel = probeInput.targetTopicLabel.trim() || "this topic";
  const sourceTitle = primaryChunk?.source_title ?? null;
  const sourceFocusSummary = buildSourceFocusSummary({
    chunk: primaryChunk,
    maxChars: Math.max(120, options.maxSourceSummaryChars ?? 260),
  });
  const requiresReview = result.source_metadata.requires_review;

  const rendererConfigOverrides = {
    title: cleanOneLine(
      sourceTitle
        ? `Explain ${topicLabel} using ${sourceTitle}`
        : `Explain ${topicLabel} using the source`,
    ),
    instructions: buildInstructions({ requiresReview }),
    prompt: buildPrompt({
      topicLabel,
      sourceTitle,
      sourceFocusSummary,
    }),
    thumbnail_label: "Source probe",
  };

  const scaffold: SourceGroundedScaffold = {
    scaffold_id: makeId("source-grounded-scaffold"),
    created_at: options.createdAt ?? nowIso(),
    topic_label: topicLabel,
    source_title: sourceTitle,
    source_chunk_ids: chunks.map((chunk) => chunk.chunk_id),
    source_focus_summary: sourceFocusSummary,
    renderer_config_overrides: rendererConfigOverrides,
    scaffold_confidence: scaffoldConfidence({
      sourceConfidence: result.source_metadata.content_confidence,
      hasSourceFocus: Boolean(sourceFocusSummary),
      requiresReview,
    }),
    requires_review: requiresReview,
    reasons: [
      `Built a source-grounded scaffold for ${topicLabel}.`,
      primaryChunk
        ? `Primary source chunk was ${primaryChunk.chunk_id}.`
        : "No primary source chunk was available.",
      sourceFocusSummary
        ? "Used a source focus summary to shape the learner-facing prompt."
        : "No source focus summary was available, so the prompt stayed broad.",
    ],
    cautions: [
      "This scaffold shapes the prompt from source text, but it does not create a reviewed answer key.",
      requiresReview
        ? "This scaffold requires review before it can support strong correctness claims."
        : "",
    ].filter(Boolean),
  };

  return {
    ...result,
    probe_input: {
      ...probeInput,
      rendererConfigOverrides: {
        ...(probeInput.rendererConfigOverrides ?? {}),
        ...scaffold.renderer_config_overrides,
      },
    },
    source_grounded_scaffold: scaffold,
    reasons: [
      ...result.reasons,
      ...scaffold.reasons,
      `Source-grounded scaffold confidence is ${scaffold.scaffold_confidence.toFixed(2)}.`,
    ],
    cautions: [
      ...result.cautions,
      ...scaffold.cautions,
    ],
  };
}

