import { NextResponse } from "next/server";
import { runAttemptEvaluation } from "@/lib/engine/orchestration/run-attempt-evaluation";
import { runDiagnosis } from "@/lib/engine/orchestration/run-diagnosis";
import { runProbeContract } from "@/lib/engine/orchestration/run-probe-contract";
import { buildEngineProviderSet } from "@/lib/engine/providers";
import { adaptProbeContractForRenderer } from "@/lib/engine/renderers";
import type {
  DiagnosisModelInput,
  ProbeAttemptEvaluatorInput,
  ProbeContractModelInput,
} from "@/lib/engine/schemas";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Local-dev smoke test for the real 3-model service clients.
 *
 * This route intentionally does not replace /api/message or /api/probe/submit.
 * The app can keep using the known-good mock UI path while this endpoint checks:
 *
 *   Diagnosis service client
 *   -> Probe Contract service client
 *   -> renderer adapter
 *   -> Probe Attempt Evaluator service client
 *
 * The service clients return safe fallback outputs when endpoints are not
 * configured or unavailable, so this route should be safe to call even before
 * all three Python services are running.
 */
export async function POST(request: Request) {
  try {
    const body = asRecord(await request.json().catch(() => ({})));

    const message = getString(
      body.messageText ?? body.message,
      "I keep mixing up when Spanish se is reflexive or passive.",
    );

    const selectedOptionId = getString(
      body.selectedOptionId,
      "passive_like_no_named_seller",
    );

    const selfReportedConfidence = getNumber(body.selfReportedConfidence, 0.75);

    const providers = buildEngineProviderSet();
    const probeContractProvider = providers.probe_contract;

    if (!probeContractProvider) {
      return NextResponse.json(
        {
          ok: false,
          source: "local_dev_engine_provider_smoke",
          error:
            "No probe contract provider is configured in the active engine provider set.",
        },
        { status: 500 },
      );
    }

    const diagnosisInput: DiagnosisModelInput = {
      schema_version: "diagnosis_model_input_v1",
      input_kind: "user_message",
      user_message: {
        text: message,
      },
    };

    const diagnosisRun = await runDiagnosis({
      provider: providers.diagnosis,
      model_input: diagnosisInput,
    });

    const probeContractInput: ProbeContractModelInput = {
      schema_version: "probe_contract_model_input_v1",
      target_topic: {
        topic_id: "topic_spanish_se",
        topic_label: "Spanish se",
      },
      target_diagnosis: diagnosisRun.output.diagnosis,
      learner_signal: {
        signal_kind: "user_message",
        user_message: message,
      },
      personalization_context: {
        bridge_level: "bridge_0",
        language_policy: {
          jargon_level: "none",
        },
      },
    } as ProbeContractModelInput;

    const probeContractRun = await runProbeContract({
      provider: probeContractProvider,
      model_input: probeContractInput,
    });

    const rendererAdapter = adaptProbeContractForRenderer(
      probeContractRun.output,
    );

    const attemptEvaluationInput: ProbeAttemptEvaluatorInput = {
      schema_version: "probe_attempt_evaluator_input_v1",
      probe: {
        probe_type: probeContractRun.output.probe_type,
        expected_attempt_type: probeContractRun.output.expected_attempt_type,
        prompt: probeContractRun.output.prompt,
        target_diagnosis: diagnosisRun.output.diagnosis,
      },
      answer_key: probeContractRun.output.answer_key ?? null,
      attempt: {
        attempt_type: probeContractRun.output.expected_attempt_type,
        selected_option_id: selectedOptionId,
        selected_option_ids: [],
        text_response: selectedOptionId,
        ordered_item_ids: [],
        placements: {},
        graph_features: [],
        self_reported_confidence: selfReportedConfidence,
      },
      misconception_markers: probeContractRun.output.misconception_markers ?? [],
      delivery_context: probeContractRun.output.delivery_context ?? null,
    } as ProbeAttemptEvaluatorInput;

    const attemptEvaluationRun = await runAttemptEvaluation({
      provider: providers.attempt_evaluator,
      model_input: attemptEvaluationInput,
    });

    const warnings = [
      ...(diagnosisRun.provider_result.meta.warnings ?? []),
      ...(probeContractRun.provider_result.meta.warnings ?? []),
      ...(attemptEvaluationRun.provider_result.meta.warnings ?? []),
      ...rendererAdapter.warnings,
      ...rendererAdapter.blocking_reasons,
    ];

    return NextResponse.json({
      ok:
        diagnosisRun.usable &&
        probeContractRun.usable &&
        attemptEvaluationRun.usable &&
        rendererAdapter.ok,
      source: "local_dev_engine_provider_smoke",
      provider_mode: "local_services",
      warnings,

      inputs: {
        message,
        selectedOptionId,
        selfReportedConfidence,
      },

      diagnosis: {
        usable: diagnosisRun.usable,
        validation: diagnosisRun.validation,
        provider_meta: diagnosisRun.provider_result.meta,
        output: diagnosisRun.output,
      },

      probe_contract: {
        usable: probeContractRun.usable,
        validation: probeContractRun.validation,
        provider_meta: probeContractRun.provider_result.meta,
        output: probeContractRun.output,
      },

      renderer_adapter: rendererAdapter,

      attempt_evaluation: {
        usable: attemptEvaluationRun.usable,
        validation: attemptEvaluationRun.validation,
        provider_meta: attemptEvaluationRun.provider_result.meta,
        output: attemptEvaluationRun.output,
      },
    });
  } catch (error) {
    console.error("POST /api/local-dev/engine-provider-smoke failed", error);

    return NextResponse.json(
      {
        ok: false,
        source: "local_dev_engine_provider_smoke",
        error:
          error instanceof Error
            ? error.message
            : "Failed to run engine provider smoke test.",
      },
      { status: 500 },
    );
  }
}
