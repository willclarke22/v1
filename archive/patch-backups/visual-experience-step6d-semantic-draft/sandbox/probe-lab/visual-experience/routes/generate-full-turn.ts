import { NextResponse } from "next/server";

import { parseJsonObjectFromText } from "../json-extract";
import { callVisualLearningTurnModel, getVisualLearningTurnProvider, getVisualLearningTurnProviderStatus } from "../model-provider.server";
import { normalizeVisualLearningTurnOutput } from "../normalize-visual-learning-turn-output";
import { resolveVisualLearningTurn } from "../resolve-visual-learning-turn";
import { validateVisualLearningTurnOutput } from "../validate-visual-learning-turn";
import type { VisualLearningTurnOutput, VisualLearningTurnValidationReport } from "../visual-learning-turn";
import {
  buildVisualLearningTurnInput,
  buildVisualLearningTurnModelRequest,
  buildVisualLearningTurnScaffoldOutput,
  type VisualLearningTurnRequestBody,
} from "../visual-learning-turn-request";

type GenerateFullTurnRequestBody = VisualLearningTurnRequestBody & {
  provider?: "scaffold" | "deepseek" | "openai" | string;
  use_fallback_on_invalid?: boolean;
};

type SafeResolveResult =
  | {
      ok: true;
      validation: VisualLearningTurnValidationReport;
      resolved: ReturnType<typeof resolveVisualLearningTurn>;
      error: null;
    }
  | {
      ok: false;
      validation: VisualLearningTurnValidationReport | null;
      resolved: null;
      error: string;
    };

function safeValidateAndResolve(
  output: VisualLearningTurnOutput,
  input: ReturnType<typeof buildVisualLearningTurnInput>,
): SafeResolveResult {
  let validation: VisualLearningTurnValidationReport | null = null;

  try {
    validation = validateVisualLearningTurnOutput(output, input);

    if (!validation.valid) {
      return {
        ok: false,
        validation,
        resolved: null,
        error: validation.fatal_errors.length
          ? `Validation failed: ${validation.fatal_errors.join(" | ")}`
          : "Validation failed without fatal error details.",
      };
    }

    const resolved = resolveVisualLearningTurn(output, input);

    return {
      ok: true,
      validation,
      resolved,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      validation,
      resolved: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function shouldUseFallbackOnInvalid(body: GenerateFullTurnRequestBody) {
  return body.use_fallback_on_invalid !== false;
}

function likelyFallbackCause(args: {
  providerCallError: string | null;
  parseOk: boolean;
  parseError: string | null;
  validation: VisualLearningTurnValidationReport | null;
  resolveError: string | null;
  normalizationApplied: boolean | null;
}) {
  if (args.providerCallError) {
    if (args.providerCallError.includes("504")) {
      return "The provider returned a 504 gateway timeout before MyWay received a model response. This is usually a provider-side timeout, often made worse by a large prompt or large max_tokens.";
    }
    if (args.providerCallError.toLowerCase().includes("timed out")) {
      return "The provider call timed out before MyWay received a model response. Try again, use scaffold, or reduce prompt/output size.";
    }
    return `The provider call failed before parsing/validation: ${args.providerCallError}`;
  }

  if (!args.parseOk) return `The provider returned text that could not be parsed as JSON: ${args.parseError ?? "unknown parse error"}`;

  if (args.resolveError?.includes("root_problem")) {
    return "The model likely flattened root_problem instead of returning learning_focus.root_problem.";
  }

  if (args.resolveError) return `The parsed/normalized output failed during validation or resolution: ${args.resolveError}`;

  if (args.validation && !args.validation.valid) {
    return args.validation.fatal_errors.length
      ? `The parsed/normalized output failed schema validation: ${args.validation.fatal_errors.join(" | ")}`
      : "The parsed/normalized output was invalid, but no fatal errors were reported.";
  }

  if (args.normalizationApplied) {
    return "The provider returned a near-miss shape. MyWay normalized it before validation.";
  }

  return null;
}

export async function GET() {
  const input = buildVisualLearningTurnInput({ example: "krebs" });
  const modelRequest = buildVisualLearningTurnModelRequest(input);

  return NextResponse.json({
    ok: true,
    route: "generate-full-turn",
    provider_status: getVisualLearningTurnProviderStatus(),
    default_input: input,
    model_request: modelRequest,
    usage: {
      method: "POST",
      body: {
        provider: "scaffold | deepseek | openai",
        learner_message: "I can’t picture the Krebs cycle.",
        topic_label: "Krebs cycle",
        bridge_level: "bridge_0",
        jargon_level: "none",
        preferred_style: "visual_description",
        force_clarification: false,
      },
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as GenerateFullTurnRequestBody;
    const input = buildVisualLearningTurnInput(body);
    const modelRequest = buildVisualLearningTurnModelRequest(input);
    const scaffoldOutput = buildVisualLearningTurnScaffoldOutput(input, body);
    const scaffoldRawText = JSON.stringify(scaffoldOutput, null, 2);
    const provider = getVisualLearningTurnProvider(body.provider);

    let providerResult: Awaited<ReturnType<typeof callVisualLearningTurnModel>>;
    let providerCallError: string | null = null;
    let providerCallDurationMs: number | null = null;
    const providerCallStartedAt = Date.now();

    try {
      providerResult = await callVisualLearningTurnModel({
        provider,
        model_request: modelRequest,
        scaffold_raw_text: scaffoldRawText,
      });
      providerCallDurationMs = Date.now() - providerCallStartedAt;
    } catch (error) {
      providerCallDurationMs = Date.now() - providerCallStartedAt;
      providerCallError = error instanceof Error ? error.message : String(error);
      providerResult = await callVisualLearningTurnModel({
        provider: "scaffold",
        model_request: modelRequest,
        scaffold_raw_text: scaffoldRawText,
      });
    }

    const parseResult = parseJsonObjectFromText<VisualLearningTurnOutput>(providerResult.raw_text);

    let parsedOutput: VisualLearningTurnOutput | null = null;
    let normalizedOutput: VisualLearningTurnOutput | null = null;
    let normalization: ReturnType<typeof normalizeVisualLearningTurnOutput>["report"] | null = null;
    let modelValidation: VisualLearningTurnValidationReport | null = null;
    let modelResolveError: string | null = null;
    let finalOutput = scaffoldOutput;
    let finalResolved = resolveVisualLearningTurn(scaffoldOutput, input);
    let fallbackUsed = providerResult.provider_used === "scaffold" && provider !== "scaffold";
    let fallbackReason = providerCallError;

    if (parseResult.ok) {
      parsedOutput = parseResult.value;
      const normalized = normalizeVisualLearningTurnOutput(parsedOutput, input);
      normalizedOutput = normalized.output;
      normalization = normalized.report;

      const attempted = safeValidateAndResolve(normalizedOutput, input);
      modelValidation = attempted.validation;
      modelResolveError = attempted.error;

      if (attempted.ok) {
        finalOutput = normalizedOutput;
        finalResolved = attempted.resolved;
        fallbackUsed = providerResult.provider_used === "scaffold" && provider !== "scaffold";
        fallbackReason = providerCallError;
      } else if (shouldUseFallbackOnInvalid(body)) {
        fallbackUsed = true;
        fallbackReason = attempted.error ?? "Model output parsed but failed validation/resolution.";
        finalOutput = scaffoldOutput;
        finalResolved = resolveVisualLearningTurn(scaffoldOutput, input);
      } else {
        finalOutput = normalizedOutput;
        finalResolved = resolveVisualLearningTurn(scaffoldOutput, input);
      }
    } else {
      fallbackUsed = true;
      fallbackReason = parseResult.error;
      finalOutput = scaffoldOutput;
      finalResolved = resolveVisualLearningTurn(scaffoldOutput, input);
    }

    const diagnostics = {
      parse_ok: parseResult.ok,
      parse_error: parseResult.ok ? null : parseResult.error,
      provider_call_error: providerCallError,
      normalization_applied: normalization?.applied ?? null,
      normalization_source_shape: normalization?.source_shape ?? null,
      normalization_notes: normalization?.notes ?? [],
      normalization_warnings: normalization?.warnings ?? [],
      model_validation_valid: modelValidation?.valid ?? null,
      model_validation_fatal_errors: modelValidation?.fatal_errors ?? [],
      model_validation_warnings: modelValidation?.warnings ?? [],
      model_resolve_error: modelResolveError,
      provider_call_duration_ms: providerCallDurationMs,
      provider_result_duration_ms: providerResult.duration_ms,
      prompt_total_chars: modelRequest.prompt_stats.total_chars,
      prompt_system_chars: modelRequest.prompt_stats.system_chars,
      prompt_user_chars: modelRequest.prompt_stats.user_chars,
      fallback_phase: fallbackUsed
        ? providerCallError
          ? "provider_call"
          : !parseResult.ok
            ? "parse"
            : "validation_or_resolution"
        : null,
      likely_cause: fallbackUsed
        ? likelyFallbackCause({
            providerCallError,
            parseOk: parseResult.ok,
            parseError: parseResult.ok ? null : parseResult.error,
            validation: modelValidation,
            resolveError: modelResolveError,
            normalizationApplied: normalization?.applied ?? null,
          })
        : normalization?.applied
          ? "The provider returned a near-miss shape. MyWay normalized it and used the normalized model output."
          : null,
    };

    return NextResponse.json({
      ok: true,
      route: "generate-full-turn",
      request_body: body,
      provider_requested: provider,
      provider_used: providerResult.provider_used,
      provider_model: providerResult.model,
      provider_call_error: providerCallError,
      fallback_used: fallbackUsed,
      fallback_reason: fallbackReason,
      diagnostics,
      input,
      model_request: modelRequest,
      provider_request_payload_preview: providerResult.request_payload_preview,
      raw_text: providerResult.raw_text,
      raw_json_text: parseResult.ok ? parseResult.json_text : parseResult.json_text ?? null,
      parse_ok: parseResult.ok,
      parse_error: parseResult.ok ? null : parseResult.error,
      parsed_output: parsedOutput,
      normalization,
      normalized_output: normalizedOutput,
      model_validation: modelValidation,
      model_resolve_error: modelResolveError,
      output: finalOutput,
      resolved: finalResolved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        route: "generate-full-turn",
        error: message,
      },
      { status: 500 },
    );
  }
}
