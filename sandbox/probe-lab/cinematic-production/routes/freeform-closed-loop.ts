import { NextResponse } from "next/server";

import {
  CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
  LUNCH_RUNTIME_ROLES,
  parseFreeformCinematicReproductionJson,
  type CinematicReproductionPlanV1,
  type CinematicReproductionValidation,
} from "../cinematic-reproduction-plan";

type ReproductionAssetSummary = {
  role?: string;
  asset_id?: string | null;
  label?: string | null;
  dimensions_m?: [number, number, number] | null;
  geometry_size_m?: [number, number, number] | null;
  attachment_region_count?: number;
  support_surface_count?: number;
  collision_box_count?: number;
};

type GenerateRequest = {
  action?: "generate" | "repair";
  instruction?: string;
  assets?: ReproductionAssetSummary[];
  current_plan?: CinematicReproductionPlanV1 | null;
  critique?: unknown;
};

const DEFAULT_FREEFORM_REQUEST = `Create a polished 20–30 second 3D cinematic using the supplied burger, apple, salmon nigiri, cow, rooster, goldfish, hand and tray.

Show meaningful visual relationships between the foods and animals without text or narration. Use purposeful camera movement, physical depth, clear staging and visual emphasis. Make it feel like a directed film rather than objects appearing one after another.

End with the burger as the main visual focus.`;

function extractJsonText(content: string) {
  const fenced =
    content.match(
      /```(?:json)?\s*([\s\S]*?)```/i,
    )?.[1];
  const candidate =
    (fenced ?? content).trim();
  const start =
    candidate.indexOf("{");
  const end =
    candidate.lastIndexOf("}");
  if (
    start < 0 ||
    end <= start
  ) {
    throw new Error(
      "GLM response did not contain a JSON object.",
    );
  }
  return candidate.slice(
    start,
    end + 1,
  );
}

function compactAssetList(
  assets: ReproductionAssetSummary[],
) {
  const byRole = new Map(
    assets.map((item) => [
      item.role,
      item,
    ]),
  );
  return LUNCH_RUNTIME_ROLES.map(
    (role) =>
      `${role}: ${
        byRole.get(role)?.label?.trim() ||
        role
      }`,
  ).join("\n");
}

function buildSystemPrompt() {
  return `You are the 3D cinematic director for MyWay.

Create a clear, polished short film from the user's request.

You control camera movement/focus, actor staging/motion/visibility/emphasis, timing, and physical interaction intent. MyWay handles asset geometry, grounding, collision-safe motion, contact, clearance, interpolation, and camera safety. Do not calculate mesh-level geometry.

Use these roles exactly: ${LUNCH_RUNTIME_ROLES.join(", ")}. The "chicken" role may contain a rooster asset.

Return one valid JSON object and no prose.

Keep the plan sparse:
- target 20–30 seconds;
- use 6–8 purposeful camera keys spanning 0..duration; the first camera key should define position, target and fov, while later keys may omit unchanged camera fields;
- every actor role needs at least one key; later actor keys may omit unchanged fields because MyWay carries them forward;
- actor position is [x,support_lift_y,z]; support_lift_y=0 means rest on MyWay's measured support; use rotation_deg and scale_multiplier;
- use interactions only for literal touch/nudge/push contact;
- use directional_clearance only when a physical surface gap matters;
- use physical 3D depth when depth matters; no text or narration;
- do not repeat unchanged states.

Output shape:
{"schema_version":"${CINEMATIC_REPRODUCTION_SCHEMA_VERSION}","title":"...","duration_s":24,"aspect_ratio":"9:16","intent_summary":"...","camera":{"interpolation":"c2","keys":[{"t":0,"position":[0,3,6],"target":[0,0.3,0],"fov":36},{"t":4,"position":[1,2.8,5]}]},"actors":{"<role>":{"interpolation":"c2","keys":[{"t":0,"visible":true,"position":[0,0,0],"rotation_deg":[0,0,0],"scale_multiplier":1,"opacity":1,"emphasis":0},{"t":4,"position":[1,0,0]}]}},"interactions":[],"directional_clearance":[],"notes":[]}

Actors must contain one track for each supplied role. Interaction fields when used: id, kind, source_role, target_role, approach_start_s, contact_start_s, contact_end_s, retreat_end_s, approach_direction, preferred_target_side, contact_clearance_m, obstacle_clearance_m, obstacle_roles, maintain_contact. Directional-clearance fields when used: id, moving_role, anchor_role, start_s, end_s, direction, minimum_surface_gap_m.

Invent the film. There is no reference video or predefined choreography.`;
}

function buildGeneratePrompt(
  input: GenerateRequest,
) {
  const instruction =
    input.instruction?.trim() ||
    DEFAULT_FREEFORM_REQUEST;

  return `REQUEST:
${instruction}

AVAILABLE ASSETS:
${compactAssetList(
  input.assets ?? [],
)}

Direct the film from scratch and return the complete ${CINEMATIC_REPRODUCTION_SCHEMA_VERSION} plan.`;
}

function buildRepairPrompt(
  input: GenerateRequest,
) {
  const instruction =
    input.instruction?.trim() ||
    DEFAULT_FREEFORM_REQUEST;
  if (!input.current_plan) {
    throw new Error(
      "Repair requires current_plan.",
    );
  }
  if (!input.critique) {
    throw new Error(
      "Repair requires an Omni critique.",
    );
  }

  const deterministicValidation =
    parseFreeformCinematicReproductionJson(
      JSON.stringify(
        input.current_plan,
      ),
    ).validation;

  return `ORIGINAL REQUEST:
${instruction}

AVAILABLE ASSETS:
${compactAssetList(
  input.assets ?? [],
)}

V1 PLAN:
${JSON.stringify(
  input.current_plan,
)}

MYWAY VALIDATION:
${JSON.stringify({
  errors:
    deterministicValidation.errors,
  warnings:
    deterministicValidation.warnings.slice(
      0,
      6,
    ),
})}

OMNI NOTES:
${JSON.stringify(
  input.critique,
)}

Patch V1 instead of redesigning it. Preserve what works, fix the highest-impact visible problems, and change only the needed camera/actor/timing/emphasis/interaction fields. MyWay still owns geometry/contact/collision/clearance/camera-safety math.

Return one complete replacement ${CINEMATIC_REPRODUCTION_SCHEMA_VERSION} JSON object and no prose.`;
}

async function requestGlmContent(
  input: {
    endpoint: string;
    apiKey: string;
    model: string;
    messages: Array<{
      role:
        | "system"
        | "user"
        | "assistant";
      content: string;
    }>;
  },
) {
  const controller =
    new AbortController();
  const timeout =
    setTimeout(
      () => controller.abort(),
      300_000,
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
          messages:
            input.messages,
          temperature: 0.4,
          top_p: 0.9,
          max_tokens: 6_000,
          stream: true,
        }),
        signal:
          controller.signal,
      },
    );

    if (!response.ok) {
      const raw =
        await response.text();
      let message =
        raw.slice(0, 1_200);
      try {
        const parsed =
          JSON.parse(raw) as any;
        message =
          parsed?.error?.message ??
          message;
      } catch {
        // Keep the provider response preview.
      }
      throw new Error(
        message ||
          `GLM request failed with HTTP ${response.status}.`,
      );
    }

    if (!response.body) {
      throw new Error(
        "GLM returned no readable stream.",
      );
    }

    const reader =
      response.body.getReader();
    const decoder =
      new TextDecoder();
    let buffer = "";
    let content = "";
    let providerError = "";
    let firstEventMs:
      | number
      | null = null;
    let firstTokenMs:
      | number
      | null = null;

    const processEventBlock = (
      block: string,
    ) => {
      const normalized =
        block
          .replace(/\r\n/g, "\n")
          .trim();
      if (!normalized) {
        return;
      }
      const data =
        normalized
          .split("\n")
          .filter((line) =>
            line.startsWith(
              "data:",
            ),
          )
          .map((line) =>
            line
              .slice(5)
              .trimStart(),
          )
          .join("\n")
          .trim();
      if (
        !data ||
        data === "[DONE]"
      ) {
        return;
      }

      let payload: any;
      try {
        payload =
          JSON.parse(data);
      } catch {
        return;
      }

      if (firstEventMs == null) {
        firstEventMs =
          Date.now() - started;
      }
      if (
        payload?.error?.message
          ?.trim()
      ) {
        providerError =
          payload.error.message.trim();
      }

      const chunk =
        payload?.choices?.[0]
          ?.delta?.content ??
        payload?.choices?.[0]
          ?.message?.content;
      if (
        typeof chunk ===
          "string" &&
        chunk
      ) {
        if (
          firstTokenMs == null
        ) {
          firstTokenMs =
            Date.now() - started;
        }
        content += chunk;
      }
    };

    while (true) {
      const {
        value,
        done,
      } = await reader.read();
      buffer += decoder.decode(
        value ??
          new Uint8Array(),
        { stream: !done },
      );
      buffer =
        buffer.replace(
          /\r\n/g,
          "\n",
        );

      let boundary =
        buffer.indexOf(
          "\n\n",
        );
      while (
        boundary >= 0
      ) {
        processEventBlock(
          buffer.slice(
            0,
            boundary,
          ),
        );
        buffer =
          buffer.slice(
            boundary + 2,
          );
        boundary =
          buffer.indexOf(
            "\n\n",
          );
      }

      if (done) {
        break;
      }
    }

    if (buffer.trim()) {
      processEventBlock(
        buffer,
      );
    }
    if (providerError) {
      throw new Error(
        providerError,
      );
    }
    if (!content.trim()) {
      throw new Error(
        "GLM returned no streamed message content.",
      );
    }

    return {
      content,
      elapsed_ms:
        Date.now() - started,
      first_event_ms:
        firstEventMs,
      first_token_ms:
        firstTokenMs,
      response_chars:
        content.length,
      transport:
        "streaming" as const,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseResult(
  content: string,
) {
  const jsonText =
    extractJsonText(content);
  const parsed =
    JSON.parse(
      jsonText,
    ) as unknown;
  const normalized =
    parseFreeformCinematicReproductionJson(
      JSON.stringify(parsed),
    );
  return {
    jsonText,
    parsed,
    normalized,
  };
}

function compactValidationIssues(
  validation:
    CinematicReproductionValidation,
) {
  return [
    ...validation.errors.map(
      (item) =>
        `ERROR: ${item}`,
    ),
    ...validation.warnings
      .slice(0, 8)
      .map(
        (item) =>
          `WARNING: ${item}`,
      ),
  ].join("\n");
}

export async function GET() {
  const model =
    process.env
      .MYWAY_CINEMATIC_GLM_MODEL
      ?.trim() ||
    process.env
      .MYWAY_GLM_MODEL
      ?.trim() ||
    "z-ai/glm-5.2";

  return NextResponse.json({
    ok: true,
    configured: Boolean(
      process.env.NVIDIA_API_KEY
        ?.trim(),
    ),
    provider: "nvidia",
    model,
    schema_version:
      CINEMATIC_REPRODUCTION_SCHEMA_VERSION,
    contract_revision:
      "cp2b1_sparse_prompt_latency_v1",
    creative_template:
      "none",
    deterministic_runtime:
      "shared_asset_aware_geometry_contact_clearance_camera_safety",
  });
}

export async function POST(
  request: Request,
) {
  const totalStarted =
    Date.now();

  try {
    const input =
      (await request
        .json()
        .catch(
          () => ({}),
        )) as GenerateRequest;
    const action =
      input.action === "repair"
        ? "repair"
        : "generate";

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

    const endpoint = (
      process.env
        .NVIDIA_BASE_URL ??
      "https://integrate.api.nvidia.com/v1"
    ).replace(/\/$/, "");
    const model =
      process.env
        .MYWAY_CINEMATIC_GLM_MODEL
        ?.trim() ||
      process.env
        .MYWAY_GLM_MODEL
        ?.trim() ||
      "z-ai/glm-5.2";

    const systemPrompt =
      buildSystemPrompt();
    const userPrompt =
      action === "repair"
        ? buildRepairPrompt(input)
        : buildGeneratePrompt(input);

    const initial =
      await requestGlmContent({
        endpoint,
        apiKey,
        model,
        messages: [
          {
            role: "system",
            content:
              systemPrompt,
          },
          {
            role: "user",
            content:
              userPrompt,
          },
        ],
      });

    let finalContent =
      initial.content;
    let result:
      | ReturnType<
          typeof parseResult
        >
      | null = null;
    let initialError:
      string | null = null;
    let contractRepair:
      | Awaited<
          ReturnType<
            typeof requestGlmContent
          >
        >
      | null = null;

    try {
      result =
        parseResult(
          initial.content,
        );
      if (
        !result.normalized
          .validation.ok
      ) {
        initialError =
          compactValidationIssues(
            result.normalized
              .validation,
          );
      }
    } catch (caught) {
      initialError =
        caught instanceof Error
          ? caught.message
          : String(caught);
    }

    // A second model call is reserved only for an executable-contract failure.
    // Warnings alone do not trigger another creative pass; the whole purpose of
    // CP.2B is to measure a realistic first-video latency.
    if (
      !result ||
      !result.normalized
        .validation.ok
    ) {
      contractRepair =
        await requestGlmContent({
          endpoint,
          apiKey,
          model,
          messages: [
            {
              role: "system",
              content:
                systemPrompt,
            },
            {
              role: "user",
              content:
                userPrompt,
            },
            {
              role: "assistant",
              content:
                initial.content,
            },
            {
              role: "user",
              content: `EXECUTABLE CONTRACT REPAIR ONLY.

MyWay could not safely execute the previous response:
${initialError ?? "Unknown validation failure."}

Return the same creative film as one COMPLETE replacement JSON object. Correct only schema/field/timing/unit/executability problems. Do not redesign the movie and do not introduce any benchmark choreography.`,
            },
          ],
        });
      finalContent =
        contractRepair.content;
      result =
        parseResult(
          finalContent,
        );
    }

    if (!result) {
      throw new Error(
        "GLM freeform plan could not be parsed.",
      );
    }

    if (
      !result.normalized
        .validation.ok
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "GLM freeform plan remained non-executable after the contract repair.",
          provider: "nvidia",
          model,
          raw_content:
            initial.content,
          repair_content:
            contractRepair?.content ??
            null,
          validation:
            result.normalized
              .validation,
          timing: {
            glm_initial_ms:
              initial.elapsed_ms,
            glm_initial_first_event_ms:
              initial.first_event_ms,
            glm_initial_first_token_ms:
              initial.first_token_ms,
            glm_initial_response_chars:
              initial.response_chars,
            contract_repair_ms:
              contractRepair
                ?.elapsed_ms ??
              0,
            contract_repair_first_token_ms:
              contractRepair
                ?.first_token_ms ??
              null,
            total_ms:
              Date.now() -
              totalStarted,
          },
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      action,
      provider: "nvidia",
      model,
      raw_content:
        initial.content,
      repair_content:
        contractRepair?.content ??
        null,
      json_text:
        JSON.stringify(
          result.parsed,
          null,
          2,
        ),
      normalized_plan:
        result.normalized.plan,
      validation:
        result.normalized
          .validation,
      contract_repair_attempted:
        Boolean(
          contractRepair,
        ),
      timing: {
        glm_initial_ms:
          initial.elapsed_ms,
        glm_initial_first_event_ms:
          initial.first_event_ms,
        glm_initial_first_token_ms:
          initial.first_token_ms,
        glm_initial_response_chars:
          initial.response_chars,
        contract_repair_ms:
          contractRepair
            ?.elapsed_ms ??
          0,
        contract_repair_first_token_ms:
          contractRepair
            ?.first_token_ms ??
          null,
        total_ms:
          Date.now() -
          totalStarted,
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
          ? "GLM freeform cinematic request timed out after 300 seconds."
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
