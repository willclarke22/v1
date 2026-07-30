import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function hashFile(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function stableTextHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(
        value as Record<string, unknown>,
      )
        .sort()
        .map((key) => [
          key,
          stableJsonValue(
            (value as Record<string, unknown>)[key],
          ),
        ]),
    );
  }

  return value;
}

export function stableJsonStringify(value: unknown) {
  return JSON.stringify(stableJsonValue(value));
}

export function stableJsonHash(value: unknown) {
  return stableTextHash(stableJsonStringify(value));
}
