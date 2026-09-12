import React from "react";

/**
 * Sticky quote bar: price + quantity + CTA.
 * Empty / analyzing states stay secondary so upload remains the focus.
 */
export default function StudioQuoteBar({
  isRfq = false,
  hasModel = false,
  isAnalyzing = false,
  isReslicing = false,
  isBelowMoq = false,
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
}) {
  const quoteState = isRfq ? "rfq" : hasModel ? "quoted" : isAnalyzing ? "analyzing" : "empty";
  const showQuantity = hasModel && !isRfq;

  return (
    <div className="sticky bottom-0 z-40 px-3 pb-2 pt-1 sm:px-4">
      <div
        data-quote-state={quoteState}
        data-quantity-visible={showQuantity ? "true" : "false"}
        className="relative z-30 mx-auto flex max-w-[1400px] items-center justify-between gap-3 rounded-full bg-white/95 px-3 py-1.5 shadow-sm ring-1 ring-black/5 md:ml-[108px] lg:mr-[300px]"
      >
        {isRfq ? (
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Status
            </span>
            <span className="text-sm font-semibold text-neutral-900">Wycena inżynierska</span>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-3 sm:gap-5">
              <div className="flex items-baseline gap-1.5" aria-live="polite">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Razem
                </span>
                {hasModel ? (
                  <>
                    <span className="text-lg font-semibold tracking-tight text-neutral-900">
                      {totalPrice}
                    </span>
                    <span className="text-xs font-medium text-neutral-600">PLN</span>
                    {isReslicing ? (
                      <span className="text-[11px] text-neutral-500">przeliczam…</span>
                    ) : null}
                  </>
                ) : isAnalyzing ? (
                  <>
                    <span
                      className="inline-block h-5 w-16 animate-pulse rounded-md bg-neutral-200"
                      aria-hidden
                    />
                    <span className="text-[11px] text-neutral-500">Analizuję…</span>
                  </>
                ) : (
                  <span className="truncate text-sm font-medium text-neutral-500">
                    — po wgraniu modelu
                  </span>
                )}
              </div>
              {isBelowMoq && hasModel ? (
                <span className="hidden text-[11px] text-neutral-500 sm:inline">min. 30 zł</span>
              ) : null}
              {hasModel ? (
                <div className="hidden items-center gap-3 text-[11px] text-neutral-600 md:flex">
                  {printTime ? <span>{printTime}</span> : null}
                  {filamentWeight ? <span>{filamentWeight}</span> : null}
                  {filamentLength ? <span>{filamentLength}</span> : null}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {showQuantity ? (
                <div
                  data-quantity-control
                  className="flex items-center rounded-full bg-neutral-100 px-1"
                >
                  <button
                    type="button"
                    onClick={onDecreaseQuantity}
                    aria-label="Zmniejsz ilość"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-neutral-800 hover:bg-white"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-xs font-semibold">{quantity}</span>
                  <button
                    type="button"
                    onClick={onIncreaseQuantity}
                    aria-label="Zwiększ ilość"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-neutral-800 hover:bg-white"
                  >
                    +
                  </button>
                </div>
              ) : null}
              {!hasModel && !isAnalyzing ? (
                <button
                  type="button"
                  onClick={onBrowse}
                  className="rounded-full bg-[#111111] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                >
                  Wybierz plik
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!hasModel || addingToCart || isAnalyzing}
                  onClick={onAddToCart}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    !hasModel || addingToCart || isAnalyzing
                      ? "cursor-not-allowed bg-neutral-400 text-white/70"
                      : "cursor-pointer bg-[#111111] text-white hover:bg-black"
                  }`}
                >
                  {addingToCart ? "Zapisuję…" : isAnalyzing ? "Analizuję…" : "Do koszyka"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
