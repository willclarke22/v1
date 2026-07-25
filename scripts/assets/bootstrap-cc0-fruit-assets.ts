import { listMyWayAssets } from "../../sandbox/probe-lab/assets/asset-library.server";
import { acquireFromBlenderKit } from "../../sandbox/probe-lab/assets/providers/blenderkit-provider.server";

const fruitRequests = [
  {
    concept: "apple",
    aliases: ["whole apple", "red apple"],
    semanticTags: [
      "fruit",
      "food",
      "whole",
      "realistic",
      "botanical",
    ],
  },
  {
    concept: "banana",
    aliases: ["whole banana", "yellow banana"],
    semanticTags: [
      "fruit",
      "food",
      "whole",
      "realistic",
      "botanical",
    ],
  },
  {
    concept: "pineapple",
    aliases: ["whole pineapple"],
    semanticTags: [
      "fruit",
      "food",
      "whole",
      "realistic",
      "botanical",
    ],
  },
];

async function main() {
  const existing = await listMyWayAssets();
  const completed: Array<{
    concept: string;
    asset_id: string;
    display_name: string;
    license: string;
    public_path: string;
    license_record_path: string | null | undefined;
  }> = [];
  const failures: Array<{
    concept: string;
    error: string;
  }> = [];

  for (const request of fruitRequests) {
    const alreadyPresent = existing.find(
      (asset) =>
        asset.canonical_label === request.concept &&
        asset.source_type === "blenderkit" &&
        asset.license_kind === "cc0",
    );

    if (alreadyPresent) {
      completed.push({
        concept: request.concept,
        asset_id: alreadyPresent.asset_id,
        display_name: alreadyPresent.display_name,
        license: alreadyPresent.license_kind,
        public_path: alreadyPresent.public_path,
        license_record_path:
          alreadyPresent.license_record_path,
      });
      continue;
    }

    try {
      const result = await acquireFromBlenderKit({
        ...request,
        domain: "food",
        targetExtentM: 1,
        requiredLicenseKind: "cc0",
      });

      completed.push({
        concept: request.concept,
        asset_id: result.asset.asset_id,
        display_name: result.asset.display_name,
        license: result.asset.license_kind,
        public_path: result.asset.public_path,
        license_record_path:
          result.asset.license_record_path,
      });
    } catch (caught) {
      failures.push({
        concept: request.concept,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        completed,
        failures,
        next:
          "Open http://localhost:3000/sandbox/probe-lab/asset-library, inspect each model, and use its Upload to Cloudflare R2 button only when the visual is acceptable.",
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
