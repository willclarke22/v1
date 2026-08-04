import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  compareFoundryBenchmarkStability,
  evaluateFoundryBenchmarkCase,
  FOUNDRY_BENCHMARK_MANIFEST,
  type FoundryBenchmarkCase,
  type FoundryBenchmarkExecutionEvidence,
  type FoundryBenchmarkGateResult,
  type FoundryBenchmarkHumanReview,
} from "../foundry-benchmark";
import type {
  FoundryVisualCritiqueReport,
} from "../foundry-visual-critic.server";

export const runtime =
  "nodejs";
export const maxDuration =
  300;

function record(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function benchmarkCase(
  value: unknown,
) {
  const item = record(value);
  const caseId =
    String(
      item.case_id ?? "",
    ).trim();
  return FOUNDRY_BENCHMARK_MANIFEST
    .cases.find(
      (candidate) =>
        candidate.case_id ===
        caseId,
    ) ?? null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    manifest:
      FOUNDRY_BENCHMARK_MANIFEST,
  });
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const action =
      String(
        body.action ??
        "evaluate",
      );

    if (action === "evaluate") {
      const selectedCase =
        benchmarkCase(
          body.benchmark_case ??
          {
            case_id:
              body.case_id,
          },
        );
      if (!selectedCase) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "A known frozen benchmark case_id is required.",
          },
          { status: 400 },
        );
      }
      const execution =
        record(
          body.execution,
        ) as
          FoundryBenchmarkExecutionEvidence;
      const visualCritique =
        body.visual_critique &&
        typeof body.visual_critique ===
          "object" &&
        !Array.isArray(
          body.visual_critique,
        )
          ? body.visual_critique as
              FoundryVisualCritiqueReport
          : null;
      const humanReview =
        body.human_review &&
        typeof body.human_review ===
          "object" &&
        !Array.isArray(
          body.human_review,
        )
          ? body.human_review as
              FoundryBenchmarkHumanReview
          : null;
      const evaluation =
        evaluateFoundryBenchmarkCase({
          benchmarkCase:
            selectedCase as
              FoundryBenchmarkCase,
          execution,
          visualCritique,
          humanReview,
        });
      return NextResponse.json({
        ok: true,
        evaluation,
      });
    }

    if (action === "compare_stability") {
      const stabilityGroup =
        String(
          body.stability_group ??
          "",
        ).trim();
      if (!stabilityGroup) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "stability_group is required.",
          },
          { status: 400 },
        );
      }
      const comparison =
        compareFoundryBenchmarkStability({
          stabilityGroup,
          firstExecution:
            record(
              body.first_execution,
            ) as
              FoundryBenchmarkExecutionEvidence,
          secondExecution:
            record(
              body.second_execution,
            ) as
              FoundryBenchmarkExecutionEvidence,
          firstEvaluation:
            record(
              body.first_evaluation,
            ) as
              FoundryBenchmarkGateResult,
          secondEvaluation:
            record(
              body.second_evaluation,
            ) as
              FoundryBenchmarkGateResult,
        });
      return NextResponse.json({
        ok: true,
        comparison,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          `Unsupported benchmark action: ${action}`,
      },
      { status: 400 },
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
