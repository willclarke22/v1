import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { listMyWayAssets } from "./asset-library.server";
import {
  BODYPARTS3D_ATTRIBUTION,
  BODYPARTS3D_EXPECTED_ELEMENT_COUNT,
  BODYPARTS3D_FULL_COLLECTION_ID,
  BODYPARTS3D_FULL_COLLECTION_NAME,
  BODYPARTS3D_ISA_ELEMENTS_URL,
  BODYPARTS3D_ISA_PARTS_URL,
  BODYPARTS3D_ISA_RELATIONS_URL,
  BODYPARTS3D_LICENSE_URL,
  BODYPARTS3D_PARTOF_ELEMENTS_URL,
  BODYPARTS3D_PARTOF_PARTS_URL,
  BODYPARTS3D_PARTOF_RELATIONS_URL,
  BODYPARTS3D_SOURCE_ARCHIVE,
  BODYPARTS3D_SOURCE_URL,
  makeBodyParts3dFullElementMembership,
  type BodyParts3dSystemId,
} from "./bodyparts3d-slp-pilot";
import { projectPath } from "./paths.server";
import { importManualGlb } from "./providers/manual-glb-provider.server";
import {
  convertSourceModelToGlb,
  extractArchiveMembersByBasenameToDirectory,
} from "./smart-asset-intake.server";

export const BODYPARTS3D_FULL_CATALOG_PATH =
  "sandbox/probe-lab/assets/library/bodyparts3d/bodyparts3d-4.0-index.json" as const;
export const BODYPARTS3D_FULL_LAST_RUN_PATH =
  "sandbox/probe-lab/assets/library/bodyparts3d/full-import-last-run.json" as const;

const SESSION_ROOT = path.join(os.tmpdir(), "myway-bodyparts3d-full-import");
const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,80}$/;
const MAX_FAILURE_DETAILS = 120;

export type BodyParts3dCatalogElement = {
  id: string;
  name: string;
  primary_concept_id: string | null;
  primary_representation_id: string | null;
  concept_ids: string[];
  representation_ids: string[];
  system: BodyParts3dSystemId;
};

export type BodyParts3dCatalogConcept = {
  concept_id: string;
  representation_id: string | null;
  name: string;
  tree_sources: Array<"is_a" | "part_of">;
  element_ids: string[];
};

export type BodyParts3dCatalogRelation = {
  parent_id: string;
  parent_name: string;
  child_id: string;
  child_name: string;
};

export type BodyParts3dFullCatalogV1 = {
  schema_version: "myway_bodyparts3d_full_catalog_v1";
  collection_id: typeof BODYPARTS3D_FULL_COLLECTION_ID;
  collection_name: typeof BODYPARTS3D_FULL_COLLECTION_NAME;
  bodyparts3d_version: "4.0";
  geometry_archive: typeof BODYPARTS3D_SOURCE_ARCHIVE;
  source_url: typeof BODYPARTS3D_SOURCE_URL;
  license_url: typeof BODYPARTS3D_LICENSE_URL;
  generated_at: string;
  classification: "myway_bodyparts3d_system_heuristic_v1";
  counts: {
    elements: number;
    named_concepts: number;
    isa_relations: number;
    partof_relations: number;
  };
  system_counts: Record<string, number>;
  elements: BodyParts3dCatalogElement[];
  concepts: BodyParts3dCatalogConcept[];
  isa_relations: BodyParts3dCatalogRelation[];
  partof_relations: BodyParts3dCatalogRelation[];
};

type SessionFailure = {
  element_id: string;
  name: string;
  error: string;
};

type BodyParts3dFullImportSessionV1 = {
  schema_version: "myway_bodyparts3d_full_import_session_v1";
  session_id: string;
  created_at: string;
  updated_at: string;
  workspace_path: string;
  catalog_path: string;
  total: number;
  archive_entry_count: number;
  already_present: number;
  imported: number;
  duplicate: number;
  failed: number;
  missing_from_archive: number;
  queue: string[];
  failures: SessionFailure[];
};

type MetadataInputs = {
  isaParts?: File | null;
  isaElements?: File | null;
  partofParts?: File | null;
  partofElements?: File | null;
  isaRelations?: File | null;
  partofRelations?: File | null;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function rows(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((value) => value.trim()))
    .filter((columns) => columns.some(Boolean));
}

function relationRows(text: string): BodyParts3dCatalogRelation[] {
  const parsed = rows(text);
  const data = parsed[0]?.[0]?.toLowerCase().includes("parent") ? parsed.slice(1) : parsed;
  return data
    .filter((columns) => columns.length >= 4 && columns[0] && columns[2])
    .map((columns) => ({
      parent_id: columns[0],
      parent_name: columns[1] ?? "",
      child_id: columns[2],
      child_name: columns[3] ?? "",
    }));
}

function classifySystem(names: string[]): BodyParts3dSystemId {
  const text = ` ${names.join(" ").toLowerCase()} `;
  const has = (pattern: RegExp) => pattern.test(text);

  if (has(/\b(heart|cardiac\w*|myocard\w*|atri\w*|ventric\w*|coronary)\b/)) return "cardiac";
  if (has(/\b(arter\w*|aorta|aortic|arteriole\w*)\b/)) return "arterial";
  if (has(/\b(vein\w*|venous|vena cava|venule\w*|portal vein|azygos|hemiazygos)\b/)) return "venous";
  if (has(/\b(brain|cerebr\w*|cerebell\w*|spinal cord|nerve\w*|nervous|gangli\w*|plexus|medulla oblongata|pons)\b/)) return "nervous";
  if (has(/\b(eye|eyeball|retina\w*|cornea\w*|lens|cochlea\w*|vestibul\w*|ear|olfactory|taste bud\w*)\b/)) return "sensory";
  if (has(/\b(bone\w*|vertebra\w*|rib\w*|sternum|skull|cranium|mandible|maxilla|scapula|clavicle|sacrum|coccyx|femur|tibia|fibula|humerus|radius|ulna|patella|phalange\w*|metacarp\w*|metatars\w*|carpal\w*|tarsal\w*)\b/)) return "skeletal";
  if (has(/\b(muscle\w*|musculus|diaphragm|masseter|temporalis|constrictor\w*|vocalis)\b/)) return "muscular";
  if (has(/\b(lung\w*|bronch\w*|trachea\w*|airway\w*|laryn\w*|nasal cavity|respiratory)\b/)) return "respiratory";
  if (has(/\b(esophag\w*|stomach|intestin\w*|colon|rectum|liver|gallbladder|pancrea\w*|digestive|duodenum|jejunum|ileum|appendix|oral cavity|pharynx)\b/)) return "digestive";
  if (has(/\b(kidney\w*|renal|ureter\w*|urinary bladder|urethra\w*|urinary)\b/)) return "urinary";
  if (has(/\b(lymph\w*|spleen|thymus|tonsil\w*|lymphatic)\b/)) return "lymphatic";
  if (has(/\b(testis|testes|ovary|ovarian|uterus|uterine|prostate|penis|epididym\w*|seminal|reproductive|spermatic|vagina\w*|clitoris|fallopian|uterine tube)\b/)) return "reproductive";
  if (has(/\b(pituitary|thyroid gland|parathyroid\w*|adrenal\w*|pineal|endocrine)\b/)) return "endocrine";
  if (has(/\b(skin|integument\w*|body surface|dermis|epidermis)\b/)) return "integumentary";
  if (has(/\b(cartilage\w*|ligament\w*|tendon\w*|fascia\w*|aponeuros\w*|connective tissue)\b/)) return "connective";
  return "connective";
}

function genericPenalty(name: string) {
  const normalized = name.toLowerCase();
  return /^(organ|body part|anatomical structure|segment|portion|region|organ system|bone organ|muscle organ|vascular tree|segment of artery|segment of vein)$/.test(normalized)
    ? 100000
    : 0;
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function textFromFileOrUrl(file: File | null | undefined, url: string, label: string) {
  if (file && file.size > 0) return file.text();
  try {
    return await fetchText(url);
  } catch (caught) {
    throw new Error(
      `${label} could not be fetched from the official BodyParts3D archive. Open the metadata fallback in the importer and provide the downloaded text file. ${caught instanceof Error ? caught.message : String(caught)}`,
    );
  }
}

export async function buildBodyParts3dFullCatalog(metadata: MetadataInputs = {}): Promise<BodyParts3dFullCatalogV1> {
  const [isaPartsText, isaElementsText, partofPartsText, partofElementsText, isaRelationsText, partofRelationsText] = await Promise.all([
    textFromFileOrUrl(metadata.isaParts, BODYPARTS3D_ISA_PARTS_URL, "isa_parts_list_e.txt"),
    textFromFileOrUrl(metadata.isaElements, BODYPARTS3D_ISA_ELEMENTS_URL, "isa_element_parts.txt"),
    textFromFileOrUrl(metadata.partofParts, BODYPARTS3D_PARTOF_PARTS_URL, "partof_parts_list_e.txt"),
    textFromFileOrUrl(metadata.partofElements, BODYPARTS3D_PARTOF_ELEMENTS_URL, "partof_element_parts.txt"),
    textFromFileOrUrl(metadata.isaRelations, BODYPARTS3D_ISA_RELATIONS_URL, "isa_inclusion_relation_list.txt"),
    textFromFileOrUrl(metadata.partofRelations, BODYPARTS3D_PARTOF_RELATIONS_URL, "partof_inclusion_relation_list.txt"),
  ]);

  type TreeSource = "is_a" | "part_of";
  type PartRecord = { tree: TreeSource; conceptId: string; representationId: string | null; name: string };
  type MembershipRecord = { tree: TreeSource; conceptId: string; name: string; elementId: string };
  type MutableConcept = {
    conceptId: string;
    representationId: string | null;
    name: string;
    trees: Set<TreeSource>;
    elementIds: Set<string>;
  };

  const parseParts = (text: string, tree: TreeSource): PartRecord[] => {
    const parsed = rows(text);
    const data = parsed[0]?.[0]?.toLowerCase().includes("concept") ? parsed.slice(1) : parsed;
    return data
      .map((columns) => ({
        tree,
        conceptId: clean(columns[0]),
        representationId: clean(columns[1]) || null,
        name: clean(columns[2]) || clean(columns[0]),
      }))
      .filter((record) => Boolean(record.conceptId));
  };

  const parseMemberships = (text: string, tree: TreeSource): MembershipRecord[] => {
    const parsed = rows(text);
    const data = parsed[0]?.[0]?.toLowerCase().includes("concept") ? parsed.slice(1) : parsed;
    return data
      .map((columns) => ({
        tree,
        conceptId: clean(columns[0]),
        name: clean(columns[1]),
        elementId: clean(columns[2]).toUpperCase(),
      }))
      .filter((record) => Boolean(record.conceptId && record.elementId));
  };

  const isaParts = parseParts(isaPartsText, "is_a");
  const partofParts = parseParts(partofPartsText, "part_of");
  const isaMemberships = parseMemberships(isaElementsText, "is_a");
  const partofMemberships = parseMemberships(partofElementsText, "part_of");
  const geometryElementIds = new Set(isaMemberships.map((record) => record.elementId));

  if (geometryElementIds.size !== BODYPARTS3D_EXPECTED_ELEMENT_COUNT) {
    throw new Error(
      `BodyParts3D IS-A metadata resolved ${geometryElementIds.size} unique element meshes; expected ${BODYPARTS3D_EXPECTED_ELEMENT_COUNT}. Refusing to start a partial full-atlas import.`,
    );
  }

  const partByTreeConcept = new Map<string, PartRecord>();
  for (const part of [...isaParts, ...partofParts]) {
    partByTreeConcept.set(`${part.tree}:${part.conceptId}`, part);
  }

  const concepts = new Map<string, MutableConcept>();
  const conceptKeyForPart = (part: PartRecord) => part.representationId || `${part.tree}:${part.conceptId}`;
  const ensureConcept = (part: PartRecord) => {
    const key = conceptKeyForPart(part);
    const existing = concepts.get(key);
    if (existing) {
      existing.trees.add(part.tree);
      if (!existing.name && part.name) existing.name = part.name;
      return { key, value: existing };
    }
    const value: MutableConcept = {
      conceptId: part.conceptId,
      representationId: part.representationId,
      name: part.name || part.conceptId,
      trees: new Set<TreeSource>([part.tree]),
      elementIds: new Set<string>(),
    };
    concepts.set(key, value);
    return { key, value };
  };

  for (const part of [...isaParts, ...partofParts]) ensureConcept(part);

  const elementConceptKeys = new Map<string, Set<string>>();
  const attachMembership = (membership: MembershipRecord) => {
    if (!geometryElementIds.has(membership.elementId)) return;
    const part = partByTreeConcept.get(`${membership.tree}:${membership.conceptId}`) ?? {
      tree: membership.tree,
      conceptId: membership.conceptId,
      representationId: null,
      name: membership.name || membership.conceptId,
    } satisfies PartRecord;
    const { key, value } = ensureConcept(part);
    value.elementIds.add(membership.elementId);
    const keys = elementConceptKeys.get(membership.elementId) ?? new Set<string>();
    keys.add(key);
    elementConceptKeys.set(membership.elementId, keys);
  };

  for (const membership of isaMemberships) attachMembership(membership);
  for (const membership of partofMemberships) attachMembership(membership);

  const conceptRecordsWithKey = [...concepts.entries()]
    .map(([key, value]) => ({
      key,
      record: {
        concept_id: value.conceptId,
        representation_id: value.representationId,
        name: value.name || value.conceptId,
        tree_sources: [...value.trees].sort(),
        element_ids: [...value.elementIds].sort(),
      } satisfies BodyParts3dCatalogConcept,
    }))
    .sort((a, b) => a.record.name.localeCompare(b.record.name) || a.record.concept_id.localeCompare(b.record.concept_id));
  const conceptByKey = new Map(conceptRecordsWithKey.map(({ key, record }) => [key, record]));
  const conceptRecords = conceptRecordsWithKey.map(({ record }) => record);

  const elements: BodyParts3dCatalogElement[] = [...geometryElementIds]
    .map((elementId) => {
      const keys = elementConceptKeys.get(elementId) ?? new Set<string>();
      const candidates = [...keys]
        .map((key) => conceptByKey.get(key))
        .filter((value): value is BodyParts3dCatalogConcept => Boolean(value))
        .sort((a, b) => {
          const scoreA = genericPenalty(a.name) + Math.max(1, a.element_ids.length) * 100 + a.name.length;
          const scoreB = genericPenalty(b.name) + Math.max(1, b.element_ids.length) * 100 + b.name.length;
          return scoreA - scoreB || a.name.localeCompare(b.name);
        });
      const primary = candidates[0] ?? null;
      const names = [...new Set(candidates.map((candidate) => candidate.name).filter(Boolean))];
      const representationIds = [...new Set(candidates.map((candidate) => candidate.representation_id).filter((value): value is string => Boolean(value)))];
      const primarySystem = classifySystem(primary ? [primary.name] : []);
      return {
        id: elementId,
        name: primary?.name ?? elementId,
        primary_concept_id: primary?.concept_id ?? null,
        primary_representation_id: primary?.representation_id ?? null,
        concept_ids: [...new Set(candidates.map((candidate) => candidate.concept_id))],
        representation_ids: representationIds,
        system: primarySystem !== "connective" ? primarySystem : classifySystem(names),
      } satisfies BodyParts3dCatalogElement;
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const systemCounts: Record<string, number> = {};
  for (const element of elements) systemCounts[element.system] = (systemCounts[element.system] ?? 0) + 1;

  const isaRelations = relationRows(isaRelationsText);
  const partofRelations = relationRows(partofRelationsText);
  const catalog: BodyParts3dFullCatalogV1 = {
    schema_version: "myway_bodyparts3d_full_catalog_v1",
    collection_id: BODYPARTS3D_FULL_COLLECTION_ID,
    collection_name: BODYPARTS3D_FULL_COLLECTION_NAME,
    bodyparts3d_version: "4.0",
    geometry_archive: BODYPARTS3D_SOURCE_ARCHIVE,
    source_url: BODYPARTS3D_SOURCE_URL,
    license_url: BODYPARTS3D_LICENSE_URL,
    generated_at: new Date().toISOString(),
    classification: "myway_bodyparts3d_system_heuristic_v1",
    counts: {
      elements: elements.length,
      named_concepts: conceptRecords.length,
      isa_relations: isaRelations.length,
      partof_relations: partofRelations.length,
    },
    system_counts: systemCounts,
    elements,
    concepts: conceptRecords,
    isa_relations: isaRelations,
    partof_relations: partofRelations,
  };

  const catalogPath = projectPath(BODYPARTS3D_FULL_CATALOG_PATH);
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return catalog;
}

export async function readBodyParts3dFullCatalog() {
  try {
    const parsed = JSON.parse(await readFile(projectPath(BODYPARTS3D_FULL_CATALOG_PATH), "utf8")) as BodyParts3dFullCatalogV1;
    return parsed.schema_version === "myway_bodyparts3d_full_catalog_v1" && parsed.elements.length === BODYPARTS3D_EXPECTED_ELEMENT_COUNT
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function sessionPath(sessionId: string) {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("Invalid BodyParts3D import session id.");
  return path.join(SESSION_ROOT, sessionId);
}

async function readSession(sessionId: string) {
  const parsed = JSON.parse(await readFile(path.join(sessionPath(sessionId), "state.json"), "utf8")) as BodyParts3dFullImportSessionV1;
  if (parsed.schema_version !== "myway_bodyparts3d_full_import_session_v1") throw new Error("BodyParts3D import session state is invalid.");
  return parsed;
}

async function writeSession(session: BodyParts3dFullImportSessionV1) {
  session.updated_at = new Date().toISOString();
  await writeFile(path.join(session.workspace_path, "state.json"), `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function progressFromSession(session: BodyParts3dFullImportSessionV1) {
  const available = session.already_present + session.imported + session.duplicate;
  return {
    session_id: session.session_id,
    total: session.total,
    available,
    completed_percent: session.total ? Math.min(100, (available / session.total) * 100) : 0,
    already_present: session.already_present,
    imported: session.imported,
    duplicate: session.duplicate,
    failed: session.failed,
    missing_from_archive: session.missing_from_archive,
    remaining: session.queue.length,
    archive_entry_count: session.archive_entry_count,
    failures: session.failures,
  };
}

export async function bodyParts3dFullLibrarySnapshot() {
  const assets = await listMyWayAssets();
  const collection = assets.filter((asset) => asset.collection_membership?.collection_id === BODYPARTS3D_FULL_COLLECTION_ID);
  const systems: Record<string, number> = {};
  for (const asset of collection) {
    const marker = asset.collection_membership?.group_tags.find((tag) => tag.startsWith("system:"));
    const system = marker?.slice("system:".length) ?? "unknown";
    systems[system] = (systems[system] ?? 0) + 1;
  }
  const catalog = await readBodyParts3dFullCatalog();
  return {
    collection_id: BODYPARTS3D_FULL_COLLECTION_ID,
    collection_name: BODYPARTS3D_FULL_COLLECTION_NAME,
    expected_elements: BODYPARTS3D_EXPECTED_ELEMENT_COUNT,
    registered_elements: collection.length,
    pending_elements: collection.filter((asset) => asset.scene_review_status === "pending").length,
    systems,
    catalog_available: Boolean(catalog),
    catalog_counts: catalog?.counts ?? null,
    catalog_system_counts: catalog?.system_counts ?? null,
  };
}

export async function prepareBodyParts3dFullImport(input: {
  archive: File;
  metadata?: MetadataInputs;
}) {
  const catalog = (await readBodyParts3dFullCatalog()) ?? (await buildBodyParts3dFullCatalog(input.metadata));
  const sessionId = randomUUID();
  const workspace = sessionPath(sessionId);
  const objDirectory = path.join(workspace, "objs");
  await mkdir(objDirectory, { recursive: true });

  try {
    const extraction = await extractArchiveMembersByBasenameToDirectory({
      archive: input.archive,
      basenames: catalog.elements.map((element) => `${element.id}.obj`),
      outputDirectory: objDirectory,
    });
    if (extraction.archiveEntryCount !== BODYPARTS3D_EXPECTED_ELEMENT_COUNT) {
      throw new Error(
        `The selected archive contains ${extraction.archiveEntryCount} file entries; expected ${BODYPARTS3D_EXPECTED_ELEMENT_COUNT} from ${BODYPARTS3D_SOURCE_ARCHIVE}.`,
      );
    }
    if (extraction.missingBasenames.length || extraction.ambiguousBasenames.length) {
      throw new Error(
        `Full-atlas extraction did not resolve all ${BODYPARTS3D_EXPECTED_ELEMENT_COUNT} meshes (${extraction.missingBasenames.length} missing, ${extraction.ambiguousBasenames.length} ambiguous).`,
      );
    }

    const existingAssets = await listMyWayAssets();
    const existingIds = new Set(
      existingAssets
        .filter((asset) => asset.collection_membership?.collection_id === BODYPARTS3D_FULL_COLLECTION_ID)
        .map((asset) => asset.source_asset_id?.toUpperCase())
        .filter((value): value is string => Boolean(value)),
    );
    const queue = catalog.elements.map((element) => element.id).filter((elementId) => !existingIds.has(elementId.toUpperCase()));
    const now = new Date().toISOString();
    const session: BodyParts3dFullImportSessionV1 = {
      schema_version: "myway_bodyparts3d_full_import_session_v1",
      session_id: sessionId,
      created_at: now,
      updated_at: now,
      workspace_path: workspace,
      catalog_path: BODYPARTS3D_FULL_CATALOG_PATH,
      total: catalog.elements.length,
      archive_entry_count: extraction.archiveEntryCount,
      already_present: catalog.elements.length - queue.length,
      imported: 0,
      duplicate: 0,
      failed: 0,
      missing_from_archive: 0,
      queue,
      failures: [],
    };
    await writeSession(session);
    return {
      ok: true,
      phase: "prepared" as const,
      ...progressFromSession(session),
      catalog_counts: catalog.counts,
      system_counts: catalog.system_counts,
      run_vision: false,
      run_embedding: false,
      message: "Full BodyParts3D archive prepared. MyWay will import element meshes incrementally into Needs Review with Omni Vision and embeddings disabled.",
    };
  } catch (caught) {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    throw caught;
  }
}

export async function bodyParts3dFullImportStatus(sessionId: string) {
  const session = await readSession(sessionId);
  const catalog = await readBodyParts3dFullCatalog();
  return {
    ok: true,
    phase: "running" as const,
    ...progressFromSession(session),
    catalog_counts: catalog?.counts ?? null,
    system_counts: catalog?.system_counts ?? null,
  };
}

function aliasList(element: BodyParts3dCatalogElement) {
  return [...new Set([
    element.id,
    element.primary_concept_id ?? "",
    element.primary_representation_id ?? "",
    ...element.concept_ids.slice(0, 8),
    ...element.representation_ids.slice(0, 8),
  ].filter(Boolean))].slice(0, 20);
}

export async function runBodyParts3dFullImportStep(sessionId: string, batchSize = 4) {
  const session = await readSession(sessionId);
  const catalog = await readBodyParts3dFullCatalog();
  if (!catalog) throw new Error("The BodyParts3D full catalog index is missing. Prepare the archive again.");
  const catalogById = new Map(catalog.elements.map((element) => [element.id, element]));
  const batch = session.queue.splice(0, Math.min(8, Math.max(1, Math.round(batchSize))));
  const results: Array<Record<string, unknown>> = [];

  for (const elementId of batch) {
    const element = catalogById.get(elementId);
    if (!element) {
      session.failed += 1;
      session.failures.push({ element_id: elementId, name: elementId, error: "Element is missing from the persisted BodyParts3D catalog." });
      continue;
    }
    const inputPath = path.join(session.workspace_path, "objs", `${element.id}.obj`);
    let conversionCleanup: (() => Promise<void>) | null = null;
    try {
      const converted = await convertSourceModelToGlb({
        inputPath,
        sourceTypeLabel: "BodyParts3D full-atlas OBJ element",
        targetExtentM: 2,
        normalizationMode: "collection_member",
        sourceScale: 0.001,
      });
      conversionCleanup = converted.cleanup;
      if (!converted.collectionTransform) throw new Error("BodyParts3D collection transform was not returned by Blender.");
      const collectionMembership = makeBodyParts3dFullElementMembership({
        elementId: element.id,
        conceptId: element.primary_concept_id,
        conceptName: element.name,
        systemId: element.system,
        runtimeTransform: converted.collectionTransform,
      });
      const imported = await importManualGlb({
        file: converted.file,
        concept: element.name,
        aliases: aliasList(element),
        semanticTags: ["anatomy", "human_anatomy", "BodyParts3D", "bodyparts3d_full_atlas", element.system, `system:${element.system}`],
        domain: "human_anatomy_bodyparts3d",
        targetExtentM: 2,
        sourceProvider: "BodyParts3D",
        sourceUrl: BODYPARTS3D_SOURCE_URL,
        sourceAssetId: element.id,
        assetTitle: element.name,
        creatorName: "Database Center for Life Science",
        licenseKind: "cc_by_4_0",
        licenseVersion: "4.0",
        attribution: BODYPARTS3D_ATTRIBUTION,
        modificationNotice: "Converted from BodyParts3D 4.0 OBJ to an element-local GLB while retaining an invertible shared collection transform.",
        provenanceNotes: `Official ${BODYPARTS3D_SOURCE_ARCHIVE} element ${element.id}; primary FMA concept ${element.primary_concept_id ?? "unknown"}; BodyParts3D representation ${element.primary_representation_id ?? "unknown"}; indexed in ${element.concept_ids.length} named concept(s). License: ${BODYPARTS3D_LICENSE_URL}`,
        normalizationMode: "preserve_geometry",
        collectionMembership,
        contentIdentityMode: "source_identity",
        runVision: false,
        runEmbedding: false,
      });
      const sameElementIdentity =
        imported.asset.collection_membership?.collection_id === BODYPARTS3D_FULL_COLLECTION_ID &&
        imported.asset.source_asset_id?.toUpperCase() === element.id.toUpperCase();

      if (imported.created) {
        session.imported += 1;
        const status = imported.repaired_existing ? "repaired_existing" : "imported";
        results.push({ element_id: element.id, name: element.name, system: element.system, status, asset_id: imported.asset.asset_id });
      } else if (sameElementIdentity) {
        // A same-source race/retry is genuinely available because this official FJ
        // identity is already represented in the exact full-atlas collection.
        session.duplicate += 1;
        results.push({ element_id: element.id, name: element.name, system: element.system, status: "already_registered", asset_id: imported.asset.asset_id });
      } else {
        session.failed += 1;
        const collisionWith = imported.asset.source_asset_id ?? imported.asset.asset_id;
        const failure = {
          element_id: element.id,
          name: element.name,
          error:
            `Content matched another asset (${collisionWith}) instead of registering official BodyParts3D element ${element.id}. ` +
            "This collision is not counted as an available atlas element.",
        };
        if (session.failures.length < MAX_FAILURE_DETAILS) session.failures.push(failure);
        results.push({ element_id: element.id, name: element.name, system: element.system, status: "failed", error: failure.error });
      }
    } catch (caught) {
      session.failed += 1;
      const failure = { element_id: element.id, name: element.name, error: caught instanceof Error ? caught.message : String(caught) };
      if (session.failures.length < MAX_FAILURE_DETAILS) session.failures.push(failure);
      results.push({ element_id: element.id, name: element.name, system: element.system, status: "failed", error: failure.error });
    } finally {
      if (conversionCleanup) await conversionCleanup().catch(() => undefined);
    }
  }

  await writeSession(session);

  const queueExhausted = session.queue.length === 0;
  const progress = progressFromSession(session);
  let reconciliationMissing: string[] = [];

  if (queueExhausted) {
    const registeredAssets = await listMyWayAssets();
    const registeredIds = new Set(
      registeredAssets
        .filter((asset) => asset.collection_membership?.collection_id === BODYPARTS3D_FULL_COLLECTION_ID)
        .map((asset) => asset.source_asset_id?.toUpperCase())
        .filter((value): value is string => Boolean(value)),
    );
    reconciliationMissing = catalog.elements
      .map((element) => element.id)
      .filter((elementId) => !registeredIds.has(elementId.toUpperCase()));

    // Completion is authoritative only when the registry really contains every
    // official FJ identity. Session-local duplicate counts can never manufacture 100%.
    progress.available = session.total - reconciliationMissing.length;
    progress.completed_percent = session.total
      ? Math.min(100, (progress.available / session.total) * 100)
      : 0;
  }

  const done =
    queueExhausted &&
    reconciliationMissing.length === 0;

  const payload = {
    ok: true,
    phase: done
      ? "complete" as const
      : queueExhausted
        ? "incomplete" as const
        : "running" as const,
    ...progress,
    reconciliation_missing: reconciliationMissing.slice(0, MAX_FAILURE_DETAILS),
    batch_results: results,
    catalog_counts: catalog.counts,
    system_counts: catalog.system_counts,
    run_vision: false,
    run_embedding: false,
    message: done
      ? "Full BodyParts3D import pass finished and the registry verifies all 2,234 official FJ element identities."
      : queueExhausted
        ? `Full BodyParts3D pass exhausted its queue, but ${reconciliationMissing.length} official FJ element identity/identities are still missing from the registry.`
        : `Imported the next ${results.length} BodyParts3D element mesh(es).`,
  };

  if (queueExhausted) {
    const lastRunPath = projectPath(BODYPARTS3D_FULL_LAST_RUN_PATH);
    await mkdir(path.dirname(lastRunPath), { recursive: true });
    await writeFile(lastRunPath, `${JSON.stringify({ ...payload, finished_at: new Date().toISOString() }, null, 2)}\n`, "utf8");
  }

  if (done) {
    await rm(session.workspace_path, { recursive: true, force: true }).catch(() => undefined);
  }

  return payload;
}

export async function cancelBodyParts3dFullImport(sessionId: string) {
  await rm(sessionPath(sessionId), { recursive: true, force: true });
  return { ok: true, cancelled: true, session_id: sessionId };
}
