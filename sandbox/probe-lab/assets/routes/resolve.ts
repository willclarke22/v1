import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  resolveMyWayAsset,
} from "../asset-resolver.server";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const concept =
      typeof body.concept === "string"
        ? body.concept.trim()
        : "";

    if (!concept) {
      return NextResponse.json(
        {
          ok: false,
          error: "concept is required",
        },
        { status: 400 },
      );
    }

    const acquisitionPolicy =
      body.acquisition_policy ===
        "never" ||
      body.acquisition_policy ===
        "queue_only" ||
      body.acquisition_policy ===
        "sandbox_synchronous"
        ? body.acquisition_policy
        : "sandbox_synchronous";

    const result =
      await resolveMyWayAsset({
        ...body,
        concept,
        acquisition_policy:
          acquisitionPolicy,
        debug_write:
          body.debug_write !== false,
      });

    return NextResponse.json(
      result,
      {
        status: result.ok
          ? 200
          : acquisitionPolicy ===
              "never"
            ? 404
            : 502,
      },
    );
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
