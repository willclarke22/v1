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
import { compileVisualAssetIntentGroundingRequests } from "./asset-intent-adapter";
import {
  runLexicalAssetSearchBench,
} from "../../assets/search/asset-search-bench.server";

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
  const assetIntentGrounding =
    stage >= 2 ? compileVisualAssetIntentGroundingRequests(parsed.value) : [];
  const searchRequirements = assetIntentGrounding.map((item) => item.lexical_requirement);
  const searchQueryPacketsV2Shadow = assetIntentGrounding.map((item) => item.query_packet);
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
      asset_intent_grounding: assetIntentGrounding,
      semantic_anatomy_resolution: anatomyResolution,
      semantic_asset_search: semanticAssetSearch,
      search_query_packets_v2_shadow: searchQueryPacketsV2Shadow,
      authority_note:
        stage >= 2
          ? "GLM supplied simple asset intents only. MyWay normalized those intents, kept appearance separate from identity search, compiled Query Packet V2 grounding requests, and ran the existing deterministic/lexical calibration paths. No asset id was model-authored and search ranking does not itself grant execution authority."
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
