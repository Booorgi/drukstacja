import React, { useState, useEffect, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const StlViewer3D = dynamic(
  () =>
    Promise.all([
      import("@react-three/fiber"),
      import("@react-three/drei"),
      import("three-stdlib"),
    ]).then(([fiber, drei, stdlib]) => {
      const { Canvas } = fiber;
      const { OrbitControls, Center, Bounds } = drei;
      const { STLLoader } = stdlib;

      function StlModel({ url, color }) {
        const [geometry, setGeometry] = useState(null);
        const [error, setError] = useState(false);

        useEffect(() => {
          if (!url) return;
          setError(false);
          const loader = new STLLoader();

          loader.load(
            url,
            (geo) => {
              geo.computeVertexNormals();
              geo.center();
              setGeometry(geo);
            },
            undefined,
            (err) => {
              console.error("Błąd ładowania geometrii STL:", err);
              setError(true);
            }
          );
        }, [url]);

        if (error) {
          return null;
        }

        if (!geometry) return null;

        return (
          <Center top>
            <mesh geometry={geometry}>
              <meshStandardMaterial
                color={color}
                roughness={0.3}
                metalness={0.1}
              />
            </mesh>
          </Center>
        );
      }

      return function Viewer({ modelUrl, color }) {
        return (
          <Canvas camera={{ position: [0, 60, 120], fov: 45 }}>
            <ambientLight intensity={1.2} />
            <directionalLight position={[40, 80, 50]} intensity={1.8} />
            <directionalLight position={[-40, 40, -40]} intensity={0.6} />
            <Bounds fit clip observe margin={1.2}>
              <StlModel url={modelUrl} color={color} />
            </Bounds>
            <OrbitControls makeDefault minDistance={10} maxDistance={400} />
          </Canvas>
        );
      };
    }),
  { ssr: false }
);

const MATERIALS_LIST = [
  { id: "PLA", name: "PLA Tough", desc: "Precyzja & Detal", pricePerCm3: 0.45 },
  { id: "PETG", name: "PETG Carbon", desc: "Odporność UV & Temp", pricePerCm3: 0.55 },
  { id: "ABS", name: "ABS Industry", desc: "Trwałość & Sztywność", pricePerCm3: 0.60 },
];

export default function Home() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);

  const [selectedFile, setSelectedFile] = useState(null);
  const [modelPreviewUrl, setModelPreviewUrl] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  const [selectedMaterial, setSelectedMaterial] = useState("PLA");
  const [selectedColor, setSelectedColor] = useState("#EF4444");
  const [infill, setInfill] = useState(20);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const fileInputRef = useRef(null);

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

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsAnalyzing(true);
    setAnalysisData(null);

    const isDirectStl = file.name.toLowerCase().endsWith(".stl");
    if (isDirectStl) {
      setModelPreviewUrl(URL.createObjectURL(file));
    } else {
      setModelPreviewUrl(null);
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Błąd analizy modelu.");
      }

      const data = await res.json();
      setAnalysisData(data);

      if (data.preview_stl_url) {
        setModelPreviewUrl(data.preview_stl_url);
      }
    } catch (err) {
      alert("Błąd analizy pliku: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  }

  const volume = analysisData?.volume_cm3 || 32.5;
  const matConfig = MATERIALS_LIST.find((m) => m.id === selectedMaterial);
  const unitPrice = Math.max(15, volume * (matConfig?.pricePerCm3 || 0.45) * (1 + infill / 100)).toFixed(2);
  const totalPrice = (parseFloat(unitPrice) * quantity).toFixed(2);

  async function handleAddToCart() {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    setAddingToCart(true);
    try {
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        file_name: selectedFile?.name || "Model 3D STL",
        material: selectedMaterial,
        technology: "FDM Precision 0.4mm",
        layer_height: "0.20 mm",
        infill: infill,
        clean_supports: true,
        brass_inserts: false,
        quantity: quantity,
        total_price: parseFloat(totalPrice),
        dimensions_mm: analysisData?.dimensions_mm || [60, 60, 40],
        status: "in_cart",
      });

      if (error) throw error;
      await fetchCart(user.id);
      setIsCartOpen(true);
    } catch (err) {
      alert("Błąd koszyka: " + err.message);
    } finally {
      setAddingToCart(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F5F9] text-[#0F172A] font-sans">
      <Head>
        <title>Drukstacja — Profesjonalny Druk 3D i Konfiguratory</title>
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
          <Link href="/" className="text-[#EF4444] transition">
            Wyceniarka STL
          </Link>
          <Link href="/breloki" className="hover:text-black transition">
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

      {/* HERO & KONFIGURATOR CARD */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 pb-12 flex items-center justify-center">
        <div className="bg-white rounded-[32px] border border-slate-200/80 shadow-[0_25px_70px_rgba(0,0,0,0.06)] w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[640px]">
          
          {/* LEWA STRONA: 3D STUDIO STAGE */}
          <div className="lg:col-span-7 bg-gradient-to-b from-[#F8FAFC] to-[#EDF2F7] relative flex flex-col justify-between p-6 md:p-8">
            <div className="flex items-center justify-between z-10">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#EF4444] block">
                  Studio Wyceny CAD/STL
                </span>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {selectedFile ? selectedFile.name : "Wgraj model 3D do wyceny"}
                </h1>
              </div>
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm text-slate-600">
                Podgląd interaktywny
              </span>
            </div>

            {/* Viewport 3D */}
            <div className="relative w-full h-[380px] md:h-[430px] my-auto flex items-center justify-center">
              {isAnalyzing ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-[#EF4444] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-slate-700">
                    Konwertuję geometrię STEP i slicuję model...
                  </span>
                </div>
              ) : modelPreviewUrl ? (
                <StlViewer3D modelUrl={modelPreviewUrl} color={selectedColor} />
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-full max-h-[320px] rounded-3xl border-2 border-dashed border-slate-300 hover:border-[#EF4444] bg-white/60 flex flex-col items-center justify-center gap-3 cursor-pointer transition"
                >
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#EF4444] flex items-center justify-center font-bold text-xl">
                    ↑
                  </div>
                  <div className="text-center">
                    <span className="font-bold text-slate-800 text-sm block">
                      Kliknij lub przeciągnij plik STL / STEP / OBJ
                    </span>
                    <span className="text-xs text-slate-400">
                      Maksymalny rozmiar: 100 MB
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Dolny pasek ceny */}
            <div className="flex items-end justify-between z-10 pt-4 border-t border-slate-200/70">
              <div>
                <span className="text-[11px] font-bold uppercase text-slate-400 block tracking-wider">
                  Cena zamówienia
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
                  disabled={addingToCart || isAnalyzing}
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
            <div className="space-y-6">
              <input
                ref={fileInputRef}
                type="file"
                accept=".stl,.step,.stp,.obj"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Upload pliku */}
              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block mb-2 tracking-wider">
                  Plik CAD:
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-xs font-bold text-slate-800 transition"
                >
                  <span className="truncate max-w-[220px]">
                    {selectedFile ? selectedFile.name : "Wybierz plik z dysku"}
                  </span>
                  <span className="text-[#EF4444]">
                    {isAnalyzing ? "Analizuję..." : "Zmień plik"}
                  </span>
                </button>
              </div>

              {/* Kolor filamentu */}
              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block mb-2 tracking-wider">
                  Kolor filamentu:
                </span>
                <div className="flex items-center gap-2.5">
                  {["#0B0F17", "#EF4444", "#2563EB", "#10B981", "#F59E0B", "#94A3B8", "#FFFFFF"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`w-6 h-6 rounded-full transition-all cursor-pointer ${
                        selectedColor === c
                          ? "ring-2 ring-offset-2 ring-[#EF4444] scale-110"
                          : "hover:scale-105 border border-slate-300"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Materiał */}
              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block mb-3 tracking-wider">
                  Materiał:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {MATERIALS_LIST.map((mat) => (
                    <div
                      key={mat.id}
                      onClick={() => setSelectedMaterial(mat.id)}
                      className={`p-3 rounded-2xl border flex flex-col items-center justify-center text-center cursor-pointer transition ${
                        selectedMaterial === mat.id
                          ? "border-[#EF4444] bg-red-50/50 text-[#EF4444] font-bold shadow-sm"
                          : "border-slate-200 hover:border-slate-300 text-slate-700"
                      }`}
                    >
                      <span className="text-xs font-bold block">{mat.id}</span>
                      <span className="text-[10px] text-slate-400">{mat.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Infill */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Wypełnienie wnętrza (Infill)</span>
                  <span className="text-[#EF4444]">{infill}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={infill}
                  onChange={(e) => setInfill(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-semibold pt-1">
                  <span>10% (Lekki)</span>
                  <span>40% (Standard)</span>
                  <span>100% (Lity)</span>
                </div>
              </div>
            </div>

            {/* Wymiary modelu */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-400">
              <span>
                {analysisData?.dimensions_mm
                  ? `Wymiary: ${analysisData.dimensions_mm[0]}×${analysisData.dimensions_mm[1]}×${analysisData.dimensions_mm[2]} mm`
                  : "Pole robocze: 256×256×256 mm"}
              </span>
              <span>Dokładność: ±0.1 mm</span>
            </div>
          </div>
        </div>
      </main>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLoginSuccess={(u) => setUser(u)} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} items={cartItems} onRemoveItem={() => fetchCart(user?.id)} />
    </div>
  );
}