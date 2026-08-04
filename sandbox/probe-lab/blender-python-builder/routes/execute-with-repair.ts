import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  normalizeAssetDesignBrief,
} from "../asset-design-brief";
import {
  executeBlenderPython,
  foundryExecutionDiagnostics,
} from "../blender-python-runner.server";
import {
  repairBlenderPython,
} from "../glm-blender-python.server";

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
    let code =
      String(
        body.code ?? "",
      );
    const assetName =
      String(
        body.asset_name ??
          "generated_asset",
      );
    const buildRequest =
      String(
        body.request ??
          assetName,
      );
    const maxRepairAttempts =
      Math.max(
        0,
        Math.min(
          2,
          Math.round(
            Number(
              body.max_repair_attempts ??
                1,
            ),
          ),
        ),
      );
    const designBrief =
      body.design_brief &&
      typeof body.design_brief ===
        "object"
        ? normalizeAssetDesignBrief(
            body.design_brief,
            {
              concept:
                buildRequest,
              target_extent_m:
                Number(
                  body.target_extent_m ??
                    2,
                ),
              max_triangles:
                Number(
                  body.max_triangles ??
                    30_000,
                ),
              quality_mode:
                body.quality_mode ===
                  "draft" ||
                body.quality_mode ===
                  "hero"
                  ? body.quality_mode
                  : "standard",
              style:
                String(
                  body.style ??
                    "clean stylized",
                ),
              animation_ready:
                body.animation_ready !==
                false,
            },
          )
        : null;
    const attempts:
      Array<{
        attempt: number;
        status:
          | "failed"
          | "repaired"
          | "succeeded";
        error: string | null;
        repair_model:
          string | null;
        repair_elapsed_ms:
          number | null;
        execution_diagnostics?:
          unknown;
      }> = [];

    for (
      let attempt = 0;
      attempt <=
      maxRepairAttempts;
      attempt += 1
    ) {
      try {
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
        attempts.push({
          attempt:
            attempt + 1,
          status:
            "succeeded",
          error: null,
          repair_model: null,
          repair_elapsed_ms:
            null,
        });
        return NextResponse.json({
          ok: true,
          repair_attempts:
            attempts,
          final_code:
            code,
          ...result,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);
        attempts.push({
          attempt:
            attempt + 1,
          status:
            "failed",
          error:
            message,
          repair_model:
            null,
          repair_elapsed_ms:
            null,
          execution_diagnostics:
            foundryExecutionDiagnostics(
              error,
            ),
        });

        if (
          attempt >=
          maxRepairAttempts
        ) {
          return NextResponse.json(
            {
              ok: false,
              status:
                "needs_manual_review",
              error:
                message,
              repair_attempts:
                attempts,
              final_code:
                code,
              execution_diagnostics:
                foundryExecutionDiagnostics(
                  error,
                ),
            },
            { status: 422 },
          );
        }

        const repaired =
          await repairBlenderPython({
            code,
            blenderError:
              message,
            request:
              buildRequest,
            designBrief,
          });
        code =
          repaired.code;
        attempts.push({
          attempt:
            attempt + 1,
          status:
            "repaired",
          error: null,
          repair_model:
            repaired.model,
          repair_elapsed_ms:
            repaired.elapsed_ms,
        });
      }
    }

    throw new Error(
      "The bounded Blender repair loop ended unexpectedly.",
    );
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
