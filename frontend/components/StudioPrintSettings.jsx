import React from "react";
import { STL_MATERIAL_GROUPS } from "../lib/filament";

function pill(active) {
  return active
    ? "bg-white text-neutral-900"
    : "bg-white/10 text-white/80 hover:bg-white/15 hover:text-white";
}

export default function StudioPrintSettings({
  isRfq = false,
  selectedMaterialGroup,
  onSelectGroup,
  filteredMaterials = [],
  currentIndex = 0,
  matConfig,
  selectedColor,
  onSelectColor,
  onPrevMaterial,
  onNextMaterial,
  onSelectMaterial,
  nozzleSize,
  onNozzleSize,
  isPlaMaterial,
  layerHeight,
  onLayerHeight,
  layerHeightOptions = [],
  infill,
  onInfill,
  rfqSubmitted,
  rfqSubmitting,
  rfqName,
  setRfqName,
  rfqEmail,
  setRfqEmail,
  rfqPhone,
  setRfqPhone,
  rfqQuantity,
  setRfqQuantity,
  rfqNotes,
  setRfqNotes,
  onSubmitRfq,
  onResetFile,
  selectedFileName,
  userEmail,
}) {
  if (isRfq) {
    return (
      <div className="rounded-2xl bg-[#111111]/80 backdrop-blur-md text-white p-5 space-y-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
          Wycena inżynierska
        </p>
        {rfqSubmitted ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Zapytanie zostało przesłane.</p>
            <p className="text-xs text-white/70">
              Oferta w ciągu 24h na {rfqEmail || userEmail}.
            </p>
            <button
              type="button"
              onClick={onResetFile}
              className="px-4 py-2 rounded-full bg-white text-neutral-900 text-[11px] font-semibold uppercase tracking-[0.12em]"
            >
              Kolejny plik
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmitRfq} className="space-y-3">
            <p className="text-xs text-white/70">
              Zweryfikujemy <strong className="text-white">{selectedFileName}</strong> i wrócimy z wyceną.
            </p>
            <input
              type="text"
              value={rfqName}
              onChange={(e) => setRfqName(e.target.value)}
              placeholder="Imię / firma"
              className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder:text-white/40 focus:outline-none"
            />
            <input
              type="email"
              required
              value={rfqEmail}
              onChange={(e) => setRfqEmail(e.target.value)}
              placeholder="E-mail *"
              className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder:text-white/40 focus:outline-none"
            />
            <input
              type="tel"
              value={rfqPhone}
              onChange={(e) => setRfqPhone(e.target.value)}
              placeholder="Telefon"
              className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder:text-white/40 focus:outline-none"
            />
            <input
              type="number"
              min="1"
              value={rfqQuantity}
              onChange={(e) => setRfqQuantity(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs text-white focus:outline-none"
            />
            <textarea
              rows={3}
              value={rfqNotes}
              onChange={(e) => setRfqNotes(e.target.value)}
              placeholder="Materiał, tolerancje, termin…"
              className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder:text-white/40 focus:outline-none resize-none"
            />
            <button
              type="submit"
              disabled={rfqSubmitting}
              className="w-full py-3 rounded-full bg-white text-neutral-900 text-[11px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50"
            >
              {rfqSubmitting ? "Wysyłanie…" : "Wyślij do wyceny"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#111111]/75 backdrop-blur-md text-white p-4 sm:p-5 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
            Materiał
          </span>
          <span className="text-[10px] text-white/40">
            {currentIndex + 1} / {filteredMaterials.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {STL_MATERIAL_GROUPS.map((grp) => (
            <button
              key={grp.id}
              type="button"
              onClick={() => onSelectGroup(grp.id)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${pill(
                selectedMaterialGroup === grp.id
              )}`}
            >
              {grp.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevMaterial}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
            aria-label="Poprzedni materiał"
          >
            ‹
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{matConfig?.name}</p>
            <div className="flex items-center gap-1.5 mt-1.5 overflow-x-auto">
              {(matConfig?.colors || []).map((c) => {
                const on = selectedColor?.toLowerCase() === c.hex?.toLowerCase();
                return (
                  <button
                    key={c.id || c.hex}
                    type="button"
                    title={c.name}
                    onClick={() => onSelectColor(c.hex)}
                    className={`w-5 h-5 rounded-full shrink-0 ${on ? "ring-2 ring-white ring-offset-2 ring-offset-[#111]" : "opacity-80"}`}
                    style={{
                      backgroundColor: c.hex,
                      border: ["#ffffff", "#f5f5f5", "#f8f9fa"].includes(String(c.hex).toLowerCase())
                        ? "1px solid rgba(255,255,255,0.4)"
                        : "none",
                    }}
                  />
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={onNextMaterial}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
            aria-label="Następny materiał"
          >
            ›
          </button>
        </div>
        <div className="flex items-center justify-center gap-1">
          {filteredMaterials.map((mat, idx) => (
            <button
              key={mat.id}
              type="button"
              onClick={() => onSelectMaterial(mat.id)}
              className={`h-1 rounded-full ${idx === currentIndex ? "w-4 bg-white" : "w-1 bg-white/30"}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
          Dysza
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onNozzleSize(0.4)}
            className={`px-3 py-2 rounded-xl text-left ${pill(nozzleSize === 0.4)}`}
          >
            <span className="block text-xs font-semibold">0.4 mm</span>
            <span className="block text-[10px] opacity-70">Standard</span>
          </button>
          <button
            type="button"
            disabled={!isPlaMaterial}
            onClick={() => isPlaMaterial && onNozzleSize(0.2)}
            className={`px-3 py-2 rounded-xl text-left ${
              !isPlaMaterial ? "bg-white/5 text-white/30 cursor-not-allowed" : pill(nozzleSize === 0.2)
            }`}
          >
            <span className="block text-xs font-semibold">0.2 mm</span>
            <span className="block text-[10px] opacity-70">{isPlaMaterial ? "Precyzja" : "Tylko PLA"}</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
          Warstwa
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          {layerHeightOptions.map((item) => {
            const on = Math.abs(layerHeight - item.val) < 0.01;
            return (
              <button
                key={item.val}
                type="button"
                onClick={() => onLayerHeight(item.val)}
                className={`px-2 py-2 rounded-xl text-left ${pill(on)}`}
              >
                <span className="block text-xs font-semibold">{item.label}</span>
                <span className="block text-[10px] opacity-70 truncate">{item.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
          <span>Wypełnienie</span>
          <span className="text-white">{infill}%</span>
        </div>
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          value={infill}
          onChange={(e) => onInfill(parseInt(e.target.value, 10))}
          className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-white"
        />
        <div className="flex justify-between text-[10px] text-white/40">
          <span>10%</span>
          <span>40%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
