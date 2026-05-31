import type {
  EngineFuel,
  InterventionModeDecision,
  ModelSignals,
  PreviousModeOutcome,
} from "@/types/contracts";
import type { AttemptInterpretation } from "@/lib/engine/evidence";
import type { RouteTopic } from "@/lib/runtime/route-topics";
import type {
  buildJudgedAttempt,
  scoreResponse,
} from "@/lib/runtime/attempt-judging";
import type {
  buildNextProbePlan,
  buildNotApplicableProbePlan,
  buildResponseBundle,
} from "@/lib/runtime/probe-runtime";
import { hasUsableModelSignals } from "./confusion-insight-queue";
import { buildTopicStates } from "./attempt-input";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function buildPreviousModeOutcome(): PreviousModeOutcome {
  return {
    mode_selected: "probe",
    reasons: ["This run follows a submitted probe response."],
    confidence: 0.82,
    clarify_outcome: "not_applicable",
  };
}

function bodyResponseSignal(scoring: ReturnType<typeof scoreResponse>) {
  if (scoring.classification === "no_response") return 0.05;
  if (scoring.classification === "guess") return 0.25;
  if (scoring.classification === "structural_failure") return 0.35;
  if (scoring.classification === "near_miss") return 0.6;
  if (scoring.classification === "success") return 0.85;
  return 0.4;
}

function blendSignals(args: {
  current: number;
  interpretationSignal?: number | null;
  interpretationWeight?: number;
}) {
  const signal =
    typeof args.interpretationSignal === "number" &&
    Number.isFinite(args.interpretationSignal)
      ? clamp01(args.interpretationSignal)
      : null;

  if (signal === null) return clamp01(args.current);

  const weight = clamp01(args.interpretationWeight ?? 0.22);
  return clamp01(args.current * (1 - weight) + signal * weight);
}

function buildInterpretationDecisionReasons(
  attemptInterpretation: AttemptInterpretation | null | undefined,
) {
  if (!attemptInterpretation) return [];

  const reasons = [
    `Engine evidence interpreted the attempt as ${attemptInterpretation.modality} evidence with outcome ${attemptInterpretation.outcome}.`,
    `Engine evidence strength was ${attemptInterpretation.evidence_strength.toFixed(
      2,
    )} with interpretation confidence ${attemptInterpretation.judgment_confidence.toFixed(
      2,
    )}.`,
  ];

  if (attemptInterpretation.cautions.length > 0) {
    reasons.push(`Evidence interpretation caution: ${attemptInterpretation.cautions[0]}`);
  }

  return reasons;
}

export function buildDecision(args: {
  topic: RouteTopic;
  scoring: ReturnType<typeof scoreResponse>;
  replyBundle: ReturnType<typeof buildResponseBundle>;
  modelSignals: ModelSignals;
  attemptInterpretation?: AttemptInterpretation | null;
}): InterventionModeDecision {
  const { topic, scoring, replyBundle, modelSignals, attemptInterpretation } =
    args;
  const continueWithProbe = replyBundle.nextMode === "probe";

  const usableModelSignals = hasUsableModelSignals(modelSignals);
  const confusion = usableModelSignals ? modelSignals.model_confusion : null;
  const insight = usableModelSignals ? modelSignals.model_insight : null;

  const baseReadinessSignal =
    insight !== null
      ? Math.max(
          0,
          Math.min(
            1,
            scoring.correctnessEstimate * 0.42 +
              scoring.evidenceStrength * 0.28 +
              insight * 0.3,
          ),
        )
      : Math.max(
          0,
          Math.min(
            1,
            scoring.correctnessEstimate * 0.6 + scoring.evidenceStrength * 0.4,
          ),
        );

  const readinessSignal = blendSignals({
    current: baseReadinessSignal,
    interpretationSignal:
      attemptInterpretation === null || attemptInterpretation === undefined
        ? null
        : attemptInterpretation.evidence_strength * 0.56 +
          attemptInterpretation.judgment_confidence * 0.44,
    interpretationWeight: 0.18,
  });

  const baseEvidenceQualitySignal =
    confusion !== null && insight !== null
      ? Math.max(
          0,
          Math.min(
            1,
            scoring.explanationQuality * 0.34 +
              scoring.evidenceStrength * 0.26 +
              scoring.judgmentConfidence * 0.2 +
              insight * 0.18 -
              confusion * 0.12,
          ),
        )
      : Math.max(
          0,
          Math.min(
            1,
            scoring.explanationQuality * 0.45 +
              scoring.evidenceStrength * 0.35 +
              scoring.judgmentConfidence * 0.2,
          ),
        );

  const evidenceQualitySignal = blendSignals({
    current: baseEvidenceQualitySignal,
    interpretationSignal:
      attemptInterpretation === null || attemptInterpretation === undefined
        ? null
        : attemptInterpretation.evidence_strength,
    interpretationWeight: 0.24,
  });

  const classificationBase =
    scoring.classification === "success"
      ? 0.82
      : scoring.classification === "near_miss"
        ? 0.68
        : scoring.classification === "structural_failure"
          ? 0.64
          : scoring.classification === "guess"
            ? 0.58
            : 0.54;

  const decisionConfidence = Math.max(
    0,
    Math.min(
      0.95,
      classificationBase +
        scoring.evidenceStrength * 0.1 +
        scoring.judgmentConfidence * 0.12 +
        (attemptInterpretation?.judgment_confidence ?? 0) * 0.04 +
        (insight !== null ? insight * 0.04 : 0) -
        (confusion !== null ? confusion * 0.03 : 0),
    ),
  );

  const decisionReasons = [
    "This run is directly downstream of a delivered probe.",
    `The judged attempt classification was ${scoring.classification}.`,
    `Evidence strength was ${scoring.evidenceStrength.toFixed(
      2,
    )} and judgment confidence was ${scoring.judgmentConfidence.toFixed(2)}.`,
    ...buildInterpretationDecisionReasons(attemptInterpretation),
    replyBundle.whyThisNextStep,
  ];

  if (scoring.missingElements) {
    decisionReasons.push(
      `Important missing element detected: ${scoring.missingElements}.`,
    );
  }

  if (scoring.misconceptionTags.length > 0) {
    decisionReasons.push(
      `Detected misconception tags: ${scoring.misconceptionTags.join(", ")}.`,
    );
  }

  if (confusion !== null) {
    decisionReasons.push(
      `Confusion signal for this attempt-like turn was ${confusion.toFixed(2)}.`,
    );
  }

  if (insight !== null) {
    decisionReasons.push(
      `Insight signal for this attempt-like turn was ${insight.toFixed(2)}.`,
    );
  }

  return {
    mode_selected: continueWithProbe ? "probe" : "clarify",
    target_topic_id: topic.id,
    active_diagnosis: replyBundle.activeDiagnosis,
    primary_block: topic.nextStep,
    decision_confidence: decisionConfidence,
    decision_reasons: decisionReasons,
    clarify_score: continueWithProbe
      ? Math.max(
          0.2,
          Math.min(
            0.8,
            0.26 +
              (scoring.classification === "structural_failure" ? 0.18 : 0) +
              (scoring.classification === "near_miss" ? 0.12 : 0) +
              (scoring.missingElements ? 0.08 : 0) +
              (attemptInterpretation?.outcome === "weak_evidence" ? 0.04 : 0),
          ),
        )
      : Math.max(
          0.35,
          Math.min(
            0.92,
            0.62 +
              (scoring.classification === "structural_failure" ? 0.08 : 0) +
              (scoring.missingElements ? 0.06 : 0) +
              (attemptInterpretation?.outcome === "weak_evidence" ? 0.03 : 0),
          ),
        ),
    probe_score: continueWithProbe
      ? Math.max(
          0.4,
          Math.min(
            0.94,
            0.62 +
              scoring.evidenceStrength * 0.12 +
              (attemptInterpretation?.evidence_strength ?? 0) * 0.04 +
              (scoring.classification === "success" ? 0.08 : 0),
          ),
        )
      : Math.max(
          0.18,
          Math.min(
            0.7,
            0.26 +
              (scoring.classification === "guess" ? 0.05 : 0) +
              (scoring.classification === "no_response" ? 0.04 : 0),
          ),
        ),
    signal_summary: {
      raw_response_signal: bodyResponseSignal(scoring),
      evidence_quality_signal: evidenceQualitySignal,
      active_problem_signal: 0.72,
      readiness_signal: readinessSignal,
      history_signal: 0.75,
    },
  };
}

export function buildEngineFuel(args: {
  updatedTopics: RouteTopic[];
  decision: InterventionModeDecision;
  nextProbePlan:
    | ReturnType<typeof buildNextProbePlan>
    | ReturnType<typeof buildNotApplicableProbePlan>;
  judgedAttempt: ReturnType<typeof buildJudgedAttempt>;
  attemptInterpretation?: AttemptInterpretation | null;
}): EngineFuel {
  const { updatedTopics, decision, nextProbePlan, judgedAttempt } = args;

  /**
   * The new Engine Evidence V1 interpretation is intentionally not added to the
   * public EngineFuel contract yet. It is used inside buildDecision as a soft
   * brain signal first; once stable, the contract can grow a dedicated
   * attempt_interpretations field.
   */
  void args.attemptInterpretation;

  return {
    topics: buildTopicStates(updatedTopics),
    clusters: [],
    linked_pairs: [],
    previous_mode_outcome: buildPreviousModeOutcome(),
    intervention_mode_decision: decision,
    probe_plan: nextProbePlan,
    attempts: [judgedAttempt],
  };
}
