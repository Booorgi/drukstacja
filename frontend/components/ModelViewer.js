import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ModelViewer({
  file,          // opcjonalnie: surowy plik z <input> - podglad "od razu", zanim backend skonczy orientacje
  previewUrl,    // preferowane: URL do JUZ ZORIENTOWANEGO pliku z backendu (spojny z supportLines)
  color = "#9CA3AF",
  supportLines = [],
  showSupports = false
}) {
  const containerRef = useRef(null);
  const meshRef = useRef(null);
  const supportsGroupRef = useRef(null);

  // Dynamiczna zmiana koloru i przezroczystości bryły
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.material.color.set(color);
      meshRef.current.material.transparent = showSupports;
      meshRef.current.material.opacity = showSupports ? 0.8 : 1.0;
    }
  }, [color, showSupports]);

  // Włączanie / wyłączanie widoczności podpór
  useEffect(() => {
    if (supportsGroupRef.current) {
      supportsGroupRef.current.visible = showSupports;
    }
  }, [showSupports]);

  useEffect(() => {
    if ((!file && !previewUrl) || !containerRef.current) return;

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

    // Oświetlenie studyjne
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(150, 250, 150);
    scene.add(dirLight);

    let animationFrameId;

    const buildScene = (arrayBuffer) => {
      const loader = new STLLoader();
      const geometry = loader.parse(arrayBuffer);

      // WAŻNE: backend (slicer.py) generuje linie podpór w konwencji Z-up
      // (Z = oś wysokości wydruku, tak jak w G-code/PrusaSlicer), a Three.js
      // jest Y-up. Stosujemy DOKŁADNIE tę samą zamianę osi Y<->Z co przy
      // generowaniu podpór, żeby model i podpory zawsze się pokrywały -
      // to był główny powód, dla którego wcześniej się rozjeżdżały.
      const axisSwapZupToYup = new THREE.Matrix4().set(
        1, 0, 0, 0,
        0, 0, 1, 0,
        0, 1, 0, 0,
        0, 0, 0, 1
      );
      geometry.applyMatrix4(axisSwapZupToYup);
      geometry.computeVertexNormals();

      // Wyśrodkuj w X/Z i postaw podstawę modelu na Y = 0 (na stole roboczym)
      geometry.computeBoundingBox();
      const rawBbox = geometry.boundingBox;
      const centerX = (rawBbox.max.x + rawBbox.min.x) / 2;
      const centerZ = (rawBbox.max.z + rawBbox.min.z) / 2;
      const minY = rawBbox.min.y;
      geometry.translate(-centerX, -minY, -centerZ);

      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const bbox = geometry.boundingBox;
      const modelHeight = bbox.max.y - bbox.min.y;

      // Model STL
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.35,
        metalness: 0.1,
        transparent: showSupports,
        opacity: showSupports ? 0.8 : 1.0,
      });

      const mesh = new THREE.Mesh(geometry, material);
      meshRef.current = mesh;
      scene.add(mesh);

      // Siatka stołu roboczego
      const radius = geometry.boundingSphere.radius || 50;
      const grid = new THREE.GridHelper(Math.max(radius * 3.5, 120), 20, 0x94a3b8, 0xe2e8f0);
      grid.position.y = 0;
      scene.add(grid);

      // --- DODANIE PODPÓR I PRECYZYJNE WYRÓWNANIE ---
      if (supportLines && supportLines.length >= 6) {
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(supportLines, 3)
        );

        // 1. Centrujemy podpory tak samo jak model w osiach X i Z
        lineGeo.computeBoundingBox();
        const sBbox = lineGeo.boundingBox;
        const sCenterX = (sBbox.max.x + sBbox.min.x) / 2;
        const sCenterZ = (sBbox.max.z + sBbox.min.z) / 2;
        const sMinY = sBbox.min.y;

        const lineMat = new THREE.LineBasicMaterial({
          color: 0x10b981, // Wyrazista zieleń podpór
          linewidth: 1.5,
        });

        const supportMesh = new THREE.LineSegments(lineGeo, lineMat);
        // Dopasowujemy środek podpór do (0, 0) i wyrównujemy podstawę do poziomu stołu (Y = 0)
        supportMesh.position.set(-sCenterX, -sMinY, -sCenterZ);
        supportMesh.visible = showSupports;
        supportsGroupRef.current = supportMesh;
        scene.add(supportMesh);
      }

      // Kamera
      camera.position.set(radius * 2.2, radius * 2.0, radius * 2.5);
      controls.target.set(0, modelHeight * 0.5, 0);
      controls.update();

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
    };

    // Preferujemy previewUrl (plik JUZ zorientowany przez backend, spojny
    // z supportLines). Jesli go jeszcze nie ma (np. trwa analiza), pokazujemy
    // tymczasowo surowy wgrany plik, zeby user od razu widzial podglad.
    if (previewUrl) {
      fetch(previewUrl)
        .then((res) => res.arrayBuffer())
        .then(buildScene)
        .catch((err) => console.error("Nie udalo sie wczytac podgladu z serwera:", err));
    } else if (file) {
      const reader = new FileReader();
      reader.onload = (e) => buildScene(e.target.result);
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

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [file, previewUrl, supportLines]);

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
