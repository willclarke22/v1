import { randomUUID } from "node:crypto";
import {
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isRetryableJsonReadError(caught: unknown) {
  return (
    caught instanceof SyntaxError ||
    (caught instanceof Error &&
      /unexpected end of json input|unterminated|end of json/i.test(
        caught.message,
      ))
  );
}

export async function readJsonFileWithRetry<T>(
  filePath: string,
  attempts = 5,
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const raw = await readFile(filePath, "utf8");
      if (!raw.trim()) {
        throw new SyntaxError("JSON file was temporarily empty.");
      }
      return JSON.parse(raw) as T;
    } catch (caught) {
      lastError = caught;
      const code = (caught as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || !isRetryableJsonReadError(caught)) {
        throw caught;
      }
      if (attempt < attempts - 1) {
        await pause(20 * (attempt + 1));
      }
    }
  }

  throw new Error(
    `Could not read a complete JSON document from ${filePath}: ${
      lastError instanceof Error
        ? lastError.message
        : String(lastError)
    }`,
  );
}

export async function writeJsonFileAtomic(
  filePath: string,
  value: unknown,
) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
