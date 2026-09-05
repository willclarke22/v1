import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assetMatchesAnyReference,
  assetReferenceMatchKind,
  assetSemanticSearchText,
  legacyAssetUidForAssetId,
  resolveAssetByReference,
} from "../../sandbox/probe-lab/assets/asset-stable-identity";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const oldId = "wooden_picnic_table_bk_example123";
  const newId = "picnic_table_bk_example123";
  const uid = legacyAssetUidForAssetId(oldId);
  const renamed = {
    asset_id: newId,
    asset_uid: uid,
    legacy_asset_ids: [oldId],
    canonical_label: "picnic table",
    verified_canonical_label: "picnic table",
    display_name: "Picnic Table",
    aliases: ["wooden picnic table"],
    verified_aliases: ["wooden picnic table"],
    semantic_tags: ["table", "furniture"],
    preferred_for_concepts: ["picnic table"],
  };

  assert(
    assetReferenceMatchKind(renamed, uid) === "asset_uid",
    "A.11A.45 immutable asset_uid must resolve after Asset ID migration.",
  );
  assert(
    assetReferenceMatchKind(renamed, newId) === "asset_id",
    "A.11A.45 current technical Asset ID must resolve.",
  );
  assert(
    assetReferenceMatchKind(renamed, oldId) === "legacy_asset_id",
    "A.11A.45 previous technical Asset ID must remain a legacy redirect.",
  );
  assert(
    resolveAssetByReference([renamed], oldId)?.asset.asset_id === newId &&
      assetMatchesAnyReference(renamed, [oldId]),
    "A.11A.45 Director fixture references must survive an Asset ID migration without source rewrites.",
  );
  const semanticText = assetSemanticSearchText(renamed);
  assert(
    semanticText.includes("picnic table") &&
      semanticText.includes("wooden picnic table") &&
      semanticText.includes("wooden picnic table bk example123"),
    "A.11A.45 shared semantic identity must retain current and legacy naming vocabulary.",
  );

  const types = source("sandbox/probe-lab/assets/asset-types.ts");
  const normalize = source("sandbox/probe-lab/assets/normalize-asset-record.ts");
  const library = source("sandbox/probe-lab/assets/asset-library.server.ts");
  const route = source("sandbox/probe-lab/assets/routes/library.ts");
  const ui = source("sandbox/probe-lab/assets/ui/asset-library-lab.tsx");
  const resolver = source("sandbox/probe-lab/assets/reviewed-asset-resolver.server.ts");
  const director = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const level1 = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-level1-capability-visualization.tsx",
  );
  const supportPolicy = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-support-containment-policy.ts",
  );

  for (const marker of ["asset_uid?: string", "legacy_asset_ids?: string[]"]) {
    assert(types.includes(marker), `A.11A.45 asset type marker missing: ${marker}`);
  }
  for (const marker of [
    "normalizeAssetUid(",
    "normalizeLegacyAssetIds(",
    "asset_uid: normalizeAssetUid(",
  ]) {
    assert(normalize.includes(marker), `A.11A.45 normalization marker missing: ${marker}`);
  }
  for (const marker of [
    "resolveMyWayAssetReference",
    "resolveAssetByReference(",
    "legacyAssetUidForAssetId(previousAssetId)",
    "legacy_asset_ids: normalizeLegacyAssetIds(",
    "previousAssetId,",
    "preservedAliases",
    "previousCanonicalLabel",
  ]) {
    assert(library.includes(marker), `A.11A.45 registry migration marker missing: ${marker}`);
  }
  assert(
    route.includes('body.action === "migrate_asset_id"') &&
      route.includes("legacy_asset_ids:") &&
      route.includes("asset_uid:"),
    "A.11A.45 API must expose explicit Asset ID migration while returning stable identity metadata.",
  );
  for (const marker of [
    "Advanced identity maintenance",
    "Stable Asset UID",
    "Legacy Asset IDs",
    "Migrate asset ID",
    'action: "migrate_asset_id"',
    "publishAssetIdentityRevision();",
  ]) {
    assert(ui.includes(marker), `A.11A.45 Asset Library UI marker missing: ${marker}`);
  }
  assert(
    resolver.includes("assetReferenceMatchKind(asset, request.preferred_asset_id)") &&
      resolver.includes("resolveAssetByReference("),
    "A.11A.45 reviewed resolver preferred-asset logic must accept UID/current/legacy references.",
  );
  for (const marker of [
    "assetSemanticSearchText",
    "assetMatchesAnyReference",
    "resolveAssetByReference",
    "DIRECTOR_ASSET_LIBRARY_REVISION_KEY",
  ]) {
    assert(director.includes(marker), `A.11A.45 Director library marker missing: ${marker}`);
  }
  for (const marker of [
    "assetSemanticSearchText",
    "assetMatchesAnyReference",
    "resolveAssetByReference",
  ]) {
    assert(room.includes(marker), `A.11A.45 Qualification Room marker missing: ${marker}`);
  }
  for (const marker of [
    "assetSemanticSearchText",
    "resolveAssetByReference",
  ]) {
    assert(level1.includes(marker), `A.11A.45 Level-1 Director marker missing: ${marker}`);
  }
  assert(
    supportPolicy.includes("assetReferenceMatchKind(asset, assetId)"),
    "A.11A.45 exact support/containment fixture preferences must survive renamed Asset IDs.",
  );

  console.log(
    "A.11A.45 Asset Identity / Director Fixture Stability verification passed.",
  );
  console.log(
    "Asset UID is immutable, Asset ID is explicitly migratable with legacy redirects, semantic renames preserve old vocabulary, and Director fixture resolution is shared/current/legacy aware.",
  );
}

main();
