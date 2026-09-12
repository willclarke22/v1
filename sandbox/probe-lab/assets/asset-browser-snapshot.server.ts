import type { MyWayAssetRecord } from "./asset-types";
import { loadMyWayAssetRegistry } from "./asset-library.server";

export type AssetBrowserRegistrySnapshot = {
  client_revision: string;
  built_at_ms: number;
  expires_at_ms: number;
  registry_updated_at: string;
  assets: MyWayAssetRecord[];
  by_reference: Map<string, MyWayAssetRecord>;
};

const ASSET_BROWSER_SNAPSHOT_TTL_MS = 5 * 60_000;
const MAX_SNAPSHOT_REVISIONS = 6;

const snapshotCache = new Map<string, AssetBrowserRegistrySnapshot>();
const snapshotBuilds = new Map<string, Promise<AssetBrowserRegistrySnapshot>>();

function normalizedReference(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function addReference(
  map: Map<string, MyWayAssetRecord>,
  reference: string | null | undefined,
  asset: MyWayAssetRecord,
) {
  const key = normalizedReference(reference);
  if (key && !map.has(key)) map.set(key, asset);
}

function pruneSnapshots() {
  const now = Date.now();
  for (const [key, snapshot] of snapshotCache.entries()) {
    if (snapshot.expires_at_ms <= now) snapshotCache.delete(key);
  }

  while (snapshotCache.size > MAX_SNAPSHOT_REVISIONS) {
    const oldest = [...snapshotCache.entries()].sort(
      (left, right) => left[1].built_at_ms - right[1].built_at_ms,
    )[0];
    if (!oldest) break;
    snapshotCache.delete(oldest[0]);
  }
}

async function buildSnapshot(
  clientRevision: string,
): Promise<AssetBrowserRegistrySnapshot> {
  const registry = await loadMyWayAssetRegistry();
  const byReference = new Map<string, MyWayAssetRecord>();

  for (const asset of registry.assets) {
    addReference(byReference, asset.asset_id, asset);
    addReference(byReference, asset.asset_uid, asset);
    for (const legacyId of asset.legacy_asset_ids ?? []) {
      addReference(byReference, legacyId, asset);
    }
  }

  const builtAt = Date.now();
  return {
    client_revision: clientRevision,
    built_at_ms: builtAt,
    expires_at_ms: builtAt + ASSET_BROWSER_SNAPSHOT_TTL_MS,
    registry_updated_at: registry.updated_at,
    assets: registry.assets,
    by_reference: byReference,
  };
}

export async function getAssetBrowserRegistrySnapshot(
  clientRevision = "0",
) {
  const revision = clientRevision.trim() || "0";
  pruneSnapshots();

  const cached = snapshotCache.get(revision);
  if (cached && cached.expires_at_ms > Date.now()) {
    return cached;
  }

  const building = snapshotBuilds.get(revision);
  if (building) return building;

  const promise = buildSnapshot(revision);
  snapshotBuilds.set(revision, promise);

  try {
    const snapshot = await promise;
    snapshotCache.set(revision, snapshot);
    pruneSnapshots();
    return snapshot;
  } finally {
    if (snapshotBuilds.get(revision) === promise) {
      snapshotBuilds.delete(revision);
    }
  }
}

export async function getAssetBrowserRegistryAsset(
  reference: string,
  clientRevision = "0",
) {
  const snapshot = await getAssetBrowserRegistrySnapshot(clientRevision);
  return snapshot.by_reference.get(normalizedReference(reference)) ?? null;
}

export function invalidateAssetBrowserRegistrySnapshot(
  clientRevision?: string,
) {
  if (clientRevision?.trim()) {
    snapshotCache.delete(clientRevision.trim());
    snapshotBuilds.delete(clientRevision.trim());
    return;
  }
  snapshotCache.clear();
  snapshotBuilds.clear();
}
