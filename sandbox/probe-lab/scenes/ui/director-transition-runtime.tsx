"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { DirectorMoment } from "../../director/director-contract";
import {
  sampleDirectorCameraPose,
  type DirectorCameraPose,
  type DirectorRuntimeActor,
} from "./director-shot-runtime";

const CROSSFADE_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const CROSSFADE_FRAGMENT_SHADER = `
  uniform sampler2D uFromShot;
  uniform sampler2D uToShot;
  uniform float uMix;
  varying vec2 vUv;

  void main() {
    vec4 fromShot = texture2D(uFromShot, vUv);
    vec4 toShot = texture2D(uToShot, vUv);
    gl_FragColor = mix(fromShot, toShot, uMix);
  }
`;

function applyCameraPose(
  camera: THREE.PerspectiveCamera,
  pose: DirectorCameraPose,
  aspect: number,
) {
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  if (pose.roll) camera.rotateZ(pose.roll);
  camera.fov = pose.fov;
  camera.aspect = aspect;
  camera.near = 0.05;
  camera.far = 90;
  camera.updateProjectionMatrix();
}

/**
 * Shared Director image-space crossfade primitive.
 *
 * The compositor renders two complete camera states from the same live scene
 * into independent WebGL render targets, then performs a deterministic alpha
 * blend in the captured WebGL surface. This is intentionally not a camera
 * interpolation and does not rely on DOM overlays or qualification-only labels.
 *
 * The caller chooses the outgoing/incoming camera samples and blend window, so
 * this primitive can be reused by production sequencing once the shot compiler
 * owns explicit outgoing and incoming Director moments.
 */
export function DirectorShotCrossfadeCompositor({
  moment,
  actors,
  progress,
  fromProgress = 0.22,
  toProgress = 0.82,
  blendStartProgress = 0.34,
  blendEndProgress = 0.66,
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  progress: number;
  fromProgress?: number;
  toProgress?: number;
  blendStartProgress?: number;
  blendEndProgress?: number;
}) {
  const { gl, scene, size, invalidate } = useThree();

  const fromCamera = useMemo(
    () => new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 90),
    [],
  );
  const toCamera = useMemo(
    () => new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 90),
    [],
  );
  const fromTarget = useMemo(
    () =>
      new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: true,
        stencilBuffer: false,
      }),
    [],
  );
  const toTarget = useMemo(
    () =>
      new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: true,
        stencilBuffer: false,
      }),
    [],
  );

  const composite = useMemo(() => {
    fromTarget.texture.generateMipmaps = false;
    fromTarget.texture.minFilter = THREE.LinearFilter;
    fromTarget.texture.magFilter = THREE.LinearFilter;
    toTarget.texture.generateMipmaps = false;
    toTarget.texture.minFilter = THREE.LinearFilter;
    toTarget.texture.magFilter = THREE.LinearFilter;

    const compositeScene = new THREE.Scene();
    const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    compositeCamera.position.z = 1;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uFromShot: { value: fromTarget.texture },
        uToShot: { value: toTarget.texture },
        uMix: { value: 0 },
      },
      vertexShader: CROSSFADE_VERTEX_SHADER,
      fragmentShader: CROSSFADE_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      toneMapped: false,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    compositeScene.add(new THREE.Mesh(geometry, material));

    return {
      scene: compositeScene,
      camera: compositeCamera,
      material,
      geometry,
    };
  }, [fromTarget, toTarget]);

  useEffect(() => {
    const drawingBufferSize = new THREE.Vector2();
    gl.getDrawingBufferSize(drawingBufferSize);
    const width = Math.max(1, Math.round(drawingBufferSize.x));
    const height = Math.max(1, Math.round(drawingBufferSize.y));
    fromTarget.setSize(width, height);
    toTarget.setSize(width, height);
    invalidate();
  }, [fromTarget, gl, invalidate, size.height, size.width, toTarget]);

  useEffect(() => {
    invalidate();
  }, [actors, invalidate, moment, progress]);

  useEffect(
    () => () => {
      composite.geometry.dispose();
      composite.material.dispose();
      fromTarget.dispose();
      toTarget.dispose();
    },
    [composite, fromTarget, toTarget],
  );

  useFrame(() => {
    const outgoingPose = sampleDirectorCameraPose(
      moment,
      THREE.MathUtils.clamp(fromProgress, 0, 1),
      actors,
    );
    const incomingPose = sampleDirectorCameraPose(
      moment,
      THREE.MathUtils.clamp(toProgress, 0, 1),
      actors,
    );
    const aspect = size.height > 0 ? size.width / size.height : 16 / 9;
    applyCameraPose(fromCamera, outgoingPose, aspect);
    applyCameraPose(toCamera, incomingPose, aspect);

    const start = THREE.MathUtils.clamp(blendStartProgress, 0, 1);
    const end = Math.max(start + 0.0001, THREE.MathUtils.clamp(blendEndProgress, 0, 1));
    const blend = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp(progress, 0, 1),
      start,
      end,
    );
    composite.material.uniforms.uMix.value = blend;

    const previousTarget = gl.getRenderTarget();
    const previousAutoClear = gl.autoClear;
    gl.autoClear = true;

    try {
      gl.setRenderTarget(fromTarget);
      gl.clear(true, true, true);
      gl.render(scene, fromCamera);

      gl.setRenderTarget(toTarget);
      gl.clear(true, true, true);
      gl.render(scene, toCamera);

      gl.setRenderTarget(previousTarget);
      gl.clear(true, true, true);
      gl.render(composite.scene, composite.camera);
    } finally {
      gl.setRenderTarget(previousTarget);
      gl.autoClear = previousAutoClear;
    }
  }, 1);

  return null;
}
