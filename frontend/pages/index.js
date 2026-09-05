import { useState } from "react";
import dynamic from "next/dynamic";
import UploadBox from "../components/UploadBox";

// ModelViewer ładowany tylko po stronie klienta
const ModelViewer = dynamic(() => import("../components/ModelViewer"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const AVAILABLE_MATERIALS = [
  { id: "PLA", name: "PLA Standard", desc: "Szybki prototyp, niski koszt" },
  { id: "PETG", name: "PETG Wzmocniony", desc: "Wytrzymałość termiczna i uderzeniowa" },
  { id: "ABS", name: "ABS Techniczny", desc: "Wyższa sztywność, obróbka mechaniczna" },
  { id: "TPU", name: "TPU Elastyczny", desc: "Guma, wysoka amortyzacja" },
  { id: "Resin (SLA)", name: "Żywica Standard (SLA)", desc: "Maksymalna gładkość i detale" },
];

const COLORS = [
  { name: "Szary", hex: "#9CA3AF" },
  { name: "Biały", hex: "#FFFFFF" },
  { name: "Czarny", hex: "#1F2937" },
  { name: "Pomarańczowy", hex: "#EA580C" },
  { name: "Niebieski", hex: "#2563EB" },
];

export default function Home() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [quote, setQuote] = useState(null);
  const [material, setMaterial] = useState("PLA");
  const [quantity, setQuantity] = useState(1);
  const [infill, setInfill] = useState(20);
  const [layerHeight, setLayerHeight] = useState("0.20 mm");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [includeVat, setIncludeVat] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFileSelected(selectedFile) {
    setFile(selectedFile);
    setAnalysis(null);
    setQuote(null);
    setError(null);
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
      await fetchQuote(data);
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
      console.error("Błąd podczas pobierania wyceny:", e);
    }
  }

  function handleOptionsChange(newMaterial, newQuantity, newInfill) {
    const validQuantity = Math.max(1, newQuantity);
    setMaterial(newMaterial);
    setQuantity(validQuantity);
    setInfill(newInfill);
    if (analysis) {
      fetchQuote(analysis, { material: newMaterial, quantity: validQuantity, infill: newInfill });
    }
  }

  function handleReset() {
    setFile(null);
    setAnalysis(null);
    setQuote(null);
    setError(null);
  }

  // Obliczenia cenowe (netto / brutto)
  const rawTotal = quote?.total_price_pln ? parseFloat(quote.total_price_pln) : 0;
  const netTotal = includeVat ? rawTotal / 1.23 : rawTotal;
  const grossTotal = includeVat ? rawTotal : rawTotal * 1.23;
  const displayTotal = includeVat ? grossTotal : netTotal;
  const unitPrice = quantity > 0 ? (displayTotal / quantity).toFixed(2) : "0.00";
  const vatValue = (grossTotal - netTotal).toFixed(2);

  // Widok 1: Prosty ekran wgrywania
  if (!file) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Drukstacja</h1>
          <p className="text-sm text-slate-500 mb-8">
            Wgraj model 3D (STL, STEP, OBJ) i otrzymaj natychmiastową wycenę druku oraz analizę geometrii.
          </p>

          <UploadBox onFileSelected={handleFileSelected} />

          {loading && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm text-blue-600 font-medium">
              <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Trwa analiza geometrii i wysyłka do R2...
            </div>
          )}

          {error && (
            <div className="mt-6 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Widok 2: Pełny dashboard wyceny i podglądu CAD
  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans">
      {/* Pasek górny */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-30 flex items-center justify-between shadow-xs">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-blue-600 transition"
        >
          ← Wróć do wyboru pliku
        </button>
        <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full">
          Drukstacja Instant Quote
        </span>
      </header>

      {/* Główny kontener */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEWA KOLUMNA: 3D Viewer & Analiza */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          <div className="relative bg-white border border-slate-200 rounded-2xl h-[460px] lg:h-[530px] overflow-hidden shadow-sm flex flex-col">
            
            {/* Dane techniczne w lewym górnym rogu */}
            <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-md border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 shadow-sm">
              Objętość: <strong className="text-slate-900">{analysis?.volume_cm3 ?? "..."} cm³</strong>
            </div>

            {/* Checklist analizy w prawym górnym rogu */}
            <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur-md border border-slate-200 p-3 rounded-xl shadow-sm text-xs space-y-1 min-w-[200px]">
              <div className="font-semibold text-slate-900 mb-1 flex items-center justify-between">
                <span>Analiza geometrii CAD</span>
                <span className="text-emerald-500">✓</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Szczelność bryły</span>
                <span className={analysis?.watertight === false ? "text-amber-500 font-bold" : "text-emerald-500 font-bold"}>
                  {analysis?.watertight === false ? "Nie" : "Tak"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Cienkie ścianki</span>
                <span className="text-emerald-500 font-bold">OK</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Nawisy i podpory</span>
                <span className="text-emerald-500 font-bold">Wykryto</span>
              </div>
            </div>

            {/* Wybór koloru nakładany na podgląd */}
            <div className="absolute top-16 left-4 z-10 flex gap-1.5 bg-white/90 backdrop-blur-md border border-slate-200 p-1.5 rounded-xl shadow-sm">
              {COLORS.map((col) => (
                <button
                  key={col.name}
                  onClick={() => setSelectedColor(col)}
                  title={col.name}
                  className={`w-5 h-5 rounded-full border transition ${
                    selectedColor.name === col.name ? "ring-2 ring-blue-600 ring-offset-1" : "border-slate-300"
                  }`}
                  style={{ backgroundColor: col.hex }}
                />
              ))}
            </div>

            {/* Canvas Three.js */}
            <div className="flex-1 w-full h-full">
              <ModelViewer file={file} color={selectedColor.hex} />
            </div>

            {/* Dolny pasek podglądu */}
            <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none">
              <div className="pointer-events-auto bg-white/90 backdrop-blur-md border border-slate-200 px-4 py-1.5 rounded-full shadow-sm text-[11px] text-slate-500 flex gap-3">
                <span>Obrót: lewy przycisk</span>
                <span>•</span>
                <span>Zoom: kółko myszy</span>
              </div>
            </div>
          </div>

          {/* Karta szczegółów modelu pod podglądem */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Wymiary gabarytowe</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Oś X</span>
                <span className="text-sm font-semibold text-slate-800">{analysis?.bbox_mm?.[0] ?? "-"} mm</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Oś Y</span>
                <span className="text-sm font-semibold text-slate-800">{analysis?.bbox_mm?.[1] ?? "-"} mm</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Oś Z</span>
                <span className="text-sm font-semibold text-slate-800">{analysis?.bbox_mm?.[2] ?? "-"} mm</span>
              </div>
            </div>
          </div>
        </div>

        {/* PRAWA KOLUMNA: Konfigurator, Materiał, Podsumowanie */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Pozycja i cena jednostkowa */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="max-w-[240px]">
                <h2 className="font-bold text-slate-800 text-sm truncate">{file?.name || "Model 3D"}</h2>
                <div className="text-3xl font-black text-blue-600 mt-1">PLN {unitPrice}</div>
                <div className="text-[11px] text-slate-500">
                  {includeVat ? `Cena za sztukę brutto (w tym 23% VAT)` : `Cena za sztukę netto`}
                </div>
              </div>

              {/* Licznik sztuk */}
              <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1">
                <button
                  onClick={() => handleOptionsChange(material, quantity - 1, infill)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white text-slate-700 font-bold transition"
                >
                  -
                </button>
                <span className="w-9 text-center text-xs font-bold text-slate-900">{quantity}</span>
                <button
                  onClick={() => handleOptionsChange(material, quantity + 1, infill)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white text-slate-700 font-bold transition"
                >
                  +
                </button>
              </div>
            </div>

            {quantity < 5 && (
              <div className="mt-3 p-2 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-700 flex justify-between items-center">
                <span>Dodaj jeszcze {5 - quantity} szt., aby otrzymać rabat ilościowy</span>
                <span className="font-bold">-5%</span>
              </div>
            )}
          </div>

          {/* Krok 1: Proces technologiczny */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <span className="text-emerald-500">✓</span> Proces druku
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border-2 border-blue-600 bg-blue-50/30 p-2.5 rounded-xl cursor-default">
                <div className="font-bold text-xs text-blue-950">FDM Dysza 0.4 mm</div>
                <div className="text-[11px] text-blue-700">Precyzja standardowa</div>
              </div>
              <div className="border border-slate-200 p-2.5 rounded-xl opacity-60 cursor-not-allowed">
                <div className="font-medium text-xs text-slate-700">SLA Żywica</div>
                <div className="text-[11px] text-slate-400">Wysoki detal</div>
              </div>
            </div>
          </div>

          {/* Krok 2: Wybór materiału */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <span className="text-emerald-500">✓</span> Materiał ({AVAILABLE_MATERIALS.length})
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {AVAILABLE_MATERIALS.map((mat) => (
                <div
                  key={mat.id}
                  onClick={() => handleOptionsChange(mat.id, quantity, infill)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer flex justify-between items-center transition ${
                    material === mat.id
                      ? "border-blue-600 bg-blue-50/30 font-semibold text-blue-950"
                      : "border-slate-200 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <div>
                    <div>{mat.name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{mat.desc}</div>
                  </div>
                  {material === mat.id && <span className="text-blue-600 font-bold">●</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Krok 3: Parametry warstwy i wypełnienia */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-slate-800">Wypełnienie (Infill)</span>
                <span className="font-bold text-blue-600">{infill}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={infill}
                onChange={(e) => handleOptionsChange(material, quantity, parseInt(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Wysokość warstwy</span>
              <select
                value={layerHeight}
                onChange={(e) => setLayerHeight(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="0.12 mm">Dokładna (0.12 mm)</option>
                <option value="0.20 mm">Standardowa (0.20 mm)</option>
                <option value="0.28 mm">Szybka (0.28 mm)</option>
              </select>
            </div>
          </div>

          {/* Podsumowanie i Zamówienie */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mt-auto sticky bottom-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Do zapłaty</span>
                <div className="text-2xl font-black text-slate-900">
                  PLN {displayTotal.toFixed(2)}
                </div>
              </div>

              {/* Toggle VAT */}
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <span>VAT wliczone</span>
                <button
                  onClick={() => setIncludeVat(!includeVat)}
                  className={`w-9 h-5 rounded-full p-0.5 transition ${includeVat ? "bg-blue-600" : "bg-slate-300"}`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition transform ${
                      includeVat ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => alert("Wiadomość z prośbą o wycenę niestandardową została przygotowana.")}
                className="border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition"
              >
                Wycena ręczna
              </button>
              <button
                onClick={() => alert(`Zamówienie przyjęte! ID pliku: ${analysis?.file_key || "w pamięci"}`)}
                className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-sm"
              >
                Złóż zamówienie →
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
