import React, { useState, useRef } from "react";

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
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50/50 to-white text-slate-900 antialiased">
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
          
          {/* Lewa kolumna: Copywriting & CTA */}
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
                onClick={() => fileInputRef.current?.click()}
                className="px-8 py-4 rounded-xl bg-blue-600 text-white font-bold text-sm tracking-wide shadow-lg shadow-blue-600/30 hover:bg-blue-700 hover:shadow-blue-600/40 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-3"
              >
                Wyceń i zamów teraz
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Prawa kolumna: Stepper + Interaktywny UploadBox */}
          <div className="lg:col-span-6 flex flex-col items-center">
            
            {/* Stepper etapów */}
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

            {/* Karta dropzone */}
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
                onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
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
                  Trwa cięcie geometrii i analiza kosztów...
                </div>
              )}

              {error && (
                <div className="mt-4 text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
                  {error}
                </div>
              )}
            </div>

            {/* Bezpieczeństwo danych */}
            <div className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
              <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
              </svg>
              <span>Wszystkie pliki są szyfrowane i poufne (NDA ready)</span>
            </div>

          </div>
        </div>
      </section>

      {/* Grid z 4 kafelkami metryk */}
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
