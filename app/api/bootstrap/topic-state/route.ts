// app/api/bootstrap/topic-state/route.ts

import { NextResponse } from "next/server";
import { getLatestTopicState } from "@/lib/persistence/read";
import { resolveTopicLayout } from "@/lib/learning-space/topic-position";
import type { DiagnosisType } from "@/types/contracts";
import type { Topic } from "@/types/topic";
import type {
  LearningSpaceProjectionMetadata,
  LearningSpaceRelationship,
  LearningSpaceViewpoint,
} from "@/types/learning-space";

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
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
    typeof row.topic_json === "object" &&
    !Array.isArray(row.topic_json)
  ) {
    return row.topic_json as Record<string, unknown>;
  }

  return {};
}


function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getLearningSpaceRelationshipLayer(
  rows: Awaited<ReturnType<typeof getLatestTopicState>>,
) {
  for (const row of rows) {
    const topicJson = getTopicJson(row);
    const relationships = asArray(topicJson.learning_space_relationships);
    const viewpoints = asArray(topicJson.learning_space_viewpoints);
    const projection = asRecord(topicJson.learning_space_projection);

    if (relationships.length > 0 || viewpoints.length > 0 || projection) {
      return {
        relationships: relationships as LearningSpaceRelationship[],
        viewpoints: viewpoints as LearningSpaceViewpoint[],
        projection: projection as LearningSpaceProjectionMetadata | null,
      };
    }
  }

  return {
    relationships: [] as LearningSpaceRelationship[],
    viewpoints: [] as LearningSpaceViewpoint[],
    projection: null as LearningSpaceProjectionMetadata | null,
  };
}

function getTopicLabel(args: {
  rowWithTopicFields: {
    topic_label?: string | null;
  };
  topicJson: Record<string, unknown>;
}) {
  const { rowWithTopicFields, topicJson } = args;

  if (
    typeof topicJson.topic_label === "string" &&
    topicJson.topic_label.trim().length > 0
  ) {
    return topicJson.topic_label.trim();
  }

  if (
    typeof rowWithTopicFields.topic_label === "string" &&
    rowWithTopicFields.topic_label.trim().length > 0
  ) {
    return rowWithTopicFields.topic_label.trim();
  }

  return "Untitled Topic";
}

function mapRowsToTopics(
  rows: Awaited<ReturnType<typeof getLatestTopicState>>,
): Topic[] {
  const learningSpaceLayer = getLearningSpaceRelationshipLayer(rows);

  return rows.map((row, index) => {
    const rowWithTopicFields = row as unknown as {
      topic_id: string;
      topic_label?: string | null;
      diagnosis?: unknown;
      confusion?: number | null;
      insight?: number | null;
      learning_score?: number | null;
      next_step?: string | null;
      updated_at?: string | null;
      topic_message_count?: number | null;
    };

    const topicJson = getTopicJson(row);

    const topicLabel = getTopicLabel({
      rowWithTopicFields,
      topicJson,
    });

    const nextStep =
      typeof topicJson.next_step === "string" &&
      topicJson.next_step.trim().length > 0
        ? topicJson.next_step
        : typeof rowWithTopicFields.next_step === "string" &&
            rowWithTopicFields.next_step.trim().length > 0
          ? rowWithTopicFields.next_step
          : "Continue learning";

    const layout = resolveTopicLayout({
      topicId: rowWithTopicFields.topic_id,
      index,
      topicPosition: row.topic_position,
      semanticPosition: row.semantic_position,
      semanticPositionMethod: row.semantic_position_method,
      semanticPositionUpdatedAt: row.semantic_position_updated_at,
      topicJson,
    });

    return {
      id: rowWithTopicFields.topic_id,
      topic_label: topicLabel,
      diagnosis: normalizeDiagnosis(rowWithTopicFields.diagnosis),
      nextStep,
      confusion: clamp(rowWithTopicFields.confusion ?? 0.5),
      insight: clamp(rowWithTopicFields.insight ?? 0.5),
      learningScore: clamp(rowWithTopicFields.learning_score ?? 0.5),

      /**
       * Current committed renderer position.
       */
      position: layout.position,

      /**
       * Optional semantic target metadata.
       */
      semanticPosition: layout.semantic_position,
      semanticPositionMethod: layout.semantic_position_method,
      semanticPositionUpdatedAt: layout.semantic_position_updated_at,
      positionSource: layout.position_source,

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
      learningSpaceRelationships: learningSpaceLayer.relationships,
      learningSpaceViewpoints: learningSpaceLayer.viewpoints,
      learningSpaceProjection: learningSpaceLayer.projection,
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
      { status: 500 },
    );
  }
}
