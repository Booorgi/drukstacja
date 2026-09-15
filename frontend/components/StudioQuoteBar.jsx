import React from "react";

function formatShortfall(value) {
  return String(value ?? "").replace(".", ",");
}

/**
 * Sticky quote bar: price + quantity + CTA.
 * Shares the studio surface color and radius so it reads as the stage floor,
 * lifted by a light shadow instead of a contrasting white strip.
 */
export default function StudioQuoteBar({
  isRfq = false,
  hasModel = false,
  isAnalyzing = false,
  isReslicing = false,
  isBelowMoq = false,
  diffToMoq,
  isOversized = false,
  onFitToBed,
  totalPrice,
  quantity,
  onDecreaseQuantity,
  onIncreaseQuantity,
  onBrowse,
  onAddToCart,
  addingToCart = false,
  printTime,
  filamentWeight,
  filamentLength,
  engineerReview = false,
  onEngineerReviewChange,
}) {
  const quoteState = isRfq ? "rfq" : hasModel ? "quoted" : isAnalyzing ? "analyzing" : "empty";
  const showQuantity = hasModel && !isRfq;
  const cartBlocked = !hasModel || addingToCart || isAnalyzing || isOversized || isBelowMoq;
  const showEngineerBox = hasModel && !isRfq && typeof onEngineerReviewChange === "function";

  return (
    <div
      data-studio-quote-bar
      data-oversize={isOversized && hasModel ? "true" : "false"}
      data-below-moq={isBelowMoq && hasModel ? "true" : "false"}
      className="sticky bottom-0 z-40 px-3 pb-2 pt-1 sm:px-4"
    >
      <div
        data-quote-state={quoteState}
        data-quote-surface="studio"
        data-quantity-visible={showQuantity ? "true" : "false"}
        data-oversize={isOversized && hasModel ? "true" : "false"}
        className="relative z-30 mx-auto flex max-w-[1400px] flex-col gap-2 rounded-2xl bg-zinc-900/95 px-3 py-2.5 shadow-[0_-10px_28px_rgba(0,0,0,0.35)] ring-1 ring-zinc-700 backdrop-blur-md"
      >
        {isRfq ? (
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Status
            </span>
            <span className="text-sm font-semibold text-zinc-100">Wycena inżynierska</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                <div className="flex min-w-0 items-baseline gap-1.5" aria-live="polite">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Razem
                  </span>
                  {hasModel ? (
                    <>
                      <span
                        data-quote-total
                        className="text-[22px] sm:text-2xl font-bold tracking-tight text-zinc-50 tabular-nums leading-none"
                      >
                        {isReslicing ? "—" : totalPrice}
                      </span>
                      <span className="text-xs font-medium text-zinc-400">PLN</span>
                      {isReslicing ? (
                        <span className="text-[11px] text-zinc-500">przeliczam…</span>
                      ) : null}
                    </>
                  ) : isAnalyzing ? (
                    <>
                      <span
                        className="inline-block h-6 w-16 animate-pulse rounded-md bg-zinc-700"
                        aria-hidden
                      />
                      <span className="text-[11px] text-zinc-500">Analizuję…</span>
                    </>
                  ) : (
                    <span className="truncate text-sm font-medium text-zinc-500">
                      — po wgraniu modelu
                    </span>
                  )}
                </div>
                {isOversized && hasModel ? (
                  <p
                    data-print-bed-warning
                    className="min-w-0 text-[11px] font-semibold leading-snug text-red-400"
                  >
                    Model przekracza stół roboczy 256 × 256 × 256 mm. Zmniejsz skalę, aby dodać do koszyka.
                  </p>
                ) : (
                  <>
                    {isBelowMoq && hasModel ? (
                      <span
                        data-moq-shortfall
                        className="min-w-0 text-[11px] font-semibold leading-snug text-amber-300"
                      >
                        Brakuje {formatShortfall(diffToMoq)} zł do minimalnego zamówienia
                      </span>
                    ) : null}
                    {hasModel ? (
                      <div className="hidden items-center gap-3 text-[11px] text-zinc-400 md:flex">
                        {printTime ? <span>{printTime}</span> : null}
                        {filamentWeight ? <span>{filamentWeight}</span> : null}
                        {filamentLength ? <span>{filamentLength}</span> : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {showQuantity && !isOversized ? (
                  <div
                    data-quantity-control
                    className="flex items-center rounded-full bg-zinc-800 ring-1 ring-zinc-700 px-1"
                  >
                    <button
                      type="button"
                      onClick={onDecreaseQuantity}
                      aria-label="Zmniejsz ilość"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-zinc-100 hover:bg-zinc-700"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-xs font-semibold text-zinc-100">{quantity}</span>
                    <button
                      type="button"
                      onClick={onIncreaseQuantity}
                      aria-label="Zwiększ ilość"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-zinc-100 hover:bg-zinc-700"
                    >
                      +
                    </button>
                  </div>
                ) : null}
                {isOversized && hasModel && onFitToBed ? (
                  <button
                    type="button"
                    data-fit-to-bed
                    onClick={onFitToBed}
                    className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 ring-1 ring-white/10 transition hover:bg-white"
                  >
                    Dopasuj do stołu
                  </button>
                ) : null}
                {!hasModel && !isAnalyzing ? (
                  <button
                    type="button"
                    onClick={onBrowse}
                    className="rounded-full bg-[#F97316] px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-[#EA580C]"
                  >
                    Wybierz plik
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={cartBlocked}
                    title={
                      isOversized
                        ? "Model większy niż stół 256 × 256 × 256 mm — zmniejsz skalę"
                        : isBelowMoq
                        ? `Minimalne zamówienie 30 zł — brakuje ${formatShortfall(diffToMoq)} zł`
                        : undefined
                    }
                    onClick={onAddToCart}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      cartBlocked
                        ? "cursor-not-allowed bg-zinc-700 text-zinc-400"
                        : "cursor-pointer bg-[#F97316] text-zinc-950 hover:bg-[#EA580C]"
                    }`}
                  >
                    {addingToCart ? "Zapisuję…" : isAnalyzing ? "Analizuję…" : "Do koszyka"}
                  </button>
                )}
              </div>
            </div>

            {showEngineerBox ? (
              <label
                data-engineer-review
                className="flex cursor-pointer items-start gap-2 rounded-xl bg-zinc-800/80 px-3 py-2 ring-1 ring-zinc-700"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#F97316]"
                  checked={engineerReview}
                  onChange={(e) => onEngineerReviewChange(e.target.checked)}
                />
                <span className="text-[11px] leading-snug text-zinc-300">
                  Nie masz pewności? Zaznacz darmową weryfikację przez inżyniera przed startem druku
                </span>
              </label>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
