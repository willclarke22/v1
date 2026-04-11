import { NextResponse } from "next/server";
import { getLatestTopicState } from "@/lib/persistence/read";
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

function getCreatedAt(row: unknown): string | null {
  if (
    row &&
    typeof row === "object" &&
    "created_at" in row &&
    typeof row.created_at === "string"
  ) {
    return row.created_at;
  }

  return null;
}

function getTopicJson(row: unknown): Record<string, unknown> {
  if (
    row &&
    typeof row === "object" &&
    "topic_json" in row &&
    row.topic_json &&
    typeof row.topic_json === "object"
  ) {
    return row.topic_json as Record<string, unknown>;
  }

  return {};
}

function getLearningSpaceTopicPosition(
  topicJson: Record<string, unknown>
): [number, number, number] | null {
  if (
    "learning_space_topic" in topicJson &&
    topicJson.learning_space_topic &&
    typeof topicJson.learning_space_topic === "object"
  ) {
    const learningSpaceTopic = topicJson.learning_space_topic as Record<
      string,
      unknown
    >;

    if (isPosition(learningSpaceTopic.position)) {
      return learningSpaceTopic.position;
    }
  }

  return null;
}

function mapRowsToTopics(
  rows: Awaited<ReturnType<typeof getLatestTopicState>>
): Topic[] {
  return rows.map((row, index) => {
    const rowWithTopicFields = row as unknown as {
      topic_id: string;
      topic_name: string;
      diagnosis?: unknown;
      confusion?: number | null;
      insight?: number | null;
      learning_score?: number | null;
      next_step?: string | null;
      updated_at?: string | null;
      topic_message_count?: number | null;
      topic_centroid?: unknown;
    };

    const topicJson = getTopicJson(row);

    const nextStep =
      typeof topicJson.next_step === "string" && topicJson.next_step.trim().length > 0
        ? topicJson.next_step
        : typeof rowWithTopicFields.next_step === "string" &&
            rowWithTopicFields.next_step.trim().length > 0
          ? rowWithTopicFields.next_step
          : "Continue learning";

    const position =
      getLearningSpaceTopicPosition(topicJson) ??
      (isPosition(rowWithTopicFields.topic_centroid)
        ? rowWithTopicFields.topic_centroid
        : [index * 2.2, 0, 0]);

    return {
      id: rowWithTopicFields.topic_id,
      name: rowWithTopicFields.topic_name,
      diagnosis: normalizeDiagnosis(rowWithTopicFields.diagnosis),
      nextStep,
      confusion: clamp(rowWithTopicFields.confusion ?? 0.5),
      insight: clamp(rowWithTopicFields.insight ?? 0.5),
      learningScore: clamp(rowWithTopicFields.learning_score ?? 0.5),
      position,
      scale: 1,
      messageCount:
        typeof rowWithTopicFields.topic_message_count === "number"
          ? rowWithTopicFields.topic_message_count
          : 0,
      lastUpdated:
        typeof rowWithTopicFields.updated_at === "string"
          ? rowWithTopicFields.updated_at
          : getCreatedAt(row),
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