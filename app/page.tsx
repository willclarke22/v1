"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar, { type SidebarTab } from "@/components/layout/sidebar";
import BottomComposer from "@/components/layout/bottom-composer";
import TopicPanel from "@/components/layout/topic-panel";
import MobileTopicCard from "@/components/layout/mobile-topic-card";
import SpaceCanvas from "@/components/learning-space/space-canvas";
import ProbeSurface from "@/components/probes/probe-surface";
import { buildLearningSpace } from "@/lib/build-learning-space";
import { deriveProgressSummary } from "@/lib/derive-progress-summary";
import {
  isTopicPosition3D,
  type TopicPosition3D,
} from "@/lib/learning-space/topic-position";
import { supabase } from "@/lib/supabase/client";
import type { Topic, TopicConfusionInsightStatus } from "@/types/topic";
import type {
  LearningSpace as RendererLearningSpace,
  RelationshipViewMode,
} from "@/types/learning-space";
import type {
  DiagnosisType,
  LearningSpace as ContractLearningSpace,
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

type LocalDevIdleStateUpdate = {
  composerHasText?: boolean;
  messageInFlight?: boolean;
  enrichmentInFlight?: boolean;
  lastActivityAt?: string;
  lastMessageStartedAt?: string;
  lastMessageFinishedAt?: string;
};

type StagedTopicStateRefresh = {
  reason: "bootstrap" | "realtime" | "fallback_poll";
  preservePanelState: boolean;
  nextTopics: Topic[];
  mergedTopics: Topic[];
};

const REALTIME_REFRESH_DEBOUNCE_MS = 900;
const FALLBACK_TOPIC_STATE_REFRESH_INTERVAL_MS = 20_000;

/**
 * Worker/realtime can produce several topic_state changes in quick succession:
 * pre-cycle commit, enrichment, recompute, commit. Applying every refresh as it
 * arrives makes the scene feel like it updates in pieces. This short staging
 * window lets the latest persisted layout win, so all visible topic movement
 * starts together as one semantic-layout event.
 */
const STAGED_TOPIC_STATE_REFRESH_DELAY_MS = 1_450;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function asTopicPosition(value: unknown): TopicPosition3D | null {
  return isTopicPosition3D(value) ? value : null;
}

function topicPositionKey(position: TopicPosition3D | null | undefined) {
  if (!position) return "null";
  return position.map((value) => value.toFixed(4)).join(",");
}

function confusionInsightStatusSignature(topic: Topic) {
  const status = topic.confusionInsightStatus;

  if (!status) return "ci:null";

  return [
    "ci",
    status.status,
    status.isPending ? "pending" : "not_pending",
    status.hasModelScore ? "model" : "no_model",
    status.hasStructuredV1Score ? "structured_v1_1" : "not_structured_v1_1",
    status.pendingCount ?? 0,
    status.signalCount ?? 0,
    status.lastScore?.scoreId ?? "null",
    status.lastScore?.processedAt ?? "null",
    status.lastScore?.modelVersion ?? "null",
    status.lastScore?.modelConfusion?.toFixed(4) ?? "null",
    status.lastScore?.modelInsight?.toFixed(4) ?? "null",
  ].join(":");
}

function topicStateSignature(topics: Topic[]) {
  return topics
    .map((topic) =>
      [
        topic.id,
        topic.topic_label,
        topicPositionKey(topic.position),
        topicPositionKey(topic.semanticPosition),
        topic.semanticPositionMethod ?? "null",
        topic.semanticPositionUpdatedAt ?? "null",
        topic.confusion.toFixed(4),
        topic.insight.toFixed(4),
        topic.learningScore.toFixed(4),
        topic.messageCount ?? 0,
        topic.lastUpdated ?? "null",
        confusionInsightStatusSignature(topic),
        topic.learningSpaceProjection?.projection_id ?? "null",
        topic.learningSpaceRelationships?.length ?? 0,
        topic.learningSpaceViewpoints?.length ?? 0,
      ].join(":"),
    )
    .join("|");
}

function buildPendingConfusionInsightStatus(
  previous?: Topic,
): TopicConfusionInsightStatus {
  const previousStatus = previous?.confusionInsightStatus;

  return {
    status: "pending",
    isPending: true,
    hasModelScore: previousStatus?.hasModelScore ?? false,
    hasStructuredV1Score: previousStatus?.hasStructuredV1Score,
    pendingCount: Math.max(1, previousStatus?.pendingCount ?? 0),
    signalCount: previousStatus?.signalCount ?? 0,
    lastScore: previousStatus?.lastScore ?? null,
  };
}

function mergeBootstrappedTopicsWithPrevious(args: {
  nextTopics: Topic[];
  previousTopics: Topic[];
}) {
  const previousById = new Map(
    args.previousTopics.map((topic) => [topic.id, topic]),
  );

  return args.nextTopics.map((topic) => {
    const previous = previousById.get(topic.id);

    if (!previous) return topic;

    return {
      ...topic,

      /**
       * /api/bootstrap/topic-state is canonical for persisted positions/metrics,
       * but it does not know about short-lived UI probe availability. Preserve
       * that local UI hint so background refresh does not erase the probe badge.
       */
      hasAvailableProbe: previous.hasAvailableProbe || topic.hasAvailableProbe,
      confusionInsightStatus:
        topic.confusionInsightStatus ?? previous.confusionInsightStatus,
      learningSpaceRelationships:
        topic.learningSpaceRelationships ?? previous.learningSpaceRelationships,
      learningSpaceViewpoints:
        topic.learningSpaceViewpoints ?? previous.learningSpaceViewpoints,
      learningSpaceProjection:
        topic.learningSpaceProjection ?? previous.learningSpaceProjection,
    };
  });
}

async function updateLocalDevIdleState(input: LocalDevIdleStateUpdate) {
  if (process.env.NODE_ENV !== "development") return;

  try {
    await fetch("/api/local-dev/idle-state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        composer_has_text: input.composerHasText,
        message_in_flight: input.messageInFlight,
        enrichment_in_flight: input.enrichmentInFlight,
        last_activity_at: input.lastActivityAt,
        last_message_started_at: input.lastMessageStartedAt,
        last_message_finished_at: input.lastMessageFinishedAt,
      }),
    });
  } catch {
    // Local dev idle-state reporting must never break the UI.
  }
}

async function fetchBootstrappedTopics(): Promise<TopicBootstrapResponse> {
  const response = await fetch("/api/bootstrap/topic-state", {
    method: "GET",
    cache: "no-store",
  });

  const data: TopicBootstrapResponse = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || `Bootstrap failed with status ${response.status}`,
    );
  }

  return data;
}

function getReturnedLearningSpace(
  data: MessageRouteResponse,
): ContractLearningSpace | null {
  return data.scene_update?.learning_space ?? data.result?.learning_space ?? null;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function deriveCollisionRadius(renderState: {
  radius?: number;
  collision_radius?: number;
  surface_noise?: number;
}) {
  const radius = getNumber(renderState.radius, 1);

  if (
    typeof renderState.collision_radius === "number" &&
    Number.isFinite(renderState.collision_radius)
  ) {
    return round3(Math.max(renderState.collision_radius, radius));
  }

  const surfaceNoise = clamp(getNumber(renderState.surface_noise, 0.3));

  /**
   * Backfill for learning_space payloads returned by older route contracts.
   * buildLearningSpace now emits collision_radius directly, but /api/message may
   * still return a contracts.LearningSpace whose RenderState lacks it.
   */
  return round3(
    Math.max(radius + 0.14, radius * (1 + surfaceNoise * 0.14) + 0.22),
  );
}


function buildFallbackProjectionMetadata(): RendererLearningSpace["projection"] {
  return {
    projection_id: "frontend_fallback_projection",
    projection_method: "frontend_contract_backfill",
    dimensionality: 3,
    relationship_basis: [],
    generated_at: null,
    confidence: null,
    notes: [
      "Frontend fallback: learning_space payload did not include projection metadata yet.",
    ],
  };
}

function normalizeRendererRelationships(
  relationships: unknown,
): RendererLearningSpace["relationships"] {
  if (!Array.isArray(relationships)) return [];

  return relationships.map((relationship, index) => {
    const candidate = relationship as Partial<
      RendererLearningSpace["relationships"][number]
    > & {
      relationship_type?: string;
      display_policy?: Partial<
        RendererLearningSpace["relationships"][number]["display_policy"]
      >;
      basis?: Partial<RendererLearningSpace["relationships"][number]["basis"]>;
    };

    const relationshipType =
      candidate.relationship_type === "semantic"
        ? "semantic_similarity"
        : candidate.relationship_type ?? "semantic_similarity";

    const visibleByDefault =
      candidate.visible_by_default ??
      candidate.display_policy?.visible_by_default ??
      candidate.display_policy?.show_in_overview ??
      false;

    const affectsLayout =
      candidate.affects_layout ??
      candidate.display_policy?.affects_layout ??
      (relationshipType === "semantic_similarity");

    const strength = getNumber(candidate.strength, 0);
    const confidence = getNumber(candidate.confidence, 0.5);

    return {
      relationship_id:
        candidate.relationship_id ??
        `frontend-normalized-relationship-${index}`,
      source_topic_id: candidate.source_topic_id ?? "",
      target_topic_id: candidate.target_topic_id ?? "",
      relationship_type: relationshipType,
      strength,
      confidence,
      evidence_count:
        typeof candidate.evidence_count === "number"
          ? candidate.evidence_count
          : Array.isArray(candidate.evidence_source)
            ? candidate.evidence_source.length
            : 1,
      evidence_source: Array.isArray(candidate.evidence_source)
        ? candidate.evidence_source
        : [],
      evidence_summary: candidate.evidence_summary ?? null,
      affects_layout: affectsLayout,
      visible_by_default: visibleByDefault,
      reasons: Array.isArray(candidate.reasons) ? candidate.reasons : [],
      updated_at: candidate.updated_at ?? null,
      basis: {
        similarity:
          typeof candidate.basis?.similarity === "number"
            ? candidate.basis.similarity
            : null,
        normalized_similarity:
          typeof candidate.basis?.normalized_similarity === "number"
            ? candidate.basis.normalized_similarity
            : null,
        desired_distance:
          typeof candidate.basis?.desired_distance === "number"
            ? candidate.basis.desired_distance
            : null,
        actual_distance:
          typeof candidate.basis?.actual_distance === "number"
            ? candidate.basis.actual_distance
            : null,
        diagnostic_method: candidate.basis?.diagnostic_method ?? null,
      },
      display_policy: {
        show_in_overview:
          candidate.display_policy?.show_in_overview ?? visibleByDefault,
        show_on_focus: candidate.display_policy?.show_on_focus ?? true,
        visible_by_default: visibleByDefault,
        affects_layout: affectsLayout,
        max_opacity: getNumber(candidate.display_policy?.max_opacity, 0.35),
        visual_style: candidate.display_policy?.visual_style ?? "thread",
        priority: getNumber(candidate.display_policy?.priority, strength),
      },
    };
  });
}

function toRendererLearningSpace(
  learningSpace: ContractLearningSpace | RendererLearningSpace | null,
): RendererLearningSpace | null {
  if (!learningSpace) return null;

  return {
    space_version: "v1",
    clusters: learningSpace.clusters ?? [],
    relationships: normalizeRendererRelationships(learningSpace.relationships),
    viewpoints: (learningSpace.viewpoints ?? []) as RendererLearningSpace["viewpoints"],
    projection: learningSpace.projection ?? buildFallbackProjectionMetadata(),
    topics: (learningSpace.topics ?? []).map((topic) => {
      const renderState = topic.render_state ?? {
        radius: 1,
        collision_radius: 1.36,
        surface_noise: 0.3,
        smoothness: 0.6,
        spin_rate: 0.003,
        saturation: 0.6,
        is_star: false,
        glow_intensity: 0,
        glow_source: "none",
      };

      const radius = getNumber(renderState.radius, 1);
      const surfaceNoise = getNumber(renderState.surface_noise, 0.3);
      const saturation = getNumber(renderState.saturation, 0.6);
      const glowIntensity = getNumber(
        (renderState as { glow_intensity?: unknown }).glow_intensity,
        0,
      );

      return {
        ...topic,
        layout: (topic as RendererLearningSpace["topics"][number]).layout ?? {
          position_source: "topic_position",
          semantic_position: null,
          semantic_position_method: null,
          semantic_position_updated_at: null,
          current_position: topic.position,
          rendered_target_position: topic.position,
          layout_confidence: 0.35,
          movement_policy: {
            easing: "slow",
            max_step_per_update: 0.24,
            preserve_user_spatial_memory: true,
          },
        },
        render_state: {
          radius,
          collision_radius: deriveCollisionRadius(renderState),
          surface_noise: surfaceNoise,
          smoothness: getNumber(
            (renderState as { smoothness?: unknown }).smoothness,
            clamp(0.55 + saturation * 0.2 - surfaceNoise * 0.2),
          ),
          spin_rate: getNumber(renderState.spin_rate, 0.003),
          saturation,
          is_star: Boolean(renderState.is_star),
          glow_intensity: glowIntensity,
          glow_source:
            (renderState as { glow_source?: RendererLearningSpace["topics"][number]["render_state"]["glow_source"] })
              .glow_source ?? (glowIntensity > 0 ? "insight" : "none"),
        },
        surface_markers:
          (topic as RendererLearningSpace["topics"][number]).surface_markers ?? [],
        rings: (topic as RendererLearningSpace["topics"][number]).rings ?? [],
        topic_panel:
          (topic as RendererLearningSpace["topics"][number]).topic_panel ?? {
            current_state_summary: null,
            active_diagnosis: {
              label: null,
              confidence: null,
              plain_language: null,
            },
            primary_block: null,
            next_step: {
              mode: null,
              text: null,
              reason: null,
            },
            recent_evidence_summary: [],
            why_this_topic_matters: [],
            available_actions: [],
          },
      };
    }),
  } satisfies RendererLearningSpace;
}

function buildLearningSpaceTopicLookup(
  learningSpace: ContractLearningSpace | RendererLearningSpace | null,
) {
  return new Map(
    (learningSpace?.topics ?? []).map((topic) => [topic.topic_id, topic]),
  );
}

function getEngineTopicLabel(args: {
  engineTopic: NonNullable<
    MessageRouteResponse["result"]
  >["engine_fuel"]["topics"][number];
  previous?: Topic;
}) {
  return (
    args.engineTopic.topic_label?.trim() ||
    args.previous?.topic_label?.trim() ||
    "Untitled Topic"
  );
}

function deriveTopicsFromMessageResponse(
  data: MessageRouteResponse,
  previousTopics: Topic[],
): Topic[] | null {
  const engineTopics = data.result?.engine_fuel?.topics;
  if (!engineTopics?.length) return null;

  const returnedLearningSpace = getReturnedLearningSpace(data);
  const learningSpaceTopicsById = buildLearningSpaceTopicLookup(
    returnedLearningSpace,
  );

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
    const learningSpaceTopic = learningSpaceTopicsById.get(engineTopic.topic_id);
    const isTargetTopic = engineTopic.topic_id === targetTopicId;
    const hasAvailableProbe =
      deliveredProbe?.target_topic_id === engineTopic.topic_id;
    const topicLabel = getEngineTopicLabel({ engineTopic, previous });

    const position =
      asTopicPosition(learningSpaceTopic?.position) ??
      asTopicPosition(engineTopic.topic_centroid) ??
      previous?.position ??
      ([index * 2.2, 0, 0] as TopicPosition3D);

    return {
      id: engineTopic.topic_id,
      topic_label: topicLabel,
      diagnosis: isTargetTopic
        ? activeDiagnosis
        : previous?.diagnosis ?? "representation_gap",
      nextStep: isTargetTopic
        ? targetNextStep
        : previous?.nextStep ?? "Continue learning",
      confusion: clamp(
        engineTopic.topic_confusion_average ?? previous?.confusion ?? 0.5,
      ),
      insight: clamp(
        engineTopic.topic_insight_average ?? previous?.insight ?? 0.5,
      ),
      learningScore: clamp(
        engineTopic.topic_learning_score ?? previous?.learningScore ?? 0.5,
      ),
      confusionInsightStatus: isTargetTopic
        ? buildPendingConfusionInsightStatus(previous)
        : previous?.confusionInsightStatus,
      position,
      semanticPosition:
        asTopicPosition(learningSpaceTopic?.layout?.semantic_position) ??
        previous?.semanticPosition ??
        null,
      semanticPositionMethod:
        learningSpaceTopic?.layout?.semantic_position_method ??
        previous?.semanticPositionMethod ??
        null,
      semanticPositionUpdatedAt:
        learningSpaceTopic?.layout?.semantic_position_updated_at ??
        previous?.semanticPositionUpdatedAt ??
        null,
      positionSource:
        learningSpaceTopic?.layout?.position_source ??
        previous?.positionSource ??
        "topic_position",
      scale: previous?.scale,
      messageCount:
        engineTopic.topic_message_count ?? previous?.messageCount ?? 0,
      lastUpdated:
        engineTopic.topic_last_update ?? previous?.lastUpdated ?? null,
      hasAvailableProbe,

      /**
       * Keep the global relationship/viewpoint/projection layer alive when
       * /api/message returns only engine topic rows or a learning_space payload
       * that does not yet include the richer relationship contract. This prevents
       * semantic arcs from disappearing immediately after a normal message send.
       */
      learningSpaceRelationships: previous?.learningSpaceRelationships,
      learningSpaceViewpoints: previous?.learningSpaceViewpoints,
      learningSpaceProjection: previous?.learningSpaceProjection,
    };
  });
}

function resolveReturnedTopicId(
  data: MessageRouteResponse,
  nextTopics: Topic[] | null,
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
  const topicsRef = useRef<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [focusedTopicId, setFocusedTopicId] = useState<string | null>(null);
  const [serverLearningSpace, setServerLearningSpace] =
    useState<RendererLearningSpace | null>(null);
  const [isBootstrappingTopics, setIsBootstrappingTopics] = useState(true);
  const [sceneArrivalMode, setSceneArrivalMode] =
    useState<SceneArrivalMode>("focus");
  const [relationshipViewMode, setRelationshipViewMode] =
    useState<RelationshipViewMode>("semantic_similarity");
  const [isProbeExitRestoring, setIsProbeExitRestoring] = useState(false);

  const topicRefreshInFlightRef = useRef(false);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const stagedTopicRefreshTimeoutRef = useRef<number | null>(null);
  const stagedTopicRefreshRef = useRef<StagedTopicStateRefresh | null>(null);

  useEffect(() => {
    topicsRef.current = topics;
  }, [topics]);

  const localLearningSpace = useMemo<RendererLearningSpace>(() => {
    const builtLearningSpace = toRendererLearningSpace(buildLearningSpace(topics));

    if (builtLearningSpace) {
      return builtLearningSpace;
    }

    return {
      space_version: "v1",
      topics: [],
      clusters: [],
      relationships: [],
      viewpoints: [],
      projection: buildFallbackProjectionMetadata(),
    } satisfies RendererLearningSpace;
  }, [topics]);

  const learningSpace: RendererLearningSpace =
    serverLearningSpace ?? localLearningSpace;

  const progressSummary = useMemo(
    () => deriveProgressSummary(topics, focusedTopicId),
    [topics, focusedTopicId],
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
  const { setIsRightPanelOpenWhileUnfocused } = shellPanels;

  const handleComposerTextStateChange = useCallback(
    (input: { composerHasText: boolean; lastActivityAt: string }) => {
      void updateLocalDevIdleState({
        composerHasText: input.composerHasText,
        lastActivityAt: input.lastActivityAt,
      });
    },
    [],
  );

  function focusTopic(topicId: string | null) {
    setFocusedTopicId(topicId);

    if (topicId) {
      setSelectedTopicId(topicId);
      shellPanels.setIsRightPanelDismissedWhileFocused(false);
      return;
    }

    shellPanels.setIsRightPanelDismissedWhileFocused(false);

    // When zooming out, keep the selected topic inspectable instead of letting
    // the right panel collapse just because focus changed from focused -> unfocused.
    setIsRightPanelOpenWhileUnfocused(true);
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
    onLearningSpaceUpdate: (nextLearningSpace) => {
      setServerLearningSpace(toRendererLearningSpace(nextLearningSpace));
    },
  });

  const activeProbe = probeFlow.activeProbe;
  const isFocused = focusedTopicId !== null;
  const isImmersiveProbeMode =
    probeFlow.isEnteringProbe ||
    probeFlow.sceneMode === "probe" ||
    isProbeExitRestoring;

  const isRightPanelOpen = isFocused
    ? !shellPanels.isRightPanelDismissedWhileFocused
    : shellPanels.isRightPanelOpenWhileUnfocused && !!selectedTopic;

  const canRefreshTopicState =
    !isBootstrappingTopics &&
    !probeFlow.isSending &&
    !probeFlow.isEnteringProbe &&
    probeFlow.sceneMode !== "probe" &&
    !isProbeExitRestoring;

  const applyTopicStateRefresh = useCallback(
    (payload: StagedTopicStateRefresh) => {
      const { nextTopics, mergedTopics } = payload;

      if (nextTopics.length > 0) {
        const previousSignature = topicStateSignature(topicsRef.current);
        const nextSignature = topicStateSignature(mergedTopics);
        const topicStateChanged = previousSignature !== nextSignature;

        if (topicStateChanged) {
          topicsRef.current = mergedTopics;
          setTopics(mergedTopics);

          /**
           * Keep the renderer on one continuous learning-space source. A staged
           * apply means all changed topic positions are released into the scene
           * together, so every affected sphere begins migrating in the same
           * visual event instead of in multiple worker/realtime waves.
           */
          setServerLearningSpace(
            toRendererLearningSpace(buildLearningSpace(mergedTopics)),
          );
        }

        setSelectedTopicId((currentSelectedTopicId) => {
          const stillExists = nextTopics.some(
            (topic) => topic.id === currentSelectedTopicId,
          );

          return stillExists
            ? currentSelectedTopicId
            : nextTopics[0]?.id ?? null;
        });

        setFocusedTopicId((currentFocusedTopicId) => {
          if (!currentFocusedTopicId) return currentFocusedTopicId;

          const stillExists = nextTopics.some(
            (topic) => topic.id === currentFocusedTopicId,
          );

          return stillExists ? currentFocusedTopicId : null;
        });

        if (!payload.preservePanelState) {
          setIsRightPanelOpenWhileUnfocused(false);
        }
      } else {
        const topicStateChanged = topicsRef.current.length > 0;

        if (topicStateChanged) {
          topicsRef.current = [];
          setTopics([]);
          setServerLearningSpace(null);
        }

        setSelectedTopicId(null);
        setFocusedTopicId(null);

        if (!payload.preservePanelState) {
          setIsRightPanelOpenWhileUnfocused(false);
        }
      }

      if (payload.reason === "bootstrap") {
        setSceneArrivalMode("focus");
      }
    },
    [setIsRightPanelOpenWhileUnfocused],
  );

  const scheduleStagedTopicRefreshApply = useCallback(
    (payload: StagedTopicStateRefresh) => {
      stagedTopicRefreshRef.current = payload;

      if (stagedTopicRefreshTimeoutRef.current !== null) {
        window.clearTimeout(stagedTopicRefreshTimeoutRef.current);
        stagedTopicRefreshTimeoutRef.current = null;
      }

      const delayMs =
        payload.reason === "bootstrap" ? 0 : STAGED_TOPIC_STATE_REFRESH_DELAY_MS;

      stagedTopicRefreshTimeoutRef.current = window.setTimeout(() => {
        const latestPayload = stagedTopicRefreshRef.current;
        stagedTopicRefreshRef.current = null;
        stagedTopicRefreshTimeoutRef.current = null;

        if (latestPayload) {
          applyTopicStateRefresh(latestPayload);
        }
      }, delayMs);
    },
    [applyTopicStateRefresh],
  );

  const refreshTopicStateFromBootstrap = useCallback(
    async (args: {
      reason: "bootstrap" | "realtime" | "fallback_poll";
      preservePanelState: boolean;
    }) => {
      const data = await fetchBootstrappedTopics();
      const nextTopics = Array.isArray(data.topics) ? data.topics : [];
      const mergedTopics = mergeBootstrappedTopicsWithPrevious({
        nextTopics,
        previousTopics: topicsRef.current,
      });

      scheduleStagedTopicRefreshApply({
        reason: args.reason,
        preservePanelState: args.preservePanelState,
        nextTopics,
        mergedTopics,
      });
    },
    [scheduleStagedTopicRefreshApply],
  );

  const runTopicStateRefresh = useCallback(
    async (reason: "realtime" | "fallback_poll") => {
      if (!canRefreshTopicState || topicRefreshInFlightRef.current) return;

      topicRefreshInFlightRef.current = true;

      try {
        await refreshTopicStateFromBootstrap({
          reason,
          preservePanelState: true,
        });
      } catch (error) {
        console.error(`${reason} topic-state refresh failed:`, error);
      } finally {
        topicRefreshInFlightRef.current = false;
      }
    },
    [canRefreshTopicState, refreshTopicStateFromBootstrap],
  );

  const scheduleRealtimeTopicStateRefresh = useCallback(() => {
    if (!canRefreshTopicState) return;

    if (realtimeRefreshTimeoutRef.current !== null) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null;
      void runTopicStateRefresh("realtime");
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [canRefreshTopicState, runTopicStateRefresh]);

  useEffect(() => {
    let isCancelled = false;

    async function bootstrapTopics() {
      try {
        await refreshTopicStateFromBootstrap({
          reason: "bootstrap",
          preservePanelState: false,
        });
      } catch (error) {
        console.error("Topic bootstrap failed:", error);
      } finally {
        if (!isCancelled) {
          setIsBootstrappingTopics(false);
        }
      }
    }

    void updateLocalDevIdleState({
      composerHasText: false,
      messageInFlight: false,
      enrichmentInFlight: false,
      lastActivityAt: new Date().toISOString(),
    });

    void bootstrapTopics();

    return () => {
      isCancelled = true;
    };
  }, [refreshTopicStateFromBootstrap]);

  useEffect(() => {
    const channel = supabase
      .channel("myway-topic-state-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "topic_state",
        },
        (payload) => {
          console.log("[topic_state realtime] change received", {
            eventType: payload.eventType,
            table: payload.table,
            schema: payload.schema,
          });

          scheduleRealtimeTopicStateRefresh();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn(
            "Supabase Realtime channel error for topic_state. Fallback polling will continue.",
          );
        }
      });

    return () => {
      if (realtimeRefreshTimeoutRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      if (stagedTopicRefreshTimeoutRef.current !== null) {
        window.clearTimeout(stagedTopicRefreshTimeoutRef.current);
        stagedTopicRefreshTimeoutRef.current = null;
        stagedTopicRefreshRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [scheduleRealtimeTopicStateRefresh]);

  useEffect(() => {
    if (isBootstrappingTopics) return;

    const intervalId = window.setInterval(() => {
      void runTopicStateRefresh("fallback_poll");
    }, FALLBACK_TOPIC_STATE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isBootstrappingTopics, runTopicStateRefresh]);

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
    const messageStartedAt = new Date().toISOString();

    void updateLocalDevIdleState({
      composerHasText: false,
      messageInFlight: true,
      lastActivityAt: messageStartedAt,
      lastMessageStartedAt: messageStartedAt,
    });

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
          "error" in data &&
            typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed with status ${response.status}`,
        );
      }

      const nextTopics = deriveTopicsFromMessageResponse(data, topics);

      if (nextTopics) {
        topicsRef.current = nextTopics;
        setTopics(nextTopics);
      }

      const returnedLearningSpace = toRendererLearningSpace(
        getReturnedLearningSpace(data),
      );

      if (returnedLearningSpace) {
        setServerLearningSpace(returnedLearningSpace);
      } else if (nextTopics) {
        setServerLearningSpace(toRendererLearningSpace(buildLearningSpace(nextTopics)));
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
    } finally {
      const messageFinishedAt = new Date().toISOString();

      void updateLocalDevIdleState({
        composerHasText: false,
        messageInFlight: false,
        lastActivityAt: messageFinishedAt,
        lastMessageFinishedAt: messageFinishedAt,
      });
    }
  }

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0">
        <SpaceCanvas
          learningSpace={learningSpace}
          selectedTopicId={selectedTopicId}
          focusedTopicId={focusedTopicId}
          availableProbe={probeFlow.availableProbe}
          isEnteringProbe={probeFlow.isEnteringProbe}
          isProbeSurfaceActive={probeFlow.sceneMode === "probe"}
          probeEntryTopicId={probeFlow.probeEntryTopicId}
          arrivalMode={sceneArrivalMode}
          relationshipViewMode={relationshipViewMode}
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
          onProbeExitRestoreStart={() => setIsProbeExitRestoring(true)}
          onProbeExitRestoreComplete={() => setIsProbeExitRestoring(false)}
          isBootstrappingTopics={isBootstrappingTopics}
        />

        {probeFlow.sceneMode === "probe" && (
          <div className="absolute inset-0 z-30">
            <ProbeSurface
              probe={activeProbe}
              probeFeedback={probeFlow.probeFeedback}
              isSubmitting={probeFlow.isSubmittingProbe}
              onExit={probeFlow.handleExitProbe}
              onSubmit={probeFlow.handleSubmitProbe}
            />
          </div>
        )}
      </div>

      {!isImmersiveProbeMode && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 z-40 h-full">
            <div
              className={`pointer-events-auto absolute left-0 top-0 h-full w-70 transform transition-transform duration-300 ${
                shellPanels.isLeftPanelOpen
                  ? "translate-x-0"
                  : "-translate-x-[calc(100%-18px)]"
              }`}
            >
              <div className="relative h-full overflow-visible rounded-r-4xl">
                <div className="h-full overflow-hidden rounded-r-4xl">
                  <Sidebar
                    activeTab={shellPanels.leftPanelTab}
                    onChangeTab={(tab: SidebarTab) =>
                      shellPanels.setLeftPanelTab(tab)
                    }
                    latestReply={probeFlow.latestReply}
                    suggestedAction={probeFlow.suggestedAction}
                    isSending={probeFlow.isSending || isBootstrappingTopics}
                    progressSummary={progressSummary}
                    relationshipViewMode={relationshipViewMode}
                    onChangeRelationshipViewMode={setRelationshipViewMode}
                  />
                </div>

                <button
                  onClick={() =>
                    shellPanels.setIsLeftPanelOpen((prev) => !prev)
                  }
                  className="absolute right-0 top-1/2 z-50 flex h-24 w-4.5 -translate-y-1/2 translate-x-full items-center justify-center rounded-r-xl border border-l-0 border-white/8 bg-white/[0.035] text-[10px] uppercase tracking-[0.18em] text-zinc-300 shadow-[0_0_14px_rgba(0,0,0,0.14)] backdrop-blur-md transition hover:bg-white/6"
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
              className={`absolute right-0 top-0 z-40 hidden h-full w-85 transform transition-transform duration-300 xl:block ${
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
                  className="absolute left-0 top-1/2 z-50 flex h-28 w-4.5 -translate-y-1/2 -translate-x-full items-center justify-center rounded-l-xl border border-r-0 border-white/10 bg-zinc-950/55 text-[10px] uppercase tracking-[0.18em] text-zinc-300 shadow-[0_0_20px_rgba(0,0,0,0.24)] backdrop-blur-md transition hover:bg-zinc-900/60"
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
                onComposerTextStateChange={handleComposerTextStateChange}
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