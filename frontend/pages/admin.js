import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { advanceAdminCheckout, listAdminCheckouts, productionFileHref } from "../lib/checkoutApi";
import { isShopSkuLine } from "../lib/orderLine";

const STATUS_LABEL = {
  pending_payment: "Oczekuje na wpłatę",
  in_queue: "W kolejce",
  in_production: "W produkcji",
  post_processing: "Obróbka / QC",
  shipped: "Wysłane",
};

const NEXT_STATUS = {
  in_queue: "in_production",
  in_production: "post_processing",
  post_processing: "shipped",
};

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [checkouts, setCheckouts] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) {
        loadOrders();
      } else {
        setState("anon");
      }
    });
  }, []);

  async function loadOrders() {
    setState("loading");
    setError("");
    try {
      const rows = await listAdminCheckouts();
      setCheckouts(rows);
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
      setState("error");
    }
  }

  async function advance(checkout) {
    const next = NEXT_STATUS[checkout.production_status];
    if (!next) return;
    setBusyId(checkout.id);
    try {
      const updated = await advanceAdminCheckout(checkout.id, next);
      setCheckouts((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setError(err?.message || "Nie udało się zmienić statusu.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#F8FAFC] font-sans">
      <Head>
        <title>Admin OMS — Drukstacja</title>
      </Head>
      <header className="border-b border-[#24324A] bg-[#0B0F17]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            DRUK<span className="text-[#00E5FF]">STACJA</span>
            <span className="text-[10px] text-[#94A3B8] block -mt-1 tracking-widest font-mono">OMS / FARMA</span>
          </Link>
          <div className="text-xs font-mono text-[#94A3B8]">{user?.email || "—"}</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">PANEL ZAMÓWIEŃ (STAFF)</h1>
          <p className="text-xs font-mono text-[#94A3B8] mt-1">
            Opłacone nagłówki · kolejka → produkcja → obróbka → wysyłka. Brak pełnego RBAC — tylko{" "}
            <code>ADMIN_EMAILS</code>.
          </p>
        </div>

        {error ? (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs">{error}</div>
        ) : null}

        {state === "loading" && <p className="text-xs font-mono text-[#94A3B8]">Ładowanie zamówień…</p>}
        {state === "anon" && (
          <p className="text-sm text-[#94A3B8]">
            Zaloguj się kontem staff, aby otworzyć panel.{" "}
            <Link href="/" className="text-[#00E5FF]">
              Wróć do strony głównej
            </Link>
          </p>
        )}
        {state === "forbidden" && (
          <p className="text-sm text-amber-300">
            Brak uprawnień. Adres e-mail z JWT musi być na liście <code>ADMIN_EMAILS</code>.
          </p>
        )}
        {state === "ready" && checkouts.length === 0 && (
          <p className="text-sm text-[#94A3B8]">Brak opłaconych zamówień w kolejce.</p>
        )}

        {state === "ready" &&
          checkouts.map((checkout) => {
            const next = NEXT_STATUS[checkout.production_status];
            const when = checkout.created_at
              ? new Date(checkout.created_at).toLocaleString("pl-PL")
              : "";
            return (
              <article
                key={checkout.id}
                className="rounded-2xl border border-[#24324A] bg-[#0E1524] p-5 space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[#00E5FF] text-sm">
                        #{String(checkout.id).slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-300">
                        {checkout.payment_status === "paid" ? "OPŁACONE" : checkout.payment_status}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#24324A] text-white">
                        {STATUS_LABEL[checkout.production_status] || checkout.production_status}
                      </span>
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-1">{when}</p>
                    <p className="text-sm mt-2">
                      {checkout.shipping_name} · {checkout.shipping_phone}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {checkout.shipping_street}, {checkout.shipping_postal_code} {checkout.shipping_city},{" "}
                      {checkout.shipping_country}
                    </p>
                    {checkout.company ? (
                      <p className="text-xs text-[#94A3B8]">
                        {checkout.company}
                        {checkout.nip ? ` · NIP ${checkout.nip}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-[#00E5FF]">
                      {Number(checkout.total || 0).toFixed(2)} PLN
                    </div>
                    {next ? (
                      <button
                        type="button"
                        disabled={busyId === checkout.id}
                        onClick={() => advance(checkout)}
                        className="mt-2 px-3 py-1.5 rounded-lg bg-[#00E5FF]/15 border border-[#00E5FF]/40 text-[#00E5FF] text-xs font-mono hover:bg-[#00E5FF]/25 disabled:opacity-50"
                      >
                        {busyId === checkout.id ? "Zapis…" : `Dalej: ${STATUS_LABEL[next]}`}
                      </button>
                    ) : (
                      <p className="text-[11px] font-mono text-emerald-400 mt-2">Zamknięte</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {(checkout.lines || []).map((line) => {
                    const href = productionFileHref(line.production_file_url);
                    return (
                      <div
                        key={line.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#0B0F17] border border-[#24324A] text-xs font-mono"
                      >
                        <div>
                          <span className="text-white font-bold">{line.file_name}</span>
                          {isShopSkuLine(line) ? (
                            <span className="ml-2 text-[10px] text-[#F87171]">SKLEP</span>
                          ) : null}
                          <div className="text-[#94A3B8]">
                            {line.material || "—"} · {line.quantity} szt. · {Number(line.total_price || 0).toFixed(2)} PLN
                          </div>
                        </div>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#00E5FF] hover:underline"
                          >
                            Pobierz 3MF
                          </a>
                        ) : (
                          <span className="text-[#94A3B8]">Brak 3MF</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
      </main>
    </div>
  );
}
