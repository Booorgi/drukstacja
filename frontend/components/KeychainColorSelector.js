import React, { useState } from 'react';
import { FILAMENTS, FILAMENT_CATEGORIES } from '../config/filamentDatabase';

export function FilamentPickerModal({ isOpen, onClose, onSelect, title, currentFilament }) {
  const [activeCategory, setActiveCategory] = useState(
    () => currentFilament?.category || FILAMENT_CATEGORIES.PLA_STANDARD
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nagłówek okna */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h4 className="text-base font-bold text-slate-800">
              {title || "Wybierz filament"}
            </h4>
            <p className="text-xs text-slate-500">Oryginalne filamenty SUNLU 1.75mm (Baza kolorów)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
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
            const isSelected = currentFilament?.id === filament.id;
            return (
              <button
                key={filament.id}
                type="button"
                onClick={() => {
                  onSelect(filament);
                  onClose();
                }}
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
            Zalecana dysza: <strong className="text-slate-700">{currentFilament?.nozzleTemp || 215}°C</strong> | Stół: <strong className="text-slate-700">{currentFilament?.bedTemp || 55}°C</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

export function FilamentPickerRow({ label, sublabel, filament, onOpenPicker }) {
  const current = filament || FILAMENTS[0];
  return (
    <div
      onClick={onOpenPicker}
      className="flex items-center justify-between p-3 rounded-2xl border border-slate-200/80 hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all bg-white hover:bg-slate-50/50"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-full border border-slate-300 shadow-inner flex-shrink-0"
          style={{
            background: current.gradient || current.hex,
          }}
        />
        <div>
          <div className="text-xs font-bold text-slate-800">{label}</div>
          <div className="text-[11px] text-slate-500 font-medium">
            {current.name} <span className="text-slate-400 font-normal">({current.category || "SUNLU"})</span>
          </div>
          {sublabel && <div className="text-[10px] text-slate-400">{sublabel}</div>}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-blue-600 hover:underline">Zmień</span>
        <span className="text-slate-300 text-xs">›</span>
      </div>
    </div>
  );
}

export default function KeychainColorSelector({ layers, onSelectColor }) {
  const [activeLayer, setActiveLayer] = useState(null);

  return (
    <>
      <div className="space-y-2">
        {layers.map((layer) => (
          <FilamentPickerRow
            key={layer.id}
            label={layer.name}
            filament={layer.selected}
            onOpenPicker={() => setActiveLayer(layer)}
          />
        ))}
      </div>

      <FilamentPickerModal
        isOpen={Boolean(activeLayer)}
        onClose={() => setActiveLayer(null)}
        title={activeLayer ? `Wybierz kolor dla: ${activeLayer.name}` : "Wybierz filament"}
        currentFilament={activeLayer?.selected}
        onSelect={(filament) => {
          if (activeLayer) {
            onSelectColor(activeLayer.id, filament);
          }
          setActiveLayer(null);
        }}
      />
    </>
  );
}
