/** Model output is a declarative presentation, never executable code or mesh instructions. */
export const ANATOMY_EXPERIENCE_SCHEMA = "myway_anatomy_experience_v1" as const;
export type AnatomySceneAsset = {
  asset_id: string;
  member_id: string;
  label: string;
  system: string;
  model_url: string;
  runtime_transform: { position: [number,number,number]; rotation: [number,number,number]; scale: [number,number,number] };
  dimensions_m: [number,number,number] | null;
  reason: string;
};
export type AnatomyExperienceStep = {
  title: string;
  narration: string;
  visible_asset_ids: string[];
  highlighted_asset_ids: string[];
  motion_explanation: string;
};
export type AnatomyExperiencePlan = {
  schema_version: typeof ANATOMY_EXPERIENCE_SCHEMA;
  title: string;
  learning_objective: string;
  summary: string;
  steps: AnatomyExperienceStep[];
};
const text = (v: unknown, n: number) => typeof v === "string" ? v.trim().slice(0,n) : "";
const obj = (v: unknown): Record<string,unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string,unknown> : null;
const ids = (v: unknown, allowed: Set<string>, n: number) => Array.isArray(v) ? [...new Set(v.filter((x):x is string => typeof x === "string" && allowed.has(x)))].slice(0,n) : [];
export function validateAnatomyExperiencePlan(raw: unknown, assets: AnatomySceneAsset[]): AnatomyExperiencePlan {
  const o=obj(raw);
  if(!o) throw new Error("Model returned no JSON object.");
  const allowed=new Set(assets.map(a=>a.asset_id));
  const steps=Array.isArray(o.steps)?o.steps:[];
  if(!steps.length || steps.length>8) throw new Error("Model must provide 1–8 valid learning steps.");
  const validated=steps.map((value,i)=>{
    const s=obj(value);
    if(!s) throw new Error(`Step ${i+1} is not an object.`);
    const visible=ids(s.visible_asset_ids,allowed,35);
    const highlights=ids(s.highlighted_asset_ids,allowed,8).filter(x=>visible.includes(x));
    if(!visible.length) throw new Error(`Step ${i+1} has no verified visible assets.`);
    return {title:text(s.title,110)||`Step ${i+1}`,narration:text(s.narration,900), visible_asset_ids: visible,highlighted_asset_ids:highlights,motion_explanation:text(s.motion_explanation,350)};
  });
  return { schema_version: ANATOMY_EXPERIENCE_SCHEMA, title:text(o.title,140)||"Anatomy experience",learning_objective:text(o.learning_objective,450),summary:text(o.summary,1000),steps:validated };
}
