import React from "react";

/**
 * Left-edge control rail for Materiał / Kolor / Parametry.
 * Empty state stays visually secondary so the dropzone keeps focus.
 *
 * Desktop position lives in globals.css ([data-studio-control-rail]) so it
 * does not depend on Tailwind CDN emitting arbitrary var() utilities.
 * The rail is a child of .studio-stage; the quote bar is the next flex row.
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
      className={`relative z-20 flex justify-center px-4 pt-2 ${className}`}
    >
      <div
        data-studio-control-rail-frame
        className={`flex flex-col items-center gap-1.5 transition ${
          framed
            ? `rounded-2xl px-3 py-2 ring-1 md:px-2 md:py-2.5 ${
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
        <div className="flex flex-row items-center gap-3 md:flex-col md:gap-1.5">{children}</div>
      </div>
    </aside>
  );
}
