import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { createNormalizeJob } from "./blender/blender-job-store.server";
import { runBlenderJob } from "./blender/blender-bridge.server";
import { createAssetTempWorkspace } from "./storage/asset-temp-workspace.server";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const ENCRYPTED_FLAG = 0x0001;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES = 400 * 1024 * 1024;

type ZipEntry = {
  path: string;
  method: number;
  compressed_size: number;
  uncompressed_size: number;
  local_header_offset: number;
};

function normalizedPath(value: string) {
  return value.replace(/\\/g, "/");
}
function assertSafeRelative(value: string) {
  const normalized = normalizedPath(value);
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized) ||
      normalized.split("/").some((part) => part === "..")) {
    throw new Error(`Unsafe archive path was rejected: ${value}`);
  }
  return normalized;
}
function findEocd(buffer: Buffer) {
  const minimum = 22;
  const start = Math.max(0, buffer.length - (0xffff + minimum));
  for (let offset = buffer.length - minimum; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("ZIP end-of-central-directory record was not found.");
}
function inspectZip(buffer: Buffer) {
  if (buffer.length > MAX_ARCHIVE_BYTES) {
    throw new Error(`ZIP exceeds the ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)} MB compressed limit.`);
  }
  const eocd = findEocd(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const cdDisk = buffer.readUInt16LE(eocd + 6);
  const onDisk = buffer.readUInt16LE(eocd + 8);
  const total = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (disk !== 0 || cdDisk !== 0 || onDisk !== total) throw new Error("Multi-disk ZIP archives are not supported.");
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error("ZIP64 archives are not supported.");
  if (cdOffset + cdSize > buffer.length) throw new Error("ZIP central directory points outside the archive.");
  const entries: ZipEntry[] = [];
  let cursor = cdOffset;
  let expanded = 0;
  for (let i = 0; i < total; i += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("ZIP central directory is invalid.");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20);
    const uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) throw new Error("ZIP entry filename is truncated.");
    const name = assertSafeRelative(buffer.toString((flags & 0x0800) ? "utf8" : "latin1", nameStart, nameEnd));
    cursor = nameEnd + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (flags & ENCRYPTED_FLAG) throw new Error(`Encrypted ZIP entry is not supported: ${name}`);
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    if (uncompressed > MAX_ENTRY_BYTES) throw new Error(`${name} exceeds the per-file safety limit.`);
    expanded += uncompressed;
    if (expanded > MAX_EXPANDED_BYTES) throw new Error("ZIP expands beyond the 1 GB safety limit.");
    entries.push({ path: name, method, compressed_size: compressed, uncompressed_size: uncompressed, local_header_offset: localOffset });
  }
  return entries;
}

function entryBytes(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.local_header_offset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Local ZIP header is invalid for ${entry.path}.`);
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressed_size;
  if (end > buffer.length) throw new Error(`Compressed ZIP data is truncated for ${entry.path}.`);
  const source = buffer.subarray(start, end);
  const bytes = entry.method === METHOD_STORED ? Buffer.from(source) : inflateRawSync(source);
  if (bytes.length !== entry.uncompressed_size) {
    throw new Error(`${entry.path} expanded to ${bytes.length} bytes; expected ${entry.uncompressed_size}.`);
  }
  return bytes;
}

export async function materializeArchiveModel(input: {
  archive: File;
  entryPath: string;
}) {
  const workspace = await createAssetTempWorkspace("smart-archive");
  try {
    const buffer = Buffer.from(await input.archive.arrayBuffer());
    const entries = inspectZip(buffer);
    const wanted = assertSafeRelative(input.entryPath);
    if (!entries.some((entry) => entry.path === wanted)) {
      throw new Error(`The selected archive model was not found: ${wanted}`);
    }
    for (const entry of entries) {
      const target = path.join(workspace.path, ...entry.path.split("/"));
      const relative = path.relative(workspace.path, target);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Unsafe extracted path: ${entry.path}`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, entryBytes(buffer, entry));
    }
    return {
      inputPath: path.join(workspace.path, ...wanted.split("/")),
      originalName: path.basename(wanted),
      cleanup: workspace.cleanup,
    };
  } catch (caught) {
    await workspace.cleanup().catch(() => undefined);
    throw caught;
  }
}

export async function convertSourceModelToGlb(input: {
  inputPath: string;
  sourceTypeLabel: string;
  targetExtentM: number;
}) {
  const workspace = await createAssetTempWorkspace("smart-convert");
  const outputPath = path.join(workspace.path, "normalized.glb");
  const thumbnailPath = path.join(workspace.path, "normalized.png");
  try {
    const { jobPath } = await createNormalizeJob({
      kind: "normalize_asset",
      input_path: input.inputPath,
      output_path: outputPath,
      thumbnail_path: thumbnailPath,
      target_extent_m: input.targetExtentM,
      source_type: "manual",
      result: null,
      error: null,
    });
    const completed = await runBlenderJob(jobPath);
    if (completed.kind !== "normalize_asset" || !completed.result) {
      throw new Error(`Blender could not normalize the ${input.sourceTypeLabel} source into GLB.`);
    }
    const bytes = await readFile(outputPath);
    return {
      file: {
        name: `${path.basename(input.inputPath, path.extname(input.inputPath))}.glb`,
        size: bytes.length,
        type: "model/gltf-binary",
        async arrayBuffer() {
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        },
      },
      cleanup: workspace.cleanup,
    };
  } catch (caught) {
    await workspace.cleanup().catch(() => undefined);
    throw caught;
  }
}
