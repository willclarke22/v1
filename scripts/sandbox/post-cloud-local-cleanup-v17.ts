import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

import {
  runAssetCloudAuthorityAudit,
} from "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server";
import {
  phase3ApplyConfirmation,
  runHistoricalLocalAssetCleanup,
  type Phase3CleanupAudit,
  type Phase3CleanupItem,
} from "../../sandbox/probe-lab/assets/storage/asset-historical-cleanup.server";

loadDotenv({
  path: path.join(process.cwd(), ".env.local"),
});

const V17_CONFIRMATION =
  "DELETE_VERIFIED_POST_CLOUD_LOCAL_DUPLICATES_V17";

const PROTECTED_TOP_LEVEL_PREFIXES = [
  "models/",
  "datasets/",
  "assets/",
  ".git/",
  ".myway-patch-backups/",
  "archive/",
] as const;

const HOUSEKEEPING_PATHS = [
  ".myway-patch-backups",
  "archive/structure-snapshots",
  "sandbox/probe-lab/assets/debug",
] as const;

const ROOT_HOUSEKEEPING_FILE_NAMES = new Set([
  "myway-sandbox-all-files-one-notepad.txt",
  "myway-sandbox-active-files-one-notepad.txt",
  "scripts-assets-dump.txt",
  "visual-experience-context.txt",
]);

function normalizeProjectPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
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

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const preflightOnly = args.includes("--preflight-only");
  const confirmation =
    args.find((arg) => arg.startsWith("--confirmation="))
      ?.slice("--confirmation=".length) ?? null;
  return {
    apply,
    preflightOnly,
    confirmation,
  };
}

function assertCloudClean(
  audit: Awaited<ReturnType<typeof runAssetCloudAuthorityAudit>>,
  label: string,
) {
  const missing = audit.reconciliation.missing_check_count;
  const issues = audit.summary.issues;
  if (missing !== 0 || issues !== 0) {
    throw new Error(
      `${label} cloud-authority gate failed: missing=${missing}, authority_issues=${issues}. ` +
        "No local cleanup is allowed until R2 authority is clean.",
    );
  }
}

function summarizePhase3(audit: Phase3CleanupAudit) {
  return {
    safe_to_remove: audit.summary.safe_to_remove,
    needs_review: audit.summary.needs_review,
    keep: audit.summary.keep,
    git_tracking_available: audit.git_tracking_available,
    local_metadata_mirror_enabled: audit.local_metadata_mirror_enabled,
    active_blenderkit_job_count: audit.active_blenderkit_job_count,
    unreadable_active_blender_job_count:
      audit.unreadable_active_blender_job_count,
  };
}

function gitTrackingIsBlocking(item: Phase3CleanupItem) {
  return item.verifications.some(
    (verification) =>
      verification.kind === "git_tracking" && verification.ok === false,
  );
}

function nonGitVerificationsAllPass(item: Phase3CleanupItem) {
  const checks = item.verifications.filter(
    (verification) => verification.kind !== "git_tracking",
  );
  return checks.length > 0 && checks.every((verification) => verification.ok === true);
}

function policyBlocksTrackedCleanup(
  audit: Phase3CleanupAudit,
  item: Phase3CleanupItem,
) {
  if (!audit.local_metadata_mirror_enabled) {
    return false;
  }
  return (
    item.category === "durable_metadata_copy" ||
    item.category === "foundry_candidate_mirror"
  );
}

function trackedCandidateManifest(audit: Phase3CleanupAudit) {
  const tracked = audit.items.filter(gitTrackingIsBlocking);
  const candidates = tracked.filter(
    (item) =>
      nonGitVerificationsAllPass(item) &&
      !policyBlocksTrackedCleanup(audit, item),
  );
  const blocked = tracked.filter((item) => !candidates.includes(item));

  const summarize = (items: Phase3CleanupItem[]) => ({
    item_count: items.length,
    file_count: items.reduce((sum, item) => sum + item.file_count, 0),
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  });

  const categorySummary = candidates.reduce<Record<string, {
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

  return {
    candidate_summary: summarize(candidates),
    blocked_summary: summarize(blocked),
    category_summary: categorySummary,
    candidates: candidates.map((item) => ({
      category: item.category,
      project_path: item.project_path,
      bytes: item.bytes,
      file_count: item.file_count,
      asset_id: item.asset_id ?? null,
      candidate_id: item.candidate_id ?? null,
      source_job_id: item.source_job_id ?? null,
      non_git_verifications: item.verifications
        .filter((verification) => verification.kind !== "git_tracking")
        .map((verification) => ({
          kind: verification.kind,
          ok: verification.ok,
          object_key: verification.object_key ?? null,
          detail: verification.detail,
        })),
    })),
    blocked: blocked.map((item) => ({
      category: item.category,
      project_path: item.project_path,
      bytes: item.bytes,
      file_count: item.file_count,
      asset_id: item.asset_id ?? null,
      reason: item.reason,
      blockers: item.verifications
        .filter(
          (verification) =>
            verification.kind !== "git_tracking" && verification.ok !== true,
        )
        .map((verification) => ({
          kind: verification.kind,
          ok: verification.ok,
          object_key: verification.object_key ?? null,
          detail: verification.detail,
        })),
      policy_blocked:
        policyBlocksTrackedCleanup(audit, item),
    })),
  };
}

function nonTrackedNeedsReview(audit: Phase3CleanupAudit) {
  const items = audit.items.filter(
    (item) =>
      item.classification === "needs_review" &&
      !gitTrackingIsBlocking(item),
  );
  return {
    item_count: items.length,
    file_count: items.reduce((sum, item) => sum + item.file_count, 0),
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
    items: items.map((item) => ({
      category: item.category,
      project_path: item.project_path,
      bytes: item.bytes,
      file_count: item.file_count,
      asset_id: item.asset_id ?? null,
      candidate_id: item.candidate_id ?? null,
      source_job_id: item.source_job_id ?? null,
      reason: item.reason,
      verifications: item.verifications,
    })),
  };
}

async function pathStats(target: string): Promise<{
  exists: boolean;
  bytes: number;
  file_count: number;
}> {
  const info = await stat(target).catch(() => null);
  if (!info) {
    return {
      exists: false,
      bytes: 0,
      file_count: 0,
    };
  }
  if (info.isFile()) {
    return {
      exists: true,
      bytes: info.size,
      file_count: 1,
    };
  }
  if (!info.isDirectory()) {
    return {
      exists: true,
      bytes: 0,
      file_count: 0,
    };
  }
  let bytes = 0;
  let fileCount = 0;
  const stack = [target];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(child);
      } else if (entry.isFile()) {
        const childInfo = await stat(child).catch(() => null);
        if (childInfo) {
          bytes += childInfo.size;
          fileCount += 1;
        }
      }
    }
  }
  return {
    exists: true,
    bytes,
    file_count: fileCount,
  };
}

async function housekeepingInventory() {
  const roots = [] as Array<{
    project_path: string;
    exists: boolean;
    bytes: number;
    file_count: number;
    action: "report_only";
  }>;
  for (const projectPath of HOUSEKEEPING_PATHS) {
    const stats = await pathStats(path.join(process.cwd(), ...projectPath.split("/")));
    roots.push({
      project_path: projectPath,
      ...stats,
      action: "report_only",
    });
  }

  const rootEntries = await readdir(process.cwd(), { withFileTypes: true }).catch(() => []);
  const rootFiles = [] as Array<{
    project_path: string;
    bytes: number;
    action: "report_only";
  }>;
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    if (
      !ROOT_HOUSEKEEPING_FILE_NAMES.has(entry.name) &&
      !/^myway-.*\.txt$/i.test(entry.name)
    ) {
      continue;
    }
    const info = await stat(path.join(process.cwd(), entry.name)).catch(() => null);
    if (!info) continue;
    rootFiles.push({
      project_path: entry.name,
      bytes: info.size,
      action: "report_only",
    });
  }

  return {
    roots,
    root_files: rootFiles.sort((a, b) => b.bytes - a.bytes),
  };
}

async function reportDirectory() {
  const configured = process.env.MYWAY_CLEANUP_REPORT_DIR?.trim();
  const base = configured
    ? path.resolve(configured)
    : path.join(os.homedir(), "Documents", "MyWayCleanupReports");
  const relative = path.relative(process.cwd(), base);
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  ) {
    throw new Error(
      "MYWAY_CLEANUP_REPORT_DIR must be outside the MyWay project.",
    );
  }
  const directory = path.join(
    base,
    `post-cloud-local-cleanup-v17-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  await mkdir(directory, { recursive: true });
  return directory;
}

function assertNoProtectedDeletionCandidates(audit: Phase3CleanupAudit) {
  const unsafe = audit.items.filter(
    (item) =>
      item.classification === "safe_to_remove" &&
      PROTECTED_TOP_LEVEL_PREFIXES.some((prefix) =>
        normalizeProjectPath(item.project_path).startsWith(prefix),
      ),
  );
  if (unsafe.length) {
    throw new Error(
      `v17 safety invariant failed: Phase 3 marked ${unsafe.length} protected top-level path(s) safe_to_remove. No deletion was started.`,
    );
  }
}

function markdownReport(input: {
  mode: "preflight" | "apply";
  cloudBefore: Awaited<ReturnType<typeof runAssetCloudAuthorityAudit>>;
  phase3Before: Phase3CleanupAudit;
  deleted: {
    item_count: number;
    file_count: number;
    bytes: number;
    paths: string[];
  };
  phase3After: Phase3CleanupAudit | null;
  cloudAfter: Awaited<ReturnType<typeof runAssetCloudAuthorityAudit>> | null;
  gitManifest: ReturnType<typeof trackedCandidateManifest>;
  untrackedNeedsReview: ReturnType<typeof nonTrackedNeedsReview>;
}) {
  const after = input.phase3After ?? input.phase3Before;
  const lines = [
    "# MyWay post-cloud local cleanup v17",
    "",
    `Mode: ${input.mode}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Cloud authority gate",
    "",
    `- Missing checks before: ${input.cloudBefore.reconciliation.missing_check_count}`,
    `- Authority issues before: ${input.cloudBefore.summary.issues}`,
    `- Missing checks after: ${input.cloudAfter?.reconciliation.missing_check_count ?? "not run"}`,
    `- Authority issues after: ${input.cloudAfter?.summary.issues ?? "not run"}`,
    "",
    "## Verified local deletion",
    "",
    `- Before safe_to_remove: ${input.phase3Before.summary.safe_to_remove.item_count} item(s), ${input.phase3Before.summary.safe_to_remove.file_count} file(s), ${formatBytes(input.phase3Before.summary.safe_to_remove.bytes)}`,
    `- Deleted: ${input.deleted.item_count} item(s), ${input.deleted.file_count} file(s), ${formatBytes(input.deleted.bytes)}`,
    `- After safe_to_remove: ${after.summary.safe_to_remove.item_count} item(s), ${after.summary.safe_to_remove.file_count} file(s), ${formatBytes(after.summary.safe_to_remove.bytes)}`,
    "",
    "## Git-tracked generated candidates — report only",
    "",
    `- Cloud/transient-verified candidates: ${input.gitManifest.candidate_summary.item_count} item(s), ${input.gitManifest.candidate_summary.file_count} file(s), ${formatBytes(input.gitManifest.candidate_summary.bytes)}`,
    `- Tracked items still blocked by non-Git checks/policy: ${input.gitManifest.blocked_summary.item_count} item(s), ${input.gitManifest.blocked_summary.file_count} file(s), ${formatBytes(input.gitManifest.blocked_summary.bytes)}`,
    "",
    "No Git tracking was changed by v17.",
    "",
    "## Untracked needs-review inventory",
    "",
    `- ${input.untrackedNeedsReview.item_count} item(s), ${input.untrackedNeedsReview.file_count} file(s), ${formatBytes(input.untrackedNeedsReview.bytes)}`,
    "",
    "## Safety boundaries",
    "",
    "- R2 is read-only in v17.",
    "- Git is read-only in v17.",
    "- Top-level models/, datasets/, assets/, archive/, .git/, and .myway-patch-backups/ are never deletion targets.",
    "- Repo housekeeping paths are inventoried only; they are not deleted.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs();
  if (args.apply && args.confirmation !== V17_CONFIRMATION) {
    throw new Error(
      `v17 apply mode requires --confirmation=${V17_CONFIRMATION}. No files were deleted.`,
    );
  }

  console.log("Running v17 cloud-authority gate before local cleanup...");
  const cloudBefore = await runAssetCloudAuthorityAudit();
  assertCloudClean(cloudBefore, "Pre-cleanup");
  console.log(
    `Cloud gate passed: missing=${cloudBefore.reconciliation.missing_check_count}, authority_issues=${cloudBefore.summary.issues}.`,
  );

  const dryRun = await runHistoricalLocalAssetCleanup();
  assertNoProtectedDeletionCandidates(dryRun.before);

  console.log("MyWay v17 post-cloud local cleanup preflight passed.");
  console.log(
    `Verified safe local duplicates: ${dryRun.before.summary.safe_to_remove.item_count} item(s), ${dryRun.before.summary.safe_to_remove.file_count} file(s), ${formatBytes(dryRun.before.summary.safe_to_remove.bytes)}.`,
  );

  if (args.preflightOnly || !args.apply) {
    const gitManifest = trackedCandidateManifest(dryRun.before);
    const needsReview = nonTrackedNeedsReview(dryRun.before);
    const housekeeping = await housekeepingInventory();
    const directory = await reportDirectory();
    const report = {
      schema_version: "myway_post_cloud_local_cleanup_v17",
      generated_at: new Date().toISOString(),
      mode: "preflight" as const,
      policy: {
        cloud_authority_required_clean: true,
        r2_mutation: false,
        git_mutation: false,
        deletes_only_phase3_safe_to_remove: false,
        top_level_models_protected: true,
      },
      cloud_before: {
        missing_check_count: cloudBefore.reconciliation.missing_check_count,
        authority_issues: cloudBefore.summary.issues,
        expected_cloud_checks: cloudBefore.summary.expected_cloud_checks,
      },
      phase3_before: summarizePhase3(dryRun.before),
      git_cleanup_manifest: gitManifest,
      untracked_needs_review: needsReview,
      repo_housekeeping_inventory: housekeeping,
      supporting_phase3_report: dryRun.json_report_path,
    };
    const jsonPath = path.join(directory, "post-cloud-local-cleanup-v17-preflight.json");
    const mdPath = path.join(directory, "post-cloud-local-cleanup-v17-preflight.md");
    await Promise.all([
      writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
      writeFile(
        mdPath,
        markdownReport({
          mode: "preflight",
          cloudBefore,
          phase3Before: dryRun.before,
          deleted: {
            item_count: 0,
            file_count: 0,
            bytes: 0,
            paths: [],
          },
          phase3After: null,
          cloudAfter: null,
          gitManifest,
          untrackedNeedsReview: needsReview,
        }),
        "utf8",
      ),
    ]);
    console.log(
      `Git-tracked cleanup candidates (report only): ${gitManifest.candidate_summary.item_count} item(s), ${gitManifest.candidate_summary.file_count} file(s), ${formatBytes(gitManifest.candidate_summary.bytes)}.`,
    );
    console.log(
      `Untracked needs-review items: ${needsReview.item_count} item(s), ${needsReview.file_count} file(s), ${formatBytes(needsReview.bytes)}.`,
    );
    console.log("v17 preflight-only mode complete. No local files were deleted.");
    console.log(`Report: ${jsonPath}`);
    return;
  }

  console.log("Starting Phase 3 verified-safe local deletion...");
  console.log("Git-tracked files are excluded by the underlying Phase 3 audit.");
  console.log("R2 will not be mutated.");

  const cleanup = await runHistoricalLocalAssetCleanup({
    apply: true,
    confirmation: phase3ApplyConfirmation(),
  });

  for (const deletedPath of cleanup.deleted.paths) {
    const normalized = normalizeProjectPath(deletedPath);
    if (
      PROTECTED_TOP_LEVEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    ) {
      throw new Error(
        `v17 post-delete invariant failed: protected path was reported deleted: ${deletedPath}`,
      );
    }
  }

  const cloudAfter = await runAssetCloudAuthorityAudit();
  assertCloudClean(cloudAfter, "Post-cleanup");

  const afterAudit = cleanup.after ?? dryRun.before;
  const gitManifest = trackedCandidateManifest(afterAudit);
  const needsReview = nonTrackedNeedsReview(afterAudit);
  const housekeeping = await housekeepingInventory();
  const directory = await reportDirectory();

  const report = {
    schema_version: "myway_post_cloud_local_cleanup_v17",
    generated_at: new Date().toISOString(),
    mode: "apply" as const,
    policy: {
      cloud_authority_required_clean: true,
      r2_mutation: false,
      git_mutation: false,
      deletes_only_phase3_safe_to_remove: true,
      top_level_models_protected: true,
    },
    cloud_before: {
      missing_check_count: cloudBefore.reconciliation.missing_check_count,
      authority_issues: cloudBefore.summary.issues,
      expected_cloud_checks: cloudBefore.summary.expected_cloud_checks,
    },
    phase3_before: summarizePhase3(cleanup.before),
    deleted: cleanup.deleted,
    phase3_after: cleanup.after ? summarizePhase3(cleanup.after) : null,
    cloud_after: {
      missing_check_count: cloudAfter.reconciliation.missing_check_count,
      authority_issues: cloudAfter.summary.issues,
      expected_cloud_checks: cloudAfter.summary.expected_cloud_checks,
    },
    git_cleanup_manifest: gitManifest,
    untracked_needs_review: needsReview,
    repo_housekeeping_inventory: housekeeping,
    supporting_phase3_report: cleanup.json_report_path,
  };

  const jsonPath = path.join(directory, "post-cloud-local-cleanup-v17-applied.json");
  const mdPath = path.join(directory, "post-cloud-local-cleanup-v17-applied.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(
      mdPath,
      markdownReport({
        mode: "apply",
        cloudBefore,
        phase3Before: cleanup.before,
        deleted: cleanup.deleted,
        phase3After: cleanup.after,
        cloudAfter,
        gitManifest,
        untrackedNeedsReview: needsReview,
      }),
      "utf8",
    ),
  ]);

  console.log("MyWay v17 post-cloud local cleanup completed.");
  console.log(
    `Deleted verified-safe local duplicates: ${cleanup.deleted.item_count} item(s), ${cleanup.deleted.file_count} file(s), ${formatBytes(cleanup.deleted.bytes)}.`,
  );
  console.log(
    `Cloud after cleanup: missing=${cloudAfter.reconciliation.missing_check_count}, authority_issues=${cloudAfter.summary.issues}.`,
  );
  console.log(
    `Git-tracked cleanup candidates (NOT changed): ${gitManifest.candidate_summary.item_count} item(s), ${gitManifest.candidate_summary.file_count} file(s), ${formatBytes(gitManifest.candidate_summary.bytes)}.`,
  );
  console.log(
    `Tracked items still blocked by non-Git checks/policy: ${gitManifest.blocked_summary.item_count} item(s), ${gitManifest.blocked_summary.file_count} file(s), ${formatBytes(gitManifest.blocked_summary.bytes)}.`,
  );
  console.log(
    `Untracked needs-review items retained: ${needsReview.item_count} item(s), ${needsReview.file_count} file(s), ${formatBytes(needsReview.bytes)}.`,
  );
  console.log("No R2 objects were uploaded/deleted and Git tracking was not changed.");
  console.log(`Report: ${jsonPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
