/**
 * Evidence-gated multiscale retrieval for model-led anatomy planning.
 * Never mistakes is_a classification for containment, asserts a complete exterior,
 * inserts requested benchmark references, or fills remaining room with weak BM25 hits.
 */
import {normalizeAssetSearchText,tokenizeAssetSearchText} from './asset-lexical-search';
import type {AssetSearchDocumentV1} from './asset-search-document';
import type {BodyParts3dFullCatalogV1} from '../bodyparts3d-full-import.server';

export type MultiscaleCandidate={asset_id:string;channels:string[]};
export type MultiscaleEvidence={
 candidates:MultiscaleCandidate[];
 direct_anchor_names:string[];
 parent_concepts:Array<{name:string;depth:number;renderable:boolean;relationship:string}>;
 query_count:number;
 graph_candidates:number;
 context_candidates:number;
 lexical_candidates:number;
 rejected_weak_lexical:number;
 weak_anchor_count:number;
 partof_candidates:number;
 classification_candidates:number;
 region_hints:string[];
 warnings:string[];
};
type SearchResult={asset_id:string};
type Input={question:string;documents:AssetSearchDocumentV1[];
 catalog:Pick<BodyParts3dFullCatalogV1,'partof_relations'|'isa_relations'|'concepts'>|null;
 search:(phrase:string,limit:number)=>SearchResult[];limit?:number};
const normal=(text:string)=>normalizeAssetSearchText(text);
const withoutSide=(text:string)=>normal(text).replace(/^(left|right|bilateral)\s+/, '');
const phrase=(haystack:string,needle:string)=>Boolean(needle&&(` ${haystack} `).includes(` ${needle} `));
const generic=new Set(['organ','body','body part','anatomical structure','muscle organ','bone organ',
 'muscle','bone','limb','joint','region','tissue','artery','vein','nerve','segment','portion','system']);
const common=new Set(['anatomy','anatomical','structure','structures','surrounding','around','muscle','muscles',
 'bone','bones','body','human','explain','show','work','works','working','function','functions','how',
 'what','where','why','when','during','does','do','can','this','that','these','them','the','your',
 'their','into','from','with','about','which','should','would','help','helps','also','part']);
const meaningful=(label:string)=>{const s=withoutSide(label);return s.length>=4&&!generic.has(s)&&!/^(set of|part of|portion of)\b/.test(s)};
const distinct=<T>(items:T[])=>[...new Set(items)];

export function discoverMultiscaleCandidates(input:Input):MultiscaleEvidence{
 const limit=Math.max(1,Math.min(300,Math.floor(input.limit??250)));
 const docs=input.documents;
 const byAsset=new Map(docs.map(d=>[d.asset_id,d] as const));
 const question=normal(input.question);
 const warnings:string[]=[];
 const channels=new Map<string,Set<string>>();
 const buckets:{focal:string[];graph:string[];context:string[];lexical:string[]}={focal:[],graph:[],context:[],lexical:[]};
 function add(id:string,bucket:keyof typeof buckets,evidence:string){
  if(!byAsset.has(id))return;
  if(!channels.has(id))channels.set(id,new Set());
  channels.get(id)!.add(evidence);
  if(!buckets[bucket].includes(id))buckets[bucket].push(id);
 }
 let queries=0;
 function query(text:string,n:number){queries++;return input.search(text,n).filter(r=>byAsset.has(r.asset_id));}
 const bm25=query(input.question,Math.max(limit,250));
 // Document-frequency gating: a shared word such as "muscle" should never fill
 // an anatomy shortlist with unrelated muscles from elsewhere in the body.
 const df=new Map<string,number>();
 for(const d of docs){
  const terms=new Set(tokenizeAssetSearchText([d.canonical_identity,...d.aliases,...d.concept_names].join(' ')));
  for(const t of terms)df.set(t,(df.get(t)??0)+1);
 }
 const salient=distinct(tokenizeAssetSearchText(question)).filter(t=>!common.has(t)&&(df.get(t)??0)<=Math.max(5,Math.floor(docs.length*.10)));
 const matches=(d:AssetSearchDocumentV1)=>{
  const identity=normal([d.canonical_identity,...d.aliases,...d.concept_names].join(' '));
  const tags=normal(d.semantic_tags.join(' '));
  return salient.some(t=>phrase(identity,t)||phrase(tags,t));
 };
 const anchors=docs.filter(d=>[d.canonical_identity,...d.aliases,...d.concept_names].some(raw=>{
  const label=withoutSide(raw);
  return meaningful(label)&&phrase(question,label);
 })).sort((a,b)=>b.canonical_identity.length-a.canonical_identity.length).slice(0,16);
 const named=anchors.length>0;
 const weak=anchors.length?[]:bm25.map(x=>byAsset.get(x.asset_id)!).filter(d=>d&&matches(d)).slice(0,3);
 const seed=anchors.length?anchors:weak;
 for(const d of seed)add(d.asset_id,'focal',named?'verified identity phrase in question':'tentative question identity match');
 if(!named)warnings.push(weak.length
  ?'No exact named structure; tentative lexical anchors are not verified anatomical intent. Review before generation.'
  :'No verified named structure or identity-matching anchor: implicit intent unresolved. Semantic enrichment may be necessary.');
 // All graph references use concept IDs, not arbitrary BM25 rank or normalized
 // keyword co-occurrence. The is_a and part_of channels remain distinct.
 const conceptIds=new Map<string,string[]>();
 for(const d of docs)for(const c of d.concept_ids){const old=conceptIds.get(c)??[];old.push(d.asset_id);conceptIds.set(c,old)}
 const parentEdges=new Map<string,Array<{id:string;name:string;kind:'part_of'|'is_a'}>>();
 const childEdges=new Map<string,Array<{id:string;kind:'part_of'|'is_a'}>>();
 const concepts=new Map((input.catalog?.concepts??[]).map(c=>[c.concept_id,c] as const));
 const addEdge=(child:string,parent:string,name:string,kind:'part_of'|'is_a')=>{
  parentEdges.set(child,[...(parentEdges.get(child)??[]),{id:parent,name,kind}]);
  childEdges.set(parent,[...(childEdges.get(parent)??[]),{id:child,kind}]);
 };
 for(const r of input.catalog?.partof_relations??[])addEdge(r.child_id,r.parent_id,r.parent_name,'part_of');
 for(const r of input.catalog?.isa_relations??[])addEdge(r.child_id,r.parent_id,r.parent_name,'is_a');
 const parents:Array<{name:string;depth:number;renderable:boolean;relationship:string}>=[];
 const seenParents=new Set<string>();
 const regionTerms=new Set<string>();
 const classEvidence=new Set<string>();
 let partofNew=0,isaNew=0;
 if(input.catalog){
  const pending=seed.flatMap(d=>d.concept_ids.map(id=>({id,depth:0,trace:[] as string[]})));
  const visited=new Set<string>(pending.map(p=>p.id));
  let examined=0;
  while(pending.length&&examined++<200){
   const current=pending.shift()!;
   if(current.depth>=4)continue;
   for(const edge of parentEdges.get(current.id)??[]){
    if(visited.has(edge.id))continue;
    visited.add(edge.id);
    const depth=current.depth+1;
    pending.push({id:edge.id,depth,trace:[...current.trace,edge.kind]});
    const n=concepts.get(edge.id)?.name??edge.name;
    if(!meaningful(n)||seenParents.has(edge.id))continue;
    seenParents.add(edge.id);
    const relationship=edge.kind==='part_of'?'part_of ancestor':'is_a classification ancestor';
    const relatives=conceptIds.get(edge.id)??[];
    parents.push({name:n,depth,renderable:relatives.length>0,relationship});
    for(const id of relatives.slice(0,12)){
     if(!channels.has(id))edge.kind==='part_of'?partofNew++:isaNew++;
     add(id,edge.kind==='part_of'?'context':'graph',`${relationship} depth ${depth}: ${n}`);
    }
    // Only expand a specific low-fanout class or collection. A broad type
    // such as "muscle organ" must not pull in all muscles in the atlas.
    const children=childEdges.get(edge.id)??[];
    if(children.length>1&&children.length<=32&&depth<=3){
     for(const child of children){
      if(child.id===current.id)continue;
      for(const id of (conceptIds.get(child.id)??[]).slice(0,4)){
       if(!channels.has(id))child.kind==='part_of'?partofNew++:isaNew++;
       add(id,child.kind==='part_of'?'context':'graph',`shared specific ${child.kind} parent: ${n}`);
      }
     }
    }
    // From a specific classification like "muscle of X", X is only a
    // searchable LOCATION HINT, never a proven parent or renderable exterior.
    const location=normal(n).match(/\b(?:of|in|within) (?:the )?(.+)$/)?.[1];
    if(location&&meaningful(location))regionTerms.add(location);
    if(edge.kind==='is_a')classEvidence.add(n);
   }
  }
 }else warnings.push('Relationship catalog unavailable. No verified graph expansion performed.');
 // Search for verified context identity using terms derived from official
 // parent labels and source search-document ontology terms; no body-part map.
 for(const d of seed)for(const p of d.ontology_1hop_terms){
  if(!meaningful(p))continue;
  classEvidence.add(p);
  const loc=normal(p).match(/\b(?:of|in|within) (?:the )?(.+)$/)?.[1];
  if(loc&&meaningful(loc))regionTerms.add(loc);
 }
 // A region string is a hint; a region candidate must have independent
 // identity/alias/concept evidence. A bare BM25 score cannot establish context.
 for(const region of [...regionTerms].slice(0,5)){
  for(const d of docs){
   if([d.canonical_identity,...d.aliases,...d.concept_names].some(s=>withoutSide(s)===region))
    add(d.asset_id,'context',`region identity from ontology: ${region}`);
  }
 }
 // Fallback for missing exact graph edges: classify documents by the *same*
 // one-hop ontology class, not text scores or guessed anatomical adjacency.
 for(const klass of [...classEvidence].filter(meaningful).slice(0,8)){
  const k=normal(klass);
  const members=docs.filter(d=>d.ontology_1hop_terms.some(term=>normal(term)===k));
  // Broad class memberships are not usable location context.
  if(members.length>48)continue;
  for(const d of members)add(d.asset_id,'graph',`shared source ontology class: ${klass}`);
 }
 // Lexical evidence is admitted only when identity or curated semantic tags
 // support an informative term in the learner question; no 250-result filler.
 let rejected=0;
 for(const row of bm25){
  const doc=byAsset.get(row.asset_id)!;
  if(matches(doc))add(row.asset_id,'lexical','salient question identity/tag match');
  else rejected++;
 }
 const ordered:string[]=[];const selected=new Set<string>();
 const push=(id:string)=>{if(!selected.has(id)&&ordered.length<limit){selected.add(id);ordered.push(id)}};
 for(const type of ['focal','context','graph','lexical'] as const)for(const id of buckets[type])push(id);
 // Important: intentionally NO fill to 250. Quality/confidence beats quota.
 const returned=ordered.map(asset_id=>({asset_id,channels:[...(channels.get(asset_id)??[])]}));
 const graphIds=new Set([...buckets.graph,...buckets.context].filter(id=>!buckets.focal.includes(id)));
 if(!parents.length)warnings.push('No specific connected ancestor was resolved; a complete region overview is not established.');
 if(![...parents].some(p=>p.relationship.startsWith('part_of')&&p.renderable))warnings.push('No verified renderable enclosing-region asset found through part_of; classification/label hints are not proof of an exterior.');
 if(rejected>0)warnings.push(`Discarded ${rejected} weak BM25 hits instead of filling the 250-mesh budget.`);
 return {candidates:returned,direct_anchor_names:distinct(seed.map(d=>d.display_name)).slice(0,8),parent_concepts:parents.slice(0,24),query_count:queries,
  lexical_candidates:buckets.lexical.length,graph_candidates:graphIds.size,
  context_candidates:distinct(buckets.context.filter(id=>!buckets.focal.includes(id))).length,
  rejected_weak_lexical:rejected,weak_anchor_count:weak.length,partof_candidates:partofNew,classification_candidates:isaNew,region_hints:[...regionTerms].slice(0,8),warnings};
}
