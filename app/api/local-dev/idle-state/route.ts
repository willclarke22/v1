import { NextResponse } from "next/server";

type IdleState = {
  composer_has_text: boolean;
  message_in_flight: boolean;
  enrichment_in_flight: boolean;
  last_activity_at: string | null;
  last_message_started_at: string | null;
  last_message_finished_at: string | null;
  last_idle_state_update_at: string | null;
};

type IdleStateUpdateBody = Partial<{
  composer_has_text: unknown;
  message_in_flight: unknown;
  enrichment_in_flight: unknown;
  last_activity_at: unknown;
  last_message_started_at: unknown;
  last_message_finished_at: unknown;
}>;

const IDLE_ENOUGH_AFTER_MESSAGE_MS = 3_000;
const IDLE_STATE_STALE_AFTER_MS = 60_000;

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

function buildIdleDecision() {
  const idleStateAgeMs = msSince(state.last_idle_state_update_at);
  const lastActivityAgeMs = msSince(state.last_activity_at);
  const lastMessageFinishedAgeMs = msSince(state.last_message_finished_at);

  const idleStateIsFresh = idleStateAgeMs <= IDLE_STATE_STALE_AFTER_MS;

  const safe_to_start_enrichment =
    idleStateIsFresh &&
    !state.composer_has_text &&
    !state.message_in_flight &&
    !state.enrichment_in_flight &&
    lastMessageFinishedAgeMs >= IDLE_ENOUGH_AFTER_MESSAGE_MS;

  const should_abort_enrichment =
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
    safe_to_start_enrichment,
    should_abort_enrichment,
    reasons,
    idle_state_age_ms: Number.isFinite(idleStateAgeMs)
      ? Math.max(0, Math.round(idleStateAgeMs))
      : null,
    last_activity_age_ms: Number.isFinite(lastActivityAgeMs)
      ? Math.max(0, Math.round(lastActivityAgeMs))
      : null,
    last_message_finished_age_ms: Number.isFinite(lastMessageFinishedAgeMs)
      ? Math.max(0, Math.round(lastMessageFinishedAgeMs))
      : null,
    thresholds: {
      idle_enough_after_message_ms: IDLE_ENOUGH_AFTER_MESSAGE_MS,
      idle_state_stale_after_ms: IDLE_STATE_STALE_AFTER_MS,
    },
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "GET /api/local-dev/idle-state",
    state,
    decision: buildIdleDecision(),
  });
}

export async function POST(request: Request) {
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

  return NextResponse.json({
    ok: true,
    route: "POST /api/local-dev/idle-state",
    state,
    decision: buildIdleDecision(),
  });
}