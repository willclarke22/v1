"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { TrackballControls } from "@react-three/drei";
import * as THREE from "three";
import type {
  ProbeGraphPoint3DDraft,
  ProbeGraphView3DDraft,
  ProbeGraphWindow3DDraft,
} from "../probe-ui-types";
import { ProbeButton, ProbePill, probeTheme } from "../shared";
import { type GraphVariables } from "./graph-types";
import {
  evaluateExpression,
  formatPoint3D,
  roundForStorage,
} from "./graph-expression";
import {
  buildAxisGeometry,
  buildSurfaceGeometry,
  mapGraphToScene,
  mapSceneToGraphXZ,
} from "./graph-geometry";

function AxisLine({ points, opacity = 0.45 }: { points: THREE.Vector3[]; opacity?: number }) {
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
  const lineObject = useMemo(
    () => new THREE.Line(geometry, material),
    [geometry, material],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <primitive object={lineObject} />;
}

function SurfaceMesh({
  expression,
  graphWindow,
  variables,
  disabled,
  onPointSelect,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  variables: GraphVariables;
  disabled?: boolean;
  onPointSelect: (point: ProbeGraphPoint3DDraft) => void;
}) {
  const surfaceData = useMemo(
    () => buildSurfaceGeometry({ expression, graphWindow, variables }),
    [expression, graphWindow, variables],
  );

  useEffect(() => {
    return () => {
      surfaceData.meshGeometry.dispose();
      surfaceData.wireGeometry.dispose();
    };
  }, [surfaceData]);

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (disabled) return;
    event.stopPropagation();

    const graphXY = mapSceneToGraphXZ({
      sceneX: event.point.x,
      sceneZ: event.point.z,
      graphWindow,
    });
    const z =
      evaluateExpression(expression, {
        ...variables,
        x: graphXY.x,
        y: graphXY.y,
      }) ?? event.point.y;

    onPointSelect({
      x: roundForStorage(graphXY.x, 3),
      y: roundForStorage(graphXY.y, 3),
      z: roundForStorage(z, 3),
      expression,
    });
  }

  return (
    <group>
      <mesh geometry={surfaceData.meshGeometry} onPointerDown={handlePointerDown}>
        <meshStandardMaterial
          color="#8b5cf6"
          emissive="#2e1065"
          roughness={0.62}
          metalness={0.08}
          side={THREE.DoubleSide}
          transparent
          opacity={0.72}
        />
      </mesh>
      <lineSegments geometry={surfaceData.wireGeometry}>
        <lineBasicMaterial color="#d8b4fe" transparent opacity={0.36} />
      </lineSegments>
    </group>
  );
}

function SelectedPoint3DMarker({
  point,
  graphWindow,
}: {
  point: ProbeGraphPoint3DDraft | null;
  graphWindow: ProbeGraphWindow3DDraft;
}) {
  if (!point) return null;

  const position = mapGraphToScene({
    x: point.x,
    y: point.y,
    z: point.z,
    graphWindow,
  });

  return (
    <mesh position={position}>
      <sphereGeometry args={[0.13, 24, 24]} />
      <meshStandardMaterial color="#ffffff" emissive="#a855f7" emissiveIntensity={0.85} />
    </mesh>
  );
}

function Graph3DCameraControls({
  view,
  resetToken,
}: {
  view: ProbeGraphView3DDraft;
  resetToken: number;
}) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  useEffect(() => {
    const yaw = (view.yaw * Math.PI) / 180;
    const pitch = (view.pitch * Math.PI) / 180;
    const radius = 10 / view.zoom;
    const x = Math.sin(yaw) * Math.cos(pitch) * radius;
    const y = Math.sin(pitch) * radius;
    const z = Math.cos(yaw) * Math.cos(pitch) * radius;

    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const maybeControls = controlsRef.current as {
      target?: THREE.Vector3;
      update?: () => void;
    } | null;

    if (maybeControls?.target) {
      maybeControls.target.set(0, 0, 0);
    }
    maybeControls?.update?.();
  }, [camera, resetToken, view.pitch, view.yaw, view.zoom]);

  return (
    <TrackballControls
      ref={controlsRef}
      rotateSpeed={3.2}
      zoomSpeed={1.15}
      panSpeed={0.72}
      dynamicDampingFactor={0.08}
      staticMoving={false}
    />
  );
}

function Graph3DScene({
  expression,
  graphWindow,
  graphView,
  variables,
  selectedPoint,
  resetToken,
  disabled,
  onPointSelect,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  graphView: ProbeGraphView3DDraft;
  variables: GraphVariables;
  selectedPoint: ProbeGraphPoint3DDraft | null;
  resetToken: number;
  disabled?: boolean;
  onPointSelect: (point: ProbeGraphPoint3DDraft) => void;
}) {
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
      <ambientLight intensity={0.58} />
      <directionalLight position={[5, 7, 6]} intensity={1.15} />
      <pointLight position={[-5, 3, -4]} intensity={0.5} />
      <gridHelper args={[10, 20, "#6d28d9", "#312e81"]} position={[0, -2.35, 0]} />
      <AxisLine points={xAxis} opacity={0.58} />
      <AxisLine points={yAxis} opacity={0.38} />
      <AxisLine points={zAxis} opacity={0.44} />
      <SurfaceMesh
        expression={expression}
        graphWindow={graphWindow}
        variables={variables}
        disabled={disabled}
        onPointSelect={onPointSelect}
      />
      <SelectedPoint3DMarker point={selectedPoint} graphWindow={graphWindow} />
      <Graph3DCameraControls view={graphView} resetToken={resetToken} />
    </>
  );
}

export function Graph3DWorkspace({
  expression,
  graphWindow,
  graphView,
  variables,
  selectedPoint,
  disabled,
  onPointSelect,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  graphView: ProbeGraphView3DDraft;
  variables: GraphVariables;
  selectedPoint: ProbeGraphPoint3DDraft | null;
  disabled?: boolean;
  onPointSelect: (point: ProbeGraphPoint3DDraft) => void;
}) {
  const [resetToken, setResetToken] = useState(0);

  return (
    <div style={{ display: "grid", gap: "0.72rem" }}>
      <div
        style={{
          position: "relative",
          minHeight: "430px",
          overflow: "hidden",
          border: "1px solid rgba(221,214,254,0.16)",
          borderRadius: "24px",
          background: "linear-gradient(145deg, rgba(5,5,16,0.96), rgba(39,13,64,0.76))",
        }}
      >
        <Canvas
          camera={{ position: [7, 5, 8], fov: 45, near: 0.1, far: 100 }}
          dpr={[1, 1.65]}
          style={{ height: "430px", width: "100%" }}
        >
          <Graph3DScene
            expression={expression}
            graphWindow={graphWindow}
            graphView={graphView}
            variables={variables}
            selectedPoint={selectedPoint}
            resetToken={resetToken}
            disabled={disabled}
            onPointSelect={onPointSelect}
          />
        </Canvas>

        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            left: "1rem",
            top: "1rem",
            maxWidth: "19rem",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "18px",
            background: "rgba(0,0,0,0.35)",
            padding: "0.72rem 0.82rem",
            color: "rgba(255,255,255,0.82)",
            fontSize: "0.78rem",
            lineHeight: 1.45,
            backdropFilter: "blur(10px)",
          }}
        >
          Drag to rotate. Scroll to zoom. Right-click or two-finger drag to pan.
        </div>

        <ProbeButton
          disabled={disabled}
          variant="secondary"
          onClick={() => setResetToken((value) => value + 1)}
          style={{
            position: "absolute",
            right: "1rem",
            top: "1rem",
            padding: "0.48rem 0.72rem",
            fontSize: "0.78rem",
            backdropFilter: "blur(10px)",
          }}
        >
          Reset camera
        </ProbeButton>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "center",
          color: probeTheme.text.secondary,
          fontSize: "0.82rem",
        }}
      >
        <span>Selected point</span>
        <ProbePill tone={selectedPoint ? "purple" : "default"}>
          {formatPoint3D(selectedPoint)}
        </ProbePill>
      </div>
    </div>
  );
}
