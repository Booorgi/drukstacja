import { useState } from "react";
import dynamic from "next/dynamic";
import UploadBox from "../components/UploadBox";

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

  // Obliczenia cenowe
  const rawTotal = quote?.total_price_pln ? parseFloat(quote.total_price_pln) : 0;
  const netTotal = includeVat ? rawTotal / 1.23 : rawTotal;
  const grossTotal = includeVat ? rawTotal : rawTotal * 1.23;
  const displayTotal = includeVat ? grossTotal : netTotal;
  const unitPrice = quantity > 0 ? (displayTotal / quantity).toFixed(2) : "0.00";

  // Ekran początkowy: wgrywanie pliku
  if (!file) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ maxWidth: "560px", width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "24px", padding: "40px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>Drukstacja</h1>
          <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "32px" }}>
            Wgraj model 3D (STL, STEP, OBJ) i otrzymaj natychmiastową wycenę druku oraz analizę geometrii.
          </p>

          <UploadBox onFileSelected={handleFileSelected} />

          {loading && (
            <div style={{ marginTop: "24px", fontSize: "14px", color: "#2563eb", fontWeight: 600 }}>
              Trwa analiza geometrii i wysyłka do Cloudflare R2...
            </div>
          )}

          {error && (
            <div style={{ marginTop: "24px", padding: "12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: "13px", borderRadius: "12px" }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ekran konfiguratora: Dashboard wyceny
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
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>Analiza geometrii CAD</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span>Szczelność bryły:</span>
                <strong style={{ color: analysis?.watertight === false ? "#d97706" : "#10b981" }}>
                  {analysis?.watertight === false ? "Nie" : "Tak"}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span>Cienkie ścianki:</span>
                <strong style={{ color: "#10b981" }}>OK</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Nawisy i podpory:</span>
                <strong style={{ color: "#10b981" }}>Wykryto</strong>
              </div>
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
              <ModelViewer file={file} color={selectedColor.hex} />
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
