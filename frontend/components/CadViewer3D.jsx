import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Bounds, GizmoHelper, GizmoViewcube, Html } from "@react-three/drei";
import { STLLoader, GLTFLoader } from "three-stdlib";
import * as THREE from "three";

// Prog podpor jak w Bambu Studio: podpory dla scianek nachylonych do stolu
// ponizej 30 stopni (90 stopni = pionowa sciana, 0 = plaski sufit).
const SUPPORT_THRESHOLD_ANGLE_DEG = 30;
const SUPPORT_NORMAL_Y = -Math.cos((SUPPORT_THRESHOLD_ANGLE_DEG * Math.PI) / 180);

// -----------------------------------------------------------------------------
// KONTROLER KAMERY (RESET & ZRZUT EKRANU)
// -----------------------------------------------------------------------------
function CameraAndActions({ resetTrigger, onScreenshotReady, setControlsRef }) {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef(null);

  useEffect(() => {
    if (controlsRef.current && setControlsRef) {
      setControlsRef(controlsRef.current);
    }
  }, [setControlsRef]);

  // Obsługa resetu widoku (Centrum)
  useEffect(() => {
    if (resetTrigger > 0 && controlsRef.current) {
      controlsRef.current.reset();
      camera.position.set(95, 115, 145);
      camera.lookAt(0, 20, 0);
      controlsRef.current.target.set(0, 20, 0);
      controlsRef.current.update();
    }
  }, [resetTrigger, camera]);

  // Obsługa zrzutu ekranu Canvas do PNG
  useEffect(() => {
    if (onScreenshotReady) {
      onScreenshotReady(() => {
        try {
          gl.render(scene, camera);
          const dataUrl = gl.domElement.toDataURL("image/png");
          return dataUrl;
        } catch (err) {
          console.error("Błąd podczas generowania zrzutu ekranu:", err);
          return null;
        }
      });
    }
  }, [onScreenshotReady, gl, scene, camera]);

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        minDistance={10}
        maxDistance={500}
        dampingFactor={0.08}
        enableDamping
      />
      <GizmoHelper alignment="bottom-right" margin={[65, 65]}>
        <GizmoViewcube
          color="#FFFFFF"
          strokeColor="#CBD5E1"
          textColor="#0F172A"
          opacity={0.92}
        />
      </GizmoHelper>
    </>
  );
}

// -----------------------------------------------------------------------------
// MODEL 3D Z AUTO-ORIENTACJĄ, MATERIAŁEM CAD I PODPORAMI
// -----------------------------------------------------------------------------
function isGlbUrl(url) {
  if (!url) return false;
  return /\.glb(\?|#|$)/i.test(url) || /_preview\.glb/i.test(url);
}

function centerOnBed(geo) {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;
  geo.translate(-centerX, -box.min.y, -centerZ);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
}

function autoOrientFlattestFace(geo) {
  const pos = geo.attributes.position;
  if (!pos || pos.count === 0) return;

  const faceData = [];
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const fn = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    pA.fromBufferAttribute(pos, i);
    pB.fromBufferAttribute(pos, i + 1);
    pC.fromBufferAttribute(pos, i + 2);

    ab.subVectors(pB, pA);
    ac.subVectors(pC, pA);
    fn.crossVectors(ab, ac);
    const area = fn.length() * 0.5;
    fn.normalize();

    if (area > 0.01) {
      faceData.push({ normal: fn.clone(), area });
    }
  }

  const clusters = [];
  faceData.forEach((f) => {
    let found = false;
    for (let c of clusters) {
      if (c.normal.dot(f.normal) > 0.98) {
        c.totalArea += f.area;
        found = true;
        break;
      }
    }
    if (!found) {
      clusters.push({ normal: f.normal.clone(), totalArea: f.area });
    }
  });

  if (clusters.length > 0) {
    clusters.sort((a, b) => b.totalArea - a.totalArea);
    const bestNormal = clusters[0].normal;
    const targetDown = new THREE.Vector3(0, -1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(bestNormal, targetDown);
    geo.applyQuaternion(q);
  }
}

function placeObjectOnBed(object3d) {
  object3d.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object3d);
  const center = new THREE.Vector3();
  box.getCenter(center);
  object3d.position.x -= center.x;
  object3d.position.z -= center.z;
  object3d.position.y -= box.min.y;
  object3d.updateMatrixWorld(true);
}

function CadModelGeometry({
  url,
  color,
  materialConfig,
  isWireframe,
  showSupports,
  showBBox,
  onGeometryLoaded,
  skipAutoOrient = false,
  useFileColors = false,
}) {
  const [geometry, setGeometry] = useState(null);
  const [gltfRoot, setGltfRoot] = useState(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const reportLoaded = (box3, triangleCount) => {
      if (!onGeometryLoaded || !box3) return;
      const sz = new THREE.Vector3();
      box3.getSize(sz);
      onGeometryLoaded({
        box: box3,
        size: [sz.x, sz.y, sz.z],
        triangleCount,
      });
    };

    if (isGlbUrl(url)) {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;
          const root = gltf.scene;
          root.rotation.x = -Math.PI / 2;
          placeObjectOnBed(root);

          let triCount = 0;
          root.traverse((ch) => {
            if (!ch.isMesh) return;
            ch.castShadow = true;
            ch.receiveShadow = true;
            const pos = ch.geometry?.attributes?.position;
            if (pos) {
              const indexed = ch.geometry.index ? ch.geometry.index.count / 3 : pos.count / 3;
              triCount += indexed;
            }
          });

          setGeometry(null);
          setGltfRoot(root);
          reportLoaded(new THREE.Box3().setFromObject(root), triCount);
        },
        undefined,
        (err) => console.error("Błąd ładowania GLB w CadViewer3D:", err)
      );
      return () => {
        cancelled = true;
      };
    }

    const loader = new STLLoader();
    loader.load(
      url,
      (geo) => {
        if (cancelled) return;
        geo.computeVertexNormals();

        if (skipAutoOrient) {
          geo.rotateX(-Math.PI / 2);
        } else {
          autoOrientFlattestFace(geo);
        }

        centerOnBed(geo);

        const pos = geo.attributes.position;
        setGltfRoot(null);
        setGeometry(geo);
        reportLoaded(geo.boundingBox, pos ? pos.count / 3 : 0);
      },
      undefined,
      (err) => console.error("Błąd ładowania STL w CadViewer3D:", err)
    );

    return () => {
      cancelled = true;
    };
  }, [url, skipAutoOrient, onGeometryLoaded]);

  // Wyliczanie powierzchni podpór (nachylenie do stołu poniżej progu Bambu)
  const supportMeshGeometry = useMemo(() => {
    if (!showSupports) return null;

    // Podgląd bywa pojedynczą siatką STL albo sceną GLB z kolorami AMS -
    // nawisy liczymy z obu, po indeksie, żeby nie kopiować gęstych siatek.
    const sources = [];
    if (geometry) {
      sources.push({ geo: geometry, matrix: null });
    }
    if (gltfRoot) {
      gltfRoot.updateMatrixWorld(true);
      gltfRoot.traverse((ch) => {
        if (ch.isMesh && ch.geometry) {
          sources.push({ geo: ch.geometry, matrix: ch.matrixWorld });
        }
      });
    }
    if (sources.length === 0) return null;

    const supportTriangles = [];
    const pA = new THREE.Vector3(),
      pB = new THREE.Vector3(),
      pC = new THREE.Vector3();
    const ab = new THREE.Vector3(),
      ac = new THREE.Vector3(),
      fn = new THREE.Vector3();

    sources.forEach(({ geo, matrix }) => {
      const pos = geo.attributes.position;
      if (!pos) return;
      const index = geo.index;
      const count = index ? index.count : pos.count;

      for (let i = 0; i < count; i += 3) {
        const i0 = index ? index.getX(i) : i;
        const i1 = index ? index.getX(i + 1) : i + 1;
        const i2 = index ? index.getX(i + 2) : i + 2;

        pA.fromBufferAttribute(pos, i0);
        pB.fromBufferAttribute(pos, i1);
        pC.fromBufferAttribute(pos, i2);

        if (matrix) {
          pA.applyMatrix4(matrix);
          pB.applyMatrix4(matrix);
          pC.applyMatrix4(matrix);
        }

        ab.subVectors(pB, pA);
        ac.subVectors(pC, pA);
        fn.crossVectors(ab, ac).normalize();

        const isBedLayer = pA.y < 0.2 && pB.y < 0.2 && pC.y < 0.2;
        if (fn.y < SUPPORT_NORMAL_Y && !isBedLayer) {
          supportTriangles.push(
            pA.x, pA.y, pA.z,
            pB.x, pB.y, pB.z,
            pC.x, pC.y, pC.z
          );
        }
      }
    });

    if (supportTriangles.length === 0) return null;

    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.Float32BufferAttribute(supportTriangles, 3));
    sGeo.computeVertexNormals();
    return sGeo;
  }, [geometry, gltfRoot, showSupports]);

  // Obliczenie wymiarów Bounding Box
  const bboxData = useMemo(() => {
    if (geometry) {
      geometry.computeBoundingBox();
      const b = geometry.boundingBox;
      const size = new THREE.Vector3();
      b.getSize(size);
      const center = new THREE.Vector3();
      b.getCenter(center);
      return { size, center };
    }
    if (gltfRoot) {
      const b = new THREE.Box3().setFromObject(gltfRoot);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      b.getSize(size);
      b.getCenter(center);
      return { size, center };
    }
    return null;
  }, [geometry, gltfRoot]);

  // Dobór parametrów shadera pod kątem wybranego materiału
  const materialProps = useMemo(() => {
    const group = materialConfig?.group;
    const id = materialConfig?.id || "";

    if (id.includes("MATTE") || group === "matte") {
      return {
        roughness: 0.88,
        metalness: 0.02,
        clearcoat: 0.0,
      };
    }
    if (id.includes("SILK") || group === "silk") {
      return {
        roughness: 0.22,
        metalness: 0.32,
        clearcoat: 0.65,
        clearcoatRoughness: 0.12,
      };
    }
    if (group === "composite" || id.includes("CF")) {
      return {
        roughness: 0.82,
        metalness: 0.16,
        clearcoat: 0.05,
      };
    }
    if (group === "flex") {
      return {
        roughness: 0.60,
        metalness: 0.04,
        clearcoat: 0.1,
      };
    }
    // Standard PLA / PET-G / ABS
    return {
      roughness: 0.38,
      metalness: 0.08,
      clearcoat: 0.20,
    };
  }, [materialConfig]);

  useEffect(() => {
    if (!gltfRoot) return undefined;
    gltfRoot.traverse((ch) => {
      if (!ch.isMesh) return;
      const prev = ch.material;
      const next = new THREE.MeshPhysicalMaterial({
        color: useFileColors ? "#ffffff" : color,
        vertexColors: Boolean(useFileColors && ch.geometry?.attributes?.color),
        roughness: materialProps.roughness,
        metalness: materialProps.metalness,
        clearcoat: materialProps.clearcoat,
        clearcoatRoughness: materialProps.clearcoatRoughness || 0.1,
        wireframe: isWireframe,
        map: prev && prev.map ? prev.map : null,
      });
      ch.material = next;
    });
  }, [gltfRoot, color, useFileColors, materialProps, isWireframe]);

  if (!geometry && !gltfRoot) return null;

  return (
    <group>
      {geometry && (
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={useFileColors ? "#ffffff" : color}
            vertexColors={Boolean(useFileColors && geometry.attributes.color)}
            roughness={materialProps.roughness}
            metalness={materialProps.metalness}
            clearcoat={materialProps.clearcoat}
            clearcoatRoughness={materialProps.clearcoatRoughness || 0.1}
            wireframe={isWireframe}
          />
        </mesh>
      )}
      {gltfRoot && <primitive object={gltfRoot} />}

      {/* Podświetlenie nawisów / podpór */}
      {supportMeshGeometry && !isWireframe && (
        <mesh geometry={supportMeshGeometry}>
          <meshBasicMaterial
            color="#EF4444"
            side={THREE.DoubleSide}
            transparent
            opacity={0.88}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Wizualna ramka Bounding Box i etykiety wymiarów */}
      {showBBox && bboxData && (
        <group position={[bboxData.center.x, bboxData.center.y, bboxData.center.z]}>
          <lineSegments>
            <edgesGeometry
              args={[
                new THREE.BoxGeometry(
                  bboxData.size.x,
                  bboxData.size.y,
                  bboxData.size.z
                ),
              ]}
            />
            <lineBasicMaterial color="#2563EB" linewidth={2} />
          </lineSegments>

          <Html
            position={[0, bboxData.size.y / 2 + 8, 0]}
            center
            distanceFactor={180}
          >
            <div className="bg-slate-900/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-xl border border-white/20 whitespace-nowrap backdrop-blur-md flex items-center gap-2 pointer-events-none">
              <span className="text-blue-400">X: {bboxData.size.x.toFixed(1)}</span>
              <span className="text-slate-500">|</span>
              <span className="text-emerald-400">Y: {bboxData.size.y.toFixed(1)}</span>
              <span className="text-slate-500">|</span>
              <span className="text-amber-400">Z: {bboxData.size.z.toFixed(1)} mm</span>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

// -----------------------------------------------------------------------------
// GŁÓWNY KOMPONENT CAD INSPECTOR VIEWPORT
// -----------------------------------------------------------------------------
export default function CadViewer3D({
  modelUrl,
  fileName = "model.stl",
  analysisData,
  selectedColor,
  onColorChange,
  materialConfig,
  availableColors = [],
  showSupportsDefault = false,
  studio = false,
}) {
  // Stany narzędziowe CAD
  const [isWireframe, setIsWireframe] = useState(false);
  const [showSupports, setShowSupports] = useState(showSupportsDefault);
  const [showBBox, setShowBBox] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [volumeUnit, setVolumeUnit] = useState("cm3"); // "cm3" | "mm3"
  const [isDfmOpen, setIsDfmOpen] = useState(true);
  const [loadedDimensions, setLoadedDimensions] = useState(null);
  const [recolorToMaterial, setRecolorToMaterial] = useState(false);

  const screenshotHandlerRef = useRef(null);

  useEffect(() => {
    setRecolorToMaterial(false);
  }, [modelUrl]);

  // Wymiary i objętość (z analysisData lub wczytanej geometrii)
  const volumeCm3 = analysisData?.volume_cm3 ?? 10.0;
  const displayVolume = useMemo(() => {
    if (volumeUnit === "mm3") {
      const vMm3 = volumeCm3 * 1000;
      return `${Math.round(vMm3).toLocaleString("pl-PL")} mm³`;
    }
    return `${volumeCm3.toFixed(2)} cm³`;
  }, [volumeCm3, volumeUnit]);

  const dimensions = useMemo(() => {
    if (analysisData?.dimensions_mm && analysisData.dimensions_mm.length === 3) {
      return analysisData.dimensions_mm;
    }
    if (loadedDimensions?.size) {
      return loadedDimensions.size.map((v) => Number(v.toFixed(1)));
    }
    return [0, 0, 0];
  }, [analysisData, loadedDimensions]);

  const hasFileColors = Boolean(
    analysisData?.has_file_colors || analysisData?.preview_glb_url
  );
  const useFileColors = hasFileColors && !recolorToMaterial;
  const skipAutoOrient = Boolean(analysisData?.orientation);

  // Lista kolorów do wyświetlenia w lewym doku próbek
  const colorSwatches = useMemo(() => {
    const fileSwatches = (analysisData?.filament_colours || [])
      .filter((hex) => typeof hex === "string" && hex.startsWith("#"))
      .map((hex, i) => ({
        id: `ams_${i}`,
        name: `Kolor AMS ${i + 1}`,
        hex,
      }));

    let materialSwatches = [];
    if (materialConfig?.colors && materialConfig.colors.length > 0) {
      materialSwatches = materialConfig.colors;
    } else if (availableColors && availableColors.length > 0) {
      materialSwatches = availableColors;
    } else {
      materialSwatches = [
        { id: "c_black", name: "Głęboka Czerń", hex: "#1A1A1A" },
        { id: "c_white", name: "Czysta Biel", hex: "#F5F5F5" },
        { id: "c_grey", name: "Szary Techniczny", hex: "#63666A" },
        { id: "c_red", name: "Ognista Czerwień", hex: "#D32F2F" },
        { id: "c_blue", name: "Kobalt Błękit", hex: "#1976D2" },
        { id: "c_orange", name: "Pomarańcz", hex: "#F57C00" },
        { id: "c_green", name: "Zieleń", hex: "#388E3C" },
        { id: "c_gold", name: "Złoty Silk", hex: "#D4AF37" },
      ];
    }

    if (fileSwatches.length === 0) return materialSwatches;
    const fileHex = new Set(fileSwatches.map((c) => c.hex.toLowerCase()));
    return [
      ...fileSwatches,
      ...materialSwatches.filter((c) => !fileHex.has((c.hex || "").toLowerCase())),
    ];
  }, [materialConfig, availableColors, analysisData]);

  // Punkty walidacji DFM
  const isWatertight = analysisData?.watertight ?? true;
  const hasOverhangs = Boolean(analysisData?.support_needed || showSupports);

  // Funkcja pobierania zrzutu ekranu
  const handleCaptureScreenshot = useCallback(() => {
    if (screenshotHandlerRef.current) {
      const dataUrl = screenshotHandlerRef.current();
      if (dataUrl) {
        const link = document.createElement("a");
        const cleanName = fileName ? fileName.replace(/\.[^/.]+$/, "") : "model";
        link.download = `${cleanName}_inspekcja_cad.png`;
        link.href = dataUrl;
        link.click();
      }
    }
  }, [fileName]);

  return (
    <div className={studio
      ? "relative w-full h-[560px] md:h-[640px] lg:h-[720px] overflow-hidden select-none bg-transparent"
      : "relative w-full h-[520px] md:h-[580px] lg:h-[620px] rounded-3xl overflow-hidden select-none bg-[#F8FAFC] border border-slate-200/90 shadow-[0_15px_40px_rgba(0,0,0,0.06)]"
    }>
      
      {/* ---------------------------------------------------------------------
          CANVAS THREE.JS Z SCENĄ "CAD INSPECTION ROOM"
          --------------------------------------------------------------------- */}
      <Canvas
        camera={{ position: [95, 115, 145], fov: 45 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      >
        <color attach="background" args={[studio ? "#9A9A9A" : "#F8FAFC"]} />

        {/* Zrównoważone oświetlenie studyjne */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[70, 110, 80]} intensity={1.35} castShadow />
        <directionalLight position={[-70, 60, -60]} intensity={0.55} />
        <directionalLight position={[0, -40, 0]} intensity={0.25} />

        {/* Model 3D */}
        <Bounds fit observe margin={1.85}>
          <CadModelGeometry
            url={modelUrl}
            color={selectedColor}
            materialConfig={materialConfig}
            isWireframe={isWireframe}
            showSupports={showSupports}
            showBBox={showBBox}
            onGeometryLoaded={setLoadedDimensions}
            skipAutoOrient={skipAutoOrient}
            useFileColors={useFileColors}
          />
        </Bounds>

        {/* Siatka pomiarowa stołu roboczego (260x260 mm) */}
        <gridHelper
          args={studio ? [400, 20, "#8A8A8A", "#A0A0A0"] : [260, 26, "#94A3B8", "#E2E8F0"]}
          position={[0, 0, 0]}
        />

        {!studio && (
        <gridHelper
          args={[260, 26, "#CBD5E1", "#F1F5F9"]}
          position={[0, 130, -130]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        )}

        {/* Kontroler kamery, Gizmo Cube i obsługa screenshotów */}
        <CameraAndActions
          resetTrigger={resetTrigger}
          onScreenshotReady={(fn) => {
            screenshotHandlerRef.current = fn;
          }}
        />
      </Canvas>

      {/* ---------------------------------------------------------------------
          LEWY GÓRNY PANEL: PLAKIETKA PARAMETRÓW & JEDNOSTEK (KOMPAKTOWY GLASSMORPHISM)
          --------------------------------------------------------------------- */}
      {!studio && <div className="absolute top-3 left-3 z-20 pointer-events-auto">
        <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-2.5 shadow-sm flex flex-col gap-1 min-w-[175px]">
          <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
              Objętość modelu
            </span>
            {/* Przełącznik jednostek mm³ / cm³ */}
            <div className="flex items-center bg-slate-100/90 rounded-md p-0.5 text-[9px] font-bold">
              <button
                type="button"
                onClick={() => setVolumeUnit("cm3")}
                className={`px-1.5 py-0.5 rounded transition ${
                  volumeUnit === "cm3"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                cm³
              </button>
              <button
                type="button"
                onClick={() => setVolumeUnit("mm3")}
                className={`px-1.5 py-0.5 rounded transition ${
                  volumeUnit === "mm3"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                mm³
              </button>
            </div>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-sm font-black text-slate-900 tracking-tight">
              {displayVolume}
            </span>
            {analysisData?.surface_area_cm2 && (
              <span className="text-[9px] font-bold text-slate-400">
                P: {analysisData.surface_area_cm2} cm²
              </span>
            )}
          </div>

          {/* Wymiary X x Y x Z */}
          <div className="text-[9px] font-semibold text-slate-500 flex items-center justify-between pt-0.5">
            <span>Gabaryty:</span>
            <span className="font-bold text-slate-700">
              {dimensions[0]} × {dimensions[1]} × {dimensions[2]} mm
            </span>
          </div>
        </div>
      </div>}

      {/* ---------------------------------------------------------------------
          LEWY BOCZNY DOK: PŁYWAJĄCE MENU WYBORU KOLORÓW (BEZPIECZNY OBRYS)
          --------------------------------------------------------------------- */}
      {!studio && <div className="absolute top-24 sm:top-28 left-3 z-20 pointer-events-auto">
        <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-1.5 shadow-sm flex flex-col items-center gap-1.5 max-h-[260px] overflow-y-auto scrollbar-none">
          <span className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400 px-0.5">
            Kolor
          </span>
          <div className="flex flex-col gap-1 py-0.5 px-0.5">
            {colorSwatches.map((c) => {
              const isSelected =
                !useFileColors &&
                selectedColor?.toLowerCase() === c.hex?.toLowerCase();
              return (
                <button
                  key={c.id || c.hex}
                  type="button"
                  onClick={() => {
                    if (String(c.id || "").startsWith("ams_")) return;
                    setRecolorToMaterial(true);
                    if (onColorChange) onColorChange(c.hex, c.id);
                  }}
                  title={c.name}
                  className={`w-6 h-6 rounded-full p-0.5 border-2 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer ${
                    isSelected
                      ? "border-[#EF4444] scale-105 shadow-sm"
                      : "border-transparent hover:border-slate-300"
                  }`}
                >
                  <div
                    className="w-full h-full rounded-full"
                    style={{
                      backgroundColor: c.hex,
                      border:
                        c.hex?.toLowerCase() === "#ffffff" ||
                        c.hex?.toLowerCase() === "#f5f5f5" ||
                        c.hex?.toLowerCase() === "#f8f9fa"
                          ? "1px solid #CBD5E1"
                          : "none",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>}

      {/* ---------------------------------------------------------------------
          PRAWY GÓRNY PANEL: ANALIZA GEOMETRII (DFM CHECKLIST - KOMPAKTOWY)
          --------------------------------------------------------------------- */}
      {!studio && <div className="absolute top-3 right-3 z-20 pointer-events-auto max-w-[210px] sm:max-w-[230px]">
        <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-2.5 shadow-sm">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="text-[11px] font-black text-slate-900 tracking-tight">
                Analiza geometrii (DFM)
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setIsDfmOpen(!isDfmOpen)}
              className="text-slate-400 hover:text-slate-600 transition px-1 rounded text-xs font-bold"
              title={isDfmOpen ? "Zwiń analizę" : "Rozwiń analizę"}
            >
              {isDfmOpen ? "−" : "+"}
            </button>
          </div>

          {isDfmOpen && (
            <div className="space-y-1.5 pt-2 text-[10px]">
              {/* Punkt 1: Szczelność siatki */}
              <div className="flex items-start gap-1.5">
                {isWatertight ? (
                  <span className="text-emerald-500 font-bold text-[11px] mt-0.5">✓</span>
                ) : (
                  <span className="text-amber-500 font-bold text-[11px] mt-0.5">⚠️</span>
                )}
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block text-[10px]">
                    {isWatertight ? "Zamknięta geometria" : "Nieszczelna siatka"}
                  </span>
                  <span className="text-[9px] text-slate-500 block">
                    {isWatertight ? "Model 100% szczelny" : "Wykryto otwarte krawędzie"}
                  </span>
                </div>
              </div>

              {/* Punkt 2: Grubość ścianek */}
              <div className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold text-[11px] mt-0.5">✓</span>
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block text-[10px]">
                    Grubość ścianek
                  </span>
                  <span className="text-[9px] text-slate-500 block">
                    Bezpieczna (&gt; 0.8 mm)
                  </span>
                </div>
              </div>

              {/* Punkt 3: Nawisy i kąty podparcia */}
              <div className="flex items-start gap-1.5">
                {hasOverhangs ? (
                  <span className="text-amber-500 font-bold text-[11px] mt-0.5">⚠️</span>
                ) : (
                  <span className="text-emerald-500 font-bold text-[11px] mt-0.5">✓</span>
                )}
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block text-[10px]">
                    Nawisy & podpory
                  </span>
                  <span className="text-[9px] text-slate-500 block">
                    {hasOverhangs
                      ? `Nachylenie < ${SUPPORT_THRESHOLD_ANGLE_DEG}° (próg Bambu)`
                      : `Brak nawisów < ${SUPPORT_THRESHOLD_ANGLE_DEG}°`}
                  </span>
                </div>
              </div>

              {/* Punkt 4: Integralność części */}
              <div className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold text-[11px] mt-0.5">✓</span>
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block text-[10px]">
                    Integralność
                  </span>
                  <span className="text-[9px] text-slate-500 block">
                    Spójna bryła (1 shell)
                  </span>
                </div>
              </div>

              {/* Podsumowanie DFM */}
              <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[8px] font-bold text-slate-400 uppercase">
                  Status DFM
                </span>
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                  Gotowy do druku
                </span>
              </div>
            </div>
          )}
        </div>
      </div>}

      {/* ---------------------------------------------------------------------
          DOLNY PŁYWAJĄCY PASEK NARZĘDZI (FLOATING CAD DOCK)
          --------------------------------------------------------------------- */}
      {!studio && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl px-2.5 py-1.5 shadow-2xl flex items-center gap-1 sm:gap-2">
          
          {/* Przycisk: Centrum (Reset widoku) */}
          <button
            type="button"
            onClick={() => setResetTrigger((prev) => prev + 1)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 text-xs font-bold transition cursor-pointer"
            title="Wycentruj model i zresetuj kamerę"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
            </svg>
            <span className="hidden sm:inline">Centrum</span>
          </button>

          <div className="w-[1px] h-4 bg-white/15" />

          {/* Przycisk: Widok CAD / Siatka Wireframe */}
          <button
            type="button"
            onClick={() => setIsWireframe(!isWireframe)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isWireframe
                ? "bg-blue-500 text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
            title="Przełącz widok siatki krawędziowej (Wireframe)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="hidden sm:inline">Widok CAD</span>
          </button>

          {/* Przycisk: Wymiary / Bounding Box */}
          <button
            type="button"
            onClick={() => setShowBBox(!showBBox)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              showBBox
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
            title="Włącz/wyłącz ramkę gabarytową z wymiarami X, Y, Z"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="hidden sm:inline">Wymiary</span>
          </button>

          {/* Przycisk: Podpory */}
          <button
            type="button"
            onClick={() => setShowSupports(!showSupports)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              showSupports
                ? "bg-[#EF4444] text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
            title="Podświetl powierzchnie nawisów wymagających podpór"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span className="hidden sm:inline">Podpory</span>
          </button>

          <div className="w-[1px] h-4 bg-white/15" />

          {/* Przycisk: Pobierz / Zrzut ekranu */}
          <button
            type="button"
            onClick={handleCaptureScreenshot}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 text-xs font-bold transition cursor-pointer"
            title="Zrób zrzut ekranu modelu (PNG)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="hidden sm:inline">Zrzut</span>
          </button>

        </div>
      </div>}

    </div>
  );
}
