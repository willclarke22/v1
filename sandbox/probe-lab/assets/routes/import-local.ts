import { NextRequest, NextResponse } from "next/server";

import type { MyWayAssetRecord } from "../asset-types";
import { importManualGlb } from "../providers/manual-glb-provider.server";

export const runtime = "nodejs";
export const maxDuration = 300;

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function csvValues(value: string) {
  return [...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function licenseKind(value: string): MyWayAssetRecord["license_kind"] {
  if (value === "self_owned") return "self_owned";
  if (value === "cc0") return "cc0";
  if (value === "royalty_free") return "royalty_free";
  return "unknown";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const concept = formText(formData, "concept");

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "A GLB file is required." },
        { status: 400 },
      );
    }

    if (!concept) {
      return NextResponse.json(
        { ok: false, error: "A canonical object identity is required." },
        { status: 400 },
      );
    }

    const targetExtentRaw = Number(formText(formData, "target_extent_m"));
    const result = await importManualGlb({
      file: fileValue,
      concept,
      aliases: csvValues(formText(formData, "aliases")),
      semanticTags: csvValues(formText(formData, "semantic_tags")),
      domain: formText(formData, "domain") || "asset_library_manual_upload",
      targetExtentM:
        Number.isFinite(targetExtentRaw) && targetExtentRaw > 0
          ? targetExtentRaw
          : 2,
      sourceProvider: formText(formData, "source_provider") || "Manual upload",
      sourceUrl: formText(formData, "source_url") || null,
      licenseKind: licenseKind(formText(formData, "license_kind")),
      attribution: formText(formData, "attribution") || null,
      provenanceNotes: formText(formData, "provenance_notes") || null,
    });

    return NextResponse.json({
      ok: true,
      source: "manual",
      ...result,
      message: result.created
        ? "The local GLB was validated, preserved, normalized, registered, and queued for appearance and identity analysis. Review it before scene approval."
        : `This GLB matches an existing library asset${result.duplicate_of ? ` (${result.duplicate_of})` : ""}; MyWay did not create a duplicate.`,
    });
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        error: caught instanceof Error ? caught.message : String(caught),
        debug_path:
          "sandbox/probe-lab/assets/debug/latest-manual-glb-import.json",
      },
      { status: 502 },
    );
  }
}
