
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { parseJsonObjectFromText } from "@/sandbox/probe-lab/visual-experience/json-extract";
import { callVisualLearningTurnModel } from "@/sandbox/probe-lab/visual-experience/model-provider.server";

import {
  makeCosmosStoryboardModelRequest,
  normalizeCosmosStoryboard,
} from "../cosmos-video-request";
import { generateCosmos3NanoVideo } from "../cosmos3-nano.server";

function cleanText(value: unknown, fallback: string, max = 3000) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.round(parsed)))
    : fallback;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

async function writeLatestDebug(value: unknown) {
  const debugPath = path.join(
    process.cwd(),
    "sandbox",
    "probe-lab",
    "cosmos-video",
    "debug",
    "latest-run.json",
  );

  await mkdir(path.dirname(debugPath), { recursive: true });
  await writeFile(
    debugPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));

  const learnerNeed = cleanText(
    body.learner_need,
    "I do not understand how expanding gas makes a piston turn a crankshaft.",
  );
  const visualStyle = cleanText(
    body.visual_style,
    "polished educational technical cutaway, realistic materials, clean studio lighting",
    500,
  );
  const durationSeconds = boundedInteger(
    body.duration_seconds,
    6,
    3,
    12,
  );

  const storyboardRequest = makeCosmosStoryboardModelRequest({
    learner_need: learnerNeed,
    visual_style: visualStyle,
    duration_seconds: durationSeconds,
  });

  try {
    const glmResult = await callVisualLearningTurnModel({
      provider: "glm",
      model_request: storyboardRequest as never,
      scaffold_raw_text: JSON.stringify({
        schema_version: "myway_cosmos_video_storyboard_v1",
        title: "Fallback educational video",
        teaching_goal: "Make the requested cause and effect visible.",
        misconception_or_blocker: "The causal mechanism is not visible.",
        visual_concept: "One clean educational demonstration.",
        video_prompt: `A polished educational demonstration showing ${learnerNeed}. One stable camera, physically plausible motion, no text.`,
        negative_prompt:
          "text, subtitles, labels, logos, flicker, blur, camera shake, mutation, duplicated parts, disappearing objects, warped geometry",
        shot_plan: [],
        success_checks: [],
      }),
      generation_preset: "cinematic",
      enable_streaming: false,
      retry_transient_errors: true,
      fallback_provider: "none",
    });

    const parsed = parseJsonObjectFromText(glmResult.raw_text);
    const storyboard = normalizeCosmosStoryboard(
      parsed.ok ? parsed.value : null,
      learnerNeed,
    );

    const resolution = cleanText(
      body.resolution,
      "720_16_9",
      40,
    );
    const fps = boundedInteger(body.fps, 24, 8, 60);
    const numOutputFrames = boundedInteger(
      body.num_output_frames,
      Math.max(49, Math.round(durationSeconds * fps) + 1),
      25,
      241,
    );
    const seed = boundedInteger(body.seed, 42, 0, 2_147_483_647);
    const steps = boundedInteger(body.steps, 30, 1, 100);
    const guidanceScale = boundedNumber(
      body.guidance_scale,
      7,
      0,
      30,
    );

    const cosmosPayload = {
      prompt: storyboard.video_prompt,
      negative_prompt: storyboard.negative_prompt,
      resolution,
      num_output_frames: numOutputFrames,
      fps,
      seed,
      steps,
      guidance_scale: guidanceScale,
    };

    const cosmosResult = await generateCosmos3NanoVideo(cosmosPayload);

    const responsePayload = {
      ok: true,
      learner_need: learnerNeed,
      visual_style: visualStyle,
      glm: {
        provider: glmResult.provider,
        provider_used: glmResult.provider_used,
        model: glmResult.model,
        duration_ms: glmResult.duration_ms,
        raw_text: glmResult.raw_text,
        parse_ok: parsed.ok,
        parse_error: parsed.ok ? null : parsed.error,
        diagnostics: glmResult.diagnostics ?? null,
        request_payload_preview:
          glmResult.request_payload_preview ?? null,
      },
      storyboard,
      cosmos: {
        endpoint: cosmosResult.endpoint,
        request_payload: cosmosResult.request_payload,
        response_metadata: cosmosResult.response_metadata,
        duration_ms: cosmosResult.duration_ms,
        video_url: cosmosResult.video_url,
        video_bytes: cosmosResult.video_bytes,
      },
      total_duration_ms: Date.now() - startedAt,
      created_at: new Date().toISOString(),
    };

    await writeLatestDebug(responsePayload);

    return NextResponse.json(responsePayload);
  } catch (caught) {
    const errorPayload = {
      ok: false,
      error:
        caught instanceof Error ? caught.message : String(caught),
      learner_need: learnerNeed,
      visual_style: visualStyle,
      total_duration_ms: Date.now() - startedAt,
      created_at: new Date().toISOString(),
    };

    await writeLatestDebug(errorPayload).catch(() => undefined);

    return NextResponse.json(errorPayload, { status: 500 });
  }
}
