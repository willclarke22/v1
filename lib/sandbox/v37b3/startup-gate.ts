/**
 * V3.7B.3 experimental-only Next startup gate.
 * The app is intentionally not launchable before the V3.7C route audit.
 * This code is included only in v1-learning-experiment's next.config.ts.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function parseEnvText(value: string): Record<string,string> {
  const output: Record<string,string> = {};
  for (const line of value.split(/\r?\n/)) {
    const found = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!found) continue;
    let val = found[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val=val.slice(1,-1);
    output[found[1]] = val;
  }
  return output;
}
function readJson(filename: string): Record<string, unknown> {
  const content = JSON.parse(readFileSync(filename, "utf8")) as unknown;
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("Invalid sandbox boundary format");
  return content as Record<string,unknown>;
}
function stop(message:string): never { throw new Error(`V3.7B.3 EXPERIMENTAL STARTUP BLOCK: ${message}`); }
export function assertExperimentalStartupGate(): void {
  const cwd=path.resolve(process.cwd());
  if (path.basename(cwd).toLowerCase() !== "v1-learning-experiment") stop("wrong working directory");
  let env: Record<string,string>, pin: Record<string,unknown>, b: Record<string,unknown>;
  try {
    env = parseEnvText(readFileSync(path.join(cwd, ".env.local"), "utf8"));
    pin = readJson(path.join(cwd, "scripts", "sandbox", "v37b2", "sandbox-destination.json"));
    b = readJson(path.join(cwd, "scripts", "sandbox", "v37b", "isolation-boundary.json"));
  } catch { stop("missing or unreadable experimental configuration; do not copy production credentials"); }
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "").toLowerCase();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (b.schema !== "myway-v37b-boundary-v1" || path.resolve(String(b.worktree)).toLowerCase() !== cwd.toLowerCase()) stop("worktree boundary mismatch");
  if (pin.schema !== "myway-v37b2-destination-v1" || pin.ready !== true || !url || !key ||
      sha(url) !== pin.url_sha256 || sha(key) !== pin.service_key_sha256) stop("unverified sandbox Supabase destination");
  if (sha(url) === b.original_supabase_url_sha256 || sha(key) === b.original_supabase_service_key_sha256) stop("production Supabase destination detected");
  if (env.MYWAY_EXPERIMENTAL_RUNTIME !== "v37b" || env.MYWAY_TOPIC_VECTOR_BACKEND !== "supabase") stop("invalid experimental backend flags");
  const qKeys = ["QDRANT_URL", "QDRANT_API_KEY", "QDRANT_TOPIC_COLLECTION"];
  if (qKeys.some(k => Boolean(env[k] || process.env[k]))) stop("Qdrant environment settings are not allowed in Supabase-only experimental runtime");
  // V3.7C will include an explicit, guarded launcher after auditing route/worker actions.
  if (process.env.MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL !== "v37c-route-audit-passed") {
    stop("Next.js is disabled until V3.7C route/worker safety verification");
  }
}
