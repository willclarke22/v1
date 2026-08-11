import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

import {
  runAssetCloudAuthorityAudit,
} from "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server";
import {
  auditHistoricalLocalAssetStorage,
  phase3ApplyConfirmation,
  runHistoricalLocalAssetCleanup,
  type Phase3CleanupAudit,
  type Phase3CleanupItem,
} from "../../sandbox/probe-lab/assets/storage/asset-historical-cleanup.server";

loadDotenv({
  path: path.join(process.cwd(), ".env.local"),
});

const V18_CONFIRMATION =
  "DELETE_VERIFIED_LEGACY_IDENTITY_DUPLICATES_V18";

const TARGET_CATEGORIES = new Set<Phase3CleanupItem["category"]>([
  "runtime_model_copy",
  "thumbnail_copy",
  "source_copy",
]);

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
    preflightOnly: args.includes("--preflight-only"),
    confirmation:
      args.find((arg) => arg.startsWith("--confirmation="))
        ?.slice("--confirmation=".length) ?? null,
  };
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function gitTrackingIsBlocking(item: Phase3CleanupItem) {
  return item.verifications.some(
    (verification) =>
      verification.kind === "git_tracking" && verification.ok === false,
  );
}

function hasVerifiedLegacyIdentity(item: Phase3CleanupItem) {
  return item.verifications.some(
    (verification) =>
      verification.kind === "legacy_identity" && verification.ok === true,
  );
}

function legacySafeItems(audit: Phase3CleanupAudit) {
  return audit.items.filter(
    (item) =>
      TARGET_CATEGORIES.has(item.category) &&
      item.classification === "safe_to_remove" &&
      !gitTrackingIsBlocking(item) &&
      hasVerifiedLegacyIdentity(item),
  );
}

function remainingUntrackedTargetNeedsReview(audit: Phase3CleanupAudit) {
  return audit.items.filter(
    (item) =>
      TARGET_CATEGORIES.has(item.category) &&
      item.classification === "needs_review" &&
      !gitTrackingIsBlocking(item),
  );
}

function summarize(items: Phase3CleanupItem[]) {
  return {
    item_count: items.length,
    file_count: items.reduce((sum, item) => sum + item.file_count, 0),
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  };
}

function categorySummary(items: Phase3CleanupItem[]) {
  return items.reduce<Record<string, {
    item_count: number;
    file_count: number;
    bytes: number;
  }>>((summary, item) => {
    const current = summary[item.category] ??= {
      item_count: 0,
      file_count: 0,
      bytes: 0,
    };
    current.item_count += 1;
    current.file_count += item.file_count;
    current.bytes += item.bytes;
    return summary;
  }, {});
}

function assertCloudClean(
  audit: Awaited<ReturnType<typeof runAssetCloudAuthorityAudit>>,
  label: string,
) {
  const missing = audit.reconciliation.missing_check_count;
  const issues = audit.summary.issues;
  const sizeMismatches = audit.cloud_checks.filter(
    (item) => item.classification === "cloud_size_mismatch",
  );
  if (missing !== 0 || issues !== 0 || sizeMismatches.length !== 0) {
    throw new Error(
      `${label} cloud-authority gate failed: missing=${missing}, ` +
        `authority_issues=${issues}, size_mismatches=${sizeMismatches.length}. ` +
        "No legacy local cleanup is allowed until R2 authority is fully clean.",
    );
  }
  return {
    missing,
    issues,
    size_mismatches: sizeMismatches.length,
  };
}

async function reportDirectory() {
  const base = path.join(
    os.homedir(),
    "Documents",
    "MyWayCleanupReports",
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.join(base, `legacy-identity-cleanup-v18-${stamp}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

async function writeReport(name: string, value: unknown) {
  const directory = await reportDirectory();
  const reportPath = path.join(directory, name);
  await writeFile(
    reportPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  return reportPath;
}

async function main() {
  const args = parseArgs();
  if (args.apply && args.confirmation !== V18_CONFIRMATION) {
    throw new Error(
      `v18 apply requires --confirmation=${V18_CONFIRMATION}. No local files were deleted.`,
    );
  }

  console.log("Running v18 strict cloud-authority gate...");
  const cloudBefore = await runAssetCloudAuthorityAudit();
  const cloudGateBefore = assertCloudClean(cloudBefore, "Before v18");
  console.log(
    `Cloud gate passed: missing=${cloudGateBefore.missing}, ` +
      `authority_issues=${cloudGateBefore.issues}, ` +
      `size_mismatches=${cloudGateBefore.size_mismatches}.`,
  );

  const phase3Before = await auditHistoricalLocalAssetStorage();
  const selected = legacySafeItems(phase3Before);
  const remainingBefore = remainingUntrackedTargetNeedsReview(phase3Before);
  const selectedSummary = summarize(selected);
  const remainingBeforeSummary = summarize(remainingBefore);

  console.log("MyWay v18 legacy-identity cleanup preflight passed.");
  console.log(
    `Verified legacy-identity duplicates: ${selectedSummary.item_count} item(s), ` +
      `${selectedSummary.file_count} file(s), ${formatBytes(selectedSummary.bytes)}.`,
  );
  console.log(
    `Untracked target items still unresolved before cleanup: ` +
      `${remainingBeforeSummary.item_count} item(s), ${formatBytes(remainingBeforeSummary.bytes)}.`,
  );

  const preflightReport = await writeReport(
    args.apply
      ? "legacy-identity-cleanup-v18-before-apply.json"
      : "legacy-identity-cleanup-v18-preflight.json",
    {
      schema_version: "myway_legacy_identity_cleanup_v18",
      mode: args.apply ? "apply_preflight" : "preflight",
      generated_at: new Date().toISOString(),
      cloud_gate: cloudGateBefore,
      selected_summary: selectedSummary,
      selected_by_category: categorySummary(selected),
      selected: selected.map((item) => ({
        id: item.id,
        category: item.category,
        project_path: item.project_path,
        bytes: item.bytes,
        asset_id: item.asset_id ?? null,
        reason: item.reason,
        verifications: item.verifications,
      })),
      remaining_untracked_target_needs_review_summary: remainingBeforeSummary,
      remaining_untracked_target_needs_review: remainingBefore.map((item) => ({
        category: item.category,
        project_path: item.project_path,
        bytes: item.bytes,
        asset_id: item.asset_id ?? null,
        reason: item.reason,
        verifications: item.verifications,
      })),
    },
  );
  console.log(`Preflight report: ${preflightReport}`);

  if (!args.apply || args.preflightOnly) {
    console.log("v18 preflight-only mode complete. No local files were deleted.");
    return;
  }

  if (selected.length === 0) {
    console.log("No verified legacy-identity duplicates require deletion. Nothing was changed.");
    return;
  }

  console.log("Starting targeted Phase-3 deletion for v18-selected item IDs only...");
  const cleanup = await runHistoricalLocalAssetCleanup({
    apply: true,
    confirmation: phase3ApplyConfirmation(),
    item_ids: selected.map((item) => item.id),
  });

  const deletedSet = new Set(cleanup.deleted.paths);
  const expectedPaths = selected.map((item) => item.project_path);
  const missingDeletes = expectedPaths.filter((item) => !deletedSet.has(item));
  if (missingDeletes.length) {
    throw new Error(
      `v18 targeted cleanup did not delete ${missingDeletes.length} selected path(s): ` +
        missingDeletes.join(", "),
    );
  }

  console.log("Re-running strict cloud-authority gate after v18 deletion...");
  const cloudAfter = await runAssetCloudAuthorityAudit();
  const cloudGateAfter = assertCloudClean(cloudAfter, "After v18");

  const phase3After = cleanup.after ?? await auditHistoricalLocalAssetStorage();
  const remainingAfter = remainingUntrackedTargetNeedsReview(phase3After);
  const remainingAfterSummary = summarize(remainingAfter);

  const appliedReport = await writeReport(
    "legacy-identity-cleanup-v18-applied.json",
    {
      schema_version: "myway_legacy_identity_cleanup_v18",
      mode: "apply",
      generated_at: new Date().toISOString(),
      cloud_before: cloudGateBefore,
      cloud_after: cloudGateAfter,
      selected_summary: selectedSummary,
      selected_by_category: categorySummary(selected),
      phase3_cleanup_report: cleanup.json_report_path,
      deleted: cleanup.deleted,
      remaining_untracked_target_needs_review_summary: remainingAfterSummary,
      remaining_untracked_target_needs_review: remainingAfter.map((item) => ({
        category: item.category,
        project_path: item.project_path,
        bytes: item.bytes,
        asset_id: item.asset_id ?? null,
        reason: item.reason,
        verifications: item.verifications,
      })),
    },
  );

  console.log("MyWay v18 legacy-identity cleanup completed.");
  console.log(
    `Deleted: ${cleanup.deleted.item_count} item(s), ${cleanup.deleted.file_count} file(s), ` +
      `${formatBytes(cleanup.deleted.bytes)}.`,
  );
  console.log(
    `Cloud after cleanup: missing=${cloudGateAfter.missing}, ` +
      `authority_issues=${cloudGateAfter.issues}, size_mismatches=${cloudGateAfter.size_mismatches}.`,
  );
  console.log(
    `Remaining untracked runtime/thumbnail/source needs-review items: ` +
      `${remainingAfterSummary.item_count} item(s), ${formatBytes(remainingAfterSummary.bytes)}.`,
  );
  console.log(`Report: ${appliedReport}`);
  console.log("Git tracking and R2 objects were not mutated.");
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.stack ?? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
