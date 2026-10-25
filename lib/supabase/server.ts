import { createClient } from "@supabase/supabase-js";
import { assertExperimentSupabaseConfig } from "@/lib/sandbox/v37b/runtime-guards.server";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createServerSupabaseClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? getEnv("SUPABASE_URL");

  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertExperimentSupabaseConfig(url, serviceRoleKey);

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
