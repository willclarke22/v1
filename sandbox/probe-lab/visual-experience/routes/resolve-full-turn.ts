import { NextResponse } from "next/server";

import { resolveVisualLearningTurn } from "../resolve-visual-learning-turn";
import { attachApprovedAssetsToVisualTurn } from "../resolve-visual-learning-turn-assets.server";
import {
  buildVisualLearningTurnInput,
  buildVisualLearningTurnScaffoldOutput,
  type VisualLearningTurnRequestBody,
} from "../visual-learning-turn-request";

export async function GET() {
  const input = buildVisualLearningTurnInput({ example: "krebs" });
  const output = buildVisualLearningTurnScaffoldOutput(input, { example: "krebs" });
  const resolved =
    await attachApprovedAssetsToVisualTurn(
      resolveVisualLearningTurn(output, input),
      output,
    );

  return NextResponse.json({
    ok: true,
    route: "resolve-full-turn",
    input,
    output,
    resolved,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as VisualLearningTurnRequestBody;
    const input = buildVisualLearningTurnInput(body);
    const output = buildVisualLearningTurnScaffoldOutput(input, body);
    const resolved =
      await attachApprovedAssetsToVisualTurn(
        resolveVisualLearningTurn(output, input),
        output,
      );

    return NextResponse.json({
      ok: true,
      route: "resolve-full-turn",
      request_body: body,
      input,
      output,
      resolved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        route: "resolve-full-turn",
        error: message,
      },
      { status: 500 },
    );
  }
}
