"use client";

import { TrackballControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode, type MutableRefObject } from "react";
import * as THREE from "three";
import { bodyParts3dSemanticMaterialForSystem } from "../../assets/bodyparts3d-slp-pilot";
import {
  type AnatomyDirectorProgram, type DirectorAsset, type CameraKeyframe,
  type ObjectKeyframe, sampleKeyframes, lerpNumber, lerpVec,
} from "../anatomy-director/contract";

function cameraAt(program: AnatomyDirectorProgram, t: number): CameraKeyframe {
  return sampleKeyframes(program.camera_keyframes, t, (a, b, f) => ({
    t, position: lerpVec(a.position, b.position, f), target: lerpVec(a.target, b.target, f),
  }));
}
function objectAt(program: AnatomyDirectorProgram, t: number): ObjectKeyframe {
  return sampleKeyframes(program.object_keyframes, t, (a, b, f) => ({
    t, position: lerpVec(a.position, b.position, f), rotation_deg: lerpVec(a.rotation_deg, b.rotation_deg, f),
    scale: lerpNumber(a.scale, b.scale, f), opacity: lerpNumber(a.opacity, b.opacity, f),
  }));
}

function DirectorScene({asset, program, timeRef, playing, onTime}: {
  asset: DirectorAsset;
  program: AnatomyDirectorProgram | null;
  timeRef: MutableRefObject<number>;
  playing: boolean;
  onTime: (value: number) => void;
}) {
  const gltf = useGLTF(asset.model_url);
  const {camera} = useThree();
  const animated = useRef<THREE.Group>(null);
  const lastTime = useRef(-1);
  const lastReport = useRef(-1);
  const assetScene = useMemo(() => {
    // Apply saved BodyParts3D member transforms BEFORE centering/scaling the single element.
    const inner = gltf.scene.clone(true);
    inner.position.set(...asset.runtime_transform.position);
    inner.rotation.set(...asset.runtime_transform.rotation);
    inner.scale.set(...asset.runtime_transform.scale);
    const wrapper = new THREE.Group();
    wrapper.add(inner);
    wrapper.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrapper);
    const dimensions = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(dimensions); box.getCenter(center);
    const maxDimension = Math.max(dimensions.x, dimensions.y, dimensions.z);
    const normalize = Number.isFinite(maxDimension) && maxDimension > 1e-7 ? 1 / maxDimension : 1;
    wrapper.position.copy(center.multiplyScalar(-normalize));
    wrapper.scale.setScalar(normalize);
    const materials: THREE.Material[] = [];
    inner.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      const originals = Array.isArray(child.material) ? child.material : [child.material];
      const semantic = bodyParts3dSemanticMaterialForSystem(asset.system);
      const clones = originals.map((old) => {
        const material = semantic
          ? new THREE.MeshStandardMaterial({
              color: semantic.base_color,
              roughness: semantic.roughness,
              metalness: semantic.metalness,
            })
          : old.clone();
        material.transparent = true;
        materials.push(material);
        return material;
      });
      child.material = Array.isArray(child.material) ? clones : clones[0]!;
    });
    return {wrapper, materials};
  }, [gltf.scene, asset]);
  useEffect(() => () => { assetScene.materials.forEach((mat) => mat.dispose()); }, [assetScene]);
  useEffect(() => { lastTime.current = -1; lastReport.current = -1; }, [program]);
  useFrame((_state, delta) => {
    if (!program) return;
    if (playing) timeRef.current = Math.min(program.duration_s, timeRef.current + Math.min(delta, 0.1));
    const t = timeRef.current;
    if (t === lastTime.current) return;
    lastTime.current = t;
    const pose = objectAt(program, t);
    if (animated.current) {
      animated.current.position.set(...pose.position);
      animated.current.rotation.set(...pose.rotation_deg.map((v) => THREE.MathUtils.degToRad(v)) as [number,number,number]);
      animated.current.scale.setScalar(pose.scale);
    }
    for (const material of assetScene.materials) {
      material.opacity = pose.opacity;
      material.depthWrite = pose.opacity > 0.98;
    }
    const shot = cameraAt(program, t);
    camera.position.set(...shot.position);
    camera.lookAt(...shot.target);
    if (t === 0 || t === program.duration_s || Math.abs(t - lastReport.current) > 0.11) {
      lastReport.current = t;
      onTime(t);
    }
  });
  return <>
    <group ref={animated}><primitive object={assetScene.wrapper}/></group>
    <ambientLight intensity={1.15}/>
    <hemisphereLight args={[0xe8f2ff,0x293447,1.35]}/>
    <directionalLight position={[3,5,4]} intensity={2.4}/>
    <directionalLight position={[-3,1,-2]} intensity={1.1}/>
    <TrackballControls enabled={!playing} noPan rotateSpeed={3.2} zoomSpeed={1.2} dynamicDampingFactor={0.11}/>
  </>;
}

class AssetErrorBoundary extends Component<{children:ReactNode;onError:(message:string)=>void}, {failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidCatch(error: Error) { this.props.onError(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function AnatomyDirectorPlayer({asset, program, playing, time, onTime, onError}: {
  asset: DirectorAsset | null;
  program: AnatomyDirectorProgram | null;
  playing: boolean;
  time: number;
  onTime:(value:number)=>void;
  onError:(message:string)=>void;
}) {
  const timeRef = useRef(time);
  useEffect(() => { timeRef.current = time; }, [time]);
  const report = useCallback((value:number) => onTime(value), [onTime]);
  if (!asset) return <div style={{height:420,display:"grid",placeItems:"center",color:"#94a3b8"}}>Select an anatomy asset to begin.</div>;
  return <div style={{width:"100%",height:450,position:"relative"}}>
    <Canvas key={asset.asset_id} camera={{position:[0,0.2,2.8],near:0.01,far:100,fov:40}} style={{background:"radial-gradient(circle,#203046,#070e1b)"}}>
      <AssetErrorBoundary onError={onError}>
        <Suspense fallback={null}>
          <DirectorScene asset={asset} program={program} timeRef={timeRef} playing={playing} onTime={report}/>
        </Suspense>
      </AssetErrorBoundary>
    </Canvas>
    {!program && <div style={{position:"absolute",bottom:12,left:12,padding:"7px 10px",borderRadius:8,background:"#020617be",fontSize:12,color:"#cbd5e1"}}>Asset ready for manual inspection · Generate to animate</div>}
  </div>;
}
