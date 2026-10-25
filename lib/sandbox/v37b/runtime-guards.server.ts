/**
 * Experimental worktree runtime boundary. This module is installed ONLY into
 * v1-learning-experiment. Production-source files remain untouched.
 *
 * Fails closed until the operator configures a separate Supabase project and
 * confirms the exact experimental Qdrant collection. Never prints credentials.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

interface Boundary {
  schema: "myway-v37b-boundary-v1";
  worktree: string;
  original_supabase_url_sha256: string;
  original_supabase_service_key_sha256: string;
  production_qdrant_collection: string;
  experimental_qdrant_collection: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function readBoundary(): Boundary {
  if (process.env.MYWAY_EXPERIMENTAL_RUNTIME !== "v37b") {
    throw new Error("V3.7B BLOCK: MYWAY_EXPERIMENTAL_RUNTIME=v37b is required in the experimental worktree.");
  }
  const file = path.join(process.cwd(), "scripts", "sandbox", "v37b", "isolation-boundary.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("V3.7B BLOCK: experimental isolation boundary missing or unreadable.");
  }
  const boundary = parsed as Partial<Boundary>;
  if (
    boundary.schema !== "myway-v37b-boundary-v1" ||
    typeof boundary.worktree !== "string" ||
    typeof boundary.original_supabase_url_sha256 !== "string" ||
    typeof boundary.original_supabase_service_key_sha256 !== "string" ||
    typeof boundary.production_qdrant_collection !== "string" ||
    typeof boundary.experimental_qdrant_collection !== "string"
  ) {
    throw new Error("V3.7B BLOCK: malformed experimental isolation boundary.");
  }
  const current = path.resolve(process.cwd()).toLowerCase();
  const intended = path.resolve(boundary.worktree).toLowerCase();
  if (current !== intended) {
    throw new Error("V3.7B BLOCK: process working directory is not the verified experimental worktree.");
  }
  return boundary as Boundary;
}

export function assertExperimentSupabaseConfig(url: string, serviceKey: string): void {
  const boundary = readBoundary();
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error("V3.7B BLOCK: invalid experimental Supabase URL.");
  }
  if (target.protocol !== "https:" || !target.hostname || target.username || target.password || target.search || target.hash) {
    throw new Error("V3.7B BLOCK: experimental Supabase URL must be an HTTPS project endpoint.");
  }
  if (sha256(normalizedUrl(url)) === boundary.original_supabase_url_sha256) {
    throw new Error("V3.7B BLOCK: experimental Supabase URL matches the original project.");
  }
  if (!serviceKey || sha256(serviceKey.trim()) === boundary.original_supabase_service_key_sha256) {
    throw new Error("V3.7B BLOCK: experimental Supabase credentials are missing or match the original service-role key.");
  }
}

export function assertExperimentQdrantConfig(collection: string, url: string | null, key: string | null): void {
  const boundary = readBoundary();
  if (
    collection !== boundary.experimental_qdrant_collection ||
    collection === boundary.production_qdrant_collection ||
    !collection.startsWith("myway-topics-sandbox")
  ) {
    throw new Error("V3.7B BLOCK: Qdrant collection must be the isolated experimental collection.");
  }
  if (!url || !key) {
    throw new Error("V3.7B BLOCK: experimental Qdrant URL and key are required.");
  }
  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    throw new Error("V3.7B BLOCK: invalid Qdrant URL.");
  }
  if (
    !(endpoint.protocol === "https:" || (endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname))) ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash
  ) {
    throw new Error("V3.7B BLOCK: Qdrant must use HTTPS or a localhost HTTP endpoint.");
  }
}
