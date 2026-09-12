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
      className={`group mx-4 flex w-full max-w-[460px] min-h-[280px] cursor-pointer flex-col items-center justify-center gap-4 rounded-[28px] border-2 border-dashed px-8 py-10 text-center transition duration-200 ${
        isDragActive
          ? "scale-[1.01] border-[#111111] bg-white shadow-lg shadow-black/10"
          : "border-neutral-400/80 bg-white/70 hover:border-neutral-800 hover:bg-white hover:shadow-md hover:shadow-black/10"
      }`}
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition ${
          isDragActive
            ? "border-[#111111] bg-[#111111] text-white"
            : "border-neutral-300 bg-white text-neutral-600 group-hover:border-neutral-800 group-hover:text-neutral-900"
        }`}
        aria-hidden
      >
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16.5V18a2 2 0 002 2h12a2 2 0 002-2v-1.5" />
        </svg>
      </span>

      <div className="space-y-1">
        <p className="text-[17px] font-semibold tracking-tight text-neutral-900">
          {isDragActive ? "Upuść, aby wgrać model" : "Upuść model tutaj"}
        </p>
        <p className="text-sm text-neutral-500">
          albo wybierz plik z dysku — .stl, .step, .obj, .3mf, PCB, 2D
        </p>
      </div>

      <span className="rounded-full bg-[#111111] px-4 py-2 text-sm font-semibold text-white shadow-sm transition group-hover:bg-black">
        Wybierz plik
      </span>
    </div>
  );
}
