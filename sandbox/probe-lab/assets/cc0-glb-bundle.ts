import { MAX_MANUAL_GLB_BATCH_FILES } from "./manual-glb-batch-intake";

export const MAX_CC0_BUNDLE_ZIP_BYTES = 200 * 1024 * 1024;
export const MAX_CC0_BUNDLE_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
export const MAX_CC0_BUNDLE_ENTRY_BYTES = 400 * 1024 * 1024;
export const MAX_CC0_BUNDLE_FILES = MAX_MANUAL_GLB_BATCH_FILES;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export type Cc0GlbBundleEntry = {
  path: string;
  file_name: string;
  compression_method: 0 | 8;
  compressed_size: number;
  uncompressed_size: number;
  crc32: number;
  local_header_offset: number;
};

export type Cc0GlbBundleInspection = {
  entries: Cc0GlbBundleEntry[];
  ignored_entry_count: number;
  total_compressed_bytes: number;
  total_uncompressed_bytes: number;
};

export type ExtractedCc0GlbBundleEntry = Cc0GlbBundleEntry & {
  bytes: Uint8Array;
};

export type InflateRaw = (
  compressed: Uint8Array,
) => Promise<Uint8Array>;

function viewOf(buffer: ArrayBuffer) {
  return new DataView(buffer);
}

function normalizeEntryPath(value: string) {
  return value.replace(/\\/g, "/");
}

function isUnsafeEntryPath(value: string) {
  const normalized = normalizeEntryPath(value);
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    return true;
  }
  return normalized
    .split("/")
    .some((part) => part === "..");
}

function basename(value: string) {
  const normalized = normalizeEntryPath(value);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "asset.glb";
}

function decodeZipName(bytes: Uint8Array, utf8: boolean) {
  if (utf8) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  // Most current asset bundles use UTF-8-compatible ASCII names. Falling back to
  // windows-1252 preserves common legacy ZIP names without adding a dependency.
  try {
    return new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function findEndOfCentralDirectory(view: DataView) {
  const minimum = 22;
  if (view.byteLength < minimum) {
    throw new Error("The selected file is too small to be a ZIP archive.");
  }

  const searchStart = Math.max(0, view.byteLength - (0xffff + minimum));
  for (let offset = view.byteLength - minimum; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  throw new Error("ZIP end-of-central-directory record was not found.");
}

export function inspectCc0GlbBundleBuffer(
  buffer: ArrayBuffer,
): Cc0GlbBundleInspection {
  if (buffer.byteLength > MAX_CC0_BUNDLE_ZIP_BYTES) {
    throw new Error(
      `CC0 bundle ZIP is too large. Maximum compressed archive size is ${Math.round(MAX_CC0_BUNDLE_ZIP_BYTES / (1024 * 1024))} MB.`,
    );
  }

  const view = viewOf(buffer);
  const bytes = new Uint8Array(buffer);
  const eocd = findEndOfCentralDirectory(view);
  const diskNumber = view.getUint16(eocd + 4, true);
  const centralDirectoryDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const centralDirectorySize = view.getUint32(eocd + 12, true);
  const centralDirectoryOffset = view.getUint32(eocd + 16, true);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== totalEntries
  ) {
    throw new Error("Multi-disk ZIP archives are not supported.");
  }

  if (
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new Error("ZIP64 bundles are not supported by this browser intake.");
  }

  if (
    centralDirectoryOffset + centralDirectorySize > buffer.byteLength ||
    centralDirectoryOffset < 0
  ) {
    throw new Error("ZIP central directory points outside the archive.");
  }

  const entries: Cc0GlbBundleEntry[] = [];
  let ignoredEntryCount = 0;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > buffer.byteLength) {
      throw new Error("ZIP central directory is truncated.");
    }
    if (view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("ZIP central directory entry signature is invalid.");
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;

    if (nameEnd > buffer.byteLength) {
      throw new Error("ZIP entry filename is truncated.");
    }

    const rawName = decodeZipName(
      bytes.subarray(nameStart, nameEnd),
      Boolean(flags & UTF8_FLAG),
    );
    const entryPath = normalizeEntryPath(rawName);
    const nextCursor = nameEnd + extraLength + commentLength;

    if (nextCursor > buffer.byteLength) {
      throw new Error("ZIP central directory metadata is truncated.");
    }
    cursor = nextCursor;

    const isDirectory = entryPath.endsWith("/");
    const isGlb = entryPath.toLowerCase().endsWith(".glb");
    if (isDirectory || !isGlb) {
      ignoredEntryCount += 1;
      continue;
    }

    if (isUnsafeEntryPath(entryPath)) {
      throw new Error(`Unsafe ZIP entry path was rejected: ${entryPath}`);
    }
    if (flags & ENCRYPTED_FLAG) {
      throw new Error(`Encrypted ZIP entries are not supported: ${entryPath}`);
    }
    if (
      compressionMethod !== METHOD_STORED &&
      compressionMethod !== METHOD_DEFLATE
    ) {
      throw new Error(
        `Unsupported ZIP compression method ${compressionMethod} for ${entryPath}. Only stored and deflate entries are supported.`,
      );
    }
    if (uncompressedSize > MAX_CC0_BUNDLE_ENTRY_BYTES) {
      throw new Error(
        `${entryPath} exceeds the ${Math.round(MAX_CC0_BUNDLE_ENTRY_BYTES / (1024 * 1024))} MB per-model limit.`,
      );
    }

    totalCompressedBytes += compressedSize;
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_CC0_BUNDLE_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Bundle expands beyond the ${Math.round(MAX_CC0_BUNDLE_UNCOMPRESSED_BYTES / (1024 * 1024))} MB browser safety limit.`,
      );
    }

    entries.push({
      path: entryPath,
      file_name: basename(entryPath),
      compression_method: compressionMethod as 0 | 8,
      compressed_size: compressedSize,
      uncompressed_size: uncompressedSize,
      crc32: crc,
      local_header_offset: localHeaderOffset,
    });
  }

  if (!entries.length) {
    throw new Error("No standalone .glb files were found in this ZIP bundle.");
  }
  if (entries.length > MAX_CC0_BUNDLE_FILES) {
    throw new Error(
      `This bundle contains ${entries.length} GLBs. The CC0 intake accepts at most ${MAX_CC0_BUNDLE_FILES} models per batch.`,
    );
  }

  return {
    entries,
    ignored_entry_count: ignoredEntryCount,
    total_compressed_bytes: totalCompressedBytes,
    total_uncompressed_bytes: totalUncompressedBytes,
  };
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertGlb2(bytes: Uint8Array, fileName: string) {
  if (bytes.byteLength < 12) {
    throw new Error(`${fileName} is too small to be a GLB 2.0 file.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error(`${fileName} does not contain the GLB magic header.`);
  }
  if (view.getUint32(4, true) !== 2) {
    throw new Error(`${fileName} is not GLB version 2.`);
  }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error(`${fileName} has an invalid declared GLB length.`);
  }
}

export async function browserInflateRaw(
  compressed: Uint8Array,
): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This browser does not expose DecompressionStream, so deflated ZIP bundles cannot be unpacked here. Use a current Chromium/Edge browser or unzip the GLBs manually.",
    );
  }

  // BlobPart is intentionally backed by a concrete ArrayBuffer.
  // Modern TypeScript models Uint8Array as Uint8Array<ArrayBufferLike>,
  // which may include SharedArrayBuffer and is therefore not accepted
  // directly by the DOM Blob constructor. Copying into ArrayBuffer keeps
  // the browser boundary type-safe without changing the ZIP bytes.
  const compressedBuffer = new ArrayBuffer(compressed.byteLength);
  new Uint8Array(compressedBuffer).set(compressed);
  const stream = new Blob([compressedBuffer]).stream().pipeThrough(
    new DecompressionStream("deflate-raw" as CompressionFormat),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function extractCc0GlbBundleBuffer(
  buffer: ArrayBuffer,
  inflateRaw: InflateRaw = browserInflateRaw,
) {
  const inspection = inspectCc0GlbBundleBuffer(buffer);
  const view = viewOf(buffer);
  const bytes = new Uint8Array(buffer);
  const extracted: ExtractedCc0GlbBundleEntry[] = [];

  for (const entry of inspection.entries) {
    const offset = entry.local_header_offset;
    if (offset + 30 > buffer.byteLength) {
      throw new Error(`Local ZIP header is truncated for ${entry.path}.`);
    }
    if (view.getUint32(offset, true) !== LOCAL_FILE_SIGNATURE) {
      throw new Error(`Local ZIP header signature is invalid for ${entry.path}.`);
    }

    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + entry.compressed_size;
    if (dataEnd > buffer.byteLength) {
      throw new Error(`Compressed ZIP data is truncated for ${entry.path}.`);
    }

    const compressed = bytes.subarray(dataStart, dataEnd);
    const unpacked =
      entry.compression_method === METHOD_STORED
        ? new Uint8Array(compressed)
        : await inflateRaw(new Uint8Array(compressed));

    if (unpacked.byteLength !== entry.uncompressed_size) {
      throw new Error(
        `${entry.path} expanded to ${unpacked.byteLength} bytes; expected ${entry.uncompressed_size}.`,
      );
    }
    if (crc32(unpacked) !== entry.crc32) {
      throw new Error(`${entry.path} failed its ZIP CRC32 integrity check.`);
    }
    assertGlb2(unpacked, entry.file_name);

    extracted.push({
      ...entry,
      bytes: unpacked,
    });
  }

  return {
    ...inspection,
    entries: extracted,
  };
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/\.glb$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
}

export function cc0BundleTitleFromZipName(fileName: string) {
  return fileName
    .replace(/^.*[\\/]/, "")
    .replace(/\.zip$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+(glb|gltf|fbx)$/i, "")
    .trim();
}

export function cc0BundleSourceIdFromUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    if (url.hostname.toLowerCase() === "poly.pizza") {
      const polyPizzaId = last.match(/-([a-zA-Z0-9]{8,16})$/)?.[1];
      if (polyPizzaId) return polyPizzaId;
    }
    return last;
  } catch {
    return "";
  }
}

export function cc0BundleMemberTitleFromPath(entryPath: string) {
  return basename(entryPath)
    .replace(/\.glb$/i, "")
    .replace(/-[a-zA-Z0-9]{8,16}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cc0BundleMemberSourceAssetId(
  bundleSourceId: string,
  entryPath: string,
) {
  const bundle = slug(bundleSourceId) || "cc0_bundle";
  const member = slug(normalizeEntryPath(entryPath)) || "asset";
  return `${bundle}__${member}`.slice(0, 180);
}

export function buildCc0BundleProvenanceNotes(input: {
  bundleTitle: string;
  bundleSourceId: string;
  entryPath: string;
}) {
  const title = input.bundleTitle.trim() || "CC0 model bundle";
  const sourceId = input.bundleSourceId.trim();
  return [
    `Imported from CC0 bundle ZIP "${title}" entry "${normalizeEntryPath(input.entryPath)}" through MyWay's CC0 bundle intake.`,
    sourceId ? `Bundle source ID: ${sourceId}.` : "",
    "Source and licence remain subject to human review before scene approval.",
  ]
    .filter(Boolean)
    .join(" ");
}
