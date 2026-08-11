import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import type {
  AssetStorageListObject,
  AssetStorageObject,
  AssetStorageProvider,
  AssetStorageUploadBytesInput,
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

function isNotFound(caught: unknown) {
  return (
    (caught as {
      name?: string;
      $metadata?: {
        httpStatusCode?: number;
      };
    }).name === "NoSuchKey" ||
    (caught as {
      $metadata?: {
        httpStatusCode?: number;
      };
    }).$metadata?.httpStatusCode === 404
  );
}

function bodyBuffer(
  body: AssetStorageUploadBytesInput["body"],
) {
  return typeof body === "string"
    ? Buffer.from(body, "utf8")
    : Buffer.from(body);
}

export function hasR2AssetStorageEnvironment() {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_RUNTIME_BUCKET_NAME?.trim() &&
      process.env.R2_SOURCE_BUCKET_NAME?.trim() &&
      process.env.R2_PUBLIC_BASE_URL?.trim(),
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

  function objectResult(input: {
    objectKey: string;
    sizeBytes: number;
    contentType: string;
    etag?: string | null;
  }): AssetStorageObject {
    return {
      provider: "r2",
      bucket: config.bucket,
      object_key: input.objectKey,
      public_url: publicUrl(input.objectKey),
      etag:
        typeof input.etag === "string"
          ? input.etag.replace(/^"|"$/g, "")
          : null,
      size_bytes: input.sizeBytes,
      content_type: input.contentType,
    };
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

      return objectResult({
        objectKey: input.object_key,
        sizeBytes: info.size,
        contentType: input.content_type,
        etag: result.ETag,
      });
    },

    async uploadBytes(
      input: AssetStorageUploadBytesInput,
    ): Promise<AssetStorageObject> {
      if (
        input.visibility !== config.visibility
      ) {
        throw new Error(
          `Storage visibility mismatch: provider=${config.visibility}, upload=${input.visibility}`,
        );
      }

      const body = bodyBuffer(input.body);
      const result = await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.object_key,
          Body: body,
          ContentLength: body.byteLength,
          ContentType: input.content_type,
          CacheControl: input.cache_control,
          Metadata: normalizeMetadata(
            input.metadata,
          ),
        }),
      );

      return objectResult({
        objectKey: input.object_key,
        sizeBytes: body.byteLength,
        contentType: input.content_type,
        etag: result.ETag,
      });
    },

    async read(objectKey: string) {
      try {
        const result = await client.send(
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: objectKey,
          }),
        );

        if (!result.Body) {
          return null;
        }

        const body = await result.Body.transformToByteArray();

        return {
          provider: "r2" as const,
          bucket: config.bucket,
          object_key: objectKey,
          body,
          etag:
            typeof result.ETag === "string"
              ? result.ETag.replace(/^"|"$/g, "")
              : null,
          size_bytes:
            typeof result.ContentLength === "number"
              ? result.ContentLength
              : body.byteLength,
          content_type: result.ContentType ?? null,
        };
      } catch (caught) {
        if (isNotFound(caught)) {
          return null;
        }
        throw caught;
      }
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
        if (isNotFound(caught)) {
          return false;
        }

        throw caught;
      }
    },

    async list(input = {}) {
      const output:
        AssetStorageListObject[] = [];
      let continuationToken:
        string | undefined;

      do {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: input.prefix,
            ContinuationToken:
              continuationToken,
          }),
        );

        for (const item of result.Contents ?? []) {
          if (!item.Key) continue;
          output.push({
            object_key:
              item.Key,
            size_bytes:
              item.Size ?? 0,
            etag:
              typeof item.ETag === "string"
                ? item.ETag.replace(/^"|"$/g, "")
                : null,
            last_modified:
              item.LastModified
                ? item.LastModified.toISOString()
                : null,
          });
        }

        continuationToken =
          result.IsTruncated
            ? result.NextContinuationToken
            : undefined;
      } while (continuationToken);

      return output;
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
