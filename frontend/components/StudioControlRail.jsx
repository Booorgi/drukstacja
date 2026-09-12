import React from "react";

/**
 * Left-edge control rail for Materiał / Kolor / Parametry.
 * Empty state stays visually secondary so the dropzone keeps focus.
 *
 * On md+ the rail is absolutely positioned in the stage. A bottom inset
 * matching --studio-quote-bar-clearance keeps the pill above the sticky
 * quote bar instead of centering through it.
 */
export default function StudioControlRail({
  empty = false,
  framed = true,
  children,
  className = "",
}) {
  return (
    <aside
      aria-label="Materiał, kolor, parametry i skala modelu"
      aria-describedby={empty ? "studio-control-rail-hint" : undefined}
      data-studio-control-rail
      data-empty={empty ? "true" : "false"}
      className={`relative z-50 flex justify-center px-4 pt-2 md:pointer-events-none md:absolute md:left-3 md:top-3 md:bottom-[var(--studio-quote-bar-clearance)] md:max-h-full md:items-center md:px-0 md:pt-0 ${className}`}
    >
      <div
        data-studio-control-rail-frame
        className={`md:pointer-events-auto flex max-h-full flex-col items-center gap-2 overflow-y-auto transition ${
          framed
            ? `rounded-2xl px-3 py-2 ring-1 md:px-2.5 md:py-3 ${
                empty
                  ? "bg-white/35 ring-black/5"
                  : "bg-white/80 shadow-sm ring-black/10"
              }`
            : ""
        } ${empty ? "opacity-50" : "opacity-100"}`}
      >
        {empty ? (
          <p
            id="studio-control-rail-hint"
            className="max-w-[104px] text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500"
          >
            Najpierw wgraj model
          </p>
        ) : null}
        <div className="flex flex-row items-center gap-3 md:flex-col md:gap-2.5">{children}</div>
      </div>
    </aside>
  );
}
