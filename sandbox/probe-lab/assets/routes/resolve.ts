import { NextRequest, NextResponse } from "next/server";
import { resolveMyWayAsset } from "../asset-resolver.server";

export const maxDuration = 900;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const concept = typeof body.concept === "string" ? body.concept.trim() : "";
    if (!concept) return NextResponse.json({ ok: false, error: "concept is required" }, { status: 400 });
    const result = await resolveMyWayAsset({ ...body, concept });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (caught) {
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : String(caught) }, { status: 500 });
  }
}
