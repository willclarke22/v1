import { buildVisualExperienceDirectorAuthoringManifest } from "../director-authoring-manifest";
import { parseJsonObjectFromText } from "../json-extract";
import { callVisualOrchestrationCalibrationModel } from "../model-provider.server";
import {
  normalizeCreativeVisualThesisRequest,
  validateCreativeVisualThesisCandidates,
  type CreativeVisualThesisCandidate,
  type CreativeVisualThesisCandidatesOutput,
  type CreativeVisualThesisRequest,
  type CreativeVisualThesisRunResponse,
  type CreativeVisualThesisRunFailure,
  type CreativeVisualThesisSelectionOutput,
} from "./contracts";
import { buildCreativeThesisDivergenceMessages } from "./prompts";

function promptChars(messages: Array<{ content: string }>) {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function failure(
  phase: CreativeVisualThesisRunFailure["phase"],
  error: string,
  details?: unknown,
): CreativeVisualThesisRunResponse {
  return {
    ok: false,
    route: "visual-experience/creative-thesis",
    phase,
    error,
    details,
  };
}

export async function runCreativeVisualThesisBench(
  raw: Partial<CreativeVisualThesisRequest>,
): Promise<CreativeVisualThesisRunResponse> {
  const startedAt = Date.now();
  const input = normalizeCreativeVisualThesisRequest(raw);
  const brief = {
    learner_message: input.learner_message,
    root_problem: input.root_problem,
    current_strategy: input.current_strategy,
    failure_mode: input.failure_mode,
    target_learning_delta: input.target_learning_delta,
    teaching_signals: input.teaching_signals,
    prior_response_evidence: input.prior_response_evidence,
    profile_summary: input.profile_summary,
    interests: input.interests,
  };

  // Phase 1 intentionally receives NO asset inventory and NO Director capability palette.
  const divergenceMessages = buildCreativeThesisDivergenceMessages(brief);
  const divergence = await callVisualOrchestrationCalibrationModel({
    messages: divergenceMessages,
    model: input.model,
    reasoning_effort: input.reasoning_effort,
    max_tokens: 2_800,
    timeout_ms: 180_000,
    temperature: 0.8,
    top_p: 1,
  });
  if (!divergence.ok) {
    return failure("divergence_provider", divergence.error, divergence);
  }
  const divergenceParsed = parseJsonObjectFromText<CreativeVisualThesisCandidatesOutput>(
    divergence.raw_text,
  );
  if (!divergenceParsed.ok) {
    return failure("divergence_parse", divergenceParsed.error, {
      raw_text: divergence.raw_text,
    });
  }
  const divergenceValidation = validateCreativeVisualThesisCandidates(
    divergenceParsed.value,
  );
  if (!divergenceValidation.valid) {
    return failure(
      "divergence_validation",
      "Creative divergence output failed validation.",
      divergenceValidation.errors,
    );
  }

  const candidates = divergenceParsed.value.candidates as CreativeVisualThesisCandidate[];

  // Single-thesis fast path: do not spend a second model call critiquing a set
  // that intentionally contains only one option. Preserve the selection response
  // shape for UI/API compatibility and bind capabilities only after generation.
  const selected = candidates[0];
  if (!selected) {
    return failure(
      "selection_validation",
      "Single-thesis generation returned no usable candidate.",
    );
  }

  const selectionOutput: CreativeVisualThesisSelectionOutput = {
    schema_version: "myway_creative_visual_thesis_selection_v1",
    selected_candidate_id: selected.id,
    selection_reason:
      "Single-thesis fast path: this was the sole generated thesis, so no second critic model call was run.",
    critical_teaching_moment: selected.critical_realization,
    scorecards: [],
  };

  // Only AFTER the thesis is selected do we consult MyWay's known execution skills.
  // This is assistance, not an authoring constraint; freeform execution remains valid.
  const capabilityManifest = buildVisualExperienceDirectorAuthoringManifest({
    learner_message: [
      input.learner_message,
      `Root problem: ${input.root_problem}`,
      `Selected visual thesis: ${selected.visual_thesis}`,
      `Representation: ${selected.representation_strategy}`,
      `Execution jobs: ${selected.execution_jobs.join("; ")}`,
    ].join("\n"),
    preferred_style: "visual_description",
    asset_collection_mode: null,
  });

  const knownSkills = capabilityManifest.capabilities.slice(0, 16).map((item) => ({
    capability_id: item.capability_id,
    label: item.label,
    category: item.category,
    group: item.group,
    semantic_intent: item.semantic_intent,
    fallback_capability_id: item.fallback_capability_id,
    parameter_ids: item.parameter_ids,
  }));

  return {
    ok: true,
    route: "visual-experience/creative-thesis",
    creative_brief: input,
    divergence: {
      output: divergenceParsed.value,
      provider_duration_ms: divergence.duration_ms,
      prompt_chars: promptChars(divergenceMessages),
    },
    selection: {
      output: selectionOutput,
      provider_duration_ms: 0,
      prompt_chars: 0,
    },
    selected_thesis: selected,
    capability_assist: {
      policy: {
        thesis_precedes_capabilities: true,
        capabilities_are_optional: true,
        freeform_execution_allowed: true,
        assets_were_not_exposed_during_ideation: true,
        director_palette_was_not_exposed_during_ideation: true,
      },
      manifest_schema_version: capabilityManifest.schema_version,
      global_production_active: capabilityManifest.counts.global_production_active,
      known_skills: knownSkills,
      freeform_execution_needs: selected.freeform_execution_needs,
    },
    metrics: {
      total_route_duration_ms: Date.now() - startedAt,
      divergence_duration_ms: divergence.duration_ms,
      selection_duration_ms: 0,
      candidate_count: candidates.length,
    },
  };
}
