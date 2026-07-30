import { randomUUID } from "node:crypto";

import type {
  AmbientCgAssetType,
  AmbientCgCatalogAsset,
  AmbientCgDownloadVariant,
  AmbientCgSyncState,
} from "./ambientcg-types";
import {
  readAmbientCgCatalog,
  readAmbientCgSyncState,
  writeAmbientCgAuxiliaryCatalog,
  writeAmbientCgCatalog,
  writeAmbientCgSyncState,
} from "./ambientcg-store.server";

const AMBIENTCG_API_ROOT = "https://ambientcg.com/api/v3";
const ASSET_INCLUDE = [
  "type",
  "releaseDate",
  "shortDescription",
  "longDescription",
  "title",
  "url",
  "tags",
  "colors",
  "dimensions",
  "downloadStatistics",
  "maps",
  "technique",
  "downloads",
  "relations",
  "collections",
  "previews",
  "thumbnails",
].join(",");

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") return [item.trim()];
        const object = asObject(item);
        const candidate =
          stringValue(object?.name) ??
          stringValue(object?.title) ??
          stringValue(object?.id);
        return candidate ? [candidate] : [];
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function collectUrls(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, output));
    return output;
  }
  const object = asObject(value);
  if (object) Object.values(object).forEach((item) => collectUrls(item, output));
  return output;
}

function inferResolution(text: string) {
  return text.match(/(?:^|[^0-9])(1K|2K|4K|8K|16K)(?:[^0-9]|$)/i)?.[1]?.toUpperCase() ?? null;
}

function inferFileFormat(text: string) {
  return text.match(/(?:^|[^A-Z])(JPG|JPEG|PNG|HDR|EXR|BLEND|SBSAR|GLB|GLTF|FBX|OBJ)(?:[^A-Z]|$)/i)?.[1]?.toUpperCase().replace("JPEG", "JPG") ?? null;
}

function inferArchiveFormat(url: string, text: string) {
  if (/\.zip(?:$|\?)/i.test(url) || /\bzip\b/i.test(text)) return "ZIP";
  return null;
}

function numericSize(object: Record<string, unknown>) {
  for (const key of ["size", "sizeBytes", "size_bytes", "fileSize", "downloadSize"]) {
    const value = object[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function flattenDownloadVariants(value: unknown) {
  const variants: AmbientCgDownloadVariant[] = [];

  function walk(node: unknown, path: string[]) {
    if (typeof node === "string") {
      if (/^https?:\/\//i.test(node) && /download|cdn|\.zip|\.hdr|\.exr|\.glb|\.gltf|\.fbx|\.obj|\.blend/i.test(node)) {
        const label = path.join(" ") || "Download";
        variants.push({
          variant_id: `${inferResolution(label) ?? "native"}-${inferFileFormat(label) ?? "file"}-${variants.length}`.toLowerCase(),
          label,
          resolution: inferResolution(`${label} ${node}`),
          file_format: inferFileFormat(`${label} ${node}`),
          archive_format: inferArchiveFormat(node, label),
          url: node,
          size_bytes: null,
          attributes: {},
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...path, String(index)]));
      return;
    }
    const object = asObject(node);
    if (!object) return;

    const urlKey = Object.keys(object).find(
      (key) =>
        /url|link|href/i.test(key) &&
        typeof object[key] === "string" &&
        /^https?:\/\//i.test(String(object[key])),
    );

    if (urlKey) {
      const url = String(object[urlKey]);
      const attributes: Record<string, string | number | boolean | null> = {};
      for (const [key, item] of Object.entries(object)) {
        if (["string", "number", "boolean"].includes(typeof item) || item === null) {
          attributes[key] = item as string | number | boolean | null;
        }
      }
      const searchable = `${path.join(" ")} ${Object.values(attributes).join(" ")} ${url}`;
      const label =
        stringValue(object.label) ??
        stringValue(object.name) ??
        stringValue(object.title) ??
        path.join(" ") ??
        "Download";
      const resolution = inferResolution(searchable);
      const fileFormat = inferFileFormat(searchable);
      variants.push({
        variant_id: `${resolution ?? "native"}-${fileFormat ?? "file"}-${variants.length}`.toLowerCase(),
        label,
        resolution,
        file_format: fileFormat,
        archive_format: inferArchiveFormat(url, searchable),
        url,
        size_bytes: numericSize(object),
        attributes,
      });
      return;
    }

    for (const [key, item] of Object.entries(object)) {
      walk(item, [...path, key]);
    }
  }

  walk(value, []);
  const byUrl = new Map<string, AmbientCgDownloadVariant>();
  for (const variant of variants) {
    if (!byUrl.has(variant.url)) byUrl.set(variant.url, variant);
  }
  return Array.from(byUrl.values()).map((variant, index) => ({
    ...variant,
    variant_id: `${variant.resolution ?? "native"}-${variant.file_format ?? "file"}-${index}`.toLowerCase(),
  }));
}

function normalizeType(value: unknown): AmbientCgAssetType | "unknown" {
  const normalized = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, AmbientCgAssetType> = {
    material: "material",
    hdri: "hdri",
    substance: "substance",
    decal: "decal",
    atlas: "atlas",
    "3d-model": "3d-model",
    "3dmodel": "3d-model",
    model: "3d-model",
    "plain-image": "plain-image",
    image: "plain-image",
    brush: "brush",
    terrain: "terrain",
    "hdri-element": "hdri-element",
  };
  return aliases[normalized] ?? "unknown";
}

function normalizeAsset(raw: unknown, existing?: AmbientCgCatalogAsset) {
  const object = asObject(raw) ?? {};
  const sourceAssetId = stringValue(object.id);
  if (!sourceAssetId) return null;
  const now = new Date().toISOString();
  const sourceUrl =
    stringValue(object.url) ?? `https://ambientcg.com/a/${encodeURIComponent(sourceAssetId)}`;
  return {
    asset_id: `ambientcg_${sourceAssetId}`,
    source_asset_id: sourceAssetId,
    source_type: "ambientcg" as const,
    asset_type: normalizeType(object.type),
    display_name: stringValue(object.title) ?? sourceAssetId,
    source_url: sourceUrl,
    release_date: stringValue(object.releaseDate),
    short_description: stringValue(object.shortDescription),
    long_description: stringValue(object.longDescription),
    semantic_tags: unique(stringArray(object.tags)),
    colors: unique(stringArray(object.colors)),
    dimensions: object.dimensions ?? null,
    maps: unique(stringArray(object.maps)),
    technique: stringValue(object.technique),
    collections: unique(stringArray(object.collections)),
    download_statistics: object.downloadStatistics ?? null,
    download_variants: flattenDownloadVariants(object.downloads),
    preview_urls: unique(collectUrls(object.previews)),
    thumbnail_urls: unique(collectUrls(object.thumbnails)),
    catalog_status: existing?.catalog_status ?? "cataloged",
    cached_resource_id: existing?.cached_resource_id ?? null,
    source_record: {
      id: sourceAssetId,
      type: normalizeType(object.type),
      title: stringValue(object.title) ?? sourceAssetId,
      url: sourceUrl,
      releaseDate: stringValue(object.releaseDate),
      technique: stringValue(object.technique),
      license: "CC0-1.0",
    },
    cataloged_at: existing?.cataloged_at ?? now,
    updated_at: now,
  } satisfies AmbientCgCatalogAsset;
}

async function fetchJson(url: string, timeoutMs = 90_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "MyWay-AmbientCG-Catalog/1.0" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`ambientCG request failed with HTTP ${response.status}.`);
    }
    return (await response.json()) as unknown;
  } catch (caught) {
    if (caught instanceof Error && (caught.name === "AbortError" || /aborted/i.test(caught.message))) {
      throw new Error(`ambientCG request exceeded ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw caught;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncAmbientCgCatalogPage(input: {
  restart?: boolean;
  pageLimit?: number;
}) {
  const priorState = await readAmbientCgSyncState();
  const restart = input.restart === true || priorState.status === "complete";
  const pageLimit = Math.min(500, Math.max(1, input.pageLimit ?? priorState.page_limit ?? 250));
  const now = new Date().toISOString();
  const runId = restart || !priorState.run_id ? randomUUID() : priorState.run_id;
  const offset = restart ? 0 : priorState.next_offset;
  let state: AmbientCgSyncState = {
    ...priorState,
    status: "running",
    run_id: runId,
    last_started_at: restart ? now : priorState.last_started_at ?? now,
    next_offset: offset,
    page_limit: pageLimit,
    total_results: restart ? null : priorState.total_results,
    records_seen: restart ? 0 : priorState.records_seen,
    records_written: restart ? 0 : priorState.records_written,
    last_error: null,
  };
  await writeAmbientCgSyncState(state);

  try {
    if (offset === 0) {
      const [categories, collections] = await Promise.all([
        fetchJson(`${AMBIENTCG_API_ROOT}/categories`).catch((error) => ({ error: String(error) })),
        fetchJson(`${AMBIENTCG_API_ROOT}/collections`).catch((error) => ({ error: String(error) })),
      ]);
      await Promise.all([
        writeAmbientCgAuxiliaryCatalog("categories", categories),
        writeAmbientCgAuxiliaryCatalog("collections", collections),
      ]);
    }

    const url = new URL(`${AMBIENTCG_API_ROOT}/assets`);
    url.searchParams.set("sort", "alphabet");
    url.searchParams.set("limit", String(pageLimit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("include", ASSET_INCLUDE);
    const payload = asObject(await fetchJson(url.toString()));
    const rawAssets = Array.isArray(payload?.assets) ? payload.assets : [];
    const totalResults =
      typeof payload?.totalResults === "number" ? payload.totalResults : offset + rawAssets.length;

    const previousCatalog = await readAmbientCgCatalog();
    const previousAssets = new Map(
      previousCatalog.assets.map((asset) => [asset.source_asset_id, asset]),
    );
    const catalog = restart && offset === 0
      ? {
          schema_version: "myway_ambientcg_catalog_v1" as const,
          source: "ambientcg_api_v3" as const,
          updated_at: null,
          total_results: 0,
          assets: [],
        }
      : previousCatalog;
    const map = new Map(catalog.assets.map((asset) => [asset.source_asset_id, asset]));
    let written = 0;
    for (const raw of rawAssets) {
      const rawObject = asObject(raw);
      const sourceAssetId = stringValue(rawObject?.id);
      const normalized = normalizeAsset(
        raw,
        sourceAssetId
          ? map.get(sourceAssetId) ?? previousAssets.get(sourceAssetId)
          : undefined,
      );
      if (!normalized) continue;
      map.set(normalized.source_asset_id, normalized);
      written += 1;
    }

    const nextOffset = offset + rawAssets.length;
    const done = rawAssets.length === 0 || nextOffset >= totalResults;
    const updatedCatalog = {
      ...catalog,
      updated_at: now,
      total_results: totalResults,
      assets: Array.from(map.values()).sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      ),
    };
    await writeAmbientCgCatalog(updatedCatalog);

    state = {
      ...state,
      status: done ? "complete" : "running",
      next_offset: done ? 0 : nextOffset,
      total_results: totalResults,
      records_seen: state.records_seen + rawAssets.length,
      records_written: state.records_written + written,
      last_completed_at: done ? new Date().toISOString() : state.last_completed_at,
      last_error: null,
    };
    await writeAmbientCgSyncState(state);

    return {
      state,
      page: { offset, count: rawAssets.length, written },
      done,
      catalog_count: updatedCatalog.assets.length,
    };
  } catch (caught) {
    state = {
      ...state,
      status: "failed",
      last_error: caught instanceof Error ? caught.message : String(caught),
    };
    await writeAmbientCgSyncState(state);
    throw caught;
  }
}

export async function searchAmbientCgCatalog(input: {
  query?: string;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const catalog = await readAmbientCgCatalog();
  const query = input.query?.trim().toLowerCase() ?? "";
  const type = input.type?.trim().toLowerCase() ?? "all";
  const status = input.status?.trim().toLowerCase() ?? "all";
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 24));

  const filtered = catalog.assets.filter((asset) => {
    if (type !== "all" && asset.asset_type !== type) return false;
    if (status !== "all" && asset.catalog_status !== status) return false;
    if (!query) return true;
    const haystack = [
      asset.source_asset_id,
      asset.display_name,
      asset.asset_type,
      asset.technique ?? "",
      ...asset.semantic_tags,
      ...asset.maps,
    ]
      .join(" ")
      .toLowerCase();
    return query.split(/\s+/).every((term) => haystack.includes(term));
  });

  const start = (page - 1) * limit;
  return {
    total: filtered.length,
    page,
    limit,
    page_count: Math.max(1, Math.ceil(filtered.length / limit)),
    assets: filtered.slice(start, start + limit),
    catalog_updated_at: catalog.updated_at,
  };
}
