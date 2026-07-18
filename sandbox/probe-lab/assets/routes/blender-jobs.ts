import { NextRequest, NextResponse } from "next/server";
import { createBlenderKitJob, createNormalizeJob } from "../blender/blender-job-store.server";
import { runBlenderJob } from "../blender/blender-bridge.server";
import { projectPath } from "../paths.server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.kind === "blenderkit_acquire") {
      const id = `manual-bk-${Date.now()}`;
      const { jobPath } = await createBlenderKitJob({
        kind: "blenderkit_acquire",
        query: String(body.query ?? "").trim(),
        output_path: projectPath("public/sandbox-assets/myway/models/blenderkit", `${id}.glb`),
        thumbnail_path: projectPath("public/sandbox-assets/myway/thumbnails", `${id}.png`),
        target_extent_m: Number(body.target_extent_m ?? 2),
        resolution: "resolution_1K",
        free_only: true,
        required_license_kind: "cc0",
        result: null,
        error: null,
      });
      return NextResponse.json({ ok: true, job: await runBlenderJob(jobPath) });
    }
    const { jobPath } = await createNormalizeJob({
      kind: "normalize_asset",
      input_path: String(body.input_path ?? ""),
      output_path: String(body.output_path ?? ""),
      thumbnail_path: String(body.thumbnail_path ?? ""),
      target_extent_m: Number(body.target_extent_m ?? 2),
      source_type: body.source_type === "trellis" ? "trellis" : "manual",
      result: null,
      error: null,
    });
    return NextResponse.json({ ok: true, job: await runBlenderJob(jobPath) });
  } catch (caught) {
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : String(caught) }, { status: 500 });
  }
}


