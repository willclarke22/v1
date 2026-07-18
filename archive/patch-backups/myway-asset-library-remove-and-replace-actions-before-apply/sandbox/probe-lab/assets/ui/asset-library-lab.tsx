"use client";

import { Bounds, Clone, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";

type Vec3 = [number, number, number];

type AssetFileStats = {
  exists: boolean;
  file_size_bytes: number | null;
  project_relative_path: string | null;
  storage_provider?: "local" | "r2";
  remote_url?: string | null;
};

type LibraryAsset = {
  asset_id: string;
  canonical_label: string;
  display_name: string;
  aliases: string[];
  semantic_tags: string[];
  style_tags: string[];
  asset_type: "glb" | "gltf" | "primitive";
  domain: string;
  source_type: "blenderkit" | "trellis" | "manual" | "procedural";
  source_asset_id?: string | null;
  source_prompt?: string | null;
  source_url?: string | null;
  source_path?: string | null;
  public_path: string;
  thumbnail_path?: string | null;
  license_record_path?: string | null;
  storage_provider?: "local" | "r2";
  storage_object_key?: string | null;
  storage_etag?: string | null;
  file_size_bytes?: number | null;
  thumbnail_storage_provider?: "local" | "r2" | null;
  thumbnail_object_key?: string | null;
  promoted_at?: string | null;
  dimensions_m: Vec3;
  default_scale: number;
  default_rotation: Vec3;
  ground_offset_m: number;
  polygon_count?: number | null;
  rigged: boolean;
  animation_clips: string[];
  content_hash?: string | null;
  quality_score: number;
  reuse_count: number;
  license_kind: "cc0" | "royalty_free" | "self_owned" | "unknown";
  license_status: "recorded" | "needs_review" | "sandbox_only" | "app_ready";
  commercial_use_allowed: boolean;
  raw_redistribution_allowed: boolean;
  safe_to_use_in_sandbox: boolean;
  safe_to_promote_to_app: boolean;
  status: "inbox" | "normalized" | "approved" | "rejected";
  notes?: string | null;
  created_at: string;
  updated_at: string;
  file_stats: AssetFileStats;
};

type LibraryResponse = {
  ok: boolean;
  count?: number;
  assets?: LibraryAsset[];
  asset?: LibraryAsset;
  error?: string;
};

type SortKey = "newest" | "name" | "source" | "reuse";

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function formatBytes(value: number | null) {
  if (value == null) return "No file size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDimensions(dimensions: Vec3) {
  return dimensions.map((value) => value.toFixed(2)).join(" × ");
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function sourceLabel(source: LibraryAsset["source_type"]) {
  if (source === "blenderkit") return "BlendKit";
  if (source === "trellis") return "TRELLIS";
  if (source === "procedural") return "Procedural";
  return "Manual";
}

function LoadedAsset({ src }: { src: string }) {
  const gltf = useGLTF(src);

  return (
    <Bounds fit clip observe margin={1.3}>
      <Clone object={gltf.scene} castShadow receiveShadow />
    </Bounds>
  );
}

function ViewerLoading() {
  return (
    <Html center>
      <div className="asset-library-loading">Loading 3D asset…</div>
    </Html>
  );
}

class ViewerErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Asset library GLB preview failed.", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="asset-library-viewer-message">
          <strong>The GLB could not be previewed.</strong>
          <span>{this.state.error}</span>
        </div>
      );
    }

    return this.props.children;
  }
}

function AssetViewer({ asset }: { asset: LibraryAsset | null }) {
  if (!asset) {
    return (
      <div className="asset-library-viewer-message">
        Select an asset to inspect it in 3D.
      </div>
    );
  }

  const canPreview =
    asset.file_stats.exists &&
    (asset.asset_type === "glb" || asset.asset_type === "gltf");

  if (!canPreview) {
    return (
      <div className="asset-library-viewer-message">
        <strong>No browser-loadable 3D file is available.</strong>
        <span>
          This entry is either procedural or its registered file is missing.
        </span>
      </div>
    );
  }

  return (
    <ViewerErrorBoundary key={asset.asset_id}>
      <Canvas
        camera={{ position: [4.5, 3.2, 5.5], fov: 42 }}
        dpr={[1, 1.75]}
        shadows
      >
        <color attach="background" args={["#07111f"]} />
        <ambientLight intensity={1.5} />
        <hemisphereLight
          args={["#dbeafe", "#172554", 1.7]}
          position={[0, 4, 0]}
        />
        <directionalLight
          castShadow
          intensity={3}
          position={[4, 6, 5]}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight intensity={1.1} position={[-4, 2, -3]} />

        <Suspense fallback={<ViewerLoading />}>
          <LoadedAsset src={asset.public_path} />
        </Suspense>

        <gridHelper
          args={[10, 20, "#334155", "#172033"]}
          position={[0, -1.35, 0]}
        />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={1.5}
          maxDistance={14}
        />
      </Canvas>
    </ViewerErrorBoundary>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="asset-library-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function MetadataRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="asset-library-metadata-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

export function AssetLibraryLab() {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [licenseFilter, setLicenseFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [refreshToken, setRefreshToken] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [promotingAssetId, setPromotingAssetId] = useState<string | null>(null);
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLibrary() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          "/api/sandbox/probe-lab/assets/library",
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const payload = (await response.json()) as LibraryResponse;

        const loadedAssets = payload.assets;

        if (!response.ok || !payload.ok || !Array.isArray(loadedAssets)) {
          throw new Error(
            payload.error || "The asset library could not be loaded.",
          );
        }

        setAssets(loadedAssets);
        setSelectedAssetId((current) => {
          if (
            current &&
            loadedAssets.some((asset) => asset.asset_id === current)
          ) {
            return current;
          }

          const newestPreviewable = loadedAssets
            .filter(
              (asset) =>
                asset.file_stats.exists &&
                (asset.asset_type === "glb" ||
                  asset.asset_type === "gltf"),
            )
            .sort(
              (a, b) =>
                Date.parse(b.created_at) - Date.parse(a.created_at),
            )[0];

          return newestPreviewable?.asset_id ?? loadedAssets[0]?.asset_id ?? null;
        });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadLibrary();

    return () => controller.abort();
  }, [refreshToken]);

  async function uploadSelectedAssetToCloudflare() {
    if (!selectedAssetId) return;

    const asset = assets.find(
      (candidate) => candidate.asset_id === selectedAssetId,
    );

    if (!asset) return;

    const confirmed = window.confirm(
      `Upload "${asset.display_name}" to the public Cloudflare R2 runtime bucket?\n\nOnly continue after reviewing the rotating 3D preview. The asset's recorded license must permit production use and public GLB distribution.`,
    );

    if (!confirmed) return;

    setPromotingAssetId(asset.asset_id);
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/promote",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asset_id: asset.asset_id,
          }),
        },
      );
      const payload = (await response.json()) as LibraryResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error || "The asset could not be uploaded to Cloudflare R2.",
        );
      }

      setPromotionMessage(
        `${asset.display_name} is now stored in Cloudflare R2.`,
      );
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setPromotingAssetId(null);
    }
  }

  const sources = useMemo(
    () => uniqueSorted(assets.map((asset) => asset.source_type)),
    [assets],
  );
  const domains = useMemo(
    () => uniqueSorted(assets.map((asset) => asset.domain)),
    [assets],
  );
  const statuses = useMemo(
    () => uniqueSorted(assets.map((asset) => asset.status)),
    [assets],
  );
  const licenses = useMemo(
    () => uniqueSorted(assets.map((asset) => asset.license_kind)),
    [assets],
  );

  const visibleAssets = useMemo(() => {
    const queryTokens = search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const filtered = assets.filter((asset) => {
      if (sourceFilter !== "all" && asset.source_type !== sourceFilter) {
        return false;
      }
      if (domainFilter !== "all" && asset.domain !== domainFilter) {
        return false;
      }
      if (statusFilter !== "all" && asset.status !== statusFilter) {
        return false;
      }
      if (licenseFilter !== "all" && asset.license_kind !== licenseFilter) {
        return false;
      }

      const searchable = [
        asset.asset_id,
        asset.canonical_label,
        asset.display_name,
        asset.domain,
        asset.source_type,
        asset.status,
        asset.license_kind,
        asset.license_status,
        asset.notes ?? "",
        asset.source_prompt ?? "",
        ...asset.aliases,
        ...asset.semantic_tags,
        ...asset.style_tags,
      ]
        .join(" ")
        .toLowerCase();

      return queryTokens.every((token) => searchable.includes(token));
    });

    filtered.sort((a, b) => {
      if (sortKey === "name") {
        return a.display_name.localeCompare(b.display_name);
      }
      if (sortKey === "source") {
        return (
          a.source_type.localeCompare(b.source_type) ||
          a.display_name.localeCompare(b.display_name)
        );
      }
      if (sortKey === "reuse") {
        return (
          b.reuse_count - a.reuse_count ||
          a.display_name.localeCompare(b.display_name)
        );
      }
      return (
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        a.display_name.localeCompare(b.display_name)
      );
    });

    return filtered;
  }, [
    assets,
    domainFilter,
    licenseFilter,
    search,
    sortKey,
    sourceFilter,
    statusFilter,
  ]);

  const selectedAsset =
    assets.find((asset) => asset.asset_id === selectedAssetId) ?? null;

  const existingFiles = assets.filter(
    (asset) => asset.file_stats.exists,
  ).length;
  const generatedAssets = assets.filter(
    (asset) =>
      asset.source_type === "blenderkit" ||
      asset.source_type === "trellis",
  ).length;

  return (
    <main className="asset-library-page">
      <style>{`
        * { box-sizing: border-box; }

        .asset-library-page {
          min-height: 100vh;
          padding: clamp(1rem, 3vw, 2.5rem);
          color: #f8fafc;
          background:
            radial-gradient(circle at 10% 0%, rgba(14, 165, 233, 0.20), transparent 28rem),
            radial-gradient(circle at 100% 10%, rgba(34, 197, 94, 0.16), transparent 25rem),
            linear-gradient(145deg, #020617, #07111f 52%, #0f172a);
        }

        .asset-library-shell {
          width: min(1540px, 100%);
          margin: 0 auto;
        }

        .asset-library-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }

        .asset-library-eyebrow {
          margin: 0 0 0.55rem;
          color: #7dd3fc;
          font-size: 0.75rem;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .asset-library-header h1 {
          margin: 0;
          font-size: clamp(2rem, 5vw, 4.6rem);
          line-height: 0.96;
          letter-spacing: -0.045em;
        }

        .asset-library-subtitle {
          max-width: 760px;
          margin: 1rem 0 0;
          color: rgba(226, 232, 240, 0.72);
          line-height: 1.65;
        }

        .asset-library-header-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.65rem;
        }

        .asset-library-link,
        .asset-library-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 999px;
          padding: 0.55rem 0.9rem;
          color: #e2e8f0;
          background: rgba(15, 23, 42, 0.76);
          font: inherit;
          font-size: 0.86rem;
          font-weight: 800;
          text-decoration: none;
          cursor: pointer;
        }

        .asset-library-button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .asset-library-button[data-primary="true"] {
          border-color: rgba(74, 222, 128, 0.55);
          color: #dcfce7;
          background: rgba(22, 163, 74, 0.24);
        }

        .asset-library-promotion-note,
        .asset-library-success {
          border: 1px solid rgba(74, 222, 128, 0.25);
          border-radius: 0.9rem;
          margin: 0 0 1rem;
          padding: 0.75rem;
          color: rgba(220, 252, 231, 0.86);
          background: rgba(22, 163, 74, 0.1);
          font-size: 0.8rem;
          line-height: 1.5;
        }

        .asset-library-success {
          margin: 0 0 1rem;
        }

        .asset-library-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.8rem;
          margin-bottom: 1rem;
        }

        .asset-library-stat {
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 1.2rem;
          padding: 1rem;
          background: rgba(15, 23, 42, 0.62);
          box-shadow: 0 18px 48px rgba(2, 6, 23, 0.24);
        }

        .asset-library-stat span,
        .asset-library-stat small {
          display: block;
          color: rgba(203, 213, 225, 0.62);
        }

        .asset-library-stat strong {
          display: block;
          margin: 0.35rem 0 0.2rem;
          font-size: 1.7rem;
        }

        .asset-library-controls {
          display: grid;
          grid-template-columns: minmax(240px, 1.8fr) repeat(5, minmax(130px, 0.7fr));
          gap: 0.7rem;
          margin-bottom: 1rem;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 1.25rem;
          padding: 0.8rem;
          background: rgba(15, 23, 42, 0.66);
        }

        .asset-library-controls input,
        .asset-library-controls select {
          width: 100%;
          min-height: 44px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 0.85rem;
          padding: 0 0.8rem;
          color: #f8fafc;
          background: rgba(2, 6, 23, 0.72);
          font: inherit;
          outline: none;
        }

        .asset-library-controls input:focus,
        .asset-library-controls select:focus {
          border-color: rgba(56, 189, 248, 0.72);
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.13);
        }

        .asset-library-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(380px, 0.85fr);
          gap: 1rem;
          align-items: start;
        }

        .asset-library-results {
          min-width: 0;
        }

        .asset-library-results-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.8rem;
          margin-bottom: 0.75rem;
          color: rgba(226, 232, 240, 0.7);
          font-size: 0.86rem;
        }

        .asset-library-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 0.8rem;
        }

        .asset-library-card {
          overflow: hidden;
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 1.15rem;
          padding: 0;
          color: inherit;
          text-align: left;
          background: rgba(15, 23, 42, 0.66);
          box-shadow: 0 16px 40px rgba(2, 6, 23, 0.22);
          cursor: pointer;
          transition:
            transform 140ms ease,
            border-color 140ms ease,
            background 140ms ease;
        }

        .asset-library-card:hover {
          transform: translateY(-2px);
          border-color: rgba(56, 189, 248, 0.52);
          background: rgba(15, 23, 42, 0.9);
        }

        .asset-library-card[data-selected="true"] {
          border-color: rgba(56, 189, 248, 0.95);
          box-shadow:
            0 0 0 2px rgba(14, 165, 233, 0.18),
            0 20px 48px rgba(2, 132, 199, 0.18);
        }

        .asset-library-card-image {
          position: relative;
          display: grid;
          min-height: 165px;
          place-items: center;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 30%, rgba(56, 189, 248, 0.18), transparent 55%),
            #07111f;
        }

        .asset-library-card-image img {
          width: 100%;
          height: 165px;
          object-fit: contain;
        }

        .asset-library-placeholder {
          display: grid;
          width: 72px;
          height: 72px;
          place-items: center;
          border: 1px solid rgba(125, 211, 252, 0.35);
          border-radius: 1.25rem;
          color: #7dd3fc;
          background: rgba(14, 165, 233, 0.09);
          font-size: 1.7rem;
          font-weight: 900;
        }

        .asset-library-card-body {
          padding: 0.9rem;
        }

        .asset-library-card-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.65rem;
        }

        .asset-library-card h2 {
          margin: 0;
          font-size: 1rem;
          line-height: 1.3;
        }

        .asset-library-card-id {
          margin: 0.35rem 0 0;
          overflow: hidden;
          color: rgba(148, 163, 184, 0.7);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.68rem;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .asset-library-badges,
        .asset-library-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.38rem;
        }

        .asset-library-badges {
          margin-top: 0.75rem;
        }

        .asset-library-badge {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 999px;
          padding: 0.24rem 0.48rem;
          color: rgba(226, 232, 240, 0.74);
          background: rgba(2, 6, 23, 0.46);
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .asset-library-badge[data-positive="true"] {
          border-color: rgba(74, 222, 128, 0.35);
          color: #86efac;
          background: rgba(22, 163, 74, 0.11);
        }

        .asset-library-badge[data-warning="true"] {
          border-color: rgba(251, 191, 36, 0.35);
          color: #fde68a;
          background: rgba(217, 119, 6, 0.11);
        }

        .asset-library-panel {
          position: sticky;
          top: 1rem;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 1.35rem;
          background: rgba(15, 23, 42, 0.76);
          box-shadow: 0 24px 72px rgba(2, 6, 23, 0.36);
        }

        .asset-library-viewer {
          height: 490px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
          background: #07111f;
        }

        .asset-library-viewer > div,
        .asset-library-viewer canvas {
          width: 100% !important;
          height: 100% !important;
        }

        .asset-library-loading {
          border: 1px solid rgba(125, 211, 252, 0.28);
          border-radius: 999px;
          padding: 0.65rem 0.85rem;
          color: #bae6fd;
          background: rgba(2, 6, 23, 0.82);
          white-space: nowrap;
        }

        .asset-library-viewer-message {
          display: grid;
          min-height: 100%;
          place-content: center;
          gap: 0.5rem;
          padding: 2rem;
          color: rgba(226, 232, 240, 0.68);
          text-align: center;
        }

        .asset-library-viewer-message strong {
          color: #f8fafc;
        }

        .asset-library-details {
          max-height: 480px;
          overflow: auto;
          padding: 1rem;
        }

        .asset-library-details h2 {
          margin: 0;
          font-size: 1.35rem;
        }

        .asset-library-details-id {
          margin: 0.35rem 0 0.9rem;
          color: rgba(148, 163, 184, 0.72);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.72rem;
          overflow-wrap: anywhere;
        }

        .asset-library-detail-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
          margin-bottom: 1rem;
        }

        .asset-library-metadata {
          display: grid;
          gap: 0.15rem;
        }

        .asset-library-metadata-row {
          display: grid;
          grid-template-columns: 125px minmax(0, 1fr);
          gap: 0.8rem;
          border-top: 1px solid rgba(148, 163, 184, 0.11);
          padding: 0.62rem 0;
          font-size: 0.82rem;
        }

        .asset-library-metadata-row > span {
          color: rgba(148, 163, 184, 0.72);
        }

        .asset-library-metadata-row > div {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .asset-library-tags {
          margin-top: 0.8rem;
        }

        .asset-library-tag {
          border-radius: 999px;
          padding: 0.3rem 0.55rem;
          color: #bae6fd;
          background: rgba(14, 165, 233, 0.12);
          font-size: 0.7rem;
          font-weight: 700;
        }

        .asset-library-empty,
        .asset-library-error {
          border: 1px dashed rgba(148, 163, 184, 0.28);
          border-radius: 1.2rem;
          padding: 2rem;
          color: rgba(226, 232, 240, 0.68);
          text-align: center;
          background: rgba(15, 23, 42, 0.42);
        }

        .asset-library-error {
          border-color: rgba(248, 113, 113, 0.38);
          color: #fecaca;
          background: rgba(127, 29, 29, 0.18);
        }

        @media (max-width: 1180px) {
          .asset-library-controls {
            grid-template-columns: repeat(3, minmax(150px, 1fr));
          }

          .asset-library-controls input {
            grid-column: 1 / -1;
          }

          .asset-library-layout {
            grid-template-columns: 1fr;
          }

          .asset-library-panel {
            position: static;
            grid-row: 1;
          }
        }

        @media (max-width: 720px) {
          .asset-library-header {
            display: block;
          }

          .asset-library-header-actions {
            justify-content: flex-start;
            margin-top: 1rem;
          }

          .asset-library-stats,
          .asset-library-controls {
            grid-template-columns: 1fr;
          }

          .asset-library-controls input {
            grid-column: auto;
          }

          .asset-library-viewer {
            height: 390px;
          }

          .asset-library-metadata-row {
            grid-template-columns: 1fr;
            gap: 0.25rem;
          }
        }
      `}</style>

      <div className="asset-library-shell">
        <header className="asset-library-header">
          <div>
            <p className="asset-library-eyebrow">MyWay shared assets</p>
            <h1>Asset Library</h1>
            <p className="asset-library-subtitle">
              Search everything MyWay has acquired, inspect its metadata,
              and rotate browser-loadable GLB assets in a live 3D preview.
            </p>
          </div>

          <div className="asset-library-header-actions">
            <a className="asset-library-link" href="/sandbox/probe-lab">
              Back to Probe Lab
            </a>
            <button
              className="asset-library-button"
              disabled={isLoading}
              onClick={() => setRefreshToken((value) => value + 1)}
              type="button"
            >
              {isLoading ? "Refreshing…" : "Refresh library"}
            </button>
          </div>
        </header>

        <section className="asset-library-stats">
          <StatCard
            label="Registered assets"
            value={assets.length}
            detail="Entries in the shared registry"
          />
          <StatCard
            label="Files available"
            value={existingFiles}
            detail="Assets whose registered file exists"
          />
          <StatCard
            label="Automatically acquired"
            value={generatedAssets}
            detail="BlendKit and TRELLIS assets"
          />
        </section>

        <section className="asset-library-controls" aria-label="Asset filters">
          <input
            aria-label="Search assets"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search names, IDs, aliases, tags, notes…"
            type="search"
            value={search}
          />

          <select
            aria-label="Filter by source"
            onChange={(event) => setSourceFilter(event.target.value)}
            value={sourceFilter}
          >
            <option value="all">All sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {sourceLabel(source as LibraryAsset["source_type"])}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by domain"
            onChange={(event) => setDomainFilter(event.target.value)}
            value={domainFilter}
          >
            <option value="all">All domains</option>
            {domains.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="all">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by license"
            onChange={(event) => setLicenseFilter(event.target.value)}
            value={licenseFilter}
          >
            <option value="all">All licenses</option>
            {licenses.map((license) => (
              <option key={license} value={license}>
                {license}
              </option>
            ))}
          </select>

          <select
            aria-label="Sort assets"
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            value={sortKey}
          >
            <option value="newest">Newest first</option>
            <option value="name">Name</option>
            <option value="source">Source</option>
            <option value="reuse">Most reused</option>
          </select>
        </section>

        {error ? <div className="asset-library-error">{error}</div> : null}
        {promotionMessage ? (
          <div className="asset-library-success">{promotionMessage}</div>
        ) : null}

        <div className="asset-library-layout">
          <section className="asset-library-results">
            <div className="asset-library-results-header">
              <span>
                {isLoading
                  ? "Loading assets…"
                  : `${visibleAssets.length} of ${assets.length} assets`}
              </span>
              <span>Click a card to preview it</span>
            </div>

            {visibleAssets.length > 0 ? (
              <div className="asset-library-grid">
                {visibleAssets.map((asset) => {
                  const selected = asset.asset_id === selectedAssetId;

                  return (
                    <button
                      className="asset-library-card"
                      data-selected={selected}
                      key={asset.asset_id}
                      onClick={() => setSelectedAssetId(asset.asset_id)}
                      type="button"
                    >
                      <div className="asset-library-card-image">
                        {asset.thumbnail_path ? (
                          <img
                            alt={`${asset.display_name} thumbnail`}
                            loading="lazy"
                            src={asset.thumbnail_path}
                          />
                        ) : (
                          <div className="asset-library-placeholder">
                            {asset.display_name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="asset-library-card-body">
                        <div className="asset-library-card-title-row">
                          <h2>{asset.display_name}</h2>
                          <span
                            className="asset-library-badge"
                            data-positive={asset.file_stats.exists}
                            data-warning={!asset.file_stats.exists}
                          >
                            {asset.file_stats.exists ? "file ready" : "missing"}
                          </span>
                        </div>

                        <p className="asset-library-card-id">
                          {asset.asset_id}
                        </p>

                        <div className="asset-library-badges">
                          <span className="asset-library-badge">
                            {sourceLabel(asset.source_type)}
                          </span>
                          <span className="asset-library-badge">
                            {asset.domain}
                          </span>
                          <span className="asset-library-badge">
                            {asset.asset_type}
                          </span>
                          <span className="asset-library-badge">
                            {asset.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : !isLoading ? (
              <div className="asset-library-empty">
                No assets match the current search and filters.
              </div>
            ) : null}
          </section>

          <aside className="asset-library-panel">
            <div className="asset-library-viewer">
              <AssetViewer asset={selectedAsset} />
            </div>

            <div className="asset-library-details">
              {selectedAsset ? (
                <>
                  <h2>{selectedAsset.display_name}</h2>
                  <p className="asset-library-details-id">
                    {selectedAsset.asset_id}
                  </p>

                  <div className="asset-library-detail-actions">
                    {selectedAsset.file_stats.exists ? (
                      <a
                        className="asset-library-link"
                        href={selectedAsset.public_path}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open GLB
                      </a>
                    ) : null}

                    {selectedAsset.thumbnail_path ? (
                      <a
                        className="asset-library-link"
                        href={selectedAsset.thumbnail_path}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open thumbnail
                      </a>
                    ) : null}

                    {selectedAsset.source_url ? (
                      <a
                        className="asset-library-link"
                        href={selectedAsset.source_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Source record
                      </a>
                    ) : null}

                    {selectedAsset.storage_provider === "r2" ? (
                      <span
                        className="asset-library-badge"
                        data-positive="true"
                      >
                        Stored in Cloudflare R2
                      </span>
                    ) : (
                      <button
                        className="asset-library-button"
                        data-primary="true"
                        disabled={
                          promotingAssetId === selectedAsset.asset_id ||
                          !selectedAsset.file_stats.exists ||
                          !selectedAsset.safe_to_promote_to_app ||
                          selectedAsset.license_kind !== "cc0"
                        }
                        onClick={() => {
                          void uploadSelectedAssetToCloudflare();
                        }}
                        type="button"
                      >
                        {promotingAssetId === selectedAsset.asset_id
                          ? "Uploading to Cloudflare…"
                          : "Upload reviewed asset to Cloudflare"}
                      </button>
                    )}
                  </div>

                  <div className="asset-library-promotion-note">
                    Review the rotating model before uploading it. The button
                    only activates for a local CC0 asset whose recorded review
                    permits production use, commercial use, and public GLB
                    redistribution. TRELLIS and Royalty Free assets remain
                    blocked.
                  </div>

                  <div className="asset-library-metadata">
                    <MetadataRow label="Source">
                      {sourceLabel(selectedAsset.source_type)}
                    </MetadataRow>
                    <MetadataRow label="Status">
                      {selectedAsset.status}
                    </MetadataRow>
                    <MetadataRow label="License">
                      {selectedAsset.license_kind} ·{" "}
                      {selectedAsset.license_status}
                    </MetadataRow>
                    <MetadataRow label="Storage">
                      {selectedAsset.storage_provider === "r2"
                        ? "Cloudflare R2"
                        : "Local review copy"}
                    </MetadataRow>
                    <MetadataRow label="License record">
                      <code>
                        {selectedAsset.license_record_path ??
                          "Not recorded"}
                      </code>
                    </MetadataRow>
                    <MetadataRow label="Dimensions">
                      {formatDimensions(selectedAsset.dimensions_m)} m
                    </MetadataRow>
                    <MetadataRow label="Polygons">
                      {selectedAsset.polygon_count?.toLocaleString() ?? "Unknown"}
                    </MetadataRow>
                    <MetadataRow label="File">
                      {selectedAsset.file_stats.exists
                        ? formatBytes(
                            selectedAsset.file_stats.file_size_bytes,
                          )
                        : "Missing"}
                    </MetadataRow>
                    <MetadataRow label="Rigged">
                      {selectedAsset.rigged ? "Yes" : "No"}
                    </MetadataRow>
                    <MetadataRow label="Animations">
                      {selectedAsset.animation_clips.length > 0
                        ? selectedAsset.animation_clips.join(", ")
                        : "None"}
                    </MetadataRow>
                    <MetadataRow label="Reuse count">
                      {selectedAsset.reuse_count}
                    </MetadataRow>
                    <MetadataRow label="Created">
                      {formatDate(selectedAsset.created_at)}
                    </MetadataRow>
                    <MetadataRow label="Public path">
                      <code>{selectedAsset.public_path}</code>
                    </MetadataRow>
                    <MetadataRow label="Project file">
                      <code>
                        {selectedAsset.file_stats.project_relative_path ??
                          selectedAsset.source_path ??
                          "Not available"}
                      </code>
                    </MetadataRow>
                    <MetadataRow label="Notes">
                      {selectedAsset.notes || "None"}
                    </MetadataRow>
                  </div>

                  <div className="asset-library-tags">
                    {Array.from(
                      new Set([
                        ...selectedAsset.aliases,
                        ...selectedAsset.semantic_tags,
                        ...selectedAsset.style_tags,
                      ]),
                    ).map((tag) => (
                      <span className="asset-library-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="asset-library-empty">
                  Select an asset to see its metadata.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default AssetLibraryLab;


