import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

import {
  listMyWayAssets,
} from "../../sandbox/probe-lab/assets/asset-library.server";
import {
  hashFile,
} from "../../sandbox/probe-lab/assets/content-hash.server";
import {
  projectPath,
} from "../../sandbox/probe-lab/assets/paths.server";
import {
  runAssetCloudAuthorityAudit,
} from "../../sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server";
import {
  auditHistoricalLocalAssetStorage,
  type Phase3CleanupAudit,
  type Phase3CleanupItem,
} from "../../sandbox/probe-lab/assets/storage/asset-historical-cleanup.server";
import {
  getR2SourceStorage,
} from "../../sandbox/probe-lab/assets/storage/r2-asset-storage.server";

loadDotenv({
  path: path.join(process.cwd(), ".env.local"),
});

const V19_CONFIRMATION =
  "ARCHIVE_AND_DELETE_UNREFERENCED_LOCAL_ASSET_ORPHANS_V19";
const ARCHIVE_ROOT =
  "archive/myway/historical-orphans/v19";

const TARGET_CATEGORIES = new Set<Phase3CleanupItem["category"]>([
  "runtime_model_copy",
  "thumbnail_copy",
  "source_copy",
]);

const ALLOWED_LOCAL_ROOTS = [
  "public/sandbox-assets/myway/models",
  "public/sandbox-assets/myway/thumbnails",
  "sandbox/probe-lab/assets/inbox",
] as const;

const ACTIVE_REFERENCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
]);

const ACTIVE_REFERENCE_SKIP_TOP_LEVEL = new Set([
  ".git",
  ".next",
  "node_modules",
  ".myway-patch-backups",
  "archive",
  "models",
  "datasets",
]);

const ACTIVE_REFERENCE_SKIP_PREFIXES = [
  "public/sandbox-assets/myway/",
  "sandbox/probe-lab/assets/library/",
  "sandbox/probe-lab/assets/embeddings/",
  "sandbox/probe-lab/assets/inbox/",
  "sandbox/probe-lab/assets/jobs/",
  "sandbox/probe-lab/assets/debug/",
  "sandbox/probe-lab/assets/enrichment/cache/",
  "sandbox/probe-lab/blender-python-builder/jobs/",
  "sandbox/probe-lab/blender-python-builder/candidates/",
] as const;

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

function normalizeRelative(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function pathKey(value: string) {
  const resolved = path.resolve(value);
  return process.platform === "win32"
    ? resolved.toLowerCase()
    : resolved;
}

function isInside(candidate: string, parent: string) {
  const relative = path.relative(
    path.resolve(parent),
    path.resolve(candidate),
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function isInsideAllowedLocalRoot(absolutePath: string) {
  return ALLOWED_LOCAL_ROOTS.some((root) =>
    isInside(
      absolutePath,
      projectPath(...root.split("/")),
    ),
  );
}

function stableTextHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeExtension(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ".bin";
}

function contentTypeFor(filePath: string) {
  switch (safeExtension(filePath)) {
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function archiveObjectKey(sha256: string, filePath: string) {
  return `${ARCHIVE_ROOT}/objects/${sha256}${safeExtension(filePath)}`;
}

function archiveManifestKey(projectPathValue: string, sha256: string) {
  return `${ARCHIVE_ROOT}/manifests/${stableTextHash(projectPathValue)}-${sha256.slice(0, 16)}.json`;
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

function gitTrackingIsClean(item: Phase3CleanupItem) {
  const verification = item.verifications.find(
    (entry) => entry.kind === "git_tracking",
  );
  return verification?.ok === true;
}

function unresolvedTargetItems(audit: Phase3CleanupAudit) {
  return audit.items.filter(
    (item) =>
      TARGET_CATEGORIES.has(item.category) &&
      item.classification === "needs_review" &&
      gitTrackingIsClean(item),
  );
}

function summarize(items: Array<{ bytes: number }>) {
  return {
    item_count: items.length,
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  };
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
        "No orphan archive/deletion is allowed until live R2 authority is clean.",
    );
  }
  return {
    missing,
    issues,
    size_mismatches: sizeMismatches.length,
  };
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function shouldSkipReferencePath(relativePath: string) {
  const normalized = normalizeRelative(relativePath);
  const first = normalized.split("/")[0] ?? "";
  if (ACTIVE_REFERENCE_SKIP_TOP_LEVEL.has(first)) return true;
  return ACTIVE_REFERENCE_SKIP_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

async function collectActiveReferenceFiles() {
  const root = process.cwd();
  const output: string[] = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop()!;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizeRelative(path.relative(root, absolutePath));
      if (shouldSkipReferencePath(relativePath)) continue;
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!ACTIVE_REFERENCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }
      const info = await stat(absolutePath).catch(() => null);
      if (!info || info.size > 5 * 1024 * 1024) continue;
      output.push(absolutePath);
    }
  }

  return output;
}

async function buildReferenceCorpus() {
  const files = await collectActiveReferenceFiles();
  const corpus: Array<{ path: string; text: string }> = [];
  for (const filePath of files) {
    const text = await readFile(filePath, "utf8").catch(() => null);
    if (text === null) continue;
    corpus.push({
      path: normalizeRelative(path.relative(process.cwd(), filePath)),
      text,
    });
  }
  return corpus;
}

function publicReferenceForProjectPath(projectPathValue: string) {
  const normalized = normalizeRelative(projectPathValue);
  const prefix = "public/";
  if (!normalized.startsWith(prefix)) return null;
  return `/${normalized.slice(prefix.length)}`;
}

function activeReferenceHits(
  item: Phase3CleanupItem,
  corpus: Array<{ path: string; text: string }>,
) {
  const references = new Set<string>([
    normalizeRelative(item.project_path),
  ]);
  const publicReference = publicReferenceForProjectPath(item.project_path);
  if (publicReference) references.add(publicReference);
  if (item.asset_id) references.add(item.asset_id);

  const hits: string[] = [];
  for (const entry of corpus) {
    if ([...references].some((reference) => entry.text.includes(reference))) {
      hits.push(entry.path);
      if (hits.length >= 20) break;
    }
  }
  return hits;
}

function currentRegistryReferences(
  item: Phase3CleanupItem,
  registryText: string,
) {
  const references = [
    normalizeRelative(item.project_path),
    publicReferenceForProjectPath(item.project_path),
    item.asset_id ?? null,
  ].filter((value): value is string => Boolean(value));
  return references.filter((reference) => registryText.includes(reference));
}

type Candidate = {
  id: string;
  category: Phase3CleanupItem["category"];
  project_path: string;
  absolute_path: string;
  asset_id: string | null;
  bytes: number;
  sha256: string;
  archive_object_key: string;
  archive_manifest_key: string;
  archive_object_already_exists: boolean;
  reason: string;
  verifications: Phase3CleanupItem["verifications"];
};

type Blocked = {
  category: Phase3CleanupItem["category"];
  project_path: string;
  asset_id: string | null;
  bytes: number;
  reason: string;
  registry_references: string[];
  active_reference_files: string[];
};

async function buildCandidates(audit: Phase3CleanupAudit) {
  const unresolved = unresolvedTargetItems(audit);
  const assets = await listMyWayAssets();
  const registryText = JSON.stringify(assets);
  const corpus = await buildReferenceCorpus();
  const storage = getR2SourceStorage();

  const selected: Candidate[] = [];
  const blocked: Blocked[] = [];

  for (const item of unresolved) {
    if (!isInsideAllowedLocalRoot(item.absolute_path)) {
      blocked.push({
        category: item.category,
        project_path: item.project_path,
        asset_id: item.asset_id ?? null,
        bytes: item.bytes,
        reason: "Path is outside the v19 orphan-compaction allowlist.",
        registry_references: [],
        active_reference_files: [],
      });
      continue;
    }

    const registryReferences = currentRegistryReferences(item, registryText);
    const activeReferences = activeReferenceHits(item, corpus);
    if (registryReferences.length || activeReferences.length) {
      blocked.push({
        category: item.category,
        project_path: item.project_path,
        asset_id: item.asset_id ?? null,
        bytes: item.bytes,
        reason: registryReferences.length
          ? "The current authoritative asset registry still contains a direct reference to this historical item."
          : "An active project source/config file still references this historical item.",
        registry_references: registryReferences,
        active_reference_files: activeReferences,
      });
      continue;
    }

    if (!(await exists(item.absolute_path))) continue;
    const info = await stat(item.absolute_path);
    if (!info.isFile()) {
      blocked.push({
        category: item.category,
        project_path: item.project_path,
        asset_id: item.asset_id ?? null,
        bytes: item.bytes,
        reason: "v19 only archives individual files, not directories.",
        registry_references: [],
        active_reference_files: [],
      });
      continue;
    }

    const sha256 = await hashFile(item.absolute_path);
    const objectKey = archiveObjectKey(sha256, item.absolute_path);
    const existing = (await storage.list({ prefix: objectKey }))
      .find((entry) => entry.object_key === objectKey) ?? null;
    if (existing && existing.size_bytes !== info.size) {
      throw new Error(
        `Existing orphan archive object has the right content-addressed key but the wrong size: ${objectKey}`,
      );
    }

    selected.push({
      id: item.id,
      category: item.category,
      project_path: item.project_path,
      absolute_path: item.absolute_path,
      asset_id: item.asset_id ?? null,
      bytes: info.size,
      sha256,
      archive_object_key: objectKey,
      archive_manifest_key: archiveManifestKey(item.project_path, sha256),
      archive_object_already_exists: Boolean(existing),
      reason: item.reason,
      verifications: item.verifications,
    });
  }

  return { selected, blocked };
}

async function reportDirectory() {
  const base = path.join(
    os.homedir(),
    "Documents",
    "MyWayCleanupReports",
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.join(base, `orphan-archive-cleanup-v19-${stamp}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

async function writeReport(name: string, value: unknown) {
  const directory = await reportDirectory();
  const reportPath = path.join(directory, name);
  await writeFile(reportPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return reportPath;
}

async function verifyArchivedObject(
  objectKey: string,
  expectedBytes: number,
) {
  const storage = getR2SourceStorage();
  const listed = (await storage.list({ prefix: objectKey }))
    .find((entry) => entry.object_key === objectKey) ?? null;
  if (!listed) {
    throw new Error(`Archived object is not visible in private R2: ${objectKey}`);
  }
  if (listed.size_bytes !== expectedBytes) {
    throw new Error(
      `Archived object size mismatch for ${objectKey}: expected=${expectedBytes}, actual=${listed.size_bytes}`,
    );
  }
}

async function archiveCandidate(
  candidate: Candidate,
  cloudGate: { missing: number; issues: number; size_mismatches: number },
) {
  const storage = getR2SourceStorage();
  const info = await stat(candidate.absolute_path);
  if (!info.isFile() || info.size !== candidate.bytes) {
    throw new Error(`Local orphan changed after preflight: ${candidate.project_path}`);
  }
  const currentHash = await hashFile(candidate.absolute_path);
  if (currentHash !== candidate.sha256) {
    throw new Error(`Local orphan content hash changed after preflight: ${candidate.project_path}`);
  }

  const existing = (await storage.list({ prefix: candidate.archive_object_key }))
    .find((entry) => entry.object_key === candidate.archive_object_key) ?? null;

  if (!existing) {
    const uploaded = await storage.upload({
      local_path: candidate.absolute_path,
      object_key: candidate.archive_object_key,
      content_type: contentTypeFor(candidate.absolute_path),
      visibility: "private",
      cache_control: "no-store",
      metadata: {
        "myway-record-kind": "historical-orphan-artifact",
        "content-sha256": candidate.sha256,
        "source-category": candidate.category,
        "path-hash": stableTextHash(candidate.project_path),
      },
    });
    if (uploaded.size_bytes !== candidate.bytes) {
      throw new Error(
        `R2 upload size mismatch for ${candidate.project_path}: expected=${candidate.bytes}, uploaded=${uploaded.size_bytes}`,
      );
    }
  }

  await verifyArchivedObject(candidate.archive_object_key, candidate.bytes);

  const manifest = {
    schema_version: "myway_historical_orphan_archive_v1",
    archived_at: new Date().toISOString(),
    archived_by: "post-cloud-orphan-archive-cleanup-v19",
    live_asset_registry_status: "not_referenced_at_v19_archive_time",
    original_project_path: candidate.project_path,
    category: candidate.category,
    historical_asset_id: candidate.asset_id,
    bytes: candidate.bytes,
    sha256: candidate.sha256,
    private_archive_object_key: candidate.archive_object_key,
    private_archive_bucket: storage.bucket,
    cloud_authority_gate_at_archive: cloudGate,
    phase3_reason: candidate.reason,
    phase3_verifications: candidate.verifications,
    restore_note:
      "This object is a private historical preservation copy, not a live asset-registry object. Restore intentionally before any future reuse/review.",
  };

  await storage.uploadBytes({
    body: `${JSON.stringify(manifest, null, 2)}\n`,
    object_key: candidate.archive_manifest_key,
    content_type: "application/json; charset=utf-8",
    visibility: "private",
    cache_control: "no-store",
    metadata: {
      "myway-record-kind": "historical-orphan-manifest",
      "content-sha256": candidate.sha256,
    },
  });
  if (!(await storage.exists(candidate.archive_manifest_key))) {
    throw new Error(`Orphan archive manifest verification failed: ${candidate.archive_manifest_key}`);
  }

  return {
    project_path: candidate.project_path,
    archive_object_key: candidate.archive_object_key,
    archive_manifest_key: candidate.archive_manifest_key,
    bytes: candidate.bytes,
    sha256: candidate.sha256,
    reused_existing_archive_object: Boolean(existing),
  };
}

async function assertCandidatesStillUnresolved(candidates: Candidate[]) {
  const fresh = await auditHistoricalLocalAssetStorage();
  const unresolvedByPath = new Map(
    unresolvedTargetItems(fresh).map((item) => [normalizeRelative(item.project_path), item]),
  );
  for (const candidate of candidates) {
    const item = unresolvedByPath.get(normalizeRelative(candidate.project_path));
    if (!item) {
      throw new Error(
        `Historical orphan is no longer an untracked Phase-3 needs_review item; deletion aborted: ${candidate.project_path}`,
      );
    }
    if (!isInsideAllowedLocalRoot(item.absolute_path)) {
      throw new Error(`Fresh audit path escaped v19 allowlist: ${candidate.project_path}`);
    }
    const info = await stat(item.absolute_path);
    if (!info.isFile() || info.size !== candidate.bytes) {
      throw new Error(`Historical orphan size changed before deletion: ${candidate.project_path}`);
    }
    const hash = await hashFile(item.absolute_path);
    if (hash !== candidate.sha256) {
      throw new Error(`Historical orphan hash changed before deletion: ${candidate.project_path}`);
    }
    await verifyArchivedObject(candidate.archive_object_key, candidate.bytes);
    if (!(await getR2SourceStorage().exists(candidate.archive_manifest_key))) {
      throw new Error(`Historical orphan manifest disappeared before deletion: ${candidate.archive_manifest_key}`);
    }
  }
}

async function main() {
  const args = parseArgs();
  if (args.apply && args.confirmation !== V19_CONFIRMATION) {
    throw new Error(
      `v19 apply requires --confirmation=${V19_CONFIRMATION}. No R2 archive uploads or local deletions were performed.`,
    );
  }

  console.log("Running v19 strict cloud-authority gate...");
  const cloudBefore = await runAssetCloudAuthorityAudit();
  const cloudGateBefore = assertCloudClean(cloudBefore, "Before v19");
  console.log(
    `Cloud gate passed: missing=${cloudGateBefore.missing}, ` +
      `authority_issues=${cloudGateBefore.issues}, size_mismatches=${cloudGateBefore.size_mismatches}.`,
  );

  const phase3Before = await auditHistoricalLocalAssetStorage();
  const { selected, blocked } = await buildCandidates(phase3Before);
  const selectedSummary = summarize(selected);
  const blockedSummary = summarize(blocked);
  const uniqueArchiveObjects = new Set(selected.map((item) => item.archive_object_key));
  const alreadyArchived = selected.filter((item) => item.archive_object_already_exists);

  console.log("MyWay v19 orphan archive/cleanup preflight passed.");
  console.log(
    `Selected unreferenced local artifacts: ${selectedSummary.item_count} item(s), ${formatBytes(selectedSummary.bytes)}.`,
  );
  console.log(
    `Unique content-addressed private archive objects: ${uniqueArchiveObjects.size}; ` +
      `already present: ${alreadyArchived.length} item reference(s).`,
  );
  console.log(
    `Blocked/retained unresolved artifacts: ${blockedSummary.item_count} item(s), ${formatBytes(blockedSummary.bytes)}.`,
  );

  const preflightReport = await writeReport(
    args.apply
      ? "orphan-archive-cleanup-v19-before-apply.json"
      : "orphan-archive-cleanup-v19-preflight.json",
    {
      schema_version: "myway_orphan_archive_cleanup_v19",
      mode: args.apply ? "apply_preflight" : "preflight",
      generated_at: new Date().toISOString(),
      cloud_gate: cloudGateBefore,
      archive_root: ARCHIVE_ROOT,
      selected_summary: selectedSummary,
      unique_archive_object_count: uniqueArchiveObjects.size,
      selected: selected.map((item) => ({
        category: item.category,
        project_path: item.project_path,
        asset_id: item.asset_id,
        bytes: item.bytes,
        sha256: item.sha256,
        archive_object_key: item.archive_object_key,
        archive_manifest_key: item.archive_manifest_key,
        archive_object_already_exists: item.archive_object_already_exists,
        reason: item.reason,
        verifications: item.verifications,
      })),
      blocked_summary: blockedSummary,
      blocked,
    },
  );
  console.log(`Preflight report: ${preflightReport}`);

  if (!args.apply || args.preflightOnly) {
    console.log("v19 preflight-only mode complete. No R2 objects were uploaded and no local files were deleted.");
    return;
  }

  if (!selected.length) {
    console.log("No unreferenced local artifacts are eligible for preservation-first compaction. Nothing was changed.");
    return;
  }

  console.log("Archiving every selected orphan to private R2 before any local deletion...");
  const archived: Awaited<ReturnType<typeof archiveCandidate>>[] = [];
  for (const [index, candidate] of selected.entries()) {
    console.log(
      `[${index + 1}/${selected.length}] archive ${candidate.project_path} (${formatBytes(candidate.bytes)})`,
    );
    archived.push(await archiveCandidate(candidate, cloudGateBefore));
  }

  console.log("All selected orphan bytes/manifests are verified in private R2. Re-running live cloud gate...");
  const cloudAfterArchive = await runAssetCloudAuthorityAudit();
  const cloudGateAfterArchive = assertCloudClean(cloudAfterArchive, "After v19 archive");

  console.log("Revalidating all selected local files immediately before deletion...");
  await assertCandidatesStillUnresolved(selected);

  const deleted = {
    item_count: 0,
    bytes: 0,
    paths: [] as string[],
  };
  for (const candidate of selected) {
    await rm(candidate.absolute_path, { force: true });
    deleted.item_count += 1;
    deleted.bytes += candidate.bytes;
    deleted.paths.push(candidate.project_path);
  }

  console.log("Local orphan deletion completed. Re-running strict cloud-authority audit...");
  const cloudAfter = await runAssetCloudAuthorityAudit();
  const cloudGateAfter = assertCloudClean(cloudAfter, "After v19 deletion");
  const phase3After = await auditHistoricalLocalAssetStorage();
  const remaining = unresolvedTargetItems(phase3After);

  const appliedReport = await writeReport(
    "orphan-archive-cleanup-v19-applied.json",
    {
      schema_version: "myway_orphan_archive_cleanup_v19",
      mode: "apply",
      generated_at: new Date().toISOString(),
      archive_root: ARCHIVE_ROOT,
      cloud_before: cloudGateBefore,
      cloud_after_archive: cloudGateAfterArchive,
      cloud_after_delete: cloudGateAfter,
      selected_summary: selectedSummary,
      archived,
      deleted,
      blocked_summary: blockedSummary,
      blocked,
      remaining_untracked_target_needs_review_summary: summarize(remaining),
      remaining_untracked_target_needs_review: remaining.map((item) => ({
        category: item.category,
        project_path: item.project_path,
        asset_id: item.asset_id ?? null,
        bytes: item.bytes,
        reason: item.reason,
        verifications: item.verifications,
      })),
    },
  );

  console.log("MyWay v19 preservation-first orphan compaction completed.");
  console.log(
    `Archived and deleted locally: ${deleted.item_count} item(s), ${formatBytes(deleted.bytes)}.`,
  );
  console.log(
    `Cloud after cleanup: missing=${cloudGateAfter.missing}, ` +
      `authority_issues=${cloudGateAfter.issues}, size_mismatches=${cloudGateAfter.size_mismatches}.`,
  );
  console.log(
    `Remaining untracked runtime/thumbnail/source needs-review items: ` +
      `${remaining.length} item(s), ${formatBytes(summarize(remaining).bytes)}.`,
  );
  console.log(`Report: ${appliedReport}`);
  console.log("Live asset registry and Git tracking were not changed. Historical orphan archives are private R2 preservation objects only.");
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.stack ?? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
