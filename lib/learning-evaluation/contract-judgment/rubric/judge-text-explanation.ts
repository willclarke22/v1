import type {
  EntityId,
  ProbeContractSnapshot,
} from "@/types/contracts";
import type {
  ContractJudgingInput,
  RubricJudgment,
  RubricMarkerScore,
  RubricMisconceptionScore,
} from "@/lib/learning-evaluation/contract-judgment/judging-types";
import {
  RUBRIC_JUDGING_VERSION,
  type SourceGroundedRubricSignal,
  type TextRubricJudgment,
  type TextRubricSignalSummary,
} from "./rubric-types";

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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .flatMap((item) => {
      if (typeof item === "string") return [item];

      const record = asRecord(item);
      const candidates = [
        record.term,
        record.label,
        record.text,
        record.description,
        record.summary,
        record.quote_or_summary,
        record.expected_relationship,
        record.relationship,
        record.mechanism,
      ];

      return candidates.filter((candidate): candidate is string => {
        return typeof candidate === "string" && candidate.trim().length > 0;
      });
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function getInputSchema(contract: ProbeContractSnapshot | null | undefined) {
  return asRecord((contract as { input_schema?: unknown } | null | undefined)?.input_schema);
}

function getJudgingSchema(contract: ProbeContractSnapshot | null | undefined) {
  return asRecord(contract?.judging_schema ?? null);
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

function isRubricTextRenderer(rendererKind: string | null) {
  return (
    rendererKind === "text_explanation" ||
    rendererKind === "audio_explanation" ||
    rendererKind === "video_checkpoint"
  );
}

function getSuccessMarkers(contract: ProbeContractSnapshot | null | undefined) {
  return asArray(getJudgingSchema(contract).success_markers);
}

function getFailureMarkers(contract: ProbeContractSnapshot | null | undefined) {
  return asArray(getJudgingSchema(contract).failure_markers);
}

function getMisconceptionMappings(contract: ProbeContractSnapshot | null | undefined) {
  return asArray(getJudgingSchema(contract).misconception_mappings);
}

function getSourceGroundedJudgingScaffold(
  contract: ProbeContractSnapshot | null | undefined,
) {
  return asRecord(getJudgingSchema(contract).source_grounded_judging_scaffold);
}

function getEvidenceText(input: ContractJudgingInput) {
  const value = input.normalizedEvidence?.value;

  if (value?.kind === "text") return value.text.trim();

  if (value?.kind === "structured") {
    const record = asRecord(value.value);
    const candidates = [
      record.text,
      record.transcript,
      record.explanation,
      record.reasoning,
      record.response,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  /**
   * AttemptInterpretation does not currently expose raw_response as a typed
   * field. Keep this fallback intentionally defensive so this rubric can still
   * read older/debug attempt shapes without requiring the core evidence type to
   * grow a new property.
   */
  const interpretationRecord = input.attemptInterpretation as unknown as Record<
    string,
    unknown
  >;

  const fallbackCandidates = [
    interpretationRecord.raw_response,
    interpretationRecord.rawResponse,
    interpretationRecord.response,
    interpretationRecord.response_text,
    interpretationRecord.responseText,
    interpretationRecord.submitted_text,
    interpretationRecord.submittedText,
  ];

  for (const candidate of fallbackCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function normalizeToken(token: string) {
  let value = token.toLowerCase().trim();

  /**
   * Keep this intentionally simple/local. This is not semantic parsing; it is a
   * cheap normalization layer so source-grounded hints can recognize obvious
   * variants like states/state, powers/power, divided/divide, and
   * responsibilities/responsibility.
   */
  value = value.replace(/['â€™]s$/u, "");

  const irregular: Record<string, string> = {
    states: "state",
    governments: "government",
    powers: "power",
    responsibilities: "responsibility",
    authorities: "authority",
    levels: "level",
    issues: "issue",
    responses: "response",
    elections: "election",
    systems: "system",
    disputes: "dispute",
    belongs: "belong",
    controls: "control",
    controlled: "control",
    controlling: "control",
    divided: "divide",
    divides: "divide",
    dividing: "divide",
    division: "divide",
    delegated: "delegate",
    delegates: "delegate",
    reserved: "reserve",
    reserves: "reserve",
    overlapping: "overlap",
    overlaps: "overlap",
    conflicts: "conflict",
    happening: "happen",
    happens: "happen",
    happened: "happen",
    managing: "manage",
    regulates: "regulate",
    regulating: "regulate",
    regulation: "regulate",
    rules: "rule",
  };

  if (irregular[value]) return irregular[value];

  if (value.length > 5 && value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.length > 5 && value.endsWith("ing")) {
    return value.slice(0, -3);
  }

  if (value.length > 4 && value.endsWith("ed")) {
    return value.slice(0, -2);
  }

  if (value.length > 4 && value.endsWith("es")) {
    return value.slice(0, -2);
  }

  if (value.length > 4 && value.endsWith("s")) {
    return value.slice(0, -1);
  }

  return value;
}

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[-/]/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((word) => normalizeToken(word))
    .filter((word) => word.length >= 3);
}
function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function stopwords() {
  return new Set([
    "the",
    "and",
    "that",
    "this",
    "with",
    "from",
    "into",
    "about",
    "what",
    "when",
    "where",
    "which",
    "response",
    "learner",
    "topic",
    "uses",
    "using",
    "should",
    "could",
    "would",
    "their",
    "there",
    "clear",
    "source",
    "sources",
    "material",
    "document",
    "explain",
    "explanation",
    "expected",
    "answer",
    "answers",
    "correct",
    "incorrect",
    "candidate",
    "candidates",
    "hint",
    "hints",
    "focus",
    "focused",
    "key",
    "idea",
    "ideas",
    "rather",
    "only",
    "unrelated",
    "background",
    "knowledge",
    "repeating",
    "repeats",
    "words",
    "word",
    "terms",
    "term",
    "stronger",
    "claim",
    "claims",
    "provided",
    "misses",
    "contradicts",
  ]);
}
function markerTerms(label: string, description: string | null) {
  const excluded = stopwords();

  return unique(words(`${label} ${description ?? ""}`)).filter(
    (word) => !excluded.has(word),
  );
}

function termsFromTexts(texts: string[]) {
  const excluded = stopwords();

  return unique(texts.flatMap((text) => words(text))).filter(
    (word) => !excluded.has(word),
  );
}

function overlapScore(textWords: string[], terms: string[]) {
  if (!terms.length || !textWords.length) return 0;

  const textSet = new Set(textWords);
  const matches = terms.filter((term) => textSet.has(term)).length;

  return clamp01(matches / Math.max(1, Math.min(terms.length, 6)));
}

function matchingTerms(textWords: string[], terms: string[], maxTerms = 12) {
  if (!textWords.length || !terms.length) return [];

  const textSet = new Set(textWords);
  return unique(terms.filter((term) => textSet.has(term))).slice(0, maxTerms);
}

function evidenceExcerpt(text: string, terms: string[]) {
  if (!text) return null;

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences.length) {
    return text.length > 220 ? `${text.slice(0, 217)}...` : text;
  }

  const scored = sentences
    .map((sentence) => ({
      sentence,
      score: overlapScore(words(sentence), terms),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.sentence ?? sentences[0];
  return best.length > 220 ? `${best.slice(0, 217)}...` : best;
}

function interpretationQualityScore(input: ContractJudgingInput) {
  const features = input.attemptInterpretation.features;

  const coherence = safeNumber(features.conceptual_coherence, 0);
  const discrimination = safeNumber(features.discrimination_accuracy, 0);
  const prediction = safeNumber(features.prediction_accuracy, 0);
  const procedure = safeNumber(features.procedure_order_quality, 0);
  const representation = safeNumber(features.representation_quality, 0);

  const strongest = Math.max(
    coherence,
    discrimination,
    prediction,
    procedure,
    representation,
  );

  const outcomeBoost =
    input.attemptInterpretation.outcome === "strong_evidence"
      ? 0.16
      : input.attemptInterpretation.outcome === "partial_evidence"
        ? 0.08
        : input.attemptInterpretation.outcome === "weak_evidence"
          ? -0.06
          : -0.16;

  return clamp01(
    input.attemptInterpretation.evidence_strength * 0.42 +
      input.attemptInterpretation.judgment_confidence * 0.28 +
      strongest * 0.22 +
      outcomeBoost,
  );
}

function explanationShapeScore(text: string) {
  const lower = text.toLowerCase();

  const hasBecause = /\bbecause\b|\bso\b|\btherefore\b|\bthis means\b|\bthat means\b/.test(
    lower,
  );
  const hasExample = /\bfor example\b|\be\.g\.\b|\blike\b|\bsuch as\b/.test(lower);
  const hasContrast = /\bbut\b|\bhowever\b|\bwhereas\b|\binstead\b|\bcompared\b/.test(
    lower,
  );
  const hasUncertainty = /\bi think\b|\bmaybe\b|\bnot sure\b|\bconfused\b|\bi don't know\b/.test(
    lower,
  );

  return clamp01(
    (hasBecause ? 0.34 : 0) +
      (hasExample ? 0.24 : 0) +
      (hasContrast ? 0.18 : 0) +
      (hasUncertainty ? 0.08 : 0) +
      0.16,
  );
}

function mechanismLanguageScore(text: string) {
  const lower = text.toLowerCase();

  const patterns = [
    /\bbecause\b/u,
    /\bso\b/u,
    /\btherefore\b/u,
    /\bthis means\b/u,
    /\bthat means\b/u,
    /\bleads? to\b/u,
    /\bresults? in\b/u,
    /\bdepends? on\b/u,
    /\baffects?\b/u,
    /\binfluences?\b/u,
    /\brelationship\b/u,
    /\bmechanism\b/u,
    /\bconnected\b/u,
    /\bwhen\b/u,
    /\bif\b/u,
    /\bbetween\b/u,
    /\bdivide[ds]?\b|\bdivision\b|\bdividing\b/u,
    /\boverlap(?:s|ping|ped)?\b/u,
    /\bconflict(?:s)?\b/u,
    /\bresponsibilit(?:y|ies)\b/u,
    /\bauthorit(?:y|ies)\b/u,
    /\bcontrol(?:s|led|ling)?\b/u,
    /\bbelong(?:s|ed|ing)?\b/u,
  ];

  const hits = patterns.filter((pattern) => pattern.test(lower)).length;

  /**
   * A source-grounded open answer often explains the mechanism with simple
   * connective language ("so", "when", "between") rather than formal words
   * like "mechanism". Keep the denominator modest so obvious causal/relational
   * explanations register.
   */
  return clamp01(hits / 5);
}
function overclaimSignal(text: string) {
  const lower = text.toLowerCase();

  return /\balways\b|\bnever\b|\bdefinitely\b|\bproves\b|\bguarantees\b|\bonly\b|\bcompletely\b|\bexactly\b|\bno matter what\b/.test(
    lower,
  );
}

function lengthScore(wordCount: number) {
  if (wordCount <= 0) return 0;
  if (wordCount < 5) return 0.16;
  if (wordCount < 10) return 0.34;
  if (wordCount < 25) return 0.62;
  if (wordCount <= 120) return 0.9;
  return 0.72;
}

function collectScaffoldTexts(scaffold: Record<string, unknown>) {
  const directTextKeys = [
    "source_summary",
    "source_focus",
    "source_focus_summary",
    "expected_source_focus",
    "expected_answer_shape",
    "expected_relationship",
    "expected_mechanism",
    "judging_notes",
    "provisional_notes",
    "rubric_notes",
  ];

  const arrayTextKeys = [
    "source_focus_terms",
    "expected_source_focus_terms",
    "key_terms",
    "required_terms",
    "source_terms",
    "concept_terms",
    "source_claims",
    "claims",
    "source_refs",
    "source_reference_summaries",
    "success_hint_candidates",
    "failure_hint_candidates",
    "misconception_hint_candidates",
  ];

  const relationshipTextKeys = [
    "relationship_terms",
    "mechanism_terms",
    "expected_relationship_terms",
    "expected_mechanism_terms",
    "relationships",
    "mechanisms",
    "causal_links",
    "dependencies",
    "distinctions",
    "contrasts",
    "success_hint_candidates",
    "failure_hint_candidates",
    "misconception_hint_candidates",
  ];

  const sourceTexts = [
    ...directTextKeys.flatMap((key) => {
      const value = scaffold[key];
      return typeof value === "string" && value.trim() ? [value.trim()] : [];
    }),
    ...arrayTextKeys.flatMap((key) => asStringArray(scaffold[key])),
  ];

  const relationshipTexts = relationshipTextKeys.flatMap((key) => {
    const value = scaffold[key];
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return asStringArray(value);
  });

  return {
    sourceTexts,
    relationshipTexts,
  };
}

function collectContractSourceTexts(contract: ProbeContractSnapshot | null | undefined) {
  const rendererConfig = asRecord(contract?.renderer_config ?? null);
  const sourceMetadata = asRecord(
    (contract as Record<string, unknown> | null | undefined)?.source_metadata,
  );

  const sourceRefs = asArray(sourceMetadata.source_refs).flatMap((ref) => {
    const record = asRecord(ref);
    return [
      record.quote_or_summary,
      record.summary,
      record.source_summary,
      record.section_label,
    ].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
  });

  const normalizedChunks = asArray(sourceMetadata.normalized_source_chunks).flatMap(
    (chunk) => {
      const record = asRecord(chunk);
      return [
        record.text,
        record.raw_text,
        record.chunk_text,
        record.source_summary,
        record.summary,
      ].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
    },
  );

  return [
    rendererConfig.prompt,
    rendererConfig.instructions,
    sourceMetadata.source_summary,
    sourceMetadata.summary,
    ...sourceRefs,
    ...normalizedChunks,
  ].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

function relationshipCueTerms() {
  /**
   * These are deliberately narrower than "source terms."
   *
   * A learner can mention broad source vocabulary like federalism/government/
   * state/power without actually explaining a relationship. Relationship terms
   * should point to structure, mechanism, contrast, causality, responsibility,
   * conflict, or allocation.
   */
  return new Set(
    [
      "authority",
      "divide",
      "division",
      "between",
      "level",
      "conflict",
      "overlap",
      "responsibility",
      "relationship",
      "mechanism",
      "control",
      "belong",
      "delegate",
      "reserve",
      "affect",
      "depend",
      "lead",
      "cause",
      "result",
      "contrast",
      "difference",
      "shared",
      "same",
      "both",
      "issue",
    ].map(normalizeToken),
  );
}

function broadSourceOnlyTerms() {
  /**
   * These words are useful for "source focus" detection, but they are too broad
   * to count as mechanism evidence by themselves.
   */
  return new Set(
    [
      "federalism",
      "federal",
      "government",
      "national",
      "regional",
      "state",
      "power",
      "political",
      "politics",
      "american",
      "system",
      "public",
      "health",
      "education",
      "voting",
      "environmental",
      "rule",
      "law",
    ].map(normalizeToken),
  );
}

function countMatchedTerms(textWords: string[], terms: string[]) {
  if (!textWords.length || !terms.length) return 0;

  const textSet = new Set(textWords);
  return unique(terms.filter((term) => textSet.has(term))).length;
}

function relationshipEvidenceScore(args: {
  textWords: string[];
  relationshipTerms: string[];
  mechanismLanguage: number;
}) {
  const broadOnly = broadSourceOnlyTerms();
  const strictRelationshipTerms = args.relationshipTerms.filter(
    (term) => !broadOnly.has(term),
  );
  const strictMatchCount = countMatchedTerms(args.textWords, strictRelationshipTerms);

  /**
   * Require either explicit mechanism language ("so", "between", "conflict",
   * etc.) or several strict relationship terms. This prevents shallow keyword
   * answers from being treated as relationship explanations just because they
   * mention broad source terms.
   */
  return clamp01(
    args.mechanismLanguage * 0.68 +
      Math.min(strictMatchCount, 4) * 0.08,
  );
}

function scaffoldIsProvisional(scaffold: Record<string, unknown>) {
  const explicit = scaffold.scaffold_is_provisional ?? scaffold.provisional;
  if (typeof explicit === "boolean") return explicit;

  const status = scaffold.status ?? scaffold.review_status;
  if (typeof status === "string") {
    return status.toLowerCase() !== "reviewed" && status.toLowerCase() !== "approved";
  }

  return true;
}

function buildSourceGroundedSignal(args: {
  input: ContractJudgingInput;
  text: string;
  textWords: string[];
}): SourceGroundedRubricSignal | null {
  const scaffold = getSourceGroundedJudgingScaffold(args.input.probeContractSnapshot);
  if (!Object.keys(scaffold).length) return null;

  const { sourceTexts, relationshipTexts } = collectScaffoldTexts(scaffold);
  const contractSourceTexts = collectContractSourceTexts(args.input.probeContractSnapshot);
  const combinedSourceTexts = unique([...sourceTexts, ...contractSourceTexts]);

  /**
   * V1.1 repair:
   * The scaffold currently exposes source_focus_summary and hint candidates, not
   * neat source_focus_terms / relationship_terms arrays. So derive terms from:
   * - source_focus_summary
   * - success/failure/misconception hints
   * - renderer prompt / source metadata summaries when present
   *
   * This keeps the signal local and cheap while making it actually see obvious
   * source-grounded answers.
   */
  const sourceTerms = termsFromTexts(combinedSourceTexts);
  const cueTerms = relationshipCueTerms();
  const inferredRelationshipTerms = sourceTerms.filter((term) => cueTerms.has(term));
  const relationshipTerms = unique([
    ...termsFromTexts(relationshipTexts),
    ...inferredRelationshipTerms,
  ]);

  const sourceFocusOverlapScore = overlapScore(args.textWords, sourceTerms);
  const rawRelationshipOverlapScore = overlapScore(args.textWords, relationshipTerms);
  const mechLanguageScore = mechanismLanguageScore(args.text);

  const matchedSourceTerms = matchingTerms(args.textWords, sourceTerms);
  const matchedRelationshipTerms = matchingTerms(args.textWords, relationshipTerms);

  const broadOnlyTerms = broadSourceOnlyTerms();
  const strictRelationshipTerms = relationshipTerms.filter(
    (term) => !broadOnlyTerms.has(term),
  );
  const matchedStrictRelationshipTerms = matchingTerms(
    args.textWords,
    strictRelationshipTerms,
  );
  const relationEvidenceScore = relationshipEvidenceScore({
    textWords: args.textWords,
    relationshipTerms,
    mechanismLanguage: mechLanguageScore,
  });

  /**
   * Source focus can be lexical because the question is source-grounded.
   * Mechanism/relationship understanding should be stricter: broad words like
   * "federalism", "government", "states", and "powers" are not enough.
   */
  const usedSourceFocus =
    sourceFocusOverlapScore >= 0.18 || matchedSourceTerms.length >= 2;

  const addressedRelationshipOrMechanism =
    usedSourceFocus &&
    (relationEvidenceScore >= 0.3 ||
      mechLanguageScore >= 0.34 ||
      matchedStrictRelationshipTerms.length >= 2);

  const possibleSurfaceWordMatch =
    usedSourceFocus &&
    !addressedRelationshipOrMechanism &&
    (sourceFocusOverlapScore >= 0.18 || matchedSourceTerms.length >= 2) &&
    mechLanguageScore < 0.34;

  const relationshipOverlapScore = addressedRelationshipOrMechanism
    ? rawRelationshipOverlapScore
    : Math.min(rawRelationshipOverlapScore, relationEvidenceScore);

  const possibleOverclaim = overclaimSignal(args.text);
  const provisional = scaffoldIsProvisional(scaffold);

  const confidenceCap = provisional ? 0.68 : 0.82;
  const confidence = clamp01(
    Math.min(
      confidenceCap,
      0.18 +
        sourceFocusOverlapScore * 0.26 +
        relationshipOverlapScore * 0.24 +
        mechLanguageScore * 0.2 +
        args.input.attemptInterpretation.judgment_confidence * 0.16 -
        (possibleOverclaim ? 0.08 : 0),
    ),
  );

  const reasons: string[] = [
    `Read contract.judging_schema.source_grounded_judging_scaffold as a provisional source-awareness hint.`,
    `Derived ${sourceTerms.length} source-focus term(s) from scaffold/source metadata.`,
    `Derived ${relationshipTerms.length} relationship/mechanism term(s) from scaffold/source metadata.`,
    `Source focus overlap was ${sourceFocusOverlapScore.toFixed(2)}.`,
    `Relationship/mechanism overlap was ${relationshipOverlapScore.toFixed(2)}.`,
    `Mechanism language score was ${mechLanguageScore.toFixed(2)}.`,
    `Strict relationship cue matches: ${matchedStrictRelationshipTerms.join(", ") || "none"}.`,
    `Relationship evidence score was ${relationEvidenceScore.toFixed(2)}.`,
  ];

  if (usedSourceFocus) {
    reasons.push("The learner response used source-focused terms or concepts.");
  }

  if (addressedRelationshipOrMechanism) {
    reasons.push(
      "The learner response showed relationship/mechanism language or matched strict relationship-focused source terms.",
    );
  }

  if (possibleSurfaceWordMatch) {
    reasons.push(
      "The response may be repeating source-related vocabulary without explaining the relationship or mechanism yet.",
    );
  }

  const cautions: string[] = [
    "This source-grounded signal is a cheap local heuristic, not a reviewed source answer key.",
    "Do not use this signal to upgrade claim strength or make strong correctness claims.",
  ];

  if (provisional) {
    cautions.push("The source-grounded judging scaffold is provisional.");
  }

  if (!sourceTerms.length) {
    cautions.push("The scaffold/source metadata did not expose clear source-focus terms.");
  }

  if (!relationshipTerms.length) {
    cautions.push(
      "The scaffold/source metadata did not expose clear relationship/mechanism terms.",
    );
  }

  if (possibleOverclaim) {
    cautions.push(
      "The response used strong absolute language, so any source-grounded judgment should remain conservative.",
    );
  }

  return {
    scaffold_available: true,
    scaffold_is_provisional: provisional,
    used_source_focus: usedSourceFocus,
    addressed_relationship_or_mechanism: addressedRelationshipOrMechanism,
    possible_surface_word_match: possibleSurfaceWordMatch,
    possible_overclaim: possibleOverclaim,
    source_focus_overlap_score: sourceFocusOverlapScore,
    relationship_overlap_score: relationshipOverlapScore,
    mechanism_language_score: mechLanguageScore,
    confidence,
    source_terms_used: matchedSourceTerms,
    relationship_terms_used: matchedStrictRelationshipTerms,
    evidence_excerpt: evidenceExcerpt(args.text, [...sourceTerms, ...relationshipTerms]),
    reasons,
    cautions,
  };
}

function buildSignalSummary(args: {
  text: string;
  markerOverlapScore: number;
  sourceGroundedSignal: SourceGroundedRubricSignal | null;
  input: ContractJudgingInput;
}): TextRubricSignalSummary {
  const textWords = words(args.text);
  const lenScore = lengthScore(textWords.length);
  const qualityScore = interpretationQualityScore(args.input);
  const shapeScore = explanationShapeScore(args.text);

  return {
    word_count: textWords.length,
    unique_word_count: unique(textWords).length,
    marker_overlap_score: clamp01(args.markerOverlapScore),
    length_score: lenScore,
    interpretation_quality_score: qualityScore,
    explanation_shape_score: shapeScore,
    source_grounded_signal: args.sourceGroundedSignal,
    confidence: clamp01(
      args.input.attemptInterpretation.judgment_confidence * 0.42 +
        args.input.attemptInterpretation.evidence_strength * 0.26 +
        lenScore * 0.18 +
        (args.text.trim() ? 0.14 : 0),
    ),
  };
}

function buildSuccessMarkerScores(args: {
  input: ContractJudgingInput;
  text: string;
  textWords: string[];
  signalSummary: TextRubricSignalSummary;
}): RubricMarkerScore[] {
  return getSuccessMarkers(args.input.probeContractSnapshot).map((marker) => {
    const record = asRecord(marker);
    const marker_id =
      typeof record.marker_id === "string" ? (record.marker_id as EntityId) : null;
    const label = typeof record.label === "string" ? record.label : "Success marker";
    const description =
      typeof record.description === "string" ? record.description : null;
    const terms = markerTerms(label, description);
    const overlap = overlapScore(args.textWords, terms);

    const score = clamp01(
      overlap * 0.34 +
        args.signalSummary.interpretation_quality_score * 0.28 +
        args.signalSummary.length_score * 0.18 +
        args.signalSummary.explanation_shape_score * 0.14 +
        safeNumber(record.weight, 0.25) * 0.06,
    );

    return {
      marker_id,
      label,
      score,
      confidence: args.signalSummary.confidence,
      evidence_excerpt: evidenceExcerpt(args.text, terms),
      reasons: [
        `Heuristic rubric ${RUBRIC_JUDGING_VERSION} compared the response with this success marker.`,
        `Marker term overlap was ${overlap.toFixed(2)}.`,
        `Explanation shape score was ${args.signalSummary.explanation_shape_score.toFixed(2)}.`,
      ],
    };
  });
}

function buildFailureMarkerScores(args: {
  input: ContractJudgingInput;
  text: string;
  textWords: string[];
  signalSummary: TextRubricSignalSummary;
}): RubricMarkerScore[] {
  const modelSignals = asRecord(args.input.attemptInterpretation.model_signals_used);
  const confusion = safeNumber(modelSignals.confusion, 0.5);
  const insight = safeNumber(modelSignals.insight, 0.35);
  const evidenceWeakness = 1 - args.input.attemptInterpretation.evidence_strength;
  const textWeakness = 1 - args.signalSummary.length_score;
  const shapeWeakness = 1 - args.signalSummary.explanation_shape_score;

  return getFailureMarkers(args.input.probeContractSnapshot).map((marker) => {
    const record = asRecord(marker);
    const marker_id =
      typeof record.marker_id === "string" ? (record.marker_id as EntityId) : null;
    const label = typeof record.label === "string" ? record.label : "Failure marker";
    const description =
      typeof record.description === "string" ? record.description : null;
    const terms = markerTerms(label, description);
    const overlap = overlapScore(args.textWords, terms);
    const severity = safeNumber(record.severity, 0.5);

    const score = clamp01(
      evidenceWeakness * 0.24 +
        textWeakness * 0.22 +
        shapeWeakness * 0.18 +
        confusion * 0.14 +
        (1 - insight) * 0.1 +
        severity * 0.08 +
        overlap * 0.04,
    );

    return {
      marker_id,
      label,
      score,
      confidence: clamp01(args.signalSummary.confidence * 0.86 + severity * 0.14),
      evidence_excerpt: evidenceExcerpt(args.text, terms),
      reasons: [
        `Heuristic rubric ${RUBRIC_JUDGING_VERSION} estimated this failure marker from text weakness, evidence weakness, and marker overlap.`,
        `Evidence weakness was ${evidenceWeakness.toFixed(2)}.`,
        `Text weakness was ${textWeakness.toFixed(2)}.`,
      ],
    };
  });
}

function buildMisconceptionScores(args: {
  input: ContractJudgingInput;
  text: string;
  textWords: string[];
  failureMarkerScores: RubricMarkerScore[];
  signalSummary: TextRubricSignalSummary;
}): RubricMisconceptionScore[] {
  return getMisconceptionMappings(args.input.probeContractSnapshot).map((mapping) => {
    const record = asRecord(mapping);
    const misconception_id =
      typeof record.misconception_id === "string"
        ? (record.misconception_id as EntityId)
        : null;
    const label =
      typeof record.label === "string" ? record.label : "Possible misconception";
    const description =
      typeof record.description === "string" ? record.description : null;
    const terms = markerTerms(label, description);
    const overlap = overlapScore(args.textWords, terms);

    const failureMarkerIds = new Set(
      asArray(record.failure_marker_ids).filter(
        (id): id is EntityId => typeof id === "string",
      ),
    );

    const relatedFailures = args.failureMarkerScores.filter(
      (failure) => failure.marker_id && failureMarkerIds.has(failure.marker_id),
    );

    const relatedScore = relatedFailures.length
      ? relatedFailures.reduce((sum, failure) => sum + failure.score, 0) /
        relatedFailures.length
      : 0;

    const score = clamp01(relatedScore * 0.78 + overlap * 0.14 + 0.08);

    return {
      misconception_id,
      label,
      score,
      confidence: args.signalSummary.confidence,
      evidence_excerpt: evidenceExcerpt(args.text, terms),
      reasons: [
        relatedFailures.length
          ? `Estimated from ${relatedFailures.length} related failure marker score(s).`
          : "No linked failure marker score was available, so the misconception score stayed conservative.",
        `Misconception term overlap was ${overlap.toFixed(2)}.`,
      ],
    };
  });
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function judgeTextExplanationRubric(
  input: ContractJudgingInput,
): TextRubricJudgment | null {
  const rendererKind = getRendererKind(input.probeContractSnapshot);

  if (!isRubricTextRenderer(rendererKind)) return null;

  const text = getEvidenceText(input);
  if (!text) return null;

  const textWords = words(text);
  const allMarkers = [
    ...getSuccessMarkers(input.probeContractSnapshot),
    ...getFailureMarkers(input.probeContractSnapshot),
  ];
  const allTerms = unique(
    allMarkers.flatMap((marker) => {
      const record = asRecord(marker);
      return markerTerms(
        typeof record.label === "string" ? record.label : "",
        typeof record.description === "string" ? record.description : null,
      );
    }),
  );
  const markerOverlapScore = overlapScore(textWords, allTerms);
  const sourceGroundedSignal = buildSourceGroundedSignal({
    input,
    text,
    textWords,
  });

  const signalSummary = buildSignalSummary({
    text,
    markerOverlapScore,
    sourceGroundedSignal,
    input,
  });

  const successMarkerScores = buildSuccessMarkerScores({
    input,
    text,
    textWords,
    signalSummary,
  });
  const failureMarkerScores = buildFailureMarkerScores({
    input,
    text,
    textWords,
    signalSummary,
  });
  const misconceptionScores = buildMisconceptionScores({
    input,
    text,
    textWords,
    failureMarkerScores,
    signalSummary,
  });

  const successAverage = average(successMarkerScores.map((score) => score.score));
  const failureAverage = average(failureMarkerScores.map((score) => score.score));
  const misconceptionAverage = average(misconceptionScores.map((score) => score.score));

  const performanceScore = clamp01(
    successAverage * 0.52 +
      signalSummary.interpretation_quality_score * 0.22 +
      signalSummary.explanation_shape_score * 0.16 +
      signalSummary.length_score * 0.1 -
      failureAverage * 0.18,
  );

  const understandingScore = clamp01(
    performanceScore * 0.72 +
      signalSummary.marker_overlap_score * 0.12 +
      (1 - misconceptionAverage) * 0.1 +
      input.attemptInterpretation.evidence_strength * 0.06,
  );

  const cautions: string[] = [
    "This is a cheap local heuristic rubric, not a reviewed semantic judgment or LLM judgment.",
  ];

  if (sourceGroundedSignal) {
    cautions.push(
      "A provisional source-grounded signal was included, but it must not upgrade claim strength or be treated as a reviewed answer key.",
    );
    cautions.push(...sourceGroundedSignal.cautions);
  }

  if (signalSummary.word_count < 8) {
    cautions.push("The response was very short, so rubric confidence is limited.");
  }

  if (markerOverlapScore < 0.12) {
    cautions.push("The response had low lexical overlap with the contract markers.");
  }

  const reasons = [
    `Applied ${RUBRIC_JUDGING_VERSION} to a ${rendererKind} response.`,
    `Word count was ${signalSummary.word_count}.`,
    `Marker overlap score was ${markerOverlapScore.toFixed(2)}.`,
    `Performance score was ${performanceScore.toFixed(2)}.`,
    `Understanding score was ${understandingScore.toFixed(2)}.`,
  ];

  if (sourceGroundedSignal) {
    reasons.push(
      `Source-grounded scaffold signal confidence was ${sourceGroundedSignal.confidence.toFixed(2)}.`,
    );
    reasons.push(
      `Source focus overlap was ${sourceGroundedSignal.source_focus_overlap_score.toFixed(2)}.`,
    );
    reasons.push(
      `Relationship/mechanism overlap was ${sourceGroundedSignal.relationship_overlap_score.toFixed(2)}.`,
    );
  }

  return {
    method: "heuristic_rubric_text",
    performance_score: performanceScore,
    understanding_score: understandingScore,
    confidence: signalSummary.confidence,
    success_marker_scores: successMarkerScores,
    failure_marker_scores: failureMarkerScores,
    misconception_scores: misconceptionScores,
    source_grounded_signal: sourceGroundedSignal,
    reasons,
    cautions: unique(cautions),
  };
}

export function isUsableRubricJudgment(
  judgment: RubricJudgment | TextRubricJudgment | null,
): judgment is TextRubricJudgment {
  return judgment !== null && judgment.confidence > 0 && judgment.method !== "none";
}


