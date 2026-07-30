import type {
  AmbientCgCachedMaterial,
} from "../assets/catalog/ambientcg/ambientcg-types";
import {
  isReviewedRuntimeMaterial,
  loadReviewedMaterialResolverSnapshot,
  type ReviewedMaterialResolverSnapshot,
} from "./reviewed-material-resolver.server";
import type {
  MaterialTextureRole,
} from "./material-runtime-contract";

export const MAX_RUNTIME_TEXTURE_BYTES =
  64 * 1024 * 1024;

export type ReviewedMaterialTextureMatch = {
  resource_id: string;
  role: MaterialTextureRole;
  public_url: string;
};

function textureEntries(
  material: AmbientCgCachedMaterial,
): ReviewedMaterialTextureMatch[] {
  const entries: ReviewedMaterialTextureMatch[] = [];
  const push = (
    role: MaterialTextureRole,
    publicUrl: string | null | undefined,
  ) => {
    if (!publicUrl) return;
    entries.push({
      resource_id: material.resource_id,
      role,
      public_url: publicUrl,
    });
  };

  push("base_color", material.maps.base_color);
  push(
    "normal",
    material.maps.normal_gl ?? material.maps.normal_dx,
  );
  push("roughness", material.maps.roughness);
  push("metalness", material.maps.metallic);
  push(
    "ambient_occlusion",
    material.maps.ambient_occlusion,
  );
  push("opacity", material.maps.opacity);
  push("emissive", material.maps.emission);
  push("height", material.maps.height);

  return entries;
}

export function findReviewedMaterialTextureByUrl(
  snapshot: ReviewedMaterialResolverSnapshot,
  requestedUrl: string,
): ReviewedMaterialTextureMatch | null {
  const normalized = requestedUrl.trim();

  if (!/^https:\/\//i.test(normalized)) {
    return null;
  }

  for (const material of snapshot.registry.materials) {
    if (!isReviewedRuntimeMaterial(material)) continue;

    const match = textureEntries(material).find(
      (entry) => entry.public_url === normalized,
    );

    if (match) return match;
  }

  return null;
}

export async function resolveReviewedMaterialTextureUrl(
  requestedUrl: string,
  options: {
    snapshot?: ReviewedMaterialResolverSnapshot;
  } = {},
) {
  const snapshot =
    options.snapshot ??
    (await loadReviewedMaterialResolverSnapshot());

  return findReviewedMaterialTextureByUrl(
    snapshot,
    requestedUrl,
  );
}
