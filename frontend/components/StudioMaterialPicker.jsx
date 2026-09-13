import React from "react";

const GROUP_LABEL = {
  standard: "Standard",
  tech: "Techniczny",
  composite: "Kompozyt",
  flex: "Elastyczny",
};

/**
 * Material list for the mobile Materiał sheet. Desktop keeps wheel-slice
 * selection; 42px slices are not usable on a phone.
 */
export default function StudioMaterialPicker({
  materials = [],
  value,
  onSelect,
  surface = "sheet",
}) {
  const selected = materials.find((m) => String(m.id) === String(value)) || materials[0];

  return (
    <div
      data-studio-material-picker
      data-studio-material-picker-surface={surface}
      role="dialog"
      aria-label="Wybierz materiał"
      className="w-full rounded-2xl bg-white text-neutral-900 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] border border-black/10"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200 md:hidden" aria-hidden />
      <div className="mb-3">
        <p className="text-base font-semibold">Materiał</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {selected?.name || "Wybierz materiał"}
          {selected?.badge ? ` · ${selected.badge}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {materials.map((mat) => {
          const active = String(mat.id) === String(value);
          const swatch = mat.colors?.[0]?.hex || mat.hex || "#d4d4d4";
          const groupLabel = GROUP_LABEL[mat.group] || mat.group;
          return (
            <button
              key={mat.id}
              type="button"
              data-studio-material-option={mat.id}
              aria-pressed={active}
              onClick={() => onSelect?.(mat)}
              className={`flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                active
                  ? "bg-[#111111] text-white"
                  : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
              }`}
            >
              <span
                className={`h-8 w-8 shrink-0 rounded-full ring-1 ${
                  active ? "ring-white/40" : "ring-black/10"
                }`}
                style={{ backgroundColor: swatch }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight">{mat.name}</span>
                <span
                  className={`mt-0.5 block truncate text-[11px] leading-tight ${
                    active ? "text-white/65" : "text-neutral-500"
                  }`}
                >
                  {[groupLabel, mat.badge].filter(Boolean).join(" · ")}
                </span>
              </span>
              {active ? (
                <span className="shrink-0 text-sm font-bold" aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
