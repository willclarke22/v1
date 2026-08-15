import { Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  DIRECTABLE_ASSET_STRUCTURE_INSPECTION_SCHEMA_VERSION,
  type DirectableAssetStructureInspectionV1,
} from "../affordance-graph-contract";
import {
  inferGeometryShapeInspectionFromSamples,
} from "../geometry-affordance-inference";

const MAX_VERTEX_SAMPLES = 7000;
const MAX_TRIANGLE_SAMPLES = 3500;
const MAX_TOTAL_POINT_SAMPLES = 22000;

type InspectableGeometry = {
  getAttribute?: (name: string) => {
    count: number;
    getX: (index: number) => number;
    getY: (index: number) => number;
    getZ: (index: number) => number;
  } | null;
  index?: {
    count: number;
    getX: (index: number) => number;
  } | null;
};

type InspectableMesh = {
  name: string;
  uuid: string;
  matrixWorld: import("three").Matrix4;
  geometry?: InspectableGeometry;
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function triangleCountForGeometry(geometry: InspectableGeometry | undefined) {
  const position = geometry?.getAttribute?.("position");
  if (!position?.count) return 0;
  return geometry?.index
    ? Math.floor(geometry.index.count / 3)
    : Math.floor(position.count / 3);
}

export async function inspectBrowserAssetStructure(
  publicPath: string,
): Promise<DirectableAssetStructureInspectionV1> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(publicPath);
  const nodeNames: string[] = [];
  const meshNames: string[] = [];
  const boneNames: string[] = [];
  const meshes: InspectableMesh[] = [];
  const points: Array<[number, number, number]> = [];

  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (object.name) nodeNames.push(object.name);
    if ((object as { isBone?: boolean }).isBone || object.type === "Bone") {
      boneNames.push(object.name || object.uuid);
    }
    if (!(object as { isMesh?: boolean }).isMesh) return;
    const mesh = object as unknown as InspectableMesh;
    meshNames.push(mesh.name || mesh.uuid);
    meshes.push(mesh);
  });

  const totalVertexCount = meshes.reduce((sum, mesh) => {
    return sum + (mesh.geometry?.getAttribute?.("position")?.count ?? 0);
  }, 0);
  const triangleCount = meshes.reduce(
    (sum, mesh) => sum + triangleCountForGeometry(mesh.geometry),
    0,
  );
  const vertexStride = Math.max(
    1,
    Math.ceil(totalVertexCount / MAX_VERTEX_SAMPLES),
  );
  const triangleStride = Math.max(
    1,
    Math.ceil(triangleCount / MAX_TRIANGLE_SAMPLES),
  );
  const pushPoint = (point: Vector3) => {
    if (points.length >= MAX_TOTAL_POINT_SAMPLES) return;
    points.push([point.x, point.y, point.z]);
  };

  for (const mesh of meshes) {
    if (points.length >= MAX_TOTAL_POINT_SAMPLES) break;
    const geometry = mesh.geometry;
    const position = geometry?.getAttribute?.("position");
    if (!position?.count) continue;
    const sampleVertex = (vertexIndex: number, target: Vector3) =>
      target
        .set(
          position.getX(vertexIndex),
          position.getY(vertexIndex),
          position.getZ(vertexIndex),
        )
        .applyMatrix4(mesh.matrixWorld);

    const vertex = new Vector3();
    for (
      let index = 0;
      index < position.count && points.length < MAX_TOTAL_POINT_SAMPLES;
      index += vertexStride
    ) {
      pushPoint(sampleVertex(index, vertex));
    }

    const indexAttribute = geometry?.index ?? null;
    const meshTriangleCount = triangleCountForGeometry(geometry);
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    for (
      let triangle = 0;
      triangle < meshTriangleCount && points.length < MAX_TOTAL_POINT_SAMPLES;
      triangle += triangleStride
    ) {
      const offset = triangle * 3;
      const ia = indexAttribute ? indexAttribute.getX(offset) : offset;
      const ib = indexAttribute ? indexAttribute.getX(offset + 1) : offset + 1;
      const ic = indexAttribute ? indexAttribute.getX(offset + 2) : offset + 2;
      sampleVertex(ia, a);
      sampleVertex(ib, b);
      sampleVertex(ic, c);
      pushPoint(new Vector3().addVectors(a, b).multiplyScalar(0.5));
      pushPoint(new Vector3().addVectors(b, c).multiplyScalar(0.5));
      pushPoint(new Vector3().addVectors(c, a).multiplyScalar(0.5));
      pushPoint(new Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3));
    }
  }

  return {
    schema_version: DIRECTABLE_ASSET_STRUCTURE_INSPECTION_SCHEMA_VERSION,
    source: "browser_gltf",
    node_names: unique(nodeNames),
    mesh_names: unique(meshNames),
    bone_names: unique(boneNames),
    animation_clip_names: unique(gltf.animations.map((clip) => clip.name)),
    geometry_shape: inferGeometryShapeInspectionFromSamples(points, triangleCount),
  };
}
