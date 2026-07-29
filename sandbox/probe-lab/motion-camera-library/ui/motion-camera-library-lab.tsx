"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type CapabilityStatus = "direct" | "controller" | "approximate" | "declared";
type TabKey = "motions" | "camera";
type DemoKind =
  | "show" | "fade" | "highlight" | "slide" | "translate" | "rotate" | "scale"
  | "trace" | "relationship" | "oscillate" | "linkage" | "anchor" | "orbit"
  | "pour" | "stir" | "flow" | "filter" | "attach" | "scatter" | "morph"
  | "static" | "cut" | "dolly" | "track" | "pan" | "tilt" | "truck"
  | "pedestal" | "cameraOrbit" | "follow" | "crane" | "spline" | "attached";
type SceneTheme =
  | "lamp" | "battery" | "crate" | "glider" | "gear" | "rocket" | "drone"
  | "piston" | "planet" | "lab" | "magnet" | "blobs" | "studio"
  | "cart" | "tower" | "museum" | "launchpad" | "statue";

type Capability = {
  id: string;
  label: string;
  category: string;
  status: CapabilityStatus;
  demo: DemoKind;
  scene: SceneTheme;
  summary: string;
  json: string;
  scrubbable: boolean;
  preservesMeaning: boolean;
  fallback?: string;
};

const motions: Capability[] = [
  { id: "show_entity", label: "Show entity", category: "Visibility", status: "direct", demo: "show", scene: "lamp", summary: "Reveal a subject cleanly in the 3D scene.", json: '"behaviour": "show_entity"', scrubbable: true, preservesMeaning: true },
  { id: "hide_entity", label: "Hide entity", category: "Visibility", status: "direct", demo: "fade", scene: "lamp", summary: "Fade a visible subject away without deleting its identity.", json: '"behaviour": "hide_entity"', scrubbable: true, preservesMeaning: true },
  { id: "fade", label: "Fade", category: "Visibility", status: "direct", demo: "fade", scene: "studio", summary: "Blend a 3D subject in or out smoothly.", json: '"behaviour": "fade"', scrubbable: true, preservesMeaning: true },
  { id: "highlight_entity", label: "Highlight entity", category: "Teaching emphasis", status: "direct", demo: "highlight", scene: "battery", summary: "Draw the eye to a specific object while preserving context.", json: '"behaviour": "highlight_entity"', scrubbable: true, preservesMeaning: true },
  { id: "show_label", label: "Show label", category: "Teaching emphasis", status: "direct", demo: "show", scene: "battery", summary: "Introduce a term at the moment its object matters.", json: '"behaviour": "show_label"', scrubbable: true, preservesMeaning: true },
  { id: "show_relationship", label: "Show relationship", category: "Teaching emphasis", status: "direct", demo: "relationship", scene: "battery", summary: "Emphasize a causal or structural link between two subjects.", json: '"behaviour": "show_relationship"', scrubbable: true, preservesMeaning: true },
  { id: "slide", label: "Slide", category: "Translation", status: "direct", demo: "slide", scene: "crate", summary: "Move a subject along a clear axis.", json: '"behaviour": "slide"', scrubbable: true, preservesMeaning: true },
  { id: "translate", label: "Translate", category: "Translation", status: "direct", demo: "translate", scene: "glider", summary: "Move an object between arbitrary start and end positions.", json: '"behaviour": "translate"', scrubbable: true, preservesMeaning: true },
  { id: "rotate", label: "Rotate", category: "Rotation", status: "direct", demo: "rotate", scene: "gear", summary: "Rotate a subject around a pivot or centre.", json: '"behaviour": "rotate"', scrubbable: true, preservesMeaning: true },
  { id: "scale", label: "Scale", category: "Shape", status: "direct", demo: "scale", scene: "rocket", summary: "Grow, shrink, or pulse a subject for emphasis.", json: '"behaviour": "scale"', scrubbable: true, preservesMeaning: true },
  { id: "trace_path", label: "Trace path", category: "Paths", status: "direct", demo: "trace", scene: "drone", summary: "Reveal the route an object follows through space.", json: '"behaviour": "trace_path"', scrubbable: true, preservesMeaning: true },
  { id: "oscillate", label: "Oscillate", category: "Controllers", status: "controller", demo: "oscillate", scene: "piston", summary: "Drive repeated back-and-forth movement from one phase.", json: '"behaviour": "oscillate"', scrubbable: true, preservesMeaning: true, fallback: "slide" },
  { id: "two_point_linkage", label: "Two-point linkage", category: "Controllers", status: "controller", demo: "linkage", scene: "piston", summary: "Keep a rigid link attached to two moving anchors.", json: '"behaviour": "two_point_linkage"', scrubbable: true, preservesMeaning: true, fallback: "rotate (not meaning-preserving)" },
  { id: "follow_anchor", label: "Follow anchor", category: "Controllers", status: "controller", demo: "anchor", scene: "drone", summary: "Keep one object attached to a moving anchor on another.", json: '"behaviour": "follow_anchor"', scrubbable: true, preservesMeaning: true },
  { id: "slider_crank_cycle", label: "Slider-crank cycle", category: "Mechanisms", status: "controller", demo: "linkage", scene: "piston", summary: "Drive piston, rod, crank, and output from one angle.", json: '"behaviour": "slider_crank_cycle"', scrubbable: true, preservesMeaning: true },
  { id: "orbit", label: "Object orbit", category: "Paths", status: "controller", demo: "orbit", scene: "planet", summary: "Move one object around another while preserving a radius.", json: '"behaviour": "orbit"', scrubbable: true, preservesMeaning: true },
  { id: "flow", label: "Flow path", category: "Processes", status: "controller", demo: "flow", scene: "lab", summary: "Move repeated markers through a stable path.", json: '"behaviour": "flow"', scrubbable: true, preservesMeaning: true, fallback: "follow_path" },
  { id: "pour", label: "Pour", category: "Processes", status: "controller", demo: "pour", scene: "lab", summary: "Coordinate lift, tilt, stream, and target fill.", json: '"behaviour": "pour"', scrubbable: true, preservesMeaning: true, fallback: "translate" },
  { id: "stir", label: "Stir", category: "Processes", status: "controller", demo: "stir", scene: "lab", summary: "Constrain a tool to a circular path inside a container.", json: '"behaviour": "stir"', scrubbable: true, preservesMeaning: true, fallback: "rotate" },
  { id: "filter_material", label: "Filter material", category: "Processes", status: "controller", demo: "filter", scene: "lab", summary: "Split a mixture into retained and passed components.", json: '"behaviour": "filter_material"', scrubbable: true, preservesMeaning: true, fallback: "translate" },
  { id: "attach", label: "Attach / detach", category: "Constraints", status: "declared", demo: "attach", scene: "magnet", summary: "Change whether a subject follows another anchor.", json: '"behaviour": "attach"', scrubbable: true, preservesMeaning: true },
  { id: "scatter", label: "Scatter / gather", category: "Groups", status: "declared", demo: "scatter", scene: "blobs", summary: "Move many objects away from or toward a region.", json: '"behaviour": "scatter"', scrubbable: true, preservesMeaning: true },
  { id: "morph_geometry", label: "Morph geometry", category: "Shape", status: "declared", demo: "morph", scene: "blobs", summary: "Interpolate between shape states.", json: '"behaviour": "morph_geometry"', scrubbable: true, preservesMeaning: true },
];

const cameras: Capability[] = [
  { id: "static", label: "Static shot", category: "Shot continuity", status: "direct", demo: "static", scene: "studio", summary: "Hold a stable camera while scene motion does the teaching.", json: '"movement": "static"', scrubbable: true, preservesMeaning: true },
  { id: "cut", label: "Cut", category: "Transitions", status: "direct", demo: "cut", scene: "museum", summary: "Jump between camera poses instantly.", json: '"transition": "cut"', scrubbable: true, preservesMeaning: true },
  { id: "dolly_in", label: "Dolly in / out", category: "Depth movement", status: "direct", demo: "dolly", scene: "statue", summary: "Move the camera toward or away from a subject.", json: '"movement": "dolly_in"', scrubbable: true, preservesMeaning: true },
  { id: "track", label: "Track", category: "Following", status: "direct", demo: "track", scene: "cart", summary: "Move with a subject while maintaining framing.", json: '"movement": "track"', scrubbable: true, preservesMeaning: true },
  { id: "pan", label: "Pan", category: "Rotation", status: "direct", demo: "pan", scene: "museum", summary: "Rotate left or right from a stable camera position.", json: '"movement": "pan"', scrubbable: true, preservesMeaning: true },
  { id: "tilt", label: "Tilt", category: "Rotation", status: "direct", demo: "tilt", scene: "tower", summary: "Rotate the camera upward or downward.", json: '"movement": "tilt"', scrubbable: true, preservesMeaning: true },
  { id: "truck", label: "Truck left / right", category: "Lateral movement", status: "direct", demo: "truck", scene: "studio", summary: "Slide the camera sideways while holding orientation.", json: '"movement": "truck_left"', scrubbable: true, preservesMeaning: true },
  { id: "pedestal", label: "Pedestal up / down", category: "Vertical movement", status: "direct", demo: "pedestal", scene: "launchpad", summary: "Raise or lower the camera without tilting it.", json: '"movement": "pedestal_up"', scrubbable: true, preservesMeaning: true },
  { id: "camera_orbit", label: "Camera orbit", category: "Curved movement", status: "direct", demo: "cameraOrbit", scene: "planet", summary: "Move around a target while keeping it centered.", json: '"movement": "orbit"', scrubbable: true, preservesMeaning: true },
  { id: "follow", label: "Follow shot", category: "Following", status: "direct", demo: "follow", scene: "drone", summary: "Follow a moving object with a target-aware camera.", json: '"movement": "follow"', scrubbable: true, preservesMeaning: true },
  { id: "crane", label: "Crane", category: "Compound camera", status: "controller", demo: "crane", scene: "launchpad", summary: "Combine vertical and forward movement for a reveal.", json: '"movement": "crane"', scrubbable: true, preservesMeaning: true },
  { id: "spline", label: "Spline travel", category: "Compound camera", status: "controller", demo: "spline", scene: "museum", summary: "Travel along a curved path through the scene.", json: '"movement": "spline"', scrubbable: true, preservesMeaning: true },
  { id: "object_attached", label: "Object-attached", category: "Compound camera", status: "controller", demo: "attached", scene: "rocket", summary: "Attach the camera to a moving subject.", json: '"movement": "object_attached"', scrubbable: true, preservesMeaning: true },
];

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smooth01(t: number) {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));
}

function statusColor(status: CapabilityStatus) {
  switch (status) {
    case "direct": return "#22c55e";
    case "controller": return "#38bdf8";
    case "approximate": return "#f59e0b";
    case "declared": return "#a78bfa";
    default: return "#94a3b8";
  }
}

function PreviewCanvas({ capability, tab }: { capability: Capability; tab: TabKey }) {
  return (
    <div style={previewShellStyle}>
      <Canvas camera={{ position: [4.8, 3.1, 5.6], fov: 42 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#030712"]} />
        <fog attach="fog" args={["#030712", 8, 18]} />
        <ambientLight intensity={1.3} />
        <directionalLight position={[5, 8, 5]} intensity={2.4} castShadow />
        <directionalLight position={[-6, 4, -5]} intensity={0.8} color="#60a5fa" />
        <PreviewWorld capability={capability} tab={tab} />
        <OrbitControls enabled={tab === "motions"} enablePan={false} enableZoom={false} enableRotate autoRotate={false} minPolarAngle={0.7} maxPolarAngle={1.8} />
      </Canvas>
    </div>
  );
}

function PreviewWorld({ capability, tab }: { capability: Capability; tab: TabKey }) {
  const { camera } = useThree();
  const tRef = { current: 0 } as { current: number };

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    tRef.current = t;
    if (tab === "camera") {
      const target = new THREE.Vector3(0, 0.9, 0);
      let position = new THREE.Vector3(5.2, 2.8, 5.8);
      switch (capability.demo) {
        case "cut": {
          const cutA = Math.sin(t * 0.55) > 0;
          position = cutA ? new THREE.Vector3(5.6, 2.6, 4.2) : new THREE.Vector3(-3.8, 2.9, 5.8);
          break;
        }
        case "dolly": {
          const p = smooth01((Math.sin(t * 0.65) + 1) / 2);
          position = new THREE.Vector3(lerp(6.6, 3.2, p), lerp(2.9, 1.9, p), lerp(7.2, 3.1, p));
          break;
        }
        case "track": {
          const x = Math.sin(t * 0.8) * 1.8;
          position = new THREE.Vector3(x + 2.6, 2.1, 5.8);
          target.set(x, 0.8, 0);
          break;
        }
        case "pan": {
          position = new THREE.Vector3(0, 2.6, 6.4);
          target.set(Math.sin(t * 0.6) * 2.5, 1.1, 0);
          break;
        }
        case "tilt": {
          position = new THREE.Vector3(0, 2.1, 6.6);
          target.set(0, lerp(0.2, 2.7, (Math.sin(t * 0.7) + 1) / 2), 0);
          break;
        }
        case "truck": {
          position = new THREE.Vector3(Math.sin(t * 0.65) * 3.2, 2.3, 6.0);
          break;
        }
        case "pedestal": {
          position = new THREE.Vector3(4.4, 1.2 + ((Math.sin(t * 0.7) + 1) / 2) * 2.8, 5.0);
          target.set(0, 1.2, 0);
          break;
        }
        case "cameraOrbit": {
          const a = t * 0.45;
          position = new THREE.Vector3(Math.cos(a) * 5.6, 2.5, Math.sin(a) * 5.6);
          break;
        }
        case "follow": {
          const x = Math.sin(t * 0.8) * 2.1;
          position = new THREE.Vector3(x - 2.8, 2.0, 5.0);
          target.set(x, 1.0, 0);
          break;
        }
        case "crane": {
          const p = smooth01((Math.sin(t * 0.5) + 1) / 2);
          position = new THREE.Vector3(lerp(3.5, 6.6, p), lerp(1.4, 5.1, p), lerp(4.2, 8.2, p));
          target.set(0, 1.0, 0);
          break;
        }
        case "spline": {
          const a = t * 0.35;
          position = new THREE.Vector3(Math.cos(a) * 6.0, 2.3 + Math.sin(a * 2) * 0.6, Math.sin(a) * 4.0 + 2.2);
          target.set(Math.sin(a) * 1.6, 0.9, 0);
          break;
        }
        case "attached": {
          const y = 0.4 + Math.sin(t * 0.8) * 1.5;
          position = new THREE.Vector3(1.4, y + 0.9, 2.6);
          target.set(0.4, y, -1.2);
          break;
        }
        case "static":
        default:
          position = new THREE.Vector3(5.2, 2.9, 5.8);
      }
      camera.position.lerp(position, 0.08);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    }
  });

  return (
    <group>
      <Ground />
      <BackPanel />
      <SceneActor capability={capability} tab={tab} />
    </group>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]} receiveShadow>
        <circleGeometry args={[7.5, 48]} />
        <meshStandardMaterial color="#0f172a" roughness={1} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.099, 0]} receiveShadow>
        <ringGeometry args={[2.3, 5.8, 48]} />
        <meshStandardMaterial color="#111827" roughness={1} metalness={0} />
      </mesh>
      <gridHelper args={[10, 20, "#1f2937", "#0f172a"]} position={[0, -1.08, 0]} />
    </group>
  );
}

function BackPanel() {
  return (
    <mesh position={[0, 2.1, -3.3]}>
      <planeGeometry args={[9.5, 6]} />
      <meshStandardMaterial color="#050b18" roughness={1} metalness={0} />
    </mesh>
  );
}

function SceneActor({ capability, tab }: { capability: Capability; tab: TabKey }) {
  const theme = capability.scene;
  const demo = capability.demo;
  switch (theme) {
    case "lamp":
      return <LampScene demo={demo} tab={tab} capability={capability} />;
    case "battery":
      return <BatteryScene demo={demo} tab={tab} capability={capability} />;
    case "crate":
      return <CrateScene demo={demo} tab={tab} capability={capability} />;
    case "glider":
      return <GliderScene demo={demo} tab={tab} capability={capability} />;
    case "gear":
      return <GearScene demo={demo} tab={tab} capability={capability} />;
    case "rocket":
      return <RocketScene demo={demo} tab={tab} capability={capability} />;
    case "drone":
      return <DroneScene demo={demo} tab={tab} capability={capability} />;
    case "piston":
      return <PistonScene demo={demo} tab={tab} capability={capability} />;
    case "planet":
      return <PlanetScene demo={demo} tab={tab} capability={capability} />;
    case "lab":
      return <LabScene demo={demo} tab={tab} capability={capability} />;
    case "magnet":
      return <MagnetScene demo={demo} tab={tab} capability={capability} />;
    case "blobs":
      return <BlobsScene demo={demo} tab={tab} capability={capability} />;
    case "cart":
      return <CartScene demo={demo} tab={tab} capability={capability} />;
    case "tower":
      return <TowerScene demo={demo} tab={tab} capability={capability} />;
    case "museum":
      return <MuseumScene demo={demo} tab={tab} capability={capability} />;
    case "launchpad":
      return <LaunchpadScene demo={demo} tab={tab} capability={capability} />;
    case "statue":
      return <StatueScene demo={demo} tab={tab} capability={capability} />;
    case "studio":
    default:
      return <StudioScene demo={demo} tab={tab} capability={capability} />;
  }
}

function LabelTag({ children, position = [0, 0, 0] }: { children: ReactNode; position?: [number, number, number] }) {
  return (
    <Html position={position} center style={{ pointerEvents: "none" }}>
      <div style={labelTagStyle}>{children}</div>
    </Html>
  );
}

function LampScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const group = useRefSafe<THREE.Group>();
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    const visible = demo === "show" ? smooth01((Math.sin(t * 0.9) + 1) / 2) : 1 - smooth01((Math.sin(t * 0.9) + 1) / 2);
    group.current.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (material && "opacity" in material) {
        const mat = material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = 0.2 + visible * 0.8;
      }
    });
  });
  return (
    <group ref={group} position={[0, -0.25, 0]}>
      <mesh position={[0, -0.65, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.9, 1, 0.18, 32]} />
        <meshStandardMaterial color="#1f2937" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.05, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 1, 20]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.45} roughness={0.4} />
      </mesh>
      <mesh position={[0.45, 0.55, 0]} rotation={[0, 0, -0.65]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 1.4, 20]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[1.0, 1.0, 0]} rotation={[0, 0, -0.3]} castShadow>
        <coneGeometry args={[0.45, 0.8, 24]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.15} roughness={0.45} />
      </mesh>
      <pointLight position={[1.15, 0.85, 0]} intensity={2.6} color="#fef3c7" distance={5.5} />
      <mesh position={[1.15, 0.82, 0]}>
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshStandardMaterial color="#fde68a" emissive="#fcd34d" emissiveIntensity={1.4} />
      </mesh>
      <LabelTag position={[1.2, 1.65, 0]}>lamp</LabelTag>
    </group>
  );
}

function BatteryScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const batteryRef = useRefSafe<THREE.Mesh>();
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (batteryRef.current && demo === "highlight") {
      const mat = batteryRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive = new THREE.Color("#0ea5e9");
      mat.emissiveIntensity = 0.4 + ((Math.sin(t * 2.2) + 1) / 2) * 1.2;
    }
  });
  return (
    <group position={[0, -0.2, 0]}>
      <mesh ref={batteryRef} position={[-1.15, 0.05, 0]} castShadow>
        <boxGeometry args={[0.8, 1.6, 0.8]} />
        <meshStandardMaterial color="#22c55e" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[-1.15, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.18, 18]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[1.05, 0.1, 0]} castShadow>
        <sphereGeometry args={[0.58, 24, 24]} />
        <meshStandardMaterial color="#fde68a" emissive="#f59e0b" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0, 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[1.05, 0.05, 16, 64, Math.PI * 0.95]} />
        <meshStandardMaterial color="#38bdf8" />
      </mesh>
      {demo === "relationship" ? <mesh position={[0, 0.62, 0]} rotation={[0, 0, -0.28]}><coneGeometry args={[0.14, 0.3, 18]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.35} /></mesh> : null}
      <LabelTag position={[-1.15, -1.05, 0]}>battery</LabelTag>
      <LabelTag position={[1.05, -1.05, 0]}>bulb</LabelTag>
    </group>
  );
}

function CrateScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const crate = useRefSafe<THREE.Group>();
  useFrame((state) => {
    if (!crate.current) return;
    const t = state.clock.getElapsedTime();
    crate.current.position.x = Math.sin(t * 0.9) * 1.8;
  });
  return (
    <group>
      <mesh position={[0, -0.95, 0]}>
        <boxGeometry args={[4.8, 0.18, 1.6]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <group ref={crate} position={[0, -0.2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.1, 1.1, 1.1]} />
          <meshStandardMaterial color="#d97706" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0, 0.56]}>
          <boxGeometry args={[0.92, 0.92, 0.06]} />
          <meshStandardMaterial color="#fcd34d" roughness={0.75} />
        </mesh>
      </group>
      <LabelTag position={[0, 1.1, 0]}>slide</LabelTag>
    </group>
  );
}

function GliderScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const glider = useRefSafe<THREE.Group>();
  useFrame((state) => {
    if (!glider.current) return;
    const t = state.clock.getElapsedTime();
    glider.current.position.x = Math.sin(t * 0.75) * 2.1;
    glider.current.position.y = 0.6 + Math.sin(t * 1.5) * 0.35;
    glider.current.rotation.z = Math.sin(t * 0.8) * 0.22;
  });
  return (
    <group ref={glider}>
      <mesh castShadow>
        <capsuleGeometry args={[0.18, 1.2, 6, 16]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[1.6, 0.08, 0.34]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.4} />
      </mesh>
      <mesh position={[-0.65, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.42, 0.08, 0.24]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
    </group>
  );
}

function GearScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const gear = useRefSafe<THREE.Group>();
  useFrame((state) => {
    if (!gear.current) return;
    gear.current.rotation.z = -state.clock.getElapsedTime() * 1.2;
  });
  return (
    <group position={[0, 0, 0]} ref={gear}>
      <mesh castShadow>
        <cylinderGeometry args={[1.0, 1.0, 0.35, 20]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.65} roughness={0.3} />
      </mesh>
      {Array.from({ length: 10 }).map((_, index) => {
        const a = (index / 10) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(a) * 1.12, Math.sin(a) * 1.12, 0]} rotation={[0, 0, a]} castShadow>
            <boxGeometry args={[0.22, 0.32, 0.32]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.3} />
          </mesh>
        );
      })}
      <mesh>
        <cylinderGeometry args={[0.26, 0.26, 0.5, 18]} />
        <meshStandardMaterial color="#0f172a" metalness={0.25} roughness={0.7} />
      </mesh>
    </group>
  );
}

function RocketScene({ demo, tab }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const rocket = useRefSafe<THREE.Group>();
  useFrame((state) => {
    if (!rocket.current) return;
    const t = state.clock.getElapsedTime();
    if (tab === "motions" && demo === "scale") {
      const s = 0.9 + ((Math.sin(t * 2.1) + 1) / 2) * 0.35;
      rocket.current.scale.setScalar(s);
    } else if (tab === "camera" && demo === "attached") {
      rocket.current.position.y = -0.2 + Math.sin(t * 0.85) * 1.4;
      rocket.current.position.z = -1.2;
    }
  });
  return (
    <group ref={rocket} position={[0, -0.1, tab === "camera" && demo === "attached" ? -1.2 : 0]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.36, 1.8, 8, 16]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.35} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <coneGeometry args={[0.34, 0.7, 20]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {[[-0.32, -0.75, 0], [0.32, -0.75, 0], [0, -0.75, 0.3]].map((pos, index) => (
        <mesh key={index} position={pos as [number, number, number]} rotation={[0, 0, index === 2 ? 0 : index === 0 ? 0.4 : -0.4]} castShadow>
          <boxGeometry args={[0.08, 0.52, 0.28]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>
      ))}
      <mesh position={[0, -1.25, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.16, 0.6, 16]} />
        <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={1.1} />
      </mesh>
    </group>
  );
}

function DroneScene({ demo, tab }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const drone = useRefSafe<THREE.Group>();
  const follower = useRefSafe<THREE.Mesh>();
  useFrame((state) => {
    if (!drone.current) return;
    const t = state.clock.getElapsedTime();
    const x = Math.sin(t * 0.75) * 2.0;
    const y = 0.9 + Math.sin(t * 1.4) * 0.25;
    const z = Math.cos(t * 0.45) * 0.4;
    drone.current.position.set(x, y, z);
    drone.current.rotation.y = Math.sin(t * 0.7) * 0.45;
    if (demo === "anchor" && follower.current) {
      follower.current.position.set(x, y - 0.95, z);
    }
  });
  return (
    <group>
      <group ref={drone}>
        <mesh castShadow>
          <boxGeometry args={[0.65, 0.18, 0.65]} />
          <meshStandardMaterial color="#0ea5e9" metalness={0.4} roughness={0.35} />
        </mesh>
        {[[-0.55, 0, -0.55], [0.55, 0, -0.55], [-0.55, 0, 0.55], [0.55, 0, 0.55]].map((pos, index) => (
          <group key={index} position={pos as [number, number, number]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 0.45, 12]} />
              <meshStandardMaterial color="#cbd5e1" />
            </mesh>
            <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.18, 0.03, 12, 20]} />
              <meshStandardMaterial color="#94a3b8" emissive="#38bdf8" emissiveIntensity={0.2} />
            </mesh>
          </group>
        ))}
      </group>
      {demo === "trace" ? <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}><torusGeometry args={[2.0, 0.025, 12, 90]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.35} /></mesh> : null}
      {demo === "anchor" ? (
        <>
          <mesh ref={follower} castShadow>
            <boxGeometry args={[0.42, 0.42, 0.42]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.5} />
          </mesh>
          <LabelTag position={[0, 2.25, 0]}>moving anchor</LabelTag>
        </>
      ) : null}
    </group>
  );
}

function PistonScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const rod = useRefSafe<THREE.Mesh>();
  const piston = useRefSafe<THREE.Mesh>();
  const wheel = useRefSafe<THREE.Group>();
  const pinBall = useRefSafe<THREE.Mesh>();
  useFrame((state) => {
    const t = state.clock.getElapsedTime() * 0.9;
    const crankAngle = t;
    const cx = 1.35;
    const cy = 0.0;
    const r = 0.72;
    const sliderX = -1.2;
    const rodLength = 2.4;
    const pinX = cx + Math.cos(crankAngle) * r;
    const pinY = cy + Math.sin(crankAngle) * r;
    const dx = sliderX - pinX;
    const dy = Math.sqrt(Math.max(rodLength * rodLength - dx * dx, 0.1));
    const pistonY = pinY + dy;
    if (piston.current) piston.current.position.set(sliderX, pistonY, 0);
    if (pinBall.current) pinBall.current.position.set(pinX, pinY, 0.18);
    if (wheel.current) wheel.current.rotation.z = -crankAngle;
    if (rod.current) {
      const mx = (sliderX + pinX) / 2;
      const my = (pistonY + pinY) / 2;
      const len = Math.hypot(dx, pistonY - pinY);
      rod.current.position.set(mx, my, 0);
      rod.current.scale.set(1, len, 1);
      rod.current.rotation.z = Math.atan2(pistonY - pinY, dx) - Math.PI / 2;
    }
  });
  return (
    <group position={[0, -0.35, 0]}>
      <mesh position={[-1.2, 1.0, 0]}>
        <boxGeometry args={[0.7, 3.0, 0.5]} />
        <meshStandardMaterial color="#0f172a" roughness={1} />
      </mesh>
      <mesh ref={piston} castShadow>
        <boxGeometry args={[0.72, 0.5, 0.5]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.45} roughness={0.32} />
      </mesh>
      <mesh ref={rod} castShadow>
        <boxGeometry args={[0.16, 1, 0.16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.28} />
      </mesh>
      <group ref={wheel} position={[1.35, 0, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.84, 0.84, 0.22, 24]} />
          <meshStandardMaterial color="#38bdf8" metalness={0.35} roughness={0.34} />
        </mesh>
        <mesh>
          <torusGeometry args={[0.84, 0.06, 16, 50]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.16]}>
          <cylinderGeometry args={[0.09, 0.09, 0.4, 16]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      </group>
      <mesh ref={pinBall}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.5} />
      </mesh>
      {demo === "linkage" ? <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.35, 0, -0.22]}><torusGeometry args={[0.72, 0.018, 12, 64]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.45} /></mesh> : null}
      <LabelTag position={[-1.2, 2.45, 0]}>mechanism controller</LabelTag>
    </group>
  );
}

function PlanetScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const moon = useRefSafe<THREE.Group>();
  useFrame((state) => {
    if (!moon.current) return;
    const t = state.clock.getElapsedTime() * 0.7;
    moon.current.position.set(Math.cos(t) * 2.0, 0.6 + Math.sin(t * 0.5) * 0.12, Math.sin(t) * 2.0);
  });
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <sphereGeometry args={[1.0, 24, 24]} />
        <meshStandardMaterial color="#22c55e" roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <torusGeometry args={[2.0, 0.03, 12, 80]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.25} />
      </mesh>
      <group ref={moon}>
        <mesh castShadow>
          <sphereGeometry args={[0.34, 20, 20]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

function LabScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const beaker = useRefSafe<THREE.Group>();
  const spoon = useRefSafe<THREE.Group>();
  const stream = useRefSafe<THREE.Group>();
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (beaker.current && demo === "pour") {
      beaker.current.rotation.z = -0.5 + Math.sin(t * 0.8) * 0.35;
      beaker.current.position.x = -1.2 + Math.sin(t * 0.8) * 0.3;
    }
    if (spoon.current && demo === "stir") {
      spoon.current.position.x = Math.cos(t * 1.4) * 0.42;
      spoon.current.position.z = Math.sin(t * 1.4) * 0.42;
      spoon.current.position.y = 0.15;
      spoon.current.rotation.y = t * 1.4;
    }
    if (stream.current) {
      stream.current.visible = demo === "pour" || demo === "filter" || demo === "flow";
    }
  });
  return (
    <group position={[0, -0.3, 0]}>
      <mesh position={[0, -0.78, 0]}>
        <boxGeometry args={[4.2, 0.18, 2.2]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <group ref={beaker} position={[-1.25, 0.2, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.48, 0.52, 1.1, 24, 1, true]} />
          <meshStandardMaterial color="#cbd5e1" transparent opacity={0.35} roughness={0.15} metalness={0.1} />
        </mesh>
        <mesh position={[0, -0.15, 0]}>
          <cylinderGeometry args={[0.43, 0.43, 0.58, 24]} />
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.7} />
        </mesh>
      </group>
      <group position={[1.2, 0.05, 0]}>
        {demo === "filter" ? (
          <mesh position={[0, 0.55, 0]}>
            <coneGeometry args={[0.55, 0.8, 24, 1, true]} />
            <meshStandardMaterial color="#e2e8f0" transparent opacity={0.35} />
          </mesh>
        ) : (
          <mesh castShadow>
            <cylinderGeometry args={[0.58, 0.62, 1.0, 24, 1, true]} />
            <meshStandardMaterial color="#cbd5e1" transparent opacity={0.32} />
          </mesh>
        )}
        <mesh position={[0, -0.15, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.5, 24]} />
          <meshStandardMaterial color={demo === "filter" ? "#86efac" : "#7dd3fc"} transparent opacity={0.75} />
        </mesh>
      </group>
      {demo === "stir" ? (
        <group ref={spoon}>
          <mesh position={[0, 0.8, 0]} rotation={[0, 0, 0.2]}>
            <cylinderGeometry args={[0.04, 0.04, 1.6, 12]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0.08, 0.0, 0]}>
            <sphereGeometry args={[0.11, 14, 14]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.3} />
          </mesh>
        </group>
      ) : null}
      {(demo === "pour" || demo === "filter" || demo === "flow") ? (
        <group ref={stream}>
          {Array.from({ length: 10 }).map((_, index) => (
            <mesh key={index} position={[demo === "flow" ? -1.3 + index * 0.26 : 0.0 + index * 0.05, demo === "flow" ? 0.1 + Math.sin(index) * 0.18 : 0.8 - index * 0.18, 0]}>
              <sphereGeometry args={[0.05, 10, 10]} />
              <meshStandardMaterial color={demo === "filter" ? (index < 4 ? "#f59e0b" : "#22c55e") : "#38bdf8"} />
            </mesh>
          ))}
        </group>
      ) : null}
    </group>
  );
}

function MagnetScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const cube = useRefSafe<THREE.Mesh>();
  useFrame((state) => {
    if (!cube.current) return;
    const t = state.clock.getElapsedTime();
    const p = (Math.sin(t * 1.0) + 1) / 2;
    cube.current.position.set(lerp(-1.6, -0.25, p), lerp(-0.2, 0.9, p), 0);
  });
  return (
    <group>
      <group position={[0.8, 0.2, 0]}>
        <mesh position={[-0.35, 0, 0]}><boxGeometry args={[0.4, 1.6, 0.36]} /><meshStandardMaterial color="#ef4444" /></mesh>
        <mesh position={[0.35, 0, 0]}><boxGeometry args={[0.4, 1.6, 0.36]} /><meshStandardMaterial color="#60a5fa" /></mesh>
        <mesh position={[0, -0.55, 0]}><boxGeometry args={[1.08, 0.44, 0.4]} /><meshStandardMaterial color="#e2e8f0" metalness={0.35} roughness={0.35} /></mesh>
      </group>
      <mesh ref={cube} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
    </group>
  );
}

function BlobsScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const ref0 = useRefSafe<THREE.Mesh>();
  const ref1 = useRefSafe<THREE.Mesh>();
  const ref2 = useRefSafe<THREE.Mesh>();
  const ref3 = useRefSafe<THREE.Mesh>();
  const ref4 = useRefSafe<THREE.Mesh>();
  const refs = [ref0, ref1, ref2, ref3, ref4];
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    refs.forEach((ref, index) => {
      if (!ref.current) return;
      if (demo === "scatter") {
        const a = (index / refs.length) * Math.PI * 2 + t * 0.25;
        const r = 0.7 + ((Math.sin(t * 0.9) + 1) / 2) * 1.0;
        ref.current.position.set(Math.cos(a) * r, Math.sin(a * 1.4) * 0.55, Math.sin(a) * r * 0.55);
      } else {
        const s = 0.72 + ((Math.sin(t * 1.3 + index * 0.5) + 1) / 2) * 0.65;
        ref.current.scale.set(1, s, 1);
      }
    });
  });
  return (
    <group>
      {refs.map((ref, index) => (
        <mesh key={index} ref={ref} position={[index * 0.32 - 0.64, 0.15, index % 2 === 0 ? 0.35 : -0.35]} castShadow>
          <sphereGeometry args={[0.34, 20, 20]} />
          <meshStandardMaterial color={["#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#fb7185"][index] ?? "#38bdf8"} roughness={0.65} />
        </mesh>
      ))}
    </group>
  );
}

function StudioScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  return (
    <group>
      <mesh position={[0, -0.15, 0]} castShadow>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.45} metalness={0.1} transparent={demo === "fade"} opacity={demo === "fade" ? 0.35 : 1} />
      </mesh>
      <mesh position={[2.0, -0.65, -0.6]}><boxGeometry args={[0.9, 0.18, 0.9]} /><meshStandardMaterial color="#334155" /></mesh>
      <mesh position={[-2.0, -0.45, 0.5]}><cylinderGeometry args={[0.42, 0.42, 0.58, 18]} /><meshStandardMaterial color="#22c55e" /></mesh>
    </group>
  );
}

function CartScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  const cart = useRefSafe<THREE.Group>();
  useFrame((state) => {
    if (!cart.current) return;
    cart.current.position.x = Math.sin(state.clock.getElapsedTime() * 0.75) * 2.2;
  });
  return (
    <group>
      <mesh position={[0, -0.95, 0]}><boxGeometry args={[5.2, 0.16, 1.0]} /><meshStandardMaterial color="#475569" /></mesh>
      <group ref={cart} position={[0, -0.25, 0]}>
        <mesh castShadow><boxGeometry args={[1.4, 0.5, 0.9]} /><meshStandardMaterial color="#38bdf8" /></mesh>
        {[[-0.45, -0.35, 0.42], [0.45, -0.35, 0.42], [-0.45, -0.35, -0.42], [0.45, -0.35, -0.42]].map((pos, index) => (
          <mesh key={index} position={pos as [number, number, number]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.18, 0.05, 12, 20]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        ))}
        <mesh position={[0, 0.55, 0]}><boxGeometry args={[0.6, 0.38, 0.6]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      </group>
    </group>
  );
}

function TowerScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[1.2, 3.8, 1.2]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.7} />
      </mesh>
      <mesh position={[0, 3.0, 0]} castShadow>
        <coneGeometry args={[0.9, 1.1, 16]} />
        <meshStandardMaterial color="#0ea5e9" />
      </mesh>
      {Array.from({ length: 4 }).map((_, index) => (
        <mesh key={index} position={[0, -0.1 + index * 0.8, 0.61]}>
          <boxGeometry args={[0.46, 0.36, 0.05]} />
          <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={0.1} />
        </mesh>
      ))}
    </group>
  );
}

function MuseumScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  return (
    <group>
      {[-2.0, 0, 2.0].map((x, index) => (
        <group key={x} position={[x, -0.2, 0]}>
          <mesh position={[0, -0.58, 0]}><boxGeometry args={[1.0, 0.18, 1.0]} /><meshStandardMaterial color="#334155" /></mesh>
          <mesh castShadow>
            {index === 0 ? <sphereGeometry args={[0.52, 24, 24]} /> : index === 1 ? <boxGeometry args={[0.9, 0.9, 0.9]} /> : <coneGeometry args={[0.55, 1.2, 24]} />}
            <meshStandardMaterial color={["#38bdf8", "#22c55e", "#f59e0b"][index] ?? "#38bdf8"} roughness={0.5} metalness={0.1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function LaunchpadScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  return (
    <group>
      <mesh position={[0, -0.92, 0]}><cylinderGeometry args={[2.2, 2.2, 0.16, 30]} /><meshStandardMaterial color="#1f2937" /></mesh>
      <mesh position={[0, 0.15, 0]} castShadow><cylinderGeometry args={[0.44, 0.54, 2.1, 24]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      <mesh position={[0, 1.28, 0]} castShadow><coneGeometry args={[0.42, 0.8, 20]} /><meshStandardMaterial color="#ef4444" /></mesh>
      <mesh position={[1.0, 0.3, -0.2]}><boxGeometry args={[0.2, 2.2, 0.2]} /><meshStandardMaterial color="#475569" /></mesh>
      <mesh position={[1.0, 1.25, -0.2]}><boxGeometry args={[1.0, 0.15, 0.15]} /><meshStandardMaterial color="#475569" /></mesh>
    </group>
  );
}

function StatueScene({ demo }: { demo: DemoKind; tab: TabKey; capability: Capability }) {
  return (
    <group>
      <mesh position={[0, -0.62, 0]}><cylinderGeometry args={[1.1, 1.3, 0.4, 24]} /><meshStandardMaterial color="#334155" /></mesh>
      <mesh position={[0, 0.5, 0]} castShadow><icosahedronGeometry args={[0.95, 0]} /><meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.35} /></mesh>
      <mesh position={[0, 1.95, 0]} castShadow><sphereGeometry args={[0.24, 18, 18]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.25} /></mesh>
    </group>
  );
}

function useRefSafe<T>() {
  return useRef<T | null>(null);
}

function CapabilityCard({
  capability,
  selected,
  onSelect,
}: {
  capability: Capability;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        ...catalogueCardStyle,
        ...(selected ? selectedCatalogueCardStyle : null),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ textAlign: "left" }}>
          <div style={{ color: "#7dd3fc", fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>{capability.category}</div>
          <h3 style={{ margin: "5px 0 0", fontSize: 16 }}>{capability.label}</h3>
        </div>
        <span style={{ ...statusPillBaseStyle, borderColor: statusColor(capability.status), color: statusColor(capability.status) }}>{capitalize(capability.status)}</span>
      </div>
      <p style={{ margin: 0, color: "rgba(255,255,255,0.66)", lineHeight: 1.5, fontSize: 12, textAlign: "left" }}>{capability.summary}</p>
      <div style={{ ...codeBlockStyle, textAlign: "left" }}>{capability.json}</div>
    </button>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return <div style={metaItemStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function SelectedCapabilityViewer({ capability, tab }: { capability: Capability; tab: TabKey }) {
  return (
    <section style={selectedViewerShellStyle}>
      <div style={selectedViewerCanvasStyle}>
        <PreviewCanvas key={`${tab}:${capability.id}`} capability={capability} tab={tab} />
      </div>
      <div style={selectedViewerDetailsStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#7dd3fc", fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>{capability.category}</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 26 }}>{capability.label}</h2>
          </div>
          <span style={{ ...statusPillBaseStyle, borderColor: statusColor(capability.status), color: statusColor(capability.status) }}>{capitalize(capability.status)}</span>
        </div>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.74)", lineHeight: 1.65 }}>{capability.summary}</p>
        <div style={codeBlockStyle}>{capability.json}</div>
        <div style={metaGridStyle}>
          <MetaItem label="Scrubbable" value={capability.scrubbable ? "Yes" : "No"} />
          <MetaItem label="Meaning" value={capability.preservesMeaning ? "Preserved" : "Approximate"} />
          <MetaItem label="Preview scene" value={capability.scene} />
        </div>
        {capability.fallback ? <div style={fallbackStyle}><strong>Fallback:</strong> {capability.fallback}</div> : null}
        <div style={viewerNoteStyle}>
          One shared WebGL viewer is used for the selected capability. This prevents browser WebGL-context loss and keeps every motion and camera preview reliable.
        </div>
      </div>
    </section>
  );
}

export function MotionCameraLibraryLab() {
  const [tab, setTab] = useState<TabKey>("motions");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CapabilityStatus | "all">("all");
  const [selectedId, setSelectedId] = useState(motions[0]?.id ?? "");

  const catalogue = tab === "motions" ? motions : cameras;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalogue.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const haystack = `${item.label} ${item.category} ${item.summary} ${item.json} ${item.scene}`.toLowerCase();
      const matchesQuery = !needle || haystack.includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [catalogue, query, statusFilter]);

  useEffect(() => {
    const selectedStillVisible = filtered.some((item) => item.id === selectedId);
    if (!selectedStillVisible) setSelectedId(filtered[0]?.id ?? catalogue[0]?.id ?? "");
  }, [catalogue, filtered, selectedId]);

  const selectedCapability = catalogue.find((item) => item.id === selectedId) ?? filtered[0] ?? catalogue[0] ?? null;

  function changeTab(nextTab: TabKey) {
    setTab(nextTab);
    setQuery("");
    setStatusFilter("all");
    setSelectedId((nextTab === "motions" ? motions : cameras)[0]?.id ?? "");
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ display: "grid", gap: 12 }}>
          <div style={eyebrowPageStyle}>MyWay Probe Lab</div>
          <h1 style={{ margin: 0, fontSize: "clamp(2.2rem, 4vw, 4rem)" }}>Motion &amp; Camera Library</h1>
          <p style={subtitleStyle}>
            Select a registered capability to inspect it in one stable Asset-Library-style 3D viewer. The catalogue remains easy to extend, while a single WebGL context prevents blank or disappearing previews.
          </p>
        </header>

        <section style={toolbarStyle}>
          <div style={tabRowStyle}>
            {(["motions", "camera"] as TabKey[]).map((item) => {
              const selected = item === tab;
              return (
                <button key={item} type="button" onClick={() => changeTab(item)} style={{ ...tabButtonStyle, ...(selected ? activeTabButtonStyle : null) }}>
                  {item === "motions" ? "Motion previews" : "Camera previews"}
                </button>
              );
            })}
          </div>
          <div style={controlsRowStyle}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${tab}...`} style={searchStyle} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CapabilityStatus | "all")} style={selectStyle}>
              <option value="all">All statuses</option>
              <option value="direct">Direct</option>
              <option value="controller">Controller</option>
              <option value="approximate">Approximate</option>
              <option value="declared">Declared</option>
            </select>
          </div>
          <div style={statsRowStyle}>
            <span style={infoPillStyle}>{catalogue.length} registered {tab === "motions" ? "motions" : "camera moves"}</span>
            <span style={infoPillStyle}>{filtered.length} visible in the catalogue</span>
            <span style={infoPillStyle}>1 active WebGL preview</span>
          </div>
        </section>

        {selectedCapability ? <SelectedCapabilityViewer capability={selectedCapability} tab={tab} /> : null}

        <section style={catalogueGridStyle}>
          {filtered.map((capability) => (
            <CapabilityCard
              key={capability.id}
              capability={capability}
              selected={capability.id === selectedCapability?.id}
              onSelect={() => setSelectedId(capability.id)}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(circle at top, rgba(56,189,248,0.18), transparent 25%), linear-gradient(180deg, #020617, #030712 30%, #020617)",
  color: "white",
  padding: "min(4vw, 32px)",
};
const shellStyle: CSSProperties = { width: "min(1680px, 100%)", margin: "0 auto", display: "grid", gap: 22 };
const eyebrowPageStyle: CSSProperties = { color: "#7dd3fc", fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 12 };
const subtitleStyle: CSSProperties = { margin: 0, maxWidth: 1100, color: "rgba(255,255,255,0.72)", lineHeight: 1.65, fontSize: 15 };
const toolbarStyle: CSSProperties = { display: "grid", gap: 14, padding: 16, borderRadius: 22, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(3,7,18,0.74)", boxShadow: "0 20px 60px rgba(0,0,0,0.22)" };
const tabRowStyle: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const tabButtonStyle: CSSProperties = { borderWidth: 1, borderStyle: "solid", borderColor: "rgba(255,255,255,0.16)", borderRadius: 999, padding: "10px 14px", background: "rgba(255,255,255,0.06)", color: "white", cursor: "pointer", fontWeight: 800 };
const activeTabButtonStyle: CSSProperties = { background: "linear-gradient(135deg, rgba(14,165,233,0.25), rgba(59,130,246,0.25))", borderColor: "rgba(125,211,252,0.6)", color: "#e0f2fe" };
const controlsRowStyle: CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };
const searchStyle: CSSProperties = { flex: "1 1 340px", minWidth: 240, borderRadius: 14, border: "1px solid rgba(125,211,252,0.2)", background: "#020617", color: "#dbeafe", padding: "12px 14px", fontSize: 14 };
const selectStyle: CSSProperties = { minWidth: 170, borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", background: "#020617", color: "#dbeafe", padding: "12px 14px", fontSize: 14 };
const statsRowStyle: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const infoPillStyle: CSSProperties = { borderRadius: 999, padding: "7px 10px", background: "rgba(125,211,252,0.08)", border: "1px solid rgba(125,211,252,0.16)", color: "#bae6fd", fontSize: 12 };
const previewShellStyle: CSSProperties = { height: "100%", minHeight: 460, borderBottom: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(180deg, rgba(2,6,23,0.8), rgba(15,23,42,0.45))" };
const statusPillBaseStyle: CSSProperties = { borderRadius: 999, padding: "6px 10px", borderWidth: 1, borderStyle: "solid", borderColor: "currentColor", fontSize: 12, fontWeight: 900, background: "rgba(255,255,255,0.03)" };
const codeBlockStyle: CSSProperties = { borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "#020617", color: "#7dd3fc", padding: "10px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 };
const metaGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 };
const metaItemStyle: CSSProperties = { display: "grid", gap: 5, padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "rgba(255,255,255,0.65)" };
const fallbackStyle: CSSProperties = { padding: 10, borderRadius: 12, background: "rgba(120,53,15,0.24)", border: "1px solid rgba(251,191,36,0.2)", color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 1.5 };
const labelTagStyle: CSSProperties = { borderRadius: 999, background: "rgba(2,6,23,0.82)", border: "1px solid rgba(125,211,252,0.16)", color: "#e0f2fe", fontSize: 10, padding: "4px 8px", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 900 };

export default MotionCameraLibraryLab;

const selectedViewerShellStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(300px, 0.72fr)", gap: 0, overflow: "hidden", borderRadius: 26, border: "1px solid rgba(125,211,252,0.18)", background: "rgba(3,7,18,0.82)", boxShadow: "0 24px 80px rgba(0,0,0,0.28)" };
const selectedViewerCanvasStyle: CSSProperties = { minWidth: 0, minHeight: 460, borderRight: "1px solid rgba(255,255,255,0.08)" };
const selectedViewerDetailsStyle: CSSProperties = { display: "grid", alignContent: "start", gap: 15, padding: 20 };
const viewerNoteStyle: CSSProperties = { borderRadius: 14, padding: 12, background: "rgba(14,165,233,0.08)", border: "1px solid rgba(125,211,252,0.16)", color: "rgba(224,242,254,0.76)", fontSize: 12, lineHeight: 1.55 };
const catalogueGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 12, alignItems: "stretch" };
const catalogueCardStyle: CSSProperties = { display: "grid", gap: 10, minHeight: 176, padding: 14, borderRadius: 18, borderWidth: 1, borderStyle: "solid", borderColor: "rgba(255,255,255,0.1)", background: "rgba(3,7,18,0.68)", color: "white", cursor: "pointer", font: "inherit" };
const selectedCatalogueCardStyle: CSSProperties = { borderColor: "rgba(125,211,252,0.72)", background: "linear-gradient(135deg, rgba(14,165,233,0.14), rgba(59,130,246,0.08))", boxShadow: "inset 0 0 0 1px rgba(125,211,252,0.16)" };

