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
  onOpen,
  size = 92,
  label,
  caption,
  className = "",
}) {
  const n = items.length;
  if (n === 0) return null;

  const cx = 50;
  const cy = 50;
  const r = 48;
  const inner = 16;
  const step = 360 / n;
  const selected = items.find(
    (it) =>
      String(it.id) === String(value) ||
      String(it.value) === String(value) ||
      String(it.hex || "").toLowerCase() === String(value || "").toLowerCase() ||
      (it.value != null && value != null && Number(it.value) === Number(value))
  );

  const subtitle = caption ?? selected?.name;

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div
        className="relative rounded-full bg-white shadow-[0_8px_28px_rgba(0,0,0,0.18)] ring-1 ring-black/5 cursor-pointer"
        style={{ width: size, height: size }}
        onClick={onOpen ? () => onOpen() : undefined}
      >
        <svg viewBox="0 0 100 100" className={`w-full h-full ${onOpen ? "pointer-events-none" : ""}`}>
          {items.map((item, i) => {
            const start = i * step;
            const end = (i + 1) * step;
            const isOn =
              String(item.id) === String(value) ||
              String(item.value) === String(value) ||
              String(item.hex || "").toLowerCase() === String(value || "").toLowerCase() ||
              (item.value != null && value != null && Number(item.value) === Number(value));
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
                strokeWidth={isOn || onOpen ? 1.4 : 0.6}
                className={onOpen ? "" : "cursor-pointer"}
                onClick={onOpen ? undefined : () => onChange?.(item)}
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
        <div className="text-center max-w-[96px]">
          <span className="text-[12px] font-semibold text-neutral-900 block leading-tight">
            {label}
          </span>
          {subtitle ? (
            <span className="text-[10px] text-neutral-600 block mt-0.5 leading-tight">
              {subtitle}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
