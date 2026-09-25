import { parseJsonObjectFromText } from "../json-extract";
import { callVisualOrchestrationCalibrationModel } from "../model-provider.server";
import { resolveSandboxBodyParts3dSemanticConcepts } from "../resolve-visual-learning-turn-assets.server";
import {
  VISUAL_ORCHESTRATION_STAGE_DEFINITIONS,
  normalizeVisualOrchestrationAssetMode,
  normalizeVisualOrchestrationModel,
  normalizeVisualOrchestrationReasoningEffort,
  normalizeVisualOrchestrationStage,
  validateVisualOrchestrationOutput,
  visualConceptSemanticNames,
  type VisualOrchestrationRequest,
} from "./contracts";
import { buildVisualOrchestrationMessages } from "./prompts";
import {
  runLexicalAssetSearchBench,
} from "../../assets/search/asset-search-bench.server";
import type { AssetSearchRequirementV1 } from "../../assets/search/asset-lexical-search";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function visualSearchRequirements(value: unknown): AssetSearchRequirementV1[] {
  const output = asRecord(value);
  if (!output || !Array.isArray(output.required_visual_concepts)) return [];

  const requirements: AssetSearchRequirementV1[] = [];
  for (const item of output.required_visual_concepts) {
    const record = asRecord(item);
    if (!record || typeof record.semantic_name !== "string") continue;

    const semanticName = record.semantic_name.trim();
    if (!semanticName) continue;
    const visualRole = typeof record.role === "string" ? record.role.trim() : "";
    const semanticTags = Array.isArray(record.semantic_tags)
      ? record.semantic_tags
          .filter(
            (tag): tag is string => typeof tag === "string" && tag.trim().length > 0,
          )
          .map((tag) => tag.trim())
          .slice(0, 12)
      : [];

    requirements.push({
      semantic_name: semanticName,
      ...(visualRole ? { visual_role: visualRole } : {}),
      ...(semanticTags.length ? { semantic_tags: semanticTags } : {}),
    });
  }
  return requirements;
}

export async function runVisualOrchestrationStage(raw: Partial<VisualOrchestrationRequest>) {
  const startedAt = Date.now();
  const learnerMessage =
    typeof raw.learner_message === "string" && raw.learner_message.trim()
      ? raw.learner_message.trim()
      : "Why does rotating your hip inward change where your knee points?";
  const stage = normalizeVisualOrchestrationStage(raw.stage);
  const input: VisualOrchestrationRequest = {
    stage,
    learner_message: learnerMessage,
    model: normalizeVisualOrchestrationModel(raw.model),
    reasoning_effort: normalizeVisualOrchestrationReasoningEffort(raw.reasoning_effort),
    asset_collection_mode: normalizeVisualOrchestrationAssetMode(raw.asset_collection_mode),
  };
  const definition = VISUAL_ORCHESTRATION_STAGE_DEFINITIONS[stage];
  const messages = buildVisualOrchestrationMessages(input);
  const promptChars = messages.reduce((sum, message) => sum + message.content.length, 0);

  const provider = await callVisualOrchestrationCalibrationModel({
    messages,
    model: input.model,
    reasoning_effort: input.reasoning_effort,
    max_tokens: definition.max_tokens,
    timeout_ms: 90_000,
    temperature: 0.1,
    top_p: 1,
  });

  const exactRequest = {
    provider: "glm",
    model: input.model,
    reasoning_effort: input.reasoning_effort,
    stream: false,
    retry_transient_errors: false,
    fallback_provider: "none",
    max_tokens: definition.max_tokens,
    timeout_ms: 90_000,
    temperature: 0.1,
    top_p: 1,
    messages,
  };

  if (!provider.ok) {
    return {
      ok: false as const,
      route: "visual-experience/orchestration-stage",
      stage,
      stage_definition: definition,
      input,
      exact_model_request: exactRequest,
      provider_result: provider,
      metrics: {
        prompt_chars: promptChars,
        total_route_duration_ms: Date.now() - startedAt,
      },
    };
  }

  const parsed = parseJsonObjectFromText<Record<string, unknown>>(provider.raw_text);
  if (!parsed.ok) {
    return {
      ok: false as const,
      route: "visual-experience/orchestration-stage",
      stage,
      stage_definition: definition,
      input,
      exact_model_request: exactRequest,
      actual_provider_request: provider.request_body,
      provider_result: provider,
      parse_error: parsed.error,
      metrics: {
        prompt_chars: promptChars,
        provider_duration_ms: provider.duration_ms,
        total_route_duration_ms: Date.now() - startedAt,
      },
    };
  }

  const validation = validateVisualOrchestrationOutput(stage, parsed.value);
  const semanticNames = stage >= 2 ? visualConceptSemanticNames(parsed.value) : [];
  const anatomyResolution =
    semanticNames.length > 0
      ? await resolveSandboxBodyParts3dSemanticConcepts(
          semanticNames,
          input.asset_collection_mode,
        )
      : [];
  const searchRequirements = stage >= 2 ? visualSearchRequirements(parsed.value) : [];
  const semanticAssetSearch =
    searchRequirements.length > 0
      ? await runLexicalAssetSearchBench({
          requirements: searchRequirements,
          asset_collection_mode: input.asset_collection_mode,
          limit: 8,
        })
      : null;
  const successfulAttempt = provider.diagnostics.attempts.find((attempt) => attempt.status === "success") ?? null;

  return {
    ok: validation.valid,
    route: "visual-experience/orchestration-stage",
    stage,
    stage_definition: definition,
    input,
    exact_model_request: exactRequest,
    actual_provider_request: provider.request_body,
    glm_output: parsed.value,
    validation,
    myway_deterministic_result: {
      semantic_anatomy_resolution: anatomyResolution,
      semantic_asset_search: semanticAssetSearch,
      authority_note:
        stage >= 2
          ? "GLM supplied semantic visual requirements only. The legacy exact/phrase resolver remains visible for calibration, while MyWay Lexical Search Bench V1 retrieves a ranked real-asset candidate set without provider or embedding calls. No asset id was model-authored and search ranking does not itself grant execution authority."
          : "Stage 1 intentionally stops before asset retrieval.",
    },
    metrics: {
      prompt_chars: promptChars,
      response_chars: provider.raw_text.length,
      provider_duration_ms: provider.duration_ms,
      total_route_duration_ms: Date.now() - startedAt,
      first_answer_token_ms: successfulAttempt?.first_token_ms ?? null,
      attempt_count: provider.diagnostics.attempt_count,
      request_chars: successfulAttempt?.request_chars ?? null,
      lexical_search_duration_ms: semanticAssetSearch?.metrics.total_search_duration_ms ?? null,
      lexical_search_index_build_ms: semanticAssetSearch?.index.build_duration_ms ?? null,
      finish_state: validation.valid ? "valid_stage_output" : "schema_invalid",
    },
    provider_diagnostics: provider.diagnostics,
  };
}
