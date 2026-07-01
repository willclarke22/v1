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
import type { GraphVisualState } from "./graph-visual-actions";
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

function AxisLine({
  points,
  opacity = 0.45,
  color = "#ffffff",
}: {
  points: THREE.Vector3[];
  opacity?: number;
  color?: string;
}) {
  const geometry = useMemo(() => buildAxisGeometry(points), [points]);
  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
      }),
    [color, opacity],
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

function SliceCurve({
  axis,
  value,
  expression,
  graphWindow,
  variables,
  opacity = 0.95,
}: {
  axis: "x" | "y";
  value: number;
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  variables: GraphVariables;
  opacity?: number;
}) {
  const points = useMemo(() => {
    const samples = 96;
    const nextPoints: THREE.Vector3[] = [];

    for (let index = 0; index <= samples; index += 1) {
      const t = index / samples;
      const x =
        axis === "x"
          ? graphWindow.xMin + (graphWindow.xMax - graphWindow.xMin) * t
          : value;
      const y =
        axis === "x"
          ? value
          : graphWindow.yMin + (graphWindow.yMax - graphWindow.yMin) * t;
      const z = evaluateExpression(expression, { ...variables, x, y });

      if (z === null || !Number.isFinite(z)) continue;
      nextPoints.push(mapGraphToScene({ x, y, z, graphWindow }));
    }

    return nextPoints;
  }, [axis, expression, graphWindow, value, variables]);

  if (points.length < 2) return null;

  return (
    <AxisLine
      points={points}
      color={axis === "x" ? "#fbbf24" : "#7dd3fc"}
      opacity={opacity}
    />
  );
}

function SurfaceMesh({
  expression,
  graphWindow,
  variables,
  disabled,
  showSurface,
  onPointSelect,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  variables: GraphVariables;
  disabled?: boolean;
  showSurface?: boolean;
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
      {showSurface !== false ? (
        <mesh geometry={surfaceData.meshGeometry} onPointerDown={handlePointerDown}>
          <meshStandardMaterial
            color="#8b5cf6"
            emissive="#2e1065"
            roughness={0.62}
            metalness={0.08}
            side={THREE.DoubleSide}
            transparent
            opacity={0.64}
          />
        </mesh>
      ) : null}
      <lineSegments geometry={surfaceData.wireGeometry}>
        <lineBasicMaterial color="#d8b4fe" transparent opacity={showSurface === false ? 0.18 : 0.34} />
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

function VisualPointMarker({
  visualState,
  graphWindow,
  expression,
  variables,
}: {
  visualState?: GraphVisualState;
  graphWindow: ProbeGraphWindow3DDraft;
  expression: string;
  variables: GraphVariables;
}) {
  if (!visualState?.point) return null;

  const graphPoint = visualState.point;
  const z =
    typeof graphPoint.z === "number"
      ? graphPoint.z
      : evaluateExpression(expression, { ...variables, x: graphPoint.x, y: graphPoint.y }) ?? 0;
  const position = mapGraphToScene({ x: graphPoint.x, y: graphPoint.y, z, graphWindow });

  return (
    <mesh position={position}>
      <sphereGeometry args={[0.16, 24, 24]} />
      <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={1.05} />
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
  const animationRef = useRef<number | null>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const yaw = (view.yaw * Math.PI) / 180;
    const pitch = (view.pitch * Math.PI) / 180;
    const radius = 10 / view.zoom;
    const targetPosition = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch) * radius,
      Math.sin(pitch) * radius,
      Math.cos(yaw) * Math.cos(pitch) * radius,
    );

    const startPosition = camera.position.clone();
    const startedAt = window.performance.now();
    const durationMs = 1150;

    const updateControls = () => {
      const maybeControls = controlsRef.current as {
        target?: THREE.Vector3;
        update?: () => void;
      } | null;

      if (maybeControls?.target) {
        maybeControls.target.set(0, 0, 0);
      }
      maybeControls?.update?.();
    };

    const animate = (now: number) => {
      const raw = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
      const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;

      camera.position.lerpVectors(startPosition, targetPosition, eased);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      updateControls();

      if (raw < 1) {
        animationRef.current = window.requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
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
  visualState,
  resetToken,
  disabled,
  onPointSelect,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  graphView: ProbeGraphView3DDraft;
  variables: GraphVariables;
  selectedPoint: ProbeGraphPoint3DDraft | null;
  visualState?: GraphVisualState;
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

  const highlightedAxis = visualState?.highlightedAxis ?? null;

  return (
    <>
      <color attach="background" args={["#090014"]} />
      <ambientLight intensity={0.58} />
      <directionalLight position={[5, 7, 6]} intensity={1.15} />
      <pointLight position={[-5, 3, -4]} intensity={0.5} />
      <gridHelper args={[10, 20, "#6d28d9", "#312e81"]} position={[0, -2.35, 0]} />
      <AxisLine points={xAxis} opacity={highlightedAxis === "x" ? 0.98 : 0.58} color={highlightedAxis === "x" ? "#fbbf24" : "#ffffff"} />
      <AxisLine points={yAxis} opacity={highlightedAxis === "y" ? 0.98 : 0.38} color={highlightedAxis === "y" ? "#7dd3fc" : "#ffffff"} />
      <AxisLine points={zAxis} opacity={highlightedAxis === "z" ? 0.98 : 0.44} color={highlightedAxis === "z" ? "#fef3c7" : "#ffffff"} />
      <SurfaceMesh
        expression={expression}
        graphWindow={graphWindow}
        variables={variables}
        disabled={disabled}
        showSurface={visualState?.showSurface}
        onPointSelect={onPointSelect}
      />
      {(visualState?.xSlices ?? []).map((value, index) => (
        <SliceCurve key={`x-slice-${value}-${index}`} axis="x" value={value} expression={expression} graphWindow={graphWindow} variables={variables} />
      ))}
      {(visualState?.ySlices ?? []).map((value, index) => (
        <SliceCurve key={`y-slice-${value}-${index}`} axis="y" value={value} expression={expression} graphWindow={graphWindow} variables={variables} />
      ))}
      <VisualPointMarker visualState={visualState} graphWindow={graphWindow} expression={expression} variables={variables} />
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
  visualState,
  onPointSelect,
}: {
  expression: string;
  graphWindow: ProbeGraphWindow3DDraft;
  graphView: ProbeGraphView3DDraft;
  variables: GraphVariables;
  selectedPoint: ProbeGraphPoint3DDraft | null;
  disabled?: boolean;
  visualState?: GraphVisualState;
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
            visualState={visualState}
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
            maxWidth: "21rem",
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
          <b style={{ color: "white" }}>{visualState?.activeStepTitle ?? "3D graph"}</b>
          <br />
          {visualState?.overlayText ? visualState.overlayText : visualState?.highlightedTerm ? `Watching: ${visualState.highlightedTerm}` : "Drag to rotate. Scroll to zoom. Right-click or two-finger drag to pan."}
        </div>

        {visualState?.labels.length ? (
          <div
            style={{
              pointerEvents: "none",
              position: "absolute",
              left: "1rem",
              bottom: "1rem",
              display: "grid",
              gap: "0.4rem",
              maxWidth: "22rem",
            }}
          >
            {visualState.labels.slice(-4).map((label) => (
              <div
                key={label.id}
                style={{
                  border: "1px solid rgba(221,214,254,0.18)",
                  borderRadius: "16px",
                  background: "rgba(0,0,0,0.42)",
                  padding: "0.5rem 0.65rem",
                  color: "rgba(255,255,255,0.86)",
                  fontSize: "0.78rem",
                  lineHeight: 1.4,
                  backdropFilter: "blur(10px)",
                }}
              >
                {label.text}
              </div>
            ))}
          </div>
        ) : null}

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
        <span>
          {(visualState?.xSlices.length || visualState?.ySlices.length)
            ? `Visible slices: x ${visualState.xSlices.length}, y ${visualState.ySlices.length}`
            : "Selected point"}
        </span>
        <ProbePill tone={selectedPoint ? "purple" : "default"}>
          {formatPoint3D(selectedPoint)}
        </ProbePill>
      </div>
    </div>
  );
}
