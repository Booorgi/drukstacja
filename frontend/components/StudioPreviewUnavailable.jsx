import React from "react";
import { LARGE_3MF_NO_QUOTE_NO_PREVIEW_MSG } from "../lib/studioQuote";

/**
 * Status in the studio stage when a 3MF loaded (AMS / profile kept) but GLB/STL
 * preview cannot be built because the mesh is too large.
 */
export default function StudioPreviewUnavailable({ message, quoteReady = false }) {
  const text = String(message || LARGE_3MF_NO_QUOTE_NO_PREVIEW_MSG).trim();

  return (
    <div
      data-studio-preview-status="skipped"
      data-quote-ready={quoteReady ? "true" : "false"}
      role="status"
      className="mx-4 flex w-full max-w-[520px] min-h-[300px] flex-col items-center justify-center gap-4 rounded-[28px] border-2 border-dashed border-neutral-400 bg-white/90 px-8 py-10 text-center shadow-sm"
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-300 bg-neutral-50 text-neutral-700"
        aria-hidden
      >
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v9A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-9z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5l6 6m0-6l-6 6" />
        </svg>
      </span>

      <div className="space-y-2">
        <p className="text-[17px] font-semibold tracking-tight text-neutral-900">
          {quoteReady ? "Wycena gotowa — bez podglądu 3D" : "Plik wczytany — bez podglądu 3D"}
        </p>
        <p className="text-sm leading-relaxed text-neutral-600">{text}</p>
      </div>
    </div>
  );
}
