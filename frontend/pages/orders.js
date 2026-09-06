import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const STATUS_STEPS = [
  { key: "in_cart", label: "W koszyku", step: 0 },
  { key: "pending_payment", label: "Oczekuje na opłacenie", step: 1 },
  { key: "in_queue", label: "W kolejce farmy", step: 2 },
  { key: "in_production", label: "Drukowanie (Hotend aktywny)", step: 3 },
  { key: "post_processing", label: "Post-processing i QC", step: 4 },
  { key: "shipped", label: "Wysłane / Gotowe", step: 5 },
];

function getStepIndex(status) {
  const found = STATUS_STEPS.find((s) => s.key === status);
  return found ? found.step : 1;
}

export default function OrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        router.push("/");
        return;
      }
      setUser(session.user);
      fetchOrders(session.user.id);
    });
  }, [router]);

  async function fetchOrders(userId) {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setOrders(data);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#F8FAFC] font-sans">
      <Head>
        <title>Drukstacja — Panel Zleceń & Status Farmy</title>
      </Head>

      {/* NAVBAR */}
      <header className="border-b border-[#24324A] bg-[#0B0F17]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#00E5FF] to-[#2563EB] flex items-center justify-center p-0.5 shadow-[0_0_15px_rgba(0,229,255,0.3)]">
              <div className="w-full h-full bg-[#0B0F17] rounded-[7px] flex items-center justify-center">
                <span className="font-bold text-lg text-[#00E5FF]">D</span>
              </div>
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">
                DRUK<span className="text-[#00E5FF]">STACJA</span>
              </span>
              <span className="text-[10px] text-[#94A3B8] block -mt-1 tracking-widest font-mono">LABS 3D</span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-mono text-[#94A3B8] hover:text-[#00E5FF] transition flex items-center gap-1.5"
            >
              ← Wróć do konfiguratora
            </Link>
            {user && (
              <span className="text-xs font-mono text-[#00E5FF] hidden sm:inline">
                {user.email}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* GŁÓWNY WIDOK */}
      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-[#24324A] pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-wide">
              PANEL ZLECEŃ KLIENTA
            </h1>
            <p className="text-xs font-mono text-[#94A3B8] mt-1">
              Podgląd parametrów technologicznych, statusu wydruku i historii modeli
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
            <span className="text-xs font-mono text-[#94A3B8]">
              Pozycji w bazie: <strong className="text-white">{orders.length}</strong>
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center text-xs font-mono text-[#94A3B8]">
            Ładowanie zleceń z bazy farmy...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 rounded-2xl border border-dashed border-[#24324A] bg-[#0E1524] text-center space-y-3">
            <p className="text-sm font-semibold text-white">Brak zarejestrowanych zleceń</p>
            <p className="text-xs font-mono text-[#94A3B8]">
              Wgraj swój pierwszy model STL w konfiguratorze i dodaj go do realizacji.
            </p>
            <Link
              href="/"
              className="inline-block mt-2 px-4 py-2 bg-gradient-to-r from-[#00E5FF] to-[#2563EB] text-[#0B0F17] font-bold text-xs uppercase rounded-xl tracking-wider hover:opacity-95 transition"
            >
              Przejdź do wyceniarki
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const currentStep = getStepIndex(order.status);
              const formattedDate = new Date(order.created_at).toLocaleDateString("pl-PL", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-[#24324A] bg-[#0E1524] p-6 shadow-xl space-y-6"
                >
                  {/* Nagłówek kafelka zlecenia */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#24324A] pb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold text-white font-tech">
                          {order.file_name}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161F30] border border-[#24324A] text-[#00E5FF]">
                          ID: #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-[#94A3B8] block mt-0.5">
                        Zlecono: {formattedDate}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 text-right font-mono">
                      <span className="text-xl font-bold text-[#00E5FF]">
                        {Number(order.total_price).toFixed(2)}
                      </span>
                      <span className="text-xs text-[#94A3B8]">PLN</span>
                    </div>
                  </div>

                  {/* STEPPER STATUSU PRODUKCJI */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-mono text-[#94A3B8] uppercase tracking-wider block">
                      Stan realizacji w farmie druku:
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        { label: "1. Zlecone / Kolejka", step: 2 },
                        { label: "2. W trakcie druku", step: 3 },
                        { label: "3. QC & Oczyszczenie", step: 4 },
                        { label: "4. Wysłane do Ciebie", step: 5 },
                      ].map((s) => {
                        const isActive = currentStep >= s.step;
                        const isCurrent = currentStep === s.step;
                        return (
                          <div
                            key={s.step}
                            className={`p-2.5 rounded-lg border text-xs font-mono transition flex items-center gap-2 ${
                              isCurrent
                                ? "border-[#00E5FF] bg-[#00E5FF]/10 text-white font-bold shadow-[0_0_15px_rgba(0,229,255,0.15)]"
                                : isActive
                                ? "border-emerald-500/50 bg-emerald-950/20 text-emerald-400"
                                : "border-[#24324A] bg-[#0B0F17] text-[#94A3B8]/60"
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isCurrent
                                  ? "bg-[#00E5FF] animate-ping"
                                  : isActive
                                  ? "bg-emerald-400"
                                  : "bg-[#24324A]"
                              }`}
                            />
                            <span>{s.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SPECYFIKACJA TECHNOLOGICZNA WYDRUKU */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2 text-xs font-mono bg-[#0B0F17]/60 p-4 rounded-xl border border-[#24324A]">
                    <div>
                      <span className="text-[10px] text-[#94A3B8] block">Technologia</span>
                      <strong className="text-white">{order.technology || "FDM"}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94A3B8] block">Materiał</span>
                      <strong className="text-[#00E5FF]">{order.material}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94A3B8] block">Warstwa</span>
                      <strong className="text-white">{order.layer_height}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94A3B8] block">Wypełnienie</span>
                      <strong className="text-white">{order.infill}%</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94A3B8] block">Sztuk</span>
                      <strong className="text-white">{order.quantity} szt.</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94A3B8] block">Wymiary (XYZ)</span>
                      <strong className="text-white">
                        {order.dimensions_mm
                          ? `${order.dimensions_mm[0]}×${order.dimensions_mm[1]}×${order.dimensions_mm[2]}`
                          : "62×62×48"}{" "}
                        mm
                      </strong>
                    </div>
                  </div>

                  {/* OPCJE POST-PROCESS */}
                  {(order.clean_supports || order.brass_inserts) && (
                    <div className="flex gap-2 font-mono text-[11px]">
                      {order.clean_supports && (
                        <span className="px-2.5 py-1 rounded bg-[#161F30] border border-[#24324A] text-emerald-400">
                          ✓ Usunięcie podpór roboczych
                        </span>
                      )}
                      {order.brass_inserts && (
                        <span className="px-2.5 py-1 rounded bg-[#161F30] border border-[#24324A] text-[#00E5FF]">
                          ✓ Wprasowane inserty gwintowane
                        </span>
                      )}
                    </div>
                  )}

                  {/* PAKIET PRODUKCYJNY 3MF */}
                  {(() => {
                    const cleanLayerHeight = parseFloat(String(order.layer_height || "0.2").replace(/[^\d.]/g, "")) || 0.2;
                    const cleanNozzle = parseFloat(String(order.nozzle_size || "0.4").replace(/[^\d.]/g, "")) || 0.4;
                    const cleanInfill = parseInt(String(order.infill || "20").replace(/[^\d.]/g, "")) || 20;

                    return (
                      <div className="pt-3 border-t border-[#24324A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-[#94A3B8]">
                            Plik produkcyjny dla Bambu / Orca / Prusa:
                          </span>
                        </div>
                        <a
                          href={
                            order.production_file_url ||
                            `${API_URL}/api/orders/${order.id}/download-3mf?file_name=${encodeURIComponent(
                              order.file_name || ""
                            )}&material=${encodeURIComponent(
                              order.material || ""
                            )}&layer_height=${cleanLayerHeight}&nozzle_size=${cleanNozzle}&infill=${cleanInfill}`
                          }
                          download
                          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition shadow-sm hover:scale-[1.02] active:scale-98"
                        >
                          <span>📦</span>
                          <span>Pobierz projekt produkcyjny (.3MF)</span>
                        </a>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}