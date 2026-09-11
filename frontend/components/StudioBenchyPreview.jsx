import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const PLA = {
  color: "#F3EEE4",
  roughness: 0.38,
  metalness: 0.04,
};

function deckOutline() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 7.6);
  shape.bezierCurveTo(2.15, 6.4, 2.55, 3.4, 2.4, 0.6);
  shape.lineTo(2.28, -3.4);
  shape.bezierCurveTo(2.15, -5.4, 1.35, -6.45, 0, -6.55);
  shape.bezierCurveTo(-1.35, -6.45, -2.15, -5.4, -2.28, -3.4);
  shape.lineTo(-2.4, 0.6);
  shape.bezierCurveTo(-2.55, 3.4, -2.15, 6.4, 0, 7.6);
  return shape;
}

function BenchyModel() {
  const group = useRef();
  const hullGeo = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(deckOutline(), {
      depth: 2.15,
      bevelEnabled: true,
      bevelThickness: 0.58,
      bevelSize: 0.42,
      bevelSegments: 3,
    });
    geo.rotateX(-Math.PI / 2);
    geo.center();
    geo.translate(0, 1.05, 0);
    return geo;
  }, []);

  const cabinGeo = useMemo(() => {
    const geo = new THREE.BoxGeometry(3.15, 2.05, 3.35);
    geo.translate(0, 2.55, -0.55);
    return geo;
  }, []);

  const roofGeo = useMemo(() => {
    const geo = new THREE.BoxGeometry(3.45, 0.28, 3.65);
    geo.translate(0, 3.62, -0.55);
    return geo;
  }, []);

  const windshieldGeo = useMemo(() => {
    const geo = new THREE.BoxGeometry(3.05, 1.35, 0.18);
    geo.translate(0, 2.85, 1.22);
    return geo;
  }, []);

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.22;
  });

  useEffect(
    () => () => {
      hullGeo.dispose();
      cabinGeo.dispose();
      roofGeo.dispose();
      windshieldGeo.dispose();
    },
    [hullGeo, cabinGeo, roofGeo, windshieldGeo]
  );

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.15, 0]}>
        <circleGeometry args={[4.2, 32]} />
        <meshBasicMaterial color="#8d8d8d" transparent opacity={0.14} />
      </mesh>
      <group ref={group} position={[0, -1.1, 0]} rotation={[0, 0.55, 0]}>
        <mesh geometry={hullGeo} castShadow>
          <meshStandardMaterial {...PLA} />
        </mesh>
        <mesh geometry={cabinGeo} castShadow>
          <meshStandardMaterial {...PLA} />
        </mesh>
        <mesh geometry={roofGeo} castShadow>
          <meshStandardMaterial {...PLA} />
        </mesh>
        <mesh geometry={windshieldGeo}>
          <meshStandardMaterial color="#D9D3C8" roughness={0.28} metalness={0.08} />
        </mesh>
        <mesh position={[0.95, 4.35, -1.15]} castShadow>
          <cylinderGeometry args={[0.38, 0.42, 1.7, 20]} />
          <meshStandardMaterial {...PLA} />
        </mesh>
        <mesh position={[0.95, 5.28, -1.15]}>
          <cylinderGeometry args={[0.46, 0.46, 0.18, 20]} />
          <meshStandardMaterial {...PLA} />
        </mesh>
        <mesh position={[0, 1.55, 3.35]} rotation={[Math.PI / 2.8, 0, 0]}>
          <boxGeometry args={[0.9, 0.55, 0.12]} />
          <meshStandardMaterial {...PLA} />
        </mesh>
      </group>
    </>
  );
}

export default function StudioBenchyPreview() {
  return (
    <div className="relative h-full w-full">
      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [8.5, 5.8, 10.5], fov: 32 }}
        dpr={[1, 1.75]}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[8, 12, 6]} intensity={1.55} />
        <directionalLight position={[-6, 4, -4]} intensity={0.35} />
        <BenchyModel />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate={false}
          minPolarAngle={Math.PI * 0.32}
          maxPolarAngle={Math.PI * 0.55}
        />
      </Canvas>
    </div>
  );
}
