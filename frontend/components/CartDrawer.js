import React from "react";

export default function CartDrawer({ isOpen, onClose, items, onRemoveItem }) {
  if (!isOpen) return null;

  const totalSum = items.reduce((acc, item) => acc + Number(item.total_price), 0).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm transition-opacity">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#0E1524] border-l border-[#24324A] text-[#F8FAFC] shadow-2xl flex flex-col justify-between">
          
          {/* Nagłówek Drawera */}
          <div className="p-6 border-b border-[#24324A] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
              <h2 className="text-lg font-bold font-tech tracking-wide text-white">TWÓJ KOSZYK</h2>
            </div>
            <button
              onClick={onClose}
              className="text-[#94A3B8] hover:text-white font-mono text-sm px-2 py-1 rounded-lg border border-transparent hover:border-[#24324A] transition"
            >
              ✕ ZAMKNIJ
            </button>
          </div>

          {/* Lista pozycji w koszyku */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#94A3B8] font-mono text-xs">
                <span>Twój koszyk jest obecnie pusty</span>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-[#161F30] border border-[#24324A] flex flex-col gap-2 relative group"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-tech font-bold text-sm text-white truncate max-w-[200px]">
                      {item.file_name}
                    </span>
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="text-[#94A3B8] hover:text-red-400 text-xs font-mono transition"
                      title="Usuń pozycję"
                    >
                      Usuń
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[#94A3B8]">
                    <span>Materiał: <strong className="text-white">{item.material}</strong></span>
                    <span>Warstwa: <strong className="text-white">{item.layer_height}</strong></span>
                    <span>Wypełnienie: <strong className="text-white">{item.infill}%</strong></span>
                    <span>Ilość: <strong className="text-white">{item.quantity} szt.</strong></span>
                  </div>

                  <div className="pt-2 border-t border-[#24324A] flex justify-between items-baseline mt-1 font-mono">
                    <span className="text-[10px] text-[#94A3B8] uppercase">Wartość:</span>
                    <span className="text-[#00E5FF] font-bold text-sm">{Number(item.total_price).toFixed(2)} PLN</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Podsumowanie i Przejście do Kasy */}
          <div className="p-6 border-t border-[#24324A] bg-[#0B0F17]/60 space-y-4">
            <div className="flex justify-between items-baseline font-mono">
              <span className="text-xs uppercase text-[#94A3B8]">Suma do zapłaty:</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-[#00E5FF]">{totalSum}</span>
                <span className="text-xs text-[#94A3B8]">PLN</span>
              </div>
            </div>

            <button
              disabled={items.length === 0}
              onClick={() => alert("Kierowanie do bramki płatności Stripe / Przelewy24...")}
              className="w-full py-3.5 bg-gradient-to-r from-[#00E5FF] to-[#2563EB] text-[#0B0F17] font-bold text-xs uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.25)] hover:opacity-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Przejdź do kasy
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}