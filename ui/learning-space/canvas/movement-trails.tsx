"use client";

import type { RefObject } from "react";
import * as THREE from "three";

export function MovementTrail({
  geometryRef,
  materialRef,
}: {
  geometryRef: RefObject<THREE.BufferGeometry | null>;
  materialRef: RefObject<THREE.LineBasicMaterial | null>;
}) {
  return (
    <line>
      <bufferGeometry ref={geometryRef} />
      <lineBasicMaterial
        ref={materialRef}
        color="#ffffff"
        transparent
        opacity={0}
        depthWrite={false}
        depthTest={false}
      />
    </line>
  );
}
