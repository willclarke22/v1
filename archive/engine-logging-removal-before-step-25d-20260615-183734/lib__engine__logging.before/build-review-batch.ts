import type {
  EngineModelCallKind,
  EngineModelCallRow,
  EngineReviewStatus,
} from "./model-call-row";

export type EngineReviewBatch = {
  schema_version: "engine_review_batch_v1";

  batch_id: string;
  created_at: string;

  filters: EngineReviewBatchFilters;

  counts: {
    total: number;
    diagnosis: number;
    probe_contract: number;
    attempt_evaluation: number;
    needs_review: number;
    approved: number;
    rejected: number;
    unreviewed: number;
  };

  rows: EngineModelCallRow[];
};

export type EngineReviewBatchFilters = {
  call_kinds?: EngineModelCallKind[];
  review_statuses?: EngineReviewStatus[];
  include_provider_errors?: boolean;
  include_validation_failures?: boolean;
  limit?: number | null;
};

function getNowIso(now?: string | null): string {
  if (now && now.trim().length > 0) {
    return now;
  }

  return new Date().toISOString();
}

function createBatchId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return `engine_review_batch_${timestamp}_${random}`;
}

function shouldIncludeRow(
  row: EngineModelCallRow,
  filters: EngineReviewBatchFilters,
): boolean {
  if (
    filters.call_kinds &&
    filters.call_kinds.length > 0 &&
    !filters.call_kinds.includes(row.call_kind)
  ) {
    return false;
  }

  if (
    filters.review_statuses &&
    filters.review_statuses.length > 0 &&
    !filters.review_statuses.includes(row.review.review_status)
  ) {
    return false;
  }

  if (!filters.include_provider_errors && row.status === "provider_error") {
    return false;
  }

  if (!filters.include_validation_failures && row.status === "validation_failed") {
    return false;
  }

  return true;
}

function countRows(rows: EngineModelCallRow[]): EngineReviewBatch["counts"] {
  return {
    total: rows.length,
    diagnosis: rows.filter((row) => row.call_kind === "diagnosis").length,
    probe_contract: rows.filter((row) => row.call_kind === "probe_contract").length,
    attempt_evaluation: rows.filter((row) => row.call_kind === "attempt_evaluation").length,
    needs_review: rows.filter((row) => row.review.review_status === "needs_review").length,
    approved: rows.filter((row) => row.review.review_status === "approved").length,
    rejected: rows.filter((row) => row.review.review_status === "rejected").length,
    unreviewed: rows.filter((row) => row.review.review_status === "unreviewed").length,
  };
}

export function buildReviewBatch(input: {
  rows: EngineModelCallRow[];
  filters?: EngineReviewBatchFilters;
  now?: string | null;
}): EngineReviewBatch {
  const filters: EngineReviewBatchFilters = {
    include_provider_errors: true,
    include_validation_failures: true,
    limit: null,
    ...(input.filters ?? {}),
  };

  let rows = input.rows.filter((row) => shouldIncludeRow(row, filters));

  if (typeof filters.limit === "number" && Number.isFinite(filters.limit)) {
    rows = rows.slice(0, Math.max(0, Math.trunc(filters.limit)));
  }

  return {
    schema_version: "engine_review_batch_v1",
    batch_id: createBatchId(),
    created_at: getNowIso(input.now),
    filters,
    counts: countRows(rows),
    rows,
  };
}

export function buildNeedsReviewBatch(
  rows: EngineModelCallRow[],
  limit = 100,
): EngineReviewBatch {
  return buildReviewBatch({
    rows,
    filters: {
      review_statuses: ["needs_review", "unreviewed"],
      include_provider_errors: true,
      include_validation_failures: true,
      limit,
    },
  });
}

