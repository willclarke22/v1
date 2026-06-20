import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdleState = {
  composer_has_text: boolean;
  message_in_flight: boolean;
  enrichment_in_flight: boolean;
  last_activity_at: string | null;
  last_message_started_at: string | null;
  last_message_finished_at: string | null;
  last_idle_state_update_at: string | null;
};

type IdleStateDecision = {
  safe_to_start_enrichment: boolean;
  should_abort_enrichment: boolean;
  reasons: string[];
  idle_state_age_ms: number | null;
  last_activity_age_ms: number | null;
  last_message_finished_age_ms: number | null;
  thresholds: {
    idle_enough_after_message_ms: number;
    idle_state_stale_after_ms: number;
  };
};

type IdleStateUpdateBody = Partial<{
  composer_has_text: unknown;
  message_in_flight: unknown;
  enrichment_in_flight: unknown;
  last_activity_at: unknown;
  last_message_started_at: unknown;
  last_message_finished_at: unknown;
}>;

const ROUTE_NAME = "/api/local-dev/idle-state";
const IDLE_ENOUGH_AFTER_MESSAGE_MS = 12_000;
const IDLE_STATE_STALE_AFTER_MS = 60_000;

/**
 * This route is intentionally local-dev only.
 *
 * It is used by scripts/local-dev/semantic-enrichment-worker.ps1 to avoid
 * starting background model/enrichment work while the user is typing or while a
 * foreground message request is still running.
 *
 * The state is in-memory by design. That is fine for a single local Next dev
 * process, but it is not production-safe and should not be used as durable
 * application state.
 */
const state: IdleState = {
  composer_has_text: false,
  message_in_flight: false,
  enrichment_in_flight: false,
  last_activity_at: null,
  last_message_started_at: null,
  last_message_finished_at: null,
  last_idle_state_update_at: null,
};

function nowIso() {
  return new Date().toISOString();
}

function isLocalDevRouteEnabled() {
  if (process.env.NODE_ENV !== "production") return true;

  const raw = process.env.MYWAY_ENABLE_LOCAL_DEV_ROUTES?.trim().toLowerCase();

  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function disabledResponse() {
  return NextResponse.json(
    {
      ok: false,
      route: ROUTE_NAME,
      error: "local_dev_route_disabled",
      message:
        "This in-memory local-dev route is disabled in production unless MYWAY_ENABLE_LOCAL_DEV_ROUTES is explicitly enabled.",
    },
    { status: 404 },
  );
}

function parseBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parseIsoString(value: unknown, fallback: string | null) {
  if (typeof value !== "string") return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;

  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return fallback;

  return trimmed;
}

function msSince(iso: string | null) {
  if (!iso) return Number.POSITIVE_INFINITY;

  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;

  return Date.now() - timestamp;
}

function finiteAgeOrNull(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function buildIdleDecision(): IdleStateDecision {
  const idleStateAgeMs = msSince(state.last_idle_state_update_at);
  const lastActivityAgeMs = msSince(state.last_activity_at);
  const lastMessageFinishedAgeMs = msSince(state.last_message_finished_at);

  const idleStateIsFresh = idleStateAgeMs <= IDLE_STATE_STALE_AFTER_MS;

  const safeToStartEnrichment =
    idleStateIsFresh &&
    !state.composer_has_text &&
    !state.message_in_flight &&
    !state.enrichment_in_flight &&
    lastMessageFinishedAgeMs >= IDLE_ENOUGH_AFTER_MESSAGE_MS;

  const shouldAbortEnrichment =
    state.composer_has_text || state.message_in_flight || !idleStateIsFresh;

  const reasons: string[] = [];

  if (!idleStateIsFresh) {
    reasons.push("idle_state_stale");
  }

  if (state.composer_has_text) {
    reasons.push("composer_has_text");
  }

  if (state.message_in_flight) {
    reasons.push("message_in_flight");
  }

  if (state.enrichment_in_flight) {
    reasons.push("enrichment_already_in_flight");
  }

  if (lastMessageFinishedAgeMs < IDLE_ENOUGH_AFTER_MESSAGE_MS) {
    reasons.push("recent_message_finished_too_recently");
  }

  return {
    safe_to_start_enrichment: safeToStartEnrichment,
    should_abort_enrichment: shouldAbortEnrichment,
    reasons,
    idle_state_age_ms: finiteAgeOrNull(idleStateAgeMs),
    last_activity_age_ms: finiteAgeOrNull(lastActivityAgeMs),
    last_message_finished_age_ms: finiteAgeOrNull(lastMessageFinishedAgeMs),
    thresholds: {
      idle_enough_after_message_ms: IDLE_ENOUGH_AFTER_MESSAGE_MS,
      idle_state_stale_after_ms: IDLE_STATE_STALE_AFTER_MS,
    },
  };
}

function buildResponse(method: "GET" | "POST") {
  return NextResponse.json({
    ok: true,
    route: `${method} ${ROUTE_NAME}`,
    local_dev_only: true,
    storage: "in_memory_single_process",
    state,
    decision: buildIdleDecision(),
  });
}

export async function GET() {
  if (!isLocalDevRouteEnabled()) {
    return disabledResponse();
  }

  return buildResponse("GET");
}

export async function POST(request: Request) {
  if (!isLocalDevRouteEnabled()) {
    return disabledResponse();
  }

  let body: IdleStateUpdateBody = {};

  try {
    body = (await request.json()) as IdleStateUpdateBody;
  } catch {
    body = {};
  }

  state.composer_has_text = parseBoolean(
    body.composer_has_text,
    state.composer_has_text,
  );

  state.message_in_flight = parseBoolean(
    body.message_in_flight,
    state.message_in_flight,
  );

  state.enrichment_in_flight = parseBoolean(
    body.enrichment_in_flight,
    state.enrichment_in_flight,
  );

  state.last_activity_at = parseIsoString(
    body.last_activity_at,
    state.last_activity_at,
  );

  state.last_message_started_at = parseIsoString(
    body.last_message_started_at,
    state.last_message_started_at,
  );

  state.last_message_finished_at = parseIsoString(
    body.last_message_finished_at,
    state.last_message_finished_at,
  );

  state.last_idle_state_update_at = nowIso();

  return buildResponse("POST");
}

