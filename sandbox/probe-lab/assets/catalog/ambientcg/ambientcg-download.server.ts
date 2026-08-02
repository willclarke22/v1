
import {
  createHash,
  randomUUID,
} from "node:crypto";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  open,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { writeJsonFileAtomic } from "../../json-file.server";
import { projectPath } from "../../paths.server";
import {
  cloudAssetMetadataEnabled,
} from "../../storage/cloud-json.server";
import {
  getR2RuntimeStorage,
  getR2SourceStorage,
} from "../../storage/r2-asset-storage.server";
import type {
  AmbientCgCachedHdri,
  AmbientCgCachedMaterial,
  AmbientCgCachedResource,
  AmbientCgCatalogAsset,
  AmbientCgDownloadJob,
  AmbientCgDownloadVariant,
  AmbientCgMaterialMaps,
  AmbientCgResourceAssetType,
} from "./ambientcg-types";
import {
  AMBIENTCG_PUBLIC_HDRI_ROOT,
  AMBIENTCG_PUBLIC_MATERIAL_ROOT,
  AMBIENTCG_PUBLIC_RESOURCE_ROOT,
  ensureAmbientCgDirectories,
  readAmbientCgCatalog,
  readAmbientCgDownloadJobs,
  readAmbientCgHdriRegistry,
  readAmbientCgMaterialRegistry,
  readAmbientCgResourceRegistry,
  writeAmbientCgCatalog,
  writeAmbientCgDownloadJobs,
  writeAmbientCgHdriRegistry,
  writeAmbientCgMaterialRegistry,
  writeAmbientCgResourceRegistry,
} from "./ambientcg-store.server";

const execFileAsync = promisify(execFile);

const MAX_DOWNLOAD_BYTES = Number(
  process.env.MYWAY_AMBIENTCG_MAX_DOWNLOAD_BYTES ??
    600 * 1024 * 1024,
);

const DOWNLOAD_TIMEOUT_MS = Number(
  process.env.MYWAY_AMBIENTCG_DOWNLOAD_TIMEOUT_MS ??
    300_000,
);

export function safeAmbientCgSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!sanitized) {
    throw new Error(
      "A safe asset identifier could not be created.",
    );
  }

  return sanitized;
}

function publicUrl(
  projectPublicPath: string,
) {
  return `/${projectPublicPath
    .replace(/^public[\\/]/, "")
    .replace(/\\/g, "/")}`;
}

function contentTypeFor(filePath: string) {
  const extension =
    path.extname(filePath).toLowerCase();

  if (extension === ".jpg" ||
      extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".tif" ||
      extension === ".tiff") {
    return "image/tiff";
  }
  if (extension === ".exr") {
    return "image/x-exr";
  }
  if (extension === ".hdr") {
    return "image/vnd.radiance";
  }
  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }
  if (extension === ".glb") return "model/gltf-binary";
  if (extension === ".gltf") return "model/gltf+json";
  if (extension === ".obj") return "text/plain; charset=utf-8";
  if (extension === ".fbx" || extension === ".blend" || extension === ".sbsar") {
    return "application/octet-stream";
  }
  if (extension === ".txt") return "text/plain; charset=utf-8";

  return "application/octet-stream";
}

function previewScore(url: string) {
  const value = url.toLowerCase();
  let score = 0;

  for (const [token, weight] of [
    ["8192", 8192],
    ["4096", 4096],
    ["2048", 2048],
    ["1024", 1024],
    ["512", 512],
    ["256", 256],
    ["full", 900],
    ["preview", 600],
    ["thumb", 100],
  ] as const) {
    if (value.includes(token)) {
      score += weight;
    }
  }

  return score;
}

export function bestAmbientCgPreviewUrl(
  asset: AmbientCgCatalogAsset,
) {
  return [
    ...asset.preview_urls,
    ...asset.thumbnail_urls,
  ]
    .filter(Boolean)
    .sort(
      (a, b) =>
        previewScore(b) -
        previewScore(a),
    )[0] ?? null;
}

export async function updateAmbientCgDownloadJob(
  job: AmbientCgDownloadJob,
) {
  const registry =
    await readAmbientCgDownloadJobs();

  const next = [
    job,
    ...registry.jobs.filter(
      (item) =>
        item.job_id !== job.job_id,
    ),
  ].slice(0, 200);

  await writeAmbientCgDownloadJobs({
    ...registry,
    updated_at:
      new Date().toISOString(),
    jobs: next,
  });
}

async function downloadFile(
  url: string,
  destination: string,
) {
  let lastError: unknown = null;

  for (
    let attempt = 0;
    attempt < 3;
    attempt += 1
  ) {
    const controller =
      new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      DOWNLOAD_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "MyWay-AmbientCG-Cloud-Cache/2.0",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `Download failed with HTTP ${response.status}.`,
        );
      }

      const declared = Number(
        response.headers.get(
          "content-length",
        ) ?? 0,
      );

      if (
        declared >
        MAX_DOWNLOAD_BYTES
      ) {
        throw new Error(
          `Download is ${declared} bytes, above the configured limit of ${MAX_DOWNLOAD_BYTES}.`,
        );
      }

      const buffer = Buffer.from(
        await response.arrayBuffer(),
      );

      if (!buffer.length) {
        throw new Error(
          "Downloaded file was empty.",
        );
      }

      if (
        buffer.length >
        MAX_DOWNLOAD_BYTES
      ) {
        throw new Error(
          `Download is ${buffer.length} bytes, above the configured limit of ${MAX_DOWNLOAD_BYTES}.`,
        );
      }

      await mkdir(
        path.dirname(destination),
        { recursive: true },
      );
      await writeFile(
        destination,
        buffer,
      );

      return {
        bytes: buffer.length,
        sha256: createHash("sha256")
          .update(buffer)
          .digest("hex"),
      };
    } catch (caught) {
      lastError = caught;

      if (attempt < 2) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              500 * 2 ** attempt,
            ),
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

async function extractArchive(
  archivePath: string,
  destination: string,
) {
  await mkdir(destination, {
    recursive: true,
  });

  try {
    await execFileAsync(
      "tar",
      [
        "-xf",
        archivePath,
        "-C",
        destination,
      ],
      {
        timeout: 180_000,
        windowsHide: true,
      },
    );
    return;
  } catch (tarError) {
    if (process.platform !== "win32") {
      throw tarError;
    }
  }

  const command =
    "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force";

  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
      archivePath,
      destination,
    ],
    {
      timeout: 180_000,
      windowsHide: true,
    },
  );
}

async function listFilesRecursive(
  directory: string,
): Promise<string[]> {
  const output: string[] = [];

  for (
    const entry of await readdir(
      directory,
      { withFileTypes: true },
    )
  ) {
    const full = path.join(
      directory,
      entry.name,
    );

    if (entry.isDirectory()) {
      output.push(
        ...(await listFilesRecursive(
          full,
        )),
      );
    } else if (entry.isFile()) {
      output.push(full);
    }
  }

  return output;
}

function mapRole(
  filename: string,
): keyof AmbientCgMaterialMaps | null {
  const name = filename.toLowerCase();

  if (
    /normalgl|normal[_-]?gl|nor[_-]?gl/.test(
      name,
    )
  ) {
    return "normal_gl";
  }
  if (
    /normaldx|normal[_-]?dx|nor[_-]?dx/.test(
      name,
    )
  ) {
    return "normal_dx";
  }
  if (/roughness|rough/.test(name)) {
    return "roughness";
  }
  if (
    /metalness|metallic|(?:^|[-_.])metal(?:[-_.]|$)/.test(
      name,
    )
  ) {
    return "metallic";
  }
  if (
    /ambientocclusion|ambient[_-]?occlusion|[_-]ao(?:[-_.]|$)/.test(
      name,
    )
  ) {
    return "ambient_occlusion";
  }
  if (
    /displacement|height|(?:^|[-_.])disp(?:[-_.]|$)/.test(
      name,
    )
  ) {
    return "height";
  }
  if (
    /opacity|alpha|transparency/.test(
      name,
    )
  ) {
    return "opacity";
  }
  if (
    /emission|emissive/.test(name)
  ) {
    return "emission";
  }
  if (
    /basecolou?r|base[_-]?colou?r|(?:^|[-_.])colou?r(?:[-_.]|$)|albedo|diffuse|(?:^|[-_.])diff(?:[-_.]|$)/.test(
      name,
    )
  ) {
    return "base_color";
  }

  return null;
}

function imageExtension(
  filePath: string,
) {
  const extension =
    path.extname(filePath).toLowerCase();

  return [
    ".jpg",
    ".jpeg",
    ".png",
    ".tif",
    ".tiff",
    ".exr",
    ".webp",
  ].includes(extension)
    ? extension.replace(
        ".jpeg",
        ".jpg",
      )
    : null;
}

async function downloadPreview(
  asset: AmbientCgCatalogAsset,
  destinationRoot: string,
) {
  const url =
    bestAmbientCgPreviewUrl(asset);

  if (!url) return null;

  let extension = ".jpg";

  try {
    extension =
      path.extname(
        new URL(url).pathname,
      ).toLowerCase() || ".jpg";
  } catch {
    extension = ".jpg";
  }

  const destination =
    path.join(
      destinationRoot,
      `preview${extension}`,
    );

  try {
    await downloadFile(
      url,
      destination,
    );

    return {
      local_path: destination,
      source_url: url,
    };
  } catch {
    return {
      local_path: null,
      source_url: url,
    };
  }
}

export function chooseAmbientCgVariant(
  asset: AmbientCgCatalogAsset,
  variantId?: string,
) {
  if (
    !asset.download_variants.length
  ) {
    throw new Error(
      "This catalog entry has no downloadable variants in the mirrored API record.",
    );
  }

  if (variantId) {
    const exact =
      asset.download_variants.find(
        (item) =>
          item.variant_id ===
          variantId,
      );

    if (!exact) {
      throw new Error(
        "The selected ambientCG download variant no longer exists.",
      );
    }

    return exact;
  }

  const preferred =
    asset.download_variants.find(
      (variant) =>
        variant.resolution === "1K" &&
        (
          asset.asset_type === "hdri"
            ? variant.file_format ===
              "HDR"
            : variant.file_format ===
              "JPG"
        ),
    );

  return preferred ??
    asset.download_variants[0]!;
}

export function ambientCgVariantFileExtension(
  variant: AmbientCgDownloadVariant,
) {
  const parsed = new URL(variant.url);
  const candidates = [
    parsed.searchParams.get("file"),
    parsed.pathname,
    typeof variant.attributes.extension === "string"
      ? `source.${variant.attributes.extension}`
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const extension =
      path.extname(candidate).toLowerCase();
    if (extension) return extension;
  }

  return variant.archive_format === "ZIP"
    ? ".zip"
    : ".bin";
}

async function fileLooksLikeZip(
  filePath: string,
) {
  const handle = await open(filePath, "r");
  try {
    const signature = Buffer.alloc(4);
    const { bytesRead } = await handle.read(
      signature,
      0,
      signature.length,
      0,
    );
    if (bytesRead < 4) return false;

    return (
      signature[0] === 0x50 &&
      signature[1] === 0x4b &&
      (
        (signature[2] === 0x03 && signature[3] === 0x04) ||
        (signature[2] === 0x05 && signature[3] === 0x06) ||
        (signature[2] === 0x07 && signature[3] === 0x08)
      )
    );
  } finally {
    await handle.close();
  }
}

export async function prepareAmbientCgDownloadedFiles(
  variant: AmbientCgDownloadVariant,
  jobRoot: string,
) {
  const extension =
    ambientCgVariantFileExtension(variant);

  const downloadPath =
    path.join(
      jobRoot,
      `source${extension}`,
    );

  const download =
    await downloadFile(
      variant.url,
      downloadPath,
    );

  const isZip =
    extension === ".zip" ||
    variant.archive_format === "ZIP" ||
    await fileLooksLikeZip(downloadPath);

  if (isZip) {
    const extracted =
      path.join(
        jobRoot,
        "extracted",
      );

    await extractArchive(
      downloadPath,
      extracted,
    );

    return {
      files:
        await listFilesRecursive(
          extracted,
        ),
      root: extracted,
      download_path: downloadPath,
      download,
    };
  }

  return {
    files: [downloadPath],
    root: jobRoot,
    download_path: downloadPath,
    download,
  };
}

async function uploadPublicFile(input: {
  localPath: string;
  objectKey: string;
  assetId: string;
  contentHash: string;
}) {
  const result =
    await getR2RuntimeStorage().upload({
      local_path: input.localPath,
      object_key: input.objectKey,
      content_type:
        contentTypeFor(
          input.localPath,
        ),
      visibility: "public",
      cache_control:
        "public, max-age=31536000, immutable",
      metadata: {
        "asset-id": input.assetId,
        "source-type": "ambientcg",
        "content-hash":
          input.contentHash,
      },
    });

  if (!result.public_url) {
    throw new Error(
      `R2 upload did not produce a public URL for ${input.objectKey}.`,
    );
  }

  return result;
}

async function cacheMaterial(
  asset: AmbientCgCatalogAsset,
  variant: AmbientCgDownloadVariant,
  jobRoot: string,
  sha256: string,
  files: string[],
) {
  const sourceId =
    safeAmbientCgSegment(
      asset.source_asset_id,
    );
  const variantSegment =
    safeAmbientCgSegment(
      `${variant.resolution ?? "native"}-${variant.file_format ?? "file"}`.toLowerCase(),
    );
  const resourceId =
    `ambientcg_material_${sourceId}_${variantSegment}`;
  const normalizedRoot =
    path.join(
      jobRoot,
      "normalized-material",
    );

  await rm(
    normalizedRoot,
    {
      recursive: true,
      force: true,
    },
  );
  await mkdir(
    normalizedRoot,
    { recursive: true },
  );

  const localMaps:
    Partial<
      Record<
        keyof AmbientCgMaterialMaps,
        string
      >
    > = {};

  for (const file of files) {
    const extension =
      imageExtension(file);
    const role = extension
      ? mapRole(
          path.basename(file),
        )
      : null;

    if (
      !role ||
      localMaps[role]
    ) {
      continue;
    }

    const destination =
      path.join(
        normalizedRoot,
        `${role}${extension}`,
      );

    await copyFile(
      file,
      destination,
    );
    localMaps[role] =
      destination;
  }

  if (!localMaps.base_color) {
    const inspected = files
      .map((file) => path.basename(file))
      .sort()
      .slice(0, 40);
    throw new Error(
      `The downloaded package for ${asset.source_asset_id} (${variant.variant_id}) did not contain a recognizable base-color map. ` +
      `Inspected ${files.length} file(s): ${inspected.join(", ") || "none"}.`,
    );
  }

  const preview =
    await downloadPreview(
      asset,
      normalizedRoot,
    );
  const now =
    new Date().toISOString();
  const cloud =
    cloudAssetMetadataEnabled();

  let maps: AmbientCgMaterialMaps = {
    base_color: null,
    normal_gl: null,
    normal_dx: null,
    roughness: null,
    metallic: null,
    ambient_occlusion: null,
    height: null,
    opacity: null,
    emission: null,
  };
  const mapObjectKeys:
    Partial<
      Record<
        keyof AmbientCgMaterialMaps,
        string
      >
    > = {};
  let thumbnailUrl =
    preview?.source_url ?? null;
  let thumbnailObjectKey:
    string | null = null;
  let publicRoot = "";
  let manifestObjectKey:
    string | null = null;
  let manifestUrl:
    string | null = null;

  if (cloud) {
    const prefix =
      `runtime/materials/ambientcg/${sourceId}/${variantSegment}`;

    for (
      const [role, localPath] of
      Object.entries(localMaps) as Array<
        [
          keyof AmbientCgMaterialMaps,
          string,
        ]
      >
    ) {
      const objectKey =
        `${prefix}/${path.basename(localPath)}`;
      const upload =
        await uploadPublicFile({
          localPath,
          objectKey,
          assetId: resourceId,
          contentHash: sha256,
        });

      maps[role] =
        upload.public_url;
      mapObjectKeys[role] =
        upload.object_key;
    }

    if (
      preview?.local_path
    ) {
      const objectKey =
        `${prefix}/${path.basename(preview.local_path)}`;
      const upload =
        await uploadPublicFile({
          localPath:
            preview.local_path,
          objectKey,
          assetId: resourceId,
          contentHash: sha256,
        });

      thumbnailUrl =
        upload.public_url;
      thumbnailObjectKey =
        upload.object_key;
    }

    publicRoot =
      maps.base_color
        ? maps.base_color.replace(
            /\/[^/]+$/,
            "",
          )
        : "";
    manifestObjectKey =
      `${prefix}/material.json`;
  } else {
    await ensureAmbientCgDirectories();

    const projectRoot =
      path.join(
        AMBIENTCG_PUBLIC_MATERIAL_ROOT,
  AMBIENTCG_PUBLIC_RESOURCE_ROOT,
        sourceId,
        variantSegment,
      );
    const destinationRoot =
      projectPath(projectRoot);

    await rm(
      destinationRoot,
      {
        recursive: true,
        force: true,
      },
    );
    await mkdir(
      destinationRoot,
      { recursive: true },
    );

    for (
      const [role, localPath] of
      Object.entries(localMaps) as Array<
        [
          keyof AmbientCgMaterialMaps,
          string,
        ]
      >
    ) {
      const filename =
        path.basename(localPath);
      const destination =
        path.join(
          destinationRoot,
          filename,
        );
      await copyFile(
        localPath,
        destination,
      );
      maps[role] =
        publicUrl(
          path.join(
            projectRoot,
            filename,
          ),
        );
    }

    if (
      preview?.local_path
    ) {
      const filename =
        path.basename(
          preview.local_path,
        );
      await copyFile(
        preview.local_path,
        path.join(
          destinationRoot,
          filename,
        ),
      );
      thumbnailUrl =
        publicUrl(
          path.join(
            projectRoot,
            filename,
          ),
        );
    }

    publicRoot =
      publicUrl(projectRoot);
  }

  const resource:
    AmbientCgCachedMaterial = {
      resource_id: resourceId,
      source_asset_id:
        asset.source_asset_id,
      source_type: "ambientcg",
      asset_type: "material",
      display_name:
        asset.display_name,
      source_url:
        asset.source_url,
      license: "CC0-1.0",
      attribution_required: false,
      commercial_use_allowed: true,
      raw_distribution_allowed: true,
      resolution:
        variant.resolution,
      file_format:
        variant.file_format,
      variant_id:
        variant.variant_id,
      available_variants:
        asset.download_variants,
      public_root: publicRoot,
      thumbnail_url:
        thumbnailUrl,
      preview_url:
        thumbnailUrl,
      maps,
      map_object_keys:
        mapObjectKeys,
      physical_dimensions:
        asset.dimensions,
      semantic_tags:
        asset.semantic_tags,
      content_sha256: sha256,
      cached_at: now,
      published_to_r2: cloud,
      storage_provider:
        cloud ? "r2" : "local",
      storage: {
        provider:
          cloud ? "r2" : "local",
        runtime_prefix:
          cloud
            ? `runtime/materials/ambientcg/${sourceId}/${variantSegment}`
            : publicRoot,
        manifest_url:
          manifestUrl,
        manifest_object_key:
          manifestObjectKey,
        thumbnail_object_key:
          thumbnailObjectKey,
        source_metadata_object_key:
          cloud
            ? `metadata/ambientcg/resources/${resourceId}/source.json`
            : null,
        license_object_key:
          cloud
            ? `metadata/ambientcg/resources/${resourceId}/license.json`
            : null,
      },
    };

  if (
    cloud &&
    manifestObjectKey
  ) {
    const manifestUpload =
      await getR2RuntimeStorage()
        .uploadBytes({
          body:
            JSON.stringify(resource),
          object_key:
            manifestObjectKey,
          content_type:
            "application/json; charset=utf-8",
          visibility: "public",
          cache_control:
            "public, max-age=300",
          metadata: {
            "asset-id": resourceId,
            "source-type":
              "ambientcg",
          },
        });

    manifestUrl =
      manifestUpload.public_url;
    resource.storage = {
      ...resource.storage!,
      manifest_url:
        manifestUrl,
    };
  } else if (!cloud) {
    await writeJsonFileAtomic(
      projectPath(
        AMBIENTCG_PUBLIC_MATERIAL_ROOT,
  AMBIENTCG_PUBLIC_RESOURCE_ROOT,
        sourceId,
        variantSegment,
        "material.json",
      ),
      resource,
    );
  }

  const registry =
    await readAmbientCgMaterialRegistry();

  await writeAmbientCgMaterialRegistry({
    ...registry,
    updated_at: now,
    materials: [
      resource,
      ...registry.materials.filter(
        (item) =>
          item.resource_id !==
          resource.resource_id,
      ),
    ],
  });

  return resource;
}

async function cacheHdri(
  asset: AmbientCgCatalogAsset,
  variant: AmbientCgDownloadVariant,
  jobRoot: string,
  sha256: string,
  files: string[],
) {
  const sourceId =
    safeAmbientCgSegment(
      asset.source_asset_id,
    );
  const variantSegment =
    safeAmbientCgSegment(
      `${variant.resolution ?? "native"}-${variant.file_format ?? "file"}`.toLowerCase(),
    );
  const resourceId =
    `ambientcg_hdri_${sourceId}_${variantSegment}`;
  const environment =
    files
      .filter((file) =>
        [".hdr", ".exr"].includes(
          path.extname(
            file,
          ).toLowerCase(),
        ),
      )
      .sort(
        (a, b) =>
          path.basename(a).length -
          path.basename(b).length,
      )[0];

  if (!environment) {
    throw new Error(
      "The downloaded HDRI package did not contain an .hdr or .exr file.",
    );
  }

  const normalizedRoot =
    path.join(
      jobRoot,
      "normalized-hdri",
    );
  await mkdir(
    normalizedRoot,
    { recursive: true },
  );

  const extension =
    path.extname(
      environment,
    ).toLowerCase();
  const normalizedEnvironment =
    path.join(
      normalizedRoot,
      `environment${extension}`,
    );
  await copyFile(
    environment,
    normalizedEnvironment,
  );

  const preview =
    await downloadPreview(
      asset,
      normalizedRoot,
    );
  const now =
    new Date().toISOString();
  const cloud =
    cloudAssetMetadataEnabled();

  let environmentUrl = "";
  let environmentObjectKey:
    string | null = null;
  let thumbnailUrl =
    preview?.source_url ?? null;
  let thumbnailObjectKey:
    string | null = null;
  let manifestObjectKey:
    string | null = null;
  let manifestUrl:
    string | null = null;
  let runtimePrefix = "";

  if (cloud) {
    runtimePrefix =
      `runtime/hdri/ambientcg/${sourceId}/${variantSegment}`;
    const environmentUpload =
      await uploadPublicFile({
        localPath:
          normalizedEnvironment,
        objectKey:
          `${runtimePrefix}/environment${extension}`,
        assetId:
          resourceId,
        contentHash: sha256,
      });

    environmentUrl =
      environmentUpload.public_url!;
    environmentObjectKey =
      environmentUpload.object_key;

    if (
      preview?.local_path
    ) {
      const upload =
        await uploadPublicFile({
          localPath:
            preview.local_path,
          objectKey:
            `${runtimePrefix}/${path.basename(preview.local_path)}`,
          assetId:
            resourceId,
          contentHash: sha256,
        });
      thumbnailUrl =
        upload.public_url;
      thumbnailObjectKey =
        upload.object_key;
    }

    manifestObjectKey =
      `${runtimePrefix}/environment.json`;
  } else {
    await ensureAmbientCgDirectories();
    const projectRoot =
      path.join(
        AMBIENTCG_PUBLIC_HDRI_ROOT,
        sourceId,
        variantSegment,
      );
    const destinationRoot =
      projectPath(projectRoot);
    await rm(
      destinationRoot,
      {
        recursive: true,
        force: true,
      },
    );
    await mkdir(
      destinationRoot,
      { recursive: true },
    );

    const finalEnvironment =
      path.join(
        destinationRoot,
        `environment${extension}`,
      );
    await copyFile(
      normalizedEnvironment,
      finalEnvironment,
    );

    environmentUrl =
      publicUrl(
        path.join(
          projectRoot,
          `environment${extension}`,
        ),
      );
    runtimePrefix =
      publicUrl(projectRoot);

    if (
      preview?.local_path
    ) {
      const filename =
        path.basename(
          preview.local_path,
        );
      await copyFile(
        preview.local_path,
        path.join(
          destinationRoot,
          filename,
        ),
      );
      thumbnailUrl =
        publicUrl(
          path.join(
            projectRoot,
            filename,
          ),
        );
    }
  }

  const resource:
    AmbientCgCachedHdri = {
      resource_id:
        resourceId,
      source_asset_id:
        asset.source_asset_id,
      source_type:
        "ambientcg",
      asset_type: "hdri",
      display_name:
        asset.display_name,
      source_url:
        asset.source_url,
      license: "CC0-1.0",
      attribution_required: false,
      commercial_use_allowed: true,
      raw_distribution_allowed: true,
      resolution:
        variant.resolution,
      file_format:
        variant.file_format ??
        extension
          .slice(1)
          .toUpperCase(),
      variant_id:
        variant.variant_id,
      available_variants:
        asset.download_variants,
      environment_url:
        environmentUrl,
      environment_object_key:
        environmentObjectKey,
      thumbnail_url:
        thumbnailUrl,
      preview_url:
        thumbnailUrl,
      semantic_tags:
        asset.semantic_tags,
      content_sha256:
        sha256,
      cached_at: now,
      published_to_r2: cloud,
      storage_provider:
        cloud ? "r2" : "local",
      storage: {
        provider:
          cloud ? "r2" : "local",
        runtime_prefix:
          runtimePrefix,
        manifest_url:
          manifestUrl,
        manifest_object_key:
          manifestObjectKey,
        thumbnail_object_key:
          thumbnailObjectKey,
        source_metadata_object_key:
          cloud
            ? `metadata/ambientcg/resources/${resourceId}/source.json`
            : null,
        license_object_key:
          cloud
            ? `metadata/ambientcg/resources/${resourceId}/license.json`
            : null,
      },
    };

  if (
    cloud &&
    manifestObjectKey
  ) {
    const manifestUpload =
      await getR2RuntimeStorage()
        .uploadBytes({
          body:
            JSON.stringify(resource),
          object_key:
            manifestObjectKey,
          content_type:
            "application/json; charset=utf-8",
          visibility: "public",
          cache_control:
            "public, max-age=300",
          metadata: {
            "asset-id":
              resourceId,
            "source-type":
              "ambientcg",
          },
        });
    manifestUrl =
      manifestUpload.public_url;
    resource.storage = {
      ...resource.storage!,
      manifest_url:
        manifestUrl,
    };
  } else if (!cloud) {
    await writeJsonFileAtomic(
      projectPath(
        AMBIENTCG_PUBLIC_HDRI_ROOT,
        sourceId,
        variantSegment,
        "environment.json",
      ),
      resource,
    );
  }

  const registry =
    await readAmbientCgHdriRegistry();

  await writeAmbientCgHdriRegistry({
    ...registry,
    updated_at: now,
    hdris: [
      resource,
      ...registry.hdris.filter(
        (item) =>
          item.resource_id !==
          resource.resource_id,
      ),
    ],
  });

  return resource;
}


function genericResourceRole(filePath: string) {
  const name = path.basename(filePath).toLowerCase();
  const extension = path.extname(name);

  if (/preview|thumb/.test(name)) return "preview";
  if (/normal/.test(name)) return "normal";
  if (/rough/.test(name)) return "roughness";
  if (/displacement|height|disp/.test(name)) return "height";
  if (/opacity|alpha|mask/.test(name)) return "mask";
  if (/color|albedo|diffuse|basecolor/.test(name)) return "color";
  if ([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".exr", ".hdr"].includes(extension)) {
    return "image";
  }
  if (extension === ".sbsar") return "substance";
  return null;
}

function safeRelativeFileName(root: string, filePath: string, index: number) {
  let relative = path.relative(root, filePath).replace(/\\/g, "/");
  if (!relative || relative.startsWith("..")) {
    relative = path.basename(filePath);
  }

  const parts = relative
    .split("/")
    .filter(Boolean)
    .map((part) => safeAmbientCgSegment(part));

  return parts.length
    ? parts.join("/")
    : `file-${index}${path.extname(filePath).toLowerCase()}`;
}

function primaryGenericFile(
  files: AmbientCgCachedResource["files"],
) {
  const priorities = [
    "color",
    "image",
    "substance",
    "normal",
    "height",
    "mask",
  ];

  for (const role of priorities) {
    const match = files.find((file) => file.role === role);
    if (match) return match;
  }

  return files[0] ?? null;
}

async function cacheGenericResource(
  asset: AmbientCgCatalogAsset & {
    asset_type: AmbientCgResourceAssetType;
  },
  variant: AmbientCgDownloadVariant,
  jobRoot: string,
  sha256: string,
  files: string[],
  extractedRoot: string,
) {
  const sourceId = safeAmbientCgSegment(asset.source_asset_id);
  const typeSegment = safeAmbientCgSegment(asset.asset_type);
  const variantSegment = safeAmbientCgSegment(
    `${variant.resolution ?? "native"}-${variant.file_format ?? "file"}`.toLowerCase(),
  );
  const resourceId =
    `ambientcg_${typeSegment}_${sourceId}_${variantSegment}`;
  const now = new Date().toISOString();
  const cloud = cloudAssetMetadataEnabled();
  const normalizedRoot = path.join(jobRoot, "normalized-resource");

  await rm(normalizedRoot, { recursive: true, force: true });
  await mkdir(normalizedRoot, { recursive: true });

  const selectedFiles = files
    .filter((file) => !/[\\/]__MACOSX[\\/]/i.test(file))
    .slice(0, 300);

  if (!selectedFiles.length) {
    throw new Error("The downloaded ambientCG package did not contain any files.");
  }

  const runtimePrefix = cloud
    ? `runtime/resources/ambientcg/${typeSegment}/${sourceId}/${variantSegment}`
    : publicUrl(
        path.join(
          AMBIENTCG_PUBLIC_RESOURCE_ROOT,
          typeSegment,
          sourceId,
          variantSegment,
        ),
      );
  const cachedFiles: AmbientCgCachedResource["files"] = [];

  if (cloud) {
    for (const [index, sourceFile] of selectedFiles.entries()) {
      const relativeName = safeRelativeFileName(extractedRoot, sourceFile, index);
      const objectKey = `${runtimePrefix}/${relativeName}`;
      const info = await stat(sourceFile);
      const upload = await uploadPublicFile({
        localPath: sourceFile,
        objectKey,
        assetId: resourceId,
        contentHash: sha256,
      });
      cachedFiles.push({
        name: relativeName,
        role: genericResourceRole(sourceFile),
        public_url: upload.public_url!,
        object_key: upload.object_key,
        size_bytes: info.size,
        content_type: contentTypeFor(sourceFile),
      });
    }
  } else {
    await ensureAmbientCgDirectories();
    const projectRoot = path.join(
      AMBIENTCG_PUBLIC_RESOURCE_ROOT,
      typeSegment,
      sourceId,
      variantSegment,
    );
    const destinationRoot = projectPath(projectRoot);
    await rm(destinationRoot, { recursive: true, force: true });
    await mkdir(destinationRoot, { recursive: true });

    for (const [index, sourceFile] of selectedFiles.entries()) {
      const relativeName = safeRelativeFileName(extractedRoot, sourceFile, index);
      const destination = path.join(destinationRoot, relativeName);
      const info = await stat(sourceFile);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(sourceFile, destination);
      cachedFiles.push({
        name: relativeName,
        role: genericResourceRole(sourceFile),
        public_url: publicUrl(path.join(projectRoot, relativeName)),
        object_key: null,
        size_bytes: info.size,
        content_type: contentTypeFor(sourceFile),
      });
    }
  }

  const preview = await downloadPreview(asset, normalizedRoot);
  let thumbnailUrl = preview?.source_url ?? null;
  let thumbnailObjectKey: string | null = null;

  if (cloud && preview?.local_path) {
    const upload = await uploadPublicFile({
      localPath: preview.local_path,
      objectKey: `${runtimePrefix}/${path.basename(preview.local_path)}`,
      assetId: resourceId,
      contentHash: sha256,
    });
    thumbnailUrl = upload.public_url;
    thumbnailObjectKey = upload.object_key;
  } else if (!cloud && preview?.local_path) {
    const projectRoot = path.join(
      AMBIENTCG_PUBLIC_RESOURCE_ROOT,
      typeSegment,
      sourceId,
      variantSegment,
    );
    const filename = path.basename(preview.local_path);
    const destination = projectPath(projectRoot, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(preview.local_path, destination);
    thumbnailUrl = publicUrl(path.join(projectRoot, filename));
  }

  const primary = primaryGenericFile(cachedFiles);
  const manifestObjectKey = cloud
    ? `${runtimePrefix}/resource.json`
    : null;
  const resource: AmbientCgCachedResource = {
    resource_id: resourceId,
    source_asset_id: asset.source_asset_id,
    source_type: "ambientcg",
    asset_type: asset.asset_type,
    display_name: asset.display_name,
    source_url: asset.source_url,
    license: "CC0-1.0",
    attribution_required: false,
    commercial_use_allowed: true,
    raw_distribution_allowed: true,
    resolution: variant.resolution,
    file_format: variant.file_format,
    variant_id: variant.variant_id,
    available_variants: asset.download_variants,
    public_root: runtimePrefix,
    primary_url: primary?.public_url ?? null,
    thumbnail_url: thumbnailUrl,
    preview_url: thumbnailUrl,
    files: cachedFiles,
    semantic_tags: asset.semantic_tags,
    dimensions: asset.dimensions,
    content_sha256: sha256,
    cached_at: now,
    published_to_r2: cloud,
    storage_provider: cloud ? "r2" : "local",
    storage: {
      provider: cloud ? "r2" : "local",
      runtime_prefix: runtimePrefix,
      manifest_url: null,
      manifest_object_key: manifestObjectKey,
      thumbnail_object_key: thumbnailObjectKey,
      source_metadata_object_key: cloud
        ? `metadata/ambientcg/resources/${resourceId}/source.json`
        : null,
      license_object_key: cloud
        ? `metadata/ambientcg/resources/${resourceId}/license.json`
        : null,
    },
  };

  if (cloud && manifestObjectKey) {
    const upload = await getR2RuntimeStorage().uploadBytes({
      body: JSON.stringify(resource),
      object_key: manifestObjectKey,
      content_type: "application/json; charset=utf-8",
      visibility: "public",
      cache_control: "public, max-age=300",
      metadata: {
        "asset-id": resourceId,
        "source-type": "ambientcg",
        "asset-type": asset.asset_type,
      },
    });
    resource.storage.manifest_url = upload.public_url;
  } else {
    await writeJsonFileAtomic(
      projectPath(
        AMBIENTCG_PUBLIC_RESOURCE_ROOT,
        typeSegment,
        sourceId,
        variantSegment,
        "resource.json",
      ),
      resource,
    );
  }

  const registry = await readAmbientCgResourceRegistry();
  await writeAmbientCgResourceRegistry({
    ...registry,
    updated_at: now,
    resources: [
      resource,
      ...registry.resources.filter(
        (item) => item.resource_id !== resource.resource_id,
      ),
    ],
  });

  return resource;
}

async function writeProvenance(
  asset: AmbientCgCatalogAsset,
  resource:
    | AmbientCgCachedMaterial
    | AmbientCgCachedHdri
    | AmbientCgCachedResource,
) {
  const reviewedAt =
    new Date().toISOString();
  const licenseRecord = {
    schema_version:
      "myway_asset_license_review_v1",
    review_id:
      `${resource.resource_id}_ambientcg_cc0_review_v1`,
    asset_id:
      resource.resource_id,
    decision:
      "approved_public_distribution",
    reviewed_by:
      "MyWay automated ambientCG CC0 intake policy",
    reviewed_at:
      reviewedAt,
    basis: [
      {
        label:
          "ambientCG asset record",
        url:
          asset.source_url,
        finding:
          "The selected downloadable asset and preview/source package are provided by ambientCG under CC0 1.0.",
      },
      {
        label:
          "ambientCG license",
        url:
          "https://ambientcg.com/license",
        finding:
          "ambientCG publishes its downloadable assets under CC0 1.0, allowing use, modification, commercial use, and redistribution without attribution.",
      },
    ],
    attestations: {
      reviewed_source_terms: true,
      production_use_allowed: true,
      public_raw_distribution_allowed: true,
      commercial_use_allowed: true,
      no_known_third_party_restrictions: true,
      generic_or_authorized_subject: true,
    },
    notes:
      `Cached ambientCG ${resource.asset_type} resource ${resource.resource_id}.`,
  };

  if (cloudAssetMetadataEnabled()) {
    const sourceStorage =
      getR2SourceStorage();

    await Promise.all([
      sourceStorage.uploadBytes({
        body:
          JSON.stringify(
            licenseRecord,
          ),
        object_key:
          `metadata/ambientcg/resources/${resource.resource_id}/license.json`,
        content_type:
          "application/json; charset=utf-8",
        visibility: "private",
        cache_control: "no-store",
      }),
      sourceStorage.uploadBytes({
        body:
          JSON.stringify(
            asset.source_record,
          ),
        object_key:
          `metadata/ambientcg/resources/${resource.resource_id}/source.json`,
        content_type:
          "application/json; charset=utf-8",
        visibility: "private",
        cache_control: "no-store",
      }),
    ]);

    return;
  }

  await ensureAmbientCgDirectories();

  await Promise.all([
    writeJsonFileAtomic(
      projectPath(
        "sandbox/probe-lab/assets/library/licenses",
        `${safeAmbientCgSegment(resource.resource_id)}.review.json`,
      ),
      licenseRecord,
    ),
    writeJsonFileAtomic(
      projectPath(
        "sandbox/probe-lab/assets/library/source-records",
        `${safeAmbientCgSegment(resource.resource_id)}.json`,
      ),
      asset.source_record,
    ),
  ]);
}

export async function markAmbientCgCatalogCached(
  asset: AmbientCgCatalogAsset,
  resourceId: string,
  published: boolean,
) {
  const catalog =
    await readAmbientCgCatalog();
  const now =
    new Date().toISOString();

  await writeAmbientCgCatalog({
    ...catalog,
    updated_at: now,
    assets:
      catalog.assets.map(
        (item) =>
          item.source_asset_id ===
          asset.source_asset_id
            ? {
                ...item,
                catalog_status:
                  published
                    ? "published"
                    : "cached",
                cached_resource_id:
                  resourceId,
                updated_at: now,
              }
            : item,
      ),
  });
}

export async function cacheAmbientCgAsset(input: {
  sourceAssetId: string;
  variantId?: string;
}) {
  const catalog =
    await readAmbientCgCatalog();
  const asset =
    catalog.assets.find(
      (item) =>
        item.source_asset_id ===
        input.sourceAssetId,
    );

  if (!asset) {
    throw new Error(
      "ambientCG asset was not found in the catalog. Sync the catalog first.",
    );
  }

  if (asset.asset_type === "3d-model") {
    throw new Error(
      "Use Import to Models for ambientCG 3D models.",
    );
  }

  if (asset.asset_type === "unknown") {
    throw new Error(
      "This ambientCG asset type is not recognized and cannot be cached automatically.",
    );
  }

  const variant =
    chooseAmbientCgVariant(
      asset,
      input.variantId,
    );
  const jobId =
    randomUUID();
  const jobRoot =
    path.join(
      tmpdir(),
      "myway-ambientcg",
      jobId,
    );

  await mkdir(
    jobRoot,
    { recursive: true },
  );

  let job:
    AmbientCgDownloadJob = {
      job_id: jobId,
      source_asset_id:
        asset.source_asset_id,
      asset_type:
        asset.asset_type,
      variant_id:
        variant.variant_id,
      operation: "cache",
      status: "running",
      created_at:
        new Date().toISOString(),
      started_at:
        new Date().toISOString(),
      completed_at: null,
      downloaded_bytes: null,
      content_sha256: null,
      resource_id: null,
      storage_provider:
        cloudAssetMetadataEnabled()
          ? "r2"
          : "local",
      error: null,
    };

  await updateAmbientCgDownloadJob(job);

  await writeJsonFileAtomic(
    path.join(
      jobRoot,
      "request.json",
    ),
    {
      asset,
      variant,
    },
  );

  try {
    const prepared =
      await prepareAmbientCgDownloadedFiles(
        variant,
        jobRoot,
      );

    const resource =
      asset.asset_type === "material"
        ? await cacheMaterial(
            asset,
            variant,
            jobRoot,
            prepared.download.sha256,
            prepared.files,
          )
        : asset.asset_type === "hdri"
          ? await cacheHdri(
              asset,
              variant,
              jobRoot,
              prepared.download.sha256,
              prepared.files,
            )
          : await cacheGenericResource(
              asset as AmbientCgCatalogAsset & {
                asset_type: AmbientCgResourceAssetType;
              },
              variant,
              jobRoot,
              prepared.download.sha256,
              prepared.files,
              prepared.root,
            );

    await writeProvenance(
      asset,
      resource,
    );
    await markAmbientCgCatalogCached(
      asset,
      resource.resource_id,
      resource.published_to_r2,
    );

    job = {
      ...job,
      status: "complete",
      completed_at:
        new Date().toISOString(),
      downloaded_bytes:
        prepared.download.bytes,
      content_sha256:
        prepared.download.sha256,
      resource_id:
        resource.resource_id,
    };

    await updateAmbientCgDownloadJob(job);

    return {
      job,
      resource,
    };
  } catch (caught) {
    job = {
      ...job,
      status: "failed",
      completed_at:
        new Date().toISOString(),
      error:
        caught instanceof Error
          ? caught.message
          : String(caught),
    };

    await updateAmbientCgDownloadJob(job);
    throw caught;
  } finally {
    if (
      process.env.MYWAY_KEEP_ASSET_JOB_FILES !==
      "true"
    ) {
      await rm(
        jobRoot,
        {
          recursive: true,
          force: true,
        },
      ).catch(() => undefined);
    }
  }
}
