
export type CosmosVideoStoryboard = {
  schema_version: "myway_cosmos_video_storyboard_v1";
  title: string;
  teaching_goal: string;
  misconception_or_blocker: string;
  visual_concept: string;
  video_prompt: string;
  negative_prompt: string;
  shot_plan: Array<{
    beat: number;
    time_range: string;
    visual_action: string;
    teaching_purpose: string;
  }>;
  success_checks: string[];
};

function cleanText(value: unknown, fallback: string, max = 1800) {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : fallback;
}

function cleanStringList(value: unknown, maxItems = 8, maxLength = 240) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => cleanText(item, "", maxLength))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, maxItems);
}

export function makeCosmosStoryboardModelRequest(input: {
  learner_need: string;
  visual_style: string;
  duration_seconds: number;
}) {
  const duration = Math.max(3, Math.min(12, input.duration_seconds));

  const responseContract = {
    schema_version: "myway_cosmos_video_storyboard_v1",
    title: "short title",
    teaching_goal: "one precise understanding change",
    misconception_or_blocker: "the likely conceptual blocker",
    visual_concept: "one coherent scene concept",
    video_prompt:
      "a single detailed prompt for a short educational text-to-video model",
    negative_prompt:
      "visual failures, unwanted content, text overlays, mutation, and camera problems to avoid",
    shot_plan: [
      {
        beat: 1,
        time_range: "0.0-2.0s",
        visual_action: "what visibly happens",
        teaching_purpose: "why this action helps",
      },
    ],
    success_checks: [
      "specific visible facts that must be true in the finished clip",
    ],
  };

  const system = `You are MyWay's educational video director.
Return exactly one valid JSON object and nothing else.
Your job is to convert a learner's confusion or explanation request into one short, visually coherent, physically plausible educational video prompt for NVIDIA Cosmos3 Nano.

Important:
- The finished clip is approximately ${duration} seconds.
- Use one scene, one camera concept, and one main causal process.
- Prefer a clean educational cutaway, demonstration, or miniature physical scene.
- Make motion observable and causally ordered.
- Use concrete visible nouns, materials, positions, directions, and actions.
- Keep the camera stable unless one simple camera move is essential.
- Do not request narration, subtitles, labels, equations, logos, watermarks, or readable on-screen text.
- Do not ask the video model to explain verbally.
- Avoid scene changes, montages, multiple unrelated processes, and excessive object counts.
- Preserve object identity and mechanical relationships.
- The video_prompt must stand alone because it will be sent directly to Cosmos3 Nano.
- The negative_prompt should discourage mutation, duplicated parts, disappearing objects, warped geometry, unreadable text, flicker, blur, camera shake, and physically impossible motion.
- Do not output hidden reasoning, markdown, or code fences.`;

  const user = `LEARNER_NEED:
${cleanText(input.learner_need, "Show one concept clearly.", 3000)}

VISUAL_STYLE:
${cleanText(input.visual_style, "polished educational cutaway", 240)}

TARGET_DURATION_SECONDS:
${duration}

OUTPUT_SHAPE:
${JSON.stringify(responseContract)}

Create the strongest single-scene video concept for helping this learner get unstuck.`;

  return {
    model_task: "cosmos3_nano_educational_video_storyboard",
    schema_version: "myway_cosmos_video_director_request_v1",
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    response_contract: responseContract,
    prompt_stats: {
      system_chars: system.length,
      user_chars: user.length,
      total_chars: system.length + user.length,
    },
  };
}

export function normalizeCosmosStoryboard(
  raw: unknown,
  learnerNeed: string,
): CosmosVideoStoryboard {
  const root =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const rawShotPlan = Array.isArray(root.shot_plan) ? root.shot_plan : [];
  const shotPlan = rawShotPlan
    .map((item, index) => {
      const record =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      if (!record) return null;

      return {
        beat:
          typeof record.beat === "number" && Number.isFinite(record.beat)
            ? Math.max(1, Math.round(record.beat))
            : index + 1,
        time_range: cleanText(record.time_range, `${index * 2}-${index * 2 + 2}s`, 40),
        visual_action: cleanText(record.visual_action, "", 500),
        teaching_purpose: cleanText(record.teaching_purpose, "", 500),
      };
    })
    .filter(
      (
        item,
      ): item is {
        beat: number;
        time_range: string;
        visual_action: string;
        teaching_purpose: string;
      } => Boolean(item?.visual_action),
    )
    .slice(0, 6);

  const fallbackPrompt = `A polished educational cutaway demonstration that clearly shows: ${cleanText(
    learnerNeed,
    "one physical cause-and-effect process",
    1200,
  )}. One stable camera, clean composition, physically plausible motion, no text.`;

  return {
    schema_version: "myway_cosmos_video_storyboard_v1",
    title: cleanText(root.title, "Educational video test", 120),
    teaching_goal: cleanText(
      root.teaching_goal,
      "Make the requested process visually understandable.",
      500,
    ),
    misconception_or_blocker: cleanText(
      root.misconception_or_blocker,
      "The causal connection is not yet visible.",
      500,
    ),
    visual_concept: cleanText(
      root.visual_concept,
      "One polished educational demonstration.",
      800,
    ),
    video_prompt: cleanText(root.video_prompt, fallbackPrompt, 3500),
    negative_prompt: cleanText(
      root.negative_prompt,
      "text, subtitles, labels, logos, watermark, flicker, blur, camera shake, duplicated parts, disappearing objects, warped geometry, mutation, physically impossible movement",
      1200,
    ),
    shot_plan: shotPlan,
    success_checks: cleanStringList(root.success_checks),
  };
}
