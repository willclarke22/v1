import { NextRequest, NextResponse } from "next/server";

import type { MyWayAssetRecord } from "../asset-types";
import { getAssetBrowserRegistrySnapshot } from "../asset-browser-snapshot.server";

type ListedAsset = MyWayAssetRecord;

type BrowserIndexEntry = {
  asset: ListedAsset;
  search_text: string;
  source: string;
  domain: string;
  status: string;
  scene_review: string;
  license: string;
};

type BrowserIndexSnapshot = {
  client_revision: string;
  built_at_ms: number;
  expires_at_ms: number;
  entries: BrowserIndexEntry[];
  sorted: {
    newest: BrowserIndexEntry[];
    name: BrowserIndexEntry[];
    source: BrowserIndexEntry[];
    reuse: BrowserIndexEntry[];
  };
  counts: {
    all: number;
    needs_review: number;
    approved: number;
    rejected: number;
  };
  facets: {
    sources: string[];
    domains: string[];
    statuses: string[];
    scene_review_statuses: string[];
    licenses: string[];
  };
  stats: {
    files_available: number;
    automatically_acquired: number;
    identity_verified: number;
    scene_approved: number;
  };
};

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;
const BROWSER_INDEX_TTL_MS = 5 * 60_000;

let browserIndexCache: BrowserIndexSnapshot | null = null;
let browserIndexBuild:
  | {
      client_revision: string;
      promise: Promise<BrowserIndexSnapshot>;
    }
  | null = null;

function errorText(caught: unknown) {
  const raw = caught instanceof Error ? caught.message : String(caught);
  return raw.trim() || "Unknown Asset Library browser error.";
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .sort((left, right) => left.localeCompare(right));
}

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function searchableText(asset: ListedAsset) {
  const appearance = asset.appearance_profile;
  const membership = asset.collection_membership;
  return [
    asset.asset_id,
    asset.canonical_label,
    asset.display_name,
    asset.domain,
    asset.source_type,
    asset.status,
    asset.scene_review_status,
    asset.semantic_review_status,
    asset.license_kind,
    asset.license_status,
    asset.notes ?? "",
    asset.source_prompt ?? "",
    asset.requested_concept ?? "",
    asset.source_display_name ?? "",
    asset.verified_canonical_label ?? "",
    asset.attribution?.source_asset_id ?? "",
    membership?.collection_id ?? "",
    membership?.member_id ?? "",
    membership?.concept_name ?? "",
    ...(membership?.group_tags ?? []),
    ...asset.aliases,
    ...(asset.verified_aliases ?? []),
    ...asset.semantic_tags,
    ...(appearance?.style_descriptors ?? []),
    ...(appearance?.design_era ?? []),
    ...(appearance?.realism_level ?? []),
    ...(appearance?.shape_language ?? []),
    ...(appearance?.material_treatment ?? []),
    ...(appearance?.color_palette ?? []),
    ...(appearance?.surface_condition ?? []),
    ...(appearance?.ornamentation ?? []),
    ...(appearance?.visual_mood ?? []),
    ...(appearance?.detail_level ?? []),
    ...(appearance?.scene_compatibility ?? []),
    ...(appearance?.descriptors ?? []),
    ...(appearance?.colors ?? []),
    ...(appearance?.geometry ?? []),
    appearance?.summary ?? "",
    ...(asset.contains ?? []),
    ...(asset.affordances ?? []),
    ...(asset.preferred_for_concepts ?? []),
  ].join(" ").toLowerCase();
}

function matchesReview(asset: ListedAsset, review: string) {
  if (review === "needs_review") return asset.scene_review_status === "pending";
  if (review === "approved") return asset.scene_review_status === "approved";
  if (review === "rejected") return asset.scene_review_status === "rejected";
  if (review === "acquiring") return false;
  return true;
}

function entryForAsset(asset: ListedAsset): BrowserIndexEntry {
  return {
    asset,
    search_text: searchableText(asset),
    source: normalized(asset.source_type),
    domain: normalized(asset.domain),
    status: normalized(asset.status),
    scene_review: normalized(asset.scene_review_status),
    license: normalized(asset.license_kind),
  };
}

async function buildBrowserIndex(
  clientRevision: string,
): Promise<BrowserIndexSnapshot> {
  const registry = await getAssetBrowserRegistrySnapshot(clientRevision);
  const entries = registry.assets.map(entryForAsset);

  const counts = {
    all: entries.length,
    needs_review: entries.filter(
      (entry) => entry.asset.scene_review_status === "pending",
    ).length,
    approved: entries.filter(
      (entry) => entry.asset.scene_review_status === "approved",
    ).length,
    rejected: entries.filter(
      (entry) => entry.asset.scene_review_status === "rejected",
    ).length,
  };

  const facets = {
    sources: uniqueSorted(entries.map((entry) => entry.asset.source_type)),
    domains: uniqueSorted(entries.map((entry) => entry.asset.domain)),
    statuses: uniqueSorted(entries.map((entry) => entry.asset.status)),
    scene_review_statuses: uniqueSorted(
      entries.map((entry) => entry.asset.scene_review_status),
    ),
    licenses: uniqueSorted(entries.map((entry) => entry.asset.license_kind)),
  };

  const stats = {
    files_available: entries.filter(
      (entry) => Boolean(entry.asset.public_path),
    ).length,
    automatically_acquired: entries.filter(
      (entry) =>
        entry.asset.source_type === "blenderkit" ||
        entry.asset.source_type === "trellis",
    ).length,
    identity_verified: entries.filter(
      (entry) => entry.asset.semantic_review_status === "verified",
    ).length,
    scene_approved: counts.approved,
  };

  const byName = [...entries].sort((left, right) =>
    left.asset.display_name.localeCompare(right.asset.display_name),
  );
  const bySource = [...entries].sort(
    (left, right) =>
      left.asset.source_type.localeCompare(right.asset.source_type) ||
      left.asset.display_name.localeCompare(right.asset.display_name),
  );
  const byReuse = [...entries].sort(
    (left, right) =>
      right.asset.reuse_count - left.asset.reuse_count ||
      left.asset.display_name.localeCompare(right.asset.display_name),
  );
  const byNewest = [...entries].sort(
    (left, right) =>
      Date.parse(right.asset.created_at) - Date.parse(left.asset.created_at) ||
      left.asset.display_name.localeCompare(right.asset.display_name),
  );

  const builtAt = Date.now();
  return {
    client_revision: clientRevision,
    built_at_ms: builtAt,
    expires_at_ms: builtAt + BROWSER_INDEX_TTL_MS,
    entries,
    sorted: {
      newest: byNewest,
      name: byName,
      source: bySource,
      reuse: byReuse,
    },
    counts,
    facets,
    stats,
  };
}

async function browserIndex(
  clientRevision: string,
): Promise<BrowserIndexSnapshot> {
  if (
    browserIndexCache &&
    browserIndexCache.client_revision === clientRevision &&
    browserIndexCache.expires_at_ms > Date.now()
  ) {
    return browserIndexCache;
  }

  if (
    browserIndexBuild &&
    browserIndexBuild.client_revision === clientRevision
  ) {
    return browserIndexBuild.promise;
  }

  const promise = buildBrowserIndex(clientRevision);
  browserIndexBuild = {
    client_revision: clientRevision,
    promise,
  };

  try {
    const snapshot = await promise;
    browserIndexCache = snapshot;
    return snapshot;
  } finally {
    if (browserIndexBuild?.promise === promise) {
      browserIndexBuild = null;
    }
  }
}


function versionedThumbnailPath(
  asset: ListedAsset,
) {
  const path = asset.thumbnail_path?.trim() || null;
  if (!path) return null;
  if (
    asset.thumbnail_storage_provider !== "r2_private_pending" ||
    !path.startsWith("/api/sandbox/probe-lab/assets/pending-file")
  ) {
    return path;
  }

  const params = new URLSearchParams({
    v: asset.thumbnail_etag || asset.thumbnail_object_key || asset.asset_id,
  });
  return `${path}&${params.toString()}`;
}

function browserCardSummary(asset: ListedAsset) {
  const storageProvider = asset.storage_provider ?? "local";
  return {
    asset_id: asset.asset_id,
    canonical_label: asset.canonical_label,
    display_name: asset.display_name,
    requested_concept: asset.requested_concept ?? null,
    source_display_name: asset.source_display_name ?? null,
    verified_canonical_label: asset.verified_canonical_label ?? null,
    source_type: asset.source_type,
    domain: asset.domain,
    asset_type: asset.asset_type,
    status: asset.status,
    scene_review_status: asset.scene_review_status,
    semantic_review_status: asset.semantic_review_status,
    license_kind: asset.license_kind,
    thumbnail_path: versionedThumbnailPath(asset),
    thumbnail_storage_provider: asset.thumbnail_storage_provider ?? null,
    thumbnail_etag: asset.thumbnail_etag ?? null,
    public_path: asset.public_path,
    storage_provider: asset.storage_provider ?? "local",
    dimensions_m: asset.dimensions_m,
    default_scale: asset.default_scale,
    default_rotation: asset.default_rotation,
    ground_offset_m: asset.ground_offset_m,
    geometry_profile: asset.geometry_profile?.local_bounds
      ? { local_bounds: asset.geometry_profile.local_bounds }
      : null,
    collection_membership: asset.collection_membership
      ? {
          collection_id: asset.collection_membership.collection_id,
          member_id: asset.collection_membership.member_id,
          concept_name: asset.collection_membership.concept_name,
          group_tags: asset.collection_membership.group_tags ?? [],
        }
      : null,
    appearance_profile: { status: asset.appearance_profile?.status ?? "pending" },
    appearance_embedding: {
      status: asset.appearance_embedding?.status ?? "pending",
      vector_key: asset.appearance_embedding?.vector_key ?? null,
    },
    file_stats: {
      exists: Boolean(asset.public_path),
      file_size_bytes: asset.file_size_bytes ?? null,
      project_relative_path: null,
      storage_provider: storageProvider,
      remote_url: null,
      verification: "registry_metadata",
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const clientRevision =
      params.get("revision")?.trim() || "0";
    const snapshot = await browserIndex(clientRevision);

    const review = normalized(params.get("review")) || "needs_review";
    const source = normalized(params.get("source"));
    const domain = normalized(params.get("domain"));
    const status = normalized(params.get("status"));
    const sceneReview = normalized(params.get("scene_review"));
    const license = normalized(params.get("license"));
    const sort = normalized(params.get("sort")) || "newest";
    const queryTokens = normalized(params.get("q")).split(/\s+/).filter(Boolean);
    const offset = Math.max(0, Number.parseInt(params.get("offset") ?? "0", 10) || 0);
    const requestedLimit = Number.parseInt(params.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));

    const counts = snapshot.counts;
    const facets = snapshot.facets;
    const stats = snapshot.stats;

    const ordered =
      sort === "name"
        ? snapshot.sorted.name
        : sort === "source"
          ? snapshot.sorted.source
          : sort === "reuse"
            ? snapshot.sorted.reuse
            : snapshot.sorted.newest;

    const filtered = ordered.filter((entry) => {
      const asset = entry.asset;
      if (!matchesReview(asset, review)) return false;
      if (source && source !== "all" && entry.source !== source) return false;
      if (domain && domain !== "all" && entry.domain !== domain) return false;
      if (status && status !== "all" && entry.status !== status) return false;
      if (
        sceneReview &&
        sceneReview !== "all" &&
        entry.scene_review !== sceneReview
      ) return false;
      if (license && license !== "all" && entry.license !== license) return false;
      if (!queryTokens.length) return true;
      return queryTokens.every((token) => entry.search_text.includes(token));
    });

    const page = filtered.slice(offset, offset + limit);
    const assets = page.map((entry) => browserCardSummary(entry.asset));

    return NextResponse.json({
      ok: true,
      total: filtered.length,
      offset,
      limit,
      counts,
      facets,
      stats,
      assets,
      browser_index: {
        built_at_ms: snapshot.built_at_ms,
        expires_at_ms: snapshot.expires_at_ms,
        client_revision: snapshot.client_revision,
      },
    });
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        error: errorText(caught),
        error_stage: "library_browser",
      },
      { status: 500 },
    );
  }
}
