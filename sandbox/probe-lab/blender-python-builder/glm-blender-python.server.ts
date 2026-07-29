const REQUEST_TIMEOUT_MS = 300_000;
const MAX_RESPONSE_TOKENS = 12_000;
const STREAM_CHAT_COMPLETIONS = true;

type GlmContentPart = {
  type?: string;
  text?: string;
};

type GlmResponsePayload = {
  choices?: Array<{
    message?: {
      content?: string | GlmContentPart[];
    };
    delta?: {
      content?: string | GlmContentPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

function extractPython(content: string) {
  const fenced =
    content.match(/```python\s*([\s\S]*?)```/i)?.[1] ??
    content.match(/```\s*([\s\S]*?)```/i)?.[1];

  const code = (fenced ?? content).trim();
  if (!code.includes("import bpy")) {
    throw new Error("GLM response did not contain a Blender Python script.");
  }
  return code;
}

function extractContentText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        return "";
      }
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

function resolveGlmConfig() {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "NVIDIA_API_KEY is required for GLM Blender Python generation.",
    );
  }

  return {
    apiKey,
    endpoint: (
      process.env.NVIDIA_BASE_URL ??
      "https://integrate.api.nvidia.com/v1"
    ).replace(/\/$/, ""),
    model:
      process.env.MYWAY_GLM_BLENDER_PYTHON_MODEL ??
      process.env.MYWAY_GLM_ASSET_MODEL ??
      process.env.MYWAY_GLM_MODEL ??
      "z-ai/glm-5.2",
  };
}

function isAbortError(caught: unknown) {
  return (
    caught instanceof Error &&
    (caught.name === "AbortError" ||
      caught.message.toLowerCase().includes("aborted"))
  );
}

async function readJsonChatCompletion(response: Response) {
  const raw = await response.text();
  const payload = raw.trim()
    ? ((JSON.parse(raw) as GlmResponsePayload | null) ?? null)
    : null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        raw.slice(0, 1200) ??
        `GLM request failed with HTTP ${response.status}.`,
    );
  }

  const content = extractContentText(payload?.choices?.[0]?.message?.content);
  if (!content.trim()) {
    throw new Error("GLM returned no message content.");
  }

  return content;
}

async function readStreamingChatCompletion(response: Response) {
  if (!response.body) {
    throw new Error("GLM returned no readable stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let providerError = "";

  const processEventBlock = (block: string) => {
    const normalized = block.replace(/\r\n/g, "\n").trim();
    if (!normalized) {
      return;
    }

    const data = normalized
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();

    if (!data || data === "[DONE]") {
      return;
    }

    let payload: GlmResponsePayload | null = null;
    try {
      payload = JSON.parse(data) as GlmResponsePayload;
    } catch {
      return;
    }

    if (payload?.error?.message?.trim()) {
      providerError = payload.error.message.trim();
    }

    const choice = payload?.choices?.[0];
    if (!choice) {
      return;
    }

    const chunk =
      extractContentText(choice.delta?.content) ||
      extractContentText(choice.message?.content);
    if (chunk) {
      content += chunk;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      processEventBlock(block);
      boundary = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    processEventBlock(buffer);
  }

  if (providerError) {
    throw new Error(providerError);
  }

  if (!response.ok) {
    throw new Error(`GLM request failed with HTTP ${response.status}.`);
  }

  if (!content.trim()) {
    throw new Error("GLM returned no streamed message content.");
  }

  return content;
}

async function requestBlenderPython(messages: Array<{ role: string; content: string }>) {
  const { apiKey, endpoint, model } = resolveGlmConfig();
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: MAX_RESPONSE_TOKENS,
        stream: STREAM_CHAT_COMPLETIONS,
      }),
      signal: controller.signal,
    });

    const content = STREAM_CHAT_COMPLETIONS
      ? await readStreamingChatCompletion(response)
      : await readJsonChatCompletion(response);

    return {
      code: extractPython(content),
      model,
      elapsed_ms: Date.now() - startedAt,
      transport: STREAM_CHAT_COMPLETIONS ? "streaming" : "json",
    };
  } catch (caught) {
    if (isAbortError(caught)) {
      throw new Error(
        `GLM generation exceeded ${Math.round(
          REQUEST_TIMEOUT_MS / 1000,
        )} seconds before returning a complete Blender Python script.`,
      );
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

const BLENDER_STATE_RULES = `Blender operator-state rules (mandatory):
- Treat bpy.ops as context-sensitive. Before every bpy.ops.object.modifier_apply call, explicitly switch to OBJECT mode, deselect all objects, select the intended object, and set it as bpy.context.view_layer.objects.active.
- Never create or apply an object modifier while the active object is in EDIT mode.
- After a bmesh or mesh operator changes topology, reacquire the editable BMesh and refresh lookup tables before reusing it.
- Before object transforms, origin changes, parenting operations, joins, conversions, or modifier application, explicitly establish the correct mode, active object, and selection.
- Use modifier.name rather than a guessed string when applying a modifier.
- Avoid operators that depend on an interactive UI area. Prefer direct data API operations when practical.
- Use version-tolerant APIs for Blender 5.1+. Do not assume BLENDER_EEVEE_NEXT exists.
- The final script must be executable from a clean --background --factory-startup session without manual interaction.`;

export async function generateBlenderPython(input: {
  request: string;
  style: string;
  animationReady: boolean;
  targetExtentM: number;
  maxTriangles: number;
}) {
  const system = `You are a senior Blender procedural modeller writing one self-contained Python script for Blender 5.1+.

Return ONLY Python code inside one python markdown fence.

Execution contract:
- The script runs with Blender --background --factory-startup --python.
- Import bpy and only safe standard-library modules such as math and os.
- Do not use subprocess, socket, requests, urllib, pathlib file scanning, shutil, or external commands.
- Do not read files, access the network, install packages, or require add-ons.
- Use Blender's Z axis as vertical.
- Clear the default scene.
- Build a visually coherent, recognizable, clean stylized asset rather than a loose pile of primitives.
- Prefer reusable helper functions, bevels, smooth shading, sensible materials, symmetry, and joined forms where useful.
- Give every meaningful movable or semantic part a deterministic descriptive name.
- Apply transforms where appropriate and place the asset near the origin with its lowest point near Z=0.
- Keep materials compatible with glTF/GLB.
- Do not export or render. MyWay appends a trusted export-and-preview footer.
- Print concise progress messages beginning with MYWAY_PROGRESS:.
- If the asset needs repeated small parts such as coins, bolts, teeth, scales, or planks, create them with helper functions and loops rather than manually duplicating long code blocks.

${BLENDER_STATE_RULES}

Design priorities:
1. recognizable silhouette and proportions;
2. coherent connections between parts;
3. attractive stylized finish;
4. useful object names and pivots for later Three.js animation;
5. efficient geometry.

Before returning the script, mentally trace every mode transition and every bpy.ops call from start to finish. Correct any operation that could run in the wrong mode or with the wrong active object.

When an organic subject is requested, use overlapping sculptural forms, metaball-to-mesh workflows, curves, or carefully blended primitives where appropriate. Do not merely create an anatomical diagram made of disconnected spheres.`;

  const user = `Build request: ${input.request}
Style: ${input.style}
Animation-ready parts: ${input.animationReady ? "yes" : "no"}
Target overall extent: approximately ${input.targetExtentM} metres
Maximum desired triangle count: ${input.maxTriangles}

Create the complete Blender Python build script now.`;

  return requestBlenderPython([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
}

export async function repairBlenderPython(input: {
  code: string;
  blenderError: string;
  request?: string;
}) {
  if (!input.code.includes("import bpy")) {
    throw new Error("The repair request must include a Blender Python script.");
  }
  if (!input.blenderError.trim()) {
    throw new Error("A Blender error or traceback is required for repair.");
  }

  const system = `You are repairing a Blender 5.1+ Python script after a real headless Blender execution failure.

Return ONLY the complete corrected Python script inside one python markdown fence. Do not return a diff, explanation, or partial replacement.

Preserve the requested asset, intended appearance, object names, materials, hierarchy, pivots, animation-ready parts, and successful portions of the script. Make the smallest reliable correction needed, but also repair directly related state/context hazards that would predictably fail next.

${BLENDER_STATE_RULES}

Do not add export or rendering code. MyWay appends a trusted footer. Do not use unsafe imports, network access, external commands, package installation, or file-system scanning.`;

  const user = `Original build request:
${input.request?.trim() || "Not provided"}

Blender traceback / execution error:
${input.blenderError.slice(0, 30_000)}

Current full Blender Python script:
\n\`\`\`python
${input.code.slice(0, 500_000)}
\`\`\`

Return the complete repaired script.`;

  return requestBlenderPython([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
}