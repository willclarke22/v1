import type { MyWayAssetRecord } from "./asset-types";

export function validateMyWayAssetRecord(asset: MyWayAssetRecord) {
  const errors: string[] = [];
  if (!asset.asset_id) errors.push("asset_id is required");
  if (!asset.canonical_label) errors.push("canonical_label is required");
  if (!asset.public_path.startsWith("/sandbox-assets/myway/")) {
    errors.push("public_path must be under /sandbox-assets/myway/");
  }
  if (asset.asset_type !== "primitive" && !asset.public_path.toLowerCase().match(/\.(glb|gltf)$/)) {
    errors.push("non-primitive assets must point to a .glb or .gltf file");
  }
  if (asset.dimensions_m.some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push("dimensions_m must contain three non-negative finite numbers");
  }
  return { ok: errors.length === 0, errors };
}
