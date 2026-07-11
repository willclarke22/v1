import { NextRequest, NextResponse } from "next/server";

import { parseJsonObjectFromText } from "@/sandbox/probe-lab/visual-experience/json-extract";
import { callVisualLearningTurnModel } from "@/sandbox/probe-lab/visual-experience/model-provider.server";
import { makePrimitiveBuildModelRequest, normalizePrimitiveBuilderFallback, normalizePrimitiveBuilderProvider } from "../primitive-build-request";
import { makePrimitiveBuildScaffoldText, normalizePrimitiveBuildPlan } from "../primitive-build-plan";

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function preview(value: string, max = 4000) {
  return value.length > max ? `${value.slice(0, max)}\n…[truncated ${value.length - max} chars]` : value;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const userRequest = text(body.prompt, "build something interesting");
  const provider = normalizePrimitiveBuilderProvider(body.provider);
  const fallbackProvider = normalizePrimitiveBuilderFallback(body.fallback_provider, provider);
  const modelRequest = makePrimitiveBuildModelRequest({ user_request: userRequest, style: body.style });

  const providerResult = await callVisualLearningTurnModel({
    provider,
    model_request: modelRequest as any,
    scaffold_raw_text: makePrimitiveBuildScaffoldText(userRequest),
    generation_preset: "cinematic",
    enable_streaming: true,
    retry_transient_errors: true,
    fallback_provider: fallbackProvider,
  });

  const parsed = parseJsonObjectFromText(providerResult.raw_text);
  const normalized = normalizePrimitiveBuildPlan(parsed.ok ? parsed.value : null, userRequest);
  const warnings = [...normalized.warnings];

  if (!parsed.ok) {
    warnings.unshift(`Model response parse failed: ${parsed.error}`);
  }

  return NextResponse.json({
    ok: true,
    route: "primitive-builder-generate",
    provider_requested: provider,
    fallback_provider: fallbackProvider,
    provider_used: providerResult.provider_used,
    provider_model: providerResult.model,
    provider_fallback_used: providerResult.provider_fallback_used ?? false,
    provider_call_error: providerResult.provider_call_error ?? null,
    duration_ms: Date.now() - startedAt,
    model_call_diagnostics: providerResult.diagnostics ?? null,
    provider_request_payload_preview: providerResult.request_payload_preview ?? null,
    prompt_stats: modelRequest.prompt_stats,
    parse_ok: parsed.ok,
    parse_error: parsed.ok ? null : parsed.error,
    warnings,
    plan: normalized.plan,
    raw_text_preview: preview(providerResult.raw_text),
  });
}
