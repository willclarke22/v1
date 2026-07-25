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

type CompletedItem = {
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
  // Food, plants, and natural objects.
  {
    label: "apple",
    queries: ["apple", "whole apple"],
    aliases: ["red apple", "green apple"],
    tags: ["fruit", "food", "plant", "biology"],
    domain: "biology",
    targetExtentM: 0.25,
  },
  {
    label: "banana",
    queries: ["banana", "whole banana"],
    aliases: ["yellow banana"],
    tags: ["fruit", "food", "plant", "biology"],
    domain: "biology",
    targetExtentM: 0.3,
  },
  {
    label: "pineapple",
    queries: ["pineapple", "whole pineapple"],
    aliases: ["pineapple fruit"],
    tags: ["fruit", "food", "plant", "biology"],
    domain: "biology",
    targetExtentM: 0.45,
  },
  {
    label: "orange",
    queries: ["orange fruit", "whole orange"],
    aliases: ["citrus orange"],
    tags: ["fruit", "food", "plant", "biology"],
    domain: "biology",
    targetExtentM: 0.25,
  },
  {
    label: "lemon",
    queries: ["lemon fruit", "whole lemon"],
    aliases: ["citrus lemon"],
    tags: ["fruit", "food", "plant", "biology"],
    domain: "biology",
    targetExtentM: 0.22,
  },
  {
    label: "strawberry",
    queries: ["strawberry", "whole strawberry"],
    aliases: ["strawberry fruit"],
    tags: ["fruit", "food", "plant", "biology"],
    domain: "biology",
    targetExtentM: 0.18,
  },
  {
    label: "tomato",
    queries: ["tomato", "whole tomato"],
    aliases: ["red tomato"],
    tags: ["fruit", "food", "plant", "biology"],
    domain: "biology",
    targetExtentM: 0.22,
  },
  {
    label: "carrot",
    queries: ["carrot", "whole carrot"],
    aliases: ["carrot vegetable"],
    tags: ["vegetable", "food", "plant", "biology"],
    domain: "biology",
    targetExtentM: 0.35,
  },
  {
    label: "broccoli",
    queries: ["broccoli", "broccoli vegetable"],
    aliases: ["broccoli head"],
    tags: ["vegetable", "food", "plant", "biology"],
    domain: "biology",
    targetExtentM: 0.35,
  },
  {
    label: "pumpkin",
    queries: ["pumpkin", "whole pumpkin"],
    aliases: ["pumpkin fruit"],
    tags: ["plant", "food", "biology"],
    domain: "biology",
    targetExtentM: 0.6,
  },
  {
    label: "mushroom",
    queries: ["mushroom", "forest mushroom"],
    aliases: ["fungus"],
    tags: ["fungus", "biology", "nature"],
    domain: "biology",
    targetExtentM: 0.3,
  },
  {
    label: "flower",
    queries: ["flower", "single flower"],
    aliases: ["blossom"],
    tags: ["plant", "botany", "biology", "nature"],
    domain: "biology",
    targetExtentM: 0.4,
  },
  {
    label: "leaf",
    queries: ["leaf", "green leaf"],
    aliases: ["plant leaf"],
    tags: ["plant", "botany", "biology", "nature"],
    domain: "biology",
    targetExtentM: 0.25,
  },
  {
    label: "tree",
    queries: ["tree", "deciduous tree"],
    aliases: ["whole tree"],
    tags: ["plant", "botany", "ecology", "nature"],
    domain: "biology",
    targetExtentM: 4,
  },
  {
    label: "cactus",
    queries: ["cactus", "desert cactus"],
    aliases: ["cactus plant"],
    tags: ["plant", "botany", "ecology", "nature"],
    domain: "biology",
    targetExtentM: 1.2,
  },
  {
    label: "rock",
    queries: ["rock", "single rock"],
    aliases: ["stone"],
    tags: ["geology", "earth science", "nature"],
    domain: "earth_science",
    targetExtentM: 0.8,
  },
  {
    label: "seashell",
    queries: ["seashell", "sea shell"],
    aliases: ["shell"],
    tags: ["ocean", "biology", "nature"],
    domain: "biology",
    targetExtentM: 0.25,
  },
  {
    label: "acorn",
    queries: ["acorn", "oak acorn"],
    aliases: ["oak seed"],
    tags: ["plant", "botany", "biology"],
    domain: "biology",
    targetExtentM: 0.12,
  },

  // Science and laboratory objects.
  {
    label: "microscope",
    queries: ["microscope", "laboratory microscope"],
    aliases: ["light microscope"],
    tags: ["laboratory", "science", "biology", "observation"],
    domain: "science",
    targetExtentM: 0.8,
  },
  {
    label: "telescope",
    queries: ["telescope", "astronomy telescope"],
    aliases: ["optical telescope"],
    tags: ["astronomy", "science", "observation"],
    domain: "astronomy",
    targetExtentM: 1.5,
  },
  {
    label: "beaker",
    queries: ["laboratory beaker", "glass beaker"],
    aliases: ["chemistry beaker"],
    tags: ["laboratory", "chemistry", "glassware"],
    domain: "chemistry",
    targetExtentM: 0.3,
  },
  {
    label: "test tube",
    queries: ["test tube", "laboratory test tube"],
    aliases: ["glass test tube"],
    tags: ["laboratory", "chemistry", "glassware"],
    domain: "chemistry",
    targetExtentM: 0.25,
  },
  {
    label: "laboratory flask",
    queries: ["laboratory flask", "erlenmeyer flask"],
    aliases: ["chemistry flask", "erlenmeyer"],
    tags: ["laboratory", "chemistry", "glassware"],
    domain: "chemistry",
    targetExtentM: 0.35,
  },
  {
    label: "petri dish",
    queries: ["petri dish", "laboratory petri dish"],
    aliases: ["culture dish"],
    tags: ["laboratory", "biology", "microbiology"],
    domain: "biology",
    targetExtentM: 0.22,
  },
  {
    label: "molecular model",
    queries: ["molecule model", "molecular model"],
    aliases: ["ball and stick molecule"],
    tags: ["chemistry", "molecule", "atoms", "science"],
    domain: "chemistry",
    targetExtentM: 0.8,
  },
  {
    label: "atom model",
    queries: ["atom model", "atomic model"],
    aliases: ["educational atom"],
    tags: ["physics", "chemistry", "atom", "science"],
    domain: "physics",
    targetExtentM: 0.8,
  },
  {
    label: "human skull",
    queries: ["human skull", "anatomical skull"],
    aliases: ["skull anatomy"],
    tags: ["anatomy", "biology", "skeleton"],
    domain: "anatomy",
    targetExtentM: 0.35,
  },
  {
    label: "human heart",
    queries: ["human heart anatomy", "anatomical heart"],
    aliases: ["heart anatomy"],
    tags: ["anatomy", "biology", "circulatory system"],
    domain: "anatomy",
    targetExtentM: 0.35,
  },
  {
    label: "human brain",
    queries: ["human brain anatomy", "anatomical brain"],
    aliases: ["brain anatomy"],
    tags: ["anatomy", "biology", "nervous system"],
    domain: "anatomy",
    targetExtentM: 0.35,
  },
  {
    label: "human skeleton",
    queries: ["human skeleton anatomy", "anatomical skeleton"],
    aliases: ["skeleton anatomy"],
    tags: ["anatomy", "biology", "bones"],
    domain: "anatomy",
    targetExtentM: 1.8,
  },
  {
    label: "magnet",
    queries: ["horseshoe magnet", "magnet"],
    aliases: ["bar magnet"],
    tags: ["physics", "magnetism", "force"],
    domain: "physics",
    targetExtentM: 0.3,
  },
  {
    label: "compass",
    queries: ["magnetic compass", "compass instrument"],
    aliases: ["navigation compass"],
    tags: ["physics", "magnetism", "navigation"],
    domain: "physics",
    targetExtentM: 0.25,
  },
  {
    label: "glass prism",
    queries: ["glass prism", "optical prism"],
    aliases: ["triangular prism"],
    tags: ["physics", "optics", "light"],
    domain: "physics",
    targetExtentM: 0.3,
  },

  // Classroom and communication objects.
  {
    label: "pencil",
    queries: ["pencil", "wooden pencil"],
    aliases: ["graphite pencil"],
    tags: ["classroom", "writing", "school"],
    domain: "education",
    targetExtentM: 0.25,
  },
  {
    label: "pen",
    queries: ["ballpoint pen", "pen"],
    aliases: ["writing pen"],
    tags: ["classroom", "writing", "school"],
    domain: "education",
    targetExtentM: 0.25,
  },
  {
    label: "notebook",
    queries: ["notebook", "school notebook"],
    aliases: ["exercise book"],
    tags: ["classroom", "writing", "school"],
    domain: "education",
    targetExtentM: 0.35,
  },
  {
    label: "book",
    queries: ["closed book", "book"],
    aliases: ["textbook"],
    tags: ["classroom", "reading", "school"],
    domain: "education",
    targetExtentM: 0.35,
  },
  {
    label: "ruler",
    queries: ["ruler", "school ruler"],
    aliases: ["measuring ruler"],
    tags: ["classroom", "measurement", "mathematics"],
    domain: "mathematics",
    targetExtentM: 0.35,
  },
  {
    label: "calculator",
    queries: ["calculator", "school calculator"],
    aliases: ["scientific calculator"],
    tags: ["classroom", "mathematics", "technology"],
    domain: "mathematics",
    targetExtentM: 0.25,
  },
  {
    label: "globe",
    queries: ["earth globe", "world globe"],
    aliases: ["classroom globe"],
    tags: ["geography", "earth", "classroom"],
    domain: "geography",
    targetExtentM: 0.8,
  },
  {
    label: "backpack",
    queries: ["school backpack", "backpack"],
    aliases: ["school bag"],
    tags: ["classroom", "school", "container"],
    domain: "education",
    targetExtentM: 0.6,
  },
  {
    label: "school desk",
    queries: ["school desk", "student desk"],
    aliases: ["classroom desk"],
    tags: ["classroom", "school", "furniture"],
    domain: "education",
    targetExtentM: 1.2,
  },
  {
    label: "chair",
    queries: ["wooden chair", "chair"],
    aliases: ["seat"],
    tags: ["furniture", "classroom", "home"],
    domain: "everyday_objects",
    targetExtentM: 1.2,
  },
  {
    label: "whiteboard",
    queries: ["classroom whiteboard", "whiteboard"],
    aliases: ["dry erase board"],
    tags: ["classroom", "teaching", "school"],
    domain: "education",
    targetExtentM: 2,
  },
  {
    label: "clock",
    queries: ["wall clock", "analog clock"],
    aliases: ["clock face"],
    tags: ["time", "classroom", "measurement"],
    domain: "mathematics",
    targetExtentM: 0.6,
  },
  {
    label: "eraser",
    queries: ["pencil eraser", "eraser"],
    aliases: ["rubber eraser"],
    tags: ["classroom", "writing", "school"],
    domain: "education",
    targetExtentM: 0.12,
  },
  {
    label: "paintbrush",
    queries: ["paintbrush", "artist paint brush"],
    aliases: ["art brush"],
    tags: ["art", "classroom", "painting"],
    domain: "art",
    targetExtentM: 0.35,
  },
  {
    label: "protractor",
    queries: ["protractor", "school protractor"],
    aliases: ["angle protractor"],
    tags: ["mathematics", "geometry", "measurement"],
    domain: "mathematics",
    targetExtentM: 0.3,
  },

  // Computing and media.
  {
    label: "laptop",
    queries: ["generic laptop", "laptop computer"],
    aliases: ["notebook computer"],
    tags: ["technology", "computer", "education"],
    domain: "technology",
    targetExtentM: 0.6,
  },
  {
    label: "computer keyboard",
    queries: ["computer keyboard", "keyboard"],
    aliases: ["typing keyboard"],
    tags: ["technology", "computer", "input device"],
    domain: "technology",
    targetExtentM: 0.55,
  },
  {
    label: "computer mouse",
    queries: ["computer mouse", "mouse device"],
    aliases: ["computer pointing device"],
    tags: ["technology", "computer", "input device"],
    domain: "technology",
    targetExtentM: 0.2,
  },
  {
    label: "computer monitor",
    queries: ["computer monitor", "desktop monitor"],
    aliases: ["display screen"],
    tags: ["technology", "computer", "display"],
    domain: "technology",
    targetExtentM: 0.8,
  },
  {
    label: "smartphone",
    queries: ["generic smartphone", "mobile phone"],
    aliases: ["cell phone"],
    tags: ["technology", "communication", "computer"],
    domain: "technology",
    targetExtentM: 0.2,
  },
  {
    label: "camera",
    queries: ["digital camera", "camera"],
    aliases: ["photography camera"],
    tags: ["technology", "photography", "optics"],
    domain: "technology",
    targetExtentM: 0.35,
  },
  {
    label: "speaker",
    queries: ["audio speaker", "loudspeaker"],
    aliases: ["sound speaker"],
    tags: ["technology", "audio", "sound"],
    domain: "technology",
    targetExtentM: 0.5,
  },
  {
    label: "headphones",
    queries: ["headphones", "over ear headphones"],
    aliases: ["audio headphones"],
    tags: ["technology", "audio", "sound"],
    domain: "technology",
    targetExtentM: 0.4,
  },
  {
    label: "microphone",
    queries: ["microphone", "studio microphone"],
    aliases: ["audio microphone"],
    tags: ["technology", "audio", "sound"],
    domain: "technology",
    targetExtentM: 0.4,
  },
  {
    label: "robot",
    queries: ["educational robot", "small robot"],
    aliases: ["robot model"],
    tags: ["technology", "robotics", "engineering"],
    domain: "engineering",
    targetExtentM: 1,
  },
  {
    label: "drone",
    queries: ["quadcopter drone", "drone"],
    aliases: ["quadcopter"],
    tags: ["technology", "flight", "engineering"],
    domain: "engineering",
    targetExtentM: 0.8,
  },
  {
    label: "circuit board",
    queries: ["circuit board", "printed circuit board"],
    aliases: ["PCB"],
    tags: ["technology", "electronics", "circuits"],
    domain: "electronics",
    targetExtentM: 0.4,
  },
  {
    label: "battery",
    queries: ["battery", "electric battery"],
    aliases: ["cell battery"],
    tags: ["technology", "electricity", "energy"],
    domain: "physics",
    targetExtentM: 0.25,
  },
  {
    label: "light bulb",
    queries: ["light bulb", "electric light bulb"],
    aliases: ["lamp bulb"],
    tags: ["technology", "electricity", "light"],
    domain: "physics",
    targetExtentM: 0.3,
  },
  {
    label: "electric fan",
    queries: ["electric fan", "desk fan"],
    aliases: ["fan"],
    tags: ["technology", "airflow", "rotation"],
    domain: "physics",
    targetExtentM: 0.6,
  },

  // Mechanics, forces, and transportation.
  {
    label: "gear",
    queries: ["mechanical gear", "single gear"],
    aliases: ["cogwheel"],
    tags: ["mechanics", "rotation", "machine"],
    domain: "physics",
    targetExtentM: 0.45,
  },
  {
    label: "pulley",
    queries: ["mechanical pulley", "pulley wheel"],
    aliases: ["simple pulley"],
    tags: ["mechanics", "force", "simple machine"],
    domain: "physics",
    targetExtentM: 0.5,
  },
  {
    label: "wheel",
    queries: ["vehicle wheel", "wheel"],
    aliases: ["tire and rim"],
    tags: ["mechanics", "rotation", "transportation"],
    domain: "physics",
    targetExtentM: 0.8,
  },
  {
    label: "coil spring",
    queries: ["coil spring", "compression spring"],
    aliases: ["mechanical spring"],
    tags: ["mechanics", "elasticity", "force"],
    domain: "physics",
    targetExtentM: 0.4,
  },
  {
    label: "engine piston",
    queries: ["engine piston", "piston connecting rod"],
    aliases: ["piston"],
    tags: ["mechanics", "engine", "motion"],
    domain: "engineering",
    targetExtentM: 0.6,
  },
  {
    label: "engine block",
    queries: ["car engine", "engine block"],
    aliases: ["combustion engine"],
    tags: ["mechanics", "engine", "machine"],
    domain: "engineering",
    targetExtentM: 1.5,
  },
  {
    label: "crankshaft",
    queries: ["engine crankshaft", "crankshaft"],
    aliases: ["crank shaft"],
    tags: ["mechanics", "engine", "rotation"],
    domain: "engineering",
    targetExtentM: 1,
  },
  {
    label: "propeller",
    queries: ["propeller", "airplane propeller"],
    aliases: ["rotating propeller"],
    tags: ["mechanics", "rotation", "flight"],
    domain: "physics",
    targetExtentM: 1.2,
  },
  {
    label: "bicycle",
    queries: ["bicycle", "generic bicycle"],
    aliases: ["bike"],
    tags: ["transportation", "mechanics", "wheels"],
    domain: "engineering",
    targetExtentM: 1.8,
  },
  {
    label: "car",
    queries: ["generic car", "passenger car"],
    aliases: ["automobile"],
    tags: ["transportation", "mechanics", "vehicle"],
    domain: "engineering",
    targetExtentM: 4,
  },
  {
    label: "airplane",
    queries: ["generic airplane", "passenger airplane"],
    aliases: ["aeroplane"],
    tags: ["transportation", "flight", "vehicle"],
    domain: "engineering",
    targetExtentM: 4,
  },
  {
    label: "boat",
    queries: ["small boat", "generic boat"],
    aliases: ["watercraft"],
    tags: ["transportation", "water", "vehicle"],
    domain: "engineering",
    targetExtentM: 3,
  },
  {
    label: "train",
    queries: ["train locomotive", "generic train"],
    aliases: ["railway train"],
    tags: ["transportation", "rail", "vehicle"],
    domain: "engineering",
    targetExtentM: 4,
  },
  {
    label: "rocket",
    queries: ["space rocket", "generic rocket"],
    aliases: ["launch vehicle"],
    tags: ["space", "flight", "engineering"],
    domain: "astronomy",
    targetExtentM: 4,
  },
  {
    label: "traffic light",
    queries: ["traffic light", "road traffic signal"],
    aliases: ["traffic signal"],
    tags: ["transportation", "roads", "signals"],
    domain: "civics",
    targetExtentM: 2,
  },

  // Buildings, energy, and everyday environments.
  {
    label: "table",
    queries: ["wooden table", "table"],
    aliases: ["dining table"],
    tags: ["furniture", "home", "everyday object"],
    domain: "everyday_objects",
    targetExtentM: 1.8,
  },
  {
    label: "lamp",
    queries: ["desk lamp", "lamp"],
    aliases: ["table lamp"],
    tags: ["home", "light", "everyday object"],
    domain: "everyday_objects",
    targetExtentM: 0.7,
  },
  {
    label: "bookshelf",
    queries: ["bookshelf", "bookcase"],
    aliases: ["shelf"],
    tags: ["furniture", "books", "home"],
    domain: "everyday_objects",
    targetExtentM: 2,
  },
  {
    label: "couch",
    queries: ["couch", "sofa"],
    aliases: ["sofa"],
    tags: ["furniture", "home", "everyday object"],
    domain: "everyday_objects",
    targetExtentM: 2.4,
  },
  {
    label: "bed",
    queries: ["bed", "single bed"],
    aliases: ["bedroom bed"],
    tags: ["furniture", "home", "everyday object"],
    domain: "everyday_objects",
    targetExtentM: 2.2,
  },
  {
    label: "refrigerator",
    queries: ["refrigerator", "fridge"],
    aliases: ["fridge"],
    tags: ["home", "appliance", "food storage"],
    domain: "everyday_objects",
    targetExtentM: 1.9,
  },
  {
    label: "sink",
    queries: ["kitchen sink", "sink"],
    aliases: ["wash basin"],
    tags: ["home", "water", "plumbing"],
    domain: "everyday_objects",
    targetExtentM: 1,
  },
  {
    label: "door",
    queries: ["wooden door", "door"],
    aliases: ["entry door"],
    tags: ["building", "architecture", "home"],
    domain: "architecture",
    targetExtentM: 2.1,
  },
  {
    label: "window",
    queries: ["house window", "window frame"],
    aliases: ["building window"],
    tags: ["building", "architecture", "home"],
    domain: "architecture",
    targetExtentM: 1.5,
  },
  {
    label: "staircase",
    queries: ["staircase", "stairs"],
    aliases: ["stairs"],
    tags: ["building", "architecture", "structure"],
    domain: "architecture",
    targetExtentM: 3,
  },
  {
    label: "house",
    queries: ["small house", "generic house"],
    aliases: ["home building"],
    tags: ["building", "architecture", "community"],
    domain: "architecture",
    targetExtentM: 4,
  },
  {
    label: "bridge",
    queries: ["bridge", "beam bridge"],
    aliases: ["road bridge"],
    tags: ["structure", "engineering", "forces"],
    domain: "engineering",
    targetExtentM: 4,
  },
  {
    label: "solar panel",
    queries: ["solar panel", "photovoltaic panel"],
    aliases: ["PV panel"],
    tags: ["energy", "electricity", "renewable"],
    domain: "environmental_science",
    targetExtentM: 2,
  },
  {
    label: "wind turbine",
    queries: ["wind turbine", "wind generator"],
    aliases: ["windmill generator"],
    tags: ["energy", "rotation", "renewable"],
    domain: "environmental_science",
    targetExtentM: 4,
  },
  {
    label: "water tower",
    queries: ["water tower", "municipal water tower"],
    aliases: ["elevated water tank"],
    tags: ["water", "infrastructure", "community"],
    domain: "engineering",
    targetExtentM: 4,
  },
];

const STATE_PROJECT_PATH =
  "sandbox/probe-lab/assets/debug/bootstrap-50-cc0-useful-assets-state.json";

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

async function saveState(state: Record<string, unknown>) {
  const statePath = projectPath(STATE_PROJECT_PATH);
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(
    statePath,
    `${JSON.stringify(
      {
        ...state,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function main() {
  const target = positiveInteger(argument("--target"), 50);
  const dryRun = hasFlag("--dry-run");

  const initialAssets = await listMyWayAssets();
  const existingLabels = new Set(
    initialAssets
      .filter(
        (asset) =>
          asset.source_type === "blenderkit" &&
          asset.license_kind === "cc0" &&
          asset.status !== "rejected",
      )
      .map((asset) => normalizedLabel(asset.canonical_label)),
  );
  const excludedSourceAssetIds = new Set(
    initialAssets
      .filter(
        (asset) =>
          asset.source_type === "blenderkit" &&
          typeof asset.source_asset_id === "string" &&
          asset.source_asset_id.trim(),
      )
      .map((asset) => asset.source_asset_id!.trim()),
  );

  const pendingCatalog = CATALOG.filter(
    (item) => !existingLabels.has(normalizedLabel(item.label)),
  );

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dry_run: true,
          target_new_assets: target,
          catalog_size: CATALOG.length,
          qualifying_existing_cc0_assets: existingLabels.size,
          pending_concepts: pendingCatalog.length,
          first_20_pending: pendingCatalog
            .slice(0, 20)
            .map((item) => ({
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

  const completed: CompletedItem[] = [];
  const skippedExisting: string[] = [];
  const failed: FailedItem[] = [];
  const startedAt = new Date().toISOString();

  for (const item of CATALOG) {
    if (completed.length >= target) break;

    if (existingLabels.has(normalizedLabel(item.label))) {
      skippedExisting.push(item.label);
      continue;
    }

    const errors: string[] = [];
    let imported = false;

    for (const query of item.queries) {
      console.log(
        `\n[${completed.length + 1}/${target}] Searching CC0 BlendKit assets for "${item.label}" using query "${query}"...`,
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

        const updated = await updateMyWayAsset(
          result.asset.asset_id,
          {
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
            domain: item.domain,
            notes:
              `${result.asset.notes ?? ""}`.trim() +
              `${result.asset.notes ? " " : ""}` +
              `Selected by the resumable 50-useful-assets CC0 batch for the concept "${item.label}" using the BlendKit query "${query}".`,
          },
        );

        const withStats = await assetWithFileStats(updated);

        completed.push({
          label: item.label,
          query,
          asset_id: updated.asset_id,
          source_asset_id: updated.source_asset_id,
          display_name: updated.display_name,
          domain: updated.domain,
          polygon_count: updated.polygon_count,
          file_size_bytes:
            withStats.file_stats.file_size_bytes ?? null,
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
          schema_version:
            "myway_cc0_useful_asset_batch_state_v1",
          started_at: startedAt,
          target_new_assets: target,
          completed_count: completed.length,
          completed,
          skipped_existing: skippedExisting,
          failed,
          remaining_catalog_count:
            CATALOG.length -
            completed.length -
            skippedExisting.length -
            failed.length,
        });

        break;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : String(caught);

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
        schema_version:
          "myway_cc0_useful_asset_batch_state_v1",
        started_at: startedAt,
        target_new_assets: target,
        completed_count: completed.length,
        completed,
        skipped_existing: skippedExisting,
        failed,
        remaining_catalog_count:
          CATALOG.length -
          completed.length -
          skippedExisting.length -
          failed.length,
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
    completed,
    failed,
    state_file: STATE_PROJECT_PATH,
    next:
      "Review the local assets at http://localhost:3000/sandbox/probe-lab/asset-library. Upload only approved models to Cloudflare R2 using the page button.",
    resumable:
      "The registry is the source of truth. Stop with Ctrl+C at any point and run the same command again; existing CC0 concepts and source IDs are skipped.",
  };

  await saveState({
    schema_version:
      "myway_cc0_useful_asset_batch_state_v1",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ...finalResult,
  });

  console.log(`\n${JSON.stringify(finalResult, null, 2)}`);

  if (!reachedTarget) {
    process.exitCode = 1;
  }
}

main().catch((caught) => {
  console.error(
    caught instanceof Error ? caught.stack ?? caught.message : String(caught),
  );
  process.exitCode = 1;
});
