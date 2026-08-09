import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  attributionCompletenessIssues,
  buildAssetAttribution,
  buildThirdPartyAssetManifest,
  renderThirdPartyAssetLicensesText,
} from "../asset-attribution";
import type {
  MyWayAssetRecord,
} from "../asset-types";
import {
  MAX_MANUAL_GLB_BATCH_FILES,
  buildManualCcByAttributionText,
  manualConceptFromFileName,
  parseManualGlbFileName,
  validateCc0ImportDraft,
  validateCcByImportDraft,
} from "../manual-glb-batch-intake";
import {
  buildPolyPizzaAttributionText,
  parsePolyPizzaFileName,
  polyPizzaAssetId,
  polyPizzaConceptFromFileName,
  polyPizzaModelIdFromFileName,
  polyPizzaModelIdFromUrl,
  polyPizzaSourceUrl,
  validatePolyPizzaImportDraft,
} from "../poly-pizza-manual-intake";
import {
  normalizeMyWayAssetRecord,
} from "../normalize-asset-record";
import {
  buildRuntimeSceneBinding,
} from "../../resource-runtime/build-scene-runtime-binding";
import {
  RESOURCE_RUNTIME_SCHEMA_VERSION,
  type RuntimeModelBindingV1,
} from "../../resource-runtime/resource-runtime-contract";
import {
  buildPolyPizzaManualLicenseReview,
  isPolyPizzaManualLicenseCandidate,
  publicPromotionBlockers,
  type MyWayAssetLicenseReviewV1,
} from "../licensing/asset-license-review";

const sourceUrl =
  "https://poly.pizza/m/6DOjEGKd8nx";
const sourceFile =
  "Mouse by jeremy - 6DOjEGKd8nx.glb";
const suppliedCredit =
  "Mouse by jeremy [CC-BY] via Poly Pizza";
const deterministicAssetId =
  "mouse_polyp_6dojegkd8nx";

assert.equal(
  polyPizzaModelIdFromUrl(sourceUrl),
  "6DOjEGKd8nx",
);
assert.equal(
  polyPizzaModelIdFromFileName(
    sourceFile,
  ),
  "6DOjEGKd8nx",
);
assert.deepEqual(
  parsePolyPizzaFileName(
    sourceFile,
  ),
  {
    source_asset_id:
      "6DOjEGKd8nx",
    source_title: "Mouse",
    creator_name: "jeremy",
  },
);
assert.equal(
  polyPizzaConceptFromFileName(
    sourceFile,
  ),
  "mouse",
);
assert.equal(
  polyPizzaAssetId(
    "mouse",
    "6DOjEGKd8nx",
  ),
  deterministicAssetId,
);
assert.equal(
  polyPizzaSourceUrl(
    "6DOjEGKd8nx",
  ),
  sourceUrl,
);
assert.equal(
  buildPolyPizzaAttributionText({
    sourceTitle: "Mouse",
    creatorName: "jeremy",
    licenseKind: "cc_by",
  }),
  suppliedCredit,
);
assert.equal(
  buildPolyPizzaAttributionText({
    sourceTitle: "Mouse",
    creatorName: "jeremy",
    licenseKind: "cc0",
  }),
  "Mouse by jeremy [CC0] via Poly Pizza",
);

assert.deepEqual(
  validatePolyPizzaImportDraft({
    file_name: sourceFile,
    concept: "mouse",
    source_asset_id:
      "6DOjEGKd8nx",
    source_title: "Mouse",
    creator_name: "jeremy",
    license_kind: "cc_by",
    modification_notice:
      "Normalized and processed for real-time use by MyWay.",
  }),
  [],
);

assert.ok(
  validatePolyPizzaImportDraft({
    file_name: sourceFile,
    concept: "mouse",
    source_asset_id:
      "6DOjEGKd8nx",
    source_title: "Mouse",
    creator_name: "",
    license_kind: "cc_by",
    modification_notice:
      "Normalized and processed for real-time use by MyWay.",
  }).some((error) =>
    error.includes(
      "Creator name is required",
    ),
  ),
);

const attribution = buildAssetAttribution({
  licenseKind: "cc_by",
  attributionText: suppliedCredit,
  assetTitle: "Mouse",
  creatorName: "jeremy",
  sourceProvider: "Poly Pizza",
  sourceAssetId: "6DOjEGKd8nx",
  sourceUrl,
  modificationNotice:
    "Normalized and processed for real-time use by MyWay.",
  downloadedAt: "2026-08-03",
});
assert.equal(attribution.required, true);
assert.equal(
  attribution.license_name,
  "CC BY",
);
assert.equal(
  attribution.license_version,
  null,
);
assert.deepEqual(
  attributionCompletenessIssues(
    attribution,
  ),
  [],
);

const asset: MyWayAssetRecord = {
  asset_id:
    deterministicAssetId,
  canonical_label: "mouse",
  display_name:
    deterministicAssetId,
  aliases: ["rodent"],
  semantic_tags: ["mouse", "rodent"],
  asset_type: "glb",
  domain:
    "poly_pizza_manual_intake",
  source_type: "manual",
  source_asset_id:
    "6DOjEGKd8nx",
  source_url: sourceUrl,
  public_path:
    `/sandbox-assets/myway/models/manual/${deterministicAssetId}.glb`,
  dimensions_m: [2, 1.84, 1.07],
  default_scale: 1,
  default_rotation: [0, 0, 0],
  ground_offset_m: 0,
  rigged: false,
  animation_clips: [],
  quality_score: 0.75,
  reuse_count: 0,
  license_kind: "cc_by",
  attribution,
  license_status: "recorded",
  commercial_use_allowed: true,
  raw_redistribution_allowed: true,
  safe_to_use_in_sandbox: true,
  safe_to_promote_to_app: false,
  status: "normalized",
  scene_review_status: "pending",
  created_at:
    "2026-08-04T00:00:00.000Z",
  updated_at:
    "2026-08-04T00:00:00.000Z",
};

const manifest =
  buildThirdPartyAssetManifest(
    [asset, asset],
    "2026-08-04T00:00:00.000Z",
  );
assert.equal(
  manifest.assets.length,
  1,
);
assert.equal(
  manifest.assets[0]
    ?.attribution_text,
  suppliedCredit,
);
assert.match(
  renderThirdPartyAssetLicensesText(
    manifest,
  ),
  /Mouse by jeremy \[CC-BY\] via Poly Pizza/,
);

const review: MyWayAssetLicenseReviewV1 = {
  schema_version:
    "myway_asset_license_review_v1",
  review_id:
    "mouse_review_v1",
  asset_id: asset.asset_id,
  decision:
    "approved_public_distribution",
  reviewed_by:
    "Fixture reviewer",
  reviewed_at:
    "2026-08-04T00:00:00.000Z",
  basis: [
    {
      label:
        "Poly Pizza model page",
      url: sourceUrl,
      finding:
        "The page supplied a CC BY credit.",
    },
  ],
  attestations: {
    reviewed_source_terms: true,
    production_use_allowed: true,
    public_raw_distribution_allowed: true,
    commercial_use_allowed: true,
    no_known_third_party_restrictions: true,
    generic_or_authorized_subject: true,
  },
  attribution: {
    required: true,
    text: suppliedCredit,
    license: "CC BY",
    creator_name: "jeremy",
    source_url: sourceUrl,
    source_asset_id:
      "6DOjEGKd8nx",
    modification_notice:
      attribution.modification_notice,
  },
};
assert.deepEqual(
  publicPromotionBlockers(
    asset,
    review,
  ),
  [],
);

assert.equal(
  isPolyPizzaManualLicenseCandidate(
    asset,
  ),
  true,
);
const approvedPolyPizzaReview =
  buildPolyPizzaManualLicenseReview(
    asset,
    "2026-08-05T00:00:00.000Z",
  );
assert.equal(
  approvedPolyPizzaReview.decision,
  "approved_public_distribution",
);
assert.equal(
  approvedPolyPizzaReview.attribution
    ?.text,
  suppliedCredit,
);
assert.deepEqual(
  publicPromotionBlockers(
    asset,
    approvedPolyPizzaReview,
  ),
  [],
);

const runtimeModel: RuntimeModelBindingV1 = {
  schema_version:
    RESOURCE_RUNTIME_SCHEMA_VERSION,
  resource_kind: "model",
  scene_id:
    "poly_pizza_fixture",
  intent_id: "mouse_intent",
  entity_id: "mouse_entity",
  asset_id: asset.asset_id,
  variant_id: null,
  public_url:
    asset.public_path,
  content_hash: null,
  storage_provider: "local",
  registry_snapshot_id: "fixture",
  registry_content_hash:
    "a".repeat(64),
  request_hash: "b".repeat(64),
  resolver_version: "fixture",
  resolved_at:
    "2026-08-04T00:00:00.000Z",
  fallback: null,
  license: {
    license_kind:
      asset.license_kind,
    license_status:
      asset.license_status,
    attribution_required: true,
    attribution_text:
      suppliedCredit,
    asset_title: "Mouse",
    creator_name: "jeremy",
    source_provider:
      "Poly Pizza",
    source_asset_id:
      "6DOjEGKd8nx",
    license_name: "CC BY",
    license_version: null,
    license_url: null,
    modification_notice:
      attribution.modification_notice,
    source_url: sourceUrl,
    license_record_path:
      asset.license_record_path ??
      null,
  },
};
const runtimeScene =
  buildRuntimeSceneBinding({
    scene_id:
      "poly_pizza_fixture",
    source:
      "resource_runtime_harness",
    models: [
      runtimeModel,
      {
        ...runtimeModel,
        intent_id:
          "mouse_intent_2",
        entity_id:
          "mouse_entity_2",
      },
    ],
    created_at:
      "2026-08-04T00:00:00.000Z",
  });
assert.equal(
  runtimeScene
    .third_party_assets?.length,
  1,
);
assert.equal(
  runtimeScene
    .third_party_assets?.[0]
    ?.attribution_text,
  suppliedCredit,
);

const legacyCcBy =
  normalizeMyWayAssetRecord({
    ...asset,
    asset_id:
      "legacy_hi3d_asset",
    license_kind:
      "cc_by_4_0",
    attribution: undefined,
    source_display_name:
      "Hi3D: legacy.glb",
    source_asset_id:
      "legacy.glb",
    source_url:
      "https://example.test/legacy",
    license_status: "app_ready",
    safe_to_promote_to_app: true,
    notes:
      "Attribution: Generated with Hi3D. Input and normalized GLB appearance channels were preserved.",
  });
assert.ok(legacyCcBy);
assert.equal(
  legacyCcBy
    ?.attribution
    ?.license_version,
  "4.0",
);
assert.equal(
  legacyCcBy
    ?.attribution
    ?.modification_notice,
  "Processed and normalized for real-time use by MyWay.",
);

const brokenReview = {
  ...review,
  attribution: null,
};
assert.ok(
  publicPromotionBlockers(
    asset,
    brokenReview,
  ).some((message) =>
    message.includes(
      "must explicitly require attribution",
    ),
  ),
);

assert.equal(
  MAX_MANUAL_GLB_BATCH_FILES,
  50,
);
assert.deepEqual(
  parseManualGlbFileName(
    "Wooden Chair by Alex.glb",
  ),
  {
    source_title: "Wooden Chair",
    creator_name: "Alex",
    source_asset_id:
      "wooden_chair_by_alex",
  },
);
assert.equal(
  manualConceptFromFileName(
    "Wooden Chair.glb",
  ),
  "wooden chair",
);
assert.equal(
  buildManualCcByAttributionText({
    sourceTitle: "Wooden Chair",
    creatorName: "Alex",
    sourceProvider: "Example Models",
    licenseKind: "cc_by",
  }),
  "Wooden Chair by Alex [CC-BY] via Example Models",
);
assert.deepEqual(
  validateCc0ImportDraft({
    file_name: "chair.glb",
    concept: "chair",
  }),
  [],
);
assert.deepEqual(
  validateCcByImportDraft({
    file_name: "chair.glb",
    concept: "chair",
    source_provider: "Example Models",
    source_url:
      "https://example.test/models/chair",
    source_asset_id: "chair-7",
    source_title: "Chair",
    creator_name: "Alex",
    license_kind: "cc_by",
    modification_notice:
      "Normalized by MyWay.",
  }),
  [],
);
assert.ok(
  validateCcByImportDraft({
    file_name: "chair.glb",
    concept: "chair",
    source_provider: "Poly Pizza",
    source_url:
      "https://poly.pizza/m/chair7",
    source_asset_id: "chair7",
    source_title: "Chair",
    creator_name: "Alex",
    license_kind: "cc_by",
    modification_notice:
      "Normalized by MyWay.",
  }).some((message) =>
    message.includes(
      "Turn on the Poly Pizza toggle",
    ),
  ),
);

const cc0BatchUiSource = readFileSync(
  resolve(
    process.cwd(),
    "sandbox/probe-lab/assets/ui/cc0-batch-import-lab.tsx",
  ),
  "utf8",
);
assert.match(
  cc0BatchUiSource,
  /Import CC0 GLBs or bundle ZIPs/,
);
assert.match(
  cc0BatchUiSource,
  /Import selected assets/,
);
assert.match(
  cc0BatchUiSource,
  /MAX_MANUAL_GLB_BATCH_FILES/,
);
assert.match(
  cc0BatchUiSource,
  /Add CC0 bundle ZIP/,
);
assert.match(
  cc0BatchUiSource,
  /extractCc0GlbBundleBuffer/,
);
assert.match(
  cc0BatchUiSource,
  /formData\.set\("license_kind", "cc0"\)/,
);

const ccByBatchUiSource = readFileSync(
  resolve(
    process.cwd(),
    "sandbox/probe-lab/assets/ui/cc-by-batch-import-lab.tsx",
  ),
  "utf8",
);
assert.match(
  ccByBatchUiSource,
  /Import manually downloaded CC BY GLBs/,
);
assert.match(
  ccByBatchUiSource,
  /Poly Pizza source/,
);
assert.match(
  ccByBatchUiSource,
  /polyPizzaAssetId/,
);
assert.match(
  ccByBatchUiSource,
  /Import selected assets/,
);
assert.doesNotMatch(
  ccByBatchUiSource,
  /Exact supplied attribution/,
);
assert.doesNotMatch(
  ccByBatchUiSource,
  /Paste pages and supplied credits/,
);

const libraryUiSource = readFileSync(
  resolve(
    process.cwd(),
    "sandbox/probe-lab/assets/ui/asset-library-lab.tsx",
  ),
  "utf8",
);
assert.match(
  libraryUiSource,
  /manualAcquisitionMode === "cc0"/,
);
assert.match(
  libraryUiSource,
  /manualAcquisitionMode === "cc_by"/,
);
assert.match(
  libraryUiSource,
  /<Cc0BatchImportLab/,
);
assert.match(
  libraryUiSource,
  /<CcByBatchImportLab/,
);
assert.match(
  libraryUiSource,
  /Import CC0 GLB/,
);
assert.match(
  libraryUiSource,
  /Import CC BY GLB/,
);
assert.equal(
  existsSync(
    resolve(
      process.cwd(),
      "sandbox/probe-lab/assets/ui/poly-pizza-batch-import-lab.tsx",
    ),
  ),
  false,
);
assert.equal(
  existsSync(
    resolve(
      process.cwd(),
      "app/sandbox/probe-lab/asset-library/poly-pizza/page.tsx",
    ),
  ),
  false,
);

const acquisitionReviewSource =
  readFileSync(
    resolve(
      process.cwd(),
      "sandbox/probe-lab/assets/acquisition/missing-asset-review.server.ts",
    ),
    "utf8",
  );
assert.match(
  acquisitionReviewSource,
  /buildPolyPizzaManualLicenseReview/,
);
assert.match(
  acquisitionReviewSource,
  /confirmManualLicenseReview/,
);
assert.match(
  acquisitionReviewSource,
  /reviewFile,/,
);

const acquisitionRouteSource =
  readFileSync(
    resolve(
      process.cwd(),
      "sandbox/probe-lab/assets/routes/acquisition.ts",
    ),
    "utf8",
  );
assert.match(
  acquisitionRouteSource,
  /confirm_manual_license_review/,
);

assert.match(
  libraryUiSource,
  /isPolyPizzaPublicSceneCandidate/,
);
assert.match(
  libraryUiSource,
  /confirmManualLicenseReview/,
);
assert.match(
  libraryUiSource,
  /Approve this Poly Pizza asset for scene use/,
);
assert.match(
  libraryUiSource,
  /const\s+polyPizzaPublicSceneApproval\s*=\s*asset\.storage_provider\s*!==\s*"r2"[\s\S]*?isPolyPizzaPublicSceneCandidate\(\s*asset/,
);
assert.match(
  libraryUiSource,
  /const\s+manualCc0PublicSceneApproval\s*=\s*asset\.storage_provider\s*!==\s*"r2"[\s\S]*?isManualCc0PublicSceneCandidate\(\s*asset/,
);

console.log(
  "Manual CC0 and CC BY batch tabs, Poly Pizza deterministic IDs, generated credits, confirmed public-scene approval, R2 promotion gating, and attribution export fixture passed.",
);
