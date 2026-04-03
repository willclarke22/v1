import { mockTopics } from "@/lib/mock-topics";
import { getLatestTopicState } from "@/lib/persistence/read";
import { makeId } from "@/lib/utils/ids";
import type { VectorInfo } from "@/types/contracts";
import { clamp, isPosition, normalizeDiagnosis } from "./shared";

type MockTopic = (typeof mockTopics)[number];
export type RouteTopic = MockTopic;

export type TopicMatchResult = {
  matchedTopic: RouteTopic | null;
  vectorInfo: VectorInfo;
  shouldCreateNewTopic: boolean;
};

function normalizeTopicText(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ");
}

function tokenize(text: string): string[] {
  return normalizeTopicText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function overlapScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;

  const aSet = new Set(a);
  const bSet = new Set(b);

  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }

  return overlap / Math.max(aSet.size, bSet.size);
}

export function titleCaseFromMessage(message: string) {
  const cleaned = message
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/g, "");

  if (!cleaned) return "New Topic";

  const shortened =
    cleaned.length > 36 ? `${cleaned.slice(0, 36).trim()}...` : cleaned;

  return shortened.charAt(0).toUpperCase() + shortened.slice(1);
}

export function inferSeededNextStep(message: string) {
  const cleaned = message.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "Explain this idea in your own words.";
  }

  return `Explain ${cleaned.toLowerCase()} in your own words.`;
}

export function inferKeywordsFromMessage(message: string): string[] {
  return tokenize(message).filter((token) => token.length > 2).slice(0, 8);
}

function computeNextTopicPosition(
  existingTopics: RouteTopic[]
): [number, number, number] {
  const count = existingTopics.length;

  if (count === 0) {
    return [0, 0, 0];
  }

  const angle = count * 1.35;
  const radius = 2.8 + count * 0.65;
  const x = Math.cos(angle) * radius;
  const y = ((count % 3) - 1) * 0.9;
  const z = Math.sin(angle) * radius * 0.75;

  return [x, y, z];
}

export function buildSeededTopicFromMessage(
  message: string,
  existingTopics: RouteTopic[]
): RouteTopic {
  const baseMock = mockTopics[0];

  return {
    ...baseMock,
    id: makeId("topic"),
    name: titleCaseFromMessage(message),
    diagnosis: "representation_gap",
    nextStep: inferSeededNextStep(message),
    confusion: 0.72,
    insight: 0.24,
    learningScore: 0.12,
    position: computeNextTopicPosition(existingTopics),
    scale: baseMock.scale,
  };
}

export async function loadRouteTopics(): Promise<RouteTopic[]> {
  const rows = await getLatestTopicState();

  if (!rows.length) {
    return [];
  }

  return rows.map((row, index) => {
    const fallback =
      mockTopics.find((topic) => topic.id === row.topic_id) ??
      mockTopics[index % Math.max(mockTopics.length, 1)];

    const topicJson =
      row.topic_json && typeof row.topic_json === "object" ? row.topic_json : {};

    const learningSpaceTopic =
      "learning_space_topic" in topicJson &&
      topicJson.learning_space_topic &&
      typeof topicJson.learning_space_topic === "object"
        ? (topicJson.learning_space_topic as Record<string, unknown>)
        : null;

    const storedPosition = learningSpaceTopic?.position;
    const storedNextStep =
      typeof topicJson.next_step === "string"
        ? topicJson.next_step
        : typeof row.next_step === "string" && row.next_step.trim().length > 0
          ? row.next_step
          : fallback?.nextStep ?? "Continue learning";

    return {
      ...(fallback ?? mockTopics[0]),
      id: row.topic_id,
      name: row.topic_name,
      confusion: clamp(row.confusion ?? fallback?.confusion ?? 0.5, 0, 1),
      insight: clamp(row.insight ?? fallback?.insight ?? 0.5, 0, 1),
      learningScore: clamp(
        row.learning_score ?? fallback?.learningScore ?? 0.5,
        0,
        1
      ),
      position: isPosition(storedPosition)
        ? storedPosition
        : (fallback?.position ?? [0, 0, 0]),
      nextStep: storedNextStep,
      diagnosis:
        normalizeDiagnosis(row.diagnosis) ??
        normalizeDiagnosis(
          (fallback as { diagnosis?: unknown } | undefined)?.diagnosis
        ) ??
        "representation_gap",
    };
  });
}

function getTopicKeywords(topicId: string): string[] {
  switch (topicId) {
    case "topic-1":
      return ["neural", "neuron", "neurons", "signal", "signaling"];
    case "topic-2":
      return ["synaptic", "plasticity", "synapse", "learning", "change"];
    case "topic-3":
      return [
        "action",
        "potential",
        "potentials",
        "depolarization",
        "repolarization",
        "membrane",
      ];
    case "topic-4":
      return [
        "neurotransmitter",
        "neurotransmitters",
        "dopamine",
        "serotonin",
        "gaba",
        "glutamate",
      ];
    default:
      return [];
  }
}

export function scoreTopicMatch(message: string, topic: RouteTopic): number {
  const normalizedMessage = normalizeTopicText(message);
  const messageTokens = tokenize(message);
  const topicNameTokens = tokenize(topic.name);
  const fallbackKeywords = getTopicKeywords(topic.id);
  const topicKeywords =
    fallbackKeywords.length > 0 ? fallbackKeywords : topicNameTokens;

  const exactNameMatch =
    normalizedMessage === normalizeTopicText(topic.name) ? 1 : 0;

  const topicNameContained =
    normalizedMessage.includes(normalizeTopicText(topic.name)) ? 1 : 0;

  const keywordHits = topicKeywords.reduce((count, keyword) => {
    return count + (normalizedMessage.includes(keyword.toLowerCase()) ? 1 : 0);
  }, 0);

  const keywordScore =
    topicKeywords.length > 0 ? keywordHits / topicKeywords.length : 0;

  const tokenOverlap = overlapScore(messageTokens, topicNameTokens);
  const semanticishScore = Math.max(keywordScore, tokenOverlap);

  const score =
    exactNameMatch * 1.0 +
    topicNameContained * 0.78 +
    semanticishScore * 0.72;

  return clamp(score, 0, 1);
}

const REUSE_TOPIC_THRESHOLD = 0.58;

export function resolveTopicForMessage(
  message: string,
  existingTopics: RouteTopic[]
): TopicMatchResult {
  if (!existingTopics.length) {
    return {
      matchedTopic: null,
      vectorInfo: {
        top_k_topic_names: [],
        top_k_topic_ids: [],
        top_k_similarity_scores: [],
      },
      shouldCreateNewTopic: true,
    };
  }

  const scored = existingTopics
    .map((topic) => {
      const similarity = scoreTopicMatch(message, topic);

      return {
        topic,
        similarity,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const best = scored[0] ?? null;

  return {
    matchedTopic:
      best && best.similarity >= REUSE_TOPIC_THRESHOLD ? best.topic : null,
    vectorInfo: {
      top_k_topic_names: scored.slice(0, 3).map((item) => item.topic.name),
      top_k_topic_ids: scored.slice(0, 3).map((item) => item.topic.id),
      top_k_similarity_scores: scored
        .slice(0, 3)
        .map((item) => clamp(item.similarity, 0, 0.98)),
    },
    shouldCreateNewTopic: !best || best.similarity < REUSE_TOPIC_THRESHOLD,
  };
}