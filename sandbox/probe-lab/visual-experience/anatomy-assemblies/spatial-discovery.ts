/**
 * Spatial broad-phase for *review only*. All BodyParts3D collection members were
 * localized by their Blender AABB bottom-center before GLB export. The saved
 * runtime_transform restores their common, metre-scale, glb_y_up_meters space.
 * The registry's dimensions_m is the GLB-local [width,height,depth].
 *
 * This uses the recorded bounding boxes, NOT mesh/triangle intersections.
 * AABB crossing is a possible anatomical-region overlap, not proof of it.
 * No GLB downloads, ontology rewrites, or automatic membership decisions.
 */
export const SPATIAL_DISCOVERY_SCHEMA = "myway_bodyparts3d_spatial_discovery_v1" as const;
export type AtlasVec3 = [number, number, number];
export type SpatialBound = {
  asset_id: string;
  member_id: string;
  min: AtlasVec3;
  max: AtlasVec3;
};
export type SpatialIndex = {
  schema_version: typeof SPATIAL_DISCOVERY_SCHEMA;
  coordinate_space: "glb_y_up_meters";
  method: "saved_local_aabb_with_collection_transform";
  up_axis: "+Y";
  eligible_count: number;
  bounds_available: number;
  bounds_unavailable: number;
  global_min: AtlasVec3 | null;
  global_max: AtlasVec3 | null;
  records: SpatialBound[];
  notes: string[];
};
export type SpatialAssetInput = {
  asset_id: string;
  member_id: string;
  dimensions_m?: AtlasVec3 | null;
  runtime_transform: {
    position: AtlasVec3;
    rotation?: AtlasVec3;
    scale?: AtlasVec3;
  };
};
const vec = (raw: unknown): raw is AtlasVec3 =>
  Array.isArray(raw) && raw.length === 3 && raw.every((v) => typeof v === "number" && Number.isFinite(v));

/**
 * The imported collection uses zero rotation; skip unexpected rotation rather
 * than silently pretending an unrotated AABB is an exact world AABB.
 */
export function spatialBoundOf(asset: SpatialAssetInput): SpatialBound | null {
  const t = asset.runtime_transform;
  const dimensions = asset.dimensions_m;
  if (!vec(dimensions) || !vec(t.position)) return null;
  const scale = t.scale ?? [1, 1, 1];
  const rotation = t.rotation ?? [0, 0, 0];
  if (!vec(scale) || !vec(rotation) || rotation.some(v => Math.abs(v) > 1e-6)) return null;
  if (scale.some(s => s <= 0 || s > 1e4) || dimensions.some(v => v <= 0 || v > 10)) return null;
  const size = dimensions.map((v, i) => v * scale[i]!) as AtlasVec3;
  // BodyParts3D member conversion localizes X/Z around its midpoint; Y=0 is its lowest point.
  const [x, y, z] = t.position;
  const min: AtlasVec3 = [x - size[0] / 2, y, z - size[2] / 2];
  const max: AtlasVec3 = [x + size[0] / 2, y + size[1], z + size[2] / 2];
  if ([...min, ...max].some(v => !Number.isFinite(v) || Math.abs(v) > 100)) return null;
  return {asset_id: asset.asset_id, member_id: asset.member_id, min, max};
}
export function buildSpatialIndex(assets: SpatialAssetInput[]): SpatialIndex {
  const records: SpatialBound[] = [];
  const min: AtlasVec3 = [Infinity, Infinity, Infinity];
  const max: AtlasVec3 = [-Infinity, -Infinity, -Infinity];
  for (const asset of assets) {
    const bounds = spatialBoundOf(asset);
    if (!bounds) continue;
    records.push(bounds);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], bounds.min[i]);
      max[i] = Math.max(max[i], bounds.max[i]);
    }
  }
  return {
    schema_version: SPATIAL_DISCOVERY_SCHEMA,
    coordinate_space: "glb_y_up_meters", method: "saved_local_aabb_with_collection_transform", up_axis: "+Y",
    eligible_count: assets.length, bounds_available: records.length,
    bounds_unavailable: assets.length - records.length,
    global_min: records.length ? min : null,
    global_max: records.length ? max : null,
    records,
    notes: [
      "Broad-phase AABB overlap only; a box crossing the cutoff may represent anatomy far from the selected region.",
      "AABB metadata is taken from the verified collection-local GLB extents and each member's saved atlas transform.",
      "No source meshes are changed and no membership is automatically applied.",
    ],
  };
}
