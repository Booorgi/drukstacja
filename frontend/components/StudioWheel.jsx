import React from "react";

function polar(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function slicePath(cx, cy, r, start, end) {
  const large = end - start > 180 ? 1 : 0;
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/**
 * Okrągła paleta w stylu konfiguratora produktowego (koło z klinami kolorów).
 */
export default function StudioWheel({
  items = [],
  value,
  onChange,
  size = 92,
  label,
  className = "",
}) {
  const n = items.length;
  if (n === 0) return null;

  const cx = 50;
  const cy = 50;
  const r = 48;
  const inner = 16;
  const step = 360 / n;
  const selected = items.find((it) => String(it.id) === String(value) || String(it.value) === String(value));

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div
        className="relative rounded-full bg-white shadow-[0_8px_28px_rgba(0,0,0,0.18)] ring-1 ring-black/5"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {items.map((item, i) => {
            const start = i * step;
            const end = (i + 1) * step;
            const isOn =
              String(item.id) === String(value) ||
              String(item.value) === String(value) ||
              String(item.hex || "").toLowerCase() === String(value || "").toLowerCase();
            const fill = item.hex || item.color || "#d4d4d4";
            const isLight = ["#ffffff", "#f5f5f5", "#f8f9fa", "#fff", "#eeeeee"].includes(
              String(fill).toLowerCase()
            );
            return (
              <path
                key={item.id || item.hex || i}
                d={slicePath(cx, cy, r, start, end)}
                fill={fill}
                stroke={isOn ? "#111111" : isLight ? "#d4d4d4" : "rgba(255,255,255,0.35)"}
                strokeWidth={isOn ? 2.2 : 0.6}
                className="cursor-pointer"
                onClick={() => onChange(item)}
              >
                <title>{item.name || item.label}</title>
              </path>
            );
          })}
          <circle cx={cx} cy={cy} r={inner} fill="#ffffff" />
          {selected?.hex ? (
            <circle cx={cx} cy={cy} r={inner - 4} fill={selected.hex} stroke="#e5e5e5" strokeWidth="0.8" />
          ) : (
            <circle cx={cx} cy={cy} r={3} fill="#111111" />
          )}
        </svg>
      </div>
      {label ? (
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-700/80">
          {label}
        </span>
      ) : null}
    </div>
  );
}
