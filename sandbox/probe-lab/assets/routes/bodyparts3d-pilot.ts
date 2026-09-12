import { NextResponse } from "next/server";
import path from "node:path";

import { importManualGlb } from "../providers/manual-glb-provider.server";
import { convertSourceModelToGlb, materializeArchiveMembersByBasename } from "../smart-asset-intake.server";
import {
  BODYPARTS3D_ATTRIBUTION,
  BODYPARTS3D_LICENSE_URL,
  BODYPARTS3D_SLP_COLLECTION_ID,
  BODYPARTS3D_SLP_COLLECTION_NAME,
  BODYPARTS3D_SLP_PILOT_MEMBERS,
  BODYPARTS3D_SOURCE_ARCHIVE,
  BODYPARTS3D_SOURCE_URL,
  makeBodyParts3dCollectionMembership,
} from "../bodyparts3d-slp-pilot";
import {
  bodyParts3dFullImportStatus,
  bodyParts3dFullLibrarySnapshot,
  cancelBodyParts3dFullImport,
  prepareBodyParts3dFullImport,
  runBodyParts3dFullImportStep,
} from "../bodyparts3d-full-import.server";

export const runtime = "nodejs";
export const maxDuration = 300;

function bool(form: FormData, name: string, fallback = false) {
  const value = form.get(name);
  if (typeof value !== "string") return fallback;
  return value === "true";
}

function file(form: FormData, name: string) {
  const value = form.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim();
  if (sessionId) {
    try {
      return NextResponse.json(await bodyParts3dFullImportStatus(sessionId));
    } catch (caught) {
      return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : String(caught) }, { status: 404 });
    }
  }
  return NextResponse.json({
    ok: true,
    collection_id: BODYPARTS3D_SLP_COLLECTION_ID,
    collection_name: BODYPARTS3D_SLP_COLLECTION_NAME,
    source_archive: BODYPARTS3D_SOURCE_ARCHIVE,
    source_url: BODYPARTS3D_SOURCE_URL,
    license_url: BODYPARTS3D_LICENSE_URL,
    attribution: BODYPARTS3D_ATTRIBUTION,
    default_run_vision: false,
    default_run_embedding: false,
    members: BODYPARTS3D_SLP_PILOT_MEMBERS,
    full_atlas: await bodyParts3dFullLibrarySnapshot(),
  });
}

async function importPilot(form: FormData) {
  let archiveCleanup: (() => Promise<void>) | null = null;
  try {
    const archive = form.get("archive");
    if (!(archive instanceof File) || !archive.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({ ok: false, error: `Choose the official ${BODYPARTS3D_SOURCE_ARCHIVE} archive.` }, { status: 400 });
    }
    const runVision = bool(form, "run_vision", false);
    const runEmbedding = bool(form, "run_embedding", false);
    const wanted = BODYPARTS3D_SLP_PILOT_MEMBERS.flatMap((member) =>
      member.element_file_ids.map((elementId) => `${elementId}.obj`),
    );
    const materialized = await materializeArchiveMembersByBasename({ archive, basenames: wanted });
    archiveCleanup = materialized.cleanup;

    const results: Array<Record<string, unknown>> = [];
    for (const member of BODYPARTS3D_SLP_PILOT_MEMBERS) {
      const inputPaths = member.element_file_ids
        .map((elementId) => materialized.inputPathsByBasename.get(`${elementId}.obj`.toLowerCase()))
        .filter((value): value is string => Boolean(value));
      if (inputPaths.length !== member.element_file_ids.length) {
        const found = new Set(inputPaths.map((value) => path.basename(value, path.extname(value)).toUpperCase()));
        const missingElementIds = member.element_file_ids.filter((elementId) => !found.has(elementId.toUpperCase()));
        results.push({
          representation_id: member.representation_id,
          element_file_ids: member.element_file_ids,
          name: member.name,
          status: "missing_from_archive",
          missing_element_file_ids: missingElementIds,
        });
        continue;
      }
      const inputPath = inputPaths[0];
      let conversionCleanup: (() => Promise<void>) | null = null;
      try {
        const converted = await convertSourceModelToGlb({
          inputPath,
          inputPaths,
          sourceTypeLabel: member.element_file_ids.length > 1 ? "BodyParts3D compound OBJ concept" : "BodyParts3D OBJ",
          targetExtentM: 2,
          normalizationMode: "collection_member",
          sourceScale: 0.001,
        });
        conversionCleanup = converted.cleanup;
        if (!converted.collectionTransform) throw new Error("BodyParts3D collection transform was not returned by Blender.");
        const collectionMembership = makeBodyParts3dCollectionMembership(member, converted.collectionTransform);
        const imported = await importManualGlb({
          file: converted.file,
          concept: member.name,
          aliases: [member.representation_id, member.concept_id, ...member.element_file_ids],
          semanticTags: ["anatomy", "speech_language_pathology", "BodyParts3D", ...member.groups, ...member.tags],
          domain: "speech_language_pathology_anatomy",
          targetExtentM: 2,
          sourceProvider: "BodyParts3D",
          sourceUrl: BODYPARTS3D_SOURCE_URL,
          sourceAssetId: member.representation_id,
          assetTitle: member.name,
          creatorName: "Database Center for Life Science",
          licenseKind: "cc_by_4_0",
          licenseVersion: "4.0",
          attribution: BODYPARTS3D_ATTRIBUTION,
          modificationNotice: "Converted from BodyParts3D 4.0 OBJ to a member-local GLB while retaining an invertible shared collection transform.",
          provenanceNotes: `Official ${BODYPARTS3D_SOURCE_ARCHIVE} element mesh(es) ${member.element_file_ids.join(", ")}; FMA concept ${member.concept_id}; BodyParts3D representation ${member.representation_id}. License: ${BODYPARTS3D_LICENSE_URL}`,
          normalizationMode: "preserve_geometry",
          collectionMembership,
          runVision,
          runEmbedding,
        });
        results.push({
          representation_id: member.representation_id,
          element_file_ids: member.element_file_ids,
          name: member.name,
          status: imported.created ? "imported" : imported.repaired_existing ? "repaired_existing" : "duplicate",
          asset_id: imported.asset.asset_id,
          scene_review_status: imported.asset.scene_review_status ?? "pending",
          semantic_review_status: imported.asset.semantic_review_status ?? "pending",
          vision_queued: Boolean(imported.enrichment_entry),
          embedding_queued: imported.enrichment_entry?.mode === "full",
          collection_transform: collectionMembership.runtime_transform,
        });
      } catch (caught) {
        results.push({ representation_id: member.representation_id, element_file_ids: member.element_file_ids, name: member.name, status: "failed", error: caught instanceof Error ? caught.message : String(caught) });
      } finally {
        if (conversionCleanup) await conversionCleanup().catch(() => undefined);
      }
    }

    const count = (status: string) => results.filter((item) => item.status === status).length;
    return NextResponse.json({
      ok: true,
      collection_id: BODYPARTS3D_SLP_COLLECTION_ID,
      archive_entry_count: materialized.archiveEntryCount,
      run_vision: runVision,
      run_embedding: runEmbedding,
      summary: {
        imported: count("imported"),
        repaired_existing: count("repaired_existing"),
        duplicate: count("duplicate"),
        missing: count("missing_from_archive"),
        failed: count("failed"),
      },
      results,
      message: "BodyParts3D SLP pilot import completed. Imported members remain in Needs Review; this route does not approve semantic identity or scene use, and providers run only when explicitly enabled.",
    });
  } finally {
    if (archiveCleanup) await archiveCleanup().catch(() => undefined);
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      const action = typeof body.action === "string" ? body.action : "";
      const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
      if (action === "full_step") {
        if (!sessionId) return NextResponse.json({ ok: false, error: "session_id is required." }, { status: 400 });
        return NextResponse.json(await runBodyParts3dFullImportStep(sessionId, Number(body.batch_size ?? 4)));
      }
      if (action === "full_cancel") {
        if (!sessionId) return NextResponse.json({ ok: false, error: "session_id is required." }, { status: 400 });
        return NextResponse.json(await cancelBodyParts3dFullImport(sessionId));
      }
      if (action === "full_status") {
        if (!sessionId) return NextResponse.json({ ok: false, error: "session_id is required." }, { status: 400 });
        return NextResponse.json(await bodyParts3dFullImportStatus(sessionId));
      }
      return NextResponse.json({ ok: false, error: "Unsupported BodyParts3D JSON action." }, { status: 400 });
    }

    const form = await request.formData();
    const action = typeof form.get("action") === "string" ? String(form.get("action")) : "pilot";
    if (action === "full_prepare") {
      const archive = file(form, "archive");
      if (!archive || !archive.name.toLowerCase().endsWith(".zip")) {
        return NextResponse.json({ ok: false, error: `Choose the official ${BODYPARTS3D_SOURCE_ARCHIVE} archive.` }, { status: 400 });
      }
      return NextResponse.json(await prepareBodyParts3dFullImport({
        archive,
        metadata: {
          isaParts: file(form, "isa_parts"),
          isaElements: file(form, "isa_elements"),
          partofParts: file(form, "partof_parts"),
          partofElements: file(form, "partof_elements"),
          isaRelations: file(form, "isa_relations"),
          partofRelations: file(form, "partof_relations"),
        },
      }));
    }
    return await importPilot(form);
  } catch (caught) {
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : String(caught) }, { status: 400 });
  }
}
