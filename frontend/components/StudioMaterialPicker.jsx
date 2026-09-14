import React, { useState } from "react";

const GROUP_LABEL = {
  standard: "Standard",
  tech: "Techniczny",
  composite: "Kompozyt",
  flex: "Elastyczny",
};

function swatchStyle(item) {
  const fill = item?.hex || item?.colors?.[0]?.hex || "#d4d4d4";
  const gradient = item?.gradient || item?.colors?.[0]?.gradient;
  return gradient
    ? { backgroundImage: gradient }
    : { backgroundColor: fill };
}

/**
 * Materiał: najpierw rodzina (PLA, PETG, ABS…), potem rodzaj
 * (np. Standard / Wood / Galaxy) gdy rodzina ma podtypy.
 * Ceny zł/kg nie są pokazywane.
 */
export default function StudioMaterialPicker({
  families = [],
  selectedFamilyId,
  selectedSubtypeId,
  onSelectSubtype,
  surface = "sheet",
}) {
  const selectedFamily =
    families.find((f) => String(f.id) === String(selectedFamilyId)) || families[0];
  const [step, setStep] = useState("family");
  const [pendingFamily, setPendingFamily] = useState(null);
  const subtypeFamily = pendingFamily || selectedFamily;
  const showingSubtypes = step === "subtype" && (subtypeFamily?.subtypes || []).length > 1;

  function handleFamilyClick(family) {
    const subtypes = family.subtypes || [];
    if (subtypes.length > 1) {
      setPendingFamily(family);
      setStep("subtype");
      return;
    }
    onSelectSubtype?.(subtypes[0], family);
  }

  function handleSubtypeClick(subtype) {
    onSelectSubtype?.(subtype, subtypeFamily);
  }

  const title = showingSubtypes
    ? subtypeFamily?.pickerTitle || `Wybierz rodzaj ${subtypeFamily?.name || ""}`
    : "Materiał";
  const subtitle = showingSubtypes
    ? subtypeFamily?.subtypes?.find((s) => s.id === selectedSubtypeId)?.label ||
      "Wybierz rodzaj"
    : selectedFamily?.name || "Wybierz materiał";

  return (
    <div
      data-studio-material-picker
      data-studio-material-picker-surface={surface}
      data-studio-material-step={showingSubtypes ? "subtype" : "family"}
      role="dialog"
      aria-label={title}
      className="w-full rounded-2xl bg-white text-neutral-900 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] border border-black/10 md:w-[300px]"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200 md:hidden" aria-hidden />
      <div className="mb-3 flex items-start gap-2">
        {showingSubtypes ? (
          <button
            type="button"
            data-studio-material-back
            onClick={() => {
              setStep("family");
              setPendingFamily(null);
            }}
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            aria-label="Wróć do materiałów"
          >
            ←
          </button>
        ) : null}
        <div className="min-w-0">
          <p className="text-base font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>
        </div>
      </div>

      {showingSubtypes ? (
        <div className="flex max-h-[min(52vh,380px)] flex-col gap-1.5 overflow-y-auto overscroll-contain">
          {(subtypeFamily.subtypes || []).map((sub) => {
            const active = String(sub.id) === String(selectedSubtypeId);
            const swatch = sub.colors?.[0] || {};
            return (
              <button
                key={sub.id}
                type="button"
                data-studio-material-subtype={sub.id}
                aria-pressed={active}
                onClick={() => handleSubtypeClick(sub)}
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
                  style={swatchStyle(swatch)}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-tight">
                    {sub.label}
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-[11px] leading-tight ${
                      active ? "text-white/65" : "text-neutral-500"
                    }`}
                  >
                    {sub.colors?.length || 0} kolorów
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
      ) : (
        <div className="flex max-h-[min(52vh,380px)] flex-col gap-1.5 overflow-y-auto overscroll-contain">
          {families.map((fam) => {
            const active = String(fam.id) === String(selectedFamilyId);
            const first = fam.subtypes?.[0]?.colors?.[0] || {};
            const groupLabel = GROUP_LABEL[fam.group] || fam.group;
            const kinds =
              (fam.subtypes || []).length > 1
                ? `${fam.subtypes.length} rodzaje`
                : fam.subtypes?.[0]?.label;
            return (
              <button
                key={fam.id}
                type="button"
                data-studio-material-option={fam.id}
                aria-pressed={active}
                onClick={() => handleFamilyClick(fam)}
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
                  style={swatchStyle(first)}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-tight">{fam.name}</span>
                  <span
                    className={`mt-0.5 block truncate text-[11px] leading-tight ${
                      active ? "text-white/65" : "text-neutral-500"
                    }`}
                  >
                    {[groupLabel, kinds].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {(fam.subtypes || []).length > 1 ? (
                  <span className={`shrink-0 text-sm ${active ? "text-white/70" : "text-neutral-400"}`} aria-hidden>
                    →
                  </span>
                ) : active ? (
                  <span className="shrink-0 text-sm font-bold" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
