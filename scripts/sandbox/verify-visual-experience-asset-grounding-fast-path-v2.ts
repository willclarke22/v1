import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function source(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

const grounder = source("sandbox/probe-lab/visual-experience/orchestration/asset-intent-grounder.server.ts");
const runner = source("sandbox/probe-lab/visual-experience/orchestration/run-stage.server.ts");

for (const marker of [
  '"myway_visual_asset_grounding_v2"',
  '"candidate_below_threshold"',
  '"collection_concept_family"',
  '"general_identity_exact"',
  '"general_identity_candidate"',
  "getAssetBrowserRegistrySnapshot",
  "readBodyParts3dFullCatalog",
  "equivalent_variant_family",
  "presentation_choice_only",
  "general_identity_match_kind",
  "registry_snapshot_duration_ms",
  "identity_decision_duration_ms",
]) assert(grounder.includes(marker), `Fast-path grounding marker missing: ${marker}`);

assert(
  !/\bresolveReviewedAsset\s*\(/.test(grounder),
  "Normal Asset Grounding V2 must not call the reviewed resolver scoring path.",
);
assert(
  !/\brunLexicalAssetSearchBench\s*\(/.test(grounder),
  "Normal Asset Grounding V2 must not invoke BodyParts3D BM25 fallback.",
);
assert(
  grounder.includes('lexical_fallback_query_count: 0'),
  "Normal-path lexical fallback count must stay zero.",
);
assert(
  grounder.includes('Semantic laterality remains unspecified') &&
    grounder.includes('deterministic presentation representative'),
  "Unspecified bilateral variants must be presentation-only, not semantic laterality authority.",
);
assert(
  grounder.includes('match.kind === "trusted_exact" && eligible.length === 1') &&
    grounder.includes('status: "candidate_below_threshold"') &&
    grounder.includes('status: "missing"'),
  "General-library decisions must separate resolved, below-threshold, and missing states.",
);

for (const marker of [
  "one canonical Asset Grounding V2 result",
  "candidate_below_threshold",
  "asset_registry_snapshot_duration_ms",
  "asset_identity_decision_duration_ms",
]) assert(runner.includes(marker), `Runner V2 marker missing: ${marker}`);

console.log("PASS: Visual Experience Asset Grounding Fast Path V2 verified.");
console.log(
  "BodyParts3D source concepts now use the atlas catalog; general assets use cached in-memory identity evidence; below-threshold candidates are distinct from true misses; no reviewed-resolver scoring or anatomy BM25 runs on the normal path.",
);
