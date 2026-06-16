import { buildMockThreeModelTurn } from "@/lib/engine/providers/mock-model-artifacts";
import { buildMockThreeModelMessageRouteResponse } from "@/lib/api-routes/message/mock-3model-response";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function extractSubmittedAttempt(body: unknown) {
  const record = asRecord(body);
  const structuredAttempt =
    record.structuredAttempt ?? record.attempt ?? record.response ?? null;

  return {
    probe_id: getString(record.probeId, "mock-probe-spanish-se-single-choice"),
    topic_id: getString(record.topicId, "topic_spanish_se"),
    raw_response:
      typeof record.response === "string"
        ? record.response
        : structuredAttempt === null
          ? ""
          : JSON.stringify(structuredAttempt),
    structured_attempt: structuredAttempt,
    engine_renderable_probe:
      record.engineRenderableProbe ??
      asRecord(record.probeContractSnapshot).engine_renderable_probe ??
      asRecord(record.answeredProbeContractSnapshot).engine_renderable_probe ??
      null,
  };
}

/**
 * Temporary 3-model probe-submit response.
 *
 * This replaces the old active submit path:
 *
 *   legacy evidence normalization
 *   â†’ legacy evidence interpretation
 *   â†’ legacy contract judgment
 *   â†’ legacy response bundling
 *   â†’ legacy follow-up planning
 *
 * with the clean future shape:
 *
 *   submitted attempt
 *   â†’ Probe Attempt Evaluator output
 *   â†’ engine route next action
 *   â†’ next Probe Contract / EngineRenderableProbe
 *
 * The current evaluator/probe-contract outputs are still mock artifacts under
 * models/, but the route response now follows the new loop instead of the old
 * heuristic planning modules.
 */
export async function buildMockThreeModelProbeSubmitResponse(body: unknown) {
  const submittedAttempt = extractSubmittedAttempt(body);
  const turn = buildMockThreeModelTurn();

  const base = await buildMockThreeModelMessageRouteResponse({
    message: submittedAttempt.raw_response || "mock probe submit",
  });

  const deliveredProbe = base.result?.delivered_response?.delivered_probe ?? null;

  const response = {
    ...base,

    continue_probe_loop: true,
    next_probe: deliveredProbe,
    nextProbe: deliveredProbe,

    reply:
      "Mock Probe Attempt Evaluator is active. The submitted answer exposed the fixed-meaning se misconception, so MyWay is returning another model-created probe.",
    suggestedAction: "Target the exposed misconception",

    judgedAttempt: {
      schema_version: "mock_judged_attempt_v0",
      source: "mock_3model_probe_submit_route",
      submitted_attempt: submittedAttempt,
      attempt_evaluation_output: turn.attempt_evaluation_output,
      attempt_route: turn.attempt_route,
    },

    mock_3model_submit_debug: {
      enabled: true,
      scenario_id: turn.scenario_id,
      submitted_attempt: submittedAttempt,
      attempt_evaluation_output: turn.attempt_evaluation_output,
      attempt_route: turn.attempt_route,
      evaluated_probe_attempt_signal: turn.evaluated_probe_attempt_signal,
      next_probe_source: "mock_probe_contract_model_output",
    },
  };

  if (response.result?.delivered_response) {
    response.result.delivered_response.learner_message = {
      text: "Mock evaluator result: the response points to a specific misconception, so Iâ€™m giving another focused probe.",
      tone: "encouraging",
      mode: "probe",
    } as typeof response.result.delivered_response.learner_message;

    response.result.engine_fuel = {
      ...(response.result.engine_fuel as unknown as Record<string, unknown>),
      mock_probe_submit: {
        submitted_attempt: submittedAttempt,
        attempt_evaluation_output: turn.attempt_evaluation_output,
        attempt_route: turn.attempt_route,
      },
    } as unknown as typeof response.result.engine_fuel;
  }

  return response;
}


