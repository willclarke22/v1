"use client";

import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Topic } from "@/types/topic";
import type { ProbeSummary } from "@/components/probes/probe-surface";
import {
  isTopicPosition3D,
  type TopicPosition3D,
} from "@/lib/learning-space/topic-position";
import type {
  DeliveredProbe,
  FrontendInterventionSummary,
  FrontendTopicMetricUpdate,
  LearningSpace,
  MessageRouteResponse,
  MyWayRunResult,
  ProbeContractSnapshot,
  ProbeSubmitRouteResponse,
} from "@/types/contracts";

type ProbeSubmitPayload = {
  probeId: string;
  topicId: string;
  response: string;
  probeContractSnapshot?: ProbeContractSnapshot | null;
};

type LegacyProbeSubmitApiResponse = {
  result?: MyWayRunResult;
  scene_update?: ProbeSubmitRouteResponse["scene_update"];
  continue_probe_loop?: boolean;
  next_probe?: DeliveredProbe | null;

  reply?: string;
  suggestedAction?: string;
  statusLabel?: string;
  whyThisNextStep?: string;
  activeDiagnosis?: string;
  probeIntent?: string;
  probeType?: string;
  updated_topic_metrics?: FrontendTopicMetricUpdate;
  updatedTopicMetrics?: FrontendTopicMetricUpdate;
  judgedAttempt?: {
    attemptId: string;
    probeId: string;
    topicId: string;
    submittedAt: string;
    response: string;
    responseType: string;
    metadata?: {
      latencyMs?: number | null;
      revisionCount?: number | null;
      usedHint?: boolean | null;
      requestedClarificationBeforeAnswering?: boolean | null;
    };
    judgment?: {
      classification?: string;
      correctnessEstimate?: number;
      explanationQuality?: number;
      insight?: number;
      confusion?: number;
      wordCount?: number;
    };
  };
  probeCompleted?: boolean;
  nextProbe?: {
    probeId: string;
    topicId: string;
    topicLabel?: string;
    title?: string;
    prompt: string;
    type?: string;
  } | null;
  error?: string;
};

type UseProbeFlowParams = {
  topics: Topic[];
  setTopics: Dispatch<SetStateAction<Topic[]>>;
  focusTopic: (topicId: string | null) => void;
  openMyWayPanel: () => void;
  hidePanelsForProbeEntry: () => void;
  onLearningSpaceUpdate?: (learningSpace: LearningSpace | null) => void;
};

const MAX_CONSECUTIVE_PROBES = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asTopicPosition(value: unknown): TopicPosition3D | null {
  return isTopicPosition3D(value) ? value : null;
}

function extractLearningSpaceFromMessageResponse(
  data: MessageRouteResponse,
): LearningSpace | null {
  return data.scene_update?.learning_space ?? data.result?.learning_space ?? null;
}

function extractLearningSpaceFromProbeSubmitResponse(
  data: LegacyProbeSubmitApiResponse,
): LearningSpace | null {
  return data.scene_update?.learning_space ?? data.result?.learning_space ?? null;
}

function extractInterventionFromMessageResponse(
  data: MessageRouteResponse,
): FrontendInterventionSummary | null {
  return (
    data.intervention ??
    (data.result
      ? {
          mode_selected:
            data.result.engine_fuel.intervention_mode_decision.mode_selected,
          target_topic_id:
            data.result.engine_fuel.intervention_mode_decision.target_topic_id,
          active_diagnosis:
            data.result.engine_fuel.intervention_mode_decision.active_diagnosis,
          probe_available:
            data.result.delivered_response.delivered_probe !== null
              ? "available"
              : "not_applicable",
          status_label: "",
          suggested_action: "",
        }
      : null)
  );
}

function extractReplyFromMessageResponse(data: MessageRouteResponse) {
  return data.result?.delivered_response?.learner_message?.text ?? "";
}

function extractSuggestedActionFromMessageResponse(data: MessageRouteResponse) {
  return (
    data.result?.delivered_response?.delivered_probe?.title ??
    data.result?.engine_fuel?.probe_plan?.text_plan?.instructional_goal ??
    data.result?.engine_fuel?.intervention_mode_decision?.decision_reasons?.[0] ??
    ""
  );
}

function extractMetricUpdateFromMessageResponse(
  data: MessageRouteResponse,
): FrontendTopicMetricUpdate | null {
  const targetTopicId =
    data.intervention?.target_topic_id ??
    data.scene_update?.target_topic_id ??
    data.result?.engine_fuel?.intervention_mode_decision?.target_topic_id ??
    null;

  if (!targetTopicId) {
    return null;
  }

  const topic = data.result?.engine_fuel?.topics?.find(
    (item) => item.topic_id === targetTopicId,
  );

  if (!topic) {
    return null;
  }

  return {
    topicId: topic.topic_id,
    confusion: topic.topic_confusion_average ?? null,
    insight: topic.topic_insight_average ?? null,
    learningScore: topic.topic_learning_score ?? null,
  };
}

function applyLearningSpaceToTopics(
  topics: Topic[],
  learningSpace: LearningSpace | null,
): Topic[] {
  if (!learningSpace?.topics?.length) {
    return topics;
  }

  const learningSpaceTopicsById = new Map(
    learningSpace.topics.map((topic) => [topic.topic_id, topic]),
  );

  return topics.map((topic) => {
    const learningSpaceTopic = learningSpaceTopicsById.get(topic.id);

    if (!learningSpaceTopic) {
      return topic;
    }

    const position = asTopicPosition(learningSpaceTopic.position);
    const semanticPosition = asTopicPosition(
      learningSpaceTopic.layout?.semantic_position,
    );

    return {
      ...topic,
      position: position ?? topic.position,
      semanticPosition: semanticPosition ?? topic.semanticPosition ?? null,
      semanticPositionMethod:
        learningSpaceTopic.layout?.semantic_position_method ??
        topic.semanticPositionMethod ??
        null,
      semanticPositionUpdatedAt:
        learningSpaceTopic.layout?.semantic_position_updated_at ??
        topic.semanticPositionUpdatedAt ??
        null,
      positionSource:
        learningSpaceTopic.layout?.position_source ??
        topic.positionSource ??
        "topic_position",
    };
  });
}

function mapDeliveredProbeToSummary(
  deliveredProbe: DeliveredProbe | null | undefined,
): ProbeSummary | null {
  if (!deliveredProbe?.probe_id || !deliveredProbe?.target_topic_id) {
    return null;
  }

  return {
    id: deliveredProbe.probe_id,
    topicId: deliveredProbe.target_topic_id,
    topicLabel: undefined,
    title: deliveredProbe.title || "Probe",
    instruction: deliveredProbe.instructions || "Continue with this probe.",
    status: "available",
    intent: deliveredProbe.intent ?? null,
    probeType: deliveredProbe.probe_type ?? null,
    expectedResponseType: deliveredProbe.expected_response_type ?? null,
    helperText: deliveredProbe.actual_context_framing ?? null,
    probeContractSnapshot: deliveredProbe.probe_contract_snapshot ?? null,
  };
}

function extractProbeFromMessageResponse(
  data: MessageRouteResponse,
): ProbeSummary | null {
  return mapDeliveredProbeToSummary(
    data.result?.delivered_response?.delivered_probe,
  );
}

function extractReplyFromProbeSubmitResponse(data: LegacyProbeSubmitApiResponse) {
  return (
    data.result?.delivered_response?.learner_message?.text ??
    data.reply ??
    "Your probe response was received, but no follow-up message came back."
  );
}

function extractSuggestedActionFromProbeSubmitResponse(
  data: LegacyProbeSubmitApiResponse,
) {
  return (
    data.suggestedAction ??
    data.result?.engine_fuel?.intervention_mode_decision?.decision_reasons?.[0] ??
    ""
  );
}

function extractMetricUpdateFromProbeSubmitResponse(
  data: LegacyProbeSubmitApiResponse,
): FrontendTopicMetricUpdate | undefined {
  return data.updated_topic_metrics ?? data.updatedTopicMetrics ?? undefined;
}

function extractNextProbeFromProbeSubmitResponse(
  data: LegacyProbeSubmitApiResponse,
): ProbeSummary | null {
  const contractProbe = mapDeliveredProbeToSummary(
    data.result?.delivered_response?.delivered_probe,
  );

  if (contractProbe) return contractProbe;

  const topLevelContractProbe = mapDeliveredProbeToSummary(data.next_probe);

  if (topLevelContractProbe) return topLevelContractProbe;

  if (!data.nextProbe) return null;

  const topicLabel = data.nextProbe.topicLabel?.trim() || undefined;

  return {
    id: data.nextProbe.probeId,
    topicId: data.nextProbe.topicId,
    topicLabel,
    title: data.nextProbe.title || topicLabel || "Next Probe",
    instruction: data.nextProbe.prompt,
    status: "available",
    intent: null,
    probeType: data.nextProbe.type ?? null,
    expectedResponseType: null,
    helperText: null,
    probeContractSnapshot: null,
  };
}

function extractContinueProbeLoop(
  data: LegacyProbeSubmitApiResponse,
  mappedNextProbe: ProbeSummary | null,
  nextCount: number,
) {
  if (typeof data.continue_probe_loop === "boolean") {
    return (
      data.continue_probe_loop &&
      nextCount < MAX_CONSECUTIVE_PROBES &&
      !!mappedNextProbe
    );
  }

  return nextCount < MAX_CONSECUTIVE_PROBES && !!mappedNextProbe;
}

export function useProbeFlow({
  topics,
  setTopics,
  focusTopic,
  openMyWayPanel,
  hidePanelsForProbeEntry,
  onLearningSpaceUpdate,
}: UseProbeFlowParams) {
  const [isSending, setIsSending] = useState(false);
  const [isSubmittingProbe, setIsSubmittingProbe] = useState(false);

  const [latestReply, setLatestReply] = useState("");
  const [suggestedAction, setSuggestedAction] = useState("");

  const [availableProbe, setAvailableProbe] = useState<ProbeSummary | null>(null);
  const [activeProbeId, setActiveProbeId] = useState<string | null>(null);
  const [sceneMode, setSceneMode] = useState<"space" | "probe">("space");

  const [isEnteringProbe, setIsEnteringProbe] = useState(false);
  const [probeEntryTopicId, setProbeEntryTopicId] = useState<string | null>(null);

  const [consecutiveProbeCount, setConsecutiveProbeCount] = useState(0);

  const [probeFeedback, setProbeFeedback] = useState<{
    reply: string;
    suggestedAction: string;
  } | null>(null);

  const activeProbe = useMemo(() => {
    return availableProbe && availableProbe.id === activeProbeId
      ? availableProbe
      : null;
  }, [availableProbe, activeProbeId]);

  const applyTopicMetricUpdate = useCallback(
    (update?: FrontendTopicMetricUpdate) => {
      if (!update) return;

      setTopics((prevTopics) =>
        prevTopics.map((topic) => {
          if (topic.id !== update.topicId) {
            return topic;
          }

          return {
            ...topic,
            confusion:
              update.confusion !== undefined && update.confusion !== null
                ? clamp(update.confusion, 0, 1)
                : topic.confusion,
            insight:
              update.insight !== undefined && update.insight !== null
                ? clamp(update.insight, 0, 1)
                : topic.insight,
            learningScore:
              update.learningScore !== undefined && update.learningScore !== null
                ? clamp(update.learningScore, 0, 1)
                : topic.learningScore,
          };
        }),
      );
    },
    [setTopics],
  );

  const applyLearningSpaceUpdate = useCallback(
    (learningSpace: LearningSpace | null) => {
      if (!learningSpace) return;

      onLearningSpaceUpdate?.(learningSpace);

      setTopics((prevTopics) =>
        applyLearningSpaceToTopics(prevTopics, learningSpace),
      );
    },
    [onLearningSpaceUpdate, setTopics],
  );

  const resetProbeStateForMessage = useCallback(() => {
    setAvailableProbe(null);
    setActiveProbeId(null);
    setSceneMode("space");
    setIsEnteringProbe(false);
    setProbeEntryTopicId(null);
    setProbeFeedback(null);
    setConsecutiveProbeCount(0);
  }, []);

  const startMessageFlow = useCallback(() => {
    setIsSending(true);
    resetProbeStateForMessage();
  }, [resetProbeStateForMessage]);

  const finishMessageFlowSuccess = useCallback(
    (data: MessageRouteResponse) => {
      const metricUpdate = extractMetricUpdateFromMessageResponse(data);
      if (metricUpdate) {
        applyTopicMetricUpdate(metricUpdate);
      }

      const returnedLearningSpace = extractLearningSpaceFromMessageResponse(data);
      if (returnedLearningSpace) {
        applyLearningSpaceUpdate(returnedLearningSpace);
      }

      const intervention = extractInterventionFromMessageResponse(data);
      const nextProbe = extractProbeFromMessageResponse(data);

      setLatestReply(extractReplyFromMessageResponse(data));
      setSuggestedAction(extractSuggestedActionFromMessageResponse(data));

      const resolvedTopicId =
        intervention?.target_topic_id ?? data.scene_update?.target_topic_id ?? null;

      if (resolvedTopicId) {
        focusTopic(resolvedTopicId);
      }

      if (intervention?.mode_selected === "probe" && nextProbe) {
        setAvailableProbe(nextProbe);
        setActiveProbeId(null);
        setSceneMode("space");
      } else {
        setAvailableProbe(null);
        setActiveProbeId(null);
        setSceneMode("space");
        setIsEnteringProbe(false);
        setProbeEntryTopicId(null);
      }

      setProbeFeedback(null);
      setConsecutiveProbeCount(0);
      setIsSending(false);
    },
    [applyLearningSpaceUpdate, applyTopicMetricUpdate, focusTopic],
  );

  const finishMessageFlowError = useCallback(() => {
    setLatestReply("Sorry, something went wrong while sending your message.");
    setSuggestedAction("Try sending your question again.");
    setAvailableProbe(null);
    setActiveProbeId(null);
    setSceneMode("space");
    setIsEnteringProbe(false);
    setProbeEntryTopicId(null);
    setProbeFeedback(null);
    setIsSending(false);
  }, []);

  const handleOpenProbe = useCallback(
    (probe: ProbeSummary) => {
      focusTopic(probe.topicId);
      setActiveProbeId(probe.id);
      setProbeEntryTopicId(probe.topicId);
      setIsEnteringProbe(true);
      setSceneMode("space");
      setProbeFeedback(null);

      setAvailableProbe((prev) =>
        prev && prev.id === probe.id ? { ...prev, status: "active" } : prev,
      );

      hidePanelsForProbeEntry();
    },
    [focusTopic, hidePanelsForProbeEntry],
  );

  const handleProbeEntryComplete = useCallback(() => {
    setIsEnteringProbe(false);
    setProbeEntryTopicId(null);
    setSceneMode("probe");
  }, []);

  const handleExitProbe = useCallback(() => {
    setSceneMode("space");
    setIsEnteringProbe(false);
    setProbeEntryTopicId(null);
    setProbeFeedback(null);

    setAvailableProbe((prev) =>
      prev && prev.id === activeProbeId ? { ...prev, status: "available" } : prev,
    );

    setActiveProbeId(null);
  }, [activeProbeId]);

  const handleSubmitProbe = useCallback(
    async (payload: ProbeSubmitPayload) => {
      const topic =
        topics.find((candidate) => candidate.id === payload.topicId) ?? null;

      const currentProbe =
        availableProbe && availableProbe.id === payload.probeId
          ? availableProbe
          : null;

      try {
        setIsSubmittingProbe(true);

        const response = await fetch("/api/probe/submit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            probeId: payload.probeId,
            topicId: payload.topicId,
            topicLabel: topic?.topic_label ?? topic?.id ?? "this topic",
            prompt: currentProbe?.instruction ?? null,
            response: payload.response,
            probeContractSnapshot:
              currentProbe?.probeContractSnapshot ??
              payload.probeContractSnapshot ??
              null,
            answeredProbeContractSnapshot:
              currentProbe?.probeContractSnapshot ??
              payload.probeContractSnapshot ??
              null,
            submittedAt: new Date().toISOString(),
            responseType: "text",
            deliveryContext: {
              renderer_type: "text_renderer",
              generator: "chatgpt",
              modality: "text",
              tone: "encouraging",
              pacing: "normal",
              language_style: "plain",
              context_framing: currentProbe?.instruction ?? null,
            },
            metadata: {
              latencyMs: null,
              revisionCount: null,
              usedHint: null,
              requestedClarificationBeforeAnswering: null,
            },
          }),
        });

        const data: LegacyProbeSubmitApiResponse = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || `Probe submit failed with status ${response.status}`,
          );
        }

        const metricUpdate = extractMetricUpdateFromProbeSubmitResponse(data);
        if (metricUpdate) {
          applyTopicMetricUpdate(metricUpdate);
        }

        const returnedLearningSpace = extractLearningSpaceFromProbeSubmitResponse(data);
        if (returnedLearningSpace) {
          applyLearningSpaceUpdate(returnedLearningSpace);
        }

        const replyText = extractReplyFromProbeSubmitResponse(data);
        const actionText = extractSuggestedActionFromProbeSubmitResponse(data);

        setLatestReply(replyText);
        setSuggestedAction(actionText);
        setProbeFeedback({
          reply: replyText,
          suggestedAction: actionText,
        });

        const nextCount = consecutiveProbeCount + 1;
        const mappedNextProbe = extractNextProbeFromProbeSubmitResponse(data);
        const shouldContinueProbeLoop = extractContinueProbeLoop(
          data,
          mappedNextProbe,
          nextCount,
        );

        setConsecutiveProbeCount(nextCount);

        if (shouldContinueProbeLoop && mappedNextProbe) {
          setAvailableProbe({ ...mappedNextProbe, status: "active" });
          setActiveProbeId(mappedNextProbe.id);
          setSceneMode("probe");
          setIsEnteringProbe(false);
          setProbeEntryTopicId(null);
        } else {
          setAvailableProbe(null);
          setSceneMode("space");
          setActiveProbeId(null);
          setIsEnteringProbe(false);
          setProbeEntryTopicId(null);
          openMyWayPanel();

          const resolvedTopicId =
            data.scene_update?.target_topic_id ??
            data.result?.engine_fuel?.intervention_mode_decision?.target_topic_id ??
            payload.topicId;

          if (resolvedTopicId) {
            focusTopic(resolvedTopicId);
          }
        }
      } catch (error) {
        console.error("Probe submission failed:", error);

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Sorry, something went wrong while submitting your probe response.";

        setLatestReply(errorMessage);
        setSuggestedAction("Try submitting your response again.");
        setProbeFeedback({
          reply: errorMessage,
          suggestedAction: "Try submitting your response again.",
        });

        setAvailableProbe((prev) =>
          prev && prev.id === payload.probeId
            ? { ...prev, status: "active" }
            : prev,
        );

        setSceneMode("probe");
        setIsEnteringProbe(false);
        setProbeEntryTopicId(null);
      } finally {
        setIsSubmittingProbe(false);
      }
    },
    [
      topics,
      availableProbe,
      consecutiveProbeCount,
      applyLearningSpaceUpdate,
      applyTopicMetricUpdate,
      openMyWayPanel,
      focusTopic,
    ],
  );

  return {
    isSending,
    isSubmittingProbe,
    latestReply,
    suggestedAction,
    availableProbe,
    activeProbe,
    sceneMode,
    isEnteringProbe,
    probeEntryTopicId,
    probeFeedback,
    startMessageFlow,
    finishMessageFlowSuccess,
    finishMessageFlowError,
    handleOpenProbe,
    handleProbeEntryComplete,
    handleExitProbe,
    handleSubmitProbe,
  };
}
