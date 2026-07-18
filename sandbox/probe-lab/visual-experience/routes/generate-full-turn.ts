import { NextResponse } from "next/server";

import { assembleVisualLearningTurnFromSemanticDraft } from "../assemble-visual-learning-turn";
import {
  buildSandboxDiagnosticRelationshipPreview,
  cleanDiagnosticPatternId,
  makeSandboxTopicDiagnosticState,
  normalizeDiagnosticSignal,
} from "../diagnostic-relationships";
import { parseJsonObjectFromText } from "../json-extract";
import { callVisualLearningTurnModel, getVisualLearningTurnProvider, getVisualLearningTurnProviderStatus } from "../model-provider.server";
import { normalizeVisualLearningTurnOutput } from "../normalize-visual-learning-turn-output";
import { resolveVisualLearningTurn } from "../resolve-visual-learning-turn";
import { attachApprovedAssetsToVisualTurn } from "../resolve-visual-learning-turn-assets.server";
import { validateVisualLearningTurnOutput } from "../validate-visual-learning-turn";
import { isVisualLearningSemanticDraftLike } from "../visual-learning-semantic-draft";
import type { VisualLearningTurnOutput, VisualLearningTurnValidationReport } from "../visual-learning-turn";
import {
  buildVisualLearningTurnInput,
  buildVisualLearningTurnModelRequest,
  buildVisualLearningTurnScaffoldOutput,
  type VisualLearningTurnRequestBody,
} from "../visual-learning-turn-request";

type GenerateFullTurnRequestBody = VisualLearningTurnRequestBody & {
  provider?: "scaffold" | "deepseek" | "glm" | "openai" | string;
  generation_preset?: "reliable" | "cinematic" | string;
  enable_streaming?: boolean;
  retry_transient_errors?: boolean;
  fallback_provider?: "none" | "scaffold" | "deepseek" | "glm" | string;
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
  providerFailureKind?: string | null;
  providerFallbackUsed?: boolean | null;
  parseOk: boolean;
  parseError: string | null;
  validation: VisualLearningTurnValidationReport | null;
  resolveError: string | null;
  semanticDraftUsed: boolean | null;
  assemblyWarnings: string[];
  normalizationApplied: boolean | null;
}) {
  if (args.providerCallError) {
    if (args.providerFallbackUsed) {
      return `The primary provider failed, but MyWay recovered by using the configured fallback provider. Failure kind: ${args.providerFailureKind ?? "unknown"}. Details: ${args.providerCallError}`;
    }
    if (args.providerFailureKind === "provider_504" || args.providerCallError.includes("504")) {
      return "The provider returned a 504 gateway timeout before MyWay received a usable model response. Streaming, retry/backoff, lower reliable-mode token limits, and alternate-provider fallback are the right mitigations.";
    }
    if (args.providerFailureKind === "local_abort_timeout" || args.providerCallError.toLowerCase().includes("timed out")) {
      return "The model call timed out from MyWay's side before a usable response finished. Use reliable mode, streaming, retry/backoff, a lower token budget, or an alternate provider.";
    }
    if (args.providerFailureKind === "provider_429") {
      return "The provider rate-limited or throttled the request. Retry/backoff and alternate-provider fallback should handle this better than immediately changing prompts.";
    }
    return `The provider call failed before parsing/validation. Failure kind: ${args.providerFailureKind ?? "unknown"}. Details: ${args.providerCallError}`;
  }

  if (!args.parseOk) return `The provider returned text that could not be parsed as JSON: ${args.parseError ?? "unknown parse error"}`;

  if (args.resolveError) return `The parsed output failed validation or resolution after MyWay assembly: ${args.resolveError}`;

  if (args.validation && !args.validation.valid) {
    return args.validation.fatal_errors.length
      ? `The parsed output failed validation after MyWay assembly: ${args.validation.fatal_errors.join(" | ")}`
      : "The parsed output was invalid after MyWay assembly, but no fatal errors were reported.";
  }

  if (args.semanticDraftUsed && args.assemblyWarnings.length) {
    return `The model returned a semantic draft. MyWay assembled it, but warnings were reported: ${args.assemblyWarnings.join(" | ")}`;
  }

  if (args.semanticDraftUsed) {
    return "The model returned a semantic draft and MyWay assembled the final strict output deterministically.";
  }

  if (args.normalizationApplied) {
    return "The provider returned a near-miss final shape. MyWay normalized it before validation.";
  }

  return null;
}

export async function GET() {
  const input = buildVisualLearningTurnInput({
    learner_message: "I don't understand how pistons work or why they're important in engines.",
    user_interests: ["mind", "psychology", "languages"],
  });
  const modelRequest = buildVisualLearningTurnModelRequest(input);

  return NextResponse.json({
    ok: true,
    route: "generate-full-turn",
    step: "13_prompt_drives_scene_diagnostic_relationships",
    provider_status: getVisualLearningTurnProviderStatus(),
    default_input: input,
    model_request: modelRequest,
    usage: {
      method: "POST",
      body: {
        provider: "scaffold | deepseek | glm | openai",
        generation_preset: "cinematic (reliable legacy value is accepted but ignored by Step 13)",
        enable_streaming: true,
        retry_transient_errors: true,
        fallback_provider: "glm | scaffold | none",
        learner_message: "I don't understand how pistons work or why they're important in engines.",
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
    let providerFailureKind: string | null = null;
    let providerFallbackUsed = false;

    try {
      providerResult = await callVisualLearningTurnModel({
        provider,
        model_request: modelRequest,
        scaffold_raw_text: scaffoldRawText,
        generation_preset: "cinematic",
        enable_streaming: body.enable_streaming ?? true,
        retry_transient_errors: body.retry_transient_errors ?? true,
        fallback_provider: body.fallback_provider ?? (provider === "deepseek" || provider === "nvidia" ? "glm" : "none"),
      });
      providerCallError = providerResult.provider_call_error ?? null;
      providerCallDurationMs = providerResult.diagnostics?.total_duration_ms ?? providerResult.duration_ms;
      providerFailureKind = providerResult.diagnostics?.final_failure_kind ?? null;
      providerFallbackUsed = Boolean(providerResult.provider_fallback_used);
    } catch (error) {
      providerCallError = error instanceof Error ? error.message : String(error);
      providerResult = await callVisualLearningTurnModel({
        provider: "scaffold",
        model_request: modelRequest,
        scaffold_raw_text: scaffoldRawText,
        generation_preset: "cinematic",
      });
      providerCallDurationMs = providerResult.duration_ms;
      providerFailureKind = "unknown_error";
      providerFallbackUsed = true;
    }

    const parseResult = parseJsonObjectFromText<unknown>(providerResult.raw_text);

    let parsedOutput: unknown = null;
    let semanticDraftUsed: boolean | null = null;
    let semanticDraftOutput: unknown = null;
    let assembledOutput: VisualLearningTurnOutput | null = null;
    let assembly: ReturnType<typeof assembleVisualLearningTurnFromSemanticDraft>["report"] | null = null;
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

      let candidateOutput: VisualLearningTurnOutput;

      if (isVisualLearningSemanticDraftLike(parsedOutput)) {
        semanticDraftUsed = true;
        semanticDraftOutput = parsedOutput;
        const assembled = assembleVisualLearningTurnFromSemanticDraft(parsedOutput, input);
        assembledOutput = assembled.output;
        assembly = assembled.report;
        candidateOutput = assembled.output;
      } else {
        semanticDraftUsed = false;
        const normalized = normalizeVisualLearningTurnOutput(parsedOutput as VisualLearningTurnOutput, input);
        normalizedOutput = normalized.output;
        normalization = normalized.report;
        candidateOutput = normalized.output;
      }

      const attempted = safeValidateAndResolve(candidateOutput, input);
      modelValidation = attempted.validation;
      modelResolveError = attempted.error;

      if (attempted.ok) {
        finalOutput = candidateOutput;
        finalResolved = attempted.resolved;
        fallbackUsed = providerResult.provider_used === "scaffold" && provider !== "scaffold";
        fallbackReason = providerCallError;
      } else if (shouldUseFallbackOnInvalid(body)) {
        fallbackUsed = true;
        fallbackReason = attempted.error ?? "Model output parsed but failed validation/resolution after MyWay assembly.";
        finalOutput = scaffoldOutput;
        finalResolved = resolveVisualLearningTurn(scaffoldOutput, input);
      } else {
        finalOutput = candidateOutput;
        finalResolved = resolveVisualLearningTurn(scaffoldOutput, input);
      }
    } else {
      fallbackUsed = true;
      fallbackReason = parseResult.error;
      finalOutput = scaffoldOutput;
      finalResolved = resolveVisualLearningTurn(scaffoldOutput, input);
    }

    finalResolved =
      await attachApprovedAssetsToVisualTurn(
        finalResolved,
        finalOutput,
      );

    const diagnostics = {
      semantic_draft_boundary: true,
      parse_ok: parseResult.ok,
      parse_error: parseResult.ok ? null : parseResult.error,
      provider_call_error: providerCallError,
      provider_failure_kind: providerFailureKind,
      provider_fallback_used: providerFallbackUsed,
      model_call_diagnostics: providerResult.diagnostics ?? null,
      semantic_draft_used: semanticDraftUsed,
      assembly_source_shape: assembly?.source_shape ?? null,
      assembly_notes: assembly?.notes ?? [],
      assembly_warnings: assembly?.warnings ?? [],
      model_intelligence_fields_used: assembly?.model_intelligence_fields_used ?? [],
      myway_deterministic_fields_added: assembly?.myway_deterministic_fields_added ?? [],
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
            : "assembly_validation_or_resolution"
        : null,
      likely_cause: fallbackUsed
        ? likelyFallbackCause({
            providerCallError,
            providerFailureKind,
            providerFallbackUsed,
            parseOk: parseResult.ok,
            parseError: parseResult.ok ? null : parseResult.error,
            validation: modelValidation,
            resolveError: modelResolveError,
            semanticDraftUsed,
            assemblyWarnings: assembly?.warnings ?? [],
            normalizationApplied: normalization?.applied ?? null,
          })
        : semanticDraftUsed
          ? "The model returned a compact semantic draft. MyWay assembled wrappers, delivery context, validation, and asset resolution deterministically."
          : normalization?.applied
            ? "The provider returned a near-miss final shape. MyWay normalized it and used the normalized model output."
            : null,
    };

    const sandboxRelationshipPreview =
      finalOutput.turn_status === "proceed"
        ? buildSandboxDiagnosticRelationshipPreview({
            topic: makeSandboxTopicDiagnosticState({
              topic_id:
                finalOutput.topic_resolution.topic_id ??
                cleanDiagnosticPatternId(finalOutput.topic_resolution.topic_label.toLowerCase(), "current_topic"),
              topic_label: finalOutput.topic_resolution.topic_label,
              diagnostic_signal: finalOutput.diagnostic_signal ?? normalizeDiagnosticSignal(null),
            }),
          })
        : null;

    return NextResponse.json({
      ok: true,
      route: "generate-full-turn",
      step: "13_prompt_drives_scene_diagnostic_relationships",
      request_body: body,
      provider_requested: provider,
      provider_used: providerResult.provider_used,
      provider_model: providerResult.model,
      provider_call_error: providerCallError,
      provider_failure_kind: providerFailureKind,
      provider_fallback_used: providerFallbackUsed,
      model_call_diagnostics: providerResult.diagnostics ?? null,
      fallback_used: fallbackUsed,
      fallback_reason: fallbackReason,
      diagnostics,
      sandbox_relationship_preview: sandboxRelationshipPreview,
      input,
      model_request: modelRequest,
      provider_request_payload_preview: providerResult.request_payload_preview,
      raw_text: providerResult.raw_text,
      raw_json_text: parseResult.ok ? parseResult.json_text : parseResult.json_text ?? null,
      parse_ok: parseResult.ok,
      parse_error: parseResult.ok ? null : parseResult.error,
      parsed_output: parsedOutput,
      semantic_draft_output: semanticDraftOutput,
      assembly,
      assembled_output: assembledOutput,
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
        step: "13_prompt_drives_scene_diagnostic_relationships",
        error: message,
      },
      { status: 500 },
    );
  }
}
