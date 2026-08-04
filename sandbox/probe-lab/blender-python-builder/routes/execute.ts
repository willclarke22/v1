import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  executeBlenderPython,
  foundryExecutionDiagnostics,
} from "../blender-python-runner.server";

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
    const code =
      String(
        body.code ?? "",
      );
    const assetName =
      String(
        body.asset_name ??
          "generated_asset",
      );

    const result =
      await executeBlenderPython({
        code,
        assetName,
        assetSpec:
          body.asset_spec,
        designBrief:
          body.design_brief,
        resourcePlan:
          body.resource_plan,
        lookAdjustments:
          body.look_adjustments,
        parentJobId:
          typeof body.parent_job_id ===
            "string"
            ? body.parent_job_id
            : null,
        revisionNumber:
          typeof body.revision_number ===
            "number"
            ? body.revision_number
            : null,
        revisionLabel:
          typeof body.revision_label ===
            "string"
            ? body.revision_label
            : null,
        critique:
          typeof body.critique ===
            "string"
            ? body.critique
            : null,
      });

    return NextResponse.json({
      ok: true,
      final_code:
        code,
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
        execution_diagnostics:
          foundryExecutionDiagnostics(
            caught,
          ),
      },
      { status: 502 },
    );
  }
}
