/** Sandbox destination pin. Hashes are safe to commit; credentials are not. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
const sha = (s:string)=>createHash("sha256").update(s).digest("hex");
export function assertPinnedSandboxSupabaseProject(url:string,key:string):void {
  const filename=path.join(process.cwd(),"scripts","sandbox","v37b2","sandbox-destination.json");
  let value:unknown;
  try{value=JSON.parse(readFileSync(filename,"utf8"));}
  catch{throw new Error("V3.7B.2 BLOCK: sandbox destination not configured. Use configure-sandbox.ps1.");}
  const b=value as Record<string,unknown>;
  if(b.schema!=="myway-v37b2-destination-v1" || b.ready!==true ||
     typeof b.url_sha256!=="string" || typeof b.service_key_sha256!=="string" ){
    throw new Error("V3.7B.2 BLOCK: invalid experimental database destination pin.");
  }
  if(sha(url.trim().replace(/\/+$/g,"").toLowerCase())!==b.url_sha256 ||
     sha(key.trim())!==b.service_key_sha256){
    throw new Error("V3.7B.2 BLOCK: Supabase credentials do not match pinned myway_sandbox destination.");
  }
}
