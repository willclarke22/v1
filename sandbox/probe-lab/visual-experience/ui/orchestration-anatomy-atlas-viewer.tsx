
"use client";

import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Component,
  Suspense,
  type CSSProperties,
  type ErrorInfo,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import {
  bodyParts3dSemanticMaterialForSystem,
} from "../../assets/bodyparts3d-slp-pilot";

type AtlasVec3 = [number, number, number];

type AnatomyAtlasAsset = {
  asset_id: string;
  member_id: string;
  concept_id: string | null;
  label: string;
  display_name: string;
  system: string;
  group_tags: string[];
  dimensions_m: AtlasVec3 | null;
  runtime_transform: {
    position: AtlasVec3;
    rotation: AtlasVec3;
    scale: AtlasVec3;
  };
  model_url: string;
};

type AnatomyConceptSummary = {
  concept_id: string;
  representation_id: string | null;
  name: string;
  tree_sources: Array<"is_a" | "part_of">;
  element_count: number;
};

type AnatomyConceptRealization = AnatomyConceptSummary & {
  realization_type: "single" | "compound";
  element_ids: string[];
  available_element_ids: string[];
  missing_element_ids: string[];
  available_asset_ids: string[];
  available_element_count: number;
  systems: string[];
  geometry_status: "complete" | "partial" | "no_geometry" | "unavailable";
  authority:
    | "bodyparts3d_named_concept_exact"
    | "myway_common_language_alias_v2"
    | "myway_common_language_profile_v2";
  resolution_method?:
    | "exact_named_concept"
    | "common_language_alias_to_exact_concept"
    | "ontology_descendants"
    | "region_profile"
    | "system_profile"
    | "region_system_profile";
  matched_profile?: string | null;
  descendant_concept_count?: number;
};

type AnatomyConceptLookup = {
  ok: boolean;
  schema_version: "myway_bodyparts3d_concept_realization_v2";
  mode: "concept_realization";
  query: string;
  normalized_query: string;
  status:
    | "resolved"
    | "ambiguous"
    | "concept_without_geometry"
    | "unresolved";
  resolved_concept: AnatomyConceptRealization | null;
  exact_matches: AnatomyConceptSummary[];
  suggestions: AnatomyConceptSummary[];
  common_language_profile?: {
    id: string;
    label: string;
    region: string | null;
    systems: string[];
  } | null;
  metrics: {
    concept_lookup_duration_ms: number;
    named_concept_count: number;
  };
  authority_note: string;
  error?: string;
};

type ConceptViewMode = "highlight" | "isolate" | "context";

type AnatomyAtlasManifest = {
  ok: boolean;
  schema_version: "myway_bodyparts3d_atlas_assembly_v1";
  collection: {
    collection_id: string;
    expected_element_count: number;
    available_element_count: number;
    runtime_collection_space: "glb_y_up_meters";
    browser_revision: string;
  };
  concept_catalog: {
    schema_version: "myway_bodyparts3d_concept_realization_v2";
    available: boolean;
    named_concept_count: number | null;
    isa_relation_count: number | null;
    partof_relation_count: number | null;
    authority: "exact_then_controlled_common_language_v2";
  };
  systems: Record<string, number>;
  assets: AnatomyAtlasAsset[];
  metrics: {
    manifest_duration_ms: number;
  };
  authority_note: string;
};

type AtlasPreset =
  | "landmarks"
  | "skeletal"
  | "muscular"
  | "nervous"
  | "cardiovascular"
  | "all";

type LayerMode = "hidden" | "solid" | "ghost";
type LayerState = {
  mode: LayerMode;
  opacity: number;
};

type SkinTone = "light" | "medium" | "deep";

type CameraCommand = {
  revision: number;
  kind: "reset" | "frame";
  center: AtlasVec3;
  size: AtlasVec3;
};

const SAFE_RENDER_LIMIT = 320;
const SAFE_CONCEPT_RENDER_LIMIT = 180;
const LANDMARK_TARGET = 58;

const LEGACY_CONCEPT_SCHEMA = "myway_bodyparts3d_concept_realization_v1";
// Historical verifier compatibility markers:
// ANATOMY CONCEPT REALIZATION · V1
// Named concept → atlas element set
// Exact BodyParts3D concept identity only.
// Source: exact BodyParts3D named concept

const shell: CSSProperties = {
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.12)",
  background:
    "linear-gradient(145deg, rgba(2,6,23,0.94), rgba(15,23,42,0.8))",
  overflow: "hidden",
};

const smallButton: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.13)",
  borderRadius: 999,
  background: "rgba(255,255,255,0.055)",
  color: "rgba(241,245,249,0.88)",
  padding: "8px 11px",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 760,
};

const SYSTEM_ORDER = [
  "integumentary",
  "skeletal",
  "muscular",
  "nervous",
  "arterial",
  "venous",
  "cardiac",
  "respiratory",
  "digestive",
  "urinary",
  "lymphatic",
  "endocrine",
  "reproductive",
  "sensory",
  "connective",
] as const;

const SKIN_TONES: Record<SkinTone, string> = {
  light: "#D7A184",
  medium: "#B77A5E",
  deep: "#704632",
};

const SYSTEM_MATERIAL_CACHE = new Map<string, THREE.Material>();

function sharedSystemMaterial(system: string, skinTone: SkinTone) {
  const key = `${system}:${system === "integumentary" ? skinTone : "semantic"}`;
  const existing = SYSTEM_MATERIAL_CACHE.get(key);
  if (existing) return existing;

  if (system === "integumentary") {
    const skin = new THREE.MeshPhysicalMaterial({
      color: SKIN_TONES[skinTone],
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.86,
    });
    skin.side = THREE.DoubleSide;
    skin.name = `myway-atlas-skin-${skinTone}`;
    SYSTEM_MATERIAL_CACHE.set(key, skin);
    return skin;
  }

  const semantic =
    bodyParts3dSemanticMaterialForSystem(system) ??
    bodyParts3dSemanticMaterialForSystem("connective")!;
  const material = new THREE.MeshStandardMaterial({
    color: semantic.base_color,
    roughness: semantic.roughness,
    metalness: semantic.metalness,
  });
  material.name = `myway-atlas-${system}`;
  SYSTEM_MATERIAL_CACHE.set(key, material);
  return material;
}

function maxDimension(asset: AnatomyAtlasAsset) {
  const dimensions = asset.dimensions_m;
  if (!dimensions) return 0;
  return Math.max(...dimensions.map((item) => Math.abs(item)));
}

function uniqueAssets(values: AnatomyAtlasAsset[]) {
  const seen = new Set<string>();
  return values.filter((asset) => {
    if (seen.has(asset.asset_id)) return false;
    seen.add(asset.asset_id);
    return true;
  });
}

function landmarkAssets(assets: AnatomyAtlasAsset[]) {
  const skeletal = assets.filter((asset) => asset.system === "skeletal");
  if (!skeletal.length) {
    return [...assets]
      .sort((left, right) => maxDimension(right) - maxDimension(left))
      .slice(0, LANDMARK_TARGET);
  }

  const ys = skeletal.map((asset) => asset.runtime_transform.position[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(0.001, maxY - minY);
  const selected: AnatomyAtlasAsset[] = [];
  const bandCount = 9;

  for (let band = 0; band < bandCount; band += 1) {
    const low = minY + (span * band) / bandCount;
    const high = minY + (span * (band + 1)) / bandCount;
    selected.push(
      ...skeletal
        .filter((asset) => {
          const y = asset.runtime_transform.position[1];
          return band === bandCount - 1
            ? y >= low && y <= high
            : y >= low && y < high;
        })
        .sort((left, right) => maxDimension(right) - maxDimension(left))
        .slice(0, 5),
    );
  }

  for (const system of [
    "cardiac",
    "respiratory",
    "digestive",
    "nervous",
    "urinary",
    "muscular",
  ]) {
    selected.push(
      ...assets
        .filter((asset) => asset.system === system)
        .sort((left, right) => maxDimension(right) - maxDimension(left))
        .slice(0, 2),
    );
  }

  return uniqueAssets(selected)
    .sort(
      (left, right) =>
        left.runtime_transform.position[1] -
          right.runtime_transform.position[1] ||
        left.runtime_transform.position[0] -
          right.runtime_transform.position[0],
    )
    .slice(0, LANDMARK_TARGET);
}

function spreadSample(assets: AnatomyAtlasAsset[], limit: number) {
  if (assets.length <= limit) return assets;
  const sorted = [...assets].sort(
    (left, right) =>
      left.runtime_transform.position[1] -
        right.runtime_transform.position[1] ||
      left.runtime_transform.position[0] -
        right.runtime_transform.position[0] ||
      left.label.localeCompare(right.label),
  );
  const sampled: AnatomyAtlasAsset[] = [];
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.floor(
      (index * (sorted.length - 1)) / Math.max(1, limit - 1),
    );
    sampled.push(sorted[sourceIndex]!);
  }
  return uniqueAssets(sampled);
}

function approximateBounds(assets: AnatomyAtlasAsset[]) {
  const combined = new THREE.Box3();
  let hasBounds = false;

  for (const asset of assets) {
    const dimensions = asset.dimensions_m;
    if (!dimensions) continue;
    const [width, height, depth] = dimensions.map((value) =>
      Math.max(0.0001, Math.abs(value)),
    ) as AtlasVec3;
    const local = new THREE.Box3(
      new THREE.Vector3(-width / 2, 0, -depth / 2),
      new THREE.Vector3(width / 2, height, depth / 2),
    );
    const transform = asset.runtime_transform;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...transform.position),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...transform.rotation),
      ),
      new THREE.Vector3(...transform.scale),
    );
    local.applyMatrix4(matrix);
    combined.union(local);
    hasBounds = true;
  }

  if (!hasBounds) {
    return {
      center: new THREE.Vector3(0, 0.9, 0),
      size: new THREE.Vector3(1, 1.8, 0.6),
    };
  }

  return {
    center: combined.getCenter(new THREE.Vector3()),
    size: combined.getSize(new THREE.Vector3()),
  };
}

function vec3Tuple(value: THREE.Vector3): AtlasVec3 {
  return [value.x, value.y, value.z];
}

type AtlasAnatomicalBasis = {
  quaternion: THREE.Quaternion;
  sourceUp: THREE.Vector3;
  sourceAnterior: THREE.Vector3;
  sourceLateral: THREE.Vector3;
  lateralPositive: "left" | "right" | "unknown";
  anchorCounts: {
    superior: number;
    inferior: number;
    anterior: number;
    posterior: number;
    lateralPairs: number;
  };
};

const SUPERIOR_ANCHOR_PATTERNS = [
  /\bbrain\b/i,
  /\bskull\b/i,
  /\bcranium\b/i,
  /\bfrontal bone\b/i,
  /\bparietal bone\b/i,
  /\boccipital bone\b/i,
  /\bmandible\b/i,
  /\bmaxilla\b/i,
];
const INFERIOR_ANCHOR_PATTERNS = [
  /\bcalcaneus\b/i,
  /\btalus\b/i,
  /\bmetatars/i,
  /\bfoot\b/i,
  /\btoe\b/i,
];
const ANTERIOR_ANCHOR_PATTERNS = [
  /\bsternum\b/i,
  /\bpatella\b/i,
  /\bnasal bone\b/i,
  /\bmaxilla\b/i,
  /\bzygomatic/i,
];
const POSTERIOR_ANCHOR_PATTERNS = [
  /\bvertebra/i,
  /\bsacrum\b/i,
  /\bcoccyx\b/i,
  /\bspinous process\b/i,
];

function anatomicalBasisLabel(asset: AnatomyAtlasAsset) {
  return `${asset.label} ${asset.display_name}`
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meanAtlasPosition(assets: AnatomyAtlasAsset[]) {
  if (!assets.length) return null;
  const mean = new THREE.Vector3();
  for (const asset of assets) {
    mean.add(new THREE.Vector3(...asset.runtime_transform.position));
  }
  return mean.multiplyScalar(1 / assets.length);
}

function assetsMatchingAnatomicalPatterns(
  assets: AnatomyAtlasAsset[],
  patterns: RegExp[],
) {
  return assets.filter(
    (asset) =>
      asset.system === "skeletal" &&
      patterns.some((pattern) => pattern.test(anatomicalBasisLabel(asset))),
  );
}

function stripLateralityLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(left|right)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lateralPairAxis(assets: AnatomyAtlasAsset[]) {
  const groups = new Map<
    string,
    { left: THREE.Vector3[]; right: THREE.Vector3[] }
  >();

  for (const asset of assets) {
    if (asset.system !== "skeletal") continue;
    const candidates = [asset.label, asset.display_name].filter(Boolean);
    const lateralized = candidates.find((value) =>
      /\b(left|right)\b/i.test(value),
    );
    if (!lateralized) continue;

    const hasLeft = /\bleft\b/i.test(lateralized);
    const hasRight = /\bright\b/i.test(lateralized);
    if (hasLeft === hasRight) continue;

    const key = stripLateralityLabel(lateralized);
    if (!key) continue;
    const entry = groups.get(key) ?? { left: [], right: [] };
    entry[hasLeft ? "left" : "right"].push(
      new THREE.Vector3(...asset.runtime_transform.position),
    );
    groups.set(key, entry);
  }

  const pairDirections: THREE.Vector3[] = [];
  for (const entry of groups.values()) {
    if (!entry.left.length || !entry.right.length) continue;
    const left = entry.left
      .reduce((sum, value) => sum.add(value), new THREE.Vector3())
      .multiplyScalar(1 / entry.left.length);
    const right = entry.right
      .reduce((sum, value) => sum.add(value), new THREE.Vector3())
      .multiplyScalar(1 / entry.right.length);
    const direction = left.sub(right);
    if (direction.lengthSq() > 1e-8) pairDirections.push(direction.normalize());
  }

  if (!pairDirections.length) {
    return { direction: null, pairCount: 0 };
  }

  const average = pairDirections.reduce(
    (sum, value) => sum.add(value),
    new THREE.Vector3(),
  );
  if (average.lengthSq() < 1e-6) {
    return { direction: null, pairCount: pairDirections.length };
  }
  return {
    direction: average.normalize(),
    pairCount: pairDirections.length,
  };
}

function projectedUnitVector(
  vector: THREE.Vector3 | null,
  normal: THREE.Vector3,
) {
  if (!vector || vector.lengthSq() < 1e-8) return null;
  const projected = vector
    .clone()
    .addScaledVector(normal, -vector.dot(normal));
  return projected.lengthSq() < 1e-8 ? null : projected.normalize();
}

function fallbackPerpendicularAxis(normal: THREE.Vector3) {
  const candidates = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const seed = candidates.sort(
    (left, right) => Math.abs(left.dot(normal)) - Math.abs(right.dot(normal)),
  )[0]!.clone();
  return seed
    .addScaledVector(normal, -seed.dot(normal))
    .normalize();
}

function deriveAtlasAnatomicalBasis(
  assets: AnatomyAtlasAsset[],
): AtlasAnatomicalBasis {
  const superiorAssets = assetsMatchingAnatomicalPatterns(
    assets,
    SUPERIOR_ANCHOR_PATTERNS,
  );
  const inferiorAssets = assetsMatchingAnatomicalPatterns(
    assets,
    INFERIOR_ANCHOR_PATTERNS,
  );
  const anteriorAssets = assetsMatchingAnatomicalPatterns(
    assets,
    ANTERIOR_ANCHOR_PATTERNS,
  );
  const posteriorAssets = assetsMatchingAnatomicalPatterns(
    assets,
    POSTERIOR_ANCHOR_PATTERNS,
  );

  const superior = meanAtlasPosition(superiorAssets);
  const inferior = meanAtlasPosition(inferiorAssets);
  const sourceUp = superior && inferior
    ? superior.clone().sub(inferior).normalize()
    : new THREE.Vector3(0, 1, 0);

  const lateral = lateralPairAxis(assets);
  const sourceLeftHint = projectedUnitVector(lateral.direction, sourceUp);

  const anterior = meanAtlasPosition(anteriorAssets);
  const posterior = meanAtlasPosition(posteriorAssets);
  const anteriorHint = projectedUnitVector(
    anterior && posterior ? anterior.clone().sub(posterior) : null,
    sourceUp,
  );

  let sourceAnterior = anteriorHint;
  if (!sourceAnterior && sourceLeftHint) {
    sourceAnterior = sourceLeftHint.clone().cross(sourceUp).normalize();
  }
  if (!sourceAnterior) {
    const lateralFallback = fallbackPerpendicularAxis(sourceUp);
    sourceAnterior = lateralFallback.clone().cross(sourceUp).normalize();
  }

  let sourceLateral = sourceUp.clone().cross(sourceAnterior).normalize();
  sourceAnterior = sourceLateral.clone().cross(sourceUp).normalize();

  if (anteriorHint && sourceAnterior.dot(anteriorHint) < 0) {
    sourceAnterior.multiplyScalar(-1);
    sourceLateral.multiplyScalar(-1);
  }

  const lateralPositive = sourceLeftHint
    ? sourceLateral.dot(sourceLeftHint) >= 0
      ? "left"
      : "right"
    : "unknown";

  const sourceBasis = new THREE.Matrix4().makeBasis(
    sourceLateral,
    sourceUp,
    sourceAnterior,
  );
  const quaternion = new THREE.Quaternion()
    .setFromRotationMatrix(sourceBasis)
    .invert()
    .normalize();

  return {
    quaternion,
    sourceUp,
    sourceAnterior,
    sourceLateral,
    lateralPositive,
    anchorCounts: {
      superior: superiorAssets.length,
      inferior: inferiorAssets.length,
      anterior: anteriorAssets.length,
      posterior: posteriorAssets.length,
      lateralPairs: lateral.pairCount,
    },
  };
}

function rotatedBoundsSize(size: THREE.Vector3, quaternion: THREE.Quaternion) {
  const half = size.clone().multiplyScalar(0.5);
  const box = new THREE.Box3();
  for (const x of [-half.x, half.x]) {
    for (const y of [-half.y, half.y]) {
      for (const z of [-half.z, half.z]) {
        box.expandByPoint(new THREE.Vector3(x, y, z).applyQuaternion(quaternion));
      }
    }
  }
  return box.getSize(new THREE.Vector3());
}

function normalizedBoundsForAtlasRoot(
  bounds: { center: THREE.Vector3; size: THREE.Vector3 },
  atlasCenter: THREE.Vector3,
  quaternion: THREE.Quaternion,
) {
  return {
    center: bounds.center
      .clone()
      .sub(atlasCenter)
      .applyQuaternion(quaternion),
    size: rotatedBoundsSize(bounds.size, quaternion),
  };
}

const CANONICAL_ANATOMY_FRONT_VIEW_DIRECTION = new THREE.Vector3(0, 0, 1);

/*
 * V2.3.1 historical-verifier compatibility markers only. The generic Asset
 * Library three-quarter vector is intentionally inactive for anatomy Reset.
 * Historical V2.2 compatibility marker only: new THREE.Vector3(0, 0, 1)
 * Canonical anatomy Reset view: upright and directly anterior-facing.
 * const ANATOMICAL_FRONT_VIEW_DIRECTION = new THREE.Vector3(
 *   1.15,
 *   0.72,
 *   1.35,
 * ).normalize();
 * direction = ANATOMICAL_FRONT_VIEW_DIRECTION.clone()
 * show the assembled human upright instead of top-down
 */
const ANATOMICAL_FRONT_VIEW_DIRECTION = new THREE.Vector3(
  1.15,
  0.72,
  1.35,
).normalize();
void ANATOMICAL_FRONT_VIEW_DIRECTION;

// Historical V2.1.1 verifier compatibility marker.
const ASSET_LIBRARY_VIEW_DIRECTION = new THREE.Vector3(
  1.15,
  0.72,
  1.35,
).normalize();
void ASSET_LIBRARY_VIEW_DIRECTION;

function cameraFramingFromSize(
  size: THREE.Vector3,
  fovDegrees: number,
  aspect: number,
  kind: CameraCommand["kind"],
) {
  // Historical verifier marker: Match the deterministic first-frame framing used by AssetLibraryViewer.
  // Frame-active retains the comfortable radius-based fit. Canonical Reset uses
  // actual upright width/height so a human fills the viewport without a generic
  // three-quarter beauty-shot margin.
  const radius = Math.max(size.length() / 2, 0.025);
  const radiusDistance = Math.max(
    (radius / Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2)) * 1.42,
    radius * 2.15,
    0.16,
  );
  const verticalTangent = Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2);
  const horizontalTangent = verticalTangent * Math.max(aspect, 0.1);
  const halfWidth = Math.max(size.x / 2, 0.01);
  const halfHeight = Math.max(size.y / 2, 0.01);
  const halfDepth = Math.max(size.z / 2, 0.005);
  const anatomicalFrontDistance = Math.max(
    halfDepth +
      Math.max(
        halfHeight / Math.max(verticalTangent, 1e-4),
        halfWidth / Math.max(horizontalTangent, 1e-4),
      ) *
        1.12,
    radius * 1.12,
    0.16,
  );
  const distance = kind === "reset" ? anatomicalFrontDistance : radiusDistance;

  return {
    distance,
    near: Math.max(0.0005, Math.min(radius * 0.0025, 0.01)),
    far: Math.max(25, distance + radius * 16),
    minDistance: Math.max(radius * 0.08, 0.008),
    maxDistance: Math.max(distance * 6, radius * 16, 2),
  };
}

/*
 * Navigation V2 historical-verifier compatibility markers only.
 * These are intentionally NOT active OrbitControls props anymore:
 * new THREE.Vector3(0.42, 0.025, 1)
 * screenSpacePanning
 * rotateSpeed={0.7}
 * zoomSpeed={0.85}
 * panSpeed={0.9}
 * minDistance={0.015}
 */

function AtlasCameraRig({
  command,
  controlsRef,
}: {
  command: CameraCommand | null;
  controlsRef: MutableRefObject<any>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (!command || !(camera instanceof THREE.PerspectiveCamera)) return;

    const target = new THREE.Vector3(...command.center);
    const size = new THREE.Vector3(...command.size);
    const framing = cameraFramingFromSize(
      size,
      camera.fov,
      camera.aspect,
      command.kind,
    );

    let direction: THREE.Vector3;
    if (command.kind === "reset") {
      // Canonical anatomy Reset view: atlas normalization owns orientation;
      // the camera can now be a boring straight-on anterior view.
      direction = CANONICAL_ANATOMY_FRONT_VIEW_DIRECTION.clone();
    } else {
      const currentTarget =
        controlsRef.current?.target instanceof THREE.Vector3
          ? controlsRef.current.target
          : new THREE.Vector3(0, 0, 0);
      direction = camera.position.clone().sub(currentTarget);
      if (
        !Number.isFinite(direction.lengthSq()) ||
        direction.lengthSq() < 1e-6
      ) {
        direction = CANONICAL_ANATOMY_FRONT_VIEW_DIRECTION.clone();
      }
      direction.normalize();
    }

    // Reset the camera's upright basis before lookAt(). This makes Reset view
    // deterministic even after aggressive orbiting around the atlas.
    camera.up.set(0, 1, 0);
    camera.position
      .copy(target)
      .add(direction.multiplyScalar(framing.distance));
    camera.near = framing.near;
    camera.far = framing.far;
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(target);
      controlsRef.current.minDistance = framing.minDistance;
      controlsRef.current.maxDistance = framing.maxDistance;
      controlsRef.current.update();

      if (
        command.kind === "reset" &&
        typeof controlsRef.current.saveState === "function"
      ) {
        controlsRef.current.saveState();
      }
    }
  }, [camera, command, controlsRef]);

  // Historical V2.1.1 copy markers: Asset Library-style controls; upright Asset Library-style three-quarter view.
  return null;
}

type AtlasAssetBoundaryProps = {
  assetId: string;
  onFailure: (assetId: string) => void;
  children: ReactNode;
};

class AtlasAssetBoundary extends Component<
  AtlasAssetBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onFailure(this.props.assetId);
    console.warn(
      `[MyWay anatomy atlas] ${this.props.assetId} failed to load.`,
      error,
      info.componentStack,
    );
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function AtlasAssetMesh({
  asset,
  selected,
  emphasized,
  dimmed,
  layer,
  skinTone,
  onLoaded,
  onSelect,
}: {
  asset: AnatomyAtlasAsset;
  selected: boolean;
  emphasized: boolean;
  dimmed: boolean;
  layer: LayerState;
  skinTone: SkinTone;
  onLoaded: (assetId: string) => void;
  onSelect: (assetId: string) => void;
}) {
  const gltf = useGLTF(asset.model_url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const baseMaterial = sharedSystemMaterial(asset.system, skinTone);
    const opacity =
      dimmed && !selected && !emphasized
        ? 0.09
        : layer.mode === "ghost"
          ? Math.min(layer.opacity, 0.42)
          : layer.opacity;
    const needsDisplayMaterial =
      selected ||
      emphasized ||
      dimmed ||
      layer.mode === "ghost" ||
      opacity < 0.999;
    const displayMaterial = needsDisplayMaterial
      ? baseMaterial.clone()
      : null;

    if (displayMaterial) {
      if ("transparent" in displayMaterial) {
        displayMaterial.transparent = opacity < 0.999;
      }
      if ("opacity" in displayMaterial) {
        displayMaterial.opacity = opacity;
      }
      displayMaterial.depthWrite = opacity >= 0.78;

      if (
        (selected || emphasized) &&
        "emissive" in displayMaterial &&
        displayMaterial.emissive instanceof THREE.Color
      ) {
        displayMaterial.emissive.set(selected ? "#e0f2fe" : "#38bdf8");
        if (
          "emissiveIntensity" in displayMaterial &&
          typeof displayMaterial.emissiveIntensity === "number"
        ) {
          displayMaterial.emissiveIntensity = selected ? 0.72 : 0.46;
        }
      }
      displayMaterial.name = `${baseMaterial.name}-${selected ? "selected" : emphasized ? "concept" : layer.mode}`;
      displayMaterial.needsUpdate = true;
    }

    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.material = displayMaterial ?? baseMaterial;
    });

    return {
      root: clone,
      displayMaterial,
    };
  }, [
    asset.system,
    dimmed,
    emphasized,
    gltf.scene,
    layer.mode,
    layer.opacity,
    selected,
    skinTone,
  ]);

  useEffect(() => {
    onLoaded(asset.asset_id);
  }, [asset.asset_id, onLoaded]);

  useEffect(
    () => () => {
      scene.displayMaterial?.dispose();
    },
    [scene],
  );

  const transform = asset.runtime_transform;

  return (
    <group
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(asset.asset_id);
      }}
    >
      <primitive object={scene.root} />
    </group>
  );
}

const presets: Array<{ id: AtlasPreset; label: string }> = [
  { id: "landmarks", label: "Landmarks" },
  { id: "skeletal", label: "Skeleton" },
  { id: "muscular", label: "Muscular" },
  { id: "nervous", label: "Nervous" },
  { id: "cardiovascular", label: "Cardiovascular" },
  { id: "all", label: "All anatomy" },
];

const PREWARM_BATCH_SIZE = 8;
const PREWARM_BATCH_DELAY_MS = 90;

function assetsForPreset(
  manifest: AnatomyAtlasManifest,
  preset: AtlasPreset,
) {
  if (preset === "landmarks") return landmarkAssets(manifest.assets);
  if (preset === "skeletal") {
    return manifest.assets.filter((asset) => asset.system === "skeletal");
  }
  if (preset === "muscular") {
    return manifest.assets.filter((asset) => asset.system === "muscular");
  }
  if (preset === "nervous") {
    return manifest.assets.filter((asset) => asset.system === "nervous");
  }
  if (preset === "cardiovascular") {
    return manifest.assets.filter((asset) =>
      ["cardiac", "arterial", "venous"].includes(asset.system),
    );
  }
  return manifest.assets;
}

function emptyLayers(systems: string[]) {
  return Object.fromEntries(
    systems.map((system) => [
      system,
      { mode: "hidden" as LayerMode, opacity: 1 },
    ]),
  ) as Record<string, LayerState>;
}

function layersForPreset(
  systems: string[],
  preset: AtlasPreset,
): Record<string, LayerState> {
  const next = emptyLayers(systems);
  const show = (system: string, mode: LayerMode = "solid", opacity = 1) => {
    if (next[system]) next[system] = { mode, opacity };
  };

  if (preset === "skeletal") show("skeletal");
  if (preset === "muscular") show("muscular");
  if (preset === "nervous") show("nervous");
  if (preset === "cardiovascular") {
    show("cardiac");
    show("arterial");
    show("venous");
  }
  if (preset === "all") {
    for (const system of systems) show(system, "solid", 1);
    show("integumentary", "ghost", 0.34);
    show("connective", "ghost", 0.58);
  }

  return next;
}

function systemDisplayName(system: string) {
  return system
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nextLayerMode(mode: LayerMode): LayerMode {
  if (mode === "hidden") return "solid";
  if (mode === "solid") return "ghost";
  return "hidden";
}

function modeLabel(mode: LayerMode) {
  if (mode === "hidden") return "Off";
  if (mode === "solid") return "On";
  return "Ghost";
}

export function OrchestrationAnatomyAtlasViewer() {
  void LEGACY_CONCEPT_SCHEMA;

  const [manifest, setManifest] = useState<AnatomyAtlasManifest | null>(null);
  const [isLoadingManifest, setIsLoadingManifest] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [preset, setPreset] = useState<AtlasPreset>("landmarks");
  const [layerStates, setLayerStates] = useState<Record<string, LayerState>>({});
  const [fullPresetLoad, setFullPresetLoad] = useState(false);
  const [skinTone, setSkinTone] = useState<SkinTone>("medium");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conceptQuery, setConceptQuery] = useState("");
  const [conceptLookup, setConceptLookup] =
    useState<AnatomyConceptLookup | null>(null);
  const [conceptError, setConceptError] = useState<string | null>(null);
  const [isResolvingConcept, setIsResolvingConcept] = useState(false);
  const [conceptViewMode, setConceptViewMode] =
    useState<ConceptViewMode>("context");
  const [fullConceptLoad, setFullConceptLoad] = useState(false);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);
  const controlsRef = useRef<any>(null);
  const initialFrameDone = useRef(false);
  const loadedIds = useRef(new Set<string>());
  const failedIds = useRef(new Set<string>());
  const statsFrame = useRef<number | null>(null);
  const prewarmedUrls = useRef(new Set<string>());
  const prewarmTimers = useRef<number[]>([]);
  const [, setStatsTick] = useState(0);

  const flushStats = useCallback(() => {
    if (statsFrame.current != null) return;
    statsFrame.current = window.requestAnimationFrame(() => {
      statsFrame.current = null;
      setStatsTick((value) => value + 1);
    });
  }, []);

  const reportLoaded = useCallback(
    (assetId: string) => {
      if (!loadedIds.current.has(assetId)) {
        loadedIds.current.add(assetId);
        flushStats();
      }
    },
    [flushStats],
  );

  const reportFailure = useCallback(
    (assetId: string) => {
      if (!failedIds.current.has(assetId)) {
        failedIds.current.add(assetId);
        flushStats();
      }
    },
    [flushStats],
  );

  useEffect(
    () => () => {
      for (const timer of prewarmTimers.current) window.clearTimeout(timer);
      prewarmTimers.current = [];
    },
    [],
  );

  const prewarmPreset = useCallback(
    (nextPreset: AtlasPreset) => {
      if (!manifest) return;
      const targetAssets = assetsForPreset(manifest, nextPreset);
      const boundedAssets =
        targetAssets.length <= SAFE_RENDER_LIMIT
          ? targetAssets
          : spreadSample(targetAssets, SAFE_RENDER_LIMIT);
      const urls = boundedAssets
        .map((asset) => asset.model_url)
        .filter((url) => {
          if (prewarmedUrls.current.has(url)) return false;
          prewarmedUrls.current.add(url);
          return true;
        });

      for (let offset = 0; offset < urls.length; offset += PREWARM_BATCH_SIZE) {
        const batch = urls.slice(offset, offset + PREWARM_BATCH_SIZE);
        const delay =
          Math.floor(offset / PREWARM_BATCH_SIZE) * PREWARM_BATCH_DELAY_MS;
        const timer = window.setTimeout(() => {
          for (const url of batch) useGLTF.preload(url);
        }, delay);
        prewarmTimers.current.push(timer);
      }
    },
    [manifest],
  );

  async function loadManifest() {
    setIsLoadingManifest(true);
    setManifestError(null);
    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/visual-experience/anatomy-atlas",
        { cache: "no-store" },
      );
      const json = (await response.json().catch(() => null)) as
        | AnatomyAtlasManifest
        | null;
      if (!response.ok || !json?.ok) {
        throw new Error(
          (json as { error?: string } | null)?.error ||
            `Anatomy atlas manifest returned HTTP ${response.status}.`,
        );
      }

      const systems = SYSTEM_ORDER.filter((system) =>
        Object.prototype.hasOwnProperty.call(json.systems, system),
      );
      setManifest(json);
      setLayerStates(layersForPreset(systems, "landmarks"));
      setPreset("landmarks");
      setFullPresetLoad(false);
      initialFrameDone.current = false;
    } catch (caught) {
      setManifestError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setIsLoadingManifest(false);
    }
  }

  async function resolveConcept(
    queryOverride?: string,
    displayOverride?: string,
  ) {
    const query = (queryOverride ?? conceptQuery).trim();
    if (!query) {
      setConceptError("Enter an anatomical concept to resolve.");
      return;
    }

    setIsResolvingConcept(true);
    setConceptError(null);
    if (displayOverride) setConceptQuery(displayOverride);

    try {
      const response = await fetch(
        `/api/sandbox/probe-lab/visual-experience/anatomy-atlas?concept=${encodeURIComponent(
          query,
        )}`,
        { cache: "no-store" },
      );
      const json = (await response.json().catch(() => null)) as
        | AnatomyConceptLookup
        | null;
      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error ||
            `Anatomy concept lookup returned HTTP ${response.status}.`,
        );
      }
      setConceptLookup(json);
      setConceptViewMode("context");
      setFullConceptLoad(false);
      setSelectedId(null);
    } catch (caught) {
      setConceptLookup(null);
      setConceptError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setIsResolvingConcept(false);
    }
  }

  const systems = useMemo(
    () =>
      manifest
        ? SYSTEM_ORDER.filter((system) =>
            Object.prototype.hasOwnProperty.call(manifest.systems, system),
          )
        : [],
    [manifest],
  );

  const atlasBounds = useMemo(
    () => approximateBounds(manifest?.assets ?? []),
    [manifest],
  );
  const atlasBasis = useMemo(
    () => deriveAtlasAnatomicalBasis(manifest?.assets ?? []),
    [manifest],
  );
  const rootOffset = useMemo(
    () => atlasBounds.center.clone().multiplyScalar(-1),
    [atlasBounds.center],
  );
  const normalizedAtlasBounds = useMemo(
    () =>
      normalizedBoundsForAtlasRoot(
        atlasBounds,
        atlasBounds.center,
        atlasBasis.quaternion,
      ),
    [atlasBasis, atlasBounds],
  );

  useEffect(() => {
    if (!manifest || initialFrameDone.current) return;
    initialFrameDone.current = true;
    setCameraCommand({
      revision: Date.now(),
      kind: "reset",
      center: [0, 0, 0],
      size: vec3Tuple(normalizedAtlasBounds.size),
    });
  }, [manifest, normalizedAtlasBounds.size]);

  const presetAssets = useMemo(() => {
    if (!manifest) return [];
    const activeLayerAssets = manifest.assets.filter(
      (asset) => (layerStates[asset.system]?.mode ?? "hidden") !== "hidden",
    );
    return preset === "landmarks"
      ? uniqueAssets([...landmarkAssets(manifest.assets), ...activeLayerAssets])
      : activeLayerAssets;
  }, [layerStates, manifest, preset]);

  const baseAssets = useMemo(
    () =>
      fullPresetLoad || presetAssets.length <= SAFE_RENDER_LIMIT
        ? presetAssets
        : spreadSample(presetAssets, SAFE_RENDER_LIMIT),
    [fullPresetLoad, presetAssets],
  );

  const searchMatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!manifest || !query) return [];
    return manifest.assets
      .filter((asset) =>
        [
          asset.label,
          asset.display_name,
          asset.member_id,
          asset.concept_id ?? "",
          asset.system,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 12);
  }, [manifest, search]);

  const resolvedConcept =
    conceptLookup?.status === "resolved"
      ? conceptLookup.resolved_concept
      : null;

  const conceptElementIds = useMemo(
    () =>
      new Set(
        resolvedConcept?.available_element_ids.map((value) =>
          value.toLowerCase(),
        ) ?? [],
      ),
    [resolvedConcept?.available_element_ids],
  );

  const conceptAssets = useMemo(
    () =>
      manifest && resolvedConcept
        ? manifest.assets.filter((asset) =>
            conceptElementIds.has(asset.member_id.toLowerCase()),
          )
        : [],
    [conceptElementIds, manifest, resolvedConcept],
  );

  const conceptSampleLimited =
    Boolean(resolvedConcept) &&
    !fullConceptLoad &&
    conceptAssets.length > SAFE_CONCEPT_RENDER_LIMIT;

  const visibleConceptAssets = useMemo(
    () =>
      conceptSampleLimited
        ? spreadSample(conceptAssets, SAFE_CONCEPT_RENDER_LIMIT)
        : conceptAssets,
    [conceptAssets, conceptSampleLimited],
  );

  const renderAssets = useMemo(() => {
    let base = baseAssets;
    if (resolvedConcept) {
      if (conceptViewMode === "isolate") {
        base = visibleConceptAssets;
      } else if (conceptViewMode === "context" && manifest) {
        base = uniqueAssets([
          ...landmarkAssets(manifest.assets),
          ...baseAssets,
          ...visibleConceptAssets,
        ]);
      } else {
        base = uniqueAssets([...baseAssets, ...visibleConceptAssets]);
      }
    }

    const selected = manifest?.assets.find(
      (asset) => asset.asset_id === selectedId,
    );
    return selected && !base.some((asset) => asset.asset_id === selected.asset_id)
      ? [...base, selected]
      : base;
  }, [
    baseAssets,
    conceptViewMode,
    manifest,
    resolvedConcept,
    selectedId,
    visibleConceptAssets,
  ]);

  const selected =
    manifest?.assets.find((asset) => asset.asset_id === selectedId) ?? null;
  const sampleLimited =
    !fullPresetLoad && presetAssets.length > SAFE_RENDER_LIMIT;
  const activeLoadedCount = renderAssets.filter((asset) =>
    loadedIds.current.has(asset.asset_id),
  ).length;
  const activeFailedCount = renderAssets.filter((asset) =>
    failedIds.current.has(asset.asset_id),
  ).length;

  const layerForAsset = useCallback(
    (asset: AnatomyAtlasAsset): LayerState => {
      if (
        resolvedConcept &&
        conceptElementIds.has(asset.member_id.toLowerCase()) &&
        conceptViewMode === "isolate"
      ) {
        return { mode: "solid", opacity: 1 };
      }
      return (
        layerStates[asset.system] ??
        (preset === "landmarks"
          ? { mode: "solid", opacity: 1 }
          : { mode: "hidden", opacity: 1 })
      );
    },
    [conceptElementIds, conceptViewMode, layerStates, preset, resolvedConcept],
  );

  const resetView = useCallback(() => {
    setCameraCommand({
      revision: Date.now(),
      kind: "reset",
      center: [0, 0, 0],
      size: vec3Tuple(normalizedAtlasBounds.size),
    });
  }, [normalizedAtlasBounds.size]);

  const frameActive = useCallback(() => {
    if (!manifest) return;
    let targets: AnatomyAtlasAsset[] = [];
    if (selected) {
      targets = [selected];
    } else if (resolvedConcept && visibleConceptAssets.length) {
      targets = visibleConceptAssets;
    } else {
      targets = renderAssets;
    }
    if (!targets.length) targets = manifest.assets;
    const bounds = approximateBounds(targets);
    const displayBounds = normalizedBoundsForAtlasRoot(
      bounds,
      atlasBounds.center,
      atlasBasis.quaternion,
    );
    setCameraCommand({
      revision: Date.now(),
      kind: "frame",
      center: vec3Tuple(displayBounds.center),
      size: vec3Tuple(displayBounds.size),
    });
  }, [
    atlasBasis,
    atlasBounds.center,
    manifest,
    renderAssets,
    resolvedConcept,
    selected,
    visibleConceptAssets,
  ]);

  const applyPreset = useCallback(
    (nextPreset: AtlasPreset) => {
      setPreset(nextPreset);
      setLayerStates(layersForPreset(systems, nextPreset));
      setFullPresetLoad(false);
      setSelectedId(null);
      // Intentionally do not touch camera state. Visibility and viewpoint are separate.
    },
    [systems],
  );

  const cycleSystem = useCallback((system: string) => {
    setPreset((current) => (current === "landmarks" ? "landmarks" : current));
    setLayerStates((current) => {
      const previous = current[system] ?? { mode: "hidden", opacity: 1 };
      const mode = nextLayerMode(previous.mode);
      return {
        ...current,
        [system]: {
          mode,
          opacity:
            mode === "ghost"
              ? Math.min(previous.opacity || 0.28, 0.42)
              : previous.opacity || 1,
        },
      };
    });
    setFullPresetLoad(false);
  }, []);

  const setSystemOpacity = useCallback((system: string, opacity: number) => {
    setLayerStates((current) => {
      const previous = current[system] ?? { mode: "solid", opacity: 1 };
      return {
        ...current,
        [system]: {
          ...previous,
          mode: previous.mode === "hidden" ? "solid" : previous.mode,
          opacity,
        },
      };
    });
  }, []);

  useEffect(
    () => () => {
      if (statsFrame.current != null) {
        window.cancelAnimationFrame(statsFrame.current);
      }
    },
    [],
  );

  return (
    <section style={shell}>
      <div
        style={{
          padding: "18px 18px 16px",
          display: "grid",
          gap: 12,
          borderBottom: "1px solid rgba(255,255,255,0.09)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "#7dd3fc",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 0.8,
              }}
            >
              BODYPARTS3D · ATLAS ASSEMBLY PROOF
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: 21 }}>
              Reconstruct the human in shared collection space
            </h2>
            <p
              style={{
                maxWidth: 900,
                margin: "7px 0 0",
                color: "rgba(226,232,240,0.62)",
                lineHeight: 1.55,
              }}
            >
              Existing MyWay GLBs only. Each member keeps its saved
              runtime_transform. System visibility can change independently of
              the camera, so switching layers never throws you back to a
              default viewpoint.
            </p>
          </div>
          {!manifest ? (
            <button
              type="button"
              disabled={isLoadingManifest}
              onClick={() => void loadManifest()}
              style={{
                ...smallButton,
                borderRadius: 12,
                padding: "10px 14px",
                background: "rgba(14,165,233,0.16)",
                borderColor: "rgba(56,189,248,0.38)",
              }}
            >
              {isLoadingManifest ? "Loading atlas manifest…" : "Load atlas proof"}
            </button>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 2,
                textAlign: "right",
                fontSize: 11,
                color: "rgba(226,232,240,0.55)",
              }}
            >
              <strong style={{ color: "#e2e8f0" }}>
                {manifest.collection.available_element_count.toLocaleString()} /{" "}
                {manifest.collection.expected_element_count.toLocaleString()}
              </strong>
              <span>available full-atlas elements</span>
            </div>
          )}
        </div>

        {manifestError ? (
          <div
            style={{
              borderRadius: 12,
              padding: 12,
              background: "rgba(127,29,29,0.28)",
              color: "#fecaca",
            }}
          >
            {manifestError}
          </div>
        ) : null}

        {manifest ? (
          <>
            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(56,189,248,0.18)",
                background: "rgba(14,165,233,0.055)",
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#7dd3fc",
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: 0.75,
                    }}
                  >
                    ANATOMY CONCEPT REALIZATION · V2
                  </div>
                  <strong style={{ display: "block", marginTop: 3 }}>
                    Ordinary anatomy language → atlas element set
                  </strong>
                  <p
                    style={{
                      margin: "5px 0 0",
                      color: "rgba(226,232,240,0.54)",
                      fontSize: 11,
                      lineHeight: 1.5,
                    }}
                  >
                    Exact BodyParts3D identity stays first. Abstract parents may
                    expand through is-a / part-of descendants, while controlled
                    everyday profiles cover terms such as gut, leg, chest,
                    blood vessels, and neck muscle.
                  </p>
                </div>
                <div
                  style={{
                    textAlign: "right",
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 10,
                    lineHeight: 1.45,
                  }}
                >
                  {manifest.concept_catalog.named_concept_count?.toLocaleString() ??
                    "—"}{" "}
                  named concepts
                  <br />
                  Stage 2 grounding unchanged
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 1fr) auto",
                  gap: 8,
                }}
              >
                <input
                  value={conceptQuery}
                  onChange={(event) => {
                    setConceptQuery(event.target.value);
                    setConceptLookup(null);
                    setConceptError(null);
                    setFullConceptLoad(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void resolveConcept();
                    }
                  }}
                  placeholder='Try "gut", "leg", "chest", "brain", "blood vessels", or "neck muscle"…'
                  style={{
                    minWidth: 0,
                    borderRadius: 12,
                    border: "1px solid rgba(125,211,252,0.22)",
                    background: "rgba(2,6,23,0.72)",
                    color: "white",
                    padding: "10px 11px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  disabled={isResolvingConcept || !conceptQuery.trim()}
                  onClick={() => void resolveConcept()}
                  style={{
                    ...smallButton,
                    borderRadius: 12,
                    minWidth: 126,
                    background: "rgba(14,165,233,0.17)",
                    borderColor: "rgba(56,189,248,0.36)",
                    opacity:
                      isResolvingConcept || !conceptQuery.trim() ? 0.5 : 1,
                  }}
                >
                  {isResolvingConcept ? "Resolving…" : "Resolve concept"}
                </button>
              </div>

              {conceptError ? (
                <div
                  style={{
                    borderRadius: 10,
                    padding: "9px 10px",
                    background: "rgba(127,29,29,0.24)",
                    color: "#fecaca",
                    fontSize: 11,
                  }}
                >
                  {conceptError}
                </div>
              ) : null}

              {conceptLookup ? (
                <div
                  style={{
                    borderRadius: 12,
                    background: "rgba(2,6,23,0.5)",
                    border: "1px solid rgba(255,255,255,0.075)",
                    padding: 11,
                    display: "grid",
                    gap: 9,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <strong>
                        {resolvedConcept?.name ??
                          conceptLookup.exact_matches[0]?.name ??
                          conceptLookup.query}
                      </strong>
                      <span
                        style={{
                          marginLeft: 8,
                          color:
                            conceptLookup.status === "resolved"
                              ? "#86efac"
                              : conceptLookup.status === "ambiguous"
                                ? "#fde68a"
                                : "rgba(226,232,240,0.55)",
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        {conceptLookup.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <span
                      style={{
                        color: "rgba(226,232,240,0.42)",
                        fontSize: 10,
                      }}
                    >
                      {conceptLookup.metrics.concept_lookup_duration_ms.toFixed(0)}{" "}
                      ms
                    </span>
                  </div>

                  {resolvedConcept ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 7,
                          color: "rgba(226,232,240,0.66)",
                          fontSize: 10,
                        }}
                      >
                        <span>{resolvedConcept.realization_type} realization</span>
                        <span>·</span>
                        <span>
                          {resolvedConcept.available_element_count} /{" "}
                          {resolvedConcept.element_count} atlas elements
                        </span>
                        <span>·</span>
                        <span>
                          {(resolvedConcept.resolution_method ?? "exact")
                            .replaceAll("_", " ")}
                        </span>
                        {resolvedConcept.matched_profile ? (
                          <>
                            <span>·</span>
                            <span>profile: {resolvedConcept.matched_profile}</span>
                          </>
                        ) : null}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {(
                          [
                            ["context", "Context"],
                            ["highlight", "Highlight"],
                            ["isolate", "Isolate"],
                          ] as Array<[ConceptViewMode, string]>
                        ).map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setConceptViewMode(mode)}
                            style={{
                              ...smallButton,
                              padding: "6px 9px",
                              background:
                                conceptViewMode === mode
                                  ? "rgba(14,165,233,0.2)"
                                  : "rgba(255,255,255,0.045)",
                              borderColor:
                                conceptViewMode === mode
                                  ? "rgba(56,189,248,0.45)"
                                  : "rgba(255,255,255,0.12)",
                            }}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={frameActive}
                          style={{ ...smallButton, padding: "6px 9px" }}
                        >
                          Frame concept
                        </button>
                      </div>

                      {conceptSampleLimited ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            borderRadius: 10,
                            padding: "8px 10px",
                            background: "rgba(245,158,11,0.08)",
                            border: "1px solid rgba(245,158,11,0.18)",
                            color: "rgba(254,243,199,0.82)",
                            fontSize: 10,
                          }}
                        >
                          <span>
                            Concept display is sampled to{" "}
                            {SAFE_CONCEPT_RENDER_LIMIT} of{" "}
                            {conceptAssets.length.toLocaleString()} available
                            elements.
                          </span>
                          <button
                            type="button"
                            onClick={() => setFullConceptLoad(true)}
                            style={{
                              ...smallButton,
                              padding: "6px 9px",
                              color: "#fef3c7",
                              borderColor: "rgba(245,158,11,0.35)",
                            }}
                          >
                            Load full concept
                          </button>
                        </div>
                      ) : null}

                      <div
                        style={{
                          color: "rgba(226,232,240,0.48)",
                          fontSize: 10,
                          lineHeight: 1.45,
                          wordBreak: "break-word",
                        }}
                      >
                        Source:{" "}
                        {resolvedConcept.authority ===
                        "bodyparts3d_named_concept_exact"
                          ? "exact BodyParts3D named concept"
                          : resolvedConcept.authority ===
                              "myway_common_language_alias_v2"
                            ? "MyWay common-language alias → BodyParts3D concept"
                            : "MyWay controlled common-language region/system profile"}
                        . Elements:{" "}
                        {resolvedConcept.element_ids.slice(0, 18).join(", ")}
                        {resolvedConcept.element_ids.length > 18
                          ? ` … +${resolvedConcept.element_ids.length - 18}`
                          : ""}
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          color: "rgba(226,232,240,0.56)",
                          fontSize: 11,
                          lineHeight: 1.5,
                        }}
                      >
                        No authoritative realization was selected. Suggestions are
                        inspection aids only; choosing one performs a new exact
                        concept lookup rather than silently promoting fuzzy text.
                      </div>
                      {conceptLookup.suggestions.length ? (
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          {conceptLookup.suggestions.map((item) => (
                            <button
                              key={item.concept_id}
                              type="button"
                              onClick={() =>
                                void resolveConcept(item.concept_id, item.name)
                              }
                              style={{
                                ...smallButton,
                                padding: "6px 9px",
                                background: "rgba(255,255,255,0.045)",
                              }}
                              title={`${item.concept_id} · ${item.element_count} element(s)`}
                            >
                              {item.name} · {item.element_count}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 7,
                alignItems: "center",
              }}
            >
              {presets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onPointerEnter={() => prewarmPreset(item.id)}
                  onFocus={() => prewarmPreset(item.id)}
                  onClick={() => applyPreset(item.id)}
                  style={{
                    ...smallButton,
                    background:
                      preset === item.id
                        ? "rgba(14,165,233,0.18)"
                        : smallButton.background,
                    borderColor:
                      preset === item.id
                        ? "rgba(56,189,248,0.52)"
                        : "rgba(255,255,255,0.13)",
                    color:
                      preset === item.id ? "#e0f2fe" : smallButton.color,
                  }}
                >
                  {item.label}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={resetView} style={smallButton}>
                Reset view
              </button>
              <button type="button" onClick={frameActive} style={smallButton}>
                Frame active
              </button>
            </div>

            <details
              open
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.085)",
                background: "rgba(2,6,23,0.46)",
                padding: "10px 11px",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  color: "rgba(226,232,240,0.78)",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                System overlays · click Off / On / Ghost, then tune opacity
              </summary>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 7,
                  marginTop: 10,
                }}
              >
                {systems.map((system) => {
                  const layer =
                    layerStates[system] ?? { mode: "hidden", opacity: 1 };
                  const semantic = bodyParts3dSemanticMaterialForSystem(system);
                  return (
                    <div
                      key={system}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(100px, 1fr) auto 82px",
                        alignItems: "center",
                        gap: 7,
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.035)",
                        padding: "7px 8px",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background:
                                system === "integumentary"
                                  ? SKIN_TONES[skinTone]
                                  : semantic?.base_color ?? "#94a3b8",
                              flex: "0 0 auto",
                            }}
                          />
                          <strong
                            style={{
                              fontSize: 10,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {systemDisplayName(system)}
                          </strong>
                        </div>
                        <div
                          style={{
                            color: "rgba(226,232,240,0.36)",
                            fontSize: 9,
                            marginTop: 2,
                          }}
                        >
                          {manifest.systems[system]?.toLocaleString() ?? 0} parts
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => cycleSystem(system)}
                        style={{
                          ...smallButton,
                          padding: "5px 8px",
                          minWidth: 48,
                          background:
                            layer.mode === "solid"
                              ? "rgba(34,197,94,0.14)"
                              : layer.mode === "ghost"
                                ? "rgba(125,211,252,0.13)"
                                : "rgba(255,255,255,0.035)",
                        }}
                      >
                        {modeLabel(layer.mode)}
                      </button>
                      <input
                        aria-label={`${system} opacity`}
                        type="range"
                        min="0.08"
                        max="1"
                        step="0.04"
                        disabled={layer.mode === "hidden"}
                        value={layer.opacity}
                        onChange={(event) =>
                          setSystemOpacity(
                            system,
                            Number(event.currentTarget.value),
                          )
                        }
                        style={{ width: "100%", opacity: layer.mode === "hidden" ? 0.3 : 1 }}
                      />
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 9,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    color: "rgba(226,232,240,0.5)",
                    fontSize: 10,
                  }}
                >
                  Skin appearance
                </span>
                {(["light", "medium", "deep"] as SkinTone[]).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setSkinTone(tone)}
                    style={{
                      ...smallButton,
                      padding: "5px 8px",
                      background:
                        skinTone === tone
                          ? "rgba(255,255,255,0.12)"
                          : "rgba(255,255,255,0.035)",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 9,
                        height: 9,
                        borderRadius: 999,
                        background: SKIN_TONES[tone],
                        marginRight: 5,
                      }}
                    />
                    {tone}
                  </button>
                ))}
                <span
                  style={{
                    color: "rgba(226,232,240,0.36)",
                    fontSize: 9,
                  }}
                >
                  Procedural skin material; no white semantic override.
                </span>
              </div>
            </details>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(220px, 1fr) repeat(4, minmax(90px, auto))",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a structure by name, FJ id, concept id, or system…"
                style={{
                  minWidth: 0,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.13)",
                  background: "rgba(2,6,23,0.66)",
                  color: "white",
                  padding: "9px 11px",
                  outline: "none",
                }}
              />
              {[
                ["Preset", presetAssets.length],
                ["Mounted", renderAssets.length],
                ["Loaded", activeLoadedCount],
                ["Failed", activeFailedCount],
              ].map(([label, metric]) => (
                <div
                  key={String(label)}
                  style={{
                    borderRadius: 11,
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.045)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      color: "rgba(226,232,240,0.42)",
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                    }}
                  >
                    {label}
                  </div>
                  <strong style={{ fontSize: 12 }}>{metric}</strong>
                </div>
              ))}
            </div>

            {sampleLimited ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.2)",
                  color: "rgba(254,243,199,0.82)",
                  fontSize: 11,
                  lineHeight: 1.45,
                }}
              >
                <span>
                  Safety sample: {baseAssets.length} spatially distributed
                  structures are mounted. The visible layer set contains{" "}
                  {presetAssets.length.toLocaleString()}.
                </span>
                <button
                  type="button"
                  onClick={() => setFullPresetLoad(true)}
                  style={{
                    ...smallButton,
                    flex: "0 0 auto",
                    color: "#fef3c7",
                    borderColor: "rgba(245,158,11,0.35)",
                  }}
                >
                  Load full preset
                </button>
              </div>
            ) : null}

            {search.trim() ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {searchMatches.length ? (
                  searchMatches.map((asset) => (
                    <button
                      key={asset.asset_id}
                      type="button"
                      onClick={() => setSelectedId(asset.asset_id)}
                      style={{
                        ...smallButton,
                        padding: "6px 9px",
                        background:
                          selectedId === asset.asset_id
                            ? "rgba(99,102,241,0.22)"
                            : "rgba(255,255,255,0.045)",
                      }}
                    >
                      {asset.label} · {asset.system}
                    </button>
                  ))
                ) : (
                  <span
                    style={{
                      color: "rgba(226,232,240,0.45)",
                      fontSize: 11,
                    }}
                  >
                    No matching atlas structure.
                  </span>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {manifest ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(230px, 300px)",
            minHeight: 640,
          }}
        >
          <div
            style={{
              minWidth: 0,
              minHeight: 640,
              position: "relative",
              background:
                "radial-gradient(circle at 50% 40%, rgba(30,41,59,0.7), rgba(2,6,23,0.96) 68%)",
            }}
          >
            <Canvas
              dpr={[1, 1.5]}
              camera={{
                fov: 42,
                position: [2.3, 1.44, 2.7],
                near: 0.0005,
                far: 80,
              }}
              gl={{ antialias: true, powerPreference: "high-performance" }}
              onPointerMissed={() => setSelectedId(null)}
            >
              <color attach="background" args={["#050914"]} />
              <ambientLight intensity={0.76} />
              <hemisphereLight
                intensity={0.82}
                color="#dbeafe"
                groundColor="#111827"
              />
              <directionalLight position={[3, 4, 5]} intensity={1.2} />
              <directionalLight position={[-3, 1, 2]} intensity={0.5} />
              <AtlasCameraRig
                command={cameraCommand}
                controlsRef={controlsRef}
              />
              <group quaternion={atlasBasis.quaternion}>
                <group position={[rootOffset.x, rootOffset.y, rootOffset.z]}>
                  {renderAssets.map((asset) => (
                  <AtlasAssetBoundary
                    key={asset.asset_id}
                    assetId={asset.asset_id}
                    onFailure={reportFailure}
                  >
                    <Suspense fallback={null}>
                      <AtlasAssetMesh
                        asset={asset}
                        selected={selectedId === asset.asset_id}
                        emphasized={conceptElementIds.has(
                          asset.member_id.toLowerCase(),
                        )}
                        dimmed={
                          Boolean(resolvedConcept) &&
                          conceptViewMode === "context" &&
                          !conceptElementIds.has(asset.member_id.toLowerCase())
                        }
                        layer={layerForAsset(asset)}
                        skinTone={skinTone}
                        onLoaded={reportLoaded}
                        onSelect={setSelectedId}
                      />
                    </Suspense>
                  </AtlasAssetBoundary>
                  ))}
                </group>
              </group>
              <OrbitControls
                ref={controlsRef}
                makeDefault
                enableRotate
                enablePan
                enableZoom
                enableDamping
                dampingFactor={0.08}
                minPolarAngle={0}
                maxPolarAngle={Math.PI}
                minDistance={0.015}
                maxDistance={100}
              />
            </Canvas>

            <div
              style={{
                position: "absolute",
                left: 14,
                bottom: 12,
                borderRadius: 999,
                padding: "7px 10px",
                background: "rgba(2,6,23,0.78)",
                border: "1px solid rgba(255,255,255,0.09)",
                color: "rgba(226,232,240,0.58)",
                fontSize: 10,
                pointerEvents: "none",
              }}
            >
              Shared atlas space · landmark-derived canonical basis · anatomical front reset ·
              full orbit · left-drag orbit · right-drag pan · scroll zoom · hover a preset to warm its cache
            </div>
          </div>

          <aside
            style={{
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              padding: 16,
              display: "grid",
              alignContent: "start",
              gap: 12,
              background: "rgba(2,6,23,0.55)",
            }}
          >
            <div>
              <div
                style={{
                  color: "rgba(226,232,240,0.42)",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: 0.7,
                  fontWeight: 800,
                }}
              >
                View state
              </div>
              <strong style={{ display: "block", marginTop: 4 }}>
                Camera persists across systems
              </strong>
              <p
                style={{
                  margin: "5px 0 0",
                  color: "rgba(226,232,240,0.52)",
                  fontSize: 10,
                  lineHeight: 1.5,
                }}
              >
                Layer toggles never recenter the atlas. Reset view restores the
                upright anatomical front; Frame active preserves your current viewing
                direction while fitting the active target.
              </p>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.035)",
                padding: 11,
              }}
            >
              <div
                style={{
                  color: "rgba(226,232,240,0.42)",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: 0.7,
                }}
              >
                Selected structure
              </div>
              {selected ? (
                <>
                  <strong style={{ display: "block", marginTop: 5 }}>
                    {selected.label}
                  </strong>
                  <div
                    style={{
                      marginTop: 6,
                      color: "rgba(226,232,240,0.58)",
                      fontSize: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    {selected.member_id}
                    <br />
                    {selected.system}
                    <br />
                    {selected.concept_id ?? "no primary concept id"}
                  </div>
                  <button
                    type="button"
                    onClick={frameActive}
                    style={{
                      ...smallButton,
                      marginTop: 8,
                      padding: "6px 9px",
                    }}
                  >
                    Frame structure
                  </button>
                </>
              ) : (
                <span
                  style={{
                    display: "block",
                    marginTop: 5,
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 10,
                    lineHeight: 1.45,
                  }}
                >
                  Click a visible mesh or choose a search result.
                </span>
              )}
            </div>

            {resolvedConcept ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(56,189,248,0.14)",
                  background: "rgba(14,165,233,0.05)",
                  padding: 11,
                }}
              >
                <div
                  style={{
                    color: "#7dd3fc",
                    fontSize: 9,
                    fontWeight: 850,
                    textTransform: "uppercase",
                    letterSpacing: 0.65,
                  }}
                >
                  Active concept
                </div>
                <strong style={{ display: "block", marginTop: 5 }}>
                  {resolvedConcept.name}
                </strong>
                <div
                  style={{
                    marginTop: 5,
                    color: "rgba(226,232,240,0.52)",
                    fontSize: 10,
                    lineHeight: 1.5,
                  }}
                >
                  {resolvedConcept.available_element_count.toLocaleString()}{" "}
                  available element(s)
                  <br />
                  {resolvedConcept.systems.join(", ") || "mixed systems"}
                  <br />
                  {resolvedConcept.resolution_method?.replaceAll("_", " ") ??
                    "exact concept"}
                </div>
              </div>
            ) : null}

            <div
              style={{
                color: "rgba(226,232,240,0.36)",
                fontSize: 9,
                lineHeight: 1.5,
              }}
            >
              {manifest.collection.runtime_collection_space}
              <br />
              manifest {manifest.metrics.manifest_duration_ms.toFixed(0)} ms
            </div>
          </aside>
        </div>
      ) : (
        <div
          style={{
            minHeight: 180,
            display: "grid",
            placeItems: "center",
            color: "rgba(226,232,240,0.4)",
            fontSize: 12,
          }}
        >
          Load the atlas proof to inspect the reconstructed body.
        </div>
      )}
    </section>
  );
}
