import { randomUUID } from "node:crypto";
import {
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";

const writeQueues = new Map<string, Promise<void>>();

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

function isRetryableAtomicReplaceError(caught: unknown) {
  const code = (caught as NodeJS.ErrnoException)?.code;
  return (
    code === "EPERM" ||
    code === "EBUSY" ||
    code === "EACCES" ||
    code === "ENOTEMPTY"
  );
}

async function renameWithWindowsRetry(
  temporaryPath: string,
  filePath: string,
) {
  const delays = [50, 100, 200, 400, 800, 1_200];
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await rename(temporaryPath, filePath);
      return;
    } catch (caught) {
      lastError = caught;

      if (
        !isRetryableAtomicReplaceError(caught) ||
        attempt >= delays.length
      ) {
        throw caught;
      }

      await pause(delays[attempt]);
    }
  }

  throw lastError;
}

async function writeJsonFileAtomicUnlocked(
  filePath: string,
  value: unknown,
) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  try {
    const handle = await open(temporaryPath, "w");

    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    await renameWithWindowsRetry(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
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
  const previous = writeQueues.get(filePath) ?? Promise.resolve();

  const current = previous
    .catch(() => undefined)
    .then(() => writeJsonFileAtomicUnlocked(filePath, value));

  writeQueues.set(filePath, current);

  try {
    await current;
  } finally {
    if (writeQueues.get(filePath) === current) {
      writeQueues.delete(filePath);
    }
  }
}
