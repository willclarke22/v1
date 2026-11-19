/** R3 research-only semantic evidence retrieval. Local embeddings; no silent lexical fallback.
 * Stable, content-addressed observation vectors survive an explicit resume; retrieval never concludes a root.
 */
import crypto from 'node:crypto';
import {localMiniLM} from './s16b60-retrieval.mjs';
import {cosine} from './s62b-retrieval.mjs';
const clone=x=>structuredClone(x);
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const content=o=>String(o.compact_index_text??o.text??'').slice(0,3000);
const finiteVector=v=>Array.isArray(v)&&v.length>=30&&v.length<=8192&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
function cacheFor(state,provider){
 if(!state.semantic_index)state.semantic_index={version:'myway_semantic_index_v1',provider,dimension:null,vectors:{}};
 const idx=state.semantic_index;
 if(idx.version!=='myway_semantic_index_v1'||idx.provider!==provider||!idx.vectors||typeof idx.vectors!=='object')throw Error('Semantic cache provider/version mismatch; refuse mixed embedding spaces');
 return idx;
}
export async function indexTexts(state,texts,{embedFn=null,transport}={}){
 const provider=embedFn?'injected_test_only':'local_minilm_http_127_0_0_1_8001_embed';
 const idx=cacheFor(state,provider),unique=[...new Set(texts.map(x=>String(x).slice(0,3000)))];
 const missing=unique.filter(t=>!Object.hasOwn(idx.vectors,hash(t)));
 if(missing.length){
  // The service is not invoked from Plan. Semantic Offline/Model MUST contact it when data are not cached.
  const v=embedFn?await embedFn(missing):await localMiniLM(missing,{transport});
  if(!Array.isArray(v)||v.length!==missing.length||v.some(x=>!finiteVector(x)||x.length!==v[0].length))throw Error('Semantic embedding service returned invalid vectors; NO lexical fallback');
  if(idx.dimension!==null&&idx.dimension!==v[0].length)throw Error('Semantic vector dimension changed; NO mixed embedding spaces');
  idx.dimension=v[0].length;
  missing.forEach((t,i)=>{idx.vectors[hash(t)]={text_sha256:hash(t),vector:v[i]};});
 }
 const byText=t=>{
  const entry=idx.vectors[hash(String(t).slice(0,3000))];
  if(!entry||!finiteVector(entry.vector)||entry.vector.length!==idx.dimension)throw Error('Missing/malformed indexed semantic vector');
  return entry.vector;
 };
 return {byText,stats:{provider:idx.provider,dimension:idx.dimension,requested:unique.length,cache_hits:unique.length-missing.length,embedded_now:missing.length,real_local_service:!embedFn,lexical_fallback:false}};
}
export async function retrieveR3(state,current,{method='semantic',cap=12,embedFn=null,embeddingTransport,additionalQuery=null}={}){
 if(method!=='semantic'||!Number.isInteger(cap)||cap<4||cap>20)throw Error('R3 requires semantic retrieval; no implicit lexical fallback');
 const prior=state.observations.filter(x=>x.id!==current.id);
 const roots=state.records.filter(r=>['root','shared_root'].includes(r.type)&&r.status!=='historical');
 const rootQueries=roots.slice(-5).map(r=>r.claim);
 const queryStrings=[content(current),...rootQueries,...(additionalQuery?[additionalQuery]:[])];
 const docs=prior.map(content);
 const embedding=await indexTexts(state,[...queryStrings,...docs],{embedFn,transport:embeddingTransport});
 const queried=queryStrings.map(embedding.byText);
 const ranked=prior.map((o,i)=>({o,score:Math.max(...queried.map(q=>cosine(q,embedding.byText(docs[i]))))})).sort((a,b)=>b.score-a.score||a.o.id.localeCompare(b.o.id));
 const selected=[],ids=new Set(),reasons={};
 const add=(o,reason,score=null)=>{if(!o||ids.has(o.id)||selected.length>=cap)return;selected.push(clone(o));ids.add(o.id);reasons[o.id]={reason,score};};
 // Do not let semantic nearest neighbors crowd out chronological observations or historical contradictions.
 for(const o of prior.slice(-2))add(o,'recent_chronological');
 for(const r of roots){for(const id of [...(r.evidence?.challenges_current??[]).slice(-2),...(r.evidence?.supports_current??[]).slice(-2)])add(prior.find(o=>o.id===id),'root_backing_or_counter_evidence');}
 for(const r of ranked)add(r.o,'semantic_candidate',+r.score.toFixed(5));
 add(current,'current_always_included');
 if(!ids.has(current.id)){const last=selected.pop();if(last){ids.delete(last.id);delete reasons[last.id];}add(current,'current_always_included');}
 const memory=state.records.filter(r=>r.status!=='historical').map(r=>({id:r.id,type:r.type,current_claim:r.claim,status:r.status,uncertainty:r.uncertainty,topics:r.topics,possible_instances:r.possible_instances,visible_support_ids:(r.evidence?.supports_current??[]).filter(id=>ids.has(id)),visible_counter_ids:(r.evidence?.challenges_current??[]).filter(id=>ids.has(id))}));
 return {current:clone(current),evidence:selected,allowed_evidence_ids:selected.map(x=>x.id),memory_candidates:memory,
  coverage:{method:'semantic',available_historical:prior.length,selected_count:selected.length,truncated:prior.length+1>selected.length,query_sources:['current_observation',...(rootQueries.length?['candidate_root_hypotheses']:[]),...(additionalQuery?['model_A_targeted_request']:[])],embedding:embedding.stats},
  ranked_preview:ranked.slice(0,8).map(r=>({id:r.o.id,score:+r.score.toFixed(5),selected:ids.has(r.o.id),selection_reason:reasons[r.o.id]?.reason??null})),
  selection_reasons:reasons,not_truth:'Embedding similarity is candidate evidence retrieval, NOT evidence of a common cognitive root.'};
}
