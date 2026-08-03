"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  AmbientCgCachedHdri,
  AmbientCgCachedMaterial,
  AmbientCgCachedResource,
  AmbientCgCatalogAsset,
  AmbientCgDownloadJob,
  AmbientCgDownloadVariant,
  AmbientCgStorageStatus,
  AmbientCgSyncState,
  AssetCloudMigrationState,
} from "../catalog/ambientcg/ambientcg-types";

type Tab =
  | "catalog"
  | "materials"
  | "hdris"
  | "atlases"
  | "terrains"
  | "decals"
  | "images"
  | "brushes"
  | "substances"
  | "hdri-elements"
  | "downloads"
  | "storage";

type CatalogResponse = {
  ok: boolean;
  assets?: AmbientCgCatalogAsset[];
  total?: number;
  page?: number;
  page_count?: number;
  catalog_updated_at?: string | null;
  error?: string;
};

type MigrationStatus = {
  state: AssetCloudMigrationState;
  total_assets: number;
  eligible_assets: number;
  cloud_ready_assets: number;
  remaining_assets: number;
  local_source_copies: number;
  unarchived_source_copies: number;
  source_archived_assets: number;
};

type StatusResponse = {
  ok: boolean;
  sync?: AmbientCgSyncState;
  storage?: AmbientCgStorageStatus;
  migration?: MigrationStatus;
  counts?: {
    materials: number;
    material_appearances: number;
    hdris: number;
    resources: number;
    by_type: Record<string, number>;
    jobs: number;
  };
  error?: string;
};

type AmbientCgLibraryLabProps = {
  embedded?: boolean;
  onShowModels?: (input?: {
    assetId?: string | null;
    needsReview?: boolean;
  }) => void;
};

const API =
  "/api/sandbox/probe-lab/assets/ambientcg";

function formatBytes(
  value: number | null | undefined,
) {
  if (!value) return "—";
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(
    value /
    1024 /
    1024
  ).toFixed(1)} MB`;
}

function formatDate(
  value: string | null | undefined,
) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString();
}

function previewScore(url: string) {
  const value = url.toLowerCase();
  let score = 0;

  for (const [token, weight] of [
    ["8192", 8192],
    ["4096", 4096],
    ["2048", 2048],
    ["1024", 1024],
    ["512", 512],
    ["full", 900],
    ["preview", 600],
    ["thumb", 100],
  ] as const) {
    if (value.includes(token)) {
      score += weight;
    }
  }

  return score;
}

function previewFor(
  asset: AmbientCgCatalogAsset,
) {
  return [
    ...asset.preview_urls,
    ...asset.thumbnail_urls,
  ]
    .filter(Boolean)
    .sort(
      (a, b) =>
        previewScore(b) -
        previewScore(a),
    )[0] ?? null;
}

function cachedMaterialPreview(
  material: AmbientCgCachedMaterial,
) {
  return (
    material.preview_url ??
    material.thumbnail_url ??
    material.maps.base_color
  );
}

type ManagedAmbientCgResource =
  | AmbientCgCachedMaterial
  | AmbientCgCachedHdri
  | AmbientCgCachedResource;

const RESOURCE_TAB_TYPES: Record<
  Exclude<
    Tab,
    | "catalog"
    | "materials"
    | "hdris"
    | "downloads"
    | "storage"
  >,
  AmbientCgCachedResource["asset_type"]
> = {
  atlases: "atlas",
  terrains: "terrain",
  decals: "decal",
  images: "plain-image",
  brushes: "brush",
  substances: "substance",
  "hdri-elements": "hdri-element",
};

function managedPreview(
  resource: ManagedAmbientCgResource,
) {
  if (resource.asset_type === "material") {
    return cachedMaterialPreview(resource);
  }

  return (
    resource.preview_url ??
    resource.thumbnail_url ??
    (resource.asset_type === "hdri"
      ? resource.environment_url
      : resource.primary_url)
  );
}

function variantsForManagedResource(
  resource: ManagedAmbientCgResource,
): AmbientCgDownloadVariant[] {
  if (
    resource.available_variants?.length
  ) {
    return resource.available_variants;
  }

  return [
    {
      variant_id: resource.variant_id,
      label: `${resource.resolution ?? "Native"} ${resource.file_format ?? "file"}`,
      resolution: resource.resolution,
      file_format: resource.file_format,
      archive_format: null,
      url: resource.source_url,
      size_bytes: null,
      attributes: {},
    },
  ];
}

function resourceTabLabel(tab: Tab) {
  if (tab === "hdris") return "HDRIs";
  if (tab === "hdri-elements") {
    return "HDRI elements";
  }
  if (tab === "storage") {
    return "Cloud storage";
  }
  return tab[0]!.toUpperCase() + tab.slice(1);
}

function statusLabel(
  asset: AmbientCgCatalogAsset,
) {
  if (
    asset.catalog_status ===
    "published"
  ) {
    return "Cloud ready";
  }
  if (
    asset.catalog_status ===
    "cached"
  ) {
    return "Cached locally";
  }
  if (
    asset.catalog_status ===
    "failed"
  ) {
    return "Failed";
  }
  return "Available remotely";
}

async function jsonRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await fetch(
    input,
    init,
  );
  const payload =
    (await response.json()) as T & {
      ok?: boolean;
      error?: string;
    };

  if (
    !response.ok ||
    payload.ok === false
  ) {
    throw new Error(
      payload.error ??
        `Request failed with HTTP ${response.status}.`,
    );
  }

  return payload;
}

export function AmbientCgLibraryLab({
  embedded = false,
  onShowModels,
}: AmbientCgLibraryLabProps) {
  const [
    tab,
    setTab,
  ] = useState<Tab>("catalog");
  const [
    status,
    setStatus,
  ] = useState<StatusResponse | null>(
    null,
  );
  const [
    catalog,
    setCatalog,
  ] = useState<CatalogResponse | null>(
    null,
  );
  const [
    materials,
    setMaterials,
  ] = useState<
    AmbientCgCachedMaterial[]
  >([]);
  const [
    hdris,
    setHdris,
  ] = useState<
    AmbientCgCachedHdri[]
  >([]);
  const [
    resources,
    setResources,
  ] = useState<
    AmbientCgCachedResource[]
  >([]);
  const [
    jobs,
    setJobs,
  ] = useState<
    AmbientCgDownloadJob[]
  >([]);
  const [
    query,
    setQuery,
  ] = useState("");
  const [
    type,
    setType,
  ] = useState("all");
  const [
    catalogStatus,
    setCatalogStatus,
  ] = useState("all");
  const [
    catalogFilters,
    setCatalogFilters,
  ] = useState({
    query: "",
    type: "all",
    status: "all",
  });
  const [
    page,
    setPage,
  ] = useState(1);
  const [
    selectedAssetId,
    setSelectedAssetId,
  ] = useState<
    string | null
  >(null);
  const [
    loading,
    setLoading,
  ] = useState(false);
  const [
    syncing,
    setSyncing,
  ] = useState(false);
  const [
    syncMessage,
    setSyncMessage,
  ] = useState<
    string | null
  >(null);
  const [
    cachingId,
    setCachingId,
  ] = useState<
    string | null
  >(null);
  const [
    analyzingMaterialId,
    setAnalyzingMaterialId,
  ] = useState<
    string | null
  >(null);
  const [
    materialAnalysisRunning,
    setMaterialAnalysisRunning,
  ] = useState(false);
  const [
    selectedVariants,
    setSelectedVariants,
  ] = useState<
    Record<string, string>
  >({});
  const [
    managedVariants,
    setManagedVariants,
  ] = useState<
    Record<string, string>
  >({});
  const [
    resourceActionId,
    setResourceActionId,
  ] = useState<string | null>(null);
  const [
    importingModelId,
    setImportingModelId,
  ] = useState<string | null>(null);
  const [
    migrationRunning,
    setMigrationRunning,
  ] = useState(false);
  const [
    removeLocalAfterMigration,
    setRemoveLocalAfterMigration,
  ] = useState(false);
  const [
    cloudMessage,
    setCloudMessage,
  ] = useState<
    string | null
  >(null);
  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const loadStatus =
    useCallback(async () => {
      const payload =
        await jsonRequest<
          StatusResponse
        >(
          `${API}?view=status`,
          {
            cache: "no-store",
          },
        );

      setStatus(payload);
    }, []);

  const loadCatalog =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const params =
          new URLSearchParams({
            view: "catalog",
            q: catalogFilters.query,
            type:
              catalogFilters.type,
            status:
              catalogFilters.status,
            page:
              String(page),
            limit: "24",
          });
        const payload =
          await jsonRequest<
            CatalogResponse
          >(
            `${API}?${params}`,
            {
              cache: "no-store",
            },
          );

        setCatalog(payload);

        const nextAssets =
          payload.assets ?? [];
        setSelectedAssetId(
          (current) =>
            current &&
            nextAssets.some(
              (asset) =>
                asset.asset_id ===
                current,
            )
              ? current
              : nextAssets[0]
                  ?.asset_id ?? null,
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : String(caught),
        );
      } finally {
        setLoading(false);
      }
    }, [
      catalogFilters,
      page,
    ]);

  const loadMaterials =
    useCallback(async () => {
      const payload =
        await jsonRequest<{
          ok: boolean;
          materials?:
            AmbientCgCachedMaterial[];
        }>(
          `${API}?view=materials`,
          {
            cache: "no-store",
          },
        );

      setMaterials(
        payload.materials ?? [],
      );
    }, []);

  const loadHdris =
    useCallback(async () => {
      const payload =
        await jsonRequest<{
          ok: boolean;
          hdris?:
            AmbientCgCachedHdri[];
        }>(
          `${API}?view=hdris`,
          {
            cache: "no-store",
          },
        );

      setHdris(
        payload.hdris ?? [],
      );
    }, []);

  const loadResources =
    useCallback(async () => {
      const payload =
        await jsonRequest<{
          ok: boolean;
          resources?:
            AmbientCgCachedResource[];
        }>(
          `${API}?view=resources`,
          {
            cache: "no-store",
          },
        );

      setResources(
        payload.resources ?? [],
      );
    }, []);

  const loadJobs =
    useCallback(async () => {
      const payload =
        await jsonRequest<{
          ok: boolean;
          jobs?:
            AmbientCgDownloadJob[];
        }>(
          `${API}?view=jobs`,
          {
            cache: "no-store",
          },
        );

      setJobs(
        payload.jobs ?? [],
      );
    }, []);

  useEffect(() => {
    void loadStatus().catch(
      (caught) =>
        setError(String(caught)),
    );
  }, [loadStatus]);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        setPage(1);
        setCatalogFilters(
          (current) => {
            const next = {
              query,
              type,
              status:
                catalogStatus,
            };

            return current.query ===
              next.query &&
              current.type ===
                next.type &&
              current.status ===
                next.status
              ? current
              : next;
          },
        );
      },
      250,
    );

    return () =>
      clearTimeout(timer);
  }, [
    query,
    type,
    catalogStatus,
  ]);

  useEffect(() => {
    if (tab === "catalog") {
      void loadCatalog();
    }
    if (tab === "materials") {
      void loadMaterials().catch(
        (caught) =>
          setError(String(caught)),
      );
    }
    if (tab === "hdris") {
      void loadHdris().catch(
        (caught) =>
          setError(String(caught)),
      );
    }
    if (tab in RESOURCE_TAB_TYPES) {
      void loadResources().catch(
        (caught) =>
          setError(String(caught)),
      );
    }
    if (
      tab === "downloads"
    ) {
      void loadJobs().catch(
        (caught) =>
          setError(String(caught)),
      );
    }
    if (tab === "storage") {
      void loadStatus().catch(
        (caught) =>
          setError(String(caught)),
      );
    }
  }, [
    tab,
    page,
    loadCatalog,
    loadHdris,
    loadJobs,
    loadMaterials,
    loadResources,
    loadStatus,
  ]);

  async function syncCatalog() {
    setSyncing(true);
    setError(null);
    setSyncMessage(
      "Starting ambientCG catalog sync…",
    );

    try {
      let restart = true;
      let done = false;

      while (!done) {
        const payload =
          await jsonRequest<{
            ok: boolean;
            done?: boolean;
            state?:
              AmbientCgSyncState;
            catalog_count?: number;
          }>(
            API,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                action:
                  "sync_page",
                restart,
                page_limit: 250,
              }),
            },
          );

        restart = false;
        done =
          payload.done === true;

        setSyncMessage(
          done
            ? `Cloud catalog complete: ${payload.catalog_count ?? payload.state?.records_written ?? 0} assets.`
            : `Synced ${payload.state?.records_seen ?? 0} of ${payload.state?.total_results ?? "…"} assets…`,
        );
      }

      await Promise.all([
        loadStatus(),
        loadCatalog(),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setSyncing(false);
    }
  }

  async function analyzeMaterial(
    sourceAssetId: string,
  ) {
    setAnalyzingMaterialId(
      sourceAssetId,
    );
    setError(null);
    setCloudMessage(
      `Analyzing ${sourceAssetId} from its official ambientCG preview…`,
    );

    try {
      await jsonRequest(
        API,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action:
              "analyze_material",
            source_asset_id:
              sourceAssetId,
          }),
        },
      );
      setCloudMessage(
        `${sourceAssetId} now has a concise visual material description, dominant colors, and brightness.`,
      );
      await Promise.all([
        loadCatalog(),
        loadMaterials(),
        loadStatus(),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setAnalyzingMaterialId(
        null,
      );
    }
  }

  async function analyzeNextMaterials() {
    setMaterialAnalysisRunning(
      true,
    );
    setError(null);
    setCloudMessage(
      "Analyzing the next three ambientCG materials with Nemotron Nano 12B v2 VL…",
    );

    try {
      const payload =
        await jsonRequest<{
          completed?: number;
          failed?: number;
        }>(
          API,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              action:
                "analyze_material_batch",
              limit: 3,
            }),
          },
        );
      setCloudMessage(
        `Material analysis finished: ${payload.completed ?? 0} completed, ${payload.failed ?? 0} failed.`,
      );
      await Promise.all([
        loadCatalog(),
        loadMaterials(),
        loadStatus(),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setMaterialAnalysisRunning(
        false,
      );
    }
  }

  async function cacheAsset(
    asset: AmbientCgCatalogAsset,
  ) {
    const variantId =
      selectedVariants[
        asset.source_asset_id
      ] ??
      asset.download_variants[0]
        ?.variant_id;

    if (!variantId) {
      setError(
        "This catalog entry has no downloadable variants in its mirrored record.",
      );
      return;
    }

    setCachingId(
      asset.source_asset_id,
    );
    setError(null);
    setCloudMessage(
      "Downloading into a temporary job folder, normalizing the package, and publishing it to Cloudflare R2…",
    );

    try {
      await jsonRequest(
        API,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "cache",
            source_asset_id:
              asset.source_asset_id,
            variant_id:
              variantId,
          }),
        },
      );

      setCloudMessage(
        `${asset.display_name} is now cloud ready.`,
      );

      await Promise.all([
        loadCatalog(),
        loadStatus(),
        loadJobs(),
        loadMaterials(),
        loadHdris(),
        loadResources(),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setCachingId(null);
    }
  }

  async function importCatalogModel(
    asset: AmbientCgCatalogAsset,
  ) {
    const variantId =
      selectedVariants[
        asset.source_asset_id
      ] ??
      asset.download_variants[0]
        ?.variant_id;

    if (!variantId) {
      setError(
        "This 3D model has no downloadable variant in the mirrored catalog record.",
      );
      return;
    }

    setImportingModelId(
      asset.source_asset_id,
    );
    setError(null);
    setCloudMessage(
      "Downloading the ambientCG model, normalizing it through Blender, and adding it to Models → Needs Review…",
    );

    try {
      const payload =
        await jsonRequest<{
          ok: boolean;
          created?: boolean;
          duplicate_of?: string | null;
          asset?: {
            asset_id: string;
            display_name: string;
          };
        }>(API, {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "import_model",
            source_asset_id:
              asset.source_asset_id,
            variant_id: variantId,
            target_extent_m: 2,
          }),
        });

      const modelAssetId =
        payload.asset?.asset_id ??
        payload.duplicate_of ??
        null;
      setCloudMessage(
        payload.created === false
          ? `${asset.display_name} is already in the Models library.`
          : `${asset.display_name} was added to Models → Needs Review.`,
      );
      await Promise.all([
        loadCatalog(),
        loadJobs(),
        loadStatus(),
      ]);
      onShowModels?.({
        assetId: modelAssetId,
        needsReview: true,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setImportingModelId(null);
    }
  }

  async function changeResourceResolution(
    resource: ManagedAmbientCgResource,
  ) {
    const variants =
      variantsForManagedResource(
        resource,
      );
    const variantId =
      managedVariants[
        resource.resource_id
      ] ?? resource.variant_id;

    if (variantId === resource.variant_id) {
      setCloudMessage(
        `${resource.display_name} already uses that resolution.`,
      );
      return;
    }

    if (
      !variants.some(
        (variant) =>
          variant.variant_id ===
          variantId,
      )
    ) {
      setError(
        "The selected ambientCG variant is no longer available.",
      );
      return;
    }

    setResourceActionId(
      resource.resource_id,
    );
    setError(null);
    setCloudMessage(
      `Replacing ${resource.display_name} with the selected resolution and cleaning the previous R2 objects…`,
    );

    try {
      await jsonRequest(API, {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          action: "replace_variant",
          resource_id:
            resource.resource_id,
          variant_id: variantId,
        }),
      });
      setCloudMessage(
        `${resource.display_name} now uses the selected resolution. The old runtime files and metadata were removed.`,
      );
      await Promise.all([
        loadCatalog(),
        loadStatus(),
        loadJobs(),
        loadMaterials(),
        loadHdris(),
        loadResources(),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setResourceActionId(null);
    }
  }

  async function removeCachedResource(
    resource: ManagedAmbientCgResource,
  ) {
    const confirmed = window.confirm(
      `Remove ${resource.display_name} from MyWay's cached ambientCG library?\n\nThis deletes its R2 runtime files, manifest, preview copy, private provenance records, registry entry, and related download-job records. The remote ambientCG catalog entry remains available to cache again later.`,
    );

    if (!confirmed) return;

    setResourceActionId(
      resource.resource_id,
    );
    setError(null);

    try {
      await jsonRequest(API, {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          action: "remove_resource",
          resource_id:
            resource.resource_id,
        }),
      });
      setCloudMessage(
        `${resource.display_name} was removed from cached storage. It remains searchable in the ambientCG catalog.`,
      );
      await Promise.all([
        loadCatalog(),
        loadStatus(),
        loadJobs(),
        loadMaterials(),
        loadHdris(),
        loadResources(),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setResourceActionId(null);
    }
  }

  async function bootstrapCloud() {
    setMigrationRunning(true);
    setError(null);
    setCloudMessage(
      "Publishing current registries and catalog metadata to R2…",
    );

    try {
      await jsonRequest(
        API,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action:
              "bootstrap_cloud_metadata",
          }),
        },
      );

      setCloudMessage(
        "Catalog and registry metadata are verified in the private R2 bucket.",
      );
      await loadStatus();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setMigrationRunning(false);
    }
  }

  async function migrateAllModels() {
    setMigrationRunning(true);
    setError(null);
    setCloudMessage(
      "Migrating model assets to R2 in small verified batches…",
    );

    try {
      let done = false;

      while (!done) {
        const payload =
          await jsonRequest<{
            ok: boolean;
            done?: boolean;
            remaining_assets?: number;
            results?: Array<{
              asset_id?: string;
              status?: string;
              error?: string;
            }>;
          }>(
            API,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                action:
                  "migrate_library_batch",
                limit: 2,
                remove_local_after_verification:
                  removeLocalAfterMigration,
              }),
            },
          );

        done =
          payload.done === true;
        setCloudMessage(
          done
            ? "Existing eligible model assets are cloud ready."
            : `${payload.remaining_assets ?? "More"} model assets remain…`,
        );

        if (
          payload.results?.every(
            (result) =>
              result.status ===
              "failed",
          )
        ) {
          throw new Error(
            payload.results
              .map(
                (result) =>
                  `${result.asset_id}: ${result.error}`,
              )
              .join("\n"),
          );
        }
      }

      await loadStatus();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setMigrationRunning(false);
    }
  }

  async function archiveLocalSources() {
    setMigrationRunning(true);
    setError(null);
    setCloudMessage(
      "Archiving verified local model sources to the private R2 bucket…",
    );

    try {
      let done = false;

      while (!done) {
        const payload =
          await jsonRequest<{
            ok: boolean;
            done?: boolean;
            local_source_copies?: number;
            unarchived_source_copies?: number;
            results?: Array<{
              asset_id?: string;
              status?: string;
              error?: string;
            }>;
          }>(
            API,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                action:
                  "archive_cloud_sources_batch",
                limit: 2,
                remove_local_after_verification:
                  removeLocalAfterMigration,
              }),
            },
          );

        done =
          payload.done === true;
        setCloudMessage(
          done
            ? removeLocalAfterMigration
              ? "Verified cloud model sources are archived and local source copies are cleared."
              : "All current local model sources are archived in R2."
            : `${payload.local_source_copies ?? payload.unarchived_source_copies ?? "More"} local source copies remain…`,
        );

        if (
          payload.results?.length &&
          payload.results.every(
            (result) =>
              result.status ===
              "failed",
          )
        ) {
          throw new Error(
            payload.results
              .map(
                (result) =>
                  `${result.asset_id}: ${result.error}`,
              )
              .join("\n"),
          );
        }
      }

      await loadStatus();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setMigrationRunning(false);
    }
  }

  async function compactLocalMetadata() {
    const confirmed =
      window.confirm(
        "This will replace the large local ambientCG catalog and local registry snapshots with tiny cloud-backed bootstrap files. It only proceeds after verifying the authoritative R2 objects. Continue?",
      );

    if (!confirmed) return;

    setMigrationRunning(true);
    setError(null);

    try {
      await jsonRequest(
        API,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action:
              "compact_local_metadata",
          }),
        },
      );

      setCloudMessage(
        "Verified local metadata was compacted. R2 remains authoritative.",
      );
      await loadStatus();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setMigrationRunning(false);
    }
  }

  const counts = useMemo(
    () => ({
      materials:
        status?.counts
          ?.materials ??
        materials.length,
      hdris:
        status?.counts
          ?.hdris ??
        hdris.length,
      resources:
        status?.counts
          ?.resources ??
        resources.length,
      jobs:
        status?.counts
          ?.jobs ??
        jobs.length,
    }),
    [
      hdris.length,
      jobs.length,
      materials.length,
      resources.length,
      status,
    ],
  );

  const selectedAsset =
    catalog?.assets?.find(
      (asset) =>
        asset.asset_id ===
        selectedAssetId,
    ) ??
    catalog?.assets?.[0] ??
    null;

  const managedResourcesForTab =
    tab in RESOURCE_TAB_TYPES
      ? resources.filter(
          (resource) =>
            resource.asset_type ===
            RESOURCE_TAB_TYPES[
              tab as keyof typeof RESOURCE_TAB_TYPES
            ],
        )
      : [];

  function renderManagedResourceCard(
    resource: ManagedAmbientCgResource,
  ) {
    const variants =
      variantsForManagedResource(
        resource,
      );
    const selectedVariant =
      managedVariants[
        resource.resource_id
      ] ?? resource.variant_id;
    const busy =
      resourceActionId ===
      resource.resource_id;
    const preview =
      managedPreview(resource);

    return (
      <article
        className="ambientcg-card"
        key={resource.resource_id}
      >
        {preview ? (
          <img
            className="ambientcg-card-image"
            data-hdri={
              resource.asset_type ===
              "hdri"
            }
            src={preview}
            alt={`${resource.display_name} ${resource.asset_type} preview`}
            loading="lazy"
          />
        ) : (
          <div className="ambientcg-card-placeholder">
            {resource.asset_type}
          </div>
        )}
        <div className="ambientcg-card-body">
          <h2 className="ambientcg-card-title">
            {resource.display_name}
          </h2>
          <div className="ambientcg-meta">
            {resource.resolution ??
              "native"}{" "}
            ·{" "}
            {resource.file_format ??
              "file"}{" "}
            ·{" "}
            {resource.published_to_r2
              ? "Cloud ready"
              : "Local fallback"}
          </div>

          {resource.asset_type ===
          "material" ? (
            <div className="ambientcg-map-list">
              {Object.entries(
                resource.maps,
              )
                .filter(
                  ([, value]) =>
                    Boolean(value),
                )
                .map(([role]) => role)
                .join(" · ")}
            </div>
          ) : resource.asset_type !==
            "hdri" ? (
            <div className="ambientcg-map-list">
              {resource.files
                .slice(0, 5)
                .map((file) => file.name)
                .join(" · ")}
              {resource.files.length > 5
                ? ` · +${resource.files.length - 5} more`
                : ""}
            </div>
          ) : null}

          {resource.asset_type ===
            "material" &&
          resource.appearance_profile ? (
            <div
              style={{
                display: "grid",
                gap: 4,
                color: "#cbd5e1",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              <div>
                {resource.appearance_profile.summary ??
                  "Appearance analysis is pending."}
              </div>
              <small
                style={{
                  color: "#94a3b8",
                }}
              >
                Colors:{" "}
                {resource.appearance_profile.dominant_colors.join(
                  ", ",
                ) || "pending"}{" "}
                · Brightness:{" "}
                {resource.appearance_profile.brightness ??
                  "pending"}
              </small>
            </div>
          ) : null}

          <div className="ambientcg-card-actions ambientcg-card-actions-stack">
            <select
              className="ambientcg-select"
              value={selectedVariant}
              disabled={busy || variants.length < 2}
              onChange={(event) =>
                setManagedVariants(
                  (current) => ({
                    ...current,
                    [resource.resource_id]:
                      event.target.value,
                  }),
                )
              }
            >
              {variants.map(
                (variant) => (
                  <option
                    key={
                      variant.variant_id
                    }
                    value={
                      variant.variant_id
                    }
                  >
                    {variant.resolution ??
                      "Native"}{" "}
                    ·{" "}
                    {variant.file_format ??
                      "file"}{" "}
                    ·{" "}
                    {formatBytes(
                      variant.size_bytes,
                    )}
                  </option>
                ),
              )}
            </select>
            <div className="ambientcg-inline-actions">
              <button
                className="ambientcg-button"
                data-primary="true"
                disabled={
                  busy ||
                  variants.length < 2 ||
                  selectedVariant ===
                    resource.variant_id
                }
                onClick={() =>
                  void changeResourceResolution(
                    resource,
                  )
                }
                type="button"
              >
                {busy
                  ? "Updating…"
                  : "Change resolution"}
              </button>
              <button
                className="ambientcg-button"
                data-danger="true"
                disabled={busy}
                onClick={() =>
                  void removeCachedResource(
                    resource,
                  )
                }
                type="button"
              >
                Remove asset
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  const content = (
    <div className="ambientcg-wrap">
      <header className="ambientcg-header">
        <div>
          <p className="ambientcg-eyebrow">
            MyWay unified cloud assets
          </p>
          <h1>Asset Library</h1>
          <p className="ambientcg-subtitle">
            Browse the complete ambientCG
            catalog beside MyWay&apos;s
            models. Catalog metadata,
            registries, normalized
            materials, HDRIs, and previews
            are Cloudflare-first; your
            laptop is used only for
            temporary processing when R2
            is configured.
          </p>
        </div>

        <div className="ambientcg-actions">
          {onShowModels ? (
            <button
              className="ambientcg-button"
              data-secondary="true"
              onClick={() => onShowModels?.()}
              type="button"
            >
              Models
            </button>
          ) : (
            <a
              className="ambientcg-link"
              href="/sandbox/probe-lab/asset-library"
            >
              Models
            </a>
          )}

          <button
            className="ambientcg-button"
            data-secondary="true"
            disabled={
              materialAnalysisRunning
            }
            onClick={() =>
              void analyzeNextMaterials()
            }
            type="button"
          >
            {materialAnalysisRunning
              ? "Analyzing materials…"
              : "Analyze next 3 materials"}
          </button>

          <button
            className="ambientcg-button"
            data-primary="true"
            disabled={syncing}
            onClick={() =>
              void syncCatalog()
            }
            type="button"
          >
            {syncing
              ? "Syncing cloud catalog…"
              : "Sync ambientCG catalog"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="ambientcg-error">
          {error}
        </div>
      ) : null}

      {syncMessage ? (
        <div className="ambientcg-notice">
          {syncMessage}
        </div>
      ) : null}

      {cloudMessage ? (
        <div className="ambientcg-success">
          {cloudMessage}
        </div>
      ) : null}

      <div className="ambientcg-stats">
        <div className="ambientcg-stat">
          <span>Metadata</span>
          <strong>
            {status?.storage
              ?.catalog_location ===
            "r2"
              ? "Cloudflare R2"
              : "Local fallback"}
          </strong>
        </div>
        <div className="ambientcg-stat">
          <span>
            Cloud materials
          </span>
          <strong>
            {counts.materials}
          </strong>
        </div>
        <div className="ambientcg-stat">
          <span>
            Cloud HDRIs
          </span>
          <strong>
            {counts.hdris}
          </strong>
        </div>
        <div className="ambientcg-stat">
          <span>
            Other cloud resources
          </span>
          <strong>
            {counts.resources}
          </strong>
        </div>
        <div className="ambientcg-stat">
          <span>
            Model migration
          </span>
          <strong>
            {status?.migration
              ? `${status.migration.cloud_ready_assets}/${status.migration.eligible_assets}`
              : "—"}
          </strong>
        </div>
      </div>

      <nav
        className="ambientcg-tabs"
        aria-label="Asset resource section"
      >
        {(
          [
            "catalog",
            "materials",
            "hdris",
            "atlases",
            "terrains",
            "decals",
            "images",
            "brushes",
            "substances",
            "hdri-elements",
            "downloads",
            "storage",
          ] as Tab[]
        ).map((item) => (
          <button
            className="ambientcg-tab"
            data-active={
              tab === item
            }
            key={item}
            onClick={() =>
              setTab(item)
            }
            type="button"
          >
{resourceTabLabel(item)}
          </button>
        ))}
      </nav>

      <section className="ambientcg-panel">
        {tab === "catalog" ? (
          <>
            <div className="ambientcg-controls">
              <input
                className="ambientcg-input"
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value,
                  )
                }
                placeholder="Search wood, metal, studio, concrete…"
              />
              <select
                className="ambientcg-select"
                value={type}
                onChange={(event) =>
                  setType(
                    event.target.value,
                  )
                }
              >
                <option value="all">
                  All types
                </option>
                <option value="material">
                  Materials
                </option>
                <option value="hdri">
                  HDRIs
                </option>
                <option value="decal">
                  Decals
                </option>
                <option value="atlas">
                  Atlases
                </option>
                <option value="3d-model">
                  3D models
                </option>
                <option value="terrain">
                  Terrains
                </option>
                <option value="plain-image">
                  Plain images
                </option>
                <option value="brush">
                  Brushes
                </option>
                <option value="substance">
                  Substances
                </option>
                <option value="hdri-element">
                  HDRI elements
                </option>
              </select>
              <select
                className="ambientcg-select"
                value={catalogStatus}
                onChange={(event) =>
                  setCatalogStatus(
                    event.target.value,
                  )
                }
              >
                <option value="all">
                  Remote + cloud ready
                </option>
                <option value="cataloged">
                  Available remotely
                </option>
                <option value="published">
                  Cloud ready
                </option>
                <option value="cached">
                  Local fallback
                </option>
              </select>
            </div>

            {loading ? (
              <div className="ambientcg-empty">
                Loading the asset
                catalog…
              </div>
            ) : !catalog?.assets
                ?.length ? (
              <div className="ambientcg-empty">
                No catalog records are
                available. Run the catalog
                sync to publish the compact
                catalog to Cloudflare.
              </div>
            ) : (
              <div className="ambientcg-layout">
                <div className="ambientcg-grid">
                  {catalog.assets.map(
                    (asset) => {
                      const preview =
                        previewFor(asset);
                      const selected =
                        asset.asset_id ===
                        selectedAsset
                          ?.asset_id;

                      return (
                        <button
                          className="ambientcg-card"
                          data-selected={
                            selected
                          }
                          key={
                            asset.asset_id
                          }
                          onClick={() =>
                            setSelectedAssetId(
                              asset.asset_id,
                            )
                          }
                          type="button"
                        >
                          {preview ? (
                            <img
                              className="ambientcg-card-image"
                              data-hdri={
                                asset.asset_type ===
                                "hdri"
                              }
                              src={preview}
                              alt={`${asset.display_name} preview`}
                              loading="lazy"
                            />
                          ) : (
                            <div className="ambientcg-card-placeholder">
                              No preview
                            </div>
                          )}

                          <div className="ambientcg-card-body">
                            <div className="ambientcg-card-title-row">
                              <h2 className="ambientcg-card-title">
                                {
                                  asset.display_name
                                }
                              </h2>
                              <span
                                className="ambientcg-status"
                                data-status={
                                  asset.catalog_status
                                }
                              >
                                {statusLabel(
                                  asset,
                                )}
                              </span>
                            </div>
                            <div className="ambientcg-meta">
                              {
                                asset.asset_type
                              }{" "}
                              · ambientCG
                            </div>
                            {asset.asset_type ===
                              "material" &&
                            asset.appearance_profile?.summary ? (
                              <p
                                style={{
                                  margin: "7px 0 0",
                                  color: "#cbd5e1",
                                  fontSize: 11,
                                  lineHeight: 1.4,
                                }}
                              >
                                {
                                  asset.appearance_profile.summary
                                }
                              </p>
                            ) : null}
                            <div className="ambientcg-tags">
                              {asset.semantic_tags
                                .slice(0, 5)
                                .map(
                                  (tag) => (
                                    <span
                                      className="ambientcg-tag"
                                      key={
                                        tag
                                      }
                                    >
                                      {
                                        tag
                                      }
                                    </span>
                                  ),
                                )}
                            </div>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>

                <aside className="ambientcg-detail">
                  {selectedAsset ? (
                    <>
                      {previewFor(
                        selectedAsset,
                      ) ? (
                        <img
                          className="ambientcg-detail-image"
                          data-hdri={
                            selectedAsset.asset_type ===
                            "hdri"
                          }
                          src={
                            previewFor(
                              selectedAsset,
                            )!
                          }
                          alt={`${selectedAsset.display_name} preview`}
                        />
                      ) : (
                        <div className="ambientcg-detail-placeholder">
                          No source preview
                        </div>
                      )}

                      <h2>
                        {
                          selectedAsset.display_name
                        }
                      </h2>
                      <div className="ambientcg-detail-badges">
                        <span className="ambientcg-tag">
                          {
                            selectedAsset.asset_type
                          }
                        </span>
                        <span className="ambientcg-tag">
                          CC0 1.0
                        </span>
                        <span
                          className="ambientcg-status"
                          data-status={
                            selectedAsset.catalog_status
                          }
                        >
                          {statusLabel(
                            selectedAsset,
                          )}
                        </span>
                      </div>

                      <p className="ambientcg-detail-copy">
                        {selectedAsset.short_description ??
                          selectedAsset.long_description ??
                          "This asset is discoverable immediately. Cache a selected resource variant to R2, or send a 3D model through Blender into Models → Needs Review."}
                      </p>

                      {selectedAsset.asset_type ===
                        "material" ? (
                        <section
                          style={{
                            display: "grid",
                            gap: 8,
                            padding: 12,
                            marginBottom: 14,
                            border:
                              "1px solid rgba(148,163,184,0.18)",
                            borderRadius: 12,
                            background:
                              "rgba(15,23,42,0.45)",
                          }}
                        >
                          <strong>
                            Visual material description
                          </strong>
                          <p
                            style={{
                              margin: 0,
                              color: "#cbd5e1",
                              lineHeight: 1.5,
                            }}
                          >
                            {selectedAsset.appearance_profile?.summary ??
                              "This material has not been visually analyzed yet."}
                          </p>
                          <small
                            style={{
                              color: "#94a3b8",
                            }}
                          >
                            Dominant colors:{" "}
                            {selectedAsset.appearance_profile?.dominant_colors.join(
                              ", ",
                            ) || "pending"}{" "}
                            · Brightness:{" "}
                            {selectedAsset.appearance_profile?.brightness ??
                              "pending"}
                          </small>
                          <button
                            className="ambientcg-button"
                            data-secondary="true"
                            disabled={
                              analyzingMaterialId !==
                              null
                            }
                            onClick={() =>
                              void analyzeMaterial(
                                selectedAsset.source_asset_id,
                              )
                            }
                            type="button"
                          >
                            {analyzingMaterialId ===
                            selectedAsset.source_asset_id
                              ? "Analyzing preview…"
                              : selectedAsset.appearance_profile?.status ===
                                  "ready"
                                ? "Re-analyze material appearance"
                                : "Analyze material appearance"}
                          </button>
                        </section>
                      ) : null}

                      <dl className="ambientcg-definition-list">
                        <div>
                          <dt>
                            Source ID
                          </dt>
                          <dd>
                            {
                              selectedAsset.source_asset_id
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>
                            Maps
                          </dt>
                          <dd>
                            {selectedAsset.maps
                              .join(", ") ||
                              "Not listed"}
                          </dd>
                        </div>
                        <div>
                          <dt>
                            Technique
                          </dt>
                          <dd>
                            {selectedAsset.technique ??
                              "Unknown"}
                          </dd>
                        </div>
                      </dl>

                      {selectedAsset.asset_type !==
                      "unknown" ? (
                        <div className="ambientcg-card-actions">
                          <select
                            className="ambientcg-select"
                            disabled={
                              !selectedAsset
                                .download_variants
                                .length
                            }
                            value={
                              selectedVariants[
                                selectedAsset
                                  .source_asset_id
                              ] ??
                              selectedAsset
                                .download_variants[0]
                                ?.variant_id ??
                              ""
                            }
                            onChange={(
                              event,
                            ) =>
                              setSelectedVariants(
                                (
                                  current,
                                ) => ({
                                  ...current,
                                  [selectedAsset.source_asset_id]:
                                    event
                                      .target
                                      .value,
                                }),
                              )
                            }
                          >
                            {!selectedAsset
                              .download_variants
                              .length ? (
                              <option value="">
                                No mirrored
                                variants
                              </option>
                            ) : null}
                            {selectedAsset.download_variants.map(
                              (
                                variant,
                              ) => (
                                <option
                                  value={
                                    variant.variant_id
                                  }
                                  key={
                                    variant.variant_id
                                  }
                                >
                                  {variant.resolution ??
                                    "Native"}{" "}
                                  ·{" "}
                                  {variant.file_format ??
                                    "file"}{" "}
                                  ·{" "}
                                  {formatBytes(
                                    variant.size_bytes,
                                  )}
                                </option>
                              ),
                            )}
                          </select>

                          <button
                            className="ambientcg-button"
                            data-primary="true"
                            disabled={
                              cachingId !==
                                null ||
                              importingModelId !==
                                null ||
                              !selectedAsset
                                .download_variants
                                .length
                            }
                            onClick={() =>
                              selectedAsset.asset_type ===
                              "3d-model"
                                ? void importCatalogModel(
                                    selectedAsset,
                                  )
                                : void cacheAsset(
                                    selectedAsset,
                                  )
                            }
                            type="button"
                          >
                            {selectedAsset.asset_type ===
                            "3d-model"
                              ? importingModelId ===
                                selectedAsset.source_asset_id
                                ? "Normalizing model…"
                                : selectedAsset.cached_resource_id
                                  ? "Open in Models → Needs Review"
                                  : "Add to Models → Needs Review"
                              : cachingId ===
                                  selectedAsset.source_asset_id
                                ? "Publishing to R2…"
                                : selectedAsset.catalog_status ===
                                    "published"
                                  ? "Cache another variant"
                                  : "Cache to Cloudflare"}
                          </button>
                        </div>
                      ) : (
                        <div className="ambientcg-notice">
                          This catalog entry has
                          an unknown asset type,
                          so MyWay cannot select
                          a safe automatic import
                          pipeline for it.
                        </div>
                      )}

                      <a
                        className="ambientcg-link"
                        href={
                          selectedAsset.source_url
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open ambientCG source
                      </a>
                    </>
                  ) : null}
                </aside>
              </div>
            )}

            <div className="ambientcg-pagination">
              <button
                className="ambientcg-button"
                disabled={
                  loading ||
                  (catalog?.page ?? 1) <=
                    1
                }
                onClick={() =>
                  setPage((value) =>
                    Math.max(
                      1,
                      value - 1,
                    ),
                  )
                }
                type="button"
              >
                Previous
              </button>
              <span>
                Page{" "}
                {catalog?.page ?? 1} of{" "}
                {catalog?.page_count ??
                  1}{" "}
                ·{" "}
                {catalog?.total ?? 0}{" "}
                results
              </span>
              <button
                className="ambientcg-button"
                disabled={
                  loading ||
                  (catalog?.page ?? 1) >=
                    (catalog?.page_count ??
                      1)
                }
                onClick={() =>
                  setPage(
                    (value) =>
                      value + 1,
                  )
                }
                type="button"
              >
                Next
              </button>
            </div>
          </>
        ) : null}

        {tab === "materials" ? (
          materials.length ? (
            <div className="ambientcg-grid ambientcg-grid-wide">
              {materials.map(
                (material) =>
                  renderManagedResourceCard(
                    material,
                  ),
              )}
            </div>
          ) : (
            <div className="ambientcg-empty">
              No material packages have
              been cached yet.
            </div>
          )
        ) : null}

        {tab === "hdris" ? (
          hdris.length ? (
            <div className="ambientcg-grid ambientcg-grid-wide">
              {hdris.map((hdri) =>
                renderManagedResourceCard(
                  hdri,
                ),
              )}
            </div>
          ) : (
            <div className="ambientcg-empty">
              No HDRIs have been cached
              yet.
            </div>
          )
        ) : null}

        {tab in RESOURCE_TAB_TYPES ? (
          managedResourcesForTab.length ? (
            <div className="ambientcg-grid ambientcg-grid-wide">
              {managedResourcesForTab.map(
                (resource) =>
                  renderManagedResourceCard(
                    resource,
                  ),
              )}
            </div>
          ) : (
            <div className="ambientcg-empty">
              No {resourceTabLabel(tab).toLowerCase()} have been cached yet.
            </div>
          )
        ) : null}

        {tab === "downloads" ? (
          jobs.length ? (
            <div className="ambientcg-job-list">
              {jobs.map((job) => (
                <div
                  className="ambientcg-job"
                  key={job.job_id}
                >
                  <strong>
                    {
                      job.source_asset_id
                    }
                  </strong>
                  <span>
                    {job.asset_type}
                  </span>
                  <span>
                    {job.status}
                  </span>
                  <span>
                    {job.storage_provider ??
                      "—"}
                  </span>
                  <span>
                    {formatBytes(
                      job.downloaded_bytes,
                    )}
                  </span>
                  <span>
                    {job.error ??
                      formatDate(
                        job.completed_at ??
                          job.started_at,
                      )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="ambientcg-empty">
              No ambientCG download jobs
              yet.
            </div>
          )
        ) : null}

        {tab === "storage" ? (
          <div className="ambientcg-storage">
            <section className="ambientcg-storage-card">
              <h2>
                Cloudflare source of truth
              </h2>
              <p>
                Metadata is stored privately.
                Browser-loadable GLBs,
                normalized material maps,
                HDRIs, manifests, and
                previews are stored in the
                public runtime bucket.
              </p>
              <dl className="ambientcg-definition-list">
                <div>
                  <dt>
                    Cloud enabled
                  </dt>
                  <dd>
                    {status?.storage
                      ?.cloud_enabled
                      ? "Yes"
                      : "No — local fallback"}
                  </dd>
                </div>
                <div>
                  <dt>
                    Local metadata mirror
                  </dt>
                  <dd>
                    {status?.storage
                      ?.local_mirror_enabled
                      ? "Enabled"
                      : "Disabled"}
                  </dd>
                </div>
                <div>
                  <dt>
                    Cached asset destination
                  </dt>
                  <dd>
                    {status?.storage
                      ?.cached_asset_destination ??
                      "—"}
                  </dd>
                </div>
              </dl>
              <button
                className="ambientcg-button"
                data-primary="true"
                disabled={
                  migrationRunning
                }
                onClick={() =>
                  void bootstrapCloud()
                }
                type="button"
              >
                Publish metadata snapshots
                to R2
              </button>
            </section>

            <section className="ambientcg-storage-card">
              <h2>
                Existing model migration
              </h2>
              <p>
                Uses the existing verified
                model-promotion pipeline,
                then archives licence and
                source metadata in the
                private bucket.
              </p>
              <div className="ambientcg-progress">
                <strong>
                  {status?.migration
                    ?.cloud_ready_assets ??
                    0}
                </strong>
                <span>
                  of{" "}
                  {status?.migration
                    ?.eligible_assets ??
                    0}{" "}
                  eligible models are cloud
                  ready
                </span>
              </div>
              <label className="ambientcg-checkbox">
                <input
                  type="checkbox"
                  checked={
                    removeLocalAfterMigration
                  }
                  onChange={(event) =>
                    setRemoveLocalAfterMigration(
                      event.target
                        .checked,
                    )
                  }
                />
                Remove each verified model,
                thumbnail, and archived
                source from this laptop
              </label>
              <button
                className="ambientcg-button"
                data-primary="true"
                disabled={
                  migrationRunning ||
                  (status?.migration
                    ?.remaining_assets ??
                    0) === 0
                }
                onClick={() =>
                  void migrateAllModels()
                }
                type="button"
              >
                {migrationRunning
                  ? "Migrating…"
                  : "Migrate remaining models"}
              </button>
              <div className="ambientcg-progress">
                <strong>
                  {status?.migration
                    ?.local_source_copies ??
                    0}
                </strong>
                <span>
                  local model source copies
                  remain on this laptop
                </span>
              </div>
              <button
                className="ambientcg-button"
                data-primary="true"
                disabled={
                  migrationRunning ||
                  (status?.migration
                    ?.local_source_copies ??
                    0) === 0
                }
                onClick={() =>
                  void archiveLocalSources()
                }
                type="button"
              >
                {migrationRunning
                  ? "Archiving…"
                  : removeLocalAfterMigration
                    ? "Archive and clear local sources"
                    : "Archive local sources to R2"}
              </button>
            </section>

            <section className="ambientcg-storage-card">
              <h2>
                Compact local metadata
              </h2>
              <p>
                After R2 verification, replace
                the large local catalog and
                registry snapshots with tiny
                bootstrap files and remove
                old local ambientCG package
                folders.
              </p>
              <button
                className="ambientcg-button"
                data-danger="true"
                disabled={
                  migrationRunning ||
                  !status?.storage
                    ?.cloud_enabled
                }
                onClick={() =>
                  void compactLocalMetadata()
                }
                type="button"
              >
                Verify R2 and compact local
                state
              </button>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );

  return (
    <main
      className={
        embedded
          ? "ambientcg-shell ambientcg-shell-embedded"
          : "ambientcg-shell"
      }
    >
      <style>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        .ambientcg-shell {
          min-height: 100vh;
          padding: clamp(18px, 3vw, 42px);
          color: #e5edf8;
          background:
            radial-gradient(circle at 8% 0%, rgba(34,197,94,.13), transparent 32%),
            radial-gradient(circle at 94% 4%, rgba(14,165,233,.16), transparent 30%),
            #07101f;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        }
        .ambientcg-shell-embedded { min-height: 100vh; }
        .ambientcg-wrap { max-width: 1680px; margin: 0 auto; }
        .ambientcg-header {
          display: flex;
          gap: 22px;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }
        .ambientcg-eyebrow {
          margin: 0 0 7px;
          color: #86efac;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .ambientcg-header h1 {
          margin: 0;
          font-size: clamp(30px, 4vw, 54px);
        }
        .ambientcg-subtitle {
          max-width: 850px;
          color: #a9b8ce;
          line-height: 1.6;
        }
        .ambientcg-actions,
        .ambientcg-card-actions,
        .ambientcg-pagination,
        .ambientcg-detail-badges {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        .ambientcg-card-actions-stack {
          align-items: stretch;
        }
        .ambientcg-inline-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          width: 100%;
        }
        .ambientcg-inline-actions .ambientcg-button {
          width: 100%;
        }
        .ambientcg-button,
        .ambientcg-link,
        .ambientcg-tab,
        .ambientcg-input,
        .ambientcg-select {
          border: 1px solid rgba(148,163,184,.24);
          border-radius: 12px;
          color: #e5edf8;
          background: rgba(15,23,42,.78);
          font: inherit;
        }
        .ambientcg-button,
        .ambientcg-link,
        .ambientcg-tab {
          min-height: 42px;
          padding: 10px 15px;
          cursor: pointer;
          text-decoration: none;
        }
        .ambientcg-button[data-primary="true"] {
          border-color: rgba(34,197,94,.5);
          background: rgba(22,101,52,.55);
        }
        .ambientcg-button[data-secondary="true"] {
          border-color: rgba(56,189,248,.45);
        }
        .ambientcg-button[data-danger="true"] {
          border-color: rgba(248,113,113,.45);
          background: rgba(127,29,29,.32);
        }
        .ambientcg-button:disabled {
          cursor: not-allowed;
          opacity: .55;
        }
        .ambientcg-error,
        .ambientcg-notice,
        .ambientcg-success {
          margin: 12px 0;
          padding: 13px 15px;
          border-radius: 12px;
          line-height: 1.5;
        }
        .ambientcg-error {
          border: 1px solid rgba(248,113,113,.5);
          background: rgba(127,29,29,.35);
        }
        .ambientcg-notice {
          border: 1px solid rgba(56,189,248,.35);
          background: rgba(3,105,161,.2);
        }
        .ambientcg-success {
          border: 1px solid rgba(74,222,128,.35);
          background: rgba(22,101,52,.22);
        }
        .ambientcg-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 12px;
          margin: 20px 0;
        }
        .ambientcg-stat,
        .ambientcg-storage-card {
          padding: 16px;
          border: 1px solid rgba(148,163,184,.18);
          border-radius: 16px;
          background: rgba(15,23,42,.68);
        }
        .ambientcg-stat span {
          display: block;
          color: #94a3b8;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .08em;
        }
        .ambientcg-stat strong {
          display: block;
          margin-top: 6px;
          font-size: 22px;
        }
        .ambientcg-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .ambientcg-tab[data-active="true"] {
          border-color: rgba(34,197,94,.55);
          background: rgba(22,101,52,.38);
        }
        .ambientcg-panel {
          padding: 16px;
          border: 1px solid rgba(148,163,184,.18);
          border-radius: 18px;
          background: rgba(2,6,23,.44);
        }
        .ambientcg-controls {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 220px 220px;
          gap: 10px;
          margin-bottom: 16px;
        }
        .ambientcg-input,
        .ambientcg-select {
          width: 100%;
          min-height: 44px;
          padding: 10px 12px;
        }
        .ambientcg-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
          gap: 16px;
          align-items: start;
        }
        .ambientcg-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(235px, 1fr));
          gap: 14px;
        }
        .ambientcg-grid-wide {
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
        }
        .ambientcg-card {
          overflow: hidden;
          padding: 0;
          border: 1px solid rgba(148,163,184,.18);
          border-radius: 16px;
          color: inherit;
          text-align: left;
          background: rgba(15,23,42,.72);
        }
        button.ambientcg-card {
          cursor: pointer;
        }
        .ambientcg-card[data-selected="true"] {
          border-color: rgba(56,189,248,.75);
          box-shadow: 0 0 0 2px rgba(56,189,248,.16);
        }
        .ambientcg-card-image {
          display: block;
          width: 100%;
          height: 190px;
          object-fit: cover;
          background: #020617;
        }
        .ambientcg-card-image[data-hdri="true"],
        .ambientcg-detail-image[data-hdri="true"] {
          object-fit: contain;
        }
        .ambientcg-card-placeholder,
        .ambientcg-detail-placeholder {
          display: grid;
          place-items: center;
          min-height: 190px;
          color: #64748b;
          background: #020617;
        }
        .ambientcg-card-body {
          display: grid;
          gap: 10px;
          padding: 14px;
        }
        .ambientcg-card-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .ambientcg-card-title {
          margin: 0;
          font-size: 16px;
        }
        .ambientcg-meta,
        .ambientcg-map-list,
        .ambientcg-detail-copy {
          color: #9fb0c8;
          font-size: 13px;
          line-height: 1.5;
        }
        .ambientcg-status,
        .ambientcg-tag {
          display: inline-flex;
          align-items: center;
          padding: 5px 8px;
          border: 1px solid rgba(148,163,184,.2);
          border-radius: 999px;
          color: #cbd5e1;
          font-size: 11px;
          white-space: nowrap;
        }
        .ambientcg-status[data-status="published"] {
          border-color: rgba(74,222,128,.5);
          color: #86efac;
        }
        .ambientcg-status[data-status="failed"] {
          border-color: rgba(248,113,113,.5);
          color: #fca5a5;
        }
        .ambientcg-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .ambientcg-detail {
          position: sticky;
          top: 16px;
          overflow: hidden;
          padding: 16px;
          border: 1px solid rgba(148,163,184,.2);
          border-radius: 16px;
          background: rgba(15,23,42,.88);
        }
        .ambientcg-detail-image {
          width: 100%;
          max-height: 330px;
          border-radius: 12px;
          object-fit: cover;
          background: #020617;
        }
        .ambientcg-definition-list {
          display: grid;
          gap: 8px;
          margin: 16px 0;
        }
        .ambientcg-definition-list div {
          display: grid;
          grid-template-columns: 120px minmax(0, 1fr);
          gap: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(148,163,184,.12);
        }
        .ambientcg-definition-list dt {
          color: #94a3b8;
        }
        .ambientcg-definition-list dd {
          margin: 0;
          overflow-wrap: anywhere;
        }
        .ambientcg-pagination {
          justify-content: center;
          margin-top: 18px;
        }
        .ambientcg-empty {
          padding: 44px 18px;
          color: #94a3b8;
          text-align: center;
        }
        .ambientcg-job-list {
          display: grid;
          gap: 8px;
        }
        .ambientcg-job {
          display: grid;
          grid-template-columns: 1.3fr .7fr .6fr .6fr .7fr 1.5fr;
          gap: 10px;
          padding: 12px;
          border: 1px solid rgba(148,163,184,.14);
          border-radius: 12px;
          background: rgba(15,23,42,.58);
          font-size: 13px;
        }
        .ambientcg-storage {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .ambientcg-storage-card h2 {
          margin-top: 0;
        }
        .ambientcg-storage-card p {
          color: #a9b8ce;
          line-height: 1.55;
        }
        .ambientcg-progress {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin: 15px 0;
        }
        .ambientcg-progress strong {
          font-size: 28px;
        }
        .ambientcg-checkbox {
          display: flex;
          gap: 9px;
          align-items: flex-start;
          margin: 14px 0;
          color: #cbd5e1;
          line-height: 1.45;
        }
        @media (max-width: 1080px) {
          .ambientcg-stats,
          .ambientcg-storage {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .ambientcg-layout {
            grid-template-columns: 1fr;
          }
          .ambientcg-detail {
            position: static;
          }
        }
        @media (max-width: 760px) {
          .ambientcg-controls,
          .ambientcg-stats,
          .ambientcg-storage {
            grid-template-columns: 1fr;
          }
          .ambientcg-job {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      {content}
    </main>
  );
}
