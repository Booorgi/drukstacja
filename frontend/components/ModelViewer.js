import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ModelViewer({ file, color = "#9CA3AF" }) {
  const containerRef = useRef(null);
  const meshRef = useRef(null);

  // Aktualizacja koloru materiału na żywo bez przeładowywania sceny
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.material.color.set(color);
    }
  }, [color]);

  useEffect(() => {
    if (!file || !containerRef.current) return;

    const container = containerRef.current;
    let width = container.clientWidth || 600;
    let height = container.clientHeight || 480;

    // 1. Scena i tło
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); // Jasne, czyste tło laboratoryjne

    // 2. Kamera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 5000);

    // 3. Renderer z antyaliasingiem
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. Płynne sterowanie orbitą
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Blokada przed zaglądaniem głęboko pod stół

    // 5. Oświetlenie studyjne
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.8);
    scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(150, 250, 150);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.6);
    dirLight2.position.set(-150, 100, -150);
    scene.add(dirLight2);

    let animationFrameId;

    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "stl") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const loader = new STLLoader();
        const geometry = loader.parse(e.target.result);

        geometry.computeVertexNormals();
        geometry.center();

        // Ustawienie modelu tak, aby opierał się idealnie na siatce podłoża (Y = 0)
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const heightOffset = (bbox.max.y - bbox.min.y) / 2;

        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: 0.35,
          metalness: 0.1,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = heightOffset;
        meshRef.current = mesh;
        scene.add(mesh);

        // Siatka techniczna stołu roboczego
        geometry.computeBoundingSphere();
        const radius = geometry.boundingSphere.radius || 50;
        const gridSize = Math.max(radius * 3.5, 120);

        const grid = new THREE.GridHelper(gridSize, 20, 0x94a3b8, 0xe2e8f0);
        grid.position.y = 0;
        scene.add(grid);

        // Ustawienie kadru kamery
        camera.position.set(radius * 2.2, radius * 2.0, radius * 2.5);
        controls.target.set(0, heightOffset * 0.8, 0);
        controls.update();

        const animate = () => {
          animationFrameId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();
      };
      reader.readAsArrayBuffer(file);
    } else {
      const info = document.createElement("div");
      info.style.cssText =
        "display:flex;height:100%;align-items:center;justify-content:center;padding:24px;text-align:center;color:#64748b;font-size:13px;";
      info.textContent = `Podgląd 3D dla ${ext.toUpperCase()} wymaga przetworzenia na serwerze. Wycena i parametry działają normalnie.`;
      container.innerHTML = "";
      container.appendChild(info);
    }

    // Obsługa zmiany rozmiaru okna
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [file]);

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
