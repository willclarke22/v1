/** Evidence retrieval, including candidate-root queries and counter-evidence; scores never imply true roots. */
import {localMiniLM} from './s16b60-retrieval.mjs';
const clone=x=>structuredClone(x);
const stop=new Set('the that with from were have about when which there their answer think would could what more less this does just some then only'.split(' '));
const tok=s=>new Set((String(s??'').toLowerCase().match(/[a-z0-9]{3,}/g)??[]).filter(x=>!stop.has(x)));
function lexical(a,b){const A=tok(a),B=tok(b);let hit=0;for(const w of A)if(B.has(w))hit++;return hit/Math.sqrt(Math.max(A.size*B.size,1));}
export function cosine(a,b){if(!a||!b||a.length!==b.length)throw Error('Embedding dimension mismatch');let n=0,x=0,y=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))throw Error('Nonfinite embedding');n+=a[i]*b[i];x+=a[i]*a[i];y+=b[i]*b[i];}return x&&y?n/Math.sqrt(x*y):0;}
export async function retrieve(state,current,{method='lexical',cap=12,embeddingTransport,embedFn,additionalQuery=null}={}){
 if(!['lexical','semantic','mixed'].includes(method)||cap<4||cap>20)throw Error('Bad retrieval configuration');
 const prior=state.observations.filter(x=>x.id!==current.id),roots=state.records.filter(r=>['root','shared_root'].includes(r.type)&&r.status!=='historical');
 // Retrieval uses the latest evidence and separate root hypotheses for cross-topic discovery.
 const rootQueries=roots.slice(-5).map(r=>r.claim),queries=[current.text,...rootQueries];if(additionalQuery)queries.push(additionalQuery);
 const priorTexts=prior.map(o=>o.compact_index_text??o.text);
 let embeddings=null;
 if(method!=='lexical'){
  const texts=[...queries,...priorTexts];
  const vectors=embedFn?await embedFn(texts):await localMiniLM(texts,{transport:embeddingTransport});
  if(!Array.isArray(vectors)||vectors.length!==texts.length||vectors.some(v=>!Array.isArray(v)||v.length<30))throw Error('Embedding transport returned invalid vectors');embeddings=vectors;
 }
 const ranked=prior.map((o,i)=>{
  const t=priorTexts[i];let score=lexical(current.text,t);
  if(rootQueries.length)score=Math.max(score,...rootQueries.map(q=>lexical(q,t)*0.88));
  if(additionalQuery)score=Math.max(score,lexical(additionalQuery,t));
  if(embeddings){let sem=Math.max(...queries.map((_,k)=>cosine(embeddings[k],embeddings[queries.length+i])));score=method==='semantic'?sem:0.5*(score+sem);}
  return {o,score,role:'ranked'};
 }).sort((a,b)=>b.score-a.score||a.o.id.localeCompare(b.o.id));
 const selected=[],ids=new Set();const add=(o,reason,score=null)=>{if(!o||ids.has(o.id)||selected.length>=cap)return;selected.push({observation:clone(o),reason,score});ids.add(o.id);};
 // Recent chronological evidence always included. Root evidence must have original observations accessible.
 for(const o of prior.slice(-2))add(o,'recent_chronological');
 for(const r of roots){
  const candidates=[...(r.evidence.challenges_current??[]).slice(-2),...(r.evidence.supports_current??[]).slice(-2)];
  for(const id of candidates){const o=prior.find(x=>x.id===id);add(o,'root_backing_evidence');}
 }
 for(const r of ranked)add(r.o,'semantic_or_lexical_candidate',+r.score.toFixed(4));
 add(current,'current_always_included');
 if(!ids.has(current.id)){const removed=selected.pop();if(removed)ids.delete(removed.observation.id);add(current,'current_always_included');}
 const included=selected.map(x=>x.observation),candidateRecords=state.records.filter(r=>r.status!=='historical').map(r=>({id:r.id,type:r.type,current_claim:r.claim,status:r.status,uncertainty:r.uncertainty,topics:r.topics,possible_instances:r.possible_instances,visible_support_ids:(r.evidence.supports_current??[]).filter(id=>ids.has(id)),visible_counter_ids:(r.evidence.challenges_current??[]).filter(id=>ids.has(id))}));
 return {current:clone(current),evidence:included,allowed_evidence_ids:included.map(x=>x.id),memory_candidates:candidateRecords,coverage:{method,available_historical:prior.length,selected_count:included.length,truncated:prior.length+1>included.length,query_sources:['current_message',rootQueries.length?'candidate_roots':null,additionalQuery?'targeted_request':null].filter(Boolean)},ranked_preview:ranked.slice(0,6).map(x=>({id:x.o.id,score:+x.score.toFixed(4)})),not_truth:'retrieval ranking is NOT evidence of shared cognitive cause'};
}
