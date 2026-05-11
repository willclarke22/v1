import type { VectorInfo } from "@/types/contracts";
import type { RouteTopic, DeterministicTopicResolutionSnapshot } from "@/lib/runtime/topic-resolution";

export type TopicLabelingLLMDecision = {
  decision: "reuse_existing" | "create_new" | "fallback_active" | "no_match";
  canonical_label: string | null;
  matched_topic_id: string | null;
  matched_topic_name: string | null;
  confidence: number;
  reason: string | null;
};

type TopicLabelingLLMArgs = {
  message: string;
  activeTopic: RouteTopic | null;
  existingTopics: RouteTopic[];
  deterministicResolution: DeterministicTopicResolutionSnapshot;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function normalizeSurface(text: string) {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLoose(text: string) {
  return normalizeSurface(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampConfidence(value: unknown, fallback = 0.5) {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function extractJsonObject(text: string): string | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first === -1 || last === -1 || last <= first) {
    return null;
  }

  return text.slice(first, last + 1);
}

function looksLikeSuspiciousCreateLabel(label: string | null) {
  if (!label) return true;

  const normalized = normalizeLoose(label);
  if (!normalized) return true;

  const suspiciousSingles = new Set([
    "i",
    "me",
    "you",
    "we",
    "they",
    "this",
    "that",
    "it",
    "part",
    "thing",
    "stuff",
    "help",
    "question",
    "new topic",
    "law works",
  ]);

  if (suspiciousSingles.has(normalized)) return true;
  if (normalized.split(" ").length > 8) return true;
  if (/\b(help|understand|get|confused|stuck|trouble)\b/i.test(label)) return true;

  return false;
}

function buildTopCandidateTopics(
  existingTopics: RouteTopic[],
  vectorInfo: VectorInfo
) {
  const preferredIds = new Set(vectorInfo.top_k_topic_ids);

  const ranked = existingTopics
    .filter((topic) => preferredIds.has(topic.id))
    .sort((a, b) => {
      const aIndex = vectorInfo.top_k_topic_ids.indexOf(a.id);
      const bIndex = vectorInfo.top_k_topic_ids.indexOf(b.id);
      return aIndex - bIndex;
    });

  const fallback =
    ranked.length > 0 ? ranked : existingTopics.slice(0, 6);

  return fallback.slice(0, 6).map((topic) => ({
    topic_id: topic.id,
    topic_name: topic.name,
  }));
}

function validateParsedDecision(
  parsed: Partial<TopicLabelingLLMDecision>
): TopicLabelingLLMDecision | null {
  const decision = parsed.decision;

  if (
    decision !== "reuse_existing" &&
    decision !== "create_new" &&
    decision !== "fallback_active" &&
    decision !== "no_match"
  ) {
    return null;
  }

  const canonicalLabel =
    typeof parsed.canonical_label === "string"
      ? normalizeSurface(parsed.canonical_label) || null
      : null;

  if (decision === "create_new" && looksLikeSuspiciousCreateLabel(canonicalLabel)) {
    return null;
  }

  return {
    decision,
    canonical_label: canonicalLabel,
    matched_topic_id:
      typeof parsed.matched_topic_id === "string"
        ? parsed.matched_topic_id.trim() || null
        : null,
    matched_topic_name:
      typeof parsed.matched_topic_name === "string"
        ? normalizeSurface(parsed.matched_topic_name) || null
        : null,
    confidence: clampConfidence(parsed.confidence, 0.5),
    reason:
      typeof parsed.reason === "string"
        ? normalizeSurface(parsed.reason) || null
        : null,
  };
}

function buildSystemPrompt() {
  return [
    "You are a conservative topic-resolution adjudicator for a learning app called MyWay.",
    "Your job is to help choose the best topic resolution outcome for the user's message.",
    "You must be conservative and precise.",
    "Prefer reusing an existing topic when a clear match exists.",
    "Only choose create_new when the message clearly points to a specific concept that is not already captured well by an existing topic.",
    "Never create a topic from vague learner-state phrases like 'I', 'this part', 'help', or sentence fragments.",
    "If the message is ambiguous and does not justify a new topic, prefer reuse_existing, fallback_active, or no_match.",
    "Return JSON only. No markdown, no explanation outside JSON.",
    "Return exactly these keys:",
    "decision, canonical_label, matched_topic_id, matched_topic_name, confidence, reason",
    "Allowed decision values are:",
    "reuse_existing, create_new, fallback_active, no_match",
  ].join(" ");
}

function buildUserPayload(args: TopicLabelingLLMArgs) {
  return {
    user_message: args.message,
    active_topic: args.activeTopic
      ? {
          topic_id: args.activeTopic.id,
          topic_name: args.activeTopic.name,
        }
      : null,
    deterministic_resolution: {
      resolution_kind: args.deterministicResolution.resolutionKind,
      resolved_label: args.deterministicResolution.resolvedLabel,
      match_confidence: args.deterministicResolution.matchConfidence,
      vector_info: args.deterministicResolution.vectorInfo,
    },
    candidate_existing_topics: buildTopCandidateTopics(
      args.existingTopics,
      args.deterministicResolution.vectorInfo
    ),
    resolution_rules: {
      prefer_reuse_when_clear: true,
      require_specific_label_for_create_new: true,
      never_create_from_vague_or_learner_state_phrases: true,
      allow_fallback_active_only_when_active_topic_is_plausible: true,
    },
  };
}

export async function runTopicLabelingLLMAdjudication(
  args: TopicLabelingLLMArgs
): Promise<TopicLabelingLLMDecision | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_TOPIC_LABEL_MODEL ?? "gpt-4.1-mini";

  const userPayload = buildUserPayload(args);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },
          {
            role: "user",
            content: JSON.stringify(userPayload),
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content ?? null;

    if (!content) {
      return null;
    }

    const jsonText = extractJsonObject(content);
    if (!jsonText) {
      return null;
    }

    const parsed = JSON.parse(jsonText) as Partial<TopicLabelingLLMDecision>;
    return validateParsedDecision(parsed);
  } catch {
    return null;
  }
}