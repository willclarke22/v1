import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { config } from "dotenv";

config({
  path: path.join(
    process.cwd(),
    ".env.local",
  ),
  override: false,
});

const V14_CONFIRMATION =
  "REPAIR_EXPECTED_R2_ASSET_GAPS_V14";

function argumentValue(
  name: string,
) {
  const prefix = `--${name}=`;
  const direct = process.argv.find(
    (value) =>
      value.startsWith(prefix),
  );
  if (direct) {
    return direct.slice(prefix.length);
  }

  const index = process.argv.indexOf(
    `--${name}`,
  );
  if (
    index >= 0 &&
    process.argv[index + 1]
  ) {
    return process.argv[index + 1]!;
  }

  return null;
}

function reportRoot() {
  const configured =
    process.env.MYWAY_CLEANUP_REPORT_DIR
      ?.trim();

  return configured
    ? path.resolve(configured)
    : path.join(
        os.homedir(),
        "Documents",
        "MyWayCleanupReports",
      );
}

function missingChecks(
  audit: Awaited<
    ReturnType<
      typeof import(
        "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server"
      )["runAssetCloudAuthorityAudit"]
    >
  >,
) {
  return audit.cloud_checks.filter(
    (item) =>
      item.classification ===
        "cloud_missing_local_repair_available" ||
      item.classification ===
        "cloud_missing_no_repair_source",
  );
}

function countsByCategory(
  values: Array<{
    category: string;
  }>,
) {
  const result: Record<
    string,
    number
  > = {};
  for (const item of values) {
    result[item.category] =
      (result[item.category] ?? 0) + 1;
  }
  return result;
}

async function main() {
  const confirmation =
    argumentValue("confirmation");
  const preflightOnly =
    process.argv.includes("--preflight-only");
  if (
    confirmation !== V14_CONFIRMATION
  ) {
    throw new Error(
      `Explicit confirmation is required: --confirmation=${V14_CONFIRMATION}`,
    );
  }

  const {
    runAssetCloudAuthorityAudit,
  } = await import(
    "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server"
  );
  const {
    buildCloudGapRepairPlan,
    repairCloudGapPlan,
    PHASE3_CLOUD_GAP_REPAIR_CONFIRMATION,
  } = await import(
    "../../sandbox/probe-lab/assets/storage/asset-cloud-gap-repair.server"
  );

  const before =
    await runAssetCloudAuthorityAudit();

  if (before.authority_issues.length) {
    throw new Error(
      `v14 repair refused to run because ${before.authority_issues.length} authority/reference issue(s) are present.`,
    );
  }

  const sizeMismatches =
    before.cloud_checks.filter(
      (item) =>
        item.classification ===
        "cloud_size_mismatch",
    );
  if (sizeMismatches.length) {
    throw new Error(
      `v14 repair refused to run because ${sizeMismatches.length} R2 size mismatch(es) require review first.`,
    );
  }

  const beforeMissing =
    missingChecks(before);
  const unresolvedNonAmbient =
    before.reconciliation.items.filter(
      (item) =>
        item.preferred_recovery ===
          "unresolved" &&
        item.category !==
          "ambientcg_reference",
    );
  if (unresolvedNonAmbient.length) {
    console.error(
      "Unresolved non-AmbientCG gaps:",
    );
    for (const item of unresolvedNonAmbient) {
      console.error(
        `  ${item.category} | ${item.owner_id ?? "-"} | ${item.object_key} | ${item.reason}`,
      );
    }
    throw new Error(
      `v14 repair preflight found ${unresolvedNonAmbient.length} unresolved non-AmbientCG gap(s). Source-record identity recovery must be unambiguous before cloud mutation.`,
    );
  }

  const plan =
    await buildCloudGapRepairPlan();

  const eligiblePlanItems =
    plan.items.filter(
      (item) =>
        (item.category ===
          "analysis_render" ||
          item.category ===
            "durable_metadata") &&
        Boolean(item.object_key),
    );

  function repairPlanMatchesExpectation(
    expectedObjectKey: string,
    planObjectKey: string,
  ) {
    if (expectedObjectKey.endsWith("/*")) {
      const prefix =
        expectedObjectKey.slice(0, -1);
      return planObjectKey.startsWith(prefix);
    }
    return planObjectKey === expectedObjectKey;
  }

  const localRepairExpectations =
    before.reconciliation.items.filter(
      (item) =>
        item.preferred_recovery ===
          "local_repair",
    );

  const expectationMatches =
    localRepairExpectations.map(
      (expected) => ({
        expected,
        matches: eligiblePlanItems.filter(
          (item) =>
            Boolean(
              item.object_key &&
              repairPlanMatchesExpectation(
                expected.object_key,
                item.object_key,
              ),
            ),
        ),
      }),
    );

  const missingPlanCoverage =
    expectationMatches.filter(
      (entry) =>
        entry.matches.length === 0,
    );
  const ambiguousPlanCoverage =
    expectationMatches.filter(
      (entry) =>
        entry.matches.length > 1,
    );

  if (
    missingPlanCoverage.length ||
    ambiguousPlanCoverage.length
  ) {
    if (missingPlanCoverage.length) {
      console.error(
        "Expected local-repair gaps with no canonical repair-plan match:",
      );
      for (const { expected } of missingPlanCoverage) {
        console.error(
          `  ${expected.category} | ${expected.owner_id ?? "-"} | ${expected.object_key} | ${expected.reason}`,
        );
      }
    }
    if (ambiguousPlanCoverage.length) {
      console.error(
        "Expected local-repair gaps with multiple canonical repair-plan matches:",
      );
      for (const { expected, matches } of ambiguousPlanCoverage) {
        console.error(
          `  ${expected.category} | ${expected.owner_id ?? "-"} | ${expected.object_key} | matches=${matches
            .map((item) => item.object_key)
            .join(", ")}`,
        );
      }
    }
    throw new Error(
      `v14 repair preflight found ${missingPlanCoverage.length} missing and ${ambiguousPlanCoverage.length} ambiguous expected local-repair plan match(es). No R2 mutations were performed.`,
    );
  }

  const selected =
    expectationMatches.map(
      (entry) => entry.matches[0]!,
    );

  const selectedKeys =
    Array.from(
      new Set(
        selected
          .map((item) => item.object_key)
          .filter(
            (value): value is string =>
              Boolean(value),
          ),
      ),
    );

  if (
    selectedKeys.length !==
    localRepairExpectations.length
  ) {
    throw new Error(
      `v14 repair preflight expected one unique canonical repair-plan item per local-repair expectation, but resolved ${selectedKeys.length} object(s) for ${localRepairExpectations.length} expectation(s). No R2 mutations were performed.`,
    );
  }

  console.log(
    "MyWay v14 cloud-completeness repair preflight passed.",
  );
  console.log(
    `Missing checks before repair: ${beforeMissing.length}`,
  );
  console.log(
    `Selected canonical repair objects: ${selectedKeys.length}`,
  );
  console.log(
    `Selected repair categories: ${JSON.stringify(
      countsByCategory(selected),
    )}`,
  );
  console.log(
    "AmbientCG runtime-material gaps are intentionally excluded from v14 and remain review/rebuild-only.",
  );

  if (preflightOnly) {
    console.log(
      "v14 preflight-only mode complete. No R2 mutations were performed.",
    );
    return;
  }

  const repair =
    await repairCloudGapPlan({
      confirmation:
        PHASE3_CLOUD_GAP_REPAIR_CONFIRMATION,
      limit:
        Math.max(
          1,
          selectedKeys.length,
        ),
      categories: [
        "analysis_render",
        "durable_metadata",
      ],
      objectKeys:
        selectedKeys,
    });

  const after =
    await runAssetCloudAuthorityAudit();
  const afterMissing =
    missingChecks(after);
  const remainingNonAmbient =
    afterMissing.filter(
      (item) =>
        item.category !==
        "ambientcg_reference",
    );
  const remainingAmbient =
    afterMissing.filter(
      (item) =>
        item.category ===
        "ambientcg_reference",
    );

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const directory = path.join(
    reportRoot(),
    `cloud-repair-v14-${stamp}`,
  );
  await mkdir(
    directory,
    { recursive: true },
  );

  const report = {
    schema_version:
      "myway_asset_cloud_completeness_repair_v14",
    generated_at:
      new Date().toISOString(),
    safety: {
      deletes_local_files: false,
      deletes_r2_objects: false,
      mutates_git: false,
      repairs_expected_r2_objects_only:
        true,
      ambientcg_runtime_material_rebuild:
        false,
    },
    before: {
      missing_count:
        beforeMissing.length,
      missing_by_category:
        countsByCategory(
          beforeMissing,
        ),
      reconciliation:
        before.reconciliation,
    },
    repair: {
      selected_object_count:
        selectedKeys.length,
      selected_by_category:
        countsByCategory(selected),
      result: repair,
    },
    after: {
      missing_count:
        afterMissing.length,
      missing_by_category:
        countsByCategory(
          afterMissing,
        ),
      remaining_non_ambientcg:
        remainingNonAmbient,
      remaining_ambientcg:
        remainingAmbient,
      authority_issue_count:
        after.authority_issues.length,
      cloud_size_mismatch_count:
        after.cloud_checks.filter(
          (item) =>
            item.classification ===
              "cloud_size_mismatch",
        ).length,
      audit: after,
    },
  };

  const reportPath = path.join(
    directory,
    "asset-cloud-completeness-repair-v14.json",
  );
  await writeFile(
    reportPath,
    `${JSON.stringify(
      report,
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    "MyWay v14 cloud-completeness repair completed.",
  );
  console.log(
    `Repair results: repaired=${repair.repaired_count} failed=${repair.failed_count}`,
  );
  console.log(
    `Missing checks after repair: ${afterMissing.length}`,
  );
  console.log(
    `Remaining non-AmbientCG gaps: ${remainingNonAmbient.length}`,
  );
  console.log(
    `Remaining AmbientCG runtime-material gaps: ${remainingAmbient.length}`,
  );
  console.log(
    `Authority/reference issues after repair: ${after.authority_issues.length}`,
  );
  console.log(
    `Report: ${reportPath}`,
  );

  if (repair.failed_count > 0) {
    throw new Error(
      `v14 completed with ${repair.failed_count} failed repair operation(s). R2 may be partially repaired; do not roll back source code automatically. See ${reportPath}`,
    );
  }

  if (
    remainingNonAmbient.length > 0
  ) {
    throw new Error(
      `v14 left ${remainingNonAmbient.length} non-AmbientCG cloud gap(s). No local cleanup should run yet. See ${reportPath}`,
    );
  }

  if (
    after.authority_issues.length > 0
  ) {
    throw new Error(
      `v14 introduced or exposed ${after.authority_issues.length} authority/reference issue(s). See ${reportPath}`,
    );
  }
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.stack ??
          caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
