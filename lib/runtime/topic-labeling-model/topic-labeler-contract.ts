export type TopicReferenceType =
  | "explicit_topic_reference"
  | "active_topic_reference"
  | "unclear_topic"
  | "no_topic";

export type TopicLabelerRouteDecision =
  | "stay_active"
  | "switch_existing"
  | "create_new"
  | "clarify_topic_intent"
  | "clarify_no_topic"
  | "error_unknown_reference_type";

export type TopicLabelerProviderId = "v3" | "v4" | "v5";

export type TopicLabelerRequest = {
  message: string;
  active_topic_label: string | null;
  current_topic_labels: string[];
  previous_user_messages: string[];
};

export type TopicLabelerModelPrediction = {
  topic_reference_type: TopicReferenceType | string;
  extracted_label: string | null;
};

export type TopicLabelerRoute = {
  route_decision: TopicLabelerRouteDecision | string;
  topic_reference_type: TopicReferenceType | string;
  extracted_label: string | null;
  matched_topic_label: string | null;
  match_type: string | null;
  score: number | null;
  sequence_similarity?: number | null;
  token_f1?: number | null;
  reason: string;
};

export type TopicLabelerResponse = {
  ok: boolean;
  provider: TopicLabelerProviderId;
  model_version: string;
  model_prediction: TopicLabelerModelPrediction;
  route: TopicLabelerRoute;
  raw?: unknown;
};

export type TopicLabelerClientResult =
  | {
      ok: true;
      source: "topic_labeler";
      provider: TopicLabelerProviderId;
      response: TopicLabelerResponse;
      latency_ms: number;
    }
  | {
      ok: false;
      source: "topic_labeler";
      provider: TopicLabelerProviderId;
      error: string;
      latency_ms: number;
    };