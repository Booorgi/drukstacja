import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const DEFAULT_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g id="color_1" fill="#111111">
    <path d="M50 8 L85 24 L85 64 L50 92 L15 64 L15 24 Z M50 14 L20 28 L20 60 L50 85 L80 60 L80 28 Z" />
    <path d="M48 35 L52 35 L52 65 L48 65 Z" />
    <path d="M35 48 L65 48 L65 52 L35 52 Z" />
  </g>
  <g id="color_2" fill="#222222">
    <path d="M22 29 L50 16 L78 29 L78 59 L50 83 L22 59 Z" />
  </g>
  <g id="color_3" fill="#333333">
    <path d="M50 25 L70 36 L70 54 L50 67 L30 54 L30 36 Z" />
  </g>
  <g id="color_4" fill="#444444">
    <path d="M50 32 L63 40 L63 50 L50 59 L37 50 L37 40 Z" />
  </g>
</svg>`;

const PALETTE = [
  { id: "#0B0F17", name: "Czerń Głęboka" },
  { id: "#FFFFFF", name: "Biel Czysta" },
  { id: "#00E5FF", name: "Cyjan Neon" },
  { id: "#2563EB", name: "Kobaltowy Błękit" },
  { id: "#8B4513", name: "Ciepły Brąz" },
  { id: "#D27D2D", name: "Karmel / Pomarańcz" },
  { id: "#DC2626", name: "Czerwień Ostra" },
  { id: "#10B981", name: "Szmaragdowa Zieleń" },
  { id: "#F59E0B", name: "Bursztyn / Złoto" },
  { id: "#94A3B8", name: "Platynowy Szary" },
];

const KeychainViewer3D = dynamic(
  () =>
    Promise.all([
      import("@react-three/fiber"),
      import("@react-three/drei"),
      import("three-stdlib"),
    ]).then(([{ Canvas }, { OrbitControls, Center, RoundedBox }, { SVGLoader }]) => {
      function SvgMakerWorldLayers({ svgString, layersConfig, graphicScale }) {
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
              else c4.push(...shapes);
            });

            return { c1, c2, c3, c4 };
          } catch (err) {
            console.error("Błąd parsowania SVG:", err);
            return { c1: [], c2: [], c3: [], c4: [] };
          }
        }, [svgString]);

        const groups = [
          { shapes: parsedGroups.c1, cfg: layersConfig[0], order: 1 },
          { shapes: parsedGroups.c2, cfg: layersConfig[1], order: 2 },
          { shapes: parsedGroups.c3, cfg: layersConfig[2], order: 3 },
          { shapes: parsedGroups.c4, cfg: layersConfig[3], order: 4 },
        ];

        const s = 0.45 * (graphicScale / 100);

        return (
          <Center position={[0, 0, 0]}>
            <group scale={[s, -s, 1]}>
              {groups.map((grp, gIdx) => {
                const zOffset = gIdx * 0.05;
                return grp.shapes.map((shape, sIdx) => (
                  <mesh
                    key={`g-${gIdx}-s-${sIdx}`}
                    position={[0, 0, zOffset]}
                    renderOrder={grp.order}
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
                    <meshStandardMaterial
                      color={grp.cfg.color}
                      roughness={0.35}
                      metalness={0.05}
                    />
                  </mesh>
                ));
              })}
            </group>
          </Center>
        );
      }

      function KeychainMesh({
        shapeType,
        baseColor,
        baseWidth,
        baseHeight,
        baseDiameter,
        baseThickness,
        hasHole,
        graphicScale,
        reliefSvg,
        layersConfig,
      }) {
        const radius = baseDiameter / 2;

        return (
          <group>
            {/* 1. BAZA PROSTOKĄTNA */}
            {shapeType === "rect" && (
              <group>
                <RoundedBox
                  args={[baseWidth, baseHeight, baseThickness]}
                  radius={4}
                  smoothness={4}
                  position={[0, 0, 0]}
                >
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </RoundedBox>
                {hasHole && (
                  <mesh position={[-baseWidth / 2 - 5, 0, 0]}>
                    <torusGeometry args={[5.5, 1.8, 16, 32]} />
                    <meshStandardMaterial color={baseColor} roughness={0.5} />
                  </mesh>
                )}
              </group>
            )}

            {/* 2. BAZA OKRĄGŁA */}
            {shapeType === "circle" && (
              <group>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[radius, radius, baseThickness, 64]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </mesh>
                {hasHole && (
                  <mesh position={[0, radius + 5, 0]}>
                    <torusGeometry args={[5.5, 1.8, 16, 32]} />
                    <meshStandardMaterial color={baseColor} roughness={0.5} />
                  </mesh>
                )}
              </group>
            )}

            {/* 3. BAZA HEXAGON (SZEŚCIOKĄT) */}
            {shapeType === "hexagon" && (
              <group>
                <mesh rotation={[Math.PI / 2, 0, Math.PI / 6]}>
                  <cylinderGeometry args={[radius, radius, baseThickness, 6]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </mesh>
                {hasHole && (
                  <mesh position={[0, radius + 5, 0]}>
                    <torusGeometry args={[5.5, 1.8, 16, 32]} />
                    <meshStandardMaterial color={baseColor} roughness={0.5} />
                  </mesh>
                )}
              </group>
            )}

            {/* Płaskorzeźba ułożona na bazie */}
            <group position={[0, 0, baseThickness / 2 + 0.01]}>
              <SvgMakerWorldLayers
                svgString={reliefSvg}
                layersConfig={layersConfig}
                graphicScale={graphicScale}
              />
            </group>
          </group>
        );
      }

      return function Viewer(props) {
        return (
          <Canvas camera={{ position: [0, 45, 125], fov: 45 }}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[25, 50, 35]} intensity={1.5} />
            <directionalLight position={[-25, 20, -25]} intensity={0.5} />
            <KeychainMesh {...props} />
            <OrbitControls makeDefault minDistance={30} maxDistance={280} />
          </Canvas>
        );
      };
    }),
  { ssr: false }
);

export default function KeychainGenerator() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [isGeneratorsOpen, setIsGeneratorsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const genMenuRef = useRef(null);
  const userMenuRef = useRef(null);

  // Kształt bazy i wymiary (stół max 256 mm)
  const [shapeType, setShapeType] = useState("rect");
  const [baseColor, setBaseColor] = useState("#0B0F17");
  const [baseWidth, setBaseWidth] = useState(65);
  const [baseHeight, setBaseHeight] = useState(50);
  const [baseDiameter, setBaseDiameter] = useState(60);
  const [baseThickness, setBaseThickness] = useState(3.0);
  const [hasHole, setHasHole] = useState(true);

  // Skalowanie grafiki
  const [graphicScale, setGraphicScale] = useState(80);

  // Konfiguracja 4 warstw filamentu
  const [layersConfig, setLayersConfig] = useState([
    { id: 1, name: "Warstwa 1", color: "#0B0F17", thickness: 0.8 },
    { id: 2, name: "Warstwa 2", color: "#00E5FF", thickness: 1.0 },
    { id: 3, name: "Warstwa 3", color: "#2563EB", thickness: 1.2 },
    { id: 4, name: "Warstwa 4", color: "#FFFFFF", thickness: 1.4 },
  ]);

  const [originalColors, setOriginalColors] = useState([]);

  // Modale
  const [isPreprocessingOpen, setIsPreprocessingOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState(null);
  const [exposure, setExposure] = useState(1.0);
  const [contrast, setContrast] = useState(1.0);
  const [saturation, setSaturation] = useState(1.0);
  const [cropRatio, setCropRatio] = useState("1:1");
  const [keepBg, setKeepBg] = useState(false);

  const [isConversionPreviewOpen, setIsConversionPreviewOpen] = useState(false);
  const [generatedSvgPreview, setGeneratedSvgPreview] = useState(null);
  const [detectedColors, setDetectedColors] = useState([]);

  const [uploadedSvg, setUploadedSvg] = useState(DEFAULT_SVG);
  const [imageFileName, setImageFileName] = useState("Wybierz plik");
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const fileInputRef = useRef(null);

  // Dynamiczna kalkulacja ceny według powierzchni
  const areaCm2 =
    shapeType === "rect"
      ? (baseWidth * baseHeight) / 100
      : (Math.PI * Math.pow(baseDiameter / 2, 2)) / 100;
  const unitPrice = Math.max(19, 14 + areaCm2 * 0.45).toFixed(2);
  const totalPrice = (parseFloat(unitPrice) * quantity).toFixed(2);

  function updateLayer(index, key, val) {
    setLayersConfig((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: val };
      return next;
    });
  }

  function resetSingleLayerColor(index) {
    if (originalColors[index]) {
      updateLayer(index, "color", originalColors[index]);
    }
  }

  function resetAllColorsToOriginal() {
    if (originalColors.length > 0) {
      setLayersConfig((prev) =>
        prev.map((layer, idx) => ({
          ...layer,
          color: originalColors[idx] || layer.color,
        }))
      );
    }
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFileName(file.name);

    if (file.type === "image/svg+xml") {
      const reader = new FileReader();
      reader.onload = (ev) => setUploadedSvg(ev.target.result);
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

  function handleTryAgain() {
    setIsConversionPreviewOpen(false);
    setIsPreprocessingOpen(true);
  }

  function handleConfirmConversion() {
    if (generatedSvgPreview) {
      setUploadedSvg(generatedSvgPreview);
    }

    if (detectedColors.length > 0) {
      setOriginalColors([...detectedColors]);
      setLayersConfig((prev) =>
        prev.map((layer, idx) => ({
          ...layer,
          color: detectedColors[idx] || layer.color,
        }))
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

    function handleClickOutside(e) {
      if (genMenuRef.current && !genMenuRef.current.contains(e.target))
        setIsGeneratorsOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target))
        setIsUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("mousedown", handleClickOutside);
    };
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
        file_name: `Tabliczka/Brelok 4-Color [${shapeType.toUpperCase()}]: ${imageFileName}`,
        material: "PLA Multi-Color (4 barwy AMS)",
        technology: "FDM Multi-Color Quantized",
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
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-[#F8FAFC] font-sans">
      <Head>
        <title>Generator Breloków i Tabliczek 4-Color — Drukstacja</title>
      </Head>

      {/* NAVBAR */}
      <header className="border-b border-[#24324A] bg-[#0B0F17]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#00E5FF] to-[#2563EB] flex items-center justify-center p-0.5 shadow-[0_0_15px_rgba(0,229,255,0.3)]">
              <div className="w-full h-full bg-[#0B0F17] rounded-[7px] flex items-center justify-center">
                <span className="font-bold text-lg text-[#00E5FF]">D</span>
              </div>
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">
                DRUK<span className="text-[#00E5FF]">STACJA</span>
              </span>
              <span className="text-[10px] text-[#94A3B8] block -mt-1 tracking-widest font-mono">
                LABS 3D
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-[#94A3B8]">
            <Link href="/" className="hover:text-[#00E5FF] transition">
              Wyceniarka STL
            </Link>
            <div className="relative" ref={genMenuRef}>
              <button
                type="button"
                onClick={() => setIsGeneratorsOpen(!isGeneratorsOpen)}
                className="text-white hover:text-[#00E5FF] transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>Generatory</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${
                    isGeneratorsOpen ? "rotate-180 text-[#00E5FF]" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isGeneratorsOpen && (
                <div className="absolute left-0 mt-2 w-52 bg-[#0E1524] border border-[#24324A] rounded-xl shadow-2xl py-2 z-50 backdrop-blur-md">
                  <Link
                    href="/breloki"
                    onClick={() => setIsGeneratorsOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-mono text-[#00E5FF] bg-[#161F30]/60 hover:bg-[#161F30] transition"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF]" />
                    Breloki i Tabliczki
                  </Link>
                  <div
                    onClick={() => {
                      setIsGeneratorsOpen(false);
                      alert("Generator Litofanów pojawi się wkrótce!");
                    }}
                    className="flex items-center justify-between px-4 py-2.5 text-xs font-mono text-[#94A3B8] hover:bg-[#161F30] hover:text-white cursor-pointer transition"
                  >
                    <span>Litofany (Zdjęcie 3D)</span>
                    <span className="text-[9px] bg-[#24324A] px-1.5 py-0.5 rounded text-[#94A3B8]">
                      Wkrótce
                    </span>
                  </div>
                </div>
              )}
            </div>
            <span className="hover:text-[#00E5FF] cursor-pointer transition">
              Części użytkowe
            </span>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="px-3 py-1.5 text-xs font-mono bg-[#161F30] border border-[#24324A] hover:border-[#00E5FF] text-white rounded-lg transition flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4 text-[#00E5FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <span>Koszyk</span>
              <span className="px-1.5 py-0.5 rounded-full bg-[#00E5FF]/20 text-[#00E5FF] text-[10px] font-bold">
                {cartItems.length}
              </span>
            </button>

            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="px-3 py-1.5 text-xs font-mono bg-[#161F30] border border-[#24324A] hover:border-[#00E5FF] text-white rounded-lg transition flex items-center gap-2 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-[#00E5FF]" />
                  <span>Panel klienta</span>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-[#0E1524] border border-[#24324A] rounded-xl shadow-2xl py-2 z-50 backdrop-blur-md">
                    <div className="px-4 py-2 border-b border-[#24324A] mb-1">
                      <span className="text-[10px] uppercase font-mono text-[#94A3B8] block">
                        Zalogowano jako
                      </span>
                      <span className="text-xs font-mono text-[#00E5FF] truncate block font-bold">
                        {user.email}
                      </span>
                    </div>
                    <Link
                      href="/orders"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs font-mono text-slate-200 hover:bg-[#161F30] hover:text-[#00E5FF] transition"
                    >
                      Zlecenia
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        supabase.auth.signOut();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-mono text-red-400 hover:bg-red-500/10 transition text-left cursor-pointer"
                    >
                      Wyloguj
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="px-3.5 py-1.5 text-xs font-mono font-bold bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30 hover:bg-[#00E5FF]/20 rounded-lg transition cursor-pointer"
              >
                Zaloguj
              </button>
            )}
          </div>
        </div>
      </header>

      {/* GŁÓWNY VIEWPORT 3D & KONTROLKI */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative w-full h-[640px] rounded-2xl border border-[#24324A] bg-[#0E1524] overflow-hidden shadow-2xl">
            <div className="absolute top-4 left-4 z-10 font-mono text-xs text-[#94A3B8] bg-[#0B0F17]/80 px-3 py-1.5 rounded-lg border border-[#24324A] backdrop-blur-md flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
              Podgląd 3D • {shapeType.toUpperCase()}{" "}
              {shapeType === "rect"
                ? `${baseWidth}x${baseHeight}mm`
                : `⌀${baseDiameter}mm`}{" "}
              • Skala {graphicScale}% {hasHole ? "(z uchem)" : "(bez ucha)"}
            </div>

            <KeychainViewer3D
              shapeType={shapeType}
              baseColor={baseColor}
              baseWidth={baseWidth}
              baseHeight={baseHeight}
              baseDiameter={baseDiameter}
              baseThickness={baseThickness}
              hasHole={hasHole}
              graphicScale={graphicScale}
              reliefSvg={uploadedSvg}
              layersConfig={layersConfig}
            />
          </div>
        </section>

        <section className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#161F30] border border-[#24324A] rounded-2xl p-5 shadow-xl space-y-4 max-h-[640px] overflow-y-auto custom-scrollbar">
            <div className="border-b border-[#24324A] pb-2">
              <div className="flex items-center justify-between">
                <h1 className="text-base font-bold text-white tracking-wide">
                  GENERATOR 4-COLOR (AMS)
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30">
                  Pole robocze: 256×256 mm
                </span>
              </div>
              <p className="text-[11px] font-mono text-[#94A3B8] mt-0.5">
                Breloki, tabliczki i podkładki wielokolorowe
              </p>
            </div>

            {/* 1. Upload */}
            <div>
              <span className="text-[11px] font-mono text-[#00E5FF] uppercase font-bold block mb-1.5">
                1. Wybierz grafikę
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                className="hidden"
                onChange={handleFileSelected}
              />
              <div
                onClick={() => !isProcessingImg && fileInputRef.current?.click()}
                className={`border border-dashed rounded-xl p-2.5 flex items-center justify-between transition cursor-pointer ${
                  isProcessingImg
                    ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white animate-pulse"
                    : "border-[#24324A] hover:border-[#00E5FF] bg-[#0B0F17]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#00E5FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="font-mono text-xs text-white truncate max-w-[190px]">
                    {isProcessingImg ? "AI analizuje klastry obrazu..." : imageFileName}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded bg-[#161F30] text-[#00E5FF] border border-[#24324A] text-xs font-mono">
                  {isProcessingImg ? "..." : "Wybierz"}
                </span>
              </div>
            </div>

            {/* 2. Kształt i gabaryty bazy */}
            <div className="bg-[#0B0F17]/60 p-3 rounded-xl border border-[#24324A] space-y-2.5">
              <span className="text-[11px] font-mono text-[#94A3B8] uppercase block">
                2. Kształt i wymiary bazy (do 245 mm)
              </span>

              {/* Wybór geometrii */}
              <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setShapeType("rect")}
                  className={`py-1.5 rounded-lg border font-bold transition cursor-pointer ${
                    shapeType === "rect"
                      ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white"
                      : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8]"
                  }`}
                >
                  Prostokąt
                </button>
                <button
                  type="button"
                  onClick={() => setShapeType("circle")}
                  className={`py-1.5 rounded-lg border font-bold transition cursor-pointer ${
                    shapeType === "circle"
                      ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white"
                      : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8]"
                  }`}
                >
                  Okrąg
                </button>
                <button
                  type="button"
                  onClick={() => setShapeType("hexagon")}
                  className={`py-1.5 rounded-lg border font-bold transition cursor-pointer ${
                    shapeType === "hexagon"
                      ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white"
                      : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8]"
                  }`}
                >
                  Hexagon
                </button>
              </div>

              {/* Przełącznik ucha: Brelok vs Tabliczka */}
              <div className="flex items-center justify-between py-1.5 border-y border-[#24324A]/60 text-xs font-mono">
                <div>
                  <span className="text-white block">Ucho do zawieszenia</span>
                  <span className="text-[10px] text-[#94A3B8]">
                    {hasHole ? "Brelok (z uchem)" : "Tabliczka / Podkładka (bez ucha)"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setHasHole(!hasHole)}
                  className={`w-10 h-5 flex items-center rounded-full p-1 cursor-pointer transition ${
                    hasHole ? "bg-[#00E5FF] justify-end" : "bg-[#1E293B] justify-start"
                  }`}
                >
                  <div className="bg-[#0B0F17] w-3.5 h-3.5 rounded-full shadow-md" />
                </button>
              </div>

              {/* Suwaki wymiarów */}
              {shapeType === "rect" ? (
                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                  <div>
                    <div className="flex justify-between text-[#94A3B8] mb-0.5">
                      <span>Szerokość (X)</span>
                      <span className="text-white font-bold">{baseWidth} mm</span>
                    </div>
                    <input
                      type="range"
                      min="35"
                      max={hasHole ? 230 : 245}
                      step="5"
                      value={baseWidth}
                      onChange={(e) => setBaseWidth(parseInt(e.target.value))}
                      className="w-full h-1 bg-[#161F30] rounded cursor-pointer accent-[#00E5FF]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[#94A3B8] mb-0.5">
                      <span>Wysokość (Y)</span>
                      <span className="text-white font-bold">{baseHeight} mm</span>
                    </div>
                    <input
                      type="range"
                      min="35"
                      max="245"
                      step="5"
                      value={baseHeight}
                      onChange={(e) => setBaseHeight(parseInt(e.target.value))}
                      className="w-full h-1 bg-[#161F30] rounded cursor-pointer accent-[#00E5FF]"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-[11px] font-mono">
                  <div className="flex justify-between text-[#94A3B8] mb-0.5">
                    <span>Średnica / Rozmiar</span>
                    <span className="text-white font-bold">{baseDiameter} mm</span>
                  </div>
                  <input
                    type="range"
                    min="35"
                    max={hasHole ? 230 : 245}
                    step="5"
                    value={baseDiameter}
                    onChange={(e) => setBaseDiameter(parseInt(e.target.value))}
                    className="w-full h-1 bg-[#161F30] rounded cursor-pointer accent-[#00E5FF]"
                  />
                </div>
              )}

              {/* Grubość bazy */}
              <div className="text-[11px] font-mono pt-1 border-t border-[#24324A]/60">
                <div className="flex justify-between text-[#94A3B8] mb-0.5">
                  <span>Grubość płytki bazy (Z)</span>
                  <span className="text-[#00E5FF] font-bold">{baseThickness} mm</span>
                </div>
                <input
                  type="range"
                  min="1.6"
                  max="6.0"
                  step="0.2"
                  value={baseThickness}
                  onChange={(e) => setBaseThickness(parseFloat(e.target.value))}
                  className="w-full h-1 bg-[#161F30] rounded cursor-pointer accent-[#00E5FF]"
                />
              </div>

              {/* Kolor bazy */}
              <div>
                <span className="text-[10px] font-mono text-[#94A3B8] uppercase block mb-1">
                  Kolor bazy podkładki
                </span>
                <div className="flex flex-wrap gap-1">
                  {PALETTE.map((pal) => (
                    <button
                      key={`base-${pal.id}`}
                      type="button"
                      onClick={() => setBaseColor(pal.id)}
                      className={`w-4 h-4 rounded border transition cursor-pointer ${
                        baseColor === pal.id
                          ? "border-[#00E5FF] scale-110 shadow-[0_0_8px_#00E5FF]"
                          : "border-[#24324A]"
                      }`}
                      style={{ backgroundColor: pal.id }}
                      title={pal.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Skalowanie grafiki na breloku */}
            <div className="bg-[#0B0F17]/60 p-3 rounded-xl border border-[#24324A] space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-white font-bold">Skalowanie motywu na bazie</span>
                <span className="text-[#00E5FF] font-bold">{graphicScale}%</span>
              </div>
              <input
                type="range"
                min="40"
                max="100"
                step="2"
                value={graphicScale}
                onChange={(e) => setGraphicScale(parseInt(e.target.value))}
                className="w-full h-1 bg-[#161F30] rounded cursor-pointer accent-[#00E5FF]"
              />
              <span className="text-[10px] font-mono text-[#94A3B8] block">
                Zmniejsz skalę, aby zachować większy margines wokół grafiki.
              </span>
            </div>

            {/* 4. Warstwy filamentu */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#94A3B8] uppercase block">
                  3. Warstwy filamentu & Wypukłość Z (mm)
                </span>
                {originalColors.length > 0 && (
                  <button
                    type="button"
                    onClick={resetAllColorsToOriginal}
                    className="text-[10px] font-mono text-[#00E5FF] hover:underline flex items-center gap-1 cursor-pointer"
                    title="Przywróć oryginalne barwy wykryte z grafiki"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>↺ Przywróć oryginalne</span>
                  </button>
                )}
              </div>

              {layersConfig.map((layer, idx) => (
                <div
                  key={layer.id}
                  className="bg-[#0B0F17]/70 p-2.5 rounded-xl border border-[#24324A] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] bg-[#161F30] text-white border border-[#24324A]">
                        {layer.id}
                      </span>
                      <div
                        className="w-4 h-4 rounded border border-white/20 shadow-sm"
                        style={{ backgroundColor: layer.color }}
                      />
                      <span className="text-white text-[11px] truncate max-w-[130px]">
                        {layer.name} ({layer.color})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {originalColors[idx] && originalColors[idx] !== layer.color && (
                        <button
                          type="button"
                          onClick={() => resetSingleLayerColor(idx)}
                          className="text-[10px] font-mono text-[#94A3B8] hover:text-[#00E5FF] border border-[#24324A] px-1.5 py-0.5 rounded transition"
                          title={`Cofnij do koloru: ${originalColors[idx]}`}
                        >
                          Cofnij
                        </button>
                      )}
                      <span className="text-[#00E5FF] font-bold">+{layer.thickness} mm</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0.4"
                    max="3.0"
                    step="0.2"
                    value={layer.thickness}
                    onChange={(e) => updateLayer(idx, "thickness", parseFloat(e.target.value))}
                    className="w-full h-1 bg-[#161F30] rounded cursor-pointer accent-[#00E5FF]"
                  />

                  <div className="flex flex-wrap gap-1 pt-1">
                    {PALETTE.map((pal) => (
                      <button
                        key={pal.id}
                        type="button"
                        onClick={() => updateLayer(idx, "color", pal.id)}
                        className={`w-4 h-4 rounded border transition cursor-pointer ${
                          layer.color === pal.id
                            ? "border-[#00E5FF] scale-110 shadow-[0_0_8px_#00E5FF]"
                            : "border-[#24324A]"
                        }`}
                        style={{ backgroundColor: pal.id }}
                        title={pal.name}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Podsumowanie i Koszyk */}
            <div className="pt-2 border-t border-[#24324A] space-y-2">
              <div className="flex items-baseline justify-between font-mono">
                <div>
                  <span className="text-[10px] text-[#94A3B8] block uppercase">
                    Cena FDM Multi-Color (AMS)
                  </span>
                  <span className="text-2xl font-bold text-[#00E5FF]">{totalPrice}</span>
                  <span className="text-xs text-[#94A3B8] ml-1">PLN</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-7 h-7 bg-[#0B0F17] border border-[#24324A] text-white font-mono rounded"
                  >
                    -
                  </button>
                  <span className="font-mono text-white text-xs font-bold w-6 text-center">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-7 h-7 bg-[#0B0F17] border border-[#24324A] text-white font-mono rounded"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={addingToCart || isProcessingImg}
                onClick={handleAddToCart}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#00E5FF] to-[#2563EB] text-[#0B0F17] font-bold text-xs uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.25)] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {addingToCart ? "Zapisuję..." : "Dodaj do koszyka"}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* MODAL 1: PREPROCESSING */}
      {isPreprocessingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0E1524] border border-[#24324A] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-[#24324A] flex items-center justify-between">
              <h2 className="text-base font-bold text-white tracking-wide">Image Preprocessing</h2>
              <button
                onClick={() => setIsPreprocessingOpen(false)}
                className="text-[#94A3B8] hover:text-white transition cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-7 flex items-center justify-center bg-[#070A10] border border-[#24324A] rounded-xl p-4 min-h-[320px] bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:16px_16px] overflow-hidden relative">
                {modalImageSrc && (
                  <img
                    src={modalImageSrc}
                    alt="Preprocessed Preview"
                    className="max-h-[300px] object-contain rounded transition-all duration-75"
                    style={{
                      filter: `brightness(${exposure}) contrast(${contrast}) saturate(${saturation})`,
                    }}
                  />
                )}
              </div>

              <div className="md:col-span-5 flex flex-col justify-between space-y-4 font-mono text-xs">
                <div className="space-y-4">
                  <div>
                    <label className="text-[#94A3B8] uppercase block mb-1.5 font-bold">
                      Crop Ratio
                    </label>
                    <div className="flex items-center gap-1.5">
                      {["Free", "1:1", "4:3", "3:2"].map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setCropRatio(ratio)}
                          className={`px-2.5 py-1 rounded border text-[11px] transition ${
                            cropRatio === ratio
                              ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white font-bold"
                              : "border-[#24324A] text-[#94A3B8] hover:border-slate-500"
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1 border-y border-[#24324A]">
                    <span className="text-white">Keep Background</span>
                    <button
                      type="button"
                      onClick={() => setKeepBg(!keepBg)}
                      className={`w-10 h-5 flex items-center rounded-full p-1 cursor-pointer transition ${
                        keepBg ? "bg-emerald-500 justify-end" : "bg-[#1E293B] justify-start"
                      }`}
                    >
                      <div className="bg-white w-3.5 h-3.5 rounded-full shadow-md" />
                    </button>
                  </div>

                  <div className="space-y-3 pt-1">
                    <span className="text-[#00E5FF] uppercase font-bold block text-[11px]">
                      Image Adjustment
                    </span>
                    <div>
                      <div className="flex justify-between text-[#94A3B8] mb-1">
                        <span>Exposure (Jasność)</span>
                        <span className="text-white">{exposure.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value={exposure}
                        onChange={(e) => setExposure(parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#24324A] rounded cursor-pointer accent-[#00E5FF]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[#94A3B8] mb-1">
                        <span>Contrast (Kontrast)</span>
                        <span className="text-white">{contrast.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.5"
                        step="0.1"
                        value={contrast}
                        onChange={(e) => setContrast(parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#24324A] rounded cursor-pointer accent-[#00E5FF]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[#94A3B8] mb-1">
                        <span>Saturation (Nasycenie)</span>
                        <span className="text-white">{saturation.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="2.5"
                        step="0.1"
                        value={saturation}
                        onChange={(e) => setSaturation(parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#24324A] rounded cursor-pointer accent-[#00E5FF]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#24324A]">
                  <button
                    type="button"
                    onClick={() => setIsPreprocessingOpen(false)}
                    className="px-4 py-2 rounded-lg border border-[#24324A] text-[#94A3B8] hover:text-white hover:border-slate-500 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPreprocessing}
                    className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONVERSION PREVIEW */}
      {isConversionPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-[#0E1524] border border-[#24324A] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-[#24324A] flex items-center justify-between">
              <h2 className="text-base font-bold text-white tracking-wide">
                Image Conversion Preview
              </h2>
              <button
                onClick={() => setIsConversionPreviewOpen(false)}
                className="text-[#94A3B8] hover:text-white transition cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-8 flex items-center justify-center min-h-[380px] bg-[#070A10] bg-[radial-gradient(#1E293B_1.5px,transparent_1.5px)] [background-size:20px_20px] overflow-hidden">
              {generatedSvgPreview && (
                <div
                  className="w-80 h-80 flex items-center justify-center drop-shadow-2xl"
                  dangerouslySetInnerHTML={{ __html: generatedSvgPreview }}
                />
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#24324A] bg-[#0B0F17]/60 flex items-center justify-end gap-3 font-mono text-xs">
              <button
                type="button"
                onClick={handleTryAgain}
                className="px-4 py-2 rounded-lg border border-[#24324A] bg-[#161F30] text-slate-200 hover:text-white hover:border-[#00E5FF] transition flex items-center gap-2 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Try Again</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmConversion}
                className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer flex items-center gap-1.5"
              >
                <span>Confirm</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLoginSuccess={(u) => setUser(u)} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} items={cartItems} onRemoveItem={() => fetchCart(user?.id)} />
    </div>
  );
}