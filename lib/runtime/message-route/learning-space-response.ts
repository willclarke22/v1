import { makeId } from "@/lib/utils/ids";
import type {
  LearningSpace,
  MessageRouteResponse,
} from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/route-topics";
import type { RouteResolutionKind } from "./confusion-insight-queue";

export type RawLearningSpaceTopic = {
  topic_id?: string;
  topic_label?: string;
  position?: [number, number, number];
  layout?: {
    position_source?:
      | "topic_position"
      | "semantic_position"
      | "topic_json"
      | "deterministic_fallback";
    semantic_position?: [number, number, number] | null;
    semantic_position_method?: string | null;
    semantic_position_updated_at?: string | null;
  };
  render_state?: {
    radius?: number;
    collision_radius?: number;
    surface_noise?: number;
    spin_rate?: number;
    saturation?: number;
    is_star?: boolean;
  };
  satellite_count?: number;
  satellites?: Array<{
    satellite_id?: string;
    orbit_angle?: number;
    linked_attempt_id?: string | null;
  }>;
};

export type RawLearningSpaceCluster = {
  cluster_id?: string;
  cluster_label?: string;
  cluster_centroid?: [number, number, number];
  member_topic_ids?: string[];
};

export type RawLearningSpace = {
  space_version?: "v1";
  topics?: RawLearningSpaceTopic[];
  clusters?: RawLearningSpaceCluster[];
  relationships?: LearningSpace["relationships"];
  viewpoints?: LearningSpace["viewpoints"];
  projection?: LearningSpace["projection"];
};

export function adaptLearningSpaceToContract(
  rawLearningSpace: RawLearningSpace,
  updatedTopics: RouteTopic[],
): LearningSpace {
  return {
    space_version: "v1",
    topics: (rawLearningSpace.topics ?? []).map((topic, index) => {
      const fallbackTopic = updatedTopics[index] ?? updatedTopics[0];
      const resolvedTopicLabel =
        topic.topic_label ?? fallbackTopic?.topic_label ?? "Untitled Topic";

      const position =
        Array.isArray(topic.position) && topic.position.length === 3
          ? (topic.position as [number, number, number])
          : (fallbackTopic?.position ?? [0, 0, 0]);

      const radius = topic.render_state?.radius ?? 0.8;

      return {
        topic_id: topic.topic_id ?? fallbackTopic?.id ?? makeId("topic"),
        topic_label: resolvedTopicLabel,
        position,
        layout: {
          position_source:
            topic.layout?.position_source ??
            fallbackTopic?.positionSource ??
            "topic_position",
          semantic_position:
            topic.layout?.semantic_position ??
            fallbackTopic?.semanticPosition ??
            null,
          semantic_position_method:
            topic.layout?.semantic_position_method ??
            fallbackTopic?.semanticPositionMethod ??
            null,
          semantic_position_updated_at:
            topic.layout?.semantic_position_updated_at ??
            fallbackTopic?.semanticPositionUpdatedAt ??
            null,
        },
        render_state: {
          radius,
          collision_radius:
            topic.render_state?.collision_radius ?? radius + 0.24,
          surface_noise: topic.render_state?.surface_noise ?? 0.3,
          spin_rate: topic.render_state?.spin_rate ?? 0.25,
          saturation: topic.render_state?.saturation ?? 0.7,
          is_star: topic.render_state?.is_star ?? false,
        },
        satellite_count: topic.satellite_count ?? 0,
        satellites: (topic.satellites ?? []).map(
          (satellite, satelliteIndex) => ({
            satellite_id:
              satellite.satellite_id ?? `sat-${index}-${satelliteIndex}`,
            orbit_angle: satellite.orbit_angle ?? 0,
            linked_attempt_id: satellite.linked_attempt_id ?? null,
          }),
        ),
      };
    }),
    clusters: (rawLearningSpace.clusters ?? []).map((cluster, index) => {
      const resolvedClusterLabel =
        cluster.cluster_label ?? `Cluster ${index + 1}`;

      return {
        cluster_id: cluster.cluster_id ?? `cluster-${index}`,
        cluster_label: resolvedClusterLabel,
        cluster_centroid:
          Array.isArray(cluster.cluster_centroid) &&
          cluster.cluster_centroid.length === 3
            ? (cluster.cluster_centroid as [number, number, number])
            : [0, 0, 0],
        member_topic_ids: Array.isArray(cluster.member_topic_ids)
          ? cluster.member_topic_ids
          : [],
      };
    }),
    relationships: rawLearningSpace.relationships ?? [],
    viewpoints: rawLearningSpace.viewpoints ?? [],
    projection: rawLearningSpace.projection ?? {
      projection_id: "message_route_learning_space_normalization",
      projection_method: "committed_topic_position",
      dimensionality: 3,
      relationship_basis: [],
      generated_at: null,
      confidence: null,
      notes: [
        "Fallback projection metadata added while normalizing older learning_space payloads.",
      ],
    },
  };
}

export function buildSceneUpdate(
  topicId: string,
  learningSpace: LearningSpace,
  resolutionKind: RouteResolutionKind,
): MessageRouteResponse["scene_update"] {
  return {
    target_topic_id: topicId,
    camera_destination_topic_id: topicId,
    arrival_mode: resolutionKind === "created_new_candidate" ? "warp" : "focus",
    learning_space: learningSpace,
  };
}
