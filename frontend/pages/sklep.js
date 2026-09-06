import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "../components/Navbar";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import { supabase } from "../lib/supabaseClient";

export default function ShopPage() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);

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

  const SAMPLE_PRODUCTS = [
    {
      id: 1,
      name: "Zestaw Wkładek Gwintowanych M3 / M4 (Brass Inserts 100 szt.)",
      category: "Akcesoria DFM",
      price: 49.00,
      badge: "Bestseller",
      desc: "Wytrzymałe wkładki mosiężne do zgrzewania w druku 3D.",
      icon: "🔩",
    },
    {
      id: 2,
      name: "Filament PLA Drukstacja Precision 1.75mm (1kg - Jet Black)",
      category: "Filamenty",
      price: 79.00,
      badge: "High Flow",
      desc: "Zoptymalizowany filament pod szybki druk o wysokiej precyzji.",
      icon: "🧵",
    },
    {
      id: 3,
      name: "Klej adhezyjny Magigoo 3D (Original 50ml)",
      category: "Chemia warsztatowa",
      price: 65.00,
      badge: "Pro",
      desc: "Profesjonalny podkład zapobiegający odklejaniu wydruków.",
      icon: "🧪",
    },
    {
      id: 4,
      name: "Precyzyjny nożyk deburring tool do obróbki krawędzi",
      category: "Narzędzia",
      price: 35.00,
      badge: "Niezbędnik",
      desc: "Ostrze obrotowe do szybkiego usuwania gratu z tworzywa.",
      icon: "🔪",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] font-sans">
      <Head>
        <title>Sklep & Akcesoria Drukarskie — Drukstacja</title>
      </Head>

      <Navbar
        activePage="sklep"
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* HERO BANNER */}
        <div className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 md:p-12 overflow-hidden shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EF4444]/20 border border-[#EF4444]/40 text-[#EF4444] text-xs font-bold">
              <span>🛒</span>
              <span>Sklep Przemysłowy Drukstacja</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
              Gotowe komponenty, narzędzia & materiały
            </h1>
            <p className="text-sm md:text-base text-slate-300">
              Wszystko, czego potrzebujesz do profesjonalnego post-processingu, montażu mechanicznego oraz prototypowania FDM/SLA.
            </p>
          </div>
          <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* PRODUKTY */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Polecane artykuły warsztatowe</h2>
              <p className="text-xs text-slate-500">Dostawa w 24h z magazynu Drukstacja</p>
            </div>
            <Link
              href="/"
              className="text-xs font-bold text-[#EF4444] hover:text-red-700 transition"
            >
              Potrzebujesz wydruku na wymiar? Wycena 3D →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {SAMPLE_PRODUCTS.map((prod) => (
              <div
                key={prod.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="w-full h-36 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-4xl mb-4 group-hover:scale-105 transition-transform">
                    {prod.icon}
                  </div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      {prod.category}
                    </span>
                    <span className="text-[10px] font-bold bg-red-50 text-[#EF4444] px-2 py-0.5 rounded-full border border-red-100">
                      {prod.badge}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1">
                    {prod.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {prod.desc}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-base font-black text-slate-900">
                      {prod.price.toFixed(2)}
                    </span>
                    <span className="text-xs font-bold text-slate-400 ml-1">PLN</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      alert(`Produkt "${prod.name}" wkrótce dostępny w zamówieniach online!`);
                    }}
                    className="px-3 py-1.5 rounded-full bg-slate-900 hover:bg-[#EF4444] text-white text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    Dodaj +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} items={cartItems} onRefresh={() => user && fetchCart(user.id)} />
    </div>
  );
}
