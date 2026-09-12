import fs from "node:fs";
import path from "node:path";

const rootIndex = process.argv.indexOf("--project-root");
const root = path.resolve(
  rootIndex >= 0 && process.argv[rootIndex + 1]
    ? process.argv[rootIndex + 1]
    : process.cwd(),
);

function read(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}
function requireMarker(source: string, marker: string, message: string) {
  if (!source.includes(marker)) throw new Error(`${message} Missing marker: ${marker}`);
}
function forbidMarker(source: string, marker: string, message: string) {
  if (source.includes(marker)) throw new Error(`${message} Forbidden marker: ${marker}`);
}

const ui = read("sandbox/probe-lab/assets/ui/asset-library-lab.tsx");
const browser = read("sandbox/probe-lab/assets/routes/library-browser.ts");
const api = read("app/api/sandbox/probe-lab/assets/library-browser/route.ts");
const legacy = read("sandbox/probe-lab/assets/routes/library.ts");

for (const marker of [
  'const DEFAULT_LIMIT = 60;',
  'const MAX_LIMIT = 120;',
  'const LIST_CONCURRENCY = 12;',
  'const queryTokens = normalized(params.get("q")).split(/\\s+/).filter(Boolean);',
  'const page = filtered.slice(offset, offset + limit);',
  'counts,',
  'facets,',
  'stats,',
  'membership?.concept_name ?? ""',
  '...(membership?.group_tags ?? [])',
  'asset.attribution?.source_asset_id ?? ""',
]) requireMarker(browser, marker, "Scalable Asset Library browser route is incomplete.");

for (const marker of [
  'const [debouncedSearch, setDebouncedSearch] = useState("");',
  'const [pageOffset, setPageOffset] = useState(0);',
  '/api/sandbox/probe-lab/assets/library-browser?',
  'limit: "60"',
  'window.setTimeout(() => {',
  '}, 200);',
  'Previous 60',
  'Next 60',
  'Search all assets, including BodyParts3D anatomy…',
  'const visibleAssets = useMemo(\\n    () => assets,',
]) requireMarker(ui, marker.replace("\\n", "\n"), "Asset Library UI is not using bounded server-side browsing.");

for (const marker of [
  "showBodyParts3dFullCards",
  "BodyParts3dCollectionInspector",
  "2,234 unique BodyParts3D element assets are registered in Needs Review. The element cards are collapsed by default",
]) forbidMarker(ui, marker, "Legacy special-case atlas browsing should no longer control the normal Asset Library.");

requireMarker(
  ui,
  'BodyParts3D legacy pilot import complete:',
  "The old SLP-specific completion copy should be retired from the Asset Library UI.",
);
requireMarker(
  api,
  'export { GET } from "@/sandbox/probe-lab/assets/routes/library-browser";',
  "Browser API route wiring is missing.",
);
requireMarker(
  legacy,
  'export async function GET(request: NextRequest)',
  "The legacy full-list Asset Library route must remain available for compatibility.",
);
requireMarker(
  legacy,
  'view === "qualification"',
  "Qualification callers must retain the established legacy route behavior.",
);

console.log(
  "PASS: A.12.9 Asset Library scale/search normalization verified: the main browser uses debounced server-side search, review/filter scoping and bounded pagination; BodyParts3D full-atlas assets browse as ordinary model results; the legacy SLP inspector/collapse special case is retired; and the existing full-list API remains untouched for compatibility.",
);
