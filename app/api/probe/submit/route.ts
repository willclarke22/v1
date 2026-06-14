import { NextRequest, NextResponse } from "next/server";
import { buildLearningSpace } from "@/lib/build-learning-space";
import { makeId } from "@/lib/utils/ids";
import type {
  LearningSpace,
  ModelSignals,
  MyWayRunResult,
  ProbeSubmitRouteResponse,
} from "@/types/contracts";
import {
  buildJudgedAttempt,
  buildVectorInfo,
  inferDiagnosisFromTopic,
  scoreResponse,
} from "@/lib/runtime/attempt-judging";
import {
  buildNextProbePlan,
  buildNotApplicableProbePlan,
  buildResponseBundle,
} from "@/lib/runtime/probe-runtime";
import { loadRouteTopics } from "@/lib/runtime/route-topics";
import { buildRunMetadata } from "@/lib/runtime/probe-submit-route/timing";
import {
  getAnsweredProbeContractSnapshot,
  getRouteTopicLabel,
  normalizeProbeRawResponse,
  validateProbeSubmitBody,
  type ProbeSubmitBody,
} from "@/lib/runtime/probe-submit-route/request-context";
import {
  buildPendingProbeConfusionInsightScore,
  buildProbeSubmitModelSignals,
} from "@/lib/runtime/probe-submit-route/confusion-insight-queue";
import {
  buildDeliveredProbeFromPlan,
  buildDeliveredResponse,
  buildSceneUpdate,
} from "@/lib/runtime/probe-submit-route/response-bundle";
import { buildAttemptEvidencePackage } from "@/lib/runtime/probe-submit-route/attempt-input";
import { judgeProbeAttemptAgainstContract } from "@/lib/engine/judging";
import {
  buildDecision,
  buildEngineFuel,
} from "@/lib/runtime/probe-submit-route/attempt-judging";
import { buildUpdatedTopicsAfterProbeSubmit } from "@/lib/runtime/probe-submit-route/topic-metric-update";
import {
  buildProbeSubmitTopicJson,
  persistProbeSubmitRun,
} from "@/lib/runtime/probe-submit-route/persistence";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProbeSubmitBody;
    const rawResponse = normalizeProbeRawResponse(body);

    const validationError = validateProbeSubmitBody({ body, rawResponse });
    if (validationError) return validationError;

    const routeTopics = await loadRouteTopics();

    if (!routeTopics.length) {
      return NextResponse.json(
        { error: "No topics are available." },
        { status: 500 },
      );
    }

    const topic = routeTopics.find((t) => t.id === body.topicId) ?? routeTopics[0];

    if (!topic) {
      return NextResponse.json(
        { error: "Unable to resolve a topic for this probe submission." },
        { status: 500 },
      );
    }

    const topicLabel = body.topicLabel || getRouteTopicLabel(topic);
    const provisionalDiagnosis = inferDiagnosisFromTopic(topic);
    const answeredProbeContractSnapshot = getAnsweredProbeContractSnapshot(body);

    const runId = makeId("run");

    const pendingConfusionInsightScore = buildPendingProbeConfusionInsightScore({
      runId,
      body,
      topic,
      topicLabel,
      rawResponse,
      activeDiagnosis: provisionalDiagnosis,
    });

    const modelSignals: ModelSignals = buildProbeSubmitModelSignals();

    const vectorInfo = buildVectorInfo(topic);

    const attemptEvidencePackage = buildAttemptEvidencePackage({
      body: { ...body, response: rawResponse },
      topic,
      vectorInfo,
      modelSignals,
      rawResponse,
      activeDiagnosis: provisionalDiagnosis,
    });

    const scoring = scoreResponse(rawResponse, {
      topic,
      prompt: body.prompt ?? topic.nextStep,
      activeDiagnosis: provisionalDiagnosis,
    });

    const replyBundle = buildResponseBundle({
      topicLabel,
      classification: scoring.classification,
      explanationQuality: scoring.explanationQuality,
      insight: scoring.insight,
      evidenceStrength: scoring.evidenceStrength,
      judgmentConfidence: scoring.judgmentConfidence,
      missingElements: scoring.missingElements,
      misconceptionTags: scoring.misconceptionTags,
    });

    const { updatedTopicMetrics, updatedTopics } =
      buildUpdatedTopicsAfterProbeSubmit({
        routeTopics,
        topicId: body.topicId,
        scoring,
      });

    const judgedAttempt = buildJudgedAttempt({
      body: {
        ...body,
        response: rawResponse,
      },
      topic,
      scoring,
      activeDiagnosis: replyBundle.activeDiagnosis,
    });

    const nextProbePlan =
      replyBundle.nextMode === "probe" &&
      replyBundle.probeIntent &&
      replyBundle.probeType
        ? buildNextProbePlan({
            topic,
            activeDiagnosis: replyBundle.activeDiagnosis,
            probeIntent: replyBundle.probeIntent,
            probeType: replyBundle.probeType,
            classification: scoring.classification,
            evidenceStrength: scoring.evidenceStrength,
            judgmentConfidence: scoring.judgmentConfidence,
            missingElements: scoring.missingElements,
            misconceptionTags: scoring.misconceptionTags,
          })
        : buildNotApplicableProbePlan(topic);

    const nextDeliveredProbe =
      replyBundle.nextMode === "probe" && nextProbePlan.status === "applicable"
        ? buildDeliveredProbeFromPlan(nextProbePlan)
        : null;

    /**
     * Prefer the contract that was actually answered. If the client does not
     * send it, fall back to the next plan's snapshot as a compatibility bridge.
     */
    const contractJudgment = judgeProbeAttemptAgainstContract({
      attemptInterpretation: attemptEvidencePackage.attemptInterpretation,
      normalizedEvidence: attemptEvidencePackage.normalizedEvidence,
      probeContractSnapshot:
        answeredProbeContractSnapshot ?? nextProbePlan.probe_contract_snapshot,
    });

    const decision = buildDecision({
      topic,
      scoring,
      replyBundle,
      modelSignals,
      attemptInterpretation: attemptEvidencePackage.attemptInterpretation,
      contractJudgment,
    });

    const engineFuel = buildEngineFuel({
      updatedTopics,
      decision,
      nextProbePlan,
      judgedAttempt,
      attemptInterpretation: attemptEvidencePackage.attemptInterpretation,
      contractJudgment,
    });

    /**
     * Compatibility bridge:
     *
     * buildLearningSpace now returns the richer renderer contract from
     * types/learning-space. Some route/result contracts still reference the older
     * LearningSpace type from types/contracts. Runtime JSON shape is compatible
     * for the fields consumers use, but TypeScript needs this bridge until
     * types/contracts is updated to consume/re-export the canonical
     * types/learning-space contract.
     */
    const learningSpace = buildLearningSpace(updatedTopics) as unknown as LearningSpace;

    const result: MyWayRunResult = {
      run_metadata: buildRunMetadata(engineFuel, runId),
      important_run_inputs: attemptEvidencePackage.importantRunInputs,
      engine_fuel: engineFuel,
      delivered_response: buildDeliveredResponse(
        replyBundle.reply,
        replyBundle.nextMode,
        nextDeliveredProbe,
      ),
      learning_space: learningSpace,
    };

    const updatedPersistedTopic =
      updatedTopics.find((t) => t.id === topic.id) ?? topic;

    const topicJson = buildProbeSubmitTopicJson({
      topic,
      topicLabel,
      pendingConfusionInsightScore,
      bodyProbeId: body.probeId,
      judgedAttempt,
      attemptInterpretation: attemptEvidencePackage.attemptInterpretation,
      contractJudgment,
      answeredProbeContractSnapshot,
      updatedTopicMetrics,
      modelSignals,
      nextProbePlan,
      nextDeliveredProbe,
      learningSpace,
      updatedPersistedTopic,
    });

    await persistProbeSubmitRun({
      runId,
      rawResponse,
      result,
      judgedAttempt,
      topic,
      topicLabel,
      decision,
      replyText: replyBundle.reply,
      suggestedAction: replyBundle.suggestedAction,
      updatedTopicMetrics,
      updatedPersistedTopic,
      nextProbePlan,
      topicJson,
    });

    const response: ProbeSubmitRouteResponse = {
      result,
      scene_update: buildSceneUpdate(topic.id, learningSpace),
      continue_probe_loop: nextDeliveredProbe !== null,
      next_probe: nextDeliveredProbe,
      updated_topic_metrics: {
        topicId: body.topicId,
        confusion: updatedTopicMetrics.confusion,
        insight: updatedTopicMetrics.insight,
        learningScore: updatedTopicMetrics.learningScore,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("POST /api/probe/submit failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process probe submission.",
      },
      { status: 500 },
    );
  }
}
