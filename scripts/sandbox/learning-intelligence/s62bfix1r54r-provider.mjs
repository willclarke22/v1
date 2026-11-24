/** R5.4R creative calls only: longer but bounded deadline for output-heavy HTML generation.
 * NOT a retry facility; a failed/aborted request remains billing-unknown and is NEVER replayed.
 * All normal GoldLoop calls keep their original provider settings.
 */
export async function callProviderExtended(payload,ctx,{timeoutMs=120000,fetchFn=fetch}={}) {
 if(!Number.isInteger(timeoutMs)||timeoutMs<32000||timeoutMs>180000)throw Error('Invalid creative call timeout');
 const abort=new AbortController(),start=Date.now();
 const timer=setTimeout(()=>abort.abort(),timeoutMs);
 let stage='request_in_flight';
 try {
  const res=await fetchFn(ctx.url,{method:'POST',headers:{Authorization:'Bearer '+ctx.key,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',cache:'no-store',signal:abort.signal});
  stage='response_headers_received';
  if(!res.ok)throw Error('Provider returned HTTP '+res.status+'; paid request must be reviewed');
  stage='reading_response_body';
  const body=await res.json();
  stage='response_body_parsed';
  const content=body?.choices?.[0]?.message?.content;
  if(typeof content!=='string'||body.choices[0].finish_reason!=='stop')throw Error('Provider response missing or truncated; do not retry automatically');
  return {raw:content,usage:body.usage,model:body.model??null,finishReason:body.choices[0].finish_reason,transport:{elapsed_ms:Date.now()-start,deadline_ms:timeoutMs}};
 }catch(e){
  const aborted=abort.signal.aborted||e?.name==='AbortError';
  const why=aborted?'creative provider deadline expired':String(e?.message??e);
  throw new Error(`Creative provider request failed (${stage}; elapsed ${Date.now()-start}ms; deadline ${timeoutMs}ms): ${why}. Billing status unknown; do not automatically retry.`);
 }finally{clearTimeout(timer);}
}
