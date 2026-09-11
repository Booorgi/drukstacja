import React, { useState, useEffect } from "react";
import Head from "next/head";
import Navbar from "../components/Navbar";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import { supabase } from "../lib/supabaseClient";

const CONTACT_PHONE = "+48 ___ ___ ___";

export default function KontaktPage() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("idle");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) fetchCart(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchCart(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchCart(userId) {
    if (!userId) return;
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "in_cart")
      .order("created_at", { ascending: false });
    if (data) setCartItems(data);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitStatus("idle");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) throw new Error("send_failed");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setSubmitStatus("success");
    } catch {
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] font-sans">
      <Head>
        <title>Kontakt & Wsparcie Inżynierskie — Drukstacja</title>
      </Head>

      <Navbar
        activePage="kontakt"
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10 space-y-10">
        <div>
          <span className="text-xs font-black uppercase text-[#EF4444] tracking-wider block mb-1">
            Centrum Kontaktu & Zleceń B2B
          </span>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
            Skontaktuj się z Drukstacją
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl mt-1">
            Masz nietypowy projekt, potrzebujesz produkcji seryjnej lub weryfikacji technologicznej DFM? Skontaktuj się z naszym zespołem.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEWA KOLUMNA: KARTY KONTAKTOWE */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Dane Bezpośrednie
              </h2>

              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-red-50 text-[#EF4444] flex items-center justify-center text-xl flex-shrink-0">
                  📍
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 block">Siedziba i Park Maszynowy</span>
                  <span className="text-sm font-bold text-slate-900 block">Drukstacja 3D Lab</span>
                  <span className="text-xs text-slate-600 block mt-0.5">Poznań, Polska</span>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl flex-shrink-0">
                  ✉️
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 block">Biuro Obsługi Zleceń</span>
                  <a href="mailto:kontakt@drukstacja.pl" className="text-sm font-bold text-slate-900 hover:text-[#EF4444] transition block">
                    kontakt@drukstacja.pl
                  </a>
                  <span className="text-xs text-slate-600 block mt-0.5">Wyceny CAD, faktury i B2B</span>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl flex-shrink-0">
                  📞
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 block">Infolinia Technologiczna</span>
                  <span className="text-sm font-bold text-slate-900 block">
                    {CONTACT_PHONE}
                  </span>
                  <span className="text-xs text-slate-600 block mt-0.5">Pn - Pt: 8:00 - 18:00</span>
                </div>
              </div>
            </div>
          </div>

          {/* PRAWA KOLUMNA: FORMULARZ */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Napisz do nas bezpośrednio</h2>

              {submitStatus === "success" && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  Dziękujemy! Twoja wiadomość została wysłana. Skontaktujemy się z Tobą najszybciej jak to możliwe.
                </div>
              )}
              {submitStatus === "error" && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                  Nie udało się wysłać wiadomości. Spróbuj ponownie lub napisz na kontakt@drukstacja.pl.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Twoje imię / Firma:
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jan Kowalski"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Adres e-mail:
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jan@firma.pl"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Temat zapytania:
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="np. Wycena seryjna 500 sztuk / dobór materiału"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Treść wiadomości:
                </label>
                <textarea
                  rows={5}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Opisz swój projekt, wymagania mechaniczne, oczekiwany czas realizacji..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EF4444] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/25 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Wysyłanie..." : "Wyślij zapytanie →"}
              </button>
            </form>
          </div>
        </div>
      </main>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} items={cartItems} onRefresh={() => user && fetchCart(user.id)} />
    </div>
  );
}
