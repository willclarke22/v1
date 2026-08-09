import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";

import {
  MAX_CC0_BUNDLE_FILES,
  buildCc0BundleProvenanceNotes,
  cc0BundleMemberSourceAssetId,
  cc0BundleMemberTitleFromPath,
  cc0BundleSourceIdFromUrl,
  cc0BundleTitleFromZipName,
  extractCc0GlbBundleBuffer,
  inspectCc0GlbBundleBuffer,
} from "../../sandbox/probe-lab/assets/cc0-glb-bundle";

type FixtureEntry = {
  path: string;
  bytes: Uint8Array;
  method?: 0 | 8;
};

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

function u16(value: number) {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value >>> 0, 0);
  return out;
}

function u32(value: number) {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value >>> 0, 0);
  return out;
}

function glbHeader(_seed: number) {
  const out = Buffer.alloc(12);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  return new Uint8Array(out);
}

function makeZip(entries: FixtureEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const raw = Buffer.from(entry.bytes);
    const method = entry.method ?? 8;
    const compressed =
      method === 0 ? raw : deflateRawSync(raw);
    const crc = crc32(entry.bytes);
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    localParts.push(localHeader, compressed);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(localOffset),
      name,
    ]);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + compressed.length;
  }

  const local = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);
  return Buffer.concat([local, central, eocd]);
}

async function main() {
  const fixture = makeZip([
    {
      path: "Food/Apple Green.glb",
      bytes: glbHeader(1),
      method: 8,
    },
    {
      path: "Food/Bottle-Pc8dM9Ja4V.glb",
      bytes: glbHeader(2),
      method: 0,
    },
    {
      path: "README.txt",
      bytes: new TextEncoder().encode("CC0 fixture"),
      method: 8,
    },
  ]);
  const fixtureArrayBuffer = fixture.buffer.slice(
    fixture.byteOffset,
    fixture.byteOffset + fixture.byteLength,
  ) as ArrayBuffer;

  const inspection = inspectCc0GlbBundleBuffer(
    fixtureArrayBuffer,
  );
  assert.equal(MAX_CC0_BUNDLE_FILES, 50);
  assert.equal(inspection.entries.length, 2);
  assert.equal(inspection.ignored_entry_count, 1);
  assert.deepEqual(
    inspection.entries.map((entry) => entry.file_name),
    ["Apple Green.glb", "Bottle-Pc8dM9Ja4V.glb"],
  );

  const extracted = await extractCc0GlbBundleBuffer(
    fixtureArrayBuffer,
    async (compressed) =>
      new Uint8Array(
        inflateRawSync(Buffer.from(compressed)),
      ),
  );
  assert.equal(extracted.entries.length, 2);
  assert.equal(extracted.entries[0]?.bytes.byteLength, 12);
  assert.equal(
    cc0BundleTitleFromZipName(
      "Ultimate Food Pack-glb.zip",
    ),
    "Ultimate Food Pack",
  );
  assert.equal(
    cc0BundleSourceIdFromUrl(
      "https://poly.pizza/bundle/Ultimate-Food-Pack-h3WC1gyRb4",
    ),
    "h3WC1gyRb4",
  );
  assert.equal(
    cc0BundleMemberTitleFromPath(
      "Bottle-Pc8dM9Ja4V.glb",
    ),
    "Bottle",
  );
  assert.equal(
    cc0BundleMemberSourceAssetId(
      "h3WC1gyRb4",
      "Food/Bottle-Pc8dM9Ja4V.glb",
    ),
    "h3wc1gyrb4__food_bottle_pc8dm9ja4v",
  );
  assert.match(
    buildCc0BundleProvenanceNotes({
      bundleTitle: "Ultimate Food Pack",
      bundleSourceId: "h3WC1gyRb4",
      entryPath: "Food/Apple Green.glb",
    }),
    /Food\/Apple Green\.glb/,
  );

  const unsafe = makeZip([
    {
      path: "../escape.glb",
      bytes: glbHeader(3),
    },
  ]);
  const unsafeArrayBuffer = unsafe.buffer.slice(
    unsafe.byteOffset,
    unsafe.byteOffset + unsafe.byteLength,
  ) as ArrayBuffer;
  assert.throws(
    () => inspectCc0GlbBundleBuffer(unsafeArrayBuffer),
    /Unsafe ZIP entry path/,
  );

  const uiSource = readFileSync(
    resolve(
      process.cwd(),
      "sandbox/probe-lab/assets/ui/cc0-batch-import-lab.tsx",
    ),
    "utf8",
  );
  assert.match(uiSource, /Add CC0 bundle ZIP/);
  assert.match(uiSource, /extractCc0GlbBundleBuffer/);
  assert.match(uiSource, /bundle_entry_path/);
  assert.match(uiSource, /creator_name/);
  assert.match(uiSource, /provenance_notes/);
  assert.match(
    uiSource,
    /\/api\/sandbox\/probe-lab\/assets\/import-local/,
  );
  assert.doesNotMatch(
    uiSource,
    /\/api\/sandbox\/probe-lab\/assets\/import-cc0-bundle/,
  );

  const libraryUiSource = readFileSync(
    resolve(
      process.cwd(),
      "sandbox/probe-lab/assets/ui/asset-library-lab.tsx",
    ),
    "utf8",
  );
  assert.match(
    libraryUiSource,
    /Import CC0 GLB \/ bundle/,
  );

  const readmeSource = readFileSync(
    resolve(
      process.cwd(),
      "sandbox/probe-lab/assets/README.md",
    ),
    "utf8",
  );
  assert.match(readmeSource, /CC0 bundle ZIP intake/);
  assert.match(readmeSource, /standalone GLBs only/);

  console.log(
    "CC0 bundle ZIP fixture passed: safe ZIP inspection/extraction, stable bundle-member provenance, 50-model cap, and unchanged sequential import-local pipeline.",
  );
}

void main().catch((caught) => {
  console.error(caught);
  process.exitCode = 1;
});
