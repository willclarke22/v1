import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  saveFoundryCandidate,
} from "../foundry-candidate-store.server";

export const runtime =
  "nodejs";
export const maxDuration =
  300;

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const jobId =
      String(
        body.job_id ?? "",
      ).trim();
    if (!jobId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "job_id is required.",
        },
        { status: 400 },
      );
    }

    const candidate =
      await saveFoundryCandidate({
        jobId,
        reviewNotes:
          typeof body.review_notes ===
            "string"
            ? body.review_notes
            : undefined,
      });

    return NextResponse.json({
      ok: true,
      candidate,
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
      { status: 502 },
    );
  }
}
