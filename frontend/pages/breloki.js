import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Domyślny SVG z 4 poziomami głębokości (Sylwetka -> Pysk/Uszy -> Oczy -> Nos/Źrenice)
const DEFAULT_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g id="layer_1">
    <path d="M22 25 C10 35 10 65 24 72 C28 65 30 50 30 38 Z" fill="#111111" />
    <path d="M78 25 C90 35 90 65 76 72 C72 65 70 50 70 38 Z" fill="#111111" />
    <path d="M30 25 C30 15 70 15 70 25 C75 45 72 70 50 75 C28 70 25 45 30 25 Z" fill="#111111" />
    <path d="M38 75 L62 75 L66 92 L34 92 Z" fill="#111111" />
  </g>
  <g id="layer_2">
    <path d="M18 36 C14 44 14 60 22 66 C24 60 25 48 24 40 Z" fill="#222222" />
    <path d="M82 36 C86 44 86 60 78 66 C76 60 75 48 76 40 Z" fill="#222222" />
    <path d="M50 20 C42 35 36 55 36 65 C36 72 64 72 64 65 C64 55 58 35 50 20 Z" fill="#222222" />
    <path d="M42 77 L58 77 L62 90 L38 90 Z" fill="#222222" />
  </g>
  <g id="layer_3">
    <path d="M34 38 C34 33 42 33 42 38 C42 42 34 42 34 38 Z" fill="#333333" />
    <path d="M58 38 C58 33 66 33 66 38 C66 42 58 42 58 38 Z" fill="#333333" />
    <path d="M34 31 C38 29 44 31 44 33 Z" fill="#333333" />
    <path d="M66 31 C62 29 56 31 56 33 Z" fill="#333333" />
  </g>
  <g id="layer_4">
    <path d="M46 56 C46 50 54 50 54 56 C54 62 46 62 46 56 Z" fill="#444444" />
    <path d="M47 65 C47 67 53 67 53 65 Z" fill="#444444" />
    <path d="M37 38 C37 36 40 36 40 38 C40 40 37 40 37 38 Z" fill="#444444" />
    <path d="M61 38 C61 36 64 36 64 38 C64 40 61 40 61 38 Z" fill="#444444" />
  </g>
</svg>`;

const COLORS = [
  { id: "#0B0F17", name: "Czerń Głęboka" },
  { id: "#FFFFFF", name: "Biel Czysta" },
  { id: "#1E40AF", name: "Kobalt Ciemny" },
  { id: "#00E5FF", name: "Cyjan Neon" },
  { id: "#D1D5DB", name: "Jasnoszary / Beż" },
  { id: "#DC2626", name: "Czerwień Ostra" },
  { id: "#F59E0B", name: "Bursztyn / Złoty" },
  { id: "#EC4899", name: "Neonowy Róż" },
];

// Three.js Canvas Viewer z wyłączonym SSR
const KeychainViewer3D = dynamic(
  () =>
    Promise.all([
      import("@react-three/fiber"),
      import("@react-three/drei"),
      import("three-stdlib"),
    ]).then(([{ Canvas }, { OrbitControls, Center, RoundedBox }, { SVGLoader }]) => {
      function SvgExtrusion4Layers({
        svgString,
        l1Depth,
        l1Color,
        l2Depth,
        l2Color,
        l3Depth,
        l3Color,
        l4Depth,
        l4Color,
      }) {
        const layers = useMemo(() => {
          if (!svgString) return { l1: [], l2: [], l3: [], l4: [] };
          try {
            const loader = new SVGLoader();
            const svgData = loader.parse(svgString);

            const l1 = [];
            const l2 = [];
            const l3 = [];
            const l4 = [];

            svgData.paths.forEach((path) => {
              const hex = path.color?.getHexString()?.toLowerCase();
              const parentId = path.userData?.node?.parentElement?.id;
              const shapes = path.toShapes(true);

              if (parentId === "layer_4" || hex === "444444") {
                l4.push(...shapes);
              } else if (parentId === "layer_3" || hex === "333333") {
                l3.push(...shapes);
              } else if (parentId === "layer_2" || hex === "222222") {
                l2.push(...shapes);
              } else {
                l1.push(...shapes);
              }
            });

            // Awaryjnie, gdyby SVG nie miał podziału
            if (l1.length === 0 && l2.length === 0 && l3.length === 0 && l4.length === 0) {
              l1.push(...svgData.paths.flatMap((p) => p.toShapes(true)));
            }

            return { l1, l2, l3, l4 };
          } catch (err) {
            console.error("Błąd parsowania SVG:", err);
            return { l1: [], l2: [], l3: [], l4: [] };
          }
        }, [svgString]);

        // Pozycje Z (kaskadowe nakładanie)
        const z1 = 0;
        const z2 = l1Depth;
        const z3 = l1Depth + l2Depth;
        const z4 = l1Depth + l2Depth + l3Depth;

        return (
          <Center position={[0, 0, 0]}>
            <group scale={[0.4, -0.4, 1]}>
              {/* Warstwa 1: Główna bryła */}
              {layers.l1.map((shape, idx) => (
                <mesh key={`l1-${idx}`} position={[0, 0, z1]}>
                  <extrudeGeometry args={[shape, { depth: l1Depth, bevelEnabled: false }]} />
                  <meshStandardMaterial color={l1Color} roughness={0.35} />
                </mesh>
              ))}

              {/* Warstwa 2: Drugi plan (pyszczek, łapy) */}
              {layers.l2.map((shape, idx) => (
                <mesh key={`l2-${idx}`} position={[0, 0, z2]}>
                  <extrudeGeometry args={[shape, { depth: l2Depth, bevelEnabled: false }]} />
                  <meshStandardMaterial color={l2Color} roughness={0.35} />
                </mesh>
              ))}

              {/* Warstwa 3: Akcenty (oczy, obwódki) */}
              {layers.l3.map((shape, idx) => (
                <mesh key={`l3-${idx}`} position={[0, 0, z3]}>
                  <extrudeGeometry args={[shape, { depth: l3Depth, bevelEnabled: false }]} />
                  <meshStandardMaterial color={l3Color} roughness={0.3} />
                </mesh>
              ))}

              {/* Warstwa 4: Mikro-detale (czubek nosa, źrenice) */}
              {layers.l4.map((shape, idx) => (
                <mesh key={`l4-${idx}`} position={[0, 0, z4]}>
                  <extrudeGeometry args={[shape, { depth: l4Depth, bevelEnabled: false }]} />
                  <meshStandardMaterial color={l4Color} roughness={0.25} />
                </mesh>
              ))}
            </group>
          </Center>
        );
      }

      function KeychainMesh({ shapeType, baseColor, reliefSvg, ...props }) {
        return (
          <group>
            {shapeType === "rect" && (
              <group>
                <RoundedBox args={[68, 50, 4]} radius={4} smoothness={4} position={[0, 0, 0]}>
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </RoundedBox>
                <mesh position={[-38, 0, 0]}>
                  <torusGeometry args={[6.5, 2, 16, 32]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </mesh>
              </group>
            )}

            {shapeType === "circle" && (
              <group>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[28, 28, 4, 48]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </mesh>
                <mesh position={[0, 32, 0]}>
                  <torusGeometry args={[6.5, 2, 16, 32]} />
                  <meshStandardMaterial color={baseColor} roughness={0.5} />
                </mesh>
              </group>
            )}

            {/* Powierzchnia bazy breloka Z = +2.01 */}
            <group position={[0, 0, 2.01]}>
              <SvgExtrusion4Layers svgString={reliefSvg} {...props} />
            </group>
          </group>
        );
      }

      return function Viewer(props) {
        return (
          <Canvas camera={{ position: [0, 45, 95], fov: 45 }}>
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

  // Kształt bazy
  const [shapeType, setShapeType] = useState("rect");

  // 4 poziomy kolorów + Baza
  const [baseColor, setBaseColor] = useState("#0B0F17"); // Baza
  const [l1Color, setL1Color] = useState("#1E40AF");     // W1: Sylwetka / Uszy
  const [l2Color, setL2Color] = useState("#D1D5DB");     // W2: Pysk / Czoło
  const [l3Color, setL3Color] = useState("#FFFFFF");     // W3: Oczy / Brwi
  const [l4Color, setL4Color] = useState("#0B0F17");     // W4: Nos / Źrenice

  // Wysokości poszczególnych warstw (w mm)
  const [l1Depth, setL1Depth] = useState(1.0);
  const [l2Depth, setL2Depth] = useState(0.8);
  const [l3Depth, setL3Depth] = useState(0.6);
  const [l4Depth, setL4Depth] = useState(0.6);

  const [uploadedSvg, setUploadedSvg] = useState(DEFAULT_SVG);
  const [imageFileName, setImageFileName] = useState("Piesek 4-Kolorowy");
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const fileInputRef = useRef(null);

  const unitPrice = 24.0; // Wycena FDM 4-Color AMS
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
        alert("Błąd Gemini AI: " + err.message);
      } finally {
        setIsProcessingImg(false);
      }
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
        file_name: `Brelok 4-Color Relief: [${imageFileName}]`,
        material: "PLA Multi-Color (4 barwy)",
        technology: "FDM Multi-Color 4-Layers",
        layer_height: "0.20 mm",
        infill: 100,
        clean_supports: false,
        brass_inserts: false,
        quantity: quantity,
        total_price: parseFloat(totalPrice),
        dimensions_mm: [
          shapeType === "rect" ? 68 : 56,
          50,
          4 + Number(l1Depth) + Number(l2Depth) + Number(l3Depth) + Number(l4Depth),
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
        <title>Generator Breloków 4-Kolorowych AI — Drukstacja</title>
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
              <span className="text-[10px] text-[#94A3B8] block -mt-1 tracking-widest font-mono">LABS 3D</span>
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

      {/* VIEWPORT & FORMULARZ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEWA STRONA: VIEWPORT 3D */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative w-full h-[620px] rounded-2xl border border-[#24324A] bg-[#0E1524] overflow-hidden shadow-2xl">
            <div className="absolute top-4 left-4 z-10 font-mono text-xs text-[#94A3B8] bg-[#0B0F17]/80 px-3 py-1.5 rounded-lg border border-[#24324A] backdrop-blur-md flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
              Podgląd 4-Kolorowy Kaskadowy (Baza + 4 Poziomy Z)
            </div>

            <KeychainViewer3D
              shapeType={shapeType}
              baseColor={baseColor}
              reliefSvg={uploadedSvg}
              l1Depth={l1Depth}
              l1Color={l1Color}
              l2Depth={l2Depth}
              l2Color={l2Color}
              l3Depth={l3Depth}
              l3Color={l3Color}
              l4Depth={l4Depth}
              l4Color={l4Color}
            />
          </div>
        </section>

        {/* PRAWA STRONA: KONTROLKI 4 WARSTW */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#161F30] border border-[#24324A] rounded-2xl p-5 shadow-xl space-y-3.5 max-h-[620px] overflow-y-auto custom-scrollbar">
            <div className="border-b border-[#24324A] pb-2.5">
              <h1 className="text-base font-bold text-white tracking-wide">BRELOK 4-KOLOROWY ZE ZDJĘCIA</h1>
              <p className="text-[11px] font-mono text-[#94A3B8]">
                Pełne zachowanie oczu, nosa i detali pyszczka na osobnych poziomach
              </p>
            </div>

            {/* Upload */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                className="hidden"
                onChange={handleImageUpload}
              />
              <div
                onClick={() => !isProcessingImg && fileInputRef.current?.click()}
                className={`border border-dashed rounded-xl p-2.5 flex items-center justify-between transition cursor-pointer ${
                  isProcessingImg
                    ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white animate-pulse"
                    : "border-[#24324A] hover:border-[#00E5FF] bg-[#0B0F17]"
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-white truncate max-w-[210px]">
                    {isProcessingImg ? "AI rozdziela 4 warstwy z nosem i oczami..." : imageFileName}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded bg-[#161F30] text-[#00E5FF] border border-[#24324A] text-xs font-mono">
                  {isProcessingImg ? "Przetwarzam..." : "Wgraj"}
                </span>
              </div>
            </div>

            {/* Kształt bazy */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => setShapeType("rect")}
                className={`py-1.5 px-3 rounded-lg border font-bold transition cursor-pointer ${
                  shapeType === "rect" ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white" : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8]"
                }`}
              >
                Baza Prostokątna
              </button>
              <button
                type="button"
                onClick={() => setShapeType("circle")}
                className={`py-1.5 px-3 rounded-lg border font-bold transition cursor-pointer ${
                  shapeType === "circle" ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white" : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8]"
                }`}
              >
                Baza Okrągła
              </button>
            </div>

            {/* Warstwa 0: Płytka Bazy */}
            <div className="bg-[#0B0F17]/60 p-2 rounded-lg border border-[#24324A]">
              <span className="text-[10px] font-mono text-[#94A3B8] uppercase block mb-1">
                Poziom 0: Baza breloka
              </span>
              <div className="flex flex-wrap gap-1">
                {COLORS.map((col) => (
                  <button
                    key={`b-${col.id}`}
                    type="button"
                    onClick={() => setBaseColor(col.id)}
                    className={`w-5 h-5 rounded border transition ${baseColor === col.id ? "border-[#00E5FF] scale-110" : "border-[#24324A]"}`}
                    style={{ backgroundColor: col.id }}
                  />
                ))}
              </div>
            </div>

            {/* Warstwa 1: Główna sylwetka */}
            <div className="bg-[#0B0F17]/60 p-2 rounded-lg border border-[#24324A] space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-[#1E40AF]">
                <span className="font-bold">Poziom 1: Sylwetka / Uszy</span>
                <span className="text-white">+{l1Depth}mm</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="2.0"
                step="0.2"
                value={l1Depth}
                onChange={(e) => setL1Depth(Number(e.target.value))}
                className="w-full h-1 bg-[#161F30] rounded appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex flex-wrap gap-1">
                {COLORS.map((col) => (
                  <button
                    key={`l1-${col.id}`}
                    type="button"
                    onClick={() => setL1Color(col.id)}
                    className={`w-5 h-5 rounded border transition ${l1Color === col.id ? "border-blue-500 scale-110" : "border-[#24324A]"}`}
                    style={{ backgroundColor: col.id }}
                  />
                ))}
              </div>
            </div>

            {/* Warstwa 2: Pysk i wnętrza uszu */}
            <div className="bg-[#0B0F17]/60 p-2 rounded-lg border border-[#24324A] space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span className="font-bold">Poziom 2: Pysk / Czoło</span>
                <span className="text-white">+{l2Depth}mm</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="1.6"
                step="0.2"
                value={l2Depth}
                onChange={(e) => setL2Depth(Number(e.target.value))}
                className="w-full h-1 bg-[#161F30] rounded appearance-none cursor-pointer accent-slate-300"
              />
              <div className="flex flex-wrap gap-1">
                {COLORS.map((col) => (
                  <button
                    key={`l2-${col.id}`}
                    type="button"
                    onClick={() => setL2Color(col.id)}
                    className={`w-5 h-5 rounded border transition ${l2Color === col.id ? "border-white scale-110" : "border-[#24324A]"}`}
                    style={{ backgroundColor: col.id }}
                  />
                ))}
              </div>
            </div>

            {/* Warstwa 3: Oczy i brwi */}
            <div className="bg-[#0B0F17]/60 p-2 rounded-lg border border-[#24324A] space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-[#00E5FF]">
                <span className="font-bold">Poziom 3: Oczy / Brwi</span>
                <span className="text-white">+{l3Depth}mm</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="1.2"
                step="0.2"
                value={l3Depth}
                onChange={(e) => setL3Depth(Number(e.target.value))}
                className="w-full h-1 bg-[#161F30] rounded appearance-none cursor-pointer accent-[#00E5FF]"
              />
              <div className="flex flex-wrap gap-1">
                {COLORS.map((col) => (
                  <button
                    key={`l3-${col.id}`}
                    type="button"
                    onClick={() => setL3Color(col.id)}
                    className={`w-5 h-5 rounded border transition ${l3Color === col.id ? "border-[#00E5FF] scale-110" : "border-[#24324A]"}`}
                    style={{ backgroundColor: col.id }}
                  />
                ))}
              </div>
            </div>

            {/* Warstwa 4: Czubek nosa, źrenice, pyszczek */}
            <div className="bg-[#0B0F17]/60 p-2 rounded-lg border border-[#24324A] space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-pink-400">
                <span className="font-bold">Poziom 4: Czubek nosa / Źrenice</span>
                <span className="text-white">+{l4Depth}mm</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="1.2"
                step="0.2"
                value={l4Depth}
                onChange={(e) => setL4Depth(Number(e.target.value))}
                className="w-full h-1 bg-[#161F30] rounded appearance-none cursor-pointer accent-pink-500"
              />
              <div className="flex flex-wrap gap-1">
                {COLORS.map((col) => (
                  <button
                    key={`l4-${col.id}`}
                    type="button"
                    onClick={() => setL4Color(col.id)}
                    className={`w-5 h-5 rounded border transition ${l4Color === col.id ? "border-pink-500 scale-110" : "border-[#24324A]"}`}
                    style={{ backgroundColor: col.id }}
                  />
                ))}
              </div>
            </div>

            {/* Koszyk */}
            <div className="pt-2 border-t border-[#24324A] space-y-2">
              <div className="flex items-baseline justify-between font-mono">
                <div>
                  <span className="text-[10px] text-[#94A3B8] block uppercase">Cena (4 Kolory AMS)</span>
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
                  <span className="font-mono text-white text-xs font-bold w-6 text-center">{quantity}</span>
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
                {addingToCart ? "Zapisuję..." : "Dodaj 4-kolorowy brelok do koszyka"}
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