import { getAssetBrowserRegistrySnapshot } from "../../assets/asset-browser-snapshot.server";
import { readBodyParts3dFullCatalog } from "../../assets/bodyparts3d-full-import.server";
import { BODYPARTS3D_FULL_COLLECTION_ID, bodyParts3dSystemFromGroupTags } from "../../assets/bodyparts3d-slp-pilot";
import { getPreparedAssetSearchCorpus } from "../../assets/search/asset-search-bench.server";
import { searchAssetLexicalIndexV1, normalizeAssetSearchText } from "../../assets/search/asset-lexical-search";
import { semanticSearchServingSnapshotStatusV2, runSemanticAssetSearchServingV2 } from "../../assets/search/asset-semantic-embedding-pilot-v2.server";
import type { AnatomySceneAsset } from "./contract";

type Prepared = { assets: AnatomySceneAsset[]; focal_name: string; diagnostics: Record<string,unknown> };
const MAX=50;
const norm = (s: string) => normalizeAssetSearchText(s);
const finiteVec = (raw: unknown, fallback:[number,number,number]):[number,number,number] =>
  Array.isArray(raw) && raw.length===3 && raw.every(x=>typeof x==='number'&&Number.isFinite(x)) ? raw as [number,number,number] : fallback;
const vectors=(asset: {collection_membership?: {runtime_transform?: {position?: unknown;rotation?:unknown;scale?:unknown}} | null})=>{
  const v=asset.collection_membership?.runtime_transform;
  return {position:finiteVec(v?.position,[0,0,0]),rotation:finiteVec(v?.rotation,[0,0,0]),scale:finiteVec(v?.scale,[1,1,1])};
};
export async function assembleAnatomyContext(learnerMessage:string,useSemantic:boolean):Promise<Prepared>{
 const started=performance.now();
 const [snapshot,catalog,corpus]=await Promise.all([
   getAssetBrowserRegistrySnapshot('myway_bodyparts3d_atlas_assembly_v1'),
   readBodyParts3dFullCatalog(),
   getPreparedAssetSearchCorpus('bodyparts3d_full_atlas'),
 ]);
 if(!catalog) throw new Error('BodyParts3D concept catalog unavailable.');
 const catalogConcepts = catalog.concepts; // Stable non-null alias for nested helper closure.
 const valid=snapshot.assets.filter(a=>a.collection_membership?.collection_id===BODYPARTS3D_FULL_COLLECTION_ID && a.collection_membership.runtime_collection_space==='glb_y_up_meters' && a.asset_type==='glb' && a.status!=='rejected' && a.scene_review_status!=='rejected' && a.semantic_review_status!=='rejected' && a.semantic_review_status!=='mismatch' && a.safe_to_use_in_sandbox!==false && Boolean(a.public_path?.trim()));
 const byMember=new Map(valid.map(a=>[a.collection_membership!.member_id.toLowerCase(),a]));
 const byId=new Map(valid.map(a=>[a.asset_id,a]));
 const question=norm(learnerMessage);
 const mentions=catalog.concepts.filter(c=>{
   const n=norm(c.name); return n.length>=5 && question.includes(n) && (question===n||question.includes(` ${n} `)||question.startsWith(`${n} `)||question.endsWith(` ${n}`));
 }).sort((a,b)=>b.name.length-a.name.length);
 const focal=mentions[0] ?? null;
 const focalName=focal?.name ?? (learnerMessage.match(/(?:how|where|what) (?:does|is|the) (.+?)(?: work| move| function| when|\?|\.)/i)?.[1] ?? learnerMessage).slice(0,100);
 const evidence=new Map<string,{score:number; reasons:Set<string>}>();
 function add(assetId:string,score:number,reason:string){if(!byId.has(assetId))return;const current=evidence.get(assetId)??{score:0,reasons:new Set<string>()};current.score=Math.max(current.score,score);current.reasons.add(reason);evidence.set(assetId,current);}
 function addConcept(id:string,score:number,reason:string){const c=catalogConcepts.find(x=>x.concept_id===id);if(!c)return;for(const member of c.element_ids){const a=byMember.get(member.toLowerCase());if(a)add(a.asset_id,score,reason);}}
 // Specific named concepts are stronger evidence than generic full-sentence BM25.
 for (const c of mentions.slice(0,3)) addConcept(c.concept_id,100,'exact named concept');
 const lexical=searchAssetLexicalIndexV1(corpus.lexical_index,{semantic_name:focalName,visual_role:learnerMessage},20);
 for(const r of lexical)add(r.asset_id, Math.max(12,85-r.rank*3),'cached lexical / ontology BM25');
 if(focal){
   const adjacent=new Set<string>();
   for(const rel of [...catalog.partof_relations,...catalog.isa_relations]){
     if(rel.child_id===focal.concept_id) adjacent.add(rel.parent_id);
     if(rel.parent_id===focal.concept_id) adjacent.add(rel.child_id);
   }
   for(const id of adjacent)addConcept(id,46,'one-hop ontology');
   // Siblings share a specific parent; avoid unrestricted descendant explosions.
   for(const rel of catalog.partof_relations){
     if(!adjacent.has(rel.parent_id))continue;
     addConcept(rel.child_id,29,'shared anatomical parent');
   }
 }
 // Neighbouring geometry is ranked only after a strong verified focal match.
 const focalCandidates=[...evidence].filter(([,v])=>v.score>=80).slice(0,5).map(([id])=>byId.get(id)!).filter(Boolean);
 if(focalCandidates.length){
   const anchors=focalCandidates.map(a=>vectors(a).position);
   for(const asset of valid){
     if(evidence.has(asset.asset_id))continue;
     const p=vectors(asset).position;
     const dist=Math.min(...anchors.map(q=>Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2])));
     // Conservative atlas-metre radius; proximity is weak evidence, never proof of function.
     if(dist>0.055)continue;
     const system=bodyParts3dSystemFromGroupTags(asset.collection_membership!.group_tags)??'connective';
     if(!['skeletal','muscular','digestive','respiratory','connective','nervous'].includes(system))continue;
     add(asset.asset_id,Math.max(8,23-dist*140),'spatial proximity (weak)');
   }
 }
 const ranked=[...evidence].sort((a,b)=>b[1].score-a[1].score).slice(0,MAX);
 const assets: AnatomySceneAsset[]=ranked.map(([id,data])=>{
   const a=byId.get(id)!;const m=a.collection_membership!;
   const raw=a.public_path!.trim();
   const url=/^https:\/\//i.test(raw)?`/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=${encodeURIComponent(id)}&revision=myway_bodyparts3d_atlas_assembly_v1`:raw;
   return {asset_id:id,member_id:m.member_id,label:a.verified_canonical_label||m.concept_name||a.canonical_label||a.display_name,system:bodyParts3dSystemFromGroupTags(m.group_tags)??'connective',model_url:url,runtime_transform:vectors(a),dimensions_m:finiteVec(a.dimensions_m,[0,0,0]),reason:[...data.reasons].join('; ')};
 });
 const semantic=semanticSearchServingSnapshotStatusV2();
 let embeddingCalls=0;let semanticError:string|null=null;
 if(useSemantic && semantic.ready && semantic.asset_collection_mode==='bodyparts3d_full_atlas'){
   try{
     const result=await runSemanticAssetSearchServingV2({semantic_concept:focalName,visual_role:learnerMessage,asset_collection_mode:'bodyparts3d_full_atlas',limit:20});
     embeddingCalls=result.embedding_calls;
     for(const match of result.candidate_union){add(match.asset_id,55,'published semantic embedding V2');}
     // Merge any semantic candidates into the same verified, bounded cast.
     const revised=[...evidence].sort((a,b)=>b[1].score-a[1].score).slice(0,MAX);
     const desired=new Set(revised.map(([id])=>id));
     for(let i=assets.length-1;i>=0;i--)if(!desired.has(assets[i]!.asset_id))assets.splice(i,1);
     for(const [id,data] of revised){
       if(assets.some(a=>a.asset_id===id))continue;
       const a=byId.get(id);if(!a)continue;
       const m=a.collection_membership!;const raw=a.public_path!.trim();
       assets.push({asset_id:id,member_id:m.member_id,label:a.verified_canonical_label||m.concept_name||a.canonical_label||a.display_name,system:bodyParts3dSystemFromGroupTags(m.group_tags)??'connective',model_url:/^https:\/\//i.test(raw)?`/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=${encodeURIComponent(id)}&revision=myway_bodyparts3d_atlas_assembly_v1`:raw,runtime_transform:vectors(a),dimensions_m:finiteVec(a.dimensions_m,[0,0,0]),reason:[...data.reasons].join('; ')});
     }
     const order=new Map(revised.map(([id],i)=>[id,i]));assets.sort((a,b)=>(order.get(a.asset_id)??MAX)-(order.get(b.asset_id)??MAX));assets.splice(MAX);
   }catch(error){semanticError=error instanceof Error?error.message:String(error)}
 }
 return {assets,focal_name:focalName,diagnostics:{candidate_count:evidence.size,selected_asset_count:assets.length,exact_concept_matches:mentions.length,lexical_results:lexical.length,cache_hit:corpus.cache_hit,semantic_snapshot_ready:semantic.ready,semantic_snapshot_assets:semantic.asset_count,semantic_status:semanticError ?? (embeddingCalls ? 'V2 embedding retrieval used' : 'Semantic snapshot unavailable or not requested; BM25 + ontology used'),embedding_calls:embeddingCalls,ontology_relation_count:catalog.partof_relations.length+catalog.isa_relations.length,assembly_ms:Math.round(performance.now()-started)}};
}
