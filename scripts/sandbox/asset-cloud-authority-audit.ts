import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  config,
} from "dotenv";

config({
  path: path.join(
    process.cwd(),
    ".env.local",
  ),
  override: false,
});

function formatBytes(
  value: number | null | undefined,
) {
  const bytes =
    Number(value ?? 0);
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];
  let size = bytes;
  let index = 0;
  while (
    size >= 1024 &&
    index <
      units.length - 1
  ) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(
    index === 0
      ? 0
      : 2,
  )} ${units[index]}`;
}

function reportRoot() {
  const configured =
    process.env.MYWAY_CLEANUP_REPORT_DIR
      ?.trim();

  return configured
    ? path.resolve(
        configured,
      )
    : path.join(
        os.homedir(),
        "Documents",
        "MyWayCleanupReports",
      );
}

function renderMarkdown(
  audit: Awaited<
    ReturnType<
      typeof import(
        "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server"
      )["runAssetCloudAuthorityAudit"]
    >
  >,
) {
  const lines: string[] = [
    "# MyWay asset cloud-authority audit",
    "",
    `Generated: ${audit.generated_at}`,
    "",
    "## Policy",
    "",
    `- Asset metadata authority: **${audit.policy.asset_metadata_authority}**`,
    `- Runtime artifact authority: **${audit.policy.runtime_artifact_authority}**`,
    `- Normal runtime local → cloud restore: **${audit.policy.normal_runtime_local_to_cloud_restore ? "enabled" : "disabled"}**`,
    `- Deletes files: **${audit.policy.deletes_files ? "yes" : "no"}**`,
    `- Mutates Git: **${audit.policy.mutates_git ? "yes" : "no"}**`,
    "",
    "## R2 inventory",
    "",
    `- Runtime bucket: \`${audit.r2.runtime_bucket}\` — ${audit.r2.runtime_object_count} managed objects / ${formatBytes(audit.r2.runtime_bytes)}`,
    `- Source bucket: \`${audit.r2.source_bucket}\` — ${audit.r2.source_object_count} managed objects / ${formatBytes(audit.r2.source_bytes)}`,
    "",
    "## Registry",
    "",
    `- R2 registry available: ${audit.registry.available ? "yes" : "no"}`,
    `- R2 registry parseable: ${audit.registry.parseable ? "yes" : "no"}`,
    `- Asset count: ${audit.registry.asset_count ?? "unknown"}`,
    "",
    "## Cloud classification summary",
    "",
  ];

  const cloudEntries =
    Object.entries(
      audit.summary.cloud,
    ).sort(
      (left, right) =>
        right[1] -
        left[1],
    );
  if (!cloudEntries.length) {
    lines.push("- None.");
  } else {
    for (const [
      classification,
      count,
    ] of cloudEntries) {
      lines.push(
        `- **${classification}**: ${count}`,
      );
    }
  }

  lines.push(
    "",
    "## Local classification summary",
    "",
  );

  const localEntries =
    Object.entries(
      audit.summary.local,
    ).sort(
      (left, right) =>
        right[1] -
        left[1],
    );
  if (!localEntries.length) {
    lines.push("- None.");
  } else {
    for (const [
      classification,
      count,
    ] of localEntries) {
      lines.push(
        `- **${classification}**: ${count}`,
      );
    }
  }

  lines.push(
    "",
    "## Cloud gaps and mismatches",
    "",
  );

  const cloudProblems =
    audit.cloud_checks.filter(
      (item) =>
        item.classification !==
          "cloud_verified" &&
        item.classification !==
          "cloud_unreferenced_managed_object",
    );

  if (!cloudProblems.length) {
    lines.push(
      "No expected R2 objects are missing or size-mismatched.",
    );
  } else {
    for (const item of
      cloudProblems.slice(
        0,
        300,
      )) {
      lines.push(
        `- **${item.classification}** — \`${item.bucket}:${item.object_key}\` — ${item.category}${item.owner_id ? ` — ${item.owner_id}` : ""} — ${item.reason}`,
      );
    }
    if (
      cloudProblems.length >
      300
    ) {
      lines.push(
        `- … ${cloudProblems.length - 300} additional cloud problems are present in the JSON report.`,
      );
    }
  }

  lines.push(
    "",
    "## Authority/reference issues",
    "",
  );

  if (
    !audit.authority_issues
      .length
  ) {
    lines.push(
      "No authority/reference issues were detected.",
    );
  } else {
    for (const item of
      audit.authority_issues) {
      lines.push(
        `- **${item.classification}** — ${item.category}${item.owner_id ? ` — ${item.owner_id}` : ""} — ${item.detail}`,
      );
    }
  }

  lines.push(
    "",
    "## Git-tracked generated mirrors",
    "",
  );

  const tracked =
    audit.local_items.filter(
      (item) =>
        item.classification ===
        "git_tracked_generated_mirror",
    );
  if (!tracked.length) {
    lines.push(
      "None detected.",
    );
  } else {
    for (const item of
      tracked.slice(
        0,
        300,
      )) {
      lines.push(
        `- **${formatBytes(item.bytes)}** — \`${item.project_path}\` — ${item.category} — ${item.reason}`,
      );
    }
    if (tracked.length > 300) {
      lines.push(
        `- … ${tracked.length - 300} additional tracked mirrors are present in the JSON report.`,
      );
    }
  }

  lines.push(
    "",
    "## Verified local duplicates",
    "",
  );

  const removable =
    audit.local_items.filter(
      (item) =>
        item.classification ===
        "local_duplicate_safe_to_remove",
    );
  if (!removable.length) {
    lines.push(
      "None detected.",
    );
  } else {
    for (const item of
      removable.slice(
        0,
        300,
      )) {
      lines.push(
        `- **${formatBytes(item.bytes)}** — \`${item.project_path}\` — ${item.category}`,
      );
    }
    if (
      removable.length >
      300
    ) {
      lines.push(
        `- … ${removable.length - 300} additional verified local duplicates are present in the JSON report.`,
      );
    }
  }

  lines.push(
    "",
    "## Unreferenced managed R2 objects",
    "",
  );

  const unreferenced =
    audit.cloud_checks.filter(
      (item) =>
        item.classification ===
        "cloud_unreferenced_managed_object",
    );

  if (!unreferenced.length) {
    lines.push(
      "None detected.",
    );
  } else {
    for (const item of
      unreferenced.slice(
        0,
        300,
      )) {
      lines.push(
        `- **${formatBytes(item.actual_bytes)}** — \`${item.bucket}:${item.object_key}\``,
      );
    }
    if (
      unreferenced.length >
      300
    ) {
      lines.push(
        `- … ${unreferenced.length - 300} additional unreferenced cloud objects are present in the JSON report.`,
      );
    }
  }

  lines.push(
    "",
    "## Reconciliation plan",
    "",
    `- Exact expected object keys checked directly: **${audit.summary.exact_expected_object_keys}**`,
    `- Prefix expectations (analysis views): **${audit.summary.prefix_expectations}**`,
    `- Total expected checks: **${audit.summary.expected_cloud_checks}**`,
    `- Existing cloud-gap repair plan coverage: **${audit.reconciliation.existing_gap_repair_plan_covered}** missing checks`,
    `- Local repair sources not covered by the existing repair planner: **${audit.reconciliation.local_repair_not_covered_count}**`,
    `- Unreferenced source-bucket candidates scanned: **${audit.reconciliation.unreferenced_source_candidates_scanned}**`,
    "",
    "### Preferred recovery paths",
    "",
  );

  const recoveryEntries =
    Object.entries(
      audit.reconciliation
        .recovery_summary,
    ).sort(
      (left, right) =>
        right[1] - left[1],
    );
  if (!recoveryEntries.length) {
    lines.push("- None.");
  } else {
    for (const [strategy, count] of
      recoveryEntries) {
      lines.push(
        `- **${strategy}**: ${count}`,
      );
    }
  }

  const cloudRekeys =
    audit.reconciliation.items.filter(
      (item) =>
        item.preferred_recovery ===
          "legacy_r2_rekey" ||
        item.preferred_recovery ===
          "manual_review",
    );
  if (cloudRekeys.length) {
    lines.push(
      "",
      "### Legacy R2 reconciliation candidates",
      "",
    );
    for (const item of
      cloudRekeys.slice(0, 200)) {
      lines.push(
        `- **${item.preferred_recovery}** — \`${item.bucket}:${item.object_key}\` — ${item.category}${item.owner_id ? ` — ${item.owner_id}` : ""} — candidates: ${item.legacy_r2_candidates.map((key) => `\`${key}\``).join(", ") || "none"}`,
      );
    }
    if (cloudRekeys.length > 200) {
      lines.push(
        `- … ${cloudRekeys.length - 200} additional reconciliation candidates are present in the JSON report.`,
      );
    }
  }

  if (
    audit.reconciliation
      .local_repair_not_covered_count
  ) {
    lines.push(
      "",
      "### Repairable local gaps not covered by the existing repair planner",
      "",
    );
    for (const item of
      audit.reconciliation
        .local_repair_not_covered
        .slice(0, 200)) {
      lines.push(
        `- \`${item.bucket}:${item.object_key}\` — ${item.category}${item.owner_id ? ` — ${item.owner_id}` : ""}`,
      );
    }
  }

  lines.push(
    "",
    "## Safety",
    "",
    "This audit is read-only. It does not delete local files, delete R2 objects, change Git tracking, or repair cloud gaps. Cloud repairs and local cleanup remain explicit later steps.",
    "",
  );

  return `${lines.join(
    "\n",
  )}\n`;
}

async function main() {
  const {
    runAssetCloudAuthorityAudit,
  } = await import(
    "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server"
  );

  const audit =
    await runAssetCloudAuthorityAudit();

  const stamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        "-",
      );
  const directory =
    path.join(
      reportRoot(),
      `cloud-authority-${stamp}`,
    );

  await mkdir(
    directory,
    {
      recursive:
        true,
    },
  );

  const jsonPath =
    path.join(
      directory,
      "asset-cloud-authority-audit.json",
    );
  const markdownPath =
    path.join(
      directory,
      "asset-cloud-authority-audit.md",
    );

  await Promise.all([
    writeFile(
      jsonPath,
      `${JSON.stringify(
        audit,
        null,
        2,
      )}\n`,
      "utf8",
    ),
    writeFile(
      markdownPath,
      renderMarkdown(
        audit,
      ),
      "utf8",
    ),
  ]);

  const cloudMissing =
    (audit.summary.cloud
      .cloud_missing_local_repair_available ??
      0) +
    (audit.summary.cloud
      .cloud_missing_no_repair_source ??
      0);
  const mismatches =
    audit.summary.cloud
      .cloud_size_mismatch ??
    0;
  const trackedMirrors =
    audit.summary.local
      .git_tracked_generated_mirror ??
    0;
  const safeDuplicates =
    audit.summary.local
      .local_duplicate_safe_to_remove ??
    0;

  console.log(
    "MyWay asset cloud-authority audit complete.",
  );
  console.log(
    `R2 runtime: ${audit.r2.runtime_object_count} managed objects / ${formatBytes(audit.r2.runtime_bytes)}`,
  );
  console.log(
    `R2 source: ${audit.r2.source_object_count} managed objects / ${formatBytes(audit.r2.source_bytes)}`,
  );
  console.log(
    `Exact expected object keys: ${audit.summary.exact_expected_object_keys}`,
  );
  console.log(
    `Analysis-prefix expectations: ${audit.summary.prefix_expectations}`,
  );
  console.log(
    `Total expected checks: ${audit.summary.expected_cloud_checks}`,
  );
  console.log(
    `Missing expected cloud objects: ${cloudMissing}`,
  );
  console.log(
    `Legacy R2 re-key candidates: ${audit.reconciliation.recovery_summary.legacy_r2_rekey ?? 0}`,
  );
  console.log(
    `Ambiguous legacy R2 matches: ${audit.reconciliation.recovery_summary.manual_review ?? 0}`,
  );
  console.log(
    `Missing checks covered by current repair planner: ${audit.reconciliation.existing_gap_repair_plan_covered}`,
  );
  console.log(
    `Local repair gaps not covered by current repair planner: ${audit.reconciliation.local_repair_not_covered_count}`,
  );
  console.log(
    `Still unresolved after reconciliation: ${audit.reconciliation.recovery_summary.unresolved ?? 0}`,
  );
  console.log(
    `Cloud size mismatches: ${mismatches}`,
  );
  console.log(
    `Unreferenced managed cloud objects: ${audit.summary.cloud_unreferenced_objects}`,
  );
  console.log(
    `Git-tracked generated mirrors: ${trackedMirrors}`,
  );
  console.log(
    `Verified local duplicates safe for a later explicit cleanup: ${safeDuplicates}`,
  );
  console.log(
    `JSON report: ${jsonPath}`,
  );
  console.log(
    `Markdown report: ${markdownPath}`,
  );
}

main().catch(
  (caught) => {
    console.error(
      caught instanceof Error
        ? caught.stack ??
          caught.message
        : String(caught),
    );
    process.exitCode = 1;
  },
);
