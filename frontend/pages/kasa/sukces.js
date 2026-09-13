import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Navbar from "../../components/Navbar";
import { supabase } from "../../lib/supabaseClient";

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const sessionId = router.query.session_id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <Head>
        <title>Zamówienie opłacone — Drukstacja</title>
      </Head>
      <Navbar activePage="sklep" user={user} cartItems={[]} />
      <main className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-4xl">✓</div>
        <h1 className="text-2xl font-black tracking-tight">Dziękujemy za zamówienie</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Płatność została przyjęta. Po potwierdzeniu Stripe (zwykle kilka sekund) linie
          przejdą do kolejki produkcji. Faktura i e-mail transakcyjny — w kolejnej wersji.
        </p>
        {sessionId ? (
          <p className="text-[11px] font-mono text-slate-400 break-all">Sesja: {sessionId}</p>
        ) : null}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            href="/orders"
            className="px-5 py-3 rounded-full bg-[#EF4444] text-white text-xs font-bold uppercase tracking-wider"
          >
            Moje zlecenia
          </Link>
          <Link
            href="/"
            className="px-5 py-3 rounded-full border border-slate-200 text-xs font-bold uppercase tracking-wider"
          >
            Wyceniarka
          </Link>
        </div>
      </main>
    </div>
  );
}
