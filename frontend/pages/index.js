import { useState, useRef } from "react";
import dynamic from "next/dynamic";

// ModelViewer ładowany wyłącznie po stronie klienta
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

const STEPS = [
  { id: 1, label: "MODEL", active: true },
  { id: 2, label: "WYCENA", active: false },
  { id: 3, label: "DRUK 3D", active: false },
  { id: 4, label: "WYSYŁKA", active: false },
];

const METRICS = [
  {
    icon: (
      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="9" strokeWidth="2" />
        <path strokeWidth="2" d="M12 7v5l3 3" />
      </svg>
    ),
    val: "1000+",
    title: "Godzin druku 3D",
    sub: "miesięcznie",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    val: "60s",
    title: "Czas od wrzucenia modelu",
    sub: "do zamówienia druku",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" />
        <path strokeWidth="2" d="M9 9h6v6H9z" />
      </svg>
    ),
    val: "320³",
    title: "Pole robocze",
    sub: "maksymalne [mm]",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    val: "8+",
    title: "Materiałów do wyboru",
    sub: "różnych typów i kolorów",
  },
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
  const [showSupports, setShowSupports] = useState(false);

  // Stan dla Drag&Drop w sekcji hero
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
    setShowSupports(false);
  }

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  // Obliczenia cenowe
  const rawTotal = quote?.total_price_pln ? parseFloat(quote.total_price_pln) : 0;
  const netTotal = includeVat ? rawTotal / 1.23 : rawTotal;
  const grossTotal = includeVat ? rawTotal : rawTotal * 1.23;
  const displayTotal = includeVat ? grossTotal : netTotal;
  const unitPrice = quantity > 0 ? (displayTotal / quantity).toFixed(2) : "0.00";

  // EKRAN GŁÓWNY: Modern Hero + Stepper + Dropzone + Metryki
  if (!file) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-slate-50/50 to-white text-slate-900 antialiased font-sans">
        {/* Top Navbar */}
        <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-blue-500/20">
              D
            </div>
            <span className="font-extrabold text-xl tracking-tight text-slate-900">
              Druk<span className="text-blue-600">stacja</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#materials" className="hover:text-blue-600 transition">Materiały</a>
            <a href="#tech" className="hover:text-blue-600 transition">Technologie</a>
            <a href="#quote" className="hover:text-blue-600 transition">Wycena</a>
            <a href="#contact" className="hover:text-blue-600 transition">Kontakt</a>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Lewa kolumna: Treść & CTA */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                  Natychmiastowa wycena online
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-950 tracking-tight leading-[1.1]">
                Najwygodniejsza usługa druku 3D <span className="text-blue-600">w Polsce</span>
              </h1>

              <p className="text-lg text-slate-500 max-w-lg leading-relaxed">
                Automatyczna analiza geometrii CAD, dobór technologii i błyskawiczne zamówienie w jednym miejscu.
              </p>

              <div className="pt-2 flex flex-wrap gap-4 items-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-8 py-4 rounded-xl bg-blue-600 text-white font-bold text-sm tracking-wide shadow-lg shadow-blue-600/30 hover:bg-blue-700 hover:shadow-blue-600/40 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-3 cursor-pointer"
                >
                  Wyceń i zamów teraz
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Prawa kolumna: Stepper + Upload Dropzone */}
            <div className="lg:col-span-6 flex flex-col items-center">
              
              {/* Stepper procesowy */}
              <div className="w-full max-w-md flex items-center justify-between mb-8 relative">
                <div className="absolute top-1/2 left-0 w-full h-[2px] bg-slate-200 -translate-y-1/2 z-0" />
                {STEPS.map((step) => (
                  <div key={step.id} className="relative z-10 flex flex-col items-center gap-2">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                        step.active
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-4 ring-white"
                          : "bg-white text-slate-400 border-2 border-slate-200"
                      }`}
                    >
                      {step.id}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 tracking-wider">
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Box wrzucania pliku */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full max-w-md p-10 rounded-3xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center text-center cursor-pointer ${
                  dragOver
                    ? "border-blue-600 bg-blue-50/50 scale-[1.01]"
                    : "border-blue-200 bg-white hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/5 shadow-sm"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".stl,.step,.stp,.obj"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                />

                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[11px] font-bold">.STL</span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[11px] font-bold">.STEP</span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[11px] font-bold">.OBJ</span>
                </div>

                <p className="text-sm font-semibold text-slate-700 mb-1">
                  Wrzuć plik lub <span className="text-blue-600 underline underline-offset-2">kliknij</span>
                </p>
                <p className="text-xs text-slate-400">
                  Maksymalny rozmiar pliku: 100 MB
                </p>

                {loading && (
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full animate-pulse">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Trwa analiza geometrii i wycena...
                  </div>
                )}

                {error && (
                  <div className="mt-4 text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
                    {error}
                  </div>
                )}
              </div>

              {/* Informacja NDA */}
              <div className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
                </svg>
                <span>Wszystkie pliki są szyfrowane i poufne (NDA ready)</span>
              </div>

            </div>
          </div>
        </section>

        {/* 4 Kafelki z metrykami zaufania */}
        <section className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {METRICS.map((item, idx) => (
              <div
                key={idx}
                className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition duration-200"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                  {item.icon}
                </div>
                <div className="text-3xl font-black text-blue-600 tracking-tight mb-1">
                  {item.val}
                </div>
                <div className="text-sm font-bold text-slate-800">
                  {item.title}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {item.sub}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // EKRAN 2: Dashboard wyceny (po załadowaniu pliku)
  return (
    <div style={{ minHeight: "100vh", paddingBottom: "40px" }}>
      <header className="top-bar">
        <button onClick={handleReset} className="btn-back">
          ← Wróć do wyboru pliku
        </button>
        <span className="badge">Drukstacja Instant Quote</span>
      </header>

      <main className="dashboard-container">
        {/* LEWA KOLUMNA: Podgląd 3D i parametry geometryczne */}
        <div>
          <div className="card viewer-card">
            <div className="viewer-badge">
              Objętość: <strong>{analysis?.volume_cm3 ?? "..."} cm³</strong>
            </div>

            <div className="viewer-analysis">
              <div style={{ fontWeight: 700, marginBottom: "6px" }}>Analiza geometrii CAD</div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span>Szczelność bryły:</span>
                <strong style={{ color: analysis?.watertight === false ? "#d97706" : "#10b981" }}>
                  {analysis?.watertight === false ? "Nie" : "Tak"}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span>Podpory:</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <strong style={{ color: analysis?.has_supports ? "#f59e0b" : "#10b981" }}>
                    {analysis?.has_supports ? "Wymagane" : "Brak"}
                  </strong>
                  {analysis?.has_supports && (
                    <button
                      type="button"
                      onClick={() => setShowSupports(!showSupports)}
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: showSupports ? "#ef4444" : "#ffffff",
                        color: showSupports ? "#ffffff" : "#0f172a",
                        cursor: "pointer",
                        fontWeight: 600,
                        transition: "all 0.2s ease"
                      }}
                    >
                      {showSupports ? "Ukryj zwisy" : "Podgląd zwisów"}
                    </button>
                  )}
                </div>
              </div>

              {analysis?.orientation?.rotated && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                  <span>Auto-orientacja:</span>
                  <strong style={{ color: "#10b981" }}>
                    {analysis.orientation.improvement_pct > 0
                      ? `-${analysis.orientation.improvement_pct}% podpór`
                      : "Zastosowano"}
                  </strong>
                </div>
              )}

              {analysis?.print_time_exact && analysis.print_time_exact !== "N/A" && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                  <span>Czas druku:</span>
                  <strong style={{ color: "#2563eb" }}>{analysis.print_time_exact}</strong>
                </div>
              )}

              {analysis?.filament_weight_g_exact ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Waga filamentu:</span>
                  <strong style={{ color: "#0f172a" }}>{analysis.filament_weight_g_exact} g</strong>
                </div>
              ) : null}
            </div>

            <div className="color-bar">
              {COLORS.map((col) => (
                <button
                  key={col.name}
                  onClick={() => setSelectedColor(col)}
                  className={`color-dot ${selectedColor.name === col.name ? "active" : ""}`}
                  style={{ backgroundColor: col.hex }}
                  title={col.name}
                />
              ))}
            </div>

            <div style={{ flex: 1, width: "100%", height: "100%" }}>
              <ModelViewer
                file={file}
                previewUrl={analysis?.preview_stl_url}
                color={selectedColor.hex}
                showOverhangs={showSupports}
              />
            </div>

            <div style={{ position: "absolute", bottom: "12px", insetInline: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(4px)", border: "1px solid #e2e8f0", padding: "6px 16px", borderRadius: "9999px", fontSize: "11px", color: "#64748b" }}>
                Obrót: lewy przycisk • Zoom: kółko myszy
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", marginBottom: "12px" }}>
              Wymiary gabarytowe
            </h3>
            <div className="dim-grid">
              <div className="dim-box">
                <span>OŚ X</span>
                <strong>{analysis?.bbox_mm?.[0] ?? "-"} mm</strong>
              </div>
              <div className="dim-box">
                <span>OŚ Y</span>
                <strong>{analysis?.bbox_mm?.[1] ?? "-"} mm</strong>
              </div>
              <div className="dim-box">
                <span>OŚ Z</span>
                <strong>{analysis?.bbox_mm?.[2] ?? "-"} mm</strong>
              </div>
            </div>
          </div>
        </div>

        {/* PRAWA KOLUMNA: Konfigurator technologiczny i zamówienie */}
        <div>
          <div className="card">
            <div className="price-header">
              <div style={{ maxWidth: "240px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file?.name || "Model 3D"}
                </h2>
                <div className="big-price">PLN {unitPrice}</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>
                  {includeVat ? "Cena za 1 szt. brutto (23% VAT)" : "Cena za 1 szt. netto"}
                </div>
              </div>

              <div className="qty-control">
                <button onClick={() => handleOptionsChange(material, quantity - 1, infill)}>-</button>
                <span>{quantity}</span>
                <button onClick={() => handleOptionsChange(material, quantity + 1, infill)}>+</button>
              </div>
            </div>

            {quantity < 5 && (
              <div style={{ marginTop: "12px", padding: "8px 12px", background: "#eff6ff", border: "1px solid #dbeafe", borderRadius: "10px", fontSize: "12px", color: "#1d4ed8", display: "flex", justifyContent: "space-between" }}>
                <span>Dodaj jeszcze {5 - quantity} szt., aby uzyskać rabat ilościowy</span>
                <strong>-5%</strong>
              </div>
            )}
          </div>

          <div className="card">
            <h4 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", marginBottom: "10px" }}>
              ✓ Technologia
            </h4>
            <div className="process-grid">
              <div className="process-box">
                <strong>FDM Dysza 0.4 mm</strong>
                <p style={{ fontSize: "11px", color: "#1e40af", marginTop: "2px" }}>Standardowa precyzja</p>
              </div>
              <div style={{ border: "1px solid #e2e8f0", padding: "10px", borderRadius: "10px", fontSize: "12px", opacity: 0.5, cursor: "not-allowed" }}>
                <strong>SLA Żywica</strong>
                <p style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>Wysoki detal</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h4 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em", marginBottom: "10px" }}>
              ✓ Materiał ({AVAILABLE_MATERIALS.length})
            </h4>
            <div style={{ maxHeight: "200px", overflowY: "auto", paddingRight: "4px" }}>
              {AVAILABLE_MATERIALS.map((mat) => (
                <div
                  key={mat.id}
                  onClick={() => handleOptionsChange(mat.id, quantity, infill)}
                  className={`material-item ${material === mat.id ? "active" : ""}`}
                >
                  <div>
                    <div style={{ fontWeight: material === mat.id ? 700 : 500 }}>{mat.name}</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>{mat.desc}</div>
                  </div>
                  {material === mat.id && <span style={{ color: "#2563eb", fontWeight: "bold" }}>●</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>Wypełnienie (Infill):</span>
              <strong style={{ color: "#2563eb" }}>{infill}%</strong>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={infill}
              onChange={(e) => handleOptionsChange(material, quantity, parseInt(e.target.value))}
              style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer" }}
            />

            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>Wysokość warstwy:</span>
              <select
                value={layerHeight}
                onChange={(e) => setLayerHeight(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#f8fafc" }}
              >
                <option value="0.12 mm">Dokładna (0.12 mm)</option>
                <option value="0.20 mm">Standardowa (0.20 mm)</option>
                <option value="0.28 mm">Szybka (0.28 mm)</option>
              </select>
            </div>
          </div>

          <div className="card" style={{ position: "sticky", bottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  DO ZAPŁATY
                </span>
                <div style={{ fontSize: "26px", fontWeight: 900, color: "#0f172a" }}>
                  PLN {displayTotal.toFixed(2)}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#64748b" }}>
                <span>VAT wliczone</span>
                <button
                  type="button"
                  onClick={() => setIncludeVat(!includeVat)}
                  style={{
                    width: "36px",
                    height: "20px",
                    borderRadius: "9999px",
                    padding: "2px",
                    border: "none",
                    cursor: "pointer",
                    background: includeVat ? "#2563eb" : "#cbd5e1",
                    display: "flex",
                    alignItems: "center",
                    transition: "background 0.2s"
                  }}
                >
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: "#ffffff",
                      transform: includeVat ? "translateX(16px)" : "translateX(0px)",
                      transition: "transform 0.2s"
                    }}
                  />
                </button>
              </div>
            </div>

            <button
              onClick={() => alert(`Zamówienie przyjęte! Klucz pliku w R2: ${analysis?.file_key || "brak"}`)}
              className="btn-submit"
            >
              Złóż zamówienie →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
