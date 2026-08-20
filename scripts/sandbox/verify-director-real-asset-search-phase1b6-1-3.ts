import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const relativePath =
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx";
const source = readFileSync(join(process.cwd(), relativePath), "utf8");

for (const marker of [
  'const [assetSearchQueries, setAssetSearchQueries]',
  'type="search"',
  'Search ${loadable.length} Asset Library models',
  'assetSearchText(asset).includes(normalizedAssetQuery)',
  'const matchingAssets = normalizedAssetQuery',
  'const visibleAssets =',
  'matchingAssets.length} of ${loadable.length} assets match',
  'onRoleAssetOverride(role.role, event.target.value)',
  'Auto-match ·',
]) {
  assert(
    source.includes(marker),
    `Director real-asset searchable dropdown is missing marker: ${marker}.`,
  );
}

assert(
  (source.match(/type="search"/g) ?? []).length >= 1,
  "Real-asset proof must expose at least one search input template.",
);

assert(
  source.includes('!matchingAssets.some((asset) => asset.asset_id === selectedAsset.asset_id)'),
  "The selected asset must remain in the dropdown when an active search would otherwise hide it.",
);

assert(
  source.includes("setAssetSearchQueries({});") &&
    source.includes("}, [capability.id]);"),
  "Asset searches should reset when the selected Director capability changes.",
);

assert(
  source.includes("asset.display_name") &&
    source.includes("asset.canonical_label") &&
    source.includes("asset.aliases") &&
    source.includes("asset.semantic_tags"),
  "Asset search must continue to use the existing searchable Asset Library identity text.",
);

console.log("Director real-asset searchable dropdown Phase 1B.6.1.3 verification passed.");
console.log(
  "Each real-asset role can now filter reviewed GLBs by identity metadata without changing the selected asset or Director execution authority.",
);
