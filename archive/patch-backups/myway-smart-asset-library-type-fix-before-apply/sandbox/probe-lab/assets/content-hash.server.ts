import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function hashFile(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function stableTextHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
