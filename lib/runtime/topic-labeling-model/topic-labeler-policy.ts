import type { TopicLabelerV3ClientResult } from "./model-topic-labeler-v3";
import type { RouteTopic } from "@/lib/runtime/route-topics";

export type ModelTopicRouteDecisionKind =
  | "create_new"
  | "switch_existing"
  | "stay_active"
  | "clarify_no_topic"
  | "clarify_topic_intent"
  | "unusable_model_result";

export type ModelTopicRoutePolicyDecision = {
  usable: boolean;
  decision_kind: ModelTopicRouteDecisionKind;
  extracted_label: string | null;
  matched_topic_label: string | null;
  matched_topic_id: string | null;
  target_topic: RouteTopic | null;
  reasons: string[];
  raw_model_result: TopicLabelerV3ClientResult | null;
};

function normalizeLoose(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanModelLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null;

  const cleaned = label.trim().replace(/\s+/g, " ");

  if (!cleaned) return null;

  return cleaned;
}

function getRouteTopicLabel(topic: RouteTopic | null): string | null {
  return topic?.topic_label?.trim() || null;
}

function getModelRouteMatchedTopicLabel(route: unknown): string | null {
  const routeWithLabel = route as { matched_topic_label?: string | null };
  return cleanModelLabel(routeWithLabel.matched_topic_label);
}

function looksLikeSuspiciousModelLabel(label: string | null) {
  if (!label) return true;

  const normalized = normalizeLoose(label);
  if (!normalized) return true;

  const suspiciousLabels = new Set([
    "can you explain that easier",
    "what would that look like",
    "what does that even mean",
    "that easier",
    "that look like",
    "i don t know",
    "i dont know",
    "i am confused",
    "i m confused",
    "help",
    "question",
    "new topic",
  ]);

  if (suspiciousLabels.has(normalized)) return true;

  const tokenCount = normalized.split(" ").filter(Boolean).length;

  if (tokenCount > 8) return true;

  return false;
}

function findTopicByLabel(existingTopics: RouteTopic[], label: string | null) {
  if (!label) return null;

  const target = normalizeLoose(label);

  return (
    existingTopics.find((topic) => {
      const topicLabel = getRouteTopicLabel(topic);
      return topicLabel ? normalizeLoose(topicLabel) === target : false;
    }) ?? null
  );
}

export function buildModelTopicRoutePolicyDecision(args: {
  modelResult: TopicLabelerV3ClientResult | null;
  activeTopic: RouteTopic | null;
  existingTopics: RouteTopic[];
}): ModelTopicRoutePolicyDecision {
  const { modelResult, activeTopic, existingTopics } = args;

  if (!modelResult) {
    return {
      usable: false,
      decision_kind: "unusable_model_result",
      extracted_label: null,
      matched_topic_label: null,
      matched_topic_id: null,
      target_topic: null,
      reasons: ["model_result_missing"],
      raw_model_result: modelResult,
    };
  }

  if (!modelResult.ok) {
    return {
      usable: false,
      decision_kind: "unusable_model_result",
      extracted_label: null,
      matched_topic_label: null,
      matched_topic_id: null,
      target_topic: null,
      reasons: [`model_result_error: ${modelResult.error}`],
      raw_model_result: modelResult,
    };
  }

  if (!modelResult.response.ok) {
    return {
      usable: false,
      decision_kind: "unusable_model_result",
      extracted_label: null,
      matched_topic_label: null,
      matched_topic_id: null,
      target_topic: null,
      reasons: ["model_response_not_ok"],
      raw_model_result: modelResult,
    };
  }

  const route = modelResult.response.route;
  const routeDecision = route.route_decision;
  const extractedLabel = cleanModelLabel(
    route.extracted_label ??
      modelResult.response.model_prediction.extracted_label ??
      null
  );

  const matchedTopicLabel = getModelRouteMatchedTopicLabel(route);
  const matchedTopic = findTopicByLabel(existingTopics, matchedTopicLabel);

  if (routeDecision === "stay_active") {
    if (!activeTopic) {
      return {
        usable: false,
        decision_kind: "stay_active",
        extracted_label: null,
        matched_topic_label: matchedTopicLabel,
        matched_topic_id: null,
        target_topic: null,
        reasons: ["model_requested_stay_active_but_no_active_topic"],
        raw_model_result: modelResult,
      };
    }

    return {
      usable: true,
      decision_kind: "stay_active",
      extracted_label: null,
      matched_topic_label: getRouteTopicLabel(activeTopic),
      matched_topic_id: activeTopic.id,
      target_topic: activeTopic,
      reasons: ["model_requested_stay_active_with_active_topic"],
      raw_model_result: modelResult,
    };
  }

  if (routeDecision === "switch_existing") {
    if (!matchedTopic) {
      return {
        usable: false,
        decision_kind: "switch_existing",
        extracted_label: extractedLabel,
        matched_topic_label: matchedTopicLabel,
        matched_topic_id: null,
        target_topic: null,
        reasons: ["model_requested_switch_existing_but_topic_not_found"],
        raw_model_result: modelResult,
      };
    }

    return {
      usable: true,
      decision_kind: "switch_existing",
      extracted_label: extractedLabel,
      matched_topic_label: getRouteTopicLabel(matchedTopic),
      matched_topic_id: matchedTopic.id,
      target_topic: matchedTopic,
      reasons: ["model_requested_switch_existing_and_topic_found"],
      raw_model_result: modelResult,
    };
  }

  if (routeDecision === "create_new") {
    if (!extractedLabel) {
      return {
        usable: false,
        decision_kind: "create_new",
        extracted_label: null,
        matched_topic_label: matchedTopicLabel,
        matched_topic_id: null,
        target_topic: null,
        reasons: ["model_requested_create_new_but_missing_label"],
        raw_model_result: modelResult,
      };
    }

    if (looksLikeSuspiciousModelLabel(extractedLabel)) {
      return {
        usable: false,
        decision_kind: "create_new",
        extracted_label: extractedLabel,
        matched_topic_label: matchedTopicLabel,
        matched_topic_id: null,
        target_topic: null,
        reasons: ["model_requested_create_new_but_label_suspicious"],
        raw_model_result: modelResult,
      };
    }

    const existingMatch = findTopicByLabel(existingTopics, extractedLabel);

    if (existingMatch) {
      return {
        usable: true,
        decision_kind: "switch_existing",
        extracted_label: extractedLabel,
        matched_topic_label: getRouteTopicLabel(existingMatch),
          matched_topic_id: existingMatch.id,
        target_topic: existingMatch,
        reasons: [
          "model_requested_create_new_but_label_matches_existing_topic",
        ],
        raw_model_result: modelResult,
      };
    }

    return {
      usable: true,
      decision_kind: "create_new",
      extracted_label: extractedLabel,
      matched_topic_label: matchedTopicLabel,
      matched_topic_id: null,
      target_topic: null,
      reasons: ["model_requested_create_new_with_clean_label"],
      raw_model_result: modelResult,
    };
  }

  if (routeDecision === "clarify_no_topic") {
    return {
      usable: true,
      decision_kind: "clarify_no_topic",
      extracted_label: null,
      matched_topic_label: null,
      matched_topic_id: null,
      target_topic: null,
      reasons: ["model_requested_clarify_no_topic"],
      raw_model_result: modelResult,
    };
  }

  if (routeDecision === "clarify_topic_intent") {
    return {
      usable: true,
      decision_kind: "clarify_topic_intent",
      extracted_label: null,
      matched_topic_label: null,
      matched_topic_id: null,
      target_topic: null,
      reasons: ["model_requested_clarify_topic_intent"],
      raw_model_result: modelResult,
    };
  }

  return {
    usable: false,
    decision_kind: "unusable_model_result",
    extracted_label: extractedLabel,
    matched_topic_label: matchedTopicLabel,
    matched_topic_id: matchedTopic?.id ?? null,
    target_topic: matchedTopic,
    reasons: [`unknown_model_route_decision: ${String(routeDecision)}`],
    raw_model_result: modelResult,
  };
}
