/**
 * Reviewable seed roles for the Left Lower Limb pilot.
 * Roles control whole-mesh presentation only: they do NOT edit or clip geometry,
 * rewrite atlas metadata, or assert that cross-boundary anatomy is invalid.
 * The same renderer accepts explicit per-asset roles for ANY assembly JSON.
 */
export type AnatomyBoundaryRole = "core" | "context" | "boundary";
export type AnatomyBoundaryMode = "contextual" | "isolated" | "full";
export type AnatomyBoundaryPresentation = {
  schema_version: "myway_anatomy_boundary_presentation_v1";
  roles: Record<string, AnatomyBoundaryRole>;
  context_opacity: number;
  boundary_opacity: number;
};
export const ANATOMY_BOUNDARY_SCHEMA = "myway_anatomy_boundary_presentation_v1" as const;
export const DEFAULT_CONTEXT_OPACITY = 0.20;
export const DEFAULT_BOUNDARY_OPACITY = 0.40;

// Hand-reviewed candidates: these structures span / belong primarily to the
// pelvis-hip boundary rather than the focal thigh, calf, ankle and foot.
// Do not infer clinical precision, automatic clipping, or model-level separation.
const LOWER_LEFT_SEED_ROLES: Record<string, AnatomyBoundaryRole> = {
  left_hip_man_31d385c4: "context",
  left_psoas_major_man_74c98aed: "context",
  left_iliacus_man_375c9314: "context",
  left_gluteus_maximus_man_4f89d2e7: "boundary",
  left_gluteus_medius_man_10659c6f: "boundary",
  left_gluteus_minimus_man_262209d4: "boundary",
  left_obturator_internus_man_9693e356: "boundary",
  left_piriformis_man_4bad7b75: "boundary",
  left_gemellus_superior_man_110ab418: "boundary",
  left_gemellus_inferior_man_8eefa7f8: "boundary",
  left_superior_gluteal_vein_man_64b58b36: "context",
  left_inferior_gluteal_vein_man_4eac5657: "boundary",
};

export function assemblySeedRoles(assemblyId: string, assetIds: readonly string[]): Record<string, AnatomyBoundaryRole> {
  if (assemblyId !== "lower_left") return {};
  const out: Record<string, AnatomyBoundaryRole> = {};
  for (const id of assetIds) if (LOWER_LEFT_SEED_ROLES[id]) out[id] = LOWER_LEFT_SEED_ROLES[id];
  return out;
}
export function effectiveAssemblyRole(roles: Record<string, AnatomyBoundaryRole>, assetId: string): AnatomyBoundaryRole {
  return roles[assetId] ?? "core";
}
