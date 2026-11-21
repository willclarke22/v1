/** FIX6B: read-only file and interface inventory. Not a deletions list. */
import fs from 'node:fs';import path from 'node:path';
import {sha} from './s62bfix1r42fix6b-context.mjs';
const LINECAP=8;
const resolveImports=(s)=>[...s.matchAll(/(?:import|export)\s+(?:[\s\S]{0,220}?\sfrom\s+)?['"](\.[^'"\n]+)['"]/g)].map(m=>m[1]);
const exists=p=>fs.existsSync(p)&&fs.statSync(p).isFile();
const lines=s=>s.split(/\r?\n/);
const where=(s,pattern)=>{const i=lines(s).findIndex(x=>x.includes(pattern));return i<0?null:{line:i+1,excerpt:lines(s)[i].trim().slice(0,280)};};
function modulesIn(folder){return fs.readdirSync(folder).filter(n=>n.endsWith('.mjs')).map(n=>path.join(folder,n));}
function jaccard(a,b){let aa=new Set(lines(a).map(x=>x.trim()).filter(x=>x.length>=15)),bb=new Set(lines(b).map(x=>x.trim()).filter(x=>x.length>=15));let n=0;for(const x of aa)if(bb.has(x))n++;return +(n/(aa.size+bb.size-n||1)).toFixed(3);}
export function inspectResearchCode(root){
 const dir=path.join(root,'scripts','sandbox','learning-intelligence');
 if(!exists(path.join(dir,'s62bfix1r42fix3-runtime.mjs')))throw Error('Expected research source missing; cannot inventory');
 const files=modulesIn(dir).sort();const blobs=new Map(files.map(f=>[f,fs.readFileSync(f,'utf8')]));const inbound=new Map(files.map(f=>[f,0]));
 const dependencies=[];const looseImport=[];
 for(const [f,s] of blobs)for(const spec of resolveImports(s)){
  const resolved=path.resolve(path.dirname(f),spec);
  let target=[resolved,resolved+'.mjs',resolved+'.js'].find(exists)??null;
  if(target) {dependencies.push([f,target]);if(inbound.has(target))inbound.set(target,inbound.get(target)+1);}
  else looseImport.push({from:path.relative(root,f),specifier:spec});
 }
 const byhash=new Map();for(const [f,s] of blobs){const h=sha(s);byhash.set(h,[...(byhash.get(h)??[]),path.relative(root,f)]);}
 const exactDuplicates=[...byhash.entries()].filter(([h,n])=>n.length>1).map(([hash,files])=>({hash,files}));
 const runNames=files.filter(f=>/runtime\.mjs$/.test(f));const runtimeSimilarity=[];
 for(let i=0;i<runNames.length;i++)for(let j=i+1;j<runNames.length;j++){
  const score=jaccard(blobs.get(runNames[i]),blobs.get(runNames[j]));if(score>=0.5)runtimeSimilarity.push({a:path.relative(root,runNames[i]),b:path.relative(root,runNames[j]),line_jaccard:score});
 }
 runtimeSimilarity.sort((a,b)=>b.line_jaccard-a.line_jaccard);
 const ref=file=>{const abs=path.join(dir,file);return exists(abs)?fs.readFileSync(abs,'utf8'):''};
 const riskPoints=[];
 function point(id,file,needle,why){const at=where(ref(file),needle);if(at)riskPoints.push({id,source:path.posix.join('scripts/sandbox/learning-intelligence',file),...at,meaning:why,classification:'static_code_observation_requires_runtime_confirmation'});}
 point('B_SHORT_BRIEF','s62b-core.mjs','.slice(0,5).map','B historical record summaries are limited and compressed to claim/uncertainty/provisional fields');
 point('EMBEDDING_TEXT_PROJECTION','s62bfix1r3-retrieval.mjs','.slice(0,3000)','Semantic indexing content is a shortened projection, not complete raw observation');
 point('A_RECENT_DIALOGUE','s62bfix1r42fix3-runtime.mjs','state.dialogue.slice(-3)','Assessment receives a short recent dialogue segment');
 point('B_RECENT_DIALOGUE','s62bfix1r42fix3-runtime.mjs','state.dialogue.slice(-4)','B receives a short recent dialogue segment; check whether learner attempts arrive elsewhere');
 point('A_TOPIC_FIELDS','s62bfix1r42fix3-runtime.mjs','m.topic_id','Assessment topic inventory selector may not match retrieved memory candidate topics[] shape');
 point('B_ONLY_PROMPT_COMPOSITION','s62bfix1r42fix3-runtime.mjs','.replace(','Textual prompt replacement is fragile if prompt wording changes; compare actual call count in trace');
 const unusedByStaticImports=[...inbound].filter(([f,n])=>n===0).map(([f])=>path.relative(root,f));
 return {stage:'S62B-FIX1R42FIX6B',kind:'read_only_static_inventory',research_directory:path.relative(root,dir),module_count:files.length,
  imported_module_edges:dependencies.length,zero_static_inbound_modules:unusedByStaticImports.length,
  candidate_unreferenced_modules_sample:unusedByStaticImports.slice(0,35),exact_duplicate_module_groups:exactDuplicates,
  runtime_module_count:runNames.length,runtime_high_overlap_pairs:runtimeSimilarity.slice(0,25),unresolved_relative_imports:looseImport.slice(0,25),
  interface_flags:riskPoints,scope_limits:['Zero inbound static imports does NOT prove unused: entrypoints, CLI invocations, dynamic imports and external modules may use these files.',
  'Jaccard similarity is a rough code overlap indicator, not proof of redundant behavior.',
  'No files are renamed or removed. Source dependency and cloud/production path audits remain separate.',
  'Prompt evaluation and live behavior require model traces, not just file inspection.']};
}
