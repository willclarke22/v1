import { NextResponse } from "next/server";

import {
  getSemanticEmbeddingPilotStatus,
  prepareSemanticEmbeddingPilot,
  resetSemanticEmbeddingPilot,
  runSemanticAssetSearchComparison,
  runSemanticEmbeddingPilotStep,
  runSemanticEmbeddingPilotWindow,
} from "../../assets/search/asset-semantic-embedding-pilot.server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action =
      typeof body.action === "string" && body.action.trim()
        ? body.action.trim()
        : "pilot_status";
    const mode =
      body.asset_collection_mode === "bodyparts3d_slp_pilot"
        ? "bodyparts3d_slp_pilot"
        : "bodyparts3d_full_atlas";

    if (action === "pilot_prepare") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await prepareSemanticEmbeddingPilot(mode)),
      });
    }

    if (action === "pilot_status") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await getSemanticEmbeddingPilotStatus(mode)),
      });
    }

    if (action === "pilot_step") {
      const result = await runSemanticEmbeddingPilotStep(mode);
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...result,
      });
    }

    if (action === "pilot_run_window") {
      const result = await runSemanticEmbeddingPilotWindow(
        mode,
        Number(body.max_batches) || 6,
      );
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...result,
      });
    }

    if (action === "pilot_reset") {
      return NextResponse.json({
        route: "visual-experience/semantic-embedding-pilot",
        action,
        ...(await resetSemanticEmbeddingPilot()),
      });
    }

    if (action === "semantic_compare") {
      return NextResponse.json({
        ok: true,
        route: "visual-experience/semantic-embedding-pilot",
        action,
        semantic_comparison: await runSemanticAssetSearchComparison(body),
      });
    }

    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/semantic-embedding-pilot",
        error: `Unsupported semantic embedding pilot action: ${action}`,
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/semantic-embedding-pilot",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
