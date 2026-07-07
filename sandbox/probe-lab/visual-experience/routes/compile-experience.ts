import { NextResponse } from "next/server";

import { visualExperienceRendererCapabilities } from "../assets";
import { loadVisualAssetRegistry } from "../asset-store.server";
import { compileVisualExperienceScaffold } from "../compiler";
import { validateAndNormalizeVisualExperienceOutput } from "../validate";

export const dynamic = "force-dynamic";

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function numberOrNull(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const result = await compileVisualExperienceScaffold({
    learner_message:
      typeof body.learner_message === "string" && body.learner_message.trim().length > 0
        ? body.learner_message.trim()
        : "I can’t picture how this idea works.",
    topic_id: typeof body.topic_id === "string" ? body.topic_id : null,
    topic_label: typeof body.topic_label === "string" ? body.topic_label : null,
    diagnosis: typeof body.diagnosis === "string" ? body.diagnosis : "representation_gap",
    root_problem: typeof body.root_problem === "string" ? body.root_problem : null,
    bridge_level: typeof body.bridge_level === "string" ? body.bridge_level : "bridge_0",
    jargon_level: typeof body.jargon_level === "string" ? body.jargon_level : null,
    preferred_style: typeof body.preferred_style === "string" ? body.preferred_style : "visual_description",
    requested_experience_mode:
      typeof body.requested_experience_mode === "string" ? body.requested_experience_mode : null,
    semantic_tags: stringArray(body.semantic_tags),
    max_assets: numberOrNull(body.max_assets),
  });

  const registry = await loadVisualAssetRegistry();
  const normalized = validateAndNormalizeVisualExperienceOutput({
    rawOutput: result.scaffold_output,
    assets: registry.assets,
    rendererCapabilities: visualExperienceRendererCapabilities,
  });

  return NextResponse.json({
    ok: true,
    compiler_input: result.compiler_input,
    model_request: result.model_request,
    raw_output: result.scaffold_output,
    output: normalized.output,
    validation: normalized.validation,
    note:
      "Step 5 scaffold compile only. raw_output is treated like untrusted model output; output is the normalized renderer-safe version.",
  });
}

export async function GET() {
  return POST(
    new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        learner_message: "I can’t picture the Krebs cycle.",
        topic_label: "Krebs cycle",
        diagnosis: "representation_gap",
        root_problem: "The learner needs a visual loop instead of a list of biochemical terms.",
        bridge_level: "bridge_0",
        jargon_level: "none",
        preferred_style: "visual_description",
        semantic_tags: ["biology", "cycle", "energy"],
      }),
    }),
  );
}
