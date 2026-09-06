import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import { STL_MATERIAL_GROUPS, STL_MATERIALS } from "../lib/filament";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const StlViewer3D = dynamic(
  () =>
    Promise.all([
      import("@react-three/fiber"),
      import("@react-three/drei"),
      import("three-stdlib"),
      import("three"),
    ]).then(([fiber, drei, stdlib, THREE]) => {
      const { Canvas } = fiber;
      const { OrbitControls, Center, Bounds, GizmoHelper, GizmoViewcube } = drei;
      const { STLLoader } = stdlib;

      function StlModelWithSupports({ url, color, showSupports, materialConfig }) {
        const [geometry, setGeometry] = useState(null);

        useEffect(() => {
          if (!url) return;
          const loader = new STLLoader();
          loader.load(
            url,
            (geo) => {
              geo.computeVertexNormals();

              // -------------------------------------------------------------
              // AUTO-ORIENTATION / LAY ON FLATTEST FACE (JAK W SLICERZE)
              // -------------------------------------------------------------
              const pos = geo.attributes.position;
              if (pos && pos.count > 0) {
                // 1. Zbieramy wektory normalne wszystkich ścianek i ich powierzchnie
                const faceData = [];
                const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
                const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();

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

                // 2. Klastrujemy ścianki o podobnych wektorach normalnych (tolerancja kątowa ~8 st.)
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

                // 3. Wybieramy płaszczyznę o największym polu powierzchni (najstabilniejsza baza)
                if (clusters.length > 0) {
                  clusters.sort((a, b) => b.totalArea - a.totalArea);
                  const bestNormal = clusters[0].normal;

                  // Chcemy, aby wektor normalny tej największej bazy celował w dół stołu (0, -1, 0)
                  const targetDown = new THREE.Vector3(0, -1, 0);
                  const q = new THREE.Quaternion().setFromUnitVectors(bestNormal, targetDown);
                  geo.applyQuaternion(q);
                }
              }

              // 4. Centrujemy model w osiach X i Z
              geo.computeBoundingBox();
              const box = geo.boundingBox;
              const centerX = (box.min.x + box.max.x) / 2;
              const centerZ = (box.min.z + box.max.z) / 2;
              const minY = box.min.y;

              // Ustawiamy podstawę idealnie na wysokości stołu (Y = 0)
              geo.translate(-centerX, -minY, -centerZ);
              geo.computeVertexNormals();

              setGeometry(geo);
            },
            undefined,
            (err) => console.error("Błąd ładowania STL:", err)
          );
        }, [url]);

        // Wyliczanie powierzchni podpór (Nawisy > 45 st.)
        const supportMeshGeometry = useMemo(() => {
          if (!geometry || !showSupports) return null;

          const pos = geometry.attributes.position;
          if (!pos) return null;

          const supportTriangles = [];
          const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
          const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();

          for (let i = 0; i < pos.count; i += 3) {
            pA.fromBufferAttribute(pos, i);
            pB.fromBufferAttribute(pos, i + 1);
            pC.fromBufferAttribute(pos, i + 2);

            ab.subVectors(pB, pA);
            ac.subVectors(pC, pA);
            fn.crossVectors(ab, ac).normalize();

            // Pomiń trójkąty, które przylegają bezpośrednio do stołu (y bliskie 0)
            const isBedLayer = pA.y < 0.15 && pB.y < 0.15 && pC.y < 0.15;

            // Zwis większy niż 45° (składowa Y normalnej < -0.707)
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

        if (!geometry) return null;

        return (
          <group>
            {/* Główny model CAD spoczywający na stole */}
            <mesh geometry={geometry} castShadow receiveShadow>
              <meshStandardMaterial
                color={color}
                roughness={
                  materialConfig?.group === "composite" || materialConfig?.id === "PLA_MATTE"
                    ? 0.85
                    : materialConfig?.group === "flex"
                    ? 0.6
                    : 0.35
                }
                metalness={materialConfig?.group === "composite" ? 0.15 : 0.08}
              />
            </mesh>

            {/* Czerwone podświetlenie nawisów / podpór */}
            {supportMeshGeometry && (
              <mesh geometry={supportMeshGeometry}>
                <meshBasicMaterial
                  color="#EF4444"
                  side={THREE.DoubleSide}
                  transparent
                  opacity={0.85}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        );
      }

      return function Viewer({ modelUrl, color, showSupports, materialConfig }) {
        return (
          <Canvas camera={{ position: [90, 110, 140], fov: 45 }}>
            <ambientLight intensity={1.1} />
            <directionalLight position={[40, 80, 50]} intensity={1.6} />
            <directionalLight position={[-40, 40, -40]} intensity={0.5} />

            <Bounds fit clip observe margin={1.2}>
              <StlModelWithSupports
                url={modelUrl}
                color={color}
                showSupports={showSupports}
                materialConfig={materialConfig}
              />
            </Bounds>

            {/* Siatka stołu roboczego 256x256 mm (Bambu Lab standard) */}
            <gridHelper
              args={[256, 25.6, "#94A3B8", "#E2E8F0"]}
              position={[0, 0, 0]}
            />

            {/* Kostka orientacji widoku (Gizmo Cube) */}
            <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
              <GizmoViewcube
                color="#FFFFFF"
                strokeColor="#CBD5E1"
                textColor="#0F172A"
                opacity={0.9}
              />
            </GizmoHelper>

            <OrbitControls makeDefault minDistance={10} maxDistance={450} />
          </Canvas>
        );
      };
    }),
  { ssr: false }
);

export default function Home() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [modelPreviewUrl, setModelPreviewUrl] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  // Inżynieryjny dobór materiału i koloru
  const [selectedMaterialGroup, setSelectedMaterialGroup] = useState("all");
  const [selectedMaterial, setSelectedMaterial] = useState(STL_MATERIALS[0].id);
  const [selectedColor, setSelectedColor] = useState(STL_MATERIALS[0].colors[0].hex);

  const filteredMaterials = useMemo(() => {
    if (selectedMaterialGroup === "all") return STL_MATERIALS;
    return STL_MATERIALS.filter((m) => m.group === selectedMaterialGroup);
  }, [selectedMaterialGroup]);

  function handleSelectMaterial(matId) {
    setSelectedMaterial(matId);
    const targetMat = STL_MATERIALS.find((m) => m.id === matId);
    if (targetMat && targetMat.colors && targetMat.colors.length > 0) {
      const hasColor = targetMat.colors.some((c) => c.hex === selectedColor);
      if (!hasColor) {
        setSelectedColor(targetMat.colors[0].hex);
      }
    }
  }

  const [infill, setInfill] = useState(20);
  const [showSupports, setShowSupports] = useState(true);
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

    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("mousedown", handleClickOutside);
    };
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
  const matConfig = STL_MATERIALS.find((m) => m.id === selectedMaterial) || STL_MATERIALS[0];
  const activeColorObj = matConfig?.colors?.find((c) => c.hex === selectedColor) || matConfig?.colors?.[0];
  const unitPrice = Math.max(15, volume * (matConfig?.pricePerCm3 || 0.38) * (1 + infill / 100)).toFixed(2);
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
        material: `${matConfig.name} (${activeColorObj?.name || selectedColor})`,
        technology:
          matConfig.group === "composite"
            ? "FDM Hardened Steel 0.4mm (Carbon)"
            : matConfig.group === "flex"
            ? "FDM Direct Drive 0.4mm (Flex TPU)"
            : "FDM Precision 0.4mm",
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

          {/* PANEL KLIENTA Z ROZWIJANYM MENU */}
          {user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-800 hover:border-slate-400 transition"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{user.email.split("@")[0]}</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${isUserMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Zalogowano</span>
                    <span className="text-xs font-bold text-slate-800 truncate block">{user.email}</span>
                  </div>
                  <Link
                    href="/orders"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="block px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Moje zlecenia
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      supabase.auth.signOut();
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 transition"
                  >
                    Wyloguj
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="text-xs font-bold px-5 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition"
            >
              Zaloguj
            </button>
          )}
        </div>
      </header>

      {/* GŁÓWNA KARTA */}
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

              {/* Przełącznik podświetlania podpór */}
              {modelPreviewUrl && (
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm text-xs font-bold">
                  <span className="text-slate-600">Podpory:</span>
                  <button
                    type="button"
                    onClick={() => setShowSupports(!showSupports)}
                    className={`px-2 py-0.5 rounded-full text-[10px] transition ${
                      showSupports ? "bg-red-100 text-[#EF4444]" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {showSupports ? "Włączone" : "Wyłączone"}
                  </button>
                </div>
              )}
            </div>

            {/* Viewport 3D */}
            <div className="relative w-full h-[380px] md:h-[430px] my-auto flex items-center justify-center">
              {isAnalyzing ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-[#EF4444] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-slate-700">
                    Konwertuję geometrię STEP i generuję podgląd...
                  </span>
                </div>
              ) : modelPreviewUrl ? (
                <StlViewer3D
                  modelUrl={modelPreviewUrl}
                  color={selectedColor}
                  showSupports={showSupports}
                  materialConfig={matConfig}
                />
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

              {/* SEKCJA MATERIAŁU I KOLORU (NOWOCZESNA WYCENIARKA INŻYNIERYJNA) */}
              <div className="space-y-3.5">
                {/* 1. Nagłówek i Taby Kategorii */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                      Wybierz Materiał Drukarki:
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {filteredMaterials.length} do wyboru
                    </span>
                  </div>

                  {/* Taby kategorii */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    {STL_MATERIAL_GROUPS.map((grp) => {
                      const isActive = selectedMaterialGroup === grp.id;
                      return (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={() => setSelectedMaterialGroup(grp.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                            isActive
                              ? "bg-slate-900 text-white shadow-sm ring-1 ring-slate-900"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200/60"
                          }`}
                        >
                          {grp.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Karty materiałów — przewijana lista z parametrami technicznymi */}
                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                  {filteredMaterials.map((mat) => {
                    const isSelected = selectedMaterial === mat.id;
                    return (
                      <div
                        key={mat.id}
                        onClick={() => handleSelectMaterial(mat.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? "border-[#EF4444] bg-red-50/40 ring-2 ring-[#EF4444]/20 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        {/* Wiersz tytułowy + Badge + Cena */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold ${isSelected ? "text-[#EF4444]" : "text-slate-900"}`}>
                                {mat.name}
                              </span>
                              {mat.badge && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  {mat.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                              {mat.desc}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-xs font-black text-slate-900 block">
                              {mat.pricePerCm3.toFixed(2)} zł
                            </span>
                            <span className="text-[9px] text-slate-400 uppercase font-semibold">
                              / cm³
                            </span>
                          </div>
                        </div>

                        {/* Właściwości techniczne */}
                        <div className="flex items-center flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                          <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                            🌡️ HDT: <strong className="text-slate-700">{mat.hdt}</strong>
                          </span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                            ⚡ <strong className="text-slate-700">{mat.tensileStrength}</strong>
                          </span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                            🛡️ UV: <strong className="text-slate-700">{mat.uvResistance}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 3. Dedykowany wybór kolorów dla wybranego materiału */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>Kolor dla: {matConfig?.name}</span>
                    <span className="text-slate-900 font-extrabold flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-slate-300 inline-block flex-shrink-0"
                        style={{ backgroundColor: selectedColor }}
                      />
                      <span className="truncate max-w-[140px]">{activeColorObj?.name || "Wybrany"}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin min-h-[36px]">
                    {matConfig?.colors?.map((c) => {
                      const isSelected = selectedColor === c.hex;
                      return (
                        <button
                          key={c.id || c.hex}
                          type="button"
                          onClick={() => setSelectedColor(c.hex)}
                          title={c.name}
                          className={`w-7 h-7 rounded-full transition-all cursor-pointer flex-shrink-0 ${
                            isSelected
                              ? "ring-2 ring-offset-2 ring-[#EF4444] scale-110 shadow-md"
                              : "hover:scale-105 border border-slate-300"
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                      );
                    })}
                  </div>
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
                  : "Stół: 256×256×256 mm"}
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