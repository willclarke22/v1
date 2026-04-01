import { NextResponse } from "next/server";
import { getLatestTopicState } from "@/lib/persistence/read";
import { mockTopics } from "@/lib/mock-topics";
import type { DiagnosisType } from "@/types/contracts";
import type { Topic } from "@/types/topic";

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function isPosition(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number")
  );
}

function normalizeDiagnosis(raw: unknown): DiagnosisType {
  if (
    raw === "recall_gap" ||
    raw === "representation_gap" ||
    raw === "procedure_gap" ||
    raw === "discrimination_gap" ||
    raw === "transfer_gap"
  ) {
    return raw;
  }

  return "representation_gap";
}

function mapRowsToTopics(
  rows: Awaited<ReturnType<typeof getLatestTopicState>>
): Topic[] {
  return rows.map((row, index) => {
    const fallbackMock =
      mockTopics.find((topic) => topic.id === row.topic_id) ??
      mockTopics[index % Math.max(mockTopics.length, 1)];

    const topicJson =
      row.topic_json && typeof row.topic_json === "object" ? row.topic_json : {};

    const maybeNextStep =
      typeof topicJson.next_step === "string"
        ? topicJson.next_step
        : typeof row.next_step === "string" && row.next_step.trim().length > 0
        ? row.next_step
        : fallbackMock?.nextStep ?? "Continue learning";

    const positionFromJson =
      topicJson &&
      typeof topicJson === "object" &&
      "learning_space_topic" in topicJson &&
      topicJson.learning_space_topic &&
      typeof topicJson.learning_space_topic === "object" &&
      "position" in topicJson.learning_space_topic
        ? (topicJson.learning_space_topic as { position?: unknown }).position
        : null;

    const position = isPosition(positionFromJson)
      ? positionFromJson
      : fallbackMock?.position ?? [0, 0, 0];

    return {
      id: row.topic_id,
      name: row.topic_name,
      diagnosis: normalizeDiagnosis(
        row.diagnosis ??
          (fallbackMock as { diagnosis?: unknown } | undefined)?.diagnosis
      ),
      nextStep: maybeNextStep,
      confusion: clamp(row.confusion ?? fallbackMock?.confusion ?? 0.5),
      insight: clamp(row.insight ?? fallbackMock?.insight ?? 0.5),
      learningScore: clamp(
        row.learning_score ?? fallbackMock?.learningScore ?? 0.5
      ),
      position,
      scale: fallbackMock?.scale,
      messageCount: 1,
      lastUpdated:
        typeof row.updated_at === "string"
          ? row.updated_at
          : typeof row.created_at === "string"
          ? row.created_at
          : null,
      hasAvailableProbe: false,
    };
  });
}

export async function GET() {
  try {
    const rows = await getLatestTopicState();

    if (!rows.length) {
      return NextResponse.json({
        topics: [],
        source: "empty",
      });
    }

    const topics = mapRowsToTopics(rows);

    return NextResponse.json({
      topics,
      source: "supabase",
    });
  } catch (error) {
    console.error("GET /api/bootstrap/topic-state failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to bootstrap topic state.",
      },
      { status: 500 }
    );
  }
}