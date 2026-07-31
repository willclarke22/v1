import type {
  AmbientCgCachedHdri,
} from "../assets/catalog/ambientcg/ambientcg-types";
import {
  isReviewedRuntimeEnvironment,
  loadReviewedEnvironmentResolverSnapshot,
  type ReviewedEnvironmentResolverSnapshot,
} from "./reviewed-environment-resolver.server";
import {
  environmentFormatFromUrl,
} from "./environment-runtime-policy";
import type {
  RuntimeEnvironmentFormat,
} from "./environment-runtime-contract";

export const MAX_RUNTIME_ENVIRONMENT_BYTES =
  192 * 1024 * 1024;

export type ReviewedEnvironmentUrlMatch = {
  resource_id: string;
  public_url: string;
  object_key: string;
  format: RuntimeEnvironmentFormat;
  content_hash: string;
};

function matchFor(
  item: AmbientCgCachedHdri,
): ReviewedEnvironmentUrlMatch | null {
  if (
    !isReviewedRuntimeEnvironment(
      item,
    )
  ) {
    return null;
  }

  const format =
    environmentFormatFromUrl(
      item.environment_url,
    );

  if (
    !format ||
    !item.environment_object_key
  ) {
    return null;
  }

  return {
    resource_id: item.resource_id,
    public_url:
      item.environment_url,
    object_key:
      item.environment_object_key,
    format,
    content_hash:
      item.content_sha256,
  };
}

export function findReviewedEnvironmentByUrl(
  snapshot: ReviewedEnvironmentResolverSnapshot,
  requestedUrl: string,
): ReviewedEnvironmentUrlMatch | null {
  const normalized =
    requestedUrl.trim();

  if (
    !/^https:\/\//i.test(
      normalized,
    )
  ) {
    return null;
  }

  for (
    const item of
    snapshot.registry.hdris
  ) {
    const match =
      matchFor(item);
    if (
      match?.public_url ===
      normalized
    ) {
      return match;
    }
  }

  return null;
}

export async function resolveReviewedEnvironmentUrl(
  requestedUrl: string,
  options: {
    snapshot?: ReviewedEnvironmentResolverSnapshot;
  } = {},
) {
  const snapshot =
    options.snapshot ??
    (await loadReviewedEnvironmentResolverSnapshot());

  return findReviewedEnvironmentByUrl(
    snapshot,
    requestedUrl,
  );
}
