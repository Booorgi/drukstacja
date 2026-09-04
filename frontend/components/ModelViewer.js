import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Podglad modelu 3D w przegladarce.
 * Na start obsluguje STL (najprostsze do wyswietlenia w three.js).
 * STEP nie da sie wyswietlic bezposrednio w three.js - trzeba by
 * skonwertowac go na siatke po stronie backendu (np. cadquery -> eksport do STL)
 * i zwrocic link do podgladu.
 */
export default function ModelViewer({ file }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!file || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f4f6);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);

    const light1 = new THREE.DirectionalLight(0xffffff, 1);
    light1.position.set(1, 1, 1);
    scene.add(light1);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "stl") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const loader = new STLLoader();
        const geometry = loader.parse(e.target.result);
        geometry.center();

        const material = new THREE.MeshStandardMaterial({ color: 0x2563eb });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        geometry.computeBoundingSphere();
        const radius = geometry.boundingSphere.radius;
        camera.position.set(radius * 2, radius * 2, radius * 2);
        controls.target.set(0, 0, 0);
        controls.update();

        animate();
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Dla STEP/OBJ na razie tylko informacja - podglad wymaga konwersji po stronie backendu
      const info = document.createElement("div");
      info.style.padding = "2rem";
      info.style.textAlign = "center";
      info.style.color = "#6b7280";
      info.textContent = `Podglad 3D dla plikow ${ext.toUpperCase()} bedzie dostepny wkrotce (wymaga konwersji na serwerze). Analiza i wycena dzialaja normalnie.`;
      container.innerHTML = "";
      container.appendChild(info);
    }

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    return () => {
      renderer.dispose();
    };
  }, [file]);

  return <div ref={containerRef} style={{ width: "100%", height: "400px", borderRadius: "8px", overflow: "hidden" }} />;
}
