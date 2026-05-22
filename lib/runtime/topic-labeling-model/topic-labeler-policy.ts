import type { TopicLabelerClientResult } from "./topic-labeler-contract";
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
  raw_model_result: TopicLabelerClientResult | null;
};

const MAX_CREATED_TOPIC_LABEL_TOKENS = 8;

const SUSPICIOUS_CREATED_TOPIC_LABELS = new Set([
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

  return cleaned || null;
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

  if (SUSPICIOUS_CREATED_TOPIC_LABELS.has(normalized)) return true;

  const tokenCount = normalized.split(" ").filter(Boolean).length;

  return tokenCount > MAX_CREATED_TOPIC_LABEL_TOKENS;
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

function buildDecision(args: {
  usable: boolean;
  decisionKind: ModelTopicRouteDecisionKind;
  extractedLabel?: string | null;
  matchedTopic?: RouteTopic | null;
  matchedTopicLabel?: string | null;
  reasons: string[];
  rawModelResult: TopicLabelerClientResult | null;
}): ModelTopicRoutePolicyDecision {
  const matchedTopicLabel =
    getRouteTopicLabel(args.matchedTopic ?? null) ??
    cleanModelLabel(args.matchedTopicLabel) ??
    null;

  return {
    usable: args.usable,
    decision_kind: args.decisionKind,
    extracted_label: cleanModelLabel(args.extractedLabel),
    matched_topic_label: matchedTopicLabel,
    matched_topic_id: args.matchedTopic?.id ?? null,
    target_topic: args.matchedTopic ?? null,
    reasons: args.reasons,
    raw_model_result: args.rawModelResult,
  };
}

function buildUnusableDecision(args: {
  reason: string;
  modelResult: TopicLabelerClientResult | null;
  extractedLabel?: string | null;
  matchedTopicLabel?: string | null;
  matchedTopic?: RouteTopic | null;
}): ModelTopicRoutePolicyDecision {
  return buildDecision({
    usable: false,
    decisionKind: "unusable_model_result",
    extractedLabel: args.extractedLabel ?? null,
    matchedTopicLabel: args.matchedTopicLabel ?? null,
    matchedTopic: args.matchedTopic ?? null,
    reasons: [args.reason],
    rawModelResult: args.modelResult,
  });
}

export function buildModelTopicRoutePolicyDecision(args: {
  modelResult: TopicLabelerClientResult | null;
  activeTopic: RouteTopic | null;
  existingTopics: RouteTopic[];
}): ModelTopicRoutePolicyDecision {
  const { modelResult, activeTopic, existingTopics } = args;

  if (!modelResult) {
    return buildUnusableDecision({
      reason: "model_result_missing",
      modelResult,
    });
  }

  if (!modelResult.ok) {
    return buildUnusableDecision({
      reason: `model_result_error from ${modelResult.provider}: ${modelResult.error}`,
      modelResult,
    });
  }

  if (!modelResult.response.ok) {
    return buildUnusableDecision({
      reason: `model_response_not_ok from ${modelResult.provider}`,
      modelResult,
    });
  }

  const route = modelResult.response.route;
  const routeDecision = route.route_decision;
  const extractedLabel = cleanModelLabel(
    route.extracted_label ??
      modelResult.response.model_prediction.extracted_label ??
      null,
  );

  const matchedTopicLabel = getModelRouteMatchedTopicLabel(route);
  const matchedTopic = findTopicByLabel(existingTopics, matchedTopicLabel);

  if (routeDecision === "stay_active") {
    if (!activeTopic) {
      return buildDecision({
        usable: false,
        decisionKind: "stay_active",
        extractedLabel: null,
        matchedTopicLabel,
        matchedTopic: null,
        reasons: ["model_requested_stay_active_but_no_active_topic"],
        rawModelResult: modelResult,
      });
    }

    return buildDecision({
      usable: true,
      decisionKind: "stay_active",
      extractedLabel: null,
      matchedTopic: activeTopic,
      reasons: ["model_requested_stay_active_with_active_topic"],
      rawModelResult: modelResult,
    });
  }

  if (routeDecision === "switch_existing") {
    if (!matchedTopic) {
      return buildDecision({
        usable: false,
        decisionKind: "switch_existing",
        extractedLabel,
        matchedTopicLabel,
        matchedTopic: null,
        reasons: ["model_requested_switch_existing_but_topic_not_found"],
        rawModelResult: modelResult,
      });
    }

    return buildDecision({
      usable: true,
      decisionKind: "switch_existing",
      extractedLabel,
      matchedTopic,
      reasons: ["model_requested_switch_existing_and_topic_found"],
      rawModelResult: modelResult,
    });
  }

  if (routeDecision === "create_new") {
    if (!extractedLabel) {
      return buildDecision({
        usable: false,
        decisionKind: "create_new",
        extractedLabel: null,
        matchedTopicLabel,
        matchedTopic: null,
        reasons: ["model_requested_create_new_but_missing_label"],
        rawModelResult: modelResult,
      });
    }

    if (looksLikeSuspiciousModelLabel(extractedLabel)) {
      return buildDecision({
        usable: false,
        decisionKind: "create_new",
        extractedLabel,
        matchedTopicLabel,
        matchedTopic: null,
        reasons: ["model_requested_create_new_but_label_suspicious"],
        rawModelResult: modelResult,
      });
    }

    const existingMatch = findTopicByLabel(existingTopics, extractedLabel);

    if (existingMatch) {
      return buildDecision({
        usable: true,
        decisionKind: "switch_existing",
        extractedLabel,
        matchedTopic: existingMatch,
        reasons: [
          "model_requested_create_new_but_label_matches_existing_topic",
        ],
        rawModelResult: modelResult,
      });
    }

    return buildDecision({
      usable: true,
      decisionKind: "create_new",
      extractedLabel,
      matchedTopicLabel,
      matchedTopic: null,
      reasons: ["model_requested_create_new_with_clean_label"],
      rawModelResult: modelResult,
    });
  }

  if (routeDecision === "clarify_no_topic") {
    return buildDecision({
      usable: true,
      decisionKind: "clarify_no_topic",
      extractedLabel: null,
      matchedTopicLabel: null,
      matchedTopic: null,
      reasons: ["model_requested_clarify_no_topic"],
      rawModelResult: modelResult,
    });
  }

  if (routeDecision === "clarify_topic_intent") {
    return buildDecision({
      usable: true,
      decisionKind: "clarify_topic_intent",
      extractedLabel,
      matchedTopicLabel,
      matchedTopic,
      reasons: ["model_requested_clarify_topic_intent"],
      rawModelResult: modelResult,
    });
  }

  return buildUnusableDecision({
    reason: `unknown_model_route_decision: ${String(routeDecision)}`,
    modelResult,
    extractedLabel,
    matchedTopicLabel,
    matchedTopic,
  });
}
