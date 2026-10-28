import { NextResponse } from "next/server";
import { readSandboxLearningSpaceSnapshot } from "@/sandbox/probe-lab/learning-space/snapshot.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await readSandboxLearningSpaceSnapshot();
    return NextResponse.json(snapshot, {headers: {"Cache-Control": "private, no-store, max-age=0", "X-MyWay-Mode": "readonly-sandbox"}});
  } catch {
    // Never expose database connection details or service-role secrets in API errors.
    return NextResponse.json({error: "Sandbox read-only snapshot unavailable. Inspect local terminal output and destination pin."}, {status: 503, headers: {"Cache-Control": "no-store"}});
  }
}
