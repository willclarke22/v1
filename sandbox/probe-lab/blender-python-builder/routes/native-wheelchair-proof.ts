import {
  NextResponse,
} from "next/server";

import {
  NATIVE_WHEELCHAIR_PROOF,
} from "../native-wheelchair-proof";

export const runtime =
  "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    fixture:
      NATIVE_WHEELCHAIR_PROOF,
  });
}
