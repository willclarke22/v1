
import { NextResponse } from "next/server";
import { readBodyParts3dFullCatalog } from "../../assets/bodyparts3d-full-import.server";
import { GET as readAnatomyAtlasRoute } from "./anatomy-atlas";
import { ASSEMBLY_PROFILES, ASSEMBLY_STUDIO_SCHEMA, normalizedReview, type AssemblyAsset } from "../anatomy-assemblies/contract";
import { atlasFingerprint, proposedAssemblies } from "../anatomy-assemblies/build";
import { buildSpatialIndex } from "../anatomy-assemblies/spatial-discovery";
import { generateAutomaticAssemblies } from "../anatomy-assemblies/automatic-spatial";
import { readAssemblyReviews, writeAssemblyReviews, reviewStorageLabel } from "../anatomy-assemblies/storage.server";

/** Read-only reuse of the established atlas eligibility/transform pipeline.
 * A later refactor may extract its snapshot builder into a shared server service. */
async function verifiedAssets():Promise<AssemblyAsset[]>{
 const response=await readAnatomyAtlasRoute(new Request("http://myway.local/api/sandbox/probe-lab/visual-experience/anatomy-atlas"));
 const payload=await response.json() as {ok?:boolean;assets?:AssemblyAsset[];error?:string};
 if(!response.ok||!payload.ok||!Array.isArray(payload.assets))throw new Error(payload.error??"Verified atlas manifest unavailable.");
 return payload.assets;
}
const errorResponse=(error:unknown,status=500)=>NextResponse.json({ok:false,schema_version:ASSEMBLY_STUDIO_SCHEMA,error:error instanceof Error?error.message:String(error)},{status});
export async function GET(){
 try{
  const [assets,catalog,store]=await Promise.all([verifiedAssets(),readBodyParts3dFullCatalog(),readAssemblyReviews()]);
  if(!catalog)throw new Error("BodyParts3D anatomical catalog is missing or incomplete; no position-based fallback is allowed.");
  const fingerprint=atlasFingerprint(assets,catalog);const assemblies=proposedAssemblies(assets,store.reviews,catalog,fingerprint);
  const generated=generateAutomaticAssemblies(assets,fingerprint);
  const assigned=new Set(assemblies.flatMap(a=>a.suggested_asset_ids));const unassigned=assets.filter(a=>!assigned.has(a.asset_id));
  return NextResponse.json({ok:true,schema_version:ASSEMBLY_STUDIO_SCHEMA,atlas_fingerprint:fingerprint,storage:reviewStorageLabel(),assets:assets.map(({asset_id,member_id,label,system})=>({asset_id,member_id,label,system})),assemblies,generated,spatial_index:buildSpatialIndex(assets),audit:{expected_atlas_count:2234,eligible_count:assets.length,catalog_element_count:catalog.elements.length,assigned_unique_count:assigned.size,unassigned_asset_ids:unassigned.map(a=>a.asset_id),unassigned_count:unassigned.length},notes:["Membership is expanded only through BodyParts3D part-of relationships; is-a is not treated as anatomical containment.","Unassigned and ambiguous elements are reported without positional guessing.","No automated visual-completeness claims; human preview and review required."]},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return errorResponse(error)}
}
export async function POST(request:Request){
 try{
  const bodyText=await request.text();if(bodyText.length>75_000)return errorResponse("Review payload too large.",413);
  const body=JSON.parse(bodyText) as Record<string,unknown>;
  if(body.action!=="save_review")return errorResponse("Unknown action.",400);
  const id=body.assembly_id;
  if(typeof id!=="string"||!ASSEMBLY_PROFILES.some(p=>p.id===id))return errorResponse("Unknown assembly id.",400);
  const expected_revision=body.expected_revision;
  if(typeof expected_revision!=="number"||!Number.isSafeInteger(expected_revision)||expected_revision<0)return errorResponse("Invalid expected revision.",400);
  const [assets,catalog]=await Promise.all([verifiedAssets(),readBodyParts3dFullCatalog()]);
  if(!catalog)throw new Error("BodyParts3D anatomical catalog is missing or incomplete; cannot save a review.");
  const fingerprint=atlasFingerprint(assets,catalog);
  if(body.atlas_fingerprint!==fingerprint)return errorResponse("Atlas inventory changed; refresh the studio before saving.",409);
  const store=await readAssemblyReviews();const old=store.reviews[id];
  if((old?.revision??0)!==expected_revision)return errorResponse("Another review version was saved; refresh before overwriting.",409);
  const next=normalizedReview(body.review,id,fingerprint,expected_revision+1);
  const eligible=new Set(assets.map(asset=>asset.asset_id));
  for(const assetId of [...next.add_asset_ids,...next.exclude_asset_ids])if(!eligible.has(assetId))return errorResponse(`Asset is not eligible in the verified atlas: ${assetId}`,400);
  if(next.add_asset_ids.some(id=>next.exclude_asset_ids.includes(id)))return errorResponse("The same asset cannot be both added and excluded.",400);
  if(old?.source_fingerprint!==undefined&&old.source_fingerprint!==fingerprint&&next.reviewed)return errorResponse("Previous review was for a different atlas; unmark Reviewed and recheck this assembly before approval.",409);
  if(next.reviewed&&["inventory","anatomical_coverage","visual_coverage"].some(k=>next.checks[k as keyof typeof next.checks]!=="pass"))return errorResponse("To mark reviewed, inventory, anatomical and visual coverage checks must each be Pass.",400);
  if(next.reviewed&&next.notes.length<20)return errorResponse("Document which views and layers were inspected before marking reviewed (20+ characters).",400);
  const profile=ASSEMBLY_PROFILES.find(p=>p.id===id)!;
  const candidate=proposedAssemblies(assets,{[id]:next},catalog,fingerprint).find(a=>a.profile.id===profile.id)!;
  if(next.reviewed&&(!candidate.asset_ids.length||candidate.inventory.missing_references.length||candidate.inventory.ontology_unavailable))return errorResponse("Reviewed assemblies must have available members and no unresolved references.",400);
  next.updated_at=new Date().toISOString();store.reviews[id]=next;
  const location=await writeAssemblyReviews(store);
  return NextResponse.json({ok:true,schema_version:ASSEMBLY_STUDIO_SCHEMA,storage:location,assembly:proposedAssemblies(assets,store.reviews,catalog,fingerprint).find(a=>a.profile.id===id)},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return errorResponse(error,error instanceof SyntaxError?400:500)}
}