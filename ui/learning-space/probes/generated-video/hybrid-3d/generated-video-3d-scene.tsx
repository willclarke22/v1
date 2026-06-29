"use client";

import { useEffect, useMemo } from "react";
import { Billboard, Text, TrackballControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import type { MyWayVideoDirectorContract } from "../director";
import { buildAxisGeometry, buildSurfaceGeometry, mapGraphToScene } from "../../graph/graph-geometry";
import { evaluateExpression } from "../../graph/graph-expression";
import type { GraphVariables } from "../../graph/graph-types";
import type { ProbeGraphWindow3DDraft } from "../../probe-ui-types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value: number) {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutSine(value: number) {
  const t = clamp(value, 0, 1);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

const DEFAULT_GRAPH_WINDOW: ProbeGraphWindow3DDraft = {
  xMin: -4,
  xMax: 4,
  yMin: -4,
  yMax: 4,
  zMin: -6,
  zMax: 10,
};

const DEFAULT_VARIABLES: GraphVariables = {
  a: 1,
  b: 1,
  c: 0,
};

function normalizeSurfaceExpression(expression?: string | null) {
  const cleaned = expression?.trim().replaceAll("²", "^2");
  if (!cleaned) return "x^2-y^2";

  // The graph expression parser is intentionally small. Keep model output in
  // the trusted math subset MyWay can already evaluate.
  const safe = cleaned.toLowerCase().replace(/[^a-z0-9+\-*/^().\s]/g, "");
  return safe || "x^2-y^2";
}

function AxisLine({ points, opacity = 0.46 }: { points: THREE.Vector3[]; opacity?: number }) {
  const geometry = useMemo(() => buildAxisGeometry(points), [points]);
  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity,
      }),
    [opacity],
  );
  const lineObject = useMemo(() => new THREE.Line(geometry, material), [geometry, material]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <primitive object={lineObject} />;
}

function SliceCurve({
  expression,
  graphWindow,
  axis,
  progress,
  active,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  axis: "x" | "y";
  progress: number;
  active: boolean;
}) {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const samples = 72;
    const reveal = easeOutCubic(progress);
    const maxIndex = Math.max(2, Math.round(samples * reveal));

    for (let index = 0; index <= maxIndex; index += 1) {
      const t = -1 + (index / samples) * 2;
      const x = axis === "x" ? t * 3.5 : 0;
      const y = axis === "y" ? t * 3.5 : 0;
      const z = evaluateExpression(expression, { ...DEFAULT_VARIABLES, x, y }) ?? 0;
      points.push(mapGraphToScene({ x, y, z, graphWindow }));
    }

    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points.flatMap((point) => [point.x, point.y, point.z]), 3),
    );
    return nextGeometry;
  }, [axis, expression, graphWindow, progress]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: axis === "x" ? "#d8b4fe" : "#67e8f9",
        transparent: true,
        opacity: active ? 1 : 0.38,
      }),
    [active, axis],
  );

  const lineObject = useMemo(
    () => new THREE.Line(geometry, material),
    [geometry, material],
  );

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return <primitive object={lineObject} />;
}

function SurfaceMesh({
  expression,
  graphWindow,
  progress,
  beatIndex,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  progress: number;
  beatIndex: number;
}) {
  const surfaceData = useMemo(
    () => buildSurfaceGeometry({ expression, graphWindow, variables: DEFAULT_VARIABLES }),
    [expression, graphWindow],
  );

  useEffect(() => {
    return () => {
      surfaceData.meshGeometry.dispose();
      surfaceData.wireGeometry.dispose();
    };
  }, [surfaceData]);

  const surfaceReveal = beatIndex <= 0 ? 0.16 + progress * 0.12 : beatIndex === 1 ? 0.32 + progress * 0.34 : 0.72;
  const wireReveal = beatIndex === 0 ? 0.18 : beatIndex === 1 ? 0.35 + progress * 0.25 : 0.72;

  return (
    <group scale={[1, easeInOutSine(surfaceReveal), 1]}>
      <mesh geometry={surfaceData.meshGeometry}>
        <meshStandardMaterial
          color="#8b5cf6"
          emissive="#2e1065"
          emissiveIntensity={0.32 + surfaceReveal * 0.5}
          roughness={0.62}
          metalness={0.08}
          side={THREE.DoubleSide}
          transparent
          opacity={0.2 + surfaceReveal * 0.54}
        />
      </mesh>
      <lineSegments geometry={surfaceData.wireGeometry}>
        <lineBasicMaterial color="#d8b4fe" transparent opacity={0.14 + wireReveal * 0.34} />
      </lineSegments>
    </group>
  );
}

function Surface3DDirectorScene({
  contract,
  beatIndex,
  progress,
}: {
  contract: MyWayVideoDirectorContract;
  beatIndex: number;
  progress: number;
}) {
  const graphWindow = DEFAULT_GRAPH_WINDOW;
  const expression = normalizeSurfaceExpression(contract.visual_model.surface_3d?.expression);
  const xLabel = contract.visual_model.surface_3d?.x_label ?? "x direction";
  const yLabel = contract.visual_model.surface_3d?.y_label ?? "y direction";
  const showXS = beatIndex >= 1 || (beatIndex === 0 && progress > 0.55);
  const showYS = beatIndex >= 1 || (beatIndex === 0 && progress > 0.72);

  const xAxis = useMemo(
    () => [
      mapGraphToScene({ x: graphWindow.xMin, y: 0, z: 0, graphWindow }),
      mapGraphToScene({ x: graphWindow.xMax, y: 0, z: 0, graphWindow }),
    ],
    [graphWindow],
  );
  const yAxis = useMemo(
    () => [
      mapGraphToScene({ x: 0, y: graphWindow.yMin, z: 0, graphWindow }),
      mapGraphToScene({ x: 0, y: graphWindow.yMax, z: 0, graphWindow }),
    ],
    [graphWindow],
  );
  const zAxis = useMemo(
    () => [
      mapGraphToScene({ x: 0, y: 0, z: graphWindow.zMin, graphWindow }),
      mapGraphToScene({ x: 0, y: 0, z: graphWindow.zMax, graphWindow }),
    ],
    [graphWindow],
  );

  return (
    <>
      <color attach="background" args={["#090014"]} />
      <ambientLight intensity={0.62} />
      <directionalLight position={[5, 7, 6]} intensity={1.15} />
      <pointLight position={[-4, 3, -4]} intensity={0.55} />
      <gridHelper args={[10, 20, "#6d28d9", "#312e81"]} position={[0, -2.35, 0]} />
      <AxisLine points={xAxis} opacity={0.62} />
      <AxisLine points={yAxis} opacity={0.46} />
      <AxisLine points={zAxis} opacity={0.42} />
      <SurfaceMesh expression={expression} graphWindow={graphWindow} progress={progress} beatIndex={beatIndex} />
      {showXS ? <SliceCurve expression={expression} graphWindow={graphWindow} axis="x" progress={beatIndex === 1 ? progress : 1} active={beatIndex === 1 || beatIndex === 2} /> : null}
      {showYS ? <SliceCurve expression={expression} graphWindow={graphWindow} axis="y" progress={beatIndex === 1 ? progress : 1} active={beatIndex === 1 || beatIndex === 2} /> : null}
      <Billboard position={[-3.2, -2.05, 3.2]}>
        <Text fontSize={0.22} color="#faf5ff" anchorX="center" anchorY="middle">
          {xLabel}
        </Text>
      </Billboard>
      <Billboard position={[3.15, -2.05, 3.15]}>
        <Text fontSize={0.22} color="#ecfeff" anchorX="center" anchorY="middle">
          {yLabel}
        </Text>
      </Billboard>
      <Billboard position={[0, 2.25, 0]}>
        <Text fontSize={0.24} color="#ffffff" anchorX="center" anchorY="middle">
          {expression.replaceAll("^2", "²")}
        </Text>
      </Billboard>
      <TrackballControls rotateSpeed={2.4} zoomSpeed={0.9} panSpeed={0.48} dynamicDampingFactor={0.08} />
    </>
  );
}

const NODE_POSITIONS: Array<[number, number, number]> = [
  [-3.1, 0, 0],
  [0, 0.45, 0],
  [3.1, 0, 0],
  [-1.4, -1.2, 1.4],
  [1.4, -1.2, 1.4],
];

function RelationshipLine({ from, to, active }: { from: [number, number, number]; to: [number, number, number]; active: boolean }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute([...from, ...to], 3));
    return next;
  }, [from, to]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#c4b5fd",
        transparent: true,
        opacity: active ? 0.9 : 0.34,
      }),
    [active],
  );

  const lineObject = useMemo(
    () => new THREE.Line(geometry, material),
    [geometry, material],
  );

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return <primitive object={lineObject} />;
}

function Generic3DDirectorScene({
  contract,
  beatIndex,
  progress,
}: {
  contract: MyWayVideoDirectorContract;
  beatIndex: number;
  progress: number;
}) {
  const objects = contract.conceptual_objects.slice(0, 5);
  const activeCount = Math.max(1, Math.min(objects.length, beatIndex + 2));
  const pulse = 0.85 + Math.sin(progress * Math.PI * 2) * 0.08;

  return (
    <>
      <color attach="background" args={["#090014"]} />
      <ambientLight intensity={0.68} />
      <directionalLight position={[5, 7, 6]} intensity={1.05} />
      <pointLight position={[-4, 3, -4]} intensity={0.55} />
      <gridHelper args={[9, 18, "#6d28d9", "#312e81"]} position={[0, -1.65, 0]} />

      {objects.map((object, index) => {
        const position = NODE_POSITIONS[index] ?? [0, 0, 0];
        const active = index < activeCount;
        const scale = active ? pulse : 0.76;
        return (
          <group key={object.id} position={position} scale={scale}>
            <mesh>
              {object.role === "actor" || object.role === "path" ? <sphereGeometry args={[0.46, 32, 32]} /> : <boxGeometry args={[1.22, 0.72, 0.34]} />}
              <meshStandardMaterial
                color={active ? "#8b5cf6" : "#312e81"}
                emissive={active ? "#6d28d9" : "#111827"}
                emissiveIntensity={active ? 0.55 : 0.08}
                roughness={0.54}
                metalness={0.08}
                transparent
                opacity={active ? 0.92 : 0.54}
              />
            </mesh>
            <Billboard position={[0, 0.78, 0]}>
              <Text fontSize={0.18} color="#ffffff" anchorX="center" anchorY="middle" maxWidth={2.1} textAlign="center">
                {object.name}
              </Text>
            </Billboard>
          </group>
        );
      })}

      {contract.relationships.slice(0, 5).map((relationship, index) => {
        const fromIndex = objects.findIndex((object) => object.id === relationship.from);
        const toIndex = objects.findIndex((object) => object.id === relationship.to);
        if (fromIndex < 0 || toIndex < 0) return null;
        return (
          <RelationshipLine
            key={relationship.id}
            from={NODE_POSITIONS[fromIndex] ?? [0, 0, 0]}
            to={NODE_POSITIONS[toIndex] ?? [0, 0, 0]}
            active={index <= beatIndex}
          />
        );
      })}

      <Billboard position={[0, 2.2, 0]}>
        <Text fontSize={0.22} color="#faf5ff" anchorX="center" anchorY="middle" maxWidth={5.4} textAlign="center">
          {contract.creative_brief.aha_moment}
        </Text>
      </Billboard>
      <TrackballControls rotateSpeed={2.4} zoomSpeed={0.9} panSpeed={0.48} dynamicDampingFactor={0.08} />
    </>
  );
}

export function GeneratedVideo3DScene({
  contract,
  beatIndex,
  progress,
}: {
  contract: MyWayVideoDirectorContract;
  beatIndex: number;
  progress: number;
}) {
  const sceneKind = contract.renderer_intent.scene_kind;
  const cameraPosition: [number, number, number] = sceneKind === "surface_3d" ? [7, 5, 8] : [5.2, 3.7, 6.2];

  return (
    <Canvas camera={{ position: cameraPosition, fov: 45, near: 0.1, far: 100 }} dpr={[1, 1.65]} style={{ height: "100%", width: "100%" }}>
      {sceneKind === "surface_3d" ? (
        <Surface3DDirectorScene contract={contract} beatIndex={beatIndex} progress={progress} />
      ) : (
        <Generic3DDirectorScene contract={contract} beatIndex={beatIndex} progress={progress} />
      )}
    </Canvas>
  );
}
