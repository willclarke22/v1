/** Per-role experiments restricted to compatible Chat Completions structured-output models.
 * Rates are estimates in USD / 1M tokens, not invoices or billing caps. */
export const PRICING = Object.freeze({
 'gpt-4.1-mini': {input:0.4,cached:0.1,output:1.6},
 'gpt-4.1': {input:2,cached:0.5,output:8}
});
export const MODEL_IDS=Object.keys(PRICING);
export const DEFAULT_MODELS=Object.freeze({A:'gpt-4.1-mini',B:'gpt-4.1-mini',C:'gpt-4.1-mini',L:'gpt-4.1-mini'});
export function selectModels(o) {
 const m={A:o.modelA??DEFAULT_MODELS.A,B:o.modelB??DEFAULT_MODELS.B,C:o.modelC??DEFAULT_MODELS.C,L:o.modelL??DEFAULT_MODELS.L};
 for(const [r,id] of Object.entries(m))if(!PRICING[id])throw Error(`Unsupported ${r} model ${id}; available compatible models: ${MODEL_IDS.join(', ')}`);
 return m;
}
export function estimateCost(usage,model){
 const r=PRICING[model];if(!r)throw Error('Missing verified model price');
 if(!Number.isSafeInteger(usage?.prompt_tokens)||usage.prompt_tokens<0||!Number.isSafeInteger(usage?.completion_tokens)||usage.completion_tokens<0)throw Error('Unknown provider usage');
 const cached=usage.prompt_tokens_details?.cached_tokens??0;
 if(!Number.isSafeInteger(cached)||cached<0||cached>usage.prompt_tokens)throw Error('Invalid cached token usage');
 return +(((usage.prompt_tokens-cached)*r.input+cached*r.cached+usage.completion_tokens*r.output)/1e6).toFixed(9);
}
export function admissionEstimate(schedule,turns,opts,models){
 const perVisit=turns,stepCount=schedule.length*perVisit,extra=opts.explore==='on'?1:0;
 const anticipatedCalls={A:stepCount*(1+extra),B:stepCount*(1+extra),L:schedule.length*(turns-1),C:opts.c==='auto'?stepCount:0};
 const maxInput=16500,maxOutput={A:1250,B:650,C:400,L:250};
 const estimate=Object.entries(anticipatedCalls).reduce((s,[r,n])=>s+n*(maxInput*PRICING[models[r]].input+maxOutput[r]*PRICING[models[r]].output)/1e6,0);
 return {upper_calls:Object.values(anticipatedCalls).reduce((a,b)=>a+b,0),estimated_usd:+estimate.toFixed(6),calls_by_role:anticipatedCalls,price_model:'approximate pessimistic planning estimate; not billing cap'};
}
