import { createServerSupabaseClient } from "@/lib/supabase/server";

type TopicStateRow = {
  topic_id: string;
  updated_at: string;
  last_run_id: string | null;
  topic_name: string;
  confusion: number | null;
  insight: number | null;
  learning_score: number | null;
  diagnosis: string | null;
  next_step: string | null;
  topic_json: Record<string, unknown> | null;
};

export async function getLatestTopicState(): Promise<TopicStateRow[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("topic_state")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to read topic_state: ${error.message}`);
  }

  return (data ?? []) as TopicStateRow[];
}