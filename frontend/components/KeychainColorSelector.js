import React, { useState } from 'react';
import { FILAMENTS, FILAMENT_CATEGORIES } from '../config/filamentDatabase';

export default function KeychainColorSelector({ layers, onSelectColor }) {
  // layers: [{ id: 'base', name: 'Płyta bazowa', selected: FILAMENTS[0] }, ...]
  const [activeLayer, setActiveLayer] = useState(null);
  const [activeCategory, setActiveCategory] = useState(FILAMENT_CATEGORIES.PLA_STANDARD);

  const handleOpenPicker = (layer) => {
    setActiveLayer(layer);
    if (layer?.selected?.category) {
      setActiveCategory(layer.selected.category);
    }
  };

  const handleSelect = (filament) => {
    if (activeLayer) {
      onSelectColor(activeLayer.id, filament);
    }
    setActiveLayer(null);
  };

  return (
    <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Kolory warstw breloka (Sloty AMS)
        </h3>
        <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
          SUNLU 100% PLA
        </span>
      </div>

      {/* Lista warstw breloka */}
      <div className="space-y-2">
        {layers.map((layer) => {
          const selected = layer.selected || FILAMENTS[0];
          return (
            <div
              key={layer.id}
              onClick={() => handleOpenPicker(layer)}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all bg-slate-50/60 hover:bg-white"
            >
              <div className="flex items-center gap-3">
                {/* Próbka aktualnego koloru */}
                <div
                  className="w-7 h-7 rounded-full border border-slate-300 shadow-inner flex-shrink-0"
                  style={{
                    background: selected.gradient || selected.hex,
                  }}
                />
                <div>
                  <div className="text-xs font-semibold text-slate-800">{layer.name}</div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {selected.name} <span className="text-slate-400">({selected.category})</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-blue-600 hover:underline">Zmień</span>
                <span className="text-slate-300 text-xs">›</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal / Okienko wyboru z podziałem na kategorie */}
      {activeLayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setActiveLayer(null)}
        >
          <div
            className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nagłówek okna */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h4 className="text-base font-bold text-slate-800">
                  Wybierz kolor dla: <span className="text-blue-600">{activeLayer.name}</span>
                </h4>
                <p className="text-xs text-slate-500">Oryginalne filamenty SUNLU 1.75mm</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveLayer(null)}
                className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* Pasek kategorii (Tabs) */}
            <div className="flex gap-1.5 px-6 py-3 border-b border-slate-100 overflow-x-auto no-scrollbar bg-white">
              {Object.values(FILAMENT_CATEGORIES).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeCategory === category
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Siatka kolorów w wybranej kategorii */}
            <div className="p-6 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[50vh]">
              {FILAMENTS.filter((f) => f.category === activeCategory).map((filament) => {
                const isSelected = activeLayer.selected?.id === filament.id;
                return (
                  <button
                    key={filament.id}
                    type="button"
                    onClick={() => handleSelect(filament)}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/30"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-full border border-slate-300 shadow-sm flex-shrink-0"
                      style={{
                        background: filament.gradient || filament.hex,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-slate-800 truncate block">
                        {filament.name}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {filament.hex}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Stopka z podsumowaniem */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
              <span>
                Dysza:{" "}
                <strong className="text-slate-700">
                  {activeLayer.selected?.nozzleTemp || 215}°C
                </strong>{" "}
                | Stół:{" "}
                <strong className="text-slate-700">
                  {activeLayer.selected?.bedTemp || 55}°C
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setActiveLayer(null)}
                className="px-4 py-1.5 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
