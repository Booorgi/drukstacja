import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "../components/Navbar";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import { supabase } from "../lib/supabaseClient";
import { listOrders, fetchCartOrders } from "../lib/ordersApi";
import { isShopSkuLine } from "../lib/orderLine";
import { shopCategoryLabel } from "../lib/shopCategories";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const STATUS_STEPS = [
  { key: "in_cart", label: "W koszyku", step: 0 },
  { key: "pending_payment", label: "Oczekuje na opłacenie", step: 1 },
  { key: "in_queue", label: "W kolejce farmy", step: 2 },
  { key: "in_production", label: "Drukowanie (Hotend aktywny)", step: 3 },
  { key: "post_processing", label: "Post-processing i QC", step: 4 },
  { key: "shipped", label: "Wysłane / Gotowe", step: 5 },
];

const PRODUCTION_STEPS = [
  { label: "1. Zlecone / Kolejka", step: 2 },
  { label: "2. W trakcie druku", step: 3 },
  { label: "3. QC & Oczyszczenie", step: 4 },
  { label: "4. Wysłane do Ciebie", step: 5 },
];

function getStepIndex(status) {
  const found = STATUS_STEPS.find((s) => s.key === status);
  return found ? found.step : 1;
}

function statusMeta(status) {
  return STATUS_STEPS.find((s) => s.key === status) || STATUS_STEPS[1];
}

function statusPillClass(status) {
  switch (status) {
    case "shipped":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "in_production":
    case "post_processing":
      return "bg-red-50 text-[#EF4444] border-red-100";
    case "pending_payment":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "in_cart":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-slate-900 text-white border-slate-900";
  }
}

function formatOrderDate(createdAt) {
  return new Date(createdAt).toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDimensions(order) {
  if (order.dimensions_mm) {
    return `${order.dimensions_mm[0]}×${order.dimensions_mm[1]}×${order.dimensions_mm[2]}`;
  }
  return "62×62×48";
}

function productionFileHref(order) {
  if (order.production_file_url) {
    return order.production_file_url.startsWith("http")
      ? order.production_file_url
      : `${API_URL || ""}${order.production_file_url}`;
  }

  const cleanLayerHeight = parseFloat(String(order.layer_height || "0.2").replace(/[^\d.]/g, "")) || 0.2;
  const cleanNozzle = parseFloat(String(order.nozzle_size || "0.4").replace(/[^\d.]/g, "")) || 0.4;
  const cleanInfill = parseInt(String(order.infill || "20").replace(/[^\d.]/g, "")) || 20;

  return `${API_URL || ""}/api/orders/${order.id}/download-3mf?file_name=${encodeURIComponent(
    order.file_name || ""
  )}&material=${encodeURIComponent(
    order.material || ""
  )}&layer_height=${cleanLayerHeight}&nozzle_size=${cleanNozzle}&infill=${cleanInfill}`;
}

export default function OrdersPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        fetchOrders();
        fetchCart();
      } else {
        setOrders([]);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        fetchOrders();
        fetchCart();
      } else {
        setOrders([]);
        setCartItems([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchOrders() {
    setLoading(true);
    try {
      const data = await listOrders();
      setOrders(data);
    } catch (error) {
      console.warn("Błąd pobierania zleceń:", error);
    }
    setLoading(false);
  }

  async function fetchCart() {
    try {
      setCartItems(await fetchCartOrders());
    } catch (err) {
      console.warn("Błąd koszyka:", err);
    }
  }

  const showLoginPrompt = authReady && !user;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] font-sans">
      <Head>
        <title>Moje zlecenia — Drukstacja</title>
      </Head>

      <Navbar
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase text-[#EF4444] tracking-wider block mb-1">
              Panel zleceń klienta
            </span>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              Moje zlecenia
            </h1>
            <p className="text-sm text-slate-500 max-w-2xl mt-1">
              Podgląd parametrów technologicznych, statusu wydruku i historii modeli
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span>
              Zleceń: <strong className="text-slate-900">{orders.length}</strong>
            </span>
          </div>
        </div>

        {showLoginPrompt ? (
          <div
            data-orders-login
            className="rounded-3xl border border-slate-200 bg-white p-10 md:p-12 text-center space-y-4 shadow-sm"
          >
            <p className="text-lg font-black text-slate-900 tracking-tight">Zaloguj się, aby zobaczyć zlecenia</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Status realizacji, parametry wydruku i pliki produkcyjne są dostępne po zalogowaniu na konto Drukstacja.
            </p>
            <button
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="inline-flex items-center justify-center px-5 py-3 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-500/25 transition"
            >
              Zaloguj
            </button>
          </div>
        ) : loading ? (
          <div
            data-orders-loading
            className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500"
          >
            Ładowanie zleceń…
          </div>
        ) : orders.length === 0 ? (
          <div
            data-orders-empty
            className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center space-y-3 shadow-sm"
          >
            <p className="text-sm font-semibold text-slate-800">Brak zarejestrowanych zleceń</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Wgraj swój pierwszy model STL w konfiguratorze i dodaj go do realizacji.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/"
                className="inline-flex items-center justify-center px-5 py-3 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-500/25 transition"
              >
                Przejdź do wyceniarki
              </Link>
              <Link
                href="/sklep"
                className="inline-flex items-center justify-center px-5 py-3 rounded-full border border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700 hover:border-slate-300 hover:text-slate-900 transition"
              >
                Zobacz sklep
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => {
              const currentStep = getStepIndex(order.status);
              const shopLine = isShopSkuLine(order);
              const formattedDate = formatOrderDate(order.created_at);
              const status = statusMeta(order.status);

              return (
                <article
                  key={order.id}
                  data-order-card={order.id}
                  data-order-kind={shopLine ? "shop" : "print"}
                  className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6 shadow-sm space-y-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-slate-900 truncate">
                          {order.file_name}
                        </h2>
                        {shopLine && (
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-50 text-[#EF4444] border border-red-100">
                            Sklep
                          </span>
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500">
                          ID: #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusPillClass(
                            order.status
                          )}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 block mt-1">
                        Zlecono: {formattedDate}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 sm:text-right shrink-0">
                      <span className="text-xl font-black text-slate-900">
                        {Number(order.total_price).toFixed(2)}
                      </span>
                      <span className="text-xs font-bold text-slate-400">PLN</span>
                    </div>
                  </div>

                  {shopLine ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-sm">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          Typ
                        </span>
                        <strong className="text-slate-900 font-bold">Produkt sklepowy</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          Kategoria
                        </span>
                        <strong className="text-[#EF4444] font-bold">{shopCategoryLabel(order.material)}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          SKU
                        </span>
                        <strong className="text-slate-900 font-bold">{order.layer_height || "—"}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          Sztuk
                        </span>
                        <strong className="text-slate-900 font-bold">{order.quantity} szt.</strong>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                          Stan realizacji w farmie druku:
                        </span>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {PRODUCTION_STEPS.map((s) => {
                            const isActive = currentStep >= s.step;
                            const isCurrent = currentStep === s.step;
                            return (
                              <div
                                key={s.step}
                                data-order-step={s.step}
                                data-order-step-state={isCurrent ? "current" : isActive ? "done" : "upcoming"}
                                className={`px-3 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                                  isCurrent
                                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                                    : isActive
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-slate-200 bg-slate-50 text-slate-400"
                                }`}
                              >
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    isCurrent
                                      ? "bg-[#EF4444] animate-pulse"
                                      : isActive
                                        ? "bg-emerald-500"
                                        : "bg-slate-300"
                                  }`}
                                />
                                <span>{s.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-sm">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                            Technologia
                          </span>
                          <strong className="text-slate-900 font-bold">{order.technology || "FDM"}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                            Materiał
                          </span>
                          <strong className="text-[#EF4444] font-bold">{order.material}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                            Warstwa
                          </span>
                          <strong className="text-slate-900 font-bold">{order.layer_height}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                            Wypełnienie
                          </span>
                          <strong className="text-slate-900 font-bold">{order.infill}%</strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                            Sztuk
                          </span>
                          <strong className="text-slate-900 font-bold">{order.quantity} szt.</strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                            Wymiary (XYZ)
                          </span>
                          <strong className="text-slate-900 font-bold">
                            {formatDimensions(order)} mm
                          </strong>
                        </div>
                      </div>

                      {(order.clean_supports || order.brass_inserts) && (
                        <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                          {order.clean_supports && (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700">
                              ✓ Usunięcie podpór roboczych
                            </span>
                          )}
                          {order.brass_inserts && (
                            <span className="px-2.5 py-1 rounded-full bg-red-50 border border-red-100 text-[#EF4444]">
                              ✓ Wprasowane inserty gwintowane
                            </span>
                          )}
                        </div>
                      )}

                      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-xs text-slate-500">
                          Plik produkcyjny dla Bambu / Orca / Prusa:
                        </p>
                        <a
                          href={productionFileHref(order)}
                          download
                          data-order-download-3mf={order.id}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-slate-900 hover:bg-[#EF4444] text-white text-xs font-bold transition shadow-sm"
                        >
                          <span>📦</span>
                          <span>Pobierz projekt produkcyjny (.3MF)</span>
                        </a>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(nextUser) => {
          setUser(nextUser);
          setIsAuthOpen(false);
          fetchOrders();
          fetchCart();
        }}
      />
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onRemoveItem={(removedId) => {
          setCartItems((prev) => prev.filter((it) => String(it.id) !== String(removedId)));
        }}
      />
    </div>
  );
}
