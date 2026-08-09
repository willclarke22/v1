import {
  access,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import {
  execFileSync,
} from "node:child_process";
import os from "node:os";
import path from "node:path";

import {
  listMyWayAssets,
} from "../asset-library.server";
import type {
  MyWayAssetRecord,
} from "../asset-types";
import {
  MYWAY_ASSET_JOB_PROJECT_PATH,
  projectPath,
  publicUrlToProjectPath,
} from "../paths.server";
import {
  durableAssetCloudEnabled,
  durableJsonCloudKey,
  runtimeObjectKeyFromPublicUrl,
} from "./asset-durable-artifacts.server";
import {
  keepLocalAssetMetadataMirror,
} from "./cloud-json.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "./r2-asset-storage.server";

export type Phase3CleanupClassification =
  | "safe_to_remove"
  | "keep"
  | "needs_review";

export type Phase3CleanupVerification = {
  kind:
    | "r2_runtime"
    | "r2_source"
    | "transient_history"
    | "active_job_guard"
    | "git_tracking"
    | "retention_policy";
  ok: boolean | null;
  object_key?: string | null;
  detail: string;
};

export type Phase3CleanupItem = {
  id: string;
  category:
    | "legacy_blenderkit_download"
    | "enrichment_cache"
    | "runtime_model_copy"
    | "thumbnail_copy"
    | "analysis_render_copy"
    | "source_copy"
    | "durable_metadata_copy"
    | "terminal_blender_job"
    | "foundry_job_workspace"
    | "foundry_candidate_mirror";
  classification: Phase3CleanupClassification;
  project_path: string;
  absolute_path: string;
  bytes: number;
  file_count: number;
  asset_id?: string | null;
  candidate_id?: string | null;
  source_job_id?: string | null;
  reason: string;
  verifications: Phase3CleanupVerification[];
};

export type Phase3CleanupSummary = {
  item_count: number;
  file_count: number;
  bytes: number;
};

export type Phase3CleanupAudit = {
  schema_version: "myway_asset_historical_cleanup_phase3_v1";
  generated_at: string;
  project_root: string;
  cloud_enabled: boolean;
  git_tracking_available: boolean;
  local_metadata_mirror_enabled: boolean;
  active_blenderkit_job_count: number;
  unreadable_active_blender_job_count: number;
  terminal_job_history_limit: number;
  keep_all_terminal_job_history: boolean;
  items: Phase3CleanupItem[];
  summary: Record<Phase3CleanupClassification, Phase3CleanupSummary>;
};

export type Phase3CleanupRunResult = {
  mode: "dry_run" | "apply";
  report_directory: string;
  json_report_path: string;
  markdown_report_path: string;
  before: Phase3CleanupAudit;
  after: Phase3CleanupAudit | null;
  deleted: {
    item_count: number;
    file_count: number;
    bytes: number;
    paths: string[];
  };
};

type GitTracking = {
  available: boolean;
  tracked: Set<string>;
};

type R2Check = {
  ok: boolean;
  error: string | null;
};

type FoundryCandidateVerification = {
  candidate_id: string;
  source_job_id: string;
  ok: boolean;
  verifications: Phase3CleanupVerification[];
};

const APPLY_CONFIRMATION =
  "DELETE_VERIFIED_LOCAL_ASSET_DUPLICATES";
const DEFAULT_TERMINAL_JOB_HISTORY_LIMIT = 100;

const GENERATED_ROOTS = [
  "public/sandbox-assets/myway/models",
  "public/sandbox-assets/myway/thumbnails",
  "public/sandbox-assets/myway/analysis",
  "sandbox/probe-lab/assets/inbox",
  "sandbox/probe-lab/assets/enrichment/cache",
  "sandbox/probe-lab/assets/embeddings",
  "sandbox/probe-lab/assets/library/licenses",
  "sandbox/probe-lab/assets/library/source-records",
  "sandbox/probe-lab/assets/jobs/completed",
  "sandbox/probe-lab/assets/jobs/failed",
  "sandbox/probe-lab/blender-python-builder/jobs",
  "sandbox/probe-lab/blender-python-builder/candidates",
  "public/sandbox-assets/myway/blender-python-builder",
] as const;

function now() {
  return new Date().toISOString();
}

function normalizeRelative(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function projectRelative(absolutePath: string) {
  return normalizeRelative(
    path.relative(
      process.cwd(),
      absolutePath,
    ),
  );
}

function pathKey(absolutePath: string) {
  const resolved = path.resolve(absolutePath);
  return process.platform === "win32"
    ? resolved.toLowerCase()
    : resolved;
}

function isInside(
  candidate: string,
  parent: string,
) {
  const relative = path.relative(
    path.resolve(parent),
    path.resolve(candidate),
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") &&
      !path.isAbsolute(relative))
  );
}

function isInsideAllowedGeneratedRoot(
  absolutePath: string,
) {
  return GENERATED_ROOTS.some(
    (root) =>
      isInside(
        absolutePath,
        projectPath(
          ...root.split("/"),
        ),
      ),
  );
}

async function exists(
  filePath: string,
) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(
  root: string,
  options: {
    skip?: (absolutePath: string) => boolean;
  } = {},
) {
  if (!(await exists(root))) {
    return [] as string[];
  }

  const output: string[] = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop()!;
    const entries = await readdir(
      current,
      { withFileTypes: true },
    ).catch(() => []);

    for (const entry of entries) {
      const absolutePath = path.join(
        current,
        entry.name,
      );
      if (
        options.skip?.(absolutePath)
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile()) {
        output.push(absolutePath);
      }
    }
  }

  return output;
}

async function pathStats(
  absolutePath: string,
) {
  const info = await stat(
    absolutePath,
  ).catch(() => null);
  if (!info) {
    return {
      bytes: 0,
      file_count: 0,
    };
  }
  if (info.isFile()) {
    return {
      bytes: info.size,
      file_count: 1,
    };
  }

  const files =
    await listFilesRecursive(
      absolutePath,
    );
  const stats =
    await Promise.all(
      files.map((filePath) =>
        stat(filePath).catch(
          () => null,
        ),
      ),
    );

  return {
    bytes: stats.reduce(
      (sum, item) =>
        sum +
        (item?.isFile()
          ? item.size
          : 0),
      0,
    ),
    file_count: stats.filter(
      (item) => item?.isFile(),
    ).length,
  };
}

function readGitTracking(): GitTracking {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "-z"],
      {
        cwd: process.cwd(),
        encoding: "buffer",
        stdio: [
          "ignore",
          "pipe",
          "ignore",
        ],
      },
    );
    const tracked = new Set(
      output
        .toString("utf8")
        .split("\0")
        .map(normalizeRelative)
        .filter(Boolean),
    );
    return {
      available: true,
      tracked,
    };
  } catch {
    return {
      available: false,
      tracked: new Set(),
    };
  }
}

function trackingForPath(
  absolutePath: string,
  git: GitTracking,
) {
  if (!git.available) {
    return {
      known: false,
      tracked: false,
      detail:
        "Git tracking could not be read; automatic deletion is blocked for this item.",
    };
  }

  const relative =
    projectRelative(absolutePath);
  const tracked =
    git.tracked.has(relative) ||
    [...git.tracked].some(
      (entry) =>
        entry.startsWith(
          `${relative}/`,
        ),
    );

  return {
    known: true,
    tracked,
    detail: tracked
      ? "One or more files are tracked by Git; Phase 3 will not delete them automatically."
      : "No files in this cleanup item are tracked by Git.",
  };
}

function keepAllTerminalJobHistory() {
  const value =
    process.env.MYWAY_KEEP_BLENDER_JOB_HISTORY
      ?.trim()
      .toLowerCase();
  return value === "true" || value === "1";
}

function terminalJobHistoryLimit() {
  const configured = Number(
    process.env.MYWAY_BLENDER_JOB_HISTORY_LIMIT ??
      DEFAULT_TERMINAL_JOB_HISTORY_LIMIT,
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_TERMINAL_JOB_HISTORY_LIMIT;
  }
  return Math.max(
    0,
    Math.floor(configured),
  );
}

async function activeBlenderJobState() {
  let activeBlenderKit = 0;
  let unreadable = 0;

  for (const status of [
    "pending",
    "running",
  ] as const) {
    const directory = projectPath(
      MYWAY_ASSET_JOB_PROJECT_PATH,
      status,
    );
    const entries = await readdir(
      directory,
      { withFileTypes: true },
    ).catch(() => []);

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !entry.name
          .toLowerCase()
          .endsWith(".json")
      ) {
        continue;
      }
      try {
        const raw = JSON.parse(
          await readFile(
            path.join(
              directory,
              entry.name,
            ),
            "utf8",
          ),
        ) as {
          kind?: string;
        };
        if (
          raw.kind ===
          "blenderkit_acquire"
        ) {
          activeBlenderKit += 1;
        }
      } catch {
        unreadable += 1;
      }
    }
  }

  return {
    activeBlenderKit,
    unreadable,
  };
}

function localPathFromStoredReference(
  value: string | null | undefined,
) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    return null;
  }
  if (
    value.startsWith(
      "/sandbox-assets/myway/",
    )
  ) {
    try {
      return publicUrlToProjectPath(
        value,
      );
    } catch {
      return null;
    }
  }
  if (path.isAbsolute(value)) {
    return path.resolve(value);
  }
  const normalized =
    normalizeRelative(value);
  if (
    normalized.includes("../")
  ) {
    return null;
  }
  return projectPath(
    ...normalized
      .split("/")
      .filter(Boolean),
  );
}

function assetSourceMatchesPath(
  asset: MyWayAssetRecord,
  absolutePath: string,
) {
  const source =
    localPathFromStoredReference(
      asset.source_path,
    );
  return Boolean(
    source &&
      pathKey(source) ===
        pathKey(absolutePath),
  );
}

function itemId(
  category: Phase3CleanupItem["category"],
  projectPathValue: string,
) {
  return `${category}:${normalizeRelative(
    projectPathValue,
  )}`;
}

async function addItem(
  items: Phase3CleanupItem[],
  input: Omit<
    Phase3CleanupItem,
    "id" | "bytes" | "file_count"
  >,
) {
  const stats =
    await pathStats(
      input.absolute_path,
    );
  if (
    stats.file_count === 0 &&
    !(await exists(
      input.absolute_path,
    ))
  ) {
    return;
  }
  items.push({
    ...input,
    id: itemId(
      input.category,
      input.project_path,
    ),
    ...stats,
  });
}

function trackedClassification(
  tracking: ReturnType<
    typeof trackingForPath
  >,
) {
  if (!tracking.known) {
    return {
      blocked: true,
      classification:
        "needs_review" as const,
      reason:
        "Git tracking status is unavailable, so deletion is blocked conservatively.",
    };
  }
  if (tracking.tracked) {
    return {
      blocked: true,
      classification:
        "needs_review" as const,
      reason:
        "This generated-looking item contains Git-tracked files and is protected from automatic cleanup.",
    };
  }
  return {
    blocked: false,
    classification:
      "safe_to_remove" as const,
    reason: "",
  };
}

export async function auditHistoricalLocalAssetStorage(): Promise<Phase3CleanupAudit> {
  if (!durableAssetCloudEnabled()) {
    throw new Error(
      "Phase 3 requires the complete Cloudflare R2 environment and cloud asset metadata mode. No cleanup was attempted.",
    );
  }

  const git = readGitTracking();
  const runtimeStorage =
    getR2RuntimeStorage();
  const sourceStorage =
    getR2SourceStorage();
  const runtimeChecks =
    new Map<string, Promise<R2Check>>();
  const sourceChecks =
    new Map<string, Promise<R2Check>>();

  const checkRuntime =
    (objectKey: string) => {
      if (!runtimeChecks.has(objectKey)) {
        runtimeChecks.set(
          objectKey,
          runtimeStorage
            .exists(objectKey)
            .then((ok) => ({
              ok,
              error: null,
            }))
            .catch((caught) => ({
              ok: false,
              error:
                caught instanceof Error
                  ? caught.message
                  : String(caught),
            })),
        );
      }
      return runtimeChecks.get(
        objectKey,
      )!;
    };

  const checkSource =
    (objectKey: string) => {
      if (!sourceChecks.has(objectKey)) {
        sourceChecks.set(
          objectKey,
          sourceStorage
            .exists(objectKey)
            .then((ok) => ({
              ok,
              error: null,
            }))
            .catch((caught) => ({
              ok: false,
              error:
                caught instanceof Error
                  ? caught.message
                  : String(caught),
            })),
        );
      }
      return sourceChecks.get(
        objectKey,
      )!;
    };

  const [
    assets,
    activeJobs,
  ] = await Promise.all([
    listMyWayAssets(),
    activeBlenderJobState(),
  ]);
  const assetsById = new Map(
    assets.map((asset) => [
      asset.asset_id,
      asset,
    ]),
  );
  const items: Phase3CleanupItem[] = [];
  const claimedPaths = new Set<string>();

  const claim = (
    absolutePath: string,
  ) => {
    const key = pathKey(
      absolutePath,
    );
    if (claimedPaths.has(key)) {
      return false;
    }
    claimedPaths.add(key);
    return true;
  };

  // 1. Legacy BlenderKit download workspace. Phase 1 no longer uses this
  // project-local location, so it is transient history as long as no legacy
  // BlenderKit job could still be active and Git does not protect it.
  const legacyBlenderKit = projectPath(
    "public",
    "sandbox-assets",
    "myway",
    "models",
    "blenderkit",
    ".blenderkit-download",
  );
  if (await exists(legacyBlenderKit)) {
    const tracking =
      trackingForPath(
        legacyBlenderKit,
        git,
      );
    const tracked =
      trackedClassification(
        tracking,
      );
    const activeBlocked =
      activeJobs.activeBlenderKit > 0 ||
      activeJobs.unreadable > 0;
    await addItem(items, {
      category:
        "legacy_blenderkit_download",
      classification:
        tracked.blocked || activeBlocked
          ? "needs_review"
          : "safe_to_remove",
      project_path:
        projectRelative(
          legacyBlenderKit,
        ),
      absolute_path:
        legacyBlenderKit,
      reason: tracked.blocked
        ? tracked.reason
        : activeBlocked
          ? "A pending/running or unreadable Blender job prevents proving that the legacy BlenderKit workspace is inactive."
          : "Phase 1 moved BlenderKit acquisition to OS temp storage, and no active BlenderKit job depends on this legacy project-local workspace.",
      verifications: [
        {
          kind: "active_job_guard",
          ok: !activeBlocked,
          detail:
            `${activeJobs.activeBlenderKit} active BlenderKit job(s); ${activeJobs.unreadable} unreadable active job record(s).`,
        },
        {
          kind: "git_tracking",
          ok: tracking.known
            ? !tracking.tracked
            : null,
          detail: tracking.detail,
        },
        {
          kind: "transient_history",
          ok: true,
          detail:
            "The current Blender bridge creates BlenderKit acquisition workspaces under the operating-system temp directory, not this legacy folder.",
        },
      ],
    });
    claim(legacyBlenderKit);
  }

  // 2. Legacy enrichment hydration cache. Each cache GLB is removable only
  // when the corresponding runtime model is independently verified in R2.
  const enrichmentCache = projectPath(
    "sandbox",
    "probe-lab",
    "assets",
    "enrichment",
    "cache",
  );
  for (const filePath of
    await listFilesRecursive(
      enrichmentCache,
    )) {
    if (!claim(filePath)) continue;
    const tracking =
      trackingForPath(
        filePath,
        git,
      );
    const tracked =
      trackedClassification(
        tracking,
      );
    const assetId =
      path.basename(
        filePath,
        path.extname(filePath),
      );
    const asset =
      assetsById.get(assetId);
    const objectKey =
      asset?.storage_provider === "r2"
        ? asset.storage_object_key ?? null
        : null;
    const verification =
      objectKey
        ? await checkRuntime(
            objectKey,
          )
        : null;
    const safe = Boolean(
      !tracked.blocked &&
        objectKey &&
        verification?.ok,
    );
    await addItem(items, {
      category:
        "enrichment_cache",
      classification: safe
        ? "safe_to_remove"
        : asset &&
            asset.storage_provider !== "r2"
          ? "keep"
          : "needs_review",
      project_path:
        projectRelative(filePath),
      absolute_path: filePath,
      asset_id: assetId,
      reason: tracked.blocked
        ? tracked.reason
        : safe
          ? "This is a legacy enrichment hydration copy and the authoritative runtime model was verified in R2."
          : asset &&
              asset.storage_provider !== "r2"
            ? "The corresponding asset is not R2-backed, so this local copy may still be authoritative."
            : "The corresponding R2 runtime model could not be verified.",
      verifications: [
        {
          kind: "git_tracking",
          ok: tracking.known
            ? !tracking.tracked
            : null,
          detail: tracking.detail,
        },
        {
          kind: "r2_runtime",
          ok: verification?.ok ?? false,
          object_key: objectKey,
          detail: objectKey
            ? verification?.ok
              ? "Runtime model exists in R2."
              : verification?.error ??
                "Runtime model was not found in R2."
            : "No R2 runtime object key is recorded for this asset.",
        },
      ],
    });
  }

  // 3. Local runtime model copies. A local model is safe only when the asset
  // registry says R2 owns runtime storage and HEAD verification succeeds. If
  // the same file is also the recorded source_path, the private source archive
  // must be verified too.
  const modelRoot = projectPath(
    "public",
    "sandbox-assets",
    "myway",
    "models",
  );
  const modelFiles =
    await listFilesRecursive(
      modelRoot,
      {
        skip: (candidate) =>
          isInside(
            candidate,
            legacyBlenderKit,
          ),
      },
    );
  for (const filePath of modelFiles) {
    const extension =
      path.extname(filePath)
        .toLowerCase();
    if (
      extension !== ".glb" &&
      extension !== ".gltf"
    ) {
      continue;
    }
    if (!claim(filePath)) continue;

    const assetId =
      path.basename(
        filePath,
        extension,
      );
    const asset =
      assetsById.get(assetId);
    const tracking =
      trackingForPath(
        filePath,
        git,
      );
    const tracked =
      trackedClassification(
        tracking,
      );
    const runtimeKey =
      asset?.storage_provider === "r2"
        ? asset.storage_object_key ?? null
        : null;
    const runtimeCheck =
      runtimeKey
        ? await checkRuntime(
            runtimeKey,
          )
        : null;
    const doublesAsSource =
      asset
        ? assetSourceMatchesPath(
            asset,
            filePath,
          )
        : false;
    const sourceKey =
      doublesAsSource &&
      asset?.source_storage_provider === "r2"
        ? asset.source_object_key ?? null
        : null;
    const sourceCheck =
      sourceKey
        ? await checkSource(
            sourceKey,
          )
        : null;
    const sourceSafe =
      !doublesAsSource ||
      Boolean(
        sourceKey &&
          sourceCheck?.ok,
      );
    const safe = Boolean(
      !tracked.blocked &&
        runtimeKey &&
        runtimeCheck?.ok &&
        sourceSafe,
    );

    await addItem(items, {
      category:
        "runtime_model_copy",
      classification: safe
        ? "safe_to_remove"
        : asset &&
            asset.storage_provider !== "r2"
          ? "keep"
          : "needs_review",
      project_path:
        projectRelative(filePath),
      absolute_path: filePath,
      asset_id: assetId,
      reason: tracked.blocked
        ? tracked.reason
        : safe
          ? doublesAsSource
            ? "Both the public runtime model and the private source archive were verified in R2."
            : "The public runtime model was verified in R2 and this file is not the only recorded source copy."
          : asset &&
              asset.storage_provider !== "r2"
            ? "This asset is still local/pending and its normalized model must remain available for review."
            : doublesAsSource &&
                !sourceSafe
              ? "The runtime model is cloud-backed, but this same file is also the recorded source and its private source archive is not verified."
              : "The R2 runtime model could not be verified.",
      verifications: [
        {
          kind: "git_tracking",
          ok: tracking.known
            ? !tracking.tracked
            : null,
          detail: tracking.detail,
        },
        {
          kind: "r2_runtime",
          ok: runtimeCheck?.ok ?? false,
          object_key: runtimeKey,
          detail: runtimeKey
            ? runtimeCheck?.ok
              ? "Runtime model exists in R2."
              : runtimeCheck?.error ??
                "Runtime model was not found in R2."
            : "No R2 runtime object key is recorded.",
        },
        ...(doublesAsSource
          ? [
              {
                kind:
                  "r2_source" as const,
                ok:
                  sourceCheck?.ok ??
                  false,
                object_key:
                  sourceKey,
                detail: sourceKey
                  ? sourceCheck?.ok
                    ? "Private source archive exists in R2."
                    : sourceCheck?.error ??
                      "Private source archive was not found in R2."
                  : "This local model is also source_path, but no verified private source object key is recorded.",
              },
            ]
          : []),
      ],
    });
  }

  // 4. Thumbnails.
  const thumbnailRoot = projectPath(
    "public",
    "sandbox-assets",
    "myway",
    "thumbnails",
  );
  for (const filePath of
    await listFilesRecursive(
      thumbnailRoot,
    )) {
    if (!claim(filePath)) continue;
    const extension =
      path.extname(filePath);
    const assetId =
      path.basename(
        filePath,
        extension,
      );
    const asset =
      assetsById.get(assetId);
    const tracking =
      trackingForPath(
        filePath,
        git,
      );
    const tracked =
      trackedClassification(
        tracking,
      );
    const objectKey =
      asset?.thumbnail_storage_provider === "r2"
        ? asset.thumbnail_object_key ?? null
        : null;
    const verification =
      objectKey
        ? await checkRuntime(
            objectKey,
          )
        : null;
    const safe = Boolean(
      !tracked.blocked &&
        objectKey &&
        verification?.ok,
    );

    await addItem(items, {
      category:
        "thumbnail_copy",
      classification: safe
        ? "safe_to_remove"
        : asset &&
            asset.thumbnail_storage_provider !== "r2"
          ? "keep"
          : "needs_review",
      project_path:
        projectRelative(filePath),
      absolute_path: filePath,
      asset_id: assetId,
      reason: tracked.blocked
        ? tracked.reason
        : safe
          ? "The asset thumbnail was independently verified in runtime R2."
          : asset &&
              asset.thumbnail_storage_provider !== "r2"
            ? "This thumbnail is still the local review copy for a non-cloud/pending asset."
            : "The R2 thumbnail could not be verified.",
      verifications: [
        {
          kind: "git_tracking",
          ok: tracking.known
            ? !tracking.tracked
            : null,
          detail: tracking.detail,
        },
        {
          kind: "r2_runtime",
          ok: verification?.ok ?? false,
          object_key: objectKey,
          detail: objectKey
            ? verification?.ok
              ? "Thumbnail exists in R2."
              : verification?.error ??
                "Thumbnail was not found in R2."
            : "No R2 thumbnail object key is recorded.",
        },
      ],
    });
  }

  // 5. Historical analysis renders. Phase 2 writes new renders directly to R2.
  // Old local renders are safe only if the asset record now points at a matching
  // remote analysis view and that remote object passes HEAD verification.
  const analysisRoot = projectPath(
    "public",
    "sandbox-assets",
    "myway",
    "analysis",
  );
  for (const filePath of
    await listFilesRecursive(
      analysisRoot,
    )) {
    if (!claim(filePath)) continue;
    const relative = path.relative(
      analysisRoot,
      filePath,
    );
    const parts = relative.split(
      path.sep,
    );
    const assetId = parts[0] ?? "";
    const viewName =
      path.basename(
        filePath,
        path.extname(filePath),
      );
    const asset =
      assetsById.get(assetId);
    const matchingView =
      asset?.appearance_profile
        ?.analysis_views
        ?.find(
          (view) =>
            view.name === viewName &&
            /^https:\/\//i.test(
              view.public_path,
            ),
        );
    const objectKey =
      runtimeObjectKeyFromPublicUrl(
        matchingView?.public_path,
      );
    const verification =
      objectKey
        ? await checkRuntime(
            objectKey,
          )
        : null;
    const tracking =
      trackingForPath(
        filePath,
        git,
      );
    const tracked =
      trackedClassification(
        tracking,
      );
    const safe = Boolean(
      !tracked.blocked &&
        objectKey &&
        verification?.ok,
    );

    await addItem(items, {
      category:
        "analysis_render_copy",
      classification: safe
        ? "safe_to_remove"
        : "needs_review",
      project_path:
        projectRelative(filePath),
      absolute_path: filePath,
      asset_id: assetId || null,
      reason: tracked.blocked
        ? tracked.reason
        : safe
          ? "The corresponding appearance-analysis view is stored at a verified runtime R2 URL."
          : "No matching verified R2 analysis view is currently recorded; Phase 3 will preserve this local render.",
      verifications: [
        {
          kind: "git_tracking",
          ok: tracking.known
            ? !tracking.tracked
            : null,
          detail: tracking.detail,
        },
        {
          kind: "r2_runtime",
          ok: verification?.ok ?? false,
          object_key: objectKey,
          detail: objectKey
            ? verification?.ok
              ? "Analysis render exists in R2."
              : verification?.error ??
                "Analysis render was not found in R2."
            : "The asset record does not contain a matching remote analysis-view URL.",
        },
      ],
    });
  }

  // 6. Raw/source inbox copies. Require the exact asset source_path plus a
  // verified private R2 source object before deletion.
  const inboxRoot = projectPath(
    "sandbox",
    "probe-lab",
    "assets",
    "inbox",
  );
  const sourceAssetByPath =
    new Map<string, MyWayAssetRecord>();
  for (const asset of assets) {
    const sourcePath =
      localPathFromStoredReference(
        asset.source_path,
      );
    if (sourcePath) {
      sourceAssetByPath.set(
        pathKey(sourcePath),
        asset,
      );
    }
  }
  for (const filePath of
    await listFilesRecursive(
      inboxRoot,
    )) {
    if (!claim(filePath)) continue;
    const asset =
      sourceAssetByPath.get(
        pathKey(filePath),
      );
    const objectKey =
      asset?.source_storage_provider === "r2"
        ? asset.source_object_key ?? null
        : null;
    const verification =
      objectKey
        ? await checkSource(
            objectKey,
          )
        : null;
    const tracking =
      trackingForPath(
        filePath,
        git,
      );
    const tracked =
      trackedClassification(
        tracking,
      );
    const safe = Boolean(
      !tracked.blocked &&
        asset &&
        objectKey &&
        verification?.ok,
    );

    await addItem(items, {
      category: "source_copy",
      classification: safe
        ? "safe_to_remove"
        : asset &&
            asset.source_storage_provider !== "r2"
          ? "keep"
          : "needs_review",
      project_path:
        projectRelative(filePath),
      absolute_path: filePath,
      asset_id:
        asset?.asset_id ?? null,
      reason: tracked.blocked
        ? tracked.reason
        : safe
          ? "This exact source_path has a verified private R2 source archive."
          : asset &&
              asset.source_storage_provider !== "r2"
            ? "The asset still depends on this local source because no private R2 source archive is recorded."
            : "This source file could not be tied to a verified private R2 archive.",
      verifications: [
        {
          kind: "git_tracking",
          ok: tracking.known
            ? !tracking.tracked
            : null,
          detail: tracking.detail,
        },
        {
          kind: "r2_source",
          ok: verification?.ok ?? false,
          object_key: objectKey,
          detail: objectKey
            ? verification?.ok
              ? "Private source archive exists in R2."
              : verification?.error ??
                "Private source archive was not found in R2."
            : "No matching asset/private source object key was found.",
        },
      ],
    });
  }

  // 7. Per-asset durable JSON mirrors. In normal cloud mode these are logical
  // references only. Explicit local-mirror mode or Git tracking protects them.
  const metadataRoots = [
    projectPath(
      "sandbox",
      "probe-lab",
      "assets",
      "embeddings",
    ),
    projectPath(
      "sandbox",
      "probe-lab",
      "assets",
      "library",
      "licenses",
    ),
    projectPath(
      "sandbox",
      "probe-lab",
      "assets",
      "library",
      "source-records",
    ),
  ];
  const keepMetadataMirror =
    keepLocalAssetMetadataMirror();
  for (const root of metadataRoots) {
    for (const filePath of
      await listFilesRecursive(root)) {
      if (
        path.extname(filePath)
          .toLowerCase() !== ".json"
      ) {
        continue;
      }
      if (!claim(filePath)) continue;
      const reference =
        projectRelative(filePath);
      let objectKey: string | null = null;
      let verification: R2Check | null = null;
      try {
        objectKey =
          durableJsonCloudKey(
            reference,
          );
        verification =
          await checkSource(
            objectKey,
          );
      } catch {
        objectKey = null;
      }
      const tracking =
        trackingForPath(
          filePath,
          git,
        );
      const tracked =
        trackedClassification(
          tracking,
        );
      const safe = Boolean(
        !keepMetadataMirror &&
          !tracked.blocked &&
          objectKey &&
          verification?.ok,
      );
      await addItem(items, {
        category:
          "durable_metadata_copy",
        classification: safe
          ? "safe_to_remove"
          : keepMetadataMirror
            ? "keep"
            : "needs_review",
        project_path: reference,
        absolute_path: filePath,
        asset_id:
          path.basename(
            filePath,
            ".json",
          ),
        reason: keepMetadataMirror
          ? "MYWAY_KEEP_LOCAL_ASSET_MIRROR is enabled, so this local metadata mirror is intentional."
          : tracked.blocked
            ? tracked.reason
            : safe
              ? "The private R2 durable JSON object was verified and local metadata mirroring is disabled."
              : "The corresponding private R2 metadata object could not be verified.",
        verifications: [
          {
            kind: "git_tracking",
            ok: tracking.known
              ? !tracking.tracked
              : null,
            detail: tracking.detail,
          },
          {
            kind: "r2_source",
            ok: verification?.ok ?? false,
            object_key: objectKey,
            detail: objectKey
              ? verification?.ok
                ? "Private durable metadata exists in R2."
                : verification?.error ??
                  "Private durable metadata was not found in R2."
              : "No supported durable metadata cloud key could be derived.",
          },
        ],
      });
    }
  }

  // 8. Terminal Blender jobs beyond the Phase 1 retention cap. These are
  // bounded transient history, not authoritative assets.
  const historyLimit =
    terminalJobHistoryLimit();
  const keepAllHistory =
    keepAllTerminalJobHistory();
  for (const status of [
    "completed",
    "failed",
  ] as const) {
    const directory = projectPath(
      MYWAY_ASSET_JOB_PROJECT_PATH,
      status,
    );
    const entries = (
      await readdir(
        directory,
        { withFileTypes: true },
      ).catch(() => [])
    ).filter(
      (entry) =>
        entry.isFile() &&
        entry.name
          .toLowerCase()
          .endsWith(".json"),
    );
    const ranked = (
      await Promise.all(
        entries.map(
          async (entry) => {
            const filePath =
              path.join(
                directory,
                entry.name,
              );
            const info =
              await stat(filePath)
                .catch(() => null);
            return {
              filePath,
              modifiedAt:
                info?.mtimeMs ?? 0,
            };
          },
        ),
      )
    ).sort(
      (a, b) =>
        b.modifiedAt -
        a.modifiedAt,
    );

    for (
      let index = 0;
      index < ranked.length;
      index += 1
    ) {
      const filePath =
        ranked[index]!.filePath;
      if (!claim(filePath)) continue;
      const beyondRetention =
        !keepAllHistory &&
        index >= historyLimit;
      const tracking =
        trackingForPath(
          filePath,
          git,
        );
      const tracked =
        trackedClassification(
          tracking,
        );
      const safe =
        beyondRetention &&
        !tracked.blocked;
      await addItem(items, {
        category:
          "terminal_blender_job",
        classification: safe
          ? "safe_to_remove"
          : "keep",
        project_path:
          projectRelative(filePath),
        absolute_path: filePath,
        reason: tracked.blocked
          ? tracked.reason
          : keepAllHistory
            ? "MYWAY_KEEP_BLENDER_JOB_HISTORY is enabled."
            : beyondRetention
              ? `This terminal job is older than the newest ${historyLimit} ${status} job records retained by Phase 1.`
              : `This job is inside the newest ${historyLimit} ${status} records retained by Phase 1.`,
        verifications: [
          {
            kind:
              "retention_policy",
            ok: beyondRetention,
            detail: keepAllHistory
              ? "Full terminal Blender-job history retention is explicitly enabled."
              : `Retention limit is ${historyLimit} per terminal status; this item is rank ${index + 1}.`,
          },
          {
            kind: "git_tracking",
            ok: tracking.known
              ? !tracking.tracked
              : null,
            detail: tracking.detail,
          },
        ],
      });
    }
  }

  // 9. Foundry saved candidates and historical job workspaces. Only a saved
  // candidate with independently verified public/private R2 artifacts can make
  // its source job workspace eligible for cleanup.
  const candidateRoot = projectPath(
    "sandbox",
    "probe-lab",
    "blender-python-builder",
    "candidates",
  );
  const candidateDirectories = (
    await readdir(
      candidateRoot,
      { withFileTypes: true },
    ).catch(() => [])
  ).filter(
    (entry) => entry.isDirectory(),
  );
  const verifiedFoundryByJob =
    new Map<string, FoundryCandidateVerification>();

  for (const entry of candidateDirectories) {
    const candidateDir =
      path.join(
        candidateRoot,
        entry.name,
      );
    const candidatePath =
      path.join(
        candidateDir,
        "candidate.json",
      );
    if (!(await exists(candidatePath))) {
      continue;
    }

    let candidate:
      Record<string, unknown>;
    try {
      candidate = JSON.parse(
        await readFile(
          candidatePath,
          "utf8",
        ),
      ) as Record<string, unknown>;
    } catch {
      continue;
    }

    const candidateId =
      typeof candidate.candidate_id ===
        "string"
        ? candidate.candidate_id
        : entry.name;
    const sourceJobId =
      typeof candidate.source_job_id ===
        "string"
        ? candidate.source_job_id
        : "";
    const cloudStorage =
      candidate.cloud_storage &&
      typeof candidate.cloud_storage ===
        "object" &&
      !Array.isArray(
        candidate.cloud_storage,
      )
        ? candidate.cloud_storage as Record<string, unknown>
        : null;
    const outputs =
      candidate.outputs &&
      typeof candidate.outputs ===
        "object" &&
      !Array.isArray(candidate.outputs)
        ? candidate.outputs as Record<string, unknown>
        : null;
    const verifications:
      Phase3CleanupVerification[] = [];

    let cloudCandidate =
      cloudStorage?.provider === "r2" &&
      Boolean(sourceJobId);

    const privateKeys = [
      cloudStorage?.candidate_metadata_object_key,
      cloudStorage?.source_code_object_key,
      cloudStorage?.blend_source_object_key,
    ].filter(
      (value): value is string =>
        typeof value === "string" &&
        Boolean(value),
    );

    if (
      !privateKeys.some(
        (key) =>
          key.includes(
            "/candidates/",
          ),
      )
    ) {
      cloudCandidate = false;
    }

    for (const objectKey of privateKeys) {
      const verification =
        await checkSource(
          objectKey,
        );
      verifications.push({
        kind: "r2_source",
        ok: verification.ok,
        object_key: objectKey,
        detail: verification.ok
          ? "Foundry private candidate artifact exists in R2."
          : verification.error ??
            "Foundry private candidate artifact was not found in R2.",
      });
      if (!verification.ok) {
        cloudCandidate = false;
      }
    }

    const runtimeUrls: string[] = [];
    if (outputs) {
      for (const [key, value] of
        Object.entries(outputs)) {
        if (
          key === "blend_url" ||
          value == null
        ) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const nested of value) {
            if (
              typeof nested === "string"
            ) {
              runtimeUrls.push(nested);
            }
          }
        } else if (
          typeof value === "string"
        ) {
          runtimeUrls.push(value);
        }
      }
    }

    const requiredRuntimeNames = [
      "glb_url",
      "manifest_url",
    ];
    for (const name of requiredRuntimeNames) {
      if (
        typeof outputs?.[name] !==
          "string"
      ) {
        cloudCandidate = false;
      }
    }

    for (const url of runtimeUrls) {
      const objectKey =
        runtimeObjectKeyFromPublicUrl(
          url,
        );
      if (!objectKey) {
        cloudCandidate = false;
        verifications.push({
          kind: "r2_runtime",
          ok: false,
          object_key: null,
          detail:
            `Foundry output is not a recognized R2 runtime URL: ${url}`,
        });
        continue;
      }
      const verification =
        await checkRuntime(
          objectKey,
        );
      verifications.push({
        kind: "r2_runtime",
        ok: verification.ok,
        object_key: objectKey,
        detail: verification.ok
          ? "Foundry runtime candidate artifact exists in R2."
          : verification.error ??
            "Foundry runtime candidate artifact was not found in R2.",
      });
      if (!verification.ok) {
        cloudCandidate = false;
      }
    }

    if (sourceJobId) {
      verifiedFoundryByJob.set(
        sourceJobId,
        {
          candidate_id: candidateId,
          source_job_id: sourceJobId,
          ok: cloudCandidate,
          verifications,
        },
      );
    }

    if (!claim(candidateDir)) {
      continue;
    }
    const tracking =
      trackingForPath(
        candidateDir,
        git,
      );
    const tracked =
      trackedClassification(
        tracking,
      );
    const safe =
      cloudCandidate &&
      !tracked.blocked &&
      !keepMetadataMirror;
    await addItem(items, {
      category:
        "foundry_candidate_mirror",
      classification: safe
        ? "safe_to_remove"
        : keepMetadataMirror
          ? "keep"
          : "needs_review",
      project_path:
        projectRelative(
          candidateDir,
        ),
      absolute_path:
        candidateDir,
      candidate_id: candidateId,
      source_job_id:
        sourceJobId || null,
      reason: keepMetadataMirror
        ? "Local metadata mirroring is explicitly enabled."
        : tracked.blocked
          ? tracked.reason
          : safe
            ? "The saved Foundry candidate's private and runtime artifacts are verified in R2."
            : "The saved Foundry candidate is not fully verifiable in R2, so its local mirror is retained.",
      verifications: [
        {
          kind: "git_tracking",
          ok: tracking.known
            ? !tracking.tracked
            : null,
          detail: tracking.detail,
        },
        ...verifications,
      ],
    });
  }

  const foundryRoots = [
    {
      root: projectPath(
        "sandbox",
        "probe-lab",
        "blender-python-builder",
        "jobs",
      ),
      public: false,
    },
    {
      root: projectPath(
        "public",
        "sandbox-assets",
        "myway",
        "blender-python-builder",
      ),
      public: true,
    },
  ];

  for (const foundryRoot of foundryRoots) {
    const directories = (
      await readdir(
        foundryRoot.root,
        { withFileTypes: true },
      ).catch(() => [])
    ).filter(
      (entry) => entry.isDirectory(),
    );

    for (const entry of directories) {
      const jobDir = path.join(
        foundryRoot.root,
        entry.name,
      );
      if (!claim(jobDir)) continue;
      const candidate =
        verifiedFoundryByJob.get(
          entry.name,
        );
      const tracking =
        trackingForPath(
          jobDir,
          git,
        );
      const tracked =
        trackedClassification(
          tracking,
        );
      const safe = Boolean(
        candidate?.ok &&
          !tracked.blocked,
      );

      await addItem(items, {
        category:
          "foundry_job_workspace",
        classification: safe
          ? "safe_to_remove"
          : "needs_review",
        project_path:
          projectRelative(jobDir),
        absolute_path: jobDir,
        candidate_id:
          candidate?.candidate_id ??
          null,
        source_job_id:
          entry.name,
        reason: tracked.blocked
          ? tracked.reason
          : safe
            ? "This historical Foundry job has a saved candidate whose runtime/private artifacts are fully verified in R2."
            : "No fully verified R2-backed saved candidate was found for this Foundry job; the workspace is preserved.",
        verifications: [
          {
            kind: "git_tracking",
            ok: tracking.known
              ? !tracking.tracked
              : null,
            detail: tracking.detail,
          },
          ...(candidate?.verifications ?? [
            {
              kind:
                foundryRoot.public
                  ? "r2_runtime" as const
                  : "r2_source" as const,
              ok: false,
              detail:
                "No R2-backed saved candidate could be matched to this source_job_id.",
            },
          ]),
        ],
      });
    }
  }

  items.sort(
    (a, b) =>
      classificationRank(a.classification) -
        classificationRank(b.classification) ||
      b.bytes - a.bytes ||
      a.project_path.localeCompare(
        b.project_path,
      ),
  );

  return {
    schema_version:
      "myway_asset_historical_cleanup_phase3_v1",
    generated_at: now(),
    project_root:
      process.cwd(),
    cloud_enabled: true,
    git_tracking_available:
      git.available,
    local_metadata_mirror_enabled:
      keepMetadataMirror,
    active_blenderkit_job_count:
      activeJobs.activeBlenderKit,
    unreadable_active_blender_job_count:
      activeJobs.unreadable,
    terminal_job_history_limit:
      historyLimit,
    keep_all_terminal_job_history:
      keepAllHistory,
    items,
    summary:
      summarizeItems(items),
  };
}

function classificationRank(
  value: Phase3CleanupClassification,
) {
  if (value === "safe_to_remove") {
    return 0;
  }
  if (value === "needs_review") {
    return 1;
  }
  return 2;
}

function summarizeItems(
  items: Phase3CleanupItem[],
): Record<
  Phase3CleanupClassification,
  Phase3CleanupSummary
> {
  const result: Record<
    Phase3CleanupClassification,
    Phase3CleanupSummary
  > = {
    safe_to_remove: {
      item_count: 0,
      file_count: 0,
      bytes: 0,
    },
    keep: {
      item_count: 0,
      file_count: 0,
      bytes: 0,
    },
    needs_review: {
      item_count: 0,
      file_count: 0,
      bytes: 0,
    },
  };

  for (const item of items) {
    const summary =
      result[item.classification];
    summary.item_count += 1;
    summary.file_count +=
      item.file_count;
    summary.bytes += item.bytes;
  }

  return result;
}

function formatBytes(
  bytes: number,
) {
  if (!Number.isFinite(bytes)) {
    return "0 B";
  }
  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];
  let value = Math.max(
    0,
    bytes,
  );
  let index = 0;
  while (
    value >= 1024 &&
    index < units.length - 1
  ) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(
    index === 0 ? 0 : 2,
  )} ${units[index]}`;
}

function markdownAudit(
  input: {
    mode: "dry_run" | "apply";
    before: Phase3CleanupAudit;
    after: Phase3CleanupAudit | null;
    deleted: Phase3CleanupRunResult["deleted"];
  },
) {
  const lines: string[] = [];
  lines.push(
    "# MyWay Phase 3 historical local asset cleanup",
    "",
    `Generated: ${now()}`,
    `Mode: ${input.mode}`,
    `Project: ${input.before.project_root}`,
    "",
    "## Before",
    "",
  );

  for (const classification of [
    "safe_to_remove",
    "keep",
    "needs_review",
  ] as const) {
    const summary =
      input.before.summary[
        classification
      ];
    lines.push(
      `- ${classification}: ${summary.item_count} item(s), ${summary.file_count} file(s), ${formatBytes(summary.bytes)}`,
    );
  }

  lines.push(
    "",
    `- Git tracking available: ${input.before.git_tracking_available ? "yes" : "no"}`,
    `- Active BlenderKit jobs: ${input.before.active_blenderkit_job_count}`,
    `- Unreadable active Blender jobs: ${input.before.unreadable_active_blender_job_count}`,
    `- Local metadata mirror enabled: ${input.before.local_metadata_mirror_enabled ? "yes" : "no"}`,
  );

  if (input.mode === "apply") {
    lines.push(
      "",
      "## Deleted",
      "",
      `- ${input.deleted.item_count} cleanup item(s)`,
      `- ${input.deleted.file_count} file(s)`,
      `- ${formatBytes(input.deleted.bytes)} reclaimed from verified-safe items`,
    );
  }

  if (input.after) {
    lines.push(
      "",
      "## After",
      "",
    );
    for (const classification of [
      "safe_to_remove",
      "keep",
      "needs_review",
    ] as const) {
      const summary =
        input.after.summary[
          classification
        ];
      lines.push(
        `- ${classification}: ${summary.item_count} item(s), ${summary.file_count} file(s), ${formatBytes(summary.bytes)}`,
      );
    }
  }

  for (const classification of [
    "safe_to_remove",
    "needs_review",
    "keep",
  ] as const) {
    const selected =
      input.before.items.filter(
        (item) =>
          item.classification ===
          classification,
      );
    lines.push(
      "",
      `## ${classification.replaceAll("_", " ").toUpperCase()}`,
      "",
    );
    if (!selected.length) {
      lines.push("None.");
      continue;
    }
    for (const item of selected) {
      lines.push(
        `- **${formatBytes(item.bytes)}** — \`${item.project_path}\` — ${item.reason}`,
      );
    }
  }

  lines.push(
    "",
    "## Safety rule",
    "",
    "Apply mode deletes only items that the same fresh audit classifies as `safe_to_remove`. Git-tracked files, active/pending assets, missing R2 objects, unmatched historical artifacts, and ambiguous Foundry outputs are never auto-deleted.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function reportDirectory() {
  const configured =
    process.env.MYWAY_CLEANUP_REPORT_DIR
      ?.trim();
  const base = configured
    ? path.resolve(configured)
    : path.join(
        os.homedir(),
        "Documents",
        "MyWayCleanupReports",
      );
  if (
    isInside(
      base,
      process.cwd(),
    )
  ) {
    throw new Error(
      "MYWAY_CLEANUP_REPORT_DIR must be outside the MyWay project so cleanup reports do not create repository growth.",
    );
  }
  const stamp = now()
    .replace(/[:.]/g, "-");
  const directory = path.join(
    base,
    `phase3-${stamp}`,
  );
  const { mkdir } =
    await import(
      "node:fs/promises"
    );
  await mkdir(
    directory,
    { recursive: true },
  );
  return directory;
}

async function removeEmptyChildren(
  root: string,
) {
  if (!(await exists(root))) return;
  const directories: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = await readdir(
      current,
      { withFileTypes: true },
    ).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(
        current,
        entry.name,
      );
      directories.push(child);
      stack.push(child);
    }
  }
  directories.sort(
    (a, b) =>
      b.length - a.length,
  );
  for (const directory of directories) {
    const entries = await readdir(
      directory,
    ).catch(() => ["unknown"]);
    if (entries.length === 0) {
      await rm(
        directory,
        { recursive: true, force: true },
      );
    }
  }
}

async function cleanupEmptyGeneratedDirectories() {
  const roots = [
    "public/sandbox-assets/myway/models",
    "public/sandbox-assets/myway/thumbnails",
    "public/sandbox-assets/myway/analysis",
    "sandbox/probe-lab/assets/inbox",
    "sandbox/probe-lab/assets/enrichment/cache",
    "sandbox/probe-lab/assets/jobs/completed",
    "sandbox/probe-lab/assets/jobs/failed",
    "sandbox/probe-lab/blender-python-builder/jobs",
    "sandbox/probe-lab/blender-python-builder/candidates",
    "public/sandbox-assets/myway/blender-python-builder",
  ];
  for (const root of roots) {
    await removeEmptyChildren(
      projectPath(
        ...root.split("/"),
      ),
    );
  }
}

export async function runHistoricalLocalAssetCleanup(
  input: {
    apply?: boolean;
    confirmation?: string | null;
  } = {},
): Promise<Phase3CleanupRunResult> {
  const apply = input.apply === true;
  if (
    apply &&
    input.confirmation !==
      APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Apply mode requires --confirm=${APPLY_CONFIRMATION}. No files were deleted.`,
    );
  }

  const before =
    await auditHistoricalLocalAssetStorage();
  const deleted = {
    item_count: 0,
    file_count: 0,
    bytes: 0,
    paths: [] as string[],
  };

  if (apply) {
    for (const item of before.items) {
      if (
        item.classification !==
        "safe_to_remove"
      ) {
        continue;
      }
      if (
        !isInsideAllowedGeneratedRoot(
          item.absolute_path,
        )
      ) {
        throw new Error(
          `Refusing to delete a path outside Phase 3 generated roots: ${item.absolute_path}`,
        );
      }
      await rm(
        item.absolute_path,
        {
          recursive: true,
          force: true,
        },
      );
      deleted.item_count += 1;
      deleted.file_count +=
        item.file_count;
      deleted.bytes += item.bytes;
      deleted.paths.push(
        item.project_path,
      );
    }
    await cleanupEmptyGeneratedDirectories();
  }

  const after = apply
    ? await auditHistoricalLocalAssetStorage()
    : null;
  const directory =
    await reportDirectory();
  const jsonPath = path.join(
    directory,
    apply
      ? "phase3-cleanup-applied.json"
      : "phase3-cleanup-dry-run.json",
  );
  const markdownPath = path.join(
    directory,
    apply
      ? "phase3-cleanup-applied.md"
      : "phase3-cleanup-dry-run.md",
  );
  const result: Phase3CleanupRunResult = {
    mode: apply
      ? "apply"
      : "dry_run",
    report_directory:
      directory,
    json_report_path:
      jsonPath,
    markdown_report_path:
      markdownPath,
    before,
    after,
    deleted,
  };
  const { writeFile } =
    await import(
      "node:fs/promises"
    );
  await Promise.all([
    writeFile(
      jsonPath,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      markdownPath,
      markdownAudit({
        mode: result.mode,
        before,
        after,
        deleted,
      }),
      "utf8",
    ),
  ]);

  return result;
}

export function phase3ApplyConfirmation() {
  return APPLY_CONFIRMATION;
}
