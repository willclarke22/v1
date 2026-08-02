import {
  NextResponse,
} from "next/server";

import {
  NATIVE_VINTAGE_CAMERA_PROOF,
} from "../native-vintage-camera-proof";

export const runtime =
  "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    fixture:
      NATIVE_VINTAGE_CAMERA_PROOF,
  });
}
