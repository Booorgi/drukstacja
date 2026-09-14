import React, { useState, useEffect } from "react";
import { cancelOrder, clearCart } from "../lib/ordersApi";
import { createCheckout } from "../lib/checkoutApi";
import { cartLineSubtitle, isShopSkuLine } from "../lib/orderLine";
import CheckoutAddressForm from "./CheckoutAddressForm";
import commercialPricing from "../lib/commercialPricing";

const { cartQuotedTotal } = commercialPricing;

function getDeletedIds() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("deleted_order_ids") || "[]");
  } catch {
    return [];
  }
}

function saveDeletedId(id) {
  if (typeof window === "undefined" || !id) return;
  try {
    const list = getDeletedIds();
    const strId = String(id);
    if (!list.includes(strId)) {
      list.push(strId);
      localStorage.setItem("deleted_order_ids", JSON.stringify(list));
    }
  } catch (e) {
    console.error("Błąd zapisu deleted_order_ids:", e);
  }
}

export default function CartDrawer({ isOpen, onClose, items = [], onRemoveItem }) {
  const [localItems, setLocalItems] = useState(() => {
    const deleted = getDeletedIds();
    return items.filter((item) => !deleted.includes(String(item.id)));
  });
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [step, setStep] = useState("cart");
  const [checkoutError, setCheckoutError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const deleted = getDeletedIds();
    setLocalItems(items.filter((item) => !deleted.includes(String(item.id))));
  }, [items]);

  useEffect(() => {
    if (!isOpen) {
      setStep("cart");
      setCheckoutError("");
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const total = cartQuotedTotal(localItems).toFixed(2);
  const belowMinimum = localItems.length === 0 || parseFloat(total) < 30.0;

  async function removeItem(id) {
    if (!id) return;
    setIsDeletingId(id);
    saveDeletedId(id);
    setLocalItems((prev) => prev.filter((item) => String(item.id) !== String(id)));
    if (onRemoveItem) {
      onRemoveItem(id);
    }
    try {
      await cancelOrder(id);
    } catch (err) {
      console.warn("Błąd bazy podczas usuwania:", err);
    } finally {
      setIsDeletingId(null);
    }
  }

  async function clearAll() {
    if (localItems.length === 0) return;
    const ids = localItems.map((it) => it.id);
    ids.forEach((id) => saveDeletedId(id));
    setLocalItems([]);
    if (onRemoveItem) {
      ids.forEach((id) => onRemoveItem(id));
    }
    try {
      await clearCart();
    } catch (err) {
      console.warn("Błąd czyszczenia koszyka w bazie:", err);
    }
  }

  async function handleCheckout(address) {
    setCheckoutError("");
    setSubmitting(true);
    try {
      const result = await createCheckout(address);
      if (!result?.url) {
        throw new Error("Brak adresu sesji Stripe.");
      }
      window.location.assign(result.url);
    } catch (err) {
      setCheckoutError(err?.message || "Nie udało się rozpocząć płatności.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between p-6 md:p-8 animate-in slide-in-from-right duration-200">
        <div className="min-h-0 flex-1 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#EF4444] block">
                {step === "address" ? "Kasa" : "Twoje zamówienie"}
              </span>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {step === "address" ? "Dostawa i płatność" : `Koszyk (${localItems.length})`}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {step === "cart" && localItems.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] font-bold text-red-500 hover:text-white hover:bg-red-500 transition px-2.5 py-1 rounded-lg border border-red-200 cursor-pointer"
                  title="Wyczyść wszystkie pozycje"
                >
                  Wyczyść koszyk
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center font-bold text-sm transition cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {step === "address" ? (
            <div className="overflow-y-auto pr-1 scrollbar-thin">
              <div className="mb-4 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <div className="flex justify-between font-semibold text-slate-600">
                  <span>Produkty</span>
                  <span>{total} PLN</span>
                </div>
                <div className="flex justify-between text-slate-400 mt-1">
                  <span>Wysyłka (placeholder)</span>
                  <span>0.00 PLN</span>
                </div>
              </div>
              <CheckoutAddressForm
                onSubmit={handleCheckout}
                submitting={submitting}
                error={checkoutError}
              />
              <button
                type="button"
                onClick={() => {
                  setStep("cart");
                  setCheckoutError("");
                }}
                className="w-full mt-3 text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                ← Wróć do koszyka
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              {localItems.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-sm space-y-2">
                  <div className="text-3xl">🛒</div>
                  <p className="font-semibold text-slate-600">Twój koszyk jest obecnie pusty.</p>
                  <p className="text-xs text-slate-400">Dodaj wyceniony model 3D, brelok albo produkt ze sklepu.</p>
                </div>
              ) : (
                localItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 flex items-center justify-between transition-all gap-3"
                  >
                    <div className="max-w-[210px] min-w-0">
                      {isShopSkuLine(item) && (
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#EF4444] block mb-0.5">
                          Sklep
                        </span>
                      )}
                      <span className="text-xs font-bold text-slate-900 block truncate" title={item.file_name}>
                        {item.file_name}
                      </span>
                      <span
                        className="text-[11px] text-slate-500 block truncate mt-0.5"
                        title={cartLineSubtitle(item)}
                      >
                        {cartLineSubtitle(item)}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">
                        Ilość: {item.quantity} szt.
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-black text-slate-900" data-cart-line-price>
                        {parseFloat(item.total_price || 0).toFixed(2)} zł
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(item.id);
                        }}
                        disabled={isDeletingId === item.id}
                        title="Usuń z koszyka"
                        className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 flex items-center justify-center transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95 disabled:opacity-40"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {step === "cart" && (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            {localItems.length > 0 && parseFloat(total) < 30.00 && (
              <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3 text-amber-900 text-xs flex items-start gap-2.5">
                <span className="text-amber-500 text-base leading-none mt-0.5">⚠️</span>
                <div className="space-y-0.5">
                  <div className="font-bold">Minimalna wartość zamówienia: 30.00 PLN</div>
                  <div className="text-[11px] text-amber-700 leading-snug">
                    Brakuje jeszcze <span className="font-bold text-amber-900">{(30.00 - parseFloat(total)).toFixed(2)} zł</span>, aby przejść do płatności. Zwiększ liczbę sztuk w modelu lub dodaj dodatkowy detal.
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-baseline">
              <span className="text-sm font-semibold text-slate-500">Razem do zapłaty:</span>
              <span className="text-2xl font-black text-slate-900" data-cart-total>
                {total} PLN
              </span>
            </div>
            {localItems.length > 0 ? (
              <p className="text-[11px] text-slate-400 -mt-2" data-vat-mode="quoted-as-shown">
                Ceny jak w konfiguratorze — bez doliczania VAT drugi raz.
              </p>
            ) : null}

            <button
              type="button"
              disabled={belowMinimum}
              onClick={() => setStep("address")}
              className={`w-full py-4 rounded-full font-bold text-xs uppercase tracking-wider transition ${
                belowMinimum
                  ? "bg-slate-200 text-slate-500 cursor-not-allowed shadow-none"
                  : "bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-lg shadow-red-500/25 cursor-pointer"
              }`}
            >
              {localItems.length === 0
                ? "Koszyk jest pusty"
                : parseFloat(total) < 30.00
                ? `Min. zamówienie: 30.00 PLN (brakuje ${(30.00 - parseFloat(total)).toFixed(2)} zł)`
                : "Przejdź do kasy →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
