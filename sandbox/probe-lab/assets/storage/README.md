# MyWay Cloudflare R2 asset storage

MyWay keeps Blender and TRELLIS in the asset-production path, while the
runtime reads finished GLBs directly from object storage.

## Buckets

- `myway-runtime-assets`: public, browser-ready GLBs and thumbnails.
- `myway-source-archive`: private, optional raw/editable source files.

The exact bucket names are configurable in `.env.local`.

## Required environment variables

Copy the values from `.env.r2.example` into `.env.local`. Never commit the
access key or secret key.

## Public URL

`R2_PUBLIC_BASE_URL` must be either:

- the bucket's public `r2.dev` URL for initial testing; or
- a custom domain such as `https://assets.example.com` for production.

Do not use the S3 API endpoint as the browser-facing public URL.

## CORS

Apply `r2-cors.json` to the public runtime bucket. It allows public GET and
HEAD requests but does not allow browser uploads. Uploads use server-side
S3 credentials from the local promotion script.

## License safety

Public promotion requires a review record under:

`sandbox/probe-lab/assets/library/licenses/`

The code deliberately blocks:

- every asset without an approved review;
- BlendKit Royalty Free assets as standalone public GLBs;
- any review missing a required attestation.

A private source archive is not the same as approval for public
redistribution.

## Commands

Create an unapproved review template:

`pnpm exec tsx scripts/assets/create-myway-license-review.ts --asset-id ASSET_ID --reviewed-by "NAME"`

Check environment configuration:

`pnpm exec tsx scripts/assets/check-myway-r2.ts`

Promote an approved asset:

`pnpm exec tsx scripts/assets/promote-myway-asset-to-r2.ts --asset-id ASSET_ID --review-file REVIEW_JSON`

Add `--archive-source` only when the private source bucket is configured
and the asset's `source_path` should also be archived.

## Git policy

Commit:

- registry metadata;
- source/license records;
- application code.

Do not commit:

- R2 credentials;
- generated GLBs after their R2 URLs are verified;
- raw TRELLIS output;
- temporary Blender downloads and jobs.
