import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildVisualLearningTurnInput,
  buildVisualLearningTurnModelRequest,
} from "../../sandbox/probe-lab/visual-experience/visual-learning-turn-request";
import { getVisualLearningTurnProviderStatus } from "../../sandbox/probe-lab/visual-experience/model-provider.server";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const envNames = [
    "MYWAY_VISUAL_EXPERIENCE_GLM_MODEL",
    "MYWAY_GLM_MODEL",
    "MYWAY_VISUAL_EXPERIENCE_GLM_REASONING_EFFORT",
    "MYWAY_GLM_TEMPERATURE",
    "MYWAY_NVIDIA_TEMPERATURE",
    "MYWAY_GLM_TOP_P",
    "MYWAY_NVIDIA_TOP_P",
  ] as const;
  const previous = Object.fromEntries(
    envNames.map((name) => [name, process.env[name]]),
  ) as Record<(typeof envNames)[number], string | undefined>;

  try {
    process.env.MYWAY_VISUAL_EXPERIENCE_GLM_MODEL = "z-ai/glm-5.2";
    delete process.env.MYWAY_GLM_MODEL;
    delete process.env.MYWAY_VISUAL_EXPERIENCE_GLM_REASONING_EFFORT;
    delete process.env.MYWAY_GLM_TEMPERATURE;
    delete process.env.MYWAY_NVIDIA_TEMPERATURE;
    delete process.env.MYWAY_GLM_TOP_P;
    delete process.env.MYWAY_NVIDIA_TOP_P;

    const status = getVisualLearningTurnProviderStatus();
    assert(
      status.env.glm_model === "z-ai/glm-5.3",
      `Retired GLM alias did not resolve to GLM-5.3: ${status.env.glm_model}`,
    );
    assert(
      status.glm53_request_profiles.reliable.reasoning_effort === "high",
      `Reliable GLM-5.3 reasoning effort should be high: ${status.glm53_request_profiles.reliable.reasoning_effort}`,
    );
    assert(
      status.glm53_request_profiles.cinematic.reasoning_effort === "max",
      `Cinematic GLM-5.3 reasoning effort should be max: ${status.glm53_request_profiles.cinematic.reasoning_effort}`,
    );
    assert(
      status.glm53_request_profiles.cinematic.temperature === 0.25,
      `GLM-5.3 default temperature drifted: ${status.glm53_request_profiles.cinematic.temperature}`,
    );
    assert(
      status.glm53_request_profiles.cinematic.top_p === 1,
      `GLM-5.3 top_p must stay neutral by default: ${status.glm53_request_profiles.cinematic.top_p}`,
    );
    assert(
      status.glm53_request_profiles.cinematic.clear_thinking_policy ===
        "not_sent_hosted_api_schema",
      "Hosted GLM-5.3 clear_thinking policy must remain explicit and non-invented.",
    );
    assert(
      status.glm53_request_profiles.cinematic.native_reasoning_422_compatibility_retry ===
        true,
      "GLM-5.3 must retain one hosted-schema compatibility retry after a native-control 422.",
    );
  } finally {
    for (const name of envNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  const inputBody = {
    learner_message:
      "I understand the names, but I cannot picture how the airway structures are arranged during swallowing.",
    preferred_style: "visual_description" as const,
    asset_collection_mode: "bodyparts3d_full_atlas" as const,
    provider: "glm" as const,
  };
  const input = buildVisualLearningTurnInput(inputBody);
  const request = buildVisualLearningTurnModelRequest(input, inputBody);
  assert(
    request.prompt_stats.total_chars < 100000,
    `Visual Experience prompt budget regressed: ${request.prompt_stats.total_chars}`,
  );

  const provider = source(
    "sandbox/probe-lab/visual-experience/model-provider.server.ts",
  );
  for (const marker of [
    'body.reasoning_effort = args.config.reasoningEffort',
    'lastNativeAttempt?.http_status === 422',
    'delete compatibilityBody.reasoning_effort',
    '"glm53_native_reasoning"',
    '"glm53_hosted_compatibility"',
    'clearThinkingPolicy: "not_sent_hosted_api_schema"',
    'numberInRangeFromEnv("MYWAY_NVIDIA_TOP_P", 1, 0, 1)',
    'reasoningEffort: visualExperienceGlmReasoningEffort(preset)',
  ]) {
    assert(
      provider.includes(marker),
      `GLM-5.3 native-request hardening marker missing: ${marker}`,
    );
  }

  assert(
    !provider.includes(
      'reasoningBudget: numberFromEnv("MYWAY_VISUAL_EXPERIENCE_GLM_REASONING_BUDGET"',
    ),
    "GLM-5.3 must not use the retired numeric reasoning_budget control.",
  );
  assert(
    !provider.includes("body.chat_template_kwargs"),
    "Do not send undocumented GLM-5.3 chat_template_kwargs until the hosted API schema exposes it.",
  );

  const lab = source(
    "sandbox/probe-lab/visual-experience/ui/visual-experience-lab.tsx",
  );
  for (const marker of [
    "async function runGenerateFullTurn()",
    '"/api/sandbox/probe-lab/visual-experience/full-turn-debug"',
    "Checking the server-resolved provider contract before any external model call.",
    "Launch preflight passed. The external provider call is starting now.",
    "Generation launch contract",
    "native_reasoning_compatibility_fallback_used",
    'resolvedModel !== "z-ai/glm-5.3"',
  ]) {
    assert(
      lab.includes(marker),
      `Generate-full-turn launch observability marker missing: ${marker}`,
    );
  }

  const readme = source("sandbox/probe-lab/visual-experience/README.md");
  const normalizedReadme = readme.replace(/\s+/g, " ");
  for (const marker of [
    "## GLM-5.3 native reasoning and launch observability",
    '`reasoning_effort: "max"`',
    '`clear_thinking_policy: "not_sent_hosted_api_schema"`',
    "one immediate same-model compatibility retry",
  ]) {
    assert(
      normalizedReadme.includes(marker.replace(/\s+/g, " ")),
      `Visual Experience README is missing GLM-5.3 contract marker: ${marker}`,
    );
  }

  console.log(
    "PASS: GLM-5.3 native reasoning profile + hosted-schema compatibility + Generate full turn launch observability V8 verified.",
  );
  console.log(
    `Prompt chars: ${request.prompt_stats.total_chars}. Cinematic GLM-5.3 resolves max reasoning with neutral top_p=1 and a visible preflight before NVIDIA is called.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
}
