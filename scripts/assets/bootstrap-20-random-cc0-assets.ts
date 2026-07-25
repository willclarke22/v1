import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import {
  assetWithFileStats,
  listMyWayAssets,
  updateMyWayAsset,
} from "../../sandbox/probe-lab/assets/asset-library.server";
import { removeMyWayAssetCompletely } from "../../sandbox/probe-lab/assets/asset-maintenance.server";
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

const BASE_CATALOG: CatalogItem[] = [
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

const EXTENDED_CATALOG: CatalogItem[] = [
  { label: "dining table", queries: ["dining table", "wooden dining table", "kitchen dining table"], aliases: ["table"], tags: ["furniture", "dining", "home"], domain: "everyday_objects", targetExtentM: 2.0 },
  { label: "dining chair", queries: ["dining chair", "wooden dining chair", "kitchen chair"], aliases: ["chair"], tags: ["furniture", "dining", "home"], domain: "everyday_objects", targetExtentM: 1.1 },
  { label: "bar stool", queries: ["bar stool", "counter stool", "tall stool"], aliases: ["stool"], tags: ["furniture", "seating", "home"], domain: "everyday_objects", targetExtentM: 1.0 },
  { label: "dresser", queries: ["dresser", "bedroom dresser", "chest of drawers"], aliases: ["drawers"], tags: ["furniture", "bedroom", "storage"], domain: "everyday_objects", targetExtentM: 1.6 },
  { label: "wardrobe", queries: ["wardrobe", "clothes wardrobe", "bedroom wardrobe"], aliases: ["closet cabinet"], tags: ["furniture", "bedroom", "storage"], domain: "everyday_objects", targetExtentM: 2.0 },
  { label: "nightstand", queries: ["nightstand", "bedside table", "bedside cabinet"], aliases: ["bedside table"], tags: ["furniture", "bedroom", "storage"], domain: "everyday_objects", targetExtentM: 0.8 },
  { label: "kitchen cabinet", queries: ["kitchen cabinet", "base cabinet", "cupboard"], aliases: ["cupboard"], tags: ["furniture", "kitchen", "storage"], domain: "everyday_objects", targetExtentM: 1.4 },
  { label: "filing cabinet", queries: ["filing cabinet", "office filing cabinet", "file cabinet"], aliases: ["file cabinet"], tags: ["furniture", "office", "storage"], domain: "everyday_objects", targetExtentM: 1.3 },
  { label: "storage chest", queries: ["storage chest", "wooden chest", "storage trunk"], aliases: ["trunk"], tags: ["furniture", "storage", "container"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "shoe rack", queries: ["shoe rack", "shoe shelf", "entryway shoe rack"], aliases: ["shoe shelf"], tags: ["furniture", "storage", "home"], domain: "everyday_objects", targetExtentM: 1.1 },
  { label: "coat rack", queries: ["coat rack", "standing coat rack", "hall tree"], aliases: ["clothes rack"], tags: ["furniture", "storage", "home"], domain: "everyday_objects", targetExtentM: 1.8 },
  { label: "television stand", queries: ["television stand", "tv stand", "media console"], aliases: ["media cabinet"], tags: ["furniture", "living room", "technology"], domain: "everyday_objects", targetExtentM: 1.8 },
  { label: "bathroom sink", queries: ["bathroom sink", "wash basin", "pedestal sink"], aliases: ["washbasin"], tags: ["bathroom", "plumbing", "home"], domain: "everyday_objects", targetExtentM: 1.1 },
  { label: "kitchen sink", queries: ["kitchen sink", "stainless sink", "counter sink"], aliases: ["sink"], tags: ["kitchen", "plumbing", "home"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "toilet", queries: ["toilet", "bathroom toilet", "porcelain toilet"], aliases: ["commode"], tags: ["bathroom", "plumbing", "home"], domain: "everyday_objects", targetExtentM: 1.1 },
  { label: "bathtub", queries: ["bathtub", "bath tub", "freestanding bathtub"], aliases: ["tub"], tags: ["bathroom", "plumbing", "home"], domain: "everyday_objects", targetExtentM: 1.8 },
  { label: "shower head", queries: ["shower head", "bathroom showerhead", "wall shower head"], aliases: ["showerhead"], tags: ["bathroom", "plumbing", "home"], domain: "everyday_objects", targetExtentM: 0.4 },
  { label: "wall mirror", queries: ["wall mirror", "rectangular mirror", "bathroom mirror"], aliases: ["mirror"], tags: ["home", "reflection", "furniture"], domain: "everyday_objects", targetExtentM: 1.2 },
  { label: "house door", queries: ["house door", "wooden door", "interior door"], aliases: ["door"], tags: ["architecture", "home", "entry"], domain: "architecture", targetExtentM: 2.1 },
  { label: "house window", queries: ["house window", "window frame", "residential window"], aliases: ["window"], tags: ["architecture", "home", "opening"], domain: "architecture", targetExtentM: 1.5 },
  { label: "staircase", queries: ["staircase", "wooden stairs", "indoor staircase"], aliases: ["stairs"], tags: ["architecture", "building", "home"], domain: "architecture", targetExtentM: 2.8 },
  { label: "wooden fence", queries: ["wooden fence", "garden fence", "picket fence"], aliases: ["fence"], tags: ["outdoors", "boundary", "home"], domain: "architecture", targetExtentM: 2.2 },
  { label: "garden gate", queries: ["garden gate", "wooden gate", "yard gate"], aliases: ["gate"], tags: ["outdoors", "entry", "home"], domain: "architecture", targetExtentM: 1.8 },
  { label: "street light", queries: ["street light", "street lamp", "lamp post"], aliases: ["lamppost"], tags: ["street", "lighting", "city"], domain: "civics", targetExtentM: 3.0 },
  { label: "traffic light", queries: ["traffic light", "road traffic signal", "stop light"], aliases: ["traffic signal"], tags: ["road", "transportation", "safety"], domain: "civics", targetExtentM: 2.8 },
  { label: "road sign", queries: ["road sign", "traffic sign", "street sign"], aliases: ["traffic sign"], tags: ["road", "transportation", "safety"], domain: "civics", targetExtentM: 2.2 },
  { label: "bus stop shelter", queries: ["bus stop shelter", "bus shelter", "transit shelter"], aliases: ["bus stop"], tags: ["transportation", "city", "shelter"], domain: "civics", targetExtentM: 3.0 },
  { label: "picnic table", queries: ["picnic table", "outdoor picnic table", "wooden picnic table"], aliases: ["outdoor table"], tags: ["furniture", "outdoors", "park"], domain: "everyday_objects", targetExtentM: 2.2 },
  { label: "planter box", queries: ["planter box", "garden planter", "raised planter"], aliases: ["plant box"], tags: ["garden", "plant", "container"], domain: "biology", targetExtentM: 1.2 },
  { label: "flower pot", queries: ["flower pot", "plant pot", "terracotta pot"], aliases: ["pot"], tags: ["garden", "plant", "container"], domain: "biology", targetExtentM: 0.6 },
  { label: "cactus", queries: ["cactus", "potted cactus", "desert cactus"], aliases: ["succulent cactus"], tags: ["plant", "desert", "biology"], domain: "biology", targetExtentM: 0.8 },
  { label: "tree stump", queries: ["tree stump", "cut tree stump", "wood stump"], aliases: ["stump"], tags: ["nature", "wood", "forest"], domain: "biology", targetExtentM: 0.9 },
  { label: "wood log", queries: ["wood log", "tree log", "cut log"], aliases: ["log"], tags: ["nature", "wood", "forest"], domain: "biology", targetExtentM: 1.3 },
  { label: "boulder", queries: ["boulder", "large rock", "natural boulder"], aliases: ["rock"], tags: ["nature", "geology", "outdoors"], domain: "geology", targetExtentM: 1.5 },
  { label: "cardboard box", queries: ["cardboard box", "shipping box", "packing box"], aliases: ["carton"], tags: ["container", "shipping", "storage"], domain: "everyday_objects", targetExtentM: 0.8 },
  { label: "wooden crate", queries: ["wooden crate", "shipping crate", "storage crate"], aliases: ["crate"], tags: ["container", "wood", "storage"], domain: "everyday_objects", targetExtentM: 0.9 },
  { label: "plastic bottle", queries: ["plastic bottle", "water bottle", "clear plastic bottle"], aliases: ["bottle"], tags: ["container", "drink", "plastic"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "glass bottle", queries: ["glass bottle", "clear bottle", "drink bottle"], aliases: ["bottle"], tags: ["container", "glass", "drink"], domain: "everyday_objects", targetExtentM: 0.35 },
  { label: "glass jar", queries: ["glass jar", "storage jar", "clear jar"], aliases: ["jar"], tags: ["container", "glass", "kitchen"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "dinner plate", queries: ["dinner plate", "ceramic plate", "round plate"], aliases: ["plate"], tags: ["kitchen", "dish", "food"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "mixing bowl", queries: ["mixing bowl", "kitchen bowl", "ceramic bowl"], aliases: ["bowl"], tags: ["kitchen", "dish", "food"], domain: "everyday_objects", targetExtentM: 0.35 },
  { label: "drinking glass", queries: ["drinking glass", "water glass", "clear tumbler"], aliases: ["tumbler"], tags: ["kitchen", "drink", "glass"], domain: "everyday_objects", targetExtentM: 0.25 },
  { label: "teapot", queries: ["teapot", "ceramic teapot", "tea pot"], aliases: ["tea pot"], tags: ["kitchen", "drink", "container"], domain: "everyday_objects", targetExtentM: 0.4 },
  { label: "cooking pot", queries: ["cooking pot", "kitchen pot", "stock pot"], aliases: ["pot"], tags: ["kitchen", "cooking", "container"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "frying pan", queries: ["frying pan", "skillet", "cooking pan"], aliases: ["skillet"], tags: ["kitchen", "cooking", "tool"], domain: "everyday_objects", targetExtentM: 0.5 },
  { label: "cutting board", queries: ["cutting board", "wooden cutting board", "kitchen board"], aliases: ["chopping board"], tags: ["kitchen", "food", "tool"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "rolling pin", queries: ["rolling pin", "wooden rolling pin", "baking roller"], aliases: ["dough roller"], tags: ["kitchen", "baking", "tool"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "coffee maker", queries: ["coffee maker", "drip coffee machine", "coffee machine"], aliases: ["coffee machine"], tags: ["kitchen", "appliance", "drink"], domain: "everyday_objects", targetExtentM: 0.5 },
  { label: "kitchen blender", queries: ["kitchen blender", "countertop blender", "food blender"], aliases: ["blender"], tags: ["kitchen", "appliance", "food"], domain: "everyday_objects", targetExtentM: 0.6 },
  { label: "food can", queries: ["food can", "tin can", "canned food"], aliases: ["tin"], tags: ["container", "food", "metal"], domain: "everyday_objects", targetExtentM: 0.2 },
  { label: "backpack", queries: ["backpack", "school backpack", "travel backpack"], aliases: ["rucksack"], tags: ["school", "travel", "container"], domain: "everyday_objects", targetExtentM: 0.7 },
  { label: "school desk", queries: ["school desk", "student desk", "classroom desk"], aliases: ["student table"], tags: ["school", "furniture", "classroom"], domain: "education", targetExtentM: 1.2 },
  { label: "notebook", queries: ["notebook", "school notebook", "paper notebook"], aliases: ["exercise book"], tags: ["school", "paper", "writing"], domain: "education", targetExtentM: 0.3 },
  { label: "stack of books", queries: ["stack of books", "book stack", "pile of books"], aliases: ["books"], tags: ["school", "reading", "paper"], domain: "education", targetExtentM: 0.5 },
  { label: "pencil", queries: ["pencil", "wooden pencil", "writing pencil"], aliases: ["graphite pencil"], tags: ["school", "writing", "tool"], domain: "education", targetExtentM: 0.2 },
  { label: "calculator", queries: ["calculator", "pocket calculator", "school calculator"], aliases: ["electronic calculator"], tags: ["school", "mathematics", "technology"], domain: "education", targetExtentM: 0.25 },
  { label: "ruler", queries: ["ruler", "school ruler", "measuring ruler"], aliases: ["straightedge"], tags: ["school", "measurement", "tool"], domain: "education", targetExtentM: 0.3 },
  { label: "world globe", queries: ["world globe", "school globe", "earth globe"], aliases: ["globe"], tags: ["geography", "school", "earth"], domain: "education", targetExtentM: 0.6 },
  { label: "chalkboard", queries: ["chalkboard", "classroom blackboard", "school board"], aliases: ["blackboard"], tags: ["school", "classroom", "writing"], domain: "education", targetExtentM: 2.0 },
  { label: "laptop computer", queries: ["laptop computer", "laptop", "notebook computer"], aliases: ["portable computer"], tags: ["technology", "computer", "office"], domain: "technology", targetExtentM: 0.45 },
  { label: "computer keyboard", queries: ["computer keyboard", "desktop keyboard", "pc keyboard"], aliases: ["keyboard"], tags: ["technology", "computer", "input"], domain: "technology", targetExtentM: 0.45 },
  { label: "computer mouse", queries: ["computer mouse", "desktop mouse", "pc mouse"], aliases: ["mouse"], tags: ["technology", "computer", "input"], domain: "technology", targetExtentM: 0.18 },
  { label: "printer", queries: ["printer", "desktop printer", "office printer"], aliases: ["computer printer"], tags: ["technology", "office", "paper"], domain: "technology", targetExtentM: 0.7 },
  { label: "television", queries: ["television", "flat screen tv", "modern television"], aliases: ["tv"], tags: ["technology", "display", "home"], domain: "technology", targetExtentM: 1.2 },
  { label: "speaker", queries: ["speaker", "audio speaker", "bookshelf speaker"], aliases: ["loudspeaker"], tags: ["technology", "audio", "sound"], domain: "technology", targetExtentM: 0.5 },
  { label: "microphone", queries: ["microphone", "studio microphone", "vocal microphone"], aliases: ["mic"], tags: ["technology", "audio", "sound"], domain: "technology", targetExtentM: 0.35 },
  { label: "smartphone", queries: ["smartphone", "mobile phone", "cell phone"], aliases: ["phone"], tags: ["technology", "communication", "screen"], domain: "technology", targetExtentM: 0.18 },
  { label: "tablet computer", queries: ["tablet computer", "digital tablet", "touchscreen tablet"], aliases: ["tablet"], tags: ["technology", "computer", "screen"], domain: "technology", targetExtentM: 0.3 },
  { label: "game controller", queries: ["game controller", "video game controller", "gamepad"], aliases: ["gamepad"], tags: ["technology", "gaming", "input"], domain: "technology", targetExtentM: 0.3 },
  { label: "wifi router", queries: ["wifi router", "wireless router", "internet router"], aliases: ["router"], tags: ["technology", "network", "communication"], domain: "technology", targetExtentM: 0.3 },
  { label: "baseball", queries: ["baseball", "baseball ball", "white baseball"], aliases: ["sports ball"], tags: ["sport", "ball", "game"], domain: "physical_education", targetExtentM: 0.12 },
  { label: "volleyball", queries: ["volleyball", "volley ball", "sports volleyball"], aliases: ["sports ball"], tags: ["sport", "ball", "game"], domain: "physical_education", targetExtentM: 0.25 },
  { label: "american football", queries: ["american football", "football ball", "gridiron football"], aliases: ["football"], tags: ["sport", "ball", "game"], domain: "physical_education", targetExtentM: 0.3 },
  { label: "tennis racket", queries: ["tennis racket", "tennis racquet", "sports racket"], aliases: ["racquet"], tags: ["sport", "tennis", "equipment"], domain: "physical_education", targetExtentM: 0.75 },
  { label: "baseball bat", queries: ["baseball bat", "wooden baseball bat", "sports bat"], aliases: ["bat"], tags: ["sport", "baseball", "equipment"], domain: "physical_education", targetExtentM: 0.9 },
  { label: "bowling ball", queries: ["bowling ball", "sports bowling ball", "ten pin bowling ball"], aliases: ["bowling sphere"], tags: ["sport", "ball", "game"], domain: "physical_education", targetExtentM: 0.25 },
  { label: "golf club", queries: ["golf club", "golf iron", "sports golf club"], aliases: ["golf iron"], tags: ["sport", "golf", "equipment"], domain: "physical_education", targetExtentM: 1.0 },
  { label: "jump rope", queries: ["jump rope", "skipping rope", "exercise rope"], aliases: ["skipping rope"], tags: ["sport", "exercise", "equipment"], domain: "physical_education", targetExtentM: 1.0 },
  { label: "dumbbell", queries: ["dumbbell", "hand weight", "gym dumbbell"], aliases: ["hand weight"], tags: ["sport", "exercise", "equipment"], domain: "physical_education", targetExtentM: 0.4 },
  { label: "yoga mat", queries: ["yoga mat", "exercise mat", "fitness mat"], aliases: ["exercise mat"], tags: ["sport", "exercise", "equipment"], domain: "physical_education", targetExtentM: 1.8 },
  { label: "bicycle helmet", queries: ["bicycle helmet", "bike helmet", "cycling helmet"], aliases: ["bike helmet"], tags: ["sport", "safety", "cycling"], domain: "physical_education", targetExtentM: 0.35 },
  { label: "motorcycle helmet", queries: ["motorcycle helmet", "motorbike helmet", "full face helmet"], aliases: ["motorbike helmet"], tags: ["transportation", "safety", "vehicle"], domain: "engineering", targetExtentM: 0.35 },
  { label: "motorcycle", queries: ["motorcycle", "street motorcycle", "motorbike"], aliases: ["motorbike"], tags: ["vehicle", "transportation", "wheels"], domain: "engineering", targetExtentM: 2.0 },
  { label: "kick scooter", queries: ["kick scooter", "push scooter", "two wheel scooter"], aliases: ["scooter"], tags: ["vehicle", "transportation", "wheels"], domain: "engineering", targetExtentM: 1.2 },
  { label: "pickup truck", queries: ["pickup truck", "light pickup truck", "utility pickup"], aliases: ["pickup"], tags: ["vehicle", "transportation", "cargo"], domain: "engineering", targetExtentM: 4.0 },
  { label: "train car", queries: ["train car", "railway carriage", "passenger train carriage"], aliases: ["rail carriage"], tags: ["vehicle", "transportation", "rail"], domain: "engineering", targetExtentM: 4.0 },
  { label: "airplane", queries: ["airplane", "passenger airplane", "commercial aircraft"], aliases: ["aircraft"], tags: ["vehicle", "transportation", "flight"], domain: "engineering", targetExtentM: 4.0 },
  { label: "helicopter", queries: ["helicopter", "civilian helicopter", "utility helicopter"], aliases: ["rotorcraft"], tags: ["vehicle", "transportation", "flight"], domain: "engineering", targetExtentM: 4.0 },
  { label: "farm tractor", queries: ["farm tractor", "agricultural tractor", "utility tractor"], aliases: ["tractor"], tags: ["vehicle", "agriculture", "machine"], domain: "engineering", targetExtentM: 3.0 },
  { label: "forklift", queries: ["forklift", "warehouse forklift", "industrial lift truck"], aliases: ["lift truck"], tags: ["vehicle", "warehouse", "machine"], domain: "engineering", targetExtentM: 2.5 },
  { label: "wooden pallet", queries: ["wooden pallet", "shipping pallet", "warehouse pallet"], aliases: ["pallet"], tags: ["shipping", "warehouse", "wood"], domain: "engineering", targetExtentM: 1.2 },
  { label: "metal barrel", queries: ["metal barrel", "steel drum", "industrial barrel"], aliases: ["steel drum"], tags: ["container", "industrial", "metal"], domain: "engineering", targetExtentM: 0.9 },
  { label: "fire extinguisher", queries: ["fire extinguisher", "red fire extinguisher", "safety extinguisher"], aliases: ["extinguisher"], tags: ["safety", "fire", "equipment"], domain: "civics", targetExtentM: 0.6 },
  { label: "shopping basket", queries: ["shopping basket", "store basket", "grocery basket"], aliases: ["basket"], tags: ["store", "container", "shopping"], domain: "everyday_objects", targetExtentM: 0.5 },
  { label: "cash register", queries: ["cash register", "store cash register", "checkout register"], aliases: ["checkout register"], tags: ["store", "technology", "money"], domain: "everyday_objects", targetExtentM: 0.6 },
  { label: "vending machine", queries: ["vending machine", "snack vending machine", "drink vending machine"], aliases: ["vendor machine"], tags: ["store", "machine", "food"], domain: "everyday_objects", targetExtentM: 1.8 },
  { label: "sewing machine", queries: ["sewing machine", "home sewing machine", "fabric sewing machine"], aliases: ["stitching machine"], tags: ["home", "machine", "textile"], domain: "everyday_objects", targetExtentM: 0.7 },
  { label: "clothes iron", queries: ["clothes iron", "electric iron", "laundry iron"], aliases: ["flat iron"], tags: ["home", "laundry", "appliance"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "ironing board", queries: ["ironing board", "laundry ironing board", "folding ironing board"], aliases: ["pressing board"], tags: ["home", "laundry", "furniture"], domain: "everyday_objects", targetExtentM: 1.4 },
  { label: "hair dryer", queries: ["hair dryer", "blow dryer", "electric hair dryer"], aliases: ["blow dryer"], tags: ["bathroom", "appliance", "home"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "toothbrush", queries: ["toothbrush", "manual toothbrush", "bathroom toothbrush"], aliases: ["dental brush"], tags: ["bathroom", "hygiene", "home"], domain: "everyday_objects", targetExtentM: 0.2 },
  { label: "soap dispenser", queries: ["soap dispenser", "liquid soap bottle", "bathroom dispenser"], aliases: ["soap pump"], tags: ["bathroom", "hygiene", "container"], domain: "everyday_objects", targetExtentM: 0.25 },
  { label: "towel rack", queries: ["towel rack", "bathroom towel rail", "wall towel holder"], aliases: ["towel rail"], tags: ["bathroom", "furniture", "home"], domain: "everyday_objects", targetExtentM: 0.7 },
  { label: "briefcase", queries: ["briefcase", "office briefcase", "business case"], aliases: ["document case"], tags: ["office", "container", "travel"], domain: "everyday_objects", targetExtentM: 0.5 },
  { label: "handbag", queries: ["handbag", "shoulder bag", "fashion handbag"], aliases: ["purse"], tags: ["clothing", "container", "everyday object"], domain: "everyday_objects", targetExtentM: 0.45 },
  { label: "sunglasses", queries: ["sunglasses", "dark glasses", "fashion sunglasses"], aliases: ["sun glasses"], tags: ["clothing", "eyes", "everyday object"], domain: "everyday_objects", targetExtentM: 0.18 },
  { label: "eyeglasses", queries: ["eyeglasses", "reading glasses", "spectacles"], aliases: ["glasses"], tags: ["clothing", "eyes", "everyday object"], domain: "everyday_objects", targetExtentM: 0.18 },
  { label: "wristwatch", queries: ["wristwatch", "analog wristwatch", "watch"], aliases: ["watch"], tags: ["time", "clothing", "measurement"], domain: "everyday_objects", targetExtentM: 0.12 },
  { label: "alarm clock", queries: ["alarm clock", "bedside alarm clock", "digital alarm clock"], aliases: ["clock"], tags: ["time", "home", "measurement"], domain: "everyday_objects", targetExtentM: 0.25 },
  { label: "candle", queries: ["candle", "wax candle", "decorative candle"], aliases: ["wax light"], tags: ["lighting", "home", "decorative"], domain: "everyday_objects", targetExtentM: 0.25 },
  { label: "lantern", queries: ["lantern", "camping lantern", "portable lantern"], aliases: ["portable light"], tags: ["lighting", "outdoors", "equipment"], domain: "everyday_objects", targetExtentM: 0.4 },
  { label: "flashlight", queries: ["flashlight", "hand flashlight", "torch light"], aliases: ["torch"], tags: ["lighting", "tool", "portable"], domain: "everyday_objects", targetExtentM: 0.3 },
  { label: "ceiling fan", queries: ["ceiling fan", "house ceiling fan", "three blade ceiling fan"], aliases: ["fan"], tags: ["home", "appliance", "airflow"], domain: "physics", targetExtentM: 1.2 },
  { label: "recycling bin", queries: ["recycling bin", "blue recycling bin", "recycle container"], aliases: ["recycle bin"], tags: ["waste", "container", "cleaning"], domain: "everyday_objects", targetExtentM: 0.8 },
  { label: "watering can", queries: ["watering can", "garden watering can", "plant watering can"], aliases: ["water can"], tags: ["garden", "tool", "container"], domain: "biology", targetExtentM: 0.5 },
  { label: "garden hose", queries: ["garden hose", "coiled garden hose", "water hose"], aliases: ["hose"], tags: ["garden", "water", "tool"], domain: "everyday_objects", targetExtentM: 1.0 },
  { label: "garden rake", queries: ["garden rake", "leaf rake", "yard rake"], aliases: ["rake"], tags: ["garden", "tool", "outdoors"], domain: "everyday_objects", targetExtentM: 1.5 },
  { label: "birdhouse", queries: ["birdhouse", "wooden birdhouse", "garden bird house"], aliases: ["bird house"], tags: ["animal", "garden", "shelter"], domain: "biology", targetExtentM: 0.6 },
  { label: "dog bowl", queries: ["dog bowl", "pet food bowl", "animal bowl"], aliases: ["pet bowl"], tags: ["animal", "pet", "container"], domain: "biology", targetExtentM: 0.25 },
  { label: "cat tree", queries: ["cat tree", "cat climbing tower", "pet cat tower"], aliases: ["cat tower"], tags: ["animal", "pet", "furniture"], domain: "biology", targetExtentM: 1.5 },
  { label: "pet carrier", queries: ["pet carrier", "animal travel carrier", "cat carrier"], aliases: ["animal carrier"], tags: ["animal", "pet", "container"], domain: "biology", targetExtentM: 0.7 },
];

const CATALOG: CatalogItem[] = [
  ...BASE_CATALOG,
  ...EXTENDED_CATALOG,
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

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = positiveInteger(value, fallback);
  return Math.min(maximum, Math.max(minimum, parsed));
}

async function withHeartbeat<T>(input: {
  label: string;
  timeoutSeconds: number;
  operation: Promise<T>;
}) {
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.round(
      (Date.now() - startedAt) / 1000,
    );
    console.log(
      `Still working on ${input.label} ` +
        `(${elapsedSeconds}s elapsed; ` +
        `${input.timeoutSeconds}s query limit)...`,
    );
  }, 15_000);

  try {
    return await input.operation;
  } finally {
    clearInterval(heartbeat);
  }
}

function normalizedLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) =>
          typeof value === "string"
            ? value.trim()
            : "",
        )
        .filter(Boolean),
    ),
  );
}

function normalizedWords(value: string) {
  return normalizedLabel(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

const IDENTITY_DESCRIPTOR_WORDS = new Set([
  "small",
  "large",
  "wooden",
  "metal",
  "plastic",
  "glass",
  "ceramic",
  "generic",
  "household",
  "everyday",
  "simple",
  "clean",
  "realistic",
  "modern",
  "old",
  "residential",
  "family",
  "compact",
  "passenger",
  "delivery",
  "cargo",
  "public",
  "transit",
  "portable",
  "utility",
  "garden",
  "street",
  "road",
  "city",
  "outdoor",
  "indoor",
  "electric",
  "manual",
  "american",
  "world",
  "potted",
]);

function meaningfulIdentityWords(value: string) {
  return normalizedWords(value).filter(
    (word) =>
      word.length >= 3 &&
      !IDENTITY_DESCRIPTOR_WORDS.has(word),
  );
}

type SourceIdentityEvidence = {
  display_name: string;
  description: string;
  tags: string[];
  normalized_text: string;
  words: Set<string>;
};

async function sourceIdentityEvidence(input: {
  sourceRecordPath: string;
  sourceDisplayName: string;
}): Promise<SourceIdentityEvidence> {
  let raw: Record<string, unknown> = {};

  try {
    raw = JSON.parse(
      await readFile(
        projectPath(input.sourceRecordPath),
        "utf8",
      ),
    ) as Record<string, unknown>;
  } catch {
    raw = {};
  }

  const displayName =
    typeof raw.display_name === "string"
      ? raw.display_name
      : input.sourceDisplayName;
  const description =
    typeof raw.description === "string"
      ? raw.description
      : "";
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter(
        (value): value is string =>
          typeof value === "string",
      )
    : [];
  const normalizedText = normalizedLabel(
    [displayName, description, ...tags].join(" "),
  );

  return {
    display_name: displayName,
    description,
    tags,
    normalized_text: normalizedText,
    words: new Set(normalizedWords(normalizedText)),
  };
}

function phraseAppears(
  phrase: string,
  evidence: SourceIdentityEvidence,
) {
  const normalized = normalizedLabel(phrase);
  return Boolean(
    normalized &&
      ` ${evidence.normalized_text} `.includes(
        ` ${normalized} `,
      ),
  );
}

function sourceMatchesCatalogIdentity(
  item: CatalogItem,
  evidence: SourceIdentityEvidence,
) {
  if (phraseAppears(item.label, evidence)) {
    return {
      ok: true as const,
      reason: `source evidence contains exact label "${item.label}"`,
    };
  }

  for (const alias of item.aliases) {
    const aliasWords = meaningfulIdentityWords(alias);
    if (
      aliasWords.length >= 2 &&
      phraseAppears(alias, evidence)
    ) {
      return {
        ok: true as const,
        reason: `source evidence contains verified alias "${alias}"`,
      };
    }
  }

  const requiredWords =
    meaningfulIdentityWords(item.label);

  if (
    requiredWords.length > 0 &&
    requiredWords.every((word) =>
      evidence.words.has(word),
    )
  ) {
    return {
      ok: true as const,
      reason:
        `source evidence contains identity words: ` +
        requiredWords.join(", "),
    };
  }

  return {
    ok: false as const,
    reason:
      `source title/tags did not verify "${item.label}". ` +
      `Source display name: "${evidence.display_name || "unknown"}".`,
  };
}

async function removeRejectedCandidate(
  assetId: string,
) {
  try {
    await removeMyWayAssetCompletely(assetId);
  } catch (caught) {
    console.error(
      `Could not fully remove rejected candidate ${assetId}: ${
        caught instanceof Error
          ? caught.message
          : String(caught)
      }`,
    );
  }
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
  const target = positiveInteger(
    argument("--target"),
    20,
  );
  const seedText =
    argument("--seed") ??
    "random-everyday-batch-1";
  const seed = hashSeed(seedText);
  const dryRun = hasFlag("--dry-run");
  const queryTimeoutSeconds = boundedInteger(
    argument("--query-timeout-seconds"),
    75,
    30,
    300,
  );
  const maxQueriesPerConcept = boundedInteger(
    argument("--max-queries-per-concept"),
    2,
    1,
    5,
  );

  const existingAssets =
    await listMyWayAssets();
  const existingLabels = new Set(
    existingAssets
      .filter(
        (asset) =>
          asset.source_type ===
            "blenderkit" &&
          asset.license_kind === "cc0" &&
          asset.status !== "rejected",
      )
      .map((asset) =>
        normalizedLabel(
          asset.verified_canonical_label ??
            asset.canonical_label,
        ),
      ),
  );
  const excludedSourceAssetIds = new Set(
    existingAssets
      .filter(
        (asset) =>
          asset.source_type ===
            "blenderkit" &&
          typeof asset.source_asset_id ===
            "string" &&
          asset.source_asset_id.trim(),
      )
      .map((asset) =>
        asset.source_asset_id!.trim(),
      ),
  );

  const randomizedCatalog = shuffled(
    CATALOG,
    seed,
  );
  const pendingCatalog =
    randomizedCatalog.filter(
      (item) =>
        !existingLabels.has(
          normalizedLabel(item.label),
        ),
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
          qualifying_existing_cc0_assets:
            existingLabels.size,
          pending_concepts:
            pendingCatalog.length,
          query_timeout_seconds:
            queryTimeoutSeconds,
          max_queries_per_concept:
            maxQueriesPerConcept,
          randomized_preview:
            pendingCatalog
              .slice(0, 30)
              .map((item) => ({
                label: item.label,
                queries: item.queries,
                domain: item.domain,
              })),
          state_file: STATE_PROJECT_PATH,
          note:
            "The real run keeps trying new concepts until the requested number of successfully registered, identity-verified CC0 assets is reached. Failed, duplicate, missing-file, mislabeled, and non-CC0 candidates do not count.",
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
  const startedAt =
    new Date().toISOString();

  for (const item of randomizedCatalog) {
    if (completed.length >= target) {
      break;
    }

    const catalogLabel =
      normalizedLabel(item.label);

    if (existingLabels.has(catalogLabel)) {
      skippedExisting.push(item.label);
      continue;
    }

    const errors: string[] = [];
    let imported = false;
    const orderedQueries = uniqueStrings([
      item.label,
      ...item.queries,
    ]).slice(0, maxQueriesPerConcept);

    for (const query of orderedQueries) {
      console.log(
        `\n[${completed.length + 1}/${target}] ` +
          `Searching CC0 BlendKit assets for ` +
          `"${item.label}" with query "${query}"...`,
      );

      let candidateAssetId: string | null =
        null;
      let candidateWasCreated = false;
      let candidateSourceAssetId:
        | string
        | null = null;

      try {
        const result = await withHeartbeat({
          label: `"${item.label}" using "${query}"`,
          timeoutSeconds: queryTimeoutSeconds,
          operation: acquireFromBlenderKit({
            // The catalog label is the identity. Synonym queries are search
            // provenance only and must never rename the asset or its ID.
            concept: item.label,
            searchQuery: query,
            aliases: [
              ...item.aliases,
              ...item.queries.filter(
                (candidate) =>
                  candidate !== query,
              ),
            ],
            semanticTags: item.tags,
            domain: item.domain,
            targetExtentM:
              item.targetExtentM,
            requiredLicenseKind: "cc0",
            excludedSourceAssetIds: [
              ...excludedSourceAssetIds,
            ],
            jobTimeoutMs:
              queryTimeoutSeconds * 1000,
          }),
        });

        candidateAssetId =
          result.asset.asset_id;
        candidateWasCreated =
          result.created === true;
        candidateSourceAssetId =
          result.asset.source_asset_id ??
          null;

        if (candidateSourceAssetId) {
          excludedSourceAssetIds.add(
            candidateSourceAssetId,
          );
        }

        if (!candidateWasCreated) {
          throw new Error(
            `BlendKit candidate duplicated an existing registered asset: ${candidateAssetId}`,
          );
        }

        if (
          result.asset.license_kind !==
          "cc0"
        ) {
          throw new Error(
            `Provider returned a non-CC0 asset: ${result.asset.license_kind}`,
          );
        }

        const evidence =
          await sourceIdentityEvidence({
            sourceRecordPath:
              result.source_record_path,
            sourceDisplayName:
              result.asset
                .source_display_name ??
              result.asset.display_name,
          });
        const identity =
          sourceMatchesCatalogIdentity(
            item,
            evidence,
          );

        if (!identity.ok) {
          throw new Error(
            `Identity validation rejected candidate. ${identity.reason}`,
          );
        }

        const aliases = uniqueStrings([
          ...item.aliases,
          ...item.queries,
          item.label,
        ]);
        const now =
          new Date().toISOString();
        const sourceDisplayName =
          evidence.display_name ||
          result.asset
            .source_display_name ||
          result.asset.display_name ||
          item.label;

        const updated =
          await updateMyWayAsset(
            result.asset.asset_id,
            {
              canonical_label:
                catalogLabel,
              display_name:
                sourceDisplayName,
              requested_concept:
                catalogLabel,
              source_display_name:
                sourceDisplayName,
              verified_canonical_label:
                catalogLabel,
              verified_aliases: aliases,
              semantic_review_status:
                "verified",
              semantic_reviewed_at: now,
              semantic_review_notes:
                `Automatically identity-verified during the random CC0 import. ${identity.reason}. Visual scene approval is still required.`,
              aliases: uniqueStrings([
                ...result.asset.aliases,
                ...aliases,
              ]),
              semantic_tags:
                uniqueStrings([
                  ...result.asset
                    .semantic_tags,
                  ...item.tags,
                  item.label,
                ]),
              domain: item.domain,
              scene_review_status:
                "pending",
              scene_reviewed_at: null,
              scene_review_notes:
                "Imported successfully. Review the visual model in the Asset Library before approving it for automatic scene use.",
              notes:
                `${result.asset.notes ?? ""}`.trim() +
                `${result.asset.notes ? " " : ""}` +
                `Selected by the random CC0 batch for "${item.label}" using query "${query}". ${identity.reason}.`,
            },
          );

        const withStats =
          await assetWithFileStats(updated);

        if (
          !withStats.file_stats.exists ||
          !withStats.file_stats
            .file_size_bytes ||
          withStats.file_stats
            .file_size_bytes <= 0
        ) {
          throw new Error(
            "The candidate was registered but its normalized GLB was missing or empty.",
          );
        }

        if (
          normalizedLabel(
            updated
              .verified_canonical_label ??
              "",
          ) !== catalogLabel ||
          updated.semantic_review_status !==
            "verified"
        ) {
          throw new Error(
            "The final registry identity did not match the catalog identity.",
          );
        }

        completed.push({
          label: item.label,
          query,
          asset_id: updated.asset_id,
          source_asset_id:
            updated.source_asset_id,
          display_name:
            updated.display_name,
          domain: updated.domain,
          polygon_count:
            updated.polygon_count,
          file_size_bytes:
            withStats.file_stats
              .file_size_bytes ?? null,
          public_path:
            updated.public_path,
          license_record_path:
            updated.license_record_path,
        });

        existingLabels.add(catalogLabel);
        imported = true;

        console.log(
          `Imported and identity-verified ${item.label}: ` +
            `${updated.asset_id} ` +
            `(${updated.display_name})`,
        );

        await saveState({
          schema_version:
            "myway_random_cc0_asset_batch_state_v2",
          started_at: startedAt,
          seed_text: seedText,
          seed,
          target_new_assets: target,
          query_timeout_seconds:
            queryTimeoutSeconds,
          max_queries_per_concept:
            maxQueriesPerConcept,
          completed_count:
            completed.length,
          attempted_concepts:
            completed.length +
            failed.length,
          remaining_catalog_concepts:
            Math.max(
              0,
              pendingCatalog.length -
                completed.length -
                failed.length,
            ),
          completed,
          skipped_existing:
            skippedExisting,
          failed,
        });

        break;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : String(caught);

        if (
          candidateAssetId &&
          candidateWasCreated
        ) {
          await removeRejectedCandidate(
            candidateAssetId,
          );
        }

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
          "myway_random_cc0_asset_batch_state_v2",
        started_at: startedAt,
        seed_text: seedText,
        seed,
        target_new_assets: target,
        completed_count:
          completed.length,
        attempted_concepts:
          completed.length +
          failed.length,
        remaining_catalog_concepts:
          Math.max(
            0,
            pendingCatalog.length -
              completed.length -
              failed.length,
          ),
        completed,
        skipped_existing:
          skippedExisting,
        failed,
      });
    }
  }

  const reachedTarget =
    completed.length >= target;
  const finalResult = {
    ok: reachedTarget,
    target_new_assets: target,
    query_timeout_seconds:
      queryTimeoutSeconds,
    max_queries_per_concept:
      maxQueriesPerConcept,
    imported_new_assets:
      completed.length,
    skipped_existing_count:
      skippedExisting.length,
    failed_concepts: failed.length,
    catalog_size: CATALOG.length,
    seed_text: seedText,
    seed,
    completed,
    failed,
    state_file: STATE_PROJECT_PATH,
    stop_reason: reachedTarget
      ? "target_reached"
      : "catalog_exhausted_before_target",
    next:
      "Review the imported assets at http://localhost:3000/sandbox/probe-lab/asset-library. Their semantic identities are verified, but scene approval remains pending until visual review.",
    retry_behavior:
      "A failed query or concept never counts toward the target. The importer continues through the randomized catalog until the requested success count is reached.",
  };

  await saveState({
    schema_version:
      "myway_random_cc0_asset_batch_state_v2",
    started_at: startedAt,
    finished_at:
      new Date().toISOString(),
    ...finalResult,
  });

  console.log(
    `\n${JSON.stringify(
      finalResult,
      null,
      2,
    )}`,
  );

  if (!reachedTarget) {
    process.exitCode = 1;
  }
}

main().catch((caught) => {
  console.error(
    caught instanceof Error
      ? caught.stack ?? caught.message
      : String(caught),
  );
  process.exitCode = 1;
});
