import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { importManualGlb } from "./manual-glb-provider.server";
import { requestGlmProceduralPlan } from "./glm-procedural-client.server";
import { buildProceduralGlb } from "./procedural-glb-builder.server";
import { projectPath } from "../paths.server";

export async function createGlmProceduralAsset(input:{concept:string;details:string[];style:string;targetExtentM:number}) {
  const {plan,model}=await requestGlmProceduralPlan(input);
  const buffer=buildProceduralGlb(plan);
  const debugPath=projectPath("sandbox/probe-lab/assets/debug/latest-glm-procedural-build.json");
  await mkdir(path.dirname(debugPath),{recursive:true});
  await writeFile(debugPath,JSON.stringify({model,request:input,plan,glb_bytes:buffer.length,created_at:new Date().toISOString()},null,2)+"\n","utf8");
  const fileName=`${plan.canonical_label.replace(/[^a-z0-9]+/gi,"_").toLowerCase() || "glm_asset"}.glb`;
  const file={
    name:fileName,
    size:buffer.length,
    type:"model/gltf-binary",
    async arrayBuffer() {
      return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
    },
  };
  const imported=await importManualGlb({
    file,
    concept:plan.canonical_label,
    aliases:plan.aliases,
    semanticTags:[...plan.semantic_tags,"glm_procedural"],
    domain:"asset_library_glm_procedural",
    targetExtentM:input.targetExtentM,
    sourceProvider:`NVIDIA ${model}`,
    sourceUrl:"https://build.nvidia.com/z-ai/glm-5_2",
    licenseKind:"unknown",
    attribution:null,
    provenanceNotes:`Procedurally generated from a validated primitive build plan produced by ${model}. Suitability: ${plan.suitability}. ${plan.suitability_reason}`,
  });
  return {...imported,plan,model};
}
