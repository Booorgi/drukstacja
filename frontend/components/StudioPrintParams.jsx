import React from "react";

function ParamRow({ label, children }) {
  return (
    <div>
      <p className="text-sm font-semibold text-neutral-800 mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
        disabled
          ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
          : active
          ? "bg-[#111111] text-white"
          : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function StudioPrintParams({
  nozzleSize,
  setNozzleSize,
  isPlaMaterial,
  layerHeight,
  setLayerHeight,
  layerHeightOptions = [],
  infill,
  setInfill,
  infillOptions = [10, 20, 40, 60, 100],
}) {
  return (
    <div className="w-[280px] rounded-2xl bg-white text-neutral-900 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] border border-black/10 space-y-4">
      <p className="text-base font-semibold">Parametry druku</p>

      <ParamRow label="Dysza">
        <Pill active={nozzleSize === 0.4} onClick={() => setNozzleSize(0.4)}>
          0.4 mm
        </Pill>
        <Pill
          active={nozzleSize === 0.2}
          disabled={!isPlaMaterial}
          onClick={() => setNozzleSize(0.2)}
        >
          0.2 mm
        </Pill>
      </ParamRow>

      <ParamRow label="Warstwa">
        {layerHeightOptions.map((opt) => (
          <Pill
            key={opt.val}
            active={Math.abs(layerHeight - opt.val) < 0.01}
            onClick={() => setLayerHeight(opt.val)}
          >
            {opt.label}
          </Pill>
        ))}
      </ParamRow>

      <ParamRow label="Wypełnienie">
        {infillOptions.map((pct) => (
          <Pill key={pct} active={infill === pct} onClick={() => setInfill(pct)}>
            {pct}%
          </Pill>
        ))}
      </ParamRow>
    </div>
  );
}
