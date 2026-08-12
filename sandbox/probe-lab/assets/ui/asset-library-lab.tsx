"use client";

import { Bounds, Clone, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";
import * as THREE from "three";

import { AmbientCgLibraryLab } from "./ambientcg-library-lab";
import { Cc0BatchImportLab } from "./cc0-batch-import-lab";
import { CcByBatchImportLab } from "./cc-by-batch-import-lab";

type Vec3 = [number, number, number];

type AssetLibraryLabProps = {
  initialSection?: "models" | "resources";
};

type AssetFileStats = {
  exists: boolean;
  file_size_bytes: number | null;
  project_relative_path: string | null;
  storage_provider?: "local" | "r2_private_pending" | "r2";
  remote_url?: string | null;
};

type LibraryAsset = {
  asset_id: string;
  canonical_label: string;
  display_name: string;
  aliases: string[];
  semantic_tags: string[];
  asset_type: "glb" | "gltf" | "primitive";
  domain: string;
  requested_concept?: string | null;
  source_display_name?: string | null;
  verified_canonical_label?: string | null;
  verified_aliases?: string[];
  semantic_review_status:
    | "pending"
    | "verified"
    | "mismatch"
    | "rejected";
  semantic_reviewed_at?: string | null;
  semantic_review_notes?: string | null;
  object_composition:
    | "single_object"
    | "object_set"
    | "environment_piece"
    | "unknown";
  contains?: string[];
  affordances?: string[];
  support_surfaces?: Array<{
    id: string;
    label: string;
    center: Vec3;
    normal: Vec3;
    u_axis: Vec3;
    v_axis: Vec3;
    size: [number, number];
    area: number;
    confidence: number;
    source:
      | "blender_geometry"
      | "runtime_geometry"
      | "manual"
      | "legacy_ratio";
    height_ratio?: number;
    footprint_ratio?: [number, number];
    usable_size?: [number, number];
    exposure?: "exterior" | "interior" | "unknown";
    openness?: "open" | "enclosed" | "unknown";
    vertical_rank?: number;
    clearance_above_m?: number | null;
  }>;
  geometry_profile?: {
    schema_version: "myway_asset_geometry_profile_v1";
    generator: string;
    generated_at: string;
    content_hash?: string | null;
    primary_support_surface_id?: string | null;
    local_bounds: {
      min: Vec3;
      max: Vec3;
      size: Vec3;
      center: Vec3;
    };
    support_surfaces: Array<{
      id: string;
      label: string;
      size: [number, number];
      confidence: number;
      source: string;
      height_ratio?: number;
      coverage_ratio?: number;
      usable_size?: [number, number];
      exposure?: "exterior" | "interior" | "unknown";
      openness?: "open" | "enclosed" | "unknown";
      vertical_rank?: number;
      clearance_above_m?: number | null;
    }>;
    interior_volumes: Array<{
      id: string;
      label?: string;
      size: Vec3;
      confidence: number;
    }>;
    attachment_regions: Array<{
      id: string;
      label: string;
      size: [number, number];
      confidence: number;
      side: string;
    }>;
    audit?: {
      status: "measured" | "review_required";
      confidence: number;
      warnings: string[];
      mesh_object_count: number;
      included_mesh_count: number;
      excluded_mesh_names: string[];
      triangle_count: number;
      support_surface_count: number;
    };
  } | null;
  preferred_for_concepts?: string[];
  appearance_profile?: {
    schema_version: "myway_asset_appearance_profile_v1";
    status: "pending" | "rendering" | "analyzing" | "ready" | "failed";
    summary: string;
    style_descriptors: string[];
    design_era: string[];
    realism_level: string[];
    shape_language: string[];
    material_treatment: string[];
    color_palette: string[];
    surface_condition: string[];
    ornamentation: string[];
    visual_mood: string[];
    detail_level: string[];
    scene_compatibility: string[];
    descriptors: string[];
    materials: string[];
    colors: string[];
    geometry: string[];
    warnings: string[];
    confidence: number;
    analysis_views: Array<{
      name: "front_three_quarter" | "rear_three_quarter" | "side" | "elevated_front";
      public_path: string;
    }>;
    model: string | null;
    prompt_version: string;
    render_version: string;
    content_hash: string | null;
    analyzed_at: string | null;
    error: string | null;
  };
  appearance_embedding?: {
    schema_version: "myway_asset_appearance_embedding_v1";
    status: "pending" | "ready" | "failed";
    model: string;
    dimensions: number | null;
    vector_key: string | null;
    source_text_hash: string | null;
    embedded_at: string | null;
    error: string | null;
  };
  source_type: "blenderkit" | "trellis" | "manual" | "procedural";
  source_asset_id?: string | null;
  source_prompt?: string | null;
  source_url?: string | null;
  source_path?: string | null;
  attribution?: {
    schema_version: "myway_asset_attribution_v1";
    required: boolean;
    text: string | null;
    asset_title: string | null;
    creator_name: string | null;
    source_provider: string | null;
    source_asset_id: string | null;
    source_url: string | null;
    license_name: string;
    license_version: string | null;
    license_url: string | null;
    modification_notice: string | null;
    downloaded_at: string | null;
  } | null;
  public_path: string;
  thumbnail_path?: string | null;
  license_record_path?: string | null;
  storage_provider?: "local" | "r2_private_pending" | "r2";
  storage_object_key?: string | null;
  storage_etag?: string | null;
  file_size_bytes?: number | null;
  thumbnail_storage_provider?: "local" | "r2_private_pending" | "r2" | null;
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
  license_kind: "cc0" | "cc_by" | "cc_by_4_0" | "royalty_free" | "self_owned" | "unknown";
  license_status: "recorded" | "needs_review" | "sandbox_only" | "app_ready";
  commercial_use_allowed: boolean;
  raw_redistribution_allowed: boolean;
  safe_to_use_in_sandbox: boolean;
  safe_to_promote_to_app: boolean;
  status: "inbox" | "normalized" | "approved" | "rejected";
  scene_review_status: "pending" | "approved" | "rejected";
  scene_reviewed_at?: string | null;
  scene_review_notes?: string | null;
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
  renamed_from?: string;
  canonical_label_updated_from?: string;
  aliases_updated_from?: string[];
  updated_reference_files?: string[];
  moved_identity_files?: string[];
  embedding_refresh_queued?: boolean;
  warnings?: string[];
  error?: string;
};


type AcquisitionStatus =
  | "missing"
  | "searching_blenderkit"
  | "generating_trellis"
  | "awaiting_review"
  | "approved"
  | "unavailable";

type AcquisitionJob = {
  job_id: string;
  concept_key: string;
  concept: string;
  status: AcquisitionStatus;
  active_provider:
    | "blenderkit"
    | "trellis"
    | null;
  current_candidate_asset_id:
    | string
    | null;
  linked_scene_count: number;
  refresh_ready: boolean;
  request_count: number;
  attempt_count: number;
  last_error: string | null;
  updated_at: string;
  scene_references: Array<{
    scene_session_id: string;
    scene_id?: string | null;
    title?: string | null;
    original_prompt?: string | null;
  }>;
  candidate_history: Array<{
    asset_id: string;
    source_type:
      | "blenderkit"
      | "trellis"
      | "manual"
      | "procedural";
    status:
      | "awaiting_review"
      | "approved"
      | "rejected"
      | "superseded";
  }>;
};

type AcquisitionResponse = {
  ok: boolean;
  jobs?: AcquisitionJob[];
  job?: AcquisitionJob;
  asset?: LibraryAsset;
  published?: boolean;
  removed_asset_id?: string;
  removed_job_id?: string;
  removed_local_files?: string[];
  removed_remote_objects?: string[];
  error?: string;
};

function isPolyPizzaPublicSceneCandidate(
  asset: LibraryAsset,
) {
  return (
    asset.source_type === "manual" &&
    asset.attribution
      ?.source_provider
      ?.trim()
      .toLowerCase() === "poly pizza" &&
    (asset.license_kind === "cc0" ||
      asset.license_kind === "cc_by" ||
      asset.license_kind === "cc_by_4_0")
  );
}

function isManualCc0PublicSceneCandidate(
  asset: LibraryAsset,
) {
  return (
    asset.source_type === "manual" &&
    asset.license_kind === "cc0" &&
    asset.commercial_use_allowed &&
    asset.raw_redistribution_allowed
  );
}

function isManualPublicSceneCandidate(
  asset: LibraryAsset,
) {
  return (
    isPolyPizzaPublicSceneCandidate(asset) ||
    isManualCc0PublicSceneCandidate(asset)
  );
}


type EnrichmentQueueEntry = {
  asset_id: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed";
  mode?: "full" | "embedding_only";
  force: boolean;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
};

type EnrichmentResponse = {
  ok: boolean;
  queue?: EnrichmentQueueEntry[];
  entries?: EnrichmentQueueEntry[];
  queued_count?: number;
  skipped_count?: number;
  error?: string;
};

type GeometryQueueEntry = {
  asset_id: string;
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  force: boolean;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  support_surface_count: number | null;
  audit_status: "measured" | "review_required" | null;
  audit_confidence: number | null;
  warnings: string[];
  error: string | null;
};

type GeometryResponse = {
  ok: boolean;
  queue?: GeometryQueueEntry[];
  entries?: GeometryQueueEntry[];
  queued_count?: number;
  skipped_count?: number;
  error?: string;
};

type BlenderKitCandidate = {
  source_asset_id: string;
  source_internal_id: string | null;
  display_name: string;
  description: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  author_name: string | null;
  license_kind: "cc0";
  verification_status: string | null;
  is_free: boolean | null;
  rating_quality: number | null;
  polygon_count: number | null;
  file_size_bytes: number | null;
  available_resolutions: string[];
  tags: string[];
  match_score: number;
  semantic_match: boolean;
  already_imported: boolean;
};

type DirectBlendKitSearchResponse = {
  ok: boolean;
  query?: string;
  candidates?: BlenderKitCandidate[];
  total_cc0_downloadable?: number;
  semantic_match_count?: number;
  broadened_results?: boolean;
  message?: string;
  error?: string;
};

type DirectBlendKitImportResponse = {
  ok: boolean;
  created?: boolean;
  asset?: LibraryAsset;
  enrichment_entry?: EnrichmentQueueEntry;
  selected_source_asset_id?: string | null;
  message?: string;
  error?: string;
};

type DirectTrellisCreateResponse = {
  ok: boolean;
  created?: boolean;
  asset?: LibraryAsset;
  enrichment_entry?: EnrichmentQueueEntry;
  normalization_extent_m?: number;
  generated_prompt?: string | null;
  message?: string;
  error?: string;
  debug_path?: string;
};

type DirectGlmProceduralResponse = {
  ok: boolean;
  created?: boolean;
  asset?: LibraryAsset;
  enrichment_entry?: EnrichmentQueueEntry | null;
  plan?: { suitability: "strong" | "moderate" | "weak"; suitability_reason: string; parts: unknown[] };
  model?: string;
  message?: string;
  error?: string;
  debug_path?: string;
};

type ManualAcquisitionMode =
  | "blenderkit"
  | "trellis"
  | "glm"
  | "cc0"
  | "cc_by";

type ReviewView =
  | "all"
  | "needs_review"
  | "approved"
  | "rejected"
  | "acquiring";

type SortKey = "newest" | "name" | "source" | "reuse";

type IdentityDraft = {
  assetId: string;
  canonicalLabel: string;
  aliases: string;
  composition: LibraryAsset["object_composition"];
  contains: string;
  affordances: string;
  preferredConcepts: string;
  notes: string;
};

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

function readableLabel(value: string) {
  const normalized = value.replaceAll("_", " ").replace(/\s+/g, " ").trim();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Unnamed asset";
}

function assetTitle(asset: LibraryAsset) {
  return readableLabel(
    asset.verified_canonical_label ||
      asset.requested_concept ||
      asset.source_display_name ||
      asset.display_name ||
      asset.asset_id,
  );
}

function csvValues(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
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
        gl={{
          antialias: true,
          alpha: false,
        }}
        shadows
      >
        <color attach="background" args={["#07111f"]} />
        <ambientLight intensity={0.75} />
        <hemisphereLight
          args={["#f8fafc", "#172554", 1.15]}
          position={[0, 4, 0]}
        />
        <directionalLight
          castShadow
          intensity={2.2}
          position={[4, 6, 5]}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight intensity={0.85} position={[-4, 2, -3]} />

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


type AssetLibrarySnapshot = {
  assets: LibraryAsset[];
  jobs: AcquisitionJob[];
  enrichmentQueue: EnrichmentQueueEntry[];
  geometryQueue: GeometryQueueEntry[];
};

let assetLibrarySnapshotPromise:
  Promise<AssetLibrarySnapshot> | null =
  null;

function fetchAssetLibrarySnapshot() {
  if (assetLibrarySnapshotPromise) {
    return assetLibrarySnapshotPromise;
  }

  assetLibrarySnapshotPromise =
    Promise.all([
      fetch(
        "/api/sandbox/probe-lab/assets/library",
        { cache: "no-store" },
      ),
      fetch(
        "/api/sandbox/probe-lab/assets/acquisition?summary=1",
        { cache: "no-store" },
      ),
      fetch(
        "/api/sandbox/probe-lab/assets/enrichment",
        { cache: "no-store" },
      ),
      fetch(
        "/api/sandbox/probe-lab/assets/geometry",
        { cache: "no-store" },
      ),
    ])
      .then(
        async ([
          libraryResponse,
          acquisitionResponse,
          enrichmentResponse,
          geometryResponse,
        ]) => {
          const libraryPayload =
            (await libraryResponse.json()) as LibraryResponse;
          const acquisitionPayload =
            (await acquisitionResponse.json()) as AcquisitionResponse;
          const enrichmentPayload =
            (await enrichmentResponse.json()) as EnrichmentResponse;
          const geometryPayload =
            (await geometryResponse.json()) as GeometryResponse;

          if (
            !libraryResponse.ok ||
            !libraryPayload.ok ||
            !Array.isArray(
              libraryPayload.assets,
            )
          ) {
            throw new Error(
              libraryPayload.error ||
                "The asset library could not be loaded.",
            );
          }

          if (
            !acquisitionResponse.ok ||
            !acquisitionPayload.ok
          ) {
            throw new Error(
              acquisitionPayload.error ||
                "The missing-asset queue could not be loaded.",
            );
          }

          if (
            !enrichmentResponse.ok ||
            !enrichmentPayload.ok
          ) {
            throw new Error(
              enrichmentPayload.error ||
                "The appearance-analysis queue could not be loaded.",
            );
          }

          if (!geometryResponse.ok || !geometryPayload.ok) {
            throw new Error(
              geometryPayload.error ||
                "The geometry-profile queue could not be loaded.",
            );
          }

          return {
            assets:
              libraryPayload.assets,
            jobs:
              acquisitionPayload.jobs ??
              [],
            enrichmentQueue:
              enrichmentPayload.queue ??
              [],
            geometryQueue:
              geometryPayload.queue ??
              [],
          };
        },
      )
      .finally(() => {
        assetLibrarySnapshotPromise =
          null;
      });

  return assetLibrarySnapshotPromise;
}

function acquisitionStatusSignature(
  jobs: AcquisitionJob[],
) {
  return jobs
    .map(
      (job) =>
        [
          job.job_id,
          job.status,
          job.current_candidate_asset_id ??
            "",
          job.updated_at,
        ].join(":"),
    )
    .sort()
    .join("|");
}

function enrichmentTerminalSignature(
  entries: EnrichmentQueueEntry[],
) {
  return entries
    .filter(
      (entry) =>
        entry.status === "completed" ||
        entry.status === "failed",
    )
    .map(
      (entry) =>
        [
          entry.asset_id,
          entry.status,
          entry.completed_at ?? "",
        ].join(":"),
    )
    .sort()
    .join("|");
}

function geometryTerminalSignature(
  entries: GeometryQueueEntry[],
) {
  return entries
    .filter(
      (entry) =>
        entry.status === "completed" ||
        entry.status === "failed" ||
        entry.status === "skipped",
    )
    .map((entry) =>
      [
        entry.asset_id,
        entry.status,
        entry.completed_at ?? "",
        entry.audit_status ?? "",
      ].join(":"),
    )
    .sort()
    .join("|");
}


export function AssetLibraryLab({
  initialSection = "models",
}: AssetLibraryLabProps = {}) {
  const [librarySection, setLibrarySection] = useState<
    "models" | "resources"
  >(initialSection);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sceneReviewFilter, setSceneReviewFilter] = useState("all");
  const [reviewView, setReviewView] =
    useState<ReviewView>("needs_review");
  const [acquisitionJobs, setAcquisitionJobs] =
    useState<AcquisitionJob[]>([]);
  const [enrichmentQueue, setEnrichmentQueue] =
    useState<EnrichmentQueueEntry[]>([]);
  const [geometryQueue, setGeometryQueue] =
    useState<GeometryQueueEntry[]>([]);
  const [manualAcquisitionMode, setManualAcquisitionMode] =
    useState<ManualAcquisitionMode>("blenderkit");
  const [blendKitConcept, setBlendKitConcept] =
    useState("");
  const [blendKitSearching, setBlendKitSearching] =
    useState(false);
  const [blendKitImporting, setBlendKitImporting] =
    useState(false);
  const [blendKitCandidates, setBlendKitCandidates] =
    useState<BlenderKitCandidate[]>([]);
  const [blendKitSelectedSourceAssetId, setBlendKitSelectedSourceAssetId] =
    useState<string | null>(null);
  const [blendKitLastSearchQuery, setBlendKitLastSearchQuery] =
    useState("");
  const [trellisConcept, setTrellisConcept] = useState("");
  const [trellisDetails, setTrellisDetails] = useState("");
  const [trellisSemanticTags, setTrellisSemanticTags] = useState("");
  const [trellisDomain, setTrellisDomain] =
    useState("asset_library_manual_trellis");
  const [trellisTargetExtentM, setTrellisTargetExtentM] =
    useState("2");
  const [trellisSeed, setTrellisSeed] = useState("0");
  const [trellisMaxAttempts, setTrellisMaxAttempts] =
    useState("3");
  const [trellisNoTexture, setTrellisNoTexture] =
    useState(false);
  const [trellisCreating, setTrellisCreating] =
    useState(false);
  const [glmConcept, setGlmConcept] = useState("");
  const [glmDetails, setGlmDetails] = useState("");
  const [glmStyle, setGlmStyle] = useState("clean stylized");
  const [glmTargetExtentM, setGlmTargetExtentM] = useState("2");
  const [glmCreating, setGlmCreating] = useState(false);
  const [cc0Importing, setCc0Importing] = useState(false);
  const [ccByImporting, setCcByImporting] = useState(false);
  const [licenseFilter, setLicenseFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [refreshToken, setRefreshToken] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [acquisitionAction, setAcquisitionAction] = useState<
    "approve" | "remove" | "blenderkit" | "trellis" | null
  >(null);
  const [acquisitionActionId, setAcquisitionActionId] =
    useState<string | null>(null);
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);
  const [maintenanceAction, setMaintenanceAction] = useState<
    | "remove"
    | "rename"
    | "canonical_label"
    | "aliases"
    | "provenance"
    | "blenderkit"
    | "trellis"
    | null
  >(null);
  const [maintenanceAssetId, setMaintenanceAssetId] = useState<string | null>(
    null,
  );
  const [semanticReviewAssetId, setSemanticReviewAssetId] = useState<
    string | null
  >(null);
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft | null>(null);
  const [enrichmentAssetId, setEnrichmentAssetId] = useState<string | null>(null);
  const [geometryAssetId, setGeometryAssetId] =
    useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const acquisitionPollInFlight =
    useRef(false);
  const enrichmentPollInFlight =
    useRef(false);
  const geometryPollInFlight =
    useRef(false);
  const completedEnrichmentSignature =
    useRef("");
  const completedGeometrySignature =
    useRef("");

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setError(null);

    void fetchAssetLibrarySnapshot()
      .then((snapshot) => {
        if (!active) return;

        setAssets(snapshot.assets);
        setAcquisitionJobs(
          snapshot.jobs,
        );
        setEnrichmentQueue(
          snapshot.enrichmentQueue,
        );
        setGeometryQueue(
          snapshot.geometryQueue,
        );
        completedEnrichmentSignature.current =
          enrichmentTerminalSignature(
            snapshot.enrichmentQueue,
          );
        completedGeometrySignature.current =
          geometryTerminalSignature(
            snapshot.geometryQueue,
          );
        setSelectedAssetId((current) => {
          if (
            current &&
            snapshot.assets.some(
              (asset) =>
                asset.asset_id ===
                current,
            )
          ) {
            return current;
          }

          const previewable =
            snapshot.assets
              .filter(
                (asset) =>
                  asset.file_stats.exists &&
                  (asset.asset_type ===
                    "glb" ||
                    asset.asset_type ===
                      "gltf"),
              )
              .sort(
                (a, b) =>
                  Date.parse(
                    b.created_at,
                  ) -
                  Date.parse(
                    a.created_at,
                  ),
              );
          const newestPreviewable =
            previewable.find(
              (asset) =>
                asset.scene_review_status ===
                "pending",
            ) ?? previewable[0];

          return (
            newestPreviewable
              ?.asset_id ??
            snapshot.assets[0]
              ?.asset_id ??
            null
          );
        });
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : String(caught),
        );
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshToken]);

  const hasActiveAcquisition =
    acquisitionJobs.some(
      (job) =>
        job.status ===
          "searching_blenderkit" ||
        job.status ===
          "generating_trellis",
    );

  useEffect(() => {
    if (!hasActiveAcquisition) return;

    let disposed = false;
    let lastSignature =
      acquisitionStatusSignature(
        acquisitionJobs,
      );

    async function poll() {
      if (
        disposed ||
        document.visibilityState !==
          "visible" ||
        acquisitionPollInFlight.current
      ) {
        return;
      }

      acquisitionPollInFlight.current =
        true;
      try {
        const response = await fetch(
          "/api/sandbox/probe-lab/assets/acquisition?summary=1",
          { cache: "no-store" },
        );
        const payload =
          (await response.json()) as AcquisitionResponse;

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ||
              "The acquisition queue could not be refreshed.",
          );
        }

        const nextJobs =
          payload.jobs ?? [];
        const nextSignature =
          acquisitionStatusSignature(
            nextJobs,
          );

        setAcquisitionJobs(
          nextJobs,
        );

        if (
          nextSignature !==
          lastSignature
        ) {
          const shouldReloadAssets =
            nextJobs.some(
              (job) =>
                job.status ===
                  "awaiting_review" ||
                job.status ===
                  "approved",
            );
          lastSignature =
            nextSignature;

          if (
            shouldReloadAssets &&
            !disposed
          ) {
            setRefreshToken(
              (value) =>
                value + 1,
            );
          }
        }
      } catch (caught) {
        if (!disposed) {
          setError(
            caught instanceof Error
              ? caught.message
              : String(caught),
          );
        }
      } finally {
        acquisitionPollInFlight.current =
          false;
      }
    }

    const interval =
      window.setInterval(
        () => {
          void poll();
        },
        8_000,
      );
    const onVisibility = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void poll();
      }
    };
    document.addEventListener(
      "visibilitychange",
      onVisibility,
    );

    return () => {
      disposed = true;
      window.clearInterval(
        interval,
      );
      document.removeEventListener(
        "visibilitychange",
        onVisibility,
      );
    };
  }, [hasActiveAcquisition]);

  const hasActiveEnrichment =
    enrichmentQueue.some(
      (entry) =>
        entry.status === "queued" ||
        entry.status === "running",
    );

  useEffect(() => {
    if (!hasActiveEnrichment) return;

    let disposed = false;

    async function poll() {
      if (
        disposed ||
        document.visibilityState !==
          "visible" ||
        enrichmentPollInFlight.current
      ) {
        return;
      }

      enrichmentPollInFlight.current =
        true;
      try {
        const response = await fetch(
          "/api/sandbox/probe-lab/assets/enrichment",
          { cache: "no-store" },
        );
        const payload =
          (await response.json()) as EnrichmentResponse;

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ||
              "The appearance-analysis queue could not be refreshed.",
          );
        }

        const nextQueue =
          payload.queue ?? [];
        const terminalSignature =
          enrichmentTerminalSignature(
            nextQueue,
          );
        setEnrichmentQueue(
          nextQueue,
        );

        if (
          terminalSignature !==
          completedEnrichmentSignature.current
        ) {
          completedEnrichmentSignature.current =
            terminalSignature;
          if (!disposed) {
            setRefreshToken(
              (value) =>
                value + 1,
            );
          }
        }
      } catch (caught) {
        if (!disposed) {
          setError(
            caught instanceof Error
              ? caught.message
              : String(caught),
          );
        }
      } finally {
        enrichmentPollInFlight.current =
          false;
      }
    }

    const interval =
      window.setInterval(
        () => {
          void poll();
        },
        8_000,
      );
    const onVisibility = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void poll();
      }
    };
    document.addEventListener(
      "visibilitychange",
      onVisibility,
    );

    return () => {
      disposed = true;
      window.clearInterval(
        interval,
      );
      document.removeEventListener(
        "visibilitychange",
        onVisibility,
      );
    };
  }, [hasActiveEnrichment]);

  const hasActiveGeometry =
    geometryQueue.some(
      (entry) =>
        entry.status === "queued" ||
        entry.status === "running",
    );

  useEffect(() => {
    if (!hasActiveGeometry) return;

    let disposed = false;

    async function poll() {
      if (
        disposed ||
        document.visibilityState !== "visible" ||
        geometryPollInFlight.current
      ) {
        return;
      }

      geometryPollInFlight.current = true;
      try {
        const response = await fetch(
          "/api/sandbox/probe-lab/assets/geometry",
          { cache: "no-store" },
        );
        const payload =
          (await response.json()) as GeometryResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ||
              "The geometry queue could not be refreshed.",
          );
        }

        const nextQueue = payload.queue ?? [];
        const terminalSignature =
          geometryTerminalSignature(nextQueue);
        setGeometryQueue(nextQueue);

        if (
          terminalSignature !==
          completedGeometrySignature.current
        ) {
          completedGeometrySignature.current =
            terminalSignature;
          if (!disposed) {
            setRefreshToken((value) => value + 1);
          }
        }
      } catch (caught) {
        if (!disposed) {
          setError(
            caught instanceof Error
              ? caught.message
              : String(caught),
          );
        }
      } finally {
        geometryPollInFlight.current = false;
      }
    }

    const interval = window.setInterval(
      () => void poll(),
      8_000,
    );
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };
    document.addEventListener(
      "visibilitychange",
      onVisibility,
    );

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener(
        "visibilitychange",
        onVisibility,
      );
    };
  }, [hasActiveGeometry]);


  async function runAcquisitionAction(input: {
    action:
      | "approve_publish"
      | "reject_remove"
      | "retry_blenderkit"
      | "generate_trellis"
      | "cancel_job";
    assetId?: string;
    jobId?: string;
    note?: string | null;
    confirmManualLicenseReview?: boolean;
  }) {
    const actionId =
      input.assetId ??
      input.jobId ??
      input.action;
    setAcquisitionAction(
      input.action === "approve_publish"
        ? "approve"
        : input.action === "reject_remove" ||
            input.action === "cancel_job"
          ? "remove"
          : input.action === "generate_trellis"
            ? "trellis"
            : "blenderkit",
    );
    setAcquisitionActionId(actionId);
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/acquisition",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: input.action,
            asset_id:
              input.assetId ?? null,
            job_id:
              input.jobId ?? null,
            note: input.note ?? null,
            confirm_manual_license_review:
              input.confirmManualLicenseReview ===
              true,
          }),
        },
      );
      const payload =
        (await response.json()) as AcquisitionResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ||
            "The acquisition action failed.",
        );
      }

      if (
        input.action ===
        "approve_publish"
      ) {
        setPromotionMessage(
          payload.published
            ? "The asset is approved, published to Cloudflare R2, and ready for linked scenes."
            : "The asset is approved for local sandbox scenes. Public promotion remains blocked by its license record.",
        );
      } else if (
        input.action ===
        "reject_remove"
      ) {
        setSelectedAssetId(null);
        setPromotionMessage(
          "The candidate was rejected and permanently removed. Its missing-asset job remains in Acquiring so you can choose another BlendKit or TRELLIS attempt when ready.",
        );
      } else if (
        input.action === "cancel_job"
      ) {
        setPromotionMessage(
          "The acquisition need was cancelled and removed from Acquiring. Linked scenes remain unchanged and will show that object as unavailable until rebuilt without it.",
        );
      } else {
        setPromotionMessage(
          input.action ===
            "generate_trellis"
            ? "The current candidate was rejected. TRELLIS generation has started for the same missing concept."
            : "The current candidate was rejected. MyWay is searching BlendKit for a different CC0 asset.",
        );
      }

      setRefreshToken(
        (value) => value + 1,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setAcquisitionAction(null);
      setAcquisitionActionId(null);
    }
  }

  async function approveSelectedAsset() {
    if (!selectedAssetId) return;

    const asset = assets.find(
      (candidate) =>
        candidate.asset_id ===
        selectedAssetId,
    );
    if (!asset) return;

    const polyPizzaPublicSceneApproval =
      asset.storage_provider !== "r2" &&
      !asset.safe_to_promote_to_app &&
      isPolyPizzaPublicSceneCandidate(
        asset,
      );
    const manualCc0PublicSceneApproval =
      asset.storage_provider !== "r2" &&
      !asset.safe_to_promote_to_app &&
      !isPolyPizzaPublicSceneCandidate(
        asset,
      ) &&
      isManualCc0PublicSceneCandidate(
        asset,
      );
    const requiresManualLicenseReview =
      polyPizzaPublicSceneApproval ||
      manualCc0PublicSceneApproval;

    const actionLabel =
      asset.storage_provider === "r2"
        ? "Approve this asset for automatic scene use?"
        : polyPizzaPublicSceneApproval
          ? "Approve this Poly Pizza asset for scene use and publish its GLB and thumbnail to Cloudflare R2?"
          : manualCc0PublicSceneApproval
            ? "Approve this CC0 asset for scene use and publish its GLB and thumbnail to Cloudflare R2?"
            : asset.safe_to_promote_to_app
              ? "Approve this asset and publish its GLB and thumbnail to Cloudflare R2?"
              : asset.storage_provider === "r2_private_pending"
                ? "This private review candidate is not yet cleared for runtime publication. Update its licence/provenance before approval."
                : "Approve this asset for local sandbox scene use? It is not currently cleared for public R2 promotion.";

    const confirmationDetails =
      polyPizzaPublicSceneApproval
        ? [
            "Continue only after verifying the stored Poly Pizza model page and creator.",
            "Confirm that the recorded CC0 or CC BY licence permits commercial use and redistribution.",
            "For CC BY, confirm that the generated creator credit is complete.",
            "Confirm that the model is generic or otherwise authorized and has no known third-party restrictions.",
          ].join("\n")
        : manualCc0PublicSceneApproval
          ? [
              "Continue only after verifying the recorded source and CC0 licence.",
              "Confirm that CC0 permits commercial use and redistribution for this asset.",
              "Confirm that the model is generic or otherwise authorized and has no known third-party restrictions.",
            ].join("\n")
          : "Review the rotating 3D model and verified identity before continuing.";

    if (
      !window.confirm(
        `${actionLabel}\n\n${confirmationDetails}`,
      )
    ) {
      return;
    }

    await runAcquisitionAction({
      action: "approve_publish",
      assetId: asset.asset_id,
      confirmManualLicenseReview:
        requiresManualLicenseReview,
    });
  }

  async function retrySelectedCandidate(
    provider:
      | "blenderkit"
      | "trellis",
  ) {
    if (!selectedAssetId) return;

    const asset = assets.find(
      (candidate) =>
        candidate.asset_id ===
        selectedAssetId,
    );
    if (!asset) return;

    const note = window.prompt(
      provider === "blenderkit"
        ? "Why should MyWay reject this candidate and search BlendKit for another one?"
        : "Why should MyWay reject this candidate and generate a TRELLIS replacement?",
      asset.scene_review_notes ?? "",
    );

    if (note === null) return;

    await runAcquisitionAction({
      action:
        provider === "trellis"
          ? "generate_trellis"
          : "retry_blenderkit",
      assetId: asset.asset_id,
      note,
    });
  }

  async function removeSelectedNeedsReviewCandidate() {
    if (!selectedAssetId) return;

    const asset = assets.find(
      (candidate) =>
        candidate.asset_id ===
        selectedAssetId,
    );
    if (!asset) return;

    const linkedJob =
      acquisitionJobByAssetId.get(
        asset.asset_id,
      );
    if (!linkedJob) {
      setError(
        "This candidate is no longer linked to a missing-asset job. Refresh the Asset Library and try again.",
      );
      return;
    }

    const note = window.prompt(
      `Why should MyWay reject and remove this candidate for "${linkedJob.concept}"?`,
      asset.scene_review_notes ??
        "I do not want to keep this candidate.",
    );

    if (note === null) return;

    const remoteWarning =
      asset.storage_provider === "r2"
        ? "\n\nThis candidate is published in Cloudflare R2. Its runtime GLB, thumbnail, and archived source object will also be deleted."
        : asset.storage_provider === "r2_private_pending"
          ? "\n\nThis candidate is stored privately in Cloudflare R2. Its private review GLB and thumbnail, plus any archived source object, will also be deleted."
          : "";

    const confirmed = window.confirm(
      `Reject and permanently remove "${assetTitle(asset)}"?${remoteWarning}\n\nIts registry record, local model files, thumbnail, source and license records, appearance renders, and local embedding will be removed. The linked missing-asset job will remain available under Acquiring, but MyWay will not automatically fetch another candidate.`,
    );

    if (!confirmed) return;

    await runAcquisitionAction({
      action: "reject_remove",
      assetId: asset.asset_id,
      note,
    });
  }

  async function retryAcquisitionJob(
    job: AcquisitionJob,
    provider:
      | "blenderkit"
      | "trellis",
  ) {
    await runAcquisitionAction({
      action:
        provider === "trellis"
          ? "generate_trellis"
          : "retry_blenderkit",
      jobId: job.job_id,
    });
  }

  async function cancelAcquisitionJob(
    job: AcquisitionJob,
  ) {
    const activeWarning =
      job.status === "searching_blenderkit" ||
      job.status === "generating_trellis"
        ? "\n\nA provider request is already running. MyWay cannot always stop that external process immediately, but any new candidate returned after cancellation will be discarded and removed."
        : "";

    const confirmed = window.confirm(
      `Cancel acquisition for "${job.concept}"?${activeWarning}\n\nThis removes the shared need from Acquiring. It does not delete the linked Primitive Builder scenes; those scenes will continue to show this object as unavailable until rebuilt without it.`,
    );

    if (!confirmed) return;

    await runAcquisitionAction({
      action: "cancel_job",
      jobId: job.job_id,
    });
  }

  async function renameSelectedAssetId() {
    if (
      !selectedAssetId ||
      !identityDraft
    ) {
      return;
    }

    const asset = assets.find(
      (candidate) =>
        candidate.asset_id ===
        selectedAssetId,
    );

    if (!asset) return;

    const nextAssetId =
      identityDraft.assetId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 96);

    if (!nextAssetId) {
      setError(
        "The asset ID must contain at least one letter or number.",
      );
      return;
    }

    if (
      nextAssetId === asset.asset_id
    ) {
      setPromotionMessage(
        "The asset ID is already unchanged.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Rename asset ID "${asset.asset_id}" to "${nextAssetId}"?\n\nMyWay will update the registry, local embedding metadata, acquisition references, and saved scene references. Existing GLB, thumbnail, analysis-image, and R2 storage paths will remain unchanged because storage location is separate from asset identity.`,
    );

    if (!confirmed) return;

    setMaintenanceAction("rename");
    setMaintenanceAssetId(
      asset.asset_id,
    );
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/library",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "rename_asset_id",
            asset_id: asset.asset_id,
            next_asset_id: nextAssetId,
          }),
        },
      );

      const payload =
        (await response.json()) as
          LibraryResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.asset
      ) {
        throw new Error(
          payload.error ||
            "The asset ID could not be renamed.",
        );
      }

      setSelectedAssetId(
        payload.asset.asset_id,
      );
      setIdentityDraft((current) =>
        current
          ? {
              ...current,
              assetId:
                payload.asset!
                  .asset_id,
            }
          : current,
      );
      setPromotionMessage(
        `Asset ID renamed from ${asset.asset_id} to ${payload.asset.asset_id}. Embedding filename, metadata, and saved references were synchronized; model and thumbnail storage paths were preserved.`,
      );
      setRefreshToken(
        (value) => value + 1,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setMaintenanceAction(null);
      setMaintenanceAssetId(null);
    }
  }

  async function updateSelectedCanonicalLabel() {
    if (
      !selectedAssetId ||
      !identityDraft
    ) {
      return;
    }

    const asset = assets.find(
      (candidate) =>
        candidate.asset_id ===
        selectedAssetId,
    );

    if (!asset) return;

    const canonicalLabel =
      identityDraft.canonicalLabel
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    if (!canonicalLabel) {
      setError(
        "A canonical label is required.",
      );
      return;
    }

    const currentCanonicalLabel = (
      asset.verified_canonical_label ||
      asset.canonical_label
    )
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    if (
      canonicalLabel ===
      currentCanonicalLabel
    ) {
      setPromotionMessage(
        "The canonical label is already unchanged.",
      );
      return;
    }

    setMaintenanceAction(
      "canonical_label",
    );
    setMaintenanceAssetId(
      asset.asset_id,
    );
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/library",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action:
              "update_canonical_label",
            asset_id:
              asset.asset_id,
            canonical_label:
              canonicalLabel,
          }),
        },
      );

      const payload =
        (await response.json()) as
          LibraryResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.asset
      ) {
        throw new Error(
          payload.error ||
            "The canonical label could not be updated.",
        );
      }

      setIdentityDraft((current) =>
        current
          ? {
              ...current,
              canonicalLabel:
                payload.asset!
                  .verified_canonical_label ||
                canonicalLabel,
            }
          : current,
      );
      setPromotionMessage(
        `Canonical label updated from ${payload.canonical_label_updated_from ?? currentCanonicalLabel} to ${payload.asset.verified_canonical_label ?? canonicalLabel}. The source name and technical asset ID were preserved.${payload.embedding_refresh_queued ? " A refreshed identity-aware embedding was queued automatically." : ""}`,
      );
      setRefreshToken(
        (value) => value + 1,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setMaintenanceAction(null);
      setMaintenanceAssetId(null);
    }
  }

  async function updateSelectedAliases() {
    if (
      !selectedAssetId ||
      !identityDraft
    ) {
      return;
    }

    const asset = assets.find(
      (candidate) =>
        candidate.asset_id ===
        selectedAssetId,
    );
    if (!asset) return;

    const aliases = csvValues(
      identityDraft.aliases,
    );
    const currentAliases = Array.from(
      new Set([
        ...(asset.verified_aliases ?? []),
        ...asset.aliases,
      ]),
    )
      .map((value) =>
        value
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " "),
      )
      .filter(Boolean)
      .sort();
    const nextAliases = aliases
      .map((value) =>
        value
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " "),
      )
      .filter(Boolean)
      .sort();

    if (
      JSON.stringify(currentAliases) ===
      JSON.stringify(nextAliases)
    ) {
      setPromotionMessage(
        "The aliases are already unchanged.",
      );
      return;
    }

    setMaintenanceAction("aliases");
    setMaintenanceAssetId(
      asset.asset_id,
    );
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/library",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "update_aliases",
            asset_id:
              asset.asset_id,
            aliases,
          }),
        },
      );
      const payload =
        (await response.json()) as
          LibraryResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.asset
      ) {
        throw new Error(
          payload.error ||
            "The aliases could not be updated.",
        );
      }

      const savedAliases =
        payload.asset
          .verified_aliases ?? [];
      setIdentityDraft((current) =>
        current
          ? {
              ...current,
              aliases:
                savedAliases.join(
                  ", ",
                ),
            }
          : current,
      );
      setPromotionMessage(
        savedAliases.length
          ? `Aliases updated: ${savedAliases.join(", ")}.`
          : "All verified aliases were removed.",
      );
      setRefreshToken(
        (value) => value + 1,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setMaintenanceAction(null);
      setMaintenanceAssetId(null);
    }
  }

  async function saveSelectedSemanticIdentity(
    semanticReviewStatus: "pending" | "verified" | "mismatch",
    options: { useSourceName?: boolean } = {},
  ) {
    if (!selectedAssetId || !identityDraft) return;

    const asset = assets.find(
      (candidate) => candidate.asset_id === selectedAssetId,
    );
    if (!asset) return;

    const verifiedCanonicalLabel =
      semanticReviewStatus === "verified"
        ? (options.useSourceName
            ? asset.source_display_name || asset.display_name
            : identityDraft.canonicalLabel
          ).trim()
        : "";

    if (semanticReviewStatus === "verified" && !verifiedCanonicalLabel) {
      setError("A verified canonical label is required.");
      return;
    }

    setSemanticReviewAssetId(asset.asset_id);
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/library",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "semantic_identity",
            asset_id: asset.asset_id,
            semantic_review_status: semanticReviewStatus,
            verified_canonical_label: verifiedCanonicalLabel,
            verified_aliases: csvValues(identityDraft.aliases),
            object_composition: identityDraft.composition,
            contains: csvValues(identityDraft.contains),
            affordances: csvValues(identityDraft.affordances),
            preferred_for_concepts: csvValues(
              identityDraft.preferredConcepts,
            ),
            semantic_review_notes: identityDraft.notes,
          }),
        },
      );
      const payload = (await response.json()) as LibraryResponse;

      if (!response.ok || !payload.ok || !payload.asset) {
        throw new Error(
          payload.error || "The semantic identity could not be updated.",
        );
      }

      setIdentityDraft({
        assetId:
          payload.asset.asset_id,
        canonicalLabel:
          payload.asset
            .verified_canonical_label ||
          payload.asset
            .requested_concept ||
          payload.asset
            .canonical_label,
        aliases: Array.from(
          new Set([
            ...(payload.asset
              .verified_aliases ?? []),
            ...payload.asset.aliases,
          ]),
        ).join(", "),
        composition:
          payload.asset
            .object_composition ??
          "unknown",
        contains: (
          payload.asset.contains ?? []
        ).join(", "),
        affordances: (
          payload.asset.affordances ?? []
        ).join(", "),
        preferredConcepts: (
          payload.asset
            .preferred_for_concepts ?? []
        ).join(", "),
        notes:
          payload.asset
            .semantic_review_notes ??
          "",
      });
      setPromotionMessage(
        `${assetTitle(asset)} identity is now ${semanticReviewStatus}.`,
      );
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSemanticReviewAssetId(null);
    }
  }

  async function runEnrichmentAction(
    action: "enrich_asset" | "backfill_next",
  ) {
    const assetId = selectedAssetId;
    if (action === "enrich_asset" && !assetId) return;

    setEnrichmentAssetId(assetId ?? "backfill");
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/enrichment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "enrich_asset"
              ? { action, asset_id: assetId, force: true }
              : { action },
          ),
        },
      );
      const payload =
        (await response.json()) as
          EnrichmentResponse & {
            entry?:
              | EnrichmentQueueEntry
              | null;
          };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Asset enrichment could not start.");
      }

      if (payload.entry) {
        setEnrichmentQueue(
          (current) => {
            const next =
              current.filter(
                (entry) =>
                  entry.asset_id !==
                  payload.entry!
                    .asset_id,
              );
            next.push(
              payload.entry!,
            );
            return next;
          },
        );
      }

      setPromotionMessage(
        payload.entry
          ? "Asset enrichment was queued. Lightweight queue polling will refresh the library when it finishes."
          : "No pending asset currently needs backfill.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setEnrichmentAssetId(null);
    }
  }

  async function runGeometryAction(
    mode: "selected" | "all",
  ) {
    const assetId = selectedAssetId;
    if (mode === "selected" && !assetId) {
      return;
    }

    setGeometryAssetId(
      mode === "all" ? "all" : assetId,
    );
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/geometry",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            mode === "all"
              ? { action: "profile_all", force: true }
              : {
                  action: "profile_asset",
                  asset_id: assetId,
                  force: true,
                },
          ),
        },
      );
      const payload =
        (await response.json()) as GeometryResponse & {
          entry?: GeometryQueueEntry;
        };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ||
            "Geometry profiling could not start.",
        );
      }

      if (mode === "all") {
        setGeometryQueue(payload.entries ?? []);
        setPromotionMessage(
          `Queued ${payload.queued_count ?? payload.entries?.length ?? 0} asset(s) for geometry audit and backfill. Existing GLBs are measured in place.`,
        );
      } else if (payload.entry) {
        setGeometryQueue((current) => [
          ...current.filter(
            (entry) =>
              entry.asset_id !== payload.entry!.asset_id,
          ),
          payload.entry!,
        ]);
        setPromotionMessage(
          "Geometry profiling was queued for the selected asset.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setGeometryAssetId(null);
    }
  }

  async function runBulkEnrichment() {
    setEnrichmentAssetId("all");
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/enrichment",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "enrich_all",
            force: true,
          }),
        },
      );
      const payload =
        (await response.json()) as
          EnrichmentResponse;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          payload.error ||
            "The full asset-analysis batch could not be queued.",
        );
      }

      setEnrichmentQueue(
        payload.entries ?? [],
      );
      setPromotionMessage(
        `Queued ${payload.queued_count ?? payload.entries?.length ?? 0} existing asset(s) for style analysis. The queue runs sequentially; keep the server running.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setEnrichmentAssetId(null);
    }
  }

  async function searchBlendKitAssets() {
    const concept = blendKitConcept.trim();
    if (!concept) {
      setError(
        "Type an object name to search for on BlendKit.",
      );
      return;
    }

    setBlendKitSearching(true);
    setBlendKitCandidates([]);
    setBlendKitSelectedSourceAssetId(null);
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/import-blenderkit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "search",
            concept,
            search_query: concept,
          }),
        },
      );
      const payload =
        (await response.json()) as DirectBlendKitSearchResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ||
            "BlendKit candidate search failed.",
        );
      }

      const candidates = payload.candidates ?? [];
      setBlendKitCandidates(candidates);
      setBlendKitLastSearchQuery(payload.query ?? concept);
      setBlendKitSelectedSourceAssetId(
        candidates.find((candidate) => !candidate.already_imported)
          ?.source_asset_id ?? null,
      );
      setPromotionMessage(
        payload.message ||
          (candidates.length > 0
            ? `Choose one of ${candidates.length} CC0 BlendKit candidates.`
            : "No selectable CC0 BlendKit candidates were found."),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setBlendKitSearching(false);
    }
  }

  async function importBlendKitAsset() {
    const concept = blendKitConcept.trim();
    const selectedSourceAssetId =
      blendKitSelectedSourceAssetId;

    if (!concept) {
      setError(
        "Type an object name to import from BlendKit.",
      );
      return;
    }

    if (!selectedSourceAssetId) {
      setError(
        "Select a BlendKit candidate before importing.",
      );
      return;
    }

    const selectedCandidate = blendKitCandidates.find(
      (candidate) =>
        candidate.source_asset_id === selectedSourceAssetId,
    );
    if (!selectedCandidate || selectedCandidate.already_imported) {
      setError(
        "The selected BlendKit candidate is not available for import.",
      );
      return;
    }

    setBlendKitImporting(true);
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/import-blenderkit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "import",
            concept,
            search_query:
              blendKitLastSearchQuery || concept,
            selected_source_asset_id:
              selectedSourceAssetId,
          }),
        },
      );
      const payload =
        (await response.json()) as DirectBlendKitImportResponse;

      if (!response.ok || !payload.ok || !payload.asset) {
        throw new Error(
          payload.error ||
            "BlendKit import failed.",
        );
      }

      if (payload.enrichment_entry) {
        setEnrichmentQueue((current) => {
          const next = current.filter(
            (entry) =>
              entry.asset_id !==
              payload.enrichment_entry!.asset_id,
          );
          next.push(payload.enrichment_entry!);
          return next;
        });
      }

      setSelectedAssetId(payload.asset.asset_id);
      setReviewView("needs_review");
      setBlendKitConcept("");
      setBlendKitCandidates([]);
      setBlendKitSelectedSourceAssetId(null);
      setBlendKitLastSearchQuery("");
      setPromotionMessage(
        payload.message ||
          `${payload.asset.display_name} was imported from BlendKit and queued for analysis.`,
      );
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setBlendKitImporting(false);
    }
  }

  async function createGlmProceduralAsset() {
    const concept = glmConcept.trim();
    const targetExtent = Number(glmTargetExtentM);
    if (!concept) { setError("Type the object you want GLM 5.2 to construct."); return; }
    if (!Number.isFinite(targetExtent) || targetExtent <= 0) { setError("The GLM normalization extent must be greater than zero."); return; }
    setGlmCreating(true); setPromotionMessage(null); setError(null);
    try {
      const response = await fetch("/api/sandbox/probe-lab/assets/glm-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, details: glmDetails, style: glmStyle, target_extent_m: targetExtent }),
      });
      const payload = (await response.json()) as DirectGlmProceduralResponse;
      if (!response.ok || !payload.ok || !payload.asset) throw new Error(payload.error || "GLM procedural asset generation failed.");
      if (payload.enrichment_entry) setEnrichmentQueue((current) => [...current.filter((entry) => entry.asset_id !== payload.enrichment_entry!.asset_id), payload.enrichment_entry!]);
      setSelectedAssetId(payload.asset.asset_id); setReviewView("needs_review");
      setPromotionMessage(payload.message || `${payload.asset.display_name} was constructed by GLM and queued for review.`);
      setRefreshToken((value) => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setGlmCreating(false); }
  }

  async function createTrellisAsset() {
    const concept = trellisConcept.trim();

    if (!concept) {
      setError(
        "Type the object you want TRELLIS to generate.",
      );
      return;
    }

    const parsedTargetExtent = Number(trellisTargetExtentM);
    const parsedSeed = Number(trellisSeed);
    const parsedMaxAttempts = Number(trellisMaxAttempts);

    if (
      !Number.isFinite(parsedTargetExtent) ||
      parsedTargetExtent <= 0
    ) {
      setError(
        "The TRELLIS normalization extent must be greater than zero.",
      );
      return;
    }

    if (
      !Number.isInteger(parsedSeed) ||
      parsedSeed < 0
    ) {
      setError(
        "The TRELLIS seed must be a nonnegative whole number.",
      );
      return;
    }

    if (
      !Number.isInteger(parsedMaxAttempts) ||
      parsedMaxAttempts < 1 ||
      parsedMaxAttempts > 3
    ) {
      setError(
        "TRELLIS attempts must be a whole number from 1 to 3.",
      );
      return;
    }

    setTrellisCreating(true);
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/trellis",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            concept,
            acquisition_terms: csvValues(trellisDetails),
            semantic_tags: csvValues(trellisSemanticTags),
            domain:
              trellisDomain.trim() ||
              "asset_library_manual_trellis",
            target_extent_m: parsedTargetExtent,
            no_texture: trellisNoTexture,
            seed: parsedSeed,
            max_attempts: parsedMaxAttempts,
          }),
        },
      );
      const payload =
        (await response.json()) as DirectTrellisCreateResponse;

      if (!response.ok || !payload.ok || !payload.asset) {
        throw new Error(
          payload.error ||
            "TRELLIS asset generation failed.",
        );
      }

      if (payload.enrichment_entry) {
        setEnrichmentQueue((current) => {
          const next = current.filter(
            (entry) =>
              entry.asset_id !==
              payload.enrichment_entry!.asset_id,
          );
          next.push(payload.enrichment_entry!);
          return next;
        });
      }

      setSelectedAssetId(payload.asset.asset_id);
      setReviewView("needs_review");
      setTrellisConcept("");
      setTrellisDetails("");
      setTrellisSemanticTags("");
      setPromotionMessage(
        payload.message ||
          `${payload.asset.display_name} was generated with TRELLIS and queued for analysis.`,
      );
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setTrellisCreating(false);
    }
  }

  async function editSelectedAssetProvenance() {
    if (!selectedAssetId) return;
    const asset = assets.find(
      (candidate) =>
        candidate.asset_id ===
        selectedAssetId,
    );
    if (!asset) return;
    if (
      asset.storage_provider === "r2" ||
      asset.promoted_at
    ) {
      setError(
        "Promoted R2 assets cannot have their licence record rewritten in place. Create a new reviewed asset version.",
      );
      return;
    }

    const sourceProvider = window.prompt(
      "Source provider",
      asset.attribution
        ?.source_provider ??
        (asset.source_display_name
          ?.split(":")[0] ??
          "Poly Pizza"),
    );
    if (sourceProvider == null) return;
    const sourceAssetId = window.prompt(
      "Stable source asset ID",
      asset.attribution
        ?.source_asset_id ??
        asset.source_asset_id ??
        "",
    );
    if (sourceAssetId == null) return;
    const sourceUrl = window.prompt(
      "Source page URL",
      asset.attribution?.source_url ??
        asset.source_url ??
        "",
    );
    if (sourceUrl == null) return;
    const assetTitle = window.prompt(
      "Source asset title",
      asset.attribution?.asset_title ??
        asset.display_name,
    );
    if (assetTitle == null) return;
    const creatorName = window.prompt(
      "Creator name",
      asset.attribution?.creator_name ??
        "",
    );
    if (creatorName == null) return;
    const licenseKind = window.prompt(
      "Licence kind: cc0, cc_by, cc_by_4_0, royalty_free, self_owned, or unknown",
      asset.license_kind,
    );
    if (licenseKind == null) return;
    if (
      ![
        "cc0",
        "cc_by",
        "cc_by_4_0",
        "royalty_free",
        "self_owned",
        "unknown",
      ].includes(licenseKind)
    ) {
      setError(
        "The licence kind was not recognized.",
      );
      return;
    }
    const attributionText = window.prompt(
      "Exact creator-supplied attribution",
      asset.attribution?.text ?? "",
    );
    if (attributionText == null) return;
    const modificationNotice = window.prompt(
      "Modification notice",
      asset.attribution
        ?.modification_notice ??
        "Normalized and processed for real-time use by MyWay.",
    );
    if (modificationNotice == null) return;
    const downloadedAt = window.prompt(
      "Downloaded date (YYYY-MM-DD)",
      asset.attribution?.downloaded_at ??
        new Date().toISOString().slice(0, 10),
    );
    if (downloadedAt == null) return;

    setMaintenanceAction("provenance");
    setMaintenanceAssetId(asset.asset_id);
    setError(null);
    setPromotionMessage(null);
    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/library",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "update_provenance",
            asset_id: asset.asset_id,
            source_provider:
              sourceProvider,
            source_asset_id:
              sourceAssetId,
            source_url: sourceUrl,
            asset_title: assetTitle,
            creator_name: creatorName,
            license_kind: licenseKind,
            license_version:
              licenseKind ===
              "cc_by_4_0"
                ? "4.0"
                : null,
            attribution_text:
              attributionText,
            modification_notice:
              modificationNotice,
            downloaded_at: downloadedAt,
          }),
        },
      );
      const payload =
        await response.json() as
          LibraryResponse;
      if (
        !response.ok ||
        !payload.ok ||
        !payload.asset
      ) {
        throw new Error(
          payload.error ??
            "Licence and source update failed.",
        );
      }
      setAssets((current) =>
        current.map((candidate) =>
          candidate.asset_id ===
          payload.asset!.asset_id
            ? payload.asset!
            : candidate,
        ),
      );
      setPromotionMessage(
        "Licence and provenance were updated. Formal licence and scene approval were reset for review.",
      );
      setRefreshToken((value) =>
        value + 1,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setMaintenanceAction(null);
      setMaintenanceAssetId(null);
    }
  }

  async function removeSelectedAsset() {
    if (!selectedAssetId) return;

    const asset = assets.find(
      (candidate) => candidate.asset_id === selectedAssetId,
    );

    if (!asset) return;

    const remoteWarning =
      asset.storage_provider === "r2"
        ? "\n\nThis asset is published in Cloudflare R2. Its runtime GLB, thumbnail, and any archived source object will also be deleted."
        : asset.storage_provider === "r2_private_pending"
          ? "\n\nThis asset is a private R2 review candidate. Its private GLB, thumbnail, and any archived source object will also be deleted."
          : "";

    const confirmed = window.confirm(
      `Permanently remove "${asset.display_name}" from the MyWay Asset Library?${remoteWarning}\n\nThe registry entry, local model files, thumbnail, source and license records, appearance renders, and local embedding will be removed. This cannot be undone.`,
    );

    if (!confirmed) return;

    setMaintenanceAction("remove");
    setMaintenanceAssetId(asset.asset_id);
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/remove",
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
      const payload = (await response.json()) as LibraryResponse & {
        removed_asset_id?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error || "The asset could not be removed.",
        );
      }

      setSelectedAssetId(null);
      setPromotionMessage(
        `${asset.display_name} was removed from the library.`,
      );
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setMaintenanceAction(null);
      setMaintenanceAssetId(null);
    }
  }

  async function createReplacement(
    provider: "blenderkit" | "trellis",
  ) {
    if (!selectedAssetId) return;

    const asset = assets.find(
      (candidate) => candidate.asset_id === selectedAssetId,
    );

    if (!asset) return;

    const providerLabel =
      provider === "blenderkit"
        ? "BlendKit"
        : "TRELLIS";

    const confirmed = window.confirm(
      provider === "blenderkit"
        ? `Search BlendKit for a different CC0 version of "${asset.verified_canonical_label ?? asset.canonical_label}"?\n\nThe current asset will stay in the library so you can compare both versions.`
        : `Ask TRELLIS to generate an improved version of "${asset.verified_canonical_label ?? asset.canonical_label}"?\n\nThe current asset will stay in the library. TRELLIS generation can take several minutes and the result remains sandbox-only until its licensing is cleared.`,
    );

    if (!confirmed) return;

    setMaintenanceAction(provider);
    setMaintenanceAssetId(asset.asset_id);
    setPromotionMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/replace",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asset_id: asset.asset_id,
            provider,
          }),
        },
      );
      const payload = (await response.json()) as LibraryResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.asset
      ) {
        throw new Error(
          payload.error ||
            `A ${providerLabel} replacement could not be created.`,
        );
      }

      setSelectedAssetId(payload.asset.asset_id);
      setPromotionMessage(
        `${providerLabel} created a new candidate. The original is still in the library for comparison.`,
      );
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setMaintenanceAction(null);
      setMaintenanceAssetId(null);
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
  const sceneReviewStatuses = useMemo(
    () => uniqueSorted(assets.map((asset) => asset.scene_review_status)),
    [assets],
  );
  const licenses = useMemo(
    () => uniqueSorted(assets.map((asset) => asset.license_kind)),
    [assets],
  );


  const acquisitionJobByAssetId =
    useMemo(() => {
      const map =
        new Map<string, AcquisitionJob>();

      for (const job of acquisitionJobs) {
        if (
          job.current_candidate_asset_id
        ) {
          map.set(
            job.current_candidate_asset_id,
            job,
          );
        }

        for (const candidate of
          job.candidate_history) {
          if (!map.has(candidate.asset_id)) {
            map.set(
              candidate.asset_id,
              job,
            );
          }
        }
      }

      return map;
    }, [acquisitionJobs]);

  const acquisitionCounts = useMemo(
    () => ({
      all: assets.length,
      needs_review: assets.filter(
        (asset) =>
          asset.scene_review_status ===
          "pending",
      ).length,
      approved: assets.filter(
        (asset) =>
          asset.scene_review_status ===
          "approved",
      ).length,
      rejected: assets.filter(
        (asset) =>
          asset.scene_review_status ===
          "rejected",
      ).length,
      acquiring: acquisitionJobs.filter(
        (job) =>
          job.status === "missing" ||
          job.status ===
            "searching_blenderkit" ||
          job.status ===
            "generating_trellis" ||
          job.status === "unavailable",
      ).length,
    }),
    [
      acquisitionJobByAssetId,
      acquisitionJobs,
      assets,
    ],
  );

  const activeAcquisitionJobs =
    useMemo(
      () =>
        acquisitionJobs.filter(
          (job) =>
            job.status === "missing" ||
            job.status ===
              "searching_blenderkit" ||
            job.status ===
              "generating_trellis" ||
            job.status ===
              "unavailable",
        ),
      [acquisitionJobs],
    );

  const visibleAssets = useMemo(() => {
    const queryTokens = search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const filtered = assets.filter((asset) => {
      const linkedJob =
        acquisitionJobByAssetId.get(
          asset.asset_id,
        );

      if (
        reviewView === "needs_review" &&
        asset.scene_review_status !==
          "pending"
      ) {
        return false;
      }

      if (
        reviewView === "approved" &&
        asset.scene_review_status !==
          "approved"
      ) {
        return false;
      }

      if (
        reviewView === "rejected" &&
        asset.scene_review_status !==
          "rejected"
      ) {
        return false;
      }

      if (
        reviewView === "acquiring" &&
        (!linkedJob ||
          ![
            "missing",
            "searching_blenderkit",
            "generating_trellis",
            "unavailable",
          ].includes(linkedJob.status))
      ) {
        return false;
      }

      if (sourceFilter !== "all" && asset.source_type !== sourceFilter) {
        return false;
      }
      if (domainFilter !== "all" && asset.domain !== domainFilter) {
        return false;
      }
      if (statusFilter !== "all" && asset.status !== statusFilter) {
        return false;
      }
      if (
        sceneReviewFilter !== "all" &&
        asset.scene_review_status !== sceneReviewFilter
      ) {
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
        asset.scene_review_status,
        asset.semantic_review_status,
        asset.license_kind,
        asset.license_status,
        asset.notes ?? "",
        asset.source_prompt ?? "",
        asset.requested_concept ?? "",
        asset.source_display_name ?? "",
        asset.verified_canonical_label ?? "",
        ...asset.aliases,
        ...(asset.verified_aliases ?? []),
        ...asset.semantic_tags,
        ...(asset.appearance_profile?.style_descriptors ?? []),
        ...(asset.appearance_profile?.design_era ?? []),
        ...(asset.appearance_profile?.realism_level ?? []),
        ...(asset.appearance_profile?.shape_language ?? []),
        ...(asset.appearance_profile?.material_treatment ?? []),
        ...(asset.appearance_profile?.color_palette ?? []),
        ...(asset.appearance_profile?.surface_condition ?? []),
        ...(asset.appearance_profile?.ornamentation ?? []),
        ...(asset.appearance_profile?.visual_mood ?? []),
        ...(asset.appearance_profile?.detail_level ?? []),
        ...(asset.appearance_profile?.scene_compatibility ?? []),
        ...(asset.appearance_profile?.descriptors ?? []),
        ...(asset.appearance_profile?.materials ?? []),
        ...(asset.appearance_profile?.colors ?? []),
        ...(asset.appearance_profile?.geometry ?? []),
        asset.appearance_profile?.summary ?? "",
        ...(asset.contains ?? []),
        ...(asset.affordances ?? []),
        ...(asset.preferred_for_concepts ?? []),
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
    acquisitionJobByAssetId,
    domainFilter,
    licenseFilter,
    search,
    reviewView,
    sceneReviewFilter,
    sortKey,
    sourceFilter,
    statusFilter,
  ]);

  useEffect(() => {
    if (
      selectedAssetId &&
      visibleAssets.some(
        (asset) =>
          asset.asset_id === selectedAssetId,
      )
    ) {
      return;
    }

    setSelectedAssetId(
      visibleAssets[0]?.asset_id ?? null,
    );
  }, [selectedAssetId, visibleAssets]);

  const selectedAsset =
    assets.find((asset) => asset.asset_id === selectedAssetId) ?? null;

  useEffect(() => {
    if (!selectedAsset) {
      setIdentityDraft(null);
      return;
    }

    setIdentityDraft((current) => {
      // Background queue polling refreshes the asset record. Preserve any
      // unsaved editor text while the same asset remains selected.
      if (
        current?.assetId ===
        selectedAsset.asset_id
      ) {
        return current;
      }

      return {
        assetId:
          selectedAsset.asset_id,
        canonicalLabel:
          selectedAsset
            .verified_canonical_label ||
          selectedAsset
            .requested_concept ||
          selectedAsset.canonical_label,
        aliases: Array.from(
          new Set([
            ...(selectedAsset
              .verified_aliases ?? []),
            ...selectedAsset.aliases,
          ]),
        ).join(", "),
        composition:
          selectedAsset
            .object_composition ??
          "unknown",
        contains: (
          selectedAsset.contains ?? []
        ).join(", "),
        affordances: (
          selectedAsset.affordances ?? []
        ).join(", "),
        preferredConcepts: (
          selectedAsset
            .preferred_for_concepts ?? []
        ).join(", "),
        notes:
          selectedAsset
            .semantic_review_notes ??
          "",
      };
    });
  }, [selectedAsset]);

  const selectedAcquisitionJob =
    selectedAsset
      ? acquisitionJobByAssetId.get(
          selectedAsset.asset_id,
        ) ?? null
      : null;

  const existingFiles = assets.filter(
    (asset) => asset.file_stats.exists,
  ).length;
  const generatedAssets = assets.filter(
    (asset) =>
      asset.source_type === "blenderkit" ||
      asset.source_type === "trellis",
  ).length;
  const sceneApprovedAssets = assets.filter(
    (asset) => asset.scene_review_status === "approved",
  ).length;
  const semanticVerifiedAssets = assets.filter(
    (asset) =>
      asset.semantic_review_status === "verified",
  ).length;

  if (librarySection === "resources") {
    return (
      <AmbientCgLibraryLab
        embedded
        onShowModels={(input) => {
          if (input?.needsReview) {
            setReviewView("needs_review");
          }
          if (input?.assetId) {
            setSelectedAssetId(
              input.assetId,
            );
          }
          setRefreshToken(
            (value) => value + 1,
          );
          setLibrarySection("models");
        }}
      />
    );
  }

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

        .asset-library-maintenance-actions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.65rem;
          margin: 0 0 1rem;
        }

        .asset-library-button[data-danger="true"] {
          border-color: rgba(248, 113, 113, 0.55);
          color: #fee2e2;
          background: rgba(185, 28, 28, 0.2);
        }

        .asset-library-button[data-secondary="true"] {
          border-color: rgba(96, 165, 250, 0.5);
          color: #dbeafe;
          background: rgba(30, 64, 175, 0.18);
        }

        .asset-library-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
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



        .asset-library-direct-import {
          display: grid;
          gap: 1rem;
          margin-bottom: 1rem;
          border: 1px solid rgba(56, 189, 248, 0.24);
          border-radius: 1.25rem;
          padding: 1rem;
          background:
            linear-gradient(135deg, rgba(14, 116, 144, 0.16), rgba(15, 23, 42, 0.72));
        }

        .asset-library-acquisition-provider-tabs {
          display: flex;
          width: fit-content;
          max-width: 100%;
          overflow: hidden;
          border: 1px solid rgba(125, 211, 252, 0.24);
          border-radius: 999px;
          background: rgba(2, 6, 23, 0.52);
        }

        .asset-library-acquisition-provider-tabs button {
          flex: 1 1 auto;
          min-height: 40px;
          border: 0;
          padding: 0.6rem 0.9rem;
          color: rgba(226, 232, 240, 0.72);
          background: transparent;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 800;
          cursor: pointer;
        }

        .asset-library-acquisition-provider-tabs button[data-active="true"] {
          color: #ecfeff;
          background: rgba(8, 145, 178, 0.28);
          box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.34);
        }

        .asset-library-acquisition-provider-tabs button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .asset-library-direct-import-search {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.8rem;
          align-items: end;
        }

        .asset-library-direct-import label {
          display: grid;
          gap: 0.45rem;
          color: #e0f2fe;
          font-weight: 700;
        }

        .asset-library-direct-import input,
        .asset-library-direct-import textarea,
        .asset-library-direct-import select {
          width: 100%;
          min-height: 46px;
          border: 1px solid rgba(125, 211, 252, 0.3);
          border-radius: 0.9rem;
          padding: 0 0.85rem;
          color: #f8fafc;
          background: rgba(2, 6, 23, 0.72);
          font: inherit;
          outline: none;
        }

        .asset-library-direct-import textarea {
          min-height: 88px;
          padding: 0.75rem 0.85rem;
          resize: vertical;
        }

        .asset-library-direct-import select {
          min-height: 46px;
          padding: 0 0.85rem;
        }

        .asset-library-trellis-form {
          display: grid;
          gap: 1rem;
        }

        .asset-library-trellis-intro {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .asset-library-trellis-intro > div {
          display: grid;
          gap: 0.35rem;
          max-width: 760px;
        }

        .asset-library-trellis-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.8rem;
          border-top: 1px solid rgba(125, 211, 252, 0.18);
          padding-top: 1rem;
        }

        .asset-library-trellis-wide {
          grid-column: 1 / -1;
        }

        .asset-library-trellis-checkbox {
          display: flex !important;
          align-items: flex-start;
          gap: 0.65rem !important;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 0.9rem;
          padding: 0.8rem;
          background: rgba(15, 23, 42, 0.5);
        }

        .asset-library-trellis-checkbox > input {
          width: 18px;
          min-height: 18px;
          margin-top: 0.15rem;
          padding: 0;
        }

        .asset-library-trellis-checkbox > span {
          display: grid;
          gap: 0.25rem;
        }

        .asset-library-trellis-warning {
          margin: 0;
          border: 1px solid rgba(251, 191, 36, 0.22);
          border-radius: 0.8rem;
          padding: 0.7rem 0.8rem;
          color: rgba(254, 243, 199, 0.82);
          background: rgba(120, 53, 15, 0.12);
          font-size: 0.78rem;
          line-height: 1.5;
        }

        .asset-library-direct-import small {
          color: rgba(203, 213, 225, 0.7);
          font-weight: 400;
          line-height: 1.5;
        }

        .asset-library-blenderkit-results {
          display: grid;
          gap: 0.9rem;
          border-top: 1px solid rgba(125, 211, 252, 0.18);
          padding-top: 1rem;
        }

        .asset-library-blenderkit-results-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .asset-library-blenderkit-results-header > div {
          display: grid;
          gap: 0.2rem;
        }

        .asset-library-blenderkit-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 0.8rem;
        }

        .asset-library-blenderkit-candidate {
          display: grid;
          align-content: space-between;
          gap: 0.7rem;
          min-width: 0;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 1rem;
          padding: 0.7rem;
          background: rgba(2, 6, 23, 0.62);
          transition: border-color 140ms ease, background 140ms ease;
        }

        .asset-library-blenderkit-candidate[data-selected="true"] {
          border-color: rgba(56, 189, 248, 0.9);
          background: rgba(8, 145, 178, 0.16);
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
        }

        .asset-library-blenderkit-candidate[data-disabled="true"] {
          opacity: 0.58;
        }

        .asset-library-blenderkit-candidate > label {
          display: grid;
          grid-template-columns: auto 84px minmax(0, 1fr);
          gap: 0.65rem;
          align-items: start;
          color: inherit;
          font-weight: 400;
          cursor: pointer;
        }

        .asset-library-blenderkit-candidate > label > input {
          width: 18px;
          min-height: 18px;
          margin-top: 0.3rem;
          padding: 0;
        }

        .asset-library-blenderkit-preview {
          display: grid;
          place-items: center;
          width: 84px;
          aspect-ratio: 1;
          overflow: hidden;
          border-radius: 0.75rem;
          color: rgba(226, 232, 240, 0.72);
          background: rgba(15, 23, 42, 0.9);
        }

        .asset-library-blenderkit-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .asset-library-blenderkit-copy {
          display: grid;
          gap: 0.35rem;
          min-width: 0;
        }

        .asset-library-blenderkit-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.45rem;
        }

        .asset-library-blenderkit-title-row strong {
          overflow-wrap: anywhere;
        }

        .asset-library-blenderkit-title-row span {
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 0.15rem 0.4rem;
          color: #bbf7d0;
          background: rgba(22, 163, 74, 0.18);
          font-size: 0.72rem;
          font-weight: 800;
        }

        .asset-library-blenderkit-copy p {
          display: -webkit-box;
          overflow: hidden;
          margin: 0;
          color: rgba(226, 232, 240, 0.76);
          font-size: 0.82rem;
          font-weight: 400;
          line-height: 1.4;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }

        .asset-library-blenderkit-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        .asset-library-blenderkit-meta span,
        .asset-library-blenderkit-copy em {
          border-radius: 999px;
          padding: 0.22rem 0.45rem;
          color: rgba(203, 213, 225, 0.78);
          background: rgba(30, 41, 59, 0.78);
          font-size: 0.7rem;
          font-style: normal;
          font-weight: 600;
        }

        .asset-library-blenderkit-copy em {
          width: fit-content;
          color: #fde68a;
          background: rgba(161, 98, 7, 0.22);
        }

        .asset-library-blenderkit-candidate > a {
          width: fit-content;
          color: #7dd3fc;
          font-size: 0.78rem;
          text-decoration: none;
        }

        .asset-library-blenderkit-candidate > a:hover {
          text-decoration: underline;
        }

        .asset-library-review-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
          margin-bottom: 1rem;
        }

        .asset-library-review-tab {
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          min-height: 42px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 999px;
          padding: 0.65rem 0.9rem;
          color: rgba(226, 232, 240, 0.8);
          background: rgba(15, 23, 42, 0.64);
          cursor: pointer;
        }

        .asset-library-review-tab[data-active="true"] {
          border-color: rgba(56, 189, 248, 0.7);
          color: #ecfeff;
          background: rgba(8, 145, 178, 0.24);
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
        }

        .asset-library-review-tab strong {
          display: inline-flex;
          min-width: 1.75rem;
          justify-content: center;
          border-radius: 999px;
          padding: 0.15rem 0.45rem;
          color: #e0f2fe;
          background: rgba(255, 255, 255, 0.09);
        }

        .asset-library-acquisition-queue {
          margin-bottom: 1rem;
          border: 1px solid rgba(167, 139, 250, 0.2);
          border-radius: 1.25rem;
          padding: 0.9rem;
          background: rgba(76, 29, 149, 0.1);
        }

        .asset-library-acquisition-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
          gap: 0.75rem;
        }

        .asset-library-acquisition-card {
          border: 1px solid rgba(196, 181, 253, 0.18);
          border-radius: 1rem;
          padding: 1rem;
          background: rgba(15, 23, 42, 0.72);
        }

        .asset-library-acquisition-card h2 {
          margin: 0;
          font-size: 1.05rem;
        }

        .asset-library-acquisition-card p,
        .asset-library-acquisition-card small {
          display: block;
          margin: 0.45rem 0 0;
          color: rgba(226, 232, 240, 0.68);
          line-height: 1.55;
        }

        .asset-library-controls {
          display: grid;
          grid-template-columns: minmax(240px, 1.8fr) repeat(6, minmax(130px, 0.7fr));
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

        .asset-library-card-source,
        .asset-library-details-source {
          margin: 0.35rem 0 0;
          color: rgba(203, 213, 225, 0.78);
          font-size: 0.74rem;
          line-height: 1.35;
        }

        .asset-library-details-source {
          margin-bottom: 0.15rem;
        }

        .asset-library-editor,
        .asset-library-appearance {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 1rem;
          margin-bottom: 1rem;
          padding: 0.9rem;
          background: rgba(2, 6, 23, 0.35);
        }

        .asset-library-appearance {
          grid-template-columns: minmax(0, 1fr);
        }

        .asset-library-editor label {
          display: grid;
          gap: 0.35rem;
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.76rem;
          font-weight: 800;
        }

        .asset-library-editor label small,
        .asset-library-section-heading small,
        .asset-library-appearance > small {
          color: rgba(148, 163, 184, 0.7);
          font-weight: 500;
        }

        .asset-library-editor input,
        .asset-library-editor select,
        .asset-library-editor textarea {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 0.7rem;
          padding: 0.65rem 0.7rem;
          color: #f8fafc;
          background: rgba(15, 23, 42, 0.82);
          font: inherit;
          font-weight: 500;
        }

        .asset-library-editor textarea {
          resize: vertical;
        }

        .asset-library-field-help {
          display: block;
          margin-top: 0.35rem;
          color: rgba(203, 213, 225, 0.68);
          font-size: 0.72rem;
          font-weight: 500;
          line-height: 1.45;
          text-transform: none;
          letter-spacing: normal;
        }

        .asset-library-editor-advanced {
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 0.9rem;
          padding: 0.8rem;
          background: rgba(15, 23, 42, 0.44);
        }

        .asset-library-editor-advanced summary {
          cursor: pointer;
          color: #cbd5e1;
          font-size: 0.82rem;
          font-weight: 850;
        }

        .asset-library-editor-advanced[open] {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.8rem;
        }

        .asset-library-editor-advanced[open] summary {
          grid-column: 1 / -1;
        }

        @media (max-width: 760px) {
          .asset-library-editor-advanced[open] {
            grid-template-columns: 1fr;
          }
        }

        .asset-library-editor-wide,
        .asset-library-section-heading {
          grid-column: 1 / -1;
        }

        .asset-library-section-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .asset-library-section-heading strong,
        .asset-library-section-heading small {
          display: block;
        }

        .asset-library-analysis-views {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.55rem;
        }

        .asset-library-analysis-views figure {
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 0.8rem;
          margin: 0;
          background: #e2e8f0;
        }

        .asset-library-analysis-views img {
          display: block;
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
        }

        .asset-library-analysis-views figcaption {
          padding: 0.4rem 0.5rem;
          color: rgba(226, 232, 240, 0.78);
          background: rgba(2, 6, 23, 0.92);
          font-size: 0.65rem;
          text-transform: capitalize;
        }

        .asset-library-error-inline {
          margin: 0;
          color: #fecaca;
          font-size: 0.75rem;
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

          .asset-library-direct-import-search {
            grid-template-columns: 1fr;
          }

          .asset-library-trellis-intro {
            align-items: stretch;
            flex-direction: column;
          }

          .asset-library-trellis-fields {
            grid-template-columns: 1fr;
          }

          .asset-library-trellis-wide {
            grid-column: auto;
          }

          .asset-library-blenderkit-results-header {
            align-items: stretch;
            flex-direction: column;
          }

          .asset-library-blenderkit-candidate > label {
            grid-template-columns: auto 72px minmax(0, 1fr);
          }

          .asset-library-blenderkit-preview {
            width: 72px;
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
              data-secondary="true"
              onClick={() => setLibrarySection("resources")}
              type="button"
            >
              Materials, HDRIs & ambientCG
            </button>
            <button
              className="asset-library-button"
              data-secondary="true"
              disabled={geometryAssetId === "all"}
              onClick={() => void runGeometryAction("all")}
              type="button"
            >
              {geometryAssetId === "all"
                ? "Queueing geometry audit…"
                : "Audit & backfill geometry"}
            </button>
            <button
              className="asset-library-button"
              data-secondary="true"
              disabled={enrichmentAssetId === "all"}
              onClick={() => void runBulkEnrichment()}
              type="button"
            >
              {enrichmentAssetId === "all"
                ? "Queueing all analyses…"
                : "Analyze all assets"}
            </button>
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

        <section className="asset-library-direct-import">
          <div
            aria-label="Manual asset acquisition provider"
            className="asset-library-acquisition-provider-tabs"
          >
            <button
              data-active={manualAcquisitionMode === "blenderkit"}
              disabled={blendKitSearching || blendKitImporting || trellisCreating || glmCreating || cc0Importing || ccByImporting}
              onClick={() => setManualAcquisitionMode("blenderkit")}
              type="button"
            >
              Search BlendKit
            </button>
            <button
              data-active={manualAcquisitionMode === "trellis"}
              disabled={blendKitSearching || blendKitImporting || trellisCreating || glmCreating || cc0Importing || ccByImporting}
              onClick={() => setManualAcquisitionMode("trellis")}
              type="button"
            >
              Create with TRELLIS
            </button>
            <button
              data-active={manualAcquisitionMode === "glm"}
              disabled={blendKitSearching || blendKitImporting || trellisCreating || glmCreating || cc0Importing || ccByImporting}
              onClick={() => setManualAcquisitionMode("glm")}
              type="button"
            >
              Build with GLM 5.2
            </button>
            <button
              data-active={manualAcquisitionMode === "cc0"}
              disabled={blendKitSearching || blendKitImporting || trellisCreating || glmCreating || cc0Importing || ccByImporting}
              onClick={() => setManualAcquisitionMode("cc0")}
              type="button"
            >
              Import CC0 GLB / bundle
            </button>
            <button
              data-active={manualAcquisitionMode === "cc_by"}
              disabled={blendKitSearching || blendKitImporting || trellisCreating || glmCreating || cc0Importing || ccByImporting}
              onClick={() => setManualAcquisitionMode("cc_by")}
              type="button"
            >
              Import CC BY GLB
            </button>
          </div>

          {manualAcquisitionMode === "blenderkit" ? (
            <>
              <form
                className="asset-library-direct-import-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchBlendKitAssets();
                }}
              >
                <label>
                  Choose a CC0 asset from BlendKit
                  <input
                    aria-label="BlendKit object name"
                    disabled={blendKitSearching || blendKitImporting}
                    onChange={(event) => {
                      setBlendKitConcept(event.target.value);
                      setBlendKitCandidates([]);
                      setBlendKitSelectedSourceAssetId(null);
                      setBlendKitLastSearchQuery("");
                    }}
                    placeholder="Type an object, such as microscope or violin"
                    value={blendKitConcept}
                  />
                  <small>
                    Search first, compare the available candidates, then import only
                    the exact model you select. The normal geometry, identity,
                    appearance, embedding, and approval pipeline still runs afterward.
                  </small>
                </label>
                <button
                  className="asset-library-button"
                  data-primary="true"
                  disabled={
                    blendKitSearching ||
                    blendKitImporting ||
                    !blendKitConcept.trim()
                  }
                  type="submit"
                >
                  {blendKitSearching
                    ? "Searching BlendKit…"
                    : blendKitCandidates.length > 0
                      ? "Search again"
                      : "Search BlendKit"}
                </button>
              </form>

              {blendKitCandidates.length > 0 ? (
                <div className="asset-library-blenderkit-results">
                  <div className="asset-library-blenderkit-results-header">
                    <div>
                      <strong>
                        Select one candidate
                      </strong>
                      <small>
                        {blendKitCandidates.length} CC0 option(s) shown for “
                        {blendKitLastSearchQuery || blendKitConcept.trim()}”.
                      </small>
                    </div>
                    <button
                      className="asset-library-button"
                      data-primary="true"
                      disabled={
                        blendKitImporting ||
                        !blendKitSelectedSourceAssetId
                      }
                      onClick={() => void importBlendKitAsset()}
                      type="button"
                    >
                      {blendKitImporting
                        ? "Importing selected asset…"
                        : "Import selected asset"}
                    </button>
                  </div>

                  <div className="asset-library-blenderkit-grid">
                    {blendKitCandidates.map((candidate) => {
                      const selected =
                        candidate.source_asset_id ===
                        blendKitSelectedSourceAssetId;

                      return (
                        <article
                          className="asset-library-blenderkit-candidate"
                          data-disabled={candidate.already_imported}
                          data-selected={selected}
                          key={candidate.source_asset_id}
                        >
                          <label>
                            <input
                              checked={selected}
                              disabled={
                                candidate.already_imported ||
                                blendKitImporting
                              }
                              name="blenderkit-candidate"
                              onChange={() =>
                                setBlendKitSelectedSourceAssetId(
                                  candidate.source_asset_id,
                                )
                              }
                              type="radio"
                              value={candidate.source_asset_id}
                            />
                            <div className="asset-library-blenderkit-preview">
                              {candidate.thumbnail_url ? (
                                <img
                                  alt={`${candidate.display_name} BlendKit preview`}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  src={candidate.thumbnail_url}
                                />
                              ) : (
                                <span aria-hidden="true">
                                  {candidate.display_name.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="asset-library-blenderkit-copy">
                              <div className="asset-library-blenderkit-title-row">
                                <strong>{candidate.display_name}</strong>
                                <span>CC0</span>
                              </div>
                              <small>
                                {candidate.author_name
                                  ? `By ${candidate.author_name}`
                                  : "Creator not listed"}
                                {candidate.verification_status
                                  ? ` · ${candidate.verification_status}`
                                  : ""}
                              </small>
                              {candidate.description ? (
                                <p>{candidate.description}</p>
                              ) : null}
                              <div className="asset-library-blenderkit-meta">
                                <span>
                                  {candidate.polygon_count != null
                                    ? `${candidate.polygon_count.toLocaleString()} polygons`
                                    : "Polygon count unavailable"}
                                </span>
                                <span>
                                  {candidate.file_size_bytes != null
                                    ? formatBytes(candidate.file_size_bytes)
                                    : "File size unavailable"}
                                </span>
                                <span>
                                  {candidate.semantic_match
                                    ? "Direct identity match"
                                    : "Broader search result"}
                                </span>
                              </div>
                              {candidate.already_imported ? (
                                <em>Already in your Asset Library</em>
                              ) : null}
                            </div>
                          </label>
                          {candidate.source_url ? (
                            <a
                              href={candidate.source_url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Open on BlendKit
                            </a>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : manualAcquisitionMode === "trellis" ? (
            <form
              className="asset-library-trellis-form"
              onSubmit={(event) => {
                event.preventDefault();
                void createTrellisAsset();
              }}
            >
              <div className="asset-library-trellis-intro">
                <div>
                  <strong>Create a new reusable asset with TRELLIS</strong>
                  <small>
                    TRELLIS generates one new GLB from your description. MyWay then
                    normalizes it, measures its spatial regions, registers it, and
                    queues appearance and embedding analysis before approval.
                  </small>
                </div>
                <button
                  className="asset-library-button"
                  data-primary="true"
                  disabled={trellisCreating || !trellisConcept.trim()}
                  type="submit"
                >
                  {trellisCreating
                    ? "Generating and processing asset…"
                    : "Generate TRELLIS asset"}
                </button>
              </div>

              <div className="asset-library-trellis-fields">
                <label className="asset-library-trellis-wide">
                  Object identity
                  <input
                    aria-label="TRELLIS object identity"
                    disabled={trellisCreating}
                    onChange={(event) => setTrellisConcept(event.target.value)}
                    placeholder="For example: vintage desk fan"
                    value={trellisConcept}
                  />
                  <small>
                    Use the clearest noun phrase for what the asset actually is.
                  </small>
                </label>

                <label className="asset-library-trellis-wide">
                  Generation details
                  <textarea
                    aria-label="TRELLIS generation details"
                    disabled={trellisCreating}
                    onChange={(event) => setTrellisDetails(event.target.value)}
                    placeholder="Comma-separated details, such as metal cage, three blades, tabletop base"
                    rows={3}
                    value={trellisDetails}
                  />
                  <small>
                    MyWay combines the identity and these details into TRELLIS’s compact
                    generation prompt. Put the most important shape details first.
                  </small>
                </label>

                <label>
                  Semantic tags
                  <input
                    aria-label="TRELLIS semantic tags"
                    disabled={trellisCreating}
                    onChange={(event) =>
                      setTrellisSemanticTags(event.target.value)
                    }
                    placeholder="fan, appliance, tabletop"
                    value={trellisSemanticTags}
                  />
                </label>

                <label>
                  Domain
                  <input
                    aria-label="TRELLIS asset domain"
                    disabled={trellisCreating}
                    onChange={(event) => setTrellisDomain(event.target.value)}
                    value={trellisDomain}
                  />
                </label>

                <label>
                  Normalization extent (m)
                  <input
                    aria-label="TRELLIS normalization extent"
                    disabled={trellisCreating}
                    min="0.05"
                    onChange={(event) =>
                      setTrellisTargetExtentM(event.target.value)
                    }
                    step="0.05"
                    type="number"
                    value={trellisTargetExtentM}
                  />
                  <small>
                    This is the standardized working size, not the final logical scene size.
                  </small>
                </label>

                <label>
                  Seed
                  <input
                    aria-label="TRELLIS seed"
                    disabled={trellisCreating}
                    min="0"
                    onChange={(event) => setTrellisSeed(event.target.value)}
                    step="1"
                    type="number"
                    value={trellisSeed}
                  />
                </label>

                <label>
                  Retry attempts
                  <select
                    aria-label="TRELLIS retry attempts"
                    disabled={trellisCreating}
                    onChange={(event) =>
                      setTrellisMaxAttempts(event.target.value)
                    }
                    value={trellisMaxAttempts}
                  >
                    <option value="1">1 attempt</option>
                    <option value="2">2 attempts</option>
                    <option value="3">3 attempts</option>
                  </select>
                </label>

                <label className="asset-library-trellis-checkbox">
                  <input
                    checked={trellisNoTexture}
                    disabled={trellisCreating}
                    onChange={(event) =>
                      setTrellisNoTexture(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    Generate without textures
                    <small>
                      Useful when geometry matters more than surface appearance.
                    </small>
                  </span>
                </label>
              </div>

              <p className="asset-library-trellis-warning">
                TRELLIS output is generated rather than selected from a catalogue.
                Review the identity, geometry, and appearance before approving it for scenes.
              </p>
            </form>
          ) : manualAcquisitionMode === "glm" ? (
            <form
              className="asset-library-trellis-form"
              onSubmit={(event) => { event.preventDefault(); void createGlmProceduralAsset(); }}
            >
              <div className="asset-library-trellis-intro">
                <div>
                  <strong>Construct a procedural GLB with GLM 5.2</strong>
                  <small>GLM returns a constrained JSON build plan. MyWay validates it, compiles approved primitives into GLB, then runs Blender normalization, Spatial Geometry Profile v3, enrichment, and review.</small>
                </div>
                <button className="asset-library-button" data-primary="true" disabled={glmCreating || !glmConcept.trim()} type="submit">
                  {glmCreating ? "Designing and compiling asset…" : "Build GLM asset"}
                </button>
              </div>
              <div className="asset-library-trellis-fields">
                <label className="asset-library-trellis-wide">Object identity
                  <input aria-label="GLM object identity" disabled={glmCreating} onChange={(event) => setGlmConcept(event.target.value)} placeholder="For example: piston assembly" value={glmConcept} />
                </label>
                <label className="asset-library-trellis-wide">Construction details
                  <textarea aria-label="GLM construction details" disabled={glmCreating} onChange={(event) => setGlmDetails(event.target.value)} placeholder="cylindrical piston head, connecting rod, wrist pin, dark steel" rows={3} value={glmDetails} />
                </label>
                <label>Style
                  <input aria-label="GLM procedural style" disabled={glmCreating} onChange={(event) => setGlmStyle(event.target.value)} value={glmStyle} />
                </label>
                <label>Normalization extent (m)
                  <input aria-label="GLM normalization extent" disabled={glmCreating} min="0.05" onChange={(event) => setGlmTargetExtentM(event.target.value)} step="0.05" type="number" value={glmTargetExtentM} />
                </label>
              </div>
              <p className="asset-library-trellis-warning">Best for geometric, mechanical, furniture, toy-like, symbolic, and educational objects. Organic or photorealistic requests may produce stylized approximations and remain pending review.</p>
            </form>
          ) : manualAcquisitionMode === "cc_by" ? (
            <CcByBatchImportLab
              onImportComplete={(assetId) => {
                setSelectedAssetId(assetId);
                setReviewView("needs_review");
                setPromotionMessage(
                  `${assetId} was imported from a manually downloaded CC BY GLB and placed in Needs review.`,
                );
                setRefreshToken((value) => value + 1);
              }}
              onRunningChange={setCcByImporting}
            />
          ) : (
            <Cc0BatchImportLab
              onImportComplete={(assetId) => {
                setSelectedAssetId(assetId);
                setReviewView("needs_review");
                setPromotionMessage(
                  `${assetId} was imported from a manually downloaded CC0 GLB and placed in Needs review.`,
                );
                setRefreshToken((value) => value + 1);
              }}
              onRunningChange={setCc0Importing}
            />
          )}
        </section>

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
          <StatCard
            label="Identity verified"
            value={semanticVerifiedAssets}
            detail="Verified labels used by the resolver"
          />
          <StatCard
            label="Scene approved"
            value={sceneApprovedAssets}
            detail="Eligible after identity verification"
          />
        </section>


        <section
          className="asset-library-review-tabs"
          aria-label="Asset review queue"
        >
          {(
            [
              ["needs_review", "Needs review"],
              ["acquiring", "Acquiring"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
              ["all", "All assets"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className="asset-library-review-tab"
              data-active={
                reviewView === value
              }
              onClick={() =>
                setReviewView(value)
              }
              type="button"
            >
              <span>{label}</span>
              <strong>
                {acquisitionCounts[value]}
              </strong>
            </button>
          ))}
        </section>

        {reviewView === "acquiring" &&
        activeAcquisitionJobs.length ? (
          <section className="asset-library-acquisition-queue">
            <div className="asset-library-results-header">
              <span>
                Automatic missing-asset acquisition
              </span>
              <span>
                One job is shared by every scene that needs the same concept
              </span>
            </div>

            <div className="asset-library-acquisition-grid">
              {activeAcquisitionJobs.map(
                (job) => {
                  const busy =
                    acquisitionActionId ===
                    job.job_id;

                  return (
                    <article
                      className="asset-library-acquisition-card"
                      key={job.job_id}
                    >
                      <div>
                        <p className="asset-library-eyebrow">
                          {job.status.replaceAll(
                            "_",
                            " ",
                          )}
                        </p>
                        <h2>{job.concept}</h2>
                        <p>
                          Needed by{" "}
                          {job.linked_scene_count}{" "}
                          scene
                          {job.linked_scene_count === 1
                            ? ""
                            : "s"}
                          . Attempt{" "}
                          {job.attempt_count}.
                        </p>
                        {job.last_error ? (
                          <small>
                            {job.last_error}
                          </small>
                        ) : null}
                      </div>

                      <div className="asset-library-maintenance-actions">
                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={
                            busy ||
                            job.status ===
                              "searching_blenderkit"
                          }
                          onClick={() => {
                            void retryAcquisitionJob(
                              job,
                              "blenderkit",
                            );
                          }}
                          type="button"
                        >
                          {busy &&
                          acquisitionAction ===
                            "blenderkit"
                            ? "Searching BlendKit…"
                            : "Try BlendKit again"}
                        </button>
                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={
                            busy ||
                            job.status ===
                              "generating_trellis"
                          }
                          onClick={() => {
                            void retryAcquisitionJob(
                              job,
                              "trellis",
                            );
                          }}
                          type="button"
                        >
                          {busy &&
                          acquisitionAction ===
                            "trellis"
                            ? "Starting TRELLIS…"
                            : "Generate with TRELLIS"}
                        </button>
                        <button
                          className="asset-library-button"
                          data-danger="true"
                          disabled={busy}
                          onClick={() => {
                            void cancelAcquisitionJob(
                              job,
                            );
                          }}
                          type="button"
                        >
                          {busy &&
                          acquisitionAction ===
                            "remove"
                            ? "Cancelling…"
                            : "Cancel & remove need"}
                        </button>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          </section>
        ) : null}

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
            aria-label="Filter by scene review"
            onChange={(event) => setSceneReviewFilter(event.target.value)}
            value={sceneReviewFilter}
          >
            <option value="all">All scene reviews</option>
            {sceneReviewStatuses.map((status) => (
              <option key={status} value={status}>
                scene: {status}
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
                            {assetTitle(asset).slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="asset-library-card-body">
                        <div className="asset-library-card-title-row">
                          <h2>{assetTitle(asset)}</h2>
                          <span
                            className="asset-library-badge"
                            data-positive={asset.file_stats.exists}
                            data-warning={!asset.file_stats.exists}
                          >
                            {asset.file_stats.exists ? "file ready" : "missing"}
                          </span>
                        </div>

                        <p className="asset-library-card-source">
                          Source: {asset.source_display_name || asset.display_name}
                        </p>
                        <p className="asset-library-card-id">
                          ID: {asset.asset_id}
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
                          <span
                            className="asset-library-badge"
                            data-positive={
                              asset.scene_review_status === "approved"
                            }
                            data-warning={
                              asset.scene_review_status === "pending"
                            }
                          >
                            scene: {asset.scene_review_status}
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
                  <h2>{assetTitle(selectedAsset)}</h2>
                  <p className="asset-library-details-source">
                    Source: {selectedAsset.source_display_name || selectedAsset.display_name}
                  </p>
                  <p className="asset-library-details-id">
                    ID: {selectedAsset.asset_id}
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

                    <span
                      className="asset-library-badge"
                      data-positive={
                        selectedAsset.storage_provider ===
                        "r2"
                      }
                      data-warning={
                        selectedAsset.storage_provider !==
                        "r2"
                      }
                    >
                      {selectedAsset.storage_provider ===
                      "r2"
                        ? "Published Cloudflare R2"
                        : selectedAsset.storage_provider ===
                            "r2_private_pending"
                          ? "Private R2 review candidate"
                          : "Local candidate"}
                    </span>
                  </div>

                  <div className="asset-library-promotion-note">
                    Review the rotating model and verify its identity first.
                    One approval action now publishes eligible CC0 files to
                    Cloudflare R2 and approves them for automatic scene use.
                    Assets that are not cleared for runtime publication remain
                    private review candidates until their licence/provenance is updated.
                  </div>

                  {selectedAcquisitionJob ? (
                    <div className="asset-library-promotion-note">
                      <strong>
                        Needed by{" "}
                        {
                          selectedAcquisitionJob.linked_scene_count
                        }{" "}
                        scene
                        {selectedAcquisitionJob.linked_scene_count ===
                        1
                          ? ""
                          : "s"}
                        .
                      </strong>{" "}
                      Job status:{" "}
                      {selectedAcquisitionJob.status.replaceAll(
                        "_",
                        " ",
                      )}
                      . Approving this candidate makes every linked scene
                      refresh-ready.
                    </div>
                  ) : null}

                  <div className="asset-library-promotion-note">
                    Automatic matching uses the verified identity, not the
                    requested search phrase or technical asset ID.
                  </div>

                  {identityDraft ? (
                    <section className="asset-library-editor">
                      <div className="asset-library-section-heading">
                        <div>
                          <strong>MyWay identity</strong>
                          <small>
                            Source: {selectedAsset.source_display_name || selectedAsset.display_name}
                          </small>
                        </div>
                        <span className="asset-library-badge">
                          {selectedAsset.semantic_review_status}
                        </span>
                      </div>

                      <label className="asset-library-editor-wide">
                        Asset ID
                        <input
                          value={identityDraft.assetId}
                          onChange={(event) =>
                            setIdentityDraft((current) =>
                              current
                                ? { ...current, assetId: event.target.value }
                                : current,
                            )
                          }
                        />
                        <small className="asset-library-field-help">
                          Stable technical reference used by the registry and saved scenes.
                          It is not used to decide what the object is. Spaces are converted
                          to underscores when renamed.
                        </small>
                      </label>
                      <div className="asset-library-maintenance-actions asset-library-editor-wide">
                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={
                            maintenanceAssetId === selectedAsset.asset_id ||
                            enrichmentAssetId === selectedAsset.asset_id ||
                            identityDraft.assetId.trim() === selectedAsset.asset_id
                          }
                          onClick={() => void renameSelectedAssetId()}
                          type="button"
                        >
                          {maintenanceAction === "rename" &&
                          maintenanceAssetId === selectedAsset.asset_id
                            ? "Renaming asset ID…"
                            : "Rename asset ID"}
                        </button>
                      </div>

                      <label className="asset-library-editor-wide">
                        Canonical label
                        <input
                          value={identityDraft.canonicalLabel}
                          onChange={(event) =>
                            setIdentityDraft((current) =>
                              current
                                ? { ...current, canonicalLabel: event.target.value }
                                : current,
                            )
                          }
                        />
                        <small className="asset-library-field-help">
                          The verified human-readable identity used by automatic matching,
                          such as “cash register” or “book.” Updating it preserves the
                          imported source name and technical asset ID.
                        </small>
                      </label>
                      <div className="asset-library-maintenance-actions asset-library-editor-wide">
                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={
                            maintenanceAssetId === selectedAsset.asset_id ||
                            semanticReviewAssetId === selectedAsset.asset_id ||
                            !identityDraft.canonicalLabel.trim() ||
                            identityDraft.canonicalLabel.trim().toLowerCase().replace(/\s+/g, " ") ===
                              (selectedAsset.verified_canonical_label || selectedAsset.canonical_label)
                                .trim()
                                .toLowerCase()
                                .replace(/\s+/g, " ")
                          }
                          onClick={() => void updateSelectedCanonicalLabel()}
                          type="button"
                        >
                          {maintenanceAction === "canonical_label" &&
                          maintenanceAssetId === selectedAsset.asset_id
                            ? "Updating canonical label…"
                            : "Update canonical label"}
                        </button>
                      </div>
                      <label>
                        Aliases <small>comma separated</small>
                        <input
                          value={identityDraft.aliases}
                          onChange={(event) =>
                            setIdentityDraft((current) =>
                              current
                                ? { ...current, aliases: event.target.value }
                                : current,
                            )
                          }
                        />
                        <small className="asset-library-field-help">
                          Other names that mean the same object, such as “till” or
                          “checkout register.” Keep these when users may use different words.
                        </small>
                      </label>
                      <div className="asset-library-maintenance-actions">
                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={
                            maintenanceAssetId === selectedAsset.asset_id ||
                            semanticReviewAssetId === selectedAsset.asset_id
                          }
                          onClick={() => void updateSelectedAliases()}
                          type="button"
                        >
                          {maintenanceAction === "aliases" &&
                          maintenanceAssetId === selectedAsset.asset_id
                            ? "Updating aliases…"
                            : "Update aliases"}
                        </button>
                      </div>
                      <label className="asset-library-editor-wide">
                        Composition
                        <select
                          value={identityDraft.composition}
                          onChange={(event) =>
                            setIdentityDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    composition: event.target.value as IdentityDraft["composition"],
                                  }
                                : current,
                            )
                          }
                        >
                          <option value="single_object">single object</option>
                          <option value="object_set">object set</option>
                          <option value="environment_piece">environment piece</option>
                          <option value="unknown">unknown</option>
                        </select>
                        <small className="asset-library-field-help">
                          Whether the GLB is one reusable object, a bundled set of objects,
                          or part of an environment. This protects the resolver from using
                          an entire room when it needs one prop.
                        </small>
                      </label>

                      <details className="asset-library-editor-advanced asset-library-editor-wide">
                        <summary>Advanced matching metadata</summary>
                        <label>
                          Contains <small>comma separated</small>
                          <input
                            value={identityDraft.contains}
                            onChange={(event) =>
                              setIdentityDraft((current) =>
                                current
                                  ? { ...current, contains: event.target.value }
                                  : current,
                              )
                            }
                          />
                          <small className="asset-library-field-help">
                            Distinct visible objects bundled inside this asset, such as
                            “books” in a furnished bookshelf set. Leave blank for a normal
                            single object.
                          </small>
                        </label>
                        <label>
                          Affordances <small>comma separated</small>
                          <input
                            value={identityDraft.affordances}
                            onChange={(event) =>
                              setIdentityDraft((current) =>
                                current
                                  ? { ...current, affordances: event.target.value }
                                  : current,
                              )
                            }
                          />
                          <small className="asset-library-field-help">
                            What the object can meaningfully do or support, such as
                            “holds_objects,” “emits_light,” or “can_open.” These can become
                            hard gates when a scene explicitly requires the capability.
                          </small>
                        </label>
                        <label className="asset-library-editor-wide">
                          Preferred concepts <small>comma separated</small>
                          <input
                            value={identityDraft.preferredConcepts}
                            onChange={(event) =>
                              setIdentityDraft((current) =>
                                current
                                  ? { ...current, preferredConcepts: event.target.value }
                                  : current,
                              )
                            }
                          />
                          <small className="asset-library-field-help">
                            Strong manual resolver overrides. Usually leave this blank.
                            Add a concept only when this exact asset should consistently
                            win over other valid assets for that concept.
                          </small>
                        </label>
                      </details>
                      <label className="asset-library-editor-wide">
                        Review notes
                        <textarea
                          rows={3}
                          value={identityDraft.notes}
                          onChange={(event) =>
                            setIdentityDraft((current) =>
                              current
                                ? { ...current, notes: event.target.value }
                                : current,
                            )
                          }
                        />
                      </label>

                      <div className="asset-library-maintenance-actions asset-library-editor-wide">
                        <button
                          className="asset-library-button"
                          data-primary="true"
                          disabled={semanticReviewAssetId === selectedAsset.asset_id}
                          onClick={() => void saveSelectedSemanticIdentity("verified")}
                          type="button"
                        >
                          {semanticReviewAssetId === selectedAsset.asset_id
                            ? "Saving identity…"
                            : "Save identity & verify"}
                        </button>
                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={
                            semanticReviewAssetId === selectedAsset.asset_id ||
                            !selectedAsset.source_display_name
                          }
                          onClick={() =>
                            void saveSelectedSemanticIdentity("verified", {
                              useSourceName: true,
                            })
                          }
                          type="button"
                        >
                          Use source name
                        </button>
                        <button
                          className="asset-library-button"
                          data-danger="true"
                          disabled={semanticReviewAssetId === selectedAsset.asset_id}
                          onClick={() => void saveSelectedSemanticIdentity("mismatch")}
                          type="button"
                        >
                          Mark mismatch
                        </button>
                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={semanticReviewAssetId === selectedAsset.asset_id}
                          onClick={() => void saveSelectedSemanticIdentity("pending")}
                          type="button"
                        >
                          Return to pending
                        </button>
                      </div>
                      <small className="asset-library-editor-wide">
                        Save identity & verify stores the canonical label,
                        aliases, composition, contained objects, affordances,
                        preferred concepts, and review notes, then marks the
                        semantic identity as verified. It does not approve the
                        asset for automatic scenes; use the separate scene
                        approval button below after reviewing the model.
                      </small>
                    </section>
                  ) : null}

                  <section className="asset-library-appearance">
                    <div className="asset-library-section-heading">
                      <div>
                        <strong>Appearance &amp; style analysis</strong>
                        <small>Nemotron Nano 12B v2 VL · four standardized views</small>
                      </div>
                      <span
                        className="asset-library-badge"
                        data-positive={selectedAsset.appearance_profile?.status === "ready"}
                        data-warning={
                          selectedAsset.appearance_profile?.status === "pending" ||
                          selectedAsset.appearance_profile?.status === "rendering" ||
                          selectedAsset.appearance_profile?.status === "analyzing"
                        }
                      >
                        {selectedAsset.appearance_profile?.status ?? "pending"}
                      </span>
                    </div>

                    {selectedAsset.appearance_profile?.analysis_views.length ? (
                      <div className="asset-library-analysis-views">
                        {selectedAsset.appearance_profile.analysis_views.map((view) => (
                          <figure key={view.name}>
                            <img alt={`${assetTitle(selectedAsset)} ${view.name}`} src={view.public_path} />
                            <figcaption>{view.name.replaceAll("_", " ")}</figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : null}

                    <p>
                      {selectedAsset.appearance_profile?.summary ||
                        "No appearance analysis has been completed yet."}
                    </p>
                    {selectedAsset.appearance_profile?.error ? (
                      <p className="asset-library-error-inline">
                        {selectedAsset.appearance_profile.error}
                      </p>
                    ) : null}
                    {selectedAsset.appearance_profile?.status === "ready" ? (
                      <div className="asset-library-metadata">
                        <MetadataRow label="Style">
                          {(selectedAsset.appearance_profile.style_descriptors ?? []).length
                            ? selectedAsset.appearance_profile.style_descriptors.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Era / aesthetic">
                          {(selectedAsset.appearance_profile.design_era ?? []).length
                            ? selectedAsset.appearance_profile.design_era.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Realism">
                          {(selectedAsset.appearance_profile.realism_level ?? []).length
                            ? selectedAsset.appearance_profile.realism_level.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Shape language">
                          {(selectedAsset.appearance_profile.shape_language ?? []).length
                            ? selectedAsset.appearance_profile.shape_language.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Material treatment">
                          {(selectedAsset.appearance_profile.material_treatment ?? []).length
                            ? selectedAsset.appearance_profile.material_treatment.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Palette">
                          {(selectedAsset.appearance_profile.color_palette ?? []).length
                            ? selectedAsset.appearance_profile.color_palette.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Surface condition">
                          {(selectedAsset.appearance_profile.surface_condition ?? []).length
                            ? selectedAsset.appearance_profile.surface_condition.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Ornamentation">
                          {(selectedAsset.appearance_profile.ornamentation ?? []).length
                            ? selectedAsset.appearance_profile.ornamentation.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Visual mood">
                          {(selectedAsset.appearance_profile.visual_mood ?? []).length
                            ? selectedAsset.appearance_profile.visual_mood.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Detail level">
                          {(selectedAsset.appearance_profile.detail_level ?? []).length
                            ? selectedAsset.appearance_profile.detail_level.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                        <MetadataRow label="Visual scene fit">
                          {(selectedAsset.appearance_profile.scene_compatibility ?? []).length
                            ? selectedAsset.appearance_profile.scene_compatibility.join(", ")
                            : "Not confidently identified"}
                        </MetadataRow>
                      </div>
                    ) : null}
                    <details>
                      <summary>Supporting visible details</summary>
                      <div className="asset-library-badges">
                        {[
                          ...(selectedAsset.appearance_profile?.descriptors ?? []),
                          ...(selectedAsset.appearance_profile?.materials ?? []),
                          ...(selectedAsset.appearance_profile?.colors ?? []),
                          ...(selectedAsset.appearance_profile?.geometry ?? []),
                        ].map((value, index) => (
                          <span className="asset-library-badge" key={`${value}-${index}`}>{value}</span>
                        ))}
                      </div>
                    </details>
                    <div className="asset-library-maintenance-actions">
                      <button
                        className="asset-library-button"
                        data-secondary="true"
                        disabled={geometryAssetId === selectedAsset.asset_id}
                        onClick={() => void runGeometryAction("selected")}
                        type="button"
                      >
                        {geometryAssetId === selectedAsset.asset_id
                          ? "Profiling geometry…"
                          : "Profile selected geometry"}
                      </button>
                      <button
                        className="asset-library-button"
                        data-primary="true"
                        disabled={enrichmentAssetId === selectedAsset.asset_id}
                        onClick={() => void runEnrichmentAction("enrich_asset")}
                        type="button"
                      >
                        {enrichmentAssetId === selectedAsset.asset_id
                          ? "Queueing analysis…"
                          : selectedAsset.appearance_profile?.status === "ready"
                            ? "Re-analyze asset"
                            : "Analyze asset"}
                      </button>
                      <button
                        className="asset-library-button"
                        data-secondary="true"
                        disabled={enrichmentAssetId === "backfill"}
                        onClick={() => void runEnrichmentAction("backfill_next")}
                        type="button"
                      >
                        {enrichmentAssetId === "backfill"
                          ? "Queueing next…"
                          : "Analyze next pending asset"}
                      </button>
                    </div>
                    <small>
                      Embedding: {selectedAsset.appearance_embedding?.status ?? "pending"}
                      {selectedAsset.appearance_embedding?.dimensions
                        ? ` · ${selectedAsset.appearance_embedding.dimensions} dimensions`
                        : ""}
                      {selectedAsset.appearance_embedding?.model
                        ? ` · ${selectedAsset.appearance_embedding.model}`
                        : ""}
                    </small>
                  </section>

                  <div className="asset-library-maintenance-actions">
                    <button
                      className="asset-library-button"
                      data-primary="true"
                      disabled={
                        acquisitionActionId ===
                          selectedAsset.asset_id ||
                        (selectedAsset.scene_review_status ===
                          "approved" &&
                          !(
                            selectedAsset.storage_provider !==
                              "r2" &&
                            isManualPublicSceneCandidate(
                              selectedAsset,
                            )
                          )) ||
                        (selectedAsset.storage_provider ===
                          "r2_private_pending" &&
                          !selectedAsset.safe_to_promote_to_app &&
                          !isManualPublicSceneCandidate(
                            selectedAsset,
                          )) ||
                        !selectedAsset.file_stats.exists ||
                        !selectedAsset.safe_to_use_in_sandbox ||
                        selectedAsset.status ===
                          "rejected" ||
                        selectedAsset.semantic_review_status !==
                          "verified"
                      }
                      onClick={() => {
                        void approveSelectedAsset();
                      }}
                      type="button"
                    >
                      {acquisitionActionId ===
                        selectedAsset.asset_id &&
                      acquisitionAction === "approve"
                        ? "Approving and publishing…"
                        : selectedAsset.storage_provider ===
                            "r2"
                          ? "Approve for scene use"
                          : isManualPublicSceneCandidate(
                                selectedAsset,
                              )
                            ? "Approve for scene use"
                            : selectedAsset.safe_to_promote_to_app
                              ? "Approve & publish"
                              : selectedAsset.storage_provider ===
                                  "r2_private_pending"
                                ? "Awaiting licence clearance"
                                : "Approve for local scene"}
                    </button>

                    {selectedAcquisitionJob &&
                    selectedAcquisitionJob.status !==
                      "approved" ? (
                      <>
                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={
                            acquisitionActionId ===
                            selectedAsset.asset_id
                          }
                          onClick={() => {
                            void retrySelectedCandidate(
                              "blenderkit",
                            );
                          }}
                          type="button"
                        >
                          {acquisitionActionId ===
                            selectedAsset.asset_id &&
                          acquisitionAction ===
                            "blenderkit"
                            ? "Starting another BlendKit search…"
                            : "Try another BlenderKit asset"}
                        </button>

                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={
                            acquisitionActionId ===
                            selectedAsset.asset_id
                          }
                          onClick={() => {
                            void retrySelectedCandidate(
                              "trellis",
                            );
                          }}
                          type="button"
                        >
                          {acquisitionActionId ===
                            selectedAsset.asset_id &&
                          acquisitionAction ===
                            "trellis"
                            ? "Starting TRELLIS…"
                            : "Generate with TRELLIS instead"}
                        </button>

                        <button
                          className="asset-library-button"
                          data-danger="true"
                          disabled={
                            acquisitionActionId ===
                            selectedAsset.asset_id
                          }
                          onClick={() => {
                            void removeSelectedNeedsReviewCandidate();
                          }}
                          type="button"
                        >
                          {acquisitionActionId ===
                            selectedAsset.asset_id &&
                          acquisitionAction ===
                            "remove"
                            ? "Rejecting and removing…"
                            : "Reject & remove candidate"}
                        </button>
                      </>
                    ) : null}
                  </div>

                  {!selectedAcquisitionJob ? (
                    <div className="asset-library-maintenance-actions">
                      <button
                        className="asset-library-button"
                        data-danger="true"
                        disabled={
                          maintenanceAssetId === selectedAsset.asset_id
                        }
                        onClick={() => {
                          void removeSelectedAsset();
                        }}
                        type="button"
                      >
                        {maintenanceAction === "remove" &&
                        maintenanceAssetId === selectedAsset.asset_id
                          ? "Removing asset…"
                          : "Remove from library"}
                      </button>

                      <button
                        className="asset-library-button"
                        data-secondary="true"
                        disabled={
                          maintenanceAssetId === selectedAsset.asset_id ||
                          selectedAsset.storage_provider === "r2" ||
                          Boolean(selectedAsset.promoted_at)
                        }
                        onClick={() => {
                          void editSelectedAssetProvenance();
                        }}
                        type="button"
                      >
                        {maintenanceAction === "provenance" &&
                        maintenanceAssetId === selectedAsset.asset_id
                          ? "Updating licence and source…"
                          : "Edit licence and source"}
                      </button>

                      <button
                        className="asset-library-button"
                        data-secondary="true"
                        disabled={
                          maintenanceAssetId === selectedAsset.asset_id
                        }
                        onClick={() => {
                          void createReplacement("blenderkit");
                        }}
                        type="button"
                      >
                        {maintenanceAction === "blenderkit" &&
                        maintenanceAssetId === selectedAsset.asset_id
                          ? "Searching BlendKit…"
                          : "Find different CC0 BlenderKit asset"}
                      </button>

                      {selectedAsset.source_type === "trellis" ? (
                        <button
                          className="asset-library-button"
                          data-secondary="true"
                          disabled={
                            maintenanceAssetId === selectedAsset.asset_id
                          }
                          onClick={() => {
                            void createReplacement("trellis");
                          }}
                          type="button"
                        >
                          {maintenanceAction === "trellis" &&
                          maintenanceAssetId === selectedAsset.asset_id
                            ? "Generating improved TRELLIS asset…"
                            : "Generate better TRELLIS version"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="asset-library-metadata">
                    <MetadataRow label="Requested concept">
                      {selectedAsset.requested_concept ||
                        selectedAsset.canonical_label}
                    </MetadataRow>
                    <MetadataRow label="Source name">
                      {selectedAsset.source_display_name ||
                        selectedAsset.display_name}
                    </MetadataRow>
                    <MetadataRow label="Verified identity">
                      {selectedAsset.verified_canonical_label ||
                        "Not verified"}
                    </MetadataRow>
                    <MetadataRow label="Semantic review">
                      {selectedAsset.semantic_review_status}
                      {selectedAsset.semantic_reviewed_at
                        ? ` · ${formatDate(
                            selectedAsset.semantic_reviewed_at,
                          )}`
                        : ""}
                    </MetadataRow>
                    <MetadataRow label="Verified aliases">
                      {Array.from(
                        new Set([
                          ...(selectedAsset.verified_aliases ?? []),
                          ...selectedAsset.aliases,
                        ]),
                      ).length
                        ? Array.from(
                            new Set([
                              ...(selectedAsset.verified_aliases ?? []),
                              ...selectedAsset.aliases,
                            ]),
                          ).join(", ")
                        : "None"}
                    </MetadataRow>
                    <MetadataRow label="Composition">
                      {selectedAsset.object_composition}
                    </MetadataRow>
                    <MetadataRow label="Contains">
                      {(selectedAsset.contains ?? []).length
                        ? selectedAsset.contains!.join(", ")
                        : "None recorded"}
                    </MetadataRow>
                    <MetadataRow label="Affordances">
                      {(selectedAsset.affordances ?? []).length
                        ? selectedAsset.affordances!.join(", ")
                        : "None recorded"}
                    </MetadataRow>
                    <MetadataRow label="Preferred concepts">
                      {(selectedAsset.preferred_for_concepts ?? []).length
                        ? selectedAsset.preferred_for_concepts!.join(", ")
                        : "None"}
                    </MetadataRow>
                    <MetadataRow label="Source">
                      {sourceLabel(selectedAsset.source_type)}
                    </MetadataRow>
                    <MetadataRow label="Status">
                      {selectedAsset.status}
                    </MetadataRow>
                    <MetadataRow label="Scene review">
                      {selectedAsset.scene_review_status}
                      {selectedAsset.scene_reviewed_at
                        ? ` · ${formatDate(selectedAsset.scene_reviewed_at)}`
                        : ""}
                    </MetadataRow>
                    <MetadataRow label="Scene review notes">
                      {selectedAsset.scene_review_notes || "None"}
                    </MetadataRow>
                    <MetadataRow label="License">
                      {selectedAsset.attribution?.license_name ||
                        selectedAsset.license_kind} ·{" "}
                      {selectedAsset.license_status}
                    </MetadataRow>
                    <MetadataRow label="Attribution">
                      {selectedAsset.attribution?.required
                        ? selectedAsset.attribution.text || "Missing required credit"
                        : "Not required"}
                    </MetadataRow>
                    <MetadataRow label="Creator">
                      {selectedAsset.attribution?.creator_name || "Not recorded"}
                    </MetadataRow>
                    <MetadataRow label="Source provider">
                      {selectedAsset.attribution?.source_provider || "Not recorded"}
                    </MetadataRow>
                    <MetadataRow label="Source asset ID">
                      {selectedAsset.attribution?.source_asset_id ||
                        selectedAsset.source_asset_id ||
                        "Not recorded"}
                    </MetadataRow>
                    <MetadataRow label="Source page">
                      {selectedAsset.attribution?.source_url ||
                      selectedAsset.source_url ? (
                        <a
                          href={
                            selectedAsset.attribution?.source_url ||
                            selectedAsset.source_url ||
                            "#"
                          }
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open source page
                        </a>
                      ) : (
                        "Not recorded"
                      )}
                    </MetadataRow>
                    <MetadataRow label="Modification notice">
                      {selectedAsset.attribution?.modification_notice ||
                        "Not recorded"}
                    </MetadataRow>
                    <MetadataRow label="Downloaded">
                      {selectedAsset.attribution?.downloaded_at || "Not recorded"}
                    </MetadataRow>
                    <MetadataRow label="Credit exports">
                      <span>
                        <a
                          href={`/api/sandbox/probe-lab/assets/attributions?asset_ids=${encodeURIComponent(
                            selectedAsset.asset_id,
                          )}`}
                          target="_blank"
                        >
                          JSON
                        </a>{" "}
                        ·{" "}
                        <a
                          href={`/api/sandbox/probe-lab/assets/attributions?format=text&asset_ids=${encodeURIComponent(
                            selectedAsset.asset_id,
                          )}`}
                        >
                          THIRD_PARTY_LICENSES.txt
                        </a>
                      </span>
                    </MetadataRow>
                    <MetadataRow label="Storage">
                      {selectedAsset.storage_provider === "r2"
                        ? "Published Cloudflare R2"
                        : selectedAsset.storage_provider ===
                            "r2_private_pending"
                          ? "Private R2 review candidate"
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
                    <MetadataRow label="Spatial profile">
                      {selectedAsset.geometry_profile
                        ? `${selectedAsset.geometry_profile.generator} · ${
                            selectedAsset.geometry_profile.support_surfaces.length
                          } support · ${
                            selectedAsset.geometry_profile.interior_volumes?.length ?? 0
                          } containment · ${
                            selectedAsset.geometry_profile.attachment_regions?.length ?? 0
                          } attachment · ${Math.round(
                            (selectedAsset.geometry_profile.audit?.confidence ?? 0) * 100,
                          )}% audit confidence`
                        : "Not measured yet"}
                    </MetadataRow>
                    <MetadataRow label="Geometry audit">
                      {selectedAsset.geometry_profile?.audit
                        ? `${selectedAsset.geometry_profile.audit.status.replaceAll(
                            "_",
                            " ",
                          )}${
                            selectedAsset.geometry_profile.audit.warnings.length
                              ? ` · ${selectedAsset.geometry_profile.audit.warnings.join(
                                  "; ",
                                )}`
                              : " · no warnings"
                          }`
                        : "Pending backfill"}
                    </MetadataRow>
                    <MetadataRow label="Measured bounds">
                      {selectedAsset.geometry_profile
                        ? `${formatDimensions(
                            selectedAsset.geometry_profile.local_bounds.size,
                          )} m`
                        : "Not available"}
                    </MetadataRow>
                    <MetadataRow label="Support surfaces">
                      {(selectedAsset.support_surfaces ?? []).length
                        ? selectedAsset.support_surfaces!
                            .map(
                              (surface) =>
                                `${surface.label} (${Math.round(
                                  surface.confidence * 100,
                                )}% ${surface.source}${
                                  surface.exposure
                                    ? ` · ${surface.exposure}`
                                    : ""
                                }${
                                  surface.openness
                                    ? ` · ${surface.openness}`
                                    : ""
                                }${
                                  surface.clearance_above_m == null
                                    ? ""
                                    : ` · ${surface.clearance_above_m.toFixed(2)} m clearance`
                                })`,
                            )
                            .join(", ")
                        : "None persisted yet"}
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
                        ...(selectedAsset.appearance_profile?.descriptors ?? []),
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
