import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildVisualLearningTurnInput,
  buildVisualLearningTurnModelRequest,
  buildVisualLearningTurnScaffoldOutput,
} from "../../sandbox/probe-lab/visual-experience/visual-learning-turn-request";
import { normalizeVisualLearningTurnOutput } from "../../sandbox/probe-lab/visual-experience/normalize-visual-learning-turn-output";
import { validateVisualLearningTurnOutput } from "../../sandbox/probe-lab/visual-experience/validate-visual-learning-turn";
import {
  buildVisualExperienceDirectorAuthoringManifest,
  VISUAL_EXPERIENCE_DIRECTOR_PALETTE_HARD_MAX,
} from "../../sandbox/probe-lab/visual-experience/director-authoring-manifest";
import { getVisualLearningTurnProviderStatus } from "../../sandbox/probe-lab/visual-experience/model-provider.server";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const previousSpecific = process.env.MYWAY_VISUAL_EXPERIENCE_GLM_MODEL;
  const previousShared = process.env.MYWAY_GLM_MODEL;
  try {
    process.env.MYWAY_VISUAL_EXPERIENCE_GLM_MODEL = "z-ai/glm-5.2";
    delete process.env.MYWAY_GLM_MODEL;
    const status = getVisualLearningTurnProviderStatus();
    assert(
      status.env.glm_model === "z-ai/glm-5.3",
      `Retired GLM-5.2 env alias did not migrate to GLM-5.3: ${status.env.glm_model}`,
    );
  } finally {
    if (previousSpecific === undefined) delete process.env.MYWAY_VISUAL_EXPERIENCE_GLM_MODEL;
    else process.env.MYWAY_VISUAL_EXPERIENCE_GLM_MODEL = previousSpecific;
    if (previousShared === undefined) delete process.env.MYWAY_GLM_MODEL;
    else process.env.MYWAY_GLM_MODEL = previousShared;
  }

  const body = {
    learner_message: "Why does rotating your hip inward change where your knee points?",
    preferred_style: "visual_description" as const,
    asset_collection_mode: "bodyparts3d_full_atlas" as const,
    provider: "glm" as const,
  };
  const input = buildVisualLearningTurnInput(body);
  const manifest = buildVisualExperienceDirectorAuthoringManifest({
    learner_message: body.learner_message,
    preferred_style: body.preferred_style,
    asset_collection_mode: body.asset_collection_mode,
  });
  assert(manifest.capabilities.length > 0, "Turn-specific Director palette is empty.");
  assert(
    manifest.capabilities.length <= VISUAL_EXPERIENCE_DIRECTOR_PALETTE_HARD_MAX,
    `Director palette exceeded hard max: ${manifest.capabilities.length}`,
  );
  assert(
    manifest.counts.global_production_active > manifest.counts.palette_count,
    "Compact Director palette did not reduce the global production-active registry.",
  );
  assert(
    manifest.capabilities.every((item) => item.authoring_status === "production_active"),
    "Compact Director palette exposed a non-production-active capability.",
  );
  const paletteIds = new Set(manifest.capabilities.map((item) => item.capability_id));
  for (const item of manifest.capabilities) {
    if (item.fallback_capability_id) {
      assert(
        paletteIds.has(item.fallback_capability_id),
        `Palette exposes fallback ${item.fallback_capability_id} without including it as an authorable entry.`,
      );
    }
  }
  const serializedManifest = JSON.stringify(manifest);
  assert(
    serializedManifest.length < 32000,
    `Director palette is too verbose (${serializedManifest.length} chars).`,
  );

  const request = buildVisualLearningTurnModelRequest(input, body);
  assert(
    request.prompt_stats.total_chars < 100000,
    `Visual Experience prompt budget regressed: ${request.prompt_stats.total_chars} chars.`,
  );

  const scaffold = buildVisualLearningTurnScaffoldOutput(input, body);
  const directValidation = validateVisualLearningTurnOutput(scaffold, input);
  assert(
    directValidation.valid,
    `Deterministic scaffold is invalid before normalization: ${directValidation.fatal_errors.join("; ")}`,
  );
  const normalized = normalizeVisualLearningTurnOutput(scaffold, input);
  const normalizedValidation = validateVisualLearningTurnOutput(normalized.output, input);
  assert(
    normalizedValidation.valid,
    `Strict scaffold became invalid during Director compatibility normalization: ${normalizedValidation.fatal_errors.join("; ")}`,
  );
  assert(
    normalizedValidation.fatal_errors.every((error) => !error.startsWith("Unknown orientation segment ids:")),
    `Orientation/explanation id namespaces regressed: ${normalizedValidation.fatal_errors.join("; ")}`,
  );

  const providerSource = source("sandbox/probe-lab/visual-experience/model-provider.server.ts");
  for (const marker of [
    'DEFAULT_VISUAL_EXPERIENCE_GLM_MODEL = "z-ai/glm-5.3"',
    '["z-ai/glm-5.2", DEFAULT_VISUAL_EXPERIENCE_GLM_MODEL]',
    'status === 404 || status === 410',
    'return "provider_model_unavailable"',
  ]) {
    assert(providerSource.includes(marker), `Provider hardening marker missing: ${marker}`);
  }

  const route = source("sandbox/probe-lab/visual-experience/routes/generate-full-turn.ts");
  assert(
    route.includes('providerResult.provider_used === "scaffold"') &&
      route.includes("Deterministic scaffold failed its own validation/resolution"),
    "Generate-full-turn must validate deterministic scaffold directly instead of normalizing it as model output.",
  );
  assert(
    route.includes("`Deterministic scaffold failed its own validation/resolution: ${attempted.error}`") &&
      !route.includes("attempted.error ?? attempted.validation.fatal_errors"),
    "Deterministic-scaffold failure reporting must respect the SafeResolveResult discriminated union.",
  );
  assert(
    route.includes("fallbackUsed = false;") &&
      route.includes("provider_fallback_used: providerFallbackUsed"),
    "Successful non-scaffold model output must not be misclassified as deterministic scaffold fallback.",
  );

  const director = source("sandbox/probe-lab/director/normalize-director-plan.ts");
  assert(
    director.includes("Legacy semantic beats cite orientation-segment ids") &&
      director.includes("orientationIds.length") &&
      director.includes(": moment.source_explanation_piece_ids"),
    "Director legacy semantic-beat compatibility mapping is not namespace-safe.",
  );

  const lab = source("sandbox/probe-lab/visual-experience/ui/visual-experience-lab.tsx");
  assert(!lab.includes("GLM-5.2"), "Visual Experience UI still advertises retired GLM-5.2.");
  assert(lab.includes("GLM-5.3 via NVIDIA"), "Visual Experience UI does not advertise GLM-5.3.");

  console.log("PASS: Visual Experience GLM-5.3 + deterministic fallback + compact Director palette V7 verified.");
  console.log(`Prompt chars: ${request.prompt_stats.total_chars}; Director palette: ${manifest.capabilities.length}/${manifest.counts.global_production_active} production-active capabilities.`);
  console.log("Scaffold validates both directly and after strict Director compatibility normalization; retired GLM-5.2 env values migrate to GLM-5.3.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
}
