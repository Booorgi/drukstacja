import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";

const ModelViewer = dynamic(() => import("../components/ModelViewer"), { ssr: false });
const API_URL = process.env.NEXT_PUBLIC_API_URL;

const MATERIALS = [
  { id: "PLA", name: "PLA Standard (Sztywny, ekologiczny)", mult: 1.0 },
  { id: "PETG", name: "PETG (Odporny chemicznie / UV)", mult: 1.2 },
  { id: "ABS", name: "ABS / ASA (Wytrzymały termicznie)", mult: 1.5 },
  { id: "TPU", name: "TPU 95A (Guma / Elastyczny)", mult: 2.1 },
];

const LAYERS = [
  { val: "0.28 mm", label: "0.28 mm (Draft)" },
  { val: "0.20 mm", label: "0.20 mm (Standard)" },
  { val: "0.12 mm", label: "0.12 mm (Precyzja)" },
];

export default function Home() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [quote, setQuote] = useState(null);
  const [technology, setTechnology] = useState("FDM");
  const [material, setMaterial] = useState("PLA");
  const [layerHeight, setLayerHeight] = useState("0.20 mm");
  const [infill, setInfill] = useState(20);
  const [cleanSupports, setCleanSupports] = useState(true);
  const [brassInserts, setBrassInserts] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [showSupports, setShowSupports] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFileSelected(selectedFile) {
    if (!selectedFile) return;
    setFile(selectedFile);
    setAnalysis(null);
    setQuote(null);
    setError(null);
    setShowSupports(false);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Błąd analizy pliku");
      }

      const data = await res.json();
      setAnalysis(data);
      await fetchQuote(data, { material, infill, quantity });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchQuote(analysisData, overrides = {}) {
    const body = {
      volume_cm3: analysisData.volume_cm3,
      bbox_mm: analysisData.bbox_mm,
      material: overrides.material ?? material,
      quantity: overrides.quantity ?? quantity,
      infill_percent: overrides.infill ?? infill,
    };

    try {
      const res = await fetch(`${API_URL}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setQuote(await res.json());
      }
    } catch (e) {
      console.error("Błąd pobierania wyceny:", e);
    }
  }

  function handleOptionChange(newMat, newInfill, newQty) {
    setMaterial(newMat);
    setInfill(newInfill);
    setQuantity(newQty);
    if (analysis) {
      fetchQuote(analysis, { material: newMat, infill: newInfill, quantity: newQty });
    }
  }

  // Szacowanie wagi i czasu na podstawie geometrii lub wartości domyślnych
  const volume = analysis?.volume_cm3 ?? 35;
  const estimatedWeight = Math.round(volume * 1.24 * (0.5 + (infill / 100) * 0.7));
  const estimatedHours = Math.max(1, Math.round((estimatedWeight * 4.2) / 60));
  const estimatedMins = Math.round((estimatedWeight * 4.2) % 60);

  // Kalkulacja ceny końcowej (API lub fallback)
  const basePrice = quote?.total_price_pln ? parseFloat(quote.total_price_pln) : 38.5;
  const insertCost = brassInserts ? 15.0 : 0.0;
  const finalPrice = ((basePrice + insertCost) * quantity).toFixed(2);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-[#F8FAFC] overflow-x-hidden font-sans">
      <Head>
        <title>Drukstacja — Wyceniarka & Druk 3D na Żądanie</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet" />
      </Head>

      {/* NAVBAR */}
      <header className="border-b border-[#24324A] bg-[#0B0F17]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-[#94A3B8]">
            <span className="text-white hover:text-[#00E5FF] cursor-pointer transition">Wyceniarka STL</span>
            <span className="hover:text-[#00E5FF] cursor-pointer transition">Generator Breloków</span>
            <span className="hover:text-[#00E5FF] cursor-pointer transition">Litofany</span>
            <span className="hover:text-[#00E5FF] cursor-pointer transition">Części użytkowe</span>
          </nav>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Farm Status: 12/16 Wolne
            </span>
          </div>
        </div>
      </header>

      {/* GŁÓWNY PANEL KONFIGURATORA (60/40) */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEWA STRONA: VIEWPORT 3D (7 kolumn) */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative w-full h-[520px] rounded-2xl border border-[#24324A] bg-[#0E1524] overflow-hidden shadow-2xl">
            
            {/* Pasek narzędziowy viewportu */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSupports(!showSupports)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border backdrop-blur-md transition ${
                  showSupports
                    ? "bg-red-500/20 border-red-500 text-red-400"
                    : "bg-[#161F30]/90 text-[#94A3B8] border-[#24324A] hover:text-[#00E5FF] hover:border-[#00E5FF]"
                }`}
              >
                Zwisy / Podpory: {showSupports ? "ON" : "OFF"}
              </button>
            </div>

            {/* Badges z wymiarami geometrii */}
            <div className="absolute bottom-4 left-4 z-10 flex gap-2 font-mono text-xs">
              <span className="px-2.5 py-1 rounded bg-[#0B0F17]/80 border border-[#24324A] text-[#94A3B8]">
                X: {analysis?.bbox_mm?.[0] ?? "62"} mm
              </span>
              <span className="px-2.5 py-1 rounded bg-[#0B0F17]/80 border border-[#24324A] text-[#94A3B8]">
                Y: {analysis?.bbox_mm?.[1] ?? "62"} mm
              </span>
              <span className="px-2.5 py-1 rounded bg-[#0B0F17]/80 border border-[#24324A] text-[#94A3B8]">
                Z: {analysis?.bbox_mm?.[2] ?? "48"} mm
              </span>
            </div>

            {/* Status bryły */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-md">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              {analysis ? (analysis.watertight === false ? "Bryła nieszczelna" : "Bryła zamknięta (Manifold)") : "Wzorzec testowy"}
            </div>

            {/* Three.js Viewer */}
            <div className="w-full h-full">
              {file ? (
                <ModelViewer
                  file={file}
                  previewUrl={analysis?.preview_stl_url}
                  color="#00E5FF"
                  showOverhangs={showSupports}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 bg-[radial-gradient(#24324A_1px,transparent_1px)] [background-size:24px_24px]">
                  <div className="w-16 h-16 rounded-2xl bg-[#161F30] border border-[#24324A] text-[#00E5FF] flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(0,229,255,0.15)]">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeWidth="1.5" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">Stół roboczy gotowy do załadunku</p>
                  <p className="text-xs font-mono text-[#94A3B8]">Wgraj model poniżej, aby uruchomić podgląd 3D i wycenę</p>
                </div>
              )}
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.[0]) handleFileSelected(e.dataTransfer.files[0]);
            }}
            className={`border border-dashed transition rounded-xl p-4 flex items-center justify-between text-xs cursor-pointer ${
              dragOver
                ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white"
                : "border-[#24324A] hover:border-[#00E5FF] bg-[#161F30]/40 text-[#94A3B8]"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".stl,.step,.stp,.obj"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
            />
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-[#00E5FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span>
                {file ? <strong>Wybrano: {file.name}</strong> : <>Upuść plik <strong>.STL</strong>, <strong>.STEP</strong> lub <strong>.OBJ</strong> (maks. 100MB)</>}
              </span>
            </div>
            <button
              type="button"
              className="px-3 py-1.5 bg-[#161F30] border border-[#24324A] rounded-lg text-white hover:border-[#00E5FF] transition"
            >
              {loading ? "Analizuję..." : "Wybierz plik"}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs font-mono">
              {error}
            </div>
          )}
        </section>

        {/* PRAWA STRONA: FORMULARZ KONFIGURACJI & WYCENA (5 kolumn) */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#161F30] border border-[#24324A] rounded-2xl p-6 flex flex-col justify-between shadow-xl">
            
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-[#24324A] pb-3">
                <h2 className="text-lg font-bold text-white tracking-wide">PARAMETRY DRUKU</h2>
                <span className="text-xs font-mono text-[#00E5FF]">ID: #DS-{file ? "READY" : "DEMO"}</span>
              </div>

              {/* 1. Technologia */}
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-2 uppercase tracking-wider">Technologia</label>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setTechnology("FDM")}
                    className={`py-2.5 px-3 rounded-lg border font-bold flex items-center justify-center gap-2 transition ${
                      technology === "FDM"
                        ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white"
                        : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8] hover:border-[#94A3B8]"
                    }`}
                  >
                    FDM (Termoplast)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTechnology("SLA")}
                    className={`py-2.5 px-3 rounded-lg border font-bold flex items-center justify-center gap-2 transition ${
                      technology === "SLA"
                        ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white"
                        : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8] hover:border-[#94A3B8]"
                    }`}
                  >
                    SLA (Żywica precyzyjna)
                  </button>
                </div>
              </div>

              {/* 2. Materiał */}
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-2 uppercase tracking-wider">Materiał</label>
                <select
                  value={material}
                  onChange={(e) => handleOptionChange(e.target.value, infill, quantity)}
                  className="w-full bg-[#0B0F17] border border-[#24324A] rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-[#00E5FF] transition"
                >
                  {MATERIALS.map((mat) => (
                    <option key={mat.id} value={mat.id}>
                      {mat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Wysokość warstwy */}
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-[#94A3B8] uppercase tracking-wider">Wysokość warstwy</span>
                  <span className="font-mono text-[#00E5FF]">{layerHeight}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  {LAYERS.map((layer) => (
                    <button
                      key={layer.val}
                      type="button"
                      onClick={() => setLayerHeight(layer.val)}
                      className={`py-2 border rounded-lg transition ${
                        layerHeight === layer.val
                          ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white font-bold"
                          : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8] hover:border-[#94A3B8]"
                      }`}
                    >
                      {layer.val}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Wypełnienie (Infill) */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#94A3B8] uppercase tracking-wider">Gęstość wypełnienia (Infill)</span>
                  <span className="font-mono text-white">{infill}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={infill}
                  step="5"
                  onChange={(e) => handleOptionChange(material, parseInt(e.target.value), quantity)}
                  className="w-full h-1.5 bg-[#0B0F17] rounded-lg appearance-none cursor-pointer accent-[#00E5FF]"
                />
                <div className="flex justify-between text-[10px] text-[#94A3B8] font-mono mt-1">
                  <span>Lekkie (10%)</span>
                  <span>Standard (20%)</span>
                  <span>Mechaniczne (50%+)</span>
                </div>
              </div>

              {/* Ilość sztuk */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#94A3B8] uppercase tracking-wider">Liczba sztuk</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleOptionChange(material, infill, Math.max(1, quantity - 1))}
                    className="w-9 h-9 rounded-lg bg-[#0B0F17] border border-[#24324A] hover:border-[#00E5FF] text-white font-mono text-base flex items-center justify-center transition"
                  >
                    -
                  </button>
                  <span className="font-mono text-white text-base font-bold w-10 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => handleOptionChange(material, infill, quantity + 1)}
                    className="w-9 h-9 rounded-lg bg-[#0B0F17] border border-[#24324A] hover:border-[#00E5FF] text-white font-mono text-base flex items-center justify-center transition"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 5. Opcje dodatkowe */}
              <div className="pt-2 border-t border-[#24324A] space-y-2">
                <label className="flex items-center gap-3 text-xs text-[#94A3B8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleanSupports}
                    onChange={(e) => setCleanSupports(e.target.checked)}
                    className="w-4 h-4 rounded bg-[#0B0F17] border-[#24324A] accent-[#00E5FF]"
                  />
                  <span>Oczyszczenie z podpór roboczych</span>
                </label>
                <label className="flex items-center gap-3 text-xs text-[#94A3B8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={brassInserts}
                    onChange={(e) => setBrassInserts(e.target.checked)}
                    className="w-4 h-4 rounded bg-[#0B0F17] border-[#24324A] accent-[#00E5FF]"
                  />
                  <span>Wprasowanie gwintów mosiężnych (+15 zł)</span>
                </label>
              </div>
            </div>

            {/* PODSUMOWANIE CENY & CTA */}
            <div className="mt-6 pt-4 border-t border-[#24324A] bg-[#0B0F17]/50 -mx-6 -mb-6 p-6 rounded-b-2xl">
              <div className="grid grid-cols-2 gap-4 mb-4 text-xs font-mono">
                <div>
                  <span className="text-[#94A3B8] block">Czas druku:</span>
                  <span className="text-white font-bold text-sm">~ {estimatedHours}h {estimatedMins}m</span>
                </div>
                <div>
                  <span className="text-[#94A3B8] block">Masa elementu:</span>
                  <span className="text-white font-bold text-sm">~ {estimatedWeight} g</span>
                </div>
              </div>

              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <span className="text-xs text-[#94A3B8] block uppercase">Cena całkowita brutto</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-3xl font-bold text-[#00E5FF]">{finalPrice}</span>
                    <span className="font-mono text-sm text-[#94A3B8]">PLN</span>
                  </div>
                </div>
                <span className="text-xs text-emerald-400 font-mono">Dostawa: 2-3 dni</span>
              </div>

              <button
                type="button"
                onClick={() => alert(`Zamówienie przyjęte na kwotę: ${finalPrice} PLN`)}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00E5FF] to-[#2563EB] hover:opacity-95 text-[#0B0F17] font-bold text-sm uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(0,229,255,0.25)] transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                Dodaj wydruk do koszyka
              </button>
            </div>

          </div>
        </section>

      </main>
    </div>
  );
}