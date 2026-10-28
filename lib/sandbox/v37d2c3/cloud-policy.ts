/** V3.7D.2C.3: pure, fail-closed identity and route policy for a Vercel cloud SHELL.
 * This module grants NO data read or write authority and does not bypass local gates.
 */
export type CloudIdentity = {
  schema: string;
  vercel_project_id: string;
  branch: string;
  repository_owner: string;
  repository_slug: string;
  sandbox_host: string;
  mode: string;
};
export type CloudEnvironment = Record<string, string | undefined>;
export type CloudStatus = {ok:true} | {ok:false;reason:string};
const deny = (reason:string):CloudStatus=>({ok:false,reason});
const unsafeKeys = [
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL",
  "DATABASE_URL", "DIRECT_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING",
  "QDRANT_URL", "QDRANT_API_KEY", "QDRANT_TOPIC_COLLECTION",
  "MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL", "MYWAY_EXPERIMENTAL_RUNTIME",
  "MYWAY_TOPIC_VECTOR_BACKEND",
];
export function evaluateCloudShell(env:CloudEnvironment,policy:CloudIdentity):CloudStatus {
  if(policy.schema!=="myway-v37d2c3-cloud-identity-v1" || policy.mode!=="readonly_shell" ||
    !/^prj_[a-zA-Z0-9]+$/.test(policy.vercel_project_id) ||
    policy.branch!=="myway/learning-sandbox-v3_7a" ||
    policy.repository_owner!=="willclarke22" || policy.repository_slug!=="v1" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(policy.sandbox_host))return deny("Invalid pinned cloud identity");
  if(env.VERCEL!=="1" || env.VERCEL_ENV!=="production")return deny("Not the Vercel experimental production environment");
  if(env.VERCEL_PROJECT_ID!==policy.vercel_project_id)return deny("Wrong Vercel project ID");
  if(env.VERCEL_GIT_COMMIT_REF!==policy.branch ||
    env.VERCEL_GIT_REPO_OWNER!==policy.repository_owner ||
    env.VERCEL_GIT_REPO_SLUG!==policy.repository_slug)return deny("Wrong Git branch/repository or missing Vercel system variables");
  if(env.MYWAY_CLOUD_SHELL_MODE!=="readonly")return deny("Explicit readonly cloud shell opt-in missing");
  if(unsafeKeys.some(key=>Boolean(env[key]?.trim())))return deny("Privileged database, worker, or vector settings are forbidden in cloud shell");
  const raw=(env.NEXT_PUBLIC_SUPABASE_URL||"").trim();
  let url:URL;
  try{url=new URL(raw);}catch{return deny("Sandbox Supabase URL missing or malformed");}
  if(url.protocol!=="https:" || url.hostname!==policy.sandbox_host ||
    url.port || url.pathname!=="/" || url.search || url.hash || url.username || url.password)
    return deny("Supabase project is not the installer-pinned sandbox");
  if(!(env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"").trim())return deny("Sandbox public client key missing");
  return {ok:true};
}
/** Intended cloud routes: static UI, Next chunks, and favicon only. All APIs denied. */
export function cloudRouteDecision(pathname:string, method:string):"allow"|"redirect"|"block" {
  if(method!=="GET"&&method!=="HEAD")return "block";
  if(pathname==="/")return "redirect";
  if(pathname==="/sandbox/probe-lab/learning-space" ||
      pathname==="/sandbox/probe-lab/learning-space/workbench")return "allow";
  if(pathname.startsWith("/_next/") || pathname==="/favicon.ico" || pathname==="/robots.txt")return "allow";
  return "block";
}
