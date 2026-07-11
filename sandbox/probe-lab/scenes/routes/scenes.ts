import { NextRequest, NextResponse } from "next/server";
import { listSceneManifests, saveSceneManifest } from "../scene-store.server";

export async function GET() {
  const scenes = await listSceneManifests();
  return NextResponse.json({ ok: true, count: scenes.length, scenes });
}

export async function POST(request: NextRequest) {
  try {
    const scene = await saveSceneManifest(await request.json());
    return NextResponse.json({ ok: true, scene });
  } catch (caught) {
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : String(caught) }, { status: 400 });
  }
}
