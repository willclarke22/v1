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

const EXTRA_CATALOG: CatalogItem[] = [
  { label: "air conditioner", queries: ["air conditioner", "window air conditioner", "AC unit"], aliases: ["air conditioning unit"], tags: ["appliance", "cooling", "home"], domain: "everyday_objects", targetExtentM: 1 },
  { label: "ceiling fan", queries: ["ceiling fan", "house ceiling fan"], aliases: ["overhead fan"], tags: ["appliance", "airflow", "home"], domain: "physics", targetExtentM: 1.4 },
  { label: "kitchen blender", queries: ["kitchen blender", "food blender"], aliases: ["countertop blender"], tags: ["appliance", "kitchen", "food"], domain: "everyday_objects", targetExtentM: 0.5 },
  { label: "coffee maker", queries: ["coffee maker", "drip coffee machine"], aliases: ["coffee machine"], tags: ["appliance", "kitchen", "drink"], domain: "everyday_objects", targetExtentM: 0.5 },
  { label: "dishwasher", queries: ["dishwasher", "kitchen dishwasher"], aliases: ["dish washing machine"], tags: ["appliance", "kitchen", "cleaning"], domain: "everyday_objects", targetExtentM: 1 },
  { label: "kitchen oven", queries: ["kitchen oven", "electric oven", "cooking oven"], aliases: ["oven"], tags: ["appliance", "kitchen", "cooking"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "kitchen cabinet", queries: ["kitchen cabinet", "cupboard cabinet"], aliases: ["cupboard"], tags: ["furniture", "kitchen", "storage"], domain: "everyday_objects", targetExtentM: 1.8 },
  { label: "dining table", queries: ["dining table", "kitchen table"], aliases: ["table"], tags: ["furniture", "kitchen", "home"], domain: "everyday_objects", targetExtentM: 1.8 },
  { label: "bar stool", queries: ["bar stool", "kitchen stool"], aliases: ["stool"], tags: ["furniture", "seat", "home"], domain: "everyday_objects", targetExtentM: 1 },
  { label: "dresser", queries: ["bedroom dresser", "drawer dresser"], aliases: ["chest of drawers"], tags: ["furniture", "bedroom", "storage"], domain: "everyday_objects", targetExtentM: 1.5 },
  { label: "nightstand", queries: ["nightstand", "bedside table"], aliases: ["bedside cabinet"], tags: ["furniture", "bedroom", "storage"], domain: "everyday_objects", targetExtentM: 0.8 },
  { label: "wall mirror", queries: ["wall mirror", "house mirror"], aliases: ["mirror"], tags: ["home", "reflection", "furniture"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "bathtub", queries: ["bathtub", "bath tub"], aliases: ["tub"], tags: ["bathroom", "water", "home"], domain: "everyday_objects", targetExtentM: 1.8 },
  { label: "toilet", queries: ["toilet", "bathroom toilet"], aliases: ["toilet fixture"], tags: ["bathroom", "plumbing", "home"], domain: "everyday_objects", targetExtentM: 1 },
  { label: "shower head", queries: ["shower head", "bathroom showerhead"], aliases: ["shower fixture"], tags: ["bathroom", "water", "plumbing"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "laundry basket", queries: ["laundry basket", "clothes basket"], aliases: ["washing basket"], tags: ["laundry", "container", "home"], domain: "everyday_objects", targetExtentM: 0.8 },
  { label: "clothes iron", queries: ["clothes iron", "electric iron"], aliases: ["laundry iron"], tags: ["appliance", "laundry", "home"], domain: "everyday_objects", targetExtentM: 0.35 },
  { label: "ironing board", queries: ["ironing board", "laundry ironing board"], aliases: ["pressing board"], tags: ["laundry", "furniture", "home"], domain: "everyday_objects", targetExtentM: 1.4 },
  { label: "hair dryer", queries: ["hair dryer", "blow dryer"], aliases: ["hairdryer"], tags: ["appliance", "bathroom", "airflow"], domain: "everyday_objects", targetExtentM: 0.35 },
  { label: "toothbrush", queries: ["toothbrush", "manual toothbrush"], aliases: ["tooth brush"], tags: ["bathroom", "hygiene", "everyday object"], domain: "everyday_objects", targetExtentM: 0.22 },
  { label: "soap dispenser", queries: ["soap dispenser", "liquid soap bottle"], aliases: ["soap pump"], tags: ["bathroom", "hygiene", "container"], domain: "everyday_objects", targetExtentM: 0.25 },
  { label: "backpack", queries: ["backpack", "school backpack", "travel backpack"], aliases: ["rucksack"], tags: ["bag", "travel", "container"], domain: "everyday_objects", targetExtentM: 0.65 },
  { label: "handbag", queries: ["handbag", "shoulder bag", "purse bag"], aliases: ["purse"], tags: ["bag", "fashion", "container"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "wallet", queries: ["wallet", "leather wallet"], aliases: ["billfold"], tags: ["personal item", "container", "everyday object"], domain: "everyday_objects", targetExtentM: 0.18 },
  { label: "sunglasses", queries: ["sunglasses", "sun glasses"], aliases: ["eyewear"], tags: ["fashion", "eyes", "everyday object"], domain: "everyday_objects", targetExtentM: 0.18 },
  { label: "baseball cap", queries: ["baseball cap", "sports cap"], aliases: ["hat"], tags: ["fashion", "sport", "clothing"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "running shoe", queries: ["running shoe", "sneaker shoe"], aliases: ["sneaker"], tags: ["clothing", "sport", "footwear"], domain: "everyday_objects", targetExtentM: 0.32 },
  { label: "work boot", queries: ["work boot", "leather boot"], aliases: ["boot"], tags: ["clothing", "tool", "footwear"], domain: "everyday_objects", targetExtentM: 0.35 },
  { label: "water bottle", queries: ["water bottle", "drinking bottle"], aliases: ["bottle"], tags: ["drink", "container", "everyday object"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "lunch box", queries: ["lunch box", "food lunchbox"], aliases: ["lunch container"], tags: ["food", "container", "school"], domain: "everyday_objects", targetExtentM: 0.35 },
  { label: "rolling pin", queries: ["rolling pin", "wooden rolling pin"], aliases: ["baking roller"], tags: ["kitchen", "baking", "tool"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "frying pan", queries: ["frying pan", "cooking skillet"], aliases: ["skillet"], tags: ["kitchen", "cooking", "tool"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "cooking pot", queries: ["cooking pot", "kitchen saucepan"], aliases: ["saucepan"], tags: ["kitchen", "cooking", "container"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "cutting board", queries: ["cutting board", "wooden chopping board"], aliases: ["chopping board"], tags: ["kitchen", "food", "tool"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "drinking glass", queries: ["drinking glass", "water glass"], aliases: ["glass cup"], tags: ["kitchen", "drink", "tableware"], domain: "everyday_objects", targetExtentM: 0.2 },
  { label: "mixing bowl", queries: ["mixing bowl", "kitchen bowl"], aliases: ["bowl"], tags: ["kitchen", "food", "container"], domain: "everyday_objects", targetExtentM: 0.35 },
  { label: "hard hat", queries: ["hard hat", "construction helmet"], aliases: ["safety helmet"], tags: ["construction", "safety", "clothing"], domain: "engineering", targetExtentM: 0.35 },
  { label: "safety vest", queries: ["safety vest", "construction vest"], aliases: ["high visibility vest"], tags: ["construction", "safety", "clothing"], domain: "engineering", targetExtentM: 0.7 },
  { label: "screwdriver", queries: ["screwdriver", "hand screwdriver"], aliases: ["driver tool"], tags: ["tool", "repair", "mechanics"], domain: "engineering", targetExtentM: 0.3 },
  { label: "pliers", queries: ["pliers", "hand pliers"], aliases: ["gripping pliers"], tags: ["tool", "repair", "mechanics"], domain: "engineering", targetExtentM: 0.3 },
  { label: "hand saw", queries: ["hand saw", "wood saw"], aliases: ["saw"], tags: ["tool", "construction", "cutting"], domain: "engineering", targetExtentM: 0.6 },
  { label: "tape measure", queries: ["tape measure", "measuring tape"], aliases: ["measurement tape"], tags: ["tool", "measurement", "construction"], domain: "engineering", targetExtentM: 0.25 },
  { label: "flashlight", queries: ["flashlight", "hand torch"], aliases: ["torch light"], tags: ["tool", "light", "battery"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "motorcycle", queries: ["motorcycle", "road motorcycle"], aliases: ["motorbike"], tags: ["vehicle", "transportation", "wheels"], domain: "engineering", targetExtentM: 2.2 },
  { label: "scooter", queries: ["kick scooter", "street scooter"], aliases: ["scooter"], tags: ["vehicle", "transportation", "wheels"], domain: "engineering", targetExtentM: 1.2 },
  { label: "pickup truck", queries: ["pickup truck", "utility truck"], aliases: ["truck"], tags: ["vehicle", "transportation", "cargo"], domain: "engineering", targetExtentM: 4 },
  { label: "farm tractor", queries: ["farm tractor", "agricultural tractor"], aliases: ["tractor"], tags: ["vehicle", "farm", "machine"], domain: "engineering", targetExtentM: 4 },
  { label: "forklift", queries: ["forklift", "warehouse forklift"], aliases: ["lift truck"], tags: ["vehicle", "warehouse", "machine"], domain: "engineering", targetExtentM: 3 },
  { label: "excavator", queries: ["excavator", "construction excavator"], aliases: ["digger"], tags: ["vehicle", "construction", "machine"], domain: "engineering", targetExtentM: 4 },
  { label: "bulldozer", queries: ["bulldozer", "construction bulldozer"], aliases: ["dozer"], tags: ["vehicle", "construction", "machine"], domain: "engineering", targetExtentM: 4 },
  { label: "helicopter", queries: ["helicopter", "generic helicopter"], aliases: ["rotorcraft"], tags: ["vehicle", "flight", "transportation"], domain: "engineering", targetExtentM: 4 },
  { label: "train locomotive", queries: ["train locomotive", "rail locomotive"], aliases: ["locomotive"], tags: ["vehicle", "rail", "transportation"], domain: "engineering", targetExtentM: 4 },
  { label: "fire truck", queries: ["fire truck", "fire engine vehicle"], aliases: ["fire engine"], tags: ["vehicle", "emergency", "safety"], domain: "civics", targetExtentM: 4 },
  { label: "ambulance", queries: ["ambulance", "emergency ambulance"], aliases: ["medical vehicle"], tags: ["vehicle", "emergency", "healthcare"], domain: "civics", targetExtentM: 4 },
  { label: "police car", queries: ["police car", "patrol car"], aliases: ["police vehicle"], tags: ["vehicle", "emergency", "civics"], domain: "civics", targetExtentM: 4 },
  { label: "stop sign", queries: ["stop sign", "road stop sign"], aliases: ["traffic sign"], tags: ["road", "traffic", "safety"], domain: "civics", targetExtentM: 2 },
  { label: "street lamp", queries: ["street lamp", "street light pole"], aliases: ["lamp post"], tags: ["street", "light", "infrastructure"], domain: "civics", targetExtentM: 4 },
  { label: "bus stop", queries: ["bus stop", "bus shelter"], aliases: ["transit stop"], tags: ["street", "transportation", "infrastructure"], domain: "civics", targetExtentM: 3 },
  { label: "park fountain", queries: ["park fountain", "water fountain"], aliases: ["fountain"], tags: ["park", "water", "architecture"], domain: "architecture", targetExtentM: 2 },
  { label: "picnic table", queries: ["picnic table", "outdoor picnic table"], aliases: ["outdoor table"], tags: ["park", "furniture", "outdoors"], domain: "everyday_objects", targetExtentM: 2 },
  { label: "playground swing", queries: ["playground swing", "swing set"], aliases: ["swing"], tags: ["playground", "park", "recreation"], domain: "everyday_objects", targetExtentM: 2.5 },
  { label: "playground slide", queries: ["playground slide", "children slide"], aliases: ["slide"], tags: ["playground", "park", "recreation"], domain: "everyday_objects", targetExtentM: 2.5 },
  { label: "wooden crate", queries: ["wooden crate", "shipping crate"], aliases: ["crate"], tags: ["container", "storage", "cargo"], domain: "everyday_objects", targetExtentM: 0.8 },
  { label: "wooden barrel", queries: ["wooden barrel", "storage barrel"], aliases: ["barrel"], tags: ["container", "storage", "wood"], domain: "everyday_objects", targetExtentM: 0.9 },
  { label: "drum set", queries: ["drum set", "music drums"], aliases: ["drums"], tags: ["music", "instrument", "sound"], domain: "music", targetExtentM: 1.5 },
  { label: "violin", queries: ["violin", "wooden violin"], aliases: ["string instrument"], tags: ["music", "instrument", "sound"], domain: "music", targetExtentM: 0.65 },
  { label: "trumpet", queries: ["trumpet", "brass trumpet"], aliases: ["brass instrument"], tags: ["music", "instrument", "sound"], domain: "music", targetExtentM: 0.6 },
  { label: "microphone", queries: ["microphone", "studio microphone"], aliases: ["audio microphone"], tags: ["music", "audio", "sound"], domain: "technology", targetExtentM: 0.4 },
  { label: "audio speaker", queries: ["audio speaker", "loudspeaker"], aliases: ["speaker"], tags: ["music", "audio", "sound"], domain: "technology", targetExtentM: 0.7 },
  { label: "radio", queries: ["radio", "portable radio"], aliases: ["audio radio"], tags: ["technology", "audio", "communication"], domain: "technology", targetExtentM: 0.45 },
  { label: "television", queries: ["television", "flat screen TV"], aliases: ["TV"], tags: ["technology", "display", "home"], domain: "technology", targetExtentM: 1.2 },
  { label: "game controller", queries: ["game controller", "video game controller"], aliases: ["gamepad"], tags: ["technology", "game", "input device"], domain: "technology", targetExtentM: 0.3 },
  { label: "tennis racket", queries: ["tennis racket", "tennis racquet"], aliases: ["racket"], tags: ["sport", "game", "equipment"], domain: "physical_education", targetExtentM: 0.75 },
  { label: "baseball bat", queries: ["baseball bat", "wooden baseball bat"], aliases: ["bat"], tags: ["sport", "game", "equipment"], domain: "physical_education", targetExtentM: 0.9 },
  { label: "volleyball", queries: ["volleyball", "volley ball"], aliases: ["sports ball"], tags: ["sport", "ball", "game"], domain: "physical_education", targetExtentM: 0.25 },
  { label: "bowling pin", queries: ["bowling pin", "white bowling pin"], aliases: ["pin"], tags: ["sport", "game", "equipment"], domain: "physical_education", targetExtentM: 0.4 },
  { label: "dumbbell", queries: ["dumbbell", "hand weight"], aliases: ["gym weight"], tags: ["sport", "exercise", "equipment"], domain: "physical_education", targetExtentM: 0.4 },
  { label: "jump rope", queries: ["jump rope", "skipping rope"], aliases: ["exercise rope"], tags: ["sport", "exercise", "equipment"], domain: "physical_education", targetExtentM: 1.5 },
];

const FULL_CATALOG: CatalogItem[] = [
  ...CATALOG,
  ...EXTRA_CATALOG,
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

  const randomizedCatalog = shuffled(FULL_CATALOG, seed);
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
          catalog_size: FULL_CATALOG.length,
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
          concept: item.label,
          searchQuery: query,
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
          schema_version: "myway_random_cc0_asset_batch_state_v2",
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
        schema_version: "myway_random_cc0_asset_batch_state_v2",
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
    catalog_size: FULL_CATALOG.length,
    seed_text: seedText,
    seed,
    completed,
    failed,
    state_file: STATE_PROJECT_PATH,
    next:
      "Review the local assets at http://localhost:3000/sandbox/probe-lab/asset-library. Upload only approved models to Cloudflare R2.",
    target_policy:
      "Failed, irrelevant, duplicate, or non-CC0 results do not count. The script continues through the expanded catalog until the requested success count is reached.",
    resumable:
      "Stop with Ctrl+C and run the same command again. Existing CC0 concepts and source IDs are skipped.",
  };

  await saveState({
    schema_version: "myway_random_cc0_asset_batch_state_v2",
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
