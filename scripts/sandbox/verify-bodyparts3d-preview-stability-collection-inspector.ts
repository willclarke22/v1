import fs from "node:fs";
import path from "node:path";

const rootArgIndex = process.argv.indexOf("--project-root");
const projectRoot = path.resolve(
  rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
    ? process.argv[rootArgIndex + 1]
    : process.cwd(),
);

const assetLibraryPath = path.join(
  projectRoot,
  "sandbox/probe-lab/assets/ui/asset-library-lab.tsx",
);

const source = fs.readFileSync(assetLibraryPath, "utf8");

function requireMarker(marker: string, message: string) {
  if (!source.includes(marker)) {
    throw new Error(`${message} Missing marker: ${marker}`);
  }
}

function forbidMarker(marker: string, message: string) {
  if (source.includes(marker)) {
    throw new Error(`${message} Forbidden marker: ${marker}`);
  }
}

forbidMarker(
  "Bounds fit clip observe",
  "Asset previews must not perform a visible post-load Drei Bounds fit.",
);
forbidMarker(
  'import { Bounds,',
  "The preview-stability closeout should remove the unused Drei Bounds import.",
);
requireMarker(
  "function assetViewerFraming(asset: LibraryAsset): ViewerFraming",
  "Individual previews must derive deterministic first-frame camera framing from asset metadata.",
);
requireMarker(
  "const framing = assetViewerFraming(asset);",
  "AssetViewer must compute framing before Canvas mounts.",
);
requireMarker(
  "target={framing.center}",
  "OrbitControls must pivot around the same deterministic framing target.",
);
requireMarker(
  "BODYPARTS3D_SLP_COLLECTION_ID",
  "The collection inspector must remain scoped to the SLP pilot collection.",
);
requireMarker(
  "function collectionMemberWorldBounds(asset: LibraryAsset)",
  "The collection inspector must reconstruct bounds from stored collection transforms.",
);
requireMarker(
  "function BodyParts3dCollectionInspector({ assets }: { assets: LibraryAsset[] })",
  "The Asset Library must expose a shared-space BodyParts3D inspection viewer.",
);
requireMarker(
  "runtime_transform.position",
  "Collection members must use their persisted runtime collection transform.",
);
requireMarker(
  "All 12 expected SLP pilot concepts are present",
  "The collection view must provide an explicit completeness signal for the pilot.",
);
requireMarker(
  "<BodyParts3dCollectionInspector assets={bodyParts3dPilotAssets} />",
  "The shared-space inspector must be reachable from the BodyParts3D Asset Library mode.",
);
requireMarker(
  'setReviewView("needs_review")',
  "The BodyParts3D import flow must continue routing imported assets to Needs Review.",
);

console.log(
  "PASS: A.12.3 stable Asset Library framing + BodyParts3D shared-space inspector verified.",
);
