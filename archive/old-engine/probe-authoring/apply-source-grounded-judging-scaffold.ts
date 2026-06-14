import { makeId } from "@/lib/utils/ids";
import type {
  NormalizedLearningSourceChunk,
} from "@/archive/old-engine/source-processing/source-types";
import type {
  ProbeSourceGroundedJudgingScaffold,
} from "@/archive/old-engine/probes/probe-types";
import type {
  ApplySourceGroundedJudgingScaffoldOptions,
  ApplySourceGroundedJudgingScaffoldResult,
  SourceGroundedProbeInputBuildResult,
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

function sourceFocusSummary(args: {
  chunk: NormalizedLearningSourceChunk | null;
  maxChars: number;
}) {
  if (!args.chunk) return null;

  const summary = args.chunk.source_summary || args.chunk.text;
  return truncate(summary, args.maxChars);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function confidenceFor(args: {
  sourceConfidence: number;
  hasSourceFocus: boolean;
  requiresReview: boolean;
}) {
  let value = args.sourceConfidence;

  if (args.hasSourceFocus) value += 0.04;
  if (args.requiresReview) value -= 0.1;

  return clamp01(value);
}

function buildSuccessHints(args: {
  topicLabel: string;
  sourceFocus: string | null;
}) {
  const hints = [
    `The learner connects their answer to ${args.topicLabel} rather than only giving unrelated background knowledge.`,
    `The learner explains a relationship, mechanism, or contrast instead of only repeating keywords.`,
  ];

  if (args.sourceFocus) {
    hints.unshift(
      `The learner addresses the source focus: ${args.sourceFocus}`,
    );
  }

  return hints;
}

function buildFailureHints(args: {
  topicLabel: string;
  sourceFocus: string | null;
}) {
  const hints = [
    `The learner gives an answer that is off-target for ${args.topicLabel}.`,
    "The learner repeats source words without explaining the relationship or mechanism.",
    "The learner makes stronger claims than the provided source can support.",
  ];

  if (args.sourceFocus) {
    hints.unshift(
      `The learner misses or contradicts the source focus: ${args.sourceFocus}`,
    );
  }

  return hints;
}

function buildMisconceptionHints(args: {
  topicLabel: string;
}) {
  return [
    "Surface-word matching without a source-grounded explanation.",
    `Treating one detail as if it explains all of ${args.topicLabel}.`,
    "Confusing a source example with the underlying relationship or mechanism.",
  ];
}

/**
 * Applies provisional source-grounded judging hints to a source-grounded probe
 * input result.
 *
 * This is intentionally not a trusted answer key or reviewed rubric. It creates
 * reviewable hint candidates that future heuristic/model judging can inspect,
 * while source policy and cache policy continue to keep claim strength cautious.
 */
export function applySourceGroundedJudgingScaffold(
  result: SourceGroundedProbeInputBuildResult,
  options: ApplySourceGroundedJudgingScaffoldOptions = {},
): ApplySourceGroundedJudgingScaffoldResult {
  const probeInput = result.probe_input;
  const chunks = probeInput.normalizedSourceChunks ?? [];
  const primaryChunk = choosePrimaryChunk(chunks);
  const topicLabel = probeInput.targetTopicLabel.trim() || "this topic";
  const sourceFocus = sourceFocusSummary({
    chunk: primaryChunk,
    maxChars: Math.max(120, options.maxSourceSummaryChars ?? 260),
  });
  const requiresReview = result.source_metadata.requires_review;

  const scaffold: ProbeSourceGroundedJudgingScaffold = {
    scaffold_id: makeId("source-judging-scaffold"),
    created_at: options.createdAt ?? nowIso(),
    source_chunk_ids: chunks.map((chunk) => chunk.chunk_id),
    source_focus_summary: sourceFocus,
    success_hint_candidates: buildSuccessHints({
      topicLabel,
      sourceFocus,
    }),
    failure_hint_candidates: buildFailureHints({
      topicLabel,
      sourceFocus,
    }),
    misconception_hint_candidates: buildMisconceptionHints({
      topicLabel,
    }),
    confidence: confidenceFor({
      sourceConfidence: result.source_metadata.content_confidence,
      hasSourceFocus: Boolean(sourceFocus),
      requiresReview,
    }),
    requires_review: requiresReview,
    reasons: [
      `Built provisional source-grounded judging hints for ${topicLabel}.`,
      primaryChunk
        ? `Primary judging source chunk was ${primaryChunk.chunk_id}.`
        : "No primary judging source chunk was available.",
      sourceFocus
        ? "Used a source focus summary to shape judging hint candidates."
        : "No source focus summary was available, so judging hints stayed broad.",
    ],
    cautions: [
      "These judging hints are provisional and should not be treated as a reviewed rubric.",
      "These hints can guide review/debugging but should not upgrade correctness claim strength by themselves.",
      requiresReview
        ? "This judging scaffold requires review before trusted reuse."
        : "",
    ].filter(Boolean),
  };

  return {
    ...result,
    probe_input: {
      ...probeInput,
      judgingScaffoldOverrides: scaffold,
    },
    source_grounded_judging_scaffold: scaffold,
    reasons: [
      ...result.reasons,
      ...scaffold.reasons,
      `Source-grounded judging scaffold confidence is ${scaffold.confidence.toFixed(2)}.`,
    ],
    cautions: [
      ...result.cautions,
      ...scaffold.cautions,
    ],
  };
}

