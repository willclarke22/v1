import type { VisualAssetRecord, VisualExperienceCompilerOutput } from "./schema";

export function visualExperienceToSandboxRenderable(input: {
  output: VisualExperienceCompilerOutput;
  assets: VisualAssetRecord[];
}) {
  const byId = new Map(input.assets.map((asset) => [asset.asset_id, asset]));
  const primaryUse = input.output.asset_uses[0] ?? null;
  const primaryAsset = primaryUse ? byId.get(primaryUse.asset_id) ?? null : null;

  return {
    title: input.output.title,
    orientation: input.output.orientation,
    target_takeaway: input.output.target_takeaway,
    primary_asset: primaryAsset,
    asset_uses: input.output.asset_uses,
    asset_requests: input.output.asset_requests ?? [],
    scene_plan: input.output.scene_plan ?? null,
    check_prompt: input.output.check_prompt ?? null,
  };
}

export function visualExperienceToProbeContractDraft(input: {
  output: VisualExperienceCompilerOutput;
}) {
  return {
    probe_type: "video_explanation",
    expected_attempt_type: "text",
    prompt: {
      task: input.output.check_prompt ?? "Explain what the visual scene helped you see.",
      reshaping_explanation: input.output.orientation,
      root_problem_explanation: input.output.target_takeaway,
    },
    renderer_params: {
      visual_experience: input.output,
    },
  };
}
