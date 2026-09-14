import React from "react";

function isLightHex(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 220;
}

function isActiveColor(color, value) {
  return String(color?.hex || "").toLowerCase() === String(value || "").toLowerCase();
}

/**
 * Large-swatch filament color picker. Used as a mobile bottom sheet and a
 * desktop popover so the 48px Kolor wheel stays a visual affordance only.
 */
export default function StudioColorPicker({
  colors = [],
  value,
  onSelect,
  materialName,
  surface = "popover",
}) {
  const selected = colors.find((c) => isActiveColor(c, value)) || colors[0];

  return (
    <div
      data-studio-color-picker
      data-studio-color-picker-surface={surface}
      role="dialog"
      aria-label="Wybierz kolor filamentu"
      className="w-full rounded-2xl bg-white text-neutral-900 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] border border-black/10 md:w-[280px]"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200 md:hidden" aria-hidden />
      <div className="mb-3">
        <p className="text-base font-semibold">Kolor filamentu</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {selected?.name || "Wybierz kolor"}
          {materialName ? ` · ${materialName}` : ""}
        </p>
      </div>

      <div className="grid max-h-[min(52vh,380px)] grid-cols-4 gap-2 overflow-y-auto overscroll-contain pr-0.5">
        {colors.map((color) => {
          const active = isActiveColor(color, value);
          const fill = color.hex || "#d4d4d4";
          const light = isLightHex(fill);
          return (
            <button
              key={color.id || color.hex}
              type="button"
              data-studio-color-swatch={fill}
              aria-label={color.name || fill}
              aria-pressed={active}
              onClick={() => onSelect?.(color)}
              className={`flex min-h-[72px] min-w-[44px] flex-col items-center justify-start gap-1 rounded-xl px-1 py-1.5 transition ${
                active ? "bg-neutral-100" : "hover:bg-neutral-50"
              }`}
            >
              <span
                className={`relative flex h-12 w-12 items-center justify-center rounded-full ${
                  active ? "ring-2 ring-[#111111] ring-offset-2" : "ring-1 ring-black/10"
                } ${light ? "ring-neutral-300" : ""}`}
                style={
                  color.gradient
                    ? { backgroundImage: color.gradient }
                    : { backgroundColor: fill }
                }
              >
                {active ? (
                  <span
                    className={`text-sm font-bold ${light ? "text-neutral-900" : "text-white"}`}
                    aria-hidden
                  >
                    ✓
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-center text-[10px] font-medium leading-tight text-neutral-700">
                {color.name || fill}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
