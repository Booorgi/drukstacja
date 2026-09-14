import React, { useRef, useState } from "react";

/**
 * Empty-state upload target for the print quote studio.
 * Click and drag-and-drop both forward the selected File to the parent.
 */
export default function StudioEmptyDropzone({ onBrowse, onFileSelected }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepth = useRef(0);

  function resetDrag() {
    dragDepth.current = 0;
    setIsDragActive(false);
  }

  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setIsDragActive(true);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragActive) setIsDragActive(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) resetDrag();
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    resetDrag();
    const file = e.dataTransfer?.files?.[0];
    if (file) onFileSelected(file);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onBrowse();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Wybierz plik modelu do wyceny"
      onClick={onBrowse}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group mx-4 flex w-full max-w-[480px] min-h-[300px] cursor-pointer flex-col items-center justify-center gap-4 rounded-[28px] border-2 border-dashed px-8 py-10 text-center transition duration-200 ${
        isDragActive
          ? "scale-[1.01] border-[#F97316] bg-zinc-900 shadow-lg shadow-black/40 ring-4 ring-[#F97316]/15"
          : "border-zinc-600 bg-zinc-900/80 shadow-sm hover:border-[#F97316] hover:bg-zinc-900 hover:shadow-md hover:shadow-black/30 hover:ring-4 hover:ring-[#F97316]/10"
      }`}
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition ${
          isDragActive
            ? "border-[#F97316] bg-[#F97316] text-zinc-950"
            : "border-zinc-600 bg-zinc-800 text-zinc-200 group-hover:border-[#F97316] group-hover:bg-[#F97316] group-hover:text-zinc-950"
        }`}
        aria-hidden
      >
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16.5V18a2 2 0 002 2h12a2 2 0 002-2v-1.5" />
        </svg>
      </span>

      <div className="space-y-1">
        <p className="text-[17px] font-semibold tracking-tight text-zinc-50">
          {isDragActive ? "Upuść, aby wgrać model" : "Upuść model tutaj"}
        </p>
        <p className="text-sm text-zinc-400">
          albo wybierz plik z dysku — .stl, .step, .obj, .3mf, PCB, 2D
        </p>
      </div>

      <span className="rounded-full bg-[#F97316] px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm transition group-hover:bg-[#EA580C]">
        Wybierz plik
      </span>
    </div>
  );
}
