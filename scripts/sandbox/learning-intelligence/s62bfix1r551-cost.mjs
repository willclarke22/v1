/** Read-only cost visibility from completed local traces; not a billing API. */
import fs from 'node:fs';import path from 'node:path';
const round=n=>Math.round((n+Number.EPSILON)*1e8)/1e8;
const num=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
export function costOfCompletedTrace(trace){
 if(!trace||trace.status!=='complete')return null;
 const direct=num(trace.total_estimated_usd);
 if(direct!==null)return direct;
 const costs=(trace.calls??[]).map(c=>num(c.estimated_usd));
 return costs.length&&costs.every(x=>x!==null)?round(costs.reduce((a,b)=>a+b,0)):null;
}
export function sumSessionCosts(dir,turns=[],pendingNames=[]){
 let completed=0,priced=0,unpriced=0,knownPartial=0,partialCount=0;
 for(const t of turns){if(!/^t\d{4,}$/.test(t?.turn_id??''))continue;let z=null;try{z=JSON.parse(fs.readFileSync(path.join(dir,'turns',t.turn_id+'.json'),'utf8'))}catch{}
  const v=costOfCompletedTrace(z);if(v===null){unpriced++;continue}completed+=v;priced++;}
 for(const fn of pendingNames){if(!/^t\d{4,}\.pending\.json$/.test(fn))continue;let z=null;try{z=JSON.parse(fs.readFileSync(path.join(dir,'turns',fn),'utf8'))}catch{}
  partialCount++;for(const c of z?.calls??[])knownPartial+=num(c.estimated_usd)??0;}
 return {completed_estimated_usd:round(completed),known_pending_estimated_usd:round(knownPartial),completed_priced_turns:priced,unpriced_historical_turns:unpriced,pending_unresolved_count:partialCount,complete_costs_only:true,provider_invoice_verified:false};
}
export function turnCostBreakdown(calls=[],total=null){
 const sum=roles=>round(calls.filter(c=>roles.includes(c.role)).reduce((n,c)=>n+(num(c.estimated_usd)??0),0));
 const shared=sum(['ROUTE','A']);const bOnly=sum(['B_ONLY']);const bx=sum(['B_DESIGN','X_IMPLEMENT']);
 return {shared_estimated_usd:shared,b_only_estimated_usd:bOnly,bx_estimated_usd:bx,total_estimated_usd:num(total),unclassified_estimated_usd:round(Math.max(0,(num(total)??0)-shared-bOnly-bx))};
}
