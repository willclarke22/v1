"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar, { type SidebarTab } from "@/components/layout/sidebar";
import BottomComposer from "@/components/layout/bottom-composer";
import TopicPanel from "@/components/layout/topic-panel";
import MobileTopicCard from "@/components/layout/mobile-topic-card";
import SpaceCanvas from "@/components/learning-space/space-canvas";
import ProbeSurface from "@/components/probes/probe-surface";
import { buildLearningSpace } from "@/lib/build-learning-space";
import { deriveProgressSummary } from "@/lib/derive-progress-summary";
import type { Topic } from "@/types/topic";
import type {
  DiagnosisType,
  LearningSpace,
  MessageRouteResponse,
} from "@/types/contracts";
import { useProbeFlow } from "@/hooks/use-probe-flow";
import { useShellPanels } from "@/hooks/use-shell-panels";

type TopicBootstrapResponse = {
  topics?: Topic[];
  source?: "supabase" | "empty";
  error?: string;
};

type SceneArrivalMode = "warp" | "focus";

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function deriveTopicsFromMessageResponse(
  data: MessageRouteResponse,
  previousTopics: Topic[]
): Topic[] | null {
  const engineTopics = data.result?.engine_fuel?.topics;
  if (!engineTopics?.length) return null;

  const targetTopicId =
    data.intervention?.target_topic_id ??
    data.scene_update?.target_topic_id ??
    data.result?.engine_fuel?.intervention_mode_decision?.target_topic_id ??
    null;

  const activeDiagnosis: DiagnosisType =
    data.intervention?.active_diagnosis ??
    data.result?.engine_fuel?.intervention_mode_decision?.active_diagnosis ??
    "representation_gap";

  const deliveredProbe = data.result?.delivered_response?.delivered_probe ?? null;

  const targetNextStep =
    deliveredProbe?.title ??
    data.result?.engine_fuel?.probe_plan?.text_plan?.instructional_goal ??
    "Continue learning";

  const previousById = new Map(previousTopics.map((topic) => [topic.id, topic]));

  return engineTopics.map((engineTopic, index) => {
    const previous = previousById.get(engineTopic.topic_id);
    const isTargetTopic = engineTopic.topic_id === targetTopicId;
    const hasAvailableProbe =
      deliveredProbe?.target_topic_id === engineTopic.topic_id;

    return {
      id: engineTopic.topic_id,
      name: engineTopic.topic_name,
      diagnosis: isTargetTopic
        ? activeDiagnosis
        : previous?.diagnosis ?? "representation_gap",
      nextStep: isTargetTopic
        ? targetNextStep
        : previous?.nextStep ?? "Continue learning",
      confusion: clamp(
        engineTopic.topic_confusion_average ?? previous?.confusion ?? 0.5
      ),
      insight: clamp(
        engineTopic.topic_insight_average ?? previous?.insight ?? 0.5
      ),
      learningScore: clamp(
        engineTopic.topic_learning_score ?? previous?.learningScore ?? 0.5
      ),
      position:
        Array.isArray(engineTopic.topic_centroid) &&
        engineTopic.topic_centroid.length === 3
          ? (engineTopic.topic_centroid as [number, number, number])
          : previous?.position ?? [index * 2.2, 0, 0],
      scale: previous?.scale,
      messageCount:
        engineTopic.topic_message_count ?? previous?.messageCount ?? 0,
      lastUpdated:
        engineTopic.topic_last_update ?? previous?.lastUpdated ?? null,
      hasAvailableProbe,
    };
  });
}

function resolveReturnedTopicId(
  data: MessageRouteResponse,
  nextTopics: Topic[] | null
) {
  return (
    data.intervention?.target_topic_id ??
    data.scene_update?.target_topic_id ??
    data.result?.engine_fuel?.intervention_mode_decision?.target_topic_id ??
    nextTopics?.[0]?.id ??
    null
  );
}

function resolveArrivalMode(data: MessageRouteResponse): SceneArrivalMode {
  return data.scene_update?.arrival_mode === "warp" ? "warp" : "focus";
}

function resolveActiveTopicIdForMessage(args: {
  selectedTopicId: string | null;
  focusedTopicId: string | null;
}) {
  return args.selectedTopicId ?? args.focusedTopicId ?? null;
}

export default function Home() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [focusedTopicId, setFocusedTopicId] = useState<string | null>(null);
  const [serverLearningSpace, setServerLearningSpace] =
    useState<LearningSpace | null>(null);
  const [isBootstrappingTopics, setIsBootstrappingTopics] = useState(true);
  const [sceneArrivalMode, setSceneArrivalMode] =
    useState<SceneArrivalMode>("focus");

  const localLearningSpace = useMemo(() => buildLearningSpace(topics), [topics]);
  const learningSpace = serverLearningSpace ?? localLearningSpace;

  const progressSummary = useMemo(
    () => deriveProgressSummary(topics, focusedTopicId),
    [topics, focusedTopicId]
  );

  const selectedTopic =
    (focusedTopicId
      ? topics.find((topic) => topic.id === focusedTopicId)
      : undefined) ??
    (selectedTopicId
      ? topics.find((topic) => topic.id === selectedTopicId)
      : undefined) ??
    topics[0] ??
    null;

  const shellPanels = useShellPanels(focusedTopicId);

  function focusTopic(topicId: string | null) {
    setFocusedTopicId(topicId);

    if (topicId) {
      setSelectedTopicId(topicId);
      shellPanels.setIsRightPanelDismissedWhileFocused(false);
      return;
    }

    shellPanels.setIsRightPanelDismissedWhileFocused(false);
  }

  const probeFlow = useProbeFlow({
    topics,
    setTopics,
    focusTopic,
    openMyWayPanel: () => {
      shellPanels.setIsLeftPanelOpen(true);
      shellPanels.setLeftPanelTab("myway");
    },
    hidePanelsForProbeEntry: () => {
      shellPanels.setIsLeftPanelOpen(false);
      shellPanels.setIsRightPanelDismissedWhileFocused(true);
    },
    onLearningSpaceUpdate: setServerLearningSpace,
  });

  const activeProbe = probeFlow.activeProbe;
  const isFocused = focusedTopicId !== null;
  const isImmersiveProbeMode =
    probeFlow.isEnteringProbe || probeFlow.sceneMode === "probe";

  const isRightPanelOpen = isFocused
    ? !shellPanels.isRightPanelDismissedWhileFocused
    : shellPanels.isRightPanelOpenWhileUnfocused && !!selectedTopic;

  useEffect(() => {
    let isCancelled = false;

    async function bootstrapTopics() {
      try {
        const response = await fetch("/api/bootstrap/topic-state", {
          method: "GET",
          cache: "no-store",
        });

        const data: TopicBootstrapResponse = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || `Bootstrap failed with status ${response.status}`
          );
        }

        if (isCancelled) return;

        if (Array.isArray(data.topics) && data.topics.length > 0) {
          setTopics(data.topics);
          setSelectedTopicId((currentSelectedTopicId) => {
            const stillExists = data.topics?.some(
              (topic) => topic.id === currentSelectedTopicId
            );

            return stillExists
              ? currentSelectedTopicId
              : data.topics?.[0]?.id ?? null;
          });

          shellPanels.setIsRightPanelOpenWhileUnfocused(false);
        } else {
          setTopics([]);
          setSelectedTopicId(null);
          setFocusedTopicId(null);
          shellPanels.setIsRightPanelOpenWhileUnfocused(false);
        }

        setServerLearningSpace(null);
        setSceneArrivalMode("focus");
      } catch (error) {
        console.error("Topic bootstrap failed:", error);
      } finally {
        if (!isCancelled) {
          setIsBootstrappingTopics(false);
        }
      }
    }

    bootstrapTopics();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!topics.length) {
      if (selectedTopicId !== null) {
        setSelectedTopicId(null);
      }
      if (focusedTopicId !== null) {
        setFocusedTopicId(null);
      }
      return;
    }

    if (
      selectedTopicId !== null &&
      topics.some((topic) => topic.id === selectedTopicId)
    ) {
      return;
    }

    setSelectedTopicId(topics[0].id);
  }, [topics, selectedTopicId, focusedTopicId]);

  useEffect(() => {
    if (
      focusedTopicId !== null &&
      !topics.some((topic) => topic.id === focusedTopicId)
    ) {
      setFocusedTopicId(null);
    }
  }, [topics, focusedTopicId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (probeFlow.sceneMode === "probe" || probeFlow.isEnteringProbe) {
          probeFlow.handleExitProbe();
          return;
        }

        shellPanels.setIsLeftPanelOpen(false);

        if (focusedTopicId) {
          shellPanels.setIsRightPanelDismissedWhileFocused(true);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusedTopicId,
    probeFlow.sceneMode,
    probeFlow.isEnteringProbe,
    probeFlow.handleExitProbe,
    shellPanels,
  ]);

  async function handleSendMessage(message: string) {
    try {
      probeFlow.startMessageFlow();
      shellPanels.setIsLeftPanelOpen(true);
      shellPanels.setLeftPanelTab("myway");

      const activeTopicIdForMessage = resolveActiveTopicIdForMessage({
        selectedTopicId,
        focusedTopicId,
      });

      const response = await fetch("/api/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageText: message,
          message,
          activeTopicId: activeTopicIdForMessage,
          viewportContext: {
            focusedTopicId,
            selectedTopicId,
            activeTopicIdForMessage,
          },
        }),
      });

      const data: MessageRouteResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          "error" in data && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed with status ${response.status}`
        );
      }

      const nextTopics = deriveTopicsFromMessageResponse(data, topics);

      if (nextTopics) {
        setTopics(nextTopics);
      }

      const returnedLearningSpace =
        data.scene_update?.learning_space ?? data.result?.learning_space ?? null;

      if (returnedLearningSpace) {
        setServerLearningSpace(returnedLearningSpace);
      } else if (nextTopics) {
        setServerLearningSpace(null);
      }

      const resolvedTopicId = resolveReturnedTopicId(data, nextTopics);
      const arrivalMode = resolveArrivalMode(data);

      setSceneArrivalMode(arrivalMode);

      if (resolvedTopicId) {
        setSelectedTopicId(resolvedTopicId);
        focusTopic(resolvedTopicId);
      } else if (nextTopics?.length) {
        setSelectedTopicId(nextTopics[0].id);
      }

      probeFlow.finishMessageFlowSuccess(data);
    } catch (error) {
      console.error("Message handling failed:", error);
      probeFlow.finishMessageFlowError();
      shellPanels.setIsLeftPanelOpen(true);
      shellPanels.setLeftPanelTab("myway");
    }
  }

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0">
        {probeFlow.sceneMode === "space" ? (
          <SpaceCanvas
            learningSpace={learningSpace}
            selectedTopicId={selectedTopicId}
            focusedTopicId={focusedTopicId}
            availableProbe={probeFlow.availableProbe}
            isEnteringProbe={probeFlow.isEnteringProbe}
            probeEntryTopicId={probeFlow.probeEntryTopicId}
            arrivalMode={sceneArrivalMode}
            onSelectTopic={(id) => {
              if (id === null) {
                setSelectedTopicId(null);
                return;
              }

              setSelectedTopicId(id);

              if (focusedTopicId && id !== focusedTopicId) {
                focusTopic(id);
              }
            }}
            onFocusTopicChange={focusTopic}
            onOpenProbe={probeFlow.handleOpenProbe}
            onProbeEntryComplete={probeFlow.handleProbeEntryComplete}
            isBootstrappingTopics={isBootstrappingTopics}
          />
        ) : (
          <ProbeSurface
            probe={activeProbe}
            probeFeedback={probeFlow.probeFeedback}
            isSubmitting={probeFlow.isSubmittingProbe}
            onExit={probeFlow.handleExitProbe}
            onSubmit={probeFlow.handleSubmitProbe}
          />
        )}
      </div>

      {!isImmersiveProbeMode && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 z-40 h-full">
            <div
              className={`pointer-events-auto absolute left-0 top-0 h-full w-[280px] transform transition-transform duration-300 ${
                shellPanels.isLeftPanelOpen
                  ? "translate-x-0"
                  : "-translate-x-[calc(100%-18px)]"
              }`}
            >
              <div className="relative h-full overflow-visible rounded-r-[2rem]">
                <div className="h-full overflow-hidden rounded-r-[2rem]">
                  <Sidebar
                    activeTab={shellPanels.leftPanelTab}
                    onChangeTab={(tab: SidebarTab) =>
                      shellPanels.setLeftPanelTab(tab)
                    }
                    latestReply={probeFlow.latestReply}
                    suggestedAction={probeFlow.suggestedAction}
                    isSending={probeFlow.isSending || isBootstrappingTopics}
                    progressSummary={progressSummary}
                  />
                </div>

                <button
                  onClick={() =>
                    shellPanels.setIsLeftPanelOpen((prev) => !prev)
                  }
                  className="absolute right-0 top-1/2 z-50 flex h-24 w-[18px] -translate-y-1/2 translate-x-full items-center justify-center rounded-r-xl border border-l-0 border-white/8 bg-white/[0.035] text-[10px] uppercase tracking-[0.18em] text-zinc-300 shadow-[0_0_14px_rgba(0,0,0,0.14)] backdrop-blur-md transition hover:bg-white/[0.06]"
                  type="button"
                  aria-label={
                    shellPanels.isLeftPanelOpen ? "Close menu" : "Open menu"
                  }
                >
                  <span className="[writing-mode:vertical-rl] rotate-180">
                    {shellPanels.isLeftPanelOpen ? "Close" : "Menu"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {selectedTopic && (
            <div
              className={`absolute right-0 top-0 z-40 hidden h-full w-[340px] transform transition-transform duration-300 xl:block ${
                isRightPanelOpen
                  ? "translate-x-0"
                  : "translate-x-[calc(100%-18px)]"
              }`}
            >
              <div className="relative h-full">
                <div className="h-full overflow-hidden">
                  <TopicPanel topic={selectedTopic} />
                </div>

                <button
                  onClick={shellPanels.toggleRightPanel}
                  className="absolute left-0 top-1/2 z-50 flex h-28 w-[18px] -translate-y-1/2 -translate-x-full items-center justify-center rounded-l-xl border border-r-0 border-white/10 bg-zinc-950/55 text-[10px] uppercase tracking-[0.18em] text-zinc-300 shadow-[0_0_20px_rgba(0,0,0,0.24)] backdrop-blur-md transition hover:bg-zinc-900/60"
                  type="button"
                >
                  <span className="[writing-mode:vertical-rl]">
                    {isRightPanelOpen ? "Close" : "Topic"}
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-5 z-50 flex justify-center px-4 md:px-6">
            <div className="pointer-events-auto w-full max-w-4xl">
              <BottomComposer
                onSendMessage={handleSendMessage}
                isSending={probeFlow.isSending || isBootstrappingTopics}
              />
            </div>
          </div>

          {selectedTopic && (
            <div className="absolute bottom-28 left-4 right-4 z-30 md:hidden">
              <MobileTopicCard topic={selectedTopic} />
            </div>
          )}
        </>
      )}
    </main>
  );
}