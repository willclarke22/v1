export type DirectorQualificationVp8Chunk = {
  timestamp_us: number;
  duration_us: number;
  key_frame: boolean;
  data: ArrayBuffer;
};

export type DirectorQualificationDeterministicWebMInput = {
  width: number;
  height: number;
  fps: number;
  duration_ms: number;
  chunks: DirectorQualificationVp8Chunk[];
};

type EbmlPart = {
  parts: ArrayBuffer[];
  size: number;
};

function bufferFromBytes(bytes: number[]) {
  const view = new Uint8Array(bytes.length);
  view.set(bytes);
  return view.buffer;
}

function idBuffer(id: number) {
  const bytes: number[] = [];
  let value = id >>> 0;
  do {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  } while (value > 0);
  return bufferFromBytes(bytes);
}

function vintSizeBuffer(size: number) {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error(`Invalid EBML payload size: ${size}`);
  }
  const value = BigInt(size);
  for (let length = 1; length <= 8; length += 1) {
    const bits = BigInt(7 * length);
    const maxValue = (BigInt(1) << bits) - BigInt(2);
    if (value > maxValue) continue;
    let encoded = value | (BigInt(1) << bits);
    const bytes = new Uint8Array(length);
    for (let index = length - 1; index >= 0; index -= 1) {
      bytes[index] = Number(encoded & BigInt(0xff));
      encoded >>= BigInt(8);
    }
    return bytes.buffer;
  }
  throw new Error(`EBML payload is too large: ${size}`);
}

function unsignedBuffer(value: number, minimumBytes = 1) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid EBML unsigned integer: ${value}`);
  }
  let bytes = Math.max(1, minimumBytes);
  let ceiling = 2 ** (bytes * 8) - 1;
  while (value > ceiling && bytes < 8) {
    bytes += 1;
    ceiling = bytes >= 7 ? Number.MAX_SAFE_INTEGER : 2 ** (bytes * 8) - 1;
  }
  const output = new Uint8Array(bytes);
  let remaining = BigInt(value);
  for (let index = bytes - 1; index >= 0; index -= 1) {
    output[index] = Number(remaining & BigInt(0xff));
    remaining >>= BigInt(8);
  }
  return output.buffer;
}

function float64Buffer(value: number) {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, false);
  return buffer;
}

function utf8Buffer(value: string) {
  const encoded = new TextEncoder().encode(value);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

function elementFromPayloadParts(
  id: number,
  payloadParts: ArrayBuffer[],
  payloadSize: number,
): EbmlPart {
  const idBytes = idBuffer(id);
  const sizeBytes = vintSizeBuffer(payloadSize);
  return {
    parts: [idBytes, sizeBytes, ...payloadParts],
    size: idBytes.byteLength + sizeBytes.byteLength + payloadSize,
  };
}

function leaf(id: number, payload: ArrayBuffer): EbmlPart {
  return elementFromPayloadParts(id, [payload], payload.byteLength);
}

function master(id: number, children: EbmlPart[]): EbmlPart {
  const payloadSize = children.reduce((sum, child) => sum + child.size, 0);
  return elementFromPayloadParts(
    id,
    children.flatMap((child) => child.parts),
    payloadSize,
  );
}

function unsignedElement(id: number, value: number, minimumBytes = 1) {
  return leaf(id, unsignedBuffer(value, minimumBytes));
}

function stringElement(id: number, value: string) {
  return leaf(id, utf8Buffer(value));
}

function float64Element(id: number, value: number) {
  return leaf(id, float64Buffer(value));
}

function simpleBlock(
  relativeTimecodeMs: number,
  keyFrame: boolean,
  frameData: ArrayBuffer,
) {
  if (
    !Number.isInteger(relativeTimecodeMs) ||
    relativeTimecodeMs < -32768 ||
    relativeTimecodeMs > 32767
  ) {
    throw new Error(
      `SimpleBlock relative timecode is out of int16 range: ${relativeTimecodeMs}`,
    );
  }
  const header = new ArrayBuffer(4);
  const bytes = new Uint8Array(header);
  bytes[0] = 0x81; // Track 1 encoded as an EBML vint.
  new DataView(header).setInt16(1, relativeTimecodeMs, false);
  bytes[3] = keyFrame ? 0x80 : 0x00;
  return elementFromPayloadParts(
    0xa3,
    [header, frameData],
    header.byteLength + frameData.byteLength,
  );
}

function buildClusters(chunks: DirectorQualificationVp8Chunk[]) {
  const clusters: EbmlPart[] = [];
  let clusterTimecodeMs: number | null = null;
  let clusterBlocks: EbmlPart[] = [];

  const flush = () => {
    if (clusterTimecodeMs === null || !clusterBlocks.length) return;
    clusters.push(
      master(0x1f43b675, [
        unsignedElement(0xe7, clusterTimecodeMs),
        ...clusterBlocks,
      ]),
    );
    clusterTimecodeMs = null;
    clusterBlocks = [];
  };

  for (const chunk of chunks) {
    const chunkTimecodeMs = Math.max(0, Math.round(chunk.timestamp_us / 1000));
    if (
      clusterTimecodeMs === null ||
      (chunk.key_frame && chunkTimecodeMs - clusterTimecodeMs >= 2_000) ||
      chunkTimecodeMs - clusterTimecodeMs > 32_000
    ) {
      flush();
      clusterTimecodeMs = chunkTimecodeMs;
    }
    const relative = chunkTimecodeMs - clusterTimecodeMs;
    clusterBlocks.push(simpleBlock(relative, chunk.key_frame, chunk.data));
  }
  flush();
  return clusters;
}

/**
 * Dependency-free WebM muxer for the deterministic Qualification exporter.
 *
 * WebCodecs owns VP8 compression and timestamps. This function only writes the
 * minimal EBML/WebM container around those already-encoded VP8 chunks, so
 * browser scheduling speed cannot remove a logical 30 FPS evidence frame.
 */
export function buildDirectorQualificationVp8WebM(
  input: DirectorQualificationDeterministicWebMInput,
) {
  if (!input.chunks.length) {
    throw new Error("Deterministic VP8 export produced no encoded chunks.");
  }
  if (!(input.width > 0 && input.height > 0 && input.fps > 0 && input.duration_ms > 0)) {
    throw new Error("Deterministic WebM dimensions, FPS, and duration must be positive.");
  }

  const chunks = input.chunks
    .slice()
    .sort((left, right) => left.timestamp_us - right.timestamp_us);
  const timecodeScaleNs = 1_000_000; // 1 ms WebM ticks.
  const defaultDurationNs = Math.round(1_000_000_000 / input.fps);

  const ebml = master(0x1a45dfa3, [
    unsignedElement(0x4286, 1),
    unsignedElement(0x42f7, 1),
    unsignedElement(0x42f2, 4),
    unsignedElement(0x42f3, 8),
    stringElement(0x4282, "webm"),
    unsignedElement(0x4287, 4),
    unsignedElement(0x4285, 2),
  ]);

  const info = master(0x1549a966, [
    unsignedElement(0x2ad7b1, timecodeScaleNs),
    float64Element(0x4489, input.duration_ms),
    stringElement(0x4d80, "MyWay deterministic qualification exporter"),
    stringElement(0x5741, "MyWay deterministic qualification exporter"),
  ]);

  const video = master(0xe0, [
    unsignedElement(0xb0, Math.round(input.width)),
    unsignedElement(0xba, Math.round(input.height)),
  ]);
  const trackEntry = master(0xae, [
    unsignedElement(0xd7, 1),
    unsignedElement(0x73c5, 1),
    unsignedElement(0x83, 1),
    stringElement(0x86, "V_VP8"),
    unsignedElement(0x23e383, defaultDurationNs),
    video,
  ]);
  const tracks = master(0x1654ae6b, [trackEntry]);
  const clusters = buildClusters(chunks);
  const segment = master(0x18538067, [info, tracks, ...clusters]);

  return new Blob([...ebml.parts, ...segment.parts], {
    type: "video/webm;codecs=vp8",
  });
}
