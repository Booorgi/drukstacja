import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ModelViewer({
  previewUrl = null,
  file = null,
  color = "#64748B",
  showOverhangs = false, // Zamiast showSupports – podświetlanie krytycznych ścianek
}) {
  const containerRef = useRef(null);
  const meshRef = useRef(null);
  const originalGeomRef = useRef(null);

  // Aktualizacja koloru i trybu analizy zwisów
  useEffect(() => {
    if (!meshRef.current) return;

    if (showOverhangs) {
      // Podświetlenie zwisów > 45 stopni
      const geom = meshRef.current.geometry;
      const normals = geom.attributes.normal;
      const colors = [];
      const normal = new THREE.Vector3();
      const downVector = new THREE.Vector3(0, -1, 0);

      for (let i = 0; i < normals.count; i++) {
        normal.fromBufferAttribute(normals, i);
        // Kąt względem wektora w dół (stół)
        const dot = normal.dot(downVector);
        
        // Jeśli ścianka patrzy w dół pod kątem większym niż 45°
        if (dot > 0.5) {
          colors.push(0.95, 0.2, 0.2); // Czerwony: krytyczny zwis
        } else if (dot > 0.1) {
          colors.push(0.98, 0.6, 0.1); // Pomarańczowy: łagodny zwis
        } else {
          colors.push(0.4, 0.45, 0.5); // Baza: neutralny szary
        }
      }

      geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      meshRef.current.material.vertexColors = true;
      meshRef.current.material.color.set(0xffffff);
      meshRef.current.material.needsUpdate = true;
    } else {
      // Przywrócenie jednolitego koloru klienta
      meshRef.current.material.vertexColors = false;
      meshRef.current.material.color.set(color);
      meshRef.current.material.needsUpdate = true;
    }
  }, [color, showOverhangs]);

  useEffect(() => {
    if ((!previewUrl && !file) || !containerRef.current) return;

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

    const buildSceneWithGeometry = (geometry) => {
      if (meshRef.current) scene.remove(meshRef.current);

      // 1. Standaryzacja orientacji STL (Z-up na Y-up)
      geometry.rotateX(-Math.PI / 2);
      geometry.computeVertexNormals();

      // 2. Centrowanie modelu i postawienie na stole Y = 0
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      const centerX = (bbox.max.x + bbox.min.x) / 2;
      const centerZ = (bbox.max.z + bbox.min.z) / 2;
      const minY = bbox.min.y;
      geometry.translate(-centerX, -minY, -centerZ);

      geometry.computeBoundingBox();
      const finalBbox = geometry.boundingBox;
      const modelHeight = finalBbox.max.y - finalBbox.min.y;

      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.35,
        metalness: 0.1,
      });

      const mesh = new THREE.Mesh(geometry, material);
      meshRef.current = mesh;
      originalGeomRef.current = geometry;
      scene.add(mesh);

      // 3. Siatka stołu roboczego
      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere.radius || 60;
      const grid = new THREE.GridHelper(Math.max(radius * 3.5, 140), 20, 0x94a3b8, 0xe2e8f0);
      grid.position.y = 0;
      scene.add(grid);

      // Kamera
      camera.position.set(radius * 2.2, radius * 1.8, radius * 2.4);
      controls.target.set(0, modelHeight * 0.4, 0);
      controls.update();

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
    };

    const loader = new STLLoader();

    if (previewUrl) {
      loader.load(previewUrl, (geom) => buildSceneWithGeometry(geom));
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
  }, [previewUrl, file]);

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
