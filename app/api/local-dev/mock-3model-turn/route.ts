import { NextResponse } from "next/server";
import { buildMockThreeModelTurn } from "@/lib/engine/providers/mock-model-artifacts";

export async function GET() {
  try {
    return NextResponse.json(buildMockThreeModelTurn());
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to build mock 3-model turn.",
      },
      { status: 500 },
    );
  }
}
