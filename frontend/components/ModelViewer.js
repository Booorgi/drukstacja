import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ModelViewer({
  previewUrl = null,
  file = null,
  color = "#64748B",
  showOverhangs = false,
}) {
  const containerRef = useRef(null);
  const meshRef = useRef(null);

  // Aktualizacja koloru bazowego i podświetlanie krytycznych zwisów (> 50°)
  useEffect(() => {
    if (!meshRef.current) return;

    if (showOverhangs) {
      const geom = meshRef.current.geometry;
      const normals = geom.attributes.normal;
      const colors = [];
      const normal = new THREE.Vector3();
      const downVector = new THREE.Vector3(0, -1, 0);

      const baseCol = new THREE.Color(color);

      for (let i = 0; i < normals.count; i++) {
        normal.fromBufferAttribute(normals, i);
        const dot = normal.dot(downVector);

        // dot > 0.65 odpowiada kątowi zwisu powyżej ok. 50 stopni względem stołu
        if (dot > 0.65) {
          colors.push(0.93, 0.27, 0.27); // Czerwony: krytyczny zwis
        } else {
          colors.push(baseCol.r, baseCol.g, baseCol.b); // Kolor klienta dla bezpiecznych ścianek
        }
      }

      geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      meshRef.current.material.vertexColors = true;
      meshRef.current.material.color.set(0xffffff);
      meshRef.current.material.needsUpdate = true;
    } else {
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

    // Oświetlenie
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(150, 250, 150);
    scene.add(dirLight);

    let animationFrameId;

    const buildSceneWithGeometry = (geometry) => {
      if (meshRef.current) scene.remove(meshRef.current);

      // 1. Obrót w osi podłużnej (X) o 180 stopni - obraca model z pleców na brzuch
      geometry.rotateX(Math.PI);
      geometry.computeVertexNormals();

      // 2. Centrowanie modelu w poziomie (X, Z) i oparcie spodu na stole (Y = 0)
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
      scene.add(mesh);

      // 3. Stół roboczy
      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere.radius || 60;
      const grid = new THREE.GridHelper(Math.max(radius * 3.5, 140), 20, 0x94a3b8, 0xe2e8f0);
      grid.position.y = 0;
      scene.add(grid);

      // 4. Pozycja kamery dopasowana do wielkości modelu
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
      loader.load(
        previewUrl,
        (geom) => buildSceneWithGeometry(geom),
        undefined,
        (err) => console.error("Błąd pobierania pliku STL:", err)
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
