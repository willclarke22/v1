import { createHash } from "node:crypto";
import type { BodyParts3dFullCatalogV1 } from "../../assets/bodyparts3d-full-import.server";
import {
  ASSEMBLY_PROFILES, ASSEMBLY_STUDIO_SCHEMA, emptyReview,
  type AssemblyAsset, type AssemblyCandidate, type AssemblyReview, type AssemblyProfile,
} from "./contract";

const norm = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const SIDE_WORDS = {left:/\b(left|sinister|sinistra)\b/i,right:/\b(right|dexter|dextra)\b/i};
// Exact concept-root aliases: never substring-match individual asset names.
// The ontology, not these aliases, determines the members under each root.
const ROOTS: Record<string, string[]> = {
 head:["head", "head region", "cephalic region", "region of head"],
 neck:["neck", "neck region", "cervical region", "region of neck"],
 thorax:["thorax", "thoracic region", "thorax region", "region of thorax", "thoracic part of trunk", "chest"],
 abdomen:["abdomen", "abdominal region", "region of abdomen"],
 pelvis:["pelvis", "pelvic region", "pelvic cavity"],
 upper_limb:["upper limb", "upper extremity", "upper limb region", "free upper limb", "arm"],
 lower_limb:["lower limb", "lower extremity", "lower limb region", "free lower limb", "leg"],
 trunk:["trunk", "torso", "trunk region"],
};
const SIDE_ROOTS: Record<string,string[]> = {
 upper_left:["left upper limb", "left upper extremity", "left upper limb region", "left arm"],
 upper_right:["right upper limb", "right upper extremity", "right upper limb region", "right arm"],
 lower_left:["left lower limb", "left lower extremity", "left lower limb region", "left leg"],
 lower_right:["right lower limb", "right lower extremity", "right lower limb region", "right leg"],
};

export function atlasFingerprint(assets: AssemblyAsset[], catalog: BodyParts3dFullCatalogV1 | null): string {
 const hash=createHash("sha256").update(ASSEMBLY_STUDIO_SCHEMA).update("\n");
 for(const a of [...assets].sort((a,b)=>a.asset_id.localeCompare(b.asset_id))) hash.update(`${a.asset_id}|${a.member_id}|${JSON.stringify(a.runtime_transform)}\n`);
 if(catalog){
  for(const c of [...catalog.concepts].sort((a,b)=>a.concept_id.localeCompare(b.concept_id)))hash.update(`C|${c.concept_id}|${c.name}|${[...c.element_ids].sort().join(",")}\n`);
  for(const r of [...catalog.partof_relations].sort((a,b)=>(a.parent_id+a.child_id).localeCompare(b.parent_id+b.child_id)))hash.update(`P|${r.parent_id}|${r.child_id}\n`);
 } else hash.update("NO_ONTOLOGY");
 return hash.digest("hex");
}

type Index = {
 byId: Map<string, BodyParts3dFullCatalogV1["concepts"][number][]>;
 byName: Map<string,string[]>;
 children: Map<string,Set<string>>;
 parents: Map<string,Set<string>>;
 elementConcepts: Map<string,Set<string>>;
};
function graph(catalog:BodyParts3dFullCatalogV1):Index {
 const byId=new Map<string,BodyParts3dFullCatalogV1["concepts"][number][]>();
 const byName=new Map<string,string[]>(),children=new Map<string,Set<string>>(),parents=new Map<string,Set<string>>(),elementConcepts=new Map<string,Set<string>>();
 for(const concept of catalog.concepts){
  const id=concept.concept_id;byId.set(id,[...(byId.get(id)??[]),concept]);
  const name=norm(concept.name);byName.set(name,[...new Set([...(byName.get(name)??[]),id])]);
  for(const rawElement of concept.element_ids){const eid=rawElement.toUpperCase();const set=elementConcepts.get(eid)??new Set<string>();set.add(id);elementConcepts.set(eid,set)}
 }
 for(const rel of catalog.partof_relations){
  if(!byId.has(rel.parent_id)||!byId.has(rel.child_id))continue;
  const childrenOf=children.get(rel.parent_id)??new Set<string>();childrenOf.add(rel.child_id);children.set(rel.parent_id,childrenOf);
  const parentsOf=parents.get(rel.child_id)??new Set<string>();parentsOf.add(rel.parent_id);parents.set(rel.child_id,parentsOf);
 }
 return {byId,byName,children,parents,elementConcepts};
}
function descendants(roots:string[],idx:Index){
 const seen=new Set<string>(),queue=[...roots];
 for(let at=0;at<queue.length&&at<100_000;at++){
  const id=queue[at]!;if(seen.has(id))continue;seen.add(id);
  for(const child of idx.children.get(id)??[])if(!seen.has(child))queue.push(child);
 }
 return seen;
}
function ancestralSides(ids:Set<string>,idx:Index, extra:string){
 let left=SIDE_WORDS.left.test(extra),right=SIDE_WORDS.right.test(extra);
 const visited=new Set<string>(),queue=[...ids];
 for(let n=0;n<queue.length&&n<10000;n++){
  const id=queue[n]!;if(visited.has(id))continue;visited.add(id);
  for(const c of idx.byId.get(id)??[]){left ||= SIDE_WORDS.left.test(c.name);right ||= SIDE_WORDS.right.test(c.name)}
  for(const parent of idx.parents.get(id)??[])if(!visited.has(parent))queue.push(parent);
 }
 return left===right?left?"conflict":"unknown":left?"left":"right";
}
function rootsFor(profile:AssemblyProfile,idx:Index){
 const wanted=new Set<string>();
 for(const region of profile.regions)for(const name of ROOTS[region]??[])wanted.add(norm(name));
 if(profile.id==="torso")for(const name of ROOTS.trunk)wanted.add(norm(name));
 if(profile.side)for(const name of SIDE_ROOTS[profile.id]??[])wanted.add(norm(name));
 const ids=new Set<string>();
 for(const name of wanted)for(const id of idx.byName.get(name)??[])ids.add(id);
 return [...ids];
}
export function proposedAssemblies(assets: AssemblyAsset[],reviews:Record<string,AssemblyReview>,catalog:BodyParts3dFullCatalogV1|null,fingerprint=atlasFingerprint(assets,catalog)):AssemblyCandidate[]{
 const idx=catalog?graph(catalog):null;
 const byAsset=new Map(assets.map(a=>[a.asset_id,a]));
 return ASSEMBLY_PROFILES.map(profile=>{
  const roots=idx?rootsFor(profile,idx):[];
  const expanded=idx?descendants(roots,idx):new Set<string>();
  const elementEvidence=new Map<string,string>();
  if(idx)for(const conceptId of expanded){
   for(const concept of idx.byId.get(conceptId)??[])for(const eid of concept.element_ids){
    const element=eid.toUpperCase();
    if(!elementEvidence.has(element))elementEvidence.set(element,`${concept.name} (${conceptId})`);
   }
  }
  const sideUnknown:string[]=[],ambiguous:string[]=[],suggested:string[]=[];
  const evidence:Record<string,string>={};
  for(const a of assets){
   const path=elementEvidence.get(a.member_id.toUpperCase());if(!path)continue;
   if(profile.side){
    const known=ancestralSides(idx?.elementConcepts.get(a.member_id.toUpperCase())??new Set(),idx!,[a.label,...a.group_tags].join(" "));
    if(known==="unknown"){sideUnknown.push(a.asset_id);continue}
    if(known==="conflict"){ambiguous.push(a.asset_id);continue}
    if(known!==profile.side)continue;
   }
   suggested.push(a.asset_id);evidence[a.asset_id]=path;
  }
  const stored=reviews[profile.id];
  const isStale=Boolean(stored&&stored.source_fingerprint!==fingerprint);
  const review=stored?{
   ...emptyReview(profile.id,fingerprint),...stored,assembly_id:profile.id,
   ...(isStale?{reviewed:false,checks:emptyReview(profile.id,fingerprint).checks,add_asset_ids:[],exclude_asset_ids:[],notes:stored?.notes ?? ""}:{})
  }:emptyReview(profile.id,fingerprint);
  const excluded=new Set(review.exclude_asset_ids);
  const members=[...new Set([...suggested,...review.add_asset_ids])].filter(id=>!excluded.has(id));
  const missing=[...new Set([...review.add_asset_ids,...review.exclude_asset_ids])].filter(id=>!byAsset.has(id));
  const existing=members.filter(id=>byAsset.has(id));
  const systems:Record<string,number>={};
  for(const id of existing){const system=byAsset.get(id)!.system;systems[system]=(systems[system]??0)+1}
  const reviewed=review.reviewed&&!isStale&&existing.length>0&&!missing.length&&roots.length>0&&review.checks.inventory==="pass"&&review.checks.anatomical_coverage==="pass"&&review.checks.visual_coverage==="pass";
  return {profile,status:isStale?"stale_review":reviewed?"reviewed":"candidate",asset_ids:existing,suggested_asset_ids:suggested,unknown_side_candidates:sideUnknown.length,ambiguous_asset_ids:ambiguous,review,
   inventory:{eligible_count:assets.length,referenced_count:existing.length,missing_references:missing,systems,
    provenance:"bodyparts3d_partof_ontology_v2",evidence,region_roots:roots.map(id=>`${idx?.byId.get(id)?.[0]?.name??id} (${id})`),unresolved_side_asset_ids:sideUnknown,ontology_unavailable:!idx||!roots.length}};
 });
}
