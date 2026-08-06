import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { MyWayAssetRecord } from "../asset-types";
import {
  buildManualCc0LicenseReview,
  isManualCc0PublicSceneCandidate,
  publicPromotionBlockers,
} from "../licensing/asset-license-review";

const asset = {
  asset_id: "chair_man_fixture",
  canonical_label: "chair",
  display_name: "Chair",
  aliases: ["chair"],
  semantic_tags: ["furniture"],
  asset_type: "glb",
  domain: "cc0_manual_intake",
  source_type: "manual",
  source_asset_id: "chair-source-1",
  source_url: "https://example.com/chair",
  public_path: "/sandbox-assets/myway/models/manual/chair_man_fixture.glb",
  dimensions_m: [1, 1, 1],
  default_scale: 1,
  default_rotation: [0, 0, 0],
  ground_offset_m: 0,
  rigged: false,
  animation_clips: [],
  quality_score: 0.8,
  reuse_count: 0,
  license_kind: "cc0",
  attribution: {
    schema_version: "myway_asset_attribution_v1",
    required: false,
    text: null,
    asset_title: "Chair",
    creator_name: null,
    source_provider: "Example CC0 Library",
    source_asset_id: "chair-source-1",
    source_url: "https://example.com/chair",
    license_name: "CC0",
    license_version: null,
    license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
    modification_notice: "Normalized by MyWay.",
    downloaded_at: "2026-08-05",
  },
  license_status: "recorded",
  commercial_use_allowed: true,
  raw_redistribution_allowed: true,
  safe_to_use_in_sandbox: true,
  safe_to_promote_to_app: false,
  status: "normalized",
  scene_review_status: "pending",
  created_at: "2026-08-05T00:00:00.000Z",
  updated_at: "2026-08-05T00:00:00.000Z",
} as MyWayAssetRecord;

assert.equal(
  isManualCc0PublicSceneCandidate(asset),
  true,
  "A reviewed manual CC0 asset should qualify for public scene approval.",
);

const review = buildManualCc0LicenseReview(
  asset,
  "2026-08-05T00:00:00.000Z",
);
assert.equal(review.decision, "approved_public_distribution");
assert.equal(review.asset_id, asset.asset_id);
assert.deepEqual(publicPromotionBlockers(asset, review), []);

const ui = readFileSync(
  path.join(
    process.cwd(),
    "sandbox/probe-lab/assets/ui/asset-library-lab.tsx",
  ),
  "utf8",
);
assert(ui.includes("isManualCc0PublicSceneCandidate"));
assert(ui.includes("Approve this CC0 asset for scene use"));
assert(ui.includes("isManualPublicSceneCandidate"));

const server = readFileSync(
  path.join(
    process.cwd(),
    "sandbox/probe-lab/assets/acquisition/missing-asset-review.server.ts",
  ),
  "utf8",
);
assert(server.includes("writeApprovedManualCc0LicenseReview"));
assert(server.includes("buildManualCc0LicenseReview"));

console.log("Manual CC0 scene-use approval fixture passed.");
