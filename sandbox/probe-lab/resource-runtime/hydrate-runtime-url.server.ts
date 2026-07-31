import {
  copyFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const MYWAY_PUBLIC_RUNTIME_ROOT =
  "/sandbox-assets/myway/";

export type RuntimeHydrationSource =
  | {
      kind: "remote";
      url: string;
    }
  | {
      kind: "local";
      file_path: string;
    };

export type RuntimeHydrationSourceOptions = {
  runtime_origin?: string;
  hosted_runtime?: boolean;
};

function isHostedRuntime(
  override: boolean | undefined,
) {
  if (typeof override === "boolean") {
    return override;
  }

  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.VERCEL_URL,
  );
}

function normalizeOrigin(
  value: string | undefined,
) {
  const candidate = value?.trim();

  if (!candidate) {
    return null;
  }

  const withProtocol =
    /^https?:\/\//i.test(candidate)
      ? candidate
      : `https://${candidate}`;
  const parsed = new URL(withProtocol);

  if (
    parsed.protocol !== "https:" &&
    parsed.protocol !== "http:"
  ) {
    throw new Error(
      "Runtime hydration origin must use HTTP or HTTPS.",
    );
  }

  return parsed.origin;
}

function normalizeRuntimeUrl(
  value: string,
) {
  const normalized = value
    .trim()
    .replace(/\\/g, "/");

  if (/^https:\/\//i.test(normalized)) {
    return normalized;
  }

  if (
    normalized.startsWith(
      MYWAY_PUBLIC_RUNTIME_ROOT,
    )
  ) {
    return normalized;
  }

  throw new Error(
    "Runtime hydration only accepts HTTPS or MyWay public asset URLs.",
  );
}

function localRuntimePath(
  publicUrl: string,
) {
  const relative = publicUrl.slice(
    MYWAY_PUBLIC_RUNTIME_ROOT.length,
  );
  const segments = relative
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      decodeURIComponent(segment),
    );

  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\"),
    )
  ) {
    throw new Error(
      "MyWay public asset URL contains an unsafe path segment.",
    );
  }

  return path.join(
    /* turbopackIgnore: true */
    process.cwd(),
    "public",
    "sandbox-assets",
    "myway",
    ...segments,
  );
}

export function resolveRuntimeHydrationSource(
  value: string,
  options: RuntimeHydrationSourceOptions = {},
): RuntimeHydrationSource {
  const normalized =
    normalizeRuntimeUrl(value);

  if (/^https:\/\//i.test(normalized)) {
    return {
      kind: "remote",
      url: normalized,
    };
  }

  if (
    isHostedRuntime(
      options.hosted_runtime,
    )
  ) {
    const origin = normalizeOrigin(
      options.runtime_origin ??
        process.env.VERCEL_URL ??
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
    );

    if (!origin) {
      throw new Error(
        "Hosted runtime hydration requires a deployment origin.",
      );
    }

    return {
      kind: "remote",
      url: `${origin}${normalized}`,
    };
  }

  return {
    kind: "local",
    file_path:
      localRuntimePath(normalized),
  };
}

export async function hydrateRuntimeUrlToFile(
  input: {
    public_url: string;
    destination: string;
    fetch_impl?: typeof fetch;
    runtime_origin?: string;
    hosted_runtime?: boolean;
    cache?: RequestCache;
    error_label: string;
  },
) {
  const source =
    resolveRuntimeHydrationSource(
      input.public_url,
      {
        runtime_origin:
          input.runtime_origin,
        hosted_runtime:
          input.hosted_runtime,
      },
    );

  if (source.kind === "local") {
    await copyFile(
      source.file_path,
      input.destination,
    );
    return source;
  }

  const response = await (
    input.fetch_impl ?? fetch
  )(source.url, {
    cache:
      input.cache ?? "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `${input.error_label} failed (${response.status} ${response.statusText}).`,
    );
  }

  await writeFile(
    input.destination,
    Buffer.from(
      await response.arrayBuffer(),
    ),
  );

  return source;
}
