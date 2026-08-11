import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

import { runAssetCloudAuthorityAudit } from "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server";
import {
  auditHistoricalLocalAssetStorage,
  type Phase3CleanupAudit,
  type Phase3CleanupItem,
} from "../../sandbox/probe-lab/assets/storage/asset-historical-cleanup.server";

loadDotenv({ path: path.join(process.cwd(), ".env.local") });

const EXPECTED_TOTAL = 480;
const EXPECTED_ANALYSIS = 252;
const EXPECTED_DURABLE = 228;

const ALLOWED_CATEGORIES = new Set([
  "analysis_render_copy",
  "durable_metadata_copy",
]);

const ALLOWED_ANALYSIS_PREFIX = "public/sandbox-assets/myway/analysis/";
const ALLOWED_DURABLE_PREFIXES = [
  "sandbox/probe-lab/assets/embeddings/",
  "sandbox/probe-lab/assets/library/licenses/",
  "sandbox/probe-lab/assets/library/source-records/",
] as const;

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
  const mode = args.includes("--postflight") ? "postflight" : "preflight";
  const manifestPath =
    args.find((arg) => arg.startsWith("--manifest="))?.slice("--manifest=".length) ??
    path.join(os.tmpdir(), "myway-git-cleanup-v20-manifest.json");
  return { mode, manifestPath } as const;
}

function assertCloudClean(
  audit: Awaited<ReturnType<typeof runAssetCloudAuthorityAudit>>,
  label: string,
) {
  const missing = audit.reconciliation.missing_check_count;
  const issues = audit.summary.issues;
  const sizeMismatches = audit.cloud_checks.filter(
    (item) => item.classification === "cloud_size_mismatch",
  ).length;
  if (missing !== 0 || issues !== 0 || sizeMismatches !== 0) {
    throw new Error(
      `${label} cloud-authority gate failed: missing=${missing}, authority_issues=${issues}, size_mismatches=${sizeMismatches}.`,
    );
  }
  return { missing, issues, size_mismatches: sizeMismatches };
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
  if (!audit.local_metadata_mirror_enabled) return false;
  return (
    item.category === "durable_metadata_copy" ||
    item.category === "foundry_candidate_mirror"
  );
}

function isAllowedCandidatePath(item: Phase3CleanupItem) {
  const projectPath = normalizeProjectPath(item.project_path);
  if (item.category === "analysis_render_copy") {
    return projectPath.startsWith(ALLOWED_ANALYSIS_PREFIX);
  }
  if (item.category === "durable_metadata_copy") {
    return ALLOWED_DURABLE_PREFIXES.some((prefix) => projectPath.startsWith(prefix));
  }
  return false;
}

function candidateManifest(audit: Phase3CleanupAudit) {
  const tracked = audit.items.filter(gitTrackingIsBlocking);
  const candidates = tracked.filter(
    (item) =>
      nonGitVerificationsAllPass(item) &&
      !policyBlocksTrackedCleanup(audit, item),
  );
  const blocked = tracked.filter((item) => !candidates.includes(item));

  for (const item of candidates) {
    if (!ALLOWED_CATEGORIES.has(item.category)) {
      throw new Error(
        `v20 refuses an unexpected Git cleanup category: ${item.category} (${item.project_path})`,
      );
    }
    if (!isAllowedCandidatePath(item)) {
      throw new Error(
        `v20 refuses a candidate outside its generated mirror roots: ${item.project_path}`,
      );
    }
    if (item.file_count !== 1) {
      throw new Error(
        `v20 only accepts one-file Git mirror items: ${item.project_path} has file_count=${item.file_count}.`,
      );
    }
  }

  const summarize = (items: Phase3CleanupItem[]) => ({
    item_count: items.length,
    file_count: items.reduce((sum, item) => sum + item.file_count, 0),
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  });

  const categories = candidates.reduce<Record<string, { item_count: number; bytes: number }>>(
    (summary, item) => {
      const current = (summary[item.category] ??= { item_count: 0, bytes: 0 });
      current.item_count += 1;
      current.bytes += item.bytes;
      return summary;
    },
    {},
  );

  return {
    candidate_summary: summarize(candidates),
    blocked_summary: summarize(blocked),
    categories,
    candidates: candidates.map((item) => ({
      id: item.id,
      category: item.category,
      project_path: normalizeProjectPath(item.project_path),
      bytes: item.bytes,
      asset_id: item.asset_id ?? null,
      non_git_verifications: item.verifications
        .filter((verification) => verification.kind !== "git_tracking")
        .map((verification) => ({
          kind: verification.kind,
          ok: verification.ok,
          object_key: verification.object_key ?? null,
          detail: verification.detail,
        })),
    })),
  };
}

function untrackedNeedsReview(audit: Phase3CleanupAudit) {
  return audit.items.filter(
    (item) =>
      item.classification === "needs_review" &&
      !gitTrackingIsBlocking(item),
  );
}

async function main() {
  const { mode, manifestPath } = parseArgs();
  console.log("Running v20 strict cloud-authority gate...");
  const cloudAudit = await runAssetCloudAuthorityAudit();
  const cloud = assertCloudClean(cloudAudit, "v20");

  const phase3 = await auditHistoricalLocalAssetStorage();
  const manifest = candidateManifest(phase3);
  const untracked = untrackedNeedsReview(phase3);

  if (untracked.length !== 0) {
    throw new Error(
      `v20 requires zero untracked needs-review asset items before Git cleanup; found ${untracked.length}.`,
    );
  }

  if (mode === "preflight") {
    const analysis = manifest.categories.analysis_render_copy?.item_count ?? 0;
    const durable = manifest.categories.durable_metadata_copy?.item_count ?? 0;
    if (
      manifest.candidate_summary.item_count !== EXPECTED_TOTAL ||
      manifest.candidate_summary.file_count !== EXPECTED_TOTAL ||
      analysis !== EXPECTED_ANALYSIS ||
      durable !== EXPECTED_DURABLE
    ) {
      throw new Error(
        "v20 candidate set drifted from the freshly confirmed boundary: " +
          `total=${manifest.candidate_summary.item_count}, analysis=${analysis}, durable=${durable}; ` +
          `expected total=${EXPECTED_TOTAL}, analysis=${EXPECTED_ANALYSIS}, durable=${EXPECTED_DURABLE}. No Git mutation is allowed.`,
      );
    }
  } else if (manifest.candidate_summary.item_count !== 0) {
    throw new Error(
      `v20 postflight requires zero remaining Git cleanup candidates; found ${manifest.candidate_summary.item_count}.`,
    );
  }

  const report = {
    schema_version: "myway_post_cloud_git_cleanup_v20_manifest_v1",
    generated_at: new Date().toISOString(),
    mode,
    policy: {
      cloud_authority_required: true,
      allowed_categories: [...ALLOWED_CATEGORIES],
      allowed_analysis_prefix: ALLOWED_ANALYSIS_PREFIX,
      allowed_durable_prefixes: [...ALLOWED_DURABLE_PREFIXES],
      mutates_r2: false,
      mutates_live_registry: false,
      mutates_git: mode === "preflight" ? false : null,
    },
    cloud,
    phase3: {
      local_metadata_mirror_enabled: phase3.local_metadata_mirror_enabled,
      untracked_needs_review_count: untracked.length,
      ...manifest,
    },
  };

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (mode === "preflight") {
    console.log("MyWay v20 Git cleanup preflight passed.");
    console.log(
      `Git-tracked cloud-verified candidates: ${manifest.candidate_summary.item_count} item(s), ${formatBytes(manifest.candidate_summary.bytes)}.`,
    );
    console.log(
      `  analysis_render_copy: ${manifest.categories.analysis_render_copy?.item_count ?? 0}`,
    );
    console.log(
      `  durable_metadata_copy: ${manifest.categories.durable_metadata_copy?.item_count ?? 0}`,
    );
    console.log(`Tracked items outside v20 candidate set retained: ${manifest.blocked_summary.item_count}.`);
    console.log("Untracked needs-review items: 0.");
  } else {
    console.log("MyWay v20 Git cleanup postflight passed.");
    console.log("Remaining Git cleanup candidates: 0.");
    console.log("Untracked needs-review items: 0.");
  }
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((caught) => {
  console.error(caught instanceof Error ? caught.stack ?? caught.message : String(caught));
  process.exitCode = 1;
});
