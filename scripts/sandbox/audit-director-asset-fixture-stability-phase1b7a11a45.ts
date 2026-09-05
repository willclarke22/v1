import {
  listMyWayAssets,
} from "../../sandbox/probe-lab/assets/asset-library.server";
import {
  assetMatchesAnyReference,
  assetSemanticSearchText,
  normalizeAssetSemanticPhrase,
  resolveAssetByReference,
} from "../../sandbox/probe-lab/assets/asset-stable-identity";
import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CAST,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-cast";

function semanticScore(
  asset: Awaited<ReturnType<typeof listMyWayAssets>>[number],
  concepts: readonly string[],
) {
  const haystack = ` ${assetSemanticSearchText(asset)} `;
  let score = 0;
  for (const concept of concepts) {
    const phrase = normalizeAssetSemanticPhrase(concept);
    if (!phrase) continue;
    if (haystack.includes(` ${phrase} `)) score += 160;
    for (const token of phrase.split(" ").filter((item) => item.length >= 3)) {
      if (haystack.includes(` ${token} `)) score += 24;
    }
  }
  if (asset.scene_review_status === "approved") score += 42;
  if (asset.semantic_review_status === "verified") score += 34;
  if (asset.status === "approved") score += 24;
  return score;
}

type FixtureNeed = {
  owner: string;
  reference: string;
  concepts: readonly string[];
};

async function main() {
  const assets = await listMyWayAssets();
  const needs: FixtureNeed[] = [];

  for (const slot of DIRECTOR_QUALIFICATION_CAST) {
    for (const reference of slot.preferred_asset_ids ?? []) {
      needs.push({
        owner: `qualification_cast:${slot.id}`,
        reference,
        concepts: slot.concepts,
      });
    }
  }

  for (const capability of DIRECTOR_CAPABILITIES) {
    for (const role of capability.demo.asset_roles) {
      for (const reference of role.preferred_asset_ids ?? []) {
        needs.push({
          owner: `capability:${capability.id}:${role.role}`,
          reference,
          concepts: role.preferred_concepts,
        });
      }
    }
  }

  const unique = Array.from(
    new Map(
      needs.map((need) => [
        `${need.owner}|${need.reference}`,
        need,
      ]),
    ).values(),
  );

  let stableCount = 0;
  let semanticFallbackCount = 0;
  let unresolvedCount = 0;

  console.log("MyWay Director asset fixture stability audit (A.11A.45)");
  console.log(`Registry assets: ${assets.length}`);
  console.log(`Fixture references: ${unique.length}`);

  for (const need of unique) {
    const stable = resolveAssetByReference(assets, need.reference);
    if (stable) {
      stableCount += 1;
      console.log(
        `[stable:${stable.match_kind}] ${need.owner} :: ${need.reference} -> ${stable.asset.asset_id} (${stable.asset.asset_uid ?? "no uid"})`,
      );
      continue;
    }

    const semanticFallback = assets
      .filter((asset) =>
        asset.status !== "rejected" &&
        asset.scene_review_status !== "rejected" &&
        asset.semantic_review_status !== "rejected" &&
        asset.semantic_review_status !== "mismatch" &&
        asset.safe_to_use_in_sandbox !== false &&
        !assetMatchesAnyReference(asset, [need.reference]),
      )
      .map((asset) => ({
        asset,
        score: semanticScore(asset, need.concepts),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.asset.asset_id.localeCompare(right.asset.asset_id),
      )[0];

    if (semanticFallback) {
      semanticFallbackCount += 1;
      console.log(
        `[semantic-fallback] ${need.owner} :: ${need.reference} -> ${semanticFallback.asset.asset_id} (score ${semanticFallback.score})`,
      );
      continue;
    }

    unresolvedCount += 1;
    console.log(
      `[UNRESOLVED] ${need.owner} :: ${need.reference} :: concepts=${need.concepts.join(", ")}`,
    );
  }

  console.log("");
  console.log(
    `Summary: stable=${stableCount} semantic_fallback=${semanticFallbackCount} unresolved=${unresolvedCount}`,
  );
  if (unresolvedCount) {
    process.exitCode = 2;
  }
}

void main().catch((caught) => {
  console.error(caught);
  process.exitCode = 1;
});
