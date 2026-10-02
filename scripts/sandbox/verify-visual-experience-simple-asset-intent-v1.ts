import fs from "node:fs";
import path from "node:path";

import { validateVisualOrchestrationOutput } from "../../sandbox/probe-lab/visual-experience/orchestration/contracts";
import { compileVisualAssetIntentGroundingRequests } from "../../sandbox/probe-lab/visual-experience/orchestration/asset-intent-adapter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function source(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

const contracts = source("sandbox/probe-lab/visual-experience/orchestration/contracts.ts");
const prompts = source("sandbox/probe-lab/visual-experience/orchestration/prompts.ts");
const runner = source("sandbox/probe-lab/visual-experience/orchestration/run-stage.server.ts");
const adapter = source("sandbox/probe-lab/visual-experience/orchestration/asset-intent-adapter.ts");

for (const marker of [
  "VisualAssetIntent",
  '"primary_subject"',
  '"required" | "preferred" | "optional"',
  "asset_intents must contain at least one item",
  "must reference asset_intents by concept",
]) assert(contracts.includes(marker), `Asset Intent contract marker missing: ${marker}`);

for (const marker of [
  "Use ordinary canonical concept names",
  "Never output BodyParts3D ids",
  "Do not make MyWay rediscover an obvious noun",
  'concept="car" with appearance.color="blue"',
  "Do not output asset ids, aliases, search tags, or retrieval instructions",
]) assert(prompts.includes(marker), `Asset Intent prompt marker missing: ${marker}`);

for (const marker of [
  "compileVisualAssetIntentGroundingRequests",
  "asset_intent_grounding",
  "search_query_packets_v2_shadow",
  "runLexicalAssetSearchBench",
  "resolveSandboxBodyParts3dSemanticConcepts",
]) assert(runner.includes(marker), `Runner grounding marker missing: ${marker}`);

assert(!adapter.includes("asset_id:"), "Asset Intent adapter must not author asset ids.");
assert(adapter.includes("appearance_request"), "Appearance must remain visible as a separate request.");
assert(adapter.includes("semantic_name: intent.concept"), "Identity search must use the simple concept noun.");

const blueCar = {
  schema_version: "myway_visual_orchestration_stage2_v2",
  topic_label: "car color",
  root_problem: "The learner needs to distinguish object identity from visual appearance.",
  asset_intents: [{
    concept: "car",
    role: "primary_subject",
    importance: "required",
    quantity: 1,
    laterality: "unspecified",
    appearance: { color: "blue" },
  }],
};
const blueValidation = validateVisualOrchestrationOutput(2, blueCar);
assert(blueValidation.valid, `Blue-car Asset Intent should validate: ${blueValidation.fatal_errors.join(" | ")}`);
const blueGrounding = compileVisualAssetIntentGroundingRequests(blueCar);
assert(blueGrounding.length === 1, "Blue-car fixture should compile one grounding request.");
assert(blueGrounding[0]?.intent.concept === "car", "Appearance must not be folded into semantic identity.");
assert(blueGrounding[0]?.query_packet.semantic_concept === "car", "Query Packet V2 must search car, not blue car.");
assert(blueGrounding[0]?.appearance_request?.color === "blue", "Blue appearance must survive separately.");
assert(!blueGrounding[0]?.query_packet.views.identity_hint.toLowerCase().includes("blue"), "Appearance color must not silently become identity-search authority.");

const anatomy = {
  schema_version: "myway_visual_orchestration_stage3_v2",
  topic_label: "hip rotation",
  root_problem: "The learner is missing the rigid link between hip orientation and knee direction.",
  asset_intents: [
    { concept: "femur", role: "primary_subject", importance: "required", quantity: 1, laterality: "left" },
    { concept: "hip", role: "context", importance: "required", quantity: 1, laterality: "left" },
    { concept: "knee", role: "context", importance: "required", quantity: 1, laterality: "left" },
  ],
  target_takeaway: "The femur carries hip rotation toward the knee.",
  relationships: [
    { source_concept: "hip", relationship: "orients", target_concept: "femur", learning_reason: "show the proximal driver" },
    { source_concept: "femur", relationship: "orients", target_concept: "knee", learning_reason: "show the distal consequence" },
  ],
};
const anatomyValidation = validateVisualOrchestrationOutput(3, anatomy);
assert(anatomyValidation.valid, `Stage 3 Asset Intent should validate: ${anatomyValidation.fatal_errors.join(" | ")}`);
const anatomyGrounding = compileVisualAssetIntentGroundingRequests(anatomy);
const femur = anatomyGrounding.find((item) => item.intent.concept === "femur");
assert(femur, "Femur grounding request missing.");
assert(femur.query_packet.laterality.value === "left" && femur.query_packet.laterality.required, "Laterality must survive into Query Packet V2.");
assert(femur.query_packet.requested_relationships.length === 2, "Stage 3 relationships must survive into the femur grounding packet.");
assert(femur.query_packet.anchors.some((item) => item.concept === "hip") && femur.query_packet.anchors.some((item) => item.concept === "knee"), "Relationship anchors should be available for secondary disambiguation.");

console.log("PASS: Visual Experience Simple Asset Intent V1 verified.");
console.log("GLM names simple concepts; MyWay keeps appearance separate, compiles Query Packet V2, and retains asset-id authority.");
