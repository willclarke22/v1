/** Cost accounting uses the unchanged MyWay model-token-usage implementation. */
export class CostLedger {
  constructor(costModule,budgetUsd){this.cost=costModule;this.budget=budgetUsd;this.rows=[];this.spent=0;this.unknown=0;this.attempts=0;}
  reserve(stage,model){
    // Conservative call admission reserve, NOT a hard per-request spend cap.
    const reserve=0.01;
    if(this.spent+reserve>this.budget+1e-12)throw Error(`MODEL BUDGET STOP: known USD ${this.spent.toFixed(6)} + per-call reserve ${reserve.toFixed(2)} exceeds USD ${this.budget.toFixed(3)} (stage ${stage}).`);
    this.attempts++;
  }
  record({caseId,stage,model,usage,elapsedMs,status}){
    const x=this.cost.calculateStageCost({provider:'openai',model,usage,called:true});
    // Failed or timed-out provider calls may still bill. Never show them as free.
    const uncertain=status!=='ok'||x.estimatedUsd===null;
    if(uncertain)this.unknown++;
    if(x.estimatedUsd!==null)this.spent+=x.estimatedUsd;
    const row={caseId,stage,model,status,elapsedMs:Math.round(elapsedMs),promptTokens:usage?.promptTokens??null,completionTokens:usage?.completionTokens??null,cachedTokens:usage?.cachedTokens??null,totalTokens:usage?.totalTokens??null,estimateStatus:uncertain?'unknown_or_incomplete':x.status,estimatedUsd:x.estimatedUsd};
    this.rows.push(row);return row;
  }
  summary(){return {rateSource:'existing MyWay model-token-usage.ts (standard USD per million, verify for billing)',budgetUsd:this.budget,knownEstimatedUsd:Number(this.spent.toFixed(8)),unknownOrIncompleteCalls:this.unknown,attemptedCalls:this.attempts,complete:this.unknown===0,notInvoice:true};}
}
export function parseUsage(body){const u=body?.usage;if(!u||typeof u!=='object')return null;
 const integer=x=>Number.isSafeInteger(x)&&x>=0?x:null;
 const input=integer(u.promptTokens),out=integer(u.completionTokens),cached=integer(u.cachedTokens);
 if(input===null||out===null||(cached!==null&&cached>input))return null;
 return {promptTokens:input,completionTokens:out,cachedTokens:cached,totalTokens:integer(u.totalTokens)??input+out};
}
