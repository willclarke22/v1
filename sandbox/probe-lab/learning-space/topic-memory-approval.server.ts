/** V3.7D.2A: short-lived, one-time server-local approval capabilities.
 * Never export issue/consume to a client module. Tokens are NOT persistence authority
 * without explicit user action and a fresh database/version check.
 */
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { TopicStateRow } from "@/lib/persistence/read";
import type { TopicMemoryPreview } from "./topic-memory-preview";

export type MemoryApproval = {
  preview: TopicMemoryPreview;
  topicName: string;
  rootProblem: string;
  evidenceQuote: string;
  originalMessage: string;
  currentMessage: string;
  snapshotDigest: string;
  rootConfidence: number;
  confusion: number;
  insight: number;
  createdAt: number;
};
const MAX_APPROVALS=64, TTL_MS=10*60*1000;
const approvals = new Map<string, MemoryApproval>();
const reviews = new Map<string, MemoryApproval>();
const canonical = (s:string) => s.trim().toLocaleLowerCase("en-US").replace(/\s+/g," ");
export const canonicalLabel=canonical;
export function memoryDigest(rows: TopicStateRow[]): string {
  const data=rows.map(row=>({id:row.topic_id,updated:row.updated_at,label:canonical(row.topic_label||""),json:row.topic_json}))
    .sort((a,b)=>a.id.localeCompare(b.id));
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
function sweep(){
  const now=Date.now();
  for(const [token,p] of approvals){if(now-p.createdAt>TTL_MS)approvals.delete(token);}
  for(const [token,p] of reviews){if(now-p.createdAt>TTL_MS)reviews.delete(token);}
  while(reviews.size>=MAX_APPROVALS){const first=reviews.keys().next().value;if(!first)break;reviews.delete(first);}
  while(approvals.size>=MAX_APPROVALS){const first=approvals.keys().next().value;
    if(!first)break;approvals.delete(first);}
}
export function issueApproval(p: Omit<MemoryApproval,"createdAt">): string | null {
  if(!["associate_existing","propose_new"].includes(p.preview.action)||p.preview.mode!=="read_only")return null;
  if(!p.rootProblem.trim()||!p.evidenceQuote.trim()||!p.topicName.trim())return null;
  sweep();
  const token=randomBytes(32).toString("hex");
  approvals.set(token,{...p,createdAt:Date.now()});
  return token;
}
/** Consumes even if persistence fails; user must refresh/reassess for a fresh preview. */
export function consumeApproval(token:unknown): MemoryApproval | null {
  if(typeof token!=="string"||!/^[0-9a-f]{64}$/.test(token))return null;
  const p=approvals.get(token);approvals.delete(token);
  if(!p||Date.now()-p.createdAt>TTL_MS)return null;
  return p;
}

/** One-time, server-held read-only preview for an explicit human-reviewed model recommendation.
 * A verifier decision sent by a browser is never sufficient authority to write.
 */
export function issueReview(p: Omit<MemoryApproval,"createdAt">):string|null {
 if(p.preview.retrievalStatus!=="semantic_pgvector"||!p.preview.candidates.length)return null;
 sweep(); const token=randomBytes(32).toString("hex");
 reviews.set(token,{...p,createdAt:Date.now()}); return token;
}
export function consumeReview(token:unknown):MemoryApproval|null {
 if(typeof token!=="string"||!/^[0-9a-f]{64}$/.test(token))return null;
 const p=reviews.get(token);reviews.delete(token);
 return p&&Date.now()-p.createdAt<=TTL_MS?p:null;
}
