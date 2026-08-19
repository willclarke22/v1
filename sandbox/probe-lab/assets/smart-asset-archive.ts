export const MAX_SMART_ASSET_BATCH_FILES = 200;
export const MAX_SMART_ARCHIVE_BYTES = 500 * 1024 * 1024;
export const MAX_SMART_ARCHIVE_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
export const MAX_SMART_ARCHIVE_ENTRY_BYTES = 400 * 1024 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export const SMART_MODEL_EXTENSIONS = [".glb", ".gltf", ".fbx", ".obj", ".blend"] as const;
export type SmartModelExtension = typeof SMART_MODEL_EXTENSIONS[number];

export type SmartArchiveEntry = {
  path: string;
  file_name: string;
  extension: string;
  is_model: boolean;
  compression_method: 0 | 8;
  compressed_size: number;
  uncompressed_size: number;
  crc32: number;
  local_header_offset: number;
};

export type SmartArchiveInspection = {
  entries: SmartArchiveEntry[];
  model_entries: SmartArchiveEntry[];
  ignored_entry_count: number;
  total_uncompressed_bytes: number;
};

function normalizePath(value: string) {
  return value.replace(/\\/g, "/");
}
function basename(value: string) {
  return normalizePath(value).split("/").filter(Boolean).pop() ?? "asset";
}
function extension(value: string) {
  const name = basename(value).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}
function unsafePath(value: string) {
  const normalized = normalizePath(value);
  return !normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split("/").some((part) => part === "..");
}
function decodeName(bytes: Uint8Array, utf8: boolean) {
  if (utf8) return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  try { return new TextDecoder("windows-1252", { fatal: false }).decode(bytes); }
  catch { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
}
function findEocd(view: DataView) {
  if (view.byteLength < 22) throw new Error("The selected ZIP is too small.");
  const start = Math.max(0, view.byteLength - (0xffff + 22));
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("ZIP end-of-central-directory record was not found.");
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function smartModelExtension(fileName: string): SmartModelExtension | null {
  const ext = extension(fileName);
  return (SMART_MODEL_EXTENSIONS as readonly string[]).includes(ext) ? ext as SmartModelExtension : null;
}

export function inspectSmartAssetArchiveBuffer(buffer: ArrayBuffer): SmartArchiveInspection {
  if (buffer.byteLength > MAX_SMART_ARCHIVE_BYTES) {
    throw new Error(`ZIP is too large. Maximum compressed size is ${Math.round(MAX_SMART_ARCHIVE_BYTES / 1024 / 1024)} MB.`);
  }
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocd = findEocd(view);
  const disk = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const onDisk = view.getUint16(eocd + 8, true);
  const total = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || cdDisk !== 0 || onDisk !== total) throw new Error("Multi-disk ZIP archives are not supported.");
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error("ZIP64 archives are not supported.");
  if (cdOffset + cdSize > buffer.byteLength) throw new Error("ZIP central directory points outside the archive.");

  const entries: SmartArchiveEntry[] = [];
  let cursor = cdOffset;
  let totalUncompressed = 0;
  let ignored = 0;
  for (let index = 0; index < total; index += 1) {
    if (cursor + 46 > buffer.byteLength || view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("ZIP central directory is truncated or invalid.");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.byteLength) throw new Error("ZIP entry filename is truncated.");
    const entryPath = normalizePath(decodeName(bytes.subarray(nameStart, nameEnd), Boolean(flags & UTF8_FLAG)));
    cursor = nameEnd + extraLength + commentLength;
    if (cursor > buffer.byteLength) throw new Error("ZIP central-directory metadata is truncated.");
    if (entryPath.endsWith("/")) { ignored += 1; continue; }
    if (unsafePath(entryPath)) throw new Error(`Unsafe ZIP entry path was rejected: ${entryPath}`);
    if (flags & ENCRYPTED_FLAG) throw new Error(`Encrypted ZIP entries are not supported: ${entryPath}`);
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new Error(`Unsupported ZIP compression method ${method} for ${entryPath}.`);
    }
    if (uncompressedSize > MAX_SMART_ARCHIVE_ENTRY_BYTES) {
      throw new Error(`${entryPath} exceeds the ${Math.round(MAX_SMART_ARCHIVE_ENTRY_BYTES / 1024 / 1024)} MB per-file limit.`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_SMART_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error(`ZIP expands beyond the ${Math.round(MAX_SMART_ARCHIVE_UNCOMPRESSED_BYTES / 1024 / 1024)} MB safety limit.`);
    }
    const ext = extension(entryPath);
    const isModel = Boolean(smartModelExtension(entryPath));
    if (!isModel) ignored += 1;
    entries.push({
      path: entryPath,
      file_name: basename(entryPath),
      extension: ext,
      is_model: isModel,
      compression_method: method as 0 | 8,
      compressed_size: compressedSize,
      uncompressed_size: uncompressedSize,
      crc32: crc,
      local_header_offset: localOffset,
    });
  }
  const modelEntries = entries.filter((entry) => entry.is_model);
  if (!modelEntries.length) {
    throw new Error("No supported 3D models were found. Supported model formats are GLB, GLTF, FBX, OBJ, and BLEND.");
  }
  if (modelEntries.length > MAX_SMART_ASSET_BATCH_FILES) {
    throw new Error(`This archive contains ${modelEntries.length} models. Import Asset accepts at most ${MAX_SMART_ASSET_BATCH_FILES} models per batch.`);
  }
  return { entries, model_entries: modelEntries, ignored_entry_count: ignored, total_uncompressed_bytes: totalUncompressed };
}

export async function browserInflateRawSmart(compressed: Uint8Array) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot unpack deflated ZIP files. Use current Edge/Chrome or unzip the files first.");
  }
  const copy = new ArrayBuffer(compressed.byteLength);
  new Uint8Array(copy).set(compressed);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function extractSmartArchiveEntry(
  buffer: ArrayBuffer,
  entry: SmartArchiveEntry,
) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const offset = entry.local_header_offset;
  if (offset + 30 > buffer.byteLength || view.getUint32(offset, true) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Local ZIP header is invalid for ${entry.path}.`);
  }
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressed_size;
  if (end > buffer.byteLength) throw new Error(`Compressed ZIP data is truncated for ${entry.path}.`);
  const compressed = bytes.subarray(start, end);
  const unpacked = entry.compression_method === METHOD_STORED
    ? new Uint8Array(compressed)
    : await browserInflateRawSmart(new Uint8Array(compressed));
  if (unpacked.byteLength !== entry.uncompressed_size) {
    throw new Error(`${entry.path} expanded to ${unpacked.byteLength} bytes; expected ${entry.uncompressed_size}.`);
  }
  if (crc32(unpacked) !== entry.crc32) throw new Error(`${entry.path} failed its ZIP CRC32 check.`);
  return unpacked;
}

export function conceptFromSourceName(value: string) {
  const base = basename(value).replace(/\.(glb|gltf|fbx|obj|blend)$/i, "");
  return base
    .replace(/-[A-Za-z0-9_-]{10,}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
