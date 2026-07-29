export const MAX_MANUAL_GLB_BYTES = 400 * 1024 * 1024;

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;

export type ManualGlbValidationResult = {
  version: 2;
  declared_length: number;
  json_chunk_length: number;
  generator: string | null;
};

export function validateManualGlbBuffer(
  buffer: Buffer,
): ManualGlbValidationResult {
  if (buffer.length < 20) {
    throw new Error("The selected file is too small to be a valid GLB.");
  }

  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(
      "The selected file is not a GLB. MyWay expected the binary glTF header 'glTF'.",
    );
  }

  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(
      `Unsupported GLB version ${version}. MyWay currently requires GLB 2.0.`,
    );
  }

  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    throw new Error(
      `The GLB header declares ${declaredLength} bytes, but the uploaded file contains ${buffer.length} bytes.`,
    );
  }

  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);
  if (jsonChunkType !== GLB_JSON_CHUNK) {
    throw new Error("The GLB does not begin with the required JSON chunk.");
  }

  const jsonChunkEnd = 20 + jsonChunkLength;
  if (jsonChunkLength <= 0 || jsonChunkEnd > buffer.length) {
    throw new Error("The GLB JSON chunk is missing or truncated.");
  }

  try {
    const jsonText = buffer
      .subarray(20, jsonChunkEnd)
      .toString("utf8")
      .replace(/[\u0000 ]+$/g, "")
      .trim();
    const json = JSON.parse(jsonText) as {
      asset?: { version?: unknown; generator?: unknown };
    };

    if (json.asset?.version !== "2.0") {
      throw new Error("The embedded glTF asset version is not 2.0.");
    }

    return {
      version: 2,
      declared_length: declaredLength,
      json_chunk_length: jsonChunkLength,
      generator:
        typeof json.asset.generator === "string"
          ? json.asset.generator
          : null,
    };
  } catch (caught) {
    throw new Error(
      `The GLB contains invalid glTF JSON: ${
        caught instanceof Error ? caught.message : String(caught)
      }`,
    );
  }
}
