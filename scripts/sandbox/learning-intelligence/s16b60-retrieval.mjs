/** S60 research retrieval ablation: lexical, local MiniLM and mixed. No hypothesis scoring. */
const common=new Set('this that what with from have about could would there they their when where which your does into than then were some because again please more just like tell know test sure think ask answer question me now how for and not are'.split(' '));
const tokens=s=>new Set((String(s??'').toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(x=>!common.has(x)));
function lexical(a,b){const A=tokens(a),B=tokens(b);return [...A].filter(x=>B.has(x)).length/Math.sqrt(Math.max(1,A.size*B.size));}
const cosine=(a,b)=>{let sum=0,na=0,nb=0;for(let i=0;i<a.length;i++){sum+=a[i]*b[i];na+=a[i]**2;nb+=b[i]**2;}return na&&nb?sum/Math.sqrt(na*nb):0;};
function urlCheck(value){const u=new URL(value);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('MiniLM adapter requires an HTTP localhost URL without credentials');if(!u.pathname.endsWith('/embed'))throw Error('MiniLM adapter expects /embed');return u.href;}
export async function localMiniLM(texts,{url='http://127.0.0.1:8001/embed',transport=globalThis.fetch}={}){
 const endpoint=urlCheck(url);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 let r;try{r=await transport(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({texts}),redirect:'error',signal:controller.signal});}finally{clearTimeout(timer);}
 if(!r.ok)throw Error('Local embedding service returned HTTP '+r.status);
 const payload=await r.json(),v=payload?.vectors;
 if(!Array.isArray(v)||v.length!==texts.length||!v.length||v.some(x=>!Array.isArray(x)||x.length<30||x.length!==v[0].length||x.some(n=>!Number.isFinite(n))))throw Error('Local embedding vector shape invalid');
 return v;
}
export async function retrievalPacket(fixture,c,{method='lexical',role='A',explore=false,semanticUrl,semanticTransport,cap}={}){
 if(!['lexical','semantic','mixed'].includes(method)||!['A','B'].includes(role))throw Error('Invalid S60 retrieval method/role');
 const obs=c.historical_observations,query=c.latest_observation.text,latest=c.latest_observation;
 const scored=obs.map(o=>({o,lex:lexical(query,o.text+' '+fixture.topics.find(t=>t.topic_id===o.topic_id)?.title),sem:0}));
 if(method!=='lexical'){
  // Explicitly fail if the LOCAL service is absent: no silent lexical fallback in semantic experiments.
  const vectors=await localMiniLM([query,...obs.map(o=>o.text)],{url:semanticUrl,transport:semanticTransport});
  scored.forEach((x,i)=>x.sem=cosine(vectors[0],vectors[i+1]));
 }
 const max=cap??(role==='A'?(explore?12:9):(explore?9:6));
 if(!Number.isInteger(max)||max<2||max>16)throw Error('Bad S60 context cap');
 const selected=[],selectedIds=new Set();const add=x=>{if(x&&!selectedIds.has(x.id)&&selected.length<max){selected.push(x);selectedIds.add(x.id);}};
 const score=x=>method==='semantic'?x.sem:method==='mixed'?0.5*x.lex+0.5*x.sem:x.lex;
 scored.sort((a,b)=>score(b)-score(a)||a.o.id.localeCompare(b.o.id));
 // Select strong direct candidates; include diverse evidence types without treating labels as diagnoses.
 scored.slice(0,Math.max(1,max-(explore?4:2))).forEach(x=>add(x.o));
 const anchorTopics=new Set([latest.topic_id,...selected.map(o=>o.topic_id)]);
 const neighboring=new Set(fixture.links.flatMap(edge=>anchorTopics.has(edge.from_topic_id)?[edge.to_topic_id]:anchorTopics.has(edge.to_topic_id)?[edge.from_topic_id]:[]));
 for(const row of scored.filter(x=>neighboring.has(x.o.topic_id)))if(selected.length<max-1)add(row.o);
 // Add contrasting conditions (e.g., independent success after an error) when possible.
 const contrast=scored.find(x=>!selectedIds.has(x.o.id)&&['correct_explanation','challenge','self_correction','contrast'].includes(x.o.evidence_type));if(contrast)add(contrast.o);
 if(explore){
  // Cross-topic discovery lane is independent of topic graph and similarity thresholds.
  const visited=new Set(selected.map(x=>x.topic_id));for(const row of [...scored].sort((a,b)=>a.o.topic_id.localeCompare(b.o.topic_id))){if(selected.length>=max)break;if(!visited.has(row.o.topic_id)){add(row.o);visited.add(row.o.topic_id);}}
 }
 // Latest exact utterance is always included with a stable ID, and recent historical turns retain exact wording.
 if(!selectedIds.has(latest.id)&&selected.length>=max){const dropped=selected.pop();if(dropped)selectedIds.delete(dropped.id);}add(latest); // latest has priority over final filler
 const final=[...selected.filter(x=>x.id!==latest.id),latest];
 const topics=fixture.topics.filter(t=>new Set([latest.topic_id,...final.map(o=>o.topic_id)]).has(t.topic_id));
 const graph=fixture.links.filter(x=>topics.some(t=>t.topic_id===x.from_topic_id||t.topic_id===x.to_topic_id));
 const context={role,observations:final.map(x=>structuredClone(x)),roots:c.provisional_roots,relationships:c.learner_relationships,explicit_instructions:c.explicit_instructions,topics:topics.map(x=>({...x,id:x.topic_id})).slice(0,max),curriculum_neighbors:graph.slice(0,6),coverage:{included_observation_ids:final.map(o=>o.id),total_available_observations:obs.length+1,mode:method,exploratory:explore,truncated:obs.length+1>final.length,policy:'candidate selection only; hypotheses are model interpretation'}};
 const metrics={retrieved_ids:context.coverage.included_observation_ids,retrieved_historical:final.length-1,context_bytes:Buffer.byteLength(JSON.stringify(context)),lexical_ranking:scored.slice(0,Math.min(5,scored.length)).map(x=>({id:x.o.id,score:+score(x).toFixed(4)}))};
 return {context,metrics};
}
