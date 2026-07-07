export type JsonParseResult<T> =
  | {
      ok: true;
      value: T;
      json_text: string;
    }
  | {
      ok: false;
      error: string;
      json_text?: string;
    };

export function extractFirstJsonObject(rawText: string): string | null {
  const text = rawText.trim();
  if (!text) return null;

  const firstBrace = text.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = firstBrace; index < text.length; index += 1) {
    const char = text[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      return text.slice(firstBrace, index + 1);
    }
  }

  return null;
}

export function parseJsonObjectFromText<T = unknown>(rawText: string): JsonParseResult<T> {
  const jsonText = extractFirstJsonObject(rawText);

  if (!jsonText) {
    return {
      ok: false,
      error: "No JSON object was found in the model response.",
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(jsonText) as T,
      json_text: jsonText,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      json_text: jsonText,
    };
  }
}
