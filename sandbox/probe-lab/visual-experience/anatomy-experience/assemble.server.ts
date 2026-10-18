import { getAssetBrowserRegistrySnapshot } from "../../assets/asset-browser-snapshot.server";
import { readBodyParts3dFullCatalog, type BodyParts3dFullCatalogV1 } from "../../assets/bodyparts3d-full-import.server";
import { BODYPARTS3D_FULL_COLLECTION_ID, bodyParts3dSystemFromGroupTags } from "../../assets/bodyparts3d-slp-pilot";
import { getPreparedAssetSearchCorpus } from "../../assets/search/asset-search-bench.server";
import { searchAssetLexicalIndexV1, normalizeAssetSearchText } from "../../assets/search/asset-lexical-search";
import { semanticSearchServingSnapshotStatusV2, runSemanticAssetSearchServingV2 } from "../../assets/search/asset-semantic-embedding-pilot-v2.server";
import type { MyWayAssetRecord } from "../../assets/asset-types";
import type { AnatomySceneAsset } from "./contract";
import {chooseBalancedAnatomyContext, type ContextCandidate} from "./context-selection";

const MAX = 50;
const ATLAS_REVISION = "myway_bodyparts3d_atlas_assembly_v1";
const norm = (s:string) => normalizeAssetSearchText(s);
const finiteVec = (raw:unknown, fallback:[number,number,number]):[number,number,number] =>
  Array.isArray(raw) && raw.length===3 && raw.every(x=>typeof x==='number'&&Number.isFinite(x)) ? raw as [number,number,number] : fallback;
const vectors = (a:MyWayAssetRecord) => {
  const t=a.collection_membership?.runtime_transform;
  return {position:finiteVec(t?.position,[0,0,0]),rotation:finiteVec(t?.rotation,[0,0,0]),scale:finiteVec(t?.scale,[1,1,1])};
};

type Prepared = { assets:AnatomySceneAsset[];focal_name:string;diagnostics:Record<string,unknown> };
type Evidence = {score:number;reasons:Set<string>;focal:boolean};
type Catalog = NonNullable<Awaited<ReturnType<typeof readBodyParts3dFullCatalog>>>;
type Snapshot = Awaited<ReturnType<typeof getAssetBrowserRegistrySnapshot>>;
type Corpus = Awaited<ReturnType<typeof getPreparedAssetSearchCorpus>>;
let contextCache: {created:number;snapshot:Snapshot;catalog:Catalog;corpus:Corpus}|null=null;
let contextPending:Promise<{snapshot:Snapshot;catalog:Catalog;corpus:Corpus;hit:boolean}>|null=null;
const CACHE_MS=5*60_000;
async function getContextSources(){
  if(contextCache && Date.now()-contextCache.created<CACHE_MS)return {...contextCache,hit:true};
  if(contextPending)return contextPending;
  contextPending=(async()=>{
    const [snapshot,catalog,corpus]=await Promise.all([
      getAssetBrowserRegistrySnapshot(ATLAS_REVISION),readBodyParts3dFullCatalog(),getPreparedAssetSearchCorpus("bodyparts3d_full_atlas"),
    ]);
    if(!catalog)throw new Error("BodyParts3D concept catalog unavailable.");
    contextCache={created:Date.now(),snapshot,catalog,corpus};
    return {...contextCache,hit:false};
  })();
  try{return await contextPending;}finally{contextPending=null;}
}
function graphFor(catalog:BodyParts3dFullCatalogV1){
  const byId=new Map(catalog.concepts.map(c=>[c.concept_id,c] as const));
  const parents=new Map<string,Set<string>>();
  const children=new Map<string,Set<string>>();
  for(const r of [...catalog.partof_relations,...catalog.isa_relations]){
    if(!parents.has(r.child_id))parents.set(r.child_id,new Set());
    parents.get(r.child_id)!.add(r.parent_id);
    if(!children.has(r.parent_id))children.set(r.parent_id,new Set());
    children.get(r.parent_id)!.add(r.child_id);
  }
  return {byId,parents,children};
}
function breadthFirstParents(start:string,parents:Map<string,Set<string>>,depth=3){
  const found=new Map<string,number>();let frontier=[start];
  for(let level=1;level<=depth;level++){
    const next:string[]=[];
    for(const id of frontier)for(const parent of parents.get(id)??[]){
      if(parent===start||found.has(parent))continue;
      found.set(parent,level);next.push(parent);
    }
    frontier=next;
  }
  return found;
}
function spatialCandidateDistance(a:MyWayAssetRecord,b:MyWayAssetRecord){
  // Saved transform origins are not guaranteed to be mesh centres. Proximity is
  // supportive evidence only: never assert contact, attachments, or biomechanics.
  const p=vectors(a).position,q=vectors(b).position;
  const d=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
  const dimsA=finiteVec(a.dimensions_m,[0,0,0]);const dimsB=finiteVec(b.dimensions_m,[0,0,0]);
  // Conservative coarse radius compensation; no local/world bounds equivalence assumed.
  const rA=Math.max(...dimsA)/2,rB=Math.max(...dimsB)/2;
  const correction=rA>0&&rA<0.4&&rB>0&&rB<0.4?Math.min(0.035,(rA+rB)*0.25):0;
  return Math.max(0,d-correction);
}
export async function assembleAnatomyContext(learnerMessage:string,useSemantic:boolean):Promise<Prepared>{
  const start=performance.now();
  const sources=await getContextSources();
  const {catalog,snapshot,corpus}=sources;
  const valid=snapshot.assets.filter(a=>a.collection_membership?.collection_id===BODYPARTS3D_FULL_COLLECTION_ID && a.collection_membership.runtime_collection_space==='glb_y_up_meters' && a.asset_type==='glb' && a.status!=='rejected' && a.scene_review_status!=='rejected' && a.semantic_review_status!=='rejected' && a.semantic_review_status!=='mismatch' && a.safe_to_use_in_sandbox!==false && Boolean(a.public_path?.trim()));
  const byId=new Map(valid.map(a=>[a.asset_id,a] as const));
  const byMember=new Map(valid.map(a=>[a.collection_membership!.member_id.toLowerCase(),a] as const));
  const {byId:conceptById,parents,children}=graphFor(catalog);
  const elementsByConcept=new Map<string,MyWayAssetRecord[]>();
  for(const c of catalog.concepts){
    const resolved=c.element_ids.map(m=>byMember.get(m.toLowerCase())).filter((a):a is MyWayAssetRecord=>Boolean(a));
    if(resolved.length)elementsByConcept.set(c.concept_id,resolved);
  }
  const question=norm(learnerMessage);
  const mentions=catalog.concepts.filter(c=>{
    const name=norm(c.name);
    return name.length>=5 && question.includes(name) && (question===name||question.includes(` ${name} `)||question.startsWith(`${name} `)||question.endsWith(` ${name}`));
  }).sort((a,b)=>b.name.length-a.name.length);
  const focal=mentions[0]??null;
  const focalName=focal?.name??(learnerMessage.match(/(?:how|where|what) (?:does|is|the) (.+?)(?: work| move| function| when|\?|\.)/i)?.[1]??learnerMessage).slice(0,100);
  const evidence=new Map<string,Evidence>();
  function add(id:string,score:number,why:string,isFocal=false){
    if(!byId.has(id))return;
    const prior=evidence.get(id)??{score:0,reasons:new Set<string>(),focal:false};
    prior.score=Math.max(prior.score,score);prior.reasons.add(why);prior.focal ||=isFocal;
    evidence.set(id,prior);
  }
  function addConcept(id:string,score:number,reason:string,focalAsset=false){
    for(const asset of elementsByConcept.get(id)??[])add(asset.asset_id,score,reason,focalAsset);
  }
  for(const c of mentions.slice(0,3))addConcept(c.concept_id,110,'exact named concept',c.concept_id===focal?.concept_id);
  const lexical=searchAssetLexicalIndexV1(corpus.lexical_index,{semantic_name:focalName,visual_role:learnerMessage},20);
  for(const r of lexical)add(r.asset_id,Math.max(18,87-r.rank*3),'BM25 question search');
  const ancestorSteps=focal?breadthFirstParents(focal.concept_id,parents,3):new Map<string,number>();
  let protectedParents=0;
  for(const [parent,depth] of ancestorSteps){
    if(depth<=2)addConcept(parent,depth===1?67:40,`ontology parent depth ${depth}`);
    // Siblings from specific parents only. Avoid high-fanout head/body explosion.
    const siblings=children.get(parent);
    if(!siblings||siblings.size>30)continue;
    protectedParents++;
    for(const id of siblings)if(id!==focal?.concept_id)addConcept(id,depth===1?45:27,`specific ontology sibling depth ${depth}`);
  }
  // Retrieve anatomical landmarks and surroundings from region concepts, rather than
  // only retrieving lexical siblings of the muscle. Still purely deterministic.
  const ancestorNames=[...ancestorSteps].sort((a,b)=>a[1]-b[1]).map(([id])=>conceptById.get(id)?.name??'').filter(Boolean);
  const regionQueries=[...new Set(ancestorNames.map(norm).filter(x=>x.length>=4))].slice(0,5);
  // Broad regional terms are used only if they appear in the verified ontology chain.
  // We do not claim structures such as a soft palate or skull exist until grounded.
  const regionWords=new Set(regionQueries.flatMap(x=>x.split(' ')).filter(x=>x.length>=4));
  let contextLexical=0;
  for(const region of regionQueries){
    const regional=searchAssetLexicalIndexV1(corpus.lexical_index,{semantic_name:region,visual_role:'anatomical location surrounding structures and landmarks'},12);
    contextLexical+=regional.length;
    for(const r of regional)add(r.asset_id,Math.max(22,55-r.rank*2),`region BM25: ${region.slice(0,40)}`);
  }
  // When ontology is incomplete, query descriptive terms already present in the learner's request.
  if(!regionQueries.length){
    const supplemental=searchAssetLexicalIndexV1(corpus.lexical_index,{semantic_name:focalName,semantic_tags:['surrounding anatomy','location','orientation']},15);
    contextLexical+=supplemental.length;
    for(const r of supplemental)add(r.asset_id,Math.max(16,45-r.rank),"context BM25");
  }
  const focalAssets=valid.filter(a=>evidence.get(a.asset_id)?.focal);
  const anchors=focalAssets.length?focalAssets.slice(0,6):lexical.slice(0,2).map(r=>byId.get(r.asset_id)).filter((a):a is MyWayAssetRecord=>Boolean(a));
  let proximityHits=0;
  // Geometry provenance matters: all-zero / duplicated transform origins cannot
  // identify physical neighbours. Avoid promoting unrelated atlas elements.
  const originCounts=new Map<string,number>();
  for(const asset of valid){const key=vectors(asset).position.map(x=>x.toFixed(4)).join(':');originCounts.set(key,(originCounts.get(key)??0)+1)}
  const degenerateOrigins=(Math.max(0,...originCounts.values())/Math.max(1,valid.length))>0.25;
  if(anchors.length)for(const candidate of valid){
    if(evidence.get(candidate.asset_id)?.focal)continue;
    const label=norm(candidate.verified_canonical_label||candidate.collection_membership?.concept_name||candidate.canonical_label||candidate.display_name);
    // When transforms are weak evidence, require a verified matching region name.
    if(degenerateOrigins && ![...regionWords].some(term=>label.includes(term)))continue;
    const d=Math.min(...anchors.map(anchor=>spatialCandidateDistance(anchor,candidate)));
    if(d>0.095)continue;
    const system=bodyParts3dSystemFromGroupTags(candidate.collection_membership!.group_tags)??'connective';
    if(!['skeletal','muscular','digestive','respiratory','connective','nervous','cardiovascular'].includes(system))continue;
    proximityHits++;
    add(candidate.asset_id,Math.max(14,35-d*120),'approximate atlas proximity (unvalidated origin)');
  }
  const semantic=semanticSearchServingSnapshotStatusV2();
  let embeddingCalls=0;let semanticError:string|null=null;
  if(useSemantic&&semantic.ready&&semantic.asset_collection_mode==='bodyparts3d_full_atlas')try{
    const result=await runSemanticAssetSearchServingV2({semantic_concept:focalName,visual_role:learnerMessage,asset_collection_mode:'bodyparts3d_full_atlas',limit:20});
    embeddingCalls=result.embedding_calls;
    for(const match of result.candidate_union)add(match.asset_id,59,'published V2 semantic vector');
  }catch(error){semanticError=error instanceof Error?error.message:String(error)}
  const candidates:ContextCandidate[]=[...evidence].map(([id,data])=>{
    const a=byId.get(id)!;
    return {asset_id:id,label:a.verified_canonical_label||a.collection_membership!.concept_name||a.canonical_label||a.display_name,system:bodyParts3dSystemFromGroupTags(a.collection_membership!.group_tags)??'connective',score:data.score,reasons:[...data.reasons],focal:data.focal};
  });
  const chosen=chooseBalancedAnatomyContext(candidates,MAX);
  const assets:AnatomySceneAsset[]=chosen.selected.map(item=>{
    const a=byId.get(item.asset_id)!;const m=a.collection_membership!;const raw=a.public_path!.trim();
    return {asset_id:item.asset_id,member_id:m.member_id,label:item.label,system:item.system,model_url:/^https:\/\//i.test(raw)?`/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=${encodeURIComponent(item.asset_id)}&revision=${ATLAS_REVISION}`:raw,runtime_transform:vectors(a),dimensions_m:finiteVec(a.dimensions_m,[0,0,0]),reason:item.reasons.join('; '),context_role:item.context_role};
  });
  const coverageWarnings:string[]=[];
  if(!focalAssets.length)coverageWarnings.push('No exact focal geometry resolved; model should disclose target uncertainty.');
  if(!chosen.selected_counts.orientation)coverageWarnings.push('No skeletal orientation landmarks selected. Inspect available head/neck catalog before assuming none exist.');
  if(!chosen.selected_counts.environment)coverageWarnings.push('No non-muscle environment meshes selected.');
  return {assets,focal_name:focalName,diagnostics:{
    context_assembler_version:'myway_anatomy_context_v2',candidate_count:evidence.size,selected_asset_count:assets.length,
    exact_concept_matches:mentions.length,lexical_results:lexical.length,regional_lexical_results:contextLexical,
    ontology_ancestors_considered:ancestorSteps.size,ontology_specific_parents:protectedParents,proximity_candidates:proximityHits,
    context_role_counts:chosen.selected_counts,context_candidate_counts:chosen.candidate_counts,context_budgets:chosen.budgets,
    context_coverage_warnings:coverageWarnings,
    selected_evidence:chosen.selected.map(a=>({id:a.asset_id,label:a.label,system:a.system,role:a.context_role,score:a.score,reasons:a.reasons})),
    atlas_cache_hit:sources.hit,cache_hit:corpus.cache_hit,semantic_snapshot_ready:semantic.ready,semantic_snapshot_assets:semantic.asset_count,
    semantic_status:semanticError??(embeddingCalls?'V2 semantic retrieval used':'Semantic snapshot unavailable or not requested; BM25 + ontology used'),
    embedding_calls:embeddingCalls,ontology_relation_count:catalog.partof_relations.length+catalog.isa_relations.length,
    spatial_quality:degenerateOrigins?'duplicated atlas origins: spatial candidates require ontology-region label agreement':'approximate transform-origin proximity; true world-space bounds not verified',
    assembly_ms:Math.round(performance.now()-start),
  }};
}
