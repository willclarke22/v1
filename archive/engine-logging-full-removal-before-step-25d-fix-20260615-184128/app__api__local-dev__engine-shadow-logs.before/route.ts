import { NextRequest, NextResponse } from "next/server";
import {
  buildReviewBatch,
  clearInMemoryModelCallRows,
  exportReviewBatchToJsonl,
  getInMemoryModelCallRows,
} from "@/lib/engine";
import type {
  EngineModelCallKind,
  EngineReviewStatus,
} from "@/lib/engine";

export const dynamic = "force-dynamic";

const VALID_CALL_KINDS: EngineModelCallKind[] = [
  "diagnosis",
  "probe_contract",
  "attempt_evaluation",
];

const VALID_REVIEW_STATUSES: EngineReviewStatus[] = [
  "unreviewed",
  "needs_review",
  "approved",
  "rejected",
];

function localDevRouteEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.MYWAY_ENABLE_LOCAL_DEV_ROUTES === "1"
  );
}

function parseLimit(value: string | null): number | null {
  if (!value) {
    return 100;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.max(0, Math.min(1000, Math.trunc(parsed)));
}

function parseCallKinds(value: string | null): EngineModelCallKind[] | undefined {
  if (!value) {
    return undefined;
  }

  const requested = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const callKinds = requested.filter((item): item is EngineModelCallKind =>
    VALID_CALL_KINDS.includes(item as EngineModelCallKind),
  );

  return callKinds.length > 0 ? callKinds : undefined;
}

function parseReviewStatuses(
  value: string | null,
): EngineReviewStatus[] | undefined {
  if (!value) {
    return undefined;
  }

  const requested = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const reviewStatuses = requested.filter((item): item is EngineReviewStatus =>
    VALID_REVIEW_STATUSES.includes(item as EngineReviewStatus),
  );

  return reviewStatuses.length > 0 ? reviewStatuses : undefined;
}

export async function GET(request: NextRequest) {
  if (!localDevRouteEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Local dev engine shadow logs are disabled in production.",
      },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const callKinds = parseCallKinds(url.searchParams.get("call_kind"));
  const reviewStatuses = parseReviewStatuses(url.searchParams.get("review_status"));
  const format = url.searchParams.get("format");

  const rows = getInMemoryModelCallRows();

  const batch = buildReviewBatch({
    rows,
    filters: {
      call_kinds: callKinds,
      review_statuses: reviewStatuses,
      include_provider_errors: true,
      include_validation_failures: true,
      limit,
    },
  });

  if (format === "jsonl") {
    return new Response(exportReviewBatchToJsonl(batch), {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      route: "/api/local-dev/engine-shadow-logs",
      note:
        "These rows are in-memory only. They reset when the dev server restarts.",
      total_in_memory_rows: rows.length,
      returned_rows: batch.rows.length,
      batch,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

export async function DELETE() {
  if (!localDevRouteEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Local dev engine shadow logs are disabled in production.",
      },
      { status: 404 },
    );
  }

  const previousCount = getInMemoryModelCallRows().length;
  clearInMemoryModelCallRows();

  return NextResponse.json({
    ok: true,
    cleared_rows: previousCount,
  });
}

