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

function arcPath(cx, cy, r, start, end) {
  const large = end - start > 180 ? 1 : 0;
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function isSelected(item, value) {
  return (
    String(item.id) === String(value) ||
    String(item.value) === String(value) ||
    String(item.hex || "").toLowerCase() === String(value || "").toLowerCase() ||
    (item.value != null && value != null && Number(item.value) === Number(value))
  );
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
  const inner = 16;
  const step = 360 / n;
  const selected = items.find((it) => isSelected(it, value));
  const subtitle = caption ?? selected?.name;

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div
        className="relative cursor-pointer overflow-visible rounded-full bg-white shadow-[0_8px_28px_rgba(0,0,0,0.18)] ring-1 ring-black/5"
        style={{ width: size, height: size }}
        onClick={onOpen ? () => onOpen() : undefined}
      >
        <svg
          viewBox="0 0 100 100"
          className={`h-full w-full overflow-visible ${onOpen ? "pointer-events-none" : ""}`}
        >
          {items.map((item, i) => {
            const start = i * step;
            const end = (i + 1) * step;
            const isOn = isSelected(item, value);
            const fill = item.hex || item.color || "#d4d4d4";
            const isLight = ["#ffffff", "#f5f5f5", "#f8f9fa", "#fff", "#eeeeee"].includes(
              String(fill).toLowerCase()
            );
            return (
              <g key={item.id || item.hex || i}>
                <path
                  d={slicePath(cx, cy, 43, start, end)}
                  fill={fill}
                  stroke={isLight ? "#d4d4d4" : "rgba(255,255,255,0.45)"}
                  strokeWidth="0.6"
                  className={onOpen ? "" : "cursor-pointer"}
                  onClick={onOpen ? undefined : () => onChange?.(item)}
                >
                  <title>{item.name || item.label}</title>
                </path>
                {isOn ? (
                  <path
                    d={arcPath(cx, cy, 46.5, start + 1.2, end - 1.2)}
                    fill="none"
                    stroke="#111111"
                    strokeWidth="5.5"
                    strokeLinecap="butt"
                  />
                ) : null}
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={inner} fill="#ffffff" />
          {selected?.hex ? (
            <circle cx={cx} cy={cy} r={inner - 4} fill={selected.hex} stroke="#111111" strokeWidth="1.6" />
          ) : (
            <circle cx={cx} cy={cy} r={3} fill="#111111" />
          )}
        </svg>
      </div>
      {label ? (
        <div className="max-w-[80px] text-center">
          <span className="block text-[11px] font-semibold leading-tight text-neutral-900">
            {label}
          </span>
          {subtitle ? (
            <span className="mt-0.5 block text-[9px] leading-tight text-neutral-600">
              {subtitle}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
