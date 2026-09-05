import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { SVGLoader } from "three-stdlib";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";

// Przykładowy domyślny kształt gwiazdy/logo w SVG, gdy użytkownik jeszcze nic nie wgrał
const DEFAULT_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 15 L62 38 L87 42 L68 60 L73 85 L50 72 L27 85 L32 60 L13 42 L38 38 Z" fill="black" />
</svg>`;

// Komponent generujący trójwymiarowe wytłoczenie z wektorów SVG
function SvgExtrusion({ svgString, depth, color }) {
  const shapes = useMemo(() => {
    if (!svgString) return [];
    try {
      const loader = new SVGLoader();
      const svgData = loader.parse(svgString);
      return svgData.paths.flatMap((path) => path.toShapes(true));
    } catch (err) {
      console.error("Błąd parsowania SVG:", err);
      return [];
    }
  }, [svgString]);

  if (!shapes.length) return null;

  return (
    <Center position={[0, 0, 0]}>
      <group scale={[0.35, -0.35, 1]}> {/* Odwrócenie osi Y charakterystyczne dla SVG */}
        {shapes.map((shape, idx) => (
          <mesh key={idx}>
            <extrudeGeometry
              args={[
                shape,
                {
                  depth: depth,
                  bevelEnabled: true,
                  bevelThickness: 0.2,
                  bevelSize: 0.2,
                  bevelSegments: 2,
                },
              ]}
            />
            <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
          </mesh>
        ))}
      </group>
    </Center>
  );
}

// Baza breloka
function KeychainBase({ shapeType, baseColor, reliefSvg, reliefDepth, reliefColor }) {
  return (
    <group>
      {/* 1. Baza: Prostokątna zaokrąglona */}
      {shapeType === "rect" && (
        <group>
          <RoundedBox args={[65, 45, 4]} radius={4} smoothness={4} position={[0, 0, 0]}>
            <meshStandardMaterial color={baseColor} roughness={0.5} />
          </RoundedBox>
          {/* Ucho na kółko */}
          <mesh position={[-36, 0, 0]}>
            <torusGeometry args={[6, 2, 16, 32]} />
            <meshStandardMaterial color={baseColor} roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* 2. Baza: Okrągła */}
      {shapeType === "circle" && (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[26, 26, 4, 48]} />
            <meshStandardMaterial color={baseColor} roughness={0.5} />
          </mesh>
          {/* Ucho na kółko */}
          <mesh position={[0, 30, 0]}>
            <torusGeometry args={[6, 2, 16, 32]} />
            <meshStandardMaterial color={baseColor} roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* 3. Wytłoczone logo ze zdjęcia na powierzchni bazy (Z = +2.01mm) */}
      <group position={[0, 0, 2.01]}>
        <SvgExtrusion svgString={reliefSvg} depth={reliefDepth} color={reliefColor} />
      </group>
    </group>
  );
}

const COLORS = [
  { id: "#0B0F17", name: "Czerń Głęboka" },
  { id: "#FFFFFF", name: "Biel Czysta" },
  { id: "#00E5FF", name: "Cyjan / Neon" },
  { id: "#2563EB", name: "Kobaltowy Błękit" },
  { id: "#DC2626", name: "Czerwień Ostra" },
  { id: "#F59E0B", name: "Bursztyn / Złoty" },
  { id: "#10B981", name: "Szmaragdowa Zieleń" },
];

export default function KeychainGenerator() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [isGeneratorsOpen, setIsGeneratorsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const genMenuRef = useRef(null);
  const userMenuRef = useRef(null);

  // Konfiguracja Breloka
  const [shapeType, setShapeType] = useState("rect"); // rect | circle
  const [baseColor, setBaseColor] = useState("#0B0F17");
  const [reliefColor, setReliefColor] = useState("#00E5FF");
  const [reliefDepth, setReliefDepth] = useState(1.6); // wysokość wypukłości w mm
  const [uploadedSvg, setUploadedSvg] = useState(DEFAULT_SVG);
  const [imageFileName, setImageFileName] = useState("Domyślna Gwiazda");
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const fileInputRef = useRef(null);

  const unitPrice = 18.0;
  const totalPrice = (unitPrice * quantity).toFixed(2);

  // Konwersja wgranego pliku (JPG/PNG/SVG) na wektory
  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFileName(file.name);

    if (file.type === "image/svg+xml") {
      // Jeśli użytkownik wgrał bezpośrednio plik wektorowy SVG
      const reader = new FileReader();
      reader.onload = (ev) => setUploadedSvg(ev.target.result);
      reader.readAsText(file);
    } else {
      // Jeśli wgrał JPG / PNG -> binaryzujemy obraz na Canvas i generujemy kontur SVG
      setIsProcessingImg(true);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = 100;
          canvas.height = 100;

          // Rysujemy i skalujemy obrazek do kwadratu 100x100
          ctx.drawImage(img, 0, 0, 100, 100);
          const imgData = ctx.getImageData(0, 0, 100, 100);
          const data = imgData.data;

          // Progowanie (Black & White thresholding)
          let pathPoints = "";
          for (let y = 0; y < 100; y += 4) {
            for (let x = 0; x < 100; x += 4) {
              const i = (y * 100 + x) * 4;
              const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
              // Jeśli piksel jest ciemny (lub kryjący), traktujemy go jako element wypukły
              if (brightness < 128 && data[i + 3] > 50) {
                pathPoints += `M${x},${y} h3 v3 h-3 z `;
              }
            }
          }

          if (!pathPoints) {
            pathPoints = "M20,20 h60 v60 h-60 z"; // Fallback jeśli zdjęcie było całkiem białe
          }

          const generatedSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="${pathPoints}" fill="black" />
          </svg>`;

          setUploadedSvg(generatedSvg);
          setIsProcessingImg(false);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
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
        file_name: `Brelok z logo: [${imageFileName}]`,
        material: "PLA / PETG Multi-Color",
        technology: "FDM Dual-Color Relief",
        layer_height: "0.20 mm",
        infill: 100,
        clean_supports: false,
        brass_inserts: false,
        quantity: quantity,
        total_price: parseFloat(totalPrice),
        dimensions_mm: [shapeType === "rect" ? 65 : 52, 45, 4 + Number(reliefDepth)],
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
        <title>Generator Breloków ze Zdjęcia 3D — Drukstacja</title>
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

      {/* GŁÓWNY PANEL ROBOCZY */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEWA STRONA: INTERAKTYWNY VIEWPORT 3D (7 kolumn) */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative w-full h-[540px] rounded-2xl border border-[#24324A] bg-[#0E1524] overflow-hidden shadow-2xl">
            <div className="absolute top-4 left-4 z-10 font-mono text-xs text-[#94A3B8] bg-[#0B0F17]/80 px-3 py-1.5 rounded-lg border border-[#24324A] backdrop-blur-md">
              Podgląd 3D na żywo • Obracaj lewym przyciskiem myszy
            </div>

            <Canvas camera={{ position: [0, 45, 90], fov: 45 }}>
              <ambientLight intensity={0.7} />
              <directionalLight position={[20, 50, 30]} intensity={1.5} />
              <directionalLight position={[-20, 20, -20]} intensity={0.6} />
              <KeychainBase
                shapeType={shapeType}
                baseColor={baseColor}
                reliefSvg={uploadedSvg}
                reliefDepth={reliefDepth}
                reliefColor={reliefColor}
              />
              <OrbitControls makeDefault minDistance={30} maxDistance={180} />
            </Canvas>
          </div>
        </section>

        {/* PRAWA STRONA: FORMULARZ PARAMETRÓW RELIEFU (5 kolumn) */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#161F30] border border-[#24324A] rounded-2xl p-6 shadow-xl space-y-5">
            <div className="border-b border-[#24324A] pb-3">
              <h1 className="text-lg font-bold text-white tracking-wide">BRELOK ZE ZDJĘCIA / LOGO</h1>
              <p className="text-xs font-mono text-[#94A3B8] mt-1">
                Wektoryzacja 2D do płaskorzeźby 3D (FDM Dual-Color)
              </p>
            </div>

            {/* 1. Upload Grafiki */}
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-2 uppercase tracking-wider">
                1. Wgraj grafikę (PNG, JPG, SVG)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                className="hidden"
                onChange={handleImageUpload}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-[#24324A] hover:border-[#00E5FF] bg-[#0B0F17] rounded-xl p-3 flex items-center justify-between cursor-pointer transition"
              >
                <div className="flex items-center gap-2 text-xs">
                  <svg className="w-5 h-5 text-[#00E5FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="font-mono text-white truncate max-w-[200px]">
                    {isProcessingImg ? "Przetwarzam obraz..." : imageFileName}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded bg-[#161F30] text-[#00E5FF] border border-[#24324A] text-xs font-mono">
                  Wybierz
                </span>
              </div>
            </div>

            {/* 2. Kształt Bazy */}
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-2 uppercase tracking-wider">
                2. Kształt bazy breloka
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setShapeType("rect")}
                  className={`py-2 px-3 rounded-lg border font-bold transition ${
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
                  className={`py-2 px-3 rounded-lg border font-bold transition ${
                    shapeType === "circle"
                      ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white"
                      : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8]"
                  }`}
                >
                  Okrągły
                </button>
              </div>
            </div>

            {/* 3. Suwak Wysokości Wypukłości (Reliefu) */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-[#94A3B8] uppercase">Wysokość wypukłości</span>
                <span className="text-[#00E5FF] font-bold">{reliefDepth} mm</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="3.5"
                step="0.2"
                value={reliefDepth}
                onChange={(e) => setReliefDepth(Number(e.target.value))}
                className="w-full h-1.5 bg-[#0B0F17] rounded-lg appearance-none cursor-pointer accent-[#00E5FF]"
              />
            </div>

            {/* 4. Kolory: Baza & Wypukłość */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1 uppercase">Kolor bazy</label>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setBaseColor(col.id)}
                      className={`w-6 h-6 rounded-md border transition ${
                        baseColor === col.id ? "border-[#00E5FF] scale-110" : "border-[#24324A]"
                      }`}
                      style={{ backgroundColor: col.id }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1 uppercase">Kolor wypukłości</label>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setReliefColor(col.id)}
                      className={`w-6 h-6 rounded-md border transition ${
                        reliefColor === col.id ? "border-[#00E5FF] scale-110" : "border-[#24324A]"
                      }`}
                      style={{ backgroundColor: col.id }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Liczba sztuk */}
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1 uppercase tracking-wider">
                Liczba sztuk
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-8 h-8 bg-[#0B0F17] border border-[#24324A] hover:border-[#00E5FF] text-white font-mono rounded-lg transition"
                >
                  -
                </button>
                <span className="font-mono text-white text-sm font-bold w-8 text-center">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-8 h-8 bg-[#0B0F17] border border-[#24324A] hover:border-[#00E5FF] text-white font-mono rounded-lg transition"
                >
                  +
                </button>
              </div>
            </div>

            {/* Podsumowanie i Koszyk */}
            <div className="pt-4 border-t border-[#24324A] space-y-4">
              <div className="flex items-baseline justify-between font-mono">
                <div>
                  <span className="text-xs text-[#94A3B8] block uppercase">Cena całkowita brutto</span>
                  <span className="text-3xl font-bold text-[#00E5FF]">{totalPrice}</span>
                  <span className="text-xs text-[#94A3B8] ml-1">PLN</span>
                </div>
                <span className="text-xs text-emerald-400 font-mono">Druk FDM Multi-Color</span>
              </div>

              <button
                type="button"
                disabled={addingToCart}
                onClick={handleAddToCart}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00E5FF] to-[#2563EB] hover:opacity-95 text-[#0B0F17] font-bold text-sm uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(0,229,255,0.25)] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {addingToCart ? "Zapisuję..." : "Dodaj spersonalizowany brelok do koszyka"}
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