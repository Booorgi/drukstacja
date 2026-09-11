import React from "react";

export default function StudioFileProfile({
  colours = [],
  filamentTypes = [],
  layerHeight,
  nozzleSize,
  infill,
}) {
  return (
    <div className="w-[220px] rounded-2xl bg-white text-neutral-900 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.16)] border border-black/10 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Z pliku 3MF</p>
        <p className="text-sm font-semibold mt-1">Zapisany profil druku</p>
      </div>

      {colours.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-neutral-500 mb-2">Kolory AMS</p>
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
          <p className="text-xs font-semibold text-neutral-500 mb-2">Materiały</p>
          <div className="flex flex-wrap gap-1.5">
            {filamentTypes.map((type) => (
              <span key={type} className="px-2.5 py-1 rounded-full bg-neutral-100 text-sm font-medium">
                {type}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="text-sm text-neutral-700 leading-relaxed">
        {[
          nozzleSize ? `${nozzleSize} mm` : null,
          layerHeight ? `${Number(layerHeight).toFixed(2)} mm` : null,
          infill != null ? `${infill}%` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Parametry z projektu Bambu / Orca"}
      </div>
    </div>
  );
}
