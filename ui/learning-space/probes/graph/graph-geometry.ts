"use client";

import * as THREE from "three";
import type { ProbeGraphWindow3DDraft } from "../probe-ui-types";
import {
  SCENE_X_SIZE,
  SCENE_Y_SIZE,
  SCENE_Z_SIZE,
  SURFACE_RESOLUTION,
  type GraphVariables,
} from "./graph-types";
import { clamp, evaluateExpression } from "./graph-expression";

export type SurfaceGeometryData = {
  meshGeometry: THREE.BufferGeometry;
  wireGeometry: THREE.BufferGeometry;
  validSampleCount: number;
  totalSampleCount: number;
};

export function mapGraphToScene(args: {
  x: number;
  y: number;
  z: number;
  graphWindow: ProbeGraphWindow3DDraft;
}) {
  const sceneX =
    ((args.x - args.graphWindow.xMin) / (args.graphWindow.xMax - args.graphWindow.xMin) - 0.5) *
    SCENE_X_SIZE;
  const sceneZ =
    ((args.y - args.graphWindow.yMin) / (args.graphWindow.yMax - args.graphWindow.yMin) - 0.5) *
    SCENE_Z_SIZE;
  const sceneY =
    ((clamp(args.z, args.graphWindow.zMin, args.graphWindow.zMax) - args.graphWindow.zMin) /
      (args.graphWindow.zMax - args.graphWindow.zMin) -
      0.5) *
    SCENE_Y_SIZE;

  return new THREE.Vector3(sceneX, sceneY, sceneZ);
}

export function mapSceneToGraphXZ(args: {
  sceneX: number;
  sceneZ: number;
  graphWindow: ProbeGraphWindow3DDraft;
}) {
  const x =
    args.graphWindow.xMin +
    (args.sceneX / SCENE_X_SIZE + 0.5) * (args.graphWindow.xMax - args.graphWindow.xMin);
  const y =
    args.graphWindow.yMin +
    (args.sceneZ / SCENE_Z_SIZE + 0.5) * (args.graphWindow.yMax - args.graphWindow.yMin);

  return { x, y };
}

export function buildSurfaceGeometry(args: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  variables: GraphVariables;
}): SurfaceGeometryData {
  const vertices: number[] = [];
  const indices: number[] = [];
  const lineVertices: number[] = [];
  const indexGrid: Array<Array<number | null>> = [];
  let validSampleCount = 0;
  let totalSampleCount = 0;

  for (let row = 0; row <= SURFACE_RESOLUTION; row += 1) {
    const y =
      args.graphWindow.yMin +
      ((args.graphWindow.yMax - args.graphWindow.yMin) * row) / SURFACE_RESOLUTION;
    const nextRow: Array<number | null> = [];

    for (let column = 0; column <= SURFACE_RESOLUTION; column += 1) {
      totalSampleCount += 1;
      const x =
        args.graphWindow.xMin +
        ((args.graphWindow.xMax - args.graphWindow.xMin) * column) / SURFACE_RESOLUTION;
      const z = evaluateExpression(args.expression, {
        ...args.variables,
        x,
        y,
      });

      if (
        z === null ||
        z < args.graphWindow.zMin - 40 ||
        z > args.graphWindow.zMax + 40
      ) {
        nextRow.push(null);
        continue;
      }

      const point = mapGraphToScene({ x, y, z, graphWindow: args.graphWindow });
      const vertexIndex = vertices.length / 3;
      vertices.push(point.x, point.y, point.z);
      nextRow.push(vertexIndex);
      validSampleCount += 1;
    }

    indexGrid.push(nextRow);
  }

  for (let row = 0; row < SURFACE_RESOLUTION; row += 1) {
    for (let column = 0; column < SURFACE_RESOLUTION; column += 1) {
      const a = indexGrid[row]?.[column];
      const b = indexGrid[row]?.[column + 1];
      const c = indexGrid[row + 1]?.[column];
      const d = indexGrid[row + 1]?.[column + 1];

      if (a !== null && b !== null && c !== null && d !== null) {
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  function addLineSegment(first: number | null | undefined, second: number | null | undefined) {
    if (first === null || first === undefined || second === null || second === undefined) return;

    lineVertices.push(
      vertices[first * 3],
      vertices[first * 3 + 1],
      vertices[first * 3 + 2],
      vertices[second * 3],
      vertices[second * 3 + 1],
      vertices[second * 3 + 2],
    );
  }

  for (let row = 0; row <= SURFACE_RESOLUTION; row += 1) {
    for (let column = 0; column < SURFACE_RESOLUTION; column += 1) {
      addLineSegment(indexGrid[row]?.[column], indexGrid[row]?.[column + 1]);
    }
  }

  for (let column = 0; column <= SURFACE_RESOLUTION; column += 1) {
    for (let row = 0; row < SURFACE_RESOLUTION; row += 1) {
      addLineSegment(indexGrid[row]?.[column], indexGrid[row + 1]?.[column]);
    }
  }

  const meshGeometry = new THREE.BufferGeometry();
  meshGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  meshGeometry.setIndex(indices);
  meshGeometry.computeVertexNormals();

  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(lineVertices, 3),
  );

  return {
    meshGeometry,
    wireGeometry,
    validSampleCount,
    totalSampleCount,
  };
}

export function buildAxisGeometry(points: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      points.flatMap((point) => [point.x, point.y, point.z]),
      3,
    ),
  );
  return geometry;
}
