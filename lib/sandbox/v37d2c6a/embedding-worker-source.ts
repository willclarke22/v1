/** Inline module worker: avoids adding a new public cloud route or cloud API endpoint.
 * Network access is only for user-initiated library/model downloads (jsDelivr/Hugging Face).
 * Input text, embeddings and similarity results are processed locally in the browser.
 */
export const EMBEDDING_WORKER_SOURCE = String.raw`
const LIBRARY_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const FIXTURES = [
 {label:"Electrical Circuits",root:"Believes electricity can flow through an open circuit without a return path."},
 {label:"Ohm's Law",root:"Confuses voltage with electric current in simple resistance problems."},
 {label:"Cellular Respiration",root:"Does not understand how cells convert nutrients to usable ATP."},
 {label:"Cross-Activity Cardio Transfer",root:"Assumes running endurance determines performance in all other activities."},
 {label:"Double-Slit Experiment",root:"Confuses measurement outcomes with classical particle trajectories."},
 {label:"Spanish Reflexive Pronouns",root:"Confuses reflexive se with non-reflexive verb constructions."}
];
let transformerModule, pipelineInstance, activeBackend, busy=false;
function valid(v){return Array.isArray(v)&&v.length===384&&v.every(Number.isFinite)&&v.some(x=>x!==0)}
function norm(v){let s=0;for(const x of v)s+=x*x;return Math.sqrt(s)}
function cosine(a,b){if(!valid(a)||!valid(b))throw Error('Invalid 384-dimensional embedding.');let dot=0;for(let i=0;i<384;i++)dot+=a[i]*b[i];return Math.max(-1,Math.min(1,dot/(norm(a)*norm(b))))}
function progress(id,message){postMessage({type:'progress',id,message})}
self.onmessage=async event=>{
 const {type,id,backend,topic,rootProblem,labels}=event.data??{};
 if(!['run','search','vector-query'].includes(type)||busy||!Number.isSafeInteger(id))return;
 busy=true; const started=performance.now();let libraryMs=0,loadMs=0,inferenceMs=0;
 try{
  if(!['wasm','webgpu'].includes(backend)||typeof topic!=='string'||!topic.trim()||topic.length>500||typeof rootProblem!=='string'||rootProblem.length>2500)throw Error('Topic or root problem is invalid or exceeds length limits.');
  if(backend==='webgpu'&&!self.navigator?.gpu)throw Error('WebGPU is unavailable in this browser; select WASM.');
  if(!transformerModule){
   progress(id,'Downloading pinned inference library from jsDelivr...');const begin=performance.now();
   transformerModule=await import(LIBRARY_URL);libraryMs=performance.now()-begin;
   transformerModule.env.allowLocalModels=false;transformerModule.env.allowRemoteModels=true;
  }
  const reused=Boolean(pipelineInstance&&activeBackend===backend);
  if(!reused){
   pipelineInstance=null;activeBackend=null;
   progress(id,'Downloading / loading MiniLM model (first request may be slow)...');const begin=performance.now();
   pipelineInstance=await transformerModule.pipeline('feature-extraction',MODEL_ID,{device:backend,dtype:'q8',progress_callback:(p)=>{
     if(p?.status==='progress')progress(id,'Downloading '+String(p.file??'model')+' '+(Number.isFinite(p.progress)?Math.round(p.progress)+'%':''));
   }});
   loadMs=performance.now()-begin;activeBackend=backend;
  }
  if(type==='vector-query'){
   // One user-triggered vector. It is sent only to the authenticated Supabase RPC by the caller.
   // Optional labels are used for a small local ranking benchmark, not for authorization.
   if(labels!==undefined && (!Array.isArray(labels)||labels.length>200||
     !labels.every(x=>x&&typeof x.id==='string'&&x.id.length<=80&&typeof x.label==='string'&&x.label.trim()&&x.label.length<=140)))
     throw Error('Invalid diagnostic comparison labels.');
   const samples=[topic.trim(),...(labels??[]).map(x=>x.label.trim())];
   progress(id,'Embedding query and '+(samples.length-1)+' optional comparison labels...');
   const startedEmbedding=performance.now();
   const output=await pipelineInstance(samples,{pooling:'mean',normalize:true});inferenceMs=performance.now()-startedEmbedding;
   const vectors=output.tolist();
   if(!Array.isArray(vectors)||vectors.length!==samples.length||!vectors.every(valid)||
     vectors.some(v=>Math.abs(norm(v)-1)>.025))throw Error('Invalid or unnormalized 384-D MiniLM output.');
   const comparison=(labels??[]).map((x,i)=>({id:x.id,label:x.label,similarity:cosine(vectors[0],vectors[i+1])}))
     .sort((a,b)=>b.similarity-a.similarity).slice(0,10);
   postMessage({type:'vector-query-result',id,result:{vector:vectors[0],model:MODEL_ID,backend,dimensions:384,
     loadMs,inferenceMs,totalMs:performance.now()-started,reused,comparison,comparedLabels:(labels??[]).length}});
   return;
  }
  if(type==='search'){
   if(!Array.isArray(labels)||labels.length===0||labels.length>200||
      !labels.every(x=>x&&typeof x.id==='string'&&x.id.length<=80&&typeof x.label==='string'&&x.label.trim()&&x.label.length<=140))
     throw Error('Invalid owner-scoped topic labels.');
   const texts=[topic.trim(),...labels.map(x=>x.label.trim())];
   progress(id,'Embedding '+texts.length+' query/topic labels in browser...');
   const begin=performance.now();const output=await pipelineInstance(texts,{pooling:'mean',normalize:true});inferenceMs=performance.now()-begin;
   const vectors=output.tolist();if(!Array.isArray(vectors)||vectors.length!==texts.length||!vectors.every(valid))throw Error('Invalid 384-D search vectors.');
   const rank=labels.map((x,i)=>({id:x.id,label:x.label,similarity:cosine(vectors[0],vectors[i+1])})).sort((a,b)=>b.similarity-a.similarity).slice(0,10);
   postMessage({type:'search-result',id,result:{model:MODEL_ID,backend,dimensions:384,loadMs,inferenceMs,totalMs:performance.now()-started,reused,rank,scanned:labels.length}});
   return;
  }
  const hasRoot=Boolean(rootProblem.trim());
  const texts=[topic.trim(),...(hasRoot?[rootProblem.trim()]:[]),...FIXTURES.map(x=>x.label),...FIXTURES.map(x=>x.root)];
  progress(id,'Generating '+texts.length+' embeddings locally in your browser...');
  const begin=performance.now();const output=await pipelineInstance(texts,{pooling:'mean',normalize:true});inferenceMs=performance.now()-begin;
  const vectors=output.tolist();if(!Array.isArray(vectors)||vectors.length!==texts.length||!vectors.every(valid))throw Error('Expected normalized 384-D MiniLM vectors.');
  const norms=vectors.map(norm);if(norms.some(n=>Math.abs(n-1)>.025))throw Error('MiniLM outputs were not unit-normalized.');
  const topicIndex=1+(hasRoot?1:0),rootIndex=topicIndex+FIXTURES.length;
  const topicRank=FIXTURES.map((x,i)=>({label:x.label,similarity:cosine(vectors[0],vectors[topicIndex+i])})).sort((a,b)=>b.similarity-a.similarity);
  const rootRank=hasRoot?FIXTURES.map((x,i)=>({label:x.label,similarity:cosine(vectors[1],vectors[rootIndex+i])})).sort((a,b)=>b.similarity-a.similarity):[];
  postMessage({type:'result',id,result:{model:MODEL_ID,backend,dimensions:384,normalized:true,libraryMs,loadMs,inferenceMs,totalMs:performance.now()-started,reused,topicRank,rootRank,preview:vectors[0].slice(0,6).map(v=>Math.round(v*10000)/10000),fixtureCount:FIXTURES.length}});
 }catch(error){postMessage({type:'error',id,error:error instanceof Error?error.message:String(error)})}
 finally{busy=false}
};
`;
