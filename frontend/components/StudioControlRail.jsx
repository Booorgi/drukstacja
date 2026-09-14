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
  pickerOpen = false,
  children,
  className = "",
}) {
  return (
    <aside
      aria-label="Materiał, kolor, parametry i skala modelu"
      aria-describedby={empty ? "studio-control-rail-hint" : undefined}
      data-studio-control-rail
      data-empty={empty ? "true" : "false"}
      data-picker-open={pickerOpen ? "true" : "false"}
      className={`relative flex justify-center px-4 pt-2 md:absolute md:left-3 md:top-3 md:bottom-24 md:items-center md:px-0 md:pt-0 md:pointer-events-none ${
        pickerOpen ? "z-[86]" : "z-20"
      } ${className}`}
    >
      <div
        data-studio-control-rail-frame
        className={`flex flex-col items-center gap-1.5 transition ${
          framed
            ? `rounded-2xl px-3 py-2 ring-1 md:px-2 md:py-2.5 ${
                empty
                  ? "bg-zinc-900/55 ring-zinc-700/70"
                  : "bg-zinc-900/90 shadow-[0_12px_28px_rgba(0,0,0,0.35)] ring-zinc-700"
              }`
            : ""
        } ${empty ? "opacity-50" : "opacity-100"}`}
      >
        {empty ? (
          <p
            id="studio-control-rail-hint"
            className="max-w-[104px] text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
          >
            Najpierw wgraj model
          </p>
        ) : null}
        <div className="flex flex-row items-center gap-3 md:flex-col md:gap-1.5">{children}</div>
      </div>
    </aside>
  );
}
