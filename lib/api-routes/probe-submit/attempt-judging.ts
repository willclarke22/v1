import type {
  EngineFuel,
  InterventionModeDecision,
  ModelSignals,
  PreviousModeOutcome,
  ProbeContractSnapshot,
} from "@/types/contracts";
import type {
  AttemptInterpretation,
  NormalizedEvidenceInput,
} from "@/lib/legacy-engine-bridges/attempt-evidence";
import {
  judgeProbeAttemptAgainstContract,
  type ContractJudgment,
} from "@/lib/legacy-engine-bridges/contract-judgment";
import type { RouteTopic } from "@/lib/topic-routing/route-topics";
import type {
  buildJudgedAttempt,
  scoreResponse,
} from "@/lib/learning-evaluation/attempt-judging";
import type {
  buildNextProbePlan,
  buildNotApplicableProbePlan,
  buildResponseBundle,
} from "@/lib/intervention-planning/probe-runtime";
import { hasUsableModelSignals } from "./confusion-insight-queue";
import { buildTopicStates } from "./attempt-input";

/**
 * Probe-submit attempt judging bridge.
 *
 * This file does not perform the core contract judgment itself. It consumes
 * route-level scoring, generic AttemptInterpretation, and now optional
 * ContractJudgment metadata to build the intervention decision / EngineFuel.
 *
 * The important V1.1 change:
 * ContractJudgment is allowed to influence decision confidence and reasons,
 * but EngineFuel is not expanded yet. That keeps the public contract stable
 * while the new judging pipeline settles.
 */


export function judgeProbeSubmitAttemptAgainstContract(args: {
  attemptInterpretation: AttemptInterpretation;
  normalizedEvidence: NormalizedEvidenceInput;
  probeContractSnapshot: ProbeContractSnapshot | null;
}): ContractJudgment {
  return judgeProbeAttemptAgainstContract({
    attemptInterpretation: args.attemptInterpretation,
    normalizedEvidence: args.normalizedEvidence,
    probeContractSnapshot: args.probeContractSnapshot,
  });
}

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

function buildContractJudgmentDecisionReasons(
  contractJudgment: ContractJudgment | null | undefined,
) {
  if (!contractJudgment) return [];

  const reasons = [
    `Contract judgment outcome was ${contractJudgment.outcome}.`,
    `Contract evidence tier was ${contractJudgment.evidence_tier}.`,
    `Contract success score was ${contractJudgment.success_score.toFixed(
      2,
    )} and failure score was ${contractJudgment.failure_score.toFixed(2)}.`,
    `Contract confidence was ${contractJudgment.contract_confidence.toFixed(2)}.`,
  ];

  if (contractJudgment.structured_judgment) {
    reasons.push(
      `Structured judgment was ${contractJudgment.structured_judgment.outcome} with performance ${contractJudgment.structured_judgment.performance_score.toFixed(
        2,
      )}.`,
    );
  }

  if (contractJudgment.cautions.length > 0) {
    reasons.push(`Contract judgment caution: ${contractJudgment.cautions[0]}`);
  }

  return reasons;
}

function contractReadinessSignal(
  contractJudgment: ContractJudgment | null | undefined,
) {
  if (!contractJudgment) return null;

  return clamp01(
    contractJudgment.success_score * 0.48 +
      (1 - contractJudgment.failure_score) * 0.2 +
      contractJudgment.contract_confidence * 0.22 +
      contractJudgment.evidence_strength * 0.1,
  );
}

function contractEvidenceQualitySignal(
  contractJudgment: ContractJudgment | null | undefined,
) {
  if (!contractJudgment) return null;

  const structuredBoost =
    contractJudgment.structured_judgment &&
    contractJudgment.structured_judgment.outcome !== "not_applicable" &&
    contractJudgment.structured_judgment.outcome !== "unjudgeable"
      ? contractJudgment.structured_judgment.confidence * 0.12
      : 0;

  return clamp01(
    contractJudgment.evidence_strength * 0.34 +
      contractJudgment.contract_confidence * 0.32 +
      Math.abs(contractJudgment.success_score - contractJudgment.failure_score) * 0.22 +
      structuredBoost,
  );
}

function contractDecisionConfidenceBoost(
  contractJudgment: ContractJudgment | null | undefined,
) {
  if (!contractJudgment) return 0;

  const outcomeBoost =
    contractJudgment.outcome === "contract_success"
      ? 0.05
      : contractJudgment.outcome === "contract_failure"
        ? 0.04
        : contractJudgment.outcome === "contract_partial"
          ? 0.025
          : 0;

  return clamp01(contractJudgment.contract_confidence * 0.06 + outcomeBoost);
}

export function buildDecision(args: {
  topic: RouteTopic;
  scoring: ReturnType<typeof scoreResponse>;
  replyBundle: ReturnType<typeof buildResponseBundle>;
  modelSignals: ModelSignals;
  attemptInterpretation?: AttemptInterpretation | null;
  contractJudgment?: ContractJudgment | null;
}): InterventionModeDecision {
  const {
    topic,
    scoring,
    replyBundle,
    modelSignals,
    attemptInterpretation,
    contractJudgment,
  } = args;
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

  const readinessWithInterpretation = blendSignals({
    current: baseReadinessSignal,
    interpretationSignal:
      attemptInterpretation === null || attemptInterpretation === undefined
        ? null
        : attemptInterpretation.evidence_strength * 0.56 +
          attemptInterpretation.judgment_confidence * 0.44,
    interpretationWeight: 0.18,
  });

  const readinessSignal = blendSignals({
    current: readinessWithInterpretation,
    interpretationSignal: contractReadinessSignal(contractJudgment),
    interpretationWeight: 0.22,
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

  const evidenceQualityWithInterpretation = blendSignals({
    current: baseEvidenceQualitySignal,
    interpretationSignal:
      attemptInterpretation === null || attemptInterpretation === undefined
        ? null
        : attemptInterpretation.evidence_strength,
    interpretationWeight: 0.24,
  });

  const evidenceQualitySignal = blendSignals({
    current: evidenceQualityWithInterpretation,
    interpretationSignal: contractEvidenceQualitySignal(contractJudgment),
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
        contractDecisionConfidenceBoost(contractJudgment) +
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
    ...buildContractJudgmentDecisionReasons(contractJudgment),
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

  const contractFailurePressure =
    contractJudgment?.outcome === "contract_failure" ? 0.06 : 0;
  const contractPartialPressure =
    contractJudgment?.outcome === "contract_partial" ? 0.03 : 0;
  const contractSuccessBoost =
    contractJudgment?.outcome === "contract_success" ? 0.06 : 0;

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
            0.84,
            0.26 +
              (scoring.classification === "structural_failure" ? 0.18 : 0) +
              (scoring.classification === "near_miss" ? 0.12 : 0) +
              (scoring.missingElements ? 0.08 : 0) +
              (attemptInterpretation?.outcome === "weak_evidence" ? 0.04 : 0) +
              contractFailurePressure +
              contractPartialPressure,
          ),
        )
      : Math.max(
          0.35,
          Math.min(
            0.92,
            0.62 +
              (scoring.classification === "structural_failure" ? 0.08 : 0) +
              (scoring.missingElements ? 0.06 : 0) +
              (attemptInterpretation?.outcome === "weak_evidence" ? 0.03 : 0) +
              contractFailurePressure,
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
              contractSuccessBoost +
              (scoring.classification === "success" ? 0.08 : 0),
          ),
        )
      : Math.max(
          0.18,
          Math.min(
            0.7,
            0.26 +
              (scoring.classification === "guess" ? 0.05 : 0) +
              (scoring.classification === "no_response" ? 0.04 : 0) +
              contractPartialPressure,
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
  contractJudgment?: ContractJudgment | null;
}): EngineFuel {
  const { updatedTopics, decision, nextProbePlan, judgedAttempt } = args;

  /**
   * AttemptInterpretation and ContractJudgment are intentionally not added to
   * the public EngineFuel contract yet. They influence decisions/diagnosis in
   * the route layer first; once stable, EngineFuel can grow dedicated
   * attempt_interpretations / contract_judgments fields.
   */
  void args.attemptInterpretation;
  void args.contractJudgment;

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




