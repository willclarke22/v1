
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { writeJsonFileAtomic } from "../../json-file.server";
import { projectPath } from "../../paths.server";
import type {
  AmbientCgCachedHdri,
  AmbientCgCachedMaterial,
  AmbientCgCatalogAsset,
  AmbientCgDownloadJob,
  AmbientCgDownloadVariant,
  AmbientCgMaterialMaps,
} from "./ambientcg-types";
import {
  AMBIENTCG_JOB_ROOT,
  AMBIENTCG_PUBLIC_HDRI_ROOT,
  AMBIENTCG_PUBLIC_MATERIAL_ROOT,
  ensureAmbientCgDirectories,
  readAmbientCgCatalog,
  readAmbientCgDownloadJobs,
  readAmbientCgHdriRegistry,
  readAmbientCgMaterialRegistry,
  writeAmbientCgCatalog,
  writeAmbientCgDownloadJobs,
  writeAmbientCgHdriRegistry,
  writeAmbientCgMaterialRegistry,
} from "./ambientcg-store.server";

const execFileAsync = promisify(execFile);
const MAX_DOWNLOAD_BYTES = Number(
  process.env.MYWAY_AMBIENTCG_MAX_DOWNLOAD_BYTES ?? 600 * 1024 * 1024,
);
const DOWNLOAD_TIMEOUT_MS = Number(
  process.env.MYWAY_AMBIENTCG_DOWNLOAD_TIMEOUT_MS ?? 300_000,
);

function safeSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!sanitized) throw new Error("A safe asset identifier could not be created.");
  return sanitized;
}

function publicUrl(projectPublicPath: string) {
  return `/${projectPublicPath.replace(/^public[\\/]/, "").replace(/\\/g, "/")}`;
}

async function updateJob(job: AmbientCgDownloadJob) {
  const registry = await readAmbientCgDownloadJobs();
  const next = [job, ...registry.jobs.filter((item) => item.job_id !== job.job_id)].slice(0, 200);
  await writeAmbientCgDownloadJobs({
    ...registry,
    updated_at: new Date().toISOString(),
    jobs: next,
  });
}

async function downloadFile(url: string, destination: string) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "MyWay-AmbientCG-Cache/1.0" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}.`);
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > MAX_DOWNLOAD_BYTES) {
        throw new Error(`Download is ${declared} bytes, above the configured limit of ${MAX_DOWNLOAD_BYTES}.`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error("Downloaded file was empty.");
      if (buffer.length > MAX_DOWNLOAD_BYTES) {
        throw new Error(`Download is ${buffer.length} bytes, above the configured limit of ${MAX_DOWNLOAD_BYTES}.`);
      }
      await writeFile(destination, buffer);
      return { bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
    } catch (caught) {
      lastError = caught;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function extractArchive(archivePath: string, destination: string) {
  await mkdir(destination, { recursive: true });
  try {
    await execFileAsync("tar", ["-xf", archivePath, "-C", destination], {
      timeout: 180_000,
      windowsHide: true,
    });
    return;
  } catch (tarError) {
    if (process.platform !== "win32") throw tarError;
  }
  const command =
    "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force";
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command, archivePath, destination],
    { timeout: 180_000, windowsHide: true },
  );
}

async function listFilesRecursive(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await listFilesRecursive(full)));
    else if (entry.isFile()) output.push(full);
  }
  return output;
}

function mapRole(filename: string): keyof AmbientCgMaterialMaps | null {
  const name = filename.toLowerCase();
  if (/normalgl|normal[_-]?gl|nor[_-]?gl/.test(name)) return "normal_gl";
  if (/normaldx|normal[_-]?dx|nor[_-]?dx/.test(name)) return "normal_dx";
  if (/roughness|rough/.test(name)) return "roughness";
  if (/metalness|metallic|metal/.test(name)) return "metallic";
  if (/ambientocclusion|ambient[_-]?occlusion|[_-]ao(?:[-_.]|$)/.test(name)) return "ambient_occlusion";
  if (/displacement|height|disp/.test(name)) return "height";
  if (/opacity|alpha|transparency/.test(name)) return "opacity";
  if (/emission|emissive/.test(name)) return "emission";
  if (/color|basecolor|base[_-]?color|albedo|diffuse/.test(name)) return "base_color";
  return null;
}

function imageExtension(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".tif", ".tiff", ".exr"].includes(extension)
    ? extension.replace(".jpeg", ".jpg")
    : null;
}

async function copyThumbnail(asset: AmbientCgCatalogAsset, destinationRoot: string) {
  const url = asset.thumbnail_urls[0] ?? asset.preview_urls[0];
  if (!url) return null;
  const extension = path.extname(new URL(url).pathname).toLowerCase() || ".jpg";
  const destination = path.join(destinationRoot, `thumbnail${extension}`);
  try {
    await downloadFile(url, destination);
    return publicUrl(path.relative(projectPath(), destination));
  } catch {
    return url;
  }
}

function chooseVariant(asset: AmbientCgCatalogAsset, variantId?: string) {
  if (!asset.download_variants.length) {
    throw new Error("This catalog entry has no downloadable variants in the mirrored API record.");
  }
  if (variantId) {
    const exact = asset.download_variants.find((item) => item.variant_id === variantId);
    if (!exact) throw new Error("The selected ambientCG download variant no longer exists.");
    return exact;
  }
  const preferred = asset.download_variants.find(
    (variant) =>
      variant.resolution === "1K" &&
      (asset.asset_type === "hdri"
        ? variant.file_format === "HDR"
        : variant.file_format === "JPG"),
  );
  return preferred ?? asset.download_variants[0];
}

async function prepareDownloadedFiles(
  variant: AmbientCgDownloadVariant,
  jobRoot: string,
) {
  const urlPath = new URL(variant.url).pathname;
  const extension = path.extname(urlPath).toLowerCase() || (variant.archive_format === "ZIP" ? ".zip" : ".bin");
  const downloadPath = path.join(jobRoot, `source${extension}`);
  const download = await downloadFile(variant.url, downloadPath);
  if (extension === ".zip" || variant.archive_format === "ZIP") {
    const extracted = path.join(jobRoot, "extracted");
    await extractArchive(downloadPath, extracted);
    return { files: await listFilesRecursive(extracted), download };
  }
  return { files: [downloadPath], download };
}

async function cacheMaterial(
  asset: AmbientCgCatalogAsset,
  variant: AmbientCgDownloadVariant,
  jobRoot: string,
  sha256: string,
  files: string[],
) {
  const sourceId = safeSegment(asset.source_asset_id);
  const variantSegment = safeSegment(`${variant.resolution ?? "native"}-${variant.file_format ?? "file"}`.toLowerCase());
  const projectRoot = path.join(AMBIENTCG_PUBLIC_MATERIAL_ROOT, sourceId, variantSegment);
  const destinationRoot = projectPath(projectRoot);
  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(destinationRoot, { recursive: true });

  const maps: AmbientCgMaterialMaps = {
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
  for (const file of files) {
    const extension = imageExtension(file);
    const role = extension ? mapRole(path.basename(file)) : null;
    if (!role || maps[role]) continue;
    const filename = `${role}${extension}`;
    const destination = path.join(destinationRoot, filename);
    await copyFile(file, destination);
    maps[role] = publicUrl(path.join(projectRoot, filename));
  }
  if (!maps.base_color) {
    throw new Error("The downloaded package did not contain a recognizable base-color map.");
  }

  const thumbnailUrl = await copyThumbnail(asset, destinationRoot);
  const now = new Date().toISOString();
  const resource: AmbientCgCachedMaterial = {
    resource_id: `ambientcg_material_${sourceId}_${variantSegment}`,
    source_asset_id: asset.source_asset_id,
    source_type: "ambientcg",
    asset_type: "material",
    display_name: asset.display_name,
    source_url: asset.source_url,
    license: "CC0-1.0",
    attribution_required: false,
    commercial_use_allowed: true,
    raw_distribution_allowed: true,
    resolution: variant.resolution,
    file_format: variant.file_format,
    variant_id: variant.variant_id,
    public_root: publicUrl(projectRoot),
    thumbnail_url: thumbnailUrl,
    maps,
    physical_dimensions: asset.dimensions,
    semantic_tags: asset.semantic_tags,
    content_sha256: sha256,
    cached_at: now,
    published_to_r2: false,
  };
  await writeJsonFileAtomic(path.join(destinationRoot, "material.json"), resource);
  const registry = await readAmbientCgMaterialRegistry();
  await writeAmbientCgMaterialRegistry({
    ...registry,
    updated_at: now,
    materials: [resource, ...registry.materials.filter((item) => item.resource_id !== resource.resource_id)],
  });
  return resource;
}

async function cacheHdri(
  asset: AmbientCgCatalogAsset,
  variant: AmbientCgDownloadVariant,
  sha256: string,
  files: string[],
) {
  const sourceId = safeSegment(asset.source_asset_id);
  const variantSegment = safeSegment(`${variant.resolution ?? "native"}-${variant.file_format ?? "file"}`.toLowerCase());
  const projectRoot = path.join(AMBIENTCG_PUBLIC_HDRI_ROOT, sourceId, variantSegment);
  const destinationRoot = projectPath(projectRoot);
  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(destinationRoot, { recursive: true });

  const environment = files
    .filter((file) => [".hdr", ".exr"].includes(path.extname(file).toLowerCase()))
    .sort((a, b) => path.basename(a).length - path.basename(b).length)[0];
  if (!environment) throw new Error("The downloaded HDRI package did not contain an .hdr or .exr file.");
  const extension = path.extname(environment).toLowerCase();
  const destination = path.join(destinationRoot, `environment${extension}`);
  await copyFile(environment, destination);
  const thumbnailUrl = await copyThumbnail(asset, destinationRoot);
  const now = new Date().toISOString();
  const resource: AmbientCgCachedHdri = {
    resource_id: `ambientcg_hdri_${sourceId}_${variantSegment}`,
    source_asset_id: asset.source_asset_id,
    source_type: "ambientcg",
    asset_type: "hdri",
    display_name: asset.display_name,
    source_url: asset.source_url,
    license: "CC0-1.0",
    attribution_required: false,
    commercial_use_allowed: true,
    raw_distribution_allowed: true,
    resolution: variant.resolution,
    file_format: variant.file_format ?? extension.slice(1).toUpperCase(),
    variant_id: variant.variant_id,
    environment_url: publicUrl(path.join(projectRoot, `environment${extension}`)),
    thumbnail_url: thumbnailUrl,
    semantic_tags: asset.semantic_tags,
    content_sha256: sha256,
    cached_at: now,
    published_to_r2: false,
  };
  await writeJsonFileAtomic(path.join(destinationRoot, "environment.json"), resource);
  const registry = await readAmbientCgHdriRegistry();
  await writeAmbientCgHdriRegistry({
    ...registry,
    updated_at: now,
    hdris: [resource, ...registry.hdris.filter((item) => item.resource_id !== resource.resource_id)],
  });
  return resource;
}

async function writeProvenance(asset: AmbientCgCatalogAsset, resource: AmbientCgCachedMaterial | AmbientCgCachedHdri) {
  const licenseFile = projectPath(
    "sandbox/probe-lab/assets/library/licenses",
    `${safeSegment(resource.resource_id)}.review.json`,
  );
  const sourceFile = projectPath(
    "sandbox/probe-lab/assets/library/source-records",
    `${safeSegment(resource.resource_id)}.json`,
  );
  await writeJsonFileAtomic(licenseFile, {
    schema_version: "myway_asset_license_review_v1",
    review_id: `${resource.resource_id}_ambientcg_cc0_review_v1`,
    asset_id: resource.resource_id,
    decision: "approved_public_distribution",
    source: "ambientcg",
    source_asset_id: asset.source_asset_id,
    source_url: asset.source_url,
    license: "CC0-1.0",
    raw_distribution_allowed: true,
    commercial_use_allowed: true,
    attribution_required: false,
    verified_at: new Date().toISOString(),
    basis: "ambientCG states that all downloadable asset files and preview renders are CC0 1.0.",
  });
  await writeJsonFileAtomic(sourceFile, asset.source_record);
}

async function markCatalogCached(asset: AmbientCgCatalogAsset, resourceId: string) {
  const catalog = await readAmbientCgCatalog();
  const now = new Date().toISOString();
  await writeAmbientCgCatalog({
    ...catalog,
    updated_at: now,
    assets: catalog.assets.map((item) =>
      item.source_asset_id === asset.source_asset_id
        ? { ...item, catalog_status: "cached", cached_resource_id: resourceId, updated_at: now }
        : item,
    ),
  });
}

export async function cacheAmbientCgAsset(input: {
  sourceAssetId: string;
  variantId?: string;
}) {
  await ensureAmbientCgDirectories();
  const catalog = await readAmbientCgCatalog();
  const asset = catalog.assets.find((item) => item.source_asset_id === input.sourceAssetId);
  if (!asset) throw new Error("ambientCG asset was not found in the local catalog. Sync the catalog first.");
  if (asset.asset_type !== "material" && asset.asset_type !== "hdri") {
    throw new Error("Phase 1 caching currently supports ambientCG materials and HDRIs only.");
  }
  const variant = chooseVariant(asset, input.variantId);
  const jobId = randomUUID();
  const jobRoot = projectPath(AMBIENTCG_JOB_ROOT, jobId);
  await mkdir(jobRoot, { recursive: true });
  let job: AmbientCgDownloadJob = {
    job_id: jobId,
    source_asset_id: asset.source_asset_id,
    asset_type: asset.asset_type,
    variant_id: variant.variant_id,
    status: "running",
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: null,
    downloaded_bytes: null,
    content_sha256: null,
    resource_id: null,
    error: null,
  };
  await updateJob(job);
  await writeJsonFileAtomic(path.join(jobRoot, "request.json"), { asset, variant });

  try {
    const prepared = await prepareDownloadedFiles(variant, jobRoot);
    const resource = asset.asset_type === "material"
      ? await cacheMaterial(asset, variant, jobRoot, prepared.download.sha256, prepared.files)
      : await cacheHdri(asset, variant, prepared.download.sha256, prepared.files);
    await writeProvenance(asset, resource);
    await markCatalogCached(asset, resource.resource_id);
    job = {
      ...job,
      status: "complete",
      completed_at: new Date().toISOString(),
      downloaded_bytes: prepared.download.bytes,
      content_sha256: prepared.download.sha256,
      resource_id: resource.resource_id,
    };
    await updateJob(job);
    await writeJsonFileAtomic(path.join(jobRoot, "result.json"), { ok: true, job, resource });
    return { job, resource };
  } catch (caught) {
    job = {
      ...job,
      status: "failed",
      completed_at: new Date().toISOString(),
      error: caught instanceof Error ? caught.message : String(caught),
    };
    await updateJob(job);
    await writeJsonFileAtomic(path.join(jobRoot, "result.json"), { ok: false, job });
    throw caught;
  }
}
