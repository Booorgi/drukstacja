import React from "react";

export default function StudioFileProfile({
  colours = [],
  filamentTypes = [],
  layerHeight,
  nozzleSize,
  infill,
  fromSliceInfo = false,
}) {
  return (
    <div className="w-[220px] rounded-2xl bg-zinc-900 text-zinc-100 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.4)] border border-zinc-700 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Z pliku 3MF</p>
        <p className="text-sm font-semibold mt-1">Zapisany profil druku</p>
      </div>

      {colours.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-zinc-500 mb-2">Kolory AMS</p>
          <div className="flex flex-wrap gap-2">
            {colours.map((hex) => (
              <span
                key={hex}
                title={hex}
                className="w-7 h-7 rounded-full border border-black/15 shadow-sm"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {filamentTypes.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-zinc-500 mb-2">Materiały</p>
          <div className="flex flex-wrap gap-1.5">
            {filamentTypes.map((type) => (
              <span key={type} className="px-2.5 py-1 rounded-full bg-zinc-800 text-sm font-medium text-zinc-200">
                {type}
              </span>
            ))}
          </div>
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
        <p data-slice-info-note className="text-xs text-zinc-500">Waga i czas ze slicera 3MF</p>
      ) : null}
    </div>
  );
}
