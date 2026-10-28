/** V3.7D.2B: experimental-only label indexing + stable initial scene placement.
 * Existing topic_state->topic_vectors SQL trigger owns the pgvector sync.
 * The full global semantic layout worker remains blocked and is NOT invoked here.
 */
import "server-only";
import { embedText } from "@/lib/vector/embed";
import { computeDeterministicTopicPosition, isTopicPosition3D, resolveTopicLayout, type TopicPosition3D } from "@/lib/learning-space/topic-position";
import type { TopicStateRow } from "@/lib/persistence/read";

export type IndexPreparation={vector:number[];model:string;position:TopicPosition3D;semanticPosition:TopicPosition3D|null;positionMethod:string|null};
export const embeddingModelIdentity=()=>process.env.MYWAY_EMBEDDING_MODEL??process.env.EMBEDDING_MODEL??"local-embedding-service";
export function is384Vector(v:unknown):v is number[]{return Array.isArray(v)&&v.length===384&&v.every(x=>typeof x==="number"&&Number.isFinite(x));}
export function cosine(a:number[],b:number[]):number{
 let dot=0, aa=0,bb=0;for(let i=0;i<384;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
 return aa>0&&bb>0?dot/Math.sqrt(aa*bb):-1;
}
const dist=(a:TopicPosition3D,b:TopicPosition3D)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const round=(a:TopicPosition3D):TopicPosition3D=>[Number(a[0].toFixed(5)),Number(a[1].toFixed(5)),Number(a[2].toFixed(5))];
/** Never reflow established spheres. If a genuinely related neighbour is already
 * spatially anchored, create a nearby, nonoverlapping target. Otherwise take a
 * collision-checked deterministic slot, marked as an initial (not global) layout.
 */
export function initialTopicPlacement(rows:TopicStateRow[],vector:number[]):Pick<IndexPreparation,"position"|"semanticPosition"|"positionMethod">{
 const occupied=rows.map((r,i)=>resolveTopicLayout({topicId:r.topic_id,index:i,topicPosition:r.topic_position,semanticPosition:r.semantic_position,semanticPositionMethod:r.semantic_position_method,semanticPositionUpdatedAt:r.semantic_position_updated_at,topicJson:r.topic_json}).position).filter(isTopicPosition3D);
 const candidates=rows.map((r,i)=>({row:r,i,sim:is384Vector(r.topic_label_embedding_centroid) && r.topic_label_embedding_model===embeddingModelIdentity()?cosine(vector,r.topic_label_embedding_centroid):-1})).sort((a,b)=>b.sim-a.sim);
 const near=candidates[0];
 if(near&&near.sim>=0.60){
  const anchor=resolveTopicLayout({topicId:near.row.topic_id,index:near.i,topicPosition:near.row.topic_position,semanticPosition:near.row.semantic_position,semanticPositionMethod:near.row.semantic_position_method,semanticPositionUpdatedAt:near.row.semantic_position_updated_at,topicJson:near.row.topic_json}).position;
  for(let j=0;j<20;j++){
   const radians=j*2.399963229728653;const radius=3.2+Math.floor(j/7)*1.3;
   const candidate=round([anchor[0]+Math.cos(radians)*radius,anchor[1]+((j%3)-1)*.65,anchor[2]+Math.sin(radians)*radius]);
   if(occupied.every(p=>dist(p,candidate)>=2.75))return {position:candidate,semanticPosition:candidate,positionMethod:"sandbox_local_neighbour_v37d2b"};
  }
 }
 for(let j=0;j<500;j++){
  const candidate=computeDeterministicTopicPosition(rows.length+1+j);
  if(occupied.every(p=>dist(p,candidate)>=2.75))return {position:round(candidate),semanticPosition:null,positionMethod:null};
 }
 throw Error("No safe initial topic position available");
}
export async function prepareTopicIndex(label:string,rows:TopicStateRow[]):Promise<IndexPreparation>{
 if(!process.env.EMBEDDINGS_URL?.trim())throw Error("Embedding service not configured. No topic write attempted.");
 const model=embeddingModelIdentity();if(!model.trim())throw Error("Embedding model identifier missing");
 const vector=await embedText(label);
 if(!is384Vector(vector)||cosine(vector,vector)<0.999)throw Error("Embedding service returned an invalid/zero 384-D vector");
 const placement=initialTopicPlacement(rows,vector);
 return {vector,model,...placement};
}
