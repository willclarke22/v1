/** V3.7D.2C. Model-estimated confusion/insight evidence, not mastery. */
export type ScorePair={confusion:number;insight:number};
export function isRubricScore(v:unknown):v is number{return typeof v==="number"&&Number.isInteger(v)&&v>=-1&&v<=10;}
export function scoredObservation(c:unknown,i:unknown):{confusion:number|null;insight:number|null;rubric:"model_0_10_v1"}{
 return {confusion:isRubricScore(c)&&c>=0?c:null,insight:isRubricScore(i)&&i>=0?i:null,rubric:"model_0_10_v1"};
}
export function scoreSummary(items:unknown[]):{confusion:number|null;insight:number|null;confusionCount:number;insightCount:number}{
 const records=items.filter((x):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x));
 const scores=(key:"confusion"|"insight")=>records.map(r=>r[key]).filter((x):x is number=>isRubricScore(x)&&x>=0);
 const cs=scores("confusion"),is=scores("insight");
 const avg=(xs:number[])=>xs.length?Number((xs.reduce((a,b)=>a+b,0)/xs.length/10).toFixed(4)):null;
 return {confusion:avg(cs),insight:avg(is),confusionCount:cs.length,insightCount:is.length};
}
