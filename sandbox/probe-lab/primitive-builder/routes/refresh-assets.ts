import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  PrimitiveSceneGraphV2,
} from "../primitive-scene-graph";
import {
  resolvePrimitiveBuilderSceneAssets,
} from "../../scenes/resolve-scene-assets.server";
import {
  refreshSavedSceneAssets,
} from "../../scenes/scene-store.server";
import {
  listMissingAssetJobs,
} from "../../assets/acquisition/missing-asset-store.server";

export const runtime = "nodejs";

function isPrimitiveSceneGraph(
  value: unknown,
): value is PrimitiveSceneGraphV2 {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as PrimitiveSceneGraphV2)
        .schema_version ===
        "primitive_scene_graph_v2" &&
      Array.isArray(
        (value as PrimitiveSceneGraphV2)
          .asset_requirements,
      ),
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;
    const sceneId =
      typeof body.scene_id === "string"
        ? body.scene_id.trim()
        : "";
    const sceneSessionId =
      typeof body.scene_session_id ===
        "string"
        ? body.scene_session_id.trim()
        : sceneId;

    if (sceneId && body.saved === true) {
      const refreshed =
        await refreshSavedSceneAssets(
          sceneId,
        );
      const jobs =
        await listMissingAssetJobs({
          sceneSessionId:
            sceneSessionId || sceneId,
        });

      return NextResponse.json({
        ok: true,
        ...refreshed,
        acquisition_jobs: jobs,
      });
    }

    if (
      !isPrimitiveSceneGraph(
        body.scene_graph,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "scene_graph must be a primitive_scene_graph_v2 object.",
        },
        { status: 400 },
      );
    }

    const resolution =
      await resolvePrimitiveBuilderSceneAssets(
        body.scene_graph,
      );
    const jobs =
      sceneSessionId
        ? await listMissingAssetJobs({
            sceneSessionId,
          })
        : [];

    return NextResponse.json({
      ok: true,
      resolution,
      acquisition_jobs: jobs,
    });
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      },
      { status: 500 },
    );
  }
}
