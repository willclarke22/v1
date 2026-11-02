/** 7A independent, pinned, user-triggered WASM-only difficulty embedding worker.
 * Text is embedded locally in the browser, never sent to an embedding provider API.
 * External executable/model assets download from a pinned CDN/model ID on first use.
 */
export const DIFFICULTY_WORKER_SOURCE = String.raw`
const LIBRARY_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
const MODEL_ID='Xenova/all-MiniLM-L6-v2';
const MODEL_TAG='Xenova/all-MiniLM-L6-v2@transformers-4.3.1-q8-wasm';
let library=null,pipe=null,busy=false;
function norm(v){let q=0;for(const n of v)q+=n*n;return Math.sqrt(q)}
function valid(v){return Array.isArray(v)&&v.length===384&&v.every(Number.isFinite)&&Math.abs(norm(v)-1)<.025}
self.onmessage=async e=>{
 const {id,type,texts}=e.data??{};
 if(!Number.isSafeInteger(id)||busy||!['batch','query'].includes(type))return;
 busy=true;
 try{
  if(!Array.isArray(texts)||texts.length<1||texts.length>(type==='query'?1:100)||
   !texts.every(x=>typeof x==='string'&&x.trim().length>=15&&x.length<=500))throw Error('Expected 1–100 validated difficulty descriptions (15–500 characters).');
  if(!library){postMessage({id,type:'progress',message:'Downloading pinned Transformers.js inference library...'});
    library=await import(LIBRARY_URL);library.env.allowLocalModels=false;library.env.allowRemoteModels=true;}
  if(!pipe){postMessage({id,type:'progress',message:'Loading MiniLM q8 WASM in the browser...'});
   pipe=await library.pipeline('feature-extraction',MODEL_ID,{device:'wasm',dtype:'q8'});}
  postMessage({id,type:'progress',message:'Embedding '+texts.length+' difficulty descriptions locally...'});
  const result=await pipe(texts,{pooling:'mean',normalize:true});
  const vectors=result.tolist();
  if(!Array.isArray(vectors)||vectors.length!==texts.length||!vectors.every(valid))throw Error('Invalid 384-D normalized MiniLM output.');
  postMessage({id,type:'complete',vectors,model:MODEL_TAG});
 }catch(err){postMessage({id,type:'error',error:err instanceof Error?err.message:String(err)})}
 finally{busy=false}
};
`;
