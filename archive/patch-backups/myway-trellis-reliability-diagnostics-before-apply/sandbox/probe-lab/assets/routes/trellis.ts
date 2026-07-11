import { NextRequest, NextResponse } from "next/server";
import { acquireFromTrellis } from "../providers/trellis-asset-provider.server";

export const maxDuration = 900;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const concept = typeof body.concept === "string" ? body.concept.trim() : "";
    if (!concept) return NextResponse.json({ ok: false, error: "concept is required" }, { status: 400 });
    const result = await acquireFromTrellis({
      concept,
      semanticTags: Array.isArray(body.semantic_tags) ? body.semantic_tags : [],
      styleTags: Array.isArray(body.style_tags) ? body.style_tags : [],
      domain: typeof body.domain === "string" ? body.domain : "generic",
      targetExtentM: typeof body.target_extent_m === "number" ? body.target_extent_m : 2,
    });
    return NextResponse.json({ ok: true, source: "trellis", ...result });
  } catch (caught) {
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : String(caught) }, { status: 500 });
  }
}
