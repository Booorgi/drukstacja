import React from "react";
import { supabase } from "../lib/supabaseClient";

export default function CartDrawer({ isOpen, onClose, items, onRemoveItem }) {
  if (!isOpen) return null;

  const total = items
    .reduce((acc, item) => acc + (parseFloat(item.total_price) || 0), 0)
    .toFixed(2);

  async function removeItem(id) {
    await supabase.from("orders").delete().eq("id", id);
    if (onRemoveItem) onRemoveItem();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between p-6 md:p-8 animate-in slide-in-from-right duration-200">
        
        {/* Nagłówek */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#EF4444] block">
                Twoje zamówienie
              </span>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Koszyk</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold text-sm transition"
            >
              ✕
            </button>
          </div>

          {/* Lista pozycji */}
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {items.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                Twój koszyk jest obecnie pusty.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between"
                >
                  <div className="max-w-[210px]">
                    <span className="text-xs font-bold text-slate-900 block truncate">
                      {item.file_name}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {item.material} • Ilość: {item.quantity} szt.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-slate-900">
                      {parseFloat(item.total_price).toFixed(2)} zł
                    </span>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-slate-400 hover:text-[#EF4444] text-xs font-bold transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Podsumowanie i Kasa */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-semibold text-slate-500">Razem do zapłaty:</span>
            <span className="text-2xl font-black text-slate-900">{total} PLN</span>
          </div>

          <button
            disabled={items.length === 0}
            onClick={() => alert("Przekierowanie do płatności...")}
            className="w-full py-4 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/25 transition disabled:opacity-40"
          >
            Przejdź do kasy →
          </button>
        </div>
      </div>
    </div>
  );
}