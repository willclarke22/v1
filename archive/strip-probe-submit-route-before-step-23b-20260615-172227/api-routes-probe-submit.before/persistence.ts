import {
  insertAttempt,
  insertRun,
  upsertTopicState,
} from "@/lib/persistence/myway";
import type {
  DeliveredProbe,
  InterventionModeDecision,
  LearningSpace,
  ModelSignals,
  MyWayRunResult,
  ProbeContractSnapshot,
} from "@/types/contracts";
import type { AttemptInterpretation } from "@/lib/learning-evaluation/attempt-evidence";
import { updateDiagnosisBeliefs } from "@/lib/learning-evaluation/diagnosis-state";
import type { ContractJudgment } from "@/lib/learning-evaluation/contract-judgment";
import type { RouteTopic } from "@/lib/topic-routing/route-topics";
import type {
  buildJudgedAttempt,
  buildTopicMetricUpdate,
} from "@/lib/learning-evaluation/attempt-judging";
import type {
  buildNextProbePlan,
  buildNotApplicableProbePlan,
} from "@/lib/intervention-planning/probe-runtime";
import { getEmbeddingPersistenceFields } from "./attempt-input";
import {
  appendPendingConfusionInsightScore,
  getProbeConfusionInsightScoringMode,
  getProbeConfusionInsightTimeoutMs,
  type JsonValue,
  type PendingConfusionInsightScore,
} from "./confusion-insight-queue";

function asJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asProbeContractSnapshot(
  value: unknown,
): ProbeContractSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as ProbeContractSnapshot;
}

function asActiveDiagnosis(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPersistedActiveDiagnosisFromTopicJson(topicJson: JsonValue) {
  const topicJsonRecord = asJsonRecord(topicJson);
  const diagnosisState = asJsonRecord(topicJsonRecord.diagnosis_state);
  const stateActiveDiagnosis = asActiveDiagnosis(diagnosisState.active_diagnosis);

  if (stateActiveDiagnosis) return stateActiveDiagnosis;

  return asActiveDiagnosis(topicJsonRecord.active_diagnosis);
}

function buildProbeContractPersistenceAudit(args: {
  nextProbePlan:
    | ReturnType<typeof buildNextProbePlan>
    | ReturnType<typeof buildNotApplicableProbePlan>;
}) {
  const snapshot = asProbeContractSnapshot(
    args.nextProbePlan.probe_contract_snapshot,
  );

  if (!snapshot) {
    return {
      available: false,
      contract_id: null,
      version: null,
      renderer_kind: null,
      target_diagnosis: args.nextProbePlan.target_diagnosis ?? null,
      probe_type: args.nextProbePlan.probe_type ?? null,
      reason: "No applicable probe contract snapshot was attached to this probe plan.",
    };
  }

  return {
    available: true,
    contract_id: snapshot.contract_id ?? null,
    version: snapshot.version ?? null,
    renderer_kind: snapshot.renderer_kind ?? null,
    target_diagnosis:
      snapshot.target_diagnosis ?? args.nextProbePlan.target_diagnosis ?? null,
    probe_type: snapshot.probe_type ?? args.nextProbePlan.probe_type ?? null,
    assessment_target: snapshot.assessment_target ?? null,
    success_marker_count: Array.isArray(
      snapshot.judging_schema?.success_markers,
    )
      ? snapshot.judging_schema.success_markers.length
      : null,
    failure_marker_count: Array.isArray(
      snapshot.judging_schema?.failure_markers,
    )
      ? snapshot.judging_schema.failure_markers.length
      : null,
    updated_at: new Date().toISOString(),
    source: "probe_plan_probe_contract_v1_1",
  };
}

function buildContractJudgmentAudit(args: {
  contractJudgment: ContractJudgment;
}) {
  const judgment = args.contractJudgment;

  return {
    version: judgment.version,
    judged_at: judgment.judged_at,
    contract_id: judgment.contract_id,
    probe_id: judgment.probe_id,
    topic_id: judgment.topic_id,
    outcome: judgment.outcome,
    contract_confidence: judgment.contract_confidence,
    evidence_strength: judgment.evidence_strength,
    evidence_tier: judgment.evidence_tier,
    allowed_claim_strength: judgment.allowed_claim_strength,
    can_make_strong_correctness_claim: judgment.can_make_strong_correctness_claim,
    source_policy: judgment.source_policy,
    source_grounded_signal: judgment.source_grounded_signal ?? null,
    judging_methods: judgment.judging_methods,
    success_score: judgment.success_score,
    failure_score: judgment.failure_score,
    misconception_score: judgment.misconception_score,
    success_marker_matches: judgment.success_marker_matches,
    failure_marker_matches: judgment.failure_marker_matches,
    misconception_matches: judgment.misconception_matches,
    diagnosis_delta: judgment.diagnosis_delta,
    resolution_delta: judgment.resolution_delta,
    suggested_active_diagnosis: judgment.suggested_active_diagnosis,
    structured_judgment: judgment.structured_judgment,
    rubric_judgment: judgment.rubric_judgment,
    reasons: judgment.reasons,
    cautions: judgment.cautions,
  };
}

function buildEngineEvidenceInterpretationAudit(args: {
  attemptInterpretation: AttemptInterpretation;
}) {
  const interpretation = args.attemptInterpretation;

  return {
    interpretation_id: interpretation.interpretation_id,
    evidence_id: interpretation.evidence_id,
    linked_topic_id: interpretation.linked_topic_id,
    linked_probe_id: interpretation.linked_probe_id,
    modality: interpretation.modality,
    outcome: interpretation.outcome,
    evidence_strength: interpretation.evidence_strength,
    judgment_confidence: interpretation.judgment_confidence,
    diagnosis_delta: interpretation.diagnosis_delta,
    model_signals_used: interpretation.model_signals_used,
    features: interpretation.features,
    reasons: interpretation.reasons,
    cautions: interpretation.cautions,
  };
}

export function buildProbeSubmitTopicJson(args: {
  topic: RouteTopic;
  topicLabel: string;
  pendingConfusionInsightScore: PendingConfusionInsightScore;
  bodyProbeId: string;
  judgedAttempt: ReturnType<typeof buildJudgedAttempt>;
  attemptInterpretation: AttemptInterpretation;
  contractJudgment: ContractJudgment;
  answeredProbeContractSnapshot: ProbeContractSnapshot | null;
  updatedTopicMetrics: ReturnType<typeof buildTopicMetricUpdate>;
  modelSignals: ModelSignals;
  nextProbePlan:
    | ReturnType<typeof buildNextProbePlan>
    | ReturnType<typeof buildNotApplicableProbePlan>;
  nextDeliveredProbe: DeliveredProbe | null;
  learningSpace: LearningSpace;
  updatedPersistedTopic: RouteTopic;
}): JsonValue {
  const embeddingFields = getEmbeddingPersistenceFields(args.updatedPersistedTopic);

  const topicJsonWithPendingScore = appendPendingConfusionInsightScore({
    topicJson: args.topic.topic_json,
    pendingScore: args.pendingConfusionInsightScore,
  });

  const previousTopicJson = asJsonRecord(topicJsonWithPendingScore);

  const diagnosisStateUpdate = updateDiagnosisBeliefs({
    previousState: previousTopicJson.diagnosis_state,
    currentActiveDiagnosis:
      args.contractJudgment.suggested_active_diagnosis ??
      args.nextProbePlan.target_diagnosis ??
      null,
    attemptInterpretation: args.attemptInterpretation,
    contractJudgment: args.contractJudgment,
    source: "contract_judgment_v1_1",
  });

  const persistedActiveDiagnosis = diagnosisStateUpdate.active_diagnosis;

  const answeredProbeContract = asProbeContractSnapshot(
    args.answeredProbeContractSnapshot,
  );

  const nextProbeContract = asProbeContractSnapshot(
    args.nextProbePlan.probe_contract_snapshot,
  );
  const deliveredProbeContract = asProbeContractSnapshot(
    args.nextDeliveredProbe?.probe_contract_snapshot ?? null,
  );

  const probeContractAudit = buildProbeContractPersistenceAudit({
    nextProbePlan: args.nextProbePlan,
  });

  return JSON.parse(
    JSON.stringify({
      ...topicJsonWithPendingScore,
      topic_id: args.topic.id,
      topic_label: args.topicLabel,

      /**
       * Keep top-level JSON diagnosis fields aligned with diagnosis_state so
       * enrichment/Qdrant/layout/debug consumers do not read a stale label.
       */
      active_diagnosis: persistedActiveDiagnosis,
      diagnosis: persistedActiveDiagnosis,

      next_step: args.nextProbePlan.text_plan.instructional_goal ?? args.topic.nextStep,
      previous_probe_id: args.bodyProbeId,
      answered_probe_contract: answeredProbeContract,
      last_answered_probe_contract: answeredProbeContract,
      judged_attempt: args.judgedAttempt,
      engine_evidence_interpretation: buildEngineEvidenceInterpretationAudit({
        attemptInterpretation: args.attemptInterpretation,
      }),
      last_engine_evidence_interpretation: {
        ...buildEngineEvidenceInterpretationAudit({
          attemptInterpretation: args.attemptInterpretation,
        }),
        updated_at: new Date().toISOString(),
        source: "probe_submit_engine_evidence_v1_1",
      },

      contract_judgment: buildContractJudgmentAudit({
        contractJudgment: args.contractJudgment,
      }),
      last_contract_judgment: {
        ...buildContractJudgmentAudit({
          contractJudgment: args.contractJudgment,
        }),
        updated_at: new Date().toISOString(),
        source: "contract_judging_v1_1",
      },
      contract_judgment_update: {
        outcome: args.contractJudgment.outcome,
        judged_against_contract_id: args.contractJudgment.contract_id,
        judged_against_answered_contract_available: answeredProbeContract !== null,
        contract_confidence: args.contractJudgment.contract_confidence,
        evidence_tier: args.contractJudgment.evidence_tier,
        allowed_claim_strength: args.contractJudgment.allowed_claim_strength,
        can_make_strong_correctness_claim:
          args.contractJudgment.can_make_strong_correctness_claim,
        source_policy: args.contractJudgment.source_policy,
        source_grounded_signal: args.contractJudgment.source_grounded_signal ?? null,
        judging_methods: args.contractJudgment.judging_methods,
        success_score: args.contractJudgment.success_score,
        failure_score: args.contractJudgment.failure_score,
        misconception_score: args.contractJudgment.misconception_score,
        diagnosis_delta: args.contractJudgment.diagnosis_delta,
        resolution_delta: args.contractJudgment.resolution_delta,
        suggested_active_diagnosis:
          args.contractJudgment.suggested_active_diagnosis,
        source: "contract_judging_v1_1",
        updated_at: new Date().toISOString(),
      },

      diagnosis_state: diagnosisStateUpdate.diagnosis_state,
      diagnosis_state_update: {
        active_diagnosis: diagnosisStateUpdate.active_diagnosis,
        changed: diagnosisStateUpdate.changed,
        reasons: diagnosisStateUpdate.reasons,
        source: "contract_judgment_v1_1",
        updated_at: new Date().toISOString(),
      },

      updated_topic_metrics: args.updatedTopicMetrics,
      probe_confusion_insight_signal: args.modelSignals,
      probe_confusion_insight_scoring_mode: getProbeConfusionInsightScoringMode(),
      probe_confusion_insight_timeout_ms: getProbeConfusionInsightTimeoutMs(),
      probe_confusion_insight_pending_score: args.pendingConfusionInsightScore,
      next_probe_plan: args.nextProbePlan,
      next_delivered_probe: args.nextDeliveredProbe,

      next_probe_contract: nextProbeContract,
      last_probe_contract: deliveredProbeContract ?? nextProbeContract,
      probe_contract_update: probeContractAudit,

      learning_space_topic:
        args.learningSpace.topics?.find((topic) => topic.topic_id === args.topic.id) ?? null,

      topic_position: args.updatedPersistedTopic.position,
      semantic_position: args.updatedPersistedTopic.semanticPosition ?? null,
      semantic_position_method:
        args.updatedPersistedTopic.semanticPositionMethod ?? null,
      semantic_position_updated_at:
        args.updatedPersistedTopic.semanticPositionUpdatedAt ?? null,

      topic_label_embedding_centroid: embeddingFields.topicLabelEmbeddingCentroid,
      topic_label_embedding_count: embeddingFields.topicLabelEmbeddingCount,
      topic_label_embedding_model: embeddingFields.topicLabelEmbeddingModel,
      topic_label_embedding_updated_at:
        embeddingFields.topicLabelEmbeddingUpdatedAt,

      topic_message_embedding_centroid:
        embeddingFields.topicMessageEmbeddingCentroid,
      topic_message_embedding_count: embeddingFields.topicMessageEmbeddingCount,
      topic_message_embedding_model: embeddingFields.topicMessageEmbeddingModel,
      topic_message_embedding_updated_at:
        embeddingFields.topicMessageEmbeddingUpdatedAt,
    }),
  ) as JsonValue;
}

export async function persistProbeSubmitRun(args: {
  runId: string;
  rawResponse: string;
  result: MyWayRunResult;
  judgedAttempt: ReturnType<typeof buildJudgedAttempt>;
  topic: RouteTopic;
  topicLabel: string;
  decision: InterventionModeDecision;
  replyText: string;
  suggestedAction: string;
  updatedTopicMetrics: ReturnType<typeof buildTopicMetricUpdate>;
  updatedPersistedTopic: RouteTopic;
  nextProbePlan:
    | ReturnType<typeof buildNextProbePlan>
    | ReturnType<typeof buildNotApplicableProbePlan>;
  topicJson: JsonValue;
}) {
  const runResultJson = JSON.parse(JSON.stringify(args.result));
  const attemptJson = JSON.parse(JSON.stringify(args.judgedAttempt));
  const embeddingFields = getEmbeddingPersistenceFields(args.updatedPersistedTopic);
  const persistedActiveDiagnosis =
    getPersistedActiveDiagnosisFromTopicJson(args.topicJson) ??
    args.decision.active_diagnosis;

  await insertRun({
    id: args.runId,
    runType: "probe_submit",
    userMessage: args.rawResponse,
    sourceMessageId: args.result.important_run_inputs.user_message.message_id,
    targetTopicId: args.topic.id,
    modeSelected: args.decision.mode_selected,
    activeDiagnosis: persistedActiveDiagnosis,
    replyText: args.replyText,
    suggestedAction: args.suggestedAction,
    runResultJson,
  });

  await insertAttempt({
    id: args.judgedAttempt.attempt_id,
    runId: args.runId,
    probeId: args.judgedAttempt.probe_id,
    topicId: args.judgedAttempt.topic_id,
    responseText:
      typeof args.judgedAttempt.raw_response.value === "string"
        ? args.judgedAttempt.raw_response.value
        : null,
    attemptJson,
  });

  await upsertTopicState({
    topicId: args.topic.id,
    lastRunId: args.runId,
    topicLabel: args.topicLabel,
    confusion: args.updatedTopicMetrics.confusion ?? null,
    insight: args.updatedTopicMetrics.insight ?? null,
    learningScore: args.updatedPersistedTopic.learningScore ?? null,

    /**
     * Use the diagnosis_state result, not only the decision label, so the row
     * diagnosis stays aligned with the smarter V1.1 diagnosis engine.
     */
    diagnosis: persistedActiveDiagnosis,

    nextStep: args.nextProbePlan.text_plan.instructional_goal ?? args.topic.nextStep,
    topicJson: args.topicJson,
    topicPosition: args.updatedPersistedTopic.position,
    semanticPosition: args.updatedPersistedTopic.semanticPosition ?? null,
    semanticPositionMethod: args.updatedPersistedTopic.semanticPositionMethod ?? null,
    semanticPositionUpdatedAt:
      args.updatedPersistedTopic.semanticPositionUpdatedAt ?? null,
    ...embeddingFields,
  });
}







