import { NextResponse } from "next/server";
import { getAssetBrowserRegistrySnapshot } from "../../assets/asset-browser-snapshot.server";
import { BODYPARTS3D_FULL_COLLECTION_ID } from "../../assets/bodyparts3d-slp-pilot";
import { callVisualOrchestrationCalibrationModel } from "../model-provider.server";
import { parseAnatomyDirectorProgram } from "../anatomy-director/contract";

const revision = "myway_bodyparts3d_atlas_assembly_v1";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body.");
    const data = body as Record<string, unknown>;
    const assetId = data.asset_id;
    const system = data.system_prompt;
    const user = data.user_prompt;
    if (typeof assetId !== "string" || !assetId || assetId.length > 200 ||
        typeof system !== "string" || system.length < 40 || system.length > 12_000 ||
        typeof user !== "string" || user.length < 5 || user.length > 8_000) {
      throw new Error("Select an asset and supply bounded system/user prompts.");
    }
    const snapshot = await getAssetBrowserRegistrySnapshot(revision);
    const asset = snapshot.assets.find((entry) => entry.asset_id === assetId);
    if (!asset || asset.asset_type !== "glb" ||
        asset.collection_membership?.collection_id !== BODYPARTS3D_FULL_COLLECTION_ID ||
        asset.collection_membership.runtime_collection_space !== "glb_y_up_meters" ||
        asset.status === "rejected" || asset.scene_review_status === "rejected" ||
        asset.semantic_review_status === "rejected" || asset.semantic_review_status === "mismatch" ||
        asset.safe_to_use_in_sandbox === false || !asset.public_path?.trim()) {
      throw new Error("Asset is not a valid BodyParts3D full-atlas member.");
    }
    const membership = asset.collection_membership;
    const assetContext = {
      asset_id: asset.asset_id,
      member_id: membership.member_id,
      label: asset.verified_canonical_label || membership.concept_name || asset.canonical_label || asset.display_name,
      system: membership.group_tags,
      dimensions_m: asset.dimensions_m,
      runtime_transform: membership.runtime_transform,
      display_coordinate_space: "the viewer applies the atlas transform, recenters the mesh, and normalizes its largest dimension to 1",
      available_operations: ["object position", "object rotation", "object scale", "object opacity", "camera position", "camera look target"],
      unsupported_operations: ["mesh deformation", "new anatomy", "rigging", "cutaway geometry"],
    };
    const exactMessages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: `${user}\n\nVERIFIED ASSET CONTEXT (use this exact asset, no others):\n${JSON.stringify(assetContext)}` },
    ];
    const result = await callVisualOrchestrationCalibrationModel({
      messages: exactMessages,
      model: "z-ai/glm-5.3",
      reasoning_effort: "high",
      max_tokens: 3800,
      timeout_ms: 180_000,
      temperature: 0.65,
    });
    if (!result.ok) return NextResponse.json({
      ok: false, phase: "provider", error: result.error, model: result.model,
      request_messages: exactMessages, request_body: result.request_body, attempts: result.attempts,
    }, { status: 502 });
    let program;
    let validationError: string | null = null;
    try { program = parseAnatomyDirectorProgram(result.raw_text); }
    catch (caught) { validationError = caught instanceof Error ? caught.message : String(caught); }
    return NextResponse.json({
      ok: !validationError, phase: validationError ? "validation" : "complete",
      error: validationError, model: result.model, asset_id: assetId,
      raw_text: result.raw_text, program: program ?? null,
      duration_ms: result.duration_ms, diagnostics: result.diagnostics,
      request_messages: exactMessages, request_body: result.request_body,
    }, { status: validationError ? 422 : 200 });
  } catch (caught) {
    return NextResponse.json({ ok: false, phase: "preflight", error: caught instanceof Error ? caught.message : String(caught) }, { status: 400 });
  }
}
