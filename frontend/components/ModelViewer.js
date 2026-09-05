import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ModelViewer({
  url = null,
  file = null,
  color = "#9CA3AF",
  supportLines = [],
  showSupports = false,
}) {
  const containerRef = useRef(null);
  const meshRef = useRef(null);
  const supportsGroupRef = useRef(null);

  // Dynamiczna zmiana koloru oraz przezroczystości bryły
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.material.color.set(color);
      meshRef.current.material.transparent = showSupports;
      meshRef.current.material.opacity = showSupports ? 0.8 : 1.0;
    }
  }, [color, showSupports]);

  // Włączanie / ukrywanie podpór
  useEffect(() => {
    if (supportsGroupRef.current) {
      supportsGroupRef.current.visible = showSupports;
    }
  }, [showSupports]);

  useEffect(() => {
    if ((!url && !file) || !containerRef.current) return;

    const container = containerRef.current;
    let width = container.clientWidth || 600;
    let height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 + 0.05;

    // Oświetlenie
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.95));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(150, 250, 150);
    scene.add(dirLight);

    let animationFrameId;

   const buildScene = (geometry) => {
      // 1. Czyścimy poprzednie obiekty, jeśli były wczytane z lokalnego pliku
      if (meshRef.current) scene.remove(meshRef.current);
      if (supportsGroupRef.current) scene.remove(supportsGroupRef.current);

      // 2. Wyrównanie osi STL (Z-up) do Three.js (Y-up)
      geometry.rotateX(-Math.PI / 2);
      geometry.computeVertexNormals();

      // 3. Połóż model idealnie na stole roboczym (Y = 0) i wycentruj w (X=0, Z=0)
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      const centerX = (bbox.max.x + bbox.min.x) / 2;
      const centerZ = (bbox.max.z + bbox.min.z) / 2;
      const minY = bbox.min.y;

      geometry.translate(-centerX, -minY, -centerZ);

      // Ponowne przeliczenie po przesunięciu
      geometry.computeBoundingBox();
      const finalBbox = geometry.boundingBox;
      const height = finalBbox.max.y - finalBbox.min.y;

      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.35,
        metalness: 0.1,
        transparent: showSupports,
        opacity: showSupports ? 0.75 : 1.0,
      });

      const mesh = new THREE.Mesh(geometry, material);
      meshRef.current = mesh;
      scene.add(mesh);

      // 4. Stół roboczy
      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere.radius || 60;
      const grid = new THREE.GridHelper(Math.max(radius * 3.5, 140), 20, 0x94a3b8, 0xe2e8f0);
      grid.position.y = 0;
      scene.add(grid);

      // 5. Podpory ze slicera
      if (supportLines && supportLines.length >= 6) {
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(supportLines, 3)
        );

        lineGeo.computeBoundingBox();
        const sBbox = lineGeo.boundingBox;
        const sMinY = sBbox.min.y;

        const lineMat = new THREE.LineBasicMaterial({
          color: 0x10b981,
          linewidth: 2,
        });

        const supportMesh = new THREE.LineSegments(lineGeo, lineMat);
        
        // Jeśli podpory są obrócone w poprzek o 90 stopni, odwracamy oś Z
        supportMesh.position.set(0, -sMinY, 0);
        supportMesh.visible = showSupports;
        supportsGroupRef.current = supportMesh;
        scene.add(supportMesh);
      }

      // Kamera
      camera.position.set(radius * 2.2, radius * 1.8, radius * 2.4);
      controls.target.set(0, height * 0.4, 0);
      controls.update();
    };
    const loader = new STLLoader();

    if (url) {
      loader.load(
        url,
        (geom) => buildSceneWithGeometry(geom),
        undefined,
        (err) => console.error("Błąd pobierania STL z R2:", err)
      );
    } else if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const geom = loader.parse(e.target.result);
        buildSceneWithGeometry(geom);
      };
      reader.readAsArrayBuffer(file);
    }

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [url, file, supportLines]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "440px",
        overflow: "hidden",
        position: "relative",
      }}
    />
  );
}
