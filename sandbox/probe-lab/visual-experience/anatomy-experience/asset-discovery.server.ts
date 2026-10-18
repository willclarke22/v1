/** Experimental one-call Look-and-Grab catalog provider. No scene-authoring authority. */
import { getAssetBrowserRegistrySnapshot } from "../../assets/asset-browser-snapshot.server";
import { BODYPARTS3D_FULL_COLLECTION_ID, bodyParts3dSystemFromGroupTags } from "../../assets/bodyparts3d-slp-pilot";
import { getPreparedAssetSearchCorpus } from "../../assets/search/asset-search-bench.server";
import { readBodyParts3dFullCatalog } from "../../assets/bodyparts3d-full-import.server";
import { discoverMultiscaleCandidates } from "../../assets/search/asset-multiscale-context";
import { searchAssetLexicalIndexV1, normalizeAssetSearchText } from "../../assets/search/asset-lexical-search";
import type { AssetSearchDocumentV1 } from "../../assets/search/asset-search-document";
import type { MyWayAssetRecord } from "../../assets/asset-types";
import type { AnatomySceneAsset } from "./contract";

export type LookGrabMode = "full_catalog" | "search_assisted" | "multiscale_v2";
export const LOOK_GRAB_SEARCH_LIMIT = 250;
const ATLAS_REVISION = "myway_bodyparts3d_atlas_assembly_v1";
const MAX_CATALOG_PROMPT_CHARS = 400_000;
const finiteVector = (input: unknown, fallback: [number,number,number]):[number,number,number] =>
 Array.isArray(input) && input.length===3 && input.every(v=>typeof v==="number" && Number.isFinite(v)) ? input as [number,number,number] : fallback;
const label = (a:MyWayAssetRecord) => a.verified_canonical_label || a.collection_membership?.concept_name || a.canonical_label || a.display_name;
export function isLookGrabAtlasAsset(a:MyWayAssetRecord){
 const m=a.collection_membership;
 return m?.collection_id===BODYPARTS3D_FULL_COLLECTION_ID && m.runtime_collection_space==="glb_y_up_meters" && a.asset_type==="glb" &&
 a.status!=="rejected" && a.scene_review_status!=="rejected" && a.semantic_review_status!=="rejected" && a.semantic_review_status!=="mismatch" && a.safe_to_use_in_sandbox!==false &&
 typeof a.public_path==="string" && a.public_path.trim().length>0;
}
function sceneAsset(a:MyWayAssetRecord):AnatomySceneAsset{
 const m=a.collection_membership!;
 const raw=a.public_path!.trim();
 return {asset_id:a.asset_id,member_id:m.member_id,label:label(a),system:bodyParts3dSystemFromGroupTags(m.group_tags)??"connective",
 model_url:/^https:\/\//i.test(raw)?`/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=${encodeURIComponent(a.asset_id)}&revision=${ATLAS_REVISION}`:raw,
 runtime_transform:{position:finiteVector(m.runtime_transform?.position,[0,0,0]),rotation:finiteVector(m.runtime_transform?.rotation,[0,0,0]),scale:finiteVector(m.runtime_transform?.scale,[1,1,1])},
 dimensions_m:finiteVector(a.dimensions_m,[0,0,0]),reason:"Model-selected from verified library catalog"};
}
export type LookGrabEntry = {short_id:string; asset_id:string; name:string; system:string; laterality:string; aliases:string[]};
export function makeLookGrabEntries(assets:MyWayAssetRecord[],documents:AssetSearchDocumentV1[]){
 const docs=new Map(documents.map(d=>[d.asset_id,d] as const));
 const sorted=[...assets].sort((a,b)=>a.asset_id.localeCompare(b.asset_id));
 return sorted.map((a,i):LookGrabEntry=>{
  const d=docs.get(a.asset_id);
  return {short_id:`A${String(i+1).padStart(4,"0")}`,asset_id:a.asset_id,name:label(a),
   system:d?.system??bodyParts3dSystemFromGroupTags(a.collection_membership?.group_tags)??"connective",
   laterality:d?.laterality??"unspecified",
   aliases:(d?.aliases??[]).filter(x=>x.toLowerCase()!==label(a).toLowerCase()).slice(0,2)};
 });
}
/** Public to pure verifiers; both modes share identical IDs and description formatting. */
export function compactLookGrabRecord(a:LookGrabEntry){
 // JSON array is unambiguous and substantially smaller than a long JSON object per mesh.
 return [a.short_id,a.name,a.system,a.laterality,...(a.aliases.length?[a.aliases.join(" / ")]:[])] as string[];
}
export function validateLookGrabSelection(raw:unknown,entries:LookGrabEntry[]){
 if(!raw || typeof raw!=="object" || Array.isArray(raw))throw new Error("Model returned no JSON scene plan.");
 const o=raw as Record<string,unknown>;
 const byShort=new Map(entries.map(a=>[a.short_id,a.asset_id] as const));
 const requested=o.selected_asset_ids;
 if(!Array.isArray(requested) || requested.length<1 || requested.length>100)throw new Error("Look-and-Grab requires 1–100 selected_asset_ids from the provided catalog.");
 const invalid=requested.filter(v=>typeof v!=="string" || !byShort.has(v));
 if(invalid.length)throw new Error(`Look-and-Grab model selected ${invalid.length} invalid/unprovided asset ID(s): ${invalid.slice(0,5).map(String).join(", ")}`);
 const selected=[...new Set(requested as string[])].map(id=>byShort.get(id)!);
 if(selected.length>80)throw new Error("Look-and-Grab rendering budget is at most 80 distinct selected meshes.");
 const selectedSet=new Set(selected);
 const steps=Array.isArray(o.steps)?o.steps:[];
 if(steps.length<1 || steps.length>8)throw new Error("Look-and-Grab requires 1–8 steps.");
 const converted=steps.map((value,i)=>{
  if(!value || typeof value!=="object" || Array.isArray(value))throw new Error(`Invalid step ${i+1}.`);
  const s=value as Record<string,unknown>;
  for(const field of ["visible_asset_ids","highlighted_asset_ids"]){
   if(!Array.isArray(s[field]))throw new Error(`Step ${i+1} missing ${field}.`);
   for(const id of s[field] as unknown[])if(typeof id!=="string" || !byShort.has(id) || !selectedSet.has(byShort.get(id)!))
    throw new Error(`Step ${i+1} has an unselected/unavailable ${field} ID: ${String(id)}`);
  }
  return {...s,visible_asset_ids:(s.visible_asset_ids as string[]).map(id=>byShort.get(id)!),highlighted_asset_ids:(s.highlighted_asset_ids as string[]).map(id=>byShort.get(id)!)};
 });
 const unmet=Array.isArray(o.unmet_visual_needs)? [...new Set(o.unmet_visual_needs.filter((v):v is string=>typeof v==="string").map(v=>v.trim()).filter(v=>v.length>2&&v.length<=100))].slice(0,12):[];
 return {plan_raw:{...o,steps:converted},selected_ids:selected,unmet_visual_needs:unmet};
}
export function reportUnmetLookGrabNeeds(needs:string[],all:LookGrabEntry[],supplied:Set<string>){
 return needs.map(need=>{
  const term=normalizeAssetSearchText(need);
  const exact=all.filter(a=>[a.name,...a.aliases].some(s=>normalizeAssetSearchText(s)===term)).slice(0,8);
  return {need, exact_library_matches:exact.map(a=>({id:a.asset_id,name:a.name,was_supplied:supplied.has(a.asset_id)})),
    status: exact.length?(exact.some(a=>supplied.has(a.asset_id))?"available_in_prompt":"not_retrieved") : "no_exact_name_match_not_proof_of_absence"};
 });
}
export async function prepareLookGrabDiscovery(learnerMessage:string,mode:LookGrabMode,referenceNames:string[]=[]){
 const start=performance.now();
 const [snapshot,corpus,catalog]=await Promise.all([getAssetBrowserRegistrySnapshot(ATLAS_REVISION),getPreparedAssetSearchCorpus("bodyparts3d_full_atlas"),mode==="multiscale_v2"?readBodyParts3dFullCatalog():Promise.resolve(null)]);
 const verified=snapshot.assets.filter(isLookGrabAtlasAsset);
 if(!verified.length)throw new Error("No verified BodyParts3D meshes are available in the Asset Library.");
 const entries=makeLookGrabEntries(verified,corpus.documents);
 const allIds=new Set(verified.map(a=>a.asset_id));
 let selection=entries;
 let rankedCount=0;
 let multiscale:ReturnType<typeof discoverMultiscaleCandidates>|null=null;
 if(mode==="multiscale_v2"){
  multiscale=discoverMultiscaleCandidates({question:learnerMessage,documents:corpus.documents.filter(d=>allIds.has(d.asset_id)),catalog,
    search:(phrase,n)=>searchAssetLexicalIndexV1(corpus.lexical_index,{semantic_name:phrase,visual_role:phrase},n,n),limit:LOOK_GRAB_SEARCH_LIMIT});
  const order=multiscale.candidates.map(r=>r.asset_id);
  const rank=new Map(order.map((id,i)=>[id,i] as const));
  selection=entries.filter(a=>rank.has(a.asset_id)).sort((a,b)=>rank.get(a.asset_id)!-rank.get(b.asset_id)!);
  rankedCount=multiscale.lexical_candidates;
  if(!selection.length)throw new Error("Multiscale discovery found no verified candidates. Try Full Catalog; do not substitute unverified assets.");
 }
 if(mode==="search_assisted"){
  // Reuse actual BM25 index. The expanded limit is opt-in; normal Search Bench callers remain capped at 20.
  const ranked=searchAssetLexicalIndexV1(corpus.lexical_index,{semantic_name:learnerMessage,visual_role:learnerMessage},LOOK_GRAB_SEARCH_LIMIT,LOOK_GRAB_SEARCH_LIMIT);
  rankedCount=ranked.length;
  const order=ranked.filter(a=>allIds.has(a.asset_id)).map(a=>a.asset_id);
  const chosen=new Set(order);
  // Preserve all positive search results, no unrelated filler when the question has little lexical evidence.
  selection=entries.filter(a=>chosen.has(a.asset_id)).sort((a,b)=>order.indexOf(a.asset_id)-order.indexOf(b.asset_id));
  if(!selection.length)throw new Error("Search-assisted mode found no lexical matches. Try Full Catalog to examine the retrieval limitation.");
 }
 const suppliedIds=new Set(selection.map(a=>a.asset_id));
 const reference_checks=referenceNames.slice(0,12).map(term=>{
  const expected=normalizeAssetSearchText(term).replace(/^(left|right) /,'');
  const matches=entries.filter(a=>[a.name,...a.aliases].some(n=>normalizeAssetSearchText(n).replace(/^(left|right) /,'')===expected)).slice(0,16);
  return {requested:term, library_matches:matches.length, retrieved:matches.filter(a=>suppliedIds.has(a.asset_id)).length,
    matches:matches.map(a=>({id:a.asset_id,name:a.name,supplied:suppliedIds.has(a.asset_id)})),
    note:matches.length?undefined:'No exact normalized identity/alias match; not proof that the concept is absent.'};
 });
 const compact=JSON.stringify(selection.map(compactLookGrabRecord));
 if(compact.length>MAX_CATALOG_PROMPT_CHARS)throw new Error(`Full catalog is too large for a safe one-call benchmark (${compact.length} characters). No assets were silently truncated.`);
 const assetMap=new Map(verified.map(a=>[a.asset_id,a] as const));
 return {mode, entries:selection,all_entries:entries,verified_assets:selection.map(a=>sceneAsset(assetMap.get(a.asset_id)!)),
  compact_catalog:compact,
  diagnostics:{discovery_mode:mode,eligible_library_count:entries.length,provided_candidate_count:selection.length,bm25_positive_matches:rankedCount,
   inventory_characters:compact.length,inventory_approx_tokens:Math.ceil(compact.length/4),inventory_cap_characters:MAX_CATALOG_PROMPT_CHARS,
   cache_hit:corpus.cache_hit,atlas_cache_age_ms:Math.max(0,Date.now()-snapshot.built_at_ms),
   assembly_ms:Math.round(performance.now()-start),embedding_calls:0,selection_method:mode==="full_catalog"?"complete_verified_atlas_inventory":mode==="multiscale_v2"?"Evidence-gated BM25 + verified part_of + distinct is_a classification + region-identity hints; no weak-fill quotas":"BM25 V2 ranked search with no scene-role quotas",
   reference_checks,
   multiscale_evidence:multiscale?{direct_anchors:multiscale.direct_anchor_names,query_count:multiscale.query_count,lexical_candidates:multiscale.lexical_candidates,graph_candidates:multiscale.graph_candidates,context_candidates:multiscale.context_candidates,rejected_weak_lexical:multiscale.rejected_weak_lexical,weak_anchor_count:multiscale.weak_anchor_count,partof_candidates:multiscale.partof_candidates,classification_candidates:multiscale.classification_candidates,region_hints:multiscale.region_hints,parents:multiscale.parent_concepts,warnings:multiscale.warnings,sample:multiscale.candidates.slice(0,40).map(c=>({id:c.asset_id,name:entries.find(a=>a.asset_id===c.asset_id)?.name??c.asset_id,channels:c.channels}))}:null}};
}
