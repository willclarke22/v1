import { NextResponse } from "next/server";

import { getVisualLearningTurnProviderStatus } from "../model-provider.server";

import {
  buildVisualLearningTurnInput,
  buildVisualLearningTurnModelRequest,
  buildVisualLearningTurnScaffoldOutput,
  type VisualLearningTurnRequestBody,
} from "../visual-learning-turn-request";
import {
  krebsVisualLearningTurnInputExample,
  krebsVisualLearningTurnProceedExample,
  unclearVisualLearningTurnOutputExample,
} from "../visual-learning-turn-examples";

export async function GET() {
  const input = krebsVisualLearningTurnInputExample;
  const modelRequest = buildVisualLearningTurnModelRequest(input);

  return NextResponse.json({
    ok: true,
    route: "full-turn-debug",
    default_input: input,
    provider_status: getVisualLearningTurnProviderStatus(),
    model_request: modelRequest,
    examples: {
      proceed: krebsVisualLearningTurnProceedExample,
      needs_clarification: unclearVisualLearningTurnOutputExample,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as VisualLearningTurnRequestBody;
    const input = buildVisualLearningTurnInput(body);
    const modelRequest = buildVisualLearningTurnModelRequest(input);
    const scaffoldOutput = buildVisualLearningTurnScaffoldOutput(input, body);

    return NextResponse.json({
      ok: true,
      route: "full-turn-debug",
      request_body: body,
      provider_status: getVisualLearningTurnProviderStatus(),
      model_request: modelRequest,
      scaffold_output: scaffoldOutput,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        route: "full-turn-debug",
        error: message,
      },
      { status: 500 },
    );
  }
}