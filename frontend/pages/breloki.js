import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Domyślny wielowarstwowy SVG (piesek z podziałem na sylwetkę i detale)
const DEFAULT_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g id="layer_mid">
    <path d="M22 25 C10 35 10 65 24 72 C28 65 30 50 30 38 Z" fill="#111111" />
    <path d="M78 25 C90 35 90 65 76 72 C72 65 70 50 70 38 Z" fill="#111111" />
    <path d="M32 30 C32 20 68 20 68 30 C72 45 70 65 50 70 C30 65 28 45 32 30 Z" fill="#111111" />
  </g>
  <g id="layer_top">
    <path d="M44 48 C44 44 56 44 56 48 C56 54 44 54 44 48 Z" fill="#222222" />
    <path d="M38 38 C38 34 44 34 44 38 C44 41 38 41 38 38 Z" fill="#222222" />
    <path d="M56 38 C56 34 62 34 62 38 C62 41 56 41 56 38 Z" fill="#222222" />
    <path d="M46 55 C46 58 54 58 54 55 Z" fill="#222222" />
  </g>
</svg>`;

const COLORS = [
  { id: "#0B0F17", name: "Czerń Głęboka" },
  { id: "#FFFFFF", name: "Biel Czysta" },
  { id: "#00E5FF", name: "Cyjan / Neon" },
  { id: "#2563EB", name: "Kobaltowy Błękit" },
  { id: "#DC2626", name: "Czerwień Ostra" },
  { id: "#F59E0B", name: "Bursztyn / Złoty" },
  { id: "#10B981", name: "Szmaragdowa Zieleń" },
  { id: "#EC4899", name: "Neonowy Róż" },
];

// Komponent 3D Three.js z wyłączonym SSR
const KeychainViewer3D = dynamic(
  () =>
    Promise.all([
      import("@react-three/fiber"),
      import("@react-three/drei"),
      import("three-stdlib"),
    ]).then(([{ Canvas }, { OrbitControls, Center, RoundedBox }, { SVGLoader }]) => {
      function SvgExtrusionMultiLayer({ svgString, midDepth, midColor, topDepth, topColor }) {
        const { midShapes, topShapes } = useMemo(() => {
          if (!svgString) return { midShapes: [], topShapes: [] };
          try {
            const loader = new SVGLoader();
            const svgData = loader.parse(svgString);

            const mid = [];
            const top = [];

            svgData.paths.forEach((path) => {
              const hex = path.color?.getHexString()?.toLowerCase();
              const parentId = path.userData?.node?.parentElement?.id;

              // Rozpoznawanie warstwy po id grupy lub kolorze heksadecymalnym z Gemini
              const isTopLayer = parentId === "layer_top" || hex === "222222";
              const shapes = path.toShapes(true);

              if (isTopLayer) {
                top.push(...shapes);
              } else {
                mid.push(...shapes);
              }
            });

            // Awaryjnie, jeśli model AI nie nadał grup ani kolorów
            if (mid.length === 0 && top.length === 0) {
              const allShapes = svgData.paths.flatMap((p) => p.toShapes(true));
              mid.push(...allShapes);
            }

            return { midShapes: mid, topShapes: top };
          } catch (err) {
            console.error("Błąd parsowania SVG:", err);
            return { midShapes: [], topShapes: [] };
          }
        }, [svgString]);

        return (
          <Center position={[0, 0, 0]}>
            <group scale={[0.38, -0.38, 1]}>
              {/* Warstwa 1: Główna sylwetka */}
              {midShapes.map((shape, idx) => (
                <mesh key={`mid-${idx}`}>
                  <extrudeGeometry
                    args={[
                      shape,
                      {
                        depth: midDepth,
                        bevelEnabled: true,
                        bevelThickness: 0.2,
                        bevelSize: 0.15,
                        bevelSegments: 2,
                      },
                    ]}
                  />
                  <meshStandardMaterial color={midColor} roughness={0.35} metalness={0.05} />
                </mesh>
              ))}

              {/* Warstwa 2: Detale i akcenty wysunięte wyżej */}
              {topShapes.map((shape, idx) => (
                <mesh key={`top-${idx}`} position={[0, 0, midDepth]}>
                  <extrudeGeometry
                    args={[
                      shape,
                      {
                        depth: topDepth,
                        bevelEnabled: true,
                        bevelThickness: 0.15,
                        bevelSize: 0.1,
                        bevelSegments: 2,
                      },
                    ]}
                  />
                  <meshStandardMaterial color={topColor} roughness={0.25} metalness={0.1} />
                </mesh>
              ))}
            </group>
          </Center>
        );
      }

      function KeychainMesh({
        shapeType,
        baseColor,
        reliefSvg,
        midDepth,
        midColor,
        topDepth,
        topColor,
      }) {
        return (
          <group>
            {/* Baza: Prostokąt */}
            {shapeType === "rect" && (
              <group>
                <RoundedBox args={[66, 48, 4]} radius={4} smoothness={4} position={[0, 0, 0]}>
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </RoundedBox>
                <mesh position={[-37, 0, 0]}>
                  <torusGeometry args={[6.5, 2, 16, 32]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </mesh>
              </group>
            )}

            {/* Baza: Okrąg */}
            {shapeType === "circle" && (
              <group>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[27, 27, 4, 48]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </mesh>
                <mesh position={[0, 31, 0]}>
                  <torusGeometry args={[6.5, 2, 16, 32]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </mesh>
              </group>
            )}

            {/* Wytłoczenia leżące na powierzchni bazy (Z = +2.01) */}
            <group position={[0, 0, 2.01]}>
              <SvgExtrusionMultiLayer
                svgString={reliefSvg}
                midDepth={midDepth}
                midColor={midColor}
                topDepth={topDepth}
                topColor={topColor}
              />
            </group>
          </group>
        );
      }

      return function Viewer(props) {
        return (
          <Canvas camera={{ position: [0, 45, 90], fov: 45 }}>
            <ambientLight intensity={0.75} />
            <directionalLight position={[25, 50, 35]} intensity={1.5} />
            <directionalLight position={[-25, 20, -25]} intensity={0.5} />
            <KeychainMesh {...props} />
            <OrbitControls makeDefault minDistance={30} maxDistance={170} />
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

  // Konfiguracja geometrii i 3 warstw kolorystycznych
  const [shapeType, setShapeType] = useState("rect");
  const [baseColor, setBaseColor] = useState("#0B0F17"); // Warstwa 0: Płytka bazy
  const [midColor, setMidColor] = useState("#00E5FF");   // Warstwa 1: Główna sylwetka
  const [topColor, setTopColor] = useState("#FFFFFF");   // Warstwa 2: Detale / Akcenty

  const [midDepth, setMidDepth] = useState(1.2); // mm
  const [topDepth, setTopDepth] = useState(1.0); // mm

  const [uploadedSvg, setUploadedSvg] = useState(DEFAULT_SVG);
  const [imageFileName, setImageFileName] = useState("Domyślny Piesek 3D");
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const fileInputRef = useRef(null);

  const unitPrice = 21.0; // Wycena za zaawansowany druk 3-kolorowy
  const totalPrice = (unitPrice * quantity).toFixed(2);

  async function handleImageUpload(e) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setImageFileName(selectedFile.name);

    if (selectedFile.type === "image/svg+xml") {
      const reader = new FileReader();
      reader.onload = (ev) => setUploadedSvg(ev.target.result);
      reader.readAsText(selectedFile);
      return;
    }

    if (useAI) {
      setIsProcessingImg(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const res = await fetch(`${API_URL}/vectorize-ai`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "Błąd generowania wektora");
        }

        const data = await res.json();
        setUploadedSvg(data.svg);
      } catch (err) {
        console.error("Błąd AI:", err);
        alert("Błąd Gemini AI: " + err.message + ". Używam wektoryzacji awaryjnej.");
        fallbackCanvasVectorize(selectedFile);
      } finally {
        setIsProcessingImg(false);
      }
    } else {
      fallbackCanvasVectorize(selectedFile);
    }
  }

  function fallbackCanvasVectorize(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 100;
        canvas.height = 100;
        ctx.drawImage(img, 0, 0, 100, 100);
        const data = ctx.getImageData(0, 0, 100, 100).data;

        let midPoints = "";
        let topPoints = "";
        for (let y = 0; y < 100; y += 4) {
          for (let x = 0; x < 100; x += 4) {
            const i = (y * 100 + x) * 4;
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (data[i + 3] > 50) {
              if (brightness < 60) {
                topPoints += `M${x},${y} h3 v3 h-3 z `;
              } else if (brightness < 160) {
                midPoints += `M${x},${y} h3 v3 h-3 z `;
              }
            }
          }
        }

        if (!midPoints && !topPoints) midPoints = "M20,20 h60 v60 h-60 z";
        setUploadedSvg(
          `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <g id="layer_mid"><path d="${midPoints}" fill="#111111" /></g>
            <g id="layer_top"><path d="${topPoints}" fill="#222222" /></g>
          </svg>`
        );
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchCart(u.id);
    });

    function handleClickOutside(e) {
      if (genMenuRef.current && !genMenuRef.current.contains(e.target)) setIsGeneratorsOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setIsUserMenuOpen(false);
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
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        file_name: `Brelok AI Tri-Color: [${imageFileName}]`,
        material: "PLA Multi-Color (3 barwy)",
        technology: "FDM Multi-Color 3-Layers",
        layer_height: "0.20 mm",
        infill: 100,
        clean_supports: false,
        brass_inserts: false,
        quantity: quantity,
        total_price: parseFloat(totalPrice),
        dimensions_mm: [
          shapeType === "rect" ? 66 : 54,
          48,
          4 + Number(midDepth) + Number(topDepth),
        ],
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
        <title>Generator Breloków 3D Multi-Color — Drukstacja</title>
      </Head>

      {/* NAVBAR */}
      <header className="border-b border-[#24324A] bg-[#0B0F17]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
                <span className="text-[10px] text-[#94A3B8] block -mt-1 tracking-widest font-mono">LABS 3D</span>
              </div>
            </Link>
          </div>

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
                  className={`w-3.5 h-3.5 transition-transform ${isGeneratorsOpen ? "rotate-180 text-[#00E5FF]" : ""}`}
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
                    Stwórz swój brelok
                  </Link>
                  <div
                    onClick={() => {
                      setIsGeneratorsOpen(false);
                      alert("Generator Litofanów pojawi się wkrótce!");
                    }}
                    className="flex items-center justify-between px-4 py-2.5 text-xs font-mono text-[#94A3B8] hover:bg-[#161F30] hover:text-white cursor-pointer transition"
                  >
                    <span>Litofany (Zdjęcie 3D)</span>
                    <span className="text-[9px] bg-[#24324A] px-1.5 py-0.5 rounded text-[#94A3B8]">Wkrótce</span>
                  </div>
                </div>
              )}
            </div>

            <span className="hover:text-[#00E5FF] cursor-pointer transition">Części użytkowe</span>
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
                      <span className="text-[10px] uppercase font-mono text-[#94A3B8] block">Zalogowano jako</span>
                      <span className="text-xs font-mono text-[#00E5FF] truncate block font-bold">{user.email}</span>
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

      {/* PANEL ROBOCZY */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEWA STRONA: VIEWPORT 3D */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative w-full h-[580px] rounded-2xl border border-[#24324A] bg-[#0E1524] overflow-hidden shadow-2xl">
            <div className="absolute top-4 left-4 z-10 font-mono text-xs text-[#94A3B8] bg-[#0B0F17]/80 px-3 py-1.5 rounded-lg border border-[#24324A] backdrop-blur-md flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
              Podgląd 3D Multi-Color (3 poziomy Z) • Obracaj myszką
            </div>

            <KeychainViewer3D
              shapeType={shapeType}
              baseColor={baseColor}
              reliefSvg={uploadedSvg}
              midDepth={midDepth}
              midColor={midColor}
              topDepth={topDepth}
              topColor={topColor}
            />
          </div>
        </section>

        {/* PRAWA STRONA: KONTROLKI 3 POZIOMÓW */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#161F30] border border-[#24324A] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="border-b border-[#24324A] pb-3">
              <h1 className="text-lg font-bold text-white tracking-wide">BRELOK ZE ZDJĘCIA MULTI-COLOR</h1>
              <p className="text-xs font-mono text-[#94A3B8] mt-0.5">
                Kaskadowy relief 3D (3 niezależne kolory i wysokości filamentu)
              </p>
            </div>

            {/* 1. Upload grafiki */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">
                  1. Obraz / Grafika (PNG, JPG, SVG)
                </label>
                <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAI}
                    onChange={(e) => setUseAI(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#00E5FF] rounded cursor-pointer"
                  />
                  <span className={useAI ? "text-[#00E5FF] font-bold" : "text-[#94A3B8]"}>
                    ✨ Gemini AI (2 Warstwy)
                  </span>
                </label>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                className="hidden"
                onChange={handleImageUpload}
              />
              <div
                onClick={() => !isProcessingImg && fileInputRef.current?.click()}
                className={`border border-dashed rounded-xl p-3 flex items-center justify-between transition cursor-pointer ${
                  isProcessingImg
                    ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white animate-pulse"
                    : "border-[#24324A] hover:border-[#00E5FF] bg-[#0B0F17]"
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <svg className="w-5 h-5 text-[#00E5FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="font-mono text-white truncate max-w-[200px]">
                    {isProcessingImg ? "AI rozdziela sylwetkę od detali..." : imageFileName}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded bg-[#161F30] text-[#00E5FF] border border-[#24324A] text-xs font-mono">
                  {isProcessingImg ? "Przetwarzanie..." : "Wybierz"}
                </span>
              </div>
            </div>

            {/* 2. Kształt bazy */}
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5 uppercase tracking-wider">
                2. Kształt bazy breloka
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setShapeType("rect")}
                  className={`py-2 px-3 rounded-lg border font-bold transition cursor-pointer ${
                    shapeType === "rect"
                      ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white"
                      : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8]"
                  }`}
                >
                  Prostokątny
                </button>
                <button
                  type="button"
                  onClick={() => setShapeType("circle")}
                  className={`py-2 px-3 rounded-lg border font-bold transition cursor-pointer ${
                    shapeType === "circle"
                      ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white"
                      : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8]"
                  }`}
                >
                  Okrągły
                </button>
              </div>
            </div>

            {/* 3. WARSTWA 0: BAZA PŁYTKI */}
            <div className="bg-[#0B0F17]/60 p-3 rounded-xl border border-[#24324A] space-y-2">
              <span className="text-[11px] font-mono text-[#94A3B8] uppercase block">
                Warstwa 0: Płytka bazy breloka (grubość 4 mm)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((col) => (
                  <button
                    key={`base-${col.id}`}
                    type="button"
                    onClick={() => setBaseColor(col.id)}
                    className={`w-6 h-6 rounded border transition cursor-pointer ${
                      baseColor === col.id ? "border-[#00E5FF] scale-110 shadow-[0_0_8px_#00E5FF]" : "border-[#24324A]"
                    }`}
                    style={{ backgroundColor: col.id }}
                  />
                ))}
              </div>
            </div>

            {/* 4. WARSTWA 1: GŁÓWNA SYLWETKA */}
            <div className="bg-[#0B0F17]/60 p-3 rounded-xl border border-[#24324A] space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#00E5FF] uppercase font-bold">Warstwa 1: Główny motyw</span>
                <span className="text-white">+{midDepth} mm</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="2.4"
                step="0.2"
                value={midDepth}
                onChange={(e) => setMidDepth(Number(e.target.value))}
                className="w-full h-1.5 bg-[#161F30] rounded-lg appearance-none cursor-pointer accent-[#00E5FF]"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COLORS.map((col) => (
                  <button
                    key={`mid-${col.id}`}
                    type="button"
                    onClick={() => setMidColor(col.id)}
                    className={`w-6 h-6 rounded border transition cursor-pointer ${
                      midColor === col.id ? "border-[#00E5FF] scale-110 shadow-[0_0_8px_#00E5FF]" : "border-[#24324A]"
                    }`}
                    style={{ backgroundColor: col.id }}
                  />
                ))}
              </div>
            </div>

            {/* 5. WARSTWA 2: DETALE I AKCENTY */}
            <div className="bg-[#0B0F17]/60 p-3 rounded-xl border border-[#24324A] space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-pink-400 uppercase font-bold">Warstwa 2: Detale (Oczy, nos, akcenty)</span>
                <span className="text-white">+{topDepth} mm</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="2.0"
                step="0.2"
                value={topDepth}
                onChange={(e) => setTopDepth(Number(e.target.value))}
                className="w-full h-1.5 bg-[#161F30] rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COLORS.map((col) => (
                  <button
                    key={`top-${col.id}`}
                    type="button"
                    onClick={() => setTopColor(col.id)}
                    className={`w-6 h-6 rounded border transition cursor-pointer ${
                      topColor === col.id ? "border-pink-400 scale-110 shadow-[0_0_8px_#ec4899]" : "border-[#24324A]"
                    }`}
                    style={{ backgroundColor: col.id }}
                  />
                ))}
              </div>
            </div>

            {/* Liczba sztuk & Koszyk */}
            <div className="pt-2 border-t border-[#24324A] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#94A3B8] uppercase font-mono">Liczba sztuk:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-8 h-8 bg-[#0B0F17] border border-[#24324A] hover:border-[#00E5FF] text-white font-mono rounded-lg transition cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono text-white text-sm font-bold w-8 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-8 h-8 bg-[#0B0F17] border border-[#24324A] hover:border-[#00E5FF] text-white font-mono rounded-lg transition cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-baseline justify-between font-mono pt-1">
                <div>
                  <span className="text-[10px] text-[#94A3B8] block uppercase">Cena całkowita brutto</span>
                  <span className="text-3xl font-bold text-[#00E5FF]">{totalPrice}</span>
                  <span className="text-xs text-[#94A3B8] ml-1">PLN</span>
                </div>
                <span className="text-xs text-emerald-400 font-mono">Druk FDM Tri-Color</span>
              </div>

              <button
                type="button"
                disabled={addingToCart || isProcessingImg}
                onClick={handleAddToCart}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00E5FF] to-[#2563EB] hover:opacity-95 text-[#0B0F17] font-bold text-sm uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(0,229,255,0.25)] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {addingToCart ? "Zapisuję..." : "Dodaj brelok Multi-Color do koszyka"}
              </button>
            </div>
          </div>
        </section>
      </main>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLoginSuccess={(u) => setUser(u)} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} items={cartItems} onRemoveItem={() => fetchCart(user?.id)} />
    </div>
  );
}