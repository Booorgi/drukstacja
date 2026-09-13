import React from "react";
import { createPortal } from "react-dom";

/**
 * Mobile-only picker chrome. Portaled to document.body so sheets escape the
 * faded/overflowing studio rail and sit above the sticky navbar.
 */
export default function StudioMobileSheet({
  open,
  onClose,
  closeLabel,
  panelRef,
  children,
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="md:hidden" data-studio-mobile-sheet>
      <button
        type="button"
        aria-label={closeLabel}
        className="fixed inset-0 z-[85] bg-black/45"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="fixed inset-x-0 bottom-0 z-[90] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-h-[min(70vh,calc(100dvh-5.5rem))] max-w-sm overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
