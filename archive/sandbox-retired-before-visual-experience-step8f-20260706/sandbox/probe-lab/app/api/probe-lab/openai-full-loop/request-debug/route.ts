import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  defaultFullLoopProvider,
  defaultModelForProvider,
  inferFullLoopProvider,
  text,
} from "../_shared";
import {
  buildModelDrivenVisualStoryPrompts,
  type ModelDrivenVisualStoryRequest,
} from "../generate/model-driven-visual-story";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestDebugBody = {
  learner_message?: string;
  target_topic_label?: string;
  bridge_level?: "bridge_0" | "bridge_1" | "bridge_2" | "full_bridge";
  jargon_level?: "none" | "light" | "standard" | "full";
  preferred_style?: string;
  topic_mode?: string;
  active_topic_id?: string | null;
  generate_reason?: string;
  turn_mode?: string;
  model?: string;
  model_provider?: string;
  provider?: string;
};

const DEBUG_FILE_RELATIVE = path.join(
  "sandbox",
  "probe-lab",
  "debug",
  "openai-full-loop",
  "latest-model-request-debug.json",
);

const DEBUG_FILE_ABSOLUTE = path.join(process.cwd(), DEBUG_FILE_RELATIVE);
const DEBUG_FILE_DISPLAY = DEBUG_FILE_RELATIVE.split(path.sep).join("\\");

async function writeDebug(snapshot: Record<string, unknown>) {
  await mkdir(path.dirname(DEBUG_FILE_ABSOLUTE), { recursive: true });
  await writeFile(DEBUG_FILE_ABSOLUTE, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}

function bodyToInput(body: RequestDebugBody): ModelDrivenVisualStoryRequest {
  const learnerMessage = text(
    body.learner_message,
    "Is there a way that I can try to understand this? I can't picture it.",
    1600,
  );
  const topicLabel = text(body.target_topic_label, "Auto-detect from learner message", 180);
  const bridgeLevel = body.bridge_level ?? "bridge_0";
  const jargonLevel = body.jargon_level ?? (bridgeLevel === "bridge_0" ? "none" : "light");

  return {
    learnerMessage,
    topicLabel,
    bridgeLevel,
    jargonLevel,
    preferredStyle: body.preferred_style ?? "visual_description",
    topicMode: body.topic_mode ?? "auto",
    activeTopicId: body.active_topic_id ?? null,
    generateReason: body.generate_reason ?? "message",
    turnMode: body.turn_mode ?? "teach_then_check",
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "openai-full-loop/request-debug",
    architecture: "model_drives_visual_story_draft_v1",
    calls_model: false,
    writes: DEBUG_FILE_DISPLAY,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RequestDebugBody;
  const modelInput = bodyToInput(body);
  const provider = inferFullLoopProvider({
    provider: body.model_provider ?? body.provider ?? defaultFullLoopProvider(),
    model: body.model,
  });
  const model = body.model?.trim() || defaultModelForProvider(provider);
  const prompts = buildModelDrivenVisualStoryPrompts(modelInput);

  const snapshot = {
    schema_version: "myway_openai_full_loop_latest_model_request_debug_v4",
    generated_at: new Date().toISOString(),
    route: "openai-full-loop/request-debug",
    architecture: "model_drives_visual_story_draft_v1",
    calls_model: false,
    provider,
    model,
    max_output_tokens_current_generate_route: 2400,
    request_summary: modelInput,
    prompt_sizes: {
      system_prompt_characters: prompts.system.length,
      user_prompt_characters: prompts.user.length,
      total_prompt_characters: prompts.system.length + prompts.user.length,
    },
    expected_model_output_schema: "myway_model_visual_story_draft_v1",
    prompts: {
      system_prompt: prompts.system,
      user_prompt: prompts.user,
    },
  };

  await writeDebug(snapshot);

  return NextResponse.json({
    ok: true,
    calls_model: false,
    provider,
    model,
    prompt_sizes: snapshot.prompt_sizes,
    debug_file_path: DEBUG_FILE_DISPLAY,
    debug_file_absolute_path: DEBUG_FILE_ABSOLUTE,
  });
}
