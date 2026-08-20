import { NextResponse } from "next/server";

const DEFAULT_OMNI_MODEL =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const MAX_VIDEO_BYTES =
  24 * 1024 * 1024;
const REQUEST_TIMEOUT_MS =
  300_000;

type CritiqueProblem = {
  time: string;
  problem: string;
  desired_change: string;
};

type FreeformCritique = {
  summary: string;
  preserve: string[];
  problems: CritiqueProblem[];
  top_repairs: string[];
};

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.min(
    max,
    Math.max(min, value),
  );
}

function text(
  value: unknown,
  fallback = "",
) {
  return typeof value ===
      "string" &&
    value.trim()
    ? value.trim()
    : fallback;
}

function stringArray(
  value: unknown,
  limit: number,
) {
  return (
    Array.isArray(value)
      ? value
      : []
  )
    .filter(
      (item): item is string =>
        typeof item ===
          "string" &&
        Boolean(item.trim()),
    )
    .map((item) =>
      item.trim(),
    )
    .slice(0, limit);
}

function extractBalancedJson(
  raw: string,
) {
  const fenced =
    raw.match(
      /```(?:json)?\s*([\s\S]*?)```/i,
    )?.[1] ??
    raw;
  const source =
    fenced.trim();
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (
    let index = 0;
    index < source.length;
    index += 1
  ) {
    const char =
      source[index];

    if (start < 0) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (
      char === "}"
    ) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(
          start,
          index + 1,
        );
      }
    }
  }

  throw new Error(
    "Omni response did not contain one complete JSON object.",
  );
}

function normalizeCritique(
  value: unknown,
): FreeformCritique {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Omni returned an invalid critique object.",
    );
  }

  const item =
    value as Record<
      string,
      unknown
    >;

  const compactPreserve =
    stringArray(
      item.preserve,
      4,
    );
  const legacyStrengths =
    Array.isArray(
      item.strengths,
    )
      ? item.strengths
      : [];

  const preserve =
    compactPreserve.length
      ? compactPreserve
      : legacyStrengths
          .filter(
            (entry) =>
              entry &&
              typeof entry ===
                "object" &&
              !Array.isArray(
                entry,
              ),
          )
          .map((entry) => {
            const strength =
              entry as Record<
                string,
                unknown
              >;
            return text(
              strength.observation,
              text(
                strength.preserve,
                "",
              ),
            );
          })
          .filter(Boolean)
          .slice(0, 4);

  const rawProblems =
    Array.isArray(
      item.problems,
    )
      ? item.problems
      : [];

  const problems =
    rawProblems
      .filter(
        (entry) =>
          entry &&
          typeof entry ===
            "object" &&
          !Array.isArray(
            entry,
          ),
      )
      .map((entry) => {
        const problem =
          entry as Record<
            string,
            unknown
          >;
        return {
          time:
            text(
              problem.time,
              text(
                problem.time_range_s,
                "unspecified",
              ),
            ),
          problem:
            text(
              problem.problem,
              text(
                problem.observation,
                "Visible problem.",
              ),
            ),
          desired_change:
            text(
              problem.desired_change,
              "Improve this visible result.",
            ),
        };
      })
      .slice(0, 5);

  return {
    summary:
      text(
        item.summary,
        text(
          item.what_the_video_communicates,
          "Omni completed the freeform visual critique.",
        ),
      ),
    preserve,
    problems,
    top_repairs:
      stringArray(
        item.top_repairs,
        3,
      ),
  };
}

function critiquePrompt(
  instruction: string,
  durationS: number,
  stage: string,
) {
  return `Watch this approximately ${durationS.toFixed(1)} second generated 3D film. This is ${stage || "a production revision"}.

ORIGINAL REQUEST:
${instruction}

Judge the actual video against that request. There is no reference video.

Report only what is visibly supported. Identify:
- what works and should be preserved,
- the most important visible problems,
- what should visibly change in the next version.

Focus on camera, staging, motion, timing, depth/occlusion, interaction readability, composition and clarity.
Do not infer hidden 3D facts. Distinguish camera/parallax from object motion when you can. Use timestamps where useful.

Keep it short: at most 4 preserve items, 5 problems and 3 top repairs.

Return only JSON:
{
  "summary": "what a viewer understands and the concise verdict",
  "preserve": ["visible strength to keep"],
  "problems": [
    {
      "time": "8.4-11.1",
      "problem": "what visibly goes wrong",
      "desired_change": "what should visibly change"
    }
  ],
  "top_repairs": ["highest-priority repair"]
}`;
}

async function postOmni(
  input: {
    endpoint: string;
    apiKey: string;
    model: string;
    videoDataUrl: string;
    prompt: string;
  },
) {
  const controller =
    new AbortController();
  const timeout =
    setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );
  const started = Date.now();

  try {
    const response = await fetch(
      `${input.endpoint}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${input.apiKey}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "video_url",
                  video_url: {
                    url:
                      input.videoDataUrl,
                  },
                },
                {
                  type: "text",
                  text: input.prompt,
                },
              ],
            },
          ],
          max_tokens: 2_500,
          stream: false,
          temperature: 0.2,
          top_p: 0.9,
          chat_template_kwargs: {
            enable_thinking: false,
          },
        }),
        signal:
          controller.signal,
      },
    );
    const payload =
      (await response
        .json()
        .catch(
          () => null,
        )) as any;

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ??
          `Omni request failed with HTTP ${response.status}.`,
      );
    }

    const raw =
      payload?.choices?.[0]
        ?.message?.content;
    if (
      typeof raw !==
        "string" ||
      !raw.trim()
    ) {
      throw new Error(
        "Omni returned no final assistant content.",
      );
    }

    return {
      raw,
      elapsed_ms:
        Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const model =
    process.env
      .MYWAY_CINEMATIC_OMNI_MODEL
      ?.trim() ||
    DEFAULT_OMNI_MODEL;

  return NextResponse.json({
    ok: true,
    configured: Boolean(
      process.env.NVIDIA_API_KEY
        ?.trim(),
    ),
    provider: "nvidia",
    model,
    contract_revision:
      "cp2b2_compact_omni_critique_v1",
    reference_smoke_before_each_call:
      false,
  });
}

export async function POST(
  request: Request,
) {
  const totalStarted =
    Date.now();

  try {
    const apiKey =
      process.env.NVIDIA_API_KEY
        ?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing NVIDIA_API_KEY.",
        },
        { status: 500 },
      );
    }

    const form =
      await request.formData();
    const video =
      form.get("video");
    const instruction =
      text(
        form.get("instruction"),
        "Create a clear, polished 3D educational cinematic.",
      );
    const stage =
      text(
        form.get("stage"),
        "V1",
      );
    const durationSRaw =
      Number(
        form.get(
          "duration_s",
        ),
      );
    const durationS =
      Number.isFinite(
        durationSRaw,
      )
        ? clamp(
            durationSRaw,
            1,
            60,
          )
        : 24;

    if (
      !(video instanceof File)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing generated MP4 video.",
        },
        { status: 400 },
      );
    }

    if (
      video.size <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Generated video is empty.",
        },
        { status: 400 },
      );
    }
    if (
      video.size >
      MAX_VIDEO_BYTES
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Generated video is ${(video.size / 1024 / 1024).toFixed(1)} MB; the freeform Omni test limit is ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 },
      );
    }

    const bytes =
      Buffer.from(
        await video.arrayBuffer(),
      );
    const mime =
      video.type ||
      "video/mp4";
    const videoDataUrl =
      `data:${mime};base64,${bytes.toString("base64")}`;

    const endpoint = (
      process.env
        .MYWAY_CINEMATIC_OMNI_BASE_URL ??
      process.env
        .NVIDIA_BASE_URL ??
      "https://integrate.api.nvidia.com/v1"
    ).replace(/\/$/, "");
    const model =
      process.env
        .MYWAY_CINEMATIC_OMNI_MODEL
        ?.trim() ||
      DEFAULT_OMNI_MODEL;

    const result =
      await postOmni({
        endpoint,
        apiKey,
        model,
        videoDataUrl,
        prompt:
          critiquePrompt(
            instruction,
            durationS,
            stage,
          ),
      });

    const parsed =
      JSON.parse(
        extractBalancedJson(
          result.raw,
        ),
      ) as unknown;
    const critique =
      normalizeCritique(
        parsed,
      );

    return NextResponse.json({
      ok: true,
      provider: "nvidia",
      model,
      critique,
      raw_content:
        result.raw,
      timing: {
        omni_ms:
          result.elapsed_ms,
        total_ms:
          Date.now() -
          totalStarted,
      },
      video_diagnostics: {
        bytes: video.size,
        duration_s:
          durationS,
        stage,
      },
    });
  } catch (caught) {
    const aborted =
      caught instanceof Error &&
      caught.name ===
        "AbortError";
    return NextResponse.json(
      {
        ok: false,
        error: aborted
          ? "Omni freeform critique timed out after 300 seconds."
          : caught instanceof Error
            ? caught.message
            : String(caught),
        timing: {
          total_ms:
            Date.now() -
            totalStarted,
        },
      },
      {
        status: aborted
          ? 504
          : 500,
      },
    );
  }
}
