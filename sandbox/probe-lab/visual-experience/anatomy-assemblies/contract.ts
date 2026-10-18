/** Non-destructive, evidence-labelled BodyParts3D virtual assemblies. */
export const ASSEMBLY_STUDIO_SCHEMA = "myway_bodyparts3d_assembly_studio_v2" as const;
export type ReviewMark = "unreviewed" | "pass" | "partial" | "fail";
export type ReviewAxis = "inventory" | "anatomical_coverage" | "visual_coverage" | "motion_readiness";
export type AssemblyReview = {
  assembly_id: string;
  source_fingerprint: string;
  revision: number;
  add_asset_ids: string[];
  exclude_asset_ids: string[];
  checks: Record<ReviewAxis, ReviewMark>;
  intended_view: string;
  gaps: string;
  notes: string;
  reviewed: boolean;
  updated_at: string | null;
};
export type AssemblyProfile = {
  id: string;
  label: string;
  parent_id: string | null;
  regions: Array<"head" | "neck" | "thorax" | "abdomen" | "pelvis" | "upper_limb" | "lower_limb">;
  side?: "left" | "right";
  purpose: string;
};
export type AssemblyAsset = {
  asset_id: string;
  member_id: string;
  label: string;
  system: string;
  group_tags: string[];
  dimensions_m?: [number,number,number] | null;
  runtime_transform: {
    position: [number,number,number];
    rotation?: [number,number,number];
    scale?: [number,number,number];
  };
};
export type AssemblyCandidate = {
  profile: AssemblyProfile;
  status: "candidate" | "reviewed" | "stale_review";
  asset_ids: string[];
  suggested_asset_ids: string[];
  unknown_side_candidates: number;
  ambiguous_asset_ids: string[];
  review: AssemblyReview;
  inventory: {
    eligible_count: number;
    referenced_count: number;
    missing_references: string[];
    systems: Record<string,number>;
    provenance: "bodyparts3d_partof_ontology_v2";
    evidence: Record<string, string>;
    region_roots: string[];
    unresolved_side_asset_ids: string[];
    ontology_unavailable: boolean;
  };
};
export const ASSEMBLY_PROFILES: AssemblyProfile[] = [
  {id:"head_neck",label:"Head & neck",parent_id:null,regions:["head","neck"],purpose:"Internal head-and-neck orientation; exterior silhouette not assumed"},
  {id:"head",label:"Head",parent_id:"head_neck",regions:["head"],purpose:"Internal head anatomy; exterior remains unverified"},
  {id:"neck",label:"Neck",parent_id:"head_neck",regions:["neck"],purpose:"Internal neck anatomy and landmarks"},
  {id:"torso",label:"Torso",parent_id:null,regions:["thorax","abdomen","pelvis"],purpose:"Internal torso context"},
  {id:"thorax",label:"Chest / thorax",parent_id:"torso",regions:["thorax"],purpose:"Thoracic internal anatomy"},
  {id:"abdomen",label:"Abdomen",parent_id:"torso",regions:["abdomen"],purpose:"Internal abdominal anatomy"},
  {id:"pelvis",label:"Pelvis",parent_id:"torso",regions:["pelvis"],purpose:"Pelvic internal anatomy"},
  {id:"upper_left",label:"Left upper limb",parent_id:null,regions:["upper_limb"],side:"left",purpose:"Left upper-limb internal anatomy"},
  {id:"upper_right",label:"Right upper limb",parent_id:null,regions:["upper_limb"],side:"right",purpose:"Right upper-limb internal anatomy"},
  {id:"lower_left",label:"Left lower limb",parent_id:null,regions:["lower_limb"],side:"left",purpose:"Left lower-limb internal anatomy"},
  {id:"lower_right",label:"Right lower limb",parent_id:null,regions:["lower_limb"],side:"right",purpose:"Right lower-limb internal anatomy"},
];
export const REVIEW_AXES: ReviewAxis[] = ["inventory","anatomical_coverage","visual_coverage","motion_readiness"];
export function emptyReview(id: string, fingerprint: string): AssemblyReview {
 return {assembly_id:id,source_fingerprint:fingerprint,revision:0,add_asset_ids:[],exclude_asset_ids:[],checks:{inventory:"unreviewed",anatomical_coverage:"unreviewed",visual_coverage:"unreviewed",motion_readiness:"unreviewed"},intended_view:"internal anatomy overview",gaps:"",notes:"",reviewed:false,updated_at:null};
}
export function normalizedReview(value: unknown, id: string, fingerprint: string, revision: number): AssemblyReview {
 const raw=value && typeof value==="object"&&!Array.isArray(value) ? value as Record<string,unknown> : {};
 const limit=(x:unknown,n:number)=>typeof x==="string"?x.trim().slice(0,n):"";
 const ids=(x:unknown)=>Array.isArray(x)?[...new Set(x.filter((a):a is string=>typeof a==="string"&&/^[a-zA-Z0-9_:\-.]{1,150}$/.test(a)))].slice(0,2500):[];
 const checks=raw.checks && typeof raw.checks==="object"&&!Array.isArray(raw.checks)?raw.checks as Record<string,unknown>:{};
 const allowed:ReviewMark[]=["unreviewed","pass","partial","fail"];
 const marks=Object.fromEntries(REVIEW_AXES.map(k=>[k,allowed.includes(checks[k] as ReviewMark)?checks[k]:"unreviewed"])) as Record<ReviewAxis,ReviewMark>;
 return {assembly_id:id,source_fingerprint:fingerprint,revision,add_asset_ids:ids(raw.add_asset_ids),exclude_asset_ids:ids(raw.exclude_asset_ids),checks:marks,intended_view:limit(raw.intended_view,240),gaps:limit(raw.gaps,2000),notes:limit(raw.notes,4000),reviewed:raw.reviewed===true,updated_at:typeof raw.updated_at==="string"?raw.updated_at:null};
}
