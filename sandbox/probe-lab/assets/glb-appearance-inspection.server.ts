import { readFile } from "node:fs/promises";

type GlbJson = {
  materials?: unknown[];
  images?: unknown[];
  textures?: unknown[];
  meshes?: Array<{
    primitives?: Array<{
      attributes?: Record<string, unknown>;
      material?: number;
    }>;
  }>;
};

export type GlbAppearanceInspection = {
  material_count: number;
  image_count: number;
  texture_count: number;
  mesh_primitive_count: number;
  primitives_with_material: number;
  primitives_with_vertex_colors: number;
  vertex_color_attributes: string[];
  has_materials: boolean;
  has_image_textures: boolean;
  has_vertex_colors: boolean;
  has_visual_appearance_data: boolean;
};

function parseGlbJson(buffer: Buffer): GlbJson {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "glTF") {
    throw new Error("The file is not a valid GLB 2.0 container.");
  }

  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version ${version}. Expected version 2.`);
  }

  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength > buffer.length) {
    throw new Error("The GLB declares more bytes than were read.");
  }

  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);

  // ASCII "JSON" stored little-endian.
  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error("The first GLB chunk is not JSON.");
  }

  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;
  if (jsonEnd > buffer.length) {
    throw new Error("The GLB JSON chunk is truncated.");
  }

  const jsonText = buffer
    .toString("utf8", jsonStart, jsonEnd)
    .replace(/\u0000+$/g, "")
    .trim();

  return JSON.parse(jsonText) as GlbJson;
}

export function inspectGlbAppearanceBuffer(
  buffer: Buffer,
): GlbAppearanceInspection {
  const json = parseGlbJson(buffer);
  const materials = Array.isArray(json.materials) ? json.materials : [];
  const images = Array.isArray(json.images) ? json.images : [];
  const textures = Array.isArray(json.textures) ? json.textures : [];
  const meshes = Array.isArray(json.meshes) ? json.meshes : [];

  let meshPrimitiveCount = 0;
  let primitivesWithMaterial = 0;
  let primitivesWithVertexColors = 0;
  const vertexColorAttributes = new Set<string>();

  for (const mesh of meshes) {
    const primitives = Array.isArray(mesh?.primitives) ? mesh.primitives : [];

    for (const primitive of primitives) {
      meshPrimitiveCount += 1;

      if (typeof primitive?.material === "number") {
        primitivesWithMaterial += 1;
      }

      const attributes =
        primitive?.attributes &&
        typeof primitive.attributes === "object" &&
        !Array.isArray(primitive.attributes)
          ? primitive.attributes
          : {};

      const colorKeys = Object.keys(attributes).filter((key) =>
        /^COLOR_\d+$/.test(key),
      );

      if (colorKeys.length > 0) {
        primitivesWithVertexColors += 1;
        colorKeys.forEach((key) => vertexColorAttributes.add(key));
      }
    }
  }

  const hasMaterials = materials.length > 0 || primitivesWithMaterial > 0;
  const hasImageTextures = images.length > 0 || textures.length > 0;
  const hasVertexColors = primitivesWithVertexColors > 0;

  return {
    material_count: materials.length,
    image_count: images.length,
    texture_count: textures.length,
    mesh_primitive_count: meshPrimitiveCount,
    primitives_with_material: primitivesWithMaterial,
    primitives_with_vertex_colors: primitivesWithVertexColors,
    vertex_color_attributes: [...vertexColorAttributes].sort(),
    has_materials: hasMaterials,
    has_image_textures: hasImageTextures,
    has_vertex_colors: hasVertexColors,
    has_visual_appearance_data:
      hasMaterials || hasImageTextures || hasVertexColors,
  };
}

export async function inspectGlbAppearanceFile(filePath: string) {
  return inspectGlbAppearanceBuffer(await readFile(filePath));
}

export function compareGlbAppearance(
  source: GlbAppearanceInspection,
  normalized: GlbAppearanceInspection,
) {
  const lostImageTextures =
    source.has_image_textures && !normalized.has_image_textures;
  const lostVertexColors =
    source.has_vertex_colors && !normalized.has_vertex_colors;
  const lostMaterials =
    source.has_materials && !normalized.has_materials;

  const warnings = [
    lostImageTextures
      ? "The normalized GLB lost image texture references."
      : null,
    lostVertexColors
      ? "The normalized GLB lost vertex-color attributes such as COLOR_0."
      : null,
    lostMaterials
      ? "The normalized GLB lost material assignments."
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    appearance_preserved: warnings.length === 0,
    lost_image_textures: lostImageTextures,
    lost_vertex_colors: lostVertexColors,
    lost_materials: lostMaterials,
    warnings,
  };
}
