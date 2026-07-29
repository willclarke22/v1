
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AmbientCgCachedHdri,
  AmbientCgCachedMaterial,
  AmbientCgCatalogAsset,
  AmbientCgDownloadJob,
  AmbientCgSyncState,
} from "../catalog/ambientcg/ambientcg-types";

type Tab = "catalog" | "materials" | "hdris" | "downloads";

type CatalogResponse = {
  ok: boolean;
  assets?: AmbientCgCatalogAsset[];
  total?: number;
  page?: number;
  page_count?: number;
  catalog_updated_at?: string | null;
  error?: string;
};

type StatusResponse = {
  ok: boolean;
  sync?: AmbientCgSyncState;
  counts?: { materials: number; hdris: number; jobs: number };
  error?: string;
};

const API = "/api/sandbox/probe-lab/assets/ambientcg";

function formatBytes(value: number | null | undefined) {
  if (!value) return "—";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function previewFor(asset: AmbientCgCatalogAsset) {
  return asset.thumbnail_urls[0] ?? asset.preview_urls[0] ?? null;
}

export function AmbientCgLibraryLab() {
  const [tab, setTab] = useState<Tab>("catalog");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [materials, setMaterials] = useState<AmbientCgCachedMaterial[]>([]);
  const [hdris, setHdris] = useState<AmbientCgCachedHdri[]>([]);
  const [jobs, setJobs] = useState<AmbientCgDownloadJob[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [catalogStatus, setCatalogStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [cachingId, setCachingId] = useState<string | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const response = await fetch(`${API}?view=status`, { cache: "no-store" });
    const payload = (await response.json()) as StatusResponse;
    setStatus(payload);
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        view: "catalog",
        q: query,
        type,
        status: catalogStatus,
        page: String(page),
        limit: "24",
      });
      const response = await fetch(`${API}?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as CatalogResponse;
      if (!payload.ok) throw new Error(payload.error ?? "Catalog request failed.");
      setCatalog(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [catalogStatus, page, query, type]);

  const loadMaterials = useCallback(async () => {
    const response = await fetch(`${API}?view=materials`, { cache: "no-store" });
    const payload = (await response.json()) as { ok: boolean; materials?: AmbientCgCachedMaterial[]; error?: string };
    if (!payload.ok) throw new Error(payload.error ?? "Material registry request failed.");
    setMaterials(payload.materials ?? []);
  }, []);

  const loadHdris = useCallback(async () => {
    const response = await fetch(`${API}?view=hdris`, { cache: "no-store" });
    const payload = (await response.json()) as { ok: boolean; hdris?: AmbientCgCachedHdri[]; error?: string };
    if (!payload.ok) throw new Error(payload.error ?? "HDRI registry request failed.");
    setHdris(payload.hdris ?? []);
  }, []);

  const loadJobs = useCallback(async () => {
    const response = await fetch(`${API}?view=jobs`, { cache: "no-store" });
    const payload = (await response.json()) as { ok: boolean; jobs?: AmbientCgDownloadJob[]; error?: string };
    if (!payload.ok) throw new Error(payload.error ?? "Download job request failed.");
    setJobs(payload.jobs ?? []);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      void loadCatalog();
    }, 250);
    return () => clearTimeout(timer);
  }, [query, type, catalogStatus, loadCatalog]);

  useEffect(() => {
    if (tab === "catalog") void loadCatalog();
    if (tab === "materials") void loadMaterials().catch((caught) => setError(String(caught)));
    if (tab === "hdris") void loadHdris().catch((caught) => setError(String(caught)));
    if (tab === "downloads") void loadJobs().catch((caught) => setError(String(caught)));
  }, [tab, page, loadCatalog, loadHdris, loadJobs, loadMaterials]);

  async function syncCatalog() {
    setSyncing(true);
    setError(null);
    setSyncMessage("Starting ambientCG catalog sync…");
    try {
      let restart = true;
      let done = false;
      while (!done) {
        const response = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync_page", restart, page_limit: 250 }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          done?: boolean;
          state?: AmbientCgSyncState;
          catalog_count?: number;
          error?: string;
        };
        if (!payload.ok) throw new Error(payload.error ?? "Catalog sync failed.");
        restart = false;
        done = payload.done === true;
        setSyncMessage(
          done
            ? `Catalog complete: ${payload.catalog_count ?? payload.state?.records_written ?? 0} assets.`
            : `Synced ${payload.state?.records_seen ?? 0} of ${payload.state?.total_results ?? "…"} assets…`,
        );
      }
      await Promise.all([loadStatus(), loadCatalog()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSyncing(false);
    }
  }

  async function cacheAsset(asset: AmbientCgCatalogAsset) {
    const variantId = selectedVariants[asset.source_asset_id] ?? asset.download_variants[0]?.variant_id;
    if (!variantId) {
      setError("This catalog entry has no downloadable variants in its mirrored record.");
      return;
    }
    setCachingId(asset.source_asset_id);
    setError(null);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cache",
          source_asset_id: asset.source_asset_id,
          variant_id: variantId,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Caching failed.");
      await Promise.all([loadCatalog(), loadStatus(), loadJobs(), loadMaterials(), loadHdris()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCachingId(null);
    }
  }

  const counts = useMemo(
    () => ({
      materials: status?.counts?.materials ?? materials.length,
      hdris: status?.counts?.hdris ?? hdris.length,
      jobs: status?.counts?.jobs ?? jobs.length,
    }),
    [hdris.length, jobs.length, materials.length, status],
  );

  return (
    <main className="ambientcg-shell">
      <style>{`
        :root { color-scheme: dark; }
        body { margin: 0; background: #07101f; }
        * { box-sizing: border-box; }
        .ambientcg-shell { min-height: 100vh; padding: clamp(18px, 3vw, 42px); color: #e5edf8; background: radial-gradient(circle at 8% 0%, rgba(34,197,94,.13), transparent 32%), radial-gradient(circle at 94% 4%, rgba(14,165,233,.16), transparent 30%), #07101f; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        .ambientcg-wrap { max-width: 1680px; margin: 0 auto; }
        .ambientcg-header { display: flex; gap: 22px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; margin-bottom: 22px; }
        .ambientcg-eyebrow { margin: 0; color: #4ade80; font-size: 12px; font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
        h1 { margin: 7px 0 8px; font-size: clamp(30px, 5vw, 56px); }
        .ambientcg-subtitle { max-width: 900px; color: #9fb0c7; line-height: 1.65; }
        .ambientcg-actions, .ambientcg-tabs { display: flex; gap: 9px; flex-wrap: wrap; }
        .ambientcg-button, .ambientcg-link, .ambientcg-tab { border: 1px solid rgba(148,163,184,.28); border-radius: 11px; padding: 10px 13px; color: #dce7f5; background: rgba(15,23,42,.76); font: inherit; font-weight: 760; cursor: pointer; text-decoration: none; }
        .ambientcg-button[data-primary="true"] { border: 0; background: #4ade80; color: #06220f; }
        .ambientcg-button:disabled { opacity: .55; cursor: not-allowed; }
        .ambientcg-tabs { margin-bottom: 16px; }
        .ambientcg-tab[data-active="true"] { background: #0ea5e9; border-color: #0ea5e9; color: #03131d; }
        .ambientcg-panel { border: 1px solid rgba(148,163,184,.2); border-radius: 18px; background: rgba(15,23,42,.72); box-shadow: 0 25px 70px rgba(0,0,0,.23); padding: 18px; }
        .ambientcg-stats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin-bottom: 16px; }
        .ambientcg-stat { padding: 13px; border-radius: 13px; background: rgba(2,6,23,.64); border: 1px solid rgba(148,163,184,.15); }
        .ambientcg-stat strong { display: block; font-size: 22px; margin-top: 5px; }
        .ambientcg-controls { display: grid; grid-template-columns: minmax(260px,1fr) 190px 170px; gap: 10px; margin-bottom: 16px; }
        .ambientcg-input, .ambientcg-select { width: 100%; border: 1px solid rgba(148,163,184,.28); border-radius: 11px; padding: 11px; background: #020617; color: #e5edf8; font: inherit; }
        .ambientcg-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(285px,1fr)); gap: 14px; }
        .ambientcg-card { overflow: hidden; border: 1px solid rgba(148,163,184,.18); border-radius: 15px; background: rgba(2,6,23,.72); }
        .ambientcg-card-image { width: 100%; height: 180px; display: block; object-fit: cover; background: #020617; }
        .ambientcg-card-placeholder { height: 180px; display: grid; place-items: center; color: #64748b; background: #020617; }
        .ambientcg-card-body { padding: 14px; display: grid; gap: 9px; }
        .ambientcg-card-title { margin: 0; font-size: 17px; }
        .ambientcg-meta { color: #8fa2bb; font-size: 12px; line-height: 1.45; }
        .ambientcg-tags { display: flex; gap: 6px; flex-wrap: wrap; }
        .ambientcg-tag { padding: 4px 7px; border-radius: 999px; background: rgba(14,165,233,.12); color: #7dd3fc; font-size: 11px; }
        .ambientcg-status { font-weight: 800; color: #facc15; }
        .ambientcg-status[data-status="cached"] { color: #86efac; }
        .ambientcg-card-actions { display: grid; gap: 8px; }
        .ambientcg-pagination { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 18px; }
        .ambientcg-error { margin-bottom: 14px; border: 1px solid rgba(248,113,113,.4); border-radius: 12px; background: rgba(127,29,29,.2); color: #fecaca; padding: 12px; white-space: pre-wrap; }
        .ambientcg-notice { margin-bottom: 14px; border: 1px solid rgba(74,222,128,.3); border-radius: 12px; background: rgba(20,83,45,.2); color: #bbf7d0; padding: 12px; }
        .ambientcg-empty { min-height: 250px; display: grid; place-items: center; color: #71839b; text-align: center; }
        .ambientcg-map-list { font-size: 11px; color: #a7f3d0; word-break: break-word; }
        .ambientcg-job { display: grid; grid-template-columns: minmax(180px,1fr) 120px 120px 150px minmax(220px,1fr); gap: 10px; align-items: center; border-bottom: 1px solid rgba(148,163,184,.12); padding: 11px 2px; font-size: 13px; }
        @media (max-width: 850px) { .ambientcg-controls, .ambientcg-stats { grid-template-columns: 1fr; } .ambientcg-job { grid-template-columns: 1fr; } }
      `}</style>
      <div className="ambientcg-wrap">
        <header className="ambientcg-header">
          <div>
            <p className="ambientcg-eyebrow">MyWay CC0 resources · Phase 1</p>
            <h1>ambientCG Materials & HDRIs</h1>
            <p className="ambientcg-subtitle">
              Mirror the complete ambientCG metadata catalog, then cache only the normalized material or HDRI variants MyWay needs. Remote catalog records and locally usable resources remain visibly separate.
            </p>
          </div>
          <div className="ambientcg-actions">
            <a className="ambientcg-link" href="/sandbox/probe-lab/asset-library">Model Asset Library</a>
            <button className="ambientcg-button" data-primary="true" disabled={syncing} onClick={() => void syncCatalog()} type="button">
              {syncing ? "Syncing catalog…" : "Sync ambientCG catalog"}
            </button>
          </div>
        </header>

        {error && <div className="ambientcg-error">{error}</div>}
        {syncMessage && <div className="ambientcg-notice">{syncMessage}</div>}

        <div className="ambientcg-stats">
          <div className="ambientcg-stat"><span>Sync status</span><strong>{status?.sync?.status ?? "idle"}</strong></div>
          <div className="ambientcg-stat"><span>Cached materials</span><strong>{counts.materials}</strong></div>
          <div className="ambientcg-stat"><span>Cached HDRIs</span><strong>{counts.hdris}</strong></div>
          <div className="ambientcg-stat"><span>Download jobs</span><strong>{counts.jobs}</strong></div>
        </div>

        <nav className="ambientcg-tabs" aria-label="ambientCG resource section">
          {(["catalog", "materials", "hdris", "downloads"] as Tab[]).map((item) => (
            <button className="ambientcg-tab" data-active={tab === item} key={item} onClick={() => setTab(item)} type="button">
              {item === "hdris" ? "HDRIs" : item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>

        <section className="ambientcg-panel">
          {tab === "catalog" && (
            <>
              <div className="ambientcg-controls">
                <input className="ambientcg-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wood, metal, studio, concrete…" />
                <select className="ambientcg-select" value={type} onChange={(event) => setType(event.target.value)}>
                  <option value="all">All types</option>
                  <option value="material">Materials</option>
                  <option value="hdri">HDRIs</option>
                  <option value="decal">Decals</option>
                  <option value="atlas">Atlases</option>
                  <option value="3d-model">3D models</option>
                  <option value="terrain">Terrains</option>
                  <option value="plain-image">Plain images</option>
                </select>
                <select className="ambientcg-select" value={catalogStatus} onChange={(event) => setCatalogStatus(event.target.value)}>
                  <option value="all">Remote + cached</option>
                  <option value="cataloged">Remote only</option>
                  <option value="cached">Cached locally</option>
                </select>
              </div>
              {loading ? (
                <div className="ambientcg-empty">Loading the local catalog…</div>
              ) : !catalog?.assets?.length ? (
                <div className="ambientcg-empty">No catalog records yet. Run “Sync ambientCG catalog” to mirror the metadata.</div>
              ) : (
                <div className="ambientcg-grid">
                  {catalog.assets.map((asset) => {
                    const preview = previewFor(asset);
                    const canCache = asset.asset_type === "material" || asset.asset_type === "hdri";
                    const selected = selectedVariants[asset.source_asset_id] ?? asset.download_variants[0]?.variant_id ?? "";
                    return (
                      <article className="ambientcg-card" key={asset.asset_id}>
                        {preview ? <img className="ambientcg-card-image" src={preview} alt="" /> : <div className="ambientcg-card-placeholder">No preview in API record</div>}
                        <div className="ambientcg-card-body">
                          <div>
                            <h2 className="ambientcg-card-title">{asset.display_name}</h2>
                            <div className="ambientcg-meta">{asset.source_asset_id} · {asset.asset_type} · {asset.technique ?? "technique unknown"}</div>
                          </div>
                          <div className="ambientcg-status" data-status={asset.catalog_status}>{asset.catalog_status === "cached" ? "Cached locally" : "Available remotely"}</div>
                          <div className="ambientcg-tags">{asset.semantic_tags.slice(0, 7).map((tag) => <span className="ambientcg-tag" key={tag}>{tag}</span>)}</div>
                          <div className="ambientcg-card-actions">
                            <select className="ambientcg-select" disabled={!asset.download_variants.length} value={selected} onChange={(event) => setSelectedVariants((current) => ({ ...current, [asset.source_asset_id]: event.target.value }))}>
                              {!asset.download_variants.length && <option value="">No variants mirrored</option>}
                              {asset.download_variants.map((variant) => <option value={variant.variant_id} key={variant.variant_id}>{variant.resolution ?? "Native"} · {variant.file_format ?? "file"} · {formatBytes(variant.size_bytes)}</option>)}
                            </select>
                            <button className="ambientcg-button" data-primary="true" disabled={!canCache || !selected || cachingId !== null} onClick={() => void cacheAsset(asset)} type="button">
                              {cachingId === asset.source_asset_id ? "Downloading & normalizing…" : asset.catalog_status === "cached" ? "Cache selected variant again" : canCache ? "Cache for MyWay" : "Phase 1: catalog only"}
                            </button>
                            <a className="ambientcg-link" href={asset.source_url} target="_blank" rel="noreferrer">Open source page</a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <div className="ambientcg-pagination">
                <button className="ambientcg-button" disabled={(catalog?.page ?? 1) <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
                <span>Page {catalog?.page ?? 1} of {catalog?.page_count ?? 1} · {catalog?.total ?? 0} results</span>
                <button className="ambientcg-button" disabled={(catalog?.page ?? 1) >= (catalog?.page_count ?? 1)} onClick={() => setPage((value) => value + 1)}>Next</button>
              </div>
            </>
          )}

          {tab === "materials" && (
            materials.length ? <div className="ambientcg-grid">{materials.map((material) => (
              <article className="ambientcg-card" key={material.resource_id}>
                {material.thumbnail_url ? <img className="ambientcg-card-image" src={material.thumbnail_url} alt="" /> : <div className="ambientcg-card-placeholder">Cached material</div>}
                <div className="ambientcg-card-body">
                  <h2 className="ambientcg-card-title">{material.display_name}</h2>
                  <div className="ambientcg-meta">{material.resolution ?? "native"} · {material.file_format ?? "file"} · CC0 1.0</div>
                  <div className="ambientcg-map-list">{Object.entries(material.maps).filter(([, value]) => value).map(([role]) => role).join(" · ")}</div>
                  <a className="ambientcg-link" href={material.source_url} target="_blank" rel="noreferrer">ambientCG source</a>
                </div>
              </article>
            ))}</div> : <div className="ambientcg-empty">No materials have been cached yet.</div>
          )}

          {tab === "hdris" && (
            hdris.length ? <div className="ambientcg-grid">{hdris.map((hdri) => (
              <article className="ambientcg-card" key={hdri.resource_id}>
                {hdri.thumbnail_url ? <img className="ambientcg-card-image" src={hdri.thumbnail_url} alt="" /> : <div className="ambientcg-card-placeholder">Cached HDRI</div>}
                <div className="ambientcg-card-body">
                  <h2 className="ambientcg-card-title">{hdri.display_name}</h2>
                  <div className="ambientcg-meta">{hdri.resolution ?? "native"} · {hdri.file_format ?? "file"} · CC0 1.0</div>
                  <div className="ambientcg-meta">Runtime file: {hdri.environment_url}</div>
                  <a className="ambientcg-link" href={hdri.source_url} target="_blank" rel="noreferrer">ambientCG source</a>
                </div>
              </article>
            ))}</div> : <div className="ambientcg-empty">No HDRIs have been cached yet.</div>
          )}

          {tab === "downloads" && (
            jobs.length ? <div>{jobs.map((job) => (
              <div className="ambientcg-job" key={job.job_id}>
                <strong>{job.source_asset_id}</strong>
                <span>{job.asset_type}</span>
                <span>{job.status}</span>
                <span>{formatBytes(job.downloaded_bytes)}</span>
                <span>{job.error ?? formatDate(job.completed_at ?? job.started_at)}</span>
              </div>
            ))}</div> : <div className="ambientcg-empty">No ambientCG download jobs yet.</div>
          )}
        </section>
      </div>
    </main>
  );
}
