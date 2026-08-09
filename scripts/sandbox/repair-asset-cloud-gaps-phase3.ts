import {
  buildCloudGapRepairPlan,
  PHASE3_CLOUD_GAP_REPAIR_CONFIRMATION,
  repairCloudGapPlan,
  type CloudGapRepairCategory,
} from "../../sandbox/probe-lab/assets/storage/asset-cloud-gap-repair.server";

function numberArg(
  name: string,
  fallback: number,
) {
  const prefix = `--${name}=`;
  const raw = process.argv.find(
    (value) => value.startsWith(prefix),
  );
  if (!raw) return fallback;
  const parsed = Number(
    raw.slice(prefix.length),
  );
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function categoriesArg() {
  const prefix = "--categories=";
  const raw = process.argv.find(
    (value) => value.startsWith(prefix),
  );
  if (!raw) return undefined;
  return raw
    .slice(prefix.length)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) as CloudGapRepairCategory[];
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

function printPlan(
  plan: Awaited<
    ReturnType<typeof buildCloudGapRepairPlan>
  >,
) {
  console.log(
    "MyWay Phase 3 cloud-gap repair",
  );
  console.log(
    `Repairable cloud gaps: ${plan.summary.items} file(s), ${formatBytes(plan.summary.bytes)}`,
  );
  for (const [category, summary] of
    Object.entries(
      plan.summary.by_category,
    )) {
    console.log(
      `  ${category}: ${summary.items} file(s), ${formatBytes(summary.bytes)}`,
    );
  }
}

async function main() {
  const apply =
    process.argv.includes("--apply");
  const confirmationArg =
    process.argv.find((value) =>
      value.startsWith("--confirm="),
    );
  const confirmation =
    confirmationArg?.slice(
      "--confirm=".length,
    ) ?? "";
  const limit = Math.max(
    1,
    Math.floor(
      numberArg("limit", 10),
    ),
  );
  const categories = categoriesArg();

  if (!apply) {
    const plan =
      await buildCloudGapRepairPlan();
    printPlan(plan);
    console.log("");
    console.log(
      "Dry run only. No R2 objects or registry records were changed.",
    );
    console.log(
      `Apply a verified repair batch with --apply --confirm=${PHASE3_CLOUD_GAP_REPAIR_CONFIRMATION} --limit=${limit}`,
    );
    return;
  }

  if (
    confirmation !==
    PHASE3_CLOUD_GAP_REPAIR_CONFIRMATION
  ) {
    throw new Error(
      `Apply mode requires --confirm=${PHASE3_CLOUD_GAP_REPAIR_CONFIRMATION}`,
    );
  }

  const result = await repairCloudGapPlan({
    confirmation,
    limit,
    categories,
  });
  printPlan(result.before);
  console.log("");
  for (const item of result.results) {
    console.log(
      `${item.status.toUpperCase()}: ${item.category} ${item.asset_id ?? ""} ${item.local_path}`,
    );
    if (item.error) {
      console.log(`  ${item.error}`);
    }
  }
  console.log("");
  console.log(
    `Batch result: repaired/verified=${result.repaired_count}, failed=${result.failed_count}`,
  );
  console.log(
    `Remaining repairable gaps: ${result.after.summary.items} file(s), ${formatBytes(result.after.summary.bytes)}`,
  );
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.stack ?? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
