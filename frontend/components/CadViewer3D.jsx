import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Bounds, GizmoHelper, GizmoViewcube, Html } from "@react-three/drei";
import { STLLoader } from "three-stdlib";
import * as THREE from "three";

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
function CadModelGeometry({
  url,
  color,
  materialConfig,
  isWireframe,
  showSupports,
  showBBox,
  onGeometryLoaded,
}) {
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    if (!url) return;
    const loader = new STLLoader();
    loader.load(
      url,
      (geo) => {
        geo.computeVertexNormals();

        // 1. Auto-orientacja: ułożenie na najbardziej płaskiej ściance (flattest face)
        const pos = geo.attributes.position;
        if (pos && pos.count > 0) {
          const faceData = [];
          const pA = new THREE.Vector3(),
            pB = new THREE.Vector3(),
            pC = new THREE.Vector3();
          const ab = new THREE.Vector3(),
            ac = new THREE.Vector3(),
            fn = new THREE.Vector3();

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

        // 2. Centrowanie modelu na stole (Y = 0)
        geo.computeBoundingBox();
        const box = geo.boundingBox;
        const centerX = (box.min.x + box.max.x) / 2;
        const centerZ = (box.min.z + box.max.z) / 2;
        const minY = box.min.y;

        geo.translate(-centerX, -minY, -centerZ);
        geo.computeVertexNormals();

        setGeometry(geo);
        if (onGeometryLoaded) {
          geo.computeBoundingBox();
          const b = geo.boundingBox;
          const sz = new THREE.Vector3();
          b.getSize(sz);
          onGeometryLoaded({
            box: b,
            size: [sz.x, sz.y, sz.z],
            triangleCount: pos.count / 3,
          });
        }
      },
      undefined,
      (err) => console.error("Błąd ładowania STL w CadViewer3D:", err)
    );
  }, [url, onGeometryLoaded]);

  // Wyliczanie powierzchni podpór (kąt nawisu > 45°)
  const supportMeshGeometry = useMemo(() => {
    if (!geometry || !showSupports) return null;

    const pos = geometry.attributes.position;
    if (!pos) return null;

    const supportTriangles = [];
    const pA = new THREE.Vector3(),
      pB = new THREE.Vector3(),
      pC = new THREE.Vector3();
    const ab = new THREE.Vector3(),
      ac = new THREE.Vector3(),
      fn = new THREE.Vector3();

    for (let i = 0; i < pos.count; i += 3) {
      pA.fromBufferAttribute(pos, i);
      pB.fromBufferAttribute(pos, i + 1);
      pC.fromBufferAttribute(pos, i + 2);

      ab.subVectors(pB, pA);
      ac.subVectors(pC, pA);
      fn.crossVectors(ab, ac).normalize();

      const isBedLayer = pA.y < 0.2 && pB.y < 0.2 && pC.y < 0.2;
      if (fn.y < -0.707 && !isBedLayer) {
        supportTriangles.push(
          pA.x, pA.y, pA.z,
          pB.x, pB.y, pB.z,
          pC.x, pC.y, pC.z
        );
      }
    }

    if (supportTriangles.length === 0) return null;

    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.Float32BufferAttribute(supportTriangles, 3));
    sGeo.computeVertexNormals();
    return sGeo;
  }, [geometry, showSupports]);

  // Obliczenie wymiarów Bounding Box
  const bboxData = useMemo(() => {
    if (!geometry) return null;
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    const size = new THREE.Vector3();
    b.getSize(size);
    const center = new THREE.Vector3();
    b.getCenter(center);
    return { size, center };
  }, [geometry]);

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

  if (!geometry) return null;

  return (
    <group>
      {/* Główny model CAD */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={color}
          roughness={materialProps.roughness}
          metalness={materialProps.metalness}
          clearcoat={materialProps.clearcoat}
          clearcoatRoughness={materialProps.clearcoatRoughness || 0.1}
          wireframe={isWireframe}
        />
      </mesh>

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
}) {
  // Stany narzędziowe CAD
  const [isWireframe, setIsWireframe] = useState(false);
  const [showSupports, setShowSupports] = useState(showSupportsDefault);
  const [showBBox, setShowBBox] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [volumeUnit, setVolumeUnit] = useState("cm3"); // "cm3" | "mm3"
  const [isDfmOpen, setIsDfmOpen] = useState(true);
  const [loadedDimensions, setLoadedDimensions] = useState(null);

  const screenshotHandlerRef = useRef(null);

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

  // Lista kolorów do wyświetlenia w lewym doku próbek
  const colorSwatches = useMemo(() => {
    if (materialConfig?.colors && materialConfig.colors.length > 0) {
      return materialConfig.colors;
    }
    if (availableColors && availableColors.length > 0) {
      return availableColors;
    }
    return [
      { id: "c_black", name: "Głęboka Czerń", hex: "#1A1A1A" },
      { id: "c_white", name: "Czysta Biel", hex: "#F5F5F5" },
      { id: "c_grey", name: "Szary Techniczny", hex: "#63666A" },
      { id: "c_red", name: "Ognista Czerwień", hex: "#D32F2F" },
      { id: "c_blue", name: "Kobalt Błękit", hex: "#1976D2" },
      { id: "c_orange", name: "Pomarańcz", hex: "#F57C00" },
      { id: "c_green", name: "Zieleń", hex: "#388E3C" },
      { id: "c_gold", name: "Złoty Silk", hex: "#D4AF37" },
    ];
  }, [materialConfig, availableColors]);

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
    <div className="relative w-full h-[520px] md:h-[580px] lg:h-[620px] rounded-3xl overflow-hidden select-none bg-[#F8FAFC] border border-slate-200/90 shadow-[0_15px_40px_rgba(0,0,0,0.06)]">
      
      {/* ---------------------------------------------------------------------
          CANVAS THREE.JS Z SCENĄ "CAD INSPECTION ROOM"
          --------------------------------------------------------------------- */}
      <Canvas
        camera={{ position: [95, 115, 145], fov: 45 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      >
        <color attach="background" args={["#F8FAFC"]} />

        {/* Zrównoważone oświetlenie studyjne */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[70, 110, 80]} intensity={1.35} castShadow />
        <directionalLight position={[-70, 60, -60]} intensity={0.55} />
        <directionalLight position={[0, -40, 0]} intensity={0.25} />

        {/* Model 3D */}
        <Bounds fit clip observe margin={1.2}>
          <CadModelGeometry
            url={modelUrl}
            color={selectedColor}
            materialConfig={materialConfig}
            isWireframe={isWireframe}
            showSupports={showSupports}
            showBBox={showBBox}
            onGeometryLoaded={setLoadedDimensions}
          />
        </Bounds>

        {/* Siatka pomiarowa stołu roboczego (260x260 mm) */}
        <gridHelper
          args={[260, 26, "#94A3B8", "#E2E8F0"]}
          position={[0, 0, 0]}
        />

        {/* Delikatna siatka pomiarowa na tylnej ścianie (Spatial Depth) */}
        <gridHelper
          args={[260, 26, "#CBD5E1", "#F1F5F9"]}
          position={[0, 130, -130]}
          rotation={[Math.PI / 2, 0, 0]}
        />

        {/* Kontroler kamery, Gizmo Cube i obsługa screenshotów */}
        <CameraAndActions
          resetTrigger={resetTrigger}
          onScreenshotReady={(fn) => {
            screenshotHandlerRef.current = fn;
          }}
        />
      </Canvas>

      {/* ---------------------------------------------------------------------
          LEWY GÓRNY PANEL: PLAKIETKA PARAMETRÓW & JEDNOSTEK (GLASSMORPHISM)
          --------------------------------------------------------------------- */}
      <div className="absolute top-4 left-4 z-20 pointer-events-auto">
        <div className="bg-white/80 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3 shadow-lg flex flex-col gap-1.5 min-w-[200px]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Objętość modelu
            </span>
            {/* Przełącznik jednostek mm³ / cm³ */}
            <div className="flex items-center bg-slate-100/90 rounded-lg p-0.5 text-[10px] font-bold">
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
            <span className="text-base font-black text-slate-900 tracking-tight">
              {displayVolume}
            </span>
            {analysisData?.surface_area_cm2 && (
              <span className="text-[10px] font-bold text-slate-500">
                P: {analysisData.surface_area_cm2} cm²
              </span>
            )}
          </div>

          {/* Wymiary X x Y x Z */}
          <div className="text-[10px] font-semibold text-slate-500 flex items-center justify-between pt-0.5">
            <span>Gabaryty:</span>
            <span className="font-bold text-slate-700">
              {dimensions[0]} × {dimensions[1]} × {dimensions[2]} mm
            </span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          LEWY BOCZNY DOK: PŁYWAJĄCE MENU WYBORU KOLORÓW
          --------------------------------------------------------------------- */}
      <div className="absolute top-28 sm:top-32 left-4 z-20 pointer-events-auto">
        <div className="bg-white/85 backdrop-blur-md border border-slate-200/90 rounded-2xl p-2 shadow-lg flex flex-col items-center gap-2 max-h-[300px] overflow-y-auto scrollbar-none">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
            Kolor
          </span>
          <div className="flex flex-col gap-1.5">
            {colorSwatches.map((c) => {
              const isSelected = selectedColor?.toLowerCase() === c.hex?.toLowerCase();
              return (
                <button
                  key={c.id || c.hex}
                  type="button"
                  onClick={() => onColorChange && onColorChange(c.hex, c.id)}
                  title={c.name}
                  className={`group relative w-7 h-7 rounded-xl transition-all duration-150 flex items-center justify-center cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-[#EF4444] ring-offset-2 ring-offset-white scale-110 shadow-md"
                      : "hover:scale-105 opacity-85 hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: c.hex,
                    border: c.hex?.toLowerCase() === "#ffffff" || c.hex?.toLowerCase() === "#f5f5f5" ? "1px solid #E2E8F0" : "none",
                  }}
                >
                  {isSelected && (
                    <svg
                      className={`w-3.5 h-3.5 drop-shadow ${
                        c.hex?.toLowerCase() === "#ffffff" || c.hex?.toLowerCase() === "#f5f5f5" || c.hex?.toLowerCase() === "#f0f3f4"
                          ? "text-slate-900"
                          : "text-white"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          PRAWY GÓRNY PANEL: ANALIZA GEOMETRII (DFM CHECKLIST)
          --------------------------------------------------------------------- */}
      <div className="absolute top-4 right-4 z-20 pointer-events-auto max-w-[260px] sm:max-w-[280px]">
        <div className="bg-white/85 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="text-xs font-black text-slate-900 tracking-tight">
                Analiza geometrii (DFM)
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setIsDfmOpen(!isDfmOpen)}
              className="text-slate-400 hover:text-slate-600 transition p-0.5 rounded text-xs font-bold"
              title={isDfmOpen ? "Zwiń analizę" : "Rozwiń analizę"}
            >
              {isDfmOpen ? "−" : "+"}
            </button>
          </div>

          {isDfmOpen && (
            <div className="space-y-2 pt-2.5 text-[11px]">
              {/* Punkt 1: Szczelność siatki */}
              <div className="flex items-start gap-2">
                {isWatertight ? (
                  <span className="text-emerald-500 font-bold text-xs mt-0.5">✓</span>
                ) : (
                  <span className="text-amber-500 font-bold text-xs mt-0.5">⚠️</span>
                )}
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block">
                    {isWatertight ? "Zamknięta geometria" : "Nieszczelna siatka"}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {isWatertight ? "Model 100% szczelny (Manifold)" : "Wykryto otwarte krawędzie"}
                  </span>
                </div>
              </div>

              {/* Punkt 2: Grubość ścianek */}
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold text-xs mt-0.5">✓</span>
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block">
                    Minimalna grubość ścianek
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Bezpieczna strukturalnie (&gt; 0.8 mm)
                  </span>
                </div>
              </div>

              {/* Punkt 3: Nawisy i kąty podparcia */}
              <div className="flex items-start gap-2">
                {hasOverhangs ? (
                  <span className="text-amber-500 font-bold text-xs mt-0.5">⚠️</span>
                ) : (
                  <span className="text-emerald-500 font-bold text-xs mt-0.5">✓</span>
                )}
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block">
                    Nawisy i kąty podparcia
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {hasOverhangs
                      ? "Wykryto zwisy > 45° (podpory)"
                      : "Brak krytycznych nawisów"}
                  </span>
                </div>
              </div>

              {/* Punkt 4: Integralność części */}
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold text-xs mt-0.5">✓</span>
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block">
                    Integralność części
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Pojedyncza spójna bryła (1 shell)
                  </span>
                </div>
              </div>

              {/* Podsumowanie DFM */}
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-400 uppercase">
                  Status DFM
                </span>
                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Gotowy do druku
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          DOLNY PŁYWAJĄCY PASEK NARZĘDZI (FLOATING CAD DOCK)
          --------------------------------------------------------------------- */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
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
      </div>

    </div>
  );
}
