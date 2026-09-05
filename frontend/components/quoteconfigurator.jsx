import React, { useState } from 'react';
import { 
  ArrowLeft, CheckCircle2, ChevronRight, Search, Info, Plus, Minus, 
  Trash2, UploadCloud, ArrowRight, ShieldCheck, Download, Maximize2 
} from 'lucide-react';

const COLORS = [
  { name: 'Biały', hex: '#FFFFFF', border: true },
  { name: 'Czarny', hex: '#1E1E1E' },
  { name: 'Pomarańczowy', hex: '#F97316' },
  { name: 'Czerwony', hex: '#EF4444' },
  { name: 'Miętowy', hex: '#10B981' },
  { name: 'Niebieski', hex: '#06B6D4' },
  { name: 'Szary', hex: '#6B7280' },
];

const MATERIALS_LIST = [
  { id: 'PLA', name: 'PLA Standard', desc: 'Szybki prototyp, niski koszt' },
  { id: 'PETG', name: 'PETG Odporny', desc: 'Wytrzymałość mechaniczna i termiczna' },
  { id: 'ASA', name: 'ASA UV Resistant', desc: 'Zastosowania zewnętrzne' },
  { id: 'PA-CF', name: 'Nylon 12 CF / PA 12 CF', desc: 'Wzmocniony włóknem węglowym' },
  { id: 'PC', name: 'Poliwęglan (PC)', desc: 'Ekstremalna udarność' },
];

export default function QuoteConfigurator({ modelData, onBack }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState(COLORS[1]);
  const [selectedMaterial, setSelectedMaterial] = useState('PLA');
  const [infill, setInfill] = useState(20);
  const [layerHeight, setLayerHeight] = useState('0.20mm');
  const [includeVat, setIncludeVat] = useState(true);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // Przykładowe wyliczenie bazowe (lub z Twojego API /quote)
  const baseUnitPrice = 3.19;
  const unitPrice = quantity >= 5 ? baseUnitPrice * 0.97 : baseUnitPrice;
  const netTotal = unitPrice * quantity;
  const grossTotal = netTotal * 1.23;
  const vatAmount = grossTotal - netTotal;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Pasek nawigacji */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-600 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Wróć do wgrywania
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
            Automatyczna wycena CAD
          </span>
        </div>
      </header>

      {/* Główny obszar 2-kolumnowy */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEWA KOLUMNA: Podgląd 3D & Analiza */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative bg-white border border-slate-200 rounded-2xl h-[480px] lg:h-[540px] overflow-hidden shadow-sm flex items-center justify-center">
            
            {/* Informacja o objętości w rogu */}
            <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 shadow-sm">
              Objętość: <span className="font-semibold text-slate-900">{modelData?.volume_cm3 || '7.16'} cm³</span>
            </div>

            {/* Checklist analizy geometrii */}
            <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur-sm border border-slate-200 p-3 rounded-xl shadow-sm text-xs space-y-1.5 max-w-[210px]">
              <div className="font-semibold text-slate-800 flex items-center gap-1 mb-1">
                <span>Analiza geometrii CAD</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Szczelna bryła</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Cienkie ścianki</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Nawisy i podpory</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </div>
            </div>

            {/* Selektor koloru na podglądzie */}
            <div className="absolute top-16 left-4 z-20">
              <button 
                onClick={() => setColorPickerOpen(!colorPickerOpen)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm flex items-center gap-2.5 hover:bg-slate-50 transition text-xs font-medium"
              >
                <span 
                  className="w-4 h-4 rounded-full border border-slate-300" 
                  style={{ backgroundColor: selectedColor.hex }}
                />
                {selectedColor.name}
              </button>

              {colorPickerOpen && (
                <div className="mt-2 bg-white border border-slate-200 rounded-xl p-2 shadow-xl flex flex-col gap-1 w-40">
                  {COLORS.map((col) => (
                    <button
                      key={col.name}
                      onClick={() => { setSelectedColor(col); setColorPickerOpen(false); }}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 transition text-left"
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ backgroundColor: col.hex }} />
                      {col.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Miejsce na Canvas Three.js */}
            <div className="text-center text-slate-400">
              <div className="w-40 h-40 border-2 border-dashed border-slate-300 rounded-2xl mx-auto flex items-center justify-center bg-slate-50 mb-3">
                <span className="text-xs text-slate-500 font-mono">[Viewport 3D]</span>
              </div>
              <p className="text-xs text-slate-500">Obracaj lewym przyciskiem myszy • Przybliżaj rolką</p>
            </div>

            {/* Pasek narzędziowy widoku */}
            <div className="absolute bottom-4 inset-x-0 flex justify-center gap-2 pointer-events-none">
              <div className="pointer-events-auto bg-white/90 backdrop-blur-md border border-slate-200 px-3 py-1.5 rounded-full shadow-sm flex items-center gap-3 text-xs text-slate-600">
                <button className="hover:text-blue-600 transition flex items-center gap-1">Centruj</button>
                <span className="text-slate-300">|</span>
                <button className="hover:text-blue-600 transition">Rzut ISO</button>
                <span className="text-slate-300">|</span>
                <button className="hover:text-blue-600 transition"><Download className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>

          {/* Podsumowanie pozycji w koszyku na dole lewej kolumny */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center justify-between">
              <span>Konfiguracja elementu</span>
              <span className="text-xs text-slate-500 font-normal">
                {modelData?.original_filename || 'Watch case 1.stl'}
              </span>
            </h3>
            
            <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
              <span className="text-slate-500">Gabaryty (X × Y × Z):</span>
              <span className="font-mono font-medium text-slate-800">
                {modelData?.bbox_mm ? `${modelData.bbox_mm[0]} × ${modelData.bbox_mm[1]} × ${modelData.bbox_mm[2]} mm` : '45.03 × 47.55 × 13.62 mm'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-2">
              <span className="text-slate-500">Technologia / Materiał:</span>
              <span className="font-medium text-slate-800">FDM / {selectedMaterial} ({selectedColor.name})</span>
            </div>
          </div>
        </section>

        {/* PRAWA KOLUMNA: Konfigurator technologiczny & Płatność */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Karta wyceny jednostkowej i ilości */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-slate-800 text-sm">{modelData?.original_filename || 'Watch case 1.stl'}</h2>
                <div className="text-3xl font-extrabold text-blue-600 mt-1">
                  PLN {(unitPrice * (includeVat ? 1.23 : 1)).toFixed(2)}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {includeVat ? `Zawiera 23% VAT (PLN ${(unitPrice * 0.23).toFixed(2)})` : 'Cena netto'}
                </p>
              </div>

              {/* Selektor sztuk */}
              <div className="flex items-center border border-slate-200 rounded-lg p-1 bg-slate-50">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-1 hover:bg-white rounded transition text-slate-600"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-xs font-semibold">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-1 hover:bg-white rounded transition text-slate-600"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {quantity < 5 && (
              <div className="mt-3 p-2 bg-blue-50/70 border border-blue-100 rounded-lg text-xs text-blue-700 flex items-center justify-between">
                <span>Dodaj jeszcze {5 - quantity} szt., aby uzyskać 3% rabatu</span>
                <span className="font-bold">-3%</span>
              </div>
            )}
          </div>

          {/* Krok 1: Proces druku */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Proces wytwórczy
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="border-2 border-blue-600 bg-blue-50/40 p-3 rounded-xl text-left transition">
                <div className="font-semibold text-xs text-blue-950">FDM Dysza 0.4 mm</div>
                <div className="text-[11px] text-blue-700 mt-0.5">Standardowa precyzja</div>
              </button>
              <button className="border border-slate-200 p-3 rounded-xl text-left hover:border-slate-300 transition opacity-60">
                <div className="font-medium text-xs text-slate-700">SLA Żywica</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Wysoka szczegółowość</div>
              </button>
            </div>
          </div>

          {/* Krok 2: Materiał */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Wybór materiału
            </div>
            
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {MATERIALS_LIST.map((mat) => (
                <div 
                  key={mat.id}
                  onClick={() => setSelectedMaterial(mat.id)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition ${
                    selectedMaterial === mat.id 
                      ? 'border-blue-600 bg-blue-50/30 text-blue-950 font-semibold' 
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div>
                    <div>{mat.name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{mat.desc}</div>
                  </div>
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                </div>
              ))}
            </div>
          </div>

          {/* Krok 3: Parametry wypełnienia i warstwy */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-800">Wypełnienie (Infill)</span>
                <span className="font-bold text-blue-600">{infill}%</span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="100" 
                step="10"
                value={infill}
                onChange={(e) => setInfill(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">Wysokość warstwy</span>
              <select 
                value={layerHeight} 
                onChange={(e) => setLayerHeight(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="0.12mm">Dokładna (0.12 mm)</option>
                <option value="0.20mm">Standard (0.20 mm)</option>
                <option value="0.28mm">Szybka (0.28 mm)</option>
              </select>
            </div>
          </div>

          {/* Karta finalizacji zamówienia */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm sticky bottom-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs text-slate-500 font-medium">Cena całkowita</span>
                <div className="text-2xl font-black text-slate-900">
                  PLN {(includeVat ? grossTotal : netTotal).toFixed(2)}
                </div>
              </div>

              {/* Przełącznik VAT */}
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>VAT wliczone</span>
                <button 
                  onClick={() => setIncludeVat(!includeVat)}
                  className={`w-9 h-5 rounded-full p-0.5 transition ${includeVat ? 'bg-blue-600' : 'bg-slate-300'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition transform ${includeVat ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button className="border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 rounded-xl text-xs font-semibold transition">
                Wycena ręczna
              </button>
              <button className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 transition">
                Złóż zamówienie <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
}
