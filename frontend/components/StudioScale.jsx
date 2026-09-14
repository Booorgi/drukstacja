import React from "react";
import printBed from "../lib/printBed";

const {
  PRINT_BED_MM,
  scaledDimensionsMm,
  isOverPrintBed,
  fitToPrintBedPercent,
} = printBed;

const PRESETS = [10, 25, 50, 100];

function formatMm(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (n >= 100) return `${Math.round(n)}`;
  return n.toFixed(1);
}

export default function StudioScale({
  scalePercent,
  setScalePercent,
  sourceDimensionsMm = [0, 0, 0],
  surface = "popover",
}) {
  const factor = scalePercent / 100;
  const scaled = scaledDimensionsMm(sourceDimensionsMm, factor);
  const oversized = isOverPrintBed(scaled);
  const fitPercent = fitToPrintBedPercent(sourceDimensionsMm);
  const canFit = oversized && fitPercent !== scalePercent && !isOverPrintBed(
    scaledDimensionsMm(sourceDimensionsMm, fitPercent / 100)
  );

  return (
    <div
      data-studio-scale
      data-studio-scale-surface={surface}
      data-oversize={oversized ? "true" : "false"}
      role="dialog"
      aria-label="Skala modelu"
      className="w-full rounded-2xl bg-white text-neutral-900 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] border border-black/10 space-y-4 md:w-[280px]"
    >
      <div className="mx-auto h-1 w-10 rounded-full bg-neutral-200 md:hidden" aria-hidden />
      <div>
        <p className="text-base font-semibold">Skala modelu</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          Jednostajnie XYZ — podgląd i wycena liczą się od tej skali.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => setScalePercent(pct)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
              scalePercent === pct
                ? "bg-[#111111] text-white"
                : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
            }`}
          >
            {pct}%
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm font-semibold text-neutral-800">Niestandardowa</span>
          <span className="text-sm font-semibold tabular-nums">{scalePercent}%</span>
        </div>
        <input
          type="range"
          min={5}
          max={200}
          step={1}
          value={scalePercent}
          onChange={(e) => setScalePercent(Number(e.target.value))}
          className="w-full accent-[#111111]"
          aria-label="Skala modelu w procentach"
        />
        <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
          <span>5%</span>
          <span>200%</span>
        </div>
      </div>

      <div
        className={`rounded-xl px-3 py-2 text-[12px] ${
          oversized ? "bg-red-50 text-red-800" : "bg-neutral-50 text-neutral-700"
        }`}
      >
        <p className={`font-semibold mb-0.5 ${oversized ? "text-red-900" : "text-neutral-800"}`}>
          Po skali
        </p>
        <p className="tabular-nums">
          {formatMm(scaled[0])} × {formatMm(scaled[1])} × {formatMm(scaled[2])} mm
        </p>
        <p className={`mt-1 text-[11px] ${oversized ? "text-red-700" : "text-neutral-500"}`}>
          Stół roboczy {PRINT_BED_MM} × {PRINT_BED_MM} × {PRINT_BED_MM} mm
        </p>
        {oversized ? (
          <p className="mt-1.5 text-[11px] font-semibold text-red-800">
            Nie mieści się na stole {PRINT_BED_MM} × {PRINT_BED_MM} × {PRINT_BED_MM} mm.
            Zmniejsz skalę, zanim dodasz model do koszyka.
          </p>
        ) : null}
      </div>

      {canFit ? (
        <button
          type="button"
          onClick={() => setScalePercent(fitPercent)}
          className="w-full rounded-full bg-[#111111] px-3 py-2 text-sm font-semibold text-white hover:bg-black"
        >
          Dopasuj do stołu ({fitPercent}%)
        </button>
      ) : null}
    </div>
  );
}
