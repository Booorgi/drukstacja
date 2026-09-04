import { useState } from "react";
import dynamic from "next/dynamic";
import UploadBox from "../components/UploadBox";

// three.js potrzebuje window - musimy wylaczyc SSR dla tego komponentu
const ModelViewer = dynamic(() => import("../components/ModelViewer"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function Home() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [quote, setQuote] = useState(null);
  const [material, setMaterial] = useState("PLA");
  const [quantity, setQuantity] = useState(1);
  const [infill, setInfill] = useState(20);
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
        throw new Error(err.detail || "Blad analizy pliku");
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

    const res = await fetch(`${API_URL}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setQuote(await res.json());
    }
  }

  function handleOptionsChange(newMaterial, newQuantity, newInfill) {
    setMaterial(newMaterial);
    setQuantity(newQuantity);
    setInfill(newInfill);
    if (analysis) {
      fetchQuote(analysis, { material: newMaterial, quantity: newQuantity, infill: newInfill });
    }
  }

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>Drukstacja</h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem" }}>
        Wgraj model 3D i otrzymaj natychmiastowa wycene druku.
      </p>

      <UploadBox onFileSelected={handleFileSelected} />

      {loading && <p style={{ marginTop: "1rem" }}>Analizuje plik...</p>}
      {error && <p style={{ marginTop: "1rem", color: "#dc2626" }}>{error}</p>}

      {file && <div style={{ marginTop: "1.5rem" }}><ModelViewer file={file} /></div>}

      {analysis && (
        <div style={{ marginTop: "1.5rem", padding: "1.5rem", background: "#f9fafb", borderRadius: "12px" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Dane modelu</h2>
          <p>Objetosc: <strong>{analysis.volume_cm3} cm3</strong></p>
          <p>Wymiary (X x Y x Z): <strong>{analysis.bbox_mm.join(" x ")} mm</strong></p>
          {analysis.watertight === false && (
            <p style={{ color: "#d97706" }}>Uwaga: model nie jest szczelny - wycena moze byc niedokladna.</p>
          )}

          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "1.5rem 0 1rem" }}>Opcje druku</h2>

          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            Material:{" "}
            <select value={material} onChange={(e) => handleOptionsChange(e.target.value, quantity, infill)}>
              <option value="PLA">PLA</option>
              <option value="PETG">PETG</option>
              <option value="ABS">ABS</option>
              <option value="TPU">TPU</option>
              <option value="Resin (SLA)">Resin (SLA)</option>
            </select>
          </label>

          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            Ilosc sztuk:{" "}
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => handleOptionsChange(material, parseInt(e.target.value) || 1, infill)}
              style={{ width: "60px" }}
            />
          </label>

          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            Wypelnienie: {infill}%{" "}
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={infill}
              onChange={(e) => handleOptionsChange(material, quantity, parseInt(e.target.value))}
            />
          </label>
        </div>
      )}

      {quote && (
        <div style={{ marginTop: "1.5rem", padding: "1.5rem", background: "#eff6ff", borderRadius: "12px" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Wycena</h2>
          <p>Waga na sztuke: <strong>{quote.weight_g_per_unit} g</strong></p>
          <p>Szacowany czas druku (1 szt.): <strong>{quote.estimated_print_time_hours_per_unit} h</strong></p>
          <p style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: "1rem" }}>
            {quote.total_price_pln} zl
          </p>
          <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>{quote.note}</p>
        </div>
      )}
    </div>
  );
}
