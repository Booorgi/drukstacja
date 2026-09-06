import React, { useState, useEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import Navbar from "../components/Navbar";
import {
  SUNLU_CATALOG,
  KEYCHAIN_CATEGORIES,
  KEYCHAIN_FILAMENTS,
  ALL_KEYCHAIN_COLORS,
  fetchFilamentsFromApi,
  isPlaFilament,
  getPlaFinishType,
  getPlaFinishLabel,
} from "../lib/filament";

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

// Dostępne fonty dla tekstu (serwowane lokalnie z /fonts/ – brak zależności zewnętrznych i 100% odporność na 404)
const AVAILABLE_FONTS = [
  { id: "roboto", name: "Roboto", url: "/fonts/roboto.woff" },
  { id: "montserrat", name: "Montserrat", url: "/fonts/montserrat.woff" },
  { id: "bebas", name: "Bebas Neue", url: "/fonts/bebas.woff" },
  { id: "poppins", name: "Poppins", url: "/fonts/poppins.woff" },
  { id: "inter", name: "Inter", url: "/fonts/inter.woff" },
];

class TextErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err) {
    console.warn("Błąd renderowania tekstu 3D:", err);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// Spłaszczona lista kolorów do szybkiego wyszukiwania
const ALL_FLAT_COLORS = ALL_KEYCHAIN_COLORS;

const KeychainViewer3D = dynamic(
  () =>
    Promise.all([
      import("@react-three/fiber"),
      import("@react-three/drei"),
      import("three-stdlib"),
      import("three"),
      import("three/examples/jsm/libs/opentype.module.js"),
    ]).then(([fiber, drei, stdlib, THREE, opentypeModule]) => {
      const { Canvas, useFrame, useThree } = fiber;
      const { OrbitControls, RoundedBox } = drei;
      const { SVGLoader, STLExporter } = stdlib;
      const opentype = opentypeModule.default || opentypeModule;

      // -------------------------------------------------------------
      // FOTOREALISTYCZNY MATERIAŁ DUAL / TRI / SINGLE COLOR DLA THREE.JS
      // -------------------------------------------------------------
      function SunluDynamicMaterial({ filamentInfo, clippingPlanes }) {
        const material = useMemo(() => {
          if (!filamentInfo) {
            return new THREE.MeshStandardMaterial({
              color: "#3C3C3C",
              roughness: 0.40,
              metalness: 0.05,
              clippingPlanes,
            });
          }

          const cat = (filamentInfo.category || filamentInfo.type || "single").toLowerCase();
          const roughnessVal = typeof filamentInfo.roughness === "number" ? filamentInfo.roughness : 0.38;
          const metalnessVal = typeof filamentInfo.metalness === "number" ? filamentInfo.metalness : 0.08;

          // DLA ZWYKŁYCH FILAMENTÓW (PLA, MATTE, PETG, SILK SINGLE, WOOD, TECH, CF)
          if (cat === "single" || !filamentInfo.colors || !Array.isArray(filamentInfo.colors) || filamentInfo.colors.length === 0) {
            return new THREE.MeshStandardMaterial({
              color: filamentInfo.hex || "#E6E6E2",
              roughness: roughnessVal,
              metalness: metalnessVal,
              clippingPlanes,
            });
          }

          // DLA DUAL-COLOR (PRZEJŚCIE 2 KOLORÓW W ZALEŻNOŚCI OD KĄTA KAMERY)
          if (cat === "dual") {
            const mat = new THREE.MeshStandardMaterial({
              roughness: roughnessVal,
              metalness: metalnessVal,
              clippingPlanes,
            });

            const colA = new THREE.Color(filamentInfo.colors[0]);
            const colB = new THREE.Color(filamentInfo.colors[1] || filamentInfo.colors[0]);

            mat.onBeforeCompile = (shader) => {
              shader.uniforms.uColorA = { value: colA };
              shader.uniforms.uColorB = { value: colB };

              shader.vertexShader = `
                varying vec3 vWorldNormal;
                varying vec3 vCamDir;
                ${shader.vertexShader}
              `;

              shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                `
                #include <begin_vertex>
                vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
                vCamDir = normalize(cameraPosition - worldPos.xyz);
                `
              );

              shader.fragmentShader = `
                uniform vec3 uColorA;
                uniform vec3 uColorB;
                varying vec3 vWorldNormal;
                varying vec3 vCamDir;
                ${shader.fragmentShader}
              `;

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <color_fragment>",
                `
                #include <color_fragment>
                // Rzutowanie kąta patrzenia na płaszczyznę poziomą modelu
                float viewDot = dot(vCamDir, vec3(1.0, 0.0, 0.0));
                float blend = clamp(viewDot * 0.7 + 0.5, 0.0, 1.0);
                diffuseColor.rgb = mix(uColorA, uColorB, blend);
                `
              );
            };

            return mat;
          }

          // DLA TRI-COLOR ORAZ RAINBOW (3+ KOLORY WOKÓŁ OSI OBROTU MODELU)
          if (cat === "tri" || cat === "rainbow") {
            const mat = new THREE.MeshStandardMaterial({
              roughness: roughnessVal,
              metalness: metalnessVal,
              clippingPlanes,
            });

            const colors = filamentInfo.colors.slice(0, 3).map((c) => new THREE.Color(c));
            while (colors.length < 3) {
              colors.push(colors[0] || new THREE.Color("#E6E6E2"));
            }

            mat.onBeforeCompile = (shader) => {
              shader.uniforms.uC1 = { value: colors[0] };
              shader.uniforms.uC2 = { value: colors[1] };
              shader.uniforms.uC3 = { value: colors[2] };

              shader.vertexShader = `
                varying vec3 vWorldNormal;
                varying vec3 vCamDir;
                ${shader.vertexShader}
              `;

              shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                `
                #include <begin_vertex>
                vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
                vCamDir = normalize(cameraPosition - worldPos.xyz);
                `
              );

              shader.fragmentShader = `
                uniform vec3 uC1;
                uniform vec3 uC2;
                uniform vec3 uC3;
                varying vec3 vWorldNormal;
                varying vec3 vCamDir;
                ${shader.fragmentShader}
              `;

              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <color_fragment>",
                `
                #include <color_fragment>
                float angle = atan(vCamDir.y, vCamDir.x); // Kąt obserwacji kamery
                float t = fract((angle + 3.14159) / 6.28318 * 1.5);
                vec3 finalC = uC1;
                if (t < 0.333) {
                  finalC = mix(uC1, uC2, t * 3.0);
                } else if (t < 0.666) {
                  finalC = mix(uC2, uC3, (t - 0.333) * 3.0);
                } else {
                  finalC = mix(uC3, uC1, (t - 0.666) * 3.0);
                }
                diffuseColor.rgb = finalC;
                `
              );
            };

            return mat;
          }

          return new THREE.MeshStandardMaterial({
            color: filamentInfo.hex || "#3C3C3C",
            roughness: roughnessVal,
            metalness: metalnessVal,
            clippingPlanes,
          });
        }, [filamentInfo, clippingPlanes]);

        return <primitive object={material} attach="material" />;
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
        layerSeparation,
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

        const separationOffset = layerSeparation * 1;

        return (
          <group
            userData={{
              isExportPart: true,
              partName: "Rant",
              partColor: strokeFilament?.hex || "#FFFFFF",
              partRole: "border_mesh",
            }}
          >
            <mesh
              geometry={strokeGeometry}
              position={[0, 0, baseThickness / 2 + 0.01 + separationOffset]}
              renderOrder={10}
            >
              <SunluDynamicMaterial filamentInfo={strokeFilament} />
            </mesh>
          </group>
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
        layerSeparation,
      }) {
        const parsedGroups = useMemo(() => {
          if (!svgString) return {};
          try {
            const loader = new SVGLoader();
            const svgData = loader.parse(svgString);

            const groups = {};

            svgData.paths.forEach((path) => {
              const parentId = path.userData?.node?.parentElement?.id;
              const shapes = SVGLoader.createShapes(path);

              // Obsługuje dynamiczną liczbę warstw (color_1...color_6)
              const match = parentId?.match(/^color_(\d+)$/);
              if (match) {
                const key = `c${match[1]}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(...shapes);
              } else {
                if (!groups.c1) groups.c1 = [];
                groups.c1.push(...shapes);
              }
            });

            return groups;
          } catch (err) {
            console.error("Błąd parsowania SVG:", err);
            return {};
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

        // Budujemy grupy dynamicznie na podstawie layersConfig
        const groupEntries = layersConfig.map((cfg, idx) => ({
          shapes: parsedGroups[`c${idx + 1}`] || [],
          cfg,
          level: idx,
        }));

        const minBound = Math.min(baseBounds?.width || 60, baseBounds?.height || 60);
        const uniformScale = (minBound * ((graphicScale || 80) / 100)) / 100;

        return (
          <group position={[offsetX, offsetY, (baseThickness || 3) / 2]}>
            <group
              scale={[uniformScale, -uniformScale, 1]}
              position={[-50 * uniformScale, 50 * uniformScale, 0]}
            >
              {groupEntries.map((grp, gIdx) => {
                const stepZ = grp.level * 0.08 + grp.level * layerSeparation;
                if (!grp.shapes || grp.shapes.length === 0) return null;

                const rawName = grp.cfg.name || `Warstwa_${gIdx + 1}`;
                const cleanLayerName = `Grafika_${gIdx + 1}_${rawName.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_]/g, "_")}`;

                return (
                  <group
                    key={`grp-export-${gIdx}`}
                    userData={{
                      isExportPart: true,
                      partName: cleanLayerName,
                      partColor: grp.cfg.filament?.hex || "#EF4444",
                      partRole: "graphic_mesh",
                    }}
                  >
                    {grp.shapes.map((shape, sIdx) => (
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
                    ))}
                  </group>
                );
              })}
            </group>
          </group>
        );
      }

      // Cache pobranych fontów opentype w pamięci klienta
      const fontCache = {};

      async function getOrLoadFont(fontUrl) {
        if (fontCache[fontUrl]) return fontCache[fontUrl];
        try {
          const res = await fetch(fontUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          const font = opentype.parse(buffer);
          fontCache[fontUrl] = font;
          return font;
        } catch (e) {
          console.warn(`Nie udało się załadować fontu ${fontUrl}:`, e);
          return null;
        }
      }

      // Komponent prawdziwego wytłaczanego tekstu 3D
      function TextOverlay3D({
        textContent,
        textFont,
        textSize = 6,
        textPosition = "bottom",
        textOffsetX = 0,
        textOffsetY = 0,
        textFilament,
        textThickness = 0.8,
        baseThickness = 3,
        baseWidth = 50,
        baseHeight = 80,
        baseDiameter = 60,
        shapeType = "rect",
        layerSeparation = 0,
        clipPlanes,
      }) {
        const [shapes, setShapes] = useState([]);

        const matchedFont = AVAILABLE_FONTS.find((f) => f.id === textFont);
        const fontUrl = matchedFont ? matchedFont.url : "/fonts/roboto.woff";

        useEffect(() => {
          if (!textContent || typeof textContent !== "string" || textContent.trim() === "") {
            setShapes([]);
            return;
          }

          let isMounted = true;
          getOrLoadFont(fontUrl).then((font) => {
            if (!isMounted) return;
            const targetFont = font || fontCache["/fonts/roboto.woff"];
            if (!targetFont) {
              getOrLoadFont("/fonts/roboto.woff").then((fallback) => {
                if (!isMounted || !fallback) return;
                generateTextShapes(fallback);
              });
              return;
            }
            generateTextShapes(targetFont);
          });

          function generateTextShapes(loadedFont) {
            try {
              const size = Math.max(2, textSize || 6);
              const p = loadedFont.getPath(textContent, 0, 0, size);
              const bbox = p.getBoundingBox();
              const centerX = (bbox.x1 + bbox.x2) / 2;
              const centerY = (bbox.y1 + bbox.y2) / 2;

              const sp = new THREE.ShapePath();
              p.commands.forEach((cmd) => {
                const mapX = (x) => x - centerX;
                const mapY = (y) => -(y - centerY);

                if (cmd.type === "M") sp.moveTo(mapX(cmd.x), mapY(cmd.y));
                else if (cmd.type === "L") sp.lineTo(mapX(cmd.x), mapY(cmd.y));
                else if (cmd.type === "Q") sp.quadraticCurveTo(mapX(cmd.x1), mapY(cmd.y1), mapX(cmd.x), mapY(cmd.y));
                else if (cmd.type === "C") sp.bezierCurveTo(mapX(cmd.x1), mapY(cmd.y1), mapX(cmd.x2), mapY(cmd.y2), mapX(cmd.x), mapY(cmd.y));
                else if (cmd.type === "Z") sp.currentPath.closePath();
              });

              const generatedShapes = SVGLoader.createShapes(sp);
              if (isMounted) setShapes(generatedShapes);
            } catch (err) {
              console.warn("Błąd konwersji tekstu na kształty 3D:", err);
              if (isMounted) setShapes([]);
            }
          }

          return () => {
            isMounted = false;
          };
        }, [textContent, fontUrl, textSize]);

        if (!shapes || shapes.length === 0) return null;

        // Oblicz bazową pozycję Y wg wybranego presetu (Góra / Środek / Dół)
        let baseY = 0;
        const halfH = shapeType === "rect" ? (baseHeight || 80) / 2 : (baseDiameter || 60) / 2;
        if (textPosition === "top") baseY = halfH * 0.65;
        else if (textPosition === "bottom") baseY = -halfH * 0.65;
        else baseY = 0;

        const finalX = textOffsetX || 0;
        const finalY = baseY + (textOffsetY || 0);

        // Wysokość Z: tekst leży na płycie bazowej (lub unosi się w trybie warstw) i jest wypukły
        const zPos = (baseThickness || 3) / 2 + 0.05 + (layerSeparation || 0) * 5;

        return (
          <group
            position={[finalX, finalY, zPos]}
            userData={{
              isExportPart: true,
              partName: "Tekst_3D",
              partColor: textFilament?.hex || "#FFFFFF",
              partRole: "text_mesh",
            }}
          >
            {shapes.map((shape, idx) => (
              <mesh key={`text-mesh-${idx}`} renderOrder={25}>
                <extrudeGeometry
                  args={[
                    shape,
                    {
                      depth: Math.max(0.4, textThickness || 0.8),
                      bevelEnabled: false,
                    },
                  ]}
                />
                <SunluDynamicMaterial
                  filamentInfo={textFilament}
                  clippingPlanes={clipPlanes}
                />
              </mesh>
            ))}
          </group>
        );
      }

      // (ExportRegistrar jest zdefiniowany poniżej w sekcji return)

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
        layerSeparation,
        textContent,
        textFont,
        textSize,
        textPosition,
        textOffsetX,
        textOffsetY,
        textFilament,
        textThickness,
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

        return (
          <group>
            {shapeType === "rect" && (
              <group>
                <group
                  userData={{
                    isExportPart: true,
                    partName: "Baza",
                    partColor: baseFilament?.hex || "#222222",
                    partRole: "base_mesh",
                  }}
                >
                  <RoundedBox
                    args={[baseWidth, baseHeight, baseThickness]}
                    radius={3}
                    smoothness={4}
                    position={[0, 0, 0]}
                  >
                    <SunluDynamicMaterial filamentInfo={baseFilament} />
                  </RoundedBox>
                </group>
                {hasHole && (
                  <group
                    userData={{
                      isExportPart: true,
                      partName: "Uszko",
                      partColor: baseFilament?.hex || "#222222",
                      partRole: "ring_mesh",
                    }}
                  >
                    <mesh position={[-baseWidth / 2 - 4.5, 0, 0]}>
                      <torusGeometry args={[5, 1.6, 16, 32]} />
                      <SunluDynamicMaterial filamentInfo={baseFilament} />
                    </mesh>
                  </group>
                )}
              </group>
            )}

            {shapeType === "circle" && (
              <group>
                <group
                  userData={{
                    isExportPart: true,
                    partName: "Baza",
                    partColor: baseFilament?.hex || "#222222",
                    partRole: "base_mesh",
                  }}
                >
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[radius, radius, baseThickness, 64]} />
                    <SunluDynamicMaterial filamentInfo={baseFilament} />
                  </mesh>
                </group>
                {hasHole && (
                  <group
                    userData={{
                      isExportPart: true,
                      partName: "Uszko",
                      partColor: baseFilament?.hex || "#222222",
                      partRole: "ring_mesh",
                    }}
                  >
                    <mesh position={[0, radius + 4.5, 0]}>
                      <torusGeometry args={[5, 1.6, 16, 32]} />
                      <SunluDynamicMaterial filamentInfo={baseFilament} />
                    </mesh>
                  </group>
                )}
              </group>
            )}

            {shapeType === "hexagon" && (
              <group>
                <group
                  userData={{
                    isExportPart: true,
                    partName: "Baza",
                    partColor: baseFilament?.hex || "#222222",
                    partRole: "base_mesh",
                  }}
                >
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[radius, radius, baseThickness, 6]} />
                    <SunluDynamicMaterial filamentInfo={baseFilament} />
                  </mesh>
                </group>
                {hasHole && (
                  <group
                    userData={{
                      isExportPart: true,
                      partName: "Uszko",
                      partColor: baseFilament?.hex || "#222222",
                      partRole: "ring_mesh",
                    }}
                  >
                    <mesh position={[0, radius + 4.5, 0]}>
                      <torusGeometry args={[5, 1.6, 16, 32]} />
                      <SunluDynamicMaterial filamentInfo={baseFilament} />
                    </mesh>
                  </group>
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
              layerSeparation={layerSeparation}
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
              layerSeparation={layerSeparation}
            />

            <TextErrorBoundary>
              <React.Suspense fallback={null}>
                <TextOverlay3D
                  textContent={textContent}
                  textFont={textFont}
                  textSize={textSize}
                  textPosition={textPosition}
                  textOffsetX={textOffsetX}
                  textOffsetY={textOffsetY}
                  textFilament={textFilament}
                  textThickness={textThickness}
                  baseThickness={baseThickness}
                  baseWidth={baseWidth}
                  baseHeight={baseHeight}
                  baseDiameter={baseDiameter}
                  shapeType={shapeType}
                  layerSeparation={layerSeparation}
                  clipPlanes={clipPlanes}
                />
              </React.Suspense>
            </TextErrorBoundary>
          </group>
        );
      }

      // Komponent wewnętrzny do rejestracji eksportu
      function ExportRegistrar({ onExportReady }) {
        const { scene } = useThree();

        useEffect(() => {
          if (onExportReady) {
            onExportReady({
              exportSTL: () => {
                try {
                  scene.updateMatrixWorld(true);
                  const exporter = new STLExporter();
                  return exporter.parse(scene, { binary: true });
                } catch (err) {
                  console.error("Błąd podczas eksportu STLExporter:", err);
                  return null;
                }
              },
              exportParts: () => {
                try {
                  scene.updateMatrixWorld(true);
                  const exporter = new STLExporter();
                  const parts = [];

                  scene.traverse((obj) => {
                    if (obj.userData && obj.userData.isExportPart) {
                      let hasGeometry = false;
                      obj.traverse((child) => {
                        if (child.isMesh && child.geometry) {
                          hasGeometry = true;
                        }
                      });
                      if (hasGeometry) {
                        const stlBinary = exporter.parse(obj, { binary: true });
                        const blob = new Blob([stlBinary], { type: "application/octet-stream" });
                        parts.push({
                          name: obj.userData.partName,
                          color: obj.userData.partColor,
                          role: obj.userData.partRole,
                          blob: blob,
                        });
                      }
                    }
                  });

                  return parts;
                } catch (err) {
                  console.error("Błąd podczas eksportu części STLExporter:", err);
                  return [];
                }
              },
            });
          }
        }, [scene, onExportReady]);

        return null;
      }

      return React.forwardRef(function Viewer({ onExportReady, ...props }, ref) {
        const exportFnRef = React.useRef(null);

        React.useImperativeHandle(ref, () => ({
          exportSTL: () => {
            if (exportFnRef.current?.exportSTL) {
              return exportFnRef.current.exportSTL();
            } else if (typeof exportFnRef.current === "function") {
              return exportFnRef.current();
            }
            return null;
          },
          exportParts: () => {
            if (exportFnRef.current?.exportParts) {
              return exportFnRef.current.exportParts();
            }
            return [];
          },
        }));

        return (
          <Canvas
            gl={{ localClippingEnabled: true }}
            camera={{ position: [0, 35, 115], fov: 45 }}
          >
            <ambientLight intensity={1.2} />
            <directionalLight position={[40, 60, 50]} intensity={1.8} />
            <directionalLight position={[-40, 30, -30]} intensity={0.7} />
            <React.Suspense fallback={null}>
              <KeychainMesh {...props} />
            </React.Suspense>
            <ExportRegistrar
              onExportReady={(handlers) => {
                exportFnRef.current = handlers;
                if (onExportReady) onExportReady(handlers);
              }}
            />
            <OrbitControls makeDefault minDistance={30} maxDistance={280} />
          </Canvas>
        );
      });
    }),
  { ssr: false }
);

// -------------------------------------------------------------
// SELEKTOR MATERIAŁÓW I FILAMENTÓW DLA BRELOKÓW (100% PLA)
// Intuicyjny dobór wykończenia: Wszystkie, Klasyczny, Matte, Silk, Dual, Tri, Rainbow, Wood
// -------------------------------------------------------------
function SunluColorPaletteSelector({ selectedFilament, onSelectColor, filaments }) {
  const allList = useMemo(() => {
    return (filaments && filaments.length > 0) ? filaments : ALL_KEYCHAIN_COLORS;
  }, [filaments]);

  // Breloki drukujemy wyłącznie z PLA - filtrujemy wszelkie materiały techniczne (PET-G, TPU, ASA itp.)
  const plaFilaments = useMemo(() => {
    return allList.filter((f) => f.in_stock !== false && isPlaFilament(f));
  }, [allList]);

  // Aktywna kategoria wykończenia PLA
  const [activeCategory, setActiveCategory] = useState("ALL");

  // Filamenty przefiltrowane po wybranym wykończeniu PLA
  const displayedFilaments = useMemo(() => {
    if (activeCategory === "ALL") return plaFilaments;
    return plaFilaments.filter((f) => getPlaFinishType(f) === activeCategory);
  }, [plaFilaments, activeCategory]);

  const currentFinishLabel = useMemo(() => {
    return selectedFilament ? getPlaFinishLabel(selectedFilament) : "PLA Klasyczny";
  }, [selectedFilament]);

  return (
    <div className="space-y-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200/80 shadow-inner">
      {/* 1. POZIOMY PASEK ZAKŁADEK / PILLÓW Z WYKOŃCZENIAMI PLA */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {KEYCHAIN_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.id;
          const count = cat.id === "ALL"
            ? plaFilaments.length
            : plaFilaments.filter((f) => getPlaFinishType(f) === cat.id).length;

          // Ukryj kategorię, jeśli w magazynie nie ma w niej żadnych próbek
          if (cat.id !== "ALL" && count === 0) return null;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? "bg-slate-900 text-white shadow-sm ring-1 ring-slate-900"
                  : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200"
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold ${
                  isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. PRÓBKI KOLORÓW DLA WYBRANEJ KATEGORII */}
      <div className="flex items-center gap-2 overflow-x-auto py-1.5 px-0.5 scrollbar-thin min-h-[44px]">
        {displayedFilaments.length === 0 ? (
          <span className="text-[11px] text-slate-400 italic">Brak dostępnych kolorów w tej kategorii</span>
        ) : (
          displayedFilaments.map((item) => {
            const isSelected = selectedFilament?.id === item.id || selectedFilament?.name === item.name;
            const itemCat = item.category || item.type || "single";

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectColor(item)}
                title={`${item.name} (${getPlaFinishLabel(item)})`}
                className={`relative flex-shrink-0 w-8 h-8 rounded-full p-0.5 transition-all cursor-pointer flex items-center justify-center ${
                  isSelected
                    ? "border-2 border-red-500 scale-110 shadow-md"
                    : "border border-slate-300/80 hover:scale-105 hover:border-slate-400"
                }`}
              >
                {itemCat === "single" && (
                  <div
                    className="w-full h-full rounded-full"
                    style={{
                      backgroundColor: item.hex,
                      boxShadow: item.metalness ? "inset 0 1px 2px rgba(255,255,255,0.4)" : undefined,
                    }}
                  />
                )}
                {itemCat === "dual" && item.colors && (
                  <div
                    className="w-full h-full rounded-full overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${item.colors[0]} 50%, ${item.colors[1]} 50%)`,
                    }}
                  />
                )}
                {itemCat === "tri" && item.colors && (
                  <div
                    className="w-full h-full rounded-full overflow-hidden"
                    style={{
                      background: `linear-gradient(120deg, ${item.colors[0]} 33%, ${item.colors[1]} 33%, ${item.colors[1]} 66%, ${item.colors[2] || item.colors[1]} 66%)`,
                    }}
                  />
                )}
                {itemCat === "rainbow" && item.colors && (
                  <div
                    className="w-full h-full rounded-full overflow-hidden"
                    style={{
                      background: `linear-gradient(90deg, ${item.colors.join(", ")})`,
                    }}
                  />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* 3. CZYTELNA BELKA INFORMACYJNA (Wybrany: [Kropka koloru] [Nazwa koloru] • [Typ wykończenia]) */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-1.5 truncate max-w-[320px]">
          <span className="text-slate-400 text-[11px] font-medium">Wybrany:</span>
          {selectedFilament && (
            <span
              className="inline-block w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0 shadow-sm"
              style={{
                backgroundColor: selectedFilament.hex || selectedFilament.colors?.[0] || "#333",
                background: selectedFilament.colors && selectedFilament.colors.length > 1
                  ? `linear-gradient(135deg, ${selectedFilament.colors.join(", ")})`
                  : selectedFilament.hex || "#333",
              }}
            />
          )}
          <span className="text-slate-900 font-bold truncate">
            {selectedFilament?.name || "Domyślny"}
          </span>
          <span className="text-slate-300 font-normal">•</span>
          <span className="text-slate-500 font-medium truncate">
            {currentFinishLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-200/60 px-2 py-0.5 rounded-md">
            100% PLA
          </span>
        </div>
      </div>
    </div>
  );
}

export default function KeychainGenerator() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);

  // Dynamiczna baza materiałów i filamentów (PostgreSQL Railway / Fallback)
  const [filaments, setFilaments] = useState(ALL_KEYCHAIN_COLORS);

  // Kształt bazy i wymiary
  const [shapeType, setShapeType] = useState("hexagon");
  const [baseFilament, setBaseFilament] = useState(KEYCHAIN_FILAMENTS.PLA[2] || KEYCHAIN_FILAMENTS.PLA[0]); // Czerń
  const [baseWidth, setBaseWidth] = useState(65);
  const [baseHeight, setBaseHeight] = useState(50);
  const [baseDiameter, setBaseDiameter] = useState(60);
  const [baseThickness, setBaseThickness] = useState(3.0);
  const [hasHole, setHasHole] = useState(true);

  // Parametry Stroke
  const [strokeEnabled, setStrokeEnabled] = useState(true);
  const [strokeWidth, setStrokeWidth] = useState(2.0);
  const [strokeThickness, setStrokeThickness] = useState(1.0);
  const [strokeFilament, setStrokeFilament] = useState(KEYCHAIN_FILAMENTS.PLA[2] || KEYCHAIN_FILAMENTS.PLA[0]);

  const [activeTab, setActiveTab] = useState("shape");

  const [graphicScale, setGraphicScale] = useState(75);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // Warstwy motywu
  const [layersConfig, setLayersConfig] = useState([
    { id: 1, name: "Warstwa 1 (Baza)", filament: KEYCHAIN_FILAMENTS.PLA[2], thickness: 0.6 },
    { id: 2, name: "Warstwa 2 (Ciało)", filament: KEYCHAIN_FILAMENTS.PLA[5], thickness: 0.7 },
    { id: 3, name: "Warstwa 3 (Cienie)", filament: KEYCHAIN_FILAMENTS.PLA[3], thickness: 0.8 },
    { id: 4, name: "Warstwa 4 (Detale)", filament: KEYCHAIN_FILAMENTS.PLA[0], thickness: 0.9 },
  ]);

  // --- NOWE: Tekst na breloku ---
  const [textContent, setTextContent] = useState("");
  const [textFont, setTextFont] = useState("roboto");
  const [textSize, setTextSize] = useState(6);
  const [textPosition, setTextPosition] = useState("bottom"); // top, center, bottom
  const [textOffsetX, setTextOffsetX] = useState(0);
  const [textOffsetY, setTextOffsetY] = useState(0);
  const [textFilament, setTextFilament] = useState(KEYCHAIN_FILAMENTS.PLA[0] || KEYCHAIN_FILAMENTS.PLA[2]); // Biel domyślnie
  const [textThickness, setTextThickness] = useState(0.8);


  // --- NOWE: Layer View ---
  const [layerViewEnabled, setLayerViewEnabled] = useState(false);
  const [layerSeparation, setLayerSeparation] = useState(0);

  // --- NOWE: Eksport STL ---
  const viewerRef = useRef(null);
  const exportHandlerRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportKeychainGeometry = () => {
    try {
      let stlData = null;
      if (exportHandlerRef.current && typeof exportHandlerRef.current.exportSTL === "function") {
        stlData = exportHandlerRef.current.exportSTL();
      } else if (typeof exportHandlerRef.current === "function") {
        stlData = exportHandlerRef.current();
      } else if (viewerRef.current && typeof viewerRef.current.exportSTL === "function") {
        stlData = viewerRef.current.exportSTL();
      }
      if (!stlData) {
        console.warn("Brak wygenerowanych danych STL ze sceny 3D breloka.");
        return null;
      }
      return new Blob([stlData], { type: "application/octet-stream" });
    } catch (err) {
      console.warn("Błąd generowania geometrii STL breloka:", err);
      return null;
    }
  };

  const exportKeychainParts = () => {
    try {
      let parts = [];
      if (exportHandlerRef.current && typeof exportHandlerRef.current.exportParts === "function") {
        parts = exportHandlerRef.current.exportParts();
      } else if (viewerRef.current && typeof viewerRef.current.exportParts === "function") {
        parts = viewerRef.current.exportParts();
      }
      return parts || [];
    } catch (err) {
      console.warn("Błąd generowania części STL breloka:", err);
      return [];
    }
  };

  // Modale
  const [isPreprocessingOpen, setIsPreprocessingOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState(null);
  const [exposure, setExposure] = useState(1.0);
  const [contrast, setContrast] = useState(1.0);
  const [saturation, setSaturation] = useState(1.0);
  const [keepBg, setKeepBg] = useState(false);
  const [nColorsModal, setNColorsModal] = useState(4); // Nowy: liczba kolorów

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

  // Animacja Layer View
  useEffect(() => {
    if (!layerViewEnabled) {
      // Animuj powrót do 0
      const animate = () => {
        setLayerSeparation((prev) => {
          if (prev <= 0.05) return 0;
          return prev * 0.85;
        });
      };
      const id = setInterval(animate, 16);
      return () => clearInterval(id);
    } else {
      // Animuj rozejście warstw
      const targetSep = 8;
      const animate = () => {
        setLayerSeparation((prev) => {
          if (prev >= targetSep - 0.1) return targetSep;
          return prev + (targetSep - prev) * 0.12;
        });
      };
      const id = setInterval(animate, 16);
      return () => clearInterval(id);
    }
  }, [layerViewEnabled]);

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
          formData.append("n_colors", nColorsModal.toString());

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

  function findClosestFilament(targetHex) {
    if (!targetHex) return SUNLU_CATALOG.colors.PLA_PLUS[1];
    const exact = ALL_FLAT_COLORS.find((f) => f.hex?.toLowerCase() === targetHex.toLowerCase());
    if (exact) return exact;

    const tr = parseInt(targetHex.slice(1, 3), 16) || 0;
    const tg = parseInt(targetHex.slice(3, 5), 16) || 0;
    const tb = parseInt(targetHex.slice(5, 7), 16) || 0;

    let best = ALL_FLAT_COLORS[0];
    let minDiff = Infinity;

    for (const fil of ALL_FLAT_COLORS) {
      if (!fil.hex || fil.type === "dual" || fil.type === "tri" || fil.type === "rainbow") continue;
      const r = parseInt(fil.hex.slice(1, 3), 16) || 0;
      const g = parseInt(fil.hex.slice(3, 5), 16) || 0;
      const b = parseInt(fil.hex.slice(5, 7), 16) || 0;
      const diff = (r - tr) ** 2 * 0.3 + (g - tg) ** 2 * 0.59 + (b - tb) ** 2 * 0.11;
      if (diff < minDiff) {
        minDiff = diff;
        best = fil;
      }
    }

    if (minDiff < 500) {
      return best;
    }
    return {
      id: `custom_${targetHex.replace("#", "")}`,
      name: best?.name ? `${best.name} (odcień)` : "Kolor motywu",
      hex: targetHex,
      type: "single",
    };
  }

  function handleConfirmConversion() {
    if (generatedSvgPreview) {
      setUploadedSvg(generatedSvgPreview);
      setOffsetX(0);
      setOffsetY(0);
    }

    if (detectedColors.length > 0) {
      const defaultThicknesses = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1];
      const total = detectedColors.length;

      const newLayers = detectedColors.map((hex, idx) => {
        const filament = findClosestFilament(hex);
        let layerRole = `Warstwa ${idx + 1}`;
        if (idx === 0) layerRole = "Warstwa 1 (Baza / Podkład)";
        else if (idx === total - 1) layerRole = `Warstwa ${idx + 1} (Detale / Źrenice / Obrys)`;
        else if (idx === 1) layerRole = `Warstwa 2 (Ciało / Sierść)`;
        else layerRole = `Warstwa ${idx + 1} (Cienie / Akcenty)`;

        return {
          id: idx + 1,
          name: layerRole,
          filament: filament,
          thickness: defaultThicknesses[idx] || (0.6 + idx * 0.1),
        };
      });
      setLayersConfig(newLayers);
    }

    setIsConversionPreviewOpen(false);
  }

  // Eksport STL
  function handleExportSTL() {
    setIsExporting(true);
    try {
      const blob = exportKeychainGeometry();
      if (blob) {
        const link = document.createElement("a");
        link.style.display = "none";
        document.body.appendChild(link);
        link.href = URL.createObjectURL(blob);
        link.download = `brelok_${shapeType}_${Date.now()}.stl`;
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      } else {
        alert("Scena 3D breloka nie jest jeszcze gotowa do eksportu. Spróbuj za chwilę.");
      }
    } catch (err) {
      alert("Błąd eksportu STL: " + err.message);
    } finally {
      setIsExporting(false);
    }
  }

  async function fetchCart(userId) {
    if (!userId) return;
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "in_cart")
      .order("created_at", { ascending: false });
    if (data) {
      try {
        const deletedIds = JSON.parse(localStorage.getItem("deleted_order_ids") || "[]");
        setCartItems(data.filter((it) => !deletedIds.includes(String(it.id))));
      } catch {
        setCartItems(data);
      }
    }
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

  // Dynamiczne ładowanie listy dostępnych materiałów z endpointu GET /api/filaments (PostgreSQL Railway)
  useEffect(() => {
    let isMounted = true;
    async function loadFilaments() {
      try {
        const loaded = await fetchFilamentsFromApi(API_URL);
        if (isMounted && Array.isArray(loaded) && loaded.length > 0) {
          setFilaments(loaded);
          // Zaktualizuj referencje wybranych filamentów o aktualne dane z bazy (ceny, nazwy, roughness, metalness)
          setBaseFilament((prev) => loaded.find((f) => f.id === prev?.id) || prev || loaded[0]);
          setStrokeFilament((prev) => loaded.find((f) => f.id === prev?.id) || prev || loaded[0]);
          setTextFilament((prev) => loaded.find((f) => f.id === prev?.id) || prev || loaded[0]);
          setLayersConfig((prev) =>
            prev.map((l) => ({
              ...l,
              filament: loaded.find((f) => f.id === l.filament?.id) || l.filament,
            }))
          );
        }
      } catch (err) {
        console.warn("Błąd podczas pobierania filamentów z backendu:", err);
      }
    }
    loadFilaments();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleAddToCart() {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    setAddingToCart(true);
    try {
      // Wyłącz widok rozstrzelony przed pobraniem geometrii do druku
      if (layerViewEnabled || layerSeparation > 0) {
        setLayerViewEnabled(false);
        setLayerSeparation(0);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      const maxLayerThickness = Math.max(...layersConfig.map((l) => l.thickness));
      const totalThickness = baseThickness + maxLayerThickness;

      const dimX = shapeType === "rect" ? baseWidth : baseDiameter;
      const dimY = shapeType === "rect" ? baseHeight : baseDiameter;

      const finishLabel = getPlaFinishLabel(baseFilament);
      const materialName = baseFilament?.name || "Standard";

      // 1. Zapis zlecenia w Supabase (status: in_cart)
      const orderPayload = {
        user_id: user.id,
        file_name: `Brelok [${shapeType.toUpperCase()}]: ${imageFileName} (${materialName})`,
        material: `${finishLabel} - ${materialName}`,
        technology: "FDM Multi-Color AMS",
        layer_height: "0.20 mm",
        infill: 100,
        clean_supports: false,
        brass_inserts: false,
        quantity: quantity,
        total_price: parseFloat(totalPrice),
        dimensions_mm: [dimX, dimY, totalThickness],
        status: "in_cart",
      };

      const { data: newOrders, error } = await supabase
        .from("orders")
        .insert(orderPayload)
        .select();

      if (error) throw error;
      const createdOrder = Array.isArray(newOrders) ? newOrders[0] : newOrders;
      const orderId = createdOrder?.id;

      // 2. Eksport geometrii STL ze sceny Three.js i przesłanie na serwer (Multi-part AMS)
      try {
        const parts = exportKeychainParts();
        const combinedStlBlob = exportKeychainGeometry();

        if (orderId && (parts.length > 0 || combinedStlBlob)) {
          const formData = new FormData();
          const cleanSafeName = `brelok_${shapeType}_${Date.now()}.stl`;
          if (combinedStlBlob) {
            formData.append("file", combinedStlBlob, cleanSafeName);
          }
          formData.append("order_id", String(orderId));
          formData.append("file_name", orderPayload.file_name);
          formData.append("material", materialName);
          formData.append("color_hex", baseFilament?.hex || "#222222");
          formData.append("layer_height", "0.20");
          formData.append("nozzle_size", "0.4");
          formData.append("infill", "100");

          if (parts && parts.length > 0) {
            const partsMeta = parts.map((p, idx) => ({
              index: idx,
              name: p.name,
              color: p.color,
              role: p.role,
              filename: `part_${idx}_${p.name.replace(/[^a-zA-Z0-9_]/g, "_")}.stl`,
            }));

            formData.append("parts_json", JSON.stringify(partsMeta));
            parts.forEach((p, idx) => {
              formData.append("parts_files", p.blob, partsMeta[idx].filename);
            });
          }

          const res = await fetch(`${API_URL || ""}/api/orders/upload-geometry`, {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const resData = await res.json();
            const prodUrl = resData.production_file_url || resData.download_url;
            if (prodUrl) {
              await supabase
                .from("orders")
                .update({ production_file_url: prodUrl })
                .eq("id", orderId);
            }
          } else {
            console.warn("Nie udało się zsynchronizować geometrii 3D breloka na backendzie:", await res.text());
          }
        }
      } catch (uploadErr) {
        console.warn("Błąd eksportu lub uploadu geometrii breloka:", uploadErr);
        // Nie blokujemy koszyka, zlecenie zostało już utworzone
      }

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
      <Navbar
        activePage="breloki"
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* GŁÓWNY MODUŁ */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 pb-10 flex items-center justify-center">
        <div className="bg-white rounded-[32px] border border-slate-200/80 shadow-[0_25px_70px_rgba(0,0,0,0.06)] w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[640px]">

          {/* LEWA STRONA: 3D VIEWPORT */}
          <div className="lg:col-span-7 bg-gradient-to-b from-[#F8FAFC] to-[#EDF2F7] relative flex flex-col justify-between p-6 md:p-8">
            <div className="flex items-center justify-between z-10">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#EF4444] block">
                  Studio Multi-Color AMS
                </span>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {shapeType === "circle"
                    ? "Podkładka / Brelok Okrągły"
                    : shapeType === "rect"
                      ? "Tabliczka Prostokątna"
                      : "Płaskorzeźba Hexagon"}
                </h1>
              </div>

              {/* Layer View toggle + Export */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLayerViewEnabled(!layerViewEnabled)}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border shadow-sm transition cursor-pointer ${layerViewEnabled
                    ? "bg-[#EF4444] text-white border-red-400"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {layerViewEnabled ? "Złóż" : "Warstwy"}
                </button>

                <button
                  type="button"
                  onClick={handleExportSTL}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-slate-900 text-white border border-slate-700 hover:bg-slate-800 shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {isExporting ? "..." : "STL"}
                </button>
              </div>
            </div>

            <div className="relative w-full h-[380px] md:h-[430px] my-auto">
              <KeychainViewer3D
                ref={viewerRef}
                onExportReady={(handlers) => {
                  exportHandlerRef.current = handlers;
                }}
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
                layerSeparation={layerSeparation}
                textContent={textContent}
                textFont={textFont}
                textSize={textSize}
                textPosition={textPosition}
                textOffsetX={textOffsetX}
                textOffsetY={textOffsetY}
                textFilament={textFilament}
                textThickness={textThickness}
              />

              {/* Layer View indicator */}
              {layerViewEnabled && (
                <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 bg-[#EF4444] rounded-full animate-pulse" />
                  Widok warstw druku
                </div>
              )}
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
                  Kolor płyty bazowej (Filament PLA):
                </span>
                <SunluColorPaletteSelector
                  selectedFilament={baseFilament}
                  onSelectColor={(fil) => setBaseFilament(fil)}
                  filaments={filaments}
                />
              </div>

              {/* Taby konfiguracji — teraz 4 zakładki */}
              <div>
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-2xl">
                  {[
                    { id: "shape", label: "Kształt" },
                    { id: "graphic", label: "Grafika AI" },
                    { id: "text", label: "Tekst" },
                    { id: "layers", label: "Kolory AMS" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-2 text-[11px] font-bold rounded-xl transition ${activeTab === tab.id
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
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
                        className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center text-center cursor-pointer transition ${shapeType === s.id
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
                      className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition ${hasHole ? "bg-[#EF4444] justify-end" : "bg-slate-300 justify-start"
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
                            filaments={filaments}
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

              {/* TAB 3: TEKST NA BRELOKU (NOWE) */}
              {activeTab === "text" && (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {/* Pole tekstowe */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block mb-1">Treść napisu</span>
                      <input
                        type="text"
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder="Wpisz tekst (np. imię)..."
                        maxLength={30}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#EF4444]/30 focus:border-[#EF4444] placeholder:text-slate-400"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block text-right">
                        {textContent.length}/30
                      </span>
                    </div>

                    {/* Wybór fontu */}
                    <div>
                      <span className="text-xs font-bold text-slate-800 block mb-1.5">Font</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {AVAILABLE_FONTS.map((font) => (
                          <button
                            key={font.id}
                            type="button"
                            onClick={() => setTextFont(font.id)}
                            className={`px-2 py-1.5 rounded-xl text-[11px] font-bold transition border ${textFont === font.id
                              ? "border-[#EF4444] bg-red-50/50 text-[#EF4444] shadow-sm"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                              }`}
                          >
                            {font.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Rozmiar i Wypukłość 3D */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                          <span>Rozmiar tekstu</span>
                          <span className="text-[#EF4444]">{textSize} mm</span>
                        </div>
                        <input
                          type="range"
                          min="3"
                          max="18"
                          step="0.5"
                          value={textSize}
                          onChange={(e) => setTextSize(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                          <span>Wypukłość 3D</span>
                          <span className="text-[#EF4444]">{textThickness} mm</span>
                        </div>
                        <input
                          type="range"
                          min="0.4"
                          max="2.5"
                          step="0.1"
                          value={textThickness}
                          onChange={(e) => setTextThickness(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                        />
                      </div>
                    </div>

                    {/* Pozycja tekstu i przesunięcie */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold text-slate-800">Pozycja tekstu</span>
                        {(textOffsetX !== 0 || textOffsetY !== 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setTextOffsetX(0);
                              setTextOffsetY(0);
                            }}
                            className="text-[10px] font-bold text-[#EF4444] hover:underline transition"
                          >
                            Wyzeruj przesunięcie
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2.5">
                        {[
                          { id: "top", label: "Góra" },
                          { id: "center", label: "Środek" },
                          { id: "bottom", label: "Dół" },
                        ].map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() => {
                              setTextPosition(pos.id);
                              setTextOffsetX(0);
                              setTextOffsetY(0);
                            }}
                            className={`py-1.5 rounded-xl text-[11px] font-bold border transition ${textPosition === pos.id && textOffsetX === 0 && textOffsetY === 0
                              ? "border-[#EF4444] bg-red-50/50 text-[#EF4444] shadow-sm"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                              }`}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>

                      {/* Suwaki swobodnego przesuwania po modelu X i Y */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/80">
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-0.5">
                            <span>Poziom (X)</span>
                            <span className="text-slate-900">{textOffsetX} mm</span>
                          </div>
                          <input
                            type="range"
                            min="-35"
                            max="35"
                            step="1"
                            value={textOffsetX}
                            onChange={(e) => setTextOffsetX(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-0.5">
                            <span>Pion (Y)</span>
                            <span className="text-slate-900">{textOffsetY} mm</span>
                          </div>
                          <input
                            type="range"
                            min="-35"
                            max="35"
                            step="1"
                            value={textOffsetY}
                            onChange={(e) => setTextOffsetY(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Kolor tekstu */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wider">
                      Kolor tekstu (filament):
                    </span>
                    <SunluColorPaletteSelector
                      selectedFilament={textFilament}
                      onSelectColor={(fil) => setTextFilament(fil)}
                      filaments={filaments}
                    />
                  </div>
                </div>
              )}

              {/* TAB 4: WARSTWY FILAMENTU AMS */}
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
                        filaments={filaments}
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

      {/* MODAL PREPROCESSING — ulepszony o slider kolorów */}
      {isPreprocessingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900">Dostosuj grafikę przed wektoryzacją</h2>
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

                  {/* NOWE: Slider liczby kolorów */}
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                      <span>Liczba kolorów (warstw druku)</span>
                      <span className="text-[#EF4444] font-black">{nColorsModal}</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="6"
                      step="1"
                      value={nColorsModal}
                      onChange={(e) => setNColorsModal(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-200 rounded accent-[#EF4444]"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                      <span>Prosty (2)</span>
                      <span>Szczegółowy (6)</span>
                    </div>
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
            <h2 className="text-lg font-black text-slate-900">Podgląd wektoryzacji {detectedColors.length}-Color</h2>

            {/* Podgląd wykrytych kolorów */}
            <div className="flex items-center justify-center gap-1.5">
              {detectedColors.map((hex, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className="w-7 h-7 rounded-full border-2 border-white shadow-md"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="text-[9px] font-mono text-slate-400">{hex}</span>
                </div>
              ))}
            </div>

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
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onRemoveItem={(removedId) => {
          setCartItems((prev) => prev.filter((it) => String(it.id) !== String(removedId)));
        }}
      />
    </div>
  );
}