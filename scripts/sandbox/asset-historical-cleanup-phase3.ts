import {
  phase3ApplyConfirmation,
  runHistoricalLocalAssetCleanup,
} from "../../sandbox/probe-lab/assets/storage/asset-historical-cleanup.server";

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function argumentValue(prefix: string) {
  const match = process.argv.slice(2).find((value) =>
    value.startsWith(`${prefix}=`),
  );
  return match ? match.slice(prefix.length + 1) : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmation = argumentValue("--confirm");

  if (process.argv.includes("--help")) {
    console.log(`MyWay Phase 3 historical local asset cleanup\n\nDry run:\n  pnpm exec tsx scripts/sandbox/asset-historical-cleanup-phase3.ts\n\nApply verified-safe cleanup:\n  pnpm exec tsx scripts/sandbox/asset-historical-cleanup-phase3.ts --apply --confirm=${phase3ApplyConfirmation()}\n\nThe tool always performs a fresh R2/Git/job-state audit before apply mode and writes its reports outside the repository.`);
    return;
  }

  const result = await runHistoricalLocalAssetCleanup({
    apply,
    confirmation,
  });

  const before = result.before.summary;
  console.log("\nMyWay Phase 3 historical local asset cleanup");
  console.log(`Mode: ${result.mode}`);
  console.log(`SAFE TO REMOVE: ${before.safe_to_remove.item_count} item(s), ${before.safe_to_remove.file_count} file(s), ${formatBytes(before.safe_to_remove.bytes)}`);
  console.log(`KEEP: ${before.keep.item_count} item(s), ${before.keep.file_count} file(s), ${formatBytes(before.keep.bytes)}`);
  console.log(`NEEDS REVIEW: ${before.needs_review.item_count} item(s), ${before.needs_review.file_count} file(s), ${formatBytes(before.needs_review.bytes)}`);

  if (result.mode === "apply") {
    console.log(`Deleted: ${result.deleted.item_count} item(s), ${result.deleted.file_count} file(s), ${formatBytes(result.deleted.bytes)}`);
    if (result.after) {
      console.log(`Remaining verified-safe duplication: ${formatBytes(result.after.summary.safe_to_remove.bytes)}`);
    }
  }

  console.log(`JSON report: ${result.json_report_path}`);
  console.log(`Markdown report: ${result.markdown_report_path}`);
}

main().catch((caught) => {
  console.error(
    caught instanceof Error ? caught.stack ?? caught.message : String(caught),
  );
  process.exitCode = 1;
});
