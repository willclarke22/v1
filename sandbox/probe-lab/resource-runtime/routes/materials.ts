import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isReviewedRuntimeMaterial,
  loadReviewedMaterialResolverSnapshot,
  resolveReviewedMaterial,
} from "../reviewed-material-resolver.server";
import type {
  MaterialRuntimeListResponse,
  ReviewedMaterialSummary,
  RuntimeMaterialSourceMode,
} from "../material-runtime-contract";

export const maxDuration = 300;

function mapRoles(material: {
  maps: {
    base_color: string | null;
    normal_gl: string | null;
    normal_dx: string | null;
    roughness: string | null;
    metallic: string | null;
    ambient_occlusion: string | null;
    height: string | null;
    opacity: string | null;
    emission: string | null;
  };
}) {
  const roles: ReviewedMaterialSummary["map_roles"] =
    [];

  if (material.maps.base_color) {
    roles.push("base_color");
  }
  if (
    material.maps.normal_gl ||
    material.maps.normal_dx
  ) {
    roles.push("normal");
  }
  if (material.maps.roughness) {
    roles.push("roughness");
  }
  if (material.maps.metallic) {
    roles.push("metalness");
  }
  if (
    material.maps.ambient_occlusion
  ) {
    roles.push(
      "ambient_occlusion",
    );
  }
  if (material.maps.opacity) {
    roles.push("opacity");
  }
  if (material.maps.emission) {
    roles.push("emissive");
  }
  if (material.maps.height) {
    roles.push("height");
  }

  return roles;
}

function sourceMode(
  value: unknown,
): RuntimeMaterialSourceMode {
  return value ===
      "preserve_original" ||
    value === "replace_all" ||
    value === "replace_slot" ||
    value === "primitive_surface"
    ? value
    : "primitive_surface";
}

function finiteNumber(
  value: unknown,
  fallback: number,
) {
  return typeof value ===
      "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function optionalFiniteNumber(
  value: unknown,
) {
  return typeof value ===
      "number" &&
    Number.isFinite(value)
    ? value
    : undefined;
}

export async function GET() {
  try {
    const snapshot =
      await loadReviewedMaterialResolverSnapshot();
    const materials =
      snapshot.registry.materials
        .filter(
          isReviewedRuntimeMaterial,
        )
        .sort((left, right) =>
          left.display_name.localeCompare(
            right.display_name,
          ),
        )
        .map(
          (
            material,
          ): ReviewedMaterialSummary => ({
            resource_id:
              material.resource_id,
            display_name:
              material.display_name,
            resolution:
              material.resolution,
            semantic_tags:
              material.semantic_tags,
            map_roles:
              mapRoles(material),
            thumbnail_url:
              material.thumbnail_url,
            content_hash:
              material.content_sha256,
          }),
        );

    const response: MaterialRuntimeListResponse =
      {
        ok: true,
        materials,
        default_material_id:
          materials[0]
            ?.resource_id ??
          null,
      };

    return NextResponse.json(
      response,
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        materials: [],
        default_material_id:
          null,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      } satisfies MaterialRuntimeListResponse,
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const preferredMaterialId =
      typeof body.material_id ===
      "string"
        ? body.material_id.trim()
        : "";
    const repeatX =
      finiteNumber(
        body.repeat_x,
        1,
      );
    const repeatY =
      finiteNumber(
        body.repeat_y,
        1,
      );
    const source =
      sourceMode(
        body.source_mode,
      );
    const metalnessFactor =
      optionalFiniteNumber(
        body.metalness_factor,
      );

    const resolution =
      await resolveReviewedMaterial({
        preferred_material_id:
          preferredMaterialId ||
          null,
        query:
          typeof body.query ===
          "string"
            ? body.query
            : null,
        semantic_tags:
          Array.isArray(
            body.semantic_tags,
          )
            ? body.semantic_tags.filter(
                (
                  value,
                ): value is string =>
                  typeof value ===
                  "string",
              )
            : [],
        required_maps: [
          "base_color",
        ],
        target_entity_id:
          typeof body.target_entity_id ===
            "string" &&
          body.target_entity_id.trim()
            ? body.target_entity_id.trim()
            : "resource_runtime_actor",
        target_slot:
          typeof body.target_slot ===
          "string"
            ? body.target_slot
            : null,
        source_mode: source,
        uv_transform: {
          repeat: [
            repeatX,
            repeatY,
          ],
          offset: [0, 0],
          center: [0.5, 0.5],
          rotation_radians:
            finiteNumber(
              body.rotation_radians,
              0,
            ),
        },
        parameters: {
          roughness_factor:
            finiteNumber(
              body.roughness_factor,
              1,
            ),
          ...(
            metalnessFactor ===
            undefined
              ? {}
              : {
                  metalness_factor:
                    metalnessFactor,
                }
          ),
          opacity:
            finiteNumber(
              body.opacity,
              1,
            ),
        },
      });

    if (!resolution.binding) {
      return NextResponse.json(
        {
          ok: false,
          binding: null,
          diagnostics:
            resolution.diagnostics,
          error:
            "No reviewed, R2-published material satisfied the request.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      binding:
        resolution.binding,
      diagnostics:
        resolution.diagnostics,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        binding: null,
        diagnostics: null,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 400 },
    );
  }
}