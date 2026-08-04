import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  critiqueFoundryJob,
} from "../foundry-visual-critic.server";

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
            "job_id is required for visual critique.",
        },
        { status: 400 },
      );
    }

    const result =
      await critiqueFoundryJob({
        jobId,
      });

    return NextResponse.json({
      ok: true,
      ...result,
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
