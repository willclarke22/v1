import fs from "node:fs";
import path from "node:path";

import {
  compileVisualAssetIntentGroundingRequests,
  effectiveVisualAssetIntentLaterality,
} from "../../sandbox/probe-lab/visual-experience/orchestration/asset-intent-adapter";
import {
  reviewedRequestForVisualAssetIntent,
} from "../../sandbox/probe-lab/visual-experience/orchestration/asset-intent-grounder.server";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

const prompts = source("sandbox/probe-lab/visual-experience/orchestration/prompts.ts");
const runner = source("sandbox/probe-lab/visual-experience/orchestration/run-stage.server.ts");
const grounder = source("sandbox/probe-lab/visual-experience/orchestration/asset-intent-grounder.server.ts");

for (const marker of [
  'laterality="unspecified"',
  "Laterality is semantic input, not a presentation choice",
  "never invent a side",
]) {
  assert(prompts.includes(marker), `Laterality prompt policy missing: ${marker}`);
}

assert(
  effectiveVisualAssetIntentLaterality("right", {
    learner_message: "Why does rotating your hip inward change where your knee points?",
  }) === "unspecified",
  "An unspecified learner message must not preserve a model-invented right side.",
);
assert(
  effectiveVisualAssetIntentLaterality("right", {
    learner_message: "Why does rotating my right hip inward change where my right knee points?",
  }) === "right",
  "Explicit right laterality must survive.",
);
assert(
  effectiveVisualAssetIntentLaterality("left", {
    learner_message: "Compare both sides of the pelvis and femurs.",
  }) === "bilateral",
  "Explicit bilateral language must become bilateral.",
);

const blueCar = {
  schema_version: "myway_visual_orchestration_stage2_v2",
  topic_label: "car color",
  root_problem: "The learner needs to distinguish object identity from appearance.",
  asset_intents: [{
    concept: "car",
    role: "primary_subject",
    importance: "required",
    quantity: 1,
    laterality: "unspecified",
    appearance: { color: "blue" },
  }],
};
const [blueRequest] = compileVisualAssetIntentGroundingRequests(blueCar, {
  learner_message: "Show me how a blue car moves through an intersection.",
});
assert(blueRequest, "Blue-car grounding request missing.");
const reviewedRequest = reviewedRequestForVisualAssetIntent(blueRequest);
assert(reviewedRequest.concept === "car", "Reviewed resolver must search identity as car.");
assert(
  reviewedRequest.appearance_request === undefined,
  "Appearance must not silently become reviewed-resolver identity authority.",
);
assert(reviewedRequest.appearance_ranking === false, "Provider-backed appearance ranking must stay off.");

for (const marker of [
  "VISUAL_ASSET_GROUNDING_VERSION",
  '"collection_exact"',
  '"reviewed_library"',
  '"lexical_evidence"',
  "resolveReviewedAsset",
  "runLexicalAssetSearchBench",
  "lexical_fallback_used",
  "resolved_asset",
  "escalation_required",
]) {
  assert(grounder.includes(marker), `Grounding authority marker missing: ${marker}`);
}

for (const marker of [
  "groundVisualAssetIntents",
  "asset_intent_grounding: assetGrounding",
  "asset_intent_requests: assetIntentRequests",
  "legacyCalibrationDiagnosticsEnabled = false",
  "Vector/RRF/reranker/geometry systems remain off the normal path",
]) {
  assert(runner.includes(marker), `Runner convergence marker missing: ${marker}`);
}

assert(
  runner.includes("compileVisualAssetIntentGroundingRequests(parsed.value, {") &&
    runner.includes("learner_message: learnerMessage"),
  "Runner must enforce laterality using the learner message before grounding.",
);

console.log("PASS: Visual Experience Asset Grounding Convergence V1 verified.");
console.log(
  "Learner-grounded laterality is deterministic; one Asset Grounding V1 result owns normal resolution; BodyParts3D exact identity and the general reviewed resolver are cheap paths; BM25 is fallback-only; advanced semantic retrieval remains off the normal path.",
);
