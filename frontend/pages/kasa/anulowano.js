import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Navbar from "../../components/Navbar";
import { supabase } from "../../lib/supabaseClient";
import { cancelCheckout } from "../../lib/checkoutApi";

export default function CheckoutCancelPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [note, setNote] = useState("Przywracamy pozycje do koszyka…");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const checkoutId = router.query.checkout_id;
    cancelCheckout(typeof checkoutId === "string" ? checkoutId : null)
      .then(() => setNote("Nic nie zostało pobrane. Pozycje wróciły do koszyka."))
      .catch(() => setNote("Płatność anulowana. Jeśli koszyk jest pusty, dodaj pozycje ponownie."));
  }, [router.isReady, router.query.checkout_id]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <Head>
        <title>Płatność anulowana — Drukstacja</title>
      </Head>
      <Navbar activePage="sklep" user={user} cartItems={[]} />
      <main className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-black tracking-tight">Płatność anulowana</h1>
        <p className="text-sm text-slate-500 leading-relaxed">{note}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            href="/kasa"
            className="px-5 py-3 rounded-full bg-[#EF4444] text-white text-xs font-bold uppercase tracking-wider"
          >
            Wróć do kasy
          </Link>
          <Link
            href="/sklep"
            className="px-5 py-3 rounded-full border border-slate-200 text-xs font-bold uppercase tracking-wider"
          >
            Sklep
          </Link>
        </div>
      </main>
    </div>
  );
}
