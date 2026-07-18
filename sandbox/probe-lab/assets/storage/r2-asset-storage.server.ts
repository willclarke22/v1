import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  NotFound,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import type {
  AssetStorageObject,
  AssetStorageProvider,
  AssetStorageUploadInput,
  AssetStorageVisibility,
} from "./asset-storage";

type R2StorageConfig = {
  account_id: string;
  access_key_id: string;
  secret_access_key: string;
  bucket: string;
  visibility: AssetStorageVisibility;
  public_base_url?: string | null;
};

function required(
  name: string,
  value: string | undefined,
) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(
      `${name} is missing from .env.local.`,
    );
  }

  return normalized;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/g, "");
}

function encodedObjectKey(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeMetadata(
  metadata: Record<string, string> | undefined,
) {
  if (!metadata) return undefined;

  return Object.fromEntries(
    Object.entries(metadata)
      .map(([key, value]) => [
        key
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-"),
        value.slice(0, 1024),
      ])
      .filter(([key]) => Boolean(key)),
  );
}

export function r2ConfigFromEnvironment(input: {
  bucket:
    | "runtime"
    | "source";
}): R2StorageConfig {
  const visibility =
    input.bucket === "runtime"
      ? "public"
      : "private";

  return {
    account_id: required(
      "R2_ACCOUNT_ID",
      process.env.R2_ACCOUNT_ID,
    ),
    access_key_id: required(
      "R2_ACCESS_KEY_ID",
      process.env.R2_ACCESS_KEY_ID,
    ),
    secret_access_key: required(
      "R2_SECRET_ACCESS_KEY",
      process.env.R2_SECRET_ACCESS_KEY,
    ),
    bucket:
      input.bucket === "runtime"
        ? required(
            "R2_RUNTIME_BUCKET_NAME",
            process.env.R2_RUNTIME_BUCKET_NAME,
          )
        : required(
            "R2_SOURCE_BUCKET_NAME",
            process.env.R2_SOURCE_BUCKET_NAME,
          ),
    visibility,
    public_base_url:
      visibility === "public"
        ? required(
            "R2_PUBLIC_BASE_URL",
            process.env.R2_PUBLIC_BASE_URL,
          )
        : null,
  };
}

export function createR2AssetStorage(
  config: R2StorageConfig,
): AssetStorageProvider {
  const endpoint =
    `https://${config.account_id}.` +
    "r2.cloudflarestorage.com";

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: config.access_key_id,
      secretAccessKey:
        config.secret_access_key,
    },
  });

  const publicBaseUrl =
    config.public_base_url
      ? normalizeBaseUrl(
          config.public_base_url,
        )
      : null;

  function publicUrl(objectKey: string) {
    if (
      config.visibility !== "public" ||
      !publicBaseUrl
    ) {
      return null;
    }

    return `${publicBaseUrl}/${encodedObjectKey(
      objectKey,
    )}`;
  }

  return {
    provider: "r2",
    bucket: config.bucket,
    visibility: config.visibility,

    async upload(
      input: AssetStorageUploadInput,
    ): Promise<AssetStorageObject> {
      if (
        input.visibility !== config.visibility
      ) {
        throw new Error(
          `Storage visibility mismatch: provider=${config.visibility}, upload=${input.visibility}`,
        );
      }

      const info = await stat(input.local_path);

      if (!info.isFile()) {
        throw new Error(
          `Upload input is not a file: ${input.local_path}`,
        );
      }

      const uploader = new Upload({
        client,
        leavePartsOnError: false,
        queueSize: 4,
        partSize: 8 * 1024 * 1024,
        params: {
          Bucket: config.bucket,
          Key: input.object_key,
          Body: createReadStream(
            input.local_path,
          ),
          ContentType: input.content_type,
          CacheControl: input.cache_control,
          Metadata: normalizeMetadata(
            input.metadata,
          ),
        },
      });

      const result = await uploader.done();

      return {
        provider: "r2",
        bucket: config.bucket,
        object_key: input.object_key,
        public_url: publicUrl(
          input.object_key,
        ),
        etag:
          typeof result.ETag === "string"
            ? result.ETag.replace(/^"|"$/g, "")
            : null,
        size_bytes: info.size,
        content_type: input.content_type,
      };
    },

    async exists(objectKey: string) {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: objectKey,
          }),
        );
        return true;
      } catch (caught) {
        if (
          caught instanceof NotFound ||
          (caught as {
            $metadata?: {
              httpStatusCode?: number;
            };
          }).$metadata?.httpStatusCode === 404
        ) {
          return false;
        }

        throw caught;
      }
    },

    async delete(objectKey: string) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
        }),
      );
    },
  };
}

export function getR2RuntimeStorage() {
  return createR2AssetStorage(
    r2ConfigFromEnvironment({
      bucket: "runtime",
    }),
  );
}

export function getR2SourceStorage() {
  return createR2AssetStorage(
    r2ConfigFromEnvironment({
      bucket: "source",
    }),
  );
}
