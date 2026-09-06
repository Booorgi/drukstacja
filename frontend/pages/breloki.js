import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import { SUNLU_CATALOG } from "../lib/filament";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Domyślny wektor breloka
const DEFAULT_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g id="color_1" fill="#222222">
    <path d="M50 8 L85 24 L85 64 L50 92 L15 64 L15 24 Z M50 14 L20 28 L20 60 L50 85 L80 60 L80 28 Z" />
    <path d="M48 35 L52 35 L52 65 L48 65 Z" />
    <path d="M35 48 L65 48 L65 52 L35 52 Z" />
  </g>
  <g id="color_2" fill="#0CB7CC">
    <path d="M22 29 L50 16 L78 29 L78 59 L50 83 L22 59 Z" />
  </g>
  <g id="color_3" fill="#0063A0">
    <path d="M50 25 L70 36 L70 54 L50 67 L30 54 L30 36 Z" />
  </g>
  <g id="color_4" fill="#E6E6E2">
    <path d="M50 32 L63 40 L63 50 L50 59 L37 50 L37 40 Z" />
  </g>
</svg>`;

// Spłaszczona lista kolorów do szybkiego wyszukiwania
const ALL_FLAT_COLORS = Object.values(SUNLU_CATALOG.colors).flat();

const KeychainViewer3D = dynamic(
  () =>
    Promise.all([
      import("@react-three/fiber"),
      import("@react-three/drei"),
      import("three-stdlib"),
      import("three"),
    ]).then(([fiber, drei, stdlib, THREE]) => {
      const { Canvas, useFrame } = fiber;
      const { OrbitControls, RoundedBox } = drei;
      const { SVGLoader } = stdlib;

      // -------------------------------------------------------------
      // SHADER DUAL / TRI / SINGLE COLOR W THREE.JS
      // -------------------------------------------------------------
      function SunluDynamicMaterial({ filamentInfo, clippingPlanes }) {
        const matRef = useRef();

        const shaderData = useMemo(() => {
          if (!filamentInfo) return null;

          if (filamentInfo.type === "dual" && filamentInfo.colors) {
            return {
              uniforms: {
                c1: { value: new THREE.Color(filamentInfo.colors[0]) },
                c2: { value: new THREE.Color(filamentInfo.colors[1]) },
              },
              vertexShader: `
                varying vec3 vNormal;
                varying vec3 vViewDir;
                void main() {
                  vNormal = normalize(normalMatrix * normal);
                  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                  vViewDir = normalize(-mvPosition.xyz);
                  gl_Position = projectionMatrix * mvPosition;
                }
              `,
              fragmentShader: `
                uniform vec3 c1;
                uniform vec3 c2;
                varying vec3 vNormal;
                varying vec3 vViewDir;
                void main() {
                  float factor = dot(vNormal, vec3(1.0, 0.0, 0.5)) * 0.5 + 0.5;
                  vec3 finalColor = mix(c1, c2, factor);
                  float light = clamp(dot(vNormal, normalize(vec3(0.5, 1.0, 0.8))), 0.2, 1.0);
                  gl_FragColor = vec4(finalColor * light, 1.0);
                }
              `,
            };
          }

          if (filamentInfo.type === "tri" && filamentInfo.colors) {
            return {
              uniforms: {
                c1: { value: new THREE.Color(filamentInfo.colors[0]) },
                c2: { value: new THREE.Color(filamentInfo.colors[1]) },
                c3: { value: new THREE.Color(filamentInfo.colors[2]) },
              },
              vertexShader: `
                varying vec3 vNormal;
                void main() {
                  vNormal = normalize(normalMatrix * normal);
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
              `,
              fragmentShader: `
                uniform vec3 c1;
                uniform vec3 c2;
                uniform vec3 c3;
                varying vec3 vNormal;
                void main() {
                  float angle = atan(vNormal.y, vNormal.x); // -PI do PI
                  float normAngle = fract((angle + 3.14159) / 6.28318 * 3.0);
                  vec3 col = c1;
                  if (normAngle < 0.33) {
                    col = mix(c1, c2, normAngle * 3.0);
                  } else if (normAngle < 0.66) {
                    col = mix(c2, c3, (normAngle - 0.33) * 3.0);
                  } else {
                    col = mix(c3, c1, (normAngle - 0.66) * 3.0);
                  }
                  float light = clamp(dot(vNormal, normalize(vec3(0.4, 0.8, 0.8))), 0.25, 1.0);
                  gl_FragColor = vec4(col * light, 1.0);
                }
              `,
            };
          }

          return null;
        }, [filamentInfo]);

        if (shaderData) {
          return (
            <shaderMaterial
              ref={matRef}
              attach="material"
              clippingPlanes={clippingPlanes}
              uniforms={shaderData.uniforms}
              vertexShader={shaderData.vertexShader}
              fragmentShader={shaderData.fragmentShader}
              side={THREE.DoubleSide}
            />
          );
        }

        return (
          <meshStandardMaterial
            color={filamentInfo?.hex || "#3C3C3C"}
            roughness={filamentInfo?.roughness ?? 0.38}
            metalness={filamentInfo?.metalness ?? 0.05}
            clippingPlanes={clippingPlanes}
          />
        );
      }

      function PlateStrokeMesh({
        shapeType,
        baseWidth,
        baseHeight,
        baseDiameter,
        baseThickness,
        strokeEnabled,
        strokeWidth,
        strokeThickness,
        strokeFilament,
      }) {
        const strokeGeometry = useMemo(() => {
          if (!strokeEnabled || strokeWidth <= 0) return null;

          const shape = new THREE.Shape();

          if (shapeType === "rect") {
            const halfW = baseWidth / 2;
            const halfH = baseHeight / 2;
            const inW = Math.max(1, halfW - strokeWidth);
            const inH = Math.max(1, halfH - strokeWidth);

            shape.moveTo(-halfW, -halfH);
            shape.lineTo(halfW, -halfH);
            shape.lineTo(halfW, halfH);
            shape.lineTo(-halfW, halfH);
            shape.closePath();

            const hole = new THREE.Path();
            hole.moveTo(-inW, -inH);
            hole.lineTo(-inW, inH);
            hole.lineTo(inW, inH);
            hole.lineTo(inW, -inH);
            hole.closePath();
            shape.holes.push(hole);
          } else if (shapeType === "circle") {
            const rOut = baseDiameter / 2;
            const rIn = Math.max(1, rOut - strokeWidth);

            shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
            const hole = new THREE.Path();
            hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
            shape.holes.push(hole);
          } else if (shapeType === "hexagon") {
            const rOut = baseDiameter / 2;
            const rIn = Math.max(1, rOut - strokeWidth);

            for (let i = 0; i < 6; i++) {
              const angle = (i * Math.PI) / 3 + Math.PI / 6;
              const x = rOut * Math.cos(angle);
              const y = rOut * Math.sin(angle);
              if (i === 0) shape.moveTo(x, y);
              else shape.lineTo(x, y);
            }
            shape.closePath();

            const hole = new THREE.Path();
            for (let i = 0; i < 6; i++) {
              const angle = (i * Math.PI) / 3 + Math.PI / 6;
              const x = rIn * Math.cos(angle);
              const y = rIn * Math.sin(angle);
              if (i === 0) hole.moveTo(x, y);
              else hole.lineTo(x, y);
            }
            hole.closePath();
            shape.holes.push(hole);
          }

          return new THREE.ExtrudeGeometry(shape, {
            depth: strokeThickness,
            bevelEnabled: false,
          });
        }, [shapeType, baseWidth, baseHeight, baseDiameter, strokeEnabled, strokeWidth, strokeThickness]);

        if (!strokeEnabled || !strokeGeometry) return null;

        return (
          <mesh
            geometry={strokeGeometry}
            position={[0, 0, baseThickness / 2 + 0.01]}
            renderOrder={10}
          >
            <SunluDynamicMaterial filamentInfo={strokeFilament} />
          </mesh>
        );
      }

      function SvgMakerWorldLayers({
        svgString,
        layersConfig,
        graphicScale,
        offsetX,
        offsetY,
        baseBounds,
        baseThickness,
        shapeType,
        baseWidth,
        baseHeight,
        baseDiameter,
        strokeEnabled,
        strokeWidth,
      }) {
        const parsedGroups = useMemo(() => {
          if (!svgString) return { c1: [], c2: [], c3: [], c4: [] };
          try {
            const loader = new SVGLoader();
            const svgData = loader.parse(svgString);

            const c1 = [];
            const c2 = [];
            const c3 = [];
            const c4 = [];

            svgData.paths.forEach((path) => {
              const parentId = path.userData?.node?.parentElement?.id;
              const shapes = path.toShapes(true);

              if (parentId === "color_1") c1.push(...shapes);
              else if (parentId === "color_2") c2.push(...shapes);
              else if (parentId === "color_3") c3.push(...shapes);
              else if (parentId === "color_4") c4.push(...shapes);
              else c1.push(...shapes);
            });

            return { c1, c2, c3, c4 };
          } catch (err) {
            console.error("Błąd parsowania SVG:", err);
            return { c1: [], c2: [], c3: [], c4: [] };
          }
        }, [svgString]);

        const clipPlanes = useMemo(() => {
          const margin = strokeEnabled ? strokeWidth : 0.2;
          if (shapeType === "rect") {
            const hw = baseWidth / 2 - margin;
            const hh = baseHeight / 2 - margin;
            return [
              new THREE.Plane(new THREE.Vector3(1, 0, 0), hw),
              new THREE.Plane(new THREE.Vector3(-1, 0, 0), hw),
              new THREE.Plane(new THREE.Vector3(0, 1, 0), hh),
              new THREE.Plane(new THREE.Vector3(0, -1, 0), hh),
            ];
          }
          if (shapeType === "hexagon") {
            const r = (baseDiameter / 2 - margin) * 0.866;
            const planes = [];
            for (let i = 0; i < 6; i++) {
              const angle = (i * Math.PI) / 3 + Math.PI / 6;
              const normal = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
              planes.push(new THREE.Plane(normal, r));
            }
            return planes;
          }
          return [];
        }, [shapeType, baseWidth, baseHeight, baseDiameter, strokeEnabled, strokeWidth]);

        const groups = [
          { shapes: parsedGroups.c1, cfg: layersConfig[0], level: 0 },
          { shapes: parsedGroups.c2, cfg: layersConfig[1], level: 1 },
          { shapes: parsedGroups.c3, cfg: layersConfig[2], level: 2 },
          { shapes: parsedGroups.c4, cfg: layersConfig[3], level: 3 },
        ];

        const minBound = Math.min(baseBounds?.width || 60, baseBounds?.height || 60);
        const uniformScale = (minBound * ((graphicScale || 80) / 100)) / 100;

        return (
          <group position={[offsetX, offsetY, (baseThickness || 3) / 2]}>
            <group
              scale={[uniformScale, -uniformScale, 1]}
              position={[-50 * uniformScale, 50 * uniformScale, 0]}
            >
              {groups.map((grp, gIdx) => {
                const stepZ = grp.level * 0.08;

                return grp.shapes.map((shape, sIdx) => (
                  <mesh
                    key={`g-${gIdx}-s-${sIdx}`}
                    position={[0, 0, stepZ]}
                    renderOrder={grp.level + 1}
                  >
                    <extrudeGeometry
                      args={[
                        shape,
                        {
                          depth: grp.cfg.thickness,
                          bevelEnabled: false,
                        },
                      ]}
                    />
                    <SunluDynamicMaterial
                      filamentInfo={grp.cfg.filament}
                      clippingPlanes={clipPlanes}
                    />
                  </mesh>
                ));
              })}
            </group>
          </group>
        );
      }

      function KeychainMesh({
        shapeType,
        baseFilament,
        baseWidth,
        baseHeight,
        baseDiameter,
        baseThickness,
        hasHole,
        strokeEnabled,
        strokeWidth,
        strokeThickness,
        strokeFilament,
        graphicScale,
        offsetX,
        offsetY,
        reliefSvg,
        layersConfig,
      }) {
        const radius = (baseDiameter || 60) / 2;

        const baseBounds = useMemo(() => {
          if (shapeType === "rect") return { width: baseWidth, height: baseHeight };
          if (shapeType === "hexagon") {
            const innerWidth = radius * Math.sqrt(3);
            return { width: innerWidth, height: innerWidth };
          }
          return { width: baseDiameter, height: baseDiameter };
        }, [shapeType, baseWidth, baseHeight, baseDiameter, radius]);

        return (
          <group>
            {shapeType === "rect" && (
              <group>
                <RoundedBox
                  args={[baseWidth, baseHeight, baseThickness]}
                  radius={3}
                  smoothness={4}
                  position={[0, 0, 0]}
                >
                  <SunluDynamicMaterial filamentInfo={baseFilament} />
                </RoundedBox>
                {hasHole && (
                  <mesh position={[-baseWidth / 2 - 4.5, 0, 0]}>
                    <torusGeometry args={[5, 1.6, 16, 32]} />
                    <SunluDynamicMaterial filamentInfo={baseFilament} />
                  </mesh>
                )}
              </group>
            )}

            {shapeType === "circle" && (
              <group>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[radius, radius, baseThickness, 64]} />
                  <SunluDynamicMaterial filamentInfo={baseFilament} />
                </mesh>
                {hasHole && (
                  <mesh position={[0, radius + 4.5, 0]}>
                    <torusGeometry args={[5, 1.6, 16, 32]} />
                    <SunluDynamicMaterial filamentInfo={baseFilament} />
                  </mesh>
                )}
              </group>
            )}

            {shapeType === "hexagon" && (
              <group>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[radius, radius, baseThickness, 6]} />
                  <SunluDynamicMaterial filamentInfo={baseFilament} />
                </mesh>
                {hasHole && (
                  <mesh position={[0, radius + 4.5, 0]}>
                    <torusGeometry args={[5, 1.6, 16, 32]} />
                    <SunluDynamicMaterial filamentInfo={baseFilament} />
                  </mesh>
                )}
              </group>
            )}

            <PlateStrokeMesh
              shapeType={shapeType}
              baseWidth={baseWidth}
              baseHeight={baseHeight}
              baseDiameter={baseDiameter}
              baseThickness={baseThickness}
              strokeEnabled={strokeEnabled}
              strokeWidth={strokeWidth}
              strokeThickness={strokeThickness}
              strokeFilament={strokeFilament}
            />

            <SvgMakerWorldLayers
              svgString={reliefSvg}
              layersConfig={layersConfig}
              graphicScale={graphicScale}
              offsetX={offsetX}
              offsetY={offsetY}
              baseBounds={baseBounds}
              baseThickness={baseThickness}
              shapeType={shapeType}
              baseWidth={baseWidth}
              baseHeight={baseHeight}
              baseDiameter={baseDiameter}
              strokeEnabled={strokeEnabled}
              strokeWidth={strokeWidth}
            />
          </group>
        );
      }

      return function Viewer(props) {
        return (
          <Canvas
            gl={{ localClippingEnabled: true }}
            camera={{ position: [0, 35, 115], fov: 45 }}
          >
            <ambientLight intensity={1.2} />
            <directionalLight position={[40, 60, 50]} intensity={1.8} />
            <directionalLight position={[-40, 30, -30]} intensity={0.7} />
            <KeychainMesh {...props} />
            <OrbitControls makeDefault minDistance={30} maxDistance={280} />
          </Canvas>
        );
      };
    }),
  { ssr: false }
);

// -------------------------------------------------------------
// KOMPONENT SELEKTORA Z PODZIAŁEM NA KATEGORIE I PRÓBKAMI DUAL/TRI
// -------------------------------------------------------------
function SunluColorPaletteSelector({ selectedFilament, onSelectColor }) {
  const [activeCategory, setActiveCategory] = useState("PLA_PLUS");
  const availableColors = SUNLU_CATALOG.colors[activeCategory] || [];

  return (
    <div className="space-y-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
      {/* Kafelki zakładek kategorii */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {SUNLU_CATALOG.categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition ${
              activeCategory === cat.id
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Siatka próbek kolorów */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin">
        {availableColors.map((item) => {
          const isSelected = selectedFilament?.id === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectColor(item)}
              title={`${item.name} (${item.type})`}
              className={`relative flex-shrink-0 w-7 h-7 rounded-full overflow-hidden transition-transform cursor-pointer ${
                isSelected ? "ring-2 ring-offset-2 ring-[#EF4444] scale-110" : "hover:scale-105 border border-slate-300"
              }`}
            >
              {/* Próbka Single Color */}
              {item.type === "single" && (
                <div className="w-full h-full" style={{ backgroundColor: item.hex }} />
              )}

              {/* Próbka Dual Color (Podzielona 50/50 na skos) */}
              {item.type === "dual" && (
                <div
                  className="w-full h-full"
                  style={{
                    background: `linear-gradient(135deg, ${item.colors[0]} 50%, ${item.colors[1]} 50%)`,
                  }}
                />
              )}

              {/* Próbka Tri Color (3 kolory) */}
              {item.type === "tri" && (
                <div
                  className="w-full h-full"
                  style={{
                    background: `linear-gradient(120deg, ${item.colors[0]} 33%, ${item.colors[1]} 33%, ${item.colors[1]} 66%, ${item.colors[2]} 66%)`,
                  }}
                />
              )}

              {/* Próbka Rainbow */}
              {item.type === "rainbow" && (
                <div
                  className="w-full h-full"
                  style={{
                    background: `linear-gradient(90deg, ${item.colors.join(", ")})`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Wybrana nazwa z oznaczeniem */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[11px] font-semibold text-slate-500">
        <span>Aktywny:</span>
        <span className="text-slate-900 font-bold truncate max-w-[200px]">
          {selectedFilament?.name || "Brak"}
        </span>
      </div>
    </div>
  );
}

export default function KeychainGenerator() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);

  // Kształt bazy i wymiary
  const [shapeType, setShapeType] = useState("hexagon");
  const [baseFilament, setBaseFilament] = useState(SUNLU_CATALOG.colors.PLA_PLUS[1]); // Czerń
  const [baseWidth, setBaseWidth] = useState(65);
  const [baseHeight, setBaseHeight] = useState(50);
  const [baseDiameter, setBaseDiameter] = useState(60);
  const [baseThickness, setBaseThickness] = useState(3.0);
  const [hasHole, setHasHole] = useState(true);

  // Parametry Stroke
  const [strokeEnabled, setStrokeEnabled] = useState(true);
  const [strokeWidth, setStrokeWidth] = useState(2.0);
  const [strokeThickness, setStrokeThickness] = useState(1.0);
  const [strokeFilament, setStrokeFilament] = useState(SUNLU_CATALOG.colors.PLA_PLUS[1]);

  const [activeTab, setActiveTab] = useState("shape");

  const [graphicScale, setGraphicScale] = useState(75);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // Warstwy motywu
  const [layersConfig, setLayersConfig] = useState([
    { id: 1, name: "Warstwa 1 (Baza)", filament: SUNLU_CATALOG.colors.PLA_PLUS[1], thickness: 0.6 },
    { id: 2, name: "Warstwa 2 (Ciało)", filament: SUNLU_CATALOG.colors.PLA_PLUS[5], thickness: 0.8 },
    { id: 3, name: "Warstwa 3 (Cienie)", filament: SUNLU_CATALOG.colors.PLA_PLUS[4], thickness: 1.0 },
    { id: 4, name: "Warstwa 4 (Detale)", filament: SUNLU_CATALOG.colors.PLA_PLUS[0], thickness: 1.2 },
  ]);

  // Modale
  const [isPreprocessingOpen, setIsPreprocessingOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState(null);
  const [exposure, setExposure] = useState(1.0);
  const [contrast, setContrast] = useState(1.0);
  const [saturation, setSaturation] = useState(1.0);
  const [keepBg, setKeepBg] = useState(false);

  const [isConversionPreviewOpen, setIsConversionPreviewOpen] = useState(false);
  const [generatedSvgPreview, setGeneratedSvgPreview] = useState(null);
  const [detectedColors, setDetectedColors] = useState([]);

  const [uploadedSvg, setUploadedSvg] = useState(DEFAULT_SVG);
  const [imageFileName, setImageFileName] = useState("Wybierz grafikę");
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const fileInputRef = useRef(null);

  const areaCm2 =
    shapeType === "rect"
      ? (baseWidth * baseHeight) / 100
      : (Math.PI * Math.pow(baseDiameter / 2, 2)) / 100;
  const unitPrice = Math.max(19, 14 + areaCm2 * 0.45).toFixed(2);
  const totalPrice = (parseFloat(unitPrice) * quantity).toFixed(2);

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFileName(file.name);

    if (file.type === "image/svg+xml") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedSvg(ev.target.result);
        setOffsetX(0);
        setOffsetY(0);
      };
      reader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setModalImageSrc(ev.target.result);
      setExposure(1.0);
      setContrast(1.0);
      setSaturation(1.0);
      setIsPreprocessingOpen(true);
    };
    reader.readAsDataURL(file);
  }

  async function handleConfirmPreprocessing() {
    setIsPreprocessingOpen(false);
    setIsProcessingImg(true);

    try {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = img.width;
        canvas.height = img.height;

        ctx.filter = `brightness(${exposure}) contrast(${contrast}) saturate(${saturation})`;
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (blob) => {
          if (!blob) return;

          const formData = new FormData();
          formData.append("file", blob, "preprocessed.png");
          formData.append("keep_bg", keepBg.toString());

          try {
            const res = await fetch(`${API_URL}/vectorize-ai`, {
              method: "POST",
              body: formData,
            });

            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.detail || "Błąd generowania");
            }

            const data = await res.json();
            setGeneratedSvgPreview(data.svg);
            if (data.detected_colors && Array.isArray(data.detected_colors)) {
              setDetectedColors(data.detected_colors);
            }
            setIsConversionPreviewOpen(true);
          } catch (err) {
            alert("Błąd wektoryzacji: " + err.message);
          } finally {
            setIsProcessingImg(false);
          }
        }, "image/png");
      };
      img.src = modalImageSrc;
    } catch (e) {
      console.error(e);
      setIsProcessingImg(false);
    }
  }

  function handleConfirmConversion() {
    if (generatedSvgPreview) {
      setUploadedSvg(generatedSvgPreview);
      setOffsetX(0);
      setOffsetY(0);
    }

    if (detectedColors.length > 0) {
      const defaultThicknesses = [0.6, 0.8, 1.0, 1.2];
      setLayersConfig((prev) =>
        prev.map((layer, idx) => {
          const hex = detectedColors[idx];
          // Dopasowanie najbliższego koloru Sunlu
          const matched =
            ALL_FLAT_COLORS.find((f) => f.hex.toLowerCase() === hex?.toLowerCase()) || {
              id: `custom_${idx}`,
              name: `Wykryty kolor ${idx + 1}`,
              hex: hex || "#222222",
              type: "single",
            };

          return {
            ...layer,
            filament: matched,
            thickness: defaultThicknesses[idx] || 0.8,
          };
        })
      );
    }

    setIsConversionPreviewOpen(false);
  }

  async function fetchCart(userId) {
    if (!userId) return;
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "in_cart")
      .order("created_at", { ascending: false });
    if (data) setCartItems(data);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchCart(u.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchCart(u.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleAddToCart() {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    setAddingToCart(true);
    try {
      const maxLayerThickness = Math.max(...layersConfig.map((l) => l.thickness));
      const totalThickness = baseThickness + maxLayerThickness;

      const dimX = shapeType === "rect" ? baseWidth : baseDiameter;
      const dimY = shapeType === "rect" ? baseHeight : baseDiameter;

      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        file_name: `Brelok [${shapeType.toUpperCase()}]: ${imageFileName} (${baseFilament.name})`,
        material: `Sunlu ${baseFilament.name}`,
        technology: "FDM Multi-Color AMS",
        layer_height: "0.20 mm",
        infill: 100,
        clean_supports: false,
        brass_inserts: false,
        quantity: quantity,
        total_price: parseFloat(totalPrice),
        dimensions_mm: [dimX, dimY, totalThickness],
        status: "in_cart",
      });

      if (error) throw error;
      await fetchCart(user.id);
      setIsCartOpen(true);
    } catch (err) {
      alert("Błąd zapisu do koszyka: " + err.message);
    } finally {
      setAddingToCart(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F5F9] text-[#0F172A] font-sans">
      <Head>
        <title>Studio Konfiguratora 3D — Drukstacja</title>
      </Head>

      {/* NAVBAR */}
      <header className="max-w-7xl w-full mx-auto px-6 py-5 flex items-center justify-between z-20">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#EF4444] flex items-center justify-center shadow-lg shadow-red-500/30">
            <span className="font-extrabold text-xl text-white">D</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">
            DRUK<span className="text-[#EF4444]">STACJA</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
          <Link href="/" className="hover:text-black transition">
            Wyceniarka STL
          </Link>
          <Link href="/breloki" className="text-[#EF4444] transition">
            Konfigurator 3D
          </Link>
          <span className="hover:text-black cursor-pointer transition">
            Materiały
          </span>
        </nav>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="p-2.5 rounded-full bg-white border border-slate-200 hover:border-slate-400 text-slate-700 shadow-sm transition relative"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {cartItems.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#EF4444] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow">
                {cartItems.length}
              </span>
            )}
          </button>
          {user ? (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-200 text-slate-800">
              {user.email.split("@")[0]}
            </span>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="text-xs font-bold px-4 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition"
            >
              Zaloguj
            </button>
          )}
        </div>
      </header>

      {/* GŁÓWNY MODUŁ */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 pb-10 flex items-center justify-center">
        <div className="bg-white rounded-[32px] border border-slate-200/80 shadow-[0_25px_70px_rgba(0,0,0,0.06)] w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[640px]">
          
          {/* LEWA STRONA: 3D VIEWPORT */}
          <div className="lg:col-span-7 bg-gradient-to-b from-[#F8FAFC] to-[#EDF2F7] relative flex flex-col justify-between p-6 md:p-8">
            <div className="flex items-center justify-between z-10">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#EF4444] block">
                  Studio 4-Color AMS
                </span>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {shapeType === "circle"
                    ? "Podkładka / Brelok Okrągły"
                    : shapeType === "rect"
                    ? "Tabliczka Prostokątna"
                    : "Płaskorzeźba Hexagon"}
                </h1>
              </div>
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm text-slate-600">
                Obracaj i przybliżaj 3D
              </span>
            </div>

            <div className="relative w-full h-[380px] md:h-[430px] my-auto">
              <KeychainViewer3D
                shapeType={shapeType}
                baseFilament={baseFilament}
                baseWidth={baseWidth}
                baseHeight={baseHeight}
                baseDiameter={baseDiameter}
                baseThickness={baseThickness}
                hasHole={hasHole}
                strokeEnabled={strokeEnabled}
                strokeWidth={strokeWidth}
                strokeThickness={strokeThickness}
                strokeFilament={strokeFilament}
                graphicScale={graphicScale}
                offsetX={offsetX}
                offsetY={offsetY}
                reliefSvg={uploadedSvg}
                layersConfig={layersConfig}
              />
            </div>

            <div className="flex items-end justify-between z-10 pt-4 border-t border-slate-200/70">
              <div>
                <span className="text-[11px] font-bold uppercase text-slate-400 block tracking-wider">
                  Cena za sztukę
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 tracking-tight">
                    {totalPrice}
                  </span>
                  <span className="text-sm font-bold text-slate-500">PLN</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white border border-slate-200 rounded-full px-2 py-1 shadow-sm">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-7 h-7 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-100 rounded-full transition"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-bold text-sm text-slate-800">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-7 h-7 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-100 rounded-full transition"
                  >
                    +
                  </button>
                </div>

                <button
                  disabled={addingToCart || isProcessingImg}
                  onClick={handleAddToCart}
                  className="px-6 py-3.5 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/25 transition cursor-pointer disabled:opacity-50"
                >
                  {addingToCart ? "Zapisuję..." : "Dodaj do koszyka +"}
                </button>
              </div>
            </div>
          </div>

          {/* PRAWA STRONA: MODUŁ PARAMETRÓW */}
          <div className="lg:col-span-5 p-6 md:p-8 flex flex-col justify-between bg-white border-l border-slate-100">
            <div className="space-y-4">
              
              {/* 1. SELEKTOR KOLORU BAZY Z KATEGORIAMI */}
              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block mb-1.5 tracking-wider">
                  Kolor płyty bazowej (Sunlu):
                </span>
                <SunluColorPaletteSelector
                  selectedFilament={baseFilament}
                  onSelectColor={(fil) => setBaseFilament(fil)}
                />
              </div>

              {/* Taby konfiguracji */}
              <div>
                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab("shape")}
                    className={`py-2 text-xs font-bold rounded-xl transition ${
                      activeTab === "shape"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Kształt & Rant
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("graphic")}
                    className={`py-2 text-xs font-bold rounded-xl transition ${
                      activeTab === "graphic"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Grafika AI
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("layers")}
                    className={`py-2 text-xs font-bold rounded-xl transition ${
                      activeTab === "layers"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Kolory AMS
                  </button>
                </div>
              </div>

              {/* TAB 1: KSZTAŁT, WYMIARY I STROKE */}
              {activeTab === "shape" && (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "circle", label: "Okrąg", sub: "⌀ 60mm" },
                      { id: "hexagon", label: "Hexagon", sub: "Modern" },
                      { id: "rect", label: "Prostokąt", sub: "Karta" },
                    ].map((s) => (
                      <div
                        key={s.id}
                        onClick={() => setShapeType(s.id)}
                        className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center text-center cursor-pointer transition ${
                          shapeType === s.id
                            ? "border-[#EF4444] bg-red-50/50 text-[#EF4444] shadow-sm font-bold"
                            : "border-slate-200 hover:border-slate-300 text-slate-700"
                        }`}
                      >
                        <span className="text-xs font-bold block">{s.label}</span>
                        <span className="text-[10px] text-slate-400">{s.sub}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Ucho do zawieszenia</span>
                      <span className="text-[10px] text-slate-500">Brelok vs Tabliczka ścienna</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHasHole(!hasHole)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition ${
                        hasHole ? "bg-[#EF4444] justify-end" : "bg-slate-300 justify-start"
                      }`}
                    >
                      <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                    </button>
                  </div>

                  {/* KONTROLKA STROKE */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="strokeToggle"
                          checked={strokeEnabled}
                          onChange={(e) => setStrokeEnabled(e.target.checked)}
                          className="w-4 h-4 rounded text-[#EF4444] accent-[#EF4444] cursor-pointer"
                        />
                        <label htmlFor="strokeToggle" className="text-xs font-bold text-slate-800 cursor-pointer">
                          Stroke (Obramowanie bazy)
                        </label>
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold">Ochrona rantu</span>
                    </div>

                    {strokeEnabled && (
                      <div className="space-y-2.5 pt-2 border-t border-slate-200">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                              <span>Szerokość</span>
                              <span className="text-[#EF4444]">{strokeWidth} mm</span>
                            </div>
                            <input
                              type="range"
                              min="1.0"
                              max="6.0"
                              step="0.5"
                              value={strokeWidth}
                              onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                              <span>Wysokość</span>
                              <span className="text-[#EF4444]">{strokeThickness} mm</span>
                            </div>
                            <input
                              type="range"
                              min="0.4"
                              max="2.5"
                              step="0.2"
                              value={strokeThickness}
                              onChange={(e) => setStrokeThickness(parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                            />
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Kolor rantu:
                          </span>
                          <SunluColorPaletteSelector
                            selectedFilament={strokeFilament}
                            onSelectColor={(fil) => setStrokeFilament(fil)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: GRAFIKA & POZYCJA */}
              {activeTab === "graphic" && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.svg"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                  <div
                    onClick={() => !isProcessingImg && fileInputRef.current?.click()}
                    className="p-3 rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#EF4444] bg-slate-50 flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 text-[#EF4444] flex items-center justify-center font-bold">
                        +
                      </div>
                      <span className="text-xs font-bold text-slate-800 truncate max-w-[200px]">
                        {isProcessingImg ? "AI przetwarza grafikę..." : imageFileName}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#EF4444]">Wybierz</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div>
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                        <span>Skalowanie motywu</span>
                        <span className="text-[#EF4444]">{graphicScale}%</span>
                      </div>
                      <input
                        type="range"
                        min="40"
                        max="105"
                        step="2"
                        value={graphicScale}
                        onChange={(e) => setGraphicScale(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-0.5">
                          <span>Poziom (X)</span>
                          <span className="text-slate-900">{offsetX} mm</span>
                        </div>
                        <input
                          type="range"
                          min="-30"
                          max="30"
                          step="1"
                          value={offsetX}
                          onChange={(e) => setOffsetX(parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-0.5">
                          <span>Pion (Y)</span>
                          <span className="text-slate-900">{offsetY} mm</span>
                        </div>
                        <input
                          type="range"
                          min="-30"
                          max="30"
                          step="1"
                          value={offsetY}
                          onChange={(e) => setOffsetY(parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: WARSTWY FILAMENTU AMS */}
              {activeTab === "layers" && (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {layersConfig.map((layer, idx) => (
                    <div
                      key={layer.id}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          {layer.name}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500 truncate max-w-[150px]">
                          {layer.filament?.name}
                        </span>
                      </div>
                      <SunluColorPaletteSelector
                        selectedFilament={layer.filament}
                        onSelectColor={(fil) => {
                          setLayersConfig((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], filament: fil };
                            return next;
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-400">
              <span>Standard FDM Bambu Lab AMS (Sunlu)</span>
              <span>Wysyłka w 24h</span>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL PREPROCESSING */}
      {isPreprocessingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900">Dostosuj kontrast grafiki</h2>
              <button
                onClick={() => setIsPreprocessingOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-7 flex items-center justify-center bg-slate-100 rounded-2xl p-4 min-h-[280px]">
                {modalImageSrc && (
                  <img
                    src={modalImageSrc}
                    alt="Preview"
                    className="max-h-[260px] object-contain rounded"
                    style={{
                      filter: `brightness(${exposure}) contrast(${contrast}) saturate(${saturation})`,
                    }}
                  />
                )}
              </div>

              <div className="md:col-span-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div>
                    <span className="text-xs font-bold text-slate-600 block mb-1">Jasność</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={exposure}
                      onChange={(e) => setExposure(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-200 rounded accent-[#EF4444]"
                    />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-600 block mb-1">Kontrast</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.1"
                      value={contrast}
                      onChange={(e) => setContrast(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-200 rounded accent-[#EF4444]"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="keepBgToggle"
                      checked={keepBg}
                      onChange={(e) => setKeepBg(e.target.checked)}
                      className="w-4 h-4 rounded text-[#EF4444] accent-[#EF4444] cursor-pointer"
                    />
                    <label htmlFor="keepBgToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                      Zachowaj tło zdjęcia
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleConfirmPreprocessing}
                  className="w-full py-3 rounded-full bg-[#EF4444] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/25"
                >
                  Konwertuj na wektor 3D
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONWERSJI */}
      {isConversionPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 text-center space-y-4">
            <h2 className="text-lg font-black text-slate-900">Podgląd wektoryzacji 4-Color</h2>
            <div className="w-64 h-64 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center p-4">
              {generatedSvgPreview && (
                <div
                  className="w-full h-full flex items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: generatedSvgPreview }}
                />
              )}
            </div>
            <button
              onClick={handleConfirmConversion}
              className="w-full py-3.5 rounded-full bg-[#EF4444] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/25"
            >
              Zastosuj w modelu 3D
            </button>
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLoginSuccess={(u) => setUser(u)} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} items={cartItems} onRemoveItem={() => fetchCart(user?.id)} />
    </div>
  );
}