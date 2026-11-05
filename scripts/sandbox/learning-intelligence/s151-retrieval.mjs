#!/usr/bin/env node
/** S1.5.1 research-only cross-topic evidence retrieval. Never reads or writes learner data. */
import {makeBank} from './s14-flow.mjs';
const EMBED='http://127.0.0.1:8001/embed';
const SIZE=384,EPS=1e-8;
const good=v=>Array.isArray(v)&&v.length===SIZE&&v.every(n=>Number.isFinite(n));
const cosine=(a,b)=>{let dot=0,aa=0,bb=0;for(let i=0;i<SIZE;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa>EPS&&bb>EPS?dot/Math.sqrt(aa*bb):0;};
const rounded=v=>Math.round(v*10000)/10000;
async function vectors(texts,request=fetch){
 if(!texts.length||texts.length>45)throw Error('Embedding batch must contain 1-45 strings');
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),45000);
 try{
  const r=await request(EMBED,{method:'POST',redirect:'error',cache:'no-store',signal:ac.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({texts})});
  if(!r.ok)throw Error('Local embeddings HTTP '+r.status);
  const result=await r.json();
  if(!Array.isArray(result.vectors)||result.vectors.length!==texts.length||!result.vectors.every(good))throw Error('Invalid 384-D embedding output');
  return result.vectors;
 }finally{clearTimeout(timer);}
}
export async function rankFixtureEvidence(assessment,{request=fetch,bank=makeBank()}={}){
 if(!bank.length)throw Error('Empty curated bank');
 const query=String(assessment.topic_name||'')+' '+String(assessment.root_problem||'');
 const root=String(assessment.root_problem||'');
 if(root.trim().length<15)throw Error('Refusing ungrounded difficulty retrieval');
 const topicDocs=bank.map(t=>t.topic_label+' '+t.domain);
 const events=bank.flatMap(t=>t.events.map(e=>({...e,topic_id:t.topic_id,topic_label:t.topic_label})));
 if(!events.length)throw Error('No curated historical root problems');
 // Obtain one query embedding per retrieval stage, then batch documents. No production labels or fixed topic IDs.
 const topicQ=(await vectors([query],request))[0];
 const rootQ=(await vectors([root],request))[0];
 const topicVectors=[];for(let i=0;i<topicDocs.length;i+=45)topicVectors.push(...await vectors(topicDocs.slice(i,i+45),request));
 const eventVectors=[];for(let i=0;i<events.length;i+=45)eventVectors.push(...await vectors(events.slice(i,i+45).map(e=>e.root_problem),request));
 const eventScores=events.map((e,i)=>({...e,similarity:rounded(cosine(rootQ,eventVectors[i]))}));
 const ranked=bank.map((t,i)=>{
  const relevant=eventScores.filter(e=>e.topic_id===t.topic_id).sort((a,b)=>b.similarity-a.similarity);
  return {topicId:t.topic_id,topicLabel:t.topic_label,topicSimilarity:rounded(cosine(topicQ,topicVectors[i])),bestEventSimilarity:relevant[0]?.similarity??null,
   historyCount:relevant.length,topRoot:relevant[0]?.root_problem??null};
 }).sort((a,b)=>(b.bestEventSimilarity??-1)-(a.bestEventSimilarity??-1)||b.topicSimilarity-a.topicSimilarity);
 const chosen=ranked[0],second=ranked[1];
 const candidateIds=new Set(ranked.slice(0,3).map(c=>c.topicId));
 const histories=eventScores.filter(e=>candidateIds.has(e.topic_id)).sort((a,b)=>b.similarity-a.similarity).slice(0,20);
 return {retrievalStatus:'fixture_cross_topic_evidence_s151',topicCandidates:ranked,topicId:chosen.topicId,topicLabel:chosen.topicLabel,events:histories,
   diagnostics:{retrievalPolicy:'integrity',topicRerankedBy:'best approved root-problem embedding; topic similarity only breaks ties',
    bestEventSimilarity:chosen.bestEventSimilarity,nextTopicBestEventSimilarity:second?.bestEventSimilarity??null,
    selectedTopicSimilarity:chosen.topicSimilarity,nearestTopicLabelByScore:[...ranked].sort((a,b)=>b.topicSimilarity-a.topicSimilarity)[0]?.topicLabel,
    rankedTopics:ranked.map(c=>({...c,topRoot:c.topRoot}))},
   note:'Curated bank, all-topic evidence ranking; no Supabase and no topic hardcoding',preview:null};
}
/** A research-only gate. Holds unsupported, near-tied or incomplete retrieval instead of inventing identity.
  These provisional cutoffs are conservative test parameters, not calibrated production thresholds. */
export function evidenceIntegrity(found,chosen,{minRootSupport=0.42,minMargin=0.025}={}){
 const diagnostics=found.diagnostics||{};
 const all=Array.isArray(found.topicCandidates)?found.topicCandidates:[];
 const selected=all.find(x=>x.topicId===found.topicId);
 const scores=chosen.map(x=>x.similarity).filter(Number.isFinite);
 const bestSelected=scores.length?Math.max(...scores):null;
 const candidate=selected?.bestEventSimilarity??bestSelected;
 const alternate=diagnostics.nextTopicBestEventSimilarity;
 const isCrossTopic=found.retrievalStatus==='fixture_cross_topic_evidence_s151';
 const verdict={status:'hold',reason:'unknown',selectedTopic:found.topicId,selectedTopicLabel:found.topicLabel,
  topTopicSimilarity:selected?.topicSimilarity??selected?.similarity??null,bestApprovedEventSimilarity:candidate,
  rivalBestApprovedEventSimilarity:Number.isFinite(alternate)?alternate:null,experimentalRootSupportFloor:minRootSupport,experimentalMarginFloor:minMargin,
  retrievalPolicy:'integrity',candidateCount:all.length};
 if(!found.topicId||!chosen.length){verdict.reason='no_historical_evidence';return verdict;}
 if(!Number.isFinite(candidate)||candidate<minRootSupport){verdict.reason='no_supported_historical_match';return verdict;}
 if(isCrossTopic&&Number.isFinite(alternate)&&candidate-alternate<minMargin){verdict.reason='competing_topics_close';return verdict;}
 // Sandbox retrieval may have excluded the true topic from its pgvector top-K. It cannot prove a global match.
 if(!isCrossTopic){verdict.status='review_only';verdict.reason='bounded_sandbox_top_k_not_exhaustive';return verdict;}
 verdict.status='candidate_ready';verdict.reason='history_supported_but_model_c_must_still_validate';return verdict;
}
