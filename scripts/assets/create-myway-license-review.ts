import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getMyWayAsset } from "../../sandbox/probe-lab/assets/asset-library.server";
import type { MyWayAssetLicenseReviewV1 } from "../../sandbox/probe-lab/assets/licensing/asset-license-review";
import { projectPath } from "../../sandbox/probe-lab/assets/paths.server";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0
    ? process.argv[index + 1] ?? null
    : null;
}

async function main() {
  const assetId = argument("--asset-id");
  const reviewedBy =
    argument("--reviewed-by") ?? "REPLACE_ME";

  if (!assetId) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/assets/create-myway-license-review.ts --asset-id <asset-id> --reviewed-by \"Your Name\"",
    );
  }

  const asset = await getMyWayAsset(assetId);

  if (!asset) {
    throw new Error(
      `Asset was not found: ${assetId}`,
    );
  }

  const reviewId =
    `${asset.asset_id}_license_review_v1`;
  const relativePath =
    `sandbox/probe-lab/assets/library/licenses/` +
    `${asset.asset_id}.review.json`;
  const outputPath = projectPath(relativePath);

  const isBlockedBlendKitRoyaltyFree =
    asset.source_type === "blenderkit" &&
    asset.license_kind === "royalty_free";

  const basis =
    asset.source_type === "trellis"
      ? [
          {
            label:
              "NVIDIA TRELLIS model card",
            url:
              "https://build.nvidia.com/microsoft/trellis/modelcard",
            finding:
              "Review the governing NVIDIA trial terms, model license, and any additional restrictions for this generated output.",
          },
          {
            label:
              "NVIDIA API Trial Terms section 6.3",
            url:
              "https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf",
            finding:
              "Confirm the generated-content ownership and distribution language applies to this use.",
          },
        ]
      : asset.source_type === "blenderkit"
        ? [
            {
              label:
                "BlendKit asset license",
              url:
                "https://www.blenderkit.com/docs/licenses/",
              finding:
                isBlockedBlendKitRoyaltyFree
                  ? "Royalty Free assets are not approved for standalone public GLB redistribution."
                  : "Confirm the specific asset is CC0 before public raw-file distribution.",
            },
          ]
        : [
            {
              label:
                "Ownership/source documentation",
              url: asset.source_url ?? null,
              finding:
                "Document ownership or a license that expressly permits public raw-file distribution and commercial use.",
            },
          ];

  const review: MyWayAssetLicenseReviewV1 = {
    schema_version:
      "myway_asset_license_review_v1",
    review_id: reviewId,
    asset_id: asset.asset_id,
    decision: isBlockedBlendKitRoyaltyFree
      ? "rejected"
      : "needs_review",
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
    basis,
    attestations: {
      reviewed_source_terms: false,
      production_use_allowed: false,
      public_raw_distribution_allowed: false,
      commercial_use_allowed: false,
      no_known_third_party_restrictions: false,
      generic_or_authorized_subject: false,
    },
    notes:
      "This template is deliberately not approved. Review the cited terms and change the decision and attestations only when the asset is cleared for public raw-file distribution.",
  };

  await mkdir(path.dirname(outputPath), {
    recursive: true,
  });
  await writeFile(
    outputPath,
    `${JSON.stringify(review, null, 2)}\n`,
    {
      encoding: "utf8",
      flag: "wx",
    },
  );

  console.log(
    `Created license review template:\n${relativePath}`,
  );
  console.log(
    "\nThe asset cannot be promoted until the review is explicitly approved and every required attestation is true.",
  );
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
