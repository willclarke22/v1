import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  needsReviewMissingEnrichmentMode,
} from "../../sandbox/probe-lab/assets/enrichment/needs-review-enrichment-policy";
import type { MyWayAssetRecord } from "../../sandbox/probe-lab/assets/asset-types";

function canonicalAssetTypeCompatibility(asset: MyWayAssetRecord) {
  return needsReviewMissingEnrichmentMode(asset);
}
void canonicalAssetTypeCompatibility;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function asset(input: Partial<{
  asset_type: string;
  status: string;
  scene_review_status: string;
  vision_status: string | null;
  embedding_status: string | null;
  vector_key: string | null;
}> = {}) {
  return {
    asset_type: input.asset_type ?? "glb",
    status: input.status ?? "normalized",
    scene_review_status: input.scene_review_status ?? "pending",
    appearance_profile:
      input.vision_status === null
        ? null
        : { status: input.vision_status ?? "pending" },
    appearance_embedding:
      input.embedding_status === null
        ? null
        : {
            status: input.embedding_status ?? "pending",
            vector_key: input.vector_key ?? null,
          },
  };
}

assert(
  needsReviewMissingEnrichmentMode(
    asset({ vision_status: "pending", embedding_status: "pending" }),
  ) === "full",
  "Needs Review assets missing vision must run the full vision→embedding path.",
);
assert(
  needsReviewMissingEnrichmentMode(
    asset({ vision_status: "failed", embedding_status: "failed" }),
  ) === "full",
  "Failed Needs Review vision must be retryable through full enrichment.",
);
assert(
  needsReviewMissingEnrichmentMode(
    asset({
      vision_status: "ready",
      embedding_status: "pending",
    }),
  ) === "embedding_only",
  "Vision-ready assets with pending embeddings must use embedding-only refresh.",
);
assert(
  needsReviewMissingEnrichmentMode(
    asset({
      vision_status: "ready",
      embedding_status: "failed",
    }),
  ) === "embedding_only",
  "Vision-ready assets with failed embeddings must use embedding-only refresh.",
);
assert(
  needsReviewMissingEnrichmentMode(
    asset({
      vision_status: "ready",
      embedding_status: "ready",
      vector_key: null,
    }),
  ) === "embedding_only",
  "A ready embedding without a durable vector key must be regenerated.",
);
assert(
  needsReviewMissingEnrichmentMode(
    asset({
      vision_status: "ready",
      embedding_status: "ready",
      vector_key: "sandbox/probe-lab/assets/embeddings/example.json",
    }),
  ) === null,
  "Complete Needs Review enrichment must be skipped.",
);
assert(
  needsReviewMissingEnrichmentMode(
    asset({
      scene_review_status: "approved",
      vision_status: "pending",
      embedding_status: "pending",
    }),
  ) === null,
  "Approved assets must be outside the Needs Review enrichment backfill.",
);
assert(
  needsReviewMissingEnrichmentMode(
    asset({
      status: "rejected",
      vision_status: "pending",
      embedding_status: "pending",
    }),
  ) === null,
  "Rejected assets must be outside the Needs Review enrichment backfill.",
);
assert(
  needsReviewMissingEnrichmentMode(
    asset({
      asset_type: "primitive",
      vision_status: "pending",
      embedding_status: "pending",
    }),
  ) === null,
  "Primitive rows must never enter provider-backed Needs Review enrichment.",
);

const worker = source(
  "sandbox/probe-lab/assets/enrichment/asset-enrichment-worker.server.ts",
);
for (const marker of [
  "queueNeedsReviewMissingEnrichment",
  'asset.scene_review_status === "pending"',
  "needsReviewMissingEnrichmentMode(asset)",
  'mode === "embedding_only"',
  "queueAssetEmbeddingRefresh(asset.asset_id)",
  "queueAssetEnrichment(asset.asset_id, {",
  "runEmbedding: true",
  'entry.mode === "vision_only"',
  '"The asset file is missing."',
]) {
  assert(worker.includes(marker), `Needs Review worker integration missing: ${marker}`);
}

const route = source("sandbox/probe-lab/assets/routes/enrichment.ts");
assert(
  route.includes('action === "backfill_needs_review_missing"') &&
    route.includes("queueNeedsReviewMissingEnrichment()"),
  "Enrichment API is missing the targeted Needs Review backfill action.",
);

const script = source(
  "sandbox/probe-lab/assets/scripts/analyze-needs-review-missing-enrichment.ps1",
);
for (const marker of [
  'action = "backfill_needs_review_missing"',
  "Needs Review",
  "vision+embedding",
  "embedding-only",
  "Keep the local Next.js server running",
  "awaiting-status",
]) {
  assert(script.includes(marker), `Needs Review PowerShell script missing: ${marker}`);
}
assert(
  !script.includes('action = "enrich_all"'),
  "Targeted Needs Review script must not call the broad enrich_all action.",
);

const broadScript = source(
  "sandbox/probe-lab/assets/scripts/analyze-all-existing-assets.ps1",
);
assert(
  broadScript.includes('action = "enrich_all"'),
  "Existing broad Analyze all assets maintenance command must remain intact.",
);

const readme = source("sandbox/probe-lab/assets/enrichment/README.md");
assert(
  readme.includes("Backfill only incomplete Needs Review enrichment") &&
    readme.includes("analyze-needs-review-missing-enrichment.ps1") &&
    readme.includes("vector_key"),
  "Asset enrichment README is missing targeted Needs Review backfill documentation.",
);

console.log("Asset Library Needs Review enrichment backfill verification passed.");
console.log(
  "Pending review assets now queue only the provider work they lack: missing vision uses full vision→embedding enrichment, while vision-ready assets with missing/failed durable embeddings use embedding-only refresh.",
);
