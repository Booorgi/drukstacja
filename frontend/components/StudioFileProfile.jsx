import React from "react";

export default function StudioFileProfile({
  colours = [],
  filamentTypes = [],
  layerHeight,
  nozzleSize,
  infill,
  fromSliceInfo = false,
  editable = false,
  materialLabel,
  onSelectSlot,
  onOpenMaterial,
}) {
  const showMaterialChip = Boolean(materialLabel) || filamentTypes.length > 0;
  const materialText = materialLabel || filamentTypes[0] || "Materiał";

  return (
    <div
      data-studio-file-profile
      className="w-[220px] rounded-2xl bg-zinc-900 text-zinc-100 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.4)] border border-zinc-700 space-y-3"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Z pliku 3MF</p>
        <p className="text-sm font-semibold mt-1">Zapisany profil druku</p>
      </div>

      {colours.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-zinc-500 mb-1">Kolory AMS</p>
          {editable ? (
            <p className="text-[10px] text-zinc-500 mb-2">Kliknij kolor, aby zamienić filament</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {colours.map((hex, idx) => {
              const swatch = (
                <span
                  title={hex}
                  className="relative flex h-7 w-7 items-center justify-center rounded-full border border-black/15 shadow-sm"
                  style={{ backgroundColor: hex }}
                >
                  {editable ? (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-950 text-[8px] font-bold text-zinc-100 ring-1 ring-zinc-600">
                      {idx + 1}
                    </span>
                  ) : null}
                </span>
              );
              if (!editable) {
                return <span key={`ams-slot-${idx}`}>{swatch}</span>;
              }
              return (
                <button
                  key={`ams-slot-${idx}`}
                  type="button"
                  data-ams-slot={idx}
                  aria-label={`Kolor AMS ${idx + 1}: ${hex}`}
                  title={`${hex} — kliknij, aby zmienić`}
                  onClick={() => onSelectSlot?.(idx)}
                  className="rounded-full transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                >
                  {swatch}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {showMaterialChip ? (
        <div>
          <p className="text-xs font-semibold text-zinc-500 mb-2">Materiał</p>
          {editable ? (
            <button
              type="button"
              data-ams-material
              onClick={() => onOpenMaterial?.()}
              className="inline-flex max-w-full items-center rounded-full bg-zinc-800 px-2.5 py-1 text-sm font-medium text-zinc-200 ring-1 ring-zinc-600 transition hover:bg-zinc-700 hover:ring-zinc-500"
            >
              <span className="truncate">{materialText}</span>
            </button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(filamentTypes.length ? filamentTypes : [materialText]).map((type) => (
                <span
                  key={type}
                  className="px-2.5 py-1 rounded-full bg-zinc-800 text-sm font-medium text-zinc-200"
                >
                  {type}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="text-sm text-zinc-300 leading-relaxed">
        {[
          nozzleSize ? `${nozzleSize} mm` : null,
          layerHeight ? `${Number(layerHeight).toFixed(2)} mm` : null,
          infill != null ? `${infill}%` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Parametry z projektu Bambu / Orca"}
      </div>
      {fromSliceInfo ? (
        <p data-slice-info-note className="text-xs text-zinc-500">
          Waga i czas ze slicera 3MF
        </p>
      ) : null}
    </div>
  );
}
