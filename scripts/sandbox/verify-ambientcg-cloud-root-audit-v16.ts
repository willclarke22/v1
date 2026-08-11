import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  config,
} from "dotenv";

import {
  runAssetCloudAuthorityAudit,
} from "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server";

config({
  path: path.join(
    process.cwd(),
    ".env.local",
  ),
});

const TARGET_PREFIXES = [
  "runtime/materials/ambientcg/Metal046B/2k-jpg/",
  "runtime/materials/ambientcg/Chipboard002/2k-jpg/",
  "runtime/materials/ambientcg/Metal014/2k-jpg/",
  "runtime/materials/ambientcg/Fabric010/2k-jpg/",
  "runtime/materials/ambientcg/Fabric080/2k-jpg/",
  "runtime/materials/ambientcg/Metal063/2k-jpg/",
  "runtime/materials/ambientcg/Rubber001/2k-jpg/",
  "runtime/materials/ambientcg/Leather037/2k-jpg/",
  "runtime/materials/ambientcg/Bricks001/4k-jpg/",
  "runtime/materials/ambientcg/Asphalt008/4k-jpg/",
] as const;

function timestampSegment() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
}

async function main() {
  const audit =
    await runAssetCloudAuthorityAudit();

  const missing =
    audit.cloud_checks.filter(
      (item) =>
        item.classification ===
          "cloud_missing_local_repair_available" ||
        item.classification ===
          "cloud_missing_no_repair_source" ||
        item.classification ===
          "cloud_size_mismatch",
    );

  const targetChecks =
    TARGET_PREFIXES.map(
      (prefix) => {
        const exactFalseExpectation =
          audit.cloud_checks.filter(
            (item) =>
              item.category ===
                "ambientcg_reference" &&
              item.object_key ===
                prefix.replace(/\/$/, ""),
          );

        if (
          exactFalseExpectation.length
        ) {
          throw new Error(
            `AmbientCG public_root is still being treated as an exact R2 object: ${prefix}`,
          );
        }

        const checks =
          audit.cloud_checks.filter(
            (item) =>
              item.category ===
                "ambientcg_reference" &&
              item.object_key ===
                `${prefix}*`,
          );

        if (checks.length !== 1) {
          throw new Error(
            `Expected exactly one prefix authority check for ${prefix}; found ${checks.length}.`,
          );
        }

        const check = checks[0]!;
        if (
          check.classification !==
          "cloud_verified"
        ) {
          throw new Error(
            `AmbientCG root is not cloud-verified: ${prefix} (${check.classification}).`,
          );
        }

        if (
          !check.actual_bytes ||
          check.actual_bytes <= 0
        ) {
          throw new Error(
            `AmbientCG root has no verified child bytes: ${prefix}.`,
          );
        }

        return {
          prefix,
          classification:
            check.classification,
          verified_child_bytes:
            check.actual_bytes,
          reason: check.reason,
        };
      },
    );

  if (missing.length) {
    throw new Error(
      `v16 found ${missing.length} genuine missing/mismatched cloud check(s) after correcting AmbientCG root semantics.`,
    );
  }

  if (
    audit.reconciliation
      .missing_check_count !== 0
  ) {
    throw new Error(
      `v16 expected zero missing cloud checks, found ${audit.reconciliation.missing_check_count}.`,
    );
  }

  if (
    audit.authority_issues.length !== 0
  ) {
    throw new Error(
      `v16 found ${audit.authority_issues.length} authority/reference issue(s).`,
    );
  }

  const documents =
    path.join(
      os.homedir(),
      "Documents",
      "MyWayCleanupReports",
    );
  const reportDirectory =
    path.join(
      documents,
      `ambientcg-root-audit-v16-${timestampSegment()}`,
    );
  await mkdir(
    reportDirectory,
    { recursive: true },
  );

  const reportPath =
    path.join(
      reportDirectory,
      "ambientcg-cloud-root-audit-v16.json",
    );

  const report = {
    schema_version:
      "myway_ambientcg_cloud_root_audit_v16",
    generated_at:
      new Date().toISOString(),
    policy: {
      r2_mutated: false,
      local_assets_deleted: false,
      git_mutated: false,
      interpretation:
        "AmbientCG public_root values are directory/prefix references, not exact R2 object keys.",
    },
    target_prefixes:
      targetChecks,
    authority: {
      missing_cloud_checks:
        audit.reconciliation
          .missing_check_count,
      authority_reference_issues:
        audit.authority_issues.length,
      expected_cloud_checks:
        audit.summary
          .expected_cloud_checks,
      exact_expected_object_keys:
        audit.summary
          .exact_expected_object_keys,
      prefix_expectations:
        audit.summary
          .prefix_expectations,
      unreferenced_managed_objects:
        audit.summary
          .cloud_unreferenced_objects,
    },
  };

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
    "MyWay AmbientCG cloud-root audit v16 passed.",
  );
  console.log(
    `Verified AmbientCG directory roots: ${targetChecks.length}`,
  );
  console.log(
    `Missing cloud checks: ${audit.reconciliation.missing_check_count}`,
  );
  console.log(
    `Authority/reference issues: ${audit.authority_issues.length}`,
  );
  console.log(
    `Expected cloud checks: ${audit.summary.expected_cloud_checks}`,
  );
  console.log(
    `Exact expected object keys: ${audit.summary.exact_expected_object_keys}`,
  );
  console.log(
    `Prefix expectations: ${audit.summary.prefix_expectations}`,
  );
  console.log(
    "No R2 objects were uploaded, replaced, or deleted.",
  );
  console.log(
    `Report: ${reportPath}`,
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
