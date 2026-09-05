import React, { useState, useRef } from "react";

const STEPS = [
  { id: "01", label: "MODEL CAD", active: true },
  { id: "02", label: "AUTO-SLICING", active: false },
  { id: "03", label: "PARAMETRY", active: false },
  { id: "04", label: "PRODUKCJA", active: false },
];

const METRICS = [
  {
    icon: (
      <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
        <path strokeWidth="2" strokeLinecap="round" d="M12 7v5l3 3" />
      </svg>
    ),
    val: "1000+ h",
    title: "Miesięczny czas druku",
    sub: "Farma 32 drukarek FDM/SLA",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    val: "< 30s",
    title: "Błyskawiczna analiza",
    sub: "Automatyczna wycena geometrii",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeWidth="1.5" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" strokeWidth="1.5" />
        <line x1="12" y1="22.08" x2="12" y2="12" strokeWidth="1.5" />
      </svg>
    ),
    val: "320³ mm",
    title: "Pole robocze",
    sub: "Spiekanie, żywice i termoplasty",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeWidth="1.5" strokeLinecap="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    val: "ISO 9001",
    title: "Standard przemysłowy",
    sub: "Precyzja wymiarowa do ±0.1 mm",
  },
];

export default function HeroLanding({ onFileSelected, loading, error }) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-[#06080e] text-slate-100 selection:bg-cyan-500 selection:text-black relative overflow-hidden font-sans">
      
      {/* Siatka techniczna w tle + poświata */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }}
      />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-cyan-600/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Nawigacja */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 h-20 flex items-center justify-between border-b border-slate-850 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-black text-slate-950 text-xl shadow-lg shadow-cyan-500/20">
            D
          </div>
          <span className="font-black text-xl tracking-tight text-white">
            DRUK<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">STACJA</span>
          </span>
          <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-mono tracking-widest bg-cyan-950/60 border border-cyan-800/60 text-cyan-300">
            v2.4 PRO
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-xs font-mono tracking-wider text-slate-400">
          <span className="hover:text-cyan-400 cursor-pointer transition">MATERIAŁY</span>
          <span className="hover:text-cyan-400 cursor-pointer transition">PARK MASZYNOWY</span>
          <span className="hover:text-cyan-400 cursor-pointer transition">STANDARD JAKOŚCI</span>
          <span className="hover:text-cyan-400 cursor-pointer transition">KONTAKT</span>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Lewa kolumna */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900/90 border border-slate-750">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-xs font-mono tracking-wide text-cyan-300">
                SILNIK WYCENY CAD W CZASIE RZECZYWISTYM
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.08]">
              Przemysłowy druk 3D na żądanie.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500">
                W 60 sekund.
              </span>
            </h1>

            <p className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-xl font-normal">
              Wrzuć plik CAD/STL. Algorytm w ułamku sekundy obliczy kubaturę, zweryfikuje szczelność bryły, wykryje nawisy i przygotuje gotową wycenę produkcyjną.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-sm tracking-wide shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer flex items-center gap-3"
              >
                ROZPOCZNIJ WYCENĘ CAD
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Prawa kolumna: Stepper + Cyber Dropzone */}
          <div className="lg:col-span-6 flex flex-col items-center">
            
            {/* Stepper procesowy */}
            <div className="w-full max-w-md flex items-center justify-between mb-8 px-2">
              {STEPS.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    <span className={`text-[11px] font-mono font-bold ${step.active ? "text-cyan-400" : "text-slate-500"}`}>
                      {step.id}
                    </span>
                    <span className={`text-[9px] font-mono tracking-wider ${step.active ? "text-white" : "text-slate-600"}`}>
                      {step.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className="w-8 h-[1px] bg-slate-800 mx-1" />
                  )}
                </div>
              ))}
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full max-w-md p-10 rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer relative backdrop-blur-xl ${
                dragOver
                  ? "border-cyan-400 bg-cyan-950/30 scale-[1.01] shadow-2xl shadow-cyan-500/20"
                  : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/80 shadow-2xl shadow-black/60"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".stl,.step,.stp,.obj"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
              />

              {/* Narożniki w stylu wizjera celownika */}
              <div className="absolute top-2 left-2 w-2.5 h-2.5 border-t-2 border-l-2 border-slate-700" />
              <div className="absolute top-2 right-2 w-2.5 h-2.5 border-t-2 border-r-2 border-slate-700" />
              <div className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b-2 border-l-2 border-slate-700" />
              <div className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b-2 border-r-2 border-slate-700" />

              <div className="w-14 h-14 rounded-xl bg-slate-800/80 border border-slate-700 text-cyan-400 flex items-center justify-center mb-5 group-hover:border-cyan-400 transition">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>

              <div className="flex gap-2 mb-4">
                {["STL", "STEP", "STP", "OBJ"].map((ext) => (
                  <span key={ext} className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono font-semibold text-cyan-300 border border-slate-700">
                    .{ext}
                  </span>
                ))}
              </div>

              <p className="text-sm font-semibold text-slate-200 mb-1">
                Upuść model 3D tutaj lub <span className="text-cyan-400 underline underline-offset-4">wybierz z dysku</span>
              </p>
              <p className="text-xs font-mono text-slate-500">
                Pojedynczy plik do 100 MB • Szybkie przetwarzanie
              </p>

              {loading && (
                <div className="mt-5 flex items-center gap-2.5 px-4 py-2 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300 text-xs font-mono animate-pulse">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Trwa cięcie slicerem i analiza geometrii...
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs font-mono">
                  {error}
                </div>
              )}
            </div>

            {/* Bezpieczeństwo NDA */}
            <div className="mt-4 flex items-center gap-2 text-[11px] font-mono text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Szyfrowanie AES-256 • Automatyczna klauzula poufności (NDA)</span>
            </div>

          </div>
        </div>
      </main>

      {/* 4 Karty metryk industrialnych */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {METRICS.map((item, idx) => (
            <div
              key={idx}
              className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm hover:border-slate-700 transition"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-800/60 flex items-center justify-center mb-4 border border-slate-750">
                {item.icon}
              </div>
              <div className="text-2xl font-black font-mono tracking-tight text-white mb-1">
                {item.val}
              </div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {item.title}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-1">
                {item.sub}
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}