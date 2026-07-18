import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import {
  assetWithFileStats,
  listMyWayAssets,
  updateMyWayAsset,
} from "../../sandbox/probe-lab/assets/asset-library.server";
import { projectPath } from "../../sandbox/probe-lab/assets/paths.server";
import { acquireFromBlenderKit } from "../../sandbox/probe-lab/assets/providers/blenderkit-provider.server";

loadEnvConfig(process.cwd());

type CatalogItem = {
  label: string;
  queries: string[];
  aliases: string[];
  tags: string[];
  domain: string;
  targetExtentM: number;
};

type ImportedItem = {
  label: string;
  query: string;
  asset_id: string;
  source_asset_id: string | null | undefined;
  display_name: string;
  domain: string;
  polygon_count: number | null | undefined;
  file_size_bytes: number | null;
  public_path: string;
  license_record_path: string | null | undefined;
};

type FailedItem = {
  label: string;
  queries: string[];
  errors: string[];
};

const CATALOG: CatalogItem[] = [
  { label: "small house", queries: ["small house", "suburban house", "family house"], aliases: ["home", "residential house"], tags: ["building", "architecture", "neighborhood"], domain: "architecture", targetExtentM: 4 },
  { label: "passenger car", queries: ["generic car", "passenger car", "compact car"], aliases: ["automobile", "road car"], tags: ["vehicle", "transportation", "mechanics"], domain: "engineering", targetExtentM: 4 },
  { label: "vacuum cleaner", queries: ["vacuum cleaner", "upright vacuum", "household vacuum"], aliases: ["vacuum", "floor cleaner"], tags: ["appliance", "home", "cleaning"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "toaster", queries: ["toaster", "two slice toaster", "kitchen toaster"], aliases: ["bread toaster"], tags: ["appliance", "kitchen", "home"], domain: "everyday_objects", targetExtentM: 0.4 },
  { label: "electric kettle", queries: ["electric kettle", "kitchen kettle", "tea kettle"], aliases: ["water kettle"], tags: ["appliance", "kitchen", "home"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "refrigerator", queries: ["refrigerator", "fridge", "kitchen refrigerator"], aliases: ["fridge"], tags: ["appliance", "kitchen", "food storage"], domain: "everyday_objects", targetExtentM: 1.9 },
  { label: "washing machine", queries: ["washing machine", "front load washer", "laundry washer"], aliases: ["clothes washer"], tags: ["appliance", "laundry", "home"], domain: "everyday_objects", targetExtentM: 1.1 },
  { label: "microwave oven", queries: ["microwave oven", "kitchen microwave", "microwave"], aliases: ["microwave"], tags: ["appliance", "kitchen", "home"], domain: "everyday_objects", targetExtentM: 0.7 },
  { label: "couch", queries: ["couch", "sofa", "living room sofa"], aliases: ["sofa", "settee"], tags: ["furniture", "home", "living room"], domain: "everyday_objects", targetExtentM: 2.4 },
  { label: "armchair", queries: ["armchair", "reading chair", "living room chair"], aliases: ["chair", "lounge chair"], tags: ["furniture", "home", "living room"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "coffee table", queries: ["coffee table", "small table", "living room table"], aliases: ["low table"], tags: ["furniture", "home", "living room"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "bookshelf", queries: ["bookshelf", "bookcase", "wooden bookshelf"], aliases: ["shelf"], tags: ["furniture", "books", "home"], domain: "everyday_objects", targetExtentM: 2 },
  { label: "desk lamp", queries: ["desk lamp", "table lamp", "study lamp"], aliases: ["lamp", "reading lamp"], tags: ["lighting", "desk", "home"], domain: "everyday_objects", targetExtentM: 0.7 },
  { label: "bed", queries: ["single bed", "bed", "bedroom bed"], aliases: ["sleeping bed"], tags: ["furniture", "bedroom", "home"], domain: "everyday_objects", targetExtentM: 2.2 },
  { label: "bicycle", queries: ["bicycle", "city bicycle", "generic bike"], aliases: ["bike"], tags: ["vehicle", "transportation", "wheels"], domain: "engineering", targetExtentM: 1.8 },
  { label: "city bus", queries: ["city bus", "public bus", "transit bus"], aliases: ["bus"], tags: ["vehicle", "transportation", "public transit"], domain: "engineering", targetExtentM: 4 },
  { label: "delivery van", queries: ["delivery van", "cargo van", "generic van"], aliases: ["van"], tags: ["vehicle", "transportation", "cargo"], domain: "engineering", targetExtentM: 4 },
  { label: "small boat", queries: ["small boat", "rowboat", "generic boat"], aliases: ["boat", "watercraft"], tags: ["vehicle", "water", "transportation"], domain: "engineering", targetExtentM: 3 },
  { label: "traffic cone", queries: ["traffic cone", "road cone", "safety cone"], aliases: ["road marker"], tags: ["road", "safety", "transportation"], domain: "civics", targetExtentM: 0.8 },
  { label: "mailbox", queries: ["mailbox", "residential mailbox", "postal box"], aliases: ["letter box"], tags: ["mail", "neighborhood", "everyday object"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "fire hydrant", queries: ["fire hydrant", "street hydrant", "water hydrant"], aliases: ["hydrant"], tags: ["street", "water", "safety"], domain: "civics", targetExtentM: 1 },
  { label: "park bench", queries: ["park bench", "outdoor bench", "wooden bench"], aliases: ["bench"], tags: ["park", "furniture", "outdoors"], domain: "everyday_objects", targetExtentM: 1.8 },
  { label: "trash can", queries: ["trash can", "garbage bin", "waste bin"], aliases: ["garbage can", "rubbish bin"], tags: ["waste", "cleaning", "home"], domain: "everyday_objects", targetExtentM: 0.8 },
  { label: "wheelbarrow", queries: ["wheelbarrow", "garden wheelbarrow", "construction wheelbarrow"], aliases: ["barrow"], tags: ["garden", "tool", "wheel"], domain: "engineering", targetExtentM: 1.3 },
  { label: "lawn mower", queries: ["lawn mower", "push mower", "garden mower"], aliases: ["grass mower"], tags: ["garden", "machine", "home"], domain: "engineering", targetExtentM: 1.2 },
  { label: "garden shovel", queries: ["garden shovel", "shovel", "spade"], aliases: ["spade"], tags: ["garden", "tool", "digging"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "ladder", queries: ["step ladder", "ladder", "household ladder"], aliases: ["stepladder"], tags: ["tool", "home", "height"], domain: "everyday_objects", targetExtentM: 2 },
  { label: "hammer", queries: ["claw hammer", "hammer", "carpenter hammer"], aliases: ["hand hammer"], tags: ["tool", "construction", "mechanics"], domain: "engineering", targetExtentM: 0.4 },
  { label: "wrench", queries: ["wrench", "spanner", "adjustable wrench"], aliases: ["spanner"], tags: ["tool", "mechanics", "repair"], domain: "engineering", targetExtentM: 0.35 },
  { label: "power drill", queries: ["power drill", "electric drill", "hand drill"], aliases: ["drill"], tags: ["tool", "construction", "repair"], domain: "engineering", targetExtentM: 0.45 },
  { label: "toolbox", queries: ["toolbox", "tool box", "portable toolbox"], aliases: ["tool case"], tags: ["tool", "storage", "repair"], domain: "engineering", targetExtentM: 0.6 },
  { label: "suitcase", queries: ["suitcase", "travel suitcase", "rolling luggage"], aliases: ["luggage"], tags: ["travel", "container", "everyday object"], domain: "everyday_objects", targetExtentM: 0.8 },
  { label: "umbrella", queries: ["umbrella", "rain umbrella", "open umbrella"], aliases: ["rain shade"], tags: ["weather", "rain", "everyday object"], domain: "everyday_objects", targetExtentM: 1.1 },
  { label: "camping tent", queries: ["camping tent", "small tent", "outdoor tent"], aliases: ["tent"], tags: ["camping", "outdoors", "shelter"], domain: "everyday_objects", targetExtentM: 2.5 },
  { label: "guitar", queries: ["acoustic guitar", "guitar", "wooden guitar"], aliases: ["musical guitar"], tags: ["music", "instrument", "sound"], domain: "music", targetExtentM: 1 },
  { label: "soccer ball", queries: ["soccer ball", "football ball", "association football"], aliases: ["football"], tags: ["sport", "ball", "game"], domain: "physical_education", targetExtentM: 0.25 },
  { label: "basketball", queries: ["basketball", "basket ball"], aliases: ["sports ball"], tags: ["sport", "ball", "game"], domain: "physical_education", targetExtentM: 0.25 },
  { label: "skateboard", queries: ["skateboard", "street skateboard"], aliases: ["skate board"], tags: ["sport", "wheels", "recreation"], domain: "physical_education", targetExtentM: 0.8 },
  { label: "coffee mug", queries: ["coffee mug", "ceramic mug", "drinking mug"], aliases: ["mug", "cup"], tags: ["kitchen", "drink", "everyday object"], domain: "everyday_objects", targetExtentM: 0.18 },
  { label: "potted plant", queries: ["potted plant", "house plant", "indoor plant"], aliases: ["plant pot"], tags: ["plant", "home", "nature"], domain: "biology", targetExtentM: 0.8 },
  { label: "dog house", queries: ["dog house", "pet house", "small kennel"], aliases: ["kennel"], tags: ["pet", "building", "yard"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "shopping cart", queries: ["shopping cart", "grocery cart", "supermarket trolley"], aliases: ["shopping trolley"], tags: ["store", "wheels", "container"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "office chair", queries: ["office chair", "desk chair", "computer chair"], aliases: ["swivel chair"], tags: ["furniture", "office", "desk"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "computer monitor", queries: ["computer monitor", "desktop monitor", "display screen"], aliases: ["monitor", "screen"], tags: ["technology", "computer", "display"], domain: "technology", targetExtentM: 0.8 },
  { label: "headphones", queries: ["headphones", "over ear headphones", "audio headphones"], aliases: ["earphones"], tags: ["technology", "audio", "sound"], domain: "technology", targetExtentM: 0.4 },
  { label: "camera", queries: ["digital camera", "camera", "photo camera"], aliases: ["photography camera"], tags: ["technology", "photography", "optics"], domain: "technology", targetExtentM: 0.35 },
  { label: "electric fan", queries: ["electric fan", "desk fan", "household fan"], aliases: ["fan"], tags: ["appliance", "airflow", "rotation"], domain: "physics", targetExtentM: 0.7 },
  { label: "wall clock", queries: ["wall clock", "analog clock", "round clock"], aliases: ["clock"], tags: ["time", "measurement", "home"], domain: "mathematics", targetExtentM: 0.6 },
  { label: "broom", queries: ["broom", "household broom", "cleaning broom"], aliases: ["sweeping broom"], tags: ["cleaning", "home", "tool"], domain: "everyday_objects", targetExtentM: 1.3 },
  { label: "bucket", queries: ["bucket", "plastic bucket", "utility bucket"], aliases: ["pail"], tags: ["container", "cleaning", "tool"], domain: "everyday_objects", targetExtentM: 0.5 },
];

const STATE_PROJECT_PATH =
  "sandbox/probe-lab/assets/debug/bootstrap-20-random-cc0-assets-state.json";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

function normalizedLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: number) {
  const result = [...items];
  const random = seededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

async function saveState(state: Record<string, unknown>) {
  const statePath = projectPath(STATE_PROJECT_PATH);
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(
    statePath,
    `${JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

async function main() {
  const target = positiveInteger(argument("--target"), 20);
  const seedText = argument("--seed") ?? "random-everyday-batch-1";
  const seed = hashSeed(seedText);
  const dryRun = hasFlag("--dry-run");

  const existingAssets = await listMyWayAssets();
  const existingLabels = new Set(
    existingAssets
      .filter(
        (asset) =>
          asset.source_type === "blenderkit" &&
          asset.license_kind === "cc0" &&
          asset.status !== "rejected",
      )
      .map((asset) => normalizedLabel(asset.canonical_label)),
  );
  const excludedSourceAssetIds = new Set(
    existingAssets
      .filter(
        (asset) =>
          asset.source_type === "blenderkit" &&
          typeof asset.source_asset_id === "string" &&
          asset.source_asset_id.trim(),
      )
      .map((asset) => asset.source_asset_id!.trim()),
  );

  const randomizedCatalog = shuffled(CATALOG, seed);
  const pendingCatalog = randomizedCatalog.filter(
    (item) => !existingLabels.has(normalizedLabel(item.label)),
  );

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dry_run: true,
          target_new_assets: target,
          seed_text: seedText,
          seed,
          catalog_size: CATALOG.length,
          qualifying_existing_cc0_assets: existingLabels.size,
          pending_concepts: pendingCatalog.length,
          randomized_preview: pendingCatalog.slice(0, 25).map((item) => ({
            label: item.label,
            queries: item.queries,
            domain: item.domain,
          })),
          state_file: STATE_PROJECT_PATH,
          note:
            "The real run imports sequentially, accepts only exact CC0/cc_zero assets, and does not upload anything to Cloudflare R2.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const completed: ImportedItem[] = [];
  const skippedExisting: string[] = [];
  const failed: FailedItem[] = [];
  const startedAt = new Date().toISOString();

  for (const item of randomizedCatalog) {
    if (completed.length >= target) break;

    if (existingLabels.has(normalizedLabel(item.label))) {
      skippedExisting.push(item.label);
      continue;
    }

    const errors: string[] = [];
    let imported = false;

    for (const query of item.queries) {
      console.log(
        `\n[${completed.length + 1}/${target}] Searching CC0 BlendKit assets for "${item.label}" with query "${query}"...`,
      );

      try {
        const result = await acquireFromBlenderKit({
          concept: query,
          aliases: [
            item.label,
            ...item.aliases,
            ...item.queries.filter((candidate) => candidate !== query),
          ],
          semanticTags: item.tags,
          styleTags: ["generic", "reusable", "everyday"],
          domain: item.domain,
          targetExtentM: item.targetExtentM,
          requiredLicenseKind: "cc0",
          excludedSourceAssetIds: [...excludedSourceAssetIds],
        });

        if (result.asset.license_kind !== "cc0") {
          throw new Error(
            `Provider returned a non-CC0 asset: ${result.asset.license_kind}`,
          );
        }

        const updated = await updateMyWayAsset(result.asset.asset_id, {
          canonical_label: normalizedLabel(item.label),
          aliases: Array.from(
            new Set([
              ...result.asset.aliases,
              ...item.aliases,
              ...item.queries,
            ]),
          ),
          semantic_tags: Array.from(
            new Set([
              ...result.asset.semantic_tags,
              ...item.tags,
              item.label,
            ]),
          ),
          style_tags: Array.from(
            new Set([
              ...result.asset.style_tags,
              "generic",
              "reusable",
              "everyday",
            ]),
          ),
          domain: item.domain,
          notes:
            `${result.asset.notes ?? ""}`.trim() +
            `${result.asset.notes ? " " : ""}` +
            `Selected by the random-everyday CC0 batch for "${item.label}" using the BlendKit query "${query}".`,
        });

        const withStats = await assetWithFileStats(updated);

        completed.push({
          label: item.label,
          query,
          asset_id: updated.asset_id,
          source_asset_id: updated.source_asset_id,
          display_name: updated.display_name,
          domain: updated.domain,
          polygon_count: updated.polygon_count,
          file_size_bytes: withStats.file_stats.file_size_bytes ?? null,
          public_path: updated.public_path,
          license_record_path: updated.license_record_path,
        });

        existingLabels.add(normalizedLabel(item.label));
        if (updated.source_asset_id) {
          excludedSourceAssetIds.add(updated.source_asset_id);
        }

        imported = true;
        console.log(
          `Imported ${item.label}: ${updated.asset_id} (${updated.display_name})`,
        );

        await saveState({
          schema_version: "myway_random_cc0_asset_batch_state_v1",
          started_at: startedAt,
          seed_text: seedText,
          seed,
          target_new_assets: target,
          completed_count: completed.length,
          completed,
          skipped_existing: skippedExisting,
          failed,
        });
        break;
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        errors.push(`[${query}] ${message}`);
        console.error(
          `Failed query "${query}" for ${item.label}: ${message}`,
        );
      }
    }

    if (!imported) {
      failed.push({
        label: item.label,
        queries: item.queries,
        errors,
      });
      await saveState({
        schema_version: "myway_random_cc0_asset_batch_state_v1",
        started_at: startedAt,
        seed_text: seedText,
        seed,
        target_new_assets: target,
        completed_count: completed.length,
        completed,
        skipped_existing: skippedExisting,
        failed,
      });
    }
  }

  const reachedTarget = completed.length >= target;
  const finalResult = {
    ok: reachedTarget,
    target_new_assets: target,
    imported_new_assets: completed.length,
    skipped_existing_count: skippedExisting.length,
    failed_concepts: failed.length,
    catalog_size: CATALOG.length,
    seed_text: seedText,
    seed,
    completed,
    failed,
    state_file: STATE_PROJECT_PATH,
    next:
      "Review the local assets at http://localhost:3000/sandbox/probe-lab/asset-library. Upload only approved models to Cloudflare R2.",
    resumable:
      "Stop with Ctrl+C and run the same command again. Existing CC0 concepts and source IDs are skipped.",
  };

  await saveState({
    schema_version: "myway_random_cc0_asset_batch_state_v1",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ...finalResult,
  });

  console.log(`\n${JSON.stringify(finalResult, null, 2)}`);
  if (!reachedTarget) process.exitCode = 1;
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.stack ?? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
