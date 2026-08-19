import { mkdir, rename as renameFile, stat } from "node:fs/promises";
import path from "node:path";

import type { MyWayAssetAppearanceView, MyWayAssetRecord } from "./asset-types";
import {
  projectPath,
  publicUrlToProjectPath,
} from "./paths.server";
import {
  deleteDurableAssetJson,
  readDurableAssetJson,
  runtimeObjectKeyFromPublicUrl,
  writeDurableAssetJson,
} from "./storage/asset-durable-artifacts.server";
import {
  pendingAssetModelObjectKey,
  pendingAssetProxyUrl,
  pendingAssetThumbnailObjectKey,
} from "./storage/pending-asset-storage.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "./storage/r2-asset-storage.server";

type RollbackAction = () => Promise<void>;
type CommitAction = () => Promise<void>;

function replaceAllExactStrings(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === "string") {
    let next = value;
    for (const [from, to] of replacements) {
      next = next.split(from).join(to);
    }
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      replaceAllExactStrings(item, replacements),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, item]) => [
          key,
          replaceAllExactStrings(item, replacements),
        ],
      ),
    );
  }
  return value;
}

function replaceAssetIdInKey(
  key: string,
  previousAssetId: string,
  nextAssetId: string,
) {
  return key.includes(previousAssetId)
    ? key.split(previousAssetId).join(nextAssetId)
    : key;
}

async function localFileExists(filePath: string) {
  try {
    return (await stat(filePath)).isFile();
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw caught;
  }
}

async function copyVerifiedR2Object(input: {
  storage: ReturnType<typeof getR2RuntimeStorage>;
  oldKey: string;
  newKey: string;
  nextAssetId: string;
  kind: string;
}) {
  if (input.oldKey === input.newKey) {
    const existing = await input.storage.read(input.oldKey);
    if (!existing) {
      throw new Error(
        `Cloud object is missing before identity migration: ${input.oldKey}`,
      );
    }
    return {
      object: existing,
      created: false,
    };
  }

  const source = await input.storage.read(input.oldKey);
  if (!source) {
    throw new Error(
      `Cloud object is missing before identity migration: ${input.oldKey}`,
    );
  }

  const existing = await input.storage.read(input.newKey);
  if (existing) {
    const same =
      Buffer.from(existing.body).equals(Buffer.from(source.body));
    if (!same) {
      throw new Error(
        `Cloud identity migration conflict: ${input.newKey} already exists with different bytes.`,
      );
    }
    return {
      object: existing,
      created: false,
    };
  }

  const uploaded = await input.storage.uploadBytes({
    body: source.body,
    object_key: input.newKey,
    content_type:
      source.content_type ||
      (input.kind === "thumbnail" || input.kind === "analysis"
        ? "image/png"
        : "application/octet-stream"),
    visibility: input.storage.visibility,
    cache_control:
      input.storage.visibility === "public"
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
    metadata: {
      "asset-id": input.nextAssetId,
      "identity-migrated-from": input.oldKey,
      "artifact-kind": input.kind,
    },
  });

  const verified = await input.storage.read(uploaded.object_key);
  if (
    !verified ||
    !Buffer.from(verified.body).equals(Buffer.from(source.body))
  ) {
    await input.storage.delete(uploaded.object_key).catch(() => undefined);
    throw new Error(
      `Cloud identity migration verification failed: ${input.oldKey} → ${input.newKey}`,
    );
  }

  return {
    object: verified,
    created: true,
  };
}

export type PreparedAssetIdentityStorageMigration = {
  assetPatch: Partial<MyWayAssetRecord>;
  replacements: Map<string, string>;
  movedArtifacts: string[];
  commit(): Promise<void>;
  rollback(): Promise<void>;
};

export async function prepareAssetIdentityStorageMigration(input: {
  asset: MyWayAssetRecord;
  nextAssetId: string;
}): Promise<PreparedAssetIdentityStorageMigration> {
  const previousAssetId = input.asset.asset_id;
  const nextAssetId = input.nextAssetId;
  const replacements = new Map<string, string>([
    [previousAssetId, nextAssetId],
  ]);
  const patch: Partial<MyWayAssetRecord> = {};
  const rollbackActions: RollbackAction[] = [];
  const commitActions: CommitAction[] = [];
  const movedArtifacts: string[] = [];

  async function migrateR2Ref(args: {
    provider: "r2" | "r2_private_pending";
    oldKey: string | null | undefined;
    newKey: string;
    kind: string;
  }) {
    if (!args.oldKey) return null;
    const oldKey = args.oldKey;
    const storage =
      args.provider === "r2"
        ? getR2RuntimeStorage()
        : getR2SourceStorage();
    const copied = await copyVerifiedR2Object({
      storage,
      oldKey,
      newKey: args.newKey,
      nextAssetId,
      kind: args.kind,
    });
    if (oldKey !== args.newKey) {
      replacements.set(oldKey, args.newKey);
      movedArtifacts.push(
        `${args.provider}:${oldKey} → ${args.newKey}`,
      );
      if (copied.created) {
        rollbackActions.push(async () => {
          await storage.delete(args.newKey);
        });
      }
      commitActions.push(async () => {
        await storage.delete(oldKey);
      });
    }
    return copied.object;
  }

  try {
    if (
      input.asset.storage_provider === "r2_private_pending" &&
      input.asset.storage_object_key
    ) {
      const nextKey = pendingAssetModelObjectKey(nextAssetId);
      const migrated = await migrateR2Ref({
        provider: "r2_private_pending",
        oldKey: input.asset.storage_object_key,
        newKey: nextKey,
        kind: "model",
      });
      patch.storage_object_key = nextKey;
      patch.storage_etag = migrated?.etag ?? input.asset.storage_etag ?? null;
      patch.public_path = pendingAssetProxyUrl(nextAssetId, "model");
      replacements.set(
        input.asset.public_path,
        patch.public_path,
      );
    } else if (
      input.asset.storage_provider === "r2" &&
      input.asset.storage_object_key
    ) {
      const nextKey = replaceAssetIdInKey(
        input.asset.storage_object_key,
        previousAssetId,
        nextAssetId,
      );
      const migrated = await migrateR2Ref({
        provider: "r2",
        oldKey: input.asset.storage_object_key,
        newKey: nextKey,
        kind: "model",
      });
      patch.storage_object_key = nextKey;
      patch.storage_etag = migrated?.etag ?? input.asset.storage_etag ?? null;
      if (input.asset.public_path.includes(previousAssetId)) {
        const nextPublic = input.asset.public_path
          .split(previousAssetId)
          .join(nextAssetId);
        patch.public_path = nextPublic;
        replacements.set(input.asset.public_path, nextPublic);
      }
    } else if (input.asset.storage_provider === "local") {
      const currentPath = publicUrlToProjectPath(input.asset.public_path);
      if (!currentPath || !(await localFileExists(currentPath))) {
        throw new Error(
          `Local model is missing before identity migration: ${input.asset.public_path}`,
        );
      }
      const nextPath = currentPath.includes(previousAssetId)
        ? currentPath.split(previousAssetId).join(nextAssetId)
        : currentPath;
      if (nextPath !== currentPath) {
        await mkdir(path.dirname(nextPath), { recursive: true });
        await renameFile(currentPath, nextPath);
        rollbackActions.push(async () => {
          await renameFile(nextPath, currentPath);
        });
        movedArtifacts.push(`local:${currentPath} → ${nextPath}`);
        const nextPublic = input.asset.public_path
          .split(previousAssetId)
          .join(nextAssetId);
        patch.public_path = nextPublic;
        replacements.set(input.asset.public_path, nextPublic);
      }
    }

    if (
      input.asset.thumbnail_storage_provider === "r2_private_pending" &&
      input.asset.thumbnail_object_key
    ) {
      const nextKey = pendingAssetThumbnailObjectKey(nextAssetId);
      const migrated = await migrateR2Ref({
        provider: "r2_private_pending",
        oldKey: input.asset.thumbnail_object_key,
        newKey: nextKey,
        kind: "thumbnail",
      });
      patch.thumbnail_object_key = nextKey;
      patch.thumbnail_etag = migrated?.etag ?? input.asset.thumbnail_etag ?? null;
      if (input.asset.thumbnail_path) {
        const nextPublic = pendingAssetProxyUrl(nextAssetId, "thumbnail");
        patch.thumbnail_path = nextPublic;
        replacements.set(input.asset.thumbnail_path, nextPublic);
      }
    } else if (
      input.asset.thumbnail_storage_provider === "r2" &&
      input.asset.thumbnail_object_key
    ) {
      const nextKey = replaceAssetIdInKey(
        input.asset.thumbnail_object_key,
        previousAssetId,
        nextAssetId,
      );
      const migrated = await migrateR2Ref({
        provider: "r2",
        oldKey: input.asset.thumbnail_object_key,
        newKey: nextKey,
        kind: "thumbnail",
      });
      patch.thumbnail_object_key = nextKey;
      patch.thumbnail_etag = migrated?.etag ?? input.asset.thumbnail_etag ?? null;
      if (
        input.asset.thumbnail_path &&
        input.asset.thumbnail_path.includes(previousAssetId)
      ) {
        const nextPublic = input.asset.thumbnail_path
          .split(previousAssetId)
          .join(nextAssetId);
        patch.thumbnail_path = nextPublic;
        replacements.set(input.asset.thumbnail_path, nextPublic);
      }
    } else if (
      input.asset.thumbnail_storage_provider === "local" &&
      input.asset.thumbnail_path
    ) {
      const currentPath = publicUrlToProjectPath(input.asset.thumbnail_path);
      if (!currentPath || !(await localFileExists(currentPath))) {
        throw new Error(
          `Local thumbnail is missing before identity migration: ${input.asset.thumbnail_path}`,
        );
      }
      const nextPath = currentPath.includes(previousAssetId)
        ? currentPath.split(previousAssetId).join(nextAssetId)
        : currentPath;
      if (nextPath !== currentPath) {
        await mkdir(path.dirname(nextPath), { recursive: true });
        await renameFile(currentPath, nextPath);
        rollbackActions.push(async () => {
          await renameFile(nextPath, currentPath);
        });
        movedArtifacts.push(`local:${currentPath} → ${nextPath}`);
        const nextPublic = input.asset.thumbnail_path
          .split(previousAssetId)
          .join(nextAssetId);
        patch.thumbnail_path = nextPublic;
        replacements.set(input.asset.thumbnail_path, nextPublic);
      }
    }

    if (
      input.asset.source_storage_provider === "r2" &&
      input.asset.source_object_key
    ) {
      const nextKey = replaceAssetIdInKey(
        input.asset.source_object_key,
        previousAssetId,
        nextAssetId,
      );
      const migrated = await migrateR2Ref({
        provider: "r2_private_pending",
        oldKey: input.asset.source_object_key,
        newKey: nextKey,
        kind: "source",
      });
      patch.source_object_key = nextKey;
      patch.source_storage_etag =
        migrated?.etag ?? input.asset.source_storage_etag ?? null;
    }

    if (
      input.asset.appearance_profile?.analysis_views?.length
    ) {
      const nextViews: MyWayAssetAppearanceView[] = [];
      for (const view of input.asset.appearance_profile.analysis_views) {
        const oldKey = runtimeObjectKeyFromPublicUrl(view.public_path);
        if (!oldKey || !oldKey.includes(previousAssetId)) {
          nextViews.push(view);
          continue;
        }
        const nextKey = oldKey.split(previousAssetId).join(nextAssetId);
        const migrated = await migrateR2Ref({
          provider: "r2",
          oldKey,
          newKey: nextKey,
          kind: "analysis",
        });
        const nextPublic = view.public_path
          .split(previousAssetId)
          .join(nextAssetId);
        replacements.set(view.public_path, nextPublic);
        nextViews.push({
          ...view,
          public_path: nextPublic,
        });
      }
      patch.appearance_profile = {
        ...input.asset.appearance_profile,
        analysis_views: nextViews,
      };
    }

    const conventionalSourcePath =
      `sandbox/probe-lab/assets/library/source-records/${previousAssetId}.json`;
    const nextSourcePath =
      `sandbox/probe-lab/assets/library/source-records/${nextAssetId}.json`;
    const sourceRecord =
      await readDurableAssetJson<Record<string, unknown>>(
        conventionalSourcePath,
      );
    if (sourceRecord) {
      replacements.set(conventionalSourcePath, nextSourcePath);
      await writeDurableAssetJson(
        nextSourcePath,
        replaceAllExactStrings(sourceRecord, replacements),
      );
      rollbackActions.push(async () => {
        await deleteDurableAssetJson(nextSourcePath);
      });
      commitActions.push(async () => {
        await deleteDurableAssetJson(conventionalSourcePath);
      });
      movedArtifacts.push(
        `durable:${conventionalSourcePath} → ${nextSourcePath}`,
      );
    }

    if (
      input.asset.license_record_path &&
      input.asset.license_record_path.includes(previousAssetId)
    ) {
      const previousLicensePath = input.asset.license_record_path;
      const nextLicensePath = previousLicensePath
        .split(previousAssetId)
        .join(nextAssetId);
      const license =
        await readDurableAssetJson<Record<string, unknown>>(
          previousLicensePath,
        );
      if (license) {
        replacements.set(previousLicensePath, nextLicensePath);
        await writeDurableAssetJson(
          nextLicensePath,
          replaceAllExactStrings(license, replacements),
        );
        patch.license_record_path = nextLicensePath;
        rollbackActions.push(async () => {
          await deleteDurableAssetJson(nextLicensePath);
        });
        commitActions.push(async () => {
          await deleteDurableAssetJson(previousLicensePath);
        });
        movedArtifacts.push(
          `durable:${previousLicensePath} → ${nextLicensePath}`,
        );
      }
    }
  } catch (caught) {
    for (const action of rollbackActions.slice().reverse()) {
      await action().catch(() => undefined);
    }
    throw caught;
  }

  return {
    assetPatch: patch,
    replacements,
    movedArtifacts,
    async commit() {
      for (const action of commitActions) {
        await action().catch(() => undefined);
      }
    },
    async rollback() {
      for (const action of rollbackActions.slice().reverse()) {
        await action().catch(() => undefined);
      }
    },
  };
}
