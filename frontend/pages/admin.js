import React, { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "../components/Navbar";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import { supabase } from "../lib/supabaseClient";
import { fetchCartOrders } from "../lib/ordersApi";
import { advanceAdminCheckout, listAdminCheckouts, productionFileHref } from "../lib/checkoutApi";
import { isShopSkuLine } from "../lib/orderLine";
import {
  FILTERS,
  NEXT_ACTION_LABEL,
  NEXT_STATUS,
  POLL_MS,
  STATUS_LABEL,
  countAdminCheckouts,
  checkoutMatchesQuery,
  filterAdminCheckouts,
  formatMoney,
  formatWhen,
  isRecentlyPaid,
  isUnreadNew,
  lineCountLabel,
  loadSeenIds,
  paymentLabel,
  saveSeenIds,
  shippingSummary,
} from "../lib/adminQueue";

function paymentBadgeClass(status) {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "pending":
      return "bg-amber-50 text-amber-800 border-amber-100";
    case "failed":
      return "bg-red-50 text-[#EF4444] border-red-100";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function productionBadgeClass(status) {
  switch (status) {
    case "in_queue":
      return "bg-slate-900 text-white border-slate-900";
    case "in_production":
    case "post_processing":
      return "bg-red-50 text-[#EF4444] border-red-100";
    case "shipped":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [checkouts, setCheckouts] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [seenIds, setSeenIds] = useState(() => new Set());
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);

  const loadOrders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setState((prev) => (prev === "ready" ? prev : "loading"));
      setError("");
    }
    try {
      const data = await listAdminCheckouts({ payment: "all" });
      setCheckouts(data.checkouts || []);
      setLastSyncedAt(Date.now());
      setState("ready");
    } catch (err) {
      if (err?.status === 401) {
        setState("anon");
        return;
      }
      if (err?.status === 403) {
        setState("forbidden");
        return;
      }
      setError(err?.message || "Nie udało się pobrać zamówień.");
      if (!silent) setState("error");
    }
  }, []);

  useEffect(() => {
    setSeenIds(loadSeenIds());

    supabase.auth.getSession().then(({ data: { session } }) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        loadOrders();
        fetchCartOrders()
          .then(setCartItems)
          .catch(() => setCartItems([]));
      } else {
        setState("anon");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        loadOrders();
      } else {
        setState("anon");
        setCheckouts([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadOrders]);

  useEffect(() => {
    if (state !== "ready") return undefined;
    const timer = window.setInterval(() => {
      loadOrders({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [state, loadOrders]);

  const visible = useMemo(
    () => filterAdminCheckouts(checkouts, { status: filter, query }),
    [checkouts, filter, query]
  );
  const counts = useMemo(() => {
    const searched = checkouts.filter((row) => checkoutMatchesQuery(row, query));
    return countAdminCheckouts(searched);
  }, [checkouts, query]);

  const unreadQueue = useMemo(
    () => checkouts.filter((row) => isUnreadNew(row, seenIds)).length,
    [checkouts, seenIds]
  );

  function markSeen(ids) {
    setSeenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(String(id)));
      saveSeenIds(next);
      return next;
    });
  }

  async function advance(checkout) {
    const next = NEXT_STATUS[checkout.production_status];
    if (!next) return;
    setBusyId(checkout.id);
    setError("");
    try {
      const updated = await advanceAdminCheckout(checkout.id, next);
      setCheckouts((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      markSeen([checkout.id]);
    } catch (err) {
      setError(err?.message || "Nie udało się zmienić statusu.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] font-sans">
      <Head>
        <title>Kolejka produkcji — Drukstacja</title>
      </Head>

      <Navbar
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 md:py-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase text-[#EF4444] tracking-wider block mb-1">
              Panel staff · OMS
            </span>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              Kolejka produkcji
            </h1>
            <p className="text-sm text-slate-500 max-w-2xl mt-1">
              Opłacone zamówienia najpierw — kolejka, druk, QC, wysyłka. Szukaj po numerze, e-mailu albo nazwie pliku.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unreadQueue > 0 ? (
              <span
                data-admin-new-count
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EF4444] text-white text-xs font-bold"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {unreadQueue === 1 ? "1 nowe w kolejce" : `${unreadQueue} nowe w kolejce`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Kolejka na bieżąco
              </span>
            )}
            <button
              type="button"
              onClick={() => loadOrders()}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:border-slate-300"
            >
              Odśwież
            </button>
            {lastSyncedAt ? (
              <span className="text-[11px] text-slate-400">
                {new Date(lastSyncedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">{error}</div>
        ) : null}

        {state === "anon" && authReady && (
          <div
            data-admin-login
            className="rounded-3xl border border-slate-200 bg-white p-10 text-center space-y-4 shadow-sm"
          >
            <p className="text-lg font-black text-slate-900 tracking-tight">Zaloguj się kontem staff</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Panel kolejki jest dostępny tylko dla adresów z listy <code>ADMIN_EMAILS</code>.
            </p>
            <button
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="inline-flex items-center justify-center px-5 py-3 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-500/25 transition"
            >
              Zaloguj
            </button>
          </div>
        )}

        {state === "forbidden" && (
          <div
            data-admin-forbidden
            className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-900"
          >
            Brak uprawnień. E-mail z konta ({user?.email || "—"}) musi być na liście <code>ADMIN_EMAILS</code>.
            <Link href="/" className="block mt-3 font-bold text-[#EF4444]">
              Wróć do strony głównej
            </Link>
          </div>
        )}

        {state === "loading" && (
          <div
            data-admin-loading
            className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500"
          >
            Ładowanie kolejki…
          </div>
        )}

        {state === "ready" && (
          <>
            <div className="space-y-3">
              <label className="block">
                <span className="sr-only">Szukaj zamówienia</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Szukaj ID, e-maila, pliku albo produktu…"
                  data-admin-search
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#EF4444]/30 focus:border-[#EF4444]"
                />
              </label>

              <div
                className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
                role="tablist"
                aria-label="Filtr kolejki"
              >
                {FILTERS.map((item) => {
                  const active = filter === item.key;
                  const count = counts[item.key] || 0;
                  const showNew = item.key === "in_queue" && unreadQueue > 0;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-admin-filter={item.key}
                      onClick={() => setFilter(item.key)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                        active
                          ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900"
                      }`}
                    >
                      {item.label}
                      <span className={active ? "text-white/70" : "text-slate-400"}>{count}</span>
                      {showNew ? (
                        <span className="min-w-4 h-4 px-1 rounded-full bg-[#EF4444] text-white text-[10px] leading-4 text-center">
                          {unreadQueue}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {unreadQueue > 0 ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  data-admin-mark-seen
                  onClick={() =>
                    markSeen(checkouts.filter((row) => isUnreadNew(row, seenIds)).map((row) => row.id))
                  }
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Oznacz nowe jako przeczytane
                </button>
              </div>
            ) : null}

            {visible.length === 0 ? (
              <div
                data-admin-empty
                className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center space-y-2 shadow-sm"
              >
                <p className="text-sm font-semibold text-slate-800">
                  {checkouts.length === 0 ? "Brak zamówień w kolejce" : "Brak wyników w tym widoku"}
                </p>
                <p className="text-xs text-slate-500">
                  {query
                    ? "Zmień frazę albo filtr statusu."
                    : "Po opłaceniu w Stripe zamówienie pojawi się w „W kolejce”."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {visible.map((checkout) => {
                  const next = NEXT_STATUS[checkout.production_status];
                  const unread = isUnreadNew(checkout, seenIds);
                  const recent = isRecentlyPaid(checkout);
                  const lines = checkout.lines || [];
                  return (
                    <article
                      key={checkout.id}
                      data-admin-checkout={checkout.id}
                      data-admin-unread={unread ? "true" : "false"}
                      onClick={() => markSeen([checkout.id])}
                      className={`bg-white rounded-3xl border p-5 md:p-6 shadow-sm space-y-4 ${
                        unread
                          ? "border-[#EF4444] ring-2 ring-[#EF4444]/15"
                          : recent
                            ? "border-red-200"
                            : "border-slate-200"
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {unread ? (
                              <span
                                data-admin-new-badge
                                className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#EF4444] text-white"
                              >
                                Nowe
                              </span>
                            ) : recent ? (
                              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-50 text-[#EF4444] border border-red-100">
                                Właśnie opłacone
                              </span>
                            ) : null}
                            <span className="font-mono text-sm font-bold text-slate-900">
                              #{String(checkout.id).slice(0, 8).toUpperCase()}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${paymentBadgeClass(
                                checkout.payment_status
                              )}`}
                            >
                              {paymentLabel(checkout.payment_status)}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${productionBadgeClass(
                                checkout.production_status
                              )}`}
                            >
                              {STATUS_LABEL[checkout.production_status] || checkout.production_status}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">
                              {lineCountLabel(lines)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {formatWhen(checkout.created_at)}
                            {checkout.customer_email ? ` · ${checkout.customer_email}` : ""}
                          </p>
                          <p className="text-sm font-semibold text-slate-800">{shippingSummary(checkout)}</p>
                          <p className="text-xs text-slate-500">
                            {checkout.shipping_street}
                            {checkout.shipping_phone ? ` · ${checkout.shipping_phone}` : ""}
                          </p>
                          {checkout.company ? (
                            <p className="text-xs text-slate-500">
                              {checkout.company}
                              {checkout.nip ? ` · NIP ${checkout.nip}` : ""}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex md:flex-col items-center md:items-end justify-between gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-2xl font-black text-slate-900 tabular-nums">
                              {formatMoney(checkout.total)}{" "}
                              <span className="text-xs font-bold text-slate-400">PLN</span>
                            </div>
                            {Number(checkout.shipping || 0) > 0 ? (
                              <p className="text-[11px] text-slate-400">
                                w tym wysyłka {formatMoney(checkout.shipping)} PLN
                              </p>
                            ) : (
                              <p className="text-[11px] text-slate-400">Wysyłka: do uzgodnienia</p>
                            )}
                          </div>
                          {next ? (
                            <button
                              type="button"
                              disabled={busyId === checkout.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                advance(checkout);
                              }}
                              className="px-4 py-2.5 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-500/20 disabled:opacity-50"
                            >
                              {busyId === checkout.id ? "Zapis…" : NEXT_ACTION_LABEL[next]}
                            </button>
                          ) : checkout.production_status === "shipped" ? (
                            <p className="text-[11px] font-bold text-emerald-600">Wysłane</p>
                          ) : (
                            <p className="text-[11px] font-bold text-amber-700">Czeka na wpłatę</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {lines.map((line) => {
                          const href = productionFileHref(line.production_file_url);
                          return (
                            <div
                              key={line.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-[#F8FAFC] border border-slate-100 text-sm"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-slate-900 truncate">{line.file_name}</span>
                                  {isShopSkuLine(line) ? (
                                    <span className="text-[10px] font-black uppercase text-[#EF4444]">Sklep</span>
                                  ) : null}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {line.material || "—"} · {line.quantity} szt. · {formatMoney(line.total_price)} PLN
                                </div>
                              </div>
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="text-xs font-bold text-[#EF4444] hover:text-[#DC2626]"
                                >
                                  Pobierz 3MF
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400">Brak 3MF</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={() => {
          setIsAuthOpen(false);
          loadOrders();
        }}
      />
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onRemoveItem={(removedId) => {
          setCartItems((prev) => prev.filter((item) => String(item.id) !== String(removedId)));
        }}
      />
    </div>
  );
}
